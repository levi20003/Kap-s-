package hu.fogasnaplo.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * The Google Drive backup: the log and every photo, video and thumbnail, each file once, full size, in a "Kapás mentés"
 * folder of the user's own Drive. Scope drive.file: the app sees only the files it created there, nothing else.
 *
 * Safety rules, so a backup never destroys a backup:
 *  - an empty log never overwrites the log on Drive, and never trashes anything there (a new phone restores first);
 *  - a newer log written by another phone is not overwritten: the page offers to merge it first;
 *  - files gone from the log are moved to Drive's trash (30 days to undo), not deleted;
 *  - videos wait for Wi-Fi unless the user allows mobile data.
 * Everything here runs on a background thread; results go to the page through Host.js.
 */
final class DriveSync {
    static final String SCOPE = "https://www.googleapis.com/auth/drive.file";
    private static final String API = "https://www.googleapis.com/drive/v3/";
    private static final String UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
    private static final String FOLDER = "Kapás mentés", LOG = "fogasnaplo.json", THUMB = "thumb-";

    interface Host {
        Context ctx();
        void js(String fn, JSONObject arg);
        /** A fresh access token (silently, no screen); null when the user must sign in again. */
        String token(boolean refresh) throws Exception;
        /** The mirrored log (files/naplo.json), or "". */
        String log();
    }

    static class NeedsLogin extends Exception {}

    private final Host host;
    private String token;

    DriveSync(Host host) { this.host = host; }

    private SharedPreferences prefs() { return host.ctx().getSharedPreferences("fogasnaplo", Context.MODE_PRIVATE); }
    private File dir(String d) { File f = new File(host.ctx().getFilesDir(), d); f.mkdirs(); return f; }

    /* ---------- HTTP with the bearer token (one silent refresh on 401) ---------- */
    private HttpURLConnection open(String method, String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) java.net.URI.create(url).toURL().openConnection();
        try {
            c.setRequestMethod(method); // Android's HttpURLConnection takes PATCH
        } catch (java.net.ProtocolException e) {
            c.setRequestMethod("POST"); // elsewhere: Google APIs honour the override header
            c.setRequestProperty("X-HTTP-Method-Override", method);
        }
        c.setRequestProperty("Authorization", "Bearer " + token);
        c.setConnectTimeout(15000);
        c.setReadTimeout(60000);
        return c;
    }

    private static String body(HttpURLConnection c) throws Exception {
        int code = c.getResponseCode();
        InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
        if (in == null) return "";
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        try (InputStream i = in) { byte[] b = new byte[16384]; int n; while ((n = i.read(b)) > 0) bo.write(b, 0, n); }
        return new String(bo.toByteArray(), StandardCharsets.UTF_8);
    }

    /** JSON call; retries once with a new token after a 401. */
    private JSONObject call(String method, String url, JSONObject json) throws Exception {
        for (int attempt = 0; ; attempt++) {
            HttpURLConnection c = open(method, url);
            if (json != null) {
                byte[] b = json.toString().getBytes(StandardCharsets.UTF_8);
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                c.setFixedLengthStreamingMode(b.length);
                try (OutputStream o = c.getOutputStream()) { o.write(b); }
            }
            int code = c.getResponseCode();
            String s = body(c);
            if (code == 401 && attempt == 0) { refresh(); continue; }
            if (code >= 400) throw new Exception("Drive " + code + ": " + s);
            return s.isEmpty() ? new JSONObject() : new JSONObject(s);
        }
    }

    private void refresh() throws Exception {
        token = host.token(true);
        if (token == null) throw new NeedsLogin();
    }

    private static String q(String s) throws Exception { return URLEncoder.encode(s, "UTF-8"); }

    /* ---------- the folder and what is in it ---------- */
    private String folder(boolean create) throws Exception {
        String id = prefs().getString("driveFolder", null);
        if (id != null) {
            try {
                JSONObject f = call("GET", API + "files/" + id + "?fields=id,trashed", null);
                if (!f.optBoolean("trashed")) return id;
            } catch (Exception ignored) {}
        }
        JSONArray found = call("GET", API + "files?spaces=drive&fields=files(id)&q=" +
                q("name='" + FOLDER + "' and mimeType='application/vnd.google-apps.folder' and trashed=false"), null).optJSONArray("files");
        if (found != null && found.length() > 0) id = found.getJSONObject(0).getString("id");
        else if (!create) return null;
        else id = call("POST", API + "files?fields=id", new JSONObject().put("name", FOLDER)
                .put("mimeType", "application/vnd.google-apps.folder")).getString("id");
        prefs().edit().putString("driveFolder", id).apply();
        return id;
    }

    /** name -> {id, size, appProperties} of the folder's files */
    private Map<String, JSONObject> list(String folder) throws Exception {
        Map<String, JSONObject> m = new HashMap<>();
        String page = null;
        do {
            JSONObject r = call("GET", API + "files?spaces=drive&pageSize=1000&fields=nextPageToken,files(id,name,size,appProperties)&q=" +
                    q("'" + folder + "' in parents and trashed=false") + (page != null ? "&pageToken=" + q(page) : ""), null);
            JSONArray fs = r.optJSONArray("files");
            if (fs != null) for (int i = 0; i < fs.length(); i++) { JSONObject f = fs.getJSONObject(i); m.put(f.getString("name"), f); }
            page = r.optString("nextPageToken", null);
        } while (page != null && !page.isEmpty());
        return m;
    }

    /** Resumable upload (works for 200 MB videos): a new file, or new content for fileId. */
    private void upload(String folder, String fileId, String name, String mime, InputStream data, long len, JSONObject props) throws Exception {
        for (int attempt = 0; ; attempt++) {
            JSONObject meta = new JSONObject();
            if (fileId == null) meta.put("name", name).put("parents", new JSONArray().put(folder));
            if (props != null) meta.put("appProperties", props);
            HttpURLConnection c = open(fileId == null ? "POST" : "PATCH", UPLOAD + (fileId == null ? "" : "/" + fileId) + "?uploadType=resumable");
            byte[] mb = meta.toString().getBytes(StandardCharsets.UTF_8);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            c.setRequestProperty("X-Upload-Content-Type", mime);
            c.setRequestProperty("X-Upload-Content-Length", String.valueOf(len));
            c.setFixedLengthStreamingMode(mb.length);
            try (OutputStream o = c.getOutputStream()) { o.write(mb); }
            int code = c.getResponseCode();
            if (code == 401 && attempt == 0) { body(c); refresh(); continue; }
            if (code >= 400) throw new Exception("Drive " + code + ": " + body(c));
            String loc = c.getHeaderField("Location");
            body(c);
            if (loc == null) throw new Exception("no upload url");
            HttpURLConnection u = (HttpURLConnection) java.net.URI.create(loc).toURL().openConnection();
            u.setRequestMethod("PUT");
            u.setDoOutput(true);
            u.setConnectTimeout(15000);
            u.setReadTimeout(120000);
            u.setRequestProperty("Content-Type", mime);
            u.setFixedLengthStreamingMode(len);
            try (OutputStream o = u.getOutputStream(); InputStream in = data) {
                byte[] b = new byte[65536]; int n; while ((n = in.read(b)) > 0) o.write(b, 0, n);
            }
            int uc = u.getResponseCode();
            String ub = body(u);
            if (uc >= 400) throw new Exception("Drive upload " + uc + ": " + ub);
            return;
        }
    }

    private void download(String id, File to) throws Exception {
        for (int attempt = 0; ; attempt++) {
            HttpURLConnection c = open("GET", API + "files/" + id + "?alt=media");
            int code = c.getResponseCode();
            if (code == 401 && attempt == 0) { body(c); refresh(); continue; }
            if (code >= 400) throw new Exception("Drive " + code + ": " + body(c));
            File tmp = new File(to.getPath() + ".tmp");
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(tmp)) {
                byte[] b = new byte[65536]; int n; while ((n = in.read(b)) > 0) out.write(b, 0, n);
            }
            if (!tmp.renameTo(to)) { tmp.delete(); throw new Exception("rename"); }
            return;
        }
    }

    /* ---------- the files the log points at ---------- */
    /** Drive name -> local file, for every photo, video and thumbnail in the log (catches and lures). */
    private Map<String, File> filesOf(JSONObject log) {
        Map<String, File> m = new LinkedHashMap<>();
        File photos = dir("photos"), thumbs = dir("thumbs");
        JSONArray cs = log.optJSONArray("catches");
        if (cs != null) for (int i = 0; i < cs.length(); i++) {
            JSONObject c = cs.optJSONObject(i);
            if (c == null) continue;
            JSONArray media = c.optJSONArray("media");
            if (media != null) for (int k = 0; k < media.length(); k++) addMedia(m, media.optJSONObject(k), photos, thumbs);
            addMedia(m, c.optJSONObject("photo"), photos, thumbs);
        }
        JSONArray lures = log.optJSONArray("lures");
        if (lures != null) for (int i = 0; i < lures.length(); i++) {
            JSONObject l = lures.optJSONObject(i);
            if (l != null) addMedia(m, l.optJSONObject("photo"), photos, thumbs);
        }
        return m;
    }

    private static void addMedia(Map<String, File> m, JSONObject x, File photos, File thumbs) {
        if (x == null) return;
        for (String key : new String[]{"src", "thumb"}) {
            String u = x.optString(key, "");
            if (!u.startsWith("file:")) continue;
            String name = Uri.parse(u).getLastPathSegment();
            if (name == null || !name.matches("[A-Za-z0-9-]+\\.(jpg|mp4)")) continue;
            boolean thumb = u.contains("/thumbs/");
            m.put(thumb ? THUMB + name : name, new File(thumb ? thumbs : photos, name));
        }
    }

    private boolean metered() {
        try {
            ConnectivityManager cm = (ConnectivityManager) host.ctx().getSystemService(Context.CONNECTIVITY_SERVICE);
            return cm != null && cm.isActiveNetworkMetered();
        } catch (Exception e) { return true; }
    }

    /** This phone, for telling its log from another phone's on Drive. Kept in no_backup/, so a restored phone gets its own. */
    private String deviceId() {
        File f = new File(host.ctx().getNoBackupFilesDir(), "device-id");
        try {
            if (f.exists()) {
                try (InputStream in = new FileInputStream(f)) { byte[] b = new byte[64]; int n = in.read(b); if (n > 0) return new String(b, 0, n, StandardCharsets.UTF_8).trim(); }
            }
            String id = UUID.randomUUID().toString();
            try (OutputStream o = new FileOutputStream(f)) { o.write(id.getBytes(StandardCharsets.UTF_8)); }
            return id;
        } catch (Exception e) { return "unknown"; }
    }

    private void state(String s, JSONObject extra) {
        try {
            JSONObject o = extra != null ? extra : new JSONObject();
            o.put("state", s);
            host.js("__fnDrive", o);
        } catch (Exception ignored) {}
    }

    /** Who is signed in: Drive's about.user (works with drive.file). */
    JSONObject about() throws Exception {
        token = host.token(false);
        if (token == null) throw new NeedsLogin();
        JSONObject u = call("GET", API + "about?fields=user(emailAddress,displayName)", null).optJSONObject("user");
        return u != null ? u : new JSONObject();
    }

    /** Uploads what is missing. videosOnMobile: send videos over mobile data too. */
    void sync(boolean videosOnMobile) throws Exception {
        token = host.token(false);
        if (token == null) throw new NeedsLogin();
        String raw = host.log();
        if (raw.isEmpty()) { state("synced", new JSONObject().put("up", 0).put("total", 0)); return; }
        JSONObject log = new JSONObject(raw);
        int catches = log.optJSONArray("catches") != null ? log.getJSONArray("catches").length() : 0;
        long rev = log.optLong("rev", 0);
        String folder = folder(true);
        Map<String, JSONObject> remote = list(folder);
        JSONObject rlog = remote.get(LOG);
        JSONObject rp = rlog != null ? rlog.optJSONObject("appProperties") : null;
        int rCatches = rp != null ? rp.optInt("catches", 0) : 0;
        long rRev = rp != null ? rp.optLong("rev", 0) : 0;
        String rDev = rp != null ? rp.optString("device", "") : "";
        // never let an empty or older log replace what is on Drive: the page offers the restore / merge instead
        if (rlog != null && catches == 0 && rCatches > 0) { state("remote", new JSONObject().put("catches", rCatches)); return; }
        if (rlog != null && !rDev.equals(deviceId()) && rRev > rev && !rDev.isEmpty()) {
            state("remote", new JSONObject().put("catches", rCatches).put("newer", true)); return;
        }
        Map<String, File> want = filesOf(log);
        boolean metered = metered();
        int total = want.size(), done = 0, waiting = 0, uploaded = 0;
        for (Map.Entry<String, File> e : want.entrySet()) {
            File f = e.getValue();
            JSONObject r = remote.get(e.getKey());
            if (!f.exists() || (r != null && r.optLong("size", -1) == f.length())) { done++; continue; }
            boolean video = f.getName().endsWith(".mp4");
            if (video && metered && !videosOnMobile) { waiting++; continue; }
            state("syncing", new JSONObject().put("done", done).put("total", total));
            upload(folder, r != null ? r.getString("id") : null, e.getKey(), video ? "video/mp4" : "image/jpeg",
                    new FileInputStream(f), f.length(), null);
            done++;
            uploaded++;
        }
        byte[] lb = raw.getBytes(StandardCharsets.UTF_8);
        JSONObject props = new JSONObject().put("catches", String.valueOf(catches)).put("rev", String.valueOf(rev)).put("device", deviceId());
        upload(folder, rlog != null ? rlog.getString("id") : null, LOG, "application/json", new java.io.ByteArrayInputStream(lb), lb.length, props);
        // files no longer in the log go to Drive's trash (not deleted), but only from a log that has catches
        int trashed = 0;
        if (catches > 0) for (Map.Entry<String, JSONObject> e : remote.entrySet()) {
            String n = e.getKey();
            if (n.equals(LOG) || want.containsKey(n) || !n.matches("(thumb-)?[A-Za-z0-9-]+\\.(jpg|mp4)")) continue;
            try { call("PATCH", API + "files/" + e.getValue().getString("id"), new JSONObject().put("trashed", true)); trashed++; } catch (Exception ignored) {}
        }
        prefs().edit().putLong("driveSynced", System.currentTimeMillis()).apply();
        state("synced", new JSONObject().put("up", done).put("total", total).put("uploaded", uploaded).put("waiting", waiting)
                .put("trashed", trashed).put("ts", System.currentTimeMillis()));
    }

    /** Downloads the log and every file it points at that this phone lacks, then hands the log to the page's merge (__fnZipIn). */
    void restore() throws Exception {
        token = host.token(false);
        if (token == null) throw new NeedsLogin();
        String folder = folder(false);
        Map<String, JSONObject> remote = folder != null ? list(folder) : new HashMap<>();
        JSONObject rlog = remote.get(LOG);
        if (rlog == null) { state("empty", null); return; }
        File tmp = new File(host.ctx().getCacheDir(), "drive-log.json");
        download(rlog.getString("id"), tmp);
        String json;
        try (InputStream in = new FileInputStream(tmp)) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] b = new byte[65536]; int n; while ((n = in.read(b)) > 0) bo.write(b, 0, n);
            json = new String(bo.toByteArray(), StandardCharsets.UTF_8);
        }
        tmp.delete();
        Map<String, File> want = filesOf(new JSONObject(json));
        int total = want.size(), done = 0, missing = 0;
        for (Map.Entry<String, File> e : want.entrySet()) {
            File f = e.getValue();
            JSONObject r = remote.get(e.getKey());
            if (f.exists()) { done++; continue; }
            if (r == null) { missing++; continue; }
            state("restoring", new JSONObject().put("done", done).put("total", total));
            download(r.getString("id"), f);
            done++;
        }
        JSONObject o = new JSONObject();
        o.put("json", json);
        o.put("photos", Uri.fromFile(dir("photos")) + "/");
        o.put("thumbs", Uri.fromFile(dir("thumbs")) + "/");
        o.put("drive", true);
        o.put("missing", missing);
        host.js("__fnZipIn", o);
        state("restored", new JSONObject().put("files", done).put("missing", missing));
    }

    /** Signs out: the grant is revoked at Google, the local state is forgotten. The files on Drive stay. */
    void signOut(String tok) {
        if (tok != null) try {
            HttpURLConnection c = (HttpURLConnection) java.net.URI.create("https://oauth2.googleapis.com/revoke?token=" + q(tok)).toURL().openConnection();
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setFixedLengthStreamingMode(0);
            c.getOutputStream().close();
            c.getResponseCode();
        } catch (Exception ignored) {}
        prefs().edit().remove("driveFolder").remove("gEmail").remove("gName").remove("driveSynced").apply();
    }
}

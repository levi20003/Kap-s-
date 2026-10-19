package hu.fogasnaplo.app;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashSet;
import java.util.Set;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

public class MainActivity extends Activity {
    private static final int REQ_SAVE = 1;
    private static final int REQ_OPEN = 2;
    private static final int REQ_CAM = 3;
    private static final int REQ_GAL = 4;
    private static final int PERM_LOC = 10;
    private static final String UA = "Fogasnaplo/1.5 (hu.fogasnaplo.app; Android personal fishing log)";

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingBackup;
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setTextZoom(100);

        web.addJavascriptInterface(new Bridge(), "FogasnaploAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if ("file".equals(u.getScheme())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if ("tile.openstreetmap.org".equals(u.getHost())) return tile(u);
                return null;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try {
                    startActivityForResult(i, REQ_OPEN);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl("file:///android_asset/index.html");
    }

    /* ---------- map tiles with a local cache (works offline for areas seen before) ---------- */
    private WebResourceResponse tile(Uri u) {
        File dir = new File(getCacheDir(), "tiles");
        dir.mkdirs();
        File f = new File(dir, u.getPath().replaceAll("[^0-9]+", "_") + ".png");
        long maxAge = 30L * 24 * 3600 * 1000;
        try {
            if (f.exists() && System.currentTimeMillis() - f.lastModified() < maxAge) {
                return new WebResourceResponse("image/png", null, new FileInputStream(f));
            }
            HttpURLConnection c = (HttpURLConnection) new URL(u.toString()).openConnection();
            c.setRequestProperty("User-Agent", UA);
            c.setConnectTimeout(8000);
            c.setReadTimeout(10000);
            if (c.getResponseCode() == 200) {
                File tmp = new File(dir, f.getName() + ".tmp");
                try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(tmp)) {
                    byte[] buf = new byte[16384];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                }
                tmp.renameTo(f);
                return new WebResourceResponse("image/png", null, new FileInputStream(f));
            }
        } catch (Exception ignored) {
        }
        try {
            if (f.exists()) return new WebResourceResponse("image/png", null, new FileInputStream(f));
        } catch (Exception ignored) {
        }
        return new WebResourceResponse("image/png", null, 404, "Not found", null, new java.io.ByteArrayInputStream(new byte[0]));
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.__fnBack&&window.__fnBack())===true", v -> {
            if (!"true".equals(v)) finish();
        });
    }

    private void js(String fn, JSONObject arg) {
        String code = "window." + fn + "&&window." + fn + "(" + arg.toString() + ")";
        main.post(() -> web.evaluateJavascript(code, null));
    }

    private static JSONObject err(String msg) {
        JSONObject o = new JSONObject();
        try { o.put("error", msg); } catch (Exception ignored) {}
        return o;
    }

    /* ---------- location ---------- */
    private boolean locBusy = false;

    private void startLocation() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
                && checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, PERM_LOC);
            return;
        }
        if (locBusy) return;
        final LocationManager lm = (LocationManager) getSystemService(LOCATION_SERVICE);
        Location best = null;
        try {
            for (String p : lm.getProviders(true)) {
                Location l = lm.getLastKnownLocation(p);
                if (l != null && (best == null || l.getTime() > best.getTime())) best = l;
            }
        } catch (SecurityException ignored) {
        }
        if (best != null && System.currentTimeMillis() - best.getTime() < 120000) {
            sendLocation(best);
            return;
        }
        final Location fallback = best;
        final boolean[] done = {false};
        final LocationListener[] holder = new LocationListener[1];
        holder[0] = new LocationListener() {
            @Override public void onLocationChanged(Location l) {
                if (done[0]) return;
                done[0] = true;
                locBusy = false;
                try { lm.removeUpdates(holder[0]); } catch (Exception ignored) {}
                sendLocation(l);
            }
            @Override public void onStatusChanged(String p, int s, Bundle b) {}
            @Override public void onProviderEnabled(String p) {}
            @Override public void onProviderDisabled(String p) {}
        };
        boolean any = false;
        try {
            for (String p : new String[]{LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER}) {
                if (lm.isProviderEnabled(p)) {
                    lm.requestLocationUpdates(p, 0, 0, holder[0], Looper.getMainLooper());
                    any = true;
                }
            }
        } catch (SecurityException ignored) {
        }
        if (!any) {
            if (fallback != null) sendLocation(fallback);
            else js("__fnLocation", err("Kapcsold be a helymeghatározást a telefonon, aztán próbáld újra."));
            return;
        }
        locBusy = true;
        main.postDelayed(() -> {
            if (done[0]) return;
            done[0] = true;
            locBusy = false;
            try { lm.removeUpdates(holder[0]); } catch (Exception ignored) {}
            if (fallback != null) sendLocation(fallback);
            else js("__fnLocation", err("Nem sikerült meghatározni a helyed. Szabad ég alatt jobban megy, vagy jelöld be kézzel."));
        }, 20000);
    }

    private void sendLocation(Location l) {
        JSONObject o = new JSONObject();
        try {
            o.put("lat", l.getLatitude());
            o.put("lng", l.getLongitude());
            o.put("acc", l.getAccuracy());
        } catch (Exception ignored) {}
        js("__fnLocation", o);
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        super.onRequestPermissionsResult(req, perms, res);
        if (req == PERM_LOC) {
            boolean ok = false;
            for (int r : res) if (r == PackageManager.PERMISSION_GRANTED) ok = true;
            if (ok) startLocation();
            else js("__fnLocation", err("Helyhozzáférés nélkül a térképen kézzel jelölheted be a helyet."));
        }
    }

    /* ---------- photos ---------- */
    private void startCamera() {
        File f = ShotProvider.shotFile(this);
        if (f.exists()) f.delete();
        Uri out = Uri.parse("content://" + ShotProvider.AUTHORITY + "/shot.jpg");
        Intent i = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        i.putExtra(MediaStore.EXTRA_OUTPUT, out);
        i.setClipData(ClipData.newRawUri("", out));
        i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivityForResult(i, REQ_CAM);
        } catch (Exception e) {
            js("__fnPhoto", err("Nem találtam kamera alkalmazást. Válaszd a Galériából gombot."));
        }
    }

    private void startGallery() {
        Intent i = new Intent(Intent.ACTION_GET_CONTENT);
        i.setType("image/*");
        i.addCategory(Intent.CATEGORY_OPENABLE);
        try {
            startActivityForResult(Intent.createChooser(i, "Fotó kiválasztása"), REQ_GAL);
        } catch (Exception e) {
            js("__fnPhoto", err("Nem sikerült megnyitni a galériát."));
        }
    }

    private interface StreamSource { InputStream open() throws Exception; }

    private void processPhoto(StreamSource src) {
        new Thread(() -> {
            try {
                BitmapFactory.Options b = new BitmapFactory.Options();
                b.inJustDecodeBounds = true;
                try (InputStream in = src.open()) { BitmapFactory.decodeStream(in, null, b); }
                if (b.outWidth <= 0) throw new Exception("decode");
                int sample = 1;
                while (Math.max(b.outWidth, b.outHeight) / (sample * 2) >= 1600) sample *= 2;
                BitmapFactory.Options o = new BitmapFactory.Options();
                o.inSampleSize = sample;
                Bitmap bmp;
                try (InputStream in = src.open()) { bmp = BitmapFactory.decodeStream(in, null, o); }
                int rot = 0;
                try (InputStream in = src.open()) {
                    int ori = new ExifInterface(in).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
                    if (ori == ExifInterface.ORIENTATION_ROTATE_90) rot = 90;
                    else if (ori == ExifInterface.ORIENTATION_ROTATE_180) rot = 180;
                    else if (ori == ExifInterface.ORIENTATION_ROTATE_270) rot = 270;
                } catch (Exception ignored) {}
                Bitmap full = fit(bmp, 1600, rot);
                File dir = new File(getFilesDir(), "photos");
                dir.mkdirs();
                File outF = new File(dir, UUID.randomUUID().toString() + ".jpg");
                try (OutputStream os = new FileOutputStream(outF)) { full.compress(Bitmap.CompressFormat.JPEG, 85, os); }
                Bitmap th = fit(full, 240, 0);
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                th.compress(Bitmap.CompressFormat.JPEG, 70, bo);
                File thF = writeThumb(bo.toByteArray());
                JSONObject r = new JSONObject();
                r.put("src", Uri.fromFile(outF).toString());
                r.put("thumb", thF != null ? Uri.fromFile(thF).toString() : "data:image/jpeg;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP));
                js("__fnPhoto", r);
            } catch (Throwable t) {
                js("__fnPhoto", err("A fotót nem sikerült betölteni."));
            }
        }).start();
    }

    /* ---------- thumbnails as files (localStorage holds only ~5 MB) ---------- */
    private File thumbDir() {
        File dir = new File(getFilesDir(), "thumbs");
        dir.mkdirs();
        return dir;
    }

    private File writeThumb(byte[] jpeg) {
        File f = new File(thumbDir(), UUID.randomUUID().toString() + ".jpg");
        try (OutputStream os = new FileOutputStream(f)) {
            os.write(jpeg);
            return f;
        } catch (Exception e) {
            f.delete();
            return null;
        }
    }

    /** The file behind a file:// uri, only if it lives in one of our photo folders. */
    private File ownFile(String src) {
        try {
            File f = new File(Uri.parse(src).getPath()).getCanonicalFile();
            for (String d : new String[]{"photos", "thumbs"}) {
                if (f.getPath().startsWith(new File(getFilesDir(), d).getCanonicalPath() + File.separator)) return f;
            }
        } catch (Exception ignored) {}
        return null;
    }

    /** Deletes photos/thumbs nobody refers to any more, and map tiles not used for 60 days. */
    private void sweepFiles(Set<String> keep) {
        long now = System.currentTimeMillis();
        for (File dir : new File[]{new File(getFilesDir(), "photos"), new File(getFilesDir(), "thumbs")}) {
            File[] fs = dir.listFiles();
            if (fs == null) continue;
            for (File f : fs) {
                // an hour of grace: a photo just taken may not be saved to a catch yet
                if (!keep.contains(f.getName()) && now - f.lastModified() > 3600000L) f.delete();
            }
        }
        File[] tiles = new File(getCacheDir(), "tiles").listFiles();
        if (tiles != null) for (File f : tiles) if (now - f.lastModified() > 60L * 24 * 3600 * 1000) f.delete();
    }

    private static Bitmap fit(Bitmap src, int max, int rot) {
        float r = Math.min(1f, (float) max / Math.max(src.getWidth(), src.getHeight()));
        Matrix m = new Matrix();
        m.postScale(r, r);
        if (rot != 0) m.postRotate(rot);
        return Bitmap.createBitmap(src, 0, 0, src.getWidth(), src.getHeight(), m, true);
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_OPEN) {
            if (fileCallback != null) {
                Uri u = (res == RESULT_OK && data != null) ? data.getData() : null;
                fileCallback.onReceiveValue(u != null ? new Uri[]{u} : null);
                fileCallback = null;
            }
        } else if (req == REQ_SAVE) {
            if (res == RESULT_OK && data != null && data.getData() != null && pendingBackup != null) {
                try (OutputStream os = getContentResolver().openOutputStream(data.getData())) {
                    os.write(pendingBackup.getBytes(StandardCharsets.UTF_8));
                    Toast.makeText(this, "Mentés elkészült", Toast.LENGTH_SHORT).show();
                } catch (Exception e) {
                    Toast.makeText(this, "A mentés nem sikerült", Toast.LENGTH_LONG).show();
                }
            }
            pendingBackup = null;
        } else if (req == REQ_CAM) {
            final File f = ShotProvider.shotFile(this);
            if (res == RESULT_OK && f.exists() && f.length() > 0) processPhoto(() -> new FileInputStream(f));
        } else if (req == REQ_GAL) {
            if (res == RESULT_OK && data != null && data.getData() != null) {
                final Uri u = data.getData();
                processPhoto(() -> getContentResolver().openInputStream(u));
            }
        }
    }

    private class Bridge {
        @JavascriptInterface
        public void saveBackup(String json, String filename) {
            runOnUiThread(() -> {
                pendingBackup = json;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("application/json");
                i.putExtra(Intent.EXTRA_TITLE, filename);
                startActivityForResult(i, REQ_SAVE);
            });
        }

        @JavascriptInterface
        public void getLocation() {
            runOnUiThread(MainActivity.this::startLocation);
        }

        @JavascriptInterface
        public void pickPhoto(String source) {
            runOnUiThread(() -> {
                if ("camera".equals(source)) startCamera();
                else startGallery();
            });
        }

        @JavascriptInterface
        public void deletePhoto(String src) {
            File f = ownFile(src);
            if (f != null) f.delete();
        }

        /** data:image/jpeg;base64,... -> file:// uri of a saved thumbnail, or "" on failure. */
        @JavascriptInterface
        public String saveThumb(String dataUrl) {
            try {
                int comma = dataUrl.indexOf(',');
                if (!dataUrl.startsWith("data:image/") || comma < 0) return "";
                File f = writeThumb(Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT));
                return f != null ? Uri.fromFile(f).toString() : "";
            } catch (Exception e) {
                return "";
            }
        }

        /** file:// uri of a thumbnail -> data url, so a backup file carries the picture. "" if missing. */
        @JavascriptInterface
        public String readThumb(String src) {
            File f = ownFile(src);
            if (f == null || !f.isFile() || f.length() > 512 * 1024) return "";
            try (InputStream in = new FileInputStream(f)) {
                byte[] b = new byte[(int) f.length()];
                int off = 0, n;
                while (off < b.length && (n = in.read(b, off, b.length - off)) > 0) off += n;
                return "data:image/jpeg;base64," + Base64.encodeToString(b, 0, off, Base64.NO_WRAP);
            } catch (Exception e) {
                return "";
            }
        }

        /** keepJson: array of every photo/thumb uri still in the log. */
        @JavascriptInterface
        public void cleanup(String keepJson) {
            final Set<String> keep = new HashSet<>();
            try {
                JSONArray a = new JSONArray(keepJson);
                for (int i = 0; i < a.length(); i++) {
                    String p = Uri.parse(a.getString(i)).getLastPathSegment();
                    if (p != null) keep.add(p);
                }
            } catch (Exception e) {
                return;
            }
            new Thread(() -> sweepFiles(keep)).start();
        }
    }
}

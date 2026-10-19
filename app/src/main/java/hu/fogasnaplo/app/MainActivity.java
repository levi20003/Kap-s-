package hu.fogasnaplo.app;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.content.pm.PackageManager;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.content.res.Configuration;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Insets;
import android.graphics.Matrix;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

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
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.zip.Deflater;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

public class MainActivity extends Activity {
    private static final int REQ_SAVE = 1;
    private static final int REQ_OPEN = 2;
    private static final int REQ_CAM = 3;
    private static final int REQ_GAL = 4;
    private static final int REQ_TREE = 5;
    private static final int REQ_ZIP_OUT = 6;
    private static final int REQ_ZIP_IN = 7;
    private static final int KEEP_BACKUPS = 4;
    private static final int PERM_LOC = 10;
    private static final int PERM_NOTIF = 11;
    static final String ACTION_QUICK = "hu.fogasnaplo.app.QUICK";
    private static final String UA = "Fogasnaplo/1.6 (hu.fogasnaplo.app; Android personal fishing log)";

    private WebView web;
    private boolean webDead = false;
    private boolean pageReady = false;
    private FrameLayout root;
    private String pendingQuick; // species id from a home-screen shortcut, delivered once the page is loaded
    private ValueCallback<Uri[]> fileCallback;
    private String pendingBackup;
    private String pendingZipJson;
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        root = new FrameLayout(this);
        root.setBackgroundColor(0xFF151C17); // shows behind the status and navigation bars; the page sets it per theme
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 35) {
            // Android 15+ draws apps edge to edge: keep the page clear of the system bars and the keyboard
            root.setOnApplyWindowInsetsListener((v, in) -> {
                Insets bars = in.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                Insets ime = in.getInsets(WindowInsets.Type.ime());
                v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
                return WindowInsets.CONSUMED;
            });
        }
        if (Build.VERSION.SDK_INT >= 33) {
            // Android 13+ (and always from Android 16): back arrives here instead of onBackPressed
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setTextZoom(100);

        web.addJavascriptInterface(new Bridge(), "FogasnaploAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                deliverQuick();
            }

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

            // the page renderer can be killed for memory (big photos, long map use): start over instead of crashing
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if (view == web) {
                    webDead = true;
                    ((android.view.ViewGroup) view.getParent()).removeView(view);
                    view.destroy();
                    recreate();
                }
                return true;
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
        // a recreated activity still carries the old intent: only a fresh start may add a catch
        if (savedInstanceState == null) handleIntent(getIntent());
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
            HttpURLConnection c = (HttpURLConnection) java.net.URI.create(u.toString()).toURL().openConnection();
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

    /* ---------- theme: the page picks light/dark sage, the window follows ---------- */
    private boolean isNight() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    @Override
    public void onConfigurationChanged(Configuration c) {
        super.onConfigurationChanged(c); // uiMode is in configChanges: no restart when the phone switches dark mode
        JSONObject o = new JSONObject();
        try { o.put("night", isNight()); } catch (Exception ignored) {}
        js("__fnSysTheme", o);
    }

    @SuppressWarnings("deprecation")
    private void applyWindowTheme(boolean light) {
        root.setBackgroundColor(light ? 0xFFEEF2EC : 0xFF151C17);
        if (Build.VERSION.SDK_INT >= 30) {
            int bars = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) c.setSystemBarsAppearance(light ? bars : 0, bars);
        } else if (Build.VERSION.SDK_INT >= 26) {
            View d = getWindow().getDecorView();
            int f = d.getSystemUiVisibility(), m = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            d.setSystemUiVisibility(light ? f | m : f & ~m);
        }
        if (Build.VERSION.SDK_INT < 35) { // before edge to edge the bars have their own colour
            getWindow().setStatusBarColor(light ? 0xFFE4EBE1 : 0xFF1C2A21);
            getWindow().setNavigationBarColor(light ? 0xFFFFFFFF : 0xFF1A231D);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    /* ---------- home-screen shortcuts: "+ Csuka" opens straight into a new catch ---------- */
    private void handleIntent(Intent i) {
        if (i == null || !ACTION_QUICK.equals(i.getAction())) return;
        pendingQuick = i.getStringExtra("sp");
        setIntent(new Intent(this, MainActivity.class));
        deliverQuick();
    }

    private void deliverQuick() {
        if (!pageReady || pendingQuick == null) return;
        JSONObject o = new JSONObject();
        try { o.put("sp", pendingQuick); } catch (Exception ignored) {}
        pendingQuick = null;
        js("__fnQuick", o);
    }

    private void setShortcuts(String json) {
        if (Build.VERSION.SDK_INT < 25) return;
        try {
            ShortcutManager sm = getSystemService(ShortcutManager.class);
            JSONArray a = new JSONArray(json);
            List<ShortcutInfo> list = new ArrayList<>();
            for (int i = 0; i < a.length() && i < Math.min(4, sm.getMaxShortcutCountPerActivity()); i++) {
                JSONObject sp = a.getJSONObject(i);
                String id = sp.getString("id"), name = sp.getString("name");
                Intent in = new Intent(this, MainActivity.class).setAction(ACTION_QUICK).putExtra("sp", id);
                list.add(new ShortcutInfo.Builder(this, "sp-" + id).setShortLabel("+ " + name).setLongLabel("Új fogás: " + name)
                        .setIcon(Icon.createWithResource(this, R.drawable.ic_shortcut_add)).setIntent(in).build());
            }
            sm.setDynamicShortcuts(list);
        } catch (Exception ignored) {}
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (!webDead) web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        handleBack();
    }

    /** The page closes its own sheets and pickers first; the app closes only when it has nothing left. */
    private void handleBack() {
        if (webDead) { finish(); return; }
        web.evaluateJavascript("(window.__fnBack&&window.__fnBack())===true", v -> {
            if (!"true".equals(v)) finish();
        });
    }

    private void js(String fn, JSONObject arg) {
        String code = "window." + fn + "&&window." + fn + "(" + arg.toString() + ")";
        main.post(() -> { if (!webDead) web.evaluateJavascript(code, null); });
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
        if (req == PERM_NOTIF) {
            boolean ok = res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED;
            js("__fnNotify", ok ? new JSONObject() : err("Az értesítések tiltva vannak. A telefon Beállítások → Alkalmazások → Fogásnapló részében engedélyezheted."));
        }
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
        Uri out = Uri.parse("content://" + getPackageName() + ".shot/shot.jpg"); // authority follows the package (test build)
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
                if (full != bmp) bmp.recycle();
                File dir = new File(getFilesDir(), "photos");
                dir.mkdirs();
                File outF = new File(dir, UUID.randomUUID().toString() + ".jpg");
                try (OutputStream os = new FileOutputStream(outF)) { full.compress(Bitmap.CompressFormat.JPEG, 85, os); }
                Bitmap th = fit(full, 240, 0);
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                th.compress(Bitmap.CompressFormat.JPEG, 70, bo);
                if (th != full) th.recycle();
                full.recycle();
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
        } else if (req == REQ_TREE) {
            if (res == RESULT_OK && data != null && data.getData() != null) setBackupTree(data.getData());
            else js("__fnBackupFolder", err(""));
        } else if (req == REQ_ZIP_OUT) {
            final String json = pendingZipJson;
            pendingZipJson = null;
            if (res == RESULT_OK && data != null && data.getData() != null && json != null) {
                final Uri u = data.getData();
                new Thread(() -> {
                    try (OutputStream os = getContentResolver().openOutputStream(u, "w")) {
                        int n = writeZip(os, json);
                        js("__fnZipDone", done(null, n, false));
                    } catch (Exception e) {
                        js("__fnZipDone", err("A mentés nem sikerült."));
                    }
                }).start();
            }
        } else if (req == REQ_ZIP_IN) {
            if (res == RESULT_OK && data != null && data.getData() != null) {
                final Uri u = data.getData();
                new Thread(() -> readZip(u)).start();
            }
        }
    }

    /* ---------- backup with photos: zip of the log + photos/ + thumbs/ ---------- */
    private SharedPreferences prefs() { return getSharedPreferences("fogasnaplo", MODE_PRIVATE); }

    private void setBackupTree(Uri tree) {
        try {
            getContentResolver().takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            String old = prefs().getString("backupTree", null);
            if (old != null && !old.equals(tree.toString())) releaseTree(Uri.parse(old));
            String name = treeName(tree);
            prefs().edit().putString("backupTree", tree.toString()).putString("backupName", name).apply();
            JSONObject o = new JSONObject();
            o.put("name", name);
            js("__fnBackupFolder", o);
        } catch (Exception e) {
            js("__fnBackupFolder", err("Ezt a mappát nem lehet használni. Válassz másikat."));
        }
    }

    private void releaseTree(Uri tree) {
        try {
            getContentResolver().releasePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (Exception ignored) {}
    }

    private String treeName(Uri tree) {
        Uri doc = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        try (Cursor c = getContentResolver().query(doc, new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {}
        return "kiválasztott mappa";
    }

    /** Writes the log and every photo/thumbnail file; returns the number of photos. */
    private int writeZip(OutputStream os, String json) throws Exception {
        int photos = 0;
        try (ZipOutputStream z = new ZipOutputStream(os)) {
            z.setLevel(Deflater.BEST_SPEED); // jpegs do not shrink anyway
            z.putNextEntry(new ZipEntry("fogasnaplo.json"));
            z.write(json.getBytes(StandardCharsets.UTF_8));
            z.closeEntry();
            byte[] buf = new byte[65536];
            for (String d : new String[]{"photos", "thumbs"}) {
                File[] fs = new File(getFilesDir(), d).listFiles();
                if (fs == null) continue;
                for (File f : fs) {
                    if (!f.isFile() || !f.getName().endsWith(".jpg")) continue;
                    z.putNextEntry(new ZipEntry(d + "/" + f.getName()));
                    try (InputStream in = new FileInputStream(f)) {
                        int n;
                        while ((n = in.read(buf)) > 0) z.write(buf, 0, n);
                    }
                    z.closeEntry();
                    if (d.equals("photos")) photos++;
                }
            }
        }
        return photos;
    }

    private static JSONObject done(String name, int photos, boolean auto) {
        JSONObject o = new JSONObject();
        try {
            o.put("ok", true);
            if (name != null) o.put("name", name);
            o.put("photos", photos);
            o.put("auto", auto);
        } catch (Exception ignored) {}
        return o;
    }

    /** Backup into the chosen folder, replacing a same-named file and keeping only the newest few. */
    private void zipToFolder(String json, String name, boolean auto) {
        String t = prefs().getString("backupTree", null);
        if (t == null) { js("__fnZipDone", err("Nincs kiválasztva mentési mappa.")); return; }
        Uri tree = Uri.parse(t);
        ContentResolver cr = getContentResolver();
        Uri dir = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        Uri out = null;
        try {
            List<String[]> old = backupsIn(tree);
            for (String[] b : old) if (b[1].equals(name)) DocumentsContract.deleteDocument(cr, DocumentsContract.buildDocumentUriUsingTree(tree, b[0]));
            out = DocumentsContract.createDocument(cr, dir, "application/zip", name);
            if (out == null) throw new Exception("create");
            int n;
            try (OutputStream os = cr.openOutputStream(out, "w")) { n = writeZip(os, json); }
            List<String[]> all = backupsIn(tree);
            for (int i = KEEP_BACKUPS; i < all.size(); i++) DocumentsContract.deleteDocument(cr, DocumentsContract.buildDocumentUriUsingTree(tree, all.get(i)[0]));
            js("__fnZipDone", done(name, n, auto));
        } catch (Exception e) {
            try { if (out != null) DocumentsContract.deleteDocument(cr, out); } catch (Exception ignored) {}
            JSONObject o = err("A mentési mappa nem érhető el. Válaszd ki újra a Mentés résznél.");
            try { o.put("auto", auto); } catch (Exception ignored) {}
            js("__fnZipDone", o);
        }
    }

    /** {documentId, name} of our backups in the folder, newest first (names carry the date). */
    private List<String[]> backupsIn(Uri tree) {
        List<String[]> out = new ArrayList<>();
        Uri kids = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        try (Cursor c = getContentResolver().query(kids, new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
            while (c != null && c.moveToNext()) {
                String n = c.getString(1);
                if (n != null && n.startsWith("fogasnaplo-") && n.endsWith(".zip")) out.add(new String[]{c.getString(0), n});
            }
        }
        Collections.sort(out, (a, b) -> b[1].compareTo(a[1]));
        return out;
    }

    /** Unpacks photos (keeping their names) and hands the log to the page, which asks before merging. */
    private void readZip(Uri u) {
        String json = null;
        File photos = new File(getFilesDir(), "photos"), thumbs = new File(getFilesDir(), "thumbs");
        photos.mkdirs();
        thumbs.mkdirs();
        try (ZipInputStream z = new ZipInputStream(getContentResolver().openInputStream(u))) {
            ZipEntry e;
            byte[] buf = new byte[65536];
            while ((e = z.getNextEntry()) != null) {
                String n = e.getName();
                if (n.equals("fogasnaplo.json")) {
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    int k;
                    while ((k = z.read(buf)) > 0) bo.write(buf, 0, k);
                    json = bo.toString("UTF-8");
                } else if (n.matches("(photos|thumbs)/[A-Za-z0-9-]+\\.jpg")) {
                    File f = new File(n.startsWith("photos/") ? photos : thumbs, n.substring(7));
                    if (f.exists()) continue;
                    File tmp = new File(f.getPath() + ".tmp");
                    try (OutputStream os = new FileOutputStream(tmp)) {
                        int k;
                        while ((k = z.read(buf)) > 0) os.write(buf, 0, k);
                    }
                    tmp.renameTo(f);
                }
            }
            if (json == null) throw new Exception("no log");
            JSONObject o = new JSONObject();
            o.put("json", json);
            o.put("photos", Uri.fromFile(photos) + "/");
            o.put("thumbs", Uri.fromFile(thumbs) + "/");
            js("__fnZipIn", o);
        } catch (Exception ex) {
            js("__fnZipIn", err("Ez a fájl nem Fogásnapló ZIP-mentés."));
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

        /** True when the phone is in dark mode (the page's "automatic" theme follows it). */
        @JavascriptInterface
        public boolean isNight() {
            return MainActivity.this.isNight();
        }

        @JavascriptInterface
        public void setTheme(boolean light) {
            runOnUiThread(() -> applyWindowTheme(light));
        }

        /** Asks for the notification permission where needed (Android 13+); answers through __fnNotify. */
        @JavascriptInterface
        public void enableNotifications() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, PERM_NOTIF);
                } else js("__fnNotify", new JSONObject());
            });
        }

        /** [{at, title, text}] — every upcoming reminder; "[]" turns them off. */
        @JavascriptInterface
        public void setReminders(String json) {
            ReminderReceiver.save(MainActivity.this, json);
        }

        /** [{id, name}] of the most used species, for the launcher's long-press menu. */
        @JavascriptInterface
        public void setShortcuts(String json) {
            MainActivity.this.setShortcuts(json);
        }

        /** Manual zip backup: the user picks where to save it. */
        @JavascriptInterface
        public void saveZip(String json, String filename) {
            runOnUiThread(() -> {
                pendingZipJson = json;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("application/zip");
                i.putExtra(Intent.EXTRA_TITLE, filename);
                startActivityForResult(i, REQ_ZIP_OUT);
            });
        }

        /** Automatic backup into the chosen folder (background thread). */
        @JavascriptInterface
        public void zipToFolder(String json, String filename, boolean auto) {
            new Thread(() -> MainActivity.this.zipToFolder(json, filename, auto)).start();
        }

        @JavascriptInterface
        public void pickBackupFolder() {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                        | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
                try {
                    startActivityForResult(i, REQ_TREE);
                } catch (Exception e) {
                    js("__fnBackupFolder", err("Ezen a telefonon nem lehet mappát választani."));
                }
            });
        }

        /** Display name of the backup folder, or "" when none is set. */
        @JavascriptInterface
        public String backupFolder() {
            return prefs().getString("backupTree", null) == null ? "" : prefs().getString("backupName", "mappa");
        }

        @JavascriptInterface
        public void clearBackupFolder() {
            String t = prefs().getString("backupTree", null);
            if (t != null) releaseTree(Uri.parse(t));
            prefs().edit().remove("backupTree").remove("backupName").apply();
        }

        @JavascriptInterface
        public void restoreZip() {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/zip", "application/x-zip-compressed", "application/octet-stream"});
                try {
                    startActivityForResult(i, REQ_ZIP_IN);
                } catch (Exception e) {
                    js("__fnZipIn", err("Nem sikerült megnyitni a fájlválasztót."));
                }
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

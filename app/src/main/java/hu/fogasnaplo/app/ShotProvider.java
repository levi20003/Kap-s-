package hu.fogasnaplo.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/** Hands the camera app a writable file for the photo (shot.jpg) or video (clip.mp4), and share targets the catch card (share.jpg). */
public class ShotProvider extends ContentProvider {
    static File shotFile(android.content.Context ctx) { return camFile(ctx, "shot.jpg"); }
    static File clipFile(android.content.Context ctx) { return camFile(ctx, "clip.mp4"); }
    static File shareFile(android.content.Context ctx) { return camFile(ctx, "share.jpg"); }

    private static File camFile(android.content.Context ctx, String name) {
        File dir = new File(ctx.getCacheDir(), "cam");
        dir.mkdirs();
        return new File(dir, name);
    }

    private File fileFor(Uri uri) {
        String n = uri.getLastPathSegment();
        if ("clip.mp4".equals(n)) return clipFile(getContext());
        if ("share.jpg".equals(n)) return shareFile(getContext());
        return shotFile(getContext());
    }

    @Override public boolean onCreate() { return true; }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File f = fileFor(uri);
        int m = ParcelFileDescriptor.parseMode(mode);
        if ((m & ParcelFileDescriptor.MODE_WRITE_ONLY) != 0 || (m & ParcelFileDescriptor.MODE_READ_WRITE) != 0) {
            m |= ParcelFileDescriptor.MODE_CREATE;
        }
        return ParcelFileDescriptor.open(f, m);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String sel, String[] args, String sort) {
        File f = fileFor(uri);
        MatrixCursor c = new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
        c.addRow(new Object[]{f.getName(), f.exists() ? f.length() : 0L});
        return c;
    }

    @Override public String getType(Uri uri) { return "clip.mp4".equals(uri.getLastPathSegment()) ? "video/mp4" : "image/jpeg"; }
    @Override public Uri insert(Uri uri, ContentValues values) { return null; }
    @Override public int delete(Uri uri, String sel, String[] args) { return 0; }
    @Override public int update(Uri uri, ContentValues values, String sel, String[] args) { return 0; }
}

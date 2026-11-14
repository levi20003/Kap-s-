package hu.fogasnaplo.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.SystemClock;
import android.graphics.Typeface;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.RelativeSizeSpan;
import android.text.style.StyleSpan;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Home-screen widget. The page hands over the next 7 days' ratings (setWidget), so the widget shows the right day for a
 * week even without opening the app. Buttons: "+ fish" (the shortcut path), "Horgászat" / "Befejezés" (trip), the body opens the app.
 * json: {place, days:[{d:"yyyy-MM-dd", lv:1-5, label, win:"Esti rablás 19:47", tx, tn, now?, sky, w, g, r, rp, sun:"16:09", wat}],
 *        sp:[{id,name}], trip:{start, n} | null, cfg:{rating, temp, wind, rain, sun, water, btns}}  (cfg: what the user chose to see)
 */
public class KapasWidget extends AppWidgetProvider {
    static final String ACTION_TRIP_START = "hu.fogasnaplo.app.TRIP_START";

    static void push(Context c, String json) {
        c.getSharedPreferences("fogasnaplo", Context.MODE_PRIVATE).edit().putString("widget", json).apply();
        updateAll(c);
        PinnedCard.refresh(c);
    }

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        if (m == null) return;
        int[] ids = m.getAppWidgetIds(new ComponentName(c, KapasWidget.class));
        if (ids == null || ids.length == 0) return;
        RemoteViews v = build(c);
        for (int id : ids) m.updateAppWidget(id, v);
    }

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        RemoteViews v = build(c);
        for (int id : ids) m.updateAppWidget(id, v);
    }

    private static PendingIntent open(Context c, int code, Intent i) {
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static RemoteViews build(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget);
        v.setOnClickPendingIntent(R.id.w_root, open(c, 60, new Intent(c, MainActivity.class)));
        JSONObject o;
        try { o = new JSONObject(c.getSharedPreferences("fogasnaplo", Context.MODE_PRIVATE).getString("widget", "{}")); }
        catch (Exception e) { o = new JSONObject(); }
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date());
        JSONObject day = null;
        JSONArray days = o.optJSONArray("days");
        for (int i = 0; days != null && i < days.length(); i++) {
            JSONObject d = days.optJSONObject(i);
            if (d != null && today.equals(d.optString("d"))) { day = d; break; }
        }
        String place = o.optString("place", "");
        JSONObject cfg = o.optJSONObject("cfg");
        if (cfg == null) cfg = new JSONObject();
        boolean rating = cfg.optBoolean("rating", true);
        v.setViewVisibility(R.id.w_level, rating ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.w_dots, rating ? View.VISIBLE : View.GONE);
        weather(v, day, cfg);
        if (day != null) {
            int lv = Math.max(0, Math.min(5, day.optInt("lv")));
            StringBuilder dots = new StringBuilder();
            for (int k = 1; k <= 5; k++) dots.append(k <= lv ? '●' : '○');
            v.setTextViewText(R.id.w_kick, "Horgászidő ma" + (place.isEmpty() ? "" : " · " + place));
            v.setTextViewText(R.id.w_level, day.optString("label"));
            v.setTextViewText(R.id.w_dots, dots.toString());
            v.setTextViewText(R.id.w_line, line(day, cfg));
        } else {
            v.setTextViewText(R.id.w_kick, "Horgászidő");
            v.setTextViewText(R.id.w_level, "Kapás");
            v.setTextViewText(R.id.w_dots, "");
            v.setTextViewText(R.id.w_line, "Nyisd meg az appot az előrejelzéshez");
        }
        JSONObject trip = o.optJSONObject("trip");
        JSONArray sp = o.optJSONArray("sp");
        v.setViewVisibility(R.id.w_btns, cfg.optBoolean("btns", true) ? View.VISIBLE : View.GONE);
        int[] btn = {R.id.w_b1, R.id.w_b2};
        for (int i = 0; i < 2; i++) {
            JSONObject s = sp != null ? sp.optJSONObject(i) : null;
            if (s == null) { v.setViewVisibility(btn[i], View.INVISIBLE); continue; }
            v.setViewVisibility(btn[i], View.VISIBLE);
            v.setTextViewText(btn[i], "+ " + s.optString("name"));
            Intent in = new Intent(c, MainActivity.class).setAction(MainActivity.ACTION_QUICK).putExtra("sp", s.optString("id"))
                    .setData(Uri.parse("kapas://widget/" + s.optString("id")));
            v.setOnClickPendingIntent(btn[i], open(c, 61 + i, in));
        }
        if (trip != null) {
            long start = trip.optLong("start");
            v.setViewVisibility(R.id.w_trip, View.VISIBLE);
            v.setViewVisibility(R.id.w_line, View.GONE);
            v.setChronometer(R.id.w_chrono, SystemClock.elapsedRealtime() - (System.currentTimeMillis() - start), null, true);
            int n = trip.optInt("n");
            v.setTextViewText(R.id.w_trip_txt, "horgászat · " + (n == 0 ? "még nincs fogás" : n + " fogás"));
            v.setTextViewText(R.id.w_b3, "Befejezés");
            v.setOnClickPendingIntent(R.id.w_b3, open(c, 65, new Intent(c, MainActivity.class).setAction(MainActivity.ACTION_TRIP_END)));
        } else {
            v.setViewVisibility(R.id.w_trip, View.GONE);
            v.setViewVisibility(R.id.w_line, View.VISIBLE);
            v.setChronometer(R.id.w_chrono, SystemClock.elapsedRealtime(), null, false);
            v.setTextViewText(R.id.w_b3, "Horgászat");
            v.setOnClickPendingIntent(R.id.w_b3, open(c, 66, new Intent(c, MainActivity.class).setAction(ACTION_TRIP_START)));
        }
        return v;
    }

    /** "15° / 6°" big, the sky small: one chip of the weather row */
    private static CharSequence chip(String big, String small) {
        SpannableString t = new SpannableString(small.isEmpty() ? big : big + "\n" + small);
        t.setSpan(new StyleSpan(Typeface.BOLD), 0, big.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        t.setSpan(new RelativeSizeSpan(1.25f), 0, big.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        if (!small.isEmpty()) t.setSpan(new RelativeSizeSpan(0.9f), big.length() + 1, t.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        return t;
    }

    private static String num(double d) { return String.valueOf(Math.round(d)); }

    /** The weather row: temperature, wind, rain for the day, each one only if the user wants it. */
    private static void weather(RemoteViews v, JSONObject day, JSONObject cfg) {
        boolean temp = cfg.optBoolean("temp", true) && day != null && day.has("tx");
        boolean wind = cfg.optBoolean("wind", true) && day != null && day.has("w");
        boolean rain = cfg.optBoolean("rain", true) && day != null && day.has("r");
        v.setViewVisibility(R.id.w_wx, temp || wind || rain ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.w_temp, temp ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.w_wind, wind ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.w_rain, rain ? View.VISIBLE : View.GONE);
        if (temp) {
            String big = day.has("now") ? num(day.optDouble("now")) + "°" : num(day.optDouble("tx")) + "° / " + num(day.optDouble("tn")) + "°";
            String small = day.has("now") ? num(day.optDouble("tx")) + "° / " + num(day.optDouble("tn")) + "° · " + day.optString("sky") : day.optString("sky");
            v.setTextViewText(R.id.w_temp, chip(big, small));
        }
        if (wind) v.setTextViewText(R.id.w_wind, chip(num(day.optDouble("w")) + " km/h", day.has("g") ? "lökés " + num(day.optDouble("g")) : "szél"));
        if (rain) {
            double mm = day.optDouble("r", 0);
            String big = mm < 0.1 ? "Száraz" : String.format(Locale.ROOT, mm < 10 ? "%.1f mm" : "%.0f mm", mm).replace('.', ',');
            v.setTextViewText(R.id.w_rain, chip(big, day.has("rp") ? day.optInt("rp") + "% eső esély" : "eső"));
        }
    }

    /** The bottom line: the evening feed, sunset, the river, as chosen. */
    private static String line(JSONObject day, JSONObject cfg) {
        StringBuilder b = new StringBuilder();
        String win = day.optString("win");
        if (cfg.optBoolean("sun", true)) {
            if (!win.isEmpty()) b.append(win);
            else if (day.has("sun")) b.append("Napnyugta ").append(day.optString("sun"));
        }
        if (cfg.optBoolean("water", true) && !day.optString("wat").isEmpty()) b.append(b.length() > 0 ? " · " : "").append("Víz: ").append(day.optString("wat"));
        return b.toString();
    }
}

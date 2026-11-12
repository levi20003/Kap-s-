package hu.fogasnaplo.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/**
 * The optional always-on card in the notification shade (Beállítások → Értesítések → "Állandó kártya").
 * It reads the same data the home-screen widget gets (KapasWidget.push: the next 7 days' ratings), so it shows the right
 * day without the app: an alarm rebuilds it every 3 hours and just after midnight, and boot / app update bring it back.
 * Silent (low importance, no sound or vibration). While a trip runs it steps aside for the trip notification.
 */
public class PinnedCard extends BroadcastReceiver {
    static final String ACTION = "hu.fogasnaplo.app.PINNED";
    private static final String CHANNEL = "allando";
    private static final int NOTIF = 7301;

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences("fogasnaplo", Context.MODE_PRIVATE); }

    static void set(Context c, boolean on) {
        prefs(c).edit().putBoolean("pinned", on).apply();
        refresh(c);
    }

    @Override
    public void onReceive(Context c, Intent intent) { refresh(c); }

    private static PendingIntent alarm(Context c) {
        return PendingIntent.getBroadcast(c, 70, new Intent(c, PinnedCard.class).setAction(ACTION),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void refresh(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (!prefs(c).getBoolean("pinned", false)) {
            if (nm != null) nm.cancel(NOTIF);
            if (am != null) am.cancel(alarm(c));
            return;
        }
        // next rebuild: in 3 hours, or one minute after midnight if that comes first (inexact: a few minutes late is fine)
        Calendar mid = Calendar.getInstance();
        mid.add(Calendar.DAY_OF_YEAR, 1);
        mid.set(Calendar.HOUR_OF_DAY, 0); mid.set(Calendar.MINUTE, 1); mid.set(Calendar.SECOND, 0); mid.set(Calendar.MILLISECOND, 0);
        long next = Math.min(System.currentTimeMillis() + 3 * 3600 * 1000L, mid.getTimeInMillis());
        if (am != null) am.set(AlarmManager.RTC, next, alarm(c));
        if (nm == null) return;
        JSONObject o;
        try { o = new JSONObject(prefs(c).getString("widget", "{}")); } catch (Exception e) { o = new JSONObject(); }
        if (o.optJSONObject("trip") != null) { nm.cancel(NOTIF); return; } // the trip notification shows instead
        try { nm.notify(NOTIF, build(c, nm, o)); } catch (SecurityException ignored) {} // notifications not allowed
    }

    private static JSONObject dayOf(JSONArray days, String ymd) {
        for (int i = 0; days != null && i < days.length(); i++) {
            JSONObject d = days.optJSONObject(i);
            if (d != null && ymd.equals(d.optString("d"))) return d;
        }
        return null;
    }

    private static String dots(int lv) {
        StringBuilder s = new StringBuilder();
        for (int k = 1; k <= 5; k++) s.append(k <= lv ? '●' : '○');
        return s.toString();
    }

    static Notification build(Context c, NotificationManager nm, JSONObject o) {
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Állandó kártya (horgászidő)", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            ch.setDescription("A mai horgászidő és gyors gombok az értesítési sávban. Csendes.");
            nm.createNotificationChannel(ch);
        }
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT);
        Calendar cal = Calendar.getInstance();
        JSONArray days = o.optJSONArray("days");
        JSONObject today = dayOf(days, f.format(cal.getTime()));
        cal.add(Calendar.DAY_OF_YEAR, 1);
        JSONObject tomorrow = dayOf(days, f.format(cal.getTime()));
        String place = o.optString("place", "");
        String title, text;
        if (today != null) {
            int lv = Math.max(0, Math.min(5, today.optInt("lv")));
            title = "Horgászidő ma: " + today.optString("label") + "  " + dots(lv);
            String win = today.optString("win");
            text = (win.isEmpty() ? "" : win) + (place.isEmpty() ? "" : (win.isEmpty() ? "" : " · ") + place);
        } else {
            title = "Kapás – horgászidő";
            text = "Nyisd meg az appot a friss előrejelzéshez" + (place.isEmpty() ? "" : " (" + place + ")");
        }
        String big = text;
        if (tomorrow != null) big += "\nHolnap: " + tomorrow.optString("label") + "  " + dots(Math.max(0, Math.min(5, tomorrow.optInt("lv"))));

        int flags = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat_fish).setColor(0xFF2F4A3A)
                .setContentTitle(title).setContentText(text).setStyle(new Notification.BigTextStyle().bigText(big))
                .setOngoing(true).setOnlyAlertOnce(true).setShowWhen(false)
                .setPriority(Notification.PRIORITY_LOW).setCategory(Notification.CATEGORY_STATUS)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setContentIntent(PendingIntent.getActivity(c, 71, new Intent(c, MainActivity.class), flags));
        JSONArray sp = o.optJSONArray("sp");
        for (int i = 0; sp != null && i < sp.length() && i < 2; i++) {
            JSONObject x = sp.optJSONObject(i);
            if (x == null) continue;
            Intent in = new Intent(c, MainActivity.class).setAction(MainActivity.ACTION_QUICK).putExtra("sp", x.optString("id"))
                    .setData(Uri.parse("kapas://pinned/" + x.optString("id"))); // distinct per fish, so the PendingIntents do not merge
            b.addAction(new Notification.Action.Builder(Icon.createWithResource(c, R.drawable.ic_shortcut_add),
                    "+ " + x.optString("name"), PendingIntent.getActivity(c, 72 + i, in, flags)).build());
        }
        b.addAction(new Notification.Action.Builder(Icon.createWithResource(c, R.drawable.ic_stat_fish), "Horgászat",
                PendingIntent.getActivity(c, 75, new Intent(c, MainActivity.class).setAction(KapasWidget.ACTION_TRIP_START), flags)).build());
        return b.build();
    }
}

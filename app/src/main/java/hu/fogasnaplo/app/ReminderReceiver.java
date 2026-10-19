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
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Closed-season reminders. The page works out the dates (it knows the rules) and hands over a list of
 * {at, title, text}; this posts each one when its time comes, one alarm at a time, and survives reboots.
 */
public class ReminderReceiver extends BroadcastReceiver {
    static final String ACTION = "hu.fogasnaplo.app.REMINDER";
    private static final String CHANNEL = "tilalom";
    private static final long STALE = 12 * 3600 * 1000L; // phone was off: skip reminders older than this

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences("fogasnaplo", Context.MODE_PRIVATE); }

    static void save(Context c, String json) {
        prefs(c).edit().putString("reminders", json).apply();
        scheduleNext(c);
    }

    private static JSONArray load(Context c) {
        try { return new JSONArray(prefs(c).getString("reminders", "[]")); } catch (Exception e) { return new JSONArray(); }
    }

    static void scheduleNext(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = PendingIntent.getBroadcast(c, 0, new Intent(c, ReminderReceiver.class).setAction(ACTION),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        JSONArray a = load(c);
        long next = Long.MAX_VALUE, now = System.currentTimeMillis();
        for (int i = 0; i < a.length(); i++) {
            long at = a.optJSONObject(i) != null ? a.optJSONObject(i).optLong("at") : 0;
            if (at > now && at < next) next = at;
        }
        if (next == Long.MAX_VALUE) { am.cancel(pi); return; }
        // inexact is fine: an evening reminder a few minutes late does no harm, and needs no exact-alarm permission
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pi);
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        String act = intent.getAction();
        if (ACTION.equals(act)) postDue(c);
        if (ACTION.equals(act) || Intent.ACTION_BOOT_COMPLETED.equals(act) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(act)) scheduleNext(c);
    }

    private static void postDue(Context c) {
        JSONArray a = load(c), keep = new JSONArray();
        long now = System.currentTimeMillis();
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Tilalmi idők", NotificationManager.IMPORTANCE_DEFAULT));
        }
        PendingIntent open = PendingIntent.getActivity(c, 0, new Intent(c, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        for (int i = 0; i < a.length(); i++) {
            JSONObject r = a.optJSONObject(i);
            if (r == null) continue;
            long at = r.optLong("at");
            if (at > now + 60000) { keep.put(r); continue; }
            if (now - at > STALE) continue;
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
            b.setSmallIcon(R.drawable.ic_stat_fish).setColor(0xFFFF7A45)
                    .setContentTitle(r.optString("title")).setContentText(r.optString("text"))
                    .setStyle(new Notification.BigTextStyle().bigText(r.optString("text")))
                    .setContentIntent(open).setAutoCancel(true);
            try { nm.notify((int) (at / 60000), b.build()); } catch (SecurityException ignored) {} // permission withdrawn
        }
        prefs(c).edit().putString("reminders", keep.toString()).apply();
    }
}

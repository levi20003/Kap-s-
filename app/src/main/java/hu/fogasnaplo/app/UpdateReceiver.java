package hu.fogasnaplo.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

/** Test build only: the result of a self-update install session. */
public class UpdateReceiver extends BroadcastReceiver {
    @Override
    @SuppressWarnings("deprecation")
    public void onReceive(Context ctx, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        MainActivity a = MainActivity.live;
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            // the system wants one tap (first self-update, or Android below 12): show it now, or when the app is next opened
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm == null) { MainActivity.installing = false; return; }
            MainActivity.pendingConfirm = confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (a != null) a.showConfirm();
            return;
        }
        MainActivity.installing = false;
        if (status == PackageInstaller.STATUS_SUCCESS || a == null) return; // on success this process is replaced anyway
        a.updateFailed(intent.getLongExtra("versionCode", -1), status == PackageInstaller.STATUS_FAILURE_ABORTED,
                intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE));
    }
}

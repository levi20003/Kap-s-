package hu.fogasnaplo.app;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;

/**
 * The widget's configuration entry (placing it, and "edit" on a long press on Android 12+). It has no screen of its own:
 * it says yes to the launcher at once, so the widget is never dropped, and opens the app on Beállítások → Kezdőképernyő-widget.
 * A separate, ordinary activity, because MainActivity is singleTask (a singleTask activity cannot hand a result back reliably).
 */
public class WidgetConfig extends Activity {
    static final String ACTION_SETTINGS = "hu.fogasnaplo.app.WIDGET_SETTINGS";

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        int id = getIntent() != null ? getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
                : AppWidgetManager.INVALID_APPWIDGET_ID;
        setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id));
        KapasWidget.updateAll(this);
        startActivity(new Intent(this, MainActivity.class).setAction(ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        finish();
    }
}

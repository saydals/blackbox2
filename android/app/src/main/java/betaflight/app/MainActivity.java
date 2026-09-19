package betaflight.app;

import android.os.Bundle;
import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import betaflight.app.file.BetaflightFilePlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(BetaflightFilePlugin.class);
    super.onCreate(savedInstanceState);
    applyImmersiveStickyMode();
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    // The system can clear the hidden state without recreating the activity:
    // returning from the file picker, closing the IME, pulling down the
    // notification shade, a swipe reveal, etc. Re-assert the hidden bars
    // every time the window regains focus.
    if (hasFocus) {
      applyImmersiveStickyMode();
    }
  }

  /**
   * Full "sticky immersive" mode:
   * - hides the status + navigation bars;
   * - BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE makes a swipe reveal a transient
   *   overlay that auto-hides again. The Capacitor SystemBars plugin's
   *   hide() runs with the default controller behavior, so once the bars
   *   were revealed they never re-hid on their own and fullscreen was lost.
   */
  private void applyImmersiveStickyMode() {
    Window window = getWindow();
    if (window == null) {
      return;
    }
    WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
      window,
      window.getDecorView()
    );
    controller.setSystemBarsBehavior(
      WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    );
    controller.hide(WindowInsetsCompat.Type.systemBars());
  }
}

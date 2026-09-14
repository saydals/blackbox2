package betaflight.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import betaflight.app.file.BetaflightFilePlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(BetaflightFilePlugin.class);
    super.onCreate(savedInstanceState);
  }
}

"use client";

import { useEffect } from "react";
import { isNativeApp } from "../lib/native";

/** iPhone app only: light status bar text on the dark top strip, and hide the splash screen once loaded. */
export default function NativeSetup() {
  useEffect(() => {
    if (!isNativeApp()) return;
    document.documentElement.classList.add("native-app");
    void (async () => {
      const [{ StatusBar, Style }, { SplashScreen }] = await Promise.all([
        import("@capacitor/status-bar"),
        import("@capacitor/splash-screen"),
      ]);
      await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
      await SplashScreen.hide().catch(() => undefined);
    })();
  }, []);
  return null;
}

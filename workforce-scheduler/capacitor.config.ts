import type { CapacitorConfig } from "@capacitor/cli";

// The iPhone app: a self-contained copy of the scheduler (built into out/ by
// `npm run build:ios`) that runs on the phone and talks to Supabase directly.
const config: CapacitorConfig = {
  appId: "com.hemphill.workforcescheduler",
  appName: "Workforce Scheduler",
  webDir: "out",
  backgroundColor: "#0f172a",
  ios: {
    // Full screen; the app's CSS keeps content clear of the notch.
    contentInset: "never",
    // Pages only scroll inside the app, not the whole web view.
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: false,
      backgroundColor: "#0f172a",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0f172a",
    },
  },
};

export default config;

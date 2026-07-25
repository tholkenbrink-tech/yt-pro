import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "de.ytpro.app",
  appName: "yt-pro",
  // Not actually served from here - the app loads the deployed site instead
  // (see server.url below). Capacitor still requires a webDir to exist on
  // disk even when server.url is set, so this just points at a real,
  // harmless folder rather than a folder built for this purpose.
  webDir: "public",
  server: {
    // Remote-loaded: the native shell just opens the same deployed app the
    // browser and desktop bookmark use, so a redeploy of the web app is all
    // that's needed to update - no native rebuild required for UI/content
    // changes. Only native-plugin changes (PiP, background audio,
    // lock-screen controls) need a new App Store/ad-hoc build.
    url: "https://app.yt-pro.de",
    cleartext: false,
    // Shown instead of a blank/black WKWebView when a navigation fails
    // outright (e.g. cold launch with zero connectivity, before the app
    // has ever loaded successfully once) - see public/offline-fallback.html.
    // Once the app has loaded at least once online, the web app's own
    // service worker + offline video store handle subsequent offline use.
    errorPath: "offline-fallback.html",
  },
};

export default config;

# Manual offline-mode verification

Automated coverage lives in `tests/unit/api.test.ts` (error classification)
and `tests/e2e/offline.spec.ts` (Mediathek availability, non-blocking
feedback, connectivity recovery). The following can only be verified on a
real device, since Playwright cannot force-quit a process or fully drop a
device's radio the way iOS does.

## Primary scenario: force-close + real offline cold start on iOS

1. Install the app on an iPhone (or add the PWA to the home screen) and log in
   while online.
2. In the Mediathek, download at least one video "In der App" (wait for the
   ✓ badge). Leave at least one other item un-downloaded.
3. Force-quit the app (swipe up in the app switcher).
4. Enable Airplane Mode (or disable Wi-Fi and cellular data).
5. Reopen the app.
   - Expect: the app opens straight into the Mediathek (or the last screen),
     with no full-screen "no connection" error and no indefinite blank/
     loading screen.
6. Confirm the downloaded video is visible and tapping it plays it normally.
7. Confirm the non-downloaded item is greyed out with a "☁️ Nur online"
   label, and tapping it shows a small dismissible message ("Dieses Video
   ist offline nicht verfügbar...") without leaving the Mediathek.
8. Confirm the small "Offline" indicator (not a full-width banner) is
   visible somewhere unobtrusive (e.g. top of screen), and does not block
   any other UI.
9. Disable Airplane Mode.
   - Expect: within a few seconds, the online-only item becomes interactive
     again and the "Offline" indicator disappears - no restart required.

## Secondary checks

- **Session expiry while online**: log in, then invalidate the session
  cookie manually (or wait for expiry) and reload while still online -
  expect a redirect to `/login`, not a silent "offline" library view (this
  is what distinguishes an `ApiError` 401 from a real network failure in
  `app/page.tsx` / `app/library/page.tsx`).
- **First-ever launch with no connectivity**: uninstall and reinstall the
  app while offline (nothing cached yet) - expect the native
  `offline-fallback.html` screen (see `capacitor.config.ts`), which
  explicitly explains a first online launch is required, with a working
  "Erneut versuchen" button.
- **WLAN-only settings**: with "Nur im WLAN streamen"/"...herunterladen"
  enabled in Einstellungen, confirm starting a stream/download over cellular
  is blocked with a clear message, and never affects already-downloaded
  offline playback.

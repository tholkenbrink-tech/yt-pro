import { test, expect, type Page } from "@playwright/test";
import { mockApi } from "./mockApi";

/**
 * Seeds offlineStore.ts's IndexedDB "meta" record directly instead of going
 * through the real saveOfflineInApp() download flow. Two reasons: (1) it
 * decouples this offline-mode/availability test from the separate in-app
 * download pipeline's own implementation details, and (2) Playwright's
 * bundled WebKit build cannot store a `Blob` in IndexedDB at all
 * (`UnknownError: Error preparing Blob/File data to be stored`) - a test-
 * environment limitation, not a real Safari one - so a real download can't
 * complete in this browser regardless. Availability/disabling in the
 * Mediathek only reads the "meta" store (see useIsOffline -> isOffline() in
 * lib/offlineStatusStore.ts / lib/offlineStore.ts), so seeding just that is
 * enough to exercise the behavior this test actually cares about.
 */
async function seedOfflineMeta(page: Page, meta: { id: string; title: string; selectedQuality: string }) {
  await page.evaluate((m) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("yt-pro-offline", 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "id" });
        for (const store of ["blobs", "thumbs", "chunks"]) {
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
        }
        if (!db.objectStoreNames.contains("progress")) {
          db.createObjectStore("progress", { keyPath: "id" });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("meta", "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore("meta").put({ ...m, savedAt: new Date().toISOString() });
      };
      req.onerror = () => reject(req.error);
    });
  }, meta);
}

const DOWNLOADED_ITEM = {
  id: "downloaded-item",
  title: "Heruntergeladenes Video",
  channelName: "Kanal A",
  thumbnailPath: "https://picsum.photos/seed/20/320/180",
  duration: 120,
  selectedQuality: "720p",
  fileSize: 1024,
  status: "ready",
  isAutomaticallyPrepared: false,
  createdAt: new Date().toISOString(),
  keepOnServer: false,
  progress: null,
};

const ONLINE_ONLY_ITEM = {
  id: "online-only-item",
  title: "Nur online verfügbares Video",
  channelName: "Kanal B",
  thumbnailPath: "https://picsum.photos/seed/21/320/180",
  duration: 240,
  selectedQuality: "1080p",
  fileSize: 2048,
  status: "ready",
  isAutomaticallyPrepared: false,
  createdAt: new Date().toISOString(),
  keepOnServer: false,
  progress: null,
};

test.describe("Offline mode", () => {
  test("root route does not dead-end an offline cold start", async ({ page }) => {
    await mockApi(page, { library: [DOWNLOADED_ITEM, ONLINE_ONLY_ITEM] });
    // context.setOffline(true) blocks the browser's network layer entirely,
    // which makes even the initial HTML/JS fetch fail in this test env
    // (service workers - and so any offline app-shell cache - are blocked
    // for Playwright, see playwright.config.ts). That's not what this test
    // is verifying anyway: app/page.tsx's offline branch keys off
    // `navigator.onLine`, so stubbing that directly isolates the exact
    // client-side behavior under test without depending on the browser's
    // own (unavailable-in-this-env) offline-caching layer.
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    });

    await page.goto("/");

    // Must land on /library (or stay put rendering it), never get stuck on
    // a blank screen or bounced to /login just because there's no network.
    await expect(page).toHaveURL(/\/library/);
    await expect(page.getByRole("heading", { name: "Mediathek" })).toBeVisible();
  });

  test("downloaded video stays available and playable offline; non-downloaded item is disabled without a full-screen error", async ({
    page,
  }) => {
    await mockApi(page, { library: [DOWNLOADED_ITEM, ONLINE_ONLY_ITEM] });

    await page.goto("/library");
    await expect(page.getByText(DOWNLOADED_ITEM.title)).toBeVisible();

    await seedOfflineMeta(page, {
      id: DOWNLOADED_ITEM.id,
      title: DOWNLOADED_ITEM.title,
      selectedQuality: DOWNLOADED_ITEM.selectedQuality,
    });

    // Simulate a reopen with no connection: every /api/* call fails at the
    // network layer (not a mocked response) and navigator.onLine reports
    // false, exactly like app/page.tsx's and library/page.tsx's offline
    // branches key off. (context.setOffline() blocks ALL network traffic
    // including the page's own JS/HTML, which fails outright in Playwright's
    // WebKit build with no offline-caching layer available in this test
    // env - see playwright.config.ts's serviceWorkers: "block". Aborting
    // only /api/* isolates the exact thing being tested.)
    await page.route("**/api/**", (route) => route.abort());
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    });
    await page.reload();

    await expect(page.getByRole("heading", { name: "Mediathek" })).toBeVisible();
    await expect(page.getByText(DOWNLOADED_ITEM.title)).toBeVisible();
    await expect(page.getByText(ONLINE_ONLY_ITEM.title)).toBeVisible();

    // The downloaded item remains fully interactive.
    const downloadedPlayLink = page.getByRole("link", { name: "Abspielen" }).first();
    await expect(downloadedPlayLink).not.toHaveAttribute("aria-disabled", "true");

    // The non-downloaded item is visibly marked unavailable and does not
    // navigate away when selected - it shows a small dismissible message
    // instead of trapping the user on a full-screen error. Only the
    // unavailable item ever renders this badge, so an unscoped lookup is
    // unambiguous here.
    await expect(page.getByText("☁️ Nur online")).toBeVisible();

    const onlineOnlyPlayLink = page.getByRole("link", { name: "Abspielen" }).nth(1);
    await expect(onlineOnlyPlayLink).toHaveAttribute("aria-disabled", "true");
    // aria-disabled doesn't stop a click from actually landing (unlike the
    // native `disabled` attribute, which isn't valid on an <a>) - Playwright
    // itself refuses a plain .click() here since it treats aria-disabled as
    // non-interactive, so force it to reach the app's own onClick guard
    // (blockIfUnavailable in MediaCard.tsx), which is what's actually being
    // tested: that a stray/assistive-tech-bypassing click still doesn't
    // navigate.
    await onlineOnlyPlayLink.click({ force: true });

    await expect(page).toHaveURL(/\/library$/);
    await expect(
      page.getByText("Dieses Video ist offline nicht verfügbar. Verbinde dich mit dem Internet, um es zu öffnen.")
    ).toBeVisible();

    // Connectivity recovery: the previously-unavailable item becomes
    // interactive again automatically, no reload required. Unrouting lets
    // the mocked (successful) /api/* handlers from mockApi() respond again,
    // and flipping navigator.onLine is what useOnlineStatus() itself reacts
    // to (no dispatched event needed - it re-reads the property directly).
    await page.unroute("**/api/**");
    await page.evaluate(() => {
      Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
      window.dispatchEvent(new Event("online"));
    });
    await expect(page.getByText("☁️ Nur online")).not.toBeVisible();
  });

  test("a failed background library refresh keeps showing previously loaded items instead of an empty/fatal state", async ({
    page,
    context,
  }) => {
    await mockApi(page, { library: [DOWNLOADED_ITEM] });
    await page.goto("/library");
    await expect(page.getByText(DOWNLOADED_ITEM.title)).toBeVisible();

    // Simulate a failed refresh (e.g. a background re-fetch) without a full
    // reload - offline items already in IndexedDB/state must not be wiped
    // out just because one API call failed.
    await context.setOffline(true);
    await page.getByRole("button", { name: "Suchen" }).click();

    await expect(page.getByText(DOWNLOADED_ITEM.title)).toBeVisible();
  });
});

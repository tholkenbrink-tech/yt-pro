import { test, expect } from "@playwright/test";
import { mockApi, API_BASE_URL } from "./mockApi";

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
  test("root route does not dead-end an offline cold start", async ({ page, context }) => {
    await mockApi(page, { library: [DOWNLOADED_ITEM, ONLINE_ONLY_ITEM] });
    await context.setOffline(true);

    await page.goto("/");

    // Must land on /library (or stay put rendering it), never get stuck on
    // a blank screen or bounced to /login just because there's no network.
    await expect(page).toHaveURL(/\/library/);
    await expect(page.getByText("Mediathek")).toBeVisible();
  });

  test("downloaded video stays available and playable offline; non-downloaded item is disabled without a full-screen error", async ({
    page,
    context,
  }) => {
    await mockApi(page, { library: [DOWNLOADED_ITEM, ONLINE_ONLY_ITEM] });
    await page.route(`${API_BASE_URL}/api/items/*/stream`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "video/mp4",
        headers: { "Content-Length": "8" },
        body: Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]),
      })
    );

    await page.goto("/library");
    await expect(page.getByText(DOWNLOADED_ITEM.title)).toBeVisible();

    // Save the first item offline while still online, via the real UI flow.
    const downloadButton = page
      .locator("div")
      .filter({ hasText: DOWNLOADED_ITEM.title })
      .first()
      .getByRole("button", { name: /herunterladen/i });
    await downloadButton.click();
    await expect(page.getByText("✓ In der App")).toBeVisible({ timeout: 15_000 });

    // Now go offline and reload, simulating the app being reopened with no
    // connection - this must not show a blocking full-screen error.
    await context.setOffline(true);
    await page.reload();

    await expect(page.getByText("Mediathek")).toBeVisible();
    await expect(page.getByText(DOWNLOADED_ITEM.title)).toBeVisible();
    await expect(page.getByText(ONLINE_ONLY_ITEM.title)).toBeVisible();

    // The downloaded item remains fully interactive.
    const downloadedPlayLink = page.getByRole("link", { name: "Abspielen" }).first();
    await expect(downloadedPlayLink).not.toHaveAttribute("aria-disabled", "true");

    // The non-downloaded item is visibly marked unavailable and does not
    // navigate away when selected - it shows a small dismissible message
    // instead of trapping the user on a full-screen error.
    const onlineOnlyCard = page.locator("div").filter({ hasText: ONLINE_ONLY_ITEM.title }).first();
    await expect(onlineOnlyCard.getByText("☁️ Nur online")).toBeVisible();

    const onlineOnlyPlayLink = page.getByRole("link", { name: "Abspielen" }).nth(1);
    await onlineOnlyPlayLink.click();

    await expect(page).toHaveURL(/\/library$/);
    await expect(
      page.getByText("Dieses Video ist offline nicht verfügbar. Verbinde dich mit dem Internet, um es zu öffnen.")
    ).toBeVisible();

    // Connectivity recovery: the previously-unavailable item becomes
    // interactive again automatically, no reload required.
    await context.setOffline(false);
    await expect(onlineOnlyCard.getByText("☁️ Nur online")).not.toBeVisible();
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

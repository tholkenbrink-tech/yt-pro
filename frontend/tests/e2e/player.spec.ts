import { test, expect } from "@playwright/test";
import { mockApi } from "./mockApi";

const LIBRARY_ITEM = {
  id: "item-1",
  title: "Testvideo",
  channelName: "Kanal A",
  selectedQuality: "720p",
  fileSize: 50_000_000,
  duration: 300,
  status: "ready",
  isAutomaticallyPrepared: false,
  createdAt: new Date().toISOString(),
  keepOnServer: false,
  progress: null,
};

test.describe("Player page", () => {
  test("renders a native <video> with the stream src and native controls, no custom overlay", async ({
    page,
  }) => {
    await mockApi(page, { library: [LIBRARY_ITEM] });
    await page.goto("/library/item-1");

    const video = page.locator("video");
    await expect(video).toHaveCount(1);
    await expect(video).toHaveAttribute("src", /\/api\/items\/item-1\/stream$/);
    await expect(video).toHaveAttribute("controls", "");
    await expect(video).toHaveAttribute("playsinline", "");

    // No element should visually cover the native <video> controls.
    await expect(page.locator("video ~ .absolute:not([role='status'])")).toHaveCount(0);
  });

  test("shows a resume toast when saved progress exists, and 'Von vorne' resets it", async ({
    page,
  }) => {
    await mockApi(page, {
      library: [LIBRARY_ITEM],
      progress: {
        positionSeconds: 42,
        durationSeconds: 300,
        percentage: 14,
        completed: false,
        playbackRate: 1,
      },
    });
    await page.goto("/library/item-1");

    const video = page.locator("video");
    await video.evaluate((el) => {
      Object.defineProperty(el, "duration", { value: 300, configurable: true });
      el.dispatchEvent(new Event("loadedmetadata"));
    });

    await expect(page.getByText(/Fortgesetzt bei/)).toBeVisible();

    const resetRequest = page.waitForRequest(/\/progress\/reset$/);
    await page.getByRole("button", { name: "Von vorne", exact: true }).click();
    await resetRequest;
    await expect(page.getByText(/Fortgesetzt bei/)).toBeHidden();
  });

  test("hides the PiP button when neither PiP API is available", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(document, "pictureInPictureEnabled", { value: false });
    });
    await mockApi(page, { library: [LIBRARY_ITEM] });
    await page.goto("/library/item-1");
    await expect(page.getByRole("button", { name: "Bild-in-Bild umschalten" })).toHaveCount(0);
  });

  test("shows the PiP button when the standard API is available", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(document, "pictureInPictureEnabled", { value: true });
    });
    await mockApi(page, { library: [LIBRARY_ITEM] });
    await page.goto("/library/item-1");
    await expect(page.getByRole("button", { name: "Bild-in-Bild umschalten" })).toBeVisible();
  });
});

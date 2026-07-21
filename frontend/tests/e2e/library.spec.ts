import { test, expect } from "@playwright/test";
import { mockApi } from "./mockApi";

const LIBRARY_ITEMS = [
  {
    id: "item-1",
    title: "Video eins",
    channelName: "Kanal A",
    thumbnailPath: "https://picsum.photos/seed/10/320/180",
    duration: 300,
    selectedQuality: "720p",
    fileSize: 50_000_000,
    status: "ready",
    isAutomaticallyPrepared: false,
    createdAt: new Date().toISOString(),
    keepOnServer: false,
    progress: null,
  },
  {
    id: "item-2",
    title: "Video zwei",
    channelName: "Kanal B",
    thumbnailPath: "https://picsum.photos/seed/11/320/180",
    duration: 600,
    selectedQuality: "1080p",
    fileSize: 120_000_000,
    status: "ready",
    isAutomaticallyPrepared: true,
    sourceName: "Mein Kanal",
    createdAt: new Date().toISOString(),
    keepOnServer: false,
    progress: { positionSeconds: 30, percentage: 10, completed: false },
  },
];

test.describe("Mediathek grid", () => {
  test("renders items and switches column count with viewport width", async ({ page }) => {
    await mockApi(page, { library: LIBRARY_ITEMS });
    await page.goto("/library");

    await expect(page.getByText("Video eins")).toBeVisible();
    await expect(page.getByText("Video zwei")).toBeVisible();

    const grid = page.locator("main div.grid");
    const columnCount = await grid.evaluate((el) => {
      const style = getComputedStyle(el);
      return style.gridTemplateColumns.split(" ").length;
    });

    const width = page.viewportSize()?.width ?? 0;
    if (width >= 1024) {
      expect(columnCount).toBe(3);
    } else if (width >= 768) {
      expect(columnCount).toBe(2);
    } else {
      expect(columnCount).toBe(1);
    }
  });

  test("shows the automatic-source badge and progress bar for prepared items", async ({
    page,
  }) => {
    await mockApi(page, { library: LIBRARY_ITEMS });
    await page.goto("/library");
    await expect(page.getByText(/Automatisch: Mein Kanal/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Fortsetzen" })).toBeVisible();
  });
});

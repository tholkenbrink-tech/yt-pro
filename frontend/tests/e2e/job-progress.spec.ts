import { test, expect } from "@playwright/test";
import { mockApi } from "./mockApi";

test.describe("Job progress page", () => {
  test("shows live progress details for an in-progress item", async ({ page }) => {
    await mockApi(page);
    await page.goto("/jobs/job-1");

    await expect(page.getByText("Beispielvideo für Tests")).toBeVisible();
    await expect(page.getByText("Video wird geladen").first()).toBeVisible();
    await expect(page.getByText(/40\.1 MB \/ 95\.4 MB/)).toBeVisible();
  });

  test("never renders a play/video-playback control", async ({ page }) => {
    await mockApi(page);
    await page.goto("/jobs/job-1");
    await expect(page.locator("video")).toHaveCount(0);
  });

  test("shows the ready state with a native download link, not a JS blob button", async ({
    page,
  }) => {
    await mockApi(page, {
      job: {
        jobId: "job-1",
        status: "ready",
        sourceUrl: "https://youtube.com/watch?v=abc123",
        selectedQuality: "720p",
        createdAt: new Date().toISOString(),
        items: [
          {
            id: "item-1",
            title: "Fertiges Video",
            thumbnail: "https://picsum.photos/seed/2/320/180",
            selectedQuality: "720p",
            status: "ready",
            progress: 100,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
            conversionNote: "converted_for_iphone",
            finalFileSize: 95_000_000,
            finalFormat: "mp4",
          },
        ],
      },
    });
    await page.goto("/jobs/job-1");

    const link = page.getByRole("link", { name: "Auf iPhone laden" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("download", "");
    await expect(link).toHaveAttribute(
      "href",
      /\/api\/items\/item-1\/download/
    );
    await expect(page.getByText("Für iPhone wird konvertiert")).toBeVisible();
  });
});

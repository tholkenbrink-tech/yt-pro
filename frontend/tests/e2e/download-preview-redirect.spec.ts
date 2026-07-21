import { test, expect } from "@playwright/test";
import { mockApi } from "./mockApi";

test.describe("Phase 1 regression: analyze -> preview -> prepare -> download", () => {
  test("/analyze redirects to /download/preview", async ({ page }) => {
    await mockApi(page);
    // Seed a pending analysis so /download/preview has something to show
    // and doesn't itself redirect further back to /download.
    await page.addInitScript(() => {
      sessionStorage.setItem(
        "yt-pro:pending-analysis",
        JSON.stringify({
          sourceUrl: "https://youtube.com/watch?v=abc123",
          result: {
            kind: "single",
            title: "Beispielvideo",
            thumbnail: "https://picsum.photos/seed/5/320/180",
            channelName: "Kanal",
            duration: 120,
            uploadDate: new Date().toISOString(),
            availableQualities: [{ name: "720p", label: "720p" }],
          },
        })
      );
    });
    await page.goto("/analyze");
    await expect(page).toHaveURL(/\/download\/preview$/);
    await expect(page.getByText("Beispielvideo")).toBeVisible();
  });

  test("/download/preview without pending analysis redirects back to /download", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/download/preview");
    await expect(page).toHaveURL(/\/download$/);
  });

  test("full manual flow still works end-to-end at the new routes", async ({ page }) => {
    await mockApi(page, {
      job: {
        jobId: "job-1",
        status: "queued",
        sourceUrl: "https://youtube.com/watch?v=abc123",
        selectedQuality: "720p",
        createdAt: new Date().toISOString(),
        items: [],
      },
    });
    await page.route("**/api/analyze", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          kind: "single",
          title: "Beispielvideo",
          thumbnail: "https://picsum.photos/seed/5/320/180",
          channelName: "Kanal",
          duration: 120,
          uploadDate: new Date().toISOString(),
          availableQualities: [{ name: "720p", label: "720p" }],
        }),
      })
    );

    await page.goto("/download");
    await page.getByRole("dialog", { name: /private, rechtmäßige Nutzung/ }).getByRole("button", { name: "Verstanden" }).click();
    await page.getByLabel("Video- oder Playlist-Link(s)").fill("https://youtube.com/watch?v=abc123");
    await page.getByRole("button", { name: /Analysieren/ }).click();

    await expect(page).toHaveURL(/\/download\/preview$/);
    await expect(page.getByText("Beispielvideo")).toBeVisible();

    await page.getByRole("button", { name: "Download vorbereiten" }).click();
    await expect(page).toHaveURL(/\/activity\/job-1$/);
  });
});

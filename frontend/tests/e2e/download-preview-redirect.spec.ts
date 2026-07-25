import { test, expect } from "@playwright/test";
import { mockApi } from "./mockApi";

test.describe("Download flow: single continuous page", () => {
  test("/analyze redirects to /download", async ({ page }) => {
    await mockApi(page);
    await page.goto("/analyze");
    await expect(page).toHaveURL(/\/download$/);
  });

  test("a pending analysis from a previous visit is restored inline on /download", async ({
    page,
  }) => {
    await mockApi(page);
    // Seed a pending analysis so /download has something to show without
    // needing to analyze again.
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
    await page.goto("/download");
    await expect(page).toHaveURL(/\/download$/);
    await expect(page.getByText("Beispielvideo")).toBeVisible();
  });

  test("full manual flow works end-to-end without leaving /download", async ({ page }) => {
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
        // Shape of RawAnalyzeResponse (lib/analyzeTransform.ts), not the
        // post-transform AnalysisResult - toAnalysisResult() is what turns
        // this into the { kind, ... } union the page actually renders.
        body: JSON.stringify({
          sourceType: "single",
          title: "Beispielvideo",
          thumbnail: "https://picsum.photos/seed/5/320/180",
          channelName: "Kanal",
          duration: 120,
          uploadDate: new Date().toISOString(),
          availableQualities: [{ name: "720p", audioOnly: false }],
          items: [{ youtubeId: "abc123", title: "Beispielvideo" }],
          itemCount: 1,
        }),
      })
    );

    await page.goto("/download");
    await page.getByRole("dialog", { name: /private, rechtmäßige Nutzung/ }).getByRole("button", { name: "Verstanden" }).click();
    await page.getByLabel("Video- oder Playlist-Link(s)").fill("https://youtube.com/watch?v=abc123");
    await page.getByRole("button", { name: /Analysieren/ }).click();

    // Analysis result appears inline - no navigation away from /download.
    await expect(page).toHaveURL(/\/download$/);
    await expect(page.getByText("Beispielvideo")).toBeVisible();

    await page.getByRole("button", { name: "Auf NAS speichern" }).click();
    await expect(page).toHaveURL(/\/activity\/job-1$/);
  });
});

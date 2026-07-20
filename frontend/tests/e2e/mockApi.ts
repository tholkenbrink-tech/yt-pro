import type { Page } from "@playwright/test";

export const API_BASE_URL = "http://api.yt-pro.test";

const json = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

/**
 * Wires up route interception for every `/api/*` call the app makes, so
 * e2e tests never touch a real backend or the real YouTube/network.
 */
export async function mockApi(
  page: Page,
  overrides: Partial<{
    storage: unknown;
    jobs: unknown[];
    job: unknown;
  }> = {}
) {
  await page.route(`${API_BASE_URL}/api/storage`, (route) =>
    route.fulfill(
      json(
        overrides.storage ?? {
          usedBytes: 2_000_000_000,
          freeBytes: 30_000_000_000,
          lowSpaceWarning: false,
          retentionHours: 24,
        }
      )
    )
  );

  await page.route(`${API_BASE_URL}/api/jobs`, (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill(json(overrides.jobs ?? []));
    }
    return route.fulfill(json({ jobId: "job-1", status: "queued" }));
  });

  await page.route(`${API_BASE_URL}/api/jobs/*`, (route) => {
    const url = route.request().url();
    if (url.endsWith("/cancel") || url.endsWith("/retry")) {
      return route.fulfill(json({}));
    }
    return route.fulfill(
      json(
        overrides.job ?? {
          jobId: "job-1",
          status: "downloading_video",
          sourceUrl: "https://youtube.com/watch?v=abc123",
          selectedQuality: "720p",
          createdAt: new Date().toISOString(),
          items: [
            {
              id: "item-1",
              title: "Beispielvideo für Tests",
              thumbnail: "https://picsum.photos/seed/1/320/180",
              selectedQuality: "720p",
              status: "downloading_video",
              progress: 42,
              currentStep: "Video wird geladen",
              downloadedBytes: 42_000_000,
              estimatedTotalBytes: 100_000_000,
              speed: 2_500_000,
              estimatedRemainingSeconds: 30,
              createdAt: new Date().toISOString(),
              conversionNote: "converted_for_iphone",
            },
          ],
        }
      )
    );
  });

  await page.route(`${API_BASE_URL}/api/auth/session`, (route) =>
    route.fulfill(json({ user: { username: "testuser" } }))
  );
}

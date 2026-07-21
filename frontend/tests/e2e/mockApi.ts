import type { Page } from "@playwright/test";

// Same-origin as the app under test (see playwright.config.ts baseURL).
// A genuinely cross-origin fake host would mirror production topology more
// closely, but Chromium's CORS preflight (OPTIONS) requests for
// non-"simple" fetches (JSON POST/PUT/DELETE bodies) aren't observable via
// Playwright's page.route - the browser resolves/sends them before routing
// ever sees them - so a non-resolvable fake hostname makes every mutating
// call fail regardless of mocking. Same-origin sidesteps preflight
// entirely while still exercising the exact same request/response contract.
export const API_BASE_URL = "http://localhost:3100";

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
    library: unknown[];
    progress: unknown;
    sourceAnalyze: unknown;
    createSourceResponse: unknown;
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

  // ---- Phase 2 ----

  await page.route(`${API_BASE_URL}/api/library*`, (route) =>
    route.fulfill(json(overrides.library ?? []))
  );

  await page.route(`${API_BASE_URL}/api/items/*/progress`, (route) => {
    if (route.request().method() === "PUT") return route.fulfill(json({}));
    return route.fulfill(
      json(
        overrides.progress ?? {
          positionSeconds: 0,
          durationSeconds: 0,
          percentage: 0,
          completed: false,
          playbackRate: 1,
        }
      )
    );
  });

  await page.route(`${API_BASE_URL}/api/items/*/progress/reset`, (route) =>
    route.fulfill(json({}))
  );

  await page.route(`${API_BASE_URL}/api/items/*/mark-watched`, (route) =>
    route.fulfill(json({}))
  );

  const sourceOut = () =>
    overrides.createSourceResponse ?? {
      id: "source-1",
      name: "Beispiel-Playlist",
      sourceUrl: "https://youtube.com/playlist?list=abc",
      mode: "confirm_first",
      scheduleType: "daily",
      includeShorts: true,
      includeLivestreams: false,
      includePastLivestreams: false,
      notificationsEnabled: false,
      enabled: true,
      computedStatus: "active",
    };

  // Single dispatcher for every /api/sources* path, keyed off the URL
  // shape - avoids relying on page.route's multi-match precedence rules
  // across several overlapping glob patterns.
  await page.route(/\/api\/sources(\/.*)?$/, (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (path === "/api/sources/analyze") {
      return route.fulfill(
        json(
          overrides.sourceAnalyze ?? {
            playlistTitle: "Beispiel-Playlist",
            thumbnail: "https://picsum.photos/seed/3/320/180",
            itemCount: 12,
          }
        )
      );
    }
    if (path.endsWith("/items")) return route.fulfill(json([]));
    if (path.endsWith("/runs")) return route.fulfill(json([]));
    if (path === "/api/sources") {
      if (method === "GET") return route.fulfill(json([]));
      return route.fulfill(json(sourceOut()));
    }
    // /api/sources/{id}, /pause, /resume, /check-now
    return route.fulfill(json(sourceOut()));
  });

  await page.route(`${API_BASE_URL}/api/admin/cookies/status`, (route) =>
    route.fulfill(json({ status: "not_configured" }))
  );

  await page.route(`${API_BASE_URL}/api/admin/cookies/test`, (route) =>
    route.fulfill(json({ status: "valid", message: "Cookie file accepted by yt-dlp" }))
  );
}

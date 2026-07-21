import { defineConfig, devices } from "@playwright/test";
import { API_BASE_URL } from "./tests/e2e/mockApi";

const PORT = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // The app's own service worker (public/sw.js) has a fetch handler that
    // ends up swallowing non-GET requests before Playwright's page.route
    // can see them, making mutating calls (POST/PUT/DELETE) impossible to
    // mock. Blocking service workers only affects the test browser context,
    // not the real PWA.
    serviceWorkers: "block",
  },
  webServer: {
    command: "npm run build && npm run start -- -p " + PORT,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_API_BASE_URL: API_BASE_URL,
    },
  },
  projects: [
    {
      name: "iphone-se",
      use: { ...devices["iPhone SE"] },
    },
    {
      name: "iphone-14",
      use: { ...devices["iPhone 14"] },
    },
    {
      name: "iphone-pro-max",
      use: {
        viewport: { width: 430, height: 932 },
        userAgent: devices["iPhone 14 Pro Max"].userAgent,
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: "ipad",
      use: { ...devices["iPad (gen 7)"], viewport: { width: 768, height: 1024 } },
    },
  ],
});

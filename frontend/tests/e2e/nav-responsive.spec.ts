import { test, expect } from "@playwright/test";
import { mockApi } from "./mockApi";

test.describe("Responsive navigation shell", () => {
  test("renders the bottom tab bar or the sidebar depending on viewport width", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/download");

    const viewport = page.viewportSize();
    const isDesktopWidth = (viewport?.width ?? 0) >= 768;

    const sidebarNav = page.locator("aside nav[aria-label='Hauptnavigation']");
    const bottomNav = page.locator("nav.bottom-nav");

    if (isDesktopWidth) {
      await expect(sidebarNav).toBeVisible();
      await expect(bottomNav).toBeHidden();
    } else {
      await expect(bottomNav).toBeVisible();
      await expect(sidebarNav).toBeHidden();
    }
  });
});

import { test, expect } from "@playwright/test";
import { mockApi } from "./mockApi";

test.describe("Download page (Phase 1 flow, moved from /)", () => {
  test("renders the URL input and primary actions", async ({ page }) => {
    await mockApi(page);
    await page.goto("/download");

    await expect(page.getByRole("heading", { name: "yt-pro" })).toBeVisible();
    await expect(page.getByLabel("Video- oder Playlist-Link(s)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Link einfügen" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Analysieren/ })).toBeVisible();
  });

  test("shows the first-visit legal notice and dismisses it", async ({ page }) => {
    await mockApi(page);
    await page.goto("/download");

    const modal = page.getByRole("dialog", { name: /private, rechtmäßige Nutzung/ });
    await expect(modal).toBeVisible();
    await modal.getByRole("button", { name: "Verstanden" }).click();
    await expect(modal).toBeHidden();

    // Should not reappear on reload once the localStorage flag is set.
    await page.reload();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("shows the storage summary strip", async ({ page }) => {
    await mockApi(page);
    await page.goto("/download");
    await expect(page.getByRole("main").getByText("Speicher", { exact: true })).toBeVisible();
  });

  test("/ redirects to /download", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await expect(page).toHaveURL(/\/download$/);
  });
});

test.describe("Navigation", () => {
  test("mobile bottom nav links to activity, library and settings", async ({ page }) => {
    await mockApi(page);
    await page.goto("/download");
    await expect(page.getByRole("link", { name: /Aktivität/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Mediathek/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Einstellungen/ })).toBeVisible();
  });
});

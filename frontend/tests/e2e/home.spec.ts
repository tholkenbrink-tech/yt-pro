import { test, expect } from "@playwright/test";
import { mockApi } from "./mockApi";

test.describe("Home page", () => {
  test("renders the URL input and primary actions", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "yt-pro" })).toBeVisible();
    await expect(page.getByLabel("Video- oder Playlist-Link(s)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Link einfügen" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Analysieren/ })).toBeVisible();
  });

  test("shows the first-visit legal notice and dismisses it", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

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
    await page.goto("/");
    await expect(page.getByRole("main").getByText("Speicher", { exact: true })).toBeVisible();
  });

  test("bottom navigation links to history and settings", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Verlauf" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Speicher" })).toBeVisible();
  });
});

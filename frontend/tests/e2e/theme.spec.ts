import { test, expect } from "@playwright/test";
import { mockApi } from "./mockApi";

test.describe("Design (theme) settings", () => {
  test("toggling light/dark actually changes the --color-background custom property", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/settings");

    const readBackground = () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--color-background").trim()
      );

    await page.getByRole("radio", { name: "Hell" }).click();
    const light = await readBackground();

    await page.getByRole("radio", { name: "Dunkel" }).click();
    const dark = await readBackground();

    expect(light).not.toBe(dark);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});

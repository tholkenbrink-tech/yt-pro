import { test, expect } from "@playwright/test";
import { mockApi } from "./mockApi";

test.describe("New automated source flow", () => {
  test("fills url, previews the playlist, picks quality/schedule/mode, and submits", async ({
    page,
  }) => {
    await mockApi(page, {
      sourceAnalyze: {
        playlistTitle: "Wöchentliche Uploads",
        thumbnail: "https://picsum.photos/seed/20/320/180",
        itemCount: 8,
      },
    });
    await page.goto("/settings/sources/new");

    await page.getByLabel("Playlist-Link").fill("https://youtube.com/playlist?list=xyz");
    await page.getByRole("button", { name: "Prüfen" }).click();

    await expect(page.getByText("Wöchentliche Uploads")).toBeVisible();
    await expect(page.getByText("8 Videos")).toBeVisible();

    await page.getByRole("radio", { name: /1080p/ }).click();
    await page.getByRole("radio", { name: "Täglich" }).click();
    await page.getByRole("radio", { name: /Vorher bestätigen/ }).click();

    const createRequest = page.waitForRequest(
      (req) => req.url().endsWith("/api/sources") && req.method() === "POST"
    );
    await page.getByRole("button", { name: "Quelle speichern" }).click();
    const request = await createRequest;
    const body = request.postDataJSON();

    expect(body.sourceUrl).toBe("https://youtube.com/playlist?list=xyz");
    expect(body.downloadProfileId).toBe("1080p");
    expect(body.scheduleType).toBe("daily");
    expect(body.mode).toBe("confirm_first");
    expect(body.name).toBe("Wöchentliche Uploads");

    await expect(page).toHaveURL(/\/settings\/sources\/source-1$/);
  });
});

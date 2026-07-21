import { describe, expect, it } from "vitest";
import { deriveMediaState, mediaStateLabel } from "@/lib/mediaStateConfig";
import type { LibraryItem } from "@/lib/types";

function makeItem(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: "item-1",
    title: "Beispiel",
    selectedQuality: "720p",
    status: "ready",
    isAutomaticallyPrepared: false,
    createdAt: new Date().toISOString(),
    keepOnServer: false,
    progress: null,
    ...overrides,
  };
}

describe("deriveMediaState", () => {
  it("returns downloaded_to_device when status is downloaded_to_device", () => {
    expect(deriveMediaState(makeItem({ status: "downloaded_to_device" }))).toBe(
      "downloaded_to_device"
    );
  });

  it("returns expiring_soon when expiresAt is within the next few hours and not kept", () => {
    const soon = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect(deriveMediaState(makeItem({ expiresAt: soon }))).toBe("expiring_soon");
  });

  it("does not flag expiring_soon when keepOnServer is true", () => {
    const soon = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect(deriveMediaState(makeItem({ expiresAt: soon, keepOnServer: true }))).toBe("new");
  });

  it("returns watched when progress is completed", () => {
    expect(
      deriveMediaState(
        makeItem({ progress: { positionSeconds: 500, percentage: 100, completed: true } })
      )
    ).toBe("watched");
  });

  it("returns started when progress exists but is incomplete", () => {
    expect(
      deriveMediaState(
        makeItem({ progress: { positionSeconds: 120, percentage: 40, completed: false } })
      )
    ).toBe("started");
  });

  it("returns auto_prepared when automatically prepared with no progress", () => {
    expect(deriveMediaState(makeItem({ isAutomaticallyPrepared: true }))).toBe("auto_prepared");
  });

  it("returns new as the default fallback", () => {
    expect(deriveMediaState(makeItem())).toBe("new");
  });
});

describe("mediaStateLabel", () => {
  it("maps each state to its German label", () => {
    expect(mediaStateLabel("new")).toBe("Neu");
    expect(mediaStateLabel("started")).toBe("Begonnen");
    expect(mediaStateLabel("watched")).toBe("Angesehen");
    expect(mediaStateLabel("auto_prepared")).toBe("Automatisch vorbereitet");
    expect(mediaStateLabel("expiring_soon")).toBe("Läuft bald ab");
    expect(mediaStateLabel("downloaded_to_device")).toBe("Auf iPhone geladen");
  });
});

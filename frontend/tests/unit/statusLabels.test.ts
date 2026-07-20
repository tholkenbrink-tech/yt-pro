import { describe, expect, it } from "vitest";
import {
  statusLabel,
  isActiveStatus,
  conversionNoteLabel,
} from "@/lib/statusLabels";

describe("statusLabel", () => {
  it("maps each known backend status to a German label", () => {
    expect(statusLabel("downloading_video")).toBe("Video wird geladen");
    expect(statusLabel("merging")).toBe(
      "Audio und Video werden zusammengeführt"
    );
    expect(statusLabel("optimizing_for_iphone")).toBe(
      "Wird für iPhone optimiert"
    );
    expect(statusLabel("ready")).toBe("Bereit zum iPhone-Download");
    expect(statusLabel("failed")).toBe("Fehlgeschlagen");
  });

  it("falls back to the raw value for an unknown status", () => {
    // @ts-expect-error - intentionally testing an out-of-union value
    expect(statusLabel("something_new")).toBe("something_new");
  });
});

describe("isActiveStatus", () => {
  it("treats in-progress statuses as active", () => {
    expect(isActiveStatus("downloading_video")).toBe(true);
    expect(isActiveStatus("queued")).toBe(true);
    expect(isActiveStatus("merging")).toBe(true);
  });

  it("treats terminal statuses as not active", () => {
    expect(isActiveStatus("ready")).toBe(false);
    expect(isActiveStatus("failed")).toBe(false);
    expect(isActiveStatus("cancelled")).toBe(false);
    expect(isActiveStatus("expired")).toBe(false);
  });
});

describe("conversionNoteLabel", () => {
  it("maps conversion notes to their transparency message", () => {
    expect(conversionNoteLabel("converted_for_iphone")).toBe(
      "Für iPhone wird konvertiert"
    );
    expect(conversionNoteLabel("no_conversion")).toBe(
      "Keine Konvertierung nötig"
    );
  });
});

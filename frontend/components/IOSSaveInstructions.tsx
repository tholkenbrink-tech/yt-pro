"use client";

import { BottomSheet } from "./BottomSheet";

/** Shared across every surface that can trigger a device download (Aktivität,
 * Mediathek, video detail page) so the "how to save it" popup only ever
 * shows once app-wide, not once per surface. */
export const SEEN_INSTRUCTIONS_KEY = "yt-pro:ios-instructions-seen";

const STEPS = [
  "Tippe oben auf \"Auf iPhone laden\" - der Download startet im Hintergrund.",
  "Achte danach kurz auf die Adressleiste ganz oben: Dort erscheint ein kleiner Pfeil nach unten (Download-Symbol). Siehst du ihn nicht sofort, tippe einmal auf die Adressleiste, um sie einzublenden.",
  "Tippe auf diesen Pfeil, dann auf den fertigen Download in der Liste.",
  "Tippe auf das Teilen-Symbol und wähle \"In Dateien sichern\".",
  "Wähle \"Auf meinem iPhone\" oder einen iCloud-Drive-Ordner zum Speichern.",
];

export function IOSSaveInstructions({ onClose }: { onClose: () => void }) {
  return (
    <BottomSheet open title="So sicherst du die Datei auf deinem iPhone" onClose={onClose}>
      <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-text-primary">
        {STEPS.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
      <p className="mt-4 text-sm leading-relaxed text-text-secondary">
        yt-pro legt die Datei nicht selbst an einem festen Ort ab - der
        endgültige Speicherort wird von dir in Safari/Dateien festgelegt.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="mt-6 min-h-11 w-full rounded-md bg-accent px-4 py-3 text-sm font-semibold text-white"
      >
        Verstanden
      </button>
    </BottomSheet>
  );
}

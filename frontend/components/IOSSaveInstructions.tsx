"use client";

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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ios-save-title"
    >
      <div className="safe-area-shell w-full max-w-md rounded-t-2xl bg-white px-8 py-8 shadow-xl dark:bg-gray-900 sm:rounded-2xl">
        <h2 id="ios-save-title" className="text-lg font-semibold">
          So sicherst du die Datei auf deinem iPhone
        </h2>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          {STEPS.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
        <p className="mt-4 text-xs leading-relaxed text-gray-400 dark:text-gray-500">
          yt-pro legt die Datei nicht selbst an einem festen Ort ab - der
          endgültige Speicherort wird von dir in Safari/Dateien festgelegt.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-lg bg-brand px-4 py-3 font-medium text-white active:opacity-80 dark:bg-brand-dark dark:text-gray-950"
        >
          Verstanden
        </button>
      </div>
    </div>
  );
}

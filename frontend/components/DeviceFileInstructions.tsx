"use client";

import { useState } from "react";
import { attemptOpenFilesApp } from "@/lib/deviceDownloadStore";
import { ConfirmationDialog } from "./ConfirmationDialog";

const STEPS = [
  "Öffne die Dateien-App auf deinem iPhone (oder tippe unten auf \"Dateien-App öffnen\").",
  "Wähle \"Auf meinem iPhone\" und öffne den Ordner \"Downloads\".",
  "Suche die Datei anhand des Videotitels.",
  "Wische auf der Datei nach links und tippe auf \"Löschen\", oder halte sie gedrückt und wähle \"Löschen\".",
];

interface Props {
  onForget: () => void;
  onClose: () => void;
}

/** Management sheet for an item marked "auf Gerät gespeichert" - yt-pro has
 * no way to reach or verify a file already handed off to the OS download
 * manager, so this can only offer a best-effort shortcut into Files plus
 * manual instructions, and clear its own bookkeeping entry (onForget) -
 * never the actual file. */
export function DeviceFileInstructions({ onForget, onClose }: Props) {
  const [showForgetConfirm, setShowForgetConfirm] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-file-title"
    >
      <div className="safe-area-shell w-full max-w-md rounded-t-2xl bg-white px-8 py-8 shadow-xl dark:bg-gray-900 sm:rounded-2xl">
        <h2 id="device-file-title" className="text-lg font-semibold">
          Datei auf dem iPhone löschen
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-gray-400 dark:text-gray-500">
          yt-pro kann diese Datei nicht selbst löschen - sie liegt außerhalb
          der App, in deiner Dateien-App.
        </p>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          {STEPS.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
        <button
          type="button"
          onClick={attemptOpenFilesApp}
          className="mt-6 w-full rounded-lg border border-gray-300 px-4 py-3 font-medium active:opacity-80 dark:border-gray-700"
        >
          Dateien-App öffnen (Versuch)
        </button>
        <button
          type="button"
          onClick={() => setShowForgetConfirm(true)}
          className="mt-2 w-full rounded-lg px-4 py-3 text-sm font-medium text-error active:opacity-80"
        >
          Aus dieser Liste entfernen (löscht die Datei nicht)
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-lg bg-brand px-4 py-3 font-medium text-white active:opacity-80 dark:bg-brand-dark dark:text-gray-950"
        >
          Schließen
        </button>
      </div>

      <ConfirmationDialog
        open={showForgetConfirm}
        title="Download aus der Liste entfernen?"
        description='Bist du sicher? Die Markierung "Auf Gerät gespeichert" wird entfernt - die Datei selbst bleibt unangetastet und muss ggf. separat in der Dateien-App gelöscht werden.'
        confirmLabel="Entfernen"
        destructive
        onConfirm={onForget}
        onCancel={() => setShowForgetConfirm(false)}
      />
    </div>
  );
}

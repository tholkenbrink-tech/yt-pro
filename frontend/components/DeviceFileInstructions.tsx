"use client";

import { useState } from "react";
import { attemptOpenFilesApp } from "@/lib/deviceDownloadStore";
import { BottomSheet } from "./BottomSheet";
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
    <>
      <BottomSheet open title="Datei auf dem iPhone löschen" onClose={onClose}>
        <p className="-mt-2 mb-4 text-sm leading-relaxed text-text-secondary">
          yt-pro kann diese Datei nicht selbst löschen - sie liegt außerhalb
          der App, in deiner Dateien-App.
        </p>
        <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-text-primary">
          {STEPS.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
        <button
          type="button"
          onClick={attemptOpenFilesApp}
          className="mt-6 min-h-11 w-full rounded-md border border-border px-4 py-3 text-sm font-medium"
        >
          Dateien-App öffnen (Versuch)
        </button>
        <button
          type="button"
          onClick={() => setShowForgetConfirm(true)}
          className="mt-2 min-h-11 w-full rounded-md px-4 py-3 text-sm font-medium text-error"
        >
          Aus dieser Liste entfernen (löscht die Datei nicht)
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 min-h-11 w-full rounded-md bg-accent px-4 py-3 text-sm font-semibold text-white"
        >
          Schließen
        </button>
      </BottomSheet>

      <ConfirmationDialog
        open={showForgetConfirm}
        title="Download aus der Liste entfernen?"
        description='Bist du sicher? Die Markierung "Auf Gerät gespeichert" wird entfernt - die Datei selbst bleibt unangetastet und muss ggf. separat in der Dateien-App gelöscht werden.'
        confirmLabel="Entfernen"
        destructive
        onConfirm={onForget}
        onCancel={() => setShowForgetConfirm(false)}
      />
    </>
  );
}

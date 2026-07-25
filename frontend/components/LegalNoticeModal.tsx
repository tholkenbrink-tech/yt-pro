"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "yt-pro:legal-notice-seen";

export function LegalNoticeModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) !== "1") {
      setOpen(true);
    }
  }, []);

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-overlay p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-notice-title"
    >
      <div className="safe-area-shell dialog-enter w-full max-w-md rounded-t-2xl bg-surface-elevated px-5 pb-9 pt-6 shadow-xl sm:rounded-xl sm:p-6">
        <h2 id="legal-notice-title" className="text-card-title">
          Nur für private, rechtmäßige Nutzung
        </h2>
        <div className="mt-3 space-y-3">
          <p className="text-sm leading-relaxed text-text-secondary">
            Diese App ist ausschließlich für den privaten Gebrauch bestimmt.
            Lade nur Videos herunter, die dir gehören, gemeinfrei sind, für die
            eine ausdrückliche Erlaubnis vorliegt, oder für die du die Rechte
            besitzt.
          </p>
          <p className="text-sm leading-relaxed text-text-secondary">
            Das Umgehen von DRM oder anderen Schutzmaßnahmen ist nicht gestattet
            und wird von dieser App nicht unterstützt.
          </p>
        </div>
        <button
          type="button"
          onClick={accept}
          className="mt-6 min-h-11 w-full rounded-md bg-accent px-4 py-3 text-sm font-semibold text-white active:opacity-80"
        >
          Verstanden
        </button>
      </div>
    </div>
  );
}

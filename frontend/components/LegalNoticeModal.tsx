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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-notice-title"
    >
      <div className="safe-area-shell w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl dark:bg-gray-900 sm:rounded-2xl">
        <h2 id="legal-notice-title" className="text-lg font-semibold">
          Nur für private, rechtmäßige Nutzung
        </h2>
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
          Diese App ist ausschließlich für den privaten Gebrauch bestimmt.
          Lade nur Videos herunter, die dir gehören, gemeinfrei sind, für die
          eine ausdrückliche Erlaubnis vorliegt, oder für die du die Rechte
          besitzt.
        </p>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Das Umgehen von DRM oder anderen Schutzmaßnahmen ist nicht gestattet
          und wird von dieser App nicht unterstützt.
        </p>
        <button
          type="button"
          onClick={accept}
          className="mt-5 w-full rounded-lg bg-brand px-4 py-3 font-medium text-white active:opacity-80 dark:bg-brand-dark dark:text-gray-950"
        >
          Verstanden
        </button>
      </div>
    </div>
  );
}

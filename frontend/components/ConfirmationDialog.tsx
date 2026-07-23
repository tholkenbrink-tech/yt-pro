"use client";

import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button with --color-error for destructive actions
   * (delete, cancel job) vs the regular accent color. */
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Simple focus-trapped modal for destructive-action confirmation (delete
 * from server, cancel an active job). Closable via Escape or backdrop
 * click. Not a queueing system - one dialog at a time, matching the rest
 * of the app's "single lightweight overlay" pattern. */
export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel = "Bestätigen",
  cancelLabel = "Abbrechen",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === "Tab") {
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-overlay p-4 md:items-center"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmation-dialog-title"
        aria-describedby={description ? "confirmation-dialog-description" : undefined}
        onClick={(e) => e.stopPropagation()}
        className="dialog-enter w-full max-w-sm rounded-xl bg-surface-elevated p-6 shadow-xl"
      >
        <h2 id="confirmation-dialog-title" className="text-card-title">
          {title}
        </h2>
        {description && (
          <p id="confirmation-dialog-description" className="mt-3 text-sm leading-relaxed text-text-secondary">
            {description}
          </p>
        )}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 flex-1 rounded-md border border-border px-4 py-3 text-sm font-medium"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmRef}
            disabled={busy}
            onClick={onConfirm}
            className={`min-h-11 flex-1 rounded-md px-4 py-3 text-sm font-medium text-white disabled:opacity-50 ${
              destructive ? "bg-error" : "bg-accent"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

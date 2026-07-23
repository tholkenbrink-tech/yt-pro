"use client";

import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
}

/** Shared "sheets and drawers" primitive - slides up from the bottom,
 * closable via Escape or backdrop click. FilterSheet/SortSheet-style
 * mobile pickers should render their content inside this rather than each
 * reimplementing the overlay/focus/motion plumbing. */
export function BottomSheet({ open, title, onClose, children }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    sheetRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-overlay" onClick={onClose}>
      <div
        ref={sheetRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="sheet-enter safe-area-shell max-h-[80vh] w-full overflow-y-auto rounded-t-2xl bg-surface-elevated px-6 pb-9 pt-6 outline-none"
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-pill bg-border" aria-hidden="true" />
        {title && <h2 className="mb-4 text-card-title">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

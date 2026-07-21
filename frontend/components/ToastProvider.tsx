"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

interface ToastContextValue {
  /** Shows a single lightweight confirmation message, auto-hiding after a
   * few seconds. A new call replaces whatever toast is currently visible -
   * this app only ever needs one at a time (paste confirmation, job
   * started, delete confirmation, settings saved), so a queue would be
   * over-engineering. */
  showToast: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_HIDE_MS = 3000;

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setMessage(msg);
    timeoutRef.current = setTimeout(() => setMessage(null), AUTO_HIDE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Bottom-center above the mobile bottom nav; bottom-right on desktop.
          aria-live="polite" so screen readers announce it without
          interrupting whatever the user is doing. */}
      <div
        aria-live="polite"
        role="status"
        className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4 md:inset-x-auto md:right-6 md:justify-end"
        style={{ bottom: "calc(var(--mobile-nav-height, 0px) + 1rem)" }}
      >
        {message && (
          <div
            key={message}
            className="toast-enter pointer-events-auto max-w-[calc(100vw-2rem)] rounded-pill border border-border bg-surface-elevated px-4 py-3 text-sm font-medium text-text-primary shadow-xl"
            onClick={() => setMessage(null)}
          >
            {message}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

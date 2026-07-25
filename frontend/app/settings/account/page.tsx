"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getTheme, setTheme as persistTheme } from "@/lib/theme";
import { useToast } from "@/components/ToastProvider";
import type { CookieStatus, CookieTestResult } from "@/lib/types";

type ThemeValue = "system" | "light" | "dark";

const THEME_OPTIONS: { value: ThemeValue; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Hell" },
  { value: "dark", label: "Dunkel" },
];

const COOKIE_STATUS_LABELS: Record<string, string> = {
  not_configured: "Nicht eingerichtet",
  valid: "Gültig",
  expired: "Abgelaufen",
};

export default function AccountSettingsPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [username, setUsername] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const [theme, setThemeState] = useState<ThemeValue>("system");

  const [cookieStatus, setCookieStatus] = useState<CookieStatus | null>(null);
  const [testResult, setTestResult] = useState<CookieTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cookieError, setCookieError] = useState<string | null>(null);

  useEffect(() => {
    api
      .session()
      .then((s) => setUsername(s.name))
      .catch(() => setUsername(null));
    setThemeState(getTheme());
    api
      .cookieStatus()
      .then(setCookieStatus)
      .catch(() => setCookieError("Status konnte nicht geladen werden."));
  }, []);

  const logout = async () => {
    setLoggingOut(true);
    try {
      await api.logout();
    } finally {
      router.push("/login");
    }
  };

  const changeTheme = (value: ThemeValue) => {
    setThemeState(value);
    persistTheme(value);
    showToast("Einstellung gespeichert");
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testCookies();
      setTestResult(result);
    } catch {
      setTestResult({ status: "error", message: "Verbindung konnte nicht getestet werden." });
    } finally {
      setTesting(false);
    }
  };

  const uploadCookieFile = async (file: File) => {
    setUploading(true);
    setCookieError(null);
    try {
      const status = await api.uploadCookies(file);
      setCookieStatus(status);
    } catch {
      setCookieError("Cookie-Datei konnte nicht hochgeladen werden.");
    } finally {
      setUploading(false);
    }
  };

  const removeCookieFile = async () => {
    setUploading(true);
    try {
      const status = await api.deleteCookies();
      setCookieStatus(status);
    } finally {
      setUploading(false);
    }
  };

  const initial = username ? username.charAt(0).toUpperCase() : "?";

  return (
    <main className="mx-auto max-w-lg px-4 pb-4 pt-6">
      <h1 className="mb-4 text-page-title">Konto</h1>

      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-bold text-white">
          {initial}
        </div>
        <div>
          <p className="text-[15px] font-bold text-text-primary">{username ?? "-"}</p>
          <p className="text-meta text-text-muted">Lokales Konto</p>
        </div>
      </div>

      {/* Kein Passwort-Änderungs-Endpunkt im Backend vorhanden - dieser
          Abschnitt wird bewusst weggelassen, statt eine neue API zu erfinden. */}

      <p className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wide text-text-muted">Design</p>
      <div className="mb-5 flex gap-1.5 rounded-2xl bg-surface-elevated p-1" role="radiogroup" aria-label="Design wählen">
        {THEME_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={theme === opt.value}
            onClick={() => changeTheme(opt.value)}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium ${
              theme === opt.value ? "bg-accent font-semibold text-white" : "text-text-secondary"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <p className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
        YouTube-Zugang
      </p>
      <div className="mb-5 rounded-2xl border border-border bg-surface p-3.5">
        {cookieError && <p className="mb-2 text-sm text-error">{cookieError}</p>}
        {cookieStatus && (
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-sm text-text-primary">Status</span>
            <span
              className={`rounded-pill px-2 py-0.5 text-xs font-medium ${
                cookieStatus.status === "valid"
                  ? "bg-success/15 text-success"
                  : "bg-text-muted/15 text-text-secondary"
              }`}
            >
              {COOKIE_STATUS_LABELS[cookieStatus.status] ?? cookieStatus.status}
            </span>
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={testing}
            onClick={testConnection}
            className="flex-1 rounded-xl border border-border py-2 text-[12.5px] font-medium text-text-secondary disabled:opacity-50"
          >
            {testing ? "Wird getestet..." : "Testen"}
          </button>
          <label className="flex flex-1 cursor-pointer items-center justify-center rounded-xl border border-border py-2 text-[12.5px] font-medium text-text-secondary">
            Cookie importieren
            <input
              type="file"
              accept=".txt"
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadCookieFile(file);
              }}
            />
          </label>
        </div>
        <button
          type="button"
          disabled={uploading}
          onClick={removeCookieFile}
          className="mt-2 w-full text-center text-xs font-medium text-error disabled:opacity-50"
        >
          Cookie-Datei entfernen
        </button>
        {testResult && (
          <p
            role="status"
            aria-live="polite"
            className={`mt-2 text-sm ${testResult.status === "valid" ? "text-success" : "text-error"}`}
          >
            {testResult.message}
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="flex min-h-[46px] items-center justify-between border-b border-border px-3.5">
          <span className="text-sm font-medium text-text-primary">Worker/Scheduler-Status</span>
          <span className="text-xs text-text-muted">n/v</span>
        </div>
        <div className="flex min-h-[46px] items-center justify-between border-b border-border px-3.5">
          <span className="text-sm font-medium text-text-primary">yt-dlp/ffmpeg-Version</span>
          <span className="text-xs text-text-muted">n/v</span>
        </div>
        <button
          type="button"
          disabled={loggingOut}
          onClick={logout}
          className="flex min-h-[46px] w-full items-center justify-between px-3.5 text-left text-sm font-medium text-error disabled:opacity-50"
        >
          Abmelden
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </main>
  );
}

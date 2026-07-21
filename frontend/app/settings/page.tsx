"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { CookieStatus, CookieTestResult } from "@/lib/types";
import { getTheme, setTheme as persistTheme } from "@/lib/theme";

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

export default function SettingsPage() {
  const [theme, setThemeState] = useState<ThemeValue>("system");
  const [cookieStatus, setCookieStatus] = useState<CookieStatus | null>(null);
  const [testResult, setTestResult] = useState<CookieTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cookieError, setCookieError] = useState<string | null>(null);

  useEffect(() => {
    setThemeState(getTheme());
    api
      .cookieStatus()
      .then(setCookieStatus)
      .catch(() => setCookieError("Status konnte nicht geladen werden."));
  }, []);

  const changeTheme = (value: ThemeValue) => {
    setThemeState(value);
    persistTheme(value);
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

  return (
    <main className="mx-auto max-w-lg px-4 pb-4 pt-6">
      <h1 className="mb-4 text-page-title">Einstellungen</h1>

      <ul className="mb-6 space-y-2">
        {[
          { href: "/settings/download", label: "Download" },
          { href: "/settings/player", label: "Player" },
          { href: "/settings/sources", label: "Automatische Quellen" },
          { href: "/settings/storage", label: "Speicher" },
          { href: "/settings/account", label: "Konto" },
        ].map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="flex min-h-11 items-center justify-between rounded-md border border-border p-3 text-sm font-medium"
            >
              {item.label}
              <span aria-hidden="true">›</span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="mb-6">
        <h2 className="mb-2 text-section-title">Design</h2>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Design wählen">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={theme === opt.value}
              onClick={() => changeTheme(opt.value)}
              className={`min-h-11 rounded-pill border px-4 py-2 text-sm font-medium ${
                theme === opt.value
                  ? "border-accent bg-accent text-white"
                  : "border-border text-text-secondary"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-section-title">YouTube-Zugang</h2>
        {cookieError && <p className="mb-2 text-sm text-error">{cookieError}</p>}
        {cookieStatus && (
          <p className="mb-2 text-sm text-text-secondary">
            Status: {COOKIE_STATUS_LABELS[cookieStatus.status] ?? cookieStatus.status}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={testing}
            onClick={testConnection}
            className="min-h-11 rounded-md border border-border px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {testing ? "Wird getestet..." : "Verbindung testen"}
          </button>
          <label className="flex min-h-11 cursor-pointer items-center rounded-md border border-border px-3 py-2 text-sm font-medium">
            Cookie-Datei importieren
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
          <button
            type="button"
            disabled={uploading}
            onClick={removeCookieFile}
            className="min-h-11 rounded-md border border-error/40 px-3 py-2 text-sm font-medium text-error disabled:opacity-50"
          >
            Entfernen
          </button>
        </div>
        {testResult && (
          <p
            role="status"
            aria-live="polite"
            className={`mt-2 text-sm ${testResult.status === "valid" ? "text-success" : "text-error"}`}
          >
            {testResult.message}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-section-title">Erweitert</h2>
        <p className="text-meta text-text-muted">
          Worker/Scheduler-Status: nicht verfügbar (kein Backend-Endpunkt).
        </p>
        <p className="text-meta text-text-muted">
          yt-dlp/ffmpeg-Version: nicht verfügbar (kein Backend-Endpunkt).
        </p>
      </section>
    </main>
  );
}

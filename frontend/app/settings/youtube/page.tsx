"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { CookieStatus, CookieTestResult } from "@/lib/types";

const COOKIE_STATUS_LABELS: Record<string, string> = {
  not_configured: "Nicht eingerichtet",
  valid: "Gültig",
  expired: "Abgelaufen",
};

export default function YoutubeAccessSettingsPage() {
  const [cookieStatus, setCookieStatus] = useState<CookieStatus | null>(null);
  const [testResult, setTestResult] = useState<CookieTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cookieError, setCookieError] = useState<string | null>(null);

  useEffect(() => {
    api
      .cookieStatus()
      .then(setCookieStatus)
      .catch(() => setCookieError("Status konnte nicht geladen werden."));
  }, []);

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
      <h1 className="mb-4 text-page-title">YouTube-Zugang</h1>

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
    </main>
  );
}

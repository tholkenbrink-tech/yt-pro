"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import {
  savePendingAnalysis,
  getLastQuality,
  getDraftText,
  setDraftText,
  clearDraftText,
} from "@/lib/analysisStore";
import { getDownloadSettings } from "@/lib/localSettings";
import { toAnalysisResult } from "@/lib/analyzeTransform";
import { LegalNoticeModal } from "@/components/LegalNoticeModal";
import { ActiveJobsList } from "@/components/ActiveJobsList";
import { QualitySelector } from "@/components/QualitySelector";
import { QuickAccessBar } from "@/components/QuickAccessBar";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/ToastProvider";

// Mirrors the profile names seeded on the backend (backend/app/services/profiles_seed.py)
// and the choices offered in Settings -> Download - there's no "list profiles"
// endpoint to fetch this from, so it's kept as a static list like that page.
const QUALITY_OPTIONS = [
  { name: "original", label: "Original" },
  { name: "1080p", label: "1080p" },
  { name: "720p", label: "720p" },
  { name: "480p", label: "480p" },
];

export default function DownloadPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQuality, setLastQualityState] = useState<string | null>(null);
  const [quality, setQuality] = useState("720p");
  const { showToast } = useToast();

  useEffect(() => {
    setLastQualityState(getLastQuality());
    setQuality(getDownloadSettings().defaultQuality);
    setText(getDraftText());
  }, []);

  const updateText = (value: string) => {
    setText(value);
    setDraftText(value);
  };

  const pasteFromClipboard = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (clipboardText) {
        updateText(text ? `${text}\n${clipboardText}` : clipboardText);
        showToast("Link eingefügt");
      }
    } catch {
      // Clipboard access can be unavailable (permission denied, insecure
      // context, unsupported browser) - fail gracefully without a
      // technical error, per the design brief's "smart paste" guidance.
    }
  };

  const analyze = async () => {
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      setError("Bitte mindestens einen Link einfügen.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = lines.length === 1 ? { url: lines[0] } : { urls: lines };
      const raw = await api.analyze(payload);
      const result = toAnalysisResult(raw);
      savePendingAnalysis(result, lines[0], quality);
      clearDraftText();
      router.push("/download/preview");
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        // Backend's InvalidUrlError/PlaylistTooLargeError both surface as
        // 400 - this is the "link not supported" case from the design brief.
        setError("Dieser Link wird nicht unterstützt. Bitte füge einen gültigen YouTube-, ARD- oder ZDF-Link ein.");
      } else if (e instanceof ApiError) {
        // yt-dlp itself failed to analyze the URL (502) - the video is most
        // likely gone, private, or region-locked rather than a client bug.
        setError(
          "Video nicht verfügbar. Das Video wurde möglicherweise entfernt, ist privat oder kann in deiner Region nicht geladen werden."
        );
      } else {
        setError("Netzwerkfehler bei der Analyse.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-lg pb-4 pt-6">
      <LegalNoticeModal />
      <h1 className="mb-4 px-4 text-page-title">yt-pro</h1>

      <div className="mx-4 mb-3">
        <label htmlFor="url-input" className="mb-1 block text-sm font-medium">
          Video- oder Playlist-Link(s)
        </label>
        <textarea
          id="url-input"
          value={text}
          onChange={(e) => updateText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              analyze();
            }
          }}
          rows={4}
          placeholder={"https://youtube.com/watch?v=... oder ARD/ZDF Mediathek-Link\n(mehrere Links = je eine Zeile, Umschalt+Enter für neue Zeile)"}
          className="w-full rounded-md border border-border bg-surface p-3 text-base text-text-primary"
        />
      </div>

      <div className="mx-4 mb-3 flex gap-2">
        <button
          type="button"
          onClick={pasteFromClipboard}
          className="min-h-11 flex-1 rounded-md border border-border px-4 py-3 font-medium"
        >
          Link einfügen
        </button>
        <button
          type="button"
          onClick={analyze}
          disabled={loading}
          className="min-h-11 flex-1 rounded-md bg-accent px-4 py-3 font-medium text-white disabled:opacity-50"
        >
          {loading ? "Analysiere..." : "Analysieren"}
        </button>
      </div>

      {/* Alternative way to fill the box above - pick a saved link instead
          of pasting one, so it sits right next to "Link einfügen". */}
      <QuickAccessBar onPick={updateText} />

      <div className="mx-4 mb-3">
        <h3 className="mb-2 text-sm font-semibold">Qualität</h3>
        <QualitySelector qualities={QUALITY_OPTIONS} selected={quality} onSelect={setQuality} />
      </div>

      {lastQuality && !loading && (
        <p className="mx-4 mb-3 text-meta text-text-muted">
          Zuletzt verwendete Qualität: {lastQuality}
        </p>
      )}

      {error && <p className="mx-4 mb-3 text-sm text-error">{error}</p>}

      {loading && (
        <div className="mx-4 mb-3 rounded-md border border-border bg-surface p-3" aria-hidden="true">
          <p className="mb-2 text-sm font-medium text-text-secondary">Video wird analysiert</p>
          <div className="flex items-start gap-3">
            <Skeleton className="h-[63px] w-28 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          </div>
        </div>
      )}

      <ActiveJobsList />
    </main>
  );
}

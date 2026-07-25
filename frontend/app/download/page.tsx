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
  setLastSubmittedLink,
} from "@/lib/analysisStore";
import { getDownloadSettings } from "@/lib/localSettings";
import { toAnalysisResult } from "@/lib/analyzeTransform";
import Image from "next/image";
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
    setLastSubmittedLink(text);
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
      <div className="mb-4 flex items-center gap-2 px-4">
        <Image src="/apple-touch-icon.png" alt="" width={26} height={26} className="rounded-lg" unoptimized />
        <h1 className="text-page-title">yt-pro</h1>
      </div>

      <div className="mx-4 mb-3.5 rounded-[20px] border border-border bg-surface p-3.5">
        <label
          htmlFor="url-input"
          className="mb-2 block text-[12.5px] font-semibold uppercase tracking-wide text-text-muted"
        >
          Video- oder Playlist-Link(s)
        </label>
        <div className="relative">
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
            rows={2}
            placeholder={"https://youtube.com/watch?v=... oder ARD/ZDF Mediathek-Link\n(mehrere Links = je eine Zeile, Umschalt+Enter für neue Zeile)"}
            className="w-full resize-none border-0 bg-transparent pr-8 text-base text-text-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={pasteFromClipboard}
            aria-label="Link aus Zwischenablage einfügen"
            className="absolute right-0 top-0 text-lg text-accent"
          >
            📋
          </button>
        </div>
        <button
          type="button"
          onClick={analyze}
          disabled={loading}
          className="mt-2.5 min-h-[46px] w-full rounded-2xl bg-accent px-4 font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Analysiere..." : "Analysieren"}
        </button>
      </div>

      {/* Alternative way to fill the box above - pick a saved link instead
          of pasting one, so it sits right next to "Analysieren". */}
      <QuickAccessBar onPick={updateText} />

      <div className="mx-4 mb-4">
        <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-text-muted">Qualität</h3>
        <QualitySelector qualities={QUALITY_OPTIONS} selected={quality} onSelect={setQuality} />
      </div>

      {lastQuality && !loading && (
        <p className="mx-4 mb-3 text-meta text-text-muted">
          Zuletzt verwendete Qualität: {lastQuality}
        </p>
      )}

      {error && <p className="mx-4 mb-3 text-sm text-error">{error}</p>}

      {loading && (
        <div className="mx-4 mb-3 rounded-2xl border border-border bg-surface p-3" aria-hidden="true">
          <p className="mb-2 text-sm font-medium text-text-secondary">Video wird analysiert</p>
          <div className="flex items-start gap-3">
            <Skeleton className="h-[63px] w-28 shrink-0 rounded-xl" />
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

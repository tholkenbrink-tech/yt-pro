"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import {
  savePendingAnalysis,
  loadPendingAnalysis,
  clearPendingAnalysis,
  updatePendingSelection,
  getLastQuality,
  setLastQuality,
  getDraftText,
  setDraftText,
  clearDraftText,
  setLastSubmittedLink,
} from "@/lib/analysisStore";
import { getDownloadSettings } from "@/lib/localSettings";
import { toAnalysisResult } from "@/lib/analyzeTransform";
import type { AnalysisResult } from "@/lib/types";
import Image from "next/image";
import { LegalNoticeModal } from "@/components/LegalNoticeModal";
import { ActiveJobsList } from "@/components/ActiveJobsList";
import { QualitySelector } from "@/components/QualitySelector";
import { QuickAccessBar } from "@/components/QuickAccessBar";
import { PlaylistItemList } from "@/components/PlaylistItemList";
import { Switch } from "@/components/Switch";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/ToastProvider";
import { formatBytes, formatDate, formatDuration } from "@/lib/format";

// Mirrors the profile names seeded on the backend (backend/app/services/profiles_seed.py)
// and the choices offered in Settings -> Download - there's no "list profiles"
// endpoint to fetch this from, so it's kept as a static list like that page.
const QUALITY_OPTIONS = [
  { name: "original", label: "Original" },
  { name: "480p", label: "480p" },
  { name: "720p", label: "720p" },
  { name: "1080p", label: "1080p" },
];

export default function DownloadPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQuality, setLastQualityState] = useState<string | null>(null);
  const [quality, setQuality] = useState("720p");
  const [resuming, setResuming] = useState(true);
  const { showToast } = useToast();

  // Analysed result stays inline on this page instead of navigating to a
  // second screen, and survives tab switches via sessionStorage (see
  // lib/analysisStore) until explicitly cleared or a download is started.
  const [analysis, setAnalysis] = useState<{ result: AnalysisResult; sourceUrl: string } | null>(null);
  const [hideAlreadyDownloaded, setHideAlreadyDownloaded] = useState(false);
  // Selection is tracked by array index, not youtubeId - a playlist can
  // legitimately contain the same video twice, which would collapse two
  // distinct entries into one Set member if keyed by id (breaking both
  // per-item selection and "Alle auswählen").
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const pending = loadPendingAnalysis();
    if (pending) {
      setAnalysis(pending);
      setText(pending.sourceUrl);
      if (pending.result.kind === "playlist") {
        setSelectedIds(
          pending.selectedIndices
            ? new Set(pending.selectedIndices)
            : new Set(
                pending.result.items.reduce<number[]>((acc, item, idx) => {
                  if (item.selected) acc.push(idx);
                  return acc;
                }, [])
              )
        );
      }
    } else {
      setText(getDraftText());
    }
    setLastQualityState(getLastQuality());
    setQuality(getDownloadSettings().defaultQuality);
    setResuming(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateText = (value: string) => {
    setText(value);
    setDraftText(value);
  };

  const clearUrl = () => {
    updateText("");
    clearDraftText();
    clearPendingAnalysis();
    setAnalysis(null);
    setSelectedIds(new Set());
    setHideAlreadyDownloaded(false);
    setError(null);
    setSubmitError(null);
  };

  const pasteFromClipboard = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (clipboardText) {
        updateText(clipboardText);
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
      setAnalysis({ result, sourceUrl: lines[0] });
      setSelectedIds(
        result.kind === "playlist"
          ? new Set(
              result.items.reduce<number[]>((acc, item, idx) => {
                if (item.selected) acc.push(idx);
                return acc;
              }, [])
            )
          : new Set()
      );
      setHideAlreadyDownloaded(false);
      setSubmitError(null);
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

  const toggleItem = (index: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      updatePendingSelection(Array.from(next));
      return next;
    });
  };

  const selectAll = () => {
    if (!analysis || analysis.result.kind !== "playlist") return;
    const next = new Set(analysis.result.items.map((_, idx) => idx));
    setSelectedIds(next);
    updatePendingSelection(Array.from(next));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
    updatePendingSelection([]);
  };

  // No size-estimation exists in the analyze pipeline (would need a
  // per-format probe) - estimatedTotalSize is genuinely unknown for now,
  // undefined renders as "-" via formatBytes rather than a misleading "0 B".
  const estimatedSelectedSize = useMemo(() => {
    if (!analysis || analysis.result.kind !== "playlist") return undefined;
    const { itemCount, estimatedTotalSize } = analysis.result;
    if (itemCount <= 0 || estimatedTotalSize === undefined) return undefined;
    return (estimatedTotalSize / itemCount) * selectedIds.size;
  }, [analysis, selectedIds]);

  const startDownload = async () => {
    if (!analysis) return;
    const { result, sourceUrl } = analysis;
    setSubmitting(true);
    setSubmitError(null);
    try {
      setLastQuality(quality);
      const selectedItems = result.kind === "playlist" ? result.items.filter((_, idx) => selectedIds.has(idx)) : [];
      const payload =
        result.kind === "playlist"
          ? {
              url: sourceUrl,
              selectedQuality: quality,
              playlistTitle: result.playlistTitle,
              itemIds: selectedItems.map((item) => item.youtubeId),
              items: selectedItems.map((item) => ({
                youtubeId: item.youtubeId,
                title: item.title,
                thumbnailPath: item.thumbnail,
                duration: item.duration,
              })),
            }
          : {
              url: sourceUrl,
              selectedQuality: quality,
              title: result.title,
              channelName: result.channelName,
              thumbnailPath: result.thumbnail,
            };
      const { jobId } = await api.createJob(payload);
      clearPendingAnalysis();
      clearUrl();
      showToast("Download gestartet");
      router.push(`/activity/${jobId}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const body = e.body as { existingJobId?: string } | undefined;
        if (body?.existingJobId) {
          clearPendingAnalysis();
          clearUrl();
          router.push(`/activity/${body.existingJobId}`);
          return;
        }
      }
      setSubmitError("Download konnte nicht gestartet werden.");
    } finally {
      setSubmitting(false);
    }
  };

  const allSelected =
    analysis?.result.kind === "playlist" && selectedIds.size === analysis.result.items.length;

  if (resuming) return null;

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
            className="w-full resize-none border-0 bg-transparent pr-14 text-base text-text-primary focus:outline-none"
          />
          <div className="absolute right-0 top-0 flex items-center gap-2">
            {text && (
              <button
                type="button"
                onClick={clearUrl}
                aria-label="Link entfernen"
                className="text-lg text-text-muted"
              >
                ✕
              </button>
            )}
            <button
              type="button"
              onClick={pasteFromClipboard}
              aria-label="Link aus Zwischenablage einfügen"
              className="text-lg text-accent"
            >
              📋
            </button>
          </div>
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

      {analysis && (
        <div className="mx-4 mb-4 rounded-2xl border border-border bg-surface p-3.5">
          {analysis.result.kind === "single" ? (
            <>
              <div className="flex items-start gap-3">
                <Image
                  src={analysis.result.thumbnail}
                  alt=""
                  width={128}
                  height={72}
                  unoptimized
                  className="h-[72px] w-32 shrink-0 rounded-xl object-cover"
                />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-card-title">{analysis.result.title}</h2>
                  <p className="text-sm text-text-secondary">
                    {analysis.result.channelName} - {formatDuration(analysis.result.duration)} -{" "}
                    {formatDate(analysis.result.uploadDate)}
                  </p>
                  {analysis.result.alreadyDownloaded && (
                    <p className="mt-1 text-sm text-text-muted">Bereits im Archiv vorhanden.</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <Image
                  src={analysis.result.thumbnail}
                  alt=""
                  width={128}
                  height={72}
                  unoptimized
                  className="h-[72px] w-32 shrink-0 rounded-xl object-cover"
                />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-card-title">{analysis.result.playlistTitle}</h2>
                  <p className="text-sm text-text-secondary">
                    {analysis.result.itemCount} Videos - {formatDuration(analysis.result.totalDuration)} gesamt -{" "}
                    {formatBytes(analysis.result.estimatedTotalSize)} geschätzt
                  </p>
                </div>
              </div>

              <div className="mb-2 mt-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Videos auswählen</h3>
                <button
                  type="button"
                  onClick={allSelected ? deselectAll : selectAll}
                  className="min-h-11 rounded-xl px-2 text-sm font-medium text-accent"
                >
                  {allSelected ? "Alle abwählen" : "Alle auswählen"}
                </button>
              </div>
              {analysis.result.items.some((i) => i.alreadyDownloaded) && (
                <div className="mb-2 flex items-center justify-between text-sm text-text-secondary">
                  <span>Bereits heruntergeladene ausblenden</span>
                  <Switch checked={hideAlreadyDownloaded} onChange={setHideAlreadyDownloaded} label="Bereits heruntergeladene ausblenden" />
                </div>
              )}
              <PlaylistItemList
                items={analysis.result.items}
                selectedIds={selectedIds}
                onToggle={toggleItem}
                hideAlreadyDownloaded={hideAlreadyDownloaded}
              />
            </>
          )}

          {submitError && <p className="mt-3 text-sm text-error">{submitError}</p>}

          {analysis.result.kind === "playlist" && (
            <div className="mb-2 mt-4 flex items-center justify-between text-sm text-text-secondary">
              <span>{selectedIds.size} von {analysis.result.items.length} ausgewählt</span>
              <span>{formatBytes(estimatedSelectedSize)} geschätzt</span>
            </div>
          )}
          <button
            type="button"
            onClick={startDownload}
            disabled={submitting || (analysis.result.kind === "playlist" && selectedIds.size === 0)}
            className="mt-2 min-h-11 w-full rounded-2xl bg-accent px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {submitting
              ? "Wird gestartet..."
              : analysis.result.kind === "playlist"
                ? `${selectedIds.size} Video${selectedIds.size === 1 ? "" : "s"} auf NAS speichern`
                : "Auf NAS speichern"}
          </button>
        </div>
      )}

      <ActiveJobsList />
    </main>
  );
}

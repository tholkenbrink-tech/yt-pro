"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { api, ApiError } from "@/lib/api";
import {
  loadPendingAnalysis,
  clearPendingAnalysis,
  getLastQuality,
  setLastQuality,
  updatePendingSelection,
} from "@/lib/analysisStore";
import { getDownloadSettings } from "@/lib/localSettings";
import type { AnalysisResult } from "@/lib/types";
import { QualitySelector } from "@/components/QualitySelector";
import { PlaylistItemList } from "@/components/PlaylistItemList";
import { BottomActionBar } from "@/components/BottomActionBar";
import { useToast } from "@/components/ToastProvider";
import { formatBytes, formatDate, formatDuration } from "@/lib/format";

const DEFAULT_QUALITY = "720p";
const PLAYLIST_ITEM_WARNING_THRESHOLD = 20;
const PLAYLIST_DURATION_WARNING_THRESHOLD = 2 * 60 * 60;

export default function DownloadPreviewPage() {
  const router = useRouter();
  const [data, setData] = useState<{
    result: AnalysisResult;
    sourceUrl: string;
  } | null>(null);
  const [quality, setQuality] = useState(DEFAULT_QUALITY);
  const [hideAlreadyDownloaded, setHideAlreadyDownloaded] = useState(false);
  // Selection is tracked by array index, not youtubeId - a playlist can
  // legitimately contain the same video twice, which would collapse two
  // distinct entries into one Set member if keyed by id (breaking both
  // per-item selection and "Alle auswählen").
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    const pending = loadPendingAnalysis();
    if (!pending) {
      router.replace("/download");
      return;
    }
    setData(pending);
    if (pending.result.kind === "playlist") {
      // Restore a previous in-progress selection (e.g. user navigated back
      // to step 1 and forward again) if we have one, otherwise fall back to
      // the analyze-time defaults.
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
    const available = pending.result.availableQualities;
    const settings = getDownloadSettings();
    const lastQ = getLastQuality();
    // Priority: explicit choice made on step 1 > remembered last selection
    // (if enabled in settings) > the Settings -> Download default > the
    // hardcoded fallback already set above.
    const candidates = [
      pending.preferredQuality,
      settings.rememberLastSelection ? lastQ : null,
      settings.defaultQuality,
    ];
    const match = candidates.find((c) => c && available.some((q) => q.name === c));
    if (match) setQuality(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (!data || data.result.kind !== "playlist") return;
    const next = new Set(data.result.items.map((_, idx) => idx));
    setSelectedIds(next);
    updatePendingSelection(Array.from(next));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
    updatePendingSelection([]);
  };

  const showPlaylistWarning = useMemo(() => {
    if (!data || data.result.kind !== "playlist") return false;
    return (
      data.result.itemCount > PLAYLIST_ITEM_WARNING_THRESHOLD ||
      data.result.totalDuration > PLAYLIST_DURATION_WARNING_THRESHOLD
    );
  }, [data]);

  // No size-estimation exists in the analyze pipeline (would need a
  // per-format probe) - estimatedTotalSize is genuinely unknown for now,
  // undefined renders as "-" via formatBytes rather than a misleading "0 B".
  const estimatedSelectedSize = useMemo(() => {
    if (!data || data.result.kind !== "playlist") return undefined;
    const { itemCount, estimatedTotalSize } = data.result;
    if (itemCount <= 0 || estimatedTotalSize === undefined) return undefined;
    return (estimatedTotalSize / itemCount) * selectedIds.size;
  }, [data, selectedIds]);

  if (!data) return null;
  const { result, sourceUrl } = data;

  const startPreparation = async () => {
    setSubmitting(true);
    setError(null);
    try {
      setLastQuality(quality);
      const selectedItems = result.kind === "playlist"
        ? result.items.filter((_, idx) => selectedIds.has(idx))
        : [];
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
      showToast("Download gestartet");
      router.push(`/activity/${jobId}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const body = e.body as { existingJobId?: string } | undefined;
        if (body?.existingJobId) {
          clearPendingAnalysis();
          router.push(`/activity/${body.existingJobId}`);
          return;
        }
      }
      setError("Vorbereitung konnte nicht gestartet werden.");
    } finally {
      setSubmitting(false);
    }
  };

  const allSelected = result.kind === "playlist" && selectedIds.size === result.items.length;

  return (
    <>
      <main className="mx-auto max-w-lg px-4 pb-32 pt-6">
        {result.kind === "single" ? (
          <>
            <h1 className="mb-4 text-section-title">Video-Vorschau</h1>
            <Image
              src={result.thumbnail}
              alt=""
              width={640}
              height={360}
              unoptimized
              className="w-full rounded-md object-cover"
            />
            <h2 className="mt-3 text-card-title">{result.title}</h2>
            <p className="text-sm text-text-secondary">
              {result.channelName} - {formatDuration(result.duration)} -{" "}
              {formatDate(result.uploadDate)}
            </p>
            {result.alreadyDownloaded && (
              <p className="mt-1 text-sm text-text-muted">Bereits im Archiv vorhanden.</p>
            )}

            <h3 className="mb-2 mt-4 text-sm font-semibold">Qualität</h3>
            <QualitySelector
              qualities={result.availableQualities}
              selected={quality}
              onSelect={setQuality}
            />
          </>
        ) : (
          <>
            <h1 className="mb-4 text-section-title">Playlist-Vorschau</h1>
            <Image
              src={result.thumbnail}
              alt=""
              width={640}
              height={360}
              unoptimized
              className="w-full rounded-md object-cover"
            />
            <h2 className="mt-3 text-card-title">{result.playlistTitle}</h2>
            <p className="text-sm text-text-secondary">
              {result.itemCount} Videos - {formatDuration(result.totalDuration)} gesamt -{" "}
              {formatBytes(result.estimatedTotalSize)} geschätzt
            </p>

            {showPlaylistWarning && (
              <p className="mt-3 rounded-md bg-warning/10 p-3 text-sm text-warning">
                Diese Playlist ist groß. Das Herunterladen aller Videos kann
                lange dauern und viel Speicherplatz belegen.
              </p>
            )}

            <h3 className="mb-2 mt-4 text-sm font-semibold">Qualität</h3>
            <QualitySelector
              qualities={result.availableQualities}
              selected={quality}
              onSelect={setQuality}
            />

            <div className="mb-2 mt-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Videos auswählen</h3>
              <button
                type="button"
                onClick={allSelected ? deselectAll : selectAll}
                className="min-h-11 rounded-md px-2 text-sm font-medium text-accent"
              >
                {allSelected ? "Alle abwählen" : "Alle auswählen"}
              </button>
            </div>
            {result.items.some((i) => i.alreadyDownloaded) && (
              <label className="mb-2 flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={hideAlreadyDownloaded}
                  onChange={(e) => setHideAlreadyDownloaded(e.target.checked)}
                  className="h-4 w-4 accent-brand dark:accent-brand-dark"
                />
                Bereits heruntergeladene ausblenden
              </label>
            )}
            <PlaylistItemList
              items={result.items}
              selectedIds={selectedIds}
              onToggle={toggleItem}
              hideAlreadyDownloaded={hideAlreadyDownloaded}
            />
          </>
        )}

        {error && <p className="mt-3 text-sm text-error">{error}</p>}
      </main>

      <BottomActionBar>
        {result.kind === "playlist" && (
          <div className="mb-2 flex items-center justify-between text-sm text-text-secondary">
            <span>{selectedIds.size} von {result.items.length} ausgewählt</span>
            <span>{formatBytes(estimatedSelectedSize)} geschätzt</span>
          </div>
        )}
        <button
          type="button"
          onClick={startPreparation}
          disabled={submitting || (result.kind === "playlist" && selectedIds.size === 0)}
          className="min-h-11 w-full rounded-md bg-accent px-4 py-3 font-medium text-white disabled:opacity-50"
        >
          {submitting
            ? "Wird gestartet..."
            : result.kind === "playlist"
              ? `${selectedIds.size} Video${selectedIds.size === 1 ? "" : "s"} vorbereiten`
              : "Download auf NAS"}
        </button>
      </BottomActionBar>
    </>
  );
}

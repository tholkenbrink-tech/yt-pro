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
} from "@/lib/analysisStore";
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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
      setSelectedIds(
        new Set(pending.result.items.filter((i) => i.selected).map((i) => i.youtubeId))
      );
    }
    const lastQ = getLastQuality();
    if (
      pending.result.kind === "single" &&
      lastQ &&
      pending.result.availableQualities.some((q) => q.name === lastQ)
    ) {
      setQuality(lastQ);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleItem = (youtubeId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(youtubeId)) next.delete(youtubeId);
      else next.add(youtubeId);
      return next;
    });
  };

  const selectAll = () => {
    if (!data || data.result.kind !== "playlist") return;
    setSelectedIds(new Set(data.result.items.map((i) => i.youtubeId)));
  };

  const deselectAll = () => setSelectedIds(new Set());

  const showPlaylistWarning = useMemo(() => {
    if (!data || data.result.kind !== "playlist") return false;
    return (
      data.result.itemCount > PLAYLIST_ITEM_WARNING_THRESHOLD ||
      data.result.totalDuration > PLAYLIST_DURATION_WARNING_THRESHOLD
    );
  }, [data]);

  // No per-item size is returned by the analyze endpoint for playlists (only
  // the overall estimatedTotalSize) - approximating an even split across
  // items rather than inventing a new API call, per the design brief's
  // request to reuse data the backend already provides.
  const estimatedSelectedSize = useMemo(() => {
    if (!data || data.result.kind !== "playlist") return 0;
    const { itemCount, estimatedTotalSize } = data.result;
    if (itemCount <= 0) return 0;
    return (estimatedTotalSize / itemCount) * selectedIds.size;
  }, [data, selectedIds]);

  if (!data) return null;
  const { result, sourceUrl } = data;

  const startPreparation = async () => {
    setSubmitting(true);
    setError(null);
    try {
      setLastQuality(quality);
      const payload =
        result.kind === "playlist"
          ? {
              sourceUrl,
              selectedQuality: quality,
              itemIds: Array.from(selectedIds),
            }
          : { sourceUrl, selectedQuality: quality };
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
            <PlaylistItemList
              items={result.items}
              selectedIds={selectedIds}
              onToggle={toggleItem}
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
              : "Download vorbereiten"}
        </button>
      </BottomActionBar>
    </>
  );
}

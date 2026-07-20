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
import { formatBytes, formatDate, formatDuration } from "@/lib/format";

const DEFAULT_QUALITY = "720p";
const PLAYLIST_ITEM_WARNING_THRESHOLD = 20;
const PLAYLIST_DURATION_WARNING_THRESHOLD = 2 * 60 * 60;

export default function AnalyzePage() {
  const router = useRouter();
  const [data, setData] = useState<{
    result: AnalysisResult;
    sourceUrl: string;
  } | null>(null);
  const [quality, setQuality] = useState(DEFAULT_QUALITY);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const pending = loadPendingAnalysis();
    if (!pending) {
      router.replace("/");
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

  const showPlaylistWarning = useMemo(() => {
    if (!data || data.result.kind !== "playlist") return false;
    return (
      data.result.itemCount > PLAYLIST_ITEM_WARNING_THRESHOLD ||
      data.result.totalDuration > PLAYLIST_DURATION_WARNING_THRESHOLD
    );
  }, [data]);

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
      router.push(`/jobs/${jobId}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const body = e.body as { existingJobId?: string } | undefined;
        if (body?.existingJobId) {
          clearPendingAnalysis();
          router.push(`/jobs/${body.existingJobId}`);
          return;
        }
      }
      setError("Vorbereitung konnte nicht gestartet werden.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-lg px-4 pb-4 pt-6">
      {result.kind === "single" ? (
        <>
          <h1 className="mb-4 text-xl font-bold">Video-Vorschau</h1>
          <Image
            src={result.thumbnail}
            alt=""
            width={640}
            height={360}
            unoptimized
            className="w-full rounded-lg object-cover"
          />
          <h2 className="mt-3 text-lg font-semibold">{result.title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
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
          <h1 className="mb-4 text-xl font-bold">Playlist-Vorschau</h1>
          <Image
            src={result.thumbnail}
            alt=""
            width={640}
            height={360}
            unoptimized
            className="w-full rounded-lg object-cover"
          />
          <h2 className="mt-3 text-lg font-semibold">{result.playlistTitle}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {result.itemCount} Videos - {formatDuration(result.totalDuration)} gesamt -{" "}
            {formatBytes(result.estimatedTotalSize)} geschätzt
          </p>

          {showPlaylistWarning && (
            <p className="mt-3 rounded-lg bg-amber-100 p-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              Diese Playlist ist groß. Das Herunterladen aller Videos kann
              lange dauern und viel Speicherplatz belegen.
            </p>
          )}

          <h3 className="mb-2 mt-4 text-sm font-semibold">Videos auswählen</h3>
          <PlaylistItemList
            items={result.items}
            selectedIds={selectedIds}
            onToggle={toggleItem}
          />
        </>
      )}

      {error && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <button
        type="button"
        onClick={startPreparation}
        disabled={
          submitting || (result.kind === "playlist" && selectedIds.size === 0)
        }
        className="mt-5 w-full rounded-lg bg-brand px-4 py-3 font-medium text-white disabled:opacity-50 dark:bg-brand-dark dark:text-gray-950"
      >
        {submitting ? "Wird gestartet..." : "Vorbereitung starten"}
      </button>
    </main>
  );
}

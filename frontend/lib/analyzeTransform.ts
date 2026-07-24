import type { AnalysisResult, PlaylistItemPreview, Quality } from "./types";

/**
 * Shape actually returned by POST /api/analyze (backend/app/schemas/analyze.py
 * AnalyzeResponse) - a single flat object for every sourceType, with no
 * `kind` discriminator and no dedicated per-quality `label`. `AnalysisResult`
 * is a nicer discriminated union for the rest of the app to consume, so this
 * is the one place that bridges the two - every caller of api.analyze()
 * MUST go through toAnalysisResult(), never use the raw response directly,
 * or `result.kind` silently becomes `undefined` and every `kind === "..."`
 * check in the download flow evaluates to false.
 */
export interface RawAnalyzeResponse {
  sourceType: string;
  title?: string | null;
  playlistTitle?: string | null;
  thumbnail?: string | null;
  channelName?: string | null;
  duration?: number | null;
  uploadDate?: string | null;
  availableQualities: { name: string; audioOnly: boolean; maximumResolution?: number | null }[];
  items: {
    youtubeId: string;
    title: string;
    channelName?: string | null;
    thumbnail?: string | null;
    duration?: number | null;
    uploadDate?: string | null;
    alreadyDownloaded?: boolean;
  }[];
  itemCount: number;
}

export function toAnalysisResult(raw: RawAnalyzeResponse): AnalysisResult {
  const qualities: Quality[] = raw.availableQualities.map((q) => ({
    name: q.name,
    label: q.name,
  }));

  if (raw.sourceType === "playlist" || raw.sourceType === "multi") {
    const items: PlaylistItemPreview[] = raw.items.map((i) => ({
      youtubeId: i.youtubeId,
      title: i.title,
      thumbnail: i.thumbnail ?? "",
      duration: i.duration ?? 0,
      // Already-downloaded items start unselected so re-analyzing a
      // playlist doesn't silently re-queue videos already in the library.
      selected: !i.alreadyDownloaded,
      alreadyDownloaded: i.alreadyDownloaded ?? false,
    }));
    return {
      kind: "playlist",
      playlistTitle: raw.playlistTitle ?? raw.title ?? "Playlist",
      thumbnail: raw.thumbnail ?? items[0]?.thumbnail ?? "",
      itemCount: raw.itemCount,
      items,
      // Backend doesn't return an aggregate - derive it from the items it
      // already sent rather than trusting a field that was never populated.
      totalDuration: items.reduce((sum, i) => sum + i.duration, 0),
      availableQualities: qualities,
    };
  }

  return {
    kind: "single",
    title: raw.title ?? raw.items[0]?.title ?? "Video",
    thumbnail: raw.thumbnail ?? "",
    channelName: raw.channelName ?? "",
    duration: raw.duration ?? 0,
    uploadDate: raw.uploadDate ?? "",
    availableQualities: qualities,
    alreadyDownloaded: raw.items[0]?.alreadyDownloaded ?? false,
  };
}

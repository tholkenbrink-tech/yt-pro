export type JobStatus =
  | "analyzed"
  | "queued"
  | "preparing"
  | "downloading_video"
  | "downloading_audio"
  | "merging"
  | "optimizing_for_iphone"
  | "finalizing"
  | "ready"
  | "downloaded_to_device"
  | "expired"
  | "cancelled"
  | "failed";

export type ConversionNote = "no_conversion" | "merged_only" | "converted_for_iphone";

export interface Quality {
  name: string;
  label: string;
  estimatedSize?: number;
}

export interface SingleVideoAnalysis {
  title: string;
  thumbnail: string;
  channelName: string;
  duration: number;
  uploadDate: string;
  availableQualities: Quality[];
  estimatedSizeByQuality?: Record<string, number>;
}

export interface PlaylistItemPreview {
  youtubeId: string;
  title: string;
  thumbnail: string;
  duration: number;
  selected: boolean;
}

export interface PlaylistAnalysis {
  playlistTitle: string;
  thumbnail: string;
  itemCount: number;
  items: PlaylistItemPreview[];
  totalDuration: number;
  estimatedTotalSize: number;
}

export type AnalysisResult =
  | ({ kind: "single" } & SingleVideoAnalysis)
  | ({ kind: "playlist" } & PlaylistAnalysis);

export interface JobItem {
  id: string;
  youtubeId?: string;
  title: string;
  thumbnail?: string;
  channelName?: string;
  duration?: number;
  selectedQuality: string;
  status: JobStatus;
  progress: number;
  currentStep?: string;
  downloadedBytes?: number;
  estimatedTotalBytes?: number;
  speed?: number;
  estimatedRemainingSeconds?: number;
  errorMessage?: string;
  createdAt: string;
  expiresAt?: string;
  conversionNote: ConversionNote;
  finalFileSize?: number;
  finalFormat?: string;
}

export interface Job {
  jobId: string;
  status: JobStatus;
  sourceUrl: string;
  selectedQuality: string;
  createdAt: string;
  expiresAt?: string;
  items: JobItem[];
}

export interface StorageInfo {
  usedBytes: number;
  freeBytes: number;
  lowSpaceWarning: boolean;
  retentionHours: number | null;
}

export interface SessionUser {
  user: {
    username: string;
    [key: string]: unknown;
  };
}

// ---- Phase 2 ----

export interface PlaybackProgress {
  positionSeconds: number;
  durationSeconds: number;
  percentage: number;
  completed: boolean;
  playbackRate: number;
  lastPlayedAt?: string;
}

export interface LibraryItemProgress {
  positionSeconds: number;
  percentage: number;
  completed: boolean;
}

export interface LibraryItem {
  id: string;
  title: string;
  channelName?: string;
  thumbnailPath?: string;
  duration?: number;
  selectedQuality: string;
  fileSize?: number;
  mimeType?: string;
  status: JobStatus;
  isAutomaticallyPrepared: boolean;
  sourceName?: string;
  createdAt: string;
  publishedAt?: string;
  expiresAt?: string;
  keepOnServer: boolean;
  progress: LibraryItemProgress | null;
  originalUrl?: string;
}

export interface LibraryQuery {
  status?: string;
  origin?: string;
  sourceId?: string;
  quality?: string;
  sort?: string;
  query?: string;
}

export type SourceMode = "discover_only" | "confirm_first" | "auto_prepare";

export type SourceScheduleType =
  | "manual"
  | "every_6h"
  | "every_12h"
  | "daily"
  | "weekly"
  | "cron";

export type SourceComputedStatus =
  | "active"
  | "checking"
  | "newItems"
  | "noChanges"
  | "paused"
  | "authRequired"
  | "failed";

export interface MonitoredSource {
  id: string;
  name: string;
  sourceUrl: string;
  playlistTitle?: string;
  thumbnailUrl?: string;
  downloadProfileId?: string;
  quality?: string;
  mode: SourceMode;
  scheduleType: SourceScheduleType;
  cronExpression?: string;
  maximumNewItemsPerRun?: number;
  maximumBytesPerRun?: number;
  maximumDurationSeconds?: number;
  includeShorts: boolean;
  includeLivestreams: boolean;
  includePastLivestreams: boolean;
  onlyPublishedAfter?: string;
  retentionPolicy?: string;
  notificationsEnabled: boolean;
  enabled: boolean;
  lastCheckedAt?: string;
  lastSuccessfulCheckAt?: string;
  nextCheckAt?: string;
  lastError?: string;
  computedStatus: SourceComputedStatus;
  sourceType?: string;
  externalPlaylistId?: string;
  updatedAt?: string;
}

export interface SourcePlaylistPreview {
  playlistTitle: string;
  thumbnail: string;
  itemCount: number;
  channelName?: string;
  externalPlaylistId?: string;
}

export interface SourceCheckRun {
  id: string;
  monitoredSourceId: string;
  status: "success" | "failed" | "running";
  startedAt: string;
  completedAt?: string;
  itemsFound: number;
  newItemsFound: number;
  itemsQueued: number;
  itemsSkippedCap: number;
  estimatedBytes?: number;
  errorMessage?: string;
}

export interface SourceDiscoveredItem {
  id: string;
  monitoredSourceId: string;
  youtubeId: string;
  title: string;
  thumbnailUrl?: string;
  channelName?: string;
  publishedAt?: string;
  durationSeconds?: number;
  estimatedFileSize?: number;
  discoveredAt: string;
  status: "discovered" | "prepared" | "ignored";
  downloadItemId?: string;
  ignoredAt?: string;
}

export interface CookieTestResult {
  status: "valid" | "expired" | "error";
  message: string;
}

export interface CookieStatus {
  status: "not_configured" | "valid" | "expired" | string;
  uploadedAt?: string;
}

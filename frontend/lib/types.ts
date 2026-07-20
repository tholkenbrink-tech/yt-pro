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

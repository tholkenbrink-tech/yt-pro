import { getCsrfToken } from "./csrf";
import type {
  AnalysisResult,
  CookieStatus,
  CookieTestResult,
  Job,
  LibraryItem,
  LibraryQuery,
  MonitoredSource,
  PlaybackProgress,
  SessionUser,
  SourceCheckRun,
  SourceDiscoveredItem,
  SourcePlaylistPreview,
  StorageInfo,
} from "./types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers(options.headers);
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (options.body && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (MUTATING_METHODS.has(method)) {
    const token = getCsrfToken();
    if (token) headers.set("X-CSRF-Token", token);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    method,
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    throw new ApiError(res.status, `Request failed: ${method} ${path}`, body);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ user: SessionUser["user"] }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  logout: () => request<void>("/api/auth/logout", { method: "POST" }),

  session: () => request<SessionUser>("/api/auth/session"),

  analyze: (input: { url?: string; urls?: string[] }) =>
    request<AnalysisResult>("/api/analyze", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  createJob: (payload: {
    sourceUrl: string;
    selectedQuality: string;
    itemIds?: string[];
  }) =>
    request<{ jobId: string; status: string }>("/api/jobs", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listJobs: (status?: string) =>
    request<Job[]>(`/api/jobs${status ? `?status=${status}` : ""}`),

  getJob: (id: string) => request<Job>(`/api/jobs/${id}`),

  cancelJob: (id: string) =>
    request<void>(`/api/jobs/${id}/cancel`, { method: "POST" }),

  retryJob: (id: string) =>
    request<void>(`/api/jobs/${id}/retry`, { method: "POST" }),

  downloadUrl: (itemId: string) => `${API_BASE_URL}/api/items/${itemId}/download`,

  zipItem: (itemId: string) =>
    request<{ zipJobId: string }>(`/api/items/${itemId}/zip`, {
      method: "POST",
    }),

  zipDownloadUrl: (itemId: string) =>
    `${API_BASE_URL}/api/items/${itemId}/zip/download`,

  history: (params: { query?: string; status?: string; sort?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.query) qs.set("query", params.query);
    if (params.status) qs.set("status", params.status);
    if (params.sort) qs.set("sort", params.sort);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<Job["items"]>(`/api/history${suffix}`);
  },

  deleteHistoryItem: (itemId: string) =>
    request<void>(`/api/history/${itemId}`, { method: "DELETE" }),

  reprepareHistoryItem: (itemId: string) =>
    request<{ jobId: string }>(`/api/history/${itemId}/reprepare`, {
      method: "POST",
    }),

  storage: () => request<StorageInfo>("/api/storage"),

  setRetention: (hours: number | null) =>
    request<StorageInfo>("/api/storage/retention", {
      method: "PUT",
      body: JSON.stringify({ hours }),
    }),

  // ---- Phase 2: player / progress ----

  streamUrl: (itemId: string) => `${API_BASE_URL}/api/items/${itemId}/stream`,

  getProgress: (itemId: string) =>
    request<PlaybackProgress>(`/api/items/${itemId}/progress`),

  saveProgress: (
    itemId: string,
    payload: { positionSeconds: number; durationSeconds: number; playbackRate: number }
  ) =>
    request<void>(`/api/items/${itemId}/progress`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  resetProgress: (itemId: string) =>
    request<void>(`/api/items/${itemId}/progress/reset`, { method: "POST" }),

  markWatched: (itemId: string) =>
    request<void>(`/api/items/${itemId}/mark-watched`, { method: "POST" }),

  setKeep: (itemId: string, keep: boolean) =>
    request<void>(`/api/items/${itemId}/keep`, {
      method: "PUT",
      body: JSON.stringify({ keep }),
    }),

  // ---- Phase 2: Mediathek ----

  library: (params: LibraryQuery = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.origin) qs.set("origin", params.origin);
    if (params.sourceId) qs.set("sourceId", params.sourceId);
    if (params.quality) qs.set("quality", params.quality);
    if (params.sort) qs.set("sort", params.sort);
    if (params.query) qs.set("query", params.query);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<LibraryItem[]>(`/api/library${suffix}`);
  },

  // ---- Phase 2: automatic sources ----

  analyzeSource: (url: string) =>
    request<SourcePlaylistPreview>("/api/sources/analyze", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),

  listSources: () => request<MonitoredSource[]>("/api/sources"),

  getSource: (id: string) => request<MonitoredSource>(`/api/sources/${id}`),

  createSource: (
    payload: Partial<MonitoredSource> & {
      sourceUrl: string;
      name: string;
      downloadProfileId: string;
    }
  ) =>
    request<MonitoredSource>("/api/sources", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateSource: (id: string, payload: Partial<MonitoredSource>) =>
    request<MonitoredSource>(`/api/sources/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deleteSource: (id: string) =>
    request<void>(`/api/sources/${id}`, { method: "DELETE" }),

  pauseSource: (id: string) =>
    request<MonitoredSource>(`/api/sources/${id}/pause`, { method: "POST" }),

  resumeSource: (id: string) =>
    request<MonitoredSource>(`/api/sources/${id}/resume`, { method: "POST" }),

  checkSourceNow: (id: string) =>
    request<MonitoredSource>(`/api/sources/${id}/check-now`, { method: "POST" }),

  sourceRuns: (id: string) => request<SourceCheckRun[]>(`/api/sources/${id}/runs`),

  sourceItems: (id: string) =>
    request<SourceDiscoveredItem[]>(`/api/sources/${id}/items`),

  prepareSourceItem: (sourceId: string, itemId: string) =>
    request<void>(`/api/sources/${sourceId}/items/${itemId}/prepare`, {
      method: "POST",
    }),

  ignoreSourceItem: (sourceId: string, itemId: string) =>
    request<void>(`/api/sources/${sourceId}/items/${itemId}/ignore`, {
      method: "POST",
    }),

  // ---- Phase 2: YouTube-Zugang (cookies) ----

  cookieStatus: () => request<CookieStatus>("/api/admin/cookies/status"),

  uploadCookies: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<CookieStatus>("/api/admin/cookies", {
      method: "POST",
      body: form,
    });
  },

  deleteCookies: () =>
    request<CookieStatus>("/api/admin/cookies", { method: "DELETE" }),

  testCookies: () =>
    request<CookieTestResult>("/api/admin/cookies/test", { method: "POST" }),
};

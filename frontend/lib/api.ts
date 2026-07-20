import { getCsrfToken } from "./csrf";
import type {
  AnalysisResult,
  Job,
  SessionUser,
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
  if (options.body && !headers.has("Content-Type")) {
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
};

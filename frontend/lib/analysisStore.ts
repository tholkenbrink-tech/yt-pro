import type { AnalysisResult } from "./types";

const KEY = "yt-pro:pending-analysis";

/**
 * Analysis results are short-lived and only needed to bridge the Home page
 * to the Analyze page during one navigation, so sessionStorage (not a
 * server round-trip or global store) is enough.
 */
export function savePendingAnalysis(result: AnalysisResult, sourceUrl: string) {
  sessionStorage.setItem(KEY, JSON.stringify({ result, sourceUrl }));
}

export function loadPendingAnalysis(): {
  result: AnalysisResult;
  sourceUrl: string;
} | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearPendingAnalysis() {
  sessionStorage.removeItem(KEY);
}

const QUALITY_KEY = "yt-pro:last-quality";

export function getLastQuality(): string | null {
  return localStorage.getItem(QUALITY_KEY);
}

export function setLastQuality(quality: string) {
  localStorage.setItem(QUALITY_KEY, quality);
}

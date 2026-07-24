import type { AnalysisResult } from "./types";

const KEY = "yt-pro:pending-analysis";

/**
 * Analysis results are short-lived and only needed to bridge the Home page
 * to the Analyze page during one navigation, so sessionStorage (not a
 * server round-trip or global store) is enough.
 */
export function savePendingAnalysis(
  result: AnalysisResult,
  sourceUrl: string,
  preferredQuality?: string
) {
  sessionStorage.setItem(KEY, JSON.stringify({ result, sourceUrl, preferredQuality }));
}

export function loadPendingAnalysis(): {
  result: AnalysisResult;
  sourceUrl: string;
  preferredQuality?: string;
  selectedIndices?: number[];
} | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Called on every checkbox toggle in the playlist preview so a selection
 * survives navigating away (e.g. back to step 1) and back again, instead of
 * resetting to the analyze-time defaults on remount. */
export function updatePendingSelection(selectedIndices: number[]) {
  const pending = loadPendingAnalysis();
  if (!pending) return;
  sessionStorage.setItem(KEY, JSON.stringify({ ...pending, selectedIndices }));
}

export function clearPendingAnalysis() {
  sessionStorage.removeItem(KEY);
}

const DRAFT_TEXT_KEY = "yt-pro:download-draft-text";

/** Keeps the step-1 URL textarea content alive across tab switches / app
 * backgrounding (mobile Safari can discard state on tab switch), until the
 * user actually starts an analysis. */
export function getDraftText(): string {
  return sessionStorage.getItem(DRAFT_TEXT_KEY) ?? "";
}

export function setDraftText(text: string) {
  sessionStorage.setItem(DRAFT_TEXT_KEY, text);
}

export function clearDraftText() {
  sessionStorage.removeItem(DRAFT_TEXT_KEY);
}

const QUALITY_KEY = "yt-pro:last-quality";

export function getLastQuality(): string | null {
  return localStorage.getItem(QUALITY_KEY);
}

export function setLastQuality(quality: string) {
  localStorage.setItem(QUALITY_KEY, quality);
}

const LAST_SUBMITTED_LINK_KEY = "yt-pro:last-submitted-link";

/** Whatever was in the URL box the last time "Analysieren" was pressed
 * (verbatim, incl. multi-line pastes) - lets a "restore last link" button
 * bring it back after the box gets cleared on a successful analysis.
 * Durable across sessions (localStorage), unlike the transient draft text. */
export function getLastSubmittedLink(): string | null {
  return localStorage.getItem(LAST_SUBMITTED_LINK_KEY);
}

export function setLastSubmittedLink(text: string) {
  localStorage.setItem(LAST_SUBMITTED_LINK_KEY, text);
}

/**
 * Persists the web (non-native) video player's state at module scope - same
 * singleton-plus-useSyncExternalStore pattern as nativePlayerStore.ts - so
 * playback survives SPA navigation away from the video's own page.
 *
 * The actual <video>/<audio> DOM elements live in PersistentVideoPlayer,
 * mounted once in AppShell and never torn down by route changes. A video's
 * own page (VideoPlayer.tsx's web branch) only renders a placeholder it
 * measures and reports here via updateWebPlayerFrame(), plus chrome (error/
 * resume/buttons) driven by the snapshot below - mirroring how
 * NativeVideoPlayer/nativePlayerStore split responsibilities for the iOS
 * native shell, just with a real, repositionable DOM node standing in for
 * what's a separate OS layer over there.
 */

import { useSyncExternalStore } from "react";
import { api } from "./api";
import { type BackgroundPlaybackMode, getPlayerSettings, setPlayerSettings } from "./playerSettings";

export interface WebPlayerMeta {
  itemId: string;
  title: string;
  channelName?: string;
  thumbnail?: string;
}

export type WebPlayerError = "network" | "wifi-required" | "offline" | null;

interface WebPlayerSnapshot {
  meta: WebPlayerMeta | null;
  /** "inline": shown full-size in the placeholder of the page that owns it.
   *  "mini": that page has unmounted - kept alive off-screen so audio (and,
   *  where the browser allows it, PiP) keeps running while a mini-bar gives
   *  a way back to it. */
  mode: "inline" | "mini";
  resumePosition: number | null;
  showRestartButton: boolean;
  error: WebPlayerError;
  isBuffering: boolean;
  isOfflineSource: boolean;
  backgroundPlaybackMode: BackgroundPlaybackMode;
  videoElement: HTMLVideoElement | null;
}

let snapshot: WebPlayerSnapshot = {
  meta: null,
  mode: "inline",
  resumePosition: null,
  showRestartButton: false,
  error: null,
  isBuffering: true,
  isOfflineSource: false,
  backgroundPlaybackMode: getPlayerSettings().backgroundPlaybackMode,
  videoElement: null,
};

const listeners = new Set<() => void>();
let pendingAutoPlay = false;

function setSnapshot(patch: Partial<WebPlayerSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWebPlayerState(): WebPlayerSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

export function getWebPlayerSnapshot(): WebPlayerSnapshot {
  return snapshot;
}

/** Only for PictureInPictureButton et al - reads live, doesn't subscribe. */
export function getWebPlayerVideoElement(): HTMLVideoElement | null {
  return snapshot.videoElement;
}

export function setWebPlayerVideoElement(video: HTMLVideoElement | null): void {
  setSnapshot({ videoElement: video });
}

export function setWebPlayerState(patch: Partial<WebPlayerSnapshot>): void {
  setSnapshot(patch);
}

/** Called by a page's placeholder on mount. Idempotent for the item that's
 * already loaded (e.g. navigating back to a minimized video's own page) -
 * just reclaims the inline slot instead of restarting playback. */
export function loadWebPlayerItem(meta: WebPlayerMeta, autoPlay: boolean): void {
  if (snapshot.meta?.itemId === meta.itemId) {
    setSnapshot({ mode: "inline" });
    return;
  }
  pendingAutoPlay = autoPlay;
  setSnapshot({
    meta,
    mode: "inline",
    resumePosition: null,
    showRestartButton: false,
    error: null,
    isBuffering: true,
    isOfflineSource: false,
  });
}

/** Consumed once by PersistentVideoPlayer's load effect - autoPlay only
 * applies to a genuinely fresh load, not to reclaiming an already-playing
 * item's inline slot. */
export function consumePendingWebPlayerAutoPlay(): boolean {
  const value = pendingAutoPlay;
  pendingAutoPlay = false;
  return value;
}

/** Called when the page showing the placeholder unmounts (SPA navigation
 * away, not a real close) - keeps playback running, off-screen, with the
 * mini-bar as the way back. A no-op if some other item has since taken over
 * the inline slot. */
export function releaseWebPlayerPage(itemId: string): void {
  if (snapshot.meta?.itemId !== itemId || snapshot.mode !== "inline") return;
  setSnapshot({ mode: "mini" });
}

export function closeWebPlayer(): void {
  setSnapshot({
    meta: null,
    mode: "inline",
    resumePosition: null,
    showRestartButton: false,
    error: null,
    isBuffering: true,
    isOfflineSource: false,
    videoElement: null,
  });
}

export function selectWebPlayerBackgroundMode(mode: BackgroundPlaybackMode): void {
  setPlayerSettings({ backgroundPlaybackMode: mode });
  setSnapshot({ backgroundPlaybackMode: mode });

  if (mode === "audio") {
    // Mutually exclusive: picking "audio" while actually floating in a real
    // PiP window right now snaps back to inline immediately, rather than
    // leaving a stale PiP window open alongside the "audio" choice being
    // shown as active.
    const video = snapshot.videoElement as
      | (HTMLVideoElement & {
          webkitPresentationMode?: string;
          webkitSetPresentationMode?: (mode: string) => void;
        })
      | null;
    if (video?.webkitPresentationMode === "picture-in-picture") {
      video.webkitSetPresentationMode?.("inline");
    } else if (typeof document !== "undefined" && document.pictureInPictureElement === video) {
      document.exitPictureInPicture().catch(() => undefined);
    }
  }
}

/** Forwards a live placeholder-position measurement to PersistentVideoPlayer,
 * but only while `itemId` is actually the one in the inline slot - guards
 * against a page that no longer owns it (navigated away, or a different
 * video opened elsewhere) repositioning someone else's. */
let frameSink: ((rect: { x: number; y: number; width: number; height: number }) => void) | null = null;
// Remembers the last measurement per item so a sink registering *after* the
// placeholder already reported one (a real, observed race between
// PersistentVideoPlayer's registration effect and VideoPlayer's own
// measure-on-mount effect, both keyed on the same itemId change but run as
// separate React commits) still gets it immediately, instead of leaving
// PersistentVideoPlayer stuck at its "no measurement yet" 1x1 invisible
// fallback size until some unrelated resize/scroll happens to fire.
let lastKnownFrame: { itemId: string; rect: { x: number; y: number; width: number; height: number } } | null = null;

export function registerWebPlayerFrameSink(
  sink: ((rect: { x: number; y: number; width: number; height: number }) => void) | null
): void {
  frameSink = sink;
  if (sink && lastKnownFrame && snapshot.meta?.itemId === lastKnownFrame.itemId && snapshot.mode === "inline") {
    sink(lastKnownFrame.rect);
  }
}

export function updateWebPlayerFrame(
  itemId: string,
  rect: { x: number; y: number; width: number; height: number }
): void {
  if (snapshot.meta?.itemId !== itemId || snapshot.mode !== "inline") return;
  if (rect.width <= 0 || rect.height <= 0) return;
  lastKnownFrame = { itemId, rect };
  frameSink?.(rect);
}

export async function restartWebPlayerFromBeginning(itemId: string): Promise<void> {
  setSnapshot({ resumePosition: null, showRestartButton: false });
  try {
    await api.resetProgress(itemId);
  } catch {
    /* best-effort - still seek locally even if the reset call fails */
  }
  if (snapshot.videoElement && snapshot.meta?.itemId === itemId) {
    snapshot.videoElement.currentTime = 0;
  }
}

/**
 * Persists the native (iOS) video player's presentation state at module
 * scope - same singleton-plus-useSyncExternalStore pattern as
 * downloadQueueStore.ts - so it survives SPA navigation away from the
 * video's page. Without this, unmounting NativeVideoPlayer (e.g. tapping a
 * bottom-nav tab while the player is in Picture-in-Picture) had nothing left
 * to hold "is the player still running" state, so it unconditionally tore
 * the native player down - deallocating the AVPlayer out from under an
 * active system PiP/fullscreen session AVKit's own state machine still
 * thought it owned, which is what produced the reported stuck-player bug
 * (video visible, rest of the app blocked, restart required).
 *
 * Now only an explicit closeNativePlayer() call ever dismisses the native
 * player - navigating away just stops this store forwarding frame updates
 * for it, the same way registerFrame()/updateNativePlayerFrame() already
 * guard every call by itemId so a stale, unmounted page can't reposition
 * whatever's actually playing.
 */

import { useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import {
  NativePlayer,
  type NativePlayerErrorEvent,
  type NativePlayerFrame,
  type NativePlayerTimeUpdate,
} from "@/lib/nativePlayer";
import { type BackgroundPlaybackMode, getPlayerSettings } from "@/lib/playerSettings";

const SAVE_INTERVAL_MS = 7000;
const RESUME_THRESHOLD_SECONDS = 5;
const MARK_WATCHED_PERCENTAGE = 95;

export interface NativePlayerMeta {
  itemId: string;
  title: string;
  channelName?: string;
  thumbnail?: string;
}

interface NativePlayerSnapshot {
  meta: NativePlayerMeta | null;
  isPresented: boolean;
  isFullscreen: boolean;
  isPipActive: boolean;
  error: "network" | null;
}

interface RouterLike {
  push: (href: string) => void;
}

let snapshot: NativePlayerSnapshot = {
  meta: null,
  isPresented: false,
  isFullscreen: false,
  isPipActive: false,
  error: null,
};

const listeners = new Set<() => void>();
let lastSavedAt = 0;
let markedWatched = false;
let router: RouterLike | null = null;
let nativeListenersReady = false;

function setSnapshot(patch: Partial<NativePlayerSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

function saveProgress(itemId: string, positionSeconds: number, durationSeconds: number): void {
  if (!durationSeconds || Number.isNaN(durationSeconds)) return;
  api.saveProgress(itemId, { positionSeconds, durationSeconds, playbackRate: 1 }).catch(() => undefined);
}

// Registered once, ever - unlike the per-instance listeners this replaces
// (previously set up in NativeVideoPlayer.tsx's own useEffect, torn down on
// every unmount), these have to keep running no matter which page is
// mounted so progress-saving, mark-watched-at-95%, and PiP/fullscreen state
// stay correct while the player is minimized somewhere off the current page.
function ensureNativeListeners(): void {
  if (nativeListenersReady) return;
  nativeListenersReady = true;

  NativePlayer.addListener("timeUpdate", (data: NativePlayerTimeUpdate) => {
    const itemId = snapshot.meta?.itemId;
    if (!itemId) return;
    const now = Date.now();
    if (now - lastSavedAt >= SAVE_INTERVAL_MS) {
      lastSavedAt = now;
      saveProgress(itemId, data.positionSeconds, data.durationSeconds);
    }
    if (!markedWatched && getPlayerSettings().markWatchedAt95 && data.durationSeconds) {
      const pct = (data.positionSeconds / data.durationSeconds) * 100;
      if (pct >= MARK_WATCHED_PERCENTAGE) {
        markedWatched = true;
        api.markWatched(itemId).catch(() => undefined);
      }
    }
  });

  // Fires when the asset itself fails to load (auth, deleted file,
  // unsupported codec) - openNativePlayer()'s present() call has already
  // resolved by then since that only confirms the native player screen was
  // shown, not that playback actually started successfully.
  NativePlayer.addListener("playbackError", (data: NativePlayerErrorEvent) => {
    console.error("NativePlayer playbackError:", data.message);
    setSnapshot({ error: "network" });
  });

  NativePlayer.addListener("fullscreenChange", (data) => {
    setSnapshot({ isFullscreen: data.isFullscreen });
  });

  NativePlayer.addListener("pipChange", (data) => {
    setSnapshot({ isPipActive: data.isActive });
  });

  // The user tapped "restore" on the system PiP overlay (or auto-restore
  // fired) - the player's native view is already sitting exactly where we
  // left it, the only thing that might not be showing is the web page that
  // owns its placeholder, so navigate back to it if it isn't the current
  // route. Reads location directly rather than tracking pathname in state,
  // since this only ever needs to run at the moment of the event.
  NativePlayer.addListener("pipRestoreRequested", () => {
    const itemId = snapshot.meta?.itemId;
    if (!itemId || typeof window === "undefined") return;
    const target = `/library/${itemId}`;
    if (window.location.pathname !== target) {
      router?.push(target);
    }
  });
}

/** Called once from AppShell so pipRestoreRequested can navigate - a plain
 * module can't call the App Router's useRouter() hook itself. */
export function registerNativePlayerRouter(instance: RouterLike): void {
  router = instance;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNativePlayerState(): NativePlayerSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

/** Idempotent for the item that's already presented - re-navigating to a
 * video already playing elsewhere (e.g. expanding from the mini-bar) just
 * keeps it running rather than tearing down and re-presenting from scratch,
 * which would otherwise restart playback and lose the resume position. */
export async function openNativePlayer(
  meta: NativePlayerMeta,
  options: { backgroundMode: BackgroundPlaybackMode; frame?: NativePlayerFrame }
): Promise<void> {
  ensureNativeListeners();

  if (snapshot.isPresented && snapshot.meta?.itemId === meta.itemId) {
    if (options.frame) updateNativePlayerFrame(meta.itemId, options.frame);
    return;
  }

  setSnapshot({ error: null });
  markedWatched = false;

  const settings = getPlayerSettings();
  const progress = settings.autoResume ? await api.getProgress(meta.itemId).catch(() => null) : null;
  const startTime =
    progress && progress.positionSeconds > RESUME_THRESHOLD_SECONDS && !progress.completed
      ? progress.positionSeconds
      : 0;

  await NativePlayer.present({
    url: api.streamUrl(meta.itemId),
    title: meta.title || "Video",
    artist: meta.channelName,
    artworkUrl: meta.thumbnail,
    startTime,
    backgroundMode: options.backgroundMode,
    x: options.frame?.x ?? 0,
    y: options.frame?.y ?? 0,
    width: options.frame?.width ?? 0,
    height: options.frame?.height ?? 0,
  });

  setSnapshot({ meta, isPresented: true, isFullscreen: false, isPipActive: false });
}

/** The only path that should ever dismiss the native player - navigating
 * away from its page must NOT call this (see module comment). */
export function closeNativePlayer(): void {
  if (!snapshot.isPresented) return;
  const itemId = snapshot.meta?.itemId;
  setSnapshot({ meta: null, isPresented: false, isFullscreen: false, isPipActive: false, error: null });
  NativePlayer.dismiss()
    .then(({ positionSeconds }) => {
      if (!itemId) return;
      // durationSeconds is unknown here, so pass position+1 to satisfy
      // saveProgress's "don't save a zero/unknown duration" guard - mirrors
      // how the web player records "watched roughly up to here" without
      // needing the real duration for a final, one-off save on close.
      saveProgress(itemId, positionSeconds, positionSeconds > 0 ? positionSeconds + 1 : 0);
    })
    .catch(() => undefined);
}

/** Forwards a live placeholder-position measurement to the native side, but
 * only while `itemId` is actually the one being shown - guards against a
 * page that no longer owns the on-screen player (navigated away, or a
 * different video opened elsewhere) repositioning someone else's. */
export function updateNativePlayerFrame(itemId: string, frame: NativePlayerFrame): void {
  if (snapshot.meta?.itemId !== itemId || !snapshot.isPresented) return;
  if (frame.width <= 0 || frame.height <= 0) return;
  NativePlayer.updateFrame(frame).catch(() => undefined);
}

export function setNativePlayerBackgroundMode(mode: BackgroundPlaybackMode): void {
  NativePlayer.setBackgroundMode({ mode }).catch(() => undefined);
}

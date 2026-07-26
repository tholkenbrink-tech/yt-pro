"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { getOfflineBlob } from "@/lib/offlineStore";
import { useDownloadQueueStatus } from "@/lib/downloadQueueStore";
import { shouldStream } from "@/lib/wifiGate";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { isNativeIOS } from "@/lib/nativePlayer";
import { getPlayerSettings } from "@/lib/playerSettings";
import {
  consumePendingWebPlayerAutoPlay,
  registerWebPlayerFrameSink,
  setWebPlayerState,
  setWebPlayerVideoElement,
  useWebPlayerState,
} from "@/lib/webPlayerStore";

const SAVE_INTERVAL_MS = 7000;
const RESUME_THRESHOLD_SECONDS = 5;
const MARK_WATCHED_PERCENTAGE = 95;
const MARK_WATCHED_REMAINING_SECONDS = 30;

interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Owns the actual <video>/<audio> DOM elements for the web (non-native)
 * player. Mounted exactly once, in AppShell, so it's never torn down by SPA
 * navigation - only closeWebPlayer() (an explicit "Schließen" tap) removes
 * it. While a page's placeholder (VideoPlayer.tsx's web branch) has claimed
 * the inline slot, this is positioned via `position: fixed` to exactly
 * overlay that placeholder's on-screen box (kept in sync by
 * registerWebPlayerFrameSink below) so it reads as an ordinary inline
 * player. Once that page unmounts, it's parked off-screen instead -
 * playback (audio, and real browser Picture-in-Picture once entered)
 * keeps running regardless, which is the actual fix for background
 * playback stopping on in-app navigation.
 */
export function PersistentVideoPlayer() {
  const { meta, mode, backgroundPlaybackMode, resumePosition } = useWebPlayerState();
  const videoRef = useRef<HTMLVideoElement>(null);
  const shadowAudioRef = useRef<HTMLAudioElement>(null);
  const isShadowActiveRef = useRef(false);
  const isPrimedRef = useRef(false);
  const lastSavedAtRef = useRef(0);
  const markedWatchedRef = useRef(false);
  const backgroundPlaybackModeRef = useRef(backgroundPlaybackMode);
  const resumePositionRef = useRef(resumePosition);
  const [src, setSrc] = useState<string>("");
  const offlineObjectUrlRef = useRef<string | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const online = useOnlineStatus();
  const itemId = meta?.itemId ?? null;

  useEffect(() => {
    backgroundPlaybackModeRef.current = backgroundPlaybackMode;
  }, [backgroundPlaybackMode]);

  useEffect(() => {
    resumePositionRef.current = resumePosition;
  }, [resumePosition]);

  const saveProgress = (fireAndForget = false) => {
    const video = videoRef.current;
    if (!video || !itemId || !video.duration || Number.isNaN(video.duration)) return;
    const payload = {
      positionSeconds: video.currentTime,
      durationSeconds: video.duration,
      playbackRate: getPlayerSettings().rememberPlaybackRate ? video.playbackRate : 1,
    };
    const call = api.saveProgress(itemId, payload);
    if (!fireAndForget) call.catch(() => undefined);
  };

  // Registers the fixed wrapper's position setter with the store so a
  // page's placeholder can drive it, and exposes the video element itself
  // (e.g. for PictureInPictureButton) for as long as this item is loaded.
  useEffect(() => {
    if (!itemId) return;
    registerWebPlayerFrameSink((rect) => setFrame(rect));
    setWebPlayerVideoElement(videoRef.current);
    return () => {
      registerWebPlayerFrameSink(null);
      setWebPlayerVideoElement(null);
    };
  }, [itemId]);

  // Loads the source for a freshly-opened item - offline copy always wins
  // when one exists (see VideoPlayer's original comment on why this is
  // sequential, not raced, against the streaming fallback).
  useEffect(() => {
    if (!itemId) {
      setSrc("");
      return;
    }
    let cancelled = false;
    setWebPlayerState({ isOfflineSource: false, isBuffering: true });
    if (offlineObjectUrlRef.current) {
      URL.revokeObjectURL(offlineObjectUrlRef.current);
      offlineObjectUrlRef.current = null;
    }
    markedWatchedRef.current = false;
    isPrimedRef.current = false;

    getOfflineBlob(itemId)
      .then((blob) => {
        if (cancelled) return true;
        if (blob) {
          const objectUrl = URL.createObjectURL(blob);
          offlineObjectUrlRef.current = objectUrl;
          setSrc(objectUrl);
          setWebPlayerState({ isOfflineSource: true, error: null });
          return true;
        }
        return false;
      })
      .catch(() => false)
      // `handled` (not the blob itself, which was a footgun: `null` was
      // returned both for "cancelled/found" and for "not found", making the
      // two indistinguishable here) - a found-and-set offline source must
      // short-circuit before the network/offline-error branch below ever
      // runs, or it immediately overwrites the just-set isOfflineSource/
      // error state with a stale "offline nicht verfügbar" error even
      // though the local file was found and is already playing.
      .then((handled) => {
        if (cancelled || handled) return;

        if (!online) {
          setSrc("");
          setWebPlayerState({ error: "offline" });
          return;
        }

        shouldStream().then((streamingAllowed) => {
          if (cancelled) return;
          setSrc(streamingAllowed ? api.streamUrl(itemId) : "");
          setWebPlayerState({ error: streamingAllowed ? null : "wifi-required" });
        });
      });

    api
      .getProgress(itemId)
      .then((progress) => {
        if (cancelled) return;
        if (
          getPlayerSettings().autoResume &&
          progress.positionSeconds > RESUME_THRESHOLD_SECONDS &&
          !progress.completed
        ) {
          setWebPlayerState({ resumePosition: progress.positionSeconds, showRestartButton: true });
        }
      })
      .catch(() => {
        /* no saved progress yet, or backend not reachable - fine to start fresh */
      });

    return () => {
      cancelled = true;
      if (offlineObjectUrlRef.current) {
        URL.revokeObjectURL(offlineObjectUrlRef.current);
        offlineObjectUrlRef.current = null;
      }
    };
    // Re-runs when connectivity is restored, so a video that was blocked
    // offline (with no local copy) starts streaming automatically.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, online]);

  // If an in-app download for this item finishes while it's already
  // streaming, switch playback over to the local copy right away - see
  // VideoPlayer's original comment (this logic is otherwise unchanged).
  const queueStatus = useDownloadQueueStatus(itemId ?? "");
  const wasQueuedRef = useRef(false);
  useEffect(() => {
    if (!itemId) return;
    if (queueStatus === "downloading" || queueStatus === "queued") {
      wasQueuedRef.current = true;
      return;
    }
    if (!wasQueuedRef.current) return;
    wasQueuedRef.current = false;

    let cancelled = false;
    getOfflineBlob(itemId).then((blob) => {
      if (cancelled || !blob) return;
      const video = videoRef.current;
      const objectUrl = URL.createObjectURL(blob);
      const resumeAt = video?.currentTime ?? 0;
      const wasPlaying = video ? !video.paused : false;

      if (video) {
        const onLoadedMetadata = () => {
          video.currentTime = resumeAt;
          if (wasPlaying) video.play().catch(() => undefined);
          video.removeEventListener("loadedmetadata", onLoadedMetadata);
        };
        video.addEventListener("loadedmetadata", onLoadedMetadata);
      }

      if (offlineObjectUrlRef.current) URL.revokeObjectURL(offlineObjectUrlRef.current);
      offlineObjectUrlRef.current = objectUrl;
      setSrc(objectUrl);
      setWebPlayerState({ isOfflineSource: true, error: null });
    });

    return () => {
      cancelled = true;
    };
  }, [queueStatus, itemId]);

  // Playback wiring - listeners, progress saving, background audio handoff.
  useEffect(() => {
    const video = videoRef.current;
    const shadowAudio = shadowAudioRef.current;
    if (!video || !itemId) return;

    const onLoadedMetadata = () => {
      if (resumePositionRef.current !== null) {
        video.currentTime = resumePositionRef.current;
      }
      if (consumePendingWebPlayerAutoPlay()) {
        video.play().catch(() => undefined);
      }
    };

    const onTimeUpdate = () => {
      const now = Date.now();
      if (now - lastSavedAtRef.current >= SAVE_INTERVAL_MS) {
        lastSavedAtRef.current = now;
        saveProgress();
      }

      if (!markedWatchedRef.current && getPlayerSettings().markWatchedAt95 && video.duration) {
        const pct = (video.currentTime / video.duration) * 100;
        const remaining = video.duration - video.currentTime;
        if (pct >= MARK_WATCHED_PERCENTAGE || remaining < MARK_WATCHED_REMAINING_SECONDS) {
          markedWatchedRef.current = true;
          api.markWatched(itemId).catch(() => undefined);
        }
      }
    };

    const onPause = () => saveProgress();
    const onEnterPip = () => saveProgress();
    const onError = () => {
      setWebPlayerState({ error: "network", isBuffering: false });
    };
    const onCanPlay = () => setWebPlayerState({ isBuffering: false });
    const onWaiting = () => setWebPlayerState({ isBuffering: true });

    // See VideoPlayer's original comment: priming the shadow audio element
    // (muted) inside the video's own "play" event borrows that gesture so
    // a later, gesture-less .play() call on it (from visibilitychange) is
    // allowed rather than silently rejected.
    const onVideoPlay = () => {
      if (!shadowAudio || isPrimedRef.current) return;
      isPrimedRef.current = true;
      shadowAudio.muted = true;
      shadowAudio
        .play()
        .then(() => {
          shadowAudio.pause();
          shadowAudio.currentTime = 0;
          shadowAudio.muted = false;
        })
        .catch(() => {
          isPrimedRef.current = false;
        });
    };

    // iOS WebKit suspends a <video> element's audio the moment the app is
    // backgrounded unless it's in Picture-in-Picture - handing off to a
    // hidden <audio> element (which iOS keeps alive in the background once
    // Media Session is registered) is the standard workaround. Harmless
    // no-op on platforms that don't need it.
    const handOffToShadowAudio = () => {
      if (backgroundPlaybackModeRef.current !== "audio") return;
      if (!shadowAudio || video.paused || isShadowActiveRef.current) return;
      isShadowActiveRef.current = true;
      shadowAudio.currentTime = video.currentTime;
      shadowAudio.playbackRate = video.playbackRate;
      video.pause();
      shadowAudio.play().catch(() => {
        isShadowActiveRef.current = false;
      });
    };

    const handBackFromShadowAudio = () => {
      if (!shadowAudio || !isShadowActiveRef.current) return;
      isShadowActiveRef.current = false;
      const wasPlaying = !shadowAudio.paused;
      video.currentTime = shadowAudio.currentTime;
      shadowAudio.pause();
      if (wasPlaying) video.play().catch(() => undefined);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        saveProgress();
        handOffToShadowAudio();
      } else {
        handBackFromShadowAudio();
      }
    };
    const onPageHide = () => saveProgress();

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("pause", onPause);
    video.addEventListener("play", onVideoPlay);
    video.addEventListener("enterpictureinpicture", onEnterPip);
    video.addEventListener("error", onError);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("playing", onCanPlay);
    video.addEventListener("waiting", onWaiting);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("play", onVideoPlay);
      video.removeEventListener("enterpictureinpicture", onEnterPip);
      video.removeEventListener("error", onError);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("playing", onCanPlay);
      video.removeEventListener("waiting", onWaiting);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      if (isShadowActiveRef.current) {
        isShadowActiveRef.current = false;
        shadowAudio?.pause();
      }
      saveProgress(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  useEffect(() => {
    const video = videoRef.current as (HTMLVideoElement & { autoPictureInPicture?: boolean }) | null;
    if (!video) return;
    video.autoPictureInPicture = backgroundPlaybackMode === "pip";
  }, [backgroundPlaybackMode]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !itemId || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: meta?.title || "Video",
      artist: meta?.channelName || "",
      artwork: meta?.thumbnail ? [{ src: meta.thumbnail }] : undefined,
    });

    const activePlayer = () => (isShadowActiveRef.current ? shadowAudioRef.current : video) ?? video;

    navigator.mediaSession.setActionHandler("play", () => activePlayer().play());
    navigator.mediaSession.setActionHandler("pause", () => activePlayer().pause());
    navigator.mediaSession.setActionHandler("seekbackward", (details) => {
      const player = activePlayer();
      player.currentTime = Math.max(0, player.currentTime - (details.seekOffset || 10));
    });
    navigator.mediaSession.setActionHandler("seekforward", (details) => {
      const player = activePlayer();
      player.currentTime = Math.min(player.duration || Infinity, player.currentTime + (details.seekOffset || 10));
    });
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime !== undefined) activePlayer().currentTime = details.seekTime;
    });

    if (backgroundPlaybackMode === "pip") {
      try {
        navigator.mediaSession.setActionHandler("enterpictureinpicture" as MediaSessionAction, () => {
          video.requestPictureInPicture().catch(() => undefined);
        });
      } catch {
        /* unsupported action name on this browser */
      }
    }

    const updatePlaybackState = () => {
      navigator.mediaSession.playbackState = activePlayer().paused ? "paused" : "playing";
    };
    const audio = shadowAudioRef.current;
    video.addEventListener("play", updatePlaybackState);
    video.addEventListener("pause", updatePlaybackState);
    audio?.addEventListener("play", updatePlaybackState);
    audio?.addEventListener("pause", updatePlaybackState);
    updatePlaybackState();

    return () => {
      video.removeEventListener("play", updatePlaybackState);
      video.removeEventListener("pause", updatePlaybackState);
      audio?.removeEventListener("play", updatePlaybackState);
      audio?.removeEventListener("pause", updatePlaybackState);
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("seekbackward", null);
      navigator.mediaSession.setActionHandler("seekforward", null);
      navigator.mediaSession.setActionHandler("seekto", null);
      try {
        navigator.mediaSession.setActionHandler("enterpictureinpicture" as MediaSessionAction, null);
      } catch {
        /* see try/catch above */
      }
    };
  }, [itemId, meta?.title, meta?.channelName, meta?.thumbnail, backgroundPlaybackMode]);

  if (isNativeIOS() || !meta) return null;

  const wrapperStyle: React.CSSProperties =
    mode === "inline" && frame
      ? {
          position: "fixed",
          left: frame.x,
          top: frame.y,
          width: frame.width,
          height: frame.height,
          zIndex: 30,
          opacity: 1,
          pointerEvents: "auto",
        }
      : mode === "inline"
        ? // Claimed but no measurement yet - stay invisible rather than
          // flashing at the top-left corner for a frame.
          { position: "fixed", left: 0, top: 0, width: 1, height: 1, opacity: 0, pointerEvents: "none" }
        : // Minimized: parked off-screen. Playback (audio, and real
          // Picture-in-Picture once entered) keeps running regardless -
          // browsers don't suspend a <video> just for being off-screen or
          // zero-size, only for the page itself being backgrounded (see the
          // visibilitychange handling above, which is unaffected by this).
          { position: "fixed", left: -1, top: -1, width: 1, height: 1, opacity: 0, pointerEvents: "none" };

  return (
    <div style={wrapperStyle} className="overflow-hidden rounded-2xl bg-black">
      <video
        ref={videoRef}
        src={src || undefined}
        playsInline
        preload="metadata"
        controls
        className="h-full w-full"
      >
        Dein Browser unterstützt die Videowiedergabe nicht.
      </video>

      <audio ref={shadowAudioRef} src={src || undefined} preload="none" className="hidden" />
    </div>
  );
}

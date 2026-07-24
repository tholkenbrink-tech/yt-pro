"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { type BackgroundPlaybackMode, getPlayerSettings, setPlayerSettings } from "@/lib/playerSettings";
import { getOfflineBlob } from "@/lib/offlineStore";
import { BackgroundAudioButton } from "./BackgroundAudioButton";
import { PictureInPictureButton } from "./PictureInPictureButton";
import { ResumePlaybackPrompt } from "./ResumePlaybackPrompt";

const SAVE_INTERVAL_MS = 7000;
const RESUME_THRESHOLD_SECONDS = 5;
const MARK_WATCHED_PERCENTAGE = 95;
const MARK_WATCHED_REMAINING_SECONDS = 30;

interface Props {
  itemId: string;
  title?: string;
  channelName?: string;
  thumbnail?: string;
  autoPlay?: boolean;
}

export function VideoPlayer({ itemId, title, channelName, thumbnail, autoPlay }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shadowAudioRef = useRef<HTMLAudioElement>(null);
  const isShadowActiveRef = useRef(false);
  const isPrimedRef = useRef(false);
  const lastSavedAtRef = useRef(0);
  const markedWatchedRef = useRef(false);
  const settingsRef = useRef(getPlayerSettings());
  const [resumePosition, setResumePosition] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [src, setSrc] = useState<string>(() => api.streamUrl(itemId));
  const [isOfflineSource, setIsOfflineSource] = useState(false);
  const [backgroundPlaybackMode, setBackgroundPlaybackMode] = useState<BackgroundPlaybackMode>(
    () => settingsRef.current.backgroundPlaybackMode
  );
  const backgroundPlaybackModeRef = useRef(backgroundPlaybackMode);
  useEffect(() => {
    backgroundPlaybackModeRef.current = backgroundPlaybackMode;
  }, [backgroundPlaybackMode]);

  const selectBackgroundPlaybackMode = (mode: BackgroundPlaybackMode) => {
    setBackgroundPlaybackMode(mode);
    setPlayerSettings({ backgroundPlaybackMode: mode });

    if (mode === "audio") {
      // Mutually exclusive: picking "audio" while actually floating in a
      // real PiP window right now snaps back to inline immediately, rather
      // than leaving a stale PiP window open alongside the "audio" choice
      // being shown as active.
      const video = videoRef.current as
        | (HTMLVideoElement & {
            webkitPresentationMode?: string;
            webkitSetPresentationMode?: (mode: string) => void;
          })
        | null;
      if (video?.webkitPresentationMode === "picture-in-picture") {
        video.webkitSetPresentationMode?.("inline");
      } else if (document.pictureInPictureElement === video) {
        document.exitPictureInPicture().catch(() => undefined);
      }
    }
  };

  const saveProgress = (fireAndForget = false) => {
    const video = videoRef.current;
    if (!video || !video.duration || Number.isNaN(video.duration)) return;
    const payload = {
      positionSeconds: video.currentTime,
      durationSeconds: video.duration,
      playbackRate: settingsRef.current.rememberPlaybackRate ? video.playbackRate : 1,
    };
    const call = api.saveProgress(itemId, payload);
    if (!fireAndForget) call.catch(() => undefined);
  };

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setSrc(api.streamUrl(itemId));
    setIsOfflineSource(false);

    getOfflineBlob(itemId)
      .then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
        setIsOfflineSource(true);
      })
      .catch(() => {
        /* no offline copy - keep streaming from the network */
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [itemId]);

  useEffect(() => {
    settingsRef.current = getPlayerSettings();
    setBackgroundPlaybackMode(settingsRef.current.backgroundPlaybackMode);
    let cancelled = false;

    api
      .getProgress(itemId)
      .then((progress) => {
        if (cancelled) return;
        if (
          settingsRef.current.autoResume &&
          progress.positionSeconds > RESUME_THRESHOLD_SECONDS &&
          !progress.completed
        ) {
          setResumePosition(progress.positionSeconds);
        }
      })
      .catch(() => {
        /* no saved progress yet, or backend not reachable - fine to start fresh */
      });

    return () => {
      cancelled = true;
    };
  }, [itemId]);

  useEffect(() => {
    const video = videoRef.current;
    const shadowAudio = shadowAudioRef.current;
    if (!video) return;

    const onLoadedMetadata = () => {
      // Seek immediately rather than a blocking "resume?" prompt before
      // playback: it's simpler UX (no extra tap before the user can hit
      // play) - the icon-only resume button still gives an explicit
      // "von vorne" undo if the auto-seek guessed wrong.
      if (resumePosition !== null) {
        video.currentTime = resumePosition;
      }
      // Coming from the library's own play button already expresses the
      // user's intent to watch now, so start playback immediately instead
      // of requiring a second tap on the native control.
      if (autoPlay) {
        video.play().catch(() => undefined);
      }
    };

    const onTimeUpdate = () => {
      const now = Date.now();
      if (now - lastSavedAtRef.current >= SAVE_INTERVAL_MS) {
        lastSavedAtRef.current = now;
        saveProgress();
      }

      if (!markedWatchedRef.current && settingsRef.current.markWatchedAt95 && video.duration) {
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
    const onError = () => setError("network");

    // Browsers only allow `.play()` without a fresh user gesture on an
    // element that has previously been "activated" by one. The shadow audio
    // element has never been played by the user directly, so calling
    // `.play()` on it later from the (gesture-less) visibilitychange handler
    // below would otherwise be silently rejected - which is exactly what
    // made background audio stop and require manually pressing play again.
    // Priming it here, muted, inside the video's own "play" event (itself
    // triggered by the user's tap) borrows that same gesture to unlock it.
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
    // backgrounded unless it's in Picture-in-Picture - there is no way for a
    // *video* element to keep playing audio-only in the background there.
    // The standard workaround (also how web-based music/podcast players
    // survive backgrounding on iOS) is to hand playback off to a hidden
    // <audio> element instead, which iOS *does* keep alive in the
    // background once Media Session is registered - then hand it back when
    // the app is foregrounded again. Harmless no-op on platforms that don't
    // need it (desktop browsers already keep the video itself playing).
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
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("play", onVideoPlay);
      video.removeEventListener("enterpictureinpicture", onEnterPip);
      video.removeEventListener("error", onError);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      if (isShadowActiveRef.current) {
        isShadowActiveRef.current = false;
        shadowAudio?.pause();
      }
      // Best-effort save on unmount - fire-and-forget, never await in
      // cleanup.
      saveProgress(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, resumePosition]);

  useEffect(() => {
    const video = videoRef.current as (HTMLVideoElement & { autoPictureInPicture?: boolean }) | null;
    if (!video) return;
    // Not in the JSX video-attribute typings, so set the DOM property
    // directly - this is what makes the video follow the user into a
    // floating window when they switch away from the tab/app, without
    // needing a `requestPictureInPicture()` call of our own (which the
    // browser would reject anyway outside of a user gesture).
    video.autoPictureInPicture = backgroundPlaybackMode === "pip";
  }, [backgroundPlaybackMode]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    // Registering Media Session metadata/actions is what makes the browser
    // treat this as legitimate background media playback - on mobile this is
    // what keeps the audio track (and lock-screen "now playing" controls)
    // alive after the app is backgrounded, rather than the tab being
    // suspended.
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title || "Video",
      artist: channelName || "",
      artwork: thumbnail ? [{ src: thumbnail }] : undefined,
    });

    // Routes to whichever element is actually playing right now - the
    // visible video normally, or the hidden shadow <audio> element while
    // it's standing in for background playback (see the visibilitychange
    // handling above).
    const activePlayer = () => (isShadowActiveRef.current ? shadowAudioRef.current : video) ?? video;

    navigator.mediaSession.setActionHandler("play", () => activePlayer().play());
    navigator.mediaSession.setActionHandler("pause", () => activePlayer().pause());
    navigator.mediaSession.setActionHandler("seekbackward", (details) => {
      const player = activePlayer();
      player.currentTime = Math.max(0, player.currentTime - (details.seekOffset || 10));
    });
    navigator.mediaSession.setActionHandler("seekforward", (details) => {
      const player = activePlayer();
      player.currentTime = Math.min(
        player.duration || Infinity,
        player.currentTime + (details.seekOffset || 10)
      );
    });
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime !== undefined) activePlayer().currentTime = details.seekTime;
    });

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
    };
  }, [itemId, title, channelName, thumbnail]);

  const restartFromBeginning = async () => {
    setResumePosition(null);
    try {
      await api.resetProgress(itemId);
    } catch {
      /* best-effort - still seek locally even if the reset call fails */
    }
    if (videoRef.current) videoRef.current.currentTime = 0;
  };

  return (
    <div className="relative">
      <video
        ref={videoRef}
        src={src}
        controls
        playsInline
        preload="metadata"
        className="aspect-video w-full rounded-md bg-black"
      >
        Dein Browser unterstützt die Videowiedergabe nicht.
      </video>

      {/* Hidden stand-in for the audio track while backgrounded on
          platforms (iOS Safari) that suspend a <video> element's audio the
          moment the app leaves the foreground - see handOffToShadowAudio
          above. preload="none" so it never competes for bandwidth during
          normal (foreground) playback. */}
      <audio ref={shadowAudioRef} src={src} preload="none" className="hidden" />

      {resumePosition !== null && (
        <ResumePlaybackPrompt
          positionLabel={formatDuration(resumePosition)}
          onRestart={restartFromBeginning}
        />
      )}

      {isOfflineSource && (
        <p className="mt-2 text-xs text-text-muted">
          Offline gespeichert - wird von diesem Gerät abgespielt.
        </p>
      )}

      {error && (
        <div className="mt-2 rounded-md bg-error/10 p-3 text-sm text-error">
          <p className="font-medium">Video kann nicht abgespielt werden</p>
          <p>
            {isOfflineSource
              ? "Die offline gespeicherte Datei konnte nicht gelesen werden."
              : "Prüfe deine Verbindung oder bereite das Video erneut vor."}
          </p>
        </div>
      )}

      <div className="mt-2 flex items-center justify-end gap-2">
        <BackgroundAudioButton
          active={backgroundPlaybackMode === "audio"}
          onActivate={() => selectBackgroundPlaybackMode("audio")}
        />
        {settingsRef.current.showPipButton && (
          <PictureInPictureButton
            videoRef={videoRef}
            active={backgroundPlaybackMode === "pip"}
            onActivate={() => selectBackgroundPlaybackMode("pip")}
            onDeactivate={() => selectBackgroundPlaybackMode("audio")}
          />
        )}
      </div>
    </div>
  );
}

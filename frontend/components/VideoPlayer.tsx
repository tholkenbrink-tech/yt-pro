"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { type BackgroundPlaybackMode, getPlayerSettings, setPlayerSettings } from "@/lib/playerSettings";
import { getOfflineBlob } from "@/lib/offlineStore";
import { useDownloadQueueStatus } from "@/lib/downloadQueueStore";
import { shouldStream } from "@/lib/wifiGate";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { isNativeIOS } from "@/lib/nativePlayer";
import { BackgroundAudioButton } from "./BackgroundAudioButton";
import { NativeVideoPlayer } from "./NativeVideoPlayer";
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

/**
 * Inside the iOS native shell (see ios/App/App/NativePlayerPlugin.swift),
 * real Picture-in-Picture and reliable background audio require an actual
 * AVPlayerViewController - the web <video> element (and the workarounds
 * below it, like the shadow-audio element) is a WebKit-imposed ceiling that
 * native AVKit doesn't have. Everywhere else (desktop/mobile browsers, the
 * desktop PWA bookmark), the web implementation is unaffected and unchanged.
 */
export function VideoPlayer(props: Props) {
  // Checked after mount, not during render: isNativeIOS() would otherwise
  // disagree between the server-rendered pass (no `window`, always "web")
  // and the client's first render inside the native shell, causing a
  // hydration mismatch. Starting as "web" and swapping in an effect avoids
  // that at the cost of a brief flash of the web player on native launch.
  const [isNative, setIsNative] = useState(false);
  useEffect(() => {
    setIsNative(isNativeIOS());
  }, []);

  if (isNative) {
    return <NativeVideoPlayer {...props} />;
  }
  return <WebVideoPlayer {...props} />;
}

function WebVideoPlayer({ itemId, title, channelName, thumbnail, autoPlay }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shadowAudioRef = useRef<HTMLAudioElement>(null);
  const isShadowActiveRef = useRef(false);
  const isPrimedRef = useRef(false);
  const lastSavedAtRef = useRef(0);
  const markedWatchedRef = useRef(false);
  const settingsRef = useRef(getPlayerSettings());
  const [resumePosition, setResumePosition] = useState<number | null>(null);
  const [showRestartButton, setShowRestartButton] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [src, setSrc] = useState<string>("");
  const [isOfflineSource, setIsOfflineSource] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const offlineObjectUrlRef = useRef<string | null>(null);
  const [backgroundPlaybackMode, setBackgroundPlaybackMode] = useState<BackgroundPlaybackMode>(
    () => settingsRef.current.backgroundPlaybackMode
  );
  const backgroundPlaybackModeRef = useRef(backgroundPlaybackMode);
  useEffect(() => {
    backgroundPlaybackModeRef.current = backgroundPlaybackMode;
  }, [backgroundPlaybackMode]);
  const online = useOnlineStatus();

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
    setIsOfflineSource(false);
    setIsBuffering(true);
    if (offlineObjectUrlRef.current) {
      URL.revokeObjectURL(offlineObjectUrlRef.current);
      offlineObjectUrlRef.current = null;
    }

    // Offline copy always wins when one exists, so check for it first and
    // deterministically - only fall through to a network streaming attempt
    // once we know for certain there isn't one. Racing both checks in
    // parallel (as this used to) let whichever promise happened to resolve
    // last silently overwrite the other's result, which could pick the
    // network stream even when a local copy was available.
    getOfflineBlob(itemId)
      .then((blob) => {
        if (cancelled) return null;
        if (blob) {
          const objectUrl = URL.createObjectURL(blob);
          offlineObjectUrlRef.current = objectUrl;
          setSrc(objectUrl);
          setIsOfflineSource(true);
          setError(null);
          return null;
        }
        return blob;
      })
      .catch(() => null)
      .then((blob) => {
        if (cancelled || blob) return;

        if (!online) {
          setSrc("");
          setError("offline");
          return;
        }

        shouldStream().then((streamingAllowed) => {
          if (cancelled) return;
          setSrc(streamingAllowed ? api.streamUrl(itemId) : "");
          setError(streamingAllowed ? null : "wifi-required");
        });
      });

    return () => {
      cancelled = true;
      if (offlineObjectUrlRef.current) {
        URL.revokeObjectURL(offlineObjectUrlRef.current);
        offlineObjectUrlRef.current = null;
      }
    };
    // Re-runs when connectivity is restored, so a video that was blocked
    // offline (with no local copy) starts streaming automatically instead
    // of requiring the page to be reopened.
  }, [itemId, online]);

  // If an in-app download for this video finishes while it's already
  // streaming, switch playback over to the local copy right away instead of
  // waiting for the next time this video is opened - the point of "in-app
  // download" is to stop depending on the network, so it should take effect
  // the moment it's ready. currentTime/paused are captured before the swap
  // and restored once the local file's metadata has loaded, so the switch
  // doesn't reset playback position or interrupt an in-progress play.
  const queueStatus = useDownloadQueueStatus(itemId);
  const wasQueuedRef = useRef(false);
  useEffect(() => {
    if (queueStatus === "downloading" || queueStatus === "queued") {
      wasQueuedRef.current = true;
      return;
    }
    if (!wasQueuedRef.current) return;
    wasQueuedRef.current = false;
    if (isOfflineSource) return;

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
      setIsOfflineSource(true);
      setError(null);
    });

    return () => {
      cancelled = true;
    };
  }, [queueStatus, itemId, isOfflineSource]);

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
          setShowRestartButton(true);
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
    const onError = () => {
      setError("network");
      setIsBuffering(false);
    };
    const onCanPlay = () => setIsBuffering(false);
    const onWaiting = () => setIsBuffering(true);

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

    // Chrome only actually auto-enters PiP on tab switch/backgrounding if
    // this handler is registered - it's what the browser invokes itself
    // (bypassing the normal user-gesture requirement) instead of relying on
    // the autoPictureInPicture attribute alone. Only registered while "pip"
    // is the chosen leave-the-app mode, so switching to "audio" doesn't
    // fight the shadow-audio handoff above.
    //
    // "enterpictureinpicture" is a Chrome-only action name, not part of the
    // set every WebKit build recognizes - unlike Chrome, Safari throws a
    // TypeError for unsupported MediaSessionAction values instead of
    // ignoring them, and does so inconsistently across iOS/iPadOS/macOS
    // point releases. That throw is uncaught here (this runs outside any
    // event handler Safari would otherwise swallow it in), which crashed
    // the whole client-side render on iPhone/iPad. Must be try/caught.
    if (backgroundPlaybackMode === "pip") {
      try {
        // Not yet in TS's lib.dom MediaSessionAction union.
        navigator.mediaSession.setActionHandler("enterpictureinpicture" as MediaSessionAction, () => {
          video.requestPictureInPicture().catch(() => undefined);
        });
      } catch {
        /* unsupported action name on this browser - autoPictureInPicture
           attribute still covers auto-enter where it's honored */
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
        /* see try/catch above - unsupported action name on this browser */
      }
    };
  }, [itemId, title, channelName, thumbnail, backgroundPlaybackMode]);

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
      <div className="relative overflow-hidden rounded-2xl bg-black">
        <video
          ref={videoRef}
          src={src || undefined}
          playsInline
          preload="metadata"
          controls
          className="aspect-video w-full"
        >
          Dein Browser unterstützt die Videowiedergabe nicht.
        </video>

        {isBuffering && !error && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20"
          >
            <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-white/30 border-t-white" />
          </div>
        )}
      </div>

      {/* Hidden stand-in for the audio track while backgrounded on
          platforms (iOS Safari) that suspend a <video> element's audio the
          moment the app leaves the foreground - see handOffToShadowAudio
          above. preload="none" so it never competes for bandwidth during
          normal (foreground) playback. */}
      <audio ref={shadowAudioRef} src={src || undefined} preload="none" className="hidden" />

      {isOfflineSource && (
        <p className="mt-2 text-xs text-text-muted">
          Offline gespeichert - wird von diesem Gerät abgespielt.
        </p>
      )}

      {error && (
        <div className="mt-2 rounded-xl bg-error/10 p-3 text-sm text-error">
          <p className="font-medium">
            {error === "wifi-required"
              ? "Streaming nur im WLAN erlaubt"
              : error === "offline"
                ? "Dieses Video ist offline nicht verfügbar"
                : "Video kann nicht abgespielt werden"}
          </p>
          <p>
            {error === "wifi-required"
              ? 'In den Einstellungen ist "Nur im WLAN streamen" aktiviert. Verbinde dich mit dem WLAN oder speichere das Video vorher offline in der App.'
              : error === "offline"
                ? "Verbinde dich mit dem Internet, um es anzusehen, oder speichere es vorher offline in der App."
                : isOfflineSource
                  ? "Die offline gespeicherte Datei konnte nicht gelesen werden."
                  : "Prüfe deine Verbindung oder bereite das Video erneut vor."}
          </p>
        </div>
      )}

      {showRestartButton && (
        <div className="mt-2">
          <ResumePlaybackPrompt
            positionLabel={resumePosition !== null ? formatDuration(resumePosition) : null}
            onRestart={restartFromBeginning}
          />
        </div>
      )}

      <div className="mt-3.5 flex gap-2">
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

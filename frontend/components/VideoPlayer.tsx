"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { getPlayerSettings } from "@/lib/playerSettings";
import { getOfflineBlob } from "@/lib/offlineStore";
import { PictureInPictureButton } from "./PictureInPictureButton";
import { ResumePlaybackPrompt } from "./ResumePlaybackPrompt";

const SAVE_INTERVAL_MS = 7000;
const RESUME_THRESHOLD_SECONDS = 5;
const MARK_WATCHED_PERCENTAGE = 95;
const MARK_WATCHED_REMAINING_SECONDS = 30;

interface Props {
  itemId: string;
}

export function VideoPlayer({ itemId }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSavedAtRef = useRef(0);
  const markedWatchedRef = useRef(false);
  const settingsRef = useRef(getPlayerSettings());
  const [resumePosition, setResumePosition] = useState<number | null>(null);
  const [showResumeToast, setShowResumeToast] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [src, setSrc] = useState<string>(() => api.streamUrl(itemId));
  const [isOfflineSource, setIsOfflineSource] = useState(false);

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
    if (!video) return;

    const onLoadedMetadata = () => {
      // Seek immediately + show a dismissible toast, rather than a blocking
      // "resume?" prompt before playback: it's simpler UX (no extra tap
      // before the user can hit play) and matches the "keep it simple"
      // instruction for this app - the toast still gives an explicit
      // "Von vorne" undo if the auto-seek guessed wrong.
      if (resumePosition !== null) {
        video.currentTime = resumePosition;
        setShowResumeToast(true);
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

    const onVisibilityChange = () => {
      if (document.hidden) saveProgress();
    };
    const onPageHide = () => saveProgress();

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("pause", onPause);
    video.addEventListener("enterpictureinpicture", onEnterPip);
    video.addEventListener("error", onError);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("enterpictureinpicture", onEnterPip);
      video.removeEventListener("error", onError);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      // Best-effort save on unmount - fire-and-forget, never await in
      // cleanup.
      saveProgress(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, resumePosition]);

  const restartFromBeginning = async () => {
    setShowResumeToast(false);
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

      {showResumeToast && resumePosition !== null && (
        <ResumePlaybackPrompt
          positionLabel={formatDuration(resumePosition)}
          onRestart={restartFromBeginning}
          onDismiss={() => setShowResumeToast(false)}
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

      {settingsRef.current.showPipButton && (
        <div className="mt-2 flex items-center justify-end">
          <PictureInPictureButton videoRef={videoRef} />
        </div>
      )}
    </div>
  );
}

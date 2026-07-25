"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  NativePlayer,
  type NativePlayerErrorEvent,
  type NativePlayerTimeUpdate,
} from "@/lib/nativePlayer";
import {
  type BackgroundPlaybackMode,
  getPlayerSettings,
  setPlayerSettings,
} from "@/lib/playerSettings";
import { BackgroundAudioButton } from "./BackgroundAudioButton";
import { BackgroundPipButton } from "./BackgroundPipButton";

const SAVE_INTERVAL_MS = 7000;
const RESUME_THRESHOLD_SECONDS = 5;
const MARK_WATCHED_PERCENTAGE = 95;

interface Props {
  itemId: string;
  title?: string;
  channelName?: string;
  thumbnail?: string;
  autoPlay?: boolean;
}

/**
 * iOS native-shell counterpart to VideoPlayer's web implementation - hands
 * playback off to a native AVPlayerViewController (see
 * ios/App/App/NativePlayerPlugin.swift) instead of an HTML <video> element,
 * since that's the only way to get real Picture-in-Picture and reliable
 * background audio on iOS (both are hard WebKit restrictions on web content
 * in this exact app shell - see PictureInPictureButton.tsx and the shadow-
 * audio workaround in VideoPlayer.tsx for what the web-only version of this
 * problem looks like).
 *
 * Resume position, mark-watched-at-95% and settings persistence all still
 * go through the same api.* calls the web player uses - only the playback
 * surface itself is native here, driven by periodic "timeUpdate" events.
 * The native player is embedded inline (not a fullscreen modal), so there's
 * no native "Done" button - dismissal is always explicit, either the user
 * navigating away (this component unmounting) or opening another video.
 */
export function NativeVideoPlayer({ itemId, title, channelName, thumbnail, autoPlay }: Props) {
  const [isPresented, setIsPresented] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPresentedRef = useRef(false);
  const lastSavedAtRef = useRef(0);
  const markedWatchedRef = useRef(false);
  const settingsRef = useRef(getPlayerSettings());
  const [backgroundPlaybackMode, setBackgroundPlaybackModeState] = useState<BackgroundPlaybackMode>(
    () => settingsRef.current.backgroundPlaybackMode
  );

  const saveProgress = (positionSeconds: number, durationSeconds: number) => {
    if (!durationSeconds || Number.isNaN(durationSeconds)) return;
    api.saveProgress(itemId, { positionSeconds, durationSeconds, playbackRate: 1 }).catch(() => undefined);
  };

  const present = async () => {
    setError(null);
    settingsRef.current = getPlayerSettings();
    markedWatchedRef.current = false;
    try {
      const progress = settingsRef.current.autoResume
        ? await api.getProgress(itemId).catch(() => null)
        : null;
      const startTime =
        progress && progress.positionSeconds > RESUME_THRESHOLD_SECONDS && !progress.completed
          ? progress.positionSeconds
          : 0;
      await NativePlayer.present({
        url: api.streamUrl(itemId),
        title: title || "Video",
        artist: channelName,
        artworkUrl: thumbnail,
        startTime,
        backgroundMode: backgroundPlaybackMode,
      });
      isPresentedRef.current = true;
      setIsPresented(true);
    } catch (err) {
      // Logged rather than shown - the native side's actual rejection
      // reason (e.g. "No root view controller to present from") is far more
      // useful when debugging via Safari's remote Web Inspector than the
      // generic message below, which is all a viewer needs to see.
      console.error("NativePlayer.present failed:", err);
      setError("network");
    }
  };

  useEffect(() => {
    if (autoPlay) present();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  useEffect(() => {
    const timeUpdateSub = NativePlayer.addListener("timeUpdate", (data: NativePlayerTimeUpdate) => {
      const now = Date.now();
      if (now - lastSavedAtRef.current >= SAVE_INTERVAL_MS) {
        lastSavedAtRef.current = now;
        saveProgress(data.positionSeconds, data.durationSeconds);
      }
      if (!markedWatchedRef.current && settingsRef.current.markWatchedAt95 && data.durationSeconds) {
        const pct = (data.positionSeconds / data.durationSeconds) * 100;
        if (pct >= MARK_WATCHED_PERCENTAGE) {
          markedWatchedRef.current = true;
          api.markWatched(itemId).catch(() => undefined);
        }
      }
    });

    // Fires when the asset itself fails to load (auth, deleted file,
    // unsupported codec) - present() has already resolved by then since
    // that only confirms the native player screen was shown, not that
    // playback actually started successfully.
    const errorSub = NativePlayer.addListener("playbackError", (data: NativePlayerErrorEvent) => {
      console.error("NativePlayer playbackError:", data.message);
      setError("network");
    });

    return () => {
      timeUpdateSub.then((handle) => handle.remove());
      errorSub.then((handle) => handle.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  // The native player has no "Done" button to dismiss itself (see the
  // module comment) - navigating away from this page has to explicitly
  // tear it down, or it would keep floating on top of whatever screen the
  // SPA navigates to next.
  useEffect(() => {
    return () => {
      if (!isPresentedRef.current) return;
      isPresentedRef.current = false;
      NativePlayer.dismiss()
        .then(({ positionSeconds }) => {
          saveProgress(positionSeconds, positionSeconds > 0 ? positionSeconds + 1 : 0);
        })
        .catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const selectBackgroundPlaybackMode = (mode: BackgroundPlaybackMode) => {
    setBackgroundPlaybackModeState(mode);
    setPlayerSettings({ backgroundPlaybackMode: mode });
    NativePlayer.setBackgroundMode({ mode }).catch(() => undefined);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={present}
        className="flex aspect-video w-full items-center justify-center rounded-2xl bg-black text-white"
      >
        {isPresented ? "Wiedergabe läuft" : "▶ Abspielen"}
      </button>

      {error && (
        <div className="mt-2 rounded-xl bg-error/10 p-3 text-sm text-error">
          <p className="font-medium">Video kann nicht abgespielt werden</p>
          <p>Prüfe deine Verbindung oder bereite das Video erneut vor.</p>
        </div>
      )}

      <div className="mt-3.5 flex gap-2">
        <BackgroundAudioButton
          active={backgroundPlaybackMode === "audio"}
          onActivate={() => selectBackgroundPlaybackMode("audio")}
        />
        <BackgroundPipButton
          active={backgroundPlaybackMode === "pip"}
          onActivate={() => selectBackgroundPlaybackMode("pip")}
        />
      </div>
    </div>
  );
}

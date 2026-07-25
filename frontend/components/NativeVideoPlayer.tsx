"use client";

import { useEffect, useRef, useState } from "react";
import {
  closeNativePlayer,
  openNativePlayer,
  setNativePlayerBackgroundMode,
  updateNativePlayerFrame,
  useNativePlayerState,
} from "@/lib/nativePlayerStore";
import { type BackgroundPlaybackMode, getPlayerSettings, setPlayerSettings } from "@/lib/playerSettings";
import { BackgroundAudioButton } from "./BackgroundAudioButton";
import { BackgroundPipButton } from "./BackgroundPipButton";

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
 * The player's actual presentation state (present/dismiss, progress-saving,
 * fullscreen/PiP tracking) lives in nativePlayerStore.ts, not here - this
 * component only owns the placeholder element the native surface gets
 * positioned over, and registers/unregisters that placeholder's on-screen
 * bounds with the store. That split is what lets the player keep running
 * (audio, PiP, fullscreen) across SPA navigation: unmounting this component
 * no longer tears the native player down (see the store's module comment
 * for why unconditional teardown-on-unmount was the root cause of the
 * player getting stuck between display states with the app blocked behind
 * it) - only an explicit tap on the close button below does that.
 */
export function NativeVideoPlayer({ itemId, title, channelName, thumbnail, autoPlay }: Props) {
  const placeholderRef = useRef<HTMLButtonElement>(null);
  const playerState = useNativePlayerState();
  const isThisItemPresented = playerState.meta?.itemId === itemId && playerState.isPresented;
  const [backgroundPlaybackMode, setBackgroundPlaybackModeState] = useState<BackgroundPlaybackMode>(
    () => getPlayerSettings().backgroundPlaybackMode
  );

  const present = async () => {
    try {
      await openNativePlayer(
        { itemId, title: title || "Video", channelName, thumbnail },
        { backgroundMode: backgroundPlaybackMode, frame: measureFrame() }
      );
    } catch (err) {
      // Logged rather than shown - the native side's actual rejection
      // reason (e.g. "No root view controller to present from") is far more
      // useful when debugging via Safari's remote Web Inspector than the
      // generic message shown to the user (driven by playerState.error).
      console.error("NativePlayer.present failed:", err);
    }
  };

  const measureFrame = () => {
    const rect = placeholderRef.current?.getBoundingClientRect();
    if (!rect) return undefined;
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  };

  useEffect(() => {
    if (autoPlay) present();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  // Keeps the native player's frame matching the placeholder button's
  // actual on-screen bounds - called on mount, resize/orientation change,
  // scroll, and layout changes (e.g. a sidebar appearing in landscape).
  // Without this the video was pinned at a fixed guessed position, which
  // broke in landscape/sidebar layouts and could sit on top of (and swallow
  // taps meant for) the buttons below it. Guarded by itemId inside
  // updateNativePlayerFrame so this only ever affects the player if it's
  // actually this page's item currently being shown.
  useEffect(() => {
    let rafId: number | null = null;
    const scheduleSync = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const rect = placeholderRef.current?.getBoundingClientRect();
        if (rect) updateNativePlayerFrame(itemId, rect);
      });
    };

    window.addEventListener("resize", scheduleSync);
    window.addEventListener("scroll", scheduleSync, { passive: true });
    const resizeObserver = new ResizeObserver(scheduleSync);
    if (placeholderRef.current) resizeObserver.observe(placeholderRef.current);

    return () => {
      window.removeEventListener("resize", scheduleSync);
      window.removeEventListener("scroll", scheduleSync);
      resizeObserver.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [itemId]);

  const selectBackgroundPlaybackMode = (mode: BackgroundPlaybackMode) => {
    setBackgroundPlaybackModeState(mode);
    setPlayerSettings({ backgroundPlaybackMode: mode });
    setNativePlayerBackgroundMode(mode);
  };

  return (
    <div className="relative">
      <button
        ref={placeholderRef}
        type="button"
        onClick={present}
        className="flex aspect-video w-full items-center justify-center rounded-2xl bg-black text-white"
      >
        {isThisItemPresented ? "Wiedergabe läuft" : "▶ Abspielen"}
      </button>

      {isThisItemPresented && (
        <button
          type="button"
          onClick={closeNativePlayer}
          className="mt-2 min-h-11 rounded-md border border-border px-3 text-sm font-medium text-text-secondary"
        >
          Schließen
        </button>
      )}

      {playerState.error && playerState.meta?.itemId === itemId && (
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

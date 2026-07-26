"use client";

import { useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/format";
import { isNativeIOS } from "@/lib/nativePlayer";
import { getPlayerSettings } from "@/lib/playerSettings";
import {
  loadWebPlayerItem,
  releaseWebPlayerPage,
  restartWebPlayerFromBeginning,
  selectWebPlayerBackgroundMode,
  updateWebPlayerFrame,
  useWebPlayerState,
} from "@/lib/webPlayerStore";
import { BackgroundAudioButton } from "./BackgroundAudioButton";
import { NativeVideoPlayer } from "./NativeVideoPlayer";
import { PictureInPictureButton } from "./PictureInPictureButton";
import { ResumePlaybackPrompt } from "./ResumePlaybackPrompt";

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

/**
 * Web (non-native) placeholder: claims the "inline" slot for `itemId` in
 * webPlayerStore and reports this box's on-screen position so
 * PersistentVideoPlayer (mounted once in AppShell, never torn down by route
 * changes) can position itself exactly over it. Unmounting - i.e. navigating
 * to a different page - releases the slot rather than stopping playback, so
 * background audio (and PiP, once entered) survives in-app navigation; see
 * WebPlayerMiniBar for the way back. All actual player state (buffering,
 * errors, resume position, background-playback mode) is read from the store
 * since the real <video> element lives elsewhere.
 */
function WebVideoPlayer({ itemId, title, channelName, thumbnail, autoPlay }: Props) {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const { meta, mode, resumePosition, showRestartButton, error, isBuffering, isOfflineSource, backgroundPlaybackMode, videoElement } =
    useWebPlayerState();
  const isThisItemActive = meta?.itemId === itemId;

  useEffect(() => {
    loadWebPlayerItem({ itemId, title: title || "Video", channelName, thumbnail }, Boolean(autoPlay));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  // Keeps PersistentVideoPlayer's fixed-position wrapper matching this
  // placeholder's actual on-screen bounds - mirrors NativeVideoPlayer's
  // frame-sync effect for the iOS native shell.
  useEffect(() => {
    let rafId: number | null = null;
    const scheduleSync = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const rect = placeholderRef.current?.getBoundingClientRect();
        if (rect) updateWebPlayerFrame(itemId, rect);
      });
    };

    scheduleSync();
    window.addEventListener("resize", scheduleSync);
    window.addEventListener("scroll", scheduleSync, { passive: true });
    const resizeObserver = new ResizeObserver(scheduleSync);
    if (placeholderRef.current) resizeObserver.observe(placeholderRef.current);

    return () => {
      window.removeEventListener("resize", scheduleSync);
      window.removeEventListener("scroll", scheduleSync);
      resizeObserver.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
      releaseWebPlayerPage(itemId);
    };
  }, [itemId]);

  const restartFromBeginning = () => {
    restartWebPlayerFromBeginning(itemId);
  };

  const showPipButton = getPlayerSettings().showPipButton;
  const activeMode = isThisItemActive ? backgroundPlaybackMode : "audio";

  return (
    <div className="relative">
      {/* PersistentVideoPlayer's fixed-position <video> visually sits over
          this box while it's the inline (on-page) target - see the
          frame-sync effect above. Kept as a plain black box so layout
          doesn't jump before the first measurement lands. */}
      <div ref={placeholderRef} className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
        {isThisItemActive && mode === "inline" && isBuffering && !error && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20"
          >
            <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-white/30 border-t-white" />
          </div>
        )}
      </div>

      {isThisItemActive && isOfflineSource && (
        <p className="mt-2 text-xs text-text-muted">
          Offline gespeichert - wird von diesem Gerät abgespielt.
        </p>
      )}

      {isThisItemActive && error && (
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

      {isThisItemActive && showRestartButton && (
        <div className="mt-2">
          <ResumePlaybackPrompt
            positionLabel={resumePosition !== null ? formatDuration(resumePosition) : null}
            onRestart={restartFromBeginning}
          />
        </div>
      )}

      <div className="mt-3.5 flex gap-2">
        <BackgroundAudioButton
          active={activeMode === "audio"}
          onActivate={() => selectWebPlayerBackgroundMode("audio")}
        />
        {showPipButton && (
          <PictureInPictureButton
            video={isThisItemActive ? videoElement : null}
            active={activeMode === "pip"}
            onActivate={() => selectWebPlayerBackgroundMode("pip")}
            onDeactivate={() => selectWebPlayerBackgroundMode("audio")}
          />
        )}
      </div>
    </div>
  );
}

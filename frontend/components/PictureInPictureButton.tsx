"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ToastProvider";

interface LegacyPresentationVideo extends HTMLVideoElement {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitPresentationMode?: string;
}

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Whether "pip" is the current leave-the-app preference - drives the
   * highlighted/active look. Mutually exclusive with the audio button. */
  active: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
}

const WEBKIT_CONFIRM_TIMEOUT_MS = 600;

/**
 * Feature-detects the older iOS Safari presentation-mode API
 * (`webkitSupportsPresentationMode`/`webkitSetPresentationMode`) FIRST,
 * falling back to the standard PiP API (`document.pictureInPictureEnabled`)
 * only when it isn't available - not the other way around. Safari reports
 * `document.pictureInPictureEnabled === true` even when the standard
 * `requestPictureInPicture()` call silently fails, which it reliably does
 * in standalone (home-screen) PWA mode specifically - the webkit API is the
 * one that's actually always worked there. Renders nothing if neither is
 * available. SSR-safe: defaults to null, only checks in an effect.
 *
 * Clicking still immediately toggles real Picture-in-Picture right now (as
 * before) - this also doubles as a manual fallback for browser contexts
 * where automatically following the video into PiP on backgrounding isn't
 * reliable. On top of that it marks "pip" as the active leave-the-app
 * choice, and reverts to the audio default when PiP is exited (by this
 * button, or by the user closing the native PiP window directly).
 *
 * The legacy webkit call is fire-and-forget - it never rejects, so a
 * silent failure (which is exactly what's been reported from iOS home-
 * screen/"open as app" contexts) looks identical to success unless we wait
 * for the browser's own `webkitpresentationmodechanged` confirmation and
 * time out if it never arrives.
 */
export function PictureInPictureButton({ videoRef, active, onActivate, onDeactivate }: Props) {
  const [mode, setMode] = useState<"standard" | "webkit" | null>(null);
  const { showToast } = useToast();
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const video = videoRef.current as LegacyPresentationVideo | null;
    if (!video) return;

    const detect = () => {
      if (video.webkitSupportsPresentationMode?.("picture-in-picture")) {
        setMode("webkit");
        return;
      }
      if (typeof document !== "undefined" && document.pictureInPictureEnabled) {
        setMode("standard");
      }
    };
    detect();
    // Re-check once metadata is loaded - some browsers only populate these
    // capability hooks once the video element actually has a source.
    video.addEventListener("loadedmetadata", detect);
    return () => video.removeEventListener("loadedmetadata", detect);
  }, [videoRef]);

  useEffect(() => {
    const video = videoRef.current as LegacyPresentationVideo | null;
    if (!video) return;

    const onLeaveStandard = () => onDeactivate();
    const onWebkitModeChanged = () => {
      if (confirmTimeoutRef.current) {
        clearTimeout(confirmTimeoutRef.current);
        confirmTimeoutRef.current = null;
      }
      if (video.webkitPresentationMode === "picture-in-picture") {
        onActivate();
      } else {
        onDeactivate();
      }
    };

    video.addEventListener("leavepictureinpicture", onLeaveStandard);
    video.addEventListener("webkitpresentationmodechanged", onWebkitModeChanged);
    return () => {
      video.removeEventListener("leavepictureinpicture", onLeaveStandard);
      video.removeEventListener("webkitpresentationmodechanged", onWebkitModeChanged);
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef]);

  if (!mode) return null;

  const toggle = async () => {
    const video = videoRef.current as LegacyPresentationVideo | null;
    if (!video) return;

    if (mode === "webkit") {
      const enteringPip = video.webkitPresentationMode !== "picture-in-picture";
      video.webkitSetPresentationMode?.(enteringPip ? "picture-in-picture" : "inline");
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = setTimeout(() => {
        confirmTimeoutRef.current = null;
        showToast("Bild-in-Bild in diesem Kontext nicht möglich");
      }, WEBKIT_CONFIRM_TIMEOUT_MS);
      return;
    }

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        onDeactivate();
      } else {
        // requestPictureInPicture() throws exactly "The video element does
        // not support PIP" when called before the element has a decoded
        // video frame available (readyState < HAVE_CURRENT_DATA) - e.g. a
        // freshly-launched installed PWA with an empty cache, where
        // `preload="metadata"` hasn't resolved yet by the time this is
        // tapped, unlike a browser tab that often already has the video
        // warmed up from prior browsing. Waiting the rest of the way out
        // here fixes that timing gap without weakening the gesture
        // requirement, since we're still inside the same click handler.
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          await new Promise<void>((resolve) => {
            const onReady = () => {
              video.removeEventListener("loadeddata", onReady);
              resolve();
            };
            video.addEventListener("loadeddata", onReady);
          });
        }
        await video.requestPictureInPicture();
        onActivate();
      }
    } catch (err) {
      // Surfaced instead of silently swallowed - a silent failure here is
      // indistinguishable from the button doing nothing at all, which made
      // context-specific PiP breakage (e.g. installed desktop app windows)
      // impossible to diagnose.
      showToast(
        `Bild-in-Bild nicht möglich${err instanceof Error && err.message ? `: ${err.message}` : ""}`
      );
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={active}
      aria-label="Bild-in-Bild umschalten"
      className={`flex min-h-11 min-w-11 items-center justify-center rounded-md border ${
        active ? "border-accent bg-accent/10 text-accent" : "border-border bg-surface text-text-primary"
      }`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
        <rect x="12" y="11" width="7" height="5" rx="1" fill="currentColor" />
      </svg>
    </button>
  );
}

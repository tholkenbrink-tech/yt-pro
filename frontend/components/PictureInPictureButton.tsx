"use client";

import { useEffect, useState } from "react";

interface LegacyPresentationVideo extends HTMLVideoElement {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitPresentationMode?: string;
}

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

/**
 * Feature-detects standard PiP (`document.pictureInPictureEnabled`) first,
 * falls back to the older iOS Safari presentation-mode API
 * (`webkitSupportsPresentationMode`/`webkitSetPresentationMode`), and
 * renders nothing if neither is available - never show a button that
 * doesn't work. SSR-safe: defaults to false, only checks in an effect.
 */
export function PictureInPictureButton({ videoRef }: Props) {
  const [mode, setMode] = useState<"standard" | "webkit" | null>(null);

  useEffect(() => {
    if (typeof document !== "undefined" && document.pictureInPictureEnabled) {
      setMode("standard");
      return;
    }
    const video = videoRef.current as LegacyPresentationVideo | null;
    if (video?.webkitSupportsPresentationMode?.("picture-in-picture")) {
      setMode("webkit");
    }
  }, [videoRef]);

  if (!mode) return null;

  const toggle = async () => {
    const video = videoRef.current as LegacyPresentationVideo | null;
    if (!video) return;
    if (mode === "standard") {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await video.requestPictureInPicture();
        }
      } catch {
        /* PiP request rejected (e.g. user gesture requirement) - ignore */
      }
    } else if (mode === "webkit") {
      const current = video.webkitPresentationMode;
      video.webkitSetPresentationMode?.(
        current === "picture-in-picture" ? "inline" : "picture-in-picture"
      );
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Bild-in-Bild umschalten"
      className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border bg-surface text-text-primary"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
        <rect x="12" y="11" width="7" height="5" rx="1" fill="currentColor" />
      </svg>
    </button>
  );
}

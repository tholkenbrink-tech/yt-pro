import { Capacitor, registerPlugin } from "@capacitor/core";
import type { BackgroundPlaybackMode } from "./playerSettings";

export interface NativePlayerTimeUpdate {
  positionSeconds: number;
  durationSeconds: number;
  isPlaying: boolean;
}

export interface NativePlayerErrorEvent {
  message: string;
}

export interface NativePlayerFullscreenChangeEvent {
  isFullscreen: boolean;
}

export interface NativePlayerPipChangeEvent {
  isActive: boolean;
  error?: string;
}

export interface NativePlayerFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NativePlayerPresentOptions extends NativePlayerFrame {
  url: string;
  title: string;
  artist?: string;
  artworkUrl?: string;
  startTime?: number;
  backgroundMode: BackgroundPlaybackMode;
}

export interface NativePlayerPluginInterface {
  present(options: NativePlayerPresentOptions): Promise<void>;
  dismiss(): Promise<{ positionSeconds: number }>;
  setBackgroundMode(options: { mode: BackgroundPlaybackMode }): Promise<void>;
  /** Repositions the native player to match the HTML placeholder's current
   * bounds - called on resize/orientation change/scroll so the video stays
   * aligned with the page's actual (possibly responsive/sidebar) layout
   * instead of a fixed guess. */
  updateFrame(frame: NativePlayerFrame): Promise<void>;
  addListener(
    eventName: "timeUpdate",
    listenerFunc: (data: NativePlayerTimeUpdate) => void
  ): Promise<{ remove: () => void }>;
  addListener(
    eventName: "playbackError",
    listenerFunc: (data: NativePlayerErrorEvent) => void
  ): Promise<{ remove: () => void }>;
  /** Fires when AVKit's own fullscreen presentation actually finishes
   * entering/exiting (after its animation coordinator completes) - not on
   * every tap, so this reflects the transition having genuinely settled. */
  addListener(
    eventName: "fullscreenChange",
    listenerFunc: (data: NativePlayerFullscreenChangeEvent) => void
  ): Promise<{ remove: () => void }>;
  /** Fires when real system Picture-in-Picture starts/stops/fails - driven
   * by AVKit's own delegate callbacks, so this is the source of truth for
   * "is PiP actually active" rather than anything we infer from a click. */
  addListener(
    eventName: "pipChange",
    listenerFunc: (data: NativePlayerPipChangeEvent) => void
  ): Promise<{ remove: () => void }>;
  /** Fires when the user taps "restore" on the system PiP overlay (or
   * auto-restore triggers) - the web side should navigate back to the
   * video's page if it isn't already showing, so the placeholder that
   * anchors the player's frame exists again. */
  addListener(
    eventName: "pipRestoreRequested",
    listenerFunc: () => void
  ): Promise<{ remove: () => void }>;
}

// See ios/App/App/NativePlayerPlugin.swift - only registered/implemented on
// iOS. Calling any method on other platforms would reject since there's no
// native handler; isNativeIOS() below is what call sites gate on instead.
export const NativePlayer = registerPlugin<NativePlayerPluginInterface>("NativePlayer");

export function isNativeIOS(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

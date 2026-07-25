import { Capacitor, registerPlugin } from "@capacitor/core";
import type { BackgroundPlaybackMode } from "./playerSettings";

export interface NativePlayerTimeUpdate {
  positionSeconds: number;
  durationSeconds: number;
  isPlaying: boolean;
}

export interface NativePlayerClosedEvent {
  positionSeconds: number;
}

export interface NativePlayerPresentOptions {
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
  addListener(
    eventName: "timeUpdate",
    listenerFunc: (data: NativePlayerTimeUpdate) => void
  ): Promise<{ remove: () => void }>;
  addListener(
    eventName: "closed",
    listenerFunc: (data: NativePlayerClosedEvent) => void
  ): Promise<{ remove: () => void }>;
}

// See ios/App/App/NativePlayerPlugin.swift - only registered/implemented on
// iOS. Calling any method on other platforms would reject since there's no
// native handler; isNativeIOS() below is what call sites gate on instead.
export const NativePlayer = registerPlugin<NativePlayerPluginInterface>("NativePlayer");

export function isNativeIOS(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

import { getCachedUserId } from "./currentUser";

const BASE_KEY = "yt-pro:player-settings";

// Namespaced per logged-in family account, see currentUser.ts.
function storageKey(): string {
  const userId = getCachedUserId();
  return userId ? `${BASE_KEY}:${userId}` : BASE_KEY;
}

/**
 * What happens when the user leaves the app while a video is playing:
 * "audio" keeps the audio track playing in the background (the default),
 * "pip" pops the video into a floating Picture-in-Picture window instead.
 */
export type BackgroundPlaybackMode = "audio" | "pip";

export interface PlayerSettings {
  autoResume: boolean;
  rememberPlaybackRate: boolean;
  markWatchedAt95: boolean;
  replayAfterFinish: boolean;
  showPipButton: boolean;
  backgroundPlaybackMode: BackgroundPlaybackMode;
}

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  autoResume: true,
  rememberPlaybackRate: true,
  markWatchedAt95: true,
  replayAfterFinish: true,
  showPipButton: true,
  backgroundPlaybackMode: "audio",
};

export function getPlayerSettings(): PlayerSettings {
  if (typeof localStorage === "undefined") return DEFAULT_PLAYER_SETTINGS;
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return DEFAULT_PLAYER_SETTINGS;
    return { ...DEFAULT_PLAYER_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PLAYER_SETTINGS;
  }
}

export function setPlayerSettings(settings: Partial<PlayerSettings>) {
  if (typeof localStorage === "undefined") return;
  const merged = { ...getPlayerSettings(), ...settings };
  localStorage.setItem(storageKey(), JSON.stringify(merged));
}

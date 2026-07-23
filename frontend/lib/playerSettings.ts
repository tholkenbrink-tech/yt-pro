const KEY = "yt-pro:player-settings";

export interface PlayerSettings {
  autoResume: boolean;
  rememberPlaybackRate: boolean;
  markWatchedAt95: boolean;
  replayAfterFinish: boolean;
  showPipButton: boolean;
}

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  autoResume: true,
  rememberPlaybackRate: true,
  markWatchedAt95: true,
  replayAfterFinish: true,
  showPipButton: true,
};

export function getPlayerSettings(): PlayerSettings {
  if (typeof localStorage === "undefined") return DEFAULT_PLAYER_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PLAYER_SETTINGS;
    return { ...DEFAULT_PLAYER_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PLAYER_SETTINGS;
  }
}

export function setPlayerSettings(settings: Partial<PlayerSettings>) {
  if (typeof localStorage === "undefined") return;
  const merged = { ...getPlayerSettings(), ...settings };
  localStorage.setItem(KEY, JSON.stringify(merged));
}

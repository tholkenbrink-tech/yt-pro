const KEY = "yt-pro:current-user-id";

/** Cache of the logged-in user's id, kept in sync by api.ts on login/session/
 * logout. Lets purely-client-side settings (lib/localSettings.ts,
 * lib/playerSettings.ts) namespace their localStorage keys per family
 * account without needing a React auth context everywhere. */
export function getCachedUserId(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(KEY);
}

export function setCachedUserId(id: string) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, id);
}

export function clearCachedUserId() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(KEY);
}

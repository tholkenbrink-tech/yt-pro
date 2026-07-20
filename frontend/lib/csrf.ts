/**
 * Reads the non-HttpOnly `csrf_token` cookie so it can be echoed back in the
 * `X-CSRF-Token` header on mutating requests (double-submit cookie pattern).
 */
export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

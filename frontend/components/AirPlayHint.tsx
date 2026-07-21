/** Static hint only - there is no reliable JS API to detect/trigger AirPlay
 * availability on iOS Safari; the native <video> controls already expose
 * AirPlay when available, so we never build a custom trigger. */
export function AirPlayHint() {
  return (
    <p className="mt-2 flex items-center gap-1.5 text-meta text-text-muted">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M6 18 12 11l6 7H6Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M4 15V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      AirPlay verfügbar über die Wiedergabesteuerung
    </p>
  );
}

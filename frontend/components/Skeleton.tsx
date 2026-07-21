/** Pulsing/shimmer placeholder block matching the shape of the real content
 * that will replace it, so loading never causes a layout jump. Falls back
 * to a static muted block under prefers-reduced-motion (handled in
 * globals.css's `.skeleton` rule). Purely decorative - hidden from
 * assistive tech. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton rounded-md ${className}`} />;
}

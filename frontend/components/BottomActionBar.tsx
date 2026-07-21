/** Sticky bottom action area used by multi-step flows (single-video
 * preview's "Download vorbereiten", playlist preview's selection summary +
 * "N Videos vorbereiten"). Floats just above the mobile bottom nav using
 * the live `--mobile-nav-height` custom property (0 on md+, where the nav
 * is hidden and the sidebar takes the place of bottom chrome instead), and
 * respects the iPhone home-indicator safe area. */
export function BottomActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-x-0 z-20 border-t border-border bg-surface-elevated/95 px-4 pt-3 backdrop-blur md:left-64"
      style={{
        bottom: "var(--mobile-nav-height, 0px)",
        paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
      }}
    >
      <div className="mx-auto max-w-lg">{children}</div>
    </div>
  );
}

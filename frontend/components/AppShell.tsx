"use client";

import { usePathname } from "next/navigation";
import { DesktopSidebar } from "./DesktopSidebar";
import { MobileBottomNavigation } from "./MobileBottomNavigation";
import { NativePlayerMiniBar } from "./NativePlayerMiniBar";

const NO_CHROME_PATHS = ["/login"];

/** Wraps the authenticated app: mobile bottom tab bar below `md`, desktop
 * sidebar at `md`+. Skips its own chrome on login, which renders outside the
 * normal shell. `/offline` (the service worker's last-resort navigation
 * fallback, see public/sw.js) deliberately keeps the normal chrome so it's
 * never a dead end - the user can always tap through to the rest of the
 * app instead of being stuck on that page. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const skipChrome = NO_CHROME_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (skipChrome) return <>{children}</>;

  return (
    <>
      <DesktopSidebar />
      {/* pb reserves space for the fixed mobile bottom nav (height published
          as --mobile-nav-height by MobileBottomNavigation) so page content
          never renders underneath it - 0 on md+ where the nav is hidden. */}
      <div className="pb-[var(--mobile-nav-height)] md:pb-0 md:pl-64">{children}</div>
      <NativePlayerMiniBar />
      <MobileBottomNavigation />
    </>
  );
}

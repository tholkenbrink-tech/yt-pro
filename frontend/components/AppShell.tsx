"use client";

import { usePathname } from "next/navigation";
import { DesktopSidebar } from "./DesktopSidebar";
import { MobileBottomNavigation } from "./MobileBottomNavigation";

const NO_CHROME_PATHS = ["/login", "/offline"];

/** Wraps the authenticated app: mobile bottom tab bar below `md`, desktop
 * sidebar at `md`+. Skips its own chrome on login/offline, which render
 * outside the normal shell. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const skipChrome = NO_CHROME_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (skipChrome) return <>{children}</>;

  return (
    <>
      <DesktopSidebar />
      <div className="md:pl-64">{children}</div>
      <MobileBottomNavigation />
    </>
  );
}

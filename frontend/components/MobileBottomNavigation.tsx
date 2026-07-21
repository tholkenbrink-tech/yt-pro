"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ActivityIcon, DownloadIcon, LibraryIcon, SettingsIcon } from "./navIcons";

const NAV_ITEMS = [
  { href: "/download", label: "Download", Icon: DownloadIcon },
  { href: "/activity", label: "Aktivität", Icon: ActivityIcon },
  { href: "/library", label: "Mediathek", Icon: LibraryIcon },
  { href: "/settings", label: "Einstellungen", Icon: SettingsIcon },
];

/** Mobile (< md) bottom tab bar - adapted from the Phase 1 `BottomNav`. */
export function MobileBottomNavigation() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  // Publishes this nav's rendered height (0 when `md:hidden` collapses it)
  // as a CSS variable so sticky action bars/toasts can float just above it
  // without hardcoding a pixel offset that would drift from the real
  // safe-area padding.
  useEffect(() => {
    const el = navRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => {
      document.documentElement.style.setProperty("--mobile-nav-height", `${el.offsetHeight}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      ref={navRef}
      className="bottom-nav fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-surface/95 backdrop-blur md:hidden"
      aria-label="Hauptnavigation"
    >
      <ul className="mx-auto flex max-w-lg justify-around">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 flex-col items-center justify-center gap-0.5 px-2 py-2 text-xs font-medium ${
                  active ? "text-accent" : "text-text-secondary"
                }`}
              >
                <Icon active={active} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

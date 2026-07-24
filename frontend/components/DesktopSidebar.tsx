"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import packageJson from "../package.json";
import { ActivityIcon, DownloadIcon, LibraryIcon, SettingsIcon } from "./navIcons";
import { StorageStrip } from "./StorageStrip";

const NAV_ITEMS = [
  { href: "/library", label: "Mediathek", Icon: LibraryIcon },
  { href: "/download", label: "Download", Icon: DownloadIcon },
  { href: "/activity", label: "Aktivität", Icon: ActivityIcon },
  { href: "/settings", label: "Einstellungen", Icon: SettingsIcon },
];

/** Desktop/tablet (>= md) sidebar - replaces the bottom tab bar at wider
 * viewports; the bottom bar and this sidebar never render simultaneously. */
export function DesktopSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      router.push("/login");
    }
  };

  return (
    <aside className="fixed bottom-0 left-0 top-0 z-30 hidden w-64 flex-col border-r border-border bg-surface p-4 md:flex">
      <div className="mb-6 flex items-center gap-2 px-2">
        <Image src="/icons/icon-192.png" alt="" width={28} height={28} className="rounded-md" />
        <span className="text-card-title font-bold text-text-primary">yt-pro</span>
      </div>

      <nav aria-label="Hauptnavigation" className="flex-1">
        <ul className="space-y-1">
          {NAV_ITEMS.map(({ href, label, Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
                    active ? "bg-accent/10 text-accent" : "text-text-secondary hover:bg-surface-elevated"
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

      <div className="space-y-3 border-t border-border pt-3">
        <StorageStrip compact />
        <button
          type="button"
          onClick={logout}
          className="min-h-11 w-full rounded-md border border-border px-3 py-2 text-left text-sm font-medium text-text-secondary hover:bg-surface-elevated"
        >
          Abmelden
        </button>
        <p className="px-1 text-meta text-text-muted">v{packageJson.version}</p>
      </div>
    </aside>
  );
}

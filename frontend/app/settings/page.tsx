"use client";

import Link from "next/link";

export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-lg px-4 pb-4 pt-6">
      <h1 className="mb-4 text-page-title">Einstellungen</h1>

      <ul className="mb-6 space-y-2">
        {[
          { href: "/settings/sources", label: "Playlists" },
          { href: "/settings/download", label: "Download Einstellung" },
          { href: "/settings/player", label: "Player" },
          { href: "/settings/storage", label: "Speicher" },
          { href: "/settings/account", label: "Konto" },
        ].map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="flex min-h-11 items-center justify-between rounded-md border border-border p-3 text-sm font-medium"
            >
              {item.label}
              <span aria-hidden="true">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

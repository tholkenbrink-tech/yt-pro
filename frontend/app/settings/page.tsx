"use client";

import Link from "next/link";

export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-lg px-4 pb-4 pt-6">
      <h1 className="mb-4 text-page-title">Einstellungen</h1>

      <ul className="mb-6 space-y-2">
        {[
          { href: "/settings/download", label: "Download" },
          { href: "/settings/player", label: "Player" },
          { href: "/settings/sources", label: "Automatische Quellen" },
          { href: "/settings/storage", label: "Speicher" },
          { href: "/settings/design", label: "Design" },
          { href: "/settings/youtube", label: "YouTube-Zugang" },
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

      <section>
        <h2 className="mb-2 text-section-title">Erweitert</h2>
        <p className="text-meta text-text-muted">
          Worker/Scheduler-Status: nicht verfügbar (kein Backend-Endpunkt).
        </p>
        <p className="text-meta text-text-muted">
          yt-dlp/ffmpeg-Version: nicht verfügbar (kein Backend-Endpunkt).
        </p>
      </section>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { StorageInfo } from "@/lib/types";
import { formatBytes } from "@/lib/format";

const GENERAL_ITEMS = [
  { href: "/settings/sources", label: "Playlists" },
  { href: "/settings/download", label: "Download Einstellung" },
  { href: "/settings/player", label: "Player" },
];

const SYSTEM_ITEMS = [
  { href: "/settings/storage", label: "Speicher" },
  { href: "/settings/account", label: "Konto" },
];

function SettingsGroup({ items }: { items: { href: string; label: string }[] }) {
  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-border bg-surface">
      {items.map((item, i) => (
        <Link
          key={item.href}
          href={item.href}
          className={`flex min-h-[46px] items-center justify-between px-3.5 text-sm font-medium text-text-primary ${
            i < items.length - 1 ? "border-b border-border" : ""
          }`}
        >
          {item.label}
          <span aria-hidden="true" className="text-text-muted">
            ›
          </span>
        </Link>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const [storage, setStorage] = useState<StorageInfo | null>(null);

  useEffect(() => {
    api.storage().then(setStorage).catch(() => undefined);
  }, []);

  const total = storage ? storage.usedBytes + storage.freeBytes : 0;
  const usedPct = storage && total > 0 ? Math.min(100, Math.round((storage.usedBytes / total) * 100)) : 0;

  return (
    <main className="mx-auto max-w-lg px-4 pb-4 pt-6">
      <h1 className="mb-4 text-page-title">Einstellungen</h1>

      {storage && (
        <Link
          href="/settings/storage"
          className="mb-4 block rounded-2xl border border-border bg-surface p-3.5"
        >
          <div className="flex items-center justify-between text-[13px] text-text-secondary">
            <span>Speicher</span>
            <span>
              {formatBytes(storage.usedBytes)} von {formatBytes(total)} belegt
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-progress-track">
            <div className="h-full rounded-full bg-accent" style={{ width: `${usedPct}%` }} />
          </div>
        </Link>
      )}

      <p className="mb-1.5 px-1 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
        Allgemein
      </p>
      <SettingsGroup items={GENERAL_ITEMS} />

      <p className="mb-1.5 px-1 text-[12px] font-semibold uppercase tracking-wide text-text-muted">System</p>
      <SettingsGroup items={SYSTEM_ITEMS} />
    </main>
  );
}

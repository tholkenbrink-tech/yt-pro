"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { MonitoredSource } from "@/lib/types";
import { AutomatedSourceCard } from "@/components/AutomatedSourceCard";

export default function SourcesPage() {
  const [sources, setSources] = useState<MonitoredSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api
      .listSources()
      // Quick Access playlists are manually-triggered bookmarks managed from
      // the download page, not scheduled automation - keep them out of this list.
      .then((all) => setSources(all.filter((s) => !s.isQuickAccess)))
      .catch(() => setError("Quellen konnten nicht geladen werden."))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <main className="mx-auto max-w-2xl px-4 pb-4 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-page-title">Playlists</h1>
        <Link
          href="/settings/sources/new"
          aria-label="Neue Quelle"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-md bg-accent px-3 py-2 text-sm font-medium text-white"
        >
          +
        </Link>
      </div>

      {loading && <p className="text-sm text-text-muted">Wird geladen...</p>}
      {error && <p className="text-sm text-error">{error}</p>}
      {!loading && sources.length === 0 && !error && (
        <p className="text-sm text-text-muted">
          Noch keine automatischen Quellen eingerichtet.
        </p>
      )}

      <div className="space-y-3">
        {sources.map((source) => (
          <AutomatedSourceCard key={source.id} source={source} onChanged={load} />
        ))}
      </div>
    </main>
  );
}

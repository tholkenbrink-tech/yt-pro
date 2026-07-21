"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { LibraryItem, LibraryQuery } from "@/lib/types";
import { MediaCard } from "@/components/MediaCard";
import { Skeleton } from "@/components/Skeleton";
import { SortSheet } from "@/components/SortSheet";

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Alle" },
  { value: "new", label: "Neu" },
  { value: "started", label: "Begonnen" },
  { value: "watched", label: "Angesehen" },
  { value: "expiring_soon", label: "Läuft bald ab" },
];

const ORIGIN_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Alle" },
  { value: "manual", label: "Manuell" },
  { value: "automatic", label: "Automatisch" },
];

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "date_desc", label: "Neueste" },
  { value: "date_asc", label: "Älteste" },
  { value: "title", label: "Titel" },
  { value: "size", label: "Größe" },
  { value: "duration", label: "Dauer" },
  { value: "last_watched", label: "Zuletzt angesehen" },
  { value: "published", label: "Veröffentlichung" },
];

export default function LibraryPage() {
  const [query, setQuery] = useState<LibraryQuery>({ sort: "date_desc" });
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortSheetOpen, setSortSheetOpen] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .library({ ...query, query: search || undefined })
      .then(setItems)
      .catch(() => setError("Mediathek konnte nicht geladen werden."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-4 pt-6">
      <h1 className="mb-4 text-page-title">Mediathek</h1>

      <div className="mb-3 flex gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Titel, Kanal oder Quelle suchen..."
          aria-label="Mediathek durchsuchen"
          className="min-h-11 flex-1 rounded-md border border-border bg-surface p-2 text-text-primary"
        />
        <button
          type="button"
          onClick={load}
          className="min-h-11 rounded-md border border-border px-3 py-2 text-sm"
        >
          Suchen
        </button>
      </div>

      <div className="mb-2 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setQuery((q) => ({ ...q, status: f.value || undefined }))}
            className={`min-h-11 rounded-pill border px-3 py-1.5 text-xs font-medium ${
              (query.status ?? "") === f.value
                ? "border-accent bg-accent text-white"
                : "border-border text-text-secondary"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {ORIGIN_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setQuery((q) => ({ ...q, origin: f.value || undefined }))}
            className={`min-h-11 rounded-pill border px-3 py-1.5 text-xs font-medium ${
              (query.origin ?? "") === f.value
                ? "border-accent bg-accent text-white"
                : "border-border text-text-secondary"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mb-4">
        {/* Below md, a native <select> is fiddly to tap precisely and looks
            out of place next to the pill filters, so it opens a bottom
            sheet instead - matches the app's "sheets and drawers"
            interaction pattern. md+ has room for the plain select. */}
        <button
          type="button"
          onClick={() => setSortSheetOpen(true)}
          className="min-h-11 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary md:hidden"
        >
          Sortieren: {SORT_OPTIONS.find((o) => o.value === (query.sort ?? "date_desc"))?.label}
        </button>
        <div className="hidden md:block">
          <label htmlFor="sort" className="sr-only">
            Sortieren
          </label>
          <select
            id="sort"
            value={query.sort ?? "date_desc"}
            onChange={(e) => setQuery((q) => ({ ...q, sort: e.target.value }))}
            className="min-h-11 rounded-md border border-border bg-surface p-2 text-sm text-text-primary"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-md border border-border bg-surface p-3">
              <div className="flex items-start gap-3">
                <Skeleton className="h-[63px] w-28 shrink-0" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-3 w-2/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
              </div>
              <Skeleton className="mt-3 h-9 w-1/2" />
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-error">{error}</p>}
      {!loading && items.length === 0 && !error && (
        <div>
          <p className="text-sm font-medium text-text-primary">Noch keine Videos vorbereitet</p>
          <p className="mt-1 text-sm text-text-muted">
            Fertige Videos werden hier angezeigt und können auf dein iPhone geladen werden.
          </p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <MediaCard key={item.id} item={item} onChanged={load} />
          ))}
        </div>
      )}

      <SortSheet
        open={sortSheetOpen}
        options={SORT_OPTIONS}
        selected={query.sort ?? "date_desc"}
        onSelect={(value) => setQuery((q) => ({ ...q, sort: value }))}
        onClose={() => setSortSheetOpen(false)}
      />
    </main>
  );
}

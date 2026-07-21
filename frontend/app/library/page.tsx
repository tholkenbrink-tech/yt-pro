"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { LibraryItem, LibraryQuery } from "@/lib/types";
import { MediaCard } from "@/components/MediaCard";

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

      {loading && <p className="text-sm text-text-muted">Wird geladen...</p>}
      {error && <p className="text-sm text-error">{error}</p>}
      {!loading && items.length === 0 && !error && (
        <p className="text-sm text-text-muted">Keine Videos gefunden.</p>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <MediaCard key={item.id} item={item} onChanged={load} />
        ))}
      </div>
    </main>
  );
}

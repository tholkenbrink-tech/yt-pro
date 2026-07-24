"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { api } from "@/lib/api";
import type { LibraryItem, LibraryQuery } from "@/lib/types";
import { MediaCard } from "@/components/MediaCard";
import { Skeleton } from "@/components/Skeleton";
import { SortSheet } from "@/components/SortSheet";
import { listOfflineMeta } from "@/lib/offlineStore";
import { useUsers } from "@/lib/useUsers";

function displayName(name: string) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Alle" },
  { value: "new", label: "Neu" },
  { value: "watched", label: "Angesehen" },
  { value: "downloaded-to-device", label: "Heruntergeladen" },
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

interface FolderGroup {
  key: string;
  label: string;
  thumbnail?: string;
  items: LibraryItem[];
}

function groupItems(items: LibraryItem[]): { standalone: LibraryItem[]; groups: FolderGroup[] } {
  const bySource = new Map<string, LibraryItem[]>();
  const byJob = new Map<string, LibraryItem[]>();
  for (const item of items) {
    if (item.sourceId) {
      bySource.set(item.sourceId, [...(bySource.get(item.sourceId) ?? []), item]);
    } else if (item.jobId) {
      byJob.set(item.jobId, [...(byJob.get(item.jobId) ?? []), item]);
    }
  }

  const groups: FolderGroup[] = [];
  const groupedIds = new Set<string>();

  for (const [sourceId, groupedItems] of bySource) {
    groups.push({
      key: `source:${sourceId}`,
      label: groupedItems[0].sourceName ?? "Automatische Quelle",
      thumbnail: groupedItems[0].thumbnailPath,
      items: groupedItems,
    });
    groupedItems.forEach((i) => groupedIds.add(i.id));
  }

  for (const [jobId, groupedItems] of byJob) {
    if (groupedItems.length < 2) continue; // single-item manual job -> standalone, not a folder
    groups.push({
      key: `job:${jobId}`,
      label: groupedItems[0].playlistTitle ?? "Playlist",
      thumbnail: groupedItems[0].thumbnailPath,
      items: groupedItems,
    });
    groupedItems.forEach((i) => groupedIds.add(i.id));
  }

  const standalone = items.filter((i) => !groupedIds.has(i.id));
  return { standalone, groups };
}

function FolderCard({ group, onOpen }: { group: FolderGroup; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="rounded-md border border-border bg-surface p-3 text-left"
    >
      <div className="flex items-start gap-3">
        {group.thumbnail && (
          <Image
            src={group.thumbnail}
            alt=""
            width={112}
            height={63}
            unoptimized
            className="h-[63px] w-28 shrink-0 rounded object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-card-title">📁 {group.label}</p>
          <p className="mt-1 text-meta text-text-muted">{group.items.length} Videos</p>
        </div>
      </div>
    </button>
  );
}

export default function LibraryPage() {
  const [query, setQuery] = useState<LibraryQuery>({ sort: "date_desc" });
  const users = useUsers();
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offlineOnly, setOfflineOnly] = useState(false);
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [openFolder, setOpenFolder] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    setOfflineOnly(false);
    // "Heruntergeladen" also needs to include videos that only have an
    // on-device offline copy (client-side IndexedDB, the server has no idea
    // about those) - fetch unfiltered from the backend for that case and
    // merge in the offline-saved set client-side instead.
    const isDownloadedFilter = query.status === "downloaded-to-device";
    api
      .library({ ...query, status: isDownloadedFilter ? undefined : query.status, query: search || undefined })
      .then(async (fetched) => {
        if (!isDownloadedFilter) {
          setItems(fetched);
          return;
        }
        const offline = await listOfflineMeta();
        const offlineIds = new Set(offline.map((m) => m.id));
        setItems(fetched.filter((i) => i.status === "downloaded_to_device" || offlineIds.has(i.id)));
      })
      .catch(async () => {
        const offline = await listOfflineMeta();
        if (offline.length > 0) {
          setOfflineOnly(true);
          setItems(
            offline.map((meta) => ({
              id: meta.id,
              title: meta.title,
              channelName: meta.channelName,
              duration: meta.duration,
              selectedQuality: meta.selectedQuality,
              fileSize: meta.fileSize,
              mimeType: meta.mimeType,
              status: "ready",
              isAutomaticallyPrepared: false,
              createdAt: meta.savedAt,
              keepOnServer: true,
              progress: null,
              originalUrl: meta.originalUrl,
            }))
          );
        } else {
          setError("Mediathek konnte nicht geladen werden.");
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    setOpenFolder(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const { standalone, groups } = useMemo(() => groupItems(items), [items]);
  const activeGroup = groups.find((g) => g.key === openFolder) ?? null;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-4 pt-6">
      <h1 className="mb-4 text-page-title">Mediathek</h1>

      <div className="mb-3 flex gap-2">
        <div className="relative min-h-11 flex-1">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Titel, Kanal oder Quelle suchen..."
            aria-label="Mediathek durchsuchen"
            className="min-h-11 w-full rounded-md border border-border bg-surface p-2 pr-11 text-text-primary"
          />
          <button
            type="button"
            onClick={load}
            aria-label="Suchen"
            className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-text-secondary"
          >
            🔍
          </button>
        </div>

        {/* Below md, a native <select> is fiddly to tap precisely and looks
            out of place, so it opens a bottom sheet instead - matches the
            app's "sheets and drawers" interaction pattern. md+ has room for
            the plain select. */}
        <button
          type="button"
          onClick={() => setSortSheetOpen(true)}
          className="min-h-11 shrink-0 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary md:hidden"
        >
          Sortieren: {SORT_OPTIONS.find((o) => o.value === (query.sort ?? "date_desc"))?.label}
        </button>
        <div className="hidden shrink-0 md:block">
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

      <div className="mb-3 flex flex-wrap gap-2">
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

      {users.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {[
            { value: undefined, label: "Nur ich" },
            ...users.map((u) => ({ value: u.id, label: displayName(u.name) })),
            { value: "all", label: "Alle" },
          ].map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setQuery((q) => ({ ...q, userId: f.value }))}
              className={`min-h-11 rounded-pill border px-3 py-1.5 text-xs font-medium ${
                (query.userId ?? undefined) === f.value
                  ? "border-accent bg-accent text-white"
                  : "border-border text-text-secondary"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

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
      {offlineOnly && (
        <p className="mb-3 rounded-md bg-info/10 p-3 text-sm text-info">
          Keine Verbindung zum Server - es werden nur offline gespeicherte Videos angezeigt.
        </p>
      )}
      {!loading && items.length === 0 && !error && (
        <div>
          <p className="text-sm font-medium text-text-primary">Noch keine Videos vorbereitet</p>
          <p className="mt-1 text-sm text-text-muted">
            Fertige Videos werden hier angezeigt und können auf dein iPhone geladen werden.
          </p>
        </div>
      )}

      {!loading && activeGroup && (
        <>
          <button
            type="button"
            onClick={() => setOpenFolder(null)}
            className="mb-3 min-h-11 rounded-md border border-border px-3 py-2 text-sm font-medium"
          >
            ← Zurück zur Mediathek
          </button>
          <h2 className="mb-3 text-card-title">📁 {activeGroup.label}</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {activeGroup.items.map((item) => (
              <MediaCard key={item.id} item={item} onChanged={load} showOwner={Boolean(query.userId)} />
            ))}
          </div>
        </>
      )}

      {!loading && !activeGroup && items.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <FolderCard key={group.key} group={group} onOpen={() => setOpenFolder(group.key)} />
          ))}
          {standalone.map((item) => (
            <MediaCard key={item.id} item={item} onChanged={load} showOwner={Boolean(query.userId)} />
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

"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { api } from "@/lib/api";
import type { LibraryItem, LibraryQuery } from "@/lib/types";
import { MediaCard } from "@/components/MediaCard";
import { Skeleton } from "@/components/Skeleton";
import { FilterSheet } from "@/components/FilterSheet";
import { FilterIcon } from "@/components/navIcons";
import { listOfflineMeta } from "@/lib/offlineStore";
import { listDownloadedToDeviceIds } from "@/lib/deviceDownloadStore";
import { useUsers } from "@/lib/useUsers";
import { getCachedUserId } from "@/lib/currentUser";

function displayName(name: string) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const OVERVIEW_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Alle" },
  { value: "new", label: "Neu" },
  { value: "watched", label: "Angesehen" },
];

const STORAGE_FILTERS: { value: string; label: string }[] = [
  { value: "saved-in-app", label: "In der App gespeichert" },
  { value: "saved-on-device", label: "Auf Gerät gespeichert" },
];

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "date_desc", label: "Neueste" },
  { value: "date_asc", label: "Älteste" },
  { value: "title", label: "Titel" },
  { value: "size", label: "Größe" },
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

const FolderCard = memo(function FolderCard({ group, onOpen }: { group: FolderGroup; onOpen: () => void }) {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center gap-3 rounded-2xl p-2.5 text-left transition-colors hover:bg-surface"
    >
      <div className="relative h-[74px] w-[74px] shrink-0">
        <div className="absolute left-1.5 top-1.5 h-full w-full rounded-xl bg-surface-elevated" aria-hidden="true" />
        {group.thumbnail && !thumbnailFailed ? (
          <Image
            src={group.thumbnail}
            alt=""
            width={74}
            height={74}
            unoptimized
            onError={() => setThumbnailFailed(true)}
            className="absolute inset-0 h-[74px] w-[74px] rounded-xl border border-border object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex h-[74px] w-[74px] items-center justify-center rounded-xl border border-border bg-surface-elevated text-lg text-text-muted">
            🎬
          </div>
        )}
        <span className="absolute -bottom-1 -right-1 rounded-pill border-2 border-background bg-accent px-1.5 text-[10px] font-bold leading-[18px] text-white">
          {group.items.length}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-card-title notranslate" translate="no">
          {group.label}
        </p>
        <p className="mt-0.5 text-meta text-text-muted">{group.items.length} Videos · Playlist</p>
      </div>
      <span className="shrink-0 text-lg text-text-muted">›</span>
    </button>
  );
});

export default function LibraryPage() {
  const selfId = getCachedUserId() ?? undefined;
  const [query, setQuery] = useState<LibraryQuery>({
    sort: "date_desc",
    userId: selfId,
  });
  const users = useUsers();
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offlineOnly, setOfflineOnly] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [openFolder, setOpenFolder] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    setOfflineOnly(false);
    // "In der App" / "Auf Gerät" are purely client-side (IndexedDB / this
    // browser's local bookkeeping) - the server has no idea about either,
    // so fetch unfiltered and filter the result client-side instead.
    const isClientOnlyFilter = query.status === "saved-in-app" || query.status === "saved-on-device";
    api
      .library({ ...query, status: isClientOnlyFilter ? undefined : query.status, query: search || undefined })
      .then(async (fetched) => {
        if (query.status === "saved-in-app") {
          const offline = await listOfflineMeta();
          const offlineIds = new Set(offline.map((m) => m.id));
          setItems(fetched.filter((i) => offlineIds.has(i.id)));
          return;
        }
        if (query.status === "saved-on-device") {
          const deviceIds = new Set(listDownloadedToDeviceIds());
          setItems(fetched.filter((i) => deviceIds.has(i.id)));
          return;
        }
        setItems(fetched);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, search]);

  useEffect(() => {
    load();
    setOpenFolder(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const { standalone, groups } = useMemo(() => groupItems(items), [items]);
  const activeGroup = groups.find((g) => g.key === openFolder) ?? null;
  const continueWatching = useMemo(
    () => items.filter((i) => i.progress && !i.progress.completed && i.progress.positionSeconds > 0),
    [items]
  );

  const sort = query.sort ?? "date_desc";
  const status = query.status ?? "";
  const hasActiveFilters = sort !== "date_desc" || status !== "" || (query.userId ?? undefined) !== selfId;
  const sortLabel = SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "Neueste";
  const statusLabel = [...OVERVIEW_FILTERS, ...STORAGE_FILTERS].find((o) => o.value === status && o.value !== "")?.label;
  const userLabel =
    query.userId === "all" ? "Alle" : query.userId && query.userId !== selfId ? displayName(users.find((u) => u.id === query.userId)?.name ?? "") : null;
  const summaryParts = [`Sortiert nach ${sortLabel}`, statusLabel, userLabel].filter(Boolean);
  const summaryLine = summaryParts.join(" · ") + (hasActiveFilters ? " — antippen zum Ändern" : "");
  const userOptions = [
    ...users.map((u) => ({ value: u.id as string, label: displayName(u.name) })),
    { value: "all", label: "Alle" },
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 pb-4 pt-6">
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Image src="/apple-touch-icon.png" alt="" width={26} height={26} className="rounded-lg" unoptimized />
          <h1 className="text-page-title">Mediathek</h1>
        </div>
        <button
          type="button"
          onClick={() => setFilterSheetOpen(true)}
          aria-label="Filter und Sortierung öffnen"
          className="relative flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl border border-border text-text-secondary"
        >
          <FilterIcon />
          {hasActiveFilters && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-accent" />
          )}
        </button>
      </div>

      <div className="relative mb-3.5 min-h-11">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Titel, Kanal oder Quelle suchen..."
          aria-label="Mediathek durchsuchen"
          className="min-h-11 w-full rounded-2xl border border-border bg-surface p-2 pr-11 text-text-primary"
        />
        <button
          type="button"
          onClick={load}
          aria-label="Suchen"
          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-text-secondary"
        >
          🔍
        </button>
      </div>

      <div className="mb-4 flex gap-1.5">
        {OVERVIEW_FILTERS.map((opt) => {
          const active = status === opt.value;
          return (
            <button
              key={opt.value || "all"}
              type="button"
              onClick={() => setQuery((q) => ({ ...q, status: opt.value || undefined }))}
              className={`rounded-xl px-3 py-1.5 text-[12.5px] font-semibold ${
                active ? "bg-accent text-white" : "border border-border text-text-secondary"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setFilterSheetOpen(true)}
        className="mb-4 -mt-2 block text-left text-meta text-text-muted"
      >
        {summaryLine}
      </button>

      {loading && (
        <div className="grid grid-cols-1 gap-1 md:grid-cols-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-start gap-3 p-2.5">
              <Skeleton className="h-[74px] w-[74px] shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2 pt-1">
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-3 w-2/5" />
                <Skeleton className="h-3 w-3/5" />
              </div>
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
      {!loading && items.length === 0 && !error && !offlineOnly && (
        <div className="rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="text-sm font-medium text-text-primary">Noch keine Videos vorbereitet</p>
          <p className="mt-1 text-sm text-text-muted">
            Fertige Videos werden hier angezeigt und können auf dein iPhone geladen werden.
          </p>
          <Link
            href="/download"
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 py-3 font-medium text-white"
          >
            Jetzt YouTube-Video herunterladen
          </Link>
        </div>
      )}

      {!loading && activeGroup && (
        <>
          <button
            type="button"
            onClick={() => setOpenFolder(null)}
            className="mb-3 min-h-11 rounded-xl border border-border px-3 py-2 text-sm font-medium"
          >
            ← Zurück zur Mediathek
          </button>
          <h2 className="mb-3 text-card-title">📁 {activeGroup.label}</h2>
          <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
            {activeGroup.items.map((item) => (
              <MediaCard key={item.id} item={item} onChanged={load} showOwner={query.userId === "all" || (Boolean(query.userId) && query.userId !== selfId)} />
            ))}
          </div>
        </>
      )}

      {!loading && !activeGroup && items.length > 0 && (
        <>
          {continueWatching.length > 0 && (
            <div className="mb-5">
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
                Weiter ansehen
              </p>
              <div className="flex gap-2.5 overflow-x-auto pb-1">
                {continueWatching.map((item) => (
                  <Link key={item.id} href={`/library/${item.id}`} className="w-[150px] shrink-0">
                    <div className="relative h-[84px] w-[150px] overflow-hidden rounded-xl bg-surface-elevated">
                      {item.thumbnailPath ? (
                        <Image
                          src={item.thumbnailPath}
                          alt=""
                          width={150}
                          height={84}
                          unoptimized
                          className="h-[84px] w-[150px] object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-lg text-text-muted">🎬</div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
                        <div
                          className="h-full bg-accent"
                          style={{ width: `${Math.min(100, Math.max(0, item.progress?.percentage ?? 0))}%` }}
                        />
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center bg-black/15 text-lg text-white">
                        ▶
                      </div>
                    </div>
                    <p className="mt-1.5 w-[150px] truncate text-[12.5px] text-text-primary notranslate" translate="no">
                      {item.title}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {(groups.length > 0 || standalone.length > 0) && (
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-text-muted">Bibliothek</p>
          )}
          <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
            {groups.map((group) => (
              <FolderCard key={group.key} group={group} onOpen={() => setOpenFolder(group.key)} />
            ))}
            {standalone.map((item) => (
              <MediaCard key={item.id} item={item} onChanged={load} showOwner={query.userId === "all" || (Boolean(query.userId) && query.userId !== selfId)} />
            ))}
          </div>
        </>
      )}

      <FilterSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        sortOptions={SORT_OPTIONS}
        sort={sort}
        onSortChange={(value) => setQuery((q) => ({ ...q, sort: value }))}
        overviewOptions={OVERVIEW_FILTERS}
        storageOptions={STORAGE_FILTERS}
        status={status}
        onStatusChange={(value) => setQuery((q) => ({ ...q, status: q.status === value ? undefined : value || undefined }))}
        showUsers={users.length > 1}
        userOptions={userOptions}
        userId={(query.userId as string) ?? ""}
        onUserChange={(value) => setQuery((q) => ({ ...q, userId: value }))}
        onReset={() => {
          setQuery({ sort: "date_desc", userId: selfId });
          setSearch("");
        }}
      />
    </main>
  );
}

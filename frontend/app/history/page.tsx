"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { JobItem } from "@/lib/types";
import { StatusPill } from "@/components/StatusPill";
import { formatDate } from "@/lib/format";
import { useUsers } from "@/lib/useUsers";
import { getCachedUserId } from "@/lib/currentUser";

function displayName(name: string) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const STATUS_FILTERS = [
  { value: "", label: "Alle" },
  { value: "ready", label: "Bereit" },
  { value: "downloaded_to_device", label: "Geladen" },
  { value: "failed", label: "Fehlgeschlagen" },
  { value: "expired", label: "Abgelaufen" },
];

export default function HistoryPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("date_desc");
  const selfId = getCachedUserId() ?? undefined;
  const [userId, setUserId] = useState<string | undefined>(selfId);
  const users = useUsers();
  const [items, setItems] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .history({ query: query || undefined, status: status || undefined, sort, userId })
      .then(setItems)
      .catch(() => setError("Verlauf konnte nicht geladen werden."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, sort, userId]);

  const remove = async (id: string) => {
    await api.deleteHistoryItem(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const reprepare = async (id: string) => {
    await api.reprepareHistoryItem(id);
    load();
  };

  return (
    <main className="mx-auto max-w-lg px-4 pb-4 pt-6">
      <h1 className="mb-4 text-xl font-bold">Verlauf</h1>

      <div className="mb-3 flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Suchen..."
          className="flex-1 rounded-lg border border-gray-300 bg-white p-2 dark:border-gray-700 dark:bg-gray-900"
        />
        <button
          type="button"
          onClick={load}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700"
        >
          Suchen
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatus(f.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              status === f.value
                ? "border-brand bg-brand text-white dark:border-brand-dark dark:bg-brand-dark dark:text-gray-950"
                : "border-gray-300 dark:border-gray-700"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mb-3">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
        >
          <option value="date_desc">Neueste zuerst</option>
          <option value="date_asc">Älteste zuerst</option>
        </select>
      </div>

      {users.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {[
            ...users.map((u) => ({ value: u.id as string | undefined, label: displayName(u.name) })),
            { value: "all", label: "Alle" },
          ].map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setUserId(f.value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                userId === f.value
                  ? "border-brand bg-brand text-white dark:border-brand-dark dark:bg-brand-dark dark:text-gray-950"
                  : "border-gray-300 dark:border-gray-700"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {loading && <p className="text-sm text-gray-500 dark:text-gray-400">Wird geladen...</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-lg border border-gray-200 p-3 dark:border-gray-800"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium">{item.title}</p>
              <StatusPill status={item.status} />
            </div>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              {formatDate(item.createdAt)}
              {(userId === "all" || (userId && userId !== selfId)) && item.ownerName
                ? ` · 👤 ${item.ownerName}`
                : ""}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => reprepare(item.id)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium dark:border-gray-700"
              >
                Erneut erstellen
              </button>
              <button
                type="button"
                onClick={() => remove(item.id)}
                className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 dark:border-red-900 dark:text-red-400"
              >
                Löschen
              </button>
            </div>
          </li>
        ))}
      </ul>

      {!loading && items.length === 0 && !error && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Keine Einträge gefunden.
        </p>
      )}
    </main>
  );
}

"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { api } from "@/lib/api";
import type { MonitoredSource } from "@/lib/types";
import { SourceStatusBadge } from "./SourceStatusBadge";
import { sourceScheduleLabel, sourceModeLabel } from "@/lib/sourceStatusLabels";
import { formatDate } from "@/lib/format";

interface Props {
  source: MonitoredSource;
  onChanged?: () => void;
}

export function AutomatedSourceCard({ source, onChanged }: Props) {
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      if (source.enabled) await api.pauseSource(source.id);
      else await api.resumeSource(source.id);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="flex items-start gap-3">
        {source.thumbnailUrl && (
          <Image
            src={source.thumbnailUrl}
            alt=""
            width={80}
            height={45}
            unoptimized
            className="h-[45px] w-20 shrink-0 rounded object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <Link href={`/settings/sources/${source.id}`} className="truncate text-card-title hover:underline">
            {source.name}
          </Link>
          {source.playlistTitle && (
            <p className="truncate text-meta text-text-muted">{source.playlistTitle}</p>
          )}
          <p className="mt-1 text-meta text-text-muted">
            {sourceScheduleLabel(source.scheduleType)} - {sourceModeLabel(source.mode)}
            {source.downloadProfileId ? ` - ${source.downloadProfileId}` : ""}
          </p>
          <div className="mt-1.5">
            <SourceStatusBadge status={source.computedStatus} />
          </div>
        </div>
      </div>

      <p className="mt-2 text-meta text-text-muted">
        {source.lastCheckedAt ? `Zuletzt geprüft: ${formatDate(source.lastCheckedAt)}` : "Noch nicht geprüft"}
        {source.nextCheckAt ? ` - Nächste Prüfung: ${formatDate(source.nextCheckAt)}` : ""}
      </p>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={toggle}
          className="min-h-11 rounded-md border border-border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {source.enabled ? "Pausieren" : "Fortsetzen"}
        </button>
        <Link
          href={`/settings/sources/${source.id}`}
          className="flex min-h-11 items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium"
        >
          Details
        </Link>
      </div>
    </div>
  );
}

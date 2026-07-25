"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { api } from "@/lib/api";
import type { MonitoredSource } from "@/lib/types";
import type { BadgeTone } from "./StatusBadge";
import { BottomSheet } from "./BottomSheet";
import { sourceScheduleLabel, sourceModeLabel, sourceStatusLabel } from "@/lib/sourceStatusLabels";
import { formatDate } from "@/lib/format";

interface Props {
  source: MonitoredSource;
  onChanged?: () => void;
}

const TONES: Record<MonitoredSource["computedStatus"], BadgeTone> = {
  active: "success",
  checking: "info",
  newItems: "accent",
  noChanges: "neutral",
  paused: "neutral",
  authRequired: "warning",
  failed: "error",
};
const TONE_DOT: Record<BadgeTone, string> = {
  success: "bg-success",
  info: "bg-info",
  accent: "bg-accent",
  neutral: "bg-text-muted",
  warning: "bg-warning",
  error: "bg-error",
};

export function AutomatedSourceCard({ source, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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

  const tone = TONES[source.computedStatus];

  return (
    <div className="flex items-center gap-3 rounded-2xl p-2.5 transition-colors hover:bg-surface">
      {source.thumbnailUrl ? (
        <Image
          src={source.thumbnailUrl}
          alt=""
          width={56}
          height={56}
          unoptimized
          className="h-14 w-14 shrink-0 rounded-xl border border-border object-cover"
        />
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-elevated text-lg text-text-muted">
          📁
        </div>
      )}
      <div className="min-w-0 flex-1">
        <Link href={`/settings/sources/${source.id}`} className="truncate text-sm font-semibold text-text-primary">
          {source.name}
        </Link>
        <p className="mt-0.5 truncate text-meta text-text-muted">
          {sourceScheduleLabel(source.scheduleType)} · {sourceModeLabel(source.mode)}
        </p>
      </div>
      <span
        title={sourceStatusLabel(source.computedStatus)}
        aria-label={sourceStatusLabel(source.computedStatus)}
        className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT[tone]}`}
      />
      <button
        type="button"
        aria-label="Weitere Aktionen"
        onClick={() => setMenuOpen(true)}
        className="flex h-8 w-6 shrink-0 items-center justify-center text-base text-text-muted"
      >
        ⋯
      </button>

      <BottomSheet open={menuOpen} title={source.name} onClose={() => setMenuOpen(false)}>
        <div className="flex flex-col gap-1">
          <p className="px-3 pb-1 text-meta text-text-muted">
            {source.lastCheckedAt ? `Zuletzt geprüft: ${formatDate(source.lastCheckedAt)}` : "Noch nicht geprüft"}
            {source.nextCheckAt ? ` · Nächste Prüfung: ${formatDate(source.nextCheckAt)}` : ""}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setMenuOpen(false);
              toggle();
            }}
            className="flex min-h-11 items-center rounded-xl px-3 text-left text-sm font-medium text-text-primary disabled:opacity-50"
          >
            {source.enabled ? "Pausieren" : "Fortsetzen"}
          </button>
          <Link
            href={`/settings/sources/${source.id}`}
            onClick={() => setMenuOpen(false)}
            className="flex min-h-11 items-center rounded-xl px-3 text-left text-sm font-medium text-text-primary"
          >
            Details
          </Link>
        </div>
      </BottomSheet>
    </div>
  );
}

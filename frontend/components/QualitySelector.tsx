"use client";

import type { Quality } from "@/lib/types";
import { formatBytes } from "@/lib/format";
import { getDownloadSettings } from "@/lib/localSettings";

interface Props {
  qualities: Quality[];
  selected: string;
  onSelect: (name: string) => void;
}

export function QualitySelector({ qualities, selected, onSelect }: Props) {
  const defaultQuality = getDownloadSettings().defaultQuality;
  const hasDefault = qualities.some((q) => q.name === defaultQuality);
  return (
    <div>
      <div
        className="flex gap-1.5 rounded-2xl bg-surface-elevated p-1"
        role="radiogroup"
        aria-label="Qualität wählen"
      >
        {qualities.map((q) => {
          const active = q.name === selected;
          return (
            <button
              key={q.name}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(q.name)}
              className={`flex-1 rounded-xl px-2 py-2 text-sm font-medium ${
                active ? "bg-accent font-semibold text-white" : "text-text-secondary"
              }`}
            >
              {q.label}
              {q.name === defaultQuality && "*"}
              {q.estimatedSize !== undefined && (
                <span className="ml-1 text-xs opacity-75">({formatBytes(q.estimatedSize)})</span>
              )}
            </button>
          );
        })}
      </div>
      {hasDefault && <p className="mt-1.5 text-xs text-text-muted">*Standardauswahl</p>}
    </div>
  );
}

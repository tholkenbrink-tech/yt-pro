"use client";

import type { Quality } from "@/lib/types";
import { formatBytes } from "@/lib/format";

const DEFAULT_QUALITY = "720p";

interface Props {
  qualities: Quality[];
  selected: string;
  onSelect: (name: string) => void;
}

export function QualitySelector({ qualities, selected, onSelect }: Props) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Qualität wählen">
      {qualities.map((q) => {
        const active = q.name === selected;
        return (
          <button
            key={q.name}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(q.name)}
            className={`relative rounded-full border px-4 py-2 text-sm font-medium ${
              active
                ? "border-brand bg-brand text-white dark:border-brand-dark dark:bg-brand-dark dark:text-gray-950"
                : "border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-200"
            }`}
          >
            {q.label}
            {q.estimatedSize !== undefined && (
              <span className="ml-1 text-xs opacity-75">
                ({formatBytes(q.estimatedSize)})
              </span>
            )}
            {q.name === DEFAULT_QUALITY && (
              <span className="absolute -top-2 -right-2 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                Standardauswahl
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

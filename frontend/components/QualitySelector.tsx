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
              className={`rounded-full border px-4 py-2 text-sm font-medium ${
                active
                  ? "border-brand bg-brand text-white dark:border-brand-dark dark:bg-brand-dark dark:text-gray-950"
                  : "border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-200"
              }`}
            >
              {q.label}
              {q.name === defaultQuality && "*"}
              {q.estimatedSize !== undefined && (
                <span className="ml-1 text-xs opacity-75">
                  ({formatBytes(q.estimatedSize)})
                </span>
              )}
            </button>
          );
        })}
      </div>
      {hasDefault && <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">*Standardauswahl</p>}
    </div>
  );
}

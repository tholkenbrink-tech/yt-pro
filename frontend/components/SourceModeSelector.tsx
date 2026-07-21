"use client";

import type { SourceMode } from "@/lib/types";
import { SOURCE_MODE_DESCRIPTIONS, sourceModeLabel } from "@/lib/sourceStatusLabels";

const OPTIONS: SourceMode[] = ["discover_only", "confirm_first", "auto_prepare"];

interface Props {
  mode: SourceMode;
  onChange: (mode: SourceMode) => void;
}

export function SourceModeSelector({ mode, onChange }: Props) {
  return (
    <div className="space-y-2" role="radiogroup" aria-label="Modus wählen">
      {OPTIONS.map((opt) => {
        const active = mode === opt;
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt)}
            className={`min-h-11 w-full rounded-md border p-3 text-left ${
              active ? "border-accent bg-accent/10" : "border-border"
            }`}
          >
            <span className="block text-sm font-medium">{sourceModeLabel(opt)}</span>
            <span className="block text-meta text-text-muted">
              {SOURCE_MODE_DESCRIPTIONS[opt]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

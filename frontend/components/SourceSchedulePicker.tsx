"use client";

import type { SourceScheduleType } from "@/lib/types";
import { sourceScheduleLabel } from "@/lib/sourceStatusLabels";

const OPTIONS: SourceScheduleType[] = ["manual", "every_6h", "every_12h", "daily", "weekly"];

interface Props {
  schedule: SourceScheduleType;
  cronExpression: string;
  onScheduleChange: (schedule: SourceScheduleType) => void;
  onCronChange: (cron: string) => void;
}

export function SourceSchedulePicker({
  schedule,
  cronExpression,
  onScheduleChange,
  onCronChange,
}: Props) {
  return (
    <div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Prüfintervall wählen">
        {OPTIONS.map((opt) => {
          const active = schedule === opt;
          return (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onScheduleChange(opt)}
              className={`min-h-11 rounded-pill border px-4 py-2 text-sm font-medium ${
                active ? "border-accent bg-accent text-white" : "border-border text-text-secondary"
              }`}
            >
              {sourceScheduleLabel(opt)}
            </button>
          );
        })}
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-text-secondary">
          Erweitert
        </summary>
        <div className="mt-2">
          <label htmlFor="cron-expression" className="mb-1 block text-sm font-medium">
            Cron-Ausdruck
          </label>
          <input
            id="cron-expression"
            type="text"
            value={cronExpression}
            onChange={(e) => {
              onCronChange(e.target.value);
              onScheduleChange("cron");
            }}
            placeholder="0 */6 * * *"
            className="min-h-11 w-full rounded-md border border-border bg-surface p-2 text-sm text-text-primary"
          />
        </div>
      </details>
    </div>
  );
}

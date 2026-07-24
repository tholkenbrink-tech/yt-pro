"use client";

import { BottomSheet } from "./BottomSheet";

interface Option {
  value: string;
  label: string;
}

interface ChipGroupProps {
  label: string;
  options: Option[];
  selected: string;
  onSelect: (value: string) => void;
}

function ChipGroup({ label, options, selected, onSelect }: ChipGroupProps) {
  return (
    <div className="mb-5">
      <p className="mb-2 text-[12.5px] font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = selected === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(o.value)}
              className={`min-h-9 rounded-pill border px-3.5 py-1.5 text-sm font-medium ${
                active ? "border-accent bg-accent text-white" : "border-border text-text-secondary"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  sortOptions: Option[];
  sort: string;
  onSortChange: (value: string) => void;
  overviewOptions: Option[];
  storageOptions: Option[];
  status: string;
  onStatusChange: (value: string) => void;
  showUsers: boolean;
  userOptions: Option[];
  userId: string;
  onUserChange: (value: string) => void;
  onReset: () => void;
}

/** Combined sort + status + person filter sheet - replaces the always-visible
 * sort control and pill rows with a single sheet, reusing SortSheet's
 * checkmark-row pattern for the sort section. */
export function FilterSheet({
  open,
  onClose,
  sortOptions,
  sort,
  onSortChange,
  overviewOptions,
  storageOptions,
  status,
  onStatusChange,
  showUsers,
  userOptions,
  userId,
  onUserChange,
  onReset,
}: Props) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-card-title">Filter &amp; Sortierung</h2>
        <button type="button" onClick={onReset} className="min-h-9 text-sm font-medium text-accent">
          Zurücksetzen
        </button>
      </div>

      <p className="mb-2 text-[12.5px] font-semibold uppercase tracking-wide text-text-muted">Sortieren nach</p>
      <ul className="mb-5 space-y-1">
        {sortOptions.map((o) => {
          const active = o.value === sort;
          return (
            <li key={o.value}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onSortChange(o.value)}
                className={`flex min-h-10 w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium ${
                  active ? "bg-accent/10 text-accent" : "text-text-primary"
                }`}
              >
                {o.label}
                {active && <span aria-hidden="true">✓</span>}
              </button>
            </li>
          );
        })}
      </ul>

      <ChipGroup label="Übersicht" options={overviewOptions} selected={status} onSelect={onStatusChange} />
      <ChipGroup label="Speicherort" options={storageOptions} selected={status} onSelect={onStatusChange} />
      {showUsers && (
        <ChipGroup label="Person" options={userOptions} selected={userId} onSelect={onUserChange} />
      )}

      <button
        type="button"
        onClick={onClose}
        className="mt-2 min-h-11 w-full rounded-md bg-accent py-3 text-sm font-semibold text-white"
      >
        Fertig
      </button>
    </BottomSheet>
  );
}

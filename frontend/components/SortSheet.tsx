"use client";

import { BottomSheet } from "./BottomSheet";

interface Option {
  value: string;
  label: string;
}

interface Props {
  open: boolean;
  title?: string;
  options: Option[];
  selected: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

/** Mobile bottom-sheet replacement for a native `<select>` sort control -
 * matches the "sheets and drawers" native-feeling-interaction principle.
 * Desktop/tablet keep the plain `<select>` since there's room for it. */
export function SortSheet({ open, title = "Sortieren nach", options, selected, onSelect, onClose }: Props) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <ul className="space-y-1">
        {options.map((o) => {
          const active = o.value === selected;
          return (
            <li key={o.value}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => {
                  onSelect(o.value);
                  onClose();
                }}
                className={`flex min-h-11 w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium ${
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
    </BottomSheet>
  );
}

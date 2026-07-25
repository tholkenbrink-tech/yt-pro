"use client";

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

/** Shared boolean-setting control - replaces native `<input type="checkbox">`
 * rows across Settings/preview screens with a 34x20px pill switch. */
export function Switch({ checked, onChange, label, disabled }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-[34px] shrink-0 rounded-pill transition-colors disabled:opacity-50 ${
        checked ? "bg-accent" : "bg-progress-track"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${
          checked ? "right-0.5 bg-white" : "left-0.5 bg-text-muted"
        }`}
      />
    </button>
  );
}

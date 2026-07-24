"use client";

import { useEffect, useState } from "react";
import { getTheme, setTheme as persistTheme } from "@/lib/theme";
import { useToast } from "@/components/ToastProvider";

type ThemeValue = "system" | "light" | "dark";

const THEME_OPTIONS: { value: ThemeValue; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Hell" },
  { value: "dark", label: "Dunkel" },
];

export default function DesignSettingsPage() {
  const [theme, setThemeState] = useState<ThemeValue>("system");
  const { showToast } = useToast();

  useEffect(() => {
    setThemeState(getTheme());
  }, []);

  const changeTheme = (value: ThemeValue) => {
    setThemeState(value);
    persistTheme(value);
    showToast("Einstellung gespeichert");
  };

  return (
    <main className="mx-auto max-w-lg px-4 pb-4 pt-6">
      <h1 className="mb-4 text-page-title">Design</h1>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Design wählen">
        {THEME_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={theme === opt.value}
            onClick={() => changeTheme(opt.value)}
            className={`min-h-11 rounded-pill border px-4 py-2 text-sm font-medium ${
              theme === opt.value
                ? "border-accent bg-accent text-white"
                : "border-border text-text-secondary"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </main>
  );
}

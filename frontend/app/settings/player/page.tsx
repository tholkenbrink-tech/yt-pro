"use client";

import { useEffect, useState } from "react";
import {
  type BackgroundPlaybackMode,
  DEFAULT_PLAYER_SETTINGS,
  getPlayerSettings,
  setPlayerSettings,
  type PlayerSettings,
} from "@/lib/playerSettings";
import { useToast } from "@/components/ToastProvider";
import { Switch } from "@/components/Switch";

const BACKGROUND_PLAYBACK_OPTIONS: { value: BackgroundPlaybackMode; label: string }[] = [
  { value: "audio", label: "Ton im Hintergrund" },
  { value: "pip", label: "Bild-in-Bild" },
];

type BooleanPlayerSettingsKey = {
  [K in keyof PlayerSettings]: PlayerSettings[K] extends boolean ? K : never;
}[keyof PlayerSettings];

const TOGGLES: { key: BooleanPlayerSettingsKey; label: string }[] = [
  { key: "autoResume", label: "Automatisch fortsetzen" },
  { key: "rememberPlaybackRate", label: "Wiedergabegeschwindigkeit merken" },
  { key: "markWatchedAt95", label: "Bei 95% als angesehen markieren" },
  { key: "replayAfterFinish", label: "Nach Ende erneut abspielen anbieten" },
  { key: "showPipButton", label: "Bild-in-Bild-Button anzeigen" },
];

export default function PlayerSettingsPage() {
  const [settings, setSettings] = useState<PlayerSettings>(DEFAULT_PLAYER_SETTINGS);
  const { showToast } = useToast();

  useEffect(() => {
    setSettings(getPlayerSettings());
  }, []);

  const toggle = (key: BooleanPlayerSettingsKey) => {
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    setPlayerSettings({ [key]: next[key] });
    showToast("Einstellung gespeichert");
  };

  const setBackgroundPlaybackMode = (mode: BackgroundPlaybackMode) => {
    const next = { ...settings, backgroundPlaybackMode: mode };
    setSettings(next);
    setPlayerSettings({ backgroundPlaybackMode: mode });
    showToast("Einstellung gespeichert");
  };

  return (
    <main className="mx-auto max-w-lg px-4 pb-4 pt-6">
      <h1 className="mb-4 text-page-title">Player</h1>

      <p className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
        Beim Verlassen der App
      </p>
      <div className="mb-1.5 flex gap-1.5 rounded-2xl bg-surface-elevated p-1">
        {BACKGROUND_PLAYBACK_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setBackgroundPlaybackMode(value)}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium ${
              settings.backgroundPlaybackMode === value
                ? "bg-accent font-semibold text-white"
                : "text-text-secondary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mb-5 text-xs text-text-muted">
        Gilt nur, wenn die App verlassen wird - im geöffneten Player läuft das Video immer normal weiter.
      </p>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {TOGGLES.map(({ key, label }, i) => (
          <div
            key={key}
            className={`flex min-h-[46px] items-center justify-between px-3.5 ${
              i < TOGGLES.length - 1 ? "border-b border-border" : ""
            }`}
          >
            <span className="text-sm font-medium text-text-primary">{label}</span>
            <Switch checked={settings[key]} onChange={() => toggle(key)} label={label} />
          </div>
        ))}
      </div>
    </main>
  );
}

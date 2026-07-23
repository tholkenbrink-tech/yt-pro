"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_PLAYER_SETTINGS,
  getPlayerSettings,
  setPlayerSettings,
  type PlayerSettings,
} from "@/lib/playerSettings";
import { useToast } from "@/components/ToastProvider";

const TOGGLES: { key: keyof PlayerSettings; label: string }[] = [
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

  const toggle = (key: keyof PlayerSettings) => {
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    setPlayerSettings({ [key]: next[key] });
    showToast("Einstellung gespeichert");
  };

  return (
    <main className="mx-auto max-w-lg px-4 pb-4 pt-6">
      <h1 className="mb-4 text-page-title">Player</h1>
      <div className="space-y-1">
        {TOGGLES.map(({ key, label }) => (
          <label key={key} className="flex min-h-11 items-center justify-between py-1">
            <span className="text-sm font-medium">{label}</span>
            <input
              type="checkbox"
              checked={settings[key]}
              onChange={() => toggle(key)}
              className="h-5 w-5 accent-accent"
            />
          </label>
        ))}
      </div>
    </main>
  );
}

"use client";

import { useState } from "react";
import Image from "next/image";
import type { JobItem } from "@/lib/types";
import { api } from "@/lib/api";
import { formatBytes, formatCountdown, formatDuration } from "@/lib/format";
import { conversionNoteLabel } from "@/lib/statusLabels";
import { IOSSaveInstructions } from "./IOSSaveInstructions";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { useToast } from "./ToastProvider";

const SEEN_INSTRUCTIONS_KEY = "yt-pro:ios-instructions-seen";

interface Props {
  item: JobItem;
  onChanged?: () => void;
}

export function DownloadCard({ item, onChanged }: Props) {
  const [showInstructions, setShowInstructions] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  const handleFirstTap = () => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(SEEN_INSTRUCTIONS_KEY) !== "1") {
      setShowInstructions(true);
      localStorage.setItem(SEEN_INSTRUCTIONS_KEY, "1");
    }
  };

  const recreate = async () => {
    setBusy(true);
    try {
      await api.reprepareHistoryItem(item.id);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const deleteFromServer = async () => {
    setBusy(true);
    try {
      await api.deleteHistoryItem(item.id);
      setShowDeleteConfirm(false);
      showToast("Datei vom Server gelöscht");
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
      <div className="flex items-start gap-3">
        {item.thumbnail && (
          <Image
            src={item.thumbnail}
            alt=""
            width={80}
            height={45}
            unoptimized
            className="h-[45px] w-20 shrink-0 rounded object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.title}</p>
          {item.channelName && (
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
              {item.channelName}
            </p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {formatDuration(item.duration)} - {item.selectedQuality} -{" "}
            {formatBytes(item.finalFileSize)}
            {item.finalFormat ? ` - ${item.finalFormat.toUpperCase()}` : ""}
          </p>
        </div>
      </div>

      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {conversionNoteLabel(item.conversionNote)}
      </p>
      {item.expiresAt && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {formatCountdown(item.expiresAt)}
        </p>
      )}

      <a
        href={api.downloadUrl(item.id)}
        download
        onClick={handleFirstTap}
        className="mt-3 block w-full rounded-lg bg-brand px-4 py-3 text-center font-medium text-white active:opacity-80 dark:bg-brand-dark dark:text-gray-950"
      >
        Auf iPhone laden
      </a>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={recreate}
          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-gray-700"
        >
          Erneut erstellen
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setShowDeleteConfirm(true)}
          className="flex-1 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 disabled:opacity-50 dark:border-red-900 dark:text-red-400"
        >
          Vom Server löschen
        </button>
      </div>

      {showInstructions && (
        <IOSSaveInstructions onClose={() => setShowInstructions(false)} />
      )}

      <ConfirmationDialog
        open={showDeleteConfirm}
        title="Datei vom Server löschen?"
        description="Die Datei wird endgültig vom Server entfernt und steht nicht mehr zum Download bereit."
        confirmLabel="Löschen"
        destructive
        busy={busy}
        onConfirm={deleteFromServer}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

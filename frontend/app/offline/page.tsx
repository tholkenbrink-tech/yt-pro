"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listOfflineMeta, type OfflineMeta } from "@/lib/offlineStore";
import { formatDuration } from "@/lib/format";

export default function OfflinePage() {
  const [videos, setVideos] = useState<OfflineMeta[] | null>(null);

  useEffect(() => {
    listOfflineMeta()
      .then(setVideos)
      .catch(() => setVideos([]));
  }, []);

  return (
    <main className="mx-auto max-w-lg px-6 pb-4 pt-10">
      <h1 className="text-center text-xl font-bold">Keine Verbindung</h1>
      <p className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">
        yt-pro benötigt eine Internetverbindung, um Videos zu analysieren und
        herunterzuladen.
      </p>

      {videos && videos.length > 0 && (
        <>
          <h2 className="mb-2 mt-8 text-sm font-semibold">Offline verfügbar</h2>
          <div className="space-y-2">
            {videos.map((video) => (
              <Link
                key={video.id}
                href={`/library/${video.id}`}
                className="block rounded-md border border-border p-3 text-sm"
              >
                <p className="font-medium">{video.title}</p>
                <p className="mt-0.5 text-xs text-text-muted">
                  {video.channelName ? `${video.channelName} - ` : ""}
                  {formatDuration(video.duration)}
                </p>
              </Link>
            ))}
          </div>
        </>
      )}

      {videos && videos.length === 0 && (
        <p className="mt-6 text-center text-sm text-text-muted">
          Noch keine Videos offline gespeichert. Speichere Videos in der
          Mediathek für die Wiedergabe ohne Internetverbindung.
        </p>
      )}
    </main>
  );
}

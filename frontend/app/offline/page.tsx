"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { listOfflineMeta, type OfflineMeta } from "@/lib/offlineStore";
import { formatDuration } from "@/lib/format";
import { useOnlineStatus } from "@/lib/useOnlineStatus";

// Reached only as the service worker's last-resort fallback for a hard
// navigation that failed entirely with nothing cached to serve instead (see
// public/sw.js) - not something the app's own client-side routing ever
// pushes the user to. Deliberately not a dead end: AppShell keeps its normal
// nav chrome on this route, and connectivity returning navigates away from
// it automatically without the user needing to do anything.
export default function OfflinePage() {
  const router = useRouter();
  const online = useOnlineStatus();
  const [videos, setVideos] = useState<OfflineMeta[] | null>(null);

  useEffect(() => {
    listOfflineMeta()
      .then(setVideos)
      .catch(() => setVideos([]));
  }, []);

  useEffect(() => {
    if (online) router.replace("/library");
  }, [online, router]);

  return (
    <main className="mx-auto max-w-lg px-6 pb-4 pt-10">
      <h1 className="text-center text-page-title">Keine Verbindung</h1>
      <p className="mt-2 text-center text-sm text-text-muted">
        Diese Seite braucht eine Internetverbindung. Deine heruntergeladenen
        Videos sind trotzdem verfügbar - über den unteren Tab.
      </p>
      <Link
        href="/library"
        className="mt-4 block min-h-11 rounded-xl border border-border px-4 py-3 text-center text-sm font-medium text-text-primary"
      >
        Zur Mediathek
      </Link>

      {videos && videos.length > 0 && (
        <>
          <p className="mb-2 mt-8 px-1 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
            Offline verfügbar
          </p>
          <div className="space-y-1">
            {videos.map((video) => (
              <Link
                key={video.id}
                href={`/library/${video.id}`}
                className="block rounded-2xl border border-border bg-surface p-3.5 text-sm"
              >
                <p className="font-medium text-text-primary">{video.title}</p>
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

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Last-resort-of-last-resort: the service worker's navigation fallback
// chain (see public/sw.js) tries the exact requested page, then /library,
// and only falls back to this route if even /library was somehow never
// cached. Rather than showing a dedicated "no connection" wall, immediately
// hand off to /library - it already knows how to show downloaded/local
// content and degrade gracefully when offline, so there is no reason for a
// separate blocking screen to exist in the normal flow at all.
export default function OfflinePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/library");
  }, [router]);

  return null;
}

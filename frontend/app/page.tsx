"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // Known offline right away - skip the round trip entirely rather than
    // waiting on a request that can only fail, and never send an offline
    // user to /login (there's no way to authenticate there anyway; the
    // Mediathek can still show downloaded/local content on its own).
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      router.replace("/library");
      return;
    }

    api
      .session()
      .then(() => router.replace("/library"))
      .catch((err) => {
        // Only a real "you are not authenticated" response should send the
        // user to /login. Any other failure (network unreachable, timeout,
        // backend down) must not be treated the same way - it would dead-end
        // an offline user who has downloaded content waiting in /library.
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          router.replace("/login");
        } else {
          router.replace("/library");
        }
      });
  }, [router]);

  return null;
}

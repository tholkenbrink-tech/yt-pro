"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    api
      .session()
      .then(() => router.replace("/download"))
      .catch(() => router.replace("/login"));
  }, [router]);

  return null;
}

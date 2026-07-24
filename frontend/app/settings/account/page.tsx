"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function AccountSettingsPage() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    api
      .session()
      .then((s) => setUsername(s.name))
      .catch(() => setUsername(null));
  }, []);

  const logout = async () => {
    setLoggingOut(true);
    try {
      await api.logout();
    } finally {
      router.push("/login");
    }
  };

  return (
    <main className="mx-auto max-w-lg px-4 pb-4 pt-6">
      <h1 className="mb-4 text-page-title">Konto</h1>

      <div className="mb-6 rounded-md border border-border p-3 text-sm">
        <p>
          <span className="font-medium">Benutzername:</span> {username ?? "-"}
        </p>
      </div>

      {/* Kein Passwort-Änderungs-Endpunkt im Backend vorhanden - dieser
          Abschnitt wird bewusst weggelassen, statt eine neue API zu erfinden. */}

      <button
        type="button"
        disabled={loggingOut}
        onClick={logout}
        className="min-h-11 w-full rounded-md border border-error/40 px-4 py-3 text-sm font-medium text-error disabled:opacity-50"
      >
        Abmelden
      </button>
    </main>
  );
}

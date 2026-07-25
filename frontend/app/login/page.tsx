"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.login(username, password);
      router.push("/");
    } catch {
      setError("Anmeldung fehlgeschlagen. Benutzername oder Passwort falsch.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <Image
        src="/apple-touch-icon.png"
        alt=""
        width={64}
        height={64}
        className="mx-auto mb-4 h-16 w-16 rounded-2xl"
        priority
        unoptimized
      />
      <h1 className="mb-6 text-center text-page-title">yt-pro Anmeldung</h1>
      <form onSubmit={submit} className="rounded-2xl border border-border bg-surface p-4">
        <div className="mb-3">
          <label htmlFor="username" className="mb-1 block text-sm font-medium text-text-primary">
            Benutzername
          </label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="w-full rounded-xl border border-border bg-background p-3 text-text-primary"
          />
        </div>
        <div className="mb-3">
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-text-primary">
            Passwort
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-xl border border-border bg-background p-3 text-text-primary"
          />
        </div>
        {error && <p className="mb-3 text-sm text-error">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-accent px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Anmelden..." : "Anmelden"}
        </button>
      </form>
    </main>
  );
}

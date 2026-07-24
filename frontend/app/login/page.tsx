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
        src="/icons/icon-192.png"
        alt=""
        width={64}
        height={64}
        className="mx-auto mb-4 h-16 w-16 rounded-2xl"
        priority
      />
      <h1 className="mb-6 text-center text-2xl font-bold">yt-pro Anmeldung</h1>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor="username" className="mb-1 block text-sm font-medium">
            Benutzername
          </label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium">
            Passwort
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"
          />
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-brand px-4 py-3 font-medium text-white disabled:opacity-50 dark:bg-brand-dark dark:text-gray-950"
        >
          {loading ? "Anmelden..." : "Anmelden"}
        </button>
      </form>
    </main>
  );
}

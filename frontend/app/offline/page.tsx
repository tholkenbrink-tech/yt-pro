export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-bold">Keine Verbindung</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        yt-pro benötigt eine Internetverbindung, um Videos zu analysieren und
        herunterzuladen. Bitte prüfe deine Verbindung und versuche es erneut.
      </p>
    </main>
  );
}

export function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return "-";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function formatDuration(seconds?: number): string {
  if (seconds === undefined || seconds === null || Number.isNaN(seconds)) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatSpeed(bytesPerSecond?: number): string {
  if (!bytesPerSecond) return "-";
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatEta(seconds?: number): string {
  if (seconds === undefined || seconds === null) return "-";
  if (seconds < 60) return `${Math.round(seconds)} s`;
  return formatDuration(seconds);
}

export function formatDate(iso?: string): string {
  if (!iso) return "-";
  try {
    return new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatCountdown(expiresAtIso?: string): string {
  if (!expiresAtIso) return "-";
  const diffMs = new Date(expiresAtIso).getTime() - Date.now();
  if (diffMs <= 0) return "Abgelaufen";
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `noch ${hours} Std. ${minutes} Min.`;
  return `noch ${minutes} Min.`;
}

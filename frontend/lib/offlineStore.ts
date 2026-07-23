import { api } from "./api";

/** Minimal shape saveOffline() actually needs - LibraryItem satisfies this
 * structurally, but JobItem (Aktivität's freshly-finished download cards)
 * doesn't share a type with LibraryItem, so this lets both call it without
 * a full LibraryItem object. */
export interface OfflineSourceItem {
  id: string;
  title: string;
  channelName?: string;
  duration?: number;
  selectedQuality: string;
  fileSize?: number;
  mimeType?: string;
  thumbnailPath?: string;
  originalUrl?: string;
}

// On-device offline video cache. IndexedDB (not Cache Storage) because we
// need structured metadata alongside raw video bytes, and this app has no
// other IndexedDB usage yet so there's no existing wrapper to reuse - kept
// deliberately small (two stores, no library) to match the rest of this
// codebase's hand-rolled localStorage-store style (see analysisStore.ts,
// playerSettings.ts).
const DB_NAME = "yt-pro-offline";
const DB_VERSION = 1;
const META_STORE = "meta";
const BLOB_STORE = "blobs";
const THUMB_STORE = "thumbs";

// Must match RUNTIME_CACHE in public/sw.js - the service worker and this
// module both write into the same Cache Storage bucket so a video's detail
// page is available offline even if the user never opened it while online.
const RUNTIME_CACHE = "yt-pro-runtime-v1";

export interface OfflineMeta {
  id: string;
  title: string;
  channelName?: string;
  duration?: number;
  selectedQuality: string;
  fileSize?: number;
  mimeType?: string;
  originalUrl?: string;
  savedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(BLOB_STORE)) db.createObjectStore(BLOB_STORE);
      if (!db.objectStoreNames.contains(THUMB_STORE)) db.createObjectStore(THUMB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function isAvailable(): Promise<boolean> {
  return typeof indexedDB !== "undefined";
}

function sanitizeFileName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_").trim() || "video";
}

function extensionFor(mimeType?: string): string {
  if (mimeType?.includes("m4a") || mimeType?.startsWith("audio/")) return "m4a";
  return "mp4";
}

/** Saves offline for in-app playback AND triggers a normal browser download
 * of the same bytes (one fetch, two destinations) - so "offline in the
 * webapp" and "on the device, usable by other apps like Infuse" are the
 * same action instead of two separate, confusing buttons. */
export async function saveOffline(
  item: OfflineSourceItem,
  onProgress?: (pct: number) => void,
  triggerDeviceDownload = true
): Promise<void> {
  const res = await fetch(api.streamUrl(item.id), { credentials: "include" });
  if (!res.ok) throw new Error(`Stream fetch failed: ${res.status}`);
  const blob = await readBlobWithProgress(res, onProgress);

  let thumbBlob: Blob | null = null;
  if (item.thumbnailPath) {
    try {
      const thumbRes = await fetch(item.thumbnailPath);
      if (thumbRes.ok) thumbBlob = await thumbRes.blob();
    } catch {
      /* thumbnail is a nice-to-have offline, never block the save on it */
    }
  }

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([META_STORE, BLOB_STORE, THUMB_STORE], "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    const meta: OfflineMeta = {
      id: item.id,
      title: item.title,
      channelName: item.channelName,
      duration: item.duration,
      selectedQuality: item.selectedQuality,
      fileSize: item.fileSize ?? blob.size,
      mimeType: item.mimeType,
      originalUrl: item.originalUrl,
      savedAt: new Date().toISOString(),
    };
    tx.objectStore(META_STORE).put(meta);
    tx.objectStore(BLOB_STORE).put(blob, item.id);
    if (thumbBlob) tx.objectStore(THUMB_STORE).put(thumbBlob, item.id);
  });
  db.close();

  // Best-effort: warm the runtime cache with this video's own detail page so
  // it opens from a cold, fully offline launch even if never visited before.
  try {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.add(`/library/${item.id}`);
  } catch {
    /* non-critical - the SW's own navigate handler will still cache it on
       the next successful visit */
  }

  if (triggerDeviceDownload) {
    const fileName = `${sanitizeFileName(item.title)}.${extensionFor(item.mimeType)}`;
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Give the browser's download handoff time to actually start reading
    // the blob before the URL is revoked.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
  }
}

async function readBlobWithProgress(res: Response, onProgress?: (pct: number) => void): Promise<Blob> {
  if (!onProgress || !res.body) return res.blob();
  const total = Number(res.headers.get("Content-Length")) || 0;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total > 0) onProgress(Math.min(100, Math.round((received / total) * 100)));
  }
  return new Blob(chunks as BlobPart[], { type: res.headers.get("Content-Type") ?? undefined });
}

export async function removeOffline(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([META_STORE, BLOB_STORE, THUMB_STORE], "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(META_STORE).delete(id);
    tx.objectStore(BLOB_STORE).delete(id);
    tx.objectStore(THUMB_STORE).delete(id);
  });
  db.close();
  try {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.delete(`/library/${id}`);
  } catch {
    /* non-critical */
  }
}

export async function getOfflineMeta(id: string): Promise<OfflineMeta | null> {
  const db = await openDb();
  const tx = db.transaction(META_STORE, "readonly");
  const result = await reqToPromise(tx.objectStore(META_STORE).get(id));
  db.close();
  return result ?? null;
}

export async function listOfflineMeta(): Promise<OfflineMeta[]> {
  const db = await openDb();
  const tx = db.transaction(META_STORE, "readonly");
  const result = await reqToPromise(tx.objectStore(META_STORE).getAll());
  db.close();
  return result ?? [];
}

export async function isOffline(id: string): Promise<boolean> {
  return (await getOfflineMeta(id)) !== null;
}

export async function getOfflineBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  const tx = db.transaction(BLOB_STORE, "readonly");
  const result = await reqToPromise(tx.objectStore(BLOB_STORE).get(id));
  db.close();
  return result ?? null;
}

export async function getOfflineThumbBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  const tx = db.transaction(THUMB_STORE, "readonly");
  const result = await reqToPromise(tx.objectStore(THUMB_STORE).get(id));
  db.close();
  return result ?? null;
}

export async function getOfflineUsageBytes(): Promise<number> {
  const items = await listOfflineMeta();
  return items.reduce((sum, item) => sum + (item.fileSize ?? 0), 0);
}

export async function clearAllOffline(): Promise<void> {
  const items = await listOfflineMeta();
  await Promise.all(items.map((item) => removeOffline(item.id)));
}

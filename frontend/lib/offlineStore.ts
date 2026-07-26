import { api } from "./api";
import { getDownloadSettings } from "./localSettings";

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
const DB_VERSION = 2;
const META_STORE = "meta";
const BLOB_STORE = "blobs";
const THUMB_STORE = "thumbs";
// v2: raw video bytes are written here chunk-by-chunk as they arrive over
// the network, keyed by `${itemId}:${chunkIndex}`, instead of being held in
// one big in-memory array until a final Blob is built. A ~700MB-1GB fetch
// previously buffered its entire body as `Uint8Array[]` before constructing
// one `Blob` at the very end - peak JS heap usage of ~2x the file size,
// right as the download finished, which is exactly what was crashing
// Safari's WKWebView (its per-tab memory ceiling is roughly 1-1.5GB). Each
// chunk is wrapped in its own small Blob immediately and persisted right
// away, so at most one chunk is ever held outside IndexedDB at a time. Also
// doubles as resumable-download state: a failed/interrupted save leaves its
// chunks in place so a retry can continue with a Range request instead of
// restarting from byte 0.
const CHUNK_STORE = "chunks";
// A small per-item record (chunk count/bytes so far, status, error) updated
// in the same transaction as each chunk write - lets a retry find where to
// resume without re-reading every chunk, and gives failed/interrupted saves
// a persisted status that survives a reload instead of vanishing the moment
// the in-memory queue/progress stores (downloadQueueStore.ts,
// activeDownloadsStore.ts) are gone.
const PROGRESS_STORE = "progress";

export type SaveStatus = "saving" | "failed" | "interrupted";

export interface SaveProgressRecord {
  id: string;
  status: SaveStatus;
  chunkCount: number;
  bytes: number;
  expectedBytes?: number;
  errorMessage?: string;
  updatedAt: string;
  /** Snapshot of the item saveOfflineInApp() was called with, so a failed/
   * interrupted entry surfaced in the Activity view (InAppDownloadsPanel)
   * can be retried directly without navigating back to wherever the
   * download was originally started from. */
  sourceItem: OfflineSourceItem;
}

// Must derive the same name public/sw.js does - the service worker and this
// module both write into the same Cache Storage bucket so a video's detail
// page is available offline even if the user never opened it while online.
// Both independently include the current build id (from /BUILD_ID) so the
// name rotates on every deploy, same reasoning as in sw.js.
let buildIdPromise: Promise<string> | null = null;
function getBuildId(): Promise<string> {
  if (!buildIdPromise) {
    buildIdPromise = fetch("/BUILD_ID", { cache: "no-store" })
      .then((r) => (r.ok ? r.text() : "unknown"))
      .then((t) => t.trim())
      .catch(() => "unknown");
  }
  return buildIdPromise;
}
async function runtimeCacheName(): Promise<string> {
  return `yt-pro-runtime-${await getBuildId()}`;
}

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
      if (!db.objectStoreNames.contains(CHUNK_STORE)) db.createObjectStore(CHUNK_STORE);
      if (!db.objectStoreNames.contains(PROGRESS_STORE)) db.createObjectStore(PROGRESS_STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Thrown by saveOfflineInApp() when the on-device storage quota (not the
 * device's raw free space, which the app can't see - Safari's IndexedDB
 * quota for an origin is its own separate, smaller "best-effort" bucket)
 * doesn't have room for the expected file. Carries the numbers needed for
 * an actionable message instead of a generic "not enough space". */
export class StorageQuotaError extends Error {
  constructor(public requiredBytes: number, public availableBytes: number) {
    super(
      `Not enough storage: needs ~${requiredBytes} bytes, only ~${availableBytes} available`
    );
    this.name = "StorageQuotaError";
  }
}

const SAFETY_BUFFER_BYTES = 100 * 1024 * 1024; // headroom for browser/IndexedDB overhead beyond the raw video bytes

/** Preflight check before starting a save - throws StorageQuotaError instead
 * of letting the write fail deep inside an IndexedDB transaction with a
 * cryptic QuotaExceededError. Fails open (returns ok) if the Storage API
 * isn't available, matching has_enough_free_disk()'s fail-open behavior on
 * the backend (app/services/disk.py) for the same reason: an unreadable
 * signal shouldn't block a download outright. */
export async function checkStorageQuota(
  expectedBytes: number
): Promise<{ ok: boolean; requiredBytes: number; availableBytes: number }> {
  const requiredBytes = expectedBytes + SAFETY_BUFFER_BYTES;
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return { ok: true, requiredBytes, availableBytes: Infinity };
  }
  try {
    const { quota, usage } = await navigator.storage.estimate();
    const availableBytes = (quota ?? 0) - (usage ?? 0);
    return { ok: availableBytes >= requiredBytes, requiredBytes, availableBytes };
  } catch {
    return { ok: true, requiredBytes, availableBytes: Infinity };
  }
}

/** Thrown by saveOfflineInApp() when starting a save would exceed the
 * user's own configured cap on total in-app offline storage (Settings ->
 * Speicher) - distinct from StorageQuotaError, which is about what the
 * device itself will allow. This one is purely a self-imposed limit, so the
 * message is phrased accordingly ("you set a limit"), not "not enough
 * space". */
export class OfflineStorageLimitError extends Error {
  constructor(public limitBytes: number, public usedBytes: number) {
    super(`Offline storage limit reached: limit ${limitBytes}, used ${usedBytes}`);
    this.name = "OfflineStorageLimitError";
  }
}

/** Preflight check against the user's own configured limit (if any) -
 * completely independent of checkStorageQuota()'s device-level check above,
 * and checked separately in saveOfflineInApp() so each can produce its own
 * specific, actionable error message. */
async function checkOfflineStorageLimit(expectedBytes: number): Promise<void> {
  const limitBytes = getDownloadSettings().maxOfflineStorageBytes;
  if (!limitBytes) return;
  const usedBytes = await getOfflineUsageBytes();
  if (usedBytes + expectedBytes > limitBytes) {
    throw new OfflineStorageLimitError(limitBytes, usedBytes);
  }
}

/** Best-effort request that the browser not silently evict this origin's
 * IndexedDB data under storage pressure. iOS Safari often ignores/no-ops
 * this, but it costs nothing to ask and helps on browsers that honor it. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* best-effort only */
  }
}

function chunkKey(itemId: string, index: number): string {
  return `${itemId}:${index}`;
}

async function getSaveProgress(itemId: string): Promise<SaveProgressRecord | null> {
  const db = await openDb();
  const tx = db.transaction(PROGRESS_STORE, "readonly");
  const result = await reqToPromise(tx.objectStore(PROGRESS_STORE).get(itemId));
  db.close();
  return result ?? null;
}

async function putSaveProgress(
  db: IDBDatabase,
  record: SaveProgressRecord
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PROGRESS_STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(PROGRESS_STORE).put(record);
  });
}

async function deleteChunksAndProgress(itemId: string, upToExclusiveChunkCount: number): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([CHUNK_STORE, PROGRESS_STORE], "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    const chunkStore = tx.objectStore(CHUNK_STORE);
    for (let i = 0; i < upToExclusiveChunkCount; i++) chunkStore.delete(chunkKey(itemId, i));
    tx.objectStore(PROGRESS_STORE).delete(itemId);
  });
  db.close();
}

/** Every failed or interrupted save, for the Activity view's "needs
 * attention" list - reads the small progress records, not the chunk bytes. */
export async function listFailedOrInterrupted(): Promise<SaveProgressRecord[]> {
  const db = await openDb();
  const tx = db.transaction(PROGRESS_STORE, "readonly");
  const all = await reqToPromise(tx.objectStore(PROGRESS_STORE).getAll());
  db.close();
  return (all ?? []).filter((r: SaveProgressRecord) => r.status === "failed" || r.status === "interrupted");
}

/** Called once on app startup (see components/OfflineDownloadsInit.tsx). Any
 * record still marked "saving" was mid-flight when the page was last torn
 * down (reload, force-close, crash) - the fetch behind it is long gone, so
 * flip it to "interrupted" rather than leaving a stale "saving" that no
 * running download will ever update again. Chunks already written are kept
 * so a retry can resume instead of restarting from byte 0. */
export async function reconcileInterruptedSaves(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(PROGRESS_STORE, "readonly");
  const all: SaveProgressRecord[] = (await reqToPromise(tx.objectStore(PROGRESS_STORE).getAll())) ?? [];
  db.close();
  const stale = all.filter((r) => r.status === "saving");
  if (stale.length === 0) return;
  const db2 = await openDb();
  await Promise.all(
    stale.map((r) =>
      putSaveProgress(db2, { ...r, status: "interrupted", errorMessage: "App wurde geschlossen oder neu geladen" })
    )
  );
  db2.close();
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

/** Hands the file off to the browser's native download manager for an
 * on-device copy - a separate, independent transfer from saveOfflineInApp()
 * on purpose: the native download is OS-level and keeps running even if the
 * tab is backgrounded or the app is switched away from, which a JS-driven
 * fetch never survives on iOS Safari (no Background Fetch API support
 * there). There is no callback for when/whether it actually finishes -
 * callers that want to remember "this was sent to the device" should use
 * deviceDownloadStore.markDownloadedToDevice() right after calling this. */
export function triggerDeviceDownload(itemId: string): void {
  const link = document.createElement("a");
  link.href = api.downloadUrl(itemId);
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** Saves a video for in-app offline playback (IndexedDB). Independent of
 * triggerDeviceDownload() - this never leaves the app's own storage, so it
 * isn't gated by the WLAN-only device-download setting.
 *
 * Streams the response directly into the chunk store instead of buffering
 * the whole file in memory (see CHUNK_STORE's comment for why - this is the
 * fix for large in-app saves crashing Safari near completion). If a
 * previous attempt for this item left chunks behind (failed/interrupted),
 * resumes from that byte offset via a Range request rather than restarting.
 */
export async function saveOfflineInApp(
  item: OfflineSourceItem,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal
): Promise<void> {
  const expectedBytes = item.fileSize ?? 0;
  await checkOfflineStorageLimit(expectedBytes);
  const quota = await checkStorageQuota(expectedBytes);
  if (!quota.ok) throw new StorageQuotaError(quota.requiredBytes, quota.availableBytes);

  const existing = await getSaveProgress(item.id);
  const resumeChunkCount = existing?.chunkCount ?? 0;
  const resumeBytes = existing?.bytes ?? 0;

  // Persisted before the network request even starts, so ANY failure from
  // here on (a rejected fetch, a non-2xx status, a stream error partway
  // through) leaves a visible, retryable record instead of throwing into
  // the void with nothing to show in the Activity view.
  const dbInit = await openDb();
  await putSaveProgress(dbInit, {
    id: item.id,
    status: "saving",
    chunkCount: resumeChunkCount,
    bytes: resumeBytes,
    expectedBytes,
    sourceItem: item,
    updatedAt: new Date().toISOString(),
  });
  dbInit.close();

  let contentType: string | null = null;
  try {
    const headers: Record<string, string> = {};
    if (resumeBytes > 0) headers.Range = `bytes=${resumeBytes}-`;
    const res = await fetch(api.streamUrl(item.id), { credentials: "include", signal, headers });

    if (resumeBytes > 0 && res.status !== 206) {
      // Asked to resume but didn't get a partial response back (server
      // ignored Range, or the file changed) - the body can't be safely
      // appended to what's already stored. Discard and restart from
      // scratch rather than risk corrupting the assembled file.
      await deleteChunksAndProgress(item.id, resumeChunkCount);
      return await saveOfflineInApp(item, onProgress, signal);
    }
    if (!res.ok) throw new Error(`Stream fetch failed: ${res.status}`);

    contentType = res.headers.get("Content-Type");
    await writeChunksWithProgress(item.id, res, resumeChunkCount, resumeBytes, expectedBytes, item, onProgress);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      // Explicit user cancellation - nothing to resume, discard what we had.
      const progressAtAbort = await getSaveProgress(item.id);
      await deleteChunksAndProgress(item.id, progressAtAbort?.chunkCount ?? resumeChunkCount);
      throw err;
    }
    const db = await openDb();
    const latest = (await getSaveProgress(item.id)) ?? {
      id: item.id,
      status: "saving" as const,
      chunkCount: resumeChunkCount,
      bytes: resumeBytes,
      expectedBytes,
      sourceItem: item,
      updatedAt: new Date().toISOString(),
    };
    await putSaveProgress(db, {
      ...latest,
      status: "failed",
      errorMessage: err instanceof Error ? err.message : "Unbekannter Fehler",
    });
    db.close();
    throw err;
  }

  const finalProgress = await getSaveProgress(item.id);
  const chunkCount = finalProgress?.chunkCount ?? 0;

  const blob = await assembleBlobFromChunks(item.id, chunkCount, contentType);

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

  await deleteChunksAndProgress(item.id, chunkCount);

  // Best-effort: warm the runtime cache with this video's own detail page so
  // it opens from a cold, fully offline launch even if never visited before.
  try {
    const cache = await caches.open(await runtimeCacheName());
    await cache.add(`/library/${item.id}`);
  } catch {
    /* non-critical - the SW's own navigate handler will still cache it on
       the next successful visit */
  }

  requestPersistentStorage();
}

const PROGRESS_PERSIST_INTERVAL_MS = 1000;

/** Reads the response body one chunk at a time, writing each chunk straight
 * into IndexedDB (wrapped in its own small Blob) as it arrives - at most one
 * chunk is ever held in memory outside IndexedDB. Progress bytes/chunkCount
 * are persisted periodically (not on every chunk, to limit write volume) so
 * a reload mid-save can resume close to where it left off. */
async function writeChunksWithProgress(
  itemId: string,
  res: Response,
  startChunkIndex: number,
  startBytes: number,
  expectedBytes: number,
  sourceItem: OfflineSourceItem,
  onProgress?: (pct: number) => void
): Promise<void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  let chunkIndex = startChunkIndex;
  let received = startBytes;
  let lastPersist = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CHUNK_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(CHUNK_STORE).put(new Blob([value]), chunkKey(itemId, chunkIndex));
    });
    db.close();

    chunkIndex++;
    received += value.length;

    const now = Date.now();
    if (now - lastPersist >= PROGRESS_PERSIST_INTERVAL_MS) {
      lastPersist = now;
      const db2 = await openDb();
      await putSaveProgress(db2, {
        id: itemId,
        status: "saving",
        chunkCount: chunkIndex,
        bytes: received,
        expectedBytes,
        sourceItem,
        updatedAt: new Date().toISOString(),
      });
      db2.close();
    }

    if (expectedBytes > 0 && onProgress) {
      onProgress(Math.min(100, Math.round((received / expectedBytes) * 100)));
    }
  }

  const db3 = await openDb();
  await putSaveProgress(db3, {
    id: itemId,
    status: "saving",
    chunkCount: chunkIndex,
    bytes: received,
    expectedBytes,
    sourceItem,
    updatedAt: new Date().toISOString(),
  });
  db3.close();
}

/** Reassembles the final playback Blob from the stored chunk Blobs. This is
 * still "one big Blob in memory" at the moment `<video>` needs a src, but
 * browsers back an array-of-Blobs Blob() construction with disk-backed
 * handles rather than copying every byte into the JS heap, so it doesn't
 * reproduce the OOM that buffering raw Uint8Array chunks did. */
async function assembleBlobFromChunks(
  itemId: string,
  chunkCount: number,
  contentType: string | null
): Promise<Blob> {
  const db = await openDb();
  const tx = db.transaction(CHUNK_STORE, "readonly");
  const store = tx.objectStore(CHUNK_STORE);
  const parts: Blob[] = [];
  for (let i = 0; i < chunkCount; i++) {
    const chunk = await reqToPromise(store.get(chunkKey(itemId, i)));
    if (chunk) parts.push(chunk as Blob);
  }
  db.close();
  return new Blob(parts, { type: contentType ?? undefined });
}

export async function removeOffline(id: string): Promise<void> {
  const progress = await getSaveProgress(id);
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([META_STORE, BLOB_STORE, THUMB_STORE, PROGRESS_STORE], "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(META_STORE).delete(id);
    tx.objectStore(BLOB_STORE).delete(id);
    tx.objectStore(THUMB_STORE).delete(id);
    tx.objectStore(PROGRESS_STORE).delete(id);
  });
  db.close();
  if (progress) await deleteChunksAndProgress(id, progress.chunkCount);
  try {
    const cache = await caches.open(await runtimeCacheName());
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

/** Bytes currently held by failed/interrupted partial saves - shown
 * separately from completed usage so "why is my storage full" has an
 * honest answer even before anything finishes. */
export async function getPartialUsageBytes(): Promise<number> {
  const stale = await listFailedOrInterrupted();
  return stale.reduce((sum, r) => sum + r.bytes, 0);
}

export async function clearAllOffline(): Promise<void> {
  const items = await listOfflineMeta();
  await Promise.all(items.map((item) => removeOffline(item.id)));
}

/** Removes every failed/interrupted in-app save (its partial chunks + the
 * progress record) - the "clear incomplete downloads" bulk action in the
 * Speicher settings page. Never touches completed saves. */
export async function clearAllFailedOrInterrupted(): Promise<void> {
  const stale = await listFailedOrInterrupted();
  await Promise.all(stale.map((r) => removeOffline(r.id)));
}

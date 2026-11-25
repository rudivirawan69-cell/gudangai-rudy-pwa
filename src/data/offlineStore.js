/**
 * GudangAI RUDY — durable offline queue backup.
 * IndexedDB is the durability gate: a queue mutation is not acknowledged until
 * the write transaction commits and a read-back matches its revision + payload.
 */
const DB_NAME = 'gudangai-offline-v1';
const STORE_NAME = 'kv';
const QUEUE_KEY = 'queueState:v1';
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB tidak tersedia; antrean belum dapat diamankan.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      try {
        if (!req.result.objectStoreNames.contains(STORE_NAME)) req.result.createObjectStore(STORE_NAME);
      } catch (error) { reject(error); }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Gagal membuka IndexedDB.'));
    req.onblocked = () => reject(new Error('Pembukaan IndexedDB terblokir oleh tab/perangkat lain.'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function readKey(db, key) {
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
    } catch (error) { reject(error); return; }
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error || new Error('Gagal membaca cadangan antrean.'));
  });
}

export async function getQueueBackup() {
  const db = await openDb();
  return readKey(db, QUEUE_KEY);
}

/**
 * Resolve only after IndexedDB transaction completion AND read-back verification.
 * Request.onsuccess alone is insufficient: the enclosing transaction can still abort.
 */
export async function persistQueueBackup(queue, revision) {
  const db = await openDb();
  const safeQueue = Array.isArray(queue) ? queue : [];
  const nextRevision = Number(revision) || 0;
  const payload = {
    revision: nextRevision,
    updatedAt: new Date().toISOString(),
    queue: safeQueue,
  };

  await new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(payload, QUEUE_KEY);
    } catch (error) { reject(error); return; }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Transaksi IndexedDB gagal.'));
    transaction.onabort = () => reject(transaction.error || new Error('Transaksi IndexedDB dibatalkan.'));
  });

  const verified = await readKey(db, QUEUE_KEY);
  if (!verified || Number(verified.revision) !== nextRevision ||
      JSON.stringify(verified.queue) !== JSON.stringify(safeQueue)) {
    throw new Error('Verifikasi cadangan antrean gagal; data belum boleh dianggap tersimpan.');
  }
  return { ok: true, revision: nextRevision, count: safeQueue.length };
}

export async function hydrateQueueBackup(readLocalState, writeLocalState) {
  const local = readLocalState?.() || { revision: 0, queue: [] };
  const localQueue = Array.isArray(local.queue) ? local.queue : [];
  const localRev = Number(local.revision) || 0;

  try {
    const backup = await getQueueBackup();
    if (!backup) {
      const revision = Math.max(localRev, 1);
      await persistQueueBackup(localQueue, revision);
      return { ok: true, restored: false, revision, queue: localQueue };
    }

    const backupRev = Number(backup.revision) || 0;
    const backupQueue = Array.isArray(backup.queue) ? backup.queue : [];
    // Prefer the newest committed snapshot. Do not union snapshots: unioning can
    // resurrect items that were already verified and intentionally removed.
    const useBackup = backupRev > localRev;
    const queue = useBackup ? backupQueue : localQueue;
    const revision = Math.max(localRev, backupRev, 1);

    if (useBackup) {
      writeLocalState?.(queue, revision);
      const localAfterWrite = readLocalState?.() || { queue: [] };
      if (JSON.stringify(localAfterWrite.queue || []) !== JSON.stringify(queue)) {
        throw new Error('Pemulihan antrean ke localStorage gagal diverifikasi.');
      }
    }
    if (localRev > backupRev || (!useBackup && localRev === backupRev &&
        JSON.stringify(localQueue) !== JSON.stringify(backupQueue))) {
      await persistQueueBackup(queue, revision + (localRev === backupRev ? 1 : 0));
    }

    if (useBackup) {
      try {
        window.dispatchEvent(new CustomEvent('gudangai-queue-changed', {
          detail: { restored: true, revision },
        }));
      } catch (_) {}
    }
    return { ok: true, restored: useBackup, revision, queue };
  } catch (error) {
    // Fail closed: preserve the visible local snapshot and surface the fault.
    // Never report an empty queue as a successful recovery.
    return {
      ok: false,
      restored: false,
      revision: localRev,
      queue: localQueue,
      error: error?.message || 'Pemulihan antrean gagal.',
    };
  }
}

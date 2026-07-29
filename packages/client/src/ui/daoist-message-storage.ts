/**
 * 道友私聊的设备本地历史。云端只保留每个会话最新 100 条，本地不主动按条数裁剪。
 */
import type { DaoistDirectMessageView } from '@mud/shared';

type DaoistMessageRecord = DaoistDirectMessageView & {
  playerId: string;
  peerPlayerId: string;
};

const DAOIST_MESSAGE_DB_NAME = 'mud-daoist-message';
const DAOIST_MESSAGE_DB_VERSION = 1;
const DAOIST_MESSAGE_STORE_NAME = 'messages';
const DAOIST_MESSAGE_INDEX_BY_CONVERSATION_TIME = 'by-conversation-time';
const DAOIST_MESSAGE_FLUSH_DELAY_MS = 150;
const DAOIST_MESSAGE_BATCH_SIZE = 200;

let databasePromise: Promise<IDBDatabase | null> | null = null;
let indexedDbUnavailableWarned = false;
let persistLifecycleBound = false;
let persistFlushTimer: number | null = null;
let persistFlushRunning = false;

type PendingPersistEntry = {
  records: DaoistMessageRecord[];
  resolve: (persisted: boolean) => void;
};

const pendingPersistEntries: PendingPersistEntry[] = [];

function warnIndexedDbUnavailable(error: unknown): void {
  if (indexedDbUnavailableWarned) {
    return;
  }
  indexedDbUnavailableWarned = true;
  console.warn('[social] IndexedDB 不可用，本次会话将退回仅内存私聊记录。', error);
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase | null>((resolve) => {
      try {
        const request = window.indexedDB.open(DAOIST_MESSAGE_DB_NAME, DAOIST_MESSAGE_DB_VERSION);
        request.onupgradeneeded = () => {
          const database = request.result;
          const store = database.objectStoreNames.contains(DAOIST_MESSAGE_STORE_NAME)
            ? request.transaction?.objectStore(DAOIST_MESSAGE_STORE_NAME)
            : database.createObjectStore(DAOIST_MESSAGE_STORE_NAME, {
              keyPath: ['playerId', 'peerPlayerId', 'messageId'],
            });
          if (store && !store.indexNames.contains(DAOIST_MESSAGE_INDEX_BY_CONVERSATION_TIME)) {
            store.createIndex(
              DAOIST_MESSAGE_INDEX_BY_CONVERSATION_TIME,
              ['playerId', 'peerPlayerId', 'sentAt', 'messageId'],
              { unique: false },
            );
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          warnIndexedDbUnavailable(request.error);
          resolve(null);
        };
        request.onblocked = () => {
          warnIndexedDbUnavailable(new Error('IndexedDB open blocked'));
          resolve(null);
        };
      } catch (error) {
        warnIndexedDbUnavailable(error);
        resolve(null);
      }
    });
  }
  return databasePromise;
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
  });
}

function bindPersistLifecycle(): void {
  if (persistLifecycleBound || typeof window === 'undefined') {
    return;
  }
  persistLifecycleBound = true;
  window.addEventListener('pagehide', () => {
    void flushPendingPersistEntries();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flushPendingPersistEntries();
    }
  });
}

function buildConversationRange(playerId: string, peerPlayerId: string): IDBKeyRange {
  return IDBKeyRange.bound(
    [playerId, peerPlayerId, 0, ''],
    [playerId, peerPlayerId, Number.MAX_SAFE_INTEGER, '\uffff'],
  );
}

export async function loadRecentDaoistMessages(
  playerId: string,
  peerPlayerId: string,
  limit = 100,
): Promise<DaoistDirectMessageView[]> {
  const database = await openDatabase();
  if (!database || !playerId || !peerPlayerId || limit <= 0) {
    return [];
  }
  return new Promise<DaoistDirectMessageView[]>((resolve) => {
    try {
      const transaction = database.transaction(DAOIST_MESSAGE_STORE_NAME, 'readonly');
      const index = transaction.objectStore(DAOIST_MESSAGE_STORE_NAME).index(DAOIST_MESSAGE_INDEX_BY_CONVERSATION_TIME);
      const request = index.openCursor(buildConversationRange(playerId, peerPlayerId), 'prev');
      const messages: DaoistDirectMessageView[] = [];
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || messages.length >= limit) {
          resolve(messages.reverse());
          return;
        }
        const record = cursor.value as DaoistMessageRecord;
        messages.push({
          messageId: record.messageId,
          fromPlayerId: record.fromPlayerId,
          fromName: record.fromName,
          toPlayerId: record.toPlayerId,
          toName: record.toName,
          text: record.text,
          sentAt: record.sentAt,
        });
        cursor.continue();
      };
      request.onerror = () => {
        console.warn('[social] 读取私聊历史失败。', request.error);
        resolve([]);
      };
    } catch (error) {
      console.warn('[social] 读取私聊历史失败。', error);
      resolve([]);
    }
  });
}

async function persistBatch(entries: PendingPersistEntry[]): Promise<boolean> {
  const database = await openDatabase();
  if (!database || entries.length === 0) {
    return false;
  }
  try {
    const records = new Map<string, DaoistMessageRecord>();
    for (const entry of entries) {
      for (const record of entry.records) {
        records.set(`${record.playerId}\n${record.peerPlayerId}\n${record.messageId}`, record);
      }
    }
    const transaction = database.transaction(DAOIST_MESSAGE_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(DAOIST_MESSAGE_STORE_NAME);
    for (const record of records.values()) {
      store.put(record);
    }
    await waitForTransaction(transaction);
    return true;
  } catch (error) {
    console.warn('[social] 写入私聊历史失败。', error);
    return false;
  }
}

async function flushPendingPersistEntries(): Promise<void> {
  if (persistFlushTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(persistFlushTimer);
    persistFlushTimer = null;
  }
  if (persistFlushRunning) {
    return;
  }
  persistFlushRunning = true;
  try {
    while (pendingPersistEntries.length > 0) {
      const batch: PendingPersistEntry[] = [];
      let recordCount = 0;
      while (pendingPersistEntries.length > 0) {
        const next = pendingPersistEntries[0];
        if (batch.length > 0 && recordCount + next.records.length > DAOIST_MESSAGE_BATCH_SIZE) {
          break;
        }
        pendingPersistEntries.shift();
        batch.push(next);
        recordCount += next.records.length;
      }
      const persisted = await persistBatch(batch);
      batch.forEach(({ resolve }) => resolve(persisted));
    }
  } finally {
    persistFlushRunning = false;
    if (pendingPersistEntries.length > 0) {
      schedulePersistFlush();
    }
  }
}

function schedulePersistFlush(): void {
  bindPersistLifecycle();
  if (persistFlushTimer !== null) {
    return;
  }
  if (typeof window === 'undefined') {
    void flushPendingPersistEntries();
    return;
  }
  persistFlushTimer = window.setTimeout(() => {
    void flushPendingPersistEntries();
  }, DAOIST_MESSAGE_FLUSH_DELAY_MS);
}

export async function appendDaoistMessages(
  playerId: string,
  peerPlayerId: string,
  messages: readonly DaoistDirectMessageView[],
): Promise<boolean> {
  if (messages.length === 0) {
    return true;
  }
  if (!playerId || !peerPlayerId) {
    return false;
  }
  return new Promise<boolean>((resolve) => {
    pendingPersistEntries.push({
      records: messages.map((message) => ({ ...message, playerId, peerPlayerId } satisfies DaoistMessageRecord)),
      resolve,
    });
    schedulePersistFlush();
  });
}

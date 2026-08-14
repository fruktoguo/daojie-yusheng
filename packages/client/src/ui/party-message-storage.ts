/**
 * 队伍消息的设备本地历史。按「玩家 × 队伍」隔离，云端只保留最近一段记录，
 * 本地用于跨会话补全；换队或换角色后旧队伍的请求代际会被丢弃，不会串数据。
 */
import type { PartyChatMessageView } from '@mud/shared';

type PartyMessageRecord = PartyChatMessageView & {
  playerId: string;
};

const PARTY_MESSAGE_DB_NAME = 'mud-party-message';
const PARTY_MESSAGE_DB_VERSION = 1;
const PARTY_MESSAGE_STORE_NAME = 'messages';
const PARTY_MESSAGE_INDEX_BY_PARTY_TIME = 'by-party-time';
const PARTY_MESSAGE_FLUSH_DELAY_MS = 150;
const PARTY_MESSAGE_BATCH_SIZE = 200;

let databasePromise: Promise<IDBDatabase | null> | null = null;
let indexedDbUnavailableWarned = false;
let persistLifecycleBound = false;
let persistFlushTimer: number | null = null;
let persistFlushRunning = false;

type PendingPersistEntry = {
  records: PartyMessageRecord[];
  resolve: (persisted: boolean) => void;
};

const pendingPersistEntries: PendingPersistEntry[] = [];

function warnIndexedDbUnavailable(error: unknown): void {
  if (indexedDbUnavailableWarned) {
    return;
  }
  indexedDbUnavailableWarned = true;
  console.warn('[party] IndexedDB 不可用，本次会话将退回仅内存队伍消息记录。', error);
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase | null>((resolve) => {
      try {
        const request = window.indexedDB.open(PARTY_MESSAGE_DB_NAME, PARTY_MESSAGE_DB_VERSION);
        request.onupgradeneeded = () => {
          const database = request.result;
          const store = database.objectStoreNames.contains(PARTY_MESSAGE_STORE_NAME)
            ? request.transaction?.objectStore(PARTY_MESSAGE_STORE_NAME)
            : database.createObjectStore(PARTY_MESSAGE_STORE_NAME, {
              keyPath: ['playerId', 'partyId', 'messageId'],
            });
          if (store && !store.indexNames.contains(PARTY_MESSAGE_INDEX_BY_PARTY_TIME)) {
            store.createIndex(
              PARTY_MESSAGE_INDEX_BY_PARTY_TIME,
              ['playerId', 'partyId', 'sentAt', 'messageId'],
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

function buildPartyRange(playerId: string, partyId: string): IDBKeyRange {
  return IDBKeyRange.bound(
    [playerId, partyId, 0, ''],
    [playerId, partyId, Number.MAX_SAFE_INTEGER, '\uffff'],
  );
}

export async function loadRecentPartyMessages(
  playerId: string,
  partyId: string,
  limit = 100,
): Promise<PartyChatMessageView[]> {
  const database = await openDatabase();
  if (!database || !playerId || !partyId || limit <= 0) {
    return [];
  }
  return new Promise<PartyChatMessageView[]>((resolve) => {
    try {
      const transaction = database.transaction(PARTY_MESSAGE_STORE_NAME, 'readonly');
      const index = transaction.objectStore(PARTY_MESSAGE_STORE_NAME).index(PARTY_MESSAGE_INDEX_BY_PARTY_TIME);
      const request = index.openCursor(buildPartyRange(playerId, partyId), 'prev');
      const messages: PartyChatMessageView[] = [];
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || messages.length >= limit) {
          resolve(messages.reverse());
          return;
        }
        const record = cursor.value as PartyMessageRecord;
        messages.push({
          messageId: record.messageId,
          partyId: record.partyId,
          fromPlayerId: record.fromPlayerId,
          fromName: record.fromName,
          text: record.text,
          sentAt: record.sentAt,
        });
        cursor.continue();
      };
      request.onerror = () => {
        console.warn('[party] 读取队伍消息历史失败。', request.error);
        resolve([]);
      };
    } catch (error) {
      console.warn('[party] 读取队伍消息历史失败。', error);
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
    const records = new Map<string, PartyMessageRecord>();
    for (const entry of entries) {
      for (const record of entry.records) {
        records.set(`${record.playerId}\n${record.partyId}\n${record.messageId}`, record);
      }
    }
    const transaction = database.transaction(PARTY_MESSAGE_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(PARTY_MESSAGE_STORE_NAME);
    for (const record of records.values()) {
      store.put(record);
    }
    await waitForTransaction(transaction);
    return true;
  } catch (error) {
    console.warn('[party] 写入队伍消息历史失败。', error);
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
        if (batch.length > 0 && recordCount + next.records.length > PARTY_MESSAGE_BATCH_SIZE) {
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
  }, PARTY_MESSAGE_FLUSH_DELAY_MS);
}

export async function appendPartyMessages(
  playerId: string,
  partyId: string,
  messages: readonly PartyChatMessageView[],
): Promise<boolean> {
  if (messages.length === 0) {
    return true;
  }
  if (!playerId || !partyId) {
    return false;
  }
  return new Promise<boolean>((resolve) => {
    pendingPersistEntries.push({
      records: messages.map((message) => ({ ...message, playerId, partyId } satisfies PartyMessageRecord)),
      resolve,
    });
    schedulePersistFlush();
  });
}

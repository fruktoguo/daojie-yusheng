import {
  CHAT_LOG_MAX_PERSISTED_MESSAGES_PER_CHANNEL,
  CHAT_LOG_STORAGE_KEY,
  type ChatChannel,
  type ChatMessageKind,
  type ChatMessageScope,
  type ChatStoredMessage,
} from '../constants/ui/chat';

/** ChatMessageRecord：定义该类型的结构与数据语义。 */
type ChatMessageRecord = ChatStoredMessage & {
  scopeId: string;
  channel: ChatChannel;
};

/** ChatMessageCursor：定义该类型的结构与数据语义。 */
type ChatMessageCursor = Pick<ChatStoredMessage, 'at' | 'id'>;

const CHAT_DB_NAME = 'mud-chat-log';
const CHAT_DB_VERSION = 1;
const CHAT_DB_STORE_NAME = 'messages';
const CHAT_DB_INDEX_BY_CHANNEL_TIME = 'by-channel-time';
const CHAT_PERSIST_FLUSH_DELAY_MS = 200;
const CHAT_PERSIST_BATCH_SIZE = 200;

let databasePromise: Promise<IDBDatabase | null> | null = null;
let legacyStorageCleared = false;
let indexedDbUnavailableWarned = false;
let persistLifecycleBound = false;
let persistFlushTimer: number | null = null;
let persistFlushRunning = false;

/** PendingPersistEntry：定义该类型的结构与数据语义。 */
type PendingPersistEntry = {
  scopeId: string;
  entry: ChatStoredMessage;
  channels: ChatChannel[];
  resolve: (value: boolean) => void;
};

const pendingPersistEntries: PendingPersistEntry[] = [];

/** warnIndexedDbUnavailable：执行对应的业务逻辑。 */
function warnIndexedDbUnavailable(error: unknown): void {
  if (indexedDbUnavailableWarned) {
    return;
  }
  indexedDbUnavailableWarned = true;
  console.warn('[chat] IndexedDB 不可用，本次会话将退回仅内存聊天记录。', error);
}

/** withRequestResult：执行对应的业务逻辑。 */
function withRequestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

/** withTransactionComplete：执行对应的业务逻辑。 */
function withTransactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
  });
}

/** getLegacyStorage：执行对应的业务逻辑。 */
function getLegacyStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** clearLegacyChatStorage：执行对应的业务逻辑。 */
export function clearLegacyChatStorage(): void {
  if (legacyStorageCleared) {
    return;
  }
  legacyStorageCleared = true;
  const storage = getLegacyStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(CHAT_LOG_STORAGE_KEY);
  } catch (error) {
    console.warn('[chat] 清理旧版 localStorage 聊天缓存失败。', error);
  }
}

/** bindPersistLifecycle：执行对应的业务逻辑。 */
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

/** openDatabase：执行对应的业务逻辑。 */
async function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return null;
  }
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase | null>((resolve) => {
      try {
        const request = window.indexedDB.open(CHAT_DB_NAME, CHAT_DB_VERSION);
        request.onupgradeneeded = () => {
          const database = request.result;
          const store = database.objectStoreNames.contains(CHAT_DB_STORE_NAME)
            ? request.transaction?.objectStore(CHAT_DB_STORE_NAME)
            : database.createObjectStore(CHAT_DB_STORE_NAME, { keyPath: ['scopeId', 'channel', 'id'] });
          if (store && !store.indexNames.contains(CHAT_DB_INDEX_BY_CHANNEL_TIME)) {
            store.createIndex(CHAT_DB_INDEX_BY_CHANNEL_TIME, ['scopeId', 'channel', 'at', 'id'], { unique: false });
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

/** toStoredMessage：执行对应的业务逻辑。 */
function toStoredMessage(record: ChatMessageRecord): ChatStoredMessage {
  return {
    id: record.id,
    at: record.at,
    text: record.text,
    from: record.from,
    kind: record.kind,
    scope: record.scope,
  };
}

/** buildChannelRange：执行对应的业务逻辑。 */
function buildChannelRange(scopeId: string, channel: ChatChannel): IDBKeyRange {
  return IDBKeyRange.bound(
    [scopeId, channel, 0, ''],
    [scopeId, channel, Number.MAX_SAFE_INTEGER, '\uffff'],
  );
}

/** buildOlderThanRange：执行对应的业务逻辑。 */
function buildOlderThanRange(scopeId: string, channel: ChatChannel, before: ChatMessageCursor): IDBKeyRange {
  return IDBKeyRange.bound(
    [scopeId, channel, 0, ''],
    [scopeId, channel, before.at, before.id],
    false,
    true,
  );
}

/** readMessagesByRange：执行对应的业务逻辑。 */
async function readMessagesByRange(
  scopeId: string,
  channel: ChatChannel,
  limit: number,
  range: IDBKeyRange,
): Promise<ChatStoredMessage[]> {
  const database = await openDatabase();
  if (!database) {
    return [];
  }

  return new Promise<ChatStoredMessage[]>((resolve) => {
    try {
      const transaction = database.transaction(CHAT_DB_STORE_NAME, 'readonly');
      const index = transaction.objectStore(CHAT_DB_STORE_NAME).index(CHAT_DB_INDEX_BY_CHANNEL_TIME);
      const request = index.openCursor(range, 'prev');
      const result: ChatStoredMessage[] = [];
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || result.length >= limit) {
          resolve(result.reverse());
          return;
        }
        result.push(toStoredMessage(cursor.value as ChatMessageRecord));
        cursor.continue();
      };
      request.onerror = () => {
        console.warn('[chat] 读取聊天记录失败。', request.error);
        resolve([]);
      };
    } catch (error) {
      console.warn('[chat] 读取聊天记录失败。', error);
      resolve([]);
    }
  });
}

/** pruneChannel：执行对应的业务逻辑。 */
async function pruneChannel(scopeId: string, channel: ChatChannel): Promise<void> {
  const database = await openDatabase();
  if (!database) {
    return;
  }

  const range = buildChannelRange(scopeId, channel);
  try {
    const countTransaction = database.transaction(CHAT_DB_STORE_NAME, 'readonly');
    const countIndex = countTransaction.objectStore(CHAT_DB_STORE_NAME).index(CHAT_DB_INDEX_BY_CHANNEL_TIME);
    const total = await withRequestResult(countIndex.count(range));
    await withTransactionComplete(countTransaction);
    const overflow = total - CHAT_LOG_MAX_PERSISTED_MESSAGES_PER_CHANNEL;
    if (overflow <= 0) {
      return;
    }

    const keysToDelete = await new Promise<IDBValidKey[]>((resolve) => {
      const collected: IDBValidKey[] = [];
      try {
        const transaction = database.transaction(CHAT_DB_STORE_NAME, 'readonly');
        const index = transaction.objectStore(CHAT_DB_STORE_NAME).index(CHAT_DB_INDEX_BY_CHANNEL_TIME);
        const request = index.openKeyCursor(range, 'next');
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor || collected.length >= overflow) {
            resolve(collected);
            return;
          }
          collected.push(cursor.primaryKey);
          cursor.continue();
        };
        request.onerror = () => {
          console.warn('[chat] 裁剪聊天记录失败。', request.error);
          resolve(collected);
        };
      } catch (error) {
        console.warn('[chat] 裁剪聊天记录失败。', error);
        resolve(collected);
      }
    });
    if (keysToDelete.length === 0) {
      return;
    }

    const deleteTransaction = database.transaction(CHAT_DB_STORE_NAME, 'readwrite');
    const store = deleteTransaction.objectStore(CHAT_DB_STORE_NAME);
    for (const key of keysToDelete) {
      store.delete(key);
    }
    await withTransactionComplete(deleteTransaction);
  } catch (error) {
    console.warn('[chat] 裁剪聊天记录失败。', error);
  }
}

/** persistBatch：执行对应的业务逻辑。 */
async function persistBatch(entries: PendingPersistEntry[]): Promise<boolean> {
  const database = await openDatabase();
  if (!database || entries.length === 0) {
    return false;
  }

  try {
    const dedupedRecords = new Map<string, ChatMessageRecord>();
    const touchedChannels = new Map<string, { scopeId: string; channel: ChatChannel }>();
    for (const pending of entries) {
      for (const channel of pending.channels) {
        const dedupeKey = `${pending.scopeId}\n${channel}\n${pending.entry.id}`;
        dedupedRecords.set(dedupeKey, {
          scopeId: pending.scopeId,
          channel,
          id: pending.entry.id,
          at: pending.entry.at,
          text: pending.entry.text,
          from: pending.entry.from,
          kind: pending.entry.kind as ChatMessageKind,
          scope: pending.entry.scope as ChatMessageScope | undefined,
        });
        touchedChannels.set(`${pending.scopeId}\n${channel}`, {
          scopeId: pending.scopeId,
          channel,
        });
      }
    }

    const transaction = database.transaction(CHAT_DB_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(CHAT_DB_STORE_NAME);
    for (const record of dedupedRecords.values()) {
      store.put(record);
    }
    await withTransactionComplete(transaction);

    await Promise.all([...touchedChannels.values()].map(({ scopeId, channel }) => pruneChannel(scopeId, channel)));
    return true;
  } catch (error) {
    console.warn('[chat] 写入聊天记录失败。', error);
    return false;
  }
}

/** flushPendingPersistEntries：执行对应的业务逻辑。 */
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
      const batch = pendingPersistEntries.splice(0, CHAT_PERSIST_BATCH_SIZE);
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

/** schedulePersistFlush：执行对应的业务逻辑。 */
function schedulePersistFlush(): void {
  bindPersistLifecycle();
  if (persistFlushTimer !== null || typeof window === 'undefined') {
    return;
  }
  persistFlushTimer = window.setTimeout(() => {
    void flushPendingPersistEntries();
  }, CHAT_PERSIST_FLUSH_DELAY_MS);
}

/** loadRecentChannelMessages：执行对应的业务逻辑。 */
export async function loadRecentChannelMessages(
  scopeId: string,
  channel: ChatChannel,
  limit: number,
): Promise<ChatStoredMessage[]> {
  return readMessagesByRange(scopeId, channel, limit, buildChannelRange(scopeId, channel));
}

/** loadOlderChannelMessages：执行对应的业务逻辑。 */
export async function loadOlderChannelMessages(
  scopeId: string,
  channel: ChatChannel,
  before: ChatMessageCursor,
  limit: number,
): Promise<ChatStoredMessage[]> {
  return readMessagesByRange(scopeId, channel, limit, buildOlderThanRange(scopeId, channel, before));
}

/** appendChannelMessages：执行对应的业务逻辑。 */
export async function appendChannelMessages(
  scopeId: string,
  entry: ChatStoredMessage,
  channels: ChatChannel[],
): Promise<boolean> {
  if (channels.length === 0) {
    return false;
  }
  return new Promise<boolean>((resolve) => {
    pendingPersistEntries.push({
      scopeId,
      entry,
      channels: [...channels],
      resolve,
    });
    schedulePersistFlush();
  });
}


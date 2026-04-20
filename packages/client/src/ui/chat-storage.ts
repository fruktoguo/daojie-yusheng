import {
  CHAT_LOG_MAX_PERSISTED_MESSAGES_PER_CHANNEL,
  type ChatChannel,
  type ChatMessageKind,
  type ChatMessageScope,
  type ChatStoredMessage,
} from '../constants/ui/chat';

/** ChatMessageRecord：聊天持久化记录。 */
type ChatMessageRecord = ChatStoredMessage & {
/**
 * scopeId：scopeID标识。
 */

  scopeId: string;  
  /**
 * channel：channel相关字段。
 */

  channel: ChatChannel;
};

/** ChatMessageCursor：聊天记录游标。 */
type ChatMessageCursor = Pick<ChatStoredMessage, 'at' | 'id'>;

/** CHAT_DB_NAME：聊天DB名称。 */
const CHAT_DB_NAME = 'mud-chat-log';
/** CHAT_DB_VERSION：聊天DB版本。 */
const CHAT_DB_VERSION = 1;
/** CHAT_DB_STORE_NAME：聊天DB存储名称。 */
const CHAT_DB_STORE_NAME = 'messages';
/** CHAT_DB_INDEX_BY_CHANNEL_TIME：聊天DB索引BY CHANNEL时间。 */
const CHAT_DB_INDEX_BY_CHANNEL_TIME = 'by-channel-time';

/** databasePromise：数据库异步结果。 */
let databasePromise: Promise<IDBDatabase | null> | null = null;
/** indexedDbUnavailableWarned：indexed Db Unavailable Warned。 */
let indexedDbUnavailableWarned = false;

/** warnIndexedDbUnavailable：处理警告Indexed Db Unavailable。 */
function warnIndexedDbUnavailable(error: unknown): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (indexedDbUnavailableWarned) {
    return;
  }
  /** indexedDbUnavailableWarned：indexed Db Unavailable Warned。 */
  indexedDbUnavailableWarned = true;
  console.warn('[chat] IndexedDB 不可用，本次会话将退回仅内存聊天记录。', error);
}

/** withRequestResult：处理with请求结果。 */
function withRequestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

/** withTransactionComplete：处理with Transaction Complete。 */
function withTransactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
  });
}

/** openDatabase：打开数据库。 */
async function openDatabase(): Promise<IDBDatabase | null> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** toStoredMessage：处理to Stored Message。 */
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

/** buildChannelRange：构建Channel Range。 */
function buildChannelRange(scopeId: string, channel: ChatChannel): IDBKeyRange {
  return IDBKeyRange.bound(
    [scopeId, channel, 0, ''],
    [scopeId, channel, Number.MAX_SAFE_INTEGER, '\uffff'],
  );
}

/** buildOlderThanRange：构建Older Than Range。 */
function buildOlderThanRange(scopeId: string, channel: ChatChannel, before: ChatMessageCursor): IDBKeyRange {
  return IDBKeyRange.bound(
    [scopeId, channel, 0, ''],
    [scopeId, channel, before.at, before.id],
    false,
    true,
  );
}

/** readMessagesByRange：处理read Messages By Range。 */
async function readMessagesByRange(
  scopeId: string,
  channel: ChatChannel,
  limit: number,
  range: IDBKeyRange,
): Promise<ChatStoredMessage[]> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** pruneChannel：处理prune Channel。 */
async function pruneChannel(scopeId: string, channel: ChatChannel): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** loadRecentChannelMessages：加载Recent Channel Messages。 */
export async function loadRecentChannelMessages(
  scopeId: string,
  channel: ChatChannel,
  limit: number,
): Promise<ChatStoredMessage[]> {
  return readMessagesByRange(scopeId, channel, limit, buildChannelRange(scopeId, channel));
}

/** loadOlderChannelMessages：加载Older Channel Messages。 */
export async function loadOlderChannelMessages(
  scopeId: string,
  channel: ChatChannel,
  before: ChatMessageCursor,
  limit: number,
): Promise<ChatStoredMessage[]> {
  return readMessagesByRange(scopeId, channel, limit, buildOlderThanRange(scopeId, channel, before));
}

/** appendChannelMessages：处理append Channel Messages。 */
export async function appendChannelMessages(
  scopeId: string,
  entry: ChatStoredMessage,
  channels: ChatChannel[],
): Promise<boolean> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const database = await openDatabase();
  if (!database || channels.length === 0) {
    return false;
  }

  try {
    const transaction = database.transaction(CHAT_DB_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(CHAT_DB_STORE_NAME);
    for (const channel of channels) {
      const record: ChatMessageRecord = {
        scopeId,
        channel,
        id: entry.id,
        at: entry.at,
        text: entry.text,
        from: entry.from,
        kind: entry.kind as ChatMessageKind,
        scope: entry.scope as ChatMessageScope | undefined,
      };
      store.put(record);
    }
    await withTransactionComplete(transaction);
    await Promise.all(channels.map((channel) => pruneChannel(scopeId, channel)));
    return true;
  } catch (error) {
    console.warn('[chat] 写入聊天记录失败。', error);
    return false;
  }
}


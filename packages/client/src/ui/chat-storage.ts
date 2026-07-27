/**
 * 本文件是客户端 DOM UI 的 chat storage 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有交互状态，不在 UI 层裁定资产、战斗或移动合法性。
 */
import {
  CHAT_LOG_STORAGE_KEY,
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
/** 聊天写入批量 flush 延迟。 */
const CHAT_PERSIST_FLUSH_DELAY_MS = 200;
/** 单次批量写入最大条数。 */
const CHAT_PERSIST_BATCH_SIZE = 200;

/** databasePromise：数据库异步结果。 */
let databasePromise: Promise<IDBDatabase | null> | null = null;
/** legacyStorageCleared：旧 localStorage 缓存是否已清理。 */
let legacyStorageCleared = false;
/** indexedDbUnavailableWarned：indexed Db Unavailable Warned。 */
let indexedDbUnavailableWarned = false;
/** persistLifecycleBound：页面生命周期 flush 是否已绑定。 */
let persistLifecycleBound = false;
/** persistFlushTimer：批量 flush 定时器。 */
let persistFlushTimer: number | null = null;
/** persistFlushRunning：是否正在 flush。 */
let persistFlushRunning = false;

type PendingPersistEntry = {
  records: Array<{
    scopeId: string;
    entry: ChatStoredMessage;
    channels: ChatChannel[];
  }>;
  resolve: (value: boolean) => void;
};

const pendingPersistEntries: PendingPersistEntry[] = [];

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

/** 清理旧版 localStorage 聊天缓存，避免 IndexedDB 切换后遗留旧记录。 */
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
    ...(record.combat ? { combat: record.combat } : undefined),
    ...(record.combatGroup ? { combatGroup: record.combatGroup } : undefined),
    ...(record.structured ? { structured: record.structured } : undefined),
    ...(record.structuredGroup ? { structuredGroup: record.structuredGroup } : undefined),
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

async function persistBatch(entries: PendingPersistEntry[]): Promise<boolean> {
  const database = await openDatabase();
  if (!database || entries.length === 0) {
    return false;
  }

  try {
    const dedupedRecords = new Map<string, ChatMessageRecord>();
    for (const pending of entries) {
      for (const record of pending.records) {
        for (const channel of record.channels) {
          const dedupeKey = `${record.scopeId}\n${channel}\n${record.entry.id}`;
          dedupedRecords.set(dedupeKey, {
            scopeId: record.scopeId,
            channel,
            id: record.entry.id,
            at: record.entry.at,
            text: record.entry.text,
            from: record.entry.from,
            kind: record.entry.kind as ChatMessageKind,
            scope: record.entry.scope as ChatMessageScope | undefined,
            ...(record.entry.combat ? { combat: record.entry.combat } : undefined),
            ...(record.entry.combatGroup ? { combatGroup: record.entry.combatGroup } : undefined),
            ...(record.entry.structured ? { structured: record.entry.structured } : undefined),
            ...(record.entry.structuredGroup ? { structuredGroup: record.entry.structuredGroup } : undefined),
          });
        }
      }
    }

    const transaction = database.transaction(CHAT_DB_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(CHAT_DB_STORE_NAME);
    for (const record of dedupedRecords.values()) {
      store.put(record);
    }
    await withTransactionComplete(transaction);
    return true;
  } catch (error) {
    console.warn('[chat] 写入聊天记录失败。', error);
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

function schedulePersistFlush(): void {
  bindPersistLifecycle();
  if (persistFlushTimer !== null || typeof window === 'undefined') {
    return;
  }
  persistFlushTimer = window.setTimeout(() => {
    void flushPendingPersistEntries();
  }, CHAT_PERSIST_FLUSH_DELAY_MS);
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
  resolveChannelScopeId: (channel: ChatChannel) => string = () => scopeId,
): Promise<boolean> {
  if (channels.length === 0) {
    return false;
  }
  return new Promise<boolean>((resolve) => {
    pendingPersistEntries.push({
      records: channels.map((channel) => ({
        scopeId: resolveChannelScopeId(channel),
        entry,
        channels: [channel],
      })),
      resolve,
    });
    schedulePersistFlush();
  });
}

/** 批量追加服务端历史，整个历史包共用一次 IndexedDB 事务。 */
export async function appendChannelMessageBatch(
  scopeId: string,
  entries: Array<{ entry: ChatStoredMessage; channels: ChatChannel[] }>,
  resolveChannelScopeId: (channel: ChatChannel) => string = () => scopeId,
): Promise<boolean> {
  const records = entries.flatMap(({ entry, channels }) => channels.map((channel) => ({
    scopeId: resolveChannelScopeId(channel),
    entry,
    channels: [channel],
  })));
  if (records.length === 0) {
    return true;
  }
  return new Promise<boolean>((resolve) => {
    pendingPersistEntries.push({ records, resolve });
    schedulePersistFlush();
  });
}

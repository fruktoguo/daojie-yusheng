/**
 * 战斗日志使用独立的有界 localStorage 快照，避免重新进入通用聊天的 IndexedDB 高频写入链路。
 */
import {
  CHAT_COMBAT_LOG_MAX_MESSAGES,
  CHAT_MESSAGE_SCOPES,
  type ChatStoredMessage,
} from '../constants/ui/chat';

interface StoredCombatLogSnapshot {
  version: 1;
  messages: ChatStoredMessage[];
}

const COMBAT_LOG_STORAGE_PREFIX = 'mud:combat-log:v1:';
/** 持续战斗时最多每 5 秒写一次有界快照。 */
export const CHAT_COMBAT_LOG_PERSIST_DELAY_MS = 5_000;

export function loadCombatLogMessages(
  playerId: string,
  storage: Storage | null = getLocalStorage(),
): ChatStoredMessage[] {
  const normalizedPlayerId = normalizePlayerId(playerId);
  if (!normalizedPlayerId || !storage) {
    return [];
  }
  try {
    const raw = storage.getItem(buildStorageKey(normalizedPlayerId));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as Partial<StoredCombatLogSnapshot>;
    if (parsed.version !== 1) {
      return [];
    }
    return normalizeCombatLogMessages(parsed.messages);
  } catch {
    return [];
  }
}

export function saveCombatLogMessages(
  playerId: string,
  messages: readonly ChatStoredMessage[],
  storage: Storage | null = getLocalStorage(),
): boolean {
  const normalizedPlayerId = normalizePlayerId(playerId);
  if (!normalizedPlayerId || !storage) {
    return false;
  }
  const existingMessages = loadCombatLogMessages(normalizedPlayerId, storage);
  const snapshot: StoredCombatLogSnapshot = {
    version: 1,
    messages: normalizeCombatLogMessages([...existingMessages, ...messages]),
  };
  try {
    storage.setItem(buildStorageKey(normalizedPlayerId), JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

/** 过滤损坏记录、按 ID 去重，并只保留时间上最新的有界窗口。 */
export function normalizeCombatLogMessages(messages: unknown): ChatStoredMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }
  const byId = new Map<string, ChatStoredMessage>();
  for (const value of messages) {
    const normalized = normalizeCombatLogMessage(value);
    if (normalized) {
      byId.set(normalized.id, normalized);
    }
  }
  return Array.from(byId.values())
    .sort((left, right) => left.at - right.at || left.id.localeCompare(right.id))
    .slice(-CHAT_COMBAT_LOG_MAX_MESSAGES);
}

function normalizeCombatLogMessage(value: unknown): ChatStoredMessage | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<ChatStoredMessage>;
  if (typeof candidate.id !== 'string'
    || candidate.id.trim().length === 0
    || typeof candidate.at !== 'number'
    || !Number.isFinite(candidate.at)
    || typeof candidate.text !== 'string'
    || candidate.kind !== 'combat'
    || (candidate.from !== undefined && typeof candidate.from !== 'string')
    || (candidate.scope !== undefined && !CHAT_MESSAGE_SCOPES.includes(candidate.scope))) {
    return null;
  }
  return {
    id: candidate.id,
    at: candidate.at,
    text: candidate.text,
    kind: 'combat',
    ...(candidate.from !== undefined ? { from: candidate.from } : undefined),
    ...(candidate.scope !== undefined ? { scope: candidate.scope } : undefined),
    ...(candidate.combat !== undefined ? { combat: candidate.combat } : undefined),
    ...(Array.isArray(candidate.combatGroup) ? { combatGroup: candidate.combatGroup } : undefined),
    ...(candidate.structured !== undefined ? { structured: candidate.structured } : undefined),
    ...(Array.isArray(candidate.structuredGroup) ? { structuredGroup: candidate.structuredGroup } : undefined),
  };
}

function buildStorageKey(playerId: string): string {
  return `${COMBAT_LOG_STORAGE_PREFIX}${encodeURIComponent(playerId)}`;
}

function normalizePlayerId(playerId: string): string {
  return typeof playerId === 'string' ? playerId.trim() : '';
}

function getLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

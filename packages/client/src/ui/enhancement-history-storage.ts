/**
 * 强化历史 localStorage 读取与解析共享逻辑。
 * 从 craft-workbench-modal.ts 和 craft-enhancement-view.ts 提取。
 */
import type { PlayerEnhancementRecord } from '@mud/shared';
import { normalizeEnhanceLevel } from '@mud/shared';

type StoredEnhancementHistoryStateV1 = {
  version: 1;
  totals: PlayerEnhancementRecord[];
  sessionRecord: PlayerEnhancementRecord | null;
};

type StoredEnhancementHistoryState = {
  version: 2;
  totals: PlayerEnhancementRecord[];
  sessions: PlayerEnhancementRecord[];
  sessionRecord: PlayerEnhancementRecord | null;
};

export const ENHANCEMENT_HISTORY_STORAGE_KEY = 'mud:enhancement-history:v2';
const LEGACY_ENHANCEMENT_HISTORY_KEY = 'mud:enhancement-history:v1';

export function cloneEnhancementRecord(record: PlayerEnhancementRecord): PlayerEnhancementRecord {
  return {
    itemId: record.itemId,
    highestLevel: normalizeEnhanceLevel(record.highestLevel),
    levels: [...(record.levels ?? [])]
      .map((entry) => ({
        targetLevel: Math.max(1, Math.floor(Number(entry.targetLevel) || 1)),
        successCount: Math.max(0, Math.floor(Number(entry.successCount) || 0)),
        failureCount: Math.max(0, Math.floor(Number(entry.failureCount) || 0)),
      }))
      .sort((left, right) => left.targetLevel - right.targetLevel),
    actionStartedAt: Number.isFinite(record.actionStartedAt) && Number(record.actionStartedAt) > 0
      ? Math.floor(Number(record.actionStartedAt))
      : undefined,
    actionEndedAt: Number.isFinite(record.actionEndedAt) && Number(record.actionEndedAt) > 0
      ? Math.floor(Number(record.actionEndedAt))
      : undefined,
    startLevel: Number.isFinite(record.startLevel) ? normalizeEnhanceLevel(record.startLevel) : undefined,
    initialTargetLevel: Number.isFinite(record.initialTargetLevel)
      ? Math.max(1, Math.floor(Number(record.initialTargetLevel)))
      : undefined,
    desiredTargetLevel: Number.isFinite(record.desiredTargetLevel)
      ? Math.max(1, Math.floor(Number(record.desiredTargetLevel)))
      : undefined,
    protectionStartLevel: Number.isFinite(record.protectionStartLevel)
      ? Math.max(2, Math.floor(Number(record.protectionStartLevel)))
      : undefined,
    status: record.status === 'completed' || record.status === 'cancelled' || record.status === 'stopped' || record.status === 'in_progress'
      ? record.status
      : undefined,
  };
}

export function normalizeEnhancementRecordList(records: PlayerEnhancementRecord[] | null | undefined): PlayerEnhancementRecord[] {
  if (!Array.isArray(records)) {
    return [];
  }
  return records
    .filter((entry): entry is PlayerEnhancementRecord => Boolean(entry?.itemId))
    .map((entry) => cloneEnhancementRecord(entry));
}

export function isEnhancementHistorySessionRecord(record: PlayerEnhancementRecord | null | undefined): boolean {
  return Boolean(record && Number.isFinite(record.actionStartedAt) && Number(record.actionStartedAt) > 0);
}

/** 从 localStorage 读取强化历史的解析结果。 */
export interface EnhancementHistoryParseResult {
  totals: Map<string, PlayerEnhancementRecord>;
  sessions: PlayerEnhancementRecord[];
  sessionRecord: PlayerEnhancementRecord | null;
  migratedFromV1: boolean;
}

/** 从 localStorage 读取并解析强化历史，兼容 v1 旧格式。 */
export function readEnhancementHistoryFromStorage(): EnhancementHistoryParseResult | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ENHANCEMENT_HISTORY_STORAGE_KEY);
    if (!raw) {
      const legacyRaw = window.localStorage.getItem(LEGACY_ENHANCEMENT_HISTORY_KEY);
      if (!legacyRaw) return null;
      const parsedLegacy = JSON.parse(legacyRaw) as Partial<StoredEnhancementHistoryStateV1>;
      return {
        totals: new Map(
          normalizeEnhancementRecordList(parsedLegacy.totals).map((entry) => [entry.itemId, entry] as const),
        ),
        sessions: [],
        sessionRecord: parsedLegacy.sessionRecord ? cloneEnhancementRecord(parsedLegacy.sessionRecord) : null,
        migratedFromV1: true,
      };
    }
    const parsed = JSON.parse(raw) as Partial<StoredEnhancementHistoryState>;
    return {
      totals: new Map(
        normalizeEnhancementRecordList(parsed.totals).map((entry) => [entry.itemId, entry] as const),
      ),
      sessions: normalizeEnhancementRecordList(parsed.sessions)
        .filter((entry) => isEnhancementHistorySessionRecord(entry))
        .sort((left, right) => (right.actionStartedAt ?? 0) - (left.actionStartedAt ?? 0)),
      sessionRecord: parsed.sessionRecord ? cloneEnhancementRecord(parsed.sessionRecord) : null,
      migratedFromV1: false,
    };
  } catch {
    return { totals: new Map(), sessions: [], sessionRecord: null, migratedFromV1: false };
  }
}

/**
 * 本文件属于正式客户端主线，负责前端运行态、状态投影或通用工具。
 *
 * 维护时要区分“显示用派生数据”和“服务端权威数据”，注释只补充边界说明，不改变任何交互语义。
 */
import type {
  OfflineGainReportView,
  PlayerStatisticAmountPatchView,
  PlayerStatisticPeriodTotalPatchView,
  PlayerStatisticPeriodTotalView,
  PlayerStatisticTotalsPatchView,
  PlayerStatisticTotalsView,
} from '@mud/shared';

const OFFLINE_GAIN_STORAGE_PREFIX = 'mud:offline-gain-reports:v1:';
const PLAYER_STATISTIC_TOTALS_STORAGE_PREFIX = 'mud:player-statistic-totals:v1:';
const OFFLINE_GAIN_HISTORY_MIN_DURATION_MS = 60_000;

export interface OfflineGainStoreResult {
  reports: OfflineGainReportView[];
  storedReportIds: string[];
  storageOk: boolean;
  error?: string;
}

export function storeOfflineGainReportsInBrowser(
  playerId: string,
  reports: readonly OfflineGainReportView[],
  windowRef: Window = window,
): OfflineGainStoreResult {
  const normalizedPlayerId = normalizeStorageKeySegment(playerId);
  const normalizedReports = normalizeOfflineGainReports(reports);
  if (normalizedReports.length === 0) {
    return { reports: [], storedReportIds: [], storageOk: true };
  }
  const historyReports = normalizedReports.filter(isPlayerStatisticHistoryReport);
  const displayReports = historyReports.filter(isOfflineGainDisplayReport);
  const nonHistoryReportIds = normalizedReports
    .filter((report) => !isPlayerStatisticHistoryReport(report))
    .map((report) => report.id);
  if (historyReports.length === 0) {
    return {
      reports: [],
      storedReportIds: normalizedReports.map((report) => report.id),
      storageOk: true,
    };
  }

  const storage = getLocalStorage(windowRef);
  if (!storage) {
    return {
      reports: displayReports,
      storedReportIds: nonHistoryReportIds,
      storageOk: false,
      error: '浏览器本地存储不可用',
    };
  }

  try {
    const existing = readOfflineGainReportsFromBrowser(normalizedPlayerId, windowRef);
    const byId = new Map<string, OfflineGainReportView>();
    for (const report of [...existing, ...historyReports]) {
      byId.set(report.id, report);
    }
    const nextReports = Array.from(byId.values())
      .sort((left, right) => right.endedAt - left.endedAt);
    storage.setItem(buildStorageKey(normalizedPlayerId), JSON.stringify(nextReports));
    return {
      reports: displayReports,
      storedReportIds: normalizedReports.map((report) => report.id),
      storageOk: true,
    };
  } catch (error) {
    return {
      reports: displayReports,
      storedReportIds: nonHistoryReportIds,
      storageOk: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function readOfflineGainReportsFromBrowser(
  playerId: string,
  windowRef: Window = window,
): OfflineGainReportView[] {
  const storage = getLocalStorage(windowRef);
  if (!storage) {
    return [];
  }
  try {
    const raw = storage.getItem(buildStorageKey(normalizeStorageKeySegment(playerId)));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return normalizeOfflineGainReports(Array.isArray(parsed) ? parsed : [])
      .filter(isPlayerStatisticHistoryReport)
      .sort((left, right) => right.endedAt - left.endedAt);
  } catch {
    return [];
  }
}

export function storePlayerStatisticTotalsInBrowser(
  playerId: string,
  totals: PlayerStatisticTotalsView | null | undefined,
  windowRef: Window = window,
): boolean {
  const normalizedTotals = normalizePlayerStatisticTotals(totals);
  if (!normalizedTotals) {
    return false;
  }
  const storage = getLocalStorage(windowRef);
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(buildStatisticTotalsStorageKey(normalizeStorageKeySegment(playerId)), JSON.stringify(normalizedTotals));
    return true;
  } catch {
    return false;
  }
}

export function storePlayerStatisticTotalsPatchInBrowser(
  playerId: string,
  patch: PlayerStatisticTotalsPatchView | null | undefined,
  windowRef: Window = window,
): boolean {
  const normalizedPatch = normalizePlayerStatisticTotalsPatch(patch);
  if (!normalizedPatch) {
    return false;
  }
  const current = readPlayerStatisticTotalsFromBrowser(playerId, windowRef)
    ?? normalizePlayerStatisticTotals({});
  const next = applyPlayerStatisticTotalsPatch(current, normalizedPatch);
  return storePlayerStatisticTotalsInBrowser(playerId, next, windowRef);
}

export function readPlayerStatisticTotalsFromBrowser(
  playerId: string,
  windowRef: Window = window,
): PlayerStatisticTotalsView | null {
  const storage = getLocalStorage(windowRef);
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(buildStatisticTotalsStorageKey(normalizeStorageKeySegment(playerId)));
    if (!raw) {
      return null;
    }
    return normalizePlayerStatisticTotals(JSON.parse(raw));
  } catch {
    return null;
  }
}

function buildStorageKey(playerId: string): string {
  return `${OFFLINE_GAIN_STORAGE_PREFIX}${normalizeStorageKeySegment(playerId)}`;
}

function buildStatisticTotalsStorageKey(playerId: string): string {
  return `${PLAYER_STATISTIC_TOTALS_STORAGE_PREFIX}${normalizeStorageKeySegment(playerId)}`;
}

function normalizeStorageKeySegment(value: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || 'anonymous';
}

function getLocalStorage(windowRef: Window | null | undefined): Storage | null {
  try {
    return windowRef?.localStorage ?? null;
  } catch {
    return null;
  }
}

function normalizeOfflineGainReports(reports: readonly unknown[]): OfflineGainReportView[] {
  return (Array.isArray(reports) ? reports : [])
    .map((report) => normalizeOfflineGainReport(report))
    .filter((report): report is OfflineGainReportView => Boolean(report));
}

function isOfflineGainDisplayReport(report: OfflineGainReportView): boolean {
  return report.scope === 'offline' && report.durationMs >= OFFLINE_GAIN_HISTORY_MIN_DURATION_MS;
}

function isPlayerStatisticHistoryReport(report: OfflineGainReportView): boolean {
  return report.scope === 'online' ? hasOfflineGainReportParts(report) : isOfflineGainDisplayReport(report);
}

function hasOfflineGainReportParts(report: OfflineGainReportView): boolean {
  return (report.spiritStones?.gained ?? 0) > 0
    || (report.spiritStones?.lost ?? 0) > 0
    || report.items.length > 0
    || report.progress.length > 0
    || report.techniques.length > 0
    || report.professions.length > 0;
}

function normalizeOfflineGainReport(report: unknown): OfflineGainReportView | null {
  const record = report && typeof report === 'object' ? report as Partial<OfflineGainReportView> : null;
  const id = normalizeString(record?.id);
  if (!id) {
    return null;
  }
  const startedAt = normalizeInteger(record?.startedAt);
  const endedAt = Math.max(startedAt, normalizeInteger(record?.endedAt));
  return {
    id,
    playerId: normalizeString(record?.playerId) || undefined,
    scope: record?.scope === 'online' ? 'online' : 'offline',
    source: normalizeString(record?.source) || (record?.scope === 'online' ? 'system' : 'cultivation'),
    startedAt,
    endedAt,
    durationMs: Math.max(0, normalizeInteger(record?.durationMs) || endedAt - startedAt),
    generatedAt: normalizeInteger(record?.generatedAt) || Date.now(),
    spiritStones: normalizeAmountRecord(record?.spiritStones),
    items: (Array.isArray(record?.items) ? record.items : [])
      .map((entry) => normalizeItemDelta(entry))
      .filter((entry): entry is NonNullable<ReturnType<typeof normalizeItemDelta>> => Boolean(entry)),
    progress: (Array.isArray(record?.progress) ? record.progress : [])
      .map((entry) => ({
        kind: normalizeProgressKind(entry?.kind),
        label: normalizeString(entry?.label) || '收益',
        ...normalizeAmountRecord(entry),
        levelGain: normalizeOptionalInteger(entry?.levelGain),
        levelLoss: normalizeOptionalInteger(entry?.levelLoss),
        currentLevel: normalizeOptionalInteger(entry?.currentLevel),
      }))
      .filter((entry) => entry.gained > 0 || entry.lost > 0 || (entry.levelGain ?? 0) > 0 || (entry.levelLoss ?? 0) > 0),
    techniques: (Array.isArray(record?.techniques) ? record.techniques : [])
      .map((entry) => ({
        techniqueId: normalizeString(entry?.techniqueId),
        name: normalizeString(entry?.name) || undefined,
        expGained: normalizePositiveInteger(entry?.expGained ?? (entry as any)?.expGain),
        expLost: normalizePositiveInteger(entry?.expLost),
        netExp: normalizeSignedInteger(entry?.netExp ?? (normalizePositiveInteger(entry?.expGained ?? (entry as any)?.expGain) - normalizePositiveInteger(entry?.expLost))),
        levelGain: normalizeOptionalInteger(entry?.levelGain),
        levelLoss: normalizeOptionalInteger(entry?.levelLoss),
        currentLevel: normalizeOptionalInteger(entry?.currentLevel),
      }))
      .filter((entry) => entry.techniqueId && (entry.expGained > 0 || entry.expLost > 0 || (entry.levelGain ?? 0) > 0 || (entry.levelLoss ?? 0) > 0)),
    professions: (Array.isArray(record?.professions) ? record.professions : [])
      .map((entry) => ({
        professionType: normalizeString(entry?.professionType) || 'unknown',
        label: normalizeString(entry?.label) || '技艺',
        expGained: normalizePositiveInteger(entry?.expGained ?? (entry as any)?.expGain),
        expLost: normalizePositiveInteger(entry?.expLost),
        netExp: normalizeSignedInteger(entry?.netExp ?? (normalizePositiveInteger(entry?.expGained ?? (entry as any)?.expGain) - normalizePositiveInteger(entry?.expLost))),
        levelGain: normalizeOptionalInteger(entry?.levelGain),
        levelLoss: normalizeOptionalInteger(entry?.levelLoss),
        currentLevel: normalizeOptionalInteger(entry?.currentLevel),
      }))
      .filter((entry) => entry.expGained > 0 || entry.expLost > 0 || (entry.levelGain ?? 0) > 0 || (entry.levelLoss ?? 0) > 0),
  };
}

function normalizeItemDelta(entry: unknown): OfflineGainReportView['items'][number] | null {
  const record = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
  const itemId = normalizeString(record.itemId);
  if (!itemId) {
    return null;
  }
  const amount = normalizeAmountRecord(record);
  const count = normalizePositiveInteger(record.count ?? amount.gained);
  return {
    itemId,
    name: normalizeString(record.name) || undefined,
    gained: amount.gained || count,
    lost: amount.lost,
    net: amount.net || (amount.gained || count) - amount.lost,
  };
}

function normalizeAmountRecord(value: unknown): { gained: number; lost: number; net: number } {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const gained = normalizePositiveInteger(record.gained);
  const lost = normalizePositiveInteger(record.lost);
  return {
    gained,
    lost,
    net: normalizeSignedInteger(record.net ?? gained - lost),
  };
}

function normalizePlayerStatisticTotals(value: unknown): PlayerStatisticTotalsView | null {
  const record = value && typeof value === 'object' ? value as Partial<PlayerStatisticTotalsView> : null;
  if (!record) {
    return null;
  }
  return {
    today: normalizePlayerStatisticPeriodTotal(record.today),
    yesterday: normalizePlayerStatisticPeriodTotal(record.yesterday),
    week: normalizePlayerStatisticPeriodTotal(record.week),
    generatedAt: normalizeInteger(record.generatedAt) || Date.now(),
  };
}

function normalizePlayerStatisticTotalsPatch(value: unknown): PlayerStatisticTotalsPatchView | null {
  const record = value && typeof value === 'object' ? value as Partial<PlayerStatisticTotalsPatchView> : null;
  if (!record) {
    return null;
  }
  const patch: PlayerStatisticTotalsPatchView = {};
  const today = normalizePlayerStatisticPeriodPatch(record.today);
  const yesterday = normalizePlayerStatisticPeriodPatch(record.yesterday);
  const week = normalizePlayerStatisticPeriodPatch(record.week);
  if (today) patch.today = today;
  if (yesterday) patch.yesterday = yesterday;
  if (week) patch.week = week;
  if (record.generatedAt !== undefined) patch.generatedAt = normalizeInteger(record.generatedAt) || Date.now();
  return Object.keys(patch).length > 0 ? patch : null;
}

function normalizePlayerStatisticPeriodPatch(value: unknown): PlayerStatisticPeriodTotalPatchView | null {
  const record = value && typeof value === 'object' ? value as Partial<PlayerStatisticPeriodTotalPatchView> : null;
  if (!record) {
    return null;
  }
  const patch: PlayerStatisticPeriodTotalPatchView = {};
  const spiritStones = normalizeAmountPatch(record.spiritStones);
  const progress = normalizeAmountPatch(record.progress);
  const techniques = normalizeAmountPatch(record.techniques);
  const professions = normalizeAmountPatch(record.professions);
  if (spiritStones) patch.spiritStones = spiritStones;
  if (progress) patch.progress = progress;
  if (techniques) patch.techniques = techniques;
  if (professions) patch.professions = professions;
  return Object.keys(patch).length > 0 ? patch : null;
}

function normalizeAmountPatch(value: unknown): PlayerStatisticAmountPatchView | null {
  const record = value && typeof value === 'object' ? value as PlayerStatisticAmountPatchView : null;
  if (!record) {
    return null;
  }
  const patch: PlayerStatisticAmountPatchView = {};
  if (record.gained !== undefined) patch.gained = normalizePositiveInteger(record.gained);
  if (record.lost !== undefined) patch.lost = normalizePositiveInteger(record.lost);
  if (record.net !== undefined) patch.net = normalizeSignedInteger(record.net);
  return Object.keys(patch).length > 0 ? patch : null;
}

function applyPlayerStatisticTotalsPatch(
  previous: PlayerStatisticTotalsView | null,
  patch: PlayerStatisticTotalsPatchView,
): PlayerStatisticTotalsView {
  const base = normalizePlayerStatisticTotals(previous ?? {}) as PlayerStatisticTotalsView;
  return {
    today: applyPlayerStatisticPeriodPatch(base.today, patch.today),
    yesterday: applyPlayerStatisticPeriodPatch(base.yesterday, patch.yesterday),
    week: applyPlayerStatisticPeriodPatch(base.week, patch.week),
    generatedAt: patch.generatedAt ?? base.generatedAt,
  };
}

function applyPlayerStatisticPeriodPatch(
  previous: PlayerStatisticPeriodTotalView,
  patch: PlayerStatisticPeriodTotalPatchView | null | undefined,
): PlayerStatisticPeriodTotalView {
  if (!patch) {
    return previous;
  }
  const spiritStones = normalizeAmountPatch(patch.spiritStones);
  const progress = normalizeAmountPatch(patch.progress);
  const techniques = normalizeAmountPatch(patch.techniques);
  const professions = normalizeAmountPatch(patch.professions);
  return {
    spiritStones: spiritStones ? { ...previous.spiritStones, ...spiritStones } : previous.spiritStones,
    progress: progress ? { ...previous.progress, ...progress } : previous.progress,
    techniques: techniques ? { ...previous.techniques, ...techniques } : previous.techniques,
    professions: professions ? { ...previous.professions, ...professions } : previous.professions,
  };
}

function normalizePlayerStatisticPeriodTotal(value: unknown): PlayerStatisticPeriodTotalView {
  const record = (value && typeof value === 'object' ? value : {}) as Partial<PlayerStatisticPeriodTotalView>;
  return {
    spiritStones: normalizeAmountRecord(record.spiritStones),
    progress: normalizeAmountRecord(record.progress),
    techniques: normalizeAmountRecord(record.techniques),
    professions: normalizeAmountRecord(record.professions),
  };
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeInteger(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
}

function normalizePositiveInteger(value: unknown): number {
  return normalizeInteger(value);
}

function normalizeSignedInteger(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
}

function normalizeOptionalInteger(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : undefined;
}

function normalizeProgressKind(value: unknown): OfflineGainReportView['progress'][number]['kind'] {
  switch (value) {
    case 'realmExp':
    case 'foundation':
    case 'rootFoundation':
    case 'combatExp':
    case 'bodyTrainingExp':
      return value;
    default:
      return 'foundation';
  }
}

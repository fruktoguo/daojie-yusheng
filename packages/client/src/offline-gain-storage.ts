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
const OFFLINE_GAIN_HISTORY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const OFFLINE_GAIN_HISTORY_MAX_REPORTS = 120;
const OFFLINE_GAIN_HISTORY_TARGET_BYTES = 512 * 1024;

const volatileOfflineGainReportsByPlayerId = new Map<string, OfflineGainReportView[]>();

export interface OfflineGainStoreResult {
  reports: OfflineGainReportView[];
  /** 可安全发送 ACK 的报告。localStorage 失败时至少已进入本页内存缓存。 */
  storedReportIds: string[];
  /** 是否持久写入 localStorage；失败不影响服务端离线收益确认。 */
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
  const now = Date.now();
  if (normalizedReports.length === 0) {
    return { reports: [], storedReportIds: [], storageOk: true };
  }
  const historyReports = filterOfflineGainHistoryReports(normalizedReports, now);
  const displayReports = historyReports;
  const normalizedReportIds = normalizedReports.map((report) => report.id);
  if (historyReports.length === 0) {
    return {
      reports: [],
      storedReportIds: normalizedReportIds,
      storageOk: true,
    };
  }

  const storage = getLocalStorage(windowRef);
  if (!storage) {
    rememberVolatileOfflineGainReports(normalizedPlayerId, displayReports, now);
    return {
      reports: displayReports,
      storedReportIds: normalizedReportIds,
      storageOk: false,
      error: '浏览器本地存储不可用',
    };
  }

  try {
    const existing = readOfflineGainReportsFromBrowser(normalizedPlayerId, windowRef);
    const byId = new Map<string, OfflineGainReportView>();
    for (const report of [...existing, ...historyReports]) {
      if (isOfflineGainHistoryReport(report, now)) {
        byId.set(report.id, report);
      }
    }
    const nextReports = pruneOfflineGainHistoryReports(sortOfflineGainHistoryReports(Array.from(byId.values())));
    rememberVolatileOfflineGainReports(normalizedPlayerId, nextReports, now);
    writeOfflineGainReportsToStorage(storage, normalizedPlayerId, nextReports);
    return {
      reports: displayReports,
      storedReportIds: normalizedReportIds,
      storageOk: true,
    };
  } catch (error) {
    rememberVolatileOfflineGainReports(normalizedPlayerId, displayReports, now);
    return {
      reports: displayReports,
      storedReportIds: normalizedReportIds,
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
  const normalizedPlayerId = normalizeStorageKeySegment(playerId);
  const volatileReports = readVolatileOfflineGainReports(normalizedPlayerId);
  if (!storage) {
    return volatileReports;
  }
  try {
    const raw = storage.getItem(buildStorageKey(normalizedPlayerId));
    const parsed = raw ? JSON.parse(raw) : [];
    const currentReports = normalizeOfflineGainReports(Array.isArray(parsed) ? parsed : []);
    const nextReports = pruneOfflineGainHistoryReports(
      sortOfflineGainHistoryReports(filterOfflineGainHistoryReports([...currentReports, ...volatileReports], Date.now())),
    );
    rememberVolatileOfflineGainReports(normalizedPlayerId, nextReports);
    if (shouldRewriteOfflineGainHistoryStorage(currentReports, nextReports)) {
      tryWriteOfflineGainReportsToStorage(storage, normalizedPlayerId, nextReports);
    }
    return nextReports;
  } catch {
    return volatileReports;
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

function isOfflineGainHistoryReport(report: OfflineGainReportView, now = Date.now()): boolean {
  return isOfflineGainDisplayReport(report) && resolveOfflineGainHistoryTimestamp(report) >= now - OFFLINE_GAIN_HISTORY_MAX_AGE_MS;
}

function filterOfflineGainHistoryReports(reports: readonly OfflineGainReportView[], now = Date.now()): OfflineGainReportView[] {
  return reports.filter((report) => isOfflineGainHistoryReport(report, now));
}

function sortOfflineGainHistoryReports(reports: readonly OfflineGainReportView[]): OfflineGainReportView[] {
  return [...reports].sort((left, right) => right.endedAt - left.endedAt);
}

function pruneOfflineGainHistoryReports(reports: readonly OfflineGainReportView[]): OfflineGainReportView[] {
  const nextReports = sortOfflineGainHistoryReports(reports).slice(0, OFFLINE_GAIN_HISTORY_MAX_REPORTS);
  while (nextReports.length > 1 && JSON.stringify(nextReports).length > OFFLINE_GAIN_HISTORY_TARGET_BYTES) {
    nextReports.pop();
  }
  return nextReports;
}

function rememberVolatileOfflineGainReports(
  playerId: string,
  reports: readonly OfflineGainReportView[],
  now = Date.now(),
): void {
  const normalizedPlayerId = normalizeStorageKeySegment(playerId);
  const merged = new Map<string, OfflineGainReportView>();
  for (const report of [...readVolatileOfflineGainReports(normalizedPlayerId), ...reports]) {
    if (isOfflineGainHistoryReport(report, now)) {
      merged.set(report.id, report);
    }
  }
  const nextReports = pruneOfflineGainHistoryReports(Array.from(merged.values()));
  if (nextReports.length === 0) {
    volatileOfflineGainReportsByPlayerId.delete(normalizedPlayerId);
    return;
  }
  volatileOfflineGainReportsByPlayerId.set(normalizedPlayerId, nextReports);
}

function readVolatileOfflineGainReports(playerId: string): OfflineGainReportView[] {
  return volatileOfflineGainReportsByPlayerId.get(normalizeStorageKeySegment(playerId)) ?? [];
}

function resolveOfflineGainHistoryTimestamp(report: OfflineGainReportView): number {
  return Math.max(
    0,
    Math.trunc(
      Number(report.endedAt)
      || Number(report.generatedAt)
      || Number(report.startedAt)
      || 0,
    ),
  );
}

function shouldRewriteOfflineGainHistoryStorage(
  currentReports: readonly OfflineGainReportView[],
  nextReports: readonly OfflineGainReportView[],
): boolean {
  if (currentReports.length !== nextReports.length) {
    return true;
  }
  return currentReports.some((report, index) => {
    const next = nextReports[index];
    return !next
      || next.id !== report.id
      || next.endedAt !== report.endedAt
      || next.durationMs !== report.durationMs
      || next.scope !== report.scope;
  });
}

function writeOfflineGainReportsToStorage(
  storage: Storage,
  playerId: string,
  reports: readonly OfflineGainReportView[],
): void {
  const nextReports = pruneOfflineGainHistoryReports(reports);
  const key = buildStorageKey(playerId);
  if (nextReports.length === 0) {
    storage.removeItem(key);
    return;
  }
  storage.setItem(key, JSON.stringify(nextReports));
}

function tryWriteOfflineGainReportsToStorage(
  storage: Storage,
  playerId: string,
  reports: readonly OfflineGainReportView[],
): boolean {
  try {
    writeOfflineGainReportsToStorage(storage, playerId, reports);
    return true;
  } catch {
    return false;
  }
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

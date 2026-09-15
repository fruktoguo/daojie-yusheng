/**
 * 玩家运行时离线收益与统计模块函数集合。
 *
 * 从 player-runtime.helpers.ts 按域拆出的离线收益相关函数：
 * 离线收益快照构建、会话记录合并、统计日键/周期/总量、
 * 离线收益报告归一化/合并/差分、经验计算等。
 * 原 helpers 文件 import 回来使用。
 *
 * 纯重构迁移，不改变任何方法签名、公开 API、持久化语义或 tick 语义。
 */
import { createHash } from 'node:crypto';
import {
  getBodyTrainingExpToNext,
  resolvePlayerFacingContentName,
} from '@mud/shared';
import { PlayerProgressionService } from './player-progression.service';
import {
  DEFAULT_CRAFT_EXP_TO_NEXT,
  resolveCraftSkillExpToNextByLevel,
} from '../craft/craft-skill-exp.helpers';
import {
  OFFLINE_GAIN_REPORT_MIN_DURATION_MS,
  resolveOfflineGainReportDurationMs,
} from './offline-gain-duration.helpers';
import { isWalletCacheItemId } from './player-runtime.helpers';

/** 已归一化的离线收益快照标记集合。 */
export const normalizedOfflineGainSnapshots = new WeakSet<object>();

/** 已归一化的离线收益报告部件标记集合。 */
export const normalizedOfflineGainReportPartsRecords = new WeakSet<object>();

/** 通用或专用合并生成的载荷已收敛唯一键，可安全进入行级 copy-on-write 快路径。 */
export const canonicalOfflineGainReportPartsRecords = new WeakSet<object>();

/** 离线收益功法快照索引缓存。 */
export const offlineGainTechniqueIndexBySnapshot = new WeakMap<object[], Map<string, number>>();
export function normalizeOfflineGainString(value) {
 return typeof value === 'string' ? value.trim() : '';
}
export function normalizeOfflineGainCount(value) {
 return Math.max(0, Math.trunc(Number(value ?? 0) || 0));
}
export function normalizeOfflineGainSignedCount(value) {
 const numeric = Number(value ?? 0);
 return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
}
export function buildOfflineGainSessionId(playerId, startedAt) {
 const normalizedPlayerId = normalizeOfflineGainString(playerId) || 'player';
 const normalizedStartedAt = Math.max(0, Math.trunc(Number(startedAt) || Date.now()));
 const digest = createHash('sha1')
  .update(`${normalizedPlayerId}:${normalizedStartedAt}`)
  .digest('base64url')
  .slice(0, 18);
 return `offline:${normalizedStartedAt}:${digest}`;
}
export function buildPlayerStatisticRecordId(playerId, timestamp, scope = 'online') {
 const normalizedPlayerId = normalizeOfflineGainString(playerId) || 'player';
 const normalizedTimestamp = Math.max(0, Math.trunc(Number(timestamp) || Date.now()));
 const normalizedScope = scope === 'offline' ? 'offline' : 'online';
 const digest = createHash('sha1')
  .update(`${normalizedScope}:${normalizedPlayerId}:${normalizedTimestamp}:${Math.random()}`)
  .digest('base64url')
  .slice(0, 18);
 return `stat:${normalizedScope}:${normalizedTimestamp}:${digest}`;
}
export function createEmptyOfflineGainReportParts() {
 return markNormalizedOfflineGainReportParts({
  spiritStones: { gained: 0, lost: 0, net: 0 },
  items: [],
  progress: [],
  techniques: [],
  professions: [],
 });
}
export function shouldBlockOfflineGainSessionRecord(session, now = Date.now()) {
 if (!session || typeof session !== 'object') {
  return false;
 }
 return resolveOfflineGainReportDurationMs(session, now) >= OFFLINE_GAIN_REPORT_MIN_DURATION_MS;
}
export const PROGRESSION_ONLY_STATISTIC_DOMAINS = new Set([
 'progression',
 'attr',
 'technique',
 'body_training',
 'vitals',
 // PlayerProgressionService 的 profession 仅指传法经验，收益职业快照不包含该字段。
 'profession',
 // 修炼选择影响权威偏好与动作态，但不属于收益快照。
 'combat_pref',
]);
export function isProgressionOnlyStatisticResult(result) {
 if (result?.changed !== true) {
  return true;
 }
 const dirtyDomains = Array.isArray(result?.dirtyDomains) ? result.dirtyDomains : [];
 if (dirtyDomains.length === 0) {
  return true;
 }
 return dirtyDomains.every((domain) => PROGRESSION_ONLY_STATISTIC_DOMAINS.has(domain));
}
export function isProgressionAndInventoryOnlyStatisticResult(result) {
 if (result?.changed !== true) {
  return true;
 }
 const dirtyDomains = Array.isArray(result?.dirtyDomains) ? result.dirtyDomains : [];
 if (dirtyDomains.length === 0) {
  return true;
 }
 return dirtyDomains.every((domain) => (
  domain === 'inventory' || PROGRESSION_ONLY_STATISTIC_DOMAINS.has(domain)
 ));
}
export function mergeOfflineGainSessionRecords(persistedSession, memorySession) {
 if (!persistedSession && !memorySession) {
  return null;
 }
 if (!memorySession) {
  return persistedSession;
 }
 if (!persistedSession) {
  return memorySession;
 }
 return {
  ...persistedSession,
  ...memorySession,
  playerId: normalizeOfflineGainString(memorySession.playerId) || normalizeOfflineGainString(persistedSession.playerId),
  sessionId: normalizeOfflineGainString(memorySession.sessionId) || normalizeOfflineGainString(persistedSession.sessionId),
  startedAt: normalizeOfflineGainCount(memorySession.startedAt || persistedSession.startedAt),
  baselinePayload: memorySession.baselinePayload ?? persistedSession.baselinePayload,
  accumulatedPayload: memorySession.accumulatedPayload ?? persistedSession.accumulatedPayload,
  accumulatedDurationMs: normalizeOfflineGainCount(memorySession.accumulatedDurationMs ?? persistedSession.accumulatedDurationMs),
 };
}
export function accumulateOfflineGainSessionDelta(session, beforeSnapshot, afterSnapshot, resolveProfessionExpToNext = null) {
 if (!session) {
  return;
 }
 const delta = buildOfflineGainDeltaParts(
  normalizeOfflineGainSnapshot(beforeSnapshot),
  normalizeOfflineGainSnapshot(afterSnapshot),
  resolveProfessionExpToNext,
 );
 session.accumulatedPayload = mergeOfflineGainReportPartsBySum(
  normalizeOfflineGainReportParts(session.accumulatedPayload),
  delta,
 );
}
export function buildOfflineGainDeltaParts(before, after, resolveProfessionExpToNext = null) {
 const inventoryDelta = buildOfflineGainInventoryDeltaParts(before.inventoryItems, after.inventoryItems);
 return {
  ...inventoryDelta,
  progress: diffOfflineGainProgress(before, after),
  techniques: diffOfflineGainTechniques(before.techniques, after.techniques),
  professions: diffOfflineGainProfessions(before.professions, after.professions, resolveProfessionExpToNext),
 };
}
export function buildOfflineGainInventoryOnlyMutation(
 player,
 beforeSnapshot,
 contentTemplateRepository = null,
 inventoryItemDeltaHint = undefined,
) {
 const before = normalizeOfflineGainSnapshot(beforeSnapshot);
 const hinted = buildHintedOfflineGainInventoryOnlyMutation(
  before,
  inventoryItemDeltaHint,
  contentTemplateRepository,
 );
 if (hinted) {
  return hinted;
 }
 const afterSnapshot = markNormalizedOfflineGainSnapshot({
  snapshotAt: Date.now(),
  playerId: normalizeOfflineGainString(player?.playerId),
  inventoryItems: buildOfflineGainInventorySnapshot([
   ...(Array.isArray(player?.inventory?.items) ? player.inventory.items : []),
   ...(Array.isArray(player?.inventory?.lockedItems) ? player.inventory.lockedItems : []),
  ], contentTemplateRepository),
  realm: before.realm,
  foundation: before.foundation,
  rootFoundation: before.rootFoundation,
  combatExp: before.combatExp,
  bodyTraining: before.bodyTraining,
  techniques: before.techniques,
  professions: before.professions,
 });
 return {
  afterSnapshot,
  delta: {
   ...buildOfflineGainInventoryDeltaParts(before.inventoryItems, afterSnapshot.inventoryItems),
   progress: [],
   techniques: [],
   professions: [],
  },
 };
}

/** 同一同步入包调用栈已给出实际数量变化时，只更新对应物品统计槽位。 */
export function buildHintedOfflineGainInventoryOnlyMutation(before, hint, contentTemplateRepository = null) {
 const itemId = normalizeOfflineGainString(hint?.itemId);
 const countDelta = normalizeOfflineGainSignedCount(hint?.countDelta);
 if (!itemId || countDelta === 0 || !Array.isArray(before?.inventoryItems)) {
  return null;
 }
 const inventoryItems = before.inventoryItems;
 let itemIndex = -1;
 for (let index = 0; index < inventoryItems.length; index += 1) {
  if (inventoryItems[index]?.itemId === itemId) {
   itemIndex = index;
   break;
  }
 }
 const afterInventoryItems = inventoryItems.slice();
 let itemName;
 if (itemIndex >= 0) {
  const previous = inventoryItems[itemIndex];
  itemName = previous.name;
  const nextCount = normalizeOfflineGainCount(previous.count) + countDelta;
  if (nextCount < 0) {
   return null;
  }
  if (nextCount === 0) {
   afterInventoryItems.splice(itemIndex, 1);
  }
  else {
   afterInventoryItems[itemIndex] = {
    ...previous,
    count: nextCount,
   };
  }
 }
 else {
  if (countDelta < 0) {
   return null;
  }
  itemName = resolvePlayerFacingContentName(
   itemId,
   '未知物品',
   hint?.name,
   typeof contentTemplateRepository?.getItemName === 'function'
    ? contentTemplateRepository.getItemName(itemId)
    : null,
  );
  if (countDelta > 0) {
   afterInventoryItems.push({ itemId, name: itemName, count: countDelta });
   afterInventoryItems.sort((left, right) => String(left.name ?? left.itemId).localeCompare(String(right.name ?? right.itemId), 'zh-Hans-CN'));
  }
 }
 const afterSnapshot = markNormalizedOfflineGainSnapshot({
  snapshotAt: Date.now(),
  playerId: before.playerId,
  inventoryItems: afterInventoryItems,
  realm: before.realm,
  foundation: before.foundation,
  rootFoundation: before.rootFoundation,
  combatExp: before.combatExp,
  bodyTraining: before.bodyTraining,
  techniques: before.techniques,
  professions: before.professions,
 });
 const gained = Math.max(0, countDelta);
 const lost = Math.max(0, -countDelta);
 const itemDelta = [{
  itemId,
  name: normalizeOfflineGainString(itemName) || undefined,
  gained,
  lost,
  net: countDelta,
  count: gained,
 }];
 return {
  afterSnapshot,
  delta: {
   spiritStones: isWalletCacheItemId(itemId)
    ? { gained, lost, net: countDelta }
    : { gained: 0, lost: 0, net: 0 },
   items: isWalletCacheItemId(itemId) ? [] : itemDelta,
   progress: [],
   techniques: [],
   professions: [],
  },
 };
}
export function buildOfflineGainInventoryDeltaParts(beforeItems, afterItems) {
 const itemDeltas = diffOfflineGainItems(beforeItems, afterItems);
 return {
  spiritStones: itemDeltas
   .filter((entry) => isWalletCacheItemId(entry.itemId))
   .reduce((total, entry) => ({
    gained: total.gained + normalizeOfflineGainCount(entry.gained ?? entry.count),
    lost: total.lost + normalizeOfflineGainCount(entry.lost),
    net: total.net + normalizeOfflineGainSignedCount(entry.net ?? ((entry.gained ?? entry.count ?? 0) - (entry.lost ?? 0))),
   }), { gained: 0, lost: 0, net: 0 }),
  items: itemDeltas.filter((entry) => !isWalletCacheItemId(entry.itemId)),
 };
}
export function buildOfflineGainProgressionOnlyMutation(player, beforeSnapshot, statisticTechniqueChangedIds = undefined) {
 const before = normalizeOfflineGainSnapshot(beforeSnapshot);
 const techniqueResult = buildOfflineGainProgressionTechniqueSnapshotAndDelta(
  player?.techniques?.techniques,
  before.techniques,
  statisticTechniqueChangedIds,
 );
 const afterSnapshot = buildOfflineGainProgressionOnlySnapshot(player, before, techniqueResult.snapshot);
 return {
  afterSnapshot,
  delta: markNormalizedOfflineGainReportParts({
   spiritStones: { gained: 0, lost: 0, net: 0 },
   items: [],
   progress: diffOfflineGainProgress(before, afterSnapshot),
   techniques: techniqueResult.delta,
   professions: [],
  }),
 };
}
export function buildOfflineGainProgressionAndProfessionMutation(player, beforeSnapshot, playerProgressionService = null) {
 const before = normalizeOfflineGainSnapshot(beforeSnapshot);
 const resolveProfessionExpToNext = (level) => resolveCraftSkillExpToNextByLevel(playerProgressionService, level);
 const afterSnapshot = buildOfflineGainProgressionOnlySnapshot(
  player,
  before,
  before.techniques,
  buildOfflineGainProfessionSnapshots(player, resolveProfessionExpToNext),
 );
 return {
  afterSnapshot,
  delta: markNormalizedOfflineGainReportParts({
   spiritStones: { gained: 0, lost: 0, net: 0 },
   items: [],
   progress: diffOfflineGainProgress(before, afterSnapshot),
   techniques: [],
   professions: diffOfflineGainProfessions(before.professions, afterSnapshot.professions, resolveProfessionExpToNext),
  }),
 };
}
export function buildOfflineGainProgressionAndInventoryMutation(
 player,
 beforeSnapshot,
 contentTemplateRepository = null,
 statisticTechniqueChangedIds = undefined,
) {
 const inventoryMutation = buildOfflineGainInventoryOnlyMutation(
  player,
  beforeSnapshot,
  contentTemplateRepository,
 );
 const progressionMutation = buildOfflineGainProgressionOnlyMutation(
  player,
  inventoryMutation.afterSnapshot,
  statisticTechniqueChangedIds,
 );
 return {
  afterSnapshot: progressionMutation.afterSnapshot,
  delta: {
   spiritStones: inventoryMutation.delta.spiritStones,
   items: inventoryMutation.delta.items,
   progress: progressionMutation.delta.progress,
   techniques: progressionMutation.delta.techniques,
   professions: [],
  },
 };
}
export function buildOfflineGainProgressionOnlySnapshot(
 player,
 previousSnapshot,
 techniqueSnapshot = undefined,
 professionSnapshot = undefined,
) {
 return markNormalizedOfflineGainSnapshot({
  snapshotAt: Date.now(),
  playerId: normalizeOfflineGainString(player?.playerId),
  inventoryItems: previousSnapshot.inventoryItems,
  realm: {
   realmLv: normalizeOfflineGainCount(player?.realm?.realmLv),
   level: normalizeOfflineGainCount(player?.realm?.realmLv),
   progress: normalizeOfflineGainCount(player?.realm?.progress),
   exp: normalizeOfflineGainCount(player?.realm?.progress),
   progressToNext: normalizeOfflineGainCount(player?.realm?.progressToNext),
   expToNext: normalizeOfflineGainCount(player?.realm?.progressToNext),
  },
  foundation: normalizeOfflineGainCount(player?.foundation),
  rootFoundation: normalizeOfflineGainCount(player?.rootFoundation),
  combatExp: normalizeOfflineGainCount(player?.combatExp),
  bodyTraining: buildOfflineGainExpStateSnapshot(player?.bodyTraining, {
   minLevel: 0,
   resolveExpToNext: (level) => typeof getBodyTrainingExpToNext === 'function'
    ? getBodyTrainingExpToNext(level)
    : normalizeOfflineGainCount(player?.bodyTraining?.expToNext),
  }),
  techniques: Array.isArray(techniqueSnapshot)
   ? techniqueSnapshot
   : buildOfflineGainProgressionTechniqueSnapshot(player?.techniques?.techniques, previousSnapshot.techniques),
  professions: Array.isArray(professionSnapshot) ? professionSnapshot : previousSnapshot.professions,
 });
}
export function hasOfflineGainReportParts(parts) {
 const normalized = normalizeOfflineGainReportParts(parts);
 return normalized.spiritStones.gained > 0
  || normalized.spiritStones.lost > 0
  || normalized.items.length > 0
  || normalized.progress.length > 0
  || normalized.techniques.length > 0
  || normalized.professions.length > 0;
}
export function hasOfflineGainReportPartsFast(parts) {
 if (!parts || typeof parts !== 'object') {
  return false;
 }
 const spiritStones = parts.spiritStones;
 return normalizeOfflineGainCount(spiritStones?.gained) > 0
  || normalizeOfflineGainCount(spiritStones?.lost) > 0
  || (Array.isArray(parts.items) && parts.items.length > 0)
  || (Array.isArray(parts.progress) && parts.progress.length > 0)
  || (Array.isArray(parts.techniques) && parts.techniques.length > 0)
  || (Array.isArray(parts.professions) && parts.professions.length > 0);
}
export function buildEmptyPlayerStatisticTotals(now = Date.now()) {
 const generatedAt = Math.max(0, Math.trunc(Number(now) || Date.now()));
 return {
  today: createEmptyPlayerStatisticPeriodTotal(),
  yesterday: createEmptyPlayerStatisticPeriodTotal(),
  week: createEmptyPlayerStatisticPeriodTotal(),
  generatedAt,
 };
}
export function createEmptyPlayerStatisticPeriodTotal() {
 return {
  spiritStones: createEmptyPlayerStatisticAmount(),
  progress: createEmptyPlayerStatisticAmount(),
  techniques: createEmptyPlayerStatisticAmount(),
  professions: createEmptyPlayerStatisticAmount(),
 };
}
export function createEmptyPlayerStatisticAmount() {
 return { gained: 0, lost: 0, net: 0 };
}
export function buildPlayerStatisticRelevantDayKeys(now = Date.now()) {
 const keys = buildPlayerStatisticPeriodDayKeys(now);
 return Array.from(new Set([keys.today, keys.yesterday, ...keys.week]));
}
export function buildPlayerStatisticPeriodDayKeys(now = Date.now()) {
 const dayStart = buildPlayerStatisticLocalDayStart(now);
 const yesterday = new Date(dayStart.getTime());
 yesterday.setDate(dayStart.getDate() - 1);
 const weekday = dayStart.getDay();
 const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
 const monday = new Date(dayStart.getTime());
 monday.setDate(dayStart.getDate() + mondayOffset);
 const week = [];
 for (let index = 0; index < 7; index += 1) {
  const day = new Date(monday.getTime());
  day.setDate(monday.getDate() + index);
  week.push(buildPlayerStatisticLocalDayKey(day.getTime()));
 }
 return {
  today: buildPlayerStatisticLocalDayKey(dayStart.getTime()),
  yesterday: buildPlayerStatisticLocalDayKey(yesterday.getTime()),
  week,
 };
}
export function buildPlayerStatisticLocalDayStart(timestamp = Date.now()) {
 const normalized = Math.max(0, Math.trunc(Number(timestamp) || Date.now()));
 const date = new Date(normalized);
 return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
export const PLAYER_STATISTIC_DAY_KEY_CACHE = {
 startMs: -1,
 endMs: -1,
 key: '',
};
export function buildPlayerStatisticLocalDayKey(timestamp = Date.now()) {
 const normalized = Math.max(0, Math.trunc(Number(timestamp) || Date.now()));
 if (normalized >= PLAYER_STATISTIC_DAY_KEY_CACHE.startMs && normalized < PLAYER_STATISTIC_DAY_KEY_CACHE.endMs) {
  return PLAYER_STATISTIC_DAY_KEY_CACHE.key;
 }
 const dayStart = buildPlayerStatisticLocalDayStart(timestamp);
 const year = dayStart.getFullYear();
 const month = String(dayStart.getMonth() + 1).padStart(2, '0');
 const day = String(dayStart.getDate()).padStart(2, '0');
 const nextDayStart = new Date(dayStart.getTime());
 nextDayStart.setDate(dayStart.getDate() + 1);
 const key = `${year}-${month}-${day}`;
 PLAYER_STATISTIC_DAY_KEY_CACHE.startMs = dayStart.getTime();
 PLAYER_STATISTIC_DAY_KEY_CACHE.endMs = nextDayStart.getTime();
 PLAYER_STATISTIC_DAY_KEY_CACHE.key = key;
 return key;
}
export function buildPlayerStatisticTotalsView(persistedByDay, runtimeByDay, now = Date.now()) {
 const keys = buildPlayerStatisticPeriodDayKeys(now);
 return {
  today: readPlayerStatisticDayTotal(persistedByDay, runtimeByDay, keys.today),
  yesterday: readPlayerStatisticDayTotal(persistedByDay, runtimeByDay, keys.yesterday),
  week: keys.week.reduce(
   (total, dayKey) => mergePlayerStatisticPeriodTotals(total, readPlayerStatisticDayTotal(persistedByDay, runtimeByDay, dayKey)),
   createEmptyPlayerStatisticPeriodTotal(),
  ),
  generatedAt: Math.max(0, Math.trunc(Number(now) || Date.now())),
 };
}
export function buildPlayerStatisticTotalsPatch(previous, current) {
 const patch: any = { generatedAt: Math.max(0, Math.trunc(Number(current?.generatedAt) || Date.now())) };
 const today = buildPlayerStatisticPeriodPatch(previous?.today, current?.today);
 const yesterday = buildPlayerStatisticPeriodPatch(previous?.yesterday, current?.yesterday);
 const week = buildPlayerStatisticPeriodPatch(previous?.week, current?.week);
 if (today) {
  patch.today = today;
 }
 if (yesterday) {
  patch.yesterday = yesterday;
 }
 if (week) {
  patch.week = week;
 }
 return patch;
}
export function buildPlayerStatisticPeriodPatch(previous, current) {
 const patch: any = {};
 const hasPrevious = previous !== null && previous !== undefined;
 const normalizedPrevious = normalizePlayerStatisticPeriodTotal(previous);
 const normalizedCurrent = normalizePlayerStatisticPeriodTotal(current);
 if (!isSamePlayerStatisticAmount(normalizedPrevious.spiritStones, normalizedCurrent.spiritStones)
  && (hasPrevious || hasPlayerStatisticAmount(normalizedCurrent.spiritStones))) {
  patch.spiritStones = normalizedCurrent.spiritStones;
 }
 if (!isSamePlayerStatisticAmount(normalizedPrevious.progress, normalizedCurrent.progress)
  && (hasPrevious || hasPlayerStatisticAmount(normalizedCurrent.progress))) {
  patch.progress = normalizedCurrent.progress;
 }
 if (!isSamePlayerStatisticAmount(normalizedPrevious.techniques, normalizedCurrent.techniques)
  && (hasPrevious || hasPlayerStatisticAmount(normalizedCurrent.techniques))) {
  patch.techniques = normalizedCurrent.techniques;
 }
 if (!isSamePlayerStatisticAmount(normalizedPrevious.professions, normalizedCurrent.professions)
  && (hasPrevious || hasPlayerStatisticAmount(normalizedCurrent.professions))) {
  patch.professions = normalizedCurrent.professions;
 }
 return Object.keys(patch).length > 0 ? patch : null;
}
export function isSamePlayerStatisticAmount(left, right) {
 return normalizeOfflineGainCount(left?.gained) === normalizeOfflineGainCount(right?.gained)
  && normalizeOfflineGainCount(left?.lost) === normalizeOfflineGainCount(right?.lost)
  && normalizeOfflineGainSignedCount(left?.net) === normalizeOfflineGainSignedCount(right?.net);
}
export function hasPlayerStatisticAmount(value) {
 return normalizeOfflineGainCount(value?.gained) > 0 || normalizeOfflineGainCount(value?.lost) > 0;
}
export function hasPlayerStatisticTotalsView(totals) {
 return hasPlayerStatisticPeriodTotal(totals?.today)
  || hasPlayerStatisticPeriodTotal(totals?.yesterday)
  || hasPlayerStatisticPeriodTotal(totals?.week);
}
export function hasPlayerStatisticTotalsPatch(patch) {
 return Boolean(patch?.today || patch?.yesterday || patch?.week);
}
export function readPlayerStatisticDayTotal(persistedByDay, runtimeByDay, dayKey) {
 return mergePlayerStatisticPeriodTotals(
  persistedByDay instanceof Map ? persistedByDay.get(dayKey) : null,
  runtimeByDay instanceof Map ? runtimeByDay.get(dayKey) : null,
 );
}
export function summarizePlayerStatisticPeriodTotal(parts) {
 const normalized = normalizeOfflineGainReportParts(parts);
 const total = createEmptyPlayerStatisticPeriodTotal();
 total.spiritStones = normalizePlayerStatisticAmountRecord(normalized.spiritStones);
 for (const entry of normalized.progress) {
  const target = entry.kind === 'bodyTrainingExp' ? 'techniques' : 'progress';
  total[target] = mergePlayerStatisticAmount(total[target], {
   gained: entry.gained ?? entry.amount,
   lost: entry.lost,
  });
 }
 for (const entry of normalized.techniques) {
  total.techniques = mergePlayerStatisticAmount(total.techniques, {
   gained: entry.expGained ?? entry.expGain,
   lost: entry.expLost,
  });
 }
 for (const entry of normalized.professions) {
  total.professions = mergePlayerStatisticAmount(total.professions, {
   gained: entry.expGained ?? entry.expGain,
   lost: entry.expLost,
  });
 }
 return total;
}
export function hasPlayerStatisticPeriodTotal(total) {
 const normalized = normalizePlayerStatisticPeriodTotal(total);
 return hasNormalizedPlayerStatisticPeriodTotal(normalized);
}
export function hasNormalizedPlayerStatisticPeriodTotal(normalized) {
 return normalized.spiritStones.gained > 0
  || normalized.spiritStones.lost > 0
  || normalized.progress.gained > 0
  || normalized.progress.lost > 0
  || normalized.techniques.gained > 0
  || normalized.techniques.lost > 0
  || normalized.professions.gained > 0
  || normalized.professions.lost > 0;
}
/** 仅接收本模块刚生成的规范化统计量，供击杀热路径跳过重复防御性复制。 */
export function mergeNormalizedPlayerStatisticDayTotalMap(target, playerId, dayKey, delta) {
 const normalizedPlayerId = normalizeOfflineGainString(playerId);
 const normalizedDayKey = normalizeOfflineGainString(dayKey);
 if (!normalizedPlayerId || !normalizedDayKey || !hasNormalizedPlayerStatisticPeriodTotal(delta)) {
  return;
 }
 const byDay = target.get(normalizedPlayerId) ?? new Map();
 byDay.set(
  normalizedDayKey,
  mergeNormalizedPlayerStatisticPeriodTotals(byDay.get(normalizedDayKey), delta),
 );
 target.set(normalizedPlayerId, byDay);
}
export function mergePlayerStatisticDayTotalMap(target, playerId, dayKey, delta) {
 const normalizedPlayerId = normalizeOfflineGainString(playerId);
 const normalizedDayKey = normalizeOfflineGainString(dayKey);
 const normalizedDelta = normalizePlayerStatisticPeriodTotal(delta);
 if (!normalizedPlayerId || !normalizedDayKey || !hasPlayerStatisticPeriodTotal(normalizedDelta)) {
  return;
 }
 const byDay = target.get(normalizedPlayerId) ?? new Map();
 byDay.set(normalizedDayKey, mergePlayerStatisticPeriodTotals(byDay.get(normalizedDayKey), normalizedDelta));
 target.set(normalizedPlayerId, byDay);
}
export function subtractPlayerStatisticDayTotalMap(target, playerId, dayKey, delta) {
 const normalizedPlayerId = normalizeOfflineGainString(playerId);
 const normalizedDayKey = normalizeOfflineGainString(dayKey);
 if (!normalizedPlayerId || !normalizedDayKey) {
  return;
 }
 const byDay = target.get(normalizedPlayerId);
 if (!(byDay instanceof Map)) {
  return;
 }
 const next = mergePlayerStatisticPeriodTotals(byDay.get(normalizedDayKey), delta, -1);
 if (hasPlayerStatisticPeriodTotal(next)) {
  byDay.set(normalizedDayKey, next);
 } else {
  byDay.delete(normalizedDayKey);
 }
 if (byDay.size > 0) {
  target.set(normalizedPlayerId, byDay);
 } else {
  target.delete(normalizedPlayerId);
 }
}
export function normalizePlayerStatisticPeriodTotal(value) {
 const record = value && typeof value === 'object' ? value : {};
 return {
  spiritStones: normalizePlayerStatisticAmountRecord(record.spiritStones),
  progress: normalizePlayerStatisticAmountRecord(record.progress),
  techniques: normalizePlayerStatisticAmountRecord(record.techniques),
  professions: normalizePlayerStatisticAmountRecord(record.professions),
 };
}
export function mergePlayerStatisticPeriodTotals(leftValue, rightValue, sign = 1) {
 const left = normalizePlayerStatisticPeriodTotal(leftValue);
 const right = normalizePlayerStatisticPeriodTotal(rightValue);
 return {
  spiritStones: mergePlayerStatisticAmount(left.spiritStones, right.spiritStones, sign),
  progress: mergePlayerStatisticAmount(left.progress, right.progress, sign),
  techniques: mergePlayerStatisticAmount(left.techniques, right.techniques, sign),
  professions: mergePlayerStatisticAmount(left.professions, right.professions, sign),
 };
}
export function mergeNormalizedPlayerStatisticPeriodTotals(left, right, sign = 1) {
 return {
  spiritStones: mergeNormalizedPlayerStatisticAmount(left?.spiritStones, right.spiritStones, sign),
  progress: mergeNormalizedPlayerStatisticAmount(left?.progress, right.progress, sign),
  techniques: mergeNormalizedPlayerStatisticAmount(left?.techniques, right.techniques, sign),
  professions: mergeNormalizedPlayerStatisticAmount(left?.professions, right.professions, sign),
 };
}
export function normalizePlayerStatisticAmountRecord(value) {
 const record = value && typeof value === 'object' ? value : {};
 const gained = normalizeOfflineGainCount(record.gained ?? record.amount ?? record.expGained ?? record.expGain ?? record.count);
 const lost = normalizeOfflineGainCount(record.lost ?? record.expLost);
 return {
  gained,
  lost,
  net: gained - lost,
 };
}
export function mergePlayerStatisticAmount(leftValue, rightValue, sign = 1) {
 const left = normalizePlayerStatisticAmountRecord(leftValue);
 const right = normalizePlayerStatisticAmountRecord(rightValue);
 const gained = Math.max(0, left.gained + (sign * right.gained));
 const lost = Math.max(0, left.lost + (sign * right.lost));
 return {
  gained,
  lost,
  net: gained - lost,
 };
}
export function mergeNormalizedPlayerStatisticAmount(left, right, sign = 1) {
 const gained = Math.max(0, (left?.gained ?? 0) + (sign * right.gained));
 const lost = Math.max(0, (left?.lost ?? 0) + (sign * right.lost));
 return {
  gained,
  lost,
  net: gained - lost,
 };
}
export function buildPlayerStatisticRecordFromParts(player, session, endedAt, parts, scope = 'offline') {
 const normalizedParts = normalizeOfflineGainReportParts(parts);
 const startedAt = normalizeOfflineGainCount(session?.startedAt ?? session?.baselinePayload?.snapshotAt ?? endedAt);
 const normalizedEndedAt = Math.max(startedAt, normalizeOfflineGainCount(endedAt));
 const durationMs = resolveOfflineGainReportDurationMs({
  startedAt,
  accumulatedDurationMs: session?.accumulatedDurationMs,
 }, normalizedEndedAt);
 const reportEndedAt = resolveOfflineGainReportEndedAt(startedAt, durationMs, normalizedEndedAt);
 const normalizedScope = scope === 'online' ? 'online' : 'offline';
 return {
  id: normalizeOfflineGainString(session?.sessionId) || buildPlayerStatisticRecordId(player?.playerId, normalizedEndedAt, normalizedScope),
  playerId: normalizeOfflineGainString(player?.playerId) || undefined,
  scope: normalizedScope,
  source: resolvePlayerStatisticSource(normalizedParts, normalizedScope),
  startedAt,
  endedAt: reportEndedAt,
  durationMs,
  generatedAt: Date.now(),
  spiritStones: normalizedParts.spiritStones,
  items: normalizedParts.items,
  progress: normalizedParts.progress,
  techniques: normalizedParts.techniques,
  professions: normalizedParts.professions,
 };
}
export function mergePendingOfflineGainReportList(playerId, reports) {
 const normalizedPlayerId = normalizeOfflineGainString(playerId);
 const reportById = new Map();
 for (const report of Array.isArray(reports) ? reports : []) {
  const reportId = normalizeOfflineGainString(report?.id);
  if (reportId) {
   // 调用方均按“已持久化记录在前、当前权威记录在后”传入，同 ID 保留最终版本。
   reportById.set(reportId, report);
  }
 }
 const normalizedReports = Array.from(reportById.values());
 if (!normalizedPlayerId || normalizedReports.length <= 1) {
  return normalizedReports;
 }
 const offlineReports = normalizedReports.filter((report) => report?.scope !== 'online');
 const onlineReports = normalizedReports.filter((report) => report?.scope === 'online');
 const mergedOfflineReports = offlineReports.length > 1
  ? [mergePendingOfflineGainReport(normalizedPlayerId, offlineReports)]
  : offlineReports;
 return [...mergedOfflineReports, ...onlineReports]
  .filter((report) => normalizeOfflineGainString(report?.id).length > 0)
  .sort((left, right) => normalizeOfflineGainCount(left?.startedAt) - normalizeOfflineGainCount(right?.startedAt));
}
export function mergePendingOfflineGainReport(playerId, reports, nextReport = null) {
 const normalizedPlayerId = normalizeOfflineGainString(playerId);
 const normalizedReports = [...(Array.isArray(reports) ? reports : []), nextReport]
  .filter((report) => normalizeOfflineGainString(report?.id).length > 0)
  .sort((left, right) => normalizeOfflineGainCount(left?.startedAt) - normalizeOfflineGainCount(right?.startedAt));
 const first = normalizedReports[0];
 if (!first) {
  return nextReport;
 }
 if (normalizedReports.length === 1) {
  return {
   ...first,
   playerId: normalizeOfflineGainString(first.playerId) || normalizedPlayerId || undefined,
  };
 }
 const firstOfflineReport = normalizedReports.find((report) => report?.scope !== 'online');
 const idSource = firstOfflineReport ?? first;
 const mergedScope = firstOfflineReport ? 'offline' : 'online';
 const mergedParts = normalizedReports.reduce((total, report) => mergeOfflineGainReportPartsBySum(
  total,
  normalizeOfflineGainReportParts(report),
 ), createEmptyOfflineGainReportParts());
 const durationMs = normalizedReports.reduce((total, report) => total + normalizeOfflineGainCount(report?.durationMs), 0);
 const startedAt = normalizeOfflineGainCount(first.startedAt);
 const endedAt = normalizedReports.reduce(
  (latestEndedAt, report) => Math.max(latestEndedAt, resolveOfflineGainReportEndBoundary(report)),
  startedAt,
 );
 return {
  ...first,
  id: normalizeOfflineGainString(idSource.id),
  playerId: normalizedPlayerId || normalizeOfflineGainString(first.playerId) || undefined,
  scope: mergedScope,
  source: resolvePlayerStatisticSource(mergedParts, mergedScope),
  startedAt,
  endedAt,
  durationMs,
  generatedAt: Date.now(),
  spiritStones: mergedParts.spiritStones,
  items: mergedParts.items,
  progress: mergedParts.progress,
  techniques: mergedParts.techniques,
  professions: mergedParts.professions,
 };
}
export function resolveOfflineGainReportEndedAt(startedAt, durationMs, endedAt) {
 const normalizedStartedAt = normalizeOfflineGainCount(startedAt);
 const normalizedDurationMs = normalizeOfflineGainCount(durationMs);
 const normalizedEndedAt = Math.max(normalizedStartedAt, normalizeOfflineGainCount(endedAt));
 if (normalizedDurationMs <= 0) {
  return normalizedEndedAt;
 }
 return Math.min(normalizedEndedAt, normalizedStartedAt + normalizedDurationMs);
}
export function resolveOfflineGainReportEndBoundary(report) {
 const startedAt = normalizeOfflineGainCount(report?.startedAt);
 const durationMs = normalizeOfflineGainCount(report?.durationMs);
 const endedAt = normalizeOfflineGainCount(report?.endedAt);
 const fallbackEndedAt = startedAt + durationMs;
 return resolveOfflineGainReportEndedAt(startedAt, durationMs, endedAt > 0 ? endedAt : fallbackEndedAt);
}
export function resolvePlayerStatisticSource(parts, scope) {
 if (scope === 'offline') {
  return 'cultivation';
 }
 const hasGrowth = parts.progress.length > 0 || parts.techniques.length > 0 || parts.professions.length > 0;
 const hasAssets = parts.items.length > 0 || parts.spiritStones.gained > 0 || parts.spiritStones.lost > 0;
 if (hasGrowth && !hasAssets) {
  return 'cultivation';
 }
 if (hasAssets && !hasGrowth) {
  return 'system';
 }
 return 'system';
}
export function normalizeOfflineGainReportParts(value) {
 if (value && typeof value === 'object' && normalizedOfflineGainReportPartsRecords.has(value)) {
  return value;
 }
 const record = value && typeof value === 'object' ? value : {};
 return markNormalizedOfflineGainReportParts({
  spiritStones: normalizeOfflineGainAmountRecord(record.spiritStones),
  items: normalizeOfflineGainItemGainList(record.items),
  progress: normalizeOfflineGainProgressGainList(record.progress),
  techniques: normalizeOfflineGainTechniqueGainList(record.techniques),
  professions: normalizeOfflineGainProfessionGainList(record.professions),
 });
}
export function normalizeOfflineGainAmountRecord(value) {
 const record = value && typeof value === 'object' ? value : {};
 const gained = normalizeOfflineGainCount(record.gained ?? record.amount ?? record.expGained ?? record.expGain ?? record.count);
 const lost = normalizeOfflineGainCount(record.lost ?? record.expLost);
 return {
  gained,
  lost,
  net: normalizeOfflineGainSignedCount(record.net ?? record.netExp ?? gained - lost),
 };
}
export function normalizeOfflineGainItemGainList(value) {
 return (Array.isArray(value) ? value : [])
  .map((entry) => {
   const amount = normalizeOfflineGainAmountRecord(entry);
   return {
    itemId: normalizeOfflineGainString(entry?.itemId),
    name: normalizeOfflineGainString(entry?.name) || undefined,
    gained: amount.gained,
    lost: amount.lost,
    net: amount.net,
    count: amount.gained,
   };
  })
  .filter((entry) => entry.itemId && (entry.gained > 0 || entry.lost > 0));
}
export function normalizeOfflineGainProgressGainList(value) {
 return (Array.isArray(value) ? value : [])
  .map((entry) => {
   const amount = normalizeOfflineGainAmountRecord(entry);
   return {
    kind: normalizeOfflineGainProgressKind(entry?.kind),
    label: normalizeOfflineGainString(entry?.label) || '收益',
    gained: amount.gained,
    lost: amount.lost,
    net: amount.net,
    amount: amount.gained,
    levelGain: normalizeOfflineGainOptionalCount(entry?.levelGain),
    levelLoss: normalizeOfflineGainOptionalCount(entry?.levelLoss),
    currentLevel: normalizeOfflineGainOptionalCount(entry?.currentLevel),
   };
  })
  .filter((entry) => entry.gained > 0 || entry.lost > 0 || (entry.levelGain ?? 0) > 0 || (entry.levelLoss ?? 0) > 0);
}
export function normalizeOfflineGainTechniqueGainList(value) {
 return (Array.isArray(value) ? value : [])
  .map((entry) => {
   const amount = normalizeOfflineGainAmountRecord({
    expGained: entry?.expGained ?? entry?.expGain,
    expLost: entry?.expLost,
    netExp: entry?.netExp,
   });
   return {
    techniqueId: normalizeOfflineGainString(entry?.techniqueId),
    name: normalizeOfflineGainString(entry?.name) || undefined,
    expGained: amount.gained,
    expLost: amount.lost,
    netExp: amount.net,
    expGain: amount.gained,
    levelGain: normalizeOfflineGainOptionalCount(entry?.levelGain),
    levelLoss: normalizeOfflineGainOptionalCount(entry?.levelLoss),
    currentLevel: normalizeOfflineGainOptionalCount(entry?.currentLevel),
   };
  })
  .filter((entry) => entry.techniqueId && (entry.expGained > 0 || entry.expLost > 0 || (entry.levelGain ?? 0) > 0 || (entry.levelLoss ?? 0) > 0));
}
export function normalizeOfflineGainProfessionGainList(value) {
 return (Array.isArray(value) ? value : [])
  .map((entry) => {
   const amount = normalizeOfflineGainAmountRecord({
    expGained: entry?.expGained ?? entry?.expGain,
    expLost: entry?.expLost,
    netExp: entry?.netExp,
   });
   return {
    professionType: normalizeOfflineGainString(entry?.professionType) || 'unknown',
    label: normalizeOfflineGainString(entry?.label) || '技艺',
    expGained: amount.gained,
    expLost: amount.lost,
    netExp: amount.net,
    expGain: amount.gained,
    levelGain: normalizeOfflineGainOptionalCount(entry?.levelGain),
    levelLoss: normalizeOfflineGainOptionalCount(entry?.levelLoss),
    currentLevel: normalizeOfflineGainOptionalCount(entry?.currentLevel),
   };
  })
  .filter((entry) => entry.expGained > 0 || entry.expLost > 0 || (entry.levelGain ?? 0) > 0 || (entry.levelLoss ?? 0) > 0);
}
export function normalizeOfflineGainProgressKind(value) {
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
export function normalizeOfflineGainOptionalCount(value) {
 if (value === undefined || value === null) {
  return undefined;
 }
 return normalizeOfflineGainCount(value);
}
export function mergeOfflineGainReportPartsBySum(leftValue, rightValue) {
 const left = normalizeOfflineGainReportParts(leftValue);
 const right = normalizeOfflineGainReportParts(rightValue);
 const merged = markNormalizedOfflineGainReportParts({
  spiritStones: mergeOfflineGainAmountRecord(left.spiritStones, right.spiritStones, 'sum'),
  items: mergeOfflineGainItems(left.items, right.items, 'sum'),
  progress: mergeOfflineGainProgress(left.progress, right.progress, 'sum'),
  techniques: mergeOfflineGainTechniques(left.techniques, right.techniques, 'sum'),
  professions: mergeOfflineGainProfessions(left.professions, right.professions, 'sum'),
 });
 canonicalOfflineGainReportPartsRecords.add(merged);
 return merged;
}
/** 进度变更不会携带资产或职业差量，只复制实际变化的统计行。 */
export function mergeOfflineGainProgressionReportPartsBySum(leftValue, rightValue) {
 const left = normalizeOfflineGainReportParts(leftValue);
 const right = normalizeOfflineGainReportParts(rightValue);
 if (!canonicalOfflineGainReportPartsRecords.has(left)
  || right.spiritStones.gained > 0
  || right.spiritStones.lost > 0
  || right.spiritStones.net !== 0
  || right.items.length > 0
  || right.professions.length > 0) {
  return mergeOfflineGainReportPartsBySum(left, right);
 }
 const merged = markNormalizedOfflineGainReportParts({
  spiritStones: left.spiritStones,
  items: left.items,
  progress: mergeOfflineGainProgressRowsBySum(left.progress, right.progress),
  techniques: mergeOfflineGainTechniqueRowsBySum(left.techniques, right.techniques),
  professions: left.professions,
 });
 canonicalOfflineGainReportPartsRecords.add(merged);
 return merged;
}
/** 进度与职业经验变更不会携带背包或功法差量，保留其余累计数组引用。 */
export function mergeOfflineGainProgressionAndProfessionReportPartsBySum(leftValue, rightValue) {
 const left = normalizeOfflineGainReportParts(leftValue);
 const right = normalizeOfflineGainReportParts(rightValue);
 if (!canonicalOfflineGainReportPartsRecords.has(left)
  || right.spiritStones.gained > 0
  || right.spiritStones.lost > 0
  || right.spiritStones.net !== 0
  || right.items.length > 0
  || right.techniques.length > 0) {
  return mergeOfflineGainReportPartsBySum(left, right);
 }
 const merged = markNormalizedOfflineGainReportParts({
  spiritStones: left.spiritStones,
  items: left.items,
  progress: mergeOfflineGainProgressRowsBySum(left.progress, right.progress),
  techniques: left.techniques,
  professions: mergeOfflineGainProfessions(left.professions, right.professions, 'sum'),
 });
 canonicalOfflineGainReportPartsRecords.add(merged);
 return merged;
}
export function mergeOfflineGainProgressRowsBySum(leftRows, rightRows) {
 if (rightRows.length === 0) {
  return leftRows;
 }
 const mergedRows = leftRows.slice();
 for (const entry of rightRows) {
  const index = mergedRows.findIndex((current) => current.kind === entry.kind);
  if (index < 0) {
   mergedRows.push({ ...entry });
   continue;
  }
  const current = mergedRows[index];
  const amount = mergeOfflineGainAmountRecord(current, entry, 'sum');
  mergedRows[index] = {
   ...current,
   label: entry.label || current.label,
   gained: amount.gained,
   lost: amount.lost,
   net: amount.net,
   amount: amount.gained,
   levelGain: mergeOfflineGainOptionalAmount(current.levelGain, entry.levelGain, 'sum'),
   levelLoss: mergeOfflineGainOptionalAmount(current.levelLoss, entry.levelLoss, 'sum'),
   currentLevel: entry.currentLevel ?? current.currentLevel,
  };
 }
 return mergedRows;
}
export function mergeOfflineGainTechniqueRowsBySum(leftRows, rightRows) {
 if (rightRows.length === 0) {
  return leftRows;
 }
 const mergedRows = leftRows.slice();
 for (const entry of rightRows) {
  const index = mergedRows.findIndex((current) => current.techniqueId === entry.techniqueId);
  if (index < 0) {
   mergedRows.push({ ...entry });
   continue;
  }
  const current = mergedRows[index];
  const amount = mergeOfflineGainAmountRecord({
   gained: current.expGained,
   lost: current.expLost,
   net: current.netExp,
  }, {
   gained: entry.expGained,
   lost: entry.expLost,
   net: entry.netExp,
  }, 'sum');
  mergedRows[index] = {
   ...current,
   name: entry.name || current.name,
   expGained: amount.gained,
   expLost: amount.lost,
   netExp: amount.net,
   expGain: amount.gained,
   levelGain: mergeOfflineGainOptionalAmount(current.levelGain, entry.levelGain, 'sum'),
   levelLoss: mergeOfflineGainOptionalAmount(current.levelLoss, entry.levelLoss, 'sum'),
   currentLevel: entry.currentLevel ?? current.currentLevel,
  };
 }
 return mergedRows.sort((left, right) => String(left.name ?? left.techniqueId).localeCompare(String(right.name ?? right.techniqueId), 'zh-Hans-CN'));
}
export function mergeOfflineGainReportPartsByMaximum(leftValue, rightValue) {
 const left = normalizeOfflineGainReportParts(leftValue);
 const right = normalizeOfflineGainReportParts(rightValue);
 return markNormalizedOfflineGainReportParts({
  spiritStones: mergeOfflineGainAmountRecord(left.spiritStones, right.spiritStones, 'maximum'),
  items: mergeOfflineGainItems(left.items, right.items, 'maximum'),
  progress: mergeOfflineGainProgress(left.progress, right.progress, 'maximum'),
  techniques: mergeOfflineGainTechniques(left.techniques, right.techniques, 'maximum'),
  professions: mergeOfflineGainProfessions(left.professions, right.professions, 'maximum'),
 });
}
export function mergeOfflineGainAmountRecord(leftValue, rightValue, mode) {
 const left = normalizeOfflineGainAmountRecord(leftValue);
 const right = normalizeOfflineGainAmountRecord(rightValue);
 const gained = mode === 'sum' ? left.gained + right.gained : Math.max(left.gained, right.gained);
 const lost = mode === 'sum' ? left.lost + right.lost : Math.max(left.lost, right.lost);
 return {
  gained,
  lost,
  net: gained - lost,
 };
}
export function mergeOfflineGainItems(leftItems, rightItems, mode) {
 const byId = new Map();
 for (const entry of [...leftItems, ...rightItems]) {
  const current = byId.get(entry.itemId);
  if (!current) {
   byId.set(entry.itemId, { ...entry });
   continue;
  }
  current.name = entry.name || current.name;
  const merged = mergeOfflineGainAmountRecord(current, entry, mode);
  current.gained = merged.gained;
  current.lost = merged.lost;
  current.net = merged.net;
  current.count = merged.gained;
 }
 return Array.from(byId.values()).sort((left, right) => String(left.name ?? left.itemId).localeCompare(String(right.name ?? right.itemId), 'zh-Hans-CN'));
}
export function mergeOfflineGainProgress(leftRows, rightRows, mode) {
 const byKind = new Map();
 for (const entry of [...leftRows, ...rightRows]) {
  const current = byKind.get(entry.kind);
  if (!current) {
   byKind.set(entry.kind, { ...entry });
   continue;
  }
  current.label = entry.label || current.label;
  const merged = mergeOfflineGainAmountRecord(current, entry, mode);
  current.gained = merged.gained;
  current.lost = merged.lost;
  current.net = merged.net;
  current.amount = merged.gained;
  current.levelGain = mergeOfflineGainOptionalAmount(current.levelGain, entry.levelGain, mode);
  current.levelLoss = mergeOfflineGainOptionalAmount(current.levelLoss, entry.levelLoss, mode);
  current.currentLevel = entry.currentLevel ?? current.currentLevel;
 }
 return Array.from(byKind.values());
}
export function mergeOfflineGainTechniques(leftRows, rightRows, mode) {
 const byId = new Map();
 for (const entry of [...leftRows, ...rightRows]) {
  const current = byId.get(entry.techniqueId);
  if (!current) {
   byId.set(entry.techniqueId, { ...entry });
   continue;
  }
  current.name = entry.name || current.name;
  const merged = mergeOfflineGainAmountRecord({
   gained: current.expGained,
   lost: current.expLost,
   net: current.netExp,
  }, {
   gained: entry.expGained,
   lost: entry.expLost,
   net: entry.netExp,
  }, mode);
  current.expGained = merged.gained;
  current.expLost = merged.lost;
  current.netExp = merged.net;
  current.expGain = merged.gained;
  current.levelGain = mergeOfflineGainOptionalAmount(current.levelGain, entry.levelGain, mode);
  current.levelLoss = mergeOfflineGainOptionalAmount(current.levelLoss, entry.levelLoss, mode);
  current.currentLevel = entry.currentLevel ?? current.currentLevel;
 }
 return Array.from(byId.values()).sort((left, right) => String(left.name ?? left.techniqueId).localeCompare(String(right.name ?? right.techniqueId), 'zh-Hans-CN'));
}
export function mergeOfflineGainProfessions(leftRows, rightRows, mode) {
 const byType = new Map();
 for (const entry of [...leftRows, ...rightRows]) {
  const current = byType.get(entry.professionType);
  if (!current) {
   byType.set(entry.professionType, { ...entry });
   continue;
  }
  current.label = entry.label || current.label;
  const merged = mergeOfflineGainAmountRecord({
   gained: current.expGained,
   lost: current.expLost,
   net: current.netExp,
  }, {
   gained: entry.expGained,
   lost: entry.expLost,
   net: entry.netExp,
  }, mode);
  current.expGained = merged.gained;
  current.expLost = merged.lost;
  current.netExp = merged.net;
  current.expGain = merged.gained;
  current.levelGain = mergeOfflineGainOptionalAmount(current.levelGain, entry.levelGain, mode);
  current.levelLoss = mergeOfflineGainOptionalAmount(current.levelLoss, entry.levelLoss, mode);
  current.currentLevel = entry.currentLevel ?? current.currentLevel;
 }
 return Array.from(byType.values()).sort((left, right) => String(left.label ?? left.professionType).localeCompare(String(right.label ?? right.professionType), 'zh-Hans-CN'));
}
export function mergeOfflineGainOptionalAmount(leftValue, rightValue, mode) {
 const left = normalizeOfflineGainCount(leftValue);
 const right = normalizeOfflineGainCount(rightValue);
 const merged = mode === 'sum' ? left + right : Math.max(left, right);
 return merged > 0 ? merged : undefined;
}
export function buildOfflineGainSnapshot(player, contentTemplateRepository = null, playerProgressionService = null) {
 const resolveProfessionExpToNext = (level) => resolveCraftSkillExpToNextByLevel(playerProgressionService, level);
 return markNormalizedOfflineGainSnapshot({
  snapshotAt: Date.now(),
  playerId: normalizeOfflineGainString(player?.playerId),
  // 锁定中的装备/材料仍属于玩家资产；items 与 lockedItems 迁移不能产生虚假收支。
  inventoryItems: buildOfflineGainInventorySnapshot([
   ...(Array.isArray(player?.inventory?.items) ? player.inventory.items : []),
   ...(Array.isArray(player?.inventory?.lockedItems) ? player.inventory.lockedItems : []),
  ], contentTemplateRepository),
  realm: {
   realmLv: normalizeOfflineGainCount(player?.realm?.realmLv),
   level: normalizeOfflineGainCount(player?.realm?.realmLv),
   progress: normalizeOfflineGainCount(player?.realm?.progress),
   exp: normalizeOfflineGainCount(player?.realm?.progress),
   progressToNext: normalizeOfflineGainCount(player?.realm?.progressToNext),
   expToNext: normalizeOfflineGainCount(player?.realm?.progressToNext),
  },
  foundation: normalizeOfflineGainCount(player?.foundation),
  rootFoundation: normalizeOfflineGainCount(player?.rootFoundation),
  combatExp: normalizeOfflineGainCount(player?.combatExp),
  bodyTraining: buildOfflineGainExpStateSnapshot(player?.bodyTraining, {
   minLevel: 0,
   resolveExpToNext: (level) => typeof getBodyTrainingExpToNext === 'function'
    ? getBodyTrainingExpToNext(level)
    : normalizeOfflineGainCount(player?.bodyTraining?.expToNext),
  }),
  techniques: buildOfflineGainTechniqueSnapshot(player?.techniques?.techniques),
  professions: buildOfflineGainProfessionSnapshots(player, resolveProfessionExpToNext),
 });
}
export function buildOfflineGainProfessionSnapshots(player, resolveProfessionExpToNext) {
 return [
  buildOfflineGainProfessionSnapshot('alchemy', '炼丹', player?.alchemySkill, resolveProfessionExpToNext),
  buildOfflineGainProfessionSnapshot('forging', '炼器', player?.forgingSkill, resolveProfessionExpToNext),
  buildOfflineGainProfessionSnapshot('building', '营造', player?.buildingSkill, resolveProfessionExpToNext),
  buildOfflineGainProfessionSnapshot('gather', '采集', player?.gatherSkill, resolveProfessionExpToNext),
  buildOfflineGainProfessionSnapshot('enhancement', '强化', player?.enhancementSkill, resolveProfessionExpToNext),
  buildOfflineGainProfessionSnapshot('mining', '挖矿', player?.miningSkill, resolveProfessionExpToNext),
 ].filter((entry) => Boolean(entry));
}
export function buildOfflineGainInventorySnapshot(items, contentTemplateRepository = null) {
 const byItemId = new Map();
 for (const entry of Array.isArray(items) ? items : []) {
  const itemId = normalizeOfflineGainString(entry?.itemId);
  const count = normalizeOfflineGainCount(entry?.count);
  if (!itemId || count <= 0) {
   continue;
  }
  const existing = byItemId.get(itemId) ?? {
   itemId,
   name: resolvePlayerFacingContentName(
    itemId,
    '未知物品',
    entry?.name,
    typeof contentTemplateRepository?.getItemName === 'function' ? contentTemplateRepository.getItemName(itemId) : null,
   ),
   count: 0,
  };
  existing.count += count;
  byItemId.set(itemId, existing);
 }
 return Array.from(byItemId.values())
  .sort((left, right) => String(left.name ?? left.itemId).localeCompare(String(right.name ?? right.itemId), 'zh-Hans-CN'));
}
export function buildOfflineGainTechniqueSnapshot(techniques) {
 return (Array.isArray(techniques) ? techniques : [])
  .map((entry) => {
   const techniqueId = normalizeOfflineGainString(entry?.techId);
   if (!techniqueId) {
    return null;
   }
   return {
    techniqueId,
    name: resolvePlayerFacingContentName(techniqueId, '未知功法', entry?.name),
    ...buildOfflineGainExpStateSnapshot(entry, {
     minLevel: 1,
     levelKey: 'level',
     expKey: 'exp',
     expToNextKey: 'expToNext',
     expToNextByLevel: buildOfflineGainTechniqueExpTable(entry),
    }),
   };
  })
  .filter((entry) => Boolean(entry));
}
export function buildOfflineGainProgressionTechniqueSnapshot(techniques, previousTechniques) {
 const previousById = new Map((Array.isArray(previousTechniques) ? previousTechniques : [])
  .map((entry) => [entry?.techniqueId, entry]));
 return (Array.isArray(techniques) ? techniques : [])
  .map((entry) => {
   const techniqueId = normalizeOfflineGainString(entry?.techId);
   if (!techniqueId) {
    return null;
   }
   const previous = previousById.get(techniqueId);
   return {
    techniqueId,
    name: resolvePlayerFacingContentName(techniqueId, '未知功法', entry?.name),
    level: Math.max(1, Math.trunc(Number(entry?.level ?? 1) || 1)),
    exp: normalizeOfflineGainCount(entry?.exp),
    expToNext: normalizeOfflineGainCount(entry?.expToNext),
    expToNextByLevel: previous?.expToNextByLevel ?? buildOfflineGainTechniqueExpTable(entry),
   };
  })
  .filter((entry) => Boolean(entry));
}
/** 统计调用方已证明功法集合未变化时，只重建本次实际变更的功法槽位。 */
export function buildHintedOfflineGainProgressionTechniqueSnapshotAndDelta(techniques, previousTechniques, changedTechniqueIds) {
 const currentTechniques = Array.isArray(techniques) ? techniques : [];
 const previousSnapshot = Array.isArray(previousTechniques) ? previousTechniques : [];
 if (currentTechniques.length !== previousSnapshot.length) {
  return null;
 }
 if (changedTechniqueIds.length === 0) {
  return { snapshot: previousSnapshot, delta: [] };
 }
 const previousIndexById = resolveOfflineGainTechniqueSnapshotIndex(previousSnapshot);
 if (previousIndexById.size !== previousSnapshot.length) {
  return null;
 }
 const seenIds = changedTechniqueIds.length > 1 ? new Set<string>() : null;
 let snapshot = previousSnapshot;
 const delta = [];
 for (const rawTechniqueId of changedTechniqueIds) {
  const techniqueId = normalizeOfflineGainString(rawTechniqueId);
  if (!techniqueId || seenIds?.has(techniqueId)) {
   if (!techniqueId) {
    return null;
   }
   continue;
  }
  seenIds?.add(techniqueId);
  const previousIndex = previousIndexById.get(techniqueId);
  if (previousIndex === undefined) {
   return null;
  }
  const entry = currentTechniques[previousIndex];
  if (normalizeOfflineGainString(entry?.techId) !== techniqueId) {
   return null;
  }
  const previous = previousSnapshot[previousIndex];
  const level = Math.max(1, Math.trunc(Number(entry?.level ?? 1) || 1));
  const exp = normalizeOfflineGainCount(entry?.exp);
  const expToNext = normalizeOfflineGainCount(entry?.expToNext);
  if (previous.level === level && previous.exp === exp && previous.expToNext === expToNext) {
   continue;
  }
  const after = {
   techniqueId,
   name: resolvePlayerFacingContentName(techniqueId, '未知功法', entry?.name),
   level,
   exp,
   expToNext,
   expToNextByLevel: previous?.expToNextByLevel ?? buildOfflineGainTechniqueExpTable(entry),
  };
  if (snapshot === previousSnapshot) {
   snapshot = previousSnapshot.slice();
  }
  snapshot[previousIndex] = after;
  const changed = calculateOfflineGainExpChange(previous ?? {}, after);
  if (changed.expGained <= 0 && changed.expLost <= 0 && changed.levelGain <= 0 && changed.levelLoss <= 0) {
   continue;
  }
  delta.push({
   techniqueId: after.techniqueId,
   name: normalizeOfflineGainString(after.name) || undefined,
   expGained: changed.expGained,
   expLost: changed.expLost,
   netExp: changed.netExp,
   expGain: changed.expGained,
   levelGain: changed.levelGain > 0 ? changed.levelGain : undefined,
   levelLoss: changed.levelLoss > 0 ? changed.levelLoss : undefined,
   currentLevel: normalizeOfflineGainCount(after.level),
  });
 }
 if (snapshot !== previousSnapshot) {
  offlineGainTechniqueIndexBySnapshot.set(snapshot, previousIndexById);
 }
 return { snapshot, delta };
}
export function buildOfflineGainProgressionTechniqueSnapshotAndDelta(
 techniques,
 previousTechniques,
 statisticTechniqueChangedIds = undefined,
) {
 const currentTechniques = Array.isArray(techniques) ? techniques : [];
 const previousSnapshot = Array.isArray(previousTechniques) ? previousTechniques : [];
 if (Array.isArray(statisticTechniqueChangedIds)) {
  const hinted = buildHintedOfflineGainProgressionTechniqueSnapshotAndDelta(
   currentTechniques,
   previousSnapshot,
   statisticTechniqueChangedIds,
  );
  if (hinted) {
   return hinted;
  }
 }
 const previousIndexById = resolveOfflineGainTechniqueSnapshotIndex(previousSnapshot);
 if (currentTechniques.length !== previousSnapshot.length) {
  return buildFullOfflineGainProgressionTechniqueSnapshotAndDelta(currentTechniques, previousSnapshot);
 }
 if (previousIndexById.size !== previousSnapshot.length) {
  return buildFullOfflineGainProgressionTechniqueSnapshotAndDelta(currentTechniques, previousSnapshot);
 }
 let snapshot = previousSnapshot;
 const delta = [];
 for (const entry of currentTechniques) {
  const techniqueId = normalizeOfflineGainString(entry?.techId);
  if (!techniqueId) {
   return buildFullOfflineGainProgressionTechniqueSnapshotAndDelta(currentTechniques, previousSnapshot);
  }
  const previousIndex = previousIndexById.get(techniqueId);
  if (previousIndex === undefined) {
   return buildFullOfflineGainProgressionTechniqueSnapshotAndDelta(currentTechniques, previousSnapshot);
  }
  const previous = previousSnapshot[previousIndex];
  const level = Math.max(1, Math.trunc(Number(entry?.level ?? 1) || 1));
  const exp = normalizeOfflineGainCount(entry?.exp);
  const expToNext = normalizeOfflineGainCount(entry?.expToNext);
  if (previous.level === level && previous.exp === exp && previous.expToNext === expToNext) {
   continue;
  }
  const after = {
   techniqueId,
   name: resolvePlayerFacingContentName(techniqueId, '未知功法', entry?.name),
   level,
   exp,
   expToNext,
   expToNextByLevel: previous?.expToNextByLevel ?? buildOfflineGainTechniqueExpTable(entry),
  };
  if (snapshot === previousSnapshot) {
   snapshot = previousSnapshot.slice();
  }
  snapshot[previousIndex] = after;
  const changed = calculateOfflineGainExpChange(previous ?? {}, after);
  if (changed.expGained <= 0 && changed.expLost <= 0 && changed.levelGain <= 0 && changed.levelLoss <= 0) {
   continue;
  }
  delta.push({
   techniqueId: after.techniqueId,
   name: normalizeOfflineGainString(after.name) || undefined,
   expGained: changed.expGained,
   expLost: changed.expLost,
   netExp: changed.netExp,
   expGain: changed.expGained,
   levelGain: changed.levelGain > 0 ? changed.levelGain : undefined,
   levelLoss: changed.levelLoss > 0 ? changed.levelLoss : undefined,
   currentLevel: normalizeOfflineGainCount(after.level),
  });
 }
 if (snapshot !== previousSnapshot) {
  offlineGainTechniqueIndexBySnapshot.set(snapshot, previousIndexById);
 }
 return { snapshot, delta };
}

/** 功法新增、移除或索引异常时回退到完整重建，保证收益语义不受缓存影响。 */
export function buildFullOfflineGainProgressionTechniqueSnapshotAndDelta(techniques, previousTechniques) {
 const previousById = new Map((Array.isArray(previousTechniques) ? previousTechniques : [])
  .map((entry) => [entry?.techniqueId, entry]));
 const snapshot = [];
 const delta = [];
 for (const entry of Array.isArray(techniques) ? techniques : []) {
  const techniqueId = normalizeOfflineGainString(entry?.techId);
  if (!techniqueId) {
   continue;
  }
  const previous = previousById.get(techniqueId);
  const after = {
   techniqueId,
   name: resolvePlayerFacingContentName(techniqueId, '未知功法', entry?.name),
   level: Math.max(1, Math.trunc(Number(entry?.level ?? 1) || 1)),
   exp: normalizeOfflineGainCount(entry?.exp),
   expToNext: normalizeOfflineGainCount(entry?.expToNext),
   expToNextByLevel: previous?.expToNextByLevel ?? buildOfflineGainTechniqueExpTable(entry),
  };
  snapshot.push(after);
  const changed = calculateOfflineGainExpChange(previous ?? {}, after);
  if (changed.expGained <= 0 && changed.expLost <= 0 && changed.levelGain <= 0 && changed.levelLoss <= 0) {
   continue;
  }
  delta.push({
   techniqueId: after.techniqueId,
   name: normalizeOfflineGainString(after.name) || undefined,
   expGained: changed.expGained,
   expLost: changed.expLost,
   netExp: changed.netExp,
   expGain: changed.expGained,
   levelGain: changed.levelGain > 0 ? changed.levelGain : undefined,
   levelLoss: changed.levelLoss > 0 ? changed.levelLoss : undefined,
   currentLevel: normalizeOfflineGainCount(after.level),
  });
 }
 resolveOfflineGainTechniqueSnapshotIndex(snapshot);
 return { snapshot, delta };
}

export function resolveOfflineGainTechniqueSnapshotIndex(snapshot: object[]): Map<string, number> {
 const cached = offlineGainTechniqueIndexBySnapshot.get(snapshot);
 if (cached) {
  return cached;
 }
 const indexById = new Map<string, number>();
 for (let index = 0; index < snapshot.length; index += 1) {
  const techniqueId = normalizeOfflineGainString((snapshot[index] as any)?.techniqueId);
  if (techniqueId) {
   indexById.set(techniqueId, index);
  }
 }
 offlineGainTechniqueIndexBySnapshot.set(snapshot, indexById);
 return indexById;
}
export function buildOfflineGainTechniqueExpTable(technique) {
 const byLevel: Record<string, number> = {};
 for (const layer of Array.isArray(technique?.layers) ? technique.layers : []) {
  const level = normalizeOfflineGainCount(layer?.level);
  const expToNext = normalizeOfflineGainCount(layer?.expToNext);
  if (level > 0) {
   byLevel[String(level)] = expToNext;
  }
 }
 return byLevel;
}
export function buildOfflineGainProfessionSnapshot(professionType, label, state, resolveExpToNext = null) {
 if (!state) {
  return null;
 }
 return {
  professionType,
  label,
  ...buildOfflineGainExpStateSnapshot(state, {
   minLevel: 1,
   resolveExpToNext: resolveExpToNext ?? resolveCraftSkillExpToNextForLevel,
  }),
 };
}
export function buildOfflineGainExpStateSnapshot(state, options: any = {}) {
 const levelKey = options.levelKey ?? 'level';
 const expKey = options.expKey ?? 'exp';
 const expToNextKey = options.expToNextKey ?? 'expToNext';
 const minLevel = Number.isFinite(options.minLevel) ? Math.trunc(Number(options.minLevel)) : 0;
 const level = Math.max(minLevel, Math.trunc(Number(state?.[levelKey] ?? minLevel) || minLevel));
 const fallbackExpToNext = typeof options.resolveExpToNext === 'function'
  ? options.resolveExpToNext(level)
  : state?.[expToNextKey];
 return {
  level,
  exp: normalizeOfflineGainCount(state?.[expKey]),
  expToNext: normalizeOfflineGainCount(state?.[expToNextKey] ?? fallbackExpToNext),
  expToNextByLevel: options.expToNextByLevel ?? null,
 };
}
export function resolveCraftSkillExpToNextForLevel(level) {
 return resolveCraftSkillExpToNextByLevel(null, level, DEFAULT_CRAFT_EXP_TO_NEXT);
}
export function buildOfflineGainReportFromSession(player, session, endedAt, contentTemplateRepository = null) {
 const baseline = normalizeOfflineGainSnapshot(session?.baselinePayload);
 const startedAt = normalizeOfflineGainCount(session?.startedAt ?? baseline.snapshotAt);
 const normalizedEndedAt = Math.max(startedAt, normalizeOfflineGainCount(endedAt));
 const mergedPayload = normalizeOfflineGainReportParts(session?.accumulatedPayload);
 return buildPlayerStatisticRecordFromParts(player, {
  sessionId: normalizeOfflineGainString(session?.sessionId) || buildOfflineGainSessionId(player?.playerId, startedAt),
  startedAt,
  baselinePayload: session?.baselinePayload,
  accumulatedPayload: mergedPayload,
  accumulatedDurationMs: normalizeOfflineGainCount(session?.accumulatedDurationMs),
 }, normalizedEndedAt, mergedPayload, 'offline');
}
export function normalizeOfflineGainSnapshot(value) {
 if (value && typeof value === 'object' && normalizedOfflineGainSnapshots.has(value)) {
  return value;
 }
 const record = value && typeof value === 'object' ? value : {};
 return markNormalizedOfflineGainSnapshot({
  snapshotAt: normalizeOfflineGainCount(record.snapshotAt),
  playerId: normalizeOfflineGainString(record.playerId),
  inventoryItems: normalizeOfflineGainItemSnapshotList(record.inventoryItems),
  realm: normalizeOfflineGainExpRecord(record.realm, { levelKey: 'realmLv', minLevel: 0 }),
  foundation: normalizeOfflineGainCount(record.foundation),
  rootFoundation: normalizeOfflineGainCount(record.rootFoundation),
  combatExp: normalizeOfflineGainCount(record.combatExp),
  bodyTraining: normalizeOfflineGainExpRecord(record.bodyTraining, { minLevel: 0 }),
  techniques: normalizeOfflineGainExpNamedList(record.techniques, 'techniqueId'),
  professions: normalizeOfflineGainExpNamedList(record.professions, 'professionType'),
 });
}

export function markNormalizedOfflineGainSnapshot<T extends object>(snapshot: T): T {
 normalizedOfflineGainSnapshots.add(snapshot);
 return snapshot;
}

export function markNormalizedOfflineGainReportParts<T extends object>(parts: T): T {
 normalizedOfflineGainReportPartsRecords.add(parts);
 return parts;
}
export function normalizeOfflineGainItemSnapshotList(value) {
 return (Array.isArray(value) ? value : [])
  .map((entry) => ({
   itemId: normalizeOfflineGainString(entry?.itemId),
   name: normalizeOfflineGainString(entry?.name) || undefined,
   count: normalizeOfflineGainCount(entry?.count),
  }))
  .filter((entry) => entry.itemId && entry.count > 0);
}
export function normalizeOfflineGainExpNamedList(value, idKey) {
 return (Array.isArray(value) ? value : [])
  .map((entry) => ({
   ...normalizeOfflineGainExpRecord(entry, { minLevel: 1 }),
   [idKey]: normalizeOfflineGainString(entry?.[idKey]),
   name: normalizeOfflineGainString(entry?.name) || undefined,
   label: normalizeOfflineGainString(entry?.label) || undefined,
  }))
  .filter((entry) => entry[idKey]);
}
export function normalizeOfflineGainExpRecord(value, options: any = {}) {
 const record = value && typeof value === 'object' ? value : {};
 const levelKey = options.levelKey ?? 'level';
 const minLevel = Number.isFinite(options.minLevel) ? Math.trunc(Number(options.minLevel)) : 0;
 const level = Math.max(minLevel, Math.trunc(Number(record[levelKey] ?? record.level ?? minLevel) || minLevel));
 return {
  level,
  realmLv: normalizeOfflineGainCount(record.realmLv ?? level),
  exp: normalizeOfflineGainCount(record.exp ?? record.progress),
  progress: normalizeOfflineGainCount(record.progress ?? record.exp),
  expToNext: normalizeOfflineGainCount(record.expToNext ?? record.progressToNext),
  progressToNext: normalizeOfflineGainCount(record.progressToNext ?? record.expToNext),
  expToNextByLevel: record.expToNextByLevel && typeof record.expToNextByLevel === 'object'
   ? { ...record.expToNextByLevel }
   : null,
 };
}
export function diffOfflineGainItems(beforeItems, afterItems) {
 const byId = new Map();
 for (const entry of Array.isArray(beforeItems) ? beforeItems : []) {
  const itemId = normalizeOfflineGainString(entry?.itemId);
  if (!itemId) {
   continue;
  }
  const current = byId.get(itemId) ?? {
   itemId,
   name: normalizeOfflineGainString(entry?.name) || undefined,
   before: 0,
   after: 0,
  };
  current.before += normalizeOfflineGainCount(entry?.count);
  current.name = current.name || normalizeOfflineGainString(entry?.name) || undefined;
  byId.set(itemId, current);
 }
 for (const entry of Array.isArray(afterItems) ? afterItems : []) {
  const itemId = normalizeOfflineGainString(entry?.itemId);
  if (!itemId) {
   continue;
  }
  const current = byId.get(itemId) ?? {
   itemId,
   name: normalizeOfflineGainString(entry?.name) || undefined,
   before: 0,
   after: 0,
  };
  current.after += normalizeOfflineGainCount(entry?.count);
  current.name = normalizeOfflineGainString(entry?.name) || current.name;
  byId.set(itemId, current);
 }
 return Array.from(byId.values())
  .map((entry) => {
   const net = normalizeOfflineGainSignedCount(entry.after - entry.before);
   if (net === 0) {
    return null;
   }
   const gained = Math.max(0, net);
   const lost = Math.max(0, -net);
   return {
    itemId: entry.itemId,
    name: normalizeOfflineGainString(entry.name) || undefined,
    gained,
    lost,
    net,
    count: gained,
   };
  })
  .filter((entry) => Boolean(entry));
}
export function diffOfflineGainProgress(before, after) {
 const progress = [];
 const realmDelta = calculateOfflineGainExpChange(before.realm, after.realm, {
  beforeLevelKey: 'realmLv',
  afterLevelKey: 'realmLv',
 });
 if (realmDelta.expGained > 0 || realmDelta.expLost > 0 || realmDelta.levelGain > 0 || realmDelta.levelLoss > 0) {
  progress.push({
   kind: 'realmExp',
   label: '修为',
   gained: realmDelta.expGained,
   lost: realmDelta.expLost,
   net: realmDelta.netExp,
   amount: realmDelta.expGained,
   levelGain: realmDelta.levelGain > 0 ? realmDelta.levelGain : undefined,
   levelLoss: realmDelta.levelLoss > 0 ? realmDelta.levelLoss : undefined,
   currentLevel: normalizeOfflineGainCount(after.realm?.realmLv),
  });
 }
 appendOfflineGainProgressDelta(progress, 'foundation', '底蕴', before.foundation, after.foundation);
 appendOfflineGainProgressDelta(progress, 'rootFoundation', '根基', before.rootFoundation, after.rootFoundation);
 appendOfflineGainProgressDelta(progress, 'combatExp', '战斗经验', before.combatExp, after.combatExp);
 const bodyTrainingDelta = calculateOfflineGainExpChange(before.bodyTraining, after.bodyTraining, {
  resolveExpToNext: (level) => typeof getBodyTrainingExpToNext === 'function'
   ? getBodyTrainingExpToNext(level)
   : 0,
 });
 if (bodyTrainingDelta.expGained > 0 || bodyTrainingDelta.expLost > 0 || bodyTrainingDelta.levelGain > 0 || bodyTrainingDelta.levelLoss > 0) {
  progress.push({
   kind: 'bodyTrainingExp',
   label: '炼体经验',
   gained: bodyTrainingDelta.expGained,
   lost: bodyTrainingDelta.expLost,
   net: bodyTrainingDelta.netExp,
   amount: bodyTrainingDelta.expGained,
   levelGain: bodyTrainingDelta.levelGain > 0 ? bodyTrainingDelta.levelGain : undefined,
   levelLoss: bodyTrainingDelta.levelLoss > 0 ? bodyTrainingDelta.levelLoss : undefined,
   currentLevel: normalizeOfflineGainCount(after.bodyTraining?.level),
  });
 }
 return progress;
}
export function appendOfflineGainProgressDelta(progress, kind, label, beforeValue, afterValue) {
 const amount = normalizeOfflineGainCount(afterValue) - normalizeOfflineGainCount(beforeValue);
 if (amount === 0) {
  return;
 }
 progress.push({
  kind,
  label,
  gained: Math.max(0, amount),
  lost: Math.max(0, -amount),
  net: amount,
  amount: Math.max(0, amount),
 });
}
export function diffOfflineGainTechniques(beforeTechniques, afterTechniques) {
 const beforeById = new Map((Array.isArray(beforeTechniques) ? beforeTechniques : [])
  .map((entry) => [entry.techniqueId, entry]));
 return (Array.isArray(afterTechniques) ? afterTechniques : [])
  .map((after) => {
   const before = beforeById.get(after.techniqueId) ?? {};
   const delta = calculateOfflineGainExpChange(before, after);
   if (delta.expGained <= 0 && delta.expLost <= 0 && delta.levelGain <= 0 && delta.levelLoss <= 0) {
    return null;
   }
   return {
    techniqueId: after.techniqueId,
    name: normalizeOfflineGainString(after.name) || undefined,
    expGained: delta.expGained,
    expLost: delta.expLost,
    netExp: delta.netExp,
    expGain: delta.expGained,
    levelGain: delta.levelGain > 0 ? delta.levelGain : undefined,
    levelLoss: delta.levelLoss > 0 ? delta.levelLoss : undefined,
    currentLevel: normalizeOfflineGainCount(after.level),
   };
  })
  .filter((entry) => Boolean(entry));
}
export function diffOfflineGainProfessions(beforeProfessions, afterProfessions, resolveExpToNext = null) {
 const beforeByType = new Map((Array.isArray(beforeProfessions) ? beforeProfessions : [])
  .map((entry) => [entry.professionType, entry]));
 return (Array.isArray(afterProfessions) ? afterProfessions : [])
  .map((after) => {
   const before = beforeByType.get(after.professionType) ?? {};
   const delta = calculateOfflineGainExpChange(before, after, {
    resolveExpToNext: resolveExpToNext ?? resolveCraftSkillExpToNextForLevel,
   });
   if (delta.expGained <= 0 && delta.expLost <= 0 && delta.levelGain <= 0 && delta.levelLoss <= 0) {
    return null;
   }
   return {
    professionType: after.professionType,
    label: normalizeOfflineGainString(after.label) || '技艺',
    expGained: delta.expGained,
    expLost: delta.expLost,
    netExp: delta.netExp,
    expGain: delta.expGained,
    levelGain: delta.levelGain > 0 ? delta.levelGain : undefined,
    levelLoss: delta.levelLoss > 0 ? delta.levelLoss : undefined,
    currentLevel: normalizeOfflineGainCount(after.level),
   };
  })
  .filter((entry) => Boolean(entry));
}
export function calculateOfflineGainExpChange(before, after, options: any = {}) {
 const beforeLevelKey = options.beforeLevelKey ?? 'level';
 const afterLevelKey = options.afterLevelKey ?? 'level';
 const beforeLevel = normalizeOfflineGainCount(before?.[beforeLevelKey] ?? before?.level);
 const afterLevel = normalizeOfflineGainCount(after?.[afterLevelKey] ?? after?.level);
 if (afterLevel > beforeLevel) {
  const gained = calculateOfflineGainExpDelta(before, after, options);
  return {
   expGained: gained.expGain,
   expLost: 0,
   netExp: gained.expGain,
   levelGain: gained.levelGain,
   levelLoss: 0,
  };
 }
 if (afterLevel < beforeLevel) {
  const lost = calculateOfflineGainExpDelta(after, before, {
   ...options,
   beforeLevelKey: afterLevelKey,
   afterLevelKey: beforeLevelKey,
  });
  return {
   expGained: 0,
   expLost: lost.expGain,
   netExp: -lost.expGain,
   levelGain: 0,
   levelLoss: Math.max(0, beforeLevel - afterLevel),
  };
 }
 const expDelta = normalizeOfflineGainCount(after?.exp ?? after?.progress) - normalizeOfflineGainCount(before?.exp ?? before?.progress);
 return {
  expGained: Math.max(0, expDelta),
  expLost: Math.max(0, -expDelta),
  netExp: expDelta,
  levelGain: 0,
  levelLoss: 0,
 };
}
export function calculateOfflineGainExpDelta(before, after, options: any = {}) {
 const beforeLevelKey = options.beforeLevelKey ?? 'level';
 const afterLevelKey = options.afterLevelKey ?? 'level';
 const beforeLevel = normalizeOfflineGainCount(before?.[beforeLevelKey] ?? before?.level);
 const afterLevel = normalizeOfflineGainCount(after?.[afterLevelKey] ?? after?.level);
 const beforeExp = normalizeOfflineGainCount(before?.exp ?? before?.progress);
 const afterExp = normalizeOfflineGainCount(after?.exp ?? after?.progress);
 if (afterLevel <= beforeLevel) {
  return {
   expGain: Math.max(0, afterExp - beforeExp),
   levelGain: 0,
  };
 }
 let expGain = Math.max(0, resolveOfflineGainExpToNext(beforeLevel, before, after, options) - beforeExp);
 for (let level = beforeLevel + 1; level < afterLevel; level += 1) {
  expGain += Math.max(0, resolveOfflineGainExpToNext(level, before, after, options));
 }
 expGain += afterExp;
 return {
  expGain: normalizeOfflineGainCount(expGain),
  levelGain: Math.max(0, afterLevel - beforeLevel),
 };
}
export function resolveOfflineGainExpToNext(level, before, after, options: any = {}) {
 const normalizedLevel = normalizeOfflineGainCount(level);
 const fromAfter = readOfflineGainExpToNextByLevel(after, normalizedLevel);
 if (fromAfter > 0) {
  return fromAfter;
 }
 const fromBefore = readOfflineGainExpToNextByLevel(before, normalizedLevel);
 if (fromBefore > 0) {
  return fromBefore;
 }
 if (typeof options.resolveExpToNext === 'function') {
  return normalizeOfflineGainCount(options.resolveExpToNext(normalizedLevel));
 }
 if (normalizeOfflineGainCount(before?.level) === normalizedLevel) {
  return normalizeOfflineGainCount(before?.expToNext ?? before?.progressToNext);
 }
 if (normalizeOfflineGainCount(after?.level) === normalizedLevel) {
  return normalizeOfflineGainCount(after?.expToNext ?? after?.progressToNext);
 }
 return 0;
}
export function readOfflineGainExpToNextByLevel(snapshot, level) {
  if (snapshot && normalizeOfflineGainCount(snapshot.level) === level) {
    return normalizeOfflineGainCount(snapshot.expToNext ?? snapshot.progressToNext);
  }
  return 0;
}

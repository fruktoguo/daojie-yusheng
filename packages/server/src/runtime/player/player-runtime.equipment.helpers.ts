/**
 * 玩家运行时游离模块函数集合 — 装备/法宝快照/强化域。
 *
 * 从 player-runtime.helpers.ts 拆分而来，包含：
 * - 装备快照构建
 * - 法宝状态构建/规范化/比较/签名
 * - 强化恢复状态修复/队列显示名修复
 * - 炼丹/强化 job 规范化与克隆
 * - 装备槽位模板规范化
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ARTIFACT_SLOTS, ARTIFACT_UNLOCK_REALM_LV, ATTR_KEYS, ATTR_TO_NUMERIC_WEIGHTS, ATTR_TO_PERCENT_NUMERIC_WEIGHTS, AUTO_IDLE_CULTIVATION_DELAY_TICKS, BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER, DEFAULT_BASE_ATTRS, DEFAULT_BONE_AGE_YEARS, DEFAULT_COMBAT_ATTACK_INTENSITY, DEFAULT_INSTANT_CONSUMABLE_COOLDOWN_TICKS, DEFAULT_INVENTORY_CAPACITY, DEFAULT_PLAYER_REALM_STAGE, DUNGEON_MAX_STAMINA, DUNGEON_PRESSURE_BUFF_ID, Direction, EQUIP_SLOTS, PLAYER_REALM_CONFIG, PLAYER_REALM_ORDER, RETURN_TO_SPAWN_ACTION_ID, RETURN_TO_SPAWN_COOLDOWN_TICKS, TECHNIQUE_ACTIVITY_QUEUE_MAX_LENGTH, TechniqueRealm, addItemStackMergeCount, calculateTechniqueComprehensionProgressGain, calculateTechniqueComprehensionRequiredProgress, canMergeItemStack, cloneCraftEffectStats, coalesceItemStackList, compileValueStatsToActualStats, computeCraftSkillExpGain, createItemStackSignature, enforceSkillEnabledLimit, findMergeableItemStackIndex, getBodyTrainingExpToNext, getTechniqueMaxLevel, isCreatedTechniqueId, isTechniqueAggregationId, isTechniqueFullyMastered, mergeItemStackInto, normalizeBodyTrainingState, normalizeCombatAttackIntensity, normalizeHorizontalFacing, normalizeTechniqueStrengthPercent, resolveArtifactMaxQi, resolveCooldownTicks, resolvePlayerFacingContentName, resolvePlayerSkillSlotLimit, resolveRecoveredStamina, resolveSkillRequiresTarget, resolveTechniqueStandardMaxHpRecoveryAmount, resolveTechniqueStandardMaxQiRecoveryAmount } from '@mud/shared';
import { assignItemInstanceIdIfNeeded, compareItemInstanceId, isItemInstanceIdHardCheckEnabled } from '../world/item-instance-id.helpers';
import { PVP_SHA_BACKLASH_BUFF_ID, PVP_SHA_BACKLASH_DECAY_TICKS, PVP_SHA_BACKLASH_PERCENT_PER_STACK, PVP_SHA_BACKLASH_SOURCE_ID, PVP_SHA_BACKLASH_STACK_DIVISOR, PVP_SHA_INFUSION_ATTACK_CAP_PERCENT, PVP_SHA_INFUSION_BUFF_ID, PVP_SHA_INFUSION_DECAY_TICKS, PVP_SHA_INFUSION_SOURCE_ID, PVP_SOUL_INJURY_BUFF_ID, PVP_SOUL_INJURY_DURATION_TICKS, PVP_SOUL_INJURY_MAX_STACKS, PVP_SOUL_INJURY_SOURCE_ID } from '../../constants/gameplay/pvp';
import { HEAVENLY_DAO_SUPPRESSION_BUFF_ID, HEAVENLY_DAO_SUPPRESSION_DURATION_TICKS, HEAVENLY_DAO_SUPPRESSION_MAX_STACKS, HEAVENLY_DAO_SUPPRESSION_SOURCE_ID } from '../../constants/gameplay/virtual-world';
import { ContentTemplateRepository } from '../../content/content-template.repository';
import { MapTemplateRepository } from '../map/map-template.repository';
import { PlayerProgressionService } from './player-progression.service';
import { applyPlayerCraftExpRate, resolvePlayerCraftRealmLevel } from '../craft/craft-effect-runtime.helpers';
import { collectEnabledCultivationTileQiPassives } from './player-skill-passive.helpers';
import { resolveCultivationPassiveTileQiAmount } from './player-cultivation-passive.helpers';
import { cloneAutoUsePillList, cloneCombatTargetingRules, isSameAutoUsePillList, isSameCombatTargetingRules, normalizePersistedAutoUsePills, normalizePersistedCombatTargetingRules } from './player-combat-config.helpers';
import { projectHeavenGateState, projectRealmState } from './player-realm-projection.helpers';
import { createRuntimeTemporaryBuff, materializeRuntimeTemporaryBuff, refreshRuntimeTemporaryBuffPrototype } from './runtime-buff-instance';
import { compareInventoryItems } from './inventory-sort.helpers';
import { DEFAULT_CRAFT_EXP_TO_NEXT, resolveCraftSkillExpToNextByLevel } from '../craft/craft-skill-exp.helpers';
import { TechniqueActivityPipelineService } from '../craft/pipeline/technique-activity-pipeline.service';
import { TransmissionStrategy } from '../craft/pipeline/strategies/transmission.strategy';
import {
 advancePlayerArtifactQiTick,
 resolveArtifactSustainCostWithOvercharge,
 resolvePlayerArtifactOverchargeStacks,
} from './player-artifact-runtime.helpers';
import { markPlayerComprehensionSpeedRateProjectionDirty } from './player-comprehension-speed.helpers';
import { OFFLINE_GAIN_REPORT_MIN_DURATION_MS, resolveOfflineGainReportDurationMs } from './offline-gain-duration.helpers';
import { nextPlayerPersistenceVersion } from '../../persistence/player-domain-persistence.service';
import { clamp } from './player-runtime.item-clone.helpers';
import { markPlayerDirtyDomains } from './player-runtime.constants';
import { normalizeTechniqueActivityQueueText } from './player-runtime.technique-queue.helpers';
export function buildEquipmentSnapshot(equipment) {
 return EQUIP_SLOTS.map((slot) => ({
  slot,
  item: equipment[slot] ?? null,
 }));
}

export function buildDefaultArtifactState(unlocked = false) {
 return {
  revision: 1,
  slots: ARTIFACT_SLOTS.map((slot, index) => ({
   slot,
   unlocked: unlocked === true && index === 0,
   enabled: true,
   qi: 0,
   maxQi: 0,
   item: null,
  })),
 };
}

export function normalizeArtifactStateWithTemplates(source, contentTemplateRepository, unlockFirstSlot = false) {
 const record = source && typeof source === 'object' ? source : {};
 const sourceSlots = Array.isArray(record.slots) ? record.slots : [];
 const revision = Math.max(1, Math.trunc(Number(record.revision ?? 1) || 1));
 return {
  revision,
  slots: ARTIFACT_SLOTS.map((slot, index) => {
   const slotRecord = sourceSlots.find((entry) => entry?.slot === slot) ?? null;
   const rawItem = slotRecord?.item && typeof slotRecord.item === 'object' ? slotRecord.item : null;
   const item = rawItem ? contentTemplateRepository.normalizeItem(rawItem) : null;
   const maxQi = item ? resolveArtifactMaxQi(item) : 0;
   return {
    slot,
    unlocked: slotRecord?.unlocked === true || (unlockFirstSlot === true && index === 0),
    enabled: slotRecord?.enabled !== false,
    qi: item ? clamp(Number(slotRecord?.qi ?? maxQi), 0, maxQi) : 0,
    maxQi,
    item,
   };
  }),
 };
}

export function isSameArtifactSlotStateForRuntime(left, right) {
 if (!left || !right) {
  return false;
 }
 if (
  left.slot !== right.slot
  || left.unlocked !== right.unlocked
  || left.enabled !== right.enabled
  || left.qi !== right.qi
  || left.maxQi !== right.maxQi
 ) {
  return false;
 }
 return buildArtifactItemSignature(left.item) === buildArtifactItemSignature(right.item);
}

export function buildArtifactItemSignature(item) {
 if (!item) {
  return '';
 }
 const instanceId = typeof item.itemInstanceId === 'string' ? item.itemInstanceId : '';
 return `${instanceId}:${createItemStackSignature(item)}`;
}
export function repairInvalidEnhancementRecoveryState(player) {
 const job = player?.enhancementJob;
 const lockedItems = Array.isArray(player?.inventory?.lockedItems) ? player.inventory.lockedItems : [];
 const activeLockedBy = job && typeof job === 'object' && typeof job.jobRunId === 'string' && job.jobRunId.trim()
  ? `enhancement:${job.jobRunId.trim()}`
  : '';
 const remainingLockedItems = [];
 let restoredOrphanLockedItems = false;
 for (const entry of lockedItems) {
  const lockedBy = typeof entry?.lockedBy === 'string' ? entry.lockedBy.trim() : '';
  if (!lockedBy.startsWith('enhancement:') || (activeLockedBy && lockedBy === activeLockedBy)) {
   remainingLockedItems.push(entry);
   continue;
  }
  const { lockedBy: _lockedBy, lockedAt: _lockedAt, ...itemFields } = entry;
  assignItemInstanceIdIfNeeded(itemFields);
  mergeItemStackInto(player.inventory.items, itemFields);
  restoredOrphanLockedItems = true;
 }
 if (restoredOrphanLockedItems) {
  player.inventory.lockedItems = remainingLockedItems;
  markPlayerDirtyDomains(player, ['inventory']);
 }
 if (!job || typeof job !== 'object') {
  return restoredOrphanLockedItems;
 }
 const itemInstanceId = typeof job.itemInstanceId === 'string' && job.itemInstanceId.trim()
  ? job.itemInstanceId.trim()
  : '';
 const currentLockedItems = Array.isArray(player?.inventory?.lockedItems) ? player.inventory.lockedItems : [];
 const hasLockedItem = Boolean(itemInstanceId)
  && currentLockedItems.some((entry) => entry?.itemInstanceId === itemInstanceId);
 if (hasLockedItem) {
  return restoredOrphanLockedItems;
 }
 const jobRunId = typeof job.jobRunId === 'string' && job.jobRunId.trim() ? job.jobRunId.trim() : '';
 const orphanLockedBy = jobRunId ? `enhancement:${jobRunId}` : '';
 if (orphanLockedBy) {
  player.inventory.lockedItems = currentLockedItems.filter((entry) => entry?.lockedBy !== orphanLockedBy);
 }
 const now = Date.now();
 const targetItemId = typeof job.targetItemId === 'string' && job.targetItemId.trim() ? job.targetItemId.trim() : '';
 const record = targetItemId
  ? (player.enhancementRecords ?? []).find((entry) => entry?.itemId === targetItemId)
  : null;
 if (record) {
  record.status = 'stopped';
  record.actionEndedAt = now;
  record.highestLevel = Math.max(
   Math.floor(Number(record.highestLevel) || 0),
   Math.floor(Number(job.currentLevel) || 0),
  );
 }
 else if (targetItemId) {
  if (!Array.isArray(player.enhancementRecords)) {
   player.enhancementRecords = [];
  }
  player.enhancementRecords.push({
   itemId: targetItemId,
   itemName: resolvePlayerFacingContentName(targetItemId, '未知物品', job.targetItemName, job.item?.name),
   highestLevel: Math.max(0, Math.floor(Number(job.currentLevel) || 0)),
   levels: [],
   actionStartedAt: Number.isFinite(Number(job.startedAt)) ? Math.max(0, Math.trunc(Number(job.startedAt))) : undefined,
   actionEndedAt: now,
   startLevel: Math.max(0, Math.floor(Number(job.currentLevel) || 0)),
   initialTargetLevel: Math.max(1, Math.floor(Number(job.targetLevel) || 1)),
   desiredTargetLevel: Math.max(1, Math.floor(Number(job.desiredTargetLevel) || Number(job.targetLevel) || 1)),
   protectionStartLevel: job.protectionStartLevel,
   status: 'stopped',
  });
 }
 player.enhancementJob = null;
 markPlayerDirtyDomains(player, ['active_job', 'enhancement_record', 'inventory']);
 return true;
}

export function repairEnhancementRecoveryDisplayNames(player, contentTemplateRepository) {
 const job = player?.enhancementJob;
 const targetItemId = job && typeof job === 'object' && typeof job.targetItemId === 'string'
  ? job.targetItemId.trim()
  : '';
 const itemInstanceId = job && typeof job === 'object' && typeof job.itemInstanceId === 'string'
  ? job.itemInstanceId.trim()
  : '';
 const lockedItems = Array.isArray(player?.inventory?.lockedItems) ? player.inventory.lockedItems : [];
 const lockedItem = itemInstanceId
  ? lockedItems.find((entry) => entry?.itemInstanceId === itemInstanceId)
  : null;
 const records = Array.isArray(player?.enhancementRecords) ? player.enhancementRecords : [];
 const matchingRecords = records.filter((entry) => entry?.itemId === targetItemId);
 const dirtyDomains = [];
 let activeJobName = '未知物品';
 if (targetItemId) {
  activeJobName = resolvePlayerFacingContentName(
   targetItemId,
   '未知物品',
   job.targetItemName,
   lockedItem?.name,
   job.item?.name,
   matchingRecords.find((entry) => entry?.itemName)?.itemName,
   contentTemplateRepository?.getItemName?.(targetItemId),
  );
  if (activeJobName !== '未知物品' && job.targetItemName !== activeJobName) {
   job.targetItemName = activeJobName;
   dirtyDomains.push('active_job');
  }
 }
 let recordChanged = false;
 for (const record of records) {
  const recordItemId = typeof record?.itemId === 'string' ? record.itemId.trim() : '';
  if (!recordItemId) {
   continue;
  }
  const currentName = resolvePlayerFacingContentName(recordItemId, '未知物品', record?.itemName);
  if (currentName === '未知物品') {
   const resolvedName = resolvePlayerFacingContentName(
    recordItemId,
    '未知物品',
    recordItemId === targetItemId ? activeJobName : undefined,
    contentTemplateRepository?.getItemName?.(recordItemId),
   );
   if (resolvedName !== '未知物品') {
    record.itemName = resolvedName;
    recordChanged = true;
   }
  }
 }
 if (recordChanged) {
  dirtyDomains.push('enhancement_record');
 }
 if (repairEnhancementQueueDisplayNames(player, contentTemplateRepository)) {
  dirtyDomains.push('active_job');
 }
 if (dirtyDomains.length === 0) {
  return false;
 }
 markPlayerDirtyDomains(player, dirtyDomains);
 return true;
}

export function repairEnhancementQueueDisplayNames(player, contentTemplateRepository) {
 const queue = Array.isArray(player?.techniqueActivityQueue) ? player.techniqueActivityQueue : [];
 const inventoryItems = Array.isArray(player?.inventory?.items) ? player.inventory.items : [];
 let changed = false;
 for (const entry of queue) {
  if (!entry || typeof entry !== 'object' || entry.kind !== 'enhancement') {
   continue;
  }
  const payload = entry.payload && typeof entry.payload === 'object' ? entry.payload : null;
  const targetRef = payload?.target && typeof payload.target === 'object' ? payload.target : null;
  const itemInstanceId = normalizeTechniqueActivityQueueText(targetRef?.itemInstanceId)
   || normalizeTechniqueActivityQueueText(targetRef?.expectedItemInstanceId);
  const inventoryItem = itemInstanceId
   ? inventoryItems.find((item) => item?.itemInstanceId === itemInstanceId)
   : null;
  const targetItemId = normalizeTechniqueActivityQueueText(inventoryItem?.itemId)
   || normalizeTechniqueActivityQueueText(payload?.targetItemId);
  const currentLabel = normalizeEnhancementQueueItemName(entry.label, targetItemId);
  const targetItemName = resolvePlayerFacingContentName(
   targetItemId,
   '未知物品',
   currentLabel,
   payload?.targetItemName,
   inventoryItem?.name,
   targetItemId ? contentTemplateRepository?.getItemName?.(targetItemId) : undefined,
  );
  if (targetItemName !== '未知物品' && entry.label !== targetItemName) {
   entry.label = targetItemName;
   changed = true;
  }
  if (payload && targetItemId && payload.targetItemId !== targetItemId) {
   payload.targetItemId = targetItemId;
   changed = true;
  }
  if (payload && targetItemName !== '未知物品' && payload.targetItemName !== targetItemName) {
   payload.targetItemName = targetItemName;
   changed = true;
  }
 }
 return changed;
}

export function normalizeEnhancementQueueItemName(value, itemId) {
 const normalized = normalizeTechniqueActivityQueueText(value);
 if (!normalized || normalized === '未知物品' || normalized === '强化任务' || normalized === itemId) {
  return undefined;
 }
 return normalized;
}
/**
 * normalizeAlchemyJob：规范化或转换炼丹Job。
 * @param value 参数说明。
 * @returns 无返回值，直接更新炼丹Job相关状态。
 */

export function normalizeAlchemyJob(value) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 if (!value || typeof value !== 'object' || typeof value.recipeId !== 'string') {
  return null;
 }
 return {
  ...value,
  jobType: value.jobType === 'forging' ? 'forging' : 'alchemy',
  recipeId: String(value.recipeId),
  outputItemId: typeof value.outputItemId === 'string' ? value.outputItemId : '',
  outputCount: Math.max(1, Math.floor(Number(value.outputCount) || 1)),
  quantity: Math.max(1, Math.floor(Number(value.quantity) || 1)),
  completedCount: Math.max(0, Math.floor(Number(value.completedCount) || 0)),
  successCount: Math.max(0, Math.floor(Number(value.successCount) || 0)),
  failureCount: Math.max(0, Math.floor(Number(value.failureCount) || 0)),
  ingredients: Array.isArray(value.ingredients)
   ? value.ingredients
    .filter((ingredient) => typeof ingredient?.itemId === 'string')
    .map((ingredient) => ({
     itemId: String(ingredient.itemId),
     count: Math.max(1, Math.floor(Number(ingredient.count) || 1)),
    }))
   : [],
  phase: value.phase === 'paused' ? value.phase : 'brewing',
  preparationTicks: 0,
  batchBrewTicks: Math.max(1, Math.floor(Number(value.batchBrewTicks) || 1)),
  currentBatchRemainingTicks: Math.max(0, Math.floor(Number(value.currentBatchRemainingTicks) || 0)),
  pausedTicks: Math.max(0, Math.floor(Number(value.pausedTicks) || 0)),
  spiritStoneCost: Math.max(0, Math.floor(Number(value.spiritStoneCost) || 0)),
  totalTicks: Math.max(1, Math.floor(Number(value.totalTicks) || 1)),
  remainingTicks: Math.max(0, Math.floor(Number(value.remainingTicks) || 0)),
  successRate: Math.max(0, Math.min(1, Number(value.successRate) || 0)),
  exactRecipe: value.exactRecipe === true,
  startedAt: Math.max(0, Math.floor(Number(value.startedAt) || 0)),
 };
}
/**
 * cloneAlchemyJob：构建炼丹Job。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新炼丹Job相关状态。
 */

export function cloneAlchemyJob(entry) {
 return {
  ...entry,
  ingredients: Array.isArray(entry.ingredients) ? entry.ingredients.map((ingredient) => ({ ...ingredient })) : [],
 };
}
/**
 * normalizeEnhancementJob：规范化或转换强化Job。
 * @param value 参数说明。
 * @returns 无返回值，直接更新强化Job相关状态。
 */

export function normalizeEnhancementJob(value) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 if (!value || typeof value !== 'object' || typeof value.targetItemId !== 'string') {
  return null;
 }
 return {
  ...value,
  target: value.target && typeof value.target === 'object' ? { ...value.target } : value.target,
  // 旧版兼容：若仍存在 value.item 字段，原样保留以便 hydrateFromSnapshot 完成迁移。
  // 新版 job 只通过 itemInstanceId 引用 inventory.lockedItems 中的物品。
  item: value.item && typeof value.item === 'object' ? { ...value.item } : value.item,
  itemInstanceId: typeof value.itemInstanceId === 'string' && value.itemInstanceId.length > 0
   ? value.itemInstanceId
   : undefined,
  targetItemId: String(value.targetItemId),
  targetItemName: typeof value.targetItemName === 'string' ? value.targetItemName : String(value.targetItemId),
  targetItemLevel: Math.max(1, Math.floor(Number(value.targetItemLevel) || 1)),
  currentLevel: Math.max(0, Math.floor(Number(value.currentLevel) || 0)),
  targetLevel: Math.max(1, Math.floor(Number(value.targetLevel) || 1)),
  desiredTargetLevel: Math.max(1, Math.floor(Number(value.desiredTargetLevel) || Number(value.targetLevel) || 1)),
  spiritStoneCost: Math.max(0, Math.floor(Number(value.spiritStoneCost) || 0)),
  materials: Array.isArray(value.materials) ? value.materials.map((entry) => ({ ...entry })) : [],
  protectionUsed: value.protectionUsed === true,
  protectionStartLevel: value.protectionStartLevel === undefined ? undefined : Math.max(2, Math.floor(Number(value.protectionStartLevel) || 2)),
  protectionItemId: typeof value.protectionItemId === 'string' ? value.protectionItemId : undefined,
  protectionItemName: typeof value.protectionItemName === 'string' ? value.protectionItemName : undefined,
  protectionItemSignature: typeof value.protectionItemSignature === 'string' ? value.protectionItemSignature : undefined,
  phase: value.phase === 'paused' ? 'paused' : 'enhancing',
  pausedTicks: Math.max(0, Math.floor(Number(value.pausedTicks) || 0)),
  successRate: Math.max(0, Math.min(1, Number(value.successRate) || 0)),
  totalTicks: Math.max(1, Math.floor(Number(value.totalTicks) || 1)),
  remainingTicks: Math.max(0, Math.floor(Number(value.remainingTicks) || 0)),
  startedAt: Math.max(0, Math.floor(Number(value.startedAt) || 0)),
  roleEnhancementLevel: Math.max(1, Math.floor(Number(value.roleEnhancementLevel) || 1)),
  totalSpeedRate: Number.isFinite(value.totalSpeedRate) ? Number(value.totalSpeedRate) : 0,
 };
}
/**
 * cloneEnhancementJob：构建强化Job。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新强化Job相关状态。
 */

export function cloneEnhancementJob(entry) {
 return {
  ...entry,
  target: entry.target && typeof entry.target === 'object' ? { ...entry.target } : entry.target,
  // 旧版字段：仅在迁移期可能仍出现，clone 时透传不强构造
  item: entry.item && typeof entry.item === 'object' ? { ...entry.item } : entry.item,
  materials: Array.isArray(entry.materials) ? entry.materials.map((material) => ({ ...material })) : [],
 };
}
/**
 * normalizeEnhancementRecords：规范化或转换强化Record。
 * @param value 参数说明。
 * @returns 无返回值，直接更新强化Record相关状态。
 */

export function normalizeEnhancementRecords(value) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 if (!Array.isArray(value)) {
  return [];
 }
 return value
  .filter((entry) => typeof entry?.itemId === 'string')
  .map((entry) => ({
   ...entry,
   itemId: String(entry.itemId),
   highestLevel: Math.max(0, Math.floor(Number(entry.highestLevel) || 0)),
   levels: Array.isArray(entry.levels)
    ? entry.levels.map((level) => ({
     targetLevel: Math.max(1, Math.floor(Number(level?.targetLevel) || 1)),
     successCount: Math.max(0, Math.floor(Number(level?.successCount) || 0)),
     failureCount: Math.max(0, Math.floor(Number(level?.failureCount) || 0)),
    }))
    : [],
   actionStartedAt: entry.actionStartedAt === undefined ? undefined : Math.max(0, Math.floor(Number(entry.actionStartedAt) || 0)),
   actionEndedAt: entry.actionEndedAt === undefined ? undefined : Math.max(0, Math.floor(Number(entry.actionEndedAt) || 0)),
   startLevel: entry.startLevel === undefined ? undefined : Math.max(0, Math.floor(Number(entry.startLevel) || 0)),
   initialTargetLevel: entry.initialTargetLevel === undefined ? undefined : Math.max(1, Math.floor(Number(entry.initialTargetLevel) || 1)),
   desiredTargetLevel: entry.desiredTargetLevel === undefined ? undefined : Math.max(1, Math.floor(Number(entry.desiredTargetLevel) || 1)),
   protectionStartLevel: entry.protectionStartLevel === undefined ? undefined : Math.max(2, Math.floor(Number(entry.protectionStartLevel) || 2)),
   status: entry.status,
  }));
}
/**
 * cloneEnhancementRecord：构建强化Record。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新强化Record相关状态。
 */

export function cloneEnhancementRecord(entry) {
 return {
  ...entry,
  levels: Array.isArray(entry.levels) ? entry.levels.map((level) => ({ ...level })) : [],
 };
}
/**
 * normalizeRealmState：规范化或转换Realm状态。
 * @param realm 参数说明。
 * @returns 无返回值，直接更新Realm状态相关状态。
 */

export function normalizeEquipmentSlotsWithTemplates(slots, contentTemplateRepository) {
 const slotItems = new Map(EQUIP_SLOTS.map((slot) => [slot, null]));
 if (Array.isArray(slots)) {
  for (const entry of slots) {
   const sourceSlot = typeof entry?.slot === 'string' ? entry.slot.trim() : '';
   if (!EQUIP_SLOTS.includes(sourceSlot)) {
    continue;
   }
   if (!entry?.item) {
    continue;
   }
   const item = contentTemplateRepository.normalizeItem(entry.item);
   const targetSlot = typeof item?.equipSlot === 'string' && EQUIP_SLOTS.includes(item.equipSlot)
    ? item.equipSlot
    : sourceSlot;
   if (!slotItems.get(targetSlot)) {
    slotItems.set(targetSlot, item);
    continue;
   }
   if (!slotItems.get(sourceSlot)) {
    slotItems.set(sourceSlot, item);
   }
  }
 }
 return EQUIP_SLOTS.map((slot) => ({
  slot,
  item: slotItems.get(slot) ?? null,
 }));
}

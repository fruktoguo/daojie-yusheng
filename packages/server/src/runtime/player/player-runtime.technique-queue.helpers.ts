/**
 * 玩家运行时游离模块函数集合 — 功法/技艺队列/消耗品冷却域。
 *
 * 从 player-runtime.helpers.ts 拆分而来，包含：
 * - 待定功法理解授权管理
 * - 持久化功法状态构建
 * - 技艺技能状态/传输/经验
 * - 采集/建造/采矿/阵法/传输 job 规范化与克隆
 * - 技艺活动队列规范化/克隆/迁移
 * - 消耗品冷却判定/标记/恢复/同步
 * - action 条目构建/冷却/比较
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
import { getPlayerPersistenceDomainRevision, markPlayerDirtyDomains, CONSUMABLE_COOLDOWN_BUFF_ID_PREFIX, CONSUMABLE_COOLDOWN_SOURCE_ID_PREFIX, normalizePlayerAutoBattleSkills, isSameAutoBattleSkillList } from './player-runtime.constants';
export function hasCurrentPendingTechniqueComprehensionEmptyOverwriteAuthorization(player) {
 const authorizationRevision = Math.max(
  0,
  Math.trunc(Number(player?.pendingTechniqueComprehensionEmptyOverwriteRevision) || 0),
 );
 return player?.allowPendingTechniqueComprehensionEmptyOverwrite === true
  && Array.isArray(player.pendingTechniqueComprehensions)
  && player.pendingTechniqueComprehensions.length === 0
  && ensurePendingTechniqueComprehensionEmptyOverwriteTechIds(player).size > 0
  && authorizationRevision > 0
  && authorizationRevision <= getPlayerPersistenceDomainRevision(player, 'technique');
}

export function buildPendingTechniqueComprehensionEmptyOverwriteAuthorization(player) {
 const allowed = hasCurrentPendingTechniqueComprehensionEmptyOverwriteAuthorization(player);
 return {
  allowPendingComprehensionEmptyOverwrite: allowed,
  pendingComprehensionEmptyOverwriteTechIds: allowed
   ? Array.from(ensurePendingTechniqueComprehensionEmptyOverwriteTechIds(player)).sort()
   : [],
 };
}

export function ensurePendingTechniqueComprehensionEmptyOverwriteTechIds(player) {
 if (!(player?.pendingTechniqueComprehensionEmptyOverwriteTechIds instanceof Set)) {
  player.pendingTechniqueComprehensionEmptyOverwriteTechIds = new Set();
 }
 return player.pendingTechniqueComprehensionEmptyOverwriteTechIds;
}

export function clearPendingTechniqueComprehensionEmptyOverwriteAuthorizationIfPersisted(player, domain, persistedRevision) {
 if (domain !== 'technique' || player?.allowPendingTechniqueComprehensionEmptyOverwrite !== true) {
  return;
 }
 const authorizationRevision = Math.max(
  0,
  Math.trunc(Number(player.pendingTechniqueComprehensionEmptyOverwriteRevision) || 0),
 );
 const normalizedPersistedRevision = Math.max(0, Math.trunc(Number(persistedRevision) || 0));
 if (authorizationRevision > 0 && normalizedPersistedRevision >= authorizationRevision) {
  player.allowPendingTechniqueComprehensionEmptyOverwrite = false;
  player.pendingTechniqueComprehensionEmptyOverwriteRevision = 0;
  ensurePendingTechniqueComprehensionEmptyOverwriteTechIds(player).clear();
 }
}

export function buildPersistedTechniqueState(entry) {
 const learnTechniqueMaxLevel = Number.isFinite(Number(entry.learnTechniqueMaxLevel))
  ? Math.max(1, Math.trunc(Number(entry.learnTechniqueMaxLevel)))
  : undefined;
 return {
  techId: entry.techId,
  level: entry.level,
  exp: entry.exp,
  expToNext: entry.expToNext,
  realmLv: entry.realmLv,
  realm: entry.realm ?? TechniqueRealm.Entry,
  skillsEnabled: entry.skillsEnabled !== false,
  name: entry.name,
  grade: entry.grade ?? null,
  category: entry.category ?? null,
  skills: Array.isArray(entry.skills) ? entry.skills : [],
  layers: Array.isArray(entry.layers) ? entry.layers : [],
  ...(learnTechniqueMaxLevel === undefined ? {} : { learnTechniqueMaxLevel }),
 };
}

export function createCraftSkillState(expToNext = DEFAULT_CRAFT_EXP_TO_NEXT) {
 return {
  level: 1,
  exp: 0,
  expToNext: Math.max(0, Math.floor(Number(expToNext) || DEFAULT_CRAFT_EXP_TO_NEXT)),
 };
}
/**
 * normalizeCraftSkillState：规范化或转换炼制技能状态。
 * @param value 参数说明。
 * @returns 无返回值，直接更新炼制技能状态相关状态。
 */

export function normalizeCraftSkillState(value, resolveExpToNext = null) {
 const level = Math.max(1, Math.floor(Number(value?.level) || 1));
 const expToNext = typeof resolveExpToNext === 'function'
  ? resolveExpToNext(level)
  : Math.max(0, Math.floor(Number(value?.expToNext) || DEFAULT_CRAFT_EXP_TO_NEXT));
 return {
  level,
  exp: Math.max(0, Math.floor(Number(value?.exp) || 0)),
  expToNext: Math.max(0, Math.floor(Number(expToNext) || 0)),
 };
}
/**
 * cloneCraftSkillState：构建炼制技能状态。
 * @param value 参数说明。
 * @returns 无返回值，直接更新炼制技能状态相关状态。
 */

export function cloneCraftSkillState(value) {
 return value ? { ...normalizeCraftSkillState(value) } : undefined;
}

export function applyTransmissionSkillExpFromTicks(player, elapsedTicks, targetLevel, getExpToNextByLevel) {
 const skill = player?.transmissionSkill;
 if (!skill) {
  return false;
 }
 const baseGain = computeCraftSkillExpGain({
  playerRealmLevel: resolvePlayerCraftRealmLevel(player),
  skillLevel: skill.level,
  targetLevel: Math.max(1, Math.floor(Number(targetLevel) || 1)),
  baseActionTicks: elapsedTicks,
  getExpToNextByLevel,
  successCount: 1,
  failureCount: 0,
  successMultiplier: 1,
 }).finalGain;
 const gain = applyPlayerCraftExpRate(player, 'transmission', baseGain);
 return applyCraftSkillExpLocal(skill, gain, getExpToNextByLevel);
}

export function applyCraftSkillExpLocal(skill, amount, getExpToNextByLevel) {
 if (!skill) {
  return false;
 }
 let changed = false;
 const resolvedExpToNext = Math.max(0, Math.floor(Number(getExpToNextByLevel(skill.level)) || 0));
 if (skill.expToNext !== resolvedExpToNext) {
  skill.expToNext = resolvedExpToNext;
  changed = true;
 }
 const gain = Math.max(0, Math.floor(Number(amount) || 0));
 if (gain <= 0) {
  return changed;
 }
 skill.exp += gain;
 while (skill.expToNext > 0 && skill.exp >= skill.expToNext) {
  skill.exp -= skill.expToNext;
  skill.level += 1;
  skill.expToNext = Math.max(0, Math.floor(Number(getExpToNextByLevel(skill.level)) || 0));
  changed = true;
 }
 return changed || gain > 0;
}

export function normalizeTechniqueTransmissionInterruptReason(reason) {
 return reason === 'move'
  || reason === 'attack'
  || reason === 'cancel'
  || reason === 'cultivate'
  || reason === 'defeat'
  ? reason
  : 'attack';
}

export function createTransmissionCompatPipeline(playerRuntimeService) {
 const pipeline = new TechniqueActivityPipelineService();
 pipeline.register(new TransmissionStrategy());
 return {
  pipeline,
  ctx: {
   contentTemplateRepository: {
    ...playerRuntimeService.contentTemplateRepository,
    getItemName: typeof playerRuntimeService.contentTemplateRepository?.getItemName === 'function'
     ? playerRuntimeService.contentTemplateRepository.getItemName.bind(playerRuntimeService.contentTemplateRepository)
     : () => null,
    normalizeItem: typeof playerRuntimeService.contentTemplateRepository?.normalizeItem === 'function'
     ? playerRuntimeService.contentTemplateRepository.normalizeItem.bind(playerRuntimeService.contentTemplateRepository)
     : (item) => item,
    createTechniqueState: typeof playerRuntimeService.contentTemplateRepository?.createTechniqueState === 'function'
     ? playerRuntimeService.contentTemplateRepository.createTechniqueState.bind(playerRuntimeService.contentTemplateRepository)
     : () => null,
    listTechniqueTemplates: typeof playerRuntimeService.contentTemplateRepository?.listTechniqueTemplates === 'function'
     ? playerRuntimeService.contentTemplateRepository.listTechniqueTemplates.bind(playerRuntimeService.contentTemplateRepository)
     : () => [],
    createItem: typeof playerRuntimeService.contentTemplateRepository?.createItem === 'function'
     ? playerRuntimeService.contentTemplateRepository.createItem.bind(playerRuntimeService.contentTemplateRepository)
     : () => null,
   },
   resolveExpToNextByLevel: (level) => resolveCraftSkillExpToNextByLevel(playerRuntimeService.playerProgressionService, level),
   getInstanceRuntime: () => null,
   playerRuntimeService,
   deps: { playerRuntimeService },
  },
 };
}

export function clonePendingTechniqueComprehensions(value) {
 if (!Array.isArray(value)) {
  return [];
 }
 return value
  .filter((entry) => entry && typeof entry === 'object' && typeof entry.techId === 'string' && entry.techId.trim())
  .map((entry) => ({
   ...entry,
   selfComprehensionAllowed: entry.selfComprehensionAllowed !== false,
   activeTransferJob: null,
  }));
}

export function resolvePendingSelfComprehensionAllowed(playerId, sourceKind, creatorPlayerId = null, existing = null) {
 if (sourceKind !== 'created') {
  return true;
 }
 const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
 const normalizedCreatorId = typeof creatorPlayerId === 'string' ? creatorPlayerId.trim() : '';
 if (normalizedCreatorId) {
  return normalizedCreatorId === normalizedPlayerId;
 }
 const existingCreatorId = typeof existing?.creatorPlayerId === 'string' ? existing.creatorPlayerId.trim() : '';
 if (existingCreatorId) {
  return existingCreatorId === normalizedPlayerId;
 }
 return false;
}

export function normalizeLegacyTransmissionJobFromPending(sourcePendingList, normalizedPendingList) {
 if (!Array.isArray(sourcePendingList)) {
  return null;
 }
 for (const source of sourcePendingList) {
  const transfer = source?.activeTransferJob;
  const techId = typeof source?.techId === 'string' && source.techId.trim() ? source.techId.trim() : '';
  if (!techId || !transfer || typeof transfer !== 'object') {
   continue;
  }
  const pending = Array.isArray(normalizedPendingList)
   ? normalizedPendingList.find((entry) => entry?.techId === techId)
   : null;
  const requiredProgress = Math.max(1, Math.floor(Number(pending?.requiredProgress ?? source.requiredProgress) || 1));
  const progress = Math.max(0, Number(pending?.progress ?? source.progress) || 0);
  const remaining = Math.max(0, Math.ceil(requiredProgress - Math.min(requiredProgress, progress)));
  const normalized = normalizeTransmissionJob({
   jobRunId: typeof transfer.jobId === 'string' && transfer.jobId.trim() ? transfer.jobId.trim() : undefined,
   jobType: 'transmission',
   jobVersion: 1,
   techniqueId: techId,
   techniqueName: resolvePlayerFacingContentName(techId, '未知功法', pending?.name, source.name),
   teacherPlayerId: transfer.teacherPlayerId,
   teacherName: transfer.teacherName,
   range: transfer.range ?? 2,
   realmLv: pending?.realmLv ?? source.realmLv ?? 1,
   grade: pending?.grade ?? source.grade,
   category: pending?.category ?? source.category,
   status: transfer.status,
   blockedReason: transfer.blockedReason,
   phase: Number(transfer.interruptWaitRemainingTicks ?? transfer.interruptState?.waitRemainingTicks ?? 0) > 0
    ? 'paused'
    : 'transmitting',
   startedAt: transfer.startedAtTick ?? 0,
   totalTicks: requiredProgress,
   remainingTicks: remaining,
   workTotalTicks: requiredProgress,
   workRemainingTicks: remaining,
   pausedTicks: transfer.interruptWaitRemainingTicks ?? transfer.interruptState?.waitRemainingTicks ?? 0,
   interruptWaitRemainingTicks: transfer.interruptWaitRemainingTicks,
   interruptState: transfer.interruptState ?? null,
   successRate: 1,
   spiritStoneCost: 0,
  });
  if (normalized && Number(normalized.remainingTicks) > 0) {
   return normalized;
  }
 }
 return null;
}
export function isPlayerInTransmissionRange(teacher, learner) {
 if (!teacher || !learner || teacher.instanceId !== learner.instanceId) {
  return false;
 }
 const dx = Math.abs(Math.floor(Number(teacher.x) || 0) - Math.floor(Number(learner.x) || 0));
 const dy = Math.abs(Math.floor(Number(teacher.y) || 0) - Math.floor(Number(learner.y) || 0));
 return Math.max(dx, dy) <= 2;
}
/**
 * normalizeAlchemyPresets：规范化或转换炼丹Preset。
 * @param value 参数说明。
 * @returns 无返回值，直接更新炼丹Preset相关状态。
 */

export function normalizeAlchemyPresets(value) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 if (!Array.isArray(value)) {
  return [];
 }
 return value
  .filter((entry) => typeof entry?.presetId === 'string' && typeof entry?.recipeId === 'string')
  .map((entry) => ({
   presetId: String(entry.presetId),
   recipeId: String(entry.recipeId),
   name: resolvePlayerFacingContentName(entry.recipeId, '未命名炼制预设', entry.name),
   ingredients: Array.isArray(entry.ingredients)
    ? entry.ingredients
     .filter((ingredient) => typeof ingredient?.itemId === 'string')
     .map((ingredient) => ({
      itemId: String(ingredient.itemId),
      count: Math.max(1, Math.floor(Number(ingredient.count) || 1)),
     }))
    : [],
   updatedAt: Math.max(0, Math.floor(Number(entry.updatedAt) || 0)),
  }));
}
/**
 * cloneAlchemyPreset：构建炼丹Preset。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新炼丹Preset相关状态。
 */

export function cloneAlchemyPreset(entry) {
 return {
  ...entry,
  ingredients: Array.isArray(entry.ingredients) ? entry.ingredients.map((ingredient) => ({ ...ingredient })) : [],
 };
}
/**
 * normalizeGatherJob：规范化或转换采集 Job。
 * @param value 参数说明。
 * @returns 无返回值，直接更新采集 Job 相关状态。
 */

export function normalizeGatherJob(value) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 if (!value || typeof value !== 'object' || typeof value.resourceNodeId !== 'string') {
  return null;
 }
 const totalTicks = Math.max(1, Math.floor(Number(value.totalTicks) || 1));
 const remainingTicks = Math.max(0, Math.floor(Number(value.remainingTicks) || 0));
 const workTotalTicks = Math.max(1, Math.floor(Number(value.workTotalTicks ?? totalTicks) || totalTicks));
 const workRemainingTicks = Math.max(0, Math.floor(Number(value.workRemainingTicks ?? remainingTicks) || remainingTicks));
 return {
  jobRunId: typeof value.jobRunId === 'string' && value.jobRunId.trim() ? value.jobRunId.trim() : undefined,
  jobType: 'gather',
  jobVersion: Math.max(1, Math.floor(Number(value.jobVersion) || 1)),
  resourceNodeId: String(value.resourceNodeId),
  resourceNodeName: typeof value.resourceNodeName === 'string' ? value.resourceNodeName : String(value.resourceNodeId),
  sourceId: typeof value.sourceId === 'string' && value.sourceId.trim() ? value.sourceId.trim() : undefined,
  instanceId: typeof value.instanceId === 'string' && value.instanceId.trim() ? value.instanceId.trim() : undefined,
  itemKey: typeof value.itemKey === 'string' && value.itemKey.trim() ? value.itemKey.trim() : undefined,
  phase: value.phase === 'paused' ? 'paused' : 'gathering',
  startedAt: Math.max(0, Math.floor(Number(value.startedAt) || 0)),
  totalTicks,
  remainingTicks,
  workTotalTicks,
  workRemainingTicks,
  interruptWaitRemainingTicks: Math.max(0, Math.floor(Number(value.interruptWaitRemainingTicks) || 0)),
  interruptState: value.interruptState && typeof value.interruptState === 'object'
   ? { ...value.interruptState }
   : null,
  pausedTicks: Math.max(0, Math.floor(Number(value.pausedTicks) || 0)),
  successRate: Math.max(0, Math.min(1, Number(value.successRate) || 0)),
  spiritStoneCost: Math.max(0, Math.floor(Number(value.spiritStoneCost) || 0)),
 };
}
/**
 * normalizeBuildingJob：规范化或转换营造 Job。
 * @param value 参数说明。
 * @returns 无返回值，直接更新营造 Job 相关状态。
 */

export function normalizeBuildingJob(value) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 if (!value || typeof value !== 'object' || typeof value.buildingId !== 'string') {
  return null;
 }
 const totalTicks = Math.max(1, Math.floor(Number(value.totalTicks) || 1));
 const remainingTicks = Math.max(0, Math.floor(Number(value.remainingTicks) || 0));
 const workTotalTicks = Math.max(1, Math.floor(Number(value.workTotalTicks ?? totalTicks) || totalTicks));
 const workRemainingTicks = Math.max(0, Math.floor(Number(value.workRemainingTicks ?? remainingTicks) || remainingTicks));
 return {
  jobRunId: typeof value.jobRunId === 'string' && value.jobRunId.trim() ? value.jobRunId.trim() : undefined,
  jobType: 'building',
  jobVersion: Math.max(1, Math.floor(Number(value.jobVersion) || 1)),
  buildingId: String(value.buildingId),
  buildingName: typeof value.buildingName === 'string' ? value.buildingName : String(value.buildingId),
  label: typeof value.label === 'string' && value.label.trim() ? value.label.trim() : undefined,
  instanceId: typeof value.instanceId === 'string' ? value.instanceId : '',
  operation: value.operation === 'deconstruct' ? 'deconstruct' : 'construct',
  phase: value.phase === 'paused'
   ? 'paused'
   : value.operation === 'deconstruct' || value.phase === 'deconstructing'
    ? 'deconstructing'
    : 'building',
  startedAt: Math.max(0, Math.floor(Number(value.startedAt) || 0)),
  totalTicks,
  remainingTicks,
  workTotalTicks,
  workRemainingTicks,
  interruptWaitRemainingTicks: Math.max(0, Math.floor(Number(value.interruptWaitRemainingTicks) || 0)),
  interruptState: value.interruptState && typeof value.interruptState === 'object'
   ? { ...value.interruptState }
   : null,
  pausedTicks: Math.max(0, Math.floor(Number(value.pausedTicks) || 0)),
  successRate: Math.max(0, Math.min(1, Number(value.successRate) || 0)),
  spiritStoneCost: Math.max(0, Math.floor(Number(value.spiritStoneCost) || 0)),
 };
}
/**
 * normalizeMiningJob：规范化或转换挖矿 Job。
 * @param value 参数说明。
 * @returns 无返回值，直接更新挖矿 Job 相关状态。
 */

export function normalizeMiningJob(value) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 if (!value || typeof value !== 'object' || typeof value.miningNodeId !== 'string') {
  return null;
 }
 return {
  jobRunId: typeof value.jobRunId === 'string' ? value.jobRunId : undefined,
  jobType: 'mining',
  miningNodeId: String(value.miningNodeId),
  miningNodeName: typeof value.miningNodeName === 'string' ? value.miningNodeName : String(value.miningNodeId),
  instanceId: typeof value.instanceId === 'string' ? value.instanceId : '',
  targetX: Math.trunc(Number(value.targetX) || 0),
  targetY: Math.trunc(Number(value.targetY) || 0),
  tileType: typeof value.tileType === 'string' ? value.tileType : '',
  baseDamagePerTick: Math.max(1, Math.floor(Number(value.baseDamagePerTick) || 1)),
  phase: value.phase === 'paused' ? 'paused' : 'mining',
  startedAt: Math.max(0, Math.floor(Number(value.startedAt) || 0)),
  totalTicks: Math.max(1, Math.floor(Number(value.totalTicks) || 1)),
  remainingTicks: Math.max(0, Math.floor(Number(value.remainingTicks) || 0)),
  workTotalTicks: Math.max(1, Math.floor(Number(value.workTotalTicks ?? value.totalTicks) || 1)),
  workRemainingTicks: Math.max(0, Math.floor(Number(value.workRemainingTicks ?? value.remainingTicks) || 0)),
  pausedTicks: Math.max(0, Math.floor(Number(value.pausedTicks) || 0)),
  interruptWaitRemainingTicks: Math.max(0, Math.floor(Number(value.interruptWaitRemainingTicks ?? value.pausedTicks) || 0)),
  interruptState: value.interruptState && typeof value.interruptState === 'object' ? { ...value.interruptState } : null,
  successRate: Math.max(0, Math.min(1, Number(value.successRate) || 1)),
  spiritStoneCost: Math.max(0, Math.floor(Number(value.spiritStoneCost) || 0)),
  jobVersion: Math.max(1, Math.floor(Number(value.jobVersion) || 1)),
 };
}
/**
 * normalizeFormationJob：规范化或转换阵法维护 Job。
 * @param value 参数说明。
 * @returns 无返回值，直接更新阵法维护 Job 相关状态。
 */

export function normalizeFormationJob(value) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 if (!value || typeof value !== 'object' || typeof value.formationInstanceId !== 'string') {
  return null;
 }
 return {
  jobRunId: typeof value.jobRunId === 'string' ? value.jobRunId : undefined,
  jobType: 'formation',
  formationInstanceId: String(value.formationInstanceId),
  formationName: typeof value.formationName === 'string' ? value.formationName : String(value.formationInstanceId),
  instanceId: typeof value.instanceId === 'string' ? value.instanceId : '',
  controlInstanceId: typeof value.controlInstanceId === 'string' ? value.controlInstanceId : (typeof value.instanceId === 'string' ? value.instanceId : ''),
  controlX: Math.trunc(Number(value.controlX) || 0),
  controlY: Math.trunc(Number(value.controlY) || 0),
  phase: value.phase === 'paused' ? 'paused' : 'maintaining',
  startedAt: Math.max(0, Math.floor(Number(value.startedAt) || 0)),
  totalTicks: Math.max(1, Math.floor(Number(value.totalTicks) || 1)),
  remainingTicks: Math.max(0, Math.floor(Number(value.remainingTicks) || 0)),
  pausedTicks: Math.max(0, Math.floor(Number(value.pausedTicks) || 0)),
  successRate: Math.max(0, Math.min(1, Number(value.successRate) || 1)),
  spiritStoneCost: Math.max(0, Math.floor(Number(value.spiritStoneCost) || 0)),
  maintenanceRate: Math.max(1, Math.floor(Number(value.maintenanceRate) || 1)),
  jobVersion: Math.max(1, Math.floor(Number(value.jobVersion) || 1)),
 };
}
/**
 * normalizeTransmissionJob：规范化传法 Job。
 * @param value 参数说明。
 * @returns 规范化后的传法 Job。
 */

export function normalizeTransmissionJob(value) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 if (!value || typeof value !== 'object' || typeof value.techniqueId !== 'string') {
  return null;
 }
 const techniqueId = String(value.techniqueId).trim();
 const teacherPlayerId = typeof value.teacherPlayerId === 'string' ? value.teacherPlayerId.trim() : '';
 if (!techniqueId || !teacherPlayerId) {
  return null;
 }
 const totalTicks = Math.max(1, Math.floor(Number(value.totalTicks ?? value.workTotalTicks) || 1));
 const remainingTicks = Math.max(0, Math.floor(Number(value.remainingTicks ?? value.workRemainingTicks) || 0));
 const workTotalTicks = Math.max(1, Math.floor(Number(value.workTotalTicks ?? totalTicks) || totalTicks));
 const workRemainingTicks = Math.max(0, Math.floor(Number(value.workRemainingTicks ?? remainingTicks) || remainingTicks));
 const rawJobType = typeof value.jobType === 'string' ? value.jobType.trim() : '';
 const jobType = rawJobType === 'scripture_recording' || rawJobType === 'scripture_contemplation'
  ? rawJobType
  : 'transmission';
 return {
  ...value,
  jobRunId: typeof value.jobRunId === 'string' && value.jobRunId.trim() ? value.jobRunId.trim() : undefined,
  jobType,
  jobVersion: Math.max(1, Math.floor(Number(value.jobVersion) || 1)),
  techniqueId,
  techniqueName: typeof value.techniqueName === 'string' && value.techniqueName.trim() ? value.techniqueName.trim() : techniqueId,
  teacherPlayerId,
  teacherName: typeof value.teacherName === 'string' && value.teacherName.trim() ? value.teacherName.trim() : undefined,
  range: Math.max(1, Math.floor(Number(value.range) || 2)),
  realmLv: Math.max(1, Math.floor(Number(value.realmLv) || 1)),
  status: value.status === 'blocked' ? 'blocked' : 'running',
  blockedReason: value.blockedReason === 'teacher_out_of_range'
   || value.blockedReason === 'teacher_technique_not_perfected'
   || value.blockedReason === 'not_created_technique'
   || value.blockedReason === 'technique_aggregation_platform_required'
   || value.blockedReason === 'scripture_platform_unavailable'
   || value.blockedReason === 'scripture_platform_out_of_range'
   || value.blockedReason === 'scripture_recording_locked'
   ? value.blockedReason
   : undefined,
  phase: value.phase === 'paused' ? 'paused' : 'transmitting',
  startedAt: Math.max(0, Math.floor(Number(value.startedAt) || 0)),
  totalTicks,
  remainingTicks,
  workTotalTicks,
  workRemainingTicks,
  pausedTicks: Math.max(0, Math.floor(Number(value.pausedTicks) || 0)),
  interruptWaitRemainingTicks: Math.max(0, Math.floor(Number(value.interruptWaitRemainingTicks ?? value.pausedTicks) || 0)),
  interruptState: value.interruptState && typeof value.interruptState === 'object' ? { ...value.interruptState } : null,
  successRate: Math.max(0, Math.min(1, Number(value.successRate) || 1)),
  spiritStoneCost: Math.max(0, Math.floor(Number(value.spiritStoneCost) || 0)),
 };
}
/**
 * cloneGatherJob：构建采集 Job。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新采集 Job 相关状态。
 */

export function cloneGatherJob(entry) {
 return {
  ...entry,
 };
}
/**
 * cloneBuildingJob：构建营造 Job。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新营造 Job 相关状态。
 */

export function cloneBuildingJob(entry) {
 return {
  ...entry,
  interruptState: entry?.interruptState && typeof entry.interruptState === 'object'
   ? { ...entry.interruptState }
   : entry?.interruptState ?? null,
 };
}
/**
 * cloneMiningJob：构建挖矿 Job。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新挖矿 Job 相关状态。
 */

export function cloneMiningJob(entry) {
 return {
  ...entry,
  interruptState: entry?.interruptState && typeof entry.interruptState === 'object'
   ? { ...entry.interruptState }
   : entry?.interruptState ?? null,
 };
}
/**
 * cloneFormationJob：构建阵法维护 Job。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新阵法维护 Job 相关状态。
 */

export function cloneFormationJob(entry) {
 return {
  ...entry,
 };
}

export function cloneTransmissionJob(entry) {
 return {
  ...entry,
  interruptState: entry?.interruptState && typeof entry.interruptState === 'object'
   ? { ...entry.interruptState }
   : entry?.interruptState ?? null,
 };
}

export function normalizeTechniqueActivityKind(value) {
 return value === 'forging'
  || value === 'enhancement'
  || value === 'gather'
  || value === 'building'
  || value === 'mining'
  || value === 'transmission'
  || value === 'formation'
  ? value
  : 'alchemy';
}

export function normalizeTechniqueActivityQueueText(value) {
 return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function cloneTechniqueActivityQueuePayload(value) {
 if (!value || typeof value !== 'object') {
  return value;
 }
 return structuredClone(value);
}

export function normalizeTechniqueActivityQueue(value) {
 if (!Array.isArray(value)) {
  return [];
 }
 const queue = [];
 for (const entry of value) {
  if (!entry || typeof entry !== 'object') {
   continue;
  }
  const kind = normalizeTechniqueActivityKind(entry.kind);
  const createdAt = Math.max(1, Math.trunc(Number(entry.createdAt ?? Date.now()) || Date.now()));
  const queueId = normalizeTechniqueActivityQueueText(entry.queueId)
   || `technique-queue:${kind}:${createdAt}:${queue.length}`;
  const item = {
   queueId,
   kind,
   payload: cloneTechniqueActivityQueuePayload(entry.payload),
   label: normalizeTechniqueActivityQueueText(entry.label) || (kind === 'forging'
    ? '炼器任务'
    : kind === 'enhancement'
     ? '强化任务'
     : kind === 'gather'
      ? '采集任务'
      : kind === 'building'
       ? '营造任务'
       : kind === 'mining'
        ? '挖矿任务'
        : kind === 'formation'
         ? '阵法任务'
         : '炼丹任务'),
   state: entry.state === 'sleeping' ? 'sleeping' : 'pending',
   createdAt,
   cancelRef: {
    kind,
    queueId,
   },
   targetLabel: undefined,
   sleepReason: undefined,
   sleepingSince: undefined,
   retryAfterTicks: undefined,
  };
  const targetLabel = normalizeTechniqueActivityQueueText(entry.targetLabel);
  if (targetLabel) {
   item.targetLabel = targetLabel;
  }
  const sleepReason = normalizeTechniqueActivityQueueText(entry.sleepReason);
  if (sleepReason) {
   item.sleepReason = sleepReason;
  }
  if (Number.isFinite(Number(entry.sleepingSince))) {
   item.sleepingSince = Math.max(0, Math.trunc(Number(entry.sleepingSince)));
  }
  if (Number.isFinite(Number(entry.retryAfterTicks))) {
   item.retryAfterTicks = Math.max(0, Math.trunc(Number(entry.retryAfterTicks)));
  }
  queue.push(item);
 }
 return queue;
}

export function cloneTechniqueActivityQueue(value) {
 return normalizeTechniqueActivityQueue(value);
}

export function migrateLegacyCraftQueuedJobsToTechniqueActivityQueue(player) {
 if (!player || typeof player !== 'object') {
  return false;
 }
 const currentQueue = normalizeTechniqueActivityQueue(player.techniqueActivityQueue);
 const seen = new Set(currentQueue.map((entry) => entry.queueId));
 let changed = currentQueue.length !== (Array.isArray(player.techniqueActivityQueue) ? player.techniqueActivityQueue.length : 0);
 for (const job of [player.alchemyJob, player.forgingJob, player.enhancementJob]) {
  if (!job || typeof job !== 'object' || !Array.isArray(job.queuedJobs)) {
   continue;
  }
  const legacyQueue = normalizeTechniqueActivityQueue(job.queuedJobs);
  for (const item of legacyQueue) {
   if (currentQueue.length >= TECHNIQUE_ACTIVITY_QUEUE_MAX_LENGTH) {
    break;
   }
   if (seen.has(item.queueId)) {
    continue;
   }
   currentQueue.push(item);
   seen.add(item.queueId);
   changed = true;
  }
  delete job.queuedJobs;
  changed = true;
 }
 if (changed) {
  player.techniqueActivityQueue = currentQueue.slice(0, TECHNIQUE_ACTIVITY_QUEUE_MAX_LENGTH);
 }
 return changed;
}

export function assertConsumableItemCooldownReady(player, item, currentTick) {
 const cooldownLeft = getConsumableItemCooldownRemainingTicks(player, item, currentTick);
 syncConsumableInventoryCooldownProjection(player, currentTick);
 if (cooldownLeft > 0) {
  throw new BadRequestException(`${resolvePlayerFacingContentName(item?.itemId, '未知物品', item?.name)}冷却中，还需 ${cooldownLeft} 息。`);
 }
}

export function markConsumableItemCooldown(player, item, currentTick) {
 const cooldown = resolveConsumableItemCooldownTicks(item);
 const groups = resolveConsumableItemCooldownGroups(item);
 if (cooldown <= 0 || groups.length === 0) {
  syncConsumableInventoryCooldownProjection(player, currentTick);
  return;
 }
 const state = ensureConsumableCooldownState(player);
 const startedAtTick = Math.max(0, Math.trunc(Number(currentTick) || 0));
 let persistentCooldownChanged = false;
 for (const group of groups) {
  state[group] = startedAtTick;
  persistentCooldownChanged = upsertPersistentConsumableCooldownBuff(player, group, cooldown)
   || persistentCooldownChanged;
 }
 if (persistentCooldownChanged) {
  player.buffs.buffs.sort((left, right) => String(left?.buffId ?? '').localeCompare(String(right?.buffId ?? ''), 'zh-Hans-CN'));
  player.buffs.revision += 1;
  markPlayerDirtyDomains(player, ['buff']);
 }
 syncConsumableInventoryCooldownProjection(player, startedAtTick);
}

export function upsertPersistentConsumableCooldownBuff(player, group, cooldown) {
 const normalizedGroup = normalizeConsumableCooldownGroup(group);
 const normalizedCooldown = Math.max(1, Math.trunc(Number(cooldown) || 0));
 if (!normalizedGroup || !player?.buffs || !Array.isArray(player.buffs.buffs)) {
  return false;
 }
 const persistentBuff = buildPersistentConsumableCooldownBuff(normalizedGroup, normalizedCooldown);
 const buffId = persistentBuff.buffId;
 const existing = player.buffs.buffs.find((entry) => entry?.buffId === buffId);
 if (existing) {
  refreshRuntimeTemporaryBuffPrototype(existing, persistentBuff);
  existing.remainingTicks = persistentBuff.remainingTicks;
  existing.duration = persistentBuff.duration;
  existing.stacks = persistentBuff.stacks;
  existing.maxStacks = persistentBuff.maxStacks;
  existing.infiniteDuration = persistentBuff.infiniteDuration;
  existing.persistOnDeath = persistentBuff.persistOnDeath;
  existing.persistOnReturnToSpawn = persistentBuff.persistOnReturnToSpawn;
  delete existing.sustainTicksElapsed;
  return true;
 }
 player.buffs.buffs.push(createRuntimeTemporaryBuff(persistentBuff));
 return true;
}

export function buildPersistentConsumableCooldownBuff(group, cooldown) {
 return {
  buffId: `${CONSUMABLE_COOLDOWN_BUFF_ID_PREFIX}${group}`,
  name: '消耗品冷却',
  desc: '服务端内部持久化的消耗品共享冷却。',
  shortMark: '冷',
  category: 'buff',
  visibility: 'hidden',
  remainingTicks: cooldown + 1,
  duration: cooldown,
  stacks: 1,
  maxStacks: 1,
  sourceSkillId: `${CONSUMABLE_COOLDOWN_SOURCE_ID_PREFIX}${group}`,
  sourceSkillName: '消耗品冷却',
  realmLv: 1,
  infiniteDuration: false,
  persistOnDeath: true,
  persistOnReturnToSpawn: true,
 };
}

export function restoreConsumableCooldownStateFromPersistentBuffs(player) {
 if (!player?.inventory) {
  return;
 }
 const state = ensureConsumableCooldownState(player);
 for (const key of Object.keys(state)) {
  delete state[key];
 }
 const currentTick = Math.max(0, Math.trunc(Number(player.lifeElapsedTicks) || 0));
 for (const buff of Array.isArray(player.buffs?.buffs) ? player.buffs.buffs : []) {
  const group = resolveConsumableCooldownBuffGroup(buff);
  const duration = Math.max(0, Math.trunc(Number(buff?.duration) || 0));
  const remainingTicks = Math.max(0, Math.trunc(Number(buff?.remainingTicks) || 0));
  if (!group || duration <= 0 || remainingTicks <= 0) {
   continue;
  }
  const elapsedTicks = Math.max(0, duration + 1 - Math.min(remainingTicks, duration + 1));
  if (elapsedTicks >= duration) {
   continue;
  }
  const startedAtTick = Math.max(0, currentTick - elapsedTicks);
  const previousStartedAtTick = Number(state[group]);
  if (!Number.isFinite(previousStartedAtTick) || startedAtTick > previousStartedAtTick) {
   state[group] = startedAtTick;
  }
 }
 syncConsumableInventoryCooldownProjection(player, currentTick);
}

export function resolveConsumableCooldownBuffGroup(buff) {
 const buffId = typeof buff?.buffId === 'string' ? buff.buffId.trim() : '';
 if (!buffId.startsWith(CONSUMABLE_COOLDOWN_BUFF_ID_PREFIX)) {
  return null;
 }
 const group = normalizeConsumableCooldownGroup(buffId.slice(CONSUMABLE_COOLDOWN_BUFF_ID_PREFIX.length));
 if (!group || buff?.sourceSkillId !== `${CONSUMABLE_COOLDOWN_SOURCE_ID_PREFIX}${group}`) {
  return null;
 }
 return group;
}

export function normalizeConsumableCooldownGroup(value) {
 return value === 'hp' || value === 'qi' ? value : null;
}

export function getConsumableItemCooldownRemainingTicks(player, item, currentTick) {
 const cooldown = resolveConsumableItemCooldownTicks(item);
 if (cooldown <= 0) {
  return 0;
 }
 const groups = resolveConsumableItemCooldownGroups(item);
 if (groups.length === 0) {
  return 0;
 }
 const state = getConsumableCooldownState(player);
 if (!state) {
  return 0;
 }
 const normalizedCurrentTick = Math.max(0, Math.trunc(Number(currentTick) || 0));
 let maxRemaining = 0;
 for (const group of groups) {
  const startedAtTick = state[group];
  if (!Number.isFinite(Number(startedAtTick)) || Number(startedAtTick) < 0) {
   continue;
  }
  const elapsed = Math.max(0, normalizedCurrentTick - Math.max(0, Math.trunc(Number(startedAtTick) || 0)));
  const remaining = Math.max(0, cooldown - elapsed);
  if (remaining > 0) {
   maxRemaining = Math.max(maxRemaining, remaining);
   continue;
  }
  delete state[group];
 }
 return maxRemaining;
}

export function syncConsumableInventoryCooldownProjection(player, currentTick) {
 const inventory = player?.inventory;
 if (!inventory) {
  return;
 }
 const state = getConsumableCooldownState(player);
 const normalizedCurrentTick = Math.max(0, Math.trunc(Number(currentTick) || 0));
 inventory.serverTick = normalizedCurrentTick;
 if (!state) {
  inventory.cooldowns = [];
  return;
 }
 const cooldownsByItemId = new Map();
 for (const item of Array.isArray(inventory.items) ? inventory.items : []) {
  if (!item?.itemId || cooldownsByItemId.has(item.itemId)) {
   continue;
  }
  const cooldown = resolveConsumableItemCooldownTicks(item);
  const groups = resolveConsumableItemCooldownGroups(item);
  if (cooldown <= 0 || groups.length === 0) {
   continue;
  }
  let selectedStartedAtTick = null;
  let maxRemaining = 0;
  for (const group of groups) {
   const startedAtTick = state[group];
   if (!Number.isFinite(Number(startedAtTick)) || Number(startedAtTick) < 0) {
    continue;
   }
   const normalizedStartedAtTick = Math.max(0, Math.trunc(Number(startedAtTick) || 0));
   const remaining = Math.max(0, cooldown - Math.max(0, normalizedCurrentTick - normalizedStartedAtTick));
   if (remaining > maxRemaining) {
    maxRemaining = remaining;
    selectedStartedAtTick = normalizedStartedAtTick;
   }
   if (remaining <= 0) {
    delete state[group];
   }
  }
  if (maxRemaining > 0 && selectedStartedAtTick !== null) {
   cooldownsByItemId.set(item.itemId, {
    itemId: item.itemId,
    cooldown,
    startedAtTick: selectedStartedAtTick,
   });
  }
 }
 inventory.cooldowns = Array.from(cooldownsByItemId.values())
  .sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-Hans-CN'));
}

export function resolveConsumableItemCooldownTicks(item) {
 if (!item) {
  return 0;
 }
 const hasCooldownEffect = hasConsumableRecoveryCooldownEffect(item);
 if (!hasCooldownEffect) {
  return 0;
 }
 if (Number.isFinite(Number(item.cooldown)) && Number(item.cooldown) > 0) {
  return Math.max(1, Math.trunc(Number(item.cooldown)));
 }
 return hasCooldownEffect ? DEFAULT_INSTANT_CONSUMABLE_COOLDOWN_TICKS : 0;
}

export function resolveConsumableItemCooldownGroups(item) {
 if (!item) {
  return [];
 }
 const groups = [];
 if (hasHpConsumableEffect(item)) {
  groups.push('hp');
 }
 if (hasQiConsumableEffect(item)) {
  groups.push('qi');
 }
 return groups;
}

export function hasInstantConsumableEffect(item) {
 return hasHpConsumableEffect(item) || hasQiConsumableEffect(item);
}

export function hasConsumableRecoveryCooldownEffect(item) {
 return hasInstantConsumableEffect(item);
}

export function hasHpConsumableEffect(item) {
 return Math.max(0, Number(item?.healAmount ?? 0)) > 0
  || Math.max(0, Number(item?.healPercent ?? 0)) > 0
  || Math.max(0, Number(item?.baselineHealPercent ?? 0)) > 0;
}

export function hasQiConsumableEffect(item) {
 return Math.max(0, Number(item?.baselineQiPercent ?? 0)) > 0
  || Math.max(0, Number(item?.qiPercent ?? 0)) > 0;
}

export function getConsumableCooldownState(player) {
 const state = player?.inventory?.consumableCooldownStartedAtByGroup;
 return state && typeof state === 'object' ? state : null;
}

export function ensureConsumableCooldownState(player) {
 if (!player.inventory.consumableCooldownStartedAtByGroup || typeof player.inventory.consumableCooldownStartedAtByGroup !== 'object') {
  player.inventory.consumableCooldownStartedAtByGroup = {};
 }
 return player.inventory.consumableCooldownStartedAtByGroup;
}
/**
* normalizeLifespanYears：规范化或转换LifespanYear。
* @param value 参数说明。
* @returns 无返回值，直接更新LifespanYear相关状态。
*/

export function toTechniqueUpdateEntry(technique) {
 return {
  techId: technique.techId,
  level: technique.level,
  exp: technique.exp,
  expToNext: technique.expToNext,
  realmLv: technique.realmLv,
  strengthPercent: normalizeTechniqueStrengthPercent(technique.strengthPercent),
  realm: technique.realm ?? TechniqueRealm.Entry,

  skillsEnabled: technique.skillsEnabled !== false,
  name: technique.name,
  grade: technique.grade ?? null,
  category: technique.category ?? null,
  // skills/layers 直接引用模板，运行时只读共享，不在 update 投影里克隆。
  skills: technique.skills,
  layers: technique.layers ?? null,
 };
}

export function resolveTechniqueBookMaxLevel(input, technique) {
 const maxLevel = Number.isFinite(Number(input)) ? Math.max(1, Math.trunc(Number(input))) : undefined;
 if (maxLevel === undefined) {
  return undefined;
 }
 return Math.min(maxLevel, getTechniqueMaxLevel(Array.isArray(technique?.layers) ? technique.layers : undefined, maxLevel));
}
/**
 * buildActionEntries：构建并返回目标对象。
 * @param player 玩家对象。
 * @param currentTick 参数说明。
 * @returns 无返回值，直接更新Action条目相关状态。
 */

export function buildActionEntries(player, currentTick) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 const actions = [];
 const previousById = new Map((player.actions.actions ?? []).map((entry) => [entry.id, entry]));
 let changed = false;

 const autoBattleSkills: any[] = normalizePlayerAutoBattleSkills(player, player.combat.autoBattleSkills);
 const autoBattleSkillById = new Map();
 for (let index = 0; index < autoBattleSkills.length; index += 1) {
  const entry = autoBattleSkills[index];
  autoBattleSkillById.set(entry.skillId, { entry, order: index });
 }
 for (const technique of player.techniques.techniques) {
  for (const skill of technique.skills ?? []) {
   const unlockLevel = typeof skill.unlockLevel === 'number' ? skill.unlockLevel : 1;
   if ((technique.level ?? 1) < unlockLevel) {
    continue;
   }

   const normalizedReadyTick = normalizeActionCooldownReadyTick(
    player,
    skill.id,
    currentTick,
    resolvePlayerSkillActionCooldownTicks(player, skill),
   );
   const autoBattleSkill = autoBattleSkillById.get(skill.id);
   const nextAction = reuseActionEntry(previousById.get(skill.id), {
    id: skill.id,
    name: skill.name,
    type: 'skill',
    desc: skill.desc,
    cooldownLeft: Math.max(0, normalizedReadyTick - currentTick),
    cooldownReadyTick: normalizedReadyTick > currentTick ? normalizedReadyTick : undefined,
    range: skill.targeting?.range ?? skill.range,
    requiresTarget: resolveSkillRequiresTarget(skill),
    autoBattleEnabled: skill.active === false ? false : (autoBattleSkill?.entry?.enabled ?? true),
    autoBattleOrder: autoBattleSkill?.order,
    skillEnabled: autoBattleSkill?.entry?.skillEnabled !== false,
    passiveOnly: skill.active === false ? true : undefined,
   });
   if (nextAction.changed) {
    changed = true;
   }
   actions.push(nextAction.entry);
  }
 }
 const autoBattleSkillsChanged = !isSameAutoBattleSkillList(player.combat.autoBattleSkills, autoBattleSkills);
 player.combat.autoBattleSkills = autoBattleSkills;
 for (const entry of player.actions.contextActions) {
  const runtimeReadyTick = normalizeActionCooldownReadyTick(
   player,
   entry.id,
   currentTick,
   resolveContextActionCooldownTicks(entry),
  );
  const readyTick = Math.max(
   runtimeReadyTick,
   normalizeContextActionCooldownReadyTick(entry, currentTick),
  );
  const nextAction = reuseActionEntry(previousById.get(entry.id), {
   ...entry,
   cooldownLeft: readyTick > 0 ? Math.max(0, readyTick - currentTick) : Math.max(0, Number(entry.cooldownLeft ?? 0)),
   cooldownReadyTick: readyTick > currentTick ? readyTick : undefined,
  });
  if (nextAction.changed) {
   changed = true;
  }
  actions.push(nextAction.entry);
 }
 actions.sort((left, right) => {
  const leftId = typeof left.id === 'string' ? left.id : '';
  const rightId = typeof right.id === 'string' ? right.id : '';
  return ((autoBattleSkillById.get(leftId)?.order ?? Number.MAX_SAFE_INTEGER) - (autoBattleSkillById.get(rightId)?.order ?? Number.MAX_SAFE_INTEGER))
   || leftId.localeCompare(rightId, 'zh-Hans-CN');
 });
 if (!isSameActionIdOrder(player.actions.actions, actions)) {
  changed = true;
 }
 return { actions, changed, autoBattleSkillsChanged };
}

export function reuseActionEntry(previous, next) {
 if (previous && isSameActionEntry(previous, next)) {
  if (previous.cooldownLeft !== next.cooldownLeft) {
   return { entry: { ...previous, cooldownLeft: next.cooldownLeft }, changed: false };
  }
  return { entry: previous, changed: false };
 }
 return { entry: next, changed: true };
}

export function resolvePlayerSkillActionCooldownTicks(player, skill) {
 const cooldownSpeed = skill?.ignoreCooldownReduction === true
  ? 0
  : Math.trunc(Number(player.attrs?.numericStats?.cooldownSpeed ?? 0));
 return resolveCooldownTicks(skill?.cooldown, cooldownSpeed);
}

export function resolveContextActionCooldownTicks(entry) {
 if (entry?.id === RETURN_TO_SPAWN_ACTION_ID) {
  return RETURN_TO_SPAWN_COOLDOWN_TICKS;
 }
 return null;
}

export function normalizeContextActionCooldownReadyTick(entry, currentTick) {
 const readyTick = Math.max(0, Math.trunc(Number(entry?.cooldownReadyTick ?? 0)));
 const normalizedCurrentTick = Math.max(0, Math.trunc(Number(currentTick) || 0));
 return readyTick > normalizedCurrentTick ? readyTick : 0;
}

export function normalizeActionCooldownReadyTick(player, actionId, currentTick, maxCooldownTicks) {
 const cooldowns = player?.combat?.cooldownReadyTickBySkillId;
 if (!cooldowns || !actionId) {
  return 0;
 }
 const readyTick = Math.max(0, Math.trunc(Number(cooldowns[actionId] ?? 0)));
 if (readyTick <= 0) {
  return 0;
 }
 const normalizedCurrentTick = Math.max(0, Math.trunc(Number(currentTick) || 0));
 const remainingTicks = readyTick - normalizedCurrentTick;
 const normalizedMax = Number.isFinite(Number(maxCooldownTicks))
  ? Math.max(1, Math.trunc(Number(maxCooldownTicks)))
  : null;
 if (normalizedCurrentTick <= 0) {
  // 偏好/内容重建可能还没有玩家 tick，只收敛面板显示，不清运行时真源。
  return normalizedMax !== null && readyTick > normalizedMax ? normalizedMax : readyTick;
 }
 if (remainingTicks <= 0 || (normalizedMax !== null && remainingTicks > normalizedMax)) {
  delete cooldowns[actionId];
  return 0;
 }
 return readyTick;
}
/**
 * isSameActionList：读取SameAction列表并返回结果。
 * @param previous 参数说明。
 * @param current 参数说明。
 * @returns 无返回值，完成SameAction列表的条件判断。
 */

export function isSameActionList(previous, current) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 if (previous.length !== current.length) {
  return false;
 }
 for (let index = 0; index < previous.length; index += 1) {
  const left = previous[index];
  const right = current[index];
  if (left.id !== right.id
   || left.name !== right.name
   || left.type !== right.type
   || left.desc !== right.desc
   || left.cooldownLeft !== right.cooldownLeft
   || left.cooldownReadyTick !== right.cooldownReadyTick
   || left.range !== right.range
   || left.requiresTarget !== right.requiresTarget
   || left.targetMode !== right.targetMode
   || left.autoBattleEnabled !== right.autoBattleEnabled
   || left.autoBattleOrder !== right.autoBattleOrder
   || left.skillEnabled !== right.skillEnabled
   || left.passiveOnly !== right.passiveOnly) {
   return false;
  }
 }
 return true;
}

export function isSameActionIdOrder(previous, current) {
 if (previous.length !== current.length) {
  return false;
 }
 for (let index = 0; index < previous.length; index += 1) {
  if (previous[index]?.id !== current[index]?.id) {
   return false;
  }
 }
 return true;
}

export function isSameActionEntry(left, right) {
 return left.id === right.id
  && left.name === right.name
  && left.type === right.type
  && left.desc === right.desc
  && left.cooldownReadyTick === right.cooldownReadyTick
  && left.range === right.range
  && left.requiresTarget === right.requiresTarget
  && left.targetMode === right.targetMode
  && left.autoBattleEnabled === right.autoBattleEnabled
  && left.autoBattleOrder === right.autoBattleOrder
  && left.skillEnabled === right.skillEnabled
  && left.passiveOnly === right.passiveOnly
  && left.dungeonId === right.dungeonId;
}
/**
 * normalizePersistedAutoBattleSkills：判断PersistedAutoBattle技能是否满足条件。
 * @param input 输入参数。
 * @returns 无返回值，直接更新PersistedAutoBattle技能相关状态。
 */


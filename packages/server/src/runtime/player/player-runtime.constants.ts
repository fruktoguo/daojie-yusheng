/**
 * 玩家运行时游离模块函数集合 — 常量与脏域/revision/staging map 域。
 *
 * 从 player-runtime.helpers.ts 拆分而来，包含：
 * - 模块级常量（出生地图、logbook 上限、灵根种子、消耗品冷却前缀等）
 * - 脏域/revision/staging map 函数
 * - 运行时状态检查（在线/离线/挂机/传送/技艺作业等）
 * - 境界/天门/年寿/纪年等状态规范化
 * - logbook 消息规范化
 * - 持久化快照构建
 * - 自动战斗技能管理
 * - tick 性能/计数记录
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
import { cloneQuestRuntimeEntries, cloneRuntimeBonusesForSnapshot, encodePersistedRawBaseAttrs } from './player-runtime.item-clone.helpers';
import { ensurePendingTechniqueComprehensionEmptyOverwriteTechIds, buildPendingTechniqueComprehensionEmptyOverwriteAuthorization, cloneCraftSkillState, cloneTransmissionJob, cloneGatherJob, cloneBuildingJob, cloneMiningJob, cloneFormationJob, cloneTechniqueActivityQueue, cloneAlchemyPreset, buildPersistedTechniqueState, clonePendingTechniqueComprehensions } from './player-runtime.technique-queue.helpers';
import { cloneAlchemyJob, cloneEnhancementJob, cloneEnhancementRecord } from './player-runtime.equipment.helpers';
import { normalizeOfflineGainString } from './player-runtime.wallet.helpers';
export const DEFAULT_PLAYER_STARTER_MAP_ID = 'yunlai_town';

/** 等待写入 logbook 的消息上限，避免队列无限膨胀。 */
export const MAX_PENDING_LOGBOOK_MESSAGES = 200;

export const HEAVEN_SPIRITUAL_ROOT_SEED_ITEM_ID = 'root_seed.heaven';
export const DIVINE_SPIRITUAL_ROOT_SEED_ITEM_ID = 'root_seed.divine';
export const CONSUMABLE_COOLDOWN_BUFF_ID_PREFIX = 'system.consumable_cooldown.';
export const CONSUMABLE_COOLDOWN_SOURCE_ID_PREFIX = 'system:consumable-cooldown:';

/** 体能下限来源标记，用于把基础生命回填到运行时。 */
export const VITAL_BASELINE_BONUS_SOURCE = 'runtime:vitals_baseline';
export const RAW_BASE_ATTRS_PERSISTENCE_MARKER = '__rawBaseAttrs';

/** 可以进入待写 logbook 队列的消息种类。 */
export const PENDING_LOGBOOK_KINDS = new Set([
 'system',
 'chat',
 'quest',
 'combat',
 'loot',
 'grudge',
]);
export const pvpSoulInjuryBuffByRealmLv = new Map();
export const pvpShaInfusionBuffByRealmLv = new Map();
export const pvpShaBacklashBuffByRealmLv = new Map();
export const heavenlyDaoSuppressionBuffByRealmLv = new Map();
/** 运行时生成的收益结构已经过规范化，可直接复用，避免每息深拷贝全量功法。 */
export const normalizedOfflineGainSnapshots = new WeakSet<object>();
export const normalizedOfflineGainReportPartsRecords = new WeakSet<object>();
/** 通用或专用合并生成的载荷已收敛唯一键，可安全进入行级 copy-on-write 快路径。 */
export const canonicalOfflineGainReportPartsRecords = new WeakSet<object>();
export const offlineGainTechniqueIndexBySnapshot = new WeakMap<object[], Map<string, number>>();
export function createPlayerDirtyDomainSet() {
 return new Set();
}
export function markPlayerDirtyDomains(player, domains) {
 if (!player) {
  return;
 }
 if (!(player.dirtyDomains instanceof Set)) {
  player.dirtyDomains = createPlayerDirtyDomainSet();
 }
 for (const domain of Array.isArray(domains) ? domains : []) {
  if (typeof domain === 'string' && domain.trim()) {
   const normalizedDomain = domain.trim();
   if (normalizedDomain === 'world_anchor' || normalizedDomain === 'position_checkpoint') {
    markPlayerComprehensionSpeedRateProjectionDirty(player);
   }
   if (normalizedDomain === 'technique'
    && Array.isArray(player.pendingTechniqueComprehensions)
    && player.pendingTechniqueComprehensions.length > 0) {
    const emptyOverwriteTechIds = ensurePendingTechniqueComprehensionEmptyOverwriteTechIds(player);
    for (const pending of player.pendingTechniqueComprehensions) {
     const pendingTechId = typeof pending?.techId === 'string' ? pending.techId.trim() : '';
     if (pendingTechId) {
      emptyOverwriteTechIds.delete(pendingTechId);
     }
    }
    if (emptyOverwriteTechIds.size === 0) {
     player.allowPendingTechniqueComprehensionEmptyOverwrite = false;
     player.pendingTechniqueComprehensionEmptyOverwriteRevision = 0;
    }
   }
   player.dirtyDomains.add(normalizedDomain);
   const revisionByDomain = ensurePlayerPersistenceDomainRevisionMap(player);
   const currentRevision = Math.max(
    0,
    Math.trunc(Number(revisionByDomain.get(normalizedDomain) ?? 0)),
   );
   if (currentRevision >= Number.MAX_SAFE_INTEGER - 1) {
    revisionByDomain.set(normalizedDomain, 1);
    player.stagedPersistenceDomainRevisionByDomain?.delete(normalizedDomain);
    player.persistenceStagingGenerationByDomain?.delete(normalizedDomain);
   }
   else {
    revisionByDomain.set(normalizedDomain, currentRevision + 1);
   }
  }
 }
}

export function ensurePlayerPersistenceDomainRevisionMap(player) {
 if (!(player.persistenceDomainRevisionByDomain instanceof Map)) {
  player.persistenceDomainRevisionByDomain = new Map();
 }
 return player.persistenceDomainRevisionByDomain;
}

export function ensurePlayerPersistenceStagingMaps(player) {
 if (!(player.stagedPersistenceDomainRevisionByDomain instanceof Map)) {
  player.stagedPersistenceDomainRevisionByDomain = new Map();
 }
 if (!(player.persistenceStagingGenerationByDomain instanceof Map)) {
  player.persistenceStagingGenerationByDomain = new Map();
 }
}

export function ensurePlayerPersistencePersistedMap(player) {
 if (!(player.persistedDomainRevisionByDomain instanceof Map)) {
  player.persistedDomainRevisionByDomain = new Map();
 }
 return player.persistedDomainRevisionByDomain;
}

export function getPlayerPersistenceDomainRevision(player, domain) {
 const normalizedDomain = typeof domain === 'string' ? domain.trim() : '';
 if (!player || !normalizedDomain) {
  return 0;
 }
 const revisionByDomain = ensurePlayerPersistenceDomainRevisionMap(player);
 const existingRevision = Math.max(0, Math.trunc(Number(revisionByDomain.get(normalizedDomain) ?? 0)));
 if (existingRevision > 0) {
  return existingRevision;
 }
 const initialRevision = player.dirtyDomains?.has?.(normalizedDomain) ? 1 : 0;
 if (initialRevision > 0) {
  revisionByDomain.set(normalizedDomain, initialRevision);
 }
 return initialRevision;
}

export function getPlayerStagedDomainRevision(player, domain, stagingGenerationId) {
 if (!player || !stagingGenerationId) {
  return 0;
 }
 ensurePlayerPersistenceStagingMaps(player);
 if (player.persistenceStagingGenerationByDomain.get(domain) !== stagingGenerationId) {
  return 0;
 }
 return Math.max(
  0,
  Math.trunc(Number(player.stagedPersistenceDomainRevisionByDomain.get(domain) ?? 0)),
 );
}

export function normalizePlayerDomainRevisionEntries(domainRevisions) {
 const normalized = new Map();
 const entries = domainRevisions instanceof Map
  ? domainRevisions.entries()
  : (domainRevisions && typeof domainRevisions === 'object'
   ? Object.entries(domainRevisions)
   : []);
 for (const [domain, revision] of entries) {
  const normalizedDomain = typeof domain === 'string' ? domain.trim() : '';
  const normalizedRevision = Math.max(0, Math.trunc(Number(revision) || 0));
  if (normalizedDomain && normalizedRevision > 0) {
   normalized.set(normalizedDomain, normalizedRevision);
  }
 }
 return normalized;
}

export function normalizePlayerStagingGenerationId(value) {
 return typeof value === 'string' ? value.trim() : '';
}

export function hasTechniqueTemplateProjectionChanged(current, hydrated) {
 return current?.name !== hydrated?.name
  || current?.grade !== hydrated?.grade
  || current?.category !== hydrated?.category
  || current?.realmLv !== hydrated?.realmLv
  || current?.strengthPercent !== hydrated?.strengthPercent
  || current?.expToNext !== hydrated?.expToNext
  || current?.learnTechniqueMaxLevel !== hydrated?.learnTechniqueMaxLevel
  || current?.skills !== hydrated?.skills
  || current?.layers !== hydrated?.layers;
}

export function clearPlayerDirtyDomains(player) {
 if (player?.dirtyDomains instanceof Set) {
  player.dirtyDomains.clear();
 }
}
export function readPlayerDirtyDomains(player) {
 return player?.dirtyDomains instanceof Set ? player.dirtyDomains : null;
}
export function ensurePlayerPersistenceDomainHoldCountMap(player) {
 if (!(player?.persistenceDomainHoldCountByDomain instanceof Map)) {
  player.persistenceDomainHoldCountByDomain = new Map();
 }
 return player.persistenceDomainHoldCountByDomain;
}
export function readPlayerPersistenceDomainHoldCountMap(player) {
 return player?.persistenceDomainHoldCountByDomain instanceof Map
  ? player.persistenceDomainHoldCountByDomain
  : null;
}
export function normalizePlayerPersistenceDomainNames(domains) {
 const normalized = new Set();
 if (!domains || typeof domains[Symbol.iterator] !== 'function') {
  return normalized;
 }
 for (const domain of domains) {
  const value = typeof domain === 'string' ? domain.trim() : '';
  if (value) {
   normalized.add(value);
  }
 }
 return normalized;
}
export function hasHeldPlayerPersistenceDomains(player) {
 return (readPlayerPersistenceDomainHoldCountMap(player)?.size ?? 0) > 0;
}
export function readUnheldPlayerDirtyDomains(player) {
 const dirtyDomains = readPlayerDirtyDomains(player);
 if (!dirtyDomains || dirtyDomains.size === 0) {
  return new Set();
 }
 const heldDomains = readPlayerPersistenceDomainHoldCountMap(player);
 if (!heldDomains || heldDomains.size === 0) {
  return new Set(dirtyDomains);
 }
 return new Set(Array.from(dirtyDomains).filter((domain) => !heldDomains.has(domain)));
}
export function isImmediateDomainPersistenceSuppressed(player) {
 return Boolean(player?.suppressImmediateDomainPersistence);
}
export function isPlayerRuntimeDirty(player) {
 if (isImmediateDomainPersistenceSuppressed(player)) {
  return false;
 }
 return readUnheldPlayerDirtyDomains(player).size > 0
  || (!hasHeldPlayerPersistenceDomains(player) && player.persistentRevision > Math.max(
   Math.max(0, Math.trunc(Number(player.persistedRevision) || 0)),
   Math.max(0, Math.trunc(Number(player.stagedRevision) || 0)),
  ));
}
/**
 * buildEquipmentSnapshot：构建并返回目标对象。
 * @param equipment 参数说明。
 * @returns 无返回值，直接更新装备快照相关状态。
 */

export function createDefaultRealmState() {

 const stage = DEFAULT_PLAYER_REALM_STAGE;

 const config = PLAYER_REALM_CONFIG[stage];
 return {
  stage,
  realmLv: 1,
  displayName: config.name,
  name: config.name,
  shortName: config.shortName,
  path: config.path,
  narrative: config.narrative,
  review: undefined,
  lifespanYears: null,
  progress: 0,
  progressToNext: config.progressToNext,
  breakthroughReady: false,
  nextStage: PLAYER_REALM_ORDER[PLAYER_REALM_ORDER.indexOf(stage) + 1],
  breakthroughItems: [],
  minTechniqueLevel: config.minTechniqueLevel,
  minTechniqueRealm: config.minTechniqueRealm,
  heavenGate: null,
 };
}
/**
 * cloneRealmState：构建Realm状态。
 * @param realm 参数说明。
 * @returns 无返回值，直接更新Realm状态相关状态。
 */

export function cloneRealmState(realm) {
 return projectRealmState(realm);
}
/**
 * cloneHeavenGateState：构建HeavenGate状态。
 * @param state 状态对象。
 * @returns 无返回值，直接更新HeavenGate状态相关状态。
 */

export function cloneHeavenGateState(state) {
 return projectHeavenGateState(state);
}
/**
 * cloneHeavenGateRoots：构建HeavenGate根容器。
 * @param roots 参数说明。
 * @returns 无返回值，直接更新HeavenGate根容器相关状态。
 */

export function cloneHeavenGateRoots(roots) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 if (!roots) {
  return null;
 }
 return {
  metal: roots.metal,
  wood: roots.wood,
  water: roots.water,
  fire: roots.fire,
  earth: roots.earth,
 };
}

export function resolveRevealedBreakthroughRequirementIds(realm) {
 const requirements = Array.isArray(realm?.breakthrough?.requirements) ? realm.breakthrough.requirements : [];
 return requirements
  .filter((entry) => typeof entry?.id === 'string' && entry.id.trim().length > 0 && entry.hidden !== true)
  .map((entry) => entry.id.trim());
}

export function buildRuntimeOwnerId(playerId, sessionId, sessionEpoch) {
 const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : 'player';
 const normalizedSessionId = typeof sessionId === 'string' ? sessionId.trim() : 'session';
 const normalizedEpoch = Number.isFinite(sessionEpoch) ? Math.max(1, Math.trunc(Number(sessionEpoch))) : 1;
 const ownerDigest = createHash('sha256')
  .update(`${normalizedPlayerId}:${normalizedSessionId}:${normalizedEpoch}`)
  .digest('base64url')
  .slice(0, 32);
 return `rt:${normalizedEpoch.toString(36)}:${Date.now().toString(36)}:${randomBytes(6).toString('base64url')}:${ownerDigest}`;
}
export function resolveRespawnPlacement(mapTemplateRepository, templateId, inputX, inputY) {
 const normalizedTemplateId = typeof templateId === 'string' && templateId.trim() ? templateId.trim() : '';
 const template = normalizedTemplateId
  && typeof mapTemplateRepository?.has === 'function'
  && mapTemplateRepository.has(normalizedTemplateId)
  ? mapTemplateRepository.getOrThrow(normalizedTemplateId)
  : null;
 const spawnX = Number.isFinite(template?.spawnX) ? Math.trunc(template.spawnX) : 0;
 const spawnY = Number.isFinite(template?.spawnY) ? Math.trunc(template.spawnY) : 0;
 const x = Number.isFinite(inputX) ? Math.trunc(inputX) : spawnX;
 const y = Number.isFinite(inputY) ? Math.trunc(inputY) : spawnY;
 if (!template) {
  return { x, y };
 }
 if (isWalkableTemplatePoint(template, x, y)) {
  return { x, y };
 }
 return { x: spawnX, y: spawnY };
}
export function isWalkableTemplatePoint(template, x, y) {
 const width = Number.isFinite(template?.width) ? Math.trunc(template.width) : 0;
 const height = Number.isFinite(template?.height) ? Math.trunc(template.height) : 0;
 if (width <= 0 || height <= 0) {
  return true;
 }
 if (x < 0 || y < 0 || x >= width || y >= height) {
  return false;
 }
 const mask = template.walkableMask;
 if (!mask || typeof mask.length !== 'number') {
  return true;
 }
 return mask[(y * width) + x] === 1;
}
/**
 * buildRuntimePlayerPersistenceSnapshot：构建并返回目标对象。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新运行态玩家Persistence快照相关状态。
 */

export function buildRuntimePlayerPersistenceSnapshot(player, mapTemplateRepository = null, dirtyDomains = null) {
 const dirtyDomainSet = normalizeSnapshotDirtyDomains(dirtyDomains);
 const includeAllDomains = dirtyDomainSet.size === 0;
 const needsDomain = (...domains) => includeAllDomains || domains.some((domain) => dirtyDomainSet.has(domain));
 const needsProgression = needsDomain('progression', 'body_training', 'profession', 'alchemy_preset', 'active_job', 'enhancement_record', 'attr');
 const needsCombat = needsDomain('combat_pref', 'auto_battle_skill', 'auto_use_item_rule');
 const needsTechnique = needsDomain('technique', 'combat_pref');
 const pendingComprehensionEmptyOverwriteAuthorization = buildPendingTechniqueComprehensionEmptyOverwriteAuthorization(player);
 const templateId = typeof player.templateId === 'string' ? player.templateId.trim() : '';
 const respawnTemplateId = typeof player.respawnTemplateId === 'string' && player.respawnTemplateId.trim()
  ? player.respawnTemplateId.trim()
  : DEFAULT_PLAYER_STARTER_MAP_ID;
 const respawnInstanceId = normalizePlayerPlacementInstanceId(player.respawnInstanceId)
  ?? (respawnTemplateId ? buildPublicPlayerInstanceId(respawnTemplateId) : '');
 const respawnPlacement = resolveRespawnPlacement(
  mapTemplateRepository,
  respawnTemplateId,
  player.respawnX,
  player.respawnY,
 );
 return {
  version: 1,
  savedAt: nextPlayerPersistenceVersion(),
  placement: {
   instanceId: normalizePlayerPlacementInstanceId(player.instanceId)
    ?? (templateId ? buildPublicPlayerInstanceId(templateId) : ''),
   templateId,
   x: player.x,
   y: player.y,
   facing: player.facing,
  },
  respawn: {
   instanceId: respawnInstanceId,
   templateId: respawnTemplateId,
   x: respawnPlacement.x,
   y: respawnPlacement.y,
   facing: player.facing,
  },
  worldPreference: {
   linePreset: normalizePlayerWorldPreferenceLinePreset(player.worldPreference?.linePreset),
  },
  sectId: typeof player.sectId === 'string' && player.sectId.trim() ? player.sectId.trim() : null,
  vitals: {
   hp: player.hp,
   maxHp: player.maxHp,
   qi: player.qi,
   maxQi: player.maxQi,
  },
  progression: needsProgression ? {
   foundation: player.foundation,
   rootFoundation: normalizeCounter(player.rootFoundation),
   combatExp: player.combatExp,
   comprehension: normalizeCounter(player.comprehension),
   luck: normalizeCounter(player.luck),
   bodyTraining: player.bodyTraining ? { ...player.bodyTraining } : null,
   boneAgeBaseYears: player.boneAgeBaseYears,
   lifeElapsedTicks: player.lifeElapsedTicks,
   lifespanYears: player.lifespanYears,
   stamina: Math.max(0, Math.min(DUNGEON_MAX_STAMINA, Math.trunc(Number(player.stamina) || 0))),
   staminaUpdatedAt: Math.max(0, Math.trunc(Number(player.staminaUpdatedAt) || 0)),
   realm: cloneRealmState(player.realm),
   heavenGate: cloneHeavenGateState(player.heavenGate),
   spiritualRoots: cloneHeavenGateRoots(player.spiritualRoots),
   alchemySkill: cloneCraftSkillState(player.alchemySkill),
   forgingSkill: cloneCraftSkillState(player.forgingSkill),
   gatherSkill: cloneCraftSkillState(player.gatherSkill),
   buildingSkill: cloneCraftSkillState(player.buildingSkill),
   miningSkill: cloneCraftSkillState(player.miningSkill),
   formationSkill: cloneCraftSkillState(player.formationSkill),
   transmissionSkill: cloneCraftSkillState(player.transmissionSkill),
   transmissionJob: player.transmissionJob ? cloneTransmissionJob(player.transmissionJob) : null,
   gatherJob: player.gatherJob ? cloneGatherJob(player.gatherJob) : null,
   buildingJob: player.buildingJob ? cloneBuildingJob(player.buildingJob) : null,
   miningJob: player.miningJob ? cloneMiningJob(player.miningJob) : null,
   formationJob: player.formationJob ? cloneFormationJob(player.formationJob) : null,
   techniqueActivityQueue: cloneTechniqueActivityQueue(player.techniqueActivityQueue),
   alchemyPresets: (player.alchemyPresets ?? []).map((entry) => cloneAlchemyPreset(entry)),
   alchemyJob: player.alchemyJob ? cloneAlchemyJob(player.alchemyJob) : null,
   forgingJob: player.forgingJob ? cloneAlchemyJob(player.forgingJob) : null,
   enhancementSkill: cloneCraftSkillState(player.enhancementSkill),
   enhancementSkillLevel: Math.max(1, Math.floor(Number(player.enhancementSkill?.level ?? player.enhancementSkillLevel) || 1)),
   enhancementJob: player.enhancementJob ? cloneEnhancementJob(player.enhancementJob) : null,
   enhancementRecords: (player.enhancementRecords ?? []).map((entry) => cloneEnhancementRecord(entry)),
  } : {},
  attrState: needsDomain('attr') ? {
   baseAttrs: player.attrs?.rawBaseAttrs ? encodePersistedRawBaseAttrs(player.attrs.rawBaseAttrs) : null,
   revealedBreakthroughRequirementIds: resolveRevealedBreakthroughRequirementIds(player.realm),
  } : {},
  unlockedMapIds: needsDomain('map_unlock') ? player.unlockedMapIds.slice() : [],
  inventory: needsDomain('inventory') ? {
   revision: player.inventory.revision,
   capacity: player.inventory.capacity,
   items: player.inventory.items.map((entry) => ({ ...entry })),
   lockedItems: Array.isArray(player.inventory.lockedItems)
    ? player.inventory.lockedItems.map((entry) => ({ ...entry }))
    : [],
  } : {
   revision: player.inventory.revision,
   capacity: player.inventory.capacity,
   items: [],
   lockedItems: [],
  },
  wallet: needsDomain('wallet') ? {
   balances: Array.isArray(player.wallet?.balances)
    ? player.wallet.balances.map((entry) => ({ ...entry }))
    : [],
  } : undefined,
  marketStorage: needsDomain('market_storage') ? {
   items: Array.isArray(player.marketStorage?.items)
    ? player.marketStorage.items.map((entry) => ({ ...entry }))
    : [],
  } : undefined,
  equipment: needsDomain('equipment') ? {
   revision: player.equipment.revision,
   slots: player.equipment.slots.map((entry) => ({
    slot: entry.slot,
    item: entry.item ? { ...entry.item } : null,
   })),
  } : {
   revision: player.equipment.revision,
   slots: [],
  },
  artifacts: needsDomain('artifact') ? {
   revision: Math.max(1, Math.trunc(Number(player.artifacts?.revision ?? 1) || 1)),
   slots: (player.artifacts?.slots ?? []).map((entry) => ({
    slot: entry.slot,
    unlocked: entry.unlocked === true,
    enabled: entry.enabled !== false,
    qi: Math.max(0, Number(entry.qi) || 0),
    maxQi: Math.max(0, Number(entry.maxQi) || 0),
    item: entry.item ? { ...entry.item } : null,
   })),
  } : {
   revision: Math.max(1, Math.trunc(Number(player.artifacts?.revision ?? 1) || 1)),
   slots: [],
  },
  techniques: needsTechnique ? {
   revision: player.techniques.revision,
   techniques: needsDomain('technique') ? player.techniques.techniques.map((entry) => buildPersistedTechniqueState(entry)) : [],
   cultivatingTechId: player.techniques.cultivatingTechId,
   pendingComprehensions: clonePendingTechniqueComprehensions(player.pendingTechniqueComprehensions),
   ...pendingComprehensionEmptyOverwriteAuthorization,
  } : {
   revision: player.techniques.revision,
   techniques: [],
   cultivatingTechId: player.techniques.cultivatingTechId,
   pendingComprehensions: clonePendingTechniqueComprehensions(player.pendingTechniqueComprehensions),
   ...pendingComprehensionEmptyOverwriteAuthorization,
  },
  buffs: needsDomain('buff') ? {
   revision: player.buffs.revision,
   buffs: player.buffs.buffs.map((entry) => materializeRuntimeTemporaryBuff(entry)),
  } : {
   revision: player.buffs.revision,
   buffs: [],
  },
  quests: needsDomain('quest') ? {
   revision: player.quests.revision,
   entries: cloneQuestRuntimeEntries(player.quests.quests),
  } : {
   revision: player.quests.revision,
   entries: [],
  },
  combat: needsCombat ? {
   autoBattle: player.combat.autoBattle,
   autoRetaliate: player.combat.autoRetaliate,
   autoBattleStationary: player.combat.autoBattleStationary,
   autoUsePills: cloneAutoUsePillList(player.combat.autoUsePills),
   combatTargetingRules: cloneCombatTargetingRules(player.combat.combatTargetingRules),
   autoBattleTargetingMode: player.combat.autoBattleTargetingMode,
   retaliatePlayerTargetId: player.combat.retaliatePlayerTargetId,
   retaliatePlayerTargetLastAttackTick: player.combat.retaliatePlayerTargetLastAttackTick,
   combatTargetId: player.combat.combatTargetId,
   combatTargetLocked: player.combat.combatTargetLocked,
   allowAoePlayerHit: player.combat.allowAoePlayerHit,
   autoIdleCultivation: player.combat.autoIdleCultivation,
   autoSwitchCultivation: player.combat.autoSwitchCultivation,
   autoRootFoundation: player.combat.autoRootFoundation === true,
   combatAttackIntensity: normalizeCombatAttackIntensity(player.combat.combatAttackIntensity),
   senseQiActive: player.combat.senseQiActive,
   wangQiActive: player.combat.wangQiActive === true,
   autoBattleSkills: needsDomain('auto_battle_skill') ? player.combat.autoBattleSkills.map((entry) => ({ ...entry })) : [],
  } : {
   autoBattleSkills: [],
  },
  pendingLogbookMessages: needsDomain('logbook') ? player.pendingLogbookMessages.map((entry) => ({ ...entry })) : [],
  runtimeBonuses: needsDomain('attr') ? cloneRuntimeBonusesForSnapshot(player.runtimeBonuses) : [],
 };
}

export function normalizePlayerPlacementInstanceId(value) {
 if (typeof value !== 'string') {
  return null;
 }
 const normalized = value.trim();
 return normalized ? normalized : null;
}

export function normalizeSnapshotDirtyDomains(dirtyDomains) {
 const normalized = new Set();
 if (!dirtyDomains || typeof dirtyDomains[Symbol.iterator] !== 'function') {
  return normalized;
 }
 for (const domain of dirtyDomains) {
  if (typeof domain === 'string' && domain.trim()) {
   normalized.add(domain.trim());
  }
 }
 return normalized;
}

export function normalizePlayerWorldPreferenceLinePreset(value) {
 return value === 'real' ? 'real' : 'peaceful';
}

export function buildPublicPlayerInstanceId(templateId) {
 return `public:${templateId}`;
}
/**
 * createCraftSkillState：构建并返回目标对象。
 * @returns 无返回值，直接更新炼制技能状态相关状态。
 */

export function normalizeRealmState(realm) {
 return realm ? cloneRealmState(realm) : createDefaultRealmState();
}
/**
 * normalizeHeavenGateState：规范化或转换HeavenGate状态。
 * @param state 状态对象。
 * @returns 无返回值，直接更新HeavenGate状态相关状态。
 */

export function normalizeHeavenGateState(state) {
 return cloneHeavenGateState(state);
}
/**
 * normalizeHeavenGateRoots：规范化或转换HeavenGate根容器。
 * @param roots 参数说明。
 * @returns 无返回值，直接更新HeavenGate根容器相关状态。
 */

export function normalizeHeavenGateRoots(roots) {
 return cloneHeavenGateRoots(roots);
}
/**
 * normalizeCounter：规范化或转换Counter。
 * @param value 参数说明。
 * @returns 无返回值，直接更新Counter相关状态。
 */

export function normalizeCounter(value) {
 return Number.isFinite(value) ? Math.max(0, Math.trunc(value ?? 0)) : 0;
}
/**
 * normalizeBoneAgeBaseYears：规范化或转换BoneAgeBaseYear。
 * @param value 参数说明。
 * @returns 无返回值，直接更新BoneAgeBaseYear相关状态。
 */

export function normalizeBoneAgeBaseYears(value) {
 return Number.isFinite(value) ? Math.max(1, Math.trunc(value ?? DEFAULT_BONE_AGE_YEARS)) : DEFAULT_BONE_AGE_YEARS;
}
export function advancePlayerChronology(player) {
 const previous = Number.isFinite(Number(player.lifeElapsedTicks))
  ? Math.max(0, Number(player.lifeElapsedTicks))
  : 0;
 const next = previous + 1;
 if (!Number.isFinite(next) || next <= previous) {
  return false;
 }
 player.lifeElapsedTicks = next;
 return true;
}
/**
 * normalizeLifeElapsedTicks：规范化或转换LifeElapsedtick。
 * @param value 参数说明。
 * @returns 无返回值，直接更新LifeElapsedtick相关状态。
 */

export function normalizeLifeElapsedTicks(value) {
 return Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
}

export function resolvePlayerRuntimeTick(player, fallbackTick = 0) {
 if (Number.isFinite(Number(player?.lifeElapsedTicks))) {
  return Math.max(0, Math.trunc(Number(player.lifeElapsedTicks) || 0));
 }
 return Math.max(0, Math.trunc(Number(fallbackTick) || 0));
}

export function normalizeLifespanYears(value) {
 return Number.isFinite(value) ? Math.max(1, Math.trunc(value ?? 0)) : null;
}
/**
 * normalizePendingLogbookMessages：规范化或转换待处理LogbookMessage。
 * @param input 输入参数。
 * @returns 无返回值，直接更新PendingLogbookMessage相关状态。
 */

export function normalizePendingLogbookMessages(input) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 if (!Array.isArray(input)) {
  return [];
 }

 const normalized = [];

 const indexById = new Map();
 for (const entry of input) {
  const candidate = normalizePendingLogbookMessage(entry);
  if (!candidate) {
   continue;
  }
  if (isRetiredRedeemSuccessLogbookMessage(candidate)) {
   continue;
  }

  const existingIndex = indexById.get(candidate.id);
  if (existingIndex !== undefined) {
   normalized[existingIndex] = candidate;
   continue;
  }
  indexById.set(candidate.id, normalized.length);
  normalized.push(candidate);
 }
 return normalized.slice(-MAX_PENDING_LOGBOOK_MESSAGES);
}
/**
 * normalizePendingLogbookMessage：规范化或转换待处理LogbookMessage。
 * @param input 输入参数。
 * @returns 无返回值，直接更新PendingLogbookMessage相关状态。
 */

export function normalizePendingLogbookMessage(input) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 if (!input || typeof input !== 'object') {
  return null;
 }

 const id = typeof input.id === 'string' ? input.id.trim() : '';

 const text = typeof input.text === 'string' ? input.text.trim() : '';

 const kind = typeof input.kind === 'string' && PENDING_LOGBOOK_KINDS.has(input.kind)
  ? input.kind
  : 'grudge';
 if (!id || !text) {
  return null;
 }

 const at = Number.isFinite(input.at) ? Math.max(0, Math.trunc(input.at)) : Date.now();

 const from = typeof input.from === 'string' && input.from.trim().length > 0
  ? input.from.trim()
  : undefined;
 const structured = normalizePendingStructuredNotice(input.structured);
 const structuredGroup = Array.isArray(input.structuredGroup)
  ? input.structuredGroup.map(normalizePendingStructuredNotice).filter(Boolean)
  : [];
 return {
  id,
  kind,
  text,
  from,
  at,
  ...(structured ? { structured } : {}),
  ...(structuredGroup.length > 0 ? { structuredGroup } : {}),
 };
}

export function normalizePendingStructuredNotice(input) {
 if (!input || typeof input !== 'object' || typeof input.key !== 'string' || !input.key.trim()) {
  return null;
 }
 const vars = input.vars && typeof input.vars === 'object' && !Array.isArray(input.vars)
  ? Object.fromEntries(Object.entries(input.vars).filter(([, value]) => typeof value === 'string' || Number.isFinite(value)))
  : null;
 const pills = Array.isArray(input.pills)
  ? input.pills.filter((entry) => entry && typeof entry === 'object' && typeof entry.key === 'string').map((entry) => ({
   ...entry,
   ...(Array.isArray(entry.tooltipLines) ? { tooltipLines: entry.tooltipLines.filter((line) => typeof line === 'string') } : {}),
  }))
  : null;
 const badges = Array.isArray(input.badges) ? input.badges.filter((entry) => typeof entry === 'string') : null;
 return {
  key: input.key.trim(),
  ...(vars && Object.keys(vars).length > 0 ? { vars } : {}),
  ...(pills && pills.length > 0 ? { pills } : {}),
  ...(badges && badges.length > 0 ? { badges } : {}),
 };
}

export function clonePendingLogbookMessage(entry) {
 return {
  ...entry,
  ...(entry?.structured ? { structured: normalizePendingStructuredNotice(entry.structured) } : {}),
  ...(Array.isArray(entry?.structuredGroup)
   ? { structuredGroup: entry.structuredGroup.map(normalizePendingStructuredNotice).filter(Boolean) }
   : {}),
 };
}

export function isRetiredRedeemSuccessLogbookMessage(entry) {
 const id = typeof entry?.id === 'string' ? entry.id.trim() : '';
 const text = typeof entry?.text === 'string' ? entry.text.trim() : '';
 return id.startsWith('redeem:') && text.startsWith('兑换成功：');
}
/**
 * isSamePendingLogbookMessages：判断Same待处理LogbookMessage是否满足条件。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，完成SamePendingLogbookMessage的条件判断。
 */

export function isSamePendingLogbookMessages(left, right) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 if (left.length !== right.length) {
  return false;
 }
 for (let index = 0; index < left.length; index += 1) {
  const a = left[index];
  const b = right[index];
  if (a.id !== b.id
   || a.kind !== b.kind
   || a.text !== b.text
   || a.from !== b.from
   || a.at !== b.at
   || !isSamePendingNoticeValue(a.structured, b.structured)
   || !isSamePendingNoticeValue(a.structuredGroup, b.structuredGroup)) {
   return false;
  }
 }
 return true;
}

export function isSamePendingNoticeValue(left, right) {
 if (left === right) {
  return true;
 }
 if (Array.isArray(left) || Array.isArray(right)) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
   return false;
  }
  return left.every((entry, index) => isSamePendingNoticeValue(entry, right[index]));
 }
 if (!left || !right || typeof left !== 'object' || typeof right !== 'object') {
  return false;
 }
 const leftKeys = Object.keys(left);
 const rightKeys = Object.keys(right);
 if (leftKeys.length !== rightKeys.length) {
  return false;
 }
 return leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key)
  && isSamePendingNoticeValue(left[key], right[key]));
}
/**
 * clamp：执行clamp相关逻辑。
 * @param value 参数说明。
 * @param min 参数说明。
 * @param max 参数说明。
 * @returns 无返回值，直接更新clamp相关状态。
 */

export function isDetachedPlayerRuntime(player: any): boolean {
 if (!player || typeof player !== 'object') {
  return false;
 }
 return typeof player.sessionId !== 'string' || player.sessionId.trim().length === 0;
}

export function normalizePersistedAutoBattleSkills(input) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 if (!Array.isArray(input)) {
  return [];
 }

 const normalized = input
  .filter((entry) => Boolean(entry && typeof entry.skillId === 'string' && entry.skillId.trim()))
  .map((entry) => ({
   skillId: entry.skillId.trim(),

   enabled: entry.enabled !== false,

   skillEnabled: entry.skillEnabled !== false,
   autoBattleOrder: Number.isFinite(entry.autoBattleOrder) ? Math.max(0, Math.trunc(entry.autoBattleOrder)) : undefined,
  }));
 normalized.sort((left, right) => (left.autoBattleOrder ?? Number.MAX_SAFE_INTEGER) - (right.autoBattleOrder ?? Number.MAX_SAFE_INTEGER) || left.skillId.localeCompare(right.skillId, 'zh-Hans-CN'));
 return normalized;
}
/**
 * normalizeAutoBattleSkills：规范化或转换AutoBattle技能。
 * @param skillIds skill ID 集合。
 * @param input 输入参数。
 * @returns 无返回值，直接更新AutoBattle技能相关状态。
 */

export function normalizeAutoBattleSkills(skillIds, input) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 const availableIds = new Set(skillIds);

 const normalized = [];

 const seen = new Set();
 for (const entry of input ?? []) {
  const skillId = typeof entry.skillId === 'string' ? entry.skillId.trim() : '';
  if (!skillId || seen.has(skillId) || !availableIds.has(skillId)) {
   continue;
  }
  normalized.push({
   skillId,

   enabled: entry.enabled !== false,

   skillEnabled: entry.skillEnabled !== false,
   autoBattleOrder: normalized.length,
  });
  seen.add(skillId);
 }
 for (const skillId of skillIds) {
  if (seen.has(skillId)) {
   continue;
  }
  normalized.push({
   skillId,
   enabled: true,
   skillEnabled: true,
   autoBattleOrder: normalized.length,
  });
 }
 return normalized;
}
/**
 * enforcePlayerSkillEnabledLimit：按玩家当前技能槽位上限规整技能启用状态。
 * @param player 玩家对象。
 * @param entries 技能配置列表。
 * @returns 返回已按槽位上限裁剪的技能配置列表。
 */

export function enforcePlayerSkillEnabledLimit(player, entries) {
 return enforceSkillEnabledLimit(entries, resolvePlayerSkillSlotLimit(player));
}
/**
 * normalizePlayerAutoBattleSkills：按玩家当前可用技能与槽位上限规整自动战斗技能配置。
 * @param player 玩家对象。
 * @param input 原始技能配置列表。
 * @returns 返回已按技能可见性和槽位上限规整后的配置列表。
 */

export function normalizePlayerAutoBattleSkills(player, input) {
 const skillIds = collectUnlockedSkillIds(player);
 const skillLimit = resolvePlayerSkillSlotLimit(player);
 if (isNormalizedAutoBattleSkillsForSkillIds(input, skillIds, skillLimit)) {
  return input;
 }
 return enforceSkillEnabledLimit(normalizeAutoBattleSkills(skillIds, input), skillLimit);
}
export function isNormalizedAutoBattleSkillsForSkillIds(input, skillIds, skillLimit) {
 if (!Array.isArray(input) || input.length !== skillIds.length) {
  return false;
 }
 const normalizedLimit = Number.isFinite(skillLimit) ? Math.max(0, Math.floor(skillLimit)) : 0;
 let enabledCount = 0;
 for (let index = 0; index < input.length; index += 1) {
  const entry = input[index];
  const skillId = typeof entry?.skillId === 'string' ? entry.skillId.trim() : '';
  if (!skillId || entry.skillId !== skillId || entry.enabled !== (entry.enabled !== false) || entry.skillEnabled !== (entry.skillEnabled !== false)) {
   return false;
  }
  if (!skillIds.includes(skillId)) {
   return false;
  }
  for (let previousIndex = 0; previousIndex < index; previousIndex += 1) {
   if (input[previousIndex]?.skillId === skillId) {
    return false;
   }
  }
  if (entry.autoBattleOrder !== index) {
   return false;
  }
  if (entry.skillEnabled !== false) {
   enabledCount += 1;
   if (enabledCount > normalizedLimit) {
    return false;
   }
  }
 }
 return true;
}
/**
 * normalizePersistedAutoBattleTargetingMode：读取PersistedAutoBattleTargetingMode并返回结果。
 * @param input 输入参数。
 * @returns 无返回值，直接更新PersistedAutoBattleTargetingMode相关状态。
 */

export function normalizePersistedAutoBattleTargetingMode(input) {

 const value = typeof input === 'string'
  ? input
  : (typeof input?.mode === 'string' ? input.mode : '');
 return ['auto', 'nearest', 'low_hp', 'full_hp', 'boss', 'player'].includes(value) ? value : 'auto';
}
/**
 * collectUnlockedSkillIds：执行Unlocked技能ID相关逻辑。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新Unlocked技能ID相关状态。
 */

export function collectUnlockedSkillIds(player) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 const skillIds = [];
 for (const technique of player.techniques.techniques) {
  for (const skill of technique.skills ?? []) {
   const unlockLevel = typeof skill.unlockLevel === 'number' ? skill.unlockLevel : 1;
   if ((technique.level ?? 1) < unlockLevel) {
    continue;
   }
   skillIds.push(skill.id);
  }
 }
 return skillIds;
}

export function syncTechniqueAutoBattleSkillCatalog(player, technique) {
 const skillIds = collectUnlockedSkillIds(player);
 const seen = new Set(skillIds);
 for (const skill of technique?.skills ?? []) {
  const skillId = typeof skill?.id === 'string' ? skill.id.trim() : '';
  if (!skillId || seen.has(skillId)) {
   continue;
  }
  skillIds.push(skillId);
  seen.add(skillId);
 }
 const normalized = enforceSkillEnabledLimit(
  normalizeAutoBattleSkills(skillIds, player.combat.autoBattleSkills),
  resolvePlayerSkillSlotLimit(player),
 );
 if (isSameAutoBattleSkillList(player.combat.autoBattleSkills, normalized)) {
  return false;
 }
 player.combat.autoBattleSkills = normalized;
 return true;
}
/**
 * syncTechniqueSkillAvailability：处理功法技能Availability并更新相关状态。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新功法技能Availability相关状态。
 */

export function syncTechniqueSkillAvailability(player) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 const skillEnabledMap = new Map(player.combat.autoBattleSkills.map((entry) => [entry.skillId, entry.skillEnabled !== false]));

 let changed = false;
 for (const technique of player.techniques.techniques) {
  const nextEnabled = resolveTechniqueSkillAvailability(technique, skillEnabledMap);
  if ((technique.skillsEnabled !== false) === nextEnabled) {
   continue;
  }
  technique.skillsEnabled = nextEnabled;
  changed = true;
 }
 return changed;
}
/**
 * resolveTechniqueSkillAvailability：规范化或转换功法技能Availability。
 * @param technique 参数说明。
 * @param skillEnabledMap 参数说明。
 * @returns 无返回值，直接更新功法技能Availability相关状态。
 */

export function resolveTechniqueSkillAvailability(technique, skillEnabledMap) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 let hasResolvedSkill = false;
 for (const skill of technique.skills ?? []) {
  const unlockLevel = typeof skill.unlockLevel === 'number' ? skill.unlockLevel : 1;
  if ((technique.level ?? 1) < unlockLevel) {
   continue;
  }
  if (!skillEnabledMap.has(skill.id)) {
   continue;
  }
  hasResolvedSkill = true;
  if (skillEnabledMap.get(skill.id) !== false) {
   return true;
  }
 }
 return hasResolvedSkill ? false : true;
}
/**
 * isSameAutoBattleSkillList：读取SameAutoBattle技能列表并返回结果。
 * @param previous 参数说明。
 * @param current 参数说明。
 * @returns 无返回值，完成SameAutoBattle技能列表的条件判断。
 */

export function isSameAutoBattleSkillList(previous, current) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 if (previous.length !== current.length) {
  return false;
 }
 for (let index = 0; index < previous.length; index += 1) {
  const left = previous[index];
  const right = current[index];
  if (left.skillId !== right.skillId
   || left.enabled !== right.enabled
   || (left.skillEnabled !== false) !== (right.skillEnabled !== false)
   || (left.autoBattleOrder ?? index) !== (right.autoBattleOrder ?? index)) {
   return false;
  }
 }
 return true;
}
/**
 * tickTemporaryBuffs：执行tickTemporaryBuff相关逻辑。
 * @param buffs 参数说明。
 * @returns 无返回值，直接更新tickTemporaryBuff相关状态。
 */

export function resolveCultivationAuraMultiplier(player, options) {
 const mapped = options?.cultivationAuraMultiplierByPlayerId instanceof Map
  ? options.cultivationAuraMultiplierByPlayerId.get(player.playerId)
  : undefined;
 if (mapped !== undefined) {
  return normalizeCultivationAuraMultiplier(mapped);
 }
 if (typeof options?.resolveCultivationAuraMultiplier === 'function') {
  return normalizeCultivationAuraMultiplier(options.resolveCultivationAuraMultiplier(player));
 }
 return 1;
}

export function normalizeCultivationAuraMultiplier(value) {
 const normalized = Number(value);
 if (!Number.isFinite(normalized) || normalized <= 0) {
  return 1;
 }
 return normalized;
}

export function applyCultivationTileQiPassives(player, options) {
 const passives = collectEnabledCultivationTileQiPassives(player);
 if (passives.length === 0 || typeof options?.getInstanceRuntime !== 'function') {
  return 0;
 }
 const instanceId = typeof player?.instanceId === 'string' ? player.instanceId : '';
 const instance = instanceId ? options.getInstanceRuntime(instanceId) : null;
 if (!instance || typeof instance.addTileResource !== 'function') {
  return 0;
 }
 const centerX = Math.trunc(Number(player.x) || 0);
 const centerY = Math.trunc(Number(player.y) || 0);
 let affected = 0;
 for (const entry of passives) {
  const effect = entry.effect;
  const amount = resolveCultivationPassiveTileQiAmount(player, effect);
  if (amount === 0) {
   continue;
  }
  const radius = Math.max(0, Math.trunc(Number(effect.radius ?? 1) || 0));
  for (let dy = -radius; dy <= radius; dy += 1) {
   for (let dx = -radius; dx <= radius; dx += 1) {
    if (instance.addTileResource(effect.resourceKey, centerX + dx, centerY + dy, amount) !== null) {
     affected += 1;
    }
   }
  }
 }
 return affected;
}

export function isPlayerRuntimeOnline(player) {
 return typeof player?.sessionId === 'string' && player.sessionId.trim().length > 0;
}

export function isRuntimeTransferInProgress(player) {
 return player?.transferState === 'in_transfer'
  || (typeof player?.transferTargetNodeId === 'string' && player.transferTargetNodeId.trim().length > 0);
}

export function isOfflineHangingRuntimeExpired(player) {
 return Number.isFinite(Number(player?.offlineHangingExpiredAt))
  && Number(player.offlineHangingExpiredAt) > 0;
}

export function isOfflineHangingRuntimeReadyForReap(player) {
 return Number.isFinite(Number(player?.offlineHangingReapReadyAt))
  && Number(player.offlineHangingReapReadyAt) > 0;
}

export function shouldResumeIdleCultivation(player, currentTick) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 if (player.hp <= 0
  || isOfflineHangingRuntimeExpired(player)
  || player.combat.cultivationActive
  || player.combat.autoIdleCultivation === false
  || hasRemainingTechniqueActivityQueue(player)
  || hasAnyRemainingTechniqueJob(player)) {
  return false;
 }
 const lastActiveTick = Math.max(0, Math.trunc(Number(player.combat.lastActiveTick) || 0));
 if (lastActiveTick > currentTick) {
  // 收敛旧运行态中已被其他玩家时钟污染的未来时间戳，并重新等待完整空闲窗口。
  player.combat.lastActiveTick = currentTick;
  return false;
 }
 return currentTick - lastActiveTick >= AUTO_IDLE_CULTIVATION_DELAY_TICKS;
}

export function hasDetachedRuntimeActivity(player) {
 if (!player) {
  return false;
 }
 const combat = player.combat ?? {};
 if (combat.cultivationActive === true || combat.autoRootFoundation === true) {
  return true;
 }
 if (combat.autoBattle === true) {
  return true;
 }
 if (hasRemainingTechniqueActivityQueue(player)) {
  return true;
 }
 return hasRemainingRuntimeJob(player.alchemyJob)
  || hasRemainingRuntimeJob(player.forgingJob)
  || hasRemainingRuntimeJob(player.enhancementJob)
  || hasRemainingRuntimeJob(player.transmissionJob)
  || hasRemainingRuntimeJob(player.gatherJob)
  || hasRemainingRuntimeJob(player.buildingJob)
  || hasRemainingRuntimeJob(player.miningJob)
  || hasRemainingRuntimeJob(player.formationJob);
}

export function hasPendingDetachedAutomation(player) {
 const combat = player?.combat ?? {};
 if (!(Number(player?.hp) > 0)) {
  return false;
 }
 if (combat.autoIdleCultivation !== false) {
  return true;
 }
 if (combat.manualEngagePending === true) {
  return true;
 }
 if (combat.autoRetaliate !== true) {
  return false;
 }
 return normalizeOfflineGainString(combat.retaliatePlayerTargetId).length > 0
  || normalizeOfflineGainString(combat.combatTargetId).length > 0;
}

export function hasAnyRemainingTechniqueJob(player) {
 return hasRemainingRuntimeJob(player?.alchemyJob)
  || hasRemainingRuntimeJob(player?.forgingJob)
  || hasRemainingRuntimeJob(player?.enhancementJob)
  || hasRemainingRuntimeJob(player?.transmissionJob)
  || hasRemainingRuntimeJob(player?.gatherJob)
  || hasRemainingRuntimeJob(player?.buildingJob)
  || hasRemainingRuntimeJob(player?.miningJob)
  || hasRemainingRuntimeJob(player?.formationJob);
}

export function hasRemainingRuntimeJob(job) {
 if (!job || typeof job !== 'object') {
  return false;
 }
 return Number(job.remainingTicks) > 0 || Number(job.workRemainingTicks) > 0 || hasLegacyQueuedRuntimeJobs(job);
}

export function hasRemainingTechniqueActivityQueue(player) {
 return Array.isArray(player?.techniqueActivityQueue)
  && player.techniqueActivityQueue.some((entry) => entry && typeof entry === 'object');
}

export function hasLegacyQueuedRuntimeJobs(job) {
 return Array.isArray(job?.queuedJobs)
  && job.queuedJobs.some((entry) => entry && typeof entry === 'object');
}

export function recordPlayerTickPerf(options, key, startedAt, count = 1) {
 const recorder = options?.recordTickSectionDuration;
 if (typeof recorder !== 'function') {
  return;
 }
 recorder(key, performance.now() - startedAt, count);
}

export function recordPlayerTickCount(options, key, count = 1) {
 const recorder = options?.recordTickSectionDuration;
 if (typeof recorder !== 'function') {
  return;
 }
 recorder(key, 0, count);
}


/**
 * 玩家运行时持久化域模块函数集合。
 *
 * 从 player-runtime.helpers.ts 按域拆出的持久化相关函数：
 * 脏域管理、revision/staging 映射、持久化快照构建、
 * 放置实例 ID 归一化、脏域快照归一化等。
 * 原 helpers 文件 import 回来使用。
 *
 * 纯重构迁移，不改变任何方法签名、公开 API、持久化语义或 tick 语义。
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  DUNGEON_MAX_STAMINA,
  TechniqueRealm,
  normalizeCombatAttackIntensity,
} from '@mud/shared';
import { MapTemplateRepository } from '../map/map-template.repository';
import { nextPlayerPersistenceVersion } from '../../persistence/player-domain-persistence.service';
import { markPlayerComprehensionSpeedRateProjectionDirty } from './player-comprehension-speed.helpers';
import {
  cloneAutoUsePillList,
  cloneCombatTargetingRules,
} from './player-combat-config.helpers';
import { materializeRuntimeTemporaryBuff } from './runtime-buff-instance';
import {
  buildPublicPlayerInstanceId,
  cloneAlchemyJob,
  cloneAlchemyPreset,
  cloneBuildingJob,
  cloneCraftSkillState,
  cloneEnhancementJob,
  cloneEnhancementRecord,
  cloneFormationJob,
  cloneGatherJob,
  cloneHeavenGateRoots,
  cloneHeavenGateState,
  cloneMiningJob,
  clonePendingTechniqueComprehensions,
  cloneQuestRuntimeEntries,
  cloneRealmState,
  cloneRuntimeBonusesForSnapshot,
  cloneTechniqueActivityQueue,
  cloneTransmissionJob,
  DEFAULT_PLAYER_STARTER_MAP_ID,
  encodePersistedRawBaseAttrs,
  normalizeCounter,
  resolveRevealedBreakthroughRequirementIds,
} from './player-runtime.helpers';
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

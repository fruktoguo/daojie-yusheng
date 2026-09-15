/**
 * 玩家运行时游离模块函数集合 — 物品克隆/属性克隆域。
 *
 * 从 player-runtime.helpers.ts 拆分而来，包含：
 * - 灵根种子等级判定
 * - 任务运行时条目克隆
 * - 运行时玩家状态全量克隆
 * - 背包物品克隆/实例 ID 修复/合并
 * - 运行时属性/数值统计/bonus 克隆
 * - 生命基准 bonus 保障
 * - runtime bonus 来源规范化
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
import { HEAVEN_SPIRITUAL_ROOT_SEED_ITEM_ID, DIVINE_SPIRITUAL_ROOT_SEED_ITEM_ID, cloneRealmState, cloneHeavenGateState, cloneHeavenGateRoots, normalizePlayerWorldPreferenceLinePreset, createPlayerDirtyDomainSet, RAW_BASE_ATTRS_PERSISTENCE_MARKER, VITAL_BASELINE_BONUS_SOURCE } from './player-runtime.constants';
import { clonePendingTechniqueComprehensions, cloneCraftSkillState, cloneTransmissionJob, cloneGatherJob, cloneBuildingJob, cloneMiningJob, cloneFormationJob, cloneTechniqueActivityQueue, cloneAlchemyPreset } from './player-runtime.technique-queue.helpers';
import { cloneAlchemyJob, cloneEnhancementJob, cloneEnhancementRecord } from './player-runtime.equipment.helpers';
export function resolveSpiritualRootSeedTier(item) {
 if (item?.spiritualRootSeedTier === 'heaven' || item?.spiritualRootSeedTier === 'divine') {
  return item.spiritualRootSeedTier;
 }
 if (item?.itemId === HEAVEN_SPIRITUAL_ROOT_SEED_ITEM_ID) {
  return 'heaven';
 }
 if (item?.itemId === DIVINE_SPIRITUAL_ROOT_SEED_ITEM_ID) {
  return 'divine';
 }
 return null;
}
export function cloneQuestRuntimeEntry(entry) {
 const objectiveType = entry.objectiveType === 'talk'
  || entry.objectiveType === 'submit_item'
  || entry.objectiveType === 'learn_technique'
  || entry.objectiveType === 'realm_progress'
  || entry.objectiveType === 'realm_stage'
  ? entry.objectiveType
  : 'kill';
 const status = entry.status === 'available' || entry.status === 'active' || entry.status === 'ready' || entry.status === 'completed' ? entry.status : 'active';
 const required = Math.max(1, Math.trunc(Number(entry.required ?? 1)));
 const cloned: any = {
  id: typeof entry.id === 'string' ? entry.id : '',
  line: entry.line === 'main' || entry.line === 'daily' || entry.line === 'encounter' ? entry.line : 'side',
  status,
  objectiveType,
  progress: status === 'completed' ? required : normalizeQuestProgressNumber(entry.progress),
  required,
  targetMonsterId: typeof entry.targetMonsterId === 'string' ? entry.targetMonsterId : '',
 };
 if (typeof entry.targetName === 'string' && entry.targetName.trim() && entry.targetName !== cloned.targetMonsterId) {
  cloned.targetName = entry.targetName.trim();
 }
 if (typeof entry.targetTechniqueId === 'string' && entry.targetTechniqueId.trim()) {
  cloned.targetTechniqueId = entry.targetTechniqueId.trim();
 }
 if (Number.isFinite(Number(entry.targetRealmLv)) && Number(entry.targetRealmLv) > 0) {
  cloned.targetRealmLv = Math.floor(Number(entry.targetRealmLv));
 }
 if (Number.isFinite(Number(entry.acceptRealmLv)) && Number(entry.acceptRealmLv) > 0) {
  cloned.acceptRealmLv = Math.floor(Number(entry.acceptRealmLv));
 }
 if (typeof entry.nextQuestId === 'string' && entry.nextQuestId.trim()) {
  cloned.nextQuestId = entry.nextQuestId.trim();
 }
 if (typeof entry.requiredItemId === 'string' && entry.requiredItemId.trim()) {
  cloned.requiredItemId = entry.requiredItemId.trim();
 }
 if (Number.isInteger(entry.requiredItemCount)) {
  cloned.requiredItemCount = Number(entry.requiredItemCount);
 }
 if (typeof entry.giverId === 'string' && entry.giverId.trim()) {
  cloned.giverId = entry.giverId.trim();
 }
 if (typeof entry.targetMapId === 'string' && entry.targetMapId.trim()) {
  cloned.targetMapId = entry.targetMapId.trim();
 }
 if (typeof entry.targetNpcId === 'string' && entry.targetNpcId.trim()) {
  cloned.targetNpcId = entry.targetNpcId.trim();
 }
 if (typeof entry.submitNpcId === 'string' && entry.submitNpcId.trim()) {
  cloned.submitNpcId = entry.submitNpcId.trim();
 }
 if (typeof entry.submitMapId === 'string' && entry.submitMapId.trim()) {
  cloned.submitMapId = entry.submitMapId.trim();
 }
 if (typeof entry.guideFlowId === 'string' && entry.guideFlowId.trim()) {
  cloned.guideFlowId = entry.guideFlowId.trim();
 }
 return cloned;
}
export function normalizeQuestProgressNumber(value) {
 const numeric = Number(value);
 return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
}

export function cloneQuestRuntimeEntries(entries) {
 if (!Array.isArray(entries) || entries.length === 0) {
  return [];
 }
 const clonedEntries = [];
 for (const entry of entries) {
  clonedEntries.push(cloneQuestRuntimeEntry(entry));
 }
 return clonedEntries;
}

/**
 * cloneRuntimePlayerState：构建运行态玩家状态。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新运行态玩家状态相关状态。
 */

export function cloneRuntimePlayerState(player) {
 return {
  ...player,
  transferBufferedNotices: Array.isArray(player.transferBufferedNotices)
   ? player.transferBufferedNotices.map((entry) => ({ ...entry }))
   : [],
  runtimeOwnerId: typeof player.runtimeOwnerId === 'string' ? player.runtimeOwnerId : null,
  sessionEpoch: Number.isFinite(player.sessionEpoch) ? Math.trunc(Number(player.sessionEpoch)) : 0,
  lastHeartbeatAt: Number.isFinite(player.lastHeartbeatAt)
   ? Math.trunc(Number(player.lastHeartbeatAt))
   : null,
  offlineSinceAt: Number.isFinite(player.offlineSinceAt)
   ? Math.trunc(Number(player.offlineSinceAt))
   : null,
  realm: cloneRealmState(player.realm),
  heavenGate: cloneHeavenGateState(player.heavenGate),
  spiritualRoots: cloneHeavenGateRoots(player.spiritualRoots),
  worldPreference: {
   linePreset: normalizePlayerWorldPreferenceLinePreset(player.worldPreference?.linePreset),
  },
  bodyTraining: player.bodyTraining ? { ...player.bodyTraining } : null,
  unlockedMapIds: player.unlockedMapIds.slice(),
  inventory: {
   revision: player.inventory.revision,
   capacity: player.inventory.capacity,
   items: player.inventory.items.map((entry) => cloneItemPreservingTemplate(entry)),
   lockedItems: Array.isArray(player.inventory.lockedItems)
    ? player.inventory.lockedItems.map((entry) => ({ ...entry }))
    : [],
  },
  wallet: {
   balances: Array.isArray(player.wallet?.balances)
    ? player.wallet.balances.map((entry) => ({ ...entry }))
    : [],
  },
  marketStorage: {
   items: Array.isArray(player.marketStorage?.items)
    ? player.marketStorage.items.map((entry) => ({ ...entry }))
    : [],
  },
  equipment: {
   revision: player.equipment.revision,
   slots: player.equipment.slots.map((entry) => ({
    slot: entry.slot,
    item: entry.item ? cloneItemPreservingTemplate(entry.item) : null,
   })),
  },
  artifacts: {
   revision: Math.max(1, Math.trunc(Number(player.artifacts?.revision ?? 1) || 1)),
   slots: (player.artifacts?.slots ?? []).map((entry) => ({
    slot: entry.slot,
    unlocked: entry.unlocked === true,
    enabled: entry.enabled !== false,
    qi: Math.max(0, Number(entry.qi) || 0),
    maxQi: Math.max(0, Number(entry.maxQi) || 0),
    item: entry.item ? cloneItemPreservingTemplate(entry.item) : null,
   })),
  },
  techniques: {
   revision: player.techniques.revision,
   techniques: player.techniques.techniques.map((entry) => ({ ...entry })),
   cultivatingTechId: player.techniques.cultivatingTechId,
   pendingComprehensions: clonePendingTechniqueComprehensions(player.pendingTechniqueComprehensions),
  },
  attrs: cloneRuntimeAttrState(player.attrs),
  actions: {
   revision: player.actions.revision,
   contextActions: player.actions.contextActions.map((entry) => ({ ...entry })),
   actions: player.actions.actions.map((entry) => ({ ...entry })),
  },
  buffs: {
   revision: player.buffs.revision,
   buffs: player.buffs.buffs.map((entry) => createRuntimeTemporaryBuff(entry)),
  },
  combat: {
   cooldownReadyTickBySkillId: { ...player.combat.cooldownReadyTickBySkillId },
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
   autoBattleSkills: player.combat.autoBattleSkills.map((entry) => ({ ...entry })),
   cultivationActive: player.combat.cultivationActive,
   lastActiveTick: player.combat.lastActiveTick,
   combatActionTick: player.combat.combatActionTick ?? 0,
   combatActionsUsedThisTick: player.combat.combatActionsUsedThisTick ?? 0,
  },
  notices: {
   nextId: player.notices.nextId,
   queue: player.notices.queue.map((entry) => ({ ...entry })),
  },
  quests: {
   revision: player.quests.revision,
   quests: cloneQuestRuntimeEntries(player.quests.quests),
  },
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
  lootWindowTarget: player.lootWindowTarget
   ? { ...player.lootWindowTarget }
   : null,
  pendingLogbookMessages: player.pendingLogbookMessages.map((entry) => ({ ...entry })),
  vitalRecoveryDeferredUntilTick: player.vitalRecoveryDeferredUntilTick,
  runtimeBonuses: cloneRuntimeBonusesForSnapshot(player.runtimeBonuses),
  dirtyDomains: createPlayerDirtyDomainSet(),
  // cloneRuntimePlayerState 用于快照/旁路读取，不应共享 quest marker cache 引用；新副本起一个空 Map。
  npcQuestMarkerCache: new Map(),
 };
}
export function clamp(value, min, max) {
 return Math.max(min, Math.min(max, value));
}
/**
 * compareInventoryItems：执行compare背包道具相关逻辑。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，直接更新compare背包道具相关状态。
 */

/**
 * consumeInventoryItemAt：执行consume背包道具At相关逻辑。
 * @param items 道具列表。
 * @param slotIndex 参数说明。
 * @param count 数量。
 * @returns 无返回值，直接更新consume背包道具At相关状态。
 */

/**
 * coalesceInventoryItems：就地合并同 (itemId, enhanceLevel) 签名的堆叠。
 *
 * 水合期调用一次：把之前因 canMergeItemStack 过于严格而被拆成多个 slot
 * 的同签名物品重新合到同一 slot（count 相加，后续 slot 被移除）。
 * 合并后保留首个遇到的 slot 的 itemInstanceId（现有堆叠胜出）。
 */
export function coalesceInventoryItems(items: any[] | null | undefined): boolean {
 return coalesceItemStackList(items);
}

export function repairDuplicateInventoryItemInstanceIds(items: any[]): boolean {
 if (!Array.isArray(items) || items.length <= 1) {
  return false;
 }
 const seen = new Set<string>();
 let repaired = false;
 for (const item of items) {
  if (!item || typeof item !== 'object') {
   continue;
  }
  const itemInstanceId = typeof item.itemInstanceId === 'string' ? item.itemInstanceId.trim() : '';
  if (!itemInstanceId || !seen.has(itemInstanceId)) {
   if (itemInstanceId) {
    seen.add(itemInstanceId);
   }
   continue;
  }
  item.itemInstanceId = randomUUID();
  seen.add(item.itemInstanceId);
  repaired = true;
 }
 return repaired;
}

export function normalizeInventoryItemInstanceId(value: unknown): string {
 return typeof value === 'string' ? value.trim() : '';
}

export function findInventoryItemIndexByInstanceId(items: any[] | null | undefined, itemInstanceId: unknown): number {
 const normalized = normalizeInventoryItemInstanceId(itemInstanceId);
 if (!normalized || !Array.isArray(items)) {
  return -1;
 }
 return items.findIndex((item) =>
  item
  && typeof item === 'object'
  && normalizeInventoryItemInstanceId((item as { itemInstanceId?: unknown }).itemInstanceId) === normalized,
 );
}

export function consumeInventoryItemAt(items, slotIndex, count) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 const item = items[slotIndex];
 if (!item) {
  return;
 }
 if (item.count <= count) {
  items.splice(slotIndex, 1);
  return;
 }
 item.count -= count;
}

export function takeSingleInventoryItemForEquipment(items, slotIndex) {
 const item = items[slotIndex];
 if (!item) {
  return null;
 }
 const itemCount = Math.max(1, Math.trunc(Number(item.count ?? 1)));
 if (itemCount <= 1) {
  // 堆叠仅 1 件：原 slot 整体移除，克隆继承原 itemInstanceId（不会发生 PK 冲突）
  const [removed] = items.splice(slotIndex, 1);
  return cloneItemWithCountPreservingTemplate(removed, 1);
 }
 item.count = itemCount - 1;
 const cloned = cloneItemWithCountPreservingTemplate(item, 1);
 // 从 count > 1 的堆叠里拆 1 件出来：被拆出的那件必须分配新 itemInstanceId，
 // 否则剩余堆叠（仍在背包）和被拆出的那件（即将进入装备槽 / 强化 / 挂单 / 掉落）
 // 会在 player_inventory_item / player_equipment_slot 等表上共用同一 PK。
 if (typeof (cloned as any).itemInstanceId === 'string' && (cloned as any).itemInstanceId.length > 0) {
  (cloned as { itemInstanceId?: string }).itemInstanceId = randomUUID();
 }
 return cloned;
}

export function cloneItemWithCountPreservingTemplate(item, count) {
 if (!item || typeof item !== 'object') {
  return item;
 }
 const cloned = cloneItemOwnFieldsPreservingTemplate(item);
 defineClonedItemValue(cloned, 'count', count);
 return cloned;
}

export function cloneItemPreservingTemplate(item) {
 if (!item || typeof item !== 'object') {
  return item;
 }
 return cloneItemOwnFieldsPreservingTemplate(item);
}

export function cloneItemOwnFieldsPreservingTemplate(item) {
 const cloned = Object.create(Object.getPrototypeOf(item));
 for (const [key, value] of Object.entries(item)) {
  defineClonedItemValue(cloned, key, value);
 }
 return cloned;
}

export function defineClonedItemValue(target, key, value) {
 Object.defineProperty(target, key, {
  value,
  enumerable: true,
  configurable: true,
  writable: true,
 });
}
/**
 * toTechniqueUpdateEntry：处理to功法Update条目并更新相关状态。
 * @param technique 参数说明。
 * @returns 无返回值，直接更新to功法Update条目相关状态。
 */

export function cloneRuntimeAttrState(source) {
 return {
  revision: source.revision,
  stage: source.stage,
  rawBaseAttrs: cloneAttributes(source.rawBaseAttrs ?? createDefaultBaseAttributes()),
  baseAttrs: cloneAttributes(source.baseAttrs),
  finalAttrs: cloneAttributes(source.finalAttrs),
  numericStats: cloneNumericStats(source.numericStats),
  ratioDivisors: cloneNumericRatioDivisors(source.ratioDivisors),
  craftEffectStats: cloneCraftEffectStats(source.craftEffectStats),
 };
}
/**
 * cloneAttributes：构建Attribute。
 * @param source 来源对象。
 * @returns 无返回值，直接更新Attribute相关状态。
 */

export function cloneAttributes(source) {
 return {
  constitution: source.constitution,
  spirit: source.spirit,
  perception: source.perception,
  talent: source.talent,
  strength: source.strength ?? source.comprehension ?? 0,
  meridians: source.meridians ?? source.luck ?? 0,
 };
}

export function createDefaultBaseAttributes(): Record<string, number> {
 return {
  constitution: DEFAULT_BASE_ATTRS.constitution,
  spirit: DEFAULT_BASE_ATTRS.spirit,
  perception: DEFAULT_BASE_ATTRS.perception,
  talent: DEFAULT_BASE_ATTRS.talent,
  strength: DEFAULT_BASE_ATTRS.strength,
  meridians: DEFAULT_BASE_ATTRS.meridians,
 };
}

export function normalizeRawBaseAttributes(source) {
 const attrs = createDefaultBaseAttributes();
 if (!source || typeof source !== 'object') {
  return attrs;
 }
 for (const key of ATTR_KEYS) {
  const value = Number(source[key]);
  if (Number.isFinite(value)) {
   attrs[key] = Math.max(0, Math.trunc(value));
  }
 }
 const legacyStrength = Number(source.comprehension);
 if (!Number.isFinite(Number(source.strength)) && Number.isFinite(legacyStrength)) {
  attrs.strength = Math.max(0, Math.trunc(legacyStrength));
 }
 const legacyMeridians = Number(source.luck);
 if (!Number.isFinite(Number(source.meridians)) && Number.isFinite(legacyMeridians)) {
  attrs.meridians = Math.max(0, Math.trunc(legacyMeridians));
 }
 return attrs;
}

export function encodePersistedRawBaseAttrs(source) {
 return {
  ...normalizeRawBaseAttributes(source),
  [RAW_BASE_ATTRS_PERSISTENCE_MARKER]: true,
 };
}

export function decodePersistedRawBaseAttrs(source) {
 if (!source || typeof source !== 'object' || source[RAW_BASE_ATTRS_PERSISTENCE_MARKER] !== true) {
  return createDefaultBaseAttributes();
 }
 return normalizeRawBaseAttributes(source);
}
/**
 * cloneNumericStats：构建NumericStat。
 * @param source 来源对象。
 * @returns 无返回值，直接更新NumericStat相关状态。
 */

export function cloneNumericStats(source) {
 return {
  maxHp: source.maxHp,
  maxQi: source.maxQi,
  physAtk: source.physAtk,
  spellAtk: source.spellAtk,
  physDef: source.physDef,
  spellDef: source.spellDef,
  hit: source.hit,
  dodge: source.dodge,
  crit: source.crit,
  antiCrit: source.antiCrit,
  critDamage: source.critDamage,
  breakPower: source.breakPower,
  resolvePower: source.resolvePower,
  maxQiOutputPerTick: source.maxQiOutputPerTick,
  qiRegenRate: source.qiRegenRate,
  hpRegenRate: source.hpRegenRate,
  cooldownSpeed: source.cooldownSpeed,
  auraCostReduce: source.auraCostReduce,
  auraPowerRate: source.auraPowerRate,
  playerExpRate: source.playerExpRate,
  techniqueExpRate: source.techniqueExpRate,
  realmExpPerTick: source.realmExpPerTick,
  techniqueExpPerTick: source.techniqueExpPerTick,
  lootRate: source.lootRate,
  rareLootRate: source.rareLootRate,
  viewRange: source.viewRange,
  moveSpeed: source.moveSpeed,
  extraAggroRate: source.extraAggroRate,
  extraRange: source.extraRange ?? 0,
  extraArea: source.extraArea ?? 0,
  actionsPerTurn: source.actionsPerTurn ?? 1,
  elementDamageBonus: {
   metal: source.elementDamageBonus.metal,
   wood: source.elementDamageBonus.wood,
   water: source.elementDamageBonus.water,
   fire: source.elementDamageBonus.fire,
   earth: source.elementDamageBonus.earth,
  },
  elementDamageReduce: {
   metal: source.elementDamageReduce.metal,
   wood: source.elementDamageReduce.wood,
   water: source.elementDamageReduce.water,
   fire: source.elementDamageReduce.fire,
   earth: source.elementDamageReduce.earth,
  },
 };
}
/**
 * cloneNumericRatioDivisors：判断NumericRatioDivisor是否满足条件。
 * @param source 来源对象。
 * @returns 无返回值，直接更新NumericRatioDivisor相关状态。
 */

export function cloneNumericRatioDivisors(source) {
 return {
  dodge: source.dodge,
  crit: source.crit,
  breakPower: source.breakPower,
  resolvePower: source.resolvePower,
  cooldownSpeed: source.cooldownSpeed,
  moveSpeed: source.moveSpeed,
  elementDamageReduce: {
   metal: source.elementDamageReduce.metal,
   wood: source.elementDamageReduce.wood,
   water: source.elementDamageReduce.water,
   fire: source.elementDamageReduce.fire,
   earth: source.elementDamageReduce.earth,
  },
 };
}
/**
 * cloneRuntimeBonus：构建运行态Bonu。
 * @param source 来源对象。
 * @returns 无返回值，直接更新运行态Bonu相关状态。
 */

export function cloneRuntimeBonus(source) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 if (!source || typeof source !== 'object') {
  return null;
 }
 return {

  source: canonicalizeRuntimeBonusSource(typeof source.source === 'string' ? source.source : ''),

  label: typeof source.label === 'string' ? source.label : undefined,
  attrs: source.attrs ? { ...source.attrs } : undefined,
  stats: source.stats ? { ...source.stats } : undefined,
  qiProjection: Array.isArray(source.qiProjection) ? source.qiProjection.map((entry) => ({ ...entry })) : undefined,

  meta: source.meta && typeof source.meta === 'object' ? { ...source.meta } : undefined,
 };
}

export function cloneRuntimeBonusesForSnapshot(source) {
 if (!Array.isArray(source) || source.length === 0) {
  return [];
 }
 const bonuses = [];
 for (const entry of source) {
  if (!shouldKeepRuntimeBonusSource(entry)) {
   continue;
  }
  const cloned = cloneRuntimeBonus(entry);
  if (cloned) {
   bonuses.push(cloned);
  }
 }
 return bonuses;
}

export function shouldKeepRuntimeBonusSource(entry) {
 return Boolean(entry && typeof entry === 'object' && shouldKeepRuntimeBonusSourceId(entry.source));
}

export function shouldKeepRuntimeBonus(entry) {
 return Boolean(entry?.source && shouldKeepRuntimeBonusSourceId(entry.source));
}

export function shouldKeepRuntimeBonusSourceId(source) {
 return typeof source === 'string' && source.trim().length > 0 && !isDerivedPersistentRuntimeBonusSource(canonicalizeRuntimeBonusSource(source));
}

export function isDerivedPersistentRuntimeBonusSource(source) {
 const normalized = typeof source === 'string' ? source.trim() : '';
 return normalized === 'runtime:realm_stage'
  || normalized === 'runtime:realm_state'
  || normalized === 'runtime:heaven_gate_roots'
  || normalized === 'runtime:technique_aggregate'
  || normalized === 'technique:aggregate'
  || normalized === 'realm:state'
  || normalized === 'realm:stage'
  || normalized === 'heaven_gate:roots'
  || normalized.startsWith('technique:')
  || normalized.startsWith('equipment:')
  || normalized.startsWith('equip:')
  || normalized.startsWith('equip-effect:')
  || normalized.startsWith('body_training:')
  || normalized.startsWith('buff:');
}
/**
 * ensureVitalBaselineBonus：执行ensureVitalBaselineBonu相关逻辑。
 * @param player 玩家对象。
 * @param vitals 参数说明。
 * @returns 无返回值，直接更新ensureVitalBaselineBonu相关状态。
 */

export function ensureVitalBaselineBonus(player, vitals) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 if (!vitals || !Array.isArray(player.runtimeBonuses)) {
  return false;
 }

 const baselineHp = Number.isFinite(vitals.maxHp) ? Math.max(1, Math.round(vitals.maxHp)) : 0;

 const baselineQi = Number.isFinite(vitals.maxQi) ? Math.max(0, Math.round(vitals.maxQi)) : 0;

 const currentMaxHp = Math.max(1, Math.round(player.maxHp));

 const currentMaxQi = Math.max(0, Math.round(player.maxQi));

 const hpDelta = Math.max(0, baselineHp - currentMaxHp);

 const qiDelta = Math.max(0, baselineQi - currentMaxQi);

 const hpRatio = currentMaxHp > 0 ? baselineHp / currentMaxHp : 1;

 const qiRatio = currentMaxQi > 0 ? baselineQi / currentMaxQi : 1;

 const nextBonuses = player.runtimeBonuses.filter((entry) => entry?.source !== VITAL_BASELINE_BONUS_SOURCE);
 if (hpDelta <= 0 && qiDelta <= 0) {
  if (nextBonuses.length === player.runtimeBonuses.length) {
   return false;
  }
  player.runtimeBonuses = nextBonuses;
  return true;
 }

 const stats: Record<string, number> = {};
 if (hpDelta > 0) {
  stats.maxHp = hpDelta;
  if (player.attrs.numericStats.hpRegenRate > 0 && hpRatio > 1) {
   stats.hpRegenRate = Math.max(0, Math.round(player.attrs.numericStats.hpRegenRate * (hpRatio - 1)));
  }
 }
 if (qiDelta > 0) {
  stats.maxQi = qiDelta;
  if (player.attrs.numericStats.qiRegenRate > 0 && qiRatio > 1) {
   stats.qiRegenRate = Math.max(0, Math.round(player.attrs.numericStats.qiRegenRate * (qiRatio - 1)));
  }
  if (player.attrs.numericStats.maxQiOutputPerTick > 0 && qiRatio > 1) {
   stats.maxQiOutputPerTick = Math.max(0, Math.round(player.attrs.numericStats.maxQiOutputPerTick * (qiRatio - 1)));
  }
 }
 nextBonuses.push({
  source: VITAL_BASELINE_BONUS_SOURCE,
  label: '生命灵力基线补正',
  stats,
  meta: {
   baselineHp,
   baselineQi,
  },
 });
 player.runtimeBonuses = nextBonuses;
 return true;
}
/**
 * canonicalizeRuntimeBonusSource：判断canonicalize运行态Bonu来源是否满足条件。
 * @param source 来源对象。
 * @returns 无返回值，完成canonicalize运行态Bonu来源的条件判断。
 */

export function canonicalizeRuntimeBonusSource(source) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 const normalized = typeof source === 'string' ? source.trim() : '';
 if (!normalized) {
  return '';
 }
 if (normalized === 'technique:aggregate') {
  return 'runtime:technique_aggregate';
 }
 if (normalized === 'realm:state') {
  return 'runtime:realm_state';
 }
 if (normalized === 'realm:stage') {
  return 'runtime:realm_stage';
 }
 if (normalized === 'heaven_gate:roots') {
  return 'runtime:heaven_gate_roots';
 }
 if (normalized.startsWith('equip:')) {
  return `equipment:${normalized.slice('equip:'.length)}`;
 }
 return normalized;
}


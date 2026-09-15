/**
 * 玩家运行时游离模块函数集合 — buff 判定/比较/tick/PvP buff 域。
 *
 * 从 player-runtime.helpers.ts 拆分而来，包含：
 * - buff 活跃判定与属性影响检查
 * - buff payload 比较（属性/原型/引用）
 * - buff tick 效果（伤害/持续消耗）
 * - 生命/体力恢复
 * - 技能冷却 action 状态
 * - PvP 灵魂创伤/煞气灌注/煞气反噬/天道压制 buff 状态构建
 * - 通用 buff 辅助（冻结模板/实体查询/衰减/重生保留/消耗品 buff 转换）
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
import { pvpSoulInjuryBuffByRealmLv, pvpShaInfusionBuffByRealmLv, pvpShaBacklashBuffByRealmLv, heavenlyDaoSuppressionBuffByRealmLv } from './player-runtime.constants';
export const TEMPORARY_BUFF_PROTOTYPE_COMPARE_KEYS = [
 'buffId',
 'name',
 'desc',
 'baseDesc',
 'shortMark',
 'category',
 'visibility',
 'sourceSkillId',
 'sourceSkillName',
 'color',
 'presentationScale',
 'ignoreRealmEffectiveness',
 'sustainCost',
 'expireWithBuffId',
 'immuneToCleanse',
 'sourceCasterId',
];

export function isRuntimeBuffActive(buff) {
 return Boolean(buff && buff.remainingTicks > 0 && buff.stacks > 0);
}

export function doesTemporaryBuffAffectAttributes(buff) {
 return Boolean(buff && (
  buff.attrs
  || buff.stats
  || buff.buffId === HEAVENLY_DAO_SUPPRESSION_BUFF_ID
  || buff.buffId === PVP_SOUL_INJURY_BUFF_ID
  || buff.buffId === DUNGEON_PRESSURE_BUFF_ID
 ));
}

export function doesBuffAffectAttributeProjection(player, buff) {
 return doesTemporaryBuffAffectAttributes(buff) || doesBuffGateEquipmentProgressEffect(player, buff?.buffId);
}

export function doesBuffAffectVitalCapacityProjection(player, buff) {
 return doesTemporaryBuffAffectVitalCapacity(buff)
  || doesBuffGateVitalCapacityEquipmentProgressEffect(player, buff?.buffId);
}

export function doesTemporaryBuffAffectVitalCapacity(buff) {
 if (!buff) {
  return false;
 }
 if (buff.buffId === HEAVENLY_DAO_SUPPRESSION_BUFF_ID || buff.buffId === PVP_SOUL_INJURY_BUFF_ID || buff.buffId === DUNGEON_PRESSURE_BUFF_ID) {
  return true;
 }
 if (hasNonZeroNumericValue(buff.stats?.maxHp) || hasNonZeroNumericValue(buff.stats?.maxQi)) {
  return true;
 }
 for (const attrKey of ATTR_KEYS) {
  if (!hasNonZeroNumericValue(buff.attrs?.[attrKey])) {
   continue;
  }
  const flatWeights = ATTR_TO_NUMERIC_WEIGHTS[attrKey];
  const percentWeights = ATTR_TO_PERCENT_NUMERIC_WEIGHTS[attrKey];
  if (hasVitalCapacityWeight(flatWeights) || hasVitalCapacityWeight(percentWeights)) {
   return true;
  }
 }
 return false;
}

export function hasVitalCapacityWeight(weights) {
 return hasNonZeroNumericValue(weights?.maxHp) || hasNonZeroNumericValue(weights?.maxQi);
}

export function hasNonZeroNumericValue(value) {
 return value !== undefined && Number(value) !== 0;
}

export function doesBuffGateEquipmentProgressEffect(player, buffId) {
 const normalizedBuffId = typeof buffId === 'string' ? buffId.trim() : '';
 if (!normalizedBuffId) {
  return false;
 }
 for (const slotEntry of player?.equipment?.slots ?? []) {
  const effects = Array.isArray(slotEntry?.item?.effects) ? slotEntry.item.effects : [];
  for (const effect of effects) {
   if (effect?.type !== 'progress_boost') {
    continue;
   }
   if (doesEquipmentConditionListReferenceBuff(effect.conditions, normalizedBuffId)) {
    return true;
   }
  }
 }
 return false;
}

export function doesBuffGateVitalCapacityEquipmentProgressEffect(player, buffId) {
 const normalizedBuffId = typeof buffId === 'string' ? buffId.trim() : '';
 if (!normalizedBuffId) {
  return false;
 }
 for (const slotEntry of player?.equipment?.slots ?? []) {
  const effects = Array.isArray(slotEntry?.item?.effects) ? slotEntry.item.effects : [];
  for (const effect of effects) {
   if (effect?.type !== 'progress_boost'
    || !doesEquipmentConditionListReferenceBuff(effect.conditions, normalizedBuffId)) {
    continue;
   }
   if (doesTemporaryBuffAffectVitalCapacity(effect)) {
    return true;
   }
   if (hasNonZeroNumericValue(effect.valueStats?.maxHp)
    || hasNonZeroNumericValue(effect.valueStats?.maxQi)) {
    return true;
   }
  }
 }
 return false;
}

export function doesEquipmentConditionListReferenceBuff(conditions, buffId) {
 const items = Array.isArray(conditions?.items) ? conditions.items : [];
 return items.some((condition) => condition?.type === 'has_buff' && condition.buffId === buffId);
}

export function isSameTemporaryBuffAttributePayload(left, right) {
 return (left?.buffId ?? undefined) === (right?.buffId ?? undefined)
  && (left?.sourceSkillId ?? undefined) === (right?.sourceSkillId ?? undefined)
  && (left?.attrMode ?? undefined) === (right?.attrMode ?? undefined)
  && (left?.statMode ?? undefined) === (right?.statMode ?? undefined)
  && (left?.realmLv ?? undefined) === (right?.realmLv ?? undefined)
  && (left?.ignoreRealmEffectiveness === true) === (right?.ignoreRealmEffectiveness === true)
  && isSamePlainObjectValue(left?.attrs, right?.attrs)
  && isSamePlainObjectValue(left?.stats, right?.stats);
}

export function isSameTemporaryBuffPrototypePayload(left, right) {
 if (!isSameTemporaryBuffAttributePayload(left, right)
  || !isSamePlainObjectValue(left?.qiProjection, right?.qiProjection)
  || !isSamePlainObjectValue(left?.tickEffects, right?.tickEffects)) {
  return false;
 }
 for (const key of TEMPORARY_BUFF_PROTOTYPE_COMPARE_KEYS) {
  if ((left?.[key] ?? undefined) !== (right?.[key] ?? undefined)) {
   return false;
  }
 }
 return true;
}

export function isNonConsumableTemporaryBuffReapplyNoop(existing, buff) {
 const nextStacks = Math.min(buff.maxStacks, existing.stacks + Math.max(1, buff.stacks));
 const nextSustainTicksElapsed = buff.sustainCost
  ? Math.max(0, Math.floor(Number(existing.sustainTicksElapsed ?? buff.sustainTicksElapsed ?? 0) || 0))
  : undefined;
 return existing.remainingTicks === buff.remainingTicks
  && existing.duration === buff.duration
  && existing.stacks === nextStacks
  && existing.maxStacks === buff.maxStacks
  && existing.realmLv === buff.realmLv
  && (existing.infiniteDuration === true) === (buff.infiniteDuration === true)
  && existing.sustainTicksElapsed === nextSustainTicksElapsed
  && (existing.persistOnDeath === true) === (buff.persistOnDeath === true)
  && (existing.persistOnReturnToSpawn === true) === (buff.persistOnReturnToSpawn === true)
  && isSameTemporaryBuffReferencePayload(existing, buff);
}

export function isSameTemporaryBuffReferencePayload(left, right) {
 if ((left?.buffId ?? undefined) !== (right?.buffId ?? undefined)
  || (left?.sourceSkillId ?? undefined) !== (right?.sourceSkillId ?? undefined)
  || (left?.attrMode ?? undefined) !== (right?.attrMode ?? undefined)
  || (left?.statMode ?? undefined) !== (right?.statMode ?? undefined)
  || (left?.attrs ?? undefined) !== (right?.attrs ?? undefined)
  || (left?.stats ?? undefined) !== (right?.stats ?? undefined)
  || (left?.qiProjection ?? undefined) !== (right?.qiProjection ?? undefined)
  || (left?.tickEffects ?? undefined) !== (right?.tickEffects ?? undefined)) {
  return false;
 }
 for (const key of TEMPORARY_BUFF_PROTOTYPE_COMPARE_KEYS) {
  if ((left?.[key] ?? undefined) !== (right?.[key] ?? undefined)) {
   return false;
  }
 }
 return true;
}

export function isSamePlainObjectValue(left, right) {
 if (left === right) {
  return true;
 }
 if (left === undefined || left === null || right === undefined || right === null) {
  return left === right;
 }
 if (typeof left !== 'object' || typeof right !== 'object') {
  return left === right;
 }
 if (Array.isArray(left) || Array.isArray(right)) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
   return false;
  }
  for (let index = 0; index < left.length; index += 1) {
   if (!isSamePlainObjectValue(left[index], right[index])) {
    return false;
   }
  }
  return true;
 }
 const leftKeys = Object.keys(left);
 const rightKeys = Object.keys(right);
 if (leftKeys.length !== rightKeys.length) {
  return false;
 }
 for (const key of leftKeys) {
  if (!Object.hasOwn(right, key) || !isSamePlainObjectValue(left[key], right[key])) {
   return false;
  }
 }
 return true;
}

export const TICK_TEMPORARY_BUFFS_UNCHANGED = Object.freeze({
 changed: false,
 durationChanged: false,
 attrChanged: false,
 listChanged: false,
 vitalsChanged: false,
 defeated: false,
});
export const BUFF_TICK_EFFECTS_UNCHANGED = Object.freeze({ vitalsChanged: false });
export const BUFF_SUSTAIN_COST_UNCHANGED = Object.freeze({ sustained: true, vitalsChanged: false });

export function tickTemporaryBuffs(buffs, player = null) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 if (!Array.isArray(buffs) || buffs.length === 0) {
  return TICK_TEMPORARY_BUFFS_UNCHANGED;
 }
 let durationChanged = false;
 let attrChanged = false;
 let listChanged = false;
 let vitalsChanged = false;
 let defeated = false;
 let hasDependentBuff = false;
 let activeBuffIds = null;
 for (let index = 0; index < buffs.length; index += 1) {
  const entry = buffs[index];
  if (entry && entry.remainingTicks > 0 && entry.stacks > 0 && entry.expireWithBuffId) {
   hasDependentBuff = true;
   break;
  }
 }
 if (hasDependentBuff) {
  activeBuffIds = new Set();
  for (let index = 0; index < buffs.length; index += 1) {
   const entry = buffs[index];
   if (entry && entry.remainingTicks > 0 && entry.stacks > 0) {
    activeBuffIds.add(entry.buffId);
   }
  }
 }
 for (let index = 0; index < buffs.length; index += 1) {
  const buff = buffs[index];
  if (buff.remainingTicks <= 0) {
   continue;
  }
  if (activeBuffIds && buff.expireWithBuffId && !activeBuffIds.has(buff.expireWithBuffId)) {
   buff.remainingTicks = 0;
   attrChanged = doesBuffAffectAttributeProjection(player, buff) || attrChanged;
   vitalsChanged = doesBuffAffectVitalCapacityProjection(player, buff) || vitalsChanged;
   listChanged = true;
   continue;
  }
  if (player && Array.isArray(buff.tickEffects) && buff.tickEffects.length > 0) {
   const tickEffectResult = applyBuffTickEffects(player, buff);
   if (tickEffectResult.vitalsChanged) {
    vitalsChanged = true;
    if (player.hp <= 0) {
     defeated = true;
    }
   }
  }
  if (buff.infiniteDuration === true) {
   if (buff.sustainCost && player) {
    const sustainResult = applyBuffSustainCost(player, buff);
    vitalsChanged = vitalsChanged || sustainResult.vitalsChanged;
    if (!sustainResult.sustained) {
     buff.remainingTicks = 0;
     attrChanged = doesBuffAffectAttributeProjection(player, buff) || attrChanged;
     vitalsChanged = doesBuffAffectVitalCapacityProjection(player, buff) || vitalsChanged;
     listChanged = true;
     continue;
    }
   }
   if (!Number.isInteger(buff.remainingTicks) || buff.remainingTicks < 1) {
    const nextRemainingTicks = Math.max(1, Math.round(Number(buff.remainingTicks) || 1));
    buff.remainingTicks = nextRemainingTicks;
    durationChanged = true;
   }
   continue;
  }
  buff.remainingTicks -= 1;
  durationChanged = true;
  if (buff.remainingTicks <= 0 && isDecayStackBuff(buff)) {
   if (buff.stacks > 1) {
    buff.stacks -= 1;
    buff.remainingTicks = Math.max(1, Math.round(buff.duration || 1));
    attrChanged = doesBuffAffectAttributeProjection(player, buff) || attrChanged;
    vitalsChanged = doesBuffAffectVitalCapacityProjection(player, buff) || vitalsChanged;
   }
  }
  if (buff.remainingTicks <= 0 || buff.stacks <= 0) {
   attrChanged = doesBuffAffectAttributeProjection(player, buff) || attrChanged;
   vitalsChanged = doesBuffAffectVitalCapacityProjection(player, buff) || vitalsChanged;
   listChanged = true;
  }
 }

 if (hasDependentBuff && (attrChanged || listChanged)) {
  const finalActiveBuffIds = new Set();
  for (let index = 0; index < buffs.length; index += 1) {
   const entry = buffs[index];
   if (entry && entry.remainingTicks > 0 && entry.stacks > 0) {
    finalActiveBuffIds.add(entry.buffId);
   }
  }
  for (let index = 0; index < buffs.length; index += 1) {
   const buff = buffs[index];
   if (buff.remainingTicks > 0 && buff.expireWithBuffId && !finalActiveBuffIds.has(buff.expireWithBuffId)) {
    buff.remainingTicks = 0;
    attrChanged = doesBuffAffectAttributeProjection(player, buff) || attrChanged;
    vitalsChanged = doesBuffAffectVitalCapacityProjection(player, buff) || vitalsChanged;
    listChanged = true;
   }
  }
 }
 if (listChanged) {
  let writeIndex = 0;
  for (let index = 0; index < buffs.length; index += 1) {
   const buff = buffs[index];
   if (buff.remainingTicks > 0 && buff.stacks > 0) {
    buffs[writeIndex] = buff;
    writeIndex += 1;
   }
  }
  buffs.length = writeIndex;
 }
 const changed = durationChanged || attrChanged || listChanged || vitalsChanged;
 if (!changed) {
  return TICK_TEMPORARY_BUFFS_UNCHANGED;
 }
 return { changed, durationChanged, attrChanged, listChanged, vitalsChanged, defeated };
}

export function applyBuffTickEffects(player, buff) {
 if (!player || !buff || !Array.isArray(buff.tickEffects) || buff.tickEffects.length === 0) {
  return BUFF_TICK_EFFECTS_UNCHANGED;
 }
 let vitalsChanged = false;
 for (const effect of buff.tickEffects) {
  if (!effect || effect.type !== 'damage') {
   continue;
  }
  const resource = effect.resource ?? 'hp';
  if (resource !== 'hp') {
   continue;
  }
  const currentHp = Math.max(0, Math.round(Number(player.hp) || 0));
  if (currentHp <= 0) {
   continue;
  }
  const damage = resolveBuffTickDamage(player, buff, effect);
  if (damage <= 0) {
   continue;
  }
  const nextHp = Math.max(0, currentHp - damage);
  if (nextHp !== player.hp) {
   player.hp = nextHp;
   player.selfRevision += 1;
   vitalsChanged = true;
  }
 }
 return { vitalsChanged };
}

export function resolveBuffTickDamage(player, buff, effect) {
 const basis = effect.basis === 'target.hp'
  ? Math.max(0, Math.round(Number(player.hp) || 0))
  : Math.max(1, Math.round(Number(player.maxHp) || 1));
 const ratio = Math.max(0, Number(effect.ratio) || 0);
 if (basis <= 0 || ratio <= 0) {
  return 0;
 }
 const stackFactor = effect.perStack === true
  ? Math.max(1, Math.round(Number(buff.stacks) || 1))
  : 1;
 const minimum = Number.isFinite(effect.min) ? Math.max(0, Math.round(Number(effect.min))) : 0;
 return Math.max(minimum, Math.round(basis * ratio * stackFactor));
}

export function applyBuffSustainCost(player, buff) {
 const cost = resolveBuffSustainCost(buff);
 if (!cost) {
  return BUFF_SUSTAIN_COST_UNCHANGED;
 }
 const elapsed = Math.max(0, Math.floor(Number(buff.sustainTicksElapsed ?? 0) || 0));
 if (cost.resource === 'qi') {
  if (Math.max(0, Math.round(Number(player.qi) || 0)) < cost.amount) {
   return { sustained: false, vitalsChanged: false };
  }
  player.qi = Math.max(0, Math.round(Number(player.qi) || 0) - cost.amount);
 }
 else {
  if (Math.max(0, Math.round(Number(player.hp) || 0)) <= cost.amount) {
   return { sustained: false, vitalsChanged: false };
  }
  player.hp = Math.max(1, Math.round(Number(player.hp) || 0) - cost.amount);
 }
 player.selfRevision += 1;
 buff.sustainTicksElapsed = elapsed + 1;
 return { sustained: true, vitalsChanged: cost.amount > 0 };
}

export function resolveBuffSustainCost(buff) {
 const sustainCost = buff?.sustainCost;
 if (!sustainCost || (sustainCost.resource !== 'hp' && sustainCost.resource !== 'qi')) {
  return null;
 }
 const baseCost = Math.max(0, Math.round(Number(sustainCost.baseCost) || 0));
 if (baseCost <= 0) {
  return null;
 }
 const elapsed = Math.max(0, Math.floor(Number(buff.sustainTicksElapsed ?? 0) || 0));
 const growthRate = Math.max(0, Number(sustainCost.growthRate) || 0);
 return {
  resource: sustainCost.resource,
  amount: Math.max(1, Math.round(baseCost * Math.pow(1 + growthRate, elapsed))),
 };
}
/**
 * recoverPlayerVitals：执行recover玩家Vital相关逻辑。
 * @param player 玩家对象。
 * @param currentTick 参数说明。
 * @returns 无返回值，直接更新recover玩家Vital相关状态。
 */

export function recoverPlayerVitals(player, currentTick = -1) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 const suppressUntilTick = Number.isFinite(player.vitalRecoveryDeferredUntilTick)
  ? Math.trunc(player.vitalRecoveryDeferredUntilTick)
  : -1;
 if (suppressUntilTick >= 0) {
  player.vitalRecoveryDeferredUntilTick = -1;
 }
 if (suppressUntilTick >= Math.trunc(currentTick)) {
  return false;
 }
 if (player.hp <= 0) {
  return false;
 }

 let changed = false;
 if (player.hp < player.maxHp && player.attrs.numericStats.hpRegenRate > 0) {

  const heal = Math.round(player.attrs.numericStats.hpRegenRate);
  if (heal > 0) {
   const nextHp = clamp(player.hp + heal, 0, player.maxHp);
   if (nextHp !== player.hp) {
    player.hp = nextHp;
    changed = true;
   }
  }
 }
 if (player.qi < player.maxQi && player.attrs.numericStats.qiRegenRate > 0) {

  const recover = Math.round(player.attrs.numericStats.qiRegenRate);
  if (recover > 0) {
   const nextQi = clamp(player.qi + recover, 0, player.maxQi);
   if (nextQi !== player.qi) {
    player.qi = nextQi;
    changed = true;
   }
  }
 }
 return changed;
}
/**
 * shouldRefreshSkillCooldownActionState：判断技能冷却投影是否到达重建边界。
 * @param player 玩家对象。
 * @param currentTick 参数说明。
 * @returns 无返回值，完成激活技能冷却的条件判断。
 */

export function shouldRefreshSkillCooldownActionState(player, currentTick, schedule) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 if (!schedule) {
  return hasTrackedSkillCooldown(player);
 }
 if (schedule.nextReadyTick <= 0) {
  return false;
 }
 const cooldownSpeed = Math.trunc(Number(player.attrs?.numericStats?.cooldownSpeed ?? 0));
 return currentTick >= schedule.nextReadyTick
  || cooldownSpeed !== schedule.cooldownSpeed;
}

/** 记录当前 action 投影下一次真正可能变化的冷却边界。 */
export function buildActionCooldownProjectionSchedule(player, currentTick) {
 const normalizedCurrentTick = Math.max(0, Math.trunc(Number(currentTick) || 0));
 let nextReadyTick = 0;
 const cooldowns = player?.combat?.cooldownReadyTickBySkillId;
 if (cooldowns && typeof cooldowns === 'object') {
  for (const skillId in cooldowns) {
   if (!Object.prototype.hasOwnProperty.call(cooldowns, skillId)) {
    continue;
   }
   const readyTick = Math.max(0, Math.trunc(Number(cooldowns[skillId]) || 0));
   if (readyTick <= normalizedCurrentTick) {
    continue;
   }
   if (nextReadyTick <= 0 || readyTick < nextReadyTick) {
    nextReadyTick = readyTick;
   }
  }
 }
 return {
  nextReadyTick,
  cooldownSpeed: Math.trunc(Number(player.attrs?.numericStats?.cooldownSpeed ?? 0)),
 };
}

/** 未建立调度缓存时仅检查是否存在需要收敛的技能冷却。 */
export function hasTrackedSkillCooldown(player) {
 const cooldowns = player?.combat?.cooldownReadyTickBySkillId;
 if (!cooldowns || typeof cooldowns !== 'object') {
  return false;
 }
 for (const skillId in cooldowns) {
  if (Object.prototype.hasOwnProperty.call(cooldowns, skillId)
   && Math.max(0, Math.trunc(Number(cooldowns[skillId]) || 0)) > 0) {
   return true;
  }
 }
 return false;
}

export function buildPvPSoulInjuryBuffState(sourceRealmLv) {
 const realmLv = Math.max(1, Math.floor(sourceRealmLv));
 const cached = pvpSoulInjuryBuffByRealmLv.get(realmLv);
 if (cached) {
  return cached;
 }
 const buff = freezeRuntimeBuffTemplate({
  buffId: PVP_SOUL_INJURY_BUFF_ID,
  name: '神魂受损',
  desc: '六维降低 10%，之后每层额外降低 1%，最多降低 30%；身死与遁返都不会清除，需静养满一时辰。',
  baseDesc: '六维降低 10%，之后每层额外降低 1%，最多降低 30%；身死与遁返都不会清除，需静养满一时辰。',
  shortMark: '残',
  category: 'debuff',
  visibility: 'public',
  remainingTicks: PVP_SOUL_INJURY_DURATION_TICKS,
  duration: PVP_SOUL_INJURY_DURATION_TICKS,
  stacks: 1,
  maxStacks: PVP_SOUL_INJURY_MAX_STACKS,
  sourceSkillId: PVP_SOUL_INJURY_SOURCE_ID,
  sourceSkillName: '杀孽',
  realmLv,
  color: '#8a5a64',
  persistOnDeath: true,
  persistOnReturnToSpawn: true,
 });
 pvpSoulInjuryBuffByRealmLv.set(realmLv, buff);
 return buff;
}

export function getPlayerRealmLevel(player) {
 return Math.max(1, Math.floor(player.realm?.realmLv ?? 1));
}

export function buildPvPShaInfusionBuffState(sourceRealmLv) {
 const realmLv = Math.max(1, Math.floor(sourceRealmLv));
 const cached = pvpShaInfusionBuffByRealmLv.get(realmLv);
 if (cached) {
  return cached;
 }
 const buff = freezeRuntimeBuffTemplate({
  buffId: PVP_SHA_INFUSION_BUFF_ID,
  name: '煞气入体',
  desc: `每层攻击 +1%（最高 +${PVP_SHA_INFUSION_ATTACK_CAP_PERCENT}%）、防御 -2%；每十分钟自然消退一层，死亡时会按层数比例折损当前境界修为，不足时继续折损底蕴。`,
  baseDesc: `每层攻击 +1%（最高 +${PVP_SHA_INFUSION_ATTACK_CAP_PERCENT}%）、防御 -2%；每十分钟自然消退一层，死亡时会按层数比例折损当前境界修为，不足时继续折损底蕴。`,
  shortMark: '煞',
  category: 'buff',
  visibility: 'public',
  remainingTicks: PVP_SHA_INFUSION_DECAY_TICKS,
  duration: PVP_SHA_INFUSION_DECAY_TICKS,
  stacks: 1,
  maxStacks: 999999,
  sourceSkillId: PVP_SHA_INFUSION_SOURCE_ID,
  sourceSkillName: '杀孽',
  realmLv,
  color: '#7a2e2e',
  stats: freezeRuntimeBuffTemplate({
   physAtk: 1,
   spellAtk: 1,
   physDef: -2,
   spellDef: -2,
  }),
  statMode: 'percent',
  persistOnDeath: true,
  persistOnReturnToSpawn: true,
 });
 pvpShaInfusionBuffByRealmLv.set(realmLv, buff);
 return buff;
}

export function buildPvPShaBacklashBuffState(sourceRealmLv, stacks) {
 const realmLv = Math.max(1, Math.floor(sourceRealmLv));
 let cached = pvpShaBacklashBuffByRealmLv.get(realmLv);
 if (!cached) {
  cached = freezeRuntimeBuffTemplate({
   buffId: PVP_SHA_BACKLASH_BUFF_ID,
   name: '煞气反噬',
   desc: `每层攻击 -${PVP_SHA_BACKLASH_PERCENT_PER_STACK}%、防御 -${PVP_SHA_BACKLASH_PERCENT_PER_STACK}%；每十分钟自然消退一层。`,
   baseDesc: `每层攻击 -${PVP_SHA_BACKLASH_PERCENT_PER_STACK}%、防御 -${PVP_SHA_BACKLASH_PERCENT_PER_STACK}%；每十分钟自然消退一层。`,
   shortMark: '蚀',
   category: 'debuff',
   visibility: 'public',
   remainingTicks: PVP_SHA_BACKLASH_DECAY_TICKS,
   duration: PVP_SHA_BACKLASH_DECAY_TICKS,
   stacks: 1,
   maxStacks: 999999,
   sourceSkillId: PVP_SHA_BACKLASH_SOURCE_ID,
   sourceSkillName: '煞气反噬',
   realmLv,
   color: '#6d2626',
   stats: freezeRuntimeBuffTemplate({
    physAtk: -PVP_SHA_BACKLASH_PERCENT_PER_STACK,
    spellAtk: -PVP_SHA_BACKLASH_PERCENT_PER_STACK,
    physDef: -PVP_SHA_BACKLASH_PERCENT_PER_STACK,
    spellDef: -PVP_SHA_BACKLASH_PERCENT_PER_STACK,
   }),
   statMode: 'percent',
   persistOnDeath: true,
   persistOnReturnToSpawn: true,
  });
  pvpShaBacklashBuffByRealmLv.set(realmLv, cached);
 }
 return cached;
}

export function buildHeavenlyDaoSuppressionBuffState(sourceRealmLv) {
 const realmLv = Math.max(1, Math.floor(sourceRealmLv));
 let cached = heavenlyDaoSuppressionBuffByRealmLv.get(realmLv);
 if (!cached) {
  cached = freezeRuntimeBuffTemplate({
   buffId: HEAVENLY_DAO_SUPPRESSION_BUFF_ID,
   name: '天道压制',
   desc: '六维与全部战斗属性按 1000 / (1000 + 层数) 衰减；再次触发会叠层并刷新一小时，身死与遁返不能清除。',
   baseDesc: '六维与全部战斗属性按 1000 / (1000 + 层数) 衰减；再次触发会叠层并刷新一小时，身死与遁返不能清除。',
   shortMark: '压',
   category: 'debuff',
   visibility: 'public',
   remainingTicks: HEAVENLY_DAO_SUPPRESSION_DURATION_TICKS,
   duration: HEAVENLY_DAO_SUPPRESSION_DURATION_TICKS,
   stacks: 1,
   maxStacks: HEAVENLY_DAO_SUPPRESSION_MAX_STACKS,
   sourceSkillId: HEAVENLY_DAO_SUPPRESSION_SOURCE_ID,
   sourceSkillName: '天道',
   realmLv,
   color: '#75634c',
   persistOnDeath: true,
   persistOnReturnToSpawn: true,
  });
  heavenlyDaoSuppressionBuffByRealmLv.set(realmLv, cached);
 }
 return cached;
}

export function freezeRuntimeBuffTemplate(entry) {
 return entry && process.env.NODE_ENV !== 'production' ? Object.freeze(entry) : entry;
}

export function entityHasActiveBuff(buffs, buffId, minStacks = 1) {
 return buffs.some((buff) => buff.buffId === buffId
  && buff.remainingTicks > 0
  && Math.max(0, Math.round(buff.stacks ?? 0)) >= minStacks);
}

export function getEntityBuffStacks(buffs, buffId) {
 const target = buffs.find((buff) => buff.buffId === buffId && buff.remainingTicks > 0);
 return target ? Math.max(0, Math.round(target.stacks ?? 0)) : 0;
}

export function isDecayStackBuff(buff) {
 return buff.buffId === PVP_SHA_INFUSION_BUFF_ID || buff.buffId === PVP_SHA_BACKLASH_BUFF_ID;
}

export function shouldKeepBuffOnRespawn(buff) {
 return buff.persistOnDeath === true
  || buff.category !== 'debuff'
  || buff.buffId === PVP_SOUL_INJURY_BUFF_ID
  || buff.buffId === PVP_SHA_INFUSION_BUFF_ID
  || buff.buffId === PVP_SHA_BACKLASH_BUFF_ID;
}

export function shouldKeepBuffOnReturnToSpawn(buff) {
 return buff.persistOnReturnToSpawn === true
  || buff.buffId === PVP_SHA_INFUSION_BUFF_ID
  || buff.buffId === PVP_SHA_BACKLASH_BUFF_ID;
}

export function isSameBuffIdSequence(left, right) {
 if (left.length !== right.length) {
  return false;
 }
 for (let index = 0; index < left.length; index += 1) {
  if (left[index]?.buffId !== right[index]?.buffId || left[index]?.stacks !== right[index]?.stacks || left[index]?.remainingTicks !== right[index]?.remainingTicks) {
   return false;
  }
 }
 return true;
}
/**
 * toConsumableTemporaryBuff：执行toConsumableTemporaryBuff相关逻辑。
 * @param item 道具。
 * @param buff 参数说明。
 * @returns 无返回值，直接更新toConsumableTemporaryBuff相关状态。
 */

export function toConsumableTemporaryBuff(item, buff, sourceRealmLv = 1) {
 const sourceSkillId = typeof buff.sourceSkillId === 'string' && buff.sourceSkillId.trim()
  ? buff.sourceSkillId.trim()
  : `item:${item.itemId}`;
 const duration = Math.max(1, Math.round(buff.duration));
 return {
  buffId: buff.buffId,
  name: buff.name,
  desc: buff.desc,
  shortMark: buff.shortMark ?? (buff.name.slice(0, 1) || '*'),
  category: buff.category ?? 'buff',
  visibility: buff.visibility ?? 'public',
  remainingTicks: buff.infiniteDuration === true ? 1 : duration + 1,
  duration,
  stacks: 1,
  maxStacks: Math.max(1, Math.round(buff.maxStacks ?? 1)),
  sourceSkillId,
  sourceSkillName: resolvePlayerFacingContentName(item.itemId, '未知物品', item.name),
  realmLv: Math.max(1, Math.floor(sourceRealmLv)),
  color: buff.color,
  attrs: buff.attrs ? { ...buff.attrs } : undefined,
  attrMode: buff.attrMode,
  stats: buff.stats
   ? { ...buff.stats }
   : (buff.valueStats
    ? (buff.statMode === 'flat' ? compileValueStatsToActualStats(buff.valueStats) : { ...buff.valueStats })
    : undefined),
  statMode: buff.statMode,
  qiProjection: buff.qiProjection ? buff.qiProjection.map((entry) => ({ ...entry })) : undefined,
  presentationScale: Number.isFinite(buff.presentationScale) && Number(buff.presentationScale) > 0 ? Number(buff.presentationScale) : undefined,
  infiniteDuration: buff.infiniteDuration === true,
  sustainCost: buff.sustainCost ? { ...buff.sustainCost } : undefined,
  sustainTicksElapsed: buff.sustainCost ? 0 : undefined,
  expireWithBuffId: buff.expireWithBuffId,
  persistOnDeath: buff.persistOnDeath === true,
  persistOnReturnToSpawn: buff.persistOnReturnToSpawn === true,
  immuneToCleanse: buff.immuneToCleanse === true ? true : undefined,
  ignoreRealmEffectiveness: buff.ignoreRealmEffectiveness === true ? true : undefined,
 };
}

export function isConsumableBuffSource(buff) {
 const sourceSkillId = typeof buff?.sourceSkillId === 'string' ? buff.sourceSkillId : '';
 const buffId = typeof buff?.buffId === 'string' ? buff.buffId : '';
 return sourceSkillId.startsWith('item:') || sourceSkillId.startsWith('pill.') || buffId.startsWith('item_buff.');
}
/**
 * cloneRuntimeAttrState：构建运行态Attr状态。
 * @param source 来源对象。
 * @returns 无返回值，直接更新运行态Attr状态相关状态。
 */


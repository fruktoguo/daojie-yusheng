/**
 * 玩家运行时委托实现 — buff/PvP 域。
 *
 * 从 player-runtime.service.ts 拆分而来，包含：
 * - 临时 buff 施加/替换/净化
 * - 配置驱动 buff 施加
 * - PvP 神魂受损/煞气灌注/煞气反噬/天道压制
 * - buff 层数查询与消耗
 *
 * 拆分模式 B：所有函数签名为 `xxxImpl(self, ...args)`，
 * 主类保留一行委托 `xxx(...args) { return xxxImpl(this, ...args); }`。
 */
import type { PlayerRuntimeService } from './player-runtime.service';
import {
  doesBuffAffectAttributeProjection,
  doesBuffAffectVitalCapacityProjection,
  doesTemporaryBuffAffectVitalCapacity,
  entityHasActiveBuff,
  getEntityBuffStacks,
  isConsumableBuffSource,
  isNonConsumableTemporaryBuffReapplyNoop,
  isRuntimeBuffActive,
  isSameTemporaryBuffAttributePayload,
  isSameTemporaryBuffPrototypePayload,
  isSameTemporaryBuffReferencePayload,
  markPlayerDirtyDomains,
} from './player-runtime.helpers';
import {
  buildHeavenlyDaoSuppressionBuffState,
  buildPvPShaBacklashBuffState,
  buildPvPShaInfusionBuffState,
  buildPvPSoulInjuryBuffState,
  getPlayerRealmLevel,
} from './player-runtime.helpers';
import {
  createRuntimeTemporaryBuff,
  refreshRuntimeTemporaryBuffPrototype,
} from './runtime-buff-instance';
import {
  HEAVENLY_DAO_SUPPRESSION_BUFF_ID,
} from '../../constants/gameplay/virtual-world';
import {
  PVP_SHA_BACKLASH_BUFF_ID,
  PVP_SHA_BACKLASH_STACK_DIVISOR,
  PVP_SHA_INFUSION_BUFF_ID,
} from '../../constants/gameplay/pvp';
export function applyTemporaryBuffImpl(self: PlayerRuntimeService, playerId, buff) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = self.getPlayerOrThrow(playerId);

  const existing = player.buffs.buffs.find((entry) => entry.buffId === buff.buffId);
  let changed = false;
  let attrRelevantChanged = false;
  let requiresImmediateAttributeFreshness = false;
  if (existing) {
   if (!isConsumableBuffSource(buff) && isNonConsumableTemporaryBuffReapplyNoop(existing, buff)) {
    return player;
   }
   const previousRemainingTicks = existing.remainingTicks;
   const previousDuration = existing.duration;
   const previousStacks = existing.stacks;
   const previousMaxStacks = existing.maxStacks;
   const previousRealmLv = existing.realmLv;
   const previousInfiniteDuration = existing.infiniteDuration === true;
   const previousSustainTicksElapsed = existing.sustainTicksElapsed;
   const previousPersistOnDeath = existing.persistOnDeath === true;
   const previousPersistOnReturnToSpawn = existing.persistOnReturnToSpawn === true;
   const previousActive = isRuntimeBuffActive(existing);
   const affectsAttributes = doesBuffAffectAttributeProjection(player, existing) || doesBuffAffectAttributeProjection(player, buff);
   const affectsVitalCapacity = doesBuffAffectVitalCapacityProjection(player, existing)
    || doesBuffAffectVitalCapacityProjection(player, buff);
   const sameAttributePayload = isSameTemporaryBuffAttributePayload(existing, buff);
   const samePrototypePayload = isSameTemporaryBuffPrototypePayload(existing, buff);
   if (isConsumableBuffSource(buff)) {
    if (buff.infiniteDuration === true) {
     existing.duration = Math.max(1, Math.round(buff.duration));
     existing.remainingTicks = 1;
    }
    else {
     const currentRemainingDuration = Math.max(0, existing.remainingTicks - 1);
     const addedDuration = Math.max(1, Math.round(buff.duration));
     existing.duration = currentRemainingDuration + addedDuration;
     existing.remainingTicks = existing.duration + 1;
    }
    existing.stacks = Math.min(buff.maxStacks, existing.stacks + 1);
   }
   else {
    existing.remainingTicks = buff.remainingTicks;
    existing.duration = buff.duration;
    existing.stacks = Math.min(buff.maxStacks, existing.stacks + Math.max(1, buff.stacks));
   }
   existing.maxStacks = buff.maxStacks;
   existing.infiniteDuration = buff.infiniteDuration === true;
   existing.sustainTicksElapsed = buff.sustainCost ? Math.max(0, Math.floor(Number(existing.sustainTicksElapsed ?? buff.sustainTicksElapsed ?? 0) || 0)) : undefined;
   existing.persistOnDeath = buff.persistOnDeath === true;
   existing.persistOnReturnToSpawn = buff.persistOnReturnToSpawn === true;
   if (!samePrototypePayload) {
    refreshRuntimeTemporaryBuffPrototype(existing, buff);
   }
   changed = previousRemainingTicks !== existing.remainingTicks
    || previousDuration !== existing.duration
    || previousStacks !== existing.stacks
    || previousMaxStacks !== existing.maxStacks
    || previousRealmLv !== existing.realmLv
    || previousInfiniteDuration !== (existing.infiniteDuration === true)
    || previousSustainTicksElapsed !== existing.sustainTicksElapsed
    || previousPersistOnDeath !== (existing.persistOnDeath === true)
    || previousPersistOnReturnToSpawn !== (existing.persistOnReturnToSpawn === true)
    || !samePrototypePayload;
   attrRelevantChanged = affectsAttributes
    && (previousActive !== isRuntimeBuffActive(existing)
     || previousStacks !== existing.stacks
     || previousRealmLv !== existing.realmLv
     || !sameAttributePayload);
   requiresImmediateAttributeFreshness = attrRelevantChanged && affectsVitalCapacity;
  }
  else {
   player.buffs.buffs.push(createRuntimeTemporaryBuff(buff));
   changed = true;
   attrRelevantChanged = doesBuffAffectAttributeProjection(player, buff);
   requiresImmediateAttributeFreshness = attrRelevantChanged
    && doesBuffAffectVitalCapacityProjection(player, buff);
  }
  if (!changed) {
   return player;
  }
  if (!existing) {
   player.buffs.buffs.sort((left, right) => {
    const a = String(left.buffId ?? '');
    const b = String(right.buffId ?? '');
    return a < b ? -1 : a > b ? 1 : 0;
   });
  }
  player.buffs.revision += 1;
  if (attrRelevantChanged) {
   self.playerAttributesService.recalculate(player, 'buff');
   if (requiresImmediateAttributeFreshness) {
    self.playerAttributesService.ensureFresh?.(player);
   }
  }
  markPlayerDirtyDomains(player, attrRelevantChanged ? ['buff', 'attr'] : ['buff']);
  self.bumpPersistentRevision(player);
  return player;
 }
export function cleanseTemporaryBuffsImpl(self: PlayerRuntimeService, playerId, category = 'debuff', removeCount = 1) {
  const player = self.getPlayerOrThrow(playerId);
  const normalizedRemoveCount = Math.max(0, Math.trunc(Number(removeCount) || 0));
  if (normalizedRemoveCount <= 0) {
   return 0;
  }
  const normalizedCategory = category === 'buff' || category === 'debuff' ? category : null;
  let removedCount = 0;
  let attrRelevantChanged = false;
  let affectsVitalCapacity = false;
  const keptBuffs = [];
  for (const buff of player.buffs.buffs) {
   const shouldRemove = removedCount < normalizedRemoveCount
    && isRuntimeBuffActive(buff)
    && (normalizedCategory === null || buff.category === normalizedCategory)
    && buff.immuneToCleanse !== true;
   if (!shouldRemove) {
    keptBuffs.push(buff);
    continue;
   }
   removedCount += 1;
   attrRelevantChanged = doesBuffAffectAttributeProjection(player, buff) || attrRelevantChanged;
   affectsVitalCapacity = doesBuffAffectVitalCapacityProjection(player, buff) || affectsVitalCapacity;
  }
  if (removedCount <= 0) {
   return 0;
  }
  player.buffs.buffs = keptBuffs;
  player.buffs.revision += 1;
  if (attrRelevantChanged) {
   self.playerAttributesService.recalculate(player, 'buff');
   if (affectsVitalCapacity) {
    self.playerAttributesService.ensureFresh?.(player);
   }
  }
  markPlayerDirtyDomains(player, attrRelevantChanged
   ? ['buff', 'attr', ...(affectsVitalCapacity ? ['vitals'] : [])]
   : ['buff']);
  self.bumpPersistentRevision(player);
  return removedCount;
 }

export function replaceTemporaryBuffImpl(self: PlayerRuntimeService, playerId, buff) {
  const player = self.getPlayerOrThrow(playerId);
  const buffId = typeof buff?.buffId === 'string' ? buff.buffId.trim() : '';
  if (!buffId) return player;
  const index = player.buffs.buffs.findIndex((entry) => entry.buffId === buffId);
  const stacks = Math.max(0, Math.trunc(Number(buff.stacks) || 0));
  const remainingTicks = Math.max(0, Math.trunc(Number(buff.remainingTicks) || 0));
  const existing = index >= 0 ? player.buffs.buffs[index] : null;
  if (stacks <= 0 || remainingTicks <= 0) {
   if (index < 0) return player;
   const affectsAttributes = doesBuffAffectAttributeProjection(player, existing);
   const affectsVitalCapacity = doesBuffAffectVitalCapacityProjection(player, existing);
   player.buffs.buffs.splice(index, 1);
   player.buffs.revision += 1;
   if (affectsAttributes) {
    self.playerAttributesService.recalculate(player, 'buff');
    if (affectsVitalCapacity) self.playerAttributesService.ensureFresh?.(player);
   }
   markPlayerDirtyDomains(player, affectsAttributes ? ['buff', 'attr', ...(affectsVitalCapacity ? ['vitals'] : [])] : ['buff']);
   self.bumpPersistentRevision(player);
   return player;
  }
  const next = createRuntimeTemporaryBuff({ ...buff, buffId, stacks, remainingTicks });
  const same = existing
   && existing.remainingTicks === next.remainingTicks
   && existing.duration === next.duration
   && existing.stacks === next.stacks
   && existing.maxStacks === next.maxStacks
   && existing.realmLv === next.realmLv
   && isSameTemporaryBuffReferencePayload(existing, next);
  if (same) return player;
  const affectsAttributes = doesBuffAffectAttributeProjection(player, existing) || doesBuffAffectAttributeProjection(player, next);
  const affectsVitalCapacity = doesBuffAffectVitalCapacityProjection(player, existing) || doesBuffAffectVitalCapacityProjection(player, next);
  if (existing) {
   refreshRuntimeTemporaryBuffPrototype(existing, next);
   Object.assign(existing, next);
  } else {
   player.buffs.buffs.push(next);
   player.buffs.buffs.sort((left, right) => String(left.buffId ?? '').localeCompare(String(right.buffId ?? ''), 'zh-Hans-CN'));
  }
  player.buffs.revision += 1;
  if (affectsAttributes) {
   self.playerAttributesService.recalculate(player, 'buff');
   if (affectsVitalCapacity) self.playerAttributesService.ensureFresh?.(player);
  }
  markPlayerDirtyDomains(player, affectsAttributes ? ['buff', 'attr', ...(affectsVitalCapacity ? ['vitals'] : [])] : ['buff']);
  self.bumpPersistentRevision(player);
  return player;
 }

export function applyConfiguredBuffImpl(self: PlayerRuntimeService, playerId, buffId, options: any = {}) {
  const normalizedBuffId = typeof buffId === 'string' ? buffId.trim() : '';
  if (!normalizedBuffId) {
   return null;
  }
  const template = self.contentTemplateRepository?.buffRegistry?.tryGetRef?.(normalizedBuffId);
  if (!template) {
   throw new Error(`未找到 Buff 模板：${normalizedBuffId}`);
  }
  const duration = Math.max(1, Math.round(Number(template.duration) || 1));
  const stacks = Math.max(1, Math.trunc(Number(options.stacks) || Number(template.stacks) || 1));
  const remainingTicks = options.refreshDuration === false
   ? Math.max(1, Math.round(Number(template.remainingTicks) || duration + 1))
   : duration + 1;
  const buff = self.contentTemplateRepository.buffRegistry.createInstance(normalizedBuffId, {
   remainingTicks,
   duration,
   stacks,
   realmLv: Math.max(1, Math.trunc(Number(options.realmLv) || Number(template.realmLv) || 1)),
  });
  return self.applyTemporaryBuff(playerId, buff);
 }

export function applyPvPSoulInjuryImpl(self: PlayerRuntimeService, playerId) {
  const next = self.applyOrRefreshPvpBuff(
   playerId,
   buildPvPSoulInjuryBuffState(getPlayerRealmLevel(self.getPlayerOrThrow(playerId))),
   1,
  );
  return next.stacks;
 }

export function addPvPShaInfusionStackImpl(self: PlayerRuntimeService, playerId) {
  const player = self.getPlayerOrThrow(playerId);
  const next = self.applyOrRefreshPvpBuff(playerId, buildPvPShaInfusionBuffState(getPlayerRealmLevel(player)), 1);
  return next.stacks;
 }

export function addPvPShaBacklashStacksImpl(self: PlayerRuntimeService, playerId, addedStacks) {
  if (addedStacks <= 0) {
   return self.getBuffStacks(playerId, PVP_SHA_BACKLASH_BUFF_ID);
  }
  const player = self.getPlayerOrThrow(playerId);
  const next = self.applyOrRefreshPvpBuff(playerId, buildPvPShaBacklashBuffState(getPlayerRealmLevel(player), addedStacks), addedStacks);
  return next.stacks;
 }

export function addHeavenlyDaoSuppressionStacksImpl(self: PlayerRuntimeService, playerId, addedStacks) {
  const normalizedAddedStacks = Math.max(0, Math.trunc(Number(addedStacks) || 0));
  if (normalizedAddedStacks <= 0) {
   return self.getBuffStacks(playerId, HEAVENLY_DAO_SUPPRESSION_BUFF_ID);
  }
  const player = self.getPlayerOrThrow(playerId);
  const next = self.applyOrRefreshPvpBuff(
   playerId,
   buildHeavenlyDaoSuppressionBuffState(getPlayerRealmLevel(player)),
   normalizedAddedStacks,
  );
  return next.stacks;
 }

export function getBuffStacksImpl(self: PlayerRuntimeService, playerId, buffId) {
  const player = self.getPlayerOrThrow(playerId);
  return getEntityBuffStacks(player.buffs.buffs, buffId);
 }

export function hasActiveBuffImpl(self: PlayerRuntimeService, playerId, buffId, minStacks = 1) {
  const player = self.getPlayerOrThrow(playerId);
  return entityHasActiveBuff(player.buffs.buffs, buffId, minStacks);
 }

export function applyShaInfusionDeathPenaltyImpl(self: PlayerRuntimeService, playerId) {
  const player = self.getPlayerOrThrow(playerId);
  const stacks = getEntityBuffStacks(player.buffs.buffs, PVP_SHA_INFUSION_BUFF_ID);
  if (stacks <= 0) {
   return {
    stacks: 0,
    loss: 0,
    consumedProgress: 0,
    consumedFoundation: 0,
    backlashAddedStacks: 0,
    backlashTotalStacks: self.getBuffStacks(playerId, PVP_SHA_BACKLASH_BUFF_ID),
    remainingInfusionStacks: 0,
   };
  }
  const backlashAddedStacks = Math.max(1, Math.ceil(stacks / PVP_SHA_BACKLASH_STACK_DIVISOR));
  const remainingInfusionStacks = self.consumePvpBuffStacks(playerId, PVP_SHA_INFUSION_BUFF_ID, backlashAddedStacks);
  const backlashTotalStacks = self.addPvPShaBacklashStacks(playerId, backlashAddedStacks);
  const progressToNext = Math.max(0, Math.floor(player.realm?.progressToNext ?? 0));
  const loss = Math.max(0, Math.floor((progressToNext * stacks) / 100));
  if (loss <= 0) {
   return {
    stacks,
    loss: 0,
    consumedProgress: 0,
    consumedFoundation: 0,
    backlashAddedStacks,
    backlashTotalStacks,
    remainingInfusionStacks,
   };
  }
  const statisticBefore = self.captureOfflineGainBeforeTick(player);
  const consumed = self.playerProgressionService.consumeRealmProgressAndFoundation(player, loss);
  if (Array.isArray(consumed.dirtyDomains) && consumed.dirtyDomains.length > 0) {
   markPlayerDirtyDomains(player, consumed.dirtyDomains);
  }
  if (consumed.changed) {
   self.recordPlayerStatisticMutation(player, statisticBefore);
  }
  return {
   stacks,
   loss,
   consumedProgress: consumed.consumedProgress,
   consumedFoundation: consumed.consumedFoundation,
   backlashAddedStacks,
   backlashTotalStacks,
   remainingInfusionStacks,
  };
 }

export function applyOrRefreshPvpBuffImpl(self: PlayerRuntimeService, playerId, buff, stackDelta = 0) {
  const player = self.getPlayerOrThrow(playerId);
  const existing = player.buffs.buffs.find((entry) => entry.buffId === buff.buffId);
  if (existing) {
   existing.remainingTicks = Math.max(1, Math.round(buff.duration));
   existing.duration = Math.max(1, Math.round(buff.duration));
   existing.maxStacks = Math.max(existing.maxStacks ?? 1, buff.maxStacks ?? 1);
   existing.stacks = Math.min(existing.maxStacks, Math.max(1, Math.round(existing.stacks + (stackDelta || buff.stacks || 0))));
   existing.realmLv = buff.realmLv;
   existing.persistOnDeath = buff.persistOnDeath === true;
   existing.persistOnReturnToSpawn = buff.persistOnReturnToSpawn === true;
   refreshRuntimeTemporaryBuffPrototype(existing, buff);
  }
  else {
   const created = createRuntimeTemporaryBuff(buff);
   created.stacks = Math.min(
    Math.max(1, Math.round(created.maxStacks ?? 1)),
    Math.max(1, Math.round(stackDelta || buff.stacks || 1)),
   );
   player.buffs.buffs.push(created);
  }
  player.buffs.buffs.sort((left, right) => {
   const a = String(left.buffId ?? '');
   const b = String(right.buffId ?? '');
   return a < b ? -1 : a > b ? 1 : 0;
  });
  player.buffs.revision += 1;
  self.playerAttributesService.recalculate(player, 'buff');
  if (doesTemporaryBuffAffectVitalCapacity(buff)) {
   self.playerAttributesService.ensureFresh?.(player);
  }
  markPlayerDirtyDomains(player, doesTemporaryBuffAffectVitalCapacity(buff)
   ? ['buff', 'attr', 'vitals']
   : ['buff', 'attr']);
  self.bumpPersistentRevision(player);
  return player.buffs.buffs.find((entry) => entry.buffId === buff.buffId);
 }

export function consumePvpBuffStacksImpl(self: PlayerRuntimeService, playerId, buffId, consumedStacks) {
  if (consumedStacks <= 0) {
   return self.getBuffStacks(playerId, buffId);
  }
  const player = self.getPlayerOrThrow(playerId);
  const index = player.buffs.buffs.findIndex((entry) => entry.buffId === buffId && entry.remainingTicks > 0);
  if (index < 0) {
   return 0;
  }
  const existing = player.buffs.buffs[index];
  const nextStacks = Math.max(0, Math.round(existing.stacks) - consumedStacks);
  if (nextStacks <= 0) {
   player.buffs.buffs.splice(index, 1);
   player.buffs.revision += 1;
   self.playerAttributesService.recalculate(player, 'buff');
   markPlayerDirtyDomains(player, ['buff', 'attr']);
   self.bumpPersistentRevision(player);
   return 0;
  }
  existing.stacks = nextStacks;
  existing.remainingTicks = Math.max(1, Math.round(existing.duration || 1));
  player.buffs.revision += 1;
  self.playerAttributesService.recalculate(player, 'buff');
  markPlayerDirtyDomains(player, ['buff', 'attr']);
  self.bumpPersistentRevision(player);
  return nextStacks;
 }


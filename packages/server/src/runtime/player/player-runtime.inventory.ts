/**
 * 玩家运行时委托实现 — 背包/装备/法宝/消耗品域。
 *
 * 从 player-runtime.service.ts 拆分而来，包含：
 * - 背包替换/授予/接收/拆分/使用/消耗/销毁/排序
 * - 背包查询（按槽位/实例ID/物品ID）
 * - 装备穿戴/卸下
 * - 法宝槽位启用/穿戴/卸下/解锁
 * - 消耗品使用效果应用
 *
 * 拆分模式 B：所有函数签名为 `xxxImpl(self, ...args)`，
 * 主类保留一行委托 `xxx(...args) { return xxxImpl(this, ...args); }`。
 */
import type { PlayerRuntimeService } from './player-runtime.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ARTIFACT_SLOTS,
  ARTIFACT_UNLOCK_REALM_LV,
  DUNGEON_MAX_STAMINA,
  EQUIP_SLOTS,
  addItemStackMergeCount,
  calculateTechniqueComprehensionRequiredProgress,
  canMergeItemStack,
  createItemStackSignature,
  findMergeableItemStackIndex,
  isTechniqueAggregationId,
  mergeItemStackInto,
  normalizeTechniqueStrengthPercent,
  resolveArtifactMaxQi,
  resolvePlayerFacingContentName,
  resolveTechniqueStandardMaxHpRecoveryAmount,
  resolveTechniqueStandardMaxQiRecoveryAmount,
} from '@mud/shared';
import {
  assertConsumableItemCooldownReady,
  clamp,
  cloneItemWithCountPreservingTemplate,
  consumeInventoryItemAt,
  findInventoryItemIndexByInstanceId,
  isSameArtifactSlotStateForRuntime,
  markConsumableItemCooldown,
  markPlayerDirtyDomains,
  normalizeArtifactStateWithTemplates,
  normalizeInventoryItemInstanceId,
  normalizeOfflineGainCount,
  readInventoryItemCount,
  resolvePlayerRuntimeTick,
  resolveSpiritualRootSeedTier,
  resolveTechniqueBookMaxLevel,
  syncTechniqueAutoBattleSkillCatalog,
  takeSingleInventoryItemForEquipment,
  toConsumableTemporaryBuff,
} from './player-runtime.helpers';
import {
  assignItemInstanceIdIfNeeded,
  compareItemInstanceId,
  isItemInstanceIdHardCheckEnabled,
} from '../world/item-instance-id.helpers';
import {
  advancePlayerArtifactQiTick,
  resolveArtifactSustainCostWithOvercharge,
  resolvePlayerArtifactOverchargeStacks,
} from './player-artifact-runtime.helpers';
import { compareInventoryItems } from './inventory-sort.helpers';

const MAX_ITEM_COUNT = 2_147_483_647;
const SHATTER_SPIRIT_PILL_ITEM_ID = 'pill.shatter_spirit';
const WANGSHENG_PILL_ITEM_ID = 'pill.wangsheng';

export function consumeItemByItemIdImpl(self: PlayerRuntimeService, playerId, itemId, count = 1) {
  const player = self.getPlayer(playerId);
  if (!player) return false;
  const slotIndex = player.inventory.items.findIndex((item) => item && item.itemId === itemId && (item.count ?? 1) >= count);
  if (slotIndex < 0) return false;
  consumeInventoryItemAt(player.inventory.items, slotIndex, count);
  player.inventory.revision += 1;
  self.refreshWalletCacheFromInventory(player, itemId);
  markPlayerDirtyDomains(player, ['inventory']);
  self.bumpPersistentRevision(player);
  return true;
 }

export function replaceInventoryItemsImpl(self: PlayerRuntimeService, playerId, items) {
  const player = self.getPlayerOrThrow(playerId);
  const statisticBefore = self.captureOfflineGainBeforeTick(player);
  const nextItems = Array.isArray(items)
   ? items.map((entry) => self.contentTemplateRepository.normalizeItem(entry))
   : [];
  player.inventory.items = nextItems;
  player.inventory.revision += 1;
  self.refreshWalletCacheFromInventory(player);
  self.playerProgressionService.refreshPreview(player);
  markPlayerDirtyDomains(player, ['inventory']);
  self.bumpPersistentRevision(player);
  self.recordAssetStatisticMutation(player, statisticBefore);
  return player;
 }

export function grantItemImpl(self: PlayerRuntimeService, playerId, itemId, count = 1) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = self.getPlayerOrThrow(playerId);
  const statisticBefore = self.captureOfflineGainBeforeTick(player);
  const normalizedItemId = typeof itemId === 'string' ? itemId.trim() : '';
  const item = self.contentTemplateRepository.createItem(normalizedItemId, count);
  if (!item) {
   throw new NotFoundException(`物品不存在：${normalizedItemId}`);
  }
  assignItemInstanceIdIfNeeded(item);

  mergeItemStackInto(player.inventory.items, item);
  player.inventory.revision += 1;
  self.refreshWalletCacheFromInventory(player, item.itemId);
  self.playerProgressionService.refreshPreview(player);
  markPlayerDirtyDomains(player, ['inventory']);
  self.bumpPersistentRevision(player);
  self.recordAssetStatisticMutation(player, statisticBefore);
  return player;
 }

export function getInventoryCountByItemIdImpl(self: PlayerRuntimeService, playerId, itemId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = self.getPlayerOrThrow(playerId);

  let total = 0;
  for (const entry of player.inventory.items) {
   if (entry.itemId === itemId) {
    total += entry.count;
   }
  }
  return total;
 }

export function canReceiveInventoryItemImpl(self: PlayerRuntimeService, playerId, item) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = self.getPlayerOrThrow(playerId);
  const normalized = self.contentTemplateRepository.normalizeItem(item);
  if (findMergeableItemStackIndex(player.inventory.items, normalized) >= 0) {
   return true;
  }
  return player.inventory.items.length < player.inventory.capacity;
 }

export function tryReceiveInventoryItemImpl(self: PlayerRuntimeService, playerId, item, options: any = {}) {
  const player = self.getPlayerOrThrow(playerId);
  // 击杀掉落由当前 ItemTemplateRegistry 刚完成实例化，同一调用栈内可直接转移所有权。
  // 其他入口继续规范化，避免把外部或持久化载荷误当成可信运行时实例。
  const normalized = options?.normalizedItemOwnershipTransfer === true
   ? item
   : self.contentTemplateRepository.normalizeItem(item);
  const mergeIndex = findMergeableItemStackIndex(player.inventory.items, normalized);
  if (mergeIndex < 0 && !(player.inventory.items.length < player.inventory.capacity)) {
   return false;
  }
  const statisticBefore = self.captureOfflineGainBeforeTick(player);
  self.applyNormalizedInventoryReceipt(player, normalized, statisticBefore, options, mergeIndex);
  return true;
 }

export function peekInventoryItemImpl(self: PlayerRuntimeService, playerId, slotIndex) {

  const player = self.getPlayerOrThrow(playerId);
  return player.inventory.items[slotIndex] ?? null;
 }

export function peekInventoryItemByInstanceIdImpl(self: PlayerRuntimeService, playerId, itemInstanceId) {

  const player = self.getPlayerOrThrow(playerId);
  const index = findInventoryItemIndexByInstanceId(player.inventory.items, itemInstanceId);
  return index >= 0 ? player.inventory.items[index] ?? null : null;
 }

export function peekEquippedItemImpl(self: PlayerRuntimeService, playerId, slot) {

  const player = self.getPlayerOrThrow(playerId);
  if (ARTIFACT_SLOTS.includes(slot)) {
   return player.artifacts?.slots?.find((entry) => entry.slot === slot)?.item ?? null;
  }
  return player.equipment.slots.find((entry) => entry.slot === slot)?.item ?? null;
 }

export function ensureArtifactUnlockStateImpl(self: PlayerRuntimeService, player, options = undefined) {
  const highestRealmLv = typeof self.playerProgressionService?.getHighestRealmLv === 'function'
   ? self.playerProgressionService.getHighestRealmLv(player)
   : Math.max(1, Math.trunc(Number(player?.realm?.realmLv ?? player?.realmLv ?? 1) || 1));
  const shouldUnlockFirstSlot = highestRealmLv >= ARTIFACT_UNLOCK_REALM_LV;
  const previousRevision = Math.max(1, Math.trunc(Number(player?.artifacts?.revision ?? 1) || 1));
  const normalized = normalizeArtifactStateWithTemplates(
   player?.artifacts,
   self.contentTemplateRepository,
   shouldUnlockFirstSlot,
  );
  let changed = !player.artifacts
   || player.artifacts.revision !== normalized.revision
   || !Array.isArray(player.artifacts.slots)
   || player.artifacts.slots.length !== normalized.slots.length;
  for (const nextSlot of normalized.slots) {
   const previousSlot = player.artifacts?.slots?.find((entry) => entry.slot === nextSlot.slot);
   if (!isSameArtifactSlotStateForRuntime(previousSlot, nextSlot)) {
    changed = true;
    break;
   }
  }
  player.artifacts = normalized;
  const movementCapabilitiesChanged = self.refreshMovementCapabilities(player, options?.emitMovementCapabilityDelta !== false);
  if (!changed) {
   return movementCapabilitiesChanged;
  }
  player.artifacts.revision = previousRevision + 1;
  markPlayerDirtyDomains(player, ['artifact']);
  self.bumpPersistentRevision(player);
  return true;
 }

export function splitInventoryItemImpl(self: PlayerRuntimeService, playerId, slotIndex, count = 1) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = self.getPlayerOrThrow(playerId);
  const statisticBefore = self.captureOfflineGainBeforeTick(player);

  const item = player.inventory.items[slotIndex];
  if (!item) {
   throw new NotFoundException(`背包槽位不存在：${slotIndex}`);
  }

  const normalizedCount = Math.max(1, Math.trunc(count));

  const nextCount = Math.min(normalizedCount, item.count);
  const willKeepRemaining = nextCount < item.count;

  const extracted = {
   ...item,
   count: nextCount,
  };
  // 若拆分后原 slot 仍保留剩余堆叠，被拆出的那部分必须分配新 itemInstanceId，
  // 避免与剩余堆叠在 player_inventory_item / market_listing / loot_container 等下游表上共用 PK。
  if (willKeepRemaining && typeof (extracted as any).itemInstanceId === 'string' && (extracted as any).itemInstanceId.length > 0) {
   (extracted as { itemInstanceId?: string }).itemInstanceId = randomUUID();
  }
  consumeInventoryItemAt(player.inventory.items, slotIndex, nextCount);
  player.inventory.revision += 1;
  self.refreshWalletCacheFromInventory(player, item.itemId);
  markPlayerDirtyDomains(player, ['inventory']);
  self.bumpPersistentRevision(player);
  self.recordAssetStatisticMutation(player, statisticBefore);
  return extracted;
 }

export function splitInventoryItemByInstanceIdImpl(self: PlayerRuntimeService, playerId, itemInstanceId, count = 1) {
  const player = self.getPlayerOrThrow(playerId);
  const slotIndex = findInventoryItemIndexByInstanceId(player.inventory.items, itemInstanceId);
  if (slotIndex < 0) {
   throw new NotFoundException(`背包物品不存在：${normalizeInventoryItemInstanceId(itemInstanceId) || 'unknown'}`);
  }
  return self.splitInventoryItem(playerId, slotIndex, count);
 }

export function receiveInventoryItemImpl(self: PlayerRuntimeService, playerId, item, options: any = {}) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = self.getPlayerOrThrow(playerId);
  const statisticBefore = self.captureOfflineGainBeforeTick(player);

  const normalized = self.contentTemplateRepository.normalizeItem(item);
  self.applyNormalizedInventoryReceipt(player, normalized, statisticBefore, options);
  return player;
 }

export function applyNormalizedInventoryReceiptImpl(self: PlayerRuntimeService, player, normalized, statisticBefore, options: any = {}, knownMergeIndex = null) {
  // 装备类必须有稳定 itemInstanceId；缺失或处于迁移期 fallback 时分配新 UUID。
  // 这覆盖所有"装备入手"路径：掉落、合成、强化产物、GM、邮件、兑换码、NPC 商店、
  // 任务奖励、市场买家成交（市场内部已脱壳，到这里时 sourceItem 不带 instanceId）。
  assignItemInstanceIdIfNeeded(normalized);
  let mergeResult;
  let inventoryItemDeltaHint;
  if (knownMergeIndex !== null && knownMergeIndex >= 0 && player.inventory.items[knownMergeIndex]) {
   const existing = player.inventory.items[knownMergeIndex];
   const previousCount = normalizeOfflineGainCount(existing.count);
   addItemStackMergeCount(existing, normalized);
   mergeResult = { entry: existing, index: knownMergeIndex, merged: true };
   inventoryItemDeltaHint = {
    itemId: normalized.itemId,
    name: normalized.name,
    countDelta: Math.max(0, normalizeOfflineGainCount(existing.count) - previousCount),
   };
  }
  else if (knownMergeIndex !== null && knownMergeIndex < 0) {
   player.inventory.items.push(normalized);
   mergeResult = {
    entry: normalized,
    index: player.inventory.items.length - 1,
    merged: false,
   };
   inventoryItemDeltaHint = {
    itemId: normalized.itemId,
    name: normalized.name,
    countDelta: normalizeOfflineGainCount(normalized.count),
   };
  }
  else {
   mergeResult = mergeItemStackInto(player.inventory.items, normalized);
  }
  if (mergeResult.merged && mergeResult.entry.count > MAX_ITEM_COUNT) {
   const attemptedCount = normalizeOfflineGainCount(mergeResult.entry.count);
   self.logger.warn(`物品数量达到上限 [playerId=${player.id}, itemId=${normalized.itemId}, attempted=${attemptedCount}, capped=${MAX_ITEM_COUNT}]`);
   mergeResult.entry.count = MAX_ITEM_COUNT;
   if (inventoryItemDeltaHint) {
    inventoryItemDeltaHint.countDelta = Math.max(
     0,
     inventoryItemDeltaHint.countDelta - Math.max(0, attemptedCount - MAX_ITEM_COUNT),
    );
   }
  }
  player.inventory.revision += 1;
  self.refreshWalletCacheFromInventory(player, normalized.itemId);
  if (typeof self.playerProgressionService?.refreshPreviewForInventoryItem === 'function') {
   self.playerProgressionService.refreshPreviewForInventoryItem(player, normalized.itemId);
  }
  else {
   self.playerProgressionService.refreshPreview(player);
  }
  markPlayerDirtyDomains(player, ['inventory']);
  self.bumpPersistentRevision(player);
  self.recordAssetStatisticMutation(player, statisticBefore, Date.now(), {
   inventoryOnly: options?.inventoryOnlyStatistics === true,
   inventoryItemDeltaHint,
   recordTickSectionDuration: options?.recordTickSectionDuration,
  });
  return player;
 }

export function useItemImpl(self: PlayerRuntimeService, playerId, slotIndex) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = self.getPlayerOrThrow(playerId);
  const statisticBefore = self.captureOfflineGainBeforeTick(player);

  const item = player.inventory.items[slotIndex];
  if (!item) {
   throw new NotFoundException(`背包槽位不存在：${slotIndex}`);
  }

  const requestedLearnTechniqueId = typeof item.learnTechniqueId === 'string' && item.learnTechniqueId.trim()
   ? item.learnTechniqueId.trim()
   : self.contentTemplateRepository.getLearnTechniqueId(item.itemId);
  const learnTechniqueId = requestedLearnTechniqueId
   ? self.resolveLatestTechniqueId(requestedLearnTechniqueId)
   : '';

  let consumed = false;
  let autoBattleSkillsChanged = false;
  let cultivationPreferenceChanged = false;
  const currentTick = resolvePlayerRuntimeTick(player, 0);
  if (learnTechniqueId) {
   if (isTechniqueAggregationId(learnTechniqueId)) {
    throw new BadRequestException('统法只能从统法台参悟');
   }
   const aggregationConflict = self.resolveTechniqueLearningConflict(player, learnTechniqueId);
   if (aggregationConflict) {
    const sourceTechniqueNames = typeof aggregationConflict.vars?.sourceTechniqueNames === 'string'
     ? aggregationConflict.vars.sourceTechniqueNames
     : (aggregationConflict.conflictSourceTechniqueIds ?? []).join('、');
    throw new BadRequestException('TECHNIQUE_AGGREGATE_OVERLAP:' + sourceTechniqueNames);
   }
   if (player.techniques.techniques.some((entry) => entry.techId === learnTechniqueId)) {
    throw new NotFoundException(`功法已经学会：${learnTechniqueId}`);
   }

   const technique = self.contentTemplateRepository.createTechniqueState(learnTechniqueId);
   if (!technique) {
    throw new NotFoundException(`功法不存在：${learnTechniqueId}`);
   }
   const bookMaxLevel = resolveTechniqueBookMaxLevel(item.learnTechniqueMaxLevel, technique);
   const pending = Array.isArray(player.pendingTechniqueComprehensions)
    ? player.pendingTechniqueComprehensions
    : [];
   const existing = pending.find((entry) => entry?.techId === learnTechniqueId);
   const aggregateMetadata = self.techniqueAggregationService?.getMetadataById(learnTechniqueId);
   const requiredBaseProgress = calculateTechniqueComprehensionRequiredProgress({
    sourceKind: aggregateMetadata ? 'created' : 'normal',
    techniqueRealmLv: technique.realmLv,
    grade: technique.grade,
    learnerRealmLv: player.realm?.realmLv ?? 1,
    learnerTransmissionLevel: player.transmissionSkill?.level ?? 1,
   });
   const requiredProgress = aggregateMetadata
    ? self.techniqueAggregationService?.resolveComprehensionRequirement(player, technique, requiredBaseProgress) ?? requiredBaseProgress
    : requiredBaseProgress;
   if (existing) {
    existing.requiredProgress = requiredProgress;
    existing.updatedAtTick = currentTick;
    existing.name = resolvePlayerFacingContentName(learnTechniqueId, '未知功法', technique.name, existing.name);
    existing.strengthPercent = normalizeTechniqueStrengthPercent(technique.strengthPercent);
    existing.selfComprehensionAllowed = true;
    existing.sourceKind = aggregateMetadata ? 'created' : 'normal';
    if (aggregateMetadata) {
     existing.creatorPlayerId = aggregateMetadata.creatorPlayerId;
    }
    if (bookMaxLevel !== undefined) {
     existing.maxLevel = bookMaxLevel;
    }
   }
   else {
    pending.push({
     techId: learnTechniqueId,
     name: resolvePlayerFacingContentName(learnTechniqueId, '未知功法', technique.name),
     strengthPercent: normalizeTechniqueStrengthPercent(technique.strengthPercent),
     sourceKind: aggregateMetadata ? 'created' : 'normal',
     ...(aggregateMetadata?.creatorPlayerId ? { creatorPlayerId: aggregateMetadata.creatorPlayerId } : {}),
     selfComprehensionAllowed: true,
     progress: 0,
     requiredProgress,
     realmLv: Math.max(1, Math.floor(Number(technique.realmLv) || 1)),
     grade: technique.grade ?? undefined,
     category: technique.category ?? undefined,
     maxLevel: bookMaxLevel,
     createdAtTick: currentTick,
     updatedAtTick: currentTick,
    });
   }
   player.pendingTechniqueComprehensions = pending;
   player.techniques.revision += 1;
   cultivationPreferenceChanged = !player.techniques.cultivatingTechId;
   if (cultivationPreferenceChanged) {
    player.techniques.cultivatingTechId = technique.techId;
    player.combat.cultivationActive = true;
   }
   autoBattleSkillsChanged = syncTechniqueAutoBattleSkillCatalog(player, technique);
   consumed = true;
  }
  else {
   assertConsumableItemCooldownReady(player, item, currentTick);
   consumed = self.applyConsumableItem(player, item);
  }
  if (!consumed) {
   throw new NotFoundException(`${resolvePlayerFacingContentName(item.itemId, '未知物品', item.name)}没有可用效果`);
  }
  consumeInventoryItemAt(player.inventory.items, slotIndex, 1);
  if (!learnTechniqueId) {
   markConsumableItemCooldown(player, item, currentTick);
  }
  player.inventory.revision += 1;
  self.refreshWalletCacheFromInventory(player, item.itemId);
  self.playerProgressionService.refreshPreview(player);
  markPlayerDirtyDomains(player, learnTechniqueId
   ? [
    'inventory',
    'technique',
    ...(autoBattleSkillsChanged ? ['auto_battle_skill'] : []),
    ...(cultivationPreferenceChanged ? ['combat_pref'] : []),
   ]
   : ['inventory']);
  self.bumpPersistentRevision(player);
  const requiresFullStatisticDiff = !learnTechniqueId && (
   Boolean(resolveSpiritualRootSeedTier(item))
   || item.itemId === SHATTER_SPIRIT_PILL_ITEM_ID
   || item.itemId === WANGSHENG_PILL_ITEM_ID
  );
  self.recordAssetStatisticMutation(player, statisticBefore, Date.now(), {
   inventoryOnly: !requiresFullStatisticDiff,
   inventoryItemDeltaHint: requiresFullStatisticDiff
    ? undefined
    : {
     itemId: item.itemId,
     name: item.name,
     countDelta: -1,
    },
  });
  return player;
 }

export function useItemByInstanceIdImpl(self: PlayerRuntimeService, playerId, itemInstanceId) {
  const player = self.getPlayerOrThrow(playerId);
  const slotIndex = findInventoryItemIndexByInstanceId(player.inventory.items, itemInstanceId);
  if (slotIndex < 0) {
   throw new NotFoundException(`背包物品不存在：${normalizeInventoryItemInstanceId(itemInstanceId) || 'unknown'}`);
  }
  return self.useItem(playerId, slotIndex);
 }

export function consumeInventoryItemImpl(self: PlayerRuntimeService, playerId, slotIndex, count = 1) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = self.getPlayerOrThrow(playerId);
  const statisticBefore = self.captureOfflineGainBeforeTick(player);

  const item = player.inventory.items[slotIndex];
  if (!item) {
   throw new NotFoundException(`背包槽位不存在：${slotIndex}`);
  }
  consumeInventoryItemAt(player.inventory.items, slotIndex, Math.max(1, Math.trunc(count)));
  player.inventory.revision += 1;
  self.refreshWalletCacheFromInventory(player, item.itemId);
  self.playerProgressionService.refreshPreview(player);
  markPlayerDirtyDomains(player, ['inventory']);
  self.bumpPersistentRevision(player);
  self.recordAssetStatisticMutation(player, statisticBefore);
  return player;
 }

export function consumeInventoryItemByInstanceIdImpl(self: PlayerRuntimeService, playerId, itemInstanceId, count = 1) {
  const player = self.getPlayerOrThrow(playerId);
  const slotIndex = findInventoryItemIndexByInstanceId(player.inventory.items, itemInstanceId);
  if (slotIndex < 0) {
   throw new NotFoundException(`背包物品不存在：${normalizeInventoryItemInstanceId(itemInstanceId) || 'unknown'}`);
  }
  return self.consumeInventoryItem(playerId, slotIndex, count);
 }

export function consumeInventoryItemByItemIdImpl(self: PlayerRuntimeService, playerId, itemId, count = 1) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = self.getPlayerOrThrow(playerId);

  const normalizedCount = Math.max(1, Math.trunc(count));
  if (!Number.isFinite(normalizedCount) || normalizedCount <= 0) {
   throw new NotFoundException('使用数量无效');
  }
  const available = readInventoryItemCount(player, itemId);
  if (available < normalizedCount) {
   throw new NotFoundException(`${resolvePlayerFacingContentName(itemId, '未知物品', self.contentTemplateRepository.getItemName(itemId))}数量不足`);
  }
  const statisticBefore = self.captureOfflineGainBeforeTick(player);
  let remaining = normalizedCount;
  for (let slotIndex = player.inventory.items.length - 1; slotIndex >= 0 && remaining > 0; slotIndex -= 1) {
   const item = player.inventory.items[slotIndex];
   if (!item || item.itemId !== itemId) {
    continue;
   }

   const consumed = Math.min(item.count, remaining);
   consumeInventoryItemAt(player.inventory.items, slotIndex, consumed);
   remaining -= consumed;
  }
  player.inventory.revision += 1;
  self.refreshWalletCacheFromInventory(player, itemId);
  self.playerProgressionService.refreshPreview(player);
  markPlayerDirtyDomains(player, ['inventory']);
  self.bumpPersistentRevision(player);
  self.recordAssetStatisticMutation(player, statisticBefore);
  return player;
 }

export function destroyInventoryItemImpl(self: PlayerRuntimeService, playerId, slotIndex, count = 1) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = self.getPlayerOrThrow(playerId);
  const statisticBefore = self.captureOfflineGainBeforeTick(player);

  const item = player.inventory.items[slotIndex];
  if (!item) {
   throw new NotFoundException(`背包槽位不存在：${slotIndex}`);
  }

  const normalizedCount = Math.max(1, Math.trunc(count));

  const destroyed = {
   ...item,
   count: Math.min(item.count, normalizedCount),
  };
  consumeInventoryItemAt(player.inventory.items, slotIndex, destroyed.count);
  player.inventory.revision += 1;
  self.refreshWalletCacheFromInventory(player, item.itemId);
  self.playerProgressionService.refreshPreview(player);
  markPlayerDirtyDomains(player, ['inventory']);
  self.bumpPersistentRevision(player);
  self.recordAssetStatisticMutation(player, statisticBefore);
  return destroyed;
 }

export function destroyInventoryItemByInstanceIdImpl(self: PlayerRuntimeService, playerId, itemInstanceId, count = 1) {
  const player = self.getPlayerOrThrow(playerId);
  const slotIndex = findInventoryItemIndexByInstanceId(player.inventory.items, itemInstanceId);
  if (slotIndex < 0) {
   throw new NotFoundException(`背包物品不存在：${normalizeInventoryItemInstanceId(itemInstanceId) || 'unknown'}`);
  }
  return self.destroyInventoryItem(playerId, slotIndex, count);
 }

export function sortInventoryImpl(self: PlayerRuntimeService, playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = self.getPlayerOrThrow(playerId);
  if (player.inventory.items.length <= 1) {
   return player;
  }

  const previous = player.inventory.items.map((entry) => `${entry.itemId}:${entry.count}:${entry.enhanceLevel ?? 0}`);

  // 先按签名合并相同物品堆，再排序，避免同一物品多 slot 残留。
  const mergedMap = new Map();
  const mergedOrder = [];
  for (const entry of player.inventory.items) {
   if (!canMergeItemStack(entry)) {
    mergedOrder.push(cloneItemWithCountPreservingTemplate(entry, Math.max(1, Math.trunc(Number(entry.count ?? 1)))));
    continue;
   }
   const signature = createItemStackSignature(entry);
   const existing = mergedMap.get(signature);
   if (existing) {
    existing.count = Math.min(
     existing.count + Math.max(1, Math.trunc(Number(entry.count ?? 1))),
     MAX_ITEM_COUNT,
    );
   }
   else {
    const clone = cloneItemWithCountPreservingTemplate(entry, Math.max(1, Math.trunc(Number(entry.count ?? 1))));
    mergedMap.set(signature, clone);
    mergedOrder.push(clone);
   }
  }
  mergedOrder.sort((left, right) => compareInventoryItems(left, right, self.contentTemplateRepository));
  player.inventory.items = mergedOrder;

  let changed = previous.length !== player.inventory.items.length;
  if (!changed) {
   for (let index = 0; index < previous.length; index += 1) {
    const current = player.inventory.items[index];
    if (!current || previous[index] !== `${current.itemId}:${current.count}:${current.enhanceLevel ?? 0}`) {
     changed = true;
     break;
    }
   }
  }
  if (!changed) {
   return player;
  }
  player.inventory.revision += 1;
  markPlayerDirtyDomains(player, ['inventory']);
  self.bumpPersistentRevision(player);
  return player;
 }

export function equipItemImpl(self: PlayerRuntimeService, playerId, slotIndex, expectedItemInstanceId?: string) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = self.getPlayerOrThrow(playerId);

  const item = player.inventory.items[slotIndex];
  if (!item) {
   throw new NotFoundException(`背包槽位不存在：${slotIndex}`);
  }
  const normalizedItem = self.contentTemplateRepository.normalizeItem(item);
  if (normalizedItem.type === 'artifact') {
   return self.equipArtifactItem(player, slotIndex, normalizedItem, expectedItemInstanceId);
  }
  if (!normalizedItem.equipSlot) {
   throw new NotFoundException(`${resolvePlayerFacingContentName(normalizedItem.itemId, '未知物品', normalizedItem.name)}不能装备`);
  }
  // 装备类必须有稳定 instanceId；迁移期老装备此处 lazy 升级
  assignItemInstanceIdIfNeeded(normalizedItem);
  // 乐观一致性校验：客户端选中目标时看到的 itemInstanceId
  const compare = compareItemInstanceId(
   normalizedItem.itemInstanceId,
   expectedItemInstanceId,
  );
  if (compare === 'mismatch') {
   const hardCheck = isItemInstanceIdHardCheckEnabled();
   console.warn(
    `[player-runtime] equipItem itemInstanceId mismatch player=${playerId} slot=${slotIndex} `
    + `expected=${expectedItemInstanceId} actual=${normalizedItem.itemInstanceId} hardCheck=${hardCheck}`,
   );
   if (hardCheck) {
    throw new BadRequestException('装备目标已变更，请重新选择。');
   }
  }

  const slot = normalizedItem.equipSlot;

  const equipmentEntry = player.equipment.slots.find((entry) => entry.slot === slot);
  if (!equipmentEntry) {
   throw new NotFoundException(`装备槽位不存在：${slot}`);
  }

  const equippedItem = takeSingleInventoryItemForEquipment(player.inventory.items, slotIndex);
  if (!equippedItem) {
   throw new NotFoundException(`背包槽位不存在：${slotIndex}`);
  }
  // 显式把 inventory 槽里物品的 instanceId 透传给装备槽（normalizeItem 会保留 source.itemInstanceId）
  if (typeof normalizedItem.itemInstanceId === 'string' && !equippedItem.itemInstanceId) {
   (equippedItem as any).itemInstanceId = normalizedItem.itemInstanceId;
  }

  const previousEquipped = equipmentEntry.item ?? null;
  equipmentEntry.item = self.contentTemplateRepository.normalizeItem(equippedItem);
  // 装备 normalize 后再次确保 instanceId 没丢
  assignItemInstanceIdIfNeeded(equipmentEntry.item);
  if (previousEquipped) {
   // 卸下的旧装备回背包：与同 (itemId, enhanceLevel) 签名的现有堆叠合并 count；
   // 找不到同签名堆叠时再独立成 slot。previousEquipped 的 itemInstanceId 在合并时
   // 由现有堆叠胜出（直接 ++count，不写入新 instanceId）；独立成 slot 时保留原 id。
   assignItemInstanceIdIfNeeded(previousEquipped);
   mergeItemStackInto(player.inventory.items, previousEquipped);
  }
  player.inventory.revision += 1;
  player.equipment.revision += 1;
  self.playerAttributesService.recalculate(player, 'equipment');
  markPlayerDirtyDomains(player, ['inventory', 'equipment', 'attr']);
  self.bumpPersistentRevision(player);
  return player;
 }

export function equipItemByInstanceIdImpl(self: PlayerRuntimeService, playerId, itemInstanceId) {
  const player = self.getPlayerOrThrow(playerId);
  const slotIndex = findInventoryItemIndexByInstanceId(player.inventory.items, itemInstanceId);
  if (slotIndex < 0) {
   throw new NotFoundException(`背包物品不存在：${normalizeInventoryItemInstanceId(itemInstanceId) || 'unknown'}`);
  }
  return self.equipItem(playerId, slotIndex, normalizeInventoryItemInstanceId(itemInstanceId));
 }

export function unequipItemImpl(self: PlayerRuntimeService, playerId, slot, expectedItemInstanceId?: string) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = self.getPlayerOrThrow(playerId);
  if (ARTIFACT_SLOTS.includes(slot)) {
   return self.unequipArtifactItem(player, slot, expectedItemInstanceId);
  }

  const equipmentEntry = player.equipment.slots.find((entry) => entry.slot === slot);
  if (!equipmentEntry || !equipmentEntry.item) {
   throw new NotFoundException(`装备槽位为空：${slot}`);
  }
  const unequippedItem = equipmentEntry.item;
  // 装备类必须有稳定 instanceId；迁移期老装备此处 lazy 升级
  assignItemInstanceIdIfNeeded(unequippedItem);
  // 乐观一致性校验
  const compare = compareItemInstanceId(
   unequippedItem.itemInstanceId,
   expectedItemInstanceId,
  );
  if (compare === 'mismatch') {
   const hardCheck = isItemInstanceIdHardCheckEnabled();
   console.warn(
    `[player-runtime] unequipItem itemInstanceId mismatch player=${playerId} slot=${slot} `
    + `expected=${expectedItemInstanceId} actual=${unequippedItem.itemInstanceId} hardCheck=${hardCheck}`,
   );
   if (hardCheck) {
    throw new BadRequestException('装备目标已变更，请重新选择。');
   }
  }
  // 卸下的装备回背包：优先与同 (itemId, enhanceLevel) 签名的现有堆叠合并 count。
  mergeItemStackInto(player.inventory.items, unequippedItem);
  equipmentEntry.item = null;
  player.inventory.revision += 1;
  player.equipment.revision += 1;
  self.playerAttributesService.recalculate(player, 'equipment');
  markPlayerDirtyDomains(player, ['inventory', 'equipment', 'attr']);
  self.bumpPersistentRevision(player);
  return player;
 }

export function setArtifactSlotEnabledImpl(self: PlayerRuntimeService, playerId, slot, enabled) {
  const player = self.getPlayerOrThrow(playerId);
  self.ensureArtifactUnlockState(player);
  const entry = player.artifacts?.slots?.find((candidate) => candidate.slot === slot);
  if (!entry) {
   throw new NotFoundException(`法宝槽位不存在：${slot}`);
  }
  if (entry.unlocked !== true) {
   throw new BadRequestException('法宝槽尚未开启');
  }
  const requestedEnabled = enabled === true;
  const sustainCost = requestedEnabled
   ? resolveArtifactSustainCostWithOvercharge(entry.item, resolvePlayerArtifactOverchargeStacks(player))
   : 0;
  const currentArtifactQi = Math.max(0, Math.trunc(Number(entry.qi) || 0));
  const nextEnabled = requestedEnabled && (sustainCost <= 0 || currentArtifactQi >= sustainCost);
  if (entry.enabled === nextEnabled) {
   return player;
  }
  entry.enabled = nextEnabled;
  self.refreshMovementCapabilities(player);
  player.artifacts.revision += 1;
  markPlayerDirtyDomains(player, ['artifact']);
  self.bumpPersistentRevision(player);
  return player;
 }

export function equipArtifactItemImpl(self: PlayerRuntimeService, player, slotIndex, normalizedItem, expectedItemInstanceId) {
  self.ensureArtifactUnlockState(player);
  const artifactEntry = player.artifacts?.slots?.find((entry) => entry.unlocked === true);
  if (!artifactEntry) {
   throw new BadRequestException('法宝槽尚未开启');
  }
  assignItemInstanceIdIfNeeded(normalizedItem);
  const compare = compareItemInstanceId(
   normalizedItem.itemInstanceId,
   expectedItemInstanceId,
  );
  if (compare === 'mismatch') {
   const hardCheck = isItemInstanceIdHardCheckEnabled();
   console.warn(
    `[player-runtime] equipArtifact itemInstanceId mismatch player=${player.playerId} slot=${slotIndex} `
    + `expected=${expectedItemInstanceId} actual=${normalizedItem.itemInstanceId} hardCheck=${hardCheck}`,
   );
   if (hardCheck) {
    throw new BadRequestException('法宝目标已变更，请重新选择。');
   }
  }
  const equippedItem = takeSingleInventoryItemForEquipment(player.inventory.items, slotIndex);
  if (!equippedItem) {
   throw new NotFoundException(`背包槽位不存在：${slotIndex}`);
  }
  if (typeof normalizedItem.itemInstanceId === 'string' && !equippedItem.itemInstanceId) {
   (equippedItem as any).itemInstanceId = normalizedItem.itemInstanceId;
  }
  const previousArtifact = artifactEntry.item ?? null;
  artifactEntry.item = self.contentTemplateRepository.normalizeItem(equippedItem);
  assignItemInstanceIdIfNeeded(artifactEntry.item);
  artifactEntry.maxQi = resolveArtifactMaxQi(artifactEntry.item);
  artifactEntry.qi = artifactEntry.maxQi;
  if (previousArtifact) {
   assignItemInstanceIdIfNeeded(previousArtifact);
   mergeItemStackInto(player.inventory.items, previousArtifact);
  }
  player.inventory.revision += 1;
  player.artifacts.revision += 1;
  self.refreshMovementCapabilities(player);
  markPlayerDirtyDomains(player, ['inventory', 'artifact']);
  self.bumpPersistentRevision(player);
  return player;
 }

export function unequipArtifactItemImpl(self: PlayerRuntimeService, player, slot, expectedItemInstanceId) {
  const artifactEntry = player.artifacts?.slots?.find((entry) => entry.slot === slot);
  if (!artifactEntry || !artifactEntry.item) {
   throw new NotFoundException(`法宝槽位为空：${slot}`);
  }
  const unequippedItem = artifactEntry.item;
  assignItemInstanceIdIfNeeded(unequippedItem);
  const compare = compareItemInstanceId(
   unequippedItem.itemInstanceId,
   expectedItemInstanceId,
  );
  if (compare === 'mismatch') {
   const hardCheck = isItemInstanceIdHardCheckEnabled();
   console.warn(
    `[player-runtime] unequipArtifact itemInstanceId mismatch player=${player.playerId} slot=${slot} `
    + `expected=${expectedItemInstanceId} actual=${unequippedItem.itemInstanceId} hardCheck=${hardCheck}`,
   );
   if (hardCheck) {
    throw new BadRequestException('法宝目标已变更，请重新选择。');
   }
  }
  mergeItemStackInto(player.inventory.items, unequippedItem);
  artifactEntry.item = null;
  artifactEntry.qi = 0;
  artifactEntry.maxQi = 0;
  player.inventory.revision += 1;
  player.artifacts.revision += 1;
  self.refreshMovementCapabilities(player);
  markPlayerDirtyDomains(player, ['inventory', 'artifact']);
  self.bumpPersistentRevision(player);
  return player;
 }

export function applyConsumableItemImpl(self: PlayerRuntimeService, player, item) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  let consumed = false;

  let selfChanged = false;

  const healAmount = typeof item.healAmount === 'number' ? Math.max(0, Math.round(item.healAmount)) : 0;

  const healPercent = typeof item.healPercent === 'number' ? Math.max(0, item.healPercent) : 0;

  const baselineHealPercent = typeof item.baselineHealPercent === 'number' ? Math.max(0, item.baselineHealPercent) : 0;

  const baselineQiPercent = typeof item.baselineQiPercent === 'number' ? Math.max(0, item.baselineQiPercent) : 0;

  const qiPercent = typeof item.qiPercent === 'number' ? Math.max(0, item.qiPercent) : 0;
  const staminaAmount = typeof item.staminaAmount === 'number' ? Math.max(0, Math.trunc(item.staminaAmount)) : 0;
  if (healAmount > 0 || healPercent > 0 || baselineHealPercent > 0 || baselineQiPercent > 0 || qiPercent > 0) {

   const baselineHealAmount = baselineHealPercent > 0
    ? resolveTechniqueStandardMaxHpRecoveryAmount(item.level, baselineHealPercent)
    : 0;

   const baselineQiAmount = baselineQiPercent > 0
    ? resolveTechniqueStandardMaxQiRecoveryAmount(item.level, baselineQiPercent)
    : 0;

   const nextHp = clamp(player.hp + healAmount + baselineHealAmount + Math.round(player.maxHp * healPercent), 0, player.maxHp);

   const nextQi = clamp(player.qi + baselineQiAmount + Math.round(player.maxQi * qiPercent), 0, player.maxQi);
   if (nextHp !== player.hp || nextQi !== player.qi) {
    player.hp = nextHp;
    player.qi = nextQi;
    selfChanged = true;
   }
   consumed = true;
  }
  if (staminaAmount > 0) {
   const now = Date.now();
   const stamina = self.refreshDungeonStamina(player.playerId, now);
   player.stamina = Math.min(DUNGEON_MAX_STAMINA, stamina.current + staminaAmount);
   player.staminaUpdatedAt = now;
   markPlayerDirtyDomains(player, ['progression']);
   consumed = true;
  }
  if (Array.isArray(item.consumeBuffs) && item.consumeBuffs.length > 0) {
   const sourceRealmLv = Math.max(1, Math.floor(player.realm?.realmLv ?? 1));
   for (const buff of item.consumeBuffs) {
    self.applyTemporaryBuff(player.playerId, toConsumableTemporaryBuff(item, buff, sourceRealmLv));
   }
   consumed = true;
  }
  const spiritualRootSeedTier = resolveSpiritualRootSeedTier(item);
  if (spiritualRootSeedTier) {
   const statisticBefore = self.captureOfflineGainBeforeTick(player);
   const result = self.playerProgressionService.applySpiritualRootSeed(player, spiritualRootSeedTier);
   if (!result.changed) {
    const message = result.notices?.find((notice) => typeof notice?.text === 'string' && notice.text.trim())?.text.trim()
     ?? '当前无法使用灵根幼苗';
    throw new BadRequestException(message);
   }
   self.applyProgressionResultWithStatistics(player, result, statisticBefore);
   consumed = true;
  }
  if (item.itemId === SHATTER_SPIRIT_PILL_ITEM_ID || item.itemId === WANGSHENG_PILL_ITEM_ID) {
   const statisticBefore = self.captureOfflineGainBeforeTick(player);
   const result = item.itemId === SHATTER_SPIRIT_PILL_ITEM_ID
    ? self.playerProgressionService.applyShatterSpiritPill(player)
    : self.playerProgressionService.applyWangshengPill(player);
   if (!result.changed) {
    const message = result.notices?.find((notice) => typeof notice?.text === 'string' && notice.text.trim())?.text.trim()
     ?? '当前无法使用该丹药';
    throw new BadRequestException(message);
   }
   self.applyProgressionResultWithStatistics(player, result, statisticBefore);
   consumed = true;
  }
  if (selfChanged) {
   markPlayerDirtyDomains(player, ['vitals']);
   player.selfRevision += 1;
  }
  return consumed;
 }


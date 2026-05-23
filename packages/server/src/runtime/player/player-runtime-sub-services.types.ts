/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import type { SyncedItemStack } from '@mud/shared';

/** 背包物品栈 */
type InventorySlot = SyncedItemStack | null;

/** 钱包余额记录 */
type WalletBalances = Record<string, number>;

/** 装备槽位记录 */
type EquipmentSlots = Record<string, SyncedItemStack | null>;

/** 拾取窗口目标 */
interface LootWindowTarget { x: number; y: number }

/** buff 应用参数 */
interface BuffApplyInput {
  buffId: string;
  duration: number;
  stacks?: number;
  [key: string]: unknown;
}

/** 生命值/灵力设置 */
interface VitalInput {
  hp?: number;
  qi?: number;
}

/** 伤害结果 */
interface DamageResult {
  died: boolean;
  actualDamage: number;
}

/** 玩家背包与装备子服务接口：物品增删、装备穿脱、钱包操作和拾取窗口。 */
export interface PlayerInventoryService {
  replaceInventoryItems(playerId: string, items: InventorySlot[]): void;
  grantItem(playerId: string, itemId: string, count?: number): boolean;
  receiveInventoryItem(playerId: string, item: SyncedItemStack): boolean;
  splitInventoryItem(playerId: string, slotIndex: number, count: number): boolean;
  splitInventoryItemByInstanceId(playerId: string, itemInstanceId: string, count: number): SyncedItemStack;
  consumeInventoryItem(playerId: string, slotIndex: number, count?: number): boolean;
  consumeInventoryItemByInstanceId(playerId: string, itemInstanceId: string, count?: number): SyncedItemStack;
  consumeInventoryItemByItemId(playerId: string, itemId: string, count?: number): boolean;
  destroyInventoryItem(playerId: string, slotIndex: number): boolean;
  destroyInventoryItemByInstanceId(playerId: string, itemInstanceId: string, count?: number): SyncedItemStack;
  sortInventory(playerId: string): void;
  useItem(playerId: string, slotIndex: number): void;
  useItemByInstanceId(playerId: string, itemInstanceId: string): void;
  peekInventoryItem(playerId: string, slotIndex: number): SyncedItemStack | null;
  peekInventoryItemByInstanceId(playerId: string, itemInstanceId: string): SyncedItemStack | null;
  getInventoryCountByItemId(playerId: string, itemId: string): number;
  canReceiveInventoryItem(playerId: string, item: SyncedItemStack): boolean;

  equipItem(playerId: string, slotIndex: number): void;
  equipItemByInstanceId(playerId: string, itemInstanceId: string): void;
  unequipItem(playerId: string, equipSlot: string): void;
  peekEquippedItem(playerId: string, equipSlot: string): SyncedItemStack | null;
  replaceEquipmentSlots(playerId: string, slots: EquipmentSlots): void;

  openLootWindow(playerId: string, target: LootWindowTarget): void;
  clearLootWindow(playerId: string): void;
  getLootWindowTarget(playerId: string): LootWindowTarget | null;

  replaceWalletBalances(playerId: string, balances: WalletBalances): void;
  getWalletBalanceByType(playerId: string, currencyType: string): number;
  canAffordWallet(playerId: string, currencyType: string, amount: number): boolean;
  creditWallet(playerId: string, currencyType: string, amount: number): void;
  debitWallet(playerId: string, currencyType: string, amount: number): boolean;
}

/** 玩家 Buff 子服务接口：临时 buff 应用、PvP 煞气和魂伤管理。 */
export interface PlayerBuffService {
  applyTemporaryBuff(playerId: string, buff: BuffApplyInput): void;
  applyPvPSoulInjury(playerId: string): void;
  addPvPShaInfusionStack(playerId: string): void;
  addPvPShaBacklashStacks(playerId: string, stacks: number): void;
  getBuffStacks(playerId: string, buffId: string): number;
  hasActiveBuff(playerId: string, buffId: string, minStacks?: number): boolean;
  applyShaInfusionDeathPenalty(playerId: string): void;
  applyOrRefreshPvpBuff(playerId: string, buff: BuffApplyInput, stackDelta?: number): void;
  consumePvpBuffStacks(playerId: string, buffId: string, stacks: number): void;
}

/** 玩家生命值/灵力子服务接口：设置血量、消耗灵力、施加伤害和恢复抑制。 */
export interface PlayerVitalService {
  setVitals(playerId: string, vitals: VitalInput): void;
  spendQi(playerId: string, amount: number): boolean;
  applyDamage(playerId: string, amount: number): DamageResult;
  deferVitalRecoveryUntilTick(playerId: string, tick: number): void;
  suppressVitalRecoveryUntilTick(playerId: string, tick: number): void;
}

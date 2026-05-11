/**
 * Sub-service interfaces for PlayerRuntimeService decomposition.
 * Each interface defines a cohesive subset of player runtime responsibilities.
 */

export interface PlayerInventoryService {
  replaceInventoryItems(playerId: string, items: any): void;
  grantItem(playerId: string, itemId: string, count?: number): any;
  receiveInventoryItem(playerId: string, item: any): any;
  splitInventoryItem(playerId: string, slotIndex: number, count: number): any;
  consumeInventoryItem(playerId: string, slotIndex: number, count?: number): any;
  consumeInventoryItemByItemId(playerId: string, itemId: string, count?: number): any;
  destroyInventoryItem(playerId: string, slotIndex: number): any;
  sortInventory(playerId: string): void;
  useItem(playerId: string, slotIndex: number, target?: any): any;
  peekInventoryItem(playerId: string, slotIndex: number): any;
  getInventoryCountByItemId(playerId: string, itemId: string): number;
  canReceiveInventoryItem(playerId: string, item: any): boolean;

  equipItem(playerId: string, slotIndex: number): any;
  unequipItem(playerId: string, equipSlot: string): any;
  peekEquippedItem(playerId: string, equipSlot: string): any;
  replaceEquipmentSlots(playerId: string, slots: any): void;

  openLootWindow(playerId: string, target: any): void;
  clearLootWindow(playerId: string): void;
  getLootWindowTarget(playerId: string): any;

  replaceWalletBalances(playerId: string, balances: any): void;
  getWalletBalanceByType(playerId: string, currencyType: string): number;
  canAffordWallet(playerId: string, currencyType: string, amount: number): boolean;
  creditWallet(playerId: string, currencyType: string, amount: number): any;
  debitWallet(playerId: string, currencyType: string, amount: number): any;
}

export interface PlayerBuffService {
  applyTemporaryBuff(playerId: string, buffId: string, duration: number, stacks?: number): any;
  applyPvPSoulInjury(playerId: string, severity: number): any;
  addPvPShaInfusionStack(playerId: string, stacks?: number): any;
  addPvPShaBacklashStacks(playerId: string, stacks: number): any;
  getBuffStacks(playerId: string, buffId: string): number;
  hasActiveBuff(playerId: string, buffId: string): boolean;
  applyShaInfusionDeathPenalty(playerId: string): any;
  applyOrRefreshPvpBuff(playerId: string, buffId: string, duration: number, stacks?: number): any;
  consumePvpBuffStacks(playerId: string, buffId: string, stacks: number): any;
}

export interface PlayerVitalService {
  setVitals(playerId: string, vitals: any): void;
  spendQi(playerId: string, amount: number): any;
  applyDamage(playerId: string, amount: number, source?: any): any;
  deferVitalRecoveryUntilTick(playerId: string, tick: number): void;
  suppressVitalRecoveryUntilTick(playerId: string, tick: number): void;
}

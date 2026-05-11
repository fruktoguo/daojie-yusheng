import type { PlayerState } from '@mud/shared';

/**
 * 玩家运行时实体，封装 PlayerState 的高频操作。
 * 领域实体，非 @Injectable 服务。
 */
export class RuntimePlayer {
  constructor(private readonly _state: PlayerState) {}

  /** 向后兼容：暴露底层状态。 */
  get state(): PlayerState {
    return this._state;
  }

  /** 背包是否还能容纳物品（有空位或已有同 id 可堆叠栈）。 */
  canReceiveItem(itemId: string): boolean {
    const inv = this._state.inventory;
    if (inv.items.length < inv.capacity) return true;
    return inv.items.some((s) => s.itemId === itemId);
  }

  /** 扣减钱包，余额不足返回 false。 */
  debitWallet(walletType: string, amount: number): boolean {
    const entry = this._state.wallet?.balances.find(
      (b) => b.walletType === walletType,
    );
    if (!entry || entry.balance < amount) return false;
    entry.balance -= amount;
    return true;
  }

  /** 增加钱包余额。 */
  creditWallet(walletType: string, amount: number): void {
    if (!this._state.wallet) {
      this._state.wallet = { balances: [] };
    }
    const entry = this._state.wallet.balances.find(
      (b) => b.walletType === walletType,
    );
    if (entry) {
      entry.balance += amount;
    } else {
      this._state.wallet.balances.push({ walletType, balance: amount });
    }
  }

  /** 施加伤害，返回是否死亡和剩余 HP。 */
  applyDamage(amount: number): { died: boolean; remainingHp: number } {
    this._state.hp = Math.max(0, this._state.hp - amount);
    if (this._state.hp <= 0) {
      this._state.dead = true;
    }
    return { died: this._state.dead, remainingHp: this._state.hp };
  }

  /** 消耗灵气，不足返回 false。 */
  spendQi(amount: number): boolean {
    if (this._state.qi < amount) return false;
    this._state.qi -= amount;
    return true;
  }

  /** 是否拥有指定 buff（可选最低层数）。 */
  hasActiveBuff(buffId: string, minStacks?: number): boolean {
    return this.getBuffStacks(buffId) >= (minStacks ?? 1);
  }

  /** 获取指定 buff 当前层数，无则返回 0。 */
  getBuffStacks(buffId: string): number {
    const buff = this._state.temporaryBuffs?.find(
      (b) => b.buffId === buffId,
    );
    return buff ? buff.stacks : 0;
  }

  /** 是否存活。 */
  isAlive(): boolean {
    return !this._state.dead;
  }

  /** 获取当前坐标，不在世界中返回 null。 */
  getPosition(): { x: number; y: number } | null {
    if (!this._state.inWorld) return null;
    return { x: this._state.x, y: this._state.y };
  }

  /** 获取当前地图实例 ID。 */
  getInstanceId(): string | null {
    return this._state.instanceId ?? null;
  }
}

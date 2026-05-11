/**
 * 辅助状态同步槽位工具类。
 * 用于 tick 同步时判断某个状态是否变化，避免重复下发未变更的数据。
 */

/**
 * SyncSlot<T> — 统一的辅助状态同步槽位
 *
 * 每个 slot 维护上一次发送的状态快照，通过 comparator 判断是否需要重新发送。
 */
export class SyncSlot<T> {
  private previous: T | null = null;
  private dirty = true;

  constructor(
    private readonly comparator: (a: T, b: T) => boolean,
    private readonly cloner: (value: T) => T,
  ) {}

  /** 检查新值是否与上次发送的不同 */
  isDirty(current: T): boolean {
    if (this.dirty || this.previous === null) return true;
    return !this.comparator(this.previous, current);
  }

  /** 提交当前值为已发送状态 */
  commit(current: T): void {
    this.previous = this.cloner(current);
    this.dirty = false;
  }

  /** 强制标记为脏 */
  invalidate(): void {
    this.dirty = true;
  }

  /** 重置为初始状态 */
  reset(): void {
    this.previous = null;
    this.dirty = true;
  }

  /** 获取上次已提交的快照 */
  getPrevious(): T | null {
    return this.previous;
  }
}

/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
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

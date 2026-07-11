/**
 * 按玩家串行总账数据库 I/O；只约束同一玩家，且不阻塞同步 tick 内的统计累计。
 */
export class PlayerStatisticLedgerIoQueue {
  private readonly tailByPlayerId = new Map<string, Promise<void>>();

  async run<TResult>(playerId: string, action: () => Promise<TResult> | TResult): Promise<TResult> {
    const previous = this.tailByPlayerId.get(playerId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.catch(() => undefined).then(() => gate);
    this.tailByPlayerId.set(playerId, tail);

    await previous.catch(() => undefined);
    try {
      return await action();
    } finally {
      release();
      if (this.tailByPlayerId.get(playerId) === tail) {
        this.tailByPlayerId.delete(playerId);
      }
    }
  }
}

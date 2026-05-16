/**
 * 坊市成交历史 retention worker。
 * 按"双玩家最近 100 条 ∩ 7 天保留期"窗口删除老旧 server_market_trade_history 行，
 * 玩家自己面板的最近 100 条永远保留，超过 7 天且双方都不需要的成交才会被裁掉。
 *
 * 主进程内 OnModuleInit 启动周期 timer，避免依赖单独的 docker 服务；调用方也可手动 runOnce。
 */
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { MarketPersistenceService } from '../../../persistence/market-persistence.service';

/** 默认轮询间隔：5 分钟扫一次，单批 500 行，速率温和。 */
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
/** 单玩家保留最近多少条成交不删。 */
const DEFAULT_KEEP_PER_PLAYER = 100;
/** 至少保留多少天内的成交不删。 */
const DEFAULT_RETENTION_DAYS = 7;
/** 单次 DELETE 上限，避免长事务持锁。 */
const DEFAULT_BATCH_LIMIT = 500;
/** 同一周期内允许的连续批次上限，避免一直占着 db。 */
const DEFAULT_MAX_BATCHES_PER_CYCLE = 10;

interface MarketTradeHistoryRetentionPort {
  pruneTradeHistoryByDualKeepWindow(input: {
    cutoffMs?: number;
    keepPerPlayer?: number;
    batchLimit?: number;
  }): Promise<number>;
  isEnabled(): boolean;
}

/** 主进程内自带的成交历史归档 worker。 */
@Injectable()
export class MarketTradeHistoryRetentionWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketTradeHistoryRetentionWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(MarketPersistenceService)
    private readonly marketPersistenceService: MarketTradeHistoryRetentionPort,
  ) {}

  onModuleInit(): void {
    if (typeof this.marketPersistenceService?.isEnabled === 'function'
      && !this.marketPersistenceService.isEnabled()) {
      this.logger.log('坊市成交历史 retention 已跳过：MarketPersistenceService 未启用（无数据库）');
      return;
    }
    this.timer = setInterval(() => {
      void this.runCycle('interval');
    }, DEFAULT_INTERVAL_MS);
    this.timer.unref();
    this.logger.log(
      `坊市成交历史 retention 已启动：每 ${Math.trunc(DEFAULT_INTERVAL_MS / 1000)}s 扫一次，`
      + `单玩家保留最近 ${DEFAULT_KEEP_PER_PLAYER} 条，保留期 ${DEFAULT_RETENTION_DAYS} 天，`
      + `单批最多 ${DEFAULT_BATCH_LIMIT} 行 × 最多 ${DEFAULT_MAX_BATCHES_PER_CYCLE} 批/周期`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** 工具/手工触发用的单次入口；返回本次累计删除行数。 */
  async runOnce(input?: {
    keepPerPlayer?: number;
    retentionDays?: number;
    batchLimit?: number;
    maxBatches?: number;
  }): Promise<number> {
    return this.runCycle('manual', input);
  }

  private async runCycle(
    reason: 'interval' | 'manual',
    overrides?: {
      keepPerPlayer?: number;
      retentionDays?: number;
      batchLimit?: number;
      maxBatches?: number;
    },
  ): Promise<number> {
    if (this.running) {
      return 0;
    }
    if (typeof this.marketPersistenceService?.isEnabled === 'function'
      && !this.marketPersistenceService.isEnabled()) {
      return 0;
    }
    this.running = true;
    const keepPerPlayer = clampPositiveInt(overrides?.keepPerPlayer, DEFAULT_KEEP_PER_PLAYER, 1, 100_000);
    const retentionDays = clampPositiveInt(overrides?.retentionDays, DEFAULT_RETENTION_DAYS, 1, 3650);
    const batchLimit = clampPositiveInt(overrides?.batchLimit, DEFAULT_BATCH_LIMIT, 1, 10_000);
    const maxBatches = clampPositiveInt(overrides?.maxBatches, DEFAULT_MAX_BATCHES_PER_CYCLE, 1, 1_000);
    const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let totalRemoved = 0;
    try {
      for (let batch = 0; batch < maxBatches; batch += 1) {
        const removed = await this.marketPersistenceService.pruneTradeHistoryByDualKeepWindow({
          cutoffMs,
          keepPerPlayer,
          batchLimit,
        });
        totalRemoved += removed;
        if (removed < batchLimit) {
          break;
        }
      }
      if (totalRemoved > 0) {
        this.logger.log(
          `坊市成交历史 retention 完成：reason=${reason} totalRemoved=${totalRemoved} `
          + `keepPerPlayer=${keepPerPlayer} retentionDays=${retentionDays} batchLimit=${batchLimit}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `坊市成交历史 retention 失败：reason=${reason} ${error instanceof Error ? error.stack : String(error)}`,
      );
    } finally {
      this.running = false;
    }
    return totalRemoved;
  }
}

function clampPositiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const truncated = Math.trunc(numeric);
  if (truncated < min || truncated > max) {
    return fallback;
  }
  return truncated;
}

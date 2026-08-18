/**
 * 本文件属于持久化边界，负责数据库真源、flush、兼容转换或失败策略等可靠性逻辑。
 *
 * 维护时要优先考虑幂等、崩溃恢复和自动清理，避免在 tick 内直接引入阻塞 IO。
 */
/**
 * 玩家通用 KV 计数器持久化服务。
 * 管理击杀数、逆天改命次数、历史最高境界等低频碎数据，
 * 内存缓存 + 异步合并批量落库，支持 increment/setMax 语义。
 */
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Pool } from 'pg';

import { isNativeGmBotPlayerId } from '../http/native/native-gm.constants';
import { DatabasePoolProvider } from './database-pool.provider';
import { isRelationMissingError } from './pg-error-utils';

const PLAYER_COUNTERS_TABLE = 'player_counters';
const PLAYER_COUNTERS_FLUSH_DEBOUNCE_MS = 250;
const PLAYER_COUNTERS_FLUSH_BATCH_SIZE = 256;
const PLAYER_COUNTERS_RETRY_BASE_MS = 500;
const PLAYER_COUNTERS_RETRY_MAX_MS = 30_000;
const PLAYER_COUNTERS_SHUTDOWN_RETRY_LIMIT = 2;
const PLAYER_COUNTERS_SHUTDOWN_RETRY_DELAY_MS = 250;

interface PendingCounterWrite {
  value: number;
  revision: number;
}

interface PendingCounterWriteSnapshot {
  playerId: string;
  key: string;
  value: number;
  revision: number;
}

/** 玩家计数器持久化服务：内存缓存 + 异步合并批量落库 */
@Injectable()
export class PlayerCountersPersistenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlayerCountersPersistenceService.name);
  /** player_id -> (counter_key -> value) */
  private readonly cache = new Map<string, Map<string, number>>();
  /** player_id -> (counter_key -> latest dirty value) */
  private readonly dirtyWrites = new Map<string, Map<string, PendingCounterWrite>>();
  private pool: Pool | null = null;
  private enabled = false;
  private recreating = false;
  private dirtyWriteCount = 0;
  private flushTimer: NodeJS.Timeout | null = null;
  private flushInFlight: Promise<number> | null = null;
  private retryAttempt = 0;
  private stopping = false;

  constructor(@Inject(DatabasePoolProvider) private readonly databasePoolProvider: DatabasePoolProvider | null = null) {}

  async onModuleInit(): Promise<void> {
    const pool = this.databasePoolProvider?.getPool('player_counters') ?? null;
    if (!pool) {
      this.logger.log('player_counters 持久化已禁用：未提供数据库连接');
      return;
    }
    this.pool = pool;
    try {
      await ensurePlayerCountersTable(pool);
      await this.loadAll();
      this.enabled = true;
      this.logger.log(`player_counters 持久化已启用，已加载 ${this.cache.size} 名玩家的计数器`);
    } catch (error) {
      this.enabled = false;
      this.logger.error('player_counters 初始化失败', error instanceof Error ? error.stack : String(error));
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    this.clearFlushTimer();
    const inFlight = this.flushInFlight;
    if (inFlight) {
      await inFlight.catch(() => undefined);
    }
    let shutdownFailureAttempt = 0;
    while (this.dirtyWriteCount > 0 && this.pool && this.enabled) {
      try {
        await this.flushOneBatch();
        this.retryAttempt = 0;
        shutdownFailureAttempt = 0;
      } catch (error: unknown) {
        shutdownFailureAttempt += 1;
        if (shutdownFailureAttempt < PLAYER_COUNTERS_SHUTDOWN_RETRY_LIMIT) {
          this.logger.warn(
            `player_counters 关机刷盘失败，准备重试：pending=${this.dirtyWriteCount} attempt=${shutdownFailureAttempt} error=${formatError(error)}`,
          );
          await sleep(PLAYER_COUNTERS_SHUTDOWN_RETRY_DELAY_MS);
          continue;
        }
        const message = `player_counters_shutdown_flush_failed:pending=${this.dirtyWriteCount}:attempt=${shutdownFailureAttempt}`;
        this.logger.error(`${message} ${formatError(error)}`);
        throw new Error(message);
      }
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getPendingWriteCount(): number {
    return this.dirtyWriteCount;
  }

  /** 读取单个计数器值，不存在返回 0。 */
  get(playerId: string, key: string): number {
    if (isNativeGmBotPlayerId(playerId)) {
      return 0;
    }
    return this.cache.get(normalizeId(playerId))?.get(key) ?? 0;
  }

  /** 读取玩家所有计数器。 */
  getAll(playerId: string): ReadonlyMap<string, number> {
    if (isNativeGmBotPlayerId(playerId)) {
      return EMPTY_MAP;
    }
    return this.cache.get(normalizeId(playerId)) ?? EMPTY_MAP;
  }

  /** 设置计数器值（覆盖）。 */
  set(playerId: string, key: string, value: number): void {
    if (isNativeGmBotPlayerId(playerId)) {
      return;
    }
    const pid = normalizeId(playerId);
    let map = this.cache.get(pid);
    if (!map) {
      map = new Map();
      this.cache.set(pid, map);
    }
    map.set(key, value);
    this.markDirty(pid, key, value);
  }

  /** 递增计数器，返回递增后的值。 */
  increment(playerId: string, key: string, delta = 1): number {
    const current = this.get(playerId, key);
    const next = current + delta;
    this.set(playerId, key, next);
    return next;
  }

  /** 设置计数器为 max(current, value)，返回最终值。 */
  setMax(playerId: string, key: string, value: number): number {
    const current = this.get(playerId, key);
    if (value > current) {
      this.set(playerId, key, value);
      return value;
    }
    return current;
  }

  /** 列出所有缓存的玩家 ID。 */
  listCachedPlayerIds(): string[] {
    return Array.from(this.cache.keys());
  }

  /** 释放临时玩家计数器缓存；GM bot 不应长期占用 player_counters 内存。 */
  releasePlayerCache(playerId: string): void {
    const pid = normalizeId(playerId);
    if (!pid) {
      return;
    }
    if (this.dirtyWrites.has(pid)) {
      return;
    }
    this.cache.delete(pid);
  }

  private async loadAll(): Promise<void> {
    if (!this.pool) return;
    const result = await this.pool.query(
      `SELECT player_id, counter_key, value FROM ${PLAYER_COUNTERS_TABLE}`,
    );
    this.cache.clear();
    for (const row of result.rows ?? []) {
      const pid = normalizeId(row.player_id);
      const key = String(row.counter_key ?? '');
      const value = Number(row.value) || 0;
      if (!pid || !key || isNativeGmBotPlayerId(pid)) continue;
      let map = this.cache.get(pid);
      if (!map) {
        map = new Map();
        this.cache.set(pid, map);
      }
      map.set(key, value);
    }
  }

  private markDirty(playerId: string, key: string, value: number): void {
    if (!this.pool || !this.enabled) return;
    let playerWrites = this.dirtyWrites.get(playerId);
    if (!playerWrites) {
      playerWrites = new Map();
      this.dirtyWrites.set(playerId, playerWrites);
    }
    const pending = playerWrites.get(key);
    if (pending) {
      pending.value = value;
      pending.revision += 1;
    } else {
      playerWrites.set(key, { value, revision: 1 });
      this.dirtyWriteCount += 1;
    }
    this.scheduleFlush(PLAYER_COUNTERS_FLUSH_DEBOUNCE_MS);
  }

  private scheduleFlush(delayMs: number): void {
    if (this.stopping || this.flushTimer || this.flushInFlight || this.dirtyWriteCount <= 0) {
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.startFlush();
    }, Math.max(0, Math.trunc(delayMs)));
    this.flushTimer.unref();
  }

  private startFlush(): void {
    if (this.stopping || this.flushInFlight || this.dirtyWriteCount <= 0) {
      return;
    }
    const run = this.flushOneBatch();
    this.flushInFlight = run;
    void this.observeFlush(run);
  }

  private async observeFlush(run: Promise<number>): Promise<void> {
    let retryDelayMs = 0;
    try {
      await run;
      this.retryAttempt = 0;
    } catch (error: unknown) {
      this.retryAttempt += 1;
      retryDelayMs = resolveRetryDelayMs(this.retryAttempt);
      this.logger.warn(
        `player_counters 批量落库失败：pending=${this.dirtyWriteCount} attempt=${this.retryAttempt} retryInMs=${retryDelayMs} error=${formatError(error)}`,
      );
    } finally {
      if (this.flushInFlight === run) {
        this.flushInFlight = null;
      }
      if (this.dirtyWriteCount > 0 && !this.stopping) {
        this.scheduleFlush(retryDelayMs);
      }
    }
  }

  private async flushOneBatch(): Promise<number> {
    if (!this.pool || !this.enabled || this.dirtyWriteCount <= 0) return 0;
    const batch = this.collectDirtyBatch(PLAYER_COUNTERS_FLUSH_BATCH_SIZE);
    if (batch.length === 0) return 0;
    try {
      await this.persistBatch(batch);
    } catch (error: unknown) {
      if (isRelationMissingError(error)) {
        await this.tryRecreateTable();
        await this.persistBatch(batch);
      } else {
        throw error;
      }
    }
    this.acknowledgeBatch(batch);
    return batch.length;
  }

  private collectDirtyBatch(limit: number): PendingCounterWriteSnapshot[] {
    const batch: PendingCounterWriteSnapshot[] = [];
    for (const [playerId, playerWrites] of this.dirtyWrites) {
      for (const [key, pending] of playerWrites) {
        batch.push({ playerId, key, value: pending.value, revision: pending.revision });
        if (batch.length >= limit) {
          return batch;
        }
      }
    }
    return batch;
  }

  private async persistBatch(batch: PendingCounterWriteSnapshot[]): Promise<void> {
    if (!this.pool || !this.enabled || batch.length === 0) return;
    await this.pool.query(
      `
        INSERT INTO ${PLAYER_COUNTERS_TABLE}(player_id, counter_key, value, updated_at)
        SELECT input.player_id, input.counter_key, input.value, now()
        FROM UNNEST($1::varchar[], $2::varchar[], $3::bigint[])
          AS input(player_id, counter_key, value)
        ON CONFLICT (player_id, counter_key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = now()
      `,
      [
        batch.map((entry) => entry.playerId),
        batch.map((entry) => entry.key),
        batch.map((entry) => entry.value),
      ],
    );
  }

  private acknowledgeBatch(batch: PendingCounterWriteSnapshot[]): void {
    for (const entry of batch) {
      const playerWrites = this.dirtyWrites.get(entry.playerId);
      const pending = playerWrites?.get(entry.key);
      if (!playerWrites || !pending || pending.revision !== entry.revision) {
        continue;
      }
      playerWrites.delete(entry.key);
      this.dirtyWriteCount = Math.max(0, this.dirtyWriteCount - 1);
      if (playerWrites.size === 0) {
        this.dirtyWrites.delete(entry.playerId);
      }
    }
  }

  private clearFlushTimer(): void {
    if (!this.flushTimer) return;
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }

  private async tryRecreateTable(): Promise<void> {
    if (!this.pool || this.recreating) return;
    this.recreating = true;
    try {
      await ensurePlayerCountersTable(this.pool);
      this.logger.warn('player_counters 表已自动重建');
    } catch (e: unknown) {
      this.logger.error('player_counters 表自动重建失败', e instanceof Error ? e.message : String(e));
    } finally {
      this.recreating = false;
    }
  }
}

const EMPTY_MAP: ReadonlyMap<string, number> = new Map();

function normalizeId(id: string): string {
  return typeof id === 'string' ? id.trim() : '';
}

function resolveRetryDelayMs(attempt: number): number {
  const exponent = Math.max(0, Math.min(16, Math.trunc(attempt) - 1));
  return Math.min(PLAYER_COUNTERS_RETRY_MAX_MS, PLAYER_COUNTERS_RETRY_BASE_MS * (2 ** exponent));
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensurePlayerCountersTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_COUNTERS_TABLE} (
      player_id varchar(100) NOT NULL,
      counter_key varchar(64) NOT NULL,
      value bigint NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (player_id, counter_key)
    )
  `);
}

/**
 * 本文件属于持久化边界，负责数据库真源、flush、兼容转换或失败策略等可靠性逻辑。
 *
 * 维护时要优先考虑幂等、崩溃恢复和自动清理，避免在 tick 内直接引入阻塞 IO。
 */
/**
 * 玩家通用 KV 计数器持久化服务。
 * 管理击杀数、逆天改命次数、历史最高境界等低频碎数据，
 * 内存缓存 + 异步单条落库，支持 increment/setMax 语义。
 */
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Pool } from 'pg';

import { isNativeGmBotPlayerId } from '../http/native/native-gm.constants';
import { DatabasePoolProvider } from './database-pool.provider';
import { isRelationMissingError } from './pg-error-utils';

const PLAYER_COUNTERS_TABLE = 'player_counters';

/** 玩家计数器持久化服务：内存缓存 + 异步单条落库 */
@Injectable()
export class PlayerCountersPersistenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlayerCountersPersistenceService.name);
  /** player_id -> (counter_key -> value) */
  private readonly cache = new Map<string, Map<string, number>>();
  private readonly pendingWrites = new Map<string, Promise<void>>();
  private pool: Pool | null = null;
  private enabled = false;
  private recreating = false;

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
    const pending = Array.from(this.pendingWrites.values());
    if (pending.length > 0) {
      await Promise.allSettled(pending);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
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
    this.persistSoon(pid, key, value);
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
    this.cache.delete(pid);
    for (const key of Array.from(this.pendingWrites.keys())) {
      if (key.startsWith(`${pid}:`)) {
        this.pendingWrites.delete(key);
      }
    }
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

  private persistSoon(playerId: string, key: string, value: number): void {
    if (!this.pool || !this.enabled) return;
    const writeKey = `${playerId}:${key}`;
    const previous = this.pendingWrites.get(writeKey) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() => this.persistOne(playerId, key, value));
    this.pendingWrites.set(writeKey, next);
    void next.catch((error: unknown) => {
      this.logger.warn(`player_counters 落库失败 [${writeKey}]：${error instanceof Error ? error.message : String(error)}`);
    }).finally(() => {
      if (this.pendingWrites.get(writeKey) === next) {
        this.pendingWrites.delete(writeKey);
      }
    });
  }

  private async persistOne(playerId: string, key: string, value: number): Promise<void> {
    if (!this.pool || !this.enabled) return;
    try {
      await this.pool.query(
        `
          INSERT INTO ${PLAYER_COUNTERS_TABLE}(player_id, counter_key, value, updated_at)
          VALUES ($1, $2, $3, now())
          ON CONFLICT (player_id, counter_key) DO UPDATE SET
            value = EXCLUDED.value,
            updated_at = now()
        `,
        [playerId, key, value],
      );
    } catch (error: unknown) {
      if (isRelationMissingError(error)) {
        await this.tryRecreateTable();
        await this.pool.query(
          `
            INSERT INTO ${PLAYER_COUNTERS_TABLE}(player_id, counter_key, value, updated_at)
            VALUES ($1, $2, $3, now())
            ON CONFLICT (player_id, counter_key) DO UPDATE SET
              value = EXCLUDED.value,
              updated_at = now()
          `,
          [playerId, key, value],
        );
        return;
      }
      throw error;
    }
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

/**
 * 本文件属于持久化边界，负责数据库真源、flush、兼容转换或失败策略等可靠性逻辑。
 *
 * 维护时要优先考虑幂等、崩溃恢复和自动清理，避免在 tick 内直接引入阻塞 IO。
 */
/**
 * 通天塔进度持久化服务。
 * 管理玩家通天塔当前层和历史最高层的内存缓存与数据库落库，
 * 支持异步写入队列和进程关闭前强刷。
 */
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Pool } from 'pg';

import { DatabasePoolProvider } from './database-pool.provider';
import { isRelationMissingError } from './pg-error-utils';

/** 通天塔进度数据结构 */
export interface TongtianTowerProgress {
  playerId: string;
  currentLayer: number;
  highestLayer: number;
  layerChangeCooldownUntilMs: number;
}

export interface TongtianTowerLayerClearResult {
  progress: TongtianTowerProgress;
  firstClear: boolean;
}

const TONGTIAN_TOWER_PROGRESS_TABLE = 'player_tongtian_tower_progress';
const ASYNC_FAILURE_WARNING_INTERVAL_MS = 30_000;

/** 通天塔持久化服务：内存缓存 + 异步落库 */
@Injectable()
export class TongtianTowerPersistenceService implements OnModuleInit {
  private readonly logger = new Logger(TongtianTowerPersistenceService.name);
  private readonly progressByPlayerId = new Map<string, TongtianTowerProgress>();
  private readonly pendingWritesByPlayerId = new Map<string, Promise<void>>();
  private pool: Pool | null = null;
  private enabled = false;
  private recreating = false;
  private initializationFailure: unknown = null;
  private lastAsyncFailureWarningKey = '';
  private lastAsyncFailureWarningAt = 0;

  constructor(private readonly databasePoolProvider: DatabasePoolProvider) {}

  async onModuleInit(): Promise<void> {
    const pool = this.databasePoolProvider.getPool('tongtian_tower');
    if (!pool) {
      this.logger.log('通天塔持久化已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
      return;
    }
    this.pool = pool;
    try {
      await ensureTongtianTowerProgressTable(pool);
      await this.loadAllProgress();
      this.enabled = true;
      this.initializationFailure = null;
      this.logger.log(`通天塔持久化已启用，已加载 ${this.progressByPlayerId.size} 条进度`);
    } catch (error) {
      this.enabled = false;
      this.initializationFailure = error;
      this.logger.error('通天塔持久化初始化失败，已回退为内存模式', error instanceof Error ? error.stack : String(error));
    }
  }

  getOrCreateProgress(playerIdInput: string): TongtianTowerProgress {
    const playerId = normalizePlayerId(playerIdInput);
    const existing = this.progressByPlayerId.get(playerId);
    if (existing) {
      return cloneProgress(existing);
    }
    const progress = createDefaultProgress(playerId);
    this.progressByPlayerId.set(playerId, progress);
    this.persistProgressSoon(progress);
    return cloneProgress(progress);
  }

  updateCurrentLayer(playerIdInput: string, layerInput: number): TongtianTowerProgress {
    const playerId = normalizePlayerId(playerIdInput);
    const layer = normalizeLayer(layerInput);
    const current = this.getMutableProgress(playerId);
    current.currentLayer = layer;
    current.highestLayer = Math.max(current.highestLayer, layer);
    this.persistProgressSoon(current);
    return cloneProgress(current);
  }

  promoteHighestLayer(playerIdInput: string, layerInput: number): TongtianTowerProgress {
    const playerId = normalizePlayerId(playerIdInput);
    const layer = normalizeLayer(layerInput);
    const current = this.getMutableProgress(playerId);
    current.highestLayer = Math.max(current.highestLayer, layer);
    this.persistProgressSoon(current);
    return cloneProgress(current);
  }

  recordLayerClear(
    playerIdInput: string,
    unlockedLayerInput: number,
    cooldownUntilMsInput: number,
  ): TongtianTowerLayerClearResult {
    const playerId = normalizePlayerId(playerIdInput);
    const unlockedLayer = normalizeLayer(unlockedLayerInput);
    const cooldownUntilMs = normalizeTimestampMs(cooldownUntilMsInput);
    const current = this.getMutableProgress(playerId);
    const firstClear = current.highestLayer < unlockedLayer;
    current.highestLayer = Math.max(current.highestLayer, unlockedLayer);
    if (!firstClear) {
      current.layerChangeCooldownUntilMs = Math.max(current.layerChangeCooldownUntilMs, cooldownUntilMs);
    }
    this.persistProgressSoon(current);
    return {
      progress: cloneProgress(current),
      firstClear,
    };
  }

  listCachedProgress(): TongtianTowerProgress[] {
    return Array.from(this.progressByPlayerId.values(), cloneProgress)
      .sort((left, right) => left.playerId.localeCompare(right.playerId, 'zh-Hans-CN'));
  }

  async flushProgress(playerIdInput: string): Promise<void> {
    const playerId = normalizePlayerId(playerIdInput);
    const progress = this.progressByPlayerId.get(playerId);
    if (!progress) {
      return;
    }
    const pending = this.pendingWritesByPlayerId.get(playerId);
    if (pending) {
      await pending.catch(() => undefined);
    }
    await this.persistProgress(progress);
  }

  async flushAllProgress(): Promise<void> {
    const pending = Array.from(this.pendingWritesByPlayerId.values());
    if (pending.length > 0) {
      await Promise.allSettled(pending);
    }
    const progressEntries = Array.from(this.progressByPlayerId.values());
    if (progressEntries.length === 0 || !this.pool) {
      return;
    }
    if (!this.enabled) {
      throw buildTongtianPersistenceUnavailableError(this.initializationFailure);
    }
    const [first, ...remaining] = progressEntries;
    if (first) {
      // 先写一条作为可用性探针；连接池已关闭时不会同时制造逐玩家拒绝风暴。
      await this.persistProgress(first);
    }
    await Promise.all(remaining.map((progress) => this.persistProgress(progress)));
  }

  clearCacheForTest(): void {
    this.progressByPlayerId.clear();
  }

  private getMutableProgress(playerId: string): TongtianTowerProgress {
    const existing = this.progressByPlayerId.get(playerId);
    if (existing) {
      return existing;
    }
    const progress = createDefaultProgress(playerId);
    this.progressByPlayerId.set(playerId, progress);
    return progress;
  }

  private async loadAllProgress(): Promise<void> {
    if (!this.pool) {
      return;
    }
    const result = await this.pool.query(
      `SELECT player_id, current_layer, highest_layer, layer_change_cooldown_until_ms FROM ${TONGTIAN_TOWER_PROGRESS_TABLE}`,
    );
    this.progressByPlayerId.clear();
    for (const row of result.rows ?? []) {
      const playerId = normalizePlayerId(row.player_id);
      const currentLayer = normalizeLayer(row.current_layer);
      const highestLayer = Math.max(currentLayer, normalizeLayer(row.highest_layer));
      this.progressByPlayerId.set(playerId, {
        playerId,
        currentLayer,
        highestLayer,
        layerChangeCooldownUntilMs: normalizeTimestampMs(row.layer_change_cooldown_until_ms),
      });
    }
  }

  private persistProgressSoon(progress: TongtianTowerProgress): void {
    const snapshot = cloneProgress(progress);
    const previous = this.pendingWritesByPlayerId.get(snapshot.playerId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() => this.persistProgress(snapshot));
    this.pendingWritesByPlayerId.set(snapshot.playerId, next);
    void next.catch((error: unknown) => {
      this.warnAsyncPersistFailure(error);
    }).finally(() => {
      if (this.pendingWritesByPlayerId.get(snapshot.playerId) === next) {
        this.pendingWritesByPlayerId.delete(snapshot.playerId);
      }
    });
  }

  private async persistProgress(progress: TongtianTowerProgress): Promise<void> {
    if (!this.pool) {
      return;
    }
    if (!this.enabled) {
      throw buildTongtianPersistenceUnavailableError(this.initializationFailure);
    }
    try {
      await this.pool.query(
        `
          INSERT INTO ${TONGTIAN_TOWER_PROGRESS_TABLE}(
            player_id,
            current_layer,
            highest_layer,
            layer_change_cooldown_until_ms,
            updated_at
          )
          VALUES ($1, $2, $3, $4, now())
          ON CONFLICT (player_id) DO UPDATE SET
            current_layer = EXCLUDED.current_layer,
            highest_layer = GREATEST(${TONGTIAN_TOWER_PROGRESS_TABLE}.highest_layer, EXCLUDED.highest_layer),
            layer_change_cooldown_until_ms = GREATEST(
              ${TONGTIAN_TOWER_PROGRESS_TABLE}.layer_change_cooldown_until_ms,
              EXCLUDED.layer_change_cooldown_until_ms
            ),
            updated_at = now()
        `,
        [
          progress.playerId,
          progress.currentLayer,
          progress.highestLayer,
          progress.layerChangeCooldownUntilMs,
        ],
      );
    } catch (error: unknown) {
      if (isRelationMissingError(error)) {
        await this.tryRecreateTable();
        try {
          await this.pool.query(
            `
              INSERT INTO ${TONGTIAN_TOWER_PROGRESS_TABLE}(
                player_id,
                current_layer,
                highest_layer,
                layer_change_cooldown_until_ms,
                updated_at
              )
              VALUES ($1, $2, $3, $4, now())
              ON CONFLICT (player_id) DO UPDATE SET
                current_layer = EXCLUDED.current_layer,
                highest_layer = GREATEST(${TONGTIAN_TOWER_PROGRESS_TABLE}.highest_layer, EXCLUDED.highest_layer),
                layer_change_cooldown_until_ms = GREATEST(
                  ${TONGTIAN_TOWER_PROGRESS_TABLE}.layer_change_cooldown_until_ms,
                  EXCLUDED.layer_change_cooldown_until_ms
                ),
                updated_at = now()
            `,
            [
              progress.playerId,
              progress.currentLayer,
              progress.highestLayer,
              progress.layerChangeCooldownUntilMs,
            ],
          );
        } catch (retryError) {
          throw normalizeTongtianPersistenceError(retryError);
        }
        return;
      }
      throw normalizeTongtianPersistenceError(error);
    }
  }

  private warnAsyncPersistFailure(error: unknown): void {
    const key = error instanceof Error ? `${error.name}:${error.message}` : String(error);
    const now = Date.now();
    if (key === this.lastAsyncFailureWarningKey
      && now - this.lastAsyncFailureWarningAt < ASYNC_FAILURE_WARNING_INTERVAL_MS) {
      return;
    }
    this.lastAsyncFailureWarningKey = key;
    this.lastAsyncFailureWarningAt = now;
    this.logger.warn(`通天塔进度异步落库失败：${error instanceof Error ? error.message : String(error)}`);
  }

  private async tryRecreateTable(): Promise<void> {
    if (!this.pool || this.recreating) return;
    this.recreating = true;
    try {
      await ensureTongtianTowerProgressTable(this.pool);
      this.logger.warn('player_tongtian_tower_progress 表已自动重建');
    } catch (e: unknown) {
      this.logger.error('player_tongtian_tower_progress 表自动重建失败', e instanceof Error ? e.message : String(e));
    } finally {
      this.recreating = false;
    }
  }
}

function buildTongtianPersistenceUnavailableError(cause: unknown): Error {
  const error = new Error('tongtian_tower_persistence_unavailable');
  (error as Error & { cause?: unknown }).cause = cause;
  return error;
}

function normalizeTongtianPersistenceError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('Cannot use a pool after calling end on the pool')
    || message.toLowerCase().includes('pool is closed')) {
    const normalized = new Error('tongtian_tower_persistence_pool_closed');
    (normalized as Error & { cause?: unknown }).cause = error;
    return normalized;
  }
  return error instanceof Error ? error : new Error(message);
}

async function ensureTongtianTowerProgressTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${TONGTIAN_TOWER_PROGRESS_TABLE} (
      player_id varchar PRIMARY KEY,
      current_layer integer NOT NULL DEFAULT 1,
      highest_layer integer NOT NULL DEFAULT 1,
      layer_change_cooldown_until_ms bigint NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK (current_layer >= 1),
      CHECK (highest_layer >= 1),
      CHECK (layer_change_cooldown_until_ms >= 0)
    )
  `);
  await pool.query(`
    ALTER TABLE ${TONGTIAN_TOWER_PROGRESS_TABLE}
    ADD COLUMN IF NOT EXISTS layer_change_cooldown_until_ms bigint NOT NULL DEFAULT 0
  `);
}

function normalizePlayerId(value: unknown): string {
  const playerId = typeof value === 'string' ? value.trim() : '';
  if (!playerId) {
    throw new Error('通天塔玩家 ID 不能为空');
  }
  return playerId;
}

function normalizeLayer(value: unknown): number {
  const layer = Number(value);
  if (!Number.isFinite(layer)) {
    return 1;
  }
  return Math.max(1, Math.trunc(layer));
}

function normalizeTimestampMs(value: unknown): number {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? Math.max(0, Math.trunc(timestamp)) : 0;
}

function createDefaultProgress(playerId: string): TongtianTowerProgress {
  return {
    playerId,
    currentLayer: 1,
    highestLayer: 1,
    layerChangeCooldownUntilMs: 0,
  };
}

function cloneProgress(progress: TongtianTowerProgress): TongtianTowerProgress {
  return {
    playerId: progress.playerId,
    currentLayer: progress.currentLayer,
    highestLayer: progress.highestLayer,
    layerChangeCooldownUntilMs: progress.layerChangeCooldownUntilMs,
  };
}

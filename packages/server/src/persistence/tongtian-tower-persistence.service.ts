/**
 * 通天塔进度持久化服务。
 * 管理玩家通天塔当前层和历史最高层的内存缓存与数据库落库，
 * 支持异步写入队列和进程关闭前强刷。
 */
import { Injectable, Logger, type BeforeApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import type { Pool } from 'pg';

import { DatabasePoolProvider } from './database-pool.provider';

/** 通天塔进度数据结构 */
export interface TongtianTowerProgress {
  playerId: string;
  currentLayer: number;
  highestLayer: number;
}

const TONGTIAN_TOWER_PROGRESS_TABLE = 'player_tongtian_tower_progress';

/** 通天塔持久化服务：内存缓存 + 异步落库 */
@Injectable()
export class TongtianTowerPersistenceService implements OnModuleInit, BeforeApplicationShutdown {
  private readonly logger = new Logger(TongtianTowerPersistenceService.name);
  private readonly progressByPlayerId = new Map<string, TongtianTowerProgress>();
  private readonly pendingWritesByPlayerId = new Map<string, Promise<void>>();
  private pool: Pool | null = null;
  private enabled = false;

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
      this.logger.log(`通天塔持久化已启用，已加载 ${this.progressByPlayerId.size} 条进度`);
    } catch (error) {
      this.enabled = false;
      this.logger.error('通天塔持久化初始化失败，已回退为内存模式', error instanceof Error ? error.stack : String(error));
    }
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.flushAllProgress();
  }

  getOrCreateProgress(playerIdInput: string): TongtianTowerProgress {
    const playerId = normalizePlayerId(playerIdInput);
    const existing = this.progressByPlayerId.get(playerId);
    if (existing) {
      return cloneProgress(existing);
    }
    const progress = { playerId, currentLayer: 1, highestLayer: 1 };
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
      await pending.catch((error: unknown) => {
        this.logger.warn(`通天塔进度待写入失败，将重试最新进度：${error instanceof Error ? error.message : String(error)}`);
      });
    }
    await this.persistProgress(progress);
  }

  async flushAllProgress(): Promise<void> {
    const pending = Array.from(this.pendingWritesByPlayerId.values());
    if (pending.length > 0) {
      await Promise.allSettled(pending);
    }
    await Promise.all(Array.from(this.progressByPlayerId.values(), (progress) => this.persistProgress(progress)));
  }

  clearCacheForTest(): void {
    this.progressByPlayerId.clear();
  }

  private getMutableProgress(playerId: string): TongtianTowerProgress {
    const existing = this.progressByPlayerId.get(playerId);
    if (existing) {
      return existing;
    }
    const progress = { playerId, currentLayer: 1, highestLayer: 1 };
    this.progressByPlayerId.set(playerId, progress);
    return progress;
  }

  private async loadAllProgress(): Promise<void> {
    if (!this.pool) {
      return;
    }
    const result = await this.pool.query(
      `SELECT player_id, current_layer, highest_layer FROM ${TONGTIAN_TOWER_PROGRESS_TABLE}`,
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
      this.logger.warn(`通天塔进度落库失败：${error instanceof Error ? error.message : String(error)}`);
    }).finally(() => {
      if (this.pendingWritesByPlayerId.get(snapshot.playerId) === next) {
        this.pendingWritesByPlayerId.delete(snapshot.playerId);
      }
    });
  }

  private async persistProgress(progress: TongtianTowerProgress): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }
    try {
      await this.pool.query(
        `
          INSERT INTO ${TONGTIAN_TOWER_PROGRESS_TABLE}(player_id, current_layer, highest_layer, updated_at)
          VALUES ($1, $2, $3, now())
          ON CONFLICT (player_id) DO UPDATE SET
            current_layer = EXCLUDED.current_layer,
            highest_layer = GREATEST(${TONGTIAN_TOWER_PROGRESS_TABLE}.highest_layer, EXCLUDED.highest_layer),
            updated_at = now()
        `,
        [progress.playerId, progress.currentLayer, progress.highestLayer],
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Cannot use a pool after calling end on the pool')) {
        this.logger.warn('通天塔进度落库跳过：连接池已关闭（进程关闭中）');
        this.enabled = false;
        return;
      }
      throw error;
    }
  }
}

async function ensureTongtianTowerProgressTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${TONGTIAN_TOWER_PROGRESS_TABLE} (
      player_id varchar PRIMARY KEY,
      current_layer integer NOT NULL DEFAULT 1,
      highest_layer integer NOT NULL DEFAULT 1,
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK (current_layer >= 1),
      CHECK (highest_layer >= 1)
    )
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

function cloneProgress(progress: TongtianTowerProgress): TongtianTowerProgress {
  return {
    playerId: progress.playerId,
    currentLayer: progress.currentLayer,
    highestLayer: progress.highestLayer,
  };
}

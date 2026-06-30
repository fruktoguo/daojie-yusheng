/**
 * 本文件属于服务端权威运行时，负责道友关系、申请和私聊的低频社交逻辑。
 *
 * 关系真源写入数据库；运行时只在玩家操作时按需查询，不进入 tick 热路径。
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  DaoistDirectMessageView,
  DaoistRelationLevel,
  DaoistRelationView,
  DaoistRequestView,
  NearbyDaoistCandidateView,
  SocialPanelView,
} from '@mud/shared';
import { resolveServerDatabaseUrl } from '../../config/env-alias';
import { DatabasePoolProvider } from '../../persistence/database-pool.provider';
import { PlayerRuntimeService } from '../player/player-runtime.service';

const DAOIST_RELATION_TABLE = 'player_daoist_relation';
const DAOIST_REQUEST_TABLE = 'player_daoist_request';
const DAOIST_REQUEST_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;
const DAOIST_NEARBY_RADIUS = 8;

type PoolLike = {
  connect(): Promise<{ query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>; release(): void }>;
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
};

@Injectable()
export class SocialRuntimeService {
  private readonly logger = new Logger(SocialRuntimeService.name);
  private pool: PoolLike | null = null;
  private enabled = false;

  constructor(
    @Inject(DatabasePoolProvider) private readonly databasePoolProvider: DatabasePoolProvider,
    @Inject(PlayerRuntimeService) private readonly playerRuntimeService: PlayerRuntimeService,
  ) {}

  async onModuleInit(): Promise<void> {
    const databaseUrl = resolveServerDatabaseUrl();
    if (!databaseUrl.trim()) {
      this.logger.log('道友关系持久化已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
      return;
    }
    const pool = this.databasePoolProvider?.getPool?.('social-runtime') as PoolLike | null;
    if (!pool) {
      this.logger.warn('道友关系持久化已禁用：数据库连接池不可用');
      return;
    }
    try {
      await ensureDaoistTables(pool);
      this.pool = pool;
      this.enabled = true;
      this.logger.log('道友关系持久化已启用（player_daoist_relation + player_daoist_request）');
    } catch (error) {
      this.logger.error('道友关系持久化初始化失败，已回退为禁用模式', error instanceof Error ? error.stack : String(error));
      this.pool = null;
      this.enabled = false;
    }
  }

  isEnabled(): boolean {
    return this.enabled && this.pool !== null;
  }

  async buildPanel(playerId: string, runtime?: any): Promise<SocialPanelView> {
    const normalizedPlayerId = normalizePlayerId(playerId);
    if (!normalizedPlayerId || !this.pool || !this.enabled) {
      return { relations: [], incomingRequests: [], outgoingRequests: [], nearbyCandidates: [] };
    }
    const [relations, incomingRequests, outgoingRequests, nearbyCandidates] = await Promise.all([
      this.loadRelations(normalizedPlayerId),
      this.loadRequests(normalizedPlayerId, 'incoming'),
      this.loadRequests(normalizedPlayerId, 'outgoing'),
      this.buildNearbyCandidates(normalizedPlayerId, runtime),
    ]);
    return { relations, incomingRequests, outgoingRequests, nearbyCandidates };
  }

  async buildNearbyCandidates(playerId: string, runtime?: any): Promise<NearbyDaoistCandidateView[]> {
    const normalizedPlayerId = normalizePlayerId(playerId);
    const player = this.playerRuntimeService.getPlayer(normalizedPlayerId);
    const instanceId = normalizeString(player?.instanceId);
    if (!normalizedPlayerId || !instanceId || !runtime || !this.pool || !this.enabled) {
      return [];
    }
    const instance = typeof runtime.getInstanceRuntime === 'function' ? runtime.getInstanceRuntime(instanceId) : null;
    const self = instance?.playersById?.get?.(normalizedPlayerId) ?? player;
    if (!self) {
      return [];
    }
    const relations = await this.loadRelationLevels(normalizedPlayerId);
    const pending = await this.loadPendingRequestDirections(normalizedPlayerId);
    const result: NearbyDaoistCandidateView[] = [];
    for (const entry of instance?.playersById?.values?.() ?? []) {
      const targetPlayerId = normalizePlayerId(entry?.playerId ?? entry?.id);
      if (!targetPlayerId || targetPlayerId === normalizedPlayerId) {
        continue;
      }
      const distance = Math.max(
        Math.abs(Math.trunc(Number(entry?.x) || 0) - Math.trunc(Number(self?.x) || 0)),
        Math.abs(Math.trunc(Number(entry?.y) || 0) - Math.trunc(Number(self?.y) || 0)),
      );
      if (distance > DAOIST_NEARBY_RADIUS) {
        continue;
      }
      result.push({
        playerId: targetPlayerId,
        name: resolvePlayerName(entry),
        distance,
        ...(relations.get(targetPlayerId) ? { relationLevel: relations.get(targetPlayerId) } : {}),
        ...(pending.get(targetPlayerId) ? { pendingRequest: pending.get(targetPlayerId) } : {}),
      });
    }
    return result.sort((left, right) => left.distance - right.distance || left.name.localeCompare(right.name));
  }

  async sendRequest(fromPlayerId: string, targetPlayerId: string, runtime?: any): Promise<{ ok: boolean; reason?: string; panel?: SocialPanelView; targetPanel?: SocialPanelView }> {
    const fromId = normalizePlayerId(fromPlayerId);
    const toId = normalizePlayerId(targetPlayerId);
    if (!fromId || !toId || fromId === toId) {
      return { ok: false, reason: 'invalid_target' };
    }
    if (!this.pool || !this.enabled) {
      return { ok: false, reason: 'social_persistence_disabled' };
    }
    if (!this.isNearby(fromId, toId, runtime)) {
      return { ok: false, reason: 'target_not_nearby' };
    }
    if (await this.areRelated(fromId, toId)) {
      return { ok: false, reason: 'already_related', panel: await this.buildPanel(fromId, runtime) };
    }
    const now = Date.now();
    const existing = await this.pool.query(
      `SELECT request_id
         FROM ${DAOIST_REQUEST_TABLE}
        WHERE status = 'pending'
          AND expires_at_ms > $3
          AND ((from_player_id = $1 AND to_player_id = $2) OR (from_player_id = $2 AND to_player_id = $1))
        LIMIT 1`,
      [fromId, toId, now],
    );
    if ((existing.rows ?? []).length > 0) {
      return { ok: false, reason: 'request_already_pending', panel: await this.buildPanel(fromId, runtime) };
    }
    await this.pool.query(
      `INSERT INTO ${DAOIST_REQUEST_TABLE}
        (request_id, from_player_id, to_player_id, status, created_at_ms, expires_at_ms, updated_at_ms)
       VALUES ($1, $2, $3, 'pending', $4, $5, $4)`,
      [randomUUID(), fromId, toId, now, now + DAOIST_REQUEST_EXPIRE_MS],
    );
    return {
      ok: true,
      panel: await this.buildPanel(fromId, runtime),
      targetPanel: await this.buildPanel(toId, runtime),
    };
  }

  async respondRequest(playerId: string, requestId: string, accept: boolean, runtime?: any): Promise<{ ok: boolean; reason?: string; panel?: SocialPanelView; fromPlayerId?: string; fromPanel?: SocialPanelView }> {
    const normalizedPlayerId = normalizePlayerId(playerId);
    const normalizedRequestId = normalizeString(requestId);
    if (!normalizedPlayerId || !normalizedRequestId) {
      return { ok: false, reason: 'request_not_found' };
    }
    if (!this.pool || !this.enabled) {
      return { ok: false, reason: 'social_persistence_disabled' };
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const now = Date.now();
      const loaded = await client.query(
        `SELECT request_id, from_player_id, to_player_id, status, expires_at_ms
           FROM ${DAOIST_REQUEST_TABLE}
          WHERE request_id = $1
          FOR UPDATE`,
        [normalizedRequestId],
      );
      const request = loaded.rows?.[0];
      if (!request || request.to_player_id !== normalizedPlayerId || request.status !== 'pending' || Number(request.expires_at_ms) <= now) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'request_not_found', panel: await this.buildPanel(normalizedPlayerId, runtime) };
      }
      await client.query(
        `UPDATE ${DAOIST_REQUEST_TABLE}
            SET status = $2, reviewed_at_ms = $3, updated_at_ms = $3
          WHERE request_id = $1`,
        [normalizedRequestId, accept ? 'accepted' : 'rejected', now],
      );
      if (accept) {
        const pair = canonicalPair(request.from_player_id, request.to_player_id);
        await client.query(
          `INSERT INTO ${DAOIST_RELATION_TABLE}
            (player_a_id, player_b_id, level, created_at_ms, updated_at_ms)
           VALUES ($1, $2, 'dao_friend', $3, $3)
           ON CONFLICT (player_a_id, player_b_id)
           DO UPDATE SET level = ${DAOIST_RELATION_TABLE}.level, updated_at_ms = EXCLUDED.updated_at_ms`,
          [pair[0], pair[1], now],
        );
      }
      await client.query('COMMIT');
      return {
        ok: true,
        fromPlayerId: request.from_player_id,
        panel: await this.buildPanel(normalizedPlayerId, runtime),
        fromPanel: await this.buildPanel(request.from_player_id, runtime),
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async updateRelationLevel(playerId: string, targetPlayerId: string, level: DaoistRelationLevel, runtime?: any): Promise<{ ok: boolean; reason?: string; panel?: SocialPanelView; targetPanel?: SocialPanelView }> {
    const fromId = normalizePlayerId(playerId);
    const toId = normalizePlayerId(targetPlayerId);
    const nextLevel = level === 'close_friend' ? 'close_friend' : 'dao_friend';
    if (!fromId || !toId || fromId === toId || !this.pool || !this.enabled) {
      return { ok: false, reason: 'relation_not_found' };
    }
    const pair = canonicalPair(fromId, toId);
    const now = Date.now();
    const result = await this.pool.query(
      `UPDATE ${DAOIST_RELATION_TABLE}
          SET level = $3, updated_at_ms = $4
        WHERE player_a_id = $1 AND player_b_id = $2`,
      [pair[0], pair[1], nextLevel, now],
    ) as any;
    if (Number(result.rowCount ?? 0) <= 0) {
      return { ok: false, reason: 'relation_not_found', panel: await this.buildPanel(fromId, runtime) };
    }
    return { ok: true, panel: await this.buildPanel(fromId, runtime), targetPanel: await this.buildPanel(toId, runtime) };
  }

  async removeRelation(playerId: string, targetPlayerId: string, runtime?: any): Promise<{ ok: boolean; reason?: string; panel?: SocialPanelView; targetPanel?: SocialPanelView }> {
    const fromId = normalizePlayerId(playerId);
    const toId = normalizePlayerId(targetPlayerId);
    if (!fromId || !toId || fromId === toId || !this.pool || !this.enabled) {
      return { ok: false, reason: 'relation_not_found' };
    }
    const pair = canonicalPair(fromId, toId);
    await this.pool.query(`DELETE FROM ${DAOIST_RELATION_TABLE} WHERE player_a_id = $1 AND player_b_id = $2`, [pair[0], pair[1]]);
    return { ok: true, panel: await this.buildPanel(fromId, runtime), targetPanel: await this.buildPanel(toId, runtime) };
  }

  async createDirectMessage(fromPlayerId: string, targetPlayerId: string, message: string): Promise<{ ok: boolean; reason?: string; message?: DaoistDirectMessageView }> {
    const fromId = normalizePlayerId(fromPlayerId);
    const toId = normalizePlayerId(targetPlayerId);
    const text = normalizeDirectMessage(message);
    if (!fromId || !toId || fromId === toId || !text) {
      return { ok: false, reason: 'invalid_message' };
    }
    if (!await this.areRelated(fromId, toId)) {
      return { ok: false, reason: 'relation_not_found' };
    }
    const fromPlayer = this.playerRuntimeService.getPlayer(fromId);
    const toPlayer = this.playerRuntimeService.getPlayer(toId);
    return {
      ok: true,
      message: {
        messageId: randomUUID(),
        fromPlayerId: fromId,
        fromName: resolvePlayerName(fromPlayer, fromId),
        toPlayerId: toId,
        toName: resolvePlayerName(toPlayer, toId),
        text,
        sentAt: Date.now(),
      },
    };
  }

  async areRelated(playerId: string, targetPlayerId: string, minimumLevel: DaoistRelationLevel = 'dao_friend'): Promise<boolean> {
    const fromId = normalizePlayerId(playerId);
    const toId = normalizePlayerId(targetPlayerId);
    if (!fromId || !toId || fromId === toId || !this.pool || !this.enabled) {
      return false;
    }
    const pair = canonicalPair(fromId, toId);
    const result = await this.pool.query(
      `SELECT level FROM ${DAOIST_RELATION_TABLE} WHERE player_a_id = $1 AND player_b_id = $2 LIMIT 1`,
      [pair[0], pair[1]],
    );
    const level = result.rows?.[0]?.level;
    if (minimumLevel === 'close_friend') {
      return level === 'close_friend';
    }
    return level === 'dao_friend' || level === 'close_friend';
  }

  private async loadRelations(playerId: string): Promise<DaoistRelationView[]> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const result = await this.pool.query(
      `SELECT player_a_id, player_b_id, level, created_at_ms, updated_at_ms
         FROM ${DAOIST_RELATION_TABLE}
        WHERE player_a_id = $1 OR player_b_id = $1
        ORDER BY updated_at_ms DESC`,
      [playerId],
    );
    return (result.rows ?? []).map((row) => {
      const targetPlayerId = row.player_a_id === playerId ? row.player_b_id : row.player_a_id;
      const player = this.playerRuntimeService.getPlayer(targetPlayerId);
      return {
        playerId: targetPlayerId,
        name: resolvePlayerName(player, targetPlayerId),
        level: row.level === 'close_friend' ? 'close_friend' : 'dao_friend',
        online: Boolean(player?.sessionId),
        ...(normalizeString(player?.instanceId) ? { instanceId: normalizeString(player?.instanceId) } : {}),
        ...(Number.isFinite(Number(player?.x)) ? { x: Math.trunc(Number(player.x)) } : {}),
        ...(Number.isFinite(Number(player?.y)) ? { y: Math.trunc(Number(player.y)) } : {}),
        createdAt: Math.max(0, Math.trunc(Number(row.created_at_ms) || 0)),
        updatedAt: Math.max(0, Math.trunc(Number(row.updated_at_ms) || 0)),
      };
    });
  }

  private async loadRelationLevels(playerId: string): Promise<Map<string, DaoistRelationLevel>> {
    const relations = await this.loadRelations(playerId);
    return new Map(relations.map((entry) => [entry.playerId, entry.level]));
  }

  private async loadRequests(playerId: string, direction: 'incoming' | 'outgoing'): Promise<DaoistRequestView[]> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const column = direction === 'incoming' ? 'to_player_id' : 'from_player_id';
    const result = await this.pool.query(
      `SELECT request_id, from_player_id, to_player_id, status, created_at_ms, expires_at_ms
         FROM ${DAOIST_REQUEST_TABLE}
        WHERE ${column} = $1
          AND status = 'pending'
          AND expires_at_ms > $2
        ORDER BY created_at_ms DESC`,
      [playerId, Date.now()],
    );
    return (result.rows ?? []).map((row) => {
      const fromPlayer = this.playerRuntimeService.getPlayer(row.from_player_id);
      const toPlayer = this.playerRuntimeService.getPlayer(row.to_player_id);
      return {
        requestId: row.request_id,
        fromPlayerId: row.from_player_id,
        fromName: resolvePlayerName(fromPlayer, row.from_player_id),
        toPlayerId: row.to_player_id,
        toName: resolvePlayerName(toPlayer, row.to_player_id),
        status: row.status,
        createdAt: Math.max(0, Math.trunc(Number(row.created_at_ms) || 0)),
        expiresAt: Math.max(0, Math.trunc(Number(row.expires_at_ms) || 0)),
      };
    });
  }

  private async loadPendingRequestDirections(playerId: string): Promise<Map<string, 'incoming' | 'outgoing'>> {
    if (!this.pool || !this.enabled) {
      return new Map();
    }
    const result = await this.pool.query(
      `SELECT from_player_id, to_player_id
         FROM ${DAOIST_REQUEST_TABLE}
        WHERE status = 'pending'
          AND expires_at_ms > $2
          AND (from_player_id = $1 OR to_player_id = $1)`,
      [playerId, Date.now()],
    );
    const map = new Map<string, 'incoming' | 'outgoing'>();
    for (const row of result.rows ?? []) {
      if (row.from_player_id === playerId) {
        map.set(row.to_player_id, 'outgoing');
      } else if (row.to_player_id === playerId) {
        map.set(row.from_player_id, 'incoming');
      }
    }
    return map;
  }

  private isNearby(fromPlayerId: string, targetPlayerId: string, runtime?: any): boolean {
    const fromPlayer = this.playerRuntimeService.getPlayer(fromPlayerId);
    const targetPlayer = this.playerRuntimeService.getPlayer(targetPlayerId);
    if (!fromPlayer || !targetPlayer || normalizeString(fromPlayer.instanceId) !== normalizeString(targetPlayer.instanceId)) {
      return false;
    }
    const instanceId = normalizeString(fromPlayer.instanceId);
    const instance = runtime && typeof runtime.getInstanceRuntime === 'function' ? runtime.getInstanceRuntime(instanceId) : null;
    const from = instance?.playersById?.get?.(fromPlayerId) ?? fromPlayer;
    const target = instance?.playersById?.get?.(targetPlayerId) ?? targetPlayer;
    const distance = Math.max(
      Math.abs(Math.trunc(Number(from?.x) || 0) - Math.trunc(Number(target?.x) || 0)),
      Math.abs(Math.trunc(Number(from?.y) || 0) - Math.trunc(Number(target?.y) || 0)),
    );
    return distance <= DAOIST_NEARBY_RADIUS;
  }
}

async function ensureDaoistTables(pool: PoolLike): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${DAOIST_RELATION_TABLE} (
        player_a_id varchar(100) NOT NULL,
        player_b_id varchar(100) NOT NULL,
        level varchar(24) NOT NULL DEFAULT 'dao_friend',
        created_at_ms bigint NOT NULL,
        updated_at_ms bigint NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (player_a_id, player_b_id)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS player_daoist_relation_a_idx
      ON ${DAOIST_RELATION_TABLE}(player_a_id, updated_at_ms DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS player_daoist_relation_b_idx
      ON ${DAOIST_RELATION_TABLE}(player_b_id, updated_at_ms DESC)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${DAOIST_REQUEST_TABLE} (
        request_id varchar(160) PRIMARY KEY,
        from_player_id varchar(100) NOT NULL,
        to_player_id varchar(100) NOT NULL,
        status varchar(24) NOT NULL,
        created_at_ms bigint NOT NULL,
        expires_at_ms bigint NOT NULL,
        reviewed_at_ms bigint,
        updated_at_ms bigint NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS player_daoist_request_to_idx
      ON ${DAOIST_REQUEST_TABLE}(to_player_id, status, expires_at_ms DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS player_daoist_request_from_idx
      ON ${DAOIST_REQUEST_TABLE}(from_player_id, status, expires_at_ms DESC)
    `);
  } finally {
    client.release();
  }
}

function canonicalPair(left: string, right: string): [string, string] {
  return left <= right ? [left, right] : [right, left];
}

function normalizePlayerId(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function resolvePlayerName(player: any, fallback = ''): string {
  const displayName = normalizeString(player?.displayName);
  if (displayName) return displayName;
  const name = normalizeString(player?.name);
  if (name) return name;
  return normalizeString(player?.playerId) || normalizeString(player?.id) || fallback;
}

function normalizeDirectMessage(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().slice(0, 200).replace(/[<>&"']/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[ch] || ch)
    : '';
}

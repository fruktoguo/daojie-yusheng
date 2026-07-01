/**
 * 本文件属于服务端权威运行时，负责聊天频道的低频历史与增量下发。
 *
 * 频道云端只保留最新 100 条；发送时按目标频道最小范围下发，不进入 tick 热路径。
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { S2C, VIEW_RADIUS, type ChatMessageScope, type NoticeItemView } from '@mud/shared';

import { resolveServerDatabaseUrl } from '../../config/env-alias';
import { DatabasePoolProvider } from '../../persistence/database-pool.provider';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { WorldSessionService } from '../../network/world-session.service';

const CHAT_MESSAGE_TABLE = 'server_chat_message';
const CHAT_HISTORY_LIMIT = 100;
const CHAT_TEXT_MAX_LENGTH = 200;

type ChatChannel = ChatMessageScope;

type PoolLike = {
  connect(): Promise<{ query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>; release(): void }>;
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
};

interface RuntimePlayerLike {
  playerId?: string;
  id?: string;
  name?: string;
  displayName?: string;
  instanceId?: string | null;
  sectId?: string | null;
  x?: number;
  y?: number;
}

interface ChatMessageRecord {
  messageId: string;
  channel: ChatChannel;
  text: string;
  from: string;
  fromPlayerId: string;
  occurredAt: number;
  instanceId?: string | null;
  sectId?: string | null;
  x?: number | null;
  y?: number | null;
}

@Injectable()
export class ChatRuntimeService {
  private readonly logger = new Logger(ChatRuntimeService.name);
  private pool: PoolLike | null = null;
  private enabled = false;
  private readonly memoryHistoryByChannel = new Map<ChatChannel, ChatMessageRecord[]>();

  constructor(
    @Inject(DatabasePoolProvider) private readonly databasePoolProvider: DatabasePoolProvider,
    @Inject(PlayerRuntimeService) private readonly playerRuntimeService: PlayerRuntimeService,
    @Inject(WorldSessionService) private readonly worldSessionService: WorldSessionService,
  ) {}

  async onModuleInit(): Promise<void> {
    const databaseUrl = resolveServerDatabaseUrl();
    if (!databaseUrl.trim()) {
      this.logger.log('聊天历史云端持久化已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
      return;
    }
    const pool = this.databasePoolProvider?.getPool?.('chat-runtime') as PoolLike | null;
    if (!pool) {
      this.logger.warn('聊天历史云端持久化已禁用：数据库连接池不可用');
      return;
    }
    try {
      await ensureChatTables(pool);
      this.pool = pool;
      this.enabled = true;
      this.logger.log('聊天历史云端持久化已启用（server_chat_message）');
    } catch (error) {
      this.logger.error('聊天历史云端持久化初始化失败，已回退为内存模式', error instanceof Error ? error.stack : String(error));
      this.pool = null;
      this.enabled = false;
    }
  }

  async handlePlayerChat(playerId: string, payload: { message?: unknown; channel?: unknown }): Promise<void> {
    const normalizedPlayerId = normalizeString(playerId);
    if (!normalizedPlayerId) {
      return;
    }
    const player = this.playerRuntimeService.getPlayer(normalizedPlayerId) as RuntimePlayerLike | null;
    if (!player) {
      return;
    }
    const text = normalizeChatText(payload?.message);
    if (!text) {
      return;
    }
    const channel = normalizeChatChannel(payload?.channel) ?? 'nearby';
    const record = this.createMessageRecord(player, normalizedPlayerId, channel, text);
    if (!record) {
      return;
    }
    await this.persistMessage(record);
    this.emitMessageDelta(record);
  }

  async emitInitialHistory(client: { emit?: (event: string, payload: unknown) => void } | null | undefined, playerId: string): Promise<void> {
    if (!client || typeof client.emit !== 'function') {
      return;
    }
    const player = this.playerRuntimeService.getPlayer(playerId) as RuntimePlayerLike | null;
    if (!player) {
      return;
    }
    const [nearby, world, sect] = await Promise.all([
      this.loadVisibleHistory('nearby', player),
      this.loadVisibleHistory('world', player),
      this.loadVisibleHistory('sect', player),
    ]);
    const items = [...nearby, ...world, ...sect]
      .sort((left, right) => left.occurredAt - right.occurredAt || left.messageId.localeCompare(right.messageId))
      .map(toNoticeItem);
    if (items.length > 0) {
      client.emit(S2C.Notice, { items });
    }
  }

  private createMessageRecord(player: RuntimePlayerLike, playerId: string, channel: ChatChannel, text: string): ChatMessageRecord | null {
    const instanceId = normalizeString(player.instanceId);
    const sectId = normalizeString(player.sectId);
    if (channel === 'nearby' && !instanceId) {
      return null;
    }
    if (channel === 'sect' && !sectId) {
      this.worldSessionService.getSocketByPlayerId(playerId)?.emit(S2C.Error, {
        code: 'CHAT_SECT_REQUIRED',
        message: '尚未加入宗门，无法发送宗门频道消息',
      });
      return null;
    }
    return {
      messageId: `chat:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
      channel,
      text,
      from: resolvePlayerName(player, playerId),
      fromPlayerId: playerId,
      occurredAt: Date.now(),
      instanceId: instanceId || null,
      sectId: sectId || null,
      x: normalizeFiniteInteger(player.x),
      y: normalizeFiniteInteger(player.y),
    };
  }

  private async persistMessage(record: ChatMessageRecord): Promise<void> {
    this.appendMemoryRecord(record);
    if (!this.pool || !this.enabled) {
      return;
    }
    try {
      await this.pool.query(
        `INSERT INTO ${CHAT_MESSAGE_TABLE} (
           message_id, channel, from_player_id, from_label, text, occurred_at_ms,
           instance_id, sect_id, pos_x, pos_y
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [record.messageId, record.channel, record.fromPlayerId, record.from, record.text, record.occurredAt, record.instanceId, record.sectId, record.x, record.y],
      );
      await this.prunePersistedChannel(record.channel);
    } catch (error) {
      this.logger.warn(`聊天消息写入失败，已保留内存历史：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private appendMemoryRecord(record: ChatMessageRecord): void {
    const records = this.memoryHistoryByChannel.get(record.channel) ?? [];
    records.push(record);
    if (records.length > CHAT_HISTORY_LIMIT) {
      records.splice(0, records.length - CHAT_HISTORY_LIMIT);
    }
    this.memoryHistoryByChannel.set(record.channel, records);
  }

  private async prunePersistedChannel(channel: ChatChannel): Promise<void> {
    if (!this.pool) {
      return;
    }
    await this.pool.query(
      `DELETE FROM ${CHAT_MESSAGE_TABLE}
        WHERE channel = $1
          AND message_id NOT IN (
            SELECT message_id FROM ${CHAT_MESSAGE_TABLE}
             WHERE channel = $1
             ORDER BY occurred_at_ms DESC, message_id DESC
             LIMIT ${CHAT_HISTORY_LIMIT}
          )`,
      [channel],
    );
  }

  private async loadVisibleHistory(channel: ChatChannel, player: RuntimePlayerLike): Promise<ChatMessageRecord[]> {
    const records = await this.loadChannelHistory(channel);
    return records.filter((entry) => this.canPlayerSeeRecord(player, entry));
  }

  private async loadChannelHistory(channel: ChatChannel): Promise<ChatMessageRecord[]> {
    if (this.pool && this.enabled) {
      try {
        const result = await this.pool.query(
          `SELECT message_id, channel, from_player_id, from_label, text, occurred_at_ms,
                  instance_id, sect_id, pos_x, pos_y
             FROM ${CHAT_MESSAGE_TABLE}
            WHERE channel = $1
            ORDER BY occurred_at_ms DESC, message_id DESC
            LIMIT ${CHAT_HISTORY_LIMIT}`,
          [channel],
        );
        return result.rows.map(rowToRecord).reverse();
      } catch (error) {
        this.logger.warn(`读取聊天历史失败，回退内存历史：${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return [...(this.memoryHistoryByChannel.get(channel) ?? [])];
  }

  private canPlayerSeeRecord(player: RuntimePlayerLike, record: ChatMessageRecord): boolean {
    if (record.channel === 'world') {
      return true;
    }
    if (record.channel === 'sect') {
      return Boolean(normalizeString(player.sectId) && normalizeString(player.sectId) === normalizeString(record.sectId));
    }
    const instanceId = normalizeString(player.instanceId);
    if (!instanceId || instanceId !== normalizeString(record.instanceId)) {
      return false;
    }
    const playerX = normalizeFiniteInteger(player.x);
    const playerY = normalizeFiniteInteger(player.y);
    if (playerX == null || playerY == null || record.x == null || record.y == null) {
      return true;
    }
    return Math.max(Math.abs(playerX - record.x), Math.abs(playerY - record.y)) <= VIEW_RADIUS;
  }

  private emitMessageDelta(record: ChatMessageRecord): void {
    const payload = { items: [toNoticeItem(record)] };
    for (const binding of this.worldSessionService.listBindings()) {
      const target = this.playerRuntimeService.getPlayer(binding.playerId) as RuntimePlayerLike | null;
      if (!target || !this.canPlayerSeeRecord(target, record)) {
        continue;
      }
      this.worldSessionService.getSocketByPlayerId(binding.playerId)?.emit(S2C.Notice, payload);
    }
  }
}

async function ensureChatTables(pool: PoolLike): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${CHAT_MESSAGE_TABLE} (
        message_id varchar(80) PRIMARY KEY,
        channel varchar(24) NOT NULL,
        from_player_id varchar(100) NOT NULL,
        from_label varchar(100) NOT NULL,
        text varchar(240) NOT NULL,
        occurred_at_ms bigint NOT NULL,
        instance_id varchar(160),
        sect_id varchar(160),
        pos_x integer,
        pos_y integer,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS server_chat_message_channel_time_idx
      ON ${CHAT_MESSAGE_TABLE}(channel, occurred_at_ms DESC, message_id DESC)
    `);
  } finally {
    client.release();
  }
}

function toNoticeItem(record: ChatMessageRecord): NoticeItemView {
  return {
    messageId: record.messageId,
    kind: 'chat',
    text: record.text,
    from: record.from,
    occurredAt: record.occurredAt,
    scope: record.channel,
  };
}

function rowToRecord(row: any): ChatMessageRecord {
  return {
    messageId: normalizeString(row.message_id),
    channel: normalizeChatChannel(row.channel) ?? 'nearby',
    text: normalizeString(row.text),
    from: normalizeString(row.from_label),
    fromPlayerId: normalizeString(row.from_player_id),
    occurredAt: Math.max(0, Math.trunc(Number(row.occurred_at_ms) || 0)),
    instanceId: normalizeString(row.instance_id) || null,
    sectId: normalizeString(row.sect_id) || null,
    x: normalizeNullableInteger(row.pos_x),
    y: normalizeNullableInteger(row.pos_y),
  };
}

function normalizeChatChannel(value: unknown): ChatChannel | null {
  return value === 'nearby' || value === 'world' || value === 'sect' ? value : null;
}

function normalizeChatText(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().slice(0, CHAT_TEXT_MAX_LENGTH).replace(/[<>&"']/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[ch] || ch)
    : '';
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function normalizeFiniteInteger(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

function normalizeNullableInteger(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return normalizeFiniteInteger(value);
}

function resolvePlayerName(player: RuntimePlayerLike, fallback = ''): string {
  return normalizeString(player.displayName) || normalizeString(player.name) || normalizeString(player.playerId) || normalizeString(player.id) || fallback;
}

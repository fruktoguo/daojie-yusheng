/**
 * 本文件属于服务端权威运行时，负责聊天频道的低频历史与增量下发。
 *
 * 频道云端只保留最新 100 条；发送时按目标频道最小范围下发，不进入 tick 热路径。
 */
import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  S2C,
  VIEW_RADIUS,
  type ChatHistoryCursorView,
  type ChatHistorySyncView,
  type ChatMessageScope,
  type C2S_RequestChatHistoryView,
  type ServerChatMessageView,
} from '@mud/shared';

import { resolveServerDatabaseUrl } from '../../config/env-alias';
import { DatabasePoolProvider } from '../../persistence/database-pool.provider';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { WorldSessionService } from '../../network/world-session.service';
import { resolvePlayerDisplayName } from '../player/player-display-name';

const CHAT_MESSAGE_TABLE = 'server_chat_message';
const CHAT_HISTORY_LIMIT = 100;
const CHAT_TEXT_MAX_LENGTH = 200;
const CHAT_PRUNE_DELAY_MS = 1_000;
const CHAT_PRUNE_BATCH_SIZE = 100;
const CHAT_PRUNE_WRITE_INTERVAL = 25;
const CHAT_MEMORY_STREAM_LIMIT = 512;
/** 覆盖目标单服 10000 实例及宗门活跃流，避免 LRU 抖动把裁剪退化为逐条执行。 */
const CHAT_ACTIVE_STREAM_STATE_LIMIT = 16_384;
const CHAT_GLOBAL_ADMISSION_CAPACITY = 200;
const CHAT_GLOBAL_ADMISSION_REFILL_PER_SECOND = 40;
const CHAT_DELIVERY_BUDGET_CAPACITY_BYTES = 5_000_000;
const CHAT_DELIVERY_BUDGET_REFILL_BYTES_PER_SECOND = 1_200_000;
const CHAT_DELIVERY_ENVELOPE_ESTIMATE_BYTES = 160;

const CHAT_CHANNEL_ADMISSION_POLICY: Record<ChatMessageScope, { capacity: number; refillPerSecond: number }> = {
  world: { capacity: 3, refillPerSecond: 0.6 },
  sect: { capacity: 10, refillPerSecond: 2 },
  nearby: { capacity: 10, refillPerSecond: 2 },
};

type ChatChannel = ChatMessageScope;

type PoolLike = {
  connect(): Promise<{ query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>; release(): void }>;
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number }>;
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

interface ChatStreamRef {
  key: string;
  channel: ChatChannel;
  scopeId: string | null;
}

interface ChatAdmissionBucket {
  tokens: number;
  lastRefillAt: number;
}

interface ChatRuntimeWorldLike {
  getInstanceRuntime?(instanceId: string): {
    collectVisiblePlayers?(
      observer: { playerId: string; x: number; y: number },
      radius: number,
    ): Array<{ playerId?: string }>;
  } | null;
}

interface ChatClientPort {
  id?: string;
  emit?: (event: string, payload: unknown) => void;
}

@Injectable()
export class ChatRuntimeService implements OnModuleDestroy {
  private readonly logger = new Logger(ChatRuntimeService.name);
  private pool: PoolLike | null = null;
  private enabled = false;
  private persistenceRequired = false;
  private readonly memoryHistoryByStream = new Map<string, ChatMessageRecord[]>();
  private readonly pendingPruneStreams = new Map<string, ChatStreamRef>();
  private readonly persistedWriteCountsByStream = new Map<string, number>();
  private readonly streamAdmissionBuckets = new Map<string, ChatAdmissionBucket>();
  private readonly globalAdmissionBucket: ChatAdmissionBucket = {
    tokens: CHAT_GLOBAL_ADMISSION_CAPACITY,
    lastRefillAt: Date.now(),
  };
  private readonly deliveryAdmissionBucket: ChatAdmissionBucket = {
    tokens: CHAT_DELIVERY_BUDGET_CAPACITY_BYTES,
    lastRefillAt: Date.now(),
  };
  private pruneTimer: ReturnType<typeof setTimeout> | null = null;
  private pruneFlushRunning = false;
  private lastOccurredAt = 0;

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
    this.persistenceRequired = true;
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
      this.logger.error('聊天历史云端持久化初始化失败，已进入拒绝写入模式', error instanceof Error ? error.stack : String(error));
      this.pool = null;
      this.enabled = false;
    }
  }

  onModuleDestroy(): void {
    if (this.pruneTimer) {
      clearTimeout(this.pruneTimer);
      this.pruneTimer = null;
    }
  }

  async handlePlayerChat(
    playerId: string,
    payload: { message?: unknown; channel?: unknown },
    runtime?: ChatRuntimeWorldLike,
  ): Promise<void> {
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
    const nearbyPlayerIds = record.channel === 'nearby'
      ? this.collectNearbyPlayerIds(record, runtime) ?? this.worldSessionService.listInstancePlayerIds(record.instanceId)
      : undefined;
    const recipientCount = this.resolveRecipientCount(record, nearbyPlayerIds);
    if (!this.consumeAdmission(record, recipientCount)) {
      this.worldSessionService.getSocketByPlayerId(normalizedPlayerId)?.emit(S2C.Error, {
        code: 'CHAT_CHANNEL_BUSY',
        message: '当前频道消息较多，请稍后再试',
      });
      return;
    }
    const persisted = await this.persistMessage(record);
    if (!persisted) {
      this.worldSessionService.getSocketByPlayerId(normalizedPlayerId)?.emit(S2C.Error, {
        code: 'CHAT_PERSIST_FAILED',
        message: '聊天消息暂时无法保存，请稍后重试',
      });
      return;
    }
    this.emitMessageDelta(record, nearbyPlayerIds);
  }

  async emitHistory(
    client: ChatClientPort | null | undefined,
    playerId: string,
    payload: C2S_RequestChatHistoryView | null | undefined,
  ): Promise<void> {
    if (!client || typeof client.emit !== 'function') {
      return;
    }
    const player = this.playerRuntimeService.getPlayer(playerId) as RuntimePlayerLike | null;
    if (!player) {
      return;
    }
    const history = await this.loadHistory(player, payload?.cursors);
    if (!this.isCurrentPlayerSocket(client, playerId)) {
      return;
    }
    const requestId = normalizeRequestId(payload?.requestId);
    client.emit(S2C.ChatHistory, requestId ? { ...history, requestId } : history);
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
      messageId: `chat:${Date.now()}:${randomUUID()}`,
      channel,
      text,
      from: resolvePlayerName(player, playerId),
      fromPlayerId: playerId,
      occurredAt: this.nextOccurredAt(),
      instanceId: channel === 'nearby' ? instanceId : null,
      sectId: channel === 'sect' ? sectId : null,
      x: channel === 'nearby' ? normalizeFiniteInteger(player.x) : null,
      y: channel === 'nearby' ? normalizeFiniteInteger(player.y) : null,
    };
  }

  private nextOccurredAt(): number {
    const now = Date.now();
    this.lastOccurredAt = Math.max(now, this.lastOccurredAt + 1);
    return this.lastOccurredAt;
  }

  private consumeAdmission(record: ChatMessageRecord, recipientCount: number): boolean {
    const now = Date.now();
    const stream = buildChatStreamRef(record);
    const streamPolicy = CHAT_CHANNEL_ADMISSION_POLICY[record.channel];
    refillAdmissionBucket(
      this.globalAdmissionBucket,
      CHAT_GLOBAL_ADMISSION_CAPACITY,
      CHAT_GLOBAL_ADMISSION_REFILL_PER_SECOND,
      now,
    );
    refillAdmissionBucket(
      this.deliveryAdmissionBucket,
      CHAT_DELIVERY_BUDGET_CAPACITY_BYTES,
      CHAT_DELIVERY_BUDGET_REFILL_BYTES_PER_SECOND,
      now,
    );
    const streamBucket = this.getStreamAdmissionBucket(stream.key, streamPolicy.capacity, now);
    refillAdmissionBucket(streamBucket, streamPolicy.capacity, streamPolicy.refillPerSecond, now);
    const deliveryCost = estimateChatDeliveryBytes(record, recipientCount);
    if (this.globalAdmissionBucket.tokens < 1
      || streamBucket.tokens < 1
      || this.deliveryAdmissionBucket.tokens < deliveryCost) {
      return false;
    }
    this.globalAdmissionBucket.tokens -= 1;
    streamBucket.tokens -= 1;
    this.deliveryAdmissionBucket.tokens -= deliveryCost;
    return true;
  }

  private resolveRecipientCount(record: ChatMessageRecord, nearbyPlayerIds: string[] | undefined): number {
    if (record.channel === 'world') {
      return Math.max(1, this.worldSessionService.getConnectedPlayerCount());
    }
    if (record.channel === 'sect') {
      return Math.max(1, this.worldSessionService.getSectPlayerCount(record.sectId));
    }
    return Math.max(1, nearbyPlayerIds?.length ?? 0);
  }

  private getStreamAdmissionBucket(streamKey: string, capacity: number, now: number): ChatAdmissionBucket {
    const existing = this.streamAdmissionBuckets.get(streamKey);
    if (existing) {
      this.streamAdmissionBuckets.delete(streamKey);
      this.streamAdmissionBuckets.set(streamKey, existing);
      return existing;
    }
    while (this.streamAdmissionBuckets.size >= CHAT_ACTIVE_STREAM_STATE_LIMIT) {
      const oldestKey = this.streamAdmissionBuckets.keys().next().value;
      if (typeof oldestKey !== 'string') {
        break;
      }
      this.streamAdmissionBuckets.delete(oldestKey);
    }
    const bucket = { tokens: capacity, lastRefillAt: now };
    this.streamAdmissionBuckets.set(streamKey, bucket);
    return bucket;
  }

  private isCurrentPlayerSocket(client: ChatClientPort, playerId: string): boolean {
    if (!client.id) {
      return true;
    }
    const binding = this.worldSessionService.getBinding(playerId);
    return binding?.connected === true && binding.socketId === client.id;
  }

  private async persistMessage(record: ChatMessageRecord): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      if (this.persistenceRequired) {
        return false;
      }
      this.appendMemoryRecord(record);
      return true;
    }
    try {
      await this.pool.query(
        `INSERT INTO ${CHAT_MESSAGE_TABLE} (
           message_id, channel, from_player_id, from_label, text, occurred_at_ms,
           instance_id, sect_id, pos_x, pos_y
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [record.messageId, record.channel, record.fromPlayerId, record.from, record.text, record.occurredAt, record.instanceId, record.sectId, record.x, record.y],
      );
      this.appendMemoryRecord(record);
      this.recordPersistedStreamWrite(buildChatStreamRef(record));
      return true;
    } catch (error) {
      this.logger.warn(`聊天消息写入失败，已拒绝广播：${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private appendMemoryRecord(record: ChatMessageRecord): void {
    const stream = buildChatStreamRef(record);
    const records = this.memoryHistoryByStream.get(stream.key) ?? [];
    records.push(record);
    if (records.length > CHAT_HISTORY_LIMIT) {
      records.splice(0, records.length - CHAT_HISTORY_LIMIT);
    }
    this.memoryHistoryByStream.delete(stream.key);
    this.memoryHistoryByStream.set(stream.key, records);
    while (this.memoryHistoryByStream.size > CHAT_MEMORY_STREAM_LIMIT) {
      const oldestStreamKey = this.memoryHistoryByStream.keys().next().value;
      if (typeof oldestStreamKey !== 'string') {
        break;
      }
      this.memoryHistoryByStream.delete(oldestStreamKey);
    }
  }

  private schedulePersistedStreamPrune(stream: ChatStreamRef): void {
    this.pendingPruneStreams.set(stream.key, stream);
    if (this.pruneTimer) {
      return;
    }
    this.pruneTimer = setTimeout(() => {
      this.pruneTimer = null;
      void this.flushPersistedStreamPrunes();
    }, CHAT_PRUNE_DELAY_MS);
    this.pruneTimer.unref();
  }

  private recordPersistedStreamWrite(stream: ChatStreamRef): void {
    const previous = this.persistedWriteCountsByStream.get(stream.key) ?? 0;
    const next = previous >= CHAT_PRUNE_WRITE_INTERVAL ? 1 : previous + 1;
    this.persistedWriteCountsByStream.delete(stream.key);
    this.persistedWriteCountsByStream.set(stream.key, next);
    while (this.persistedWriteCountsByStream.size > CHAT_ACTIVE_STREAM_STATE_LIMIT) {
      const oldestKey = this.persistedWriteCountsByStream.keys().next().value;
      if (typeof oldestKey !== 'string') {
        break;
      }
      this.persistedWriteCountsByStream.delete(oldestKey);
    }
    if (previous === 0 || next === CHAT_PRUNE_WRITE_INTERVAL) {
      this.schedulePersistedStreamPrune(stream);
    }
  }

  private async flushPersistedStreamPrunes(): Promise<void> {
    if (this.pruneFlushRunning || !this.pool || !this.enabled || this.pendingPruneStreams.size === 0) {
      return;
    }
    this.pruneFlushRunning = true;
    try {
      const streams = Array.from(this.pendingPruneStreams.values()).slice(0, CHAT_PRUNE_BATCH_SIZE);
      for (const stream of streams) {
        this.pendingPruneStreams.delete(stream.key);
        try {
          await this.prunePersistedStream(stream);
        } catch (error) {
          this.logger.warn(`聊天历史裁剪失败 stream=${stream.key} error=${error instanceof Error ? error.message : String(error)}`);
          this.pendingPruneStreams.set(stream.key, stream);
        }
      }
    } finally {
      this.pruneFlushRunning = false;
      if (this.pendingPruneStreams.size > 0) {
        this.schedulePersistedStreamPrune(this.pendingPruneStreams.values().next().value as ChatStreamRef);
      }
    }
  }

  private async prunePersistedStream(stream: ChatStreamRef): Promise<void> {
    if (!this.pool) {
      return;
    }
    const scopeColumn = stream.channel === 'sect' ? 'sect_id' : stream.channel === 'nearby' ? 'instance_id' : null;
    const scopePredicate = scopeColumn ? `AND ${scopeColumn} = $2` : '';
    const params = scopeColumn ? [stream.channel, stream.scopeId] : [stream.channel];
    await this.pool.query(
      `DELETE FROM ${CHAT_MESSAGE_TABLE}
        WHERE channel = $1
          ${scopePredicate}
          AND message_id NOT IN (
            SELECT message_id
              FROM ${CHAT_MESSAGE_TABLE}
             WHERE channel = $1
               ${scopePredicate}
             ORDER BY occurred_at_ms DESC, message_id DESC
             LIMIT ${CHAT_HISTORY_LIMIT}
          )`,
      params,
    );
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

  private emitMessageDelta(record: ChatMessageRecord, nearbyPlayerIds?: string[]): void {
    const payload = toChatMessageView(record);
    if (record.channel === 'world') {
      if (this.worldSessionService.emitToAll(S2C.ChatMessage, payload)) {
        return;
      }
      for (const binding of this.worldSessionService.listBindings()) {
        this.worldSessionService.getSocketByPlayerId(binding.playerId)?.emit(S2C.ChatMessage, payload);
      }
      return;
    }
    if (record.channel === 'sect') {
      if (this.worldSessionService.emitToSect(record.sectId, S2C.ChatMessage, payload)) {
        return;
      }
      for (const targetPlayerId of this.worldSessionService.listSectPlayerIds(record.sectId)) {
        this.worldSessionService.getSocketByPlayerId(targetPlayerId)?.emit(S2C.ChatMessage, payload);
      }
      return;
    }
    const candidatePlayerIds = nearbyPlayerIds ?? this.worldSessionService.listInstancePlayerIds(record.instanceId);
    for (const targetPlayerId of candidatePlayerIds) {
      const target = this.playerRuntimeService.getPlayer(targetPlayerId) as RuntimePlayerLike | null;
      if (target && this.canPlayerSeeRecord(target, record)) {
        this.worldSessionService.getSocketByPlayerId(targetPlayerId)?.emit(S2C.ChatMessage, payload);
      }
    }
  }

  private collectNearbyPlayerIds(record: ChatMessageRecord, runtime?: ChatRuntimeWorldLike): string[] | null {
    const instanceId = normalizeString(record.instanceId);
    if (!runtime?.getInstanceRuntime || !instanceId || record.x == null || record.y == null) {
      return null;
    }
    const instance = runtime.getInstanceRuntime(instanceId);
    if (!instance || typeof instance.collectVisiblePlayers !== 'function') {
      return null;
    }
    const playerIds = new Set<string>([record.fromPlayerId]);
    for (const visiblePlayer of instance.collectVisiblePlayers({
      playerId: record.fromPlayerId,
      x: record.x,
      y: record.y,
    }, VIEW_RADIUS)) {
      const targetPlayerId = normalizeString(visiblePlayer?.playerId);
      if (targetPlayerId) {
        playerIds.add(targetPlayerId);
      }
    }
    return Array.from(playerIds);
  }

  private async loadHistory(
    player: RuntimePlayerLike,
    cursors: C2S_RequestChatHistoryView['cursors'],
  ): Promise<ChatHistorySyncView> {
    const normalizedCursors = normalizeHistoryCursors(cursors);
    if (this.pool && this.enabled) {
      try {
        return await this.loadPersistedHistory(player, normalizedCursors);
      } catch (error) {
        this.logger.warn(`读取聊天历史失败，回退内存历史：${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return this.loadMemoryHistory(player, normalizedCursors);
  }

  private async loadPersistedHistory(
    player: RuntimePlayerLike,
    cursors: Record<ChatChannel, ChatHistoryCursorView>,
  ): Promise<ChatHistorySyncView> {
    if (!this.pool) {
      return this.loadMemoryHistory(player, cursors);
    }
    const worldCursor = cursors.world;
    const sectCursor = cursors.sect;
    const nearbyCursor = cursors.nearby;
    const result = await this.pool.query(
      `SELECT * FROM (
         SELECT message_id, channel, from_player_id, from_label, text, occurred_at_ms,
                instance_id, sect_id, pos_x, pos_y
           FROM ${CHAT_MESSAGE_TABLE}
          WHERE channel = 'world'
            AND (occurred_at_ms > $1 OR (occurred_at_ms = $1 AND message_id > $2))
          ORDER BY occurred_at_ms DESC, message_id DESC
          LIMIT ${CHAT_HISTORY_LIMIT + 1}
       ) AS world_rows
       UNION ALL
       SELECT * FROM (
         SELECT message_id, channel, from_player_id, from_label, text, occurred_at_ms,
                instance_id, sect_id, pos_x, pos_y
           FROM ${CHAT_MESSAGE_TABLE}
          WHERE channel = 'sect'
            AND $3::varchar IS NOT NULL
            AND sect_id = $3
            AND (occurred_at_ms > $4 OR (occurred_at_ms = $4 AND message_id > $5))
          ORDER BY occurred_at_ms DESC, message_id DESC
          LIMIT ${CHAT_HISTORY_LIMIT + 1}
       ) AS sect_rows
       UNION ALL
       SELECT * FROM (
         SELECT message_id, channel, from_player_id, from_label, text, occurred_at_ms,
                instance_id, sect_id, pos_x, pos_y
           FROM ${CHAT_MESSAGE_TABLE}
          WHERE channel = 'nearby'
            AND $6::varchar IS NOT NULL
            AND instance_id = $6
            AND ($7::integer IS NULL OR $8::integer IS NULL OR pos_x IS NULL OR pos_y IS NULL
              OR GREATEST(ABS(pos_x - $7), ABS(pos_y - $8)) <= $11)
            AND (occurred_at_ms > $9 OR (occurred_at_ms = $9 AND message_id > $10))
          ORDER BY occurred_at_ms DESC, message_id DESC
          LIMIT ${CHAT_HISTORY_LIMIT + 1}
       ) AS nearby_rows`,
      [
        worldCursor.occurredAt,
        worldCursor.messageId,
        normalizeString(player.sectId) || null,
        sectCursor.occurredAt,
        sectCursor.messageId,
        normalizeString(player.instanceId) || null,
        normalizeFiniteInteger(player.x),
        normalizeFiniteInteger(player.y),
        nearbyCursor.occurredAt,
        nearbyCursor.messageId,
        VIEW_RADIUS,
      ],
    );
    return buildHistorySync((result.rows ?? []).map(rowToRecord));
  }

  private loadMemoryHistory(
    player: RuntimePlayerLike,
    cursors: Record<ChatChannel, ChatHistoryCursorView>,
  ): ChatHistorySyncView {
    const records: ChatMessageRecord[] = [];
    for (const channel of ['nearby', 'world', 'sect'] as const) {
      const stream = buildChatStreamRef({
        channel,
        instanceId: normalizeString(player.instanceId) || null,
        sectId: normalizeString(player.sectId) || null,
      });
      for (const record of this.memoryHistoryByStream.get(stream.key) ?? []) {
        if (isRecordAfterCursor(record, cursors[channel]) && this.canPlayerSeeRecord(player, record)) {
          records.push(record);
        }
      }
    }
    return buildHistorySync(records);
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
    await client.query(`
      CREATE INDEX IF NOT EXISTS server_chat_message_world_time_idx
      ON ${CHAT_MESSAGE_TABLE}(occurred_at_ms DESC, message_id DESC)
      WHERE channel = 'world'
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS server_chat_message_sect_time_idx
      ON ${CHAT_MESSAGE_TABLE}(sect_id, occurred_at_ms DESC, message_id DESC)
      WHERE channel = 'sect'
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS server_chat_message_instance_time_idx
      ON ${CHAT_MESSAGE_TABLE}(instance_id, occurred_at_ms DESC, message_id DESC)
      WHERE channel = 'nearby'
    `);
  } finally {
    client.release();
  }
}

function toChatMessageView(record: ChatMessageRecord): ServerChatMessageView {
  return {
    messageId: record.messageId,
    channel: record.channel,
    fromPlayerId: record.fromPlayerId,
    text: record.text,
    from: record.from,
    occurredAt: record.occurredAt,
  };
}

function buildHistorySync(records: ChatMessageRecord[]): ChatHistorySyncView {
  const recordsByChannel = new Map<ChatChannel, ChatMessageRecord[]>([
    ['nearby', []],
    ['world', []],
    ['sect', []],
  ]);
  for (const record of records) {
    recordsByChannel.get(record.channel)?.push(record);
  }
  return {
    channels: (['nearby', 'world', 'sect'] as const).map((channel) => {
      const descending = (recordsByChannel.get(channel) ?? [])
        .sort((left, right) => right.occurredAt - left.occurredAt || right.messageId.localeCompare(left.messageId));
      const truncated = descending.length > CHAT_HISTORY_LIMIT;
      return {
        channel,
        truncated,
        messages: descending.slice(0, CHAT_HISTORY_LIMIT).reverse().map(toChatMessageView),
      };
    }),
  };
}

function buildChatStreamRef(input: Pick<ChatMessageRecord, 'channel' | 'instanceId' | 'sectId'>): ChatStreamRef {
  if (input.channel === 'sect') {
    const scopeId = normalizeString(input.sectId) || null;
    return { key: `sect:${scopeId ?? 'none'}`, channel: input.channel, scopeId };
  }
  if (input.channel === 'nearby') {
    const scopeId = normalizeString(input.instanceId) || null;
    return { key: `nearby:${scopeId ?? 'none'}`, channel: input.channel, scopeId };
  }
  return { key: 'world', channel: 'world', scopeId: null };
}

function normalizeHistoryCursors(
  cursors: C2S_RequestChatHistoryView['cursors'],
): Record<ChatChannel, ChatHistoryCursorView> {
  return {
    nearby: normalizeHistoryCursor(cursors?.nearby),
    world: normalizeHistoryCursor(cursors?.world),
    sect: normalizeHistoryCursor(cursors?.sect),
  };
}

function normalizeHistoryCursor(cursor: ChatHistoryCursorView | null | undefined): ChatHistoryCursorView {
  return {
    occurredAt: Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(Number(cursor?.occurredAt) || 0))),
    messageId: normalizeString(cursor?.messageId).slice(0, 160),
  };
}

function normalizeRequestId(value: unknown): string {
  const requestId = normalizeString(value);
  return requestId.length <= 128 ? requestId : '';
}

function isRecordAfterCursor(record: ChatMessageRecord, cursor: ChatHistoryCursorView): boolean {
  return record.occurredAt > cursor.occurredAt
    || (record.occurredAt === cursor.occurredAt && record.messageId > cursor.messageId);
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
    ? value.trim().slice(0, CHAT_TEXT_MAX_LENGTH)
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

function refillAdmissionBucket(
  bucket: ChatAdmissionBucket,
  capacity: number,
  refillPerSecond: number,
  now: number,
): void {
  const elapsedMs = Math.max(0, now - bucket.lastRefillAt);
  if (elapsedMs <= 0) {
    return;
  }
  bucket.tokens = Math.min(capacity, bucket.tokens + (elapsedMs * refillPerSecond) / 1_000);
  bucket.lastRefillAt = now;
}

function estimateChatDeliveryBytes(record: ChatMessageRecord, recipientCount: number): number {
  const payloadBytes = CHAT_DELIVERY_ENVELOPE_ESTIMATE_BYTES
    + Buffer.byteLength(record.text, 'utf8')
    + Buffer.byteLength(record.from, 'utf8');
  return Math.max(1, Math.trunc(recipientCount)) * payloadBytes;
}

function resolvePlayerName(player: RuntimePlayerLike, fallback = ''): string {
  return resolvePlayerDisplayName(player, { playerId: player.playerId ?? player.id ?? fallback, fallback: '未知玩家' });
}

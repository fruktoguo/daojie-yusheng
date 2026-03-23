/**
 * WebSocket 网关 —— 客户端连接的入口，负责认证、顶号、断线保留、
 * 新建角色，以及将所有客户端指令转发到 tick 命令队列。
 */
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import {
  C2S,
  S2C,
  C2S_Move,
  C2S_MoveTo,
  C2S_Heartbeat,
  C2S_Ping,
  C2S_UseItem,
  C2S_DropItem,
  C2S_TakeLoot,
  C2S_SortInventory,
  C2S_Equip,
  C2S_Unequip,
  C2S_Cultivate,
  C2S_DebugResetSpawn,
  C2S_Action,
  C2S_UpdateAutoBattleSkills,
  C2S_Chat,
  C2S_CreateSuggestion,
  C2S_VoteSuggestion,
  C2S_GmMarkSuggestionCompleted,
  C2S_GmRemoveSuggestion,
  PlayerState,
  S2C_Init,
  S2C_SystemMsg,
  S2C_Pong,
  DEFAULT_BASE_ATTRS,
  BASE_MAX_HP,
  HP_PER_CONSTITUTION,
  Direction,
  VIEW_RADIUS,
  encodeServerEventPayload,
} from '@mud/shared';
import { AuthService } from '../auth/auth.service';
import { ActionService } from './action.service';
import { ContentService } from './content.service';
import { PlayerService } from './player.service';
import { MapService } from './map.service';
import { AoiService } from './aoi.service';
import { TimeService } from './time.service';
import { WorldService } from './world.service';
import { PerformanceService } from './performance.service';
import { TickService } from './tick.service';
import { SuggestionService } from './suggestion.service';

const DEFAULT_MAP = 'spawn';

@WebSocketGateway({ cors: true })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(GameGateway.name);

  constructor(
    private readonly authService: AuthService,
    private readonly actionService: ActionService,
    private readonly contentService: ContentService,
    private readonly playerService: PlayerService,
    private readonly mapService: MapService,
    private readonly aoiService: AoiService,
    private readonly worldService: WorldService,
    private readonly timeService: TimeService,
    private readonly performanceService: PerformanceService,
    private readonly tickService: TickService,
    private readonly suggestionService: SuggestionService,
  ) {}

  /** 客户端连接时：认证 → 顶号/断线恢复/存档加载/新建角色 → 下发初始化数据 */
  async handleConnection(client: Socket) {
    this.instrumentSocket(client);
    const token = client.handshake?.auth?.token as string;
    if (!token) {
      client.disconnect();
      return;
    }

    const payload = this.authService.validateToken(token);
    if (!payload) {
      client.emit(S2C.Error, { code: 'AUTH_FAIL', message: '认证失败' });
      client.disconnect();
      return;
    }

    const { userId, username, displayName } = payload;
    // 顶号检测
    const existingPlayerId = this.playerService.getPlayerByUserId(userId);
    if (existingPlayerId) {
      const oldSocket = this.playerService.getSocket(existingPlayerId);
      if (oldSocket) {
        oldSocket.emit(S2C.Kick);
        oldSocket.disconnect();
      }
      const existing = this.playerService.getPlayer(existingPlayerId);
      if (existing) {
        existing.displayName = displayName;
        if (existing.inWorld === false) {
          const pos = this.resolveLoginPosition(existing.mapId, existing.x, existing.y);
          existing.x = pos.x;
          existing.y = pos.y;
          this.mapService.addOccupant(existing.mapId, existing.x, existing.y, existing.id, 'player');
        }
        this.playerService.setSocket(existingPlayerId, client);
        this.playerService.setUserMapping(userId, existingPlayerId);
        this.playerService.markPlayerOnline(existingPlayerId);
        client.data = { userId, playerId: existingPlayerId };
        this.sendInit(client, existing);
        this.logger.log(`顶号: ${username} 接管 ${existingPlayerId}`);
        return;
      }
      this.playerService.removeUserMapping(userId);
    }

    // 从 PG 加载存档
    const saved = await this.playerService.loadPlayer(userId);
    if (saved) {
      saved.displayName = displayName;
      const pos = this.resolveLoginPosition(saved.mapId, saved.x, saved.y);
      saved.x = pos.x;
      saved.y = pos.y;
      this.playerService.setSocket(saved.id, client);
      this.playerService.setUserMapping(userId, saved.id);
      this.playerService.markPlayerOnline(saved.id);
      this.mapService.addOccupant(saved.mapId, saved.x, saved.y, saved.id, 'player');
      client.data = { userId, playerId: saved.id };
      this.sendInit(client, saved);
      this.logger.log(`玩家上线(存档恢复): ${username} (${saved.id})`);
      return;
    }

    // 创建新角色
    const playerId = `p_${userId}_${Date.now()}`;
    const spawn = this.mapService.getSpawnPoint(DEFAULT_MAP) ?? { x: 10, y: 10 };
    const initMaxHp = BASE_MAX_HP + DEFAULT_BASE_ATTRS.constitution * HP_PER_CONSTITUTION;
    const playerState: PlayerState = {
      id: playerId,
      name: username,
      displayName,
      mapId: DEFAULT_MAP,
      x: spawn.x,
      y: spawn.y,
      senseQiActive: false,
      facing: Direction.South,
      viewRange: VIEW_RADIUS,
      hp: initMaxHp,
      maxHp: initMaxHp,
      qi: 0,
      dead: false,
      baseAttrs: { ...DEFAULT_BASE_ATTRS },
      bonuses: [],
      temporaryBuffs: [],
      inventory: this.contentService.getStarterInventory(),
      equipment: { weapon: null, head: null, body: null, legs: null, accessory: null },
      techniques: [],
      actions: [],
      quests: [],
      unlockedMinimapIds: [],
      autoBattle: false,
      autoBattleSkills: [],
      autoRetaliate: true,
      autoIdleCultivation: true,
      idleTicks: 0,
      online: false,
      inWorld: true,
    };

    const startPos = this.resolveLoginPosition(playerState.mapId, playerState.x, playerState.y);
    playerState.x = startPos.x;
    playerState.y = startPos.y;

    await this.playerService.createPlayer(playerState, userId);
    this.playerService.setSocket(playerId, client);
    this.playerService.setUserMapping(userId, playerId);
    this.playerService.markPlayerOnline(playerId);
    this.mapService.addOccupant(playerState.mapId, playerState.x, playerState.y, playerId, 'player');

    client.data = { userId, playerId };
    this.sendInit(client, playerState);
    this.logger.log(`玩家上线(新建): ${username} (${playerId})`);
  }

  /** 客户端断开时：仅标记离线，玩家仍留在世界中 */
  async handleDisconnect(client: Socket) {
    const playerId = client.data?.playerId as string;
    if (!playerId) return;
    if (this.playerService.getSocket(playerId) !== client) return;

    const player = this.playerService.getPlayer(playerId);
    if (player) {
      this.tickService.resetPlayerSyncState(playerId);
      this.playerService.markPlayerOffline(playerId);
      await this.playerService.savePlayer(playerId);
      this.logger.log(`玩家离线(留在世界): ${playerId}`);
    }
  }

  @SubscribeMessage(C2S.Heartbeat)
  handleHeartbeat(client: Socket, _data: C2S_Heartbeat) {
    const playerId = client.data?.playerId as string;
    if (!playerId) return;
    this.playerService.touchHeartbeat(playerId);
  }

  @SubscribeMessage(C2S.Ping)
  handlePing(client: Socket, data: C2S_Ping) {
    const playerId = client.data?.playerId as string;
    if (!playerId) {
      return;
    }
    client.emit(S2C.Pong, {
      clientAt: data.clientAt,
      serverAt: Date.now(),
    } satisfies S2C_Pong);
  }

  @SubscribeMessage(C2S.Move)
  handleMove(client: Socket, data: C2S_Move) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

    this.playerService.enqueueCommand(player.mapId, {
      playerId,
      type: 'move',
      data,
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage(C2S.MoveTo)
  handleMoveTo(client: Socket, data: C2S_MoveTo) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

    this.playerService.enqueueCommand(player.mapId, {
      playerId,
      type: 'moveTo',
      data,
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage(C2S.Action)
  handleAction(client: Socket, data: C2S_Action) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

    this.playerService.enqueueCommand(player.mapId, {
      playerId,
      type: 'action',
      data: { actionId: data.actionId ?? data.type, target: data.target },
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage(C2S.UpdateAutoBattleSkills)
  handleUpdateAutoBattleSkills(client: Socket, data: C2S_UpdateAutoBattleSkills) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    this.tickService.executeImmediate(player, 'updateAutoBattleSkills', data);
  }

  @SubscribeMessage(C2S.DebugResetSpawn)
  handleDebugResetSpawn(client: Socket, data: C2S_DebugResetSpawn) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

    this.logger.log(`收到调试回城请求: ${player.id}`);

    this.playerService.enqueueCommand(player.mapId, {
      playerId,
      type: 'debugResetSpawn',
      data,
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage(C2S.UseItem)
  handleUseItem(client: Socket, data: C2S_UseItem) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    this.tickService.executeImmediate(player, 'useItem', data);
  }

  @SubscribeMessage(C2S.DropItem)
  handleDropItem(client: Socket, data: C2S_DropItem) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    this.tickService.executeImmediate(player, 'dropItem', data);
  }

  @SubscribeMessage(C2S.TakeLoot)
  handleTakeLoot(client: Socket, data: C2S_TakeLoot) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

    this.playerService.enqueueCommand(player.mapId, {
      playerId,
      type: 'takeLoot',
      data,
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage(C2S.SortInventory)
  handleSortInventory(client: Socket, data: C2S_SortInventory) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    this.tickService.executeImmediate(player, 'sortInventory', data);
  }

  @SubscribeMessage(C2S.Equip)
  handleEquip(client: Socket, data: C2S_Equip) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    this.tickService.executeImmediate(player, 'equip', data);
  }

  @SubscribeMessage(C2S.Unequip)
  handleUnequip(client: Socket, data: C2S_Unequip) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    this.tickService.executeImmediate(player, 'unequip', data);
  }

  @SubscribeMessage(C2S.Cultivate)
  handleCultivate(client: Socket, data: C2S_Cultivate) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    this.tickService.executeImmediate(player, 'cultivate', data);
  }

  @SubscribeMessage(C2S.Chat)
  handleChat(client: Socket, data: C2S_Chat) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

    const message = typeof data?.message === 'string' ? data.message.trim() : '';
    if (!message) return;

    const text = message.slice(0, 200);
    const chatMsg: S2C_SystemMsg = {
      text,
      kind: 'chat',
      from: player.name,
    };

    const viewers = this.playerService.getPlayersByMap(player.mapId);
    for (const viewer of viewers) {
      const socket = this.playerService.getSocket(viewer.id);
      socket?.emit(S2C.SystemMsg, chatMsg);
    }
  }

  /** 组装并下发玩家初始化数据包（自身状态、地图、视野、小地图等） */
  private sendInit(client: Socket, player: PlayerState) {
    const mapMeta = this.mapService.getMapMeta(player.mapId);
    if (!mapMeta) return;
    const unlockedMinimapIds = [...new Set((player.unlockedMinimapIds ?? []).filter((entry) => typeof entry === 'string' && entry.length > 0))].sort();
    const minimap = unlockedMinimapIds.includes(player.mapId)
      ? this.mapService.getMinimapSnapshot(player.mapId)
      : undefined;
    const minimapLibrary = this.mapService.getMinimapArchiveEntries(unlockedMinimapIds);
    this.tickService.resetPlayerSyncState(player.id);
    this.timeService.syncPlayerTimeEffects(player);
    this.actionService.rebuildActions(player, this.worldService.getContextActions(player));

    const time = this.timeService.buildPlayerTimeState(player);
    const visibility = this.aoiService.getVisibility(player, time.effectiveViewRange);
    const visibleMinimapMarkers = this.mapService.getVisibleMinimapMarkers(player.mapId, visibility.visibleKeys);
    const nearbyPlayers = this.playerService.getPlayersByMap(player.mapId)
      .filter((target) => visibility.visibleKeys.has(`${target.x},${target.y}`))
      .map((target) => this.worldService.buildPlayerRenderEntity(
        player,
        target,
        target.id === player.id ? '#ff0' : target.isBot ? '#6bb8ff' : '#0f0',
      ));

    const initData: S2C_Init = { self: player, mapMeta, minimap, visibleMinimapMarkers, minimapLibrary, tiles: visibility.tiles, players: nearbyPlayers, time };
    client.emit(S2C.Init, initData);
    client.emit(S2C.SuggestionUpdate, { suggestions: this.suggestionService.getAll() });
  }

  @SubscribeMessage(C2S.CreateSuggestion)
  async handleCreateSuggestion(client: Socket, data: C2S_CreateSuggestion) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

    await this.suggestionService.create(
      playerId,
      player.displayName || player.name,
      data.title,
      data.description,
    );
    this.broadcastSuggestions();
  }

  @SubscribeMessage(C2S.VoteSuggestion)
  async handleVoteSuggestion(client: Socket, data: C2S_VoteSuggestion) {
    const playerId = client.data?.playerId as string;
    if (!playerId) return;

    await this.suggestionService.vote(playerId, data.suggestionId, data.vote);
    this.broadcastSuggestions();
  }

  @SubscribeMessage(C2S.GmMarkSuggestionCompleted)
  async handleGmMarkSuggestionCompleted(client: Socket, data: C2S_GmMarkSuggestionCompleted) {
    await this.suggestionService.markCompleted(data.suggestionId);
    this.broadcastSuggestions();
  }

  @SubscribeMessage(C2S.GmRemoveSuggestion)
  async handleGmRemoveSuggestion(client: Socket, data: C2S_GmRemoveSuggestion) {
    await this.suggestionService.remove(data.suggestionId);
    this.broadcastSuggestions();
  }

  /** 向所有在线玩家广播最新建议列表 */
  private broadcastSuggestions() {
    const suggestions = this.suggestionService.getAll();
    this.server.emit(S2C.SuggestionUpdate, { suggestions });
  }

  /** 解析登录位置：若原坐标不可通行则就近寻找可行走格 */
  private resolveLoginPosition(mapId: string, x: number, y: number): { x: number; y: number } {
    if (this.mapService.isWalkable(mapId, x, y, { actorType: 'player' })) {
      return { x, y };
    }
    return this.mapService.findNearbyWalkable(mapId, x, y, 8, { actorType: 'player' }) ?? { x, y };
  }

  /** 拦截 socket.emit，注入出站流量统计 */
  private instrumentSocket(client: Socket): void {
    if ((client.data as { __networkInstrumented?: boolean }).__networkInstrumented) {
      return;
    }
    (client.data as { __networkInstrumented?: boolean }).__networkInstrumented = true;

    const originalEmit = client.emit.bind(client);
    client.emit = ((event: string, ...args: unknown[]) => {
      const startedAt = process.hrtime.bigint();
      const encodedArgs = args.map((arg) => encodeServerEventPayload(event, arg));
      const label = `WS ${event}`;
      this.performanceService.recordNetworkOutBytes(this.estimateSocketPacketBytes(event, encodedArgs), label, label);
      this.performanceService.recordCpuSection(
        Number(process.hrtime.bigint() - startedAt) / 1_000_000,
        'network',
        '网络编解码与收发',
      );
      return originalEmit(event, ...encodedArgs);
    }) as typeof client.emit;

    client.onAny((event, ...args) => {
      const startedAt = process.hrtime.bigint();
      const label = `WS ${event}`;
      this.performanceService.recordNetworkInBytes(this.estimateSocketPacketBytes(event, args), label, label);
      this.performanceService.recordCpuSection(
        Number(process.hrtime.bigint() - startedAt) / 1_000_000,
        'network',
        '网络编解码与收发',
      );
    });
  }

  private estimateSocketPacketBytes(event: string, args: unknown[]): number {
    return Buffer.byteLength(String(event)) + args.reduce<number>((total, arg) => total + this.estimateSocketValueBytes(arg), 0);
  }

  private estimateSocketValueBytes(value: unknown): number {
    if (value === undefined || value === null) {
      return 0;
    }
    if (typeof value === 'string') {
      return Buffer.byteLength(value);
    }
    if (Buffer.isBuffer(value)) {
      return value.length;
    }
    if (value instanceof Uint8Array) {
      return value.byteLength;
    }
    if (value instanceof ArrayBuffer) {
      return value.byteLength;
    }
    if (ArrayBuffer.isView(value)) {
      return value.byteLength;
    }
    try {
      return Buffer.byteLength(JSON.stringify(value));
    } catch {
      return Buffer.byteLength(String(value));
    }
  }
}

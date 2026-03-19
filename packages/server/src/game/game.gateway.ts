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
  C2S_GmGetState,
  C2S_GmSpawnBots,
  C2S_GmRemoveBots,
  C2S_GmUpdatePlayer,
  C2S_GmResetPlayer,
  C2S_UseItem,
  C2S_DropItem,
  C2S_Equip,
  C2S_Unequip,
  C2S_Cultivate,
  C2S_DebugResetSpawn,
  C2S_Action,
  C2S_Chat,
  PlayerState,
  S2C_Init,
  S2C_SystemMsg,
  S2C_GmState,
  DEFAULT_BASE_ATTRS,
  BASE_MAX_HP,
  HP_PER_CONSTITUTION,
  Direction,
  VIEW_RADIUS,
} from '@mud/shared';
import { AuthService } from '../auth/auth.service';
import { ActionService } from './action.service';
import { ContentService } from './content.service';
import { PlayerService } from './player.service';
import { MapService } from './map.service';
import { AoiService } from './aoi.service';
import { WorldService } from './world.service';
import { GmService } from './gm.service';

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
    private readonly gmService: GmService,
  ) {}

  async handleConnection(client: Socket) {
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

    const { userId, username } = payload;
    this.playerService.clearExpiredRetainedSessions();

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
        this.playerService.setSocket(existingPlayerId, client);
        client.data = { userId, playerId: existingPlayerId };
        this.sendInit(client, existing);
        this.logger.log(`顶号: ${username} 接管 ${existingPlayerId}`);
        return;
      }
    }

    const retained = this.playerService.restoreRetainedPlayer(userId);
    if (retained) {
      const pos = this.resolveLoginPosition(retained.mapId, retained.x, retained.y);
      retained.x = pos.x;
      retained.y = pos.y;
      this.playerService.setSocket(retained.id, client);
      this.playerService.setUserMapping(userId, retained.id);
      this.mapService.setOccupied(retained.mapId, retained.x, retained.y, retained.id);
      client.data = { userId, playerId: retained.id };
      this.sendInit(client, retained);
      this.logger.log(`玩家恢复(断线保留): ${username} (${retained.id})`);
      return;
    }

    // 从 PG 加载存档
    const saved = await this.playerService.loadPlayer(userId);
    if (saved) {
      const pos = this.resolveLoginPosition(saved.mapId, saved.x, saved.y);
      saved.x = pos.x;
      saved.y = pos.y;
      this.playerService.setSocket(saved.id, client);
      this.playerService.setUserMapping(userId, saved.id);
      this.mapService.setOccupied(saved.mapId, saved.x, saved.y, saved.id);
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
      mapId: DEFAULT_MAP,
      x: spawn.x,
      y: spawn.y,
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
      autoBattle: false,
      autoRetaliate: true,
    };

    const startPos = this.resolveLoginPosition(playerState.mapId, playerState.x, playerState.y);
    playerState.x = startPos.x;
    playerState.y = startPos.y;

    await this.playerService.createPlayer(playerState, userId);
    this.playerService.setSocket(playerId, client);
    this.playerService.setUserMapping(userId, playerId);
    this.mapService.setOccupied(playerState.mapId, playerState.x, playerState.y, playerId);

    client.data = { userId, playerId };
    this.sendInit(client, playerState);
    this.logger.log(`玩家上线(新建): ${username} (${playerId})`);
  }

  async handleDisconnect(client: Socket) {
    const playerId = client.data?.playerId as string;
    if (!playerId) return;
    if (this.playerService.getSocket(playerId) !== client) return;

    const player = this.playerService.getPlayer(playerId);
    if (player) {
      await this.playerService.savePlayer(playerId);
      this.mapService.setOccupied(player.mapId, player.x, player.y, null);
      const userId = client.data?.userId as string;
      if (userId) {
        this.playerService.removeUserMapping(userId);
        this.playerService.retainPlayer(userId, playerId);
      } else {
        this.playerService.removePlayer(playerId);
      }
      this.logger.log(`玩家离线(保留中): ${playerId}`);
    }
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

  @SubscribeMessage(C2S.GmGetState)
  handleGmGetState(client: Socket, _data: C2S_GmGetState) {
    this.emitGmState(client);
  }

  @SubscribeMessage(C2S.GmSpawnBots)
  handleGmSpawnBots(client: Socket, data: C2S_GmSpawnBots) {
    const playerId = client.data?.playerId as string;
    const error = this.gmService.spawnBots(playerId, data.count);
    if (error) {
      client.emit(S2C.Error, { code: 'GM_FAIL', message: error });
      return;
    }
    this.emitGmState(client);
  }

  @SubscribeMessage(C2S.GmRemoveBots)
  handleGmRemoveBots(client: Socket, data: C2S_GmRemoveBots) {
    const error = this.gmService.removeBots(data.playerIds, data.all);
    if (error) {
      client.emit(S2C.Error, { code: 'GM_FAIL', message: error });
      return;
    }
    this.emitGmState(client);
  }

  @SubscribeMessage(C2S.GmUpdatePlayer)
  handleGmUpdatePlayer(client: Socket, data: C2S_GmUpdatePlayer) {
    const error = this.gmService.updatePlayer(data);
    if (error) {
      client.emit(S2C.Error, { code: 'GM_FAIL', message: error });
      return;
    }
    this.emitGmState(client);
  }

  @SubscribeMessage(C2S.GmResetPlayer)
  handleGmResetPlayer(client: Socket, data: C2S_GmResetPlayer) {
    const error = this.gmService.resetPlayer(data.playerId);
    if (error) {
      client.emit(S2C.Error, { code: 'GM_FAIL', message: error });
      return;
    }
    this.emitGmState(client);
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

    this.playerService.enqueueCommand(player.mapId, {
      playerId,
      type: 'useItem',
      data,
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage(C2S.DropItem)
  handleDropItem(client: Socket, data: C2S_DropItem) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

    this.playerService.enqueueCommand(player.mapId, {
      playerId,
      type: 'dropItem',
      data,
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage(C2S.Equip)
  handleEquip(client: Socket, data: C2S_Equip) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

    this.playerService.enqueueCommand(player.mapId, {
      playerId,
      type: 'equip',
      data,
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage(C2S.Unequip)
  handleUnequip(client: Socket, data: C2S_Unequip) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

    this.playerService.enqueueCommand(player.mapId, {
      playerId,
      type: 'unequip',
      data,
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage(C2S.Cultivate)
  handleCultivate(client: Socket, data: C2S_Cultivate) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

    this.playerService.enqueueCommand(player.mapId, {
      playerId,
      type: 'cultivate',
      data,
      timestamp: Date.now(),
    });
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

  private sendInit(client: Socket, player: PlayerState) {
    const mapMeta = this.mapService.getMapMeta(player.mapId);
    if (!mapMeta) return;
    this.actionService.rebuildActions(player, this.worldService.getContextActions(player));

    const visibility = this.aoiService.getVisibility(player);
    const nearbyPlayers = this.playerService.getPlayersByMap(player.mapId)
      .filter(p => p.id !== player.id && visibility.visibleKeys.has(`${p.x},${p.y}`))
      .map(p => [
        p.id,
        p.x,
        p.y,
        [...p.name][0] ?? '@',
        p.isBot ? '#6bb8ff' : '#0f0',
        p.name,
        p.hp,
        p.maxHp,
      ] as [string, number, number, string, string, string, number, number]);

    const initData: S2C_Init = { self: player, mapMeta, tiles: visibility.tiles, players: nearbyPlayers };
    client.emit(S2C.Init, initData);
  }

  private emitGmState(client: Socket) {
    const state: S2C_GmState = this.gmService.getState();
    client.emit(S2C.GmState, state);
  }

  private resolveLoginPosition(mapId: string, x: number, y: number): { x: number; y: number } {
    if (this.mapService.isWalkable(mapId, x, y)) {
      return { x, y };
    }
    return this.mapService.findNearbyWalkable(mapId, x, y, 8) ?? { x, y };
  }
}

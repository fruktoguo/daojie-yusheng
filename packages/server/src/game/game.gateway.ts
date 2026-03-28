/**
 * WebSocket 网关 —— 客户端连接的入口，负责认证、顶号、断线保留、
 * 新建角色，以及将所有客户端指令转发到 tick 命令队列。
 */
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import {
  C2S,
  S2C,
  C2S_Move,
  C2S_MoveTo,
  C2S_NavigateQuest,
  C2S_Heartbeat,
  C2S_InspectTileRuntime,
  C2S_Ping,
  C2S_UseItem,
  C2S_DropItem,
  C2S_DestroyItem,
  C2S_TakeLoot,
  C2S_SortInventory,
  C2S_Equip,
  C2S_Unequip,
  C2S_Cultivate,
  C2S_RequestSuggestions,
  C2S_RequestMailSummary,
  C2S_RequestMailPage,
  C2S_RequestMailDetail,
  C2S_MarkMailRead,
  C2S_ClaimMailAttachments,
  C2S_DeleteMail,
  C2S_DebugResetSpawn,
  C2S_Action,
  C2S_UpdateAutoBattleSkills,
  C2S_Chat,
  C2S_CreateSuggestion,
  C2S_VoteSuggestion,
  C2S_ReplySuggestion,
  C2S_MarkSuggestionRepliesRead,
  C2S_GmMarkSuggestionCompleted,
  C2S_GmRemoveSuggestion,
  C2S_RequestMarket,
  C2S_RequestMarketItemBook,
  C2S_RequestMarketTradeHistory,
  C2S_CreateMarketSellOrder,
  C2S_CreateMarketBuyOrder,
  C2S_BuyMarketItem,
  C2S_SellMarketItem,
  C2S_CancelMarketOrder,
  C2S_ClaimMarketStorage,
  C2S_RequestNpcShop,
  C2S_BuyNpcShopItem,
  C2S_HeavenGateAction,
  PlayerState,
  S2C_Init,
  S2C_MailDetail,
  S2C_MailOpResult,
  S2C_MailPage,
  S2C_NpcShop,
  S2C_SystemMsg,
  S2C_Pong,
  S2C_TileRuntimeDetail,
  DEFAULT_BASE_ATTRS,
  DEFAULT_BONE_AGE_YEARS,
  DEFAULT_PLAYER_MAP_ID,
  BASE_MAX_HP,
  HP_PER_CONSTITUTION,
  Direction,
  isAuraQiResourceKey,
  parseQiResourceKey,
  VisibleTile,
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
import { QiProjectionService } from './qi-projection.service';
import { TickService } from './tick.service';
import { SuggestionService } from './suggestion.service';
import { SuggestionRealtimeService } from './suggestion-realtime.service';
import { NavigationService } from './navigation.service';
import { MarketActionResult, MarketService } from './market.service';
import { TechniqueService } from './technique.service';
import { MailService } from './mail.service';
import { buildDefaultRoleName } from '../auth/account-validation';
import { DatabaseBackupService } from './database-backup.service';

@WebSocketGateway({ cors: true })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(GameGateway.name);
  private readonly marketSubscriberPlayerIds = new Set<string>();

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
    private readonly qiProjectionService: QiProjectionService,
    private readonly tickService: TickService,
    private readonly suggestionService: SuggestionService,
    private readonly suggestionRealtimeService: SuggestionRealtimeService,
    private readonly navigationService: NavigationService,
    private readonly marketService: MarketService,
    private readonly techniqueService: TechniqueService,
    private readonly mailService: MailService,
    private readonly databaseBackupService: DatabaseBackupService,
  ) {}

  afterInit(server: Server): void {
    this.suggestionRealtimeService.bindServer(server);
  }

  /** 客户端连接时：认证 → 顶号/断线恢复/存档加载/新建角色 → 下发初始化数据 */
  async handleConnection(client: Socket) {
    this.instrumentSocket(client);
    if (this.databaseBackupService.isRuntimeMaintenanceActive()) {
      client.emit(S2C.Error, { code: 'SERVER_BUSY', message: '数据库维护中，请稍后重连' });
      client.disconnect();
      return;
    }
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
        const placement = this.resolveLoginPlacement(existing);
        const moved = placement.mapId !== existing.mapId || placement.x !== existing.x || placement.y !== existing.y;
        if (moved) {
          this.mapService.removeOccupant(existing.mapId, existing.x, existing.y, existing.id);
        }
        if (moved) {
          existing.mapId = placement.mapId;
          existing.x = placement.x;
          existing.y = placement.y;
          this.navigationService.clearMoveTarget(existing.id);
        }
        if (!this.mapService.hasOccupant(existing.mapId, existing.x, existing.y, existing.id)) {
          this.mapService.addOccupant(existing.mapId, existing.x, existing.y, existing.id, 'player');
        }
        this.playerService.setSocket(existingPlayerId, client);
        this.playerService.setUserMapping(userId, existingPlayerId);
        this.playerService.markPlayerOnline(existingPlayerId);
        const introBackfillChanged = this.worldService.backfillIntroBodyTechnique(existing);
        const questDirty = this.worldService.syncQuestState(existing);
        await this.mailService.ensureWelcomeMail(existing.id);
        if (introBackfillChanged || questDirty.length > 0) {
          await this.playerService.savePlayer(existing.id);
        }
        client.data = { userId, playerId: existingPlayerId };
        this.sendInit(client, existing);
        if (introBackfillChanged) {
          client.emit(S2C.SystemMsg, {
            text: '序章前期已为你补发《站桩功》。先学会它，再按突破面板备齐鼠尾与体魄要求即可继续推进。',
            kind: 'quest',
          } satisfies S2C_SystemMsg);
        }
        this.logger.log(`顶号: ${username} 接管 ${existingPlayerId}`);
        return;
      }
      this.playerService.removeUserMapping(userId);
    }

    // 从 PG 加载存档
    const saved = await this.playerService.loadPlayer(userId);
    if (saved) {
      saved.displayName = displayName;
      const placement = this.resolveLoginPlacement(saved);
      saved.mapId = placement.mapId;
      saved.x = placement.x;
      saved.y = placement.y;
      this.playerService.setSocket(saved.id, client);
      this.playerService.setUserMapping(userId, saved.id);
      this.playerService.markPlayerOnline(saved.id);
      const introBackfillChanged = this.worldService.backfillIntroBodyTechnique(saved);
      const questDirty = this.worldService.syncQuestState(saved);
      await this.mailService.ensureWelcomeMail(saved.id);
      if (introBackfillChanged || questDirty.length > 0) {
        await this.playerService.savePlayer(saved.id);
      }
      this.mapService.addOccupant(saved.mapId, saved.x, saved.y, saved.id, 'player');
      client.data = { userId, playerId: saved.id };
      this.sendInit(client, saved);
      if (introBackfillChanged) {
        client.emit(S2C.SystemMsg, {
          text: '序章前期已为你补发《站桩功》。先学会它，再按突破面板备齐鼠尾与体魄要求即可继续推进。',
          kind: 'quest',
        } satisfies S2C_SystemMsg);
      }
      this.logger.log(`玩家上线(存档恢复): ${username} (${saved.id})`);
      return;
    }

    // 创建新角色
    const playerId = `p_${userId}_${Date.now()}`;
    const spawn = this.mapService.getSpawnPoint(DEFAULT_PLAYER_MAP_ID) ?? { x: 10, y: 10 };
    const initRoleName = await this.authService.takePendingRoleName(userId);
    const initMaxHp = BASE_MAX_HP + DEFAULT_BASE_ATTRS.constitution * HP_PER_CONSTITUTION;
    const playerState: PlayerState = {
      id: playerId,
      name: initRoleName || buildDefaultRoleName(username) || username,
      displayName,
      mapId: DEFAULT_PLAYER_MAP_ID,
      x: spawn.x,
      y: spawn.y,
      senseQiActive: false,
      facing: Direction.South,
      viewRange: VIEW_RADIUS,
      hp: initMaxHp,
      maxHp: initMaxHp,
      qi: 0,
      dead: false,
      foundation: 0,
      combatExp: 0,
      boneAgeBaseYears: DEFAULT_BONE_AGE_YEARS,
      lifeElapsedTicks: 0,
      lifespanYears: null,
      baseAttrs: { ...DEFAULT_BASE_ATTRS },
      bonuses: [],
      temporaryBuffs: [],
      inventory: this.contentService.getStarterInventory(),
      marketStorage: { items: [] },
      equipment: { weapon: null, head: null, body: null, legs: null, accessory: null },
      techniques: [],
      actions: [],
      quests: [],
      unlockedMinimapIds: [],
      autoBattle: false,
      autoBattleSkills: [],
      autoRetaliate: true,
      autoBattleStationary: false,
      allowAoePlayerHit: false,
      autoIdleCultivation: true,
      autoSwitchCultivation: false,
      cultivationActive: false,
      idleTicks: 0,
      online: false,
      inWorld: true,
    };

    const startPlacement = this.resolveLoginPlacement(playerState);
    playerState.mapId = startPlacement.mapId;
    playerState.x = startPlacement.x;
    playerState.y = startPlacement.y;
    this.worldService.syncQuestState(playerState);

    await this.playerService.createPlayer(playerState, userId);
    await this.mailService.ensureWelcomeMail(playerState.id);
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
    this.marketSubscriberPlayerIds.delete(playerId);

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

    const error = this.navigationService.primeMoveTarget(player, data.x, data.y, {
      allowNearestReachable: data.allowNearestReachable,
      clientPackedPath: data.packedPath,
      clientPackedPathSteps: data.packedPathSteps,
      clientPathStartX: data.pathStartX,
      clientPathStartY: data.pathStartY,
    });
    if (error) {
      client.emit(S2C.SystemMsg, {
        text: error,
        kind: 'system',
      } satisfies S2C_SystemMsg);
      return;
    }

    this.playerService.enqueueCommand(player.mapId, {
      playerId,
      type: 'moveTo',
      data,
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage(C2S.NavigateQuest)
  handleNavigateQuest(client: Socket, data: C2S_NavigateQuest) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

    this.playerService.enqueueCommand(player.mapId, {
      playerId,
      type: 'navigateQuest',
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

  @SubscribeMessage(C2S.HeavenGateAction)
  async handleHeavenGateAction(client: Socket, data: C2S_HeavenGateAction) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

    const result = this.techniqueService.handleHeavenGateAction(player, data.action, data.element);
    if (result.error) {
      client.emit(S2C.SystemMsg, {
        text: result.error,
        kind: 'system',
      } satisfies S2C_SystemMsg);
      return;
    }

    this.actionService.rebuildActions(player, this.worldService.getContextActions(player));
    await this.playerService.savePlayer(playerId);
    for (const flag of result.dirty) {
      this.playerService.markDirty(player.id, flag);
    }
    this.tickService.flushPlayerState(player);
    for (const message of result.messages) {
      client.emit(S2C.SystemMsg, {
        text: message.text,
        kind: message.kind ?? 'quest',
      } satisfies S2C_SystemMsg);
    }
  }

  @SubscribeMessage(C2S.RequestNpcShop)
  handleRequestNpcShop(client: Socket, data: C2S_RequestNpcShop) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    const result = this.worldService.buildNpcShopView(player, data.npcId);
    client.emit(S2C.NpcShop, {
      npcId: data.npcId,
      shop: result.shop,
      error: result.error,
    } satisfies S2C_NpcShop);
  }

  @SubscribeMessage(C2S.BuyNpcShopItem)
  handleBuyNpcShopItem(client: Socket, data: C2S_BuyNpcShopItem) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

    this.playerService.enqueueCommand(player.mapId, {
      playerId,
      type: 'buyNpcShopItem',
      data,
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

  @SubscribeMessage(C2S.DestroyItem)
  handleDestroyItem(client: Socket, data: C2S_DestroyItem) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    this.tickService.executeImmediate(player, 'destroyItem', data);
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

  @SubscribeMessage(C2S.InspectTileRuntime)
  handleInspectTileRuntime(client: Socket, data: C2S_InspectTileRuntime) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

    const time = this.timeService.buildPlayerTimeState(player);
    const visibility = this.aoiService.getVisibility(player, time.effectiveViewRange);
    const targetX = Math.round(data.x);
    const targetY = Math.round(data.y);
    const key = `${targetX},${targetY}`;
    if (!visibility.visibleKeys.has(key)) {
      return;
    }

    const detail = this.mapService.getTileRuntimeDetail(player.mapId, targetX, targetY);
    const observedEntities = this.worldService.getObservedEntitiesAt(player, targetX, targetY);
    if (!detail && observedEntities.length === 0) {
      return;
    }
    const detailedAuraResources = (detail?.resources ?? [])
      .filter((resource) => {
        const parsedResource = parseQiResourceKey(resource.key);
        return Boolean(parsedResource && isAuraQiResourceKey(resource.key));
      })
      .map((resource) => ({
        key: resource.key,
        value: resource.value,
      }));
    const response: S2C_TileRuntimeDetail = {
      mapId: player.mapId,
      x: targetX,
      y: targetY,
      hp: detail?.hp,
      maxHp: detail?.maxHp,
      destroyed: detail?.destroyed,
      restoreTicksLeft: detail?.restoreTicksLeft,
      resources: (detail?.resources ?? []).map((resource) => {
        if (resource.key === 'aura') {
          const effectiveValue = detailedAuraResources.length > 0
            ? this.qiProjectionService.getEffectiveAuraValueFromResources(player, detailedAuraResources)
            : this.qiProjectionService.getEffectiveAuraValue(player, resource.value);
          return {
            ...resource,
            level: detailedAuraResources.length > 0
              ? this.qiProjectionService.getAuraLevelFromResources(
                  player,
                  detailedAuraResources,
                  this.tickService.getAuraLevelBaseValue(),
                )
              : this.qiProjectionService.getAuraLevel(
                  player,
                  resource.value,
                  this.tickService.getAuraLevelBaseValue(),
                ),
            effectiveValue,
          };
        }
        const parsedResource = parseQiResourceKey(resource.key);
        if (!parsedResource || !isAuraQiResourceKey(resource.key)) {
          return resource;
        }
        return {
          ...resource,
            effectiveValue: this.qiProjectionService.getEffectiveResourceValue(player, resource.key, resource.value),
        };
      }),
      entities: observedEntities.length > 0 ? observedEntities : undefined,
    };
    client.emit(S2C.TileRuntimeDetail, response satisfies S2C_TileRuntimeDetail);
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
    const visiblePlayers = this.worldService.buildCrowdedPlayerRenderEntities(nearbyPlayers, player.id);
    const visibleEntities = this.worldService.getVisibleEntities(player, visibility.visibleKeys);

    const initData: S2C_Init = {
      self: this.buildInitPlayerCore(player),
      mapMeta,
      minimap,
      visibleMinimapMarkers,
      minimapLibrary,
      tiles: this.toClientVisibleTiles(player, visibility.tiles),
      players: [...visiblePlayers, ...visibleEntities],
      time,
      auraLevelBaseValue: this.tickService.getAuraLevelBaseValue(),
    };
    client.emit(S2C.Init, initData);
    for (const flag of ['attr', 'inv', 'equip', 'tech', 'actions', 'quest'] as const) {
      this.playerService.markDirty(player.id, flag);
    }
    this.tickService.flushPlayerState(player);
    this.mailService.emitSummary(player.id).catch(() => {});
    client.emit(S2C.SuggestionUpdate, { suggestions: this.suggestionService.getAll() });
  }

  private buildInitPlayerCore(player: PlayerState): PlayerState {
    return {
      ...player,
      cultivationActive: this.techniqueService.hasCultivationBuff(player),
      inventory: {
        capacity: player.inventory.capacity,
        items: [],
      },
      marketStorage: player.marketStorage
        ? { items: [] }
        : undefined,
      equipment: {
        weapon: null,
        head: null,
        body: null,
        legs: null,
        accessory: null,
      },
      techniques: [],
      actions: [],
      quests: [],
      realm: undefined,
      realmLv: undefined,
      realmName: undefined,
      realmStage: undefined,
      realmReview: undefined,
      breakthroughReady: undefined,
      heavenGate: undefined,
    };
  }

  @SubscribeMessage(C2S.RequestSuggestions)
  async handleRequestSuggestions(client: Socket, _data: C2S_RequestSuggestions) {
    client.emit(S2C.SuggestionUpdate, { suggestions: this.suggestionService.getAll() });
  }

  @SubscribeMessage(C2S.RequestMailSummary)
  async handleRequestMailSummary(client: Socket, _data: C2S_RequestMailSummary) {
    const playerId = client.data?.playerId as string;
    if (!playerId) {
      return;
    }
    await this.mailService.emitSummary(playerId);
  }

  @SubscribeMessage(C2S.RequestMailPage)
  async handleRequestMailPage(client: Socket, data: C2S_RequestMailPage) {
    const playerId = client.data?.playerId as string;
    if (!playerId) {
      return;
    }
    client.emit(S2C.MailPage, {
      page: await this.mailService.getPage(playerId, data.page, data.pageSize, data.filter),
    } satisfies S2C_MailPage);
  }

  @SubscribeMessage(C2S.RequestMailDetail)
  async handleRequestMailDetail(client: Socket, data: C2S_RequestMailDetail) {
    const playerId = client.data?.playerId as string;
    if (!playerId) {
      return;
    }
    const detail = await this.mailService.getDetail(playerId, data.mailId);
    client.emit(S2C.MailDetail, {
      detail,
      error: detail ? undefined : '邮件不存在、已过期，或已被删除。',
    } satisfies S2C_MailDetail);
  }

  @SubscribeMessage(C2S.MarkMailRead)
  async handleMarkMailRead(client: Socket, data: C2S_MarkMailRead) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

    const prepared = await this.mailService.prepareMarkRead(playerId, data.mailIds);
    if (!prepared) {
      client.emit(S2C.MailOpResult, {
        operation: 'markRead',
        ok: false,
        mailIds: [],
        message: '没有可标记已读的邮件。',
      } satisfies S2C_MailOpResult);
      return;
    }

    this.playerService.enqueueCommand(player.mapId, {
      playerId,
      type: 'mailRead',
      data: prepared,
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage(C2S.ClaimMailAttachments)
  async handleClaimMailAttachments(client: Socket, data: C2S_ClaimMailAttachments) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

    const prepared = await this.mailService.prepareClaim(playerId, data.mailIds);
    if (!prepared.operation) {
      client.emit(S2C.MailOpResult, {
        operation: 'claim',
        ok: false,
        mailIds: [],
        message: prepared.error ?? '没有可领取附件的邮件。',
      } satisfies S2C_MailOpResult);
      return;
    }

    this.playerService.enqueueCommand(player.mapId, {
      playerId,
      type: 'mailClaim',
      data: prepared.operation,
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage(C2S.DeleteMail)
  async handleDeleteMail(client: Socket, data: C2S_DeleteMail) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

    const prepared = await this.mailService.prepareDelete(playerId, data.mailIds);
    if (!prepared.operation) {
      client.emit(S2C.MailOpResult, {
        operation: 'delete',
        ok: false,
        mailIds: [],
        message: prepared.error ?? '没有可删除的邮件。',
      } satisfies S2C_MailOpResult);
      return;
    }

    this.playerService.enqueueCommand(player.mapId, {
      playerId,
      type: 'mailDelete',
      data: prepared.operation,
      timestamp: Date.now(),
    });
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

  @SubscribeMessage(C2S.ReplySuggestion)
  async handleReplySuggestion(client: Socket, data: C2S_ReplySuggestion) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

    const updated = await this.suggestionService.addReply(
      data.suggestionId,
      'author',
      playerId,
      player.displayName || player.name,
      data.content,
    );
    if (updated) {
      this.broadcastSuggestions();
    }
  }

  @SubscribeMessage(C2S.MarkSuggestionRepliesRead)
  async handleMarkSuggestionRepliesRead(client: Socket, data: C2S_MarkSuggestionRepliesRead) {
    const playerId = client.data?.playerId as string;
    if (!playerId) return;

    const updated = await this.suggestionService.markRepliesRead(data.suggestionId, playerId);
    if (updated) {
      this.broadcastSuggestions();
    }
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

  @SubscribeMessage(C2S.RequestMarket)
  handleRequestMarket(client: Socket, _data: C2S_RequestMarket) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    this.marketSubscriberPlayerIds.add(playerId);
    client.emit(S2C.MarketUpdate, this.marketService.buildMarketUpdate(player));
  }

  @SubscribeMessage(C2S.RequestMarketItemBook)
  handleRequestMarketItemBook(client: Socket, data: C2S_RequestMarketItemBook) {
    client.emit(S2C.MarketItemBook, {
      currencyItemId: this.marketService.getCurrencyItemId(),
      currencyItemName: this.marketService.getCurrencyItemName(),
      itemKey: data.itemKey,
      book: this.marketService.buildItemBook(data.itemKey),
    });
  }

  @SubscribeMessage(C2S.RequestMarketTradeHistory)
  async handleRequestMarketTradeHistory(client: Socket, data: C2S_RequestMarketTradeHistory) {
    const playerId = client.data?.playerId as string;
    client.emit(S2C.MarketTradeHistory, await this.marketService.buildTradeHistoryPage(playerId, data.page));
  }

  @SubscribeMessage(C2S.CreateMarketSellOrder)
  async handleCreateMarketSellOrder(client: Socket, data: C2S_CreateMarketSellOrder) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    const result = await this.marketService.createSellOrder(player, data);
    this.flushMarketResult(result);
  }

  @SubscribeMessage(C2S.CreateMarketBuyOrder)
  async handleCreateMarketBuyOrder(client: Socket, data: C2S_CreateMarketBuyOrder) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    const result = await this.marketService.createBuyOrder(player, data);
    this.flushMarketResult(result);
  }

  @SubscribeMessage(C2S.BuyMarketItem)
  async handleBuyMarketItem(client: Socket, data: C2S_BuyMarketItem) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    const result = await this.marketService.buyNow(player, data);
    this.flushMarketResult(result);
  }

  @SubscribeMessage(C2S.SellMarketItem)
  async handleSellMarketItem(client: Socket, data: C2S_SellMarketItem) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    const result = await this.marketService.sellNow(player, data);
    this.flushMarketResult(result);
  }

  @SubscribeMessage(C2S.CancelMarketOrder)
  async handleCancelMarketOrder(client: Socket, data: C2S_CancelMarketOrder) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    const result = await this.marketService.cancelOrder(player, data);
    this.flushMarketResult(result);
  }

  @SubscribeMessage(C2S.ClaimMarketStorage)
  async handleClaimMarketStorage(client: Socket, _data: C2S_ClaimMarketStorage) {
    const playerId = client.data?.playerId as string;
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    const result = await this.marketService.claimStorage(player);
    this.flushMarketResult(result);
  }

  /** 向所有在线玩家广播最新建议列表 */
  private broadcastSuggestions() {
    this.suggestionRealtimeService.broadcastSuggestions(this.suggestionService.getAll());
  }

  private flushMarketResult(result: MarketActionResult): void {
    for (const playerId of result.affectedPlayerIds) {
      const player = this.playerService.getPlayer(playerId);
      if (!player) {
        continue;
      }
      this.playerService.syncPlayerRealtimeState(playerId);
      this.tickService.flushPlayerState(player);
    }
    for (const message of result.messages) {
      const socket = this.playerService.getSocket(message.playerId);
      socket?.emit(S2C.SystemMsg, {
        text: message.text,
        kind: message.kind ?? 'system',
      } satisfies S2C_SystemMsg);
    }
    this.broadcastMarketUpdates();
  }

  private broadcastMarketUpdates(): void {
    for (const playerId of this.marketSubscriberPlayerIds) {
      const player = this.playerService.getPlayer(playerId);
      if (!player) {
        this.marketSubscriberPlayerIds.delete(playerId);
        continue;
      }
      const socket = this.playerService.getSocket(player.id);
      if (!socket) {
        continue;
      }
      socket.emit(S2C.MarketUpdate, this.marketService.buildMarketUpdate(player));
    }
  }

  private toClientVisibleTiles(viewer: PlayerState, tiles: VisibleTile[][]): VisibleTile[][] {
    const auraLevelBaseValue = this.tickService.getAuraLevelBaseValue();
    return tiles.map((row) => row.map((tile) => {
      if (!tile) {
        return null;
      }
      return {
        ...tile,
        aura: viewer.senseQiActive
          ? this.qiProjectionService.getAuraLevel(viewer, tile.aura ?? 0, auraLevelBaseValue)
          : 0,
      } satisfies NonNullable<VisibleTile>;
    }));
  }

  /** 解析登录落点：地图被移除时回到初始地图复活点，其余情况就近落到可站立位置 */
  private resolveLoginPlacement(player: Pick<PlayerState, 'id' | 'mapId' | 'x' | 'y'>): { mapId: string; x: number; y: number } {
    const placement = this.mapService.resolvePlayerPlacement(player.mapId, player.x, player.y, player.id);
    return {
      mapId: placement.mapId,
      x: placement.x,
      y: placement.y,
    };
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

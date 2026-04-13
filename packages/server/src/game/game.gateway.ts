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
  C2S_NavigateMapPoint,
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
  C2S_RedeemCodes,
  C2S_MarkMailRead,
  C2S_ClaimMailAttachments,
  C2S_DeleteMail,
  C2S_DebugResetSpawn,
  C2S_Action,
  C2S_UpdateAutoBattleSkills,
  C2S_UpdateAutoUsePills,
  C2S_UpdateCombatTargetingRules,
  C2S_UpdateAutoBattleTargetingMode,
  C2S_UpdateTechniqueSkillAvailability,
  C2S_Chat,
  C2S_AckSystemMessages,
  C2S_CreateSuggestion,
  C2S_VoteSuggestion,
  C2S_ReplySuggestion,
  C2S_MarkSuggestionRepliesRead,
  C2S_GmMarkSuggestionCompleted,
  C2S_GmRemoveSuggestion,
  C2S_RequestMarket,
  C2S_RequestMarketListings,
  C2S_RequestMarketItemBook,
  C2S_RequestMarketTradeHistory,
  C2S_RequestAttrDetail,
  C2S_RequestLeaderboard,
  C2S_RequestWorldSummary,
  C2S_CreateMarketSellOrder,
  C2S_CreateMarketBuyOrder,
  C2S_BuyMarketItem,
  C2S_SellMarketItem,
  C2S_CancelMarketOrder,
  C2S_ClaimMarketStorage,
  C2S_RequestNpcShop,
  C2S_BuyNpcShopItem,
  C2S_RequestAlchemyPanel,
  C2S_SaveAlchemyPreset,
  C2S_DeleteAlchemyPreset,
  C2S_StartAlchemy,
  C2S_CancelAlchemy,
  C2S_RequestEnhancementPanel,
  C2S_StartEnhancement,
  C2S_CancelEnhancement,
  C2S_HeavenGateAction,
  PlayerState,
  S2C_AlchemyPanel,
  S2C_EnhancementPanel,
  S2C_Init,
  S2C_MailDetail,
  S2C_MailOpResult,
  S2C_MailPage,
  S2C_NpcShop,
  S2C_SystemMsg,
  S2C_Pong,
  S2C_TileRuntimeDetail,
  S2C_AttrDetail,
  S2C_Leaderboard,
  S2C_WorldSummary,
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
import { RedeemCodeService } from './redeem-code.service';
import { AttrService } from './attr.service';
import { LeaderboardService } from './leaderboard.service';
import { REALM_STATE_SOURCE } from '../constants/gameplay/technique';
import { AlchemyService } from './alchemy.service';
import { EnhancementService } from './enhancement.service';

@WebSocketGateway({ cors: true })
/** GameGateway：封装相关状态与行为。 */
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(GameGateway.name);
  private readonly marketSubscriberPlayerIds = new Set<string>();
  private readonly marketListingRequests = new Map<string, C2S_RequestMarketListings>();
  private readonly marketTradeHistoryRequests = new Map<string, number>();

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
    private readonly attrService: AttrService,
    private readonly leaderboardService: LeaderboardService,
    private readonly techniqueService: TechniqueService,
    private readonly mailService: MailService,
    private readonly redeemCodeService: RedeemCodeService,
    private readonly databaseBackupService: DatabaseBackupService,
    private readonly alchemyService: AlchemyService,
    private readonly enhancementService: EnhancementService,
  ) {}

/** afterInit：执行对应的业务逻辑。 */
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
/** token：定义该变量以承载业务值。 */
    const token = client.handshake?.auth?.token as string;
    if (!token) {
      client.disconnect();
      return;
    }

/** payload：定义该变量以承载业务值。 */
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
/** oldSocket：定义该变量以承载业务值。 */
      const oldSocket = this.playerService.getSocket(existingPlayerId);
      if (oldSocket) {
        oldSocket.emit(S2C.Kick);
        oldSocket.disconnect();
      }
/** existing：定义该变量以承载业务值。 */
      const existing = this.playerService.getPlayer(existingPlayerId);
      if (existing) {
        existing.displayName = displayName;
/** placement：定义该变量以承载业务值。 */
        const placement = this.resolveLoginPlacement(existing);
/** moved：定义该变量以承载业务值。 */
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
/** introBackfillChanged：定义该变量以承载业务值。 */
        const introBackfillChanged = this.worldService.backfillIntroBodyTechnique(existing);
/** questDirty：定义该变量以承载业务值。 */
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
/** placement：定义该变量以承载业务值。 */
      const placement = this.resolveLoginPlacement(saved);
      saved.mapId = placement.mapId;
      saved.x = placement.x;
      saved.y = placement.y;
      this.playerService.setSocket(saved.id, client);
      this.playerService.setUserMapping(userId, saved.id);
      this.playerService.markPlayerOnline(saved.id);
/** introBackfillChanged：定义该变量以承载业务值。 */
      const introBackfillChanged = this.worldService.backfillIntroBodyTechnique(saved);
/** questDirty：定义该变量以承载业务值。 */
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
/** spawn：定义该变量以承载业务值。 */
    const spawn = this.mapService.getSpawnPoint(DEFAULT_PLAYER_MAP_ID) ?? { x: 10, y: 10 };
/** initRoleName：定义该变量以承载业务值。 */
    const initRoleName = await this.authService.takePendingRoleName(userId);
/** initMaxHp：定义该变量以承载业务值。 */
    const initMaxHp = BASE_MAX_HP + DEFAULT_BASE_ATTRS.constitution * HP_PER_CONSTITUTION;
/** initialAlchemyExpToNext：定义该变量以承载业务值。 */
    const initialAlchemyExpToNext = Math.max(0, this.contentService.getRealmLevelEntry(1)?.expToNext ?? 60);
/** playerState：定义该变量以承载业务值。 */
    const playerState: PlayerState = {
      id: playerId,
      name: initRoleName || buildDefaultRoleName(username) || username,
      displayName,
      mapId: DEFAULT_PLAYER_MAP_ID,
      respawnMapId: DEFAULT_PLAYER_MAP_ID,
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
      playerKillCount: 0,
      monsterKillCount: 0,
      eliteMonsterKillCount: 0,
      bossMonsterKillCount: 0,
      deathCount: 0,
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
      alchemySkill: {
        level: 1,
        exp: 0,
        expToNext: initialAlchemyExpToNext,
      },
      alchemyPresets: [],
      alchemyJob: null,
      enhancementSkill: {
        level: 1,
        exp: 0,
        expToNext: initialAlchemyExpToNext,
      },
      enhancementSkillLevel: 1,
      enhancementJob: null,
      enhancementRecords: [],
      autoBattle: false,
      autoBattleSkills: [],
      autoUsePills: [],
      combatTargetingRules: { hostile: ['monster', 'retaliators', 'terrain'], friendly: ['non_hostile_players'] },
      autoBattleTargetingMode: 'auto',
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

/** startPlacement：定义该变量以承载业务值。 */
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
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
    if (!playerId) return;
    if (this.playerService.getSocket(playerId) !== client) return;
    this.marketSubscriberPlayerIds.delete(playerId);
    this.marketListingRequests.delete(playerId);
    this.marketTradeHistoryRequests.delete(playerId);

/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (player) {
      this.tickService.resetPlayerSyncState(playerId);
      this.playerService.markPlayerOffline(playerId);
      await this.playerService.savePlayer(playerId);
      this.logger.log(`玩家离线(留在世界): ${playerId}`);
    }
  }

  @SubscribeMessage(C2S.Heartbeat)
/** handleHeartbeat：处理当前场景中的对应操作。 */
  handleHeartbeat(client: Socket, _data: C2S_Heartbeat) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
    if (!playerId) return;
    this.playerService.touchHeartbeat(playerId);
  }

  @SubscribeMessage(C2S.Ping)
/** handlePing：处理当前场景中的对应操作。 */
  handlePing(client: Socket, data: C2S_Ping) {
/** playerId：定义该变量以承载业务值。 */
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
/** handleMove：处理当前场景中的对应操作。 */
  handleMove(client: Socket, data: C2S_Move) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
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
/** handleMoveTo：处理当前场景中的对应操作。 */
  handleMoveTo(client: Socket, data: C2S_MoveTo) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

/** error：定义该变量以承载业务值。 */
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
/** handleNavigateQuest：处理当前场景中的对应操作。 */
  handleNavigateQuest(client: Socket, data: C2S_NavigateQuest) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

    this.playerService.enqueueCommand(player.mapId, {
      playerId,
      type: 'navigateQuest',
      data,
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage(C2S.NavigateMapPoint)
/** handleNavigateMapPoint：处理当前场景中的对应操作。 */
  handleNavigateMapPoint(client: Socket, data: C2S_NavigateMapPoint) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

    this.playerService.enqueueCommand(player.mapId, {
      playerId,
      type: 'navigateMapPoint',
      data,
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage(C2S.Action)
/** handleAction：处理当前场景中的对应操作。 */
  handleAction(client: Socket, data: C2S_Action) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
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
/** handleHeavenGateAction：处理当前场景中的对应操作。 */
  async handleHeavenGateAction(client: Socket, data: C2S_HeavenGateAction) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

/** result：定义该变量以承载业务值。 */
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
/** handleRequestNpcShop：处理当前场景中的对应操作。 */
  handleRequestNpcShop(client: Socket, data: C2S_RequestNpcShop) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
/** result：定义该变量以承载业务值。 */
    const result = this.worldService.buildNpcShopView(player, data.npcId);
    client.emit(S2C.NpcShop, {
      npcId: data.npcId,
      shop: result.shop,
      error: result.error,
    } satisfies S2C_NpcShop);
  }

  @SubscribeMessage(C2S.BuyNpcShopItem)
/** handleBuyNpcShopItem：处理当前场景中的对应操作。 */
  handleBuyNpcShopItem(client: Socket, data: C2S_BuyNpcShopItem) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

    this.playerService.enqueueCommand(player.mapId, {
      playerId,
      type: 'buyNpcShopItem',
      data,
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage(C2S.RequestAlchemyPanel)
/** handleRequestAlchemyPanel：处理当前场景中的对应操作。 */
  handleRequestAlchemyPanel(client: Socket, data: C2S_RequestAlchemyPanel) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    client.emit(S2C.AlchemyPanel, this.alchemyService.buildPanelPayload(player, data.knownCatalogVersion) satisfies S2C_AlchemyPanel);
  }

  @SubscribeMessage(C2S.SaveAlchemyPreset)
/** handleSaveAlchemyPreset：处理当前场景中的对应操作。 */
  handleSaveAlchemyPreset(client: Socket, data: C2S_SaveAlchemyPreset) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

    this.playerService.enqueueCommand(player.mapId, {
      playerId,
      type: 'saveAlchemyPreset',
      data,
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage(C2S.DeleteAlchemyPreset)
/** handleDeleteAlchemyPreset：处理当前场景中的对应操作。 */
  handleDeleteAlchemyPreset(client: Socket, data: C2S_DeleteAlchemyPreset) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

    this.playerService.enqueueCommand(player.mapId, {
      playerId,
      type: 'deleteAlchemyPreset',
      data,
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage(C2S.StartAlchemy)
/** handleStartAlchemy：处理当前场景中的对应操作。 */
  handleStartAlchemy(client: Socket, data: C2S_StartAlchemy) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

    this.playerService.enqueueCommand(player.mapId, {
      playerId,
      type: 'startAlchemy',
      data,
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage(C2S.CancelAlchemy)
/** handleCancelAlchemy：处理当前场景中的对应操作。 */
  handleCancelAlchemy(client: Socket, _data: C2S_CancelAlchemy) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

    this.playerService.enqueueCommand(player.mapId, {
      playerId,
      type: 'cancelAlchemy',
      data: {},
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage(C2S.RequestEnhancementPanel)
/** handleRequestEnhancementPanel：处理当前场景中的对应操作。 */
  handleRequestEnhancementPanel(client: Socket, _data: C2S_RequestEnhancementPanel) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    client.emit(S2C.EnhancementPanel, this.enhancementService.buildPanelPayload(player) satisfies S2C_EnhancementPanel);
  }

  @SubscribeMessage(C2S.StartEnhancement)
/** handleStartEnhancement：处理当前场景中的对应操作。 */
  handleStartEnhancement(client: Socket, data: C2S_StartEnhancement) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

    this.playerService.enqueueCommand(player.mapId, {
      playerId,
      type: 'startEnhancement',
      data,
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage(C2S.CancelEnhancement)
/** handleCancelEnhancement：处理当前场景中的对应操作。 */
  handleCancelEnhancement(client: Socket, _data: C2S_CancelEnhancement) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

    this.playerService.enqueueCommand(player.mapId, {
      playerId,
      type: 'cancelEnhancement',
      data: {},
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage(C2S.UpdateAutoBattleSkills)
/** handleUpdateAutoBattleSkills：处理当前场景中的对应操作。 */
  handleUpdateAutoBattleSkills(client: Socket, data: C2S_UpdateAutoBattleSkills) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    this.tickService.executeImmediate(player, 'updateAutoBattleSkills', data);
  }

  @SubscribeMessage(C2S.UpdateAutoUsePills)
/** handleUpdateAutoUsePills：处理当前场景中的对应操作。 */
  handleUpdateAutoUsePills(client: Socket, data: C2S_UpdateAutoUsePills) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    this.tickService.executeImmediate(player, 'updateAutoUsePills', data);
  }

  @SubscribeMessage(C2S.UpdateCombatTargetingRules)
/** handleUpdateCombatTargetingRules：处理当前场景中的对应操作。 */
  handleUpdateCombatTargetingRules(client: Socket, data: C2S_UpdateCombatTargetingRules) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    this.tickService.executeImmediate(player, 'updateCombatTargetingRules', data);
  }

  @SubscribeMessage(C2S.UpdateAutoBattleTargetingMode)
/** handleUpdateAutoBattleTargetingMode：处理当前场景中的对应操作。 */
  handleUpdateAutoBattleTargetingMode(client: Socket, data: C2S_UpdateAutoBattleTargetingMode) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    this.tickService.executeImmediate(player, 'updateAutoBattleTargetingMode', data);
  }

  @SubscribeMessage(C2S.UpdateTechniqueSkillAvailability)
/** handleUpdateTechniqueSkillAvailability：处理当前场景中的对应操作。 */
  handleUpdateTechniqueSkillAvailability(client: Socket, data: C2S_UpdateTechniqueSkillAvailability) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    this.tickService.executeImmediate(player, 'updateTechniqueSkillAvailability', data);
  }

  @SubscribeMessage(C2S.DebugResetSpawn)
/** handleDebugResetSpawn：处理当前场景中的对应操作。 */
  handleDebugResetSpawn(client: Socket, data: C2S_DebugResetSpawn) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
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
/** handleUseItem：处理当前场景中的对应操作。 */
  handleUseItem(client: Socket, data: C2S_UseItem) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    this.tickService.executeImmediate(player, 'useItem', data);
  }

  @SubscribeMessage(C2S.DropItem)
/** handleDropItem：处理当前场景中的对应操作。 */
  handleDropItem(client: Socket, data: C2S_DropItem) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    this.tickService.executeImmediate(player, 'dropItem', data);
  }

  @SubscribeMessage(C2S.DestroyItem)
/** handleDestroyItem：处理当前场景中的对应操作。 */
  handleDestroyItem(client: Socket, data: C2S_DestroyItem) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    this.tickService.executeImmediate(player, 'destroyItem', data);
  }

  @SubscribeMessage(C2S.TakeLoot)
/** handleTakeLoot：处理当前场景中的对应操作。 */
  handleTakeLoot(client: Socket, data: C2S_TakeLoot) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
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
/** handleSortInventory：处理当前场景中的对应操作。 */
  handleSortInventory(client: Socket, data: C2S_SortInventory) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    this.tickService.executeImmediate(player, 'sortInventory', data);
  }

  @SubscribeMessage(C2S.InspectTileRuntime)
/** handleInspectTileRuntime：处理当前场景中的对应操作。 */
  handleInspectTileRuntime(client: Socket, data: C2S_InspectTileRuntime) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

/** time：定义该变量以承载业务值。 */
    const time = this.timeService.buildPlayerTimeState(player);
/** visibility：定义该变量以承载业务值。 */
    const visibility = this.aoiService.getVisibility(player, time.effectiveViewRange);
/** targetX：定义该变量以承载业务值。 */
    const targetX = Math.round(data.x);
/** targetY：定义该变量以承载业务值。 */
    const targetY = Math.round(data.y);
/** key：定义该变量以承载业务值。 */
    const key = `${targetX},${targetY}`;
    if (!visibility.visibleKeys.has(key)) {
      return;
    }

/** detail：定义该变量以承载业务值。 */
    const detail = this.mapService.getTileRuntimeDetail(player.mapId, targetX, targetY);
/** observedEntities：定义该变量以承载业务值。 */
    const observedEntities = this.worldService.getObservedEntitiesAt(player, targetX, targetY);
    if (!detail && observedEntities.length === 0) {
      return;
    }
/** auraLevelBaseValue：定义该变量以承载业务值。 */
    const auraLevelBaseValue = this.tickService.getAuraLevelBaseValue();
/** detailedAuraResources：定义该变量以承载业务值。 */
    const detailedAuraResources = (detail?.resources ?? [])
      .filter((resource) => {
/** parsedResource：定义该变量以承载业务值。 */
        const parsedResource = parseQiResourceKey(resource.key);
        return Boolean(parsedResource && isAuraQiResourceKey(resource.key));
      })
      .map((resource) => ({
        key: resource.key,
        value: resource.value,
      }));
/** visibleDetailedAuraResources：定义该变量以承载业务值。 */
    const visibleDetailedAuraResources = detailedAuraResources.filter((resource) => (
      this.qiProjectionService.getResourceVisibility(player, resource.key) !== 'hidden'
    ));
/** response：定义该变量以承载业务值。 */
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
          if (detailedAuraResources.length > 0 && visibleDetailedAuraResources.length <= 0) {
            return null;
          }
/** effectiveValue：定义该变量以承载业务值。 */
          const effectiveValue = visibleDetailedAuraResources.length > 0
            ? this.qiProjectionService.getEffectiveAuraValueFromResources(player, visibleDetailedAuraResources)
            : this.qiProjectionService.getEffectiveAuraValue(player, resource.value);
          return {
            ...resource,
            level: visibleDetailedAuraResources.length > 0
              ? this.qiProjectionService.getAuraLevelFromResources(
                  player,
                  visibleDetailedAuraResources,
                  auraLevelBaseValue,
                )
              : this.qiProjectionService.getAuraLevel(
                  player,
                  resource.value,
                  auraLevelBaseValue,
                ),
            effectiveValue,
          };
        }
/** parsedResource：定义该变量以承载业务值。 */
        const parsedResource = parseQiResourceKey(resource.key);
        if (!parsedResource || !isAuraQiResourceKey(resource.key)) {
          return resource;
        }
        if (this.qiProjectionService.getResourceVisibility(player, resource.key) === 'hidden') {
          return null;
        }
/** effectiveValue：定义该变量以承载业务值。 */
        const effectiveValue = this.qiProjectionService.getEffectiveResourceValue(player, resource.key, resource.value);
        return {
          ...resource,
          effectiveValue,
          level: this.qiProjectionService.getResourceAuraLevel(player, resource.key, resource.value, auraLevelBaseValue),
        };
      }).filter((resource): resource is NonNullable<typeof resource> => resource !== null),
      entities: observedEntities.length > 0 ? observedEntities : undefined,
    };
    client.emit(S2C.TileRuntimeDetail, response satisfies S2C_TileRuntimeDetail);
  }

  @SubscribeMessage(C2S.Equip)
/** handleEquip：处理当前场景中的对应操作。 */
  handleEquip(client: Socket, data: C2S_Equip) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    this.tickService.executeImmediate(player, 'equip', data);
  }

  @SubscribeMessage(C2S.Unequip)
/** handleUnequip：处理当前场景中的对应操作。 */
  handleUnequip(client: Socket, data: C2S_Unequip) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    this.tickService.executeImmediate(player, 'unequip', data);
  }

  @SubscribeMessage(C2S.Cultivate)
/** handleCultivate：处理当前场景中的对应操作。 */
  handleCultivate(client: Socket, data: C2S_Cultivate) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    this.tickService.executeImmediate(player, 'cultivate', data);
  }

  @SubscribeMessage(C2S.Chat)
/** handleChat：处理当前场景中的对应操作。 */
  handleChat(client: Socket, data: C2S_Chat) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

/** message：定义该变量以承载业务值。 */
    const message = typeof data?.message === 'string' ? data.message.trim() : '';
    if (!message) return;

/** text：定义该变量以承载业务值。 */
    const text = message.slice(0, 200);
/** chatMsg：定义该变量以承载业务值。 */
    const chatMsg: S2C_SystemMsg = {
      text,
      kind: 'chat',
      from: player.name,
    };

/** viewers：定义该变量以承载业务值。 */
    const viewers = this.playerService.getPlayersByMap(player.mapId);
    for (const viewer of viewers) {
      const socket = this.playerService.getSocket(viewer.id);
      socket?.emit(S2C.SystemMsg, chatMsg);
    }
  }

  @SubscribeMessage(C2S.AckSystemMessages)
/** handleAckSystemMessages：处理当前场景中的对应操作。 */
  handleAckSystemMessages(client: Socket, data: C2S_AckSystemMessages) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
    if (!playerId) {
      return;
    }
/** ids：定义该变量以承载业务值。 */
    const ids = Array.isArray(data?.ids)
      ? data.ids.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
      : [];
    if (ids.length === 0) {
      return;
    }
    this.playerService.ackPendingLogbookMessages(playerId, ids);
  }

/** sendInit：处理当前场景中的对应操作。 */
  private sendInit(client: Socket, player: PlayerState) {
/** mapMeta：定义该变量以承载业务值。 */
    const mapMeta = this.mapService.getMapMeta(player.mapId);
    if (!mapMeta) return;
/** unlockedMinimapIds：定义该变量以承载业务值。 */
    const unlockedMinimapIds = [...new Set((player.unlockedMinimapIds ?? []).filter((entry) => typeof entry === 'string' && entry.length > 0))].sort();
/** minimap：定义该变量以承载业务值。 */
    const minimap = unlockedMinimapIds.includes(player.mapId)
      ? this.mapService.getMinimapSnapshot(player.mapId)
      : undefined;
/** minimapLibrary：定义该变量以承载业务值。 */
    const minimapLibrary = this.mapService.getMinimapArchiveEntries(unlockedMinimapIds);
    this.tickService.resetPlayerSyncState(player.id);
    this.timeService.syncPlayerTimeEffects(player);
    this.actionService.rebuildActions(player, this.worldService.getContextActions(player));

/** time：定义该变量以承载业务值。 */
    const time = this.timeService.buildPlayerTimeState(player);
/** visibility：定义该变量以承载业务值。 */
    const visibility = this.aoiService.getVisibility(player, time.effectiveViewRange);
/** visibleMinimapMarkers：定义该变量以承载业务值。 */
    const visibleMinimapMarkers = this.mapService.getVisibleMinimapMarkers(player.mapId, visibility.visibleKeys);
/** nearbyPlayers：定义该变量以承载业务值。 */
    const nearbyPlayers = this.playerService.getPlayersByMap(player.mapId)
      .filter((target) => visibility.visibleKeys.has(`${target.x},${target.y}`))
      .map((target) => this.worldService.buildPlayerRenderEntity(
        player,
        target,
        target.id === player.id ? '#ff0' : target.isBot ? '#6bb8ff' : '#0f0',
      ));
/** visiblePlayers：定义该变量以承载业务值。 */
    const visiblePlayers = this.worldService.buildCrowdedPlayerRenderEntities(nearbyPlayers, player.id);
/** visibleEntities：定义该变量以承载业务值。 */
    const visibleEntities = this.worldService.getVisibleEntities(player, visibility.visibleKeys);

/** initData：定义该变量以承载业务值。 */
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
    this.playerService.emitPendingLogbookMessages(player.id);
  }

/** buildInitPlayerCore：执行对应的业务逻辑。 */
  private buildInitPlayerCore(player: PlayerState): PlayerState {
    const { pendingLogbookMessages: _pendingLogbookMessages, ...publicPlayer } = player;
    return {
      ...publicPlayer,
      bonuses: [],
      finalAttrs: undefined,
      numericStats: undefined,
      ratioDivisors: undefined,
      numericStatBreakdowns: undefined,
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
/** handleRequestSuggestions：处理当前场景中的对应操作。 */
  async handleRequestSuggestions(client: Socket, _data: C2S_RequestSuggestions) {
    client.emit(S2C.SuggestionUpdate, { suggestions: this.suggestionService.getAll() });
  }

  @SubscribeMessage(C2S.RequestMailSummary)
/** handleRequestMailSummary：处理当前场景中的对应操作。 */
  async handleRequestMailSummary(client: Socket, _data: C2S_RequestMailSummary) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
    if (!playerId) {
      return;
    }
    await this.mailService.emitSummary(playerId);
  }

  @SubscribeMessage(C2S.RequestMailPage)
/** handleRequestMailPage：处理当前场景中的对应操作。 */
  async handleRequestMailPage(client: Socket, data: C2S_RequestMailPage) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
    if (!playerId) {
      return;
    }
    client.emit(S2C.MailPage, {
      page: await this.mailService.getPage(playerId, data.page, data.pageSize, data.filter),
    } satisfies S2C_MailPage);
  }

  @SubscribeMessage(C2S.RequestMailDetail)
/** handleRequestMailDetail：处理当前场景中的对应操作。 */
  async handleRequestMailDetail(client: Socket, data: C2S_RequestMailDetail) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
    if (!playerId) {
      return;
    }
/** detail：定义该变量以承载业务值。 */
    const detail = await this.mailService.getDetail(playerId, data.mailId);
    client.emit(S2C.MailDetail, {
      detail,
      error: detail ? undefined : '邮件不存在、已过期，或已被删除。',
    } satisfies S2C_MailDetail);
  }

  @SubscribeMessage(C2S.RedeemCodes)
/** handleRedeemCodes：处理当前场景中的对应操作。 */
  async handleRedeemCodes(client: Socket, data: C2S_RedeemCodes) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) {
      return;
    }

/** prepared：定义该变量以承载业务值。 */
    const prepared = await this.redeemCodeService.prepareRedeemCodes(data.codes);
    this.playerService.enqueueCommand(player.mapId, {
      playerId,
      type: 'redeemCodes',
      data: prepared,
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage(C2S.MarkMailRead)
/** handleMarkMailRead：处理当前场景中的对应操作。 */
  async handleMarkMailRead(client: Socket, data: C2S_MarkMailRead) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

/** prepared：定义该变量以承载业务值。 */
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
/** handleClaimMailAttachments：处理当前场景中的对应操作。 */
  async handleClaimMailAttachments(client: Socket, data: C2S_ClaimMailAttachments) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

/** prepared：定义该变量以承载业务值。 */
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
/** handleDeleteMail：处理当前场景中的对应操作。 */
  async handleDeleteMail(client: Socket, data: C2S_DeleteMail) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

/** prepared：定义该变量以承载业务值。 */
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
/** handleCreateSuggestion：处理当前场景中的对应操作。 */
  async handleCreateSuggestion(client: Socket, data: C2S_CreateSuggestion) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
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
/** handleVoteSuggestion：处理当前场景中的对应操作。 */
  async handleVoteSuggestion(client: Socket, data: C2S_VoteSuggestion) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
    if (!playerId) return;

    await this.suggestionService.vote(playerId, data.suggestionId, data.vote);
    this.broadcastSuggestions();
  }

  @SubscribeMessage(C2S.ReplySuggestion)
/** handleReplySuggestion：处理当前场景中的对应操作。 */
  async handleReplySuggestion(client: Socket, data: C2S_ReplySuggestion) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;

/** updated：定义该变量以承载业务值。 */
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
/** handleMarkSuggestionRepliesRead：处理当前场景中的对应操作。 */
  async handleMarkSuggestionRepliesRead(client: Socket, data: C2S_MarkSuggestionRepliesRead) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
    if (!playerId) return;

/** updated：定义该变量以承载业务值。 */
    const updated = await this.suggestionService.markRepliesRead(data.suggestionId, playerId);
    if (updated) {
      this.broadcastSuggestions();
    }
  }

  @SubscribeMessage(C2S.GmMarkSuggestionCompleted)
/** handleGmMarkSuggestionCompleted：处理当前场景中的对应操作。 */
  async handleGmMarkSuggestionCompleted(client: Socket, data: C2S_GmMarkSuggestionCompleted) {
    await this.suggestionService.markCompleted(data.suggestionId);
    this.broadcastSuggestions();
  }

  @SubscribeMessage(C2S.GmRemoveSuggestion)
/** handleGmRemoveSuggestion：处理当前场景中的对应操作。 */
  async handleGmRemoveSuggestion(client: Socket, data: C2S_GmRemoveSuggestion) {
    await this.suggestionService.remove(data.suggestionId);
    this.broadcastSuggestions();
  }

  @SubscribeMessage(C2S.RequestMarket)
/** handleRequestMarket：处理当前场景中的对应操作。 */
  async handleRequestMarket(client: Socket, _data: C2S_RequestMarket) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
    this.marketSubscriberPlayerIds.add(playerId);
/** request：定义该变量以承载业务值。 */
    const request = this.marketListingRequests.get(playerId) ?? { page: 1 };
    this.marketListingRequests.set(playerId, request);
    await this.flushMarketResult(await this.marketService.refreshInvalidOrders());
    this.emitMarketPanelSnapshot(client, player, request);
  }

  @SubscribeMessage(C2S.RequestMarketListings)
/** handleRequestMarketListings：处理当前场景中的对应操作。 */
  async handleRequestMarketListings(client: Socket, data: C2S_RequestMarketListings) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
/** request：定义该变量以承载业务值。 */
    const request: C2S_RequestMarketListings = {
      page: data.page,
      pageSize: data.pageSize,
      category: data.category ?? 'all',
      equipmentSlot: data.equipmentSlot ?? 'all',
      techniqueCategory: data.techniqueCategory ?? 'all',
    };
    this.marketSubscriberPlayerIds.add(playerId);
    this.marketListingRequests.set(playerId, request);
    await this.flushMarketResult(await this.marketService.refreshInvalidOrders());
    client.emit(S2C.MarketListings, this.marketService.buildListingsPage(request));
  }

  @SubscribeMessage(C2S.RequestMarketItemBook)
/** handleRequestMarketItemBook：处理当前场景中的对应操作。 */
  handleRequestMarketItemBook(client: Socket, data: C2S_RequestMarketItemBook) {
    client.emit(S2C.MarketItemBook, {
      currencyItemId: this.marketService.getCurrencyItemId(),
      currencyItemName: this.marketService.getCurrencyItemName(),
      itemKey: data.itemKey,
      book: this.marketService.buildItemBook(data.itemKey),
    });
  }

  @SubscribeMessage(C2S.RequestMarketTradeHistory)
/** handleRequestMarketTradeHistory：处理当前场景中的对应操作。 */
  async handleRequestMarketTradeHistory(client: Socket, data: C2S_RequestMarketTradeHistory) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
    if (playerId) {
      this.marketTradeHistoryRequests.set(playerId, data.page);
    }
    client.emit(S2C.MarketTradeHistory, await this.marketService.buildTradeHistoryPage(playerId, data.page));
  }

  @SubscribeMessage(C2S.RequestAttrDetail)
/** handleRequestAttrDetail：处理当前场景中的对应操作。 */
  handleRequestAttrDetail(client: Socket, _data: C2S_RequestAttrDetail) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) {
      return;
    }
    client.emit(S2C.AttrDetail, {
      baseAttrs: player.baseAttrs,
      bonuses: player.bonuses.filter((bonus) => bonus.source !== REALM_STATE_SOURCE),
      finalAttrs: this.attrService.getPlayerFinalAttrs(player),
      numericStats: this.attrService.getPlayerNumericStats(player),
      ratioDivisors: this.attrService.getPlayerRatioDivisors(player),
      numericStatBreakdowns: this.attrService.getPlayerNumericStatBreakdowns(player),
      alchemySkill: player.alchemySkill,
      enhancementSkill: player.enhancementSkill,
    } satisfies S2C_AttrDetail);
  }

  @SubscribeMessage(C2S.RequestLeaderboard)
/** handleRequestLeaderboard：处理当前场景中的对应操作。 */
  async handleRequestLeaderboard(client: Socket, data: C2S_RequestLeaderboard) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
    if (!playerId) {
      return;
    }
/** payload：定义该变量以承载业务值。 */
    const payload = await this.leaderboardService.buildLeaderboard(data.limit);
    client.emit(S2C.Leaderboard, payload satisfies S2C_Leaderboard);
  }

  @SubscribeMessage(C2S.RequestWorldSummary)
/** handleRequestWorldSummary：处理当前场景中的对应操作。 */
  async handleRequestWorldSummary(client: Socket) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
    if (!playerId) {
      return;
    }
/** payload：定义该变量以承载业务值。 */
    const payload = await this.leaderboardService.buildWorldSummary();
    client.emit(S2C.WorldSummary, payload satisfies S2C_WorldSummary);
  }

  @SubscribeMessage(C2S.CreateMarketSellOrder)
/** handleCreateMarketSellOrder：处理当前场景中的对应操作。 */
  async handleCreateMarketSellOrder(client: Socket, data: C2S_CreateMarketSellOrder) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
/** result：定义该变量以承载业务值。 */
    const result = await this.marketService.createSellOrder(player, data);
    await this.flushMarketResult(result);
  }

  @SubscribeMessage(C2S.CreateMarketBuyOrder)
/** handleCreateMarketBuyOrder：处理当前场景中的对应操作。 */
  async handleCreateMarketBuyOrder(client: Socket, data: C2S_CreateMarketBuyOrder) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
/** result：定义该变量以承载业务值。 */
    const result = await this.marketService.createBuyOrder(player, data);
    await this.flushMarketResult(result);
  }

  @SubscribeMessage(C2S.BuyMarketItem)
/** handleBuyMarketItem：处理当前场景中的对应操作。 */
  async handleBuyMarketItem(client: Socket, data: C2S_BuyMarketItem) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
/** result：定义该变量以承载业务值。 */
    const result = await this.marketService.buyNow(player, data);
    await this.flushMarketResult(result);
  }

  @SubscribeMessage(C2S.SellMarketItem)
/** handleSellMarketItem：处理当前场景中的对应操作。 */
  async handleSellMarketItem(client: Socket, data: C2S_SellMarketItem) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
/** result：定义该变量以承载业务值。 */
    const result = await this.marketService.sellNow(player, data);
    await this.flushMarketResult(result);
  }

  @SubscribeMessage(C2S.CancelMarketOrder)
/** handleCancelMarketOrder：处理当前场景中的对应操作。 */
  async handleCancelMarketOrder(client: Socket, data: C2S_CancelMarketOrder) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
/** result：定义该变量以承载业务值。 */
    const result = await this.marketService.cancelOrder(player, data);
    await this.flushMarketResult(result);
  }

  @SubscribeMessage(C2S.ClaimMarketStorage)
/** handleClaimMarketStorage：处理当前场景中的对应操作。 */
  async handleClaimMarketStorage(client: Socket, _data: C2S_ClaimMarketStorage) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = client.data?.playerId as string;
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return;
/** result：定义该变量以承载业务值。 */
    const result = await this.marketService.claimStorage(player);
    await this.flushMarketResult(result);
  }

  /** 向所有在线玩家广播最新建议列表 */
  private broadcastSuggestions() {
    this.suggestionRealtimeService.broadcastSuggestions(this.suggestionService.getAll());
  }

/** flushMarketResult：执行对应的业务逻辑。 */
  private async flushMarketResult(result: MarketActionResult): Promise<void> {
/** privateStatePlayerIds：定义该变量以承载业务值。 */
    const privateStatePlayerIds = new Set(result.privateStatePlayerIds);
/** touchedItemIds：定义该变量以承载业务值。 */
    const touchedItemIds = new Set(result.touchedItemIds);
/** tradeHistoryPlayerIds：定义该变量以承载业务值。 */
    const tradeHistoryPlayerIds = new Set(result.tradeHistoryPlayerIds);

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

    for (const affectedPlayerId of privateStatePlayerIds) {
      const player = this.playerService.getPlayer(affectedPlayerId);
      const socket = player ? this.playerService.getSocket(affectedPlayerId) : null;
      if (!player || !socket) {
        continue;
      }
      socket.emit(S2C.MarketOrders, this.marketService.buildOrdersUpdate(player));
      socket.emit(S2C.MarketStorage, this.marketService.buildStorageUpdate(player));
    }

    if (touchedItemIds.size > 0) {
      for (const subscriberPlayerId of Array.from(this.marketSubscriberPlayerIds)) {
        const player = this.playerService.getPlayer(subscriberPlayerId);
        const socket = player ? this.playerService.getSocket(subscriberPlayerId) : null;
        if (!player || !socket) {
          this.marketSubscriberPlayerIds.delete(subscriberPlayerId);
          this.marketListingRequests.delete(subscriberPlayerId);
          this.marketTradeHistoryRequests.delete(subscriberPlayerId);
          continue;
        }
/** request：定义该变量以承载业务值。 */
        const request = this.marketListingRequests.get(subscriberPlayerId) ?? { page: 1 };
        this.marketListingRequests.set(subscriberPlayerId, request);
        socket.emit(S2C.MarketListings, this.marketService.buildListingsPage(request));
      }
    }

    await Promise.all([...tradeHistoryPlayerIds].map(async (playerId) => {
/** page：定义该变量以承载业务值。 */
      const page = this.marketTradeHistoryRequests.get(playerId);
      if (!page) {
        return;
      }
/** socket：定义该变量以承载业务值。 */
      const socket = this.playerService.getSocket(playerId);
      if (!socket) {
        this.marketTradeHistoryRequests.delete(playerId);
        return;
      }
      socket.emit(S2C.MarketTradeHistory, await this.marketService.buildTradeHistoryPage(playerId, page));
    }));
  }

/** broadcastMarketUpdates：执行对应的业务逻辑。 */
  private broadcastMarketUpdates(): void {
    for (const playerId of this.marketSubscriberPlayerIds) {
      const player = this.playerService.getPlayer(playerId);
      if (!player) {
        this.marketSubscriberPlayerIds.delete(playerId);
        this.marketListingRequests.delete(playerId);
        continue;
      }
/** socket：定义该变量以承载业务值。 */
      const socket = this.playerService.getSocket(player.id);
      if (!socket) {
        continue;
      }
/** request：定义该变量以承载业务值。 */
      const request = this.marketListingRequests.get(player.id) ?? { page: 1 };
      this.marketListingRequests.set(player.id, request);
      this.emitMarketPanelSnapshot(socket, player, request);
    }
  }

/** emitMarketPanelSnapshot：执行对应的业务逻辑。 */
  private emitMarketPanelSnapshot(client: Socket, player: PlayerState, request: C2S_RequestMarketListings): void {
    client.emit(S2C.MarketListings, this.marketService.buildListingsPage(request));
    client.emit(S2C.MarketOrders, this.marketService.buildOrdersUpdate(player));
    client.emit(S2C.MarketStorage, this.marketService.buildStorageUpdate(player));
  }

/** toClientVisibleTiles：执行对应的业务逻辑。 */
  private toClientVisibleTiles(viewer: PlayerState, tiles: VisibleTile[][]): VisibleTile[][] {
/** auraLevelBaseValue：定义该变量以承载业务值。 */
    const auraLevelBaseValue = this.tickService.getAuraLevelBaseValue();
/** originX：定义该变量以承载业务值。 */
    const originX = viewer.x - Math.floor(tiles[0]?.length ? tiles[0].length / 2 : 0);
/** originY：定义该变量以承载业务值。 */
    const originY = viewer.y - Math.floor(tiles.length / 2);
    return tiles.map((row, rowIndex) => row.map((tile, columnIndex) => {
      if (!tile) {
        return null;
      }
/** x：定义该变量以承载业务值。 */
      const x = originX + columnIndex;
/** y：定义该变量以承载业务值。 */
      const y = originY + rowIndex;
/** auraResources：定义该变量以承载业务值。 */
      const auraResources = this.mapService.getTileAuraResourceValues(viewer.mapId, x, y);
      return {
        ...tile,
        aura: viewer.senseQiActive
          ? (
            auraResources.length > 0
              ? this.qiProjectionService.getAuraLevelFromResources(viewer, auraResources, auraLevelBaseValue)
              : this.qiProjectionService.getAuraLevel(viewer, tile.aura ?? 0, auraLevelBaseValue)
          )
          : 0,
      } satisfies NonNullable<VisibleTile>;
    }));
  }

  /** 解析登录落点：地图被移除时回到初始地图复活点，其余情况就近落到可站立位置 */
  private resolveLoginPlacement(player: Pick<PlayerState, 'id' | 'mapId' | 'x' | 'y'>): { mapId: string; x: number; y: number } {
/** placement：定义该变量以承载业务值。 */
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

/** originalEmit：定义该变量以承载业务值。 */
    const originalEmit = client.emit.bind(client);
    client.emit = ((event: string, ...args: unknown[]) => {
/** startedAt：定义该变量以承载业务值。 */
      const startedAt = process.hrtime.bigint();
/** encodedArgs：定义该变量以承载业务值。 */
      const encodedArgs = args.map((arg) => encodeServerEventPayload(event, arg));
/** label：定义该变量以承载业务值。 */
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
/** startedAt：定义该变量以承载业务值。 */
      const startedAt = process.hrtime.bigint();
/** label：定义该变量以承载业务值。 */
      const label = `WS ${event}`;
      this.performanceService.recordNetworkInBytes(this.estimateSocketPacketBytes(event, args), label, label);
      this.performanceService.recordCpuSection(
        Number(process.hrtime.bigint() - startedAt) / 1_000_000,
        'network',
        '网络编解码与收发',
      );
    });
  }

/** estimateSocketPacketBytes：执行对应的业务逻辑。 */
  private estimateSocketPacketBytes(event: string, args: unknown[]): number {
    return Buffer.byteLength(String(event)) + args.reduce<number>((total, arg) => total + this.estimateSocketValueBytes(arg), 0);
  }

/** estimateSocketValueBytes：执行对应的业务逻辑。 */
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

/**
 * Tick 引擎 —— 每张地图独立的定时循环驱动器。
 * 每 tick 收集玩家指令、执行游戏逻辑、广播状态增量，
 * 同时负责定时落盘和运行配置加载。
 */
import { Injectable, OnApplicationBootstrap, OnModuleDestroy, Logger } from '@nestjs/common';
import {
  AUTO_IDLE_CULTIVATION_DELAY_TICKS,
  ActionDef,
  ActionUpdateEntry,
  AutoBattleSkillConfig,
  CombatEffect,
  DEFAULT_AURA_LEVEL_BASE_VALUE,
  DEFAULT_PLAYER_MAP_ID,
  DEFAULT_OFFLINE_PLAYER_TIMEOUT_SEC,
  Direction,
  EQUIP_SLOTS,
  EquipmentSlots,
  EquipmentSlotUpdateEntry,
  GroundItemPilePatch,
  GroundItemPileView,
  Inventory,
  ItemStack,
  MapMeta,
  MapMinimapMarker,
  MapRouteDomain,
  normalizeAutoBattleTargetingMode,
  normalizeAuraLevelBaseValue,
  parseTileTargetRef,
  PLAYER_HEARTBEAT_TIMEOUT_MS,
  PlayerState,
  QUEST_CROSS_MAP_NAV_COOLDOWN_TICKS,
  RenderEntity,
  S2C,
  S2C_ActionsUpdate,
  S2C_AttrUpdate,
  S2C_EquipmentUpdate,
  S2C_InventoryUpdate,
  InventorySlotUpdateEntry,
  S2C_LootWindowUpdate,
  S2C_MapStaticSync,
  S2C_QuestNavigateResult,
  S2C_QuestUpdate,
  S2C_RealmUpdate,
  S2C_SystemMsg,
  S2C_TechniqueUpdate,
  S2C_Tick,
  SyncedInventorySnapshot,
  SyncedItemStack,
  TechniqueState,
  TechniqueUpdateEntry,
  TemporaryBuffState,
  TileType,
  TickRenderEntity,
  VisibleTile,
  VisibleTilePatch,
  PERSIST_INTERVAL,
  clonePlainValue,
  buildQiResourceKey,
  DEFAULT_QI_RESOURCE_DESCRIPTOR,
  DISPERSED_AURA_RESOURCE_KEY,
  isPlainEqual,
} from '@mud/shared';
import * as fs from 'fs';
import { PersistentDocumentService } from '../database/persistent-document.service';
import { RETURN_TO_SPAWN_ACTION_ID, RETURN_TO_SPAWN_COOLDOWN_TICKS } from '../constants/gameplay/action';
import { PLAYER_SPECIAL_STATS_SYNC_INTERVAL_MS } from '../constants/gameplay/attr';
import {
  FIRE_BURN_MARK_BUFF_ID,
  FIRE_BURN_MARK_HP_RATIO_PER_STACK,
} from '../constants/gameplay/technique-buffs';
import {
  DIVINE_SPIRITUAL_ROOT_SEED_ITEM_ID,
  HEAVEN_SPIRITUAL_ROOT_SEED_ITEM_ID,
  SHATTER_SPIRIT_PILL_ITEM_ID,
  WANGSHENG_PILL_ITEM_ID,
} from '../constants/gameplay/technique';
import { GAME_CONFIG_PATH } from '../constants/storage/config';
import { ActionService } from './action.service';
import { AoiService } from './aoi.service';
import { AttrService } from './attr.service';
import { ContentService } from './content.service';
import { EquipmentEffectService } from './equipment-effect.service';
import { EquipmentService } from './equipment.service';
import { InventoryService } from './inventory.service';
import { MapService } from './map.service';
import { NavigationService } from './navigation.service';
import { BotService } from './bot.service';
import { GmService } from './gm.service';
import { LootService } from './loot.service';
import { PerformanceService } from './performance.service';
import { DirtyFlag, ImmediateCommandType, PlayerService } from './player.service';
import { QiProjectionService } from './qi-projection.service';
import { TechniqueService } from './technique.service';
import { MailService, PreparedClaimOperation, PreparedDeleteOperation, PreparedMarkReadOperation } from './mail.service';
import { PreparedRedeemCodeOperation, RedeemCodeService } from './redeem-code.service';
import { TimeService } from './time.service';
import { WorldMessage, WorldService, WorldUpdate } from './world.service';
import { syncDynamicBuffPresentation } from './buff-presentation';
import { getBuffSustainCost, getBuffSustainResourceLabel } from './buff-sustain';
import {
  MOLTEN_POOL_BURN_BUFF_ID,
  MOLTEN_POOL_BURN_COLOR,
  MOLTEN_POOL_BURN_DESC,
  MOLTEN_POOL_BURN_DURATION_TICKS,
  MOLTEN_POOL_BURN_HP_PERCENT_PER_STACK,
  MOLTEN_POOL_BURN_MAX_STACKS,
  MOLTEN_POOL_BURN_NAME,
  MOLTEN_POOL_BURN_SHORT_MARK,
  MOLTEN_POOL_BURN_SOURCE_ID,
} from '../constants/gameplay/terrain-effects';

/** 上一次发送给各玩家的 tick 快照，用于增量比对 */
interface LastSentTickState {
  mapId?: string;
  hp?: number;
  qi?: number;
  facing?: Direction;
  auraLevelBaseValue?: number;
  pathVersion: number;
  timeState?: ReturnType<TimeService['buildPlayerTimeState']>;
  threatArrows?: Array<[string, string]>;
  visibleMinimapMarkers?: MapMinimapMarker[];
  visibilityKey?: string;
  tilePatchRevision?: number;
  mapMeta?: MapMeta;
  minimapSignature?: string;
  minimapLibrarySignature?: string;
}

const REFINED_AURA_RESOURCE_KEY = buildQiResourceKey(DEFAULT_QI_RESOURCE_DESCRIPTOR);

interface ActionSyncStateEntry {
  id: string;
  name: string;
  desc: string;
  cooldownLeft: number;
  type: string;
  range?: number;
  requiresTarget?: boolean;
  targetMode?: 'any' | 'entity' | 'tile';
  autoBattleEnabled?: boolean;
  autoBattleOrder?: number;
  skillEnabled?: boolean;
}

interface ActionPanelSyncState {
  autoBattle: boolean;
  autoBattleTargetingMode: PlayerState['autoBattleTargetingMode'];
  autoRetaliate: boolean;
  autoBattleStationary: boolean;
  allowAoePlayerHit: boolean;
  autoIdleCultivation: boolean;
  autoSwitchCultivation: boolean;
  cultivationActive: boolean;
  senseQiActive: boolean;
}

interface SyncActionsOptions {
  skipQuestSync?: boolean;
}

interface TickConfigDocument {
  version: 1;
  minTickInterval?: number;
  offlinePlayerTimeoutSec?: number;
  auraLevelBaseValue?: number;
}

const SERVER_CONFIG_SCOPE = 'server_config';
const TICK_CONFIG_DOCUMENT_KEY = 'tick_runtime';
const DEFAULT_SYSTEM_ROUTE_DOMAINS: readonly MapRouteDomain[] = ['system'];
const PERIODIC_SYNC_INTERVAL_MS = 60_000;
const PERIODIC_SYNC_DIRTY_FLAGS: readonly DirtyFlag[] = ['attr', 'inv', 'equip', 'tech', 'actions', 'loot', 'quest'];

function normalizeConsumableBuffShortMark(raw: string | undefined, fallbackName: string): string {
  const trimmed = raw?.trim();
  if (trimmed) {
    return [...trimmed][0] ?? trimmed;
  }
  const fallback = [...fallbackName.trim()][0];
  return fallback ?? '丹';
}

@Injectable()
export class TickService implements OnApplicationBootstrap, OnModuleDestroy {
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private lastTickTime: Map<string, number> = new Map();
  private mapTickSpeed: Map<string, number> = new Map();
  private pausedMaps: Set<string> = new Set();
  private lastSentTickState: Map<string, LastSentTickState> = new Map();
  private lastSentAttrUpdates: Map<string, S2C_AttrUpdate> = new Map();
  private lastSentRealmStates: Map<string, PlayerState['realm'] | null> = new Map();
  private lastSentSpecialStatsAt: Map<string, number> = new Map();
  private pendingSpecialStatsPlayers: Set<string> = new Set();
  private lastSentTechniqueStates: Map<string, Map<string, TechniqueState>> = new Map();
  private lastSentCultivatingTechIds: Map<string, string | null> = new Map();
  private lastSentBodyTrainingStates: Map<string, PlayerState['bodyTraining'] | null> = new Map();
  private lastSentActionStates: Map<string, Map<string, ActionSyncStateEntry>> = new Map();
  private lastSentActionPanelStates: Map<string, ActionPanelSyncState> = new Map();
  private lastSentInventoryStates: Map<string, Inventory> = new Map();
  private lastSentEquipmentStates: Map<string, EquipmentSlots> = new Map();
  private cooldownOnlyActionDirtyPlayers: Set<string> = new Set();
  private lastSentGroundPiles: Map<string, Map<string, GroundItemPileView>> = new Map();
  private lastSentVisibleTiles: Map<string, Map<string, VisibleTile>> = new Map();
  private lastSentRenderEntities: Map<string, Map<string, RenderEntity>> = new Map();
  private lastPeriodicSyncAt: Map<string, number> = new Map();
  private forcedTickSyncPlayers: Set<string> = new Set();
  private persistTimer: ReturnType<typeof setInterval> | null = null;
  private minTickInterval = 1000;
  private offlinePlayerTimeoutMs = DEFAULT_OFFLINE_PLAYER_TIMEOUT_SEC * 1000;
  private auraLevelBaseValue = DEFAULT_AURA_LEVEL_BASE_VALUE;
  private readonly logger = new Logger(TickService.name);

  constructor(
    private readonly playerService: PlayerService,
    private readonly mapService: MapService,
    private readonly aoiService: AoiService,
    private readonly navigationService: NavigationService,
    private readonly botService: BotService,
    private readonly gmService: GmService,
    private readonly performanceService: PerformanceService,
    private readonly attrService: AttrService,
    private readonly inventoryService: InventoryService,
    private readonly equipmentService: EquipmentService,
    private readonly equipmentEffectService: EquipmentEffectService,
    private readonly techniqueService: TechniqueService,
    private readonly actionService: ActionService,
    private readonly contentService: ContentService,
    private readonly lootService: LootService,
    private readonly worldService: WorldService,
    private readonly timeService: TimeService,
    private readonly qiProjectionService: QiProjectionService,
    private readonly mailService: MailService,
    private readonly redeemCodeService: RedeemCodeService,
    private readonly persistentDocumentService: PersistentDocumentService,
  ) {}

  async onApplicationBootstrap() {
    await this.loadConfig();
    await this.bootstrapRuntimeState();
    this.startPersistTimer();
  }

  /** 清除玩家的所有增量同步缓存（切图或重连时调用） */
  resetPlayerSyncState(playerId: string): void {
    this.resetPlayerMapSyncState(playerId);
    this.lastSentTickState.delete(playerId);
    this.lastSentAttrUpdates.delete(playerId);
    this.lastSentRealmStates.delete(playerId);
    this.lastSentSpecialStatsAt.delete(playerId);
    this.pendingSpecialStatsPlayers.delete(playerId);
    this.lastSentTechniqueStates.delete(playerId);
    this.lastSentCultivatingTechIds.delete(playerId);
    this.lastSentBodyTrainingStates.delete(playerId);
    this.lastSentActionStates.delete(playerId);
    this.lastSentActionPanelStates.delete(playerId);
    this.lastSentInventoryStates.delete(playerId);
    this.lastSentEquipmentStates.delete(playerId);
    this.cooldownOnlyActionDirtyPlayers.delete(playerId);
  }

  /** 切图时仅重置地图可见性与 AOI 相关缓存，避免面板差量缓存回退到整包 */
  resetPlayerMapSyncState(playerId: string): void {
    this.lastSentGroundPiles.delete(playerId);
    this.lastSentVisibleTiles.delete(playerId);
    this.lastSentRenderEntities.delete(playerId);
    this.lastSentTickState.delete(playerId);
  }

  async onModuleDestroy() {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = null;
    }
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    await this.mapService.persistTileRuntimeStates();
    await this.lootService.persistRuntimeState();
    await this.worldService.persistMonsterRuntimeState();
    await this.playerService.persistAll().catch((err) => {
      this.logger.error(`关闭落盘失败: ${err.message}`);
    });
  }

  private async loadConfig(): Promise<void> {
    try {
      const config = await this.readPersistedConfig();
      this.applyConfig(config);
    } catch (error) {
      this.applyConfig(null);
      this.logger.warn(`读取数据库配置失败，使用默认值: ${error}`);
    }
  }

  getAuraLevelBaseValue(): number {
    return this.auraLevelBaseValue;
  }

  /** 在发送初始化快照后预热增量缓存，避免首个脏包再次回退到整包 */
  primePlayerPanelSyncState(player: PlayerState): void {
    this.lastSentAttrUpdates.set(player.id, this.cloneStructured(this.captureAttrUpdateState(player)));
    this.lastSentRealmStates.set(player.id, player.realm ? this.cloneStructured(player.realm) : null);
    this.lastSentSpecialStatsAt.set(player.id, Date.now());
    this.pendingSpecialStatsPlayers.delete(player.id);
    this.lastSentInventoryStates.set(player.id, this.cloneStructured(player.inventory));
    this.lastSentEquipmentStates.set(player.id, this.cloneStructured(player.equipment));
    this.lastSentTechniqueStates.set(player.id, new Map(
      player.techniques.map((technique) => [technique.techId, this.cloneStructured(technique)] as const),
    ));
    this.lastSentCultivatingTechIds.set(player.id, player.cultivatingTechId ?? null);
    this.lastSentBodyTrainingStates.set(player.id, player.bodyTraining ? this.cloneStructured(player.bodyTraining) : null);
    this.lastSentActionStates.set(player.id, new Map(
      this.captureActionSyncState(player.actions).map((action) => [action.id, action] as const),
    ));
    this.lastSentActionPanelStates.set(player.id, this.captureActionPanelSyncState(player));
  }

  async reloadConfig(): Promise<void> {
    await this.loadConfig();
  }

  private async bootstrapRuntimeState(): Promise<void> {
    try {
      const recovered = await this.playerService.restoreRetainedPlayers(this.offlinePlayerTimeoutMs);
      this.logger.log(
        `启动恢复完成: 恢复离线挂机 ${recovered.restored} 名, 超时离场 ${recovered.expired} 名, 修正在线残留 ${recovered.recoveredOnline} 名`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`启动恢复离线挂机失败: ${message}`);
    } finally {
      this.restoreMapTickSpeeds();
      this.ensureMapTicks();
      this.logger.log(`Tick 引擎已启动，地图数: ${this.timers.size}`);
    }
  }

  private applyConfig(config: Partial<TickConfigDocument> | null): void {
    const minTickInterval = typeof config?.minTickInterval === 'number' && config.minTickInterval > 0
      ? Math.floor(config.minTickInterval)
      : 1000;
    const offlinePlayerTimeoutSec = typeof config?.offlinePlayerTimeoutSec === 'number' && config.offlinePlayerTimeoutSec > 0
      ? Math.floor(config.offlinePlayerTimeoutSec)
      : DEFAULT_OFFLINE_PLAYER_TIMEOUT_SEC;
    const auraLevelBaseValue = normalizeAuraLevelBaseValue(config?.auraLevelBaseValue, DEFAULT_AURA_LEVEL_BASE_VALUE);

    this.minTickInterval = minTickInterval;
    this.offlinePlayerTimeoutMs = offlinePlayerTimeoutSec * 1000;
    this.auraLevelBaseValue = auraLevelBaseValue;

    this.logger.log(`配置已加载: minTickInterval=${this.minTickInterval}ms`);
    this.logger.log(`配置已加载: offlinePlayerTimeoutSec=${offlinePlayerTimeoutSec}s`);
    this.logger.log(`配置已加载: auraLevelBaseValue=${this.auraLevelBaseValue}`);
    this.mapService.setAuraLevelBaseValue(this.auraLevelBaseValue);
  }

  private async readPersistedConfig(): Promise<Partial<TickConfigDocument> | null> {
    let config = await this.persistentDocumentService.get<Partial<TickConfigDocument>>(
      SERVER_CONFIG_SCOPE,
      TICK_CONFIG_DOCUMENT_KEY,
    );
    if (!config) {
      await this.importLegacyConfigIfNeeded();
      config = await this.persistentDocumentService.get<Partial<TickConfigDocument>>(
        SERVER_CONFIG_SCOPE,
        TICK_CONFIG_DOCUMENT_KEY,
      );
    }
    if (config) {
      return config;
    }

    const defaultConfig = this.buildDefaultConfigDocument();
    await this.persistentDocumentService.save(SERVER_CONFIG_SCOPE, TICK_CONFIG_DOCUMENT_KEY, defaultConfig);
    return defaultConfig;
  }

  private async importLegacyConfigIfNeeded(): Promise<void> {
    if (!fs.existsSync(GAME_CONFIG_PATH)) {
      return;
    }

    try {
      const raw = JSON.parse(fs.readFileSync(GAME_CONFIG_PATH, 'utf-8')) as Partial<TickConfigDocument>;
      await this.persistentDocumentService.save(
        SERVER_CONFIG_SCOPE,
        TICK_CONFIG_DOCUMENT_KEY,
        {
          version: 1,
          minTickInterval: typeof raw.minTickInterval === 'number' && raw.minTickInterval > 0
            ? Math.floor(raw.minTickInterval)
            : undefined,
          offlinePlayerTimeoutSec: typeof raw.offlinePlayerTimeoutSec === 'number' && raw.offlinePlayerTimeoutSec > 0
            ? Math.floor(raw.offlinePlayerTimeoutSec)
            : undefined,
          auraLevelBaseValue: typeof raw.auraLevelBaseValue === 'number' && Number.isFinite(raw.auraLevelBaseValue)
            ? Math.round(raw.auraLevelBaseValue)
            : undefined,
        } satisfies TickConfigDocument,
      );
      this.logger.log('已从旧服务端配置 JSON 导入 PostgreSQL');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`导入旧服务端配置 JSON 失败: ${message}`);
    }
  }

  private buildDefaultConfigDocument(): TickConfigDocument {
    return {
      version: 1,
      minTickInterval: 1000,
      offlinePlayerTimeoutSec: DEFAULT_OFFLINE_PLAYER_TIMEOUT_SEC,
      auraLevelBaseValue: DEFAULT_AURA_LEVEL_BASE_VALUE,
    };
  }

  /** 启动指定地图的 tick 循环（幂等，已启动则跳过） */
  startMapTick(mapId: string) {
    if (this.timers.has(mapId)) return;
    this.lastTickTime.set(mapId, Date.now());
    this.scheduleNextTick(mapId, this.minTickInterval);
  }

  /** 设置地图 tick 倍率，0 = 暂停 */
  setMapTickSpeed(mapId: string, speed: number): void {
    this.applyMapTickSpeed(mapId, speed, true);
  }

  private applyMapTickSpeed(mapId: string, speed: number, persist: boolean): void {
    const clamped = Math.max(0, Math.min(100, speed));
    this.mapTickSpeed.set(mapId, clamped);
    if (persist) {
      this.mapService.setPersistedMapTickSpeed(mapId, clamped);
    }
    if (clamped === 0) {
      this.pausedMaps.add(mapId);
    } else {
      const wasPaused = this.pausedMaps.has(mapId);
      this.pausedMaps.delete(mapId);
      if (wasPaused && !this.timers.has(mapId)) {
        this.lastTickTime.set(mapId, Date.now());
        this.scheduleNextTick(mapId, this.getEffectiveInterval(mapId));
      }
    }
  }

  private restoreMapTickSpeeds(): void {
    for (const mapId of this.mapService.getAllMapIds()) {
      const persistedSpeed = this.mapService.getPersistedMapTickSpeed(mapId);
      if (persistedSpeed === null) {
        continue;
      }
      this.applyMapTickSpeed(mapId, persistedSpeed, false);
    }
  }

  getMapTickSpeed(mapId: string): number {
    if (this.pausedMaps.has(mapId)) return 0;
    return this.mapTickSpeed.get(mapId) ?? 1;
  }

  isMapPaused(mapId: string): boolean {
    return this.pausedMaps.has(mapId);
  }

  resetNetworkPerf(): void {
    this.performanceService.resetNetworkStats();
  }

  resetCpuPerf(): void {
    this.performanceService.resetCpuStats();
  }

  resetPathfindingPerf(): void {
    this.performanceService.resetPathfindingStats();
  }

  getOfflinePlayerTimeoutMs(): number {
    return this.offlinePlayerTimeoutMs;
  }

  suspendRuntimeForMaintenance(): void {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = null;
    }
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.lastTickTime.clear();
    this.resetAllSyncState();
  }

  resumeRuntimeAfterMaintenance(): void {
    this.restoreMapTickSpeeds();
    this.ensureMapTicks();
    this.startPersistTimer();
  }

  private getEffectiveInterval(mapId: string): number {
    const speed = this.mapTickSpeed.get(mapId) ?? 1;
    if (speed <= 0) return this.minTickInterval;
    return Math.max(10, Math.round(this.minTickInterval / speed));
  }

  private scheduleNextTick(mapId: string, delay: number) {
    const timer = setTimeout(() => {
      const start = Date.now();
      if (this.pausedMaps.has(mapId)) {
        this.tickPausedMap(mapId);
      } else {
        this.tick(mapId, start);
      }
      const elapsed = Date.now() - start;
      this.performanceService.recordTick(elapsed);
      const effectiveInterval = this.getEffectiveInterval(mapId);
      const nextDelay = Math.max(0, effectiveInterval - elapsed);
      this.scheduleNextTick(mapId, nextDelay);
    }, delay);
    this.timers.set(mapId, timer);
  }

  private startPersistTimer(): void {
    if (this.persistTimer) {
      return;
    }
    this.persistTimer = setInterval(() => {
      const startedAt = process.hrtime.bigint();
      Promise.all([
        this.playerService.persistAll(),
        this.mapService.persistTileRuntimeStates(),
        this.lootService.persistRuntimeState(),
        this.worldService.persistMonsterRuntimeState(),
      ]).then(() => {
        const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        this.performanceService.recordCpuSection(elapsedMs, 'io_persist', '落盘与外部 I/O');
      }).catch((err) => {
        this.logger.error(`定时落盘失败: ${err.message}`);
      });
    }, PERSIST_INTERVAL * 1000);
    this.logger.log(`定时落盘已启动，间隔: ${PERSIST_INTERVAL}s`);
  }

  private resetAllSyncState(): void {
    this.lastSentTickState.clear();
    this.lastSentAttrUpdates.clear();
    this.lastSentRealmStates.clear();
    this.lastSentSpecialStatsAt.clear();
    this.pendingSpecialStatsPlayers.clear();
    this.lastSentTechniqueStates.clear();
    this.lastSentCultivatingTechIds.clear();
    this.lastSentBodyTrainingStates.clear();
    this.lastSentActionStates.clear();
    this.lastSentActionPanelStates.clear();
    this.lastSentInventoryStates.clear();
    this.lastSentEquipmentStates.clear();
    this.cooldownOnlyActionDirtyPlayers.clear();
    this.lastSentGroundPiles.clear();
    this.lastSentVisibleTiles.clear();
    this.lastSentRenderEntities.clear();
    this.lastPeriodicSyncAt.clear();
    this.forcedTickSyncPlayers.clear();
  }

  /**
   * 单张地图的核心 tick 逻辑：
   * 1. 执行 GM 指令 → 2. 处理玩家命令 → 3. Bot AI → 4. 自动战斗/修炼/寻路
   * 5. 怪物 AI → 6. 刷新脏数据 → 7. 广播增量 tick 包
   */
  private tick(mapId: string, now: number) {
    this.ensureMapTicks();
    const last = this.lastTickTime.get(mapId) ?? now;
    const dt = now - last;
    this.lastTickTime.set(mapId, now);
    this.timeService.advanceMapTicks(mapId);
    this.measureCpuSection('map_runtime', '地图动态状态', () => {
      this.mapService.tickDynamicTiles(mapId);
    });

    const messages: WorldMessage[] = [];
    const gmCommands = this.measureCpuSection('gm_commands', 'GM 指令处理', () => this.gmService.drainCommands(mapId));
    const commands = this.measureCpuSection('player_command_queue', '玩家指令出队', () => this.playerService.drainCommands(mapId));
    const affectedPlayers = new Map<string, PlayerState>();
    const activePlayerIds = new Set<string>();

    this.measureCpuSection('gm_commands', 'GM 指令处理', () => {
      this.processGmCommands(gmCommands, affectedPlayers, activePlayerIds, messages);
    });
    this.measureCpuSection('gm_observe_buffs', 'GM 观察 Buff 同步', () => {
      this.syncGmObservedPlayerBuffs(mapId, affectedPlayers);
    });

    const lootTick = this.measureCpuSection('loot', '掉落与容器', () => this.lootService.tick(mapId, this.playerService.getPlayersByMap(mapId)));
    for (const playerId of lootTick.dirtyPlayers) {
      this.playerService.markDirty(playerId, 'loot');
    }

    this.measureCpuSection('player_presence', '在线态与保活', () => {
      this.tickPlayerPresence(mapId, now);
    });
    if (mapId === DEFAULT_PLAYER_MAP_ID) {
      this.measureCpuSection('player_presence', '在线态与保活', () => {
        this.reconcilePlayersInRemovedMaps(affectedPlayers, messages);
      });
    }

    for (const cmd of commands) {
      const player = this.playerService.getPlayer(cmd.playerId);
      if (!player || player.mapId !== mapId || player.inWorld === false) continue;
      const isDebugReset =
        cmd.type === 'debugResetSpawn' ||
        (cmd.type === 'action' && (cmd.data as { actionId?: string })?.actionId === 'debug:reset_spawn');
      if (player.dead && !isDebugReset) continue;
      affectedPlayers.set(player.id, player);
      this.markPlayerActive(player, activePlayerIds);

      switch (cmd.type) {
        case 'move': {
          this.measureCpuSection('pathfinding', '寻路与移动', () => {
            this.navigationService.clearMoveTarget(player.id);
            player.questNavigation = undefined;
            if (player.autoBattle) {
              player.autoBattle = false;
              player.combatTargetId = undefined;
              player.combatTargetLocked = false;
              this.markActionsDirty(player.id);
            }
            this.applyWorldUpdate(
              player.id,
              this.worldService.interruptPendingPlayerSkillCast(player, '你移动了身形。'),
              messages,
            );
            this.applyCultivationResult(player.id, this.techniqueService.interruptCultivation(player, 'move'), messages);
            const { d } = cmd.data as { d: Direction };
            const moved = this.navigationService.stepPlayerByDirection(player, d);
            if (moved) {
              this.markActionsDirty(player.id);
              this.applyAutoTravelIfNeeded(player, messages);
            }
          });
          break;
        }
        case 'moveTo': {
          this.measureCpuSection('pathfinding', '寻路与移动', () => {
            player.questNavigation = undefined;
            if (player.autoBattle) {
              player.autoBattle = false;
              player.combatTargetId = undefined;
              player.combatTargetLocked = false;
              this.markActionsDirty(player.id);
            }
            this.applyWorldUpdate(
              player.id,
              this.worldService.interruptPendingPlayerSkillCast(player, '你移动了身形。'),
              messages,
            );
            this.applyCultivationResult(player.id, this.techniqueService.interruptCultivation(player, 'move'), messages);
            const {
              x,
              y,
              allowNearestReachable,
            } = cmd.data as {
              x: number;
              y: number;
              allowNearestReachable?: boolean;
            };
            const error = this.navigationService.setMoveTarget(player, x, y, {
              allowNearestReachable,
            });
            if (error) {
              messages.push({ playerId: player.id, text: error, kind: 'system' });
            }
          });
          break;
        }
        case 'navigateQuest': {
          this.measureCpuSection('player_actions', '玩家交互与杂项', () => {
            const { questId } = cmd.data as { questId: string };
            const quest = player.quests.find((entry) => entry.id === questId && entry.status !== 'completed');
            if (!quest) {
              const error = '目标任务不存在或已完成';
              messages.push({ playerId: player.id, text: error, kind: 'system' });
              this.rejectQuestNavigation(player, questId, error);
              player.questNavigation = undefined;
              return;
            }
            player.questNavigation = { questId, pendingConfirmation: true };
            if (player.autoBattle) {
              player.autoBattle = false;
              player.combatTargetId = undefined;
              player.combatTargetLocked = false;
              this.markActionsDirty(player.id);
            }
          });
          break;
        }
        case 'takeLoot': {
          this.measureCpuSection('loot', '掉落与容器', () => {
            const { sourceId, itemKey, takeAll } = cmd.data as { sourceId: string; itemKey?: string; takeAll?: boolean };
            const result = takeAll
              ? this.lootService.takeAllFromSource(player, sourceId)
              : this.lootService.takeFromSource(player, sourceId, itemKey ?? '');
            if (result.error) {
              messages.push({ playerId: player.id, text: result.error, kind: 'system' });
              return;
            }
            if (result.inventoryChanged) {
              this.playerService.markDirty(player.id, 'inv');
            }
            for (const dirtyPlayerId of result.dirtyPlayers) {
              this.playerService.markDirty(dirtyPlayerId, 'loot');
            }
            for (const message of result.messages) {
              messages.push({ playerId: message.playerId, text: message.text, kind: message.kind });
            }
          });
          break;
        }
        case 'debugResetSpawn': {
          this.measureCpuSection('player_actions', '玩家交互与杂项', () => {
            this.logger.log(`执行调试回城: ${player.id}`);
            const result = this.worldService.resetPlayerToSpawn(player);
            this.applyWorldUpdate(player.id, result, messages);
          });
          break;
        }
        case 'action': {
          const { actionId, target } = cmd.data as { actionId: string; target?: string };
          if (player.pendingSkillCast && actionId !== 'debug:reset_spawn') {
            messages.push({ playerId: player.id, text: '你正在吟唱中，移动会打断当前神通。', kind: 'system' });
            break;
          }
          if (actionId === 'debug:reset_spawn') {
            this.measureCpuSection('player_actions', '玩家交互与杂项', () => {
              this.logger.log(`执行兼容调试回城(action): ${player.id}`);
              const result = this.worldService.resetPlayerToSpawn(player);
              this.applyWorldUpdate(player.id, result, messages);
            });
            break;
          }
          if (actionId === 'loot:open') {
            this.measureCpuSection('loot', '掉落与容器', () => {
              const tileTarget = target ? parseTileTargetRef(target) : null;
              if (!tileTarget) {
                messages.push({ playerId: player.id, text: '拿取需要指定目标格子。', kind: 'system' });
                return;
              }
              const result = this.lootService.openLootWindow(player, tileTarget.x, tileTarget.y);
              if (result.error) {
                messages.push({ playerId: player.id, text: result.error, kind: 'system' });
                return;
              }
              for (const dirtyPlayerId of result.dirtyPlayers) {
                this.playerService.markDirty(dirtyPlayerId, 'loot');
              }
            });
            break;
          }
          if (actionId === 'battle:engage') {
            this.measureCpuSection('combat', '战斗与技能计算', () => {
              const result = this.worldService.engageTarget(player, target);
              this.applyWorldUpdate(player.id, result, messages);
            });
            break;
          }
          if (actionId === 'body_training:infuse') {
            this.measureCpuSection('player_actions', '玩家交互与杂项', () => {
              const requestedFoundation = Number.parseInt(target ?? '', 10);
              const result = this.techniqueService.infuseBodyTrainingWithFoundation(player, requestedFoundation);
              this.applyWorldUpdate(player.id, {
                error: result.error,
                dirty: result.dirty,
                messages: result.messages.map((message) => ({
                  playerId: player.id,
                  text: message.text,
                  kind: message.kind,
                })),
              }, messages);
            });
            break;
          }
          this.syncActionsIfDirty(player, { skipQuestSync: true });
          const action = this.actionService.getAction(player, actionId);
          if (!action) {
            messages.push({ playerId: player.id, text: '行动不存在', kind: 'system' });
            break;
          }
          if (action.cooldownLeft > 0) {
            const actionLabel = action.type === 'skill' || action.type === 'battle' ? '招式' : '行动';
            messages.push({ playerId: player.id, text: `${actionLabel}尚在调息中，还需 ${action.cooldownLeft} 息`, kind: 'system' });
            break;
          }
          if (actionId === RETURN_TO_SPAWN_ACTION_ID) {
            this.measureCpuSection('player_actions', '玩家交互与杂项', () => {
              const result = this.worldService.resetPlayerToSpawn(player);
              const cooldownError = this.actionService.beginFixedCooldown(player, actionId, RETURN_TO_SPAWN_COOLDOWN_TICKS);
              if (cooldownError) {
                messages.push({ playerId: player.id, text: cooldownError, kind: 'system' });
                return;
              }
              result.dirty.push('actions');
              this.applyWorldUpdate(player.id, result, messages);
            });
            break;
          }
          if (actionId === 'portal:travel' || actionId.startsWith('npc:')) {
            this.measureCpuSection('player_actions', '玩家交互与杂项', () => {
              const result = this.worldService.handleInteraction(player, actionId);
              this.applyWorldUpdate(player.id, result, messages);
            });
            break;
          }

          let result: WorldUpdate;
          if (action.type === 'skill' || action.type === 'battle') {
            result = this.measureCpuSection('combat', '战斗与技能计算', () => {
              const skillResult = action.requiresTarget === false
                ? this.worldService.performSkill(player, actionId)
                : this.worldService.performTargetedSkill(player, actionId, target);
              if (skillResult.consumedAction) {
                const cooldownError = this.actionService.beginCooldown(player, actionId);
                if (cooldownError) {
                  return { ...skillResult, error: cooldownError };
                }
                skillResult.dirty.push('actions');
              }
              return skillResult;
            });
          } else if (action.requiresTarget) {
            result = this.measureCpuSection('player_actions', '玩家交互与杂项', () => (
              this.worldService.handleTargetedInteraction(player, actionId, target)
            ));
          } else {
            result = this.measureCpuSection('player_actions', '玩家交互与杂项', () => (
              this.worldService.handleInteraction(player, actionId)
            ));
          }

          this.applyWorldUpdate(player.id, result, messages);
          break;
        }
        case 'buyNpcShopItem': {
          this.measureCpuSection('player_actions', '玩家交互与杂项', () => {
            const result = this.worldService.buyNpcShopItem(
              player,
              cmd.data as { npcId: string; itemId: string; quantity: number },
            );
            this.applyWorldUpdate(player.id, result, messages);
          });
          break;
        }
        case 'mailRead': {
          this.measureCpuSection('player_actions', '玩家交互与杂项', () => {
            this.mailService.applyPreparedMarkRead(
              player.id,
              cmd.data as PreparedMarkReadOperation,
            );
          });
          break;
        }
        case 'mailDelete': {
          this.measureCpuSection('player_actions', '玩家交互与杂项', () => {
            this.mailService.applyPreparedDelete(
              player.id,
              cmd.data as PreparedDeleteOperation,
            );
          });
          break;
        }
        case 'mailClaim': {
          this.measureCpuSection('player_actions', '玩家交互与杂项', () => {
            const result = this.mailService.applyPreparedClaim(
              player,
              cmd.data as PreparedClaimOperation,
            );
            if (result.ok) {
              this.playerService.markDirty(player.id, 'inv');
            } else if (result.message) {
              messages.push({ playerId: player.id, text: result.message, kind: 'system' });
            }
          });
          break;
        }
        case 'redeemCodes': {
          this.measureCpuSection('player_actions', '玩家交互与杂项', () => {
            const result = this.redeemCodeService.applyPreparedRedeem(
              player,
              cmd.data as PreparedRedeemCodeOperation,
            );
            if (result.results.some((entry) => entry.ok)) {
              this.playerService.markDirty(player.id, 'inv');
            }
          });
          break;
        }
      }
    }

    this.measureCpuSection('bot_ai', '机器人 AI', () => {
      this.botService.tickBots(mapId);
    });
    this.measureCpuSection('pathfinding', '寻路与移动', () => {
      this.navigationService.pumpScheduledPaths(mapId);
    });

    const mapPlayers = this.playerService.getPlayersByMap(mapId);
    for (const player of mapPlayers) {
      affectedPlayers.set(player.id, player);
      if (player.dead) continue;
      if (player.isBot) {
        this.measureCpuSection('pathfinding', '寻路与移动', () => {
          this.navigationService.stepPlayerTowardTarget(player);
        });
        continue;
      }
      const startMapId = player.mapId;
      const startX = player.x;
      const startY = player.y;
      const timeUpdate = this.measureCpuSection('time_effects', '时间与环境效果', () => (
        this.timeService.syncPlayerTimeEffects(player, { advanceChronology: true })
      ));
      if (timeUpdate.changed) {
        this.markActionsDirty(player.id);
      }
      if (timeUpdate.chronologyDayChanged) {
        this.playerService.markDirty(player.id, 'attr');
      }
      const phaseDispatch = this.equipmentEffectService.syncTimePhase(player, timeUpdate.state.phase);
      if (phaseDispatch.dirty.length > 0) {
        this.markDirty(player.id, phaseDispatch.dirty as DirtyFlag[]);
      }

      if (!player.autoBattle) {
        this.measureCpuSection('pathfinding', '寻路与移动', () => {
          this.processQuestNavigation(player, messages);
        });
        const navigation = this.measureCpuSection('pathfinding', '寻路与移动', () => (
          this.navigationService.stepPlayerTowardTarget(player)
        ));
        if (navigation.error) {
          messages.push({ playerId: player.id, text: navigation.error, kind: 'system' });
        }
        if (navigation.moved && this.measureCpuSection('pathfinding', '寻路与移动', () => this.applyAutoTravelIfNeeded(player, messages))) {
          this.markPlayerActive(player, activePlayerIds);
          continue;
        }
      }

      const pendingSkillUpdate = this.measureCpuSection('combat', '战斗与技能计算', () => (
        this.worldService.resolvePendingPlayerSkillCast(player)
      ));
      if (pendingSkillUpdate) {
        this.applyWorldUpdate(player.id, pendingSkillUpdate, messages);
        if (pendingSkillUpdate.consumedAction || pendingSkillUpdate.messages.length > 0) {
          this.markPlayerActive(player, activePlayerIds);
        }
      }

      const autoBattleStartX = player.x;
      const autoBattleStartY = player.y;
      const autoBattle = this.measureCpuSection('combat', '战斗与技能计算', () => (
        this.worldService.performAutoBattle(player)
      ));
      if (
        autoBattle.usedActionId
        || autoBattle.consumedAction
        || player.x !== autoBattleStartX
        || player.y !== autoBattleStartY
      ) {
        this.markPlayerActive(player, activePlayerIds);
      }
      if (autoBattle.usedActionId) {
        const cooldownError = this.actionService.beginCooldown(player, autoBattle.usedActionId);
        if (!cooldownError) {
          autoBattle.dirty.push('actions');
        }
      }
      this.applyWorldUpdate(player.id, autoBattle, messages);

      this.measureCpuSection('cultivation_idle', '修炼: 挂机起修', () => {
        this.tryStartIdleCultivation(player, activePlayerIds, messages);
      });

      if (this.techniqueService.hasCultivationBuff(player)) {
        const cultivationEffects = this.equipmentEffectService.dispatch(player, { trigger: 'on_cultivation_tick' });
        if (cultivationEffects.dirty.length > 0) {
          this.markDirty(player.id, cultivationEffects.dirty as DirtyFlag[]);
        }
      }
      const cultivation = this.techniqueService.cultivateTick(player);
      if (cultivation.changed) {
        for (const flag of cultivation.dirty) {
          this.playerService.markDirty(player.id, flag);
        }
        for (const message of cultivation.messages) {
          messages.push({ playerId: player.id, text: message.text, kind: message.kind });
        }
      }

      for (const flag of this.measureCpuSection('state_quest', '角色状态: 任务同步', () => this.worldService.syncQuestState(player))) {
        this.playerService.markDirty(player.id, flag);
      }

      this.measureCpuSection('state_recovery', '角色状态: 自然恢复', () => {
        this.applyNaturalRecovery(player);
      });
      const tickEffects = this.equipmentEffectService.dispatch(player, { trigger: 'on_tick' });
      if (tickEffects.dirty.length > 0) {
        this.markDirty(player.id, tickEffects.dirty as DirtyFlag[]);
      }
      const terrainUpdate = this.measureCpuSection('state_terrain', '角色状态: 地形结算', () => this.applyTerrainEffects(player));
      this.applyWorldUpdate(player.id, terrainUpdate.update, messages);
      if (terrainUpdate.changed) {
        this.markPlayerActive(player, activePlayerIds);
      }
      if (terrainUpdate.update.playerDefeated) {
        continue;
      }
      const buffEffectUpdate = this.measureCpuSection('state_buff_effects', '角色状态: Buff 结算', () => this.applySkillBuffEffects(player));
      this.applyWorldUpdate(player.id, buffEffectUpdate.update, messages);
      if (buffEffectUpdate.changed) {
        this.markPlayerActive(player, activePlayerIds);
      }
      if (buffEffectUpdate.update.playerDefeated) {
        continue;
      }
      if (this.measureCpuSection('state_buffs', '角色状态: Buff 推进', () => this.tickTemporaryBuffs(player, messages))) {
        this.playerService.markDirty(player.id, 'attr');
      }

      if (this.measureCpuSection('state_cooldowns', '角色状态: 冷却推进', () => this.actionService.tickCooldowns(player))) {
        this.markActionCooldownDirty(player.id);
      }

      if (player.mapId !== startMapId || player.x !== startX || player.y !== startY) {
        this.markActionsDirty(player.id);
        const moveEffects = this.equipmentEffectService.dispatch(player, { trigger: 'on_move' });
        if (moveEffects.dirty.length > 0) {
          this.markDirty(player.id, moveEffects.dirty as DirtyFlag[]);
        }
      }

    }

    const hpBeforeMonsterTick = new Map(mapPlayers.map((player) => [player.id, player.hp] as const));
    const monsterUpdates = this.worldService.tickMonsters(mapId, mapPlayers);
    const monsterAffectedPlayerIds = new Set(monsterUpdates.dirtyPlayers ?? []);
    messages.push(...monsterUpdates.messages);
    for (const playerId of monsterAffectedPlayerIds) {
      const player = this.playerService.getPlayer(playerId);
      if (player?.isBot) {
        continue;
      }
      this.markActionsDirty(playerId);
      this.playerService.markDirty(playerId, 'attr');
    }
    for (const player of mapPlayers) {
      if ((hpBeforeMonsterTick.get(player.id) ?? player.hp) !== player.hp) {
        this.markPlayerActive(player, activePlayerIds);
      }
    }

    for (const playerId of monsterAffectedPlayerIds) {
      const player = this.playerService.getPlayer(playerId);
      if (!player || player.isBot) {
        continue;
      }
    }

    const finalMapPlayers = this.playerService.getPlayersByMap(mapId);
    for (const player of finalMapPlayers) {
      affectedPlayers.set(player.id, player);
      this.ensurePeriodicSync(player, now);
    }

    this.flushDirtyUpdates([...affectedPlayers.values()]);
    this.measureCpuSection('broadcast_messages', '广播: 系统消息分发', () => {
      this.flushMessages(messages);
    });
    this.broadcastTicks(mapId, finalMapPlayers, dt);
    this.mapService.clearDirtyTileKeys(mapId);
    this.ensureMapTicks();
  }

  private tickPausedMap(mapId: string): void {
    this.ensureMapTicks();
    const messages: WorldMessage[] = [];
    const affectedPlayers = new Map<string, PlayerState>();
    const activePlayerIds = new Set<string>();
    const gmCommands = this.measureCpuSection('gm_commands', 'GM 指令处理', () => this.gmService.drainCommands(mapId));
    if (gmCommands.length === 0) {
      return;
    }

    this.measureCpuSection('gm_commands', 'GM 指令处理', () => {
      this.processGmCommands(gmCommands, affectedPlayers, activePlayerIds, messages);
    });
    this.measureCpuSection('gm_observe_buffs', 'GM 观察 Buff 同步', () => {
      this.syncGmObservedPlayerBuffs(mapId, affectedPlayers);
    });

    if (affectedPlayers.size > 0) {
      this.flushDirtyUpdates([...affectedPlayers.values()]);
      this.broadcastTicks(mapId, this.playerService.getPlayersByMap(mapId), 0);
    }
    if (messages.length > 0) {
      this.measureCpuSection('broadcast_messages', '广播: 系统消息分发', () => {
        this.flushMessages(messages);
      });
    }
  }

  /** 确保所有已加载地图都有对应的 tick 循环 */
  private ensureMapTicks() {
    for (const mapId of this.mapService.getAllMapIds()) {
      this.startMapTick(mapId);
    }
  }

  private tickPlayerPresence(mapId: string, now: number) {
    const mapPlayers = this.playerService.getPlayersByMap(mapId);
    for (const player of mapPlayers) {
      if (player.isBot) {
        continue;
      }

      const lastHeartbeatAt = player.lastHeartbeatAt ?? 0;
      if (player.online === true && lastHeartbeatAt > 0 && now - lastHeartbeatAt > PLAYER_HEARTBEAT_TIMEOUT_MS) {
        const socket = this.playerService.getSocket(player.id);
        socket?.disconnect(true);
        this.playerService.markPlayerOffline(player.id, now);
      }

      const offlineSinceAt = player.offlineSinceAt ?? 0;
      if (player.online !== true && offlineSinceAt > 0 && now - offlineSinceAt >= this.offlinePlayerTimeoutMs) {
        this.worldService.removePlayerFromWorld(player, 'timeout');
      }
    }
  }

  private reconcilePlayersInRemovedMaps(
    affectedPlayers: Map<string, PlayerState>,
    messages: WorldMessage[],
  ): void {
    for (const player of this.playerService.getAllPlayers()) {
      if (player.inWorld === false || player.isBot || this.mapService.getMapMeta(player.mapId)) {
        continue;
      }
      affectedPlayers.set(player.id, player);
      const update = this.worldService.relocatePlayerToInitialSpawn(player, '你所在的地图已被移除，已回到初始地图复活点。');
      this.applyWorldUpdate(player.id, update, messages);
    }
  }

  private buildConsumableBuffState(
    item: NonNullable<ReturnType<ContentService['getItem']>>,
    buff: NonNullable<NonNullable<ReturnType<ContentService['getItem']>>['consumeBuffs']>[number],
    sourceRealmLv: number,
  ): TemporaryBuffState {
    const duration = Math.max(1, buff.duration);
    const infiniteDuration = buff.infiniteDuration === true;
    const sourceSkillId = buff.sourceSkillId?.trim() || `item:${item.itemId}`;
    const sourceSkillName = (sourceSkillId !== `item:${item.itemId}`
      ? this.contentService.getSkill(sourceSkillId)?.name
      : undefined) ?? item.name;
    return syncDynamicBuffPresentation({
      buffId: buff.buffId,
      name: buff.name,
      desc: buff.desc,
      baseDesc: buff.desc,
      shortMark: normalizeConsumableBuffShortMark(buff.shortMark, buff.name),
      category: buff.category ?? 'buff',
      visibility: buff.visibility ?? 'public',
      remainingTicks: infiniteDuration ? 1 : duration + 1,
      duration,
      stacks: 1,
      maxStacks: Math.max(1, buff.maxStacks ?? 1),
      sourceSkillId,
      sourceSkillName,
      realmLv: Math.max(1, Math.floor(sourceRealmLv)),
      color: buff.color,
      attrs: buff.attrs,
      attrMode: buff.attrMode,
      stats: buff.stats,
      statMode: buff.statMode,
      qiProjection: buff.qiProjection,
      presentationScale: buff.presentationScale,
      infiniteDuration,
      sustainCost: buff.sustainCost,
      sustainTicksElapsed: buff.sustainCost ? 0 : undefined,
      expireWithBuffId: buff.expireWithBuffId,
    });
  }

  private applyConsumableBuffState(targetBuffs: TemporaryBuffState[], nextBuff: TemporaryBuffState): TemporaryBuffState {
    const existing = targetBuffs.find((entry) => entry.buffId === nextBuff.buffId);
    if (existing) {
      const currentRemainingDuration = Math.max(0, existing.remainingTicks - 1);
      const addedDuration = Math.max(1, nextBuff.duration);
      existing.name = nextBuff.name;
      existing.desc = nextBuff.desc;
      existing.baseDesc = nextBuff.baseDesc;
      existing.shortMark = nextBuff.shortMark;
      existing.category = nextBuff.category;
      existing.visibility = nextBuff.visibility;
      if (nextBuff.infiniteDuration) {
        existing.duration = nextBuff.duration;
        existing.remainingTicks = nextBuff.remainingTicks;
      } else {
        existing.duration = currentRemainingDuration + addedDuration;
        existing.remainingTicks = existing.duration + 1;
      }
      existing.stacks = Math.min(nextBuff.maxStacks, existing.stacks + 1);
      existing.maxStacks = nextBuff.maxStacks;
      existing.sourceSkillId = nextBuff.sourceSkillId;
      existing.sourceSkillName = nextBuff.sourceSkillName;
      existing.realmLv = nextBuff.realmLv;
      existing.color = nextBuff.color;
      existing.attrs = nextBuff.attrs;
      existing.attrMode = nextBuff.attrMode;
      existing.stats = nextBuff.stats;
      existing.statMode = nextBuff.statMode;
      existing.qiProjection = nextBuff.qiProjection;
      existing.presentationScale = nextBuff.presentationScale;
      existing.infiniteDuration = nextBuff.infiniteDuration;
      existing.sustainCost = nextBuff.sustainCost;
      existing.sustainTicksElapsed = nextBuff.sustainTicksElapsed;
      existing.expireWithBuffId = nextBuff.expireWithBuffId;
      syncDynamicBuffPresentation(existing);
      return existing;
    }
    targetBuffs.push(syncDynamicBuffPresentation(nextBuff));
    return nextBuff;
  }

  /** 使用物品后应用其效果（恢复、增益、学功法、解锁地图等） */
  private applyItemEffect(player: PlayerState, itemId: string, messages: WorldMessage[], count = 1) {
    const item = this.contentService.getItem(itemId);
    if (!item) return;

    const actualCount = Math.max(1, Math.floor(count));
    let attrChanged = false;

    const restoredParts: string[] = [];
    if (item.healAmount || item.healPercent || item.qiPercent) {
      const previousHp = player.hp;
      const maxQi = Math.max(0, Math.round(player.numericStats?.maxQi ?? player.qi));
      const previousQi = player.qi;
      const flatHeal = item.healAmount ? item.healAmount * actualCount : 0;
      const percentHeal = item.healPercent ? Math.round(player.maxHp * item.healPercent * actualCount) : 0;
      const percentQi = item.qiPercent ? Math.round(maxQi * item.qiPercent * actualCount) : 0;
      player.hp = Math.min(player.maxHp, player.hp + flatHeal + percentHeal);
      player.qi = Math.min(maxQi, player.qi + percentQi);
      if (player.hp > previousHp) {
        restoredParts.push(`${player.hp - previousHp} 点气血`);
      }
      if (player.qi > previousQi) {
        restoredParts.push(`${player.qi - previousQi} 点真气`);
      }
      attrChanged = attrChanged || player.hp !== previousHp || player.qi !== previousQi;
    }

    if (restoredParts.length > 0) {
      messages.push({
        playerId: player.id,
        text: `你服下 ${item.name}${actualCount > 1 ? ` x${actualCount}` : ''}，恢复了 ${restoredParts.join('，')}。`,
        kind: 'loot',
      });
    }

    if (item.consumeBuffs?.length) {
      player.temporaryBuffs ??= [];
      const appliedSummaries = new Map<string, string>();
      const sourceRealmLv = Math.max(1, Math.floor(player.realm?.realmLv ?? player.realmLv ?? 1));
      for (let index = 0; index < actualCount; index += 1) {
        for (const buff of item.consumeBuffs) {
          const current = this.applyConsumableBuffState(player.temporaryBuffs, this.buildConsumableBuffState(item, buff, sourceRealmLv));
          const stackText = current.maxStacks > 1 ? `（${current.stacks}层）` : '';
          appliedSummaries.set(current.buffId, `${current.name}${stackText}，持续 ${current.duration} 息`);
        }
      }
      this.attrService.recalcPlayer(player);
      attrChanged = true;
      messages.push({
        playerId: player.id,
        text: `你炼化 ${item.name}${actualCount > 1 ? ` x${actualCount}` : ''}，获得 ${[...appliedSummaries.values()].join('、')}。`,
        kind: 'loot',
      });
    }

    if (item.tileAuraGainAmount) {
      const addedAura = item.tileAuraGainAmount * actualCount;
      const nextAura = this.mapService.addTileResourceValue(
        player.mapId,
        player.x,
        player.y,
        REFINED_AURA_RESOURCE_KEY,
        addedAura,
      );
      if (nextAura === null) {
        messages.push({ playerId: player.id, text: '此地灵脉紊乱，灵石未能生效。', kind: 'system' });
        return;
      }
      messages.push({
        playerId: player.id,
        text: `你捏碎 ${item.name}${actualCount > 1 ? ` x${actualCount}` : ''}，脚下凝练灵气增加 ${addedAura} 点。当前凝练灵气 ${nextAura}。`,
        kind: 'loot',
      });
    }

    if (item.learnTechniqueId) {
      const technique = this.contentService.getTechnique(item.learnTechniqueId);
      if (!technique) {
        messages.push({ playerId: player.id, text: '技能书内容残缺，无法参悟。', kind: 'system' });
        return;
      }
      const err = this.techniqueService.learnTechnique(
        player,
        technique.id,
        technique.name,
        technique.skills,
        technique.grade,
        technique.category,
        technique.realmLv,
        technique.layers,
      );
      if (err) {
        messages.push({ playerId: player.id, text: err, kind: 'system' });
        return;
      }
      this.markDirty(player.id, ['tech', 'actions', 'attr']);
      messages.push({
        playerId: player.id,
        text: player.cultivatingTechId === technique.id
          ? `你参悟了 ${technique.name}，并将其设为当前主修。`
          : `你参悟了 ${technique.name}。`,
        kind: 'quest',
      });
    }

    if (item.mapUnlockId) {
      const mapMeta = this.mapService.getMapMeta(item.mapUnlockId);
      if (!mapMeta) {
        messages.push({ playerId: player.id, text: '这份地图残缺不全，无法辨认对应区域。', kind: 'system' });
        return;
      }
      const unlocked = new Set(player.unlockedMinimapIds ?? []);
      unlocked.add(item.mapUnlockId);
      player.unlockedMinimapIds = [...unlocked].sort();
      messages.push({
        playerId: player.id,
        text: `你展开 ${item.name}，彻底记下了 ${mapMeta.name} 的地势。`,
        kind: 'quest',
      });
    }

    if (item.respawnBindMapId) {
      const mapId = this.mapService.resolvePlayerRespawnMapId(item.respawnBindMapId);
      const mapMeta = this.mapService.getMapMeta(mapId);
      player.respawnMapId = mapId;
      this.playerService.markDirty(player.id, 'actions');
      messages.push({
        playerId: player.id,
        text: mapMeta
          ? `你炼化 ${item.name}，命石已系向 ${mapMeta.name}，今后遁返与复活都会落在此处。`
          : `你炼化 ${item.name}，命石已改换去处。`,
        kind: 'quest',
      });
    }

    const spiritualRootSeedTier = item.itemId === HEAVEN_SPIRITUAL_ROOT_SEED_ITEM_ID
      ? 'heaven'
      : item.itemId === DIVINE_SPIRITUAL_ROOT_SEED_ITEM_ID
        ? 'divine'
        : null;
    if (spiritualRootSeedTier) {
      const result = this.techniqueService.useSpiritualRootSeed(player, spiritualRootSeedTier);
      if (result.error) {
        messages.push({
          playerId: player.id,
          text: result.error,
          kind: 'system',
        });
        return;
      }
      this.markDirty(player.id, result.dirty as DirtyFlag[]);
      for (const message of result.messages) {
        messages.push({
          playerId: player.id,
          text: message.text,
          kind: message.kind ?? 'system',
        });
      }
    }

    if (item.itemId === SHATTER_SPIRIT_PILL_ITEM_ID) {
      const result = this.techniqueService.useShatterSpiritPill(player);
      if (result.error) {
        messages.push({
          playerId: player.id,
          text: result.error,
          kind: 'system',
        });
        return;
      }
      this.markDirty(player.id, result.dirty as DirtyFlag[]);
      for (const message of result.messages) {
        messages.push({
          playerId: player.id,
          text: message.text,
          kind: message.kind ?? 'system',
        });
      }
    }

    if (item.itemId === WANGSHENG_PILL_ITEM_ID) {
      const result = this.techniqueService.useWangshengPill(player);
      if (result.error) {
        messages.push({
          playerId: player.id,
          text: result.error,
          kind: 'system',
        });
        return;
      }
      this.markDirty(player.id, result.dirty as DirtyFlag[]);
      for (const message of result.messages) {
        messages.push({
          playerId: player.id,
          text: message.text,
          kind: message.kind ?? 'system',
        });
      }
    }

    if (attrChanged) {
      this.playerService.markDirty(player.id, 'attr');
    }
  }

  private getUnlockedMinimapIds(player: PlayerState): string[] {
    return [...new Set((player.unlockedMinimapIds ?? []).filter((entry): entry is string => typeof entry === 'string' && entry.length > 0))].sort();
  }

  private measureCpuSection<T>(key: string, label: string, work: () => T): T {
    const startedAt = process.hrtime.bigint();
    try {
      return work();
    } finally {
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      this.performanceService.recordCpuSection(elapsedMs, key, label);
    }
  }

  private buildMinimapLibrarySignature(unlockedMinimapIds: string[]): string {
    if (unlockedMinimapIds.length === 0) {
      return '';
    }
    return unlockedMinimapIds
      .map((mapId) => `${mapId}:${this.mapService.getMinimapSignature(mapId)}`)
      .join('|');
  }

  /** 将 WorldUpdate 的结果（错误、消息、脏标记）合并到当前 tick 上下文 */
  private applyWorldUpdate(playerId: string, update: WorldUpdate, messages: WorldMessage[]) {
    if (update.error) {
      messages.push({ playerId, text: update.error, kind: 'system' });
    }
    messages.push(...update.messages);
    this.markDirty(playerId, update.dirty as DirtyFlag[]);
    for (const dirtyPlayerId of update.dirtyPlayers ?? []) {
      this.playerService.markDirty(dirtyPlayerId, 'attr');
      this.markActionsDirty(dirtyPlayerId);
    }
  }

  private emitQuestNavigateResult(playerId: string, payload: S2C_QuestNavigateResult): void {
    this.playerService.getSocket(playerId)?.emit(S2C.QuestNavigateResult, payload);
  }

  private confirmQuestNavigation(player: PlayerState, navigation: NonNullable<PlayerState['questNavigation']>): void {
    if (navigation.pendingConfirmation !== true) {
      return;
    }
    navigation.pendingConfirmation = undefined;
    this.emitQuestNavigateResult(player.id, { questId: navigation.questId, ok: true });
  }

  private rejectQuestNavigation(player: PlayerState, questId: string, error: string): void {
    this.emitQuestNavigateResult(player.id, { questId, ok: false, error });
  }

  /** 检测玩家踩到自动传送点时触发地图切换 */
  private applyAutoTravelIfNeeded(player: PlayerState, messages: WorldMessage[]): boolean {
    const update = this.worldService.tryAutoTravel(player);
    if (!update) {
      return false;
    }
    if (player.questNavigation?.questId) {
      this.applyQuestCrossMapCooldown(player);
    }
    this.applyWorldUpdate(player.id, update, messages);
    return true;
  }

  private processQuestNavigation(player: PlayerState, messages: WorldMessage[]): void {
    const navigation = player.questNavigation;
    if (!navigation?.questId) {
      return;
    }

    const quest = player.quests.find((entry) => entry.id === navigation.questId && entry.status !== 'completed');
    if (!quest) {
      if (navigation.pendingConfirmation === true) {
        this.rejectQuestNavigation(player, navigation.questId, '目标任务不存在或已完成');
      }
      player.questNavigation = undefined;
      this.navigationService.clearMoveTarget(player.id);
      return;
    }

    const goal = this.resolveQuestNavigationGoal(player, quest);
    if (!goal) {
      const error = '该任务暂时没有可导航的目标地点';
      messages.push({ playerId: player.id, text: error, kind: 'system' });
      this.rejectQuestNavigation(player, navigation.questId, error);
      player.questNavigation = undefined;
      this.navigationService.clearMoveTarget(player.id);
      return;
    }

    if (player.mapId === goal.mapId) {
      navigation.pausedForCrossMapCooldown = false;
      navigation.lastBlockedRemainingTicks = undefined;
      if (goal.kind === 'map') {
        this.navigationService.clearMoveTarget(player.id);
        this.confirmQuestNavigation(player, navigation);
        player.questNavigation = undefined;
        messages.push({ playerId: player.id, text: `已抵达 ${goal.mapLabel ?? goal.mapId}，请继续完成任务。`, kind: 'quest' });
        return;
      }
      if (player.x === goal.x && player.y === goal.y) {
        this.navigationService.clearMoveTarget(player.id);
        this.confirmQuestNavigation(player, navigation);
        player.questNavigation = undefined;
        return;
      }
      const error = this.navigationService.setMoveTarget(player, goal.x, goal.y, { allowNearestReachable: true });
      if (error) {
        messages.push({ playerId: player.id, text: error, kind: 'system' });
        this.rejectQuestNavigation(player, navigation.questId, error);
        player.questNavigation = undefined;
      } else {
        this.confirmQuestNavigation(player, navigation);
      }
      return;
    }

    const nextPortal = this.findNextPortalTowardsMap(player.mapId, goal.mapId);
    if (!nextPortal) {
      const error = `无法从当前地图前往 ${goal.mapLabel ?? goal.mapId}`;
      messages.push({ playerId: player.id, text: error, kind: 'system' });
      this.rejectQuestNavigation(player, navigation.questId, error);
      player.questNavigation = undefined;
      this.navigationService.clearMoveTarget(player.id);
      return;
    }

    const remainingTicks = this.getQuestCrossMapCooldownRemaining(player);
    if (remainingTicks > 0) {
      this.confirmQuestNavigation(player, navigation);
      if (navigation.pausedForCrossMapCooldown !== true) {
        messages.push({ playerId: player.id, text: `跨图导航冷却中，还需 ${remainingTicks} 息。`, kind: 'system' });
      }
      navigation.pausedForCrossMapCooldown = true;
      navigation.lastBlockedRemainingTicks = remainingTicks;
      this.navigationService.clearMoveTarget(player.id);
      return;
    }
    navigation.pausedForCrossMapCooldown = false;
    navigation.lastBlockedRemainingTicks = undefined;

    if (player.x === nextPortal.x && player.y === nextPortal.y) {
      if (nextPortal.trigger === 'manual') {
        const update = this.worldService.travelThroughManualPortalAtCurrentPosition(player, nextPortal.targetMapId);
        if (!update) {
          const error = '当前传送点无法使用';
          messages.push({ playerId: player.id, text: error, kind: 'system' });
          this.rejectQuestNavigation(player, navigation.questId, error);
          player.questNavigation = undefined;
          return;
        }
        this.confirmQuestNavigation(player, navigation);
        this.applyQuestCrossMapCooldown(player);
        this.applyWorldUpdate(player.id, update, messages);
      } else {
        this.confirmQuestNavigation(player, navigation);
      }
      return;
    }

    const error = this.navigationService.setMoveTarget(player, nextPortal.x, nextPortal.y, { allowNearestReachable: true });
    if (error) {
      messages.push({ playerId: player.id, text: error, kind: 'system' });
      this.rejectQuestNavigation(player, navigation.questId, error);
      player.questNavigation = undefined;
    } else {
      this.confirmQuestNavigation(player, navigation);
    }
  }

  private resolveQuestNavigationGoal(
    player: PlayerState,
    quest: PlayerState['quests'][number],
  ): { kind: 'point'; mapId: string; x: number; y: number; mapLabel?: string } | { kind: 'map'; mapId: string; mapLabel?: string } | null {
    if (quest.status === 'ready') {
      const submitMapId = quest.submitMapId ?? quest.giverMapId;
      if (!submitMapId) {
        return null;
      }
      const submitX = quest.submitX ?? quest.giverX;
      const submitY = quest.submitY ?? quest.giverY;
      const submitMapName = quest.submitMapName ?? quest.giverMapName;
      if (submitX !== undefined && submitY !== undefined) {
        return { kind: 'point', mapId: submitMapId, x: submitX, y: submitY, mapLabel: submitMapName };
      }
      return { kind: 'map', mapId: submitMapId, mapLabel: submitMapName };
    }

    const explicitTargetMapId = quest.targetMapId;
    const targetMapName = quest.targetMapName;
    if (explicitTargetMapId && quest.targetX !== undefined && quest.targetY !== undefined) {
      return { kind: 'point', mapId: explicitTargetMapId, x: quest.targetX, y: quest.targetY, mapLabel: targetMapName };
    }

    switch (quest.objectiveType) {
      case 'talk':
        if (explicitTargetMapId && quest.targetX !== undefined && quest.targetY !== undefined) {
          return { kind: 'point', mapId: explicitTargetMapId, x: quest.targetX, y: quest.targetY, mapLabel: targetMapName };
        }
        if (explicitTargetMapId) {
          return { kind: 'map', mapId: explicitTargetMapId, mapLabel: targetMapName };
        }
        return null;
      case 'kill': {
        const killMapId = quest.targetMapId ?? quest.giverMapId;
        if (!killMapId || !quest.targetMonsterId) {
          return null;
        }
        const spawn = this.mapService.getMonsterSpawnInMap(killMapId, quest.targetMonsterId);
        if (!spawn) {
          return null;
        }
        return {
          kind: 'point',
          mapId: killMapId,
          x: spawn.x,
          y: spawn.y,
          mapLabel: targetMapName ?? this.mapService.getMapMeta(killMapId)?.name,
        };
      }
      case 'submit_item':
        if (explicitTargetMapId) {
          return { kind: 'map', mapId: explicitTargetMapId, mapLabel: targetMapName };
        }
        return null;
      case 'learn_technique':
      case 'realm_progress':
      case 'realm_stage':
      default:
        if (explicitTargetMapId) {
          return { kind: 'map', mapId: explicitTargetMapId, mapLabel: targetMapName };
        }
        return null;
    }
  }

  private findNextPortalTowardsMap(
    startMapId: string,
    targetMapId: string,
    allowedRouteDomains: readonly MapRouteDomain[] = DEFAULT_SYSTEM_ROUTE_DOMAINS,
  ) {
    if (startMapId === targetMapId) {
      return undefined;
    }
    if (!this.mapService.isMapRouteDomainAllowed(targetMapId, allowedRouteDomains)) {
      return undefined;
    }
    const visited = new Set<string>([startMapId]);
    const queue: string[] = [startMapId];
    const firstPortalByMap = new Map<string, ReturnType<MapService['getPortals']>[number]>();
    while (queue.length > 0) {
      const mapId = queue.shift()!;
      for (const portal of this.mapService.getPortals(mapId, { allowedRouteDomains })) {
        if (portal.hidden || visited.has(portal.targetMapId)) {
          continue;
        }
        if (!this.mapService.isMapRouteDomainAllowed(portal.targetMapId, allowedRouteDomains)) {
          continue;
        }
        const initialPortal = mapId === startMapId ? portal : firstPortalByMap.get(mapId);
        if (!initialPortal) {
          continue;
        }
        if (portal.targetMapId === targetMapId) {
          return initialPortal;
        }
        visited.add(portal.targetMapId);
        firstPortalByMap.set(portal.targetMapId, initialPortal);
        queue.push(portal.targetMapId);
      }
    }
    return undefined;
  }

  private getQuestCrossMapCooldownRemaining(player: PlayerState): number {
    const now = player.lifeElapsedTicks ?? 0;
    const until = player.questCrossMapNavCooldownUntilLifeTicks ?? 0;
    return Math.max(0, Math.ceil(until - now));
  }

  private applyQuestCrossMapCooldown(player: PlayerState): void {
    const now = player.lifeElapsedTicks ?? 0;
    player.questCrossMapNavCooldownUntilLifeTicks = Math.max(
      player.questCrossMapNavCooldownUntilLifeTicks ?? 0,
      now + QUEST_CROSS_MAP_NAV_COOLDOWN_TICKS,
    );
  }

  /** 将修炼中断的结果（脏标记、消息）合并到 tick 上下文 */
  private applyCultivationResult(playerId: string, result: ReturnType<TechniqueService['interruptCultivation']>, messages: WorldMessage[]) {
    if (!result.changed) {
      return;
    }
    this.markDirty(playerId, result.dirty as DirtyFlag[]);
    for (const message of result.messages) {
      messages.push({ playerId, text: message.text, kind: message.kind });
    }
  }

  /** 标记玩家为活跃状态，重置闲置计时 */
  private markPlayerActive(player: PlayerState, activePlayerIds: Set<string>) {
    player.idleTicks = 0;
    activePlayerIds.add(player.id);
  }

  /** 闲置超过阈值时自动开始修炼 */
  private tryStartIdleCultivation(player: PlayerState, activePlayerIds: Set<string>, messages: WorldMessage[]) {
    if (
      player.dead
      || player.autoIdleCultivation === false
      || this.navigationService.hasMoveTarget(player.id)
      || Boolean(player.questNavigation?.questId)
      || this.techniqueService.hasCultivationBuff(player)
    ) {
      player.idleTicks = 0;
      return;
    }

    if (activePlayerIds.has(player.id)) {
      player.idleTicks = 0;
      return;
    }

    player.idleTicks = (player.idleTicks ?? 0) + 1;
    if (player.idleTicks < AUTO_IDLE_CULTIVATION_DELAY_TICKS) {
      return;
    }

    player.idleTicks = 0;
    const result = this.techniqueService.startCultivation(player);
    if (!result.changed) {
      return;
    }
    this.markDirty(player.id, result.dirty as DirtyFlag[]);
    for (const message of result.messages) {
      messages.push({ playerId: player.id, text: message.text, kind: message.kind });
    }
  }

  private markDirty(playerId: string, flags: DirtyFlag[]) {
    for (const flag of flags) {
      if (flag === 'actions') {
        this.markActionsDirty(playerId);
        continue;
      }
      this.playerService.markDirty(playerId, flag);
    }
  }

  private processGmCommands(
    commands: ReturnType<GmService['drainCommands']>,
    affectedPlayers: Map<string, PlayerState>,
    activePlayerIds: Set<string>,
    messages: WorldMessage[],
  ): void {
    for (const command of commands) {
      const error = this.gmService.applyCommand(command);
      if (!error) {
        if ('playerId' in command && typeof command.playerId === 'string') {
          const player = this.playerService.getPlayer(command.playerId);
          if (player) {
            affectedPlayers.set(player.id, player);
            this.markPlayerActive(player, activePlayerIds);
            this.forcedTickSyncPlayers.add(player.id);
            this.resetPlayerSyncState(player.id);
          }
        }
        continue;
      }

      if ('playerId' in command && typeof command.playerId === 'string') {
        messages.push({ playerId: command.playerId, text: error, kind: 'system' });
      }
    }
  }

  private syncGmObservedPlayerBuffs(
    mapId: string,
    affectedPlayers: Map<string, PlayerState>,
  ): void {
    const changedPlayerIds = this.gmService.syncObservedPlayerBuffs(mapId);
    for (const playerId of changedPlayerIds) {
      const player = this.playerService.getPlayer(playerId);
      if (!player) {
        continue;
      }
      affectedPlayers.set(player.id, player);
      this.playerService.markDirty(player.id, 'attr');
    }
  }

  private markActionsDirty(playerId: string): void {
    this.cooldownOnlyActionDirtyPlayers.delete(playerId);
    this.playerService.markDirty(playerId, 'actions');
  }

  private markActionCooldownDirty(playerId: string): void {
    const flags = this.playerService.getDirtyFlags(playerId);
    this.playerService.markDirty(playerId, 'actions');
    if (!flags?.has('actions')) {
      this.cooldownOnlyActionDirtyPlayers.add(playerId);
    }
  }

  private ensurePeriodicSync(player: PlayerState, now: number): void {
    const lastSyncAt = this.lastPeriodicSyncAt.get(player.id);
    if (lastSyncAt === undefined) {
      this.lastPeriodicSyncAt.set(player.id, now);
      return;
    }
    if (now - lastSyncAt < PERIODIC_SYNC_INTERVAL_MS) {
      return;
    }

    this.lastPeriodicSyncAt.set(player.id, now);
    this.forcedTickSyncPlayers.add(player.id);
    this.resetPlayerSyncState(player.id);
    this.markDirty(player.id, [...PERIODIC_SYNC_DIRTY_FLAGS]);
  }

  /** 重新构建玩家的可用行动列表，返回是否发生变化 */
  private syncActions(player: PlayerState, options?: SyncActionsOptions): boolean {
    const before = this.measureCpuSection('state_actions_before', '动作重建: 重建前快照', () => (
      this.captureActionSyncState(player.actions)
    ));
    const contextActions = this.measureCpuSection('state_actions_context', '动作重建: 场景动作收集', () => (
      this.worldService.getContextActions(player, { skipQuestSync: options?.skipQuestSync })
    ));
    this.measureCpuSection('state_actions_core', '动作重建: 核心构建', () => {
      this.actionService.rebuildActions(player, contextActions);
    });
    const after = this.measureCpuSection('state_actions_after', '动作重建: 重建后快照', () => (
      this.captureActionSyncState(player.actions)
    ));
    return !isPlainEqual(before, after);
  }

  /**
   * 只在 actions 已被标脏时才重建动作列表，避免每 tick 对所有玩家无条件重建。
   */
  private syncActionsIfDirty(player: PlayerState, options?: SyncActionsOptions): boolean {
    const flags = this.playerService.getDirtyFlags(player.id);
    if (!flags?.has('actions') || this.cooldownOnlyActionDirtyPlayers.has(player.id)) {
      return false;
    }
    return this.syncActions(player, options);
  }

  /**
   * 即时执行不涉及位置竞争的玩家操作，立即推送结果。
   * 由 gateway 在 socket 事件处理器中直接调用。
   */
  executeImmediate(player: PlayerState, type: ImmediateCommandType, data: unknown): void {
    if (!player || player.inWorld === false || player.dead) return;

    const messages: WorldMessage[] = [];

    switch (type) {
      case 'useItem': {
        const { slotIndex, count } = data as { slotIndex: number; count?: number };
        const item = this.inventoryService.getItem(player, slotIndex);
        if (!item) {
          messages.push({ playerId: player.id, text: '物品不存在', kind: 'system' });
          break;
        }
        const requestedCount = Number.isInteger(count) ? Number(count) : 1;
        if (requestedCount <= 0) {
          messages.push({ playerId: player.id, text: '使用数量无效', kind: 'system' });
          break;
        }
        const itemDef = this.contentService.getItem(item.itemId);
        if (requestedCount > 1 && itemDef?.allowBatchUse !== true) {
          messages.push({ playerId: player.id, text: '该物品不支持批量使用', kind: 'system' });
          break;
        }
        if (itemDef?.learnTechniqueId && player.techniques.some((technique) => technique.techId === itemDef.learnTechniqueId)) {
          messages.push({ playerId: player.id, text: '你已经学会这门功法了。', kind: 'system' });
          break;
        }
        if (itemDef?.mapUnlockId && (player.unlockedMinimapIds ?? []).includes(itemDef.mapUnlockId)) {
          const mapMeta = this.mapService.getMapMeta(itemDef.mapUnlockId);
          messages.push({
            playerId: player.id,
            text: mapMeta ? `${mapMeta.name} 的地图你早已记下。` : '这份地图你早已记下。',
            kind: 'system',
          });
          break;
        }
        if (itemDef?.respawnBindMapId && this.mapService.resolvePlayerRespawnMapId(player.respawnMapId) === itemDef.respawnBindMapId) {
          const mapMeta = this.mapService.getMapMeta(itemDef.respawnBindMapId);
          messages.push({
            playerId: player.id,
            text: mapMeta ? `你的命石早已系在 ${mapMeta.name}。` : '你的命石早已系在此处。',
            kind: 'system',
          });
          break;
        }
        if (itemDef?.tileAuraGainAmount && this.mapService.isPlayerOverlapTile(player.mapId, player.x, player.y)) {
          messages.push({
            playerId: player.id,
            text: '当前位于安全区、出生点或传送点附近，无法使用灵石。',
            kind: 'system',
          });
          break;
        }
        if (itemDef?.spiritualRootSeedTier) {
          const seedUseError = this.techniqueService.canUseSpiritualRootSeed(
            player,
            itemDef.spiritualRootSeedTier,
          );
          if (seedUseError) {
            messages.push({ playerId: player.id, text: seedUseError, kind: 'system' });
            break;
          }
        }
        if (itemDef?.itemId === SHATTER_SPIRIT_PILL_ITEM_ID) {
          const shatterSpiritPillError = this.techniqueService.canUseShatterSpiritPill(player);
          if (shatterSpiritPillError) {
            messages.push({ playerId: player.id, text: shatterSpiritPillError, kind: 'system' });
            break;
          }
        }
        const useErr = this.inventoryService.useItem(player, slotIndex, requestedCount);
        if (useErr) {
          messages.push({ playerId: player.id, text: useErr, kind: 'system' });
          break;
        }
        this.playerService.markDirty(player.id, 'inv');
        this.applyItemEffect(player, item.itemId, messages, requestedCount);
        break;
      }
      case 'dropItem': {
        const { slotIndex, count } = data as { slotIndex: number; count: number };
        const dropped = this.inventoryService.dropItem(player, slotIndex, count);
        if (!dropped) {
          messages.push({ playerId: player.id, text: '物品不存在或数量不足', kind: 'system' });
          break;
        }
        this.playerService.markDirty(player.id, 'inv');
        const container = this.mapService.getContainerAt(player.mapId, player.x, player.y);
        const dirtyPlayerIds = container
          ? this.lootService.dropToContainer(player.mapId, container.id, dropped)
          : this.lootService.dropToGround(player.mapId, player.x, player.y, dropped);
        // 其他玩家的 loot 脏标记留给下一次 tick 推送
        for (const dirtyPlayerId of dirtyPlayerIds) {
          this.playerService.markDirty(dirtyPlayerId, 'loot');
        }
        messages.push({
          playerId: player.id,
          text: container
            ? `你将 ${dropped.name} x${dropped.count} 放进了 ${container.name}。`
            : `你将 ${dropped.name} x${dropped.count} 丢在了地上。`,
          kind: 'loot',
        });
        break;
      }
      case 'destroyItem': {
        const { slotIndex, count } = data as { slotIndex: number; count: number };
        const destroyed = this.inventoryService.destroyItem(player, slotIndex, count);
        if (!destroyed) {
          messages.push({ playerId: player.id, text: '物品不存在或数量不足', kind: 'system' });
          break;
        }
        this.playerService.markDirty(player.id, 'inv');
        messages.push({
          playerId: player.id,
          text: `你摧毁了 ${destroyed.name} x${destroyed.count}。`,
          kind: 'system',
        });
        break;
      }
      case 'sortInventory': {
        this.inventoryService.sortInventory(player);
        this.playerService.markDirty(player.id, 'inv');
        messages.push({ playerId: player.id, text: '背包已整理', kind: 'system' });
        break;
      }
      case 'equip': {
        const { slotIndex } = data as { slotIndex: number };
        const equipErr = this.equipmentService.equip(player, slotIndex);
        if (!equipErr) {
          this.markDirty(player.id, ['inv', 'equip', 'attr']);
        } else {
          messages.push({ playerId: player.id, text: equipErr, kind: 'system' });
        }
        break;
      }
      case 'unequip': {
        const { slot } = data as { slot: string };
        const unequipErr = this.equipmentService.unequip(player, slot as any);
        if (!unequipErr) {
          this.markDirty(player.id, ['inv', 'equip', 'attr']);
        } else {
          messages.push({ playerId: player.id, text: unequipErr, kind: 'system' });
        }
        break;
      }
      case 'cultivate': {
        const { techId } = data as { techId: string | null };
        if (!techId) {
          player.cultivatingTechId = undefined;
          messages.push({
            playerId: player.id,
            text: this.techniqueService.hasCultivationBuff(player)
              ? '你收束原本主修的行功路数，继续以无主修状态修炼；后续功法经验将直接转入炼体。'
              : '你收束气机，取消了当前主修功法。',
            kind: 'quest',
          });
          this.playerService.markDirty(player.id, 'tech');
          this.markActionsDirty(player.id);
          break;
        }

        const technique = player.techniques.find((entry) => entry.techId === techId);
        if (!technique) {
          messages.push({ playerId: player.id, text: '尚未掌握该功法，无法设为主修。', kind: 'system' });
          break;
        }

        player.cultivatingTechId = techId;
        messages.push({ playerId: player.id, text: `你将 ${technique.name} 设为当前主修，修炼与战斗所得功法经验都会优先流入此法。`, kind: 'quest' });
        this.playerService.markDirty(player.id, 'tech');
        this.markActionsDirty(player.id);
        break;
      }
      case 'updateAutoBattleSkills': {
        const { skills } = data as { skills: AutoBattleSkillConfig[] };
        if (this.actionService.updateAutoBattleSkills(player, skills)) {
          this.markActionsDirty(player.id);
        }
        break;
      }
      case 'updateAutoBattleTargetingMode': {
        const { mode } = data as { mode: PlayerState['autoBattleTargetingMode'] };
        const nextMode = normalizeAutoBattleTargetingMode(mode, player.autoBattleTargetingMode);
        if (player.autoBattleTargetingMode !== nextMode) {
          player.autoBattleTargetingMode = nextMode;
          this.markActionsDirty(player.id);
        }
        break;
      }
      case 'updateTechniqueSkillAvailability': {
        const { techId, enabled } = data as { techId: string; enabled: boolean };
        if (this.techniqueService.setTechniqueSkillsEnabled(player, techId, enabled)) {
          this.playerService.markDirty(player.id, 'tech');
          this.markActionsDirty(player.id);
        }
        break;
      }
    }

    // 即时推送操作者自身的脏数据
    this.flushPlayerDirtyUpdates(player);
    // 即时推送操作者的系统消息
    this.flushImmediateMessages(player.id, messages);
  }

  flushPlayerState(player: PlayerState): void {
    this.flushPlayerDirtyUpdates(player);
  }

  flushPlayerMessages(playerId: string, messages: WorldMessage[]): void {
    this.flushImmediateMessages(playerId, messages);
  }

  /** 将所有脏标记对应的数据变更推送给各玩家客户端 */
  private flushDirtyUpdates(players: PlayerState[]) {
    for (const player of players) {
      this.flushPlayerDirtyUpdates(player);
    }
  }

  /** 推送单个玩家的脏标记数据并清除标记 */
  private flushPlayerDirtyUpdates(player: PlayerState) {
    if (this.shouldFlushPendingSpecialStats(player.id)) {
      this.playerService.markDirty(player.id, 'attr');
    }
    const flags = this.playerService.getDirtyFlags(player.id);
    if (!flags || flags.size === 0) return;
    const needsProgressionSync =
      flags.has('attr')
      || flags.has('inv')
      || flags.has('equip')
      || flags.has('tech')
      || flags.has('actions');
    if (needsProgressionSync) {
      this.techniqueService.initializePlayerProgression(player);
    }
    if (
      player.realm?.breakthroughReady
      && (flags.has('inv') || flags.has('equip') || flags.has('tech'))
    ) {
      flags.add('attr');
    }
    const socket = this.playerService.getSocket(player.id);
    if (!socket) return;

    if (flags.has('attr') || flags.has('inv') || flags.has('equip') || flags.has('tech')) {
      const realmUpdate = this.buildRealmUpdate(player.id, player.realm ?? null);
      if (realmUpdate) {
        socket.emit(S2C.RealmUpdate, realmUpdate);
      }
    }

    if (flags.has('attr')) {
      this.measureCpuSection('state_sync_attr', '状态同步: 属性面板', () => {
        const update = this.buildSparseAttrUpdate(player.id, this.captureAttrUpdateState(player));
        if (update) {
          socket.emit(S2C.AttrUpdate, update);
        }
      });
    }
    if (flags.has('inv')) {
      this.measureCpuSection('state_sync_inventory', '状态同步: 背包与装备', () => {
        const update = this.buildSparseInventoryUpdate(player.id, player.inventory);
        if (update) {
          socket.emit(S2C.InventoryUpdate, update);
        }
      });
    }
    if (flags.has('equip')) {
      this.measureCpuSection('state_sync_inventory', '状态同步: 背包与装备', () => {
        const update = this.buildSparseEquipmentUpdate(player.id, player.equipment);
        if (update) {
          socket.emit(S2C.EquipmentUpdate, update);
        }
      });
    }
    if (flags.has('tech')) {
      this.measureCpuSection('state_sync_tech', '状态同步: 功法面板', () => {
        const update = this.buildSparseTechniqueUpdate(player);
        if (update) {
          socket.emit(S2C.TechniqueUpdate, update);
        }
      });
    }
    if (flags.has('actions')) {
      this.syncActionsIfDirty(player, { skipQuestSync: true });
      this.measureCpuSection('state_sync_actions', '状态同步: 动作面板', () => {
        const update = this.buildSparseActionsUpdate(player);
        if (update) {
          socket.emit(S2C.ActionsUpdate, update);
        }
      });
    }
    if (flags.has('loot')) {
      this.measureCpuSection('state_sync_loot', '状态同步: 掉落面板', () => {
        const update: S2C_LootWindowUpdate = {
          window: this.lootService.buildLootWindow(player),
        };
        socket.emit(S2C.LootWindowUpdate, update);
      });
    }
    if (flags.has('quest')) {
      this.measureCpuSection('state_sync_quest', '状态同步: 任务面板', () => {
        const update: S2C_QuestUpdate = {
          quests: player.quests.map((quest) => ({
            id: quest.id,
            status: quest.status,
            progress: quest.progress,
          })),
        };
        socket.emit(S2C.QuestUpdate, update);
      });
    }

    this.playerService.clearDirtyFlags(player.id);
    this.cooldownOnlyActionDirtyPlayers.delete(player.id);
  }

  /** 即时推送指定玩家的系统消息 */
  private flushImmediateMessages(playerId: string, messages: WorldMessage[]) {
    if (messages.length === 0) return;
    const socket = this.playerService.getSocket(playerId);
    if (!socket) return;
    this.measureCpuSection('broadcast_messages', '广播: 系统消息分发', () => {
      for (const msg of messages) {
        if (msg.playerId !== playerId) continue;
        const payload: S2C_SystemMsg = {
          text: msg.text,
          kind: msg.kind,
          floating: msg.floating,
        };
        socket.emit(S2C.SystemMsg, payload);
      }
    });
  }

  /** 将本 tick 产生的系统消息逐条推送给对应玩家 */
  private flushMessages(messages: WorldMessage[]) {
    for (const message of messages) {
      const socket = this.playerService.getSocket(message.playerId);
      if (!socket) continue;
      const payload: S2C_SystemMsg = {
        text: message.text,
        kind: message.kind,
        floating: message.floating,
      };
      socket.emit(S2C.SystemMsg, payload);
    }
  }

  /** 向地图内所有玩家广播增量 tick 数据包（视野、实体、地块、特效等） */
  private broadcastTicks(mapId: string, players: PlayerState[], dt: number) {
    const effects = this.measureCpuSection('broadcast_effects', '广播: 特效提取', () => (
      this.worldService.drainEffects(mapId)
    ));
    for (const viewer of players) {
      const socket = this.playerService.getSocket(viewer.id);
      if (!socket) continue;
      const forceSync = this.forcedTickSyncPlayers.delete(viewer.id);
      const time = this.measureCpuSection('broadcast_time', '广播: 时间状态构建', () => (
        this.timeService.buildPlayerTimeState(viewer)
      ));
      const visibility = this.measureCpuSection('broadcast_aoi', '广播: AOI 可见性', () => (
        this.aoiService.getVisibility(viewer, time.effectiveViewRange)
      ));
      const clientVisibleTiles = this.measureCpuSection('broadcast_patch_tiles_transform', '地块 Patch: 客户端视图转换', () => (
        this.toClientVisibleTiles(viewer, visibility.tiles)
      ));
      const overlayParentMapId = this.mapService.getOverlayParentMapId(viewer.mapId);

      const visiblePlayers = this.measureCpuSection('broadcast_players', '广播: 玩家实体构建', () => (
        players
          .filter((player) => visibility.visibleKeys.has(`${player.x},${player.y}`))
          .map((player) => this.worldService.buildPlayerRenderEntity(
            viewer,
            player,
            player.id === viewer.id ? '#ff0' : player.isBot ? '#6bb8ff' : '#0f0',
          ))
      ));
      if (overlayParentMapId) {
        const projectedParentPlayers = this.measureCpuSection('broadcast_players', '广播: 玩家实体构建', () => (
          this.playerService.getPlayersByMap(overlayParentMapId)
            .flatMap((player) => {
              const projected = this.mapService.projectPointToMap(viewer.mapId, overlayParentMapId, player.x, player.y);
              if (!projected || this.mapService.isPointInMapBounds(viewer.mapId, projected.x, projected.y)) {
                return [];
              }
              if (!visibility.visibleKeys.has(`${projected.x},${projected.y}`)) {
                return [];
              }
              return [{
                ...this.worldService.buildPlayerRenderEntity(
                  viewer,
                  player,
                  player.id === viewer.id ? '#ff0' : player.isBot ? '#6bb8ff' : '#0f0',
                ),
                x: projected.x,
                y: projected.y,
              }];
            })
        ));
        visiblePlayers.push(...projectedParentPlayers);
      }
      const crowdedVisiblePlayers = this.measureCpuSection('broadcast_players', '广播: 玩家实体聚合', () => (
        this.worldService.buildCrowdedPlayerRenderEntities(visiblePlayers, viewer.id)
      ));

      const visibleEntities = this.measureCpuSection('broadcast_entities', '广播: 环境实体构建', () => (
        this.worldService.getVisibleEntities(viewer, visibility.visibleKeys)
      ));
      if (overlayParentMapId) {
        visibleEntities.push(...this.measureCpuSection('broadcast_entities', '广播: 环境实体构建', () => (
          this.worldService.getProjectedVisibleEntities(viewer, overlayParentMapId, visibility.visibleKeys)
        )));
      }
      const visibleGroundPiles = this.measureCpuSection('broadcast_ground', '广播: 地面掉落构建', () => (
        this.lootService.getVisibleGroundPiles(viewer, visibility.visibleKeys)
      ));
      if (overlayParentMapId) {
        visibleGroundPiles.push(...this.measureCpuSection('broadcast_ground', '广播: 地面掉落构建', () => (
          this.lootService.getProjectedVisibleGroundPiles(
            overlayParentMapId,
            visibility.visibleKeys,
            (x, y) => {
              const projected = this.mapService.projectPointToMap(viewer.mapId, overlayParentMapId, x, y);
              if (!projected || this.mapService.isPointInMapBounds(viewer.mapId, projected.x, projected.y)) {
                return null;
              }
              return projected;
            },
          )
        )));
      }

      let previous = this.lastSentTickState.get(viewer.id);
      const pathVersion = this.navigationService.getPathVersion(viewer.id);
      const mapChanged = previous?.mapId !== viewer.mapId;
      if (mapChanged) {
        this.resetPlayerMapSyncState(viewer.id);
        previous = undefined;
      }
      const visibilityKey = this.buildVisibilityKey(viewer, time.effectiveViewRange);
      const visibilityChanged = !previous || previous.visibilityKey !== visibilityKey;
      const canUseDirtyTilePatches = !overlayParentMapId;
      const tilePatchRevision = canUseDirtyTilePatches
        ? this.mapService.getTilePatchRevision(viewer.mapId)
        : undefined;
      const mapMeta = this.mapService.getMapMeta(viewer.mapId);
      const unlockedMinimapIds = this.getUnlockedMinimapIds(viewer);
      const minimapSignature = unlockedMinimapIds.includes(viewer.mapId)
        ? this.mapService.getMinimapSignature(viewer.mapId)
        : '';
      const minimapLibrarySignature = this.buildMinimapLibrarySignature(unlockedMinimapIds);
      const visibleEntityIds = new Set([...crowdedVisiblePlayers, ...visibleEntities].map((entity) => entity.id));
      const visibleThreatArrows = this.measureCpuSection('broadcast_entities', '广播: 仇恨箭头构建', () => (
        this.worldService.getVisibleThreatArrowRefs(
          overlayParentMapId ? [viewer.mapId, overlayParentMapId] : [viewer.mapId],
          visibleEntityIds,
        ).map(({ ownerId, targetId }) => [ownerId, targetId] as [string, string])
      ));
      const visibleMinimapMarkers = visibilityChanged
        ? this.mapService.getVisibleMinimapMarkers(viewer.mapId, visibility.visibleKeys)
        : (previous?.visibleMinimapMarkers ?? []);
      const tileOriginX = viewer.x - time.effectiveViewRange;
      const tileOriginY = viewer.y - time.effectiveViewRange;
      const groundPilePatches = this.measureCpuSection('broadcast_patch_ground', '广播: 掉落差量 Patch', () => (
        this.buildSparseGroundPiles(viewer.id, visibleGroundPiles)
      ));
      // 首次同步或缓存缺失时才发送完整视野；移动/视野半径变化优先走 tile patch。
      const shouldSendFullVisibility = !previous || !this.lastSentVisibleTiles.has(viewer.id);
      const tilePatches = shouldSendFullVisibility
        ? []
        : visibilityChanged
          ? this.buildSparseVisibleTilePatches(
            viewer.id,
            clientVisibleTiles,
            tileOriginX,
            tileOriginY,
          )
          : canUseDirtyTilePatches
            ? previous?.tilePatchRevision === tilePatchRevision
              ? []
              : this.buildSparseDirtyVisibleTilePatches(
                viewer.id,
                clientVisibleTiles,
                tileOriginX,
                tileOriginY,
                this.mapService.getDirtyTileKeys(viewer.mapId),
              )
            : this.buildSparseVisibleTilePatches(
              viewer.id,
              clientVisibleTiles,
              tileOriginX,
              tileOriginY,
            );
      if (shouldSendFullVisibility) {
        this.syncVisibleTileCache(viewer.id, clientVisibleTiles, tileOriginX, tileOriginY);
      }
      const playerPatches = this.buildSparseRenderEntities(viewer.id, crowdedVisiblePlayers, visibleEntityIds);
      const entityPatches = this.buildSparseRenderEntities(viewer.id, visibleEntities, visibleEntityIds);
      const effectPatches = this.measureCpuSection('broadcast_patch_effects', '广播: 特效过滤', () => (
        this.filterEffectsForViewer(effects, visibility.visibleKeys)
      ));
      const tickData: S2C_Tick = {
        p: playerPatches,
        e: entityPatches,
      };
      const mapStaticData: S2C_MapStaticSync = {
        mapId: viewer.mapId,
      };
      if (effectPatches.length > 0) {
        tickData.fx = effectPatches;
      }
      if (forceSync || mapChanged || !previous) {
        tickData.threatArrows = visibleThreatArrows;
      } else {
        const threatArrowPatch = this.buildSparseThreatArrowPatch(previous.threatArrows, visibleThreatArrows);
        if (threatArrowPatch.adds.length > 0) {
          tickData.threatArrowAdds = threatArrowPatch.adds;
        }
        if (threatArrowPatch.removes.length > 0) {
          tickData.threatArrowRemoves = threatArrowPatch.removes;
        }
      }
      if (groundPilePatches.length > 0) {
        tickData.g = groundPilePatches;
      }
      if (tilePatches.length > 0) {
        tickData.t = tilePatches;
      }
      const removedEntityIds = this.measureCpuSection('broadcast_cache', '广播: 缓存修剪', () => (
        this.pruneRenderEntityCache(viewer.id, visibleEntityIds)
      ));
      if (removedEntityIds.length > 0) {
        tickData.r = removedEntityIds;
      }
      if (shouldSendFullVisibility) {
        tickData.v = clientVisibleTiles;
      }
      if (forceSync || mapChanged || !previous) {
        mapStaticData.visibleMinimapMarkers = visibleMinimapMarkers;
      } else if (visibilityChanged) {
        const visibleMinimapMarkerPatch = this.buildSparseVisibleMinimapMarkerPatch(previous.visibleMinimapMarkers, visibleMinimapMarkers);
        if (visibleMinimapMarkerPatch.adds.length > 0) {
          mapStaticData.visibleMinimapMarkerAdds = visibleMinimapMarkerPatch.adds;
        }
        if (visibleMinimapMarkerPatch.removes.length > 0) {
          mapStaticData.visibleMinimapMarkerRemoves = visibleMinimapMarkerPatch.removes;
        }
      }
      if (mapChanged) {
        tickData.m = viewer.mapId;
      }
      if (mapChanged || !previous || !this.isStructuredEqual(previous.mapMeta, mapMeta)) {
        mapStaticData.mapMeta = mapMeta;
      }
      if (mapChanged || previous?.minimapSignature !== minimapSignature) {
        mapStaticData.minimap = unlockedMinimapIds.includes(viewer.mapId)
          ? this.mapService.getMinimapSnapshot(viewer.mapId)
          : undefined;
      }
      if (mapChanged || previous?.minimapLibrarySignature !== minimapLibrarySignature) {
        mapStaticData.minimapLibrary = this.mapService.getMinimapArchiveEntries(unlockedMinimapIds);
      }
      if (!previous || previous.hp !== viewer.hp) {
        tickData.hp = viewer.hp;
      }
      if (!previous || previous.qi !== viewer.qi) {
        tickData.qi = viewer.qi;
      }
      if (!previous || previous.facing !== viewer.facing) {
        tickData.f = viewer.facing;
      }
      if (!previous || previous.auraLevelBaseValue !== this.auraLevelBaseValue) {
        tickData.auraLevelBaseValue = this.auraLevelBaseValue;
      }
      if (!previous || previous.pathVersion !== pathVersion) {
        tickData.path = this.navigationService.getPathPoints(viewer.id);
      }
      if (forceSync || mapChanged || !previous || !this.isStructuredEqual(previous.timeState, time)) {
        tickData.time = time;
      }
      const hasTickChanges = this.hasTickPayloadChanges(tickData);
      const hasMapStaticChanges = this.hasMapStaticSyncChanges(mapStaticData);
      if (!hasTickChanges && !hasMapStaticChanges) {
        continue;
      }

      this.measureCpuSection('broadcast_emit', '广播: Socket 发送', () => {
        if (hasTickChanges) {
          tickData.dt = dt;
          socket.emit(S2C.Tick, tickData);
        }
        if (hasMapStaticChanges) {
          socket.emit(S2C.MapStaticSync, mapStaticData);
        }
      });
      this.lastSentTickState.set(viewer.id, {
        mapId: viewer.mapId,
        hp: viewer.hp,
        qi: viewer.qi,
        facing: viewer.facing,
        auraLevelBaseValue: this.auraLevelBaseValue,
        pathVersion,
        timeState: this.cloneStructured(time),
        threatArrows: visibleThreatArrows.length > 0 ? this.cloneStructured(visibleThreatArrows) : undefined,
        visibleMinimapMarkers: visibleMinimapMarkers.length > 0 ? this.cloneStructured(visibleMinimapMarkers) : undefined,
        visibilityKey,
        tilePatchRevision,
        mapMeta: mapMeta ? this.cloneStructured(mapMeta) : undefined,
        minimapSignature,
        minimapLibrarySignature,
      });
    }
  }

  private hasTickPayloadChanges(data: S2C_Tick): boolean {
    return data.p.length > 0
      || data.e.length > 0
      || (data.fx?.length ?? 0) > 0
      || data.threatArrows !== undefined
      || (data.threatArrowAdds?.length ?? 0) > 0
      || (data.threatArrowRemoves?.length ?? 0) > 0
      || (data.g?.length ?? 0) > 0
      || (data.t?.length ?? 0) > 0
      || (data.r?.length ?? 0) > 0
      || data.v !== undefined
      || data.time !== undefined
      || data.m !== undefined
      || data.hp !== undefined
      || data.qi !== undefined
      || data.f !== undefined
      || data.auraLevelBaseValue !== undefined
      || data.path !== undefined;
  }

  private hasMapStaticSyncChanges(data: S2C_MapStaticSync): boolean {
    return data.mapMeta !== undefined
      || 'minimap' in data
      || data.minimapLibrary !== undefined
      || data.visibleMinimapMarkers !== undefined
      || (data.visibleMinimapMarkerAdds?.length ?? 0) > 0
      || (data.visibleMinimapMarkerRemoves?.length ?? 0) > 0;
  }

  private toClientVisibleTiles(viewer: PlayerState, tiles: VisibleTile[][]): VisibleTile[][] {
    const originX = viewer.x - Math.floor(tiles[0]?.length ? tiles[0].length / 2 : 0);
    const originY = viewer.y - Math.floor(tiles.length / 2);
    return tiles.map((row, rowIndex) => row.map((tile, columnIndex) => (
      this.toClientVisibleTile(viewer, tile, originX + columnIndex, originY + rowIndex)
    )));
  }

  private toClientVisibleTile(viewer: PlayerState, tile: VisibleTile, x: number, y: number): VisibleTile {
    if (!tile) {
      return null;
    }
    const auraResources = this.mapService.getTileAuraResourceValues(viewer.mapId, x, y);
    return {
      ...this.cloneStructured(tile),
      aura: viewer.senseQiActive
        ? (
          auraResources.length > 0
            ? this.qiProjectionService.getAuraLevelFromResources(viewer, auraResources, this.auraLevelBaseValue)
            : this.qiProjectionService.getAuraLevel(viewer, tile.aura ?? 0, this.auraLevelBaseValue)
        )
        : 0,
    };
  }

  private captureActionSyncState(actions: ActionDef[]): ActionSyncStateEntry[] {
    return actions.map((action) => this.captureSingleActionSyncState(action));
  }

  private captureSingleActionSyncState(action: ActionDef): ActionSyncStateEntry {
    return {
      id: action.id,
      name: action.name,
      desc: action.desc,
      cooldownLeft: action.cooldownLeft,
      type: action.type,
      range: action.range,
      requiresTarget: action.requiresTarget,
      targetMode: action.targetMode,
      autoBattleEnabled: action.autoBattleEnabled,
      autoBattleOrder: action.autoBattleOrder,
      skillEnabled: action.skillEnabled,
    };
  }

  private captureActionPanelSyncState(player: PlayerState): ActionPanelSyncState {
    return {
      autoBattle: player.autoBattle,
      autoBattleTargetingMode: player.autoBattleTargetingMode,
      autoRetaliate: player.autoRetaliate !== false,
      autoBattleStationary: player.autoBattleStationary === true,
      allowAoePlayerHit: player.allowAoePlayerHit === true,
      autoIdleCultivation: player.autoIdleCultivation !== false,
      autoSwitchCultivation: player.autoSwitchCultivation === true,
      cultivationActive: this.techniqueService.hasCultivationBuff(player),
      senseQiActive: player.senseQiActive === true,
    };
  }

  private captureAttrUpdateState(player: PlayerState): S2C_AttrUpdate {
    return {
      finalAttrs: this.attrService.getPlayerFinalAttrs(player),
      numericStats: this.attrService.getPlayerNumericStats(player),
      maxHp: player.maxHp,
      qi: player.qi,
      specialStats: {
        foundation: Math.max(0, Math.floor(player.foundation ?? 0)),
        combatExp: Math.max(0, Math.floor(player.combatExp ?? 0)),
      },
      boneAgeBaseYears: player.boneAgeBaseYears,
      lifeElapsedTicks: player.lifeElapsedTicks,
      lifespanYears: player.lifespanYears ?? null,
      realmProgress: player.realm?.progress,
      realmProgressToNext: player.realm?.progressToNext,
      realmBreakthroughReady: player.realm?.breakthroughReady,
    };
  }

  private buildVisibilityKey(viewer: PlayerState, effectiveViewRange: number): string {
    return [
      viewer.mapId,
      this.mapService.getVisibilityRevision(viewer.mapId),
      viewer.x,
      viewer.y,
      effectiveViewRange,
      viewer.senseQiActive === true ? 1 : 0,
      viewer.senseQiActive === true ? this.qiProjectionService.getProjectionRevision(viewer) : 0,
      this.auraLevelBaseValue,
    ].join(':');
  }

  private buildSparseTechniqueUpdate(player: PlayerState): S2C_TechniqueUpdate | null {
    const previousCultivatingTechId = this.lastSentCultivatingTechIds.get(player.id);
    const techniquePatch = this.buildSparseTechniqueStates(player.id, player.techniques);
    const update: S2C_TechniqueUpdate = {
      techniques: techniquePatch.patches,
    };
    if (techniquePatch.removeTechniqueIds.length > 0) {
      update.removeTechniqueIds = techniquePatch.removeTechniqueIds;
    }
    const nextCultivatingTechId = player.cultivatingTechId ?? null;
    if (previousCultivatingTechId === undefined || previousCultivatingTechId !== nextCultivatingTechId) {
      update.cultivatingTechId = nextCultivatingTechId;
    }
    this.lastSentCultivatingTechIds.set(player.id, nextCultivatingTechId);
    const previousBodyTraining = this.lastSentBodyTrainingStates.get(player.id);
    const nextBodyTraining = player.bodyTraining ? this.cloneStructured(player.bodyTraining) : null;
    if (!this.isStructuredEqual(previousBodyTraining ?? null, nextBodyTraining ?? null)) {
      update.bodyTraining = nextBodyTraining;
    }
    this.lastSentBodyTrainingStates.set(player.id, nextBodyTraining);
    return update.techniques.length > 0
      || (update.removeTechniqueIds?.length ?? 0) > 0
      || update.cultivatingTechId !== undefined
      || update.bodyTraining !== undefined
      ? update
      : null;
  }

  /** 构建背包增量包，仅发送与上次不同的槽位 */
  private buildSparseInventoryUpdate(playerId: string, nextInventory: Inventory): S2C_InventoryUpdate | null {
    const previous = this.lastSentInventoryStates.get(playerId);
    const cachedInventory = this.cloneStructured(nextInventory);
    if (!previous) {
      this.lastSentInventoryStates.set(playerId, cachedInventory);
      return { inventory: this.toSyncedInventorySnapshot(nextInventory) };
    }

    const slots: InventorySlotUpdateEntry[] = [];
    const sharedLength = Math.max(previous.items.length, nextInventory.items.length);
    for (let slotIndex = 0; slotIndex < sharedLength; slotIndex += 1) {
      const previousItem = previous.items[slotIndex];
      const nextItem = nextInventory.items[slotIndex];
      if (this.isStructuredEqual(previousItem, nextItem)) {
        continue;
      }
      slots.push({
        slotIndex,
        item: nextItem ? this.toSyncedItemStack(nextItem) : null,
      });
    }

    const update: S2C_InventoryUpdate = {};
    if (previous.capacity !== nextInventory.capacity) {
      update.capacity = nextInventory.capacity;
    }
    if (previous.items.length !== nextInventory.items.length) {
      update.size = nextInventory.items.length;
    }
    if (slots.length > 0) {
      update.slots = slots;
    }

    this.lastSentInventoryStates.set(playerId, cachedInventory);
    return update.capacity !== undefined || update.size !== undefined || update.slots !== undefined
      ? update
      : null;
  }

  /** 构建装备增量包，仅发送变化的槽位 */
  private buildSparseEquipmentUpdate(playerId: string, nextEquipment: EquipmentSlots): S2C_EquipmentUpdate | null {
    const previous = this.lastSentEquipmentStates.get(playerId);
    const cachedEquipment = this.cloneStructured(nextEquipment);
    const slots: EquipmentSlotUpdateEntry[] = [];

    for (const slot of EQUIP_SLOTS) {
      const previousItem = previous?.[slot];
      const nextItem = nextEquipment[slot];
      if (previous && this.isStructuredEqual(previousItem, nextItem)) {
        continue;
      }
      slots.push({
        slot,
        item: nextItem ? this.toSyncedItemStack(nextItem, 1) : null,
      });
    }

    this.lastSentEquipmentStates.set(playerId, cachedEquipment);
    return slots.length > 0 ? { slots } : null;
  }

  private buildSparseActionsUpdate(player: PlayerState): S2C_ActionsUpdate | null {
    const actionPatch = this.cooldownOnlyActionDirtyPlayers.has(player.id)
      ? (this.buildCooldownOnlyActionStates(player.id, player.actions) ?? this.buildSparseActionStates(player.id, player.actions))
      : this.buildSparseActionStates(player.id, player.actions);
    const previousPanelState = this.lastSentActionPanelStates.get(player.id);
    const nextPanelState = this.captureActionPanelSyncState(player);
    const update: S2C_ActionsUpdate = {
      actions: actionPatch.patches,
    };
    if (actionPatch.removeActionIds.length > 0) {
      update.removeActionIds = actionPatch.removeActionIds;
    }
    if (actionPatch.actionOrder) {
      update.actionOrder = actionPatch.actionOrder;
    }
    if (!previousPanelState || previousPanelState.autoBattle !== nextPanelState.autoBattle) {
      update.autoBattle = nextPanelState.autoBattle;
    }
    if (!previousPanelState || previousPanelState.autoBattleTargetingMode !== nextPanelState.autoBattleTargetingMode) {
      update.autoBattleTargetingMode = nextPanelState.autoBattleTargetingMode;
    }
    if (!previousPanelState || previousPanelState.autoRetaliate !== nextPanelState.autoRetaliate) {
      update.autoRetaliate = nextPanelState.autoRetaliate;
    }
    if (!previousPanelState || previousPanelState.autoBattleStationary !== nextPanelState.autoBattleStationary) {
      update.autoBattleStationary = nextPanelState.autoBattleStationary;
    }
    if (!previousPanelState || previousPanelState.allowAoePlayerHit !== nextPanelState.allowAoePlayerHit) {
      update.allowAoePlayerHit = nextPanelState.allowAoePlayerHit;
    }
    if (!previousPanelState || previousPanelState.autoIdleCultivation !== nextPanelState.autoIdleCultivation) {
      update.autoIdleCultivation = nextPanelState.autoIdleCultivation;
    }
    if (!previousPanelState || previousPanelState.autoSwitchCultivation !== nextPanelState.autoSwitchCultivation) {
      update.autoSwitchCultivation = nextPanelState.autoSwitchCultivation;
    }
    if (!previousPanelState || previousPanelState.cultivationActive !== nextPanelState.cultivationActive) {
      update.cultivationActive = nextPanelState.cultivationActive;
    }
    if (!previousPanelState || previousPanelState.senseQiActive !== nextPanelState.senseQiActive) {
      update.senseQiActive = nextPanelState.senseQiActive;
    }
    this.lastSentActionPanelStates.set(player.id, nextPanelState);
    return update.actions.length > 0
      || (update.removeActionIds?.length ?? 0) > 0
      || (update.actionOrder?.length ?? 0) > 0
      || update.autoBattle !== undefined
      || update.autoBattleTargetingMode !== undefined
      || update.autoRetaliate !== undefined
      || update.autoBattleStationary !== undefined
      || update.allowAoePlayerHit !== undefined
      || update.autoIdleCultivation !== undefined
      || update.autoSwitchCultivation !== undefined
      || update.cultivationActive !== undefined
      || update.senseQiActive !== undefined
      ? update
      : null;
  }

  /** 构建属性增量包，仅发送与上次不同的字段 */
  private buildSparseAttrUpdate(playerId: string, nextState: S2C_AttrUpdate): S2C_AttrUpdate | null {
    const previous = this.lastSentAttrUpdates.get(playerId);
    const patch: S2C_AttrUpdate = {};
    const cachedState = this.cloneStructured(nextState);

    if (!previous || !this.isStructuredEqual(previous.baseAttrs, nextState.baseAttrs)) {
      patch.baseAttrs = this.cloneStructured(nextState.baseAttrs);
    }
    if (!previous || !this.isStructuredEqual(previous.bonuses, nextState.bonuses)) {
      patch.bonuses = this.cloneStructured(nextState.bonuses);
    }
    if (!previous || !this.isStructuredEqual(previous.finalAttrs, nextState.finalAttrs)) {
      patch.finalAttrs = this.cloneStructured(nextState.finalAttrs);
    }
    if (!previous || !this.isStructuredEqual(previous.numericStats, nextState.numericStats)) {
      patch.numericStats = this.cloneStructured(nextState.numericStats);
    }
    if (!previous || !this.isStructuredEqual(previous.ratioDivisors, nextState.ratioDivisors)) {
      patch.ratioDivisors = this.cloneStructured(nextState.ratioDivisors);
    }
    if (!previous || !this.isStructuredEqual(previous.numericStatBreakdowns, nextState.numericStatBreakdowns)) {
      patch.numericStatBreakdowns = this.cloneStructured(nextState.numericStatBreakdowns);
    }
    if (!previous || previous.maxHp !== nextState.maxHp) {
      patch.maxHp = nextState.maxHp;
    }
    if (!previous || previous.qi !== nextState.qi) {
      patch.qi = nextState.qi;
    }
    const specialStatsChanged = !previous || !this.isStructuredEqual(previous.specialStats, nextState.specialStats);
    if (specialStatsChanged) {
      if (!previous || this.canSyncSpecialStatsNow(playerId)) {
        patch.specialStats = nextState.specialStats ? this.cloneStructured(nextState.specialStats) : undefined;
        this.lastSentSpecialStatsAt.set(playerId, Date.now());
        this.pendingSpecialStatsPlayers.delete(playerId);
      } else {
        cachedState.specialStats = previous.specialStats ? this.cloneStructured(previous.specialStats) : undefined;
        this.pendingSpecialStatsPlayers.add(playerId);
      }
    } else {
      this.pendingSpecialStatsPlayers.delete(playerId);
    }
    if (!previous || previous.boneAgeBaseYears !== nextState.boneAgeBaseYears) {
      patch.boneAgeBaseYears = nextState.boneAgeBaseYears;
    }
    if (!previous || previous.lifeElapsedTicks !== nextState.lifeElapsedTicks) {
      patch.lifeElapsedTicks = nextState.lifeElapsedTicks;
    }
    if (!previous || previous.lifespanYears !== nextState.lifespanYears) {
      patch.lifespanYears = nextState.lifespanYears;
    }
    if (!previous || previous.realmProgress !== nextState.realmProgress) {
      patch.realmProgress = nextState.realmProgress;
    }
    if (!previous || previous.realmProgressToNext !== nextState.realmProgressToNext) {
      patch.realmProgressToNext = nextState.realmProgressToNext;
    }
    if (!previous || previous.realmBreakthroughReady !== nextState.realmBreakthroughReady) {
      patch.realmBreakthroughReady = nextState.realmBreakthroughReady;
    }

    this.lastSentAttrUpdates.set(playerId, cachedState);
    return Object.keys(patch).length > 0 ? patch : null;
  }

  private buildRealmUpdate(playerId: string, nextRealm: PlayerState['realm'] | null): S2C_RealmUpdate | null {
    const previousRealm = this.lastSentRealmStates.get(playerId);
    if (this.isStructuredEqual(previousRealm, nextRealm ?? null)) {
      return null;
    }
    const cachedRealm = nextRealm ? this.cloneStructured(nextRealm) : null;
    this.lastSentRealmStates.set(playerId, cachedRealm);
    return {
      realm: cachedRealm,
    };
  }

  private shouldFlushPendingSpecialStats(playerId: string): boolean {
    return this.pendingSpecialStatsPlayers.has(playerId) && this.canSyncSpecialStatsNow(playerId);
  }

  private canSyncSpecialStatsNow(playerId: string): boolean {
    const lastSentAt = this.lastSentSpecialStatsAt.get(playerId);
    return lastSentAt === undefined || Date.now() - lastSentAt >= PLAYER_SPECIAL_STATS_SYNC_INTERVAL_MS;
  }

  /** 构建功法增量包，仅发送与上次不同的字段 */
  private buildSparseTechniqueStates(
    playerId: string,
    techniques: TechniqueState[],
  ): { patches: TechniqueUpdateEntry[]; removeTechniqueIds: string[] } {
    let cache = this.lastSentTechniqueStates.get(playerId);
    if (!cache) {
      cache = new Map<string, TechniqueState>();
      this.lastSentTechniqueStates.set(playerId, cache);
    }

    const nextCache = new Map<string, TechniqueState>();
    const patches: TechniqueUpdateEntry[] = [];
    for (const technique of techniques) {
      const previous = cache!.get(technique.techId);
      const patch: TechniqueUpdateEntry = { techId: technique.techId };
      const knownTechnique = this.contentService.getTechnique(technique.techId);

      if (!previous || previous.level !== technique.level) patch.level = technique.level;
      if (!previous || previous.exp !== technique.exp) patch.exp = technique.exp;
      if (!previous || previous.expToNext !== technique.expToNext) patch.expToNext = technique.expToNext;
      if (!previous || previous.realmLv !== technique.realmLv) patch.realmLv = technique.realmLv;
      if (!previous || previous.realm !== technique.realm) patch.realm = technique.realm;
      if (!previous || previous.skillsEnabled !== technique.skillsEnabled) {
        patch.skillsEnabled = technique.skillsEnabled ?? null;
      }
      if (!knownTechnique) {
        if (!previous || previous.name !== technique.name) patch.name = technique.name ?? null;
        if (!previous || previous.grade !== technique.grade) patch.grade = technique.grade ?? null;
        if (!previous || previous.category !== technique.category) patch.category = technique.category ?? null;
        if (!previous || !this.isStructuredEqual(previous.skills, technique.skills)) {
          patch.skills = technique.skills ? this.cloneStructured(technique.skills) : null;
        }
        if (!previous || !this.isStructuredEqual(previous.layers, technique.layers)) {
          patch.layers = technique.layers ? this.cloneStructured(technique.layers) : null;
        }
      }
      if (!previous || !this.isStructuredEqual(previous.attrCurves, technique.attrCurves)) {
        patch.attrCurves = technique.attrCurves ? this.cloneStructured(technique.attrCurves) : null;
      }

      nextCache.set(technique.techId, this.cloneStructured(technique));
      if (Object.keys(patch).length > 1) {
        patches.push(patch);
      }
    }

    const removeTechniqueIds: string[] = [];
    for (const techId of cache.keys()) {
      if (!nextCache.has(techId)) {
        removeTechniqueIds.push(techId);
      }
    }

    this.lastSentTechniqueStates.set(playerId, nextCache);
    return { patches, removeTechniqueIds };
  }

  /** 构建行动列表增量包，仅发送与上次不同的字段 */
  private buildSparseActionStates(
    playerId: string,
    actions: ActionDef[],
  ): { patches: ActionUpdateEntry[]; removeActionIds: string[]; actionOrder?: string[] } {
    let cache = this.lastSentActionStates.get(playerId);
    if (!cache) {
      cache = new Map<string, ActionDef>();
      this.lastSentActionStates.set(playerId, cache);
    }

    const nextCache = new Map<string, ActionSyncStateEntry>();
    const patches: ActionUpdateEntry[] = [];
    for (const action of actions) {
      const previous = cache!.get(action.id);
      const patch: ActionUpdateEntry = { id: action.id };
      const knownSkillAction = action.type === 'skill' && Boolean(this.contentService.getSkill(action.id));

      if (!previous || previous.cooldownLeft !== action.cooldownLeft) {
        patch.cooldownLeft = action.cooldownLeft;
      }

      if (!previous || previous.autoBattleEnabled !== action.autoBattleEnabled) {
        patch.autoBattleEnabled = action.autoBattleEnabled ?? null;
      }
      if (!previous || previous.autoBattleOrder !== action.autoBattleOrder) {
        patch.autoBattleOrder = action.autoBattleOrder ?? null;
      }
      if (!previous || previous.skillEnabled !== action.skillEnabled) {
        patch.skillEnabled = action.skillEnabled ?? null;
      }
      if (knownSkillAction) {
        if (!previous || previous.type !== action.type) {
          patch.type = action.type ?? null;
        }
      } else {
        if (!previous || previous.name !== action.name) patch.name = action.name ?? null;
        if (!previous || previous.type !== action.type) patch.type = action.type ?? null;
        if (!previous || previous.desc !== action.desc) patch.desc = action.desc ?? null;
        if (!previous || previous.range !== action.range) patch.range = action.range ?? null;
        if (!previous || previous.requiresTarget !== action.requiresTarget) {
          patch.requiresTarget = action.requiresTarget ?? null;
        }
        if (!previous || previous.targetMode !== action.targetMode) {
          patch.targetMode = action.targetMode ?? null;
        }
      }

      nextCache.set(action.id, this.captureSingleActionSyncState(action));
      if (Object.keys(patch).length > 1) {
        patches.push(patch);
      }
    }

    const removeActionIds: string[] = [];
    for (const actionId of cache.keys()) {
      if (!nextCache.has(actionId)) {
        removeActionIds.push(actionId);
      }
    }
    const previousOrder = [...cache.keys()];
    const nextOrder = [...nextCache.keys()];

    this.lastSentActionStates.set(playerId, nextCache);
    return {
      patches,
      removeActionIds,
      actionOrder: this.isStructuredEqual(previousOrder, nextOrder) ? undefined : nextOrder,
    };
  }

  /**
   * 纯冷却推进时仅同步 cooldownLeft，避免扫描/比较动作静态字段。
   * 若缓存缺失或动作集合发生变化，则回退到完整 diff。
   */
  private buildCooldownOnlyActionStates(
    playerId: string,
    actions: ActionDef[],
  ): { patches: ActionUpdateEntry[]; removeActionIds: string[]; actionOrder?: string[] } | null {
    const cache = this.lastSentActionStates.get(playerId);
    if (!cache || cache.size !== actions.length) {
      return null;
    }

    const nextCache = new Map<string, ActionSyncStateEntry>();
    const patches: ActionUpdateEntry[] = [];
    for (const action of actions) {
      const previous = cache.get(action.id);
      if (!previous) {
        return null;
      }
      if (previous.cooldownLeft !== action.cooldownLeft) {
        patches.push({
          id: action.id,
          cooldownLeft: action.cooldownLeft,
        });
      }
      nextCache.set(action.id, {
        ...previous,
        cooldownLeft: action.cooldownLeft,
      });
    }

    this.lastSentActionStates.set(playerId, nextCache);
    return {
      patches,
      removeActionIds: [],
    };
  }

  private toSyncedInventorySnapshot(inventory: Inventory): SyncedInventorySnapshot {
    return {
      capacity: inventory.capacity,
      items: inventory.items.map((item) => this.toSyncedItemStack(item)),
    };
  }

  private toSyncedItemStack(item: ItemStack, countOverride?: number): SyncedItemStack {
    const rawCount = typeof countOverride === 'number' ? countOverride : item.count;
    const count = Math.max(1, Math.floor(rawCount));
    if (this.contentService.getItem(item.itemId)) {
      return {
        itemId: item.itemId,
        count,
        mapUnlockId: item.mapUnlockId,
        tileAuraGainAmount: item.tileAuraGainAmount,
        allowBatchUse: item.allowBatchUse,
      };
    }
    return {
      itemId: item.itemId,
      count,
      name: item.name,
      type: item.type,
      desc: item.desc,
      groundLabel: item.groundLabel,
      grade: item.grade,
      level: item.level,
      equipSlot: item.equipSlot,
      equipAttrs: item.equipAttrs ? this.cloneStructured(item.equipAttrs) : undefined,
      equipStats: item.equipStats ? this.cloneStructured(item.equipStats) : undefined,
      equipValueStats: item.equipValueStats ? this.cloneStructured(item.equipValueStats) : undefined,
      effects: item.effects ? this.cloneStructured(item.effects) : undefined,
      tags: item.tags ? [...item.tags] : undefined,
      mapUnlockId: item.mapUnlockId,
      tileAuraGainAmount: item.tileAuraGainAmount,
      allowBatchUse: item.allowBatchUse,
    };
  }

  /** 构建地面物品堆增量包，仅发送变化的堆 */
  private buildSparseGroundPiles(viewerId: string, piles: GroundItemPileView[]): GroundItemPilePatch[] {
    let cache = this.lastSentGroundPiles.get(viewerId);
    if (!cache) {
      cache = new Map<string, GroundItemPileView>();
      this.lastSentGroundPiles.set(viewerId, cache);
    }

    const nextCache = new Map<string, GroundItemPileView>();
    const patches: GroundItemPilePatch[] = [];

    for (const pile of piles) {
      const previous = cache.get(pile.sourceId);
      if (
        !previous
        || previous.x !== pile.x
        || previous.y !== pile.y
        || !this.isStructuredEqual(previous.items, pile.items)
      ) {
        patches.push({
          sourceId: pile.sourceId,
          x: pile.x,
          y: pile.y,
          items: this.cloneStructured(pile.items),
        });
      }
      nextCache.set(pile.sourceId, this.cloneStructured(pile));
    }

    for (const [sourceId, previous] of cache.entries()) {
      if (nextCache.has(sourceId)) {
        continue;
      }
      patches.push({
        sourceId,
        x: previous.x,
        y: previous.y,
        items: null,
      });
    }

    this.lastSentGroundPiles.set(viewerId, nextCache);
    return patches;
  }

  private buildSparseThreatArrowPatch(
    previous: Array<[string, string]> | undefined,
    next: Array<[string, string]>,
  ): { adds: Array<[string, string]>; removes: Array<[string, string]> } {
    const previousMap = new Map((previous ?? []).map((entry) => [this.buildThreatArrowKey(entry), entry]));
    const nextMap = new Map(next.map((entry) => [this.buildThreatArrowKey(entry), entry]));
    const adds: Array<[string, string]> = [];
    const removes: Array<[string, string]> = [];

    for (const [key, entry] of nextMap.entries()) {
      if (!previousMap.has(key)) {
        adds.push(this.cloneStructured(entry));
      }
    }
    for (const [key, entry] of previousMap.entries()) {
      if (!nextMap.has(key)) {
        removes.push(this.cloneStructured(entry));
      }
    }

    return { adds, removes };
  }

  private buildSparseVisibleMinimapMarkerPatch(
    previous: MapMinimapMarker[] | undefined,
    next: MapMinimapMarker[],
  ): { adds: MapMinimapMarker[]; removes: string[] } {
    const previousMap = new Map((previous ?? []).map((marker) => [marker.id, marker]));
    const nextMap = new Map(next.map((marker) => [marker.id, marker]));
    const adds: MapMinimapMarker[] = [];
    const removes: string[] = [];

    for (const [id, marker] of nextMap.entries()) {
      const previousMarker = previousMap.get(id);
      if (!previousMarker || !this.isStructuredEqual(previousMarker, marker)) {
        adds.push(this.cloneStructured(marker));
      }
    }
    for (const id of previousMap.keys()) {
      if (!nextMap.has(id)) {
        removes.push(id);
      }
    }

    return { adds, removes };
  }

  private buildThreatArrowKey([ownerId, targetId]: [string, string]): string {
    return `${ownerId}->${targetId}`;
  }

  /** 构建可见地块增量包，仅发送与上次不同的地块 */
  private syncVisibleTileCache(
    viewerId: string,
    tiles: VisibleTile[][],
    originX: number,
    originY: number,
  ): void {
    const nextCache = new Map<string, VisibleTile>();
    this.measureCpuSection('broadcast_patch_tiles_reset', '地块 Patch: 全量缓存同步', () => {
      for (let row = 0; row < tiles.length; row += 1) {
        for (let col = 0; col < tiles[row].length; col += 1) {
          const tile = tiles[row][col];
          if (!tile) {
            continue;
          }

          const x = originX + col;
          const y = originY + row;
          nextCache.set(`${x},${y}`, this.cloneStructured(tile));
        }
      }
    });
    this.lastSentVisibleTiles.set(viewerId, nextCache);
  }

  /** 仅按脏格构建可见地块 Patch，避免稳定视野下全量扫描 */
  private buildSparseDirtyVisibleTilePatches(
    viewerId: string,
    tiles: VisibleTile[][],
    originX: number,
    originY: number,
    dirtyTileKeys: string[],
  ): VisibleTilePatch[] {
    if (dirtyTileKeys.length === 0) {
      return [];
    }

    let cache = this.lastSentVisibleTiles.get(viewerId);
    if (!cache) {
      cache = new Map<string, VisibleTile>();
      this.lastSentVisibleTiles.set(viewerId, cache);
    }

    const patches: VisibleTilePatch[] = [];
    const changedTiles: Array<{ key: string; x: number; y: number; tile: VisibleTile }> = [];
    this.measureCpuSection('broadcast_patch_tiles_scan', '地块 Patch: 扫描比较', () => {
      const maxRow = tiles.length - 1;
      const maxCol = tiles[0]?.length ? tiles[0].length - 1 : -1;
      for (const key of dirtyTileKeys) {
        const [x, y] = key.split(',').map((value) => Number.parseInt(value, 10));
        const row = y - originY;
        const col = x - originX;
        if (row < 0 || col < 0 || row > maxRow || col > maxCol) {
          continue;
        }

        const tile = tiles[row]?.[col];
        if (!tile) {
          continue;
        }

        const previous = cache.get(key);
        if (previous && this.isStructuredEqual(previous, tile)) {
          continue;
        }

        changedTiles.push({ key, x, y, tile });
      }
    });
    this.measureCpuSection('broadcast_patch_tiles_clone', '地块 Patch: 快照复制', () => {
      for (const { key, x, y, tile } of changedTiles) {
        const nextTile = this.cloneStructured(tile);
        patches.push({ x, y, tile: nextTile });
        cache.set(key, nextTile);
      }
    });
    return patches;
  }

  /** 构建可见地块增量包，仅发送与上次不同的地块 */
  private buildSparseVisibleTilePatches(
    viewerId: string,
    tiles: VisibleTile[][],
    originX: number,
    originY: number,
  ): VisibleTilePatch[] {
    let cache = this.lastSentVisibleTiles.get(viewerId);
    if (!cache) {
      cache = new Map<string, VisibleTile>();
      this.lastSentVisibleTiles.set(viewerId, cache);
    }

    const patches: VisibleTilePatch[] = [];
    const changedTiles: Array<{ key: string; x: number; y: number; tile: VisibleTile }> = [];
    const visibleKeys = new Set<string>();

    this.measureCpuSection('broadcast_patch_tiles_scan', '地块 Patch: 扫描比较', () => {
      for (let row = 0; row < tiles.length; row += 1) {
        for (let col = 0; col < tiles[row].length; col += 1) {
          const tile = tiles[row][col];
          if (!tile) {
            continue;
          }

          const x = originX + col;
          const y = originY + row;
          const key = `${x},${y}`;
          visibleKeys.add(key);
          const previous = cache.get(key);
          if (!previous || !this.isStructuredEqual(previous, tile)) {
            changedTiles.push({ key, x, y, tile });
          }
        }
      }
    });

    this.measureCpuSection('broadcast_patch_tiles_clone', '地块 Patch: 快照复制', () => {
      for (const { key, x, y, tile } of changedTiles) {
        const nextTile = this.cloneStructured(tile);
        patches.push({
          x,
          y,
          tile: nextTile,
        });
        cache.set(key, nextTile);
      }

      for (const [key] of cache.entries()) {
        if (visibleKeys.has(key)) {
          continue;
        }
        const [x, y] = key.split(',').map((value) => Number.parseInt(value, 10));
        patches.push({
          x,
          y,
          tile: null,
        });
        cache.delete(key);
      }
    });

    return patches;
  }

  /** 构建渲染实体增量包，仅发送与上次不同的字段 */
  private buildSparseRenderEntities(
    viewerId: string,
    entities: RenderEntity[],
    visibleEntityIds: Set<string>,
  ): TickRenderEntity[] {
    let cache = this.lastSentRenderEntities.get(viewerId);
    if (!cache) {
      cache = new Map<string, RenderEntity>();
      this.lastSentRenderEntities.set(viewerId, cache);
    }

    const pending: Array<{ entity: RenderEntity; next: TickRenderEntity; syncBuffs: boolean }> = [];

    this.measureCpuSection('broadcast_patch_entities_scan', '实体 Patch: 扫描比较', () => {
      for (const entity of entities) {
        visibleEntityIds.add(entity.id);
        const previous = cache.get(entity.id);
        const charChanged = !previous || previous.char !== entity.char;
        const colorChanged = !previous || previous.color !== entity.color;
        const nameChanged = !previous || previous.name !== entity.name;
        const kindChanged = !previous || previous.kind !== entity.kind;
        const monsterTierChanged = !previous || previous.monsterTier !== entity.monsterTier;
        const monsterScaleChanged = !previous || previous.monsterScale !== entity.monsterScale;
        const hpChanged = !previous || previous.hp !== entity.hp;
        const maxHpChanged = !previous || previous.maxHp !== entity.maxHp;
        const qiChanged = !previous || previous.qi !== entity.qi;
        const maxQiChanged = !previous || previous.maxQi !== entity.maxQi;
        const npcQuestMarkerChanged = !previous || !this.isStructuredEqual(previous.npcQuestMarker, entity.npcQuestMarker);
        const observationChanged = !previous || !this.isStructuredEqual(previous.observation, entity.observation);
        const syncBuffs = !previous || !this.isStructuredEqual(previous.buffs, entity.buffs);
        const moved = !previous || previous.x !== entity.x || previous.y !== entity.y;
        const changed = moved
          || charChanged
          || colorChanged
          || nameChanged
          || kindChanged
          || monsterTierChanged
          || monsterScaleChanged
          || hpChanged
          || maxHpChanged
          || qiChanged
          || maxQiChanged
          || npcQuestMarkerChanged
          || observationChanged
          || syncBuffs;

        if (!changed) {
          continue;
        }

        const next: TickRenderEntity = {
          id: entity.id,
          x: entity.x,
          y: entity.y,
        };

        if (charChanged) next.char = entity.char;
        if (colorChanged) next.color = entity.color;
        if (nameChanged) next.name = entity.name ?? null;
        if (kindChanged) next.kind = entity.kind ?? null;
        if (monsterTierChanged) next.monsterTier = entity.monsterTier ?? null;
        if (monsterScaleChanged) next.monsterScale = entity.monsterScale ?? null;
        if (hpChanged) next.hp = entity.hp ?? null;
        if (maxHpChanged) next.maxHp = entity.maxHp ?? null;
        if (qiChanged) next.qi = entity.qi ?? null;
        if (maxQiChanged) next.maxQi = entity.maxQi ?? null;
        if (npcQuestMarkerChanged) {
          next.npcQuestMarker = entity.npcQuestMarker ?? null;
        }
        if (observationChanged) {
          next.observation = entity.observation ?? null;
        }
        pending.push({
          entity,
          next,
          syncBuffs,
        });
      }
    });

    return this.measureCpuSection('broadcast_patch_entities_clone', '实体 Patch: 快照复制', () => (
      pending.map(({ entity, next, syncBuffs }) => {
        if (syncBuffs) {
          next.buffs = entity.buffs ? this.cloneStructured(entity.buffs) : null;
        }
        cache.set(entity.id, this.cloneStructured(entity));
        return next;
      })
    ));
  }

  /** 清理已离开视野的渲染实体缓存 */
  private pruneRenderEntityCache(viewerId: string, visibleEntityIds: Set<string>): string[] {
    const cache = this.lastSentRenderEntities.get(viewerId);
    if (!cache) {
      return [];
    }

    const removedEntityIds: string[] = [];
    for (const entityId of cache.keys()) {
      if (!visibleEntityIds.has(entityId)) {
        removedEntityIds.push(entityId);
        cache.delete(entityId);
      }
    }
    return removedEntityIds;
  }

  private isStructuredEqual(left: unknown, right: unknown): boolean {
    return isPlainEqual(left, right);
  }

  private cloneStructured<T>(value: T): T {
    return clonePlainValue(value);
  }

  /** 过滤出观察者视野范围内的战斗特效 */
  private filterEffectsForViewer(effects: CombatEffect[], visibleKeys: Set<string>): CombatEffect[] {
    return effects.filter((effect) => {
      if (effect.type === 'attack') {
        return visibleKeys.has(`${effect.fromX},${effect.fromY}`) || visibleKeys.has(`${effect.toX},${effect.toY}`);
      }
      if (effect.type === 'warning_zone') {
        return effect.cells.some((cell) => visibleKeys.has(`${cell.x},${cell.y}`));
      }
      return visibleKeys.has(`${effect.x},${effect.y}`);
    });
  }

  /** 每 tick 自然回复气血和真气 */
  private applyNaturalRecovery(player: PlayerState) {
    const numericStats = this.attrService.getPlayerNumericStats(player);
    const maxQi = Math.max(0, Math.round(numericStats.maxQi));
    if (player.hp < player.maxHp && numericStats.hpRegenRate > 0) {
      const heal = Math.max(1, Math.round(player.maxHp * (numericStats.hpRegenRate / 10000)));
      player.hp = Math.min(player.maxHp, player.hp + heal);
    }
    if (player.qi < maxQi && numericStats.qiRegenRate > 0) {
      const recover = Math.max(1, Math.round(maxQi * (numericStats.qiRegenRate / 10000)));
      player.qi = Math.min(maxQi, player.qi + recover);
    }
  }

  private applyTerrainEffects(player: PlayerState): { update: WorldUpdate; changed: boolean } {
    const tile = this.mapService.getTile(player.mapId, player.x, player.y);
    let changed = false;

    if (tile?.type === TileType.MoltenPool) {
      changed = this.applyMoltenPoolBurnStack(player) || changed;
    }

    const burnBuff = this.getMoltenPoolBurnBuff(player);
    if (!burnBuff) {
      return { update: { messages: [], dirty: [] }, changed };
    }

    const baseDamage = Math.max(1, Math.round(player.maxHp * burnBuff.stacks * MOLTEN_POOL_BURN_HP_PERCENT_PER_STACK));
    const update = this.worldService.applyTerrainDotDamageToPlayer(player, baseDamage, 'fire', MOLTEN_POOL_BURN_NAME);
    return {
      update,
      changed: changed || baseDamage > 0 || update.playerDefeated === true,
    };
  }

  private getMoltenPoolBurnBuff(player: PlayerState): TemporaryBuffState | undefined {
    return player.temporaryBuffs?.find((buff) => (
      buff.buffId === MOLTEN_POOL_BURN_BUFF_ID
      && buff.sourceSkillId === MOLTEN_POOL_BURN_SOURCE_ID
      && buff.remainingTicks > 0
      && buff.stacks > 0
    ));
  }

  private getFireBurnMarkBuff(player: PlayerState): TemporaryBuffState | undefined {
    return player.temporaryBuffs?.find((buff) => (
      buff.buffId === FIRE_BURN_MARK_BUFF_ID
      && buff.remainingTicks > 0
      && buff.stacks > 0
    ));
  }

  private applySkillBuffEffects(player: PlayerState): { update: WorldUpdate; changed: boolean } {
    const burnBuff = this.getFireBurnMarkBuff(player);
    if (!burnBuff) {
      return { update: { messages: [], dirty: [] }, changed: false };
    }
    const baseDamage = Math.max(1, Math.round(player.hp * burnBuff.stacks * FIRE_BURN_MARK_HP_RATIO_PER_STACK));
    const update = this.worldService.applyTerrainDotDamageToPlayer(
      player,
      baseDamage,
      'fire',
      burnBuff.sourceSkillName ?? burnBuff.name,
    );
    return {
      update,
      changed: baseDamage > 0 || update.playerDefeated === true,
    };
  }

  private applyMoltenPoolBurnStack(player: PlayerState): boolean {
    player.temporaryBuffs ??= [];
    const existing = this.getMoltenPoolBurnBuff(player);
    const realmLv = Math.max(1, Math.floor(player.realm?.realmLv ?? player.realmLv ?? 1));
    if (existing) {
      existing.name = MOLTEN_POOL_BURN_NAME;
      existing.desc = MOLTEN_POOL_BURN_DESC;
      existing.shortMark = MOLTEN_POOL_BURN_SHORT_MARK;
      existing.category = 'debuff';
      existing.visibility = 'public';
      existing.remainingTicks = MOLTEN_POOL_BURN_DURATION_TICKS + 1;
      existing.duration = MOLTEN_POOL_BURN_DURATION_TICKS;
      existing.stacks = Math.min(MOLTEN_POOL_BURN_MAX_STACKS, existing.stacks + 1);
      existing.maxStacks = MOLTEN_POOL_BURN_MAX_STACKS;
      existing.sourceSkillId = MOLTEN_POOL_BURN_SOURCE_ID;
      existing.sourceSkillName = '熔池';
      existing.realmLv = realmLv;
      existing.color = MOLTEN_POOL_BURN_COLOR;
      existing.attrs = undefined;
      existing.attrMode = undefined;
      existing.stats = undefined;
      existing.statMode = undefined;
      existing.qiProjection = undefined;
      syncDynamicBuffPresentation(existing);
      this.playerService.markDirty(player.id, 'attr');
      return true;
    }

    player.temporaryBuffs.push(syncDynamicBuffPresentation({
      buffId: MOLTEN_POOL_BURN_BUFF_ID,
      name: MOLTEN_POOL_BURN_NAME,
      desc: MOLTEN_POOL_BURN_DESC,
      shortMark: MOLTEN_POOL_BURN_SHORT_MARK,
      category: 'debuff',
      visibility: 'public',
      remainingTicks: MOLTEN_POOL_BURN_DURATION_TICKS + 1,
      duration: MOLTEN_POOL_BURN_DURATION_TICKS,
      stacks: 1,
      maxStacks: MOLTEN_POOL_BURN_MAX_STACKS,
      sourceSkillId: MOLTEN_POOL_BURN_SOURCE_ID,
      sourceSkillName: '熔池',
      realmLv,
      color: MOLTEN_POOL_BURN_COLOR,
    }));
    this.playerService.markDirty(player.id, 'attr');
    return true;
  }

  /** 每 tick 推进临时 Buff，处理维持代价、持续时间与过期移除 */
  private tickTemporaryBuffs(player: PlayerState, messages: WorldMessage[]): boolean {
    if (!player.temporaryBuffs || player.temporaryBuffs.length === 0) {
      return false;
    }
    let removed = false;
    let resourceSpent = false;
    const nextBuffs: TemporaryBuffState[] = [];
    for (const buff of player.temporaryBuffs) {
      const sustainCost = getBuffSustainCost(buff);
      if (sustainCost !== null && buff.sustainCost) {
        const currentResource = buff.sustainCost.resource === 'hp' ? player.hp : player.qi;
        if (currentResource < sustainCost) {
          removed = true;
          messages.push({
            playerId: player.id,
            text: `${buff.name}因${getBuffSustainResourceLabel(buff.sustainCost.resource)}不足而散去。`,
            kind: 'system',
          });
          continue;
        }
        if (buff.sustainCost.resource === 'hp') {
          player.hp = Math.max(0, player.hp - sustainCost);
        } else {
          player.qi = Math.max(0, player.qi - sustainCost);
        }
        buff.sustainTicksElapsed = Math.max(0, Math.floor(buff.sustainTicksElapsed ?? 0)) + 1;
        syncDynamicBuffPresentation(buff);
        resourceSpent = true;
      }
      if (!buff.infiniteDuration) {
        buff.remainingTicks -= 1;
      }
      if (buff.remainingTicks > 0 && buff.stacks > 0) {
        nextBuffs.push(buff);
      } else {
        removed = true;
      }
    }
    const activeBuffIds = new Set(nextBuffs.map((buff) => buff.buffId));
    const filteredBuffs = nextBuffs.filter((buff) => !buff.expireWithBuffId || activeBuffIds.has(buff.expireWithBuffId));
    if (filteredBuffs.length !== nextBuffs.length) {
      removed = true;
    }
    player.temporaryBuffs = filteredBuffs;
    if (removed) {
      this.attrService.recalcPlayer(player);
    }
    return removed || resourceSpent;
  }

}

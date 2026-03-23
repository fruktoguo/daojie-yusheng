/**
 * Tick 引擎 —— 每张地图独立的定时循环驱动器。
 * 每 tick 收集玩家指令、执行游戏逻辑、广播状态增量，
 * 同时负责定时落盘和配置热重载。
 */
import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import {
  AUTO_IDLE_CULTIVATION_DELAY_TICKS,
  ActionDef,
  ActionUpdateEntry,
  AutoBattleSkillConfig,
  CombatEffect,
  DEFAULT_AURA_LEVEL_BASE_VALUE,
  DEFAULT_OFFLINE_PLAYER_TIMEOUT_SEC,
  Direction,
  getAuraLevel,
  GroundItemPilePatch,
  GroundItemPileView,
  normalizeAuraLevelBaseValue,
  parseTileTargetRef,
  PLAYER_HEARTBEAT_TIMEOUT_MS,
  PlayerState,
  RenderEntity,
  S2C,
  S2C_ActionsUpdate,
  S2C_AttrUpdate,
  S2C_EquipmentUpdate,
  S2C_InventoryUpdate,
  S2C_LootWindowUpdate,
  S2C_QuestUpdate,
  S2C_SystemMsg,
  S2C_TechniqueUpdate,
  S2C_Tick,
  TechniqueState,
  TechniqueUpdateEntry,
  TickRenderEntity,
  VisibleTile,
  VisibleTilePatch,
  PERSIST_INTERVAL,
} from '@mud/shared';
import * as fs from 'fs';
import * as path from 'path';
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
import { TechniqueService } from './technique.service';
import { TimeService } from './time.service';
import { WorldMessage, WorldService, WorldUpdate } from './world.service';

const CONFIG_PATH = path.resolve(__dirname, '../../data/config.json');

/** 上一次发送给各玩家的 tick 快照，用于增量比对 */
interface LastSentTickState {
  mapId?: string;
  hp?: number;
  qi?: number;
  facing?: Direction;
  auraLevelBaseValue?: number;
  pathSignature: string;
  visibilityKey?: string;
  tilePatchRevision?: number;
  mapMetaSignature?: string;
  minimapSignature?: string;
  minimapLibrarySignature?: string;
}

interface SyncActionsOptions {
  skipQuestSync?: boolean;
}

@Injectable()
export class TickService implements OnModuleInit, OnModuleDestroy {
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private lastTickTime: Map<string, number> = new Map();
  private mapTickSpeed: Map<string, number> = new Map();
  private pausedMaps: Set<string> = new Set();
  private lastSentTickState: Map<string, LastSentTickState> = new Map();
  private lastSentAttrUpdates: Map<string, S2C_AttrUpdate> = new Map();
  private lastSentTechniqueStates: Map<string, Map<string, TechniqueState>> = new Map();
  private lastSentActionStates: Map<string, Map<string, ActionDef>> = new Map();
  private lastSentGroundPiles: Map<string, Map<string, GroundItemPileView>> = new Map();
  private lastSentVisibleTiles: Map<string, Map<string, VisibleTile>> = new Map();
  private lastSentRenderEntities: Map<string, Map<string, RenderEntity>> = new Map();
  private persistTimer: ReturnType<typeof setInterval> | null = null;
  private minTickInterval = 1000;
  private offlinePlayerTimeoutMs = DEFAULT_OFFLINE_PLAYER_TIMEOUT_SEC * 1000;
  private auraLevelBaseValue = DEFAULT_AURA_LEVEL_BASE_VALUE;
  private watcher: fs.FSWatcher | null = null;
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
  ) {}

  onModuleInit() {
    this.loadConfig();
    this.watchConfig();
    setTimeout(() => {
      this.ensureMapTicks();
      this.logger.log(`Tick 引擎已启动，地图数: ${this.timers.size}`);
    }, 0);

    this.persistTimer = setInterval(() => {
      const startedAt = process.hrtime.bigint();
      Promise.all([
        this.playerService.persistAll(),
        Promise.resolve().then(() => this.mapService.persistTileRuntimeStates()),
      ]).then(() => {
        const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        this.performanceService.recordCpuSection(elapsedMs, 'io_persist', '落盘与外部 I/O');
      }).catch((err) => {
        this.logger.error(`定时落盘失败: ${err.message}`);
      });
    }, PERSIST_INTERVAL * 1000);
    this.logger.log(`定时落盘已启动，间隔: ${PERSIST_INTERVAL}s`);
  }

  /** 清除玩家的所有增量同步缓存（切图或重连时调用） */
  resetPlayerSyncState(playerId: string): void {
    this.lastSentTickState.delete(playerId);
    this.lastSentAttrUpdates.delete(playerId);
    this.lastSentTechniqueStates.delete(playerId);
    this.lastSentActionStates.delete(playerId);
    this.lastSentGroundPiles.delete(playerId);
    this.lastSentVisibleTiles.delete(playerId);
    this.lastSentRenderEntities.delete(playerId);
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
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.mapService.persistTileRuntimeStates();
    await this.playerService.persistAll().catch((err) => {
      this.logger.error(`关闭落盘失败: ${err.message}`);
    });
  }

  private loadConfig() {
    try {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const cfg = JSON.parse(raw);
      if (typeof cfg.minTickInterval === 'number' && cfg.minTickInterval > 0) {
        this.minTickInterval = cfg.minTickInterval;
        this.logger.log(`配置已加载: minTickInterval=${this.minTickInterval}ms`);
      }
      if (typeof cfg.offlinePlayerTimeoutSec === 'number' && cfg.offlinePlayerTimeoutSec > 0) {
        this.offlinePlayerTimeoutMs = Math.floor(cfg.offlinePlayerTimeoutSec * 1000);
        this.logger.log(`配置已加载: offlinePlayerTimeoutSec=${cfg.offlinePlayerTimeoutSec}s`);
      }
      const nextAuraLevelBaseValue = normalizeAuraLevelBaseValue(cfg.auraLevelBaseValue, this.auraLevelBaseValue);
      if (nextAuraLevelBaseValue !== this.auraLevelBaseValue) {
        this.auraLevelBaseValue = nextAuraLevelBaseValue;
        this.logger.log(`配置已加载: auraLevelBaseValue=${this.auraLevelBaseValue}`);
      }
      this.mapService.setAuraLevelBaseValue(this.auraLevelBaseValue);
    } catch (error) {
      this.logger.warn(`读取配置失败，使用默认值: ${error}`);
    }
  }

  getAuraLevelBaseValue(): number {
    return this.auraLevelBaseValue;
  }

  private watchConfig() {
    try {
      this.watcher = fs.watch(CONFIG_PATH, () => {
        this.loadConfig();
      });
    } catch (error) {
      this.logger.warn(`监听配置文件失败: ${error}`);
    }
  }

  /** 启动指定地图的 tick 循环（幂等，已启动则跳过） */
  startMapTick(mapId: string) {
    if (this.timers.has(mapId)) return;
    this.lastTickTime.set(mapId, Date.now());
    this.scheduleNextTick(mapId, this.minTickInterval);
  }

  /** 设置地图 tick 倍率，0 = 暂停 */
  setMapTickSpeed(mapId: string, speed: number): void {
    const clamped = Math.max(0, Math.min(100, speed));
    this.mapTickSpeed.set(mapId, clamped);
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

  private getEffectiveInterval(mapId: string): number {
    const speed = this.mapTickSpeed.get(mapId) ?? 1;
    if (speed <= 0) return this.minTickInterval;
    return Math.max(10, Math.round(this.minTickInterval / speed));
  }

  private scheduleNextTick(mapId: string, delay: number) {
    if (this.pausedMaps.has(mapId)) {
      this.timers.delete(mapId);
      return;
    }
    const timer = setTimeout(() => {
      const start = Date.now();
      this.tick(mapId, start);
      const elapsed = Date.now() - start;
      this.performanceService.recordTick(elapsed);
      const effectiveInterval = this.getEffectiveInterval(mapId);
      const nextDelay = Math.max(0, effectiveInterval - elapsed);
      this.scheduleNextTick(mapId, nextDelay);
    }, delay);
    this.timers.set(mapId, timer);
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
      for (const command of gmCommands) {
        const error = this.gmService.applyCommand(command);
        if (!error) continue;

        if ('playerId' in command && typeof command.playerId === 'string') {
          messages.push({ playerId: command.playerId, text: error, kind: 'system' });
        }
      }
    });

    const lootTick = this.measureCpuSection('loot', '掉落与容器', () => this.lootService.tick(mapId, this.playerService.getPlayersByMap(mapId)));
    for (const playerId of lootTick.dirtyPlayers) {
      this.playerService.markDirty(playerId, 'loot');
    }

    this.measureCpuSection('player_presence', '在线态与保活', () => {
      this.tickPlayerPresence(mapId, now);
    });

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
            if (player.autoBattle) {
              player.autoBattle = false;
              player.combatTargetId = undefined;
              player.combatTargetLocked = false;
              this.playerService.markDirty(player.id, 'actions');
            }
            this.applyCultivationResult(player.id, this.techniqueService.interruptCultivation(player, 'move'), messages);
            const { d } = cmd.data as { d: Direction };
            const moved = this.navigationService.stepPlayerByDirection(player, d);
            if (moved) {
              this.applyAutoTravelIfNeeded(player, messages);
            }
          });
          break;
        }
        case 'moveTo': {
          this.measureCpuSection('pathfinding', '寻路与移动', () => {
            if (player.autoBattle) {
              player.autoBattle = false;
              player.combatTargetId = undefined;
              player.combatTargetLocked = false;
              this.playerService.markDirty(player.id, 'actions');
            }
            this.applyCultivationResult(player.id, this.techniqueService.interruptCultivation(player, 'move'), messages);
            const { x, y, allowNearestReachable } = cmd.data as { x: number; y: number; allowNearestReachable?: boolean };
            const error = this.navigationService.setMoveTarget(player, x, y, { allowNearestReachable });
            if (error) {
              messages.push({ playerId: player.id, text: error, kind: 'system' });
            }
          });
          break;
        }
        case 'takeLoot': {
          this.measureCpuSection('loot', '掉落与容器', () => {
            const { sourceId, itemKey } = cmd.data as { sourceId: string; itemKey: string };
            const result = this.lootService.takeFromSource(player, sourceId, itemKey);
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
          const action = this.actionService.getAction(player, actionId);
          if (!action) {
            messages.push({ playerId: player.id, text: '行动不存在', kind: 'system' });
            break;
          }
          if (action.cooldownLeft > 0) {
            messages.push({ playerId: player.id, text: `技能仍在冷却中，还需 ${action.cooldownLeft} 息`, kind: 'system' });
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
      }
    }

    this.measureCpuSection('bot_ai', '机器人 AI', () => {
      this.botService.tickBots(mapId);
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
      const startX = player.x;
      const startY = player.y;
      const timeUpdate = this.measureCpuSection('time_effects', '时间与环境效果', () => (
        this.timeService.syncPlayerTimeEffects(player)
      ));
      if (timeUpdate.changed) {
        this.playerService.markDirty(player.id, 'actions');
      }
      const phaseDispatch = this.equipmentEffectService.syncTimePhase(player, timeUpdate.state.phase);
      if (phaseDispatch.dirty.length > 0) {
        this.markDirty(player.id, phaseDispatch.dirty as DirtyFlag[]);
      }

      if (!player.autoBattle) {
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

      const cultivationEffects = this.equipmentEffectService.dispatch(player, { trigger: 'on_cultivation_tick' });
      if (cultivationEffects.dirty.length > 0) {
        this.markDirty(player.id, cultivationEffects.dirty as DirtyFlag[]);
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
      if (this.measureCpuSection('state_buffs', '角色状态: Buff 推进', () => this.tickTemporaryBuffs(player))) {
        this.playerService.markDirty(player.id, 'attr');
      }

      if (this.measureCpuSection('state_cooldowns', '角色状态: 冷却推进', () => this.actionService.tickCooldowns(player))) {
        this.playerService.markDirty(player.id, 'actions');
      }

      if (player.x !== startX || player.y !== startY) {
        const moveEffects = this.equipmentEffectService.dispatch(player, { trigger: 'on_move' });
        if (moveEffects.dirty.length > 0) {
          this.markDirty(player.id, moveEffects.dirty as DirtyFlag[]);
        }
      }

      if (this.syncActions(player)) {
        this.playerService.markDirty(player.id, 'actions');
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
      this.playerService.markDirty(playerId, 'actions');
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
      if (this.syncActions(player, { skipQuestSync: true })) {
        this.playerService.markDirty(player.id, 'actions');
      }
    }

    const finalMapPlayers = this.playerService.getPlayersByMap(mapId);
    for (const player of finalMapPlayers) {
      affectedPlayers.set(player.id, player);
    }

    this.flushDirtyUpdates([...affectedPlayers.values()]);
    this.measureCpuSection('broadcast_messages', '广播: 系统消息分发', () => {
      this.flushMessages(messages);
    });
    this.broadcastTicks(mapId, finalMapPlayers, dt);
    this.mapService.clearDirtyTileKeys(mapId);
    this.ensureMapTicks();
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

  /** 使用物品后应用其效果（回血、学功法、解锁地图等） */
  private applyItemEffect(player: PlayerState, itemId: string, messages: WorldMessage[], count = 1) {
    const item = this.contentService.getItem(itemId);
    if (!item) return;

    if (item.healAmount) {
      const actualCount = Math.max(1, Math.floor(count));
      const previousHp = player.hp;
      player.hp = Math.min(player.maxHp, player.hp + item.healAmount * actualCount);
      messages.push({
        playerId: player.id,
        text: `你服下 ${item.name}${actualCount > 1 ? ` x${actualCount}` : ''}，恢复了 ${player.hp - previousHp} 点气血。`,
        kind: 'loot',
      });
      return;
    }

    if (item.tileAuraGainAmount) {
      const actualCount = Math.max(1, Math.floor(count));
      const currentAura = this.mapService.getTileAura(player.mapId, player.x, player.y);
      const addedAura = item.tileAuraGainAmount * actualCount;
      const nextAura = this.mapService.setTileAura(player.mapId, player.x, player.y, currentAura + addedAura);
      if (nextAura === null) {
        messages.push({ playerId: player.id, text: '此地灵脉紊乱，灵石未能生效。', kind: 'system' });
        return;
      }
      messages.push({
        playerId: player.id,
        text: `你捏碎 ${item.name}${actualCount > 1 ? ` x${actualCount}` : ''}，脚下地块灵力增加 ${addedAura} 点。当前灵力 ${nextAura}。`,
        kind: 'loot',
      });
      return;
    }

    if (item.learnTechniqueId) {
      const technique = this.contentService.getTechnique(item.learnTechniqueId);
      if (!technique) {
        messages.push({ playerId: player.id, text: '技能书内容残缺，无法参悟。', kind: 'system' });
        return;
      }
      const err = this.techniqueService.learnTechnique(player, technique.id, technique.name, technique.skills, technique.grade, technique.layers);
      if (err) {
        messages.push({ playerId: player.id, text: err, kind: 'system' });
        return;
      }
      this.markDirty(player.id, ['tech', 'actions', 'attr']);
      messages.push({
        playerId: player.id,
        text: `你参悟了 ${technique.name}。`,
        kind: 'quest',
      });
      return;
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
      this.playerService.markDirty(dirtyPlayerId, 'actions');
    }
  }

  /** 检测玩家踩到自动传送点时触发地图切换 */
  private applyAutoTravelIfNeeded(player: PlayerState, messages: WorldMessage[]): boolean {
    const update = this.worldService.tryAutoTravel(player);
    if (!update) {
      return false;
    }
    this.applyWorldUpdate(player.id, update, messages);
    return true;
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
      this.playerService.markDirty(playerId, flag);
    }
  }

  /** 重新构建玩家的可用行动列表，返回是否发生变化 */
  private syncActions(player: PlayerState, options?: SyncActionsOptions): boolean {
    const before = this.measureCpuSection('state_actions_before', '动作重建: 重建前快照', () => (
      JSON.stringify(player.actions.map((action) => ({
        id: action.id,
        name: action.name,
        desc: action.desc,
        cooldownLeft: action.cooldownLeft,
        type: action.type,
        autoBattleEnabled: action.autoBattleEnabled,
        autoBattleOrder: action.autoBattleOrder,
      })))
    ));
    const contextActions = this.measureCpuSection('state_actions_context', '动作重建: 场景动作收集', () => (
      this.worldService.getContextActions(player, { skipQuestSync: options?.skipQuestSync })
    ));
    this.measureCpuSection('state_actions_core', '动作重建: 核心构建', () => {
      this.actionService.rebuildActions(player, contextActions);
    });
    const after = this.measureCpuSection('state_actions_after', '动作重建: 重建后快照', () => (
      JSON.stringify(player.actions.map((action) => ({
        id: action.id,
        name: action.name,
        desc: action.desc,
        cooldownLeft: action.cooldownLeft,
        type: action.type,
        autoBattleEnabled: action.autoBattleEnabled,
        autoBattleOrder: action.autoBattleOrder,
      })))
    ));
    return before !== after;
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
          const cultivation = this.techniqueService.stopCultivation(player, '你收束气机，停止了当前修炼。', 'quest');
          player.cultivatingTechId = undefined;
          this.applyCultivationResult(player.id, cultivation, messages);
          messages.push({ playerId: player.id, text: '你收束气机，取消了当前主修功法。', kind: 'quest' });
          this.playerService.markDirty(player.id, 'tech');
          this.playerService.markDirty(player.id, 'actions');
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
        this.playerService.markDirty(player.id, 'actions');
        break;
      }
      case 'updateAutoBattleSkills': {
        const { skills } = data as { skills: AutoBattleSkillConfig[] };
        if (this.actionService.updateAutoBattleSkills(player, skills)) {
          this.playerService.markDirty(player.id, 'actions');
        }
        break;
      }
    }

    // 即时推送操作者自身的脏数据
    this.flushPlayerDirtyUpdates(player);
    // 即时推送操作者的系统消息
    this.flushImmediateMessages(player.id, messages);
  }

  /** 将所有脏标记对应的数据变更推送给各玩家客户端 */
  private flushDirtyUpdates(players: PlayerState[]) {
    for (const player of players) {
      this.flushPlayerDirtyUpdates(player);
    }
  }

  /** 推送单个玩家的脏标记数据并清除标记 */
  private flushPlayerDirtyUpdates(player: PlayerState) {
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

    if (flags.has('attr')) {
      this.measureCpuSection('state_sync_attr', '状态同步: 属性面板', () => {
        const finalAttrs = this.attrService.getPlayerFinalAttrs(player);
        const numericStats = this.attrService.getPlayerNumericStats(player);
        const ratioDivisors = this.attrService.getPlayerRatioDivisors(player);
        const update = this.buildSparseAttrUpdate(player.id, {
          baseAttrs: player.baseAttrs,
          bonuses: player.bonuses,
          finalAttrs,
          numericStats,
          ratioDivisors,
          maxHp: player.maxHp,
          qi: player.qi,
          realm: player.realm,
        });
        if (update) {
          socket.emit(S2C.AttrUpdate, update);
        }
      });
    }
    if (flags.has('inv')) {
      this.measureCpuSection('state_sync_inventory', '状态同步: 背包与装备', () => {
        const update: S2C_InventoryUpdate = { inventory: player.inventory };
        socket.emit(S2C.InventoryUpdate, update);
      });
    }
    if (flags.has('equip')) {
      this.measureCpuSection('state_sync_inventory', '状态同步: 背包与装备', () => {
        const update: S2C_EquipmentUpdate = { equipment: player.equipment };
        socket.emit(S2C.EquipmentUpdate, update);
      });
    }
    if (flags.has('tech')) {
      this.measureCpuSection('state_sync_tech', '状态同步: 功法面板', () => {
        const update: S2C_TechniqueUpdate = {
          techniques: this.buildSparseTechniqueStates(player.id, player.techniques),
          cultivatingTechId: player.cultivatingTechId,
        };
        socket.emit(S2C.TechniqueUpdate, update);
      });
    }
    if (flags.has('actions')) {
      this.measureCpuSection('state_sync_actions', '状态同步: 动作面板', () => {
        const update: S2C_ActionsUpdate = {
          actions: this.buildSparseActionStates(player.id, player.actions),
          autoBattle: player.autoBattle,
          autoRetaliate: player.autoRetaliate,
          autoIdleCultivation: player.autoIdleCultivation,
          senseQiActive: player.senseQiActive,
        };
        socket.emit(S2C.ActionsUpdate, update);
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
        const update: S2C_QuestUpdate = { quests: player.quests };
        socket.emit(S2C.QuestUpdate, update);
      });
    }

    this.playerService.clearDirtyFlags(player.id);
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
      const time = this.measureCpuSection('broadcast_time', '广播: 时间状态构建', () => (
        this.timeService.buildPlayerTimeState(viewer)
      ));
      const visibility = this.measureCpuSection('broadcast_aoi', '广播: AOI 可见性', () => (
        this.aoiService.getVisibility(viewer, time.effectiveViewRange)
      ));
      const clientVisibleTiles = this.measureCpuSection('broadcast_patch_tiles_transform', '地块 Patch: 客户端视图转换', () => (
        this.toClientVisibleTiles(visibility.tiles)
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
      const path = this.navigationService.getPathPoints(viewer.id);
      const pathSignature = this.buildPathSignature(path);
      const mapChanged = previous?.mapId !== viewer.mapId;
      if (mapChanged) {
        this.resetPlayerSyncState(viewer.id);
        previous = undefined;
      }
      const visibilityKey = this.buildVisibilityKey(viewer, time.effectiveViewRange);
      const visibilityChanged = !previous || previous.visibilityKey !== visibilityKey;
      const canUseDirtyTilePatches = !overlayParentMapId;
      const tilePatchRevision = canUseDirtyTilePatches
        ? this.mapService.getTilePatchRevision(viewer.mapId)
        : undefined;
      const mapMeta = this.mapService.getMapMeta(viewer.mapId);
      const mapMetaSignature = this.buildMapMetaSignature(mapMeta);
      const unlockedMinimapIds = this.getUnlockedMinimapIds(viewer);
      const minimapSignature = unlockedMinimapIds.includes(viewer.mapId)
        ? this.mapService.getMinimapSignature(viewer.mapId)
        : '';
      const minimapLibrarySignature = this.buildMinimapLibrarySignature(unlockedMinimapIds);
      const visibleEntityIds = new Set<string>();
      const tileOriginX = viewer.x - time.effectiveViewRange;
      const tileOriginY = viewer.y - time.effectiveViewRange;
      const groundPilePatches = this.measureCpuSection('broadcast_patch_ground', '广播: 掉落差量 Patch', () => (
        this.buildSparseGroundPiles(viewer.id, visibleGroundPiles)
      ));
      const tilePatches = visibilityChanged
        ? []
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
      if (visibilityChanged) {
        this.syncVisibleTileCache(viewer.id, clientVisibleTiles, tileOriginX, tileOriginY);
      }
      const tickData: S2C_Tick = {
        p: this.buildSparseRenderEntities(viewer.id, visiblePlayers, visibleEntityIds),
        e: this.buildSparseRenderEntities(viewer.id, visibleEntities, visibleEntityIds),
        fx: this.measureCpuSection('broadcast_patch_effects', '广播: 特效过滤', () => (
          this.filterEffectsForViewer(effects, visibility.visibleKeys)
        )),
        dt,
        time,
      };
      if (groundPilePatches.length > 0) {
        tickData.g = groundPilePatches;
      }
      if (tilePatches.length > 0) {
        tickData.t = tilePatches;
      }
      this.measureCpuSection('broadcast_cache', '广播: 缓存修剪', () => {
        this.pruneRenderEntityCache(viewer.id, visibleEntityIds);
      });
      if (visibilityChanged) {
        tickData.v = clientVisibleTiles;
        tickData.visibleMinimapMarkers = this.mapService.getVisibleMinimapMarkers(viewer.mapId, visibility.visibleKeys);
      }
      if (mapChanged) {
        tickData.m = viewer.mapId;
      }
      if (mapChanged || previous?.mapMetaSignature !== mapMetaSignature) {
        tickData.mapMeta = mapMeta;
      }
      if (mapChanged || previous?.minimapSignature !== minimapSignature) {
        tickData.minimap = unlockedMinimapIds.includes(viewer.mapId)
          ? this.mapService.getMinimapSnapshot(viewer.mapId)
          : undefined;
      }
      if (mapChanged || previous?.minimapLibrarySignature !== minimapLibrarySignature) {
        tickData.minimapLibrary = this.mapService.getMinimapArchiveEntries(unlockedMinimapIds);
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
      if (!previous || previous.pathSignature !== pathSignature) {
        tickData.path = path;
      }

      this.measureCpuSection('broadcast_emit', '广播: Socket 发送', () => {
        socket.emit(S2C.Tick, tickData);
      });
      this.lastSentTickState.set(viewer.id, {
        mapId: viewer.mapId,
        hp: viewer.hp,
        qi: viewer.qi,
        facing: viewer.facing,
        auraLevelBaseValue: this.auraLevelBaseValue,
        pathSignature,
        visibilityKey,
        tilePatchRevision,
        mapMetaSignature,
        minimapSignature,
        minimapLibrarySignature,
      });
    }
  }

  private buildPathSignature(path: [number, number][] | undefined): string {
    if (!path || path.length === 0) {
      return '';
    }
    return path.map(([x, y]) => `${x},${y}`).join('|');
  }

  private toClientVisibleTiles(tiles: VisibleTile[][]): VisibleTile[][] {
    return tiles.map((row) => row.map((tile) => this.toClientVisibleTile(tile)));
  }

  private toClientVisibleTile(tile: VisibleTile): VisibleTile {
    if (!tile) {
      return null;
    }
    return {
      ...this.cloneStructured(tile),
      aura: getAuraLevel(tile.aura ?? 0, this.auraLevelBaseValue),
    };
  }

  private buildVisibilityKey(viewer: PlayerState, effectiveViewRange: number): string {
    return [
      viewer.mapId,
      this.mapService.getVisibilityRevision(viewer.mapId),
      viewer.x,
      viewer.y,
      effectiveViewRange,
    ].join(':');
  }

  private buildMapMetaSignature(mapMeta: ReturnType<MapService['getMapMeta']>): string {
    return JSON.stringify(mapMeta ?? null);
  }

  /** 构建属性增量包，仅发送与上次不同的字段 */
  private buildSparseAttrUpdate(playerId: string, nextState: S2C_AttrUpdate): S2C_AttrUpdate | null {
    const previous = this.lastSentAttrUpdates.get(playerId);
    const patch: S2C_AttrUpdate = {};

    if (!previous || !this.isStructuredEqual(previous.baseAttrs, nextState.baseAttrs)) {
      patch.baseAttrs = JSON.parse(JSON.stringify(nextState.baseAttrs)) as typeof nextState.baseAttrs;
    }
    if (!previous || !this.isStructuredEqual(previous.bonuses, nextState.bonuses)) {
      patch.bonuses = JSON.parse(JSON.stringify(nextState.bonuses)) as typeof nextState.bonuses;
    }
    if (!previous || !this.isStructuredEqual(previous.finalAttrs, nextState.finalAttrs)) {
      patch.finalAttrs = JSON.parse(JSON.stringify(nextState.finalAttrs)) as typeof nextState.finalAttrs;
    }
    if (!previous || !this.isStructuredEqual(previous.numericStats, nextState.numericStats)) {
      patch.numericStats = JSON.parse(JSON.stringify(nextState.numericStats)) as typeof nextState.numericStats;
    }
    if (!previous || !this.isStructuredEqual(previous.ratioDivisors, nextState.ratioDivisors)) {
      patch.ratioDivisors = JSON.parse(JSON.stringify(nextState.ratioDivisors)) as typeof nextState.ratioDivisors;
    }
    if (!previous || previous.maxHp !== nextState.maxHp) {
      patch.maxHp = nextState.maxHp;
    }
    if (!previous || previous.qi !== nextState.qi) {
      patch.qi = nextState.qi;
    }
    if (!previous || !this.isStructuredEqual(previous.realm, nextState.realm)) {
      patch.realm = nextState.realm ? JSON.parse(JSON.stringify(nextState.realm)) as typeof nextState.realm : null;
    }

    this.lastSentAttrUpdates.set(playerId, JSON.parse(JSON.stringify(nextState)) as S2C_AttrUpdate);
    return Object.keys(patch).length > 0 ? patch : null;
  }

  /** 构建功法增量包，仅发送与上次不同的字段 */
  private buildSparseTechniqueStates(playerId: string, techniques: TechniqueState[]): TechniqueUpdateEntry[] {
    let cache = this.lastSentTechniqueStates.get(playerId);
    if (!cache) {
      cache = new Map<string, TechniqueState>();
      this.lastSentTechniqueStates.set(playerId, cache);
    }

    const nextCache = new Map<string, TechniqueState>();
    const patches = techniques.map((technique) => {
      const previous = cache!.get(technique.techId);
      const patch: TechniqueUpdateEntry = {
        techId: technique.techId,
        level: technique.level,
        exp: technique.exp,
        expToNext: technique.expToNext,
        realm: technique.realm,
      };

      if (!previous || previous.name !== technique.name) patch.name = technique.name ?? null;
      if (!previous || previous.grade !== technique.grade) patch.grade = technique.grade ?? null;
      if (!previous || !this.isStructuredEqual(previous.skills, technique.skills)) {
        patch.skills = technique.skills ? JSON.parse(JSON.stringify(technique.skills)) as typeof technique.skills : null;
      }
      if (!previous || !this.isStructuredEqual(previous.layers, technique.layers)) {
        patch.layers = technique.layers ? JSON.parse(JSON.stringify(technique.layers)) as typeof technique.layers : null;
      }
      if (!previous || !this.isStructuredEqual(previous.attrCurves, technique.attrCurves)) {
        patch.attrCurves = technique.attrCurves ? JSON.parse(JSON.stringify(technique.attrCurves)) as typeof technique.attrCurves : null;
      }

      nextCache.set(technique.techId, JSON.parse(JSON.stringify(technique)) as TechniqueState);
      return patch;
    });

    this.lastSentTechniqueStates.set(playerId, nextCache);
    return patches;
  }

  /** 构建行动列表增量包，仅发送与上次不同的字段 */
  private buildSparseActionStates(playerId: string, actions: ActionDef[]): ActionUpdateEntry[] {
    let cache = this.lastSentActionStates.get(playerId);
    if (!cache) {
      cache = new Map<string, ActionDef>();
      this.lastSentActionStates.set(playerId, cache);
    }

    const nextCache = new Map<string, ActionDef>();
    const patches = actions.map((action) => {
      const previous = cache!.get(action.id);
      const patch: ActionUpdateEntry = {
        id: action.id,
        cooldownLeft: action.cooldownLeft,
      };

      if (!previous || previous.autoBattleEnabled !== action.autoBattleEnabled) {
        patch.autoBattleEnabled = action.autoBattleEnabled ?? null;
      }
      if (!previous || previous.autoBattleOrder !== action.autoBattleOrder) {
        patch.autoBattleOrder = action.autoBattleOrder ?? null;
      }
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

      nextCache.set(action.id, JSON.parse(JSON.stringify(action)) as ActionDef);
      return patch;
    });

    this.lastSentActionStates.set(playerId, nextCache);
    return patches;
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
          items: JSON.parse(JSON.stringify(pile.items)) as typeof pile.items,
        });
      }
      nextCache.set(pile.sourceId, JSON.parse(JSON.stringify(pile)) as GroundItemPileView);
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
        const next: TickRenderEntity = {
          id: entity.id,
          x: entity.x,
          y: entity.y,
        };

        if (!previous || previous.char !== entity.char) next.char = entity.char;
        if (!previous || previous.color !== entity.color) next.color = entity.color;
        if (!previous || previous.name !== entity.name) next.name = entity.name ?? null;
        if (!previous || previous.kind !== entity.kind) next.kind = entity.kind ?? null;
        if (!previous || previous.hp !== entity.hp) next.hp = entity.hp ?? null;
        if (!previous || previous.maxHp !== entity.maxHp) next.maxHp = entity.maxHp ?? null;
        if (!previous || previous.qi !== entity.qi) next.qi = entity.qi ?? null;
        if (!previous || previous.maxQi !== entity.maxQi) next.maxQi = entity.maxQi ?? null;
        if (!previous || !this.isStructuredEqual(previous.npcQuestMarker, entity.npcQuestMarker)) {
          next.npcQuestMarker = entity.npcQuestMarker ?? null;
        }
        if (!previous || !this.isStructuredEqual(previous.observation, entity.observation)) {
          next.observation = entity.observation ?? null;
        }
        pending.push({
          entity,
          next,
          syncBuffs: !previous || !this.isStructuredEqual(previous.buffs, entity.buffs),
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
  private pruneRenderEntityCache(viewerId: string, visibleEntityIds: Set<string>): void {
    const cache = this.lastSentRenderEntities.get(viewerId);
    if (!cache) {
      return;
    }

    for (const entityId of cache.keys()) {
      if (!visibleEntityIds.has(entityId)) {
        cache.delete(entityId);
      }
    }
  }

  private isStructuredEqual(left: unknown, right: unknown): boolean {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  }

  private cloneStructured<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  /** 过滤出观察者视野范围内的战斗特效 */
  private filterEffectsForViewer(effects: CombatEffect[], visibleKeys: Set<string>): CombatEffect[] {
    return effects.filter((effect) => {
      if (effect.type === 'attack') {
        return visibleKeys.has(`${effect.fromX},${effect.fromY}`) || visibleKeys.has(`${effect.toX},${effect.toY}`);
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

  /** 每 tick 递减临时 Buff 剩余时间，过期则移除并重算属性 */
  private tickTemporaryBuffs(player: PlayerState): boolean {
    if (!player.temporaryBuffs || player.temporaryBuffs.length === 0) {
      return false;
    }
    const before = player.temporaryBuffs.length;
    for (const buff of player.temporaryBuffs) {
      buff.remainingTicks -= 1;
    }
    player.temporaryBuffs = player.temporaryBuffs.filter((buff) => buff.remainingTicks > 0 && buff.stacks > 0);
    if (player.temporaryBuffs.length !== before) {
      this.attrService.recalcPlayer(player);
      return true;
    }
    return false;
  }

}

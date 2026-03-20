import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import {
  AutoBattleSkillConfig,
  CombatEffect,
  Direction,
  PlayerState,
  S2C,
  S2C_ActionsUpdate,
  S2C_AttrUpdate,
  S2C_EquipmentUpdate,
  S2C_InventoryUpdate,
  S2C_QuestUpdate,
  S2C_SystemMsg,
  S2C_TechniqueUpdate,
  S2C_Tick,
  PERSIST_INTERVAL,
} from '@mud/shared';
import * as fs from 'fs';
import * as path from 'path';
import { ActionService } from './action.service';
import { AoiService } from './aoi.service';
import { AttrService } from './attr.service';
import { ContentService } from './content.service';
import { EquipmentService } from './equipment.service';
import { InventoryService } from './inventory.service';
import { MapService } from './map.service';
import { NavigationService } from './navigation.service';
import { BotService } from './bot.service';
import { PerformanceService } from './performance.service';
import { DirtyFlag, PlayerService } from './player.service';
import { TechniqueService } from './technique.service';
import { WorldMessage, WorldService, WorldUpdate } from './world.service';

const CONFIG_PATH = path.resolve(__dirname, '../../data/config.json');

@Injectable()
export class TickService implements OnModuleInit, OnModuleDestroy {
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private lastTickTime: Map<string, number> = new Map();
  private persistTimer: ReturnType<typeof setInterval> | null = null;
  private minTickInterval = 1000;
  private watcher: fs.FSWatcher | null = null;
  private readonly logger = new Logger(TickService.name);

  constructor(
    private readonly playerService: PlayerService,
    private readonly mapService: MapService,
    private readonly aoiService: AoiService,
    private readonly navigationService: NavigationService,
    private readonly botService: BotService,
    private readonly performanceService: PerformanceService,
    private readonly attrService: AttrService,
    private readonly inventoryService: InventoryService,
    private readonly equipmentService: EquipmentService,
    private readonly techniqueService: TechniqueService,
    private readonly actionService: ActionService,
    private readonly contentService: ContentService,
    private readonly worldService: WorldService,
  ) {}

  onModuleInit() {
    this.loadConfig();
    this.watchConfig();
    setTimeout(() => {
      for (const mapId of this.mapService.getAllMapIds()) {
        this.startMapTick(mapId);
      }
      this.logger.log(`Tick 引擎已启动，地图数: ${this.timers.size}`);
    }, 0);

    this.persistTimer = setInterval(() => {
      this.playerService.persistAll().catch((err) => {
        this.logger.error(`定时落盘失败: ${err.message}`);
      });
    }, PERSIST_INTERVAL * 1000);
    this.logger.log(`定时落盘已启动，间隔: ${PERSIST_INTERVAL}s`);
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
    } catch (error) {
      this.logger.warn(`读取配置失败，使用默认值: ${error}`);
    }
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

  startMapTick(mapId: string) {
    if (this.timers.has(mapId)) return;
    this.lastTickTime.set(mapId, Date.now());
    this.scheduleNextTick(mapId, this.minTickInterval);
  }

  private scheduleNextTick(mapId: string, delay: number) {
    const timer = setTimeout(() => {
      const start = Date.now();
      this.tick(mapId, start);
      const elapsed = Date.now() - start;
      this.performanceService.recordTick(elapsed);
      const nextDelay = Math.max(0, this.minTickInterval - elapsed);
      this.scheduleNextTick(mapId, nextDelay);
    }, delay);
    this.timers.set(mapId, timer);
  }

  private tick(mapId: string, now: number) {
    const last = this.lastTickTime.get(mapId) ?? now;
    const dt = now - last;
    this.lastTickTime.set(mapId, now);

    const messages: WorldMessage[] = [];
    const commands = this.playerService.drainCommands(mapId);
    const affectedPlayers = new Map<string, PlayerState>();

    for (const cmd of commands) {
      const player = this.playerService.getPlayer(cmd.playerId);
      if (!player || player.mapId !== mapId) continue;
      const isDebugReset =
        cmd.type === 'debugResetSpawn' ||
        (cmd.type === 'action' && (cmd.data as { actionId?: string })?.actionId === 'debug:reset_spawn');
      if (player.dead && !isDebugReset) continue;
      affectedPlayers.set(player.id, player);

      switch (cmd.type) {
        case 'move': {
          this.navigationService.clearMoveTarget(player.id);
          if (player.autoBattle) {
            player.autoBattle = false;
            player.combatTargetId = undefined;
            this.playerService.markDirty(player.id, 'actions');
          }
          const { d } = cmd.data as { d: Direction };
          this.navigationService.stepPlayerByDirection(player, d);
          break;
        }
        case 'moveTo': {
          if (player.autoBattle) {
            player.autoBattle = false;
            player.combatTargetId = undefined;
            this.playerService.markDirty(player.id, 'actions');
          }
          const { x, y, allowNearestReachable } = cmd.data as { x: number; y: number; allowNearestReachable?: boolean };
          const error = this.navigationService.setMoveTarget(player, x, y, { allowNearestReachable });
          if (error) {
            messages.push({ playerId: player.id, text: error, kind: 'system' });
          }
          break;
        }
        case 'useItem': {
          const { slotIndex } = cmd.data as { slotIndex: number };
          const item = this.inventoryService.getItem(player, slotIndex);
          if (!item) {
            messages.push({ playerId: player.id, text: '物品不存在', kind: 'system' });
            break;
          }
          const itemDef = this.contentService.getItem(item.itemId);
          if (itemDef?.learnTechniqueId && player.techniques.some((technique) => technique.techId === itemDef.learnTechniqueId)) {
            messages.push({ playerId: player.id, text: '你已经学会这门功法了。', kind: 'system' });
            break;
          }
          const err = this.inventoryService.useItem(player, slotIndex);
          if (err) {
            messages.push({ playerId: player.id, text: err, kind: 'system' });
            break;
          }
          this.playerService.markDirty(player.id, 'inv');
          this.applyItemEffect(player, item.itemId, messages);
          break;
        }
        case 'dropItem': {
          const { slotIndex, count } = cmd.data as { slotIndex: number; count: number };
          const err = this.inventoryService.dropItem(player, slotIndex, count);
          if (!err) {
            this.playerService.markDirty(player.id, 'inv');
          } else {
            messages.push({ playerId: player.id, text: err, kind: 'system' });
          }
          break;
        }
        case 'sortInventory': {
          this.inventoryService.sortInventory(player);
          this.playerService.markDirty(player.id, 'inv');
          messages.push({ playerId: player.id, text: '背包已整理', kind: 'system' });
          break;
        }
        case 'equip': {
          const { slotIndex } = cmd.data as { slotIndex: number };
          const err = this.equipmentService.equip(player, slotIndex);
          if (!err) {
            this.markDirty(player.id, ['inv', 'equip', 'attr']);
          } else {
            messages.push({ playerId: player.id, text: err, kind: 'system' });
          }
          break;
        }
        case 'unequip': {
          const { slot } = cmd.data as { slot: string };
          const err = this.equipmentService.unequip(player, slot as any);
          if (!err) {
            this.markDirty(player.id, ['inv', 'equip', 'attr']);
          } else {
            messages.push({ playerId: player.id, text: err, kind: 'system' });
          }
          break;
        }
        case 'cultivate': {
          const { techId } = cmd.data as { techId: string | null };
          if (!techId) {
            player.cultivatingTechId = undefined;
            messages.push({ playerId: player.id, text: '你收束气机，暂时停止修炼。', kind: 'quest' });
            this.playerService.markDirty(player.id, 'tech');
            break;
          }

          const technique = player.techniques.find((entry) => entry.techId === techId);
          if (!technique) {
            messages.push({ playerId: player.id, text: '尚未掌握该功法，无法运转修炼。', kind: 'system' });
            break;
          }

          player.cultivatingTechId = techId;
          messages.push({ playerId: player.id, text: `你开始运转 ${technique.name}，持续凝练修为。`, kind: 'quest' });
          this.playerService.markDirty(player.id, 'tech');
          break;
        }
        case 'updateAutoBattleSkills': {
          const { skills } = cmd.data as { skills: AutoBattleSkillConfig[] };
          if (this.actionService.updateAutoBattleSkills(player, skills)) {
            this.playerService.markDirty(player.id, 'actions');
          }
          break;
        }
        case 'debugResetSpawn': {
          this.logger.log(`执行调试回城: ${player.id}`);
          const result = this.worldService.resetPlayerToSpawn(player);
          this.applyWorldUpdate(player.id, result, messages);
          break;
        }
        case 'action': {
          const { actionId, target } = cmd.data as { actionId: string; target?: string };
          if (actionId === 'debug:reset_spawn') {
            this.logger.log(`执行兼容调试回城(action): ${player.id}`);
            const result = this.worldService.resetPlayerToSpawn(player);
            this.applyWorldUpdate(player.id, result, messages);
            break;
          }
          if (actionId === 'battle:engage') {
            const result = this.worldService.engageTarget(player, target);
            this.applyWorldUpdate(player.id, result, messages);
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
            result = action.requiresTarget === false
              ? this.worldService.performSkill(player, actionId)
              : this.worldService.performTargetedSkill(player, actionId, target);
            if (!result.error) {
              const cooldownError = this.actionService.beginCooldown(player, actionId);
              if (cooldownError) {
                result = { ...result, error: cooldownError };
              } else {
                result.dirty.push('actions');
              }
            }
          } else {
            result = this.worldService.handleInteraction(player, actionId);
          }

          this.applyWorldUpdate(player.id, result, messages);
          break;
        }
      }
    }

    this.botService.tickBots(mapId);

    const mapPlayers = this.playerService.getPlayersByMap(mapId);
    for (const player of mapPlayers) {
      affectedPlayers.set(player.id, player);
      if (player.dead) continue;

      if (!player.autoBattle) {
        const navigation = this.navigationService.stepPlayerTowardTarget(player);
        if (navigation.error) {
          messages.push({ playerId: player.id, text: navigation.error, kind: 'system' });
        }
      }

      const autoBattle = this.worldService.performAutoBattle(player);
      if (autoBattle.usedActionId) {
        const cooldownError = this.actionService.beginCooldown(player, autoBattle.usedActionId);
        if (!cooldownError) {
          autoBattle.dirty.push('actions');
        }
      }
      this.applyWorldUpdate(player.id, autoBattle, messages);

      const cultivation = this.techniqueService.cultivateTick(player);
      if (cultivation.changed) {
        for (const flag of cultivation.dirty) {
          this.playerService.markDirty(player.id, flag);
        }
        for (const message of cultivation.messages) {
          messages.push({ playerId: player.id, text: message.text, kind: message.kind });
        }
      }

      for (const flag of this.worldService.syncQuestState(player)) {
        this.playerService.markDirty(player.id, flag);
      }

      this.applyNaturalRecovery(player);
      if (this.tickTemporaryBuffs(player)) {
        this.playerService.markDirty(player.id, 'attr');
      }

      if (this.actionService.tickCooldowns(player)) {
        this.playerService.markDirty(player.id, 'actions');
      }

      if (this.syncActions(player)) {
        this.playerService.markDirty(player.id, 'actions');
      }
    }

    const monsterUpdates = this.worldService.tickMonsters(mapId, mapPlayers);
    messages.push(...monsterUpdates.messages);
    for (const playerId of monsterUpdates.dirtyPlayers ?? []) {
      this.playerService.markDirty(playerId, 'actions');
      this.playerService.markDirty(playerId, 'attr');
    }

    for (const player of mapPlayers) {
      if (this.syncActions(player)) {
        this.playerService.markDirty(player.id, 'actions');
      }
    }

    const finalMapPlayers = this.playerService.getPlayersByMap(mapId);
    for (const player of finalMapPlayers) {
      affectedPlayers.set(player.id, player);
    }

    this.flushDirtyUpdates([...affectedPlayers.values()]);
    this.flushMessages(messages);
    this.broadcastTicks(mapId, finalMapPlayers, dt);
  }

  private applyItemEffect(player: PlayerState, itemId: string, messages: WorldMessage[]) {
    const item = this.contentService.getItem(itemId);
    if (!item) return;

    if (item.healAmount) {
      player.hp = Math.min(player.maxHp, player.hp + item.healAmount);
      messages.push({
        playerId: player.id,
        text: `你服下 ${item.name}，恢复了 ${item.healAmount} 点气血。`,
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
    }
  }

  private applyWorldUpdate(playerId: string, update: WorldUpdate, messages: WorldMessage[]) {
    if (update.error) {
      messages.push({ playerId, text: update.error, kind: 'system' });
    }
    messages.push(...update.messages);
    this.markDirty(playerId, update.dirty as DirtyFlag[]);
  }

  private markDirty(playerId: string, flags: DirtyFlag[]) {
    for (const flag of flags) {
      this.playerService.markDirty(playerId, flag);
    }
  }

  private syncActions(player: PlayerState): boolean {
    const before = JSON.stringify(player.actions.map((action) => ({
      id: action.id,
      name: action.name,
      desc: action.desc,
      cooldownLeft: action.cooldownLeft,
      type: action.type,
      autoBattleEnabled: action.autoBattleEnabled,
      autoBattleOrder: action.autoBattleOrder,
    })));
    this.actionService.rebuildActions(player, this.worldService.getContextActions(player));
    const after = JSON.stringify(player.actions.map((action) => ({
      id: action.id,
      name: action.name,
      desc: action.desc,
      cooldownLeft: action.cooldownLeft,
      type: action.type,
      autoBattleEnabled: action.autoBattleEnabled,
      autoBattleOrder: action.autoBattleOrder,
    })));
    return before !== after;
  }

  private flushDirtyUpdates(players: PlayerState[]) {
    for (const player of players) {
      this.techniqueService.initializePlayerProgression(player);
      const flags = this.playerService.getDirtyFlags(player.id);
      if (!flags || flags.size === 0) continue;
      const socket = this.playerService.getSocket(player.id);
      if (!socket) continue;

      if (flags.has('attr')) {
        const finalAttrs = this.attrService.getPlayerFinalAttrs(player);
        const numericStats = this.attrService.getPlayerNumericStats(player);
        const ratioDivisors = this.attrService.getPlayerRatioDivisors(player);
        const update: S2C_AttrUpdate = {
          baseAttrs: player.baseAttrs,
          bonuses: player.bonuses,
          finalAttrs,
          numericStats,
          ratioDivisors,
          maxHp: player.maxHp,
          qi: player.qi,
          realm: player.realm,
        };
        socket.emit(S2C.AttrUpdate, update);
      }
      if (flags.has('inv')) {
        const update: S2C_InventoryUpdate = { inventory: player.inventory };
        socket.emit(S2C.InventoryUpdate, update);
      }
      if (flags.has('equip')) {
        const update: S2C_EquipmentUpdate = { equipment: player.equipment };
        socket.emit(S2C.EquipmentUpdate, update);
      }
      if (flags.has('tech')) {
        const update: S2C_TechniqueUpdate = {
          techniques: player.techniques,
          cultivatingTechId: player.cultivatingTechId,
        };
        socket.emit(S2C.TechniqueUpdate, update);
      }
      if (flags.has('actions')) {
        const update: S2C_ActionsUpdate = {
          actions: player.actions,
          autoBattle: player.autoBattle,
          autoRetaliate: player.autoRetaliate,
        };
        socket.emit(S2C.ActionsUpdate, update);
      }
      if (flags.has('quest')) {
        const update: S2C_QuestUpdate = { quests: player.quests };
        socket.emit(S2C.QuestUpdate, update);
      }

      this.playerService.clearDirtyFlags(player.id);
    }
  }

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

  private broadcastTicks(mapId: string, players: PlayerState[], dt: number) {
    const effects = this.worldService.drainEffects(mapId);
    for (const viewer of players) {
      const socket = this.playerService.getSocket(viewer.id);
      if (!socket) continue;
      const visibility = this.aoiService.getVisibility(viewer);

      const visiblePlayers = players
        .filter((player) => visibility.visibleKeys.has(`${player.x},${player.y}`))
        .map((player) => this.worldService.buildPlayerRenderEntity(
          viewer,
          player,
          player.id === viewer.id ? '#ff0' : player.isBot ? '#6bb8ff' : '#0f0',
        ));
      const visibleEntities = this.worldService.getVisibleEntities(viewer, visibility.visibleKeys);

      const tickData: S2C_Tick = {
        p: visiblePlayers,
        t: [],
        e: visibleEntities,
        fx: this.filterEffectsForViewer(effects, visibility.visibleKeys),
        v: visibility.tiles,
        dt,
        m: viewer.mapId,
        mapMeta: this.mapService.getMapMeta(viewer.mapId),
        path: this.navigationService.getPathPoints(viewer.id),
        hp: viewer.hp,
        qi: viewer.qi,
        f: viewer.facing,
      };

      socket.emit(S2C.Tick, tickData);
    }
  }

  private filterEffectsForViewer(effects: CombatEffect[], visibleKeys: Set<string>): CombatEffect[] {
    return effects.filter((effect) => {
      if (effect.type === 'attack') {
        return visibleKeys.has(`${effect.fromX},${effect.fromY}`) || visibleKeys.has(`${effect.toX},${effect.toY}`);
      }
      return visibleKeys.has(`${effect.x},${effect.y}`);
    });
  }

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

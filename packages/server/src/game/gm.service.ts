import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AttrBonus,
  Attributes,
  AutoBattleSkillConfig,
  DEFAULT_BASE_ATTRS,
  DEFAULT_INVENTORY_CAPACITY,
  Direction,
  EquipmentSlots,
  GmManagedPlayerRecord,
  GmStateRes,
  Inventory,
  PlayerState,
  QuestState,
  TechniqueState,
  TemporaryBuffState,
  VIEW_RADIUS,
} from '@mud/shared';
import { PlayerEntity } from '../database/entities/player.entity';
import { BotService } from './bot.service';
import { ContentService } from './content.service';
import { MapService } from './map.service';
import { NavigationService } from './navigation.service';
import { PerformanceService } from './performance.service';
import { DirtyFlag, PlayerService } from './player.service';
import { TechniqueService } from './technique.service';
import { WorldService } from './world.service';

type GmCommand =
  | {
      type: 'updatePlayer';
      playerId: string;
      snapshot: PlayerState;
    }
  | {
      type: 'resetPlayer';
      playerId: string;
    }
  | {
      type: 'spawnBots';
      anchorPlayerId: string;
      mapId: string;
      x: number;
      y: number;
      count: number;
    }
  | {
      type: 'removeBots';
      playerIds?: string[];
      all?: boolean;
    };

@Injectable()
export class GmService {
  private readonly commandsByMap = new Map<string, GmCommand[]>();

  constructor(
    @InjectRepository(PlayerEntity)
    private readonly playerRepo: Repository<PlayerEntity>,
    private readonly botService: BotService,
    private readonly playerService: PlayerService,
    private readonly mapService: MapService,
    private readonly navigationService: NavigationService,
    private readonly performanceService: PerformanceService,
    private readonly worldService: WorldService,
    private readonly contentService: ContentService,
    private readonly techniqueService: TechniqueService,
  ) {}

  async getState(): Promise<GmStateRes> {
    const [entities, runtimePlayers] = await Promise.all([
      this.playerRepo.find(),
      Promise.resolve(this.playerService.getAllPlayers()),
    ]);

    const runtimeById = new Map(runtimePlayers.map((player) => [player.id, player]));
    const records: GmManagedPlayerRecord[] = [];

    for (const entity of entities) {
      const runtime = runtimeById.get(entity.id);
      const snapshot = runtime ? this.clonePlayer(runtime) : this.hydrateStoredPlayer(entity);
      records.push(this.buildRecord(snapshot, entity.userId, runtime ? true : false, entity.updatedAt));
      runtimeById.delete(entity.id);
    }

    for (const runtime of runtimeById.values()) {
      records.push(this.buildRecord(runtime, undefined, true, undefined));
    }

    records.sort((left, right) => {
      if (left.meta.isBot !== right.meta.isBot) return left.meta.isBot ? 1 : -1;
      if (left.meta.online !== right.meta.online) return left.meta.online ? -1 : 1;
      if (left.mapId !== right.mapId) return left.mapId.localeCompare(right.mapId);
      return left.name.localeCompare(right.name, 'zh-CN');
    });

    return {
      players: records,
      mapIds: this.mapService.getAllMapIds().sort(),
      botCount: this.botService.getBotCount(),
      perf: this.performanceService.getSnapshot(),
    };
  }

  async enqueuePlayerUpdate(playerId: string, snapshot: PlayerState): Promise<string | null> {
    const runtime = this.playerService.getPlayer(playerId);
    if (runtime) {
      this.enqueue(runtime.mapId, {
        type: 'updatePlayer',
        playerId,
        snapshot: this.clonePlayer(snapshot),
      });
      return null;
    }

    const entity = await this.playerRepo.findOne({ where: { id: playerId } });
    if (!entity) return '目标玩家不存在';

    const player = this.hydrateStoredPlayer(entity);
    const error = this.applyPlayerSnapshot(player, snapshot, false);
    if (error) return error;

    await this.persistOfflinePlayer(entity, player);
    return null;
  }

  async enqueueResetPlayer(playerId: string): Promise<string | null> {
    const runtime = this.playerService.getPlayer(playerId);
    if (runtime) {
      this.enqueue(runtime.mapId, { type: 'resetPlayer', playerId });
      return null;
    }

    const entity = await this.playerRepo.findOne({ where: { id: playerId } });
    if (!entity) return '目标玩家不存在';

    const player = this.hydrateStoredPlayer(entity);
    this.resetStoredPlayerToSpawn(player);
    await this.persistOfflinePlayer(entity, player);
    return null;
  }

  async enqueueSpawnBots(anchorPlayerId: string, count: number): Promise<string | null> {
    const runtime = this.playerService.getPlayer(anchorPlayerId);
    if (runtime) {
      this.enqueue(runtime.mapId, {
        type: 'spawnBots',
        anchorPlayerId,
        mapId: runtime.mapId,
        x: runtime.x,
        y: runtime.y,
        count,
      });
      return null;
    }

    const entity = await this.playerRepo.findOne({ where: { id: anchorPlayerId } });
    if (!entity) return '锚点玩家不存在';

    this.enqueue(entity.mapId, {
      type: 'spawnBots',
      anchorPlayerId,
      mapId: entity.mapId,
      x: entity.x,
      y: entity.y,
      count,
    });
    return null;
  }

  enqueueRemoveBots(playerIds?: string[], removeAll = false): string | null {
    const bots = this.playerService.getAllPlayers().filter((player) => player.isBot);
    const targets = removeAll
      ? bots
      : bots.filter((player) => playerIds?.includes(player.id));

    if (targets.length === 0) {
      return '没有可移除的机器人';
    }

    const idsByMap = new Map<string, string[]>();
    for (const target of targets) {
      const ids = idsByMap.get(target.mapId) ?? [];
      ids.push(target.id);
      idsByMap.set(target.mapId, ids);
    }

    for (const [mapId, ids] of idsByMap.entries()) {
      this.enqueue(mapId, {
        type: 'removeBots',
        playerIds: removeAll ? undefined : ids,
        all: removeAll,
      });
    }
    return null;
  }

  drainCommands(mapId: string): GmCommand[] {
    const commands = this.commandsByMap.get(mapId) ?? [];
    this.commandsByMap.set(mapId, []);
    return commands;
  }

  applyCommand(command: GmCommand): string | null {
    switch (command.type) {
      case 'updatePlayer':
        return this.applyQueuedPlayerUpdate(command.playerId, command.snapshot);
      case 'resetPlayer':
        return this.applyQueuedResetPlayer(command.playerId);
      case 'spawnBots':
        return this.applyQueuedSpawnBots(command.mapId, command.x, command.y, command.count);
      case 'removeBots':
        return this.applyQueuedRemoveBots(command.playerIds, command.all);
    }
  }

  private applyQueuedPlayerUpdate(playerId: string, snapshot: PlayerState): string | null {
    const player = this.playerService.getPlayer(playerId);
    if (!player) return '目标玩家不存在';
    const error = this.applyPlayerSnapshot(player, snapshot, true);
    if (error) return error;
    this.markDirty(player.id, ['attr', 'inv', 'equip', 'tech', 'actions', 'quest']);
    return null;
  }

  private applyQueuedResetPlayer(playerId: string): string | null {
    const player = this.playerService.getPlayer(playerId);
    if (!player) return '目标玩家不存在';
    const update = this.worldService.resetPlayerToSpawn(player);
    this.markDirty(player.id, update.dirty as DirtyFlag[]);
    return null;
  }

  private applyQueuedSpawnBots(mapId: string, x: number, y: number, count: number): string | null {
    const created = this.botService.spawnBotsAt(mapId, x, y, count);
    if (created <= 0) return '附近没有可用于生成机器人的空位';
    return null;
  }

  private applyQueuedRemoveBots(playerIds?: string[], removeAll = false): string | null {
    const removed = this.botService.removeBots(removeAll ? undefined : playerIds);
    if (removed <= 0) return '没有可移除的机器人';
    return null;
  }

  private buildRecord(
    player: PlayerState,
    userId: string | undefined,
    online: boolean,
    updatedAt: Date | undefined,
  ): GmManagedPlayerRecord {
    const snapshot = this.clonePlayer(player);
    return {
      id: player.id,
      name: player.name,
      mapId: player.mapId,
      x: player.x,
      y: player.y,
      hp: player.hp,
      maxHp: player.maxHp,
      qi: player.qi,
      dead: player.dead,
      autoBattle: player.autoBattle,
      autoRetaliate: player.autoRetaliate !== false,
      meta: {
        userId,
        isBot: Boolean(player.isBot),
        online,
        updatedAt: updatedAt?.toISOString(),
        dirtyFlags: [...(this.playerService.getDirtyFlags(player.id) ?? [])],
      },
      snapshot,
    };
  }

  private hydrateStoredPlayer(entity: PlayerEntity): PlayerState {
    const player: PlayerState = {
      id: entity.id,
      name: entity.name,
      mapId: entity.mapId,
      x: entity.x,
      y: entity.y,
      facing: this.normalizeDirection(entity.facing),
      viewRange: this.normalizePositiveInt(entity.viewRange, VIEW_RADIUS),
      hp: this.normalizeNonNegativeInt(entity.hp),
      maxHp: Math.max(1, this.normalizePositiveInt(entity.maxHp, 1)),
      qi: this.normalizeNonNegativeInt(entity.qi ?? 0),
      dead: Boolean(entity.dead),
      baseAttrs: this.normalizeAttributes(entity.baseAttrs),
      bonuses: this.cloneArray<AttrBonus>(entity.bonuses),
      temporaryBuffs: [],
      inventory: this.contentService.normalizeInventory(this.normalizeInventory(entity.inventory)),
      equipment: this.contentService.normalizeEquipment(this.normalizeEquipment(entity.equipment)),
      techniques: this.cloneArray<TechniqueState>(entity.techniques),
      quests: this.cloneArray<QuestState>(entity.quests),
      autoBattle: entity.autoBattle ?? false,
      autoBattleSkills: this.cloneArray<AutoBattleSkillConfig>(entity.autoBattleSkills),
      autoRetaliate: entity.autoRetaliate ?? true,
      actions: [],
      cultivatingTechId: entity.cultivatingTechId ?? undefined,
      revealedBreakthroughRequirementIds: Array.isArray(entity.revealedBreakthroughRequirementIds)
        ? entity.revealedBreakthroughRequirementIds.filter((entry): entry is string => typeof entry === 'string')
        : [],
    };

    this.techniqueService.initializePlayerProgression(player);
    player.hp = Math.min(player.maxHp, Math.max(0, player.hp));
    player.dead = player.hp <= 0 || player.dead;
    return player;
  }

  private applyPlayerSnapshot(player: PlayerState, snapshot: PlayerState, runtime: boolean): string | null {
    const nextMapId = typeof snapshot.mapId === 'string' ? snapshot.mapId : player.mapId;
    const nextX = this.normalizeInt(snapshot.x, player.x);
    const nextY = this.normalizeInt(snapshot.y, player.y);

    if (!this.mapService.getMapMeta(nextMapId)) {
      return '目标地图不存在';
    }
    if (!this.canSetPosition(nextMapId, nextX, nextY, player.id, runtime)) {
      return '目标坐标不可站立或已被占用';
    }

    const requestedHp = this.normalizeNonNegativeInt(snapshot.hp);
    const requestedQi = this.normalizeNonNegativeInt(snapshot.qi);

    const previousMapId = player.mapId;
    const previousX = player.x;
    const previousY = player.y;

    player.name = this.normalizeName(snapshot.name, player.name);
    player.mapId = nextMapId;
    player.x = nextX;
    player.y = nextY;
    player.facing = this.normalizeDirection(snapshot.facing);
    player.baseAttrs = this.normalizeAttributes(snapshot.baseAttrs);
    player.bonuses = this.cloneArray<AttrBonus>(snapshot.bonuses);
    player.temporaryBuffs = this.normalizeTemporaryBuffs(snapshot.temporaryBuffs);
    player.inventory = this.contentService.normalizeInventory(this.normalizeInventory(snapshot.inventory));
    player.equipment = this.contentService.normalizeEquipment(this.normalizeEquipment(snapshot.equipment));
    player.techniques = this.cloneArray<TechniqueState>(snapshot.techniques);
    player.quests = this.cloneArray<QuestState>(snapshot.quests);
    player.autoBattleSkills = this.cloneArray<AutoBattleSkillConfig>(snapshot.autoBattleSkills);
    player.autoRetaliate = snapshot.autoRetaliate !== false;
    player.revealedBreakthroughRequirementIds = Array.isArray(snapshot.revealedBreakthroughRequirementIds)
      ? snapshot.revealedBreakthroughRequirementIds.filter((entry): entry is string => typeof entry === 'string')
      : [];
    player.cultivatingTechId = typeof snapshot.cultivatingTechId === 'string' && snapshot.cultivatingTechId.length > 0
      ? snapshot.cultivatingTechId
      : undefined;

    this.techniqueService.initializePlayerProgression(player);

    player.hp = Math.min(player.maxHp, requestedHp);
    player.qi = Math.min(Math.max(0, Math.round(player.numericStats?.maxQi ?? player.qi)), requestedQi);
    player.dead = snapshot.dead === true || player.hp <= 0;
    if (player.dead) {
      player.hp = 0;
    }

    player.autoBattle = !player.dead && Boolean(snapshot.autoBattle);
    player.combatTargetId = player.autoBattle && typeof snapshot.combatTargetId === 'string'
      ? snapshot.combatTargetId
      : undefined;

    if (runtime) {
      this.navigationService.clearMoveTarget(player.id);
      if (previousMapId !== player.mapId || previousX !== player.x || previousY !== player.y) {
        this.mapService.setOccupied(previousMapId, previousX, previousY, null);
        this.mapService.setOccupied(player.mapId, player.x, player.y, player.id);
      }
    }

    return null;
  }

  private resetStoredPlayerToSpawn(player: PlayerState): void {
    const spawn = this.mapService.getSpawnPoint('spawn') ?? { x: player.x, y: player.y };
    const pos = this.mapService.findNearbyWalkable('spawn', spawn.x, spawn.y, 4) ?? spawn;
    player.mapId = 'spawn';
    player.x = pos.x;
    player.y = pos.y;
    player.facing = Direction.South;
    player.temporaryBuffs = [];
    this.techniqueService.initializePlayerProgression(player);
    player.hp = player.maxHp;
    player.qi = Math.round(player.numericStats?.maxQi ?? player.qi);
    player.dead = false;
    player.autoBattle = false;
    player.combatTargetId = undefined;
  }

  private canSetPosition(mapId: string, x: number, y: number, playerId: string, runtime: boolean): boolean {
    const tile = this.mapService.getTile(mapId, x, y);
    if (!tile?.walkable) return false;
    if (!runtime) {
      return true;
    }

    return tile.occupiedBy === null || tile.occupiedBy === playerId;
  }

  private async persistOfflinePlayer(entity: PlayerEntity, player: PlayerState): Promise<void> {
    this.techniqueService.preparePlayerForPersistence(player);
    await this.playerRepo.update(entity.id, {
      name: player.name,
      mapId: player.mapId,
      x: player.x,
      y: player.y,
      facing: player.facing,
      viewRange: player.viewRange,
      hp: player.hp,
      maxHp: player.maxHp,
      qi: player.qi,
      dead: player.dead,
      baseAttrs: player.baseAttrs as any,
      bonuses: player.bonuses as any,
      inventory: player.inventory as any,
      equipment: player.equipment as any,
      techniques: player.techniques as any,
      quests: player.quests as any,
      revealedBreakthroughRequirementIds: player.revealedBreakthroughRequirementIds as any,
      autoBattle: player.autoBattle,
      autoBattleSkills: player.autoBattleSkills as any,
      autoRetaliate: player.autoRetaliate,
      cultivatingTechId: player.cultivatingTechId ?? null,
    });
  }

  private enqueue(mapId: string, command: GmCommand): void {
    const commands = this.commandsByMap.get(mapId) ?? [];
    commands.push(command);
    this.commandsByMap.set(mapId, commands);
  }

  private markDirty(playerId: string, flags: DirtyFlag[]): void {
    for (const flag of flags) {
      this.playerService.markDirty(playerId, flag);
    }
  }

  private normalizeName(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, 50) : fallback;
  }

  private normalizeAttributes(value: unknown): Attributes {
    const source = typeof value === 'object' && value !== null ? value as Partial<Attributes> : {};
    return {
      constitution: this.normalizeNonNegativeInt(source.constitution ?? DEFAULT_BASE_ATTRS.constitution),
      spirit: this.normalizeNonNegativeInt(source.spirit ?? DEFAULT_BASE_ATTRS.spirit),
      perception: this.normalizeNonNegativeInt(source.perception ?? DEFAULT_BASE_ATTRS.perception),
      talent: this.normalizeNonNegativeInt(source.talent ?? DEFAULT_BASE_ATTRS.talent),
      comprehension: this.normalizeNonNegativeInt(source.comprehension ?? DEFAULT_BASE_ATTRS.comprehension),
      luck: this.normalizeNonNegativeInt(source.luck ?? DEFAULT_BASE_ATTRS.luck),
    };
  }

  private normalizeInventory(value: unknown): Inventory {
    const source = typeof value === 'object' && value !== null ? value as Partial<Inventory> : {};
    return {
      capacity: this.normalizePositiveInt(source.capacity, DEFAULT_INVENTORY_CAPACITY),
      items: Array.isArray(source.items) ? this.cloneArray(source.items) : [],
    };
  }

  private normalizeEquipment(value: unknown): EquipmentSlots {
    const source = typeof value === 'object' && value !== null ? value as Partial<EquipmentSlots> : {};
    return {
      weapon: source.weapon ? this.cloneObject(source.weapon) : null,
      head: source.head ? this.cloneObject(source.head) : null,
      body: source.body ? this.cloneObject(source.body) : null,
      legs: source.legs ? this.cloneObject(source.legs) : null,
      accessory: source.accessory ? this.cloneObject(source.accessory) : null,
    };
  }

  private normalizeTemporaryBuffs(value: unknown): TemporaryBuffState[] {
    return Array.isArray(value) ? this.cloneArray<TemporaryBuffState>(value) : [];
  }

  private normalizeDirection(value: unknown): Direction {
    if (value === Direction.North || value === Direction.South || value === Direction.East || value === Direction.West) {
      return value;
    }
    return Direction.South;
  }

  private normalizeInt(value: unknown, fallback = 0): number {
    return Number.isFinite(value) ? Math.floor(Number(value)) : fallback;
  }

  private normalizeNonNegativeInt(value: unknown, fallback = 0): number {
    return Math.max(0, this.normalizeInt(value, fallback));
  }

  private normalizePositiveInt(value: unknown, fallback = 1): number {
    return Math.max(1, this.normalizeInt(value, fallback));
  }

  private clonePlayer<T extends PlayerState>(player: T): T {
    return JSON.parse(JSON.stringify(player)) as T;
  }

  private cloneArray<T>(value: unknown): T[] {
    return Array.isArray(value) ? JSON.parse(JSON.stringify(value)) as T[] : [];
  }

  private cloneObject<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

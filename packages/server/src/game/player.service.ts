import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PlayerState,
  Attributes,
  AttrBonus,
  Inventory,
  EquipmentSlots,
  TechniqueState,
  TemporaryBuffState,
  ActionDef,
  AutoBattleSkillConfig,
  QuestState,
  DEFAULT_BASE_ATTRS,
  DEFAULT_INVENTORY_CAPACITY,
  DISCONNECT_RETAIN_TIME,
  Direction,
  VIEW_RADIUS,
} from '@mud/shared';
import { Socket } from 'socket.io';
import { PlayerEntity } from '../database/entities/player.entity';
import { UserEntity } from '../database/entities/user.entity';
import { RedisService } from '../database/redis.service';
import { ContentService } from './content.service';
import { MapService } from './map.service';
import { resolveQuestTargetName } from './quest-display';
import { TechniqueService } from './technique.service';
import { resolveDisplayName } from '../auth/account-validation';
import {
  buildPersistedPlayerCollections,
  hydrateEquipmentSnapshot,
  hydrateInventorySnapshot,
  hydrateQuestSnapshots,
  hydrateTemporaryBuffSnapshots,
  hydrateTechniqueSnapshots,
} from './player-storage';

export interface PlayerCommand {
  playerId: string;
  type: 'move' | 'moveTo' | 'action' | 'useItem' | 'dropItem' | 'takeLoot' | 'sortInventory' | 'equip' | 'unequip' | 'cultivate' | 'debugResetSpawn' | 'updateAutoBattleSkills';
  data: unknown;
  timestamp: number;
}

export type DirtyFlag = 'attr' | 'inv' | 'equip' | 'tech' | 'actions' | 'loot' | 'quest';

interface RetainedSession {
  player: PlayerState;
  expiresAt: number;
}

@Injectable()
export class PlayerService {
  private players: Map<string, PlayerState> = new Map();
  private commands: Map<string, PlayerCommand[]> = new Map();
  private socketMap: Map<string, Socket> = new Map();
  private userToPlayer: Map<string, string> = new Map();
  private dirtyFlags: Map<string, Set<DirtyFlag>> = new Map();
  private retainedSessions: Map<string, RetainedSession> = new Map();
  private readonly logger = new Logger(PlayerService.name);

  constructor(
    @InjectRepository(PlayerEntity)
    private readonly playerRepo: Repository<PlayerEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly redisService: RedisService,
    private readonly contentService: ContentService,
    private readonly mapService: MapService,
    private readonly techniqueService: TechniqueService,
  ) {}

  /** 标记玩家数据变更 */
  markDirty(playerId: string, flag: DirtyFlag) {
    let set = this.dirtyFlags.get(playerId);
    if (!set) {
      set = new Set();
      this.dirtyFlags.set(playerId, set);
    }
    set.add(flag);
  }

  getDirtyFlags(playerId: string): Set<DirtyFlag> | undefined {
    return this.dirtyFlags.get(playerId);
  }

  clearDirtyFlags(playerId: string) {
    this.dirtyFlags.delete(playerId);
  }

  private buildPersistedCollections(state: PlayerState) {
    return buildPersistedPlayerCollections(state, this.contentService, this.mapService);
  }

  private syncPlayerCache(state: PlayerState): Promise<void> {
    return this.redisService.setPlayer(state, this.buildPersistedCollections(state));
  }

  /** 从 PG 加载玩家存档，写入内存 + Redis */
  async loadPlayer(userId: string): Promise<PlayerState | null> {
    const [entity, user] = await Promise.all([
      this.playerRepo.findOne({ where: { userId } }),
      this.userRepo.findOne({ where: { id: userId } }),
    ]);
    if (!entity) return null;
    const resolvedName = user
      ? resolveDisplayName(user.displayName, user.username)
      : entity.name;
    const state: PlayerState = {
      id: entity.id,
      name: entity.name,
      displayName: resolvedName,
      mapId: entity.mapId,
      x: entity.x,
      y: entity.y,
      senseQiActive: false,
      facing: (entity.facing as Direction | null) ?? Direction.South,
      viewRange: entity.viewRange ?? VIEW_RADIUS,
      hp: entity.hp,
      maxHp: entity.maxHp,
      qi: entity.qi ?? 0,
      dead: entity.dead,
      baseAttrs: (entity.baseAttrs ?? { ...DEFAULT_BASE_ATTRS }) as Attributes,
      bonuses: (entity.bonuses ?? []) as AttrBonus[],
      temporaryBuffs: this.normalizeTemporaryBuffs(hydrateTemporaryBuffSnapshots(entity.temporaryBuffs, this.contentService)),
      inventory: hydrateInventorySnapshot(entity.inventory, this.contentService),
      equipment: hydrateEquipmentSnapshot(entity.equipment, this.contentService),
      techniques: hydrateTechniqueSnapshots(entity.techniques),
      quests: this.normalizeQuests(hydrateQuestSnapshots(entity.quests, this.mapService, this.contentService)),
      revealedBreakthroughRequirementIds: Array.isArray(entity.revealedBreakthroughRequirementIds)
        ? entity.revealedBreakthroughRequirementIds.filter((entry): entry is string => typeof entry === 'string')
        : [],
      autoBattle: entity.autoBattle ?? false,
      autoBattleSkills: (entity.autoBattleSkills ?? []) as AutoBattleSkillConfig[],
      autoRetaliate: entity.autoRetaliate ?? true,
      autoIdleCultivation: entity.autoIdleCultivation ?? true,
      actions: [],
      cultivatingTechId: entity.cultivatingTechId ?? undefined,
      idleTicks: 0,
      combatTargetLocked: false,
    };
    this.techniqueService.initializePlayerProgression(state);
    this.players.set(state.id, state);
    await this.syncPlayerCache(state);
    return state;
  }

  /** 创建新玩家并持久化到 PG */
  async createPlayer(state: PlayerState, userId: string): Promise<void> {
    // 用默认值填充新字段
    if (!state.baseAttrs) state.baseAttrs = { ...DEFAULT_BASE_ATTRS };
    if (!state.bonuses) state.bonuses = [];
    if (!state.temporaryBuffs) state.temporaryBuffs = [];
    if (!state.inventory) state.inventory = { items: [], capacity: DEFAULT_INVENTORY_CAPACITY };
    if (!state.equipment) state.equipment = { weapon: null, head: null, body: null, legs: null, accessory: null };
    state.inventory = this.contentService.normalizeInventory(state.inventory);
    state.equipment = this.contentService.normalizeEquipment(state.equipment);
    if (!state.techniques) state.techniques = [];
    if (!state.quests) state.quests = [];
    if (!state.revealedBreakthroughRequirementIds) state.revealedBreakthroughRequirementIds = [];
    if (state.autoBattle === undefined) state.autoBattle = false;
    if (state.combatTargetLocked === undefined) state.combatTargetLocked = false;
    if (!state.autoBattleSkills) state.autoBattleSkills = [];
    if (state.autoRetaliate === undefined) state.autoRetaliate = true;
    if (state.autoIdleCultivation === undefined) state.autoIdleCultivation = true;
    if (!state.actions) state.actions = [];
    if (state.senseQiActive === undefined) state.senseQiActive = false;
    state.idleTicks = 0;
    if (state.facing === undefined) state.facing = Direction.South;
    if (!state.viewRange) state.viewRange = VIEW_RADIUS;
    this.techniqueService.initializePlayerProgression(state);
    if (state.hp <= 0) {
      state.hp = state.maxHp;
    }
    if (!Number.isFinite(state.qi) || state.qi < 0) {
      state.qi = 0;
    }
    const persisted = this.buildPersistedCollections(state);

    const entity = this.playerRepo.create({
      id: state.id,
      userId,
      name: state.name,
      mapId: state.mapId,
      x: state.x,
      y: state.y,
      facing: state.facing,
      viewRange: state.viewRange,
      hp: state.hp,
      maxHp: state.maxHp,
      qi: state.qi,
      dead: state.dead,
      baseAttrs: state.baseAttrs as any,
      bonuses: state.bonuses as any,
      temporaryBuffs: persisted.temporaryBuffs as any,
      inventory: persisted.inventory as any,
      equipment: persisted.equipment as any,
      techniques: persisted.techniques as any,
      quests: persisted.quests as any,
      revealedBreakthroughRequirementIds: state.revealedBreakthroughRequirementIds as any,
      autoBattle: state.autoBattle,
      autoBattleSkills: state.autoBattleSkills as any,
      autoRetaliate: state.autoRetaliate,
      autoIdleCultivation: state.autoIdleCultivation,
      cultivatingTechId: state.cultivatingTechId ?? null,
    });
    await this.playerRepo.save(entity);
    this.players.set(state.id, state);
    await this.redisService.setPlayer(state, persisted);
  }

  /** 单个玩家落盘到 PG */
  async savePlayer(playerId: string): Promise<void> {
    const state = this.players.get(playerId);
    if (!state || state.isBot) return;
    this.techniqueService.preparePlayerForPersistence(state);
    const persisted = this.buildPersistedCollections(state);
    await this.playerRepo.update(playerId, {
      mapId: state.mapId,
      x: state.x,
      y: state.y,
      facing: state.facing,
      viewRange: state.viewRange,
      hp: state.hp,
      maxHp: state.maxHp,
      qi: state.qi,
      dead: state.dead,
      baseAttrs: state.baseAttrs as any,
      bonuses: state.bonuses as any,
      temporaryBuffs: persisted.temporaryBuffs as any,
      inventory: persisted.inventory as any,
      equipment: persisted.equipment as any,
      techniques: persisted.techniques as any,
      quests: persisted.quests as any,
      revealedBreakthroughRequirementIds: state.revealedBreakthroughRequirementIds as any,
      autoBattle: state.autoBattle,
      autoBattleSkills: state.autoBattleSkills as any,
      autoRetaliate: state.autoRetaliate,
      autoIdleCultivation: state.autoIdleCultivation,
      cultivatingTechId: state.cultivatingTechId ?? null,
    });
  }

  /** 批量落盘所有在线玩家 */
  async persistAll(): Promise<void> {
    const states = [...this.players.values()].filter((player) => !player.isBot);
    if (states.length === 0) return;
    for (const state of states) {
      this.techniqueService.preparePlayerForPersistence(state);
    }
    const entities = states.map((state) => {
      const persisted = this.buildPersistedCollections(state);
      return this.playerRepo.create({
        id: state.id,
        name: state.name,
        mapId: state.mapId,
        x: state.x,
        y: state.y,
        facing: state.facing,
        viewRange: state.viewRange,
        hp: state.hp,
        maxHp: state.maxHp,
        qi: state.qi,
        dead: state.dead,
        baseAttrs: state.baseAttrs as any,
        bonuses: state.bonuses as any,
        temporaryBuffs: persisted.temporaryBuffs as any,
        inventory: persisted.inventory as any,
        equipment: persisted.equipment as any,
        techniques: persisted.techniques as any,
        quests: persisted.quests as any,
        revealedBreakthroughRequirementIds: state.revealedBreakthroughRequirementIds as any,
        autoBattle: state.autoBattle,
        autoBattleSkills: state.autoBattleSkills as any,
        autoRetaliate: state.autoRetaliate,
        autoIdleCultivation: state.autoIdleCultivation,
        cultivatingTechId: state.cultivatingTechId ?? null,
      });
    });
    await this.playerRepo.save(entities);
    this.logger.log(`批量落盘 ${entities.length} 名玩家`);
  }

  addPlayer(state: PlayerState) {
    this.players.set(state.id, state);
    this.syncPlayerCache(state).catch(() => {});
  }

  addRuntimePlayer(state: PlayerState) {
    this.players.set(state.id, state);
  }

  removePlayer(playerId: string) {
    this.players.delete(playerId);
    this.socketMap.delete(playerId);
    this.dirtyFlags.delete(playerId);
    this.redisService.removePlayer(playerId).catch(() => {});
  }

  removeRuntimePlayer(playerId: string) {
    this.players.delete(playerId);
    this.socketMap.delete(playerId);
    this.dirtyFlags.delete(playerId);
  }

  getPlayer(playerId: string): PlayerState | undefined {
    return this.players.get(playerId);
  }

  getPlayersByMap(mapId: string): PlayerState[] {
    const result: PlayerState[] = [];
    for (const p of this.players.values()) {
      if (p.mapId === mapId) result.push(p);
    }
    return result;
  }

  getAllPlayers(): PlayerState[] {
    return [...this.players.values()];
  }

  getSocket(playerId: string): Socket | undefined {
    return this.socketMap.get(playerId);
  }

  setSocket(playerId: string, socket: Socket) {
    this.socketMap.set(playerId, socket);
  }

  removeSocket(playerId: string) {
    this.socketMap.delete(playerId);
  }

  getPlayerByUserId(userId: string): string | undefined {
    return this.userToPlayer.get(userId);
  }

  getUserIdByPlayerId(playerId: string): string | undefined {
    for (const [userId, mappedPlayerId] of this.userToPlayer.entries()) {
      if (mappedPlayerId === playerId) {
        return userId;
      }
    }
    return undefined;
  }

  setUserMapping(userId: string, playerId: string) {
    this.userToPlayer.set(userId, playerId);
  }

  removeUserMapping(userId: string) {
    this.userToPlayer.delete(userId);
  }

  retainPlayer(userId: string, playerId: string) {
    const player = this.players.get(playerId);
    if (!player) return;

    this.retainedSessions.set(userId, {
      player,
      expiresAt: Date.now() + DISCONNECT_RETAIN_TIME * 1000,
    });

    this.players.delete(playerId);
    this.socketMap.delete(playerId);
    this.dirtyFlags.delete(playerId);
  }

  restoreRetainedPlayer(userId: string): PlayerState | null {
    const retained = this.retainedSessions.get(userId);
    if (!retained) return null;
    if (retained.expiresAt <= Date.now()) {
      this.retainedSessions.delete(userId);
      return null;
    }

    this.retainedSessions.delete(userId);
    this.players.set(retained.player.id, retained.player);
    this.syncPlayerCache(retained.player).catch(() => {});
    return retained.player;
  }

  clearExpiredRetainedSessions() {
    const now = Date.now();
    for (const [userId, retained] of this.retainedSessions.entries()) {
      if (retained.expiresAt <= now) {
        this.retainedSessions.delete(userId);
      }
    }
  }

  async updatePlayerDisplayName(userId: string, displayName: string): Promise<void> {
    const playerId = this.userToPlayer.get(userId);
    if (!playerId) {
      return;
    }
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }
    player.displayName = displayName;
    await this.syncPlayerCache(player);
  }

  async updatePlayerRoleName(userId: string, roleName: string): Promise<void> {
    const playerId = this.userToPlayer.get(userId);
    if (!playerId) {
      return;
    }
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }
    player.name = roleName;
    await this.syncPlayerCache(player);
  }

  enqueueCommand(mapId: string, cmd: PlayerCommand) {
    const list = this.commands.get(mapId) ?? [];
    list.push(cmd);
    this.commands.set(mapId, list);
  }

  /** 取出并清空命令队列，同 type+playerId 去重保留最后一条 */
  drainCommands(mapId: string): PlayerCommand[] {
    const list = this.commands.get(mapId) ?? [];
    this.commands.set(mapId, []);
    // 按 type+playerId 去重，保留最后一条
    const map = new Map<string, PlayerCommand>();
    for (const cmd of list) {
      map.set(`${cmd.playerId}:${cmd.type}`, cmd);
    }
    return [...map.values()];
  }

  private normalizeQuests(quests: QuestState[]): QuestState[] {
    return quests.map((quest) => ({
      ...quest,
      line: quest.line === 'main' || quest.line === 'daily' || quest.line === 'encounter'
        ? quest.line
        : 'side',
      objectiveType: quest.objectiveType ?? 'kill',
      targetName: resolveQuestTargetName({
        objectiveType: quest.objectiveType ?? 'kill',
        title: quest.title,
        targetName: quest.targetName,
        targetMonsterId: quest.targetMonsterId,
        targetTechniqueId: quest.targetTechniqueId,
        targetRealmStage: quest.targetRealmStage,
        resolveMonsterName: (monsterId) => this.mapService.getMonsterSpawn(monsterId)?.name,
        resolveTechniqueName: (techniqueId) => this.contentService.getTechnique(techniqueId)?.name,
      }),
      targetMonsterId: quest.targetMonsterId ?? '',
      rewardItemId: quest.rewardItemId ?? quest.rewardItemIds?.[0] ?? '',
      rewardItemIds: Array.isArray(quest.rewardItemIds)
        ? [...quest.rewardItemIds]
        : quest.rewardItemId
          ? [quest.rewardItemId]
          : [],
      rewards: Array.isArray(quest.rewards) ? quest.rewards.map((reward) => ({ ...reward })) : [],
      giverMapId: quest.giverMapId,
      giverMapName: quest.giverMapId && (!quest.giverMapName || quest.giverMapName === quest.giverMapId)
        ? this.mapService.getMapMeta(quest.giverMapId)?.name ?? quest.giverMapName
        : quest.giverMapName,
      giverX: quest.giverX,
      giverY: quest.giverY,
    }));
  }

  private normalizeTemporaryBuffs(value: unknown): TemporaryBuffState[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry) => this.cloneJson<TemporaryBuffState>(entry))
      .filter((buff): buff is TemporaryBuffState => (
        Boolean(buff)
        && typeof buff.buffId === 'string'
        && buff.buffId.length > 0
        && typeof buff.name === 'string'
        && buff.name.length > 0
        && typeof buff.shortMark === 'string'
        && buff.shortMark.length > 0
        && typeof buff.sourceSkillId === 'string'
        && buff.sourceSkillId.length > 0
        && Number.isFinite(buff.remainingTicks)
        && Number.isFinite(buff.duration)
        && Number.isFinite(buff.stacks)
        && Number.isFinite(buff.maxStacks)
        && buff.remainingTicks > 0
        && buff.stacks > 0
        && buff.maxStacks > 0
      ));
  }

  private cloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

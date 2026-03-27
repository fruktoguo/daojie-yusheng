/**
 * 玩家服务 —— 管理所有已加载玩家的内存状态、Socket 映射、命令队列、
 * 脏标记系统，以及与 PG/Redis 的存档读写。
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
  DEFAULT_BONE_AGE_YEARS,
  DEFAULT_INVENTORY_CAPACITY,
  Direction,
  normalizeBoneAgeBaseYears,
  normalizeLifeElapsedTicks,
  normalizeLifespanYears,
  truncateRoleName,
  VIEW_RADIUS,
  clonePlainValue,
  S2C,
} from '@mud/shared';
import { Socket } from 'socket.io';
import { PlayerEntity } from '../database/entities/player.entity';
import { UserEntity } from '../database/entities/user.entity';
import { RedisService } from '../database/redis.service';
import { ContentService } from './content.service';
import { MapService } from './map.service';
import { resolveQuestTargetName } from './quest-display';
import { EquipmentService } from './equipment.service';
import { TechniqueService } from './technique.service';
import { resolveDisplayName } from '../auth/account-validation';
import {
  buildPersistedPlayerCollections,
  hydrateEquipmentSnapshot,
  hydrateInventorySnapshot,
  hydrateMarketStorageSnapshot,
  hydrateQuestSnapshots,
  hydrateTemporaryBuffSnapshots,
  hydrateTechniqueSnapshots,
} from './player-storage';

/** 即时执行的操作类型（不入队，gateway 收到后直接执行） */
export type ImmediateCommandType = 'equip' | 'unequip' | 'sortInventory' | 'useItem' | 'dropItem' | 'destroyItem' | 'cultivate' | 'updateAutoBattleSkills';

/** 玩家指令，由客户端消息转化后入队，在 tick 中统一执行 */
export interface PlayerCommand {
  playerId: string;
  type: 'move' | 'moveTo' | 'navigateQuest' | 'action' | 'takeLoot' | 'debugResetSpawn' | 'buyNpcShopItem';
  data: unknown;
  timestamp: number;
}

/** 数据变更类型标记，用于增量同步 */
export type DirtyFlag = 'attr' | 'inv' | 'equip' | 'tech' | 'actions' | 'loot' | 'quest';

function normalizeUnlockedMinimapIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0))].sort();
}

function normalizeNonNegativeCounter(value: unknown): number {
  return Math.max(0, Number.isFinite(value) ? Math.floor(Number(value)) : 0);
}

@Injectable()
export class PlayerService implements OnModuleInit {
  private players: Map<string, PlayerState> = new Map();
  private commands: Map<string, PlayerCommand[]> = new Map();
  private socketMap: Map<string, Socket> = new Map();
  private userToPlayer: Map<string, string> = new Map();
  private onlineSessionStartedAtByUserId: Map<string, number> = new Map();
  private dirtyFlags: Map<string, Set<DirtyFlag>> = new Map();
  private readonly logger = new Logger(PlayerService.name);

  constructor(
    @InjectRepository(PlayerEntity)
    private readonly playerRepo: Repository<PlayerEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly redisService: RedisService,
    private readonly contentService: ContentService,
    private readonly mapService: MapService,
    private readonly equipmentService: EquipmentService,
    private readonly techniqueService: TechniqueService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.normalizePersistedRoleNames();
  }

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

  private normalizePersistedTechniqueState(state: PlayerState): void {
    state.heavenGate = this.techniqueService.normalizeHeavenGateState(state.heavenGate);
    state.spiritualRoots = this.techniqueService.normalizeHeavenGateRoots(state.spiritualRoots);
  }

  private toNullableJsonbValue(value: unknown): any {
    return value === null ? (() => "'null'::jsonb") : value;
  }

  private buildPlayerPersistencePayload(state: PlayerState, persisted: ReturnType<PlayerService['buildPersistedCollections']>) {
    this.normalizePersistedTechniqueState(state);
    return {
      mapId: state.mapId,
      x: state.x,
      y: state.y,
      facing: state.facing,
      viewRange: state.viewRange,
      hp: state.hp,
      maxHp: state.maxHp,
      qi: state.qi,
      dead: state.dead,
      foundation: state.foundation,
      combatExp: state.combatExp,
      boneAgeBaseYears: state.boneAgeBaseYears,
      lifeElapsedTicks: state.lifeElapsedTicks,
      lifespanYears: state.lifespanYears,
      baseAttrs: state.baseAttrs as any,
      bonuses: state.bonuses as any,
      temporaryBuffs: persisted.temporaryBuffs as any,
      inventory: persisted.inventory as any,
      marketStorage: persisted.marketStorage as any,
      equipment: persisted.equipment as any,
      techniques: persisted.techniques as any,
      quests: persisted.quests as any,
      questCrossMapNavCooldownUntilLifeTicks: state.questCrossMapNavCooldownUntilLifeTicks ?? 0,
      revealedBreakthroughRequirementIds: state.revealedBreakthroughRequirementIds as any,
      heavenGate: this.toNullableJsonbValue(state.heavenGate),
      spiritualRoots: this.toNullableJsonbValue(state.spiritualRoots),
      unlockedMinimapIds: state.unlockedMinimapIds as any,
      autoBattle: state.autoBattle,
      autoBattleSkills: state.autoBattleSkills as any,
      autoRetaliate: state.autoRetaliate,
      autoBattleStationary: state.autoBattleStationary === true,
      allowAoePlayerHit: state.allowAoePlayerHit === true,
      autoIdleCultivation: state.autoIdleCultivation,
      autoSwitchCultivation: state.autoSwitchCultivation === true,
      cultivatingTechId: state.cultivatingTechId ?? null,
      online: state.online === true,
      inWorld: state.inWorld !== false,
      lastHeartbeatAt: state.lastHeartbeatAt ? new Date(state.lastHeartbeatAt) : null,
      offlineSinceAt: state.offlineSinceAt ? new Date(state.offlineSinceAt) : null,
    };
  }

  /** 将玩家状态同步到 Redis 缓存 */
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
    if (user) {
      await this.settleRecoveredOnlineSession(user);
    }
    const state = this.hydratePlayerState(entity, user
      ? resolveDisplayName(user.displayName, user.username)
      : entity.name);
    const resolvedPosition = this.resolveRetainedPlayerPosition(state);
    if (resolvedPosition.mapId !== state.mapId || resolvedPosition.x !== state.x || resolvedPosition.y !== state.y) {
      state.mapId = resolvedPosition.mapId;
      state.x = resolvedPosition.x;
      state.y = resolvedPosition.y;
      await this.playerRepo.update(state.id, {
        mapId: state.mapId,
        x: state.x,
        y: state.y,
      });
    }
    this.players.set(state.id, state);
    await this.syncPlayerCache(state);
    return state;
  }

  /**
   * 启动时恢复仍应留在世界中的玩家。
   * 规则：
   * - `inWorld=true` 的角色都会重新进入运行时；
   * - 重启前残留为 `online=true` 的角色，会在恢复时转为离线挂机；
   * - 若已超过离线超时，则直接按超时离场收口，不再恢复到世界中。
   */
  async restoreRetainedPlayers(offlinePlayerTimeoutMs: number, now = Date.now()): Promise<{
    restored: number;
    expired: number;
    recoveredOnline: number;
  }> {
    const entities = await this.playerRepo.find({
      where: { inWorld: true },
      order: {
        updatedAt: 'ASC',
        id: 'ASC',
      },
    });
    if (entities.length === 0) {
      return { restored: 0, expired: 0, recoveredOnline: 0 };
    }

    const users = await this.userRepo.findBy({
      id: In(entities.map((entity) => entity.userId)),
    });
    const userById = new Map(users.map((user) => [user.id, user]));

    let restored = 0;
    let expired = 0;
    let recoveredOnline = 0;

    for (const entity of entities) {
      const user = userById.get(entity.userId);
      if (user) {
        await this.settleRecoveredOnlineSession(user, now);
      }
      const displayName = user
        ? resolveDisplayName(user.displayName, user.username)
        : entity.name;
      const state = this.hydratePlayerState(entity, displayName);

      if (state.online === true) {
        recoveredOnline += 1;
      }
      state.online = false;
      state.offlineSinceAt = state.offlineSinceAt ?? now;

      if (state.offlineSinceAt > 0 && now - state.offlineSinceAt >= offlinePlayerTimeoutMs) {
        await this.expireRetainedPlayer(state);
        expired += 1;
        continue;
      }

      const resolvedPosition = this.resolveRetainedPlayerPosition(state);
      state.mapId = resolvedPosition.mapId;
      state.x = resolvedPosition.x;
      state.y = resolvedPosition.y;
      state.inWorld = true;
      state.idleTicks = 0;

      this.players.set(state.id, state);
      this.userToPlayer.set(entity.userId, state.id);
      this.mapService.addOccupant(state.mapId, state.x, state.y, state.id, 'player');
      await this.persistPlayerState(state);
      await this.syncPlayerCache(state);
      restored += 1;
    }

    return { restored, expired, recoveredOnline };
  }

  /** 创建新玩家并持久化到 PG */
  async createPlayer(state: PlayerState, userId: string): Promise<void> {
    // 用默认值填充新字段
    if (!state.baseAttrs) state.baseAttrs = { ...DEFAULT_BASE_ATTRS };
    if (!state.bonuses) state.bonuses = [];
    if (!state.temporaryBuffs) state.temporaryBuffs = [];
    if (!state.inventory) state.inventory = { items: [], capacity: DEFAULT_INVENTORY_CAPACITY };
    if (!state.marketStorage) state.marketStorage = { items: [] };
    if (!state.equipment) state.equipment = { weapon: null, head: null, body: null, legs: null, accessory: null };
    state.inventory = this.contentService.normalizeInventory(state.inventory);
    state.equipment = this.contentService.normalizeEquipment(state.equipment);
    if (!state.techniques) state.techniques = [];
    if (!state.quests) state.quests = [];
    if (!state.revealedBreakthroughRequirementIds) state.revealedBreakthroughRequirementIds = [];
    this.normalizePersistedTechniqueState(state);
    state.unlockedMinimapIds = normalizeUnlockedMinimapIds(state.unlockedMinimapIds);
    if (state.autoBattle === undefined) state.autoBattle = false;
    if (state.combatTargetLocked === undefined) state.combatTargetLocked = false;
    if (!state.autoBattleSkills) state.autoBattleSkills = [];
    if (state.autoRetaliate === undefined) state.autoRetaliate = true;
    if (state.autoBattleStationary === undefined) state.autoBattleStationary = false;
    if (state.allowAoePlayerHit === undefined) state.allowAoePlayerHit = false;
    if (state.autoIdleCultivation === undefined) state.autoIdleCultivation = true;
    if (state.autoSwitchCultivation === undefined) state.autoSwitchCultivation = false;
    if (state.online === undefined) state.online = false;
    if (state.inWorld === undefined) state.inWorld = true;
    if (!state.actions) state.actions = [];
    if (state.senseQiActive === undefined) state.senseQiActive = false;
    state.boneAgeBaseYears = normalizeBoneAgeBaseYears(state.boneAgeBaseYears ?? DEFAULT_BONE_AGE_YEARS);
    state.lifeElapsedTicks = normalizeLifeElapsedTicks(state.lifeElapsedTicks);
    state.lifespanYears = normalizeLifespanYears(state.lifespanYears);
    state.questCrossMapNavCooldownUntilLifeTicks = normalizeLifeElapsedTicks(state.questCrossMapNavCooldownUntilLifeTicks);
    state.idleTicks = 0;
    if (state.facing === undefined) state.facing = Direction.South;
    if (!state.viewRange) state.viewRange = VIEW_RADIUS;
    this.techniqueService.initializePlayerProgression(state);
    this.equipmentService.rebuildBonuses(state);
    if (state.hp <= 0) {
      state.hp = state.maxHp;
    }
    if (!Number.isFinite(state.qi) || state.qi < 0) {
      state.qi = 0;
    }
    state.foundation = normalizeNonNegativeCounter(state.foundation);
    state.combatExp = normalizeNonNegativeCounter(state.combatExp);
    const persisted = this.buildPersistedCollections(state);
    const payload = this.buildPlayerPersistencePayload(state, persisted);

    await this.playerRepo.createQueryBuilder()
      .insert()
      .into(PlayerEntity)
      .values({
        id: state.id,
        userId,
        name: state.name,
        ...payload,
      })
      .execute();
    this.players.set(state.id, state);
    await this.redisService.setPlayer(state, persisted);
  }

  /** 单个玩家落盘到 PG */
  async savePlayer(playerId: string): Promise<void> {
    const state = this.players.get(playerId);
    if (!state || state.isBot) return;
    await this.persistPlayerState(state);
  }

  /** 批量落盘所有已加载玩家 */
  async persistAll(): Promise<void> {
    const states = [...this.players.values()].filter((player) => !player.isBot);
    if (states.length === 0) return;
    for (const state of states) {
      await this.persistPlayerState(state);
    }
    this.logger.log(`批量落盘 ${states.length} 名玩家`);
  }

  /** 将玩家加入内存并同步 Redis（用于存档恢复后的注册） */
  addPlayer(state: PlayerState) {
    this.players.set(state.id, state);
    this.syncPlayerCache(state).catch(() => {});
  }

  /** 仅加入内存，不同步 Redis（用于 Bot 等运行时实体） */
  addRuntimePlayer(state: PlayerState) {
    this.players.set(state.id, state);
  }

  /** 移除玩家并清理 Redis 缓存 */
  removePlayer(playerId: string) {
    this.players.delete(playerId);
    this.socketMap.delete(playerId);
    this.dirtyFlags.delete(playerId);
    const userId = this.getUserIdByPlayerId(playerId);
    if (userId) {
      this.userToPlayer.delete(userId);
      this.onlineSessionStartedAtByUserId.delete(userId);
    }
    this.redisService.removePlayer(playerId).catch(() => {});
  }

  /** 仅从内存移除，不清理 Redis（用于 Bot 等运行时实体） */
  removeRuntimePlayer(playerId: string) {
    this.players.delete(playerId);
    this.socketMap.delete(playerId);
    this.dirtyFlags.delete(playerId);
    const userId = this.getUserIdByPlayerId(playerId);
    if (userId) {
      this.onlineSessionStartedAtByUserId.delete(userId);
    }
  }

  getPlayer(playerId: string): PlayerState | undefined {
    return this.players.get(playerId);
  }

  getPlayersByMap(mapId: string): PlayerState[] {
    const result: PlayerState[] = [];
    for (const p of this.players.values()) {
      if (p.mapId === mapId && p.inWorld !== false) result.push(p);
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

  disconnectAllActiveSockets(timestamp = Date.now()): void {
    const activeSockets = [...this.socketMap.entries()];
    for (const [playerId, socket] of activeSockets) {
      const player = this.players.get(playerId);
      if (player) {
        this.markPlayerOffline(playerId, timestamp);
      }
      this.socketMap.delete(playerId);
      socket.emit(S2C.Kick);
      socket.disconnect(true);
    }
  }

  clearRuntimeState(): void {
    this.players.clear();
    this.commands.clear();
    this.socketMap.clear();
    this.userToPlayer.clear();
    this.onlineSessionStartedAtByUserId.clear();
    this.dirtyFlags.clear();
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

  getOnlineSessionStartedAt(userId: string): number | undefined {
    return this.onlineSessionStartedAtByUserId.get(userId);
  }

  syncPlayerRealtimeState(playerId: string) {
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }
    this.syncPlayerCache(player).catch(() => {});
  }

  markPlayerOnline(playerId: string, timestamp = Date.now()) {
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }
    player.online = true;
    player.inWorld = true;
    player.lastHeartbeatAt = timestamp;
    player.offlineSinceAt = undefined;
    const userId = this.getUserIdByPlayerId(playerId);
    if (userId && !this.onlineSessionStartedAtByUserId.has(userId)) {
      this.onlineSessionStartedAtByUserId.set(userId, timestamp);
      this.userRepo.createQueryBuilder()
        .update(UserEntity)
        .set({
          currentOnlineStartedAt: new Date(timestamp),
        })
        .where('id = :userId', { userId })
        .execute()
        .catch(() => {});
    }
    this.syncPlayerRealtimeState(playerId);
  }

  touchHeartbeat(playerId: string, timestamp = Date.now()) {
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }
    player.lastHeartbeatAt = timestamp;
    player.online = true;
    player.offlineSinceAt = undefined;
    this.syncPlayerRealtimeState(playerId);
  }

  markPlayerOffline(playerId: string, timestamp = Date.now()) {
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }
    player.online = false;
    player.offlineSinceAt = player.offlineSinceAt ?? timestamp;
    this.socketMap.delete(playerId);
    const userId = this.getUserIdByPlayerId(playerId);
    if (userId) {
      const startedAt = this.onlineSessionStartedAtByUserId.get(userId);
      this.onlineSessionStartedAtByUserId.delete(userId);
      if (typeof startedAt === 'number' && startedAt > 0) {
        const sessionSeconds = this.computeOnlineSessionSeconds(startedAt, timestamp);
        const startedAtIso = new Date(startedAt).toISOString();
        this.userRepo.createQueryBuilder()
          .update(UserEntity)
          .set({
            totalOnlineSeconds: () => `"totalOnlineSeconds" + ${sessionSeconds}`,
            currentOnlineStartedAt: null,
          })
          .where('id = :userId', { userId })
          .andWhere('currentOnlineStartedAt = :startedAt', { startedAt: startedAtIso })
          .execute()
          .catch(() => {});
      }
    }
    this.syncPlayerRealtimeState(playerId);
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

  /** 将玩家指令入队到对应地图的命令队列 */
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

  /** 规范化任务数据：补全目标名称、NPC 位置、奖励信息等 */
  private normalizeQuests(quests: QuestState[]): QuestState[] {
    return quests.map((quest) => {
      const targetNpcLocation = quest.targetNpcId ? this.mapService.getNpcLocation(quest.targetNpcId) : undefined;
      const submitNpcLocation = quest.submitNpcId ? this.mapService.getNpcLocation(quest.submitNpcId) : undefined;
      return {
        ...quest,
        line: quest.line === 'main' || quest.line === 'daily' || quest.line === 'encounter'
          ? quest.line
          : 'side',
        objectiveType: quest.objectiveType ?? 'kill',
      targetName: resolveQuestTargetName({
        objectiveType: quest.objectiveType ?? 'kill',
        title: quest.title,
        targetName: quest.targetName,
        targetNpcId: quest.targetNpcId,
        targetMonsterId: quest.targetMonsterId,
        targetTechniqueId: quest.targetTechniqueId,
        targetRealmStage: quest.targetRealmStage,
        requiredItemId: quest.requiredItemId,
        resolveNpcName: (npcId) => this.mapService.getNpcLocation(npcId)?.name,
        resolveMonsterName: (monsterId) => this.mapService.getMonsterSpawn(monsterId)?.name,
        resolveTechniqueName: (techniqueId) => this.contentService.getTechnique(techniqueId)?.name,
        resolveItemName: (itemId) => this.contentService.getItem(itemId)?.name,
      }),
        targetMonsterId: quest.targetMonsterId ?? '',
        rewardItemId: quest.rewardItemId ?? quest.rewardItemIds?.[0] ?? '',
        rewardItemIds: Array.isArray(quest.rewardItemIds)
          ? [...quest.rewardItemIds]
          : quest.rewardItemId
            ? [quest.rewardItemId]
            : [],
        rewards: Array.isArray(quest.rewards) ? quest.rewards.map((reward) => ({ ...reward })) : [],
        requiredItemId: quest.requiredItemId,
        requiredItemCount: quest.requiredItemCount,
        giverMapId: quest.giverMapId,
        giverMapName: quest.giverMapId && (!quest.giverMapName || quest.giverMapName === quest.giverMapId)
          ? this.mapService.getMapMeta(quest.giverMapId)?.name ?? quest.giverMapName
          : quest.giverMapName,
        giverX: quest.giverX,
        giverY: quest.giverY,
        targetMapId: targetNpcLocation?.mapId ?? quest.targetMapId,
        targetMapName: targetNpcLocation?.mapName ?? (
          quest.targetMapId && (!quest.targetMapName || quest.targetMapName === quest.targetMapId)
            ? this.mapService.getMapMeta(quest.targetMapId)?.name ?? quest.targetMapName
            : quest.targetMapName
        ),
        targetX: targetNpcLocation?.x ?? quest.targetX,
        targetY: targetNpcLocation?.y ?? quest.targetY,
        targetNpcName: targetNpcLocation?.name ?? quest.targetNpcName,
        submitMapId: submitNpcLocation?.mapId ?? quest.submitMapId,
        submitMapName: submitNpcLocation?.mapName ?? (
          quest.submitMapId && (!quest.submitMapName || quest.submitMapName === quest.submitMapId)
            ? this.mapService.getMapMeta(quest.submitMapId)?.name ?? quest.submitMapName
            : quest.submitMapName
        ),
        submitX: submitNpcLocation?.x ?? quest.submitX,
        submitY: submitNpcLocation?.y ?? quest.submitY,
        submitNpcName: submitNpcLocation?.name ?? quest.submitNpcName,
      };
    });
  }

  /** 校验并过滤临时 Buff 数组，剔除字段不完整或已失效的条目 */
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
    return clonePlainValue(value);
  }

  private async normalizePersistedRoleNames(): Promise<void> {
    const players = await this.playerRepo.find({
      select: {
        id: true,
        name: true,
      },
    });
    let normalizedCount = 0;

    for (const player of players) {
      const normalizedName = truncateRoleName(player.name.normalize('NFC').trim());
      if (!normalizedName || normalizedName === player.name) {
        continue;
      }
      await this.playerRepo.update(player.id, { name: normalizedName });
      normalizedCount += 1;
    }

    if (normalizedCount > 0) {
      this.logger.log(`启动时已裁切 ${normalizedCount} 个超长角色名`);
    }
  }

  private hydratePlayerState(entity: PlayerEntity, displayName: string): PlayerState {
    const state: PlayerState = {
      id: entity.id,
      name: entity.name,
      displayName,
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
      foundation: normalizeNonNegativeCounter(entity.foundation),
      combatExp: normalizeNonNegativeCounter(entity.combatExp),
      boneAgeBaseYears: normalizeBoneAgeBaseYears(entity.boneAgeBaseYears),
      lifeElapsedTicks: normalizeLifeElapsedTicks(entity.lifeElapsedTicks),
      lifespanYears: normalizeLifespanYears(entity.lifespanYears),
      baseAttrs: (entity.baseAttrs ?? { ...DEFAULT_BASE_ATTRS }) as Attributes,
      bonuses: (entity.bonuses ?? []) as AttrBonus[],
      temporaryBuffs: this.normalizeTemporaryBuffs(hydrateTemporaryBuffSnapshots(entity.temporaryBuffs, this.contentService)),
      inventory: hydrateInventorySnapshot(entity.inventory, this.contentService),
      marketStorage: hydrateMarketStorageSnapshot(entity.marketStorage, this.contentService),
      equipment: hydrateEquipmentSnapshot(entity.equipment, this.contentService),
      techniques: hydrateTechniqueSnapshots(entity.techniques),
      quests: this.normalizeQuests(hydrateQuestSnapshots(entity.quests, this.mapService, this.contentService)),
      questCrossMapNavCooldownUntilLifeTicks: normalizeLifeElapsedTicks(entity.questCrossMapNavCooldownUntilLifeTicks),
      revealedBreakthroughRequirementIds: Array.isArray(entity.revealedBreakthroughRequirementIds)
        ? entity.revealedBreakthroughRequirementIds.filter((entry): entry is string => typeof entry === 'string')
        : [],
      heavenGate: this.techniqueService.normalizeHeavenGateState(entity.heavenGate),
      spiritualRoots: this.techniqueService.normalizeHeavenGateRoots(entity.spiritualRoots),
      unlockedMinimapIds: normalizeUnlockedMinimapIds(entity.unlockedMinimapIds),
      autoBattle: entity.autoBattle ?? false,
      autoBattleSkills: (entity.autoBattleSkills ?? []) as AutoBattleSkillConfig[],
      autoRetaliate: entity.autoRetaliate ?? true,
      autoBattleStationary: entity.autoBattleStationary === true,
      allowAoePlayerHit: entity.allowAoePlayerHit === true,
      autoIdleCultivation: entity.autoIdleCultivation ?? true,
      autoSwitchCultivation: entity.autoSwitchCultivation === true,
      cultivationActive: false,
      actions: [],
      cultivatingTechId: entity.cultivatingTechId ?? undefined,
      idleTicks: 0,
      combatTargetLocked: false,
      online: entity.online ?? false,
      inWorld: entity.inWorld ?? false,
      lastHeartbeatAt: entity.lastHeartbeatAt?.getTime(),
      offlineSinceAt: entity.offlineSinceAt?.getTime(),
    };
    this.techniqueService.initializePlayerProgression(state);
    this.equipmentService.rebuildBonuses(state);
    return state;
  }

  private resolveRetainedPlayerPosition(player: PlayerState): { mapId: string; x: number; y: number } {
    const placement = this.mapService.resolvePlayerPlacement(player.mapId, player.x, player.y, player.id);
    return { mapId: placement.mapId, x: placement.x, y: placement.y };
  }

  private async expireRetainedPlayer(state: PlayerState): Promise<void> {
    this.techniqueService.stopCultivation(
      state,
      '你离线过久，已退出世界，当前修炼随之中止。',
      'system',
    );
    state.online = false;
    state.inWorld = false;
    state.autoBattle = false;
    state.combatTargetId = undefined;
    state.combatTargetLocked = false;
    state.idleTicks = 0;
    await this.persistPlayerState(state);
    await this.syncPlayerCache(state);
  }

  private async persistPlayerState(state: PlayerState): Promise<void> {
    this.techniqueService.preparePlayerForPersistence(state);
    const persisted = this.buildPersistedCollections(state);
    const payload = this.buildPlayerPersistencePayload(state, persisted);
    await this.playerRepo.createQueryBuilder()
      .update(PlayerEntity)
      .set(payload)
      .where('id = :id', { id: state.id })
      .execute();
  }

  private computeOnlineSessionSeconds(startedAt: number | Date | null | undefined, endedAt = Date.now()): number {
    const startTimestamp = startedAt instanceof Date ? startedAt.getTime() : startedAt ?? 0;
    if (!Number.isFinite(startTimestamp) || startTimestamp <= 0) {
      return 0;
    }
    return Math.max(0, Math.floor((endedAt - startTimestamp) / 1000));
  }

  private async settleRecoveredOnlineSession(user: UserEntity, now = Date.now()): Promise<void> {
    if (!user.currentOnlineStartedAt) {
      return;
    }
    const recoveredSeconds = this.computeOnlineSessionSeconds(user.currentOnlineStartedAt, now);
    user.totalOnlineSeconds = Math.max(0, Math.floor(user.totalOnlineSeconds ?? 0)) + recoveredSeconds;
    user.currentOnlineStartedAt = null;
    await this.userRepo.save(user);
  }
}

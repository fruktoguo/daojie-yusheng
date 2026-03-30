/**
 * GM 业务逻辑：玩家状态查看/修改、Bot 生成/移除、地图编辑保存
 * 命令通过队列延迟到 tick 内执行，保证线程安全
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  AttrBonus,
  Attributes,
  AutoBattleSkillConfig,
  DEFAULT_BASE_ATTRS,
  DEFAULT_BONE_AGE_YEARS,
  DEFAULT_INVENTORY_CAPACITY,
  DEFAULT_PLAYER_MAP_ID,
  Direction,
  EquipmentSlots,
  GmEditorCatalogRes,
  GmManagedAccountRecord,
  GmMapDocument,
  GmMapListRes,
  GmMapRuntimeRes,
  GmManagedPlayerRecord,
  GmManagedPlayerSummary,
  GmPlayerUpdateSection,
  GmRuntimeEntity,
  GmShortcutRunRes,
  GmStateRes,
  GmUpdateMapTimeReq,
  Inventory,
  PlayerState,
  QuestState,
  TechniqueState,
  TemporaryBuffState,
  VIEW_RADIUS,
  VisibleTile,
  getTileTypeFromMapChar,
  isTileTypeWalkable,
  normalizeBoneAgeBaseYears,
  normalizeLifeElapsedTicks,
  normalizeLifespanYears,
} from '@mud/shared';
import { PlayerEntity } from '../database/entities/player.entity';
import { UserEntity } from '../database/entities/user.entity';
import { NameUniquenessService } from '../auth/name-uniqueness.service';
import { normalizeRoleName, validateRoleName } from '../auth/account-validation';
import { AccountService } from './account.service';
import { AttrService } from './attr.service';
import { BotService } from './bot.service';
import { ContentService } from './content.service';
import { EquipmentService } from './equipment.service';
import { MapService } from './map.service';
import { NavigationService } from './navigation.service';
import { PerformanceService } from './performance.service';
import {
  GM_WORLD_OBSERVE_BUFF_COLOR,
  GM_WORLD_OBSERVE_BUFF_DESC,
  GM_WORLD_OBSERVE_BUFF_DURATION_TICKS,
  GM_WORLD_OBSERVE_BUFF_ID,
  GM_WORLD_OBSERVE_BUFF_LUCK_BONUS,
  GM_WORLD_OBSERVE_BUFF_NAME,
  GM_WORLD_OBSERVE_BUFF_SHORT_MARK,
  GM_WORLD_OBSERVE_SESSION_TTL_MS,
  GM_WORLD_OBSERVE_SOURCE_ID,
  GM_WORLD_OBSERVE_SOURCE_NAME,
} from '../constants/gameplay/gm-observe';
import {
  buildPersistedPlayerCollections,
  hydrateEquipmentSnapshot,
  hydrateInventorySnapshot,
  hydrateQuestSnapshots,
  hydrateTemporaryBuffSnapshots,
  hydrateTechniqueSnapshots,
} from './player-storage';
import { DirtyFlag, PlayerService } from './player.service';
import { TechniqueService } from './technique.service';
import { TimeService } from './time.service';
import { WorldService } from './world.service';

type GmCommand =
  | {
      type: 'updatePlayer';
      playerId: string;
      snapshot: Partial<PlayerState>;
      section?: GmPlayerUpdateSection;
    }
  | {
      type: 'resetPlayer';
      playerId: string;
    }
  | {
      type: 'resetHeavenGate';
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

interface GmPlayerUserIdentity {
  userId?: string;
  accountName?: string;
}

interface GmWorldObservationSession {
  viewerId: string;
  mapId: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  lastSeenAt: number;
}

@Injectable()
export class GmService {
  private readonly commandsByMap = new Map<string, GmCommand[]>();
  private readonly worldObservationSessions = new Map<string, GmWorldObservationSession>();
  private readonly logger = new Logger(GmService.name);

  constructor(
    @InjectRepository(PlayerEntity)
    private readonly playerRepo: Repository<PlayerEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly botService: BotService,
    private readonly playerService: PlayerService,
    private readonly mapService: MapService,
    private readonly attrService: AttrService,
    private readonly navigationService: NavigationService,
    private readonly performanceService: PerformanceService,
    private readonly worldService: WorldService,
    private readonly accountService: AccountService,
    private readonly nameUniquenessService: NameUniquenessService,
    private readonly contentService: ContentService,
    private readonly equipmentService: EquipmentService,
    private readonly techniqueService: TechniqueService,
    private readonly timeService: TimeService,
  ) {}

  /** 获取全局 GM 状态：所有玩家摘要、地图列表、Bot 数量、性能快照 */
  async getState(): Promise<GmStateRes> {
    const [entities, runtimePlayers] = await Promise.all([
      this.playerRepo.find(),
      Promise.resolve(this.playerService.getAllPlayers()),
    ]);

    const runtimeUserIdByPlayerId = new Map(
      runtimePlayers.map((player) => [player.id, this.playerService.getUserIdByPlayerId(player.id)]),
    );
    const userById = await this.loadUsersByIds([
      ...entities.map((entity) => entity.userId),
      ...runtimeUserIdByPlayerId.values(),
    ]);
    const runtimeById = new Map(runtimePlayers.map((player) => [player.id, player]));
    const records: GmManagedPlayerSummary[] = [];

    for (const entity of entities) {
      const runtime = runtimeById.get(entity.id);
      const user = userById.get(entity.userId);
      const snapshot = runtime
        ? this.clonePlayer(runtime)
        : this.hydrateStoredPlayer(entity, this.resolveStoredDisplayName(user));
      records.push(
        this.buildSummary(
          snapshot,
          { userId: entity.userId, accountName: user?.username },
          runtime ? snapshot.online === true : false,
          entity.updatedAt,
        ),
      );
      runtimeById.delete(entity.id);
    }

    for (const runtime of runtimeById.values()) {
      const userId = runtimeUserIdByPlayerId.get(runtime.id);
      const user = userId ? userById.get(userId) : undefined;
      records.push(
        this.buildSummary(
          runtime,
          { userId, accountName: user?.username },
          runtime.online === true,
          undefined,
        ),
      );
    }

    records.sort((left, right) => {
      if (left.meta.isBot !== right.meta.isBot) return left.meta.isBot ? 1 : -1;
      if (left.meta.online !== right.meta.online) return left.meta.online ? -1 : 1;
      if (left.mapName !== right.mapName) return left.mapName.localeCompare(right.mapName, 'zh-CN');
      return left.roleName.localeCompare(right.roleName, 'zh-CN');
    });

    return {
      players: records,
      mapIds: this.mapService.getAllMapIds().sort(),
      botCount: this.botService.getBotCount(),
      perf: this.performanceService.getSnapshot(),
    };
  }

  /** 获取单个玩家的完整详情（在线取运行时，离线取数据库） */
  async getPlayerDetail(playerId: string): Promise<GmManagedPlayerRecord | null> {
    const runtime = this.playerService.getPlayer(playerId);
    if (runtime) {
      const userId = this.playerService.getUserIdByPlayerId(playerId);
      const user = userId ? await this.userRepo.findOne({ where: { id: userId } }) : null;
      return this.buildRecord(
        runtime,
        user,
        { userId, accountName: user?.username },
        runtime.online === true,
        undefined,
      );
    }

    const entity = await this.playerRepo.findOne({ where: { id: playerId } });
    if (!entity) {
      return null;
    }

    const user = await this.userRepo.findOne({ where: { id: entity.userId } });
    return this.buildRecord(
      this.hydrateStoredPlayer(entity, this.resolveStoredDisplayName(user)),
      user,
      { userId: entity.userId, accountName: user?.username },
      false,
      entity.updatedAt,
    );
  }

  /** GM 直接重设玩家账号密码 */
  async updateManagedPlayerPassword(playerId: string, newPassword: string): Promise<string | null> {
    const runtimeUserId = this.playerService.getUserIdByPlayerId(playerId);
    const userId = runtimeUserId
      ?? (await this.playerRepo.findOne({
        where: { id: playerId },
        select: { userId: true },
      }))?.userId;

    if (!userId) {
      return '目标玩家没有可修改的账号';
    }

    await this.accountService.updatePasswordByGm(userId, newPassword);
    return null;
  }

  /** GM 直接修改玩家账号名 */
  async updateManagedPlayerAccount(playerId: string, username: string): Promise<string | null> {
    const runtimeUserId = this.playerService.getUserIdByPlayerId(playerId);
    const userId = runtimeUserId
      ?? (await this.playerRepo.findOne({
        where: { id: playerId },
        select: { userId: true },
      }))?.userId;

    if (!userId) {
      return '目标玩家没有可修改的账号';
    }

    await this.accountService.updateUsernameByGm(userId, username);
    return null;
  }

  getEditorCatalog(): GmEditorCatalogRes {
    return {
      techniques: this.contentService.getEditorTechniqueCatalog(),
      items: this.contentService.getEditorItemCatalog(),
      realmLevels: this.contentService.getEditorRealmCatalog().map((entry) => ({
        realmLv: entry.realmLv,
        displayName: entry.displayName,
        name: entry.name,
        phaseName: entry.phaseName ?? undefined,
        review: entry.review || undefined,
      })),
    };
  }

  getEditableMapList(): GmMapListRes {
    return this.mapService.getEditableMapList();
  }

  getEditableMap(mapId: string): GmMapDocument | null {
    return this.mapService.getEditableMap(mapId) ?? null;
  }

  clearRuntimeState(): void {
    this.commandsByMap.clear();
    this.worldObservationSessions.clear();
  }

  updateWorldObservation(
    viewerId: string | undefined,
    mapId: string,
    x: number,
    y: number,
    w: number,
    h: number,
    now = Date.now(),
  ): void {
    const normalizedViewerId = viewerId?.trim().slice(0, 128);
    if (!normalizedViewerId) {
      return;
    }
    const meta = this.mapService.getMapMeta(mapId);
    if (!meta) {
      return;
    }
    const clampedW = Math.min(20, Math.max(1, Math.floor(w)));
    const clampedH = Math.min(20, Math.max(1, Math.floor(h)));
    const startX = Math.max(0, Math.min(Math.floor(x), meta.width - 1));
    const startY = Math.max(0, Math.min(Math.floor(y), meta.height - 1));
    const endX = Math.min(meta.width, startX + clampedW);
    const endY = Math.min(meta.height, startY + clampedH);
    this.worldObservationSessions.set(normalizedViewerId, {
      viewerId: normalizedViewerId,
      mapId,
      startX,
      startY,
      endX,
      endY,
      lastSeenAt: now,
    });
  }

  clearWorldObservation(viewerId: string | undefined): void {
    const normalizedViewerId = viewerId?.trim().slice(0, 128);
    if (!normalizedViewerId) {
      return;
    }
    this.worldObservationSessions.delete(normalizedViewerId);
  }

  syncObservedPlayerBuffs(mapId: string, now = Date.now()): string[] {
    this.pruneExpiredWorldObservations(now);
    const players = this.playerService.getPlayersByMap(mapId);
    if (players.length === 0) {
      return [];
    }

    const sessions: GmWorldObservationSession[] = [];
    for (const session of this.worldObservationSessions.values()) {
      if (session.mapId === mapId) {
        sessions.push(session);
      }
    }

    const changedPlayerIds: string[] = [];
    for (const player of players) {
      if (player.isBot) {
        if (this.removeWorldObserveBuff(player)) {
          changedPlayerIds.push(player.id);
        }
        continue;
      }
      const observed = sessions.some((session) => (
        player.x >= session.startX
        && player.x < session.endX
        && player.y >= session.startY
        && player.y < session.endY
      ));
      const changed = observed
        ? this.ensureWorldObserveBuff(player)
        : this.removeWorldObserveBuff(player);
      if (changed) {
        changedPlayerIds.push(player.id);
      }
    }
    return changedPlayerIds;
  }

  /** 保存地图编辑结果，自动重载运行时并迁移受影响玩家 */
  async saveEditableMap(mapId: string, document: GmMapDocument): Promise<string | null> {
    if (!this.mapService.getMapMeta(mapId)) {
      return '目标地图不存在';
    }

    const runtimePlayers = this.playerService.getPlayersByMap(mapId).map((player) => this.clonePlayer(player));

    const error = await this.mapService.saveEditableMap(mapId, document);
    if (error) {
      return error;
    }

    this.worldService.reloadMapRuntime(mapId);
    for (const player of runtimePlayers) {
      const relocation = this.resolveMapSaveRelocation(player);
      if (!relocation) continue;
      const snapshot = this.clonePlayer(player);
      snapshot.x = relocation.x;
      snapshot.y = relocation.y;
      this.enqueue(mapId, {
        type: 'updatePlayer',
        playerId: player.id,
        snapshot,
      });
    }
    return null;
  }

  /** 入队玩家状态更新命令（在线走 tick 队列，离线直接写库） */
  async enqueuePlayerUpdate(playerId: string, snapshot: Partial<PlayerState>, section?: GmPlayerUpdateSection): Promise<string | null> {
    const roleNameError = await this.validateManagedPlayerRoleNameUpdate(playerId, snapshot, section);
    if (roleNameError) {
      return roleNameError;
    }

    const runtime = this.playerService.getPlayer(playerId);
    if (runtime) {
      this.enqueue(runtime.mapId, {
        type: 'updatePlayer',
        playerId,
        snapshot: this.clonePlayer(snapshot),
        section,
      });
      return null;
    }

    const entity = await this.playerRepo.findOne({ where: { id: playerId } });
    if (!entity) return '目标玩家不存在';

    const player = this.hydrateStoredPlayer(entity);
    const error = this.applyPlayerSnapshot(player, this.mergePlayerSnapshot(player, snapshot, section), false);
    if (error) return error;

    await this.persistOfflinePlayer(entity, player);
    return null;
  }

  /** 入队玩家重置命令（传送回出生点、清除状态） */
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

  /** 批量将所有非机器人角色送回默认新手村出生点 */
  async returnAllPlayersToDefaultSpawn(): Promise<GmShortcutRunRes> {
    const runtimePlayers = this.playerService.getAllPlayers().filter((player) => !player.isBot && player.inWorld !== false);
    const runtimeIds = new Set(runtimePlayers.map((player) => player.id));
    let queuedRuntimePlayers = 0;
    let updatedOfflinePlayers = 0;

    for (const player of runtimePlayers) {
      this.enqueue(player.mapId, { type: 'resetPlayer', playerId: player.id });
      queuedRuntimePlayers += 1;
    }

    const entities = await this.playerRepo.find();
    for (const entity of entities) {
      if (runtimeIds.has(entity.id)) {
        continue;
      }
      const player = this.hydrateStoredPlayer(entity);
      this.resetStoredPlayerToSpawn(player);
      await this.persistOfflinePlayer(entity, player);
      updatedOfflinePlayers += 1;
    }

    const placement = this.mapService.resolveDefaultPlayerSpawnPosition();
    return {
      ok: true,
      totalPlayers: queuedRuntimePlayers + updatedOfflinePlayers,
      queuedRuntimePlayers,
      updatedOfflinePlayers,
      targetMapId: placement.mapId,
      targetX: placement.x,
      targetY: placement.y,
    };
  }

  async enqueueResetHeavenGate(playerId: string): Promise<string | null> {
    const runtime = this.playerService.getPlayer(playerId);
    if (runtime) {
      this.enqueue(runtime.mapId, { type: 'resetHeavenGate', playerId });
      return null;
    }

    const entity = await this.playerRepo.findOne({ where: { id: playerId } });
    if (!entity) return '目标玩家不存在';

    const player = this.hydrateStoredPlayer(entity);
    this.techniqueService.resetHeavenGateForTesting(player);
    await this.persistOfflinePlayer(entity, player);
    return null;
  }

  /** 入队 Bot 生成命令 */
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

  /** 入队 Bot 移除命令 */
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

  /** 取出并清空指定地图的待执行 GM 命令 */
  drainCommands(mapId: string): GmCommand[] {
    const commands = this.commandsByMap.get(mapId) ?? [];
    this.commandsByMap.set(mapId, []);
    return commands;
  }

  /** 在 tick 内执行单条 GM 命令 */
  applyCommand(command: GmCommand): string | null {
    switch (command.type) {
      case 'updatePlayer':
        return this.applyQueuedPlayerUpdate(command.playerId, command.snapshot, command.section);
      case 'resetPlayer':
        return this.applyQueuedResetPlayer(command.playerId);
      case 'resetHeavenGate':
        return this.applyQueuedResetHeavenGate(command.playerId);
      case 'spawnBots':
        return this.applyQueuedSpawnBots(command.mapId, command.x, command.y, command.count);
      case 'removeBots':
        return this.applyQueuedRemoveBots(command.playerIds, command.all);
    }
  }

  private applyQueuedPlayerUpdate(playerId: string, snapshot: Partial<PlayerState>, section?: GmPlayerUpdateSection): string | null {
    const player = this.playerService.getPlayer(playerId);
    if (!player) return '目标玩家不存在';
    const error = this.applyPlayerSnapshot(player, this.mergePlayerSnapshot(player, snapshot, section), true);
    if (error) return error;
    this.markDirty(player.id, this.getDirtyFlagsForSection(section));
    void this.playerService.savePlayer(player.id).catch((saveError: Error) => {
      this.logger.error(`GM 修改玩家落盘失败: ${player.id} ${saveError.message}`);
    });
    return null;
  }

  private applyQueuedResetPlayer(playerId: string): string | null {
    const player = this.playerService.getPlayer(playerId);
    if (!player) return '目标玩家不存在';
    const update = this.worldService.resetPlayerToSpawn(player);
    this.markDirty(player.id, update.dirty as DirtyFlag[]);
    void this.playerService.savePlayer(player.id).catch((error: Error) => {
      this.logger.error(`GM 重置玩家落盘失败: ${player.id} ${error.message}`);
    });
    return null;
  }

  private applyQueuedResetHeavenGate(playerId: string): string | null {
    const player = this.playerService.getPlayer(playerId);
    if (!player) return '目标玩家不存在';
    this.techniqueService.resetHeavenGateForTesting(player);
    this.markDirty(player.id, ['attr', 'actions', 'tech']);
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

  private buildSummary(
    player: PlayerState,
    user: GmPlayerUserIdentity,
    online: boolean,
    updatedAt: Date | undefined,
  ): GmManagedPlayerSummary {
    const realmLv = Math.max(1, Math.floor(player.realm?.realmLv ?? player.realmLv ?? 1));
    const realmLabel = player.realm?.displayName
      ?? player.realm?.name
      ?? player.realmName
      ?? `Lv.${realmLv}`;
    const roleName = player.name;
    const displayName = this.resolvePlayerDisplayName(player.displayName, user.accountName, roleName);
    const mapName = this.mapService.getMapMeta(player.mapId)?.name ?? player.mapId;
    return {
      id: player.id,
      name: roleName,
      roleName,
      displayName,
      accountName: user.accountName,
      realmLv,
      realmLabel,
      mapId: player.mapId,
      mapName,
      x: player.x,
      y: player.y,
      hp: player.hp,
      maxHp: player.maxHp,
      qi: player.qi,
      dead: player.dead,
      autoBattle: player.autoBattle,
      autoRetaliate: player.autoRetaliate !== false,
      autoBattleStationary: player.autoBattleStationary === true,
      meta: {
        userId: user.userId,
        isBot: Boolean(player.isBot),
        online,
        inWorld: player.inWorld !== false,
        lastHeartbeatAt: player.lastHeartbeatAt ? new Date(player.lastHeartbeatAt).toISOString() : undefined,
        offlineSinceAt: player.offlineSinceAt ? new Date(player.offlineSinceAt).toISOString() : undefined,
        updatedAt: updatedAt?.toISOString(),
        dirtyFlags: [...(this.playerService.getDirtyFlags(player.id) ?? [])],
      },
    };
  }

  private buildRecord(
    player: PlayerState,
    userEntity: UserEntity | null | undefined,
    user: GmPlayerUserIdentity,
    online: boolean,
    updatedAt: Date | undefined,
  ): GmManagedPlayerRecord {
    const summary = this.buildSummary(player, user, online, updatedAt);
    const snapshot = this.clonePlayer(player);
    const persistedCollections = buildPersistedPlayerCollections(player, this.contentService, this.mapService);
    return {
      ...summary,
      account: this.buildAccountRecord(userEntity, online),
      snapshot,
      persistedSnapshot: {
        id: player.id,
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
        boneAgeBaseYears: player.boneAgeBaseYears ?? DEFAULT_BONE_AGE_YEARS,
        lifeElapsedTicks: player.lifeElapsedTicks ?? 0,
        lifespanYears: player.lifespanYears ?? null,
        baseAttrs: player.baseAttrs,
        bonuses: player.bonuses,
        temporaryBuffs: persistedCollections.temporaryBuffs,
        inventory: persistedCollections.inventory,
        equipment: persistedCollections.equipment,
        techniques: persistedCollections.techniques,
        quests: persistedCollections.quests,
        revealedBreakthroughRequirementIds: player.revealedBreakthroughRequirementIds ?? [],
        unlockedMinimapIds: player.unlockedMinimapIds ?? [],
        autoBattle: player.autoBattle,
        autoBattleSkills: player.autoBattleSkills,
        combatTargetId: player.combatTargetId,
        combatTargetLocked: player.combatTargetLocked,
        autoRetaliate: player.autoRetaliate,
        autoBattleStationary: player.autoBattleStationary,
        allowAoePlayerHit: player.allowAoePlayerHit,
        autoIdleCultivation: player.autoIdleCultivation,
        cultivatingTechId: player.cultivatingTechId ?? null,
        online: player.online,
        inWorld: player.inWorld,
        lastHeartbeatAt: player.lastHeartbeatAt,
        offlineSinceAt: player.offlineSinceAt,
      },
    };
  }

  /** 从数据库实体还原为运行时 PlayerState */
  private hydrateStoredPlayer(entity: PlayerEntity, displayName?: string): PlayerState {
    const player: PlayerState = {
      id: entity.id,
      name: entity.name,
      displayName: this.resolvePlayerDisplayName(displayName, undefined, entity.name),
      mapId: entity.mapId,
      x: entity.x,
      y: entity.y,
      senseQiActive: false,
      facing: this.normalizeDirection(entity.facing),
      viewRange: this.normalizePositiveInt(entity.viewRange, VIEW_RADIUS),
      hp: this.normalizeNonNegativeInt(entity.hp),
      maxHp: Math.max(1, this.normalizePositiveInt(entity.maxHp, 1)),
      qi: this.normalizeNonNegativeInt(entity.qi ?? 0),
      dead: Boolean(entity.dead),
      foundation: this.normalizeNonNegativeInt(entity.foundation ?? 0),
      combatExp: this.normalizeNonNegativeInt(entity.combatExp ?? 0),
      boneAgeBaseYears: normalizeBoneAgeBaseYears(entity.boneAgeBaseYears),
      lifeElapsedTicks: normalizeLifeElapsedTicks(entity.lifeElapsedTicks),
      lifespanYears: normalizeLifespanYears(entity.lifespanYears),
      baseAttrs: this.normalizeAttributes(entity.baseAttrs),
      bonuses: this.cloneArray<AttrBonus>(entity.bonuses),
      temporaryBuffs: this.normalizeTemporaryBuffs(hydrateTemporaryBuffSnapshots(entity.temporaryBuffs, this.contentService)),
      inventory: hydrateInventorySnapshot(entity.inventory, this.contentService),
      equipment: hydrateEquipmentSnapshot(entity.equipment, this.contentService),
      techniques: hydrateTechniqueSnapshots(entity.techniques),
      quests: this.normalizeQuests(hydrateQuestSnapshots(entity.quests, this.mapService, this.contentService)),
      autoBattle: entity.autoBattle ?? false,
      autoBattleSkills: this.cloneArray<AutoBattleSkillConfig>(entity.autoBattleSkills),
      autoRetaliate: entity.autoRetaliate ?? true,
      autoBattleStationary: entity.autoBattleStationary === true,
      allowAoePlayerHit: entity.allowAoePlayerHit === true,
      autoIdleCultivation: entity.autoIdleCultivation ?? true,
      autoSwitchCultivation: entity.autoSwitchCultivation === true,
      actions: [],
      cultivatingTechId: entity.cultivatingTechId ?? undefined,
      idleTicks: 0,
      online: entity.online ?? false,
      inWorld: entity.inWorld ?? false,
      lastHeartbeatAt: entity.lastHeartbeatAt?.getTime(),
      offlineSinceAt: entity.offlineSinceAt?.getTime(),
      revealedBreakthroughRequirementIds: Array.isArray(entity.revealedBreakthroughRequirementIds)
        ? entity.revealedBreakthroughRequirementIds.filter((entry): entry is string => typeof entry === 'string')
        : [],
      unlockedMinimapIds: Array.isArray(entity.unlockedMinimapIds)
        ? entity.unlockedMinimapIds.filter((entry): entry is string => typeof entry === 'string')
        : [],
      combatTargetId: entity.combatTargetId ?? undefined,
      combatTargetLocked: entity.combatTargetLocked === true,
    };

    this.techniqueService.initializePlayerProgression(player);
    player.hp = Math.min(player.maxHp, Math.max(0, player.hp));
    player.dead = player.hp <= 0 || player.dead;
    return player;
  }

  /** 将快照数据应用到玩家状态上 */
  private applyPlayerSnapshot(player: PlayerState, snapshot: PlayerState, runtime: boolean): string | null {
    const nextMapId = typeof snapshot.mapId === 'string' ? snapshot.mapId : player.mapId;
    const nextX = this.normalizeInt(snapshot.x, player.x);
    const nextY = this.normalizeInt(snapshot.y, player.y);
    const positionChanged = nextMapId !== player.mapId || nextX !== player.x || nextY !== player.y;

    if (!this.mapService.getMapMeta(nextMapId)) {
      return '目标地图不存在';
    }
    if (positionChanged && !this.canSetPosition(nextMapId, nextX, nextY, player.id, runtime)) {
      return '目标坐标不可站立或已被占用';
    }

    const requestedHp = this.normalizeNonNegativeInt(snapshot.hp);
    const requestedQi = this.normalizeNonNegativeInt(snapshot.qi);
    const requestedRealmProgress = typeof snapshot.realm?.progress === 'number'
      ? this.normalizeNonNegativeInt(snapshot.realm.progress)
      : undefined;

    const previousMapId = player.mapId;
    const previousX = player.x;
    const previousY = player.y;

    player.name = this.normalizeName(snapshot.name, player.name);
    player.mapId = nextMapId;
    player.x = nextX;
    player.y = nextY;
    player.facing = this.normalizeDirection(snapshot.facing);
    player.viewRange = this.normalizePositiveInt(snapshot.viewRange, player.viewRange);
    player.foundation = this.normalizeNonNegativeInt(snapshot.foundation ?? player.foundation ?? 0);
    player.combatExp = this.normalizeNonNegativeInt(snapshot.combatExp ?? player.combatExp ?? 0);
    player.boneAgeBaseYears = normalizeBoneAgeBaseYears(snapshot.boneAgeBaseYears ?? player.boneAgeBaseYears);
    player.lifeElapsedTicks = normalizeLifeElapsedTicks(snapshot.lifeElapsedTicks ?? player.lifeElapsedTicks);
    player.lifespanYears = snapshot.lifespanYears === undefined
      ? player.lifespanYears ?? null
      : normalizeLifespanYears(snapshot.lifespanYears);
    player.baseAttrs = this.normalizeAttributes(snapshot.baseAttrs);
    player.bonuses = this.cloneArray<AttrBonus>(snapshot.bonuses);
    player.temporaryBuffs = this.normalizeTemporaryBuffs(snapshot.temporaryBuffs);
    player.inventory = this.contentService.normalizeInventory(this.normalizeInventory(snapshot.inventory));
    player.equipment = this.contentService.normalizeEquipment(this.normalizeEquipment(snapshot.equipment));
    player.techniques = this.cloneArray<TechniqueState>(snapshot.techniques);
    player.quests = this.cloneArray<QuestState>(snapshot.quests);
    player.autoBattleSkills = this.cloneArray<AutoBattleSkillConfig>(snapshot.autoBattleSkills);
    player.autoRetaliate = snapshot.autoRetaliate !== false;
    player.autoBattleStationary = snapshot.autoBattleStationary === true;
    player.allowAoePlayerHit = snapshot.allowAoePlayerHit === true;
    player.autoIdleCultivation = snapshot.autoIdleCultivation !== undefined
      ? snapshot.autoIdleCultivation !== false
      : player.autoIdleCultivation !== false;
    player.autoSwitchCultivation = snapshot.autoSwitchCultivation === true;
    player.idleTicks = 0;
    player.revealedBreakthroughRequirementIds = Array.isArray(snapshot.revealedBreakthroughRequirementIds)
      ? snapshot.revealedBreakthroughRequirementIds.filter((entry): entry is string => typeof entry === 'string')
      : [];
    player.unlockedMinimapIds = Array.isArray(snapshot.unlockedMinimapIds)
      ? [...new Set(snapshot.unlockedMinimapIds.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0))].sort()
      : [];
    player.cultivatingTechId = typeof snapshot.cultivatingTechId === 'string' && snapshot.cultivatingTechId.length > 0
      ? snapshot.cultivatingTechId
      : undefined;

    this.techniqueService.initializePlayerProgression(player);
    if (typeof snapshot.realmLv === 'number' && snapshot.realmLv > 0) {
      if (requestedRealmProgress !== undefined) {
        this.techniqueService.setRealmState(player, snapshot.realmLv, requestedRealmProgress);
      } else {
        this.techniqueService.setRealmLevel(player, snapshot.realmLv);
      }
    } else if (requestedRealmProgress !== undefined) {
      this.techniqueService.setRealmProgress(player, requestedRealmProgress);
    }
    this.equipmentService.rebuildBonuses(player);

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
    player.combatTargetLocked = player.autoBattle && snapshot.combatTargetLocked === true;

    if (runtime) {
      this.navigationService.clearMoveTarget(player.id);
      if (previousMapId !== player.mapId || previousX !== player.x || previousY !== player.y) {
        this.mapService.removeOccupant(previousMapId, previousX, previousY, player.id);
        this.mapService.addOccupant(player.mapId, player.x, player.y, player.id, 'player');
      }
    }

    return null;
  }

  private resetStoredPlayerToSpawn(player: PlayerState): void {
    const spawn = this.mapService.getSpawnPoint(DEFAULT_PLAYER_MAP_ID) ?? { x: player.x, y: player.y };
    const pos = this.mapService.findNearbyWalkable(DEFAULT_PLAYER_MAP_ID, spawn.x, spawn.y, 4, { actorType: 'player' }) ?? spawn;
    player.mapId = DEFAULT_PLAYER_MAP_ID;
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
    player.combatTargetLocked = false;
  }

  private canSetPosition(mapId: string, x: number, y: number, playerId: string, runtime: boolean): boolean {
    const tile = this.mapService.getTile(mapId, x, y);
    if (!tile?.walkable) return false;
    if (!runtime) {
      return true;
    }

    return this.mapService.canOccupy(mapId, x, y, { occupancyId: playerId, actorType: 'player' });
  }

  /** 将离线玩家状态持久化到数据库 */
  private async persistOfflinePlayer(entity: PlayerEntity, player: PlayerState): Promise<void> {
    this.techniqueService.preparePlayerForPersistence(player);
    const persisted = buildPersistedPlayerCollections(player, this.contentService, this.mapService);
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
      foundation: player.foundation,
      combatExp: player.combatExp,
      boneAgeBaseYears: player.boneAgeBaseYears,
      lifeElapsedTicks: player.lifeElapsedTicks,
      lifespanYears: player.lifespanYears,
      baseAttrs: player.baseAttrs as any,
      bonuses: player.bonuses as any,
      temporaryBuffs: persisted.temporaryBuffs as any,
      inventory: persisted.inventory as any,
      equipment: persisted.equipment as any,
      techniques: persisted.techniques as any,
      quests: persisted.quests as any,
      revealedBreakthroughRequirementIds: player.revealedBreakthroughRequirementIds as any,
      unlockedMinimapIds: player.unlockedMinimapIds as any,
      autoBattle: player.autoBattle,
      autoBattleSkills: player.autoBattleSkills as any,
      combatTargetId: player.combatTargetId ?? null,
      combatTargetLocked: player.combatTargetLocked === true,
      autoRetaliate: player.autoRetaliate,
      autoBattleStationary: player.autoBattleStationary === true,
      allowAoePlayerHit: player.allowAoePlayerHit === true,
      autoIdleCultivation: player.autoIdleCultivation,
      autoSwitchCultivation: player.autoSwitchCultivation === true,
      cultivatingTechId: player.cultivatingTechId ?? null,
      online: player.online === true,
      inWorld: player.inWorld !== false,
      lastHeartbeatAt: player.lastHeartbeatAt ? new Date(player.lastHeartbeatAt) : null,
      offlineSinceAt: player.offlineSinceAt ? new Date(player.offlineSinceAt) : null,
    });
  }

  private enqueue(mapId: string, command: GmCommand): void {
    const commands = this.commandsByMap.get(mapId) ?? [];
    commands.push(command);
    this.commandsByMap.set(mapId, commands);
  }

  /** 地图保存后为位置不合法的玩家寻找安全坐标 */
  private resolveMapSaveRelocation(player: PlayerState): { x: number; y: number } | null {
    const mapMeta = this.mapService.getMapMeta(player.mapId);
    if (!mapMeta) return null;

    const inBounds =
      player.x >= 0 &&
      player.y >= 0 &&
      player.x < mapMeta.width &&
      player.y < mapMeta.height;

    if (inBounds && this.mapService.canOccupy(player.mapId, player.x, player.y, {
      occupancyId: player.id,
      actorType: 'player',
    })) {
      return null;
    }

    const origin = inBounds
      ? { x: player.x, y: player.y }
      : {
          x: Math.min(mapMeta.width - 1, Math.max(0, player.x)),
          y: Math.min(mapMeta.height - 1, Math.max(0, player.y)),
        };

    const nearby = this.mapService.findNearbyWalkable(player.mapId, origin.x, origin.y, 10, {
      occupancyId: player.id,
      actorType: 'player',
    });
    if (nearby) return nearby;

    const spawn = this.mapService.getSpawnPoint(player.mapId);
    if (spawn && this.mapService.canOccupy(player.mapId, spawn.x, spawn.y, {
      occupancyId: player.id,
      actorType: 'player',
    })) {
      return spawn;
    }

    if (spawn) {
      const nearSpawn = this.mapService.findNearbyWalkable(player.mapId, spawn.x, spawn.y, 12, {
        occupancyId: player.id,
        actorType: 'player',
      });
      if (nearSpawn) return nearSpawn;
    }

    return null;
  }

  private markDirty(playerId: string, flags: DirtyFlag[]): void {
    for (const flag of flags) {
      this.playerService.markDirty(playerId, flag);
    }
  }

  private async validateManagedPlayerRoleNameUpdate(
    playerId: string,
    snapshot: Partial<PlayerState>,
    section?: GmPlayerUpdateSection,
  ): Promise<string | null> {
    if (section && section !== 'basic') {
      return null;
    }
    if (typeof snapshot.name !== 'string') {
      return null;
    }

    const runtime = this.playerService.getPlayer(playerId);
    const currentName = normalizeRoleName(runtime?.name ?? (
      await this.playerRepo.findOne({
        where: { id: playerId },
        select: { name: true },
      })
    )?.name ?? '');
    const nextName = normalizeRoleName(snapshot.name);

    if (!nextName || nextName === currentName) {
      return null;
    }

    const roleNameError = validateRoleName(nextName);
    if (roleNameError) {
      return roleNameError;
    }

    const userId = this.playerService.getUserIdByPlayerId(playerId) ?? (
      await this.playerRepo.findOne({
        where: { id: playerId },
        select: { userId: true },
      })
    )?.userId;
    const roleNameConflict = await this.nameUniquenessService.ensureAvailable(nextName, 'role', {
      exclude: userId ? [{ userId, kind: 'role' }] : [],
    });
    if (roleNameConflict) {
      return roleNameConflict;
    }

    snapshot.name = nextName;
    return null;
  }

  private mergePlayerSnapshot(
    player: PlayerState,
    snapshot: Partial<PlayerState>,
    section?: GmPlayerUpdateSection,
  ): PlayerState {
    if (!section) {
      return this.clonePlayer(snapshot) as PlayerState;
    }

    const merged = this.clonePlayer(player);
    switch (section) {
      case 'basic':
        merged.name = snapshot.name ?? merged.name;
        merged.hp = snapshot.hp ?? merged.hp;
        merged.maxHp = snapshot.maxHp ?? merged.maxHp;
        merged.qi = snapshot.qi ?? merged.qi;
        merged.dead = snapshot.dead ?? merged.dead;
        merged.autoBattle = snapshot.autoBattle ?? merged.autoBattle;
        merged.autoRetaliate = snapshot.autoRetaliate;
        merged.autoBattleStationary = snapshot.autoBattleStationary;
        merged.allowAoePlayerHit = snapshot.allowAoePlayerHit;
        merged.autoIdleCultivation = snapshot.autoIdleCultivation;
        merged.autoSwitchCultivation = snapshot.autoSwitchCultivation;
        merged.combatTargetId = snapshot.combatTargetId;
        merged.combatTargetLocked = snapshot.combatTargetLocked;
        merged.bonuses = this.cloneArray<AttrBonus>(snapshot.bonuses);
        merged.temporaryBuffs = this.normalizeTemporaryBuffs(snapshot.temporaryBuffs);
        break;
      case 'position':
        merged.mapId = snapshot.mapId ?? merged.mapId;
        merged.x = snapshot.x ?? merged.x;
        merged.y = snapshot.y ?? merged.y;
        merged.facing = snapshot.facing ?? merged.facing;
        merged.viewRange = snapshot.viewRange ?? merged.viewRange;
        break;
      case 'realm':
        merged.baseAttrs = this.normalizeAttributes(snapshot.baseAttrs);
        merged.realmLv = snapshot.realmLv;
        merged.realm = snapshot.realm ? this.cloneObject(snapshot.realm) : undefined;
        merged.foundation = snapshot.foundation;
        merged.revealedBreakthroughRequirementIds = Array.isArray(snapshot.revealedBreakthroughRequirementIds)
          ? [...snapshot.revealedBreakthroughRequirementIds]
          : [];
        break;
      case 'techniques':
        merged.techniques = this.cloneArray<TechniqueState>(snapshot.techniques);
        merged.autoBattleSkills = this.cloneArray<AutoBattleSkillConfig>(snapshot.autoBattleSkills);
        merged.cultivatingTechId = snapshot.cultivatingTechId;
        break;
      case 'items':
        merged.inventory = this.contentService.normalizeInventory(this.normalizeInventory(snapshot.inventory));
        merged.equipment = this.contentService.normalizeEquipment(this.normalizeEquipment(snapshot.equipment));
        break;
      case 'quests':
        merged.quests = this.cloneArray<QuestState>(snapshot.quests);
        break;
    }
    return merged;
  }

  private getDirtyFlagsForSection(section?: GmPlayerUpdateSection): DirtyFlag[] {
    switch (section) {
      case 'basic':
        return ['attr', 'actions'];
      case 'position':
        return ['attr', 'actions'];
      case 'realm':
        return ['attr', 'actions', 'tech'];
      case 'techniques':
        return ['tech', 'actions', 'attr'];
      case 'items':
        return ['inv', 'equip', 'attr'];
      case 'quests':
        return ['quest', 'actions'];
      default:
        return ['attr', 'inv', 'equip', 'tech', 'actions', 'quest'];
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

  private normalizeQuests(quests: QuestState[]): QuestState[] {
    return this.cloneArray<QuestState>(quests);
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

  private clonePlayer<T>(player: T): T {
    return JSON.parse(JSON.stringify(player)) as T;
  }

  private cloneArray<T>(value: unknown): T[] {
    return Array.isArray(value) ? JSON.parse(JSON.stringify(value)) as T[] : [];
  }

  private cloneObject<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private async loadUsersByIds(userIds: Iterable<string | undefined>): Promise<Map<string, UserEntity>> {
    const ids = [...new Set(
      Array.from(userIds).filter((userId): userId is string => typeof userId === 'string' && userId.length > 0),
    )];
    if (ids.length === 0) {
      return new Map();
    }
    const users = await this.userRepo.findBy({ id: In(ids) });
    return new Map(users.map((user) => [user.id, user]));
  }

  private resolveStoredDisplayName(user?: UserEntity | null): string | undefined {
    if (!user) {
      return undefined;
    }
    return this.resolvePlayerDisplayName(user.displayName ?? undefined, user.username, user.username);
  }

  private resolvePlayerDisplayName(
    displayName: string | undefined,
    accountName: string | undefined,
    fallbackName: string,
  ): string {
    const normalizedDisplayName = displayName?.trim();
    if (normalizedDisplayName) {
      return normalizedDisplayName;
    }
    const normalizedAccountName = accountName?.trim();
    if (normalizedAccountName) {
      return normalizedAccountName.slice(0, 1);
    }
    const normalizedFallback = fallbackName.trim();
    return normalizedFallback.length > 0 ? normalizedFallback.slice(0, 1) : '';
  }

  private buildAccountRecord(user: UserEntity | null | undefined, online: boolean): GmManagedAccountRecord | undefined {
    if (!user) {
      return undefined;
    }
    const sessionStartedAt = this.playerService.getOnlineSessionStartedAt(user.id)
      ?? user.currentOnlineStartedAt?.getTime();
    const currentSessionSeconds = online && sessionStartedAt
      ? Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 1000))
      : 0;
    return {
      userId: user.id,
      username: user.username,
      createdAt: user.createdAt.toISOString(),
      totalOnlineSeconds: Math.max(0, Math.floor(user.totalOnlineSeconds ?? 0)) + currentSessionSeconds,
    };
  }

  /** 获取指定区域的运行时地图快照（GM 世界管理用） */
  getMapRuntime(
    mapId: string,
    x: number,
    y: number,
    w: number,
    h: number,
    tickSpeed: number,
    tickPaused: boolean,
    viewerId?: string,
  ): GmMapRuntimeRes | null {
    const meta = this.mapService.getMapMeta(mapId);
    if (!meta) return null;

    const clampedW = Math.min(20, Math.max(1, w));
    const clampedH = Math.min(20, Math.max(1, h));
    const startX = Math.max(0, Math.min(x, meta.width - 1));
    const startY = Math.max(0, Math.min(y, meta.height - 1));
    const endX = Math.min(meta.width, startX + clampedW);
    const endY = Math.min(meta.height, startY + clampedH);
    this.updateWorldObservation(viewerId, mapId, startX, startY, endX - startX, endY - startY);

    // 收集地块
    const tiles: (VisibleTile | null)[][] = [];
    for (let dy = startY; dy < endY; dy++) {
      const row: (VisibleTile | null)[] = [];
      for (let dx = startX; dx < endX; dx++) {
        const tile = this.mapService.getTile(mapId, dx, dy);
        row.push(tile ? { type: tile.type, walkable: tile.walkable, aura: tile.aura } as VisibleTile : null);
      }
      tiles.push(row);
    }

    // 收集区域内实体
    const entities: GmRuntimeEntity[] = [];

    // 玩家
    for (const player of this.playerService.getPlayersByMap(mapId)) {
      if (player.x >= startX && player.x < endX && player.y >= startY && player.y < endY) {
        entities.push({
          id: player.id,
          x: player.x,
          y: player.y,
          char: '人',
          color: player.online ? '#4caf50' : '#888',
          name: player.name,
          kind: 'player',
          hp: player.hp,
          maxHp: player.maxHp,
          dead: player.dead,
          online: player.online === true,
          autoBattle: player.autoBattle,
          isBot: Boolean(player.isBot),
        });
      }
    }

    // 怪物
    for (const m of this.worldService.getRuntimeMonstersForGm(mapId)) {
      if (m.x >= startX && m.x < endX && m.y >= startY && m.y < endY) {
        entities.push({
          id: m.id,
          x: m.x,
          y: m.y,
          char: m.char,
          color: m.color,
          name: m.name,
          kind: 'monster',
          hp: m.hp,
          maxHp: m.maxHp,
          dead: !m.alive,
          alive: m.alive,
          targetPlayerId: m.targetPlayerId,
          respawnLeft: m.respawnLeft,
        });
      }
    }

    // NPC
    for (const npc of this.mapService.getNpcs(mapId)) {
      if (npc.x >= startX && npc.x < endX && npc.y >= startY && npc.y < endY) {
        entities.push({
          id: npc.id,
          x: npc.x,
          y: npc.y,
          char: npc.char,
          color: npc.color,
          name: npc.name,
          kind: 'npc',
        });
      }
    }

    const time = this.timeService.buildPlayerTimeState(
      { mapId, viewRange: VIEW_RADIUS } as PlayerState,
    );
    const timeConfig = this.mapService.getMapTimeConfig(mapId);

    return {
      mapId,
      mapName: meta.name,
      width: meta.width,
      height: meta.height,
      tiles,
      entities,
      time,
      timeConfig,
      tickSpeed,
      tickPaused,
    };
  }

  /** GM 修改地图时间配置 */
  updateMapTime(mapId: string, req: GmUpdateMapTimeReq): string | null {
    return this.mapService.updateMapTimeConfig(mapId, req);
  }

  private pruneExpiredWorldObservations(now: number): void {
    for (const [viewerId, session] of this.worldObservationSessions.entries()) {
      if (now - session.lastSeenAt > GM_WORLD_OBSERVE_SESSION_TTL_MS) {
        this.worldObservationSessions.delete(viewerId);
      }
    }
  }

  private ensureWorldObserveBuff(player: PlayerState): boolean {
    const targetBuffs = player.temporaryBuffs ??= [];
    const existing = targetBuffs.find((buff) => buff.buffId === GM_WORLD_OBSERVE_BUFF_ID);
    if (!existing) {
      targetBuffs.push(this.buildWorldObserveBuffState());
      this.attrService.recalcPlayer(player);
      return true;
    }

    let changed = false;
    if (existing.name !== GM_WORLD_OBSERVE_BUFF_NAME) {
      existing.name = GM_WORLD_OBSERVE_BUFF_NAME;
      changed = true;
    }
    if (existing.desc !== GM_WORLD_OBSERVE_BUFF_DESC) {
      existing.desc = GM_WORLD_OBSERVE_BUFF_DESC;
      changed = true;
    }
    if (existing.shortMark !== GM_WORLD_OBSERVE_BUFF_SHORT_MARK) {
      existing.shortMark = GM_WORLD_OBSERVE_BUFF_SHORT_MARK;
      changed = true;
    }
    if (existing.category !== 'buff') {
      existing.category = 'buff';
      changed = true;
    }
    if (existing.visibility !== 'public') {
      existing.visibility = 'public';
      changed = true;
    }
    if (existing.duration !== GM_WORLD_OBSERVE_BUFF_DURATION_TICKS) {
      existing.duration = GM_WORLD_OBSERVE_BUFF_DURATION_TICKS;
    }
    if (existing.stacks !== 1) {
      existing.stacks = 1;
      changed = true;
    }
    if (existing.maxStacks !== 1) {
      existing.maxStacks = 1;
      changed = true;
    }
    if (existing.sourceSkillId !== GM_WORLD_OBSERVE_SOURCE_ID) {
      existing.sourceSkillId = GM_WORLD_OBSERVE_SOURCE_ID;
      changed = true;
    }
    if (existing.sourceSkillName !== GM_WORLD_OBSERVE_SOURCE_NAME) {
      existing.sourceSkillName = GM_WORLD_OBSERVE_SOURCE_NAME;
      changed = true;
    }
    if (existing.color !== GM_WORLD_OBSERVE_BUFF_COLOR) {
      existing.color = GM_WORLD_OBSERVE_BUFF_COLOR;
      changed = true;
    }
    if (existing.attrs?.luck !== GM_WORLD_OBSERVE_BUFF_LUCK_BONUS || Object.keys(existing.attrs ?? {}).length !== 1) {
      existing.attrs = { luck: GM_WORLD_OBSERVE_BUFF_LUCK_BONUS };
      changed = true;
    }
    if (existing.stats !== undefined) {
      existing.stats = undefined;
      changed = true;
    }
    if (existing.qiProjection !== undefined) {
      existing.qiProjection = undefined;
      changed = true;
    }
    existing.remainingTicks = GM_WORLD_OBSERVE_BUFF_DURATION_TICKS;
    if (changed) {
      this.attrService.recalcPlayer(player);
    }
    return changed;
  }

  private removeWorldObserveBuff(player: PlayerState): boolean {
    const targetBuffs = player.temporaryBuffs;
    if (!targetBuffs || targetBuffs.length === 0) {
      return false;
    }
    const index = targetBuffs.findIndex((buff) => buff.buffId === GM_WORLD_OBSERVE_BUFF_ID);
    if (index < 0) {
      return false;
    }
    targetBuffs.splice(index, 1);
    this.attrService.recalcPlayer(player);
    return true;
  }

  private buildWorldObserveBuffState(): TemporaryBuffState {
    return {
      buffId: GM_WORLD_OBSERVE_BUFF_ID,
      name: GM_WORLD_OBSERVE_BUFF_NAME,
      desc: GM_WORLD_OBSERVE_BUFF_DESC,
      shortMark: GM_WORLD_OBSERVE_BUFF_SHORT_MARK,
      category: 'buff',
      visibility: 'public',
      remainingTicks: GM_WORLD_OBSERVE_BUFF_DURATION_TICKS,
      duration: GM_WORLD_OBSERVE_BUFF_DURATION_TICKS,
      stacks: 1,
      maxStacks: 1,
      sourceSkillId: GM_WORLD_OBSERVE_SOURCE_ID,
      sourceSkillName: GM_WORLD_OBSERVE_SOURCE_NAME,
      color: GM_WORLD_OBSERVE_BUFF_COLOR,
      attrs: {
        luck: GM_WORLD_OBSERVE_BUFF_LUCK_BONUS,
      },
    };
  }
}

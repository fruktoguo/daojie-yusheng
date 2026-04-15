/**
 * GM 业务逻辑：玩家状态查看/修改、Bot 生成/移除、地图编辑保存
 * 命令通过队列延迟到 tick 内执行，保证线程安全
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository, SelectQueryBuilder } from 'typeorm';
import {
  AttrBonus,
  Attributes,
  AutoBattleSkillConfig,
  buildDefaultCombatTargetingRules,
  CULTIVATE_EXP_PER_TICK,
  CULTIVATION_REALM_EXP_PER_TICK,
  DEFAULT_BASE_ATTRS,
  DEFAULT_BONE_AGE_YEARS,
  DEFAULT_INVENTORY_CAPACITY,
  DEFAULT_PLAYER_MAP_ID,
  Direction,
  EquipmentSlots,
  EQUIP_SLOTS,
  GmEditorBuffOption,
  GmEditorCatalogRes,
  GmListPlayersQuery,
  GmManagedAccountRecord,
  GmMapDocument,
  GmMapListRes,
  GmMapRuntimeRes,
  GmManagedPlayerRecord,
  GmManagedPlayerSummary,
  GmPlayerSortMode,
  GmPlayerUpdateSection,
  GmRuntimeEntity,
  GmShortcutRunRes,
  GmStateRes,
  GmUpdateMapTimeReq,
  Inventory,
  hasCombatTargetingRule,
  normalizeCombatTargetingRules,
  normalizeAutoBattleTargetingMode,
  normalizeAutoUsePillConfigs,
  normalizeBodyTrainingState,
  getBodyTrainingExpToNext,
  PlayerState,
  QuestState,
  TechniqueState,
  TemporaryBuffState,
  VIEW_RADIUS,
  VisibleTile,
  WORLD_DARKNESS_BUFF_DURATION,
  WORLD_DARKNESS_BUFF_ID,
  WORLD_TIME_SOURCE_ID,
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
import { RoleNameModerationService } from '../auth/role-name-moderation.service';
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
import { syncDynamicBuffPresentation } from './buff-presentation';
import {
  CULTIVATION_ACTION_ID,
  CULTIVATION_BUFF_DURATION,
  CULTIVATION_BUFF_ID,
  REALM_STATE_SOURCE,
} from '../constants/gameplay/technique';

const GM_PLAYER_PAGE_SIZE_DEFAULT = 50;
const GM_PLAYER_PAGE_SIZE_MAX = 100;
const GM_PLAYER_KEYWORD_MAX_LENGTH = 60;

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
      type: 'setBodyTrainingLevel';
      playerId: string;
      level: number;
    }
  | {
      type: 'addFoundation';
      playerId: string;
      amount: number;
    }
  | {
      type: 'addCombatExp';
      playerId: string;
      amount: number;
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
      type: 'grantCombatExpCompensation';
      playerId: string;
      amount: number;
    }
  | {
      type: 'grantFoundationCompensation';
      playerId: string;
      amount: number;
    }
  | {
      type: 'cleanupInvalidItems';
      playerId: string;
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

interface InvalidItemCleanupSummary {
  inventoryStacksRemoved: number;
  marketStorageStacksRemoved: number;
  equipmentRemoved: number;
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
    private readonly roleNameModerationService: RoleNameModerationService,
    private readonly contentService: ContentService,
    private readonly equipmentService: EquipmentService,
    private readonly techniqueService: TechniqueService,
    private readonly timeService: TimeService,
  ) {}

  /** 获取分页后的 GM 全局状态：玩家列表当前页、聚合统计、地图列表、性能快照 */
  async getState(query?: GmListPlayersQuery): Promise<GmStateRes> {
    const normalizedQuery = this.normalizePlayerListQuery(query);
    const [playerPage, playerStats] = await Promise.all([
      this.loadPlayerPage(normalizedQuery),
      this.loadPlayerSummaryStats(),
    ]);

    return {
      players: playerPage.players,
      playerPage: {
        page: playerPage.page,
        pageSize: playerPage.pageSize,
        total: playerPage.total,
        totalPages: playerPage.totalPages,
        keyword: normalizedQuery.keyword,
        sort: normalizedQuery.sort,
      },
      playerStats,
      mapIds: this.mapService.getAllMapIds().sort(),
      botCount: this.botService.getBotCount(),
      perf: this.performanceService.getSnapshot(),
    };
  }

  private normalizePlayerListQuery(query?: GmListPlayersQuery): {
    page: number;
    pageSize: number;
    keyword: string;
    sort: GmPlayerSortMode;
  } {
    const rawPage = Number(query?.page);
    const page = Number.isFinite(rawPage)
      ? Math.max(1, Math.floor(rawPage))
      : 1;
    const rawPageSize = Number(query?.pageSize);
    const requestedPageSize = Number.isFinite(rawPageSize)
      ? Math.floor(rawPageSize)
      : GM_PLAYER_PAGE_SIZE_DEFAULT;
    const pageSize = Math.max(1, Math.min(GM_PLAYER_PAGE_SIZE_MAX, requestedPageSize || GM_PLAYER_PAGE_SIZE_DEFAULT));
    const keyword = typeof query?.keyword === 'string'
      ? query.keyword.trim().slice(0, GM_PLAYER_KEYWORD_MAX_LENGTH)
      : '';
    const sort = this.normalizePlayerSortMode(query?.sort);
    return { page, pageSize, keyword, sort };
  }

  private normalizePlayerSortMode(sort: string | undefined): GmPlayerSortMode {
    switch (sort) {
      case 'realm-asc':
      case 'online':
      case 'map':
      case 'name':
        return sort;
      case 'realm-desc':
      default:
        return 'realm-desc';
    }
  }

  private async loadPlayerSummaryStats(): Promise<{
    totalPlayers: number;
    onlinePlayers: number;
    offlineHangingPlayers: number;
    offlinePlayers: number;
  }> {
    const [totalPlayers, onlinePlayers, offlineHangingPlayers] = await Promise.all([
      this.playerRepo.count(),
      this.playerRepo.count({ where: { online: true } }),
      this.playerRepo.count({ where: { online: false, inWorld: true } }),
    ]);
    return {
      totalPlayers,
      onlinePlayers,
      offlineHangingPlayers,
      offlinePlayers: Math.max(0, totalPlayers - onlinePlayers - offlineHangingPlayers),
    };
  }

  private async loadPlayerPage(query: {
    page: number;
    pageSize: number;
    keyword: string;
    sort: GmPlayerSortMode;
  }): Promise<{
    players: GmManagedPlayerSummary[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }> {
    const baseQuery = this.playerRepo.createQueryBuilder('player')
      .leftJoin(UserEntity, 'player_user', 'player_user.id = player."userId"');
    this.applyPlayerListKeyword(baseQuery, query.keyword);

    const total = await baseQuery.clone().getCount();
    const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
    const page = Math.min(totalPages, query.page);
    const entities = await this.applyPlayerListSort(baseQuery.clone(), query.sort)
      .offset((page - 1) * query.pageSize)
      .limit(query.pageSize)
      .getMany();

    const userById = await this.loadUsersByIds(entities.map((entity) => entity.userId));
    const players = entities.map((entity) => {
      const user = userById.get(entity.userId);
      return this.buildSummary(
        this.hydrateStoredPlayer(entity, this.resolveStoredDisplayName(user)),
        { userId: entity.userId, accountName: user?.username },
        entity.online === true,
        entity.updatedAt,
      );
    });

    return {
      players,
      page,
      pageSize: query.pageSize,
      total,
      totalPages,
    };
  }

  private applyPlayerListKeyword(query: SelectQueryBuilder<PlayerEntity>, keyword: string): void {
    if (!keyword) {
      return;
    }
    const normalizedKeyword = keyword.toLowerCase();
    const likeKeyword = `%${normalizedKeyword}%`;
    const matchedMapIds = this.findMatchingMapIds(keyword);
    query.andWhere(new Brackets((builder) => {
      builder
        .where('LOWER(player.name) LIKE :likeKeyword', { likeKeyword })
        .orWhere('LOWER(COALESCE(player_user.username, \'\')) LIKE :likeKeyword', { likeKeyword })
        .orWhere('LOWER(COALESCE(player_user."displayName", \'\')) LIKE :likeKeyword', { likeKeyword })
        .orWhere('LOWER(player."mapId") LIKE :likeKeyword', { likeKeyword });
      if (matchedMapIds.length > 0) {
        builder.orWhere('player."mapId" IN (:...matchedMapIds)', { matchedMapIds });
      }
    }));
  }

  private applyPlayerListSort(
    query: SelectQueryBuilder<PlayerEntity>,
    sort: GmPlayerSortMode,
  ): SelectQueryBuilder<PlayerEntity> {
    const realmLvExpression = this.getPlayerRealmLevelSql('player');
    switch (sort) {
      case 'realm-asc':
        return query
          .orderBy(realmLvExpression, 'ASC')
          .addOrderBy('player.name', 'ASC');
      case 'online':
        return query
          .orderBy('player.online', 'DESC')
          .addOrderBy('player.inWorld', 'DESC')
          .addOrderBy(realmLvExpression, 'DESC')
          .addOrderBy('player.name', 'ASC');
      case 'map':
        return query
          .orderBy(this.getPlayerMapNameSql('player'), 'ASC')
          .addOrderBy(realmLvExpression, 'DESC')
          .addOrderBy('player.name', 'ASC');
      case 'name':
        return query
          .orderBy('player.name', 'ASC');
      case 'realm-desc':
      default:
        return query
          .orderBy(realmLvExpression, 'DESC')
          .addOrderBy('player.name', 'ASC');
    }
  }

  private findMatchingMapIds(keyword: string): string[] {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      return [];
    }
    return this.mapService.getAllMapIds().filter((mapId) => {
      const meta = this.mapService.getMapMeta(mapId);
      return mapId.toLowerCase().includes(normalizedKeyword)
        || (meta?.name?.toLowerCase().includes(normalizedKeyword) ?? false);
    });
  }

  private getPlayerRealmLevelSql(alias: string): string {
    return `COALESCE((
      SELECT NULLIF(bonus->'meta'->>'realmLv', '')::int
      FROM jsonb_array_elements(${alias}.bonuses) AS bonus
      WHERE bonus->>'source' = ${this.quoteSqlStringLiteral(REALM_STATE_SOURCE)}
      LIMIT 1
    ), 1)`;
  }

  private getPlayerMapNameSql(alias: string): string {
    const mapIds = this.mapService.getAllMapIds();
    if (mapIds.length === 0) {
      return `${alias}."mapId"`;
    }
    const cases = mapIds.map((mapId) => {
      const mapName = this.mapService.getMapMeta(mapId)?.name ?? mapId;
      return `WHEN ${this.quoteSqlStringLiteral(mapId)} THEN ${this.quoteSqlStringLiteral(mapName)}`;
    }).join(' ');
    return `CASE ${alias}."mapId" ${cases} ELSE ${alias}."mapId" END`;
  }

  private quoteSqlStringLiteral(value: string): string {
    return `'${value.replace(/'/g, `''`)}'`;
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
      buffs: this.buildEditorBuffCatalog(),
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

  async setManagedPlayerBodyTrainingLevel(playerId: string, requestedLevel: unknown): Promise<string | null> {
    const level = this.parseBodyTrainingLevel(requestedLevel);
    if (level === null) {
      return '炼体等级必须是非负整数';
    }

    const runtime = this.playerService.getPlayer(playerId);
    if (runtime) {
      this.enqueue(runtime.mapId, {
        type: 'setBodyTrainingLevel',
        playerId,
        level,
      });
      return null;
    }

    const entity = await this.playerRepo.findOne({ where: { id: playerId } });
    if (!entity) return '目标玩家不存在';

    const player = this.hydrateStoredPlayer(entity);
    this.applyBodyTrainingLevel(player, level);
    await this.persistOfflinePlayer(entity, player);
    return null;
  }

  async addManagedPlayerFoundation(playerId: string, requestedAmount: unknown): Promise<string | null> {
    const amount = this.parseCounterDelta(requestedAmount, '底蕴增量');
    if (typeof amount === 'string') {
      return amount;
    }

    const runtime = this.playerService.getPlayer(playerId);
    if (runtime) {
      this.enqueue(runtime.mapId, {
        type: 'addFoundation',
        playerId,
        amount,
      });
      return null;
    }

    const entity = await this.playerRepo.findOne({ where: { id: playerId } });
    if (!entity) return '目标玩家不存在';

    const player = this.hydrateStoredPlayer(entity);
    player.foundation = this.applyCounterDelta(player.foundation, amount);
    await this.persistOfflinePlayer(entity, player);
    return null;
  }

  async addManagedPlayerCombatExp(playerId: string, requestedAmount: unknown): Promise<string | null> {
    const amount = this.parseCounterDelta(requestedAmount, '战斗经验增量');
    if (typeof amount === 'string') {
      return amount;
    }

    const runtime = this.playerService.getPlayer(playerId);
    if (runtime) {
      this.enqueue(runtime.mapId, {
        type: 'addCombatExp',
        playerId,
        amount,
      });
      return null;
    }

    const entity = await this.playerRepo.findOne({ where: { id: playerId } });
    if (!entity) return '目标玩家不存在';

    const player = this.hydrateStoredPlayer(entity);
    player.combatExp = this.applyCounterDelta(player.combatExp, amount);
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

/** cleanupAllPlayersInvalidItems：执行 批量将所有非机器人角色送回默认新手村出生点 */
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

/** cleanupAllPlayersInvalidItems 的业务逻辑。 */
  async cleanupAllPlayersInvalidItems(): Promise<GmShortcutRunRes> {
    const runtimePlayers = this.playerService.getAllPlayers().filter((player) => !player.isBot);
    const runtimeIds = new Set(runtimePlayers.map((player) => player.id));
    let queuedRuntimePlayers = 0;
    let updatedOfflinePlayers = 0;
    let totalInvalidInventoryStacksRemoved = 0;
    let totalInvalidMarketStorageStacksRemoved = 0;
    let totalInvalidEquipmentRemoved = 0;

    for (const player of runtimePlayers) {
      const summary = this.inspectInvalidItems(player);
      if (!this.hasInvalidItems(summary)) {
        continue;
      }
      this.enqueue(player.mapId, { type: 'cleanupInvalidItems', playerId: player.id });
      queuedRuntimePlayers += 1;
      totalInvalidInventoryStacksRemoved += summary.inventoryStacksRemoved;
      totalInvalidMarketStorageStacksRemoved += summary.marketStorageStacksRemoved;
      totalInvalidEquipmentRemoved += summary.equipmentRemoved;
    }

    const entities = await this.playerRepo.find();
    for (const entity of entities) {
      if (runtimeIds.has(entity.id)) {
        continue;
      }
      const player = this.hydrateStoredPlayer(entity);
      if (player.isBot) {
        continue;
      }
      const summary = this.cleanupInvalidItems(player);
      if (!this.hasInvalidItems(summary)) {
        continue;
      }
      await this.persistOfflinePlayer(entity, player);
      updatedOfflinePlayers += 1;
      totalInvalidInventoryStacksRemoved += summary.inventoryStacksRemoved;
      totalInvalidMarketStorageStacksRemoved += summary.marketStorageStacksRemoved;
      totalInvalidEquipmentRemoved += summary.equipmentRemoved;
    }

    return {
      ok: true,
      totalPlayers: queuedRuntimePlayers + updatedOfflinePlayers,
      queuedRuntimePlayers,
      updatedOfflinePlayers,
      totalInvalidInventoryStacksRemoved,
      totalInvalidMarketStorageStacksRemoved,
      totalInvalidEquipmentRemoved,
    };
  }

  async compensateAllPlayersCombatExp(): Promise<GmShortcutRunRes> {
    const runtimePlayers = this.playerService.getAllPlayers().filter((player) => !player.isBot && player.inWorld !== false);
    const runtimeIds = new Set(runtimePlayers.map((player) => player.id));
    let queuedRuntimePlayers = 0;
    let updatedOfflinePlayers = 0;
    let totalCombatExpGranted = 0;

    for (const player of runtimePlayers) {
      const amount = this.calculateCombatExpCompensation(player);
      if (amount <= 0) {
        continue;
      }
      this.enqueue(player.mapId, {
        type: 'grantCombatExpCompensation',
        playerId: player.id,
        amount,
      });
      queuedRuntimePlayers += 1;
      totalCombatExpGranted += amount;
    }

    const entities = await this.playerRepo.find();
    for (const entity of entities) {
      if (runtimeIds.has(entity.id)) {
        continue;
      }
      const player = this.hydrateStoredPlayer(entity);
      if (player.isBot) {
        continue;
      }
      const amount = this.calculateCombatExpCompensation(player);
      if (amount <= 0) {
        continue;
      }
      player.combatExp = this.normalizeNonNegativeInt(player.combatExp) + amount;
      await this.persistOfflinePlayer(entity, player);
      updatedOfflinePlayers += 1;
      totalCombatExpGranted += amount;
    }

    return {
      ok: true,
      totalPlayers: queuedRuntimePlayers + updatedOfflinePlayers,
      queuedRuntimePlayers,
      updatedOfflinePlayers,
      totalCombatExpGranted,
    };
  }

  async compensateAllPlayersFoundation(): Promise<GmShortcutRunRes> {
    const runtimePlayers = this.playerService.getAllPlayers().filter((player) => !player.isBot && player.inWorld !== false);
    const runtimeIds = new Set(runtimePlayers.map((player) => player.id));
    let queuedRuntimePlayers = 0;
    let updatedOfflinePlayers = 0;
    let totalFoundationGranted = 0;

    for (const player of runtimePlayers) {
      const amount = this.calculateFoundationCompensation(player);
      if (amount <= 0) {
        continue;
      }
      this.enqueue(player.mapId, {
        type: 'grantFoundationCompensation',
        playerId: player.id,
        amount,
      });
      queuedRuntimePlayers += 1;
      totalFoundationGranted += amount;
    }

    const entities = await this.playerRepo.find();
    for (const entity of entities) {
      if (runtimeIds.has(entity.id)) {
        continue;
      }
      const player = this.hydrateStoredPlayer(entity);
      if (player.isBot) {
        continue;
      }
      const amount = this.calculateFoundationCompensation(player);
      if (amount <= 0) {
        continue;
      }
      player.foundation = this.normalizeNonNegativeInt(player.foundation) + amount;
      await this.persistOfflinePlayer(entity, player);
      updatedOfflinePlayers += 1;
      totalFoundationGranted += amount;
    }

    return {
      ok: true,
      totalPlayers: queuedRuntimePlayers + updatedOfflinePlayers,
      queuedRuntimePlayers,
      updatedOfflinePlayers,
      totalFoundationGranted,
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
      case 'setBodyTrainingLevel':
        return this.applyQueuedSetBodyTrainingLevel(command.playerId, command.level);
      case 'addFoundation':
        return this.applyQueuedAddFoundation(command.playerId, command.amount);
      case 'addCombatExp':
        return this.applyQueuedAddCombatExp(command.playerId, command.amount);
      case 'spawnBots':
        return this.applyQueuedSpawnBots(command.mapId, command.x, command.y, command.count);
      case 'grantCombatExpCompensation':
        return this.applyQueuedGrantCombatExpCompensation(command.playerId, command.amount);
      case 'grantFoundationCompensation':
        return this.applyQueuedGrantFoundationCompensation(command.playerId, command.amount);
      case 'cleanupInvalidItems':
        return this.applyQueuedCleanupInvalidItems(command.playerId);
      case 'removeBots':
        return this.applyQueuedRemoveBots(command.playerIds, command.all);
    }
  }

/** applyQueuedPlayerUpdate：执行 在 tick 内执行单条 GM 命令 */
  applyCommand(command: GmCommand): string | null {
    switch (command.type) {
      case 'updatePlayer':
        return this.applyQueuedPlayerUpdate(command.playerId, command.snapshot, command.section);
      case 'resetPlayer':
        return this.applyQueuedResetPlayer(command.playerId);
      case 'resetHeavenGate':
        return this.applyQueuedResetHeavenGate(command.playerId);
      case 'setBodyTrainingLevel':
        return this.applyQueuedSetBodyTrainingLevel(command.playerId, command.level);
      case 'addFoundation':
        return this.applyQueuedAddFoundation(command.playerId, command.amount);
      case 'addCombatExp':
        return this.applyQueuedAddCombatExp(command.playerId, command.amount);
      case 'spawnBots':
        return this.applyQueuedSpawnBots(command.mapId, command.x, command.y, command.count);
      case 'grantCombatExpCompensation':
        return this.applyQueuedGrantCombatExpCompensation(command.playerId, command.amount);
      case 'grantFoundationCompensation':
        return this.applyQueuedGrantFoundationCompensation(command.playerId, command.amount);
      case 'cleanupInvalidItems':
        return this.applyQueuedCleanupInvalidItems(command.playerId);
      case 'removeBots':
        return this.applyQueuedRemoveBots(command.playerIds, command.all);
    }
  }

/** applyQueuedPlayerUpdate 的业务逻辑。 */
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

  private applyQueuedSetBodyTrainingLevel(playerId: string, level: number): string | null {
    const player = this.playerService.getPlayer(playerId);
    if (!player) return '目标玩家不存在';
    this.applyBodyTrainingLevel(player, level);
    this.markDirty(player.id, ['attr', 'actions', 'tech']);
    void this.playerService.savePlayer(player.id).catch((error: Error) => {
      this.logger.error(`GM 设置炼体等级落盘失败: ${player.id} ${error.message}`);
    });
    return null;
  }

  private applyQueuedAddFoundation(playerId: string, amount: number): string | null {
    const player = this.playerService.getPlayer(playerId);
    if (!player) return '目标玩家不存在';
    if (amount === 0) {
      return null;
    }
    player.foundation = this.applyCounterDelta(player.foundation, amount);
    this.markDirty(player.id, ['attr']);
    void this.playerService.savePlayer(player.id).catch((error: Error) => {
      this.logger.error(`GM 增加底蕴落盘失败: ${player.id} ${error.message}`);
    });
    return null;
  }

  private applyQueuedAddCombatExp(playerId: string, amount: number): string | null {
    const player = this.playerService.getPlayer(playerId);
    if (!player) return '目标玩家不存在';
    if (amount === 0) {
      return null;
    }
    player.combatExp = this.applyCounterDelta(player.combatExp, amount);
    this.markDirty(player.id, ['attr']);
    void this.playerService.savePlayer(player.id).catch((error: Error) => {
      this.logger.error(`GM 增加战斗经验落盘失败: ${player.id} ${error.message}`);
    });
    return null;
  }

  private applyQueuedSpawnBots(mapId: string, x: number, y: number, count: number): string | null {
    const created = this.botService.spawnBotsAt(mapId, x, y, count);
    if (created <= 0) return '附近没有可用于生成机器人的空位';
    return null;
  }

  private applyQueuedGrantCombatExpCompensation(playerId: string, amount: number): string | null {
    const player = this.playerService.getPlayer(playerId);
    if (!player) return '目标玩家不存在';
    if (amount <= 0) {
      return null;
    }
    player.combatExp = this.normalizeNonNegativeInt(player.combatExp) + amount;
    this.markDirty(player.id, ['attr']);
    void this.playerService.savePlayer(player.id).catch((error: Error) => {
      this.logger.error(`GM 补偿战斗经验落盘失败: ${player.id} ${error.message}`);
    });
    return null;
  }

  private applyQueuedGrantFoundationCompensation(playerId: string, amount: number): string | null {
    const player = this.playerService.getPlayer(playerId);
    if (!player) return '目标玩家不存在';
    if (amount <= 0) {
      return null;
    }
    player.foundation = this.normalizeNonNegativeInt(player.foundation) + amount;
    this.markDirty(player.id, ['attr']);
    void this.playerService.savePlayer(player.id).catch((error: Error) => {
      this.logger.error(`GM 补偿底蕴落盘失败: ${player.id} ${error.message}`);
    });
    return null;
  }

  private applyQueuedCleanupInvalidItems(playerId: string): string | null {
    const player = this.playerService.getPlayer(playerId);
    if (!player) return '目标玩家不存在';
    const summary = this.cleanupInvalidItems(player);
    if (!this.hasInvalidItems(summary)) {
      return null;
    }
    this.markDirty(player.id, ['inv', 'equip', 'attr']);
    void this.playerService.savePlayer(player.id).catch((error: Error) => {
      this.logger.error(`GM 清理无效物品落盘失败: ${player.id} ${error.message}`);
    });
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
        respawnMapId: player.respawnMapId,
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
        autoBattleTargetingMode: player.autoBattleTargetingMode,
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
    const player = this.playerService.hydrateStoredPlayerForRead(entity);
    player.displayName = this.resolvePlayerDisplayName(displayName, undefined, entity.name);
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
    player.respawnMapId = this.mapService.resolvePlayerRespawnMapId(snapshot.respawnMapId ?? player.respawnMapId);
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
    player.autoUsePills = normalizeAutoUsePillConfigs(snapshot.autoUsePills ?? player.autoUsePills);
    player.combatTargetingRules = normalizeCombatTargetingRules(
      snapshot.combatTargetingRules ?? player.combatTargetingRules,
      buildDefaultCombatTargetingRules({ includeAllPlayersHostile: (snapshot.allowAoePlayerHit ?? player.allowAoePlayerHit) === true }),
    );
    player.autoBattleTargetingMode = normalizeAutoBattleTargetingMode(snapshot.autoBattleTargetingMode, player.autoBattleTargetingMode);
    player.autoRetaliate = snapshot.autoRetaliate !== false;
    player.autoBattleStationary = snapshot.autoBattleStationary === true;
    player.allowAoePlayerHit = hasCombatTargetingRule(player.combatTargetingRules, 'hostile', 'all_players');
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
    player.autoBattleTargetingMode = normalizeAutoBattleTargetingMode(snapshot.autoBattleTargetingMode, player.autoBattleTargetingMode);
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

/** resetStoredPlayerToSpawn：执行 从数据库实体还原为运行时 PlayerState */
  private hydrateStoredPlayer(entity: PlayerEntity, displayName?: string): PlayerState {
    const player = this.playerService.hydrateStoredPlayerForRead(entity);
    player.displayName = this.resolvePlayerDisplayName(displayName, undefined, entity.name);
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
    player.respawnMapId = this.mapService.resolvePlayerRespawnMapId(snapshot.respawnMapId ?? player.respawnMapId);
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
    player.autoUsePills = normalizeAutoUsePillConfigs(snapshot.autoUsePills ?? player.autoUsePills);
    player.combatTargetingRules = normalizeCombatTargetingRules(
      snapshot.combatTargetingRules ?? player.combatTargetingRules,
      buildDefaultCombatTargetingRules({ includeAllPlayersHostile: (snapshot.allowAoePlayerHit ?? player.allowAoePlayerHit) === true }),
    );
    player.autoBattleTargetingMode = normalizeAutoBattleTargetingMode(snapshot.autoBattleTargetingMode, player.autoBattleTargetingMode);
    player.autoRetaliate = snapshot.autoRetaliate !== false;
    player.autoBattleStationary = snapshot.autoBattleStationary === true;
    player.allowAoePlayerHit = hasCombatTargetingRule(player.combatTargetingRules, 'hostile', 'all_players');
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
    player.autoBattleTargetingMode = normalizeAutoBattleTargetingMode(snapshot.autoBattleTargetingMode, player.autoBattleTargetingMode);
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

/** resetStoredPlayerToSpawn 的业务逻辑。 */
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
    player.retaliatePlayerTargetId = undefined;
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
      respawnMapId: player.respawnMapId,
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
      autoUsePills: (player.autoUsePills ?? []) as any,
      combatTargetingRules: player.combatTargetingRules as any,
      autoBattleTargetingMode: player.autoBattleTargetingMode,
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

/** enqueue：执行 将离线玩家状态持久化到数据库 */
  private async persistOfflinePlayer(entity: PlayerEntity, player: PlayerState): Promise<void> {
    this.techniqueService.preparePlayerForPersistence(player);
    const persisted = buildPersistedPlayerCollections(player, this.contentService, this.mapService);
    await this.playerRepo.update(entity.id, {
      name: player.name,
      mapId: player.mapId,
      respawnMapId: player.respawnMapId,
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
      autoUsePills: (player.autoUsePills ?? []) as any,
      combatTargetingRules: player.combatTargetingRules as any,
      autoBattleTargetingMode: player.autoBattleTargetingMode,
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

/** enqueue 的业务逻辑。 */
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

  private calculateCombatExpCompensation(player: Pick<PlayerState, 'realm' | 'bodyTraining'>): number {
    const realmExpToNext = this.normalizeNonNegativeInt(player.realm?.progressToNext ?? 0);
    const bodyTrainingExpToNext = normalizeBodyTrainingState(player.bodyTraining).expToNext;
    return realmExpToNext + this.normalizeNonNegativeInt(bodyTrainingExpToNext);
  }

  private calculateFoundationCompensation(player: Pick<PlayerState, 'realm'>): number {
    const realmExpToNext = this.normalizeNonNegativeInt(player.realm?.progressToNext ?? 0);
    return realmExpToNext * 5;
  }

  private applyBodyTrainingLevel(player: PlayerState, level: number): void {
    const preservedExp = this.normalizeNonNegativeInt(player.bodyTraining?.exp ?? 0);
    const expToNext = getBodyTrainingExpToNext(level);
    player.bodyTraining = normalizeBodyTrainingState({
      level,
      exp: Math.min(preservedExp, Math.max(0, expToNext - 1)),
    });
    this.techniqueService.initializePlayerProgression(player);
  }

  private parseBodyTrainingLevel(value: unknown): number | null {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
      return null;
    }
    return Math.floor(numeric);
  }

  private parseCounterDelta(value: unknown, label: string): number | string {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
      return `${label}必须是整数`;
    }
    return numeric;
  }

  private applyCounterDelta(currentValue: unknown, amount: number): number {
    return Math.max(0, this.normalizeNonNegativeInt(currentValue) + amount);
  }

  private hasInvalidItems(summary: InvalidItemCleanupSummary): boolean {
    return summary.inventoryStacksRemoved > 0
      || summary.marketStorageStacksRemoved > 0
      || summary.equipmentRemoved > 0;
  }

  private inspectInvalidItems(player: Pick<PlayerState, 'inventory' | 'marketStorage' | 'equipment'>): InvalidItemCleanupSummary {
    const inventoryStacksRemoved = (player.inventory?.items ?? []).filter((item) => !this.contentService.getItem(item.itemId)).length;
    const marketStorageStacksRemoved = (player.marketStorage?.items ?? []).filter((item) => !this.contentService.getItem(item.itemId)).length;
    let equipmentRemoved = 0;
    for (const slot of EQUIP_SLOTS) {
      const item = player.equipment?.[slot];
      if (item && !this.contentService.getItem(item.itemId)) {
        equipmentRemoved += 1;
      }
    }
    return {
      inventoryStacksRemoved,
      marketStorageStacksRemoved,
      equipmentRemoved,
    };
  }

  private cleanupInvalidItems(player: PlayerState): InvalidItemCleanupSummary {
    const summary = this.inspectInvalidItems(player);
    if (!this.hasInvalidItems(summary)) {
      return summary;
    }

    player.inventory = {
      ...player.inventory,
      items: (player.inventory?.items ?? []).filter((item) => this.contentService.getItem(item.itemId)),
    };
    player.marketStorage = {
      ...player.marketStorage,
      items: (player.marketStorage?.items ?? []).filter((item) => this.contentService.getItem(item.itemId)),
    };

    if (summary.equipmentRemoved > 0) {
      const nextEquipment = { ...player.equipment };
      for (const slot of EQUIP_SLOTS) {
        const item = nextEquipment[slot];
        if (item && !this.contentService.getItem(item.itemId)) {
          nextEquipment[slot] = null;
        }
      }
      player.equipment = nextEquipment;
      this.equipmentService.rebuildBonuses(player);
      player.hp = Math.min(player.maxHp, this.normalizeNonNegativeInt(player.hp));
      const maxQi = Math.max(0, Math.round(player.numericStats?.maxQi ?? player.qi ?? 0));
      player.qi = Math.min(maxQi, Math.max(0, Math.round(player.qi ?? 0)));
      if (player.hp <= 0) {
        player.hp = 0;
        player.dead = true;
      }
    }

    return summary;
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
    const roleNameSensitiveError = this.roleNameModerationService.validateRoleName(nextName);
    if (roleNameSensitiveError) {
      return roleNameSensitiveError;
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
        merged.autoUsePills = normalizeAutoUsePillConfigs(snapshot.autoUsePills ?? merged.autoUsePills);
        merged.combatTargetingRules = normalizeCombatTargetingRules(
          snapshot.combatTargetingRules ?? merged.combatTargetingRules,
          buildDefaultCombatTargetingRules({ includeAllPlayersHostile: (snapshot.allowAoePlayerHit ?? merged.allowAoePlayerHit) === true }),
        );
        merged.autoBattleTargetingMode = snapshot.autoBattleTargetingMode ?? merged.autoBattleTargetingMode;
        merged.autoRetaliate = snapshot.autoRetaliate;
        merged.autoBattleStationary = snapshot.autoBattleStationary;
        merged.allowAoePlayerHit = hasCombatTargetingRule(merged.combatTargetingRules, 'hostile', 'all_players');
        merged.autoIdleCultivation = snapshot.autoIdleCultivation;
        merged.autoSwitchCultivation = snapshot.autoSwitchCultivation;
        merged.combatTargetId = snapshot.combatTargetId;
        merged.combatTargetLocked = snapshot.combatTargetLocked;
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
        merged.bonuses = this.cloneArray<AttrBonus>(snapshot.bonuses);
        break;
      case 'buffs':
        merged.temporaryBuffs = this.normalizeTemporaryBuffs(snapshot.temporaryBuffs);
        break;
      case 'techniques':
        merged.techniques = this.cloneArray<TechniqueState>(snapshot.techniques);
        merged.autoBattleSkills = this.cloneArray<AutoBattleSkillConfig>(snapshot.autoBattleSkills);
        merged.autoUsePills = normalizeAutoUsePillConfigs(snapshot.autoUsePills ?? merged.autoUsePills);
        merged.combatTargetingRules = normalizeCombatTargetingRules(
          snapshot.combatTargetingRules ?? merged.combatTargetingRules,
          buildDefaultCombatTargetingRules({ includeAllPlayersHostile: (snapshot.allowAoePlayerHit ?? merged.allowAoePlayerHit) === true }),
        );
        merged.allowAoePlayerHit = hasCombatTargetingRule(merged.combatTargetingRules, 'hostile', 'all_players');
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
      case 'buffs':
        return ['attr', 'actions'];
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

  private buildEditorBuffCatalog(): GmEditorBuffOption[] {
    const catalog = new Map<string, GmEditorBuffOption>();
    const register = (buff: TemporaryBuffState): void => {
      const buffId = buff.buffId.trim();
      if (!buffId || catalog.has(buffId)) {
        return;
      }
      catalog.set(buffId, this.cloneObject(syncDynamicBuffPresentation(buff)) as GmEditorBuffOption);
    };

    for (const technique of this.contentService.getEditorTechniqueCatalog()) {
      for (const skill of technique.skills ?? []) {
        for (const effect of skill.effects ?? []) {
          if (effect.type !== 'buff') {
            continue;
          }
          const buffId = effect.buffId.trim();
          if (!buffId) {
            continue;
          }
          const duration = Math.max(1, effect.duration);
          const maxStacks = Math.max(1, effect.maxStacks ?? 1);
          register({
            buffId,
            name: effect.name,
            desc: effect.desc,
            shortMark: this.normalizeEditorBuffShortMark(effect.shortMark, effect.name),
            category: effect.category ?? (effect.target === 'self' ? 'buff' : 'debuff'),
            visibility: effect.visibility ?? 'public',
            remainingTicks: duration,
            duration,
            stacks: 1,
            maxStacks,
            sourceSkillId: skill.id,
            sourceSkillName: skill.name,
            realmLv: 1,
            color: effect.color,
            attrs: effect.attrs,
            attrMode: effect.attrMode,
            stats: effect.stats,
            statMode: effect.statMode,
            qiProjection: effect.qiProjection,
          });
        }
      }
    }

    for (const item of this.contentService.getEditorItemCatalog()) {
      for (const buff of item.consumeBuffs ?? []) {
        const buffId = buff.buffId.trim();
        if (!buffId) {
          continue;
        }
        const duration = Math.max(1, buff.duration);
        const maxStacks = Math.max(1, buff.maxStacks ?? 1);
        register({
          buffId,
          name: buff.name,
          desc: buff.desc,
          shortMark: this.normalizeEditorBuffShortMark(buff.shortMark, buff.name),
          category: buff.category ?? 'buff',
          visibility: buff.visibility ?? 'public',
          remainingTicks: duration,
          duration,
          stacks: 1,
          maxStacks,
          sourceSkillId: `item:${item.itemId}`,
          sourceSkillName: item.name,
          realmLv: 1,
          color: buff.color,
          attrs: buff.attrs,
          attrMode: buff.attrMode,
          stats: buff.stats,
          statMode: buff.statMode,
          qiProjection: buff.qiProjection,
        });
      }

      for (const effect of item.effects ?? []) {
        if (effect.type !== 'timed_buff') {
          continue;
        }
        const buffId = effect.buff.buffId.trim();
        if (!buffId) {
          continue;
        }
        const duration = Math.max(1, effect.buff.duration);
        const maxStacks = Math.max(1, effect.buff.maxStacks ?? 1);
        register({
          buffId,
          name: effect.buff.name,
          desc: effect.buff.desc,
          shortMark: this.normalizeEditorBuffShortMark(effect.buff.shortMark, effect.buff.name),
          category: effect.buff.category ?? 'buff',
          visibility: effect.buff.visibility ?? 'public',
          remainingTicks: duration,
          duration,
          stacks: 1,
          maxStacks,
          sourceSkillId: `equip:${item.itemId}:${effect.effectId ?? 'effect'}`,
          sourceSkillName: item.name,
          realmLv: 1,
          color: effect.buff.color,
          attrs: effect.buff.attrs,
          attrMode: effect.buff.attrMode,
          stats: effect.buff.stats,
          statMode: effect.buff.statMode,
          qiProjection: effect.buff.qiProjection,
        });
      }
    }

    register({
      buffId: WORLD_DARKNESS_BUFF_ID,
      name: '夜色压境',
      desc: '夜色会按层数压缩视野；若身处恒明或得以免疫，此压制可被抵消。',
      shortMark: '夜',
      category: 'debuff',
      visibility: 'observe_only',
      remainingTicks: WORLD_DARKNESS_BUFF_DURATION,
      duration: WORLD_DARKNESS_BUFF_DURATION,
      stacks: 1,
      maxStacks: 5,
      sourceSkillId: WORLD_TIME_SOURCE_ID,
      sourceSkillName: '天时',
      realmLv: 1,
      color: '#89a8c7',
    });
    register({
      buffId: CULTIVATION_BUFF_ID,
      name: '修炼中',
      desc: '正在运转功法，每息获得境界修为与功法经验，移动、主动攻击或受击都会打断修炼。',
      shortMark: '修',
      category: 'buff',
      visibility: 'public',
      remainingTicks: CULTIVATION_BUFF_DURATION,
      duration: CULTIVATION_BUFF_DURATION,
      stacks: 1,
      maxStacks: 1,
      sourceSkillId: CULTIVATION_ACTION_ID,
      sourceSkillName: '修炼',
      realmLv: 1,
      stats: {
        realmExpPerTick: CULTIVATION_REALM_EXP_PER_TICK,
        techniqueExpPerTick: CULTIVATE_EXP_PER_TICK,
      },
      statMode: 'flat',
    });
    register(this.buildWorldObserveBuffState());

    return [...catalog.values()].sort((left, right) => {
      const nameOrder = left.name.localeCompare(right.name, 'zh-CN');
      if (nameOrder !== 0) {
        return nameOrder;
      }
      return left.buffId.localeCompare(right.buffId, 'zh-CN');
    });
  }

  private normalizeEditorBuffShortMark(raw: string | undefined, fallbackName: string): string {
    const value = raw?.trim();
    if (value) {
      return [...value][0] ?? value;
    }
    const fallback = fallbackName.trim();
    return [...fallback][0] ?? '气';
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

/** pruneExpiredWorldObservations：执行 GM 修改地图时间配置 */
  updateMapTime(mapId: string, req: GmUpdateMapTimeReq): string | null {
    return this.mapService.updateMapTimeConfig(mapId, req);
  }

/** pruneExpiredWorldObservations 的业务逻辑。 */
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
      realmLv: 1,
      color: GM_WORLD_OBSERVE_BUFF_COLOR,
      attrs: {
        luck: GM_WORLD_OBSERVE_BUFF_LUCK_BONUS,
      },
      attrMode: 'flat',
    };
  }
}


/**
 * GM 业务逻辑：玩家状态查看/修改、Bot 生成/移除、地图编辑保存
 * 命令通过队列延迟到 tick 内执行，保证线程安全
 */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
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
  GmBanPlayersByRiskPreviewRes,
  GmBanPlayersByRiskReq,
  GmBanPlayersByRiskRes,
  GmManagedPlayerAccountStatus,
  GmListPlayersQuery,
  GmManagedAccountRecord,
  GmManagedPlayerBehavior,
  GmMapDocument,
  GmMapListRes,
  GmMapRuntimeRes,
  GmPlayerAccountStatusFilter,
  GmPlayerRiskFactor,
  GmPlayerRiskLevel,
  GmPlayerRiskReport,
  GmManagedPlayerRecord,
  GmManagedPlayerSummary,
  GmPlayerBehaviorFilter,
  GmPlayerPresenceFilter,
  GmPlayerSortMode,
  GmPlayerUpdateSection,
  GmRiskOperationAuditRecord,
  GmRuntimeEntity,
  GmShortcutRunRes,
  GmStateRes,
  GmUpdateWorldSettingsReq,
  GmWorldSettings,
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
  S2C,
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
import { MarketTradeHistoryEntity } from '../database/entities/market-trade-history.entity';
import { PlayerEntity } from '../database/entities/player.entity';
import { UserEntity } from '../database/entities/user.entity';
import { GmRiskOperationAuditEntity } from '../database/entities/gm-risk-operation-audit.entity';
import { PersistentDocumentService } from '../database/persistent-document.service';
import { RedisService } from '../database/redis.service';
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
import { WorldRuleService } from './world-rule.service';
import { LootService } from './loot.service';
import { syncDynamicBuffPresentation } from './buff-presentation';
import {
  CULTIVATION_ACTION_ID,
  CULTIVATION_BUFF_DURATION,
  CULTIVATION_BUFF_ID,
  REALM_STATE_SOURCE,
} from '../constants/gameplay/technique';

/** GM_PLAYER_PAGE_SIZE_DEFAULT：定义该变量以承载业务值。 */
const GM_PLAYER_PAGE_SIZE_DEFAULT = 50;
/** GM_PLAYER_PAGE_SIZE_MAX：定义该变量以承载业务值。 */
const GM_PLAYER_PAGE_SIZE_MAX = 100;
/** GM_PLAYER_KEYWORD_MAX_LENGTH：定义该变量以承载业务值。 */
const GM_PLAYER_KEYWORD_MAX_LENGTH = 60;
/** GM_PLAYER_GATHER_BUFF_ID：定义该变量以承载业务值。 */
const GM_PLAYER_GATHER_BUFF_ID = 'system.gather';
/** GM_PLAYER_RISK_REVIEW_WINDOW_TRADE_LIMIT：定义该变量以承载业务值。 */
const GM_PLAYER_RISK_REVIEW_WINDOW_TRADE_LIMIT = 120;
/** GM_GENERIC_SERIAL_ACCOUNT_PREFIXES：定义该变量以承载业务值。 */
const GM_GENERIC_SERIAL_ACCOUNT_PREFIXES = new Set([
  'user',
  'player',
  'account',
  'role',
  'guest',
  'test',
  'temp',
  'demo',
  'sample',
]);
/** GM_CONTACT_STYLE_ACCOUNT_PREFIXES：定义该变量以承载业务值。 */
const GM_CONTACT_STYLE_ACCOUNT_PREFIXES = new Set([
  'qq',
]);

/** GmCommand：定义该类型的结构与数据语义。 */
type GmCommand =
  | {
/** type：定义该变量以承载业务值。 */
      type: 'updatePlayer';
/** playerId：定义该变量以承载业务值。 */
      playerId: string;
/** snapshot：定义该变量以承载业务值。 */
      snapshot: Partial<PlayerState>;
      section?: GmPlayerUpdateSection;
    }
  | {
/** type：定义该变量以承载业务值。 */
      type: 'resetPlayer';
/** playerId：定义该变量以承载业务值。 */
      playerId: string;
    }
  | {
/** type：定义该变量以承载业务值。 */
      type: 'resetHeavenGate';
/** playerId：定义该变量以承载业务值。 */
      playerId: string;
    }
  | {
/** type：定义该变量以承载业务值。 */
      type: 'setBodyTrainingLevel';
/** playerId：定义该变量以承载业务值。 */
      playerId: string;
/** level：定义该变量以承载业务值。 */
      level: number;
    }
  | {
/** type：定义该变量以承载业务值。 */
      type: 'addFoundation';
/** playerId：定义该变量以承载业务值。 */
      playerId: string;
/** amount：定义该变量以承载业务值。 */
      amount: number;
    }
  | {
/** type：定义该变量以承载业务值。 */
      type: 'addCombatExp';
/** playerId：定义该变量以承载业务值。 */
      playerId: string;
/** amount：定义该变量以承载业务值。 */
      amount: number;
    }
  | {
/** type：定义该变量以承载业务值。 */
      type: 'spawnBots';
/** anchorPlayerId：定义该变量以承载业务值。 */
      anchorPlayerId: string;
/** mapId：定义该变量以承载业务值。 */
      mapId: string;
/** x：定义该变量以承载业务值。 */
      x: number;
/** y：定义该变量以承载业务值。 */
      y: number;
/** count：定义该变量以承载业务值。 */
      count: number;
    }
  | {
/** type：定义该变量以承载业务值。 */
      type: 'grantCombatExpCompensation';
/** playerId：定义该变量以承载业务值。 */
      playerId: string;
/** amount：定义该变量以承载业务值。 */
      amount: number;
    }
  | {
/** type：定义该变量以承载业务值。 */
      type: 'grantFoundationCompensation';
/** playerId：定义该变量以承载业务值。 */
      playerId: string;
/** amount：定义该变量以承载业务值。 */
      amount: number;
    }
  | {
/** type：定义该变量以承载业务值。 */
      type: 'cleanupInvalidItems';
/** playerId：定义该变量以承载业务值。 */
      playerId: string;
    }
  | {
/** type：定义该变量以承载业务值。 */
      type: 'addHerbStockToMap';
/** mapId：定义该变量以承载业务值。 */
      mapId: string;
/** amount：定义该变量以承载业务值。 */
      amount: number;
    }
  | {
/** type：定义该变量以承载业务值。 */
      type: 'removeBots';
      playerIds?: string[];
      all?: boolean;
    }
  | {
/** type：定义该变量以承载业务值。 */
      type: 'applyPeaceMode';
      mapId: string;
    };

/** GmPlayerUserIdentity：定义该接口的能力与字段约束。 */
interface GmPlayerUserIdentity {
  userId?: string;
  accountName?: string;
  accountStatus: GmManagedPlayerAccountStatus;
}

/** GmWorldObservationSession：定义该接口的能力与字段约束。 */
interface GmWorldObservationSession {
/** viewerId：定义该变量以承载业务值。 */
  viewerId: string;
/** mapId：定义该变量以承载业务值。 */
  mapId: string;
/** startX：定义该变量以承载业务值。 */
  startX: number;
/** startY：定义该变量以承载业务值。 */
  startY: number;
/** endX：定义该变量以承载业务值。 */
  endX: number;
/** endY：定义该变量以承载业务值。 */
  endY: number;
/** lastSeenAt：定义该变量以承载业务值。 */
  lastSeenAt: number;
}

/** InvalidItemCleanupSummary：定义该接口的能力与字段约束。 */
interface InvalidItemCleanupSummary {
/** inventoryStacksRemoved：定义该变量以承载业务值。 */
  inventoryStacksRemoved: number;
/** marketStorageStacksRemoved：定义该变量以承载业务值。 */
  marketStorageStacksRemoved: number;
/** equipmentRemoved：定义该变量以承载业务值。 */
  equipmentRemoved: number;
}

interface SimilarSerialAccountAggregateRow {
  totalCount: string | number | null;
  bannedCount: string | number | null;
}

interface SimilarSerialAccountPreviewRow {
  username: string;
  createdAt: Date | string;
  bannedAt: Date | string | null;
}

interface CounterpartyTradeAggregate {
  playerId: string;
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  lastCreatedAt: number;
}

interface GmRiskBatchPreviewSession {
  token: string;
  gmTokenHash: string;
  matchedPlayers: number;
  targetSnapshotHash: string;
  expiresAt: number;
}

interface GmRiskAdminAccountDocument {
  userId: string;
  username: string;
  addedAt: string;
}

const GM_RISK_BATCH_PREVIEW_TTL_MS = 2 * 60 * 1000;
const GM_RISK_BATCH_PREVIEW_KEY_PREFIX = 'gm:risk-batch-preview:';
const GM_RISK_ADMIN_ACCOUNT_SCOPE = 'gm_risk_admin_accounts';
const CONSUME_RISK_BATCH_PREVIEW_LUA = `
local raw = redis.call('GET', KEYS[1])
if not raw then
  return 'missing'
end
local payload = cjson.decode(raw)
if not payload then
  redis.call('DEL', KEYS[1])
  return 'invalid'
end
if tonumber(payload.expiresAt or '0') < tonumber(ARGV[1]) then
  redis.call('DEL', KEYS[1])
  return 'expired'
end
if tostring(payload.gmTokenHash or '') ~= tostring(ARGV[2]) then
  return 'gm_mismatch'
end
if tostring(payload.matchedPlayers or '') ~= tostring(ARGV[3]) then
  return 'count_mismatch'
end
if tostring(payload.targetSnapshotHash or '') ~= tostring(ARGV[4]) then
  return 'snapshot_mismatch'
end
redis.call('DEL', KEYS[1])
return 'ok'
`;

@Injectable()
/** GmService：封装相关状态与行为。 */
export class GmService {
  private readonly commandsByMap = new Map<string, GmCommand[]>();
  private readonly worldObservationSessions = new Map<string, GmWorldObservationSession>();
  private readonly logger = new Logger(GmService.name);

  constructor(
    @InjectRepository(PlayerEntity)
    private readonly playerRepo: Repository<PlayerEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(MarketTradeHistoryEntity)
    private readonly marketTradeHistoryRepo: Repository<MarketTradeHistoryEntity>,
    @InjectRepository(GmRiskOperationAuditEntity)
    private readonly gmRiskOperationAuditRepo: Repository<GmRiskOperationAuditEntity>,
    private readonly persistentDocumentService: PersistentDocumentService,
    private readonly redisService: RedisService,
    private readonly botService: BotService,
    private readonly playerService: PlayerService,
    private readonly mapService: MapService,
    private readonly attrService: AttrService,
    private readonly navigationService: NavigationService,
    private readonly performanceService: PerformanceService,
    private readonly worldService: WorldService,
    private readonly worldRuleService: WorldRuleService,
    private readonly accountService: AccountService,
    private readonly nameUniquenessService: NameUniquenessService,
    private readonly roleNameModerationService: RoleNameModerationService,
    private readonly contentService: ContentService,
    private readonly equipmentService: EquipmentService,
    private readonly techniqueService: TechniqueService,
    private readonly timeService: TimeService,
    private readonly lootService: LootService,
  ) {}

  /** 获取分页后的 GM 全局状态：玩家列表当前页、聚合统计、地图列表、性能快照 */
  async getState(query?: GmListPlayersQuery): Promise<GmStateRes> {
/** normalizedQuery：定义该变量以承载业务值。 */
    const normalizedQuery = this.normalizePlayerListQuery(query);
/** riskAdminUserIds：定义该变量以承载业务值。 */
    const riskAdminUserIds = await this.loadRiskAdminUserIds();
    const [playerPage, playerStats, riskAuditLogs] = await Promise.all([
      this.loadPlayerPage(normalizedQuery, riskAdminUserIds),
      this.loadPlayerSummaryStats(),
      this.loadRecentRiskAuditLogs(),
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
        presence: normalizedQuery.presence,
        behavior: normalizedQuery.behavior,
        accountStatus: normalizedQuery.accountStatus,
      },
      playerStats,
      mapIds: this.mapService.getAllMapIds().sort(),
      botCount: this.botService.getBotCount(),
      worldSettings: this.getWorldSettings(),
      riskAuditLogs,
      perf: this.performanceService.getSnapshot(),
    };
  }

  async updateWorldSettings(payload: GmUpdateWorldSettingsReq): Promise<void> {
    const nextPeaceModeEnabled = payload?.worldSettings?.peaceModeEnabled === true;
    const changed = await this.worldRuleService.setPeaceModeEnabled(nextPeaceModeEnabled);
    if (!changed || !nextPeaceModeEnabled) {
      return;
    }
    await this.disableOfflinePlayerAllPlayerHostility();
    for (const mapId of this.getMapsWithRuntimePlayers()) {
      this.enqueue(mapId, { type: 'applyPeaceMode', mapId });
    }
  }

/** normalizePlayerListQuery：执行对应的业务逻辑。 */
  private normalizePlayerListQuery(query?: GmListPlayersQuery): {
/** page：定义该变量以承载业务值。 */
    page: number;
/** pageSize：定义该变量以承载业务值。 */
    pageSize: number;
/** keyword：定义该变量以承载业务值。 */
    keyword: string;
/** sort：定义该变量以承载业务值。 */
    sort: GmPlayerSortMode;
/** presence：定义该变量以承载业务值。 */
    presence: GmPlayerPresenceFilter;
/** behavior：定义该变量以承载业务值。 */
    behavior: GmPlayerBehaviorFilter;
    accountStatus: GmPlayerAccountStatusFilter;
  } {
/** rawPage：定义该变量以承载业务值。 */
    const rawPage = Number(query?.page);
/** page：定义该变量以承载业务值。 */
    const page = Number.isFinite(rawPage)
      ? Math.max(1, Math.floor(rawPage))
      : 1;
/** rawPageSize：定义该变量以承载业务值。 */
    const rawPageSize = Number(query?.pageSize);
/** requestedPageSize：定义该变量以承载业务值。 */
    const requestedPageSize = Number.isFinite(rawPageSize)
      ? Math.floor(rawPageSize)
      : GM_PLAYER_PAGE_SIZE_DEFAULT;
/** pageSize：定义该变量以承载业务值。 */
    const pageSize = Math.max(1, Math.min(GM_PLAYER_PAGE_SIZE_MAX, requestedPageSize || GM_PLAYER_PAGE_SIZE_DEFAULT));
/** keyword：定义该变量以承载业务值。 */
    const keyword = typeof query?.keyword === 'string'
      ? query.keyword.trim().slice(0, GM_PLAYER_KEYWORD_MAX_LENGTH)
      : '';
/** sort：定义该变量以承载业务值。 */
    const sort = this.normalizePlayerSortMode(query?.sort);
/** presence：定义该变量以承载业务值。 */
    const presence = this.normalizePlayerPresenceFilter(query?.presence);
/** behavior：定义该变量以承载业务值。 */
    const behavior = this.normalizePlayerBehaviorFilter(query?.behavior);
    const accountStatus = this.normalizePlayerAccountStatusFilter(query?.accountStatus);
    return { page, pageSize, keyword, sort, presence, behavior, accountStatus };
  }

/** normalizePlayerSortMode：执行对应的业务逻辑。 */
  private normalizePlayerSortMode(sort: string | undefined): GmPlayerSortMode {
    switch (sort) {
      case 'realm-asc':
      case 'online':
      case 'map':
      case 'name':
      case 'risk-desc':
      case 'risk-asc':
        return sort;
      case 'realm-desc':
      default:
        return 'realm-desc';
    }
  }

  private normalizePlayerPresenceFilter(filter: string | undefined): GmPlayerPresenceFilter {
    switch (filter) {
      case 'online':
      case 'offline-hanging':
      case 'offline':
        return filter;
      case 'all':
      default:
        return 'all';
    }
  }

  private normalizePlayerBehaviorFilter(filter: string | undefined): GmPlayerBehaviorFilter {
    switch (filter) {
      case 'combat':
      case 'cultivation':
      case 'alchemy':
      case 'enhancement':
      case 'gather':
        return filter;
      case 'all':
      default:
        return 'all';
    }
  }

  private normalizePlayerAccountStatusFilter(filter: string | undefined): GmPlayerAccountStatusFilter {
    switch (filter) {
      case 'normal':
      case 'banned':
      case 'abnormal':
        return filter;
      case 'all':
      default:
        return 'all';
    }
  }

/** loadPlayerSummaryStats：执行对应的业务逻辑。 */
  private async loadPlayerSummaryStats(): Promise<{
/** totalPlayers：定义该变量以承载业务值。 */
    totalPlayers: number;
/** onlinePlayers：定义该变量以承载业务值。 */
    onlinePlayers: number;
/** offlineHangingPlayers：定义该变量以承载业务值。 */
    offlineHangingPlayers: number;
/** offlinePlayers：定义该变量以承载业务值。 */
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
/** page：定义该变量以承载业务值。 */
    page: number;
/** pageSize：定义该变量以承载业务值。 */
    pageSize: number;
/** keyword：定义该变量以承载业务值。 */
    keyword: string;
/** sort：定义该变量以承载业务值。 */
    sort: GmPlayerSortMode;
/** presence：定义该变量以承载业务值。 */
    presence: GmPlayerPresenceFilter;
/** behavior：定义该变量以承载业务值。 */
    behavior: GmPlayerBehaviorFilter;
    accountStatus: GmPlayerAccountStatusFilter;
  }, riskAdminUserIds: ReadonlySet<string>): Promise<{
/** players：定义该变量以承载业务值。 */
    players: GmManagedPlayerSummary[];
/** page：定义该变量以承载业务值。 */
    page: number;
/** pageSize：定义该变量以承载业务值。 */
    pageSize: number;
/** total：定义该变量以承载业务值。 */
    total: number;
/** totalPages：定义该变量以承载业务值。 */
    totalPages: number;
  }> {
/** baseQuery：定义该变量以承载业务值。 */
    const baseQuery = this.playerRepo.createQueryBuilder('player')
      .leftJoin(UserEntity, 'player_user', 'player_user.id = player."userId"');
    this.applyPlayerListKeyword(baseQuery, query.keyword);
    this.applyPlayerListPresenceFilter(baseQuery, query.presence);
    this.applyPlayerListBehaviorFilter(baseQuery, query.behavior);
    this.applyPlayerListAccountStatusFilter(baseQuery, query.accountStatus);

/** total：定义该变量以承载业务值。 */
    const total = await baseQuery.clone().getCount();
/** totalPages：定义该变量以承载业务值。 */
    const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
/** page：定义该变量以承载业务值。 */
    const page = Math.min(totalPages, query.page);
/** players：定义该变量以承载业务值。 */
    const players = query.sort === 'risk-desc' || query.sort === 'risk-asc'
      ? await this.loadRiskSortedPlayerSummaries(baseQuery.clone(), query.sort, page, query.pageSize, riskAdminUserIds)
      : await this.loadPagedPlayerSummaries(baseQuery.clone(), query.sort, page, query.pageSize, riskAdminUserIds);

    return {
      players,
      page,
      pageSize: query.pageSize,
      total,
      totalPages,
    };
  }

  private async loadPagedPlayerSummaries(
    query: SelectQueryBuilder<PlayerEntity>,
    sort: GmPlayerSortMode,
    page: number,
    pageSize: number,
    riskAdminUserIds: ReadonlySet<string>,
  ): Promise<GmManagedPlayerSummary[]> {
/** entities：定义该变量以承载业务值。 */
    const entities = await this.applyPlayerListSort(query, sort)
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .getMany();
    return this.buildPlayerSummariesFromEntities(entities, riskAdminUserIds);
  }

  private async loadRiskSortedPlayerSummaries(
    query: SelectQueryBuilder<PlayerEntity>,
    sort: Extract<GmPlayerSortMode, 'risk-desc' | 'risk-asc'>,
    page: number,
    pageSize: number,
    riskAdminUserIds: ReadonlySet<string>,
  ): Promise<GmManagedPlayerSummary[]> {
/** entities：定义该变量以承载业务值。 */
    const entities = await query.getMany();
/** summaries：定义该变量以承载业务值。 */
    const summaries = await this.buildPlayerSummariesFromEntities(entities, riskAdminUserIds);
    summaries.sort((left, right) => {
      if (sort === 'risk-asc') {
        return left.riskScore - right.riskScore || left.realmLv - right.realmLv || left.name.localeCompare(right.name);
      }
      return right.riskScore - left.riskScore || right.realmLv - left.realmLv || left.name.localeCompare(right.name);
    });
    return summaries.slice((page - 1) * pageSize, page * pageSize);
  }

  private async loadRecentRiskAuditLogs(limit = 10): Promise<GmRiskOperationAuditRecord[]> {
/** records：定义该变量以承载业务值。 */
    const records = await this.gmRiskOperationAuditRepo.find({
      order: { createdAt: 'DESC', id: 'DESC' },
      take: Math.max(1, Math.min(20, Math.floor(limit))),
    });
    return records.map((entry) => ({
      id: entry.id,
      action: entry.action,
      operator: entry.operator,
      reason: entry.reason ?? undefined,
      minRiskScore: entry.minRiskScore,
      matchedPlayers: entry.matchedPlayers,
      bannedPlayers: entry.bannedPlayers,
      skippedPlayers: entry.skippedPlayers,
      keyword: this.pickAuditFilterString(entry.filters, 'keyword'),
      sort: this.pickAuditFilterString(entry.filters, 'sort') as GmPlayerSortMode | undefined,
      presence: this.pickAuditFilterString(entry.filters, 'presence') as GmPlayerPresenceFilter | undefined,
      behavior: this.pickAuditFilterString(entry.filters, 'behavior') as GmPlayerBehaviorFilter | undefined,
      accountStatus: this.pickAuditFilterString(entry.filters, 'accountStatus') as GmPlayerAccountStatusFilter | undefined,
      createdAt: entry.createdAt.toISOString(),
    }));
  }

  private async recordRiskAuditLog(input: {
    action: 'batch-ban-by-risk';
    operator: string;
    reason: string | null;
    minRiskScore: number;
    matchedPlayers: number;
    bannedPlayers: number;
    skippedPlayers: number;
    filters: Record<string, unknown>;
    samplePlayerIds: string[];
  }): Promise<void> {
    await this.gmRiskOperationAuditRepo.save(this.gmRiskOperationAuditRepo.create({
      id: randomUUID(),
      action: input.action,
      operator: input.operator,
      reason: input.reason,
      minRiskScore: input.minRiskScore,
      matchedPlayers: input.matchedPlayers,
      bannedPlayers: input.bannedPlayers,
      skippedPlayers: input.skippedPlayers,
      filters: input.filters,
      samplePlayerIds: input.samplePlayerIds,
    }));
  }

  private pickAuditFilterString(filters: Record<string, unknown> | null | undefined, key: string): string | undefined {
/** value：定义该变量以承载业务值。 */
    const value = filters?.[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private async resolveBanPlayersByRiskTargets(body: GmBanPlayersByRiskReq): Promise<{
    minRiskScore: number;
    targetSnapshotHash: string;
    query: {
      page: number;
      pageSize: number;
      keyword: string;
      sort: GmPlayerSortMode;
      presence: GmPlayerPresenceFilter;
      behavior: GmPlayerBehaviorFilter;
      accountStatus: GmPlayerAccountStatusFilter;
    };
    targets: GmManagedPlayerSummary[];
  }> {
/** minRiskScore：定义该变量以承载业务值。 */
    const minRiskScore = Number.isFinite(Number(body?.minRiskScore))
      ? Math.max(0, Math.floor(Number(body.minRiskScore)))
      : 60;
/** query：定义该变量以承载业务值。 */
    const query = this.normalizePlayerListQuery({
      keyword: body?.keyword,
      sort: body?.sort,
      presence: body?.presence,
      behavior: body?.behavior,
      accountStatus: body?.accountStatus,
      page: 1,
      pageSize: GM_PLAYER_PAGE_SIZE_MAX,
    });
/** baseQuery：定义该变量以承载业务值。 */
    const baseQuery = this.playerRepo.createQueryBuilder('player')
      .leftJoin(UserEntity, 'player_user', 'player_user.id = player."userId"');
    this.applyPlayerListKeyword(baseQuery, query.keyword);
    this.applyPlayerListPresenceFilter(baseQuery, query.presence);
    this.applyPlayerListBehaviorFilter(baseQuery, query.behavior);
    this.applyPlayerListAccountStatusFilter(baseQuery, query.accountStatus);
/** riskAdminUserIds：定义该变量以承载业务值。 */
    const riskAdminUserIds = await this.loadRiskAdminUserIds();
/** entities：定义该变量以承载业务值。 */
    const entities = await baseQuery.getMany();
/** summaries：定义该变量以承载业务值。 */
    const summaries = await this.buildPlayerSummariesFromEntities(entities, riskAdminUserIds);
/** targets：定义该变量以承载业务值。 */
    const targets = summaries.filter((entry) => (
      !entry.meta.isBot
      && !entry.isRiskAdmin
      && entry.accountStatus !== 'banned'
      && entry.riskScore >= minRiskScore
    )).sort((left, right) => right.riskScore - left.riskScore || left.roleName.localeCompare(right.roleName));
    return {
      minRiskScore,
      targetSnapshotHash: this.buildRiskTargetSnapshotHash(targets),
      query,
      targets,
    };
  }

  private buildRiskTargetSnapshotHash(targets: GmManagedPlayerSummary[]): string {
/** payload：定义该变量以承载业务值。 */
    const payload = targets
      .map((entry) => `${entry.id}:${entry.riskScore}:${entry.accountStatus}`)
      .sort()
      .join('|');
    return createHash('sha256').update(payload).digest('hex').slice(0, 24);
  }

  private issueRiskBatchPreviewToken(gmToken: string, matchedPlayers: number, targetSnapshotHash: string): string {
    return randomUUID();
  }

  private async assertRiskBatchPreviewToken(
    gmToken: string,
    previewToken: string | undefined,
    matchedPlayers: number,
    targetSnapshotHash: string,
  ): Promise<void> {
    if (!previewToken || previewToken.trim().length <= 0) {
      throw new BadRequestException('缺少批量封号预览令牌，请先重新预览。');
    }
/** status：定义该变量以承载业务值。 */
    const status = await this.redisService.evalLua(
      CONSUME_RISK_BATCH_PREVIEW_LUA,
      [this.getRiskBatchPreviewRedisKey(previewToken.trim())],
      [Date.now(), this.hashGmToken(gmToken), matchedPlayers, targetSnapshotHash],
    );
    switch (status) {
      case 'ok':
        return;
      case 'expired':
      case 'missing':
        throw new BadRequestException('批量封号预览令牌已失效，请先重新预览。');
      case 'gm_mismatch':
        throw new BadRequestException('当前 GM 会话与预览令牌不匹配，请先重新预览。');
      case 'count_mismatch':
      case 'snapshot_mismatch':
        throw new BadRequestException('批量封号预览令牌与当前目标快照不匹配，请先重新预览。');
      case 'invalid':
      default:
        throw new BadRequestException('批量封号预览令牌校验失败，请先重新预览。');
    }
  }

  private hashGmToken(token: string): string {
    return createHash('sha256').update(token.trim()).digest('hex');
  }

  private getRiskBatchPreviewRedisKey(token: string): string {
    return `${GM_RISK_BATCH_PREVIEW_KEY_PREFIX}${token}`;
  }

  private async loadPlayerSnapshot(playerId: string): Promise<PlayerState | null> {
/** entity：定义该变量以承载业务值。 */
    const entity = await this.playerRepo.findOne({ where: { id: playerId } });
    if (!entity) {
      return null;
    }
/** user：定义该变量以承载业务值。 */
    const user = await this.userRepo.findOne({ where: { id: entity.userId } });
    return this.hydrateStoredPlayer(entity, this.resolveStoredDisplayName(user));
  }

  private deriveRiskTags(report: GmPlayerRiskReport): string[] {
    return report.factors
      .filter((factor) => factor.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3)
      .map((factor) => factor.label);
  }

  private async buildPlayerSummariesFromEntities(
    entities: PlayerEntity[],
    riskAdminUserIds: ReadonlySet<string>,
  ): Promise<GmManagedPlayerSummary[]> {
/** userById：定义该变量以承载业务值。 */
    const userById = await this.loadUsersByIds(entities.map((entity) => entity.userId));
    return Promise.all(entities.map(async (entity) => {
/** user：定义该变量以承载业务值。 */
      const user = userById.get(entity.userId);
/** player：定义该变量以承载业务值。 */
      const player = this.hydrateStoredPlayer(entity, this.resolveStoredDisplayName(user));
/** riskReport：定义该变量以承载业务值。 */
      const riskReport = await this.buildPlayerRiskReport(player, user, entity.online === true, riskAdminUserIds);
      return this.buildSummary(
        player,
        {
          userId: entity.userId,
          accountName: user?.username,
          accountStatus: this.getManagedPlayerAccountStatus(user, entity.userId, user?.username),
        },
        entity.online === true,
        entity.updatedAt,
        riskReport,
        user ? riskAdminUserIds.has(user.id) : false,
      );
    }));
  }

  private applyPlayerListAccountStatusFilter(
    query: SelectQueryBuilder<PlayerEntity>,
    accountStatus: GmPlayerAccountStatusFilter,
  ): void {
    switch (accountStatus) {
      case 'normal':
        query.andWhere('player_user.id IS NOT NULL').andWhere('player_user."bannedAt" IS NULL');
        return;
      case 'banned':
        query.andWhere('player_user."bannedAt" IS NOT NULL');
        return;
      case 'abnormal':
        query.andWhere('player_user.id IS NULL');
        return;
      case 'all':
      default:
        return;
    }
  }

  private applyPlayerListPresenceFilter(
    query: SelectQueryBuilder<PlayerEntity>,
    presence: GmPlayerPresenceFilter,
  ): void {
    switch (presence) {
      case 'online':
        query.andWhere('player.online = true');
        return;
      case 'offline-hanging':
        query.andWhere('player.online = false').andWhere('player."inWorld" = true');
        return;
      case 'offline':
        query.andWhere('player.online = false').andWhere('player."inWorld" = false');
        return;
      case 'all':
      default:
        return;
    }
  }

  private applyPlayerListBehaviorFilter(
    query: SelectQueryBuilder<PlayerEntity>,
    behavior: GmPlayerBehaviorFilter,
  ): void {
    switch (behavior) {
      case 'combat':
        query.andWhere(new Brackets((builder) => {
          builder
            .where('player."autoBattle" = true')
            .orWhere('player."combatTargetLocked" = true')
            .orWhere('player."combatTargetId" IS NOT NULL');
        }));
        return;
      case 'cultivation':
        query.andWhere('player."temporaryBuffs" @> CAST(:cultivationBuffFilter AS jsonb)', {
          cultivationBuffFilter: JSON.stringify([{ buffId: CULTIVATION_BUFF_ID }]),
        });
        return;
      case 'alchemy':
        query.andWhere('player."alchemyJob" IS NOT NULL').andWhere(`player."alchemyJob" <> 'null'::jsonb`);
        return;
      case 'enhancement':
        query.andWhere('player."enhancementJob" IS NOT NULL').andWhere(`player."enhancementJob" <> 'null'::jsonb`);
        return;
      case 'gather':
        query.andWhere('player."temporaryBuffs" @> CAST(:gatherBuffFilter AS jsonb)', {
          gatherBuffFilter: JSON.stringify([{ buffId: GM_PLAYER_GATHER_BUFF_ID }]),
        });
        return;
      case 'all':
      default:
        return;
    }
  }

/** applyPlayerListKeyword：执行对应的业务逻辑。 */
  private applyPlayerListKeyword(query: SelectQueryBuilder<PlayerEntity>, keyword: string): void {
    if (!keyword) {
      return;
    }
/** normalizedKeyword：定义该变量以承载业务值。 */
    const normalizedKeyword = keyword.toLowerCase();
/** likeKeyword：定义该变量以承载业务值。 */
    const likeKeyword = `%${normalizedKeyword}%`;
/** matchedMapIds：定义该变量以承载业务值。 */
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
/** realmLvExpression：定义该变量以承载业务值。 */
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
      case 'risk-desc':
      case 'risk-asc':
        return query
          .orderBy(realmLvExpression, 'DESC')
          .addOrderBy('player.name', 'ASC');
      case 'realm-desc':
      default:
        return query
          .orderBy(realmLvExpression, 'DESC')
          .addOrderBy('player.name', 'ASC');
    }
  }

/** findMatchingMapIds：执行对应的业务逻辑。 */
  private findMatchingMapIds(keyword: string): string[] {
/** normalizedKeyword：定义该变量以承载业务值。 */
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      return [];
    }
    return this.mapService.getAllMapIds().filter((mapId) => {
/** meta：定义该变量以承载业务值。 */
      const meta = this.mapService.getMapMeta(mapId);
      return mapId.toLowerCase().includes(normalizedKeyword)
        || (meta?.name?.toLowerCase().includes(normalizedKeyword) ?? false);
    });
  }

/** getPlayerRealmLevelSql：执行对应的业务逻辑。 */
  private getPlayerRealmLevelSql(alias: string): string {
    return `COALESCE((
      SELECT NULLIF(bonus->'meta'->>'realmLv', '')::int
      FROM jsonb_array_elements(${alias}.bonuses) AS bonus
      WHERE bonus->>'source' = ${this.quoteSqlStringLiteral(REALM_STATE_SOURCE)}
      LIMIT 1
    ), 1)`;
  }

/** getPlayerMapNameSql：执行对应的业务逻辑。 */
  private getPlayerMapNameSql(alias: string): string {
/** mapIds：定义该变量以承载业务值。 */
    const mapIds = this.mapService.getAllMapIds();
    if (mapIds.length === 0) {
      return `${alias}."mapId"`;
    }
/** cases：定义该变量以承载业务值。 */
    const cases = mapIds.map((mapId) => {
/** mapName：定义该变量以承载业务值。 */
      const mapName = this.mapService.getMapMeta(mapId)?.name ?? mapId;
      return `WHEN ${this.quoteSqlStringLiteral(mapId)} THEN ${this.quoteSqlStringLiteral(mapName)}`;
    }).join(' ');
    return `CASE ${alias}."mapId" ${cases} ELSE ${alias}."mapId" END`;
  }

/** quoteSqlStringLiteral：执行对应的业务逻辑。 */
  private quoteSqlStringLiteral(value: string): string {
    return `'${value.replace(/'/g, `''`)}'`;
  }

  /** 获取单个玩家的完整详情（在线取运行时，离线取数据库） */
  async getPlayerDetail(playerId: string): Promise<GmManagedPlayerRecord | null> {
/** riskAdminUserIds：定义该变量以承载业务值。 */
    const riskAdminUserIds = await this.loadRiskAdminUserIds();
/** runtime：定义该变量以承载业务值。 */
    const runtime = this.playerService.getPlayer(playerId);
    if (runtime) {
/** userId：定义该变量以承载业务值。 */
      const userId = this.playerService.getUserIdByPlayerId(playerId);
/** user：定义该变量以承载业务值。 */
      const user = userId ? await this.userRepo.findOne({ where: { id: userId } }) : null;
/** riskReport：定义该变量以承载业务值。 */
      const riskReport = await this.buildPlayerRiskReport(runtime, user, runtime.online === true, riskAdminUserIds);
      return this.buildRecord(
        runtime,
        user,
        {
          userId,
          accountName: user?.username,
          accountStatus: this.getManagedPlayerAccountStatus(user, userId, user?.username),
        },
        riskReport,
        runtime.online === true,
        undefined,
        user ? riskAdminUserIds.has(user.id) : false,
      );
    }

/** entity：定义该变量以承载业务值。 */
    const entity = await this.playerRepo.findOne({ where: { id: playerId } });
    if (!entity) {
      return null;
    }

/** user：定义该变量以承载业务值。 */
    const user = await this.userRepo.findOne({ where: { id: entity.userId } });
/** hydrated：定义该变量以承载业务值。 */
    const hydrated = this.hydrateStoredPlayer(entity, this.resolveStoredDisplayName(user));
/** riskReport：定义该变量以承载业务值。 */
    const riskReport = await this.buildPlayerRiskReport(hydrated, user, false, riskAdminUserIds);
    return this.buildRecord(
      hydrated,
      user,
      {
        userId: entity.userId,
        accountName: user?.username,
        accountStatus: this.getManagedPlayerAccountStatus(user, entity.userId, user?.username),
      },
      riskReport,
      false,
      entity.updatedAt,
      user ? riskAdminUserIds.has(user.id) : false,
    );
  }

  /** GM 直接重设玩家账号密码 */
  async updateManagedPlayerPassword(playerId: string, newPassword: string): Promise<string | null> {
/** userId：定义该变量以承载业务值。 */
    const userId = await this.resolveManagedPlayerUserId(playerId);

    if (!userId) {
      return '目标玩家没有可修改的账号';
    }

    await this.accountService.updatePasswordByGm(userId, newPassword);
    return null;
  }

  /** GM 直接修改玩家账号名 */
  async updateManagedPlayerAccount(playerId: string, username: string): Promise<string | null> {
/** userId：定义该变量以承载业务值。 */
    const userId = await this.resolveManagedPlayerUserId(playerId);

    if (!userId) {
      return '目标玩家没有可修改的账号';
    }

    await this.accountService.updateUsernameByGm(userId, username);
    return null;
  }

  /** GM 快捷封禁账号，并立即阻断在线角色 */
  async banManagedPlayerAccount(playerId: string, reason: string): Promise<string | null> {
/** userId：定义该变量以承载业务值。 */
    const userId = await this.resolveManagedPlayerUserId(playerId);
    if (!userId) {
      return '目标玩家没有可封禁的账号';
    }
    await this.accountService.banUserByGm(userId, reason);
    this.evictManagedPlayerFromWorld(userId);
    return null;
  }

  /** GM 快捷解封账号 */
  async unbanManagedPlayerAccount(playerId: string): Promise<string | null> {
/** userId：定义该变量以承载业务值。 */
    const userId = await this.resolveManagedPlayerUserId(playerId);
    if (!userId) {
      return '目标玩家没有可解封的账号';
    }
    await this.accountService.unbanUserByGm(userId);
    return null;
  }

  async previewBanPlayersByRisk(body: GmBanPlayersByRiskReq, gmToken: string): Promise<GmBanPlayersByRiskPreviewRes> {
/** resolved：定义该变量以承载业务值。 */
    const resolved = await this.resolveBanPlayersByRiskTargets(body);
/** previewToken：定义该变量以承载业务值。 */
    const previewToken = this.issueRiskBatchPreviewToken(gmToken, resolved.targets.length, resolved.targetSnapshotHash);
    await this.redisService.setJsonWithTtl(this.getRiskBatchPreviewRedisKey(previewToken), {
      token: previewToken,
      gmTokenHash: this.hashGmToken(gmToken),
      matchedPlayers: resolved.targets.length,
      targetSnapshotHash: resolved.targetSnapshotHash,
      expiresAt: Date.now() + GM_RISK_BATCH_PREVIEW_TTL_MS,
    } satisfies GmRiskBatchPreviewSession, GM_RISK_BATCH_PREVIEW_TTL_MS);
    return {
      ok: true,
      matchedPlayers: resolved.targets.length,
      minRiskScore: resolved.minRiskScore,
      targetSnapshotHash: resolved.targetSnapshotHash,
      previewToken,
      samples: resolved.targets.slice(0, 20),
    };
  }

  async banPlayersByRisk(body: GmBanPlayersByRiskReq, gmToken: string): Promise<GmBanPlayersByRiskRes> {
/** resolved：定义该变量以承载业务值。 */
    const resolved = await this.resolveBanPlayersByRiskTargets(body);
    if (
      Number.isFinite(Number(body?.expectedMatchedPlayers))
      && Math.floor(Number(body.expectedMatchedPlayers)) !== resolved.targets.length
    ) {
      throw new BadRequestException(`批量封号预览已过期，当前命中数量为 ${resolved.targets.length}，请先重新预览再执行。`);
    }
    if (
      typeof body?.expectedTargetSnapshotHash === 'string'
      && body.expectedTargetSnapshotHash.trim().length > 0
      && body.expectedTargetSnapshotHash.trim() !== resolved.targetSnapshotHash
    ) {
      throw new BadRequestException('批量封号目标快照已变化，请先重新预览再执行。');
    }
    await this.assertRiskBatchPreviewToken(
      gmToken,
      body?.previewToken,
      resolved.targets.length,
      resolved.targetSnapshotHash,
    );
    let bannedPlayers = 0;
    for (const target of resolved.targets) {
      const error = await this.banManagedPlayerAccount(target.id, body?.reason ?? '风险值过高，批量处置');
      if (!error) {
        bannedPlayers += 1;
      }
    }
    await this.recordRiskAuditLog({
      action: 'batch-ban-by-risk',
      operator: 'gm',
      reason: body?.reason?.trim() || null,
      minRiskScore: resolved.minRiskScore,
      matchedPlayers: resolved.targets.length,
      bannedPlayers,
      skippedPlayers: Math.max(0, resolved.targets.length - bannedPlayers),
      filters: {
        keyword: resolved.query.keyword,
        sort: resolved.query.sort,
        presence: resolved.query.presence,
        behavior: resolved.query.behavior,
        accountStatus: resolved.query.accountStatus,
      },
      samplePlayerIds: resolved.targets.slice(0, 20).map((entry) => entry.id),
    });
    return {
      ok: true,
      matchedPlayers: resolved.targets.length,
      bannedPlayers,
      skippedPlayers: Math.max(0, resolved.targets.length - bannedPlayers),
      minRiskScore: resolved.minRiskScore,
    };
  }

  async getBenefitRestrictionForPlayer(playerId: string): Promise<{
    blocked: boolean;
    riskScore: number;
    riskLevel: GmPlayerRiskLevel;
    message?: string;
  }> {
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId) ?? await this.loadPlayerSnapshot(playerId);
    if (!player) {
      return { blocked: false, riskScore: 0, riskLevel: 'low' };
    }
/** userId：定义该变量以承载业务值。 */
    const userId = await this.resolveManagedPlayerUserId(playerId);
    if (!userId) {
      return { blocked: false, riskScore: 0, riskLevel: 'low' };
    }
/** user：定义该变量以承载业务值。 */
    const user = await this.userRepo.findOne({ where: { id: userId } });
/** riskAdminUserIds：定义该变量以承载业务值。 */
    const riskAdminUserIds = await this.loadRiskAdminUserIds();
    if (user && riskAdminUserIds.has(user.id)) {
      return { blocked: false, riskScore: 0, riskLevel: 'low' };
    }
/** riskReport：定义该变量以承载业务值。 */
    const riskReport = await this.buildPlayerRiskReport(
      player,
      user,
      this.playerService.getPlayer(playerId) !== undefined,
      riskAdminUserIds,
    );
    const blocked = riskReport.score >= 70;
    return {
      blocked,
      riskScore: riskReport.score,
      riskLevel: riskReport.level,
      message: blocked
        ? `账号风险值 ${riskReport.score}，已进入收益限制，请联系 GM 复核后再尝试。`
        : undefined,
    };
  }

  async addRiskAdminAccount(playerId: string): Promise<string | null> {
/** userId：定义该变量以承载业务值。 */
    const userId = await this.resolveManagedPlayerUserId(playerId);
    if (!userId) {
      return '目标玩家没有可加入管理员名单的账号';
    }
/** user：定义该变量以承载业务值。 */
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      return '目标账号不存在';
    }
    await this.persistentDocumentService.save<GmRiskAdminAccountDocument>(
      GM_RISK_ADMIN_ACCOUNT_SCOPE,
      user.id,
      {
        userId: user.id,
        username: user.username,
        addedAt: new Date().toISOString(),
      },
    );
    return null;
  }

  async removeRiskAdminAccount(playerId: string): Promise<string | null> {
/** userId：定义该变量以承载业务值。 */
    const userId = await this.resolveManagedPlayerUserId(playerId);
    if (!userId) {
      return '目标玩家没有可移出管理员名单的账号';
    }
    await this.persistentDocumentService.delete(GM_RISK_ADMIN_ACCOUNT_SCOPE, userId);
    return null;
  }

/** getEditorCatalog：执行对应的业务逻辑。 */
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

/** getEditableMapList：执行对应的业务逻辑。 */
  getEditableMapList(): GmMapListRes {
    return this.mapService.getEditableMapList();
  }

/** getEditableMap：执行对应的业务逻辑。 */
  getEditableMap(mapId: string): GmMapDocument | null {
    return this.mapService.getEditableMap(mapId) ?? null;
  }

/** clearRuntimeState：执行对应的业务逻辑。 */
  clearRuntimeState(): void {
    this.commandsByMap.clear();
    this.worldObservationSessions.clear();
  }

  private getWorldSettings(): GmWorldSettings {
    return {
      peaceModeEnabled: this.worldRuleService.isPeaceModeEnabled(),
    };
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
/** normalizedViewerId：定义该变量以承载业务值。 */
    const normalizedViewerId = viewerId?.trim().slice(0, 128);
    if (!normalizedViewerId) {
      return;
    }
/** meta：定义该变量以承载业务值。 */
    const meta = this.mapService.getMapMeta(mapId);
    if (!meta) {
      return;
    }
/** clampedW：定义该变量以承载业务值。 */
    const clampedW = Math.min(20, Math.max(1, Math.floor(w)));
/** clampedH：定义该变量以承载业务值。 */
    const clampedH = Math.min(20, Math.max(1, Math.floor(h)));
/** startX：定义该变量以承载业务值。 */
    const startX = Math.max(0, Math.min(Math.floor(x), meta.width - 1));
/** startY：定义该变量以承载业务值。 */
    const startY = Math.max(0, Math.min(Math.floor(y), meta.height - 1));
/** endX：定义该变量以承载业务值。 */
    const endX = Math.min(meta.width, startX + clampedW);
/** endY：定义该变量以承载业务值。 */
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

/** clearWorldObservation：执行对应的业务逻辑。 */
  clearWorldObservation(viewerId: string | undefined): void {
/** normalizedViewerId：定义该变量以承载业务值。 */
    const normalizedViewerId = viewerId?.trim().slice(0, 128);
    if (!normalizedViewerId) {
      return;
    }
    this.worldObservationSessions.delete(normalizedViewerId);
  }

  syncObservedPlayerBuffs(mapId: string, now = Date.now()): string[] {
    this.pruneExpiredWorldObservations(now);
/** players：定义该变量以承载业务值。 */
    const players = this.playerService.getPlayersByMap(mapId);
    if (players.length === 0) {
      return [];
    }

/** sessions：定义该变量以承载业务值。 */
    const sessions: GmWorldObservationSession[] = [];
    for (const session of this.worldObservationSessions.values()) {
      if (session.mapId === mapId) {
        sessions.push(session);
      }
    }

/** changedPlayerIds：定义该变量以承载业务值。 */
    const changedPlayerIds: string[] = [];
    for (const player of players) {
      if (player.isBot) {
        if (this.removeWorldObserveBuff(player)) {
          changedPlayerIds.push(player.id);
        }
        continue;
      }
/** observed：定义该变量以承载业务值。 */
      const observed = sessions.some((session) => (
        player.x >= session.startX
        && player.x < session.endX
        && player.y >= session.startY
        && player.y < session.endY
      ));
/** changed：定义该变量以承载业务值。 */
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

/** runtimePlayers：定义该变量以承载业务值。 */
    const runtimePlayers = this.playerService.getPlayersByMap(mapId).map((player) => this.clonePlayer(player));

/** error：定义该变量以承载业务值。 */
    const error = await this.mapService.saveEditableMap(mapId, document);
    if (error) {
      return error;
    }

    this.worldService.reloadMapRuntime(mapId);
    for (const player of runtimePlayers) {
      const relocation = this.resolveMapSaveRelocation(player);
      if (!relocation) continue;
/** snapshot：定义该变量以承载业务值。 */
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
/** roleNameError：定义该变量以承载业务值。 */
    const roleNameError = await this.validateManagedPlayerRoleNameUpdate(playerId, snapshot, section);
    if (roleNameError) {
      return roleNameError;
    }

/** runtime：定义该变量以承载业务值。 */
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

/** entity：定义该变量以承载业务值。 */
    const entity = await this.playerRepo.findOne({ where: { id: playerId } });
    if (!entity) return '目标玩家不存在';

/** player：定义该变量以承载业务值。 */
    const player = this.hydrateStoredPlayer(entity);
/** error：定义该变量以承载业务值。 */
    const error = this.applyPlayerSnapshot(player, this.mergePlayerSnapshot(player, snapshot, section), false);
    if (error) return error;

    await this.persistOfflinePlayer(entity, player);
    return null;
  }

  /** 入队玩家重置命令（传送回出生点、清除状态） */
  async enqueueResetPlayer(playerId: string): Promise<string | null> {
/** runtime：定义该变量以承载业务值。 */
    const runtime = this.playerService.getPlayer(playerId);
    if (runtime) {
      this.enqueue(runtime.mapId, { type: 'resetPlayer', playerId });
      return null;
    }

/** entity：定义该变量以承载业务值。 */
    const entity = await this.playerRepo.findOne({ where: { id: playerId } });
    if (!entity) return '目标玩家不存在';

/** player：定义该变量以承载业务值。 */
    const player = this.hydrateStoredPlayer(entity);
    this.resetStoredPlayerToSpawn(player);
    await this.persistOfflinePlayer(entity, player);
    return null;
  }

/** setManagedPlayerBodyTrainingLevel：执行对应的业务逻辑。 */
  async setManagedPlayerBodyTrainingLevel(playerId: string, requestedLevel: unknown): Promise<string | null> {
/** level：定义该变量以承载业务值。 */
    const level = this.parseBodyTrainingLevel(requestedLevel);
    if (level === null) {
      return '炼体等级必须是非负整数';
    }

/** runtime：定义该变量以承载业务值。 */
    const runtime = this.playerService.getPlayer(playerId);
    if (runtime) {
      this.enqueue(runtime.mapId, {
        type: 'setBodyTrainingLevel',
        playerId,
        level,
      });
      return null;
    }

/** entity：定义该变量以承载业务值。 */
    const entity = await this.playerRepo.findOne({ where: { id: playerId } });
    if (!entity) return '目标玩家不存在';

/** player：定义该变量以承载业务值。 */
    const player = this.hydrateStoredPlayer(entity);
    this.applyBodyTrainingLevel(player, level);
    await this.persistOfflinePlayer(entity, player);
    return null;
  }

/** addManagedPlayerFoundation：执行对应的业务逻辑。 */
  async addManagedPlayerFoundation(playerId: string, requestedAmount: unknown): Promise<string | null> {
/** amount：定义该变量以承载业务值。 */
    const amount = this.parseCounterDelta(requestedAmount, '底蕴增量');
    if (typeof amount === 'string') {
      return amount;
    }

/** runtime：定义该变量以承载业务值。 */
    const runtime = this.playerService.getPlayer(playerId);
    if (runtime) {
      this.enqueue(runtime.mapId, {
        type: 'addFoundation',
        playerId,
        amount,
      });
      return null;
    }

/** entity：定义该变量以承载业务值。 */
    const entity = await this.playerRepo.findOne({ where: { id: playerId } });
    if (!entity) return '目标玩家不存在';

/** player：定义该变量以承载业务值。 */
    const player = this.hydrateStoredPlayer(entity);
    player.foundation = this.applyCounterDelta(player.foundation, amount);
    await this.persistOfflinePlayer(entity, player);
    return null;
  }

/** addManagedPlayerCombatExp：执行对应的业务逻辑。 */
  async addManagedPlayerCombatExp(playerId: string, requestedAmount: unknown): Promise<string | null> {
/** amount：定义该变量以承载业务值。 */
    const amount = this.parseCounterDelta(requestedAmount, '战斗经验增量');
    if (typeof amount === 'string') {
      return amount;
    }

/** runtime：定义该变量以承载业务值。 */
    const runtime = this.playerService.getPlayer(playerId);
    if (runtime) {
      this.enqueue(runtime.mapId, {
        type: 'addCombatExp',
        playerId,
        amount,
      });
      return null;
    }

/** entity：定义该变量以承载业务值。 */
    const entity = await this.playerRepo.findOne({ where: { id: playerId } });
    if (!entity) return '目标玩家不存在';

/** player：定义该变量以承载业务值。 */
    const player = this.hydrateStoredPlayer(entity);
    player.combatExp = this.applyCounterDelta(player.combatExp, amount);
    await this.persistOfflinePlayer(entity, player);
    return null;
  }

  /** 批量将所有非机器人角色送回默认新手村出生点 */
  async returnAllPlayersToDefaultSpawn(): Promise<GmShortcutRunRes> {
/** runtimePlayers：定义该变量以承载业务值。 */
    const runtimePlayers = this.playerService.getAllPlayers().filter((player) => !player.isBot && player.inWorld !== false);
/** runtimeIds：定义该变量以承载业务值。 */
    const runtimeIds = new Set(runtimePlayers.map((player) => player.id));
/** queuedRuntimePlayers：定义该变量以承载业务值。 */
    let queuedRuntimePlayers = 0;
/** updatedOfflinePlayers：定义该变量以承载业务值。 */
    let updatedOfflinePlayers = 0;

    for (const player of runtimePlayers) {
      this.enqueue(player.mapId, { type: 'resetPlayer', playerId: player.id });
      queuedRuntimePlayers += 1;
    }

/** entities：定义该变量以承载业务值。 */
    const entities = await this.playerRepo.find();
    for (const entity of entities) {
      if (runtimeIds.has(entity.id)) {
        continue;
      }
/** player：定义该变量以承载业务值。 */
      const player = this.hydrateStoredPlayer(entity);
      this.resetStoredPlayerToSpawn(player);
      await this.persistOfflinePlayer(entity, player);
      updatedOfflinePlayers += 1;
    }

/** placement：定义该变量以承载业务值。 */
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

/** cleanupAllPlayersInvalidItems：执行对应的业务逻辑。 */
  async cleanupAllPlayersInvalidItems(): Promise<GmShortcutRunRes> {
/** runtimePlayers：定义该变量以承载业务值。 */
    const runtimePlayers = this.playerService.getAllPlayers().filter((player) => !player.isBot);
/** runtimeIds：定义该变量以承载业务值。 */
    const runtimeIds = new Set(runtimePlayers.map((player) => player.id));
/** queuedRuntimePlayers：定义该变量以承载业务值。 */
    let queuedRuntimePlayers = 0;
/** updatedOfflinePlayers：定义该变量以承载业务值。 */
    let updatedOfflinePlayers = 0;
/** totalInvalidInventoryStacksRemoved：定义该变量以承载业务值。 */
    let totalInvalidInventoryStacksRemoved = 0;
/** totalInvalidMarketStorageStacksRemoved：定义该变量以承载业务值。 */
    let totalInvalidMarketStorageStacksRemoved = 0;
/** totalInvalidEquipmentRemoved：定义该变量以承载业务值。 */
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

/** entities：定义该变量以承载业务值。 */
    const entities = await this.playerRepo.find();
    for (const entity of entities) {
      if (runtimeIds.has(entity.id)) {
        continue;
      }
/** player：定义该变量以承载业务值。 */
      const player = this.hydrateStoredPlayer(entity);
      if (player.isBot) {
        continue;
      }
/** summary：定义该变量以承载业务值。 */
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

/** compensateAllPlayersCombatExp：执行对应的业务逻辑。 */
  async compensateAllPlayersCombatExp(): Promise<GmShortcutRunRes> {
/** runtimePlayers：定义该变量以承载业务值。 */
    const runtimePlayers = this.playerService.getAllPlayers().filter((player) => !player.isBot && player.inWorld !== false);
/** runtimeIds：定义该变量以承载业务值。 */
    const runtimeIds = new Set(runtimePlayers.map((player) => player.id));
/** queuedRuntimePlayers：定义该变量以承载业务值。 */
    let queuedRuntimePlayers = 0;
/** updatedOfflinePlayers：定义该变量以承载业务值。 */
    let updatedOfflinePlayers = 0;
/** totalCombatExpGranted：定义该变量以承载业务值。 */
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

/** entities：定义该变量以承载业务值。 */
    const entities = await this.playerRepo.find();
    for (const entity of entities) {
      if (runtimeIds.has(entity.id)) {
        continue;
      }
/** player：定义该变量以承载业务值。 */
      const player = this.hydrateStoredPlayer(entity);
      if (player.isBot) {
        continue;
      }
/** amount：定义该变量以承载业务值。 */
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

/** compensateAllPlayersFoundation：执行对应的业务逻辑。 */
  async compensateAllPlayersFoundation(): Promise<GmShortcutRunRes> {
/** runtimePlayers：定义该变量以承载业务值。 */
    const runtimePlayers = this.playerService.getAllPlayers().filter((player) => !player.isBot && player.inWorld !== false);
/** runtimeIds：定义该变量以承载业务值。 */
    const runtimeIds = new Set(runtimePlayers.map((player) => player.id));
/** queuedRuntimePlayers：定义该变量以承载业务值。 */
    let queuedRuntimePlayers = 0;
/** updatedOfflinePlayers：定义该变量以承载业务值。 */
    let updatedOfflinePlayers = 0;
/** totalFoundationGranted：定义该变量以承载业务值。 */
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

/** entities：定义该变量以承载业务值。 */
    const entities = await this.playerRepo.find();
    for (const entity of entities) {
      if (runtimeIds.has(entity.id)) {
        continue;
      }
/** player：定义该变量以承载业务值。 */
      const player = this.hydrateStoredPlayer(entity);
      if (player.isBot) {
        continue;
      }
/** amount：定义该变量以承载业务值。 */
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

  /** 给全部已加载地图的草药库存统一补量 */
  async addHerbStockToAllMaps(amount: number): Promise<GmShortcutRunRes> {
/** normalizedAmount：定义该变量以承载业务值。 */
    const normalizedAmount = Math.max(0, Math.floor(Number(amount) || 0));
    if (normalizedAmount <= 0) {
      return {
        ok: true,
        totalPlayers: 0,
        queuedRuntimePlayers: 0,
        updatedOfflinePlayers: 0,
        totalMaps: 0,
        queuedRuntimeMaps: 0,
        totalHerbContainers: 0,
        totalHerbStockAdded: 0,
      };
    }

/** mapIds：定义该变量以承载业务值。 */
    const mapIds = this.mapService.getLoadedMapIds();
/** queuedRuntimeMaps：定义该变量以承载业务值。 */
    let queuedRuntimeMaps = 0;
/** totalHerbContainers：定义该变量以承载业务值。 */
    let totalHerbContainers = 0;

    for (const mapId of mapIds) {
/** herbContainers：定义该变量以承载业务值。 */
      const herbContainers = this.mapService.getContainers(mapId).filter((container) => container.variant === 'herb');
      if (herbContainers.length <= 0) {
        continue;
      }
      this.enqueue(mapId, {
        type: 'addHerbStockToMap',
        mapId,
        amount: normalizedAmount,
      });
      queuedRuntimeMaps += 1;
      totalHerbContainers += herbContainers.length;
    }

    return {
      ok: true,
      totalPlayers: 0,
      queuedRuntimePlayers: 0,
      updatedOfflinePlayers: 0,
      totalMaps: queuedRuntimeMaps,
      queuedRuntimeMaps,
      totalHerbContainers,
      totalHerbStockAdded: totalHerbContainers * normalizedAmount,
    };
  }

/** enqueueResetHeavenGate：执行对应的业务逻辑。 */
  async enqueueResetHeavenGate(playerId: string): Promise<string | null> {
/** runtime：定义该变量以承载业务值。 */
    const runtime = this.playerService.getPlayer(playerId);
    if (runtime) {
      this.enqueue(runtime.mapId, { type: 'resetHeavenGate', playerId });
      return null;
    }

/** entity：定义该变量以承载业务值。 */
    const entity = await this.playerRepo.findOne({ where: { id: playerId } });
    if (!entity) return '目标玩家不存在';

/** player：定义该变量以承载业务值。 */
    const player = this.hydrateStoredPlayer(entity);
    this.techniqueService.resetHeavenGateForTesting(player);
    await this.persistOfflinePlayer(entity, player);
    return null;
  }

  /** 入队 Bot 生成命令 */
  async enqueueSpawnBots(anchorPlayerId: string, count: number): Promise<string | null> {
/** runtime：定义该变量以承载业务值。 */
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

/** entity：定义该变量以承载业务值。 */
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
/** bots：定义该变量以承载业务值。 */
    const bots = this.playerService.getAllPlayers().filter((player) => player.isBot);
/** targets：定义该变量以承载业务值。 */
    const targets = removeAll
      ? bots
      : bots.filter((player) => playerIds?.includes(player.id));

    if (targets.length === 0) {
      return '没有可移除的机器人';
    }

/** idsByMap：定义该变量以承载业务值。 */
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
/** commands：定义该变量以承载业务值。 */
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
      case 'addHerbStockToMap':
        return this.applyQueuedAddHerbStockToMap(command.mapId, command.amount);
      case 'removeBots':
        return this.applyQueuedRemoveBots(command.playerIds, command.all);
      case 'applyPeaceMode':
        return this.applyQueuedPeaceMode(command.mapId);
    }
  }

/** applyQueuedPlayerUpdate：执行对应的业务逻辑。 */
  private applyQueuedPlayerUpdate(playerId: string, snapshot: Partial<PlayerState>, section?: GmPlayerUpdateSection): string | null {
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return '目标玩家不存在';
/** error：定义该变量以承载业务值。 */
    const error = this.applyPlayerSnapshot(player, this.mergePlayerSnapshot(player, snapshot, section), true);
    if (error) return error;
    this.markDirty(player.id, this.getDirtyFlagsForSection(section));
    void this.playerService.savePlayer(player.id).catch((saveError: Error) => {
      this.logger.error(`GM 修改玩家落盘失败: ${player.id} ${saveError.message}`);
    });
    return null;
  }

/** applyQueuedResetPlayer：执行对应的业务逻辑。 */
  private applyQueuedResetPlayer(playerId: string): string | null {
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return '目标玩家不存在';
/** update：定义该变量以承载业务值。 */
    const update = this.worldService.resetPlayerToSpawn(player);
    this.markDirty(player.id, update.dirty as DirtyFlag[]);
    void this.playerService.savePlayer(player.id).catch((error: Error) => {
      this.logger.error(`GM 重置玩家落盘失败: ${player.id} ${error.message}`);
    });
    return null;
  }

/** applyQueuedResetHeavenGate：执行对应的业务逻辑。 */
  private applyQueuedResetHeavenGate(playerId: string): string | null {
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return '目标玩家不存在';
    this.techniqueService.resetHeavenGateForTesting(player);
    this.markDirty(player.id, ['attr', 'actions', 'tech']);
    return null;
  }

  private applyQueuedPeaceMode(mapId: string): string | null {
    for (const player of this.playerService.getPlayersByMap(mapId)) {
      if (player.isBot === true || player.inWorld === false) {
        continue;
      }
      if (!this.worldRuleService.shouldForceDisableAllPlayerHostility(
        player.combatTargetingRules,
        player.allowAoePlayerHit === true,
      )) {
        continue;
      }
      player.combatTargetingRules = this.worldRuleService.buildEffectiveCombatTargetingRules(
        player.combatTargetingRules,
        player.allowAoePlayerHit === true,
      );
      player.allowAoePlayerHit = false;
      player.retaliatePlayerTargetId = undefined;
      player.combatTargetId = undefined;
      player.combatTargetLocked = false;
      this.markDirty(player.id, ['actions']);
      void this.playerService.savePlayer(player.id).catch((error: Error) => {
        this.logger.error(`和平模式清理玩家全体攻击落盘失败: ${player.id} ${error.message}`);
      });
    }
    return null;
  }

/** applyQueuedSetBodyTrainingLevel：执行对应的业务逻辑。 */
  private applyQueuedSetBodyTrainingLevel(playerId: string, level: number): string | null {
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return '目标玩家不存在';
    this.applyBodyTrainingLevel(player, level);
    this.markDirty(player.id, ['attr', 'actions', 'tech']);
    void this.playerService.savePlayer(player.id).catch((error: Error) => {
      this.logger.error(`GM 设置炼体等级落盘失败: ${player.id} ${error.message}`);
    });
    return null;
  }

/** applyQueuedAddFoundation：执行对应的业务逻辑。 */
  private applyQueuedAddFoundation(playerId: string, amount: number): string | null {
/** player：定义该变量以承载业务值。 */
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

/** applyQueuedAddCombatExp：执行对应的业务逻辑。 */
  private applyQueuedAddCombatExp(playerId: string, amount: number): string | null {
/** player：定义该变量以承载业务值。 */
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

/** applyQueuedSpawnBots：执行对应的业务逻辑。 */
  private applyQueuedSpawnBots(mapId: string, x: number, y: number, count: number): string | null {
/** created：定义该变量以承载业务值。 */
    const created = this.botService.spawnBotsAt(mapId, x, y, count);
    if (created <= 0) return '附近没有可用于生成机器人的空位';
    return null;
  }

/** applyQueuedGrantCombatExpCompensation：执行对应的业务逻辑。 */
  private applyQueuedGrantCombatExpCompensation(playerId: string, amount: number): string | null {
/** player：定义该变量以承载业务值。 */
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

/** applyQueuedGrantFoundationCompensation：执行对应的业务逻辑。 */
  private applyQueuedGrantFoundationCompensation(playerId: string, amount: number): string | null {
/** player：定义该变量以承载业务值。 */
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

/** applyQueuedCleanupInvalidItems：执行对应的业务逻辑。 */
  private applyQueuedCleanupInvalidItems(playerId: string): string | null {
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) return '目标玩家不存在';
/** summary：定义该变量以承载业务值。 */
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

/** applyQueuedAddHerbStockToMap：执行对应的业务逻辑。 */
  private applyQueuedAddHerbStockToMap(mapId: string, amount: number): string | null {
    this.lootService.addHerbStockToMap(mapId, amount);
    return null;
  }

/** applyQueuedRemoveBots：执行对应的业务逻辑。 */
  private applyQueuedRemoveBots(playerIds?: string[], removeAll = false): string | null {
/** removed：定义该变量以承载业务值。 */
    const removed = this.botService.removeBots(removeAll ? undefined : playerIds);
    if (removed <= 0) return '没有可移除的机器人';
    return null;
  }

  private buildSummary(
    player: PlayerState,
    user: GmPlayerUserIdentity,
    online: boolean,
    updatedAt: Date | undefined,
    riskReport?: GmPlayerRiskReport,
    isRiskAdmin = false,
  ): GmManagedPlayerSummary {
/** realmLv：定义该变量以承载业务值。 */
    const realmLv = Math.max(1, Math.floor(player.realm?.realmLv ?? player.realmLv ?? 1));
/** realmLabel：定义该变量以承载业务值。 */
    const realmLabel = player.realm?.displayName
      ?? player.realm?.name
      ?? player.realmName
      ?? `Lv.${realmLv}`;
/** roleName：定义该变量以承载业务值。 */
    const roleName = player.name;
/** displayName：定义该变量以承载业务值。 */
    const displayName = this.resolvePlayerDisplayName(player.displayName, user.accountName, roleName);
/** mapName：定义该变量以承载业务值。 */
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
/** autoRetaliate：定义该变量以承载业务值。 */
      autoRetaliate: player.autoRetaliate !== false,
/** autoBattleStationary：定义该变量以承载业务值。 */
      autoBattleStationary: player.autoBattleStationary === true,
      behaviors: this.getManagedPlayerBehaviors(player),
      accountStatus: user.accountStatus,
      riskScore: riskReport?.score ?? 0,
      riskLevel: riskReport?.level ?? 'low',
      riskTags: riskReport ? this.deriveRiskTags(riskReport) : [],
      isRiskAdmin,
      meta: {
        userId: user.userId,
        isBot: Boolean(player.isBot),
        online,
/** inWorld：定义该变量以承载业务值。 */
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
    riskReport: GmPlayerRiskReport,
    online: boolean,
    updatedAt: Date | undefined,
    isRiskAdmin: boolean,
  ): GmManagedPlayerRecord {
/** summary：定义该变量以承载业务值。 */
    const summary = this.buildSummary(player, user, online, updatedAt, riskReport, isRiskAdmin);
/** snapshot：定义该变量以承载业务值。 */
    const snapshot = this.clonePlayer(player);
/** persistedCollections：定义该变量以承载业务值。 */
    const persistedCollections = buildPersistedPlayerCollections(player, this.contentService, this.mapService);
    return {
      ...summary,
      account: this.buildAccountRecord(userEntity, online, isRiskAdmin),
      riskReport,
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

  private async buildPlayerRiskReport(
    player: PlayerState,
    user: UserEntity | null | undefined,
    online: boolean,
    riskAdminUserIds: ReadonlySet<string>,
  ): Promise<GmPlayerRiskReport> {
    const maxScore = 133;
    if (player.isBot) {
      const factors = this.buildZeroRiskFactors('机器人目标，不参与账号风险检测。');
      return {
        score: 0,
        maxScore,
        level: 'low',
        overview: '当前目标是机器人，未参与账号风控评分。',
        generatedAt: new Date().toISOString(),
        factors,
        recommendations: ['机器人不纳入小号风险判定，若异常请按机器人管理链路处理。'],
      };
    }
    const [
      similarAccountCluster,
      sharedIpCluster,
      sharedDeviceCluster,
      marketTransfer,
    ] = await Promise.all([
      this.buildSimilarAccountClusterRiskFactor(user),
      this.buildSharedIpClusterRiskFactor(user),
      this.buildSharedDeviceClusterRiskFactor(user),
      this.buildMarketTransferRiskFactor(player, user, riskAdminUserIds),
    ]);
    const factors = [
      this.buildAccountIntegrityRiskFactor(user),
      this.buildAccountNamePatternRiskFactor(user),
      similarAccountCluster,
      this.buildAccountAgeRiskFactor(user),
      sharedIpCluster,
      sharedDeviceCluster,
      marketTransfer,
    ];
    const score = factors.reduce((sum, factor) => sum + factor.score, 0);
    const level = this.resolvePlayerRiskLevel(score);
    return {
      score,
      maxScore,
      level,
      overview: this.buildPlayerRiskOverview(level, score, factors),
      generatedAt: new Date().toISOString(),
      factors,
      recommendations: this.buildPlayerRiskRecommendations(factors, level),
    };
  }

  private buildAccountIntegrityRiskFactor(user: UserEntity | null | undefined): GmPlayerRiskFactor {
    if (user) {
      return this.createPlayerRiskFactor(
        'account-integrity',
        '账号完整性',
        20,
        0,
        '账号与角色关联完整。',
      );
    }
    return this.createPlayerRiskFactor(
      'account-integrity',
      '账号完整性',
      20,
      20,
      '角色缺少有效账号关联。',
      ['当前角色没有对应账号记录，已属于异常状态样本。'],
    );
  }

  private buildAccountNamePatternRiskFactor(user: UserEntity | null | undefined): GmPlayerRiskFactor {
    if (!user) {
      return this.createPlayerRiskFactor(
        'account-name-pattern',
        '账号命名模式',
        10,
        0,
        '无账号信息，暂不参与命名规则判断。',
      );
    }
    const username = user.username.trim();
    if (!username) {
      return this.createPlayerRiskFactor(
        'account-name-pattern',
        '账号命名模式',
        10,
        10,
        '账号名为空字符串，属于异常数据。',
      );
    }
    if (/^\d{5,}$/u.test(username)) {
      return this.createPlayerRiskFactor(
        'account-name-pattern',
        '账号命名模式',
        10,
        10,
        '账号名是长纯数字串。',
        [`账号名“${username}”符合纯序号模式。`],
      );
    }
    const serialPattern = this.parseSerialAccountPattern(username);
    if (serialPattern) {
      if (this.isContactStyleSerialAccountPattern(serialPattern)) {
        return this.createPlayerRiskFactor(
          'account-name-pattern',
          '账号命名模式',
          10,
          0,
          '账号名更像常见联系方式或个人标识，不按批量序号命名处理。',
        );
      }
      const genericPrefix = GM_GENERIC_SERIAL_ACCOUNT_PREFIXES.has(serialPattern.prefix);
      const score = genericPrefix ? 8 : 6;
      return this.createPlayerRiskFactor(
        'account-name-pattern',
        '账号命名模式',
        10,
        score,
        genericPrefix ? '账号名是通用前缀加纯数字尾号。' : '账号名带明显纯数字尾号。',
        [
          `账号名“${username}”可拆为前缀“${serialPattern.prefix}”和尾号“${serialPattern.digits}”。`,
          genericPrefix ? `前缀“${serialPattern.prefix}”属于常见批量起号命名。`
            : `尾号长度为 ${serialPattern.digits.length}，符合批量序号命名特征。`,
        ],
      );
    }
/** randomNoiseScore：定义该变量以承载业务值。 */
    const randomNoiseScore = this.buildRandomNoiseAccountNameScore(username);
    if (randomNoiseScore) {
      return this.createPlayerRiskFactor(
        'account-name-pattern',
        '账号命名模式',
        10,
        randomNoiseScore.score,
        randomNoiseScore.summary,
        randomNoiseScore.evidence,
      );
    }
    const digitCount = [...username].filter((char) => char >= '0' && char <= '9').length;
    if (digitCount >= 4 && digitCount * 2 >= username.length) {
      return this.createPlayerRiskFactor(
        'account-name-pattern',
        '账号命名模式',
        10,
        4,
        '账号名数字占比偏高。',
        [`账号名“${username}”中数字占比达到 ${digitCount}/${username.length}。`],
      );
    }
    return this.createPlayerRiskFactor(
      'account-name-pattern',
      '账号命名模式',
      10,
      0,
      '账号名未命中明显的批量命名特征。',
    );
  }

  private async buildSimilarAccountClusterRiskFactor(user: UserEntity | null | undefined): Promise<GmPlayerRiskFactor> {
    if (!user) {
      return this.createPlayerRiskFactor(
        'similar-account-cluster',
        '相似账号簇',
        20,
        0,
        '无账号信息，暂不参与相似账号簇检测。',
      );
    }
    const serialPattern = this.parseSerialAccountPattern(user.username);
    if (!serialPattern) {
      return this.createPlayerRiskFactor(
        'similar-account-cluster',
        '相似账号簇',
        20,
        0,
        '当前账号不属于可聚类的纯序号前缀模式。',
      );
    }
    if (this.isContactStyleSerialAccountPattern(serialPattern)) {
      return this.createPlayerRiskFactor(
        'similar-account-cluster',
        '相似账号簇',
        20,
        0,
        '当前账号更像常见联系方式或个人标识，不按同前缀账号簇处理。',
      );
    }
    const pattern = `^${this.escapeSqlRegex(serialPattern.prefix)}[0-9]{3,}$`;
    const aggregate = await this.userRepo.createQueryBuilder('account')
      .select('COUNT(*)', 'totalCount')
      .addSelect('COALESCE(SUM(CASE WHEN account."bannedAt" IS NOT NULL THEN 1 ELSE 0 END), 0)', 'bannedCount')
      .where('account.id <> :userId', { userId: user.id })
      .andWhere('account.username ~* :pattern', { pattern })
      .getRawOne<SimilarSerialAccountAggregateRow>();
    const totalCount = Number(aggregate?.totalCount ?? 0);
    if (totalCount <= 0) {
      return this.createPlayerRiskFactor(
        'similar-account-cluster',
        '相似账号簇',
        20,
        0,
        '未发现同前缀纯数字尾号账号簇。',
      );
    }
    const previewRows = await this.userRepo.createQueryBuilder('account')
      .select('account.username', 'username')
      .addSelect('account."createdAt"', 'createdAt')
      .addSelect('account."bannedAt"', 'bannedAt')
      .where('account.id <> :userId', { userId: user.id })
      .andWhere('account.username ~* :pattern', { pattern })
      .orderBy('account."createdAt"', 'DESC')
      .limit(5)
      .getRawMany<SimilarSerialAccountPreviewRow>();
    let score = totalCount >= 10 ? 18 : totalCount >= 5 ? 12 : 8;
    const bannedCount = Number(aggregate?.bannedCount ?? 0);
    if (bannedCount > 0) {
      score = Math.min(20, score + 4);
    }
    const evidence: string[] = [
      `检测到 ${totalCount} 个同前缀“${serialPattern.prefix}”的纯序号账号。`,
    ];
    if (previewRows.length > 0) {
      evidence.push(`最近样本：${previewRows.map((entry) => entry.username).join('、')}`);
    }
    if (bannedCount > 0) {
      evidence.push(`其中已有 ${bannedCount} 个同簇账号处于封禁状态。`);
    }
    return this.createPlayerRiskFactor(
      'similar-account-cluster',
      '相似账号簇',
      20,
      score,
      '存在明显同前缀纯序号账号簇。',
      evidence,
    );
  }

  private buildAccountAgeRiskFactor(user: UserEntity | null | undefined): GmPlayerRiskFactor {
    if (!user) {
      return this.createPlayerRiskFactor(
        'account-age',
        '账号年龄',
        10,
        0,
        '无账号信息，暂不参与账号年龄判断。',
      );
    }
    const ageHours = this.getAccountAgeHours(user);
    if (ageHours < 24) {
      return this.createPlayerRiskFactor(
        'account-age',
        '账号年龄',
        10,
        10,
        '账号注册时间不足 24 小时。',
        [`账号创建于 ${user.createdAt.toISOString()}。`],
      );
    }
    if (ageHours < 72) {
      return this.createPlayerRiskFactor(
        'account-age',
        '账号年龄',
        10,
        7,
        '账号注册时间不足 3 天。',
        [`账号创建于 ${user.createdAt.toISOString()}。`],
      );
    }
    if (ageHours < 168) {
      return this.createPlayerRiskFactor(
        'account-age',
        '账号年龄',
        10,
        4,
        '账号注册时间不足 7 天。',
        [`账号创建于 ${user.createdAt.toISOString()}。`],
      );
    }
    return this.createPlayerRiskFactor(
      'account-age',
      '账号年龄',
      10,
      0,
      '账号年龄已超过 7 天。',
    );
  }

  private async buildSharedIpClusterRiskFactor(user: UserEntity | null | undefined): Promise<GmPlayerRiskFactor> {
    if (!user) {
      return this.createPlayerRiskFactor('shared-ip-cluster', '重复 IP', 18, 0, '无账号信息，暂不参与重复 IP 判断。');
    }
    const ip = user.lastLoginIp?.trim() || user.registerIp?.trim() || '';
    if (!ip) {
      return this.createPlayerRiskFactor('shared-ip-cluster', '重复 IP', 18, 0, '当前账号尚无可用登录 IP 记录。');
    }
    const sameIpUsers = await this.userRepo.createQueryBuilder('account')
      .select('account.id', 'id')
      .addSelect('account.username', 'username')
      .addSelect('account."bannedAt"', 'bannedAt')
      .where('account.id <> :userId', { userId: user.id })
      .andWhere(new Brackets((builder) => {
        builder.where('account."lastLoginIp" = :ip', { ip }).orWhere('account."registerIp" = :ip', { ip });
      }))
      .limit(8)
      .getRawMany<{ id: string; username: string; bannedAt: Date | null }>();
    if (sameIpUsers.length <= 0) {
      return this.createPlayerRiskFactor('shared-ip-cluster', '重复 IP', 18, 0, '当前登录 IP 未与其他账号形成明显重叠。');
    }
    const bannedCount = sameIpUsers.filter((entry) => entry.bannedAt).length;
    let score = sameIpUsers.length >= 6 ? 14 : sameIpUsers.length >= 3 ? 9 : 5;
    if (bannedCount > 0) {
      score += 4;
    }
    return this.createPlayerRiskFactor(
      'shared-ip-cluster',
      '重复 IP',
      18,
      score,
      '当前账号与其他账号存在重复登录 IP。',
      [
        `最近登录或注册 IP：${ip}`,
        `检测到 ${sameIpUsers.length} 个账号与该 IP 重叠。`,
        `样本账号：${sameIpUsers.slice(0, 5).map((entry) => entry.username).join('、')}`,
        ...(bannedCount > 0 ? [`其中 ${bannedCount} 个重叠账号已有封禁记录。`] : []),
      ],
    );
  }

  private async buildSharedDeviceClusterRiskFactor(user: UserEntity | null | undefined): Promise<GmPlayerRiskFactor> {
    if (!user) {
      return this.createPlayerRiskFactor('shared-device-cluster', '重复设备', 25, 0, '无账号信息，暂不参与重复设备判断。');
    }
    const deviceId = user.lastLoginDeviceId?.trim() || user.registerDeviceId?.trim() || '';
    if (!deviceId) {
      return this.createPlayerRiskFactor('shared-device-cluster', '重复设备', 25, 0, '当前账号尚无可用 deviceId 记录。');
    }
    const sameDeviceUsers = await this.userRepo.createQueryBuilder('account')
      .select('account.id', 'id')
      .addSelect('account.username', 'username')
      .addSelect('account."bannedAt"', 'bannedAt')
      .where('account.id <> :userId', { userId: user.id })
      .andWhere(new Brackets((builder) => {
        builder.where('account."lastLoginDeviceId" = :deviceId', { deviceId }).orWhere('account."registerDeviceId" = :deviceId', { deviceId });
      }))
      .limit(8)
      .getRawMany<{ id: string; username: string; bannedAt: Date | null }>();
    if (sameDeviceUsers.length <= 0) {
      return this.createPlayerRiskFactor('shared-device-cluster', '重复设备', 25, 0, '当前设备未与其他账号形成明显重叠。');
    }
    const bannedCount = sameDeviceUsers.filter((entry) => entry.bannedAt).length;
    let score = sameDeviceUsers.length >= 5 ? 18 : sameDeviceUsers.length >= 2 ? 12 : 8;
    if (bannedCount > 0) {
      score += 5;
    }
    return this.createPlayerRiskFactor(
      'shared-device-cluster',
      '重复设备',
      25,
      score,
      '当前账号与其他账号存在重复 deviceId。',
      [
        `当前 deviceId：${deviceId}`,
        `检测到 ${sameDeviceUsers.length} 个账号与该设备重叠。`,
        `样本账号：${sameDeviceUsers.slice(0, 5).map((entry) => entry.username).join('、')}`,
        ...(bannedCount > 0 ? [`其中 ${bannedCount} 个重叠账号已有封禁记录。`] : []),
      ],
    );
  }

  private async buildMarketTransferRiskFactor(
    player: PlayerState,
    user: UserEntity | null | undefined,
    riskAdminUserIds: ReadonlySet<string>,
  ): Promise<GmPlayerRiskFactor> {
    if (!user) {
      return this.createPlayerRiskFactor(
        'market-transfer',
        '坊市关系',
        30,
        0,
        '无账号信息，暂不参与坊市关系检测。',
      );
    }
    if (riskAdminUserIds.has(user.id)) {
      return this.createPlayerRiskFactor(
        'market-transfer',
        '坊市关系',
        30,
        0,
        '当前账号在管理员名单中，坊市关系不参与利益输送检测。',
      );
    }
    const recentTrades = await this.marketTradeHistoryRepo.createQueryBuilder('trade')
      .where('trade.buyerId = :playerId OR trade.sellerId = :playerId', { playerId: player.id })
      .orderBy('trade.createdAt', 'DESC')
      .limit(GM_PLAYER_RISK_REVIEW_WINDOW_TRADE_LIMIT)
      .getMany();
    if (recentTrades.length < 3) {
      return this.createPlayerRiskFactor(
        'market-transfer',
        '坊市关系',
        30,
        0,
        '近期待成交不足，未形成可判断的坊市关系。',
      );
    }
    const counterpartyMap = new Map<string, CounterpartyTradeAggregate>();
    for (const trade of recentTrades) {
      const counterpartyId = trade.buyerId === player.id ? trade.sellerId : trade.buyerId;
      const entry = counterpartyMap.get(counterpartyId) ?? {
        playerId: counterpartyId,
        tradeCount: 0,
        buyCount: 0,
        sellCount: 0,
        lastCreatedAt: 0,
      };
      entry.tradeCount += 1;
      if (trade.buyerId === player.id) {
        entry.buyCount += 1;
      } else {
        entry.sellCount += 1;
      }
      entry.lastCreatedAt = Math.max(entry.lastCreatedAt, Number(trade.createdAt ?? 0));
      counterpartyMap.set(counterpartyId, entry);
    }
    const counterpartPlayers = await this.playerRepo.findBy({ id: In([...counterpartyMap.keys()]) });
    const counterpartPlayerById = new Map(counterpartPlayers.map((entry) => [entry.id, entry]));
    const counterpartUserIds = [...new Set(counterpartPlayers.map((entry) => entry.userId).filter((entry): entry is string => typeof entry === 'string' && entry.length > 0))];
    const counterpartUsers = counterpartUserIds.length > 0
      ? await this.userRepo.findBy({ id: In(counterpartUserIds) })
      : [];
    const counterpartUserById = new Map(counterpartUsers.map((entry) => [entry.id, entry]));
/** ignoredAdminCounterparties：定义该变量以承载业务值。 */
    const ignoredAdminCounterparties = [...counterpartyMap.values()].filter((entry) => {
      const counterpartPlayer = counterpartPlayerById.get(entry.playerId);
      return counterpartPlayer ? riskAdminUserIds.has(counterpartPlayer.userId) : false;
    });
/** ignoredAdminCounterpartyIdSet：定义该变量以承载业务值。 */
    const ignoredAdminCounterpartyIdSet = new Set(ignoredAdminCounterparties.map((entry) => entry.playerId));
/** ignoredAdminTradeCount：定义该变量以承载业务值。 */
    const ignoredAdminTradeCount = ignoredAdminCounterparties.reduce((sum, entry) => sum + entry.tradeCount, 0);
/** effectiveCounterparties：定义该变量以承载业务值。 */
    const effectiveCounterparties = [...counterpartyMap.values()].filter((entry) => !ignoredAdminCounterpartyIdSet.has(entry.playerId));
    if (effectiveCounterparties.length <= 0 || ignoredAdminTradeCount >= recentTrades.length) {
      return this.createPlayerRiskFactor(
        'market-transfer',
        '坊市关系',
        30,
        0,
        '近期待成交主要发生在管理员名单账号之间，已按正常管理行为忽略。',
        ignoredAdminTradeCount > 0 ? [`已忽略与管理员名单账号的 ${ignoredAdminTradeCount} 笔成交。`] : [],
      );
    }
/** topCounterparty：定义该变量以承载业务值。 */
    const topCounterparty = effectiveCounterparties.sort((left, right) => (
      right.tradeCount - left.tradeCount
      || right.lastCreatedAt - left.lastCreatedAt
      || left.playerId.localeCompare(right.playerId)
    ))[0];
    if (!topCounterparty) {
      return this.createPlayerRiskFactor(
        'market-transfer',
        '坊市关系',
        30,
        0,
        '未发现明显坊市关系对象。',
      );
    }
/** effectiveTradeCount：定义该变量以承载业务值。 */
    const effectiveTradeCount = Math.max(0, recentTrades.length - ignoredAdminTradeCount);
    if (effectiveTradeCount < 3) {
      return this.createPlayerRiskFactor(
        'market-transfer',
        '坊市关系',
        30,
        0,
        '剔除管理员名单账号后，近期待成交不足，未形成可判断的坊市关系。',
        ignoredAdminTradeCount > 0 ? [`已忽略与管理员名单账号的 ${ignoredAdminTradeCount} 笔成交。`] : [],
      );
    }
    const concentration = topCounterparty.tradeCount / effectiveTradeCount;
    const dominantSideShare = Math.max(topCounterparty.buyCount, topCounterparty.sellCount) / topCounterparty.tradeCount;
    const topCounterpartyPlayer = counterpartPlayerById.get(topCounterparty.playerId);
    const topCounterpartyUser = topCounterpartyPlayer ? counterpartUserById.get(topCounterpartyPlayer.userId) : undefined;
    let score = 0;
    if (concentration >= 0.8 && topCounterparty.tradeCount >= 5) {
      score += 14;
    } else if (concentration >= 0.6 && topCounterparty.tradeCount >= 3) {
      score += 10;
    }
    if (dominantSideShare >= 0.8 && topCounterparty.tradeCount >= 4) {
      score += 8;
    }
    if (effectiveCounterparties.length === 1 && effectiveTradeCount >= 8) {
      score += 4;
    }
    const selfAgeDays = this.getAccountAgeDays(user);
    const counterpartAgeDays = topCounterpartyUser ? this.getAccountAgeDays(topCounterpartyUser) : 0;
    if (selfAgeDays <= 7 && counterpartAgeDays >= 14) {
      score += 4;
    }
    if (topCounterpartyUser?.bannedAt) {
      score += 6;
    }
    score = Math.min(30, score);
    const counterpartyLabel = topCounterpartyPlayer
      ? `${topCounterpartyPlayer.name}${topCounterpartyUser ? ` / ${topCounterpartyUser.username}` : ''}`
      : topCounterparty.playerId;
    const evidence = score > 0
      ? [
        `剔除管理员名单账号后，近 ${effectiveTradeCount} 笔坊市成交中，${Math.round(concentration * 100)}% 集中在 ${counterpartyLabel}。`,
        `与该对象共成交 ${topCounterparty.tradeCount} 笔，其中买入 ${topCounterparty.buyCount} 笔，卖出 ${topCounterparty.sellCount} 笔。`,
        `近窗口内有效成交对象数为 ${effectiveCounterparties.length}。`,
        ...(ignoredAdminTradeCount > 0 ? [`已忽略与管理员名单账号的 ${ignoredAdminTradeCount} 笔成交。`] : []),
        ...(selfAgeDays <= 7 && counterpartAgeDays >= 14
          ? [`当前账号年龄 ${selfAgeDays} 天，对手账号年龄 ${counterpartAgeDays} 天。`]
          : []),
        ...(topCounterpartyUser?.bannedAt ? ['主成交对象当前或历史上存在封禁记录。'] : []),
      ]
      : [];
    return this.createPlayerRiskFactor(
      'market-transfer',
      '坊市关系',
      30,
      score,
      score > 0 ? '坊市成交对象集中度偏高，存在固定输血链风险。' : '坊市成交关系较分散，未见明显固定输血对象。',
      evidence,
    );
  }

  private async loadRiskAdminUserIds(): Promise<Set<string>> {
/** entries：定义该变量以承载业务值。 */
    const entries = await this.persistentDocumentService.getScope<GmRiskAdminAccountDocument>(GM_RISK_ADMIN_ACCOUNT_SCOPE);
    return new Set(
      entries
        .map((entry) => entry.key?.trim() || entry.payload?.userId?.trim() || '')
        .filter((entry) => entry.length > 0),
    );
  }

  private buildPlayerRiskOverview(
    level: GmPlayerRiskLevel,
    score: number,
    factors: GmPlayerRiskFactor[],
  ): string {
    const hitCount = factors.filter((factor) => factor.score > 0).length;
    switch (level) {
      case 'critical':
        return `当前风险分 ${score}，已命中 ${hitCount} 个风险维度，形态接近批量小号或固定输血号。`;
      case 'high':
        return `当前风险分 ${score}，命中多项风险信号，建议 GM 重点复核账号簇和坊市关系。`;
      case 'medium':
        return `当前风险分 ${score}，存在可疑信号，建议持续观察并结合相似账号链路复核。`;
      case 'low':
      default:
        return score > 0
          ? `当前风险分 ${score}，仅命中少量弱信号，暂不构成强风险样本。`
          : '当前未命中明显小号风险信号。';
    }
  }

  private buildPlayerRiskRecommendations(
    factors: GmPlayerRiskFactor[],
    level: GmPlayerRiskLevel,
  ): string[] {
    const recommendations: string[] = [];
    const integrityFactor = factors.find((factor) => factor.key === 'account-integrity');
    const namingFactor = factors.find((factor) => factor.key === 'account-name-pattern');
    const clusterFactor = factors.find((factor) => factor.key === 'similar-account-cluster');
    const sharedIpFactor = factors.find((factor) => factor.key === 'shared-ip-cluster');
    const sharedDeviceFactor = factors.find((factor) => factor.key === 'shared-device-cluster');
    const marketFactor = factors.find((factor) => factor.key === 'market-transfer');
    if ((integrityFactor?.score ?? 0) > 0) {
      recommendations.push('先核对该角色是否存在异常账号绑定或脏数据，再继续做小号判定。');
    }
    if ((marketFactor?.score ?? 0) >= 14) {
      recommendations.push('优先查看近 120 笔坊市成交对象、成交方向和是否存在单向输血链。');
    }
    if ((namingFactor?.score ?? 0) >= 6 || (clusterFactor?.score ?? 0) >= 8) {
      recommendations.push('建议联查同前缀纯序号账号簇，确认是否存在批量起号。');
    }
    if ((sharedIpFactor?.score ?? 0) >= 9 || (sharedDeviceFactor?.score ?? 0) >= 12) {
      recommendations.push('建议联查重复 IP / 设备重叠账号，确认是否存在同主体多号或共享环境误报。');
    }
    if (level === 'critical' || level === 'high') {
      recommendations.push('建议纳入 GM 高优先级复核队列，但当前系统不自动封号。');
    }
    if (recommendations.length <= 0) {
      recommendations.push('当前无需立即处置，继续观察后续行为变化即可。');
    }
    return recommendations;
  }

  private buildZeroRiskFactors(summary: string): GmPlayerRiskFactor[] {
    return [
      this.createPlayerRiskFactor('account-integrity', '账号完整性', 20, 0, summary),
      this.createPlayerRiskFactor('account-name-pattern', '账号命名模式', 10, 0, summary),
      this.createPlayerRiskFactor('similar-account-cluster', '相似账号簇', 20, 0, summary),
      this.createPlayerRiskFactor('account-age', '账号年龄', 10, 0, summary),
      this.createPlayerRiskFactor('shared-ip-cluster', '重复 IP', 18, 0, summary),
      this.createPlayerRiskFactor('shared-device-cluster', '重复设备', 25, 0, summary),
      this.createPlayerRiskFactor('market-transfer', '坊市关系', 30, 0, summary),
    ];
  }

  private createPlayerRiskFactor(
    key: GmPlayerRiskFactor['key'],
    label: string,
    maxScore: number,
    score: number,
    summary: string,
    evidence: string[] = [],
  ): GmPlayerRiskFactor {
    return {
      key,
      label,
      maxScore,
      score: Math.max(0, Math.min(maxScore, Math.floor(score))),
      summary,
      evidence,
    };
  }

  private resolvePlayerRiskLevel(score: number): GmPlayerRiskLevel {
    if (score >= 80) {
      return 'critical';
    }
    if (score >= 55) {
      return 'high';
    }
    if (score >= 30) {
      return 'medium';
    }
    return 'low';
  }

  private parseSerialAccountPattern(username: string): { prefix: string; digits: string } | null {
    const match = username.trim().match(/^([a-z_][a-z0-9_]{1,15}?)(\d{3,})$/iu);
    if (!match) {
      return null;
    }
    return {
      prefix: match[1].toLowerCase(),
      digits: match[2],
    };
  }

  private buildRandomNoiseAccountNameScore(username: string): {
    score: number;
    summary: string;
    evidence: string[];
  } | null {
/** normalized：定义该变量以承载业务值。 */
    const normalized = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{8,}$/u.test(normalized)) {
      return null;
    }
    if (this.parseSerialAccountPattern(normalized)) {
      return null;
    }
/** letters：定义该变量以承载业务值。 */
    const letters = [...normalized].filter((char) => char >= 'a' && char <= 'z');
/** digits：定义该变量以承载业务值。 */
    const digits = [...normalized].filter((char) => char >= '0' && char <= '9');
    if (letters.length < 6) {
      return null;
    }
/** vowelCount：定义该变量以承载业务值。 */
    const vowelCount = letters.filter((char) => 'aeiou'.includes(char)).length;
/** uniqueRatio：定义该变量以承载业务值。 */
    const uniqueRatio = new Set([...normalized]).size / normalized.length;
/** maxConsonantRun：定义该变量以承载业务值。 */
    let maxConsonantRun = 0;
/** currentConsonantRun：定义该变量以承载业务值。 */
    let currentConsonantRun = 0;
    for (const char of normalized) {
      if (char >= 'a' && char <= 'z' && !'aeiou'.includes(char)) {
        currentConsonantRun += 1;
        if (currentConsonantRun > maxConsonantRun) {
          maxConsonantRun = currentConsonantRun;
        }
        continue;
      }
      currentConsonantRun = 0;
    }
/** score：定义该变量以承载业务值。 */
    let score = 0;
/** evidence：定义该变量以承载业务值。 */
    const evidence: string[] = [];
    if (normalized.length >= 10 && uniqueRatio >= 0.8) {
      score += 2;
      evidence.push(`账号名长度 ${normalized.length}，且字符离散度较高。`);
    }
    if (vowelCount <= 1 || vowelCount * 4 <= letters.length) {
      score += 2;
      evidence.push(`字母部分元音占比偏低（${vowelCount}/${letters.length}）。`);
    }
    if (maxConsonantRun >= 5) {
      score += 3;
      evidence.push(`存在连续 ${maxConsonantRun} 位辅音串，缺少常见可读性。`);
    }
    if (digits.length >= 2 && letters.length >= 6 && uniqueRatio >= 0.75) {
      score += 1;
      evidence.push('字母与数字混合后仍缺少明显语义结构。');
    }
    if (score < 5) {
      return null;
    }
    return {
      score: Math.min(6, score),
      summary: '账号名更像随机拼接的无语义串。',
      evidence,
    };
  }

  private isContactStyleSerialAccountPattern(serialPattern: { prefix: string; digits: string }): boolean {
    return GM_CONTACT_STYLE_ACCOUNT_PREFIXES.has(serialPattern.prefix) && serialPattern.digits.length >= 5;
  }

  private escapeSqlRegex(input: string): string {
    return input.replace(/[\\^$.*+?()[\]{}|]/gu, '\\$&');
  }

  private getManagedAccountTotalOnlineSeconds(user: UserEntity | null | undefined, online: boolean): number {
    if (!user) {
      return 0;
    }
    const sessionStartedAt = this.playerService.getOnlineSessionStartedAt(user.id)
      ?? user.currentOnlineStartedAt?.getTime();
    const currentSessionSeconds = online && sessionStartedAt
      ? Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 1000))
      : 0;
    return Math.max(0, Math.floor(user.totalOnlineSeconds ?? 0)) + currentSessionSeconds;
  }

  private getAccountAgeHours(user: UserEntity): number {
    return Math.max(0, Math.floor((Date.now() - user.createdAt.getTime()) / (60 * 60 * 1000)));
  }

  private getAccountAgeDays(user: UserEntity): number {
    return Math.max(0, Math.floor((Date.now() - user.createdAt.getTime()) / (24 * 60 * 60 * 1000)));
  }

  private countStoredItemStacks(storage: unknown): number {
    if (!storage || typeof storage !== 'object' || !Array.isArray((storage as { items?: unknown[] }).items)) {
      return 0;
    }
    return (storage as { items: unknown[] }).items.length;
  }

  private formatRiskDurationHours(totalOnlineSeconds: number): string {
    return `${Math.max(0, Math.floor(totalOnlineSeconds / 3600))} 小时`;
  }

  private getManagedPlayerBehaviorLabel(behavior: GmManagedPlayerBehavior): string {
    switch (behavior) {
      case 'combat':
        return '战斗';
      case 'cultivation':
        return '修炼';
      case 'alchemy':
        return '炼丹';
      case 'enhancement':
        return '强化';
      case 'gather':
        return '采集';
      default:
        return behavior;
    }
  }

  /** 从数据库实体还原为运行时 PlayerState */
  private hydrateStoredPlayer(entity: PlayerEntity, displayName?: string): PlayerState {
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.hydrateStoredPlayerForRead(entity);
    player.displayName = this.resolvePlayerDisplayName(displayName, undefined, entity.name);
    return player;
  }

  /** 将快照数据应用到玩家状态上 */
  private applyPlayerSnapshot(player: PlayerState, snapshot: PlayerState, runtime: boolean): string | null {
/** nextMapId：定义该变量以承载业务值。 */
    const nextMapId = typeof snapshot.mapId === 'string' ? snapshot.mapId : player.mapId;
/** nextX：定义该变量以承载业务值。 */
    const nextX = this.normalizeInt(snapshot.x, player.x);
/** nextY：定义该变量以承载业务值。 */
    const nextY = this.normalizeInt(snapshot.y, player.y);
/** positionChanged：定义该变量以承载业务值。 */
    const positionChanged = nextMapId !== player.mapId || nextX !== player.x || nextY !== player.y;

    if (!this.mapService.getMapMeta(nextMapId)) {
      return '目标地图不存在';
    }
    if (positionChanged && !this.canSetPosition(nextMapId, nextX, nextY, player.id, runtime)) {
      return '目标坐标不可站立或已被占用';
    }

/** requestedHp：定义该变量以承载业务值。 */
    const requestedHp = this.normalizeNonNegativeInt(snapshot.hp);
/** requestedQi：定义该变量以承载业务值。 */
    const requestedQi = this.normalizeNonNegativeInt(snapshot.qi);
/** requestedRealmProgress：定义该变量以承载业务值。 */
    const requestedRealmProgress = typeof snapshot.realm?.progress === 'number'
      ? this.normalizeNonNegativeInt(snapshot.realm.progress)
      : undefined;

/** previousMapId：定义该变量以承载业务值。 */
    const previousMapId = player.mapId;
/** previousX：定义该变量以承载业务值。 */
    const previousX = player.x;
/** previousY：定义该变量以承载业务值。 */
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

/** resetStoredPlayerToSpawn：执行对应的业务逻辑。 */
  private resetStoredPlayerToSpawn(player: PlayerState): void {
/** spawn：定义该变量以承载业务值。 */
    const spawn = this.mapService.getSpawnPoint(DEFAULT_PLAYER_MAP_ID) ?? { x: player.x, y: player.y };
/** pos：定义该变量以承载业务值。 */
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

/** canSetPosition：执行对应的业务逻辑。 */
  private canSetPosition(mapId: string, x: number, y: number, playerId: string, runtime: boolean): boolean {
/** tile：定义该变量以承载业务值。 */
    const tile = this.mapService.getTile(mapId, x, y);
    if (!tile?.walkable) return false;
    if (!runtime) {
      return true;
    }

    return this.mapService.canOccupy(mapId, x, y, { occupancyId: playerId, actorType: 'player' });
  }

  /** 将离线玩家状态持久化到数据库 */
  private async persistOfflinePlayer(_entity: PlayerEntity, player: PlayerState): Promise<void> {
    await this.playerService.saveDetachedPlayerState(player);
  }

  private getMapsWithRuntimePlayers(): string[] {
    return [...new Set(
      this.playerService.getAllPlayers()
        .filter((player) => player.isBot !== true && player.inWorld !== false)
        .map((player) => player.mapId),
    )];
  }

  private async disableOfflinePlayerAllPlayerHostility(): Promise<void> {
    const runtimeIds = new Set(
      this.playerService.getAllPlayers()
        .filter((player) => player.isBot !== true)
        .map((player) => player.id),
    );
    const entities = await this.playerRepo.find();
    const dirtyEntities: PlayerEntity[] = [];
    for (const entity of entities) {
      if (runtimeIds.has(entity.id)) {
        continue;
      }
      if (!this.worldRuleService.shouldForceDisableAllPlayerHostility(
        entity.combatTargetingRules as PlayerState['combatTargetingRules'],
        entity.allowAoePlayerHit === true,
      )) {
        continue;
      }
      entity.combatTargetingRules = this.worldRuleService.buildEffectiveCombatTargetingRules(
        entity.combatTargetingRules as PlayerState['combatTargetingRules'],
        entity.allowAoePlayerHit === true,
      );
      entity.allowAoePlayerHit = false;
      entity.combatTargetId = null;
      entity.combatTargetLocked = false;
      dirtyEntities.push(entity);
    }
    if (dirtyEntities.length > 0) {
      await this.playerRepo.save(dirtyEntities);
    }
  }

/** enqueue：执行对应的业务逻辑。 */
  private enqueue(mapId: string, command: GmCommand): void {
/** commands：定义该变量以承载业务值。 */
    const commands = this.commandsByMap.get(mapId) ?? [];
    commands.push(command);
    this.commandsByMap.set(mapId, commands);
  }

  /** 地图保存后为位置不合法的玩家寻找安全坐标 */
  private resolveMapSaveRelocation(player: PlayerState): { x: number; y: number } | null {
/** mapMeta：定义该变量以承载业务值。 */
    const mapMeta = this.mapService.getMapMeta(player.mapId);
    if (!mapMeta) return null;

/** inBounds：定义该变量以承载业务值。 */
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

/** origin：定义该变量以承载业务值。 */
    const origin = inBounds
      ? { x: player.x, y: player.y }
      : {
          x: Math.min(mapMeta.width - 1, Math.max(0, player.x)),
          y: Math.min(mapMeta.height - 1, Math.max(0, player.y)),
        };

/** nearby：定义该变量以承载业务值。 */
    const nearby = this.mapService.findNearbyWalkable(player.mapId, origin.x, origin.y, 10, {
      occupancyId: player.id,
      actorType: 'player',
    });
    if (nearby) return nearby;

/** spawn：定义该变量以承载业务值。 */
    const spawn = this.mapService.getSpawnPoint(player.mapId);
    if (spawn && this.mapService.canOccupy(player.mapId, spawn.x, spawn.y, {
      occupancyId: player.id,
      actorType: 'player',
    })) {
      return spawn;
    }

    if (spawn) {
/** nearSpawn：定义该变量以承载业务值。 */
      const nearSpawn = this.mapService.findNearbyWalkable(player.mapId, spawn.x, spawn.y, 12, {
        occupancyId: player.id,
        actorType: 'player',
      });
      if (nearSpawn) return nearSpawn;
    }

    return null;
  }

/** markDirty：执行对应的业务逻辑。 */
  private markDirty(playerId: string, flags: DirtyFlag[]): void {
    for (const flag of flags) {
      this.playerService.markDirty(playerId, flag);
    }
  }

/** calculateCombatExpCompensation：执行对应的业务逻辑。 */
  private calculateCombatExpCompensation(player: Pick<PlayerState, 'realm' | 'bodyTraining'>): number {
/** realmExpToNext：定义该变量以承载业务值。 */
    const realmExpToNext = this.normalizeNonNegativeInt(player.realm?.progressToNext ?? 0);
/** bodyTrainingExpToNext：定义该变量以承载业务值。 */
    const bodyTrainingExpToNext = normalizeBodyTrainingState(player.bodyTraining).expToNext;
    return realmExpToNext + this.normalizeNonNegativeInt(bodyTrainingExpToNext);
  }

/** calculateFoundationCompensation：执行对应的业务逻辑。 */
  private calculateFoundationCompensation(player: Pick<PlayerState, 'realm'>): number {
/** realmExpToNext：定义该变量以承载业务值。 */
    const realmExpToNext = this.normalizeNonNegativeInt(player.realm?.progressToNext ?? 0);
    return realmExpToNext * 5;
  }

/** applyBodyTrainingLevel：执行对应的业务逻辑。 */
  private applyBodyTrainingLevel(player: PlayerState, level: number): void {
/** preservedExp：定义该变量以承载业务值。 */
    const preservedExp = this.normalizeNonNegativeInt(player.bodyTraining?.exp ?? 0);
/** expToNext：定义该变量以承载业务值。 */
    const expToNext = getBodyTrainingExpToNext(level);
    player.bodyTraining = normalizeBodyTrainingState({
      level,
      exp: Math.min(preservedExp, Math.max(0, expToNext - 1)),
    });
    this.techniqueService.initializePlayerProgression(player);
  }

/** parseBodyTrainingLevel：执行对应的业务逻辑。 */
  private parseBodyTrainingLevel(value: unknown): number | null {
/** numeric：定义该变量以承载业务值。 */
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
      return null;
    }
    return Math.floor(numeric);
  }

/** parseCounterDelta：执行对应的业务逻辑。 */
  private parseCounterDelta(value: unknown, label: string): number | string {
/** numeric：定义该变量以承载业务值。 */
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
      return `${label}必须是整数`;
    }
    return numeric;
  }

/** applyCounterDelta：执行对应的业务逻辑。 */
  private applyCounterDelta(currentValue: unknown, amount: number): number {
    return Math.max(0, this.normalizeNonNegativeInt(currentValue) + amount);
  }

/** hasInvalidItems：执行对应的业务逻辑。 */
  private hasInvalidItems(summary: InvalidItemCleanupSummary): boolean {
    return summary.inventoryStacksRemoved > 0
      || summary.marketStorageStacksRemoved > 0
      || summary.equipmentRemoved > 0;
  }

/** inspectInvalidItems：执行对应的业务逻辑。 */
  private inspectInvalidItems(player: Pick<PlayerState, 'inventory' | 'marketStorage' | 'equipment'>): InvalidItemCleanupSummary {
/** inventoryStacksRemoved：定义该变量以承载业务值。 */
    const inventoryStacksRemoved = (player.inventory?.items ?? []).filter((item) => !this.contentService.getItem(item.itemId)).length;
/** marketStorageStacksRemoved：定义该变量以承载业务值。 */
    const marketStorageStacksRemoved = (player.marketStorage?.items ?? []).filter((item) => !this.contentService.getItem(item.itemId)).length;
/** equipmentRemoved：定义该变量以承载业务值。 */
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

/** cleanupInvalidItems：执行对应的业务逻辑。 */
  private cleanupInvalidItems(player: PlayerState): InvalidItemCleanupSummary {
/** summary：定义该变量以承载业务值。 */
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
/** nextEquipment：定义该变量以承载业务值。 */
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
/** maxQi：定义该变量以承载业务值。 */
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

/** runtime：定义该变量以承载业务值。 */
    const runtime = this.playerService.getPlayer(playerId);
/** currentName：定义该变量以承载业务值。 */
    const currentName = normalizeRoleName(runtime?.name ?? (
      await this.playerRepo.findOne({
        where: { id: playerId },
        select: { name: true },
      })
    )?.name ?? '');
/** nextName：定义该变量以承载业务值。 */
    const nextName = normalizeRoleName(snapshot.name);

    if (!nextName || nextName === currentName) {
      return null;
    }

/** roleNameError：定义该变量以承载业务值。 */
    const roleNameError = validateRoleName(nextName);
    if (roleNameError) {
      return roleNameError;
    }
/** roleNameSensitiveError：定义该变量以承载业务值。 */
    const roleNameSensitiveError = this.roleNameModerationService.validateRoleName(nextName);
    if (roleNameSensitiveError) {
      return roleNameSensitiveError;
    }

/** userId：定义该变量以承载业务值。 */
    const userId = this.playerService.getUserIdByPlayerId(playerId) ?? (
      await this.playerRepo.findOne({
        where: { id: playerId },
        select: { userId: true },
      })
    )?.userId;
/** roleNameConflict：定义该变量以承载业务值。 */
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

/** merged：定义该变量以承载业务值。 */
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

/** getDirtyFlagsForSection：执行对应的业务逻辑。 */
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

/** normalizeName：执行对应的业务逻辑。 */
  private normalizeName(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, 50) : fallback;
  }

/** normalizeAttributes：执行对应的业务逻辑。 */
  private normalizeAttributes(value: unknown): Attributes {
/** source：定义该变量以承载业务值。 */
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

/** normalizeInventory：执行对应的业务逻辑。 */
  private normalizeInventory(value: unknown): Inventory {
/** source：定义该变量以承载业务值。 */
    const source = typeof value === 'object' && value !== null ? value as Partial<Inventory> : {};
    return {
      capacity: this.normalizePositiveInt(source.capacity, DEFAULT_INVENTORY_CAPACITY),
      items: Array.isArray(source.items) ? this.cloneArray(source.items) : [],
    };
  }

/** normalizeEquipment：执行对应的业务逻辑。 */
  private normalizeEquipment(value: unknown): EquipmentSlots {
/** source：定义该变量以承载业务值。 */
    const source = typeof value === 'object' && value !== null ? value as Partial<EquipmentSlots> : {};
    return {
      weapon: source.weapon ? this.cloneObject(source.weapon) : null,
      head: source.head ? this.cloneObject(source.head) : null,
      body: source.body ? this.cloneObject(source.body) : null,
      legs: source.legs ? this.cloneObject(source.legs) : null,
      accessory: source.accessory ? this.cloneObject(source.accessory) : null,
    };
  }

/** normalizeTemporaryBuffs：执行对应的业务逻辑。 */
  private normalizeTemporaryBuffs(value: unknown): TemporaryBuffState[] {
    return Array.isArray(value) ? this.cloneArray<TemporaryBuffState>(value) : [];
  }

/** buildEditorBuffCatalog：执行对应的业务逻辑。 */
  private buildEditorBuffCatalog(): GmEditorBuffOption[] {
/** catalog：定义该变量以承载业务值。 */
    const catalog = new Map<string, GmEditorBuffOption>();
/** register：定义该变量以承载业务值。 */
    const register = (buff: TemporaryBuffState): void => {
/** buffId：定义该变量以承载业务值。 */
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
/** buffId：定义该变量以承载业务值。 */
          const buffId = effect.buffId.trim();
          if (!buffId) {
            continue;
          }
/** duration：定义该变量以承载业务值。 */
          const duration = Math.max(1, effect.duration);
/** maxStacks：定义该变量以承载业务值。 */
          const maxStacks = Math.max(1, effect.maxStacks ?? 1);
          register({
            buffId,
            name: effect.name,
            desc: effect.desc,
            shortMark: this.normalizeEditorBuffShortMark(effect.shortMark, effect.name),
/** category：定义该变量以承载业务值。 */
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
/** duration：定义该变量以承载业务值。 */
        const duration = Math.max(1, buff.duration);
/** maxStacks：定义该变量以承载业务值。 */
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
/** buffId：定义该变量以承载业务值。 */
        const buffId = effect.buff.buffId.trim();
        if (!buffId) {
          continue;
        }
/** duration：定义该变量以承载业务值。 */
        const duration = Math.max(1, effect.buff.duration);
/** maxStacks：定义该变量以承载业务值。 */
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
/** nameOrder：定义该变量以承载业务值。 */
      const nameOrder = left.name.localeCompare(right.name, 'zh-CN');
      if (nameOrder !== 0) {
        return nameOrder;
      }
      return left.buffId.localeCompare(right.buffId, 'zh-CN');
    });
  }

/** normalizeEditorBuffShortMark：执行对应的业务逻辑。 */
  private normalizeEditorBuffShortMark(raw: string | undefined, fallbackName: string): string {
/** value：定义该变量以承载业务值。 */
    const value = raw?.trim();
    if (value) {
      return [...value][0] ?? value;
    }
/** fallback：定义该变量以承载业务值。 */
    const fallback = fallbackName.trim();
    return [...fallback][0] ?? '气';
  }

/** normalizeQuests：执行对应的业务逻辑。 */
  private normalizeQuests(quests: QuestState[]): QuestState[] {
    return this.cloneArray<QuestState>(quests);
  }

/** normalizeDirection：执行对应的业务逻辑。 */
  private normalizeDirection(value: unknown): Direction {
    if (value === Direction.North || value === Direction.South || value === Direction.East || value === Direction.West) {
      return value;
    }
    return Direction.South;
  }

/** normalizeInt：执行对应的业务逻辑。 */
  private normalizeInt(value: unknown, fallback = 0): number {
    return Number.isFinite(value) ? Math.floor(Number(value)) : fallback;
  }

/** normalizeNonNegativeInt：执行对应的业务逻辑。 */
  private normalizeNonNegativeInt(value: unknown, fallback = 0): number {
    return Math.max(0, this.normalizeInt(value, fallback));
  }

/** normalizePositiveInt：执行对应的业务逻辑。 */
  private normalizePositiveInt(value: unknown, fallback = 1): number {
    return Math.max(1, this.normalizeInt(value, fallback));
  }

/** clonePlayer：执行对应的业务逻辑。 */
  private clonePlayer<T>(player: T): T {
    return JSON.parse(JSON.stringify(player)) as T;
  }

/** cloneArray：执行对应的业务逻辑。 */
  private cloneArray<T>(value: unknown): T[] {
    return Array.isArray(value) ? JSON.parse(JSON.stringify(value)) as T[] : [];
  }

/** cloneObject：执行对应的业务逻辑。 */
  private cloneObject<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

/** loadUsersByIds：执行对应的业务逻辑。 */
  private async loadUsersByIds(userIds: Iterable<string | undefined>): Promise<Map<string, UserEntity>> {
/** ids：定义该变量以承载业务值。 */
    const ids = [...new Set(
      Array.from(userIds).filter((userId): userId is string => typeof userId === 'string' && userId.length > 0),
    )];
    if (ids.length === 0) {
      return new Map();
    }
/** users：定义该变量以承载业务值。 */
    const users = await this.userRepo.findBy({ id: In(ids) });
    return new Map(users.map((user) => [user.id, user]));
  }

/** resolveStoredDisplayName：执行对应的业务逻辑。 */
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
/** normalizedDisplayName：定义该变量以承载业务值。 */
    const normalizedDisplayName = displayName?.trim();
    if (normalizedDisplayName) {
      return normalizedDisplayName;
    }
/** normalizedAccountName：定义该变量以承载业务值。 */
    const normalizedAccountName = accountName?.trim();
    if (normalizedAccountName) {
      return normalizedAccountName.slice(0, 1);
    }
/** normalizedFallback：定义该变量以承载业务值。 */
    const normalizedFallback = fallbackName.trim();
    return normalizedFallback.length > 0 ? normalizedFallback.slice(0, 1) : '';
  }

  /** buildAccountRecord：执行对应的业务逻辑。 */
  private buildAccountRecord(
    user: UserEntity | null | undefined,
    online: boolean,
    isRiskAdmin: boolean,
  ): GmManagedAccountRecord | undefined {
    if (!user) {
      return undefined;
    }
/** sessionStartedAt：定义该变量以承载业务值。 */
    const sessionStartedAt = this.playerService.getOnlineSessionStartedAt(user.id)
      ?? user.currentOnlineStartedAt?.getTime();
/** currentSessionSeconds：定义该变量以承载业务值。 */
    const currentSessionSeconds = online && sessionStartedAt
      ? Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 1000))
      : 0;
    return {
      userId: user.id,
      username: user.username,
      isRiskAdmin,
      status: user.bannedAt ? 'banned' : 'active',
      createdAt: user.createdAt.toISOString(),
      totalOnlineSeconds: Math.max(0, Math.floor(user.totalOnlineSeconds ?? 0)) + currentSessionSeconds,
      bannedAt: user.bannedAt?.toISOString(),
      banReason: user.banReason ?? undefined,
      bannedBy: user.bannedBy ?? undefined,
      lastLoginAt: user.lastLoginAt?.toISOString(),
      lastLoginIp: user.lastLoginIp ?? undefined,
      lastLoginDeviceId: user.lastLoginDeviceId ?? undefined,
    };
  }

  private getManagedPlayerBehaviors(player: PlayerState): GmManagedPlayerBehavior[] {
/** behaviors：定义该变量以承载业务值。 */
    const behaviors: GmManagedPlayerBehavior[] = [];
    if (player.autoBattle || player.pendingSkillCast || player.combatTargetLocked || typeof player.combatTargetId === 'string') {
      behaviors.push('combat');
    }
    if (this.techniqueService.hasCultivationBuff(player)) {
      behaviors.push('cultivation');
    }
    if (player.alchemyJob) {
      behaviors.push('alchemy');
    }
    if (player.enhancementJob) {
      behaviors.push('enhancement');
    }
    if (
      this.lootService.hasActiveHarvest(player.id)
      || (player.temporaryBuffs ?? []).some((buff) => buff.buffId === GM_PLAYER_GATHER_BUFF_ID)
    ) {
      behaviors.push('gather');
    }
    return behaviors;
  }

  private getManagedPlayerAccountStatus(
    user: UserEntity | null | undefined,
    userId?: string,
    accountName?: string,
  ): GmManagedPlayerAccountStatus {
    if (!user && (!userId || !accountName)) {
      return 'abnormal';
    }
    if (user?.bannedAt) {
      return 'banned';
    }
    return 'normal';
  }

  private async resolveManagedPlayerUserId(playerId: string): Promise<string | null> {
/** runtimeUserId：定义该变量以承载业务值。 */
    const runtimeUserId = this.playerService.getUserIdByPlayerId(playerId);
    if (runtimeUserId) {
      return runtimeUserId;
    }
    return (await this.playerRepo.findOne({
      where: { id: playerId },
      select: { userId: true },
    }))?.userId ?? null;
  }

  private evictManagedPlayerFromWorld(userId: string): void {
/** playerId：定义该变量以承载业务值。 */
    const playerId = this.playerService.getPlayerByUserId(userId);
    if (!playerId) {
      return;
    }
/** socket：定义该变量以承载业务值。 */
    const socket = this.playerService.getSocket(playerId);
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (player) {
      this.worldService.removePlayerFromWorld(player, 'timeout');
    }
    if (socket) {
      socket.emit(S2C.Kick);
      socket.disconnect(true);
    }
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
/** meta：定义该变量以承载业务值。 */
    const meta = this.mapService.getMapMeta(mapId);
    if (!meta) return null;

/** clampedW：定义该变量以承载业务值。 */
    const clampedW = Math.min(20, Math.max(1, w));
/** clampedH：定义该变量以承载业务值。 */
    const clampedH = Math.min(20, Math.max(1, h));
/** startX：定义该变量以承载业务值。 */
    const startX = Math.max(0, Math.min(x, meta.width - 1));
/** startY：定义该变量以承载业务值。 */
    const startY = Math.max(0, Math.min(y, meta.height - 1));
/** endX：定义该变量以承载业务值。 */
    const endX = Math.min(meta.width, startX + clampedW);
/** endY：定义该变量以承载业务值。 */
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
/** online：定义该变量以承载业务值。 */
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

/** time：定义该变量以承载业务值。 */
    const time = this.timeService.buildPlayerTimeState(
      { mapId, viewRange: VIEW_RADIUS } as PlayerState,
    );
/** timeConfig：定义该变量以承载业务值。 */
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

/** pruneExpiredWorldObservations：执行对应的业务逻辑。 */
  private pruneExpiredWorldObservations(now: number): void {
    for (const [viewerId, session] of this.worldObservationSessions.entries()) {
      if (now - session.lastSeenAt > GM_WORLD_OBSERVE_SESSION_TTL_MS) {
        this.worldObservationSessions.delete(viewerId);
      }
    }
  }

/** ensureWorldObserveBuff：执行对应的业务逻辑。 */
  private ensureWorldObserveBuff(player: PlayerState): boolean {
/** targetBuffs：定义该变量以承载业务值。 */
    const targetBuffs = player.temporaryBuffs ??= [];
/** existing：定义该变量以承载业务值。 */
    const existing = targetBuffs.find((buff) => buff.buffId === GM_WORLD_OBSERVE_BUFF_ID);
    if (!existing) {
      targetBuffs.push(this.buildWorldObserveBuffState());
      this.attrService.recalcPlayer(player);
      return true;
    }

/** changed：定义该变量以承载业务值。 */
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

/** removeWorldObserveBuff：执行对应的业务逻辑。 */
  private removeWorldObserveBuff(player: PlayerState): boolean {
/** targetBuffs：定义该变量以承载业务值。 */
    const targetBuffs = player.temporaryBuffs;
    if (!targetBuffs || targetBuffs.length === 0) {
      return false;
    }
/** index：定义该变量以承载业务值。 */
    const index = targetBuffs.findIndex((buff) => buff.buffId === GM_WORLD_OBSERVE_BUFF_ID);
    if (index < 0) {
      return false;
    }
    targetBuffs.splice(index, 1);
    this.attrService.recalcPlayer(player);
    return true;
  }

/** buildWorldObserveBuffState：执行对应的业务逻辑。 */
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

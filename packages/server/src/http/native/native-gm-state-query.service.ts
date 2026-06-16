/**
 * 本文件属于服务端 HTTP 或 GM 辅助入口，负责把运维能力接入内部服务。
 *
 * 维护时要注意鉴权、审计和后台任务边界，避免把管理操作暴露成无保护公开接口。
 */
/**
 * GM 世界状态查询服务。
 * 聚合玩家列表、性能快照、世界摘要等信息，供 GM 面板主页展示。
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ARTIFACT_SLOTS,
  DEFAULT_BASE_ATTRS,
  EQUIP_SLOTS,
  VIEW_RADIUS,
  type GmListPlayersQuery,
  type GmManagedPlayerSummary,
  type GmPlayerListRes,
  type GmPlayerAccountStatusFilter,
  type GmPlayerSortMode,
} from '@mud/shared';
import { MapTemplateRepository } from '../../runtime/map/map-template.repository';
import { DatabasePoolProvider } from '../../persistence/database-pool.provider';
import { PlayerDomainPersistenceService } from '../../persistence/player-domain-persistence.service';
import { PlayerProgressionService } from '../../runtime/player/player-progression.service';
import { PlayerRuntimeService } from '../../runtime/player/player-runtime.service';
import { materializeRuntimeTemporaryBuff } from '../../runtime/player/runtime-buff-instance';
import { RuntimeGmStateService } from '../../runtime/gm/runtime-gm-state.service';
import { isNativeGmBotPlayerId } from './native-gm.constants';
import { NativeManagedAccountService } from './native-managed-account.service';
import { buildNativeGmPlayerRiskView } from './native-gm-player-risk';
const RAW_BASE_ATTRS_PERSISTENCE_MARKER = '__rawBaseAttrs';
const GM_PERSISTED_PLAYER_SUMMARY_CACHE_TTL_MS = 60_000;
const GM_PLAYER_LIST_VIEW_CACHE_TTL_MS = 60_000;
const GM_PERSISTED_PLAYER_SUMMARY_QUERY_ATTEMPTS = 3;
const GM_PERSISTED_PLAYER_SUMMARY_QUERY_RETRY_DELAY_MS = 40;
const GM_PLAYER_RISK_ENRICH_CONCURRENCY = 8;
const RETRYABLE_GM_SUMMARY_DATABASE_ERROR_CODES = new Set(['40P01', '40001']);
const GM_PLAYER_RISK_SEARCH_KEYWORDS = [
  '风险',
  '账号完整性',
  '账号命名模式',
  '相似账号簇',
  '账号年龄',
  '重复 ip',
  '重复ip',
  '重复设备',
  '坊市关系',
  'low',
  'medium',
  'high',
  'critical',
];
/**
 * ManagedAccountEntryLike：定义接口结构约束，明确可交付字段含义。
 */


interface ManagedAccountEntryLike {
/**
 * userId：userID标识。
 */

  userId?: string;  
  /**
 * username：username名称或显示文本。
 */

  username?: string;
  playerNo?: number | null;
  playerName?: string;
  displayName?: string | null;
  createdAt?: string;
  registerIp?: string | null;
  lastLoginIp?: string | null;
  lastLoginAt?: string | null;
  registerDeviceId?: string | null;
  lastLoginDeviceId?: string | null;
  bannedAt?: string | null;
  isRiskAdmin?: boolean;
}
/**
 * NativeManagedAccountServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface NativeManagedAccountServiceLike {
  getManagedAccountIndex(playerIds: string[]): Promise<Map<string, ManagedAccountEntryLike>>;
}
/**
 * RuntimeGmStateServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface RuntimeGmStateServiceLike {
  buildPerformanceSnapshot(options?: { includeMemoryEstimate?: boolean }): any;
  buildSharedGmStatePerf(): any;
}
/**
 * MapTemplateSummaryLike：定义接口结构约束，明确可交付字段含义。
 */


interface MapTemplateSummaryLike {
/**
 * id：ID标识。
 */

  id: string;
}
/**
 * MapTemplateRepositoryLike：定义接口结构约束，明确可交付字段含义。
 */


interface MapTemplateRepositoryLike {
  listSummaries(): MapTemplateSummaryLike[];
  getOrThrow(mapId: string): {  
  /**
 * name：名称名称或显示文本。
 */
 name: string };
}
/**
 * PersistedPlayerEntryLike：定义接口结构约束，明确可交付字段含义。
 */


interface PersistedPlayerEntryLike {
/**
 * playerId：玩家ID标识。
 */

  playerId: string;  
  /**
 * snapshot：快照状态或数据块。
 */

  snapshot: any;  
  /**
 * updatedAt：updatedAt相关字段。
 */

  updatedAt: number;
}
/**
 * PlayerDomainPersistenceServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface PlayerDomainPersistenceServiceLike {
  listProjectedSnapshots(buildStarterSnapshot: (playerId: string) => any | null): Promise<PersistedPlayerEntryLike[]>;
  listPlayerPresence?(playerIds: Iterable<string> | null | undefined): Promise<Map<string, {
    online: boolean;
    inWorld: boolean;
    lastHeartbeatAt?: number | null;
    offlineSinceAt?: number | null;
  }>>;
}
/**
 * PlayerProgressionServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface PlayerProgressionServiceLike {
  createRealmStateFromLevel(realmLv: number, progress: number): any;
}
/**
 * PlayerRuntimeServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface PlayerRuntimeServiceLike {
  listPlayerSnapshots(): any[];
  listGmPlayerSummaries?(): any[];
  buildStarterPersistenceSnapshot(playerId: string): any | null;
}
interface GmPersistedPlayerSummaryRow {
  player_id?: unknown;
  player_no?: unknown;
  username?: unknown;
  created_at?: unknown;
  register_ip?: unknown;
  last_login_ip?: unknown;
  last_login_at?: unknown;
  register_device_id?: unknown;
  last_login_device_id?: unknown;
  banned_at?: unknown;
  role_name?: unknown;
  display_name?: unknown;
  user_id?: unknown;
  map_id?: unknown;
  x?: unknown;
  y?: unknown;
  hp?: unknown;
  max_hp?: unknown;
  qi?: unknown;
  realm_lv?: unknown;
  realm_label?: unknown;
  auto_battle?: unknown;
  auto_battle_stationary?: unknown;
  auto_retaliate?: unknown;
  online?: unknown;
  in_world?: unknown;
  updated_at_ms?: unknown;
}

interface GmPersistedPlayerSummaryEntry {
  summary: GmManagedPlayerSummary;
  account: ManagedAccountEntryLike | null;
}

interface GmPlayerSearchEntry {
  summary: GmManagedPlayerSummary;
  account: ManagedAccountEntryLike | null;
  searchText: string;
}
interface GmPlayerListViewSnapshot {
  players: GmManagedPlayerSummary[];
  playerPage: ReturnType<typeof buildPlayerPage>;
  playerStats: ReturnType<typeof buildPlayerSearchStats>;
  botCount: number;
}
/**
 * PerformanceTimerState：定义接口结构约束，明确可交付字段含义。
 */


interface PerformanceTimerState {
/**
 * networkPerfStartedAt：networkPerfStartedAt相关字段。
 */

  networkPerfStartedAt: number;  
  /**
 * cpuPerfStartedAt：cpuPerfStartedAt相关字段。
 */

  cpuPerfStartedAt: number;  
  /**
 * pathfindingPerfStartedAt：pathfindingPerfStartedAt相关字段。
 */

  pathfindingPerfStartedAt: number;
}

interface NormalizedGmListPlayersQuery {
  page: number;
  pageSize: number;
  keyword: string;
  keywordNeedle: string;
  sort: GmPlayerSortMode;
  accountStatus: GmPlayerAccountStatusFilter;
  includeMemoryEstimate: boolean;
  includePlayers: boolean;
  refresh: boolean;
}

const DEFAULT_GM_PAGE_SIZE = 50;
const MAX_GM_PAGE_SIZE = 200;
/**
 * NativeGmStateQueryService：封装该能力的入口与生命周期，承载运行时核心协作。
 */


@Injectable()
export class NativeGmStateQueryService {
  private readonly logger = new Logger(NativeGmStateQueryService.name);
  private persistedPlayerSummaryCache: GmPersistedPlayerSummaryEntry[] | null = null;
  private persistedPlayerSummaryCacheExpiresAt = 0;
  private persistedPlayerSummaryCachePromise: Promise<GmPersistedPlayerSummaryEntry[]> | null = null;
  private persistedPlayerSummaryCacheGeneration = 0;
  private playerListViewCache = new Map<string, { expiresAt: number; snapshot: GmPlayerListViewSnapshot }>();
  private playerListViewCacheGeneration = 0;
/**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param nextManagedAccountService NativeManagedAccountServiceLike 参数说明。
 * @param runtimeGmStateService RuntimeGmStateServiceLike 参数说明。
 * @param mapTemplateRepository MapTemplateRepositoryLike 参数说明。
 * @param playerDomainPersistenceService PlayerDomainPersistenceServiceLike 参数说明。
 * @param playerProgressionService PlayerProgressionServiceLike 参数说明。
 * @param playerRuntimeService PlayerRuntimeServiceLike 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

  constructor(
    @Inject(NativeManagedAccountService)
    private readonly nextManagedAccountService: NativeManagedAccountServiceLike,
    @Inject(RuntimeGmStateService)
    private readonly runtimeGmStateService: RuntimeGmStateServiceLike,
    @Inject(MapTemplateRepository)
    private readonly mapTemplateRepository: MapTemplateRepositoryLike,
    @Inject(PlayerDomainPersistenceService)
    private readonly playerDomainPersistenceService: PlayerDomainPersistenceServiceLike,
    @Inject(PlayerProgressionService)
    private readonly playerProgressionService: PlayerProgressionServiceLike,
    @Inject(PlayerRuntimeService)
    private readonly playerRuntimeService: PlayerRuntimeServiceLike,
    @Inject(DatabasePoolProvider)
    private readonly databasePoolProvider: DatabasePoolProvider,
  ) {}  
  /**
 * getState：读取状态。
 * @param timers PerformanceTimerState 参数说明。
 * @returns 无返回值，完成状态的读取/组装。
 */


  async getState(query: GmListPlayersQuery | undefined, timers: PerformanceTimerState) {
    const normalizedQuery = normalizeGmListPlayersQuery(query);
    const perf = this.buildPerformanceSnapshot(timers, {
      includeMemoryEstimate: normalizedQuery.includeMemoryEstimate,
    });
    if (!normalizedQuery.includePlayers) {
      const summary = await this.buildLightPlayerListSummary(normalizedQuery);
      return {
        players: [],
        playerPage: summary.playerPage,
        playerStats: summary.playerStats,
        mapIds: this.listSortedMapIds(),
        botCount: summary.botCount,
        perf,
      };
    }
    const listView = await this.listPlayersByQuery(normalizedQuery);

    return {
      ...listView,
      perf,
    };
  }

  async listPlayers(query: GmListPlayersQuery | undefined): Promise<GmPlayerListRes> {
    const normalizedQuery = normalizeGmListPlayersQuery({
      ...query,
      includePlayers: true,
    });
    return this.listPlayersByQuery(normalizedQuery);
  }

  private async listPlayersByQuery(normalizedQuery: NormalizedGmListPlayersQuery): Promise<GmPlayerListRes> {
    const cacheKey = buildPlayerListViewCacheKey(normalizedQuery);
    const now = Date.now();
    const cached = this.playerListViewCache.get(cacheKey);
    if (!normalizedQuery.refresh && cached && now < cached.expiresAt) {
      return cached.snapshot;
    }
    const cacheGeneration = this.playerListViewCacheGeneration;

    const searchEntries = await this.buildPlayerSearchEntries();
    const shouldUseFullRisk = shouldUseFullRiskPlayerSearch(normalizedQuery);
    const searchableEntries = shouldUseFullRisk
      ? await this.enrichSearchEntries(searchEntries)
      : searchEntries;
    const filteredEntries = filterPlayerSearchEntries(searchableEntries, normalizedQuery.keywordNeedle, normalizedQuery.accountStatus);
    const sortedEntries = sortPlayerSearchEntries(filteredEntries, normalizedQuery.sort);
    const playerPage = buildPlayerPage(normalizedQuery, sortedEntries.length);
    const pageEntries = slicePlayerSearchEntries(sortedEntries, playerPage.page, playerPage.pageSize);
    const players = shouldUseFullRisk
      ? pageEntries.map((entry) => entry.summary)
      : (await this.enrichSearchEntries(pageEntries)).map((entry) => entry.summary);

    const snapshot = {
      players,
      playerPage,
      playerStats: buildPlayerSearchStats(filteredEntries),
      botCount: filteredEntries.reduce((count, entry) => count + (entry.summary.meta.isBot ? 1 : 0), 0),
    };
    if (this.playerListViewCacheGeneration === cacheGeneration) {
      this.rememberPlayerListViewCache(cacheKey, snapshot);
    }
    return snapshot;
  }

  private async buildLightPlayerListSummary(normalizedQuery: NormalizedGmListPlayersQuery): Promise<Pick<GmPlayerListRes, 'playerPage' | 'playerStats' | 'botCount'>> {
    const searchEntries = await this.buildPlayerSearchEntries();
    const filteredEntries = filterPlayerSearchEntries(searchEntries, normalizedQuery.keywordNeedle, normalizedQuery.accountStatus);
    return {
      playerPage: buildPlayerPage(normalizedQuery, filteredEntries.length),
      playerStats: buildPlayerSearchStats(filteredEntries),
      botCount: filteredEntries.reduce((count, entry) => count + (entry.summary.meta.isBot ? 1 : 0), 0),
    };
  }

  private async buildPlayerSearchEntries(): Promise<GmPlayerSearchEntry[]> {
    const runtimePlayers = typeof this.playerRuntimeService.listGmPlayerSummaries === 'function'
      ? this.playerRuntimeService.listGmPlayerSummaries()
      : this.playerRuntimeService.listPlayerSnapshots();
    const accountIndex = await this.nextManagedAccountService.getManagedAccountIndex(
      runtimePlayers.map((entry) => entry.playerId),
    );
    const persistedEntries = await this.listPersistedPlayerSummaries();
    const entries = runtimePlayers.map((snapshot) => {
      const account = accountIndex.get(snapshot.playerId) ?? null;
      return this.toPlayerSearchEntry(this.toManagedPlayerSummary(snapshot, account), account);
    });
    const runtimePlayerIds = new Set(runtimePlayers.map((entry) => entry.playerId));

    for (const { summary, account } of persistedEntries) {
      if (runtimePlayerIds.has(summary.id)) {
        continue;
      }
      entries.push(this.toPlayerSearchEntry(summary, account));
    }

    return entries;
  }

  private rememberPlayerListViewCache(cacheKey: string, snapshot: GmPlayerListViewSnapshot): void {
    if (this.playerListViewCache.size > 24) {
      this.playerListViewCache.clear();
    }
    this.playerListViewCache.set(cacheKey, {
      expiresAt: Date.now() + GM_PLAYER_LIST_VIEW_CACHE_TTL_MS,
      snapshot,
    });
  }

  invalidatePlayerListCaches(): void {
    this.playerListViewCache.clear();
    this.playerListViewCacheGeneration += 1;
    this.persistedPlayerSummaryCache = null;
    this.persistedPlayerSummaryCacheExpiresAt = 0;
    this.persistedPlayerSummaryCachePromise = null;
    this.persistedPlayerSummaryCacheGeneration += 1;
  }

  private listSortedMapIds(): string[] {
    return this.mapTemplateRepository
      .listSummaries()
      .map((entry) => entry.id)
      .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
  }

  private toPlayerSearchEntry(summary: GmManagedPlayerSummary, account: ManagedAccountEntryLike | null): GmPlayerSearchEntry {
    return {
      summary,
      account,
      searchText: buildPlayerSearchText(summary),
    };
  }
  /**
 * collectManagedPlayerIds：执行Managed玩家ID相关逻辑。
 * @param runtimePlayers 参数说明。
 * @param persistedEntries 参数说明。
 * @returns 无返回值，直接更新Managed玩家ID相关状态。
 */


  private async listPersistedPlayerSummaries(): Promise<GmPersistedPlayerSummaryEntry[]> {
    const now = Date.now();
    if (this.persistedPlayerSummaryCache && now < this.persistedPlayerSummaryCacheExpiresAt) {
      return this.persistedPlayerSummaryCache.slice();
    }
    if (this.persistedPlayerSummaryCachePromise) {
      return (await this.persistedPlayerSummaryCachePromise).slice();
    }
    const cacheGeneration = this.persistedPlayerSummaryCacheGeneration;
    const cachePromise = this.loadPersistedPlayerSummaries();
    this.persistedPlayerSummaryCachePromise = cachePromise;
    try {
      const entries = await cachePromise;
      if (
        this.persistedPlayerSummaryCacheGeneration === cacheGeneration
        && this.persistedPlayerSummaryCachePromise === cachePromise
      ) {
        this.persistedPlayerSummaryCache = entries;
        this.persistedPlayerSummaryCacheExpiresAt = Date.now() + GM_PERSISTED_PLAYER_SUMMARY_CACHE_TTL_MS;
      }
      return entries.slice();
    } catch (error) {
      if (isRetryableGmSummaryDatabaseError(error) && this.persistedPlayerSummaryCache) {
        this.logger.warn(`GM 持久玩家摘要读取遇到可重试数据库错误，返回上一份缓存：${formatDatabaseErrorForLog(error)}`);
        return this.persistedPlayerSummaryCache.slice();
      }
      throw error;
    } finally {
      if (this.persistedPlayerSummaryCachePromise === cachePromise) {
        this.persistedPlayerSummaryCachePromise = null;
      }
    }
  }

  private async loadPersistedPlayerSummaries(): Promise<GmPersistedPlayerSummaryEntry[]> {
    const pool = this.databasePoolProvider.getPool('gm-state-summary');
    if (!pool) {
      return [];
    }

    const result = await queryGmPersistedPlayerSummaryRowsWithRetry(async () => pool.query<GmPersistedPlayerSummaryRow>(`
        SELECT
          rw.player_id,
          COALESCE(auth.player_no, ident.player_no) AS player_no,
          COALESCE(auth.username, ident.username) AS username,
          auth.created_at,
          auth.register_ip,
          auth.last_login_ip,
          auth.last_login_at,
          auth.register_device_id,
          auth.last_login_device_id,
          auth.banned_at,
          COALESCE(auth.pending_role_name, ident.player_name, rw.player_id) AS role_name,
          COALESCE(auth.display_name, ident.display_name, auth.pending_role_name, ident.player_name, rw.player_id) AS display_name,
          COALESCE(auth.user_id, ident.user_id) AS user_id,
          COALESCE(
            anchor.last_safe_template_id,
            CASE
              WHEN position.instance_id LIKE 'public:%' THEN substring(position.instance_id from 8)
              WHEN position.instance_id LIKE 'real:%' THEN substring(position.instance_id from 6)
              ELSE NULLIF(position.instance_id, '')
            END,
            'yunlai_town'
          ) AS map_id,
          COALESCE(position.x, 0) AS x,
          COALESCE(position.y, 0) AS y,
          COALESCE(vitals.hp, 1) AS hp,
          COALESCE(vitals.max_hp, 1) AS max_hp,
          COALESCE(vitals.qi, 0) AS qi,
          CASE
            WHEN (attrs.realm_payload #>> '{realmLv}') ~ '^-?[0-9]+$' THEN (attrs.realm_payload #>> '{realmLv}')::bigint
            ELSE 1
          END AS realm_lv,
          COALESCE(attrs.realm_payload #>> '{displayName}', attrs.realm_payload #>> '{name}', '凡胎') AS realm_label,
          COALESCE(combat.auto_battle, false) AS auto_battle,
          COALESCE(combat.auto_battle_stationary, false) AS auto_battle_stationary,
          COALESCE(combat.auto_retaliate, true) AS auto_retaliate,
          COALESCE(presence.online, false) AS online,
          COALESCE(presence.in_world, position.player_id IS NOT NULL) AS in_world,
          (EXTRACT(EPOCH FROM rw.updated_at) * 1000)::bigint AS updated_at_ms
        FROM player_recovery_watermark rw
        LEFT JOIN server_player_auth auth ON auth.player_id = rw.player_id
        LEFT JOIN server_player_identity ident ON ident.player_id = rw.player_id
        LEFT JOIN player_world_anchor anchor ON anchor.player_id = rw.player_id
        LEFT JOIN player_position_checkpoint position ON position.player_id = rw.player_id
        LEFT JOIN player_vitals vitals ON vitals.player_id = rw.player_id
        LEFT JOIN player_attr_state attrs ON attrs.player_id = rw.player_id
        LEFT JOIN player_combat_preferences combat ON combat.player_id = rw.player_id
        LEFT JOIN player_presence presence ON presence.player_id = rw.player_id
        ORDER BY rw.player_id ASC
      `), (error, attempt, maxAttempts) => {
        this.logger.warn(`GM 持久玩家摘要读取遇到可重试数据库错误，准备重试 ${attempt}/${maxAttempts}：${formatDatabaseErrorForLog(error)}`);
      });

    return Promise.all(result.rows.map((row) => this.toManagedPlayerSummaryEntryFromSummaryRow(row)));
  }

  private async toManagedPlayerSummaryEntryFromSummaryRow(row: GmPersistedPlayerSummaryRow): Promise<GmPersistedPlayerSummaryEntry> {
    const playerId = normalizeDisplayString(row.player_id) || 'unknown-player';
    const playerNo = normalizeOptionalPlayerNo(row.player_no);
    const roleName = normalizeDisplayString(row.role_name) || playerId;
    const displayName = normalizeDisplayString(row.display_name) || roleName;
    const mapId = normalizeDisplayString(row.map_id) || 'yunlai_town';
    const meta = {
      userId: normalizeDisplayString(row.user_id) || undefined,
      isBot: isNativeGmBotPlayerId(playerId),
      online: row.online === true,
      inWorld: row.in_world === true,
      updatedAt: normalizeInteger(row.updated_at_ms, 0) > 0
        ? new Date(normalizeInteger(row.updated_at_ms, 0)).toISOString()
        : undefined,
      dirtyFlags: [],
    };
    const account = {
      userId: meta.userId,
      username: normalizeDisplayString(row.username) || undefined,
      createdAt: normalizeDateString(row.created_at),
      registerIp: normalizeDisplayString(row.register_ip) || undefined,
      lastLoginIp: normalizeDisplayString(row.last_login_ip) || undefined,
      lastLoginAt: normalizeDateString(row.last_login_at),
      registerDeviceId: normalizeDisplayString(row.register_device_id) || undefined,
      lastLoginDeviceId: normalizeDisplayString(row.last_login_device_id) || undefined,
      bannedAt: normalizeDateString(row.banned_at),
      isRiskAdmin: false,
    };
    const riskView = buildCheapGmPlayerRiskView(account, { meta });

    return {
      account,
      summary: {
      id: playerId,
      playerNo,
      name: roleName,
      roleName,
      displayName,
      accountName: normalizeDisplayString(row.username) || undefined,
      mapId,
      mapName: this.resolveMapName(mapId),
      realmLv: normalizeInteger(row.realm_lv, 1),
      realmLabel: normalizeDisplayString(row.realm_label) || '凡胎',
      x: normalizeInteger(row.x, 0),
      y: normalizeInteger(row.y, 0),
      hp: normalizeInteger(row.hp, 1),
      maxHp: normalizeInteger(row.max_hp, 1),
      qi: normalizeInteger(row.qi, 0),
      dead: normalizeInteger(row.hp, 1) <= 0,
      autoBattle: row.auto_battle === true,
      autoBattleStationary: row.auto_battle_stationary === true,
      autoRetaliate: row.auto_retaliate !== false,
      accountStatus: riskView.accountStatus,
      riskScore: riskView.riskScore,
      riskLevel: riskView.riskLevel,
      riskTags: riskView.riskTags,
      isRiskAdmin: riskView.isRiskAdmin,
      meta,
      },
    };
  }

  private async enrichSearchEntries(
    entries: GmPlayerSearchEntry[],
  ): Promise<GmPlayerSearchEntry[]> {
    return mapWithConcurrency(entries, GM_PLAYER_RISK_ENRICH_CONCURRENCY, async (entry) => {
      const summary = await this.enrichPlayerWithRisk(entry.summary, entry.account);
      return this.toPlayerSearchEntry(summary, entry.account);
    });
  }

  private async enrichPlayerWithRisk(
    player: GmManagedPlayerSummary,
    account: ManagedAccountEntryLike | null,
  ): Promise<GmManagedPlayerSummary> {
    const riskView = await buildNativeGmPlayerRiskView(account, {
      id: player.id,
      name: player.roleName,
      autoBattle: player.autoBattle,
      autoBattleStationary: player.autoBattleStationary,
      autoRetaliate: player.autoRetaliate,
      meta: player.meta,
    }, { pool: this.databasePoolProvider.getPool('gm-risk') });

    return {
      ...player,
      accountStatus: riskView.accountStatus,
      riskScore: riskView.riskScore,
      riskLevel: riskView.riskLevel,
      riskTags: riskView.riskTags,
      isRiskAdmin: riskView.isRiskAdmin,
    };
  }
  /**
 * buildPerformanceSnapshot：构建并返回目标对象。
 * @param timers PerformanceTimerState 参数说明。
 * @returns 无返回值，直接更新Performance快照相关状态。
 */


  private buildPerformanceSnapshot(timers: PerformanceTimerState, options?: { includeMemoryEstimate?: boolean }) {
    const perf: any = this.runtimeGmStateService.buildPerformanceSnapshot({
      includeMemoryEstimate: options?.includeMemoryEstimate === true,
    });
    const now = Date.now();
    const sharedGmStatePerf: any = this.runtimeGmStateService.buildSharedGmStatePerf();

    return {
      ...perf,
      cpu: {
        ...perf.cpu,
        profileStartedAt: timers.cpuPerfStartedAt,
        profileElapsedSec: roundMetric(Math.max(0, (now - timers.cpuPerfStartedAt) / 1000)),
      },
      pathfinding: {
        ...perf.pathfinding,
        ...sharedGmStatePerf,
        statsStartedAt: timers.pathfindingPerfStartedAt,
        statsElapsedSec: roundMetric(Math.max(0, (now - timers.pathfindingPerfStartedAt) / 1000)),
      },
      networkStatsStartedAt: timers.networkPerfStartedAt,
      networkStatsElapsedSec: roundMetric(Math.max(0, (now - timers.networkPerfStartedAt) / 1000)),
    };
  }  
  /**
 * toManagedPlayerSummary：执行toManaged玩家摘要相关逻辑。
 * @param snapshot 参数说明。
 * @param account 参数说明。
 * @returns 无返回值，直接更新toManaged玩家摘要相关状态。
 */


  private toManagedPlayerSummary(snapshot, account = null) {
    const playerId = typeof snapshot.playerId === 'string' ? snapshot.playerId : 'unknown-player';
    const playerNameSource = {
      id: playerId,
      name: snapshot.name,
      displayName: snapshot.displayName,
    };
    const roleName = resolveManagedPlayerName(playerNameSource, account, playerId);
    const displayName = resolveManagedPlayerDisplayName(playerNameSource, account, roleName);
    const meta = {
      userId: account?.userId,
      isBot: isNativeGmBotPlayerId(playerId),
      online: typeof snapshot.sessionId === 'string' && snapshot.sessionId.length > 0,
      inWorld: typeof snapshot.instanceId === 'string' && snapshot.instanceId.length > 0,
      dirtyFlags: snapshot.persistentRevision > snapshot.persistedRevision ? ['persistence'] : [],
    };
    const riskView = buildCheapGmPlayerRiskView(account, { meta });
    const mapId = typeof snapshot.templateId === 'string' && snapshot.templateId.trim()
      ? snapshot.templateId.trim()
      : 'yunlai_town';
    const hp = normalizeInteger(snapshot.hp, 1);

    return {
      id: playerId,
      playerNo: account?.playerNo ?? null,
      name: roleName,
      roleName,
      displayName,
      accountName: account?.username,
      mapId,
      mapName: this.resolveMapName(mapId),
      realmLv: normalizeInteger(snapshot.realm?.realmLv, 1),
      realmLabel: snapshot.realm?.displayName ?? snapshot.realm?.name ?? '凡胎',
      x: normalizeInteger(snapshot.x, 0),
      y: normalizeInteger(snapshot.y, 0),
      hp,
      maxHp: normalizeInteger(snapshot.maxHp, 1),
      qi: normalizeInteger(snapshot.qi, 0),
      dead: hp <= 0,
      autoBattle: snapshot.combat?.autoBattle === true,
      autoBattleStationary: snapshot.combat?.autoBattleStationary === true,
      autoRetaliate: snapshot.combat?.autoRetaliate !== false,
      accountStatus: riskView.accountStatus,
      riskScore: riskView.riskScore,
      riskLevel: riskView.riskLevel,
      riskTags: riskView.riskTags,
      isRiskAdmin: riskView.isRiskAdmin,
      meta,
    };
  }  
  /**
 * toManagedPlayerSummaryFromPersistence：判断toManaged玩家摘要FromPersistence是否满足条件。
 * @param playerId 玩家 ID。
 * @param snapshot 参数说明。
 * @param updatedAt 参数说明。
 * @param account 参数说明。
 * @returns 无返回值，直接更新toManaged玩家摘要FromPersistence相关状态。
 */


  private async toManagedPlayerSummaryFromPersistence(playerId, snapshot, updatedAt, account = null, presence = null) {
    const player = this.toLegacyPlayerStateFromPersistence(playerId, snapshot);
    const roleName = resolveManagedPlayerName(player, account, playerId);
    const displayName = resolveManagedPlayerDisplayName(player, account, roleName);
    const meta = {
      userId: account?.userId,
      isBot: player.isBot === true,
      online: presence?.online === true,
      inWorld: presence?.inWorld === true,
      updatedAt: updatedAt > 0 ? new Date(updatedAt).toISOString() : undefined,
      dirtyFlags: [],
    };
    const riskView = await buildNativeGmPlayerRiskView(account, {
      id: player.id,
      name: roleName,
      autoBattle: player.autoBattle,
      autoBattleStationary: player.autoBattleStationary === true,
      autoRetaliate: player.autoRetaliate !== false,
      meta,
    }, { pool: this.databasePoolProvider.getPool('gm-risk') });

    return {
      id: player.id,
      name: roleName,
      roleName,
      displayName,
      accountName: account?.username,
      mapId: player.mapId,
      mapName: this.resolveMapName(player.mapId),
      realmLv: player.realmLv ?? 1,
      realmLabel: player.realm?.displayName ?? player.realmName ?? '凡胎',
      x: player.x,
      y: player.y,
      hp: player.hp,
      maxHp: player.maxHp,
      qi: player.qi,
      dead: player.dead,
      autoBattle: player.autoBattle,
      autoBattleStationary: player.autoBattleStationary === true,
      autoRetaliate: player.autoRetaliate !== false,
      accountStatus: riskView.accountStatus,
      riskScore: riskView.riskScore,
      riskLevel: riskView.riskLevel,
      riskTags: riskView.riskTags,
      isRiskAdmin: riskView.isRiskAdmin,
      meta,
    };
  }  
  /**
 * toLegacyPlayerState：执行toLegacy玩家状态相关逻辑。
 * @param snapshot 参数说明。
 * @returns 返回toLegacy玩家状态。
 */


  private toLegacyPlayerState(snapshot): any {
    return {
      id: snapshot.playerId,
      name: snapshot.name,
      displayName: snapshot.displayName,
      isBot: isNativeGmBotPlayerId(snapshot.playerId),
      online: typeof snapshot.sessionId === 'string' && snapshot.sessionId.length > 0,
      inWorld: typeof snapshot.instanceId === 'string' && snapshot.instanceId.length > 0,
      senseQiActive: snapshot.combat.senseQiActive === true,
      autoRetaliate: snapshot.combat.autoRetaliate !== false,
      autoBattleStationary: snapshot.combat.autoBattleStationary === true,
      allowAoePlayerHit: snapshot.combat.allowAoePlayerHit === true,
      autoIdleCultivation: snapshot.combat.autoIdleCultivation !== false,
      autoSwitchCultivation: snapshot.combat.autoSwitchCultivation === true,
      cultivationActive: snapshot.combat.cultivationActive === true,
      realmLv: snapshot.realm?.realmLv ?? 1,
      realmName: snapshot.realm?.displayName ?? snapshot.realm?.name ?? '凡胎',
      realmStage: typeof snapshot.realm?.stage === 'string' ? snapshot.realm.stage : undefined,
      realmReview: snapshot.realm?.review,
      breakthroughReady: snapshot.realm?.breakthroughReady === true,
      heavenGate: snapshot.heavenGate,
      spiritualRoots: snapshot.spiritualRoots,
      boneAgeBaseYears: snapshot.boneAgeBaseYears,
      lifeElapsedTicks: snapshot.lifeElapsedTicks,
      lifespanYears: snapshot.lifespanYears,
      mapId: snapshot.templateId,
      x: snapshot.x,
      y: snapshot.y,
      facing: snapshot.facing,
      viewRange: Math.max(1, Math.round(snapshot.attrs.numericStats.viewRange)),
      hp: snapshot.hp,
      maxHp: snapshot.maxHp,
      qi: snapshot.qi,
      dead: snapshot.hp <= 0,
      foundation: snapshot.foundation,
      combatExp: snapshot.combatExp,
      comprehension: snapshot.comprehension ?? 0,
      luck: snapshot.luck ?? 0,
      baseAttrs: normalizeRawBaseAttrs(snapshot.attrs.rawBaseAttrs),
      bonuses: [],
      temporaryBuffs: snapshot.buffs.buffs.map((entry) => materializeRuntimeTemporaryBuff(entry)),
      finalAttrs: { ...snapshot.attrs.finalAttrs },
      numericStats: { ...snapshot.attrs.numericStats },
      ratioDivisors: cloneRatioDivisors(snapshot.attrs.ratioDivisors),
      inventory: {
        capacity: snapshot.inventory.capacity,
        items: snapshot.inventory.items.map((entry) => ({ ...entry })),
      },
      equipment: toLegacyEquipmentSlots(snapshot.equipment.slots),
      artifacts: toLegacyArtifactSlots(snapshot.artifacts),
      techniques: snapshot.techniques.techniques.map((entry) => ({ ...entry })),
      actions: snapshot.actions.actions.map((entry) => ({ ...entry })),
      quests: snapshot.quests.quests.map((entry) => ({
        ...entry,
        rewardItemIds: Array.isArray(entry.rewardItemIds) ? entry.rewardItemIds.slice() : [],
        rewards: Array.isArray(entry.rewards) ? entry.rewards.map((reward) => ({ ...reward })) : [],
      })),
      autoBattle: snapshot.combat.autoBattle === true,
      autoBattleSkills: snapshot.combat.autoBattleSkills.map((entry) => ({ ...entry })),
      combatTargetId: snapshot.combat.combatTargetId ?? undefined,
      combatTargetLocked: snapshot.combat.combatTargetLocked === true,
      cultivatingTechId: snapshot.techniques.cultivatingTechId ?? undefined,
      pendingLogbookMessages: Array.isArray(snapshot.pendingLogbookMessages)
        ? snapshot.pendingLogbookMessages.map((entry) => ({ ...entry }))
        : [],
      realm: snapshot.realm
        ? {
            ...snapshot.realm,
            heavenGate: snapshot.realm.heavenGate ? { ...snapshot.realm.heavenGate } : snapshot.realm.heavenGate,
            breakthrough: snapshot.realm.breakthrough
              ? {
                  ...snapshot.realm.breakthrough,
                  requiredItems: Array.isArray(snapshot.realm.breakthrough.requiredItems)
                    ? snapshot.realm.breakthrough.requiredItems.map((entry) => ({ ...entry }))
                    : [],
                }
              : snapshot.realm.breakthrough,
          }
        : undefined,
    };
  }  
  /**
 * toLegacyPlayerStateFromPersistence：判断toLegacy玩家状态FromPersistence是否满足条件。
 * @param playerId 玩家 ID。
 * @param snapshot 参数说明。
 * @returns 返回toLegacy玩家状态FromPersistence。
 */


  private toLegacyPlayerStateFromPersistence(playerId, snapshot): any {
    const realm = this.playerProgressionService.createRealmStateFromLevel(
      snapshot.progression?.realm?.realmLv ?? 1,
      snapshot.progression?.realm?.progress ?? 0,
    );

    return {
      id: playerId,
      name: snapshot.name,
      displayName: snapshot.displayName,
      isBot: isNativeGmBotPlayerId(playerId),
      mapId: snapshot.placement.templateId,
      x: snapshot.placement.x,
      y: snapshot.placement.y,
      facing: snapshot.placement.facing,
      viewRange: VIEW_RADIUS,
      hp: snapshot.vitals.hp,
      maxHp: snapshot.vitals.maxHp,
      qi: snapshot.vitals.qi,
      dead: snapshot.vitals.hp <= 0,
      autoBattle: snapshot.combat.autoBattle === true,
      autoRetaliate: snapshot.combat.autoRetaliate !== false,
      autoBattleStationary: snapshot.combat.autoBattleStationary === true,
      allowAoePlayerHit: snapshot.combat.allowAoePlayerHit === true,
      autoIdleCultivation: snapshot.combat.autoIdleCultivation !== false,
      autoSwitchCultivation: snapshot.combat.autoSwitchCultivation === true,
      senseQiActive: snapshot.combat.senseQiActive === true,
      realmLv: realm.realmLv,
      realmName: realm.displayName,
      realmStage: realm.stage,
      realmReview: realm.review,
      breakthroughReady: realm.breakthroughReady,
      heavenGate: snapshot.progression.heavenGate ?? null,
      spiritualRoots: snapshot.progression.spiritualRoots ?? null,
      boneAgeBaseYears: snapshot.progression.boneAgeBaseYears,
      lifeElapsedTicks: snapshot.progression.lifeElapsedTicks,
      lifespanYears: snapshot.progression.lifespanYears,
      foundation: snapshot.progression.foundation,
      combatExp: snapshot.progression.combatExp,
      comprehension: snapshot.progression.comprehension ?? 0,
      luck: snapshot.progression.luck ?? 0,
      baseAttrs: decodePersistedRawBaseAttrs(snapshot.attrState?.baseAttrs),
      bonuses: [],
      temporaryBuffs: snapshot.buffs.buffs.map((entry) => materializeRuntimeTemporaryBuff(entry)),
      inventory: {
        capacity: snapshot.inventory.capacity,
        items: Array.isArray(snapshot.inventory.items) ? snapshot.inventory.items.map((entry) => ({ ...entry })) : [],
      },
      equipment: toLegacyEquipmentSlots(snapshot.equipment.slots),
      artifacts: toLegacyArtifactSlots(snapshot.artifacts),
      techniques: Array.isArray(snapshot.techniques.techniques)
        ? snapshot.techniques.techniques.map((entry) => ({ ...entry }))
        : [],
      actions: [],
      quests: Array.isArray(snapshot.quests.entries) ? snapshot.quests.entries.map((entry) => ({ ...entry })) : [],
      autoBattleSkills: Array.isArray(snapshot.combat.autoBattleSkills)
        ? snapshot.combat.autoBattleSkills.map((entry) => ({ ...entry }))
        : [],
      combatTargetId: snapshot.combat.combatTargetId ?? undefined,
      combatTargetLocked: snapshot.combat.combatTargetLocked === true,
      cultivatingTechId: snapshot.techniques.cultivatingTechId ?? undefined,
      pendingLogbookMessages: Array.isArray(snapshot.pendingLogbookMessages)
        ? snapshot.pendingLogbookMessages.map((entry) => ({ ...entry }))
        : [],
      realm,
    };
  }  
  /**
 * resolveMapName：规范化或转换地图名称。
 * @param mapId string 地图 ID。
 * @returns 无返回值，直接更新地图名称相关状态。
 */


  private resolveMapName(mapId: string) {
    try {
      return this.mapTemplateRepository.getOrThrow(mapId).name;
    } catch {
      return mapId;
    }
  }
}
/**
 * compareManagedPlayerSummary：执行compareManaged玩家摘要相关逻辑。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，直接更新compareManaged玩家摘要相关状态。
 */


function compareManagedPlayerSummary(left, right, sort: GmPlayerSortMode = 'online') {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const botCompare = compareBotPriority(left, right);
  if (botCompare !== 0) {
    return botCompare;
  }

  switch (sort) {
    case 'realm-desc': {
      const realmCompare = compareRealm(left, right, 'desc');
      if (realmCompare !== 0) {
        return realmCompare;
      }
      const onlineCompare = compareOnlinePriority(left, right);
      if (onlineCompare !== 0) {
        return onlineCompare;
      }
      break;
    }
    case 'realm-asc': {
      const realmCompare = compareRealm(left, right, 'asc');
      if (realmCompare !== 0) {
        return realmCompare;
      }
      const onlineCompare = compareOnlinePriority(left, right);
      if (onlineCompare !== 0) {
        return onlineCompare;
      }
      break;
    }
    case 'map': {
      const mapCompare = compareMap(left, right);
      if (mapCompare !== 0) {
        return mapCompare;
      }
      break;
    }
    case 'name': {
      const nameCompare = compareName(left, right);
      if (nameCompare !== 0) {
        return nameCompare;
      }
      const onlineCompare = compareOnlinePriority(left, right);
      if (onlineCompare !== 0) {
        return onlineCompare;
      }
      break;
    }
    case 'risk-desc': {
      const riskCompare = compareRisk(left, right, 'desc');
      if (riskCompare !== 0) {
        return riskCompare;
      }
      const onlineCompare = compareOnlinePriority(left, right);
      if (onlineCompare !== 0) {
        return onlineCompare;
      }
      break;
    }
    case 'risk-asc': {
      const riskCompare = compareRisk(left, right, 'asc');
      if (riskCompare !== 0) {
        return riskCompare;
      }
      const onlineCompare = compareOnlinePriority(left, right);
      if (onlineCompare !== 0) {
        return onlineCompare;
      }
      break;
    }
    case 'online':
    default: {
      const onlineCompare = compareOnlinePriority(left, right);
      if (onlineCompare !== 0) {
        return onlineCompare;
      }
      const realmCompare = compareRealm(left, right, 'desc');
      if (realmCompare !== 0) {
        return realmCompare;
      }
      const mapCompare = compareMap(left, right);
      if (mapCompare !== 0) {
        return mapCompare;
      }
      break;
    }
  }

  return compareName(left, right);
}

function normalizeGmListPlayersQuery(query: GmListPlayersQuery | undefined): NormalizedGmListPlayersQuery {
  const keyword = typeof query?.keyword === 'string' ? query.keyword.trim() : '';

  return {
    page: sanitizePositiveInteger(query?.page, 1),
    pageSize: Math.min(MAX_GM_PAGE_SIZE, sanitizePositiveInteger(query?.pageSize, DEFAULT_GM_PAGE_SIZE)),
    keyword,
    keywordNeedle: keyword.toLocaleLowerCase('zh-Hans-CN'),
    sort: isGmPlayerSortMode(query?.sort) ? query.sort : 'realm-desc',
    accountStatus: isGmPlayerAccountStatusFilter(query?.accountStatus) ? query.accountStatus : 'all',
    includeMemoryEstimate: parseBooleanQueryFlag(query?.includeMemoryEstimate),
    includePlayers: parseBooleanQueryFlag(query?.includePlayers),
    refresh: parseBooleanQueryFlag(query?.refresh),
  };
}

function buildPlayerListViewCacheKey(query: NormalizedGmListPlayersQuery): string {
  return [
    query.page,
    query.pageSize,
    query.keyword,
    query.sort,
    query.accountStatus,
  ].join('|');
}

function buildPlayerSearchText(player: GmManagedPlayerSummary): string {
  return [
    player.id,
    formatPlayerNo(player.playerNo),
    player.name,
    player.roleName,
    player.displayName,
    player.accountName,
    player.mapId,
    player.mapName,
    player.realmLabel,
    player.accountStatus,
    player.riskLevel,
    ...player.riskTags,
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join('\n')
    .toLocaleLowerCase('zh-Hans-CN');
}

function shouldUseFullRiskPlayerSearch(query: NormalizedGmListPlayersQuery): boolean {
  if (query.sort === 'risk-desc' || query.sort === 'risk-asc') {
    return true;
  }
  return GM_PLAYER_RISK_SEARCH_KEYWORDS.some((keyword) => query.keywordNeedle.includes(keyword));
}

function parseBooleanQueryFlag(value: unknown): boolean {
  if (value === true) {
    return true;
  }
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function filterPlayerSearchEntries(
  entries: GmPlayerSearchEntry[],
  keywordNeedle: string,
  accountStatus: GmPlayerAccountStatusFilter,
): GmPlayerSearchEntry[] {
  return entries.filter((entry) => {
    const player = entry.summary;
    if (accountStatus !== 'all' && player.accountStatus !== accountStatus) {
      return false;
    }
    if (!keywordNeedle) {
      return true;
    }
    return entry.searchText.includes(keywordNeedle);
  });
}

function sortPlayerSearchEntries(entries: GmPlayerSearchEntry[], sort: GmPlayerSortMode): GmPlayerSearchEntry[] {
  return [...entries].sort((left, right) => compareManagedPlayerSummary(left.summary, right.summary, sort));
}

function buildPlayerPage(query: NormalizedGmListPlayersQuery, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, totalPages);

  return {
    page,
    pageSize: query.pageSize,
    total,
    totalPages,
    keyword: query.keyword,
    sort: query.sort,
    accountStatus: query.accountStatus,
  };
}

function slicePlayerSearchEntries(entries: GmPlayerSearchEntry[], page: number, pageSize: number): GmPlayerSearchEntry[] {
  const start = (page - 1) * pageSize;
  return entries.slice(start, start + pageSize);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const workerCount = Math.max(1, Math.min(Math.trunc(concurrency), items.length));
  let nextIndex = 0;

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }));

  return results;
}

function buildPlayerSearchStats(entries: GmPlayerSearchEntry[]) {
  let onlinePlayers = 0;
  let offlineHangingPlayers = 0;

  for (const entry of entries) {
    const player = entry.summary;
    if (player.meta.online) {
      onlinePlayers += 1;
      continue;
    }
    if (player.meta.inWorld) {
      offlineHangingPlayers += 1;
    }
  }

  return {
    totalPlayers: entries.length,
    onlinePlayers,
    offlineHangingPlayers,
    offlinePlayers: Math.max(0, entries.length - onlinePlayers - offlineHangingPlayers),
  };
}

function sanitizePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.trunc(value));
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(1, parsed);
    }
  }
  return fallback;
}

function normalizeOptionalPlayerNo(value: unknown): number | null {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'bigint'
      ? Number(value)
      : typeof value === 'string' && value.trim()
        ? Number(value.trim())
        : NaN;
  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    return null;
  }
  return Math.trunc(numeric);
}

function formatPlayerNo(playerNo: number | null | undefined): string {
  return typeof playerNo === 'number' && Number.isSafeInteger(playerNo) && playerNo > 0
    ? String(playerNo)
    : '';
}

function normalizeInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === 'bigint' ? Number(value) : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.trunc(parsed);
}

function isGmPlayerSortMode(value: unknown): value is GmPlayerSortMode {
  return value === 'realm-desc'
    || value === 'realm-asc'
    || value === 'online'
    || value === 'map'
    || value === 'name'
    || value === 'risk-desc'
    || value === 'risk-asc';
}

function isGmPlayerAccountStatusFilter(value: unknown): value is GmPlayerAccountStatusFilter {
  return value === 'all'
    || value === 'normal'
    || value === 'banned'
    || value === 'abnormal';
}

function buildCheapGmPlayerRiskView(
  account: ManagedAccountEntryLike | null | undefined,
  player: { meta?: { isBot?: boolean | null } | null },
) {
  if (player.meta?.isBot === true) {
    return {
      accountStatus: 'normal' as const,
      riskScore: 0,
      riskLevel: 'low' as const,
      riskTags: [],
      isRiskAdmin: account?.isRiskAdmin === true,
    };
  }
  if (!account || !normalizeDisplayString(account.userId) || !normalizeDisplayString(account.username)) {
    return {
      accountStatus: 'abnormal' as const,
      riskScore: 20,
      riskLevel: 'medium' as const,
      riskTags: ['账号完整性'],
      isRiskAdmin: account?.isRiskAdmin === true,
    };
  }
  if (normalizeDisplayString(account.bannedAt)) {
    return {
      accountStatus: 'banned' as const,
      riskScore: 0,
      riskLevel: 'low' as const,
      riskTags: [],
      isRiskAdmin: account.isRiskAdmin === true,
    };
  }
  return {
    accountStatus: 'normal' as const,
    riskScore: 0,
    riskLevel: 'low' as const,
    riskTags: [],
    isRiskAdmin: account.isRiskAdmin === true,
  };
}

function compareBotPriority(left, right) {
  if (left.meta.isBot !== right.meta.isBot) {
    return left.meta.isBot ? 1 : -1;
  }
  return 0;
}

function compareOnlinePriority(left, right) {
  if (left.meta.online !== right.meta.online) {
    return left.meta.online ? -1 : 1;
  }
  return 0;
}

function compareRealm(left, right, direction: 'asc' | 'desc') {
  const diff = direction === 'asc'
    ? left.realmLv - right.realmLv
    : right.realmLv - left.realmLv;
  if (diff !== 0) {
    return diff;
  }
  return left.realmLabel.localeCompare(right.realmLabel, 'zh-Hans-CN');
}

function compareMap(left, right) {
  if (left.mapName !== right.mapName) {
    return left.mapName.localeCompare(right.mapName, 'zh-Hans-CN');
  }
  if (left.mapId !== right.mapId) {
    return left.mapId.localeCompare(right.mapId, 'zh-Hans-CN');
  }
  return 0;
}

function compareRisk(left, right, direction: 'asc' | 'desc') {
  const leftRisk = Number.isFinite(left.riskScore) ? left.riskScore : 0;
  const rightRisk = Number.isFinite(right.riskScore) ? right.riskScore : 0;
  const diff = direction === 'asc' ? leftRisk - rightRisk : rightRisk - leftRisk;
  if (diff !== 0) {
    return diff;
  }
  return compareRealm(left, right, 'desc');
}

function compareName(left, right) {
  const roleCompare = left.roleName.localeCompare(right.roleName, 'zh-Hans-CN');
  if (roleCompare !== 0) {
    return roleCompare;
  }
  return left.id.localeCompare(right.id, 'zh-Hans-CN');
}

function resolveManagedPlayerName(player, account, fallback: string): string {
  return normalizeDisplayString(account?.playerName)
    || normalizeDisplayString(player?.name)
    || normalizeDisplayString(account?.displayName)
    || normalizeDisplayString(account?.username)
    || fallback;
}

function resolveManagedPlayerDisplayName(player, account, fallback: string): string {
  return normalizeDisplayString(account?.displayName)
    || normalizeDisplayString(player?.displayName)
    || normalizeDisplayString(account?.playerName)
    || fallback;
}

function normalizeDisplayString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDateString(value: unknown): string | undefined {
  if (value instanceof Date) {
    return value.toISOString();
  }
  const text = normalizeDisplayString(value);
  return text.length > 0 ? text : undefined;
}

async function queryGmPersistedPlayerSummaryRowsWithRetry<T>(
  query: () => Promise<T>,
  onRetry: (error: unknown, attempt: number, maxAttempts: number) => void,
): Promise<T> {
  for (let attempt = 1; attempt <= GM_PERSISTED_PLAYER_SUMMARY_QUERY_ATTEMPTS; attempt += 1) {
    try {
      return await query();
    } catch (error) {
      if (!isRetryableGmSummaryDatabaseError(error) || attempt >= GM_PERSISTED_PLAYER_SUMMARY_QUERY_ATTEMPTS) {
        throw error;
      }
      onRetry(error, attempt, GM_PERSISTED_PLAYER_SUMMARY_QUERY_ATTEMPTS);
      await delayGmPersistedPlayerSummaryRetry(attempt);
    }
  }
  throw new Error('unreachable GM persisted player summary retry state');
}

function isRetryableGmSummaryDatabaseError(error: unknown): boolean {
  return RETRYABLE_GM_SUMMARY_DATABASE_ERROR_CODES.has(readDatabaseErrorCode(error));
}

function readDatabaseErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return '';
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : '';
}

function formatDatabaseErrorForLog(error: unknown): string {
  const code = readDatabaseErrorCode(error);
  const message = error instanceof Error ? error.message : String(error);
  return code ? `${code} ${message}` : message;
}

function delayGmPersistedPlayerSummaryRetry(attempt: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, GM_PERSISTED_PLAYER_SUMMARY_QUERY_RETRY_DELAY_MS * attempt);
  });
}
/**
 * roundMetric：执行roundMetric相关逻辑。
 * @param value 参数说明。
 * @returns 无返回值，直接更新roundMetric相关状态。
 */


function roundMetric(value) {
  return Math.round(value * 100) / 100;
}

function normalizeRawBaseAttrs(source) {
  const attrs = { ...DEFAULT_BASE_ATTRS };
  if (!source || typeof source !== 'object') {
    return attrs;
  }
  for (const key of Object.keys(DEFAULT_BASE_ATTRS)) {
    const value = Number(source[key]);
    if (Number.isFinite(value)) {
      attrs[key] = Math.max(0, Math.trunc(value));
    }
  }
  return attrs;
}

function decodePersistedRawBaseAttrs(source) {
  if (!source || typeof source !== 'object' || source[RAW_BASE_ATTRS_PERSISTENCE_MARKER] !== true) {
    return { ...DEFAULT_BASE_ATTRS };
  }
  return normalizeRawBaseAttrs(source);
}
/**
 * toLegacyEquipmentSlots：执行toLegacy装备Slot相关逻辑。
 * @param slots 参数说明。
 * @returns 无返回值，直接更新toLegacy装备Slot相关状态。
 */


function toLegacyEquipmentSlots(slots) {
  const bySlot = new Map((Array.isArray(slots) ? slots : []).map((entry) => [entry.slot, entry.item ? { ...entry.item } : null]));
  return Object.fromEntries(EQUIP_SLOTS.map((slot) => [slot, bySlot.get(slot) ?? null]));
}

function createEmptyLegacyArtifactSlot(slot) {
  return {
    slot,
    unlocked: false,
    enabled: false,
    qi: 0,
    maxQi: 0,
    item: null,
  };
}

function toLegacyArtifactSlots(artifacts) {
  const slots = Array.isArray(artifacts?.slots) ? artifacts.slots : [];
  const bySlot = new Map(slots.map((entry) => [entry.slot, entry]));
  return {
    revision: Number.isFinite(artifacts?.revision) ? Math.max(0, Math.trunc(artifacts.revision)) : 1,
    slots: ARTIFACT_SLOTS.map((slot) => {
      const entry = bySlot.get(slot);
      if (!entry || typeof entry !== 'object') {
        return createEmptyLegacyArtifactSlot(slot);
      }
      const record = entry as Record<string, any>;
      return {
        slot,
        unlocked: record.unlocked === true,
        enabled: record.enabled === true,
        qi: Number.isFinite(record.qi) ? Math.max(0, Math.trunc(record.qi)) : 0,
        maxQi: Number.isFinite(record.maxQi) ? Math.max(0, Math.trunc(record.maxQi)) : 0,
        item: record.item ? { ...record.item } : null,
      };
    }),
  };
}
/**
 * cloneRatioDivisors：判断RatioDivisor是否满足条件。
 * @param source 来源对象。
 * @returns 无返回值，直接更新RatioDivisor相关状态。
 */


function cloneRatioDivisors(source) {
  return {
    dodge: source.dodge,
    crit: source.crit,
    breakPower: source.breakPower,
    resolvePower: source.resolvePower,
    cooldownSpeed: source.cooldownSpeed,
    moveSpeed: source.moveSpeed,
    elementDamageReduce: source.elementDamageReduce ? { ...source.elementDamageReduce } : undefined,
  };
}

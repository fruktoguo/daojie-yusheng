/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Inject, Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import {
    ATTR_KEYS,
    LEADERBOARD_TECHNIQUE_KEYS,
    resolvePlayerFacingContentName,
} from '@mud/shared';
import { isNativeGmBotPlayerId } from '../../http/native/native-gm.constants';
import { NativePlayerAuthStoreService } from '../../http/native/native-player-auth-store.service';
import { MARKET_CURRENCY_ITEM_ID } from '../../constants/gameplay/market';
import { MarketRuntimeService } from '../market/market-runtime.service';
import { MapTemplateRepository } from '../map/map-template.repository';
import { PlayerRuntimeService } from './player-runtime.service';
import { resolvePlayerDisplayName } from './player-display-name';
import { PlayerDomainPersistenceService } from '../../persistence/player-domain-persistence.service';
import { PlayerIdentityPersistenceService } from '../../persistence/player-identity-persistence.service';
import { PlayerCountersPersistenceService } from '../../persistence/player-counters-persistence.service';
import { ActivityPersistenceService, type ActivityInvitationLeaderboardRow } from '../../persistence/activity-persistence.service';
import { LeaderboardWorkerPoolService } from '../../concurrency/leaderboard-worker-pool.service';
import { TreasureVaultRuntimeService } from '../building/treasure-vault-runtime.service';
import { MailPersistenceService } from '../../persistence/mail-persistence.service';
import {
    buildAllLeaderboards,
    buildAttributeBoards,
    buildBodyTrainingBoard,
    buildDeathBoard,
    buildMonsterKillBoard,
    buildPlayerKillBoard,
    buildRealmBoard,
    buildSpiritStoneBoard,
    buildTechniqueBoards,
    type LeaderboardFlatSnapshot,
} from './leaderboard-projection';
import type { LeaderboardBuildPayload, LeaderboardBuildResult } from '../../concurrency/worker-task.types';

/** 排行榜运行时：按运行态与持久化玩家快照聚合榜单与世界摘要，结果做短缓存。 */
const DEFAULT_LEADERBOARD_LIMIT = 10;

/** 排行榜最大返回条数。 */
const MAX_LEADERBOARD_LIMIT = 10;

/** 排行榜定时刷新间隔（10 分钟）。排行榜数据不需要实时，定时后台刷新即可。 */
const LEADERBOARD_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

/** 引渡榜固定只展示前三名。 */
const INVITATION_LEADERBOARD_LIMIT = 3;

/** 世界摘要缓存时间（30 秒）。摘要含在线人数等稍实时的数据，TTL 短一些。 */
const WORLD_SUMMARY_CACHE_TTL_MS = 30 * 1000;

@Injectable()
export class LeaderboardRuntimeService implements OnModuleDestroy {
    private readonly logger = new Logger(LeaderboardRuntimeService.name);
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    /**
 * marketRuntimeService：坊市运行态服务引用。
 */

    marketRuntimeService;
    /**
 * mapTemplateRepository：地图模板仓库，用于把地图 ID 转成展示名称。
 */

    mapTemplateRepository;
    /**
 * playerDomainPersistenceService：玩家分域持久化服务，用于低频榜单补读离线玩家。
 */

    playerDomainPersistenceService;
    /**
 * playerIdentityPersistenceService：玩家身份持久化服务，用于榜单展示角色名。
 */

    playerIdentityPersistenceService;
    playerCountersPersistenceService;
    /** 排行榜构建工作池。可选注入；不可用时回退主线程同步路径。 */
    private leaderboardWorkerPoolService: LeaderboardWorkerPoolService | null = null;
    /** 缓存后的排行榜结果。 */
    cachedLeaderboard = null;
    /** 排行榜缓存生成时的玩家位置索引，供击杀榜坐标追索复用。 */
    cachedLeaderboardSnapshotsByPlayerId = new Map();
    /** 缓存后的世界摘要。 */
    cachedWorldSummary = null;
    /** 后台定时刷新 timer。 */
    private _refreshTimer: ReturnType<typeof setInterval> | null = null;
    /** 是否正在刷新中（防止并发重入）。 */
    private _refreshing = false;
    /** 宗门服务引用，由首次 buildLeaderboard 调用时捕获。 */
    private _sectServiceRef: any = null;
    /** 注入玩家运行时和坊市运行时。 */
    constructor(
        @Inject(PlayerRuntimeService) playerRuntimeService: any,
        @Inject(MarketRuntimeService) marketRuntimeService: any,
        @Inject(MapTemplateRepository) mapTemplateRepository: any,
        @Inject(PlayerDomainPersistenceService) playerDomainPersistenceService: any,
        @Inject(PlayerIdentityPersistenceService) playerIdentityPersistenceService: any,
        @Inject(PlayerCountersPersistenceService) playerCountersPersistenceService: any = null,
        @Optional() @Inject(LeaderboardWorkerPoolService) leaderboardWorkerPoolService: LeaderboardWorkerPoolService | null = null,
        @Optional() @Inject(NativePlayerAuthStoreService) private readonly nativePlayerAuthStoreService: NativePlayerAuthStoreService | null = null,
        @Optional() @Inject(ActivityPersistenceService) private readonly activityPersistenceService: ActivityPersistenceService | null = null,
        @Optional() @Inject(TreasureVaultRuntimeService) private readonly treasureVaultRuntimeService: TreasureVaultRuntimeService | null = null,
        @Optional() @Inject(MailPersistenceService) private readonly mailPersistenceService: MailPersistenceService | null = null,
    ) {
        this.playerRuntimeService = playerRuntimeService;
        this.marketRuntimeService = marketRuntimeService;
        this.mapTemplateRepository = mapTemplateRepository;
        this.playerDomainPersistenceService = playerDomainPersistenceService;
        this.playerIdentityPersistenceService = playerIdentityPersistenceService;
        this.playerCountersPersistenceService = playerCountersPersistenceService;
        this.leaderboardWorkerPoolService = leaderboardWorkerPoolService;
    }
    /** 外部运营状态变化后主动清空排行榜与世界摘要缓存，避免旧数据继续展示。 */
    invalidateCaches() {
        this.cachedLeaderboard = null;
        this.cachedLeaderboardSnapshotsByPlayerId = new Map();
        this.cachedWorldSummary = null;
    }
    /** 构造各榜单快照，按需截断返回。 */
    async buildLeaderboard(limit, sectService = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const effectiveLimit = clampLeaderboardLimit(limit);

        // 捕获 sectService 引用并启动后台定时刷新
        if (sectService && !this._sectServiceRef) {
            this._sectServiceRef = sectService;
        }
        if (!this._refreshTimer) {
            this.startBackgroundRefresh();
        }

        // 有缓存直接返回，不再同步重算
        const cached = this.cachedLeaderboard;
        if (cached) {
            return this.sliceLeaderboard(cached, effectiveLimit);
        }

        // 首次请求时同步计算一次（后续由定时器刷新）
        await this.refreshLeaderboardCache();
        return this.sliceLeaderboard(this.cachedLeaderboard ?? {
            generatedAt: Date.now(),
            limit: 0,
            boards: {
                ...buildAllLeaderboards([], [], 0),
                invitation: createEmptyInvitationBoard(),
            },
        }, effectiveLimit);
    }
    /**
     * 启动后台定时刷新。首次请求时自动触发，之后每 10 分钟刷新。
     */
    startBackgroundRefresh() {
        if (this._refreshTimer) {
            return;
        }
        this._refreshTimer = setInterval(() => {
            void this.refreshLeaderboardCache();
        }, LEADERBOARD_REFRESH_INTERVAL_MS);
        this._refreshTimer.unref();
    }
    /** 停止后台定时刷新。 */
    stopBackgroundRefresh() {
        if (this._refreshTimer) {
            clearInterval(this._refreshTimer);
            this._refreshTimer = null;
        }
    }
    /** NestJS 模块销毁时自动停止后台刷新。 */
    onModuleDestroy() {
        this.stopBackgroundRefresh();
    }
    /** 执行一次排行榜全量刷新（后台调用，不阻塞请求）。 */
    private async refreshLeaderboardCache() {
        if (this._refreshing) {
            return;
        }
        this._refreshing = true;
        try {
            const snapshots = await this.collectLeaderboardSnapshots();
            // snapshot 收集完成后让一次事件循环，给 world tick 回调留窗口。
            await yieldToEventLoop();
            await this.syncInvitationHighestRealmLevels(snapshots);
            await yieldToEventLoop();
            // 宗门榜依赖 NestJS sectService，必须在主线程算好后透传给 worker。
            const sects = this.buildSectBoard(this._sectServiceRef, MAX_LEADERBOARD_LIMIT);
            await yieldToEventLoop();
            const invitation = await this.buildInvitationBoard(this.collectBannedPlayerIds());
            await yieldToEventLoop();
            // 走 worker 卸载玩家榜单排序；不可用或失败时 fallback 到分片同步路径。
            const playerBoards = await this.buildBoardsViaWorkerOrFallback(snapshots, sects, MAX_LEADERBOARD_LIMIT);
            const boards = {
                ...playerBoards,
                invitation,
            };
            const payload = {
                generatedAt: Date.now(),
                limit: MAX_LEADERBOARD_LIMIT,
                boards,
            };
            // 缓存替换仍是同步原子操作，避免读到半构造态。
            this.cachedLeaderboard = payload;
            this.cachedLeaderboardSnapshotsByPlayerId = new Map(snapshots.map((snapshot) => [snapshot.playerId, snapshot]));
        } catch (_error) {
            this.logger.warn(`排行榜缓存刷新失败: ${_error instanceof Error ? _error.message : String(_error)}`);
        } finally {
            this._refreshing = false;
        }
    }
    /**
     * 优先走 worker 池；任意失败/不可用都回到分片 yield 的主线程实现。
     * 主线程 fallback 路径保留阶段 1 的全部 yield 点，仍然不会一次性占用 CPU 数百毫秒。
     */
    private async buildBoardsViaWorkerOrFallback(snapshots: LeaderboardFlatSnapshot[], sects: unknown[], limit: number) {
        const pool = this.leaderboardWorkerPoolService;
        if (pool && pool.isEnabled()) {
            const fallback = (payload: LeaderboardBuildPayload): LeaderboardBuildResult => ({
                boards: buildAllLeaderboards(payload.snapshots as LeaderboardFlatSnapshot[], payload.sects, payload.limit),
            });
            const taskResult = await pool.submit({ snapshots, sects, limit }, fallback);
            if (taskResult.ok && taskResult.result) {
                return taskResult.result.boards;
            }
            this.logger.warn(`排行榜 worker 任务失败，回退主线程同步路径：${taskResult.errorMessage ?? 'unknown'}`);
        }
        return this.buildBoardsOnMainThreadWithYield(snapshots, sects, limit);
    }
    /**
     * 主线程 fallback：保留阶段 1 的分片 yield 行为，避免一次性占满事件循环。
     * 注意此分支只用于 worker 不可用 / 任务失败的兜底，正常路径走 worker。
     */
    private async buildBoardsOnMainThreadWithYield(snapshots: LeaderboardFlatSnapshot[], sects: unknown[], limit: number) {
        const realm = buildRealmBoard(snapshots, limit);
        await yieldToEventLoop();
        const monsterKills = buildMonsterKillBoard(snapshots, limit);
        await yieldToEventLoop();
        const spiritStones = buildSpiritStoneBoard(snapshots, limit);
        await yieldToEventLoop();
        const playerKills = buildPlayerKillBoard(snapshots, limit);
        await yieldToEventLoop();
        const deaths = buildDeathBoard(snapshots, limit);
        await yieldToEventLoop();
        const bodyTraining = buildBodyTrainingBoard(snapshots, limit);
        await yieldToEventLoop();
        const attributes = buildAttributeBoards(snapshots, limit);
        await yieldToEventLoop();
        const techniques = buildTechniqueBoards(snapshots, limit);
        return { realm, monsterKills, spiritStones, playerKills, deaths, bodyTraining, attributes, techniques, sects };
    }
    /** 构造世界摘要快照。 */
    async buildWorldSummary() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const cached = this.cachedWorldSummary;
        if (cached && Date.now() - cached.generatedAt < WORLD_SUMMARY_CACHE_TTL_MS) {
            return cached;
        }

        const bannedPlayerIds = this.collectBannedPlayerIds();
        const spiritStoneAssetSummary = await this.collectSpiritStoneAssetSummary(bannedPlayerIds);
        // 优先复用排行榜已缓存的 snapshot（避免重复拉离线玩家数据）
        let snapshots: any[];
        if (this.cachedLeaderboardSnapshotsByPlayerId.size > 0) {
            // 排行榜缓存已有全量 snapshot，直接复用；
            // 用运行态数据覆盖在线玩家的实时活动 flags
            const runtimeSnapshots = this.collectRuntimeSnapshots()
                .filter((p) => !isNativeGmBotPlayerId(p.playerId))
                .filter((p) => !bannedPlayerIds.has(p.playerId))
                .map((player) => this.createSnapshot(
                    player,
                    null,
                    spiritStoneAssetSummary.countsByPlayerId.get(player.playerId) ?? 0,
                ));
            // 离线玩家直接取缓存，在线玩家用实时数据
            const runtimePlayerIds = new Set(runtimeSnapshots.map((s) => s.playerId));
            snapshots = [
                ...runtimeSnapshots,
                ...[...this.cachedLeaderboardSnapshotsByPlayerId.values()]
                    .filter((s) => !runtimePlayerIds.has(s.playerId) && !bannedPlayerIds.has(s.playerId)),
            ].map((snapshot) => this.applyExternalSpiritStoneCount(
                snapshot,
                spiritStoneAssetSummary.countsByPlayerId.get(snapshot.playerId) ?? 0,
            ));
        } else {
            snapshots = await this.collectWorldSummarySnapshots(bannedPlayerIds, spiritStoneAssetSummary);
        }

        const payload = {
            generatedAt: Date.now(),
            summary: this.buildWorldBoard(snapshots, spiritStoneAssetSummary.totalCount),
        };
        this.cachedWorldSummary = payload;
        return payload;
    }
    /** 构造玩家击杀榜坐标追索快照。 */
    async buildLeaderboardPlayerLocations(playerIds) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const normalizedIds = Array.isArray(playerIds)
            ? playerIds
                .map((entry) => typeof entry === 'string' ? entry.trim() : '')
                .filter((entry, index, list) => entry.length > 0 && list.indexOf(entry) === index)
                .slice(0, MAX_LEADERBOARD_LIMIT)
            : [];
        if (normalizedIds.length === 0) {
            return { entries: [] };
        }
        const snapshotsByPlayerId = await this.getLeaderboardSnapshotIndex();
        return {
            entries: normalizedIds.map((playerId) => {
                const snapshot = snapshotsByPlayerId.get(playerId);
                if (!snapshot) {
                    return {
                        playerId,
                        mapId: '',
                        mapName: '离线',
                        x: 0,
                        y: 0,
                        online: false,
                    };
                }
                return {
                    playerId,
                    mapId: snapshot.mapId,
                    mapName: snapshot.mapName,
                    x: snapshot.x,
                    y: snapshot.y,
                    online: snapshot.online,
                };
            }),
        };
    }
    /** 读取最新排行榜位置索引；直接返回定时刷新维护的缓存。 */
    async getLeaderboardSnapshotIndex() {
        if (this.cachedLeaderboardSnapshotsByPlayerId.size > 0) {
            return this.cachedLeaderboardSnapshotsByPlayerId;
        }
        // 首次调用时缓存为空，同步计算一次
        const snapshots = await this.collectLeaderboardSnapshots();
        this.cachedLeaderboardSnapshotsByPlayerId = new Map(snapshots.map((snapshot) => [snapshot.playerId, snapshot]));
        return this.cachedLeaderboardSnapshotsByPlayerId;
    }
    /** 采集世界摘要快照：运行态优先，离线玩家从分域持久化补齐；世界摘要不需要角色名回读。 */
    async collectWorldSummarySnapshots(bannedPlayerIds = this.collectBannedPlayerIds(), spiritStoneAssetSummary = null) {
        const playersByPlayerId = new Map();
        for (const player of this.collectRuntimeSnapshots()) {
            if (bannedPlayerIds.has(player.playerId)) {
                continue;
            }
            playersByPlayerId.set(player.playerId, player);
        }
        for (const player of await this.collectPersistedOfflineSnapshots(playersByPlayerId)) {
            if (bannedPlayerIds.has(player.playerId)) {
                continue;
            }
            playersByPlayerId.set(player.playerId, player);
        }
        const resolvedSpiritStoneAssetSummary = spiritStoneAssetSummary
            ?? await this.collectSpiritStoneAssetSummary(bannedPlayerIds);
        return [...playersByPlayerId.values()].map((player) => this.createSnapshot(
            player,
            null,
            resolvedSpiritStoneAssetSummary.countsByPlayerId.get(player.playerId) ?? 0,
        ));
    }
    /** 把缓存中的榜单裁剪到指定长度。 */
    sliceLeaderboard(source, limit) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (limit >= source.limit) {
            return source;
        }
        return {
            generatedAt: source.generatedAt,
            limit,
            boards: {
                realm: source.boards.realm.slice(0, limit),
                monsterKills: source.boards.monsterKills.slice(0, limit),
                spiritStones: source.boards.spiritStones.slice(0, limit),
                playerKills: source.boards.playerKills.slice(0, limit),
                deaths: source.boards.deaths.slice(0, limit),
                bodyTraining: source.boards.bodyTraining.slice(0, limit),
                attributes: sliceLeaderboardBoardRecord(source.boards.attributes, ATTR_KEYS, limit),
                techniques: sliceLeaderboardBoardRecord(source.boards.techniques, LEADERBOARD_TECHNIQUE_KEYS, limit),
                sects: source.boards.sects.slice(0, limit),
                invitation: source.boards.invitation ?? createEmptyInvitationBoard(),
            },
        };
    }
    /** 采集排行榜快照：运行态优先，离线玩家从分域持久化补齐。 */
    async collectLeaderboardSnapshots() {
        const bannedPlayerIds = this.collectBannedPlayerIds();
        const playersByPlayerId = new Map();
        for (const player of this.collectRuntimeSnapshots()) {
            if (bannedPlayerIds.has(player.playerId)) {
                continue;
            }
            playersByPlayerId.set(player.playerId, player);
        }
        for (const player of await this.collectPersistedOfflineSnapshots(playersByPlayerId)) {
            if (bannedPlayerIds.has(player.playerId)) {
                continue;
            }
            playersByPlayerId.set(player.playerId, player);
        }
        // 离线玩家投影装载完成后让一次事件循环，避免后续 identity 查询前的 CPU 占用过长。
        await yieldToEventLoop();
        const identitiesByPlayerId = await this.loadLeaderboardIdentities(playersByPlayerId.keys());
        // identity 查询完成后再让一次，给 world tick 留出 createSnapshot 之前的窗口。
        await yieldToEventLoop();
        const spiritStoneAssetSummary = await this.collectSpiritStoneAssetSummary(bannedPlayerIds);
        return [...playersByPlayerId.values()].map((player) => this.createSnapshot(
            player,
            identitiesByPlayerId.get(player.playerId) ?? null,
            spiritStoneAssetSummary.countsByPlayerId.get(player.playerId) ?? 0,
        ));
    }
    /** 采集当前运行态玩家快照，排除 bot；无 session 的离线挂机也保留给排行榜。 */
    collectRuntimeSnapshots() {

        const source = typeof this.playerRuntimeService.listLeaderboardPlayerProjections === 'function'
            ? this.playerRuntimeService.listLeaderboardPlayerProjections()
            : this.playerRuntimeService.listPlayerSnapshots();
        const players = source
            .filter((player) => !isNativeGmBotPlayerId(player.playerId));
        return players;
    }
    /** 从账号真源的内存索引读取封禁玩家，用于低频统计排除。 */
    collectBannedPlayerIds() {
        const authStore = this.nativePlayerAuthStoreService;
        if (!authStore || typeof authStore.listBannedPlayerIds !== 'function') {
            return new Set();
        }
        return new Set(authStore.listBannedPlayerIds()
            .map((playerId) => typeof playerId === 'string' ? playerId.trim() : '')
            .filter((playerId) => playerId.length > 0));
    }
    /** 从分域持久化读取不在运行态中的离线玩家，供低频排行榜使用。 */
    async collectPersistedOfflineSnapshots(existingSnapshotsByPlayerId) {
        const persistence = this.playerDomainPersistenceService;
        if (typeof persistence?.isEnabled !== 'function'
            || !persistence.isEnabled()
            || typeof this.playerRuntimeService.buildStarterPersistenceSnapshot !== 'function') {
            return [];
        }
        // 优先使用固定数量的批量查询替代逐玩家多表加载，大幅降低 DB 和内存压力
        if (typeof persistence.listLeaderboardSnapshots === 'function'
            && typeof this.playerRuntimeService.buildLeaderboardProjectionFromSnapshot === 'function') {
            return this.collectPersistedOfflineSnapshotsBatch(existingSnapshotsByPlayerId, persistence);
        }
        // 回退：逐个玩家加载完整 snapshot
        if (typeof persistence.listProjectedSnapshots !== 'function'
            || typeof this.playerRuntimeService.hydrateFromSnapshot !== 'function') {
            return [];
        }
        const entries = await persistence.listProjectedSnapshots((playerId) => this.playerRuntimeService.buildStarterPersistenceSnapshot(playerId));
        const players = [];
        for (const entry of Array.isArray(entries) ? entries : []) {
            const playerId = typeof entry?.playerId === 'string' ? entry.playerId.trim() : '';
            if (!playerId || isNativeGmBotPlayerId(playerId) || existingSnapshotsByPlayerId.has(playerId)) {
                continue;
            }
            const player = this.createOfflineRuntimePlayerFromSnapshot(playerId, entry.snapshot);
            if (player) {
                const presence = typeof persistence.loadPlayerPresence === 'function'
                    ? await persistence.loadPlayerPresence(playerId)
                    : null;
                player.__leaderboardInWorld = presence
                    ? presence.inWorld === true
                    : Boolean(player.instanceId || player.templateId);
                players.push(player);
            }
        }
        return players;
    }
    /** 批量查询路径：用 listLeaderboardSnapshots 一次性拉出所有离线玩家的排行榜数据。 */
    private async collectPersistedOfflineSnapshotsBatch(existingSnapshotsByPlayerId, persistence) {
        const entries = await persistence.listLeaderboardSnapshots(
            (playerId) => this.playerRuntimeService.buildStarterPersistenceSnapshot(playerId),
            MARKET_CURRENCY_ITEM_ID,
        );
        const players = [];
        for (const entry of Array.isArray(entries) ? entries : []) {
            const playerId = typeof entry?.playerId === 'string' ? entry.playerId.trim() : '';
            if (!playerId || isNativeGmBotPlayerId(playerId) || existingSnapshotsByPlayerId.has(playerId)) {
                continue;
            }
            const player = this.createOfflineRuntimePlayerFromSnapshot(playerId, entry.snapshot);
            if (player) {
                player.__leaderboardInWorld = Boolean(player.instanceId || player.templateId);
                players.push(player);
            }
        }
        return players;
    }
    /**
     * 从持久化快照构建排行榜所需的轻量投影对象。
     * 不再调用完整的 hydrateFromSnapshot（会创建 inventory normalize、quests clone、
     * logbook、notices、npcQuestMarkerCache 等大量不需要的数据），而是只提取排行榜
     * createSnapshot 实际读取的字段，并用最小化 player 形状调用 buildState 获取 finalAttrs。
     */
    createOfflineRuntimePlayerFromSnapshot(playerId, snapshot) {
        try {
            if (!snapshot || typeof snapshot !== 'object') {
                return null;
            }
            // 使用 playerRuntimeService 上的轻量排行榜投影构建器（如果可用），
            // 否则回退到完整 hydrate。
            if (typeof this.playerRuntimeService.buildLeaderboardProjectionFromSnapshot === 'function') {
                const projection = this.playerRuntimeService.buildLeaderboardProjectionFromSnapshot(playerId, snapshot);
                if (!projection) {
                    return null;
                }
                projection.sessionId = null;
                return projection;
            }
            // 回退：完整 hydrate（兼容旧版本）
            const player = this.playerRuntimeService.hydrateFromSnapshot(playerId, null, snapshot);
            if (!player) {
                return null;
            }
            player.sessionId = null;
            player.runtimeOwnerId = null;
            player.lastHeartbeatAt = null;
            return player;
        }
        catch (_error) {
            this.logger.warn(`排行榜离线玩家快照加载失败 [playerId=${playerId}]: ${_error instanceof Error ? _error.message : String(_error)}`);
            return null;
        }
    }
    /** 批量读取榜单显示名；持久化不可用时直接回退运行态名称。 */
    async loadLeaderboardIdentities(playerIds) {
        const identityService = this.playerIdentityPersistenceService;
        if (typeof identityService?.isEnabled !== 'function'
            || !identityService.isEnabled()
            || typeof identityService.listPlayerIdentitiesByPlayerIds !== 'function') {
            return new Map();
        }
        return identityService.listPlayerIdentitiesByPlayerIds(playerIds);
    }
    /** 把单个玩家快照整理成排行榜所需的扁平结构。 */
    createSnapshot(player, identity = null, externalSpiritStoneCount = 0) {

        const finalAttrs = player.attrs?.finalAttrs ?? {};
        const normalizedExternalSpiritStoneCount = toNonNegativeInteger(externalSpiritStoneCount, 0);
        return {
            playerId: player.playerId,
            playerName: normalizePlayerName(player, identity),
            mapId: typeof player.templateId === 'string' ? player.templateId : '',
            mapName: this.resolveMapName(player.templateId),
            x: Math.trunc(Number.isFinite(player.x) ? player.x : 0),
            y: Math.trunc(Number.isFinite(player.y) ? player.y : 0),
            online: typeof player.sessionId === 'string' && player.sessionId.length > 0,
            inWorld: resolveLeaderboardSnapshotInWorld(player),
            realmLv: Math.max(1, toNonNegativeInteger(player.realm?.realmLv, 1)),
            realmName: typeof player.realm?.displayName === 'string' && player.realm.displayName.trim()
                ? player.realm.displayName.trim()
                : '凡俗武者',
            realmShortName: typeof player.realm?.shortName === 'string' && player.realm.shortName.trim()
                ? player.realm.shortName.trim()
                : undefined,
            realmProgress: toNonNegativeInteger(player.realm?.progress, 0),
            foundation: toNonNegativeInteger(player.foundation, 0),
            monsterKillCount: readPlayerCounterValue(this.playerCountersPersistenceService, player, 'monsterKillCount'),
            eliteMonsterKillCount: readPlayerCounterValue(this.playerCountersPersistenceService, player, 'eliteMonsterKillCount'),
            bossMonsterKillCount: readPlayerCounterValue(this.playerCountersPersistenceService, player, 'bossMonsterKillCount'),
            spiritStoneCount: this.getWalletBalance(player, MARKET_CURRENCY_ITEM_ID)
                + normalizedExternalSpiritStoneCount,
            externalSpiritStoneCount: normalizedExternalSpiritStoneCount,
            playerKillCount: readPlayerCounterValue(this.playerCountersPersistenceService, player, 'playerKillCount'),
            deathCount: readPlayerCounterValue(this.playerCountersPersistenceService, player, 'deathCount'),
            bodyTrainingLevel: toNonNegativeInteger(player.bodyTraining?.level, 0),
            bodyTrainingExp: toNonNegativeInteger(player.bodyTraining?.exp, 0),
            bodyTrainingExpToNext: toNonNegativeInteger(player.bodyTraining?.expToNext, 0),
            finalAttrs: {
                constitution: toNonNegativeInteger(finalAttrs.constitution, 0),
                spirit: toNonNegativeInteger(finalAttrs.spirit, 0),
                perception: toNonNegativeInteger(finalAttrs.perception, 0),
                talent: toNonNegativeInteger(finalAttrs.talent, 0),
                strength: toNonNegativeInteger(finalAttrs.strength, 0),
                meridians: toNonNegativeInteger(finalAttrs.meridians, 0),
            },
            techniqueSkills: {
                alchemy: readCraftSkillSnapshot(player.alchemySkill),
                forging: readCraftSkillSnapshot(player.forgingSkill),
                enhancement: readCraftSkillSnapshot(player.enhancementSkill),
                transmission: readCraftSkillSnapshot(player.transmissionSkill),
                gather: readCraftSkillSnapshot(player.gatherSkill),
                mining: readCraftSkillSnapshot(player.miningSkill),
                building: readCraftSkillSnapshot(player.buildingSkill),
                formation: readCraftSkillSnapshot(player.formationSkill),
            },
            flags: {
                cultivation: player.combat?.cultivationActive === true,
                combat: player.combat?.autoBattle === true
                    || (typeof player.combat?.combatTargetId === 'string' && player.combat.combatTargetId.length > 0),
                alchemy: Boolean(player.alchemyJob),
                enhancement: Boolean(player.enhancementJob),
            },
        };
    }
    /** 以当前资产汇总替换 snapshot 中可能过期的钱包外灵石。 */
    applyExternalSpiritStoneCount(snapshot, externalSpiritStoneCount) {
        const previousExternalCount = toNonNegativeInteger(snapshot?.externalSpiritStoneCount, 0);
        const currentExternalCount = toNonNegativeInteger(externalSpiritStoneCount, 0);
        const walletSpiritStones = Math.max(0, toNonNegativeInteger(snapshot?.spiritStoneCount, 0) - previousExternalCount);
        return {
            ...snapshot,
            spiritStoneCount: walletSpiritStones + currentExternalCount,
            externalSpiritStoneCount: currentExternalCount,
        };
    }
    /** 构造宗门人数榜。 */
    buildSectBoard(sectService, limit) {
        if (typeof sectService?.buildSectMemberCountLeaderboard !== 'function') {
            return [];
        }
        return sectService.buildSectMemberCountLeaderboard(limit, this.collectBannedPlayerIds());
    }
    /** 刷新受邀玩家最高境界，避免引渡榜依赖活动面板打开时机。 */
    async syncInvitationHighestRealmLevels(snapshots) {
        const activityPersistence = this.activityPersistenceService;
        if (typeof activityPersistence?.isEnabled !== 'function'
            || !activityPersistence.isEnabled()
            || typeof activityPersistence.syncInvitationInviteeHighestRealmLevels !== 'function') {
            return;
        }
        const highestRealmLvByPlayerId = new Map();
        for (const snapshot of snapshots) {
            const playerId = typeof snapshot?.playerId === 'string' ? snapshot.playerId.trim() : '';
            if (!playerId) {
                continue;
            }
            highestRealmLvByPlayerId.set(playerId, Math.max(1, toNonNegativeInteger(snapshot.realmLv, 1)));
        }
        await activityPersistence.syncInvitationInviteeHighestRealmLevels(highestRealmLvByPlayerId);
    }
    /** 构造引渡榜。 */
    async buildInvitationBoard(bannedPlayerIds) {
        const activityPersistence = this.activityPersistenceService;
        if (typeof activityPersistence?.isEnabled !== 'function'
            || !activityPersistence.isEnabled()
            || typeof activityPersistence.listInvitationLeaderboardRows !== 'function') {
            return createEmptyInvitationBoard();
        }
        const rows = await activityPersistence.listInvitationLeaderboardRows(bannedPlayerIds);
        const filteredRows = rows.filter((row) => !bannedPlayerIds.has(row.inviterPlayerId) && !isNativeGmBotPlayerId(row.inviterPlayerId));
        const identitiesByPlayerId = await this.loadLeaderboardIdentities(filteredRows.map((row) => row.inviterPlayerId));
        return {
            totalInvitees: this.mapInvitationRows(filteredRows, 'totalInvitees', identitiesByPlayerId),
            qiReached: this.mapInvitationRows(filteredRows, 'qiReachedCount', identitiesByPlayerId),
            foundationReached: this.mapInvitationRows(filteredRows, 'foundationReachedCount', identitiesByPlayerId),
        };
    }
    /** 把引渡聚合行按指定字段裁剪为前三。 */
    mapInvitationRows(rows: ActivityInvitationLeaderboardRow[], countKey: 'totalInvitees' | 'qiReachedCount' | 'foundationReachedCount', identitiesByPlayerId) {
        return [...rows]
            .filter((row) => row[countKey] > 0)
            .sort((left, right) => right[countKey] - left[countKey] || left.inviterPlayerId.localeCompare(right.inviterPlayerId, 'zh-Hans-CN'))
            .slice(0, INVITATION_LEADERBOARD_LIMIT)
            .map((row, index) => {
            const identity = identitiesByPlayerId.get(row.inviterPlayerId) ?? null;
            const playerName = typeof identity?.playerName === 'string' && identity.playerName.trim()
                ? identity.playerName.trim()
                : row.inviterPlayerId;
            return {
                rank: index + 1,
                playerId: row.inviterPlayerId,
                playerName,
                count: row[countKey],
            };
        });
    }
    /** 构造世界在线分布与交易摘要。 */
    buildWorldBoard(snapshots, totalExternalSpiritStones = 0) {

        const representedExternalSpiritStones = snapshots.reduce(
            (total, snapshot) => total + toNonNegativeInteger(snapshot.externalSpiritStoneCount, 0),
            0,
        );
        const unrepresentedExternalSpiritStones = Math.max(
            0,
            toNonNegativeInteger(totalExternalSpiritStones, 0) - representedExternalSpiritStones,
        );
        const totalSpiritStones = snapshots.reduce(
            (total, snapshot) => total + snapshot.spiritStoneCount,
            unrepresentedExternalSpiritStones,
        );

        const eliteMonsterKills = snapshots.reduce((total, snapshot) => total + snapshot.eliteMonsterKillCount, 0);

        const bossMonsterKills = snapshots.reduce((total, snapshot) => total + snapshot.bossMonsterKillCount, 0);

        const totalMonsterKills = snapshots.reduce((total, snapshot) => total + snapshot.monsterKillCount, 0);
        const actionSnapshots = snapshots.filter((snapshot) => snapshot.online === true || snapshot.inWorld === true);
        return {
            totalSpiritStones,
            actionCounts: {
                cultivation: actionSnapshots.reduce((total, snapshot) => total + (snapshot.flags.cultivation ? 1 : 0), 0),
                combat: actionSnapshots.reduce((total, snapshot) => total + (snapshot.flags.combat ? 1 : 0), 0),
                alchemy: actionSnapshots.reduce((total, snapshot) => total + (snapshot.flags.alchemy ? 1 : 0), 0),
                enhancement: actionSnapshots.reduce((total, snapshot) => total + (snapshot.flags.enhancement ? 1 : 0), 0),
            },
            realmCounts: {
                initial: snapshots.filter((snapshot) => snapshot.realmLv <= 1).length,
                mortal: snapshots.filter((snapshot) => snapshot.realmLv >= 2 && snapshot.realmLv <= 18).length,
                qiRefiningOrAbove: snapshots.filter((snapshot) => snapshot.realmLv >= 19).length,
            },
            killCounts: {
                normalMonsters: Math.max(0, totalMonsterKills - eliteMonsterKills - bossMonsterKills),
                eliteMonsters: eliteMonsterKills,
                bossMonsters: bossMonsterKills,
                playerKills: snapshots.reduce((total, snapshot) => total + snapshot.playerKillCount, 0),
                playerDeaths: snapshots.reduce((total, snapshot) => total + snapshot.deathCount, 0),
            },
        };
    }
    /** 合并坊市、邮件与宝库中的钱包外灵石，并统一应用榜单排除口径。 */
    async collectSpiritStoneAssetSummary(excludedPlayerIds = new Set()) {
        const [marketCounts, mailSummary, treasureVaultSummary] = await Promise.all([
            typeof this.marketRuntimeService?.summarizeSpiritStoneAssetsByPlayer === 'function'
                ? this.marketRuntimeService.summarizeSpiritStoneAssetsByPlayer()
                : Promise.resolve(new Map()),
            this.collectUnclaimedMailSpiritStoneCounts(),
            this.collectTreasureVaultSpiritStoneSummary(excludedPlayerIds),
        ]);
        const countsByPlayerId = new Map();
        mergeEligiblePlayerAssetCounts(countsByPlayerId, marketCounts, excludedPlayerIds);
        mergeEligiblePlayerAssetCounts(countsByPlayerId, mailSummary.countsByPlayerId, excludedPlayerIds);
        mergeEligiblePlayerAssetCounts(countsByPlayerId, treasureVaultSummary.countsByOwnerPlayerId, excludedPlayerIds);
        const representedTreasureVaultCount = [...treasureVaultSummary.countsByOwnerPlayerId.values()]
            .reduce((total, count) => total + toNonNegativeInteger(count, 0), 0);
        const unownedTreasureVaultCount = Math.max(0, treasureVaultSummary.totalCount - representedTreasureVaultCount);
        return {
            countsByPlayerId,
            totalCount: [...countsByPlayerId.values()].reduce(
                (total, count) => total + toNonNegativeInteger(count, 0),
                unownedTreasureVaultCount,
            ),
        };
    }
    /** 从邮件结构化真源汇总当前仍可领取的灵石附件。 */
    async collectUnclaimedMailSpiritStoneCounts() {
        const persistence = this.mailPersistenceService;
        if (!persistence || typeof persistence.summarizeUnclaimedItemCountsByPlayer !== 'function') {
            return { countsByPlayerId: new Map() };
        }
        return persistence.summarizeUnclaimedItemCountsByPlayer(MARKET_CURRENCY_ITEM_ID);
    }
    /** 从宝库持久化真源按创建者汇总灵石，并沿用榜单的封禁与 GM Bot 排除口径。 */
    async collectTreasureVaultSpiritStoneSummary(excludedPlayerIds = new Set()) {
        const vaultService = this.treasureVaultRuntimeService;
        if (!vaultService || typeof vaultService.summarizeStoredItemCountsByOwner !== 'function') {
            return { countsByOwnerPlayerId: new Map(), totalCount: 0 };
        }
        const summary = await vaultService.summarizeStoredItemCountsByOwner(MARKET_CURRENCY_ITEM_ID);
        const countsByOwnerPlayerId = new Map([...summary.countsByOwnerPlayerId.entries()].filter(([playerId]) => (
            !excludedPlayerIds.has(playerId) && !isNativeGmBotPlayerId(playerId)
        )));
        return {
            countsByOwnerPlayerId,
            totalCount: [...countsByOwnerPlayerId.values()].reduce((total, count) => total + toNonNegativeInteger(count, 0), 0)
                + toNonNegativeInteger(summary.unownedCount, 0),
        };
    }
    /** 读取玩家钱包里某个货币类型的持有数量。 */
    getWalletBalance(player, walletType) {
        const inventoryCount = readInventoryItemCount(player?.inventory?.items, walletType);
        const lockedInventoryCount = readInventoryItemCount(player?.inventory?.lockedItems, walletType);
        const authoritativeInventoryCount = inventoryCount + lockedInventoryCount;
        return authoritativeInventoryCount > 0
            ? authoritativeInventoryCount
            : readWalletBalance(player?.wallet?.balances, walletType);
    }
    /** 把运行时地图 ID 转成中文地图名。 */
    resolveMapName(mapId) {
        const normalizedMapId = typeof mapId === 'string' ? mapId.trim() : '';
        if (!normalizedMapId) {
            return '未知地图';
        }
        const summary = this.mapTemplateRepository.listSummaries().find((entry) => entry.id === normalizedMapId);
        return resolvePlayerFacingContentName(normalizedMapId, '未知地图', summary?.name);
    }
};
/**
 * yieldToEventLoop：把当前微任务让回事件循环，给 world tick 等高优先级
 * setTimeout/IO 回调一次执行机会。在排行榜分片刷新过程中按片调用，避免
 * 一次性占用 CPU 数百毫秒导致 tick 慢帧。
 */
function yieldToEventLoop(): Promise<void> {
    return new Promise((resolvePromise) => setImmediate(resolvePromise));
}
/**
 * clampLeaderboardLimit：执行clampLeaderboardLimit相关逻辑。
 * @param limit 参数说明。
 * @returns 无返回值，直接更新clampLeaderboardLimit相关状态。
 */

function clampLeaderboardLimit(limit) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Number.isFinite(limit)) {
        return DEFAULT_LEADERBOARD_LIMIT;
    }
    return Math.max(1, Math.min(MAX_LEADERBOARD_LIMIT, Math.floor(Number(limit))));
}

function createEmptyInvitationBoard() {
    return {
        totalInvitees: [],
        qiReached: [],
        foundationReached: [],
    };
}

/** 按固定子榜键裁剪榜单，保持协议对象结构完整。 */
function sliceLeaderboardBoardRecord(source, keys, limit) {
    const result = {};
    for (const key of keys) {
        result[key] = Array.isArray(source?.[key]) ? source[key].slice(0, limit) : [];
    }
    return result;
}

/** 从玩家投影读取单项技艺状态。 */
function readCraftSkillSnapshot(value) {
    return {
        level: Math.max(1, toNonNegativeInteger(value?.level, 1)),
        exp: toNonNegativeNumber(value?.exp, 0),
        expToNext: toNonNegativeNumber(value?.expToNext, 0),
    };
}
/**
 * toNonNegativeInteger：执行toNonNegativeInteger相关逻辑。
 * @param input 输入参数。
 * @param fallback 参数说明。
 * @returns 无返回值，直接更新toNonNegativeInteger相关状态。
 */

function toNonNegativeInteger(input, fallback) {

    const normalized = Number.isFinite(input) ? Math.floor(Number(input)) : fallback;
    return Math.max(0, normalized);
}

function toNonNegativeNumber(input, fallback) {
    const normalized = Number(input);
    return Number.isFinite(normalized) ? Math.max(0, normalized) : fallback;
}

/**
 * normalizePlayerName：规范化或转换玩家名称。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新玩家名称相关状态。
 */

function normalizePlayerName(player, identity = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    return resolvePlayerDisplayName({
        ...player,
        playerName: identity?.playerName,
        pendingRoleName: identity?.pendingRoleName,
        roleName: identity?.roleName,
        displayName: identity?.displayName ?? player?.displayName,
    }, { playerId: player?.playerId, fallback: '未知玩家' });
}

function resolveLeaderboardSnapshotInWorld(player) {
    if (player?.__leaderboardInWorld === true) {
        return true;
    }
    if (player?.__leaderboardInWorld === false) {
        return false;
    }
    if (typeof player?.sessionId === 'string' && player.sessionId.length > 0) {
        return true;
    }
    return Boolean(player?.instanceId || player?.templateId);
}

function readInventoryItemCount(items, itemId) {
    if (!Array.isArray(items) || typeof itemId !== 'string' || !itemId) {
        return 0;
    }
    return items.reduce((total, entry) => entry?.itemId === itemId ? total + toNonNegativeInteger(entry.count, 0) : total, 0);
}
function readWalletBalance(balances, walletType) {
    if (!Array.isArray(balances) || typeof walletType !== 'string' || !walletType) {
        return 0;
    }
    return balances.reduce((total, entry) => entry?.walletType === walletType || entry?.type === walletType
        ? total + toNonNegativeInteger(entry.balance ?? entry.count, 0)
        : total, 0);
}

/** 把一类玩家资产累加进统一汇总，并排除封禁账号与 GM Bot。 */
function mergeEligiblePlayerAssetCounts(target, source, excludedPlayerIds) {
    if (!source || typeof source.entries !== 'function') {
        return;
    }
    for (const [rawPlayerId, rawCount] of source.entries()) {
        const playerId = typeof rawPlayerId === 'string' ? rawPlayerId.trim() : '';
        const count = toNonNegativeInteger(rawCount, 0);
        if (!playerId || count <= 0 || excludedPlayerIds.has(playerId) || isNativeGmBotPlayerId(playerId)) {
            continue;
        }
        target.set(playerId, (target.get(playerId) ?? 0) + count);
    }
}

function readPlayerCounterValue(counterService, player, key) {
    const counters = typeof counterService?.getAll === 'function'
        ? counterService.getAll(player.playerId)
        : null;
    if (counters && typeof counters.has === 'function' && counters.has(key)) {
        return toNonNegativeInteger(counters.get(key), 0);
    }
    return toNonNegativeInteger(player?.[key], 0);
}

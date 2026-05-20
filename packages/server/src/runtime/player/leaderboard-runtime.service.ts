/**
 * 排行榜运行时服务。
 * 按运行态与持久化玩家快照聚合各类榜单（境界、战力、属性、击杀等）
 * 和世界摘要，结果做短缓存避免高频重算。
 */
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { calculateMarketTradeTotalCost } from '@mud/shared';
import { isNativeGmBotPlayerId } from '../../http/native/native-gm.constants';
import { MARKET_CURRENCY_ITEM_ID } from '../../constants/gameplay/market';
import { MarketRuntimeService } from '../market/market-runtime.service';
import { MapTemplateRepository } from '../map/map-template.repository';
import { PlayerRuntimeService } from './player-runtime.service';
import { PlayerDomainPersistenceService } from '../../persistence/player-domain-persistence.service';
import { PlayerIdentityPersistenceService } from '../../persistence/player-identity-persistence.service';
import { PlayerCountersPersistenceService } from '../../persistence/player-counters-persistence.service';

/** 排行榜运行时：按运行态与持久化玩家快照聚合榜单与世界摘要，结果做短缓存。 */
const DEFAULT_LEADERBOARD_LIMIT = 10;

/** 排行榜最大返回条数。 */
const MAX_LEADERBOARD_LIMIT = 10;

/** 排行榜定时刷新间隔（10 分钟）。排行榜数据不需要实时，定时后台刷新即可。 */
const LEADERBOARD_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

/** 世界摘要缓存时间（30 秒）。摘要含在线人数等稍实时的数据，TTL 短一些。 */
const WORLD_SUMMARY_CACHE_TTL_MS = 30 * 1000;

/** 以六维主属性做“顶尖属性”榜单的中文标签。 */
const SUPREME_ATTR_LABELS = {
    constitution: '体魄',
    spirit: '神识',
    perception: '身法',
    talent: '根骨',
    strength: '力道',
    meridians: '经脉',
};

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
    ) {
        this.playerRuntimeService = playerRuntimeService;
        this.marketRuntimeService = marketRuntimeService;
        this.mapTemplateRepository = mapTemplateRepository;
        this.playerDomainPersistenceService = playerDomainPersistenceService;
        this.playerIdentityPersistenceService = playerIdentityPersistenceService;
        this.playerCountersPersistenceService = playerCountersPersistenceService;
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
        return this.sliceLeaderboard(this.cachedLeaderboard ?? { generatedAt: Date.now(), limit: 0, boards: { realm: [], monsterKills: [], spiritStones: [], playerKills: [], deaths: [], bodyTraining: [], supremeAttrs: [], sects: [] } }, effectiveLimit);
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
            const payload = {
                generatedAt: Date.now(),
                limit: MAX_LEADERBOARD_LIMIT,
                boards: {
                    realm: this.buildRealmBoard(snapshots, MAX_LEADERBOARD_LIMIT),
                    monsterKills: this.buildMonsterKillBoard(snapshots, MAX_LEADERBOARD_LIMIT),
                    spiritStones: this.buildSpiritStoneBoard(snapshots, MAX_LEADERBOARD_LIMIT),
                    playerKills: this.buildPlayerKillBoard(snapshots, MAX_LEADERBOARD_LIMIT),
                    deaths: this.buildDeathBoard(snapshots, MAX_LEADERBOARD_LIMIT),
                    bodyTraining: this.buildBodyTrainingBoard(snapshots, MAX_LEADERBOARD_LIMIT),
                    supremeAttrs: this.buildSupremeAttrBoard(snapshots),
                    sects: this.buildSectBoard(this._sectServiceRef, MAX_LEADERBOARD_LIMIT),
                },
            };
            this.cachedLeaderboard = payload;
            this.cachedLeaderboardSnapshotsByPlayerId = new Map(snapshots.map((snapshot) => [snapshot.playerId, snapshot]));
        } catch (_error) {
            this.logger.warn(`排行榜缓存刷新失败: ${_error instanceof Error ? _error.message : String(_error)}`);
        } finally {
            this._refreshing = false;
        }
    }
    /** 构造世界摘要快照。 */
    async buildWorldSummary() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const cached = this.cachedWorldSummary;
        if (cached && Date.now() - cached.generatedAt < WORLD_SUMMARY_CACHE_TTL_MS) {
            return cached;
        }

        // 优先复用排行榜已缓存的 snapshot（避免重复拉离线玩家数据）
        let snapshots: any[];
        if (this.cachedLeaderboardSnapshotsByPlayerId.size > 0) {
            // 排行榜缓存已有全量 snapshot，直接复用；
            // 用运行态数据覆盖在线玩家的实时活动 flags
            const runtimeSnapshots = this.collectRuntimeSnapshots()
                .filter((p) => !isNativeGmBotPlayerId(p.playerId))
                .map((player) => this.createSnapshot(player));
            // 离线玩家直接取缓存，在线玩家用实时数据
            const runtimePlayerIds = new Set(runtimeSnapshots.map((s) => s.playerId));
            snapshots = [
                ...runtimeSnapshots,
                ...[...this.cachedLeaderboardSnapshotsByPlayerId.values()]
                    .filter((s) => !runtimePlayerIds.has(s.playerId)),
            ];
        } else {
            snapshots = await this.collectWorldSummarySnapshots();
        }

        const payload = {
            generatedAt: Date.now(),
            summary: this.buildWorldBoard(snapshots),
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
    async collectWorldSummarySnapshots() {
        const playersByPlayerId = new Map();
        for (const player of this.collectRuntimeSnapshots()) {
            playersByPlayerId.set(player.playerId, player);
        }
        for (const player of await this.collectPersistedOfflineSnapshots(playersByPlayerId)) {
            playersByPlayerId.set(player.playerId, player);
        }
        return [...playersByPlayerId.values()].map((player) => this.createSnapshot(player));
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
                supremeAttrs: source.boards.supremeAttrs,
                sects: source.boards.sects.slice(0, limit),
            },
        };
    }
    /** 采集排行榜快照：运行态优先，离线玩家从分域持久化补齐。 */
    async collectLeaderboardSnapshots() {
        const playersByPlayerId = new Map();
        for (const player of this.collectRuntimeSnapshots()) {
            playersByPlayerId.set(player.playerId, player);
        }
        for (const player of await this.collectPersistedOfflineSnapshots(playersByPlayerId)) {
            playersByPlayerId.set(player.playerId, player);
        }
        const identitiesByPlayerId = await this.loadLeaderboardIdentities(playersByPlayerId.keys());
        return [...playersByPlayerId.values()].map((player) => this.createSnapshot(player, identitiesByPlayerId.get(player.playerId) ?? null));
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
    /** 从分域持久化读取不在运行态中的离线玩家，供低频排行榜使用。 */
    async collectPersistedOfflineSnapshots(existingSnapshotsByPlayerId) {
        const persistence = this.playerDomainPersistenceService;
        if (typeof persistence?.isEnabled !== 'function'
            || !persistence.isEnabled()
            || typeof this.playerRuntimeService.buildStarterPersistenceSnapshot !== 'function') {
            return [];
        }
        // 优先使用批量查询（13 次 SQL 替代 2219×20+ 次），大幅降低 DB 和内存压力
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
    createSnapshot(player, identity = null) {

        const finalAttrs = player.attrs?.finalAttrs ?? {};
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
            spiritStoneCount: this.getWalletBalance(player, MARKET_CURRENCY_ITEM_ID),
            marketStorageSpiritStoneCount: this.getMarketStorageItemCount(player, MARKET_CURRENCY_ITEM_ID),
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
            flags: {
                cultivation: player.combat?.cultivationActive === true,
                combat: player.combat?.autoBattle === true
                    || (typeof player.combat?.combatTargetId === 'string' && player.combat.combatTargetId.length > 0),
                alchemy: Boolean(player.alchemyJob),
                enhancement: Boolean(player.enhancementJob),
            },
        };
    }
    /** 构造境界榜。 */
    buildRealmBoard(snapshots, limit) {
        return [...snapshots]
            .sort((left, right) => (right.realmLv - left.realmLv
            || right.realmProgress - left.realmProgress
            || right.bodyTrainingLevel - left.bodyTrainingLevel
            || right.foundation - left.foundation
            || right.bodyTrainingExp - left.bodyTrainingExp
            || compareName(left, right)))
            .slice(0, limit)
            .map((entry, index) => ({
            rank: index + 1,
            playerId: entry.playerId,
            playerName: entry.playerName,
            realmLv: entry.realmLv,
            realmName: entry.realmName,
            realmShortName: entry.realmShortName,
            progress: entry.realmProgress,
            foundation: entry.foundation,
        }));
    }
    /** 构造击杀榜。 */
    buildMonsterKillBoard(snapshots, limit) {
        return [...snapshots]
            .sort((left, right) => (right.monsterKillCount - left.monsterKillCount
            || right.bossMonsterKillCount - left.bossMonsterKillCount
            || right.eliteMonsterKillCount - left.eliteMonsterKillCount
            || compareName(left, right)))
            .slice(0, limit)
            .map((entry, index) => ({
            rank: index + 1,
            playerId: entry.playerId,
            playerName: entry.playerName,
            totalKills: entry.monsterKillCount,
            eliteKills: entry.eliteMonsterKillCount,
            bossKills: entry.bossMonsterKillCount,
        }));
    }
    /** 构造灵石持有榜。 */
    buildSpiritStoneBoard(snapshots, limit) {
        return [...snapshots]
            .sort((left, right) => right.spiritStoneCount - left.spiritStoneCount || compareName(left, right))
            .slice(0, limit)
            .map((entry, index) => ({
            rank: index + 1,
            playerId: entry.playerId,
            playerName: entry.playerName,
            spiritStoneCount: entry.spiritStoneCount,
        }));
    }
    /** 构造玩家击杀榜。 */
    buildPlayerKillBoard(snapshots, limit) {
        return [...snapshots]
            .sort((left, right) => right.playerKillCount - left.playerKillCount || compareName(left, right))
            .slice(0, limit)
            .map((entry, index) => ({
            rank: index + 1,
            playerId: entry.playerId,
            playerName: entry.playerName,
            playerKillCount: entry.playerKillCount,
        }));
    }
    /** 构造死亡榜。 */
    buildDeathBoard(snapshots, limit) {
        return [...snapshots]
            .sort((left, right) => right.deathCount - left.deathCount || compareName(left, right))
            .slice(0, limit)
            .map((entry, index) => ({
            rank: index + 1,
            playerId: entry.playerId,
            playerName: entry.playerName,
            deathCount: entry.deathCount,
        }));
    }
    /** 构造体修榜。 */
    buildBodyTrainingBoard(snapshots, limit) {
        return [...snapshots]
            .sort((left, right) => (right.bodyTrainingLevel - left.bodyTrainingLevel
            || right.bodyTrainingExp - left.bodyTrainingExp
            || compareName(left, right)))
            .slice(0, limit)
            .map((entry, index) => ({
            rank: index + 1,
            playerId: entry.playerId,
            playerName: entry.playerName,
            level: entry.bodyTrainingLevel,
            exp: entry.bodyTrainingExp,
            expToNext: entry.bodyTrainingExpToNext,
        }));
    }
    /** 构造六维最高属性榜。 */
    buildSupremeAttrBoard(snapshots) {
        return Object.keys(SUPREME_ATTR_LABELS).map((attr) => {

            const top = [...snapshots].sort((left, right) => (right.finalAttrs[attr] - left.finalAttrs[attr]
                || right.realmLv - left.realmLv
                || compareName(left, right)))[0];
            return {
                attr,
                label: SUPREME_ATTR_LABELS[attr],
                playerId: top?.playerId ?? '',
                playerName: top?.playerName ?? '暂无',
                value: top?.finalAttrs[attr] ?? 0,
            };
        });
    }
    /** 构造宗门人数榜。 */
    buildSectBoard(sectService, limit) {
        if (typeof sectService?.buildSectMemberCountLeaderboard !== 'function') {
            return [];
        }
        return sectService.buildSectMemberCountLeaderboard(limit);
    }
    /** 构造世界在线分布与交易摘要。 */
    buildWorldBoard(snapshots) {

        const totalSpiritStones = snapshots.reduce((total, snapshot) => total + snapshot.spiritStoneCount + snapshot.marketStorageSpiritStoneCount, 0)
            + this.collectReservedSpiritStoneTotal();

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
    /** 汇总坊市仓库里的灵石总量。 */
    collectReservedSpiritStoneTotal() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const openOrders = Array.isArray(this.marketRuntimeService.openOrders) ? this.marketRuntimeService.openOrders : [];
        let total = 0;
        for (const order of openOrders) {
            if (order?.status !== 'open' || order?.side !== 'buy') {
                continue;
            }

            const cost = calculateMarketTradeTotalCost(toNonNegativeInteger(order.remainingQuantity, 0), toNonNegativeInteger(order.unitPrice, 0));
            total += cost ?? 0;
        }
        return total;
    }
    /** 读取玩家钱包里某个货币类型的持有数量。 */
    getWalletBalance(player, walletType) {
        const inventoryCount = readInventoryItemCount(player?.inventory?.items, walletType);
        return inventoryCount > 0 ? inventoryCount : readWalletBalance(player?.wallet?.balances, walletType);
    }
    /** 读取玩家坊市仓库里某个物品的持有数量。 */
    getMarketStorageItemCount(player, itemId) {

        const playerStorageCount = readMarketStorageItemCount(player?.marketStorage?.items, itemId);
        if (playerStorageCount > 0 || typeof player?.sessionId !== 'string' || player.sessionId.length === 0) {
            return playerStorageCount;
        }
        const storage = this.marketRuntimeService.buildMarketStorage(player.playerId);
        return (storage?.items ?? []).reduce((total, entry) => entry?.item?.itemId === itemId ? total + toNonNegativeInteger(entry.count, 0) : total, 0);
    }
    /** 把运行时地图 ID 转成中文地图名。 */
    resolveMapName(mapId) {
        const normalizedMapId = typeof mapId === 'string' ? mapId.trim() : '';
        if (!normalizedMapId) {
            return '未知地图';
        }
        const summary = this.mapTemplateRepository.listSummaries().find((entry) => entry.id === normalizedMapId);
        return summary?.name ?? normalizedMapId;
    }
};
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
/**
 * compareName：执行compare名称相关逻辑。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，直接更新compare名称相关状态。
 */

function compareName(left, right) {
    return left.playerName.localeCompare(right.playerName, 'zh-Hans-CN');
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
/**
 * normalizePlayerName：规范化或转换玩家名称。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新玩家名称相关状态。
 */

function normalizePlayerName(player, identity = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (typeof identity?.playerName === 'string' && identity.playerName.trim()) {
        return identity.playerName.trim();
    }
    if (typeof identity?.displayName === 'string' && identity.displayName.trim()) {
        return identity.displayName.trim();
    }
    if (typeof player.displayName === 'string' && player.displayName.trim()) {
        return player.displayName.trim();
    }
    if (typeof player.name === 'string' && player.name.trim()) {
        return player.name.trim();
    }
    return player.playerId;
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
function readMarketStorageItemCount(items, itemId) {
    if (!Array.isArray(items) || typeof itemId !== 'string' || !itemId) {
        return 0;
    }
    return items.reduce((total, entry) => {
        const storageItemId = entry?.item?.itemId ?? entry?.itemId;
        return storageItemId === itemId ? total + toNonNegativeInteger(entry.count, 0) : total;
    }, 0);
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

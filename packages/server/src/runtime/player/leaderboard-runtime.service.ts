// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
        r = Reflect.decorate(decorators, target, key, desc);
    else
        for (var i = decorators.length - 1; i >= 0; i--)
            if (d = decorators[i])
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function")
        return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeaderboardRuntimeService = void 0;

const common_1 = require("@nestjs/common");

const shared_1 = require("@mud/shared");

const next_gm_constants_1 = require("../../http/native/native-gm.constants");

const market_1 = require("../../constants/gameplay/market");

const market_runtime_service_1 = require("../market/market-runtime.service");

const map_template_repository_1 = require("../map/map-template.repository");

const player_runtime_service_1 = require("./player-runtime.service");
const player_domain_persistence_service_1 = require("../../persistence/player-domain-persistence.service");
const player_identity_persistence_service_1 = require("../../persistence/player-identity-persistence.service");

/** 排行榜运行时：按运行态与持久化玩家快照聚合榜单与世界摘要，结果做短缓存。 */
const DEFAULT_LEADERBOARD_LIMIT = 10;

/** 排行榜最大返回条数。 */
const MAX_LEADERBOARD_LIMIT = 10;

/** 排行榜与世界摘要的缓存时间。 */
const CACHE_TTL_MS = 10 * 1000;

/** 以六维主属性做“顶尖属性”榜单的中文标签。 */
const SUPREME_ATTR_LABELS = {
    constitution: '体魄',
    spirit: '神识',
    perception: '身法',
    talent: '根骨',
    strength: '力道',
    meridians: '经脉',
};

let LeaderboardRuntimeService = class LeaderboardRuntimeService {
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
    /** 缓存后的排行榜结果。 */
    cachedLeaderboard = null;
    /** 排行榜缓存生成时的玩家位置索引，供击杀榜坐标追索复用。 */
    cachedLeaderboardSnapshotsByPlayerId = new Map();
    /** 缓存后的世界摘要。 */
    cachedWorldSummary = null;
    /** 注入玩家运行时和坊市运行时。 */
    constructor(playerRuntimeService, marketRuntimeService, mapTemplateRepository, playerDomainPersistenceService, playerIdentityPersistenceService) {
        this.playerRuntimeService = playerRuntimeService;
        this.marketRuntimeService = marketRuntimeService;
        this.mapTemplateRepository = mapTemplateRepository;
        this.playerDomainPersistenceService = playerDomainPersistenceService;
        this.playerIdentityPersistenceService = playerIdentityPersistenceService;
    }
    /** 构造各榜单快照，按需截断返回。 */
    async buildLeaderboard(limit, sectService = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const effectiveLimit = clampLeaderboardLimit(limit);

        const cached = this.cachedLeaderboard;
        if (cached && Date.now() - cached.generatedAt < CACHE_TTL_MS) {
            return this.sliceLeaderboard(cached, effectiveLimit);
        }

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
                sects: this.buildSectBoard(sectService, MAX_LEADERBOARD_LIMIT),
            },
        };
        this.cachedLeaderboard = payload;
        this.cachedLeaderboardSnapshotsByPlayerId = new Map(snapshots.map((snapshot) => [snapshot.playerId, snapshot]));
        return this.sliceLeaderboard(payload, effectiveLimit);
    }
    /** 构造世界摘要快照。 */
    buildWorldSummary() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const cached = this.cachedWorldSummary;
        if (cached && Date.now() - cached.generatedAt < CACHE_TTL_MS) {
            return cached;
        }

        const snapshots = this.collectRuntimeSnapshots()
            .filter((player) => typeof player.sessionId === 'string' && player.sessionId.length > 0)
            .map((player) => this.createSnapshot(player));

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
    /** 读取最新排行榜位置索引；缓存有效时避免坐标追索重复扫描持久化。 */
    async getLeaderboardSnapshotIndex() {
        const cached = this.cachedLeaderboard;
        if (cached && Date.now() - cached.generatedAt < CACHE_TTL_MS && this.cachedLeaderboardSnapshotsByPlayerId.size > 0) {
            return this.cachedLeaderboardSnapshotsByPlayerId;
        }
        const snapshots = await this.collectLeaderboardSnapshots();
        this.cachedLeaderboardSnapshotsByPlayerId = new Map(snapshots.map((snapshot) => [snapshot.playerId, snapshot]));
        return this.cachedLeaderboardSnapshotsByPlayerId;
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

        const players = this.playerRuntimeService.listPlayerSnapshots()
            .filter((player) => !(0, next_gm_constants_1.isNativeGmBotPlayerId)(player.playerId));
        return players;
    }
    /** 从分域持久化读取不在运行态中的离线玩家，供低频排行榜使用。 */
    async collectPersistedOfflineSnapshots(existingSnapshotsByPlayerId) {
        const persistence = this.playerDomainPersistenceService;
        if (typeof persistence?.isEnabled !== 'function'
            || !persistence.isEnabled()
            || typeof persistence.listProjectedSnapshots !== 'function'
            || typeof this.playerRuntimeService.buildStarterPersistenceSnapshot !== 'function'
            || typeof this.playerRuntimeService.hydrateFromSnapshot !== 'function') {
            return [];
        }
        const entries = await persistence.listProjectedSnapshots((playerId) => this.playerRuntimeService.buildStarterPersistenceSnapshot(playerId));
        const players = [];
        for (const entry of Array.isArray(entries) ? entries : []) {
            const playerId = typeof entry?.playerId === 'string' ? entry.playerId.trim() : '';
            if (!playerId || (0, next_gm_constants_1.isNativeGmBotPlayerId)(playerId) || existingSnapshotsByPlayerId.has(playerId)) {
                continue;
            }
            const player = this.createOfflineRuntimePlayerFromSnapshot(playerId, entry.snapshot);
            if (player) {
                players.push(player);
            }
        }
        return players;
    }
    /** 把持久化玩家快照临时水合成运行态形状，只用于读榜，不注册进在线运行态。 */
    createOfflineRuntimePlayerFromSnapshot(playerId, snapshot) {
        try {
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
            realmLv: Math.max(1, toNonNegativeInteger(player.realm?.realmLv, 1)),
            realmName: typeof player.realm?.displayName === 'string' && player.realm.displayName.trim()
                ? player.realm.displayName.trim()
                : '凡俗武者',
            realmShortName: typeof player.realm?.shortName === 'string' && player.realm.shortName.trim()
                ? player.realm.shortName.trim()
                : undefined,
            realmProgress: toNonNegativeInteger(player.realm?.progress, 0),
            foundation: toNonNegativeInteger(player.foundation, 0),
            monsterKillCount: toNonNegativeInteger(player.monsterKillCount, 0),
            eliteMonsterKillCount: toNonNegativeInteger(player.eliteMonsterKillCount, 0),
            bossMonsterKillCount: toNonNegativeInteger(player.bossMonsterKillCount, 0),
            spiritStoneCount: this.getWalletBalance(player, market_1.MARKET_CURRENCY_ITEM_ID),
            marketStorageSpiritStoneCount: this.getMarketStorageItemCount(player, market_1.MARKET_CURRENCY_ITEM_ID),
            playerKillCount: toNonNegativeInteger(player.playerKillCount, 0),
            deathCount: toNonNegativeInteger(player.deathCount, 0),
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
        return {
            totalSpiritStones,
            actionCounts: {
                cultivation: snapshots.reduce((total, snapshot) => total + (snapshot.flags.cultivation ? 1 : 0), 0),
                combat: snapshots.reduce((total, snapshot) => total + (snapshot.flags.combat ? 1 : 0), 0),
                alchemy: snapshots.reduce((total, snapshot) => total + (snapshot.flags.alchemy ? 1 : 0), 0),
                enhancement: snapshots.reduce((total, snapshot) => total + (snapshot.flags.enhancement ? 1 : 0), 0),
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

            const cost = (0, shared_1.calculateMarketTradeTotalCost)(toNonNegativeInteger(order.remainingQuantity, 0), toNonNegativeInteger(order.unitPrice, 0));
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
exports.LeaderboardRuntimeService = LeaderboardRuntimeService;
exports.LeaderboardRuntimeService = LeaderboardRuntimeService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService,
        market_runtime_service_1.MarketRuntimeService,
        map_template_repository_1.MapTemplateRepository,
        player_domain_persistence_service_1.PlayerDomainPersistenceService,
        player_identity_persistence_service_1.PlayerIdentityPersistenceService])
], LeaderboardRuntimeService);
export { LeaderboardRuntimeService };
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

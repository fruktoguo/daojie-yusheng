"use strict";
/** __decorate：定义该变量以承载业务值。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
        r = Reflect.decorate(decorators, target, key, desc);
    else
        for (var i = decorators.length - 1; i >= 0; i--)
            if (d = decorators[i])
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** __metadata：定义该变量以承载业务值。 */
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function")
        return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeaderboardRuntimeService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** legacy_gm_compat_constants_1：定义该变量以承载业务值。 */
const legacy_gm_compat_constants_1 = require("../../compat/legacy/legacy-gm-compat.constants");
/** market_1：定义该变量以承载业务值。 */
const market_1 = require("../../constants/gameplay/market");
/** market_runtime_service_1：定义该变量以承载业务值。 */
const market_runtime_service_1 = require("../market/market-runtime.service");
/** player_runtime_service_1：定义该变量以承载业务值。 */
const player_runtime_service_1 = require("./player-runtime.service");
/** DEFAULT_LEADERBOARD_LIMIT：定义该变量以承载业务值。 */
const DEFAULT_LEADERBOARD_LIMIT = 10;
/** MAX_LEADERBOARD_LIMIT：定义该变量以承载业务值。 */
const MAX_LEADERBOARD_LIMIT = 10;
/** CACHE_TTL_MS：定义该变量以承载业务值。 */
const CACHE_TTL_MS = 10 * 1000;
/** SUPREME_ATTR_LABELS：定义该变量以承载业务值。 */
const SUPREME_ATTR_LABELS = {
    constitution: '体魄',
    spirit: '神识',
    perception: '身法',
    talent: '根骨',
};
/** LeaderboardRuntimeService：定义该变量以承载业务值。 */
let LeaderboardRuntimeService = class LeaderboardRuntimeService {
    playerRuntimeService;
    marketRuntimeService;
    cachedLeaderboard = null;
    cachedWorldSummary = null;
/** 构造函数：执行实例初始化流程。 */
    constructor(playerRuntimeService, marketRuntimeService) {
        this.playerRuntimeService = playerRuntimeService;
        this.marketRuntimeService = marketRuntimeService;
    }
/** buildLeaderboard：执行对应的业务逻辑。 */
    buildLeaderboard(limit) {
/** effectiveLimit：定义该变量以承载业务值。 */
        const effectiveLimit = clampLeaderboardLimit(limit);
/** cached：定义该变量以承载业务值。 */
        const cached = this.cachedLeaderboard;
        if (cached && Date.now() - cached.generatedAt < CACHE_TTL_MS) {
            return this.sliceLeaderboard(cached, effectiveLimit);
        }
/** snapshots：定义该变量以承载业务值。 */
        const snapshots = this.collectOnlineSnapshots();
/** payload：定义该变量以承载业务值。 */
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
            },
        };
        this.cachedLeaderboard = payload;
        return this.sliceLeaderboard(payload, effectiveLimit);
    }
/** buildWorldSummary：执行对应的业务逻辑。 */
    buildWorldSummary() {
/** cached：定义该变量以承载业务值。 */
        const cached = this.cachedWorldSummary;
        if (cached && Date.now() - cached.generatedAt < CACHE_TTL_MS) {
            return cached;
        }
/** snapshots：定义该变量以承载业务值。 */
        const snapshots = this.collectOnlineSnapshots();
/** payload：定义该变量以承载业务值。 */
        const payload = {
            generatedAt: Date.now(),
            summary: this.buildWorldBoard(snapshots),
        };
        this.cachedWorldSummary = payload;
        return payload;
    }
/** sliceLeaderboard：执行对应的业务逻辑。 */
    sliceLeaderboard(source, limit) {
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
            },
        };
    }
/** collectOnlineSnapshots：执行对应的业务逻辑。 */
    collectOnlineSnapshots() {
/** players：定义该变量以承载业务值。 */
        const players = this.playerRuntimeService.listPlayerSnapshots()
            .filter((player) => !(0, legacy_gm_compat_constants_1.isLegacyGmCompatBotPlayerId)(player.playerId))
            .filter((player) => typeof player.sessionId === 'string' && player.sessionId.length > 0);
        return players.map((player) => this.createSnapshot(player));
    }
/** createSnapshot：执行对应的业务逻辑。 */
    createSnapshot(player) {
/** finalAttrs：定义该变量以承载业务值。 */
        const finalAttrs = player.attrs?.finalAttrs ?? {};
        return {
            playerId: player.playerId,
            playerName: normalizePlayerName(player),
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
            spiritStoneCount: this.getInventoryItemCount(player, market_1.MARKET_CURRENCY_ITEM_ID),
            marketStorageSpiritStoneCount: this.getMarketStorageItemCount(player.playerId, market_1.MARKET_CURRENCY_ITEM_ID),
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
/** buildRealmBoard：执行对应的业务逻辑。 */
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
/** buildMonsterKillBoard：执行对应的业务逻辑。 */
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
/** buildSpiritStoneBoard：执行对应的业务逻辑。 */
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
/** buildPlayerKillBoard：执行对应的业务逻辑。 */
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
/** buildDeathBoard：执行对应的业务逻辑。 */
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
/** buildBodyTrainingBoard：执行对应的业务逻辑。 */
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
/** buildSupremeAttrBoard：执行对应的业务逻辑。 */
    buildSupremeAttrBoard(snapshots) {
        return Object.keys(SUPREME_ATTR_LABELS).map((attr) => {
/** top：定义该变量以承载业务值。 */
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
/** buildWorldBoard：执行对应的业务逻辑。 */
    buildWorldBoard(snapshots) {
/** totalSpiritStones：定义该变量以承载业务值。 */
        const totalSpiritStones = snapshots.reduce((total, snapshot) => total + snapshot.spiritStoneCount + snapshot.marketStorageSpiritStoneCount, 0)
            + this.collectReservedSpiritStoneTotal();
/** eliteMonsterKills：定义该变量以承载业务值。 */
        const eliteMonsterKills = snapshots.reduce((total, snapshot) => total + snapshot.eliteMonsterKillCount, 0);
/** bossMonsterKills：定义该变量以承载业务值。 */
        const bossMonsterKills = snapshots.reduce((total, snapshot) => total + snapshot.bossMonsterKillCount, 0);
/** totalMonsterKills：定义该变量以承载业务值。 */
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
/** collectReservedSpiritStoneTotal：执行对应的业务逻辑。 */
    collectReservedSpiritStoneTotal() {
/** openOrders：定义该变量以承载业务值。 */
        const openOrders = Array.isArray(this.marketRuntimeService.openOrders) ? this.marketRuntimeService.openOrders : [];
        let total = 0;
        for (const order of openOrders) {
            if (order?.status !== 'open' || order?.side !== 'buy') {
                continue;
            }
/** cost：定义该变量以承载业务值。 */
            const cost = (0, shared_1.calculateMarketTradeTotalCost)(toNonNegativeInteger(order.remainingQuantity, 0), toNonNegativeInteger(order.unitPrice, 0));
            total += cost ?? 0;
        }
        return total;
    }
/** getInventoryItemCount：执行对应的业务逻辑。 */
    getInventoryItemCount(player, itemId) {
        return (player.inventory?.items ?? []).reduce((total, item) => item?.itemId === itemId ? total + toNonNegativeInteger(item.count, 0) : total, 0);
    }
/** getMarketStorageItemCount：执行对应的业务逻辑。 */
    getMarketStorageItemCount(playerId, itemId) {
/** storage：定义该变量以承载业务值。 */
        const storage = this.marketRuntimeService.buildMarketStorage(playerId);
        return (storage?.items ?? []).reduce((total, entry) => entry?.item?.itemId === itemId ? total + toNonNegativeInteger(entry.count, 0) : total, 0);
    }
};
exports.LeaderboardRuntimeService = LeaderboardRuntimeService;
exports.LeaderboardRuntimeService = LeaderboardRuntimeService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService,
        market_runtime_service_1.MarketRuntimeService])
], LeaderboardRuntimeService);
/** clampLeaderboardLimit：执行对应的业务逻辑。 */
function clampLeaderboardLimit(limit) {
    if (!Number.isFinite(limit)) {
        return DEFAULT_LEADERBOARD_LIMIT;
    }
    return Math.max(1, Math.min(MAX_LEADERBOARD_LIMIT, Math.floor(Number(limit))));
}
/** compareName：执行对应的业务逻辑。 */
function compareName(left, right) {
    return left.playerName.localeCompare(right.playerName, 'zh-Hans-CN');
}
/** toNonNegativeInteger：执行对应的业务逻辑。 */
function toNonNegativeInteger(input, fallback) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = Number.isFinite(input) ? Math.floor(Number(input)) : fallback;
    return Math.max(0, normalized);
}
/** normalizePlayerName：执行对应的业务逻辑。 */
function normalizePlayerName(player) {
    if (typeof player.displayName === 'string' && player.displayName.trim()) {
        return player.displayName.trim();
    }
    if (typeof player.name === 'string' && player.name.trim()) {
        return player.name.trim();
    }
    return player.playerId;
}

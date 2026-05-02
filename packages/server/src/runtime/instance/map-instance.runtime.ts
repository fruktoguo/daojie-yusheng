// @ts-nocheck
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MapInstanceRuntime = void 0;

const shared_1 = require("@mud/shared");

const env_alias_1 = require("../../config/env-alias");
const map_template_repository_1 = require("../map/map-template.repository");
const runtime_tile_plane_1 = require("../map/runtime-tile-plane");

const DEFAULT_TILE_AURA_RESOURCE_KEY = (0, shared_1.buildQiResourceKey)(shared_1.DEFAULT_QI_RESOURCE_DESCRIPTOR);

/** INVALID_OCCUPANCY：空占位值，表示该地块当前未被占用。 */
const INVALID_OCCUPANCY = 0;

/** DEFAULT_VIEW_RADIUS：默认视野半径。 */
const DEFAULT_VIEW_RADIUS = 10;

/** MONSTER_LOST_SIGHT_CHASE_TICKS：妖兽丢失视野后只追击最后目击点的短暂记忆窗口。 */
const MONSTER_LOST_SIGHT_CHASE_TICKS = 3;
const MONSTER_RESPAWN_ACCELERATION_BASE_PERCENT = 100;
const MONSTER_RESPAWN_ACCELERATION_STEP_PERCENT = 100;
const MONSTER_RESPAWN_ACCELERATION_MAX_PERCENT = 1000;

/** MAP_TIME_PERSISTENCE_DOMAIN：实例当前时间的持久化脏域。 */
const MAP_TIME_PERSISTENCE_DOMAIN = 'time';
const MAP_TIME_PERSISTENCE_CHECKPOINT_INTERVAL_TICKS = normalizePositiveInteger((0, env_alias_1.readTrimmedEnv)('SERVER_MAP_TIME_CHECKPOINT_INTERVAL_TICKS', 'MAP_TIME_CHECKPOINT_INTERVAL_TICKS'), 300, 30, 86_400);

/** DEFAULT_TERRAIN_DURABILITY_BY_TILE：默认地形耐久配置。 */
const DEFAULT_TERRAIN_DURABILITY_BY_TILE = {
    [shared_1.TileType.Wall]: { material: 'stone', multiplier: 50 },
    [shared_1.TileType.Cloud]: { material: 'vine', multiplier: 3 },
    [shared_1.TileType.Tree]: { material: 'wood', multiplier: 10 },
    [shared_1.TileType.Bamboo]: { material: 'bamboo', multiplier: 8 },
    [shared_1.TileType.Cliff]: { material: 'stone', multiplier: 50 },
    [shared_1.TileType.Stone]: { material: 'stone', multiplier: 50 },
    [shared_1.TileType.SpiritOre]: { material: 'spiritOre', multiplier: 100000 },
    [shared_1.TileType.BlackIronOre]: { material: 'blackIronOre', multiplier: 2000 },
    [shared_1.TileType.BrokenSwordHeap]: { material: 'brokenSwordHeap', multiplier: 2 },
    [shared_1.TileType.Door]: { material: 'ironwood', multiplier: 14 },
    [shared_1.TileType.Window]: { material: 'wood', multiplier: 10 },
};

/** TERRAIN_DURABILITY_PROFILES：按地图风格区分的地形耐久配置。 */
const TERRAIN_DURABILITY_PROFILES = {
    mortal_settlement: {
        [shared_1.TileType.Wall]: { material: 'stone', multiplier: 50 },
        [shared_1.TileType.Tree]: { material: 'wood', multiplier: 10 },
        [shared_1.TileType.Cliff]: { material: 'stone', multiplier: 50 },
        [shared_1.TileType.Stone]: { material: 'stone', multiplier: 50 },
        [shared_1.TileType.SpiritOre]: { material: 'spiritOre', multiplier: 100000 },
        [shared_1.TileType.BlackIronOre]: { material: 'blackIronOre', multiplier: 2000 },
        [shared_1.TileType.Door]: { material: 'ironwood', multiplier: 14 },
        [shared_1.TileType.Window]: { material: 'wood', multiplier: 10 },
    },
    yellow_frontier: {
        [shared_1.TileType.Wall]: { material: 'stone', multiplier: 50 },
        [shared_1.TileType.Tree]: { material: 'wood', multiplier: 10 },
        [shared_1.TileType.Bamboo]: { material: 'bamboo', multiplier: 8 },
        [shared_1.TileType.Cliff]: { material: 'stone', multiplier: 50 },
        [shared_1.TileType.Stone]: { material: 'stone', multiplier: 50 },
        [shared_1.TileType.SpiritOre]: { material: 'spiritOre', multiplier: 100000 },
        [shared_1.TileType.BlackIronOre]: { material: 'blackIronOre', multiplier: 2000 },
    },
    yellow_bamboo: {
        [shared_1.TileType.Wall]: { material: 'stone', multiplier: 50 },
        [shared_1.TileType.Tree]: { material: 'bamboo', multiplier: 8 },
        [shared_1.TileType.Bamboo]: { material: 'bamboo', multiplier: 8 },
        [shared_1.TileType.Cliff]: { material: 'stone', multiplier: 50 },
        [shared_1.TileType.Stone]: { material: 'stone', multiplier: 50 },
        [shared_1.TileType.SpiritOre]: { material: 'spiritOre', multiplier: 100000 },
        [shared_1.TileType.BlackIronOre]: { material: 'blackIronOre', multiplier: 2000 },
        [shared_1.TileType.Door]: { material: 'wood', multiplier: 10 },
    },
    mystic_black_iron: {
        [shared_1.TileType.Wall]: { material: 'blackIron', multiplier: 120 },
        [shared_1.TileType.Cliff]: { material: 'blackIron', multiplier: 120 },
        [shared_1.TileType.Stone]: { material: 'blackIron', multiplier: 120 },
        [shared_1.TileType.SpiritOre]: { material: 'spiritOre', multiplier: 100000 },
        [shared_1.TileType.BlackIronOre]: { material: 'blackIronOre', multiplier: 2000 },
        [shared_1.TileType.Door]: { material: 'ironwood', multiplier: 14 },
    },
    mystic_rune_ruins: {
        [shared_1.TileType.Wall]: { material: 'runeStone', multiplier: 70 },
        [shared_1.TileType.Tree]: { material: 'spiritWood', multiplier: 18 },
        [shared_1.TileType.Bamboo]: { material: 'spiritWood', multiplier: 18 },
        [shared_1.TileType.Cliff]: { material: 'runeStone', multiplier: 70 },
        [shared_1.TileType.Stone]: { material: 'runeStone', multiplier: 70 },
        [shared_1.TileType.SpiritOre]: { material: 'spiritOre', multiplier: 100000 },
        [shared_1.TileType.BlackIronOre]: { material: 'blackIronOre', multiplier: 2000 },
        [shared_1.TileType.Door]: { material: 'ironwood', multiplier: 14 },
    },
    earth_stone_wild: {
        [shared_1.TileType.Wall]: { material: 'stone', multiplier: 50 },
        [shared_1.TileType.Tree]: { material: 'spiritWood', multiplier: 18 },
        [shared_1.TileType.Bamboo]: { material: 'spiritWood', multiplier: 18 },
        [shared_1.TileType.Cliff]: { material: 'stone', multiplier: 50 },
        [shared_1.TileType.Stone]: { material: 'stone', multiplier: 50 },
        [shared_1.TileType.SpiritOre]: { material: 'spiritOre', multiplier: 100000 },
        [shared_1.TileType.BlackIronOre]: { material: 'blackIronOre', multiplier: 2000 },
    },
    earth_sky_metal: {
        [shared_1.TileType.Wall]: { material: 'skyMetal', multiplier: 160 },
        [shared_1.TileType.Cloud]: { material: 'vine', multiplier: 3 },
        [shared_1.TileType.Tree]: { material: 'spiritWood', multiplier: 18 },
        [shared_1.TileType.Bamboo]: { material: 'spiritWood', multiplier: 18 },
        [shared_1.TileType.Cliff]: { material: 'skyMetal', multiplier: 160 },
        [shared_1.TileType.Stone]: { material: 'skyMetal', multiplier: 160 },
        [shared_1.TileType.SpiritOre]: { material: 'spiritOre', multiplier: 100000 },
        [shared_1.TileType.BlackIronOre]: { material: 'blackIronOre', multiplier: 2000 },
        [shared_1.TileType.Door]: { material: 'metal', multiplier: 100 },
    },
};

/** SPECIAL_TILE_DURABILITY_MULTIPLIERS：特殊地块耐久倍率表。 */
const SPECIAL_TILE_DURABILITY_MULTIPLIERS = {
    [shared_1.TileType.SpiritOre]: 1000,
    [shared_1.TileType.BlackIronOre]: 1000,
    [shared_1.TileType.BrokenSwordHeap]: 0.02,
};

/** SPECIAL_TILE_RESTORE_SPEED_MULTIPLIERS：特殊地形恢复速度倍率，越高表示复原越快。 */
const SPECIAL_TILE_RESTORE_SPEED_MULTIPLIERS = {
    [shared_1.TileType.Cloud]: 100,
};

/** LEGACY_MAP_TERRAIN_PROFILE_IDS：旧版地图到地形耐久配置的兼容映射。 */
const LEGACY_MAP_TERRAIN_PROFILE_IDS = {
    spawn: 'mortal_settlement',
    yunlai_town: 'mortal_settlement',
    wildlands: 'yellow_frontier',
    bamboo_forest: 'yellow_bamboo',
    black_iron_mine: 'mystic_black_iron',
    ancient_ruins: 'mystic_rune_ruins',
    spirit_ridge: 'earth_stone_wild',
    beast_valley: 'earth_stone_wild',
    sky_ruins: 'earth_sky_metal',
};
/** MapInstanceRuntime：地图实例运行时实现。 */
class MapInstanceRuntime {
/**
 * meta：meta相关字段。
 */

    meta;    
    /**
 * template：template相关字段。
 */

    template;    
    /**
 * tilePlane：运行时稀疏坐标地块平面。
 */

    tilePlane;    
    /**
 * occupancy：occupancy相关字段。
 */

    occupancy;    
    /**
 * auraByTile：默认灵气资源桶兼容视图。
 */

    auraByTile;    
    /**
 * tileResourceBuckets：按资源键拆分的地块资源桶。
 */

    tileResourceBuckets = new Map();    
    /**
 * baseTileResourceBuckets：按资源键拆分的模板基线资源桶。
 */

    baseTileResourceBuckets = new Map();    
    /**
 * tileDamageByTile：tileDamageByTile相关字段。
 */

    tileDamageByTile = new Map();    
    /**
 * temporaryTileByTile：技能生成的非持久临时地块。
 */

    temporaryTileByTile = new Map();
    /**
 * playersById：玩家ByID标识。
 */

    playersById = new Map();    
    /**
 * playersByHandle：玩家ByHandle相关字段。
 */

    playersByHandle = new Map();    
    /**
 * npcsById：NPCByID标识。
 */

    npcsById = new Map();    
    /**
 * npcIdByTile：NPCIDByTile相关字段。
 */

    npcIdByTile = new Map();    
    /**
 * landmarksById：landmarkByID标识。
 */

    landmarksById = new Map();    
    /**
 * landmarkIdByTile：landmarkIDByTile相关字段。
 */

    landmarkIdByTile = new Map();    
    /**
 * containersById：containerByID标识。
 */

    containersById = new Map();    
    /**
 * containerIdByTile：containerIDByTile相关字段。
 */

    containerIdByTile = new Map();    
    /**
 * monstersByRuntimeId：怪物By运行态ID标识。
 */

    monstersByRuntimeId = new Map();    
    /**
 * monsterRuntimeIdByTile：怪物运行态IDByTile相关字段。
 */

    monsterRuntimeIdByTile = new Map();    
    /**
 * monsterSpawnGroupsByKey：按刷新点聚合的妖兽运行态分组。
 */

    monsterSpawnGroupsByKey = new Map();
    /**
 * monsterSpawnAccelerationStatesByKey：普通妖兽刷新点清场加速状态。
 */

    monsterSpawnAccelerationStatesByKey = new Map();
    /**
 * monsterSpawnKeyByRuntimeId：妖兽运行态 ID 到刷新点分组键。
 */

    monsterSpawnKeyByRuntimeId = new Map();
    /**
 * groundPilesByTile：groundPileByTile相关字段。
 */

    groundPilesByTile = new Map();    
    /**
 * pendingCommands：pendingCommand相关字段。
 */

    pendingCommands = new Map();    
    /**
 * freeHandles：freeHandle相关字段。
 */

    freeHandles = [];    
    /**
 * nextHandle：nextHandle相关字段。
 */

    nextHandle = 1;    
    /**
 * tick：tick相关字段。
 */

    tick = 0;    
    /**
 * worldRevision：世界Revision相关字段。
 */

    worldRevision = 0;    
    /**
 * persistentRevision：persistentRevision相关字段。
 */

    persistentRevision = 1;    
    /**
 * persistedRevision：persistedRevision相关字段。
 */

    persistedRevision = 1;    
    /**
 * changedAuraTileCount：默认灵气脏地块数量。
 */

    changedAuraTileCount = 0;    
    /**
 * changedTileResourceEntryCount：通用地块资源脏条目数量。
 */

    changedTileResourceEntryCount = 0;    
    /**
 * changedTileResourceEntryCountByKey：按资源键统计脏条目数量。
 */

    changedTileResourceEntryCountByKey = new Map();    
    /**
 * dirtyDomains：实例域级脏标记。
 */

    dirtyDomains = createMapInstanceDirtyDomainSet();    
    /**
 * persistenceFullReplaceDomains：需要保留全量替换兜底的持久化域。
 */

    persistenceFullReplaceDomains = createMapInstanceDirtyDomainSet();
    /**
 * dirtyTileResourceByKey：按资源键记录需要行级落盘的地块资源。
 */

    dirtyTileResourceByKey = new Map();
    /**
 * dirtyTileDamageIndices：需要行级落盘的地块损坏索引。
 */

    dirtyTileDamageIndices = new Set();
    /**
 * dirtyGroundItemTileIndices：需要按 tile 替换的地面物品堆索引。
 */

    dirtyGroundItemTileIndices = new Set();
    /**
 * dirtyMonsterRuntimeIds：需要行级落盘的妖兽运行态 ID。
 */

    dirtyMonsterRuntimeIds = new Set();
    /**
     * dynamicTileBlocker：运行时动态阻挡判断，例如阵法边界。
     */

    dynamicTileBlocker = null;    
    /**
     * compositeSightResolver：跨地图视觉叠加查询，例如二楼窗口外投影到父地图。
     */

    compositeSightResolver = null;    
    /** runtimePortals：运行时动态传送点，例如宗门入口。 */
    runtimePortals = [];
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param request 请求参数。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(request) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.meta = {
            instanceId: request.instanceId,
            templateId: request.template.id,
            kind: request.kind,
            persistent: request.persistent,
            persistentPolicy: request.persistentPolicy ?? (request.persistent === false ? 'ephemeral' : 'persistent'),
            createdAt: request.createdAt,
            displayName: request.displayName,
            linePreset: request.linePreset,
            lineIndex: request.lineIndex,
            instanceOrigin: request.instanceOrigin,
            supportsPvp: request.supportsPvp === true,
            canDamageTile: request.canDamageTile === true,
            defaultEntry: request.defaultEntry !== false,
            ownerPlayerId: request.ownerPlayerId,
            ownerSectId: request.ownerSectId,
            partyId: request.partyId,
            assignedNodeId: request.assignedNodeId ?? null,
            leaseToken: request.leaseToken ?? null,
            leaseExpireAt: request.leaseExpireAt ?? null,
            ownershipEpoch: Number.isFinite(Number(request.ownershipEpoch)) ? Math.max(0, Math.trunc(Number(request.ownershipEpoch))) : 0,
            runtimeStatus: request.runtimeStatus ?? 'running',
            status: request.status ?? 'active',
            clusterId: request.clusterId ?? null,
            shardKey: request.shardKey ?? request.instanceId,
            routeDomain: request.routeDomain ?? null,
            destroyAt: request.destroyAt ?? null,
            lastActiveAt: request.lastActiveAt ?? null,
            lastPersistedAt: request.lastPersistedAt ?? null,
        };
        this.template = request.template;
        this.tilePlane = runtime_tile_plane_1.RuntimeTilePlane.fromTemplate(request.template);
        const initialCellCapacity = this.tilePlane.getCellCapacity();
        this.occupancy = new Uint32Array(initialCellCapacity);
        this.auraByTile = new Int32Array(initialCellCapacity);
        this.auraByTile.set(request.template.baseAuraByTile);
        this.tileResourceBuckets.set(DEFAULT_TILE_AURA_RESOURCE_KEY, this.auraByTile);
        const baseAuraByTile = new Int32Array(initialCellCapacity);
        baseAuraByTile.set(request.template.baseAuraByTile);
        this.baseTileResourceBuckets.set(DEFAULT_TILE_AURA_RESOURCE_KEY, baseAuraByTile);
        for (const entry of request.template.baseTileResourceEntries ?? []) {
            if (!entry
                || entry.resourceKey === DEFAULT_TILE_AURA_RESOURCE_KEY
                || !Number.isFinite(entry.tileIndex)
                || !Number.isFinite(entry.value)) {
                continue;
            }
            const tileIndex = Math.trunc(entry.tileIndex);
            if (tileIndex < 0 || tileIndex >= this.auraByTile.length) {
                continue;
            }
            const value = Math.max(0, Math.trunc(entry.value));
            if (value <= 0) {
                continue;
            }
            this.getOrCreateTileResourceBucket(entry.resourceKey)[tileIndex] = value;
            this.getOrCreateBaseTileResourceBucket(entry.resourceKey)[tileIndex] = value;
        }
        for (const npc of request.template.npcs) {
            const state = {
                npcId: npc.id,
                name: npc.name,
                x: npc.x,
                y: npc.y,
                char: npc.char,
                color: npc.color,
                dialogue: npc.dialogue,
                role: npc.role,
                hasShop: npc.hasShop,
                shopItems: npc.shopItems.map((entry) => ({ ...entry })),
                quests: npc.quests.map((entry) => ({ ...entry })),
            };
            this.npcsById.set(state.npcId, state);
            this.npcIdByTile.set(this.toTileIndex(state.x, state.y), state.npcId);
        }
        for (const landmark of request.template.landmarks) {
            this.landmarksById.set(landmark.id, {
                ...landmark,
                container: landmark.container ? snapshotContainer(landmark.container) : undefined,
            });
            this.landmarkIdByTile.set(this.toTileIndex(landmark.x, landmark.y), landmark.id);
        }
        for (const container of request.template.containers) {
            this.containersById.set(container.id, {
                ...container,
                drops: container.drops.map((entry) => ({ ...entry })),
                lootPools: container.lootPools.map((entry) => ({
                    ...entry,
                    tagGroups: entry.tagGroups?.map((group) => group.slice()),
                })),
            });
            this.containerIdByTile.set(this.toTileIndex(container.x, container.y), container.id);
        }
        for (const monster of request.monsterSpawns) {
            const spawnX = Number.isFinite(Number(monster.spawnOriginX)) ? Math.trunc(Number(monster.spawnOriginX)) : monster.x;
            const spawnY = Number.isFinite(Number(monster.spawnOriginY)) ? Math.trunc(Number(monster.spawnOriginY)) : monster.y;
            const spawnKey = typeof monster.spawnKey === 'string' && monster.spawnKey.trim()
                ? monster.spawnKey.trim()
                : buildMonsterSpawnKey(monster.monsterId, spawnX, spawnY);
            const state = {
                runtimeId: monster.runtimeId,
                monsterId: monster.monsterId,
                spawnKey,
                spawnX,
                spawnY,
                x: monster.x,
                y: monster.y,
                hp: monster.alive ? Math.max(1, Math.min(monster.hp, monster.maxHp)) : 0,
                maxHp: monster.maxHp,
                alive: monster.alive,
                respawnLeft: monster.alive ? 0 : monster.respawnLeft,
                respawnTicks: monster.respawnTicks,
                facing: monster.facing,
                name: monster.name,
                char: monster.char,
                color: monster.color,
                level: monster.level,
                tier: monster.tier,
                expMultiplier: monster.expMultiplier,
                baseAttrs: cloneAttributes(monster.baseAttrs),
                attrs: cloneAttributes(monster.baseAttrs),
                baseNumericStats: cloneNumericStats(monster.baseNumericStats),
                numericStats: cloneNumericStats(monster.baseNumericStats),
                ratioDivisors: cloneNumericRatioDivisors(monster.ratioDivisors),
                buffs: [],
                skills: monster.skills.map((entry) => cloneSkill(entry)),
                cooldownReadyTickBySkillId: {},
                damageContributors: {},
                aggroTargetPlayerId: null,
                lastSeenTargetX: undefined,
                lastSeenTargetY: undefined,
                lastSeenTargetTick: undefined,
                aggroRange: monster.aggroRange,
                leashRange: monster.leashRange,
                wanderRadius: Number.isFinite(Number(monster.wanderRadius)) ? Math.max(0, Math.trunc(Number(monster.wanderRadius))) : 0,
                attackRange: monster.attackRange,
                attackCooldownTicks: monster.attackCooldownTicks,
                attackReadyTick: 0,
            };
            this.monstersByRuntimeId.set(monster.runtimeId, state);
            this.monsterSpawnKeyByRuntimeId.set(monster.runtimeId, spawnKey);
            const group = this.monsterSpawnGroupsByKey.get(spawnKey);
            if (group) {
                group.push(state);
            }
            else {
                this.monsterSpawnGroupsByKey.set(spawnKey, [state]);
            }
            if (monster.alive) {
                this.monsterRuntimeIdByTile.set(this.toTileIndex(monster.x, monster.y), monster.runtimeId);
            }
        }
        this.initializeMonsterSpawnAccelerationStates();
    }
    /** playerCount：当前实例中的在线玩家数量。 */
    get playerCount() {
        return this.playersById.size;
    }
    /** listPlayerIds：列出玩家 ID 列表。 */
    listPlayerIds() {
        return Array.from(this.playersById.keys());
    }
    /** connectPlayer：将玩家接入当前实例，并同步初始移动速度与位置。 */
    connectPlayer(request) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const existing = this.playersById.get(request.playerId);
        if (existing) {
            existing.sessionId = request.sessionId;
            return existing;
        }

        const spawn = this.findSpawnPoint(request.preferredX, request.preferredY);
        if (!spawn) {
            throw new Error(`实例 ${this.meta.instanceId} 中没有可用出生点`);
        }

        const handle = this.allocateHandle();

        const player = {
            handle,
            playerId: request.playerId,
            sessionId: request.sessionId,
            x: spawn.x,
            y: spawn.y,
            facing: shared_1.Direction.South,
            joinedAtTick: this.tick,
            lastResolvedTick: this.tick,
            moveSpeed: 0,
            movePoints: 0,
            lastMoveBudgetTick: this.tick,
            selfRevision: 1,
        };
        this.playersById.set(player.playerId, player);
        this.playersByHandle.set(player.handle, player);
        this.setOccupied(player.x, player.y, player.handle);
        this.worldRevision += 1;
        return player;
    }
    /** disconnectPlayer：断开玩家与实例的挂接，并清理相关排队状态。 */
    disconnectPlayer(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const player = this.playersById.get(playerId);
        if (!player) {
            return false;
        }
        this.playersById.delete(playerId);
        this.playersByHandle.delete(player.handle);
        this.pendingCommands.delete(playerId);
        this.setOccupied(player.x, player.y, INVALID_OCCUPANCY);
        this.freeHandles.push(player.handle);
        this.worldRevision += 1;
        return true;
    }
    /** relocatePlayer：把玩家强制迁到指定落点，仍然复用出生点占位逻辑。 */
    relocatePlayer(playerId, preferredX, preferredY) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const player = this.playersById.get(playerId);
        if (!player) {
            return null;
        }

        const target = this.findSpawnPoint(preferredX, preferredY);
        if (!target) {
            throw new Error(`实例 ${this.meta.instanceId} 中没有可用空地块`);
        }
        if (player.x === target.x && player.y === target.y) {
            return {
                x: player.x,
                y: player.y,
            };
        }
        this.setOccupied(player.x, player.y, INVALID_OCCUPANCY);
        player.x = target.x;
        player.y = target.y;
        player.selfRevision += 1;
        this.setOccupied(player.x, player.y, player.handle);
        this.worldRevision += 1;
        return {
            x: player.x,
            y: player.y,
        };
    }
    /** getPlayerPosition：读取玩家当前位置。 */
    getPlayerPosition(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const player = this.playersById.get(playerId);
        if (!player) {
            return null;
        }
        return {
            x: player.x,
            y: player.y,
        };
    }
    /** enqueueMove：把方向移动请求排入下一次 tick 统一执行。 */
    enqueueMove(command) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.playersById.has(command.playerId)) {
            return false;
        }
        this.pendingCommands.set(command.playerId, {
            kind: 'move',
            direction: command.direction,

            continuous: command.continuous === true,
            maxSteps: Number.isFinite(command.maxSteps) ? Math.max(1, Math.trunc(command.maxSteps)) : undefined,
            path: Array.isArray(command.path)
                ? command.path
                    .filter((entry) => Number.isFinite(entry?.x) && Number.isFinite(entry?.y))
                    .map((entry) => ({ x: Math.trunc(entry.x), y: Math.trunc(entry.y) }))
                : undefined,

            resetBudget: command.resetBudget === true,
        });
        return true;
    }
    /** setDynamicTileBlocker：设置运行期动态地块阻挡回调。 */
    setDynamicTileBlocker(blocker) {
        this.dynamicTileBlocker = typeof blocker === 'function' ? blocker : null;
    }
    /** addRuntimePortal：添加或替换运行时动态传送点。 */
    addRuntimePortal(portal) {
        if (!portal || !Number.isFinite(Number(portal.x)) || !Number.isFinite(Number(portal.y))) {
            return false;
        }
        const x = Math.trunc(Number(portal.x));
        const y = Math.trunc(Number(portal.y));
        if (!this.isInBounds(x, y)) {
            return false;
        }
        const normalized = {
            id: typeof portal.id === 'string' && portal.id.trim() ? portal.id.trim() : `${portal.kind ?? 'portal'}:${x},${y}`,
            x,
            y,
            targetMapId: typeof portal.targetMapId === 'string' && portal.targetMapId.trim() ? portal.targetMapId.trim() : this.template.id,
            targetInstanceId: typeof portal.targetInstanceId === 'string' && portal.targetInstanceId.trim() ? portal.targetInstanceId.trim() : null,
            targetX: Number.isFinite(Number(portal.targetX)) ? Math.trunc(Number(portal.targetX)) : this.template.spawnX,
            targetY: Number.isFinite(Number(portal.targetY)) ? Math.trunc(Number(portal.targetY)) : this.template.spawnY,
            targetPortalId: typeof portal.targetPortalId === 'string' && portal.targetPortalId.trim() ? portal.targetPortalId.trim() : undefined,
            direction: portal.direction === 'one_way' ? 'one_way' : 'two_way',
            kind: typeof portal.kind === 'string' && portal.kind.trim() ? portal.kind.trim() : 'portal',
            trigger: portal.trigger === 'auto' ? 'auto' : 'manual',
            hidden: portal.hidden === true,
            name: typeof portal.name === 'string' && portal.name.trim() ? portal.name.trim() : undefined,
            char: typeof portal.char === 'string' && portal.char.trim() ? portal.char.trim() : undefined,
            color: typeof portal.color === 'string' && portal.color.trim() ? portal.color.trim() : undefined,
            sectId: typeof portal.sectId === 'string' && portal.sectId.trim() ? portal.sectId.trim() : undefined,
        };
        const index = this.runtimePortals.findIndex((entry) => entry.x === x && entry.y === y);
        if (index >= 0) {
            this.runtimePortals[index] = normalized;
        }
        else {
            this.runtimePortals.push(normalized);
            this.runtimePortals.sort((left, right) => left.y - right.y || left.x - right.x);
        }
        this.worldRevision += 1;
        this.markPersistenceDirtyDomains(['overlay']);
        this.persistentRevision += 1;
        return true;
    }
    /** replaceTemplateForSectExpansion：宗门地图扩圈时替换模板并迁移运行态坐标。 */
    replaceTemplateForSectExpansion(nextTemplate) {
        if (!nextTemplate || !Number.isFinite(Number(nextTemplate.width)) || !Number.isFinite(Number(nextTemplate.height))) {
            return false;
        }
        const previousTemplate = this.template;
        const previousTilePlane = this.tilePlane;
        const previousCenterX = Number.isFinite(Number(previousTemplate.source?.sectCoreX)) ? Math.trunc(Number(previousTemplate.source.sectCoreX)) : Math.trunc(previousTemplate.width / 2);
        const previousCenterY = Number.isFinite(Number(previousTemplate.source?.sectCoreY)) ? Math.trunc(Number(previousTemplate.source.sectCoreY)) : Math.trunc(previousTemplate.height / 2);
        const nextCenterX = Number.isFinite(Number(nextTemplate.source?.sectCoreX)) ? Math.trunc(Number(nextTemplate.source.sectCoreX)) : Math.trunc(nextTemplate.width / 2);
        const nextCenterY = Number.isFinite(Number(nextTemplate.source?.sectCoreY)) ? Math.trunc(Number(nextTemplate.source.sectCoreY)) : Math.trunc(nextTemplate.height / 2);
        const offsetX = nextCenterX - previousCenterX;
        const offsetY = nextCenterY - previousCenterY;
        const players = Array.from(this.playersById.values());
        const tileDamageEntries = Array.from(this.tileDamageByTile.entries());
        this.template = nextTemplate;
        this.tilePlane = runtime_tile_plane_1.RuntimeTilePlane.fromTemplate(nextTemplate);
        this.meta.templateId = nextTemplate.id;
        const nextCellCapacity = this.tilePlane.getCellCapacity();
        this.occupancy = new Uint32Array(nextCellCapacity);
        this.auraByTile = new Int32Array(nextCellCapacity);
        this.auraByTile.set(nextTemplate.baseAuraByTile);
        this.tileResourceBuckets = new Map([[DEFAULT_TILE_AURA_RESOURCE_KEY, this.auraByTile]]);
        const baseAuraByTile = new Int32Array(nextCellCapacity);
        baseAuraByTile.set(nextTemplate.baseAuraByTile);
        this.baseTileResourceBuckets = new Map([[DEFAULT_TILE_AURA_RESOURCE_KEY, baseAuraByTile]]);
        this.changedTileResourceEntryCountByKey = new Map();
        this.changedAuraTileCount = 0;
        this.changedTileResourceEntryCount = 0;
        this.npcIdByTile.clear();
        this.npcsById.clear();
        this.landmarkIdByTile.clear();
        this.landmarksById.clear();
        this.containerIdByTile.clear();
        this.containersById.clear();
        this.runtimePortals = [];
        for (const player of players) {
            const nextX = Math.max(0, Math.min(nextTemplate.width - 1, Math.trunc(Number(player.x) || 0) + offsetX));
            const nextY = Math.max(0, Math.min(nextTemplate.height - 1, Math.trunc(Number(player.y) || 0) + offsetY));
            player.x = nextX;
            player.y = nextY;
            player.selfRevision += 1;
            this.setOccupied(nextX, nextY, player.handle);
        }
        this.tileDamageByTile.clear();
        this.temporaryTileByTile.clear();
        for (const [tileIndex, state] of tileDamageEntries) {
            const oldIndex = Math.trunc(Number(tileIndex));
            const oldX = previousTilePlane.getX(oldIndex);
            const oldY = previousTilePlane.getY(oldIndex);
            const nextX = oldX + offsetX;
            const nextY = oldY + offsetY;
            if (!this.isInBounds(nextX, nextY)) {
                continue;
            }
            this.tileDamageByTile.set(this.toTileIndex(nextX, nextY), { ...state });
        }
        this.worldRevision += 1;
        this.persistentRevision += 1;
        this.markPersistenceDirtyDomains(['overlay', 'tile_damage']);
        return true;
    }
    /** activateRuntimeTile：按坐标激活一个运行时地块，已存在坐标不会被覆盖。 */
    activateRuntimeTile(x, y, tileType, options = {}) {
        if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) {
            return { created: false, tileIndex: -1 };
        }
        const normalizedX = Math.trunc(Number(x));
        const normalizedY = Math.trunc(Number(y));
        const existing = this.toTileIndex(normalizedX, normalizedY);
        if (existing >= 0) {
            return { created: false, tileIndex: existing };
        }
        const tileIndex = this.tilePlane.activateCell(normalizedX, normalizedY, tileType);
        this.ensureCellStorageCapacity(tileIndex + 1);
        if (Number.isFinite(Number(options?.aura))) {
            this.auraByTile[tileIndex] = Math.max(0, Math.trunc(Number(options.aura)));
            const baseAura = this.baseTileResourceBuckets.get(DEFAULT_TILE_AURA_RESOURCE_KEY);
            if (baseAura) {
                baseAura[tileIndex] = this.auraByTile[tileIndex];
            }
        }
        this.worldRevision += 1;
        this.persistentRevision += 1;
        this.markPersistenceDirtyDomains(['tile_cell']);
        return { created: true, tileIndex };
    }
    /** forEachRuntimeTile：遍历当前运行时真实存在的地块坐标。 */
    forEachRuntimeTile(visitor) {
        if (typeof visitor !== 'function' || !this.tilePlane || typeof this.tilePlane.getCellCount !== 'function') {
            return;
        }
        const count = this.tilePlane.getCellCount();
        for (let tileIndex = 0; tileIndex < count; tileIndex += 1) {
            visitor(this.tilePlane.getX(tileIndex), this.tilePlane.getY(tileIndex), tileIndex);
        }
    }
    /** setPlayerMoveSpeed：设置玩家移动速度。 */
    setPlayerMoveSpeed(playerId, moveSpeed) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const player = this.playersById.get(playerId);
        if (!player) {
            return false;
        }

        const normalized = Number.isFinite(moveSpeed) ? Math.max(0, Math.round(moveSpeed)) : 0;
        player.moveSpeed = normalized;
        return true;
    }
    /** enqueuePortalUse：把传送点使用请求排入下一次 tick。 */
    enqueuePortalUse(command) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.playersById.has(command.playerId)) {
            return false;
        }
        this.pendingCommands.set(command.playerId, { kind: 'portal' });
        return true;
    }
    /** cancelPendingCommand：取消玩家在实例侧排队的待执行命令。 */
    cancelPendingCommand(playerId) {
        return this.pendingCommands.delete(playerId);
    }
    /** tryPortalTransfer：尝试按当前站位触发传送点跳转。 */
    tryPortalTransfer(playerId, reason) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const player = this.playersById.get(playerId);
        if (!player) {
            return null;
        }

        const portal = reason === 'manual_portal'
            ? this.getInteractablePortalNear(player.x, player.y)
            : this.getPortalAt(player.x, player.y);
        if (!portal) {
            return null;
        }
        if (reason === 'manual_portal' && portal.trigger !== 'manual') {
            return null;
        }
        if (reason === 'auto_portal' && portal.trigger !== 'auto') {
            return null;
        }
        return this.buildTransfer(player, portal, reason);
    }
    /** tickOnce：推进当前地图实例的一个逻辑 tick。 */
    tickOnce() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.tick += 1;
        if (this.meta?.persistent === true && shouldMarkTimePersistenceDirty(this.tick)) {
            this.markPersistenceDirtyDomains([MAP_TIME_PERSISTENCE_DOMAIN]);
            this.persistentRevision += 1;
        }

        const transfers = [];

        const monsterActions = [];
        for (const [playerId, command] of this.pendingCommands) {
            const player = this.playersById.get(playerId);
            if (!player) {
                continue;
            }
            if (command.kind === 'move') {
                if (command.resetBudget === true) {
                    player.movePoints = 0;
                    player.lastMoveBudgetTick = Math.max(0, this.tick - 1);
                }
                this.applyMove(player, command.direction, transfers, command.continuous === true, command.maxSteps, command.path);
            }
            else if (command.kind === 'portal') {

                const transfer = this.tryPortalTransfer(playerId, 'manual_portal');
                if (transfer) {
                    transfers.push(transfer);
                }
            }
            player.lastResolvedTick = this.tick;
        }
        this.pendingCommands.clear();
        this.advanceMonsters(monsterActions);
        return {
            transfers,
            monsterActions,
        };
    }
    /** buildPlayerView：构建玩家当前视野快照。 */
    buildPlayerView(playerId, radius = DEFAULT_VIEW_RADIUS) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const player = this.playersById.get(playerId);
        if (!player) {
            return null;
        }

        const visibleTileVisibility = this.collectVisibleTileVisibility(player.x, player.y, radius);
        const visibleTileIndices = visibleTileVisibility.indices;

        const visiblePlayers = this.collectVisiblePlayers(player, radius, visibleTileVisibility);

        const localMonsters = this.collectLocalMonsters(player.x, player.y, radius, visibleTileVisibility);

        const localNpcs = this.collectLocalNpcs(player.x, player.y, radius, visibleTileVisibility);

        const localPortals = this.collectLocalPortals(player.x, player.y, radius, visibleTileVisibility);

        const localLandmarks = this.collectLocalLandmarks(player.x, player.y, radius, visibleTileVisibility);

        const localSafeZones = this.collectLocalSafeZones(player.x, player.y, radius, visibleTileVisibility);

        const localContainers = this.collectLocalContainers(player.x, player.y, radius, visibleTileVisibility);

        const localGroundPiles = this.collectLocalGroundPiles(player.x, player.y, radius, visibleTileVisibility);
        return {
            playerId: player.playerId,
            sessionId: player.sessionId,
            tick: this.tick,
            worldRevision: this.worldRevision,
            selfRevision: player.selfRevision,
            instance: {
                instanceId: this.meta.instanceId,
                templateId: this.meta.templateId,
                name: this.template.name,
                kind: this.meta.kind,
                width: this.template.width,
                height: this.template.height,
            },
            self: {
                name: player.name,
                displayName: player.displayName,
                x: player.x,
                y: player.y,
                facing: player.facing,
                buffs: player.buffs,
            },
            visibleTileIndices: Array.from(visibleTileIndices),
            visibleTileKeys: Array.from(visibleTileVisibility.keys),
            visiblePlayers,
            localMonsters,
            localNpcs,
            localPortals,
            localLandmarks,
            localSafeZones,
            localContainers,
            localGroundPiles,
        };
    }
    /** snapshot：构建地图实例快照。 */
    snapshot() {
        const snapshot: Record<string, unknown> = {
            instanceId: this.meta.instanceId,
            displayName: this.meta.displayName,
            templateId: this.meta.templateId,
            templateName: this.template.name,
            mapGroupId: this.template.mapGroupId,
            mapGroupName: this.template.mapGroupName,
            mapGroupOrder: this.template.mapGroupOrder,
            mapGroupMemberOrder: this.template.mapGroupMemberOrder,
            kind: this.meta.kind,
            linePreset: this.meta.linePreset,
            lineIndex: this.meta.lineIndex,
            instanceOrigin: this.meta.instanceOrigin,
            defaultEntry: this.meta.defaultEntry === true,
            persistent: this.meta.persistent === true,
            persistentPolicy: this.meta.persistentPolicy,
            runtimeStatus: this.meta.runtimeStatus,
            status: this.meta.status,
            supportsPvp: this.meta.supportsPvp === true,
            canDamageTile: this.meta.canDamageTile === true,
            tick: this.tick,
            worldRevision: this.worldRevision,
            persistenceRevision: this.persistentRevision,
            playerCount: this.playersById.size,
            width: this.template.width,
            height: this.template.height,
            changedAuraTileCount: this.changedAuraTileCount,
            groundPileCount: this.groundPilesByTile.size,
            monsterCount: this.monstersByRuntimeId.size,
            aliveMonsterCount: countAliveMonsters(this.monstersByRuntimeId),
            safeZoneCount: this.template.safeZones.length,
            landmarkCount: this.landmarksById.size,
            containerCount: this.containersById.size,
            players: Array.from(this.playersById.values(), (player) => ({
                playerId: player.playerId,
                sessionId: player.sessionId,
                x: player.x,
                y: player.y,
            })),
        };
        if (typeof this.meta.destroyAt === 'string' && this.meta.destroyAt.trim()) {
            snapshot.destroyAt = this.meta.destroyAt;
        }
        return snapshot;
    }
    /** forEachPathingBlocker：遍历当前实例里的寻路阻挡地块。 */
    forEachPathingBlocker(excludePlayerId, visitor) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        for (const npc of this.npcsById.values()) {
            /** visitor：visitor。 */
            visitor(npc.x, npc.y);
        }
        for (const player of this.playersById.values()) {
            if (player.playerId === excludePlayerId) {
                continue;
            }
            /** visitor：visitor。 */
            visitor(player.x, player.y);
        }
        for (const monster of this.monstersByRuntimeId.values()) {
            if (!monster.alive) {
                continue;
            }
            /** visitor：visitor。 */
            visitor(monster.x, monster.y);
        }
    }
    /** getTileAura：读取指定地块灵气。 */
    getTileAura(x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isInBounds(x, y)) {
            return null;
        }
        return this.getTileResource(DEFAULT_TILE_AURA_RESOURCE_KEY, x, y);
    }
    /** getTileResource：读取指定地块的指定资源。 */
    getTileResource(resourceKey, x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isInBounds(x, y)) {
            return null;
        }
        return this.getTileResourceValueByIndex(resourceKey, this.toTileIndex(x, y));
    }
    /** listTileResources：读取指定地块的全部有效资源。 */
    listTileResources(x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isInBounds(x, y)) {
            return null;
        }
        const tileIndex = this.toTileIndex(x, y);
        const entries = [];
        for (const [resourceKey, bucket] of this.tileResourceBuckets.entries()) {
            const value = bucket[tileIndex] ?? 0;
            if (value <= 0) {
                continue;
            }
            entries.push({
                resourceKey,
                value,
                sourceValue: this.getTileResourceBaseValueByIndex(resourceKey, tileIndex),
            });
        }
        entries.sort((left, right) => {
            if (left.resourceKey === DEFAULT_TILE_AURA_RESOURCE_KEY && right.resourceKey !== DEFAULT_TILE_AURA_RESOURCE_KEY) {
                return -1;
            }
            if (left.resourceKey !== DEFAULT_TILE_AURA_RESOURCE_KEY && right.resourceKey === DEFAULT_TILE_AURA_RESOURCE_KEY) {
                return 1;
            }
            return left.resourceKey.localeCompare(right.resourceKey, 'zh-Hans-CN');
        });
        return entries;
    }
    /** getTileGroundPile：读取指定地块地面物品堆。 */
    getTileGroundPile(x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isInBounds(x, y)) {
            return null;
        }
        return toGroundPileView(this.groundPilesByTile.get(this.toTileIndex(x, y)) ?? null);
    }
    /** getTileCombatState：读取指定地块战斗状态。 */
    getTileCombatState(x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isInBounds(x, y)) {
            return null;
        }

        const tileIndex = this.toTileIndex(x, y);
        const temporary = this.temporaryTileByTile.get(tileIndex);
        if (temporary) {
            return {
                tileType: temporary.tileType,
                hp: Math.max(0, Math.trunc(Number(temporary.hp) || 0)),
                maxHp: Math.max(1, Math.trunc(Number(temporary.maxHp) || 1)),
                modifiedAt: temporary.modifiedAt ?? null,
                respawnLeft: 0,
                destroyed: false,
                temporary: true,
                expiresAtTick: Math.max(0, Math.trunc(Number(temporary.expiresAtTick) || 0)),
            };
        }
        const tileType = this.getBaseTileType(x, y);

        const maxHp = resolveTileDurability(this.template, tileType, x, y);
        if (maxHp <= 0) {
            return null;
        }

        const current = this.tileDamageByTile.get(tileIndex);
        return {
            tileType,
            hp: current?.hp ?? maxHp,
            maxHp,
            modifiedAt: current?.modifiedAt ?? null,
            respawnLeft: current?.destroyed === true ? Math.max(0, Math.trunc(Number(current?.respawnLeft) || 0)) : 0,

            destroyed: current?.destroyed === true,
        };
    }
    /** damageTile：对可破坏地块施加伤害。 */
    damageTile(x, y, damage) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (this.meta.canDamageTile !== true) {
            return null;
        }

        const current = this.getTileCombatState(x, y);
        if (!current) {
            return null;
        }
        if (current.destroyed === true) {
            return null;
        }

        const normalizedDamage = Math.max(0, Math.round(damage));
        if (normalizedDamage <= 0) {
            return {
                destroyed: current.destroyed,
                hp: current.hp,
                maxHp: current.maxHp,
                appliedDamage: 0,
                targetType: current.tileType,
            };
        }

        const tileIndex = this.toTileIndex(x, y);
        const temporary = this.temporaryTileByTile.get(tileIndex);
        if (temporary) {
            const appliedDamage = Math.min(Math.max(0, Math.trunc(Number(temporary.hp) || 0)), normalizedDamage);
            const nextHp = Math.max(0, Math.trunc(Number(temporary.hp) || 0) - appliedDamage);
            const destroyed = nextHp <= 0;
            if (destroyed) {
                this.temporaryTileByTile.delete(tileIndex);
            }
            else {
                this.temporaryTileByTile.set(tileIndex, {
                    ...temporary,
                    hp: nextHp,
                    modifiedAt: Date.now(),
                });
            }
            this.worldRevision += 1;
            this.markPersistenceDirtyDomains(['temporary_tile']);
            this.persistentRevision += 1;
            return {
                destroyed,
                hp: nextHp,
                maxHp: Math.max(1, Math.trunc(Number(temporary.maxHp) || 1)),
                appliedDamage,
                targetType: temporary.tileType,
                temporary: true,
            };
        }

        const appliedDamage = Math.min(current.hp, normalizedDamage);

        const nextHp = Math.max(0, current.hp - appliedDamage);
        const destroyed = nextHp <= 0;
        this.tileDamageByTile.set(tileIndex, {
            hp: nextHp,
            maxHp: current.maxHp,

            destroyed,
            respawnLeft: destroyed ? calculateTileRestoreTicks(current.tileType) : 0,
            modifiedAt: Date.now(),
        });
        this.worldRevision += 1;
        this.markTileDamagePersistenceDirty(tileIndex);
        this.persistentRevision += 1;
        return {

            destroyed,
            hp: nextHp,
            maxHp: current.maxHp,
            appliedDamage,
            targetType: current.tileType,
        };
    }
    /** createTemporaryTile：创建或刷新技能生成的临时地块。 */
    createTemporaryTile(x, y, tileType, maxHp, durationTicks, currentTick, options = {}) {
        if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) {
            return { created: false, reason: 'invalid_coordinate' };
        }
        const normalizedX = Math.trunc(Number(x));
        const normalizedY = Math.trunc(Number(y));
        const availability = this.resolveTemporaryTileAvailability(normalizedX, normalizedY);
        if (availability.allowed !== true) {
            return { created: false, reason: availability.reason };
        }
        const tileIndex = availability.tileIndex;
        const existingTemporary = this.temporaryTileByTile.get(tileIndex);
        const hp = Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.round(Number(maxHp) || 1)));
        const nowTick = Math.max(0, Math.trunc(Number(currentTick) || this.tick || 0));
        const ttl = Math.max(1, Math.trunc(Number(durationTicks) || 1));
        const now = Date.now();
        this.temporaryTileByTile.set(tileIndex, {
            tileType: typeof tileType === 'string' && tileType.length > 0 ? tileType : shared_1.TileType.Stone,
            hp,
            maxHp: hp,
            expiresAtTick: nowTick + ttl,
            ownerPlayerId: typeof options?.ownerPlayerId === 'string' ? options.ownerPlayerId : null,
            sourceSkillId: typeof options?.sourceSkillId === 'string' ? options.sourceSkillId : null,
            createdAt: existingTemporary?.createdAt ?? now,
            modifiedAt: now,
        });
        this.worldRevision += 1;
        this.markPersistenceDirtyDomains(['temporary_tile']);
        this.persistentRevision += 1;
        return { created: true, refreshed: Boolean(existingTemporary), tileIndex };
    }
    /** canCreateTemporaryTile：判断指定坐标是否允许生成临时地块。 */
    canCreateTemporaryTile(x, y) {
        return this.resolveTemporaryTileAvailability(Math.trunc(Number(x)), Math.trunc(Number(y))).allowed === true;
    }
    /** resolveTemporaryTileAvailability：返回临时地块生成可用性。 */
    resolveTemporaryTileAvailability(x, y) {
        if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) {
            return { allowed: false, reason: 'invalid_coordinate', tileIndex: -1 };
        }
        const normalizedX = Math.trunc(Number(x));
        const normalizedY = Math.trunc(Number(y));
        if (!this.isInBounds(normalizedX, normalizedY)) {
            return { allowed: false, reason: 'out_of_bounds', tileIndex: -1 };
        }
        const tileIndex = this.toTileIndex(normalizedX, normalizedY);
        if (this.temporaryTileByTile.has(tileIndex)) {
            return { allowed: true, reason: 'refresh', tileIndex };
        }
        if (this.hasBlockingEntityAt(normalizedX, normalizedY)) {
            return { allowed: false, reason: 'blocked', tileIndex };
        }
        if (!(0, shared_1.isTileTypeWalkable)(this.getEffectiveTileType(normalizedX, normalizedY))) {
            return { allowed: false, reason: 'not_walkable', tileIndex };
        }
        return { allowed: true, reason: 'available', tileIndex };
    }
    /** advanceTemporaryTiles：推进临时地块过期；固脉阵稳定范围内暂停自动消失。 */
    advanceTemporaryTiles(currentTick = this.tick, isTerrainStabilized = null) {
        if (this.temporaryTileByTile.size === 0) {
            return false;
        }
        const normalizedTick = Math.max(0, Math.trunc(Number(currentTick) || 0));
        let changed = false;
        for (const [tileIndex, state] of Array.from(this.temporaryTileByTile.entries())) {
            if (!state || !Number.isFinite(Number(tileIndex))) {
                this.temporaryTileByTile.delete(tileIndex);
                changed = true;
                continue;
            }
            const x = this.tilePlane.getX(Math.trunc(Number(tileIndex)));
            const y = this.tilePlane.getY(Math.trunc(Number(tileIndex)));
            if (typeof isTerrainStabilized === 'function' && isTerrainStabilized(x, y) === true) {
                continue;
            }
            const expiresAtTick = Math.max(0, Math.trunc(Number(state.expiresAtTick) || 0));
            if (expiresAtTick > 0 && normalizedTick >= expiresAtTick) {
                this.temporaryTileByTile.delete(tileIndex);
                changed = true;
            }
        }
        if (changed) {
            this.worldRevision += 1;
            this.markPersistenceDirtyDomains(['temporary_tile']);
            this.persistentRevision += 1;
        }
        return changed;
    }
    /** advanceTileRecovery：推进可破坏地块的自然修复与复生。 */
    advanceTileRecovery(isTerrainStabilized) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (this.tileDamageByTile.size === 0) {
            return false;
        }

        const now = Date.now();
        let changed = false;
        for (const [tileIndex, current] of Array.from(this.tileDamageByTile.entries())) {
            if (!Number.isFinite(Number(tileIndex))) {
                continue;
            }
            const normalizedTileIndex = Math.trunc(Number(tileIndex));
            const x = this.tilePlane.getX(normalizedTileIndex);
            const y = this.tilePlane.getY(normalizedTileIndex);
            const tileType = this.getBaseTileType(x, y);
            const maxHp = Math.max(1, Math.trunc(Number(current?.maxHp) || resolveTileDurability(this.template, tileType)));
            if (current?.destroyed === true) {
                if (typeof isTerrainStabilized === 'function' && isTerrainStabilized(x, y) === true) {
                    continue;
                }
                const rawRespawnLeft = Math.trunc(Number(current.respawnLeft));
                const respawnLeft = Number.isFinite(rawRespawnLeft)
                    ? Math.max(0, rawRespawnLeft)
                    : calculateTileRestoreTicks(tileType);
                if (respawnLeft <= 1) {
                    if (this.hasBlockingEntityAt(x, y)) {
                        this.tileDamageByTile.set(tileIndex, {
                            hp: 0,
                            maxHp,
                            destroyed: true,
                            respawnLeft: calculateTileRestoreRetryTicks(tileType),
                            modifiedAt: now,
                        });
                    }
                    else {
                        this.tileDamageByTile.delete(tileIndex);
                    }
                }
                else {
                    this.tileDamageByTile.set(tileIndex, {
                        hp: 0,
                        maxHp,
                        destroyed: true,
                        respawnLeft: respawnLeft - 1,
                        modifiedAt: now,
                    });
                }
                this.markTileDamagePersistenceDirty(tileIndex);
                changed = true;
                continue;
            }

            const hp = Math.max(0, Math.min(maxHp, Math.trunc(Number(current?.hp) || maxHp)));
            if (hp >= maxHp) {
                this.tileDamageByTile.delete(tileIndex);
                this.markTileDamagePersistenceDirty(tileIndex);
                changed = true;
                continue;
            }
            const repairAmount = Math.max(1, Math.floor(maxHp * shared_1.TERRAIN_REGEN_RATE_PER_TICK));
            const nextHp = Math.min(maxHp, hp + repairAmount);
            if (nextHp >= maxHp) {
                this.tileDamageByTile.delete(tileIndex);
            }
            else {
                this.tileDamageByTile.set(tileIndex, {
                    hp: nextHp,
                    maxHp,
                    destroyed: false,
                    respawnLeft: 0,
                    modifiedAt: now,
                });
            }
            this.markTileDamagePersistenceDirty(tileIndex);
            changed = true;
        }

        if (changed) {
            this.worldRevision += 1;
            this.persistentRevision += 1;
        }
        return changed;
    }
    /** hasBlockingEntityAt：判断指定地块上是否已有会阻挡地形复生的单位。 */
    hasBlockingEntityAt(x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isInBounds(x, y)) {
            return true;
        }
        const tileIndex = this.toTileIndex(x, y);
        return this.occupancy[tileIndex] !== INVALID_OCCUPANCY
            || this.monsterRuntimeIdByTile.has(tileIndex)
            || this.npcIdByTile.has(tileIndex)
            || this.temporaryTileByTile.has(tileIndex);
    }
    /** getBaseTileType：读取模板原始地块类型。 */
    getBaseTileType(x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const tileIndex = this.toTileIndex(x, y);
        if (tileIndex < 0) {
            return shared_1.TileType.Floor;
        }
        return this.tilePlane.getTileType(tileIndex);
    }
    /** getEffectiveTileType：读取地块当前生效类型，已摧毁地块按空地处理。 */
    getEffectiveTileType(x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isInBounds(x, y)) {
            return shared_1.TileType.Floor;
        }
        const tileIndex = this.toTileIndex(x, y);
        const temporary = this.temporaryTileByTile.get(tileIndex);
        if (temporary) {
            return temporary.tileType;
        }
        const current = this.tileDamageByTile.get(tileIndex);
        if (current?.destroyed === true) {
            return shared_1.TileType.Floor;
        }
        return this.getBaseTileType(x, y);
    }
    /** getGroundPileBySourceId：按来源 ID 读取地面物品堆。 */
    getGroundPileBySourceId(sourceId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        for (const pile of this.groundPilesByTile.values()) {
            if (pile.sourceId !== sourceId) {
                continue;
            }
            return snapshotGroundPile(pile);
        }
        return null;
    }
    /** getPlayersAtTile：读取指定地块上的玩家。 */
    getPlayersAtTile(x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isInBounds(x, y)) {
            return [];
        }

        const result = [];
        for (const player of this.playersById.values()) {
            if (player.x === x && player.y === y) {
                result.push({
                    ...player,
                });
            }
        }
        return result;
    }
    /** getPortalAtTile：读取指定地块上的传送点。 */
    getPortalAtTile(x, y) {
        return this.getPortalAt(x, y);
    }
    /** getLandmarkAtTile：读取指定地块上的地标。 */
    getLandmarkAtTile(x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isInBounds(x, y)) {
            return null;
        }

        const landmarkId = this.landmarkIdByTile.get(this.toTileIndex(x, y));
        if (!landmarkId) {
            return null;
        }

        const landmark = this.landmarksById.get(landmarkId);
        return landmark ? snapshotLandmark(landmark) : null;
    }
    /** isSafeZoneTile：判断指定地块是否属于安全区。 */
    isSafeZoneTile(x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isInBounds(x, y)) {
            return false;
        }
        return this.template.safeZoneMask[this.toTileIndex(x, y)] === 1;
    }
    /** getContainerAtTile：读取指定地块上的容器。 */
    getContainerAtTile(x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isInBounds(x, y)) {
            return null;
        }

        const containerId = this.containerIdByTile.get(this.toTileIndex(x, y));
        if (!containerId) {
            return null;
        }

        const container = this.containersById.get(containerId);
        return container ? snapshotContainer(container) : null;
    }
    /** getContainerById：按容器 ID 读取容器。 */
    getContainerById(containerId) {

        const container = this.containersById.get(containerId);
        return container ? snapshotContainer(container) : null;
    }
    /** getSafeZoneAtTile：读取指定地块上的安全区信息。 */
    getSafeZoneAtTile(x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isInBounds(x, y)) {
            return null;
        }
        for (const zone of this.template.safeZones) {
            if ((0, shared_1.isOffsetInRange)(x - zone.x, y - zone.y, zone.radius)) {
                return snapshotSafeZone(zone);
            }
        }
        return null;
    }
    /** isPointInSafeZone：判断坐标是否落在安全区内。 */
    isPointInSafeZone(x, y) {
        return this.getSafeZoneAtTile(x, y) !== null;
    }
    /** listMonsters：列出实例中的妖兽。 */
    listMonsters() {
        return Array.from(this.monstersByRuntimeId.values(), (monster) => snapshotMonster(monster))
            .sort((left, right) => left.runtimeId.localeCompare(right.runtimeId, 'zh-Hans-CN'));
    }
    /** getMonster：按运行时 ID 读取妖兽。 */
    getMonster(runtimeId) {

        const monster = this.monstersByRuntimeId.get(runtimeId);
        return monster ? snapshotMonster(monster) : null;
    }
    /** getNpc：按 ID 读取 NPC。 */
    getNpc(npcId) {

        const npc = this.npcsById.get(npcId);
        return npc ? snapshotNpc(npc) : null;
    }
    /** getMonsterDamageContributionEntries：读取妖兽受到的伤害贡献记录。 */
    getMonsterDamageContributionEntries(runtimeId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const monster = this.monstersByRuntimeId.get(runtimeId);
        if (!monster) {
            return [];
        }
        return Object.entries(monster.damageContributors).map(([playerId, damage]) => ({
            playerId,
            damage,
        }));
    }
    /** getAdjacentNpc：读取玩家相邻的 NPC。 */
    getAdjacentNpc(playerId, npcId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const player = this.playersById.get(playerId);
        if (!player) {
            return null;
        }

        const npc = this.npcsById.get(npcId);
        if (!npc || chebyshevDistance(player.x, player.y, npc.x, npc.y) > 1) {
            return null;
        }
        return snapshotNpc(npc);
    }
    /** applyDamageToMonster：对妖兽应用伤害并检查击败结果。 */
    applyDamageToMonster(runtimeId, amount, attackerPlayerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const monster = this.monstersByRuntimeId.get(runtimeId);
        if (!monster || !monster.alive) {
            return null;
        }
        if (attackerPlayerId && this.playersById.has(attackerPlayerId)) {
            monster.aggroTargetPlayerId = attackerPlayerId;
        }

        const appliedDamage = Math.max(0, Math.min(monster.hp, Math.trunc(amount)));
        if (appliedDamage <= 0) {
            return {
                monster: snapshotMonster(monster),
                appliedDamage: 0,
                defeated: false,
            };
        }
        if (attackerPlayerId && this.playersById.has(attackerPlayerId)) {
            monster.damageContributors[attackerPlayerId] = (monster.damageContributors[attackerPlayerId] ?? 0) + appliedDamage;
        }
        monster.hp = Math.max(0, monster.hp - appliedDamage);

        const defeated = monster.hp <= 0;
        if (defeated) {
            this.markMonsterDefeated(monster);
        }
        else {
            this.worldRevision += 1;
        }
        return {
            monster: snapshotMonster(monster),
            appliedDamage,
            defeated,
        };
    }
    /** applyTemporaryBuffToMonster：给妖兽应用临时 Buff。 */
    applyTemporaryBuffToMonster(runtimeId, buff) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const monster = this.monstersByRuntimeId.get(runtimeId);
        if (!monster || !monster.alive) {
            return null;
        }

        const existing = monster.buffs.find((entry) => entry.buffId === buff.buffId);
        if (existing) {
            existing.remainingTicks = Math.max(existing.remainingTicks, buff.remainingTicks);
            existing.duration = Math.max(existing.duration, buff.duration);
            existing.stacks = Math.min(existing.maxStacks, Math.max(existing.stacks, buff.stacks));
            existing.attrs = buff.attrs ? { ...buff.attrs } : undefined;
            existing.stats = buff.stats ? { ...buff.stats } : undefined;
            existing.qiProjection = buff.qiProjection ? buff.qiProjection.map((entry) => ({ ...entry })) : undefined;
            existing.sourceSkillId = buff.sourceSkillId;
            existing.sourceSkillName = buff.sourceSkillName;
            existing.color = buff.color;
        }
        else {
            monster.buffs.push(cloneTemporaryBuff(buff));
        }
        monster.buffs.sort((left, right) => left.buffId.localeCompare(right.buffId, 'zh-Hans-CN'));
        if (recalculateMonsterDerivedState(monster)) {
            this.worldRevision += 1;
        }
        return snapshotMonster(monster);
    }
    /** defeatMonster：直接结算一只妖兽被击败后的占用释放。 */
    defeatMonster(runtimeId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const monster = this.monstersByRuntimeId.get(runtimeId);
        if (!monster || !monster.alive) {
            return null;
        }
        this.markMonsterDefeated(monster);
        return snapshotMonster(monster);
    }
    /** addTileAura：给地块叠加灵气。 */
    addTileAura(x, y, amount) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        return this.addTileResource(DEFAULT_TILE_AURA_RESOURCE_KEY, x, y, amount);
    }
    /** addTileResource：给地块叠加指定资源。 */
    addTileResource(resourceKey, x, y, amount) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isInBounds(x, y) || !Number.isFinite(amount)) {
            return null;
        }

        const normalizedAmount = Math.trunc(amount);
        if (normalizedAmount === 0) {
            return this.getTileResource(resourceKey, x, y);
        }

        const tileIndex = this.toTileIndex(x, y);
        const previous = this.getTileResourceValueByIndex(resourceKey, tileIndex);
        const next = Math.max(0, previous + normalizedAmount);
        if (next === previous) {
            return next;
        }
        this.setTileResourceValueByIndex(resourceKey, tileIndex, next, previous);
        return next;
    }
    /** hydrateAura：用持久化数据回填地块灵气。 */
    hydrateAura(entries) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.hydrateTileResources((entries ?? []).map((entry) => ({
            resourceKey: DEFAULT_TILE_AURA_RESOURCE_KEY,
            tileIndex: entry.tileIndex,
            value: entry.value,
        })));
    }
    /** hydrateTileResources：用持久化数据回填地块资源。 */
    hydrateTileResources(entries) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.tileResourceBuckets.clear();
        this.auraByTile.set(this.template.baseAuraByTile);
        this.tileResourceBuckets.set(DEFAULT_TILE_AURA_RESOURCE_KEY, this.auraByTile);
        this.changedAuraTileCount = 0;
        this.changedTileResourceEntryCount = 0;
        this.changedTileResourceEntryCountByKey.clear();
        this.clearDirtyDomains();
        for (const entry of entries) {
            if (!entry
                || typeof entry.resourceKey !== 'string'
                || !entry.resourceKey
                || !Number.isFinite(entry.tileIndex)
                || !Number.isFinite(entry.value)) {
                continue;
            }

            const tileIndex = Math.trunc(entry.tileIndex);
            if (tileIndex < 0 || tileIndex >= this.auraByTile.length) {
                continue;
            }

            const next = Math.max(0, Math.trunc(entry.value));
            if (entry.resourceKey !== DEFAULT_TILE_AURA_RESOURCE_KEY && next <= 0) {
                continue;
            }
            const bucket = this.getOrCreateTileResourceBucket(entry.resourceKey);
            const previous = bucket[tileIndex] ?? 0;
            bucket[tileIndex] = next;
            this.applyTileResourceDirtyCounter(entry.resourceKey, tileIndex, previous, next);
        }
        this.persistentRevision = 1;
        this.persistedRevision = 1;
        this.clearDirtyDomains();
    }
    /** hydrateTileDamage：用持久化数据回填可破坏地块状态。 */
    hydrateTileDamage(entries) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.tileDamageByTile.clear();
        if (!Array.isArray(entries)) {
            this.persistentRevision = 1;
            this.persistedRevision = 1;
            this.clearDirtyDomains();
            return;
        }
        for (const entry of entries) {
            if (!entry || !Number.isFinite(Number(entry.tileIndex))) {
                continue;
            }
            const tileIndex = Math.trunc(Number(entry.tileIndex));
            const hasCoordinate = Number.isFinite(Number(entry.x)) && Number.isFinite(Number(entry.y));
            const resolvedTileIndex = hasCoordinate
                ? this.toTileIndex(Math.trunc(Number(entry.x)), Math.trunc(Number(entry.y)))
                : tileIndex;
            if (resolvedTileIndex < 0 || resolvedTileIndex >= this.auraByTile.length) {
                continue;
            }
            const x = this.tilePlane.getX(resolvedTileIndex);
            const y = this.tilePlane.getY(resolvedTileIndex);
            const tileType = this.getBaseTileType(x, y);
            const resolvedMaxHp = resolveTileDurability(this.template, tileType, x, y);
            if (resolvedMaxHp <= 0) {
                continue;
            }
            const maxHp = Math.max(1, Math.trunc(Number(entry.maxHp) || resolvedMaxHp));
            const destroyed = entry.destroyed === true;
            const hp = destroyed
                ? 0
                : Math.max(1, Math.min(maxHp - 1, Math.trunc(Number(entry.hp) || maxHp)));
            const respawnLeft = destroyed
                ? normalizeTileRestoreTicksLeft(entry.respawnLeft, tileType)
                : 0;
            if (!destroyed && hp >= maxHp) {
                continue;
            }
            this.tileDamageByTile.set(resolvedTileIndex, {
                hp,
                maxHp,
                destroyed,
                respawnLeft,
                modifiedAt: Number.isFinite(Number(entry.modifiedAt)) ? Math.max(0, Math.trunc(Number(entry.modifiedAt))) : Date.now(),
            });
        }
        this.persistentRevision = 1;
        this.persistedRevision = 1;
        this.clearDirtyDomains();
    }
    /** hydrateTemporaryTiles：用持久化数据回填技能生成的临时地块。 */
    hydrateTemporaryTiles(entries) {
        this.temporaryTileByTile.clear();
        if (!Array.isArray(entries)) {
            this.clearDirtyDomains();
            return;
        }
        for (const entry of entries) {
            if (!entry || !Number.isFinite(Number(entry.tileIndex))) {
                continue;
            }
            const tileIndex = Math.trunc(Number(entry.tileIndex));
            const hasCoordinate = Number.isFinite(Number(entry.x)) && Number.isFinite(Number(entry.y));
            const resolvedTileIndex = hasCoordinate
                ? this.toTileIndex(Math.trunc(Number(entry.x)), Math.trunc(Number(entry.y)))
                : tileIndex;
            if (resolvedTileIndex < 0 || resolvedTileIndex >= this.auraByTile.length) {
                continue;
            }
            const hp = Math.max(1, Math.trunc(Number(entry.hp) || 1));
            const maxHp = Math.max(hp, Math.trunc(Number(entry.maxHp) || hp));
            const expiresAtTick = Math.max(1, Math.trunc(Number(entry.expiresAtTick) || 1));
            this.temporaryTileByTile.set(resolvedTileIndex, {
                tileType: typeof entry.tileType === 'string' && entry.tileType.length > 0 ? entry.tileType : shared_1.TileType.Stone,
                hp,
                maxHp,
                expiresAtTick,
                ownerPlayerId: typeof entry.ownerPlayerId === 'string' && entry.ownerPlayerId.trim() ? entry.ownerPlayerId.trim() : null,
                sourceSkillId: typeof entry.sourceSkillId === 'string' && entry.sourceSkillId.trim() ? entry.sourceSkillId.trim() : null,
                createdAt: Number.isFinite(Number(entry.createdAt)) ? Math.max(0, Math.trunc(Number(entry.createdAt))) : Date.now(),
                modifiedAt: Number.isFinite(Number(entry.modifiedAt)) ? Math.max(0, Math.trunc(Number(entry.modifiedAt))) : Date.now(),
            });
        }
        this.clearDirtyDomains();
    }
    /** hydrateRuntimeTiles：用持久化动态地块回填稀疏地块平面。 */
    hydrateRuntimeTiles(entries) {
        if (!Array.isArray(entries) || entries.length === 0) {
            return;
        }
        for (const entry of entries) {
            if (!entry || !Number.isFinite(Number(entry.x)) || !Number.isFinite(Number(entry.y))) {
                continue;
            }
            const x = Math.trunc(Number(entry.x));
            const y = Math.trunc(Number(entry.y));
            const tileType = typeof entry.tileType === 'string' && entry.tileType.length > 0
                ? entry.tileType
                : shared_1.TileType.Stone;
            const tileIndex = this.toTileIndex(x, y);
            if (tileIndex >= 0) {
                this.tilePlane.setTileType(tileIndex, tileType);
                continue;
            }
            this.activateRuntimeTile(x, y, tileType);
        }
        this.persistentRevision = 1;
        this.persistedRevision = 1;
        this.clearDirtyDomains();
    }
    /** patchTileResources：在现有地块资源上叠加差量持久化条目，不重置未覆盖资源。 */
    patchTileResources(entries) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        for (const entry of entries) {
            if (!entry
                || typeof entry.resourceKey !== 'string'
                || !entry.resourceKey
                || !Number.isFinite(entry.tileIndex)
                || !Number.isFinite(entry.value)) {
                continue;
            }

            const tileIndex = Math.trunc(entry.tileIndex);
            if (tileIndex < 0 || tileIndex >= this.auraByTile.length) {
                continue;
            }

            const next = Math.max(0, Math.trunc(entry.value));
            if (entry.resourceKey !== DEFAULT_TILE_AURA_RESOURCE_KEY && next <= 0) {
                continue;
            }
            const bucket = this.getOrCreateTileResourceBucket(entry.resourceKey);
            bucket[tileIndex] = next;
        }
        this.changedAuraTileCount = 0;
        this.changedTileResourceEntryCount = 0;
        this.changedTileResourceEntryCountByKey.clear();
        this.persistentRevision = 1;
        this.persistedRevision = 1;
        this.clearDirtyDomains();
    }
    /** hydrateGroundPiles：用持久化数据回填地面物品堆。 */
    hydrateGroundPiles(entries) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.groundPilesByTile.clear();
        for (const entry of entries) {
            if (!Number.isFinite(entry.tileIndex) || !Array.isArray(entry.items)) {
                continue;
            }

            const tileIndex = Math.trunc(entry.tileIndex);
            if (tileIndex < 0 || tileIndex >= this.auraByTile.length) {
                continue;
            }

            const x = this.tilePlane.getX(tileIndex);

            const y = this.tilePlane.getY(tileIndex);

            const items = entry.items
                .map((item) => normalizePersistedGroundItem(item))
                .filter((item) => Boolean(item));
            if (items.length === 0) {
                continue;
            }

            const pile = {
                sourceId: buildGroundSourceId(tileIndex),
                x,
                y,
                tileIndex,
                items: items.map((item) => ({
                    itemKey: item.itemId,
                    item,
                })),
            };
            pile.items.sort(compareGroundEntries);
            this.groundPilesByTile.set(tileIndex, pile);
        }
        this.persistentRevision = 1;
        this.persistedRevision = 1;
    }
    /** hydrateTime：用持久化数据回填实例时间。 */
    hydrateTime(tick) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!Number.isFinite(Number(tick))) {
            return;
        }
        this.tick = Math.max(0, Math.trunc(Number(tick)));
        this.persistentRevision = 1;
        this.persistedRevision = 1;
        this.clearDirtyDomains();
    }
    /** hydrateMonsterRuntimeStates：用持久化数据回填高价值妖兽运行态。 */
    hydrateMonsterRuntimeStates(entries) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!Array.isArray(entries) || entries.length === 0) {
            return;
        }
        for (const entry of entries) {
            if (!entry) {
                continue;
            }
            const runtimeId = typeof entry.runtimeId === 'string' ? entry.runtimeId.trim() : '';
            const monsterId = typeof entry.monsterId === 'string' ? entry.monsterId.trim() : '';
            const monster = (runtimeId ? this.monstersByRuntimeId.get(runtimeId) : null)
                ?? Array.from(this.monstersByRuntimeId.values()).find((candidate) => candidate.monsterId === monsterId && candidate.tier !== 'mortal_blood');
            if (!monster) {
                continue;
            }
            if (typeof entry.monsterName === 'string' && entry.monsterName.trim()) {
                monster.name = entry.monsterName.trim();
            }
            if (typeof entry.monsterTier === 'string' && entry.monsterTier.trim()) {
                monster.tier = entry.monsterTier.trim();
            }
            if (Number.isFinite(Number(entry.monsterLevel))) {
                monster.level = Math.max(1, Math.trunc(Number(entry.monsterLevel)));
            }
            if (Number.isFinite(Number(entry.tileIndex))) {
                const tileIndex = Math.trunc(Number(entry.tileIndex));
                if (tileIndex >= 0 && tileIndex < this.auraByTile.length) {
                    this.monsterRuntimeIdByTile.set(tileIndex, monster.runtimeId);
                }
            }
            if (Number.isFinite(Number(entry.x))) {
                monster.x = Math.trunc(Number(entry.x));
            }
            if (Number.isFinite(Number(entry.y))) {
                monster.y = Math.trunc(Number(entry.y));
            }
            if (Number.isFinite(Number(entry.hp))) {
                monster.hp = Math.max(0, Math.trunc(Number(entry.hp)));
            }
            if (Number.isFinite(Number(entry.maxHp))) {
                monster.maxHp = Math.max(1, Math.trunc(Number(entry.maxHp)));
            }
            if (typeof entry.alive === 'boolean') {
                monster.alive = entry.alive;
            }
            if (Number.isFinite(Number(entry.respawnLeft))) {
                monster.respawnLeft = Math.max(0, Math.trunc(Number(entry.respawnLeft)));
            }
            if (Number.isFinite(Number(entry.respawnTicks))) {
                monster.respawnTicks = Math.max(0, Math.trunc(Number(entry.respawnTicks)));
            }
            if (entry.statePayload && typeof entry.statePayload === 'object') {
                const payload = entry.statePayload;
                if (Array.isArray(payload.buffs)) {
                    monster.buffs = payload.buffs.map((buff) => ({ ...buff }));
                }
                if (Number.isFinite(Number(payload.attackReadyTick))) {
                    monster.attackReadyTick = Math.max(0, Math.trunc(Number(payload.attackReadyTick)));
                }
                if (payload.cooldownReadyTickBySkillId && typeof payload.cooldownReadyTickBySkillId === 'object') {
                    monster.cooldownReadyTickBySkillId = { ...payload.cooldownReadyTickBySkillId };
                }
                if (payload.damageContributors && typeof payload.damageContributors === 'object') {
                    monster.damageContributors = { ...payload.damageContributors };
                }
            }
        }
    }
    /** hydrateOverlayChunks：用分域 overlay chunk 回填运行期动态覆盖物。 */
    hydrateOverlayChunks(entries) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!Array.isArray(entries) || entries.length === 0) {
            return;
        }
        const portals = [];
        let sawPortalChunk = false;
        for (const entry of entries) {
            if (!entry || entry.patchKind !== 'portal') {
                continue;
            }
            const payload = entry.patchPayload && typeof entry.patchPayload === 'object' ? entry.patchPayload : null;
            const portalEntries = Array.isArray(payload?.portals) ? payload.portals : [];
            sawPortalChunk = true;
            for (const portal of portalEntries) {
                if (!portal || !Number.isFinite(Number(portal.x)) || !Number.isFinite(Number(portal.y))) {
                    continue;
                }
                const x = Math.trunc(Number(portal.x));
                const y = Math.trunc(Number(portal.y));
                if (!this.isInBounds(x, y)) {
                    continue;
                }
                portals.push({
                    id: typeof portal.id === 'string' && portal.id.trim() ? portal.id.trim() : `${portal.kind ?? 'portal'}:${x},${y}`,
                    x,
                    y,
                    targetMapId: typeof portal.targetMapId === 'string' && portal.targetMapId.trim() ? portal.targetMapId.trim() : this.template.id,
                    targetInstanceId: typeof portal.targetInstanceId === 'string' && portal.targetInstanceId.trim() ? portal.targetInstanceId.trim() : null,
                    targetX: Number.isFinite(Number(portal.targetX)) ? Math.trunc(Number(portal.targetX)) : this.template.spawnX,
                    targetY: Number.isFinite(Number(portal.targetY)) ? Math.trunc(Number(portal.targetY)) : this.template.spawnY,
                    targetPortalId: typeof portal.targetPortalId === 'string' && portal.targetPortalId.trim() ? portal.targetPortalId.trim() : undefined,
                    direction: portal.direction === 'one_way' ? 'one_way' : 'two_way',
                    kind: typeof portal.kind === 'string' && portal.kind.trim() ? portal.kind.trim() : 'portal',
                    trigger: portal.trigger === 'auto' ? 'auto' : 'manual',
                    hidden: portal.hidden === true,
                    name: typeof portal.name === 'string' && portal.name.trim() ? portal.name.trim() : undefined,
                    char: typeof portal.char === 'string' && portal.char.trim() ? portal.char.trim() : undefined,
                    color: typeof portal.color === 'string' && portal.color.trim() ? portal.color.trim() : undefined,
                    sectId: typeof portal.sectId === 'string' && portal.sectId.trim() ? portal.sectId.trim() : undefined,
                });
            }
        }
        if (sawPortalChunk) {
            portals.sort((left, right) => left.y - right.y || left.x - right.x);
            this.runtimePortals = portals;
            this.worldRevision += 1;
        }
    }
    /** buildAuraPersistenceEntries：导出灵气持久化条目。 */
    buildAuraPersistenceEntries() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (this.changedAuraTileCount === 0) {
            return [];
        }

        return this.buildTileResourcePersistenceEntries()
            .filter((entry) => entry.resourceKey === DEFAULT_TILE_AURA_RESOURCE_KEY)
            .map((entry) => ({
            tileIndex: entry.tileIndex,
            value: entry.value,
        }));
    }
    /** buildTileResourcePersistenceEntries：导出地块资源持久化条目。 */
    buildTileResourcePersistenceEntries() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const tileResourceDomainDirty = this.getDirtyDomains().has('tile_resource');
        if (this.changedTileResourceEntryCount === 0 && !tileResourceDomainDirty) {
            return [];
        }
        const entries = [];
        for (const [resourceKey, bucket] of this.tileResourceBuckets.entries()) {
            const dirtyCount = this.changedTileResourceEntryCountByKey.get(resourceKey) ?? 0;
            if (dirtyCount <= 0 && !tileResourceDomainDirty) {
                continue;
            }
            for (let tileIndex = 0; tileIndex < bucket.length; tileIndex += 1) {
                const value = bucket[tileIndex] ?? 0;
                if (value !== this.getTileResourceBaseValueByIndex(resourceKey, tileIndex)) {
                    entries.push({
                        resourceKey,
                        tileIndex,
                        value,
                    });
                }
            }
        }
        entries.sort((left, right) => left.resourceKey.localeCompare(right.resourceKey, 'zh-Hans-CN') || left.tileIndex - right.tileIndex);
        return entries;
    }
    /** buildTileResourcePersistenceDelta：导出地块资源行级增量。 */
    buildTileResourcePersistenceDelta() {
        const dirtyPairs = [];
        if (this.dirtyTileResourceByKey instanceof Map) {
            for (const [resourceKey, tileIndices] of this.dirtyTileResourceByKey.entries()) {
                if (typeof resourceKey !== 'string' || !resourceKey.trim() || !(tileIndices instanceof Set)) {
                    continue;
                }
                for (const tileIndex of tileIndices.values()) {
                    if (Number.isFinite(Number(tileIndex))) {
                        dirtyPairs.push({ resourceKey: resourceKey.trim(), tileIndex: Math.max(0, Math.trunc(Number(tileIndex))) });
                    }
                }
            }
        }
        const fullReplace = this.persistenceFullReplaceDomains?.has?.('tile_resource') === true
            || (dirtyPairs.length === 0 && this.getDirtyDomains().has('tile_resource'));
        if (fullReplace) {
            return { fullReplace: true, upserts: [], deletes: [] };
        }
        const upserts = [];
        const deletes = [];
        for (const pair of dirtyPairs) {
            const value = this.getTileResourceValueByIndex(pair.resourceKey, pair.tileIndex);
            const base = this.getTileResourceBaseValueByIndex(pair.resourceKey, pair.tileIndex);
            if (value !== base) {
                upserts.push({ resourceKey: pair.resourceKey, tileIndex: pair.tileIndex, value: Math.max(0, Math.trunc(Number(value) || 0)) });
            }
            else {
                deletes.push({ resourceKey: pair.resourceKey, tileIndex: pair.tileIndex });
            }
        }
        upserts.sort((left, right) => left.resourceKey.localeCompare(right.resourceKey, 'zh-Hans-CN') || left.tileIndex - right.tileIndex);
        deletes.sort((left, right) => left.resourceKey.localeCompare(right.resourceKey, 'zh-Hans-CN') || left.tileIndex - right.tileIndex);
        return { fullReplace: false, upserts, deletes };
    }
    /** buildGroundPersistenceEntries：导出地面物品堆持久化条目。 */
    buildGroundPersistenceEntries() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (this.groundPilesByTile.size === 0) {
            return [];
        }

        const entries = [];
        for (const pile of this.groundPilesByTile.values()) {
            if (pile.items.length === 0) {
                continue;
            }
            entries.push({
                tileIndex: pile.tileIndex,
                items: pile.items.map((entry) => ({ ...entry.item })),
            });
        }
        entries.sort((left, right) => left.tileIndex - right.tileIndex);
        return entries;
    }
    /** buildGroundPersistenceDelta：导出地面物品按 tile 替换增量。 */
    buildGroundPersistenceDelta() {
        const dirtyTileIndices = this.dirtyGroundItemTileIndices instanceof Set
            ? Array.from(this.dirtyGroundItemTileIndices.values())
                .filter((tileIndex) => Number.isFinite(Number(tileIndex)))
                .map((tileIndex) => Math.max(0, Math.trunc(Number(tileIndex))))
            : [];
        const fullReplace = this.persistenceFullReplaceDomains?.has?.('ground_item') === true
            || (dirtyTileIndices.length === 0 && this.getDirtyDomains().has('ground_item'));
        if (fullReplace) {
            return { fullReplace: true, tileIndices: [], entries: [] };
        }
        const tileIndexSet = new Set(dirtyTileIndices);
        const entries = [];
        for (const tileIndex of tileIndexSet.values()) {
            const pile = this.groundPilesByTile.get(tileIndex);
            if (!pile || !Array.isArray(pile.items) || pile.items.length === 0) {
                continue;
            }
            entries.push({
                tileIndex,
                items: pile.items.map((entry) => ({ ...entry.item })),
            });
        }
        entries.sort((left, right) => left.tileIndex - right.tileIndex);
        return { fullReplace: false, tileIndices: Array.from(tileIndexSet.values()).sort((left, right) => left - right), entries };
    }
    /** buildTileDamagePersistenceEntries：导出可破坏地块持久化条目。 */
    buildTileDamagePersistenceEntries() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (this.tileDamageByTile.size === 0) {
            return [];
        }

        const entries = [];
        for (const [tileIndex, state] of this.tileDamageByTile.entries()) {
            if (!Number.isFinite(Number(tileIndex)) || !state) {
                continue;
            }
            entries.push({
                tileIndex: Math.trunc(Number(tileIndex)),
                x: this.tilePlane.getX(Math.trunc(Number(tileIndex))),
                y: this.tilePlane.getY(Math.trunc(Number(tileIndex))),
                hp: Math.max(0, Math.trunc(Number(state.hp) || 0)),
                maxHp: Math.max(1, Math.trunc(Number(state.maxHp) || 1)),
                destroyed: state.destroyed === true,
                respawnLeft: Math.max(0, Math.trunc(Number(state.respawnLeft) || 0)),
                modifiedAt: Number.isFinite(Number(state.modifiedAt)) ? Math.max(0, Math.trunc(Number(state.modifiedAt))) : Date.now(),
            });
        }
        entries.sort((left, right) => left.tileIndex - right.tileIndex);
        return entries;
    }
    /** buildTileDamagePersistenceDelta：导出可破坏地块行级增量。 */
    buildTileDamagePersistenceDelta() {
        const dirtyTileIndices = this.dirtyTileDamageIndices instanceof Set
            ? Array.from(this.dirtyTileDamageIndices.values())
                .filter((tileIndex) => Number.isFinite(Number(tileIndex)))
                .map((tileIndex) => Math.max(0, Math.trunc(Number(tileIndex))))
            : [];
        const fullReplace = this.persistenceFullReplaceDomains?.has?.('tile_damage') === true
            || (dirtyTileIndices.length === 0 && this.getDirtyDomains().has('tile_damage'));
        if (fullReplace) {
            return { fullReplace: true, upserts: [], deletes: [] };
        }
        const upserts = [];
        const deletes = [];
        for (const tileIndex of new Set(dirtyTileIndices).values()) {
            const state = this.tileDamageByTile.get(tileIndex);
            if (!state) {
                deletes.push(tileIndex);
                continue;
            }
            upserts.push({
                tileIndex,
                x: this.tilePlane.getX(tileIndex),
                y: this.tilePlane.getY(tileIndex),
                hp: Math.max(0, Math.trunc(Number(state.hp) || 0)),
                maxHp: Math.max(1, Math.trunc(Number(state.maxHp) || 1)),
                destroyed: state.destroyed === true,
                respawnLeft: Math.max(0, Math.trunc(Number(state.respawnLeft) || 0)),
                modifiedAt: Number.isFinite(Number(state.modifiedAt)) ? Math.max(0, Math.trunc(Number(state.modifiedAt))) : Date.now(),
            });
        }
        upserts.sort((left, right) => left.tileIndex - right.tileIndex);
        deletes.sort((left, right) => left - right);
        return { fullReplace: false, upserts, deletes };
    }
    /** buildTemporaryTilePersistenceEntries：导出技能生成临时地块持久化条目。 */
    buildTemporaryTilePersistenceEntries() {
        if (this.temporaryTileByTile.size === 0) {
            return [];
        }
        const entries = [];
        for (const [tileIndex, state] of this.temporaryTileByTile.entries()) {
            if (!Number.isFinite(Number(tileIndex)) || !state) {
                continue;
            }
            const normalizedTileIndex = Math.trunc(Number(tileIndex));
            entries.push({
                tileIndex: normalizedTileIndex,
                x: this.tilePlane.getX(normalizedTileIndex),
                y: this.tilePlane.getY(normalizedTileIndex),
                tileType: typeof state.tileType === 'string' && state.tileType.length > 0 ? state.tileType : shared_1.TileType.Stone,
                hp: Math.max(1, Math.trunc(Number(state.hp) || 1)),
                maxHp: Math.max(1, Math.trunc(Number(state.maxHp) || 1)),
                expiresAtTick: Math.max(1, Math.trunc(Number(state.expiresAtTick) || 1)),
                ownerPlayerId: typeof state.ownerPlayerId === 'string' && state.ownerPlayerId.trim() ? state.ownerPlayerId.trim() : null,
                sourceSkillId: typeof state.sourceSkillId === 'string' && state.sourceSkillId.trim() ? state.sourceSkillId.trim() : null,
                createdAt: Number.isFinite(Number(state.createdAt)) ? Math.max(0, Math.trunc(Number(state.createdAt))) : Date.now(),
                modifiedAt: Number.isFinite(Number(state.modifiedAt)) ? Math.max(0, Math.trunc(Number(state.modifiedAt))) : Date.now(),
            });
        }
        entries.sort((left, right) => left.tileIndex - right.tileIndex);
        return entries;
    }
    /** buildRuntimeTilePersistenceEntries：导出模板外或运行时改写的动态地块。 */
    buildRuntimeTilePersistenceEntries() {
        if (!this.tilePlane || typeof this.tilePlane.getCellCount !== 'function') {
            return [];
        }
        const entries = [];
        const count = this.tilePlane.getCellCount();
        for (let tileIndex = 0; tileIndex < count; tileIndex += 1) {
            const x = this.tilePlane.getX(tileIndex);
            const y = this.tilePlane.getY(tileIndex);
            const tileType = this.tilePlane.getTileType(tileIndex);
            const inTemplateBounds = x >= 0 && y >= 0 && x < this.template.width && y < this.template.height;
            if (inTemplateBounds) {
                const staticType = (0, shared_1.getTileTypeFromMapChar)(this.template.terrainRows[y]?.[x] ?? '#');
                if (tileType === staticType) {
                    continue;
                }
            }
            entries.push({ x, y, tileType });
        }
        entries.sort((left, right) => left.y - right.y || left.x - right.x || String(left.tileType).localeCompare(String(right.tileType), 'zh-Hans-CN'));
        return entries;
    }
    /** buildOverlayPersistenceChunks：导出动态 overlay 分域持久化 chunk。 */
    buildOverlayPersistenceChunks() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const portals = this.runtimePortals
            .map((portal) => ({ ...portal }))
            .sort((left, right) => left.y - right.y || left.x - right.x);
        if (portals.length === 0) {
            return [];
        }
        return [{
            patchKind: 'portal',
            chunkKey: 'runtime_portals',
            patchVersion: this.getPersistenceRevision(),
            patchPayload: {
                version: 1,
                portals,
            },
        }];
    }
    /** buildMonsterRuntimePersistenceEntries：导出高价值妖兽运行态持久化条目。 */
    buildMonsterRuntimePersistenceEntries() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const entries = [];
        for (const monster of this.monstersByRuntimeId.values()) {
            if (!monster || monster.tier === 'mortal_blood') {
                continue;
            }
            entries.push({
                monsterRuntimeId: monster.runtimeId,
                monsterId: monster.monsterId,
                monsterName: monster.name,
                monsterTier: monster.tier,
                monsterLevel: monster.level,
                tileIndex: this.toTileIndex(monster.x, monster.y),
                x: monster.x,
                y: monster.y,
                hp: monster.hp,
                maxHp: monster.maxHp,
                alive: monster.alive === true,
                respawnLeft: monster.respawnLeft,
                respawnTicks: monster.respawnTicks,
                aggroTargetPlayerId: monster.aggroTargetPlayerId ?? null,
                statePayload: {
                    attackReadyTick: monster.attackReadyTick,
                    cooldownReadyTickBySkillId: { ...(monster.cooldownReadyTickBySkillId ?? {}) },
                    damageContributors: { ...(monster.damageContributors ?? {}) },
                    buffs: Array.isArray(monster.buffs) ? monster.buffs.map((buff) => ({ ...buff })) : [],
                },
            });
        }
        entries.sort((left, right) => left.monsterRuntimeId.localeCompare(right.monsterRuntimeId, 'zh-Hans-CN'));
        return entries;
    }
    /** buildMonsterRuntimePersistenceDelta：导出妖兽运行态行级增量。 */
    buildMonsterRuntimePersistenceDelta() {
        const dirtyIds = this.dirtyMonsterRuntimeIds instanceof Set
            ? Array.from(this.dirtyMonsterRuntimeIds.values())
                .filter((runtimeId) => typeof runtimeId === 'string' && runtimeId.trim())
                .map((runtimeId) => runtimeId.trim())
            : [];
        const fullReplace = this.persistenceFullReplaceDomains?.has?.('monster_runtime') === true
            || (dirtyIds.length === 0 && this.getDirtyDomains().has('monster_runtime'));
        if (fullReplace) {
            return { fullReplace: true, upserts: [], deletes: [] };
        }
        const upserts = [];
        const deletes = [];
        for (const runtimeId of new Set(dirtyIds).values()) {
            const monster = this.monstersByRuntimeId.get(runtimeId);
            if (!monster || monster.tier === 'mortal_blood') {
                deletes.push(runtimeId);
                continue;
            }
            upserts.push({
                monsterRuntimeId: monster.runtimeId,
                monsterId: monster.monsterId,
                monsterName: monster.name,
                monsterTier: monster.tier,
                monsterLevel: monster.level,
                tileIndex: this.toTileIndex(monster.x, monster.y),
                x: monster.x,
                y: monster.y,
                hp: monster.hp,
                maxHp: monster.maxHp,
                alive: monster.alive === true,
                respawnLeft: monster.respawnLeft,
                respawnTicks: monster.respawnTicks,
                aggroTargetPlayerId: monster.aggroTargetPlayerId ?? null,
                statePayload: {
                    attackReadyTick: monster.attackReadyTick,
                    cooldownReadyTickBySkillId: { ...(monster.cooldownReadyTickBySkillId ?? {}) },
                    damageContributors: { ...(monster.damageContributors ?? {}) },
                    buffs: Array.isArray(monster.buffs) ? monster.buffs.map((buff) => ({ ...buff })) : [],
                },
            });
        }
        upserts.sort((left, right) => left.monsterRuntimeId.localeCompare(right.monsterRuntimeId, 'zh-Hans-CN'));
        deletes.sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
        return { fullReplace: false, upserts, deletes };
    }
    /** isPersistentDirty：判断实例是否还有未落盘的持久化变更。 */
    isPersistentDirty() {
        return this.getDirtyDomains().size > 0;
    }
    /** getPersistenceRevision：读取实例持久化版本。 */
    getPersistenceRevision() {
        return this.persistentRevision;
    }
    /** getDirtyDomains：读取实例脏域集合。 */
    getDirtyDomains() {
        return this.dirtyDomains instanceof Set ? this.dirtyDomains : createMapInstanceDirtyDomainSet();
    }
    /** markPersistenceDirtyDomains：记录实例脏域。 */
    markPersistenceDirtyDomains(domains) {
        markMapInstanceDirtyDomains(this, domains);
        markMapInstancePersistenceFullReplaceDomains(this, domains);
    }
    /** markTileResourcePersistenceDirty：记录地块资源行级脏键。 */
    markTileResourcePersistenceDirty(resourceKey, tileIndex) {
        markMapInstanceDirtyDomains(this, ['tile_resource']);
        addTileResourceDirtyKey(this, resourceKey, tileIndex);
    }
    /** markTileDamagePersistenceDirty：记录地块损坏行级脏键。 */
    markTileDamagePersistenceDirty(tileIndex) {
        markMapInstanceDirtyDomains(this, ['tile_damage']);
        if (!(this.dirtyTileDamageIndices instanceof Set)) {
            this.dirtyTileDamageIndices = new Set();
        }
        addNumericDirtyKey(this.dirtyTileDamageIndices, tileIndex);
    }
    /** markGroundItemPersistenceDirty：记录地面物品按 tile 替换脏键。 */
    markGroundItemPersistenceDirty(tileIndex) {
        markMapInstanceDirtyDomains(this, ['ground_item']);
        if (!(this.dirtyGroundItemTileIndices instanceof Set)) {
            this.dirtyGroundItemTileIndices = new Set();
        }
        addNumericDirtyKey(this.dirtyGroundItemTileIndices, tileIndex);
    }
    /** markMonsterRuntimePersistenceDirty：记录妖兽运行态行级脏键。 */
    markMonsterRuntimePersistenceDirty(runtimeId) {
        markMapInstanceDirtyDomains(this, ['monster_runtime']);
        if (!(this.dirtyMonsterRuntimeIds instanceof Set)) {
            this.dirtyMonsterRuntimeIds = new Set();
        }
        if (typeof runtimeId === 'string' && runtimeId.trim()) {
            this.dirtyMonsterRuntimeIds.add(runtimeId.trim());
        }
    }
    /** markPersistenceDomainsPersisted：标记指定实例域已完成持久化。 */
    markPersistenceDomainsPersisted(domains) {
        const dirtyDomains = this.getDirtyDomains();
        for (const domain of Array.isArray(domains) ? domains : []) {
            if (typeof domain === 'string' && domain.trim()) {
                const normalizedDomain = domain.trim();
                dirtyDomains.delete(normalizedDomain);
                clearMapInstancePersistenceDeltaDomain(this, normalizedDomain);
            }
        }
        if (dirtyDomains.size === 0) {
            this.persistedRevision = this.persistentRevision;
        }
    }
    /** clearDirtyDomains：清空实例脏域集合。 */
    clearDirtyDomains() {
        clearMapInstanceDirtyDomains(this);
    }
    /** markAuraPersisted：标记灵气状态已完成持久化。 */
    markAuraPersisted() {
        this.persistedRevision = this.persistentRevision;
        this.clearDirtyDomains();
    }
    /** dropGroundItem：把物品丢到地面堆中。 */
    dropGroundItem(x, y, item) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isInBounds(x, y)) {
            return null;
        }

        const normalizedCount = Math.max(1, Math.trunc(item.count));

        const itemKey = item.itemId;

        const tileIndex = this.toTileIndex(x, y);

        const existingPile = this.groundPilesByTile.get(tileIndex);

        let changed = false;
        if (existingPile) {

            const existingEntry = existingPile.items.find((entry) => entry.itemKey === itemKey);
            if (existingEntry) {
                existingEntry.item.count += normalizedCount;
            }
            else {
                existingPile.items.push({
                    itemKey,
                    item: {
                        ...item,
                        count: normalizedCount,
                    },
                });
                existingPile.items.sort(compareGroundEntries);
            }
            changed = true;
            if (changed) {
                this.markGroundItemPersistenceDirty(tileIndex);
                this.persistentRevision += 1;
                this.worldRevision += 1;
            }
            return toGroundPileView(existingPile);
        }

        const pile = {
            sourceId: buildGroundSourceId(tileIndex),
            x,
            y,
            tileIndex,
            items: [{
                    itemKey,
                    item: {
                        ...item,
                        count: normalizedCount,
                    },
                }],
        };
        this.groundPilesByTile.set(tileIndex, pile);
        this.markGroundItemPersistenceDirty(tileIndex);
        this.persistentRevision += 1;
        this.worldRevision += 1;
        return toGroundPileView(pile);
    }
    /** takeGroundItem：从地面堆中取走指定物品。 */
    takeGroundItem(sourceId, itemKey, takerX, takerY) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isInBounds(takerX, takerY)) {
            return null;
        }

        const tileIndex = parseGroundSourceId(sourceId);
        if (tileIndex === null) {
            return null;
        }

        const pile = this.groundPilesByTile.get(tileIndex);
        if (!pile) {
            return null;
        }
        if (chebyshevDistance(takerX, takerY, pile.x, pile.y) > 1) {
            return null;
        }

        const entryIndex = pile.items.findIndex((entry) => entry.itemKey === itemKey);
        if (entryIndex < 0) {
            return null;
        }
        const [entry] = pile.items.splice(entryIndex, 1);
        if (!entry) {
            return null;
        }
        if (pile.items.length === 0) {
            this.groundPilesByTile.delete(tileIndex);
        }
        this.markGroundItemPersistenceDirty(tileIndex);
        this.persistentRevision += 1;
        this.worldRevision += 1;
        return {
            ...entry.item,
        };
    }
    /** applyMove：应用一次玩家移动。 */
    applyMove(player, direction, transfers, continuous = false, maxSteps = undefined, path = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const offset = DIRECTION_OFFSET[direction];
        if (!offset) {
            return;
        }

        let movePoints = this.rechargePlayerMoveBudget(player);

        let moved = false;

        let remainingSteps = Number.isFinite(maxSteps) ? Math.max(1, Math.trunc(maxSteps)) : Number.POSITIVE_INFINITY;

        const remainingPath = Array.isArray(path) && path.length > 0 ? path : null;
        if (!remainingPath && player.facing !== direction) {
            player.facing = direction;
            player.selfRevision += 1;
        }
        while (true) {
            if (remainingSteps <= 0) {
                break;
            }

            let nextX;

            let nextY;

            let stepDirection = direction;
            if (remainingPath) {

                const nextStep = remainingPath[0];
                if (!nextStep) {
                    break;
                }
                nextX = nextStep.x;
                nextY = nextStep.y;

                const resolvedDirection = (0, shared_1.directionFromTo)(player.x, player.y, nextX, nextY);
                if (resolvedDirection === null) {
                    break;
                }
                stepDirection = resolvedDirection;
            }
            else {
                nextX = player.x + offset.x;
                nextY = player.y + offset.y;
            }

            const stepCost = this.getTileTraversalCost(nextX, nextY, player.playerId);
            if (!Number.isFinite(stepCost) || stepCost <= 0 || movePoints < stepCost) {
                break;
            }
            if (Math.abs(nextX - player.x) + Math.abs(nextY - player.y) !== 1) {
                break;
            }
            if (!this.isWalkable(nextX, nextY, player.playerId)) {
                break;
            }
            if (this.npcIdByTile.has(this.toTileIndex(nextX, nextY))) {
                break;
            }

            const nextOccupancy = this.occupancy[this.toTileIndex(nextX, nextY)];
            if (nextOccupancy !== INVALID_OCCUPANCY) {
                break;
            }
            if (player.facing !== stepDirection) {
                player.facing = stepDirection;
                player.selfRevision += 1;
            }
            this.setOccupied(player.x, player.y, INVALID_OCCUPANCY);
            player.x = nextX;
            player.y = nextY;
            movePoints -= stepCost;
            remainingSteps -= 1;
            moved = true;
            if (remainingPath) {
                remainingPath.shift();
            }
            this.setOccupied(player.x, player.y, player.handle);
            this.worldRevision += 1;

            const portal = this.getPortalAt(player.x, player.y);
            if (portal?.trigger === 'auto') {
                transfers.push(this.buildTransfer(player, portal, 'auto_portal'));
                break;
            }
            if (!continuous) {
                break;
            }
            if (remainingPath && remainingPath.length === 0) {
                break;
            }
        }
        if (moved) {
            player.selfRevision += 1;
        }
        player.movePoints = Math.min(shared_1.MAX_STORED_MOVE_POINTS, Math.max(0, Math.round(movePoints)));
    }
    /** buildTransfer：构建跨图传送结果。 */
    buildTransfer(player, portal, reason) {
        return {
            playerId: player.playerId,
            sessionId: player.sessionId,
            fromInstanceId: this.meta.instanceId,
            targetMapId: portal.targetMapId,
            targetInstanceId: portal.targetInstanceId ?? null,
            targetX: portal.targetX,
            targetY: portal.targetY,
            reason,
        };
    }
    /** rechargePlayerMoveBudget：恢复玩家移动预算。 */
    rechargePlayerMoveBudget(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const elapsed = Math.max(0, this.tick - (player.lastMoveBudgetTick ?? this.tick));
        if (elapsed > 0) {
            player.movePoints = Math.min(shared_1.MAX_STORED_MOVE_POINTS, Math.max(0, Math.round(player.movePoints + elapsed * (0, shared_1.getMovePointsPerTick)(player.moveSpeed))));
            player.lastMoveBudgetTick = this.tick;
        }
        return player.movePoints;
    }
    /** getTileTraversalCost：读取地块通行代价。 */
    getTileTraversalCost(x, y, playerId = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isInBounds(x, y)) {
            return Number.POSITIVE_INFINITY;
        }

        if (this.isDynamicallyBlockedTile(x, y, playerId)) {
            return Number.POSITIVE_INFINITY;
        }
        const tileType = this.getEffectiveTileType(x, y);
        if (!(0, shared_1.isTileTypeWalkable)(tileType)) {
            return Number.POSITIVE_INFINITY;
        }
        /** return：return。 */
        return (0, shared_1.getTileTraversalCost)(tileType);
    }
    /** normalizeVisibilityFilter：统一视野过滤输入，坐标 key 优先、索引兼容。 */
    normalizeVisibilityFilter(visibleTileVisibility = null) {
        if (!visibleTileVisibility) {
            return { indices: null, keys: null };
        }
        if (visibleTileVisibility instanceof Set) {
            return { indices: visibleTileVisibility, keys: null };
        }
        return {
            indices: visibleTileVisibility.indices instanceof Set ? visibleTileVisibility.indices : null,
            keys: visibleTileVisibility.keys instanceof Set ? visibleTileVisibility.keys : null,
        };
    }
    /** isTileVisibleByFilter：按 main 语义以 visibleKeys 为视野真源，索引用于旧调用兼容。 */
    isTileVisibleByFilter(x, y, visibility) {
        if (!visibility?.keys && !visibility?.indices) {
            return true;
        }
        if (visibility.keys?.has(`${x},${y}`)) {
            return true;
        }
        const tileIndex = this.toTileIndex(x, y);
        return tileIndex >= 0 && visibility.indices?.has(tileIndex) === true;
    }
    /** isTileInsideViewRadius：视野窗口粗过滤，不再按模板 width/height 裁剪稀疏坐标。 */
    isTileInsideViewRadius(centerX, centerY, radius, x, y) {
        return chebyshevDistance(centerX, centerY, x, y) <= Math.max(0, Math.trunc(Number(radius) || 0));
    }
    /** collectVisiblePlayers：收集当前视野内可见玩家。 */
    collectVisiblePlayers(observer, radius, visibleTileVisibility = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const visibility = this.normalizeVisibilityFilter(visibleTileVisibility);
        const visiblePlayers = [];
        for (const player of this.playersById.values()) {
            if (player.playerId === observer.playerId) {
                continue;
            }
            if (!this.isTileInsideViewRadius(observer.x, observer.y, radius, player.x, player.y)) {
                continue;
            }
            if (!this.isTileVisibleByFilter(player.x, player.y, visibility)) {
                continue;
            }
            visiblePlayers.push({
                playerId: player.playerId,
                name: player.name,
                displayName: player.displayName,
                x: player.x,
                y: player.y,
                buffs: player.buffs,
            });
        }
        return visiblePlayers;
    }
    /** collectLocalPortals：收集当前视野内可见传送点。 */
    collectLocalPortals(centerX, centerY, radius, visibleTileVisibility = null) {
        const visibility = this.normalizeVisibilityFilter(visibleTileVisibility);
        return this.listAllPortals()
            .filter((portal) => !portal.hidden
            && this.isTileInsideViewRadius(centerX, centerY, radius, portal.x, portal.y)
            && this.isTileVisibleByFilter(portal.x, portal.y, visibility))
            .map((portal) => ({
            x: portal.x,
            y: portal.y,
            id: portal.id,
            kind: portal.kind,
            trigger: portal.trigger,
            direction: portal.direction ?? 'two_way',
            targetMapId: portal.targetMapId,
            targetInstanceId: portal.targetInstanceId ?? null,
            targetPortalId: portal.targetPortalId,
            targetX: portal.targetX,
            targetY: portal.targetY,
            name: portal.name,
            char: portal.char,
            color: portal.color,
            sectId: portal.sectId,
        }));
    }
    /** collectLocalGroundPiles：收集当前视野内可见地面物品堆。 */
    collectLocalGroundPiles(centerX, centerY, radius, visibleTileVisibility = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const visibility = this.normalizeVisibilityFilter(visibleTileVisibility);
        const piles = [];
        for (const pile of this.groundPilesByTile.values()) {
            if (!this.isTileInsideViewRadius(centerX, centerY, radius, pile.x, pile.y)) {
                continue;
            }
            if (!this.isTileVisibleByFilter(pile.x, pile.y, visibility)) {
                continue;
            }

            const view = toGroundPileView(pile);
            if (view) {
                piles.push(view);
            }
        }
        piles.sort(compareGroundPiles);
        return piles;
    }
    /** collectLocalContainers：收集当前视野内可见容器。 */
    collectLocalContainers(centerX, centerY, radius, visibleTileVisibility = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const visibility = this.normalizeVisibilityFilter(visibleTileVisibility);
        const containers = [];
        for (const container of this.containersById.values()) {
            if (!this.isTileInsideViewRadius(centerX, centerY, radius, container.x, container.y)) {
                continue;
            }
            if (!this.isTileVisibleByFilter(container.x, container.y, visibility)) {
                continue;
            }
            containers.push({
                id: container.id,
                name: container.name,
                x: container.x,
                y: container.y,
                char: container.char ?? '箱',
                color: container.color ?? '#c18b46',
                grade: container.grade,
            });
        }
        containers.sort(compareLocalContainers);
        return containers;
    }
    /** collectLocalLandmarks：收集当前视野内可见地标。 */
    collectLocalLandmarks(centerX, centerY, radius, visibleTileVisibility = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const visibility = this.normalizeVisibilityFilter(visibleTileVisibility);
        const landmarks = [];
        for (const landmark of this.landmarksById.values()) {
            if (!this.isTileInsideViewRadius(centerX, centerY, radius, landmark.x, landmark.y)) {
                continue;
            }
            if (!this.isTileVisibleByFilter(landmark.x, landmark.y, visibility)) {
                continue;
            }
            landmarks.push({
                id: landmark.id,
                name: landmark.name,
                x: landmark.x,
                y: landmark.y,

                hasContainer: landmark.container !== undefined,
            });
        }
        landmarks.sort(compareLocalLandmarks);
        return landmarks;
    }
    /** collectLocalSafeZones：收集当前视野内可见安全区。 */
    collectLocalSafeZones(centerX, centerY, radius, visibleTileVisibility = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const visibility = this.normalizeVisibilityFilter(visibleTileVisibility);
        const safeZones = [];
        for (const zone of this.template.safeZones) {
            if (!this.isCircleInsideViewRadius(centerX, centerY, radius, zone.x, zone.y, zone.radius)) {
                continue;
            }
            if (!this.isAnyTileVisibleInCircle(zone.x, zone.y, zone.radius, visibility)) {
                continue;
            }
            safeZones.push(snapshotSafeZone(zone));
        }
        safeZones.sort(compareLocalSafeZones);
        return safeZones;
    }
    /** collectLocalNpcs：收集当前视野内可见 NPC。 */
    collectLocalNpcs(centerX, centerY, radius, visibleTileVisibility = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const visibility = this.normalizeVisibilityFilter(visibleTileVisibility);
        const npcs = [];
        for (const npc of this.npcsById.values()) {
            if (!this.isTileInsideViewRadius(centerX, centerY, radius, npc.x, npc.y)) {
                continue;
            }
            if (!this.isTileVisibleByFilter(npc.x, npc.y, visibility)) {
                continue;
            }
            npcs.push({
                npcId: npc.npcId,
                name: npc.name,
                char: npc.char,
                color: npc.color,
                x: npc.x,
                y: npc.y,
                hasShop: npc.hasShop,
            });
        }
        npcs.sort(compareLocalNpcs);
        return npcs;
    }
    /** collectLocalMonsters：收集当前视野内可见妖兽。 */
    collectLocalMonsters(centerX, centerY, radius, visibleTileVisibility = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const visibility = this.normalizeVisibilityFilter(visibleTileVisibility);
        const monsters = [];
        for (const monster of this.monstersByRuntimeId.values()) {
            if (!monster.alive) {
                continue;
            }
            if (!this.isTileInsideViewRadius(centerX, centerY, radius, monster.x, monster.y)) {
                continue;
            }
            if (!this.isTileVisibleByFilter(monster.x, monster.y, visibility)) {
                continue;
            }
            monsters.push({
                runtimeId: monster.runtimeId,
                monsterId: monster.monsterId,
                name: monster.name,
                char: monster.char,
                color: monster.color,
                tier: monster.tier,
                x: monster.x,
                y: monster.y,
                hp: monster.hp,
                maxHp: monster.maxHp,
            });
        }
        monsters.sort(compareLocalMonsters);
        return monsters;
    }
    /** advanceMonsters：推进妖兽 AI 和行动。 */
    advanceMonsters(monsterActions) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        let changed = false;
        for (const monster of this.monstersByRuntimeId.values()) {
            if (!monster.alive) {
                monster.pendingCast = undefined;
                if (monster.respawnLeft <= 0) {
                    continue;
                }
                monster.respawnLeft = Math.max(0, monster.respawnLeft - 1);
                if (monster.respawnLeft === 0) {
                    this.respawnMonster(monster);
                    changed = true;
                }
                continue;
            }

            const buffChanged = tickTemporaryBuffs(monster.buffs);
            if (buffChanged && recalculateMonsterDerivedState(monster)) {
                changed = true;
            }
            changed = recoverMonsterHp(monster) || changed;

            if (monster.pendingCast) {
                monster.pendingCast.remainingTicks = Math.max(0, Math.trunc(Number(monster.pendingCast.remainingTicks) || 0) - 1);
                if (monster.pendingCast.remainingTicks > 0) {
                    continue;
                }
                const pendingCast = monster.pendingCast;
                monster.pendingCast = undefined;
                const pendingTarget = this.playersById.get(pendingCast.targetPlayerId);
                if (pendingTarget) {
                    monsterActions.push({
                        instanceId: this.meta.instanceId,
                        runtimeId: monster.runtimeId,
                        targetPlayerId: pendingTarget.playerId,
                        kind: 'skill',
                        skillId: pendingCast.skillId,
                    });
                }
                continue;
            }

            const target = this.resolveMonsterTarget(monster);
            if (!target) {
                const lostSightTarget = this.resolveMonsterLostSightChaseTarget(monster);
                if (lostSightTarget) {
                    changed = this.tryMoveMonsterToward(monster, lostSightTarget.x, lostSightTarget.y) || changed;
                    continue;
                }
                this.clearMonsterTargetPursuit(monster);
                if (!this.isMonsterWithinWanderRange(monster, monster.x, monster.y)) {
                    changed = this.tryMoveMonsterToward(monster, monster.spawnX, monster.spawnY) || changed;
                }
                else if (monster.wanderRadius > 0 && Math.random() < 0.35) {
                    changed = this.stepMonsterIdleRoam(monster) || changed;
                }
                continue;
            }

            const distance = chebyshevDistance(monster.x, monster.y, target.x, target.y);

            const skill = chooseMonsterSkill(monster, distance, this.tick);
            if (skill) {
                monster.cooldownReadyTickBySkillId[skill.id] = this.tick + Math.max(1, Math.round(skill.cooldown));
                const windupTicks = getMonsterSkillWindupTicks(skill);
                if (windupTicks > 0) {
                    const warningCells = buildMonsterSkillAffectedCells(monster, skill, { x: target.x, y: target.y });
                    if (warningCells.length > 0) {
                        const geometry = buildEffectiveMonsterSkillGeometry(monster, skill);
                        const warningOrigin = (geometry.shape ?? 'single') === 'line'
                            ? { x: monster.x, y: monster.y }
                            : { x: target.x, y: target.y };
                        monster.facing = resolveFacingToward(monster.x, monster.y, target.x, target.y);
                        monster.pendingCast = {
                            skillId: skill.id,
                            targetPlayerId: target.playerId,
                            targetX: target.x,
                            targetY: target.y,
                            remainingTicks: windupTicks,
                            warningColor: getMonsterSkillWarningColor(skill),
                        };
                        monsterActions.push({
                            instanceId: this.meta.instanceId,
                            runtimeId: monster.runtimeId,
                            targetPlayerId: target.playerId,
                            kind: 'skill_chant',
                            skillId: skill.id,
                            warningCells,
                            warningColor: monster.pendingCast.warningColor,
                            warningOriginX: warningOrigin.x,
                            warningOriginY: warningOrigin.y,
                            durationMs: windupTicks * 1000,
                        });
                        continue;
                    }
                }
                monsterActions.push({
                    instanceId: this.meta.instanceId,
                    runtimeId: monster.runtimeId,
                    targetPlayerId: target.playerId,
                    kind: 'skill',
                    skillId: skill.id,
                });
                continue;
            }
            if (distance <= monster.attackRange && monster.attackReadyTick <= this.tick) {

                const damage = buildMonsterAttackDamage(monster);
                if (damage > 0) {
                    monster.attackReadyTick = this.tick + monster.attackCooldownTicks;
                    monsterActions.push({
                        instanceId: this.meta.instanceId,
                        runtimeId: monster.runtimeId,
                        targetPlayerId: target.playerId,
                        kind: 'basic',
                        damage,
                    });
                }
                continue;
            }
            changed = this.tryMoveMonsterToward(monster, target.x, target.y) || changed;
        }
        if (changed) {
            this.worldRevision += 1;
        }
    }
    /** findSpawnPoint：查找生成点。 */
    findSpawnPoint(preferredX, preferredY) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const candidates = [];
        if (preferredX !== undefined && preferredY !== undefined) {
            candidates.push({
                x: clampCoordinate(preferredX, this.template.width),
                y: clampCoordinate(preferredY, this.template.height),
            });
        }
        candidates.push({
            x: this.template.spawnX,
            y: this.template.spawnY,
        });
        for (const candidate of candidates) {
            const resolved = this.findNearestOpenTile(candidate.x, candidate.y);
            if (resolved) {
                return resolved;
            }
        }
        return null;
    }
    /** findNearestOpenTile：查找最近的可占用地块。 */
    findNearestOpenTile(originX, originY) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (this.isOpenTile(originX, originY)) {
            return { x: originX, y: originY };
        }

        const maxRadius = Math.max(this.template.width, this.template.height);
        for (let radius = 1; radius <= maxRadius; radius += 1) {
            const minX = Math.max(0, originX - radius);
            const maxX = Math.min(this.template.width - 1, originX + radius);

            const minY = Math.max(0, originY - radius);

            const maxY = Math.min(this.template.height - 1, originY + radius);
            for (let y = minY; y <= maxY; y += 1) {
                for (let x = minX; x <= maxX; x += 1) {
                    if (Math.abs(x - originX) !== radius && Math.abs(y - originY) !== radius) {
                        continue;
                    }
                    if (this.isOpenTile(x, y)) {
                        return { x, y };
                    }
                }
            }
        }
        return null;
    }
    /** isOpenTile：判断地块是否可占用。 */
    isOpenTile(x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isWalkable(x, y)) {
            return false;
        }

        const tileIndex = this.toTileIndex(x, y);
        return this.occupancy[tileIndex] === INVALID_OCCUPANCY
            && !this.monsterRuntimeIdByTile.has(tileIndex)
            && !this.npcIdByTile.has(tileIndex);
    }
    /** isWalkable：判断地块是否可行走。 */
    isWalkable(x, y, playerId = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isInBounds(x, y)) {
            return false;
        }
        if (this.isDynamicallyBlockedTile(x, y, playerId)) {
            return false;
        }
        return (0, shared_1.isTileTypeWalkable)(this.getEffectiveTileType(x, y));
    }
    /** isDynamicallyBlockedTile：判断运行期动态阻挡是否覆盖目标地块。 */
    isDynamicallyBlockedTile(x, y, playerId = null) {
        if (typeof this.dynamicTileBlocker !== 'function') {
            return false;
        }
        try {
            return this.dynamicTileBlocker(Math.trunc(x), Math.trunc(y), {
                playerId: typeof playerId === 'string' && playerId.trim() ? playerId.trim() : null,
            }) === true;
        }
        catch (_error) {
            return false;
        }
    }
    /** setCompositeSightResolver：设置跨地图视觉叠加查询。 */
    setCompositeSightResolver(resolver) {
        this.compositeSightResolver = typeof resolver === 'function' ? resolver : null;
    }
    /** resolveCompositeSightBlocked：查询非本图坐标的视觉遮挡。 */
    resolveCompositeSightBlocked(x, y) {
        if (typeof this.compositeSightResolver !== 'function') {
            return null;
        }
        try {
            const result = this.compositeSightResolver(Math.trunc(x), Math.trunc(y));
            return typeof result === 'boolean' ? result : null;
        }
        catch (_error) {
            return null;
        }
    }
    /** canResolveSightCoordinate：判断坐标是否存在可用于视野计算的地块。 */
    canResolveSightCoordinate(x, y) {
        return this.isInBounds(x, y) || this.resolveCompositeSightBlocked(x, y) !== null;
    }
    /** isTileSightBlocked：判断地块是否阻挡视线。动态阵法边界只挡通行，不挡视线。 */
    isTileSightBlocked(x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isInBounds(x, y)) {
            const compositeBlocked = this.resolveCompositeSightBlocked(x, y);
            return compositeBlocked === null ? true : compositeBlocked;
        }
        return (0, shared_1.doesTileTypeBlockSight)(this.getEffectiveTileType(x, y));
    }
    /** canSeeTileFrom：判断 origin 在指定半径内是否能看见目标地块。 */
    canSeeTileFrom(originX, originY, targetX, targetY, radius) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isInBounds(originX, originY) || !this.isInBounds(targetX, targetY)) {
            return false;
        }
        const normalizedRadius = Math.max(0, Math.trunc(Number(radius) || 0));
        if (chebyshevDistance(originX, originY, targetX, targetY) > normalizedRadius) {
            return false;
        }
        return this.collectVisibleTileIndices(originX, originY, normalizedRadius).has(this.toTileIndex(targetX, targetY));
    }
    /** collectVisibleTileIndices：收集视野内可见地块索引。 */
    collectVisibleTileIndices(originX, originY, radius) {
        return this.collectVisibleTileVisibility(originX, originY, radius).indices;
    }
    /** collectVisibleTileVisibility：收集本图索引和跨图坐标视野。 */
    collectVisibleTileVisibility(originX, originY, radius) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const visibleTileIndices = new Set();
        const visibleTileKeys = new Set();
        if (!this.isInBounds(originX, originY)) {
            return { indices: visibleTileIndices, keys: visibleTileKeys };
        }
        visibleTileIndices.add(this.toTileIndex(originX, originY));
        visibleTileKeys.add(`${originX},${originY}`);

        const octants = [
            [1, 0, 0, 1],
            [0, 1, 1, 0],
            [0, -1, 1, 0],
            [-1, 0, 0, 1],
            [-1, 0, 0, -1],
            [0, -1, -1, 0],
            [0, 1, -1, 0],
            [1, 0, 0, -1],
        ];
        for (const [xx, xy, yx, yy] of octants) {
            this.castLight(originX, originY, 1, 1, 0, radius, xx, xy, yx, yy, visibleTileIndices, visibleTileKeys);
        }
        return { indices: visibleTileIndices, keys: visibleTileKeys };
    }
    /** castLight：把视野光照落到地图上。 */
    castLight(originX, originY, row, startSlope, endSlope, radius, xx, xy, yx, yy, visibleTileIndices, visibleTileKeys = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (startSlope < endSlope) {
            return;
        }

        let nextStartSlope = startSlope;
        for (let distance = row; distance <= radius; distance += 1) {
            let blocked = false;
            for (let deltaX = -distance, deltaY = -distance; deltaX <= 0; deltaX += 1) {
                const currentX = originX + deltaX * xx + deltaY * xy;
                const currentY = originY + deltaX * yx + deltaY * yy;

                const leftSlope = (deltaX - 0.5) / (deltaY + 0.5);

                const rightSlope = (deltaX + 0.5) / (deltaY - 0.5);
                if (startSlope < rightSlope) {
                    continue;
                }
                if (endSlope > leftSlope) {
                    break;
                }
                if ((0, shared_1.isOffsetInRange)(deltaX, deltaY, radius) && this.canResolveSightCoordinate(currentX, currentY)) {
                    if (this.isInBounds(currentX, currentY)) {
                        visibleTileIndices.add(this.toTileIndex(currentX, currentY));
                    }
                    if (visibleTileKeys) {
                        visibleTileKeys.add(`${currentX},${currentY}`);
                    }
                }

                const blocksSight = this.isTileSightBlocked(currentX, currentY);
                if (blocked) {
                    if (blocksSight) {
                        nextStartSlope = rightSlope;
                        continue;
                    }
                    blocked = false;
                    startSlope = nextStartSlope;
                    continue;
                }
                if (blocksSight && distance < radius) {
                    blocked = true;
                    this.castLight(originX, originY, distance + 1, startSlope, leftSlope, radius, xx, xy, yx, yy, visibleTileIndices, visibleTileKeys);
                    nextStartSlope = rightSlope;
                }
            }
            if (blocked) {
                break;
            }
        }
    }
    /** isAnyTileVisibleInCircle：判断圆形范围内是否存在可见地块。 */
    isCircleInsideViewRadius(viewCenterX, viewCenterY, viewRadius, centerX, centerY, radius) {
        return chebyshevDistance(viewCenterX, viewCenterY, centerX, centerY)
            <= Math.max(0, Math.trunc(Number(viewRadius) || 0)) + Math.max(0, Math.trunc(Number(radius) || 0));
    }
    /** isAnyTileVisibleInCircle：判断圆形范围内是否存在可见地块。 */
    isAnyTileVisibleInCircle(centerX, centerY, radius, visibleTileVisibility) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const visibility = this.normalizeVisibilityFilter(visibleTileVisibility);
        const minX = centerX - radius;
        const maxX = centerX + radius;
        const minY = centerY - radius;
        const maxY = centerY + radius;
        for (let y = minY; y <= maxY; y += 1) {
            for (let x = minX; x <= maxX; x += 1) {
                if (!(0, shared_1.isOffsetInRange)(x - centerX, y - centerY, radius)) {
                    continue;
                }
                if (this.isTileVisibleByFilter(x, y, visibility)) {
                    return true;
                }
            }
        }
        return false;
    }
    /** getPortalAt：按坐标读取传送点。 */
    getPortalAt(x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isInBounds(x, y)) {
            return null;
        }

        const runtimePortal = this.runtimePortals.find((portal) => portal.x === x && portal.y === y);
        if (runtimePortal) {
            return runtimePortal;
        }
        const portalIndex = this.template.portalIndexByTile[this.toTileIndex(x, y)];
        return portalIndex >= 0 ? this.template.portals[portalIndex] ?? null : null;
    }
    listAllPortals() {
        return this.template.portals.concat(this.runtimePortals);
    }
    getInteractablePortalNear(x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
                const portal = this.getPortalAt(x + dx, y + dy);
                if (portal) {
                    return portal;
                }
            }
        }
        return null;
    }
    /** updateAuraDirtyState：更新灵气脏状态。 */
    updateAuraDirtyState(tileIndex, previous, next) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.applyTileResourceDirtyCounter(DEFAULT_TILE_AURA_RESOURCE_KEY, tileIndex, previous, next);
        this.markTileResourcePersistenceDirty(DEFAULT_TILE_AURA_RESOURCE_KEY, tileIndex);
        this.persistentRevision += 1;
    }
    /** getOrCreateTileResourceBucket：读取或初始化地块资源桶。 */
    getOrCreateTileResourceBucket(resourceKey) {
        const existing = this.tileResourceBuckets.get(resourceKey);
        if (existing) {
            return existing;
        }
        const bucket = new Int32Array(Math.max(this.tilePlane.getCellCapacity(), this.occupancy.length));
        this.tileResourceBuckets.set(resourceKey, bucket);
        return bucket;
    }
    /** getOrCreateBaseTileResourceBucket：读取或初始化模板基线资源桶。 */
    getOrCreateBaseTileResourceBucket(resourceKey) {
        const existing = this.baseTileResourceBuckets.get(resourceKey);
        if (existing) {
            return existing;
        }
        const bucket = new Int32Array(Math.max(this.tilePlane.getCellCapacity(), this.occupancy.length));
        this.baseTileResourceBuckets.set(resourceKey, bucket);
        return bucket;
    }
    /** getTileResourceBaseValueByIndex：读取资源在模板上的基线值。 */
    getTileResourceBaseValueByIndex(resourceKey, tileIndex) {
        return this.baseTileResourceBuckets.get(resourceKey)?.[tileIndex] ?? 0;
    }
    /** getTileResourceValueByIndex：读取资源在指定索引上的当前值。 */
    getTileResourceValueByIndex(resourceKey, tileIndex) {
        const bucket = resourceKey === DEFAULT_TILE_AURA_RESOURCE_KEY
            ? this.auraByTile
            : this.tileResourceBuckets.get(resourceKey);
        return bucket?.[tileIndex] ?? 0;
    }
    /** setTileResourceValueByIndex：写入资源值并维护脏标记。 */
    setTileResourceValueByIndex(resourceKey, tileIndex, next, previous = this.getTileResourceValueByIndex(resourceKey, tileIndex)) {
        this.ensureCellStorageCapacity(tileIndex + 1);
        const bucket = this.getOrCreateTileResourceBucket(resourceKey);
        bucket[tileIndex] = next;
        this.applyTileResourceDirtyCounter(resourceKey, tileIndex, previous, next);
        if (resourceKey !== DEFAULT_TILE_AURA_RESOURCE_KEY && (this.changedTileResourceEntryCountByKey.get(resourceKey) ?? 0) <= 0) {
            this.tileResourceBuckets.delete(resourceKey);
        }
        this.markTileResourcePersistenceDirty(resourceKey, tileIndex);
        this.persistentRevision += 1;
    }
    /** ensureCellStorageCapacity：保证按 cell index 寻址的运行时列容量足够。 */
    ensureCellStorageCapacity(required) {
        const normalizedRequired = Math.max(0, Math.trunc(Number(required) || 0));
        if (normalizedRequired <= this.occupancy.length) {
            return;
        }
        const nextCapacity = nextPowerOfTwo(normalizedRequired);
        const nextOccupancy = new Uint32Array(nextCapacity);
        nextOccupancy.set(this.occupancy);
        this.occupancy = nextOccupancy;
        for (const [resourceKey, bucket] of Array.from(this.tileResourceBuckets.entries())) {
            if (bucket.length >= nextCapacity) {
                continue;
            }
            const nextBucket = new Int32Array(nextCapacity);
            nextBucket.set(bucket);
            this.tileResourceBuckets.set(resourceKey, nextBucket);
            if (resourceKey === DEFAULT_TILE_AURA_RESOURCE_KEY) {
                this.auraByTile = nextBucket;
            }
        }
        for (const [resourceKey, bucket] of Array.from(this.baseTileResourceBuckets.entries())) {
            if (bucket.length >= nextCapacity) {
                continue;
            }
            const nextBucket = new Int32Array(nextCapacity);
            nextBucket.set(bucket);
            this.baseTileResourceBuckets.set(resourceKey, nextBucket);
        }
    }
    /** applyTileResourceDirtyCounter：维护地块资源脏条目统计。 */
    applyTileResourceDirtyCounter(resourceKey, tileIndex, previous, next) {
        const baseValue = this.getTileResourceBaseValueByIndex(resourceKey, tileIndex);
        const previousDirty = previous !== baseValue;
        const nextDirty = next !== baseValue;
        if (previousDirty === nextDirty) {
            if (resourceKey === DEFAULT_TILE_AURA_RESOURCE_KEY) {
                this.changedAuraTileCount = this.changedTileResourceEntryCountByKey.get(DEFAULT_TILE_AURA_RESOURCE_KEY) ?? this.changedAuraTileCount;
            }
            return;
        }
        const previousCount = this.changedTileResourceEntryCountByKey.get(resourceKey) ?? 0;
        const nextCount = nextDirty
            ? previousCount + 1
            : Math.max(0, previousCount - 1);
        if (nextCount > 0) {
            this.changedTileResourceEntryCountByKey.set(resourceKey, nextCount);
        }
        else {
            this.changedTileResourceEntryCountByKey.delete(resourceKey);
        }
        if (!previousDirty && nextDirty) {
            this.changedTileResourceEntryCount += 1;
        }
        else if (previousDirty && !nextDirty) {
            this.changedTileResourceEntryCount = Math.max(0, this.changedTileResourceEntryCount - 1);
        }
        if (resourceKey === DEFAULT_TILE_AURA_RESOURCE_KEY) {
            this.changedAuraTileCount = nextCount;
        }
    }
    /** isInBounds：判断坐标是否在地图范围内。 */
    isInBounds(x, y) {
        return this.tilePlane.getCellIndex(x, y) >= 0;
    }
    /** setOccupied：设置地块占用状态。 */
    setOccupied(x, y, handle) {
        const tileIndex = this.toTileIndex(x, y);
        if (tileIndex < 0) {
            return false;
        }
        this.ensureCellStorageCapacity(tileIndex + 1);
        this.occupancy[tileIndex] = handle;
        return true;
    }
    /** toTileIndex：把坐标转换成地块索引。 */
    toTileIndex(x, y) {
        return this.tilePlane.getCellIndex(x, y);
    }
    /** allocateHandle：分配一个可复用句柄。 */
    allocateHandle() {
        return this.freeHandles.pop() ?? this.nextHandle++;
    }
    /** initializeMonsterSpawnAccelerationStates：初始化普通怪物刷新点清场加速状态。 */
    initializeMonsterSpawnAccelerationStates() {
        this.monsterSpawnAccelerationStatesByKey.clear();
        for (const [spawnKey, group] of this.monsterSpawnGroupsByKey.entries()) {
            const sample = group[0];
            if (!sample || !isOrdinaryMonster(sample)) {
                continue;
            }
            this.monsterSpawnAccelerationStatesByKey.set(spawnKey, {
                spawnKey,
                respawnSpeedBonusPercent: 0,
                clearDeadlineTick: areAllMonstersAlive(group)
                    ? this.tick + resolveMonsterRespawnTicksWithBonus(sample.respawnTicks, 0)
                    : 0,
            });
        }
    }
    /** getMonsterSpawnGroup：读取同一刷新点下的全部怪物。 */
    getMonsterSpawnGroup(monster) {
        return this.monsterSpawnGroupsByKey.get(monster.spawnKey) ?? [monster];
    }
    /** getMonsterSpawnAccelerationState：读取或创建普通怪物刷新点加速状态。 */
    getMonsterSpawnAccelerationState(monster) {
        if (!isOrdinaryMonster(monster)) {
            return undefined;
        }
        let state = this.monsterSpawnAccelerationStatesByKey.get(monster.spawnKey);
        if (!state) {
            const group = this.getMonsterSpawnGroup(monster);
            state = {
                spawnKey: monster.spawnKey,
                respawnSpeedBonusPercent: 0,
                clearDeadlineTick: areAllMonstersAlive(group)
                    ? this.tick + resolveMonsterRespawnTicksWithBonus(monster.respawnTicks, 0)
                    : 0,
            };
            this.monsterSpawnAccelerationStatesByKey.set(monster.spawnKey, state);
        }
        return state;
    }
    /** resolveMonsterRespawnTicks：按普通怪物清场加速状态计算本次复活间隔。 */
    resolveMonsterRespawnTicks(monster) {
        const bonus = this.getMonsterSpawnAccelerationState(monster)?.respawnSpeedBonusPercent ?? 0;
        return resolveMonsterRespawnTicksWithBonus(monster.respawnTicks, bonus);
    }
    /** handleMonsterRespawn：普通怪物整组复活后重设下一次清场期限。 */
    handleMonsterRespawn(monster) {
        const state = this.getMonsterSpawnAccelerationState(monster);
        if (!state) {
            return;
        }
        const group = this.getMonsterSpawnGroup(monster);
        if (!areAllMonstersAlive(group)) {
            return;
        }
        state.clearDeadlineTick = this.tick + resolveMonsterRespawnTicksWithBonus(monster.respawnTicks, state.respawnSpeedBonusPercent);
    }
    /** handleMonsterDefeat：普通怪物整组清场时更新加速倍率并统一复活倒计时。 */
    handleMonsterDefeat(monster) {
        const state = this.getMonsterSpawnAccelerationState(monster);
        if (!state) {
            return;
        }
        const group = this.getMonsterSpawnGroup(monster);
        if (!areAllMonstersDefeated(group)) {
            return;
        }
        const clearedInTime = state.clearDeadlineTick > 0 && this.tick <= state.clearDeadlineTick;
        const nextBonusPercent = clearedInTime
            ? Math.min(MONSTER_RESPAWN_ACCELERATION_MAX_PERCENT, state.respawnSpeedBonusPercent + MONSTER_RESPAWN_ACCELERATION_STEP_PERCENT)
            : 0;
        state.respawnSpeedBonusPercent = nextBonusPercent;
        state.clearDeadlineTick = 0;
        const respawnTicks = resolveMonsterRespawnTicksWithBonus(monster.respawnTicks, nextBonusPercent);
        for (const entry of group) {
            if (!entry.alive) {
                entry.respawnLeft = respawnTicks;
                this.markMonsterRuntimePersistenceDirty(entry.runtimeId);
            }
        }
    }
    /** markMonsterDefeated：标记妖兽已经被击败。 */
    markMonsterDefeated(monster) {
        this.monsterRuntimeIdByTile.delete(this.toTileIndex(monster.x, monster.y));
        monster.alive = false;
        monster.hp = 0;
        monster.respawnLeft = this.resolveMonsterRespawnTicks(monster);
        monster.attackReadyTick = 0;
        monster.cooldownReadyTickBySkillId = {};
        monster.aggroTargetPlayerId = null;
        monster.lastSeenTargetX = undefined;
        monster.lastSeenTargetY = undefined;
        monster.lastSeenTargetTick = undefined;
        monster.buffs.length = 0;
        /** recalculateMonsterDerivedState：重算妖兽派生状态。 */
        recalculateMonsterDerivedState(monster);
        this.handleMonsterDefeat(monster);
        this.markMonsterRuntimePersistenceDirty(monster.runtimeId);
        this.worldRevision += 1;
    }
    /** respawnMonster：在重生点复生妖兽。 */
    respawnMonster(monster) {

        const respawn = this.findNearestOpenTile(monster.spawnX, monster.spawnY) ?? { x: monster.spawnX, y: monster.spawnY };
        monster.x = respawn.x;
        monster.y = respawn.y;
        monster.alive = true;
        monster.respawnLeft = 0;
        monster.attackReadyTick = 0;
        monster.cooldownReadyTickBySkillId = {};
        monster.aggroTargetPlayerId = null;
        monster.lastSeenTargetX = undefined;
        monster.lastSeenTargetY = undefined;
        monster.lastSeenTargetTick = undefined;
        monster.buffs.length = 0;
        monster.damageContributors = {};
        /** recalculateMonsterDerivedState：重算妖兽派生状态。 */
        recalculateMonsterDerivedState(monster);
        monster.hp = monster.maxHp;
        this.monsterRuntimeIdByTile.set(this.toTileIndex(monster.x, monster.y), monster.runtimeId);
        this.handleMonsterRespawn(monster);
        this.markMonsterRuntimePersistenceDirty(monster.runtimeId);
    }
    /** resolveMonsterTarget：解析妖兽的当前目标。 */
    resolveMonsterTarget(monster) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const aggroRange = Math.max(0, Math.trunc(Number(monster.aggroRange) || 0));
        const visibleTileIndices = this.collectVisibleTileIndices(monster.x, monster.y, aggroRange);
        if (monster.aggroTargetPlayerId) {

            const current = this.playersById.get(monster.aggroTargetPlayerId);
            if (current
                && chebyshevDistance(monster.spawnX, monster.spawnY, current.x, current.y) <= monster.leashRange
                && chebyshevDistance(monster.x, monster.y, current.x, current.y) <= aggroRange
                && visibleTileIndices.has(this.toTileIndex(current.x, current.y))) {
                this.rememberMonsterTargetSight(monster, current);
                return current;
            }
            if (!current || chebyshevDistance(monster.spawnX, monster.spawnY, current.x, current.y) > monster.leashRange) {
                this.clearMonsterTargetPursuit(monster);
            }
        }

        let best = null;

        let bestDistance = Number.POSITIVE_INFINITY;
        for (const player of this.playersById.values()) {
            if (chebyshevDistance(monster.spawnX, monster.spawnY, player.x, player.y) > monster.leashRange) {
                continue;
            }

            const distance = chebyshevDistance(monster.x, monster.y, player.x, player.y);
            if (distance > aggroRange || distance >= bestDistance) {
                continue;
            }
            if (!visibleTileIndices.has(this.toTileIndex(player.x, player.y))) {
                continue;
            }
            best = player;
            bestDistance = distance;
        }
        if (best) {
            this.rememberMonsterTargetSight(monster, best);
        }
        return best;
    }
    /** rememberMonsterTargetSight：记录妖兽最后一次真正看见目标的位置。 */
    rememberMonsterTargetSight(monster, target) {
        monster.aggroTargetPlayerId = target.playerId;
        monster.lastSeenTargetX = target.x;
        monster.lastSeenTargetY = target.y;
        monster.lastSeenTargetTick = this.tick;
    }
    /** clearMonsterTargetPursuit：清理妖兽追击状态。 */
    clearMonsterTargetPursuit(monster) {
        monster.aggroTargetPlayerId = null;
        monster.lastSeenTargetX = undefined;
        monster.lastSeenTargetY = undefined;
        monster.lastSeenTargetTick = undefined;
    }
    /** resolveMonsterLostSightChaseTarget：解析妖兽丢视野后的短暂追击落点。 */
    resolveMonsterLostSightChaseTarget(monster) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const targetPlayerId = monster.aggroTargetPlayerId;
        const lastSeenTick = monster.lastSeenTargetTick;
        const lastSeenX = monster.lastSeenTargetX;
        const lastSeenY = monster.lastSeenTargetY;
        if (typeof targetPlayerId !== 'string'
            || !Number.isInteger(lastSeenTick)
            || !Number.isInteger(lastSeenX)
            || !Number.isInteger(lastSeenY)) {
            return null;
        }
        if (this.tick > Number(lastSeenTick) + MONSTER_LOST_SIGHT_CHASE_TICKS) {
            return null;
        }
        const target = this.playersById.get(targetPlayerId);
        if (!target || chebyshevDistance(monster.spawnX, monster.spawnY, target.x, target.y) > monster.leashRange) {
            return null;
        }
        const normalizedLastSeenX = Math.trunc(Number(lastSeenX));
        const normalizedLastSeenY = Math.trunc(Number(lastSeenY));
        if (chebyshevDistance(monster.x, monster.y, normalizedLastSeenX, normalizedLastSeenY) <= 1) {
            return null;
        }
        return { x: normalizedLastSeenX, y: normalizedLastSeenY };
    }
    /** isMonsterWithinWanderRange：判断妖兽是否仍在活动范围内。 */
    isMonsterWithinWanderRange(monster, x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const radius = Math.max(0, Math.trunc(Number(monster.wanderRadius) || 0));
        return (0, shared_1.isOffsetInRange)(x - monster.spawnX, y - monster.spawnY, radius);
    }
    /** stepMonsterIdleRoam：让无目标妖兽在活动范围内随机闲逛一步。 */
    stepMonsterIdleRoam(monster) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const radius = Math.max(0, Math.trunc(Number(monster.wanderRadius) || 0));
        if (radius <= 0) {
            return false;
        }
        const directions = [
            { dx: 1, dy: 0, facing: shared_1.Direction.East },
            { dx: -1, dy: 0, facing: shared_1.Direction.West },
            { dx: 0, dy: 1, facing: shared_1.Direction.South },
            { dx: 0, dy: -1, facing: shared_1.Direction.North },
        ];
        const startIndex = Math.floor(Math.random() * directions.length);
        for (let offset = 0; offset < directions.length; offset += 1) {
            const direction = directions[(startIndex + offset) % directions.length];
            if (!direction) {
                continue;
            }
            const nextX = monster.x + direction.dx;
            const nextY = monster.y + direction.dy;
            if (!this.isMonsterWithinWanderRange(monster, nextX, nextY)) {
                continue;
            }
            if (!this.isOpenTile(nextX, nextY)) {
                continue;
            }
            this.monsterRuntimeIdByTile.delete(this.toTileIndex(monster.x, monster.y));
            monster.x = nextX;
            monster.y = nextY;
            monster.facing = direction.facing;
            this.monsterRuntimeIdByTile.set(this.toTileIndex(monster.x, monster.y), monster.runtimeId);
            this.markMonsterRuntimePersistenceDirty(monster.runtimeId);
            return true;
        }
        return false;
    }
    /** tryMoveMonsterToward：尝试让妖兽朝目标移动。 */
    tryMoveMonsterToward(monster, targetX, targetY) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const next = chooseMonsterStep(monster.x, monster.y, targetX, targetY);
        for (const candidate of next) {
            if (!this.isOpenTile(candidate.x, candidate.y)) {
                continue;
            }
            this.monsterRuntimeIdByTile.delete(this.toTileIndex(monster.x, monster.y));
            monster.x = candidate.x;
            monster.y = candidate.y;
            monster.facing = candidate.facing;
            this.monsterRuntimeIdByTile.set(this.toTileIndex(monster.x, monster.y), monster.runtimeId);
            this.markMonsterRuntimePersistenceDirty(monster.runtimeId);
            return true;
        }
        return false;
    }
}
exports.MapInstanceRuntime = MapInstanceRuntime;
export { MapInstanceRuntime };
/** getTileRestoreSpeedMultiplier：读取地形恢复速度倍率。 */
function getTileRestoreSpeedMultiplier(tileType) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const configured = SPECIAL_TILE_RESTORE_SPEED_MULTIPLIERS[tileType] ?? 1;
    return Number.isFinite(configured) && configured > 0 ? configured : 1;
}
/** calculateTileRestoreTicks：按 main 口径计算摧毁地块复生时间。 */
function calculateTileRestoreTicks(tileType) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    return Math.max(1, Math.ceil(shared_1.TERRAIN_DESTROYED_RESTORE_TICKS / getTileRestoreSpeedMultiplier(tileType)));
}
/** calculateTileRestoreRetryTicks：按 main 口径计算复生受阻后的重试时间。 */
function calculateTileRestoreRetryTicks(tileType) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    return Math.max(1, Math.ceil(shared_1.TERRAIN_RESTORE_RETRY_DELAY_TICKS / getTileRestoreSpeedMultiplier(tileType)));
}
/** normalizeTileRestoreTicksLeft：恢复持久化地块复生倒计时。 */
function normalizeTileRestoreTicksLeft(value, tileType) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalized = Math.trunc(Number(value));
    return Number.isFinite(normalized) && normalized > 0 ? normalized : calculateTileRestoreTicks(tileType);
}
/** resolveTileDurability：解析地形耐久配置。 */
function resolveTileDurability(template, tileType, x = null, y = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (template?.source?.sectMap === true && tileType === shared_1.TileType.Stone) {
        const centerX = Number.isFinite(Number(template.source.sectCoreX)) ? Math.trunc(Number(template.source.sectCoreX)) : Math.trunc(template.width / 2);
        const centerY = Number.isFinite(Number(template.source.sectCoreY)) ? Math.trunc(Number(template.source.sectCoreY)) : Math.trunc(template.height / 2);
        const dx = Number.isFinite(Number(x)) ? Math.abs(Math.trunc(Number(x)) - centerX) : 1;
        const dy = Number.isFinite(Number(y)) ? Math.abs(Math.trunc(Number(y)) - centerY) : 1;
        const ring = Math.max(1, dx, dy);
        return Math.max(1, Math.trunc(100000 * Math.pow(2, Math.max(0, ring - 1))));
    }

    const profileId = template.source.terrainProfileId
        ?? LEGACY_MAP_TERRAIN_PROFILE_IDS[template.id]
        ?? template.id;

    const profile = TERRAIN_DURABILITY_PROFILES[profileId]?.[tileType] ?? DEFAULT_TERRAIN_DURABILITY_BY_TILE[tileType];
    if (!profile) {
        return 0;
    }

    const terrainRealmLv = Number.isFinite(template.source?.terrainRealmLv)
        ? Math.max(1, Math.floor(Number(template.source.terrainRealmLv)))
        : 1;
    const baseDurability = (0, shared_1.calculateTerrainDurability)(terrainRealmLv, profile.multiplier);

    const multiplier = SPECIAL_TILE_DURABILITY_MULTIPLIERS[tileType] ?? 1;
    return Math.max(1, Math.round(baseDurability * multiplier));
}
/** clampCoordinate：把坐标夹到地图边界内。 */
function clampCoordinate(value, size) {
    return Math.max(0, Math.min(size - 1, Math.trunc(value)));
}

/** DIRECTION_OFFSET：DIRECTIONOFFSET。 */
const DIRECTION_OFFSET = {
    [shared_1.Direction.North]: { x: 0, y: -1 },
    [shared_1.Direction.South]: { x: 0, y: 1 },
    [shared_1.Direction.East]: { x: 1, y: 0 },
    [shared_1.Direction.West]: { x: -1, y: 0 },
};
/** buildGroundSourceId：构建地面物品堆来源 ID。 */
function buildGroundSourceId(tileIndex) {
    return `g:${tileIndex}`;
}
/** createMapInstanceDirtyDomainSet：构建实例脏域集合。 */
function createMapInstanceDirtyDomainSet() {
    return new Set();
}
const INCREMENTAL_PERSISTENCE_DOMAINS = new Set(['tile_resource', 'tile_damage', 'ground_item', 'monster_runtime']);
function normalizePositiveInteger(value, defaultValue, min, max) {
    if (typeof value === 'string' && value.trim() === '') {
        return defaultValue;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return defaultValue;
    }
    const normalized = Math.trunc(parsed);
    if (normalized < min) {
        return min;
    }
    if (normalized > max) {
        return max;
    }
    return normalized;
}
function shouldMarkTimePersistenceDirty(tick) {
    const normalizedTick = Number.isFinite(Number(tick)) ? Math.max(0, Math.trunc(Number(tick))) : 0;
    return normalizedTick > 0 && normalizedTick % MAP_TIME_PERSISTENCE_CHECKPOINT_INTERVAL_TICKS === 0;
}
/** markMapInstanceDirtyDomains：记录实例脏域。 */
function markMapInstanceDirtyDomains(instance, domains) {
    if (!instance) {
        return;
    }
    if (!(instance.dirtyDomains instanceof Set)) {
        instance.dirtyDomains = createMapInstanceDirtyDomainSet();
    }
    for (const domain of Array.isArray(domains) ? domains : []) {
        if (typeof domain === 'string' && domain.trim()) {
            instance.dirtyDomains.add(domain.trim());
        }
    }
}
/** markMapInstancePersistenceFullReplaceDomains：为未细分脏键的高频域保留全量兜底。 */
function markMapInstancePersistenceFullReplaceDomains(instance, domains) {
    if (!instance) {
        return;
    }
    if (!(instance.persistenceFullReplaceDomains instanceof Set)) {
        instance.persistenceFullReplaceDomains = createMapInstanceDirtyDomainSet();
    }
    for (const domain of Array.isArray(domains) ? domains : []) {
        const normalizedDomain = typeof domain === 'string' ? domain.trim() : '';
        if (INCREMENTAL_PERSISTENCE_DOMAINS.has(normalizedDomain)) {
            instance.persistenceFullReplaceDomains.add(normalizedDomain);
        }
    }
}
/** addTileResourceDirtyKey：记录地块资源的资源键与 tile 索引。 */
function addTileResourceDirtyKey(instance, resourceKey, tileIndex) {
    if (!instance || typeof resourceKey !== 'string' || !resourceKey.trim() || !Number.isFinite(Number(tileIndex))) {
        return;
    }
    if (!(instance.dirtyTileResourceByKey instanceof Map)) {
        instance.dirtyTileResourceByKey = new Map();
    }
    const normalizedResourceKey = resourceKey.trim();
    let tileIndices = instance.dirtyTileResourceByKey.get(normalizedResourceKey);
    if (!(tileIndices instanceof Set)) {
        tileIndices = new Set();
        instance.dirtyTileResourceByKey.set(normalizedResourceKey, tileIndices);
    }
    tileIndices.add(Math.max(0, Math.trunc(Number(tileIndex))));
}
/** addNumericDirtyKey：记录数字型脏键。 */
function addNumericDirtyKey(target, value) {
    if (!(target instanceof Set) || !Number.isFinite(Number(value))) {
        return;
    }
    target.add(Math.max(0, Math.trunc(Number(value))));
}
/** clearMapInstancePersistenceDeltaDomain：清理指定域的增量脏键。 */
function clearMapInstancePersistenceDeltaDomain(instance, domain) {
    if (!instance || typeof domain !== 'string') {
        return;
    }
    if (instance.persistenceFullReplaceDomains instanceof Set) {
        instance.persistenceFullReplaceDomains.delete(domain);
    }
    if (domain === 'tile_resource' && instance.dirtyTileResourceByKey instanceof Map) {
        instance.dirtyTileResourceByKey.clear();
        return;
    }
    if (domain === 'tile_damage' && instance.dirtyTileDamageIndices instanceof Set) {
        instance.dirtyTileDamageIndices.clear();
        return;
    }
    if (domain === 'ground_item' && instance.dirtyGroundItemTileIndices instanceof Set) {
        instance.dirtyGroundItemTileIndices.clear();
        return;
    }
    if (domain === 'monster_runtime' && instance.dirtyMonsterRuntimeIds instanceof Set) {
        instance.dirtyMonsterRuntimeIds.clear();
    }
}
/** clearMapInstancePersistenceDeltas：清空所有增量脏键。 */
function clearMapInstancePersistenceDeltas(instance) {
    if (!instance) {
        return;
    }
    if (instance.persistenceFullReplaceDomains instanceof Set) {
        instance.persistenceFullReplaceDomains.clear();
    }
    if (instance.dirtyTileResourceByKey instanceof Map) {
        instance.dirtyTileResourceByKey.clear();
    }
    if (instance.dirtyTileDamageIndices instanceof Set) {
        instance.dirtyTileDamageIndices.clear();
    }
    if (instance.dirtyGroundItemTileIndices instanceof Set) {
        instance.dirtyGroundItemTileIndices.clear();
    }
    if (instance.dirtyMonsterRuntimeIds instanceof Set) {
        instance.dirtyMonsterRuntimeIds.clear();
    }
}
/** clearMapInstanceDirtyDomains：清空实例脏域。 */
function clearMapInstanceDirtyDomains(instance) {
    if (instance?.dirtyDomains instanceof Set) {
        instance.dirtyDomains.clear();
    }
    clearMapInstancePersistenceDeltas(instance);
}
/** parseGroundSourceId：解析地面物品堆来源 ID。 */
function parseGroundSourceId(sourceId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!sourceId.startsWith('g:')) {
        return null;
    }

    const tileIndex = Number(sourceId.slice(2));
    return Number.isInteger(tileIndex) && tileIndex >= 0 ? tileIndex : null;
}
function nextPowerOfTwo(value) {
    let result = 1;
    const target = Math.max(1, Math.trunc(Number(value) || 1));
    while (result < target) {
        result <<= 1;
    }
    return result;
}
/** toGroundPileView：把地面物品堆转换成视图对象。 */
function toGroundPileView(pile) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!pile) {
        return null;
    }
    return {
        sourceId: pile.sourceId,
        x: pile.x,
        y: pile.y,
        items: pile.items.map((entry) => ({
            itemKey: entry.itemKey,
            itemId: entry.item.itemId,
            name: entry.item.name ?? entry.item.itemId,
            type: (entry.item.type ?? 'material'),
            count: entry.item.count,
            grade: entry.item.grade,
            groundLabel: entry.item.groundLabel,
        })),
    };
}
/** normalizePersistedGroundItem：规范化持久化地面物品条目。 */
function normalizePersistedGroundItem(item) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!item || typeof item !== 'object' || typeof item.itemId !== 'string' || !item.itemId.trim()) {
        return null;
    }

    const count = Number.isFinite(item.count) ? Math.max(1, Math.trunc(item.count)) : 1;
    return {
        ...item,
        itemId: item.itemId,
        count,
    };
}
/** compareGroundPiles：比较地面物品堆顺序。 */
function compareGroundPiles(left, right) {
    return left.y - right.y || left.x - right.x || left.sourceId.localeCompare(right.sourceId, 'zh-Hans-CN');
}
/** compareGroundEntries：比较地面物品条目顺序。 */
function compareGroundEntries(left, right) {
    return left.itemKey.localeCompare(right.itemKey, 'zh-Hans-CN');
}
/** compareLocalMonsters：比较妖兽排序。 */
function compareLocalMonsters(left, right) {
    return left.y - right.y || left.x - right.x || left.runtimeId.localeCompare(right.runtimeId, 'zh-Hans-CN');
}
/** compareLocalNpcs：比较 NPC 排序。 */
function compareLocalNpcs(left, right) {
    return left.y - right.y || left.x - right.x || left.npcId.localeCompare(right.npcId, 'zh-Hans-CN');
}
/** compareLocalContainers：比较容器排序。 */
function compareLocalContainers(left, right) {
    return left.y - right.y || left.x - right.x || left.id.localeCompare(right.id, 'zh-Hans-CN');
}
/** compareLocalLandmarks：比较地标排序。 */
function compareLocalLandmarks(left, right) {
    return left.y - right.y || left.x - right.x || left.id.localeCompare(right.id, 'zh-Hans-CN');
}
/** compareLocalSafeZones：比较安全区排序。 */
function compareLocalSafeZones(left, right) {
    return left.y - right.y || left.x - right.x || left.radius - right.radius;
}
/** countAliveMonsters：统计存活妖兽数量。 */
function countAliveMonsters(monstersByRuntimeId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    let count = 0;
    for (const monster of monstersByRuntimeId.values()) {
        if (monster.alive) {
            count += 1;
        }
    }
    return count;
}
/** snapshotNpc：快照 NPC。 */
function snapshotNpc(source) {
    return {
        ...source,
        shopItems: source.shopItems.map((entry) => ({ ...entry })),
        quests: source.quests.map((entry) => ({ ...entry })),
    };
}
/** snapshotContainer：快照容器。 */
function snapshotContainer(source) {
    return {
        ...source,
        drops: source.drops.map((entry) => ({ ...entry })),
        lootPools: source.lootPools.map((entry) => ({
            ...entry,
            tagGroups: entry.tagGroups?.map((group) => group.slice()),
        })),
    };
}
/** snapshotLandmark：快照地标。 */
function snapshotLandmark(source) {
    return {
        ...source,
        container: source.container ? snapshotContainer(source.container) : undefined,
    };
}
/** snapshotSafeZone：快照安全区。 */
function snapshotSafeZone(source) {
    return {
        x: source.x,
        y: source.y,
        radius: source.radius,
    };
}
/** snapshotGroundPile：快照地面物品堆。 */
function snapshotGroundPile(source) {
    return {
        ...source,
        items: source.items.map((entry) => ({
            itemKey: entry.itemKey,
            item: { ...entry.item },
        })),
    };
}
/** snapshotMonster：快照妖兽。 */
function snapshotMonster(source) {
    return {
        ...source,
        baseAttrs: cloneAttributes(source.baseAttrs),
        attrs: cloneAttributes(source.attrs),
        baseNumericStats: cloneNumericStats(source.baseNumericStats),
        numericStats: cloneNumericStats(source.numericStats),
        ratioDivisors: cloneNumericRatioDivisors(source.ratioDivisors),
        buffs: source.buffs.map((entry) => cloneTemporaryBuff(entry)),
        skills: source.skills.map((entry) => cloneSkill(entry)),
        cooldownReadyTickBySkillId: { ...source.cooldownReadyTickBySkillId },
        damageContributors: { ...source.damageContributors },
    };
}
/** cloneAttributes：克隆属性面板。 */
function cloneAttributes(source) {
    return {
        constitution: source.constitution,
        spirit: source.spirit,
        perception: source.perception,
        talent: source.talent,
        strength: source.strength ?? source.comprehension ?? 0,
        meridians: source.meridians ?? source.luck ?? 0,
    };
}
/** cloneNumericStats：克隆数值属性。 */
function cloneNumericStats(source) {
    return {
        maxHp: source.maxHp,
        maxQi: source.maxQi,
        physAtk: source.physAtk,
        spellAtk: source.spellAtk,
        physDef: source.physDef,
        spellDef: source.spellDef,
        hit: source.hit,
        dodge: source.dodge,
        crit: source.crit,
        critDamage: source.critDamage,
        breakPower: source.breakPower,
        resolvePower: source.resolvePower,
        maxQiOutputPerTick: source.maxQiOutputPerTick,
        qiRegenRate: source.qiRegenRate,
        hpRegenRate: source.hpRegenRate,
        cooldownSpeed: source.cooldownSpeed,
        auraCostReduce: source.auraCostReduce,
        auraPowerRate: source.auraPowerRate,
        playerExpRate: source.playerExpRate,
        techniqueExpRate: source.techniqueExpRate,
        realmExpPerTick: source.realmExpPerTick,
        techniqueExpPerTick: source.techniqueExpPerTick,
        lootRate: source.lootRate,
        rareLootRate: source.rareLootRate,
        viewRange: source.viewRange,
        moveSpeed: source.moveSpeed,
        extraAggroRate: source.extraAggroRate,
        extraRange: source.extraRange ?? 0,
        extraArea: source.extraArea ?? 0,
        actionsPerTurn: source.actionsPerTurn ?? 1,
        elementDamageBonus: { ...source.elementDamageBonus },
        elementDamageReduce: { ...source.elementDamageReduce },
    };
}
/** cloneNumericRatioDivisors：克隆数值比例除数。 */
function cloneNumericRatioDivisors(source) {
    return {
        dodge: source.dodge,
        crit: source.crit,
        breakPower: source.breakPower,
        resolvePower: source.resolvePower,
        cooldownSpeed: source.cooldownSpeed,
        moveSpeed: source.moveSpeed,
        elementDamageReduce: { ...source.elementDamageReduce },
    };
}
/** cloneSkill：克隆技能配置。 */
function cloneSkill(source) {
    return {
        ...source,
        targeting: source.targeting ? { ...source.targeting } : undefined,
        effects: source.effects.map((entry) => ({ ...entry })),
    };
}
/** cloneTemporaryBuff：克隆临时 Buff。 */
function cloneTemporaryBuff(source) {
    return {
        ...source,
        attrs: source.attrs ? { ...source.attrs } : undefined,
        stats: source.stats ? { ...source.stats } : undefined,
        qiProjection: source.qiProjection ? source.qiProjection.map((entry) => ({ ...entry })) : undefined,
    };
}
/** tickTemporaryBuffs：推进临时 Buff 计时。 */
function tickTemporaryBuffs(buffs) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    let changed = false;
    for (const buff of buffs) {
        if (buff.remainingTicks > 0) {
            buff.remainingTicks -= 1;
            changed = true;
        }
    }

    const nextLength = buffs.filter((entry) => entry.remainingTicks > 0 && entry.stacks > 0).length;
    if (nextLength !== buffs.length) {
        changed = true;
    }
    if (changed) {

        let writeIndex = 0;
        for (const buff of buffs) {
            if (buff.remainingTicks > 0 && buff.stacks > 0) {
                buffs[writeIndex] = buff;
                writeIndex += 1;
            }
        }
        buffs.length = writeIndex;
    }
    return changed;
}
/** recalculateMonsterDerivedState：重算妖兽派生状态。 */
function recalculateMonsterDerivedState(monster) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const nextAttrs = cloneAttributes(monster.baseAttrs);

    const nextStats = cloneNumericStats(monster.baseNumericStats);
    for (const buff of monster.buffs) {
        const stacks = Math.max(1, buff.stacks);
        if (buff.attrs) {
            nextAttrs.constitution += (buff.attrs.constitution ?? 0) * stacks;
            nextAttrs.spirit += (buff.attrs.spirit ?? 0) * stacks;
            nextAttrs.perception += (buff.attrs.perception ?? 0) * stacks;
            nextAttrs.talent += (buff.attrs.talent ?? 0) * stacks;
            nextAttrs.strength += (buff.attrs.strength ?? buff.attrs.comprehension ?? 0) * stacks;
            nextAttrs.meridians += (buff.attrs.meridians ?? buff.attrs.luck ?? 0) * stacks;
        }
        if (buff.stats) {
            nextStats.maxHp += (buff.stats.maxHp ?? 0) * stacks;
            nextStats.maxQi += (buff.stats.maxQi ?? 0) * stacks;
            nextStats.physAtk += (buff.stats.physAtk ?? 0) * stacks;
            nextStats.spellAtk += (buff.stats.spellAtk ?? 0) * stacks;
            nextStats.physDef += (buff.stats.physDef ?? 0) * stacks;
            nextStats.spellDef += (buff.stats.spellDef ?? 0) * stacks;
            nextStats.hit += (buff.stats.hit ?? 0) * stacks;
            nextStats.dodge += (buff.stats.dodge ?? 0) * stacks;
            nextStats.crit += (buff.stats.crit ?? 0) * stacks;
            nextStats.critDamage += (buff.stats.critDamage ?? 0) * stacks;
            nextStats.breakPower += (buff.stats.breakPower ?? 0) * stacks;
            nextStats.resolvePower += (buff.stats.resolvePower ?? 0) * stacks;
            nextStats.maxQiOutputPerTick += (buff.stats.maxQiOutputPerTick ?? 0) * stacks;
            nextStats.qiRegenRate += (buff.stats.qiRegenRate ?? 0) * stacks;
            nextStats.hpRegenRate += (buff.stats.hpRegenRate ?? 0) * stacks;
            nextStats.cooldownSpeed += (buff.stats.cooldownSpeed ?? 0) * stacks;
            nextStats.auraCostReduce += (buff.stats.auraCostReduce ?? 0) * stacks;
            nextStats.auraPowerRate += (buff.stats.auraPowerRate ?? 0) * stacks;
            nextStats.playerExpRate += (buff.stats.playerExpRate ?? 0) * stacks;
            nextStats.techniqueExpRate += (buff.stats.techniqueExpRate ?? 0) * stacks;
            nextStats.realmExpPerTick += (buff.stats.realmExpPerTick ?? 0) * stacks;
            nextStats.techniqueExpPerTick += (buff.stats.techniqueExpPerTick ?? 0) * stacks;
            nextStats.lootRate += (buff.stats.lootRate ?? 0) * stacks;
            nextStats.rareLootRate += (buff.stats.rareLootRate ?? 0) * stacks;
            nextStats.viewRange += (buff.stats.viewRange ?? 0) * stacks;
            nextStats.moveSpeed += (buff.stats.moveSpeed ?? 0) * stacks;
            nextStats.extraAggroRate += (buff.stats.extraAggroRate ?? 0) * stacks;
            nextStats.extraRange += (buff.stats.extraRange ?? 0) * stacks;
            nextStats.extraArea += (buff.stats.extraArea ?? 0) * stacks;
            nextStats.actionsPerTurn += (buff.stats.actionsPerTurn ?? 0) * stacks;
            nextStats.elementDamageBonus.metal += (buff.stats.elementDamageBonus?.metal ?? 0) * stacks;
            nextStats.elementDamageBonus.wood += (buff.stats.elementDamageBonus?.wood ?? 0) * stacks;
            nextStats.elementDamageBonus.water += (buff.stats.elementDamageBonus?.water ?? 0) * stacks;
            nextStats.elementDamageBonus.fire += (buff.stats.elementDamageBonus?.fire ?? 0) * stacks;
            nextStats.elementDamageBonus.earth += (buff.stats.elementDamageBonus?.earth ?? 0) * stacks;
            nextStats.elementDamageReduce.metal += (buff.stats.elementDamageReduce?.metal ?? 0) * stacks;
            nextStats.elementDamageReduce.wood += (buff.stats.elementDamageReduce?.wood ?? 0) * stacks;
            nextStats.elementDamageReduce.water += (buff.stats.elementDamageReduce?.water ?? 0) * stacks;
            nextStats.elementDamageReduce.fire += (buff.stats.elementDamageReduce?.fire ?? 0) * stacks;
            nextStats.elementDamageReduce.earth += (buff.stats.elementDamageReduce?.earth ?? 0) * stacks;
        }
    }
    nextStats.maxHp = Math.max(1, Math.round(nextStats.maxHp));
    nextStats.maxQi = Math.max(0, Math.round(nextStats.maxQi));

    const previousMaxHp = monster.maxHp;

    const previousHp = monster.hp;

    const previousAttrs = monster.attrs;

    const previousStats = monster.numericStats;
    monster.attrs = nextAttrs;
    monster.numericStats = nextStats;
    monster.maxHp = Math.max(1, Math.round(nextStats.maxHp));
    if (monster.alive) {
        monster.hp = previousMaxHp > 0
            ? Math.max(0, Math.min(monster.maxHp, Math.round(previousHp / previousMaxHp * monster.maxHp)))
            : monster.maxHp;
    }
    else {
        monster.hp = 0;
    }
    return !isSameAttributes(previousAttrs, nextAttrs)
        || !isSameNumericStats(previousStats, nextStats)
        || previousMaxHp !== monster.maxHp
        || previousHp !== monster.hp;
}
/** isSameAttributes：判断属性是否一致。 */
function isSameAttributes(left, right) {
    return left.constitution === right.constitution
        && left.spirit === right.spirit
        && left.perception === right.perception
        && left.talent === right.talent
        && left.strength === right.strength
        && left.meridians === right.meridians;
}
/** isSameNumericStats：判断数值属性是否一致。 */
function isSameNumericStats(left, right) {
    return left.maxHp === right.maxHp
        && left.maxQi === right.maxQi
        && left.physAtk === right.physAtk
        && left.spellAtk === right.spellAtk
        && left.physDef === right.physDef
        && left.spellDef === right.spellDef
        && left.hit === right.hit
        && left.dodge === right.dodge
        && left.crit === right.crit
        && left.critDamage === right.critDamage
        && left.breakPower === right.breakPower
        && left.resolvePower === right.resolvePower
        && left.maxQiOutputPerTick === right.maxQiOutputPerTick
        && left.qiRegenRate === right.qiRegenRate
        && left.hpRegenRate === right.hpRegenRate
        && left.cooldownSpeed === right.cooldownSpeed
        && left.auraCostReduce === right.auraCostReduce
        && left.auraPowerRate === right.auraPowerRate
        && left.playerExpRate === right.playerExpRate
        && left.techniqueExpRate === right.techniqueExpRate
        && left.realmExpPerTick === right.realmExpPerTick
        && left.techniqueExpPerTick === right.techniqueExpPerTick
        && left.lootRate === right.lootRate
        && left.rareLootRate === right.rareLootRate
        && left.viewRange === right.viewRange
        && left.moveSpeed === right.moveSpeed
        && left.extraAggroRate === right.extraAggroRate
        && left.extraRange === right.extraRange
        && left.extraArea === right.extraArea
        && left.actionsPerTurn === right.actionsPerTurn
        && left.elementDamageBonus.metal === right.elementDamageBonus.metal
        && left.elementDamageBonus.wood === right.elementDamageBonus.wood
        && left.elementDamageBonus.water === right.elementDamageBonus.water
        && left.elementDamageBonus.fire === right.elementDamageBonus.fire
        && left.elementDamageBonus.earth === right.elementDamageBonus.earth
        && left.elementDamageReduce.metal === right.elementDamageReduce.metal
        && left.elementDamageReduce.wood === right.elementDamageReduce.wood
        && left.elementDamageReduce.water === right.elementDamageReduce.water
        && left.elementDamageReduce.fire === right.elementDamageReduce.fire
        && left.elementDamageReduce.earth === right.elementDamageReduce.earth;
}
/** buildMonsterAttackDamage：构建妖兽普通攻击伤害。 */
function buildMonsterAttackDamage(monster) {

    const attack = Math.max(monster.numericStats.physAtk, monster.numericStats.spellAtk);
    return Math.max(1, Math.round(attack));
}
/** recoverMonsterHp：恢复妖兽生命值。 */
function recoverMonsterHp(monster) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!monster.alive || monster.hp >= monster.maxHp || monster.numericStats.hpRegenRate <= 0) {
        return false;
    }

    const heal = Math.max(1, Math.round(monster.maxHp * (monster.numericStats.hpRegenRate / 10000)));

    const nextHp = Math.min(monster.maxHp, monster.hp + heal);
    if (nextHp === monster.hp) {
        return false;
    }
    monster.hp = nextHp;
    return true;
}
/** chooseMonsterSkill：选择妖兽技能。 */
function chooseMonsterSkill(monster, distance, currentTick) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    let selected = null;

    let selectedRange = 0;
    for (const skill of monster.skills) {
        if (!matchesMonsterSkillConditions(monster, skill)) {
            continue;
        }
        const skillRange = buildEffectiveMonsterSkillGeometry(monster, skill).range;
        if (distance > skillRange) {
            continue;
        }

        const readyTick = monster.cooldownReadyTickBySkillId[skill.id] ?? 0;
        if (currentTick < readyTick) {
            continue;
        }
        if (!selected) {
            selected = skill;
            selectedRange = skillRange;
            continue;
        }
        if (skillRange > selectedRange || (skillRange === selectedRange && skill.id < selected.id)) {
            selected = skill;
            selectedRange = skillRange;
        }
    }
    return selected;
}
function matchesMonsterSkillConditions(monster, skill) {
    const group = skill?.monsterCast?.conditions;
    if (!group || !Array.isArray(group.items) || group.items.length === 0) {
        return true;
    }
    const matches = (condition) => matchesMonsterSkillCondition(monster, condition);
    return group.mode === 'any' ? group.items.some(matches) : group.items.every(matches);
}
function matchesMonsterSkillCondition(monster, condition) {
    switch (condition?.type) {
        case 'hp_ratio': {
            const maxHp = Math.max(1, Math.round(monster.maxHp));
            const ratio = maxHp > 0 ? monster.hp / maxHp : 0;
            return condition.op === '<=' ? ratio <= condition.value : ratio >= condition.value;
        }
        case 'qi_ratio': {
            const maxQi = Math.max(0, Math.round(monster.numericStats?.maxQi ?? 0));
            const qi = Math.max(0, Math.round(monster.qi ?? 0));
            const ratio = maxQi > 0 ? qi / maxQi : 0;
            return condition.op === '<=' ? ratio <= condition.value : ratio >= condition.value;
        }
        case 'has_buff':
            return (monster.buffs ?? []).some((buff) => (
                buff.buffId === condition.buffId
                && Number(buff.remainingTicks) > 0
                && Number(buff.stacks ?? 0) >= (condition.minStacks ?? 1)
            ));
        case 'is_cultivating':
        case 'target_kind':
            return condition.value === false;
        default:
            return true;
    }
}
function getMonsterSkillWindupTicks(skill) {
    const windupTicks = skill?.monsterCast?.windupTicks;
    return Number.isFinite(windupTicks)
        ? Math.max(0, Math.floor(Number(windupTicks)))
        : 0;
}
function getMonsterSkillWarningColor(skill) {
    return typeof skill?.monsterCast?.warningColor === 'string' && skill.monsterCast.warningColor.trim().length > 0
        ? skill.monsterCast.warningColor.trim()
        : undefined;
}
function buildEffectiveMonsterSkillGeometry(monster, skill) {
    return (0, shared_1.buildEffectiveTargetingGeometry)({
        range: resolveSkillRange(skill),
        shape: skill.targeting?.shape ?? 'single',
        radius: skill.targeting?.radius,
        innerRadius: skill.targeting?.innerRadius,
        width: skill.targeting?.width,
        height: skill.targeting?.height,
        checkerParity: skill.targeting?.checkerParity,
    }, {
        extraRange: Math.max(0, Math.floor(monster.numericStats?.extraRange ?? 0)),
        extraArea: Math.max(0, Math.floor(monster.numericStats?.extraArea ?? 0)),
    });
}
function buildMonsterSkillAffectedCells(monster, skill, anchor) {
    const geometry = buildEffectiveMonsterSkillGeometry(monster, skill);
    const shape = geometry.shape ?? 'single';
    if (shape === 'single') {
        return chebyshevDistance(monster.x, monster.y, anchor.x, anchor.y) <= geometry.range
            ? [{ x: anchor.x, y: anchor.y }]
            : [];
    }
    return (0, shared_1.computeAffectedCellsFromAnchor)({ x: monster.x, y: monster.y }, anchor, geometry);
}
function resolveFacingToward(fromX, fromY, toX, toY) {
    if (toX > fromX) {
        return shared_1.Direction.East;
    }
    if (toX < fromX) {
        return shared_1.Direction.West;
    }
    if (toY > fromY) {
        return shared_1.Direction.South;
    }
    return shared_1.Direction.North;
}
function buildMonsterSpawnKey(monsterId, spawnX, spawnY) {
    return `monster_spawn:${monsterId}:${spawnX}:${spawnY}`;
}
function isOrdinaryMonster(monster) {
    return monster?.tier === 'mortal_blood';
}
function areAllMonstersAlive(monsters) {
    return monsters.length > 0 && monsters.every((monster) => monster.alive === true);
}
function areAllMonstersDefeated(monsters) {
    return monsters.length > 0 && monsters.every((monster) => monster.alive !== true);
}
function normalizeMonsterRespawnSpeedBonusPercent(value) {
    if (!Number.isFinite(Number(value))) {
        return 0;
    }
    const normalized = Math.round(Number(value) / MONSTER_RESPAWN_ACCELERATION_STEP_PERCENT)
        * MONSTER_RESPAWN_ACCELERATION_STEP_PERCENT;
    return Math.max(0, Math.min(MONSTER_RESPAWN_ACCELERATION_MAX_PERCENT, normalized));
}
function resolveMonsterRespawnTicksWithBonus(respawnTicks, bonusPercent) {
    const safeTicks = Math.max(1, Math.round(Number(respawnTicks) || 1));
    const safeBonusPercent = normalizeMonsterRespawnSpeedBonusPercent(bonusPercent);
    return Math.max(
        1,
        Math.round(
            safeTicks * MONSTER_RESPAWN_ACCELERATION_BASE_PERCENT
                / (MONSTER_RESPAWN_ACCELERATION_BASE_PERCENT + safeBonusPercent),
        ),
    );
}
/** resolveSkillRange：解析技能射程。 */
function resolveSkillRange(skill) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const targetingRange = skill.targeting?.range;
    if (typeof targetingRange === 'number' && Number.isFinite(targetingRange)) {
        return Math.max(1, Math.round(targetingRange));
    }
    return Math.max(1, Math.round(skill.range));
}
/** chooseMonsterStep：选择妖兽下一步移动。 */
function chooseMonsterStep(fromX, fromY, targetX, targetY) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const dx = Math.sign(targetX - fromX);

    const dy = Math.sign(targetY - fromY);

    const candidates = [];
    if (Math.abs(targetX - fromX) >= Math.abs(targetY - fromY) && dx !== 0) {
        candidates.push({
            x: fromX + dx,
            y: fromY,
            facing: dx > 0 ? shared_1.Direction.East : shared_1.Direction.West,
        });
    }
    if (dy !== 0) {
        candidates.push({
            x: fromX,
            y: fromY + dy,
            facing: dy > 0 ? shared_1.Direction.South : shared_1.Direction.North,
        });
    }
    if (Math.abs(targetX - fromX) < Math.abs(targetY - fromY) && dx !== 0) {
        candidates.push({
            x: fromX + dx,
            y: fromY,
            facing: dx > 0 ? shared_1.Direction.East : shared_1.Direction.West,
        });
    }
    return candidates;
}
/** chebyshevDistance：计算切比雪夫距离。 */
function chebyshevDistance(ax, ay, bx, by) {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

"use strict";
// @ts-nocheck
Object.defineProperty(exports, "__esModule", { value: true });
exports.MapInstanceRuntime = void 0;

const shared_1 = require("@mud/shared");

const map_template_repository_1 = require("../map/map-template.repository");

const DEFAULT_TILE_AURA_RESOURCE_KEY = (0, shared_1.buildQiResourceKey)(shared_1.DEFAULT_QI_RESOURCE_DESCRIPTOR);

/** INVALID_OCCUPANCY：空占位值，表示该地块当前未被占用。 */
const INVALID_OCCUPANCY = 0;

/** DEFAULT_VIEW_RADIUS：默认视野半径。 */
const DEFAULT_VIEW_RADIUS = 10;

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
        };
        this.template = request.template;
        this.occupancy = new Uint32Array(request.template.width * request.template.height);
        this.auraByTile = new Int32Array(request.template.baseAuraByTile);
        this.tileResourceBuckets.set(DEFAULT_TILE_AURA_RESOURCE_KEY, this.auraByTile);
        this.baseTileResourceBuckets.set(DEFAULT_TILE_AURA_RESOURCE_KEY, request.template.baseAuraByTile);
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
            this.monstersByRuntimeId.set(monster.runtimeId, {
                runtimeId: monster.runtimeId,
                monsterId: monster.monsterId,
                spawnX: monster.x,
                spawnY: monster.y,
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
                aggroRange: monster.aggroRange,
                leashRange: monster.leashRange,
                attackRange: monster.attackRange,
                attackCooldownTicks: monster.attackCooldownTicks,
                attackReadyTick: 0,
            });
            if (monster.alive) {
                this.monsterRuntimeIdByTile.set(this.toTileIndex(monster.x, monster.y), monster.runtimeId);
            }
        }
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

        const visibleTileIndices = this.collectVisibleTileIndices(player.x, player.y, radius);

        const visiblePlayers = this.collectVisiblePlayers(player, radius, visibleTileIndices);

        const localMonsters = this.collectLocalMonsters(player.x, player.y, radius, visibleTileIndices);

        const localNpcs = this.collectLocalNpcs(player.x, player.y, radius, visibleTileIndices);

        const localPortals = this.collectLocalPortals(player.x, player.y, radius, visibleTileIndices);

        const localLandmarks = this.collectLocalLandmarks(player.x, player.y, radius, visibleTileIndices);

        const localSafeZones = this.collectLocalSafeZones(player.x, player.y, radius, visibleTileIndices);

        const localContainers = this.collectLocalContainers(player.x, player.y, radius, visibleTileIndices);

        const localGroundPiles = this.collectLocalGroundPiles(player.x, player.y, radius, visibleTileIndices);
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
            },
            visibleTileIndices: Array.from(visibleTileIndices),
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
        return {
            instanceId: this.meta.instanceId,
            displayName: this.meta.displayName,
            templateId: this.meta.templateId,
            templateName: this.template.name,
            kind: this.meta.kind,
            linePreset: this.meta.linePreset,
            lineIndex: this.meta.lineIndex,
            instanceOrigin: this.meta.instanceOrigin,
            defaultEntry: this.meta.defaultEntry === true,
            persistent: this.meta.persistent === true,
            supportsPvp: this.meta.supportsPvp === true,
            canDamageTile: this.meta.canDamageTile === true,
            tick: this.tick,
            worldRevision: this.worldRevision,
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

        const tileType = (0, shared_1.getTileTypeFromMapChar)(this.template.terrainRows[y]?.[x] ?? '#');

        const maxHp = resolveTileDurability(this.template, tileType);
        if (maxHp <= 0) {
            return null;
        }

        const current = this.tileDamageByTile.get(tileIndex);
        return {
            tileType,
            hp: current?.hp ?? maxHp,
            maxHp,
            modifiedAt: current?.modifiedAt ?? null,

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

        const appliedDamage = Math.min(current.hp, normalizedDamage);

        const nextHp = Math.max(0, current.hp - appliedDamage);
        this.tileDamageByTile.set(tileIndex, {
            hp: nextHp,
            maxHp: current.maxHp,

            destroyed: nextHp <= 0,
            modifiedAt: Date.now(),
        });
        this.worldRevision += 1;
        return {

            destroyed: nextHp <= 0,
            hp: nextHp,
            maxHp: current.maxHp,
            appliedDamage,
            targetType: current.tileType,
        };
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

            const x = tileIndex % this.template.width;

            const y = Math.trunc(tileIndex / this.template.width);

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

        if (this.changedTileResourceEntryCount === 0) {
            return [];
        }
        const entries = [];
        for (const [resourceKey, bucket] of this.tileResourceBuckets.entries()) {
            const dirtyCount = this.changedTileResourceEntryCountByKey.get(resourceKey) ?? 0;
            if (dirtyCount <= 0) {
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
    /** isPersistentDirty：判断实例是否还有未落盘的持久化变更。 */
    isPersistentDirty() {
        return this.persistentRevision > this.persistedRevision;
    }
    /** markAuraPersisted：标记灵气状态已完成持久化。 */
    markAuraPersisted() {
        this.persistedRevision = this.persistentRevision;
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

            const stepCost = this.getTileTraversalCost(nextX, nextY);
            if (!Number.isFinite(stepCost) || stepCost <= 0 || movePoints < stepCost) {
                break;
            }
            if (Math.abs(nextX - player.x) + Math.abs(nextY - player.y) !== 1) {
                break;
            }
            if (!this.isWalkable(nextX, nextY)) {
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
    getTileTraversalCost(x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (x < 0 || y < 0 || x >= this.template.width || y >= this.template.height) {
            return Number.POSITIVE_INFINITY;
        }

        const tileType = (0, shared_1.getTileTypeFromMapChar)(this.template.terrainRows[y]?.[x] ?? '#');
        if (!(0, shared_1.isTileTypeWalkable)(tileType)) {
            return Number.POSITIVE_INFINITY;
        }
        /** return：return。 */
        return (0, shared_1.getTileTraversalCost)(tileType);
    }
    /** collectVisiblePlayers：收集当前视野内可见玩家。 */
    collectVisiblePlayers(observer, radius, visibleTileIndices = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const minX = Math.max(0, observer.x - radius);

        const maxX = Math.min(this.template.width - 1, observer.x + radius);

        const minY = Math.max(0, observer.y - radius);

        const maxY = Math.min(this.template.height - 1, observer.y + radius);

        const visiblePlayers = [];

        const seenHandles = new Set();
        for (let y = minY; y <= maxY; y += 1) {
            for (let x = minX; x <= maxX; x += 1) {
                const handle = this.occupancy[this.toTileIndex(x, y)];
                if (handle === INVALID_OCCUPANCY || seenHandles.has(handle)) {
                    continue;
                }
                seenHandles.add(handle);

                const player = this.playersByHandle.get(handle);
                if (!player) {
                    continue;
                }
                if (player.playerId === observer.playerId) {
                    continue;
                }
                if (visibleTileIndices && !visibleTileIndices.has(this.toTileIndex(player.x, player.y))) {
                    continue;
                }
                visiblePlayers.push({
                    playerId: player.playerId,
                    name: player.name,
                    displayName: player.displayName,
                    x: player.x,
                    y: player.y,
                });
            }
        }
        return visiblePlayers;
    }
    /** collectLocalPortals：收集当前视野内可见传送点。 */
    collectLocalPortals(centerX, centerY, radius, visibleTileIndices = null) {

        const minX = Math.max(0, centerX - radius);

        const maxX = Math.min(this.template.width - 1, centerX + radius);

        const minY = Math.max(0, centerY - radius);

        const maxY = Math.min(this.template.height - 1, centerY + radius);
        return this.template.portals
            .filter((portal) => !portal.hidden
            && portal.x >= minX
            && portal.x <= maxX
            && portal.y >= minY
            && portal.y <= maxY
            && (!visibleTileIndices || visibleTileIndices.has(this.toTileIndex(portal.x, portal.y))))
            .map((portal) => ({
            x: portal.x,
            y: portal.y,
            kind: portal.kind,
            trigger: portal.trigger,
            targetMapId: portal.targetMapId,
        }));
    }
    /** collectLocalGroundPiles：收集当前视野内可见地面物品堆。 */
    collectLocalGroundPiles(centerX, centerY, radius, visibleTileIndices = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const minX = Math.max(0, centerX - radius);

        const maxX = Math.min(this.template.width - 1, centerX + radius);

        const minY = Math.max(0, centerY - radius);

        const maxY = Math.min(this.template.height - 1, centerY + radius);

        const piles = [];
        for (const pile of this.groundPilesByTile.values()) {
            if (pile.x < minX || pile.x > maxX || pile.y < minY || pile.y > maxY) {
                continue;
            }
            if (visibleTileIndices && !visibleTileIndices.has(pile.tileIndex)) {
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
    collectLocalContainers(centerX, centerY, radius, visibleTileIndices = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const minX = Math.max(0, centerX - radius);

        const maxX = Math.min(this.template.width - 1, centerX + radius);

        const minY = Math.max(0, centerY - radius);

        const maxY = Math.min(this.template.height - 1, centerY + radius);

        const containers = [];
        for (const container of this.containersById.values()) {
            if (container.x < minX || container.x > maxX || container.y < minY || container.y > maxY) {
                continue;
            }
            if (visibleTileIndices && !visibleTileIndices.has(this.toTileIndex(container.x, container.y))) {
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
    collectLocalLandmarks(centerX, centerY, radius, visibleTileIndices = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const minX = Math.max(0, centerX - radius);

        const maxX = Math.min(this.template.width - 1, centerX + radius);

        const minY = Math.max(0, centerY - radius);

        const maxY = Math.min(this.template.height - 1, centerY + radius);

        const landmarks = [];
        for (const landmark of this.landmarksById.values()) {
            if (landmark.x < minX || landmark.x > maxX || landmark.y < minY || landmark.y > maxY) {
                continue;
            }
            if (visibleTileIndices && !visibleTileIndices.has(this.toTileIndex(landmark.x, landmark.y))) {
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
    collectLocalSafeZones(centerX, centerY, radius, visibleTileIndices = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const minX = Math.max(0, centerX - radius);

        const maxX = Math.min(this.template.width - 1, centerX + radius);

        const minY = Math.max(0, centerY - radius);

        const maxY = Math.min(this.template.height - 1, centerY + radius);

        const safeZones = [];
        for (const zone of this.template.safeZones) {
            if (zone.x + zone.radius < minX || zone.x - zone.radius > maxX || zone.y + zone.radius < minY || zone.y - zone.radius > maxY) {
                continue;
            }
            if (visibleTileIndices && !this.isAnyTileVisibleInCircle(zone.x, zone.y, zone.radius, visibleTileIndices)) {
                continue;
            }
            safeZones.push(snapshotSafeZone(zone));
        }
        safeZones.sort(compareLocalSafeZones);
        return safeZones;
    }
    /** collectLocalNpcs：收集当前视野内可见 NPC。 */
    collectLocalNpcs(centerX, centerY, radius, visibleTileIndices = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const minX = Math.max(0, centerX - radius);

        const maxX = Math.min(this.template.width - 1, centerX + radius);

        const minY = Math.max(0, centerY - radius);

        const maxY = Math.min(this.template.height - 1, centerY + radius);

        const npcs = [];
        for (const npc of this.npcsById.values()) {
            if (npc.x < minX || npc.x > maxX || npc.y < minY || npc.y > maxY) {
                continue;
            }
            if (visibleTileIndices && !visibleTileIndices.has(this.toTileIndex(npc.x, npc.y))) {
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
    collectLocalMonsters(centerX, centerY, radius, visibleTileIndices = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const minX = Math.max(0, centerX - radius);

        const maxX = Math.min(this.template.width - 1, centerX + radius);

        const minY = Math.max(0, centerY - radius);

        const maxY = Math.min(this.template.height - 1, centerY + radius);

        const monsters = [];
        for (const monster of this.monstersByRuntimeId.values()) {
            if (!monster.alive) {
                continue;
            }
            if (monster.x < minX || monster.x > maxX || monster.y < minY || monster.y > maxY) {
                continue;
            }
            if (visibleTileIndices && !visibleTileIndices.has(this.toTileIndex(monster.x, monster.y))) {
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

            const target = this.resolveMonsterTarget(monster);
            if (!target) {
                if (monster.x !== monster.spawnX || monster.y !== monster.spawnY) {
                    changed = this.tryMoveMonsterToward(monster, monster.spawnX, monster.spawnY) || changed;
                }
                continue;
            }

            const distance = chebyshevDistance(monster.x, monster.y, target.x, target.y);

            const skill = chooseMonsterSkill(monster, distance, this.tick);
            if (skill) {
                monster.cooldownReadyTickBySkillId[skill.id] = this.tick + Math.max(1, Math.round(skill.cooldown));
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
    isWalkable(x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isInBounds(x, y)) {
            return false;
        }
        return this.template.walkableMask[this.toTileIndex(x, y)] === 1;
    }
    /** isTileSightBlocked：判断地块是否阻挡视线。 */
    isTileSightBlocked(x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isInBounds(x, y)) {
            return true;
        }
        return this.template.blocksSightMask[this.toTileIndex(x, y)] === 1;
    }
    /** collectVisibleTileIndices：收集视野内可见地块索引。 */
    collectVisibleTileIndices(originX, originY, radius) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const visibleTileIndices = new Set();
        if (!this.isInBounds(originX, originY)) {
            return visibleTileIndices;
        }
        visibleTileIndices.add(this.toTileIndex(originX, originY));

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
            this.castLight(originX, originY, 1, 1, 0, radius, xx, xy, yx, yy, visibleTileIndices);
        }
        return visibleTileIndices;
    }
    /** castLight：把视野光照落到地图上。 */
    castLight(originX, originY, row, startSlope, endSlope, radius, xx, xy, yx, yy, visibleTileIndices) {
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
                if (this.isInBounds(currentX, currentY) && (0, shared_1.isOffsetInRange)(deltaX, deltaY, radius)) {
                    visibleTileIndices.add(this.toTileIndex(currentX, currentY));
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
                    this.castLight(originX, originY, distance + 1, startSlope, leftSlope, radius, xx, xy, yx, yy, visibleTileIndices);
                    nextStartSlope = rightSlope;
                }
            }
            if (blocked) {
                break;
            }
        }
    }
    /** isAnyTileVisibleInCircle：判断圆形范围内是否存在可见地块。 */
    isAnyTileVisibleInCircle(centerX, centerY, radius, visibleTileIndices) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        for (let y = Math.max(0, centerY - radius); y <= Math.min(this.template.height - 1, centerY + radius); y += 1) {
            for (let x = Math.max(0, centerX - radius); x <= Math.min(this.template.width - 1, centerX + radius); x += 1) {
                if (!(0, shared_1.isOffsetInRange)(x - centerX, y - centerY, radius)) {
                    continue;
                }
                if (visibleTileIndices.has(this.toTileIndex(x, y))) {
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

        const portalIndex = this.template.portalIndexByTile[this.toTileIndex(x, y)];
        return portalIndex >= 0 ? this.template.portals[portalIndex] ?? null : null;
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
        this.persistentRevision += 1;
    }
    /** getOrCreateTileResourceBucket：读取或初始化地块资源桶。 */
    getOrCreateTileResourceBucket(resourceKey) {
        const existing = this.tileResourceBuckets.get(resourceKey);
        if (existing) {
            return existing;
        }
        const bucket = new Int32Array(this.template.width * this.template.height);
        this.tileResourceBuckets.set(resourceKey, bucket);
        return bucket;
    }
    /** getOrCreateBaseTileResourceBucket：读取或初始化模板基线资源桶。 */
    getOrCreateBaseTileResourceBucket(resourceKey) {
        const existing = this.baseTileResourceBuckets.get(resourceKey);
        if (existing) {
            return existing;
        }
        const bucket = new Int32Array(this.template.width * this.template.height);
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
        const bucket = this.getOrCreateTileResourceBucket(resourceKey);
        bucket[tileIndex] = next;
        this.applyTileResourceDirtyCounter(resourceKey, tileIndex, previous, next);
        if (resourceKey !== DEFAULT_TILE_AURA_RESOURCE_KEY && (this.changedTileResourceEntryCountByKey.get(resourceKey) ?? 0) <= 0) {
            this.tileResourceBuckets.delete(resourceKey);
        }
        this.persistentRevision += 1;
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
        return x >= 0 && y >= 0 && x < this.template.width && y < this.template.height;
    }
    /** setOccupied：设置地块占用状态。 */
    setOccupied(x, y, handle) {
        this.occupancy[this.toTileIndex(x, y)] = handle;
    }
    /** toTileIndex：把坐标转换成地块索引。 */
    toTileIndex(x, y) {
        /** return：return。 */
        return (0, map_template_repository_1.getTileIndex)(x, y, this.template.width);
    }
    /** allocateHandle：分配一个可复用句柄。 */
    allocateHandle() {
        return this.freeHandles.pop() ?? this.nextHandle++;
    }
    /** markMonsterDefeated：标记妖兽已经被击败。 */
    markMonsterDefeated(monster) {
        this.monsterRuntimeIdByTile.delete(this.toTileIndex(monster.x, monster.y));
        monster.alive = false;
        monster.hp = 0;
        monster.respawnLeft = monster.respawnTicks;
        monster.attackReadyTick = 0;
        monster.cooldownReadyTickBySkillId = {};
        monster.aggroTargetPlayerId = null;
        monster.buffs.length = 0;
        /** recalculateMonsterDerivedState：重算妖兽派生状态。 */
        recalculateMonsterDerivedState(monster);
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
        monster.buffs.length = 0;
        monster.damageContributors = {};
        /** recalculateMonsterDerivedState：重算妖兽派生状态。 */
        recalculateMonsterDerivedState(monster);
        monster.hp = monster.maxHp;
        this.monsterRuntimeIdByTile.set(this.toTileIndex(monster.x, monster.y), monster.runtimeId);
    }
    /** resolveMonsterTarget：解析妖兽的当前目标。 */
    resolveMonsterTarget(monster) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (monster.aggroTargetPlayerId) {

            const current = this.playersById.get(monster.aggroTargetPlayerId);
            if (current
                && chebyshevDistance(monster.spawnX, monster.spawnY, current.x, current.y) <= monster.leashRange
                && chebyshevDistance(monster.x, monster.y, current.x, current.y) <= monster.aggroRange) {
                return current;
            }
            monster.aggroTargetPlayerId = null;
        }

        let best = null;

        let bestDistance = Number.POSITIVE_INFINITY;
        for (const player of this.playersById.values()) {
            if (chebyshevDistance(monster.spawnX, monster.spawnY, player.x, player.y) > monster.leashRange) {
                continue;
            }

            const distance = chebyshevDistance(monster.x, monster.y, player.x, player.y);
            if (distance > monster.aggroRange || distance >= bestDistance) {
                continue;
            }
            best = player;
            bestDistance = distance;
        }
        monster.aggroTargetPlayerId = best?.playerId ?? null;
        return best;
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
            return true;
        }
        return false;
    }
}
exports.MapInstanceRuntime = MapInstanceRuntime;
export { MapInstanceRuntime };
/** resolveTileDurability：解析地形耐久配置。 */
function resolveTileDurability(template, tileType) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const profileId = template.source.terrainProfileId
        ?? LEGACY_MAP_TERRAIN_PROFILE_IDS[template.id]
        ?? template.id;

    const profile = TERRAIN_DURABILITY_PROFILES[profileId]?.[tileType] ?? DEFAULT_TERRAIN_DURABILITY_BY_TILE[tileType];
    if (!profile) {
        return 0;
    }

    const baseDurability = (0, shared_1.calculateTerrainDurability)(1, profile.multiplier);

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
/** parseGroundSourceId：解析地面物品堆来源 ID。 */
function parseGroundSourceId(sourceId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!sourceId.startsWith('g:')) {
        return null;
    }

    const tileIndex = Number(sourceId.slice(2));
    return Number.isInteger(tileIndex) && tileIndex >= 0 ? tileIndex : null;
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
        comprehension: source.comprehension,
        luck: source.luck,
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
            nextAttrs.comprehension += (buff.attrs.comprehension ?? 0) * stacks;
            nextAttrs.luck += (buff.attrs.luck ?? 0) * stacks;
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
        && left.comprehension === right.comprehension
        && left.luck === right.luck;
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
        const skillRange = resolveSkillRange(skill);
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

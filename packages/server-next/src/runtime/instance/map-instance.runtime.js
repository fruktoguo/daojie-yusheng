"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MapInstanceRuntime = void 0;
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** map_template_repository_1：定义该变量以承载业务值。 */
const map_template_repository_1 = require("../map/map-template.repository");
/** INVALID_OCCUPANCY：定义该变量以承载业务值。 */
const INVALID_OCCUPANCY = 0;
/** DEFAULT_VIEW_RADIUS：定义该变量以承载业务值。 */
const DEFAULT_VIEW_RADIUS = 10;
/** DEFAULT_TERRAIN_DURABILITY_BY_TILE：定义该变量以承载业务值。 */
const DEFAULT_TERRAIN_DURABILITY_BY_TILE = {
    [shared_1.TileType.Wall]: { grade: 'mortal', material: 'stone' },
    [shared_1.TileType.Cloud]: { grade: 'mortal', material: 'vine' },
    [shared_1.TileType.Tree]: { grade: 'mortal', material: 'wood' },
    [shared_1.TileType.Bamboo]: { grade: 'mortal', material: 'bamboo' },
    [shared_1.TileType.Cliff]: { grade: 'mortal', material: 'stone' },
    [shared_1.TileType.Stone]: { grade: 'mortal', material: 'stone' },
    [shared_1.TileType.SpiritOre]: { grade: 'mortal', material: 'stone' },
    [shared_1.TileType.BlackIronOre]: { grade: 'mortal', material: 'blackIron' },
    [shared_1.TileType.BrokenSwordHeap]: { grade: 'mortal', material: 'metal' },
    [shared_1.TileType.Door]: { grade: 'mortal', material: 'ironwood' },
    [shared_1.TileType.Window]: { grade: 'mortal', material: 'wood' },
};
/** TERRAIN_DURABILITY_PROFILES：定义该变量以承载业务值。 */
const TERRAIN_DURABILITY_PROFILES = {
    mortal_settlement: {
        [shared_1.TileType.Wall]: { grade: 'mortal', material: 'stone' },
        [shared_1.TileType.Tree]: { grade: 'mortal', material: 'wood' },
        [shared_1.TileType.Cliff]: { grade: 'mortal', material: 'stone' },
        [shared_1.TileType.Stone]: { grade: 'mortal', material: 'stone' },
        [shared_1.TileType.SpiritOre]: { grade: 'mortal', material: 'stone' },
        [shared_1.TileType.BlackIronOre]: { grade: 'mortal', material: 'blackIron' },
        [shared_1.TileType.Door]: { grade: 'mortal', material: 'ironwood' },
        [shared_1.TileType.Window]: { grade: 'mortal', material: 'wood' },
    },
    yellow_frontier: {
        [shared_1.TileType.Wall]: { grade: 'yellow', material: 'stone' },
        [shared_1.TileType.Tree]: { grade: 'mortal', material: 'wood' },
        [shared_1.TileType.Bamboo]: { grade: 'mortal', material: 'bamboo' },
        [shared_1.TileType.Cliff]: { grade: 'yellow', material: 'stone' },
        [shared_1.TileType.Stone]: { grade: 'yellow', material: 'stone' },
        [shared_1.TileType.SpiritOre]: { grade: 'yellow', material: 'stone' },
        [shared_1.TileType.BlackIronOre]: { grade: 'yellow', material: 'blackIron' },
    },
    yellow_bamboo: {
        [shared_1.TileType.Wall]: { grade: 'yellow', material: 'stone' },
        [shared_1.TileType.Tree]: { grade: 'yellow', material: 'bamboo' },
        [shared_1.TileType.Bamboo]: { grade: 'yellow', material: 'bamboo' },
        [shared_1.TileType.Cliff]: { grade: 'yellow', material: 'stone' },
        [shared_1.TileType.Stone]: { grade: 'yellow', material: 'stone' },
        [shared_1.TileType.SpiritOre]: { grade: 'yellow', material: 'stone' },
        [shared_1.TileType.BlackIronOre]: { grade: 'yellow', material: 'blackIron' },
        [shared_1.TileType.Door]: { grade: 'mortal', material: 'wood' },
    },
    mystic_black_iron: {
        [shared_1.TileType.Wall]: { grade: 'mystic', material: 'blackIron' },
        [shared_1.TileType.Cliff]: { grade: 'mystic', material: 'blackIron' },
        [shared_1.TileType.Stone]: { grade: 'mystic', material: 'blackIron' },
        [shared_1.TileType.SpiritOre]: { grade: 'mystic', material: 'blackIron' },
        [shared_1.TileType.BlackIronOre]: { grade: 'mystic', material: 'blackIron' },
        [shared_1.TileType.Door]: { grade: 'yellow', material: 'ironwood' },
    },
    mystic_rune_ruins: {
        [shared_1.TileType.Wall]: { grade: 'mystic', material: 'runeStone' },
        [shared_1.TileType.Tree]: { grade: 'yellow', material: 'spiritWood' },
        [shared_1.TileType.Bamboo]: { grade: 'yellow', material: 'spiritWood' },
        [shared_1.TileType.Cliff]: { grade: 'mystic', material: 'runeStone' },
        [shared_1.TileType.Stone]: { grade: 'mystic', material: 'runeStone' },
        [shared_1.TileType.SpiritOre]: { grade: 'mystic', material: 'runeStone' },
        [shared_1.TileType.BlackIronOre]: { grade: 'mystic', material: 'blackIron' },
        [shared_1.TileType.Door]: { grade: 'yellow', material: 'ironwood' },
    },
    earth_stone_wild: {
        [shared_1.TileType.Wall]: { grade: 'earth', material: 'stone' },
        [shared_1.TileType.Tree]: { grade: 'mystic', material: 'spiritWood' },
        [shared_1.TileType.Bamboo]: { grade: 'mystic', material: 'spiritWood' },
        [shared_1.TileType.Cliff]: { grade: 'earth', material: 'stone' },
        [shared_1.TileType.Stone]: { grade: 'earth', material: 'stone' },
        [shared_1.TileType.SpiritOre]: { grade: 'earth', material: 'stone' },
        [shared_1.TileType.BlackIronOre]: { grade: 'earth', material: 'blackIron' },
    },
    earth_sky_metal: {
        [shared_1.TileType.Wall]: { grade: 'earth', material: 'skyMetal' },
        [shared_1.TileType.Cloud]: { grade: 'mortal', material: 'vine' },
        [shared_1.TileType.Tree]: { grade: 'mystic', material: 'spiritWood' },
        [shared_1.TileType.Bamboo]: { grade: 'mystic', material: 'spiritWood' },
        [shared_1.TileType.Cliff]: { grade: 'earth', material: 'skyMetal' },
        [shared_1.TileType.Stone]: { grade: 'earth', material: 'skyMetal' },
        [shared_1.TileType.SpiritOre]: { grade: 'earth', material: 'skyMetal' },
        [shared_1.TileType.BlackIronOre]: { grade: 'earth', material: 'blackIron' },
        [shared_1.TileType.Door]: { grade: 'mystic', material: 'metal' },
    },
};
/** SPECIAL_TILE_DURABILITY_MULTIPLIERS：定义该变量以承载业务值。 */
const SPECIAL_TILE_DURABILITY_MULTIPLIERS = {
    [shared_1.TileType.SpiritOre]: 1000,
    [shared_1.TileType.BlackIronOre]: 1000,
    [shared_1.TileType.BrokenSwordHeap]: 0.02,
};
/** LEGACY_MAP_TERRAIN_PROFILE_IDS：定义该变量以承载业务值。 */
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
/** MapInstanceRuntime：定义该类及其职责。 */
class MapInstanceRuntime {
    meta;
    template;
    occupancy;
    auraByTile;
    tileDamageByTile = new Map();
    playersById = new Map();
    playersByHandle = new Map();
    npcsById = new Map();
    npcIdByTile = new Map();
    landmarksById = new Map();
    landmarkIdByTile = new Map();
    containersById = new Map();
    containerIdByTile = new Map();
    monstersByRuntimeId = new Map();
    monsterRuntimeIdByTile = new Map();
    groundPilesByTile = new Map();
    pendingCommands = new Map();
    freeHandles = [];
    nextHandle = 1;
    tick = 0;
    worldRevision = 0;
    persistentRevision = 1;
    persistedRevision = 1;
    changedAuraTileCount = 0;
/** 构造函数：执行实例初始化流程。 */
    constructor(request) {
        this.meta = {
            instanceId: request.instanceId,
            templateId: request.template.id,
            kind: request.kind,
            persistent: request.persistent,
            createdAt: request.createdAt,
            ownerPlayerId: request.ownerPlayerId,
            ownerSectId: request.ownerSectId,
            partyId: request.partyId,
        };
        this.template = request.template;
        this.occupancy = new Uint32Array(request.template.width * request.template.height);
        this.auraByTile = new Int32Array(request.template.baseAuraByTile);
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
/** playerCount：执行对应的业务逻辑。 */
    get playerCount() {
        return this.playersById.size;
    }
/** listPlayerIds：执行对应的业务逻辑。 */
    listPlayerIds() {
        return Array.from(this.playersById.keys());
    }
/** connectPlayer：执行对应的业务逻辑。 */
    connectPlayer(request) {
/** existing：定义该变量以承载业务值。 */
        const existing = this.playersById.get(request.playerId);
        if (existing) {
            existing.sessionId = request.sessionId;
            return existing;
        }
/** spawn：定义该变量以承载业务值。 */
        const spawn = this.findSpawnPoint(request.preferredX, request.preferredY);
        if (!spawn) {
            throw new Error(`No spawn point available in instance ${this.meta.instanceId}`);
        }
/** handle：定义该变量以承载业务值。 */
        const handle = this.allocateHandle();
/** player：定义该变量以承载业务值。 */
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
/** disconnectPlayer：执行对应的业务逻辑。 */
    disconnectPlayer(playerId) {
/** player：定义该变量以承载业务值。 */
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
/** relocatePlayer：执行对应的业务逻辑。 */
    relocatePlayer(playerId, preferredX, preferredY) {
/** player：定义该变量以承载业务值。 */
        const player = this.playersById.get(playerId);
        if (!player) {
            return null;
        }
/** target：定义该变量以承载业务值。 */
        const target = this.findSpawnPoint(preferredX, preferredY);
        if (!target) {
            throw new Error(`No open tile available in instance ${this.meta.instanceId}`);
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
/** getPlayerPosition：执行对应的业务逻辑。 */
    getPlayerPosition(playerId) {
/** player：定义该变量以承载业务值。 */
        const player = this.playersById.get(playerId);
        if (!player) {
            return null;
        }
        return {
            x: player.x,
            y: player.y,
        };
    }
/** enqueueMove：执行对应的业务逻辑。 */
    enqueueMove(command) {
        if (!this.playersById.has(command.playerId)) {
            return false;
        }
        this.pendingCommands.set(command.playerId, {
            kind: 'move',
            direction: command.direction,
/** continuous：定义该变量以承载业务值。 */
            continuous: command.continuous === true,
            maxSteps: Number.isFinite(command.maxSteps) ? Math.max(1, Math.trunc(command.maxSteps)) : undefined,
            path: Array.isArray(command.path)
                ? command.path
                    .filter((entry) => Number.isFinite(entry?.x) && Number.isFinite(entry?.y))
                    .map((entry) => ({ x: Math.trunc(entry.x), y: Math.trunc(entry.y) }))
                : undefined,
/** resetBudget：定义该变量以承载业务值。 */
            resetBudget: command.resetBudget === true,
        });
        return true;
    }
/** setPlayerMoveSpeed：执行对应的业务逻辑。 */
    setPlayerMoveSpeed(playerId, moveSpeed) {
/** player：定义该变量以承载业务值。 */
        const player = this.playersById.get(playerId);
        if (!player) {
            return false;
        }
/** normalized：定义该变量以承载业务值。 */
        const normalized = Number.isFinite(moveSpeed) ? Math.max(0, Math.round(moveSpeed)) : 0;
        player.moveSpeed = normalized;
        return true;
    }
/** enqueuePortalUse：执行对应的业务逻辑。 */
    enqueuePortalUse(command) {
        if (!this.playersById.has(command.playerId)) {
            return false;
        }
        this.pendingCommands.set(command.playerId, { kind: 'portal' });
        return true;
    }
/** cancelPendingCommand：执行对应的业务逻辑。 */
    cancelPendingCommand(playerId) {
        return this.pendingCommands.delete(playerId);
    }
/** tryPortalTransfer：执行对应的业务逻辑。 */
    tryPortalTransfer(playerId, reason) {
/** player：定义该变量以承载业务值。 */
        const player = this.playersById.get(playerId);
        if (!player) {
            return null;
        }
/** portal：定义该变量以承载业务值。 */
        const portal = this.getPortalAt(player.x, player.y);
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
/** tickOnce：执行对应的业务逻辑。 */
    tickOnce() {
        this.tick += 1;
/** transfers：定义该变量以承载业务值。 */
        const transfers = [];
/** monsterActions：定义该变量以承载业务值。 */
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
/** transfer：定义该变量以承载业务值。 */
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
/** buildPlayerView：执行对应的业务逻辑。 */
    buildPlayerView(playerId, radius = DEFAULT_VIEW_RADIUS) {
/** player：定义该变量以承载业务值。 */
        const player = this.playersById.get(playerId);
        if (!player) {
            return null;
        }
/** visibleTileIndices：定义该变量以承载业务值。 */
        const visibleTileIndices = this.collectVisibleTileIndices(player.x, player.y, radius);
/** visiblePlayers：定义该变量以承载业务值。 */
        const visiblePlayers = this.collectVisiblePlayers(player, radius, visibleTileIndices);
/** localMonsters：定义该变量以承载业务值。 */
        const localMonsters = this.collectLocalMonsters(player.x, player.y, radius, visibleTileIndices);
/** localNpcs：定义该变量以承载业务值。 */
        const localNpcs = this.collectLocalNpcs(player.x, player.y, radius, visibleTileIndices);
/** localPortals：定义该变量以承载业务值。 */
        const localPortals = this.collectLocalPortals(player.x, player.y, radius, visibleTileIndices);
/** localLandmarks：定义该变量以承载业务值。 */
        const localLandmarks = this.collectLocalLandmarks(player.x, player.y, radius, visibleTileIndices);
/** localSafeZones：定义该变量以承载业务值。 */
        const localSafeZones = this.collectLocalSafeZones(player.x, player.y, radius, visibleTileIndices);
/** localContainers：定义该变量以承载业务值。 */
        const localContainers = this.collectLocalContainers(player.x, player.y, radius, visibleTileIndices);
/** localGroundPiles：定义该变量以承载业务值。 */
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
/** snapshot：执行对应的业务逻辑。 */
    snapshot() {
        return {
            instanceId: this.meta.instanceId,
            templateId: this.meta.templateId,
            kind: this.meta.kind,
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
/** forEachPathingBlocker：执行对应的业务逻辑。 */
    forEachPathingBlocker(excludePlayerId, visitor) {
        for (const npc of this.npcsById.values()) {
            visitor(npc.x, npc.y);
        }
        for (const player of this.playersById.values()) {
            if (player.playerId === excludePlayerId) {
                continue;
            }
            visitor(player.x, player.y);
        }
        for (const monster of this.monstersByRuntimeId.values()) {
            if (!monster.alive) {
                continue;
            }
            visitor(monster.x, monster.y);
        }
    }
/** getTileAura：执行对应的业务逻辑。 */
    getTileAura(x, y) {
        if (!this.isInBounds(x, y)) {
            return null;
        }
        return this.auraByTile[this.toTileIndex(x, y)] ?? 0;
    }
/** getTileGroundPile：执行对应的业务逻辑。 */
    getTileGroundPile(x, y) {
        if (!this.isInBounds(x, y)) {
            return null;
        }
        return toGroundPileView(this.groundPilesByTile.get(this.toTileIndex(x, y)) ?? null);
    }
/** getTileCombatState：执行对应的业务逻辑。 */
    getTileCombatState(x, y) {
        if (!this.isInBounds(x, y)) {
            return null;
        }
/** tileIndex：定义该变量以承载业务值。 */
        const tileIndex = this.toTileIndex(x, y);
/** tileType：定义该变量以承载业务值。 */
        const tileType = (0, shared_1.getTileTypeFromMapChar)(this.template.terrainRows[y]?.[x] ?? '#');
/** maxHp：定义该变量以承载业务值。 */
        const maxHp = resolveTileDurability(this.template, tileType);
        if (maxHp <= 0) {
            return null;
        }
/** current：定义该变量以承载业务值。 */
        const current = this.tileDamageByTile.get(tileIndex);
        return {
            tileType,
            hp: current?.hp ?? maxHp,
            maxHp,
            modifiedAt: current?.modifiedAt ?? null,
/** destroyed：定义该变量以承载业务值。 */
            destroyed: current?.destroyed === true,
        };
    }
/** damageTile：执行对应的业务逻辑。 */
    damageTile(x, y, damage) {
/** current：定义该变量以承载业务值。 */
        const current = this.getTileCombatState(x, y);
        if (!current) {
            return null;
        }
/** normalizedDamage：定义该变量以承载业务值。 */
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
/** tileIndex：定义该变量以承载业务值。 */
        const tileIndex = this.toTileIndex(x, y);
/** appliedDamage：定义该变量以承载业务值。 */
        const appliedDamage = Math.min(current.hp, normalizedDamage);
/** nextHp：定义该变量以承载业务值。 */
        const nextHp = Math.max(0, current.hp - appliedDamage);
        this.tileDamageByTile.set(tileIndex, {
            hp: nextHp,
            maxHp: current.maxHp,
/** destroyed：定义该变量以承载业务值。 */
            destroyed: nextHp <= 0,
            modifiedAt: Date.now(),
        });
        this.worldRevision += 1;
        return {
/** destroyed：定义该变量以承载业务值。 */
            destroyed: nextHp <= 0,
            hp: nextHp,
            maxHp: current.maxHp,
            appliedDamage,
            targetType: current.tileType,
        };
    }
/** getGroundPileBySourceId：执行对应的业务逻辑。 */
    getGroundPileBySourceId(sourceId) {
        for (const pile of this.groundPilesByTile.values()) {
            if (pile.sourceId !== sourceId) {
                continue;
            }
            return snapshotGroundPile(pile);
        }
        return null;
    }
/** getPlayersAtTile：执行对应的业务逻辑。 */
    getPlayersAtTile(x, y) {
        if (!this.isInBounds(x, y)) {
            return [];
        }
/** result：定义该变量以承载业务值。 */
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
/** getPortalAtTile：执行对应的业务逻辑。 */
    getPortalAtTile(x, y) {
        return this.getPortalAt(x, y);
    }
/** getLandmarkAtTile：执行对应的业务逻辑。 */
    getLandmarkAtTile(x, y) {
        if (!this.isInBounds(x, y)) {
            return null;
        }
/** landmarkId：定义该变量以承载业务值。 */
        const landmarkId = this.landmarkIdByTile.get(this.toTileIndex(x, y));
        if (!landmarkId) {
            return null;
        }
/** landmark：定义该变量以承载业务值。 */
        const landmark = this.landmarksById.get(landmarkId);
        return landmark ? snapshotLandmark(landmark) : null;
    }
/** isSafeZoneTile：执行对应的业务逻辑。 */
    isSafeZoneTile(x, y) {
        if (!this.isInBounds(x, y)) {
            return false;
        }
        return this.template.safeZoneMask[this.toTileIndex(x, y)] === 1;
    }
/** getContainerAtTile：执行对应的业务逻辑。 */
    getContainerAtTile(x, y) {
        if (!this.isInBounds(x, y)) {
            return null;
        }
/** containerId：定义该变量以承载业务值。 */
        const containerId = this.containerIdByTile.get(this.toTileIndex(x, y));
        if (!containerId) {
            return null;
        }
/** container：定义该变量以承载业务值。 */
        const container = this.containersById.get(containerId);
        return container ? snapshotContainer(container) : null;
    }
/** getContainerById：执行对应的业务逻辑。 */
    getContainerById(containerId) {
/** container：定义该变量以承载业务值。 */
        const container = this.containersById.get(containerId);
        return container ? snapshotContainer(container) : null;
    }
/** getSafeZoneAtTile：执行对应的业务逻辑。 */
    getSafeZoneAtTile(x, y) {
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
/** isPointInSafeZone：执行对应的业务逻辑。 */
    isPointInSafeZone(x, y) {
        return this.getSafeZoneAtTile(x, y) !== null;
    }
/** listMonsters：执行对应的业务逻辑。 */
    listMonsters() {
        return Array.from(this.monstersByRuntimeId.values(), (monster) => snapshotMonster(monster))
            .sort((left, right) => left.runtimeId.localeCompare(right.runtimeId, 'zh-Hans-CN'));
    }
/** getMonster：执行对应的业务逻辑。 */
    getMonster(runtimeId) {
/** monster：定义该变量以承载业务值。 */
        const monster = this.monstersByRuntimeId.get(runtimeId);
        return monster ? snapshotMonster(monster) : null;
    }
/** getNpc：执行对应的业务逻辑。 */
    getNpc(npcId) {
/** npc：定义该变量以承载业务值。 */
        const npc = this.npcsById.get(npcId);
        return npc ? snapshotNpc(npc) : null;
    }
/** getMonsterDamageContributionEntries：执行对应的业务逻辑。 */
    getMonsterDamageContributionEntries(runtimeId) {
/** monster：定义该变量以承载业务值。 */
        const monster = this.monstersByRuntimeId.get(runtimeId);
        if (!monster) {
            return [];
        }
        return Object.entries(monster.damageContributors).map(([playerId, damage]) => ({
            playerId,
            damage,
        }));
    }
/** getAdjacentNpc：执行对应的业务逻辑。 */
    getAdjacentNpc(playerId, npcId) {
/** player：定义该变量以承载业务值。 */
        const player = this.playersById.get(playerId);
        if (!player) {
            return null;
        }
/** npc：定义该变量以承载业务值。 */
        const npc = this.npcsById.get(npcId);
        if (!npc || chebyshevDistance(player.x, player.y, npc.x, npc.y) > 1) {
            return null;
        }
        return snapshotNpc(npc);
    }
/** applyDamageToMonster：执行对应的业务逻辑。 */
    applyDamageToMonster(runtimeId, amount, attackerPlayerId) {
/** monster：定义该变量以承载业务值。 */
        const monster = this.monstersByRuntimeId.get(runtimeId);
        if (!monster || !monster.alive) {
            return null;
        }
        if (attackerPlayerId && this.playersById.has(attackerPlayerId)) {
            monster.aggroTargetPlayerId = attackerPlayerId;
        }
/** appliedDamage：定义该变量以承载业务值。 */
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
/** defeated：定义该变量以承载业务值。 */
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
/** applyTemporaryBuffToMonster：执行对应的业务逻辑。 */
    applyTemporaryBuffToMonster(runtimeId, buff) {
/** monster：定义该变量以承载业务值。 */
        const monster = this.monstersByRuntimeId.get(runtimeId);
        if (!monster || !monster.alive) {
            return null;
        }
/** existing：定义该变量以承载业务值。 */
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
/** defeatMonster：执行对应的业务逻辑。 */
    defeatMonster(runtimeId) {
/** monster：定义该变量以承载业务值。 */
        const monster = this.monstersByRuntimeId.get(runtimeId);
        if (!monster || !monster.alive) {
            return null;
        }
        this.markMonsterDefeated(monster);
        return snapshotMonster(monster);
    }
/** addTileAura：执行对应的业务逻辑。 */
    addTileAura(x, y, amount) {
        if (!this.isInBounds(x, y) || !Number.isFinite(amount)) {
            return null;
        }
/** normalizedAmount：定义该变量以承载业务值。 */
        const normalizedAmount = Math.trunc(amount);
        if (normalizedAmount === 0) {
            return this.getTileAura(x, y);
        }
/** tileIndex：定义该变量以承载业务值。 */
        const tileIndex = this.toTileIndex(x, y);
/** previous：定义该变量以承载业务值。 */
        const previous = this.auraByTile[tileIndex] ?? 0;
/** next：定义该变量以承载业务值。 */
        const next = Math.max(0, previous + normalizedAmount);
        if (next === previous) {
            return next;
        }
        this.auraByTile[tileIndex] = next;
        this.updateAuraDirtyState(tileIndex, previous, next);
        return next;
    }
/** hydrateAura：执行对应的业务逻辑。 */
    hydrateAura(entries) {
        this.auraByTile.set(this.template.baseAuraByTile);
        this.changedAuraTileCount = 0;
        for (const entry of entries) {
            if (!Number.isFinite(entry.tileIndex) || !Number.isFinite(entry.value)) {
                continue;
            }
/** tileIndex：定义该变量以承载业务值。 */
            const tileIndex = Math.trunc(entry.tileIndex);
            if (tileIndex < 0 || tileIndex >= this.auraByTile.length) {
                continue;
            }
/** next：定义该变量以承载业务值。 */
            const next = Math.max(0, Math.trunc(entry.value));
            this.auraByTile[tileIndex] = next;
            if (next !== this.template.baseAuraByTile[tileIndex]) {
                this.changedAuraTileCount += 1;
            }
        }
        this.persistentRevision = 1;
        this.persistedRevision = 1;
    }
/** hydrateGroundPiles：执行对应的业务逻辑。 */
    hydrateGroundPiles(entries) {
        this.groundPilesByTile.clear();
        for (const entry of entries) {
            if (!Number.isFinite(entry.tileIndex) || !Array.isArray(entry.items)) {
                continue;
            }
/** tileIndex：定义该变量以承载业务值。 */
            const tileIndex = Math.trunc(entry.tileIndex);
            if (tileIndex < 0 || tileIndex >= this.auraByTile.length) {
                continue;
            }
/** x：定义该变量以承载业务值。 */
            const x = tileIndex % this.template.width;
/** y：定义该变量以承载业务值。 */
            const y = Math.trunc(tileIndex / this.template.width);
/** items：定义该变量以承载业务值。 */
            const items = entry.items
                .map((item) => normalizePersistedGroundItem(item))
                .filter((item) => Boolean(item));
            if (items.length === 0) {
                continue;
            }
/** pile：定义该变量以承载业务值。 */
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
/** buildAuraPersistenceEntries：执行对应的业务逻辑。 */
    buildAuraPersistenceEntries() {
        if (this.changedAuraTileCount === 0) {
            return [];
        }
/** entries：定义该变量以承载业务值。 */
        const entries = [];
        for (let tileIndex = 0; tileIndex < this.auraByTile.length; tileIndex += 1) {
            const value = this.auraByTile[tileIndex] ?? 0;
            if (value !== this.template.baseAuraByTile[tileIndex]) {
                entries.push({
                    tileIndex,
                    value,
                });
            }
        }
        return entries;
    }
/** buildGroundPersistenceEntries：执行对应的业务逻辑。 */
    buildGroundPersistenceEntries() {
        if (this.groundPilesByTile.size === 0) {
            return [];
        }
/** entries：定义该变量以承载业务值。 */
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
/** isPersistentDirty：执行对应的业务逻辑。 */
    isPersistentDirty() {
        return this.persistentRevision > this.persistedRevision;
    }
/** markAuraPersisted：执行对应的业务逻辑。 */
    markAuraPersisted() {
        this.persistedRevision = this.persistentRevision;
    }
/** dropGroundItem：执行对应的业务逻辑。 */
    dropGroundItem(x, y, item) {
        if (!this.isInBounds(x, y)) {
            return null;
        }
/** normalizedCount：定义该变量以承载业务值。 */
        const normalizedCount = Math.max(1, Math.trunc(item.count));
/** itemKey：定义该变量以承载业务值。 */
        const itemKey = item.itemId;
/** tileIndex：定义该变量以承载业务值。 */
        const tileIndex = this.toTileIndex(x, y);
/** existingPile：定义该变量以承载业务值。 */
        const existingPile = this.groundPilesByTile.get(tileIndex);
/** changed：定义该变量以承载业务值。 */
        let changed = false;
        if (existingPile) {
/** existingEntry：定义该变量以承载业务值。 */
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
/** pile：定义该变量以承载业务值。 */
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
/** takeGroundItem：执行对应的业务逻辑。 */
    takeGroundItem(sourceId, itemKey, takerX, takerY) {
        if (!this.isInBounds(takerX, takerY)) {
            return null;
        }
/** tileIndex：定义该变量以承载业务值。 */
        const tileIndex = parseGroundSourceId(sourceId);
        if (tileIndex === null) {
            return null;
        }
/** pile：定义该变量以承载业务值。 */
        const pile = this.groundPilesByTile.get(tileIndex);
        if (!pile) {
            return null;
        }
        if (chebyshevDistance(takerX, takerY, pile.x, pile.y) > 1) {
            return null;
        }
/** entryIndex：定义该变量以承载业务值。 */
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
/** applyMove：执行对应的业务逻辑。 */
    applyMove(player, direction, transfers, continuous = false, maxSteps = undefined, path = undefined) {
/** offset：定义该变量以承载业务值。 */
        const offset = DIRECTION_OFFSET[direction];
        if (!offset) {
            return;
        }
/** movePoints：定义该变量以承载业务值。 */
        let movePoints = this.rechargePlayerMoveBudget(player);
/** moved：定义该变量以承载业务值。 */
        let moved = false;
/** remainingSteps：定义该变量以承载业务值。 */
        let remainingSteps = Number.isFinite(maxSteps) ? Math.max(1, Math.trunc(maxSteps)) : Number.POSITIVE_INFINITY;
/** remainingPath：定义该变量以承载业务值。 */
        const remainingPath = Array.isArray(path) && path.length > 0 ? path : null;
        if (!remainingPath && player.facing !== direction) {
            player.facing = direction;
            player.selfRevision += 1;
        }
        while (true) {
            if (remainingSteps <= 0) {
                break;
            }
/** nextX：定义该变量以承载业务值。 */
            let nextX;
/** nextY：定义该变量以承载业务值。 */
            let nextY;
/** stepDirection：定义该变量以承载业务值。 */
            let stepDirection = direction;
            if (remainingPath) {
/** nextStep：定义该变量以承载业务值。 */
                const nextStep = remainingPath[0];
                if (!nextStep) {
                    break;
                }
                nextX = nextStep.x;
                nextY = nextStep.y;
/** resolvedDirection：定义该变量以承载业务值。 */
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
/** stepCost：定义该变量以承载业务值。 */
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
/** nextOccupancy：定义该变量以承载业务值。 */
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
/** portal：定义该变量以承载业务值。 */
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
/** buildTransfer：执行对应的业务逻辑。 */
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
/** rechargePlayerMoveBudget：执行对应的业务逻辑。 */
    rechargePlayerMoveBudget(player) {
/** elapsed：定义该变量以承载业务值。 */
        const elapsed = Math.max(0, this.tick - (player.lastMoveBudgetTick ?? this.tick));
        if (elapsed > 0) {
            player.movePoints = Math.min(shared_1.MAX_STORED_MOVE_POINTS, Math.max(0, Math.round(player.movePoints + elapsed * (0, shared_1.getMovePointsPerTick)(player.moveSpeed))));
            player.lastMoveBudgetTick = this.tick;
        }
        return player.movePoints;
    }
/** getTileTraversalCost：执行对应的业务逻辑。 */
    getTileTraversalCost(x, y) {
        if (x < 0 || y < 0 || x >= this.template.width || y >= this.template.height) {
            return Number.POSITIVE_INFINITY;
        }
/** tileType：定义该变量以承载业务值。 */
        const tileType = (0, shared_1.getTileTypeFromMapChar)(this.template.terrainRows[y]?.[x] ?? '#');
        if (!(0, shared_1.isTileTypeWalkable)(tileType)) {
            return Number.POSITIVE_INFINITY;
        }
        return (0, shared_1.getTileTraversalCost)(tileType);
    }
/** collectVisiblePlayers：执行对应的业务逻辑。 */
    collectVisiblePlayers(observer, radius, visibleTileIndices = null) {
/** minX：定义该变量以承载业务值。 */
        const minX = Math.max(0, observer.x - radius);
/** maxX：定义该变量以承载业务值。 */
        const maxX = Math.min(this.template.width - 1, observer.x + radius);
/** minY：定义该变量以承载业务值。 */
        const minY = Math.max(0, observer.y - radius);
/** maxY：定义该变量以承载业务值。 */
        const maxY = Math.min(this.template.height - 1, observer.y + radius);
/** visiblePlayers：定义该变量以承载业务值。 */
        const visiblePlayers = [];
/** seenHandles：定义该变量以承载业务值。 */
        const seenHandles = new Set();
        for (let y = minY; y <= maxY; y += 1) {
            for (let x = minX; x <= maxX; x += 1) {
                const handle = this.occupancy[this.toTileIndex(x, y)];
                if (handle === INVALID_OCCUPANCY || seenHandles.has(handle)) {
                    continue;
                }
                seenHandles.add(handle);
/** player：定义该变量以承载业务值。 */
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
                    x: player.x,
                    y: player.y,
                });
            }
        }
        return visiblePlayers;
    }
/** collectLocalPortals：执行对应的业务逻辑。 */
    collectLocalPortals(centerX, centerY, radius, visibleTileIndices = null) {
/** minX：定义该变量以承载业务值。 */
        const minX = Math.max(0, centerX - radius);
/** maxX：定义该变量以承载业务值。 */
        const maxX = Math.min(this.template.width - 1, centerX + radius);
/** minY：定义该变量以承载业务值。 */
        const minY = Math.max(0, centerY - radius);
/** maxY：定义该变量以承载业务值。 */
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
            trigger: portal.trigger,
            targetMapId: portal.targetMapId,
        }));
    }
/** collectLocalGroundPiles：执行对应的业务逻辑。 */
    collectLocalGroundPiles(centerX, centerY, radius, visibleTileIndices = null) {
/** minX：定义该变量以承载业务值。 */
        const minX = Math.max(0, centerX - radius);
/** maxX：定义该变量以承载业务值。 */
        const maxX = Math.min(this.template.width - 1, centerX + radius);
/** minY：定义该变量以承载业务值。 */
        const minY = Math.max(0, centerY - radius);
/** maxY：定义该变量以承载业务值。 */
        const maxY = Math.min(this.template.height - 1, centerY + radius);
/** piles：定义该变量以承载业务值。 */
        const piles = [];
        for (const pile of this.groundPilesByTile.values()) {
            if (pile.x < minX || pile.x > maxX || pile.y < minY || pile.y > maxY) {
                continue;
            }
            if (visibleTileIndices && !visibleTileIndices.has(pile.tileIndex)) {
                continue;
            }
/** view：定义该变量以承载业务值。 */
            const view = toGroundPileView(pile);
            if (view) {
                piles.push(view);
            }
        }
        piles.sort(compareGroundPiles);
        return piles;
    }
/** collectLocalContainers：执行对应的业务逻辑。 */
    collectLocalContainers(centerX, centerY, radius, visibleTileIndices = null) {
/** minX：定义该变量以承载业务值。 */
        const minX = Math.max(0, centerX - radius);
/** maxX：定义该变量以承载业务值。 */
        const maxX = Math.min(this.template.width - 1, centerX + radius);
/** minY：定义该变量以承载业务值。 */
        const minY = Math.max(0, centerY - radius);
/** maxY：定义该变量以承载业务值。 */
        const maxY = Math.min(this.template.height - 1, centerY + radius);
/** containers：定义该变量以承载业务值。 */
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
/** collectLocalLandmarks：执行对应的业务逻辑。 */
    collectLocalLandmarks(centerX, centerY, radius, visibleTileIndices = null) {
/** minX：定义该变量以承载业务值。 */
        const minX = Math.max(0, centerX - radius);
/** maxX：定义该变量以承载业务值。 */
        const maxX = Math.min(this.template.width - 1, centerX + radius);
/** minY：定义该变量以承载业务值。 */
        const minY = Math.max(0, centerY - radius);
/** maxY：定义该变量以承载业务值。 */
        const maxY = Math.min(this.template.height - 1, centerY + radius);
/** landmarks：定义该变量以承载业务值。 */
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
/** hasContainer：定义该变量以承载业务值。 */
                hasContainer: landmark.container !== undefined,
            });
        }
        landmarks.sort(compareLocalLandmarks);
        return landmarks;
    }
/** collectLocalSafeZones：执行对应的业务逻辑。 */
    collectLocalSafeZones(centerX, centerY, radius, visibleTileIndices = null) {
/** minX：定义该变量以承载业务值。 */
        const minX = Math.max(0, centerX - radius);
/** maxX：定义该变量以承载业务值。 */
        const maxX = Math.min(this.template.width - 1, centerX + radius);
/** minY：定义该变量以承载业务值。 */
        const minY = Math.max(0, centerY - radius);
/** maxY：定义该变量以承载业务值。 */
        const maxY = Math.min(this.template.height - 1, centerY + radius);
/** safeZones：定义该变量以承载业务值。 */
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
/** collectLocalNpcs：执行对应的业务逻辑。 */
    collectLocalNpcs(centerX, centerY, radius, visibleTileIndices = null) {
/** minX：定义该变量以承载业务值。 */
        const minX = Math.max(0, centerX - radius);
/** maxX：定义该变量以承载业务值。 */
        const maxX = Math.min(this.template.width - 1, centerX + radius);
/** minY：定义该变量以承载业务值。 */
        const minY = Math.max(0, centerY - radius);
/** maxY：定义该变量以承载业务值。 */
        const maxY = Math.min(this.template.height - 1, centerY + radius);
/** npcs：定义该变量以承载业务值。 */
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
/** collectLocalMonsters：执行对应的业务逻辑。 */
    collectLocalMonsters(centerX, centerY, radius, visibleTileIndices = null) {
/** minX：定义该变量以承载业务值。 */
        const minX = Math.max(0, centerX - radius);
/** maxX：定义该变量以承载业务值。 */
        const maxX = Math.min(this.template.width - 1, centerX + radius);
/** minY：定义该变量以承载业务值。 */
        const minY = Math.max(0, centerY - radius);
/** maxY：定义该变量以承载业务值。 */
        const maxY = Math.min(this.template.height - 1, centerY + radius);
/** monsters：定义该变量以承载业务值。 */
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
/** advanceMonsters：执行对应的业务逻辑。 */
    advanceMonsters(monsterActions) {
/** changed：定义该变量以承载业务值。 */
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
/** buffChanged：定义该变量以承载业务值。 */
            const buffChanged = tickTemporaryBuffs(monster.buffs);
            if (buffChanged && recalculateMonsterDerivedState(monster)) {
                changed = true;
            }
            changed = recoverMonsterHp(monster) || changed;
/** target：定义该变量以承载业务值。 */
            const target = this.resolveMonsterTarget(monster);
            if (!target) {
                if (monster.x !== monster.spawnX || monster.y !== monster.spawnY) {
                    changed = this.tryMoveMonsterToward(monster, monster.spawnX, monster.spawnY) || changed;
                }
                continue;
            }
/** distance：定义该变量以承载业务值。 */
            const distance = chebyshevDistance(monster.x, monster.y, target.x, target.y);
/** skill：定义该变量以承载业务值。 */
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
/** damage：定义该变量以承载业务值。 */
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
/** findSpawnPoint：执行对应的业务逻辑。 */
    findSpawnPoint(preferredX, preferredY) {
/** candidates：定义该变量以承载业务值。 */
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
/** findNearestOpenTile：执行对应的业务逻辑。 */
    findNearestOpenTile(originX, originY) {
        if (this.isOpenTile(originX, originY)) {
            return { x: originX, y: originY };
        }
/** maxRadius：定义该变量以承载业务值。 */
        const maxRadius = Math.max(this.template.width, this.template.height);
        for (let radius = 1; radius <= maxRadius; radius += 1) {
            const minX = Math.max(0, originX - radius);
            const maxX = Math.min(this.template.width - 1, originX + radius);
/** minY：定义该变量以承载业务值。 */
            const minY = Math.max(0, originY - radius);
/** maxY：定义该变量以承载业务值。 */
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
/** isOpenTile：执行对应的业务逻辑。 */
    isOpenTile(x, y) {
        if (!this.isWalkable(x, y)) {
            return false;
        }
/** tileIndex：定义该变量以承载业务值。 */
        const tileIndex = this.toTileIndex(x, y);
        return this.occupancy[tileIndex] === INVALID_OCCUPANCY
            && !this.monsterRuntimeIdByTile.has(tileIndex)
            && !this.npcIdByTile.has(tileIndex);
    }
/** isWalkable：执行对应的业务逻辑。 */
    isWalkable(x, y) {
        if (!this.isInBounds(x, y)) {
            return false;
        }
        return this.template.walkableMask[this.toTileIndex(x, y)] === 1;
    }
/** isTileSightBlocked：执行对应的业务逻辑。 */
    isTileSightBlocked(x, y) {
        if (!this.isInBounds(x, y)) {
            return true;
        }
        return this.template.blocksSightMask[this.toTileIndex(x, y)] === 1;
    }
/** collectVisibleTileIndices：执行对应的业务逻辑。 */
    collectVisibleTileIndices(originX, originY, radius) {
/** visibleTileIndices：定义该变量以承载业务值。 */
        const visibleTileIndices = new Set();
        if (!this.isInBounds(originX, originY)) {
            return visibleTileIndices;
        }
        visibleTileIndices.add(this.toTileIndex(originX, originY));
/** octants：定义该变量以承载业务值。 */
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
/** castLight：执行对应的业务逻辑。 */
    castLight(originX, originY, row, startSlope, endSlope, radius, xx, xy, yx, yy, visibleTileIndices) {
        if (startSlope < endSlope) {
            return;
        }
/** nextStartSlope：定义该变量以承载业务值。 */
        let nextStartSlope = startSlope;
        for (let distance = row; distance <= radius; distance += 1) {
            let blocked = false;
            for (let deltaX = -distance, deltaY = -distance; deltaX <= 0; deltaX += 1) {
                const currentX = originX + deltaX * xx + deltaY * xy;
                const currentY = originY + deltaX * yx + deltaY * yy;
/** leftSlope：定义该变量以承载业务值。 */
                const leftSlope = (deltaX - 0.5) / (deltaY + 0.5);
/** rightSlope：定义该变量以承载业务值。 */
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
/** blocksSight：定义该变量以承载业务值。 */
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
/** isAnyTileVisibleInCircle：执行对应的业务逻辑。 */
    isAnyTileVisibleInCircle(centerX, centerY, radius, visibleTileIndices) {
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
/** getPortalAt：执行对应的业务逻辑。 */
    getPortalAt(x, y) {
        if (!this.isInBounds(x, y)) {
            return null;
        }
/** portalIndex：定义该变量以承载业务值。 */
        const portalIndex = this.template.portalIndexByTile[this.toTileIndex(x, y)];
        return portalIndex >= 0 ? this.template.portals[portalIndex] ?? null : null;
    }
/** updateAuraDirtyState：执行对应的业务逻辑。 */
    updateAuraDirtyState(tileIndex, previous, next) {
/** baseValue：定义该变量以承载业务值。 */
        const baseValue = this.template.baseAuraByTile[tileIndex] ?? 0;
/** previousDirty：定义该变量以承载业务值。 */
        const previousDirty = previous !== baseValue;
/** nextDirty：定义该变量以承载业务值。 */
        const nextDirty = next !== baseValue;
        if (!previousDirty && nextDirty) {
            this.changedAuraTileCount += 1;
        }
        else if (previousDirty && !nextDirty) {
            this.changedAuraTileCount = Math.max(0, this.changedAuraTileCount - 1);
        }
        this.persistentRevision += 1;
    }
/** isInBounds：执行对应的业务逻辑。 */
    isInBounds(x, y) {
        return x >= 0 && y >= 0 && x < this.template.width && y < this.template.height;
    }
/** setOccupied：执行对应的业务逻辑。 */
    setOccupied(x, y, handle) {
        this.occupancy[this.toTileIndex(x, y)] = handle;
    }
/** toTileIndex：执行对应的业务逻辑。 */
    toTileIndex(x, y) {
        return (0, map_template_repository_1.getTileIndex)(x, y, this.template.width);
    }
/** allocateHandle：执行对应的业务逻辑。 */
    allocateHandle() {
        return this.freeHandles.pop() ?? this.nextHandle++;
    }
/** markMonsterDefeated：执行对应的业务逻辑。 */
    markMonsterDefeated(monster) {
        this.monsterRuntimeIdByTile.delete(this.toTileIndex(monster.x, monster.y));
        monster.alive = false;
        monster.hp = 0;
        monster.respawnLeft = monster.respawnTicks;
        monster.attackReadyTick = 0;
        monster.cooldownReadyTickBySkillId = {};
        monster.aggroTargetPlayerId = null;
        monster.buffs.length = 0;
        recalculateMonsterDerivedState(monster);
        this.worldRevision += 1;
    }
/** respawnMonster：执行对应的业务逻辑。 */
    respawnMonster(monster) {
/** respawn：定义该变量以承载业务值。 */
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
        recalculateMonsterDerivedState(monster);
        monster.hp = monster.maxHp;
        this.monsterRuntimeIdByTile.set(this.toTileIndex(monster.x, monster.y), monster.runtimeId);
    }
/** resolveMonsterTarget：执行对应的业务逻辑。 */
    resolveMonsterTarget(monster) {
        if (monster.aggroTargetPlayerId) {
/** current：定义该变量以承载业务值。 */
            const current = this.playersById.get(monster.aggroTargetPlayerId);
            if (current
                && chebyshevDistance(monster.spawnX, monster.spawnY, current.x, current.y) <= monster.leashRange
                && chebyshevDistance(monster.x, monster.y, current.x, current.y) <= monster.aggroRange) {
                return current;
            }
            monster.aggroTargetPlayerId = null;
        }
/** best：定义该变量以承载业务值。 */
        let best = null;
/** bestDistance：定义该变量以承载业务值。 */
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const player of this.playersById.values()) {
            if (chebyshevDistance(monster.spawnX, monster.spawnY, player.x, player.y) > monster.leashRange) {
                continue;
            }
/** distance：定义该变量以承载业务值。 */
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
/** tryMoveMonsterToward：执行对应的业务逻辑。 */
    tryMoveMonsterToward(monster, targetX, targetY) {
/** next：定义该变量以承载业务值。 */
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
/** resolveTileDurability：执行对应的业务逻辑。 */
function resolveTileDurability(template, tileType) {
/** profileId：定义该变量以承载业务值。 */
    const profileId = template.source.terrainProfileId
        ?? LEGACY_MAP_TERRAIN_PROFILE_IDS[template.id]
        ?? template.id;
/** profile：定义该变量以承载业务值。 */
    const profile = TERRAIN_DURABILITY_PROFILES[profileId]?.[tileType] ?? DEFAULT_TERRAIN_DURABILITY_BY_TILE[tileType];
    if (!profile) {
        return 0;
    }
/** baseDurability：定义该变量以承载业务值。 */
    const baseDurability = (0, shared_1.calculateTerrainDurability)(profile.grade, profile.material);
/** multiplier：定义该变量以承载业务值。 */
    const multiplier = SPECIAL_TILE_DURABILITY_MULTIPLIERS[tileType] ?? 1;
    return Math.max(1, Math.round(baseDurability * multiplier));
}
/** clampCoordinate：执行对应的业务逻辑。 */
function clampCoordinate(value, size) {
    return Math.max(0, Math.min(size - 1, Math.trunc(value)));
}
/** DIRECTION_OFFSET：定义该变量以承载业务值。 */
const DIRECTION_OFFSET = {
    [shared_1.Direction.North]: { x: 0, y: -1 },
    [shared_1.Direction.South]: { x: 0, y: 1 },
    [shared_1.Direction.East]: { x: 1, y: 0 },
    [shared_1.Direction.West]: { x: -1, y: 0 },
};
/** buildGroundSourceId：执行对应的业务逻辑。 */
function buildGroundSourceId(tileIndex) {
    return `g:${tileIndex}`;
}
/** parseGroundSourceId：执行对应的业务逻辑。 */
function parseGroundSourceId(sourceId) {
    if (!sourceId.startsWith('g:')) {
        return null;
    }
/** tileIndex：定义该变量以承载业务值。 */
    const tileIndex = Number(sourceId.slice(2));
    return Number.isInteger(tileIndex) && tileIndex >= 0 ? tileIndex : null;
}
/** toGroundPileView：执行对应的业务逻辑。 */
function toGroundPileView(pile) {
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
/** normalizePersistedGroundItem：执行对应的业务逻辑。 */
function normalizePersistedGroundItem(item) {
    if (!item || typeof item !== 'object' || typeof item.itemId !== 'string' || !item.itemId.trim()) {
        return null;
    }
/** count：定义该变量以承载业务值。 */
    const count = Number.isFinite(item.count) ? Math.max(1, Math.trunc(item.count)) : 1;
    return {
        ...item,
        itemId: item.itemId,
        count,
    };
}
/** compareGroundPiles：执行对应的业务逻辑。 */
function compareGroundPiles(left, right) {
    return left.y - right.y || left.x - right.x || left.sourceId.localeCompare(right.sourceId, 'zh-Hans-CN');
}
/** compareGroundEntries：执行对应的业务逻辑。 */
function compareGroundEntries(left, right) {
    return left.itemKey.localeCompare(right.itemKey, 'zh-Hans-CN');
}
/** compareLocalMonsters：执行对应的业务逻辑。 */
function compareLocalMonsters(left, right) {
    return left.y - right.y || left.x - right.x || left.runtimeId.localeCompare(right.runtimeId, 'zh-Hans-CN');
}
/** compareLocalNpcs：执行对应的业务逻辑。 */
function compareLocalNpcs(left, right) {
    return left.y - right.y || left.x - right.x || left.npcId.localeCompare(right.npcId, 'zh-Hans-CN');
}
/** compareLocalContainers：执行对应的业务逻辑。 */
function compareLocalContainers(left, right) {
    return left.y - right.y || left.x - right.x || left.id.localeCompare(right.id, 'zh-Hans-CN');
}
/** compareLocalLandmarks：执行对应的业务逻辑。 */
function compareLocalLandmarks(left, right) {
    return left.y - right.y || left.x - right.x || left.id.localeCompare(right.id, 'zh-Hans-CN');
}
/** compareLocalSafeZones：执行对应的业务逻辑。 */
function compareLocalSafeZones(left, right) {
    return left.y - right.y || left.x - right.x || left.radius - right.radius;
}
/** countAliveMonsters：执行对应的业务逻辑。 */
function countAliveMonsters(monstersByRuntimeId) {
/** count：定义该变量以承载业务值。 */
    let count = 0;
    for (const monster of monstersByRuntimeId.values()) {
        if (monster.alive) {
            count += 1;
        }
    }
    return count;
}
/** snapshotNpc：执行对应的业务逻辑。 */
function snapshotNpc(source) {
    return {
        ...source,
        shopItems: source.shopItems.map((entry) => ({ ...entry })),
        quests: source.quests.map((entry) => ({ ...entry })),
    };
}
/** snapshotContainer：执行对应的业务逻辑。 */
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
/** snapshotLandmark：执行对应的业务逻辑。 */
function snapshotLandmark(source) {
    return {
        ...source,
        container: source.container ? snapshotContainer(source.container) : undefined,
    };
}
/** snapshotSafeZone：执行对应的业务逻辑。 */
function snapshotSafeZone(source) {
    return {
        x: source.x,
        y: source.y,
        radius: source.radius,
    };
}
/** snapshotGroundPile：执行对应的业务逻辑。 */
function snapshotGroundPile(source) {
    return {
        ...source,
        items: source.items.map((entry) => ({
            itemKey: entry.itemKey,
            item: { ...entry.item },
        })),
    };
}
/** snapshotMonster：执行对应的业务逻辑。 */
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
/** cloneAttributes：执行对应的业务逻辑。 */
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
/** cloneNumericStats：执行对应的业务逻辑。 */
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
/** cloneNumericRatioDivisors：执行对应的业务逻辑。 */
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
/** cloneSkill：执行对应的业务逻辑。 */
function cloneSkill(source) {
    return {
        ...source,
        targeting: source.targeting ? { ...source.targeting } : undefined,
        effects: source.effects.map((entry) => ({ ...entry })),
    };
}
/** cloneTemporaryBuff：执行对应的业务逻辑。 */
function cloneTemporaryBuff(source) {
    return {
        ...source,
        attrs: source.attrs ? { ...source.attrs } : undefined,
        stats: source.stats ? { ...source.stats } : undefined,
        qiProjection: source.qiProjection ? source.qiProjection.map((entry) => ({ ...entry })) : undefined,
    };
}
/** tickTemporaryBuffs：执行对应的业务逻辑。 */
function tickTemporaryBuffs(buffs) {
/** changed：定义该变量以承载业务值。 */
    let changed = false;
    for (const buff of buffs) {
        if (buff.remainingTicks > 0) {
            buff.remainingTicks -= 1;
            changed = true;
        }
    }
/** nextLength：定义该变量以承载业务值。 */
    const nextLength = buffs.filter((entry) => entry.remainingTicks > 0 && entry.stacks > 0).length;
    if (nextLength !== buffs.length) {
        changed = true;
    }
    if (changed) {
/** writeIndex：定义该变量以承载业务值。 */
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
/** recalculateMonsterDerivedState：执行对应的业务逻辑。 */
function recalculateMonsterDerivedState(monster) {
/** nextAttrs：定义该变量以承载业务值。 */
    const nextAttrs = cloneAttributes(monster.baseAttrs);
/** nextStats：定义该变量以承载业务值。 */
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
/** previousMaxHp：定义该变量以承载业务值。 */
    const previousMaxHp = monster.maxHp;
/** previousHp：定义该变量以承载业务值。 */
    const previousHp = monster.hp;
/** previousAttrs：定义该变量以承载业务值。 */
    const previousAttrs = monster.attrs;
/** previousStats：定义该变量以承载业务值。 */
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
/** isSameAttributes：执行对应的业务逻辑。 */
function isSameAttributes(left, right) {
    return left.constitution === right.constitution
        && left.spirit === right.spirit
        && left.perception === right.perception
        && left.talent === right.talent
        && left.comprehension === right.comprehension
        && left.luck === right.luck;
}
/** isSameNumericStats：执行对应的业务逻辑。 */
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
/** buildMonsterAttackDamage：执行对应的业务逻辑。 */
function buildMonsterAttackDamage(monster) {
/** attack：定义该变量以承载业务值。 */
    const attack = Math.max(monster.numericStats.physAtk, monster.numericStats.spellAtk);
    return Math.max(1, Math.round(attack));
}
/** recoverMonsterHp：执行对应的业务逻辑。 */
function recoverMonsterHp(monster) {
    if (!monster.alive || monster.hp >= monster.maxHp || monster.numericStats.hpRegenRate <= 0) {
        return false;
    }
/** heal：定义该变量以承载业务值。 */
    const heal = Math.max(1, Math.round(monster.maxHp * (monster.numericStats.hpRegenRate / 10000)));
/** nextHp：定义该变量以承载业务值。 */
    const nextHp = Math.min(monster.maxHp, monster.hp + heal);
    if (nextHp === monster.hp) {
        return false;
    }
    monster.hp = nextHp;
    return true;
}
/** chooseMonsterSkill：执行对应的业务逻辑。 */
function chooseMonsterSkill(monster, distance, currentTick) {
/** selected：定义该变量以承载业务值。 */
    let selected = null;
/** selectedRange：定义该变量以承载业务值。 */
    let selectedRange = 0;
    for (const skill of monster.skills) {
        const skillRange = resolveSkillRange(skill);
        if (distance > skillRange) {
            continue;
        }
/** readyTick：定义该变量以承载业务值。 */
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
/** resolveSkillRange：执行对应的业务逻辑。 */
function resolveSkillRange(skill) {
/** targetingRange：定义该变量以承载业务值。 */
    const targetingRange = skill.targeting?.range;
    if (typeof targetingRange === 'number' && Number.isFinite(targetingRange)) {
        return Math.max(1, Math.round(targetingRange));
    }
    return Math.max(1, Math.round(skill.range));
}
/** chooseMonsterStep：执行对应的业务逻辑。 */
function chooseMonsterStep(fromX, fromY, targetX, targetY) {
/** dx：定义该变量以承载业务值。 */
    const dx = Math.sign(targetX - fromX);
/** dy：定义该变量以承载业务值。 */
    const dy = Math.sign(targetY - fromY);
/** candidates：定义该变量以承载业务值。 */
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
/** chebyshevDistance：执行对应的业务逻辑。 */
function chebyshevDistance(ax, ay, bx, by) {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}
//# sourceMappingURL=map-instance.runtime.js.map

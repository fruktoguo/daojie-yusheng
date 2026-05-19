/**
 * 地图实例运行时核心。
 * 单张地图的全部运行态：地块平面、占位、妖兽 AI、战斗、建筑、
 * 资源刷新、灵气流动、AOI 广播和持久化脏域追踪。
 */
import { DEFAULT_QI_RESOURCE_DESCRIPTOR, Direction, QI_HALF_LIFE_RATE_SCALE, StructureType, TERRAIN_DESTROYED_RESTORE_TICKS, TERRAIN_REGEN_RATE_PER_TICK, TERRAIN_RESTORE_RETRY_DELAY_TICKS, TILE_AURA_HALF_LIFE_RATE_SCALE, TILE_AURA_HALF_LIFE_RATE_SCALED, TerrainType, TileType, buildEffectiveTargetingGeometry, buildQiResourceKey, calcQiCostWithOutputLimit, calculateTerrainDurability, composeTileTypeFromLayers, computeAffectedCellsFromAnchor, createNumericStats, directionFromTo, doesTileTypeBlockSight, getEffectiveMoveSpeed, getLayeredTileTraversalCost, getMaxStoredMovePoints, getMovePointsPerTick, getStructureDurabilityProfile, getTileTraversalCost, getTileTypeFromMapChar, isOffsetInRange, isTileTypeWalkable, normalizeStructureType, normalizeSurfaceType, normalizeTerrainType, parseQiResourceKey, percentModifierToMultiplier, resolveDefaultTileLayerFallback, resolveMonsterTemplateRecord, resolveTileLayerSeedFromTemplateContext, resolveTileLayerSeedFromTileType } from '@mud/shared';
import { readTrimmedEnv } from '../../config/env-alias';
import '../map/map-template.repository';
import { RuntimeTilePlane } from '../map/runtime-tile-plane';
import { BuildingTopologyIndex } from '../building/building-topology-index.service';
import { createRuntimeTilePlaneRoomCellProvider, detectRooms, isRoomTopologyTileType, isStaticRoomBoundaryTile } from '../building/room-detection.service';
import { calculateFengShuiSnapshot, inferRoomRole } from '../building/fengshui-calculator.service';
import { getDefaultBuildingRuntime } from '../building/building-default-content';
import { CombatPendingCastCancelReason, cancelPendingCombatCast, createMonsterPendingCombatCast, createMonsterSkillActionFromPendingCast, createMonsterSkillCancelActionFromPendingCast, resolvePendingCombatCastCancellation } from '../combat/pending-combat-cast.helpers';
import { createRuntimeTemporaryBuff, refreshRuntimeTemporaryBuffPrototype } from '../player/runtime-buff-instance';
import { resolveTileDamageDropMultiplier } from '../world/combat/tile-drop.helpers';

const DEFAULT_TILE_AURA_RESOURCE_KEY = buildQiResourceKey(DEFAULT_QI_RESOURCE_DESCRIPTOR);
const TILE_AURA_FLOW_RATE_SCALE = TILE_AURA_HALF_LIFE_RATE_SCALE ?? QI_HALF_LIFE_RATE_SCALE ?? 1_000_000_000;
const TILE_AURA_FLOW_RATE_SCALED = Math.max(1, Math.trunc(Number(TILE_AURA_HALF_LIFE_RATE_SCALED) || 1));
const DEFAULT_TILE_LAYER_FALLBACK_SEED = resolveDefaultTileLayerFallback();

/** INVALID_OCCUPANCY：空占位值，表示该地块当前未被占用。 */
const INVALID_OCCUPANCY = 0;

/** DEFAULT_VIEW_RADIUS：默认视野半径。 */
const DEFAULT_VIEW_RADIUS = 10;

/** MONSTER_LOST_SIGHT_CHASE_TICKS：妖兽丢失视野后只追击最后目击点的短暂记忆窗口。 */
const MONSTER_LOST_SIGHT_CHASE_TICKS = 3;
const MONSTER_RESPAWN_ACCELERATION_BASE_PERCENT = 100;
const MONSTER_RESPAWN_ACCELERATION_STEP_PERCENT = 100;
const MONSTER_RESPAWN_ACCELERATION_MAX_PERCENT = 1000;
const HUANLING_ZHENREN_MONSTER_ID = 'm_huanling_zhenren';
const HUANLING_FAXIANG_SKILL_ID = 'skill.huanling_candan_faxiang';
const HUANLING_LIEFU_WAIHUAN_SKILL_ID = 'skill.huanling_liefu_waihuan';
const HUANLING_XINGLUO_CANPAN_SKILL_ID = 'skill.huanling_xingluo_canpan';
const HUANLING_RONGHE_GUANMAI_SKILL_ID = 'skill.huanling_ronghe_guanmai';
const HUANLING_LIEQI_ZHIXIAN_SKILL_ID = 'skill.huanling_lieqi_zhixian';
const HUANLING_SUOGONG_NEIHUAN_SKILL_ID = 'skill.huanling_suogong_neihuan';
const HUANLING_DIFU_CHENYIN_SKILL_ID = 'skill.huanling_difu_chenyin';
const HUANLING_DUANHUN_DING_SKILL_ID = 'skill.huanling_duanhun_ding';
const HUANLING_CANPO_ZHANG_SKILL_ID = 'skill.huanling_canpo_zhang';
const HUANLING_FAXIANG_BUFF_ID = 'buff.huanling_candan_faxiang';
const HUANLING_RONGMAI_YIN_BUFF_ID = 'buff.huanling_rongmai_yin';
const HUANLING_CANMAI_SUOBU_BUFF_ID = 'buff.huanling_canmai_suobu';
const TERRAIN_MOLTEN_POOL_BURN_BUFF_ID = 'terrain_molten_pool_burn';

/** MAP_TIME_PERSISTENCE_DOMAIN：实例当前时间的持久化脏域。 */
const MAP_TIME_PERSISTENCE_DOMAIN = 'time';
const MAP_TIME_PERSISTENCE_CHECKPOINT_INTERVAL_TICKS = normalizePositiveInteger(readTrimmedEnv('SERVER_MAP_TIME_CHECKPOINT_INTERVAL_TICKS', 'MAP_TIME_CHECKPOINT_INTERVAL_TICKS'), 300, 30, 86_400);

/** DEFAULT_TERRAIN_DURABILITY_BY_TILE：真正 terrain 层的默认耐久配置；structure 耐久见 shared structure profile。 */
const DEFAULT_TERRAIN_DURABILITY_BY_TILE = {
    [TileType.Cloud]: {
        material: 'vine',
        multiplier: 3,
        damageDrops: [{ itemId: 'cloud_puff', count: 1, chanceBps: 200 }],
        destroyDrops: [{ itemId: 'cloud_puff', count: 1 }],
    },
    [TileType.Cliff]: { material: 'stone', multiplier: 50 },
};

/** SPECIAL_TILE_RESTORE_SPEED_MULTIPLIERS：特殊地形恢复速度倍率，越高表示复原越快。 */
const SPECIAL_TILE_RESTORE_SPEED_MULTIPLIERS = {
    [TileType.Cloud]: 100,
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
    buffRegistry = null;
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
    /** 实例级 tick 倍速（默认 1，0 表示暂停）。 */
    tickSpeed = 1;
    /** 实例是否暂停 tick 推进。 */
    paused = false;
    /**
 * worldRevision：世界Revision相关字段。
 */

    worldRevision = 0;    
    /** 玩家视野快照缓存；同一玩家在世界/自身 revision 未变时复用视野数组，降低空 tick 分配。 */
    playerViewCacheByPlayerId = new Map();
    /** 可见玩家视野条目缓存；同一玩家展示字段未变时复用条目对象。 */
    localPlayerViewCacheByPlayerId = new Map();
    /** NPC 视野条目缓存；静态 NPC 不再为每个玩家重复创建条目对象。 */
    localNpcViewCacheById = new Map();
    /** 传送点视野条目缓存；静态传送点不再为每个玩家重复创建条目对象。 */
    localPortalViewCacheById = new Map();
    /** 容器视野条目缓存；静态容器不再为每个玩家重复创建条目对象。 */
    localContainerViewCacheById = new Map();
    /** 地标视野条目缓存；静态地标不再为每个玩家重复创建条目对象。 */
    localLandmarkViewCacheById = new Map();
    /** 安全区视野条目缓存；模板安全区不再为每个玩家重复创建条目对象。 */
    localSafeZoneViewCacheByKey = new Map();
    /** 地面物品堆视野条目缓存；同一 sourceId 内容未变时复用条目对象。 */
    localGroundPileViewCacheBySourceId = new Map();
    /** 建筑视野条目缓存；未完工建筑展示字段未变时复用条目对象。 */
    localBuildingViewCacheById = new Map();
    /** 妖兽视野条目缓存；同一 runtimeId 字段未变时复用条目对象，降低 collectLocalMonsters 高频分配。 */
    localMonsterViewCacheByRuntimeId = new Map();
    /** Tile 共享投影缓存（per-instance）；按 coordKey="${x},${y}" 索引；实例 GC 时随之释放，避免 service-level 累积。 */
    tileProjectionByCoord = new Map();
    /** 地块静态同步 revision；只跟地块/结构/资源投影变化有关，不跟玩家/怪物移动混用。 */
    staticTileSyncRevision = 0;
    /** 尚未被网络层消费的实例级地块静态脏坐标。 */
    staticTileSyncDirtyTileKeys = new Set();
    /** 当前脏坐标批次开始前的地块静态同步 revision。 */
    staticTileSyncDirtyFromRevision = 0;
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
 * tileResourceFlowRemainderBuckets：地块气机自然流转的固定点余数。
 */

    tileResourceFlowRemainderBuckets = new Map();
    /**
 * tileResourceFlowIndicesByKey：当前需要自然流转的地块资源索引。
 */

    tileResourceFlowIndicesByKey = new Map();
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
    /** sectVirtualBoundaryLayerState：宗门模板外未定义边界的分层投影。 */
    sectVirtualBoundaryLayerState = {
        terrain: DEFAULT_TILE_LAYER_FALLBACK_SEED.terrain,
        surface: DEFAULT_TILE_LAYER_FALLBACK_SEED.surface,
        structure: StructureType.Stone,
        interactableKinds: [],
        interactableFlags: 0,
        legacyTileType: TileType.Stone,
        virtualBoundary: true,
    };
    /**
     * compositeSightResolver：跨地图视觉叠加查询，例如二楼窗口外投影到父地图。
     */

    compositeSightResolver = null;    
    /** runtimePortals：运行时动态传送点，例如宗门入口。 */
    runtimePortals = [];
    /** buildingCatalog：动态建筑/家具编译配置，只在低频建造链路读取。 */
    buildingCatalog = null;
    /** fengShuiRules：已编译风水规则表。 */
    fengShuiRules = [];
    /** buildingById：实例内长期建筑对象。 */
    buildingById = new Map();
    /** buildingCellsById：建筑 footprint 对应 cell 索引。 */
    buildingCellsById = new Map();
    /** buildingPreviousTileTypeById：建筑投影前地块类型，用于拆除恢复。 */
    buildingPreviousTileTypeById = new Map();
    /** buildingIdByCell：cell 上的建筑 ID 集合，低频查询用。 */
    buildingIdByCell = new Map();
    /** buildingTopologyIndex：cell 拓扑能力索引。 */
    buildingTopologyIndex = null;
    /** roomsById：当前房间派生快照。 */
    roomsById = new Map();
    /** roomIdByCell：cell -> room handle。 */
    roomIdByCell = new Int32Array(1);
    /** roomIdsByHandle：room handle -> roomId。 */
    roomIdsByHandle = [];
    /** roomCellIndicesById：roomId -> cell index 列表，用于单房间风水重算避免扫全图。 */
    roomCellIndicesById = new Map();
    /** roomAggregatesById：房间聚合快照。 */
    roomAggregatesById = new Map();
    /** fengShuiByRoomId：房间风水派生快照。 */
    fengShuiByRoomId = new Map();
    /** buildingRoomDeferredStartCells：超预算房间识别延迟队列起点。 */
    buildingRoomDeferredStartCells = [];
    /** lastBuildingRoomRebuildStats：最近一次建筑/房间/风水重算指标。 */
    lastBuildingRoomRebuildStats = {
        reason: 'init',
        fullTopologyRebuild: false,
        dirtyCellCount: 0,
        roomCount: 0,
        fengShuiCount: 0,
        deferredCount: 0,
        durationMs: 0,
        updatedAtTick: 0,
    };
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
        this.buffRegistry = request.buffRegistry ?? null;
        this.tilePlane = RuntimeTilePlane.fromTemplate(request.template);
        const initialCellCapacity = this.tilePlane.getCellCapacity();
        this.occupancy = new Uint32Array(initialCellCapacity);
        this.buildingTopologyIndex = new BuildingTopologyIndex(initialCellCapacity);
        this.roomIdByCell = new Int32Array(initialCellCapacity);
        const defaultBuildingRuntime = getDefaultBuildingRuntime();
        this.buildingCatalog = defaultBuildingRuntime.catalog;
        this.fengShuiRules = defaultBuildingRuntime.rules;
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
            this.npcsById.set(npc.npcId, npc);
            this.npcIdByTile.set(this.toTileIndex(npc.x, npc.y), npc.npcId);
        }
        for (const landmark of request.template.landmarks) {
            this.landmarksById.set(landmark.id, landmark);
            this.landmarkIdByTile.set(this.toTileIndex(landmark.x, landmark.y), landmark.id);
        }
        for (const container of request.template.containers) {
            this.containersById.set(container.id, container);
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
                qi: monster.alive ? Math.max(0, Math.round(monster.baseNumericStats?.maxQi ?? 0)) : 0,
                maxQi: Math.max(0, Math.round(monster.baseNumericStats?.maxQi ?? 0)),
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
                baseAttrs: monster.baseAttrs,
                attrs: monster.baseAttrs,
                baseNumericStats: monster.baseNumericStats,
                numericStats: monster.baseNumericStats,
                ratioDivisors: monster.ratioDivisors,
                statFormula: monster.statFormula,
                initialBuffs: Array.isArray(monster.initialBuffs) ? monster.initialBuffs : [],
                buffs: [],
                skills: monster.skills,
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
            if (state.alive) {
                applyMonsterInitialBuffs(state, this.buffRegistry);
                recalculateMonsterDerivedState(state);
            }
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
        this.rebuildBuildingRoomFengShuiState({ reason: 'instance_init_static_room_scan' });
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
            this.playerViewCacheByPlayerId.delete(request.playerId);
            return existing;
        }

        const spawn = this.findSpawnPoint(request.preferredX, request.preferredY, request.playerId);
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
            facing: Direction.South,
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
        this.playerViewCacheByPlayerId.delete(playerId);
        // P0-4 entry cache 跟随 entity lifecycle 释放：玩家从实例移除时清理 view 条目，避免单实例 cache 累积曾路过玩家。
        this.localPlayerViewCacheByPlayerId.delete(playerId);
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

        const target = this.findSpawnPoint(preferredX, preferredY, playerId);
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
        this.tilePlane = RuntimeTilePlane.fromTemplate(nextTemplate);
        this.meta.templateId = nextTemplate.id;
        const nextCellCapacity = this.tilePlane.getCellCapacity();
        this.occupancy = new Uint32Array(nextCellCapacity);
        this.auraByTile = new Int32Array(nextCellCapacity);
        this.auraByTile.set(nextTemplate.baseAuraByTile);
        this.tileResourceBuckets = new Map([[DEFAULT_TILE_AURA_RESOURCE_KEY, this.auraByTile]]);
        const baseAuraByTile = new Int32Array(nextCellCapacity);
        baseAuraByTile.set(nextTemplate.baseAuraByTile);
        this.baseTileResourceBuckets = new Map([[DEFAULT_TILE_AURA_RESOURCE_KEY, baseAuraByTile]]);
        this.tileResourceFlowRemainderBuckets = new Map();
        this.tileResourceFlowIndicesByKey = new Map();
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
    activateRuntimeTile(x, y, tileType, options: any = {}) {
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
        if (this.shouldRecalculateRoomsForTileMutation(tileIndex, this.resolveDefaultTileLayerFallbackForCell(tileIndex).legacyTileType, tileType)) {
            this.recalculateRoomsAndFengShuiAfterTopologyChange({ reason: 'runtime_tile_activated', dirtyCellCount: 1 });
            this.markPersistenceDirtyDomains(['room', 'fengshui']);
        }
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
    /** resolveDefaultTileLayerFallbackForCell：统一读取未知/缺失地块四层默认回退，后续程序化扩展只扩这个入口的上下文。 */
    resolveDefaultTileLayerFallbackForCell(tileIndexInput = -1, xInput = null, yInput = null) {
        const tileIndex = Math.trunc(Number(tileIndexInput));
        const hasCell = Number.isFinite(tileIndex) && tileIndex >= 0 && tileIndex < this.tilePlane.getCellCount();
        const x = Number.isFinite(Number(xInput))
            ? Math.trunc(Number(xInput))
            : hasCell
            ? this.tilePlane.getX(tileIndex)
            : null;
        const y = Number.isFinite(Number(yInput))
            ? Math.trunc(Number(yInput))
            : hasCell
            ? this.tilePlane.getY(tileIndex)
            : null;
        return resolveDefaultTileLayerFallback({
            mapId: this.template?.id ?? this.meta?.mapId ?? null,
            templateId: this.meta?.templateId ?? this.template?.id ?? null,
            instanceId: this.meta?.instanceId ?? null,
            x,
            y,
            routeDomain: this.meta?.routeDomain ?? null,
            mapKind: this.template?.source?.sectMap === true ? 'sect' : null,
        });
    }
    /** applyDefaultTileLayerFallback：把已激活 cell 重置为统一默认四层，不硬编码地板。 */
    applyDefaultTileLayerFallback(tileIndexInput) {
        const tileIndex = Math.trunc(Number(tileIndexInput));
        if (!Number.isFinite(tileIndex) || tileIndex < 0 || tileIndex >= this.tilePlane.getCellCount()) {
            return false;
        }
        const fallback = this.resolveDefaultTileLayerFallbackForCell(tileIndex);
        this.tilePlane.setTerrain(tileIndex, fallback.terrain);
        this.tilePlane.setSurface(tileIndex, fallback.surface);
        this.tilePlane.setStructure(tileIndex, fallback.structure);
        if (typeof this.tilePlane.setInteractableKinds === 'function') {
            this.tilePlane.setInteractableKinds(tileIndex, [...fallback.interactables]);
        }
        return true;
    }
    /** applyBuildingVisualTileType：按建筑 placement layer 写入地表或结构层，避免覆盖底层地形。 */
    applyBuildingVisualTileType(cellIndex, compiled) {
        if (!compiled?.visualTileType || cellIndex < 0 || cellIndex >= this.tilePlane.getCellCount()) {
            return false;
        }
        if (compiled.layerId === 1 && typeof this.tilePlane.setStructureTileType === 'function') {
            return this.tilePlane.setStructureTileType(cellIndex, compiled.visualTileType);
        }
        if (compiled.layerId === 2 && typeof this.tilePlane.setSurfaceTileType === 'function') {
            return this.tilePlane.setSurfaceTileType(cellIndex, compiled.visualTileType);
        }
        return this.tilePlane.setTileType(cellIndex, compiled.visualTileType);
    }
    /** captureBuildingPreviousTileState：记录建筑投影前的完整分层，拆除时不能只靠 legacy TileType 恢复。 */
    captureBuildingPreviousTileState(cellIndex) {
        const tileType = this.tilePlane.getTileType(cellIndex);
        const layerState = typeof this.tilePlane.getTileLayerState === 'function'
            ? this.tilePlane.getTileLayerState(cellIndex)
            : null;
        if (!layerState) {
            return { tileType };
        }
        if (this.tileDamageByTile.get(cellIndex)?.destroyed === true) {
            return {
                ...this.getDestroyedTileLayerStateByCellIndex(cellIndex, layerState),
                structureType: null,
            };
        }
        return {
            tileType,
            terrainType: layerState.terrain,
            surfaceType: layerState.surface ?? null,
            structureType: layerState.structure ?? null,
            interactableKinds: Array.isArray(layerState.interactableKinds) ? layerState.interactableKinds.slice() : [],
        };
    }
    /** restoreBuildingPreviousTileState：按分层快照恢复建筑占用前状态，兼容旧库里只有 previousTileType 的记录。 */
    restoreBuildingPreviousTileState(cellIndex, previousState) {
        if (cellIndex < 0 || cellIndex >= this.tilePlane.getCellCount()) {
            return false;
        }
        if (typeof previousState === 'string') {
            return this.tilePlane.setTileType(cellIndex, previousState);
        }
        const tileType = typeof previousState?.tileType === 'string' && previousState.tileType.trim()
            ? previousState.tileType.trim()
            : TileType.Floor;
        let changed = this.tilePlane.setTileType(cellIndex, tileType);
        if (typeof previousState?.terrainType === 'string' && previousState.terrainType.trim()) {
            changed = this.tilePlane.setTerrain(cellIndex, previousState.terrainType.trim()) || changed;
        }
        if (Object.prototype.hasOwnProperty.call(previousState ?? {}, 'surfaceType')) {
            changed = this.tilePlane.setSurface(cellIndex, typeof previousState.surfaceType === 'string' && previousState.surfaceType.trim() ? previousState.surfaceType.trim() : null) || changed;
        }
        if (Object.prototype.hasOwnProperty.call(previousState ?? {}, 'structureType')) {
            changed = this.tilePlane.setStructure(cellIndex, typeof previousState.structureType === 'string' && previousState.structureType.trim() ? previousState.structureType.trim() : null) || changed;
        }
        if (Array.isArray(previousState?.interactableKinds) && typeof this.tilePlane.setInteractableKinds === 'function') {
            changed = this.tilePlane.setInteractableKinds(cellIndex, previousState.interactableKinds) || changed;
        }
        return changed;
    }
    /** clearTileDamageForBuildingVisualCells：玩家建筑替换旧静态结构时，清掉同格旧地块损坏状态。 */
    clearTileDamageForBuildingVisualCells(cells) {
        let changed = false;
        for (const cellIndex of Array.isArray(cells) ? cells : []) {
            if (cellIndex < 0 || cellIndex >= this.tilePlane.getCellCount()) {
                continue;
            }
            if (this.tileDamageByTile.delete(cellIndex)) {
                this.markTileDamagePersistenceDirty(cellIndex);
                changed = true;
            }
        }
        return changed;
    }
    /** configureBuildingRuntime：挂载建筑/风水编译配置并重建派生索引。 */
    configureBuildingRuntime(catalog, fengShuiRules = []) {
        this.buildingCatalog = catalog ?? null;
        this.fengShuiRules = Array.isArray(fengShuiRules) ? fengShuiRules : [];
        this.rebuildBuildingRoomFengShuiState({ reason: 'configure' });
    }
    /** placeBuildingInstance：服务端权威放置建筑，调用方负责玩家权限和材料事务。 */
    placeBuildingInstance(input) {
        const catalog = this.buildingCatalog;
        if (!catalog?.defById) {
            return { ok: false, reason: 'building_catalog_missing' };
        }
        const defId = typeof input?.defId === 'string' ? input.defId.trim() : '';
        const compiled = catalog.defById.get(defId);
        if (!compiled) {
            return { ok: false, reason: 'building_def_not_found' };
        }
        const x = Math.trunc(Number(input?.x));
        const y = Math.trunc(Number(input?.y));
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return { ok: false, reason: 'invalid_coordinate' };
        }
        const rotation = normalizeBuildingRotation(input?.rotation);
        const footprint = compiled.footprintByRotation[rotationToIndex(rotation)] ?? compiled.footprintByRotation[0];
        const cells = [];
        for (let index = 0; index < footprint.length; index += 2) {
            const cellX = x + footprint[index];
            const cellY = y + footprint[index + 1];
            const cellIndex = this.toTileIndex(cellX, cellY);
            if (cellIndex < 0) {
                return { ok: false, reason: 'out_of_bounds', x: cellX, y: cellY };
            }
            if (this.occupancy[cellIndex] !== INVALID_OCCUPANCY && input?.ignoreOccupancy !== true) {
                return { ok: false, reason: 'occupied', x: cellX, y: cellY };
            }
            if (compiled.layerId === 1 && this.buildingTopologyIndex?.structureHandleByCell?.[cellIndex] > 0) {
                return { ok: false, reason: 'structure_overlap', x: cellX, y: cellY };
            }
            if (this.hasBuildingLayerOverlapAtCell(cellIndex, compiled.layerId)) {
                return { ok: false, reason: 'building_layer_overlap', x: cellX, y: cellY };
            }
            if (!this.isCellIndexWalkable(cellIndex)) {
                return { ok: false, reason: 'tile_not_clear', x: cellX, y: cellY };
            }
            cells.push(cellIndex);
        }
        const buildingId = normalizeBuildingId(input?.buildingId)
            || normalizeBuildingId(input?.requestId)
            || `building:${this.meta.instanceId}:${this.tick}:${this.buildingById.size + 1}`;
        if (this.buildingById.has(buildingId)) {
            return { ok: true, duplicate: true, building: this.buildingById.get(buildingId) };
        }
        const state = normalizeBuildingState(input?.state ?? 'active');
        const previousTileTypes = [];
        const usesActiveTopology = buildingUsesActiveTopology({ state });
        const wasInRoomInfluence = usesActiveTopology
            ? cells.some((cellIndex) => this.isCellInRoomInfluence(cellIndex))
            : false;
        let clearedTileDamage = false;
        if (usesActiveTopology && compiled.visualTileType) {
            for (const cellIndex of cells) {
                previousTileTypes.push([cellIndex, this.captureBuildingPreviousTileState(cellIndex)]);
            }
            clearedTileDamage = this.clearTileDamageForBuildingVisualCells(cells);
            for (const cellIndex of cells) {
                this.applyBuildingVisualTileType(cellIndex, compiled);
                this.markStaticTileSyncDirtyByIndex(cellIndex);
            }
        }
        const building = {
            id: buildingId,
            defId: compiled.id,
            defHandle: compiled.handle,
            instanceId: this.meta.instanceId,
            x,
            y,
            rotation,
            ownerPlayerId: typeof input?.ownerPlayerId === 'string' && input.ownerPlayerId.trim() ? input.ownerPlayerId.trim() : null,
            ownerSectId: typeof input?.ownerSectId === 'string' && input.ownerSectId.trim() ? input.ownerSectId.trim() : null,
            roomId: null,
            hp: Math.max(0, Math.min(Math.max(1, Math.trunc(Number(input?.maxHp ?? compiled.maxHp) || compiled.maxHp)), Math.trunc(Number(input?.hp ?? input?.maxHp ?? compiled.maxHp) || compiled.maxHp))),
            maxHp: Math.max(1, Math.trunc(Number(input?.maxHp ?? compiled.maxHp) || compiled.maxHp)),
            state,
            createdAtTick: this.tick,
            updatedAtTick: this.tick,
            revision: 1,
            buildStrength: Number.isFinite(Number(input?.buildStrength)) ? Math.max(1, Math.trunc(Number(input.buildStrength))) : undefined,
            builderSkillLevel: Number.isFinite(Number(input?.builderSkillLevel)) ? Math.max(1, Math.trunc(Number(input.builderSkillLevel))) : undefined,
            buildCompleteTick: state === 'building' && normalizeBuildingId(input?.activeBuilderPlayerId)
                ? Math.max(this.tick, Math.trunc(Number(input?.buildCompleteTick ?? (this.tick + normalizeBuildingRemainingTicks(input?.buildRemainingTicks ?? input?.buildStrength, input?.buildStrength)))))
                : undefined,
            buildRemainingTicks: state === 'building'
                ? normalizeBuildingRemainingTicks(input?.buildRemainingTicks ?? input?.buildStrength, input?.buildStrength)
                : undefined,
            activeBuilderPlayerId: state === 'building'
                ? (normalizeBuildingId(input?.activeBuilderPlayerId) || null)
                : null,
        };
        this.buildingById.set(building.id, building);
        this.buildingCellsById.set(building.id, cells);
        if (previousTileTypes.length > 0) {
            this.buildingPreviousTileTypeById.set(building.id, previousTileTypes);
        }
        let dirtyDomains = ['building'];
        if (usesActiveTopology) {
            this.applyBuildingTopologyForBuilding(building.id);
            const affectsBoundaryTopology = compiledBuildingAffectsRoomBoundaryTopology(compiled);
            const affectsRoofTopology = compiled.roofCoverage > 0;
            const shouldRecalculateRooms = affectsBoundaryTopology
                ? cells.some((cellIndex) => this.shouldRecalculateRoomsForTileMutation(cellIndex, this.tilePlane.getTileType(cellIndex), compiled.visualTileType ?? this.getEffectiveTileTypeByCellIndex(cellIndex)))
                : affectsRoofTopology && wasInRoomInfluence;
            if (shouldRecalculateRooms) {
                this.recalculateRoomsAndFengShuiAfterTopologyChange({ reason: 'place', dirtyCellCount: cells.length });
                dirtyDomains = dirtyDomains.concat(['room', 'fengshui']);
            }
            else if (compiledBuildingAffectsFengShui(compiled) || affectsRoofTopology) {
                for (const cellIndex of cells) {
                    this.recalculateFengShuiAfterRoomInfluenceChange(cellIndex, 'building_place_fengshui');
                }
                if (wasInRoomInfluence) {
                    dirtyDomains.push('fengshui');
                }
            }
            if (previousTileTypes.length > 0) {
                dirtyDomains.push('tile_cell');
            }
            if (clearedTileDamage) {
                dirtyDomains.push('tile_damage');
            }
        }
        this.worldRevision += 1;
        this.persistentRevision += 1;
        this.markPersistenceDirtyDomains(Array.from(new Set(dirtyDomains)));
        return { ok: true, building };
    }
    /** startBuildingConstruction：把半成品建筑切到持续施工状态。 */
    startBuildingConstruction(buildingIdInput, playerIdInput) {
        const buildingId = normalizeBuildingId(buildingIdInput);
        const playerId = normalizeBuildingId(playerIdInput);
        const building = buildingId ? this.buildingById.get(buildingId) : null;
        if (!building) {
            return { ok: false, reason: 'building_not_found' };
        }
        if (building.state !== 'building') {
            return { ok: false, reason: 'building_not_under_construction' };
        }
        if (building.ownerPlayerId && building.ownerPlayerId !== playerId) {
            return { ok: false, reason: 'building_owner_mismatch' };
        }
        const player = playerId ? this.playersById.get(playerId) : null;
        if (!player) {
            return { ok: false, reason: 'player_not_found' };
        }
        if (chebyshevDistance(player.x, player.y, building.x, building.y) > 1) {
            return { ok: false, reason: 'building_too_far' };
        }
        let changed = false;
        for (const entry of this.buildingById.values()) {
            if (entry?.state !== 'building' || entry.id === building.id) {
                continue;
            }
            if (entry.activeBuilderPlayerId === playerId) {
                entry.activeBuilderPlayerId = null;
                entry.buildCompleteTick = undefined;
                entry.updatedAtTick = this.tick;
                entry.revision = Math.max(1, Math.trunc(Number(entry.revision) || 1)) + 1;
                changed = true;
            }
        }
        if (building.activeBuilderPlayerId === playerId) {
            return { ok: true, building, changed };
        }
        building.activeBuilderPlayerId = playerId;
        building.buildCompleteTick = this.tick + resolveBuildingRemainingTicks(building);
        building.updatedAtTick = this.tick;
        building.revision = Math.max(1, Math.trunc(Number(building.revision) || 1)) + 1;
        changed = true;
        if (changed) {
            this.worldRevision += 1;
            this.persistentRevision += 1;
            this.markPersistenceDirtyDomains(['building']);
        }
        return { ok: true, building, changed };
    }
    /** stopBuildingConstruction：暂停指定玩家的半成品施工。 */
    stopBuildingConstruction(buildingIdInput, playerIdInput) {
        const buildingId = normalizeBuildingId(buildingIdInput);
        const playerId = normalizeBuildingId(playerIdInput);
        const building = buildingId ? this.buildingById.get(buildingId) : null;
        if (!building) {
            return { ok: false, reason: 'building_not_found' };
        }
        if (building.state !== 'building') {
            return { ok: false, reason: 'building_not_under_construction' };
        }
        if (playerId && building.activeBuilderPlayerId && building.activeBuilderPlayerId !== playerId) {
            return { ok: false, reason: 'building_owner_mismatch' };
        }
        if (!building.activeBuilderPlayerId) {
            return { ok: true, building, changed: false };
        }
        building.activeBuilderPlayerId = null;
        building.buildCompleteTick = undefined;
        building.updatedAtTick = this.tick;
        building.revision = Math.max(1, Math.trunc(Number(building.revision) || 1)) + 1;
        this.worldRevision += 1;
        this.persistentRevision += 1;
        this.markPersistenceDirtyDomains(['building']);
        return { ok: true, building, changed: true };
    }
    /** deconstructBuildingInstance：服务端权威拆除建筑，调用方负责返还和审计。 */
    deconstructBuildingInstance(buildingIdInput) {
        const buildingId = normalizeBuildingId(buildingIdInput);
        if (!buildingId || !this.buildingById.has(buildingId)) {
            return { ok: false, reason: 'building_not_found' };
        }
        const building = this.buildingById.get(buildingId);
        const compiled = building && this.buildingCatalog?.defByHandle
            ? this.buildingCatalog.defByHandle[building.defHandle] ?? this.buildingCatalog.defById?.get?.(building.defId)
            : null;
        const changedCells = (this.buildingCellsById.get(buildingId) ?? []).slice();
        const wasInRoomInfluence = changedCells.some((cellIndex) => this.isCellInRoomInfluence(cellIndex));
        const previousTileTypes = this.buildingPreviousTileTypeById.get(buildingId) ?? [];
        for (const [cellIndex, previousState] of previousTileTypes) {
            this.restoreBuildingPreviousTileState(cellIndex, previousState);
            this.markStaticTileSyncDirtyByIndex(cellIndex);
        }
        this.buildingPreviousTileTypeById.delete(buildingId);
        this.buildingById.delete(buildingId);
        // P0-4 entry cache 跟随 entity lifecycle 释放：建筑拆除/完工时清理 view 条目。
        this.localBuildingViewCacheById.delete(buildingId);
        this.buildingCellsById.delete(buildingId);
        this.rebuildBuildingTopologyCells(changedCells);
        const shouldRecalculateRooms = compiled
            ? compiledBuildingAffectsRoomBoundaryTopology(compiled) || (compiled.roofCoverage > 0 && wasInRoomInfluence)
            : changedCells.some((cellIndex) => this.shouldRecalculateRoomsForTileMutation(cellIndex));
        if (shouldRecalculateRooms) {
            this.recalculateRoomsAndFengShuiAfterTopologyChange({ reason: 'deconstruct', dirtyCellCount: changedCells.length });
        }
        else if (compiled && compiledBuildingAffectsFengShui(compiled) && wasInRoomInfluence) {
            for (const cellIndex of changedCells) {
                this.recalculateFengShuiAfterRoomInfluenceChange(cellIndex, 'building_deconstruct_fengshui');
            }
        }
        this.worldRevision += 1;
        this.persistentRevision += 1;
        this.markPersistenceDirtyDomains([
            'building',
            ...(shouldRecalculateRooms ? ['room', 'fengshui'] : []),
            ...(!shouldRecalculateRooms && compiled && compiledBuildingAffectsFengShui(compiled) && wasInRoomInfluence ? ['fengshui'] : []),
            ...(previousTileTypes.length > 0 ? ['tile_cell'] : []),
        ]);
        return { ok: true, buildingId };
    }
    /** rebuildBuildingRoomFengShuiState：重建建筑拓扑、房间和风水派生快照。 */
    rebuildBuildingRoomFengShuiState(options = {}) {
        const startedAt = Date.now();
        const capacity = Math.max(this.tilePlane?.getCellCapacity?.() ?? 1, this.occupancy?.length ?? 1);
        this.buildingTopologyIndex = new BuildingTopologyIndex(capacity);
        this.buildingIdByCell.clear();
        const catalog = this.buildingCatalog;
        if (catalog?.defByHandle) {
        for (const [buildingId, building] of this.buildingById.entries()) {
                if (!building || !buildingUsesActiveTopology(building)) {
                    continue;
                }
                const compiled = catalog.defByHandle[building.defHandle] ?? catalog.defById?.get?.(building.defId);
                const cells = this.buildingCellsById.get(buildingId) ?? [];
                if (!compiled || cells.length === 0) {
                    continue;
                }
                this.buildingTopologyIndex.applyBuildingToCells(compiled, cells);
                for (const cellIndex of cells) {
                    let ids = this.buildingIdByCell.get(cellIndex);
                    if (!ids) {
                        ids = [];
                        this.buildingIdByCell.set(cellIndex, ids);
                    }
                    ids.push(buildingId);
                }
            }
        }
        const topologyOptions: any = options;
        const result = this.recalculateRoomsAndFengShuiAfterTopologyChange({
            reason: topologyOptions?.reason ?? 'full_rebuild',
            fullTopologyRebuild: true,
            dirtyCellCount: this.buildingIdByCell.size,
            startedAt,
        });
        return { roomCount: result.roomCount, fengShuiCount: result.fengShuiCount, deferredCount: result.deferredCount };
    }
    /** applyBuildingTopologyForBuilding：只把一个建筑投影到拓扑索引，避免每次建造扫描全实例建筑。 */
    applyBuildingTopologyForBuilding(buildingId) {
        const building = this.buildingById.get(buildingId);
        const catalog = this.buildingCatalog;
        const compiled = building && catalog?.defByHandle
            ? catalog.defByHandle[building.defHandle] ?? catalog.defById?.get?.(building.defId)
            : null;
        const cells = this.buildingCellsById.get(buildingId) ?? [];
        if (!building || !compiled || cells.length === 0 || !buildingUsesActiveTopology(building)) {
            return false;
        }
        this.buildingTopologyIndex?.applyBuildingToCells(compiled, cells);
        for (const cellIndex of cells) {
            let ids = this.buildingIdByCell.get(cellIndex);
            if (!ids) {
                ids = [];
                this.buildingIdByCell.set(cellIndex, ids);
            }
            if (!ids.includes(buildingId)) {
                ids.push(buildingId);
            }
        }
        return true;
    }
    /** hasBuildingLayerOverlapAtCell：建造前检查同一建筑层是否已有未销毁建筑，包括半成品。 */
    hasBuildingLayerOverlapAtCell(cellIndexInput, layerIdInput) {
        const cellIndex = Math.trunc(Number(cellIndexInput));
        const layerId = Math.max(0, Math.trunc(Number(layerIdInput) || 0));
        const catalog = this.buildingCatalog;
        if (!Number.isFinite(cellIndex) || cellIndex < 0 || layerId <= 0 || !catalog?.defByHandle) {
            return false;
        }
        const candidateIds = new Set(this.buildingIdByCell.get(cellIndex) ?? []);
        for (const [buildingId, cells] of this.buildingCellsById.entries()) {
            if (candidateIds.has(buildingId)) {
                continue;
            }
            if (Array.isArray(cells) && cells.includes(cellIndex)) {
                candidateIds.add(buildingId);
            }
        }
        for (const buildingId of candidateIds) {
            const building = this.buildingById.get(buildingId);
            if (!building || building.state === 'destroyed') {
                continue;
            }
            const compiled = catalog.defByHandle[building.defHandle] ?? catalog.defById?.get?.(building.defId);
            if (compiled?.layerId === layerId) {
                return true;
            }
        }
        return false;
    }
    /** rebuildBuildingTopologyCells：只重建受影响 cell 的拓扑聚合。 */
    rebuildBuildingTopologyCells(cellIndices) {
        const catalog = this.buildingCatalog;
        if (!this.buildingTopologyIndex || !catalog?.defByHandle) {
            return { repairedCellCount: 0, orphanReferenceCount: 0 };
        }
        let repairedCellCount = 0;
        let orphanReferenceCount = 0;
        const uniqueCells = new Set();
        for (const rawCellIndex of cellIndices ?? []) {
            const cellIndex = Math.trunc(Number(rawCellIndex));
            if (Number.isFinite(cellIndex) && cellIndex >= 0) {
                uniqueCells.add(cellIndex);
            }
        }
        for (const cellIndex of uniqueCells) {
            this.buildingTopologyIndex.clearCell(cellIndex);
            const ids = this.buildingIdByCell.get(cellIndex) ?? [];
            const keptIds = [];
            for (const buildingId of ids) {
                const building = this.buildingById.get(buildingId);
                if (!building || building.state === 'destroyed') {
                    orphanReferenceCount += 1;
                    continue;
                }
                const compiled = catalog.defByHandle[building.defHandle] ?? catalog.defById?.get?.(building.defId);
                if (!compiled) {
                    orphanReferenceCount += 1;
                    continue;
                }
                keptIds.push(buildingId);
                this.buildingTopologyIndex.applyBuildingToCells(compiled, [cellIndex]);
            }
            if (keptIds.length > 0) {
                this.buildingIdByCell.set(cellIndex, keptIds);
            }
            else {
                this.buildingIdByCell.delete(cellIndex);
            }
            repairedCellCount += 1;
        }
        return { repairedCellCount, orphanReferenceCount };
    }
    /** recalculateRoomsAndFengShuiAfterTopologyChange：基于当前拓扑索引重算房间/风水，不重扫建筑拓扑。 */
    recalculateRoomsAndFengShuiAfterTopologyChange(options: any = {}) {
        const startedAt = Number.isFinite(Number(options?.startedAt)) ? Number(options.startedAt) : Date.now();
        const catalog = this.buildingCatalog;
        const provider = createRuntimeTilePlaneRoomCellProvider(this.tilePlane, this.buildingTopologyIndex, {
            getEffectiveTileType: (cellIndex) => this.getEffectiveTileTypeByCellIndex(cellIndex),
            isTopologySuppressed: (cellIndex) => this.tileDamageByTile.get(cellIndex)?.destroyed === true,
            countEntryTilesAsOpenings: isIndoorSubspaceTemplate(this.template),
        });
        const detection = detectRooms(provider, {
            instanceId: this.meta.instanceId,
            topologyRevision: this.persistentRevision,
            contentRevision: resolveBuildingCatalogRevision(catalog),
            updatedAtTick: this.tick,
            maxCellsPerRoom: 512,
        });
        this.buildingRoomDeferredStartCells = detection.deferredStartCells.slice();
        this.roomsById = new Map();
        this.roomIdsByHandle = [];
        this.roomIdByCell = detection.roomIdByCell as Int32Array<ArrayBuffer>;
        this.roomCellIndicesById = new Map();
        for (let index = 0; index < detection.rooms.length; index += 1) {
            const room = detection.rooms[index];
            this.roomsById.set(room.id, room);
            this.roomIdsByHandle[index + 1] = room.id;
        }
        this.rebuildRoomCellIndices();
        this.roomAggregatesById = this.buildRoomAggregates();
        this.fengShuiByRoomId = new Map();
        for (const room of this.roomsById.values()) {
            const aggregate = this.roomAggregatesById.get(room.id);
            if (!aggregate) {
                continue;
            }
            room.role = inferRoomRole(catalog, room, aggregate).role;
            const snapshot = calculateFengShuiSnapshot(room, aggregate, this.fengShuiRules, {
                instanceId: this.meta.instanceId,
                updatedAtTick: this.tick,
                revision: aggregate.aggregateRevision,
            });
            this.fengShuiByRoomId.set(room.id, snapshot);
        }
        const durationMs = Math.max(0, Date.now() - startedAt);
        this.lastBuildingRoomRebuildStats = {
            reason: typeof options?.reason === 'string' && options.reason.trim() ? options.reason.trim() : 'recalculate',
            fullTopologyRebuild: options?.fullTopologyRebuild === true,
            dirtyCellCount: Math.max(0, Math.trunc(Number(options?.dirtyCellCount) || 0)),
            roomCount: this.roomsById.size,
            fengShuiCount: this.fengShuiByRoomId.size,
            deferredCount: this.buildingRoomDeferredStartCells.length,
            durationMs,
            updatedAtTick: this.tick,
        };
        return this.lastBuildingRoomRebuildStats;
    }
    /** getEffectiveTileTypeByCellIndex：按 cell 读取当前有效地块，摧毁边界按空地处理。 */
    getEffectiveTileTypeByCellIndex(cellIndexInput) {
        const cellIndex = Math.trunc(Number(cellIndexInput));
        if (!Number.isFinite(cellIndex) || cellIndex < 0) {
            return this.resolveDefaultTileLayerFallbackForCell(cellIndex).legacyTileType;
        }
        const temporary = this.temporaryTileByTile.get(cellIndex);
        if (temporary) {
            return temporary.tileType;
        }
        const current = this.tileDamageByTile.get(cellIndex);
        if (current?.destroyed === true) {
            return this.getDestroyedTileLayerStateByCellIndex(cellIndex).tileType;
        }
        return this.tilePlane.getTileType(cellIndex);
    }
    /** getGroundTileTypeByCellIndex：结构被拆/毁后露出的地面，不用固定 Floor 兜底。 */
    getGroundTileTypeByCellIndex(cellIndexInput) {
        const cellIndex = Math.trunc(Number(cellIndexInput));
        if (!Number.isFinite(cellIndex) || cellIndex < 0 || cellIndex >= this.tilePlane.getCellCount()) {
            return this.resolveDefaultTileLayerFallbackForCell(cellIndex).legacyTileType;
        }
        const state = typeof this.tilePlane.getTileLayerState === 'function'
            ? this.tilePlane.getTileLayerState(cellIndex)
            : null;
        if (!state) {
            return this.resolveDefaultTileLayerFallbackForCell(cellIndex).legacyTileType;
        }
        return composeTileTypeFromLayers(
            state.terrain,
            state.surface,
            null,
            Array.isArray(state.interactableKinds) ? state.interactableKinds : [],
        );
    }
    /** getDestroyedTileLayerStateByCellIndex：摧毁地块必须投影为真正可通行、无遮挡的地面。 */
    getDestroyedTileLayerStateByCellIndex(cellIndexInput, layerStateInput = null) {
        const cellIndex = Math.trunc(Number(cellIndexInput));
        const state = layerStateInput
            ?? (Number.isFinite(cellIndex) && cellIndex >= 0 && cellIndex < this.tilePlane.getCellCount() && typeof this.tilePlane.getTileLayerState === 'function'
                ? this.tilePlane.getTileLayerState(cellIndex)
                : null);
        if (!state) {
            const fallback = this.resolveDefaultTileLayerFallbackForCell(cellIndex);
            return {
                tileType: fallback.legacyTileType,
                terrainType: fallback.terrain,
                surfaceType: fallback.surface,
                interactableKinds: [...fallback.interactables],
            };
        }
        const interactableKinds = Array.isArray(state.interactableKinds) ? state.interactableKinds.slice() : [];
        const groundTileType = composeTileTypeFromLayers(state.terrain, state.surface ?? null, null, interactableKinds);
        if (isTileTypeWalkable(groundTileType) && !doesTileTypeBlockSight(groundTileType)) {
            return {
                tileType: groundTileType,
                terrainType: state.terrain,
                surfaceType: state.surface ?? null,
                interactableKinds,
            };
        }
        const fallback = this.resolveDefaultTileLayerFallbackForCell(cellIndex);
        return {
            tileType: fallback.legacyTileType,
            terrainType: fallback.terrain,
            surfaceType: fallback.surface,
            interactableKinds: [...fallback.interactables],
        };
    }
    /** isRoomTopologyCell：判断地块类型或动态建筑拓扑是否可能改变房间边界/覆盖。 */
    isRoomTopologyCell(cellIndexInput, tileTypeInput = null) {
        const cellIndex = Math.trunc(Number(cellIndexInput));
        if (!Number.isFinite(cellIndex) || cellIndex < 0) {
            return false;
        }
        if (this.buildingTopologyIndex?.isRoomBoundary?.(cellIndex) === true) {
            return true;
        }
        if ((this.buildingTopologyIndex?.roofCoverageByCell?.[cellIndex] ?? 0) > 0) {
            return true;
        }
        const tileType = typeof tileTypeInput === 'string' && tileTypeInput.length > 0
            ? tileTypeInput
            : this.getEffectiveTileTypeByCellIndex(cellIndex);
        return isRoomTopologyTileType(tileType);
    }
    /** collectRoomInfluenceRoomIdsByCell：返回此 cell 所在房间或相邻边界影响到的房间。 */
    collectRoomInfluenceRoomIdsByCell(cellIndexInput) {
        const cellIndex = Math.trunc(Number(cellIndexInput));
        if (!Number.isFinite(cellIndex) || cellIndex < 0) {
            return [];
        }
        const roomIds = new Set();
        const direct = this.roomIdsByHandle[this.roomIdByCell?.[cellIndex] ?? 0];
        if (direct) {
            roomIds.add(direct);
        }
        const x = this.tilePlane.getX(cellIndex);
        const y = this.tilePlane.getY(cellIndex);
        const candidates = [
            this.toTileIndex(x + 1, y),
            this.toTileIndex(x - 1, y),
            this.toTileIndex(x, y + 1),
            this.toTileIndex(x, y - 1),
        ];
        for (const candidate of candidates) {
            if (candidate < 0) {
                continue;
            }
            const nearby = this.roomIdsByHandle[this.roomIdByCell?.[candidate] ?? 0];
            if (nearby) {
                roomIds.add(nearby);
            }
        }
        return Array.from(roomIds);
    }
    /** isCellInRoomInfluence：判断 cell 是否处于房间内部或边界影响圈。 */
    isCellInRoomInfluence(cellIndexInput) {
        return this.collectRoomInfluenceRoomIdsByCell(cellIndexInput).length > 0;
    }
    /** shouldRecalculateRoomsForTileMutation：拓扑地块或房间影响圈内变化才触发房间链路。 */
    shouldRecalculateRoomsForTileMutation(cellIndexInput, previousTileType = null, nextTileType = null) {
        const cellIndex = Math.trunc(Number(cellIndexInput));
        if (!Number.isFinite(cellIndex) || cellIndex < 0) {
            return false;
        }
        if (this.isCellInRoomInfluence(cellIndex)) {
            return true;
        }
        return this.isRoomTopologyCell(cellIndex, previousTileType) || this.isRoomTopologyCell(cellIndex, nextTileType);
    }
    /** recalculateFengShuiAfterRoomInfluenceChange：房间内物品/资源变化只重算受影响房间风水。 */
    recalculateFengShuiAfterRoomInfluenceChange(cellIndexInput, reason = 'room_influence_change') {
        const roomIds = this.collectRoomInfluenceRoomIdsByCell(cellIndexInput);
        if (roomIds.length === 0) {
            return false;
        }
        const recalculatedAggregates = this.buildRoomAggregates(roomIds);
        for (const [roomId, aggregate] of recalculatedAggregates.entries()) {
            this.roomAggregatesById.set(roomId, aggregate);
        }
        for (const roomId of roomIds) {
            const room = this.roomsById.get(roomId);
            const aggregate = this.roomAggregatesById.get(roomId);
            if (!room || !aggregate) {
                continue;
            }
            room.role = inferRoomRole(this.buildingCatalog, room, aggregate).role;
            const snapshot = calculateFengShuiSnapshot(room, aggregate, this.fengShuiRules, {
                instanceId: this.meta.instanceId,
                updatedAtTick: this.tick,
                revision: aggregate.aggregateRevision,
            });
            this.fengShuiByRoomId.set(room.id, snapshot);
        }
        this.lastBuildingRoomRebuildStats = {
            reason: typeof reason === 'string' && reason.trim() ? reason.trim() : 'room_influence_change',
            fullTopologyRebuild: false,
            dirtyCellCount: 1,
            roomCount: this.roomsById.size,
            fengShuiCount: this.fengShuiByRoomId.size,
            deferredCount: this.buildingRoomDeferredStartCells.length,
            durationMs: 0,
            updatedAtTick: this.tick,
        };
        this.markPersistenceDirtyDomains(['fengshui']);
        return true;
    }
    /** repairBuildingRoomFengShuiState：GM/运维入口，重建索引并清理孤儿派生。 */
    repairBuildingRoomFengShuiState() {
        const before = {
            buildingCellRefCount: countBuildingCellReferences(this.buildingIdByCell),
            roomCount: this.roomsById.size,
            fengShuiCount: this.fengShuiByRoomId.size,
        };
        const result = this.rebuildBuildingRoomFengShuiState({ reason: 'gm_repair' });
        const orphanFengShuiCount = Array.from(this.fengShuiByRoomId.keys()).filter((roomId) => !this.roomsById.has(roomId)).length;
        this.markPersistenceDirtyDomains(['room', 'fengshui']);
        return {
            ok: true,
            before,
            after: {
                buildingCellRefCount: countBuildingCellReferences(this.buildingIdByCell),
                roomCount: this.roomsById.size,
                fengShuiCount: this.fengShuiByRoomId.size,
                deferredCount: this.buildingRoomDeferredStartCells.length,
            },
            orphanFengShuiCount,
            result,
        };
    }
    /** getBuildingRoomFengShuiAt：GM 诊断指定 cell 的建筑、房间、风水来源。 */
    getBuildingRoomFengShuiAt(xInput, yInput) {
        const x = Math.trunc(Number(xInput));
        const y = Math.trunc(Number(yInput));
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return null;
        }
        const tileIndex = this.toTileIndex(x, y);
        if (tileIndex < 0) {
            return null;
        }
        const buildingIds = (this.buildingIdByCell.get(tileIndex) ?? []).slice();
        const roomId = this.roomIdsByHandle[this.roomIdByCell[tileIndex]] ?? null;
        return {
            x,
            y,
            tileIndex,
            buildingIds,
            buildings: buildingIds.map((buildingId) => this.buildingById.get(buildingId)).filter(Boolean),
            room: roomId ? this.roomsById.get(roomId) ?? null : null,
            fengShui: roomId ? this.fengShuiByRoomId.get(roomId) ?? null : null,
        };
    }
    /** rebuildRoomCellIndices：重建 roomId -> cell 列表索引，供单房间风水重算复用。 */
    rebuildRoomCellIndices() {
        this.roomCellIndicesById = new Map();
        for (let cellIndex = 0; cellIndex < this.roomIdByCell.length; cellIndex += 1) {
            const roomId = this.roomIdsByHandle[this.roomIdByCell[cellIndex]];
            if (!roomId) {
                continue;
            }
            let cells = this.roomCellIndicesById.get(roomId);
            if (!cells) {
                cells = [];
                this.roomCellIndicesById.set(roomId, cells);
            }
            cells.push(cellIndex);
        }
        return this.roomCellIndicesById;
    }
    /** buildRoomAggregates：按当前房间 cell 索引聚合风水计算输入。 */
    buildRoomAggregates(roomIdsInput = null) {
        const selectedRoomIds = Array.isArray(roomIdsInput)
            ? new Set(roomIdsInput.filter((roomId) => typeof roomId === 'string' && roomId.length > 0))
            : null;
        const aggregates = new Map();
        for (const room of this.roomsById.values()) {
            if (selectedRoomIds && !selectedRoomIds.has(room.id)) {
                continue;
            }
            aggregates.set(room.id, createRoomAggregate(room));
        }
        if (!(this.roomCellIndicesById instanceof Map) || this.roomCellIndicesById.size === 0) {
            this.rebuildRoomCellIndices();
        }
        for (const [roomId, cells] of this.roomCellIndicesById.entries()) {
            const aggregate = aggregates.get(roomId);
            if (!aggregate) {
                continue;
            }
            for (const cellIndex of cells) {
                aggregate.qiRaw += this.auraByTile?.[cellIndex] ?? 0;
            }
        }
        for (const [tileIndex, damage] of this.tileDamageByTile.entries()) {
            if (!damage || damage.destroyed === true) {
                continue;
            }
            const maxHp = Math.max(1, Math.trunc(Number(damage.maxHp) || 1));
            const hp = Math.max(0, Math.min(maxHp, Math.trunc(Number(damage.hp) || maxHp)));
            if (hp >= maxHp) {
                continue;
            }
            const damageRatio = 1 - hp / maxHp;
            const roomIds = this.collectRoomInfluenceRoomIdsByCell(tileIndex);
            for (const roomId of roomIds) {
                const aggregate = aggregates.get(roomId);
                if (!aggregate) {
                    continue;
                }
                aggregate.integrityPenalty += Math.max(1, Math.round(30 * damageRatio));
                aggregate.aggregateRevision += 1;
            }
        }
        const catalog = this.buildingCatalog;
        if (!catalog?.defByHandle) {
            return aggregates;
        }
        const buildingEntries = selectedRoomIds
            ? this.collectBuildingEntriesForRoomAggregate(selectedRoomIds)
            : Array.from(this.buildingById.entries());
        for (const [buildingId, building] of buildingEntries) {
            const compiled = catalog.defByHandle[building.defHandle] ?? catalog.defById?.get?.(building.defId);
            if (!compiled) {
                continue;
            }
            const roomId = this.resolveBuildingRoomId(buildingId);
            if (!roomId) {
                continue;
            }
            const aggregate = aggregates.get(roomId);
            if (!aggregate) {
                continue;
            }
            applyCompiledBuildingToRoomAggregate(aggregate, compiled, catalog);
            building.roomId = roomId;
        }
        return aggregates;
    }
    /** collectBuildingEntriesForRoomAggregate：局部风水重算只扫描目标房间及边界邻格上的建筑。 */
    collectBuildingEntriesForRoomAggregate(roomIds) {
        const selectedRoomIds = roomIds instanceof Set
            ? roomIds
            : new Set(Array.isArray(roomIds) ? roomIds : []);
        const buildingIds = new Set();
        const visitedCells = new Set();
        for (const roomId of selectedRoomIds) {
            const cells = this.roomCellIndicesById.get(roomId) ?? [];
            for (const cellIndex of cells) {
                this.collectBuildingIdsAtCellForAggregate(cellIndex, buildingIds, visitedCells);
                const x = this.tilePlane.getX(cellIndex);
                const y = this.tilePlane.getY(cellIndex);
                this.collectBuildingIdsAtCellForAggregate(this.toTileIndex(x + 1, y), buildingIds, visitedCells);
                this.collectBuildingIdsAtCellForAggregate(this.toTileIndex(x - 1, y), buildingIds, visitedCells);
                this.collectBuildingIdsAtCellForAggregate(this.toTileIndex(x, y + 1), buildingIds, visitedCells);
                this.collectBuildingIdsAtCellForAggregate(this.toTileIndex(x, y - 1), buildingIds, visitedCells);
            }
        }
        const entries = [];
        for (const buildingId of buildingIds) {
            const building = this.buildingById.get(buildingId);
            if (building) {
                entries.push([buildingId, building]);
            }
        }
        return entries;
    }
    /** collectBuildingIdsAtCellForAggregate：按 cell 收集建筑 ID，避免重复读取同一 cell。 */
    collectBuildingIdsAtCellForAggregate(cellIndexInput, buildingIds, visitedCells) {
        const cellIndex = Math.trunc(Number(cellIndexInput));
        if (!Number.isFinite(cellIndex) || cellIndex < 0 || visitedCells.has(cellIndex)) {
            return;
        }
        visitedCells.add(cellIndex);
        const ids = this.buildingIdByCell.get(cellIndex);
        if (!Array.isArray(ids)) {
            return;
        }
        for (const buildingId of ids) {
            buildingIds.add(buildingId);
        }
    }
    /** resolveBuildingRoomId：将建筑关联到所在或相邻房间。 */
    resolveBuildingRoomId(buildingId) {
        const cells = this.buildingCellsById.get(buildingId) ?? [];
        for (const cellIndex of cells) {
            const direct = this.roomIdsByHandle[this.roomIdByCell[cellIndex]];
            if (direct) {
                return direct;
            }
        }
        for (const cellIndex of cells) {
            const x = this.tilePlane.getX(cellIndex);
            const y = this.tilePlane.getY(cellIndex);
            const candidates = [
                this.toTileIndex(x + 1, y),
                this.toTileIndex(x - 1, y),
                this.toTileIndex(x, y + 1),
                this.toTileIndex(x, y - 1),
            ];
            for (const candidate of candidates) {
                const nearby = candidate >= 0 ? this.roomIdsByHandle[this.roomIdByCell[candidate]] : null;
                if (nearby) {
                    return nearby;
                }
            }
        }
        return null;
    }
    listBuildingSummaries() {
        return Array.from(this.buildingById.values());
    }
    listRoomSummaries() {
        return Array.from(this.roomsById.values());
    }
    getFengShuiSnapshot(roomId) {
        const normalized = typeof roomId === 'string' ? roomId.trim() : '';
        return normalized ? this.fengShuiByRoomId.get(normalized) ?? null : null;
    }
    setRoomRole(roomIdInput, roleInput) {
        const roomId = typeof roomIdInput === 'string' ? roomIdInput.trim() : '';
        const room = roomId ? this.roomsById.get(roomId) : null;
        const role = typeof roleInput === 'string' && roleInput.trim() ? roleInput.trim() : '';
        if (!room || !role) {
            return { ok: false, reason: 'room_not_found' };
        }
        room.role = role;
        const aggregate = this.roomAggregatesById.get(room.id);
        if (aggregate) {
            const snapshot = calculateFengShuiSnapshot(room, aggregate, this.fengShuiRules, {
                instanceId: this.meta.instanceId,
                updatedAtTick: this.tick,
                revision: aggregate.aggregateRevision + 1,
            });
            this.fengShuiByRoomId.set(room.id, snapshot);
        }
        this.worldRevision += 1;
        this.persistentRevision += 1;
        this.markPersistenceDirtyDomains(['room', 'fengshui']);
        return { ok: true, room: { ...room }, fengShui: this.fengShuiByRoomId.get(room.id) ?? null };
    }
    getFengShuiSnapshotAt(x, y) {
        const tileIndex = this.toTileIndex(x, y);
        if (tileIndex < 0) {
            return null;
        }
        const roomId = this.roomIdsByHandle[this.roomIdByCell[tileIndex]];
        return roomId && this.roomsById.has(roomId) ? this.fengShuiByRoomId.get(roomId) ?? null : null;
    }
    /** getFengShuiLuckAt：把当前格所在房间风水折算成临时幸运修正。 */
    getFengShuiLuckAt(x, y) {
        const snapshot = this.getFengShuiSnapshotAt(x, y);
        return snapshot ? Math.trunc((Number(snapshot.score) || 0) / 10) : 0;
    }
    buildBuildingPersistenceEntries() {
        return Array.from(this.buildingById.values()).map((building) => ({
            ...building,
            cells: this.buildBuildingCellPersistenceEntries(building.id),
        }));
    }
    buildBuildingCellPersistenceEntries(buildingId) {
        const previousTileTypeByCell = new Map(this.buildingPreviousTileTypeById.get(buildingId) ?? []);
        return (this.buildingCellsById.get(buildingId) ?? []).map((cellIndex) => ({
            tileIndex: cellIndex,
            x: this.tilePlane.getX(cellIndex),
            y: this.tilePlane.getY(cellIndex),
            tileType: this.tilePlane.getTileType(cellIndex),
            previousTileType: resolvePreviousBuildingTileType(previousTileTypeByCell.get(cellIndex)),
            previousTerrainType: resolvePreviousBuildingLayerValue(previousTileTypeByCell.get(cellIndex), 'terrainType'),
            previousSurfaceType: resolvePreviousBuildingNullableLayerValue(previousTileTypeByCell.get(cellIndex), 'surfaceType'),
            previousStructureType: resolvePreviousBuildingNullableLayerValue(previousTileTypeByCell.get(cellIndex), 'structureType'),
            previousInteractableKinds: resolvePreviousBuildingInteractableKinds(previousTileTypeByCell.get(cellIndex)),
        }));
    }
    buildBuildingRoomFengShuiPersistenceState() {
        return {
            buildings: this.buildBuildingPersistenceEntries(),
            rooms: this.listRoomSummaries(),
            roomCells: this.buildRoomCellPersistenceEntries(),
            fengShui: Array.from(this.fengShuiByRoomId.values()).map((snapshot) => ({ ...snapshot })),
        };
    }
    buildRoomCellPersistenceEntries() {
        const rows = [];
        for (let cellIndex = 0; cellIndex < this.roomIdByCell.length; cellIndex += 1) {
            const roomId = this.roomIdsByHandle[this.roomIdByCell[cellIndex]];
            if (!roomId) continue;
            rows.push({
                roomId,
                tileIndex: cellIndex,
                x: this.tilePlane.getX(cellIndex),
                y: this.tilePlane.getY(cellIndex),
                edgeFlags: this.buildingTopologyIndex?.isRoomBoundary?.(cellIndex) ? 1 : 0,
            });
        }
        return rows;
    }
    hydrateBuildingRoomFengShuiState(state) {
        const buildings = Array.isArray(state?.buildings) ? state.buildings : [];
        this.buildingById = new Map();
        this.buildingCellsById = new Map();
        this.buildingPreviousTileTypeById = new Map();
        for (const entry of buildings) {
            const id = normalizeBuildingId(entry?.id ?? entry?.buildingId);
            const defId = normalizeBuildingId(entry?.defId);
            if (!id || !defId) {
                continue;
            }
            const compiled = this.buildingCatalog?.defById?.get?.(defId);
            const defHandle = Math.max(0, Math.trunc(Number(entry?.defHandle) || compiled?.handle || 0));
            const building = {
                id,
                defId,
                defHandle,
                instanceId: this.meta.instanceId,
                x: Math.trunc(Number(entry?.x) || 0),
                y: Math.trunc(Number(entry?.y) || 0),
                rotation: normalizeBuildingRotation(entry?.rotation),
                ownerPlayerId: typeof entry?.ownerPlayerId === 'string' && entry.ownerPlayerId.trim() ? entry.ownerPlayerId.trim() : null,
                ownerSectId: typeof entry?.ownerSectId === 'string' && entry.ownerSectId.trim() ? entry.ownerSectId.trim() : null,
                roomId: typeof entry?.roomId === 'string' && entry.roomId.trim() ? entry.roomId.trim() : null,
                hp: Math.max(0, Math.trunc(Number(entry?.hp) || 0)),
                maxHp: Math.max(1, Math.trunc(Number(entry?.maxHp) || compiled?.maxHp || 1)),
                state: normalizeBuildingState(entry?.state),
                createdAtTick: Math.max(0, Math.trunc(Number(entry?.createdAtTick) || 0)),
                updatedAtTick: Math.max(0, Math.trunc(Number(entry?.updatedAtTick) || 0)),
                revision: Math.max(1, Math.trunc(Number(entry?.revision) || 1)),
                buildStrength: Number.isFinite(Number(entry?.buildStrength)) ? Math.max(1, Math.trunc(Number(entry.buildStrength))) : undefined,
                builderSkillLevel: Number.isFinite(Number(entry?.builderSkillLevel)) ? Math.max(1, Math.trunc(Number(entry.builderSkillLevel))) : undefined,
                buildCompleteTick: Number.isFinite(Number(entry?.buildCompleteTick)) ? Math.max(0, Math.trunc(Number(entry.buildCompleteTick))) : undefined,
                buildRemainingTicks: Number.isFinite(Number(entry?.buildRemainingTicks)) ? Math.max(0, Math.trunc(Number(entry.buildRemainingTicks))) : undefined,
                activeBuilderPlayerId: normalizeBuildingId(entry?.activeBuilderPlayerId) || null,
            };
            this.buildingById.set(id, building);
            const cells = resolvePersistedBuildingCells(this, building, entry?.cells, compiled);
            this.buildingCellsById.set(id, cells);
            const previousTileTypes = resolvePersistedBuildingPreviousTileTypes(this, entry?.cells);
            if (previousTileTypes.length > 0) {
                this.buildingPreviousTileTypeById.set(id, previousTileTypes);
            }
            if (compiled?.visualTileType && buildingUsesActiveTopology(building)) {
                for (const cellIndex of cells) {
                    if (cellIndex >= 0 && cellIndex < this.tilePlane.getCellCount()) {
                        this.applyBuildingVisualTileType(cellIndex, compiled);
                    }
                }
            }
        }
        if (this.buildingCatalog?.defByHandle) {
            this.rebuildBuildingRoomFengShuiState();
            return { buildingCount: this.buildingById.size, rebuilt: true };
        }
        this.roomsById = new Map();
        this.roomIdsByHandle = [];
        this.roomCellIndicesById = new Map();
        const rooms = Array.isArray(state?.rooms) ? state.rooms : [];
        for (let index = 0; index < rooms.length; index += 1) {
            const room = rooms[index];
            const id = typeof room?.id === 'string' && room.id.trim() ? room.id.trim() : '';
            if (!id) {
                continue;
            }
            room.instanceId = this.meta.instanceId;
            this.roomsById.set(id, room);
            this.roomIdsByHandle[index + 1] = id;
        }
        if (Array.isArray(state?.roomCells)) {
            this.roomIdByCell = new Int32Array(Math.max(1, this.tilePlane.getCellCapacity?.() ?? this.tilePlane.getCellCount?.() ?? 1));
            const roomHandleById = new Map();
            for (let index = 1; index < this.roomIdsByHandle.length; index += 1) {
                const roomId = this.roomIdsByHandle[index];
                if (roomId) {
                    roomHandleById.set(roomId, index);
                }
            }
            for (const cell of state.roomCells) {
                const roomId = typeof cell?.roomId === 'string' && cell.roomId.trim() ? cell.roomId.trim() : '';
                const handle = roomHandleById.get(roomId) ?? 0;
                const tileIndex = Number.isFinite(Number(cell?.tileIndex))
                    ? Math.trunc(Number(cell.tileIndex))
                    : this.toTileIndex(cell?.x, cell?.y);
                if (handle > 0 && tileIndex >= 0 && tileIndex < this.roomIdByCell.length) {
                    this.roomIdByCell[tileIndex] = handle;
                }
            }
            this.rebuildRoomCellIndices();
        }
        this.fengShuiByRoomId = new Map();
        for (const snapshot of Array.isArray(state?.fengShui) ? state.fengShui : []) {
            const roomId = typeof snapshot?.roomId === 'string' && snapshot.roomId.trim() ? snapshot.roomId.trim() : '';
            if (roomId) {
                snapshot.instanceId = this.meta.instanceId;
                this.fengShuiByRoomId.set(roomId, snapshot);
            }
        }
        return { buildingCount: this.buildingById.size, rebuilt: false };
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
    advanceBuildingConstruction() {
        const completedBuildings = [];
        let changed = false;
        for (const building of this.buildingById.values()) {
            if (building?.state !== 'building') {
                continue;
            }
            const activeBuilderPlayerId = normalizeBuildingId(building.activeBuilderPlayerId);
            if (!activeBuilderPlayerId) {
                continue;
            }
            const activeBuilder = this.playersById.get(activeBuilderPlayerId);
            if (!activeBuilder || chebyshevDistance(activeBuilder.x, activeBuilder.y, building.x, building.y) > 1) {
                building.activeBuilderPlayerId = null;
                building.buildCompleteTick = undefined;
                building.updatedAtTick = this.tick;
                building.revision = Math.max(1, Math.trunc(Number(building.revision) || 1)) + 1;
                changed = true;
                continue;
            }
            const nextRemainingTicks = Math.max(0, resolveBuildingRemainingTicks(building) - 1);
            building.buildRemainingTicks = nextRemainingTicks;
            building.buildCompleteTick = nextRemainingTicks > 0 ? this.tick + nextRemainingTicks : this.tick;
            building.updatedAtTick = this.tick;
            building.revision = Math.max(1, Math.trunc(Number(building.revision) || 1)) + 1;
            changed = true;
            if (nextRemainingTicks > 0) {
                continue;
            }
            building.state = 'active';
            building.activeBuilderPlayerId = null;
            const completionDomains = this.activatePlacedBuildingTopologyAndVisual(building);
            if (completionDomains.length > 0) {
                this.markPersistenceDirtyDomains(completionDomains);
            }
            completedBuildings.push(building);
        }
        if (!changed) {
            return completedBuildings;
        }
        this.worldRevision += 1;
        this.persistentRevision += 1;
        this.markPersistenceDirtyDomains(['building']);
        return completedBuildings;
    }
    activatePlacedBuildingTopologyAndVisual(building) {
        const compiled = building && this.buildingCatalog?.defByHandle
            ? this.buildingCatalog.defByHandle[building.defHandle] ?? this.buildingCatalog.defById?.get?.(building.defId)
            : null;
        const cells = building ? (this.buildingCellsById.get(building.id) ?? []) : [];
        if (!building || !compiled || cells.length === 0) {
            return [];
        }
        const previousTileTypes = [];
        let clearedTileDamage = false;
        const wasInRoomInfluence = cells.some((cellIndex) => this.isCellInRoomInfluence(cellIndex));
        if (compiled.visualTileType) {
            for (const cellIndex of cells) {
                previousTileTypes.push([cellIndex, this.captureBuildingPreviousTileState(cellIndex)]);
            }
            clearedTileDamage = this.clearTileDamageForBuildingVisualCells(cells);
            for (const cellIndex of cells) {
                this.applyBuildingVisualTileType(cellIndex, compiled);
                this.markStaticTileSyncDirtyByIndex(cellIndex);
            }
        }
        if (previousTileTypes.length > 0) {
            this.buildingPreviousTileTypeById.set(building.id, previousTileTypes);
        }
        this.applyBuildingTopologyForBuilding(building.id);
        const affectsBoundaryTopology = compiledBuildingAffectsRoomBoundaryTopology(compiled);
        const affectsRoofTopology = compiled.roofCoverage > 0;
        const shouldRecalculateRooms = affectsBoundaryTopology
            ? cells.some((cellIndex) => this.shouldRecalculateRoomsForTileMutation(cellIndex, this.tilePlane.getTileType(cellIndex), compiled.visualTileType ?? this.getEffectiveTileTypeByCellIndex(cellIndex)))
            : affectsRoofTopology && wasInRoomInfluence;
        if (shouldRecalculateRooms) {
            this.recalculateRoomsAndFengShuiAfterTopologyChange({ reason: 'build_complete', dirtyCellCount: cells.length });
            return ['building', 'room', 'fengshui', ...(previousTileTypes.length > 0 ? ['tile_cell'] : []), ...(clearedTileDamage ? ['tile_damage'] : [])];
        }
        if (compiledBuildingAffectsFengShui(compiled) || affectsRoofTopology) {
            for (const cellIndex of cells) {
                this.recalculateFengShuiAfterRoomInfluenceChange(cellIndex, 'building_complete_fengshui');
            }
            return ['building', ...(wasInRoomInfluence ? ['fengshui'] : []), ...(previousTileTypes.length > 0 ? ['tile_cell'] : []), ...(clearedTileDamage ? ['tile_damage'] : [])];
        }
        return ['building', ...(previousTileTypes.length > 0 ? ['tile_cell'] : []), ...(clearedTileDamage ? ['tile_damage'] : [])];
    }
    /** tickOnce：推进当前地图实例的一个逻辑 tick。
     * @param precomputedMonsterIntents 可选的 worker 预计算怪物意图，作为 target hints 加速 AI 决策。
     */
    tickOnce(precomputedMonsterIntents = null) {
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
        const completedBuildings = this.advanceBuildingConstruction();
        this.advanceMonsters(monsterActions, precomputedMonsterIntents);
        return {
            completedBuildings,
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
        const cached = this.playerViewCacheByPlayerId.get(playerId);
        const normalizedRadius = Math.max(1, Math.trunc(Number(radius) || DEFAULT_VIEW_RADIUS));
        if (cached
            && cached.worldRevision === this.worldRevision
            && cached.selfRevision === player.selfRevision
            && cached.x === player.x
            && cached.y === player.y
            && cached.radius === normalizedRadius) {
            // P0-8：cache hit 路径直接复用 cached.view 引用，仅就地刷新 tick/session/worldRevision/selfRevision 四个 ephemeral 字段；
            // 其余子结构（self/instance/localXxx/visibleTileXxx/visiblePlayers）保持稳定 ref，避免每帧 200 个外层 view spread。
            const view = cached.view;
            view.sessionId = player.sessionId;
            view.tick = this.tick;
            view.worldRevision = this.worldRevision;
            view.selfRevision = player.selfRevision;
            return view;
        }

        const visibleTileVisibility = this.collectVisibleTileVisibility(player.x, player.y, normalizedRadius);
        const visibleTileIndices = visibleTileVisibility.indices;

        const visiblePlayers = this.collectVisiblePlayers(player, normalizedRadius, visibleTileVisibility);

        const localMonsters = this.collectLocalMonsters(player.x, player.y, normalizedRadius, visibleTileVisibility);

        const localNpcs = this.collectLocalNpcs(player.x, player.y, normalizedRadius, visibleTileVisibility);

        const localPortals = this.collectLocalPortals(player.x, player.y, normalizedRadius, visibleTileVisibility);

        const localLandmarks = this.collectLocalLandmarks(player.x, player.y, normalizedRadius, visibleTileVisibility);

        const localSafeZones = this.collectLocalSafeZones(player.x, player.y, normalizedRadius, visibleTileVisibility);

        const localContainers = this.collectLocalContainers(player.x, player.y, normalizedRadius, visibleTileVisibility);

        const localGroundPiles = this.collectLocalGroundPiles(player.x, player.y, normalizedRadius, visibleTileVisibility);
        const localBuildings = this.collectLocalBuildings(player.x, player.y, normalizedRadius, visibleTileVisibility);
        const view = {
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
                fengShuiLuck: this.getFengShuiLuckAt(player.x, player.y),
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
            localBuildings,
        };
        this.playerViewCacheByPlayerId.set(playerId, {
            worldRevision: this.worldRevision,
            selfRevision: player.selfRevision,
            x: player.x,
            y: player.y,
            radius: normalizedRadius,
            view,
        });
        return view;
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
            if (this.isSectVirtualBoundaryTile(x, y)) {
                return 0;
            }
            return null;
        }
        return this.getTileResource(DEFAULT_TILE_AURA_RESOURCE_KEY, x, y);
    }
    /** getTileResource：读取指定地块的指定资源。 */
    getTileResource(resourceKey, x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isInBounds(x, y)) {
            if (this.isSectVirtualBoundaryTile(x, y)) {
                return 0;
            }
            return null;
        }
        return this.getTileResourceValueByIndex(resourceKey, this.toTileIndex(x, y));
    }
    /** listTileResources：读取指定地块的全部有效资源。 */
    listTileResources(x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isInBounds(x, y)) {
            if (this.isSectVirtualBoundaryTile(x, y)) {
                return [];
            }
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
    /** getActiveBuildingCombatStateAtCellIndex：动态建筑优先作为地块战斗真源。 */
    getActiveBuildingCombatStateAtCellIndex(cellIndex) {
        const ids = this.buildingIdByCell.get(cellIndex);
        if (!Array.isArray(ids) || ids.length === 0) {
            return null;
        }
        for (const buildingId of ids) {
            const building = this.buildingById.get(buildingId);
            if (!building || !buildingUsesActiveTopology(building)) {
                continue;
            }
            const compiled = this.buildingCatalog?.defByHandle?.[building.defHandle] ?? this.buildingCatalog?.defById?.get?.(building.defId);
            if (!compiled?.visualTileType || compiled.layerId !== 1) {
                continue;
            }
            const maxHp = Math.max(1, Math.trunc(Number(building.maxHp) || Number(compiled.maxHp) || 1));
            const hp = Math.max(0, Math.min(maxHp, Math.trunc(Number(building.hp) || maxHp)));
            return {
                buildingId: building.id,
                tileType: compiled.visualTileType,
                hp,
                maxHp,
                modifiedAt: Number.isFinite(Number(building.updatedAtTick)) ? Math.max(0, Math.trunc(Number(building.updatedAtTick))) : null,
                respawnLeft: 0,
                destroyed: hp <= 0 || building.state === 'destroyed',
                building: true,
            };
        }
        return null;
    }
    /** getTileCombatState：读取指定地块战斗状态。 */
    getTileCombatState(x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isInBounds(x, y)) {
            if (this.isSectVirtualBoundaryTile(x, y)) {
                const maxHp = resolveTileDurability(this.template, TileType.Stone, x, y, this.sectVirtualBoundaryLayerState);
                return maxHp > 0
                    ? {
                        tileType: TileType.Stone,
                        terrainType: this.sectVirtualBoundaryLayerState.terrain,
                        surfaceType: this.sectVirtualBoundaryLayerState.surface,
                        structureType: StructureType.Stone,
                        hp: maxHp,
                        maxHp,
                        modifiedAt: null,
                        respawnLeft: 0,
                        destroyed: false,
                        virtualBoundary: true,
                    }
                    : null;
            }
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
        const buildingCombat = this.getActiveBuildingCombatStateAtCellIndex(tileIndex);
        if (buildingCombat) {
            return buildingCombat;
        }
        const tileType = this.getBaseTileType(x, y);
        const layerState = typeof this.tilePlane.getTileLayerState === 'function'
            ? this.tilePlane.getTileLayerState(tileIndex)
            : null;

        const maxHp = resolveTileDurability(this.template, tileType, x, y, layerState);
        if (maxHp <= 0) {
            return null;
        }

        const current = this.tileDamageByTile.get(tileIndex);
        return {
            tileType,
            terrainType: layerState?.terrain ?? null,
            structureType: layerState?.structure ?? null,
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

        const current: any = this.getTileCombatState(x, y);
        if (!current) {
            return null;
        }
        if (current.destroyed === true) {
            return null;
        }
        if (current.virtualBoundary === true) {
            const activated = this.activateRuntimeTile(x, y, TileType.Stone);
            if (activated.tileIndex < 0) {
                return null;
            }
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
        if (current.virtualBoundary === true) {
            const baseHp = Math.max(1, Math.trunc(Number(current.maxHp) || 1));
            const appliedDamage = Math.min(baseHp, normalizedDamage);
            const nextHp = Math.max(0, baseHp - appliedDamage);
            const destroyed = nextHp <= 0;
            if (!destroyed) {
                this.tileDamageByTile.set(tileIndex, {
                    hp: nextHp,
                    maxHp: baseHp,
                    destroyed: false,
                    respawnLeft: 0,
                    modifiedAt: Date.now(),
                });
                this.markTileDamagePersistenceDirty(tileIndex);
            } else {
                this.applyDefaultTileLayerFallback(tileIndex);
                this.tileDamageByTile.delete(tileIndex);
                this.markTileDamagePersistenceDirty(tileIndex);
            }
            this.worldRevision += 1;
            this.persistentRevision += 1;
            return {
                destroyed,
                hp: nextHp,
                maxHp: baseHp,
                appliedDamage,
                targetType: current.tileType,
                virtualBoundary: true,
            };
        }
        const temporary = this.temporaryTileByTile.get(tileIndex);
        if (temporary) {
            const appliedDamage = Math.min(Math.max(0, Math.trunc(Number(temporary.hp) || 0)), normalizedDamage);
            const nextHp = Math.max(0, Math.trunc(Number(temporary.hp) || 0) - appliedDamage);
            const destroyed = nextHp <= 0;
            const affectsRoomTopology = destroyed === true
                && this.shouldRecalculateRoomsForTileMutation(tileIndex, temporary.tileType, this.getBaseTileType(x, y));
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
            if (affectsRoomTopology) {
                this.recalculateRoomsAndFengShuiAfterTopologyChange({ reason: 'temporary_tile_destroyed', dirtyCellCount: 1 });
                this.markPersistenceDirtyDomains(['room', 'fengshui']);
            }
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
        if (current.building === true && current.buildingId) {
            const building = this.buildingById.get(current.buildingId);
            if (!building || !buildingUsesActiveTopology(building)) {
                return null;
            }
            const maxHp = Math.max(1, Math.trunc(Number(building.maxHp) || current.maxHp || 1));
            const appliedDamage = Math.min(Math.max(0, Math.trunc(Number(building.hp) || maxHp)), normalizedDamage);
            const nextHp = Math.max(0, Math.trunc(Number(building.hp) || maxHp) - appliedDamage);
            const destroyed = nextHp <= 0;
            if (destroyed) {
                building.hp = 0;
                building.state = 'destroyed';
                building.updatedAtTick = this.tick;
                building.revision = Math.max(1, Math.trunc(Number(building.revision) || 1)) + 1;
                this.deconstructBuildingInstance(building.id);
            }
            else {
                building.hp = nextHp;
                building.updatedAtTick = this.tick;
                building.revision = Math.max(1, Math.trunc(Number(building.revision) || 1)) + 1;
                this.markStaticTileSyncDirtyByIndex(tileIndex);
                this.worldRevision += 1;
                this.persistentRevision += 1;
                this.markPersistenceDirtyDomains(['building']);
                if (this.isCellInRoomInfluence(tileIndex)) {
                    this.recalculateFengShuiAfterRoomInfluenceChange(tileIndex, 'building_integrity_damaged');
                    this.markPersistenceDirtyDomains(['fengshui']);
                }
            }
            return {
                destroyed,
                hp: nextHp,
                maxHp,
                appliedDamage,
                targetType: current.tileType,
                buildingId: building.id,
                building: true,
            };
        }

        const appliedDamage = Math.min(current.hp, normalizedDamage);

        const nextHp = Math.max(0, current.hp - appliedDamage);
        const destroyed = nextHp <= 0;
        const tileDrops = this.rollTileDrops(current, appliedDamage, destroyed);
        const affectsRoomTopology = destroyed === true
            && this.shouldRecalculateRoomsForTileMutation(tileIndex, current.tileType, this.getDestroyedTileLayerStateByCellIndex(tileIndex).tileType);
        const affectsRoomIntegrity = destroyed !== true
            && current.hp >= current.maxHp
            && this.isCellInRoomInfluence(tileIndex);
        if (destroyed && this.isSectRuntimeExpandedBoundaryStone(tileIndex, current)) {
            this.applyDefaultTileLayerFallback(tileIndex);
            this.tileDamageByTile.delete(tileIndex);
            this.worldRevision += 1;
            this.markTileDamagePersistenceDirty(tileIndex);
            if (this.shouldRecalculateRoomsForTileMutation(tileIndex, current.tileType, this.resolveDefaultTileLayerFallbackForCell(tileIndex).legacyTileType)) {
                this.recalculateRoomsAndFengShuiAfterTopologyChange({ reason: 'sect_boundary_opened', dirtyCellCount: 1 });
                this.markPersistenceDirtyDomains(['room', 'fengshui']);
            }
            this.persistentRevision += 1;
            return {
                destroyed,
                hp: nextHp,
                maxHp: current.maxHp,
                appliedDamage,
                targetType: current.tileType,
                tileDrops,
                sectBoundaryOpened: true,
            };
        }
        this.tileDamageByTile.set(tileIndex, {
            hp: nextHp,
            maxHp: current.maxHp,

            destroyed,
            respawnLeft: destroyed ? calculateTileRestoreTicks(current.tileType) : 0,
            modifiedAt: Date.now(),
        });
        this.markStaticTileSyncDirtyByIndex(tileIndex);
        this.worldRevision += 1;
        this.markTileDamagePersistenceDirty(tileIndex);
        if (affectsRoomTopology) {
            this.recalculateRoomsAndFengShuiAfterTopologyChange({ reason: 'tile_destroyed', dirtyCellCount: 1 });
            this.markPersistenceDirtyDomains(['room', 'fengshui']);
        }
        else if (affectsRoomIntegrity) {
            this.recalculateFengShuiAfterRoomInfluenceChange(tileIndex, 'tile_integrity_damaged');
        }
        this.persistentRevision += 1;
        return {

            destroyed,
            hp: nextHp,
            maxHp: current.maxHp,
            appliedDamage,
            targetType: current.tileType,
            tileDrops,
        };
    }
    /** createTemporaryTile：创建或刷新技能生成的临时地块。 */
    createTemporaryTile(x, y, tileType, maxHp, durationTicks, currentTick, options: any = {}) {
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
        const previousEffectiveTileType = this.getEffectiveTileTypeByCellIndex(tileIndex);
        this.temporaryTileByTile.set(tileIndex, {
            tileType: typeof tileType === 'string' && tileType.length > 0 ? tileType : TileType.Stone,
            hp,
            maxHp: hp,
            expiresAtTick: nowTick + ttl,
            ownerPlayerId: typeof options?.ownerPlayerId === 'string' ? options.ownerPlayerId : null,
            sourceSkillId: typeof options?.sourceSkillId === 'string' ? options.sourceSkillId : null,
            createdAt: existingTemporary?.createdAt ?? now,
            modifiedAt: now,
        });
        this.markStaticTileSyncDirtyByIndex(tileIndex);
        this.worldRevision += 1;
        this.markPersistenceDirtyDomains(['temporary_tile']);
        if (this.shouldRecalculateRoomsForTileMutation(tileIndex, previousEffectiveTileType, this.getEffectiveTileTypeByCellIndex(tileIndex))) {
            this.recalculateRoomsAndFengShuiAfterTopologyChange({ reason: 'temporary_tile_created', dirtyCellCount: 1 });
            this.markPersistenceDirtyDomains(['room', 'fengshui']);
        }
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
        if (!this.isCellIndexWalkable(tileIndex)) {
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
        let topologyChangedCellCount = 0;
        const toDelete: number[] = [];
        for (const [tileIndex, state] of this.temporaryTileByTile) {
            if (!state || !Number.isFinite(Number(tileIndex))) {
                toDelete.push(tileIndex);
                this.markStaticTileSyncDirtyByIndex(tileIndex);
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
                if (this.shouldRecalculateRoomsForTileMutation(tileIndex, state.tileType, this.getBaseTileType(x, y))) {
                    topologyChangedCellCount += 1;
                }
                toDelete.push(tileIndex);
                this.markStaticTileSyncDirtyByIndex(tileIndex);
                changed = true;
            }
        }
        for (const key of toDelete) {
            this.temporaryTileByTile.delete(key);
        }
        if (changed) {
            if (topologyChangedCellCount > 0) {
                this.recalculateRoomsAndFengShuiAfterTopologyChange({ reason: 'temporary_tile_expired', dirtyCellCount: topologyChangedCellCount });
                this.markPersistenceDirtyDomains(['room', 'fengshui']);
            }
            this.worldRevision += 1;
            this.markPersistenceDirtyDomains(['temporary_tile']);
            this.persistentRevision += 1;
        }
        return changed;
    }
    /** advanceTileRecovery：推进可破坏地块的自然修复与复生。 */
    advanceTileRecovery(isTerrainStabilized, tileRecoveryProvider) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (this.tileDamageByTile.size === 0) {
            return false;
        }

        // 通过 provider 检查恢复是否启用
        if (tileRecoveryProvider && typeof tileRecoveryProvider.getRecoveryConfig === 'function') {
            const config = tileRecoveryProvider.getRecoveryConfig(this.meta?.instanceId);
            if (config && config.enabled === false) {
                return false;
            }
        }

        const now = Date.now();
        let changed = false;
        let topologyChangedCellCount = 0;
        const fengShuiInfluenceCells = new Set();
        for (const [tileIndex, current] of Array.from(this.tileDamageByTile.entries())) {
            if (!Number.isFinite(Number(tileIndex))) {
                continue;
            }
            const normalizedTileIndex = Math.trunc(Number(tileIndex));
            const x = this.tilePlane.getX(normalizedTileIndex);
            const y = this.tilePlane.getY(normalizedTileIndex);
            // 优先通过 provider 获取恢复目标地块类型，fallback 到 getBaseTileType
            let tileType;
            if (tileRecoveryProvider && typeof tileRecoveryProvider.getOriginalTileType === 'function') {
                const providerResult = tileRecoveryProvider.getOriginalTileType(this.meta?.instanceId, x, y);
                tileType = providerResult != null ? providerResult : this.getBaseTileType(x, y);
            } else {
                tileType = this.getBaseTileType(x, y);
            }
            const layerState = typeof this.tilePlane.getTileLayerState === 'function'
                ? this.tilePlane.getTileLayerState(normalizedTileIndex)
                : null;
            const maxHp = Math.max(1, Math.trunc(Number(current?.maxHp) || resolveTileDurability(this.template, tileType, x, y, layerState)));
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
                        if (this.shouldRecalculateRoomsForTileMutation(normalizedTileIndex, this.getDestroyedTileLayerStateByCellIndex(normalizedTileIndex).tileType, tileType)) {
                            topologyChangedCellCount += 1;
                        }
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
            const repairAmount = Math.max(1, Math.floor(maxHp * TERRAIN_REGEN_RATE_PER_TICK));
            const nextHp = Math.min(maxHp, hp + repairAmount);
            if (nextHp >= maxHp) {
                this.tileDamageByTile.delete(tileIndex);
                if (this.isCellInRoomInfluence(normalizedTileIndex)) {
                    fengShuiInfluenceCells.add(normalizedTileIndex);
                }
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
            if (topologyChangedCellCount > 0) {
                this.recalculateRoomsAndFengShuiAfterTopologyChange({ reason: 'tile_recovered', dirtyCellCount: topologyChangedCellCount });
                this.markPersistenceDirtyDomains(['room', 'fengshui']);
            }
            else if (fengShuiInfluenceCells.size > 0) {
                for (const cellIndex of fengShuiInfluenceCells) {
                    this.recalculateFengShuiAfterRoomInfluenceChange(cellIndex, 'tile_integrity_recovered');
                }
            }
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
            return this.resolveDefaultTileLayerFallbackForCell(-1, x, y).legacyTileType;
        }
        return this.tilePlane.getTileType(tileIndex);
    }
    /** getEffectiveTileType：读取地块当前生效类型，已摧毁地块按空地处理。 */
    getEffectiveTileType(x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isInBounds(x, y)) {
            if (this.isSectVirtualBoundaryTile(x, y)) {
                return TileType.Stone;
            }
            return this.resolveDefaultTileLayerFallbackForCell(-1, x, y).legacyTileType;
        }
        return this.getEffectiveTileTypeByCellIndex(this.toTileIndex(x, y));
    }
    /** getTileLayerState：读取指定坐标的权威分层状态，供低频投影和诊断使用。 */
    getTileLayerState(x, y) {
        if (!this.isInBounds(x, y)) {
            if (this.isSectVirtualBoundaryTile(x, y)) {
                return this.sectVirtualBoundaryLayerState;
            }
            return null;
        }
        const tileIndex = this.toTileIndex(x, y);
        const state = typeof this.tilePlane.getTileLayerState === 'function'
            ? this.tilePlane.getTileLayerState(tileIndex)
            : null;
        if (!state) {
            return null;
        }
        if (this.tileDamageByTile.get(tileIndex)?.destroyed === true) {
            const destroyedState = this.getDestroyedTileLayerStateByCellIndex(tileIndex, state);
            return {
                ...state,
                terrain: destroyedState.terrainType,
                surface: destroyedState.surfaceType,
                structure: null,
                interactableKinds: destroyedState.interactableKinds,
                legacyTileType: destroyedState.tileType,
            };
        }
        return state;
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

        const results = [];
        for (const player of this.playersById.values()) {
            if (player.x === x && player.y === y) {
                results.push({ ...player });
            }
        }
        return results;
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
    /** isPlayerOverlapTile：判断指定地块是否允许玩家重叠站立。 */
    isPlayerOverlapTile(x, y) {
        if (!this.isInBounds(x, y)) {
            return false;
        }
        return this.template.playerOverlapMask?.[this.toTileIndex(x, y)] === 1;
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
            if (isOffsetInRange(x - zone.x, y - zone.y, zone.radius)) {
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
    /** addRuntimeMonster：添加运行时动态妖兽，不绑定普通地图刷新点持久化。 */
    addRuntimeMonster(monster) {
        if (!monster || typeof monster.runtimeId !== 'string' || !monster.runtimeId.trim()) {
            return null;
        }
        const runtimeId = monster.runtimeId.trim();
        if (this.monstersByRuntimeId.has(runtimeId)) {
            return this.getMonster(runtimeId);
        }
        const x = Number.isFinite(Number(monster.x)) ? Math.trunc(Number(monster.x)) : 0;
        const y = Number.isFinite(Number(monster.y)) ? Math.trunc(Number(monster.y)) : 0;
        const spawnX = Number.isFinite(Number(monster.spawnOriginX)) ? Math.trunc(Number(monster.spawnOriginX)) : x;
        const spawnY = Number.isFinite(Number(monster.spawnOriginY)) ? Math.trunc(Number(monster.spawnOriginY)) : y;
        const spawnKey = typeof monster.spawnKey === 'string' && monster.spawnKey.trim()
            ? monster.spawnKey.trim()
            : buildMonsterSpawnKey(monster.monsterId, spawnX, spawnY);
        const state = {
            runtimeId,
            monsterId: monster.monsterId,
            spawnKey,
            spawnX,
            spawnY,
            x,
            y,
            hp: monster.alive === false ? 0 : Math.max(1, Math.min(monster.hp, monster.maxHp)),
            maxHp: monster.maxHp,
            qi: monster.alive === false ? 0 : Math.max(0, Math.round(monster.baseNumericStats?.maxQi ?? 0)),
            maxQi: Math.max(0, Math.round(monster.baseNumericStats?.maxQi ?? 0)),
            alive: monster.alive === false ? false : true,
            respawnLeft: monster.alive === false ? Math.max(0, Math.trunc(Number(monster.respawnLeft) || 0)) : 0,
            respawnTicks: Math.max(1, Math.trunc(Number(monster.respawnTicks) || 1)),
            facing: monster.facing,
            name: monster.name,
            char: monster.char,
            color: monster.color,
            level: monster.level,
            tier: monster.tier,
            expMultiplier: monster.expMultiplier,
            baseAttrs: monster.baseAttrs,
            attrs: monster.baseAttrs,
            baseNumericStats: monster.baseNumericStats,
            numericStats: monster.baseNumericStats,
            ratioDivisors: monster.ratioDivisors,
            statFormula: monster.statFormula,
            initialBuffs: Array.isArray(monster.initialBuffs) ? monster.initialBuffs : [],
            buffs: [],
            skills: monster.skills,
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
        if (state.alive) {
            applyMonsterInitialBuffs(state, this.buffRegistry);
            recalculateMonsterDerivedState(state);
        }
        this.monstersByRuntimeId.set(runtimeId, state);
        this.monsterSpawnKeyByRuntimeId.set(runtimeId, spawnKey);
        const group = this.monsterSpawnGroupsByKey.get(spawnKey);
        if (group) {
            group.push(state);
        }
        else {
            this.monsterSpawnGroupsByKey.set(spawnKey, [state]);
        }
        if (state.alive) {
            this.monsterRuntimeIdByTile.set(this.toTileIndex(state.x, state.y), runtimeId);
        }
        this.worldRevision += 1;
        return snapshotMonster(state);
    }
    /** removeRuntimeMonster：移除运行时动态妖兽，不触发死亡、经验、掉落或击杀。 */
    removeRuntimeMonster(runtimeIdInput) {
        const runtimeId = typeof runtimeIdInput === 'string' ? runtimeIdInput.trim() : '';
        if (!runtimeId) {
            return false;
        }
        const monster = this.monstersByRuntimeId.get(runtimeId);
        if (!monster) {
            return false;
        }
        this.monsterRuntimeIdByTile.delete(this.toTileIndex(monster.x, monster.y));
        this.monstersByRuntimeId.delete(runtimeId);
        this.monsterSpawnKeyByRuntimeId.delete(runtimeId);
        this.localMonsterViewCacheByRuntimeId.delete(runtimeId);
        this.dirtyMonsterRuntimeIds?.delete?.(runtimeId);
        const group = this.monsterSpawnGroupsByKey.get(monster.spawnKey);
        if (group) {
            const nextGroup = group.filter((entry) => entry.runtimeId !== runtimeId);
            if (nextGroup.length > 0) {
                this.monsterSpawnGroupsByKey.set(monster.spawnKey, nextGroup);
            }
            else {
                this.monsterSpawnGroupsByKey.delete(monster.spawnKey);
                this.monsterSpawnAccelerationStatesByKey.delete(monster.spawnKey);
            }
        }
        this.worldRevision += 1;
        return true;
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
            existing.infiniteDuration = buff.infiniteDuration === true;
            existing.sustainTicksElapsed = buff.sustainCost ? Math.max(0, Math.floor(Number(existing.sustainTicksElapsed ?? buff.sustainTicksElapsed ?? 0) || 0)) : undefined;
            existing.persistOnDeath = buff.persistOnDeath === true;
            existing.persistOnReturnToSpawn = buff.persistOnReturnToSpawn === true;
            refreshRuntimeTemporaryBuffPrototype(existing, buff);
        }
        else {
            monster.buffs.push(createRuntimeTemporaryBuff(buff));
        }
        monster.buffs.sort((left, right) => String(left.buffId ?? '').localeCompare(String(right.buffId ?? ''), 'zh-Hans-CN'));
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
    /** advanceTileResourceFlow：推进地块灵气向模板基线自然衰减或回补。 */
    advanceTileResourceFlow() {
        let changed = false;
        for (const [resourceKey, tileIndices] of Array.from(this.tileResourceFlowIndicesByKey.entries())) {
            if (!isNaturalAuraFlowResource(resourceKey) || !(tileIndices instanceof Set) || tileIndices.size <= 0) {
                continue;
            }
            const bucket = this.tileResourceBuckets.get(resourceKey);
            if (!bucket) {
                this.tileResourceFlowIndicesByKey.delete(resourceKey);
                continue;
            }
            const baseBucket = this.baseTileResourceBuckets.get(resourceKey);
            const remainderBucket = this.getOrCreateTileResourceFlowRemainderBucket(resourceKey);
            for (const tileIndex of Array.from(tileIndices.values())) {
                const current = Math.max(0, Math.trunc(Number(bucket[tileIndex]) || 0));
                const base = Math.max(0, Math.trunc(Number(baseBucket?.[tileIndex]) || 0));
                if (current === base) {
                    remainderBucket[tileIndex] = 0;
                    tileIndices.delete(tileIndex);
                    continue;
                }
                const diff = Math.abs(current - base);
                const accumulated = diff * TILE_AURA_FLOW_RATE_SCALED + (remainderBucket[tileIndex] ?? 0);
                let step = Math.floor(accumulated / TILE_AURA_FLOW_RATE_SCALE);
                remainderBucket[tileIndex] = accumulated - step * TILE_AURA_FLOW_RATE_SCALE;
                if (step <= 0) {
                    continue;
                }
                step = Math.min(step, diff);
                const next = current > base ? current - step : current + step;
                this.setTileResourceValueByIndex(resourceKey, tileIndex, next, current);
                if (next === base) {
                    remainderBucket[tileIndex] = 0;
                }
                changed = true;
            }
            if (tileIndices.size <= 0) {
                this.tileResourceFlowIndicesByKey.delete(resourceKey);
            }
        }
        return changed;
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
        this.tileResourceFlowRemainderBuckets.clear();
        this.tileResourceFlowIndicesByKey.clear();
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
            this.updateTileResourceFlowIndex(entry.resourceKey, tileIndex, next);
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
            const layerState = typeof this.tilePlane.getTileLayerState === 'function'
                ? this.tilePlane.getTileLayerState(resolvedTileIndex)
                : null;
            const resolvedMaxHp = resolveTileDurability(this.template, tileType, x, y, layerState);
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
        let topologyChangedCellCount = 0;
        for (const [tileIndex, damage] of this.tileDamageByTile.entries()) {
            const x = this.tilePlane.getX(tileIndex);
            const y = this.tilePlane.getY(tileIndex);
            const tileType = this.getBaseTileType(x, y);
            if (damage?.destroyed === true && this.shouldRecalculateRoomsForTileMutation(tileIndex, tileType, this.getDestroyedTileLayerStateByCellIndex(tileIndex).tileType)) {
                topologyChangedCellCount += 1;
            }
        }
        if (topologyChangedCellCount > 0) {
            this.recalculateRoomsAndFengShuiAfterTopologyChange({ reason: 'tile_damage_hydrated', dirtyCellCount: topologyChangedCellCount });
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
        let topologyChangedCellCount = 0;
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
            const previousTileType = this.getEffectiveTileTypeByCellIndex(resolvedTileIndex);
            const hp = Math.max(1, Math.trunc(Number(entry.hp) || 1));
            const maxHp = Math.max(hp, Math.trunc(Number(entry.maxHp) || hp));
            const expiresAtTick = Math.max(1, Math.trunc(Number(entry.expiresAtTick) || 1));
            const tileType = typeof entry.tileType === 'string' && entry.tileType.length > 0 ? entry.tileType : TileType.Stone;
            this.temporaryTileByTile.set(resolvedTileIndex, {
                tileType,
                hp,
                maxHp,
                expiresAtTick,
                ownerPlayerId: typeof entry.ownerPlayerId === 'string' && entry.ownerPlayerId.trim() ? entry.ownerPlayerId.trim() : null,
                sourceSkillId: typeof entry.sourceSkillId === 'string' && entry.sourceSkillId.trim() ? entry.sourceSkillId.trim() : null,
                createdAt: Number.isFinite(Number(entry.createdAt)) ? Math.max(0, Math.trunc(Number(entry.createdAt))) : Date.now(),
                modifiedAt: Number.isFinite(Number(entry.modifiedAt)) ? Math.max(0, Math.trunc(Number(entry.modifiedAt))) : Date.now(),
            });
            if (this.shouldRecalculateRoomsForTileMutation(resolvedTileIndex, previousTileType, tileType)) {
                topologyChangedCellCount += 1;
            }
        }
        if (topologyChangedCellCount > 0) {
            this.recalculateRoomsAndFengShuiAfterTopologyChange({ reason: 'temporary_tiles_hydrated', dirtyCellCount: topologyChangedCellCount });
        }
        this.clearDirtyDomains();
    }
    /** hydrateRuntimeTiles：用持久化动态地块回填稀疏地块平面。 */
    hydrateRuntimeTiles(entries) {
        if (!Array.isArray(entries) || entries.length === 0) {
            return;
        }
        let topologyChangedCellCount = 0;
        for (const entry of entries) {
            if (!entry || !Number.isFinite(Number(entry.x)) || !Number.isFinite(Number(entry.y))) {
                continue;
            }
            const x = Math.trunc(Number(entry.x));
            const y = Math.trunc(Number(entry.y));
            const tileType = typeof entry.tileType === 'string' && entry.tileType.length > 0
                ? entry.tileType
                : TileType.Stone;
            const tileIndex = this.toTileIndex(x, y);
            if (tileIndex >= 0) {
                const previousTileType = this.getEffectiveTileTypeByCellIndex(tileIndex);
                this.tilePlane.setTileType(tileIndex, tileType);
                this.applyPersistedTileLayers(tileIndex, entry);
                if (this.shouldRecalculateRoomsForTileMutation(tileIndex, previousTileType, tileType)) {
                    topologyChangedCellCount += 1;
                }
                continue;
            }
            const activated = this.activateRuntimeTile(x, y, tileType);
            if (activated?.tileIndex >= 0) {
                this.applyPersistedTileLayers(activated.tileIndex, entry);
            }
            if (activated?.created === true && this.shouldRecalculateRoomsForTileMutation(activated.tileIndex, this.resolveDefaultTileLayerFallbackForCell(activated.tileIndex).legacyTileType, tileType)) {
                topologyChangedCellCount += 1;
            }
        }
        if (topologyChangedCellCount > 0) {
            this.recalculateRoomsAndFengShuiAfterTopologyChange({ reason: 'runtime_tiles_hydrated', dirtyCellCount: topologyChangedCellCount });
        }
        this.persistentRevision = 1;
        this.persistedRevision = 1;
        this.clearDirtyDomains();
    }
    /** applyPersistedTileLayers：回填动态地块的分层真源；修正旧库中 tileType 与分层自相矛盾的记录。 */
    applyPersistedTileLayers(tileIndex, entry) {
        if (!entry || tileIndex < 0 || tileIndex >= this.tilePlane.getCellCount()) {
            return;
        }
        const tileType = typeof entry.tileType === 'string' && entry.tileType.length > 0
            ? entry.tileType
            : this.tilePlane.getTileType(tileIndex);
        const persistedTerrainType = typeof entry.terrainType === 'string' && entry.terrainType.length > 0 ? entry.terrainType : undefined;
        const persistedSurfaceType = Object.prototype.hasOwnProperty.call(entry, 'surfaceType')
            ? (typeof entry.surfaceType === 'string' && entry.surfaceType.length > 0 ? entry.surfaceType : null)
            : undefined;
        const persistedStructureType = Object.prototype.hasOwnProperty.call(entry, 'structureType')
            ? (typeof entry.structureType === 'string' && entry.structureType.length > 0 ? entry.structureType : null)
            : undefined;
        const persistedInteractableKinds = Array.isArray(entry.interactableKinds) ? entry.interactableKinds : undefined;
        if (this.shouldNormalizePersistedRuntimeTileToDefaultFallback(tileType, persistedTerrainType, persistedSurfaceType, persistedStructureType, persistedInteractableKinds)) {
            this.applyDefaultTileLayerFallback(tileIndex);
            this.markPersistenceDirtyDomains(['tile_cell']);
            return;
        }
        if (this.shouldNormalizePersistedRuntimeTileLayers(tileType, persistedTerrainType, persistedSurfaceType, persistedStructureType, persistedInteractableKinds)) {
            const seed = resolveTileLayerSeedFromTileType(tileType);
            this.tilePlane.setTerrain(tileIndex, seed.terrain);
            this.tilePlane.setSurface(tileIndex, seed.surface);
            this.tilePlane.setStructure(tileIndex, seed.structure);
            if (typeof this.tilePlane.setInteractableKinds === 'function') {
                this.tilePlane.setInteractableKinds(tileIndex, [...seed.interactables]);
            }
            this.markPersistenceDirtyDomains(['tile_cell']);
            return;
        }
        if (typeof entry.terrainType === 'string' && entry.terrainType.length > 0) {
            this.tilePlane.setTerrain(tileIndex, entry.terrainType);
        }
        if (Object.prototype.hasOwnProperty.call(entry, 'surfaceType')) {
            this.tilePlane.setSurface(tileIndex, typeof entry.surfaceType === 'string' && entry.surfaceType.length > 0 ? entry.surfaceType : null);
        }
        if (Object.prototype.hasOwnProperty.call(entry, 'structureType')) {
            this.tilePlane.setStructure(tileIndex, typeof entry.structureType === 'string' && entry.structureType.length > 0 ? entry.structureType : null);
        }
        if (Array.isArray(entry.interactableKinds) && typeof this.tilePlane.setInteractableKinds === 'function') {
            this.tilePlane.setInteractableKinds(tileIndex, entry.interactableKinds);
        }
    }
    /** shouldNormalizePersistedRuntimeTileToDefaultFallback：旧脏层缺少结构真源时，按统一默认四层回退，不按宗门或坐标特判。 */
    shouldNormalizePersistedRuntimeTileToDefaultFallback(tileType, terrainType, surfaceType, structureType, interactableKinds) {
        const hasSurface = surfaceType !== undefined && surfaceType !== null;
        const hasStructure = structureType !== undefined && structureType !== null;
        const hasInteractables = Array.isArray(interactableKinds) && interactableKinds.length > 0;
        const seed = resolveTileLayerSeedFromTileType(tileType);
        if (seed.structure && structureType === null) {
            return true;
        }
        return terrainType === 'stone_ground' && !hasSurface && !hasStructure && !hasInteractables;
    }
    /** shouldNormalizePersistedRuntimeTileLayers：旧 bug 可能把 floor 地块持久化成 stone_ground，回读时按 tileType 自修复。 */
    shouldNormalizePersistedRuntimeTileLayers(tileType, terrainType, surfaceType, structureType, interactableKinds) {
        const seed = resolveTileLayerSeedFromTileType(tileType);
        const composed = composeTileTypeFromLayers(
            terrainType ?? seed.terrain,
            surfaceType === undefined ? seed.surface : surfaceType,
            structureType === undefined ? seed.structure : structureType,
            interactableKinds ?? [...seed.interactables],
        );
        return composed !== tileType;
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
            this.updateTileResourceFlowIndex(entry.resourceKey, tileIndex, next);
        }
        this.changedAuraTileCount = 0;
        this.changedTileResourceEntryCount = 0;
        this.changedTileResourceEntryCountByKey.clear();
        this.tileResourceFlowRemainderBuckets.clear();
        this.tileResourceFlowIndicesByKey.clear();
        this.rebuildTileResourceFlowIndices();
        this.persistentRevision = 1;
        this.persistedRevision = 1;
        this.clearDirtyDomains();
    }
    /** hydrateGroundPiles：用持久化数据回填地面物品堆。 */
    hydrateGroundPiles(entries) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.groundPilesByTile.clear();
        // P0-4 entry cache 跟随 entity lifecycle 释放：hydrate 重置 ground pile 索引时同步清空 view 条目缓存。
        this.localGroundPileViewCacheBySourceId.clear();
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
    hydrateTime(tick, options) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!Number.isFinite(Number(tick))) {
            return;
        }
        this.tick = Math.max(0, Math.trunc(Number(tick)));
        if (options && Number.isFinite(Number(options.tickSpeed))) {
            this.tickSpeed = Math.max(0, Number(options.tickSpeed));
            this.paused = this.tickSpeed === 0;
        }
        if (options && typeof options.paused === 'boolean') {
            this.paused = options.paused;
            if (this.paused) {
                this.tickSpeed = 0;
            }
        }
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
            if (Number.isFinite(Number(entry.qi))) {
                monster.qi = Math.max(0, Math.trunc(Number(entry.qi)));
            }
            if (Number.isFinite(Number(entry.maxQi))) {
                monster.maxQi = Math.max(0, Math.trunc(Number(entry.maxQi)));
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
                monster.pendingCast = undefined;
                if (Array.isArray(payload.buffs)) {
                    monster.buffs = payload.buffs;
                }
                if (Number.isFinite(Number(payload.attackReadyTick))) {
                    monster.attackReadyTick = Math.max(0, Math.trunc(Number(payload.attackReadyTick)));
                }
                if (Number.isFinite(Number(payload.qi))) {
                    monster.qi = Math.max(0, Math.trunc(Number(payload.qi)));
                }
                if (Number.isFinite(Number(payload.maxQi))) {
                    monster.maxQi = Math.max(0, Math.trunc(Number(payload.maxQi)));
                }
                if (payload.cooldownReadyTickBySkillId && typeof payload.cooldownReadyTickBySkillId === 'object') {
                    monster.cooldownReadyTickBySkillId = payload.cooldownReadyTickBySkillId;
                }
                if (payload.damageContributors && typeof payload.damageContributors === 'object') {
                    monster.damageContributors = payload.damageContributors;
                }
            }
            if (monster.alive) {
                ensureMonsterInitialBuffs(monster, this.buffRegistry);
            }
            if (!recalculateMonsterBaseStatsFromFormula(monster)) {
                recalculateMonsterDerivedState(monster);
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
                items: pile.items.map((entry) => entry.item),
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
                items: pile.items.map((entry) => entry.item),
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
                tileType: typeof state.tileType === 'string' && state.tileType.length > 0 ? state.tileType : TileType.Stone,
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
            const layerState = typeof this.tilePlane.getTileLayerState === 'function'
                ? this.tilePlane.getTileLayerState(tileIndex)
                : null;
            const inTemplateBounds = x >= 0 && y >= 0 && x < this.template.width && y < this.template.height;
            if (inTemplateBounds) {
                const staticSeed = resolveTemplateLayerSeed(this.template, x, y);
                const staticType = staticSeed.legacyTileType;
                if (tileType === staticType
                    && layerState?.terrain === staticSeed.terrain
                    && (layerState?.surface ?? null) === staticSeed.surface
                    && (layerState?.structure ?? null) === staticSeed.structure
                    && areInteractableKindListsEqual(layerState?.interactableKinds, staticSeed.interactables)) {
                    continue;
                }
            }
            entries.push({
                x,
                y,
                tileType,
                terrainType: layerState?.terrain,
                surfaceType: layerState?.surface ?? null,
                structureType: layerState?.structure ?? null,
                interactableKinds: Array.isArray(layerState?.interactableKinds) ? layerState.interactableKinds : [],
            });
        }
        entries.sort((left, right) => left.y - right.y || left.x - right.x || String(left.tileType).localeCompare(String(right.tileType), 'zh-Hans-CN'));
        return entries;
    }
    /** buildOverlayPersistenceChunks：导出动态 overlay 分域持久化 chunk。 */
    buildOverlayPersistenceChunks() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const portals = this.runtimePortals
            .map((portal) => ({
                id: portal.id,
                x: portal.x,
                y: portal.y,
                targetMapId: portal.targetMapId,
                targetInstanceId: portal.targetInstanceId ?? null,
                targetX: portal.targetX,
                targetY: portal.targetY,
                targetPortalId: portal.targetPortalId,
                direction: portal.direction,
                kind: portal.kind,
                trigger: portal.trigger,
                hidden: portal.hidden === true,
                name: portal.name,
                char: portal.char,
                color: portal.color,
                sectId: portal.sectId,
            }))
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
                qi: monster.qi,
                maxQi: monster.maxQi,
                alive: monster.alive === true,
                respawnLeft: monster.respawnLeft,
                respawnTicks: monster.respawnTicks,
                aggroTargetPlayerId: monster.aggroTargetPlayerId ?? null,
                statePayload: {
                    qi: monster.qi,
                    maxQi: monster.maxQi,
                    attackReadyTick: monster.attackReadyTick,
                    cooldownReadyTickBySkillId: monster.cooldownReadyTickBySkillId ?? {},
                    damageContributors: monster.damageContributors ?? {},
                    buffs: Array.isArray(monster.buffs) ? monster.buffs : [],
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
                .filter((runtimeId): runtimeId is string => typeof runtimeId === 'string' && runtimeId.trim().length > 0)
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
                qi: monster.qi,
                maxQi: monster.maxQi,
                alive: monster.alive === true,
                respawnLeft: monster.respawnLeft,
                respawnTicks: monster.respawnTicks,
                aggroTargetPlayerId: monster.aggroTargetPlayerId ?? null,
                statePayload: {
                    qi: monster.qi,
                    maxQi: monster.maxQi,
                    attackReadyTick: monster.attackReadyTick,
                    cooldownReadyTickBySkillId: monster.cooldownReadyTickBySkillId ?? {},
                    damageContributors: monster.damageContributors ?? {},
                    buffs: Array.isArray(monster.buffs) ? monster.buffs : [],
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
        this.markStaticTileSyncDirtyByIndex(tileIndex);
    }
    /** markTileDamagePersistenceDirty：记录地块损坏行级脏键。 */
    markTileDamagePersistenceDirty(tileIndex) {
        markMapInstanceDirtyDomains(this, ['tile_damage']);
        if (!(this.dirtyTileDamageIndices instanceof Set)) {
            this.dirtyTileDamageIndices = new Set();
        }
        addNumericDirtyKey(this.dirtyTileDamageIndices, tileIndex);
        this.markStaticTileSyncDirtyByIndex(tileIndex);
    }
    /** markStaticTileSyncDirtyByIndex：记录实例级地块静态同步脏坐标。 */
    markStaticTileSyncDirtyByIndex(tileIndexInput) {
        const tileIndex = Math.trunc(Number(tileIndexInput));
        if (!Number.isFinite(tileIndex) || tileIndex < 0 || tileIndex >= this.tilePlane.getCellCount()) {
            return false;
        }
        if (!(this.staticTileSyncDirtyTileKeys instanceof Set)) {
            this.staticTileSyncDirtyTileKeys = new Set();
        }
        if (this.staticTileSyncDirtyTileKeys.size === 0) {
            this.staticTileSyncDirtyFromRevision = Math.max(0, Math.trunc(Number(this.staticTileSyncRevision) || 0));
        }
        const key = `${this.tilePlane.getX(tileIndex)},${this.tilePlane.getY(tileIndex)}`;
        if (this.staticTileSyncDirtyTileKeys.has(key)) {
            return false;
        }
        this.staticTileSyncDirtyTileKeys.add(key);
        this.staticTileSyncRevision = Math.max(0, Math.trunc(Number(this.staticTileSyncRevision) || 0)) + 1;
        return true;
    }
    /** getStaticTileSyncRevision：读取地块静态同步 revision。 */
    getStaticTileSyncRevision() {
        return Math.max(0, Math.trunc(Number(this.staticTileSyncRevision) || 0));
    }
    /** consumeStaticTileSyncDirtyTiles：消费当前实例级地块静态脏坐标，由网络层缓存本轮 plan。 */
    consumeStaticTileSyncDirtyTiles() {
        const toRevision = this.getStaticTileSyncRevision();
        if (!(this.staticTileSyncDirtyTileKeys instanceof Set) || this.staticTileSyncDirtyTileKeys.size === 0) {
            return { fromRevision: toRevision, toRevision, tileKeys: [] };
        }
        const fromRevision = Math.max(0, Math.trunc(Number(this.staticTileSyncDirtyFromRevision) || 0));
        const tileKeys = Array.from(this.staticTileSyncDirtyTileKeys);
        this.staticTileSyncDirtyTileKeys.clear();
        this.staticTileSyncDirtyFromRevision = toRevision;
        return { fromRevision, toRevision, tileKeys };
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
                this.recalculateFengShuiAfterRoomInfluenceChange(tileIndex, 'ground_item_changed');
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
        this.recalculateFengShuiAfterRoomInfluenceChange(tileIndex, 'ground_item_added');
        this.persistentRevision += 1;
        this.worldRevision += 1;
        return toGroundPileView(pile);
    }
    /** rollTileDrops：按 structure/terrain 分层耐久配置结算本次伤害和拆除掉落。 */
    rollTileDrops(tileState, appliedDamage, destroyed) {
        const config = resolveTileDurabilityProfile(tileState?.tileType, tileState);
        if (!config) {
            return [];
        }
        const drops = [];
        const damageMultiplier = resolveTileDamageDropMultiplier(appliedDamage);
        for (const entry of config.damageDrops ?? []) {
            const chanceBps = Math.max(0, Math.min(10000, Math.trunc(Number(entry?.chanceBps) || 0) * damageMultiplier));
            if (chanceBps > 0 && Math.random() * 10000 < chanceBps) {
                drops.push({ itemId: entry.itemId, count: Math.max(1, Math.trunc(Number(entry.count) || 1)), reason: 'damage' });
            }
        }
        if (destroyed === true) {
            for (const entry of config.destroyDrops ?? []) {
                drops.push({ itemId: entry.itemId, count: Math.max(1, Math.trunc(Number(entry.count) || 1)), reason: 'destroy' });
            }
        }
        return drops;
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
            // P0-4 entry cache 跟随 entity lifecycle 释放：地面物品堆被拾光时清理 view 条目，避免长期累积 frozen entry。
            this.localGroundPileViewCacheBySourceId.delete(buildGroundSourceId(tileIndex));
        }
        this.markGroundItemPersistenceDirty(tileIndex);
        this.recalculateFengShuiAfterRoomInfluenceChange(tileIndex, 'ground_item_taken');
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

        let movePoints = player.movePoints;

        let moved = false;

        let remainingSteps = Number.isFinite(maxSteps) ? Math.max(1, Math.min(20, Math.trunc(maxSteps))) : 20;

        const remainingPath = Array.isArray(path) && path.length > 0 ? path : null;
        let rechargedMoveBudget = false;
        let requiredMovePoints = 0;
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

                const resolvedDirection = directionFromTo(player.x, player.y, nextX, nextY);
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
            if (!rechargedMoveBudget) {
                requiredMovePoints = stepCost;
                movePoints = this.rechargePlayerMoveBudget(player, stepCost);
                rechargedMoveBudget = true;
            }
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
            if (nextOccupancy !== INVALID_OCCUPANCY && !this.isPlayerOverlapTile(nextX, nextY)) {
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
        player.movePoints = Math.min(getMaxStoredMovePoints(player.moveSpeed, requiredMovePoints), Math.max(0, Math.round(movePoints)));
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
    rechargePlayerMoveBudget(player, requiredMovePoints = 0) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const elapsed = Math.max(0, this.tick - (player.lastMoveBudgetTick ?? this.tick));
        if (elapsed > 0) {
            player.movePoints = Math.min(getMaxStoredMovePoints(player.moveSpeed, requiredMovePoints), Math.max(0, Math.round(player.movePoints + elapsed * getMovePointsPerTick(player.moveSpeed))));
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
        const tileIndex = this.toTileIndex(x, y);
        if (!this.isCellIndexWalkable(tileIndex)) {
            return Number.POSITIVE_INFINITY;
        }
        const movementCostOverride = this.template?.movementCostOverrideByTile?.[tileIndex] ?? 0;
        if (Number.isFinite(movementCostOverride) && movementCostOverride > 0) {
            return Math.max(1, Math.trunc(movementCostOverride));
        }
        if (this.tileDamageByTile.get(tileIndex)?.destroyed === true) {
            const destroyedState = this.getDestroyedTileLayerStateByCellIndex(tileIndex);
            return getLayeredTileTraversalCost(destroyedState.terrainType, destroyedState.surfaceType ?? null);
        }
        const state = typeof this.tilePlane.getTileLayerState === 'function'
            ? this.tilePlane.getTileLayerState(tileIndex)
            : null;
        if (state) {
            return getLayeredTileTraversalCost(state.terrain, state.surface ?? null);
        }
        return getTileTraversalCost(this.getEffectiveTileTypeByCellIndex(tileIndex));
    }
    /** getTileQiDrainPerTick：读取地块每息灵力消耗。 */
    getTileQiDrainPerTick(x, y) {
        if (!this.isInBounds(x, y)) {
            return 0;
        }
        const tileIndex = this.toTileIndex(x, y);
        const value = this.template?.qiDrainByTile?.[tileIndex] ?? 0;
        return Number.isFinite(value) && value > 0 ? Math.max(0, Math.trunc(value)) : 0;
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
            visiblePlayers.push(this.getLocalPlayerViewEntry(player));
        }
        return visiblePlayers;
    }
    /** collectLocalPortals：收集当前视野内可见传送点。 */
    collectLocalPortals(centerX, centerY, radius, visibleTileVisibility = null) {
        const visibility = this.normalizeVisibilityFilter(visibleTileVisibility);
        const portals = [];
        for (const portal of this.listAllPortals()) {
            if (portal.hidden
                || !this.isTileInsideViewRadius(centerX, centerY, radius, portal.x, portal.y)
                || !this.isTileVisibleByFilter(portal.x, portal.y, visibility)) {
                continue;
            }
            portals.push(this.getLocalPortalViewEntry(portal));
        }
        return portals;
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

            const view = this.getLocalGroundPileViewEntry(pile);
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
            containers.push(this.getLocalContainerViewEntry(container));
        }
        containers.sort(compareLocalContainers);
        return containers;
    }
    /** collectLocalBuildings：收集视野内未完工的半成品建筑。 */
    collectLocalBuildings(centerX, centerY, radius, visibleTileVisibility = null) {
        const visibility = this.normalizeVisibilityFilter(visibleTileVisibility);
        const buildings = [];
        for (const building of this.buildingById.values()) {
            if (building?.state !== 'building') {
                continue;
            }
            if (!this.isTileInsideViewRadius(centerX, centerY, radius, building.x, building.y)) {
                continue;
            }
            if (!this.isTileVisibleByFilter(building.x, building.y, visibility)) {
                continue;
            }
            const compiled = this.buildingCatalog?.defByHandle?.[building.defHandle] ?? this.buildingCatalog?.defById?.get?.(building.defId);
            buildings.push(this.getLocalBuildingViewEntry(building, compiled));
        }
        buildings.sort((left, right) => left.id.localeCompare(right.id, 'zh-CN'));
        return buildings;
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
            landmarks.push(this.getLocalLandmarkViewEntry(landmark));
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
            safeZones.push(this.getLocalSafeZoneViewEntry(zone));
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
            npcs.push(this.getLocalNpcViewEntry(npc));
        }
        npcs.sort(compareLocalNpcs);
        return npcs;
    }
    /** getLocalPlayerViewEntry：复用未变化的可见玩家视野条目。 */
    getLocalPlayerViewEntry(player) {
        const cached = this.localPlayerViewCacheByPlayerId.get(player.playerId);
        if (cached
            && cached.name === player.name
            && cached.displayName === player.displayName
            && cached.x === player.x
            && cached.y === player.y
            && cached.buffs === player.buffs) {
            return cached;
        }
        const entry = freezeRuntimeProjection({
            playerId: player.playerId,
            name: player.name,
            displayName: player.displayName,
            x: player.x,
            y: player.y,
            buffs: player.buffs,
        });
        this.localPlayerViewCacheByPlayerId.set(player.playerId, entry);
        return entry;
    }
    /** getLocalPortalViewEntry：复用未变化的传送点视野条目。 */
    getLocalPortalViewEntry(portal) {
        const cacheKey = portal.id ?? `${portal.kind}:${portal.x},${portal.y}:${portal.targetMapId ?? ''}:${portal.targetPortalId ?? ''}`;
        const cached = this.localPortalViewCacheById.get(cacheKey);
        if (cached
            && cached.x === portal.x
            && cached.y === portal.y
            && cached.id === portal.id
            && cached.kind === portal.kind
            && cached.trigger === portal.trigger
            && cached.direction === (portal.direction ?? 'two_way')
            && cached.targetMapId === portal.targetMapId
            && cached.targetInstanceId === (portal.targetInstanceId ?? null)
            && cached.targetPortalId === portal.targetPortalId
            && cached.targetX === portal.targetX
            && cached.targetY === portal.targetY
            && cached.name === portal.name
            && cached.char === portal.char
            && cached.color === portal.color
            && cached.sectId === portal.sectId) {
            return cached;
        }
        const entry = freezeRuntimeProjection({
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
        });
        this.localPortalViewCacheById.set(cacheKey, entry);
        return entry;
    }
    /** getLocalGroundPileViewEntry：复用未变化的地面物品堆视野条目。 */
    getLocalGroundPileViewEntry(pile) {
        const view = toGroundPileView(pile);
        if (!view) {
            return null;
        }
        const cached = this.localGroundPileViewCacheBySourceId.get(view.sourceId);
        if (cached && isSameGroundPileView(cached, view)) {
            return cached;
        }
        freezeRuntimeProjection(view.items);
        const entry = freezeRuntimeProjection(view);
        this.localGroundPileViewCacheBySourceId.set(view.sourceId, entry);
        return entry;
    }
    /** getLocalContainerViewEntry：复用未变化的容器视野条目。 */
    getLocalContainerViewEntry(container) {
        const cached = this.localContainerViewCacheById.get(container.id);
        const char = container.char ?? '箱';
        const color = container.color ?? '#c18b46';
        if (cached
            && cached.name === container.name
            && cached.x === container.x
            && cached.y === container.y
            && cached.char === char
            && cached.color === color
            && cached.grade === container.grade) {
            return cached;
        }
        const entry = freezeRuntimeProjection({
            id: container.id,
            name: container.name,
            x: container.x,
            y: container.y,
            char,
            color,
            grade: container.grade,
        });
        this.localContainerViewCacheById.set(container.id, entry);
        return entry;
    }
    /** getLocalBuildingViewEntry：复用未变化的建筑视野条目。 */
    getLocalBuildingViewEntry(building, compiled) {
        const remainingTicks = resolveBuildingRemainingTicks(building);
        const totalTicks = Math.max(remainingTicks, Math.trunc(Number(building.buildStrength) || 1), 1);
        const char = typeof compiled?.glyph === 'string' && compiled.glyph.trim()
            ? compiled.glyph.trim()[0] ?? '筑'
            : (compiled?.name?.trim()?.[0] ?? '筑');
        const color = typeof compiled?.color === 'string' && compiled.color.trim()
            ? compiled.color.trim()
            : '#cbd5e1';
        const name = compiled?.name ?? building.defId;
        const cached = this.localBuildingViewCacheById.get(building.id);
        if (cached
            && cached.x === building.x
            && cached.y === building.y
            && cached.name === name
            && cached.char === char
            && cached.color === color
            && cached.remainingTicks === remainingTicks
            && cached.totalTicks === totalTicks) {
            return cached;
        }
        const entry = freezeRuntimeProjection({
            id: building.id,
            x: building.x,
            y: building.y,
            name,
            char,
            color,
            remainingTicks,
            totalTicks,
        });
        this.localBuildingViewCacheById.set(building.id, entry);
        return entry;
    }
    /** getLocalLandmarkViewEntry：复用未变化的地标视野条目。 */
    getLocalLandmarkViewEntry(landmark) {
        const cached = this.localLandmarkViewCacheById.get(landmark.id);
        const hasContainer = landmark.container !== undefined;
        if (cached
            && cached.name === landmark.name
            && cached.x === landmark.x
            && cached.y === landmark.y
            && cached.hasContainer === hasContainer) {
            return cached;
        }
        const entry = freezeRuntimeProjection({
            id: landmark.id,
            name: landmark.name,
            x: landmark.x,
            y: landmark.y,
            hasContainer,
        });
        this.localLandmarkViewCacheById.set(landmark.id, entry);
        return entry;
    }
    /** getLocalSafeZoneViewEntry：复用未变化的安全区视野条目。 */
    getLocalSafeZoneViewEntry(zone) {
        const cacheKey = `${zone.x},${zone.y},${zone.radius}`;
        const cached = this.localSafeZoneViewCacheByKey.get(cacheKey);
        if (cached) {
            return cached;
        }
        const entry = freezeRuntimeProjection(snapshotSafeZone(zone));
        this.localSafeZoneViewCacheByKey.set(cacheKey, entry);
        return entry;
    }
    /** getLocalNpcViewEntry：复用未变化的 NPC 视野条目。 */
    getLocalNpcViewEntry(npc) {
        const cached = this.localNpcViewCacheById.get(npc.npcId);
        if (cached
            && cached.name === npc.name
            && cached.char === npc.char
            && cached.color === npc.color
            && cached.x === npc.x
            && cached.y === npc.y
            && cached.hasShop === npc.hasShop) {
            return cached;
        }
        const entry = freezeRuntimeProjection({
            npcId: npc.npcId,
            name: npc.name,
            char: npc.char,
            color: npc.color,
            x: npc.x,
            y: npc.y,
            hasShop: npc.hasShop,
        });
        this.localNpcViewCacheById.set(npc.npcId, entry);
        return entry;
    }
    /** collectLocalMonsters：收集当前视野内可见妖兽。 */
    collectLocalMonsters(centerX, centerY, radius, visibleTileVisibility = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const visibility = this.normalizeVisibilityFilter(visibleTileVisibility);
        const monsters = [];
        for (const monster of this.monstersByRuntimeId.values()) {
            if (!monster.alive) {
                this.localMonsterViewCacheByRuntimeId.delete(monster.runtimeId);
                continue;
            }
            if (!this.isTileInsideViewRadius(centerX, centerY, radius, monster.x, monster.y)) {
                continue;
            }
            if (!this.isTileVisibleByFilter(monster.x, monster.y, visibility)) {
                continue;
            }
            monsters.push(this.getLocalMonsterViewEntry(monster));
        }
        monsters.sort(compareLocalMonsters);
        return monsters;
    }
    /** getLocalMonsterViewEntry：复用未变化的本地妖兽视野条目。 */
    getLocalMonsterViewEntry(monster) {
        const cached = this.localMonsterViewCacheByRuntimeId.get(monster.runtimeId);
        if (cached
            && cached.monsterId === monster.monsterId
            && cached.name === monster.name
            && cached.char === monster.char
            && cached.color === monster.color
            && cached.tier === monster.tier
            && cached.x === monster.x
            && cached.y === monster.y
            && cached.hp === monster.hp
            && cached.maxHp === monster.maxHp
            && cached.qi === monster.qi
            && cached.maxQi === monster.maxQi) {
            return cached;
        }
        const entry = {
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
            qi: monster.qi,
            maxQi: monster.maxQi,
        };
        freezeRuntimeProjection(entry);
        this.localMonsterViewCacheByRuntimeId.set(monster.runtimeId, entry);
        return entry;
    }
    /** advanceMonsters：推进妖兽 AI 和行动。 */
    advanceMonsters(monsterActions, precomputedIntents = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        // Phase 4: 构建 worker 预计算 intent 索引，用于加速 target 解析
        const intentByMonsterId = precomputedIntents
            ? new Map(precomputedIntents.map((intent) => [intent.monsterId, intent]))
            : null;

        let changed = false;
        for (const monster of this.monstersByRuntimeId.values()) {
            if (!monster.alive) {
                if (monster.pendingCast) {
                    const cancelledPendingCast = cancelPendingCombatCast(monster.pendingCast, {
                        reason: CombatPendingCastCancelReason.ActorDead,
                        cancelledTick: this.tick,
                    });
                    monsterActions.push(createMonsterSkillCancelActionFromPendingCast(cancelledPendingCast, {
                        instanceId: this.meta.instanceId,
                        runtimeId: monster.runtimeId,
                    }));
                    monster.pendingCast = undefined;
                }
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
            changed = recoverMonsterHp(monster) || recoverMonsterQi(monster) || changed;

            if (monster.pendingCast) {
                const pendingSkill = monster.skills.find((entry) => entry.id === (monster.pendingCast.actionId ?? monster.pendingCast.skillId));
                const cancelledPendingCast = resolvePendingCombatCastCancellation(monster.pendingCast, {
                    actorAlive: monster.alive,
                    currentTick: this.tick,
                    configRevision: pendingSkill?.version ?? pendingSkill?.revision,
                });
                if (cancelledPendingCast) {
                    monsterActions.push(createMonsterSkillCancelActionFromPendingCast(cancelledPendingCast, {
                        instanceId: this.meta.instanceId,
                        runtimeId: monster.runtimeId,
                    }));
                    monster.pendingCast = undefined;
                    continue;
                }
                monster.pendingCast.remainingTicks = Math.max(0, Math.trunc(Number(monster.pendingCast.remainingTicks) || 0) - 1);
                if (monster.pendingCast.remainingTicks > 0) {
                    continue;
                }
                const pendingCast = monster.pendingCast;
                monster.pendingCast = undefined;
                const pendingTarget = this.playersById.get(pendingCast.targetPlayerId);
                monsterActions.push(createMonsterSkillActionFromPendingCast(pendingCast, {
                    instanceId: this.meta.instanceId,
                    runtimeId: monster.runtimeId,
                    targetPlayerId: pendingTarget?.playerId ?? pendingCast.targetPlayerId,
                }));
                continue;
            }

            // Phase 4: 使用 worker 预计算 intent 作为 target hint 加速解析
            const preIntent = intentByMonsterId?.get(String(monster.runtimeId ?? monster.monsterId ?? ''));
            const target = this.resolveMonsterTargetWithHint(monster, preIntent);
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

            const skill = chooseMonsterSkill(monster, target, distance, this.tick);
            if (skill) {
                const committedSkillCast = commitMonsterSkillCast(monster, skill, this.tick);
                if (!committedSkillCast.ok) {
                    continue;
                }
                this.markMonsterRuntimePersistenceDirty(monster.runtimeId);
                changed = true;
                const windupTicks = getMonsterSkillWindupTicks(skill);
                if (windupTicks > 0) {
                    const warningCells = buildMonsterSkillAffectedCells(monster, skill, { x: target.x, y: target.y });
                    if (warningCells.length > 0) {
                        const geometry = buildEffectiveMonsterSkillGeometry(monster, skill);
                        const warningOrigin = (geometry.shape ?? 'single') === 'line'
                            ? { x: monster.x, y: monster.y }
                            : { x: target.x, y: target.y };
                        monster.facing = resolveFacingToward(monster.x, monster.y, target.x, target.y);
                        monster.pendingCast = createMonsterPendingCombatCast({
                            runtimeId: monster.runtimeId,
                            instanceId: this.meta.instanceId,
                            skillId: skill.id,
                            targetPlayerId: target.playerId,
                            anchor: { x: target.x, y: target.y },
                            warningCells,
                            warningOrigin,
                            remainingTicks: windupTicks,
                            warningColor: getMonsterSkillWarningColor(skill),
                            startedTick: this.tick,
                            resolveTick: this.tick + windupTicks,
                            committedCooldownSnapshot: {
                                actionId: skill.id,
                                readyTick: committedSkillCast.cooldownReadyTick,
                            },
                            committedResourceSnapshot: {
                                kind: 'qi',
                                spent: committedSkillCast.qiCost,
                            },
                            configRevision: skill.version ?? skill.revision,
                        });
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
    findSpawnPoint(preferredX, preferredY, playerId = null) {
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
            const resolved = this.findNearestOpenTile(candidate.x, candidate.y, playerId);
            if (resolved) {
                return resolved;
            }
        }
        return null;
    }
    /** findNearestOpenTile：查找最近的可占用地块。 */
    findNearestOpenTile(originX, originY, playerId = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (this.isOpenTile(originX, originY, playerId)) {
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
                    if (this.isOpenTile(x, y, playerId)) {
                        return { x, y };
                    }
                }
            }
        }
        return null;
    }
    /** isOpenTile：判断地块是否可占用。 */
    isOpenTile(x, y, playerId = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isWalkable(x, y, playerId)) {
            return false;
        }

        const tileIndex = this.toTileIndex(x, y);
        if (this.npcIdByTile.has(tileIndex)) {
            return false;
        }
        if (this.monsterRuntimeIdByTile.has(tileIndex)) {
            return false;
        }
        if (this.occupancy[tileIndex] !== INVALID_OCCUPANCY && !this.isPlayerOverlapTile(x, y)) {
            return false;
        }
        return true;
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
        return this.isCellIndexWalkable(this.toTileIndex(x, y));
    }
    /** isCellIndexWalkable：按预合成 flags 判断静态通行，摧毁/临时地块按有效投影兜底。 */
    isCellIndexWalkable(cellIndexInput) {
        const cellIndex = Math.trunc(Number(cellIndexInput));
        if (!Number.isFinite(cellIndex) || cellIndex < 0 || cellIndex >= this.tilePlane.getCellCount()) {
            return false;
        }
        if (this.temporaryTileByTile.has(cellIndex) || this.tileDamageByTile.get(cellIndex)?.destroyed === true) {
            return isTileTypeWalkable(this.getEffectiveTileTypeByCellIndex(cellIndex));
        }
        return typeof this.tilePlane.isWalkable === 'function'
            ? this.tilePlane.isWalkable(cellIndex)
            : isTileTypeWalkable(this.getEffectiveTileTypeByCellIndex(cellIndex));
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
            console.warn(`[MapInstance] isDynamicallyBlockedTile 异常 x=${x} y=${y}`, _error instanceof Error ? _error.message : _error);
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
            console.warn(`[MapInstance] resolveCompositeSightBlocked 异常 x=${x} y=${y}`, _error instanceof Error ? _error.message : _error);
            return null;
        }
    }
    /** canResolveSightCoordinate：判断坐标是否存在可用于视野计算的地块。 */
    canResolveSightCoordinate(x, y) {
        return this.isInBounds(x, y) || this.isSectVirtualBoundaryTile(x, y) || this.resolveCompositeSightBlocked(x, y) !== null;
    }
    /** isTileSightBlocked：判断地块是否阻挡视线。动态阵法边界只挡通行，不挡视线。 */
    isTileSightBlocked(x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isInBounds(x, y)) {
            if (this.isSectVirtualBoundaryTile(x, y)) {
                return true;
            }
            const compositeBlocked = this.resolveCompositeSightBlocked(x, y);
            return compositeBlocked === null ? true : compositeBlocked;
        }
        const tileIndex = this.toTileIndex(x, y);
        if (this.temporaryTileByTile.has(tileIndex) || this.tileDamageByTile.get(tileIndex)?.destroyed === true) {
            return doesTileTypeBlockSight(this.getEffectiveTileTypeByCellIndex(tileIndex));
        }
        return typeof this.tilePlane.blocksSight === 'function'
            ? this.tilePlane.blocksSight(tileIndex)
            : doesTileTypeBlockSight(this.getEffectiveTileTypeByCellIndex(tileIndex));
    }
    /** canSeeTileFrom：判断 origin 在指定半径内是否能看见目标地块。 */
    canSeeTileFrom(originX, originY, targetX, targetY, radius) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isInBounds(originX, originY) || (!this.isInBounds(targetX, targetY) && !this.isSectVirtualBoundaryTile(targetX, targetY))) {
            return false;
        }
        const normalizedRadius = Math.max(0, Math.trunc(Number(radius) || 0));
        if (chebyshevDistance(originX, originY, targetX, targetY) > normalizedRadius) {
            return false;
        }
        const visibility = this.collectVisibleTileVisibility(originX, originY, normalizedRadius);
        return visibility.keys.has(`${Math.trunc(Number(targetX))},${Math.trunc(Number(targetY))}`);
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
                if (isOffsetInRange(deltaX, deltaY, radius) && this.canResolveSightCoordinate(currentX, currentY)) {
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
                if (!isOffsetInRange(x - centerX, y - centerY, radius)) {
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
    /** getOrCreateTileResourceFlowRemainderBucket：读取或创建地块气机流转余数桶。 */
    getOrCreateTileResourceFlowRemainderBucket(resourceKey) {
        const existing = this.tileResourceFlowRemainderBuckets.get(resourceKey);
        if (existing) {
            return existing;
        }
        const bucket = new Float64Array(Math.max(this.tilePlane.getCellCapacity(), this.occupancy.length));
        this.tileResourceFlowRemainderBuckets.set(resourceKey, bucket);
        return bucket;
    }
    /** updateTileResourceFlowIndex：维护需要自然流转的地块索引集合。 */
    updateTileResourceFlowIndex(resourceKey, tileIndex, value = this.getTileResourceValueByIndex(resourceKey, tileIndex)) {
        if (!isNaturalAuraFlowResource(resourceKey) || !Number.isFinite(Number(tileIndex))) {
            return;
        }
        const normalizedTileIndex = Math.max(0, Math.trunc(Number(tileIndex)));
        const current = Math.max(0, Math.trunc(Number(value) || 0));
        const base = Math.max(0, Math.trunc(Number(this.getTileResourceBaseValueByIndex(resourceKey, normalizedTileIndex)) || 0));
        let tileIndices = this.tileResourceFlowIndicesByKey.get(resourceKey);
        if (current === base) {
            if (tileIndices instanceof Set) {
                tileIndices.delete(normalizedTileIndex);
                if (tileIndices.size <= 0) {
                    this.tileResourceFlowIndicesByKey.delete(resourceKey);
                }
            }
            return;
        }
        if (!(tileIndices instanceof Set)) {
            tileIndices = new Set();
            this.tileResourceFlowIndicesByKey.set(resourceKey, tileIndices);
        }
        tileIndices.add(normalizedTileIndex);
    }
    /** rebuildTileResourceFlowIndices：从当前资源桶重建自然流转索引。 */
    rebuildTileResourceFlowIndices() {
        this.tileResourceFlowIndicesByKey.clear();
        for (const [resourceKey, bucket] of this.tileResourceBuckets.entries()) {
            if (!isNaturalAuraFlowResource(resourceKey)) {
                continue;
            }
            const baseBucket = this.baseTileResourceBuckets.get(resourceKey);
            for (let tileIndex = 0; tileIndex < bucket.length; tileIndex += 1) {
                const current = Math.max(0, Math.trunc(Number(bucket[tileIndex]) || 0));
                const base = Math.max(0, Math.trunc(Number(baseBucket?.[tileIndex]) || 0));
                if (current !== base) {
                    this.updateTileResourceFlowIndex(resourceKey, tileIndex, current);
                }
            }
        }
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
        this.updateTileResourceFlowIndex(resourceKey, tileIndex, next);
        if (resourceKey !== DEFAULT_TILE_AURA_RESOURCE_KEY && (this.changedTileResourceEntryCountByKey.get(resourceKey) ?? 0) <= 0) {
            this.tileResourceBuckets.delete(resourceKey);
        }
        this.markTileResourcePersistenceDirty(resourceKey, tileIndex);
        this.recalculateFengShuiAfterRoomInfluenceChange(tileIndex, 'tile_resource_changed');
        this.persistentRevision += 1;
    }
    /** ensureCellStorageCapacity：保证按 cell index 寻址的运行时列容量足够。 */
    ensureCellStorageCapacity(required) {
        const normalizedRequired = Math.max(0, Math.trunc(Number(required) || 0));
        if (normalizedRequired <= this.occupancy.length) {
            return;
        }
        const nextCapacity = nextPowerOfTwo(normalizedRequired);
        this.buildingTopologyIndex?.ensureCapacity?.(nextCapacity);
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
        for (const [resourceKey, bucket] of Array.from(this.tileResourceFlowRemainderBuckets.entries())) {
            if (bucket.length >= nextCapacity) {
                continue;
            }
            const nextBucket = new Float64Array(nextCapacity);
            nextBucket.set(bucket);
            this.tileResourceFlowRemainderBuckets.set(resourceKey, nextBucket);
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
    /** isSectVirtualBoundaryTile：宗门模板外紧邻已定义地块的未定义坐标按边界石头投影。 */
    isSectVirtualBoundaryTile(x, y) {
        if (this.template?.source?.sectMap !== true) {
            return false;
        }
        const tx = Math.trunc(Number(x));
        const ty = Math.trunc(Number(y));
        if (!Number.isFinite(tx) || !Number.isFinite(ty) || this.tilePlane.getCellIndex(tx, ty) >= 0) {
            return false;
        }
        for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
                if (dx === 0 && dy === 0) {
                    continue;
                }
                if (this.tilePlane.getCellIndex(tx + dx, ty + dy) >= 0) {
                    return true;
                }
            }
        }
        return false;
    }
    /** isSectRuntimeExpandedBoundaryStone：宗门模板外已激活的边界石，打穿后应变成地板而不是复生石头。 */
    isSectRuntimeExpandedBoundaryStone(tileIndex, combatState = null) {
        if (this.template?.source?.sectMap !== true || !Number.isFinite(Number(tileIndex))) {
            return false;
        }
        const normalizedTileIndex = Math.trunc(Number(tileIndex));
        if (normalizedTileIndex < 0 || normalizedTileIndex >= this.tilePlane.getCellCount()) {
            return false;
        }
        const x = this.tilePlane.getX(normalizedTileIndex);
        const y = this.tilePlane.getY(normalizedTileIndex);
        if (x >= 0 && y >= 0 && x < this.template.width && y < this.template.height) {
            return false;
        }
        const layerState = typeof this.tilePlane.getTileLayerState === 'function'
            ? this.tilePlane.getTileLayerState(normalizedTileIndex)
            : null;
        return (combatState?.tileType ?? this.tilePlane.getTileType(normalizedTileIndex)) === TileType.Stone
            && (layerState?.structure ?? null) === StructureType.Stone;
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
        monster.qi = 0;
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
        applyMonsterInitialBuffs(monster, this.buffRegistry);
        /** recalculateMonsterDerivedState：重算妖兽派生状态。 */
        recalculateMonsterDerivedState(monster);
        monster.hp = monster.maxHp;
        monster.qi = monster.maxQi;
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
    /**
     * Phase 4: 使用 worker 预计算 intent 作为 target hint 加速解析。
     * 如果 hint 指向的玩家仍然有效（存活、在范围内、在视线内），直接使用；
     * 否则 fallback 到完整的 resolveMonsterTarget 扫描。
     */
    resolveMonsterTargetWithHint(monster, preIntent) {
        if (!preIntent || preIntent.action !== 'attack' || !preIntent.targetId) {
            return this.resolveMonsterTarget(monster);
        }
        // hint 指向一个具体玩家，快速验证其有效性
        const hintPlayer = this.playersById.get(preIntent.targetId);
        if (!hintPlayer) {
            return this.resolveMonsterTarget(monster);
        }
        const aggroRange = Math.max(0, Math.trunc(Number(monster.aggroRange) || 0));
        if (chebyshevDistance(monster.spawnX, monster.spawnY, hintPlayer.x, hintPlayer.y) > monster.leashRange) {
            return this.resolveMonsterTarget(monster);
        }
        if (chebyshevDistance(monster.x, monster.y, hintPlayer.x, hintPlayer.y) > aggroRange) {
            return this.resolveMonsterTarget(monster);
        }
        // 验证视线（使用 tile index 检查）
        const visibleTileIndices = this.collectVisibleTileIndices(monster.x, monster.y, aggroRange);
        if (!visibleTileIndices.has(this.toTileIndex(hintPlayer.x, hintPlayer.y))) {
            return this.resolveMonsterTarget(monster);
        }
        // hint 有效，直接使用
        this.rememberMonsterTargetSight(monster, hintPlayer);
        return hintPlayer;
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
    /** clearMonsterAggroForPlayer：清除所有以指定玩家为仇恨目标的妖兽仇恨。 */
    clearMonsterAggroForPlayer(playerId: string) {
        for (const monster of this.monstersByRuntimeId.values()) {
            if (monster.aggroTargetPlayerId === playerId) {
                this.clearMonsterTargetPursuit(monster);
            }
        }
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
        return isOffsetInRange(x - monster.spawnX, y - monster.spawnY, radius);
    }
    /** stepMonsterIdleRoam：让无目标妖兽在活动范围内随机闲逛一步。 */
    stepMonsterIdleRoam(monster) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const radius = Math.max(0, Math.trunc(Number(monster.wanderRadius) || 0));
        if (radius <= 0) {
            return false;
        }
        const directions = [
            { dx: 1, dy: 0, facing: Direction.East },
            { dx: -1, dy: 0, facing: Direction.West },
            { dx: 0, dy: 1, facing: Direction.South },
            { dx: 0, dy: -1, facing: Direction.North },
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

    return Math.max(1, Math.ceil(TERRAIN_DESTROYED_RESTORE_TICKS / getTileRestoreSpeedMultiplier(tileType)));
}
/** calculateTileRestoreRetryTicks：按 main 口径计算复生受阻后的重试时间。 */
function calculateTileRestoreRetryTicks(tileType) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    return Math.max(1, Math.ceil(TERRAIN_RESTORE_RETRY_DELAY_TICKS / getTileRestoreSpeedMultiplier(tileType)));
}
/** normalizeTileRestoreTicksLeft：恢复持久化地块复生倒计时。 */
function normalizeTileRestoreTicksLeft(value, tileType) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalized = Math.trunc(Number(value));
    return Number.isFinite(normalized) && normalized > 0 ? normalized : calculateTileRestoreTicks(tileType);
}
/** resolveTileDurabilityProfile：解析分层耐久配置，structure 优先，terrain 仅处理真正地形层。 */
function resolveTileDurabilityProfile(tileType, layerState = null) {
    const structureProfile = getStructureDurabilityProfile(layerState?.structure ?? layerState?.structureType ?? null);
    if (structureProfile) {
        return structureProfile;
    }
    return DEFAULT_TERRAIN_DURABILITY_BY_TILE[tileType] ?? null;
}
/** resolveTileDurability：解析地形/结构耐久配置。 */
function resolveTileDurability(template, tileType, x = null, y = null, layerState = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const profile = resolveTileDurabilityProfile(tileType, layerState);
    if (!profile) {
        return 0;
    }

    if (template?.source?.sectMap === true && (layerState?.structure ?? layerState?.structureType ?? null) === StructureType.Stone) {
        const centerX = Number.isFinite(Number(template.source.sectCoreX)) ? Math.trunc(Number(template.source.sectCoreX)) : Math.trunc(template.width / 2);
        const centerY = Number.isFinite(Number(template.source.sectCoreY)) ? Math.trunc(Number(template.source.sectCoreY)) : Math.trunc(template.height / 2);
        const dx = Number.isFinite(Number(x)) ? Math.abs(Math.trunc(Number(x)) - centerX) : 1;
        const dy = Number.isFinite(Number(y)) ? Math.abs(Math.trunc(Number(y)) - centerY) : 1;
        const ring = Math.max(1, dx, dy);
        return Math.max(1, Math.trunc(100000 * Math.pow(2, Math.max(0, ring - 1))));
    }

    const mapLv = Number.isFinite(template.source?.mapLv)
        ? Math.max(1, Math.floor(Number(template.source.mapLv)))
        : 1;
    return calculateTerrainDurability(mapLv, profile.multiplier);
}
/** clampCoordinate：把坐标夹到地图边界内。 */
function clampCoordinate(value, size) {
    return Math.max(0, Math.min(size - 1, Math.trunc(value)));
}

/** DIRECTION_OFFSET：DIRECTIONOFFSET。 */
const DIRECTION_OFFSET = {
    [Direction.North]: { x: 0, y: -1 },
    [Direction.South]: { x: 0, y: 1 },
    [Direction.East]: { x: 1, y: 0 },
    [Direction.West]: { x: -1, y: 0 },
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
function freezeRuntimeProjection(entry) {
    if (entry && process.env.NODE_ENV !== 'production') {
        Object.freeze(entry);
    }
    return entry;
}
function isSameGroundPileView(left, right) {
    if (left === right) {
        return true;
    }
    if (!left || !right || left.x !== right.x || left.y !== right.y || left.items.length !== right.items.length) {
        return false;
    }
    for (let index = 0; index < left.items.length; index += 1) {
        const leftItem = left.items[index];
        const rightItem = right.items[index];
        if (leftItem.itemKey !== rightItem.itemKey
            || leftItem.itemId !== rightItem.itemId
            || leftItem.name !== rightItem.name
            || leftItem.type !== rightItem.type
            || leftItem.count !== rightItem.count
            || leftItem.grade !== rightItem.grade
            || leftItem.groundLabel !== rightItem.groundLabel) {
            return false;
        }
    }
    return true;
}
/** normalizePersistedGroundItem：规范化持久化地面物品条目。 */
function normalizePersistedGroundItem(item) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!item || typeof item !== 'object' || typeof item.itemId !== 'string' || !item.itemId.trim()) {
        return null;
    }

    item.itemId = item.itemId.trim();
    item.count = Number.isFinite(Number(item.count)) ? Math.max(1, Math.trunc(Number(item.count))) : 1;
    return item;
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
    return source;
}
/** snapshotContainer：快照容器。 */
function snapshotContainer(source) {
    return source;
}
/** snapshotLandmark：快照地标。 */
function snapshotLandmark(source) {
    return source;
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
        sourceId: source.sourceId,
        x: source.x,
        y: source.y,
        items: source.items.map((entry) => ({
            itemKey: entry.itemKey,
            item: entry.item,
        })),
    };
}
/** snapshotMonster：快照妖兽。 */
function snapshotMonster(source) {
    return {
        ...source,
        baseAttrs: source.baseAttrs,
        attrs: source.attrs,
        baseNumericStats: source.baseNumericStats,
        numericStats: source.numericStats,
        ratioDivisors: source.ratioDivisors,
        statFormula: source.statFormula,
        buffs: source.buffs,
        skills: source.skills,
        cooldownReadyTickBySkillId: source.cooldownReadyTickBySkillId,
        damageContributors: source.damageContributors,
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
        antiCrit: source.antiCrit,
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
/** recalculateMonsterBaseStatsFromFormula：按当前等级/血脉重算妖兽基础属性。 */
function recalculateMonsterBaseStatsFromFormula(monster) {
    const formula = monster.statFormula;
    if (!formula?.raw) {
        return false;
    }
    const formulaRaw = formula.raw;
    const raw = {
        ...formulaRaw,
        level: Math.max(1, Math.trunc(Number(monster.level) || Number(formulaRaw.level) || 1)),
    };
    if (typeof monster.tier === 'string' && monster.tier.trim()) {
        raw.tier = monster.tier.trim();
    }
    const resolved = resolveMonsterTemplateRecord(raw, undefined, formula.baselines);
    monster.level = resolved.level ?? raw.level;
    monster.tier = resolved.tier;
    monster.expMultiplier = resolved.expMultiplier;
    monster.baseAttrs = cloneAttributes(resolved.resolvedAttrs);
    monster.baseNumericStats = cloneNumericStats(resolved.computedStats);
    recalculateMonsterDerivedState(monster);
    return true;
}
/** applyMonsterInitialBuffs：按模板给妖兽重建出生自带 Buff。 */
function applyMonsterInitialBuffs(monster, buffRegistry = null) {
    monster.buffs.length = 0;
    ensureMonsterInitialBuffs(monster, buffRegistry);
}
/** ensureMonsterInitialBuffs：补齐或刷新妖兽模板要求的出生 Buff，不覆盖战斗临时 Buff。 */
function ensureMonsterInitialBuffs(monster, buffRegistry = null) {
    for (const effect of monster.initialBuffs ?? []) {
        const buff = buffRegistry
            ? buffRegistry.createInstanceFromTemplate(effect, buildMonsterInitialBuffState(monster, effect))
            : createRuntimeTemporaryBuff(buildMonsterInitialBuffState(monster, effect));
        if (buff.remainingTicks <= 0 || buff.stacks <= 0) {
            continue;
        }
        const existing = monster.buffs.find((entry) => entry.buffId === buff.buffId);
        if (existing) {
            Object.assign(existing, buff);
        }
        else {
            monster.buffs.push(buff);
        }
    }
    monster.buffs.sort((left, right) => left.buffId.localeCompare(right.buffId, 'zh-Hans-CN'));
}
/** buildMonsterInitialBuffState：把内容配置转换为运行时 Buff 状态。 */
function buildMonsterInitialBuffState(monster, effect) {
    const maxStacks = Math.max(1, Math.trunc(Number(effect.maxStacks) || 1));
    const duration = Math.max(1, Math.trunc(Number(effect.duration) || 1));
    const infiniteDuration = effect.infiniteDuration === true;
    const stacks = Math.min(maxStacks, Math.max(1, Math.trunc(Number(effect.stacks) || 1)));
    const name = typeof effect.name === 'string' && effect.name.trim() ? effect.name.trim() : effect.buffId;
    const shortMark = typeof effect.shortMark === 'string' && effect.shortMark.trim()
        ? String(Array.from(effect.shortMark.trim())[0] ?? '气')
        : String(Array.from(name)[0] ?? '气');
    return {
        buffId: effect.buffId,
        name,
        desc: typeof effect.desc === 'string' ? effect.desc : undefined,
        baseDesc: typeof effect.desc === 'string' ? effect.desc : undefined,
        shortMark,
        category: effect.category === 'debuff' ? 'debuff' : 'buff',
        visibility: effect.visibility === 'observe_only' || effect.visibility === 'hidden' ? effect.visibility : 'public',
        remainingTicks: infiniteDuration ? 1 : duration + 1,
        duration,
        stacks,
        maxStacks,
        sourceSkillId: `monster-initial:${monster.monsterId}:${effect.buffId}`,
        sourceSkillName: `${monster.name}·先天妖势`,
        realmLv: Math.max(1, Math.floor(monster.level ?? 1)),
        color: typeof effect.color === 'string' ? effect.color : undefined,
        attrs: effect.attrs ? { ...effect.attrs } : undefined,
        attrMode: effect.attrMode,
        stats: effect.stats ? { ...effect.stats } : undefined,
        statMode: effect.statMode,
        qiProjection: effect.qiProjection ? effect.qiProjection.map((entry) => ({ ...entry })) : undefined,
        presentationScale: Number.isFinite(effect.presentationScale) && Number(effect.presentationScale) > 0
            ? Number(effect.presentationScale)
            : undefined,
        infiniteDuration,
        sustainCost: effect.sustainCost,
        sustainTicksElapsed: effect.sustainCost ? 0 : undefined,
        expireWithBuffId: typeof effect.expireWithBuffId === 'string' && effect.expireWithBuffId.trim()
            ? effect.expireWithBuffId.trim()
            : undefined,
        persistOnDeath: effect.persistOnDeath === true,
        persistOnReturnToSpawn: effect.persistOnReturnToSpawn === true,
    };
}
/** tickTemporaryBuffs：推进临时 Buff 计时。 */
function tickTemporaryBuffs(buffs) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    let changed = false;
    for (const buff of buffs) {
        if (buff.infiniteDuration === true) {
            continue;
        }
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
/** createEmptyAttributes：创建全零六维属性修饰桶。 */
function createEmptyAttributes() {
    return {
        constitution: 0,
        spirit: 0,
        perception: 0,
        talent: 0,
        strength: 0,
        meridians: 0,
    };
}
/** addAttributeModifiers：叠加六维属性修饰。 */
function addAttributeModifiers(target, patch, factor) {
    target.constitution += (patch.constitution ?? 0) * factor;
    target.spirit += (patch.spirit ?? 0) * factor;
    target.perception += (patch.perception ?? 0) * factor;
    target.talent += (patch.talent ?? 0) * factor;
    target.strength += (patch.strength ?? patch.comprehension ?? 0) * factor;
    target.meridians += (patch.meridians ?? patch.luck ?? 0) * factor;
}
/** applyAttributePercentModifiers：把百分比属性修饰应用到当前属性。 */
function applyAttributePercentModifiers(target, modifiers) {
    target.constitution *= percentModifierToMultiplier(modifiers.constitution);
    target.spirit *= percentModifierToMultiplier(modifiers.spirit);
    target.perception *= percentModifierToMultiplier(modifiers.perception);
    target.talent *= percentModifierToMultiplier(modifiers.talent);
    target.strength *= percentModifierToMultiplier(modifiers.strength);
    target.meridians *= percentModifierToMultiplier(modifiers.meridians);
}
/** addNumericStatModifiers：叠加数值属性修饰。 */
function addNumericStatModifiers(target, patch, factor) {
    for (const [key, value] of Object.entries(patch)) {
        if (typeof value === 'number') {
            target[key] = (target[key] ?? 0) + value * factor;
            continue;
        }
        if (value && typeof value === 'object') {
            const targetGroup = target[key] ?? {};
            target[key] = targetGroup;
            for (const [groupKey, groupValue] of Object.entries(value)) {
                if (typeof groupValue === 'number') {
                    targetGroup[groupKey] = (targetGroup[groupKey] ?? 0) + groupValue * factor;
                }
            }
        }
    }
}
/** applyNumericStatPercentModifiers：按百分比乘区应用数值属性修饰。 */
function applyNumericStatPercentModifiers(target, modifiers) {
    for (const [key, value] of Object.entries(modifiers)) {
        if (typeof value === 'number') {
            target[key] = (target[key] ?? 0) * percentModifierToMultiplier(value);
            continue;
        }
        if (value && typeof value === 'object') {
            const targetGroup = target[key] ?? {};
            target[key] = targetGroup;
            for (const [groupKey, groupValue] of Object.entries(value)) {
                if (typeof groupValue === 'number') {
                    targetGroup[groupKey] = (targetGroup[groupKey] ?? 0) * percentModifierToMultiplier(groupValue);
                }
            }
        }
    }
}
/** recalculateMonsterDerivedState：重算妖兽派生状态。 */
function recalculateMonsterDerivedState(monster) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const nextAttrs = cloneAttributes(monster.baseAttrs);

    const nextStats = cloneNumericStats(monster.baseNumericStats);
    const attrPercentModifiers = createEmptyAttributes();
    const statPercentModifiers = createNumericStats();
    for (const buff of monster.buffs) {
        const stacks = Math.max(1, buff.stacks);
        if (buff.attrs) {
            const targetAttrs = buff.attrMode === 'percent' ? attrPercentModifiers : nextAttrs;
            addAttributeModifiers(targetAttrs, buff.attrs, stacks);
        }
        if (buff.stats) {
            const targetStats = buff.statMode === 'percent' ? statPercentModifiers : nextStats;
            addNumericStatModifiers(targetStats, buff.stats, stacks);
        }
    }
    applyAttributePercentModifiers(nextAttrs, attrPercentModifiers);
    applyNumericStatPercentModifiers(nextStats, statPercentModifiers);
    nextStats.maxHp = Math.max(1, Math.round(nextStats.maxHp));
    nextStats.maxQi = Math.max(0, Math.round(nextStats.maxQi));
    nextStats.moveSpeed = Math.max(0, Math.round(getEffectiveMoveSpeed(nextStats.moveSpeed)));

    const previousMaxHp = monster.maxHp;

    const previousHp = monster.hp;

    const previousStats = monster.numericStats;

    const previousMaxQi = Number.isFinite(Number(monster.maxQi))
        ? Math.max(0, Math.round(Number(monster.maxQi)))
        : Math.max(0, Math.round(Number(previousStats.maxQi ?? 0)));

    const previousQi = Number.isFinite(Number(monster.qi))
        ? Math.max(0, Math.round(Number(monster.qi)))
        : previousMaxQi;

    const previousAttrs = monster.attrs;

    monster.attrs = nextAttrs;
    monster.numericStats = nextStats;
    monster.maxHp = Math.max(1, Math.round(nextStats.maxHp));
    monster.maxQi = Math.max(0, Math.round(nextStats.maxQi));
    if (monster.alive) {
        monster.hp = previousMaxHp > 0
            ? Math.max(0, Math.min(monster.maxHp, Math.round(previousHp / previousMaxHp * monster.maxHp)))
            : monster.maxHp;
        monster.qi = previousMaxQi > 0
            ? Math.max(0, Math.min(monster.maxQi, Math.round(previousQi / previousMaxQi * monster.maxQi)))
            : monster.maxQi;
    }
    else {
        monster.hp = 0;
        monster.qi = 0;
    }
    return !isSameAttributes(previousAttrs, nextAttrs)
        || !isSameNumericStats(previousStats, nextStats)
        || previousMaxHp !== monster.maxHp
        || previousHp !== monster.hp
        || previousMaxQi !== monster.maxQi
        || previousQi !== monster.qi;
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
        && left.antiCrit === right.antiCrit
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
/** recoverMonsterQi：恢复妖兽灵力值。 */
function recoverMonsterQi(monster) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!monster.alive || monster.qi >= monster.maxQi || monster.numericStats.qiRegenRate <= 0) {
        return false;
    }

    const recover = Math.max(1, Math.round(monster.maxQi * (monster.numericStats.qiRegenRate / 10000)));

    const nextQi = Math.min(monster.maxQi, monster.qi + recover);
    if (nextQi === monster.qi) {
        return false;
    }
    monster.qi = nextQi;
    return true;
}
function resolveMonsterSkillQiCost(monster, skill) {
    return Math.round(calcQiCostWithOutputLimit(
        Math.max(0, Math.round(Number(skill?.cost) || 0)),
        Math.max(0, monster?.numericStats?.maxQiOutputPerTick ?? 0),
    ));
}
function commitMonsterSkillCast(monster, skill, currentTick) {
    const qiCost = resolveMonsterSkillQiCost(monster, skill);
    const cooldownReadyTick = Math.max(0, Math.trunc(Number(currentTick) || 0)) + Math.max(1, Math.round(Number(skill?.cooldown) || 1));
    if (qiCost > 0 && (monster.qi ?? 0) < qiCost) {
        return {
            ok: false,
            reason: 'insufficient_qi',
            qiCost,
            cooldownReadyTick,
        };
    }
    if (qiCost > 0) {
        monster.qi = Math.max(0, Math.round((monster.qi ?? 0) - qiCost));
    }
    monster.cooldownReadyTickBySkillId[skill.id] = cooldownReadyTick;
    return {
        ok: true,
        qiCost,
        cooldownReadyTick,
    };
}
/** chooseMonsterSkill：选择妖兽技能。 */
function chooseMonsterSkill(monster, target, distance, currentTick) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (monster.monsterId === HUANLING_ZHENREN_MONSTER_ID) {
        return selectHuanlingZhenrenSkill(monster, target, distance, currentTick);
    }

    let selected = null;

    let selectedRange = 0;
    for (const skill of monster.skills) {
        if (!canMonsterCastSkill(monster, skill, distance, currentTick)) {
            continue;
        }
        const skillRange = buildEffectiveMonsterSkillGeometry(monster, skill).range;
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
function selectHuanlingZhenrenSkill(monster, target, distance, currentTick) {
    const maxHp = Math.max(1, Math.round(monster.maxHp));
    const hpRatio = maxHp > 0 ? monster.hp / maxHp : 1;
    const hasFaxiang = entityHasActiveBuff(monster.buffs, HUANLING_FAXIANG_BUFF_ID);
    const targetBuffs = target?.buffs?.buffs ?? target?.buffs ?? target?.temporaryBuffs ?? [];
    const targetYinStacks = getEntityBuffStacks(targetBuffs, HUANLING_RONGMAI_YIN_BUFF_ID);
    const targetBurnStacks = getEntityBuffStacks(targetBuffs, TERRAIN_MOLTEN_POOL_BURN_BUFF_ID);
    const targetLocked = entityHasActiveBuff(targetBuffs, HUANLING_CANMAI_SUOBU_BUFF_ID);
    const targetPrimed = targetYinStacks + targetBurnStacks;

    if (!hasFaxiang && hpRatio <= 0.75) {
        const phaseAwaken = pickFirstCastableMonsterSkill(monster, distance, currentTick, [
            HUANLING_FAXIANG_SKILL_ID,
            HUANLING_LIEQI_ZHIXIAN_SKILL_ID,
            HUANLING_CANPO_ZHANG_SKILL_ID,
        ]);
        if (phaseAwaken) {
            return phaseAwaken;
        }
    }

    if (hpRatio <= 0.25) {
        const desperation = pickFirstCastableMonsterSkill(monster, distance, currentTick, [
            HUANLING_DIFU_CHENYIN_SKILL_ID,
            HUANLING_LIEFU_WAIHUAN_SKILL_ID,
            HUANLING_SUOGONG_NEIHUAN_SKILL_ID,
        ]);
        if (desperation) {
            return desperation;
        }
    }

    if (hpRatio <= 0.5) {
        const collapse = pickFirstCastableMonsterSkill(monster, distance, currentTick, [
            HUANLING_XINGLUO_CANPAN_SKILL_ID,
            HUANLING_RONGHE_GUANMAI_SKILL_ID,
        ]);
        if (collapse) {
            return collapse;
        }
    }

    if (!hasFaxiang) {
        return pickFirstCastableMonsterSkill(monster, distance, currentTick, [
            HUANLING_DUANHUN_DING_SKILL_ID,
            HUANLING_CANPO_ZHANG_SKILL_ID,
        ]);
    }

    if (targetLocked || targetPrimed >= 4) {
        const finisher = pickFirstCastableMonsterSkill(monster, distance, currentTick, [
            HUANLING_DIFU_CHENYIN_SKILL_ID,
            HUANLING_LIEFU_WAIHUAN_SKILL_ID,
            HUANLING_DUANHUN_DING_SKILL_ID,
            HUANLING_CANPO_ZHANG_SKILL_ID,
        ]);
        if (finisher) {
            return finisher;
        }
    }

    if (distance <= 2) {
        const closeControl = pickFirstCastableMonsterSkill(monster, distance, currentTick, [
            HUANLING_SUOGONG_NEIHUAN_SKILL_ID,
            HUANLING_DIFU_CHENYIN_SKILL_ID,
            HUANLING_XINGLUO_CANPAN_SKILL_ID,
            HUANLING_CANPO_ZHANG_SKILL_ID,
        ]);
        if (closeControl) {
            return closeControl;
        }
    }

    if (distance >= 4) {
        const longRangePressure = pickFirstCastableMonsterSkill(monster, distance, currentTick, [
            HUANLING_LIEFU_WAIHUAN_SKILL_ID,
            HUANLING_RONGHE_GUANMAI_SKILL_ID,
            HUANLING_XINGLUO_CANPAN_SKILL_ID,
            HUANLING_CANPO_ZHANG_SKILL_ID,
        ]);
        if (longRangePressure) {
            return longRangePressure;
        }
    }

    if (!targetLocked) {
        const setup = pickFirstCastableMonsterSkill(monster, distance, currentTick, [
            HUANLING_LIEQI_ZHIXIAN_SKILL_ID,
            HUANLING_XINGLUO_CANPAN_SKILL_ID,
            HUANLING_RONGHE_GUANMAI_SKILL_ID,
            HUANLING_SUOGONG_NEIHUAN_SKILL_ID,
            HUANLING_CANPO_ZHANG_SKILL_ID,
        ]);
        if (setup) {
            return setup;
        }
    }

    if (targetPrimed >= 2) {
        const cashOut = pickFirstCastableMonsterSkill(monster, distance, currentTick, [
            HUANLING_DIFU_CHENYIN_SKILL_ID,
            HUANLING_LIEFU_WAIHUAN_SKILL_ID,
            HUANLING_SUOGONG_NEIHUAN_SKILL_ID,
            HUANLING_DUANHUN_DING_SKILL_ID,
            HUANLING_CANPO_ZHANG_SKILL_ID,
        ]);
        if (cashOut) {
            return cashOut;
        }
    }

    return pickFirstCastableMonsterSkill(monster, distance, currentTick, [
        HUANLING_DIFU_CHENYIN_SKILL_ID,
        HUANLING_LIEFU_WAIHUAN_SKILL_ID,
        HUANLING_SUOGONG_NEIHUAN_SKILL_ID,
        HUANLING_XINGLUO_CANPAN_SKILL_ID,
        HUANLING_RONGHE_GUANMAI_SKILL_ID,
        HUANLING_LIEQI_ZHIXIAN_SKILL_ID,
        HUANLING_DUANHUN_DING_SKILL_ID,
        HUANLING_CANPO_ZHANG_SKILL_ID,
    ]);
}
function pickFirstCastableMonsterSkill(monster, distance, currentTick, skillIds) {
    for (const skillId of skillIds) {
        const skill = monster.skills.find((entry) => entry.id === skillId);
        if (!skill) {
            continue;
        }
        if (!canMonsterCastSkill(monster, skill, distance, currentTick)) {
            continue;
        }
        return skill;
    }
    return null;
}
function canMonsterCastSkill(monster, skill, distance, currentTick) {
    if (!matchesMonsterSkillConditions(monster, skill)) {
        return false;
    }
    const skillRange = buildEffectiveMonsterSkillGeometry(monster, skill).range;
    if (skill.requiresTarget !== false && distance > skillRange) {
        return false;
    }

    const qiCost = resolveMonsterSkillQiCost(monster, skill);
    if (qiCost > 0 && (monster.qi ?? 0) < qiCost) {
        return false;
    }

    const readyTick = monster.cooldownReadyTickBySkillId[skill.id] ?? 0;
    return currentTick >= readyTick;
}
function entityHasActiveBuff(buffs, buffId, minStacks = 1) {
    return (Array.isArray(buffs) ? buffs : []).some((buff) => (
        buff?.buffId === buffId
        && (buff.remainingTicks === undefined || buff.remainingTicks > 0)
        && Math.max(1, Math.round(Number(buff.stacks) || 1)) >= minStacks
    ));
}
function getEntityBuffStacks(buffs, buffId) {
    let total = 0;
    for (const buff of Array.isArray(buffs) ? buffs : []) {
        if (buff?.buffId !== buffId) {
            continue;
        }
        if (buff.remainingTicks !== undefined && buff.remainingTicks <= 0) {
            continue;
        }
        total += Math.max(1, Math.round(Number(buff.stacks) || 1));
    }
    return total;
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
    return buildEffectiveTargetingGeometry({
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
    return computeAffectedCellsFromAnchor({ x: monster.x, y: monster.y }, anchor, geometry);
}
function resolveFacingToward(fromX, fromY, toX, toY) {
    if (toX > fromX) {
        return Direction.East;
    }
    if (toX < fromX) {
        return Direction.West;
    }
    if (toY > fromY) {
        return Direction.South;
    }
    return Direction.North;
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
function normalizeBuildingRotation(value) {
    const normalized = Math.trunc(Number(value) || 0);
    if (normalized === 90 || normalized === 180 || normalized === 270) {
        return normalized;
    }
    return 0;
}
function rotationToIndex(rotation) {
    switch (rotation) {
        case 90:
            return 1;
        case 180:
            return 2;
        case 270:
            return 3;
        case 0:
        default:
            return 0;
    }
}
function normalizeBuildingId(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}
function normalizeBuildingState(value) {
    switch (value) {
        case 'planned':
        case 'building':
        case 'active':
        case 'damaged':
        case 'destroyed':
        case 'deconstructing':
            return value;
        default:
            return 'active';
    }
}
function buildingUsesActiveTopology(buildingOrState) {
    const state = typeof buildingOrState === 'string'
        ? buildingOrState
        : normalizeBuildingState(buildingOrState?.state);
    return state !== 'planned' && state !== 'building' && state !== 'destroyed';
}
function normalizeBuildingRemainingTicks(value, fallbackValue = undefined) {
    const resolved = Number.isFinite(Number(value))
        ? Math.trunc(Number(value))
        : Number.isFinite(Number(fallbackValue))
            ? Math.trunc(Number(fallbackValue))
            : 1;
    return Math.max(1, resolved);
}
function resolveBuildingRemainingTicks(building) {
    if (Number.isFinite(Number(building?.buildRemainingTicks))) {
        return Math.max(0, Math.trunc(Number(building.buildRemainingTicks)));
    }
    if (Number.isFinite(Number(building?.buildStrength))) {
        return Math.max(1, Math.trunc(Number(building.buildStrength)));
    }
    return 1;
}
function resolveBuildingCatalogRevision(catalog) {
    if (!Array.isArray(catalog?.defs)) {
        return 0;
    }
    let revision = 0;
    for (const def of catalog.defs) {
        revision += Math.max(0, Math.trunc(Number(def?.revision) || 0));
    }
    return revision;
}
function countBuildingCellReferences(buildingIdByCell) {
    let count = 0;
    if (!(buildingIdByCell instanceof Map)) {
        return 0;
    }
    for (const ids of buildingIdByCell.values()) {
        count += Array.isArray(ids) ? ids.length : 0;
    }
    return count;
}
function createRoomAggregate(room) {
    return {
        roomId: room.id,
        area: room.area,
        perimeter: room.perimeter,
        doorCount: room.doorCount,
        windowCount: room.windowCount,
        roofCoverage: room.roofCoverageRatio,
        elementVector: new Int32Array(5),
        traitCounts: new Map(),
        traitKeys: new Set(),
        comfort: 0,
        stability: 0,
        qiRaw: 0,
        qiAffinity: 0,
        qiLeak: 0,
        shaRaw: 0,
        shaEmit: 0,
        shaReduce: 0,
        integrityPenalty: 0,
        formationScore: 0,
        topologyRevision: room.topologyRevision,
        aggregateRevision: room.topologyRevision + room.contentRevision,
    };
}
function applyCompiledBuildingToRoomAggregate(aggregate, compiled, catalog = null) {
    for (let index = 0; index < compiled.elementVector.length; index += 1) {
        aggregate.elementVector[index] += compiled.elementVector[index] ?? 0;
    }
    for (const traitId of compiled.traitIds ?? []) {
        aggregate.traitCounts.set(traitId, (aggregate.traitCounts.get(traitId) ?? 0) + 1);
        const traitKey = catalog?.traitKeysById?.[traitId];
        if (traitKey && aggregate.traitKeys instanceof Set) {
            aggregate.traitKeys.add(traitKey);
        }
    }
    aggregate.comfort += compiled.fengShuiContrib?.[0] ?? 0;
    aggregate.stability += compiled.fengShuiContrib?.[1] ?? 0;
    aggregate.qiAffinity += Math.max(0, compiled.fengShuiContrib?.[2] ?? 0);
    aggregate.qiLeak += Math.max(0, compiled.fengShuiContrib?.[3] ?? 0);
    aggregate.shaEmit += Math.max(0, compiled.fengShuiContrib?.[4] ?? 0);
    aggregate.shaReduce += Math.max(0, compiled.fengShuiContrib?.[5] ?? 0);
    aggregate.shaRaw = Math.max(0, aggregate.shaEmit - aggregate.shaReduce);
    aggregate.integrityPenalty += Math.max(0, compiled.fengShuiContrib?.[6] ?? 0);
    aggregate.aggregateRevision += compiled.revision ?? 0;
}
function compiledBuildingAffectsRoomBoundaryTopology(compiled) {
    if (!compiled) {
        return false;
    }
    if (Math.max(0, Math.trunc(Number(compiled.roomBoundary) || 0)) > 0) {
        return true;
    }
    if (Math.max(0, Math.trunc(Number(compiled.openingKind) || 0)) > 0) {
        return true;
    }
    return typeof compiled.visualTileType === 'string'
        && isStaticRoomBoundaryTile(compiled.visualTileType);
}
function compiledBuildingAffectsFengShui(compiled) {
    if (!compiled) {
        return false;
    }
    for (const value of compiled.elementVector ?? []) {
        if (value !== 0) {
            return true;
        }
    }
    if ((compiled.traitIds?.length ?? 0) > 0) {
        return true;
    }
    for (const value of compiled.fengShuiContrib ?? []) {
        if (value !== 0) {
            return true;
        }
    }
    return false;
}
function resolvePersistedBuildingCells(instance, building, persistedCells, compiled) {
    const cells = [];
    for (const cell of Array.isArray(persistedCells) ? persistedCells : []) {
        const tileIndex = Number.isFinite(Number(cell?.tileIndex))
            ? Math.trunc(Number(cell.tileIndex))
            : instance.toTileIndex(cell?.x, cell?.y);
        if (tileIndex >= 0) {
            cells.push(tileIndex);
        }
    }
    if (cells.length > 0 || !compiled?.footprintByRotation) {
        return Array.from(new Set(cells));
    }
    const footprint = compiled.footprintByRotation[rotationToIndex(building.rotation)] ?? compiled.footprintByRotation[0];
    for (let index = 0; index < footprint.length; index += 2) {
        const tileIndex = instance.toTileIndex(building.x + footprint[index], building.y + footprint[index + 1]);
        if (tileIndex >= 0) {
            cells.push(tileIndex);
        }
    }
    return Array.from(new Set(cells));
}
function resolvePersistedBuildingPreviousTileTypes(instance, persistedCells) {
    const previousTileTypes = [];
    for (const cell of Array.isArray(persistedCells) ? persistedCells : []) {
        const previousTileType = typeof cell?.previousTileType === 'string' && cell.previousTileType.trim()
            ? cell.previousTileType.trim()
            : typeof cell?.previous_tile_type === 'string' && cell.previous_tile_type.trim()
                ? cell.previous_tile_type.trim()
                : '';
        if (!previousTileType) {
            continue;
        }
        const tileIndex = Number.isFinite(Number(cell?.tileIndex))
            ? Math.trunc(Number(cell.tileIndex))
            : instance.toTileIndex(cell?.x, cell?.y);
        if (tileIndex >= 0) {
            previousTileTypes.push([tileIndex, {
                tileType: previousTileType,
                terrainType: normalizeOptionalLayerString(cell?.previousTerrainType ?? cell?.previous_terrain_type),
                surfaceType: normalizeNullableLayerString(cell?.previousSurfaceType ?? cell?.previous_surface_type),
                structureType: normalizeNullableLayerString(cell?.previousStructureType ?? cell?.previous_structure_type),
                interactableKinds: normalizeInteractableKindList(cell?.previousInteractableKinds ?? cell?.previous_interactable_kinds),
            }]);
        }
    }
    return previousTileTypes;
}
function resolvePreviousBuildingTileType(previousState) {
    if (typeof previousState === 'string') {
        return previousState;
    }
    return typeof previousState?.tileType === 'string' && previousState.tileType.trim()
        ? previousState.tileType.trim()
        : null;
}
function resolvePreviousBuildingLayerValue(previousState, key) {
    if (!previousState || typeof previousState !== 'object') {
        return null;
    }
    const value = previousState[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function resolvePreviousBuildingNullableLayerValue(previousState, key) {
    if (!previousState || typeof previousState !== 'object' || !Object.prototype.hasOwnProperty.call(previousState, key)) {
        return null;
    }
    const value = previousState[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function resolvePreviousBuildingInteractableKinds(previousState) {
    return Array.isArray(previousState?.interactableKinds)
        ? previousState.interactableKinds.filter((kind) => typeof kind === 'string' && kind.trim()).map((kind) => kind.trim())
        : [];
}
function normalizeOptionalLayerString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
function normalizeNullableLayerString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function normalizeInteractableKindList(value) {
    return Array.isArray(value)
        ? value.filter((kind) => typeof kind === 'string' && kind.trim()).map((kind) => kind.trim())
        : [];
}
function areInteractableKindListsEqual(left, right) {
    const leftList = normalizeInteractableKindList(left);
    const rightList = normalizeInteractableKindList(right);
    if (leftList.length !== rightList.length) {
        return false;
    }
    for (let index = 0; index < leftList.length; index += 1) {
        if (leftList[index] !== rightList[index]) {
            return false;
        }
    }
    return true;
}

function resolveTemplateLayerSeed(template, x, y) {
    if (hasTemplateLayerRows(template)
        || Array.isArray(template?.surfaceRows)
        || Array.isArray(template?.structureRows)
        || Array.isArray(template?.interactableRows)) {
        const legacyTileType = composeTileTypeFromLayers(
            template.terrainRows?.[y]?.[x],
            template.surfaceRows?.[y]?.[x] ?? null,
            template.structureRows?.[y]?.[x] ?? null,
            template.interactableRows?.[y]?.[x] ?? [],
        );
        return {
            terrain: normalizeTerrainType(template.terrainRows?.[y]?.[x]),
            surface: normalizeSurfaceType(template.surfaceRows?.[y]?.[x] ?? null),
            structure: normalizeStructureType(template.structureRows?.[y]?.[x] ?? null),
            interactables: Array.isArray(template.interactableRows?.[y]?.[x]) ? template.interactableRows[y][x] : [],
            legacyTileType,
        };
    }
    const staticType = getTileTypeFromMapChar(template.legacyTileRows?.[y]?.[x] ?? template.terrainRows?.[y]?.[x] ?? template.source?.tiles?.[y]?.[x] ?? '#');
    return resolveTileLayerSeedFromTemplateContext(staticType, x, y, (lookupX, lookupY) => {
        if (lookupX < 0 || lookupY < 0 || lookupX >= template.width || lookupY >= template.height) {
            return null;
        }
        return getTileTypeFromMapChar(template.legacyTileRows?.[lookupY]?.[lookupX] ?? template.terrainRows?.[lookupY]?.[lookupX] ?? template.source?.tiles?.[lookupY]?.[lookupX] ?? '#');
    });
}

function hasTemplateLayerRows(template) {
    return Array.isArray(template?.terrainRows?.[0]);
}
function isIndoorSubspaceTemplate(template) {
    const source = template?.source ?? template ?? {};
    return Boolean(
        (typeof source.parentMapId === 'string' && source.parentMapId.trim())
            || source.spaceVisionMode === 'parent_overlay'
            || Number.isInteger(source.floorLevel),
    );
}
function isNaturalAuraFlowResource(resourceKey) {
    if (resourceKey === DEFAULT_TILE_AURA_RESOURCE_KEY) {
        return true;
    }
    const parsed = typeof parseQiResourceKey === 'function'
        ? parseQiResourceKey(resourceKey)
        : null;
    return parsed?.family === 'aura' && parsed?.form === 'refined';
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
            facing: dx > 0 ? Direction.East : Direction.West,
        });
    }
    if (dy !== 0) {
        candidates.push({
            x: fromX,
            y: fromY + dy,
            facing: dy > 0 ? Direction.South : Direction.North,
        });
    }
    if (Math.abs(targetX - fromX) < Math.abs(targetY - fromY) && dx !== 0) {
        candidates.push({
            x: fromX + dx,
            y: fromY,
            facing: dx > 0 ? Direction.East : Direction.West,
        });
    }
    return candidates;
}
/** chebyshevDistance：计算切比雪夫距离。 */
function chebyshevDistance(ax, ay, bx, by) {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

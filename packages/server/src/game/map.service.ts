/**
 * 地图服务 —— 管理所有地图的加载、热重载、地块查询、占位管理、
 * 传送点/NPC/怪物刷新点/容器/任务配置的解析，以及动态地块（可破坏地形）的状态维护。
 */
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import {
  calculateTerrainDurability,
  DEFAULT_MAP_TIME_CONFIG,
  doesTileTypeBlockSight,
  getTileTypeFromMapChar,
  GmMapAuraRecord,
  GmMapDocument,
  GmMapLandmarkRecord,
  GmMapListRes,
  GmMapNpcRecord,
  GmMapPortalRecord,
  GmMapSafeZoneRecord,
  isTileTypeWalkable,
  isOffsetInRange,
  isPointInRange,
  Tile,
  TileType,
  MapMeta,
  MapMinimapArchiveEntry,
  MapMinimapMarker,
  MapMinimapSnapshot,
  MapRouteDomain,
  MapSpaceVisionMode,
  MapTimeConfig,
  MonsterCombatModel,
  MonsterInitialBuffDef,
  MonsterTier,
  NumericStats,
  NumericStatPercentages,
  normalizeMonsterTier,
  PartialNumericStats,
  Portal,
  PortalKind,
  PortalRouteDomain,
  PortalTrigger,
  VIEW_RADIUS,
  VisibleTile,
  getTileTraversalCost,
  getAuraLevel,
  normalizeAuraLevelBaseValue,
  TerrainDurabilityMaterial,
  TERRAIN_DESTROYED_RESTORE_TICKS,
  TERRAIN_REGEN_RATE_PER_TICK,
  TERRAIN_RESTORE_RETRY_DELAY_TICKS,
  TechniqueGrade,
  DEFAULT_AURA_LEVEL_BASE_VALUE,
  DEFAULT_PLAYER_MAP_ID,
  TILE_AURA_HALF_LIFE_RATE_SCALE,
  TILE_AURA_HALF_LIFE_RATE_SCALED,
  buildQiResourceKey,
  DISPERSED_AURA_HALF_LIFE_RATE_SCALED,
  DISPERSED_AURA_MIN_DECAY_PER_TICK,
  DISPERSED_AURA_RESOURCE_DESCRIPTOR,
  DEFAULT_QI_RESOURCE_DESCRIPTOR,
  Attributes,
  expandMapResourceNodeGroups,
  EquipmentSlots,
  parseQiResourceKey,
  LootSourceVariant,
} from '@mud/shared';
import * as fs from 'fs';
import { resolveServerDataPath } from '../common/data-path';
import { PersistentDocumentService } from '../database/persistent-document.service';
import { ContentService } from './content.service';
import { PathfindingActorType, PathfindingStaticGrid } from './pathfinding/pathfinding.types';
import {
  DEFAULT_TERRAIN_DURABILITY_BY_TILE,
  LEGACY_MAP_TERRAIN_PROFILE_IDS,
  SPECIAL_TILE_RESTORE_SPEED_MULTIPLIERS,
  TERRAIN_DURABILITY_PROFILES,
  TerrainDurabilityProfile,
} from '../constants/world/terrain';
import {
  ORDINARY_MONSTER_SPAWN_COUNT,
  ORDINARY_MONSTER_SPAWN_MAX_ALIVE,
} from '../constants/gameplay/monster';
import { LANDMARK_RESOURCE_NODE_BY_ID } from '../constants/gameplay/resource-nodes';
import {
  AURA_RESOURCE_KEY,
  DISPERSED_AURA_RESOURCE_KEY,
  DynamicTileState,
  LEGACY_AURA_RESOURCE_KEY,
  MAP_TILE_RUNTIME_DOCUMENT_KEY,
  MapAuraPoint,
  MapData,
  MapTileResourcePoint,
  MonsterSpawnConfig,
  NpcConfig,
  NpcLocation,
  NpcShopItemConfig,
  OccupancyCheckOptions,
  OccupantKind,
  PersistedAuraRecord,
  PersistedAuraSnapshot,
  PersistedDynamicTileRecord,
  PersistedDynamicTileSnapshot,
  PersistedMapTimeState,
  PersistedTileRuntimeRecord,
  PersistedTileRuntimeResourceRecord,
  PersistedTileRuntimeSnapshot,
  PersistedTileRuntimeTerrainRecord,
  PortalObservationHint,
  PortalQueryOptions,
  ProjectedPoint,
  QuestConfig,
  resolveMonsterSpawnPopulation,
  RUNTIME_STATE_SCOPE,
  SafeZoneConfig,
  SyncedMapDocument,
  TILE_RESOURCE_FLOW_CONFIGS,
  TileResourceBucketMap,
  TileResourceFlowConfig,
  TileResourceRuntimeState,
  TileResourceStateMap,
  type ContainerConfig,
  type ContainerLootPoolConfig,
  type DropConfig,
} from './map.service.shared';
import {
  normalizeAuraPoints as normalizeAuraPointsHelper,
  normalizeContainerGrade as normalizeContainerGradeHelper,
  normalizeContainerLootPools as normalizeContainerLootPoolsHelper,
  normalizeDrops as normalizeDropsHelper,
  normalizeTileResourcePoints as normalizeTileResourcePointsHelper,
} from './map-normalize.helpers';
import {
  buildPersistedTileRuntimeResources as buildPersistedTileRuntimeResourcesHelper,
  deleteTileResourceStateMap as deleteTileResourceStateMapHelper,
  getTileResourceFlowConfig as getTileResourceFlowConfigHelper,
  getTileResourceLabel as getTileResourceLabelHelper,
  getTileResourceStateMap as getTileResourceStateMapHelper,
  normalizeTileResourceKey as normalizeTileResourceKeyHelper,
  normalizeTileResourceRuntimeState as normalizeTileResourceRuntimeStateHelper,
  setTileResourceStateMap as setTileResourceStateMapHelper,
  shouldExposeTileResourceDetail as shouldExposeTileResourceDetailHelper,
  shouldKeepTileResourceRuntimeState as shouldKeepTileResourceRuntimeStateHelper,
  tickTileResourceState as tickTileResourceStateHelper,
  tileStateKey as tileStateKeyHelper,
  toPublicTileResourceKey as toPublicTileResourceKeyHelper,
} from './map-tile-resource.helpers';
import { MapQuestDomain } from './map-quest.domain';
import { MapContentDomain } from './map-content.domain';
import { MapEditableDomain } from './map-editable.domain';
import { MapDocumentDomain } from './map-document.domain';
import { MapOccupancyDomain } from './map-occupancy.domain';
import { MapPortalDomain } from './map-portal.domain';

export type {
  ContainerConfig,
  ContainerLootPoolConfig,
  DropConfig,
  MonsterSpawnConfig,
  NpcConfig,
  NpcLocation,
  NpcShopItemConfig,
  QuestConfig,
  SafeZoneConfig,
} from './map.service.shared';


@Injectable()
/** MapService：封装相关状态与行为。 */
export class MapService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MapService.name);
/** maps：定义该变量以承载业务值。 */
  private maps: Map<string, MapData> = new Map();
/** mapConditionAliasesById：定义该变量以承载业务值。 */
  private mapConditionAliasesById: Map<string, ReadonlySet<string>> = new Map();
/** quests：定义该变量以承载业务值。 */
  private quests: Map<string, QuestConfig> = new Map();
/** mainQuestChain：定义该变量以承载业务值。 */
  private mainQuestChain: QuestConfig[] = [];
/** mainQuestIndexById：定义该变量以承载业务值。 */
  private mainQuestIndexById: Map<string, number> = new Map();
/** monsters：定义该变量以承载业务值。 */
  private monsters: Map<string, MonsterSpawnConfig> = new Map();
/** revisions：定义该变量以承载业务值。 */
  private revisions: Map<string, number> = new Map();
/** tilePatchRevisions：定义该变量以承载业务值。 */
  private tilePatchRevisions: Map<string, number> = new Map();
/** pathfindingStaticGrids：定义该变量以承载业务值。 */
  private pathfindingStaticGrids: Map<string, PathfindingStaticGrid> = new Map();
/** dirtyTileKeysByMap：定义该变量以承载业务值。 */
  private dirtyTileKeysByMap: Map<string, Set<string>> = new Map();
/** occupantsByMap：定义该变量以承载业务值。 */
  private occupantsByMap: Map<string, Map<string, Map<string, OccupantKind>>> = new Map();
/** playerOverlapPointsByMap：定义该变量以承载业务值。 */
  private playerOverlapPointsByMap: Map<string, Set<string>> = new Map();
/** dynamicTileStates：定义该变量以承载业务值。 */
  private dynamicTileStates: Map<string, Map<string, DynamicTileState>> = new Map();
/** persistedDynamicTileStates：定义该变量以承载业务值。 */
  private persistedDynamicTileStates: Map<string, Map<string, PersistedDynamicTileRecord>> = new Map();
  private dynamicTileStatesDirty = false;
/** resourceStates：定义该变量以承载业务值。 */
  private resourceStates: Map<string, TileResourceBucketMap> = new Map();
/** persistedResourceStates：定义该变量以承载业务值。 */
  private persistedResourceStates: Map<string, TileResourceBucketMap> = new Map();
  private resourceStatesDirty = false;
/** mapTimeStates：定义该变量以承载业务值。 */
  private mapTimeStates: Map<string, PersistedMapTimeState> = new Map();
/** persistedMapTimeStates：定义该变量以承载业务值。 */
  private persistedMapTimeStates: Map<string, PersistedMapTimeState> = new Map();
  private mapTimeStatesDirty = false;
  private mapsDir = resolveServerDataPath('maps');
  private questDir = resolveServerDataPath('content', 'quests');
  private readonly tileRuntimeStatePath = resolveServerDataPath('runtime', 'map-tile-runtime-state.json');
  private readonly legacyDynamicTileStatePath = resolveServerDataPath('runtime', 'dynamic-map-state.json');
  private readonly legacyAuraStatePath = resolveServerDataPath('runtime', 'map-aura-state.json');
  private auraLevelBaseValue = DEFAULT_AURA_LEVEL_BASE_VALUE;
/** runtimeSnapshotCache：定义该变量以承载业务值。 */
  private runtimeSnapshotCache: PersistedTileRuntimeSnapshot = { version: 2, maps: {} };
  private dirtyTileRuntimeMapIds = new Set<string>();
  private dirtyMapTimeStateMapIds = new Set<string>();
/** contentDomain：定义该变量以承载业务值。 */
  private readonly contentDomain: MapContentDomain;
/** editableDomain：定义该变量以承载业务值。 */
  private readonly editableDomain: MapEditableDomain;
/** documentDomain：定义该变量以承载业务值。 */
  private readonly documentDomain: MapDocumentDomain;
/** occupancyDomain：定义该变量以承载业务值。 */
  private readonly occupancyDomain: MapOccupancyDomain;
/** portalDomain：定义该变量以承载业务值。 */
  private readonly portalDomain: MapPortalDomain;

  constructor(
    private readonly contentService: ContentService,
    private readonly persistentDocumentService: PersistentDocumentService,
  ) {
    this.contentDomain = new MapContentDomain(this.contentService, {
      warn: (message) => this.logger.warn(message),
      normalizeContainerGrade: (grade) => this.normalizeContainerGrade(grade),
      normalizeDrops: (rawDrops) => this.normalizeDrops(rawDrops),
      normalizeContainerLootPools: (rawPools) => this.normalizeContainerLootPools(rawPools),
      getMapName: (mapId) => this.getMapMeta(mapId)?.name,
    });
    this.editableDomain = new MapEditableDomain(this.contentService, {
      resolveMonsterSpawnTemplateId: (spawn) => this.resolveMonsterSpawnTemplateId(spawn),
    });
    this.documentDomain = new MapDocumentDomain(this.persistentDocumentService, this.editableDomain, {
      mapsDir: this.mapsDir,
      getLoadedMaps: () => this.maps.values(),
      getLoadedMap: (mapId) => this.maps.get(mapId),
      loadMapIntoRuntime: (document, previousDocument) => this.loadMap(document, previousDocument),
      afterDocumentMutation: () => {
        this.rebuildMapConditionAliases();
        this.reloadQuestBindingsFromFiles();
      },
      log: (message) => this.logger.log(message),
      error: (message) => this.logger.error(message),
    });
    this.occupancyDomain = new MapOccupancyDomain(
      this.maps,
      this.revisions,
      this.pathfindingStaticGrids,
      this.occupantsByMap,
      {
        tileStateKey: (x, y) => this.tileStateKey(x, y),
        getPlayerOverlapPointsByMap: () => this.playerOverlapPointsByMap,
        replacePlayerOverlapPointsByMap: (next) => {
          this.playerOverlapPointsByMap = next;
        },
        getMapRevision: (mapId) => this.getMapRevision(mapId),
        markTileDirty: (mapId, x, y) => this.markTileDirty(mapId, x, y),
      },
    );
    this.portalDomain = new MapPortalDomain(this.maps);
  }

/** onModuleInit：处理当前场景中的对应操作。 */
  async onModuleInit() {
    await this.loadPersistedTileRuntimeStates();
    this.contentService.ensureLoaded();
/** syncedMaps：定义该变量以承载业务值。 */
    const syncedMaps = await this.syncMapDocumentsFromFiles();
    this.loadAllMaps(syncedMaps);
  }

/** onModuleDestroy：处理当前场景中的对应操作。 */
  async onModuleDestroy() {
    await this.persistTileRuntimeStates();
  }

/** reloadAllFromPersistence：执行对应的业务逻辑。 */
  async reloadAllFromPersistence(): Promise<void> {
    this.maps.clear();
    this.mapConditionAliasesById.clear();
    this.quests.clear();
    this.monsters.clear();
    this.revisions.clear();
    this.tilePatchRevisions.clear();
    this.pathfindingStaticGrids.clear();
    this.dirtyTileKeysByMap.clear();
    this.occupantsByMap.clear();
    this.playerOverlapPointsByMap.clear();
    this.dynamicTileStates.clear();
    this.persistedDynamicTileStates.clear();
    this.dynamicTileStatesDirty = false;
    this.resourceStates.clear();
    this.persistedResourceStates.clear();
    this.resourceStatesDirty = false;
    this.mapTimeStates.clear();
    this.persistedMapTimeStates.clear();
    this.mapTimeStatesDirty = false;
    this.runtimeSnapshotCache = { version: 2, maps: {} };
    this.dirtyTileRuntimeMapIds.clear();
    this.dirtyMapTimeStateMapIds.clear();
    await this.loadPersistedTileRuntimeStates();
/** syncedMaps：定义该变量以承载业务值。 */
    const syncedMaps = await this.syncMapDocumentsFromFiles();
    this.loadAllMaps(syncedMaps);
  }

/** setAuraLevelBaseValue：执行对应的业务逻辑。 */
  setAuraLevelBaseValue(value: number): void {
/** normalizedValue：定义该变量以承载业务值。 */
    const normalizedValue = normalizeAuraLevelBaseValue(value, this.auraLevelBaseValue);
    if (normalizedValue === this.auraLevelBaseValue) {
      return;
    }
    this.auraLevelBaseValue = normalizedValue;
    for (const document of [...this.maps.values()].map((map) => this.editableDomain.cloneMapDocument(map.source))) {
      this.loadMap(document, document);
    }
    this.reloadQuestBindingsFromFiles();
  }

/** getAuraLevelBaseValue：执行对应的业务逻辑。 */
  getAuraLevelBaseValue(): number {
    return this.auraLevelBaseValue;
  }

/** loadPersistedTileRuntimeStates：处理当前场景中的对应操作。 */
  private async loadPersistedTileRuntimeStates() {
    this.persistedDynamicTileStates.clear();
    this.persistedResourceStates.clear();
    this.persistedMapTimeStates.clear();
    this.runtimeSnapshotCache = { version: 2, maps: {} };
    this.dirtyTileRuntimeMapIds.clear();
    this.dirtyMapTimeStateMapIds.clear();
/** snapshot：定义该变量以承载业务值。 */
    let snapshot = await this.persistentDocumentService.get<Partial<PersistedTileRuntimeSnapshot>>(
      RUNTIME_STATE_SCOPE,
      MAP_TILE_RUNTIME_DOCUMENT_KEY,
    );
    if (!snapshot) {
      await this.importLegacyTileRuntimeStateIfNeeded();
      snapshot = await this.persistentDocumentService.get<Partial<PersistedTileRuntimeSnapshot>>(
        RUNTIME_STATE_SCOPE,
        MAP_TILE_RUNTIME_DOCUMENT_KEY,
      );
    }
    if (!snapshot) {
      return;
    }

    try {
/** rawMaps：定义该变量以承载业务值。 */
      const rawMaps = snapshot?.maps;
      if (!rawMaps || typeof rawMaps !== 'object') {
        this.logger.warn('地块运行时持久化数据格式非法，已忽略');
        return;
      }

/** terrainStateCount：定义该变量以承载业务值。 */
      let terrainStateCount = 0;
/** resourceStateCount：定义该变量以承载业务值。 */
      let resourceStateCount = 0;
/** timeStateCount：定义该变量以承载业务值。 */
      let timeStateCount = 0;
      for (const [mapId, rawRecords] of Object.entries(rawMaps)) {
        if (!Array.isArray(rawRecords)) {
          continue;
        }

/** terrainRecords：定义该变量以承载业务值。 */
        const terrainRecords = new Map<string, PersistedDynamicTileRecord>();
/** resourceRecords：定义该变量以承载业务值。 */
        const resourceRecords = new Map<string, TileResourceStateMap>();
        for (const rawRecord of rawRecords) {
          const record = rawRecord as Partial<PersistedTileRuntimeRecord>;
          if (!Number.isInteger(record.x) || !Number.isInteger(record.y)) {
            continue;
          }

/** key：定义该变量以承载业务值。 */
          const key = this.tileStateKey(Number(record.x), Number(record.y));
/** terrain：定义该变量以承载业务值。 */
          const terrain = record.terrain as Partial<PersistedTileRuntimeTerrainRecord> | undefined;
          if (
            terrain
            && Number.isFinite(terrain.hp)
            && typeof terrain.destroyed === 'boolean'
          ) {
/** transformedType：定义该变量以承载业务值。 */
            const transformedType = Object.values(TileType).includes(terrain.transformedType as TileType)
              ? terrain.transformedType as TileType
              : undefined;
            terrainRecords.set(key, {
              x: Number(record.x),
              y: Number(record.y),
              hp: Math.max(0, Math.round(Number(terrain.hp))),
              destroyed: terrain.destroyed,
              restoreTicksLeft: terrain.destroyed
                ? this.normalizeRestoreTicksLeft(
                  terrain.restoreTicksLeft,
                  this.getBaseTileType(mapId, Number(record.x), Number(record.y)) ?? TileType.Floor,
                )
                : undefined,
              transformedType,
              transformTicksLeft: transformedType ? this.normalizeTransformTicksLeft(terrain.transformTicksLeft) : undefined,
            });
          }

          if (!record.resources || typeof record.resources !== 'object') {
            continue;
          }

          for (const [rawResourceKey, rawResourceState] of Object.entries(record.resources)) {
            const resourceKey = this.normalizeTileResourceKey(rawResourceKey);
            const normalized = resourceKey
              ? this.normalizeTileResourceRuntimeState(record.x, record.y, rawResourceState)
              : null;
            if (!resourceKey || !normalized) {
              continue;
            }

/** stateMap：定义该变量以承载业务值。 */
            const stateMap = resourceRecords.get(resourceKey) ?? new Map<string, TileResourceRuntimeState>();
            stateMap.set(key, normalized);
            resourceRecords.set(resourceKey, stateMap);
          }
        }

        if (terrainRecords.size > 0) {
          this.persistedDynamicTileStates.set(mapId, terrainRecords);
          terrainStateCount += terrainRecords.size;
        }
        if (resourceRecords.size > 0) {
          this.persistedResourceStates.set(mapId, resourceRecords);
          resourceStateCount += [...resourceRecords.values()].reduce((total, stateMap) => total + stateMap.size, 0);
        }
      }

/** rawTimeStates：定义该变量以承载业务值。 */
      const rawTimeStates = snapshot?.time;
      if (rawTimeStates && typeof rawTimeStates === 'object') {
        for (const [mapId, rawState] of Object.entries(rawTimeStates)) {
          const normalized = this.normalizePersistedMapTimeState(rawState);
          if (!normalized) {
            continue;
          }
          this.persistedMapTimeStates.set(mapId, normalized);
          timeStateCount += 1;
        }
      }

      if (terrainStateCount > 0 || resourceStateCount > 0 || timeStateCount > 0) {
        this.logger.log(
          `已加载地块运行时状态：地形 ${terrainStateCount} 条，资源 ${resourceStateCount} 条，地图时间 ${timeStateCount} 条`,
        );
      }
      this.runtimeSnapshotCache = this.buildPersistedTileRuntimeSnapshotFromState();
    } catch (error) {
/** message：定义该变量以承载业务值。 */
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`读取地块运行时持久化数据失败: ${message}`);
    }
  }

/** importLegacyTileRuntimeStateIfNeeded：执行对应的业务逻辑。 */
  private async importLegacyTileRuntimeStateIfNeeded(): Promise<void> {
    if (!fs.existsSync(this.tileRuntimeStatePath) && !fs.existsSync(this.legacyDynamicTileStatePath) && !fs.existsSync(this.legacyAuraStatePath)) {
      return;
    }

    this.persistedDynamicTileStates.clear();
    this.persistedResourceStates.clear();
    this.persistedMapTimeStates.clear();

    if (fs.existsSync(this.tileRuntimeStatePath)) {
      try {
/** snapshot：定义该变量以承载业务值。 */
        const snapshot = JSON.parse(fs.readFileSync(this.tileRuntimeStatePath, 'utf-8')) as PersistedTileRuntimeSnapshot;
        await this.persistentDocumentService.save(RUNTIME_STATE_SCOPE, MAP_TILE_RUNTIME_DOCUMENT_KEY, snapshot);
        this.logger.log('已从旧地块运行时 JSON 导入 PostgreSQL');
        return;
      } catch (error) {
/** message：定义该变量以承载业务值。 */
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`导入旧地块运行时 JSON 失败: ${message}`);
      }
    }

    this.loadLegacyPersistedTileRuntimeStates();
    if (
      this.persistedDynamicTileStates.size === 0
      && this.persistedResourceStates.size === 0
      && this.persistedMapTimeStates.size === 0
    ) {
      return;
    }

    await this.persistentDocumentService.save(
      RUNTIME_STATE_SCOPE,
      MAP_TILE_RUNTIME_DOCUMENT_KEY,
      this.buildPersistedTileRuntimeSnapshotFromState(),
    );
    this.logger.log('已从旧版动态地块 JSON 导入 PostgreSQL');
  }

/** loadLegacyPersistedTileRuntimeStates：处理当前场景中的对应操作。 */
  private loadLegacyPersistedTileRuntimeStates() {
    this.loadLegacyPersistedDynamicTileStates();
    this.loadLegacyPersistedAuraStates();
  }

/** loadLegacyPersistedDynamicTileStates：处理当前场景中的对应操作。 */
  private loadLegacyPersistedDynamicTileStates() {
    if (!fs.existsSync(this.legacyDynamicTileStatePath)) {
      return;
    }

    try {
/** snapshot：定义该变量以承载业务值。 */
      const snapshot = JSON.parse(fs.readFileSync(this.legacyDynamicTileStatePath, 'utf-8')) as Partial<PersistedDynamicTileSnapshot>;
/** rawMaps：定义该变量以承载业务值。 */
      const rawMaps = snapshot?.maps;
      if (!rawMaps || typeof rawMaps !== 'object') {
        this.logger.warn('旧动态地块持久化文件格式非法，已忽略');
        return;
      }

      for (const [mapId, rawRecords] of Object.entries(rawMaps)) {
        if (!Array.isArray(rawRecords)) {
          continue;
        }
/** records：定义该变量以承载业务值。 */
        const records = new Map<string, PersistedDynamicTileRecord>();
        for (const rawRecord of rawRecords) {
          const record = rawRecord as Partial<PersistedDynamicTileRecord>;
          if (
            !Number.isInteger(record.x)
            || !Number.isInteger(record.y)
            || !Number.isFinite(record.hp)
            || typeof record.destroyed !== 'boolean'
          ) {
            continue;
          }
/** normalized：定义该变量以承载业务值。 */
          const normalized: PersistedDynamicTileRecord = {
            x: Number(record.x),
            y: Number(record.y),
            hp: Math.max(0, Math.round(Number(record.hp))),
            destroyed: record.destroyed,
            restoreTicksLeft: record.destroyed
              ? this.normalizeRestoreTicksLeft(
                record.restoreTicksLeft,
                this.getBaseTileType(mapId, Number(record.x), Number(record.y)) ?? TileType.Floor,
              )
              : undefined,
            transformedType: Object.values(TileType).includes(record.transformedType as TileType)
              ? record.transformedType as TileType
              : undefined,
            transformTicksLeft: Object.values(TileType).includes(record.transformedType as TileType)
              ? this.normalizeTransformTicksLeft(record.transformTicksLeft)
              : undefined,
          };
          records.set(this.tileStateKey(normalized.x, normalized.y), normalized);
        }
        if (records.size > 0) {
          this.persistedDynamicTileStates.set(mapId, records);
        }
      }
    } catch (error) {
/** message：定义该变量以承载业务值。 */
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`读取旧动态地块持久化文件失败: ${message}`);
    }
  }

/** loadLegacyPersistedAuraStates：处理当前场景中的对应操作。 */
  private loadLegacyPersistedAuraStates() {
    if (!fs.existsSync(this.legacyAuraStatePath)) {
      return;
    }

    try {
/** snapshot：定义该变量以承载业务值。 */
      const snapshot = JSON.parse(fs.readFileSync(this.legacyAuraStatePath, 'utf-8')) as Partial<PersistedAuraSnapshot>;
/** rawMaps：定义该变量以承载业务值。 */
      const rawMaps = snapshot?.maps;
      if (!rawMaps || typeof rawMaps !== 'object') {
        this.logger.warn('旧灵气持久化文件格式非法，已忽略');
        return;
      }

      for (const [mapId, rawRecords] of Object.entries(rawMaps)) {
        if (!Array.isArray(rawRecords)) {
          continue;
        }
/** records：定义该变量以承载业务值。 */
        const records = new Map<string, TileResourceRuntimeState>();
        for (const rawRecord of rawRecords) {
          const record = rawRecord as Partial<PersistedAuraRecord>;
          if (
            !Number.isInteger(record.x)
            || !Number.isInteger(record.y)
            || !Number.isFinite(record.value)
          ) {
            continue;
          }
/** normalized：定义该变量以承载业务值。 */
          const normalized = this.normalizeTileResourceRuntimeState(record.x, record.y, record);
          if (!normalized) {
            continue;
          }
          records.set(this.tileStateKey(normalized.x, normalized.y), normalized);
        }
        if (records.size > 0) {
          this.setTileResourceStateMap(this.persistedResourceStates, mapId, AURA_RESOURCE_KEY, records);
        }
      }
    } catch (error) {
/** message：定义该变量以承载业务值。 */
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`读取旧灵气持久化文件失败: ${message}`);
    }
  }

/** buildPersistedTileRuntimeSnapshotFromState：执行对应的业务逻辑。 */
  private buildPersistedTileRuntimeSnapshotFromState(): PersistedTileRuntimeSnapshot {
/** snapshot：定义该变量以承载业务值。 */
    const snapshot: PersistedTileRuntimeSnapshot = {
      version: 2,
      maps: {},
    };

/** allMapIds：定义该变量以承载业务值。 */
    const allMapIds = [...new Set([
      ...this.persistedDynamicTileStates.keys(),
      ...this.persistedResourceStates.keys(),
    ])].sort((left, right) => left.localeCompare(right, 'zh-CN'));

    for (const mapId of allMapIds) {
      const records = this.buildPersistedTileRuntimeRecords(
        this.persistedDynamicTileStates.get(mapId),
        this.persistedResourceStates.get(mapId),
      );
      if (records.length > 0) {
        snapshot.maps[mapId] = records;
      }
    }

/** allTimeMapIds：定义该变量以承载业务值。 */
    const allTimeMapIds = [...this.persistedMapTimeStates.keys()]
      .sort((left, right) => left.localeCompare(right, 'zh-CN'));
    for (const mapId of allTimeMapIds) {
      const state = this.persistedMapTimeStates.get(mapId);
      if (!state) {
        continue;
      }
/** record：定义该变量以承载业务值。 */
      const record = this.buildPersistedMapTimeRecord(mapId, false);
      if (!record) {
        continue;
      }
      snapshot.time ??= {};
      snapshot.time[mapId] = record;
    }

    return snapshot;
  }

/** syncMapDocumentsFromFiles：执行对应的业务逻辑。 */
  private async syncMapDocumentsFromFiles(): Promise<SyncedMapDocument[]> {
    return this.documentDomain.syncMapDocumentsFromFiles();
  }

/** loadAllMaps：处理当前场景中的对应操作。 */
  private loadAllMaps(entries: SyncedMapDocument[]) {
    this.contentService.ensureLoaded();
    for (const entry of entries) {
      this.loadMap(entry.document, entry.previousDocument);
    }
    this.rebuildMapConditionAliases();
    this.rebuildAllMinimapSnapshots();
    this.reloadQuestBindingsFromFiles();
    this.logger.log(`已加载 ${this.maps.size} 张地图`);
  }

/** rebuildMapConditionAliases：执行对应的业务逻辑。 */
  private rebuildMapConditionAliases(): void {
/** aliasesById：定义该变量以承载业务值。 */
    const aliasesById = new Map<string, Set<string>>();
    for (const mapId of this.maps.keys()) {
      aliasesById.set(mapId, new Set([mapId]));
    }

/** catalogMetaById：定义该变量以承载业务值。 */
    const catalogMetaById = this.documentDomain.buildEditableMapCatalogMetaById();
    for (const [mapId, meta] of catalogMetaById.entries()) {
      const aliases = aliasesById.get(mapId);
      if (!aliases) {
        continue;
      }
      if (meta.catalogMode === 'piece' && typeof meta.catalogGroupId === 'string' && meta.catalogGroupId.trim().length > 0) {
        aliases.add(meta.catalogGroupId);
      }
    }

    for (const [mapId, map] of this.maps.entries()) {
      if (typeof map.meta.parentMapId === 'string' && map.meta.parentMapId.trim().length > 0) {
        aliasesById.get(mapId)?.add(map.meta.parentMapId);
      }
    }

    this.mapConditionAliasesById = new Map(
      [...aliasesById.entries()].map(([mapId, aliases]) => [mapId, new Set(aliases)]),
    );
  }

/** matchesMapCondition：执行对应的业务逻辑。 */
  matchesMapCondition(currentMapId: string, expectedMapIds: readonly string[]): boolean {
    if (expectedMapIds.length === 0) {
      return false;
    }
/** aliases：定义该变量以承载业务值。 */
    const aliases = this.mapConditionAliasesById.get(currentMapId);
    if (!aliases || aliases.size === 0) {
      return expectedMapIds.includes(currentMapId);
    }
    for (const expectedMapId of expectedMapIds) {
      if (aliases.has(expectedMapId)) {
        return true;
      }
    }
    return false;
  }

/** loadMap：处理当前场景中的对应操作。 */
  private loadMap(raw: unknown, previousDocument?: GmMapDocument) {
/** document：定义该变量以承载业务值。 */
    const document = this.editableDomain.normalizeEditableMapDocument(raw);
/** tileRows：定义该变量以承载业务值。 */
    const tileRows = document.tiles;
/** tiles：定义该变量以承载业务值。 */
    const tiles: Tile[][] = tileRows.map((row, y) =>
      [...row].map((char, x) => {
/** type：定义该变量以承载业务值。 */
        const type = getTileTypeFromMapChar(char);
/** durability：定义该变量以承载业务值。 */
        const durability = this.tileDurabilityFromDocument(document, type);
        return {
          type,
          walkable: isTileTypeWalkable(type),
          blocksSight: doesTileTypeBlockSight(type),
          aura: 0,
          occupiedBy: null,
          modifiedAt: null,
          hp: durability > 0 ? durability : undefined,
          maxHp: durability > 0 ? durability : undefined,
          hpVisible: false,
        };
      }),
    );
/** meta：定义该变量以承载业务值。 */
    const meta: MapMeta = {
      id: document.id,
      name: document.name,
      width: document.width,
      height: document.height,
      routeDomain: this.normalizeMapRouteDomain(document.routeDomain),
/** parentMapId：定义该变量以承载业务值。 */
      parentMapId: typeof document.parentMapId === 'string' && document.parentMapId.trim()
        ? document.parentMapId
        : undefined,
      parentOriginX: Number.isInteger(document.parentOriginX) ? Number(document.parentOriginX) : undefined,
      parentOriginY: Number.isInteger(document.parentOriginY) ? Number(document.parentOriginY) : undefined,
      floorLevel: Number.isInteger(document.floorLevel) ? Number(document.floorLevel) : undefined,
/** floorName：定义该变量以承载业务值。 */
      floorName: typeof document.floorName === 'string' && document.floorName.trim()
        ? document.floorName
        : undefined,
      spaceVisionMode: this.normalizeMapSpaceVisionMode(document.spaceVisionMode, document.parentMapId),
      dangerLevel: Number.isFinite(document.dangerLevel) ? Number(document.dangerLevel) : undefined,
/** recommendedRealm：定义该变量以承载业务值。 */
      recommendedRealm: typeof document.recommendedRealm === 'string' ? document.recommendedRealm : undefined,
/** description：定义该变量以承载业务值。 */
      description: typeof document.description === 'string' ? document.description : undefined,
    };
/** portals：定义该变量以承载业务值。 */
    const portals = this.normalizePortals(document.portals, meta);
/** auraPoints：定义该变量以承载业务值。 */
    const auraPoints = this.normalizeAuraPoints(document.auras, meta);
/** resourcePoints：定义该变量以承载业务值。 */
    const resourcePoints = this.normalizeTileResourcePoints(document.resources, meta);
/** safeZones：定义该变量以承载业务值。 */
    const safeZones = this.normalizeSafeZones(document.safeZones, meta);
/** baseAuraValues：定义该变量以承载业务值。 */
    const baseAuraValues = new Map<string, number>(auraPoints.map((point) => [this.tileStateKey(point.x, point.y), point.value]));
/** baseResourceValues：定义该变量以承载业务值。 */
    const baseResourceValues = this.buildBaseTileResourceValueBucket(resourcePoints);

    // 显式入口需要落成楼梯/传送阵地块；隐藏入口则保留原始地貌，只通过 portal 配置参与触发与观察。
    for (const portal of portals) {
      const tile = tiles[portal.y]?.[portal.x];
      if (tile) {
        if (!portal.hidden) {
          tile.type = portal.kind === 'stairs' ? TileType.Stairs : TileType.Portal;
          tile.walkable = true;
          tile.blocksSight = false;
        }
      }
    }

    for (const point of auraPoints) {
      const tile = tiles[point.y]?.[point.x];
      if (tile) {
        tile.aura = point.value;
      }
    }

    this.rehydrateDynamicTileStates(document.id, document, tiles, previousDocument);
    this.rehydrateAuraStates(document.id, tiles, baseAuraValues);
    this.rehydrateConfiguredTileResourceStates(document.id, tiles, baseResourceValues);
    this.syncAuraFamilyTileMirrors(document.id, tiles);

/** expandedLandmarks：定义该变量以承载业务值。 */
    const expandedLandmarks = expandMapResourceNodeGroups(document);
/** containers：定义该变量以承载业务值。 */
    const containers = this.normalizeContainers(expandedLandmarks, meta);
/** npcs：定义该变量以承载业务值。 */
    const npcs = this.normalizeNpcs(document.npcs, meta);
/** monsterSpawns：定义该变量以承载业务值。 */
    const monsterSpawns = this.normalizeMonsterSpawns(document.monsterSpawns, meta);
/** minimap：定义该变量以承载业务值。 */
    const minimap = this.buildMinimapSnapshot(meta, document, portals, containers, npcs, monsterSpawns);

    for (const monster of monsterSpawns) {
      this.monsters.set(monster.id, monster);
    }

    this.maps.set(document.id, {
      meta,
      tiles,
      portals,
      auraPoints,
      baseAuraValues,
      baseResourceValues,
      safeZones,
      containers,
      npcs,
      monsterSpawns,
      minimap,
      minimapSignature: JSON.stringify(minimap),
      spawnPoint: { ...document.spawnPoint },
      source: document,
    });
    this.rebuildAllMinimapSnapshots();
    this.rebuildPlayerOverlapPointIndex();
    this.syncOccupancyDisplay(document.id);
    this.revisions.set(document.id, (this.revisions.get(document.id) ?? 0) + 1);
  }

/** rebuildAllMinimapSnapshots：执行对应的业务逻辑。 */
  private rebuildAllMinimapSnapshots(): void {
    for (const map of this.maps.values()) {
      const next = this.buildMinimapSnapshot(
        map.meta,
        map.source,
        map.portals,
        map.containers,
        map.npcs,
        map.monsterSpawns,
      );
      map.minimap = next;
      map.minimapSignature = JSON.stringify(next);
    }
  }

/** getEditableMapList：执行对应的业务逻辑。 */
  getEditableMapList(): GmMapListRes {
    return this.documentDomain.getEditableMapList();
  }

/** getEditableMap：执行对应的业务逻辑。 */
  getEditableMap(mapId: string): GmMapDocument | undefined {
    return this.documentDomain.getEditableMap(mapId);
  }

/** saveEditableMap：执行对应的业务逻辑。 */
  async saveEditableMap(mapId: string, document: GmMapDocument): Promise<string | null> {
    return this.documentDomain.saveEditableMap(mapId, document);
  }

/** persistDynamicTileStates：处理当前场景中的对应操作。 */
  persistDynamicTileStates() {
    return this.persistTileRuntimeStates();
  }

/** persistAuraStates：处理当前场景中的对应操作。 */
  persistAuraStates() {
    return this.persistTileRuntimeStates();
  }

/** persistTileRuntimeStates：处理当前场景中的对应操作。 */
  async persistTileRuntimeStates() {
    if (!this.dynamicTileStatesDirty && !this.resourceStatesDirty && !this.mapTimeStatesDirty) {
      return;
    }

    try {
      for (const mapId of this.dirtyTileRuntimeMapIds) {
        const records = this.buildPersistedTileRuntimeRecords(
          this.dynamicTileStates.get(mapId),
          this.resourceStates.get(mapId),
        );
        if (records.length > 0) {
          this.runtimeSnapshotCache.maps[mapId] = records;
        } else {
          delete this.runtimeSnapshotCache.maps[mapId];
        }
      }
      for (const mapId of this.dirtyMapTimeStateMapIds) {
        const record = this.buildPersistedMapTimeRecord(mapId);
        if (record) {
          this.runtimeSnapshotCache.time ??= {};
          this.runtimeSnapshotCache.time[mapId] = record;
        } else if (this.runtimeSnapshotCache.time) {
          delete this.runtimeSnapshotCache.time[mapId];
          if (Object.keys(this.runtimeSnapshotCache.time).length === 0) {
            delete this.runtimeSnapshotCache.time;
          }
        }
      }

      await this.persistentDocumentService.save(RUNTIME_STATE_SCOPE, MAP_TILE_RUNTIME_DOCUMENT_KEY, this.runtimeSnapshotCache);
      this.dynamicTileStatesDirty = false;
      this.resourceStatesDirty = false;
      this.mapTimeStatesDirty = false;
      this.dirtyTileRuntimeMapIds.clear();
      this.dirtyMapTimeStateMapIds.clear();
    } catch (error) {
/** message：定义该变量以承载业务值。 */
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`地块运行时持久化到 PostgreSQL 失败: ${message}`);
    }
  }

/** tickDynamicTiles：处理当前场景中的对应操作。 */
  tickDynamicTiles(mapId: string) {
/** stateMap：定义该变量以承载业务值。 */
    const stateMap = this.dynamicTileStates.get(mapId);
/** resourceStateBucket：定义该变量以承载业务值。 */
    const resourceStateBucket = this.resourceStates.get(mapId);
/** tickingResourceKeys：定义该变量以承载业务值。 */
    const tickingResourceKeys = resourceStateBucket
      ? Object.keys(TILE_RESOURCE_FLOW_CONFIGS).filter((resourceKey) => (resourceStateBucket.get(resourceKey)?.size ?? 0) > 0)
      : [];
    if ((!stateMap || stateMap.size === 0) && tickingResourceKeys.length === 0) {
      return;
    }

/** terrainStateChanged：定义该变量以承载业务值。 */
    let terrainStateChanged = false;
/** resourceStateChanged：定义该变量以承载业务值。 */
    let resourceStateChanged = false;
/** visibilityChanged：定义该变量以承载业务值。 */
    let visibilityChanged = false;
    if (stateMap) {
      for (const [key, state] of stateMap) {
        if (!state.transformedType && state.hp < state.maxHp) {
          const regen = this.calculateTileRegen(state.maxHp);
/** nextHp：定义该变量以承载业务值。 */
          const nextHp = Math.min(state.maxHp, state.hp + regen);
          if (nextHp !== state.hp) {
            state.hp = nextHp;
            terrainStateChanged = true;
            this.markTileDirty(mapId, state.x, state.y);
          }
        }

        if (state.destroyed) {
/** nextRestoreTicksLeft：定义该变量以承载业务值。 */
          const nextRestoreTicksLeft = Math.max(0, (state.restoreTicksLeft ?? 0) - 1);
          if (nextRestoreTicksLeft !== (state.restoreTicksLeft ?? 0)) {
            state.restoreTicksLeft = nextRestoreTicksLeft;
            terrainStateChanged = true;
            this.markTileDirty(mapId, state.x, state.y);
          }

          if ((state.restoreTicksLeft ?? 0) <= 0) {
            if (this.hasBlockingEntityAt(mapId, state.x, state.y)) {
              state.restoreTicksLeft = this.calculateTileRestoreRetryTicks(state.originalType);
              terrainStateChanged = true;
              this.markTileDirty(mapId, state.x, state.y);
            } else {
              state.destroyed = false;
              state.restoreTicksLeft = undefined;
              terrainStateChanged = true;
              visibilityChanged = true;
              this.markTileDirty(mapId, state.x, state.y);
            }
          }
        }

        if (state.transformedType) {
/** nextTransformTicksLeft：定义该变量以承载业务值。 */
          const nextTransformTicksLeft = Math.max(0, (state.transformTicksLeft ?? 0) - 1);
          if (nextTransformTicksLeft !== (state.transformTicksLeft ?? 0)) {
            state.transformTicksLeft = nextTransformTicksLeft;
            terrainStateChanged = true;
            this.markTileDirty(mapId, state.x, state.y);
          }

          if ((state.transformTicksLeft ?? 0) <= 0) {
/** originalWalkable：定义该变量以承载业务值。 */
            const originalWalkable = isTileTypeWalkable(state.originalType);
            if (!originalWalkable && this.hasBlockingEntityAt(mapId, state.x, state.y)) {
              state.transformTicksLeft = 1;
              terrainStateChanged = true;
              this.markTileDirty(mapId, state.x, state.y);
            } else {
              state.transformedType = undefined;
              state.transformTicksLeft = undefined;
              terrainStateChanged = true;
              visibilityChanged = true;
              this.markTileDirty(mapId, state.x, state.y);
            }
          }
        }

/** tile：定义该变量以承载业务值。 */
        const tile = this.getTile(mapId, state.x, state.y);
        if (!tile) {
          stateMap.delete(key);
          terrainStateChanged = true;
          continue;
        }

        if (!this.shouldKeepDynamicTileState(state)) {
          stateMap.delete(key);
          this.resetTileToBaseState(mapId, state.x, state.y);
          terrainStateChanged = true;
          this.markTileDirty(mapId, state.x, state.y);
          continue;
        }

        this.applyDynamicTileStateToTile(tile, state);
      }
    }

    if (resourceStateBucket) {
      for (const resourceKey of tickingResourceKeys) {
        const tickingResourceStateMap = resourceStateBucket.get(resourceKey);
        if (!tickingResourceStateMap) {
          continue;
        }

        for (const [key, state] of tickingResourceStateMap) {
          const tile = this.getTile(mapId, state.x, state.y);
          if (!tile) {
            tickingResourceStateMap.delete(key);
            resourceStateChanged = true;
            continue;
          }

/** previousAuraValue：定义该变量以承载业务值。 */
          const previousAuraValue = tile.aura ?? 0;
          if (this.tickTileResourceState(resourceKey, state)) {
            resourceStateChanged = true;
          }

          if (!this.shouldKeepTileResourceRuntimeState(state)) {
            tickingResourceStateMap.delete(key);
            resourceStateChanged = true;
          }

          if (parseQiResourceKey(resourceKey)) {
/** nextAuraValue：定义该变量以承载业务值。 */
            const nextAuraValue = this.syncTileAuraValue(mapId, state.x, state.y, resourceStateBucket, tile);
            if (getAuraLevel(nextAuraValue, this.auraLevelBaseValue) !== getAuraLevel(previousAuraValue, this.auraLevelBaseValue)) {
              this.markTileDirty(mapId, state.x, state.y);
            }
          }
        }

        if (tickingResourceStateMap.size === 0) {
          resourceStateBucket.delete(resourceKey);
        }
      }
    }

    if (stateMap?.size === 0) {
      this.dynamicTileStates.delete(mapId);
    }
    if (resourceStateBucket?.size === 0) {
      this.resourceStates.delete(mapId);
    }
    if (visibilityChanged) {
      this.bumpMapRevision(mapId);
    }
    if (stateMap && terrainStateChanged) {
      this.dynamicTileStatesDirty = true;
      this.markTileRuntimeMapDirty(mapId);
    }
    if (resourceStateChanged) {
      this.resourceStatesDirty = true;
      this.markTileRuntimeMapDirty(mapId);
    }
  }

/** rehydrateDynamicTileStates：处理当前场景中的对应操作。 */
  private rehydrateDynamicTileStates(mapId: string, document: GmMapDocument, tiles: Tile[][], previousDocument?: GmMapDocument) {
/** persistedSourceStates：定义该变量以承载业务值。 */
    const persistedSourceStates = this.persistedDynamicTileStates.get(mapId);
/** sourceStates：定义该变量以承载业务值。 */
    const sourceStates = this.dynamicTileStates.get(mapId) ?? persistedSourceStates;
    if (!sourceStates || sourceStates.size === 0) {
      this.dynamicTileStates.delete(mapId);
      if (persistedSourceStates) {
        this.persistedDynamicTileStates.delete(mapId);
      }
      return;
    }

/** sourceCount：定义该变量以承载业务值。 */
    const sourceCount = sourceStates.size;
/** nextStates：定义该变量以承载业务值。 */
    const nextStates = new Map<string, DynamicTileState>();
    for (const rawState of sourceStates.values()) {
      if (this.hasStaticTerrainConflict(previousDocument, document, rawState.x, rawState.y)) {
        continue;
      }
/** originalType：定义该变量以承载业务值。 */
      const originalType = getTileTypeFromMapChar(document.tiles[rawState.y]?.[rawState.x] ?? '#');
/** maxHp：定义该变量以承载业务值。 */
      const maxHp = this.tileDurabilityFromDocument(document, originalType);
/** tile：定义该变量以承载业务值。 */
      const tile = tiles[rawState.y]?.[rawState.x];
/** transformedType：定义该变量以承载业务值。 */
      const transformedType = Object.values(TileType).includes(rawState.transformedType as TileType)
        ? rawState.transformedType as TileType
        : undefined;
      if (!tile || (maxHp <= 0 && !transformedType)) {
        continue;
      }

/** hp：定义该变量以承载业务值。 */
      const hp = Math.max(0, Math.min(maxHp, Math.round(rawState.hp)));
/** destroyed：定义该变量以承载业务值。 */
      const destroyed = rawState.destroyed === true;
/** normalized：定义该变量以承载业务值。 */
      const normalized: DynamicTileState = {
        x: rawState.x,
        y: rawState.y,
        originalType,
        hp,
        maxHp,
        destroyed,
        restoreTicksLeft: destroyed
          ? this.normalizeRestoreTicksLeft(rawState.restoreTicksLeft, originalType)
          : undefined,
        transformedType,
        transformTicksLeft: transformedType ? this.normalizeTransformTicksLeft(rawState.transformTicksLeft) : undefined,
      };

      if (!this.shouldKeepDynamicTileState(normalized)) {
        continue;
      }

      this.applyDynamicTileStateToTile(tile, normalized);
      nextStates.set(this.tileStateKey(normalized.x, normalized.y), normalized);
    }

    if (nextStates.size === 0) {
      this.dynamicTileStates.delete(mapId);
      if (sourceCount > 0) {
        this.dynamicTileStatesDirty = true;
        this.markTileRuntimeMapDirty(mapId);
      }
      if (persistedSourceStates) {
        this.persistedDynamicTileStates.delete(mapId);
      }
      return;
    }
    this.dynamicTileStates.set(mapId, nextStates);
    if (nextStates.size !== sourceCount) {
      this.dynamicTileStatesDirty = true;
      this.markTileRuntimeMapDirty(mapId);
    }
    if (persistedSourceStates) {
      this.persistedDynamicTileStates.delete(mapId);
    }
  }

/** rehydrateAuraStates：处理当前场景中的对应操作。 */
  private rehydrateAuraStates(mapId: string, tiles: Tile[][], baseAuraValues: Map<string, number>) {
/** persistedSourceStates：定义该变量以承载业务值。 */
    const persistedSourceStates = this.getTileResourceStateMap(this.persistedResourceStates, mapId, AURA_RESOURCE_KEY);
/** sourceStates：定义该变量以承载业务值。 */
    const sourceStates = this.getTileResourceStateMap(this.resourceStates, mapId, AURA_RESOURCE_KEY) ?? persistedSourceStates;
/** sourceCount：定义该变量以承载业务值。 */
    const sourceCount = sourceStates?.size ?? 0;
/** nextStates：定义该变量以承载业务值。 */
    const nextStates = new Map<string, TileResourceRuntimeState>();

    for (const [key, sourceValue] of baseAuraValues.entries()) {
      const persisted = sourceStates?.get(key);
      const [x, y] = key.split(',').map((value) => Number.parseInt(value, 10));
/** tile：定义该变量以承载业务值。 */
      const tile = tiles[y]?.[x];
      if (!tile) {
        continue;
      }
/** state：定义该变量以承载业务值。 */
      const state: TileResourceRuntimeState = {
        x,
        y,
        value: Math.max(0, Math.round(persisted?.value ?? sourceValue)),
        sourceValue,
        decayRemainder: Math.max(0, Math.round(persisted?.decayRemainder ?? 0)),
        sourceRemainder: Math.max(0, Math.round(persisted?.sourceRemainder ?? 0)),
      };
      tile.aura = state.value;
      nextStates.set(key, state);
    }

    if (sourceStates) {
      for (const [key, rawState] of sourceStates.entries()) {
        if (nextStates.has(key)) {
          continue;
        }
/** tile：定义该变量以承载业务值。 */
        const tile = tiles[rawState.y]?.[rawState.x];
        if (!tile) {
          continue;
        }
/** state：定义该变量以承载业务值。 */
        const state: TileResourceRuntimeState = {
          x: rawState.x,
          y: rawState.y,
          value: Math.max(0, Math.round(rawState.value)),
          sourceValue: 0,
          decayRemainder: Math.max(0, Math.round(rawState.decayRemainder ?? 0)),
          sourceRemainder: Math.max(0, Math.round(rawState.sourceRemainder ?? 0)),
        };
        tile.aura = state.value;
        if (this.shouldKeepTileResourceRuntimeState(state)) {
          nextStates.set(key, state);
        }
      }
    }

    if (nextStates.size === 0) {
      this.deleteTileResourceStateMap(this.resourceStates, mapId, AURA_RESOURCE_KEY);
      if (sourceCount > 0) {
        this.resourceStatesDirty = true;
        this.markTileRuntimeMapDirty(mapId);
      }
      if (persistedSourceStates) {
        this.deleteTileResourceStateMap(this.persistedResourceStates, mapId, AURA_RESOURCE_KEY);
      }
      return;
    }
    this.setTileResourceStateMap(this.resourceStates, mapId, AURA_RESOURCE_KEY, nextStates);
    if (nextStates.size !== sourceCount) {
      this.resourceStatesDirty = true;
      this.markTileRuntimeMapDirty(mapId);
    }
    if (persistedSourceStates) {
      this.deleteTileResourceStateMap(this.persistedResourceStates, mapId, AURA_RESOURCE_KEY);
    }
  }

/** applyDynamicTileStateToTile：处理当前场景中的对应操作。 */
  private applyDynamicTileStateToTile(tile: Tile, state: DynamicTileState) {
/** type：定义该变量以承载业务值。 */
    const type = state.destroyed
      ? this.destroyedTileType(state.originalType)
      : (state.transformedType ?? state.originalType);
    tile.type = type;
    tile.walkable = isTileTypeWalkable(type);
    tile.blocksSight = doesTileTypeBlockSight(type);
/** shouldShowDurability：定义该变量以承载业务值。 */
    const shouldShowDurability = !state.destroyed && !state.transformedType && state.maxHp > 0;
    tile.hp = shouldShowDurability ? state.hp : undefined;
    tile.maxHp = shouldShowDurability ? state.maxHp : undefined;
    tile.hpVisible = shouldShowDurability && state.hp < state.maxHp;
    tile.modifiedAt = state.destroyed || !!state.transformedType || state.hp < state.maxHp ? Date.now() : null;
  }

/** resetTileToBaseState：处理当前场景中的对应操作。 */
  private resetTileToBaseState(mapId: string, x: number, y: number) {
/** tile：定义该变量以承载业务值。 */
    const tile = this.getTile(mapId, x, y);
/** originalType：定义该变量以承载业务值。 */
    const originalType = this.getBaseTileType(mapId, x, y);
    if (!tile || originalType === null) {
      return;
    }

/** maxHp：定义该变量以承载业务值。 */
    const maxHp = this.tileDurability(mapId, originalType);
    tile.type = originalType;
    tile.walkable = isTileTypeWalkable(originalType);
    tile.blocksSight = doesTileTypeBlockSight(originalType);
    tile.hp = maxHp > 0 ? maxHp : undefined;
    tile.maxHp = maxHp > 0 ? maxHp : undefined;
    tile.hpVisible = false;
    tile.modifiedAt = null;
  }

/** shouldKeepDynamicTileState：执行对应的业务逻辑。 */
  private shouldKeepDynamicTileState(state: Pick<DynamicTileState, 'destroyed' | 'hp' | 'maxHp' | 'transformedType'>): boolean {
    return state.destroyed || state.hp < state.maxHp || state.transformedType !== undefined;
  }

  private hasStaticTerrainConflict(
    previousDocument: GmMapDocument | undefined,
    nextDocument: GmMapDocument,
    x: number,
    y: number,
  ): boolean {
    if (!previousDocument) {
      return false;
    }

/** previousType：定义该变量以承载业务值。 */
    const previousType = this.getTileTypeFromDocument(previousDocument, x, y);
/** nextType：定义该变量以承载业务值。 */
    const nextType = this.getTileTypeFromDocument(nextDocument, x, y);
    if (previousType !== nextType) {
      return true;
    }
    if (previousType === null || nextType === null) {
      return previousType !== nextType;
    }
    return this.tileDurabilityFromDocument(previousDocument, previousType) !== this.tileDurabilityFromDocument(nextDocument, nextType);
  }

/** getBaseTileType：执行对应的业务逻辑。 */
  private getBaseTileType(mapId: string, x: number, y: number): TileType | null {
/** row：定义该变量以承载业务值。 */
    const row = this.maps.get(mapId)?.source.tiles[y];
    if (!row) {
      return null;
    }
    return getTileTypeFromMapChar(row[x] ?? '#');
  }

/** getTileTypeFromDocument：执行对应的业务逻辑。 */
  private getTileTypeFromDocument(document: GmMapDocument, x: number, y: number): TileType | null {
/** row：定义该变量以承载业务值。 */
    const row = document.tiles[y];
    if (typeof row !== 'string' || x < 0 || x >= row.length) {
      return null;
    }
    return getTileTypeFromMapChar(row[x] ?? '#');
  }

/** tileDurabilityFromDocument：执行对应的业务逻辑。 */
  private tileDurabilityFromDocument(document: GmMapDocument, type: TileType): number {
/** profileId：定义该变量以承载业务值。 */
    const profileId = document.terrainProfileId
      ?? LEGACY_MAP_TERRAIN_PROFILE_IDS[document.id]
      ?? document.id;
/** profile：定义该变量以承载业务值。 */
    const profile = this.resolveTerrainDurabilityProfile(profileId, type);
    if (!profile) {
      return 0;
    }
/** terrainRealmLv：定义该变量以承载业务值。 */
    const terrainRealmLv = this.resolveTerrainRealmLvFromDocument(document);
    return calculateTerrainDurability(terrainRealmLv, profile.multiplier);
  }

/** hasBlockingEntityAt：执行对应的业务逻辑。 */
  private hasBlockingEntityAt(mapId: string, x: number, y: number): boolean {
/** occupants：定义该变量以承载业务值。 */
    const occupants = this.occupantsByMap.get(mapId)?.get(this.tileStateKey(x, y));
    return (occupants?.size ?? 0) > 0 || this.hasNpcAt(mapId, x, y);
  }

/** rebuildPlayerOverlapPointIndex：执行对应的业务逻辑。 */
  private rebuildPlayerOverlapPointIndex(): void {
    this.occupancyDomain.rebuildPlayerOverlapPointIndex();
  }

/** hasOccupant：执行对应的业务逻辑。 */
  hasOccupant(mapId: string, x: number, y: number, occupancyId: string): boolean {
    return this.occupancyDomain.hasOccupant(mapId, x, y, occupancyId);
  }

/** syncOccupancyDisplay：执行对应的业务逻辑。 */
  private syncOccupancyDisplay(mapId: string, x?: number, y?: number): void {
/** map：定义该变量以承载业务值。 */
    const map = this.maps.get(mapId);
    if (!map) {
      return;
    }
    if (x !== undefined && y !== undefined) {
/** tile：定义该变量以承载业务值。 */
      const tile = map.tiles[y]?.[x];
      if (!tile) {
        return;
      }
/** occupants：定义该变量以承载业务值。 */
      const occupants = this.occupantsByMap.get(mapId)?.get(this.tileStateKey(x, y));
      tile.occupiedBy = occupants ? [...occupants.keys()][0] ?? null : null;
      return;
    }
    for (let rowIndex = 0; rowIndex < map.tiles.length; rowIndex += 1) {
      const row = map.tiles[rowIndex];
      if (!row) {
        continue;
      }
      for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
        const tile = row[colIndex];
        if (!tile) {
          continue;
        }
/** occupants：定义该变量以承载业务值。 */
        const occupants = this.occupantsByMap.get(mapId)?.get(this.tileStateKey(colIndex, rowIndex));
        tile.occupiedBy = occupants ? [...occupants.keys()][0] ?? null : null;
      }
    }
  }

/** calculateTileRegen：执行对应的业务逻辑。 */
  private calculateTileRegen(maxHp: number): number {
    return Math.max(1, Math.floor(maxHp * TERRAIN_REGEN_RATE_PER_TICK));
  }

/** getTileRestoreSpeedMultiplier：执行对应的业务逻辑。 */
  private getTileRestoreSpeedMultiplier(type: TileType): number {
/** configured：定义该变量以承载业务值。 */
    const configured = SPECIAL_TILE_RESTORE_SPEED_MULTIPLIERS[type] ?? 1;
    return Number.isFinite(configured) && configured > 0 ? configured : 1;
  }

/** calculateTileRestoreTicks：执行对应的业务逻辑。 */
  private calculateTileRestoreTicks(type: TileType): number {
    return Math.max(1, Math.ceil(TERRAIN_DESTROYED_RESTORE_TICKS / this.getTileRestoreSpeedMultiplier(type)));
  }

/** calculateTileRestoreRetryTicks：执行对应的业务逻辑。 */
  private calculateTileRestoreRetryTicks(type: TileType): number {
    return Math.max(1, Math.ceil(TERRAIN_RESTORE_RETRY_DELAY_TICKS / this.getTileRestoreSpeedMultiplier(type)));
  }

/** normalizeRestoreTicksLeft：执行对应的业务逻辑。 */
  private normalizeRestoreTicksLeft(value: unknown, type: TileType): number {
    return Number.isInteger(value) && Number(value) > 0
      ? Number(value)
      : this.calculateTileRestoreTicks(type);
  }

/** normalizeTransformTicksLeft：执行对应的业务逻辑。 */
  private normalizeTransformTicksLeft(value: unknown): number | undefined {
    return Number.isInteger(value) && Number(value) > 0
      ? Number(value)
      : undefined;
  }

/** getStoredMapTimeState：执行对应的业务逻辑。 */
  private getStoredMapTimeState(mapId: string): PersistedMapTimeState | undefined {
    return this.mapTimeStates.get(mapId) ?? this.persistedMapTimeStates.get(mapId);
  }

/** normalizePersistedMapTimeState：执行对应的业务逻辑。 */
  private normalizePersistedMapTimeState(raw: unknown): PersistedMapTimeState | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

/** candidate：定义该变量以承载业务值。 */
    const candidate = raw as Partial<PersistedMapTimeState>;
/** totalTicks：定义该变量以承载业务值。 */
    const totalTicks = Number.isFinite(candidate.totalTicks)
      ? Math.max(0, Math.floor(Number(candidate.totalTicks)))
      : undefined;
/** config：定义该变量以承载业务值。 */
    const config = candidate.config && typeof candidate.config === 'object'
      ? this.normalizeMapTimeConfig(candidate.config)
      : undefined;
/** tickSpeed：定义该变量以承载业务值。 */
    const tickSpeed = typeof candidate.tickSpeed === 'number' && Number.isFinite(candidate.tickSpeed)
      ? Math.max(0, Math.min(100, candidate.tickSpeed))
      : undefined;
    if (totalTicks === undefined && !config && tickSpeed === undefined) {
      return null;
    }

    return { totalTicks, config, tickSpeed };
  }

/** normalizeTileResourceKey：执行对应的业务逻辑。 */
  private normalizeTileResourceKey(rawKey: unknown): string | null {
    return normalizeTileResourceKeyHelper(rawKey);
  }

/** normalizeTileResourceRuntimeState：执行对应的业务逻辑。 */
  private normalizeTileResourceRuntimeState(x: unknown, y: unknown, raw: unknown): TileResourceRuntimeState | null {
    return normalizeTileResourceRuntimeStateHelper(x, y, raw);
  }

  private getTileResourceStateMap(
    source: Map<string, TileResourceBucketMap>,
    mapId: string,
    resourceKey: string,
  ): TileResourceStateMap | undefined {
    return getTileResourceStateMapHelper(source, mapId, resourceKey);
  }

  private setTileResourceStateMap(
    source: Map<string, TileResourceBucketMap>,
    mapId: string,
    resourceKey: string,
    stateMap: TileResourceStateMap,
  ): void {
    setTileResourceStateMapHelper(source, mapId, resourceKey, stateMap);
  }

  private deleteTileResourceStateMap(
    source: Map<string, TileResourceBucketMap>,
    mapId: string,
    resourceKey: string,
  ): void {
    deleteTileResourceStateMapHelper(source, mapId, resourceKey);
  }

/** listTileKeysForResourceBucket：执行对应的业务逻辑。 */
  private listTileKeysForResourceBucket(resourceBucket: TileResourceBucketMap | undefined): string[] {
    if (!resourceBucket) {
      return [];
    }

/** tileKeys：定义该变量以承载业务值。 */
    const tileKeys = new Set<string>();
    for (const stateMap of resourceBucket.values()) {
      for (const key of stateMap.keys()) {
        tileKeys.add(key);
      }
    }
    return [...tileKeys];
  }

  private buildPersistedTileRuntimeRecords(
    dynamicStateMap: Map<string, DynamicTileState | PersistedDynamicTileRecord> | undefined,
    resourceBucket: TileResourceBucketMap | undefined,
  ): PersistedTileRuntimeRecord[] {
/** allTileKeys：定义该变量以承载业务值。 */
    const allTileKeys = [...new Set([
      ...(dynamicStateMap ? [...dynamicStateMap.keys()] : []),
      ...this.listTileKeysForResourceBucket(resourceBucket),
    ])].sort((left, right) => {
      const [leftX, leftY] = left.split(',').map((value) => Number.parseInt(value, 10));
      const [rightX, rightY] = right.split(',').map((value) => Number.parseInt(value, 10));
      return leftY - rightY || leftX - rightX;
    });

/** records：定义该变量以承载业务值。 */
    const records: PersistedTileRuntimeRecord[] = [];
    for (const key of allTileKeys) {
      const terrain = dynamicStateMap?.get(key);
      const resources = this.buildPersistedTileRuntimeResources(resourceBucket, key);
      if (!terrain && !resources) {
        continue;
      }

      const [x, y] = key.split(',').map((value) => Number.parseInt(value, 10));
/** record：定义该变量以承载业务值。 */
      const record: PersistedTileRuntimeRecord = { x, y };
      if (terrain) {
/** terrainType：定义该变量以承载业务值。 */
        const terrainType = 'originalType' in terrain && terrain.originalType
          ? terrain.originalType
          : TileType.Floor;
        record.terrain = {
          hp: terrain.hp,
          destroyed: terrain.destroyed,
          restoreTicksLeft: terrain.destroyed
            ? this.normalizeRestoreTicksLeft(terrain.restoreTicksLeft, terrainType)
            : undefined,
          transformedType: terrain.transformedType,
          transformTicksLeft: terrain.transformedType
            ? this.normalizeTransformTicksLeft(terrain.transformTicksLeft)
            : undefined,
        };
      }
      if (resources) {
        record.resources = resources;
      }
      records.push(record);
    }

    return records;
  }

  private buildPersistedTileRuntimeResources(
    resourceBucket: TileResourceBucketMap | undefined,
    tileKey: string,
  ): Record<string, PersistedTileRuntimeResourceRecord> | undefined {
    return buildPersistedTileRuntimeResourcesHelper(resourceBucket, tileKey);
  }

/** getTileResourceFlowConfig：执行对应的业务逻辑。 */
  private getTileResourceFlowConfig(resourceKey: string): TileResourceFlowConfig | null {
    return getTileResourceFlowConfigHelper(resourceKey);
  }

  private calculateAuraFamilyValueForTile(
    resourceBucket: TileResourceBucketMap | undefined,
    tileKey: string,
    fallbackAuraValue = 0,
  ): number {
    if (!resourceBucket) {
      return Math.max(0, Math.round(fallbackAuraValue));
    }

/** total：定义该变量以承载业务值。 */
    let total = 0;
/** matched：定义该变量以承载业务值。 */
    let matched = false;
    for (const [resourceKey, stateMap] of resourceBucket.entries()) {
      if (!parseQiResourceKey(resourceKey)) {
        continue;
      }
/** state：定义该变量以承载业务值。 */
      const state = stateMap.get(tileKey);
      if (!state) {
        continue;
      }
      total += Math.max(0, Math.round(state.value));
      matched = true;
    }
    return matched ? total : Math.max(0, Math.round(fallbackAuraValue));
  }

  private calculateAuraFamilySourceValueForTile(
    resourceBucket: TileResourceBucketMap | undefined,
    tileKey: string,
    fallbackSourceValue = 0,
  ): number {
    if (!resourceBucket) {
      return Math.max(0, Math.round(fallbackSourceValue));
    }

/** total：定义该变量以承载业务值。 */
    let total = 0;
/** matched：定义该变量以承载业务值。 */
    let matched = false;
    for (const [resourceKey, stateMap] of resourceBucket.entries()) {
      if (!parseQiResourceKey(resourceKey)) {
        continue;
      }
/** state：定义该变量以承载业务值。 */
      const state = stateMap.get(tileKey);
      if (!state) {
        continue;
      }
      total += Math.max(0, Math.round(state.sourceValue ?? 0));
      matched = true;
    }
    return matched ? total : Math.max(0, Math.round(fallbackSourceValue));
  }

  private syncTileAuraValue(
    mapId: string,
    x: number,
    y: number,
    resourceBucket = this.resourceStates.get(mapId),
    tile = this.getTile(mapId, x, y),
  ): number {
    if (!tile) {
      return 0;
    }
/** key：定义该变量以承载业务值。 */
    const key = this.tileStateKey(x, y);
/** nextAuraValue：定义该变量以承载业务值。 */
    const nextAuraValue = this.calculateAuraFamilyValueForTile(resourceBucket, key, 0);
    tile.aura = nextAuraValue;
    return nextAuraValue;
  }

/** syncAuraFamilyTileMirrors：执行对应的业务逻辑。 */
  private syncAuraFamilyTileMirrors(mapId: string, tiles: Tile[][]): void {
/** resourceBucket：定义该变量以承载业务值。 */
    const resourceBucket = this.resourceStates.get(mapId);
    if (!resourceBucket) {
      return;
    }

/** tileKeys：定义该变量以承载业务值。 */
    const tileKeys = new Set<string>();
    for (const [resourceKey, stateMap] of resourceBucket.entries()) {
      if (!parseQiResourceKey(resourceKey)) {
        continue;
      }
      for (const key of stateMap.keys()) {
        tileKeys.add(key);
      }
    }

    for (const key of tileKeys) {
      const [x, y] = key.split(',').map((value) => Number.parseInt(value, 10));
      const tile = tiles[y]?.[x];
      if (!tile) {
        continue;
      }
      this.syncTileAuraValue(mapId, x, y, resourceBucket, tile);
    }
  }

  private rehydrateConfiguredTileResourceStates(
    mapId: string,
    tiles: Tile[][],
    baseResourceValues: Map<string, Map<string, number>>,
  ): void {
/** persistedSourceBucket：定义该变量以承载业务值。 */
    const persistedSourceBucket = this.persistedResourceStates.get(mapId);
/** runtimeSourceBucket：定义该变量以承载业务值。 */
    const runtimeSourceBucket = this.resourceStates.get(mapId);
/** allResourceKeys：定义该变量以承载业务值。 */
    const allResourceKeys = new Set<string>([
      ...baseResourceValues.keys(),
      ...(runtimeSourceBucket ? [...runtimeSourceBucket.keys()] : []),
      ...(persistedSourceBucket ? [...persistedSourceBucket.keys()] : []),
    ]);

    for (const resourceKey of allResourceKeys) {
      if (resourceKey === AURA_RESOURCE_KEY) {
        continue;
      }

/** baseStateValues：定义该变量以承载业务值。 */
      const baseStateValues = baseResourceValues.get(resourceKey);
/** persistedSourceStates：定义该变量以承载业务值。 */
      const persistedSourceStates = persistedSourceBucket?.get(resourceKey);
/** sourceStates：定义该变量以承载业务值。 */
      const sourceStates = runtimeSourceBucket?.get(resourceKey) ?? persistedSourceStates;
/** sourceCount：定义该变量以承载业务值。 */
      const sourceCount = sourceStates?.size ?? 0;
/** nextStates：定义该变量以承载业务值。 */
      const nextStates = new Map<string, TileResourceRuntimeState>();
      if (baseStateValues) {
        for (const [key, sourceValue] of baseStateValues.entries()) {
          const persisted = sourceStates?.get(key);
          const [x, y] = key.split(',').map((value) => Number.parseInt(value, 10));
/** tile：定义该变量以承载业务值。 */
          const tile = tiles[y]?.[x];
          if (!tile) {
            continue;
          }
/** state：定义该变量以承载业务值。 */
          const state: TileResourceRuntimeState = {
            x,
            y,
            value: Math.max(0, Math.round(persisted?.value ?? sourceValue)),
            sourceValue,
            decayRemainder: Math.max(0, Math.round(persisted?.decayRemainder ?? 0)),
            sourceRemainder: Math.max(0, Math.round(persisted?.sourceRemainder ?? 0)),
          };
          if (this.shouldKeepTileResourceRuntimeState(state)) {
            nextStates.set(key, state);
          }
        }
      }

      if (sourceStates) {
        for (const [key, rawState] of sourceStates.entries()) {
          if (nextStates.has(key)) {
            continue;
          }
/** tile：定义该变量以承载业务值。 */
          const tile = tiles[rawState.y]?.[rawState.x];
          if (!tile) {
            continue;
          }
/** state：定义该变量以承载业务值。 */
          const state: TileResourceRuntimeState = {
            x: rawState.x,
            y: rawState.y,
            value: Math.max(0, Math.round(rawState.value)),
            sourceValue: 0,
            decayRemainder: Math.max(0, Math.round(rawState.decayRemainder ?? 0)),
            sourceRemainder: Math.max(0, Math.round(rawState.sourceRemainder ?? 0)),
          };
          if (this.shouldKeepTileResourceRuntimeState(state)) {
            nextStates.set(key, state);
          }
        }
      }

      if (nextStates.size === 0) {
        this.deleteTileResourceStateMap(this.resourceStates, mapId, resourceKey);
        if (sourceCount > 0) {
          this.resourceStatesDirty = true;
          this.markTileRuntimeMapDirty(mapId);
        }
      } else {
        this.setTileResourceStateMap(this.resourceStates, mapId, resourceKey, nextStates);
        if (nextStates.size !== sourceCount) {
          this.resourceStatesDirty = true;
          this.markTileRuntimeMapDirty(mapId);
        }
      }

      if (persistedSourceStates) {
        this.deleteTileResourceStateMap(this.persistedResourceStates, mapId, resourceKey);
      }
    }
  }

/** buildPersistedMapTimeRecord：执行对应的业务逻辑。 */
  private buildPersistedMapTimeRecord(mapId: string, requireLoadedMap = true): PersistedMapTimeState | null {
    if (requireLoadedMap && !this.maps.has(mapId)) {
      return null;
    }

/** state：定义该变量以承载业务值。 */
    const state = this.mapTimeStates.get(mapId) ?? this.persistedMapTimeStates.get(mapId);
    if (!state) {
      return null;
    }

/** record：定义该变量以承载业务值。 */
    const record: PersistedMapTimeState = {};
    if (typeof state.totalTicks === 'number' && Number.isFinite(state.totalTicks)) {
      record.totalTicks = Math.max(0, Math.floor(state.totalTicks));
    }
    if (state.config) {
      record.config = this.normalizeMapTimeConfig(state.config);
    }
    if (typeof state.tickSpeed === 'number' && Number.isFinite(state.tickSpeed) && state.tickSpeed !== 1) {
      record.tickSpeed = Math.max(0, Math.min(100, state.tickSpeed));
    }
    if (record.totalTicks === undefined && !record.config && record.tickSpeed === undefined) {
      return null;
    }

    return record;
  }

/** markTileRuntimeMapDirty：执行对应的业务逻辑。 */
  private markTileRuntimeMapDirty(mapId: string): void {
    this.dirtyTileRuntimeMapIds.add(mapId);
  }

/** markMapTimeStateDirty：执行对应的业务逻辑。 */
  private markMapTimeStateDirty(mapId: string): void {
    this.dirtyMapTimeStateMapIds.add(mapId);
  }

/** shouldKeepTileResourceRuntimeState：执行对应的业务逻辑。 */
  private shouldKeepTileResourceRuntimeState(state: TileResourceRuntimeState): boolean {
    return shouldKeepTileResourceRuntimeStateHelper(state);
  }

/** shouldExposeTileResourceDetail：执行对应的业务逻辑。 */
  private shouldExposeTileResourceDetail(state: TileResourceRuntimeState): boolean {
    return shouldExposeTileResourceDetailHelper(state);
  }

/** tickTileResourceState：执行对应的业务逻辑。 */
  private tickTileResourceState(resourceKey: string, state: TileResourceRuntimeState): boolean {
    return tickTileResourceStateHelper(resourceKey, state);
  }

/** toPublicTileResourceKey：执行对应的业务逻辑。 */
  private toPublicTileResourceKey(resourceKey: string): string {
    return toPublicTileResourceKeyHelper(resourceKey);
  }

/** getTileResourceLabel：执行对应的业务逻辑。 */
  private getTileResourceLabel(resourceKey: string): string {
    return getTileResourceLabelHelper(resourceKey);
  }

/** tileStateKey：执行对应的业务逻辑。 */
  private tileStateKey(x: number, y: number): string {
    return tileStateKeyHelper(x, y);
  }

/** normalizeAuraPoints：执行对应的业务逻辑。 */
  private normalizeAuraPoints(rawAuras: unknown, meta: MapMeta): MapAuraPoint[] {
    return normalizeAuraPointsHelper(rawAuras, meta, this.auraLevelBaseValue, (message) => this.logger.warn(message));
  }

/** normalizeTileResourcePoints：执行对应的业务逻辑。 */
  private normalizeTileResourcePoints(rawResources: unknown, meta: MapMeta): MapTileResourcePoint[] {
    return normalizeTileResourcePointsHelper(
      rawResources,
      meta,
      this.auraLevelBaseValue,
      (rawKey) => this.normalizeTileResourceKey(rawKey),
      (message) => this.logger.warn(message),
    );
  }

  private buildBaseTileResourceValueBucket(
    points: MapTileResourcePoint[],
  ): Map<string, Map<string, number>> {
/** result：定义该变量以承载业务值。 */
    const result = new Map<string, Map<string, number>>();
    for (const point of points) {
      const key = this.tileStateKey(point.x, point.y);
      const stateMap = result.get(point.resourceKey) ?? new Map<string, number>();
      stateMap.set(key, point.value);
      result.set(point.resourceKey, stateMap);
    }
    return result;
  }

/** normalizeSafeZones：执行对应的业务逻辑。 */
  private normalizeSafeZones(rawSafeZones: unknown, meta: MapMeta): SafeZoneConfig[] {
    if (!Array.isArray(rawSafeZones)) {
      return [];
    }

/** result：定义该变量以承载业务值。 */
    const result: SafeZoneConfig[] = [];
    for (const candidate of rawSafeZones) {
      const zone = candidate as Partial<GmMapSafeZoneRecord>;
      if (!Number.isInteger(zone.x) || !Number.isInteger(zone.y) || !Number.isInteger(zone.radius)) {
        this.logger.warn(`地图 ${meta.id} 存在非法安全区配置，已忽略`);
        continue;
      }
/** x：定义该变量以承载业务值。 */
      const x = Number(zone.x);
/** y：定义该变量以承载业务值。 */
      const y = Number(zone.y);
/** radius：定义该变量以承载业务值。 */
      const radius = Math.max(0, Number(zone.radius));
      if (x < 0 || x >= meta.width || y < 0 || y >= meta.height) {
        this.logger.warn(`地图 ${meta.id} 的安全区中心越界: (${x}, ${y})`);
        continue;
      }
      result.push({
        x,
        y,
        radius,
      });
    }

    return result;
  }

/** normalizePortals：执行对应的业务逻辑。 */
  private normalizePortals(rawPortals: unknown, meta: MapMeta): Portal[] {
    if (!Array.isArray(rawPortals)) return [];

/** result：定义该变量以承载业务值。 */
    const result: Portal[] = [];
    for (const candidate of rawPortals) {
      const portal = candidate as Partial<Portal>;
      const valid =
        Number.isInteger(portal.x) &&
        Number.isInteger(portal.y) &&
        typeof portal.targetMapId === 'string' &&
        Number.isInteger(portal.targetX) &&
        Number.isInteger(portal.targetY);
      if (!valid) {
        this.logger.warn(`地图 ${meta.id} 存在非法 portal 配置，已忽略`);
        continue;
      }

      if (
        portal.x! < 0 || portal.x! >= meta.width ||
        portal.y! < 0 || portal.y! >= meta.height
      ) {
        this.logger.warn(`地图 ${meta.id} 的 portal 起点越界: (${portal.x}, ${portal.y})`);
        continue;
      }

      result.push({
        x: portal.x!,
        y: portal.y!,
        targetMapId: portal.targetMapId!,
        targetX: portal.targetX!,
        targetY: portal.targetY!,
        kind: this.normalizePortalKind(portal.kind),
        trigger: this.normalizePortalTrigger(portal.trigger, portal.kind),
        routeDomain: this.resolvePortalRouteDomain(portal.routeDomain, meta.routeDomain),
/** allowPlayerOverlap：定义该变量以承载业务值。 */
        allowPlayerOverlap: portal.allowPlayerOverlap === true,
/** hidden：定义该变量以承载业务值。 */
        hidden: portal.hidden === true,
/** observeTitle：定义该变量以承载业务值。 */
        observeTitle: typeof portal.observeTitle === 'string' ? portal.observeTitle.trim() || undefined : undefined,
/** observeDesc：定义该变量以承载业务值。 */
        observeDesc: typeof portal.observeDesc === 'string' ? portal.observeDesc.trim() || undefined : undefined,
      });
    }
    return result;
  }

/** normalizePortalKind：执行对应的业务逻辑。 */
  private normalizePortalKind(kind: unknown): PortalKind {
    return kind === 'stairs' ? 'stairs' : 'portal';
  }

/** normalizePortalTrigger：执行对应的业务逻辑。 */
  private normalizePortalTrigger(trigger: unknown, kind?: unknown): PortalTrigger {
    if (trigger === 'manual' || trigger === 'auto') {
      return trigger;
    }
    return kind === 'stairs' ? 'auto' : 'manual';
  }

/** normalizeMapRouteDomain：执行对应的业务逻辑。 */
  private normalizeMapRouteDomain(domain: unknown): MapRouteDomain {
    return domain === 'sect' || domain === 'personal' || domain === 'dynamic' ? domain : 'system';
  }

/** normalizePortalRouteDomain：执行对应的业务逻辑。 */
  private normalizePortalRouteDomain(domain: unknown): PortalRouteDomain {
    return domain === 'inherit' || domain === 'system' || domain === 'sect' || domain === 'personal' || domain === 'dynamic'
      ? domain
      : 'inherit';
  }

/** resolvePortalRouteDomain：执行对应的业务逻辑。 */
  private resolvePortalRouteDomain(domain: unknown, mapRouteDomain?: MapRouteDomain): MapRouteDomain {
/** normalized：定义该变量以承载业务值。 */
    const normalized = this.normalizePortalRouteDomain(domain);
    return normalized === 'inherit'
      ? this.normalizeMapRouteDomain(mapRouteDomain)
      : normalized;
  }

/** normalizeMapSpaceVisionMode：执行对应的业务逻辑。 */
  private normalizeMapSpaceVisionMode(mode: unknown, parentMapId?: unknown): MapSpaceVisionMode {
    if (mode === 'parent_overlay' && typeof parentMapId === 'string' && parentMapId.trim()) {
      return 'parent_overlay';
    }
    return 'isolated';
  }

/** normalizeNpcs：执行对应的业务逻辑。 */
  private normalizeNpcs(rawNpcs: unknown, meta: MapMeta): NpcConfig[] {
    if (!Array.isArray(rawNpcs)) return [];

/** result：定义该变量以承载业务值。 */
    const result: NpcConfig[] = [];
    for (const candidate of rawNpcs) {
      const npc = candidate as Partial<NpcConfig> & {
        quest?: unknown;
        role?: unknown;
        shopItems?: Array<{
          itemId?: unknown;
          price?: unknown;
          stockLimit?: unknown;
          refreshSeconds?: unknown;
          priceFormula?: unknown;
        }>;
      };
/** valid：定义该变量以承载业务值。 */
      const valid =
        typeof npc.id === 'string' &&
        typeof npc.name === 'string' &&
        Number.isInteger(npc.x) &&
        Number.isInteger(npc.y) &&
        typeof npc.char === 'string' &&
        typeof npc.color === 'string' &&
        typeof npc.dialogue === 'string';
      if (!valid) {
        this.logger.warn(`地图 ${meta.id} 存在非法 NPC 配置，已忽略`);
        continue;
      }

      if (npc.x! < 0 || npc.x! >= meta.width || npc.y! < 0 || npc.y! >= meta.height) {
        this.logger.warn(`地图 ${meta.id} 的 NPC 越界: ${npc.id}`);
        continue;
      }

      result.push({
        id: npc.id!,
        name: npc.name!,
        x: npc.x!,
        y: npc.y!,
        char: npc.char!,
        color: npc.color!,
        dialogue: npc.dialogue!,
/** role：定义该变量以承载业务值。 */
        role: typeof (candidate as { role?: unknown }).role === 'string' ? String((candidate as { role?: unknown }).role) : undefined,
        shopItems: Array.isArray(npc.shopItems)
          ? npc.shopItems
              .flatMap((entry) => {
                if (typeof entry?.itemId !== 'string' || !entry.itemId.trim()) {
                  return [];
                }
/** staticPrice：定义该变量以承载业务值。 */
                const staticPrice = Number.isInteger(entry.price) && Number(entry.price) > 0
                  ? Number(entry.price)
                  : undefined;
/** priceFormula：定义该变量以承载业务值。 */
                const priceFormula = entry.priceFormula === 'technique_realm_square_grade'
                  ? 'technique_realm_square_grade'
                  : undefined;
                if (staticPrice === undefined && !priceFormula) {
                  return [];
                }
/** stockLimit：定义该变量以承载业务值。 */
                const stockLimit = Number.isInteger(entry.stockLimit) && Number(entry.stockLimit) > 0
                  ? Number(entry.stockLimit)
                  : undefined;
/** refreshSeconds：定义该变量以承载业务值。 */
                const refreshSeconds = Number.isInteger(entry.refreshSeconds) && Number(entry.refreshSeconds) > 0
                  ? Number(entry.refreshSeconds)
                  : undefined;
                return [{
                  itemId: entry.itemId.trim(),
                  price: staticPrice,
                  stockLimit,
                  refreshSeconds,
                  priceFormula,
                }];
              })
          : [],
        quests: [],
      });
    }

    return result;
  }

/** reloadQuestBindingsFromFiles：执行对应的业务逻辑。 */
  private reloadQuestBindingsFromFiles(): void {
/** domain：定义该变量以承载业务值。 */
    const domain = new MapQuestDomain(this.contentService, this.questDir, this.logger, this.maps);
/** result：定义该变量以承载业务值。 */
    const result = domain.reloadQuestBindingsFromFiles();
    this.quests = result.quests;
    this.mainQuestChain = result.mainQuestChain;
    this.mainQuestIndexById = result.mainQuestIndexById;
  }

/** normalizeMonsterSpawns：执行对应的业务逻辑。 */
  private normalizeMonsterSpawns(rawSpawns: unknown, meta: MapMeta): MonsterSpawnConfig[] {
    return this.contentDomain.normalizeMonsterSpawns(rawSpawns, meta);
  }

/** resolveMonsterSpawnTemplateId：执行对应的业务逻辑。 */
  private resolveMonsterSpawnTemplateId(spawn: { id?: unknown; templateId?: unknown }): string | undefined {
    if (typeof spawn.templateId === 'string' && spawn.templateId.trim().length > 0) {
      return spawn.templateId.trim();
    }
    if (typeof spawn.id === 'string' && spawn.id.trim().length > 0) {
      return spawn.id.trim();
    }
    return undefined;
  }

/** normalizeContainers：执行对应的业务逻辑。 */
  private normalizeContainers(rawLandmarks: unknown, meta: MapMeta): ContainerConfig[] {
    return this.contentDomain.normalizeContainers(rawLandmarks, meta);
  }

/** normalizeContainerGrade：执行对应的业务逻辑。 */
  private normalizeContainerGrade(grade: unknown): TechniqueGrade {
    return normalizeContainerGradeHelper(grade);
  }

  private buildMinimapSnapshot(
    meta: MapMeta,
    document: GmMapDocument,
    portals: Portal[],
    containers: ContainerConfig[],
    npcs: NpcConfig[],
    monsterSpawns: MonsterSpawnConfig[],
  ): MapMinimapSnapshot {
    return this.contentDomain.buildMinimapSnapshot(meta, document, portals, containers, npcs, monsterSpawns);
  }

/** normalizeDrops：执行对应的业务逻辑。 */
  private normalizeDrops(rawDrops: unknown): DropConfig[] {
    return normalizeDropsHelper(rawDrops);
  }

/** normalizeContainerLootPools：执行对应的业务逻辑。 */
  private normalizeContainerLootPools(rawPools: unknown): ContainerLootPoolConfig[] {
    return normalizeContainerLootPoolsHelper(rawPools);
  }

/** getMapMeta：执行对应的业务逻辑。 */
  getMapMeta(mapId: string): MapMeta | undefined {
    return this.maps.get(mapId)?.meta;
  }

  /** 获取当前已加载的全部地图 id */
  getLoadedMapIds(): string[] {
    return [...this.maps.keys()].sort((left, right) => left.localeCompare(right, 'zh-CN'));
  }

/** getMinimapSnapshot：执行对应的业务逻辑。 */
  getMinimapSnapshot(mapId: string): MapMinimapSnapshot | undefined {
/** snapshot：定义该变量以承载业务值。 */
    const snapshot = this.maps.get(mapId)?.minimap;
    return snapshot ? JSON.parse(JSON.stringify(snapshot)) as MapMinimapSnapshot : undefined;
  }

/** getVisibleMinimapMarkers：执行对应的业务逻辑。 */
  getVisibleMinimapMarkers(mapId: string, visibleKeys: Set<string>): MapMinimapMarker[] {
/** snapshot：定义该变量以承载业务值。 */
    const snapshot = this.maps.get(mapId)?.minimap;
    if (!snapshot || visibleKeys.size === 0) {
      return [];
    }
    return snapshot.markers
      .filter((marker) => visibleKeys.has(`${marker.x},${marker.y}`))
      .map((marker) => JSON.parse(JSON.stringify(marker)) as MapMinimapMarker);
  }

/** getMinimapArchiveEntries：执行对应的业务逻辑。 */
  getMinimapArchiveEntries(mapIds: string[]): MapMinimapArchiveEntry[] {
/** uniqueIds：定义该变量以承载业务值。 */
    const uniqueIds = [...new Set(mapIds.filter((mapId) => typeof mapId === 'string' && mapId.length > 0))];
/** entries：定义该变量以承载业务值。 */
    const entries: MapMinimapArchiveEntry[] = [];
    for (const mapId of uniqueIds) {
      const map = this.maps.get(mapId);
      if (!map) {
        continue;
      }
      entries.push({
        mapId,
        mapMeta: JSON.parse(JSON.stringify(map.meta)) as MapMeta,
        snapshot: JSON.parse(JSON.stringify(map.minimap)) as MapMinimapSnapshot,
      });
    }
    return entries;
  }

/** getMinimapSignature：执行对应的业务逻辑。 */
  getMinimapSignature(mapId: string): string {
    return this.maps.get(mapId)?.minimapSignature ?? '';
  }

/** getMapTimeConfig：执行对应的业务逻辑。 */
  getMapTimeConfig(mapId: string): MapTimeConfig {
/** runtimeConfig：定义该变量以承载业务值。 */
    const runtimeConfig = this.getStoredMapTimeState(mapId)?.config;
    if (runtimeConfig) {
      return JSON.parse(JSON.stringify(runtimeConfig)) as MapTimeConfig;
    }
/** source：定义该变量以承载业务值。 */
    const source = this.maps.get(mapId)?.source.time;
    return source
      ? JSON.parse(JSON.stringify(source)) as MapTimeConfig
      : JSON.parse(JSON.stringify(DEFAULT_MAP_TIME_CONFIG)) as MapTimeConfig;
  }

/** getMapTimeTicks：执行对应的业务逻辑。 */
  getMapTimeTicks(mapId: string): number | null {
/** totalTicks：定义该变量以承载业务值。 */
    const totalTicks = this.getStoredMapTimeState(mapId)?.totalTicks;
    return typeof totalTicks === 'number' && Number.isFinite(totalTicks)
      ? Math.max(0, Math.floor(totalTicks))
      : null;
  }

/** setMapTimeTicks：执行对应的业务逻辑。 */
  setMapTimeTicks(mapId: string, totalTicks: number): void {
/** normalizedTicks：定义该变量以承载业务值。 */
    const normalizedTicks = Number.isFinite(totalTicks) ? Math.max(0, Math.floor(totalTicks)) : 0;
/** current：定义该变量以承载业务值。 */
    const current = this.getStoredMapTimeState(mapId);
    if (current?.totalTicks === normalizedTicks) {
      return;
    }

    this.mapTimeStates.set(mapId, {
      totalTicks: normalizedTicks,
      config: current?.config ? this.normalizeMapTimeConfig(current.config) : undefined,
      tickSpeed: current?.tickSpeed,
    });
    this.persistedMapTimeStates.delete(mapId);
    this.mapTimeStatesDirty = true;
    this.markMapTimeStateDirty(mapId);
  }

/** getPersistedMapTickSpeed：执行对应的业务逻辑。 */
  getPersistedMapTickSpeed(mapId: string): number | null {
/** tickSpeed：定义该变量以承载业务值。 */
    const tickSpeed = this.getStoredMapTimeState(mapId)?.tickSpeed;
    return typeof tickSpeed === 'number' && Number.isFinite(tickSpeed)
      ? Math.max(0, Math.min(100, tickSpeed))
      : null;
  }

/** setPersistedMapTickSpeed：执行对应的业务逻辑。 */
  setPersistedMapTickSpeed(mapId: string, tickSpeed: number): void {
/** normalizedTickSpeed：定义该变量以承载业务值。 */
    const normalizedTickSpeed = Math.max(0, Math.min(100, tickSpeed));
/** current：定义该变量以承载业务值。 */
    const current = this.getStoredMapTimeState(mapId);
/** nextTickSpeed：定义该变量以承载业务值。 */
    const nextTickSpeed = normalizedTickSpeed === 1 ? undefined : normalizedTickSpeed;
    if ((current?.tickSpeed ?? undefined) === nextTickSpeed) {
      return;
    }

    this.mapTimeStates.set(mapId, {
      totalTicks: current?.totalTicks,
      config: current?.config ? this.normalizeMapTimeConfig(current.config) : undefined,
      tickSpeed: nextTickSpeed,
    });
    this.persistedMapTimeStates.delete(mapId);
    this.mapTimeStatesDirty = true;
    this.markMapTimeStateDirty(mapId);
  }

  /** GM 运行时修改地图时间配置（持久化到运行时状态，重启后保留） */
  updateMapTimeConfig(mapId: string, patch: { scale?: number; offsetTicks?: number }): string | null {
/** map：定义该变量以承载业务值。 */
    const map = this.maps.get(mapId);
    if (!map) return '目标地图不存在';
/** nextConfig：定义该变量以承载业务值。 */
    const nextConfig = this.getMapTimeConfig(mapId);
/** changed：定义该变量以承载业务值。 */
    let changed = false;
    if (typeof patch.scale === 'number' && patch.scale >= 0) {
      if (nextConfig.scale !== patch.scale) {
        nextConfig.scale = patch.scale;
        changed = true;
      }
    }
    if (typeof patch.offsetTicks === 'number' && Number.isFinite(patch.offsetTicks)) {
/** normalizedOffset：定义该变量以承载业务值。 */
      const normalizedOffset = Math.round(patch.offsetTicks);
      if (nextConfig.offsetTicks !== normalizedOffset) {
        nextConfig.offsetTicks = normalizedOffset;
        changed = true;
      }
    }
    if (!changed) {
      return null;
    }

/** current：定义该变量以承载业务值。 */
    const current = this.getStoredMapTimeState(mapId);
    this.mapTimeStates.set(mapId, {
      totalTicks: current?.totalTicks,
      config: this.normalizeMapTimeConfig(nextConfig),
      tickSpeed: current?.tickSpeed,
    });
    this.persistedMapTimeStates.delete(mapId);
    this.mapTimeStatesDirty = true;
    this.markMapTimeStateDirty(mapId);
    return null;
  }

/** getMapRevision：执行对应的业务逻辑。 */
  getMapRevision(mapId: string): number {
    return this.revisions.get(mapId) ?? 0;
  }

/** getPathfindingStaticGrid：执行对应的业务逻辑。 */
  getPathfindingStaticGrid(mapId: string): PathfindingStaticGrid | null {
    return this.occupancyDomain.getPathfindingStaticGrid(mapId);
  }

  buildPathfindingBlockedGrid(
    mapId: string,
    actorType: PathfindingActorType,
    selfOccupancyId?: string | null,
  ): Uint8Array | null {
    return this.occupancyDomain.buildPathfindingBlockedGrid(mapId, actorType, selfOccupancyId);
  }

/** getVisibilityRevision：执行对应的业务逻辑。 */
  getVisibilityRevision(mapId: string): string {
/** meta：定义该变量以承载业务值。 */
    const meta = this.getMapMeta(mapId);
/** current：定义该变量以承载业务值。 */
    const current = this.getMapRevision(mapId);
    if (meta?.spaceVisionMode === 'parent_overlay' && meta.parentMapId) {
      return `${current}:${this.getMapRevision(meta.parentMapId)}`;
    }
    return String(current);
  }

/** getTilePatchRevision：执行对应的业务逻辑。 */
  getTilePatchRevision(mapId: string): number {
    return this.tilePatchRevisions.get(mapId) ?? 0;
  }

/** getDirtyTileKeys：执行对应的业务逻辑。 */
  getDirtyTileKeys(mapId: string): string[] {
    return [...(this.dirtyTileKeysByMap.get(mapId) ?? new Set<string>()).values()];
  }

/** clearDirtyTileKeys：执行对应的业务逻辑。 */
  clearDirtyTileKeys(mapId: string): void {
    this.dirtyTileKeysByMap.delete(mapId);
  }

/** bumpMapRevision：处理当前场景中的对应操作。 */
  private bumpMapRevision(mapId: string) {
    this.revisions.set(mapId, (this.revisions.get(mapId) ?? 0) + 1);
  }

/** markTileDirty：执行对应的业务逻辑。 */
  private markTileDirty(mapId: string, x: number, y: number): void {
/** key：定义该变量以承载业务值。 */
    const key = this.tileStateKey(x, y);
/** dirtyKeys：定义该变量以承载业务值。 */
    const dirtyKeys = this.dirtyTileKeysByMap.get(mapId) ?? new Set<string>();
    dirtyKeys.add(key);
    this.dirtyTileKeysByMap.set(mapId, dirtyKeys);
    this.tilePatchRevisions.set(mapId, (this.tilePatchRevisions.get(mapId) ?? 0) + 1);
  }

  getSpawnPoint(mapId: string): { x: number; y: number } | undefined {
    return this.maps.get(mapId)?.spawnPoint;
  }

/** isPointInMapBounds：执行对应的业务逻辑。 */
  isPointInMapBounds(mapId: string, x: number, y: number): boolean {
/** map：定义该变量以承载业务值。 */
    const map = this.maps.get(mapId);
    if (!map) return false;
    return x >= 0 && y >= 0 && x < map.meta.width && y < map.meta.height;
  }

/** getOverlayParentMapId：执行对应的业务逻辑。 */
  getOverlayParentMapId(mapId: string): string | undefined {
    return this.portalDomain.getOverlayParentMapId(mapId);
  }

/** projectPointToMap：执行对应的业务逻辑。 */
  projectPointToMap(targetMapId: string, sourceMapId: string, x: number, y: number): ProjectedPoint | null {
    return this.portalDomain.projectPointToMap(targetMapId, sourceMapId, x, y);
  }

/** getPortalAt：执行对应的业务逻辑。 */
  getPortalAt(mapId: string, x: number, y: number, options?: PortalQueryOptions): Portal | undefined {
    return this.portalDomain.getPortalAt(mapId, x, y, options);
  }

/** getHiddenPortalObservationAt：执行对应的业务逻辑。 */
  getHiddenPortalObservationAt(mapId: string, x: number, y: number): PortalObservationHint | undefined {
    return this.portalDomain.getHiddenPortalObservationAt(mapId, x, y);
  }

/** getPortalNear：执行对应的业务逻辑。 */
  getPortalNear(mapId: string, x: number, y: number, maxDistance = 1, options?: PortalQueryOptions): Portal | undefined {
    return this.portalDomain.getPortalNear(mapId, x, y, maxDistance, options);
  }

/** getPortals：执行对应的业务逻辑。 */
  getPortals(mapId: string, options?: PortalQueryOptions): Portal[] {
    return this.portalDomain.getPortals(mapId, options);
  }

/** getMapRouteDomain：执行对应的业务逻辑。 */
  getMapRouteDomain(mapId: string): MapRouteDomain {
    return this.portalDomain.getMapRouteDomain(mapId);
  }

/** isMapRouteDomainAllowed：执行对应的业务逻辑。 */
  isMapRouteDomainAllowed(mapId: string, allowedRouteDomains?: readonly MapRouteDomain[]): boolean {
    return this.portalDomain.isMapRouteDomainAllowed(mapId, allowedRouteDomains);
  }

/** getNpcs：执行对应的业务逻辑。 */
  getNpcs(mapId: string): NpcConfig[] {
    return this.maps.get(mapId)?.npcs ?? [];
  }

/** getSafeZones：执行对应的业务逻辑。 */
  getSafeZones(mapId: string): SafeZoneConfig[] {
    return this.maps.get(mapId)?.safeZones ?? [];
  }

/** isPointInSafeZone：执行对应的业务逻辑。 */
  isPointInSafeZone(mapId: string, x: number, y: number): boolean {
    return this.getSafeZones(mapId).some((zone) => isPointInRange({ x, y }, zone, zone.radius));
  }

/** getNpcById：执行对应的业务逻辑。 */
  getNpcById(mapId: string, npcId: string): NpcConfig | undefined {
    return this.maps.get(mapId)?.npcs.find((npc) => npc.id === npcId);
  }

/** getContainers：执行对应的业务逻辑。 */
  getContainers(mapId: string): ContainerConfig[] {
    return this.maps.get(mapId)?.containers ?? [];
  }

/** getContainerAt：执行对应的业务逻辑。 */
  getContainerAt(mapId: string, x: number, y: number): ContainerConfig | undefined {
    return this.maps.get(mapId)?.containers.find((container) => container.x === x && container.y === y);
  }

/** getContainerById：执行对应的业务逻辑。 */
  getContainerById(mapId: string, containerId: string): ContainerConfig | undefined {
    return this.maps.get(mapId)?.containers.find((container) => container.id === containerId);
  }

/** getNpcLocation：执行对应的业务逻辑。 */
  getNpcLocation(npcId: string): NpcLocation | undefined {
    for (const [mapId, map] of this.maps.entries()) {
      const npc = map.npcs.find((entry) => entry.id === npcId);
      if (npc) {
        return {
          mapId,
          mapName: map.meta.name,
          x: npc.x,
          y: npc.y,
          name: npc.name,
        };
      }
    }
    return undefined;
  }

/** getMonsterSpawns：执行对应的业务逻辑。 */
  getMonsterSpawns(mapId: string): MonsterSpawnConfig[] {
    return this.maps.get(mapId)?.monsterSpawns ?? [];
  }

/** getQuest：执行对应的业务逻辑。 */
  getQuest(questId: string): QuestConfig | undefined {
    return this.quests.get(questId);
  }

/** getMainQuestChain：执行对应的业务逻辑。 */
  getMainQuestChain(): readonly QuestConfig[] {
    return this.mainQuestChain;
  }

/** getMainQuestIndex：执行对应的业务逻辑。 */
  getMainQuestIndex(questId: string): number | undefined {
    return this.mainQuestIndexById.get(questId);
  }

/** getMonsterSpawn：执行对应的业务逻辑。 */
  getMonsterSpawn(monsterId: string): MonsterSpawnConfig | undefined {
    return this.monsters.get(monsterId);
  }

/** getMonsterSpawnInMap：执行对应的业务逻辑。 */
  getMonsterSpawnInMap(mapId: string, monsterId: string): MonsterSpawnConfig | undefined {
    return this.maps.get(mapId)?.monsterSpawns.find((spawn) => spawn.id === monsterId);
  }

/** getTile：执行对应的业务逻辑。 */
  getTile(mapId: string, x: number, y: number): Tile | null {
/** map：定义该变量以承载业务值。 */
    const map = this.maps.get(mapId);
    if (!map) return null;
    return map.tiles[y]?.[x] ?? null;
  }

/** isTileDestroyed：执行对应的业务逻辑。 */
  isTileDestroyed(mapId: string, x: number, y: number): boolean {
/** key：定义该变量以承载业务值。 */
    const key = this.tileStateKey(x, y);
    return this.dynamicTileStates.get(mapId)?.get(key)?.destroyed === true;
  }

/** canDamageTile：执行对应的业务逻辑。 */
  canDamageTile(mapId: string, x: number, y: number): boolean {
/** tile：定义该变量以承载业务值。 */
    const tile = this.getTile(mapId, x, y);
/** originalType：定义该变量以承载业务值。 */
    const originalType = this.getBaseTileType(mapId, x, y);
    if (!tile || originalType === null) {
      return false;
    }
    if (this.isTileDestroyed(mapId, x, y)) {
      return false;
    }
    return this.tileDurability(mapId, originalType) > 0;
  }

/** getCompositeTile：执行对应的业务逻辑。 */
  getCompositeTile(mapId: string, x: number, y: number): Tile | null {
/** local：定义该变量以承载业务值。 */
    const local = this.getTile(mapId, x, y);
    if (local) {
      return local;
    }

/** parentMapId：定义该变量以承载业务值。 */
    const parentMapId = this.getOverlayParentMapId(mapId);
    if (!parentMapId) {
      return null;
    }

/** projected：定义该变量以承载业务值。 */
    const projected = this.projectPointToMap(parentMapId, mapId, x, y);
    if (!projected) {
      return null;
    }
    return this.getTile(parentMapId, projected.x, projected.y);
  }

/** getTileAura：执行对应的业务逻辑。 */
  getTileAura(mapId: string, x: number, y: number): number {
    return Math.max(0, this.getTile(mapId, x, y)?.aura ?? 0);
  }

  getTileAuraResourceValues(mapId: string, x: number, y: number): Array<{ key: string; value: number }> {
/** key：定义该变量以承载业务值。 */
    const key = this.tileStateKey(x, y);
/** map：定义该变量以承载业务值。 */
    const map = this.maps.get(mapId);
/** resourceBucket：定义该变量以承载业务值。 */
    const resourceBucket = this.resourceStates.get(mapId);
/** resourceKeys：定义该变量以承载业务值。 */
    const resourceKeys = new Set<string>([
      ...(map?.baseResourceValues.keys() ?? []),
      ...(resourceBucket ? [...resourceBucket.keys()] : []),
    ]);
/** resources：定义该变量以承载业务值。 */
    const resources: Array<{ key: string; value: number }> = [];
    for (const resourceKey of resourceKeys) {
      if (!parseQiResourceKey(resourceKey)) {
        continue;
      }
/** value：定义该变量以承载业务值。 */
      const value = Math.max(0, Math.round(
        resourceBucket?.get(resourceKey)?.get(key)?.value
          ?? map?.baseResourceValues.get(resourceKey)?.get(key)
          ?? 0,
      ));
      if (value <= 0) {
        continue;
      }
      resources.push({ key: resourceKey, value });
    }
    return resources;
  }

/** getTileResourceValue：执行对应的业务逻辑。 */
  getTileResourceValue(mapId: string, x: number, y: number, resourceKey: string): number {
/** normalizedResourceKey：定义该变量以承载业务值。 */
    const normalizedResourceKey = this.normalizeTileResourceKey(resourceKey);
    if (!normalizedResourceKey) {
      return 0;
    }

/** key：定义该变量以承载业务值。 */
    const key = this.tileStateKey(x, y);
/** map：定义该变量以承载业务值。 */
    const map = this.maps.get(mapId);
/** tile：定义该变量以承载业务值。 */
    const tile = this.getTile(mapId, x, y);
    if (normalizedResourceKey === AURA_RESOURCE_KEY) {
      return Math.max(0, Math.round(
        this.getTileResourceStateMap(this.resourceStates, mapId, normalizedResourceKey)?.get(key)?.value
          ?? map?.baseAuraValues.get(key)
          ?? tile?.aura
          ?? 0,
      ));
    }
    return Math.max(0, Math.round(
      this.getTileResourceStateMap(this.resourceStates, mapId, normalizedResourceKey)?.get(key)?.value
        ?? map?.baseResourceValues.get(normalizedResourceKey)?.get(key)
        ?? 0,
    ));
  }

/** getTileRuntimeDetail：执行对应的业务逻辑。 */
  getTileRuntimeDetail(mapId: string, x: number, y: number): {
/** mapId：定义该变量以承载业务值。 */
    mapId: string;
/** x：定义该变量以承载业务值。 */
    x: number;
/** y：定义该变量以承载业务值。 */
    y: number;
    hp?: number;
    maxHp?: number;
    destroyed?: boolean;
    restoreTicksLeft?: number;
/** resources：定义该变量以承载业务值。 */
    resources: Array<{ key: string; label: string; value: number; level?: number; sourceValue?: number }>;
  } | null {
/** resolvedMapId：定义该变量以承载业务值。 */
    let resolvedMapId = mapId;
/** resolvedX：定义该变量以承载业务值。 */
    let resolvedX = x;
/** resolvedY：定义该变量以承载业务值。 */
    let resolvedY = y;
/** tile：定义该变量以承载业务值。 */
    let tile = this.getTile(mapId, x, y);
    if (!tile) {
/** parentMapId：定义该变量以承载业务值。 */
      const parentMapId = this.getOverlayParentMapId(mapId);
      if (!parentMapId) {
        return null;
      }
/** projected：定义该变量以承载业务值。 */
      const projected = this.projectPointToMap(parentMapId, mapId, x, y);
      if (!projected) {
        return null;
      }
      tile = this.getTile(parentMapId, projected.x, projected.y);
      if (!tile) {
        return null;
      }
      resolvedMapId = parentMapId;
      resolvedX = projected.x;
      resolvedY = projected.y;
    }

/** key：定义该变量以承载业务值。 */
    const key = this.tileStateKey(resolvedX, resolvedY);
/** dynamicState：定义该变量以承载业务值。 */
    const dynamicState = this.dynamicTileStates.get(resolvedMapId)?.get(key);
/** resourceBucket：定义该变量以承载业务值。 */
    const resourceBucket = this.resourceStates.get(resolvedMapId);
/** resources：定义该变量以承载业务值。 */
    const resources: Array<{ key: string; label: string; value: number; level?: number; sourceValue?: number }> = [];
/** auraValue：定义该变量以承载业务值。 */
    const auraValue = this.calculateAuraFamilyValueForTile(resourceBucket, key, tile.aura ?? 0);
/** sourceValue：定义该变量以承载业务值。 */
    const sourceValue = this.calculateAuraFamilySourceValueForTile(
      resourceBucket,
      key,
      this.maps.get(resolvedMapId)?.baseAuraValues.get(key) ?? 0,
    );
    if (auraValue > 0 || sourceValue > 0) {
      resources.push({
        key: LEGACY_AURA_RESOURCE_KEY,
        label: '总灵气',
        value: auraValue,
        level: getAuraLevel(auraValue, this.auraLevelBaseValue),
        sourceValue: sourceValue > 0 ? sourceValue : undefined,
      });
    }

    if (resourceBucket) {
      for (const [resourceKey, stateMap] of resourceBucket.entries()) {
        const state = stateMap.get(key);
        if (!state || !this.shouldExposeTileResourceDetail(state)) {
          continue;
        }
        resources.push({
          key: this.toPublicTileResourceKey(resourceKey),
          label: this.getTileResourceLabel(resourceKey),
          value: Math.max(0, Math.round(state.value)),
          sourceValue: (state.sourceValue ?? 0) > 0 ? Math.max(0, Math.round(state.sourceValue ?? 0)) : undefined,
        });
      }
    }

    return {
      mapId,
      x,
      y,
      hp: tile.hp,
      maxHp: tile.maxHp,
/** destroyed：定义该变量以承载业务值。 */
      destroyed: dynamicState?.destroyed === true,
      restoreTicksLeft: dynamicState?.restoreTicksLeft,
      resources,
    };
  }

/** setTileAura：执行对应的业务逻辑。 */
  setTileAura(mapId: string, x: number, y: number, value: number): number | null {
    return this.setTileResourceValue(mapId, x, y, AURA_RESOURCE_KEY, value);
  }

  transformTile(
    mapId: string,
    x: number,
    y: number,
    transformedType: TileType,
    durationTicks: number,
    allowedOriginalTypes?: TileType[],
  ): boolean {
/** tile：定义该变量以承载业务值。 */
    const tile = this.getTile(mapId, x, y);
/** originalType：定义该变量以承载业务值。 */
    const originalType = this.getBaseTileType(mapId, x, y);
    if (!tile || originalType === null) {
      return false;
    }
    if (allowedOriginalTypes && allowedOriginalTypes.length > 0 && !allowedOriginalTypes.includes(originalType)) {
      return false;
    }
    if (!Object.values(TileType).includes(transformedType)) {
      return false;
    }

/** normalizedDuration：定义该变量以承载业务值。 */
    const normalizedDuration = Math.max(1, Math.floor(durationTicks));
/** targetWalkable：定义该变量以承载业务值。 */
    const targetWalkable = isTileTypeWalkable(transformedType);
    if (!targetWalkable && this.hasBlockingEntityAt(mapId, x, y)) {
      return false;
    }

/** key：定义该变量以承载业务值。 */
    const key = this.tileStateKey(x, y);
/** mapStates：定义该变量以承载业务值。 */
    const mapStates = this.dynamicTileStates.get(mapId) ?? new Map<string, DynamicTileState>();
/** current：定义该变量以承载业务值。 */
    const current = mapStates.get(key);
    if (current?.destroyed) {
      return false;
    }

/** maxHp：定义该变量以承载业务值。 */
    const maxHp = this.tileDurability(mapId, originalType);
/** nextState：定义该变量以承载业务值。 */
    const nextState: DynamicTileState = current ?? {
      x,
      y,
      originalType,
      hp: maxHp,
      maxHp,
      destroyed: false,
    };
    nextState.originalType = originalType;
    nextState.maxHp = maxHp;
    nextState.hp = current ? Math.max(0, Math.min(current.hp, maxHp)) : maxHp;
    nextState.transformedType = transformedType === originalType ? undefined : transformedType;
    nextState.transformTicksLeft = nextState.transformedType ? normalizedDuration : undefined;

    if (!this.shouldKeepDynamicTileState(nextState)) {
      mapStates.delete(key);
      this.resetTileToBaseState(mapId, x, y);
    } else {
      mapStates.set(key, nextState);
      this.applyDynamicTileStateToTile(tile, nextState);
    }

    if (mapStates.size > 0) {
      this.dynamicTileStates.set(mapId, mapStates);
    } else {
      this.dynamicTileStates.delete(mapId);
    }
    this.dynamicTileStatesDirty = true;
    this.markTileRuntimeMapDirty(mapId);
    this.markTileDirty(mapId, x, y);
    return true;
  }

/** setTileResourceValue：执行对应的业务逻辑。 */
  setTileResourceValue(mapId: string, x: number, y: number, resourceKey: string, value: number): number | null {
/** map：定义该变量以承载业务值。 */
    const map = this.maps.get(mapId);
/** tile：定义该变量以承载业务值。 */
    const tile = this.getTile(mapId, x, y);
/** normalizedResourceKey：定义该变量以承载业务值。 */
    const normalizedResourceKey = this.normalizeTileResourceKey(resourceKey);
    if (!map || !tile || !normalizedResourceKey) {
      return null;
    }

/** nextValue：定义该变量以承载业务值。 */
    const nextValue = Math.max(0, Math.round(value));
/** key：定义该变量以承载业务值。 */
    const key = this.tileStateKey(x, y);
/** previousAuraValue：定义该变量以承载业务值。 */
    const previousAuraValue = tile.aura ?? 0;
/** previousValue：定义该变量以承载业务值。 */
    const previousValue = this.getTileResourceValue(mapId, x, y, normalizedResourceKey);
    if (previousValue === nextValue) {
      return previousValue;
    }

/** previousLevel：定义该变量以承载业务值。 */
    const previousLevel = getAuraLevel(previousAuraValue, this.auraLevelBaseValue);
/** stateMap：定义该变量以承载业务值。 */
    const stateMap = this.getTileResourceStateMap(this.resourceStates, mapId, normalizedResourceKey)
      ?? new Map<string, TileResourceRuntimeState>();
/** state：定义该变量以承载业务值。 */
    const state = stateMap.get(key) ?? {
      x,
      y,
      value: previousValue,
/** sourceValue：定义该变量以承载业务值。 */
      sourceValue: normalizedResourceKey === AURA_RESOURCE_KEY
        ? (map.baseAuraValues.get(key) ?? 0)
        : (map.baseResourceValues.get(normalizedResourceKey)?.get(key) ?? 0),
      decayRemainder: 0,
      sourceRemainder: 0,
    };
    state.value = nextValue;
    if (this.shouldKeepTileResourceRuntimeState(state)) {
      stateMap.set(key, state);
      this.setTileResourceStateMap(this.resourceStates, mapId, normalizedResourceKey, stateMap);
    } else {
      stateMap.delete(key);
      this.setTileResourceStateMap(this.resourceStates, mapId, normalizedResourceKey, stateMap);
    }
    if (parseQiResourceKey(normalizedResourceKey)) {
      this.syncTileAuraValue(mapId, x, y);
    }
    this.resourceStatesDirty = true;
    this.markTileRuntimeMapDirty(mapId);
    if (getAuraLevel(tile.aura ?? 0, this.auraLevelBaseValue) !== previousLevel) {
      this.markTileDirty(mapId, x, y);
    }
    return nextValue;
  }

/** addTileResourceValue：执行对应的业务逻辑。 */
  addTileResourceValue(mapId: string, x: number, y: number, resourceKey: string, delta: number): number | null {
/** normalizedDelta：定义该变量以承载业务值。 */
    const normalizedDelta = Math.round(delta);
    if (!Number.isFinite(normalizedDelta) || normalizedDelta === 0) {
      return this.getTileResourceValue(mapId, x, y, resourceKey);
    }
/** currentValue：定义该变量以承载业务值。 */
    const currentValue = this.getTileResourceValue(mapId, x, y, resourceKey);
    return this.setTileResourceValue(mapId, x, y, resourceKey, currentValue + normalizedDelta);
  }

/** hasNpcAt：执行对应的业务逻辑。 */
  hasNpcAt(mapId: string, x: number, y: number): boolean {
    return this.occupancyDomain.hasNpcAt(mapId, x, y);
  }

/** isTerrainWalkable：执行对应的业务逻辑。 */
  isTerrainWalkable(mapId: string, x: number, y: number): boolean {
    return this.occupancyDomain.isTerrainWalkable(mapId, x, y);
  }

/** isPlayerOverlapTile：执行对应的业务逻辑。 */
  isPlayerOverlapTile(mapId: string, x: number, y: number): boolean {
    return this.occupancyDomain.isPlayerOverlapTile(mapId, x, y);
  }

/** resolvePlayerRespawnMapId：执行对应的业务逻辑。 */
  resolvePlayerRespawnMapId(preferredMapId?: string | null): string {
    return this.occupancyDomain.resolvePlayerRespawnMapId(preferredMapId);
  }

  resolveDefaultPlayerSpawnPosition(
    occupancyId?: string | null,
    preferredMapId?: string | null,
  ): { mapId: string; x: number; y: number } {
    return this.occupancyDomain.resolveDefaultPlayerSpawnPosition(occupancyId, preferredMapId);
  }

  resolvePlayerPlacement(
    mapId: string,
    x: number,
    y: number,
    occupancyId?: string | null,
  ): { mapId: string; x: number; y: number; mapMissing: boolean } {
    return this.occupancyDomain.resolvePlayerPlacement(mapId, x, y, occupancyId);
  }

/** isWalkable：执行对应的业务逻辑。 */
  isWalkable(mapId: string, x: number, y: number, options: OccupancyCheckOptions = {}): boolean {
    return this.occupancyDomain.isWalkable(mapId, x, y, options);
  }

/** canOccupy：执行对应的业务逻辑。 */
  canOccupy(mapId: string, x: number, y: number, options: OccupancyCheckOptions = {}): boolean {
    return this.occupancyDomain.canOccupy(mapId, x, y, options);
  }

/** blocksSight：执行对应的业务逻辑。 */
  blocksSight(mapId: string, x: number, y: number): boolean {
/** tile：定义该变量以承载业务值。 */
    const tile = this.getCompositeTile(mapId, x, y);
    return tile === null ? true : tile.blocksSight;
  }

/** getTraversalCost：执行对应的业务逻辑。 */
  getTraversalCost(mapId: string, x: number, y: number): number {
/** tile：定义该变量以承载业务值。 */
    const tile = this.getTile(mapId, x, y);
    if (!tile || !tile.walkable) return Number.POSITIVE_INFINITY;
    return getTileTraversalCost(tile.type);
  }

/** canTraverseTerrain：执行对应的业务逻辑。 */
  canTraverseTerrain(mapId: string, x: number, y: number): boolean {
    return this.occupancyDomain.canTraverseTerrain(mapId, x, y);
  }

/** addOccupant：执行对应的业务逻辑。 */
  addOccupant(mapId: string, x: number, y: number, occupancyId: string, kind: OccupantKind = 'player'): void {
    this.occupancyDomain.addOccupant(mapId, x, y, occupancyId, kind);
  }

/** removeOccupant：执行对应的业务逻辑。 */
  removeOccupant(mapId: string, x: number, y: number, occupancyId: string): void {
    this.occupancyDomain.removeOccupant(mapId, x, y, occupancyId);
  }

  damageTile(
    mapId: string,
    x: number,
    y: number,
    damage: number,
  ): { destroyed: boolean; hp: number; maxHp: number; appliedDamage: number; targetType: TileType } | null {
/** tile：定义该变量以承载业务值。 */
    const tile = this.getTile(mapId, x, y);
/** originalType：定义该变量以承载业务值。 */
    const originalType = this.getBaseTileType(mapId, x, y);
    if (!tile || originalType === null) return null;

/** maxHp：定义该变量以承载业务值。 */
    const maxHp = this.tileDurability(mapId, originalType);
    if (maxHp <= 0) {
      return null;
    }

/** mapStates：定义该变量以承载业务值。 */
    const mapStates = this.dynamicTileStates.get(mapId) ?? new Map<string, DynamicTileState>();
/** key：定义该变量以承载业务值。 */
    const key = this.tileStateKey(x, y);
/** current：定义该变量以承载业务值。 */
    const current = mapStates.get(key);
    if (current?.destroyed) {
      return null;
    }

/** nextDamage：定义该变量以承载业务值。 */
    const nextDamage = Math.max(0, Math.round(damage));
    if (nextDamage <= 0) {
/** hp：定义该变量以承载业务值。 */
      const hp = current?.hp ?? tile.hp ?? maxHp;
      return { destroyed: false, hp, maxHp, appliedDamage: 0, targetType: originalType };
    }

/** state：定义该变量以承载业务值。 */
    const state: DynamicTileState = current ?? {
      x,
      y,
      originalType,
      hp: tile.hp ?? maxHp,
      maxHp,
      destroyed: false,
    };

    state.originalType = originalType;
    state.maxHp = maxHp;
/** currentHp：定义该变量以承载业务值。 */
    const currentHp = state.hp;
/** appliedDamage：定义该变量以承载业务值。 */
    const appliedDamage = Math.min(currentHp, nextDamage);
    state.hp = Math.max(0, currentHp - appliedDamage);
    state.destroyed = state.hp <= 0;
    state.restoreTicksLeft = state.destroyed ? this.calculateTileRestoreTicks(originalType) : undefined;
    this.applyDynamicTileStateToTile(tile, state);
    this.markTileDirty(mapId, x, y);

    mapStates.set(key, state);
    this.dynamicTileStates.set(mapId, mapStates);
    this.dynamicTileStatesDirty = true;
    this.markTileRuntimeMapDirty(mapId);

    if (state.destroyed) {
      this.bumpMapRevision(mapId);
      return { destroyed: true, hp: 0, maxHp, appliedDamage, targetType: originalType };
    }

    return { destroyed: false, hp: state.hp, maxHp: state.maxHp, appliedDamage, targetType: originalType };
  }

  findNearbyWalkable(
    mapId: string,
    x: number,
    y: number,
    maxRadius = 6,
/** options：定义该变量以承载业务值。 */
    options: OccupancyCheckOptions = {},
  ): { x: number; y: number } | null {
    return this.occupancyDomain.findNearbyWalkable(mapId, x, y, maxRadius, options);
  }

  private resolveWalkablePlayerPositionInMap(
    mapId: string,
    x: number,
    y: number,
    occupancyId?: string | null,
  ): { x: number; y: number } {
    return this.occupancyDomain.resolveWalkablePlayerPositionInMap(mapId, x, y, occupancyId);
  }

/** getViewTiles：执行对应的业务逻辑。 */
  getViewTiles(mapId: string, cx: number, cy: number, radius = VIEW_RADIUS, visibleKeys?: Set<string>): VisibleTile[][] {
    if (!this.maps.has(mapId)) return [];
/** result：定义该变量以承载业务值。 */
    const result: VisibleTile[][] = [];
/** size：定义该变量以承载业务值。 */
    const size = radius * 2 + 1;
    for (let dy = 0; dy < size; dy++) {
      const row: VisibleTile[] = [];
      for (let dx = 0; dx < size; dx++) {
        const wx = cx - radius + dx;
        const wy = cy - radius + dy;
/** key：定义该变量以承载业务值。 */
        const key = `${wx},${wy}`;
        if (visibleKeys && !visibleKeys.has(key)) {
          row.push(null);
          continue;
        }
/** tile：定义该变量以承载业务值。 */
        const tile = this.getCompositeTile(mapId, wx, wy) ?? {
          type: TileType.Wall,
          walkable: false,
          blocksSight: true,
          aura: 0,
          occupiedBy: null,
          modifiedAt: null,
        };
/** hiddenEntrance：定义该变量以承载业务值。 */
        const hiddenEntrance = this.getHiddenPortalObservationAt(mapId, wx, wy);
        row.push(hiddenEntrance ? { ...tile, hiddenEntrance } : tile);
      }
      result.push(row);
    }
    return result;
  }

/** getAllMapIds：执行对应的业务逻辑。 */
  getAllMapIds(): string[] {
    return [...this.maps.keys()];
  }

/** normalizeMapTimeConfig：执行对应的业务逻辑。 */
  private normalizeMapTimeConfig(raw: unknown): MapTimeConfig {
/** candidate：定义该变量以承载业务值。 */
    const candidate = (raw ?? {}) as Partial<MapTimeConfig>;
/** palette：定义该变量以承载业务值。 */
    const palette = candidate.palette && typeof candidate.palette === 'object' ? candidate.palette : {};
/** normalizedPalette：定义该变量以承载业务值。 */
    const normalizedPalette = Object.fromEntries(
      Object.entries(palette).flatMap(([phase, entry]) => {
        if (!entry || typeof entry !== 'object') {
          return [];
        }
/** tint：定义该变量以承载业务值。 */
        const tint = typeof entry.tint === 'string' ? entry.tint : undefined;
/** alpha：定义该变量以承载业务值。 */
        const alpha = typeof entry.alpha === 'number' && Number.isFinite(entry.alpha)
          ? Math.max(0, Math.min(1, entry.alpha))
          : undefined;
        return [[phase, { tint, alpha }]];
      }),
    ) as NonNullable<MapTimeConfig['palette']>;

    return {
      offsetTicks: Number.isFinite(candidate.offsetTicks)
        ? Math.round(candidate.offsetTicks ?? 0)
        : DEFAULT_MAP_TIME_CONFIG.offsetTicks,
/** scale：定义该变量以承载业务值。 */
      scale: typeof candidate.scale === 'number' && Number.isFinite(candidate.scale) && candidate.scale >= 0
        ? candidate.scale
        : DEFAULT_MAP_TIME_CONFIG.scale,
      light: {
/** base：定义该变量以承载业务值。 */
        base: typeof candidate.light?.base === 'number' && Number.isFinite(candidate.light.base)
          ? Math.max(0, Math.min(100, candidate.light.base))
          : DEFAULT_MAP_TIME_CONFIG.light?.base,
/** timeInfluence：定义该变量以承载业务值。 */
        timeInfluence: typeof candidate.light?.timeInfluence === 'number' && Number.isFinite(candidate.light.timeInfluence)
          ? Math.max(0, Math.min(100, candidate.light.timeInfluence))
          : DEFAULT_MAP_TIME_CONFIG.light?.timeInfluence,
      },
      palette: normalizedPalette,
    };
  }

/** tileDurability：执行对应的业务逻辑。 */
  private tileDurability(mapId: string, type: TileType): number {
/** profileId：定义该变量以承载业务值。 */
    const profileId = this.resolveTerrainProfileId(mapId);
/** profile：定义该变量以承载业务值。 */
    const profile = this.resolveTerrainDurabilityProfile(profileId, type);
    if (!profile) {
      return 0;
    }
/** terrainRealmLv：定义该变量以承载业务值。 */
    const terrainRealmLv = this.resolveTerrainRealmLv(mapId);
    return calculateTerrainDurability(terrainRealmLv, profile.multiplier);
  }

/** resolveTerrainProfileId：执行对应的业务逻辑。 */
  private resolveTerrainProfileId(mapId: string): string {
    return this.maps.get(mapId)?.source.terrainProfileId
      ?? LEGACY_MAP_TERRAIN_PROFILE_IDS[mapId]
      ?? mapId;
  }

/** resolveTerrainRealmLv：执行对应的业务逻辑。 */
  private resolveTerrainRealmLv(mapId: string): number {
    return this.resolveTerrainRealmLvFromDocument(this.maps.get(mapId)?.source);
  }

/** resolveTerrainRealmLvFromDocument：执行对应的业务逻辑。 */
  private resolveTerrainRealmLvFromDocument(document: Pick<GmMapDocument, 'terrainRealmLv' | 'dangerLevel'> | undefined): number {
    if (!document) {
      return 1;
    }
    if (Number.isFinite(document.terrainRealmLv)) {
      return Math.max(1, Math.floor(Number(document.terrainRealmLv)));
    }
    if (Number.isFinite(document.dangerLevel)) {
      return Math.max(1, Math.floor(Number(document.dangerLevel)));
    }
    return 1;
  }

/** resolveTerrainDurabilityProfile：执行对应的业务逻辑。 */
  private resolveTerrainDurabilityProfile(profileId: string, type: TileType): TerrainDurabilityProfile | undefined {
    return TERRAIN_DURABILITY_PROFILES[profileId as keyof typeof TERRAIN_DURABILITY_PROFILES]?.[type]
      ?? DEFAULT_TERRAIN_DURABILITY_BY_TILE[type];
  }

/** destroyedTileType：执行对应的业务逻辑。 */
  private destroyedTileType(type: TileType): TileType {
    switch (type) {
      case TileType.Cloud:
        return TileType.CloudFloor;
      case TileType.Tree:
      case TileType.Bamboo:
        return TileType.Grass;
      case TileType.Window:
        return TileType.BrokenWindow;
      case TileType.Wall:
      case TileType.Cliff:
      case TileType.Stone:
      case TileType.SpiritOre:
      case TileType.BlackIronOre:
      case TileType.BrokenSwordHeap:
      case TileType.HouseEave:
      case TileType.HouseCorner:
      case TileType.ScreenWall:
      case TileType.Door:
      case TileType.Veranda:
        return TileType.Floor;
      default:
        return type;
    }
  }

}

/**
 * 地图服务 —— 管理所有地图的加载、热重载、地块查询、占位管理、
 * 传送点/NPC/怪物刷新点/容器/任务配置的解析，以及动态地块（可破坏地形）的状态维护。
 */
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import {
  buildEditableMapList as buildEditableMapListResult,
  cloneMapDocument as cloneEditableMapDocument,
  calculateTerrainDurability,
  DEFAULT_MAP_TIME_CONFIG,
  doesTileTypeBlockSight,
  getTileTypeFromMapChar,
  GmMapAuraRecord,
  GmMapContainerRecord,
  GmMapDocument,
  GmMapLandmarkRecord,
  GmMapListRes,
  GmMapMonsterSpawnRecord,
  GmMapNpcRecord,
  GmMapPortalRecord,
  GmMapSummary,
  inferMonsterValueStatsFromLegacy,
  isTileTypeWalkable,
  isOffsetInRange,
  isPointInRange,
  Tile,
  TileType,
  MapMeta,
  MapMinimapArchiveEntry,
  MapMinimapMarker,
  MapMinimapSnapshot,
  MapSpaceVisionMode,
  MapTimeConfig,
  MonsterAggroMode,
  MonsterCombatModel,
  NumericStats,
  normalizeEditableMapDocument as normalizeEditableMapDocumentValue,
  PartialNumericStats,
  Portal,
  PortalKind,
  PortalTrigger,
  resolveMonsterNumericStatsFromValueStats,
  VIEW_RADIUS,
  validateEditableMapDocument as validateEditableMapDocumentValue,
  ItemType,
  VisibleTile,
  getTileTraversalCost,
  getAuraLevel,
  normalizeAuraLevelBaseValue,
  normalizeConfiguredAuraValue,
  PlayerRealmStage,
  QuestLine,
  QuestObjectiveType,
  TerrainDurabilityMaterial,
  TERRAIN_DESTROYED_RESTORE_TICKS,
  TERRAIN_REGEN_RATE_PER_TICK,
  TERRAIN_RESTORE_RETRY_DELAY_TICKS,
  TechniqueGrade,
  DEFAULT_AURA_LEVEL_BASE_VALUE,
  TILE_AURA_HALF_LIFE_RATE_SCALE,
  TILE_AURA_HALF_LIFE_RATE_SCALED,
} from '@mud/shared';
import * as fs from 'fs';
import * as path from 'path';
import { resolveServerDataPath } from '../common/data-path';
import { PersistentDocumentService } from '../database/persistent-document.service';
import { ContentService } from './content.service';
import { PathfindingActorType, PathfindingStaticGrid } from './pathfinding/pathfinding.types';
import { resolveRealmStageTargetLabel } from './quest-display';
import {
  DEFAULT_TERRAIN_DURABILITY_BY_TILE,
  LEGACY_MAP_TERRAIN_PROFILE_IDS,
  SPECIAL_TILE_DURABILITY_MULTIPLIERS,
  TERRAIN_DURABILITY_PROFILES,
  TerrainDurabilityProfile,
} from '../constants/world/terrain';

export interface QuestConfig {
  id: string;
  title: string;
  desc: string;
  line: QuestLine;
  chapter?: string;
  story?: string;
  objectiveType: QuestObjectiveType;
  objectiveText?: string;
  targetName: string;
  targetMonsterId?: string;
  targetTechniqueId?: string;
  targetRealmStage?: PlayerRealmStage;
  required: number;
  rewards: DropConfig[];
  rewardItemIds: string[];
  rewardItemId: string;
  rewardText: string;
  nextQuestId?: string;
  requiredItemId?: string;
  requiredItemCount?: number;
  targetMapId?: string;
  targetMapName?: string;
  targetX?: number;
  targetY?: number;
  targetNpcId?: string;
  targetNpcName?: string;
  submitNpcId?: string;
  submitNpcName?: string;
  submitMapId?: string;
  submitMapName?: string;
  submitX?: number;
  submitY?: number;
  relayMessage?: string;
  unlockBreakthroughRequirementIds?: string[];
  giverId: string;
  giverName: string;
  giverMapId: string;
  giverMapName: string;
  giverX: number;
  giverY: number;
}

export interface NpcConfig {
  id: string;
  name: string;
  x: number;
  y: number;
  char: string;
  color: string;
  dialogue: string;
  role?: string;
  quests: QuestConfig[];
}

export interface DropConfig {
  itemId: string;
  name: string;
  type: ItemType;
  count: number;
  chance: number;
}

export interface ContainerConfig {
  id: string;
  name: string;
  x: number;
  y: number;
  desc?: string;
  grade: TechniqueGrade;
  refreshTicks?: number;
  drops: DropConfig[];
}

export interface MonsterSpawnConfig {
  id: string;
  name: string;
  x: number;
  y: number;
  char: string;
  color: string;
  grade: TechniqueGrade;
  valueStats?: PartialNumericStats;
  numericStats: NumericStats;
  combatModel: MonsterCombatModel;
  hp: number;
  maxHp: number;
  attack: number;
  count: number;
  radius: number;
  maxAlive: number;
  aggroRange: number;
  viewRange: number;
  aggroMode: MonsterAggroMode;
  respawnTicks: number;
  level?: number;
  expMultiplier: number;
  drops: DropConfig[];
}

interface MapData {
  meta: MapMeta;
  tiles: Tile[][];
  portals: Portal[];
  auraPoints: MapAuraPoint[];
  baseAuraValues: Map<string, number>;
  containers: ContainerConfig[];
  npcs: NpcConfig[];
  monsterSpawns: MonsterSpawnConfig[];
  minimap: MapMinimapSnapshot;
  minimapSignature: string;
  spawnPoint: { x: number; y: number };
  source: GmMapDocument;
}

interface MapAuraPoint {
  x: number;
  y: number;
  value: number;
}

interface DynamicTileState {
  x: number;
  y: number;
  originalType: TileType;
  hp: number;
  maxHp: number;
  destroyed: boolean;
  restoreTicksLeft?: number;
}

interface PersistedDynamicTileRecord {
  x: number;
  y: number;
  hp: number;
  destroyed: boolean;
  restoreTicksLeft?: number;
}

interface PersistedDynamicTileSnapshot {
  version: 1;
  maps: Record<string, PersistedDynamicTileRecord[]>;
}

interface PersistedAuraRecord {
  x: number;
  y: number;
  value: number;
  sourceValue?: number;
  decayRemainder?: number;
  sourceRemainder?: number;
}

interface PersistedAuraSnapshot {
  version: 1;
  maps: Record<string, PersistedAuraRecord[]>;
}

interface AuraRuntimeState extends PersistedAuraRecord {}

interface PersistedTileRuntimeTerrainRecord {
  hp: number;
  destroyed: boolean;
  restoreTicksLeft?: number;
}

interface PersistedTileRuntimeResourceRecord {
  value: number;
  sourceValue?: number;
  decayRemainder?: number;
  sourceRemainder?: number;
}

interface PersistedTileRuntimeRecord {
  x: number;
  y: number;
  terrain?: PersistedTileRuntimeTerrainRecord;
  resources?: Record<string, PersistedTileRuntimeResourceRecord>;
}

interface PersistedMapTimeState {
  totalTicks?: number;
  config?: MapTimeConfig;
  tickSpeed?: number;
}

interface PersistedTileRuntimeSnapshot {
  version: 1 | 2;
  maps: Record<string, PersistedTileRuntimeRecord[]>;
  time?: Record<string, PersistedMapTimeState>;
}

interface SyncedMapDocument {
  document: GmMapDocument;
  previousDocument?: GmMapDocument;
}

const MAP_DOCUMENT_SCOPE = 'map_document';
const RUNTIME_STATE_SCOPE = 'runtime_state';
const MAP_TILE_RUNTIME_DOCUMENT_KEY = 'map_tile';

type OccupantKind = 'player' | 'monster';

interface OccupancyCheckOptions {
  occupancyId?: string | null;
  actorType?: OccupantKind;
}

export interface NpcLocation {
  mapId: string;
  mapName: string;
  x: number;
  y: number;
  name: string;
}

interface PortalQueryOptions {
  trigger?: PortalTrigger;
  kind?: PortalKind;
}

interface ProjectedPoint {
  x: number;
  y: number;
}

interface PortalObservationHint {
  title: string;
  desc?: string;
}

@Injectable()
export class MapService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MapService.name);
  private maps: Map<string, MapData> = new Map();
  private quests: Map<string, QuestConfig> = new Map();
  private monsters: Map<string, MonsterSpawnConfig> = new Map();
  private revisions: Map<string, number> = new Map();
  private tilePatchRevisions: Map<string, number> = new Map();
  private pathfindingStaticGrids: Map<string, PathfindingStaticGrid> = new Map();
  private dirtyTileKeysByMap: Map<string, Set<string>> = new Map();
  private occupantsByMap: Map<string, Map<string, Map<string, OccupantKind>>> = new Map();
  private playerOverlapPointsByMap: Map<string, Set<string>> = new Map();
  private dynamicTileStates: Map<string, Map<string, DynamicTileState>> = new Map();
  private persistedDynamicTileStates: Map<string, Map<string, PersistedDynamicTileRecord>> = new Map();
  private dynamicTileStatesDirty = false;
  private auraStates: Map<string, Map<string, AuraRuntimeState>> = new Map();
  private persistedAuraStates: Map<string, Map<string, AuraRuntimeState>> = new Map();
  private auraStatesDirty = false;
  private mapTimeStates: Map<string, PersistedMapTimeState> = new Map();
  private persistedMapTimeStates: Map<string, PersistedMapTimeState> = new Map();
  private mapTimeStatesDirty = false;
  private mapsDir = resolveServerDataPath('maps');
  private readonly tileRuntimeStatePath = resolveServerDataPath('runtime', 'map-tile-runtime-state.json');
  private readonly legacyDynamicTileStatePath = resolveServerDataPath('runtime', 'dynamic-map-state.json');
  private readonly legacyAuraStatePath = resolveServerDataPath('runtime', 'map-aura-state.json');
  private auraLevelBaseValue = DEFAULT_AURA_LEVEL_BASE_VALUE;

  constructor(
    private readonly contentService: ContentService,
    private readonly persistentDocumentService: PersistentDocumentService,
  ) {}

  async onModuleInit() {
    await this.loadPersistedTileRuntimeStates();
    this.contentService.ensureLoaded();
    const syncedMaps = await this.syncMapDocumentsFromFiles();
    this.loadAllMaps(syncedMaps);
  }

  async onModuleDestroy() {
    await this.persistTileRuntimeStates();
  }

  setAuraLevelBaseValue(value: number): void {
    const normalizedValue = normalizeAuraLevelBaseValue(value, this.auraLevelBaseValue);
    if (normalizedValue === this.auraLevelBaseValue) {
      return;
    }
    this.auraLevelBaseValue = normalizedValue;
    for (const document of [...this.maps.values()].map((map) => this.cloneMapDocument(map.source))) {
      this.loadMap(document, document);
    }
  }

  getAuraLevelBaseValue(): number {
    return this.auraLevelBaseValue;
  }

  private async loadPersistedTileRuntimeStates() {
    this.persistedDynamicTileStates.clear();
    this.persistedAuraStates.clear();
    this.persistedMapTimeStates.clear();
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
      const rawMaps = snapshot?.maps;
      if (!rawMaps || typeof rawMaps !== 'object') {
        this.logger.warn('地块运行时持久化数据格式非法，已忽略');
        return;
      }

      let terrainStateCount = 0;
      let resourceStateCount = 0;
      let timeStateCount = 0;
      for (const [mapId, rawRecords] of Object.entries(rawMaps)) {
        if (!Array.isArray(rawRecords)) {
          continue;
        }

        const terrainRecords = new Map<string, PersistedDynamicTileRecord>();
        const auraRecords = new Map<string, AuraRuntimeState>();
        for (const rawRecord of rawRecords) {
          const record = rawRecord as Partial<PersistedTileRuntimeRecord>;
          if (!Number.isInteger(record.x) || !Number.isInteger(record.y)) {
            continue;
          }

          const key = this.tileStateKey(Number(record.x), Number(record.y));
          const terrain = record.terrain as Partial<PersistedTileRuntimeTerrainRecord> | undefined;
          if (
            terrain
            && Number.isFinite(terrain.hp)
            && typeof terrain.destroyed === 'boolean'
          ) {
            terrainRecords.set(key, {
              x: Number(record.x),
              y: Number(record.y),
              hp: Math.max(0, Math.round(Number(terrain.hp))),
              destroyed: terrain.destroyed,
              restoreTicksLeft: terrain.destroyed
                ? this.normalizeRestoreTicksLeft(terrain.restoreTicksLeft)
                : undefined,
            });
          }

          const aura = record.resources?.aura as Partial<PersistedTileRuntimeResourceRecord> | undefined;
          if (aura && Number.isFinite(aura.value)) {
            auraRecords.set(key, {
              x: Number(record.x),
              y: Number(record.y),
              value: Math.max(0, Math.round(Number(aura.value))),
              sourceValue: Number.isFinite(aura.sourceValue) ? Math.max(0, Math.round(Number(aura.sourceValue))) : 0,
              decayRemainder: Number.isFinite(aura.decayRemainder) ? Math.max(0, Math.round(Number(aura.decayRemainder))) : 0,
              sourceRemainder: Number.isFinite(aura.sourceRemainder) ? Math.max(0, Math.round(Number(aura.sourceRemainder))) : 0,
            });
          }
        }

        if (terrainRecords.size > 0) {
          this.persistedDynamicTileStates.set(mapId, terrainRecords);
          terrainStateCount += terrainRecords.size;
        }
        if (auraRecords.size > 0) {
          this.persistedAuraStates.set(mapId, auraRecords);
          resourceStateCount += auraRecords.size;
        }
      }

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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`读取地块运行时持久化数据失败: ${message}`);
    }
  }

  private async importLegacyTileRuntimeStateIfNeeded(): Promise<void> {
    if (!fs.existsSync(this.tileRuntimeStatePath) && !fs.existsSync(this.legacyDynamicTileStatePath) && !fs.existsSync(this.legacyAuraStatePath)) {
      return;
    }

    this.persistedDynamicTileStates.clear();
    this.persistedAuraStates.clear();
    this.persistedMapTimeStates.clear();

    if (fs.existsSync(this.tileRuntimeStatePath)) {
      try {
        const snapshot = JSON.parse(fs.readFileSync(this.tileRuntimeStatePath, 'utf-8')) as PersistedTileRuntimeSnapshot;
        await this.persistentDocumentService.save(RUNTIME_STATE_SCOPE, MAP_TILE_RUNTIME_DOCUMENT_KEY, snapshot);
        this.logger.log('已从旧地块运行时 JSON 导入 PostgreSQL');
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`导入旧地块运行时 JSON 失败: ${message}`);
      }
    }

    this.loadLegacyPersistedTileRuntimeStates();
    if (
      this.persistedDynamicTileStates.size === 0
      && this.persistedAuraStates.size === 0
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

  private loadLegacyPersistedTileRuntimeStates() {
    this.loadLegacyPersistedDynamicTileStates();
    this.loadLegacyPersistedAuraStates();
  }

  private loadLegacyPersistedDynamicTileStates() {
    if (!fs.existsSync(this.legacyDynamicTileStatePath)) {
      return;
    }

    try {
      const snapshot = JSON.parse(fs.readFileSync(this.legacyDynamicTileStatePath, 'utf-8')) as Partial<PersistedDynamicTileSnapshot>;
      const rawMaps = snapshot?.maps;
      if (!rawMaps || typeof rawMaps !== 'object') {
        this.logger.warn('旧动态地块持久化文件格式非法，已忽略');
        return;
      }

      for (const [mapId, rawRecords] of Object.entries(rawMaps)) {
        if (!Array.isArray(rawRecords)) {
          continue;
        }
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
          const normalized: PersistedDynamicTileRecord = {
            x: Number(record.x),
            y: Number(record.y),
            hp: Math.max(0, Math.round(Number(record.hp))),
            destroyed: record.destroyed,
            restoreTicksLeft: record.destroyed
              ? this.normalizeRestoreTicksLeft(record.restoreTicksLeft)
              : undefined,
          };
          records.set(this.tileStateKey(normalized.x, normalized.y), normalized);
        }
        if (records.size > 0) {
          this.persistedDynamicTileStates.set(mapId, records);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`读取旧动态地块持久化文件失败: ${message}`);
    }
  }

  private loadLegacyPersistedAuraStates() {
    if (!fs.existsSync(this.legacyAuraStatePath)) {
      return;
    }

    try {
      const snapshot = JSON.parse(fs.readFileSync(this.legacyAuraStatePath, 'utf-8')) as Partial<PersistedAuraSnapshot>;
      const rawMaps = snapshot?.maps;
      if (!rawMaps || typeof rawMaps !== 'object') {
        this.logger.warn('旧灵气持久化文件格式非法，已忽略');
        return;
      }

      for (const [mapId, rawRecords] of Object.entries(rawMaps)) {
        if (!Array.isArray(rawRecords)) {
          continue;
        }
        const records = new Map<string, AuraRuntimeState>();
        for (const rawRecord of rawRecords) {
          const record = rawRecord as Partial<PersistedAuraRecord>;
          if (
            !Number.isInteger(record.x)
            || !Number.isInteger(record.y)
            || !Number.isFinite(record.value)
          ) {
            continue;
          }
          const normalized: AuraRuntimeState = {
            x: Number(record.x),
            y: Number(record.y),
            value: Math.max(0, Math.round(Number(record.value))),
            sourceValue: Number.isFinite(record.sourceValue) ? Math.max(0, Math.round(Number(record.sourceValue))) : 0,
            decayRemainder: Number.isFinite(record.decayRemainder) ? Math.max(0, Math.round(Number(record.decayRemainder))) : 0,
            sourceRemainder: Number.isFinite(record.sourceRemainder) ? Math.max(0, Math.round(Number(record.sourceRemainder))) : 0,
          };
          records.set(this.tileStateKey(normalized.x, normalized.y), normalized);
        }
        if (records.size > 0) {
          this.persistedAuraStates.set(mapId, records);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`读取旧灵气持久化文件失败: ${message}`);
    }
  }

  private buildPersistedTileRuntimeSnapshotFromState(): PersistedTileRuntimeSnapshot {
    const snapshot: PersistedTileRuntimeSnapshot = {
      version: 2,
      maps: {},
    };

    const allMapIds = [...new Set([
      ...this.persistedDynamicTileStates.keys(),
      ...this.persistedAuraStates.keys(),
    ])].sort((left, right) => left.localeCompare(right, 'zh-CN'));

    for (const mapId of allMapIds) {
      const dynamicStateMap = this.persistedDynamicTileStates.get(mapId);
      const auraStateMap = this.persistedAuraStates.get(mapId);
      const allTileKeys = [...new Set([
        ...(dynamicStateMap ? [...dynamicStateMap.keys()] : []),
        ...(auraStateMap ? [...auraStateMap.keys()] : []),
      ])].sort((left, right) => {
        const [leftX, leftY] = left.split(',').map((value) => Number.parseInt(value, 10));
        const [rightX, rightY] = right.split(',').map((value) => Number.parseInt(value, 10));
        return leftY - rightY || leftX - rightX;
      });

      const records: PersistedTileRuntimeRecord[] = [];
      for (const key of allTileKeys) {
        const terrain = dynamicStateMap?.get(key);
        const aura = auraStateMap?.get(key);
        if (!terrain && !aura) {
          continue;
        }

        const [x, y] = key.split(',').map((value) => Number.parseInt(value, 10));
        const record: PersistedTileRuntimeRecord = { x, y };
        if (terrain) {
          record.terrain = {
            hp: terrain.hp,
            destroyed: terrain.destroyed,
            restoreTicksLeft: terrain.destroyed ? this.normalizeRestoreTicksLeft(terrain.restoreTicksLeft) : undefined,
          };
        }
        if (aura) {
          record.resources = {
            aura: {
              value: aura.value,
              sourceValue: aura.sourceValue,
              decayRemainder: aura.decayRemainder,
              sourceRemainder: aura.sourceRemainder,
            },
          };
        }
        records.push(record);
      }

      if (records.length > 0) {
        snapshot.maps[mapId] = records;
      }
    }

    const allTimeMapIds = [...this.persistedMapTimeStates.keys()]
      .sort((left, right) => left.localeCompare(right, 'zh-CN'));
    for (const mapId of allTimeMapIds) {
      const state = this.persistedMapTimeStates.get(mapId);
      if (!state) {
        continue;
      }
      snapshot.time ??= {};
      snapshot.time[mapId] = {
        totalTicks: state.totalTicks,
        config: state.config ? this.normalizeMapTimeConfig(state.config) : undefined,
        tickSpeed: state.tickSpeed,
      };
    }

    return snapshot;
  }

  private async syncMapDocumentsFromFiles(): Promise<SyncedMapDocument[]> {
    const persistedDocuments = await this.persistentDocumentService.getScope<unknown>(MAP_DOCUMENT_SCOPE);
    const persistedByMapId = new Map<string, GmMapDocument>(
      persistedDocuments.map((entry) => [entry.key, this.normalizeEditableMapDocument(entry.payload)]),
    );

    const files = fs.readdirSync(this.mapsDir)
      .filter((file) => file.endsWith('.json'))
      .sort((left, right) => left.localeCompare(right, 'zh-CN'));

    const synced: SyncedMapDocument[] = [];
    const fileMapIds = new Set<string>();
    let createdCount = 0;
    let updatedCount = 0;

    for (const file of files) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(this.mapsDir, file), 'utf-8'));
        const normalized = this.normalizeEditableMapDocument(raw);
        const nextPayload = this.dehydrateEditableMapDocument(normalized);
        const previousDocument = persistedByMapId.get(normalized.id);
        const previousPayload = previousDocument ? this.dehydrateEditableMapDocument(previousDocument) : null;
        if (JSON.stringify(previousPayload) !== JSON.stringify(nextPayload)) {
          await this.persistentDocumentService.save(MAP_DOCUMENT_SCOPE, normalized.id, nextPayload);
          if (previousDocument) {
            updatedCount += 1;
          } else {
            createdCount += 1;
          }
        }
        fileMapIds.add(normalized.id);
        synced.push({ document: normalized, previousDocument });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`地图同步失败 ${file}: ${message}`);
      }
    }

    let deletedCount = 0;
    for (const mapId of persistedByMapId.keys()) {
      if (fileMapIds.has(mapId)) {
        continue;
      }
      await this.persistentDocumentService.delete(MAP_DOCUMENT_SCOPE, mapId);
      deletedCount += 1;
    }

    if (createdCount > 0 || updatedCount > 0 || deletedCount > 0) {
      this.logger.log(`已同步地图静态镜像：新增 ${createdCount} 张，更新 ${updatedCount} 张，删除 ${deletedCount} 张`);
    }

    return synced;
  }

  private loadAllMaps(entries: SyncedMapDocument[]) {
    this.contentService.ensureLoaded();
    for (const entry of entries) {
      this.loadMap(entry.document, entry.previousDocument);
    }
    this.rebuildAllMinimapSnapshots();
    this.logger.log(`已加载 ${this.maps.size} 张地图`);
  }

  private loadMap(raw: unknown, previousDocument?: GmMapDocument) {
    const document = this.normalizeEditableMapDocument(raw);
    const tileRows = document.tiles;
    const tiles: Tile[][] = tileRows.map((row, y) =>
      [...row].map((char, x) => {
        const type = getTileTypeFromMapChar(char);
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
    const meta: MapMeta = {
      id: document.id,
      name: document.name,
      width: document.width,
      height: document.height,
      parentMapId: typeof document.parentMapId === 'string' && document.parentMapId.trim()
        ? document.parentMapId
        : undefined,
      parentOriginX: Number.isInteger(document.parentOriginX) ? Number(document.parentOriginX) : undefined,
      parentOriginY: Number.isInteger(document.parentOriginY) ? Number(document.parentOriginY) : undefined,
      floorLevel: Number.isInteger(document.floorLevel) ? Number(document.floorLevel) : undefined,
      floorName: typeof document.floorName === 'string' && document.floorName.trim()
        ? document.floorName
        : undefined,
      spaceVisionMode: this.normalizeMapSpaceVisionMode(document.spaceVisionMode, document.parentMapId),
      dangerLevel: Number.isFinite(document.dangerLevel) ? Number(document.dangerLevel) : undefined,
      recommendedRealm: typeof document.recommendedRealm === 'string' ? document.recommendedRealm : undefined,
      description: typeof document.description === 'string' ? document.description : undefined,
    };
    const portals = this.normalizePortals(document.portals, meta);
    const auraPoints = this.normalizeAuraPoints(document.auras, meta);
    const baseAuraValues = new Map<string, number>(auraPoints.map((point) => [this.tileStateKey(point.x, point.y), point.value]));

    // 确保配置的 portal 坐标在地图上是传送门类型，避免仅靠字符图导致漏配。
    for (const portal of portals) {
      const tile = tiles[portal.y]?.[portal.x];
      if (tile) {
        tile.type = portal.kind === 'stairs' ? TileType.Stairs : TileType.Portal;
        tile.walkable = true;
        tile.blocksSight = false;
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

    const containers = this.normalizeContainers(document.landmarks, meta);
    const npcs = this.normalizeNpcs(document.npcs, meta);
    const monsterSpawns = this.normalizeMonsterSpawns(document.monsterSpawns, meta);
    const minimap = this.buildMinimapSnapshot(meta, document, portals, containers, npcs, monsterSpawns);

    for (const npc of npcs) {
      for (const quest of npc.quests) {
        this.quests.set(quest.id, quest);
      }
    }
    for (const monster of monsterSpawns) {
      this.monsters.set(monster.id, monster);
    }

    this.maps.set(document.id, {
      meta,
      tiles,
      portals,
      auraPoints,
      baseAuraValues,
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

  getEditableMapList(): GmMapListRes {
    return buildEditableMapListResult([...this.maps.values()].map((map) => map.source));
  }

  getEditableMap(mapId: string): GmMapDocument | undefined {
    const map = this.maps.get(mapId);
    if (!map) return undefined;
    return this.cloneMapDocument(map.source);
  }

  async saveEditableMap(mapId: string, document: GmMapDocument): Promise<string | null> {
    if (mapId !== document.id) {
      return '地图 ID 不允许在编辑器中直接修改';
    }

    const normalized = this.normalizeEditableMapDocument(document);
    const error = this.validateEditableMapDocument(normalized);
    if (error) {
      return error;
    }

    const filePath = path.join(this.mapsDir, `${mapId}.json`);
    const previousDocument = this.maps.get(mapId)?.source;
    const previousPersisted = previousDocument
      ? this.dehydrateEditableMapDocument(previousDocument)
      : null;
    const previousFileContent = fs.existsSync(filePath)
      ? fs.readFileSync(filePath, 'utf-8')
      : null;

    try {
      const persisted = this.dehydrateEditableMapDocument(normalized);
      fs.writeFileSync(filePath, `${JSON.stringify(persisted, null, 2)}\n`, 'utf-8');
      await this.persistentDocumentService.save(MAP_DOCUMENT_SCOPE, mapId, persisted);
      this.loadMap(normalized, previousDocument);
      return null;
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : '地图保存失败';

      try {
        if (previousFileContent === null) {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } else {
          fs.writeFileSync(filePath, previousFileContent, 'utf-8');
        }
      } catch (rollbackError) {
        const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
        this.logger.error(`地图文件回滚失败 ${mapId}: ${rollbackMessage}`);
      }

      try {
        if (previousPersisted) {
          await this.persistentDocumentService.save(MAP_DOCUMENT_SCOPE, mapId, previousPersisted);
        } else {
          await this.persistentDocumentService.delete(MAP_DOCUMENT_SCOPE, mapId);
        }
      } catch (rollbackError) {
        const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
        this.logger.error(`地图静态镜像回滚失败 ${mapId}: ${rollbackMessage}`);
      }

      if (previousDocument) {
        try {
          this.loadMap(previousDocument, previousDocument);
        } catch (rollbackError) {
          const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
          this.logger.error(`地图内存回滚失败 ${mapId}: ${rollbackMessage}`);
        }
      }

      return message;
    }
  }

  persistDynamicTileStates() {
    return this.persistTileRuntimeStates();
  }

  persistAuraStates() {
    return this.persistTileRuntimeStates();
  }

  async persistTileRuntimeStates() {
    if (!this.dynamicTileStatesDirty && !this.auraStatesDirty && !this.mapTimeStatesDirty) {
      return;
    }

    try {
      const snapshot: PersistedTileRuntimeSnapshot = {
        version: 2,
        maps: {},
      };

      const allMapIds = [...new Set([
        ...this.dynamicTileStates.keys(),
        ...this.auraStates.keys(),
      ])].sort((left, right) => left.localeCompare(right, 'zh-CN'));

      for (const mapId of allMapIds) {
        const dynamicStateMap = this.dynamicTileStates.get(mapId);
        const auraStateMap = this.auraStates.get(mapId);
        const allTileKeys = [...new Set([
          ...(dynamicStateMap ? [...dynamicStateMap.keys()] : []),
          ...(auraStateMap ? [...auraStateMap.keys()] : []),
        ])].sort((left, right) => {
          const [leftX, leftY] = left.split(',').map((value) => Number.parseInt(value, 10));
          const [rightX, rightY] = right.split(',').map((value) => Number.parseInt(value, 10));
          return leftY - rightY || leftX - rightX;
        });

        const records: PersistedTileRuntimeRecord[] = [];
        for (const key of allTileKeys) {
          const terrain = dynamicStateMap?.get(key);
          const aura = auraStateMap?.get(key);
          if (!terrain && !aura) {
            continue;
          }

          const [x, y] = key.split(',').map((value) => Number.parseInt(value, 10));
          const record: PersistedTileRuntimeRecord = { x, y };
          if (terrain) {
            record.terrain = {
              hp: terrain.hp,
              destroyed: terrain.destroyed,
              restoreTicksLeft: terrain.destroyed ? this.normalizeRestoreTicksLeft(terrain.restoreTicksLeft) : undefined,
            };
          }
          if (aura) {
            record.resources = {
              aura: {
                value: aura.value,
                sourceValue: aura.sourceValue,
                decayRemainder: aura.decayRemainder,
                sourceRemainder: aura.sourceRemainder,
              },
            };
          }
          records.push(record);
        }

        if (records.length > 0) {
          snapshot.maps[mapId] = records;
        }
      }

      const allTimeMapIds = [...new Set([
        ...this.persistedMapTimeStates.keys(),
        ...this.mapTimeStates.keys(),
      ])]
        .filter((mapId) => this.maps.has(mapId))
        .sort((left, right) => left.localeCompare(right, 'zh-CN'));

      for (const mapId of allTimeMapIds) {
        const state = this.mapTimeStates.get(mapId) ?? this.persistedMapTimeStates.get(mapId);
        if (!state) {
          continue;
        }

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
          continue;
        }
        snapshot.time ??= {};
        snapshot.time[mapId] = record;
      }

      await this.persistentDocumentService.save(RUNTIME_STATE_SCOPE, MAP_TILE_RUNTIME_DOCUMENT_KEY, snapshot);
      this.dynamicTileStatesDirty = false;
      this.auraStatesDirty = false;
      this.mapTimeStatesDirty = false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`地块运行时持久化到 PostgreSQL 失败: ${message}`);
    }
  }

  tickDynamicTiles(mapId: string) {
    const stateMap = this.dynamicTileStates.get(mapId);
    const auraStateMap = this.auraStates.get(mapId);
    if ((!stateMap || stateMap.size === 0) && (!auraStateMap || auraStateMap.size === 0)) {
      return;
    }

    let changed = false;
    let auraStateChanged = false;
    let visibilityChanged = false;
    if (stateMap) {
      for (const [key, state] of [...stateMap.entries()]) {
        if (state.hp < state.maxHp) {
          const regen = this.calculateTileRegen(state.maxHp);
          const nextHp = Math.min(state.maxHp, state.hp + regen);
          if (nextHp !== state.hp) {
            state.hp = nextHp;
            changed = true;
            this.markTileDirty(mapId, state.x, state.y);
          }
        }

        if (state.destroyed) {
          const nextRestoreTicksLeft = Math.max(0, (state.restoreTicksLeft ?? 0) - 1);
          if (nextRestoreTicksLeft !== (state.restoreTicksLeft ?? 0)) {
            state.restoreTicksLeft = nextRestoreTicksLeft;
            changed = true;
            this.markTileDirty(mapId, state.x, state.y);
          }

          if ((state.restoreTicksLeft ?? 0) <= 0) {
            if (this.hasBlockingEntityAt(mapId, state.x, state.y)) {
              state.restoreTicksLeft = TERRAIN_RESTORE_RETRY_DELAY_TICKS;
              changed = true;
              this.markTileDirty(mapId, state.x, state.y);
            } else {
              state.destroyed = false;
              state.restoreTicksLeft = undefined;
              changed = true;
              visibilityChanged = true;
              this.markTileDirty(mapId, state.x, state.y);
            }
          }
        }

        const tile = this.getTile(mapId, state.x, state.y);
        if (!tile) {
          stateMap.delete(key);
          changed = true;
          continue;
        }

        if (!state.destroyed && state.hp >= state.maxHp) {
          stateMap.delete(key);
          this.resetTileToBaseState(mapId, state.x, state.y);
          changed = true;
          this.markTileDirty(mapId, state.x, state.y);
          continue;
        }

        this.applyDynamicTileStateToTile(tile, state);
      }
    }

    if (auraStateMap) {
      for (const [key, state] of [...auraStateMap.entries()]) {
        const tile = this.getTile(mapId, state.x, state.y);
        if (!tile) {
          auraStateMap.delete(key);
          changed = true;
          continue;
        }

        const previousValue = state.value;
        const previousLevel = getAuraLevel(previousValue, this.auraLevelBaseValue);
        const previousDecayRemainder = state.decayRemainder ?? 0;
        const previousSourceRemainder = state.sourceRemainder ?? 0;
        state.decayRemainder = Math.max(0, Math.round(state.decayRemainder ?? 0))
          + previousValue * TILE_AURA_HALF_LIFE_RATE_SCALED;
        const decayAmount = Math.floor(state.decayRemainder / TILE_AURA_HALF_LIFE_RATE_SCALE);
        state.decayRemainder %= TILE_AURA_HALF_LIFE_RATE_SCALE;

        state.sourceRemainder = Math.max(0, Math.round(state.sourceRemainder ?? 0))
          + Math.max(0, Math.round(state.sourceValue ?? 0)) * TILE_AURA_HALF_LIFE_RATE_SCALED;
        const sourceAmount = Math.floor(state.sourceRemainder / TILE_AURA_HALF_LIFE_RATE_SCALE);
        state.sourceRemainder %= TILE_AURA_HALF_LIFE_RATE_SCALE;
        if (state.decayRemainder !== previousDecayRemainder || state.sourceRemainder !== previousSourceRemainder) {
          auraStateChanged = true;
        }

        const nextValue = Math.max(0, previousValue - decayAmount + sourceAmount);
        if (nextValue !== previousValue) {
          state.value = nextValue;
          tile.aura = nextValue;
          changed = true;
          auraStateChanged = true;
          if (getAuraLevel(nextValue, this.auraLevelBaseValue) !== previousLevel) {
            this.markTileDirty(mapId, state.x, state.y);
          }
        }

        if (!this.shouldKeepAuraRuntimeState(state)) {
          auraStateMap.delete(key);
          auraStateChanged = true;
          if (tile.aura !== 0) {
            tile.aura = 0;
            this.markTileDirty(mapId, state.x, state.y);
          }
        }
      }
    }

    if (stateMap?.size === 0) {
      this.dynamicTileStates.delete(mapId);
    }
    if (auraStateMap?.size === 0) {
      this.auraStates.delete(mapId);
    }
    if (visibilityChanged) {
      this.bumpMapRevision(mapId);
    }
    if (stateMap && changed) {
      this.dynamicTileStatesDirty = true;
    }
    if (auraStateMap && auraStateChanged) {
      this.auraStatesDirty = true;
    }
  }

  private rehydrateDynamicTileStates(mapId: string, document: GmMapDocument, tiles: Tile[][], previousDocument?: GmMapDocument) {
    const persistedSourceStates = this.persistedDynamicTileStates.get(mapId);
    const sourceStates = this.dynamicTileStates.get(mapId) ?? persistedSourceStates;
    if (!sourceStates || sourceStates.size === 0) {
      this.dynamicTileStates.delete(mapId);
      if (persistedSourceStates) {
        this.persistedDynamicTileStates.delete(mapId);
      }
      return;
    }

    const sourceCount = sourceStates.size;
    const nextStates = new Map<string, DynamicTileState>();
    for (const rawState of sourceStates.values()) {
      if (this.hasStaticTerrainConflict(previousDocument, document, rawState.x, rawState.y)) {
        continue;
      }
      const originalType = getTileTypeFromMapChar(document.tiles[rawState.y]?.[rawState.x] ?? '#');
      const maxHp = this.tileDurabilityFromDocument(document, originalType);
      const tile = tiles[rawState.y]?.[rawState.x];
      if (!tile || maxHp <= 0) {
        continue;
      }

      const hp = Math.max(0, Math.min(maxHp, Math.round(rawState.hp)));
      const destroyed = rawState.destroyed === true;
      const normalized: DynamicTileState = {
        x: rawState.x,
        y: rawState.y,
        originalType,
        hp,
        maxHp,
        destroyed,
        restoreTicksLeft: destroyed
          ? this.normalizeRestoreTicksLeft(rawState.restoreTicksLeft)
          : undefined,
      };

      if (!destroyed && normalized.hp >= normalized.maxHp) {
        continue;
      }

      this.applyDynamicTileStateToTile(tile, normalized);
      nextStates.set(this.tileStateKey(normalized.x, normalized.y), normalized);
    }

    if (nextStates.size === 0) {
      this.dynamicTileStates.delete(mapId);
      if (sourceCount > 0) {
        this.dynamicTileStatesDirty = true;
      }
      if (persistedSourceStates) {
        this.persistedDynamicTileStates.delete(mapId);
      }
      return;
    }
    this.dynamicTileStates.set(mapId, nextStates);
    if (nextStates.size !== sourceCount) {
      this.dynamicTileStatesDirty = true;
    }
    if (persistedSourceStates) {
      this.persistedDynamicTileStates.delete(mapId);
    }
  }

  private rehydrateAuraStates(mapId: string, tiles: Tile[][], baseAuraValues: Map<string, number>) {
    const persistedSourceStates = this.persistedAuraStates.get(mapId);
    const sourceStates = this.auraStates.get(mapId) ?? persistedSourceStates;
    const sourceCount = sourceStates?.size ?? 0;
    const nextStates = new Map<string, AuraRuntimeState>();

    for (const [key, sourceValue] of baseAuraValues.entries()) {
      const persisted = sourceStates?.get(key);
      const [x, y] = key.split(',').map((value) => Number.parseInt(value, 10));
      const tile = tiles[y]?.[x];
      if (!tile) {
        continue;
      }
      const state: AuraRuntimeState = {
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
        const tile = tiles[rawState.y]?.[rawState.x];
        if (!tile) {
          continue;
        }
        const state: AuraRuntimeState = {
          x: rawState.x,
          y: rawState.y,
          value: Math.max(0, Math.round(rawState.value)),
          sourceValue: 0,
          decayRemainder: Math.max(0, Math.round(rawState.decayRemainder ?? 0)),
          sourceRemainder: Math.max(0, Math.round(rawState.sourceRemainder ?? 0)),
        };
        tile.aura = state.value;
        if (this.shouldKeepAuraRuntimeState(state)) {
          nextStates.set(key, state);
        }
      }
    }

    if (nextStates.size === 0) {
      this.auraStates.delete(mapId);
      if (sourceCount > 0) {
        this.auraStatesDirty = true;
      }
      if (persistedSourceStates) {
        this.persistedAuraStates.delete(mapId);
      }
      return;
    }
    this.auraStates.set(mapId, nextStates);
    if (nextStates.size !== sourceCount) {
      this.auraStatesDirty = true;
    }
    if (persistedSourceStates) {
      this.persistedAuraStates.delete(mapId);
    }
  }

  private applyDynamicTileStateToTile(tile: Tile, state: DynamicTileState) {
    const type = state.destroyed ? this.destroyedTileType(state.originalType) : state.originalType;
    tile.type = type;
    tile.walkable = isTileTypeWalkable(type);
    tile.blocksSight = doesTileTypeBlockSight(type);
    tile.hp = state.destroyed ? undefined : state.hp;
    tile.maxHp = state.destroyed ? undefined : state.maxHp;
    tile.hpVisible = !state.destroyed && state.hp < state.maxHp;
    tile.modifiedAt = state.destroyed || state.hp < state.maxHp ? Date.now() : null;
  }

  private resetTileToBaseState(mapId: string, x: number, y: number) {
    const tile = this.getTile(mapId, x, y);
    const originalType = this.getBaseTileType(mapId, x, y);
    if (!tile || originalType === null) {
      return;
    }

    const maxHp = this.tileDurability(mapId, originalType);
    tile.type = originalType;
    tile.walkable = isTileTypeWalkable(originalType);
    tile.blocksSight = doesTileTypeBlockSight(originalType);
    tile.hp = maxHp > 0 ? maxHp : undefined;
    tile.maxHp = maxHp > 0 ? maxHp : undefined;
    tile.hpVisible = false;
    tile.modifiedAt = null;
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

    const previousType = this.getTileTypeFromDocument(previousDocument, x, y);
    const nextType = this.getTileTypeFromDocument(nextDocument, x, y);
    if (previousType !== nextType) {
      return true;
    }
    if (previousType === null || nextType === null) {
      return previousType !== nextType;
    }
    return this.tileDurabilityFromDocument(previousDocument, previousType) !== this.tileDurabilityFromDocument(nextDocument, nextType);
  }

  private getBaseTileType(mapId: string, x: number, y: number): TileType | null {
    const row = this.maps.get(mapId)?.source.tiles[y];
    if (!row) {
      return null;
    }
    return getTileTypeFromMapChar(row[x] ?? '#');
  }

  private getTileTypeFromDocument(document: GmMapDocument, x: number, y: number): TileType | null {
    const row = document.tiles[y];
    if (typeof row !== 'string' || x < 0 || x >= row.length) {
      return null;
    }
    return getTileTypeFromMapChar(row[x] ?? '#');
  }

  private tileDurabilityFromDocument(document: GmMapDocument, type: TileType): number {
    const profileId = document.terrainProfileId
      ?? LEGACY_MAP_TERRAIN_PROFILE_IDS[document.id]
      ?? document.id;
    const profile = this.resolveTerrainDurabilityProfile(profileId, type);
    if (!profile) {
      return 0;
    }
    const baseDurability = calculateTerrainDurability(profile.grade, profile.material);
    const multiplier = SPECIAL_TILE_DURABILITY_MULTIPLIERS[type] ?? 1;
    return Math.max(1, Math.round(baseDurability * multiplier));
  }

  private hasBlockingEntityAt(mapId: string, x: number, y: number): boolean {
    const occupants = this.getOccupantsAt(mapId, x, y);
    return (occupants?.size ?? 0) > 0 || this.hasNpcAt(mapId, x, y);
  }

  private rebuildPlayerOverlapPointIndex(): void {
    const next = new Map<string, Set<string>>();
    for (const [mapId, map] of this.maps.entries()) {
      this.addOverlapArea(next, mapId, map.spawnPoint.x, map.spawnPoint.y, true);
      for (const portal of map.portals) {
        this.addOverlapArea(next, mapId, portal.x, portal.y, true);
        this.addOverlapArea(next, portal.targetMapId, portal.targetX, portal.targetY, true);
      }
      for (const npc of map.npcs) {
        this.addOverlapArea(next, mapId, npc.x, npc.y, false);
      }
    }
    this.playerOverlapPointsByMap = next;
  }

  private addOverlapArea(
    index: Map<string, Set<string>>,
    mapId: string,
    centerX: number,
    centerY: number,
    includeCenter: boolean,
  ): void {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!includeCenter && dx === 0 && dy === 0) {
          continue;
        }
        const x = centerX + dx;
        const y = centerY + dy;
        if (!this.getTile(mapId, x, y)?.walkable) {
          continue;
        }
        this.addOverlapPoint(index, mapId, x, y);
      }
    }
  }

  private addOverlapPoint(index: Map<string, Set<string>>, mapId: string, x: number, y: number): void {
    const key = this.tileStateKey(x, y);
    const points = index.get(mapId) ?? new Set<string>();
    points.add(key);
    index.set(mapId, points);
  }

  private supportsPlayerOverlap(mapId: string, x: number, y: number): boolean {
    return this.playerOverlapPointsByMap.get(mapId)?.has(this.tileStateKey(x, y)) === true;
  }

  private getOccupantsAt(mapId: string, x: number, y: number): Map<string, OccupantKind> | undefined {
    return this.occupantsByMap.get(mapId)?.get(this.tileStateKey(x, y));
  }

  hasOccupant(mapId: string, x: number, y: number, occupancyId: string): boolean {
    return this.getOccupantsAt(mapId, x, y)?.has(occupancyId) === true;
  }

  private syncOccupancyDisplay(mapId: string, x?: number, y?: number): void {
    const map = this.maps.get(mapId);
    if (!map) return;

    if (x !== undefined && y !== undefined) {
      const tile = map.tiles[y]?.[x];
      if (!tile) return;
      const occupants = this.getOccupantsAt(mapId, x, y);
      tile.occupiedBy = occupants ? [...occupants.keys()][0] ?? null : null;
      return;
    }

    for (let rowIndex = 0; rowIndex < map.tiles.length; rowIndex += 1) {
      const row = map.tiles[rowIndex];
      if (!row) continue;
      for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
        const tile = row[colIndex];
        if (!tile) continue;
        const occupants = this.getOccupantsAt(mapId, colIndex, rowIndex);
        tile.occupiedBy = occupants ? [...occupants.keys()][0] ?? null : null;
      }
    }
  }

  private calculateTileRegen(maxHp: number): number {
    return Math.max(1, Math.floor(maxHp * TERRAIN_REGEN_RATE_PER_TICK));
  }

  private normalizeRestoreTicksLeft(value: unknown): number {
    return Number.isInteger(value) && Number(value) > 0
      ? Number(value)
      : TERRAIN_DESTROYED_RESTORE_TICKS;
  }

  private getStoredMapTimeState(mapId: string): PersistedMapTimeState | undefined {
    return this.mapTimeStates.get(mapId) ?? this.persistedMapTimeStates.get(mapId);
  }

  private normalizePersistedMapTimeState(raw: unknown): PersistedMapTimeState | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const candidate = raw as Partial<PersistedMapTimeState>;
    const totalTicks = Number.isFinite(candidate.totalTicks)
      ? Math.max(0, Math.floor(Number(candidate.totalTicks)))
      : undefined;
    const config = candidate.config && typeof candidate.config === 'object'
      ? this.normalizeMapTimeConfig(candidate.config)
      : undefined;
    const tickSpeed = typeof candidate.tickSpeed === 'number' && Number.isFinite(candidate.tickSpeed)
      ? Math.max(0, Math.min(100, candidate.tickSpeed))
      : undefined;
    if (totalTicks === undefined && !config && tickSpeed === undefined) {
      return null;
    }

    return { totalTicks, config, tickSpeed };
  }

  private shouldKeepAuraRuntimeState(state: AuraRuntimeState): boolean {
    return (state.sourceValue ?? 0) > 0
      || state.value > 0
      || (state.decayRemainder ?? 0) > 0
      || (state.sourceRemainder ?? 0) > 0;
  }

  private tileStateKey(x: number, y: number): string {
    return `${x},${y}`;
  }

  private normalizeAuraPoints(rawAuras: unknown, meta: MapMeta): MapAuraPoint[] {
    if (!Array.isArray(rawAuras)) return [];

    const result: MapAuraPoint[] = [];
    for (const candidate of rawAuras) {
      const point = candidate as Partial<MapAuraPoint>;
      const valid =
        Number.isInteger(point.x) &&
        Number.isInteger(point.y) &&
        Number.isInteger(point.value);
      if (!valid) {
        this.logger.warn(`地图 ${meta.id} 存在非法灵气配置，已忽略`);
        continue;
      }
      if (
        point.x! < 0 || point.x! >= meta.width ||
        point.y! < 0 || point.y! >= meta.height
      ) {
        this.logger.warn(`地图 ${meta.id} 的灵气坐标越界: (${point.x}, ${point.y})`);
        continue;
      }
      result.push({
        x: point.x!,
        y: point.y!,
        value: normalizeConfiguredAuraValue(point.value!, this.auraLevelBaseValue),
      });
    }
    return result;
  }

  private normalizePortals(rawPortals: unknown, meta: MapMeta): Portal[] {
    if (!Array.isArray(rawPortals)) return [];

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
        allowPlayerOverlap: portal.allowPlayerOverlap === true,
        hidden: portal.hidden === true,
        observeTitle: typeof portal.observeTitle === 'string' ? portal.observeTitle.trim() || undefined : undefined,
        observeDesc: typeof portal.observeDesc === 'string' ? portal.observeDesc.trim() || undefined : undefined,
      });
    }
    return result;
  }

  private normalizePortalKind(kind: unknown): PortalKind {
    return kind === 'stairs' ? 'stairs' : 'portal';
  }

  private normalizePortalTrigger(trigger: unknown, kind?: unknown): PortalTrigger {
    if (trigger === 'manual' || trigger === 'auto') {
      return trigger;
    }
    return kind === 'stairs' ? 'auto' : 'manual';
  }

  private normalizeMapSpaceVisionMode(mode: unknown, parentMapId?: unknown): MapSpaceVisionMode {
    if (mode === 'parent_overlay' && typeof parentMapId === 'string' && parentMapId.trim()) {
      return 'parent_overlay';
    }
    return 'isolated';
  }

  private normalizeNpcs(rawNpcs: unknown, meta: MapMeta): NpcConfig[] {
    if (!Array.isArray(rawNpcs)) return [];

    const result: NpcConfig[] = [];
    for (const candidate of rawNpcs) {
      const npc = candidate as Partial<NpcConfig> & { quest?: unknown; role?: unknown };
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

      const rawQuestList = Array.isArray((candidate as { quests?: unknown[] }).quests)
        ? (candidate as { quests: unknown[] }).quests
        : (typeof (candidate as { quest?: unknown }).quest !== 'undefined'
            ? [(candidate as { quest: unknown }).quest]
            : []);

      const quests: QuestConfig[] = [];
      for (const rawCandidate of rawQuestList) {
        const rawQuest = rawCandidate as {
          id?: string;
          title?: string;
          desc?: string;
          line?: QuestLine;
          chapter?: string;
          story?: string;
          objectiveType?: QuestObjectiveType;
          objectiveText?: string;
          targetName?: string;
          targetMapId?: string;
          targetX?: number;
          targetY?: number;
          targetNpcId?: string;
          targetNpcName?: string;
          targetMonsterId?: string;
          targetTechniqueId?: string;
          targetRealmStage?: keyof typeof PlayerRealmStage | PlayerRealmStage;
          required?: number;
          targetCount?: number;
          rewardItemId?: string;
          rewardText?: string;
          reward?: Array<{ itemId?: string; name?: string; type?: ItemType; count?: number }>;
          nextQuestId?: string;
          requiredItemId?: string;
          requiredItemCount?: number;
          submitNpcId?: string;
          submitNpcName?: string;
          submitMapId?: string;
          submitX?: number;
          submitY?: number;
          relayMessage?: string;
          unlockBreakthroughRequirementIds?: string[];
        };
        const objectiveType = rawQuest.objectiveType ?? 'kill';
        const required = Number.isInteger(rawQuest.required) ? rawQuest.required : rawQuest.targetCount;
        const rewardItemIds = Array.isArray(rawQuest.reward)
          ? rawQuest.reward
              .map((entry) => entry?.itemId)
              .filter((itemId): itemId is string => typeof itemId === 'string')
          : (typeof rawQuest.rewardItemId === 'string' ? [rawQuest.rewardItemId] : []);
        const rewardText = typeof rawQuest.rewardText === 'string'
          ? rawQuest.rewardText
          : Array.isArray(rawQuest.reward) && rawQuest.reward.length > 0
            ? rawQuest.reward
                .map((entry) => `${entry.name ?? entry.itemId ?? '未知奖励'} x${entry.count ?? 1}`)
                .join('、')
            : '无';
        const rewards: DropConfig[] = Array.isArray(rawQuest.reward)
          ? rawQuest.reward
              .filter((entry): entry is { itemId: string; name: string; type: ItemType; count?: number } =>
                typeof entry?.itemId === 'string' &&
                typeof entry?.name === 'string' &&
                typeof entry?.type === 'string',
              )
              .map((entry) => ({
                itemId: entry.itemId,
                name: entry.name,
                type: entry.type,
                count: Number.isInteger(entry.count) ? Number(entry.count) : 1,
                chance: 1,
              }))
          : [];
        const parsedRealmStage = typeof rawQuest.targetRealmStage === 'number'
          ? rawQuest.targetRealmStage
          : typeof rawQuest.targetRealmStage === 'string'
            ? PlayerRealmStage[rawQuest.targetRealmStage]
            : undefined;
        const validByObjective = (
          objectiveType === 'kill' && typeof rawQuest.targetMonsterId === 'string' && Number.isInteger(required)
        ) || (
          objectiveType === 'talk' && typeof rawQuest.targetNpcId === 'string'
        ) || (
          objectiveType === 'submit_item' && typeof rawQuest.requiredItemId === 'string'
        ) || (
          objectiveType === 'learn_technique' && typeof rawQuest.targetTechniqueId === 'string'
        ) || (
          objectiveType === 'realm_progress' && Number.isInteger(required) && parsedRealmStage !== undefined
        ) || (
          objectiveType === 'realm_stage' && parsedRealmStage !== undefined
        );
        const validQuest =
          typeof rawQuest.id === 'string' &&
          typeof rawQuest.title === 'string' &&
          typeof rawQuest.desc === 'string' &&
          validByObjective &&
          (rewardItemIds.length > 0 || rewards.length > 0 || typeof rawQuest.rewardText === 'string');
        if (!validQuest) {
          this.logger.warn(`地图 ${meta.id} 的 NPC 任务配置非法: ${npc.id}`);
          continue;
        }
        const normalizedRequired = objectiveType === 'submit_item'
          ? (Number.isInteger(rawQuest.requiredItemCount) ? rawQuest.requiredItemCount! : (Number.isInteger(required) ? required! : 1))
          : (Number.isInteger(required) ? required! : 1);
        const targetName = typeof rawQuest.targetName === 'string'
          ? rawQuest.targetName
          : objectiveType === 'kill'
            ? rawQuest.targetMonsterId!
            : objectiveType === 'talk'
              ? rawQuest.targetNpcName ?? rawQuest.targetNpcId ?? rawQuest.title!
              : objectiveType === 'submit_item'
                ? rawQuest.requiredItemId ?? rawQuest.title!
            : objectiveType === 'learn_technique'
              ? rawQuest.targetTechniqueId!
              : parsedRealmStage !== undefined
                ? resolveRealmStageTargetLabel(parsedRealmStage) ?? PlayerRealmStage[parsedRealmStage]
                : rawQuest.title!;
        const targetMapId = typeof rawQuest.targetMapId === 'string' && rawQuest.targetMapId.trim().length > 0
          ? rawQuest.targetMapId.trim()
          : undefined;
        const submitMapId = typeof rawQuest.submitMapId === 'string' && rawQuest.submitMapId.trim().length > 0
          ? rawQuest.submitMapId.trim()
          : undefined;
        quests.push({
          id: rawQuest.id!,
          title: rawQuest.title!,
          desc: rawQuest.desc!,
          line: rawQuest.line === 'main' || rawQuest.line === 'daily' || rawQuest.line === 'encounter'
            ? rawQuest.line
            : 'side',
          chapter: typeof rawQuest.chapter === 'string' ? rawQuest.chapter : undefined,
          story: typeof rawQuest.story === 'string' ? rawQuest.story : undefined,
          objectiveType,
          objectiveText: typeof rawQuest.objectiveText === 'string' ? rawQuest.objectiveText : undefined,
          targetName,
          targetMapId,
          targetMapName: targetMapId ? this.getMapMeta(targetMapId)?.name : undefined,
          targetX: Number.isInteger(rawQuest.targetX) ? rawQuest.targetX : undefined,
          targetY: Number.isInteger(rawQuest.targetY) ? rawQuest.targetY : undefined,
          targetNpcId: typeof rawQuest.targetNpcId === 'string' ? rawQuest.targetNpcId : undefined,
          targetNpcName: typeof rawQuest.targetNpcName === 'string' ? rawQuest.targetNpcName : undefined,
          targetMonsterId: typeof rawQuest.targetMonsterId === 'string' ? rawQuest.targetMonsterId : undefined,
          targetTechniqueId: typeof rawQuest.targetTechniqueId === 'string' ? rawQuest.targetTechniqueId : undefined,
          targetRealmStage: parsedRealmStage,
          required: normalizedRequired,
          rewards,
          rewardItemIds,
          rewardItemId: rewardItemIds[0] ?? '',
          rewardText,
          nextQuestId: typeof rawQuest.nextQuestId === 'string' ? rawQuest.nextQuestId : undefined,
          requiredItemId: typeof rawQuest.requiredItemId === 'string' ? rawQuest.requiredItemId : undefined,
          requiredItemCount: Number.isInteger(rawQuest.requiredItemCount) ? rawQuest.requiredItemCount : undefined,
          submitNpcId: typeof rawQuest.submitNpcId === 'string' ? rawQuest.submitNpcId : undefined,
          submitNpcName: typeof rawQuest.submitNpcName === 'string' ? rawQuest.submitNpcName : undefined,
          submitMapId,
          submitMapName: submitMapId ? this.getMapMeta(submitMapId)?.name : undefined,
          submitX: Number.isInteger(rawQuest.submitX) ? rawQuest.submitX : undefined,
          submitY: Number.isInteger(rawQuest.submitY) ? rawQuest.submitY : undefined,
          relayMessage: typeof rawQuest.relayMessage === 'string' ? rawQuest.relayMessage : undefined,
          unlockBreakthroughRequirementIds: Array.isArray(rawQuest.unlockBreakthroughRequirementIds)
            ? rawQuest.unlockBreakthroughRequirementIds.filter((entry): entry is string => typeof entry === 'string')
            : undefined,
          giverId: npc.id!,
          giverName: npc.name!,
          giverMapId: meta.id,
          giverMapName: meta.name,
          giverX: npc.x!,
          giverY: npc.y!,
        });
      }

      result.push({
        id: npc.id!,
        name: npc.name!,
        x: npc.x!,
        y: npc.y!,
        char: npc.char!,
        color: npc.color!,
        dialogue: npc.dialogue!,
        role: typeof (candidate as { role?: unknown }).role === 'string' ? String((candidate as { role?: unknown }).role) : undefined,
        quests,
      });
    }

    return result;
  }

  private normalizeMonsterSpawns(rawSpawns: unknown, meta: MapMeta): MonsterSpawnConfig[] {
    if (!Array.isArray(rawSpawns)) return [];

    const result: MonsterSpawnConfig[] = [];
    for (const candidate of rawSpawns) {
      const rawSpawn = candidate as Partial<GmMapMonsterSpawnRecord> & Partial<MonsterSpawnConfig> & {
        templateId?: string;
        count?: number;
        respawnSec?: number;
        level?: number;
        expMultiplier?: number;
        lootItemId?: string;
        lootChance?: number;
        drops?: unknown[];
      };
      const templateId = this.resolveMonsterSpawnTemplateId(rawSpawn);
      const template = templateId ? this.contentService.getMonsterTemplate(templateId) : undefined;
      const spawn = template ? { ...template, ...rawSpawn } : rawSpawn;
      const level = Number.isInteger((spawn as { level?: number }).level) ? (spawn as { level: number }).level : undefined;
      const valueStats = (spawn as { valueStats?: PartialNumericStats }).valueStats
        ?? inferMonsterValueStatsFromLegacy({
          maxHp: Number.isInteger(spawn.maxHp) ? Number(spawn.maxHp) : (Number.isInteger(spawn.hp) ? Number(spawn.hp) : 1),
          attack: Number.isInteger(spawn.attack) ? Number(spawn.attack) : 1,
          level,
          viewRange: Number.isInteger((spawn as { viewRange?: number }).viewRange)
            ? (spawn as { viewRange: number }).viewRange
            : (Number.isInteger(spawn.aggroRange) ? spawn.aggroRange : 6),
        });
      const numericStats = (spawn as { numericStats?: NumericStats }).numericStats
        ?? resolveMonsterNumericStatsFromValueStats(valueStats, level);
      const combatModel = (spawn as { combatModel?: MonsterCombatModel }).combatModel ?? 'legacy';
      const spawnId = typeof rawSpawn.id === 'string' && rawSpawn.id.trim().length > 0
        ? rawSpawn.id.trim()
        : templateId;
      const valid =
        typeof spawnId === 'string' &&
        typeof spawn.name === 'string' &&
        Number.isInteger(spawn.x) &&
        Number.isInteger(spawn.y) &&
        typeof spawn.char === 'string' &&
        typeof spawn.color === 'string' &&
        Number.isInteger(spawn.hp) &&
        Number.isInteger(spawn.attack) &&
        (
          Number.isInteger(spawn.respawnTicks) ||
          Number.isInteger((spawn as { respawnSec?: number }).respawnSec)
        );
      if (!valid) {
        this.logger.warn(`地图 ${meta.id} 存在非法怪物刷新点配置，已忽略`);
        continue;
      }
      if (spawn.x! < 0 || spawn.x! >= meta.width || spawn.y! < 0 || spawn.y! >= meta.height) {
        this.logger.warn(`地图 ${meta.id} 的怪物刷新点越界: ${spawn.id}`);
        continue;
      }
      const rawDrops = Array.isArray((candidate as { drops?: unknown[] }).drops)
        ? (candidate as { drops: unknown[] }).drops
        : (typeof (candidate as { lootItemId?: unknown }).lootItemId === 'string'
            ? [{
                itemId: String((candidate as { lootItemId: unknown }).lootItemId),
                name: String((candidate as { lootItemId: unknown }).lootItemId),
                type: 'material',
                count: 1,
                chance: typeof (candidate as { lootChance?: unknown }).lootChance === 'number'
                  ? Number((candidate as { lootChance: unknown }).lootChance)
                  : 1,
              }]
            : []);
      const drops = this.normalizeDrops(rawDrops);
      result.push({
        id: spawnId!,
        name: spawn.name!,
        x: spawn.x!,
        y: spawn.y!,
        char: spawn.char!,
        color: spawn.color!,
        grade: this.normalizeContainerGrade((spawn as { grade?: TechniqueGrade }).grade),
        valueStats,
        numericStats,
        combatModel,
        hp: Math.max(1, Math.round(numericStats.maxHp || spawn.hp!)),
        maxHp: Math.max(1, Math.round(numericStats.maxHp || (Number.isInteger(spawn.maxHp) ? spawn.maxHp! : spawn.hp!))),
        attack: Math.max(1, Math.round(numericStats.physAtk || numericStats.spellAtk || spawn.attack! || 1)),
        count: Number.isInteger((spawn as { count?: number }).count)
          ? (spawn as { count: number }).count
          : (Number.isInteger((spawn as { maxAlive?: number }).maxAlive) ? (spawn as { maxAlive: number }).maxAlive : 1),
        radius: Number.isInteger((spawn as { radius?: number }).radius) ? (spawn as { radius: number }).radius : 3,
        maxAlive: Number.isInteger((spawn as { maxAlive?: number }).maxAlive)
          ? (spawn as { maxAlive: number }).maxAlive
          : (Number.isInteger((spawn as { count?: number }).count) ? (spawn as { count: number }).count : 1),
        aggroRange: Number.isInteger(spawn.aggroRange) ? spawn.aggroRange! : 6,
        viewRange: Number.isInteger((spawn as { viewRange?: number }).viewRange)
          ? (spawn as { viewRange: number }).viewRange
          : (Number.isInteger(spawn.aggroRange) ? spawn.aggroRange! : 6),
        aggroMode: spawn.aggroMode ?? 'always',
        respawnTicks: Number.isInteger(spawn.respawnTicks)
          ? spawn.respawnTicks!
          : Math.max(1, (spawn as { respawnSec?: number }).respawnSec ?? 15),
        level,
        expMultiplier: typeof (spawn as { expMultiplier?: number }).expMultiplier === 'number'
          ? Math.max(0, (spawn as { expMultiplier: number }).expMultiplier)
          : 1,
        drops,
      });
    }
    return result;
  }

  private resolveMonsterSpawnTemplateId(spawn: { id?: unknown; templateId?: unknown }): string | undefined {
    if (typeof spawn.templateId === 'string' && spawn.templateId.trim().length > 0) {
      return spawn.templateId.trim();
    }
    if (typeof spawn.id === 'string' && spawn.id.trim().length > 0) {
      return spawn.id.trim();
    }
    return undefined;
  }

  private normalizeContainers(rawLandmarks: unknown, meta: MapMeta): ContainerConfig[] {
    if (!Array.isArray(rawLandmarks)) {
      return [];
    }

    const result: ContainerConfig[] = [];
    for (const candidate of rawLandmarks) {
      const landmark = candidate as GmMapLandmarkRecord;
      if (!landmark?.container || typeof landmark.id !== 'string' || typeof landmark.name !== 'string') {
        continue;
      }
      if (!Number.isInteger(landmark.x) || !Number.isInteger(landmark.y)) {
        continue;
      }
      if (landmark.x < 0 || landmark.x >= meta.width || landmark.y < 0 || landmark.y >= meta.height) {
        this.logger.warn(`地图 ${meta.id} 的容器越界: ${landmark.id}`);
        continue;
      }

      result.push({
        id: landmark.id,
        name: landmark.name,
        x: landmark.x,
        y: landmark.y,
        desc: typeof landmark.desc === 'string' ? landmark.desc : undefined,
        grade: this.normalizeContainerGrade(landmark.container.grade),
        refreshTicks: Number.isInteger(landmark.container.refreshTicks) && landmark.container.refreshTicks! > 0
          ? Number(landmark.container.refreshTicks)
          : undefined,
        drops: this.normalizeDrops(landmark.container.drops),
      });
    }

    return result;
  }

  private normalizeContainerGrade(grade: unknown): TechniqueGrade {
    if (
      grade === 'mortal' ||
      grade === 'yellow' ||
      grade === 'mystic' ||
      grade === 'earth' ||
      grade === 'heaven' ||
      grade === 'spirit' ||
      grade === 'saint' ||
      grade === 'emperor'
    ) {
      return grade;
    }
    return 'mortal';
  }

  private buildMinimapSnapshot(
    meta: MapMeta,
    document: GmMapDocument,
    portals: Portal[],
    containers: ContainerConfig[],
    npcs: NpcConfig[],
    monsterSpawns: MonsterSpawnConfig[],
  ): MapMinimapSnapshot {
    const markers: MapMinimapMarker[] = [];

    const pushMarker = (marker: MapMinimapMarker): void => {
      if (marker.x < 0 || marker.x >= meta.width || marker.y < 0 || marker.y >= meta.height) {
        return;
      }
      markers.push(marker);
    };

    for (const landmark of document.landmarks ?? []) {
      if (!Number.isInteger(landmark.x) || !Number.isInteger(landmark.y)) {
        continue;
      }
      if (landmark.container) {
        continue;
      }
      pushMarker({
        id: `landmark:${landmark.id}`,
        kind: 'landmark',
        x: landmark.x,
        y: landmark.y,
        label: landmark.name,
        detail: typeof landmark.desc === 'string' && landmark.desc.trim() ? landmark.desc.trim() : undefined,
      });
    }

    for (const container of containers) {
      pushMarker({
        id: `container:${container.id}`,
        kind: 'container',
        x: container.x,
        y: container.y,
        label: container.name,
        detail: container.desc?.trim() || '可搜索容器',
      });
    }

    for (const npc of npcs) {
      pushMarker({
        id: `npc:${npc.id}`,
        kind: 'npc',
        x: npc.x,
        y: npc.y,
        label: npc.name,
        detail: npc.role ? `NPC · ${npc.role}` : 'NPC',
      });
    }

    for (const spawn of monsterSpawns) {
      pushMarker({
        id: `monster_spawn:${spawn.id}`,
        kind: 'monster_spawn',
        x: spawn.x,
        y: spawn.y,
        label: spawn.name,
        detail: `刷新点 · 半径 ${spawn.radius}`,
      });
    }

    for (const portal of portals) {
      if (portal.hidden) {
        continue;
      }
      const targetMapName = this.getMapMeta(portal.targetMapId)?.name?.trim() || undefined;
      const label = portal.observeTitle
        ?? (targetMapName ? `通往 ${targetMapName}` : (portal.kind === 'stairs' ? '楼梯' : '传送阵'));
      const detail = portal.observeDesc
        ?? (targetMapName ? `通往 ${targetMapName}` : undefined)
        ?? `通往 ${portal.targetMapId}`;
      pushMarker({
        id: `${portal.kind}:${portal.x},${portal.y}:${portal.targetMapId}`,
        kind: portal.kind,
        x: portal.x,
        y: portal.y,
        label,
        detail,
      });
    }

    const terrainRows = document.tiles.map((row) => row.split(''));
    for (const portal of portals) {
      if (portal.hidden) {
        continue;
      }
      if (!terrainRows[portal.y]?.[portal.x]) {
        continue;
      }
      terrainRows[portal.y]![portal.x] = portal.kind === 'stairs' ? 'S' : 'P';
    }

    return {
      width: meta.width,
      height: meta.height,
      terrainRows: terrainRows.map((row) => row.join('')),
      markers,
    };
  }

  private normalizeDrops(rawDrops: unknown): DropConfig[] {
    if (!Array.isArray(rawDrops)) {
      return [];
    }

    const drops: DropConfig[] = [];
    for (const rawDrop of rawDrops) {
      const drop = rawDrop as Partial<DropConfig>;
      if (
        typeof drop.itemId !== 'string' ||
        typeof drop.name !== 'string' ||
        typeof drop.type !== 'string'
      ) {
        continue;
      }
      drops.push({
        itemId: drop.itemId,
        name: drop.name,
        type: drop.type as ItemType,
        count: Number.isInteger(drop.count) ? Number(drop.count) : 1,
        chance: typeof drop.chance === 'number' ? drop.chance : 1,
      });
    }
    return drops;
  }

  getMapMeta(mapId: string): MapMeta | undefined {
    return this.maps.get(mapId)?.meta;
  }

  getMinimapSnapshot(mapId: string): MapMinimapSnapshot | undefined {
    const snapshot = this.maps.get(mapId)?.minimap;
    return snapshot ? JSON.parse(JSON.stringify(snapshot)) as MapMinimapSnapshot : undefined;
  }

  getVisibleMinimapMarkers(mapId: string, visibleKeys: Set<string>): MapMinimapMarker[] {
    const snapshot = this.maps.get(mapId)?.minimap;
    if (!snapshot || visibleKeys.size === 0) {
      return [];
    }
    return snapshot.markers
      .filter((marker) => visibleKeys.has(`${marker.x},${marker.y}`))
      .map((marker) => JSON.parse(JSON.stringify(marker)) as MapMinimapMarker);
  }

  getMinimapArchiveEntries(mapIds: string[]): MapMinimapArchiveEntry[] {
    const uniqueIds = [...new Set(mapIds.filter((mapId) => typeof mapId === 'string' && mapId.length > 0))];
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

  getMinimapSignature(mapId: string): string {
    return this.maps.get(mapId)?.minimapSignature ?? '';
  }

  getMapTimeConfig(mapId: string): MapTimeConfig {
    const runtimeConfig = this.getStoredMapTimeState(mapId)?.config;
    if (runtimeConfig) {
      return JSON.parse(JSON.stringify(runtimeConfig)) as MapTimeConfig;
    }
    const source = this.maps.get(mapId)?.source.time;
    return source
      ? JSON.parse(JSON.stringify(source)) as MapTimeConfig
      : JSON.parse(JSON.stringify(DEFAULT_MAP_TIME_CONFIG)) as MapTimeConfig;
  }

  getMapTimeTicks(mapId: string): number | null {
    const totalTicks = this.getStoredMapTimeState(mapId)?.totalTicks;
    return typeof totalTicks === 'number' && Number.isFinite(totalTicks)
      ? Math.max(0, Math.floor(totalTicks))
      : null;
  }

  setMapTimeTicks(mapId: string, totalTicks: number): void {
    const normalizedTicks = Number.isFinite(totalTicks) ? Math.max(0, Math.floor(totalTicks)) : 0;
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
  }

  getPersistedMapTickSpeed(mapId: string): number | null {
    const tickSpeed = this.getStoredMapTimeState(mapId)?.tickSpeed;
    return typeof tickSpeed === 'number' && Number.isFinite(tickSpeed)
      ? Math.max(0, Math.min(100, tickSpeed))
      : null;
  }

  setPersistedMapTickSpeed(mapId: string, tickSpeed: number): void {
    const normalizedTickSpeed = Math.max(0, Math.min(100, tickSpeed));
    const current = this.getStoredMapTimeState(mapId);
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
  }

  /** GM 运行时修改地图时间配置（持久化到运行时状态，重启后保留） */
  updateMapTimeConfig(mapId: string, patch: { scale?: number; offsetTicks?: number }): string | null {
    const map = this.maps.get(mapId);
    if (!map) return '目标地图不存在';
    const nextConfig = this.getMapTimeConfig(mapId);
    let changed = false;
    if (typeof patch.scale === 'number' && patch.scale >= 0) {
      if (nextConfig.scale !== patch.scale) {
        nextConfig.scale = patch.scale;
        changed = true;
      }
    }
    if (typeof patch.offsetTicks === 'number' && Number.isFinite(patch.offsetTicks)) {
      const normalizedOffset = Math.round(patch.offsetTicks);
      if (nextConfig.offsetTicks !== normalizedOffset) {
        nextConfig.offsetTicks = normalizedOffset;
        changed = true;
      }
    }
    if (!changed) {
      return null;
    }

    const current = this.getStoredMapTimeState(mapId);
    this.mapTimeStates.set(mapId, {
      totalTicks: current?.totalTicks,
      config: this.normalizeMapTimeConfig(nextConfig),
      tickSpeed: current?.tickSpeed,
    });
    this.persistedMapTimeStates.delete(mapId);
    this.mapTimeStatesDirty = true;
    return null;
  }

  getMapRevision(mapId: string): number {
    return this.revisions.get(mapId) ?? 0;
  }

  getPathfindingStaticGrid(mapId: string): PathfindingStaticGrid | null {
    const map = this.maps.get(mapId);
    if (!map) {
      return null;
    }

    const revision = this.getMapRevision(mapId);
    const cached = this.pathfindingStaticGrids.get(mapId);
    if (cached && cached.mapRevision === revision) {
      return cached;
    }

    const total = map.meta.width * map.meta.height;
    const walkable = new Uint8Array(total);
    const traversalCost = new Uint16Array(total);
    for (let y = 0; y < map.meta.height; y += 1) {
      for (let x = 0; x < map.meta.width; x += 1) {
        const index = y * map.meta.width + x;
        const tile = map.tiles[y]?.[x];
        if (!tile || !tile.walkable) {
          walkable[index] = 0;
          traversalCost[index] = 0;
          continue;
        }
        walkable[index] = 1;
        traversalCost[index] = getTileTraversalCost(tile.type);
      }
    }

    const snapshot: PathfindingStaticGrid = {
      mapId,
      mapRevision: revision,
      width: map.meta.width,
      height: map.meta.height,
      walkable,
      traversalCost,
    };
    this.pathfindingStaticGrids.set(mapId, snapshot);
    return snapshot;
  }

  buildPathfindingBlockedGrid(
    mapId: string,
    actorType: PathfindingActorType,
    selfOccupancyId?: string | null,
  ): Uint8Array | null {
    const grid = this.getPathfindingStaticGrid(mapId);
    const map = this.maps.get(mapId);
    if (!grid || !map) {
      return null;
    }

    const blocked = new Uint8Array(grid.width * grid.height);
    for (const npc of map.npcs) {
      if (npc.x < 0 || npc.x >= grid.width || npc.y < 0 || npc.y >= grid.height) {
        continue;
      }
      blocked[npc.y * grid.width + npc.x] = 1;
    }

    const occupants = this.occupantsByMap.get(mapId);
    if (!occupants) {
      return blocked;
    }

    for (const [key, entries] of occupants.entries()) {
      const [rawX, rawY] = key.split(',');
      const x = Number(rawX);
      const y = Number(rawY);
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= grid.width || y < 0 || y >= grid.height) {
        continue;
      }
      const blockers = [...entries.entries()].filter(([id]) => id !== selfOccupancyId);
      if (blockers.length === 0) {
        continue;
      }
      if (actorType === 'player' && this.supportsPlayerOverlap(mapId, x, y)) {
        continue;
      }
      blocked[y * grid.width + x] = 1;
    }

    return blocked;
  }

  getVisibilityRevision(mapId: string): string {
    const meta = this.getMapMeta(mapId);
    const current = this.getMapRevision(mapId);
    if (meta?.spaceVisionMode === 'parent_overlay' && meta.parentMapId) {
      return `${current}:${this.getMapRevision(meta.parentMapId)}`;
    }
    return String(current);
  }

  getTilePatchRevision(mapId: string): number {
    return this.tilePatchRevisions.get(mapId) ?? 0;
  }

  getDirtyTileKeys(mapId: string): string[] {
    return [...(this.dirtyTileKeysByMap.get(mapId) ?? new Set<string>()).values()];
  }

  clearDirtyTileKeys(mapId: string): void {
    this.dirtyTileKeysByMap.delete(mapId);
  }

  private bumpMapRevision(mapId: string) {
    this.revisions.set(mapId, (this.revisions.get(mapId) ?? 0) + 1);
  }

  private markTileDirty(mapId: string, x: number, y: number): void {
    const key = this.tileStateKey(x, y);
    const dirtyKeys = this.dirtyTileKeysByMap.get(mapId) ?? new Set<string>();
    dirtyKeys.add(key);
    this.dirtyTileKeysByMap.set(mapId, dirtyKeys);
    this.tilePatchRevisions.set(mapId, (this.tilePatchRevisions.get(mapId) ?? 0) + 1);
  }

  getSpawnPoint(mapId: string): { x: number; y: number } | undefined {
    return this.maps.get(mapId)?.spawnPoint;
  }

  isPointInMapBounds(mapId: string, x: number, y: number): boolean {
    const map = this.maps.get(mapId);
    if (!map) return false;
    return x >= 0 && y >= 0 && x < map.meta.width && y < map.meta.height;
  }

  getOverlayParentMapId(mapId: string): string | undefined {
    const meta = this.getMapMeta(mapId);
    if (meta?.spaceVisionMode !== 'parent_overlay' || !meta.parentMapId) {
      return undefined;
    }
    return this.maps.has(meta.parentMapId) ? meta.parentMapId : undefined;
  }

  projectPointToMap(targetMapId: string, sourceMapId: string, x: number, y: number): ProjectedPoint | null {
    if (targetMapId === sourceMapId) {
      return { x, y };
    }

    const targetMeta = this.getMapMeta(targetMapId);
    const sourceMeta = this.getMapMeta(sourceMapId);
    if (!targetMeta || !sourceMeta) {
      return null;
    }

    if (
      targetMeta.parentMapId === sourceMapId &&
      targetMeta.spaceVisionMode === 'parent_overlay' &&
      Number.isInteger(targetMeta.parentOriginX) &&
      Number.isInteger(targetMeta.parentOriginY)
    ) {
      return {
        x: x - targetMeta.parentOriginX!,
        y: y - targetMeta.parentOriginY!,
      };
    }

    if (
      sourceMeta.parentMapId === targetMapId &&
      sourceMeta.spaceVisionMode === 'parent_overlay' &&
      Number.isInteger(sourceMeta.parentOriginX) &&
      Number.isInteger(sourceMeta.parentOriginY)
    ) {
      return {
        x: x + sourceMeta.parentOriginX!,
        y: y + sourceMeta.parentOriginY!,
      };
    }

    return null;
  }

  getPortalAt(mapId: string, x: number, y: number, options?: PortalQueryOptions): Portal | undefined {
    const map = this.maps.get(mapId);
    if (!map) return undefined;
    return map.portals.find((portal) => portal.x === x && portal.y === y && this.matchesPortalQuery(portal, options));
  }

  getHiddenPortalObservationAt(mapId: string, x: number, y: number): PortalObservationHint | undefined {
    const localPortal = this.getPortalAt(mapId, x, y);
    if (localPortal?.hidden) {
      return this.toPortalObservationHint(localPortal);
    }

    const parentMapId = this.getOverlayParentMapId(mapId);
    if (!parentMapId || this.isPointInMapBounds(mapId, x, y)) {
      return undefined;
    }

    const projected = this.projectPointToMap(parentMapId, mapId, x, y);
    if (!projected) {
      return undefined;
    }
    const parentPortal = this.getPortalAt(parentMapId, projected.x, projected.y);
    if (!parentPortal?.hidden) {
      return undefined;
    }
    return this.toPortalObservationHint(parentPortal);
  }

  getPortalNear(mapId: string, x: number, y: number, maxDistance = 1, options?: PortalQueryOptions): Portal | undefined {
    const map = this.maps.get(mapId);
    if (!map) return undefined;
    return map.portals.find((portal) =>
      isPointInRange(portal, { x, y }, maxDistance) && this.matchesPortalQuery(portal, options));
  }

  getPortals(mapId: string, options?: PortalQueryOptions): Portal[] {
    const map = this.maps.get(mapId);
    if (!map) {
      return [];
    }
    return map.portals.filter((portal) => this.matchesPortalQuery(portal, options));
  }

  private matchesPortalQuery(portal: Portal, options?: PortalQueryOptions): boolean {
    if (!options) return true;
    if (options.trigger && portal.trigger !== options.trigger) return false;
    if (options.kind && portal.kind !== options.kind) return false;
    return true;
  }

  private toPortalObservationHint(portal: Portal): PortalObservationHint {
    return {
      title: portal.observeTitle
        ?? (portal.kind === 'stairs' ? '隐藏楼梯' : '隐匿入口'),
      desc: portal.observeDesc
        ?? (portal.kind === 'stairs'
          ? '细看之下，这里像是藏着一道被刻意掩去痕迹的阶口。'
          : '细看之下，这里隐约残留着一处被刻意遮掩的入口痕迹。'),
    };
  }

  getNpcs(mapId: string): NpcConfig[] {
    return this.maps.get(mapId)?.npcs ?? [];
  }

  getNpcById(mapId: string, npcId: string): NpcConfig | undefined {
    return this.maps.get(mapId)?.npcs.find((npc) => npc.id === npcId);
  }

  getContainers(mapId: string): ContainerConfig[] {
    return this.maps.get(mapId)?.containers ?? [];
  }

  getContainerAt(mapId: string, x: number, y: number): ContainerConfig | undefined {
    return this.maps.get(mapId)?.containers.find((container) => container.x === x && container.y === y);
  }

  getContainerById(mapId: string, containerId: string): ContainerConfig | undefined {
    return this.maps.get(mapId)?.containers.find((container) => container.id === containerId);
  }

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

  getMonsterSpawns(mapId: string): MonsterSpawnConfig[] {
    return this.maps.get(mapId)?.monsterSpawns ?? [];
  }

  getQuest(questId: string): QuestConfig | undefined {
    return this.quests.get(questId);
  }

  getMonsterSpawn(monsterId: string): MonsterSpawnConfig | undefined {
    return this.monsters.get(monsterId);
  }

  getMonsterSpawnInMap(mapId: string, monsterId: string): MonsterSpawnConfig | undefined {
    return this.maps.get(mapId)?.monsterSpawns.find((spawn) => spawn.id === monsterId);
  }

  getTile(mapId: string, x: number, y: number): Tile | null {
    const map = this.maps.get(mapId);
    if (!map) return null;
    return map.tiles[y]?.[x] ?? null;
  }

  isTileDestroyed(mapId: string, x: number, y: number): boolean {
    const key = this.tileStateKey(x, y);
    return this.dynamicTileStates.get(mapId)?.get(key)?.destroyed === true;
  }

  getCompositeTile(mapId: string, x: number, y: number): Tile | null {
    const local = this.getTile(mapId, x, y);
    if (local) {
      return local;
    }

    const parentMapId = this.getOverlayParentMapId(mapId);
    if (!parentMapId) {
      return null;
    }

    const projected = this.projectPointToMap(parentMapId, mapId, x, y);
    if (!projected) {
      return null;
    }
    return this.getTile(parentMapId, projected.x, projected.y);
  }

  getTileAura(mapId: string, x: number, y: number): number {
    return Math.max(0, this.getTile(mapId, x, y)?.aura ?? 0);
  }

  getTileRuntimeDetail(mapId: string, x: number, y: number): {
    mapId: string;
    x: number;
    y: number;
    hp?: number;
    maxHp?: number;
    destroyed?: boolean;
    restoreTicksLeft?: number;
    resources: Array<{ key: string; label: string; value: number; level?: number; sourceValue?: number }>;
  } | null {
    let resolvedMapId = mapId;
    let resolvedX = x;
    let resolvedY = y;
    let tile = this.getTile(mapId, x, y);
    if (!tile) {
      const parentMapId = this.getOverlayParentMapId(mapId);
      if (!parentMapId) {
        return null;
      }
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

    const key = this.tileStateKey(resolvedX, resolvedY);
    const dynamicState = this.dynamicTileStates.get(resolvedMapId)?.get(key);
    const auraState = this.auraStates.get(resolvedMapId)?.get(key);
    const auraValue = Math.max(0, Math.round(auraState?.value ?? tile.aura ?? 0));
    const sourceValue = Math.max(0, Math.round(auraState?.sourceValue ?? this.maps.get(resolvedMapId)?.baseAuraValues.get(key) ?? 0));

    return {
      mapId,
      x,
      y,
      hp: tile.hp,
      maxHp: tile.maxHp,
      destroyed: dynamicState?.destroyed === true,
      restoreTicksLeft: dynamicState?.restoreTicksLeft,
      resources: auraValue > 0 || sourceValue > 0
        ? [{
            key: 'aura',
            label: '灵气',
            value: auraValue,
            level: getAuraLevel(auraValue, this.auraLevelBaseValue),
            sourceValue: sourceValue > 0 ? sourceValue : undefined,
          }]
        : [],
    };
  }

  setTileAura(mapId: string, x: number, y: number, value: number): number | null {
    const map = this.maps.get(mapId);
    const tile = this.getTile(mapId, x, y);
    if (!map || !tile) {
      return null;
    }

    const nextValue = Math.max(0, Math.round(value));
    const key = this.tileStateKey(x, y);
    const previousValue = tile.aura;
    if (previousValue === nextValue) {
      return tile.aura;
    }

    tile.aura = nextValue;
    const previousLevel = getAuraLevel(previousValue, this.auraLevelBaseValue);
    const stateMap = this.auraStates.get(mapId) ?? new Map<string, AuraRuntimeState>();
    const state = stateMap.get(key) ?? {
      x,
      y,
      value: previousValue,
      sourceValue: map.baseAuraValues.get(key) ?? 0,
      decayRemainder: 0,
      sourceRemainder: 0,
    };
    state.value = nextValue;
    if (this.shouldKeepAuraRuntimeState(state)) {
      stateMap.set(key, state);
      this.auraStates.set(mapId, stateMap);
    } else {
      stateMap.delete(key);
      if (stateMap.size > 0) {
        this.auraStates.set(mapId, stateMap);
      } else {
        this.auraStates.delete(mapId);
      }
    }
    this.auraStatesDirty = true;
    if (getAuraLevel(nextValue, this.auraLevelBaseValue) !== previousLevel) {
      this.markTileDirty(mapId, x, y);
    }
    return nextValue;
  }

  hasNpcAt(mapId: string, x: number, y: number): boolean {
    const map = this.maps.get(mapId);
    if (!map) return false;
    return map.npcs.some((npc) => npc.x === x && npc.y === y);
  }

  isTerrainWalkable(mapId: string, x: number, y: number): boolean {
    const tile = this.getTile(mapId, x, y);
    return tile !== null && tile.walkable;
  }

  isWalkable(mapId: string, x: number, y: number, options: OccupancyCheckOptions = {}): boolean {
    const tile = this.getTile(mapId, x, y);
    if (tile === null || !tile.walkable || this.hasNpcAt(mapId, x, y)) {
      return false;
    }
    return this.canOccupy(mapId, x, y, options);
  }

  canOccupy(mapId: string, x: number, y: number, options: OccupancyCheckOptions = {}): boolean {
    const tile = this.getTile(mapId, x, y);
    if (!tile || !tile.walkable) return false;
    if (this.hasNpcAt(mapId, x, y)) return false;

    const { occupancyId, actorType = 'player' } = options;
    const occupants = this.getOccupantsAt(mapId, x, y);
    if (!occupants || occupants.size === 0) {
      return true;
    }

    const blockingOccupants = [...occupants.entries()].filter(([id]) => id !== occupancyId);
    if (blockingOccupants.length === 0) {
      return true;
    }

    return actorType === 'player' && this.supportsPlayerOverlap(mapId, x, y);
  }

  blocksSight(mapId: string, x: number, y: number): boolean {
    const tile = this.getCompositeTile(mapId, x, y);
    return tile === null ? true : tile.blocksSight;
  }

  getTraversalCost(mapId: string, x: number, y: number): number {
    const tile = this.getTile(mapId, x, y);
    if (!tile || !tile.walkable) return Number.POSITIVE_INFINITY;
    return getTileTraversalCost(tile.type);
  }

  addOccupant(mapId: string, x: number, y: number, occupancyId: string, kind: OccupantKind = 'player'): void {
    const tile = this.getTile(mapId, x, y);
    if (!tile) return;

    const mapOccupants = this.occupantsByMap.get(mapId) ?? new Map<string, Map<string, OccupantKind>>();
    const key = this.tileStateKey(x, y);
    const occupants = mapOccupants.get(key) ?? new Map<string, OccupantKind>();
    occupants.set(occupancyId, kind);
    mapOccupants.set(key, occupants);
    this.occupantsByMap.set(mapId, mapOccupants);
    this.syncOccupancyDisplay(mapId, x, y);
    this.markTileDirty(mapId, x, y);
  }

  removeOccupant(mapId: string, x: number, y: number, occupancyId: string): void {
    const mapOccupants = this.occupantsByMap.get(mapId);
    if (!mapOccupants) return;

    const key = this.tileStateKey(x, y);
    const occupants = mapOccupants.get(key);
    if (!occupants) return;

    occupants.delete(occupancyId);
    if (occupants.size === 0) {
      mapOccupants.delete(key);
    }
    if (mapOccupants.size === 0) {
      this.occupantsByMap.delete(mapId);
    }
    this.syncOccupancyDisplay(mapId, x, y);
    this.markTileDirty(mapId, x, y);
  }

  damageTile(mapId: string, x: number, y: number, damage: number): { destroyed: boolean; hp: number; maxHp: number; appliedDamage: number } | null {
    const tile = this.getTile(mapId, x, y);
    const originalType = this.getBaseTileType(mapId, x, y);
    if (!tile || originalType === null) return null;

    const maxHp = this.tileDurability(mapId, originalType);
    if (maxHp <= 0) {
      return null;
    }

    const mapStates = this.dynamicTileStates.get(mapId) ?? new Map<string, DynamicTileState>();
    const key = this.tileStateKey(x, y);
    const current = mapStates.get(key);
    if (current?.destroyed) {
      return null;
    }

    const nextDamage = Math.max(0, Math.round(damage));
    if (nextDamage <= 0) {
      const hp = current?.hp ?? tile.hp ?? maxHp;
      return { destroyed: false, hp, maxHp, appliedDamage: 0 };
    }

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
    const currentHp = state.hp;
    const appliedDamage = Math.min(currentHp, nextDamage);
    state.hp = Math.max(0, currentHp - appliedDamage);
    state.destroyed = state.hp <= 0;
    state.restoreTicksLeft = state.destroyed ? TERRAIN_DESTROYED_RESTORE_TICKS : undefined;
    this.applyDynamicTileStateToTile(tile, state);
    this.markTileDirty(mapId, x, y);

    mapStates.set(key, state);
    this.dynamicTileStates.set(mapId, mapStates);
    this.dynamicTileStatesDirty = true;

    if (state.destroyed) {
      this.bumpMapRevision(mapId);
      return { destroyed: true, hp: 0, maxHp, appliedDamage };
    }

    return { destroyed: false, hp: state.hp, maxHp: state.maxHp, appliedDamage };
  }

  findNearbyWalkable(
    mapId: string,
    x: number,
    y: number,
    maxRadius = 6,
    options: OccupancyCheckOptions = {},
  ): { x: number; y: number } | null {
    for (let radius = 0; radius <= maxRadius; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (!isOffsetInRange(dx, dy, radius)) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (this.isWalkable(mapId, nx, ny, options)) {
            return { x: nx, y: ny };
          }
        }
      }
    }
    return null;
  }

  getViewTiles(mapId: string, cx: number, cy: number, radius = VIEW_RADIUS, visibleKeys?: Set<string>): VisibleTile[][] {
    if (!this.maps.has(mapId)) return [];
    const result: VisibleTile[][] = [];
    const size = radius * 2 + 1;
    for (let dy = 0; dy < size; dy++) {
      const row: VisibleTile[] = [];
      for (let dx = 0; dx < size; dx++) {
        const wx = cx - radius + dx;
        const wy = cy - radius + dy;
        const key = `${wx},${wy}`;
        if (visibleKeys && !visibleKeys.has(key)) {
          row.push(null);
          continue;
        }
        const tile = this.getCompositeTile(mapId, wx, wy) ?? {
          type: TileType.Wall,
          walkable: false,
          blocksSight: true,
          aura: 0,
          occupiedBy: null,
          modifiedAt: null,
        };
        const hiddenEntrance = this.getHiddenPortalObservationAt(mapId, wx, wy);
        row.push(hiddenEntrance ? { ...tile, hiddenEntrance } : tile);
      }
      result.push(row);
    }
    return result;
  }

  getAllMapIds(): string[] {
    return [...this.maps.keys()];
  }

  private cloneMapDocument(document: GmMapDocument): GmMapDocument {
    return cloneEditableMapDocument(document);
  }

  private normalizeEditableMapDocument(raw: unknown): GmMapDocument {
    return normalizeEditableMapDocumentValue(this.hydrateEditableMapDocument(raw));
  }

  private hydrateEditableMapDocument(raw: unknown): unknown {
    if (!raw || typeof raw !== 'object') {
      return raw;
    }
    const source = raw as {
      monsterSpawns?: unknown[];
      terrainProfileId?: unknown;
    };
    return {
      ...source,
      terrainProfileId: typeof source.terrainProfileId === 'string' ? source.terrainProfileId : undefined,
      monsterSpawns: Array.isArray(source.monsterSpawns)
        ? source.monsterSpawns.map((spawn) => this.hydrateMonsterSpawnRecord(spawn))
        : [],
    };
  }

  private hydrateMonsterSpawnRecord(raw: unknown): unknown {
    if (!raw || typeof raw !== 'object') {
      return raw;
    }
    const spawn = raw as Partial<GmMapMonsterSpawnRecord> & { templateId?: unknown };
    const templateId = this.resolveMonsterSpawnTemplateId(spawn);
    const template = templateId ? this.contentService.getMonsterTemplate(templateId) : undefined;
    if (!template) {
      return raw;
    }
    return {
      ...template,
      ...spawn,
      templateId,
    };
  }

  private dehydrateEditableMapDocument(document: GmMapDocument): unknown {
    return {
      ...document,
      monsterSpawns: document.monsterSpawns.map((spawn) => this.dehydrateMonsterSpawnRecord(spawn)),
    };
  }

  private dehydrateMonsterSpawnRecord(spawn: GmMapMonsterSpawnRecord): unknown {
    const templateId = typeof spawn.templateId === 'string' && spawn.templateId.trim().length > 0
      ? spawn.templateId
      : spawn.id;
    const template = this.contentService.getMonsterTemplate(templateId);
    if (!template) {
      return spawn;
    }
    const persisted: Partial<GmMapMonsterSpawnRecord> = {
      id: spawn.id,
      x: spawn.x,
      y: spawn.y,
    };
    if (templateId !== spawn.id) {
      persisted.templateId = templateId;
    }
    if (spawn.name !== template.name) persisted.name = spawn.name;
    if (spawn.char !== template.char) persisted.char = spawn.char;
    if (spawn.color !== template.color) persisted.color = spawn.color;
    if (spawn.grade !== template.grade) persisted.grade = spawn.grade;
    if (spawn.hp !== template.hp) persisted.hp = spawn.hp;
    if ((spawn.maxHp ?? spawn.hp) !== template.maxHp) persisted.maxHp = spawn.maxHp;
    if (spawn.attack !== template.attack) persisted.attack = spawn.attack;
    if ((spawn.count ?? spawn.maxAlive ?? 1) !== template.count) persisted.count = spawn.count;
    if ((spawn.radius ?? 3) !== template.radius) persisted.radius = spawn.radius;
    if ((spawn.maxAlive ?? 1) !== template.maxAlive) persisted.maxAlive = spawn.maxAlive;
    if ((spawn.aggroRange ?? 6) !== template.aggroRange) persisted.aggroRange = spawn.aggroRange;
    if ((spawn.viewRange ?? spawn.aggroRange ?? 6) !== template.viewRange) persisted.viewRange = spawn.viewRange;
    if ((spawn.aggroMode ?? 'always') !== template.aggroMode) persisted.aggroMode = spawn.aggroMode;
    if ((spawn.respawnTicks ?? spawn.respawnSec ?? 15) !== template.respawnTicks) {
      persisted.respawnTicks = spawn.respawnTicks;
      if (persisted.respawnTicks === undefined && spawn.respawnSec !== undefined) {
        persisted.respawnSec = spawn.respawnSec;
      }
    }
    if ((spawn.level ?? undefined) !== template.level) persisted.level = spawn.level;
    if ((spawn.expMultiplier ?? 1) !== template.expMultiplier) persisted.expMultiplier = spawn.expMultiplier;
    if (JSON.stringify(spawn.drops ?? []) !== JSON.stringify(template.drops)) {
      persisted.drops = spawn.drops;
    }
    return persisted;
  }

  private normalizeEditableContainerRecord(input: unknown): GmMapContainerRecord | undefined {
    if (!input || typeof input !== 'object') {
      return undefined;
    }
    const container = input as GmMapContainerRecord;
    return {
      grade: this.normalizeContainerGrade(container.grade),
      refreshTicks: Number.isFinite(container.refreshTicks) ? Number(container.refreshTicks) : undefined,
      drops: Array.isArray(container.drops)
        ? container.drops.map((drop) => ({
          itemId: String(drop.itemId ?? ''),
          name: String(drop.name ?? ''),
          type: drop.type,
          count: Number.isFinite(drop.count) ? Number(drop.count) : 1,
          chance: Number.isFinite(drop.chance) ? Number(drop.chance) : undefined,
        }))
        : [],
    };
  }

  private normalizeMapTimeConfig(raw: unknown): MapTimeConfig {
    const candidate = (raw ?? {}) as Partial<MapTimeConfig>;
    const palette = candidate.palette && typeof candidate.palette === 'object' ? candidate.palette : {};
    const normalizedPalette = Object.fromEntries(
      Object.entries(palette).flatMap(([phase, entry]) => {
        if (!entry || typeof entry !== 'object') {
          return [];
        }
        const tint = typeof entry.tint === 'string' ? entry.tint : undefined;
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
      scale: typeof candidate.scale === 'number' && Number.isFinite(candidate.scale) && candidate.scale >= 0
        ? candidate.scale
        : DEFAULT_MAP_TIME_CONFIG.scale,
      light: {
        base: typeof candidate.light?.base === 'number' && Number.isFinite(candidate.light.base)
          ? Math.max(0, Math.min(100, candidate.light.base))
          : DEFAULT_MAP_TIME_CONFIG.light?.base,
        timeInfluence: typeof candidate.light?.timeInfluence === 'number' && Number.isFinite(candidate.light.timeInfluence)
          ? Math.max(0, Math.min(100, candidate.light.timeInfluence))
          : DEFAULT_MAP_TIME_CONFIG.light?.timeInfluence,
      },
      palette: normalizedPalette,
    };
  }

  private normalizeMonsterAggroMode(value: unknown): MonsterAggroMode | undefined {
    return value === 'always' || value === 'retaliate' || value === 'day_only' || value === 'night_only'
      ? value
      : undefined;
  }

  private syncPortalTiles(document: GmMapDocument): GmMapDocument {
    const rows = document.tiles.map((row) => [...row].map((char) => (char === 'P' || char === 'S') ? '.' : char));
    for (const portal of document.portals) {
      if (portal.hidden) continue;
      if (!rows[portal.y]?.[portal.x]) continue;
      rows[portal.y]![portal.x] = portal.kind === 'stairs' ? 'S' : 'P';
    }
    return {
      ...document,
      tiles: rows.map((row) => row.join('')),
    };
  }

  private repairEditableMapDocument(document: GmMapDocument): GmMapDocument {
    const repairedSpawnPoint = this.resolveNearestWalkablePointInDocument(document, document.spawnPoint)
      ?? document.spawnPoint;
    return {
      ...document,
      spawnPoint: repairedSpawnPoint,
    };
  }

  private resolveNearestWalkablePointInDocument(
    document: GmMapDocument,
    origin: { x: number; y: number },
  ): { x: number; y: number } | null {
    if (document.width <= 0 || document.height <= 0) {
      return null;
    }

    const clamped = {
      x: Math.min(document.width - 1, Math.max(0, Math.floor(origin.x))),
      y: Math.min(document.height - 1, Math.max(0, Math.floor(origin.y))),
    };

    let portalFallback: { x: number; y: number } | null = null;
    for (let radius = 0; radius <= Math.max(document.width, document.height); radius += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (!isOffsetInRange(dx, dy, radius)) continue;
          const x = clamped.x + dx;
          const y = clamped.y + dy;
          if (x < 0 || x >= document.width || y < 0 || y >= document.height) continue;
          const type = getTileTypeFromMapChar(document.tiles[y]?.[x] ?? '#');
          if (type === TileType.Portal || type === TileType.Stairs) {
            portalFallback ??= { x, y };
            continue;
          }
          if (isTileTypeWalkable(type)) {
            return { x, y };
          }
        }
      }
    }

    return portalFallback;
  }

  private validateEditableMapDocument(document: GmMapDocument): string | null {
    return validateEditableMapDocumentValue(document);
  }

  private tileDurability(mapId: string, type: TileType): number {
    const profileId = this.resolveTerrainProfileId(mapId);
    const profile = this.resolveTerrainDurabilityProfile(profileId, type);
    if (!profile) {
      return 0;
    }
    const baseDurability = calculateTerrainDurability(profile.grade, profile.material);
    const multiplier = SPECIAL_TILE_DURABILITY_MULTIPLIERS[type] ?? 1;
    return Math.max(1, Math.round(baseDurability * multiplier));
  }

  private resolveTerrainProfileId(mapId: string): string {
    return this.maps.get(mapId)?.source.terrainProfileId
      ?? LEGACY_MAP_TERRAIN_PROFILE_IDS[mapId]
      ?? mapId;
  }

  private resolveTerrainDurabilityProfile(profileId: string, type: TileType): TerrainDurabilityProfile | undefined {
    return TERRAIN_DURABILITY_PROFILES[profileId as keyof typeof TERRAIN_DURABILITY_PROFILES]?.[type]
      ?? DEFAULT_TERRAIN_DURABILITY_BY_TILE[type];
  }

  private destroyedTileType(type: TileType): TileType {
    switch (type) {
      case TileType.Tree:
        return TileType.Grass;
      case TileType.Window:
        return TileType.BrokenWindow;
      case TileType.Wall:
      case TileType.Stone:
      case TileType.SpiritOre:
      case TileType.Door:
        return TileType.Floor;
      default:
        return type;
    }
  }

}

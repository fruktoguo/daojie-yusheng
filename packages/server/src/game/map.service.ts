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
  GmMapContainerRecord,
  GmMapDocument,
  GmMapLandmarkRecord,
  GmMapListRes,
  GmMapMonsterSpawnRecord,
  GmMapNpcRecord,
  GmMapPortalRecord,
  GmMapSummary,
  isTileTypeWalkable,
  manhattanDistance,
  Tile,
  TileType,
  MapMeta,
  MapMinimapArchiveEntry,
  MapMinimapMarker,
  MapMinimapSnapshot,
  MapSpaceVisionMode,
  MapTimeConfig,
  MonsterAggroMode,
  Portal,
  PortalKind,
  PortalTrigger,
  VIEW_RADIUS,
  ItemType,
  VisibleTile,
  getTileTraversalCost,
  PlayerRealmStage,
  QuestLine,
  QuestObjectiveType,
  TerrainDurabilityMaterial,
  TERRAIN_DESTROYED_RESTORE_TICKS,
  TERRAIN_REGEN_RATE_PER_TICK,
  TERRAIN_RESTORE_RETRY_DELAY_TICKS,
  TechniqueGrade,
} from '@mud/shared';
import * as fs from 'fs';
import * as path from 'path';
import { resolveServerDataPath } from '../common/data-path';
import { resolveRealmStageTargetLabel } from './quest-display';

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
  hp: number;
  maxHp: number;
  attack: number;
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

type OccupantKind = 'player' | 'monster';

interface OccupancyCheckOptions {
  occupancyId?: string | null;
  actorType?: OccupantKind;
}

type TerrainDurabilityProfile = {
  grade: TechniqueGrade;
  material: TerrainDurabilityMaterial;
};

const DEFAULT_TERRAIN_DURABILITY_BY_TILE: Partial<Record<TileType, TerrainDurabilityProfile>> = {
  [TileType.Wall]: { grade: 'mortal', material: 'stone' },
  [TileType.Tree]: { grade: 'mortal', material: 'wood' },
  [TileType.Stone]: { grade: 'mortal', material: 'stone' },
  [TileType.Door]: { grade: 'mortal', material: 'ironwood' },
  [TileType.Window]: { grade: 'mortal', material: 'wood' },
};

// 现有地图按区域主题与进度分配材质与品阶，统一走“品阶基础血量 × 材质倍率”。
const MAP_TERRAIN_DURABILITY_OVERRIDES: Partial<Record<string, Partial<Record<TileType, TerrainDurabilityProfile>>>> = {
  spawn: {
    [TileType.Wall]: { grade: 'mortal', material: 'stone' },
    [TileType.Tree]: { grade: 'mortal', material: 'wood' },
    [TileType.Stone]: { grade: 'mortal', material: 'stone' },
    [TileType.Door]: { grade: 'mortal', material: 'ironwood' },
    [TileType.Window]: { grade: 'mortal', material: 'wood' },
  },
  wildlands: {
    [TileType.Wall]: { grade: 'yellow', material: 'stone' },
    [TileType.Tree]: { grade: 'mortal', material: 'wood' },
    [TileType.Stone]: { grade: 'yellow', material: 'stone' },
  },
  bamboo_forest: {
    [TileType.Wall]: { grade: 'yellow', material: 'stone' },
    [TileType.Tree]: { grade: 'yellow', material: 'bamboo' },
    [TileType.Stone]: { grade: 'yellow', material: 'stone' },
    [TileType.Door]: { grade: 'mortal', material: 'wood' },
  },
  black_iron_mine: {
    [TileType.Wall]: { grade: 'mystic', material: 'blackIron' },
    [TileType.Stone]: { grade: 'mystic', material: 'blackIron' },
    [TileType.Door]: { grade: 'yellow', material: 'ironwood' },
  },
  ancient_ruins: {
    [TileType.Wall]: { grade: 'mystic', material: 'runeStone' },
    [TileType.Tree]: { grade: 'yellow', material: 'spiritWood' },
    [TileType.Stone]: { grade: 'mystic', material: 'runeStone' },
    [TileType.Door]: { grade: 'yellow', material: 'ironwood' },
  },
  spirit_ridge: {
    [TileType.Wall]: { grade: 'earth', material: 'stone' },
    [TileType.Tree]: { grade: 'mystic', material: 'spiritWood' },
    [TileType.Stone]: { grade: 'earth', material: 'stone' },
  },
  beast_valley: {
    [TileType.Wall]: { grade: 'earth', material: 'stone' },
    [TileType.Tree]: { grade: 'yellow', material: 'wood' },
    [TileType.Stone]: { grade: 'earth', material: 'stone' },
  },
  sky_ruins: {
    [TileType.Wall]: { grade: 'earth', material: 'skyMetal' },
    [TileType.Tree]: { grade: 'mystic', material: 'spiritWood' },
    [TileType.Stone]: { grade: 'earth', material: 'skyMetal' },
    [TileType.Door]: { grade: 'mystic', material: 'metal' },
  },
};

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
  private dirtyTileKeysByMap: Map<string, Set<string>> = new Map();
  private occupantsByMap: Map<string, Map<string, Map<string, OccupantKind>>> = new Map();
  private playerOverlapPointsByMap: Map<string, Set<string>> = new Map();
  private dynamicTileStates: Map<string, Map<string, DynamicTileState>> = new Map();
  private persistedDynamicTileStates: Map<string, Map<string, PersistedDynamicTileRecord>> = new Map();
  private dynamicTileStatesDirty = false;
  private watchers: fs.FSWatcher[] = [];
  private mapsDir = resolveServerDataPath('maps');
  private readonly dynamicTileStatePath = resolveServerDataPath('runtime', 'dynamic-map-state.json');

  onModuleInit() {
    this.loadPersistedDynamicTileStates();
    this.loadAllMaps();
    this.watchMaps();
  }

  onModuleDestroy() {
    this.persistDynamicTileStates();
    for (const w of this.watchers) w.close();
    this.watchers = [];
  }

  private loadPersistedDynamicTileStates() {
    this.persistedDynamicTileStates.clear();
    if (!fs.existsSync(this.dynamicTileStatePath)) {
      return;
    }

    try {
      const snapshot = JSON.parse(fs.readFileSync(this.dynamicTileStatePath, 'utf-8')) as Partial<PersistedDynamicTileSnapshot>;
      const rawMaps = snapshot?.maps;
      if (!rawMaps || typeof rawMaps !== 'object') {
        this.logger.warn('动态地块持久化文件格式非法，已忽略');
        return;
      }

      let stateCount = 0;
      for (const [mapId, rawRecords] of Object.entries(rawMaps)) {
        if (!Array.isArray(rawRecords)) {
          continue;
        }

        const records = new Map<string, PersistedDynamicTileRecord>();
        for (const rawRecord of rawRecords) {
          const record = rawRecord as Partial<PersistedDynamicTileRecord>;
          if (
            !Number.isInteger(record.x) ||
            !Number.isInteger(record.y) ||
            !Number.isFinite(record.hp) ||
            typeof record.destroyed !== 'boolean'
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
          stateCount += records.size;
        }
      }

      if (stateCount > 0) {
        this.logger.log(`已加载 ${stateCount} 条动态地块状态`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`读取动态地块持久化文件失败: ${message}`);
    }
  }

  private loadAllMaps() {
    const files = fs.readdirSync(this.mapsDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      this.loadMapFile(path.join(this.mapsDir, file));
    }
    this.rebuildAllMinimapSnapshots();
    this.logger.log(`已加载 ${this.maps.size} 张地图`);
  }

  private loadMapFile(filePath: string) {
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      this.loadMap(raw);
      this.logger.log(`地图已加载/重载: ${raw.id}`);
    } catch (e: any) {
      this.logger.error(`地图加载失败 ${filePath}: ${e.message}`);
    }
  }

  /** 监听地图目录，文件变化时自动重载 */
  private watchMaps() {
    const debounce = new Map<string, NodeJS.Timeout>();
    const watcher = fs.watch(this.mapsDir, (event, filename) => {
      if (!filename?.endsWith('.json')) return;
      // 防抖：同一文件 300ms 内只触发一次
      const existing = debounce.get(filename);
      if (existing) clearTimeout(existing);
      debounce.set(filename, setTimeout(() => {
        debounce.delete(filename);
        this.loadMapFile(path.join(this.mapsDir, filename));
      }, 300));
    });
    this.watchers.push(watcher);
    this.logger.log('地图热重载已启用');
  }

  private loadMap(raw: any) {
    const document = this.normalizeEditableMapDocument(raw);
    const tileRows = document.tiles;
    const tiles: Tile[][] = tileRows.map((row, y) =>
      [...row].map((char, x) => {
        const type = getTileTypeFromMapChar(char);
        const durability = this.tileDurability(document.id, type);
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

    this.rehydrateDynamicTileStates(document.id, document, tiles);

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
    const maps = [...this.maps.values()]
      .map<GmMapSummary>((map) => ({
        id: map.meta.id,
        name: map.meta.name,
        width: map.meta.width,
        height: map.meta.height,
        description: map.meta.description,
        dangerLevel: map.meta.dangerLevel,
        recommendedRealm: map.meta.recommendedRealm,
        portalCount: map.portals.length,
        npcCount: map.npcs.length,
        monsterSpawnCount: map.monsterSpawns.length,
      }))
      .sort((left, right) => left.id.localeCompare(right.id, 'zh-CN'));
    return { maps };
  }

  getEditableMap(mapId: string): GmMapDocument | undefined {
    const map = this.maps.get(mapId);
    if (!map) return undefined;
    return this.cloneMapDocument(map.source);
  }

  saveEditableMap(mapId: string, document: GmMapDocument): string | null {
    if (mapId !== document.id) {
      return '地图 ID 不允许在编辑器中直接修改';
    }

    const normalized = this.normalizeEditableMapDocument(document);
    const error = this.validateEditableMapDocument(normalized);
    if (error) {
      return error;
    }

    try {
      fs.writeFileSync(this.resolveMapFilePath(mapId), `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8');
      this.loadMap(normalized);
      return null;
    } catch (saveError) {
      return saveError instanceof Error ? saveError.message : '地图保存失败';
    }
  }

  persistDynamicTileStates() {
    if (!this.dynamicTileStatesDirty) {
      return;
    }

    try {
      const snapshot: PersistedDynamicTileSnapshot = {
        version: 1,
        maps: {},
      };

      const sortedMaps = [...this.dynamicTileStates.entries()]
        .sort(([left], [right]) => left.localeCompare(right, 'zh-CN'));
      for (const [mapId, stateMap] of sortedMaps) {
        if (stateMap.size === 0) {
          continue;
        }

        snapshot.maps[mapId] = [...stateMap.values()]
          .sort((left, right) => left.y - right.y || left.x - right.x)
          .map((state) => ({
            x: state.x,
            y: state.y,
            hp: state.hp,
            destroyed: state.destroyed,
            restoreTicksLeft: state.destroyed ? this.normalizeRestoreTicksLeft(state.restoreTicksLeft) : undefined,
          }));
      }

      fs.mkdirSync(path.dirname(this.dynamicTileStatePath), { recursive: true });
      fs.writeFileSync(this.dynamicTileStatePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf-8');
      this.dynamicTileStatesDirty = false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`动态地块持久化失败: ${message}`);
    }
  }

  tickDynamicTiles(mapId: string) {
    const stateMap = this.dynamicTileStates.get(mapId);
    if (!stateMap || stateMap.size === 0) {
      return;
    }

    let changed = false;
    let visibilityChanged = false;
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

    if (stateMap.size === 0) {
      this.dynamicTileStates.delete(mapId);
    }
    if (visibilityChanged) {
      this.bumpMapRevision(mapId);
    }
    if (changed) {
      this.dynamicTileStatesDirty = true;
    }
  }

  private rehydrateDynamicTileStates(mapId: string, document: GmMapDocument, tiles: Tile[][]) {
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
      const originalType = getTileTypeFromMapChar(document.tiles[rawState.y]?.[rawState.x] ?? '#');
      const maxHp = this.tileDurability(mapId, originalType);
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

  private getBaseTileType(mapId: string, x: number, y: number): TileType | null {
    const row = this.maps.get(mapId)?.source.tiles[y];
    if (!row) {
      return null;
    }
    return getTileTypeFromMapChar(row[x] ?? '#');
  }

  private hasBlockingEntityAt(mapId: string, x: number, y: number): boolean {
    const occupants = this.getOccupantsAt(mapId, x, y);
    return (occupants?.size ?? 0) > 0 || this.hasNpcAt(mapId, x, y);
  }

  private rebuildPlayerOverlapPointIndex(): void {
    const next = new Map<string, Set<string>>();
    for (const [mapId, map] of this.maps.entries()) {
      for (const portal of map.portals) {
        if (!portal.allowPlayerOverlap) continue;
        this.addOverlapPoint(next, mapId, portal.x, portal.y);
        this.addOverlapPoint(next, portal.targetMapId, portal.targetX, portal.targetY);
      }
    }
    this.playerOverlapPointsByMap = next;
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
        value: Math.max(0, point.value!),
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
        const normalizedRequired = Number.isInteger(required) ? required! : 1;
        const targetName = typeof rawQuest.targetName === 'string'
          ? rawQuest.targetName
          : objectiveType === 'kill'
            ? rawQuest.targetMonsterId!
            : objectiveType === 'learn_technique'
              ? rawQuest.targetTechniqueId!
              : parsedRealmStage !== undefined
                ? resolveRealmStageTargetLabel(parsedRealmStage) ?? PlayerRealmStage[parsedRealmStage]
                : rawQuest.title!;
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
      const spawn = candidate as Partial<MonsterSpawnConfig> & {
        respawnSec?: number;
        level?: number;
        expMultiplier?: number;
        lootItemId?: string;
        lootChance?: number;
        drops?: unknown[];
      };
      const valid =
        typeof spawn.id === 'string' &&
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
        id: spawn.id!,
        name: spawn.name!,
        x: spawn.x!,
        y: spawn.y!,
        char: spawn.char!,
        color: spawn.color!,
        hp: spawn.hp!,
        maxHp: Number.isInteger(spawn.maxHp) ? spawn.maxHp! : spawn.hp!,
        attack: spawn.attack!,
        radius: Number.isInteger((spawn as { radius?: number }).radius) ? (spawn as { radius: number }).radius : 3,
        maxAlive: Number.isInteger((spawn as { maxAlive?: number }).maxAlive) ? (spawn as { maxAlive: number }).maxAlive : 1,
        aggroRange: Number.isInteger(spawn.aggroRange) ? spawn.aggroRange! : 6,
        viewRange: Number.isInteger((spawn as { viewRange?: number }).viewRange)
          ? (spawn as { viewRange: number }).viewRange
          : (Number.isInteger(spawn.aggroRange) ? spawn.aggroRange! : 6),
        aggroMode: spawn.aggroMode ?? 'always',
        respawnTicks: Number.isInteger(spawn.respawnTicks)
          ? spawn.respawnTicks!
          : Math.max(1, (spawn as { respawnSec?: number }).respawnSec ?? 15),
        level: Number.isInteger((spawn as { level?: number }).level) ? (spawn as { level: number }).level : undefined,
        expMultiplier: typeof (spawn as { expMultiplier?: number }).expMultiplier === 'number'
          ? Math.max(0, (spawn as { expMultiplier: number }).expMultiplier)
          : 1,
        drops,
      });
    }
    return result;
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
    const source = this.maps.get(mapId)?.source.time;
    return source
      ? JSON.parse(JSON.stringify(source)) as MapTimeConfig
      : JSON.parse(JSON.stringify(DEFAULT_MAP_TIME_CONFIG)) as MapTimeConfig;
  }

  /** GM 运行时修改地图时间配置（不持久化，重启恢复默认） */
  updateMapTimeConfig(mapId: string, patch: { scale?: number; offsetTicks?: number }): string | null {
    const map = this.maps.get(mapId);
    if (!map) return '目标地图不存在';
    if (!map.source.time) {
      map.source.time = JSON.parse(JSON.stringify(DEFAULT_MAP_TIME_CONFIG)) as MapTimeConfig;
    }
    if (typeof patch.scale === 'number' && patch.scale >= 0) {
      map.source.time!.scale = patch.scale;
    }
    if (typeof patch.offsetTicks === 'number' && Number.isFinite(patch.offsetTicks)) {
      map.source.time!.offsetTicks = Math.round(patch.offsetTicks);
    }
    return null;
  }

  getMapRevision(mapId: string): number {
    return this.revisions.get(mapId) ?? 0;
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
      manhattanDistance(portal, { x, y }) <= maxDistance && this.matchesPortalQuery(portal, options));
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

    if (actorType !== 'player' || !this.supportsPlayerOverlap(mapId, x, y)) {
      return false;
    }

    return blockingOccupants.every(([, kind]) => kind === 'player');
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

  damageTile(mapId: string, x: number, y: number, damage: number): { destroyed: boolean; hp: number; maxHp: number } | null {
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
      return { destroyed: false, hp, maxHp };
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
    state.hp = Math.max(0, state.hp - nextDamage);
    state.destroyed = state.hp <= 0;
    state.restoreTicksLeft = state.destroyed ? TERRAIN_DESTROYED_RESTORE_TICKS : undefined;
    this.applyDynamicTileStateToTile(tile, state);
    this.markTileDirty(mapId, x, y);

    mapStates.set(key, state);
    this.dynamicTileStates.set(mapId, mapStates);
    this.dynamicTileStatesDirty = true;

    if (state.destroyed) {
      this.bumpMapRevision(mapId);
      return { destroyed: true, hp: 0, maxHp };
    }

    return { destroyed: false, hp: state.hp, maxHp: state.maxHp };
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
          if (Math.abs(dx) + Math.abs(dy) > radius) continue;
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

  private resolveMapFilePath(mapId: string): string {
    return path.join(this.mapsDir, `${mapId}.json`);
  }

  private cloneMapDocument(document: GmMapDocument): GmMapDocument {
    return JSON.parse(JSON.stringify(document)) as GmMapDocument;
  }

  private normalizeEditableMapDocument(raw: unknown): GmMapDocument {
    const source = raw as Partial<GmMapDocument>;
    const tiles = Array.isArray(source.tiles)
      ? source.tiles.map((row) => typeof row === 'string' ? row : '')
      : [];
    const auras = Array.isArray(source.auras) ? source.auras : [];
    const landmarks = Array.isArray((source as { landmarks?: unknown[] }).landmarks)
      ? (source as { landmarks: unknown[] }).landmarks
      : [];
    const portals = Array.isArray(source.portals) ? source.portals : [];
    const npcs = Array.isArray(source.npcs) ? source.npcs : [];
    const monsterSpawns = Array.isArray(source.monsterSpawns) ? source.monsterSpawns : [];

    return this.repairEditableMapDocument(this.syncPortalTiles({
      id: typeof source.id === 'string' ? source.id : '',
      name: typeof source.name === 'string' ? source.name : '',
      width: Number.isInteger(source.width) ? Number(source.width) : 0,
      height: Number.isInteger(source.height) ? Number(source.height) : 0,
      parentMapId: typeof source.parentMapId === 'string' ? source.parentMapId : undefined,
      parentOriginX: Number.isInteger(source.parentOriginX) ? Number(source.parentOriginX) : undefined,
      parentOriginY: Number.isInteger(source.parentOriginY) ? Number(source.parentOriginY) : undefined,
      floorLevel: Number.isInteger(source.floorLevel) ? Number(source.floorLevel) : undefined,
      floorName: typeof source.floorName === 'string' ? source.floorName : undefined,
      spaceVisionMode: this.normalizeMapSpaceVisionMode(source.spaceVisionMode, source.parentMapId),
      description: typeof source.description === 'string' ? source.description : undefined,
      dangerLevel: Number.isFinite(source.dangerLevel) ? Number(source.dangerLevel) : undefined,
      recommendedRealm: typeof source.recommendedRealm === 'string' ? source.recommendedRealm : undefined,
      tiles,
      portals: portals.map((portal) => ({
        x: Number((portal as GmMapPortalRecord).x ?? 0),
        y: Number((portal as GmMapPortalRecord).y ?? 0),
        targetMapId: String((portal as GmMapPortalRecord).targetMapId ?? ''),
        targetX: Number((portal as GmMapPortalRecord).targetX ?? 0),
        targetY: Number((portal as GmMapPortalRecord).targetY ?? 0),
        kind: this.normalizePortalKind((portal as GmMapPortalRecord).kind),
        trigger: this.normalizePortalTrigger((portal as GmMapPortalRecord).trigger, (portal as GmMapPortalRecord).kind),
        allowPlayerOverlap: (portal as GmMapPortalRecord).allowPlayerOverlap === true,
        hidden: (portal as GmMapPortalRecord).hidden === true,
        observeTitle: typeof (portal as GmMapPortalRecord).observeTitle === 'string'
          ? (portal as GmMapPortalRecord).observeTitle
          : undefined,
        observeDesc: typeof (portal as GmMapPortalRecord).observeDesc === 'string'
          ? (portal as GmMapPortalRecord).observeDesc
          : undefined,
      })),
      spawnPoint: {
        x: Number((source.spawnPoint as { x?: number } | undefined)?.x ?? 0),
        y: Number((source.spawnPoint as { y?: number } | undefined)?.y ?? 0),
      },
      time: this.normalizeMapTimeConfig((source as { time?: unknown }).time),
      auras: auras.map((point) => ({
        x: Number((point as GmMapAuraRecord).x ?? 0),
        y: Number((point as GmMapAuraRecord).y ?? 0),
        value: Number((point as GmMapAuraRecord).value ?? 0),
      })),
      landmarks: landmarks.map((landmark) => ({
        id: String((landmark as GmMapLandmarkRecord).id ?? ''),
        name: String((landmark as GmMapLandmarkRecord).name ?? ''),
        x: Number((landmark as GmMapLandmarkRecord).x ?? 0),
        y: Number((landmark as GmMapLandmarkRecord).y ?? 0),
        desc: typeof (landmark as GmMapLandmarkRecord).desc === 'string'
          ? (landmark as GmMapLandmarkRecord).desc
          : undefined,
        container: this.normalizeEditableContainerRecord((landmark as GmMapLandmarkRecord).container),
      })),
      npcs: npcs.map((npc) => ({
        id: String((npc as GmMapNpcRecord).id ?? ''),
        name: String((npc as GmMapNpcRecord).name ?? ''),
        x: Number((npc as GmMapNpcRecord).x ?? 0),
        y: Number((npc as GmMapNpcRecord).y ?? 0),
        char: String((npc as GmMapNpcRecord).char ?? ''),
        color: String((npc as GmMapNpcRecord).color ?? ''),
        dialogue: String((npc as GmMapNpcRecord).dialogue ?? ''),
        role: typeof (npc as GmMapNpcRecord).role === 'string' ? (npc as GmMapNpcRecord).role : undefined,
        quests: Array.isArray((npc as GmMapNpcRecord).quests)
          ? JSON.parse(JSON.stringify((npc as GmMapNpcRecord).quests))
          : [],
      })),
      monsterSpawns: monsterSpawns.map((spawn) => ({
        id: String((spawn as GmMapMonsterSpawnRecord).id ?? ''),
        name: String((spawn as GmMapMonsterSpawnRecord).name ?? ''),
        x: Number((spawn as GmMapMonsterSpawnRecord).x ?? 0),
        y: Number((spawn as GmMapMonsterSpawnRecord).y ?? 0),
        char: String((spawn as GmMapMonsterSpawnRecord).char ?? ''),
        color: String((spawn as GmMapMonsterSpawnRecord).color ?? ''),
        hp: Number((spawn as GmMapMonsterSpawnRecord).hp ?? 0),
        maxHp: Number.isFinite((spawn as GmMapMonsterSpawnRecord).maxHp)
          ? Number((spawn as GmMapMonsterSpawnRecord).maxHp)
          : undefined,
        attack: Number((spawn as GmMapMonsterSpawnRecord).attack ?? 0),
        radius: Number.isFinite((spawn as GmMapMonsterSpawnRecord).radius)
          ? Number((spawn as GmMapMonsterSpawnRecord).radius)
          : undefined,
        maxAlive: Number.isFinite((spawn as GmMapMonsterSpawnRecord).maxAlive)
          ? Number((spawn as GmMapMonsterSpawnRecord).maxAlive)
          : undefined,
        aggroRange: Number.isFinite((spawn as GmMapMonsterSpawnRecord).aggroRange)
          ? Number((spawn as GmMapMonsterSpawnRecord).aggroRange)
          : undefined,
        viewRange: Number.isFinite((spawn as GmMapMonsterSpawnRecord).viewRange)
          ? Number((spawn as GmMapMonsterSpawnRecord).viewRange)
          : undefined,
        aggroMode: this.normalizeMonsterAggroMode((spawn as GmMapMonsterSpawnRecord).aggroMode),
        respawnSec: Number.isFinite((spawn as GmMapMonsterSpawnRecord).respawnSec)
          ? Number((spawn as GmMapMonsterSpawnRecord).respawnSec)
          : undefined,
        respawnTicks: Number.isFinite((spawn as GmMapMonsterSpawnRecord).respawnTicks)
          ? Number((spawn as GmMapMonsterSpawnRecord).respawnTicks)
          : undefined,
        level: Number.isFinite((spawn as GmMapMonsterSpawnRecord).level)
          ? Number((spawn as GmMapMonsterSpawnRecord).level)
          : undefined,
        expMultiplier: Number.isFinite((spawn as GmMapMonsterSpawnRecord).expMultiplier)
          ? Number((spawn as GmMapMonsterSpawnRecord).expMultiplier)
          : undefined,
        drops: Array.isArray((spawn as GmMapMonsterSpawnRecord).drops)
          ? JSON.parse(JSON.stringify((spawn as GmMapMonsterSpawnRecord).drops))
          : [],
      })),
    }));
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
          if (Math.abs(dx) + Math.abs(dy) > radius) continue;
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
    if (!document.id.trim()) return '地图 ID 不能为空';
    if (!document.name.trim()) return '地图名称不能为空';
    if (document.parentMapId?.trim() === document.id.trim()) return '子地图的父地图不能指向自己';
    if (document.spaceVisionMode === 'parent_overlay' && !document.parentMapId?.trim()) {
      return '启用父地图透视时必须填写父地图 ID';
    }
    if (document.spaceVisionMode === 'parent_overlay') {
      if (!Number.isInteger(document.parentOriginX) || !Number.isInteger(document.parentOriginY)) {
        return '启用父地图透视时必须填写父地图对齐坐标';
      }
    }
    if (!Number.isInteger(document.width) || document.width <= 0) return '地图宽度必须为正整数';
    if (!Number.isInteger(document.height) || document.height <= 0) return '地图高度必须为正整数';
    if (document.tiles.length !== document.height) return '地图行数必须与高度一致';

    const supportedChars = new Set(['#', '.', '=', ':', 'P', 'S', '+', 'W', 'B', ',', '^', ';', '%', '~', 'T', 'o']);
    for (let y = 0; y < document.tiles.length; y += 1) {
      const row = document.tiles[y] ?? '';
      if (row.length !== document.width) {
        return `第 ${y + 1} 行长度与地图宽度不一致`;
      }
      for (const char of row) {
        if (!supportedChars.has(char)) {
          return `地图中存在不支持的地块字符: ${char}`;
        }
      }
    }

    const ensurePointInBounds = (x: number, y: number, label: string): string | null => {
      if (!Number.isInteger(x) || !Number.isInteger(y)) return `${label} 坐标必须为整数`;
      if (x < 0 || x >= document.width || y < 0 || y >= document.height) {
        return `${label} 越界: (${x}, ${y})`;
      }
      return null;
    };

    const ensureWalkablePoint = (x: number, y: number, label: string): string | null => {
      const boundsError = ensurePointInBounds(x, y, label);
      if (boundsError) return boundsError;
      const type = getTileTypeFromMapChar(document.tiles[y]![x]!);
      if (!isTileTypeWalkable(type)) {
        return `${label} 必须位于可通行地块`;
      }
      return null;
    };

    const spawnError = ensureWalkablePoint(document.spawnPoint.x, document.spawnPoint.y, '出生点');
    if (spawnError) return spawnError;

    const portalKeys = new Set<string>();
    for (let index = 0; index < document.portals.length; index += 1) {
      const portal = document.portals[index]!;
      const label = `传送点 ${index + 1}`;
      const error = ensureWalkablePoint(portal.x, portal.y, label);
      if (error) return error;
      if (!portal.targetMapId.trim()) return `${label} 的目标地图不能为空`;
      const key = `${portal.x},${portal.y}`;
      if (portalKeys.has(key)) return `${label} 与其他传送点坐标重复`;
      portalKeys.add(key);
    }

    for (let index = 0; index < (document.auras?.length ?? 0); index += 1) {
      const point = document.auras![index]!;
      const error = ensurePointInBounds(point.x, point.y, `灵气点 ${index + 1}`);
      if (error) return error;
    }

    for (let index = 0; index < (document.landmarks?.length ?? 0); index += 1) {
      const landmark = document.landmarks![index]!;
      const label = `地标 ${landmark.id || index + 1}`;
      if (!landmark.id.trim()) return `${label} 的 ID 不能为空`;
      if (!landmark.name.trim()) return `${label} 的名称不能为空`;
      const error = ensurePointInBounds(landmark.x, landmark.y, label);
      if (error) return error;
      if (landmark.container) {
        const refreshTicks = landmark.container.refreshTicks;
        if (refreshTicks !== undefined && (!Number.isInteger(refreshTicks) || refreshTicks <= 0)) {
          return `${label} 的容器刷新时间必须为正整数`;
        }
      }
    }

    for (let index = 0; index < document.npcs.length; index += 1) {
      const npc = document.npcs[index]!;
      const label = `NPC ${npc.id || index + 1}`;
      if (!npc.id.trim()) return `${label} 的 ID 不能为空`;
      if (!npc.name.trim()) return `${label} 的名称不能为空`;
      if (!npc.char.trim()) return `${label} 的字符不能为空`;
      const error = ensureWalkablePoint(npc.x, npc.y, label);
      if (error) return error;
    }

    for (let index = 0; index < document.monsterSpawns.length; index += 1) {
      const spawn = document.monsterSpawns[index]!;
      const label = `怪物刷新点 ${spawn.id || index + 1}`;
      if (!spawn.id.trim()) return `${label} 的 ID 不能为空`;
      if (!spawn.name.trim()) return `${label} 的名称不能为空`;
      if (!spawn.char.trim()) return `${label} 的字符不能为空`;
      const error = ensurePointInBounds(spawn.x, spawn.y, label);
      if (error) return error;
    }

    return null;
  }

  private tileDurability(mapId: string, type: TileType): number {
    const profile = this.resolveTerrainDurabilityProfile(mapId, type);
    if (!profile) {
      return 0;
    }
    return calculateTerrainDurability(profile.grade, profile.material);
  }

  private resolveTerrainDurabilityProfile(mapId: string, type: TileType): TerrainDurabilityProfile | undefined {
    return MAP_TERRAIN_DURABILITY_OVERRIDES[mapId]?.[type] ?? DEFAULT_TERRAIN_DURABILITY_BY_TILE[type];
  }

  private destroyedTileType(type: TileType): TileType {
    switch (type) {
      case TileType.Tree:
        return TileType.Grass;
      case TileType.Window:
        return TileType.BrokenWindow;
      case TileType.Wall:
      case TileType.Stone:
      case TileType.Door:
        return TileType.Floor;
      default:
        return type;
    }
  }

}

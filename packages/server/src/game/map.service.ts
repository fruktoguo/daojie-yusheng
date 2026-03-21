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
  MapTimeConfig,
  MonsterAggroMode,
  Portal,
  VIEW_RADIUS,
  ItemType,
  VisibleTile,
  getTileTraversalCost,
  PlayerRealmStage,
  QuestLine,
  QuestObjectiveType,
  TerrainDurabilityMaterial,
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
  spawnPoint: { x: number; y: number };
  source: GmMapDocument;
}

interface MapAuraPoint {
  x: number;
  y: number;
  value: number;
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
};

// 现有地图按区域主题与进度分配材质与品阶，统一走“品阶基础血量 × 材质倍率”。
const MAP_TERRAIN_DURABILITY_OVERRIDES: Partial<Record<string, Partial<Record<TileType, TerrainDurabilityProfile>>>> = {
  spawn: {
    [TileType.Wall]: { grade: 'mortal', material: 'stone' },
    [TileType.Tree]: { grade: 'mortal', material: 'wood' },
    [TileType.Stone]: { grade: 'mortal', material: 'stone' },
    [TileType.Door]: { grade: 'mortal', material: 'ironwood' },
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

@Injectable()
export class MapService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MapService.name);
  private maps: Map<string, MapData> = new Map();
  private quests: Map<string, QuestConfig> = new Map();
  private monsters: Map<string, MonsterSpawnConfig> = new Map();
  private revisions: Map<string, number> = new Map();
  private watchers: fs.FSWatcher[] = [];
  private mapsDir = resolveServerDataPath('maps');

  onModuleInit() {
    this.loadAllMaps();
    this.watchMaps();
  }

  onModuleDestroy() {
    for (const w of this.watchers) w.close();
    this.watchers = [];
  }

  private loadAllMaps() {
    const files = fs.readdirSync(this.mapsDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      this.loadMapFile(path.join(this.mapsDir, file));
    }
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
    const previousMap = this.maps.get(document.id);
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
          occupiedBy: isTileTypeWalkable(type) ? (previousMap?.tiles[y]?.[x]?.occupiedBy ?? null) : null,
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
        tile.type = TileType.Portal;
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

    const containers = this.normalizeContainers(document.landmarks, meta);
    const npcs = this.normalizeNpcs(document.npcs, meta);
    const monsterSpawns = this.normalizeMonsterSpawns(document.monsterSpawns, meta);

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
      spawnPoint: { ...document.spawnPoint },
      source: document,
    });
    this.revisions.set(document.id, (this.revisions.get(document.id) ?? 0) + 1);
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
      });
    }
    return result;
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

  getMapTimeConfig(mapId: string): MapTimeConfig {
    const source = this.maps.get(mapId)?.source.time;
    return source
      ? JSON.parse(JSON.stringify(source)) as MapTimeConfig
      : JSON.parse(JSON.stringify(DEFAULT_MAP_TIME_CONFIG)) as MapTimeConfig;
  }

  getMapRevision(mapId: string): number {
    return this.revisions.get(mapId) ?? 0;
  }

  private bumpMapRevision(mapId: string) {
    this.revisions.set(mapId, (this.revisions.get(mapId) ?? 0) + 1);
  }

  getSpawnPoint(mapId: string): { x: number; y: number } | undefined {
    return this.maps.get(mapId)?.spawnPoint;
  }

  getPortalAt(mapId: string, x: number, y: number): Portal | undefined {
    const map = this.maps.get(mapId);
    if (!map) return undefined;
    return map.portals.find(p => p.x === x && p.y === y);
  }

  getPortalNear(mapId: string, x: number, y: number, maxDistance = 1): Portal | undefined {
    const map = this.maps.get(mapId);
    if (!map) return undefined;
    return map.portals.find((portal) => manhattanDistance(portal, { x, y }) <= maxDistance);
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

  isWalkable(mapId: string, x: number, y: number): boolean {
    const tile = this.getTile(mapId, x, y);
    return tile !== null && tile.walkable && tile.occupiedBy === null && !this.hasNpcAt(mapId, x, y);
  }

  canOccupy(mapId: string, x: number, y: number, occupancyId?: string | null): boolean {
    const tile = this.getTile(mapId, x, y);
    if (!tile || !tile.walkable) return false;
    if (this.hasNpcAt(mapId, x, y)) return false;
    return tile.occupiedBy === null || tile.occupiedBy === occupancyId;
  }

  blocksSight(mapId: string, x: number, y: number): boolean {
    const tile = this.getTile(mapId, x, y);
    return tile === null ? true : tile.blocksSight;
  }

  getTraversalCost(mapId: string, x: number, y: number): number {
    const tile = this.getTile(mapId, x, y);
    if (!tile || !tile.walkable) return Number.POSITIVE_INFINITY;
    return getTileTraversalCost(tile.type);
  }

  setOccupied(mapId: string, x: number, y: number, playerId: string | null) {
    const tile = this.getTile(mapId, x, y);
    if (tile) tile.occupiedBy = playerId;
  }

  damageTile(mapId: string, x: number, y: number, damage: number): { destroyed: boolean; hp: number; maxHp: number } | null {
    const tile = this.getTile(mapId, x, y);
    if (!tile || !tile.maxHp || !tile.hp) return null;

    tile.hpVisible = true;
    tile.hp = Math.max(0, tile.hp - damage);
    tile.modifiedAt = Date.now();

    if (tile.hp <= 0) {
      const replacement = this.destroyedTileType(tile.type);
      tile.type = replacement;
      tile.walkable =
        replacement === TileType.Floor ||
        replacement === TileType.Road ||
        replacement === TileType.Trail ||
        replacement === TileType.Door ||
        replacement === TileType.Portal ||
        replacement === TileType.Grass ||
        replacement === TileType.Hill ||
        replacement === TileType.Mud ||
        replacement === TileType.Swamp;
      tile.blocksSight = doesTileTypeBlockSight(replacement);
      tile.hp = undefined;
      tile.maxHp = undefined;
      tile.hpVisible = false;
      this.bumpMapRevision(mapId);
      return { destroyed: true, hp: 0, maxHp: 0 };
    }

    return { destroyed: false, hp: tile.hp, maxHp: tile.maxHp };
  }

  findNearbyWalkable(mapId: string, x: number, y: number, maxRadius = 6): { x: number; y: number } | null {
    for (let radius = 0; radius <= maxRadius; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > radius) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (this.isWalkable(mapId, nx, ny)) {
            return { x: nx, y: ny };
          }
        }
      }
    }
    return null;
  }

  getViewTiles(mapId: string, cx: number, cy: number, radius = VIEW_RADIUS, visibleKeys?: Set<string>): VisibleTile[][] {
    const map = this.maps.get(mapId);
    if (!map) return [];
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
        row.push(map.tiles[wy]?.[wx] ?? {
          type: TileType.Wall,
          walkable: false,
          blocksSight: true,
          aura: 0,
          occupiedBy: null,
          modifiedAt: null,
        });
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
      scale: typeof candidate.scale === 'number' && Number.isFinite(candidate.scale) && candidate.scale > 0
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
    const rows = document.tiles.map((row) => [...row].map((char) => char === 'P' ? '.' : char));
    for (const portal of document.portals) {
      if (!rows[portal.y]?.[portal.x]) continue;
      rows[portal.y]![portal.x] = 'P';
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
          if (type === TileType.Portal) {
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
    if (!Number.isInteger(document.width) || document.width <= 0) return '地图宽度必须为正整数';
    if (!Number.isInteger(document.height) || document.height <= 0) return '地图高度必须为正整数';
    if (document.tiles.length !== document.height) return '地图行数必须与高度一致';

    const supportedChars = new Set(['#', '.', '=', ':', 'P', '+', ',', '^', ';', '%', '~', 'T', 'o']);
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
      case TileType.Wall:
      case TileType.Stone:
      case TileType.Door:
        return TileType.Floor;
      default:
        return type;
    }
  }

}

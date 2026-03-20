import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import {
  manhattanDistance,
  Tile,
  TileType,
  MapMeta,
  Portal,
  VIEW_RADIUS,
  ItemType,
  VisibleTile,
  getTileTraversalCost,
  PlayerRealmStage,
  QuestLine,
  QuestObjectiveType,
} from '@mud/shared';
import * as fs from 'fs';
import * as path from 'path';

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
  respawnTicks: number;
  level?: number;
  drops: DropConfig[];
}

interface MapData {
  meta: MapMeta;
  tiles: Tile[][];
  portals: Portal[];
  npcs: NpcConfig[];
  monsterSpawns: MonsterSpawnConfig[];
  spawnPoint: { x: number; y: number };
}

@Injectable()
export class MapService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MapService.name);
  private maps: Map<string, MapData> = new Map();
  private quests: Map<string, QuestConfig> = new Map();
  private monsters: Map<string, MonsterSpawnConfig> = new Map();
  private revisions: Map<string, number> = new Map();
  private watchers: fs.FSWatcher[] = [];
  private mapsDir = path.join(process.cwd(), 'data', 'maps');

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
    const legend: Record<string, TileType> = {
      '#': TileType.Wall,
      '.': TileType.Floor,
      'P': TileType.Portal,
      '+': TileType.Door,
      ',': TileType.Grass,
      '~': TileType.Water,
      'T': TileType.Tree,
      'o': TileType.Stone,
    };
    const tileRows: string[] = raw.tiles;
    const tiles: Tile[][] = tileRows.map(row =>
      [...row].map(ch => {
        const type = legend[ch] ?? TileType.Floor;
        const walkable = type === TileType.Floor || type === TileType.Grass || type === TileType.Door || type === TileType.Portal;
        const durability = this.tileDurability(type);
        return {
          type,
          walkable,
          blocksSight: this.tileBlocksSight(type),
          occupiedBy: null,
          modifiedAt: null,
          hp: durability > 0 ? durability : undefined,
          maxHp: durability > 0 ? durability : undefined,
          hpVisible: false,
        };
      }),
    );
    const meta: MapMeta = {
      id: raw.id,
      name: raw.name,
      width: raw.width,
      height: raw.height,
      dangerLevel: Number.isFinite(raw.dangerLevel) ? Number(raw.dangerLevel) : undefined,
      recommendedRealm: typeof raw.recommendedRealm === 'string' ? raw.recommendedRealm : undefined,
      description: typeof raw.description === 'string' ? raw.description : undefined,
    };
    const portals = this.normalizePortals(raw.portals, meta);

    // 确保配置的 portal 坐标在地图上是传送门类型，避免仅靠字符图导致漏配。
    for (const portal of portals) {
      const tile = tiles[portal.y]?.[portal.x];
      if (tile) {
        tile.type = TileType.Portal;
        tile.walkable = true;
        tile.blocksSight = false;
      }
    }

    const npcs = this.normalizeNpcs(raw.npcs, meta);
    const monsterSpawns = this.normalizeMonsterSpawns(raw.monsterSpawns, meta);

    for (const npc of npcs) {
      for (const quest of npc.quests) {
        this.quests.set(quest.id, quest);
      }
    }
    for (const monster of monsterSpawns) {
      this.monsters.set(monster.id, monster);
    }

    this.maps.set(raw.id, { meta, tiles, portals, npcs, monsterSpawns, spawnPoint: raw.spawnPoint });
    this.revisions.set(raw.id, (this.revisions.get(raw.id) ?? 0) + 1);
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
                ? PlayerRealmStage[parsedRealmStage]
                : rawQuest.title!;
        quests.push({
          id: rawQuest.id!,
          title: rawQuest.title!,
          desc: rawQuest.desc!,
          line: rawQuest.line === 'main' ? 'main' : 'side',
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
          count: Number.isInteger(drop.count) ? drop.count! : 1,
          chance: typeof drop.chance === 'number' ? drop.chance : 1,
        });
      }
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
        respawnTicks: Number.isInteger(spawn.respawnTicks)
          ? spawn.respawnTicks!
          : Math.max(1, (spawn as { respawnSec?: number }).respawnSec ?? 15),
        level: Number.isInteger((spawn as { level?: number }).level) ? (spawn as { level: number }).level : undefined,
        drops,
      });
    }
    return result;
  }

  getMapMeta(mapId: string): MapMeta | undefined {
    return this.maps.get(mapId)?.meta;
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
      tile.walkable = replacement === TileType.Floor || replacement === TileType.Grass || replacement === TileType.Door || replacement === TileType.Portal;
      tile.blocksSight = this.tileBlocksSight(replacement);
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

  private tileBlocksSight(type: TileType): boolean {
    return type === TileType.Wall || type === TileType.Tree || type === TileType.Stone;
  }

  private tileDurability(type: TileType): number {
    switch (type) {
      case TileType.Wall:
        return 48;
      case TileType.Tree:
        return 28;
      case TileType.Stone:
        return 36;
      case TileType.Door:
        return 20;
      default:
        return 0;
    }
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

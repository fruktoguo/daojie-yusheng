import { TileType } from './world-core-types';

/** 底层地形：描述 cell 本身的自然/基础地貌。 */
export enum TerrainType {
  Floor = 'floor',
  Grass = 'grass',
  Hill = 'hill',
  Cliff = 'cliff',
  Mud = 'mud',
  Swamp = 'swamp',
  ColdBog = 'cold_bog',
  MoltenPool = 'molten_pool',
  Water = 'water',
  Cloud = 'cloud',
  CloudFloor = 'cloud_floor',
  Void = 'void',
  StoneGround = 'stone_ground',
}

/** 可选地表铺装：道路、地板、回廊等覆盖在地形上。 */
export enum SurfaceType {
  Floor = 'floor',
  Road = 'road',
  Trail = 'trail',
  Veranda = 'veranda',
}

/** 地上结构：墙、门、窗、树、矿等占据结构层的对象。 */
export enum StructureType {
  Wall = 'wall',
  Door = 'door',
  Window = 'window',
  BrokenWindow = 'broken_window',
  HouseEave = 'house_eave',
  HouseCorner = 'house_corner',
  ScreenWall = 'screen_wall',
  Tree = 'tree',
  Bamboo = 'bamboo',
  Stone = 'stone',
  SpiritOre = 'spirit_ore',
  BlackIronOre = 'black_iron_ore',
  BrokenSwordHeap = 'broken_sword_heap',
}

/** 地上交互对象种类：对象层，不并入基础 tile 真源。 */
export enum InteractableKind {
  Portal = 'portal',
  Stairs = 'stairs',
  Container = 'container',
  Formation = 'formation',
  Mechanism = 'mechanism',
}

/** 由旧 TileType 编译出来的分层 seed。 */
export interface TileLayerSeed {
  terrain: TerrainType;
  surface: SurfaceType | null;
  structure: StructureType | null;
  interactables: readonly InteractableKind[];
  legacyTileType: TileType;
}

const EMPTY_INTERACTABLES: readonly InteractableKind[] = Object.freeze([]);

const TILE_LAYER_SEED_BY_TILE_TYPE: Record<TileType, TileLayerSeed> = {
  [TileType.Floor]: seed(TerrainType.Floor, SurfaceType.Floor, null, TileType.Floor),
  [TileType.Road]: seed(TerrainType.Grass, SurfaceType.Road, null, TileType.Road),
  [TileType.Trail]: seed(TerrainType.Grass, SurfaceType.Trail, null, TileType.Trail),
  [TileType.Wall]: seed(TerrainType.Floor, null, StructureType.Wall, TileType.Wall),
  [TileType.Door]: seed(TerrainType.Floor, null, StructureType.Door, TileType.Door),
  [TileType.Window]: seed(TerrainType.Floor, null, StructureType.Window, TileType.Window),
  [TileType.BrokenWindow]: seed(TerrainType.Floor, null, StructureType.BrokenWindow, TileType.BrokenWindow),
  [TileType.HouseEave]: seed(TerrainType.Floor, null, StructureType.HouseEave, TileType.HouseEave),
  [TileType.HouseCorner]: seed(TerrainType.Floor, null, StructureType.HouseCorner, TileType.HouseCorner),
  [TileType.ScreenWall]: seed(TerrainType.Floor, null, StructureType.ScreenWall, TileType.ScreenWall),
  [TileType.Veranda]: seed(TerrainType.Floor, SurfaceType.Veranda, null, TileType.Veranda),
  [TileType.Portal]: seed(TerrainType.Floor, SurfaceType.Floor, null, TileType.Portal, [InteractableKind.Portal]),
  [TileType.Stairs]: seed(TerrainType.Floor, SurfaceType.Floor, null, TileType.Stairs, [InteractableKind.Stairs]),
  [TileType.Grass]: seed(TerrainType.Grass, null, null, TileType.Grass),
  [TileType.Hill]: seed(TerrainType.Hill, null, null, TileType.Hill),
  [TileType.Cliff]: seed(TerrainType.Cliff, null, null, TileType.Cliff),
  [TileType.Mud]: seed(TerrainType.Mud, null, null, TileType.Mud),
  [TileType.Swamp]: seed(TerrainType.Swamp, null, null, TileType.Swamp),
  [TileType.ColdBog]: seed(TerrainType.ColdBog, null, null, TileType.ColdBog),
  [TileType.MoltenPool]: seed(TerrainType.MoltenPool, null, null, TileType.MoltenPool),
  [TileType.Water]: seed(TerrainType.Water, null, null, TileType.Water),
  [TileType.Cloud]: seed(TerrainType.Cloud, null, null, TileType.Cloud),
  [TileType.CloudFloor]: seed(TerrainType.CloudFloor, null, null, TileType.CloudFloor),
  [TileType.Void]: seed(TerrainType.Void, null, null, TileType.Void),
  [TileType.Tree]: seed(TerrainType.Grass, null, StructureType.Tree, TileType.Tree),
  [TileType.Bamboo]: seed(TerrainType.Grass, null, StructureType.Bamboo, TileType.Bamboo),
  [TileType.Stone]: seed(TerrainType.StoneGround, null, StructureType.Stone, TileType.Stone),
  [TileType.SpiritOre]: seed(TerrainType.StoneGround, null, StructureType.SpiritOre, TileType.SpiritOre),
  [TileType.BlackIronOre]: seed(TerrainType.StoneGround, null, StructureType.BlackIronOre, TileType.BlackIronOre),
  [TileType.BrokenSwordHeap]: seed(TerrainType.StoneGround, null, StructureType.BrokenSwordHeap, TileType.BrokenSwordHeap),
};

/** 旧 TileType -> 多层 seed，供现有二维字符串地图冷路径编译使用。 */
export function resolveTileLayerSeedFromTileType(tileType: TileType | string | null | undefined): TileLayerSeed {
  const normalized = normalizeLegacyTileType(tileType);
  return TILE_LAYER_SEED_BY_TILE_TYPE[normalized] ?? TILE_LAYER_SEED_BY_TILE_TYPE[TileType.Floor];
}

/** 旧二维地图缺少结构下方地面层；按周围可见地面推断墙/门/窗等结构的底层。 */
export function resolveTileLayerSeedFromTemplateContext(
  tileType: TileType | string | null | undefined,
  x: number,
  y: number,
  tileTypeAt: (x: number, y: number) => TileType | string | null | undefined,
): TileLayerSeed {
  const baseSeed = resolveTileLayerSeedFromTileType(tileType);
  if (!baseSeed.structure || baseSeed.terrain !== TerrainType.Floor || baseSeed.surface !== null) {
    return baseSeed;
  }
  const ground = inferGroundLayerFromNeighborTiles(x, y, tileTypeAt);
  if (!ground) {
    return baseSeed;
  }
  return {
    terrain: ground.terrain,
    surface: ground.surface,
    structure: baseSeed.structure,
    interactables: baseSeed.interactables,
    legacyTileType: baseSeed.legacyTileType,
  };
}

/** 多层状态 -> 兼容旧渲染和旧协议的 TileType。 */
export function composeTileTypeFromLayers(
  terrainInput: TerrainType | string | null | undefined,
  surfaceInput?: SurfaceType | string | null,
  structureInput?: StructureType | string | null,
  interactablesInput?: readonly (InteractableKind | string)[] | null,
): TileType {
  const structure = normalizeStructureType(structureInput);
  if (structure) {
    return tileTypeFromStructureType(structure);
  }
  const interactables = Array.isArray(interactablesInput) ? interactablesInput : EMPTY_INTERACTABLES;
  if (interactables.includes(InteractableKind.Portal)) {
    return TileType.Portal;
  }
  if (interactables.includes(InteractableKind.Stairs)) {
    return TileType.Stairs;
  }
  const surface = normalizeSurfaceType(surfaceInput);
  if (surface) {
    return tileTypeFromSurfaceType(surface);
  }
  return tileTypeFromTerrainType(normalizeTerrainType(terrainInput));
}

export function isTerrainTypeWalkable(terrainInput: TerrainType | string | null | undefined): boolean {
  const terrain = normalizeTerrainType(terrainInput);
  return terrain !== TerrainType.Cliff
    && terrain !== TerrainType.Water
    && terrain !== TerrainType.Cloud
    && terrain !== TerrainType.Void;
}

export function doesTerrainTypeBlockSight(terrainInput: TerrainType | string | null | undefined): boolean {
  const terrain = normalizeTerrainType(terrainInput);
  return terrain === TerrainType.Cliff || terrain === TerrainType.Cloud;
}

export function doesStructureTypeBlockMove(structureInput: StructureType | string | null | undefined): boolean {
  const structure = normalizeStructureType(structureInput);
  return structure !== null && structure !== StructureType.Door;
}

export function doesStructureTypeBlockSight(structureInput: StructureType | string | null | undefined): boolean {
  const structure = normalizeStructureType(structureInput);
  return structure === StructureType.Wall
    || structure === StructureType.HouseEave
    || structure === StructureType.HouseCorner
    || structure === StructureType.ScreenWall
    || structure === StructureType.Tree
    || structure === StructureType.Bamboo
    || structure === StructureType.Stone
    || structure === StructureType.SpiritOre
    || structure === StructureType.BlackIronOre
    || structure === StructureType.BrokenSwordHeap;
}

export function isStructureTypeDamageable(structureInput: StructureType | string | null | undefined): boolean {
  return normalizeStructureType(structureInput) !== null;
}

export function normalizeTerrainType(input: TerrainType | string | null | undefined): TerrainType {
  return typeof input === 'string' && terrainTypeSet.has(input as TerrainType)
    ? input as TerrainType
    : TerrainType.Floor;
}

export function normalizeSurfaceType(input: SurfaceType | string | null | undefined): SurfaceType | null {
  return typeof input === 'string' && surfaceTypeSet.has(input as SurfaceType)
    ? input as SurfaceType
    : null;
}

export function normalizeStructureType(input: StructureType | string | null | undefined): StructureType | null {
  return typeof input === 'string' && structureTypeSet.has(input as StructureType)
    ? input as StructureType
    : null;
}

function seed(
  terrain: TerrainType,
  surface: SurfaceType | null,
  structure: StructureType | null,
  legacyTileType: TileType,
  interactables: readonly InteractableKind[] = EMPTY_INTERACTABLES,
): TileLayerSeed {
  return Object.freeze({
    terrain,
    surface,
    structure,
    interactables: Object.freeze([...interactables]),
    legacyTileType,
  });
}

function normalizeLegacyTileType(tileType: TileType | string | null | undefined): TileType {
  return typeof tileType === 'string' && legacyTileTypeSet.has(tileType as TileType)
    ? tileType as TileType
    : TileType.Floor;
}

function inferGroundLayerFromNeighborTiles(
  originX: number,
  originY: number,
  tileTypeAt: (x: number, y: number) => TileType | string | null | undefined,
): { terrain: TerrainType; surface: SurfaceType | null } | null {
  const candidates = new Map<string, { terrain: TerrainType; surface: SurfaceType | null; score: number }>();
  for (let radius = 1; radius <= 3; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (dx === 0 && dy === 0) {
          continue;
        }
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) {
          continue;
        }
        const seed = resolveTileLayerSeedFromTileType(tileTypeAt(originX + dx, originY + dy));
        if (seed.structure || seed.interactables.length > 0) {
          continue;
        }
        const distance = Math.abs(dx) + Math.abs(dy);
        const cardinalBonus = dx === 0 || dy === 0 ? 4 : 2;
        const naturalGroundBonus = seed.terrain === TerrainType.Floor ? 0 : 3;
        const score = Math.max(1, 16 - radius * 3 - distance) + cardinalBonus + naturalGroundBonus;
        const key = `${seed.terrain}|${seed.surface ?? ''}`;
        const current = candidates.get(key);
        if (current) {
          current.score += score;
        } else {
          candidates.set(key, { terrain: seed.terrain, surface: seed.surface, score });
        }
      }
    }
    const best = selectBestGroundCandidate(candidates);
    if (best && (best.terrain !== TerrainType.Floor || best.surface !== null)) {
      return { terrain: best.terrain, surface: best.surface };
    }
  }
  return selectBestGroundCandidate(candidates);
}

function selectBestGroundCandidate(
  candidates: Map<string, { terrain: TerrainType; surface: SurfaceType | null; score: number }>,
): { terrain: TerrainType; surface: SurfaceType | null } | null {
  let best: { terrain: TerrainType; surface: SurfaceType | null; score: number } | null = null;
  for (const candidate of candidates.values()) {
    if (!best || candidate.score > best.score) {
      best = candidate;
      continue;
    }
    if (candidate.score === best.score && best.terrain === TerrainType.Floor && candidate.terrain !== TerrainType.Floor) {
      best = candidate;
    }
  }
  return best;
}

function tileTypeFromTerrainType(terrain: TerrainType): TileType {
  switch (terrain) {
    case TerrainType.Grass: return TileType.Grass;
    case TerrainType.Hill: return TileType.Hill;
    case TerrainType.Cliff: return TileType.Cliff;
    case TerrainType.Mud: return TileType.Mud;
    case TerrainType.Swamp: return TileType.Swamp;
    case TerrainType.ColdBog: return TileType.ColdBog;
    case TerrainType.MoltenPool: return TileType.MoltenPool;
    case TerrainType.Water: return TileType.Water;
    case TerrainType.Cloud: return TileType.Cloud;
    case TerrainType.CloudFloor: return TileType.CloudFloor;
    case TerrainType.Void: return TileType.Void;
    case TerrainType.StoneGround: return TileType.Stone;
    case TerrainType.Floor:
    default:
      return TileType.Floor;
  }
}

function tileTypeFromSurfaceType(surface: SurfaceType): TileType {
  switch (surface) {
    case SurfaceType.Road: return TileType.Road;
    case SurfaceType.Trail: return TileType.Trail;
    case SurfaceType.Veranda: return TileType.Veranda;
    case SurfaceType.Floor:
    default:
      return TileType.Floor;
  }
}

function tileTypeFromStructureType(structure: StructureType): TileType {
  switch (structure) {
    case StructureType.Door: return TileType.Door;
    case StructureType.Window: return TileType.Window;
    case StructureType.BrokenWindow: return TileType.BrokenWindow;
    case StructureType.HouseEave: return TileType.HouseEave;
    case StructureType.HouseCorner: return TileType.HouseCorner;
    case StructureType.ScreenWall: return TileType.ScreenWall;
    case StructureType.Tree: return TileType.Tree;
    case StructureType.Bamboo: return TileType.Bamboo;
    case StructureType.Stone: return TileType.Stone;
    case StructureType.SpiritOre: return TileType.SpiritOre;
    case StructureType.BlackIronOre: return TileType.BlackIronOre;
    case StructureType.BrokenSwordHeap: return TileType.BrokenSwordHeap;
    case StructureType.Wall:
    default:
      return TileType.Wall;
  }
}

const legacyTileTypeSet = new Set(Object.values(TileType));
const terrainTypeSet = new Set(Object.values(TerrainType));
const surfaceTypeSet = new Set(Object.values(SurfaceType));
const structureTypeSet = new Set(Object.values(StructureType));

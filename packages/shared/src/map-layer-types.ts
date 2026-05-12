import { TileType } from './world-core-types';
import { TILE_TRAVERSAL_COST } from './constants/gameplay/terrain';

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
  StoneStairs = 'stone_stairs',
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

const legacyTileTypeSet = new Set(Object.values(TileType));
const terrainTypeSet = new Set(Object.values(TerrainType));
const surfaceTypeSet = new Set(Object.values(SurfaceType));
const structureTypeSet = new Set(Object.values(StructureType));

/** 由旧 TileType 编译出来的分层 seed。 */
export interface TileLayerSeed {
  terrain: TerrainType;
  surface: SurfaceType | null;
  structure: StructureType | null;
  interactables: readonly InteractableKind[];
  legacyTileType: TileType;
}

export type CellLayerTarget = 'terrain' | 'surface' | 'structure' | 'interactable';

export interface TerrainDef {
  id: TerrainType;
  name: string;
  walkable: boolean;
  blocksSight: boolean;
  traversalCost: number;
  hpMultiplier: number;
  tags: readonly string[];
  color?: string;
  icon?: string;
}

export interface SurfaceDef {
  id: SurfaceType;
  name: string;
  traversalCost: number;
  comfort?: number;
  fengShuiTraits?: readonly string[];
  tags: readonly string[];
  color?: string;
  icon?: string;
}

export interface StructureDef {
  id: StructureType;
  name: string;
  blocksMove: boolean;
  blocksSight: boolean;
  roomBoundary: boolean;
  openingKind: 'none' | 'door' | 'window';
  damageable: boolean;
  hpMultiplier: number;
  tags: readonly string[];
  color?: string;
  icon?: string;
}

export interface LayerCatalogValidationResult {
  ok: boolean;
  errors: string[];
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
  [TileType.StoneStairs]: seed(TerrainType.StoneGround, SurfaceType.StoneStairs, null, TileType.StoneStairs),
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

export function getTerrainTypeTraversalCost(terrainInput: TerrainType | string | null | undefined): number {
  return TILE_TRAVERSAL_COST[tileTypeFromTerrainType(normalizeTerrainType(terrainInput))] ?? 400;
}

export function getSurfaceTypeTraversalCost(surfaceInput: SurfaceType | string | null | undefined): number | null {
  const surface = normalizeSurfaceType(surfaceInput);
  return surface ? TILE_TRAVERSAL_COST[tileTypeFromSurfaceType(surface)] ?? 400 : null;
}

export function getLayeredTileTraversalCost(
  terrainInput: TerrainType | string | null | undefined,
  surfaceInput?: SurfaceType | string | null,
): number {
  return getSurfaceTypeTraversalCost(surfaceInput) ?? getTerrainTypeTraversalCost(terrainInput);
}

export function doesTerrainTypeBlockSight(terrainInput: TerrainType | string | null | undefined): boolean {
  const terrain = normalizeTerrainType(terrainInput);
  return terrain === TerrainType.Cliff || terrain === TerrainType.Cloud;
}

export function validateLayerCatalog(
  terrainDefs: readonly TerrainDef[] = DEFAULT_TERRAIN_DEFS,
  surfaceDefs: readonly SurfaceDef[] = DEFAULT_SURFACE_DEFS,
  structureDefs: readonly StructureDef[] = DEFAULT_STRUCTURE_DEFS,
): LayerCatalogValidationResult {
  const errors: string[] = [];
  validateDefSet('terrain', terrainDefs, Object.values(TerrainType), errors);
  validateDefSet('surface', surfaceDefs, Object.values(SurfaceType), errors);
  validateDefSet('structure', structureDefs, Object.values(StructureType), errors);
  for (const def of terrainDefs) {
    if (!Number.isFinite(def.traversalCost) || def.traversalCost <= 0) errors.push(`terrain_invalid_traversal:${def.id}`);
    if (!Number.isFinite(def.hpMultiplier) || def.hpMultiplier < 0) errors.push(`terrain_invalid_hp_multiplier:${def.id}`);
  }
  for (const def of surfaceDefs) {
    if (!Number.isFinite(def.traversalCost) || def.traversalCost <= 0) errors.push(`surface_invalid_traversal:${def.id}`);
  }
  for (const def of structureDefs) {
    if (!Number.isFinite(def.hpMultiplier) || def.hpMultiplier < 0) errors.push(`structure_invalid_hp_multiplier:${def.id}`);
    if (!['none', 'door', 'window'].includes(def.openingKind)) errors.push(`structure_invalid_opening:${def.id}`);
  }
  return { ok: errors.length === 0, errors };
}

export function resolvePlacementLayerTarget(layer: string | null | undefined): CellLayerTarget {
  switch (layer) {
    case 'structure':
      return 'structure';
    case 'floor':
      return 'surface';
    case 'facility':
    case 'furniture':
    case 'decoration':
      return 'interactable';
    default:
      throw new Error(`building_placement_layer_target_invalid:${String(layer)}`);
  }
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

export type StructureDurabilityMaterial =
  | 'wood'
  | 'bamboo'
  | 'ironwood'
  | 'stone'
  | 'spiritOre'
  | 'blackIronOre'
  | 'brokenSwordHeap';

export interface StructureDamageDropEntry {
  itemId: string;
  count: number;
  chanceBps?: number;
}

export interface StructureDurabilityProfile {
  material: StructureDurabilityMaterial;
  multiplier: number;
  damageDrops?: readonly StructureDamageDropEntry[];
  destroyDrops?: readonly StructureDamageDropEntry[];
  miningLevel?: number;
}

export const STRUCTURE_DURABILITY_PROFILE_BY_TYPE: Partial<Record<StructureType, StructureDurabilityProfile>> = {
  [StructureType.Wall]: { material: 'stone', multiplier: 50 },
  [StructureType.Tree]: { material: 'wood', multiplier: 10 },
  [StructureType.Bamboo]: { material: 'bamboo', multiplier: 8 },
  [StructureType.Stone]: { material: 'stone', multiplier: 50 },
  [StructureType.SpiritOre]: {
    material: 'spiritOre',
    multiplier: 10000,
    miningLevel: 20,
    damageDrops: [{ itemId: 'spirit_stone', count: 1, chanceBps: 20 }],
    destroyDrops: [{ itemId: 'spirit_stone', count: 1 }],
  },
  [StructureType.BlackIronOre]: {
    material: 'blackIronOre',
    multiplier: 2000,
    miningLevel: 11,
    damageDrops: [{ itemId: 'black_iron_chunk', count: 1, chanceBps: 50 }],
    destroyDrops: [{ itemId: 'black_iron_chunk', count: 1 }],
  },
  [StructureType.BrokenSwordHeap]: {
    material: 'brokenSwordHeap',
    multiplier: 2,
    damageDrops: [{ itemId: 'sword_pellet', count: 1, chanceBps: 1200 }],
    destroyDrops: [{ itemId: 'sword_pellet', count: 1 }],
  },
  [StructureType.Door]: { material: 'ironwood', multiplier: 14 },
  [StructureType.Window]: { material: 'wood', multiplier: 10 },
};

export function getStructureDurabilityProfile(
  structureInput: StructureType | string | null | undefined,
): StructureDurabilityProfile | null {
  const structure = normalizeStructureType(structureInput);
  return structure ? STRUCTURE_DURABILITY_PROFILE_BY_TYPE[structure] ?? null : null;
}

export function isStructureTypeOre(structureInput: StructureType | string | null | undefined): boolean {
  const profile = getStructureDurabilityProfile(structureInput);
  return Number.isFinite(profile?.miningLevel) && Number(profile?.miningLevel) > 0;
}

export function getStructureOreLevel(structureInput: StructureType | string | null | undefined): number | null {
  const profile = getStructureDurabilityProfile(structureInput);
  return Number.isFinite(profile?.miningLevel) && Number(profile?.miningLevel) > 0
    ? Math.max(1, Math.trunc(Number(profile?.miningLevel)))
    : null;
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
    case SurfaceType.StoneStairs: return TileType.StoneStairs;
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

const terrainHpMultiplierByType: Readonly<Partial<Record<TerrainType, number>>> = Object.freeze({
  [TerrainType.Cliff]: 50,
  [TerrainType.Cloud]: 3,
});

const surfaceComfortByType: Readonly<Partial<Record<SurfaceType, number>>> = Object.freeze({
  [SurfaceType.Floor]: 1,
  [SurfaceType.Road]: 0,
  [SurfaceType.Trail]: 0,
  [SurfaceType.Veranda]: 1,
  [SurfaceType.StoneStairs]: 0,
});

function resolveTerrainTags(terrain: TerrainType): string[] {
  const tags = ['terrain'];
  if (isTerrainTypeWalkable(terrain)) tags.push('walkable');
  if (doesTerrainTypeBlockSight(terrain)) tags.push('blocks_sight');
  if (terrain === TerrainType.Water) tags.push('water');
  if (terrain === TerrainType.Mud || terrain === TerrainType.Swamp || terrain === TerrainType.ColdBog) tags.push('wet');
  if (terrain === TerrainType.MoltenPool) tags.push('hot');
  if (terrain === TerrainType.ColdBog) tags.push('cold');
  if (terrain === TerrainType.StoneGround || terrain === TerrainType.Cliff) tags.push('stone');
  return tags;
}

function resolveSurfaceTags(surface: SurfaceType): string[] {
  const tags = ['surface'];
  if (surface === SurfaceType.Road || surface === SurfaceType.Trail) tags.push('path');
  if (surface === SurfaceType.Floor || surface === SurfaceType.Veranda) tags.push('floor');
  if (surface === SurfaceType.StoneStairs) tags.push('stairs', 'stone');
  return tags;
}

function resolveSurfaceFengShuiTraits(surface: SurfaceType): string[] {
  if (surface === SurfaceType.Floor || surface === SurfaceType.Veranda) {
    return ['surface.floor'];
  }
  if (surface === SurfaceType.StoneStairs) {
    return ['surface.stone'];
  }
  return [];
}

function isStructureRoomBoundary(structure: StructureType): boolean {
  return structure === StructureType.Wall
    || structure === StructureType.Door
    || structure === StructureType.Window
    || structure === StructureType.BrokenWindow
    || structure === StructureType.HouseEave
    || structure === StructureType.HouseCorner
    || structure === StructureType.ScreenWall;
}

function resolveStructureOpeningKind(structure: StructureType): 'none' | 'door' | 'window' {
  if (structure === StructureType.Door) return 'door';
  if (structure === StructureType.Window || structure === StructureType.BrokenWindow) return 'window';
  return 'none';
}

function resolveStructureTags(
  structure: StructureType,
  profile: StructureDurabilityProfile | null,
): string[] {
  const tags = ['structure'];
  if (doesStructureTypeBlockMove(structure)) tags.push('blocks_move');
  if (doesStructureTypeBlockSight(structure)) tags.push('blocks_sight');
  if (isStructureRoomBoundary(structure)) tags.push('room_boundary');
  if (profile?.material) tags.push(`material.${profile.material}`);
  if (Number.isFinite(profile?.miningLevel) && Number(profile?.miningLevel) > 0) tags.push('ore', 'minable');
  return tags;
}

function validateDefSet<T extends string>(
  kind: string,
  defs: readonly { id: T; name: string; tags: readonly string[] }[],
  expectedIds: readonly T[],
  errors: string[],
): void {
  const seen = new Set<string>();
  for (const def of defs) {
    if (!def || typeof def.id !== 'string' || !expectedIds.includes(def.id)) {
      errors.push(`${kind}_invalid_id:${String(def?.id)}`);
      continue;
    }
    if (seen.has(def.id)) {
      errors.push(`${kind}_duplicate:${def.id}`);
      continue;
    }
    seen.add(def.id);
    if (typeof def.name !== 'string' || def.name.trim().length === 0) errors.push(`${kind}_missing_name:${def.id}`);
    if (!Array.isArray(def.tags)) errors.push(`${kind}_invalid_tags:${def.id}`);
  }
  for (const id of expectedIds) {
    if (!seen.has(id)) errors.push(`${kind}_missing:${id}`);
  }
}

function buildDefaultTerrainDefs(): readonly TerrainDef[] {
  return Object.freeze(
    Object.values(TerrainType).map((id) => Object.freeze({
      id,
      name: id,
      walkable: isTerrainTypeWalkable(id),
      blocksSight: doesTerrainTypeBlockSight(id),
      traversalCost: getTerrainTypeTraversalCost(id),
      hpMultiplier: terrainHpMultiplierByType[id] ?? 0,
      tags: Object.freeze(resolveTerrainTags(id)),
    })),
  );
}

function buildDefaultSurfaceDefs(): readonly SurfaceDef[] {
  return Object.freeze(
    Object.values(SurfaceType).map((id) => Object.freeze({
      id,
      name: id,
      traversalCost: getSurfaceTypeTraversalCost(id) ?? 400,
      comfort: surfaceComfortByType[id] ?? 0,
      fengShuiTraits: Object.freeze(resolveSurfaceFengShuiTraits(id)),
      tags: Object.freeze(resolveSurfaceTags(id)),
    })),
  );
}

function buildDefaultStructureDefs(): readonly StructureDef[] {
  return Object.freeze(
    Object.values(StructureType).map((id) => {
      const profile = getStructureDurabilityProfile(id);
      return Object.freeze({
        id,
        name: id,
        blocksMove: doesStructureTypeBlockMove(id),
        blocksSight: doesStructureTypeBlockSight(id),
        roomBoundary: isStructureRoomBoundary(id),
        openingKind: resolveStructureOpeningKind(id),
        damageable: isStructureTypeDamageable(id),
        hpMultiplier: profile?.multiplier ?? 0,
        tags: Object.freeze(resolveStructureTags(id, profile)),
      });
    }),
  );
}

export const DEFAULT_TERRAIN_DEFS: readonly TerrainDef[] = buildDefaultTerrainDefs();

export const DEFAULT_SURFACE_DEFS: readonly SurfaceDef[] = buildDefaultSurfaceDefs();

export const DEFAULT_STRUCTURE_DEFS: readonly StructureDef[] = buildDefaultStructureDefs();

export const TERRAIN_DEF_BY_ID: Readonly<Record<TerrainType, TerrainDef>> = Object.freeze(
  Object.fromEntries(DEFAULT_TERRAIN_DEFS.map((entry) => [entry.id, entry])) as Record<TerrainType, TerrainDef>,
);

export const SURFACE_DEF_BY_ID: Readonly<Record<SurfaceType, SurfaceDef>> = Object.freeze(
  Object.fromEntries(DEFAULT_SURFACE_DEFS.map((entry) => [entry.id, entry])) as Record<SurfaceType, SurfaceDef>,
);

export const STRUCTURE_DEF_BY_ID: Readonly<Record<StructureType, StructureDef>> = Object.freeze(
  Object.fromEntries(DEFAULT_STRUCTURE_DEFS.map((entry) => [entry.id, entry])) as Record<StructureType, StructureDef>,
);

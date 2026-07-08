/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 秘境随机地形生成器：地块生成档案目录。
 *
 * 默认档案完全派生自 shared 分层真源（枚举、字符映射、可走性规则），
 * 保证生成结果与运行时加载口径一致；配置可追加/覆盖档案实现动态扩展。
 */
import { TerrainType, SurfaceType, StructureType, isTerrainTypeWalkable, doesStructureTypeBlockMove } from '../map-layer-types';
import {
  TERRAIN_TYPE_TO_CHAR,
  SURFACE_TYPE_TO_CHAR,
  STRUCTURE_TYPE_TO_CHAR,
  TERRAIN_CHAR_TO_TYPE,
  SURFACE_CHAR_TO_TYPE,
  STRUCTURE_CHAR_TO_TYPE,
} from '../constants/gameplay/map-layer-chars';
import type { ProcgenTileDef, ProcgenLayer } from './procgen-types';

const TERRAIN_NAME_AND_COLOR: Record<TerrainType, [string, string]> = {
  [TerrainType.Floor]: ['平地', '#b8a888'],
  [TerrainType.Grass]: ['草地', '#6fa858'],
  [TerrainType.Hill]: ['山丘', '#96885f'],
  [TerrainType.Cliff]: ['峭壁', '#5c5248'],
  [TerrainType.Mud]: ['泥地', '#8a6f4d'],
  [TerrainType.Swamp]: ['沼泽', '#5d7a52'],
  [TerrainType.ColdBog]: ['寒潭', '#5b7f8f'],
  [TerrainType.MoltenPool]: ['熔岩', '#c9502e'],
  [TerrainType.Water]: ['水域', '#3f6f9e'],
  [TerrainType.Cloud]: ['云海', '#c8d3e0'],
  [TerrainType.CloudFloor]: ['霞台', '#e0d5e8'],
  [TerrainType.Void]: ['虚空', '#1d1a26'],
};

const SURFACE_NAME_AND_COLOR: Record<SurfaceType, [string, string]> = {
  [SurfaceType.Floor]: ['石板', '#c2b49a'],
  [SurfaceType.Road]: ['大路', '#c9b78a'],
  [SurfaceType.Trail]: ['小径', '#b39b6f'],
  [SurfaceType.Veranda]: ['回廊', '#a58a66'],
  [SurfaceType.StoneStairs]: ['石阶', '#9b968c'],
};

const STRUCTURE_NAME_AND_COLOR: Record<StructureType, [string, string]> = {
  [StructureType.Wall]: ['墙', '#6b6258'],
  [StructureType.Door]: ['门', '#8a5f3a'],
  [StructureType.Window]: ['窗', '#7d7266'],
  [StructureType.HouseEave]: ['屋檐', '#74604a'],
  [StructureType.HouseCorner]: ['檐角', '#6d5a45'],
  [StructureType.ScreenWall]: ['影壁', '#7a6f5f'],
  [StructureType.Tree]: ['树木', '#3e6b34'],
  [StructureType.Bamboo]: ['翠竹', '#4f8a3d'],
  [StructureType.Stone]: ['岩石', '#8c8578'],
  [StructureType.SpiritOre]: ['灵矿', '#6fc7c0'],
  [StructureType.BlackIronOre]: ['玄铁矿', '#4a4f5c'],
  [StructureType.BrokenSwordHeap]: ['断剑堆', '#9a8f9e'],
};

function buildDefaultDefs(): ProcgenTileDef[] {
  const defs: ProcgenTileDef[] = [];
  for (const terrain of Object.values(TerrainType)) {
    const [name, color] = TERRAIN_NAME_AND_COLOR[terrain];
    defs.push({
      id: terrain,
      layer: 'terrain',
      name,
      char: TERRAIN_TYPE_TO_CHAR.get(terrain) ?? '地',
      color,
      walkable: isTerrainTypeWalkable(terrain),
    });
  }
  for (const surface of Object.values(SurfaceType)) {
    const [name, color] = SURFACE_NAME_AND_COLOR[surface];
    defs.push({
      id: surface,
      layer: 'surface',
      name,
      char: SURFACE_TYPE_TO_CHAR.get(surface) ?? '路',
      color,
    });
  }
  for (const structure of Object.values(StructureType)) {
    const [name, color] = STRUCTURE_NAME_AND_COLOR[structure];
    defs.push({
      id: structure,
      layer: 'structure',
      name,
      char: STRUCTURE_TYPE_TO_CHAR.get(structure) ?? '石',
      color,
      blocksMove: doesStructureTypeBlockMove(structure),
    });
  }
  return defs;
}

/** 已索引好的地块目录，生成器各阶段共用。 */
export interface ProcgenTileCatalog {
  list: readonly ProcgenTileDef[];
  /** key: `${layer}:${id}` */
  byLayerAndId: ReadonlyMap<string, ProcgenTileDef>;
}

/**
 * 构建地块目录：默认档案 + 自定义档案（同 layer+id 覆盖默认，未知 id 追加）。
 * 自定义档案是"配置文件扩展新地块"的入口。
 */
export function buildProcgenTileCatalog(customTiles?: readonly ProcgenTileDef[]): ProcgenTileCatalog {
  const byLayerAndId = new Map<string, ProcgenTileDef>();
  for (const def of buildDefaultDefs()) {
    byLayerAndId.set(`${def.layer}:${def.id}`, def);
  }
  for (const def of customTiles ?? []) {
    byLayerAndId.set(`${def.layer}:${def.id}`, def);
  }
  return { list: Array.from(byLayerAndId.values()), byLayerAndId };
}

/** 查地块档案；缺失时抛错（配置错误应在生成前暴露，不静默兜底）。 */
export function requireProcgenTile(catalog: ProcgenTileCatalog, layer: ProcgenLayer, id: string): ProcgenTileDef {
  const def = catalog.byLayerAndId.get(`${layer}:${id}`);
  if (!def) {
    throw new Error(`procgen_tile_missing:${layer}:${id}`);
  }
  return def;
}

/**
 * 找出未在 shared 运行时字符表注册的地块（`${layer}:${id}:${char}`）。
 * 这些字符写入 format:2 后会被运行时解码静默回退（terrain→floor、structure→无），
 * 生成器默认拒绝它们，仅允许在显式声明"仅预览"时使用。
 */
export function findUnregisteredTileChars(catalog: ProcgenTileCatalog): string[] {
  const registries: Record<ProcgenLayer, ReadonlyMap<string, unknown>> = {
    terrain: TERRAIN_CHAR_TO_TYPE,
    surface: SURFACE_CHAR_TO_TYPE,
    structure: STRUCTURE_CHAR_TO_TYPE,
  };
  return catalog.list
    .filter((def) => !registries[def.layer].has(def.char))
    .map((def) => `${def.layer}:${def.id}:${def.char}`);
}

/** 校验目录：同层字符唯一、字符为单个字素、terrain 层必须声明 walkable。 */
export function validateProcgenTileCatalog(catalog: ProcgenTileCatalog): string[] {
  const errors: string[] = [];
  const charsByLayer = new Map<string, Map<string, string>>();
  for (const def of catalog.list) {
    if (!def.id || !def.char) {
      errors.push(`procgen_tile_invalid:${def.layer}:${def.id}`);
      continue;
    }
    if (Array.from(def.char).length !== 1 || def.char === '.') {
      errors.push(`procgen_tile_char_invalid:${def.layer}:${def.id}:${def.char}`);
    }
    if (def.layer === 'terrain' && typeof def.walkable !== 'boolean') {
      errors.push(`procgen_tile_walkable_missing:${def.id}`);
    }
    const layerChars = charsByLayer.get(def.layer) ?? new Map<string, string>();
    const existing = layerChars.get(def.char);
    if (existing && existing !== def.id) {
      errors.push(`procgen_tile_char_conflict:${def.layer}:${def.char}:${existing}/${def.id}`);
    }
    layerChars.set(def.char, def.id);
    charsByLayer.set(def.layer, layerChars);
  }
  return errors;
}

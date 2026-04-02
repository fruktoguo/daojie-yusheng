import { TileType } from '../../types';

/**
 * 房屋装饰地块定义。
 *
 * 说明：
 * - 这组地块专门服务于房屋轮廓收口与院落装饰，不与通用自然地形混放。
 * - 其余字符映射、标签、渲染配色与小地图颜色都从这里派生，避免多处散写。
 */

export type HouseDecorTileDefinition = {
  type: TileType;
  mapChar: string;
  label: string;
  walkable: boolean;
  blocksSight: boolean;
  traversalCost: number;
  bgColor: string;
  glyph: string;
  glyphColor: string;
  minimapColor: string;
};

export type HouseDecorTileType =
  | TileType.HouseEave
  | TileType.HouseCorner
  | TileType.ScreenWall
  | TileType.Veranda;

export const HOUSE_DECOR_TILE_DEFINITIONS: readonly HouseDecorTileDefinition[] = [
  {
    type: TileType.HouseEave,
    mapChar: '檐',
    label: '屋檐',
    walkable: false,
    blocksSight: true,
    traversalCost: 400,
    bgColor: '#6a5546',
    glyph: '檐',
    glyphColor: '#f2dfbf',
    minimapColor: '#5b483b',
  },
  {
    type: TileType.HouseCorner,
    mapChar: '角',
    label: '屋角',
    walkable: false,
    blocksSight: true,
    traversalCost: 400,
    bgColor: '#5e493d',
    glyph: '角',
    glyphColor: '#edd8b8',
    minimapColor: '#513f34',
  },
  {
    type: TileType.ScreenWall,
    mapChar: '壁',
    label: '影壁',
    walkable: false,
    blocksSight: true,
    traversalCost: 400,
    bgColor: '#857665',
    glyph: '壁',
    glyphColor: '#f1e7d4',
    minimapColor: '#706251',
  },
  {
    type: TileType.Veranda,
    mapChar: '廊',
    label: '回廊',
    walkable: true,
    blocksSight: false,
    traversalCost: 90,
    bgColor: '#b39a79',
    glyph: '廊',
    glyphColor: '#fff1d8',
    minimapColor: '#9b825f',
  },
] as const;

export const HOUSE_DECOR_TILE_TYPE_TO_MAP_CHAR = Object.fromEntries(
  HOUSE_DECOR_TILE_DEFINITIONS.map((entry) => [entry.type, entry.mapChar]),
) as Record<HouseDecorTileType, string>;

export const HOUSE_DECOR_TILE_LABELS = Object.fromEntries(
  HOUSE_DECOR_TILE_DEFINITIONS.map((entry) => [entry.type, entry.label]),
) as Record<HouseDecorTileType, string>;

export const HOUSE_DECOR_TILE_TRAVERSAL_COST = Object.fromEntries(
  HOUSE_DECOR_TILE_DEFINITIONS.map((entry) => [entry.type, entry.traversalCost]),
) as Record<HouseDecorTileType, number>;

export const HOUSE_DECOR_TILE_BG_COLORS = Object.fromEntries(
  HOUSE_DECOR_TILE_DEFINITIONS.map((entry) => [entry.type, entry.bgColor]),
) as Record<HouseDecorTileType, string>;

export const HOUSE_DECOR_TILE_GLYPHS = Object.fromEntries(
  HOUSE_DECOR_TILE_DEFINITIONS.map((entry) => [entry.type, entry.glyph]),
) as Record<HouseDecorTileType, string>;

export const HOUSE_DECOR_TILE_GLYPH_COLORS = Object.fromEntries(
  HOUSE_DECOR_TILE_DEFINITIONS.map((entry) => [entry.type, entry.glyphColor]),
) as Record<HouseDecorTileType, string>;

export const HOUSE_DECOR_TILE_MINIMAP_COLORS = Object.fromEntries(
  HOUSE_DECOR_TILE_DEFINITIONS.map((entry) => [entry.type, entry.minimapColor]),
) as Record<HouseDecorTileType, string>;

export const HOUSE_DECOR_TILE_MAP_CHARS = new Set(
  HOUSE_DECOR_TILE_DEFINITIONS.map((entry) => entry.mapChar),
);

export const HOUSE_DECOR_WALKABLE_TILE_TYPES = new Set(
  HOUSE_DECOR_TILE_DEFINITIONS.filter((entry) => entry.walkable).map((entry) => entry.type),
);

export const HOUSE_DECOR_BLOCK_SIGHT_TILE_TYPES = new Set(
  HOUSE_DECOR_TILE_DEFINITIONS.filter((entry) => entry.blocksSight).map((entry) => entry.type),
);

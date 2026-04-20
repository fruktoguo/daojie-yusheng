import { TileType } from '../../types';

/**
 * 房屋装饰地块定义。
 *
 * 说明：
 * - 这组地块专门服务于房屋轮廓收口与院落装饰，不与通用自然地形混放。
 * - 其余字符映射、标签、渲染配色与小地图颜色都从这里派生，避免多处散写。
 */

export type HouseDecorTileDefinition = {
/**
 * type：对象字段。
 */

  type: TileType;  
  /**
 * mapChar：对象字段。
 */

  mapChar: string;  
  /**
 * label：对象字段。
 */

  label: string;  
  /**
 * walkable：对象字段。
 */

  walkable: boolean;  
  /**
 * blocksSight：对象字段。
 */

  blocksSight: boolean;  
  /**
 * traversalCost：对象字段。
 */

  traversalCost: number;  
  /**
 * bgColor：对象字段。
 */

  bgColor: string;  
  /**
 * glyph：对象字段。
 */

  glyph: string;  
  /**
 * glyphColor：对象字段。
 */

  glyphColor: string;  
  /**
 * minimapColor：对象字段。
 */

  minimapColor: string;
};

/** export ：共享数据结构定义。 */
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

/** HOUSE_DECOR_TILE_TYPE_TO_MAP_CHAR：HOUSE DECOR地块类型TO地图CHAR。 */
export const HOUSE_DECOR_TILE_TYPE_TO_MAP_CHAR = Object.fromEntries(
  HOUSE_DECOR_TILE_DEFINITIONS.map((entry) => [entry.type, entry.mapChar]),
) as Record<HouseDecorTileType, string>;

/** HOUSE_DECOR_TILE_LABELS：HOUSE DECOR地块标签。 */
export const HOUSE_DECOR_TILE_LABELS = Object.fromEntries(
  HOUSE_DECOR_TILE_DEFINITIONS.map((entry) => [entry.type, entry.label]),
) as Record<HouseDecorTileType, string>;

/** HOUSE_DECOR_TILE_TRAVERSAL_COST：HOUSE DECOR地块TRAVERSAL COST。 */
export const HOUSE_DECOR_TILE_TRAVERSAL_COST = Object.fromEntries(
  HOUSE_DECOR_TILE_DEFINITIONS.map((entry) => [entry.type, entry.traversalCost]),
) as Record<HouseDecorTileType, number>;

/** HOUSE_DECOR_TILE_BG_COLORS：HOUSE DECOR地块BG颜色。 */
export const HOUSE_DECOR_TILE_BG_COLORS = Object.fromEntries(
  HOUSE_DECOR_TILE_DEFINITIONS.map((entry) => [entry.type, entry.bgColor]),
) as Record<HouseDecorTileType, string>;

/** HOUSE_DECOR_TILE_GLYPHS：HOUSE DECOR地块GLYPHS。 */
export const HOUSE_DECOR_TILE_GLYPHS = Object.fromEntries(
  HOUSE_DECOR_TILE_DEFINITIONS.map((entry) => [entry.type, entry.glyph]),
) as Record<HouseDecorTileType, string>;

/** HOUSE_DECOR_TILE_GLYPH_COLORS：HOUSE DECOR地块GLYPH颜色。 */
export const HOUSE_DECOR_TILE_GLYPH_COLORS = Object.fromEntries(
  HOUSE_DECOR_TILE_DEFINITIONS.map((entry) => [entry.type, entry.glyphColor]),
) as Record<HouseDecorTileType, string>;

/** HOUSE_DECOR_TILE_MINIMAP_COLORS：HOUSE DECOR地块小地图颜色。 */
export const HOUSE_DECOR_TILE_MINIMAP_COLORS = Object.fromEntries(
  HOUSE_DECOR_TILE_DEFINITIONS.map((entry) => [entry.type, entry.minimapColor]),
) as Record<HouseDecorTileType, string>;

/** HOUSE_DECOR_TILE_MAP_CHARS：HOUSE DECOR地块地图CHARS集合。 */
export const HOUSE_DECOR_TILE_MAP_CHARS = new Set(
  HOUSE_DECOR_TILE_DEFINITIONS.map((entry) => entry.mapChar),
);

/** HOUSE_DECOR_WALKABLE_TILE_TYPES：HOUSE DECOR WALKABLE地块类型集合。 */
export const HOUSE_DECOR_WALKABLE_TILE_TYPES = new Set(
  HOUSE_DECOR_TILE_DEFINITIONS.filter((entry) => entry.walkable).map((entry) => entry.type),
);

/** HOUSE_DECOR_BLOCK_SIGHT_TILE_TYPES：HOUSE DECOR BLOCK SIGHT地块类型集合。 */
export const HOUSE_DECOR_BLOCK_SIGHT_TILE_TYPES = new Set(
  HOUSE_DECOR_TILE_DEFINITIONS.filter((entry) => entry.blocksSight).map((entry) => entry.type),
);







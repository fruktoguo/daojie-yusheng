/**
 * 地图与可破坏地形常量。
 */

import { TileType, type TerrainDurabilityMaterial } from '@mud/shared';

/** 地形耐久配置。 */
export type TerrainDurabilityProfile = {
/** material：定义该变量以承载业务值。 */
  material: TerrainDurabilityMaterial;
/** multiplier：定义该变量以承载业务值。 */
  multiplier: number;
};

/** durability：定义该变量以承载业务值。 */
const durability = (material: TerrainDurabilityMaterial, multiplier: number): TerrainDurabilityProfile => ({
  material,
  multiplier,
});

/** 地形耐久预设 ID。 */
export type TerrainDurabilityProfileId =
  | 'mortal_settlement'
  | 'yellow_frontier'
  | 'yellow_bamboo'
  | 'mystic_black_iron'
  | 'mystic_rune_ruins'
  | 'earth_stone_wild'
  | 'earth_sky_metal';

/** 各类地块的默认耐久材质。 */
export const DEFAULT_TERRAIN_DURABILITY_BY_TILE: Partial<Record<TileType, TerrainDurabilityProfile>> = {
  [TileType.Wall]: durability('stone', 50),
  [TileType.Cloud]: durability('vine', 3),
  [TileType.Tree]: durability('wood', 10),
  [TileType.Bamboo]: durability('bamboo', 8),
  [TileType.Cliff]: durability('stone', 50),
  [TileType.Stone]: durability('stone', 50),
  [TileType.SpiritOre]: durability('spiritOre', 100000),
  [TileType.BlackIronOre]: durability('blackIronOre', 2000),
  [TileType.BrokenSwordHeap]: durability('brokenSwordHeap', 2),
  [TileType.Door]: durability('ironwood', 14),
  [TileType.Window]: durability('wood', 10),
  [TileType.HouseEave]: durability('ironwood', 14),
  [TileType.HouseCorner]: durability('ironwood', 14),
  [TileType.ScreenWall]: durability('stone', 50),
  [TileType.Veranda]: durability('wood', 10),
};

/** 不同地形主题的耐久预设。 */
export const TERRAIN_DURABILITY_PROFILES: Record<TerrainDurabilityProfileId, Partial<Record<TileType, TerrainDurabilityProfile>>> = {
  mortal_settlement: {
    [TileType.Wall]: durability('stone', 50),
    [TileType.Tree]: durability('wood', 10),
    [TileType.Cliff]: durability('stone', 50),
    [TileType.Stone]: durability('stone', 50),
    [TileType.SpiritOre]: durability('spiritOre', 100000),
    [TileType.BlackIronOre]: durability('blackIronOre', 2000),
    [TileType.Door]: durability('ironwood', 14),
    [TileType.Window]: durability('wood', 10),
    [TileType.HouseEave]: durability('ironwood', 14),
    [TileType.HouseCorner]: durability('ironwood', 14),
    [TileType.ScreenWall]: durability('stone', 50),
    [TileType.Veranda]: durability('wood', 10),
  },
  yellow_frontier: {
    [TileType.Wall]: durability('stone', 50),
    [TileType.Tree]: durability('wood', 10),
    [TileType.Bamboo]: durability('bamboo', 8),
    [TileType.Cliff]: durability('stone', 50),
    [TileType.Stone]: durability('stone', 50),
    [TileType.SpiritOre]: durability('spiritOre', 100000),
    [TileType.BlackIronOre]: durability('blackIronOre', 2000),
  },
  yellow_bamboo: {
    [TileType.Wall]: durability('stone', 50),
    [TileType.Tree]: durability('bamboo', 8),
    [TileType.Bamboo]: durability('bamboo', 8),
    [TileType.Cliff]: durability('stone', 50),
    [TileType.Stone]: durability('stone', 50),
    [TileType.SpiritOre]: durability('spiritOre', 100000),
    [TileType.BlackIronOre]: durability('blackIronOre', 2000),
    [TileType.Door]: durability('wood', 10),
  },
  mystic_black_iron: {
    [TileType.Wall]: durability('blackIron', 120),
    [TileType.Cliff]: durability('blackIron', 120),
    [TileType.Stone]: durability('blackIron', 120),
    [TileType.SpiritOre]: durability('spiritOre', 100000),
    [TileType.BlackIronOre]: durability('blackIronOre', 2000),
    [TileType.Door]: durability('ironwood', 14),
  },
  mystic_rune_ruins: {
    [TileType.Wall]: durability('runeStone', 70),
    [TileType.Tree]: durability('spiritWood', 18),
    [TileType.Bamboo]: durability('spiritWood', 18),
    [TileType.Cliff]: durability('runeStone', 70),
    [TileType.Stone]: durability('runeStone', 70),
    [TileType.SpiritOre]: durability('spiritOre', 100000),
    [TileType.BlackIronOre]: durability('blackIronOre', 2000),
    [TileType.Door]: durability('ironwood', 14),
  },
  earth_stone_wild: {
    [TileType.Wall]: durability('stone', 50),
    [TileType.Tree]: durability('spiritWood', 18),
    [TileType.Bamboo]: durability('spiritWood', 18),
    [TileType.Cliff]: durability('stone', 50),
    [TileType.Stone]: durability('stone', 50),
    [TileType.SpiritOre]: durability('spiritOre', 100000),
    [TileType.BlackIronOre]: durability('blackIronOre', 2000),
  },
  earth_sky_metal: {
    [TileType.Wall]: durability('skyMetal', 160),
    [TileType.Cloud]: durability('vine', 3),
    [TileType.Tree]: durability('spiritWood', 18),
    [TileType.Bamboo]: durability('spiritWood', 18),
    [TileType.Cliff]: durability('skyMetal', 160),
    [TileType.Stone]: durability('skyMetal', 160),
    [TileType.SpiritOre]: durability('spiritOre', 100000),
    [TileType.BlackIronOre]: durability('blackIronOre', 2000),
    [TileType.Door]: durability('metal', 100),
  },
};

/** 特殊地形的恢复速度倍率，越高表示复原越快。 */
export const SPECIAL_TILE_RESTORE_SPEED_MULTIPLIERS: Partial<Record<TileType, number>> = {
  [TileType.Cloud]: 100,
};

/** 旧地图 ID 到地形耐久预设 ID 的兼容映射。 */
export const LEGACY_MAP_TERRAIN_PROFILE_IDS: Partial<Record<string, TerrainDurabilityProfileId>> = {
  spawn: 'mortal_settlement',
  yunlai_town: 'mortal_settlement',
  wildlands: 'yellow_frontier',
  bamboo_forest: 'yellow_bamboo',
  black_iron_mine: 'mystic_black_iron',
  ancient_ruins: 'mystic_rune_ruins',
  spirit_ridge: 'earth_stone_wild',
  beast_valley: 'earth_stone_wild',
  sky_ruins: 'earth_sky_metal',
};


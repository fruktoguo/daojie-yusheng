/**
 * 地图与可破坏地形常量。
 */

import { TileType, type TechniqueGrade, type TerrainDurabilityMaterial } from '@mud/shared';

/** 地形耐久配置。 */
export type TerrainDurabilityProfile = {
  grade: TechniqueGrade;
  material: TerrainDurabilityMaterial;
};

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
  [TileType.Wall]: { grade: 'mortal', material: 'stone' },
  [TileType.Tree]: { grade: 'mortal', material: 'wood' },
  [TileType.Stone]: { grade: 'mortal', material: 'stone' },
  [TileType.SpiritOre]: { grade: 'mortal', material: 'stone' },
  [TileType.Door]: { grade: 'mortal', material: 'ironwood' },
  [TileType.Window]: { grade: 'mortal', material: 'wood' },
};

/** 不同地形主题的耐久预设。 */
export const TERRAIN_DURABILITY_PROFILES: Record<TerrainDurabilityProfileId, Partial<Record<TileType, TerrainDurabilityProfile>>> = {
  mortal_settlement: {
    [TileType.Wall]: { grade: 'mortal', material: 'stone' },
    [TileType.Tree]: { grade: 'mortal', material: 'wood' },
    [TileType.Stone]: { grade: 'mortal', material: 'stone' },
    [TileType.SpiritOre]: { grade: 'mortal', material: 'stone' },
    [TileType.Door]: { grade: 'mortal', material: 'ironwood' },
    [TileType.Window]: { grade: 'mortal', material: 'wood' },
  },
  yellow_frontier: {
    [TileType.Wall]: { grade: 'yellow', material: 'stone' },
    [TileType.Tree]: { grade: 'mortal', material: 'wood' },
    [TileType.Stone]: { grade: 'yellow', material: 'stone' },
    [TileType.SpiritOre]: { grade: 'yellow', material: 'stone' },
  },
  yellow_bamboo: {
    [TileType.Wall]: { grade: 'yellow', material: 'stone' },
    [TileType.Tree]: { grade: 'yellow', material: 'bamboo' },
    [TileType.Stone]: { grade: 'yellow', material: 'stone' },
    [TileType.SpiritOre]: { grade: 'yellow', material: 'stone' },
    [TileType.Door]: { grade: 'mortal', material: 'wood' },
  },
  mystic_black_iron: {
    [TileType.Wall]: { grade: 'mystic', material: 'blackIron' },
    [TileType.Stone]: { grade: 'mystic', material: 'blackIron' },
    [TileType.SpiritOre]: { grade: 'mystic', material: 'blackIron' },
    [TileType.Door]: { grade: 'yellow', material: 'ironwood' },
  },
  mystic_rune_ruins: {
    [TileType.Wall]: { grade: 'mystic', material: 'runeStone' },
    [TileType.Tree]: { grade: 'yellow', material: 'spiritWood' },
    [TileType.Stone]: { grade: 'mystic', material: 'runeStone' },
    [TileType.SpiritOre]: { grade: 'mystic', material: 'runeStone' },
    [TileType.Door]: { grade: 'yellow', material: 'ironwood' },
  },
  earth_stone_wild: {
    [TileType.Wall]: { grade: 'earth', material: 'stone' },
    [TileType.Tree]: { grade: 'mystic', material: 'spiritWood' },
    [TileType.Stone]: { grade: 'earth', material: 'stone' },
    [TileType.SpiritOre]: { grade: 'earth', material: 'stone' },
  },
  earth_sky_metal: {
    [TileType.Wall]: { grade: 'earth', material: 'skyMetal' },
    [TileType.Tree]: { grade: 'mystic', material: 'spiritWood' },
    [TileType.Stone]: { grade: 'earth', material: 'skyMetal' },
    [TileType.SpiritOre]: { grade: 'earth', material: 'skyMetal' },
    [TileType.Door]: { grade: 'mystic', material: 'metal' },
  },
};

/** 特殊地形的耐久倍率。 */
export const SPECIAL_TILE_DURABILITY_MULTIPLIERS: Partial<Record<TileType, number>> = {
  [TileType.SpiritOre]: 1000,
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

import { TileType } from '../../types';
import type { MapMinimapMarkerKind } from '../../types';
import { HOUSE_DECOR_TILE_MINIMAP_COLORS } from '../gameplay/house-terrain';

/**
 * 小地图渲染视觉常量。
 */

/** 小地图地形颜色映射。 */
export const TILE_MINIMAP_COLORS: Record<TileType, string> = {
  [TileType.Floor]: '#bdb6aa',
  [TileType.Road]: '#b58f63',
  [TileType.Trail]: '#97714a',
  [TileType.Wall]: '#2d2a28',
  [TileType.Door]: '#8b6c47',
  [TileType.Window]: '#7ba3ba',
  [TileType.BrokenWindow]: '#8f969a',
  [TileType.Portal]: '#69458f',
  [TileType.Stairs]: '#9b7438',
  [TileType.Grass]: '#79915d',
  [TileType.Hill]: '#8c7358',
  [TileType.Cliff]: '#514842',
  [TileType.Mud]: '#6e5740',
  [TileType.Swamp]: '#526243',
  [TileType.ColdBog]: '#587789',
  [TileType.MoltenPool]: '#8c4022',
  [TileType.Water]: '#4f7696',
  [TileType.Cloud]: '#c6d3e5',
  [TileType.CloudFloor]: '#e3ebf7',
  [TileType.Void]: '#1b213e',
  [TileType.Tree]: '#365133',
  [TileType.Bamboo]: '#2f6b37',
  [TileType.Stone]: '#605c58',
  [TileType.SpiritOre]: '#5675a5',
  [TileType.BlackIronOre]: '#6a7486',
  [TileType.BrokenSwordHeap]: '#7b6557',
  ...HOUSE_DECOR_TILE_MINIMAP_COLORS,
};

/** 小地图标记颜色映射。 */
export const MINIMAP_MARKER_COLORS: Record<MapMinimapMarkerKind, string> = {
  landmark: '#f0d38a',
  container: '#d7a35c',
  npc: '#7ad9e8',
  monster_spawn: '#ff7a6b',
  portal: '#b48cff',
  stairs: '#ffd38c',
};

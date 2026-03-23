import { TileType } from '../../types';

/**
 * 地形文字渲染视觉常量。
 */

/** 地形底色映射。 */
export const TILE_VISUAL_BG_COLORS: Record<TileType, string> = {
  [TileType.Floor]: '#ddd8cf',
  [TileType.Road]: '#cdb89c',
  [TileType.Trail]: '#b4946f',
  [TileType.Wall]: '#3e3a35',
  [TileType.Door]: '#8b7355',
  [TileType.Window]: '#8bb6cf',
  [TileType.BrokenWindow]: '#9aa7b0',
  [TileType.Portal]: '#5c3d7a',
  [TileType.Stairs]: '#7f5a34',
  [TileType.Grass]: '#b8c98b',
  [TileType.Hill]: '#b7a17f',
  [TileType.Mud]: '#8b6a4c',
  [TileType.Swamp]: '#556b3f',
  [TileType.Water]: '#6e9ab8',
  [TileType.Tree]: '#4d6b3a',
  [TileType.Stone]: '#7a7570',
};

/** 地形字符映射。 */
export const TILE_VISUAL_GLYPHS: Record<TileType, string> = {
  [TileType.Floor]: '·',
  [TileType.Road]: '路',
  [TileType.Trail]: '径',
  [TileType.Wall]: '▓',
  [TileType.Door]: '门',
  [TileType.Window]: '窗',
  [TileType.BrokenWindow]: '裂',
  [TileType.Portal]: '阵',
  [TileType.Stairs]: '阶',
  [TileType.Grass]: '草',
  [TileType.Hill]: '坡',
  [TileType.Mud]: '泥',
  [TileType.Swamp]: '沼',
  [TileType.Water]: '水',
  [TileType.Tree]: '木',
  [TileType.Stone]: '石',
};

/** 地形字符颜色映射。 */
export const TILE_VISUAL_GLYPH_COLORS: Record<TileType, string> = {
  [TileType.Floor]: 'rgba(0,0,0,0.15)',
  [TileType.Road]: 'rgba(90,55,24,0.35)',
  [TileType.Trail]: 'rgba(84,52,28,0.42)',
  [TileType.Wall]: 'rgba(255,255,255,0.2)',
  [TileType.Door]: '#f0e0c0',
  [TileType.Window]: '#e6f8ff',
  [TileType.BrokenWindow]: '#d8dde2',
  [TileType.Portal]: '#d0b0f0',
  [TileType.Stairs]: '#f3d19c',
  [TileType.Grass]: 'rgba(50,80,30,0.35)',
  [TileType.Hill]: 'rgba(92,60,32,0.36)',
  [TileType.Mud]: 'rgba(250,240,220,0.34)',
  [TileType.Swamp]: 'rgba(220,240,180,0.4)',
  [TileType.Water]: 'rgba(30,50,80,0.4)',
  [TileType.Tree]: 'rgba(20,40,15,0.5)',
  [TileType.Stone]: 'rgba(40,35,30,0.35)',
};

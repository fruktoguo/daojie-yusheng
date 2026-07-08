/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 秘境随机地形生成器：内置地貌预设。
 *
 * 这些预设既是可直接使用的秘境地貌，也是配置格式的示例真源；
 * 新地貌 = 新增一份 ProcgenBiomePreset 配置，不需要改生成器代码。
 */
import type { ProcgenBiomePreset } from './procgen-types';

/** 幽篁竹海：溪流切割的竹林谷地，竹丛成片、林间有小径。 */
export const PROCGEN_PRESET_BAMBOO_VALLEY: ProcgenBiomePreset = {
  id: 'bamboo_valley',
  name: '幽篁竹海',
  description: '溪流蜿蜒的竹林谷地，竹丛与乔木成片，小径连接各处。',
  size: { width: [56, 72], height: [44, 60] },
  baseTerrain: 'grass',
  border: { tile: 'cliff', thickness: [2, 4] },
  fields: {
    elevation: { scale: 18, octaves: 4, persistence: 0.5, warp: 0.35 },
    moisture: { scale: 24, octaves: 3, persistence: 0.55 },
  },
  terrainRules: [
    { tile: 'water', when: { elevation: [0, 0.26] } },
    { tile: 'swamp', when: { elevation: [0.26, 0.33], moisture: [0.55, 1] } },
    { tile: 'mud', when: { elevation: [0.33, 0.55], moisture: [0.78, 1] } },
    { tile: 'hill', when: { elevation: [0.72, 0.86] } },
    { tile: 'cliff', when: { elevation: [0.86, 1] } },
  ],
  smoothing: { iterations: 2 },
  structures: [
    { tile: 'bamboo', on: ['grass'], clusters: { count: [10, 16], size: [8, 20] }, density: 0.012, keepClearOfSpawn: 2 },
    { tile: 'tree', on: ['grass', 'mud'], density: 0.02, minSpacing: 3, keepClearOfSpawn: 2 },
    { tile: 'stone', on: ['grass', 'mud'], density: 0.008, minSpacing: 5 },
  ],
  paths: { tile: 'trail', extraPoiCount: [2, 4], wobble: 0.5 },
  connectivity: { mode: 'carve', carveTile: 'grass' },
  exitPortalCount: 2,
  walkableRatioRange: [0.45, 0.92],
};

/** 灵矿裂谷：峭壁纵横的矿脉裂谷，灵矿与玄铁沿崖壁生长。 */
export const PROCGEN_PRESET_SPIRIT_RAVINE: ProcgenBiomePreset = {
  id: 'spirit_ravine',
  name: '灵矿裂谷',
  description: '峭壁切割的裂谷，矿脉沿崖壁分布，谷底通道曲折。',
  size: { width: [52, 68], height: [44, 60] },
  baseTerrain: 'floor',
  border: { tile: 'cliff', thickness: [2, 5] },
  fields: {
    elevation: { scale: 14, octaves: 4, persistence: 0.52, warp: 0.5 },
    moisture: { scale: 20, octaves: 3, persistence: 0.5 },
  },
  terrainRules: [
    { tile: 'cliff', when: { elevation: [0.62, 1] } },
    { tile: 'hill', when: { elevation: [0.52, 0.62] } },
    { tile: 'water', when: { elevation: [0, 0.1], moisture: [0.6, 1] } },
    { tile: 'mud', when: { elevation: [0, 0.38], moisture: [0.72, 1] } },
  ],
  smoothing: { iterations: 2 },
  structures: [
    { tile: 'spirit_ore', on: ['floor', 'hill'], clusters: { count: [6, 10], size: [3, 7] }, nearTiles: { tiles: ['cliff'], radius: 2 }, keepClearOfSpawn: 3 },
    { tile: 'black_iron_ore', on: ['floor', 'hill'], clusters: { count: [4, 8], size: [3, 6] }, nearTiles: { tiles: ['cliff'], radius: 2 }, keepClearOfSpawn: 3 },
    { tile: 'stone', on: ['floor', 'hill'], density: 0.012, minSpacing: 4 },
  ],
  paths: { tile: 'trail', extraPoiCount: [2, 3], wobble: 0.35 },
  connectivity: { mode: 'carve', carveTile: 'floor' },
  exitPortalCount: 2,
  walkableRatioRange: [0.3, 0.8],
};

/** 熔岩地窟：熔池遍布的地下洞窟，玄铁与断剑残骸散落其间。 */
export const PROCGEN_PRESET_MOLTEN_CAVERN: ProcgenBiomePreset = {
  id: 'molten_cavern',
  name: '熔岩地窟',
  description: '熔池与岩壁交错的地窟，热流之间只留下曲折可行的岩道。',
  size: { width: [48, 64], height: [40, 56] },
  baseTerrain: 'floor',
  border: { tile: 'cliff', thickness: [2, 4] },
  fields: {
    elevation: { scale: 13, octaves: 4, persistence: 0.5, warp: 0.45 },
    moisture: { scale: 16, octaves: 3, persistence: 0.5 },
  },
  terrainRules: [
    { tile: 'molten_pool', when: { elevation: [0, 0.24] } },
    { tile: 'cliff', when: { elevation: [0.7, 1] } },
    { tile: 'hill', when: { elevation: [0.6, 0.7] } },
    { tile: 'mud', when: { elevation: [0.24, 0.46], moisture: [0.78, 1] } },
  ],
  smoothing: { iterations: 2 },
  structures: [
    { tile: 'stone', on: ['floor', 'hill'], clusters: { count: [8, 12], size: [4, 9] }, keepClearOfSpawn: 2 },
    { tile: 'black_iron_ore', on: ['floor', 'hill'], clusters: { count: [5, 9], size: [3, 6] }, nearTiles: { tiles: ['cliff'], radius: 2 }, keepClearOfSpawn: 3 },
    { tile: 'broken_sword_heap', on: ['floor'], density: 0.004, minSpacing: 8 },
  ],
  paths: { tile: 'trail', extraPoiCount: [1, 3], wobble: 0.4 },
  connectivity: { mode: 'carve', carveTile: 'floor' },
  exitPortalCount: 1,
  walkableRatioRange: [0.32, 0.85],
};

/** 寒泽迷沼：寒潭与泥沼交错的湿地，可走地带被水域撕成迷宫。 */
export const PROCGEN_PRESET_COLD_MARSH: ProcgenBiomePreset = {
  id: 'cold_marsh',
  name: '寒泽迷沼',
  description: '寒潭、泥沼与水域交错的湿地迷宫，出口藏在沼泽深处。',
  size: { width: [56, 72], height: [48, 64] },
  baseTerrain: 'swamp',
  border: { tile: 'water', thickness: [2, 5] },
  fields: {
    elevation: { scale: 16, octaves: 4, persistence: 0.55, warp: 0.4 },
    moisture: { scale: 22, octaves: 3, persistence: 0.5 },
  },
  terrainRules: [
    { tile: 'water', when: { elevation: [0, 0.3] } },
    { tile: 'cold_bog', when: { elevation: [0.3, 0.55], moisture: [0.65, 1] } },
    { tile: 'mud', when: { elevation: [0.3, 0.6], moisture: [0, 0.35] } },
    { tile: 'grass', when: { elevation: [0.6, 0.8] } },
    { tile: 'hill', when: { elevation: [0.8, 1] } },
  ],
  smoothing: { iterations: 2 },
  structures: [
    { tile: 'tree', on: ['grass', 'swamp'], density: 0.02, minSpacing: 2, keepClearOfSpawn: 2 },
    { tile: 'stone', on: ['grass', 'mud'], density: 0.006, minSpacing: 6 },
  ],
  paths: { tile: 'trail', extraPoiCount: [1, 3], wobble: 0.7 },
  connectivity: { mode: 'carve', carveTile: 'mud', fillThreshold: 10 },
  exitPortalCount: 2,
  walkableRatioRange: [0.4, 0.9],
};

/** 内置预设清单（demo 与后续秘境模板选择用）。 */
export const PROCGEN_BUILTIN_PRESETS: readonly ProcgenBiomePreset[] = [
  PROCGEN_PRESET_BAMBOO_VALLEY,
  PROCGEN_PRESET_SPIRIT_RAVINE,
  PROCGEN_PRESET_MOLTEN_CAVERN,
  PROCGEN_PRESET_COLD_MARSH,
];

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
import type { ProcgenBiomePreset, ProcgenRealmPalette } from './procgen-types';
import { buildRealmSkeleton } from './procgen-realm-skeleton';

/**
 * 五主题秘境调色板：每个主题只需一份地块映射，buildRealmSkeleton 即可展开成
 * 全套分区骨架（迷宫/地牢/宝库/boss/城镇/走廊）。主题差异只在此调色板 + 可选 tuning，
 * 不再逐主题手写 regionGen。所有 id 均已在默认地块目录注册且落在正确的层。
 */
const PALETTES = {
  // 幽篁竹海：山崖竹林——竹丛作柱、青草通道、崖壁成墙。
  bamboo_valley: {
    wallTile: 'wall', doorTile: 'door', roomFloorTile: 'floor', pillarTile: 'bamboo',
    mountainTerrain: 'cliff', mazeWallTerrain: 'cliff', mazeFloorTile: 'grass', mazeSlopeTile: 'hill',
    townGroundTile: 'grass', townStreetTile: 'trail', townFloorTile: 'floor', windowTile: 'window',
    corridorFloorTile: 'grass',
  },
  // 灵矿裂谷：峭壁矿脉——石柱、石板通道、崖壁成墙。
  spirit_ravine: {
    wallTile: 'wall', doorTile: 'door', roomFloorTile: 'floor', pillarTile: 'stone',
    mountainTerrain: 'cliff', mazeWallTerrain: 'cliff', mazeFloorTile: 'floor', mazeSlopeTile: 'hill',
    townGroundTile: 'floor', townStreetTile: 'trail', townFloorTile: 'floor', windowTile: 'window',
    corridorFloorTile: 'floor',
  },
  // 熔岩地窟：地下岩道——石柱、石板通道、崖壁成墙。
  molten_cavern: {
    wallTile: 'wall', doorTile: 'door', roomFloorTile: 'floor', pillarTile: 'stone',
    mountainTerrain: 'cliff', mazeWallTerrain: 'cliff', mazeFloorTile: 'floor', mazeSlopeTile: 'hill',
    townGroundTile: 'floor', townStreetTile: 'trail', townFloorTile: 'floor', windowTile: 'window',
    corridorFloorTile: 'floor',
  },
  // 寒泽迷沼：水泽湿地——迷宫墙用水道（water），通道走青草，走廊踏泥地。
  cold_marsh: {
    wallTile: 'wall', doorTile: 'door', roomFloorTile: 'floor', pillarTile: 'stone',
    mountainTerrain: 'cliff', mazeWallTerrain: 'water', mazeFloorTile: 'grass', mazeSlopeTile: 'hill',
    townGroundTile: 'grass', townStreetTile: 'trail', townFloorTile: 'floor', windowTile: 'window',
    corridorFloorTile: 'mud',
  },
  // 九幽秘境：连绵山体——照搬原九幽 cliff 山体系，逐字等价替换手写 regionGen。
  abyss: {
    wallTile: 'wall', doorTile: 'door', roomFloorTile: 'floor', pillarTile: 'stone',
    mountainTerrain: 'cliff', mazeWallTerrain: 'cliff', mazeFloorTile: 'grass', mazeSlopeTile: 'hill',
    townGroundTile: 'grass', townStreetTile: 'trail', townFloorTile: 'floor', windowTile: 'window',
    corridorFloorTile: 'floor',
  },
} satisfies Record<string, ProcgenRealmPalette>;

/** 幽篁竹海：溪流切割的竹林谷地，竹丛成片、林间有小径。 */
export const PROCGEN_PRESET_BAMBOO_VALLEY: ProcgenBiomePreset = {
  id: 'bamboo_valley',
  name: '幽篁竹海',
  description: '溪流蜿蜒的竹林谷地，竹丛与乔木成片，小径连接各处；分区拼装出竹楼村镇、崖壁迷宫与石室地牢。',
  size: { width: [104, 128], height: [104, 128] },
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
  connectivity: { mode: 'fill', carveTile: 'grass', fillThreshold: 8 },
  exitPortalCount: 1,
  walkableRatioRange: [0.12, 0.92],
  // 分区拼装骨架：open 区继续用上面的竹林噪声地貌，结构区按调色板换成竹海皮肤。
  ...buildRealmSkeleton(PALETTES.bamboo_valley),
};

/** 灵矿裂谷：峭壁纵横的矿脉裂谷，灵矿与玄铁沿崖壁生长。 */
export const PROCGEN_PRESET_SPIRIT_RAVINE: ProcgenBiomePreset = {
  id: 'spirit_ravine',
  name: '灵矿裂谷',
  description: '峭壁切割的裂谷，矿脉沿崖壁分布，谷底通道曲折；分区拼装出矿工聚落、崖壁迷宫与藏宝石室。',
  size: { width: [104, 128], height: [104, 128] },
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
  connectivity: { mode: 'fill', carveTile: 'floor', fillThreshold: 8 },
  exitPortalCount: 1,
  walkableRatioRange: [0.12, 0.8],
  // 分区拼装骨架：open 区继续用上面的裂谷矿脉地貌，结构区按调色板换成裂谷皮肤。
  ...buildRealmSkeleton(PALETTES.spirit_ravine),
};

/** 熔岩地窟：熔池遍布的地下洞窟，玄铁与断剑残骸散落其间。 */
export const PROCGEN_PRESET_MOLTEN_CAVERN: ProcgenBiomePreset = {
  id: 'molten_cavern',
  name: '熔岩地窟',
  description: '熔池与岩壁交错的地窟，热流之间只留下曲折可行的岩道；分区拼装出稀疏据点、岩道迷宫与密布地牢。',
  size: { width: [104, 128], height: [104, 128] },
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
  connectivity: { mode: 'fill', carveTile: 'floor', fillThreshold: 8 },
  exitPortalCount: 1,
  walkableRatioRange: [0.12, 0.85],
  // 地窟聚落偏少、地牢偏多：town 保持点缀、dungeon 权重提高（自由池加权配额）。
  ...buildRealmSkeleton(PALETTES.molten_cavern, { kindMix: { open: 3, town: 1, maze: 2, dungeon: 3 } }),
};

/** 寒泽迷沼：寒潭与泥沼交错的湿地，可走地带被水域撕成迷宫。 */
export const PROCGEN_PRESET_COLD_MARSH: ProcgenBiomePreset = {
  id: 'cold_marsh',
  name: '寒泽迷沼',
  description: '寒潭、泥沼与水域交错的湿地迷宫，出口藏在沼泽深处；分区拼装出沼畔村落、水道迷宫与泥泞地牢。',
  size: { width: [104, 128], height: [104, 128] },
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
  connectivity: { mode: 'fill', carveTile: 'swamp', fillThreshold: 8 },
  exitPortalCount: 1,
  walkableRatioRange: [0.12, 0.9],
  // 分区拼装骨架：open 区继续用上面的湿地地貌，迷宫墙用水道（water）贴合水泽主题。
  ...buildRealmSkeleton(PALETTES.cold_marsh),
};

/**
 * 九幽秘境：分区拼装示例预设。
 *
 * 外围开放地貌、中层迷宫、深处地牢，尽头是 boss 房，旁支挂上锁的宝库，间或点缀城镇聚落。
 * 区数随面积增长（N = clamp(round(area/1600), 2, 24)），完整骨架需要约 128² 的地板。
 * connectivity 必须是 fill —— 分区的连通性由预留门位构造保证，不允许事后全图凿穿墙体。
 */
export const PROCGEN_PRESET_ABYSS_REALM: ProcgenBiomePreset = {
  id: 'abyss_realm',
  name: '九幽秘境',
  description: '分区拼装：外围荒原、中层迷宫、深处地牢，尽头 boss 房，旁支藏上锁宝库。',
  size: { width: [108, 132], height: [108, 132] },
  baseTerrain: 'floor',
  border: { tile: 'cliff', thickness: [2, 3] },
  fields: {
    elevation: { scale: 14, octaves: 3, persistence: 0.5, warp: 0.3 },
    moisture: { scale: 20, octaves: 3, persistence: 0.5 },
  },
  terrainRules: [
    { tile: 'mud', when: { elevation: [0, 0.3] } },
    { tile: 'grass', when: { elevation: [0.3, 0.75] } },
    { tile: 'hill', when: { elevation: [0.75, 1] } },
  ],
  smoothing: { iterations: 2 },
  structures: [
    { tile: 'tree', on: ['grass'], density: 0.03, minSpacing: 2 },
    { tile: 'stone', on: ['grass', 'mud', 'hill'], density: 0.012, minSpacing: 3 },
  ],
  connectivity: { mode: 'fill', carveTile: 'floor', fillThreshold: 8 },
  exitPortalCount: 1,
  walkableRatioRange: [0.12, 0.8],
  // 分区骨架照搬 cliff 山体系：迷宫/地牢/宝库/boss/走廊与原手写值逐字等价，
  // 额外新增主题化城镇与 kind 配额（默认 open:3/town:1/maze:2/dungeon:2）——
  // 九幽此后也长出城镇，且 maze/dungeon/vault/boss 骨架不回归。
  // combat/branch/lock 数量默认即 [2,3]/[1,2]/[1,2]，与原 topology 一致，无需再传。
  ...buildRealmSkeleton(PALETTES.abyss),
};

/** 内置预设清单（demo 与后续秘境模板选择用）。 */
export const PROCGEN_BUILTIN_PRESETS: readonly ProcgenBiomePreset[] = [
  PROCGEN_PRESET_BAMBOO_VALLEY,
  PROCGEN_PRESET_SPIRIT_RAVINE,
  PROCGEN_PRESET_MOLTEN_CAVERN,
  PROCGEN_PRESET_COLD_MARSH,
  PROCGEN_PRESET_ABYSS_REALM,
];

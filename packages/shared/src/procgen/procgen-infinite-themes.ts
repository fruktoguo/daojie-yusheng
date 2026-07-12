/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 无限世界五主题：每套 = 自然地貌 biome + 装饰散点 scatter + 结构镶嵌 structures。
 *
 * 五主题共享同一套流式生成器与结构镶嵌器，差异只在这份配置：biome 阈值决定地貌配比
 *（草原/水乡/山崖各有侧重）、scatter 决定散生植被矿脉、structures 决定聚落/地牢/小屋的
 * 密度与配比。所有地块 id 都取自分区 demo 已验证有贴图的集合，切主题即换皮、无需改代码。
 */
import type { InfiniteWorldSpec } from './procgen-chunk';

/** 幽篁竹海：草原竹林、溪流点缀，聚落繁荣（城镇多、地牢少）。 */
const BAMBOO_VALLEY: InfiniteWorldSpec = {
  seed: 'infinite',
  chunkSize: 48,
  elevation: { scale: 42, octaves: 4, persistence: 0.5, warp: 0.4 },
  moisture: { scale: 34, octaves: 3, persistence: 0.5, warp: 0.3 },
  contrast: 2.4,
  baseTerrain: 'grass',
  biomes: [
    { tile: 'water', elevation: [0, 0.28] },
    { tile: 'mud', elevation: [0.28, 0.34] },
    { tile: 'cliff', elevation: [0.82, 1] },
    { tile: 'hill', elevation: [0.68, 0.82] },
    { tile: 'swamp', elevation: [0.34, 0.68], moisture: [0.70, 1] },
  ],
  smoothIterations: 2,
  scatter: [
    { tile: 'tree', density: 0.05, onTerrain: ['grass'] },
    { tile: 'bamboo', density: 0.10, onTerrain: ['swamp'] },
    { tile: 'stone', density: 0.03, onTerrain: ['hill'] },
  ],
  structures: {
    gridSize: 40,
    density: 0.55,
    palette: {
      wallTile: 'wall', doorTile: 'door', windowTile: 'window',
      floorTile: 'floor', groundTile: 'floor', streetTile: 'trail',
    },
    townWeight: 3, dungeonWeight: 1, roomWeight: 2,
    townRadius: [7, 11], townHouses: [4, 7], dungeonRooms: [3, 4], windowChance: 0.35,
  },
};

/** 灵矿裂谷：丘陵峭壁、矿脉纵横，矿洞遍布（地牢多、聚落少）。 */
const SPIRIT_RAVINE: InfiniteWorldSpec = {
  seed: 'infinite',
  chunkSize: 48,
  elevation: { scale: 38, octaves: 4, persistence: 0.52, warp: 0.5 },
  moisture: { scale: 30, octaves: 3, persistence: 0.5, warp: 0.3 },
  contrast: 2.6,
  baseTerrain: 'hill',
  biomes: [
    { tile: 'water', elevation: [0, 0.22] },
    { tile: 'mud', elevation: [0.22, 0.28] },
    { tile: 'cliff', elevation: [0.62, 1] },
    { tile: 'grass', elevation: [0.34, 0.50] },
  ],
  smoothIterations: 2,
  scatter: [
    { tile: 'stone', density: 0.06, onTerrain: ['hill'] },
    { tile: 'spirit_ore', density: 0.02, onTerrain: ['hill'] },
    { tile: 'tree', density: 0.03, onTerrain: ['grass'] },
  ],
  structures: {
    gridSize: 38,
    density: 0.60,
    palette: {
      wallTile: 'wall', doorTile: 'door', windowTile: 'window',
      floorTile: 'floor', groundTile: 'floor', streetTile: 'trail',
    },
    townWeight: 1, dungeonWeight: 3, roomWeight: 1,
    townRadius: [6, 9], townHouses: [3, 5], dungeonRooms: [4, 6], windowChance: 0.30,
  },
};

/** 熔岩地窟：连绵暗崖、岩道纵横，封闭荒凉（地牢为主、聚落罕见）。 */
const MOLTEN_CAVERN: InfiniteWorldSpec = {
  seed: 'infinite',
  chunkSize: 48,
  elevation: { scale: 34, octaves: 4, persistence: 0.55, warp: 0.55 },
  moisture: { scale: 28, octaves: 3, persistence: 0.5, warp: 0.3 },
  contrast: 2.9,
  baseTerrain: 'cliff',
  biomes: [
    { tile: 'water', elevation: [0, 0.16] },
    { tile: 'mud', elevation: [0.16, 0.22] },
    { tile: 'floor', elevation: [0.22, 0.44] },
    { tile: 'hill', elevation: [0.44, 0.60] },
  ],
  smoothIterations: 2,
  scatter: [
    { tile: 'stone', density: 0.07, onTerrain: ['hill'] },
    { tile: 'spirit_ore', density: 0.02, onTerrain: ['hill'] },
  ],
  structures: {
    gridSize: 34,
    density: 0.65,
    palette: {
      wallTile: 'wall', doorTile: 'door', windowTile: 'window',
      floorTile: 'floor', groundTile: 'floor', streetTile: 'trail',
    },
    townWeight: 1, dungeonWeight: 4, roomWeight: 2,
    townRadius: [5, 8], townHouses: [3, 4], dungeonRooms: [4, 7], windowChance: 0.25,
  },
};

/** 寒泽迷沼：水泽湿地、泽国星罗，水边聚落（城镇多、地牢少）。 */
const COLD_MARSH: InfiniteWorldSpec = {
  seed: 'infinite',
  chunkSize: 48,
  elevation: { scale: 44, octaves: 4, persistence: 0.48, warp: 0.35 },
  moisture: { scale: 40, octaves: 3, persistence: 0.55, warp: 0.4 },
  contrast: 2.1,
  baseTerrain: 'swamp',
  biomes: [
    { tile: 'water', elevation: [0, 0.42] },
    { tile: 'mud', elevation: [0.42, 0.50] },
    { tile: 'hill', elevation: [0.80, 1] },
    { tile: 'grass', elevation: [0.62, 0.80] },
  ],
  smoothIterations: 2,
  scatter: [
    { tile: 'bamboo', density: 0.08, onTerrain: ['swamp'] },
    { tile: 'tree', density: 0.04, onTerrain: ['grass'] },
    { tile: 'stone', density: 0.03, onTerrain: ['hill'] },
  ],
  structures: {
    gridSize: 42,
    density: 0.50,
    palette: {
      wallTile: 'wall', doorTile: 'door', windowTile: 'window',
      floorTile: 'floor', groundTile: 'mud', streetTile: 'trail',
    },
    townWeight: 3, dungeonWeight: 1, roomWeight: 2,
    townRadius: [6, 10], townHouses: [4, 6], dungeonRooms: [3, 4], windowChance: 0.30,
  },
};

/** 九幽秘境：连绵山体、幽谷通道，地貌与结构均衡（照搬原无限世界温带基调 + 全套结构）。 */
const ABYSS_REALM: InfiniteWorldSpec = {
  seed: 'infinite',
  chunkSize: 48,
  elevation: { scale: 42, octaves: 4, persistence: 0.5, warp: 0.4 },
  moisture: { scale: 34, octaves: 3, persistence: 0.5, warp: 0.3 },
  contrast: 2.5,
  baseTerrain: 'grass',
  biomes: [
    { tile: 'water', elevation: [0, 0.26] },
    { tile: 'mud', elevation: [0.26, 0.32] },
    { tile: 'cliff', elevation: [0.72, 1] },
    { tile: 'hill', elevation: [0.58, 0.72] },
    { tile: 'swamp', elevation: [0.32, 0.58], moisture: [0.74, 1] },
  ],
  smoothIterations: 2,
  scatter: [
    { tile: 'tree', density: 0.05, onTerrain: ['grass'] },
    { tile: 'bamboo', density: 0.06, onTerrain: ['swamp'] },
    { tile: 'stone', density: 0.04, onTerrain: ['hill'] },
    { tile: 'spirit_ore', density: 0.015, onTerrain: ['hill'] },
  ],
  structures: {
    gridSize: 40,
    density: 0.55,
    palette: {
      wallTile: 'wall', doorTile: 'door', windowTile: 'window',
      floorTile: 'floor', groundTile: 'grass', streetTile: 'trail',
    },
    townWeight: 2, dungeonWeight: 2, roomWeight: 2,
    townRadius: [6, 10], townHouses: [4, 6], dungeonRooms: [3, 5], windowChance: 0.32,
  },
};

/** 一个主题：id、展示名、完整 spec。 */
export interface InfiniteThemeEntry {
  id: string;
  name: string;
  spec: InfiniteWorldSpec;
}

/** 五主题注册表：id → 展示名 + spec。demo 下拉与 specFor 都读它。 */
export const INFINITE_THEMES: readonly InfiniteThemeEntry[] = [
  { id: 'bamboo_valley', name: '幽篁竹海', spec: BAMBOO_VALLEY },
  { id: 'spirit_ravine', name: '灵矿裂谷', spec: SPIRIT_RAVINE },
  { id: 'molten_cavern', name: '熔岩地窟', spec: MOLTEN_CAVERN },
  { id: 'cold_marsh', name: '寒泽迷沼', spec: COLD_MARSH },
  { id: 'abyss_realm', name: '九幽秘境', spec: ABYSS_REALM },
];

/** 按 id 取主题 spec，缺省回退首个主题。 */
export function infiniteThemeById(id: string): InfiniteWorldSpec {
  return (INFINITE_THEMES.find((theme) => theme.id === id) ?? INFINITE_THEMES[0]).spec;
}

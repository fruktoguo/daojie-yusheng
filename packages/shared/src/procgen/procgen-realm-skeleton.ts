/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 秘境骨架展开器：把一份「秘境调色板」展开成分区拼装管线所需的
 * partition / regionGen / topology 三件套。
 *
 * 设计口径：
 * - 主题差异只在「地块调色板 + 可选调参」。同一套骨架（迷宫/地牢/宝库/boss/城镇/走廊的
 *   生成参数）在所有主题间复用，主题只需把各槽位换成自己的地块 id，即可长出全套地貌。
 * - 各生成参数的默认值照搬九幽秘境（abyss_realm）手写 regionGen 的既有取值，只把地块
 *   替换为调色板对应字段——因此换主题是纯换皮，不改任何区域生成器代码，也不动连通性构造。
 * - tuning 可选覆盖 kind 配额（kindMix）、BSP 分区参数（partition）与拓扑骨架（topology），
 *   缺省则一律使用通用默认，保证「只填调色板」即可得到均衡混合的融合秘境。
 */
import type {
  ProcgenBiomePreset,
  ProcgenPartitionSpec,
  ProcgenRealmPalette,
  ProcgenRealmTuning,
  ProcgenRegionGenSpec,
  ProcgenTopologySpec,
} from './procgen-types';

/**
 * 把调色板（+可选调参）展开成分区拼装三件套：partition / regionGen / topology。
 * 返回值可直接展开进 ProcgenBiomePreset：`...buildRealmSkeleton(palette)`。
 */
export function buildRealmSkeleton(
  palette: ProcgenRealmPalette,
  tuning?: ProcgenRealmTuning,
): Pick<ProcgenBiomePreset, 'partition' | 'regionGen' | 'topology'> {
  // BSP 分区：默认单区约 1000 格、最小边 16、上限 32 区、长宽比 >2.2 强制切长轴。
  // 单区面积取小（区更多）：固定角色（entry/boss/vault + 保底每类结构各 1）之外的自由池
  // 才够大，open 自然地貌得以占到约一半面积，实现均衡混合；minSide 16 仍能容下最小房间。
  // 注：cliff/water/熔岩极多的主题，其 open 区会有少量被不可走地形围死的可走孤岛被清理
  //（荒野里「够不到的崖间平台」，非断连），属正常现象。
  const partition: ProcgenPartitionSpec = tuning?.partition ?? {
    targetArea: 1000,
    minSide: 16,
    maxRegions: 32,
    maxAspect: 2.2,
  };

  // 各区域生成器：参数默认值照搬九幽，只把地块槽位替换成调色板字段。
  const regionGen: ProcgenRegionGenSpec = {
    // 山体迷宫：墙体是不可走地形（山脊/水道等），通道贴壁一圈铺坡脚。
    maze: {
      braidRate: 0.2,
      wallTerrain: palette.mazeWallTerrain,
      floorTile: palette.mazeFloorTile,
      slopeTile: palette.mazeSlopeTile,
      cellPitch: [11, 14],
      corridorRadius: [2, 2],
      roughness: 0.75,
      wobble: 0.4,
    },
    // 地牢/宝库/boss 三类人造区都凿在山体里：房间之外的多余墙体溶解成 mountainTerrain。
    dungeon: {
      roomTargetArea: 180,
      minRoom: 5,
      jitter: [1, 2],
      wallTile: palette.wallTile,
      doorTile: palette.doorTile,
      floorTile: palette.roomFloorTile,
      wallTerrain: palette.mountainTerrain,
    },
    vault: {
      wallTile: palette.wallTile,
      doorTile: palette.doorTile,
      floorTile: palette.roomFloorTile,
      pillarTile: palette.pillarTile,
      wallTerrain: palette.mountainTerrain,
    },
    boss: {
      wallTile: palette.wallTile,
      entranceWidth: [2, 3],
      floorTile: palette.roomFloorTile,
      pillarTile: palette.pillarTile,
      wallTerrain: palette.mountainTerrain,
    },
    // 城镇：整区可走地面 + 稀疏房群 + 街道引道接门位。
    town: {
      groundTile: palette.townGroundTile,
      streetTile: palette.townStreetTile,
      wallTile: palette.wallTile,
      doorTile: palette.doorTile,
      windowTile: palette.windowTile,
      windowChance: 0.3,
      houseFloorTile: palette.townFloorTile,
      houseCount: [4, 9],
      houseSize: { width: [4, 7], height: [4, 6] },
      content: { chestChance: 0.5, monsterChance: 0.4 },
    },
    corridor: { floorTile: palette.corridorFloorTile },
  };

  // 拓扑骨架：默认战斗/旁支/锁门数量 + kind 配额。
  // 展开顺序：tuning.kindMix 覆盖默认 kindMix；tuning.topology 若同时带 kindMix 会再覆盖之
  //（即 topology 优先级最高），这是刻意设计——主题可用 topology 做整体骨架微调。
  const topology: ProcgenTopologySpec = {
    combatCount: [2, 3],
    branchCount: [1, 2],
    lockCount: [1, 2],
    kindMix: tuning?.kindMix ?? { open: 3, town: 1, maze: 2, dungeon: 2 },
    ...(tuning?.topology ?? {}),
  };

  return { partition, regionGen, topology };
}

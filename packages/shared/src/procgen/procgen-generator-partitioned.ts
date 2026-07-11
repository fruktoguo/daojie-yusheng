/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 秘境随机地形生成器：分区拼装管线（preset.partition 存在时启用）。
 *
 * 管线：BSP 分区 → 抽 RAG + 角色回灌 + 预留门位 → 逐区在小数组上生成并 blit →
 *       只在 gutter 内凿区间门廊 → 封边 → 出生点 → 可达性收尾 → 传送阵 → 编码。
 *
 * 与旧管线的本质差别：连通性是**构造出来的**（门位先于生成、区内生成器保证自身单连通），
 * 而不是事后用全局 carveCorridor 在最近点对之间打洞补出来的。
 * 详见 docs/design/systems/秘境地形生成设计.md。
 */
import { ProcgenRng } from './procgen-random';
import { type ProcgenTileCatalog } from './procgen-catalog';
import { applyBorder } from './procgen-fields';
import { partitionRect } from './procgen-partition';
import { buildTopology } from './procgen-topology';
import { connectRegions, generateRegion, placeKeyAnchors } from './procgen-regions';
import { erodeRegionBorders } from './procgen-erode';
import { buildWalkableMask, findRegions } from './procgen-connect';
import { bfsDistances } from './procgen-routes';
import { encodeRows } from './procgen-encode';
import type { ProcgenBiomePreset, ProcgenContentAnchor, ProcgenMapResult, ProcgenPortalPlacement, ProcgenRect } from './procgen-types';

/** 在区内找一个离中心最近的可走格。找不到返回 -1。 */
function findOpenCellNear(rect: ProcgenRect, mask: Uint8Array, width: number): number {
  const centerX = rect.x + Math.floor(rect.w / 2);
  const centerY = rect.y + Math.floor(rect.h / 2);
  let best = -1;
  let bestDistance = Infinity;
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      const index = y * width + x;
      if (mask[index] === 0) continue;
      const distance = (x - centerX) * (x - centerX) + (y - centerY) * (y - centerY);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
  }
  return best;
}

export function generatePartitionedMap(
  preset: ProcgenBiomePreset,
  catalog: ProcgenTileCatalog,
  seed: string,
  width: number,
  height: number,
  warnings: string[],
): ProcgenMapResult {
  const scope = `${seed}:${preset.id}`;
  const carveTile = preset.connectivity.carveTile ?? preset.baseTerrain;
  const doorTile = preset.regionGen?.dungeon?.doorTile ?? 'door';

  // 1) 内矩形：给封边环留出位置，分区只在它内部进行。
  const maxThickness = Math.max(preset.border.thickness[0], preset.border.thickness[1]);
  const inset = maxThickness + 1;
  const r0: ProcgenRect = { x: inset, y: inset, w: width - inset * 2, h: height - inset * 2 };
  if (r0.w < 16 || r0.h < 16) throw new Error(`procgen_partition_area_too_small:${r0.w}x${r0.h}`);

  // 2) BSP 分区 + 3) RAG 抽取、角色回灌、门位预留
  const leaves = partitionRect(r0, preset.partition ?? {}, `${scope}:partition`);
  const topology = buildTopology(leaves, width, height, preset.topology ?? {}, `${scope}:topology`);
  warnings.push(...topology.warnings);
  const regions = topology.regions;
  // 区数被夹到下界说明地图太小，骨架必然坍缩，明确告警而非静默。
  if (regions.length <= 2) warnings.push(`procgen_topology_collapsed:${regions.length}`);

  // 4) 全局三层：区外一律不可走（gutter 与内缩边），区内容由 blit 覆盖。
  const terrainIds = new Array<string>(width * height).fill(preset.border.tile);
  const surfaceIds = new Array<string | null>(width * height).fill(null);
  const structureIds = new Array<string | null>(width * height).fill(null);
  const contentAnchors: ProcgenContentAnchor[] = [];
  for (const region of regions) {
    contentAnchors.push(...generateRegion(region, preset, terrainIds, surfaceIds, structureIds, width, scope));
  }

  // 5) 边界侵蚀：把矩形区边推成蜿蜒山脊，消除「一格直缝切出的矩形网格」。
  // 只减不增（可走 → 山体），故区间屏障仍然滴水不漏；门位与人造建筑区豁免。
  // 必须先于 connectRegions —— 否则刚凿好的门廊会被啃回山体。
  const erodedCells = erodeRegionBorders(regions, width, height, terrainIds, structureIds, preset.border.tile, scope, catalog);

  // 6) 区间门廊：只凿 gutter，绝不进入任何区的内部矩形。
  const lockAnchors = connectRegions(regions, topology.graph.edges, terrainIds, structureIds, width, carveTile, doorTile);
  contentAnchors.push(...lockAnchors);

  // 7) 封边环
  applyBorder(width, height, terrainIds, preset.border.tile, preset.border.thickness, new ProcgenRng(`${scope}:border`));

  // 8) 出生点：entry 区内离中心最近的可走格。
  const mask = buildWalkableMask(width, height, terrainIds, structureIds, catalog);
  const entry = regions.find((region) => region.role === 'entry') ?? regions[0];
  const spawnIndex = findOpenCellNear(entry.rect, mask, width);
  if (spawnIndex < 0) throw new Error('procgen_no_walkable_cell');
  const spawnX = spawnIndex % width;
  const spawnY = (spawnIndex - spawnX) / width;

  // 9) 可达性收尾（backstop）：以「从出生点可达」为唯一真源。
  // 预留门位若正确，这里应该一格都删不掉；删得多说明某个区没接上，必须显式告警。
  const distances = bfsDistances(width, height, mask, spawnIndex);
  let filledCells = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] === 1 && distances[index] < 0) {
      terrainIds[index] = preset.border.tile;
      structureIds[index] = null;
      mask[index] = 0;
      filledCells += 1;
    }
  }
  if (filledCells > 0) warnings.push(`procgen_unreachable_cells_filled:${filledCells}`);

  // 10) 传送阵：入口在出生点，出口在 boss 区（或图距最远区）内。
  const boss = regions.find((region) => region.role === 'boss');
  const portals: ProcgenPortalPlacement[] = [{ x: spawnX, y: spawnY, role: 'entry' }];
  if (boss) {
    const exitIndex = findOpenCellNear(boss.rect, mask, width);
    if (exitIndex >= 0 && distances[exitIndex] > 0) {
      portals.push({ x: exitIndex % width, y: Math.floor(exitIndex / width), role: 'exit' });
    } else {
      warnings.push('procgen_boss_region_unreachable');
    }
  }
  if (portals.length - 1 < preset.exitPortalCount) {
    warnings.push(`procgen_exit_shortfall:${portals.length - 1}/${preset.exitPortalCount}`);
  }

  // 钥匙必须落在图距比锁门更浅的区，否则玩家进不去拿钥匙的地方。
  // 放在可达性回填之后：此时 mask 已是最终可走面，钥匙不会落到随后被回填的孤岛上。
  const lockIds = lockAnchors.map((anchor) => anchor.gateGroupId ?? 0).filter((id) => id > 0);
  contentAnchors.push(...placeKeyAnchors(regions, lockIds, mask, width));

  // 11) 统计与编码
  let walkableCount = 0;
  for (let index = 0; index < mask.length; index += 1) walkableCount += mask[index];
  const walkableRatio = walkableCount / (width * height);
  if (walkableRatio < preset.walkableRatioRange[0] || walkableRatio > preset.walkableRatioRange[1]) {
    warnings.push(`procgen_walkable_ratio_out_of_range:${walkableRatio.toFixed(3)}`);
  }
  const tileCounts: Record<string, number> = {};
  const bump = (key: string): void => { tileCounts[key] = (tileCounts[key] ?? 0) + 1; };
  for (let index = 0; index < terrainIds.length; index += 1) {
    bump(`terrain:${terrainIds[index]}`);
    if (structureIds[index] !== null) bump(`structure:${structureIds[index]}`);
    if (surfaceIds[index] !== null) bump(`surface:${surfaceIds[index]}`);
  }
  const regionKindCounts: Record<string, number> = {};
  for (const region of regions) regionKindCounts[region.kind] = (regionKindCounts[region.kind] ?? 0) + 1;
  const finalRegions = findRegions(width, height, mask);
  // 锚点只保留最终可达格（区被回填时其锚点随之失效）。
  const reachableAnchors = contentAnchors.filter((anchor) => mask[anchor.y * width + anchor.x] === 1);

  return {
    seed,
    presetId: preset.id,
    width,
    height,
    terrainRows: encodeRows(width, height, terrainIds, 'terrain', catalog),
    surfaceRows: encodeRows(width, height, surfaceIds, 'surface', catalog),
    structureRows: encodeRows(width, height, structureIds, 'structure', catalog),
    terrainIds,
    surfaceIds,
    structureIds,
    spawnPoint: { x: spawnX, y: spawnY },
    portals,
    contentAnchors: reachableAnchors,
    regions,
    levelGraph: topology.graph,
    stats: {
      walkableRatio,
      regionCount: finalRegions.sizes.length,
      carvedCells: 0,
      filledCells,
      buildingCount: 0,
      tileCounts,
      spatialRegionCount: regions.length,
      erodedCells,
      regionKindCounts,
      lockCount: lockIds.length,
    },
    warnings,
  };
}

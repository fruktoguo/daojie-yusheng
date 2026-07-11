/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 秘境随机地形生成器：主管线编排。
 *
 * 管线：噪声场 → 地形规则映射 → CA 平滑 → 封闭边界 → 结构放置 →
 *       连通性保证 → 出生点/传送阵选址 → 道路网络 → format:2 编码与统计校验。
 * 同一 seed + preset + 地块目录恒等输出；生成发生在实例创建期，不进 tick 热路径。
 */
import { ProcgenRng } from './procgen-random';
import { buildProcgenTileCatalog, validateProcgenTileCatalog, findUnregisteredTileChars, type ProcgenTileCatalog } from './procgen-catalog';
import { encodeRows } from './procgen-encode';
import { generatePartitionedMap } from './procgen-generator-partitioned';
import { generateField, assignTerrain, smoothTerrain, applyBorder } from './procgen-fields';
import { placeStructures, clearStructuresAround } from './procgen-structures';
import { placeBuildings } from './procgen-buildings';
import { buildWalkableMask, findRegions, ensureConnectivity } from './procgen-connect';
import { bfsDistances, pickSpawn, pickExits, pickPois, buildRoadNetwork } from './procgen-routes';
import type { ProcgenGenerateOptions, ProcgenMapResult, ProcgenBiomePreset, ProcgenPortalPlacement, ProcgenContentAnchor } from './procgen-types';

/** 校验预设引用的地块在目录中全部存在；配置错误必须在生成前暴露。 */
export function validateProcgenPreset(preset: ProcgenBiomePreset, catalog: ProcgenTileCatalog): string[] {
  const errors: string[] = [];
  const checkTile = (layer: 'terrain' | 'surface' | 'structure', id: string, where: string): void => {
    if (!catalog.byLayerAndId.has(`${layer}:${id}`)) errors.push(`procgen_preset_tile_missing:${where}:${layer}:${id}`);
  };
  checkTile('terrain', preset.baseTerrain, 'baseTerrain');
  checkTile('terrain', preset.border.tile, 'border');
  if (preset.connectivity.carveTile) checkTile('terrain', preset.connectivity.carveTile, 'carveTile');
  for (const rule of preset.terrainRules) checkTile('terrain', rule.tile, 'terrainRules');
  for (const rule of preset.structures) {
    checkTile('structure', rule.tile, 'structures');
    for (const on of rule.on) checkTile('terrain', on, `structures:${rule.tile}:on`);
    for (const near of rule.nearTiles?.tiles ?? []) checkTile('terrain', near, `structures:${rule.tile}:near`);
    if (rule.density === undefined && rule.clusters === undefined) errors.push(`procgen_structure_rule_empty:${rule.tile}`);
  }
  if (preset.paths) checkTile('surface', preset.paths.tile, 'paths');
  if (preset.buildings) {
    const b = preset.buildings;
    checkTile('structure', b.wallTile ?? 'wall', 'buildings:wall');
    checkTile('structure', b.doorTile ?? 'door', 'buildings:door');
    if (b.windowTile) checkTile('structure', b.windowTile, 'buildings:window');
    if (b.ruinDebrisTile) checkTile('structure', b.ruinDebrisTile, 'buildings:debris');
    if (b.floorTile) checkTile('surface', b.floorTile, 'buildings:floor');
    if (b.on.length === 0) errors.push('procgen_buildings_on_empty');
    for (const on of b.on) checkTile('terrain', on, 'buildings:on');
  }
  const region = preset.regionGen;
  if (region) {
    const optionalTerrain = (tile: string | undefined, where: string): void => { if (tile) checkTile('terrain', tile, where); };
    if (region.maze) {
      checkTile('terrain', region.maze.wallTerrain, 'regionGen:maze:wall');
      optionalTerrain(region.maze.floorTile, 'regionGen:maze:floor');
      optionalTerrain(region.maze.slopeTile, 'regionGen:maze:slope');
      // 山体必须不可走，山脚必须可走。配反了迷宫会整片连通或整片堵死，
      // 而这两种失败都不会抛错，只会静默生成一张废图 —— 必须在生成前拦住。
      const wall = catalog.byLayerAndId.get(`terrain:${region.maze.wallTerrain}`);
      if (wall && wall.walkable !== false) errors.push(`procgen_maze_wall_terrain_walkable:${region.maze.wallTerrain}`);
      const slope = region.maze.slopeTile ? catalog.byLayerAndId.get(`terrain:${region.maze.slopeTile}`) : undefined;
      if (slope && slope.walkable === false) errors.push(`procgen_maze_slope_terrain_blocked:${region.maze.slopeTile}`);
    }
    // 三类人造区把房间外的多余墙体溶解成山体地形，故 wallTerrain 必须不可走 ——
    // 配成可走地形会让整个区变成一片敞开的空地，且不会抛错。
    const blockingTerrain = (tile: string, where: string): void => {
      checkTile('terrain', tile, where);
      const def = catalog.byLayerAndId.get(`terrain:${tile}`);
      if (def && def.walkable !== false) errors.push(`procgen_wall_terrain_walkable:${where}:${tile}`);
    };
    if (region.dungeon) {
      checkTile('structure', region.dungeon.wallTile, 'regionGen:dungeon:wall');
      checkTile('structure', region.dungeon.doorTile, 'regionGen:dungeon:door');
      optionalTerrain(region.dungeon.floorTile, 'regionGen:dungeon:floor');
      blockingTerrain(region.dungeon.wallTerrain, 'regionGen:dungeon:wallTerrain');
    }
    if (region.vault) {
      checkTile('structure', region.vault.wallTile, 'regionGen:vault:wall');
      checkTile('structure', region.vault.doorTile, 'regionGen:vault:door');
      optionalTerrain(region.vault.floorTile, 'regionGen:vault:floor');
      if (region.vault.pillarTile) checkTile('structure', region.vault.pillarTile, 'regionGen:vault:pillar');
      blockingTerrain(region.vault.wallTerrain, 'regionGen:vault:wallTerrain');
    }
    if (region.boss) {
      checkTile('structure', region.boss.wallTile, 'regionGen:boss:wall');
      optionalTerrain(region.boss.floorTile, 'regionGen:boss:floor');
      if (region.boss.pillarTile) checkTile('structure', region.boss.pillarTile, 'regionGen:boss:pillar');
      blockingTerrain(region.boss.wallTerrain, 'regionGen:boss:wallTerrain');
    }
    optionalTerrain(region.corridor?.floorTile, 'regionGen:corridor:floor');
    for (const [kind, rules] of Object.entries(region.openTerrainRulesByKind ?? {})) {
      for (const rule of rules) checkTile('terrain', rule.tile, `regionGen:openTerrainRules:${kind}`);
    }
  }
  // 分区拼装靠预留门位构造连通性，不需要（也不允许）事后全图 carve 横穿墙体。
  if (preset.partition && preset.connectivity.mode === 'carve') {
    errors.push('procgen_partition_requires_fill_connectivity');
  }
  const baseDef = catalog.byLayerAndId.get(`terrain:${preset.baseTerrain}`);
  if (baseDef && !baseDef.walkable) errors.push(`procgen_base_terrain_not_walkable:${preset.baseTerrain}`);
  // border.tile 同时用作封闭边界与孤块回填填充；回填分支假设它不可走，
  // 若可走会让 mask 与 terrain 失同步、复活孤立可走区，破坏单连通块保证。
  const borderDef = catalog.byLayerAndId.get(`terrain:${preset.border.tile}`);
  if (borderDef && borderDef.walkable) errors.push(`procgen_border_terrain_walkable:${preset.border.tile}`);
  // carveTile 用于凿通走廊，必须可走，否则凿出的走廊仍不可通行。
  const carveDef = preset.connectivity.carveTile
    ? catalog.byLayerAndId.get(`terrain:${preset.connectivity.carveTile}`)
    : baseDef;
  if (carveDef && !carveDef.walkable) errors.push(`procgen_carve_terrain_not_walkable:${preset.connectivity.carveTile ?? preset.baseTerrain}`);
  if (preset.exitPortalCount < 1) errors.push('procgen_exit_portal_count_invalid');
  return errors;
}

/** 生成一张秘境地图。配置或目录非法时抛错；软性越界（可走占比等）进 warnings。 */
export function generateProcgenMap(options: ProcgenGenerateOptions): ProcgenMapResult {
  const catalog = buildProcgenTileCatalog(options.tiles);
  const catalogErrors = validateProcgenTileCatalog(catalog);
  const presetErrors = validateProcgenPreset(options.preset, catalog);
  if (catalogErrors.length > 0 || presetErrors.length > 0) {
    throw new Error(`procgen_config_invalid:${[...catalogErrors, ...presetErrors].join(',')}`);
  }
  // 未在 shared 字符表注册的自定义字符导出后会被运行时解码静默回退（terrain→可走 floor、
  // structure→无），封闭边界与可走性口径失效。默认拒绝，仅显式声明"仅预览"时降级为 warning。
  const unregisteredChars = findUnregisteredTileChars(catalog);
  if (unregisteredChars.length > 0 && !options.allowUnregisteredChars) {
    throw new Error(`procgen_unregistered_tile_chars:${unregisteredChars.join(',')}`);
  }
  const preset = options.preset;
  const seed = options.seed;
  const warnings: string[] = [];
  if (unregisteredChars.length > 0) {
    warnings.push(`procgen_unregistered_tile_chars:${unregisteredChars.join(',')}`);
  }
  const rng = new ProcgenRng(`${seed}:${preset.id}`);
  const width = options.widthOverride ?? rng.intInRange(preset.size.width);
  const height = options.heightOverride ?? rng.intInRange(preset.size.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16 || width * height > 65536) {
    throw new Error(`procgen_size_invalid:${width}x${height}`);
  }

  // 配了 partition 就走分区拼装管线；否则走下面的全图单一噪声管线（行为完全不变）。
  if (preset.partition) {
    return generatePartitionedMap(preset, catalog, seed, width, height, warnings);
  }

  // 1) 噪声场 → 地形 → 平滑 → 边界
  const elevation = generateField(width, height, preset.fields.elevation, `${seed}:${preset.id}:elevation`);
  const moisture = generateField(width, height, preset.fields.moisture, `${seed}:${preset.id}:moisture`);
  let terrainIds = assignTerrain(width, height, elevation, moisture, preset.terrainRules, preset.baseTerrain);
  terrainIds = smoothTerrain(width, height, terrainIds, preset.smoothing.iterations);
  applyBorder(width, height, terrainIds, preset.border.tile, preset.border.thickness, rng.fork('border'));

  // 2) 房屋 + 结构放置：先占地画房（写墙门窗与室内地板），再让散布结构绕开房屋占地
  const structureIds = new Array<string | null>(width * height).fill(null);
  const surfaceIds = new Array<string | null>(width * height).fill(null);
  const buildingResult = preset.buildings
    ? placeBuildings(width, height, terrainIds, structureIds, surfaceIds, preset.buildings, rng.fork('buildings'))
    : null;
  const contentAnchors = buildingResult?.contentAnchors ?? [];
  // 地图太小或 buildings.on 允许的地形不成片时，房屋会一栋都放不下。
  // 这属于软性越界：不阻断生成，但必须显式告警，否则策划只会看到一张没有房子的图。
  if (buildingResult && buildingResult.placed < buildingResult.requested) {
    warnings.push(`procgen_building_shortfall:${buildingResult.placed}/${buildingResult.requested}`);
  }
  placeStructures(width, height, terrainIds, preset.structures, rng.fork('structures'), structureIds, buildingResult?.reserved);

  // 3) 连通性保证
  const mask = buildWalkableMask(width, height, terrainIds, structureIds, catalog);
  // ensureConnectivity 保证收敛到单连通块，否则抛 procgen_connectivity_failed。
  const connectivity = ensureConnectivity(
    width, height, terrainIds, structureIds, mask,
    preset.connectivity, preset.baseTerrain, preset.border.tile, rng.fork('connect'),
  );

  // 4) 出生点与净空
  const regions = findRegions(width, height, mask);
  const spawnIndex = pickSpawn(width, height, mask, regions.labels, regions.sizes);
  if (spawnIndex < 0) {
    throw new Error('procgen_no_walkable_cell');
  }
  const spawnX = spawnIndex % width;
  const spawnY = (spawnIndex - spawnX) / width;
  clearStructuresAround(width, height, structureIds, preset.structures, spawnX, spawnY);
  const finalMask = buildWalkableMask(width, height, terrainIds, structureIds, catalog);

  // 5) 可达性收尾：清净空可能把被不可走地形包围的格暴露成新孤岛；
  //    以"从出生点可达"为最终真源，把不可达的可走格回填为不可走，保证全图从出生点可达。
  const distances = bfsDistances(width, height, finalMask, spawnIndex);
  for (let index = 0; index < finalMask.length; index += 1) {
    if (finalMask[index] === 1 && distances[index] < 0) {
      terrainIds[index] = preset.border.tile;
      structureIds[index] = null;
      finalMask[index] = 0;
    }
  }

  // 6) 传送阵选址：入口在出生点，出口按 BFS 距离从远到近、彼此隔开
  const minSeparation = Math.floor((width + height) / 8) + 4;
  const exitIndexes = pickExits(width, distances, preset.exitPortalCount, minSeparation);
  if (exitIndexes.length < preset.exitPortalCount) {
    warnings.push(`procgen_exit_shortfall:${exitIndexes.length}/${preset.exitPortalCount}`);
  }
  for (const exitIndex of exitIndexes) structureIds[exitIndex] = null;
  const portals: ProcgenPortalPlacement[] = [
    { x: spawnX, y: spawnY, role: 'entry' },
    ...exitIndexes.map((index) => ({ x: index % width, y: Math.floor(index / width), role: 'exit' as const })),
  ];

  // 7) 道路网络
  if (preset.paths) {
    const pois = pickPois(width, distances, rng.fork('poi').intInRange(preset.paths.extraPoiCount), exitIndexes, rng.fork('poi-pick'));
    const network = buildRoadNetwork(width, height, finalMask, spawnIndex, [...exitIndexes, ...pois], preset.paths.wobble, `${seed}:${preset.id}`);
    for (const index of network) {
      if (finalMask[index] === 1) surfaceIds[index] = preset.paths.tile;
    }
  }

  // 8) 统计与软校验
  let walkableCount = 0;
  for (let index = 0; index < finalMask.length; index += 1) walkableCount += finalMask[index];
  const walkableRatio = walkableCount / (width * height);
  if (walkableRatio < preset.walkableRatioRange[0] || walkableRatio > preset.walkableRatioRange[1]) {
    warnings.push(`procgen_walkable_ratio_out_of_range:${walkableRatio.toFixed(3)}`);
  }
  const tileCounts: Record<string, number> = {};
  for (let index = 0; index < terrainIds.length; index += 1) {
    const terrainKey = `terrain:${terrainIds[index]}`;
    tileCounts[terrainKey] = (tileCounts[terrainKey] ?? 0) + 1;
    const structureId = structureIds[index];
    if (structureId !== null) {
      const structureKey = `structure:${structureId}`;
      tileCounts[structureKey] = (tileCounts[structureKey] ?? 0) + 1;
    }
    const surfaceId = surfaceIds[index];
    if (surfaceId !== null) {
      const surfaceKey = `surface:${surfaceId}`;
      tileCounts[surfaceKey] = (tileCounts[surfaceKey] ?? 0) + 1;
    }
  }
  const finalRegions = findRegions(width, height, finalMask);
  // 内容锚点只保留最终可达格（房子内部若被连通性回填则锚点失效）。
  const reachableAnchors: ProcgenContentAnchor[] = contentAnchors.filter((anchor) => finalMask[anchor.y * width + anchor.x] === 1);

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
    stats: {
      walkableRatio,
      regionCount: finalRegions.sizes.length,
      carvedCells: connectivity.carvedCells,
      filledCells: connectivity.filledCells,
      buildingCount: buildingResult?.placed ?? 0,
      tileCounts,
      spatialRegionCount: 0,
      erodedCells: 0,
      regionKindCounts: {},
      lockCount: 0,
    },
    warnings,
  };
}

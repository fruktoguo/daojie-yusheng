/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 秘境随机地形生成器：逐区生成编排与区间门廊。
 *
 * 每个区在自己的 RegionCanvas 小数组上生成，再 blit 回全局。开放地貌区直接复用未改动的
 * generateField/assignTerrain/smoothTerrain/placeStructures —— smoothTerrain 的 3×3 邻域
 * 天然 clamp 到小数组边界，分区边界因此不会被抹糊。
 *
 * 区间门廊只在 1 格 gutter 里凿，绝不进入任何区的内部矩形。这与旧的 carveCorridor 相反：
 * 后者在两个连通块的最近采样点之间带抖动随机游走，连接点位置与关卡设计毫无关系，
 * 会在迷宫墙上开出一堆不受控的捷径。
 */
import { ProcgenRng } from './procgen-random';
import { RegionCanvas } from './procgen-canvas';
import { generateField, assignTerrain, smoothTerrain } from './procgen-fields';
import { placeStructures } from './procgen-structures';
import { carvePortStub, generateCorridor, generateMaze, type LocalPort } from './procgen-maze';
import { generateBossRoom, generateDungeon, generateVault, type LocalAnchor } from './procgen-dungeon';
import { generateTown } from './procgen-town';
import type {
  ProcgenBiomePreset,
  ProcgenContentAnchor,
  ProcgenLevelEdge,
  ProcgenRegionNode,
} from './procgen-types';

/** 全局门位 → 该区的局部门位。 */
function toLocalPorts(region: ProcgenRegionNode, canvas: RegionCanvas): LocalPort[] {
  return region.ports.map((port) => ({
    x: canvas.toLocalX(port.x),
    y: canvas.toLocalY(port.y),
    side: port.side,
  }));
}

/** 开放地貌区：在小数组上跑原班噪声管线，规则集可按区域种类覆盖。 */
function generateOpenRegion(
  canvas: RegionCanvas,
  ports: readonly LocalPort[],
  preset: ProcgenBiomePreset,
  region: ProcgenRegionNode,
  seed: string,
): void {
  const rules = preset.regionGen?.openTerrainRulesByKind?.[region.kind] ?? preset.terrainRules;
  const elevation = generateField(canvas.width, canvas.height, preset.fields.elevation, `${seed}:elevation`);
  const moisture = generateField(canvas.width, canvas.height, preset.fields.moisture, `${seed}:moisture`);
  const assigned = assignTerrain(canvas.width, canvas.height, elevation, moisture, rules, preset.baseTerrain);
  const smoothed = smoothTerrain(canvas.width, canvas.height, assigned, preset.smoothing.iterations);
  for (let index = 0; index < smoothed.length; index += 1) canvas.terrainIds[index] = smoothed[index];
  placeStructures(
    canvas.width, canvas.height, canvas.terrainIds, preset.structures,
    new ProcgenRng(`${seed}:structures`), canvas.structureIds,
  );
  for (const port of ports) carvePortStub(canvas, port);
}

/** 生成单个区并 blit 回全局，返回该区产出的全局坐标锚点。 */
export function generateRegion(
  region: ProcgenRegionNode,
  preset: ProcgenBiomePreset,
  globalTerrain: string[],
  globalSurface: (string | null)[],
  globalStructure: (string | null)[],
  globalWidth: number,
  seed: string,
): ProcgenContentAnchor[] {
  const canvas = new RegionCanvas(region.rect, preset.baseTerrain);
  const ports = toLocalPorts(region, canvas);
  const regionSeed = `${seed}:region:${region.nodeId}`;
  const spec = preset.regionGen ?? {};
  let local: LocalAnchor[] = [];

  switch (region.kind) {
    case 'maze':
      if (spec.maze) generateMaze(canvas, ports, spec.maze, regionSeed);
      else generateOpenRegion(canvas, ports, preset, region, regionSeed);
      break;
    case 'dungeon':
      if (spec.dungeon) local = generateDungeon(canvas, ports, spec.dungeon, regionSeed);
      else generateOpenRegion(canvas, ports, preset, region, regionSeed);
      break;
    case 'vault':
      if (spec.vault) local = generateVault(canvas, ports, spec.vault, regionSeed);
      else generateOpenRegion(canvas, ports, preset, region, regionSeed);
      break;
    case 'boss':
      if (spec.boss) local = generateBossRoom(canvas, ports, spec.boss, regionSeed);
      else generateOpenRegion(canvas, ports, preset, region, regionSeed);
      break;
    case 'town':
      if (spec.town) local = generateTown(canvas, ports, spec.town, regionSeed);
      else generateOpenRegion(canvas, ports, preset, region, regionSeed);
      break;
    case 'corridor':
      generateCorridor(canvas, ports, spec.corridor ?? {});
      break;
    default:
      generateOpenRegion(canvas, ports, preset, region, regionSeed);
      break;
  }

  canvas.blitTo(globalTerrain, globalSurface, globalStructure, globalWidth);
  return local.map((anchor) => ({
    x: canvas.toGlobalX(anchor.x),
    y: canvas.toGlobalY(anchor.y),
    kind: anchor.kind,
    nodeId: region.nodeId,
  }));
}

/**
 * 区间门廊：只凿两区之间那 1 格 gutter。两端的区内接驳由各区生成器的 port stub 负责，
 * 所以这里不需要（也不允许）进入任何区的内部矩形。
 */
export function connectRegions(
  regions: readonly ProcgenRegionNode[],
  edges: readonly ProcgenLevelEdge[],
  terrainIds: string[],
  structureIds: (string | null)[],
  width: number,
  carveTile: string,
  doorTile: string,
): ProcgenContentAnchor[] {
  const byId = new Map(regions.map((region) => [region.nodeId, region]));
  const anchors: ProcgenContentAnchor[] = [];
  for (const edge of edges) {
    if (edge.kind !== 'corridor') continue;
    const from = byId.get(edge.from);
    if (!from) continue;
    const port = from.ports.find((candidate) => candidate.toNodeId === edge.to);
    if (!port) continue;
    // gutter 格就在门位朝外一格。
    const gutterX = port.side === 'E' ? port.x + 1 : port.side === 'W' ? port.x - 1 : port.x;
    const gutterY = port.side === 'S' ? port.y + 1 : port.side === 'N' ? port.y - 1 : port.y;
    const index = gutterY * width + gutterX;
    if (index < 0 || index >= terrainIds.length) continue;
    terrainIds[index] = carveTile;
    structureIds[index] = edge.lockId === undefined ? null : doorTile;
    if (edge.lockId !== undefined) {
      anchors.push({ x: gutterX, y: gutterY, kind: 'lock', gateGroupId: edge.lockId, nodeId: edge.to });
    }
  }
  return anchors;
}

/**
 * 钥匙锚点：每把钥匙放在图距比锁门更浅的某个非宝库区，保证「先拿钥匙再开锁」可解。
 *
 * 已用区与已占格都要记账：候选表按 depth 排序且逐把钥匙重算的话，每把钥匙都会挑中
 * 同一个最浅区的同一个中心格，多把钥匙于是叠在一格上（实测两把钥匙坐标完全相同）。
 *
 * 落点必须用可走 mask 判定，不能只看有没有建筑：钥匙若落在峭壁上，会被管线末尾的
 * 可达性过滤静默丢弃，锁门就再也打不开了。
 */
export function placeKeyAnchors(
  regions: readonly ProcgenRegionNode[],
  lockIds: readonly number[],
  mask: Uint8Array,
  width: number,
): ProcgenContentAnchor[] {
  const candidates = regions
    .filter((region) => region.role !== 'vault' && region.role !== 'boss' && region.depth >= 1)
    .slice()
    .sort((a, b) => a.depth - b.depth || (a.nodeId < b.nodeId ? -1 : 1));

  const anchors: ProcgenContentAnchor[] = [];
  const usedRegions = new Set<string>();
  for (const lockId of lockIds) {
    // 优先挑还没放过钥匙的区；区不够用时才允许同区第二把（此时换一格）。
    const ordered = [
      ...candidates.filter((region) => !usedRegions.has(region.nodeId)),
      ...candidates.filter((region) => usedRegions.has(region.nodeId)),
    ];
    let placed = false;
    for (const region of ordered) {
      const spot = findFreeCellNearCenter(region, mask, width, anchors);
      if (!spot) continue;
      anchors.push({ x: spot.x, y: spot.y, kind: 'key', keyGroupId: lockId, nodeId: region.nodeId });
      usedRegions.add(region.nodeId);
      placed = true;
      break;
    }
    if (!placed) break;
  }
  return anchors;
}

/** 从区中心向外做方形环搜索，找第一个可走、且未被已放锚点占用的格。 */
function findFreeCellNearCenter(
  region: ProcgenRegionNode,
  mask: Uint8Array,
  width: number,
  taken: readonly ProcgenContentAnchor[],
): { x: number; y: number } | null {
  const cx = region.rect.x + Math.floor(region.rect.w / 2);
  const cy = region.rect.y + Math.floor(region.rect.h / 2);
  const maxRadius = Math.max(region.rect.w, region.rect.h);
  for (let radius = 0; radius <= maxRadius; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        // 只扫这一环的边框，内部在更小的 radius 已经扫过。
        if (radius > 0 && Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < region.rect.x || y < region.rect.y) continue;
        if (x >= region.rect.x + region.rect.w || y >= region.rect.y + region.rect.h) continue;
        if (mask[y * width + x] !== 1) continue;
        if (taken.some((anchor) => anchor.x === x && anchor.y === y)) continue;
        return { x, y };
      }
    }
  }
  return null;
}

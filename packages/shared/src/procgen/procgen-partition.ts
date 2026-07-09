/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 秘境随机地形生成器：BSP 几何分区 + 区域画布。
 *
 * 分区先于一切内容：把内部矩形递归切成 N 个近方正的叶，叶间留 1 格 gutter 作区间缝。
 * 每个叶随后在自己的 RegionCanvas 小数组上生成，再 blit 回全局——这让 smoothTerrain
 * 的 3×3 邻域天然 clamp 到区边界，无需改动 smoothTerrain 本身。
 *
 * 确定性：种子一律由不可变字符串纯函数派生（`${seed}:${presetId}:partition`），
 * 禁止 rng.fork()——fork 会消费父流状态，子种子取决于调用位次，上游增删一次 fork
 * 会让其后所有区域静默重新洗牌。详见 docs/design/systems/秘境地形生成设计.md §1.1。
 */
import { ProcgenRng } from './procgen-random';
import type { ProcgenPartitionSpec, ProcgenRect } from './procgen-types';

export const DEFAULT_REGION_TARGET_AREA = 1600;
export const DEFAULT_REGION_MIN_SIDE = 18;
export const DEFAULT_REGION_MAX_COUNT = 24;
export const DEFAULT_REGION_MAX_ASPECT = 2.2;
/** 叶与叶之间保留的缝宽（格）。区间门廊只在这条缝里凿，绝不进入任何区的内部矩形。 */
export const REGION_GUTTER = 1;

/** BSP 叶：nodeId 是根到叶的路径串，与兄弟遍历顺序解耦，可作为该区的稳定种子。 */
export interface ProcgenBspLeaf {
  nodeId: string;
  rect: ProcgenRect;
}

interface BspNode {
  nodeId: string;
  rect: ProcgenRect;
}

function areaOf(rect: ProcgenRect): number {
  return rect.w * rect.h;
}

function aspectOf(rect: ProcgenRect): number {
  return Math.max(rect.w, rect.h) / Math.max(1, Math.min(rect.w, rect.h));
}

/** 该矩形能否沿某轴切成两个都不小于 minSide 的子矩形（含中间的 gutter）。 */
function canSplit(length: number, minSide: number): boolean {
  return length >= minSide * 2 + REGION_GUTTER;
}

/**
 * 切一刀。返回两个子矩形，中间空出 REGION_GUTTER 格。
 * 切点全整数运算——浮点只允许进噪声采样，否则跨 arch 可能不一致。
 */
function splitRect(rect: ProcgenRect, minSide: number, maxAspect: number, rng: ProcgenRng): [ProcgenRect, ProcgenRect] | null {
  const canVertical = canSplit(rect.w, minSide);
  const canHorizontal = canSplit(rect.h, minSide);
  if (!canVertical && !canHorizontal) return null;

  let vertical: boolean;
  if (canVertical && canHorizontal) {
    // 长宽比过大时强制切长轴，避免切出细条（细条只能降级成走廊区）。
    if (rect.w / rect.h > maxAspect) vertical = true;
    else if (rect.h / rect.w > maxAspect) vertical = false;
    else vertical = rng.chance(0.5);
  } else {
    vertical = canVertical;
  }

  if (vertical) {
    const cut = rng.int(rect.x + minSide, rect.x + rect.w - minSide - REGION_GUTTER);
    return [
      { x: rect.x, y: rect.y, w: cut - rect.x, h: rect.h },
      { x: cut + REGION_GUTTER, y: rect.y, w: rect.x + rect.w - cut - REGION_GUTTER, h: rect.h },
    ];
  }
  const cut = rng.int(rect.y + minSide, rect.y + rect.h - minSide - REGION_GUTTER);
  return [
    { x: rect.x, y: rect.y, w: rect.w, h: cut - rect.y },
    { x: rect.x, y: cut + REGION_GUTTER, w: rect.w, h: rect.y + rect.h - cut - REGION_GUTTER },
  ];
}

/** 目标区数：N = clamp(round(area / targetArea), 2, maxRegions)。用内矩形面积，不是整图面积。 */
export function resolveTargetRegionCount(rect: ProcgenRect, spec: ProcgenPartitionSpec): number {
  const targetArea = Math.max(64, Math.floor(spec.targetArea ?? DEFAULT_REGION_TARGET_AREA));
  const maxRegions = Math.max(2, Math.floor(spec.maxRegions ?? DEFAULT_REGION_MAX_COUNT));
  return Math.min(maxRegions, Math.max(2, Math.round(areaOf(rect) / targetArea)));
}

/** 切一刀：从候选里挑第一个切得动的叶。切不动任何一个返回 null。 */
function splitOnce(
  leaves: BspNode[],
  ordered: readonly BspNode[],
  minSide: number,
  maxAspect: number,
  seed: string,
): BspNode[] | null {
  for (const leaf of ordered) {
    // 每个叶的切分种子只依赖它自己的 nodeId，与它被切的先后无关。
    const children = splitRect(leaf.rect, minSide, maxAspect, new ProcgenRng(`${seed}:split:${leaf.nodeId}`));
    if (!children) continue;
    const next = leaves.filter((candidate) => candidate.nodeId !== leaf.nodeId);
    next.push({ nodeId: `${leaf.nodeId}.0`, rect: children[0] });
    next.push({ nodeId: `${leaf.nodeId}.1`, rect: children[1] });
    return next;
  }
  return null;
}

/**
 * BSP 分区。分两阶段：
 *
 * 1. **达标**：切到目标叶数。优先切长宽比超标的叶，其次切最大的叶。
 * 2. **整形**：目标已满足但仍有细条时继续切，直到全部叶的长宽比达标或撞到 maxRegions 上限。
 *
 * 第 2 阶段不可省。maxAspect 若只作为「选哪根轴切」的提示（旧写法），细条就会作为中间态
 * 残留到叶层——它们随后被 resolveKind 一律降级成 corridor（整块挖空的空地），
 * 于是一张图里出现三五个大片空区，可走比被推到上界。maxAspect 必须是叶的后置约束。
 *
 * 排序键均以 (超标优先, 面积降序, nodeId 升序) 稳定破平，与 Map/Set 遍历顺序无关。
 */
export function partitionRect(rect: ProcgenRect, spec: ProcgenPartitionSpec, seed: string): ProcgenBspLeaf[] {
  const minSide = Math.max(4, Math.floor(spec.minSide ?? DEFAULT_REGION_MIN_SIDE));
  const maxAspect = Math.max(1.1, spec.maxAspect ?? DEFAULT_REGION_MAX_ASPECT);
  const maxRegions = Math.max(2, Math.floor(spec.maxRegions ?? DEFAULT_REGION_MAX_COUNT));
  const target = resolveTargetRegionCount(rect, spec);

  const byPriority = (a: BspNode, b: BspNode): number => {
    const overA = aspectOf(a.rect) > maxAspect ? 1 : 0;
    const overB = aspectOf(b.rect) > maxAspect ? 1 : 0;
    if (overA !== overB) return overB - overA;
    return areaOf(b.rect) - areaOf(a.rect) || (a.nodeId < b.nodeId ? -1 : 1);
  };

  let leaves: BspNode[] = [{ nodeId: 'R', rect }];
  while (leaves.length < target) {
    const next = splitOnce(leaves, leaves.slice().sort(byPriority), minSide, maxAspect, seed);
    if (!next) break;
    leaves = next;
  }
  // 整形：只切仍然超标的叶。短边 ≥ minSide 时长边必 > 2.2·minSide ≥ 2·minSide+gutter，故一定切得动。
  while (leaves.length < maxRegions) {
    const oversized = leaves.filter((leaf) => aspectOf(leaf.rect) > maxAspect).sort(byPriority);
    if (oversized.length === 0) break;
    const next = splitOnce(leaves, oversized, minSide, maxAspect, seed);
    if (!next) break;
    leaves = next;
  }

  return leaves
    .slice()
    .sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0))
    .map((leaf) => ({ nodeId: leaf.nodeId, rect: leaf.rect }));
}

/** 两个矩形是否隔着恰好 REGION_GUTTER 相邻，若是则返回共享边的重叠区间。 */
export function sharedEdge(
  a: ProcgenRect,
  b: ProcgenRect,
): { side: 'N' | 'E' | 'S' | 'W'; from: number; to: number } | null {
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  if (overlapY > 0 && a.x + a.w + REGION_GUTTER === b.x) {
    return { side: 'E', from: Math.max(a.y, b.y), to: Math.min(a.y + a.h, b.y + b.h) - 1 };
  }
  if (overlapY > 0 && b.x + b.w + REGION_GUTTER === a.x) {
    return { side: 'W', from: Math.max(a.y, b.y), to: Math.min(a.y + a.h, b.y + b.h) - 1 };
  }
  if (overlapX > 0 && a.y + a.h + REGION_GUTTER === b.y) {
    return { side: 'S', from: Math.max(a.x, b.x), to: Math.min(a.x + a.w, b.x + b.w) - 1 };
  }
  if (overlapX > 0 && b.y + b.h + REGION_GUTTER === a.y) {
    return { side: 'N', from: Math.max(a.x, b.x), to: Math.min(a.x + a.w, b.x + b.w) - 1 };
  }
  return null;
}

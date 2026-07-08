/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 秘境随机地形生成器：噪声场、地形规则映射、元胞自动机平滑、封闭边界。
 */
import { hashStringToUint32, fbmNoise2D, ProcgenRng } from './procgen-random';
import type { ProcgenFieldSpec, ProcgenTerrainRule, ProcgenCondition } from './procgen-types';

/** 生成一张归一化到 [0,1] 的噪声场（按全图实际 min/max 拉伸，保证阈值区间稳定可用）。 */
export function generateField(
  width: number,
  height: number,
  spec: ProcgenFieldSpec,
  seed: string,
): Float32Array {
  const field = new Float32Array(width * height);
  const numericSeed = hashStringToUint32(seed);
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = fbmNoise2D(x, y, numericSeed, spec.octaves, spec.persistence, spec.scale, spec.warp ?? 0);
      field[y * width + x] = value;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }
  const span = max - min;
  if (span > 1e-9) {
    for (let i = 0; i < field.length; i += 1) {
      field[i] = (field[i] - min) / span;
    }
  }
  return field;
}

/** 距地图边缘的切比雪夫距离（格）。 */
export function edgeDistanceOf(x: number, y: number, width: number, height: number): number {
  return Math.min(x, y, width - 1 - x, height - 1 - y);
}

function matchesCondition(
  condition: ProcgenCondition | undefined,
  elevation: number,
  moisture: number,
  edgeDistance: number,
): boolean {
  if (!condition) return true;
  if (condition.elevation && (elevation < condition.elevation[0] || elevation > condition.elevation[1])) return false;
  if (condition.moisture && (moisture < condition.moisture[0] || moisture > condition.moisture[1])) return false;
  if (condition.edgeDistance && (edgeDistance < condition.edgeDistance[0] || edgeDistance > condition.edgeDistance[1])) return false;
  return true;
}

/** 按规则表把噪声场映射为 terrain 地块 id 网格（首条命中优先，未命中用 baseTerrain）。 */
export function assignTerrain(
  width: number,
  height: number,
  elevationField: Float32Array,
  moistureField: Float32Array,
  rules: readonly ProcgenTerrainRule[],
  baseTerrain: string,
): string[] {
  const terrainIds = new Array<string>(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const edgeDistance = edgeDistanceOf(x, y, width, height);
      let picked = baseTerrain;
      for (const rule of rules) {
        if (matchesCondition(rule.when, elevationField[index], moistureField[index], edgeDistance)) {
          picked = rule.tile;
          break;
        }
      }
      terrainIds[index] = picked;
    }
  }
  return terrainIds;
}

/**
 * 元胞自动机多数派平滑：每格取 3x3 邻域内出现最多的地形，消除孤立噪点、让地貌成片。
 * 平票时保留原值，保证确定性。
 */
export function smoothTerrain(width: number, height: number, terrainIds: string[], iterations: number): string[] {
  let current = terrainIds;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = new Array<string>(current.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const counts = new Map<string, number>();
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const tile = current[ny * width + nx];
            counts.set(tile, (counts.get(tile) ?? 0) + 1);
          }
        }
        let best = current[index];
        let bestCount = counts.get(best) ?? 0;
        for (const [tile, count] of counts) {
          if (count > bestCount) {
            best = tile;
            bestCount = count;
          }
        }
        next[index] = best;
      }
    }
    current = next;
  }
  return current;
}

/** 写入封闭边界环：厚度沿边缘随噪声起伏，让秘境边界自然但严格封闭。 */
export function applyBorder(
  width: number,
  height: number,
  terrainIds: string[],
  borderTile: string,
  thicknessRange: readonly [number, number],
  rng: ProcgenRng,
): void {
  const minThickness = Math.max(1, Math.min(thicknessRange[0], thicknessRange[1]));
  const maxThickness = Math.max(minThickness, thicknessRange[0], thicknessRange[1]);
  const seed = Math.floor(rng.next() * 4294967296);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const edgeDistance = edgeDistanceOf(x, y, width, height);
      if (edgeDistance >= maxThickness) continue;
      // 用低频噪声决定当前位置的边界厚度，产生蜿蜒的边缘
      const wave = fbmNoise2D(x, y, seed, 2, 0.5, 9);
      const localThickness = minThickness + Math.round(wave * (maxThickness - minThickness));
      if (edgeDistance < localThickness) {
        terrainIds[y * width + x] = borderTile;
      }
    }
  }
}

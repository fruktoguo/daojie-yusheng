/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 秘境随机地形生成器：确定性随机源与分形值噪声。
 *
 * 所有随机行为都必须经由 ProcgenRng；禁止 Math.random，保证同 seed 同结果。
 */

/** FNV-1a 32 位字符串哈希，把任意字符串 seed 折叠成 uint32。 */
export function hashStringToUint32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32：轻量确定性 PRNG，够地形生成用且跨端一致。 */
export class ProcgenRng {
  private state: number;

  constructor(seed: string | number) {
    this.state = (typeof seed === 'number' ? seed >>> 0 : hashStringToUint32(seed)) || 0x9e3779b9;
  }

  /** [0,1) 均匀随机。 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min,max] 闭区间整数。 */
  int(min: number, max: number): number {
    const lo = Math.ceil(Math.min(min, max));
    const hi = Math.floor(Math.max(min, max));
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  /** 按区间 [min,max] 取一个整数（配置里常用的 tuple 形式）。 */
  intInRange(range: readonly [number, number]): number {
    return this.int(range[0], range[1]);
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.min(items.length - 1, Math.floor(this.next() * items.length))];
  }

  /** 派生一个独立子随机流，互不干扰（不同阶段各用各的流，避免顺序耦合）。 */
  fork(label: string): ProcgenRng {
    return new ProcgenRng((hashStringToUint32(label) ^ Math.floor(this.next() * 4294967296)) >>> 0);
  }
}

/** 2D 格点哈希 → [0,1)，用于值噪声格点值。 */
function latticeValue(ix: number, iy: number, seed: number): number {
  let h = seed >>> 0;
  h = Math.imul(h ^ (ix * 0x27d4eb2d), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (iy * 0x165667b1), 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** 单层 2D 值噪声：双线性插值 + smoothstep。 */
export function valueNoise2D(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smoothstep(x - ix);
  const fy = smoothstep(y - iy);
  const v00 = latticeValue(ix, iy, seed);
  const v10 = latticeValue(ix + 1, iy, seed);
  const v01 = latticeValue(ix, iy + 1, seed);
  const v11 = latticeValue(ix + 1, iy + 1, seed);
  const top = v00 + (v10 - v00) * fx;
  const bottom = v01 + (v11 - v01) * fx;
  return top + (bottom - top) * fy;
}

/** 分形值噪声（fBm），可选域扭曲；返回未归一化值（调用方按全图 min/max 归一）。 */
export function fbmNoise2D(
  x: number,
  y: number,
  seed: number,
  octaves: number,
  persistence: number,
  scale: number,
  warp = 0,
): number {
  let sx = x / Math.max(1, scale);
  let sy = y / Math.max(1, scale);
  if (warp > 0) {
    // 域扭曲：用两个次级噪声场偏移采样坐标，让地貌边界蜿蜒
    const wx = valueNoise2D(sx * 0.7, sy * 0.7, (seed ^ 0x5f356495) >>> 0) - 0.5;
    const wy = valueNoise2D(sx * 0.7 + 31.7, sy * 0.7 + 11.3, (seed ^ 0x2c1b3c6d) >>> 0) - 0.5;
    sx += wx * warp * 4;
    sy += wy * warp * 4;
  }
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  let totalAmplitude = 0;
  const layerCount = Math.max(1, Math.floor(octaves));
  for (let i = 0; i < layerCount; i += 1) {
    total += valueNoise2D(sx * frequency, sy * frequency, (seed + i * 0x9e3779b9) >>> 0) * amplitude;
    totalAmplitude += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }
  return total / Math.max(1e-9, totalAmplitude);
}

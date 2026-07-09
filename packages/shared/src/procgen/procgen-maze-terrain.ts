/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 秘境随机地形生成器：地形迷宫的骨架栅格化与距离场。
 *
 * 「山崖迷宫」的做法是把迷宫拓扑当作**通道骨架**，而不是直接把墙画成一格格砖：
 *   1. 骨架 = 单元格中心 + 相连单元格之间的连线 + 门位引线，全部标进一个 mask；
 *   2. 对全区求「到骨架的距离场」；
 *   3. 通道半径由噪声调制，距离 ≤ 半径的格是通道，其余是山体。
 *
 * 连通性由此成为构造不变量：骨架格的距离恒为 0，而半径恒 ≥ 0，所以整条骨架必然可走；
 * 骨架本身连通且包含所有门位，区内可走面因而连通、且必然接得上每一扇门。
 * 这比「先砌墙再凿 stub」强：不存在「stub 没凿通」的失败模式。
 */

/** 距离场用 chamfer(3,4) 近似欧氏距离：正交步进 3、对角步进 4，除以 3 即为格数。 */
export const CHAMFER_UNIT = 3;
const CHAMFER_ORTHOGONAL = 3;
const CHAMFER_DIAGONAL = 4;
const CHAMFER_INFINITY = 1 << 28;

/**
 * 画一条**蜿蜒**的轴对齐线段：沿主轴推进，副轴按 wobble 概率随机偏移。
 *
 * 偏移上限在两端线性收敛到 0，因此线段的起讫点精确落在给定坐标上 ——
 * 骨架靠「段的端点 = 单元格中心」拼接，端点漂移会把骨架撕成两截。
 *
 * 副轴每偏移一格都会补画中间格，线因而始终 4-连通；这是通道连通性的前提。
 */
export function stampWobblySegment(
  mask: Uint8Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  maxOffset: number,
  wobble: number,
  rng: { chance(p: number): boolean },
): void {
  const horizontal = y0 === y1;
  const from = horizontal ? x0 : y0;
  const to = horizontal ? x1 : y1;
  const fixed = horizontal ? y0 : x0;
  const step = Math.sign(to - from);
  if (step === 0 || maxOffset <= 0 || wobble <= 0) {
    stampSegment(mask, width, height, x0, y0, x1, y1);
    return;
  }

  const span = Math.abs(to - from);
  const put = (main: number, cross: number): void => {
    const x = horizontal ? main : cross;
    const y = horizontal ? cross : main;
    if (x >= 0 && y >= 0 && x < width && y < height) mask[y * width + x] = 1;
  };

  /** 在 main 这一列上补画 [a, b] 区间的副轴格，跨越多格时不留空洞。 */
  const putRange = (main: number, a: number, b: number): void => {
    for (let cross = Math.min(a, b); cross <= Math.max(a, b); cross += 1) put(main, fixed + cross);
  };

  let offset = 0;
  for (let i = 0; i <= span; i += 1) {
    const main = from + i * step;
    // 两端收敛：i=0 与 i=span 处上限为 0，中段放开到 maxOffset。
    const envelope = Math.floor(maxOffset * Math.min(1, (2 * Math.min(i, span - i)) / span));
    const clamped = Math.min(envelope, Math.max(-envelope, offset));
    // 包络收窄会把 offset 拉回好几格，跳过的格必须补画，否则线退化成对角相邻。
    putRange(main, offset, clamped);
    offset = clamped;

    if (i === span || !rng.chance(wobble)) continue;
    const direction = rng.chance(0.5) ? 1 : -1;
    const next = offset + direction;
    if (next > envelope || next < -envelope) continue;
    put(main, fixed + next);
    offset = next;
  }
}

/** 在 mask 上画一条水平或垂直线段（含两端）。骨架只用直角段，不需要 Bresenham。 */
export function stampSegment(
  mask: Uint8Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  const stepX = Math.sign(x1 - x0);
  const stepY = Math.sign(y1 - y0);
  // 只允许轴对齐段；斜段会在距离场里留下锯齿状的通道壁。
  if (stepX !== 0 && stepY !== 0) return;
  let x = x0;
  let y = y0;
  for (;;) {
    if (x >= 0 && y >= 0 && x < width && y < height) mask[y * width + x] = 1;
    if (x === x1 && y === y1) break;
    x += stepX;
    y += stepY;
  }
}

/**
 * 两遍扫描的 chamfer(3,4) 距离变换。返回每格到最近 seed 格的近似距离（单位 = CHAMFER_UNIT/格）。
 *
 * 比多源 BFS 好在：BFS 给的是曼哈顿或切比雪夫距离，前者把通道截面拉成菱形、后者拉成方形，
 * 山体边缘会出现明显的 45° 直棱或直角。chamfer 近似欧氏，通道截面接近圆，配合噪声才像自然峡谷。
 */
export function chamferDistance(width: number, height: number, seeds: Uint8Array): Int32Array {
  const distance = new Int32Array(width * height).fill(CHAMFER_INFINITY);
  for (let index = 0; index < seeds.length; index += 1) {
    if (seeds[index] === 1) distance[index] = 0;
  }
  relaxChamfer(width, height, distance);
  return distance;
}

/** 两遍 chamfer 松弛：field[i] ← min(field[i], field[j] + cost(i,j))，即距离变换本体。 */
function relaxChamfer(width: number, height: number, field: Int32Array): void {
  const relax = (index: number, fromIndex: number, cost: number): void => {
    const candidate = field[fromIndex] + cost;
    if (candidate < field[index]) field[index] = candidate;
  };

  // 前向：左上 → 右下，只看已经处理过的上一行与左邻。
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (y > 0) {
        relax(index, index - width, CHAMFER_ORTHOGONAL);
        if (x > 0) relax(index, index - width - 1, CHAMFER_DIAGONAL);
        if (x < width - 1) relax(index, index - width + 1, CHAMFER_DIAGONAL);
      }
      if (x > 0) relax(index, index - 1, CHAMFER_ORTHOGONAL);
    }
  }
  // 后向：右下 → 左上，补齐另一半方向。
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x;
      if (y < height - 1) {
        relax(index, index + width, CHAMFER_ORTHOGONAL);
        if (x < width - 1) relax(index, index + width + 1, CHAMFER_DIAGONAL);
        if (x > 0) relax(index, index + width - 1, CHAMFER_DIAGONAL);
      }
      if (x < width - 1) relax(index, index + 1, CHAMFER_ORTHOGONAL);
    }
  }
}

/**
 * 把噪声场调制成逐格的通道半径（单位同 chamfer 距离）。
 *
 * 振幅取 baseRadius × roughness，满幅时半径在 [0, 2·base] 间摆动：窄处收成一线天，
 * 宽处张成开阔谷地。振幅若只有零点几格，量化到整数后边界几乎不动，
 * 山体就会退化成等宽直墙 —— 这正是「墙变厚了但还是网格迷宫」的成因。
 *
 * radius 恒 ≥ 0，因此 distance === 0 的骨架格必然落在通道里。
 * 但「骨架可走」不等于「通道内每一格都走得到」，孤岛的清除见 pruneToSeeds。
 */
export function buildRadiusField(
  noise: Float32Array,
  baseRadius: number,
  roughness: number,
): Int32Array {
  const amplitude = baseRadius * Math.min(1, Math.max(0, roughness));
  const radius = new Int32Array(noise.length);
  for (let index = 0; index < noise.length; index += 1) {
    const offset = (noise[index] - 0.5) * 2 * amplitude;
    radius[index] = Math.max(0, Math.round((baseRadius + offset) * CHAMFER_UNIT));
  }
  return radius;
}

/**
 * 就地剔除与骨架**四连通不可达**的通道格（walkable 置 0）。
 *
 * 半径场逐格独立，`{distance ≤ radius}` 会零星长出孤岛：某格靠对角贴着通道，
 * 四个正交邻居的半径却略小、被判成山，这格便四面环山。
 * 光让半径场平滑挡不住——chamfer 距离的最速下降方向本身可以是对角，
 * 而游戏的可走性判定是四连通，对角相邻并不算通。
 *
 * 于是干脆按定义裁剪：区内可走面 ≔ 从骨架出发四连通可达的部分。骨架恒可走且连通、
 * 且包含全部门位，所以裁剪之后「门 → 区内连通」仍是构造不变量，且区内不留任何孤岛。
 */
export function pruneToSeeds(width: number, height: number, seeds: Uint8Array, walkable: Uint8Array): void {
  const queue = new Int32Array(width * height);
  const reached = new Uint8Array(width * height);
  let head = 0;
  let tail = 0;
  for (let index = 0; index < seeds.length; index += 1) {
    if (seeds[index] === 1 && walkable[index] === 1) {
      reached[index] = 1;
      queue[tail++] = index;
    }
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = (index - x) / width;
    if (x > 0) pushCell(index - 1);
    if (x < width - 1) pushCell(index + 1);
    if (y > 0) pushCell(index - width);
    if (y < height - 1) pushCell(index + width);
  }
  for (let index = 0; index < walkable.length; index += 1) {
    if (walkable[index] === 1 && reached[index] === 0) walkable[index] = 0;
  }

  function pushCell(next: number): void {
    if (reached[next] === 1 || walkable[next] !== 1) return;
    reached[next] = 1;
    queue[tail++] = next;
  }
}

/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 秘境随机地形生成器：地板法阵图案（以格子为像素光栅化）。
 *
 * 把房间地板当画布，用一种醒目的「墨色」地块，在格子上逐格点出大图案：
 * 八卦阵（长短爻）、六芒星、五芒星、法阵同心圆。每个格子就是图案的一个像素，
 * 不是「一格贴一张图」。图案是纯装饰，落在 surface 层，不影响可走性。
 *
 * 所有落笔都经 `mask` 裁剪（只画在房间内部可走格上），故图案自动贴合房间轮廓，
 * 越出房间的线段被裁掉。图案不改 structure / terrain，绝不阻挡移动。
 */
import { ProcgenRng } from './procgen-random';

export type FloorPatternKind = 'bagua' | 'hexagram' | 'pentagram' | 'circle-array';

/** 各房型可选的图案（boss 房大，容得下八卦；宝库小，用线条类图案）。 */
export const BOSS_PATTERN_KINDS: readonly FloorPatternKind[] = ['bagua', 'circle-array', 'hexagram'];
export const VAULT_PATTERN_KINDS: readonly FloorPatternKind[] = ['hexagram', 'pentagram', 'circle-array'];

/** 落笔上下文：把墨点打到 surface 层，逐格经 mask 裁剪。 */
interface Ink {
  readonly surfaceIds: (string | null)[];
  readonly mask: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly tile: string;
}

function dot(ink: Ink, x: number, y: number): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= ink.width || yi >= ink.height) return;
  const i = yi * ink.width + xi;
  if (ink.mask[i] === 1) ink.surfaceIds[i] = ink.tile;
}

/** Bresenham 直线（格子像素）。 */
function line(ink: Ink, x0: number, y0: number, x1: number, y1: number): void {
  let ax = Math.round(x0);
  let ay = Math.round(y0);
  const bx = Math.round(x1);
  const by = Math.round(y1);
  const dx = Math.abs(bx - ax);
  const dy = -Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    dot(ink, ax, ay);
    if (ax === bx && ay === by) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; ax += sx; }
    if (e2 <= dx) { err += dx; ay += sy; }
  }
}

/** 中点画圆的轮廓（格子像素），只描边不填充。 */
function circle(ink: Ink, cx: number, cy: number, r: number): void {
  if (r < 1) { dot(ink, cx, cy); return; }
  // 按弧长步进，步长取 1/r 保证相邻采样点相邻不断裂。
  const steps = Math.max(8, Math.ceil(2 * Math.PI * r));
  for (let s = 0; s < steps; s += 1) {
    const a = (s / steps) * Math.PI * 2;
    dot(ink, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
}

/** 把角度序列的顶点首尾相连成闭合多边形。 */
function polygon(ink: Ink, cx: number, cy: number, r: number, angles: readonly number[]): void {
  for (let i = 0; i < angles.length; i += 1) {
    const a0 = angles[i];
    const a1 = angles[(i + 1) % angles.length];
    line(ink, cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
  }
}

/** 六芒星：两个反向等边三角形叠加（大卫之星）。 */
function stampHexagram(ink: Ink, cx: number, cy: number, r: number): void {
  const up = [-Math.PI / 2, -Math.PI / 2 + (2 * Math.PI) / 3, -Math.PI / 2 + (4 * Math.PI) / 3];
  const down = up.map((a) => a + Math.PI);
  polygon(ink, cx, cy, r, up);
  polygon(ink, cx, cy, r, down);
  circle(ink, cx, cy, r);
}

/** 五芒星：五个顶点隔一相连（一笔画星形）。 */
function stampPentagram(ink: Ink, cx: number, cy: number, r: number): void {
  const pts: [number, number][] = [];
  for (let k = 0; k < 5; k += 1) {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  for (let k = 0; k < 5; k += 1) {
    const p = pts[k];
    const q = pts[(k + 2) % 5];
    line(ink, p[0], p[1], q[0], q[1]);
  }
  circle(ink, cx, cy, r);
}

/** 法阵同心圆：两圈同心圆 + 若干放射状辐条。 */
function stampCircleArray(ink: Ink, cx: number, cy: number, r: number, rng: ProcgenRng): void {
  circle(ink, cx, cy, r);
  circle(ink, cx, cy, r * 0.62);
  const spokes = rng.int(6, 8);
  for (let k = 0; k < spokes; k += 1) {
    const a = (k * 2 * Math.PI) / spokes;
    line(ink, cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  dot(ink, cx, cy);
}

// 先天八卦（八个卦象，bit=1 阳爻实线、bit=0 阴爻断线；数组下标 = 由内向外的三爻）。
const BAGUA_TRIGRAMS: readonly (readonly [number, number, number])[] = [
  [1, 1, 1], // 乾
  [1, 1, 0], // 兑
  [1, 0, 1], // 离
  [1, 0, 0], // 震
  [0, 1, 1], // 巽
  [0, 1, 0], // 坎
  [0, 0, 1], // 艮
  [0, 0, 0], // 坤
];

/** 单条爻：在半径 rr 处沿切向画一段横线；阳爻整段实线，阴爻中间留一段明显缺口。 */
function stampYao(ink: Ink, cx: number, cy: number, angle: number, rr: number, half: number, yang: number): void {
  const tx = -Math.sin(angle);
  const ty = Math.cos(angle);
  const bx = cx + Math.cos(angle) * rr;
  const by = cy + Math.sin(angle) * rr;
  if (yang === 1) {
    line(ink, bx - tx * half, by - ty * half, bx + tx * half, by + ty * half);
  } else {
    // 阴爻：缺口至少 1 格宽，长短线一眼可辨。
    const gap = Math.max(1, half * 0.5);
    line(ink, bx - tx * half, by - ty * half, bx - tx * gap, by - ty * gap);
    line(ink, bx + tx * gap, by + ty * gap, bx + tx * half, by + ty * half);
  }
}

/** 八卦阵：外圈 + 内圈，两圈之间沿八方位摆八卦，每卦三爻由内向外、长短横线清晰。 */
function stampBagua(ink: Ink, cx: number, cy: number, r: number): void {
  circle(ink, cx, cy, r);
  circle(ink, cx, cy, r * 0.42);
  const half = Math.max(2, r * 0.2);     // 爻的半长（切向），至少 4 格总长
  const levels = [0.56, 0.74, 0.92];     // 三爻由内向外所在的半径比例，拉开间距
  for (let dir = 0; dir < 8; dir += 1) {
    const angle = (dir * 2 * Math.PI) / 8 - Math.PI / 2;
    const trigram = BAGUA_TRIGRAMS[dir];
    for (let yao = 0; yao < 3; yao += 1) {
      stampYao(ink, cx, cy, angle, r * levels[yao], half, trigram[yao]);
    }
  }
}

/**
 * 在房间地板上光栅化一个法阵图案，只画在 mask 内的可走格。返回落墨格数。
 * cx/cy 为图案中心，radius 为图案半径（格），tile 为墨色 surface 地块 id。
 */
export function stampFloorPattern(
  surfaceIds: (string | null)[],
  mask: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  kind: FloorPatternKind,
  tile: string,
  rng: ProcgenRng,
): number {
  const ink: Ink = { surfaceIds, mask, width, height, tile };
  switch (kind) {
    case 'bagua': stampBagua(ink, cx, cy, radius); break;
    case 'hexagram': stampHexagram(ink, cx, cy, radius); break;
    case 'pentagram': stampPentagram(ink, cx, cy, radius); break;
    case 'circle-array': stampCircleArray(ink, cx, cy, radius, rng); break;
  }
  let painted = 0;
  for (let i = 0; i < surfaceIds.length; i += 1) if (surfaceIds[i] === tile) painted += 1;
  return painted;
}

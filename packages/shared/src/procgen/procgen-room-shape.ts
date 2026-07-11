/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 秘境随机地形生成器：房间形状 mask。
 *
 * 人造房间若全是矩形，整图就是一堆方盒子，太刻意。这里按种子给宝库 / boss 房挑一种
 * 形状（椭圆、菱形、八边形、心形、有机 blob），生成一张「哪些格是房间内部」的布尔场；
 * 挖空、周界墙、开门都基于这张场（见 procgen-dungeon.ts），与矩形房共用同一套流程。
 *
 * 三条不变量，所有形状都必须满足，否则门位通道会进不去某些格：
 *   1. 单连通 —— 凸形（椭圆/菱形/八边形）天然满足；心形的顶部凹口不切断连通；
 *      blob 用「半径随角单值」的星形域，同样单连通。
 *   2. 房心 (cx,cy) 落在内部 —— 上述形状的中心恒在内部，锚点与柱阵据此摆放。
 *   3. 不越出 [0,width)×[0,height) —— 由调用方传入的 rx/ry 保证房间框在画布内。
 */
import { ProcgenRng } from './procgen-random';

export type RoomShapeKind = 'rect' | 'ellipse' | 'diamond' | 'octagon' | 'heart' | 'blob';

export interface RoomShape {
  /** width*height，1 = 房间内部可走空间。 */
  readonly cells: Uint8Array;
  readonly width: number;
  readonly height: number;
  /** 房心（保证 cells 内为 1）。 */
  readonly cx: number;
  readonly cy: number;
  /** 半轴（格）。地板图案据此定尺寸内切。 */
  readonly rx: number;
  readonly ry: number;
  readonly kind: RoomShapeKind;
}

/** 宝库偏爱棱角分明的「宝库感」形状；boss 房偏爱大而有机的形状。 */
export const VAULT_SHAPE_KINDS: readonly RoomShapeKind[] = ['ellipse', 'diamond', 'octagon', 'blob'];
export const BOSS_SHAPE_KINDS: readonly RoomShapeKind[] = ['ellipse', 'heart', 'blob', 'octagon'];

/** 心形隐函数 (x²+y²−1)³ − x²y³ ≤ 0。传入已归一化、且 y 已翻转为「上为正」的坐标。 */
function insideHeart(nx: number, ny: number): boolean {
  const a = nx * nx + ny * ny - 1;
  return a * a * a - nx * nx * ny * ny * ny <= 0;
}

/**
 * blob：椭圆基半径按角度做 3 谐波扰动，相位由 rng 决定。
 * 幅度上限 ≈ 0.43 < 1，半径恒正 → 星形域，单连通且中心在内。
 */
function makeBlobRadial(rng: ProcgenRng): (angle: number) => number {
  const p1 = rng.next() * Math.PI * 2;
  const p2 = rng.next() * Math.PI * 2;
  const p3 = rng.next() * Math.PI * 2;
  return (angle: number): number =>
    1 + 0.22 * Math.sin(3 * angle + p1) + 0.13 * Math.sin(5 * angle + p2) + 0.08 * Math.sin(2 * angle + p3);
}

/**
 * 生成房间形状 mask。cx/cy 为房心，rx/ry 为半轴（格），kind 决定轮廓。
 * 所有判定都以「归一化到单位圆/单位菱形」的 (dx/rx, dy/ry) 进行，故形状随房间尺寸等比缩放。
 */
export function buildRoomShape(
  width: number,
  height: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  kind: RoomShapeKind,
  rng: ProcgenRng,
): RoomShape {
  const cells = new Uint8Array(width * height);
  const blobRadial = kind === 'blob' ? makeBlobRadial(rng) : null;
  const inside = (dx: number, dy: number): boolean => {
    const ux = dx / rx;
    const uy = dy / ry;
    switch (kind) {
      case 'rect':
        return Math.abs(ux) <= 1 && Math.abs(uy) <= 1;
      case 'ellipse':
        return ux * ux + uy * uy <= 1;
      case 'diamond':
        return Math.abs(ux) + Math.abs(uy) <= 1;
      case 'octagon':
        // 矩形切四角：既在外接矩形内，又在放大 1.5 倍的菱形内。
        return Math.abs(ux) <= 1 && Math.abs(uy) <= 1 && Math.abs(ux) + Math.abs(uy) <= 1.5;
      case 'heart': {
        // 心形正立、尖朝下：屏幕 y 向下，故翻转 uy；横向留 1.15 让最宽处贴住 rx。
        const nx = ux * 1.15;
        const ny = -uy;
        return insideHeart(nx, ny);
      }
      case 'blob': {
        const angle = Math.atan2(dy, dx);
        const r = blobRadial!(angle);
        return ux * ux + uy * uy <= r * r;
      }
      default:
        return false;
    }
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (inside(x - cx, y - cy)) cells[y * width + x] = 1;
    }
  }
  // 不变量兜底：房心必须可走。心形/blob 极端参数下若房心恰好落空，强制置 1，
  // 保证门位通道终点与锚点始终有立足之地。
  cells[cy * width + cx] = 1;
  return { cells, width, height, cx, cy, rx, ry, kind };
}

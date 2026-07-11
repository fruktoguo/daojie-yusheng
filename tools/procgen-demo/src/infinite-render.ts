/**
 * 无限世界 demo：世界坐标相机 + chunk 离屏缓存合成。
 *
 * 每帧不再逐格 drawTile + 整屏重扫 dual-grid，而是把可见的每个 chunk 的离屏 canvas
 * （见 infinite-chunk-canvas.ts，首次可见时渲染一次）blit 到主画布对应位置——移动时
 * 只做十几次 drawImage，开销与视口格数解耦。相机以世界坐标定位，支持平移与缩放。
 */
import type { ChunkCanvasCache } from './infinite-chunk-canvas';
import type { InfiniteWorld } from './infinite-world';

/** 相机：世界坐标 (x,y) 落在画布正中，cellSize 为每格像素（整数，缩放已量化）。 */
export interface Camera {
  x: number;
  y: number;
  cellSize: number;
}

function drawPlayer(ctx: CanvasRenderingContext2D, px: number, py: number, cellSize: number): void {
  const r = Math.max(4, cellSize * 0.42);
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd24a';
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, cellSize * 0.12);
  ctx.strokeStyle = '#1a1a1a';
  ctx.stroke();
}

/** 渲染一帧。返回可见 chunk 数与格范围（供 HUD）。 */
export function renderInfinite(
  canvas: HTMLCanvasElement,
  world: InfiniteWorld,
  cache: ChunkCanvasCache,
  cam: Camera,
  useSprites: boolean,
): { chunks: number; cols: number; rows: number } {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { chunks: 0, cols: 0, rows: 0 };
  const W = canvas.width;
  const H = canvas.height;
  const cs = cam.cellSize;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, W, H);

  const S = world.chunkSize;
  // 世界像素 → 画布像素：世界格中心对齐相机、相机落在画布中心。
  const offsetX = -cam.x * cs + W / 2;
  const offsetY = -cam.y * cs + H / 2;

  // 可见世界格范围 → 可见 chunk 范围（外扩由 chunk 粒度天然覆盖，无需逐格 +1）。
  const cx0 = Math.floor((cam.x - W / 2 / cs) / S);
  const cx1 = Math.floor((cam.x + W / 2 / cs) / S);
  const cy0 = Math.floor((cam.y - H / 2 / cs) / S);
  const cy1 = Math.floor((cam.y + H / 2 / cs) / S);

  let chunks = 0;
  for (let cy = cy0; cy <= cy1; cy += 1) {
    for (let cx = cx0; cx <= cx1; cx += 1) {
      const cv = cache.get(cx, cy, cs, useSprites);
      // S*cs 为整数、相邻块 destX 差恰为 S*cs，round 后精确相接、无缝无重叠。
      const dx = Math.round(cx * S * cs + offsetX);
      const dy = Math.round(cy * S * cs + offsetY);
      ctx.drawImage(cv, dx, dy);
      chunks += 1;
    }
  }

  drawPlayer(ctx, W / 2, H / 2, cs);
  return { chunks, cols: (cx1 - cx0 + 1) * S, rows: (cy1 - cy0 + 1) * S };
}

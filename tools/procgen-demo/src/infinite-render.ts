/**
 * 无限世界 demo：世界坐标相机 + 视口裁剪渲染。
 *
 * 只画相机可见范围内的格（外扩 1 圈防边缘缺角），格子经 world.tileAt 懒生成。
 * 贴图走游戏运行时图包（drawTile 基底 + dual-grid 过渡边缘，与线上一致），
 * 缺图集时回退游戏同款底色。相机以世界坐标定位，支持平移与缩放。
 */
import type { RuntimeImagePack, RuntimeTileVisualSource } from '../../../packages/client/src/renderer/runtime-image-pack';
import { TILE_VISUAL_BG_COLORS } from '../../../packages/shared/src/constants/visuals/terrain';
import type { InfiniteWorld } from './infinite-world';

/** 相机：世界坐标 (x,y) 落在画布正中，cellSize 为每格像素。 */
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

/** 渲染一帧。返回可见格范围（供调试/HUD）。 */
export function renderInfinite(
  canvas: HTMLCanvasElement,
  world: InfiniteWorld,
  cam: Camera,
  pack: RuntimeImagePack | null,
  useSprites: boolean,
): { cols: number; rows: number } {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { cols: 0, rows: 0 };
  const W = canvas.width;
  const H = canvas.height;
  const cs = cam.cellSize;
  ctx.clearRect(0, 0, W, H);

  const halfCols = W / 2 / cs;
  const halfRows = H / 2 / cs;
  const wx0 = Math.floor(cam.x - halfCols) - 1;
  const wy0 = Math.floor(cam.y - halfRows) - 1;
  const wx1 = Math.ceil(cam.x + halfCols) + 1;
  const wy1 = Math.ceil(cam.y + halfRows) + 1;
  const offsetX = -cam.x * cs + W / 2;
  const offsetY = -cam.y * cs + H / 2;

  const activePack = useSprites ? pack : null;
  let drewSprite = false;
  for (let wy = wy0; wy <= wy1; wy += 1) {
    for (let wx = wx0; wx <= wx1; wx += 1) {
      const tile = world.tileAt(wx, wy);
      if (!tile) continue;
      const px = Math.floor(wx * cs + offsetX);
      const py = Math.floor(wy * cs + offsetY);
      const drawn = activePack ? activePack.drawTile(ctx, tile, px, py, cs) : false;
      if (drawn) {
        drewSprite = true;
      } else {
        ctx.fillStyle = TILE_VISUAL_BG_COLORS[tile.type] ?? '#111';
        ctx.fillRect(px, py, Math.ceil(cs) + 1, Math.ceil(cs) + 1);
      }
    }
  }

  if (activePack && drewSprite) {
    activePack.drawDualGridTiles(ctx, {
      startGX: wx0,
      startGY: wy0,
      endGX: wx1,
      endGY: wy1,
      cellSize: cs,
      offsetX,
      offsetY,
      tileAt: (x, y): RuntimeTileVisualSource | null => world.tileAt(x, y),
    });
  }

  drawPlayer(ctx, W / 2, H / 2, cs);
  return { cols: wx1 - wx0 + 1, rows: wy1 - wy0 + 1 };
}

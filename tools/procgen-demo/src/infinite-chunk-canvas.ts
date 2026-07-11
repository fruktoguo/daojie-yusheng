/**
 * 无限世界 demo 性能核心：把每个 chunk 预渲染到离屏 canvas 并缓存。
 *
 * 移动时相机每帧平滑偏移，但各 chunk 的像素内容不变——所以把「基底贴图 + dual-grid
 * 过渡边缘」在 chunk 首次可见时渲染一次、缓存成离屏 canvas，之后每帧只 blit 十几张，
 * 而不是逐格 drawTile + 整屏重扫 dual-grid（上千次 drawImage）。这是移动流畅的关键。
 *
 * 跨块无缝：每张 chunk canvas 精确覆盖世界像素区 [cx*S*cs,(cx+1)*S*cs)。dual-grid 用
 * 世界全局 tileAt 跨块读邻格，顶点 sprite 画在格角、横跨相邻两格；块边界处溢出 canvas 的
 * 半格 sprite 被 canvas 边界自然裁剪，邻块各画自己那半，blit 回世界坐标后严丝合缝。
 * 前提：cellSize 为整数，故 canvas 尺寸 = S*cs 精确落在格线上（demo 已量化缩放为整数）。
 */
import type { RuntimeImagePack, RuntimeTileVisualSource } from '../../../packages/client/src/renderer/runtime-image-pack';
import { TILE_VISUAL_BG_COLORS } from '../../../packages/shared/src/constants/visuals/terrain';
import type { InfiniteWorld } from './infinite-world';

interface CachedCanvas {
  canvas: HTMLCanvasElement;
  cellSize: number;
  useSprites: boolean;
  lastUsed: number;
}

/** 离屏 canvas 张数上限：够覆盖视口 + 数圈缓冲，超出按 LRU 淘汰，内存有界。 */
const MAX_CACHED = 64;

export class ChunkCanvasCache {
  private readonly cache = new Map<string, CachedCanvas>();
  private tick = 0;

  constructor(
    private readonly world: InfiniteWorld,
    private readonly pack: RuntimeImagePack | null,
  ) {}

  /** 换 seed / 图集加载完成：整体失效，下次按需重渲染。 */
  clear(): void {
    this.cache.clear();
  }

  beginFrame(): void {
    this.tick += 1;
  }

  get size(): number {
    return this.cache.size;
  }

  /** 取某块的离屏 canvas；缓存命中直接返回，缺失或参数（缩放/贴图开关）变则重渲染。 */
  get(cx: number, cy: number, cellSize: number, useSprites: boolean): HTMLCanvasElement {
    const key = `${cx},${cy}`;
    const hit = this.cache.get(key);
    if (hit && hit.cellSize === cellSize && hit.useSprites === useSprites) {
      hit.lastUsed = this.tick;
      return hit.canvas;
    }
    // 复用旧 canvas 元素（换缩放时避免频繁 GC/新建）。
    const canvas = hit?.canvas ?? document.createElement('canvas');
    this.render(canvas, cx, cy, cellSize, useSprites);
    this.cache.set(key, { canvas, cellSize, useSprites, lastUsed: this.tick });
    if (this.cache.size > MAX_CACHED) {
      this.evictLru();
    }
    return canvas;
  }

  private evictLru(): void {
    let oldestKey: string | null = null;
    let oldest = Infinity;
    for (const [key, entry] of this.cache) {
      if (entry.lastUsed < oldest) {
        oldest = entry.lastUsed;
        oldestKey = key;
      }
    }
    if (oldestKey !== null) {
      this.cache.delete(oldestKey);
    }
  }

  /** 把一块渲染到离屏 canvas：基底贴图（缺图集回退底色）+ dual-grid 过渡边缘。 */
  private render(canvas: HTMLCanvasElement, cx: number, cy: number, cs: number, useSprites: boolean): void {
    const world = this.world;
    const S = world.chunkSize;
    const dim = S * cs;
    canvas.width = dim;
    canvas.height = dim;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, dim, dim);

    const baseGX = cx * S;
    const baseGY = cy * S;
    // 局部像素 = (世界格 - baseG) * cs，即 offset = -baseG*cs，令 dual-grid 顶点落在局部坐标。
    const offsetX = -baseGX * cs;
    const offsetY = -baseGY * cs;
    const pack = useSprites ? this.pack : null;

    let drewSprite = false;
    for (let ly = 0; ly < S; ly += 1) {
      for (let lx = 0; lx < S; lx += 1) {
        const tile = world.tileAt(baseGX + lx, baseGY + ly);
        if (!tile) continue;
        const px = lx * cs;
        const py = ly * cs;
        const drawn = pack ? pack.drawTile(ctx, tile, px, py, cs) : false;
        if (drawn) {
          drewSprite = true;
        } else {
          ctx.fillStyle = TILE_VISUAL_BG_COLORS[tile.type] ?? '#111';
          ctx.fillRect(px, py, cs, cs);
        }
      }
    }

    if (pack && drewSprite) {
      pack.drawDualGridTiles(ctx, {
        startGX: baseGX,
        startGY: baseGY,
        endGX: baseGX + S - 1,
        endGY: baseGY + S - 1,
        cellSize: cs,
        offsetX,
        offsetY,
        tileAt: (x, y): RuntimeTileVisualSource | null => world.tileAt(x, y),
      });
    }
  }
}

import {
  TILE_VISUAL_BG_COLORS,
  TILE_VISUAL_GLYPHS,
  TILE_VISUAL_GLYPH_COLORS,
  type TileType,
} from '@mud/shared-next';
import { buildCanvasFont } from '../constants/ui/text';

/** 地块精灵对象，用于命中率高的像素绘制缓存。 */
export interface TileSprite {
  key: string;
  tileType: TileType;
  cellSize: number;
  canvas: HTMLCanvasElement;
}

/** 精灵缓存条目，记录最近使用序号用于 LRU 淘汰。 */
interface TileSpriteCacheEntry extends TileSprite {
  lastAccess: number;
}

/** 可配置的地块精灵缓存参数。 */
interface TileSpriteCacheOptions {
  maxEntries?: number;
}

/** 默认最大缓存条目数。 */
const DEFAULT_MAX_ENTRIES = 512;

/** 统一格子像素尺寸，保证同一尺寸下复用缓存。 */
function normalizeCellSize(cellSize: number): number {
  if (!Number.isFinite(cellSize)) {
    return 1;
  }
  return Math.max(1, Math.round(cellSize));
}

/** 以地块类型与像素大小生成精灵键。 */
function buildSpriteKey(tileType: TileType, cellSize: number): string {
  return `${tileType}:${cellSize}`;
}

/** 创建用于缓存绘制结果的离屏画布。 */
function createSpriteCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

/** 按格子类型和尺寸绘制单张地块贴图。 */
function renderTileSprite(canvas: HTMLCanvasElement, tileType: TileType, cellSize: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  const bgColor = TILE_VISUAL_BG_COLORS[tileType] ?? '#333';
  const glyph = TILE_VISUAL_GLYPHS[tileType];
  const glyphColor = TILE_VISUAL_GLYPH_COLORS[tileType] ?? 'rgba(0,0,0,0.2)';

  ctx.clearRect(0, 0, cellSize, cellSize);

  // 背景：填充地块底色。
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, cellSize, cellSize);

  // 边框：描边分隔格子视觉边界。
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(0, 0, cellSize, cellSize);

  // 图标：渲染地块符号。
  if (glyph) {
    ctx.fillStyle = glyphColor;
    ctx.font = buildCanvasFont('tileGlyph', cellSize * 0.6);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, cellSize / 2, cellSize / 2 + 1);
  }
}

/** 地块 Sprite LRU 缓存，避免每帧重复重绘。 */
export class TileSpriteCache {
  /** 精灵缓存 Map，键为 tileType:size。 */
  private readonly cache = new Map<string, TileSpriteCacheEntry>();
  /** 上限容量，超过时触发淘汰。 */
  private readonly maxEntries: number;
  /** 全局访问序号，用于估算最近最少使用。 */
  private accessSerial = 1;

  /** 初始化最大容量，防止配置异常导致内存暴涨。 */
  constructor(options?: TileSpriteCacheOptions) {
    const requestedLimit = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.maxEntries = Math.max(64, Math.floor(requestedLimit));
  }

  /** 按类型与尺寸取回缓存；未命中时创建并写缓存。 */
  getSprite(tileType: TileType, cellSize: number): TileSprite {
    const normalizedSize = normalizeCellSize(cellSize);
    const key = buildSpriteKey(tileType, normalizedSize);
    const hit = this.cache.get(key);
    if (hit) {
      hit.lastAccess = this.accessSerial++;
      return hit;
    }

    const canvas = createSpriteCanvas(normalizedSize);
    renderTileSprite(canvas, tileType, normalizedSize);
    const created: TileSpriteCacheEntry = {
      key,
      tileType,
      cellSize: normalizedSize,
      canvas,
      lastAccess: this.accessSerial++,
    };
    this.cache.set(key, created);
    this.evictIfNeeded();
    return created;
  }

  drawSprite(
    ctx: CanvasRenderingContext2D,
    tileType: TileType,
    cellSize: number,
    sx: number,
    sy: number,
  ): TileSprite {
    const sprite = this.getSprite(tileType, cellSize);
    ctx.drawImage(sprite.canvas, sx, sy);
    return sprite;
  }

  /** 清空全部精灵缓存。 */
  clear(): void {
    this.cache.clear();
  }

  /** 按当前格子尺寸清理对应版本的精灵缓存。 */
  deleteByCellSize(cellSize: number): void {
    const normalizedSize = normalizeCellSize(cellSize);
    const suffix = `:${normalizedSize}`;
    for (const key of this.cache.keys()) {
      if (key.endsWith(suffix)) {
        this.cache.delete(key);
      }
    }
  }

  /** 预热常用地块类型，避免首帧抖动。 */
  prewarm(tileTypes: Iterable<TileType>, cellSize: number): void {
    for (const tileType of tileTypes) {
      this.getSprite(tileType, cellSize);
    }
  }

  /** 当前缓存条目数量。 */
  size(): number {
    return this.cache.size;
  }

  /** 超量后清理最旧访问条目。 */
  private evictIfNeeded(): void {
    if (this.cache.size <= this.maxEntries) {
      return;
    }

    let oldestKey: string | null = null;
    let oldestAccess = Number.POSITIVE_INFINITY;
    for (const [key, entry] of this.cache) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}




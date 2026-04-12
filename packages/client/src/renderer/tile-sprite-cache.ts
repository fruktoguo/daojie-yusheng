import {
  TILE_VISUAL_BG_COLORS,
  TILE_VISUAL_GLYPHS,
  TILE_VISUAL_GLYPH_COLORS,
  type TileType,
} from '@mud/shared';
import { buildCanvasFont } from '../constants/ui/text';

/** TileSprite：定义该接口的能力与字段约束。 */
export interface TileSprite {
  key: string;
  tileType: TileType;
  cellSize: number;
  canvas: HTMLCanvasElement;
}

/** TileSpriteCacheEntry：定义该接口的能力与字段约束。 */
interface TileSpriteCacheEntry extends TileSprite {
  lastAccess: number;
}

/** TileSpriteCacheOptions：定义该接口的能力与字段约束。 */
interface TileSpriteCacheOptions {
  maxEntries?: number;
}

const DEFAULT_MAX_ENTRIES = 512;

/** normalizeCellSize：执行对应的业务逻辑。 */
function normalizeCellSize(cellSize: number): number {
  if (!Number.isFinite(cellSize)) {
    return 1;
  }
  return Math.max(1, Math.round(cellSize));
}

/** buildSpriteKey：执行对应的业务逻辑。 */
function buildSpriteKey(tileType: TileType, cellSize: number): string {
  return `${tileType}:${cellSize}`;
}

/** createSpriteCanvas：执行对应的业务逻辑。 */
function createSpriteCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

/** renderTileSprite：执行对应的业务逻辑。 */
function renderTileSprite(canvas: HTMLCanvasElement, tileType: TileType, cellSize: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  const bgColor = TILE_VISUAL_BG_COLORS[tileType] ?? '#333';
  const glyph = TILE_VISUAL_GLYPHS[tileType];
  const glyphColor = TILE_VISUAL_GLYPH_COLORS[tileType] ?? 'rgba(0,0,0,0.2)';

  ctx.clearRect(0, 0, cellSize, cellSize);

  // Layer 1: tile background.
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, cellSize, cellSize);

  // Layer 2: tile border.
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(0, 0, cellSize, cellSize);

  // Layer 3: tile glyph.
  if (glyph) {
    ctx.fillStyle = glyphColor;
    ctx.font = buildCanvasFont('tileGlyph', cellSize * 0.6);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, cellSize / 2, cellSize / 2 + 1);
  }
}

/** TileSpriteCache：封装相关状态与行为。 */
export class TileSpriteCache {
  private readonly cache = new Map<string, TileSpriteCacheEntry>();
  private readonly maxEntries: number;
  private accessSerial = 1;

/** constructor：处理当前场景中的对应操作。 */
  constructor(options?: TileSpriteCacheOptions) {
    const requestedLimit = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.maxEntries = Math.max(64, Math.floor(requestedLimit));
  }

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

  clear(): void {
    this.cache.clear();
  }

  deleteByCellSize(cellSize: number): void {
    const normalizedSize = normalizeCellSize(cellSize);
    const suffix = `:${normalizedSize}`;
    for (const key of this.cache.keys()) {
      if (key.endsWith(suffix)) {
        this.cache.delete(key);
      }
    }
  }

  prewarm(tileTypes: Iterable<TileType>, cellSize: number): void {
    for (const tileType of tileTypes) {
      this.getSprite(tileType, cellSize);
    }
  }

  size(): number {
    return this.cache.size;
  }

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


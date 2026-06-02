/**
 * 本文件属于 Canvas 渲染资源层，负责运行时图片图包的可选加载与绘制。
 *
 * 维护时保持非侵入式：manifest 缺失、图片未加载或条目未命中时，调用方必须继续走原字符渲染。
 */
import type { InteractableKind, RenderEntity, StructureType, SurfaceType, TerrainType, Tile, TileType } from '@mud/shared';

type SpriteFit = 'cover' | 'contain';
type ManifestState = 'idle' | 'loading' | 'loaded' | 'error';
type DualGridFadeCurve = 'linear' | 'smooth' | 'ease-in' | 'ease-out';
type DualGridNoiseType = 'hash' | 'value' | 'fractal' | 'cellular';

export interface RuntimeTileVisualSource {
  type: TileType;
  terrainType?: TerrainType;
  surfaceType?: SurfaceType | null;
  structureType?: StructureType | null;
  interactableKinds?: InteractableKind[];
}

export interface RuntimeDualGridDrawOptions {
  startGX: number;
  startGY: number;
  endGX: number;
  endGY: number;
  cellSize: number;
  offsetX: number;
  offsetY: number;
  tileAt: (x: number, y: number) => RuntimeTileVisualSource | null;
}

interface DualGridEdgeOptions {
  range: number;
  fade: number;
  fadeStart: number;
  fadeCurve: DualGridFadeCurve;
  noise: boolean;
  noiseType: DualGridNoiseType;
  noiseScale: number;
  noiseAmount: number;
}

interface DualGridOptions {
  enabled: boolean;
  edge: DualGridEdgeOptions;
}

interface RuntimeImagePackManifest {
  tiles?: Record<string, unknown>;
  legacyTiles?: Record<string, unknown>;
  entities?: Record<string, unknown>;
}

interface AtlasSpriteRef {
  src: string;
  cols: number;
  rows: number;
  col: number;
  row: number;
  colSpan?: number;
  rowSpan?: number;
  insetRatio?: number;
  fit?: SpriteFit;
  dualGrid?: DualGridOptions;
}

interface ImageCacheEntry {
  image: HTMLImageElement;
  state: 'loading' | 'loaded' | 'error';
}

interface DrawTarget {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

const DEFAULT_MANIFEST_URL = '/assets/runtime-image-packs/default/manifest.json';
const DUAL_GRID_ATLAS_COORDS: ReadonlyArray<readonly [number, number]> = [
  [0, 3], [3, 3], [0, 0], [3, 2],
  [0, 2], [1, 2], [2, 3], [3, 1],
  [1, 3], [0, 1], [3, 0], [2, 0],
  [1, 0], [2, 2], [1, 1], [2, 1],
] as const;
const DUAL_GRID_QUADS = [
  { mask: 1, x: 0, y: 0 },
  { mask: 2, x: 0, y: 0.5 },
  { mask: 4, x: 0.5, y: 0 },
  { mask: 8, x: 0.5, y: 0.5 },
] as const;
const DEFAULT_DUAL_GRID_EDGE: DualGridEdgeOptions = Object.freeze({
  range: 40,
  fade: 100,
  fadeStart: 33,
  fadeCurve: 'ease-in',
  noise: true,
  noiseType: 'cellular',
  noiseScale: 20,
  noiseAmount: 50,
});
const MAX_DUAL_GRID_EDGE_CACHE_ENTRIES = 768;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const numeric = Math.trunc(Number(value));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function normalizeNonNegativeInteger(value: unknown, fallback: number): number {
  const numeric = Math.trunc(Number(value));
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

function normalizeSpriteFit(value: unknown): SpriteFit | undefined {
  return value === 'cover' || value === 'contain' ? value : undefined;
}

function normalizePercent(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : fallback;
}

function normalizeFadeCurve(value: unknown, fallback: DualGridFadeCurve): DualGridFadeCurve {
  return value === 'linear' || value === 'smooth' || value === 'ease-in' || value === 'ease-out'
    ? value
    : fallback;
}

function normalizeNoiseType(value: unknown, fallback: DualGridNoiseType): DualGridNoiseType {
  return value === 'hash' || value === 'value' || value === 'fractal' || value === 'cellular'
    ? value
    : fallback;
}

function normalizeDualGridOptions(value: unknown): DualGridOptions | undefined {
  const source = isRecord(value) && isRecord(value.meta) && value.meta.dualGrid !== undefined ? value.meta : value;
  const rawDualGrid = isRecord(source) ? source.dualGrid : undefined;
  const enabled = rawDualGrid === true || (isRecord(rawDualGrid) && rawDualGrid.enabled !== false);
  if (!enabled) {
    return undefined;
  }
  const rawEdge = isRecord(rawDualGrid) && isRecord(rawDualGrid.edge)
    ? rawDualGrid.edge
    : isRecord(source) && isRecord(source.edge)
      ? source.edge
      : {};
  return {
    enabled: true,
    edge: {
      range: normalizePercent(rawEdge.range, DEFAULT_DUAL_GRID_EDGE.range),
      fade: normalizePercent(rawEdge.fade, DEFAULT_DUAL_GRID_EDGE.fade),
      fadeStart: normalizePercent(rawEdge.fadeStart, DEFAULT_DUAL_GRID_EDGE.fadeStart),
      fadeCurve: normalizeFadeCurve(rawEdge.fadeCurve, DEFAULT_DUAL_GRID_EDGE.fadeCurve),
      noise: typeof rawEdge.noise === 'boolean' ? rawEdge.noise : DEFAULT_DUAL_GRID_EDGE.noise,
      noiseType: normalizeNoiseType(rawEdge.noiseType, DEFAULT_DUAL_GRID_EDGE.noiseType),
      noiseScale: normalizePercent(rawEdge.noiseScale, DEFAULT_DUAL_GRID_EDGE.noiseScale),
      noiseAmount: normalizePercent(rawEdge.noiseAmount, DEFAULT_DUAL_GRID_EDGE.noiseAmount),
    },
  };
}

function resolveManifestAssetUrl(manifestUrl: string, src: string): string {
  if (src.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(src)) {
    return src;
  }
  try {
    return new URL(src, new URL(manifestUrl, window.location.href)).toString();
  } catch {
    const base = manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1);
    return `${base}${src}`;
  }
}

function normalizeSpriteRef(value: unknown, manifestUrl: string): AtlasSpriteRef | null {
  if (!isRecord(value) || typeof value.src !== 'string' || value.src.trim().length === 0) {
    return null;
  }
  return {
    src: resolveManifestAssetUrl(manifestUrl, value.src.trim()),
    cols: normalizePositiveInteger(value.cols, 1),
    rows: normalizePositiveInteger(value.rows, 1),
    col: normalizeNonNegativeInteger(value.col, 0),
    row: normalizeNonNegativeInteger(value.row, 0),
    colSpan: normalizePositiveInteger(value.colSpan, 1),
    rowSpan: normalizePositiveInteger(value.rowSpan, 1),
    insetRatio: Number.isFinite(Number(value.insetRatio)) ? Math.max(0, Math.min(0.4, Number(value.insetRatio))) : undefined,
    fit: normalizeSpriteFit(value.fit),
    dualGrid: normalizeDualGridOptions(value),
  };
}

function normalizeSpriteMap(value: unknown, manifestUrl: string): Map<string, AtlasSpriteRef> {
  const result = new Map<string, AtlasSpriteRef>();
  if (!isRecord(value)) {
    return result;
  }
  for (const [key, rawRef] of Object.entries(value)) {
    const normalizedKey = key.trim();
    const ref = normalizeSpriteRef(rawRef, manifestUrl);
    if (normalizedKey && ref) {
      result.set(normalizedKey, ref);
    }
  }
  return result;
}

function normalizeLegacyTileMap(value: unknown): Map<string, string> {
  const result = new Map<string, string>();
  if (!isRecord(value)) {
    return result;
  }
  for (const [key, rawValue] of Object.entries(value)) {
    const normalizedKey = key.trim();
    const mappedKey = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (normalizedKey && mappedKey) {
      result.set(normalizedKey, mappedKey);
    }
  }
  return result;
}

function resolveTopTileSpriteKey(tile: Tile, legacyTileKeys: ReadonlyMap<string, string>): string | null {
  const structureType = typeof tile.structureType === 'string' && tile.structureType.length > 0
    ? tile.structureType
    : null;
  if (structureType) {
    return `structure:${structureType}`;
  }

  const interactable = Array.isArray(tile.interactableKinds)
    ? tile.interactableKinds.find((kind) => typeof kind === 'string' && kind.length > 0)
    : undefined;
  if (interactable) {
    return `interactable:${interactable}`;
  }

  const surfaceType = typeof tile.surfaceType === 'string' && tile.surfaceType.length > 0
    ? tile.surfaceType
    : null;
  if (surfaceType) {
    return `surface:${surfaceType}`;
  }

  const terrainType = typeof tile.terrainType === 'string' && tile.terrainType.length > 0
    ? tile.terrainType
    : null;
  if (terrainType) {
    return `terrain:${terrainType}`;
  }

  return legacyTileKeys.get(tile.type) ?? null;
}

function resolveTileSpriteKey(tile: RuntimeTileVisualSource, legacyTileKeys: ReadonlyMap<string, string>): string | null {
  return resolveTopTileSpriteKey(tile as Tile, legacyTileKeys);
}

function normalizeEntityName(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase().replace(/[^a-z0-9_\-\u3400-\u9fff]+/gu, '_').replace(/^_+|_+$/g, '');
  return normalized ? normalized : null;
}

function resolveEntitySpriteKeys(entity: Pick<RenderEntity, 'id' | 'kind' | 'name' | 'char'>): string[] {
  const id = normalizeEntityName(entity.id);
  const name = normalizeEntityName(entity.name);
  const char = normalizeEntityName(entity.char);
  switch (entity.kind) {
    case 'monster':
      return [id && `monster:${id}`, name && `monster:${name}`, char && `monster:${char}`, 'monster:default'].filter(Boolean) as string[];
    case 'npc':
      return [id && `npc:${id}`, name && `npc:${name}`, char && `npc:${char}`, 'npc:default'].filter(Boolean) as string[];
    case 'player':
      return [id && `player:${id}`, name && `player:${name}`, 'player:default'].filter(Boolean) as string[];
    default:
      return [];
  }
}

function calculateDrawTarget(dx: number, dy: number, size: number, image: HTMLImageElement, ref: AtlasSpriteRef): DrawTarget {
  const inset = Math.max(0, Math.min(0.4, ref.insetRatio ?? 0)) * size;
  const maxW = Math.max(1, size - inset * 2);
  const maxH = Math.max(1, size - inset * 2);
  if (ref.fit !== 'contain') {
    return { dx: dx + inset, dy: dy + inset, dw: maxW, dh: maxH };
  }

  const sourceW = image.naturalWidth / ref.cols * Math.max(1, ref.colSpan ?? 1);
  const sourceH = image.naturalHeight / ref.rows * Math.max(1, ref.rowSpan ?? 1);
  const scale = Math.min(maxW / Math.max(1, sourceW), maxH / Math.max(1, sourceH));
  const dw = Math.max(1, sourceW * scale);
  const dh = Math.max(1, sourceH * scale);
  return {
    dx: dx + (size - dw) / 2,
    dy: dy + (size - dh) / 2,
    dw,
    dh,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smooth01(value: number): number {
  return value * value * (3 - 2 * value);
}

function lerp(left: number, right: number, t: number): number {
  return left + (right - left) * t;
}

function hashNoise(x: number, y: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth01(x - x0);
  const ty = smooth01(y - y0);
  const a = hashNoise(x0, y0);
  const b = hashNoise(x0 + 1, y0);
  const c = hashNoise(x0, y0 + 1);
  const d = hashNoise(x0 + 1, y0 + 1);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

function fractalNoise(x: number, y: number): number {
  let total = 0;
  let amplitude = 0.55;
  let frequency = 1;
  let weight = 0;
  for (let index = 0; index < 4; index += 1) {
    total += valueNoise(x * frequency, y * frequency) * amplitude;
    weight += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return total / Math.max(0.001, weight);
}

function cellularNoise(x: number, y: number): number {
  const gx = Math.floor(x);
  const gy = Math.floor(y);
  let nearest = Infinity;
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      const cx = gx + ox;
      const cy = gy + oy;
      const px = cx + hashNoise(cx, cy);
      const py = cy + hashNoise(cx + 17, cy - 11);
      nearest = Math.min(nearest, Math.hypot(x - px, y - py));
    }
  }
  return clamp(nearest / Math.SQRT2, 0, 1);
}

function edgeNoiseAt(x: number, y: number, type: DualGridNoiseType, scale: number): number {
  const cellSize = 2 + (100 - clamp(scale, 1, 100)) / 99 * 30;
  const nx = x / cellSize;
  const ny = y / cellSize;
  if (type === 'hash') return hashNoise(Math.floor(nx), Math.floor(ny));
  if (type === 'fractal') return fractalNoise(nx, ny);
  if (type === 'cellular') return cellularNoise(nx, ny);
  return valueNoise(nx, ny);
}

function applyFalloffCurve(t: number, curve: DualGridFadeCurve): number {
  if (curve === 'smooth') return t * t * (3 - 2 * t);
  if (curve === 'ease-in') return t * t;
  if (curve === 'ease-out') return 1 - (1 - t) * (1 - t);
  return t;
}

function edgeFadeAlpha(distance: number, range: number, fadeStart: number, curve: DualGridFadeCurve): number {
  const start = clamp(fadeStart, 0, 1) * range;
  if (distance <= start) return 1;
  const t = clamp((distance - start) / Math.max(0.001, range - start), 0, 1);
  return 1 - applyFalloffCurve(t, curve);
}

function quadrantBitAt(x: number, y: number, size: number): number {
  const right = x >= size / 2;
  const bottom = y >= size / 2;
  if (!right && !bottom) return 1;
  if (!right && bottom) return 2;
  if (right && !bottom) return 4;
  return 8;
}

function distanceToRect(x: number, y: number, rect: { x: number; y: number; width: number; height: number }): number {
  const dx = Math.max(rect.x - x, 0, x - (rect.x + rect.width));
  const dy = Math.max(rect.y - y, 0, y - (rect.y + rect.height));
  return Math.hypot(dx, dy);
}

function distanceToSourceMask(x: number, y: number, sourceMask: number, size: number): number {
  let best = Infinity;
  const half = size / 2;
  for (const quad of DUAL_GRID_QUADS) {
    if ((sourceMask & quad.mask) === 0) continue;
    best = Math.min(best, distanceToRect(x, y, {
      x: quad.x * size,
      y: quad.y * size,
      width: half,
      height: half,
    }));
  }
  return best;
}

function edgeSignature(edge: DualGridEdgeOptions): string {
  return `${edge.range}/${edge.fade}/${edge.fadeStart}/${edge.fadeCurve}/${edge.noise ? 1 : 0}/${edge.noiseType}/${edge.noiseScale}/${edge.noiseAmount}`;
}

class RuntimeImagePack {
  private readonly cache = new Map<string, ImageCacheEntry>();
  private readonly dualGridEdgeCache = new Map<string, HTMLCanvasElement>();
  private readonly manifestUrl: string;
  private manifestState: ManifestState = 'idle';
  private tileSprites = new Map<string, AtlasSpriteRef>();
  private legacyTileKeys = new Map<string, string>();
  private entitySprites = new Map<string, AtlasSpriteRef>();
  private dualGridTileKeys: string[] = [];
  private revision = 0;

  constructor(manifestUrl = DEFAULT_MANIFEST_URL) {
    this.manifestUrl = manifestUrl;
  }

  getRevision(): number {
    return this.revision;
  }

  drawTile(ctx: CanvasRenderingContext2D, tile: Tile, dx: number, dy: number, size: number): boolean {
    this.ensureManifestRequested();
    const key = resolveTopTileSpriteKey(tile, this.legacyTileKeys);
    const ref = key ? this.tileSprites.get(key) : undefined;
    if (ref?.dualGrid?.enabled) {
      return false;
    }
    return ref ? this.drawAtlasSprite(ctx, ref, dx, dy, size) : false;
  }

  drawDualGridTiles(ctx: CanvasRenderingContext2D, options: RuntimeDualGridDrawOptions): boolean {
    this.ensureManifestRequested();
    if (this.dualGridTileKeys.length === 0) {
      return false;
    }

    let drewAny = false;
    const masksByKey = new Map<string, number>();
    let occupiedMask = 0;
    for (let vertexY = options.startGY; vertexY <= options.endGY + 1; vertexY += 1) {
      for (let vertexX = options.startGX; vertexX <= options.endGX + 1; vertexX += 1) {
        masksByKey.clear();
        occupiedMask = 0;
        const topLeft = options.tileAt(vertexX - 1, vertexY - 1);
        const bottomLeft = options.tileAt(vertexX - 1, vertexY);
        const topRight = options.tileAt(vertexX, vertexY - 1);
        const bottomRight = options.tileAt(vertexX, vertexY);
        this.collectDualGridCorner(masksByKey, topLeft, 1);
        if (topLeft) occupiedMask |= 1;
        this.collectDualGridCorner(masksByKey, bottomLeft, 2);
        if (bottomLeft) occupiedMask |= 2;
        this.collectDualGridCorner(masksByKey, topRight, 4);
        if (topRight) occupiedMask |= 4;
        this.collectDualGridCorner(masksByKey, bottomRight, 8);
        if (bottomRight) occupiedMask |= 8;
        if (masksByKey.size === 0) {
          continue;
        }

        const dx = (vertexX - 0.5) * options.cellSize + options.offsetX;
        const dy = (vertexY - 0.5) * options.cellSize + options.offsetY;
        for (const key of this.dualGridTileKeys) {
          const targetMask = masksByKey.get(key) ?? 0;
          if (!targetMask) {
            continue;
          }
          const backgroundMask = occupiedMask & ~targetMask & 15;
          const mergedMask = targetMask | backgroundMask;
          const ref = this.tileSprites.get(key);
          if (!ref?.dualGrid?.enabled) {
            continue;
          }
          if (backgroundMask && mergedMask !== targetMask) {
            drewAny = this.drawDualGridAtlasSprite(ctx, ref, dx, dy, options.cellSize, targetMask, mergedMask, true) || drewAny;
          }
          drewAny = this.drawDualGridAtlasSprite(ctx, ref, dx, dy, options.cellSize, targetMask, targetMask, false) || drewAny;
        }
      }
    }
    return drewAny;
  }

  drawEntity(
    ctx: CanvasRenderingContext2D,
    entity: Pick<RenderEntity, 'id' | 'kind' | 'name' | 'char'>,
    dx: number,
    dy: number,
    size: number,
  ): boolean {
    this.ensureManifestRequested();
    for (const key of resolveEntitySpriteKeys(entity)) {
      const ref = this.entitySprites.get(key);
      if (ref && this.drawAtlasSprite(ctx, ref, dx, dy, size)) {
        return true;
      }
    }
    return false;
  }

  private ensureManifestRequested(): void {
    if (this.manifestState !== 'idle' || typeof fetch !== 'function') {
      return;
    }
    this.manifestState = 'loading';
    void fetch(this.manifestUrl, { cache: 'no-cache' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`runtime_image_pack_manifest_http_${response.status}`);
        }
        return response.json() as Promise<RuntimeImagePackManifest>;
      })
      .then((manifest) => {
        this.tileSprites = normalizeSpriteMap(manifest.tiles, this.manifestUrl);
        this.legacyTileKeys = normalizeLegacyTileMap(manifest.legacyTiles);
        this.entitySprites = normalizeSpriteMap(manifest.entities, this.manifestUrl);
        this.dualGridTileKeys = [...this.tileSprites.entries()]
          .filter(([, ref]) => ref.dualGrid?.enabled === true)
          .map(([key]) => key);
        this.dualGridEdgeCache.clear();
        this.manifestState = 'loaded';
        this.revision += 1;
      })
      .catch(() => {
        this.manifestState = 'error';
        this.revision += 1;
      });
  }

  private drawAtlasSprite(ctx: CanvasRenderingContext2D, ref: AtlasSpriteRef, dx: number, dy: number, size: number): boolean {
    const entry = this.getImage(ref.src);
    if (!entry || entry.state !== 'loaded') {
      return false;
    }

    const image = entry.image;
    const cellW = image.naturalWidth / ref.cols;
    const cellH = image.naturalHeight / ref.rows;
    const sx = cellW * ref.col;
    const sy = cellH * ref.row;
    const sw = cellW * Math.max(1, ref.colSpan ?? 1);
    const sh = cellH * Math.max(1, ref.rowSpan ?? 1);
    const target = calculateDrawTarget(dx, dy, size, image, ref);
    ctx.drawImage(image, sx, sy, sw, sh, target.dx, target.dy, target.dw, target.dh);
    return true;
  }

  private collectDualGridCorner(masksByKey: Map<string, number>, tile: RuntimeTileVisualSource | null, mask: number): void {
    if (!tile) {
      return;
    }
    const key = resolveTileSpriteKey(tile, this.legacyTileKeys);
    if (!key) {
      return;
    }
    const ref = this.tileSprites.get(key);
    if (!ref?.dualGrid?.enabled) {
      return;
    }
    masksByKey.set(key, (masksByKey.get(key) ?? 0) | mask);
  }

  private drawDualGridAtlasSprite(
    ctx: CanvasRenderingContext2D,
    ref: AtlasSpriteRef,
    dx: number,
    dy: number,
    size: number,
    sourceMask: number,
    clipMask: number,
    etched: boolean,
  ): boolean {
    const entry = this.getImage(ref.src);
    if (!entry || entry.state !== 'loaded') {
      return false;
    }

    const image = entry.image;
    const coords = DUAL_GRID_ATLAS_COORDS[sourceMask];
    if (!coords) {
      return false;
    }
    const cellW = image.naturalWidth / ref.cols;
    const cellH = image.naturalHeight / ref.rows;
    const sx = cellW * (ref.col + coords[0]);
    const sy = cellH * (ref.row + coords[1]);
    const drawSize = Math.max(1, Math.round(size));

    if (etched) {
      const edgeCanvas = this.getEtchedDualGridFrame(image, ref, sx, sy, cellW, cellH, drawSize, sourceMask, clipMask);
      if (!edgeCanvas) {
        return false;
      }
      ctx.drawImage(edgeCanvas, dx, dy, size, size);
      return true;
    }

    if (clipMask === 15) {
      ctx.drawImage(image, sx, sy, cellW, cellH, dx, dy, size, size);
      return true;
    }
    const halfSourceW = cellW / 2;
    const halfSourceH = cellH / 2;
    const halfDest = size / 2;
    for (const quad of DUAL_GRID_QUADS) {
      if ((clipMask & quad.mask) === 0) {
        continue;
      }
      ctx.drawImage(
        image,
        sx + quad.x * cellW,
        sy + quad.y * cellH,
        halfSourceW,
        halfSourceH,
        dx + quad.x * size,
        dy + quad.y * size,
        halfDest,
        halfDest,
      );
    }
    return true;
  }

  private getEtchedDualGridFrame(
    image: HTMLImageElement,
    ref: AtlasSpriteRef,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    size: number,
    sourceMask: number,
    clipMask: number,
  ): HTMLCanvasElement | null {
    const edge = ref.dualGrid?.edge;
    if (!edge) {
      return null;
    }
    const range = (edge.range / 100) * (size / 2) * Math.SQRT2;
    if (range <= 0) {
      return null;
    }
    const cacheKey = `${ref.src}:${sx}:${sy}:${sw}:${sh}:${size}:${sourceMask}:${clipMask}:${edgeSignature(edge)}`;
    const hit = this.dualGridEdgeCache.get(cacheKey);
    if (hit) {
      return hit;
    }
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const tempCtx = canvas.getContext('2d', { willReadFrequently: true });
    if (!tempCtx) {
      return null;
    }
    tempCtx.clearRect(0, 0, size, size);
    tempCtx.drawImage(image, sx, sy, sw, sh, 0, 0, size, size);
    const sourceData = tempCtx.getImageData(0, 0, size, size);
    const outputData = tempCtx.createImageData(size, size);
    const fade = edge.fade / 100;
    const fadeStart = edge.fadeStart / 100;
    const noiseScale = edge.noise ? edge.noiseAmount / 100 : 0;

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const bit = quadrantBitAt(x, y, size);
        if ((clipMask & bit) === 0 || (sourceMask & bit) !== 0) {
          continue;
        }
        let distance = distanceToSourceMask(x + 0.5, y + 0.5, sourceMask, size);
        if (noiseScale > 0) {
          const noise = edgeNoiseAt(x + Math.round(sx), y + Math.round(sy), edge.noiseType, edge.noiseScale);
          distance += (noise - 0.5) * 2 * range * 0.45 * noiseScale;
        }
        if (distance > range) {
          continue;
        }
        const index = (y * size + x) * 4;
        const alphaBase = sourceData.data[index + 3];
        if (alphaBase === 0) {
          continue;
        }
        const fadeAlpha = edgeFadeAlpha(distance, range, fadeStart, edge.fadeCurve);
        const alphaFactor = 1 - fade + fade * fadeAlpha;
        outputData.data[index] = sourceData.data[index]!;
        outputData.data[index + 1] = sourceData.data[index + 1]!;
        outputData.data[index + 2] = sourceData.data[index + 2]!;
        outputData.data[index + 3] = Math.round(alphaBase * alphaFactor);
      }
    }

    tempCtx.putImageData(outputData, 0, 0);
    this.dualGridEdgeCache.set(cacheKey, canvas);
    if (this.dualGridEdgeCache.size > MAX_DUAL_GRID_EDGE_CACHE_ENTRIES) {
      const oldestKey = this.dualGridEdgeCache.keys().next().value;
      if (typeof oldestKey === 'string') {
        this.dualGridEdgeCache.delete(oldestKey);
      }
    }
    return canvas;
  }

  private getImage(src: string): ImageCacheEntry | null {
    if (typeof Image === 'undefined') {
      return null;
    }
    const hit = this.cache.get(src);
    if (hit) {
      return hit;
    }

    const image = new Image();
    const entry: ImageCacheEntry = { image, state: 'loading' };
    image.onload = () => {
      entry.state = 'loaded';
      this.revision += 1;
    };
    image.onerror = () => {
      entry.state = 'error';
      this.revision += 1;
    };
    image.src = src;
    this.cache.set(src, entry);
    return entry;
  }
}

export const runtimeImagePack = new RuntimeImagePack();

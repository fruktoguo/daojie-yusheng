/**
 * 本文件属于 Canvas 渲染资源层，负责运行时图片图包的可选加载与绘制。
 *
 * 维护时保持非侵入式：manifest 缺失、图片未加载或条目未命中时，调用方必须继续走原字符渲染。
 */
import type { RenderEntity, Tile } from '@mud/shared';

type SpriteFit = 'cover' | 'contain';
type ManifestState = 'idle' | 'loading' | 'loaded' | 'error';

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

class RuntimeImagePack {
  private readonly cache = new Map<string, ImageCacheEntry>();
  private readonly manifestUrl: string;
  private manifestState: ManifestState = 'idle';
  private tileSprites = new Map<string, AtlasSpriteRef>();
  private legacyTileKeys = new Map<string, string>();
  private entitySprites = new Map<string, AtlasSpriteRef>();
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
    return ref ? this.drawAtlasSprite(ctx, ref, dx, dy, size) : false;
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

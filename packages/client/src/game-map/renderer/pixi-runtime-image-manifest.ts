/** 运行时图包清单到 Pixi 贴图引用的纯归一化边界。 */
import type { Tile } from '@mud/shared';
import { buildEntitySpriteLookupPlan, type EntitySpriteTransform } from '../../entity-facing';
import {
  getRuntimeImageOverrideSpriteEntries,
  resolveRuntimeImageOverrideSrc,
} from '../../renderer/local-runtime-image-overrides';
import { resolveRuntimeImagePackAssetUrl } from '../../renderer/runtime-image-pack-url';
import type { ObservedMapEntity } from '../types';

export interface PixiTileSpriteRef {
  key: string;
  src: string;
  cols: number;
  rows: number;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  insetRatio: number;
  fit: 'cover' | 'contain';
  zIndex: number;
  order: number;
  renderOrder: number;
  dualGrid: boolean;
}

export interface RuntimeEntitySpriteSelection {
  ref: PixiTileSpriteRef;
  transform: EntitySpriteTransform;
}

export interface RuntimeTileSpriteManifest {
  version?: unknown;
  defaults?: {
    tile?: Record<string, unknown>;
  };
  tiles?: Record<string, unknown>;
  legacyTiles?: Record<string, unknown>;
  entities?: Record<string, unknown>;
}

const IDENTITY_ENTITY_SPRITE_TRANSFORM: EntitySpriteTransform = { flipX: false };

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

function normalizeTileSpriteZIndex(value: unknown, key: string): number {
  const raw = isRecord(value) ? readPixiSpriteMetaField(value, undefined, 'zIndex') : undefined;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return numeric;
  if (key.startsWith('terrain:')) return 100;
  if (key.startsWith('surface:')) return 200;
  if (key.startsWith('structure:')) return 300;
  if (key.startsWith('interactable:')) return 400;
  return 500;
}

function readPixiSpriteField(value: Record<string, unknown>, defaults: Record<string, unknown> | undefined, field: string): unknown {
  return value[field] !== undefined ? value[field] : defaults?.[field];
}

function readPixiSpriteMetaField(value: Record<string, unknown>, defaults: Record<string, unknown> | undefined, field: string): unknown {
  const valueMeta = isRecord(value.meta) ? value.meta : undefined;
  if (valueMeta?.[field] !== undefined) return valueMeta[field];
  if (value[field] !== undefined) return value[field];
  const defaultMeta = defaults && isRecord(defaults.meta) ? defaults.meta : undefined;
  if (defaultMeta?.[field] !== undefined) return defaultMeta[field];
  return defaults?.[field];
}

function normalizeTileSpriteZIndexWithDefaults(value: Record<string, unknown>, defaults: Record<string, unknown> | undefined, key: string): number {
  const raw = readPixiSpriteMetaField(value, defaults, 'zIndex');
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : normalizeTileSpriteZIndex(value, key);
}

function normalizeTileSpriteDualGrid(value: Record<string, unknown>, defaults: Record<string, unknown> | undefined): boolean {
  const rawDualGrid = readPixiSpriteMetaField(value, defaults, 'dualGrid');
  return rawDualGrid === true || (isRecord(rawDualGrid) && rawDualGrid.enabled !== false);
}

function normalizeSpriteFit(value: unknown): 'cover' | 'contain' {
  return value === 'contain' ? 'contain' : 'cover';
}

function normalizePixiTileSpriteRef(
  value: unknown,
  manifestUrl: string,
  version: string,
  key: string,
  order: number,
  defaults?: Record<string, unknown>,
): PixiTileSpriteRef | null {
  if (!isRecord(value) || typeof value.src !== 'string' || value.src.trim().length === 0) return null;
  return {
    key,
    src: resolveRuntimeImageOverrideSrc(key, resolveRuntimeImagePackAssetUrl(manifestUrl, value.src, version)),
    cols: normalizePositiveInteger(readPixiSpriteField(value, defaults, 'cols'), 1),
    rows: normalizePositiveInteger(readPixiSpriteField(value, defaults, 'rows'), 1),
    col: normalizeNonNegativeInteger(readPixiSpriteField(value, defaults, 'col'), 0),
    row: normalizeNonNegativeInteger(readPixiSpriteField(value, defaults, 'row'), 0),
    colSpan: normalizePositiveInteger(readPixiSpriteField(value, defaults, 'colSpan'), 1),
    rowSpan: normalizePositiveInteger(readPixiSpriteField(value, defaults, 'rowSpan'), 1),
    insetRatio: Number.isFinite(Number(readPixiSpriteField(value, defaults, 'insetRatio')))
      ? Math.max(0, Math.min(0.4, Number(readPixiSpriteField(value, defaults, 'insetRatio'))))
      : 0,
    fit: normalizeSpriteFit(readPixiSpriteField(value, defaults, 'fit')),
    zIndex: normalizeTileSpriteZIndexWithDefaults(value, defaults, key),
    order,
    renderOrder: order,
    dualGrid: normalizeTileSpriteDualGrid(value, defaults),
  };
}

export function resolveTopTileSpriteKey(tile: Tile, legacyTileKeys: ReadonlyMap<string, string>): string | null {
  const structureType = typeof tile.structureType === 'string' && tile.structureType.length > 0 ? tile.structureType : null;
  if (structureType) return `structure:${structureType}`;
  const interactable = Array.isArray(tile.interactableKinds)
    ? tile.interactableKinds.find((kind) => typeof kind === 'string' && kind.length > 0)
    : undefined;
  if (interactable) return `interactable:${interactable}`;
  const surfaceType = typeof tile.surfaceType === 'string' && tile.surfaceType.length > 0 ? tile.surfaceType : null;
  if (surfaceType) return `surface:${surfaceType}`;
  const terrainType = typeof tile.terrainType === 'string' && tile.terrainType.length > 0 ? tile.terrainType : null;
  if (terrainType) return `terrain:${terrainType}`;
  return legacyTileKeys.get(tile.type) ?? null;
}

export function normalizePixiTileSpriteMap(
  value: unknown,
  manifestUrl: string,
  version: string,
  defaults?: Record<string, unknown>,
): Map<string, PixiTileSpriteRef> {
  const result = new Map<string, PixiTileSpriteRef>();
  if (!isRecord(value)) return result;
  let order = 0;
  for (const [key, rawRef] of Object.entries(value)) {
    const normalizedKey = key.trim();
    const ref = normalizePixiTileSpriteRef(rawRef, manifestUrl, version, normalizedKey, order, defaults);
    order += 1;
    if (normalizedKey && ref) result.set(normalizedKey, ref);
  }
  return result;
}

export function addLocalPixiEntityOverrideSpriteRefs(sprites: Map<string, PixiTileSpriteRef>): void {
  let order = sprites.size;
  for (const entry of getRuntimeImageOverrideSpriteEntries()) {
    if (!entry.src.startsWith('data:image/')) continue;
    sprites.set(entry.key, {
      key: entry.key,
      src: entry.src,
      cols: 1,
      rows: 1,
      col: 0,
      row: 0,
      colSpan: 1,
      rowSpan: 1,
      insetRatio: 0,
      fit: 'contain',
      zIndex: 500,
      order,
      renderOrder: order,
      dualGrid: false,
    });
    order += 1;
  }
}

export function normalizeLegacyTileMap(value: unknown): Map<string, string> {
  const result = new Map<string, string>();
  if (!isRecord(value)) return result;
  for (const [key, rawValue] of Object.entries(value)) {
    const normalizedKey = key.trim();
    const mappedKey = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (normalizedKey && mappedKey) result.set(normalizedKey, mappedKey);
  }
  return result;
}

export function pickRuntimeEntitySpriteSelection(
  entity: Pick<ObservedMapEntity, 'id' | 'kind' | 'name' | 'char' | 'facing' | 'monsterId'>,
  sprites: ReadonlyMap<string, PixiTileSpriteRef>,
): RuntimeEntitySpriteSelection | null {
  const plan = buildEntitySpriteLookupPlan(entity);
  for (let index = 0; index < plan.keys.length; index += 1) {
    const ref = sprites.get(plan.keys[index]!);
    if (ref) {
      return {
        ref,
        transform: plan.transforms[index] ?? IDENTITY_ENTITY_SPRITE_TRANSFORM,
      };
    }
  }
  return null;
}

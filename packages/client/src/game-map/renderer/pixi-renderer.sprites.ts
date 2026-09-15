/**
 * pixi-renderer.sprites.ts — 从 pixi-map-renderer-adapter.ts 拆分的纹理/精灵域方法。
 *
 * 包含运行时瓦片精灵清单加载、图集纹理缓存、瓦片/实体纹理解析与请求、
 * 本地图片覆盖监听等逻辑。
 * 采用模式 B（委托壳）：所有方法以 xxxImpl(self: PixiMapRendererAdapter, ...) 形式导出，
 * 由 pixi-map-renderer-adapter.ts 主类中的同名方法一行委托调用。
 */
import { Application, Assets, Container, Rectangle, Sprite, Texture, type Renderer } from 'pixi.js';
import { type Tile } from '@mud/shared';
import { RUNTIME_IMAGE_OVERRIDES_CHANGED_EVENT } from '../../renderer/local-runtime-image-overrides';
import { normalizeRuntimeImagePackVersion } from '../../renderer/runtime-image-pack-url';
import {
  addLocalPixiEntityOverrideSpriteRefs,
  normalizeLegacyTileMap,
  normalizePixiTileSpriteMap,
  pickRuntimeEntitySpriteSelection,
  resolveTopTileSpriteKey,
  type PixiTileSpriteRef,
  type RuntimeEntitySpriteSelection,
  type RuntimeTileSpriteManifest,
} from './pixi-runtime-image-manifest';
import type { ObservedMapEntity } from '../types';
import type { PixiMapRendererAdapter } from './pixi-map-renderer-adapter';
import { DEFAULT_RUNTIME_IMAGE_PACK_MANIFEST_URL, DUAL_GRID_ATLAS_COORDS, type PixiRenderer } from './pixi-map-renderer-adapter';
export function ensureRuntimeTileSpritesRequestedImpl(self: PixiMapRendererAdapter, ): void {
    self.ensureRuntimeImageOverrideListener();
    if (!self.performanceConfig.renderRuntimeTileSprites || self.runtimeTileManifestState !== 'idle') return;
    if (typeof fetch !== 'function') {
      self.runtimeTileManifestState = 'error';
      return;
    }
    self.runtimeTileManifestState = 'loading';
    const generation = self.runtimeImageGeneration;
    void self.loadRuntimeTileSpriteManifest(generation);
  }

export async function loadRuntimeTileSpriteManifestImpl(self: PixiMapRendererAdapter, generation: number): Promise<void> {
    try {
      const response = await fetch(DEFAULT_RUNTIME_IMAGE_PACK_MANIFEST_URL, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`runtime_tile_sprite_manifest_http_${response.status}`);
      const manifest = await response.json() as RuntimeTileSpriteManifest;
      if (self.destroyed || generation !== self.runtimeImageGeneration) return;
      const version = normalizeRuntimeImagePackVersion(manifest.version);
      const refs = normalizePixiTileSpriteMap(
        manifest.tiles,
        DEFAULT_RUNTIME_IMAGE_PACK_MANIFEST_URL,
        version,
        manifest.defaults?.tile,
      );
      const sortedRefs = [...refs.entries()].sort(([, left], [, right]) => left.zIndex - right.zIndex || left.order - right.order);
      for (let index = 0; index < sortedRefs.length; index += 1) {
        sortedRefs[index]![1].renderOrder = index;
      }
      self.runtimeTileSpriteRefs = new Map(sortedRefs);
      self.runtimeLegacyTileKeys = normalizeLegacyTileMap(manifest.legacyTiles);
      self.runtimeTileSpriteRefCache = new WeakMap<Tile, PixiTileSpriteRef | null>();
      self.runtimeEntitySpriteRefs = normalizePixiTileSpriteMap(
        manifest.entities,
        DEFAULT_RUNTIME_IMAGE_PACK_MANIFEST_URL,
        version,
      );
      addLocalPixiEntityOverrideSpriteRefs(self.runtimeEntitySpriteRefs);
      const nextAtlasSources = new Set<string>([
        ...Array.from(self.runtimeTileSpriteRefs.values(), (ref) => ref.src),
        ...Array.from(self.runtimeEntitySpriteRefs.values(), (ref) => ref.src),
      ]);
      self.releaseRuntimeImageResources(nextAtlasSources);
      self.runtimeTileManifestState = 'loaded';
      self.runtimeTileSpriteRevision += 1;
      self.invalidateTerrainChunks();
      self.invalidateEntityStaticViews();
    } catch (error) {
      if (self.destroyed || generation !== self.runtimeImageGeneration) return;
      self.runtimeTileManifestState = 'error';
      self.runtimeTileSpriteRevision += 1;
      self.invalidateTerrainChunks();
      self.invalidateEntityStaticViews();
      console.warn('[map] failed to load Pixi runtime tile sprites', error);
    }
  }

export function ensureRuntimeImageOverrideListenerImpl(self: PixiMapRendererAdapter, ): void {
    if (self.runtimeImageOverrideListener || typeof window === 'undefined') return;
    self.runtimeImageOverrideListener = () => {
      self.reloadRuntimeTileSpriteManifestForLocalOverrides();
    };
    window.addEventListener(RUNTIME_IMAGE_OVERRIDES_CHANGED_EVENT, self.runtimeImageOverrideListener);
  }

export function removeRuntimeImageOverrideListenerImpl(self: PixiMapRendererAdapter, ): void {
    if (!self.runtimeImageOverrideListener || typeof window === 'undefined') return;
    window.removeEventListener(RUNTIME_IMAGE_OVERRIDES_CHANGED_EVENT, self.runtimeImageOverrideListener);
    self.runtimeImageOverrideListener = null;
  }

export function reloadRuntimeTileSpriteManifestForLocalOverridesImpl(self: PixiMapRendererAdapter, ): void {
    self.runtimeImageGeneration += 1;
    self.runtimeTileManifestState = 'idle';
    self.destroyRuntimeDerivedTextures();
    self.runtimeTileTextureRequests.clear();
    self.runtimeEntityTextureRequests.clear();
    self.runtimeTileSpriteRefCache = new WeakMap<Tile, PixiTileSpriteRef | null>();
    self.runtimeTileSpriteRevision += 1;
    self.invalidateTerrainChunks();
    self.invalidateEntityStaticViews();
    self.ensureRuntimeTileSpritesRequested();
  }

export function destroyRuntimeDerivedTexturesImpl(self: PixiMapRendererAdapter, ): void {
    for (const texture of self.runtimeTileTextures.values()) {
      if (!texture.destroyed) texture.destroy(false);
    }
    for (const texture of self.runtimeEntityTextures.values()) {
      if (!texture.destroyed) texture.destroy(false);
    }
    self.runtimeTileTextures.clear();
    self.runtimeEntityTextures.clear();
  }

export function releaseRuntimeImageResourcesImpl(self: PixiMapRendererAdapter, nextSources: ReadonlySet<string>): void {
    self.destroyRuntimeDerivedTextures();
    const previousSources = new Set<string>([
      ...self.runtimeActiveAtlasSources,
      ...self.runtimeAtlasTextures.keys(),
    ]);
    self.runtimeActiveAtlasSources = new Set(nextSources);
    for (const src of previousSources) {
      if (nextSources.has(src)) continue;
      self.runtimeAtlasTextures.delete(src);
      if (src.startsWith('data:')) {
        void Assets.unload(src).catch(() => undefined);
      }
    }
  }

export function getRuntimeAtlasTextureImpl(self: PixiMapRendererAdapter, src: string): Texture | null {
    const atlas = self.runtimeAtlasTextures.get(src);
    if (!atlas) return null;
    if (atlas.destroyed || atlas === Texture.EMPTY || atlas.width <= 0 || atlas.height <= 0) {
      self.runtimeAtlasTextures.delete(src);
      return null;
    }
    return atlas;
  }

export function rememberRuntimeAtlasTextureImpl(self: PixiMapRendererAdapter, src: string, loaded: unknown): boolean {
    if (!(loaded instanceof Texture) || loaded === Texture.EMPTY || loaded.width <= 0 || loaded.height <= 0) {
      self.runtimeAtlasTextures.delete(src);
      return false;
    }
    self.runtimeAtlasTextures.set(src, loaded);
    return true;
  }

export function resolveRuntimeTileSpriteRefImpl(self: PixiMapRendererAdapter, tile: Tile): PixiTileSpriteRef | null {
    if (!self.performanceConfig.renderRuntimeTileSprites || self.performanceConfig.terrainTextMode || self.runtimeTileManifestState !== 'loaded') return null;
    const cached = self.runtimeTileSpriteRefCache.get(tile);
    if (cached !== undefined) {
      return cached;
    }
    const key = resolveTopTileSpriteKey(tile, self.runtimeLegacyTileKeys);
    const ref = key ? self.runtimeTileSpriteRefs.get(key) ?? null : null;
    self.runtimeTileSpriteRefCache.set(tile, ref);
    return ref;
  }

export function resolveRuntimeDualGridRefImpl(self: PixiMapRendererAdapter, tile: Tile | null | undefined): PixiTileSpriteRef | null {
    if (!tile) return null;
    const ref = self.resolveRuntimeTileSpriteRef(tile);
    return ref?.dualGrid ? ref : null;
  }

export function getRuntimeTileTextureImpl(self: PixiMapRendererAdapter, ref: PixiTileSpriteRef, sourceMask = 15, quad?: { x: number; y: number; sourceW: number; sourceH: number }): Texture | null {
    const coords = ref.dualGrid ? DUAL_GRID_ATLAS_COORDS[sourceMask] : undefined;
    const frameCol = Math.min(ref.cols - 1, ref.col + (coords?.[0] ?? 0));
    const frameRow = Math.min(ref.rows - 1, ref.row + (coords?.[1] ?? 0));
    const cacheKey = `${ref.key}:${ref.src}:${frameCol}:${frameRow}:${ref.colSpan}:${ref.rowSpan}:${sourceMask}:${quad?.x ?? ''}:${quad?.y ?? ''}:${quad?.sourceW ?? ''}:${quad?.sourceH ?? ''}`;
    const cached = self.runtimeTileTextures.get(cacheKey);
    if (cached && !cached.destroyed) return cached;
    const atlas = self.getRuntimeAtlasTexture(ref.src);
    if (!atlas) return null;
    const cellW = atlas.width / ref.cols;
    const cellH = atlas.height / ref.rows;
    const sourceX = cellW * frameCol + (quad?.x ?? 0);
    const sourceY = cellH * frameRow + (quad?.y ?? 0);
    const sourceW = quad?.sourceW ?? (cellW * Math.max(1, Math.min(ref.colSpan, ref.cols - frameCol)));
    const sourceH = quad?.sourceH ?? (cellH * Math.max(1, Math.min(ref.rowSpan, ref.rows - frameRow)));
    const frame = new Rectangle(
      sourceX,
      sourceY,
      Math.max(1, sourceW),
      Math.max(1, sourceH),
    );
    const texture = new Texture({
      source: atlas.source,
      frame,
      orig: new Rectangle(0, 0, frame.width, frame.height),
      label: `runtime-tile:${ref.key}`,
    });
    self.runtimeTileTextures.set(cacheKey, texture);
    return texture;
  }

export function requestRuntimeTileTextureImpl(self: PixiMapRendererAdapter, ref: PixiTileSpriteRef): void {
    if (self.runtimeTileTextureRequests.has(ref.src)) return;
    self.runtimeTileTextureRequests.add(ref.src);
    const generation = self.runtimeImageGeneration;
    void Assets.load<Texture>(ref.src).then((texture) => {
      if (self.destroyed || generation !== self.runtimeImageGeneration) {
        if (self.destroyed || !self.runtimeActiveAtlasSources.has(ref.src)) {
          if (ref.src.startsWith('data:')) void Assets.unload(ref.src).catch(() => undefined);
        }
        return;
      }
      self.runtimeTileTextureRequests.delete(ref.src);
      self.rememberRuntimeAtlasTexture(ref.src, texture);
      self.runtimeTileSpriteRevision += 1;
      self.invalidateTerrainChunks();
    }).catch((error) => {
      if (self.destroyed || generation !== self.runtimeImageGeneration) return;
      self.runtimeTileTextureRequests.delete(ref.src);
      console.warn('[map] failed to load Pixi runtime tile texture', ref.src, error);
    });
  }

export function resolveRuntimeEntitySpriteSelectionImpl(self: PixiMapRendererAdapter, entity: Pick<ObservedMapEntity, 'id' | 'kind' | 'name' | 'char' | 'facing' | 'monsterId'>): RuntimeEntitySpriteSelection | null {
    if (self.runtimeTileManifestState !== 'loaded') return null;
    return pickRuntimeEntitySpriteSelection(entity, self.runtimeEntitySpriteRefs);
  }

export function getRuntimeEntityTextureImpl(self: PixiMapRendererAdapter, ref: PixiTileSpriteRef): Texture | null {
    const frameCol = Math.min(ref.cols - 1, ref.col);
    const frameRow = Math.min(ref.rows - 1, ref.row);
    const cacheKey = `${ref.key}:${ref.src}:${frameCol}:${frameRow}:${ref.colSpan}:${ref.rowSpan}`;
    const cached = self.runtimeEntityTextures.get(cacheKey);
    if (cached && !cached.destroyed) return cached;
    const atlas = self.getRuntimeAtlasTexture(ref.src);
    if (!atlas) return null;
    const cellW = atlas.width / ref.cols;
    const cellH = atlas.height / ref.rows;
    const sourceX = cellW * frameCol;
    const sourceY = cellH * frameRow;
    const sourceW = cellW * Math.max(1, Math.min(ref.colSpan, ref.cols - frameCol));
    const sourceH = cellH * Math.max(1, Math.min(ref.rowSpan, ref.rows - frameRow));
    const frame = new Rectangle(sourceX, sourceY, Math.max(1, sourceW), Math.max(1, sourceH));
    const texture = new Texture({
      source: atlas.source,
      frame,
      orig: new Rectangle(0, 0, frame.width, frame.height),
      label: `runtime-entity:${ref.key}`,
    });
    self.runtimeEntityTextures.set(cacheKey, texture);
    return texture;
  }

export function requestRuntimeEntityTextureImpl(self: PixiMapRendererAdapter, ref: PixiTileSpriteRef): void {
    if (self.runtimeEntityTextureRequests.has(ref.src)) return;
    self.runtimeEntityTextureRequests.add(ref.src);
    const generation = self.runtimeImageGeneration;
    void Assets.load<Texture>(ref.src).then((texture) => {
      if (self.destroyed || generation !== self.runtimeImageGeneration) {
        if (self.destroyed || !self.runtimeActiveAtlasSources.has(ref.src)) {
          if (ref.src.startsWith('data:')) void Assets.unload(ref.src).catch(() => undefined);
        }
        return;
      }
      self.runtimeEntityTextureRequests.delete(ref.src);
      self.rememberRuntimeAtlasTexture(ref.src, texture);
      self.runtimeTileSpriteRevision += 1;
      self.invalidateEntityStaticViews();
    }).catch((error) => {
      if (self.destroyed || generation !== self.runtimeImageGeneration) return;
      self.runtimeEntityTextureRequests.delete(ref.src);
      console.warn('[map] failed to load Pixi runtime entity texture', ref.src, error);
    });
  }

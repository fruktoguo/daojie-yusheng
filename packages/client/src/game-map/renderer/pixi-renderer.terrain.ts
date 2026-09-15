/**
 * pixi-renderer.terrain.ts — 从 pixi-map-renderer-adapter.ts 拆分的地形块/雾域方法。
 *
 * 包含地形块创建/销毁/重建、雾层管理、瓦片可见性过渡、
 * 地形 overlay 绘制、dual-grid 瓦片精灵绘制等逻辑。
 * 采用模式 B（委托壳）：所有方法以 xxxImpl(self: PixiMapRendererAdapter, ...) 形式导出，
 * 由 pixi-map-renderer-adapter.ts 主类中的同名方法一行委托调用。
 */
import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import {
  TILE_VISUAL_BG_COLORS,
  TILE_VISUAL_GLYPH_COLORS,
  TILE_VISUAL_GLYPHS,
  isOffsetInRange,
  normalizeAuraLevelBaseValue,
  type GridPoint,
  type Tile,
} from '@mud/shared';
import { getCellSize } from '../../display';
import {
  buildPixiTerrainChunkOverlaySignature,
  buildPixiTerrainChunkStaticSignature,
  PIXI_TERRAIN_CHUNK_SIZE,
} from './pixi-terrain-cache-signatures';
import { type PixiTileSpriteRef } from './pixi-runtime-image-manifest';
import {
  buildGridPointSignature,
  clamp01,
  colorWithAlpha,
  getSenseQiOverlayStyle,
  isTileInsideFormationRange,
  isTileOnFormationBoundary,
  parseAlpha,
  parseColor,
  resolveEntityHpBarColor,
  textStyle,
} from './pixi-render-primitives';
import { TILE_HIDDEN_FADE_MS } from '../../constants/visuals/time-atmosphere';
import { PATH_TARGET_CORE_COLOR } from '../../constants/visuals/path-highlight';
import type {
  FormationRangeVisual,
  TerrainChunkOverlaySignatureDeps,
  TerrainChunkStaticSignatureDeps,
  TerrainChunkView,
  TerrainFogChunkView,
} from './pixi-render-state';
import type { CameraState } from '../camera/camera-controller';
import type { MapSceneSnapshot } from '../types';
import type { PixiMapRendererAdapter } from './pixi-map-renderer-adapter';
import {
  CHUNK_SIZE,
  DUAL_GRID_ATLAS_COORDS,
  DUAL_GRID_QUADS,
  DUAL_GRID_QUARTER_SOURCE_OVERLAP_PX,
  TERRAIN_CHUNK_CACHE_OPTIONS,
} from './pixi-map-renderer-adapter';
export function clearTerrainFogChunksImpl(self: PixiMapRendererAdapter, ): void {
    self.terrainFogChunks.clear();
    self.clearContainer(self.terrainFogLayer);
  }

export function invalidateTerrainChunksImpl(self: PixiMapRendererAdapter, ): void {
    for (const chunk of self.terrainChunks.values()) {
      chunk.staticSignature = '';
      chunk.overlaySignature = '';
    }
  }

export function drawRuntimeTileSpriteImpl(self: PixiMapRendererAdapter, chunkContainer: Container, tile: Tile, sx: number, sy: number, cellSize: number): void {
    const ref = self.resolveRuntimeTileSpriteRef(tile);
    if (!ref) return;
    const texture = self.getRuntimeTileTexture(ref);
    if (!texture) {
      self.requestRuntimeTileTexture(ref);
      return;
    }
    const sprite = new Sprite(texture);
    sprite.position.set(sx, sy);
    sprite.width = cellSize;
    sprite.height = cellSize;
    sprite.zIndex = ref.zIndex;
    chunkContainer.addChild(sprite);
    self.profiler.count('runtimeTileSprites');
  }

export function drawDualGridSpriteImpl(self: PixiMapRendererAdapter, 
    chunkContainer: Container,
    ref: PixiTileSpriteRef,
    dx: number,
    dy: number,
    cellSize: number,
    sourceMask: number,
    clipMask: number,
  ): void {
    if (!ref.dualGrid) return;
    const atlas = self.getRuntimeAtlasTexture(ref.src);
    if (!atlas) {
      self.requestRuntimeTileTexture(ref);
      return;
    }
    const cellW = atlas.width / ref.cols;
    const cellH = atlas.height / ref.rows;
    const coords = DUAL_GRID_ATLAS_COORDS[sourceMask];
    if (!coords) return;
    if (clipMask === 15) {
      const texture = self.getRuntimeTileTexture(ref, sourceMask);
      if (!texture) {
        self.requestRuntimeTileTexture(ref);
        return;
      }
      const overlap = Math.min(1, Math.max(0.5, cellSize / Math.max(1, Math.max(cellW, cellH))));
      const sprite = new Sprite(texture);
      sprite.position.set(dx - overlap, dy - overlap);
      sprite.width = cellSize + overlap * 2;
      sprite.height = cellSize + overlap * 2;
      sprite.zIndex = ref.zIndex + 0.1;
      chunkContainer.addChild(sprite);
      self.profiler.count('dualGridSprites');
      return;
    }
    const halfSourceW = cellW / 2;
    const halfSourceH = cellH / 2;
    const halfDest = cellSize / 2;
    const sourceOverlapX = Math.min(DUAL_GRID_QUARTER_SOURCE_OVERLAP_PX, halfSourceW);
    const sourceOverlapY = Math.min(DUAL_GRID_QUARTER_SOURCE_OVERLAP_PX, halfSourceH);
    const destOverlapX = sourceOverlapX * cellSize / Math.max(1, cellW);
    const destOverlapY = sourceOverlapY * cellSize / Math.max(1, cellH);
    for (const quad of DUAL_GRID_QUADS) {
      if ((clipMask & quad.mask) === 0) continue;
      const overlapLeft = quad.x > 0 && (clipMask & (quad.mask >> 2)) !== 0;
      const overlapRight = quad.x === 0 && (clipMask & (quad.mask << 2)) !== 0;
      const overlapTop = quad.y > 0 && (clipMask & (quad.mask >> 1)) !== 0;
      const overlapBottom = quad.y === 0 && (clipMask & (quad.mask << 1)) !== 0;
      let sourceX = quad.x * cellW;
      let sourceY = quad.y * cellH;
      let sourceW = halfSourceW;
      let sourceH = halfSourceH;
      let destX = dx + quad.x * cellSize;
      let destY = dy + quad.y * cellSize;
      let destW = halfDest;
      let destH = halfDest;
      if (overlapRight) {
        sourceW += sourceOverlapX;
        destW += destOverlapX;
      }
      if (overlapLeft) {
        sourceX -= sourceOverlapX;
        sourceW += sourceOverlapX;
        destX -= destOverlapX;
        destW += destOverlapX;
      }
      if (overlapBottom) {
        sourceH += sourceOverlapY;
        destH += destOverlapY;
      }
      if (overlapTop) {
        sourceY -= sourceOverlapY;
        sourceH += sourceOverlapY;
        destY -= destOverlapY;
        destH += destOverlapY;
      }
      const texture = self.getRuntimeTileTexture(ref, sourceMask, { x: sourceX, y: sourceY, sourceW, sourceH });
      if (!texture) {
        self.requestRuntimeTileTexture(ref);
        continue;
      }
      const sprite = new Sprite(texture);
      sprite.position.set(destX, destY);
      sprite.width = destW;
      sprite.height = destH;
      sprite.zIndex = ref.zIndex + 0.1;
      chunkContainer.addChild(sprite);
      self.profiler.count('dualGridSprites');
    }
  }

export function collectDualGridVertexRefImpl(self: PixiMapRendererAdapter, 
    refs: Array<PixiTileSpriteRef | null>,
    masks: number[],
    occupiedMask: number,
    ref: PixiTileSpriteRef | null | undefined,
    mask: number,
  ): number {
    if (!ref) return occupiedMask;
    const nextOccupiedMask = occupiedMask | mask;
    if (refs[0] === ref) {
      masks[0] = (masks[0] ?? 0) | mask;
    } else if (refs[1] === ref) {
      masks[1] = (masks[1] ?? 0) | mask;
    } else if (refs[2] === ref) {
      masks[2] = (masks[2] ?? 0) | mask;
    } else if (refs[3] === ref) {
      masks[3] = (masks[3] ?? 0) | mask;
    } else if (!refs[0]) {
      refs[0] = ref;
      masks[0] = mask;
    } else if (!refs[1]) {
      refs[1] = ref;
      masks[1] = mask;
    } else if (!refs[2]) {
      refs[2] = ref;
      masks[2] = mask;
    } else {
      refs[3] = ref;
      masks[3] = mask;
    }
    return nextOccupiedMask;
  }

export function drawRuntimeDualGridEdgesImpl(self: PixiMapRendererAdapter, 
    chunkContainer: Container,
    scene: MapSceneSnapshot,
    startX: number,
    startY: number,
    cellSize: number,
  ): void {
    if (!self.performanceConfig.renderRuntimeTileSprites || self.runtimeTileManifestState !== 'loaded') return;
    if (self.runtimeTileSpriteRefs.size === 0) return;
    const scanSize = CHUNK_SIZE + 2;
    const cellRefs = self.dualGridCellRefsScratch;
    cellRefs.length = scanSize * scanSize;
    for (let localY = 0; localY < scanSize; localY += 1) {
      const y = startY - 1 + localY;
      for (let localX = 0; localX < scanSize; localX += 1) {
        const x = startX - 1 + localX;
        cellRefs[localY * scanSize + localX] = self.resolveRuntimeDualGridRef(scene.terrain.tileCache.get(`${x},${y}`));
      }
    }
    for (let vertexY = startY; vertexY <= startY + CHUNK_SIZE; vertexY += 1) {
      const localY = vertexY - startY;
      for (let vertexX = startX; vertexX <= startX + CHUNK_SIZE; vertexX += 1) {
        const localX = vertexX - startX;
        const nw = cellRefs[localY * scanSize + localX];
        const sw = cellRefs[(localY + 1) * scanSize + localX];
        const ne = cellRefs[localY * scanSize + localX + 1];
        const se = cellRefs[(localY + 1) * scanSize + localX + 1];
        const refs = self.dualGridVertexRefsScratch;
        const masks = self.dualGridVertexMasksScratch;
        refs[0] = null;
        refs[1] = null;
        refs[2] = null;
        refs[3] = null;
        masks[0] = 0;
        masks[1] = 0;
        masks[2] = 0;
        masks[3] = 0;
        let occupiedMask = 0;
        occupiedMask = self.collectDualGridVertexRef(refs, masks, occupiedMask, nw, 1);
        occupiedMask = self.collectDualGridVertexRef(refs, masks, occupiedMask, sw, 2);
        occupiedMask = self.collectDualGridVertexRef(refs, masks, occupiedMask, ne, 4);
        occupiedMask = self.collectDualGridVertexRef(refs, masks, occupiedMask, se, 8);
        if (!refs[0]) continue;

        for (let index = 1; index < refs.length; index += 1) {
          const ref = refs[index];
          const mask = masks[index] ?? 0;
          if (!ref) continue;
          let target = index - 1;
          while (target >= 0) {
            const targetRef = refs[target];
            if (!targetRef || targetRef.renderOrder <= ref.renderOrder) {
              break;
            }
            refs[target + 1] = targetRef;
            masks[target + 1] = masks[target] ?? 0;
            target -= 1;
          }
          refs[target + 1] = ref;
          masks[target + 1] = mask;
        }
        const dx = (vertexX - 0.5) * cellSize;
        const dy = (vertexY - 0.5) * cellSize;
        for (let index = 0; index < refs.length; index += 1) {
          const ref = refs[index];
          if (!ref) continue;
          const targetMask = (masks[index] ?? 0) & 15;
          const backgroundMask = occupiedMask & ~targetMask & 15;
          if (targetMask === 15 && backgroundMask === 0) continue;
          self.drawDualGridSprite(chunkContainer, ref, dx, dy, cellSize, targetMask, targetMask);
        }
      }
    }
  }

export function buildTerrainOverlaySignatureImpl(self: PixiMapRendererAdapter, scene: MapSceneSnapshot): string {
    return [
      scene.overlays.senseQi ? `sense:${scene.overlays.senseQi.levelBaseValue ?? ''}` : 'null',
      self.formationRangeSignature,
    ].join('||');
  }

export function setPathHighlightImpl(self: PixiMapRendererAdapter, cells: GridPoint[], fadeDurationMs: number): void {
    if (buildGridPointSignature(cells) === buildGridPointSignature(self.pathCells)) return;
    if (self.pathCells.length > 0) {
      self.fadingPath = {
        cells: self.pathCells.map((cell) => ({ x: cell.x, y: cell.y })),
        startedAt: performance.now(),
        durationMs: Math.max(1, Math.round(fadeDurationMs)),
      };
    }
    self.pathCells = cells.map((cell) => ({ x: cell.x, y: cell.y }));
  }

export function syncTileVisibilityTransitionsImpl(self: PixiMapRendererAdapter, 
    visibleTiles: ReadonlySet<string>,
    tileCache: ReadonlyMap<string, Tile>,
    now: number,
    transitionStartedAt: number,
    transitionDurationMs: number,
  ): void {
    const shouldAnimateVisibleEnter = self.previousVisibleTileKeys.size > 0;
    const transitionState = {
      startedAt: Number.isFinite(transitionStartedAt) ? transitionStartedAt : now,
      durationMs: Math.max(1, Math.round(Number.isFinite(transitionDurationMs) ? transitionDurationMs : TILE_HIDDEN_FADE_MS)),
    };
    for (const key of self.previousVisibleTileKeys) {
      if (!visibleTiles.has(key) && tileCache.has(key) && !self.hiddenTileFadeStartedAt.has(key)) {
        self.hiddenTileFadeStartedAt.set(key, transitionState);
      }
    }
    for (const key of visibleTiles) {
      if (shouldAnimateVisibleEnter && !self.previousVisibleTileKeys.has(key) && tileCache.has(key)) {
        self.visibleTileFadeStartedAt.set(key, transitionState);
      }
      self.hiddenTileFadeStartedAt.delete(key);
    }
    self.previousVisibleTileKeys = new Set(visibleTiles);
  }

export function updateTerrainChunksImpl(self: PixiMapRendererAdapter, scene: MapSceneSnapshot, camera: CameraState): void {
    const cellSize = getCellSize();
    const startGX = Math.floor((camera.x - self.width / 2 - camera.offsetX) / cellSize) - 2;
    const startGY = Math.floor((camera.y - self.height / 2 - camera.offsetY) / cellSize) - 2;
    const endGX = Math.ceil((camera.x + self.width / 2 - camera.offsetX) / cellSize) + 2;
    const endGY = Math.ceil((camera.y + self.height / 2 - camera.offsetY) / cellSize) + 2;
    const startCX = Math.floor(startGX / CHUNK_SIZE);
    const startCY = Math.floor(startGY / CHUNK_SIZE);
    const endCX = Math.floor(endGX / CHUNK_SIZE);
    const endCY = Math.floor(endGY / CHUNK_SIZE);
    self.chunkFrame += 1;
    let visibleChunkCount = 0;
    for (let cy = startCY; cy <= endCY; cy += 1) {
      for (let cx = startCX; cx <= endCX; cx += 1) {
        visibleChunkCount += 1;
        const key = `${cx},${cy}`;
        let chunk = self.terrainChunks.get(key);
        if (!chunk) {
          chunk = self.createTerrainChunk(key, cx, cy);
          self.terrainChunks.set(key, chunk);
        }
        chunk.lastSeenFrame = self.chunkFrame;
        const staticSignature = self.resolveTerrainChunkStaticSignature(chunk, scene, cellSize);
        if (staticSignature !== chunk.staticSignature) {
          self.profiler.count('terrainChunkRebuilds');
          const staticRebuildStartedAt = self.profiler.start();
          self.rebuildTerrainChunkStaticLayers(chunk, scene, cellSize, staticSignature);
          self.profiler.end('terrainRebuild', staticRebuildStartedAt);
        }
        const overlaySignature = self.resolveTerrainChunkOverlaySignature(chunk, scene, cellSize);
        if (overlaySignature !== chunk.overlaySignature) {
          const overlayRebuildStartedAt = self.profiler.start();
          self.rebuildTerrainChunkOverlayLayer(chunk, scene, cellSize, overlaySignature);
          self.profiler.end('terrainRebuild', overlayRebuildStartedAt);
        }
      }
    }
    for (const [key, chunk] of self.terrainChunks) {
      if (self.chunkFrame - chunk.lastSeenFrame > 4) {
        self.destroyTerrainChunk(chunk);
        self.terrainChunks.delete(key);
      }
    }
    self.profiler.setCounter('visibleChunks', visibleChunkCount);
    const terrainFogStartedAt = self.profiler.start();
    self.rebuildTerrainFogLayer(scene, startCX, startCY, endCX, endCY, cellSize);
    self.profiler.end('terrainFog', terrainFogStartedAt);
    const pathLayerStartedAt = self.profiler.start();
    self.rebuildPathLayer(scene);
    self.profiler.end('pathLayer', pathLayerStartedAt);
  }

export function createTerrainChunkImpl(self: PixiMapRendererAdapter, key: string, cx: number, cy: number): TerrainChunkView {
    const chunk: TerrainChunkView = {
      key,
      cx,
      cy,
      baseContainer: new Container(),
      spriteContainer: new Container(),
      edgeContainer: new Container(),
      glyphContainer: new Container(),
      overlayContainer: new Container(),
      staticSignature: '',
      overlaySignature: '',
      staticSignatureDeps: null,
      overlaySignatureDeps: null,
      lastSeenFrame: self.chunkFrame,
    };
    chunk.baseContainer.label = `terrain-base-chunk:${key}`;
    chunk.spriteContainer.label = `terrain-sprite-chunk:${key}`;
    chunk.edgeContainer.label = `terrain-edge-chunk:${key}`;
    chunk.glyphContainer.label = `terrain-glyph-chunk:${key}`;
    chunk.overlayContainer.label = `terrain-overlay-chunk:${key}`;
    chunk.overlayContainer.sortableChildren = true;
    self.terrainBaseLayer.addChild(chunk.baseContainer);
    self.terrainSpriteLayer.addChild(chunk.spriteContainer);
    self.terrainEdgeLayer.addChild(chunk.edgeContainer);
    self.terrainGlyphLayer.addChild(chunk.glyphContainer);
    self.terrainOverlayLayer.addChild(chunk.overlayContainer);
    return chunk;
  }

export function destroyTerrainChunkImpl(self: PixiMapRendererAdapter, chunk: TerrainChunkView): void {
    chunk.baseContainer.destroy({ children: true });
    chunk.spriteContainer.destroy({ children: true });
    chunk.edgeContainer.destroy({ children: true });
    chunk.glyphContainer.destroy({ children: true });
    chunk.overlayContainer.destroy({ children: true });
  }

export function rebuildTerrainFogLayerImpl(self: PixiMapRendererAdapter, 
    scene: MapSceneSnapshot,
    startCX: number,
    startCY: number,
    endCX: number,
    endCY: number,
    cellSize: number,
  ): void {
    const now = performance.now();
    self.pruneCompletedTerrainFogTransitions(now);
    const signature = [
      cellSize,
      startCX,
      startCY,
      endCX,
      endCY,
      scene.terrain.visibleTileRevision,
      scene.terrain.tileCache.size,
    ].join('|');
    const hasActiveFogTransitions = self.visibleTileFadeStartedAt.size > 0 || self.hiddenTileFadeStartedAt.size > 0;
    const activeSignature = hasActiveFogTransitions
      ? `${signature}|${self.visibleTileFadeStartedAt.size}|${self.hiddenTileFadeStartedAt.size}`
      : '';
    if (hasActiveFogTransitions
      && activeSignature === self.terrainFogActiveSignature
      && now - self.terrainFogLastRebuildAt < 32) {
      return;
    }
    if (!hasActiveFogTransitions && signature === self.terrainFogSignature) {
      return;
    }
    self.terrainFogActiveSignature = activeSignature;
    self.terrainFogLastRebuildAt = now;
    self.terrainFogSignature = hasActiveFogTransitions ? '' : signature;
    const activeFogBucket = hasActiveFogTransitions ? Math.floor(now / 32) : 0;
    for (let cy = startCY; cy <= endCY; cy += 1) {
      for (let cx = startCX; cx <= endCX; cx += 1) {
        const chunk = self.getOrCreateTerrainFogChunk(cx, cy);
        chunk.lastSeenFrame = self.chunkFrame;
        const chunkSignature = self.buildTerrainFogChunkSignature(scene, cx, cy, cellSize, activeFogBucket);
        if (chunkSignature !== chunk.signature) {
          self.rebuildTerrainFogChunk(chunk, scene, cellSize, now, chunkSignature);
        }
      }
    }
    self.pruneUnusedTerrainFogChunks();
    if (self.visibleTileFadeStartedAt.size === 0 && self.hiddenTileFadeStartedAt.size === 0) {
      self.terrainFogSignature = signature;
      self.terrainFogActiveSignature = '';
    }
  }

export function getOrCreateTerrainFogChunkImpl(self: PixiMapRendererAdapter, cx: number, cy: number): TerrainFogChunkView {
    const key = `${cx},${cy}`;
    let chunk = self.terrainFogChunks.get(key);
    if (!chunk) {
      chunk = { key, cx, cy, graphics: new Graphics(), signature: '', lastSeenFrame: self.chunkFrame };
      chunk.graphics.label = `terrain-fog-chunk:${key}`;
      self.terrainFogChunks.set(key, chunk);
      self.terrainFogLayer.addChild(chunk.graphics);
    }
    return chunk;
  }

export function buildTerrainFogChunkSignatureImpl(self: PixiMapRendererAdapter, 
    scene: MapSceneSnapshot,
    cx: number,
    cy: number,
    cellSize: number,
    activeFogBucket: number,
  ): string {
    return [
      cellSize,
      cx,
      cy,
      scene.terrain.visibleTileRevision,
      scene.terrain.terrainChunkRevisions.get(`${cx},${cy}`) ?? 0,
      scene.terrain.tileCache.size,
      activeFogBucket,
      self.visibleTileFadeStartedAt.size,
      self.hiddenTileFadeStartedAt.size,
    ].join('|');
  }

export function rebuildTerrainFogChunkImpl(self: PixiMapRendererAdapter, 
    chunk: TerrainFogChunkView,
    scene: MapSceneSnapshot,
    cellSize: number,
    now: number,
    signature: string,
  ): void {
    const startX = chunk.cx * CHUNK_SIZE;
    const startY = chunk.cy * CHUNK_SIZE;
    chunk.graphics.clear();
    for (let y = startY; y < startY + CHUNK_SIZE; y += 1) {
      for (let x = startX; x < startX + CHUNK_SIZE; x += 1) {
        const key = `${x},${y}`;
        const tile = scene.terrain.tileCache.get(key);
        const sx = x * cellSize;
        const sy = y * cellSize;
        if (!scene.terrain.visibleTiles.has(key)) {
          const hiddenFade = self.resolveTileFade(self.hiddenTileFadeStartedAt.get(key), now, false);
          chunk.graphics.rect(sx, sy, cellSize, cellSize).fill({ color: tile ? 0x0c0a08 : 0x080605, alpha: (tile ? 0.72 : 0.94) * hiddenFade });
          if (hiddenFade >= 1) {
            self.hiddenTileFadeStartedAt.delete(key);
          }
          continue;
        }
        const visibleFade = self.resolveTileFade(self.visibleTileFadeStartedAt.get(key), now, true);
        if (visibleFade > 0) {
          chunk.graphics.rect(sx, sy, cellSize, cellSize).fill({ color: 0x0c0a08, alpha: 0.72 * visibleFade });
        } else {
          self.visibleTileFadeStartedAt.delete(key);
        }
      }
    }
    chunk.signature = signature;
  }

export function pruneUnusedTerrainFogChunksImpl(self: PixiMapRendererAdapter, ): void {
    for (const [key, chunk] of self.terrainFogChunks) {
      if (self.chunkFrame - chunk.lastSeenFrame > 4) {
        chunk.graphics.destroy({ children: true });
        self.terrainFogChunks.delete(key);
      }
    }
  }

export function pruneCompletedTerrainFogTransitionsImpl(self: PixiMapRendererAdapter, now: number): void {
    for (const [key, state] of self.visibleTileFadeStartedAt) {
      if (now - state.startedAt >= state.durationMs) {
        self.visibleTileFadeStartedAt.delete(key);
      }
    }
    for (const [key, state] of self.hiddenTileFadeStartedAt) {
      if (now - state.startedAt >= state.durationMs) {
        self.hiddenTileFadeStartedAt.delete(key);
      }
    }
  }

export function resolveTerrainChunkStaticSignatureImpl(self: PixiMapRendererAdapter, chunk: TerrainChunkView, scene: MapSceneSnapshot, cellSize: number): string {
    const deps: TerrainChunkStaticSignatureDeps = {
      cellSize,
      renderRuntimeTileSprites: self.performanceConfig.renderRuntimeTileSprites,
      terrainTextMode: self.performanceConfig.terrainTextMode,
      runtimeTileSpriteRevision: self.runtimeTileSpriteRevision,
      terrainChunkRevision: scene.terrain.terrainChunkRevisions.get(chunk.key) ?? 0,
    };
    if (chunk.staticSignature && chunk.staticSignatureDeps && self.isSameTerrainChunkStaticSignatureDeps(chunk.staticSignatureDeps, deps)) {
      self.profiler.count('terrainChunkSignatureHits');
      return chunk.staticSignature;
    }
    const signatureStartedAt = self.profiler.start();
    const signature = self.buildTerrainChunkStaticSignature(scene, chunk.cx, chunk.cy, cellSize);
    self.profiler.end('terrainSignature', signatureStartedAt);
    self.profiler.count('terrainChunkSignatures');
    chunk.staticSignatureDeps = deps;
    return signature;
  }

export function resolveTerrainChunkOverlaySignatureImpl(self: PixiMapRendererAdapter, chunk: TerrainChunkView, scene: MapSceneSnapshot, cellSize: number): string {
    const deps: TerrainChunkOverlaySignatureDeps = {
      cellSize,
      terrainOverlaySignature: self.terrainOverlaySignature,
      visibleTileRevision: scene.terrain.visibleTileRevision,
    };
    if (chunk.overlaySignature && chunk.overlaySignatureDeps && self.isSameTerrainChunkOverlaySignatureDeps(chunk.overlaySignatureDeps, deps)) {
      return chunk.overlaySignature;
    }
    const signatureStartedAt = self.profiler.start();
    const signature = self.buildTerrainChunkOverlaySignature(scene, chunk.cx, chunk.cy, cellSize);
    self.profiler.end('terrainSignature', signatureStartedAt);
    chunk.overlaySignatureDeps = deps;
    return signature;
  }

export function isSameTerrainChunkStaticSignatureDepsImpl(self: PixiMapRendererAdapter, previous: TerrainChunkStaticSignatureDeps, next: TerrainChunkStaticSignatureDeps): boolean {
    return previous.cellSize === next.cellSize
      && previous.renderRuntimeTileSprites === next.renderRuntimeTileSprites
      && previous.terrainTextMode === next.terrainTextMode
      && previous.runtimeTileSpriteRevision === next.runtimeTileSpriteRevision
      && previous.terrainChunkRevision === next.terrainChunkRevision;
  }

export function isSameTerrainChunkOverlaySignatureDepsImpl(self: PixiMapRendererAdapter, previous: TerrainChunkOverlaySignatureDeps, next: TerrainChunkOverlaySignatureDeps): boolean {
    return previous.cellSize === next.cellSize
      && previous.terrainOverlaySignature === next.terrainOverlaySignature
      && previous.visibleTileRevision === next.visibleTileRevision;
  }

export function buildTerrainChunkStaticSignatureImpl(self: PixiMapRendererAdapter, scene: MapSceneSnapshot, cx: number, cy: number, cellSize: number): string {
    return buildPixiTerrainChunkStaticSignature(
      scene.terrain.tileCache,
      cx,
      cy,
      cellSize,
      self.performanceConfig.renderRuntimeTileSprites,
      self.performanceConfig.terrainTextMode,
      self.runtimeTileSpriteRevision,
    );
  }

export function buildTerrainChunkOverlaySignatureImpl(self: PixiMapRendererAdapter, scene: MapSceneSnapshot, cx: number, cy: number, cellSize: number): string {
    return buildPixiTerrainChunkOverlaySignature(
      scene.terrain.tileCache,
      scene.terrain.visibleTiles,
      cx,
      cy,
      cellSize,
      self.terrainOverlaySignature,
      scene.overlays.senseQi?.levelBaseValue ?? null,
    );
  }

export function rebuildTerrainChunkStaticLayersImpl(self: PixiMapRendererAdapter, chunk: TerrainChunkView, scene: MapSceneSnapshot, cellSize: number, signature: string): void {
    self.disableTerrainChunkCache(chunk.baseContainer);
    self.disableTerrainChunkCache(chunk.spriteContainer);
    self.disableTerrainChunkCache(chunk.edgeContainer);
    self.disableTerrainChunkCache(chunk.glyphContainer);
    self.clearContainer(chunk.baseContainer);
    self.clearContainer(chunk.spriteContainer);
    self.clearContainer(chunk.edgeContainer);
    self.clearContainer(chunk.glyphContainer);
    const baseGraphics = new Graphics();
    const startX = chunk.cx * CHUNK_SIZE;
    const startY = chunk.cy * CHUNK_SIZE;
    for (let y = startY; y < startY + CHUNK_SIZE; y += 1) {
      for (let x = startX; x < startX + CHUNK_SIZE; x += 1) {
        const key = `${x},${y}`;
        const tile = scene.terrain.tileCache.get(key);
        const sx = x * cellSize;
        const sy = y * cellSize;
        if (tile) {
          const bg = parseColor(TILE_VISUAL_BG_COLORS[tile.type], 0x333333);
          baseGraphics.rect(sx, sy, cellSize, cellSize).fill({ color: bg });
          baseGraphics.rect(sx, sy, cellSize, cellSize).stroke({ color: 0x000000, alpha: 0.1, width: 0.5 });
          self.drawRuntimeTileSprite(chunk.spriteContainer, tile, sx, sy, cellSize);
        }
        const glyph = tile ? TILE_VISUAL_GLYPHS[tile.type] : null;
        const hasRuntimeSprite = tile ? self.resolveRuntimeTileSpriteRef(tile) !== null : false;
        if (tile && glyph && !hasRuntimeSprite) {
          const label = new Text({
            text: glyph,
            style: textStyle('tileGlyph', cellSize * 0.6, TILE_VISUAL_GLYPH_COLORS[tile.type] ?? 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0)', 0),
            anchor: 0.5,
          });
          label.position.set(sx + cellSize / 2, sy + cellSize / 2 + 1);
          chunk.glyphContainer.addChild(label);
        }
      }
    }
    self.drawRuntimeDualGridEdges(chunk.edgeContainer, scene, startX, startY, cellSize);
    chunk.baseContainer.addChild(baseGraphics);
    chunk.staticSignature = signature;
    self.enableTerrainChunkCache(chunk.baseContainer);
    self.enableTerrainChunkCache(chunk.spriteContainer);
    self.enableTerrainChunkCache(chunk.edgeContainer);
    self.enableTerrainChunkCache(chunk.glyphContainer);
  }

export function rebuildTerrainChunkOverlayLayerImpl(self: PixiMapRendererAdapter, chunk: TerrainChunkView, scene: MapSceneSnapshot, cellSize: number, signature: string): void {
    self.disableTerrainChunkCache(chunk.overlayContainer);
    self.clearContainer(chunk.overlayContainer);
    const overlayGraphics = new Graphics();
    overlayGraphics.zIndex = 0;
    const startX = chunk.cx * CHUNK_SIZE;
    const startY = chunk.cy * CHUNK_SIZE;
    const senseQiLevelBaseValue = normalizeAuraLevelBaseValue(scene.overlays.senseQi?.levelBaseValue);
    for (let y = startY; y < startY + CHUNK_SIZE; y += 1) {
      for (let x = startX; x < startX + CHUNK_SIZE; x += 1) {
        const key = `${x},${y}`;
        const tile = scene.terrain.tileCache.get(key);
        const sx = x * cellSize;
        const sy = y * cellSize;
        self.drawTerrainOverlays(overlayGraphics, chunk.overlayContainer, scene, tile, key, x, y, sx, sy, cellSize, senseQiLevelBaseValue);
      }
    }
    chunk.overlayContainer.addChild(overlayGraphics);
    chunk.overlaySignature = signature;
    self.enableTerrainChunkCache(chunk.overlayContainer);
  }

export function enableTerrainChunkCacheImpl(self: PixiMapRendererAdapter, container: Container): void {
    if (container.children.length === 0) return;
    container.cacheAsTexture(TERRAIN_CHUNK_CACHE_OPTIONS);
  }

export function disableTerrainChunkCacheImpl(self: PixiMapRendererAdapter, container: Container): void {
    if (!container.isCachedAsTexture) return;
    container.cacheAsTexture(false);
  }

export function drawTerrainOverlaysImpl(self: PixiMapRendererAdapter, 
    graphics: Graphics,
    chunkContainer: Container,
    scene: MapSceneSnapshot,
    tile: Tile | null | undefined,
    key: string,
    gx: number,
    gy: number,
    sx: number,
    sy: number,
    cellSize: number,
    senseQiLevelBaseValue: number,
  ): void {
    const isVisible = scene.terrain.visibleTiles.has(key);
    if (tile && !scene.overlays.senseQi && isVisible) {
      const visibleFormationRangeVisual = self.resolveFormationRangeVisual(gx, gy, false);
      if (visibleFormationRangeVisual) self.drawFormationRangeVisual(graphics, chunkContainer, sx, sy, cellSize, visibleFormationRangeVisual);
    }
    if (tile && isVisible) {
      self.drawTileHpBar(graphics, tile, sx, sy, cellSize);
    }
    if (scene.overlays.senseQi) {
      const style = isVisible ? getSenseQiOverlayStyle(tile, senseQiLevelBaseValue) : { color: 0x000000, alpha: 0.34 };
      graphics.rect(sx, sy, cellSize, cellSize).fill(style);
      const formationRangeVisual = self.resolveFormationRangeVisual(gx, gy, true);
      if (formationRangeVisual) self.drawFormationRangeVisual(graphics, chunkContainer, sx, sy, cellSize, formationRangeVisual);
    }
  }

export function drawTileHpBarImpl(self: PixiMapRendererAdapter, graphics: Graphics, tile: Tile, sx: number, sy: number, cellSize: number): void {
    const maxHp = typeof tile.maxHp === 'number' && Number.isFinite(tile.maxHp) ? tile.maxHp : 0;
    const hp = typeof tile.hp === 'number' && Number.isFinite(tile.hp) ? tile.hp : maxHp;
    const hpVisible = tile.hpVisible ?? (hp > 0 && hp < maxHp);
    if (maxHp <= 0 || !hpVisible) {
      return;
    }
    const ratio = clamp01(hp / Math.max(maxHp, 1));
    const barW = Math.max(4, cellSize - 6);
    graphics.rect(sx + 3, sy + 2, barW, 3).fill({ color: 0x000000, alpha: 0.5 });
    graphics.rect(sx + 3, sy + 2, barW * ratio, 3).fill({ color: 0xd6c8ae });
  }

export function resolveTileFadeImpl(self: PixiMapRendererAdapter, state: { startedAt: number; durationMs: number } | undefined, now: number, entering: boolean): number {
    if (!state) return entering ? 0 : 1;
    const progress = clamp01((now - state.startedAt) / Math.max(1, state.durationMs));
    return entering ? 1 - progress : progress;
  }

export function drawCellHighlightImpl(self: PixiMapRendererAdapter, graphics: Graphics, sx: number, sy: number, cellSize: number, fill: string, stroke: string, core: boolean, alphaMultiplier = 1): void {
    const alpha = clamp01(alphaMultiplier);
    graphics.rect(sx + 1, sy + 1, cellSize - 2, cellSize - 2).fill({ color: parseColor(fill), alpha: parseAlpha(fill, 1) * alpha });
    graphics.rect(sx + 1.5, sy + 1.5, cellSize - 3, cellSize - 3).stroke({ color: parseColor(stroke), alpha: parseAlpha(stroke, 1) * alpha, width: core ? 2 : 1.5 });
    if (core) graphics.circle(sx + cellSize / 2, sy + cellSize / 2, Math.max(3, cellSize * 0.12)).fill({ color: parseColor(PATH_TARGET_CORE_COLOR), alpha: parseAlpha(PATH_TARGET_CORE_COLOR, 1) * alpha });
  }

export function drawFormationRangeVisualImpl(self: PixiMapRendererAdapter, graphics: Graphics, chunkContainer: Container, sx: number, sy: number, cellSize: number, visual: FormationRangeVisual): void {
    graphics.rect(sx + 1, sy + 1, cellSize - 2, cellSize - 2).fill(colorWithAlpha(visual.highlightColor, visual.boundary ? 0.34 : 0.24));
    graphics.rect(sx + 1.5, sy + 1.5, cellSize - 3, cellSize - 3).stroke({ ...colorWithAlpha(visual.highlightColor, visual.boundary ? 0.92 : 0.72), width: visual.boundary ? 2.25 : 1.5 });
    if (visual.boundary && visual.boundaryChar) {
      const text = new Text({
        text: visual.boundaryChar,
        style: textStyle('tileGlyph', cellSize * 0.42, visual.boundaryColor, 'rgba(5,18,26,0.86)', 3),
        anchor: 0.5,
      });
      text.position.set(sx + cellSize / 2, sy + cellSize / 2);
      text.zIndex = 650;
      chunkContainer.addChild(text);
    }
  }

export function resolveFormationRangeVisualImpl(self: PixiMapRendererAdapter, gx: number, gy: number, senseQiVisible: boolean): FormationRangeVisual | null {
    const key = `${gx},${gy}`;
    return senseQiVisible
      ? self.formationRangeSenseQiVisuals.get(key) ?? null
      : self.formationRangeVisuals.get(key) ?? null;
  }

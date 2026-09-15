/**
 * 本文件属于客户端地图模块，负责主世界 Pixi/WebGL2 渲染后端。
 *
 * 维护时要保证表现层只处理显示和输入命中，移动合法性、占位和地图权威状态仍以服务端为准。
 */
import {
  Application,
  Assets,
  Container,
  Graphics,
  Rectangle,
  RendererType,
  Sprite,
  Text,
  Texture,
  type Renderer,
  type WebGLRenderer,
} from 'pixi.js';
import {
  isMobileEntityObjectKind,
  isOffsetInRange,
  SENSE_QI_OVERLAY_STYLE,
  TILE_VISUAL_BG_COLORS,
  TILE_VISUAL_GLYPH_COLORS,
  TILE_VISUAL_GLYPHS,
  normalizeAuraLevelBaseValue,
  resolveWorldObjectRenderOrder,
  type CombatEffect,
  type GameTimeState,
  type GridPoint,
  type GroundItemPileView,
  type NpcQuestMarker,
  type Tile,
} from '@mud/shared';
import { getCellSize } from '../../display';
import { DEFAULT_MAP_PERFORMANCE_CONFIG, type MapPerformanceConfig } from '../../constants/ui/performance';
import {
  PATH_ARROW_COLOR,
  PATH_FILL_COLOR,
  PATH_STROKE_COLOR,
  PATH_TARGET_CORE_COLOR,
  PATH_TARGET_FILL_COLOR,
  PATH_TARGET_STROKE_COLOR,
} from '../../constants/visuals/path-highlight';
import {
  OTHER_THREAT_ARROW_COLOR,
  OTHER_THREAT_ARROW_GLOW,
  SELF_THREAT_ARROW_COLOR,
  SELF_THREAT_ARROW_GLOW,
} from '../../constants/visuals/threat-arrow';
import {
  TILE_HIDDEN_FADE_MS,
  TIME_ATMOSPHERE_PROFILES,
  TIME_FILTER_LERP,
} from '../../constants/visuals/time-atmosphere';
import { getMonsterPresentation } from '../../monster-presentation';
import {
  RUNTIME_IMAGE_OVERRIDES_CHANGED_EVENT,
} from '../../renderer/local-runtime-image-overrides';
import { formatDisplayInteger } from '../../utils/number';
import { t as translateUi } from '../../ui/i18n';
import type { CameraState } from '../camera/camera-controller';
import type { TopdownProjection } from '../projection/topdown-projection';
import type { MapEntityTransition, MapSceneSnapshot, ObservedMapEntity } from '../types';
import {
  type PixiProfileFrameSchedule,
  type PixiProfileRendererState,
} from './pixi-profiler-window';
import { normalizeRuntimeImagePackVersion } from '../../renderer/runtime-image-pack-url';
import { PixiRenderProfiler } from './pixi-render-profiler';
import { isPixiEntityInViewport, PixiFrameGridPointSet } from './pixi-frame-spatial-index';
import { PixiCombatEffectRuntime } from './pixi-combat-effect-runtime';
import { buildArtifactAuraGeometry } from './pixi-artifact-aura-geometry';
import {
  buildPixiTerrainChunkOverlaySignature,
  buildPixiTerrainChunkStaticSignature,
  PIXI_TERRAIN_CHUNK_SIZE,
} from './pixi-terrain-cache-signatures';
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
import {
  buildBuildPreviewSignature,
  buildFengShuiOverlaySignature,
  buildFormationRangeSignature,
  buildGridPointSignature,
  buildGroundPileSignature,
  buildNameplateBadgeSignature,
  buildSenseQiHoverSignature,
  buildTargetingOverlaySignature,
  clamp01,
  colorWithAlpha,
  easeInOutCubic,
  easeOutCubic,
  getFengShuiOverlayFill,
  getFengShuiOverlayStroke,
  getSenseQiOverlayStyle,
  isTileInsideFormationRange,
  isTileOnFormationBoundary,
  parseAlpha,
  parseColor,
  resolveEntityBadgePalette,
  resolveEntityFallbackLabel,
  resolveEntityHpBarColor,
  resolveEntityLabelColor,
  resolveGroundItemLabel,
  resolveNameplateBadges,
  textStyle,
} from './pixi-render-primitives';
import type {
  AnimEntity,
  EntityNameplateBadge,
  EntityView,
  FadingPathState,
  FormationRangeVisual,
  TerrainChunkOverlaySignatureDeps,
  TerrainChunkStaticSignatureDeps,
  TerrainChunkView,
  TerrainFogChunkView,
  TimeAtmosphereState,
} from './pixi-render-state';
import {
  ensureRuntimeTileSpritesRequestedImpl,
  loadRuntimeTileSpriteManifestImpl,
  ensureRuntimeImageOverrideListenerImpl,
  removeRuntimeImageOverrideListenerImpl,
  reloadRuntimeTileSpriteManifestForLocalOverridesImpl,
  destroyRuntimeDerivedTexturesImpl,
  releaseRuntimeImageResourcesImpl,
  getRuntimeAtlasTextureImpl,
  rememberRuntimeAtlasTextureImpl,
  resolveRuntimeTileSpriteRefImpl,
  resolveRuntimeDualGridRefImpl,
  getRuntimeTileTextureImpl,
  requestRuntimeTileTextureImpl,
  resolveRuntimeEntitySpriteSelectionImpl,
  getRuntimeEntityTextureImpl,
  requestRuntimeEntityTextureImpl,
} from './pixi-renderer.sprites';
import {
  invalidateEntityStaticViewsImpl,
  syncEntitiesImpl,
  createEntityViewImpl,
  destroyEntityViewImpl,
  patchEntityStaticImpl,
  isEntityTextModeImpl,
  patchRuntimeEntitySpriteImpl,
  resolveCurrentImageFlipSignImpl,
  applyEntityImageScaleImpl,
  patchEntityNameplateImpl,
  drawEntityBarsImpl,
  drawFormationMarkerImpl,
  syncArtifactAuraImpl,
  createArtifactAuraFrameImpl,
  updateArtifactAuraFrameImpl,
  drawRespawnLabelImpl,
  formatRespawnCountdownImpl,
  drawBuffsImpl,
  drawNpcQuestMarkerImpl,
  updateEntityViewsImpl,
  patchEntityMotionImpl,
  ensureLocalPlayerFallbackImpl,
} from './pixi-renderer.entities';
import {
  clearTerrainFogChunksImpl,
  invalidateTerrainChunksImpl,
  drawRuntimeTileSpriteImpl,
  drawDualGridSpriteImpl,
  collectDualGridVertexRefImpl,
  drawRuntimeDualGridEdgesImpl,
  buildTerrainOverlaySignatureImpl,
  setPathHighlightImpl,
  syncTileVisibilityTransitionsImpl,
  updateTerrainChunksImpl,
  createTerrainChunkImpl,
  destroyTerrainChunkImpl,
  rebuildTerrainFogLayerImpl,
  getOrCreateTerrainFogChunkImpl,
  buildTerrainFogChunkSignatureImpl,
  rebuildTerrainFogChunkImpl,
  pruneUnusedTerrainFogChunksImpl,
  pruneCompletedTerrainFogTransitionsImpl,
  resolveTerrainChunkStaticSignatureImpl,
  resolveTerrainChunkOverlaySignatureImpl,
  isSameTerrainChunkStaticSignatureDepsImpl,
  isSameTerrainChunkOverlaySignatureDepsImpl,
  buildTerrainChunkStaticSignatureImpl,
  buildTerrainChunkOverlaySignatureImpl,
  rebuildTerrainChunkStaticLayersImpl,
  rebuildTerrainChunkOverlayLayerImpl,
  enableTerrainChunkCacheImpl,
  disableTerrainChunkCacheImpl,
  drawTerrainOverlaysImpl,
  drawTileHpBarImpl,
  resolveTileFadeImpl,
  drawCellHighlightImpl,
  drawFormationRangeVisualImpl,
  resolveFormationRangeVisualImpl,
} from './pixi-renderer.terrain';
import {
  rebuildWorldOverlaysImpl,
  rebuildInteractionOverlayLayerImpl,
  rebuildTargetingLayerImpl,
  rebuildSenseQiHoverLayerImpl,
  drawGroundPileImpl,
  rebuildPathLayerImpl,
  drawPathCellsImpl,
  drawPathArrowsImpl,
  rebuildFormationRangeVisualCacheIfNeededImpl,
  renderThreatArrowsImpl,
  drawDashedQuadraticCurveImpl,
  drawThreatArrowHeadImpl,
  getQuadraticPointImpl,
  resolveThreatEntityViewImpl,
  triggerAttackMotionImpl,
  resolveAttackMotionViewImpl,
  getFadingPathAlphaImpl,
  renderTimeOverlayImpl,
  resolveTimeAtmosphereImpl,
  buildRgbaVectorImpl,
  lerpColorVectorImpl,
} from './pixi-renderer.overlays';

export type PixiRenderer = Renderer<HTMLCanvasElement>;
export const ENTITY_FACING_FLIP_TRANSITION_MS = 160;
export const ATTACK_MOTION_DURATION_MS = 180;
export const ARTIFACT_AURA_COLOR = 0xa8fbff;
export const ARTIFACT_AURA_FLOW_MS = 1200;
export const ARTIFACT_AURA_FRAME_COUNT = 16;

export const CHUNK_SIZE = PIXI_TERRAIN_CHUNK_SIZE;
export const DEFAULT_PATH_TRAIL_FADE_MS = 500;
export const PATH_TRAIL_FADE_ALPHA = 0.7;
export const DEFAULT_RUNTIME_IMAGE_PACK_MANIFEST_URL = '/assets/runtime-image-packs/default/manifest.json';
export const TERRAIN_CHUNK_CACHE_OPTIONS = {
  resolution: 1,
  scaleMode: 'nearest',
} as const;
export const DUAL_GRID_ATLAS_COORDS: ReadonlyArray<readonly [number, number]> = [
  [0, 3], [3, 3], [0, 0], [3, 2],
  [0, 2], [1, 2], [2, 3], [3, 1],
  [1, 3], [0, 1], [3, 0], [2, 0],
  [1, 0], [2, 2], [1, 1], [2, 1],
] as const;
export const DUAL_GRID_QUADS = [
  { mask: 1, x: 0, y: 0 },
  { mask: 2, x: 0, y: 0.5 },
  { mask: 4, x: 0.5, y: 0 },
  { mask: 8, x: 0.5, y: 0.5 },
] as const;
export const DUAL_GRID_QUARTER_SOURCE_OVERLAP_PX = 1;
export const SELF_THREAT_ARROW_PIXI_COLOR = parseColor(SELF_THREAT_ARROW_COLOR);
export const SELF_THREAT_ARROW_PIXI_GLOW = parseColor(SELF_THREAT_ARROW_GLOW);
export const SELF_THREAT_ARROW_PIXI_GLOW_ALPHA = parseAlpha(SELF_THREAT_ARROW_GLOW, 1);
export const OTHER_THREAT_ARROW_PIXI_COLOR = parseColor(OTHER_THREAT_ARROW_COLOR);
export const OTHER_THREAT_ARROW_PIXI_GLOW = parseColor(OTHER_THREAT_ARROW_GLOW);
export const OTHER_THREAT_ARROW_PIXI_GLOW_ALPHA = parseAlpha(OTHER_THREAT_ARROW_GLOW, 1);

/** Pixi/WebGL2 主世界渲染适配器。 */
export class PixiMapRendererAdapter {
  readonly app = new Application<PixiRenderer>();
  readonly world = new Container();
  readonly terrainBaseLayer = new Container();
  readonly terrainSpriteLayer = new Container();
  readonly terrainEdgeLayer = new Container();
  readonly terrainGlyphLayer = new Container();
  readonly terrainOverlayLayer = new Container();
  readonly terrainFogLayer = new Container();
  readonly pathLayer = new Container();
  readonly interactionOverlayGraphics = new Graphics();
  readonly targetingGraphics = new Graphics();
  readonly senseQiHoverGraphics = new Graphics();
  readonly groundLayer = new Container();
  readonly threatArrowLayer = new Container();
  readonly entityLayer = new Container();
  readonly effectLayer = new Container();
  readonly combatEffectRuntime = new PixiCombatEffectRuntime(this.effectLayer);
  readonly screenLayer = new Container();
  readonly pathGraphics = new Graphics();
  readonly threatArrowGraphics = new Graphics();
  readonly timeOverlayGraphics = new Graphics();
  readonly terrainChunks = new Map<string, TerrainChunkView>();
  readonly terrainFogChunks = new Map<string, TerrainFogChunkView>();
  readonly entities = new Map<string, EntityView>();
  readonly crowdedTileKeysScratch = new PixiFrameGridPointSet();
  readonly formationRangeVisuals = new Map<string, FormationRangeVisual>();
  readonly formationRangeSenseQiVisuals = new Map<string, FormationRangeVisual>();
  readonly localPlayerFallbackId = '__local-player-fallback__';
  readonly visibleTileFadeStartedAt = new Map<string, { startedAt: number; durationMs: number }>();
  readonly hiddenTileFadeStartedAt = new Map<string, { startedAt: number; durationMs: number }>();
  previousVisibleTileKeys = new Set<string>();
  terrainFogSignature = '';
  terrainFogActiveSignature = '';
  terrainFogLastRebuildAt = 0;
  canvas: HTMLCanvasElement | null = null;
  ready = false;
  width = 1;
  height = 1;
  chunkFrame = 0;
  lastVisibleTileRevision = -1;
  lastEntityMotionToken?: number;
  formationRangeSignature = '';
  terrainOverlaySignature = '';
  groundPileSignature = '';
  interactionOverlaySignature = '';
  targetingOverlaySignature = '';
  senseQiHoverSignature = '';
  pathLayerSignature = '';
  pathCells: GridPoint[] = [];
  fadingPath: FadingPathState | null = null;
  threatArrows: Array<{ ownerId: string; targetId: string }> = [];
  performanceConfig: MapPerformanceConfig = { ...DEFAULT_MAP_PERFORMANCE_CONFIG };
  runtimeTileSpriteRefs = new Map<string, PixiTileSpriteRef>();
  runtimeLegacyTileKeys = new Map<string, string>();
  runtimeTileSpriteRefCache = new WeakMap<Tile, PixiTileSpriteRef | null>();
  readonly dualGridCellRefsScratch: Array<PixiTileSpriteRef | null> = [];
  readonly dualGridVertexRefsScratch: Array<PixiTileSpriteRef | null> = [null, null, null, null];
  readonly dualGridVertexMasksScratch: number[] = [0, 0, 0, 0];
  runtimeAtlasTextures = new Map<string, Texture>();
  runtimeTileTextures = new Map<string, Texture>();
  runtimeTileTextureRequests = new Set<string>();
  runtimeEntitySpriteRefs = new Map<string, PixiTileSpriteRef>();
  runtimeEntityTextures = new Map<string, Texture>();
  runtimeEntityTextureRequests = new Set<string>();
  runtimeTileManifestState: 'idle' | 'loading' | 'loaded' | 'error' = 'idle';
  runtimeTileSpriteRevision = 0;
  runtimeImageOverrideListener: (() => void) | null = null;
  runtimeImageGeneration = 0;
  runtimeActiveAtlasSources = new Set<string>();
  destroyed = false;
  mountGeneration = 0;
  rendererInitPromise: Promise<void> | null = null;
  rendererInitialized = false;
  applicationDestroyed = false;
  readonly profiler = new PixiRenderProfiler(() => this.buildProfileRendererState());
  timeAtmosphere: TimeAtmosphereState = {
    initialized: false,
    overlay: [0, 0, 0, 0],
    sky: [0, 0, 0, 0],
    horizon: [0, 0, 0, 0],
    vignetteAlpha: 0,
  };

  mount(host: HTMLElement): void {
    if (this.destroyed) throw new Error('地图渲染器已销毁，不能重新挂载');
    const canvas = host.querySelector<HTMLCanvasElement>('#game-canvas') ?? host.querySelector<HTMLCanvasElement>('canvas');
    if (!canvas) throw new Error('地图宿主节点缺少 canvas');
    const generation = this.mountGeneration + 1;
    this.mountGeneration = generation;
    this.canvas = canvas;
    this.ready = false;
    this.profiler.refresh();
    this.pathLayer.addChild(this.interactionOverlayGraphics, this.targetingGraphics, this.senseQiHoverGraphics, this.pathGraphics);
    this.threatArrowGraphics.name = 'threat-arrows';
    this.threatArrowLayer.addChild(this.threatArrowGraphics);
    this.screenLayer.addChild(this.timeOverlayGraphics);
    this.app.stage.addChild(this.world, this.screenLayer);
    this.world.addChild(
      this.terrainBaseLayer,
      this.terrainSpriteLayer,
      this.terrainEdgeLayer,
      this.terrainGlyphLayer,
      this.terrainOverlayLayer,
      this.terrainFogLayer,
      this.pathLayer,
      this.groundLayer,
      this.threatArrowLayer,
      this.entityLayer,
      this.effectLayer,
    );
    this.entityLayer.sortableChildren = true;
    if (!this.rendererInitPromise) {
      this.rendererInitPromise = this.app.init({
        canvas,
        width: Math.max(1, canvas.width),
        height: Math.max(1, canvas.height),
        background: 0x1a1816,
        backgroundAlpha: 1,
        antialias: false,
        autoDensity: false,
        autoStart: false,
        preference: ['webgl'],
        powerPreference: 'high-performance',
        preferWebGLVersion: 2,
      }).then(() => {
        this.rendererInitialized = true;
      });
    }
    if (this.rendererInitialized) {
      this.activateRendererAfterInit(canvas, generation);
      return;
    }
    void this.rendererInitPromise.then(() => {
      this.activateRendererAfterInit(canvas, generation);
    }).catch((error) => {
      if (!this.destroyed && generation === this.mountGeneration) {
        console.error('[map] Pixi/WebGL2 renderer init failed', error);
      }
    });
  }

  unmount(): void {
    this.mountGeneration += 1;
    this.ready = false;
    this.canvas = null;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.mountGeneration += 1;
    this.runtimeImageGeneration += 1;
    this.ready = false;
    this.canvas = null;
    this.resetScene();
    this.profiler.destroy();
    this.removeRuntimeImageOverrideListener();
    this.releaseRuntimeImageResources(new Set());
    if (this.rendererInitialized) {
      this.destroyApplicationResources();
      return;
    }
    if (this.rendererInitPromise) {
      void this.rendererInitPromise.then(() => {
        this.destroyApplicationResources();
      }).catch(() => {
        this.destroyUninitializedStage();
      });
      return;
    }
    this.destroyUninitializedStage();
  }

  /** 只允许当前挂载代次接管异步初始化结果，并按最新 backbuffer 尺寸收口。 */
  activateRendererAfterInit(canvas: HTMLCanvasElement, generation: number): void {
    if (this.destroyed) {
      this.destroyApplicationResources();
      return;
    }
    if (generation !== this.mountGeneration || this.canvas !== canvas) return;
    if (this.app.renderer.canvas !== canvas) {
      throw new Error('主世界 Pixi 渲染器不能切换到新的 canvas');
    }
    if (this.app.renderer.type !== RendererType.WEBGL) {
      throw new Error('主世界 Pixi 渲染器必须使用 WebGL 后端');
    }
    const gl = (this.app.renderer as WebGLRenderer<HTMLCanvasElement>).gl;
    if (!(gl instanceof WebGL2RenderingContext)) throw new Error('主世界 Pixi 渲染器必须使用 WebGL2 上下文');
    this.app.renderer.resize(this.width, this.height, 1);
    this.ready = true;
    this.ensureRuntimeImageOverrideListener();
    this.ensureRuntimeTileSpritesRequested();
  }

  /** Pixi 完成初始化后统一释放 renderer，避免 init 期间直接 destroy 访问未赋值字段。 */
  destroyApplicationResources(): void {
    if (this.applicationDestroyed) return;
    this.applicationDestroyed = true;
    this.combatEffectRuntime.destroy();
    this.app.destroy(false, { children: true, texture: true, textureSource: true, context: true });
  }

  /** 初始化失败或从未开始初始化时，仅销毁已构建的场景树。 */
  destroyUninitializedStage(): void {
    if (this.applicationDestroyed) return;
    this.applicationDestroyed = true;
    if (!this.app.stage.destroyed) {
      this.app.stage.destroy({ children: true, texture: true, textureSource: true, context: true });
    }
  }

  resize(width: number, height: number, backbufferWidth: number, backbufferHeight: number): void {
    if (!this.canvas) return;
    const cssWidth = Math.max(1, width);
    const cssHeight = Math.max(1, height);
    this.width = Math.max(1, Math.floor(backbufferWidth));
    this.height = Math.max(1, Math.floor(backbufferHeight));
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    if (this.canvas.width !== this.width) this.canvas.width = this.width;
    if (this.canvas.height !== this.height) this.canvas.height = this.height;
    if (this.ready) this.app.renderer.resize(this.width, this.height, 1);
  }

  setPerformanceConfig(config: MapPerformanceConfig): void {
    const previous = this.performanceConfig;
    const previousRenderRuntimeTileSprites = previous.renderRuntimeTileSprites;
    const entityTextModeChanged = previous.npcTextMode !== config.npcTextMode
      || previous.monsterTextMode !== config.monsterTextMode
      || previous.herbTextMode !== config.herbTextMode;
    this.performanceConfig = { ...config };
    this.profiler.setEnabled(config.showPixiProfiler);
    if (!previousRenderRuntimeTileSprites && this.performanceConfig.renderRuntimeTileSprites) {
      this.ensureRuntimeTileSpritesRequested();
    }
    this.invalidateTerrainChunks();
    if (entityTextModeChanged) {
      this.invalidateEntityStaticViews();
    }
  }

  syncScene(
    scene: MapSceneSnapshot,
    transition: MapEntityTransition | null,
    motionSyncToken?: number,
    pathFadeDurationMs = DEFAULT_PATH_TRAIL_FADE_MS,
  ): void {
    this.profiler.refresh();
    const startedAt = this.profiler.start();
    this.profiler.count('syncScenes');
    this.ensureRuntimeTileSpritesRequested();
    this.setPathHighlight(scene.overlays.pathCells, pathFadeDurationMs);
    this.threatArrows = scene.overlays.threatArrows.map((entry) => ({ ...entry }));
    const syncEntitiesStartedAt = this.profiler.start();
    this.syncEntities(scene.entities, transition, motionSyncToken);
    this.profiler.end('syncEntities', syncEntitiesStartedAt);
    const formationRangeStartedAt = this.profiler.start();
    this.rebuildFormationRangeVisualCacheIfNeeded();
    this.profiler.end('formationRangeCache', formationRangeStartedAt);
    const terrainOverlaySignature = this.buildTerrainOverlaySignature(scene);
    if (terrainOverlaySignature !== this.terrainOverlaySignature) {
      this.terrainOverlaySignature = terrainOverlaySignature;
      this.invalidateTerrainChunks();
    }
    if (scene.terrain.visibleTileRevision !== this.lastVisibleTileRevision) {
      this.syncTileVisibilityTransitions(
        scene.terrain.visibleTiles,
        scene.terrain.tileCache,
        performance.now(),
        scene.terrain.visibleTileTransitionStartedAt,
        scene.terrain.visibleTileTransitionDurationMs,
      );
      this.lastVisibleTileRevision = scene.terrain.visibleTileRevision;
    }
    const worldOverlaysStartedAt = this.profiler.start();
    this.rebuildWorldOverlays(scene);
    this.rebuildInteractionOverlayLayer(scene);
    this.rebuildTargetingLayer(scene);
    this.rebuildSenseQiHoverLayer(scene);
    this.profiler.end('worldOverlays', worldOverlaysStartedAt);
    this.profiler.end('syncScene', startedAt);
  }

  enqueueEffect(effect: CombatEffect): void {
    if (effect.type === 'attack') {
      this.triggerAttackMotion(effect.fromX, effect.fromY, effect.toX, effect.toY);
    }
    this.combatEffectRuntime.enqueue(effect);
  }

  resetScene(): void {
    for (const chunk of this.terrainChunks.values()) this.destroyTerrainChunk(chunk);
    this.terrainChunks.clear();
    for (const view of this.entities.values()) this.destroyEntityView(view);
    this.entities.clear();
    this.pathCells = [];
    this.fadingPath = null;
    this.threatArrows = [];
    this.pathGraphics.clear();
    this.clearTerrainFogChunks();
    this.clearContainer(this.groundLayer);
    this.combatEffectRuntime.reset();
    this.threatArrowGraphics.clear();
    this.interactionOverlayGraphics.clear();
    this.targetingGraphics.clear();
    this.senseQiHoverGraphics.clear();
    this.timeOverlayGraphics.clear();
    this.formationRangeVisuals.clear();
    this.formationRangeSenseQiVisuals.clear();
    this.formationRangeSignature = '';
    this.terrainOverlaySignature = '';
    this.groundPileSignature = '';
    this.interactionOverlaySignature = '';
    this.targetingOverlaySignature = '';
    this.senseQiHoverSignature = '';
    this.pathLayerSignature = '';
    this.visibleTileFadeStartedAt.clear();
    this.hiddenTileFadeStartedAt.clear();
    this.previousVisibleTileKeys.clear();
    this.terrainFogSignature = '';
    this.terrainFogActiveSignature = '';
    this.terrainFogLastRebuildAt = 0;
    this.lastVisibleTileRevision = -1;
    this.timeAtmosphere.initialized = false;
    this.profiler.reset();
  }

  syncDisplayMetrics(): void {
    const cellSize = getCellSize();
    this.invalidateTerrainChunks();
    this.groundPileSignature = '';
    this.interactionOverlaySignature = '';
    this.targetingOverlaySignature = '';
    this.senseQiHoverSignature = '';
    this.pathLayerSignature = '';
    this.clearContainer(this.groundLayer);
    this.interactionOverlayGraphics.clear();
    this.targetingGraphics.clear();
    this.senseQiHoverGraphics.clear();
    this.pathGraphics.clear();
    for (const view of this.entities.values()) {
      const targetWX = view.anim.gridX * cellSize;
      const targetWY = view.anim.gridY * cellSize;
      view.anim.oldWX = targetWX;
      view.anim.oldWY = targetWY;
      view.anim.targetWX = targetWX;
      view.anim.targetWY = targetWY;
      view.root.position.set(targetWX, targetWY);
      view.staticSignature = '';
      this.patchEntityStatic(view);
    }
  }

  render(
    scene: MapSceneSnapshot,
    camera: CameraState,
    projection: TopdownProjection,
    progress: number,
    frameAtMs = performance.now(),
    schedule: PixiProfileFrameSchedule = {
      rafIntervalMs: 0,
      rafCallbacks: 1,
      skippedRafCallbacks: 0,
      targetFps: 0,
      targetIntervalMs: 0,
      rafCallbackPreRenderMs: 0,
      rafCallbackActiveMs: 0,
      scheduleLateMs: 0,
      rafTargetGapMs: 0,
      missedTargetFrames: 0,
    },
  ): void {
    void projection;
    const player = scene.player;
    if (!this.ready || !player) return;
    this.profiler.refresh();
    const profileActive = this.profiler.isActive();
    const renderMethodStartedAt = profileActive ? performance.now() : 0;
    const frameStartedAt = this.profiler.start();
    this.profiler.count('frames');
    const cameraStartedAt = this.profiler.start();
    this.updateCameraTransform(camera);
    this.profiler.end('camera', cameraStartedAt);
    const terrainStartedAt = this.profiler.start();
    this.updateTerrainChunks(scene, camera);
    this.profiler.end('terrainChunks', terrainStartedAt);
    const entityViewsStartedAt = this.profiler.start();
    this.updateEntityViews(camera, progress, player.id, player.x, player.y, player.char);
    this.profiler.end('entityViews', entityViewsStartedAt);
    const threatArrowsStartedAt = this.profiler.start();
    this.renderThreatArrows(player.id);
    this.profiler.end('threatArrows', threatArrowsStartedAt);
    const effectsStartedAt = this.profiler.start();
    this.combatEffectRuntime.update();
    this.profiler.end('effects', effectsStartedAt);
    const timeOverlayStartedAt = this.profiler.start();
    this.renderTimeOverlay(scene.terrain.time);
    this.profiler.end('timeOverlay', timeOverlayStartedAt);
    const appRenderStartedAt = this.profiler.start();
    this.app.render();
    this.profiler.end('appRender', appRenderStartedAt);
    this.profiler.end('renderFrame', frameStartedAt);
    if (profileActive) {
      const activeSchedule: PixiProfileFrameSchedule = {
        ...schedule,
        rafCallbackActiveMs: Math.max(
          schedule.rafCallbackPreRenderMs,
          schedule.rafCallbackPreRenderMs + Math.max(0, performance.now() - renderMethodStartedAt),
        ),
      };
      this.profiler.recordFrame(frameAtMs, activeSchedule);
      this.profiler.publish();
    }
  }

  getCanvas(): HTMLCanvasElement | null {
    return this.canvas;
  }

  clearContainer(container: Container): void {
    for (const child of container.removeChildren()) child.destroy({ children: true });
  }

  clearTerrainFogChunks(): void {
    clearTerrainFogChunksImpl(this);
  }

  updateCameraTransform(camera: CameraState): void {
    this.world.position.set(this.width / 2 - camera.x + camera.offsetX, this.height / 2 - camera.y + camera.offsetY);
  }

  invalidateTerrainChunks(): void {
    invalidateTerrainChunksImpl(this);
  }

  ensureRuntimeTileSpritesRequested(): void {
    ensureRuntimeTileSpritesRequestedImpl(this);
  }

  loadRuntimeTileSpriteManifest(generation: number): Promise<void> {
    return loadRuntimeTileSpriteManifestImpl(this, generation);
  }

  ensureRuntimeImageOverrideListener(): void {
    ensureRuntimeImageOverrideListenerImpl(this);
  }

  removeRuntimeImageOverrideListener(): void {
    removeRuntimeImageOverrideListenerImpl(this);
  }

  reloadRuntimeTileSpriteManifestForLocalOverrides(): void {
    reloadRuntimeTileSpriteManifestForLocalOverridesImpl(this);
  }

  /** 销毁依赖旧 atlas frame 的派生纹理，但保留仍被当前 manifest 使用的源纹理。 */
  destroyRuntimeDerivedTextures(): void {
    destroyRuntimeDerivedTexturesImpl(this);
  }

  /** 释放已被 manifest 替换的本地 data URL，默认图集继续交给 Pixi 全局 Assets 缓存复用。 */
  releaseRuntimeImageResources(nextSources: ReadonlySet<string>): void {
    releaseRuntimeImageResourcesImpl(this, nextSources);
  }

  getRuntimeAtlasTexture(src: string): Texture | null {
    return getRuntimeAtlasTextureImpl(this, src);
  }

  rememberRuntimeAtlasTexture(src: string, loaded: unknown): boolean {
    return rememberRuntimeAtlasTextureImpl(this, src, loaded);
  }

  invalidateEntityStaticViews(): void {
    invalidateEntityStaticViewsImpl(this);
  }

  resolveRuntimeTileSpriteRef(tile: Tile): PixiTileSpriteRef | null {
    return resolveRuntimeTileSpriteRefImpl(this, tile);
  }

  resolveRuntimeDualGridRef(tile: Tile | null | undefined): PixiTileSpriteRef | null {
    return resolveRuntimeDualGridRefImpl(this, tile);
  }

  getRuntimeTileTexture(ref: PixiTileSpriteRef, sourceMask = 15, quad?: { x: number; y: number; sourceW: number; sourceH: number }): Texture | null {
    return getRuntimeTileTextureImpl(this, ref, sourceMask, quad);
  }

  requestRuntimeTileTexture(ref: PixiTileSpriteRef): void {
    requestRuntimeTileTextureImpl(this, ref);
  }

  resolveRuntimeEntitySpriteSelection(entity: Pick<ObservedMapEntity, 'id' | 'kind' | 'name' | 'char' | 'facing' | 'monsterId'>): RuntimeEntitySpriteSelection | null {
    return resolveRuntimeEntitySpriteSelectionImpl(this, entity);
  }

  getRuntimeEntityTexture(ref: PixiTileSpriteRef): Texture | null {
    return getRuntimeEntityTextureImpl(this, ref);
  }

  requestRuntimeEntityTexture(ref: PixiTileSpriteRef): void {
    requestRuntimeEntityTextureImpl(this, ref);
  }

  drawRuntimeTileSprite(chunkContainer: Container, tile: Tile, sx: number, sy: number, cellSize: number): void {
    drawRuntimeTileSpriteImpl(this, chunkContainer, tile, sx, sy, cellSize);
  }

  drawDualGridSprite(
    chunkContainer: Container,
    ref: PixiTileSpriteRef,
    dx: number,
    dy: number,
    cellSize: number,
    sourceMask: number,
    clipMask: number,
  ): void {
    drawDualGridSpriteImpl(this, chunkContainer, ref, dx, dy, cellSize, sourceMask, clipMask);
  }

  collectDualGridVertexRef(
    refs: Array<PixiTileSpriteRef | null>,
    masks: number[],
    occupiedMask: number,
    ref: PixiTileSpriteRef | null | undefined,
    mask: number,
  ): number {
    return collectDualGridVertexRefImpl(this, refs, masks, occupiedMask, ref, mask);
  }

  drawRuntimeDualGridEdges(
    chunkContainer: Container,
    scene: MapSceneSnapshot,
    startX: number,
    startY: number,
    cellSize: number,
  ): void {
    drawRuntimeDualGridEdgesImpl(this, chunkContainer, scene, startX, startY, cellSize);
  }

  buildTerrainOverlaySignature(scene: MapSceneSnapshot): string {
    return buildTerrainOverlaySignatureImpl(this, scene);
  }

  setPathHighlight(cells: GridPoint[], fadeDurationMs: number): void {
    setPathHighlightImpl(this, cells, fadeDurationMs);
  }

  syncTileVisibilityTransitions(
    visibleTiles: ReadonlySet<string>,
    tileCache: ReadonlyMap<string, Tile>,
    now: number,
    transitionStartedAt: number,
    transitionDurationMs: number,
  ): void {
    syncTileVisibilityTransitionsImpl(this, visibleTiles, tileCache, now, transitionStartedAt, transitionDurationMs);
  }

  updateTerrainChunks(scene: MapSceneSnapshot, camera: CameraState): void {
    updateTerrainChunksImpl(this, scene, camera);
  }

  createTerrainChunk(key: string, cx: number, cy: number): TerrainChunkView {
    return createTerrainChunkImpl(this, key, cx, cy);
  }

  destroyTerrainChunk(chunk: TerrainChunkView): void {
    destroyTerrainChunkImpl(this, chunk);
  }

  rebuildTerrainFogLayer(
    scene: MapSceneSnapshot,
    startCX: number,
    startCY: number,
    endCX: number,
    endCY: number,
    cellSize: number,
  ): void {
    rebuildTerrainFogLayerImpl(this, scene, startCX, startCY, endCX, endCY, cellSize);
  }

  getOrCreateTerrainFogChunk(cx: number, cy: number): TerrainFogChunkView {
    return getOrCreateTerrainFogChunkImpl(this, cx, cy);
  }

  buildTerrainFogChunkSignature(
    scene: MapSceneSnapshot,
    cx: number,
    cy: number,
    cellSize: number,
    activeFogBucket: number,
  ): string {
    return buildTerrainFogChunkSignatureImpl(this, scene, cx, cy, cellSize, activeFogBucket);
  }

  rebuildTerrainFogChunk(
    chunk: TerrainFogChunkView,
    scene: MapSceneSnapshot,
    cellSize: number,
    now: number,
    signature: string,
  ): void {
    rebuildTerrainFogChunkImpl(this, chunk, scene, cellSize, now, signature);
  }

  pruneUnusedTerrainFogChunks(): void {
    pruneUnusedTerrainFogChunksImpl(this);
  }

  pruneCompletedTerrainFogTransitions(now: number): void {
    pruneCompletedTerrainFogTransitionsImpl(this, now);
  }

  resolveTerrainChunkStaticSignature(chunk: TerrainChunkView, scene: MapSceneSnapshot, cellSize: number): string {
    return resolveTerrainChunkStaticSignatureImpl(this, chunk, scene, cellSize);
  }

  resolveTerrainChunkOverlaySignature(chunk: TerrainChunkView, scene: MapSceneSnapshot, cellSize: number): string {
    return resolveTerrainChunkOverlaySignatureImpl(this, chunk, scene, cellSize);
  }

  isSameTerrainChunkStaticSignatureDeps(previous: TerrainChunkStaticSignatureDeps, next: TerrainChunkStaticSignatureDeps): boolean {
    return isSameTerrainChunkStaticSignatureDepsImpl(this, previous, next);
  }

  isSameTerrainChunkOverlaySignatureDeps(previous: TerrainChunkOverlaySignatureDeps, next: TerrainChunkOverlaySignatureDeps): boolean {
    return isSameTerrainChunkOverlaySignatureDepsImpl(this, previous, next);
  }

  buildTerrainChunkStaticSignature(scene: MapSceneSnapshot, cx: number, cy: number, cellSize: number): string {
    return buildTerrainChunkStaticSignatureImpl(this, scene, cx, cy, cellSize);
  }

  buildTerrainChunkOverlaySignature(scene: MapSceneSnapshot, cx: number, cy: number, cellSize: number): string {
    return buildTerrainChunkOverlaySignatureImpl(this, scene, cx, cy, cellSize);
  }

  rebuildTerrainChunkStaticLayers(chunk: TerrainChunkView, scene: MapSceneSnapshot, cellSize: number, signature: string): void {
    rebuildTerrainChunkStaticLayersImpl(this, chunk, scene, cellSize, signature);
  }

  rebuildTerrainChunkOverlayLayer(chunk: TerrainChunkView, scene: MapSceneSnapshot, cellSize: number, signature: string): void {
    rebuildTerrainChunkOverlayLayerImpl(this, chunk, scene, cellSize, signature);
  }

  enableTerrainChunkCache(container: Container): void {
    enableTerrainChunkCacheImpl(this, container);
  }

  disableTerrainChunkCache(container: Container): void {
    disableTerrainChunkCacheImpl(this, container);
  }

  drawTerrainOverlays(
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
    drawTerrainOverlaysImpl(this, graphics, chunkContainer, scene, tile, key, gx, gy, sx, sy, cellSize, senseQiLevelBaseValue);
  }

  drawTileHpBar(graphics: Graphics, tile: Tile, sx: number, sy: number, cellSize: number): void {
    drawTileHpBarImpl(this, graphics, tile, sx, sy, cellSize);
  }

  resolveTileFade(state: { startedAt: number; durationMs: number } | undefined, now: number, entering: boolean): number {
    return resolveTileFadeImpl(this, state, now, entering);
  }

  drawCellHighlight(graphics: Graphics, sx: number, sy: number, cellSize: number, fill: string, stroke: string, core: boolean, alphaMultiplier = 1): void {
    drawCellHighlightImpl(this, graphics, sx, sy, cellSize, fill, stroke, core, alphaMultiplier);
  }

  drawFormationRangeVisual(graphics: Graphics, chunkContainer: Container, sx: number, sy: number, cellSize: number, visual: FormationRangeVisual): void {
    drawFormationRangeVisualImpl(this, graphics, chunkContainer, sx, sy, cellSize, visual);
  }

  resolveFormationRangeVisual(gx: number, gy: number, senseQiVisible: boolean): FormationRangeVisual | null {
    return resolveFormationRangeVisualImpl(this, gx, gy, senseQiVisible);
  }

  rebuildWorldOverlays(scene: MapSceneSnapshot): void {
    rebuildWorldOverlaysImpl(this, scene);
  }

  rebuildInteractionOverlayLayer(scene: MapSceneSnapshot): void {
    rebuildInteractionOverlayLayerImpl(this, scene);
  }

  rebuildTargetingLayer(scene: MapSceneSnapshot): void {
    rebuildTargetingLayerImpl(this, scene);
  }

  rebuildSenseQiHoverLayer(scene: MapSceneSnapshot): void {
    rebuildSenseQiHoverLayerImpl(this, scene);
  }

  drawGroundPile(root: Container, pile: GroundItemPileView, cellSize: number): void {
    drawGroundPileImpl(this, root, pile, cellSize);
  }

  rebuildPathLayer(scene: MapSceneSnapshot): void {
    rebuildPathLayerImpl(this, scene);
  }

  drawPathCells(graphics: Graphics, cells: GridPoint[], alpha: number): void {
    drawPathCellsImpl(this, graphics, cells, alpha);
  }

  drawPathArrows(graphics: Graphics, playerX: number, playerY: number, cells: GridPoint[], alpha: number): void {
    drawPathArrowsImpl(this, graphics, playerX, playerY, cells, alpha);
  }

  syncEntities(list: readonly ObservedMapEntity[], transition: MapEntityTransition | null, motionSyncToken?: number): void {
    syncEntitiesImpl(this, list, transition, motionSyncToken);
  }

  createEntityView(entity: ObservedMapEntity, targetWX: number, targetWY: number): EntityView {
    return createEntityViewImpl(this, entity, targetWX, targetWY);
  }

  destroyEntityView(view: EntityView): void {
    destroyEntityViewImpl(this, view);
  }

  patchEntityStatic(view: EntityView): void {
    patchEntityStaticImpl(this, view);
  }

  isEntityTextMode(kind: AnimEntity['kind']): boolean {
    return isEntityTextModeImpl(this, kind);
  }

  patchRuntimeEntitySprite(view: EntityView, visualCellSize: number): boolean {
    return patchRuntimeEntitySpriteImpl(this, view, visualCellSize);
  }

  resolveCurrentImageFlipSign(view: EntityView, now: number): number {
    return resolveCurrentImageFlipSignImpl(this, view, now);
  }

  applyEntityImageScale(view: EntityView, now: number): void {
    applyEntityImageScaleImpl(this, view, now);
  }

  patchEntityNameplate(
    view: EntityView,
    label: string,
    badges: readonly EntityNameplateBadge[],
    shouldShowLabel: boolean,
    labelY: number,
    cellSize: number,
  ): void {
    patchEntityNameplateImpl(this, view, label, badges, shouldShowLabel, labelY, cellSize);
  }

  drawEntityBars(view: EntityView, visualCellSize: number): void {
    drawEntityBarsImpl(this, view, visualCellSize);
  }

  drawFormationMarker(graphics: Graphics, anim: AnimEntity, cellSize: number): void {
    drawFormationMarkerImpl(this, graphics, anim, cellSize);
  }

  syncArtifactAura(view: EntityView, cellSize: number): void {
    syncArtifactAuraImpl(this, view, cellSize);
  }

  createArtifactAuraFrame(cellSize: number, frameIndex: number): Graphics {
    return createArtifactAuraFrameImpl(this, cellSize, frameIndex);
  }

  updateArtifactAuraFrame(view: EntityView, timeMs: number): void {
    updateArtifactAuraFrameImpl(this, view, timeMs);
  }

  drawRespawnLabel(view: EntityView, cellSize: number, visualCellSize: number): void {
    drawRespawnLabelImpl(this, view, cellSize, visualCellSize);
  }

  formatRespawnCountdown(ticks: number | undefined): string {
    return formatRespawnCountdownImpl(this, ticks);
  }

  drawBuffs(view: EntityView, cellSize: number): void {
    drawBuffsImpl(this, view, cellSize);
  }

  drawNpcQuestMarker(container: Container, marker: NpcQuestMarker | undefined, cellSize: number): void {
    drawNpcQuestMarkerImpl(this, container, marker, cellSize);
  }

  updateEntityViews(camera: CameraState, progress: number, localPlayerId: string, localPlayerX: number, localPlayerY: number, localPlayerChar: string): void {
    updateEntityViewsImpl(this, camera, progress, localPlayerId, localPlayerX, localPlayerY, localPlayerChar);
  }

  patchEntityMotion(view: EntityView, motionProgress: number, now: number): void {
    patchEntityMotionImpl(this, view, motionProgress, now);
  }

  ensureLocalPlayerFallback(localPlayerId: string, localPlayerX: number, localPlayerY: number, localPlayerChar: string, exists: boolean): void {
    ensureLocalPlayerFallbackImpl(this, localPlayerId, localPlayerX, localPlayerY, localPlayerChar, exists);
  }

  rebuildFormationRangeVisualCacheIfNeeded(): void {
    rebuildFormationRangeVisualCacheIfNeededImpl(this);
  }

  renderThreatArrows(localPlayerId: string): void {
    renderThreatArrowsImpl(this, localPlayerId);
  }

  drawDashedQuadraticCurve(
    graphics: Graphics,
    startX: number,
    startY: number,
    controlX: number,
    controlY: number,
    endX: number,
    endY: number,
    dashLength: number,
    gapLength: number,
    color: number,
    alpha: number,
    width: number,
  ): void {
    drawDashedQuadraticCurveImpl(this, graphics, startX, startY, controlX, controlY, endX, endY, dashLength, gapLength, color, alpha, width);
  }

  drawThreatArrowHead(
    graphics: Graphics,
    startX: number,
    startY: number,
    controlX: number,
    controlY: number,
    endX: number,
    endY: number,
    cellSize: number,
    color: number,
    alpha: number,
  ): void {
    drawThreatArrowHeadImpl(this, graphics, startX, startY, controlX, controlY, endX, endY, cellSize, color, alpha);
  }

  getQuadraticPoint(start: number, control: number, end: number, t: number): number {
    return getQuadraticPointImpl(this, start, control, end, t);
  }

  resolveThreatEntityView(id: string): EntityView | undefined {
    return resolveThreatEntityViewImpl(this, id);
  }

  triggerAttackMotion(fromX: number, fromY: number, toX: number, toY: number): void {
    triggerAttackMotionImpl(this, fromX, fromY, toX, toY);
  }

  resolveAttackMotionView(fromX: number, fromY: number): EntityView | null {
    return resolveAttackMotionViewImpl(this, fromX, fromY);
  }

  getFadingPathAlpha(now: number): number {
    return getFadingPathAlphaImpl(this, now);
  }

  renderTimeOverlay(time: GameTimeState | null): void {
    renderTimeOverlayImpl(this, time);
  }

  resolveTimeAtmosphere(time: GameTimeState): TimeAtmosphereState {
    return resolveTimeAtmosphereImpl(this, time);
  }

  buildRgbaVector(hex: string, alpha: number): [number, number, number, number] {
    return buildRgbaVectorImpl(this, hex, alpha);
  }

  lerpColorVector(current: [number, number, number, number], target: [number, number, number, number], factor: number): [number, number, number, number] {
    return lerpColorVectorImpl(this, current, target, factor);
  }

  buildProfileRendererState(): PixiProfileRendererState {
    let cachedTerrainChunks = 0;
    let terrainCachedContainers = 0;
    let terrainChunkChildren = 0;
    for (const chunk of this.terrainChunks.values()) {
      let chunkCached = false;
      const containers = [
        chunk.baseContainer,
        chunk.spriteContainer,
        chunk.edgeContainer,
        chunk.glyphContainer,
        chunk.overlayContainer,
      ];
      for (const container of containers) {
        terrainChunkChildren += container.children.length;
        if (container.isCachedAsTexture) {
          terrainCachedContainers += 1;
          chunkCached = true;
        }
      }
      if (chunkCached) cachedTerrainChunks += 1;
    }
    return {
      terrainChunks: this.terrainChunks.size,
      cachedTerrainChunks,
      terrainCachedContainers,
      terrainChunkChildren,
      entities: this.entities.size,
      groundChildren: this.groundLayer.children.length,
      entityChildren: this.entityLayer.children.length,
      effectChildren: this.effectLayer.children.length,
      screenChildren: this.screenLayer.children.length,
      pathChildren: this.pathLayer.children.length,
      floatingTexts: this.combatEffectRuntime.floatingTextCount,
      attackTrails: this.combatEffectRuntime.attackTrailCount,
      warningZones: this.combatEffectRuntime.warningZoneCount,
      runtimeTileTextures: this.runtimeTileTextures.size,
      runtimeAtlasTextures: this.runtimeAtlasTextures.size,
      runtimeEntityTextures: this.runtimeEntityTextures.size,
      runtimeTileTextureRequests: this.runtimeTileTextureRequests.size,
      runtimeEntityTextureRequests: this.runtimeEntityTextureRequests.size,
      runtimeTileManifestState: this.runtimeTileManifestState,
      backbufferWidth: this.width,
      backbufferHeight: this.height,
      backbufferPixels: this.width * this.height,
    };
  }

}

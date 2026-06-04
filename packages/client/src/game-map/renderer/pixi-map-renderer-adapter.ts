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
  type TextStyleFontWeight,
  type TextStyleOptions,
  type WebGLRenderer,
} from 'pixi.js';
import {
  DEFAULT_AURA_LEVEL_BASE_VALUE,
  getAuraLevel,
  isMobileEntityObjectKind,
  isOffsetInRange,
  parseQiResourceKey,
  SENSE_QI_OVERLAY_STYLE,
  TILE_VISUAL_BG_COLORS,
  TILE_VISUAL_GLYPH_COLORS,
  TILE_VISUAL_GLYPHS,
  normalizeAuraLevelBaseValue,
  resolveWorldObjectRenderOrder,
  type CombatEffect,
  type FengShuiGrade,
  type GameTimeState,
  type GridPoint,
  type GroundItemEntryView,
  type GroundItemPileView,
  type NpcQuestMarker,
  type Tile,
} from '@mud/shared';
import { getCellSize } from '../../display';
import { isLocalDivineSkillName } from '../../content/local-templates';
import { UI_TEXT_SETTINGS } from '../../constants/ui/text';
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
import { formatDisplayInteger } from '../../utils/number';
import { t as translateUi } from '../../ui/i18n';
import type { CameraState } from '../camera/camera-controller';
import type { TopdownProjection } from '../projection/topdown-projection';
import type { MapEntityTransition, MapSceneSnapshot, ObservedMapEntity } from '../types';
import {
  createPixiProfileCounters,
  createPixiProfileFrameCounters,
  createPixiProfileFrameMetrics,
  createPixiProfileMetrics,
  PIXI_PROFILE_COUNTER_KEYS,
  PIXI_PROFILE_LOG_INTERVAL_MS,
  PIXI_PROFILE_METRIC_KEYS,
  PixiProfilerWindow,
  type PixiProfileCounterKey,
  type PixiProfileFrameSample,
  type PixiProfileMetricKey,
  type PixiProfileSnapshot,
  type PixiProfileState,
} from './pixi-profiler-window';

type PixiRenderer = Renderer<HTMLCanvasElement>;
type FloatingActionTextStyle = 'default' | 'divine' | 'chant';

interface TerrainChunkView {
  key: string;
  cx: number;
  cy: number;
  container: Container;
  signature: string;
  signatureDeps: TerrainChunkSignatureDeps | null;
  lastSeenFrame: number;
}

interface TerrainChunkSignatureDeps {
  cellSize: number;
  terrainOverlaySignature: string;
  renderRuntimeTileSprites: boolean;
  runtimeTileSpriteRevision: number;
  visibleTileRevision: number;
}

interface AnimEntity extends ObservedMapEntity {
  gridX: number;
  gridY: number;
  oldWX: number;
  oldWY: number;
  targetWX: number;
  targetWY: number;
}

interface EntityView {
  anim: AnimEntity;
  root: Container;
  visualRoot: Container;
  shadow: Graphics;
  glyph: Text;
  label: Text;
  badge: Text;
  hpBar: Graphics;
  progressBar: Graphics;
  buffLayer: Container;
  questMarker: Container;
  formationMarker: Graphics;
  respawnLabel: Text;
  staticSignature: string;
  hiddenByFormation: boolean;
}

interface FloatingTextEffect {
  id: number;
  x: number;
  y: number;
  text: Text;
  variant: 'damage' | 'action';
  actionStyle?: FloatingActionTextStyle;
  createdAt: number;
  duration: number;
}

interface AttackTrailEffect {
  id: number;
  graphics: Graphics;
  createdAt: number;
  duration: number;
}

interface WarningZoneEffect {
  id: number;
  cells: Array<{ x: number; y: number; expandDistance: number }>;
  color: string;
  baseColor: string;
  createdAt: number;
  duration: number;
  maxExpandDistance: number;
  graphics: Graphics;
}

interface FadingPathState {
  cells: GridPoint[];
  startedAt: number;
  durationMs: number;
}

interface TimeAtmosphereState {
  initialized: boolean;
  overlay: [number, number, number, number];
  sky: [number, number, number, number];
  horizon: [number, number, number, number];
  vignetteAlpha: number;
}

interface FormationRangeVisual {
  highlightColor: string;
  boundary: boolean;
  boundaryChar?: string;
  boundaryColor: string;
}

interface PixiTileSpriteRef {
  key: string;
  src: string;
  cols: number;
  rows: number;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  zIndex: number;
  order: number;
  dualGrid: boolean;
}

type RuntimeTileSpriteManifest = {
  tiles?: Record<string, unknown>;
  legacyTiles?: Record<string, unknown>;
};

declare global {
  interface Window {
    __mudPixiProfile?: PixiProfileSnapshot;
    __mudPixiProfileReset?: () => void;
  }
}

const CHUNK_SIZE = 16;
const MAX_FLOATING_TEXTS = 256;
const MAX_ATTACK_TRAILS = 192;
const MAX_WARNING_ZONES = 64;
const DEFAULT_WARNING_ZONE_DURATION_MS = 1240;
const DEFAULT_PATH_TRAIL_FADE_MS = 500;
const PATH_TRAIL_FADE_ALPHA = 0.7;
const DEFAULT_RUNTIME_IMAGE_PACK_MANIFEST_URL = '/assets/runtime-image-packs/default/manifest.json';
const TERRAIN_CHUNK_CACHE_OPTIONS = {
  resolution: 1,
  scaleMode: 'nearest',
} as const;
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
const DUAL_GRID_QUARTER_SOURCE_OVERLAP_PX = 1;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - clamp01(t), 3);
}

function parseColor(input: string | undefined, fallback = 0xffffff): number {
  if (!input) return fallback;
  const value = input.trim();
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    const expanded = hex.length === 3 ? hex.split('').map((entry) => entry + entry).join('') : hex;
    const parsed = Number.parseInt(expanded.slice(0, 6), 16);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  const match = value.match(/rgba?\(([^)]+)\)/i);
  if (match) {
    const [r, g, b] = match[1].split(',').map((entry) => Number.parseFloat(entry.trim()));
    if ([r, g, b].every((entry) => Number.isFinite(entry))) {
      return ((Math.round(r) & 255) << 16) | ((Math.round(g) & 255) << 8) | (Math.round(b) & 255);
    }
  }
  return fallback;
}

function parseAlpha(input: string | undefined, fallback = 1): number {
  if (!input) return fallback;
  const match = input.match(/rgba?\(([^)]+)\)/i);
  if (!match) return fallback;
  const parts = match[1].split(',').map((entry) => entry.trim());
  return parts.length >= 4 ? clamp01(Number.parseFloat(parts[3])) : fallback;
}

function colorWithAlpha(color: string | undefined, alpha: number): { color: number; alpha: number } {
  return { color: parseColor(color, 0x3b82f6), alpha: clamp01(alpha) };
}

function buildGridPointSignature(cells: readonly GridPoint[] | null | undefined): string {
  if (!cells || cells.length === 0) return '0';
  let signature = String(cells.length);
  for (const cell of cells) signature += `|${cell.x},${cell.y}`;
  return signature;
}

function resolveEntityFallbackLabel(kind: string | null | undefined): string {
  switch (kind) {
    case 'crowd': return translateUi('map-render.entity.crowd', undefined);
    case 'monster': return translateUi('map-render.entity.monster', undefined);
    case 'player': return translateUi('map-render.entity.player', undefined);
    case 'container': return translateUi('map-render.entity.container', undefined);
    case 'building': return translateUi('map-render.entity.building', undefined);
    case 'formation': return translateUi('map-render.entity.formation', undefined);
    case 'portal': return translateUi('map-render.entity.portal', undefined);
    case 'mechanism': return translateUi('map-render.entity.mechanism', undefined);
    case 'npc':
    default:
      return translateUi('map-render.entity.npc', undefined);
  }
}

function resolveEntityLabelColor(kind: string | null | undefined): string {
  switch (kind) {
    case 'crowd': return '#f4dfaf';
    case 'monster': return '#ffddcc';
    case 'player': return '#d8f3c3';
    case 'container': return '#ffe3b8';
    case 'building': return '#d7e6f5';
    case 'formation': return '#9cc8ff';
    case 'portal': return '#a7f3d0';
    case 'mechanism': return '#f9a8d4';
    default: return '#cce7ff';
  }
}

function resolveEntityHpBarColor(kind: string | null | undefined, hostile: boolean | undefined): string {
  if (hostile === true || kind === 'monster') return '#d15252';
  switch (kind) {
    case 'npc': return '#58a8ff';
    case 'container': return '#c18b46';
    case 'building': return '#7dd3fc';
    case 'formation': return '#9cc8ff';
    default: return '#63c46b';
  }
}

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
  const source = isRecord(value) && isRecord(value.meta) ? value.meta : value;
  const raw = isRecord(source) ? source.zIndex : undefined;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return numeric;
  if (key.startsWith('terrain:')) return 100;
  if (key.startsWith('surface:')) return 200;
  if (key.startsWith('structure:')) return 300;
  if (key.startsWith('interactable:')) return 400;
  return 500;
}

function normalizeTileSpriteDualGrid(value: unknown): boolean {
  const source = isRecord(value) && isRecord(value.meta) ? value.meta : value;
  const rawDualGrid = isRecord(source) ? source.dualGrid : undefined;
  return rawDualGrid === true || (isRecord(rawDualGrid) && rawDualGrid.enabled !== false);
}

function resolveRuntimeImagePackAssetUrl(manifestUrl: string, src: string): string {
  if (src.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(src)) return src;
  try {
    return new URL(src, new URL(manifestUrl, window.location.href)).toString();
  } catch {
    const base = manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1);
    return `${base}${src}`;
  }
}

function normalizePixiTileSpriteRef(value: unknown, manifestUrl: string, key: string, order: number): PixiTileSpriteRef | null {
  if (!isRecord(value) || typeof value.src !== 'string' || value.src.trim().length === 0) return null;
  return {
    key,
    src: resolveRuntimeImagePackAssetUrl(manifestUrl, value.src.trim()),
    cols: normalizePositiveInteger(value.cols, 1),
    rows: normalizePositiveInteger(value.rows, 1),
    col: normalizeNonNegativeInteger(value.col, 0),
    row: normalizeNonNegativeInteger(value.row, 0),
    colSpan: normalizePositiveInteger(value.colSpan, 1),
    rowSpan: normalizePositiveInteger(value.rowSpan, 1),
    zIndex: normalizeTileSpriteZIndex(value, key),
    order,
    dualGrid: normalizeTileSpriteDualGrid(value),
  };
}

function resolveTopTileSpriteKey(tile: Tile, legacyTileKeys: ReadonlyMap<string, string>): string | null {
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

function normalizePixiTileSpriteMap(value: unknown, manifestUrl: string): Map<string, PixiTileSpriteRef> {
  const result = new Map<string, PixiTileSpriteRef>();
  if (!isRecord(value)) return result;
  let order = 0;
  for (const [key, rawRef] of Object.entries(value)) {
    const normalizedKey = key.trim();
    const ref = normalizePixiTileSpriteRef(rawRef, manifestUrl, normalizedKey, order);
    order += 1;
    if (normalizedKey && ref) result.set(normalizedKey, ref);
  }
  return result;
}

function normalizeLegacyTileMap(value: unknown): Map<string, string> {
  const result = new Map<string, string>();
  if (!isRecord(value)) return result;
  for (const [key, rawValue] of Object.entries(value)) {
    const normalizedKey = key.trim();
    const mappedKey = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (normalizedKey && mappedKey) result.set(normalizedKey, mappedKey);
  }
  return result;
}

function resolveGroundItemLabel(entry: GroundItemEntryView): string {
  const explicit = [...(entry.groundLabel?.trim() ?? '')].filter((char) => char.trim().length > 0).join('');
  if (explicit) return explicit.slice(0, 2);
  const chars = [...entry.name.trim()].filter((char) => char.trim().length > 0);
  const hanChar = chars.find((char) => /[\u3400-\u9fff\uf900-\ufaff]/u.test(char));
  if (hanChar) return hanChar;
  const wordChar = chars.find((char) => /[A-Za-z0-9]/.test(char));
  return wordChar ? wordChar.toUpperCase() : chars[0]?.slice(0, 1) ?? '?';
}

function textStyle(preset: keyof typeof UI_TEXT_SETTINGS.canvasPresets, fontSize: number, fill: string, stroke = 'rgba(15,12,10,0.9)', strokeWidth = 3): TextStyleOptions {
  const config = UI_TEXT_SETTINGS.canvasPresets[preset];
  const family = UI_TEXT_SETTINGS.families[config.family];
  return {
    fontFamily: family,
    fontWeight: String(config.weight) as TextStyleFontWeight,
    fontSize: Math.max(1, Number(fontSize.toFixed(2))),
    fill,
    stroke: { color: stroke, width: strokeWidth },
    padding: Math.max(2, Math.ceil(strokeWidth + 2)),
  };
}

function isTileInsideFormationRange(anim: AnimEntity, gx: number, gy: number): boolean {
  const radius = Math.max(1, Math.trunc(Number(anim.formationRadius) || 0));
  const dx = gx - anim.gridX;
  const dy = gy - anim.gridY;
  if (Math.abs(dx) > radius || Math.abs(dy) > radius) return false;
  if (anim.formationRangeShape === 'circle') return (dx * dx) + (dy * dy) <= radius * radius;
  if (anim.formationRangeShape === 'checkerboard') return ((gx + gy) % 2) === 0;
  return true;
}

function isTileOnFormationBoundary(anim: AnimEntity, gx: number, gy: number): boolean {
  if (!isTileInsideFormationRange(anim, gx, gy)) return false;
  const radius = Math.max(1, Math.trunc(Number(anim.formationRadius) || 0));
  const dx = gx - anim.gridX;
  const dy = gy - anim.gridY;
  if (anim.formationRangeShape === 'circle') {
    return (dx * dx) + (dy * dy) <= radius * radius
      && (
        ((dx + 1) * (dx + 1)) + (dy * dy) > radius * radius
        || ((dx - 1) * (dx - 1)) + (dy * dy) > radius * radius
        || (dx * dx) + ((dy + 1) * (dy + 1)) > radius * radius
        || (dx * dx) + ((dy - 1) * (dy - 1)) > radius * radius
      );
  }
  return Math.abs(dx) === radius || Math.abs(dy) === radius;
}

function buildFormationRangeSignature(entities: Iterable<AnimEntity>): string {
  let count = 0;
  let signature = '';
  for (const anim of entities) {
    if (anim.kind !== 'formation' || !Number.isFinite(Number(anim.formationRadius)) || anim.formationActive === false) continue;
    count += 1;
    signature += [
      '',
      anim.id,
      anim.gridX,
      anim.gridY,
      anim.formationRadius ?? '',
      anim.formationRangeShape ?? '',
      anim.formationRangeHighlightColor ?? '',
      anim.formationBoundaryChar ?? '',
      anim.formationBoundaryColor ?? '',
      anim.formationBoundaryRangeHighlightColor ?? '',
      anim.formationRangeVisibleWithoutSenseQi === true ? 1 : 0,
      anim.formationBoundaryVisibleWithoutSenseQi === true ? 1 : 0,
      anim.formationBlocksBoundary === true ? 1 : 0,
    ].join('|');
  }
  return `${count}${signature}`;
}

function buildFengShuiOverlaySignature(cells: readonly { x: number; y: number; score: number; grade: FengShuiGrade; revision: number }[] | undefined): string {
  if (!cells || cells.length === 0) return '0';
  let signature = String(cells.length);
  for (const cell of cells) signature += `|${cell.x},${cell.y},${Math.trunc(cell.score)},${cell.grade},${cell.revision}`;
  return signature;
}

function buildBuildPreviewSignature(cells: readonly { x: number; y: number; ok: boolean; warning?: boolean }[] | undefined): string {
  if (!cells || cells.length === 0) return '0';
  let signature = String(cells.length);
  for (const cell of cells) signature += `|${cell.x},${cell.y},${cell.ok ? 1 : 0},${cell.warning === true ? 1 : 0}`;
  return signature;
}

function buildGroundPileSignature(piles: ReadonlyMap<string, GroundItemPileView>): string {
  let signature = String(piles.size);
  for (const pile of piles.values()) {
    signature += `|${pile.sourceId}:${pile.x},${pile.y}:${pile.items.length}`;
    for (const item of pile.items.slice(0, 9)) {
      signature += `,${item.itemKey}:${item.count}:${item.groundLabel ?? ''}:${item.grade ?? ''}`;
    }
  }
  return signature;
}

function buildTargetingSignature(scene: MapSceneSnapshot): string {
  const targeting = scene.overlays.targeting;
  if (!targeting) return 'null';
  return [
    targeting.originX,
    targeting.originY,
    targeting.range,
    targeting.visibleOnly === true ? 1 : 0,
    targeting.shape ?? '',
    targeting.radius ?? '',
    targeting.hoverX ?? '',
    targeting.hoverY ?? '',
    buildGridPointSignature(targeting.affectedCells),
  ].join('|');
}

function getFengShuiOverlayFill(cell: { score: number }): { color: number; alpha: number } {
  const score = Math.max(-1000, Math.min(1000, Math.trunc(Number(cell.score) || 0)));
  const strength = Math.min(1, Math.abs(score) / 1000);
  if (score === 0) return { color: 0x94a3b8, alpha: 0.08 };
  const alpha = 0.10 + strength * 0.32;
  if (score > 0) {
    const red = Math.round(80 - strength * 46);
    const green = Math.round(150 + strength * 74);
    const blue = Math.round(96 - strength * 40);
    return { color: (red << 16) | (green << 8) | blue, alpha };
  }
  const red = Math.round(180 + strength * 58);
  const green = Math.round(92 - strength * 50);
  const blue = Math.round(72 - strength * 34);
  return { color: (red << 16) | (green << 8) | blue, alpha };
}

function getFengShuiOverlayStroke(cell: { score: number }): { color: number; alpha: number } {
  const score = Math.max(-1000, Math.min(1000, Math.trunc(Number(cell.score) || 0)));
  const strength = Math.min(1, Math.abs(score) / 1000);
  if (score === 0) return { color: 0xcbd5e1, alpha: 0.34 };
  return score > 0
    ? { color: 0x4ade80, alpha: 0.42 + strength * 0.50 }
    : { color: 0xf87171, alpha: 0.42 + strength * 0.50 };
}

function getSenseQiOverlayStyle(tile: Tile | null | undefined, levelBaseValue = DEFAULT_AURA_LEVEL_BASE_VALUE): { color: number; alpha: number } {
  let family: 'aura' | 'sha' | 'demonic' = 'aura';
  let value = Math.max(0, tile?.aura ?? 0);
  for (const resource of tile?.resources ?? []) {
    const resourceValue = resource.effectiveValue ?? resource.value;
    const candidate = typeof resource.level === 'number' && Number.isFinite(resource.level)
      ? resource.level
      : getAuraLevel(resourceValue, levelBaseValue);
    if (candidate <= value) continue;
    const parsed = parseQiResourceKey(resource.key);
    if (!parsed) continue;
    family = parsed.family;
    value = candidate;
  }
  const normalized = Math.max(0, Math.min(value, SENSE_QI_OVERLAY_STYLE.maxAuraLevel)) / SENSE_QI_OVERLAY_STYLE.maxAuraLevel;
  const palette = family === 'sha'
    ? { baseRed: 30, redRange: 164, baseGreen: 10, greenRange: 54, baseBlue: 8, blueRange: 32 }
    : family === 'demonic'
      ? { baseRed: 10, redRange: 56, baseGreen: 24, greenRange: 150, baseBlue: 12, blueRange: 48 }
      : SENSE_QI_OVERLAY_STYLE;
  const red = Math.round(palette.baseRed + normalized * palette.redRange);
  const green = Math.round(palette.baseGreen + normalized * palette.greenRange);
  const blue = Math.round(palette.baseBlue + normalized * palette.blueRange);
  const alpha = SENSE_QI_OVERLAY_STYLE.baseAlpha - normalized * SENSE_QI_OVERLAY_STYLE.alphaRange;
  return { color: (red << 16) | (green << 8) | blue, alpha: clamp01(alpha) };
}

/** Pixi/WebGL2 主世界渲染适配器。 */
export class PixiMapRendererAdapter {
  private readonly app = new Application<PixiRenderer>();
  private readonly world = new Container();
  private readonly terrainLayer = new Container();
  private readonly pathLayer = new Container();
  private readonly groundLayer = new Container();
  private readonly entityLayer = new Container();
  private readonly effectLayer = new Container();
  private readonly screenLayer = new Container();
  private readonly pathGraphics = new Graphics();
  private readonly threatArrowGraphics = new Graphics();
  private readonly timeOverlayGraphics = new Graphics();
  private readonly terrainChunks = new Map<string, TerrainChunkView>();
  private readonly entities = new Map<string, EntityView>();
  private readonly formationRangeVisuals = new Map<string, FormationRangeVisual>();
  private readonly formationRangeSenseQiVisuals = new Map<string, FormationRangeVisual>();
  private readonly localPlayerFallbackId = '__local-player-fallback__';
  private readonly visibleTileFadeStartedAt = new Map<string, { startedAt: number; durationMs: number }>();
  private readonly hiddenTileFadeStartedAt = new Map<string, { startedAt: number; durationMs: number }>();
  private previousVisibleTileKeys = new Set<string>();
  private canvas: HTMLCanvasElement | null = null;
  private ready = false;
  private width = 1;
  private height = 1;
  private chunkFrame = 0;
  private lastVisibleTileRevision = -1;
  private lastEntityMotionToken?: number;
  private formationRangeSignature = '';
  private terrainOverlaySignature = '';
  private pathCells: GridPoint[] = [];
  private fadingPath: FadingPathState | null = null;
  private threatArrows: Array<{ ownerId: string; targetId: string }> = [];
  private floatingTexts: FloatingTextEffect[] = [];
  private attackTrails: AttackTrailEffect[] = [];
  private warningZones: WarningZoneEffect[] = [];
  private nextEffectId = 1;
  private performanceConfig: MapPerformanceConfig = { ...DEFAULT_MAP_PERFORMANCE_CONFIG };
  private runtimeTileSpriteRefs = new Map<string, PixiTileSpriteRef>();
  private runtimeLegacyTileKeys = new Map<string, string>();
  private runtimeTileTextures = new Map<string, Texture>();
  private runtimeTileTextureRequests = new Set<string>();
  private runtimeTileManifestState: 'idle' | 'loading' | 'loaded' | 'error' = 'idle';
  private runtimeTileSpriteRevision = 0;
  private profileEnabled = false;
  private profileState: PixiProfileState | null = null;
  private profileWindow: PixiProfilerWindow | null = null;
  private timeAtmosphere: TimeAtmosphereState = {
    initialized: false,
    overlay: [0, 0, 0, 0],
    sky: [0, 0, 0, 0],
    horizon: [0, 0, 0, 0],
    vignetteAlpha: 0,
  };

  mount(host: HTMLElement): void {
    const canvas = host.querySelector<HTMLCanvasElement>('#game-canvas') ?? host.querySelector<HTMLCanvasElement>('canvas');
    if (!canvas) throw new Error('地图宿主节点缺少 canvas');
    this.canvas = canvas;
    this.refreshProfileState();
    this.pathLayer.addChild(this.pathGraphics);
    this.threatArrowGraphics.name = 'threat-arrows';
    this.effectLayer.addChild(this.threatArrowGraphics);
    this.screenLayer.addChild(this.timeOverlayGraphics);
    this.terrainLayer.sortableChildren = true;
    this.app.stage.addChild(this.world, this.screenLayer);
    this.world.addChild(
      this.terrainLayer,
      this.pathLayer,
      this.groundLayer,
      this.entityLayer,
      this.effectLayer,
    );
    this.entityLayer.sortableChildren = true;
    const initPromise = this.app.init({
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
      if (this.app.renderer.type !== RendererType.WEBGL) {
        throw new Error('主世界 Pixi 渲染器必须使用 WebGL 后端');
      }
      const gl = (this.app.renderer as WebGLRenderer<HTMLCanvasElement>).gl;
      if (!(gl instanceof WebGL2RenderingContext)) throw new Error('主世界 Pixi 渲染器必须使用 WebGL2 上下文');
      this.ready = true;
      this.ensureRuntimeTileSpritesRequested();
    });
    initPromise.catch((error) => {
      console.error('[map] Pixi/WebGL2 renderer init failed', error);
    });
  }

  unmount(): void {
    this.canvas = null;
  }

  destroy(): void {
    this.resetScene();
    this.profileWindow?.destroy();
    this.profileWindow = null;
    this.app.destroy(false, { children: true, texture: true, textureSource: true, context: true });
    this.ready = false;
    this.canvas = null;
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
    const previousRenderRuntimeTileSprites = this.performanceConfig.renderRuntimeTileSprites;
    this.performanceConfig = { ...config };
    this.setProfileEnabled(config.showPixiProfiler);
    if (!previousRenderRuntimeTileSprites && this.performanceConfig.renderRuntimeTileSprites) {
      this.ensureRuntimeTileSpritesRequested();
    }
    this.invalidateTerrainChunks();
  }

  syncScene(
    scene: MapSceneSnapshot,
    transition: MapEntityTransition | null,
    motionSyncToken?: number,
    pathFadeDurationMs = DEFAULT_PATH_TRAIL_FADE_MS,
  ): void {
    this.refreshProfileState();
    const startedAt = this.profileStart();
    this.profileCount('syncScenes');
    this.ensureRuntimeTileSpritesRequested();
    this.setPathHighlight(scene.overlays.pathCells, pathFadeDurationMs);
    this.threatArrows = scene.overlays.threatArrows.map((entry) => ({ ...entry }));
    this.profileMeasure('syncEntities', () => this.syncEntities(scene.entities, transition, motionSyncToken));
    this.profileMeasure('formationRangeCache', () => this.rebuildFormationRangeVisualCacheIfNeeded());
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
    this.profileMeasure('worldOverlays', () => this.rebuildWorldOverlays(scene));
    this.profileEnd('syncScene', startedAt);
  }

  enqueueEffect(effect: CombatEffect): void {
    if (effect.type === 'attack') {
      this.addAttackTrail(effect.fromX, effect.fromY, effect.toX, effect.toY, effect.color);
      return;
    }
    if (effect.type === 'warning_zone') {
      this.addWarningZone(effect.cells, effect.color, effect.durationMs, effect.baseColor, effect.originX, effect.originY);
      return;
    }
    this.addFloatingText(
      effect.x,
      effect.y,
      effect.text,
      effect.color,
      effect.variant,
      this.resolveActionTextStyle(effect),
      effect.durationMs,
    );
  }

  resetScene(): void {
    for (const chunk of this.terrainChunks.values()) chunk.container.destroy({ children: true });
    this.terrainChunks.clear();
    for (const view of this.entities.values()) view.root.destroy({ children: true });
    this.entities.clear();
    this.pathCells = [];
    this.fadingPath = null;
    this.threatArrows = [];
    this.pathGraphics.clear();
    this.clearContainer(this.groundLayer);
    for (const child of this.effectLayer.children.slice()) {
      if (child !== this.threatArrowGraphics) child.destroy({ children: true });
    }
    this.threatArrowGraphics.clear();
    this.timeOverlayGraphics.clear();
    this.floatingTexts = [];
    this.attackTrails = [];
    this.warningZones = [];
    this.formationRangeVisuals.clear();
    this.formationRangeSenseQiVisuals.clear();
    this.formationRangeSignature = '';
    this.terrainOverlaySignature = '';
    this.visibleTileFadeStartedAt.clear();
    this.hiddenTileFadeStartedAt.clear();
    this.previousVisibleTileKeys.clear();
    this.lastVisibleTileRevision = -1;
    this.timeAtmosphere.initialized = false;
    this.resetProfileState();
  }

  render(scene: MapSceneSnapshot, camera: CameraState, projection: TopdownProjection, progress: number): void {
    void projection;
    const player = scene.player;
    if (!this.ready || !player) return;
    this.refreshProfileState();
    const frameStartedAt = this.profileStart();
    this.profileCount('frames');
    this.profileMeasure('camera', () => this.updateCameraTransform(camera));
    this.profileMeasure('terrainChunks', () => this.updateTerrainChunks(scene, camera));
    this.profileMeasure('entityViews', () => this.updateEntityViews(camera, progress, player.id, player.x, player.y, player.char));
    this.profileMeasure('threatArrows', () => this.renderThreatArrows());
    this.profileMeasure('effects', () => this.updateEffects(camera));
    this.profileMeasure('timeOverlay', () => this.renderTimeOverlay(scene.terrain.time));
    this.profileMeasure('appRender', () => this.app.render());
    this.profileEnd('renderFrame', frameStartedAt);
    this.recordProfileFrame();
    this.publishProfileIfNeeded();
  }

  getCanvas(): HTMLCanvasElement | null {
    return this.canvas;
  }

  private clearContainer(container: Container): void {
    for (const child of container.removeChildren()) child.destroy({ children: true });
  }

  private updateCameraTransform(camera: CameraState): void {
    this.world.position.set(this.width / 2 - camera.x + camera.offsetX, this.height / 2 - camera.y + camera.offsetY);
  }

  private invalidateTerrainChunks(): void {
    for (const chunk of this.terrainChunks.values()) chunk.signature = '';
  }

  private setProfileEnabled(enabled: boolean): void {
    if (this.profileEnabled === enabled) return;
    this.profileEnabled = enabled;
    if (enabled) {
      this.refreshProfileState();
      return;
    }
    this.profileState = null;
    this.profileWindow?.destroy();
    this.profileWindow = null;
    if (typeof window !== 'undefined') {
      delete window.__mudPixiProfile;
      delete window.__mudPixiProfileReset;
    }
  }

  private ensureRuntimeTileSpritesRequested(): void {
    if (!this.performanceConfig.renderRuntimeTileSprites || this.runtimeTileManifestState !== 'idle') return;
    if (typeof fetch !== 'function') {
      this.runtimeTileManifestState = 'error';
      return;
    }
    this.runtimeTileManifestState = 'loading';
    void this.loadRuntimeTileSpriteManifest();
  }

  private async loadRuntimeTileSpriteManifest(): Promise<void> {
    try {
      const response = await fetch(DEFAULT_RUNTIME_IMAGE_PACK_MANIFEST_URL, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`runtime_tile_sprite_manifest_http_${response.status}`);
      const manifest = await response.json() as RuntimeTileSpriteManifest;
      const refs = normalizePixiTileSpriteMap(manifest.tiles, DEFAULT_RUNTIME_IMAGE_PACK_MANIFEST_URL);
      this.runtimeTileSpriteRefs = new Map([...refs.entries()].sort(([, left], [, right]) => left.zIndex - right.zIndex || left.order - right.order));
      this.runtimeLegacyTileKeys = normalizeLegacyTileMap(manifest.legacyTiles);
      this.runtimeTileManifestState = 'loaded';
      this.runtimeTileTextures.clear();
      this.runtimeTileSpriteRevision += 1;
      this.invalidateTerrainChunks();
    } catch (error) {
      this.runtimeTileManifestState = 'error';
      this.runtimeTileSpriteRevision += 1;
      this.invalidateTerrainChunks();
      console.warn('[map] failed to load Pixi runtime tile sprites', error);
    }
  }

  private resolveRuntimeTileSpriteRef(tile: Tile): PixiTileSpriteRef | null {
    if (!this.performanceConfig.renderRuntimeTileSprites || this.runtimeTileManifestState !== 'loaded') return null;
    const key = resolveTopTileSpriteKey(tile, this.runtimeLegacyTileKeys);
    return key ? this.runtimeTileSpriteRefs.get(key) ?? null : null;
  }

  private getRuntimeTileTexture(ref: PixiTileSpriteRef, sourceMask = 15, quad?: { x: number; y: number; sourceW: number; sourceH: number }): Texture | null {
    const coords = ref.dualGrid ? DUAL_GRID_ATLAS_COORDS[sourceMask] : undefined;
    const frameCol = Math.min(ref.cols - 1, ref.col + (coords?.[0] ?? 0));
    const frameRow = Math.min(ref.rows - 1, ref.row + (coords?.[1] ?? 0));
    const cacheKey = `${ref.key}:${ref.src}:${frameCol}:${frameRow}:${ref.colSpan}:${ref.rowSpan}:${sourceMask}:${quad?.x ?? ''}:${quad?.y ?? ''}:${quad?.sourceW ?? ''}:${quad?.sourceH ?? ''}`;
    const cached = this.runtimeTileTextures.get(cacheKey);
    if (cached && !cached.destroyed) return cached;
    const atlas = Assets.get<Texture>(ref.src) ?? Texture.from(ref.src);
    if (!atlas || atlas === Texture.EMPTY || atlas.width <= 0 || atlas.height <= 0) return null;
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
    this.runtimeTileTextures.set(cacheKey, texture);
    return texture;
  }

  private requestRuntimeTileTexture(ref: PixiTileSpriteRef): void {
    if (this.runtimeTileTextureRequests.has(ref.src)) return;
    this.runtimeTileTextureRequests.add(ref.src);
    void Assets.load(ref.src).then(() => {
      this.runtimeTileTextureRequests.delete(ref.src);
      this.runtimeTileSpriteRevision += 1;
      this.invalidateTerrainChunks();
    }).catch((error) => {
      this.runtimeTileTextureRequests.delete(ref.src);
      console.warn('[map] failed to load Pixi runtime tile texture', ref.src, error);
    });
  }

  private drawRuntimeTileSprite(chunkContainer: Container, tile: Tile, sx: number, sy: number, cellSize: number): void {
    const ref = this.resolveRuntimeTileSpriteRef(tile);
    if (!ref) return;
    const texture = this.getRuntimeTileTexture(ref);
    if (!texture) {
      this.requestRuntimeTileTexture(ref);
      return;
    }
    const sprite = new Sprite(texture);
    sprite.position.set(sx, sy);
    sprite.width = cellSize;
    sprite.height = cellSize;
    sprite.zIndex = ref.zIndex;
    chunkContainer.addChild(sprite);
    this.profileCount('runtimeTileSprites');
  }

  private resolveRuntimeTileSpriteKey(tile: Tile | null | undefined): string | null {
    if (!tile || !this.performanceConfig.renderRuntimeTileSprites || this.runtimeTileManifestState !== 'loaded') return null;
    return resolveTopTileSpriteKey(tile, this.runtimeLegacyTileKeys);
  }

  private drawDualGridSprite(
    chunkContainer: Container,
    ref: PixiTileSpriteRef,
    dx: number,
    dy: number,
    cellSize: number,
    sourceMask: number,
    clipMask: number,
  ): void {
    if (!ref.dualGrid) return;
    const atlas = Assets.get<Texture>(ref.src) ?? Texture.from(ref.src);
    if (!atlas || atlas === Texture.EMPTY || atlas.width <= 0 || atlas.height <= 0) {
      this.requestRuntimeTileTexture(ref);
      return;
    }
    const cellW = atlas.width / ref.cols;
    const cellH = atlas.height / ref.rows;
    const coords = DUAL_GRID_ATLAS_COORDS[sourceMask];
    if (!coords) return;
    if (clipMask === 15) {
      const texture = this.getRuntimeTileTexture(ref, sourceMask);
      if (!texture) {
        this.requestRuntimeTileTexture(ref);
        return;
      }
      const overlap = Math.min(1, Math.max(0.5, cellSize / Math.max(1, Math.max(cellW, cellH))));
      const sprite = new Sprite(texture);
      sprite.position.set(dx - overlap, dy - overlap);
      sprite.width = cellSize + overlap * 2;
      sprite.height = cellSize + overlap * 2;
      sprite.zIndex = ref.zIndex + 0.1;
      chunkContainer.addChild(sprite);
      this.profileCount('dualGridSprites');
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
      const texture = this.getRuntimeTileTexture(ref, sourceMask, { x: sourceX, y: sourceY, sourceW, sourceH });
      if (!texture) {
        this.requestRuntimeTileTexture(ref);
        continue;
      }
      const sprite = new Sprite(texture);
      sprite.position.set(destX, destY);
      sprite.width = destW;
      sprite.height = destH;
      sprite.zIndex = ref.zIndex + 0.1;
      chunkContainer.addChild(sprite);
      this.profileCount('dualGridSprites');
    }
  }

  private drawRuntimeDualGridEdges(
    chunkContainer: Container,
    scene: MapSceneSnapshot,
    startX: number,
    startY: number,
    cellSize: number,
  ): void {
    if (!this.performanceConfig.renderRuntimeTileSprites || this.runtimeTileManifestState !== 'loaded') return;
    const refs = this.runtimeTileSpriteRefs;
    if (refs.size === 0) return;
    const keyOrder = new Map<string, number>();
    let keyOrderIndex = 0;
    for (const key of refs.keys()) keyOrder.set(key, keyOrderIndex++);
    const vertexEntries: Array<{ key: string; mask: number }> = [];
    for (let vertexY = startY; vertexY <= startY + CHUNK_SIZE; vertexY += 1) {
      for (let vertexX = startX; vertexX <= startX + CHUNK_SIZE; vertexX += 1) {
        vertexEntries.length = 0;
        let occupiedMask = 0;
        const corners = [
          { x: vertexX - 1, y: vertexY - 1, mask: 1 },
          { x: vertexX - 1, y: vertexY, mask: 2 },
          { x: vertexX, y: vertexY - 1, mask: 4 },
          { x: vertexX, y: vertexY, mask: 8 },
        ] as const;
        for (const corner of corners) {
          const tile = scene.terrain.tileCache.get(`${corner.x},${corner.y}`);
          const key = this.resolveRuntimeTileSpriteKey(tile);
          if (!key || !refs.get(key)?.dualGrid) continue;
          occupiedMask |= corner.mask;
          const existing = vertexEntries.find((entry) => entry.key === key);
          if (existing) {
            existing.mask |= corner.mask;
          } else {
            vertexEntries.push({ key, mask: corner.mask });
          }
        }
        if (vertexEntries.length === 0) continue;
        vertexEntries.sort((left, right) => (keyOrder.get(left.key) ?? 0) - (keyOrder.get(right.key) ?? 0));
        const dx = (vertexX - 0.5) * cellSize;
        const dy = (vertexY - 0.5) * cellSize;
        for (const entry of vertexEntries) {
          const ref = refs.get(entry.key);
          if (!ref?.dualGrid) continue;
          const targetMask = entry.mask & 15;
          const backgroundMask = occupiedMask & ~targetMask & 15;
          if (targetMask === 15 && backgroundMask === 0) continue;
          this.drawDualGridSprite(chunkContainer, ref, dx, dy, cellSize, targetMask, targetMask);
        }
      }
    }
  }

  private buildTerrainOverlaySignature(scene: MapSceneSnapshot): string {
    return [
      buildTargetingSignature(scene),
      buildGridPointSignature(scene.overlays.formationRange?.affectedCells),
      scene.overlays.formationRange?.rangeHighlightColor ?? '',
      scene.overlays.senseQi ? `${scene.overlays.senseQi.hoverX ?? ''},${scene.overlays.senseQi.hoverY ?? ''},${scene.overlays.senseQi.levelBaseValue ?? ''}` : 'null',
      scene.overlays.buildPreview ? `${scene.overlays.buildPreview.defId}:${scene.overlays.buildPreview.originX},${scene.overlays.buildPreview.originY}:${scene.overlays.buildPreview.rotation ?? ''}:${buildBuildPreviewSignature(scene.overlays.buildPreview.cells)}` : 'null',
      scene.overlays.fengShui ? `${scene.overlays.fengShui.instanceId}:${scene.overlays.fengShui.revision}:${buildFengShuiOverlaySignature(scene.overlays.fengShui.cells)}` : 'null',
      this.formationRangeSignature,
    ].join('||');
  }

  private setPathHighlight(cells: GridPoint[], fadeDurationMs: number): void {
    if (buildGridPointSignature(cells) === buildGridPointSignature(this.pathCells)) return;
    if (this.pathCells.length > 0) {
      this.fadingPath = {
        cells: this.pathCells.map((cell) => ({ x: cell.x, y: cell.y })),
        startedAt: performance.now(),
        durationMs: Math.max(1, Math.round(fadeDurationMs)),
      };
    }
    this.pathCells = cells.map((cell) => ({ x: cell.x, y: cell.y }));
  }

  private syncTileVisibilityTransitions(
    visibleTiles: ReadonlySet<string>,
    tileCache: ReadonlyMap<string, Tile>,
    now: number,
    transitionStartedAt: number,
    transitionDurationMs: number,
  ): void {
    const shouldAnimateVisibleEnter = this.previousVisibleTileKeys.size > 0;
    const transitionState = {
      startedAt: Number.isFinite(transitionStartedAt) ? transitionStartedAt : now,
      durationMs: Math.max(1, Math.round(Number.isFinite(transitionDurationMs) ? transitionDurationMs : TILE_HIDDEN_FADE_MS)),
    };
    for (const key of this.previousVisibleTileKeys) {
      if (!visibleTiles.has(key) && tileCache.has(key) && !this.hiddenTileFadeStartedAt.has(key)) {
        this.hiddenTileFadeStartedAt.set(key, transitionState);
      }
    }
    for (const key of visibleTiles) {
      if (shouldAnimateVisibleEnter && !this.previousVisibleTileKeys.has(key) && tileCache.has(key)) {
        this.visibleTileFadeStartedAt.set(key, transitionState);
      }
      this.hiddenTileFadeStartedAt.delete(key);
    }
    this.previousVisibleTileKeys = new Set(visibleTiles);
  }

  private updateTerrainChunks(scene: MapSceneSnapshot, camera: CameraState): void {
    const cellSize = getCellSize();
    const startGX = Math.floor((camera.x - this.width / 2 - camera.offsetX) / cellSize) - 2;
    const startGY = Math.floor((camera.y - this.height / 2 - camera.offsetY) / cellSize) - 2;
    const endGX = Math.ceil((camera.x + this.width / 2 - camera.offsetX) / cellSize) + 2;
    const endGY = Math.ceil((camera.y + this.height / 2 - camera.offsetY) / cellSize) + 2;
    const startCX = Math.floor(startGX / CHUNK_SIZE);
    const startCY = Math.floor(startGY / CHUNK_SIZE);
    const endCX = Math.floor(endGX / CHUNK_SIZE);
    const endCY = Math.floor(endGY / CHUNK_SIZE);
    this.chunkFrame += 1;
    let visibleChunkCount = 0;
    for (let cy = startCY; cy <= endCY; cy += 1) {
      for (let cx = startCX; cx <= endCX; cx += 1) {
        visibleChunkCount += 1;
        const key = `${cx},${cy}`;
        let chunk = this.terrainChunks.get(key);
        if (!chunk) {
          chunk = { key, cx, cy, container: new Container(), signature: '', signatureDeps: null, lastSeenFrame: this.chunkFrame };
          chunk.container.label = `terrain-chunk:${key}`;
          this.terrainChunks.set(key, chunk);
          this.terrainLayer.addChild(chunk.container);
        }
        chunk.lastSeenFrame = this.chunkFrame;
        const signature = this.resolveTerrainChunkSignature(chunk, scene, cellSize);
        if (signature !== chunk.signature) {
          this.profileCount('terrainChunkRebuilds');
          this.profileMeasure('terrainRebuild', () => this.rebuildTerrainChunk(chunk, scene, cellSize, signature));
        }
      }
    }
    for (const [key, chunk] of this.terrainChunks) {
      if (this.chunkFrame - chunk.lastSeenFrame > 4) {
        chunk.container.destroy({ children: true });
        this.terrainChunks.delete(key);
      }
    }
    this.profileSetCounter('visibleChunks', visibleChunkCount);
    this.profileMeasure('pathLayer', () => this.rebuildPathLayer(scene));
  }

  private resolveTerrainChunkSignature(chunk: TerrainChunkView, scene: MapSceneSnapshot, cellSize: number): string {
    const deps: TerrainChunkSignatureDeps = {
      cellSize,
      terrainOverlaySignature: this.terrainOverlaySignature,
      renderRuntimeTileSprites: this.performanceConfig.renderRuntimeTileSprites,
      runtimeTileSpriteRevision: this.runtimeTileSpriteRevision,
      visibleTileRevision: scene.terrain.visibleTileRevision,
    };
    if (chunk.signature && chunk.signatureDeps && this.isSameTerrainChunkSignatureDeps(chunk.signatureDeps, deps)) {
      this.profileCount('terrainChunkSignatureHits');
      return chunk.signature;
    }
    const signature = this.profileMeasure('terrainSignature', () => this.buildTerrainChunkSignature(scene, chunk.cx, chunk.cy, cellSize));
    this.profileCount('terrainChunkSignatures');
    chunk.signatureDeps = deps;
    return signature;
  }

  private isSameTerrainChunkSignatureDeps(previous: TerrainChunkSignatureDeps, next: TerrainChunkSignatureDeps): boolean {
    return previous.cellSize === next.cellSize
      && previous.terrainOverlaySignature === next.terrainOverlaySignature
      && previous.renderRuntimeTileSprites === next.renderRuntimeTileSprites
      && previous.runtimeTileSpriteRevision === next.runtimeTileSpriteRevision
      && previous.visibleTileRevision === next.visibleTileRevision;
  }

  private buildTerrainChunkSignature(scene: MapSceneSnapshot, cx: number, cy: number, cellSize: number): string {
    const startX = cx * CHUNK_SIZE;
    const startY = cy * CHUNK_SIZE;
    let signature = `${cellSize}|${this.terrainOverlaySignature}|${this.performanceConfig.renderRuntimeTileSprites ? 1 : 0}|${this.runtimeTileSpriteRevision}`;
    for (let y = startY; y < startY + CHUNK_SIZE; y += 1) {
      for (let x = startX; x < startX + CHUNK_SIZE; x += 1) {
        const key = `${x},${y}`;
        const tile = scene.terrain.tileCache.get(key);
        if (!tile) continue;
        signature += [
          '',
          key,
          tile.type,
          tile.terrainType ?? '',
          tile.surfaceType ?? '',
          tile.structureType ?? '',
          Array.isArray(tile.interactableKinds) ? tile.interactableKinds.join('+') : '',
          tile.hp ?? '',
          tile.maxHp ?? '',
          tile.hpVisible === false ? 0 : 1,
          tile.aura ?? '',
          tile.resources?.length ?? 0,
          scene.terrain.visibleTiles.has(key) ? 1 : 0,
        ].join(':');
      }
    }
    return signature;
  }

  private rebuildTerrainChunk(chunk: TerrainChunkView, scene: MapSceneSnapshot, cellSize: number, signature: string): void {
    this.disableTerrainChunkCache(chunk.container);
    this.clearContainer(chunk.container);
    chunk.container.sortableChildren = true;
    const baseGraphics = new Graphics();
    const overlayGraphics = new Graphics();
    baseGraphics.zIndex = 0;
    overlayGraphics.zIndex = 600;
    const startX = chunk.cx * CHUNK_SIZE;
    const startY = chunk.cy * CHUNK_SIZE;
    const senseQiLevelBaseValue = normalizeAuraLevelBaseValue(scene.overlays.senseQi?.levelBaseValue);
    const buildPreviewCellByKey = new Map<string, NonNullable<MapSceneSnapshot['overlays']['buildPreview']>['cells'][number]>();
    for (const cell of scene.overlays.buildPreview?.cells ?? []) buildPreviewCellByKey.set(`${cell.x},${cell.y}`, cell);
    const fengShuiCellByKey = new Map<string, NonNullable<MapSceneSnapshot['overlays']['fengShui']>['cells'][number]>();
    for (const cell of scene.overlays.fengShui?.cells ?? []) fengShuiCellByKey.set(`${cell.x},${cell.y}`, cell);
    const targetingAffectedKeys = new Set((scene.overlays.targeting?.affectedCells ?? []).map((cell) => `${cell.x},${cell.y}`));
    const formationAffectedKeys = new Set((scene.overlays.formationRange?.affectedCells ?? []).map((cell) => `${cell.x},${cell.y}`));
    for (let y = startY; y < startY + CHUNK_SIZE; y += 1) {
      for (let x = startX; x < startX + CHUNK_SIZE; x += 1) {
        const key = `${x},${y}`;
        const tile = scene.terrain.tileCache.get(key);
        if (!tile) continue;
        const sx = x * cellSize;
        const sy = y * cellSize;
        const bg = parseColor(TILE_VISUAL_BG_COLORS[tile.type], 0x333333);
        baseGraphics.rect(sx, sy, cellSize, cellSize).fill({ color: bg });
        baseGraphics.rect(sx, sy, cellSize, cellSize).stroke({ color: 0x000000, alpha: 0.1, width: 0.5 });
        this.drawRuntimeTileSprite(chunk.container, tile, sx, sy, cellSize);
        this.drawTerrainOverlays(overlayGraphics, chunk.container, scene, tile, key, x, y, sx, sy, cellSize, senseQiLevelBaseValue, {
          buildPreviewCellByKey,
          fengShuiCellByKey,
          targetingAffectedKeys,
          formationAffectedKeys,
        });
        const glyph = TILE_VISUAL_GLYPHS[tile.type];
        const hasRuntimeSprite = this.resolveRuntimeTileSpriteRef(tile) !== null;
        if (glyph && !hasRuntimeSprite) {
          const label = new Text({
            text: glyph,
            style: textStyle('tileGlyph', cellSize * 0.6, TILE_VISUAL_GLYPH_COLORS[tile.type] ?? 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0)', 0),
            anchor: 0.5,
          });
          label.position.set(sx + cellSize / 2, sy + cellSize / 2 + 1);
          label.zIndex = 700;
          chunk.container.addChild(label);
        }
      }
    }
    this.drawRuntimeDualGridEdges(chunk.container, scene, startX, startY, cellSize);
    chunk.container.addChild(baseGraphics, overlayGraphics);
    chunk.signature = signature;
    this.enableTerrainChunkCache(chunk.container);
  }

  private enableTerrainChunkCache(container: Container): void {
    if (container.children.length === 0) return;
    container.cacheAsTexture(TERRAIN_CHUNK_CACHE_OPTIONS);
  }

  private disableTerrainChunkCache(container: Container): void {
    if (!container.isCachedAsTexture) return;
    container.cacheAsTexture(false);
  }

  private drawTerrainOverlays(
    graphics: Graphics,
    chunkContainer: Container,
    scene: MapSceneSnapshot,
    tile: Tile,
    key: string,
    gx: number,
    gy: number,
    sx: number,
    sy: number,
    cellSize: number,
    senseQiLevelBaseValue: number,
    indexes: {
      buildPreviewCellByKey: ReadonlyMap<string, NonNullable<MapSceneSnapshot['overlays']['buildPreview']>['cells'][number]>;
      fengShuiCellByKey: ReadonlyMap<string, NonNullable<MapSceneSnapshot['overlays']['fengShui']>['cells'][number]>;
      targetingAffectedKeys: ReadonlySet<string>;
      formationAffectedKeys: ReadonlySet<string>;
    },
  ): void {
    const isVisible = scene.terrain.visibleTiles.has(key);
    const now = performance.now();
    const hiddenFade = this.resolveTileFade(this.hiddenTileFadeStartedAt.get(key), now, false);
    const visibleFade = this.resolveTileFade(this.visibleTileFadeStartedAt.get(key), now, true);
    const targeting = scene.overlays.targeting;
    if (targeting && (!targeting.visibleOnly || isVisible)) {
      const dx = gx - targeting.originX;
      const dy = gy - targeting.originY;
      const affected = indexes.targetingAffectedKeys.has(key);
      const hovered = gx === targeting.hoverX && gy === targeting.hoverY;
      const inRange = (dx !== 0 || dy !== 0) && isOffsetInRange(dx, dy, targeting.range);
      if (affected || inRange) {
        this.drawCellHighlight(
          graphics,
          sx,
          sy,
          cellSize,
          affected ? (hovered ? 'rgba(208,76,56,0.42)' : 'rgba(198,72,48,0.3)') : (hovered ? 'rgba(66,153,225,0.3)' : 'rgba(88,180,214,0.18)'),
          affected ? (hovered ? 'rgba(150,28,24,0.98)' : 'rgba(171,56,36,0.9)') : (hovered ? 'rgba(125,211,252,0.94)' : 'rgba(151,236,255,0.72)'),
          hovered || affected,
        );
      }
    }
    if (scene.overlays.formationRange && indexes.formationAffectedKeys.has(key)) {
      const color = scene.overlays.formationRange.rangeHighlightColor;
      const fill = colorWithAlpha(color, 0.22);
      const stroke = colorWithAlpha(color, 0.86);
      graphics.rect(sx + 1, sy + 1, cellSize - 2, cellSize - 2).fill(fill);
      graphics.rect(sx + 1.5, sy + 1.5, cellSize - 3, cellSize - 3).stroke({ ...stroke, width: 2 });
    }
    if (tile && scene.overlays.fengShui && isVisible) {
      graphics.rect(sx, sy, cellSize, cellSize).fill({ color: 0x080605, alpha: 0.34 });
    }
    const fengShuiCell = indexes.fengShuiCellByKey.get(key);
    if (fengShuiCell) {
      graphics.rect(sx + 1, sy + 1, cellSize - 2, cellSize - 2).fill(getFengShuiOverlayFill(fengShuiCell));
      graphics.rect(sx + 1.5, sy + 1.5, cellSize - 3, cellSize - 3).stroke({ ...getFengShuiOverlayStroke(fengShuiCell), width: 1 });
    }
    if (tile && !scene.overlays.senseQi && isVisible) {
      const visibleFormationRangeVisual = this.resolveFormationRangeVisual(gx, gy, false);
      if (visibleFormationRangeVisual) this.drawFormationRangeVisual(graphics, chunkContainer, sx, sy, cellSize, visibleFormationRangeVisual);
    }
    if (scene.overlays.senseQi) {
      const style = isVisible ? getSenseQiOverlayStyle(tile, senseQiLevelBaseValue) : { color: 0x000000, alpha: 0.34 };
      graphics.rect(sx, sy, cellSize, cellSize).fill(style);
      const formationRangeVisual = this.resolveFormationRangeVisual(gx, gy, true);
      if (formationRangeVisual) this.drawFormationRangeVisual(graphics, chunkContainer, sx, sy, cellSize, formationRangeVisual);
      if (isVisible && gx === scene.overlays.senseQi.hoverX && gy === scene.overlays.senseQi.hoverY) {
        graphics.rect(sx + 1, sy + 1, cellSize - 2, cellSize - 2).stroke({ color: parseColor(SENSE_QI_OVERLAY_STYLE.hoverStroke), alpha: parseAlpha(SENSE_QI_OVERLAY_STYLE.hoverStroke, 1), width: 2 });
      }
    }
    const buildCell = indexes.buildPreviewCellByKey.get(key);
    if (buildCell) {
      this.drawCellHighlight(graphics, sx, sy, cellSize, buildCell.ok ? (buildCell.warning ? 'rgba(217,119,6,0.24)' : 'rgba(22,163,74,0.24)') : 'rgba(220,38,38,0.30)', buildCell.ok ? (buildCell.warning ? 'rgba(245,158,11,0.92)' : 'rgba(34,197,94,0.92)') : 'rgba(248,113,113,0.96)', false);
    }
    if (!isVisible) {
      graphics.rect(sx, sy, cellSize, cellSize).fill({ color: tile ? 0x0c0a08 : 0x080605, alpha: (tile ? 0.72 : 0.94) * hiddenFade });
    } else if (visibleFade > 0) {
      graphics.rect(sx, sy, cellSize, cellSize).fill({ color: 0x0c0a08, alpha: 0.72 * visibleFade });
    }
  }

  private resolveTileFade(state: { startedAt: number; durationMs: number } | undefined, now: number, entering: boolean): number {
    if (!state) return entering ? 0 : 1;
    const progress = clamp01((now - state.startedAt) / Math.max(1, state.durationMs));
    return entering ? 1 - progress : progress;
  }

  private drawCellHighlight(graphics: Graphics, sx: number, sy: number, cellSize: number, fill: string, stroke: string, core: boolean, alphaMultiplier = 1): void {
    const alpha = clamp01(alphaMultiplier);
    graphics.rect(sx + 1, sy + 1, cellSize - 2, cellSize - 2).fill({ color: parseColor(fill), alpha: parseAlpha(fill, 1) * alpha });
    graphics.rect(sx + 1.5, sy + 1.5, cellSize - 3, cellSize - 3).stroke({ color: parseColor(stroke), alpha: parseAlpha(stroke, 1) * alpha, width: core ? 2 : 1.5 });
    if (core) graphics.circle(sx + cellSize / 2, sy + cellSize / 2, Math.max(3, cellSize * 0.12)).fill({ color: parseColor(PATH_TARGET_CORE_COLOR), alpha: parseAlpha(PATH_TARGET_CORE_COLOR, 1) * alpha });
  }

  private drawFormationRangeVisual(graphics: Graphics, chunkContainer: Container, sx: number, sy: number, cellSize: number, visual: FormationRangeVisual): void {
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

  private resolveFormationRangeVisual(gx: number, gy: number, senseQiVisible: boolean): FormationRangeVisual | null {
    const key = `${gx},${gy}`;
    return senseQiVisible
      ? this.formationRangeSenseQiVisuals.get(key) ?? null
      : this.formationRangeVisuals.get(key) ?? null;
  }

  private rebuildWorldOverlays(scene: MapSceneSnapshot): void {
    this.clearContainer(this.groundLayer);
    const cellSize = getCellSize();
    this.profileSetCounter('groundPiles', scene.groundPiles.size);
    for (const pile of scene.groundPiles.values()) {
      const root = new Container();
      root.position.set(pile.x * cellSize, pile.y * cellSize);
      this.drawGroundPile(root, pile, cellSize);
      this.groundLayer.addChild(root);
    }
  }

  private drawGroundPile(root: Container, pile: GroundItemPileView, cellSize: number): void {
    const slotSize = Math.max(8, Math.floor(cellSize / 3));
    const gridSize = slotSize * 3;
    const offsetX = Math.max(0, cellSize - gridSize);
    const offsetY = Math.max(0, cellSize - gridSize);
    const entries = pile.items.slice(0, 9);
    entries.forEach((entry, index) => {
      const col = 2 - (index % 3);
      const row = 2 - Math.floor(index / 3);
      const x = offsetX + col * slotSize;
      const y = offsetY + row * slotSize;
      const graphics = new Graphics();
      graphics.roundRect(x + 1, y + 1, slotSize - 2, slotSize - 2, Math.max(2, slotSize * 0.18)).fill({ color: 0x2e261e, alpha: 0.88 }).stroke({ color: 0xcdb180, alpha: 0.92, width: 1 });
      root.addChild(graphics);
      const label = new Text({ text: resolveGroundItemLabel(entry), style: textStyle('badge', Math.max(6, slotSize * 0.4), '#fff4dc'), anchor: 0.5 });
      label.position.set(x + slotSize / 2, y + slotSize / 2);
      root.addChild(label);
      if (entry.count > 1) {
        const count = new Text({ text: formatDisplayInteger(entry.count), style: textStyle('badge', Math.max(5, slotSize * 0.26), '#fff9ed', 'rgba(12,10,8,0.94)', 2), anchor: { x: 1, y: 0 } });
        count.position.set(x + slotSize, y);
        root.addChild(count);
      }
    });
  }

  private rebuildPathLayer(scene: MapSceneSnapshot): void {
    this.pathGraphics.clear();
    this.profileSetCounter('pathCells', this.pathCells.length);
    this.profileSetCounter('fadingPathCells', this.fadingPath?.cells.length ?? 0);
    this.drawPathCells(this.pathGraphics, this.pathCells, 1);
    const fadingAlpha = this.getFadingPathAlpha(performance.now());
    if (this.fadingPath && fadingAlpha > 0) this.drawPathCells(this.pathGraphics, this.fadingPath.cells, fadingAlpha * PATH_TRAIL_FADE_ALPHA);
    this.drawPathArrows(this.pathGraphics, scene.player?.x ?? 0, scene.player?.y ?? 0, this.pathCells, 1);
    if (this.fadingPath && fadingAlpha > 0) this.drawPathArrows(this.pathGraphics, scene.player?.x ?? 0, scene.player?.y ?? 0, this.fadingPath.cells, fadingAlpha * PATH_TRAIL_FADE_ALPHA);
  }

  private drawPathCells(graphics: Graphics, cells: GridPoint[], alpha: number): void {
    const cellSize = getCellSize();
    const target = cells[cells.length - 1];
    const targetKey = target ? `${target.x},${target.y}` : null;
    for (const cell of cells) {
      const key = `${cell.x},${cell.y}`;
      const isTarget = key === targetKey;
      this.drawCellHighlight(
        graphics,
        cell.x * cellSize,
        cell.y * cellSize,
        cellSize,
        isTarget ? PATH_TARGET_FILL_COLOR : PATH_FILL_COLOR,
        isTarget ? PATH_TARGET_STROKE_COLOR : PATH_STROKE_COLOR,
        isTarget,
        alpha,
      );
    }
  }

  private drawPathArrows(graphics: Graphics, playerX: number, playerY: number, cells: GridPoint[], alpha: number): void {
    const cellSize = getCellSize();
    const route = [{ x: playerX, y: playerY }, ...cells];
    for (let index = 0; index < route.length - 1; index += 1) {
      const from = route[index];
      const to = route[index + 1];
      const fromX = from.x * cellSize + cellSize / 2;
      const fromY = from.y * cellSize + cellSize / 2;
      const toX = to.x * cellSize + cellSize / 2;
      const toY = to.y * cellSize + cellSize / 2;
      const dx = toX - fromX;
      const dy = toY - fromY;
      const distance = Math.hypot(dx, dy);
      if (distance < 1) continue;
      const ux = dx / distance;
      const uy = dy / distance;
      const tipX = toX - ux * cellSize * 0.14;
      const tipY = toY - uy * cellSize * 0.14;
      const headLength = Math.max(8, cellSize * 0.2);
      const headWidth = Math.max(5, cellSize * 0.12);
      const shaftEndX = tipX - ux * headLength;
      const shaftEndY = tipY - uy * headLength;
      const color = parseColor(`${to.x},${to.y}` === `${cells[cells.length - 1]?.x},${cells[cells.length - 1]?.y}` ? PATH_TARGET_STROKE_COLOR : PATH_ARROW_COLOR);
      graphics.moveTo(fromX + ux * cellSize * 0.1, fromY + uy * cellSize * 0.1)
        .lineTo(shaftEndX, shaftEndY)
        .stroke({ color, alpha, width: Math.max(1.25, cellSize * 0.06) });
      const normalX = -uy;
      const normalY = ux;
      graphics.moveTo(tipX, tipY)
        .lineTo(shaftEndX + normalX * headWidth, shaftEndY + normalY * headWidth)
        .lineTo(shaftEndX - normalX * headWidth, shaftEndY - normalY * headWidth)
        .closePath()
        .fill({ color, alpha });
    }
  }

  private syncEntities(list: readonly ObservedMapEntity[], transition: MapEntityTransition | null, motionSyncToken?: number): void {
    const seen = new Set<string>();
    const cellSize = getCellSize();
    const sameMotionSync = motionSyncToken !== undefined && motionSyncToken === this.lastEntityMotionToken;
    for (const entity of list) {
      seen.add(entity.id);
      const targetWX = entity.wx * cellSize;
      const targetWY = entity.wy * cellSize;
      let view = this.entities.get(entity.id);
      if (!view) {
        view = this.createEntityView(entity, targetWX, targetWY);
        this.entities.set(entity.id, view);
        this.entityLayer.addChild(view.root);
      } else {
        const anim = view.anim;
        const sameGrid = anim.gridX === entity.wx && anim.gridY === entity.wy;
        if (entity.id === transition?.movedId) {
          anim.oldWX = (entity.wx - (transition.shiftX ?? 0)) * cellSize;
          anim.oldWY = (entity.wy - (transition.shiftY ?? 0)) * cellSize;
        } else if (sameGrid && sameMotionSync) {
          // 保留同 tick 插值状态。
        } else if (!sameGrid) {
          anim.oldWX = anim.targetWX;
          anim.oldWY = anim.targetWY;
        } else {
          anim.oldWX = targetWX;
          anim.oldWY = targetWY;
        }
        Object.assign(anim, entity, { gridX: entity.wx, gridY: entity.wy, targetWX, targetWY });
      }
      this.patchEntityStatic(view);
    }
    for (const [id, view] of this.entities) {
      if (!seen.has(id)) {
        view.root.destroy({ children: true });
        this.entities.delete(id);
      }
    }
    if (motionSyncToken !== undefined) this.lastEntityMotionToken = motionSyncToken;
  }

  private createEntityView(entity: ObservedMapEntity, targetWX: number, targetWY: number): EntityView {
    const root = new Container();
    const visualRoot = new Container();
    const view: EntityView = {
      anim: { ...entity, gridX: entity.wx, gridY: entity.wy, oldWX: targetWX, oldWY: targetWY, targetWX, targetWY },
      root,
      visualRoot,
      shadow: new Graphics(),
      glyph: new Text({ text: entity.char, style: textStyle('entityGlyph', getCellSize() * 0.75, entity.color), anchor: 0.5 }),
      label: new Text({ text: '', style: textStyle('label', getCellSize() * 0.3, '#cce7ff'), anchor: 0.5 }),
      badge: new Text({ text: '', style: textStyle('badge', getCellSize() * 0.2, '#fff6eb'), anchor: 0.5 }),
      hpBar: new Graphics(),
      progressBar: new Graphics(),
      buffLayer: new Container(),
      questMarker: new Container(),
      formationMarker: new Graphics(),
      respawnLabel: new Text({ text: '', style: textStyle('label', getCellSize() * 0.22, '#e7d5a7'), anchor: 0.5 }),
      staticSignature: '',
      hiddenByFormation: false,
    };
    visualRoot.addChild(view.shadow, view.glyph);
    root.addChild(view.formationMarker, visualRoot, view.label, view.badge, view.hpBar, view.progressBar, view.buffLayer, view.questMarker, view.respawnLabel);
    return view;
  }

  private patchEntityStatic(view: EntityView): void {
    const anim = view.anim;
    const cellSize = getCellSize();
    const signature = [
      anim.char, anim.color, anim.name ?? '', anim.kind ?? '', anim.hp ?? '', anim.maxHp ?? '',
      anim.respawnRemainingTicks ?? '', anim.respawnTotalTicks ?? '',
      anim.badge?.text ?? '', anim.badge?.tone ?? '', anim.hostile ? 1 : 0,
      anim.buffs?.map((buff) => `${buff.buffId}:${buff.remainingTicks}:${buff.stacks}`).join(',') ?? '',
      anim.npcQuestMarker ? `${anim.npcQuestMarker.line}:${anim.npcQuestMarker.state}` : '',
      anim.formationShowText === false ? 1 : 0,
      anim.formationRangeHighlightColor ?? '',
    ].join('|');
    if (signature === view.staticSignature) return;
    const presentation = anim.kind === 'monster' ? getMonsterPresentation(anim.name, anim.monsterTier) : null;
    const visualScale = (presentation?.scale ?? 1) * Math.max(1, anim.monsterScale ?? 1);
    const visualCellSize = cellSize * visualScale;
    const visualOffset = (cellSize - visualCellSize) / 2;
    view.visualRoot.position.set(visualOffset, cellSize - visualCellSize);
    view.shadow.clear().ellipse(cellSize / 2, cellSize - 3, visualCellSize * 0.32, Math.max(2, visualCellSize * 0.1)).fill({ color: 0x000000, alpha: 0.3 });
    view.glyph.text = anim.char;
    view.glyph.style = textStyle('entityGlyph', visualCellSize * 0.75, anim.color);
    view.glyph.position.set(cellSize / 2, cellSize / 2);
    const label = presentation?.label ?? anim.name ?? resolveEntityFallbackLabel(anim.kind);
    const shouldShowLabel = anim.kind !== 'formation' || anim.formationShowText !== false;
    view.label.visible = shouldShowLabel;
    view.label.text = label;
    view.label.style = textStyle('label', cellSize * (anim.kind === 'crowd' ? 0.24 : 0.3), resolveEntityLabelColor(anim.kind));
    view.label.position.set(cellSize / 2, cellSize - visualCellSize - Math.max(6, cellSize * 0.18));
    const badge = anim.badge ?? presentation?.badge;
    view.badge.visible = shouldShowLabel && Boolean(badge);
    view.badge.text = badge?.text ?? '';
    view.badge.position.set(cellSize / 2 - Math.max(16, (badge?.text.length ?? 0) * cellSize * 0.2) / 2 - 4, -Math.max(12, cellSize * 0.3));
    this.drawEntityBars(view, visualCellSize);
    this.drawBuffs(view, cellSize);
    this.drawNpcQuestMarker(view.questMarker, anim.npcQuestMarker ?? undefined, cellSize);
    this.drawFormationMarker(view.formationMarker, anim, cellSize);
    this.drawRespawnLabel(view, cellSize, visualCellSize);
    view.root.zIndex = resolveWorldObjectRenderOrder(anim.kind);
    view.root.alpha = anim.kind === 'building' && (anim.respawnTotalTicks ?? 0) > 0 ? 0.58 : 1;
    view.staticSignature = signature;
  }

  private drawEntityBars(view: EntityView, visualCellSize: number): void {
    const anim = view.anim;
    const cellSize = getCellSize();
    view.hpBar.clear();
    view.progressBar.clear();
    const isConstructionBuilding = anim.kind === 'building' && (anim.respawnTotalTicks ?? 0) > 0;
    if (isConstructionBuilding) {
      const remaining = Math.max(0, Math.trunc(Number(anim.respawnRemainingTicks) || 0));
      const total = Math.max(1, Math.trunc(Number(anim.respawnTotalTicks) || 1));
      const ratio = clamp01(1 - (remaining / total));
      const y = visualCellSize - 5;
      const barH = Math.max(3, Math.round(visualCellSize * 0.08));
      view.progressBar.rect(3, y, Math.max(1, visualCellSize - 6), barH).fill({ color: 0x06121e, alpha: 0.58 });
      view.progressBar.rect(3, y, Math.max(0, (visualCellSize - 6) * ratio), barH).fill({ color: 0x7dd3fc });
      view.progressBar.position.set((cellSize - visualCellSize) / 2, cellSize - visualCellSize);
      return;
    }
    if ((anim.maxHp ?? 0) <= 0 || anim.kind === 'crowd') return;
    const ratio = clamp01((anim.hp ?? 0) / Math.max(anim.maxHp ?? 1, 1));
    const y = visualCellSize - 5;
    view.hpBar.rect(3, y, Math.max(1, visualCellSize - 6), 3).fill({ color: 0x000000, alpha: 0.45 });
    view.hpBar.rect(3, y, Math.max(0, (visualCellSize - 6) * ratio), 3).fill({ color: parseColor(resolveEntityHpBarColor(anim.kind, anim.hostile)) });
    view.hpBar.position.set((cellSize - visualCellSize) / 2, cellSize - visualCellSize);
  }

  private drawFormationMarker(graphics: Graphics, anim: AnimEntity, cellSize: number): void {
    graphics.clear();
    if (anim.kind !== 'formation') return;
    const center = cellSize / 2;
    const radius = Math.max(5, cellSize * 0.36);
    const color = anim.formationRangeHighlightColor ?? anim.color;
    graphics.circle(center, center, radius).fill(colorWithAlpha(color, 0.18)).stroke({ ...colorWithAlpha(color, 0.9), width: Math.max(1.5, cellSize * 0.055) });
    graphics.moveTo(center - radius * 0.66, center).lineTo(center + radius * 0.66, center)
      .moveTo(center, center - radius * 0.66).lineTo(center, center + radius * 0.66)
      .stroke({ ...colorWithAlpha(color, 0.72), width: Math.max(1, cellSize * 0.035) });
  }

  private drawRespawnLabel(view: EntityView, cellSize: number, visualCellSize: number): void {
    const anim = view.anim;
    view.respawnLabel.visible = anim.kind === 'container' && (anim.respawnRemainingTicks ?? 0) > 0;
    if (!view.respawnLabel.visible) return;
    view.respawnLabel.text = translateUi('map-render.respawn-countdown', { countdown: this.formatRespawnCountdown(anim.respawnRemainingTicks) });
    view.respawnLabel.style = textStyle('label', cellSize * 0.22, '#e7d5a7', 'rgba(15,12,10,0.92)', 3);
    view.respawnLabel.position.set(cellSize / 2, cellSize - visualCellSize + visualCellSize + Math.max(8, cellSize * 0.16));
  }

  private formatRespawnCountdown(ticks: number | undefined): string {
    const safeTicks = Math.max(0, Math.trunc(Number(ticks) || 0));
    if (safeTicks <= 0) return '0';
    if (safeTicks < 60) return String(safeTicks);
    const minutes = Math.floor(safeTicks / 60);
    const seconds = safeTicks % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  private drawBuffs(view: EntityView, cellSize: number): void {
    this.clearContainer(view.buffLayer);
    const visible = (view.anim.buffs ?? []).filter((buff) => buff.visibility === 'public');
    const rows = [
      visible.filter((buff) => buff.category === 'buff'),
      visible.filter((buff) => buff.category === 'debuff'),
    ];
    rows.forEach((row, rowIndex) => {
      const badgeSize = Math.max(8, Math.floor(cellSize * 0.24));
      row.slice(0, 4).forEach((buff, index) => {
        const root = new Container();
        root.position.set(index * (badgeSize + 2), rowIndex * (badgeSize + 4));
        const bg = new Graphics().roundRect(0, 0, badgeSize, badgeSize, 2).fill({ color: 0x0f0c0a, alpha: 0.78 }).stroke({ color: 0xfaf4e9, alpha: 0.14, width: 1 });
        const mark = new Text({ text: buff.shortMark, style: textStyle('badge', Math.max(6, badgeSize * 0.62), '#f7f0dd', 'rgba(0,0,0,0)', 0), anchor: 0.5 });
        mark.position.set(badgeSize / 2, badgeSize / 2);
        root.addChild(bg, mark);
        view.buffLayer.addChild(root);
      });
    });
    view.buffLayer.position.set(0, 1);
  }

  private drawNpcQuestMarker(container: Container, marker: NpcQuestMarker | undefined, cellSize: number): void {
    this.clearContainer(container);
    if (!marker) return;
    const size = Math.max(8, cellSize * 0.18);
    const graphics = new Graphics();
    graphics.circle(0, 0, size).fill({ color: marker.line === 'main' ? 0xecb337 : 0x549cde, alpha: 0.95 }).stroke({ color: 0xfff0b0, width: 2 });
    const symbol = marker.state === 'ready' ? '?' : marker.state === 'active' ? '...' : '!';
    const text = new Text({ text: symbol, style: textStyle('badge', Math.max(11, cellSize * 0.26), '#3d2500', 'rgba(0,0,0,0)', 0), anchor: 0.5 });
    container.position.set(cellSize + Math.max(8, cellSize * 0.18), Math.max(9, cellSize * 0.18));
    container.addChild(graphics, text);
  }

  private updateEntityViews(camera: CameraState, progress: number, localPlayerId: string, localPlayerX: number, localPlayerY: number, localPlayerChar: string): void {
    const cellSize = getCellSize();
    this.profileSetCounter('entities', this.entities.size);
    const motionProgress = clamp01(progress);
    const t = easeOutCubic(motionProgress);
    const viewportLeft = camera.x - this.width / 2 - cellSize * 2;
    const viewportTop = camera.y - this.height / 2 - cellSize * 2;
    const viewportRight = camera.x + this.width / 2 + cellSize * 2;
    const viewportBottom = camera.y + this.height / 2 + cellSize * 2;
    const crowdedTileKeys = new Set<string>();
    let localPlayerInRenderedEntities = false;
    for (const [id, view] of this.entities) {
      const anim = view.anim;
      if (view.root.visible && anim.kind === 'crowd') crowdedTileKeys.add(`${anim.gridX},${anim.gridY}`);
      if (id !== this.localPlayerFallbackId && anim.id === localPlayerId) localPlayerInRenderedEntities = true;
    }
    for (const view of this.entities.values()) {
      const anim = view.anim;
      if (anim.kind === 'formation' && view.hiddenByFormation) {
        view.root.visible = false;
        continue;
      }
      const wx = anim.oldWX + (anim.targetWX - anim.oldWX) * t;
      const wy = anim.oldWY + (anim.targetWY - anim.oldWY) * t;
      view.root.position.set(wx, wy);
      const inViewport = wx + cellSize >= viewportLeft && wx <= viewportRight && wy + cellSize >= viewportTop && wy <= viewportBottom;
      const hiddenByCrowd = anim.kind === 'player' && crowdedTileKeys.has(`${anim.gridX},${anim.gridY}`);
      view.root.visible = inViewport && !hiddenByCrowd;
      this.patchEntityMotion(view, motionProgress);
    }
    this.ensureLocalPlayerFallback(localPlayerId, localPlayerX, localPlayerY, localPlayerChar, localPlayerInRenderedEntities);
  }

  private patchEntityMotion(view: EntityView, motionProgress: number): void {
    const anim = view.anim;
    const motionDx = anim.targetWX - anim.oldWX;
    const motionDy = anim.targetWY - anim.oldWY;
    const motionDistance = Math.hypot(motionDx, motionDy);
    const isMoving = isMobileEntityObjectKind(anim.kind) && motionDistance > 0.5 && motionProgress < 1;
    const travelPulse = isMoving ? Math.sin(Math.PI * motionProgress) : 0;
    const landPhase = isMoving && motionProgress > 0.62 ? clamp01((motionProgress - 0.62) / 0.38) : 0;
    const landPulse = landPhase > 0 ? Math.sin(Math.PI * landPhase) : 0;
    const motionUnitX = motionDistance > 0 ? motionDx / motionDistance : 0;
    const motionUnitY = motionDistance > 0 ? motionDy / motionDistance : 0;
    const glyphLean = (motionUnitX - motionUnitY) * travelPulse * 0.1;
    const impactScaleX = 1 + travelPulse * 0.08 + landPulse * 0.1;
    const impactScaleY = 1 - travelPulse * 0.06 - landPulse * 0.12;
    view.visualRoot.scale.set(isMoving ? 1 + travelPulse * 0.24 : 1, isMoving ? 1 - travelPulse * 0.16 : 1);
    view.glyph.rotation = isMoving ? glyphLean : 0;
    view.glyph.scale.set(isMoving ? impactScaleX : 1, isMoving ? impactScaleY : 1);
    view.glyph.y = getCellSize() / 2 - travelPulse * getCellSize() * 0.08;
  }

  private ensureLocalPlayerFallback(localPlayerId: string, localPlayerX: number, localPlayerY: number, localPlayerChar: string, exists: boolean): void {
    if (exists || !Number.isFinite(localPlayerX) || !Number.isFinite(localPlayerY)) {
      const fallback = this.entities.get(this.localPlayerFallbackId);
      if (fallback) {
        fallback.root.destroy({ children: true });
        this.entities.delete(this.localPlayerFallbackId);
      }
      return;
    }
    const cellSize = getCellSize();
    const fallbackEntity: ObservedMapEntity = {
      id: this.localPlayerFallbackId,
      wx: localPlayerX,
      wy: localPlayerY,
      char: localPlayerChar || translateUi('map-render.local-player-char', undefined),
      color: '#fff4dc',
      kind: 'player',
      name: resolveEntityFallbackLabel('player'),
    };
    let view = this.entities.get(this.localPlayerFallbackId);
    if (!view) {
      view = this.createEntityView(fallbackEntity, localPlayerX * cellSize, localPlayerY * cellSize);
      this.entities.set(this.localPlayerFallbackId, view);
      this.entityLayer.addChild(view.root);
    }
    Object.assign(view.anim, fallbackEntity, {
      id: this.localPlayerFallbackId,
      gridX: localPlayerX,
      gridY: localPlayerY,
      oldWX: localPlayerX * cellSize,
      oldWY: localPlayerY * cellSize,
      targetWX: localPlayerX * cellSize,
      targetWY: localPlayerY * cellSize,
    });
    view.root.position.set(localPlayerX * cellSize, localPlayerY * cellSize);
    this.patchEntityStatic(view);
    view.root.visible = true;
  }

  private rebuildFormationRangeVisualCacheIfNeeded(): void {
    for (const view of this.entities.values()) {
      const anim = view.anim;
      view.hiddenByFormation = anim.kind === 'formation' && anim.formationEyeVisibleWithoutSenseQi !== true;
    }
    const signature = buildFormationRangeSignature([...this.entities.values()].map((view) => view.anim));
    if (signature === this.formationRangeSignature) return;
    this.formationRangeSignature = signature;
    this.formationRangeVisuals.clear();
    this.formationRangeSenseQiVisuals.clear();
    for (const view of this.entities.values()) {
      const anim = view.anim;
      if (anim.kind !== 'formation' || !Number.isFinite(Number(anim.formationRadius)) || anim.formationActive === false) continue;
      const radius = Math.max(1, Math.trunc(Number(anim.formationRadius) || 0));
      for (let gy = anim.gridY - radius; gy <= anim.gridY + radius; gy += 1) {
        for (let gx = anim.gridX - radius; gx <= anim.gridX + radius; gx += 1) {
          if (!isTileInsideFormationRange(anim, gx, gy)) continue;
          const key = `${gx},${gy}`;
          if (anim.formationBlocksBoundary === true && isTileOnFormationBoundary(anim, gx, gy)) {
            const boundaryVisual: FormationRangeVisual = {
              highlightColor: anim.formationBoundaryRangeHighlightColor ?? anim.formationBoundaryColor ?? anim.formationRangeHighlightColor ?? anim.color,
              boundary: true,
              boundaryChar: anim.formationBoundaryChar,
              boundaryColor: anim.formationBoundaryColor ?? anim.color,
            };
            this.formationRangeSenseQiVisuals.set(key, boundaryVisual);
            if (anim.formationBoundaryVisibleWithoutSenseQi === true) this.formationRangeVisuals.set(key, boundaryVisual);
            continue;
          }
          const rangeVisual: FormationRangeVisual = {
            highlightColor: anim.formationRangeHighlightColor ?? anim.color,
            boundary: false,
            boundaryColor: anim.color,
          };
          if (!this.formationRangeSenseQiVisuals.has(key)) this.formationRangeSenseQiVisuals.set(key, rangeVisual);
          if (anim.formationRangeVisibleWithoutSenseQi === true && !this.formationRangeVisuals.has(key)) this.formationRangeVisuals.set(key, rangeVisual);
        }
      }
    }
  }

  private renderThreatArrows(): void {
    const graphics = this.threatArrowGraphics;
    graphics.clear();
    const cellSize = getCellSize();
    for (const arrow of this.threatArrows) {
      const from = this.resolveThreatEntityView(arrow.ownerId);
      const to = this.resolveThreatEntityView(arrow.targetId);
      if (!from || !to) continue;
      const startX = from.root.x + cellSize / 2;
      const startY = from.root.y + cellSize / 2;
      const endX = to.root.x + cellSize / 2;
      const endY = to.root.y + cellSize / 2;
      const self = from.anim.kind === 'player';
      graphics.moveTo(startX, startY)
        .quadraticCurveTo((startX + endX) / 2, Math.min(startY, endY) - cellSize * 0.5, endX, endY)
        .stroke({ color: parseColor(self ? SELF_THREAT_ARROW_GLOW : OTHER_THREAT_ARROW_GLOW), alpha: parseAlpha(self ? SELF_THREAT_ARROW_GLOW : OTHER_THREAT_ARROW_GLOW, 1), width: Math.max(2, cellSize * 0.07) });
      graphics.moveTo(startX, startY)
        .quadraticCurveTo((startX + endX) / 2, Math.min(startY, endY) - cellSize * 0.5, endX, endY)
        .stroke({ color: parseColor(self ? SELF_THREAT_ARROW_COLOR : OTHER_THREAT_ARROW_COLOR), alpha: 0.98, width: Math.max(0.75, cellSize * 0.02) });
    }
  }

  private resolveThreatEntityView(id: string): EntityView | undefined {
    return this.entities.get(id) ?? [...this.entities.values()].find((view) => view.anim.id === id);
  }

  private addFloatingText(
    x: number,
    y: number,
    text: string,
    color = '#ffd27a',
    variant: 'damage' | 'action' = 'damage',
    actionStyle?: FloatingActionTextStyle,
    durationMs?: number,
  ): void {
    const cellSize = getCellSize();
    const label = new Text({
      text,
      style: textStyle(variant === 'action' ? 'floatingAction' : 'floatingDamage', variant === 'action' ? Math.max(10, cellSize * 0.28) : Math.max(14, cellSize * 0.45), color, 'rgba(15,12,10,0.95)', 3),
      anchor: variant === 'action' ? { x: 0, y: 0 } : { x: 0.5, y: 1 },
    });
    this.effectLayer.addChild(label);
    this.floatingTexts.push({
      id: this.nextEffectId++,
      x,
      y,
      text: label,
      variant,
      actionStyle,
      createdAt: performance.now(),
      duration: durationMs ?? (variant === 'action' ? 1000 : 850),
    });
    if (this.floatingTexts.length > MAX_FLOATING_TEXTS) this.floatingTexts.splice(0, this.floatingTexts.length - MAX_FLOATING_TEXTS);
  }

  private addAttackTrail(fromX: number, fromY: number, toX: number, toY: number, color = '#ffd27a'): void {
    const cellSize = getCellSize();
    const graphics = new Graphics();
    const sx = fromX * cellSize + cellSize / 2;
    const sy = fromY * cellSize + cellSize / 2;
    const ex = toX * cellSize + cellSize / 2;
    const ey = toY * cellSize + cellSize / 2;
    graphics.moveTo(sx, sy).lineTo(ex, ey).stroke({ color: parseColor(color), width: Math.max(2, cellSize * 0.09) });
    this.effectLayer.addChild(graphics);
    this.attackTrails.push({ id: this.nextEffectId++, graphics, createdAt: performance.now(), duration: 260 });
    if (this.attackTrails.length > MAX_ATTACK_TRAILS) this.attackTrails.splice(0, this.attackTrails.length - MAX_ATTACK_TRAILS);
  }

  private addWarningZone(cells: GridPoint[], color = '#ff2a2a', durationMs = DEFAULT_WARNING_ZONE_DURATION_MS, baseColor?: string, originX?: number, originY?: number): void {
    if (cells.length === 0) return;
    const origin = {
      x: Number.isFinite(originX) ? Math.round(originX ?? 0) : Math.round(cells.reduce((sum, cell) => sum + cell.x, 0) / cells.length),
      y: Number.isFinite(originY) ? Math.round(originY ?? 0) : Math.round(cells.reduce((sum, cell) => sum + cell.y, 0) / cells.length),
    };
    const distances = cells.map((cell) => Math.max(Math.abs(cell.x - origin.x), Math.abs(cell.y - origin.y)));
    const minDistance = Math.min(...distances);
    const zoneCells = cells.map((cell, index) => ({ ...cell, expandDistance: distances[index] - minDistance }));
    const graphics = new Graphics();
    this.effectLayer.addChild(graphics);
    this.warningZones.push({
      id: this.nextEffectId++,
      cells: zoneCells,
      color,
      baseColor: baseColor ?? color,
      createdAt: performance.now(),
      duration: Math.max(1, Math.round(durationMs)),
      maxExpandDistance: Math.max(...zoneCells.map((cell) => cell.expandDistance)),
      graphics,
    });
    if (this.warningZones.length > MAX_WARNING_ZONES) this.warningZones.splice(0, this.warningZones.length - MAX_WARNING_ZONES);
  }

  private updateEffects(camera: CameraState): void {
    void camera;
    const now = performance.now();
    const cellSize = getCellSize();
    this.floatingTexts = this.floatingTexts.filter((entry) => {
      const progress = (now - entry.createdAt) / entry.duration;
      if (progress >= 1) {
        entry.text.destroy();
        return false;
      }
      const rise = entry.variant === 'action' ? cellSize * (0.08 + progress * 0.46) : cellSize * (0.2 + progress * 0.8);
      entry.text.alpha = entry.actionStyle === 'divine' ? 1 - Math.max(0, (progress - 0.86) / 0.14) : 1 - progress;
      entry.text.position.set(entry.x * cellSize + cellSize / 2, entry.y * cellSize - rise);
      return true;
    });
    this.attackTrails = this.attackTrails.filter((entry) => {
      const progress = (now - entry.createdAt) / entry.duration;
      if (progress >= 1) {
        entry.graphics.destroy();
        return false;
      }
      entry.graphics.alpha = 1 - progress * 0.85;
      return true;
    });
    this.warningZones = this.warningZones.filter((zone) => {
      const progress = (now - zone.createdAt) / zone.duration;
      if (progress >= 1) {
        zone.graphics.destroy();
        return false;
      }
      zone.graphics.clear();
      const revealDistance = progress * (zone.maxExpandDistance + 1);
      for (const cell of zone.cells) {
        const sx = cell.x * cellSize;
        const sy = cell.y * cellSize;
        zone.graphics.rect(sx + 1, sy + 1, cellSize - 2, cellSize - 2).fill({ color: parseColor(zone.baseColor), alpha: 0.1 });
        if (cell.expandDistance <= revealDistance) {
          zone.graphics.rect(sx + 1, sy + 1, cellSize - 2, cellSize - 2).fill({ color: parseColor(zone.color), alpha: 0.18 * (1 - progress * 0.7) });
          zone.graphics.rect(sx + 1.5, sy + 1.5, cellSize - 3, cellSize - 3).stroke({ color: parseColor(zone.color), alpha: 0.72 * (1 - progress * 0.7), width: Math.max(1.35, cellSize * 0.09) });
        }
      }
      return true;
    });
  }

  private getFadingPathAlpha(now: number): number {
    if (!this.fadingPath) return 0;
    const progress = (now - this.fadingPath.startedAt) / this.fadingPath.durationMs;
    if (progress >= 1) {
      this.fadingPath = null;
      return 0;
    }
    return 1 - progress;
  }

  private renderTimeOverlay(time: GameTimeState | null): void {
    const graphics = this.timeOverlayGraphics;
    graphics.clear();
    if (!time) return;
    const atmosphere = this.resolveTimeAtmosphere(time);
    if (atmosphere.overlay[3] > 0.001) {
      graphics.rect(0, 0, this.width, this.height).fill({ color: (atmosphere.overlay[0] << 16) | (atmosphere.overlay[1] << 8) | atmosphere.overlay[2], alpha: atmosphere.overlay[3] });
    }
    if (atmosphere.vignetteAlpha > 0.001) {
      graphics.rect(0, 0, this.width, this.height).stroke({ color: 0x050408, alpha: atmosphere.vignetteAlpha, width: Math.max(this.width, this.height) * 0.08 });
    }
  }

  private resolveTimeAtmosphere(time: GameTimeState): TimeAtmosphereState {
    const profile = TIME_ATMOSPHERE_PROFILES[time.phase];
    const target: TimeAtmosphereState = {
      initialized: true,
      overlay: this.buildRgbaVector(time.tint, Math.max(0, Math.min(1, time.overlayAlpha * profile.overlayBoost))),
      sky: this.buildRgbaVector(profile.skyTint, profile.skyAlpha),
      horizon: this.buildRgbaVector(profile.horizonTint, profile.horizonAlpha),
      vignetteAlpha: profile.vignetteAlpha,
    };
    if (!this.timeAtmosphere.initialized) {
      this.timeAtmosphere = target;
      return this.timeAtmosphere;
    }
    this.timeAtmosphere.overlay = this.lerpColorVector(this.timeAtmosphere.overlay, target.overlay, TIME_FILTER_LERP);
    this.timeAtmosphere.sky = this.lerpColorVector(this.timeAtmosphere.sky, target.sky, TIME_FILTER_LERP);
    this.timeAtmosphere.horizon = this.lerpColorVector(this.timeAtmosphere.horizon, target.horizon, TIME_FILTER_LERP);
    this.timeAtmosphere.vignetteAlpha += (target.vignetteAlpha - this.timeAtmosphere.vignetteAlpha) * TIME_FILTER_LERP;
    return this.timeAtmosphere;
  }

  private buildRgbaVector(hex: string, alpha: number): [number, number, number, number] {
    const value = hex.trim().replace('#', '');
    const normalized = value.length === 3 ? value.split('').map((char) => char + char).join('') : value.padEnd(6, '0').slice(0, 6);
    return [
      Number.parseInt(normalized.slice(0, 2), 16) || 0,
      Number.parseInt(normalized.slice(2, 4), 16) || 0,
      Number.parseInt(normalized.slice(4, 6), 16) || 0,
      clamp01(alpha),
    ];
  }

  private lerpColorVector(current: [number, number, number, number], target: [number, number, number, number], factor: number): [number, number, number, number] {
    return [
      Math.round(current[0] + (target[0] - current[0]) * factor),
      Math.round(current[1] + (target[1] - current[1]) * factor),
      Math.round(current[2] + (target[2] - current[2]) * factor),
      current[3] + (target[3] - current[3]) * factor,
    ];
  }

  private refreshProfileState(): void {
    if (!this.profileEnabled) {
      if (this.profileState && typeof window !== 'undefined') {
        delete window.__mudPixiProfile;
        delete window.__mudPixiProfileReset;
      }
      this.profileState = null;
      return;
    }
    if (this.profileState) return;
    if (!this.profileWindow) {
      this.profileWindow = new PixiProfilerWindow();
      this.profileWindow.mount();
    }
    this.profileState = {
      startedAt: performance.now(),
      lastPublishedAt: 0,
      frameIndex: 0,
      metrics: createPixiProfileMetrics(),
      counters: createPixiProfileCounters(),
      frameMetrics: createPixiProfileFrameMetrics(),
      frameCounters: createPixiProfileFrameCounters(),
    };
    if (typeof window !== 'undefined') {
      window.__mudPixiProfileReset = () => this.resetProfileState();
    }
  }

  private resetProfileState(): void {
    if (!this.profileEnabled) {
      this.profileState = null;
      return;
    }
    this.profileState = {
      startedAt: performance.now(),
      lastPublishedAt: 0,
      frameIndex: 0,
      metrics: createPixiProfileMetrics(),
      counters: createPixiProfileCounters(),
      frameMetrics: createPixiProfileFrameMetrics(),
      frameCounters: createPixiProfileFrameCounters(),
    };
    this.profileWindow?.reset();
    this.publishProfileIfNeeded(true);
  }

  private profileStart(): number {
    return this.profileState ? performance.now() : 0;
  }

  private profileEnd(key: PixiProfileMetricKey, startedAt: number): void {
    const state = this.profileState;
    if (!state || startedAt <= 0) return;
    const elapsed = performance.now() - startedAt;
    const metric = state.metrics[key];
    metric.count += 1;
    metric.totalMs += elapsed;
    metric.maxMs = Math.max(metric.maxMs, elapsed);
    metric.lastMs = elapsed;
    state.frameMetrics[key] += elapsed;
  }

  private profileMeasure<T>(key: PixiProfileMetricKey, callback: () => T): T {
    const startedAt = this.profileStart();
    try {
      return callback();
    } finally {
      this.profileEnd(key, startedAt);
    }
  }

  private profileCount(key: PixiProfileCounterKey, count = 1): void {
    const state = this.profileState;
    if (!state) return;
    state.counters[key] += count;
    state.frameCounters[key] += count;
  }

  private profileSetCounter(key: PixiProfileCounterKey, count: number): void {
    const state = this.profileState;
    if (!state) return;
    state.counters[key] = count;
    state.frameCounters[key] = count;
  }

  private recordProfileFrame(): void {
    const state = this.profileState;
    if (!state) return;
    state.frameIndex += 1;
    const renderer = this.buildProfileRendererState();
    const sample: PixiProfileFrameSample = {
      index: state.frameIndex,
      atMs: performance.now(),
      totalMs: state.frameMetrics.renderFrame,
      metrics: { ...state.frameMetrics },
      counters: { ...state.frameCounters },
      renderer,
    };
    this.profileWindow?.recordFrame(sample);
    state.frameMetrics = createPixiProfileFrameMetrics();
    state.frameCounters = createPixiProfileFrameCounters();
  }

  private buildProfileRendererState(): PixiProfileSnapshot['renderer'] {
    let cachedTerrainChunks = 0;
    let terrainChunkChildren = 0;
    for (const chunk of this.terrainChunks.values()) {
      terrainChunkChildren += chunk.container.children.length;
      if (chunk.container.isCachedAsTexture) cachedTerrainChunks += 1;
    }
    return {
      terrainChunks: this.terrainChunks.size,
      cachedTerrainChunks,
      terrainChunkChildren,
      entities: this.entities.size,
      runtimeTileTextures: this.runtimeTileTextures.size,
      runtimeTileManifestState: this.runtimeTileManifestState,
      backbufferWidth: this.width,
      backbufferHeight: this.height,
      backbufferPixels: this.width * this.height,
    };
  }

  private publishProfileIfNeeded(force = false): void {
    const state = this.profileState;
    if (!state || typeof window === 'undefined') return;
    const now = performance.now();
    if (!force && now - state.lastPublishedAt < PIXI_PROFILE_LOG_INTERVAL_MS) return;
    state.lastPublishedAt = now;
    const metrics = Object.fromEntries(PIXI_PROFILE_METRIC_KEYS.map((key) => {
      const metric = state.metrics[key];
      return [key, {
        count: metric.count,
        totalMs: Number(metric.totalMs.toFixed(3)),
        maxMs: Number(metric.maxMs.toFixed(3)),
        lastMs: Number(metric.lastMs.toFixed(3)),
        avgMs: metric.count > 0 ? Number((metric.totalMs / metric.count).toFixed(3)) : 0,
      }];
    })) as PixiProfileSnapshot['metrics'];
    const snapshot: PixiProfileSnapshot = {
      enabled: true,
      startedAt: state.startedAt,
      elapsedMs: Number((now - state.startedAt).toFixed(3)),
      metrics,
      counters: { ...state.counters },
      renderer: this.buildProfileRendererState(),
    };
    window.__mudPixiProfile = snapshot;
    console.table(Object.fromEntries(PIXI_PROFILE_METRIC_KEYS.map((key) => [key, metrics[key]])));
    console.info('[map] Pixi profile counters', snapshot.counters, snapshot.renderer);
  }

  private resolveActionTextStyle(effect: Extract<CombatEffect, { type: 'float' }>): FloatingActionTextStyle | undefined {
    if (effect.variant !== 'action') return undefined;
    if (effect.actionStyle) return effect.actionStyle;
    return isLocalDivineSkillName(effect.text) ? 'divine' : 'default';
  }
}

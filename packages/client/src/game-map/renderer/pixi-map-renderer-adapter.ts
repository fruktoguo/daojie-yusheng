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
import { buildEntitySpriteLookupPlan, type EntitySpriteTransform } from '../../entity-facing';
import { getEntityBadgeClassName, getMonsterPresentation } from '../../monster-presentation';
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
  type PixiProfileFrameSchedule,
  type PixiProfileMetricKey,
  type PixiProfileSnapshot,
  type PixiProfileState,
} from './pixi-profiler-window';
import { normalizeRuntimeImagePackVersion, resolveRuntimeImagePackAssetUrl } from '../../renderer/runtime-image-pack-url';
import {
  consumeBrowserProfileFrameDiagnostics,
  consumeRuntimeProfileFrameMetrics,
  resetRuntimeProfileFrameMetrics,
  setRuntimeProfilerEnabled,
} from '../../debug/runtime-profiler';

type PixiRenderer = Renderer<HTMLCanvasElement>;
type FloatingActionTextStyle = 'default' | 'divine' | 'chant';

interface TerrainChunkView {
  key: string;
  cx: number;
  cy: number;
  baseContainer: Container;
  spriteContainer: Container;
  edgeContainer: Container;
  glyphContainer: Container;
  overlayContainer: Container;
  staticSignature: string;
  overlaySignature: string;
  staticSignatureDeps: TerrainChunkStaticSignatureDeps | null;
  overlaySignatureDeps: TerrainChunkOverlaySignatureDeps | null;
  lastSeenFrame: number;
}

interface TerrainChunkStaticSignatureDeps {
  cellSize: number;
  renderRuntimeTileSprites: boolean;
  terrainTextMode: boolean;
  runtimeTileSpriteRevision: number;
  terrainChunkRevision: number;
}

interface TerrainChunkOverlaySignatureDeps {
  cellSize: number;
  terrainOverlaySignature: string;
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

type EntityNameplateBadge = NonNullable<ObservedMapEntity['badge']>;

type RuntimeEntitySpriteSelection = {
  ref: PixiTileSpriteRef;
  transform: EntitySpriteTransform;
};

const IDENTITY_ENTITY_SPRITE_TRANSFORM: EntitySpriteTransform = {
  flipX: false,
};
const ENTITY_FACING_FLIP_TRANSITION_MS = 160;
const ATTACK_MOTION_DURATION_MS = 180;
const ARTIFACT_AURA_COLOR = 0xa8fbff;
const ARTIFACT_AURA_FLOW_MS = 1200;

function easeInOutCubic(t: number): number {
  const value = clamp01(t);
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

interface EntityView {
  anim: AnimEntity;
  root: Container;
  visualRoot: Container;
  artifactAura: Graphics;
  shadow: Graphics;
  image: Sprite;
  glyph: Text;
  label: Text;
  badgeLayer: Container;
  hpBar: Graphics;
  progressBar: Graphics;
  buffLayer: Container;
  questMarker: Container;
  formationMarker: Graphics;
  respawnLabel: Text;
  staticSignature: string;
  hiddenByFormation: boolean;
  imageBaseScaleX: number;
  imageBaseScaleY: number;
  imageFlipSourceSign: number;
  imageFlipTargetSign: number;
  imageFlipStartedAt: number;
  attackMotionStartedAt?: number;
  attackMotionUnitX?: number;
  attackMotionUnitY?: number;
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

interface FloatingTextBurstOffset {
  offsetX: number;
  offsetY: number;
}

interface AttackTrailEffect {
  id: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
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
  insetRatio: number;
  fit: 'cover' | 'contain';
  zIndex: number;
  order: number;
  renderOrder: number;
  dualGrid: boolean;
}

type RuntimeTileSpriteManifest = {
  version?: unknown;
  defaults?: {
    tile?: Record<string, unknown>;
  };
  tiles?: Record<string, unknown>;
  legacyTiles?: Record<string, unknown>;
  entities?: Record<string, unknown>;
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
const ATTACK_TRAIL_REACH_MS = 110;
const ATTACK_TRAIL_HOLD_MS = 200;
const ATTACK_TRAIL_FADE_MS = 170;
const ATTACK_TRAIL_DURATION_MS = ATTACK_TRAIL_REACH_MS + ATTACK_TRAIL_HOLD_MS + ATTACK_TRAIL_FADE_MS;
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

function buildTargetingOverlaySignature(state: MapSceneSnapshot['overlays']['targeting']): string {
  if (!state) return 'targeting:null';
  return [
    state.originX,
    state.originY,
    state.range,
    state.visibleOnly === true ? 1 : 0,
    state.shape ?? '',
    state.radius ?? '',
    state.hoverX ?? '',
    state.hoverY ?? '',
    buildGridPointSignature(state.affectedCells),
  ].join('|');
}

function buildSenseQiHoverSignature(state: MapSceneSnapshot['overlays']['senseQi']): string {
  if (!state || typeof state.hoverX !== 'number' || typeof state.hoverY !== 'number') return 'sense-hover:null';
  return `${state.hoverX},${state.hoverY}`;
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

function resolveEntityBadgePalette(badge: EntityNameplateBadge): {
  fill: string;
  stroke: string;
  text: string;
} {
  const badgeClassName = getEntityBadgeClassName(badge);
  if (badge.tone === 'sect') {
    return {
      fill: 'rgba(151, 83, 28, 0.92)',
      stroke: 'rgba(255, 198, 128, 0.86)',
      text: '#fff6eb',
    };
  }
  const fill = badgeClassName?.includes('--boss') || badge.tone === 'demonic'
    ? 'rgba(120, 32, 24, 0.92)'
    : 'rgba(42, 54, 91, 0.92)';
  const stroke = badgeClassName?.includes('--boss')
    ? 'rgba(255, 188, 156, 0.86)'
    : badge.tone === 'demonic'
      ? 'rgba(255, 151, 151, 0.84)'
      : 'rgba(185, 211, 255, 0.82)';
  return {
    fill,
    stroke,
    text: '#fff6eb',
  };
}

function resolveNameplateBadges(
  badges: ObservedMapEntity['badges'] | null | undefined,
  badge: ObservedMapEntity['badge'] | null | undefined,
  fallbackBadge: ObservedMapEntity['badge'] | null | undefined,
): EntityNameplateBadge[] {
  const source = Array.isArray(badges) && badges.length > 0
    ? badges
    : badge
      ? [badge]
      : fallbackBadge
        ? [fallbackBadge]
        : [];
  return source.filter((entry): entry is EntityNameplateBadge => (
    typeof entry?.text === 'string' && entry.text.trim().length > 0
  ));
}

function buildNameplateBadgeSignature(badges: readonly EntityNameplateBadge[]): string {
  return badges.map((badge) => `${badge.text}:${badge.tone ?? ''}`).join(',');
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
  if (Number.isFinite(numeric)) return numeric;
  return normalizeTileSpriteZIndex(value, key);
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
    src: resolveRuntimeImagePackAssetUrl(manifestUrl, value.src, version),
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

function normalizePixiTileSpriteMap(
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

function pickRuntimeEntitySpriteSelection(
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
    for (const item of pile.items) {
      signature += `,${item.itemKey}:${item.itemId}:${item.type}:${item.count}:${item.groundLabel ?? ''}:${item.grade ?? ''}:${item.enhanceLevel ?? ''}:${item.name}`;
    }
  }
  return signature;
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
  private readonly terrainBaseLayer = new Container();
  private readonly terrainSpriteLayer = new Container();
  private readonly terrainEdgeLayer = new Container();
  private readonly terrainGlyphLayer = new Container();
  private readonly terrainOverlayLayer = new Container();
  private readonly terrainFogLayer = new Graphics();
  private readonly pathLayer = new Container();
  private readonly interactionOverlayGraphics = new Graphics();
  private readonly targetingGraphics = new Graphics();
  private readonly senseQiHoverGraphics = new Graphics();
  private readonly groundLayer = new Container();
  private readonly threatArrowLayer = new Container();
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
  private terrainFogSignature = '';
  private canvas: HTMLCanvasElement | null = null;
  private ready = false;
  private width = 1;
  private height = 1;
  private chunkFrame = 0;
  private lastVisibleTileRevision = -1;
  private lastEntityMotionToken?: number;
  private formationRangeSignature = '';
  private terrainOverlaySignature = '';
  private groundPileSignature = '';
  private interactionOverlaySignature = '';
  private targetingOverlaySignature = '';
  private senseQiHoverSignature = '';
  private pathLayerSignature = '';
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
  private runtimeTileSpriteRefCache = new WeakMap<Tile, PixiTileSpriteRef | null>();
  private readonly dualGridCellRefsScratch: Array<PixiTileSpriteRef | null> = [];
  private readonly dualGridVertexRefsScratch: Array<PixiTileSpriteRef | null> = [null, null, null, null];
  private readonly dualGridVertexMasksScratch: number[] = [0, 0, 0, 0];
  private runtimeAtlasTextures = new Map<string, Texture>();
  private runtimeTileTextures = new Map<string, Texture>();
  private runtimeTileTextureRequests = new Set<string>();
  private runtimeEntitySpriteRefs = new Map<string, PixiTileSpriteRef>();
  private runtimeEntityTextures = new Map<string, Texture>();
  private runtimeEntityTextureRequests = new Set<string>();
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
    setRuntimeProfilerEnabled(false);
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
    const previous = this.performanceConfig;
    const previousRenderRuntimeTileSprites = previous.renderRuntimeTileSprites;
    const entityTextModeChanged = previous.npcTextMode !== config.npcTextMode
      || previous.monsterTextMode !== config.monsterTextMode
      || previous.herbTextMode !== config.herbTextMode;
    this.performanceConfig = { ...config };
    this.setProfileEnabled(config.showPixiProfiler);
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
    this.profileMeasure('worldOverlays', () => {
      this.rebuildWorldOverlays(scene);
      this.rebuildInteractionOverlayLayer(scene);
      this.rebuildTargetingLayer(scene);
      this.rebuildSenseQiHoverLayer(scene);
    });
    this.profileEnd('syncScene', startedAt);
  }

  enqueueEffect(effect: CombatEffect): void {
    if (effect.type === 'attack') {
      this.triggerAttackMotion(effect.fromX, effect.fromY, effect.toX, effect.toY);
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
    for (const chunk of this.terrainChunks.values()) this.destroyTerrainChunk(chunk);
    this.terrainChunks.clear();
    for (const view of this.entities.values()) view.root.destroy({ children: true });
    this.entities.clear();
    this.pathCells = [];
    this.fadingPath = null;
    this.threatArrows = [];
    this.pathGraphics.clear();
    this.terrainFogLayer.clear();
    this.clearContainer(this.groundLayer);
    this.clearContainer(this.effectLayer);
    this.threatArrowGraphics.clear();
    this.interactionOverlayGraphics.clear();
    this.targetingGraphics.clear();
    this.senseQiHoverGraphics.clear();
    this.timeOverlayGraphics.clear();
    this.floatingTexts = [];
    this.attackTrails = [];
    this.warningZones = [];
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
    this.lastVisibleTileRevision = -1;
    this.timeAtmosphere.initialized = false;
    this.resetProfileState();
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
    const renderMethodStartedAt = performance.now();
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
    const activeSchedule: PixiProfileFrameSchedule = {
      ...schedule,
      rafCallbackActiveMs: Math.max(
        schedule.rafCallbackPreRenderMs,
        schedule.rafCallbackPreRenderMs + Math.max(0, performance.now() - renderMethodStartedAt),
      ),
    };
    this.recordProfileFrame(frameAtMs, activeSchedule);
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
    for (const chunk of this.terrainChunks.values()) {
      chunk.staticSignature = '';
      chunk.overlaySignature = '';
    }
  }

  private setProfileEnabled(enabled: boolean): void {
    if (this.profileEnabled === enabled) return;
    this.profileEnabled = enabled;
    setRuntimeProfilerEnabled(enabled);
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
      this.runtimeTileSpriteRefs = new Map(sortedRefs);
      this.runtimeLegacyTileKeys = normalizeLegacyTileMap(manifest.legacyTiles);
      this.runtimeTileSpriteRefCache = new WeakMap<Tile, PixiTileSpriteRef | null>();
      this.runtimeEntitySpriteRefs = normalizePixiTileSpriteMap(
        manifest.entities,
        DEFAULT_RUNTIME_IMAGE_PACK_MANIFEST_URL,
        version,
      );
      this.runtimeTileManifestState = 'loaded';
      this.runtimeAtlasTextures.clear();
      this.runtimeTileTextures.clear();
      this.runtimeEntityTextures.clear();
      this.runtimeTileSpriteRevision += 1;
      this.invalidateTerrainChunks();
      this.invalidateEntityStaticViews();
    } catch (error) {
      this.runtimeTileManifestState = 'error';
      this.runtimeTileSpriteRevision += 1;
      this.invalidateTerrainChunks();
      this.invalidateEntityStaticViews();
      console.warn('[map] failed to load Pixi runtime tile sprites', error);
    }
  }

  private getRuntimeAtlasTexture(src: string): Texture | null {
    const atlas = this.runtimeAtlasTextures.get(src);
    if (!atlas) return null;
    if (atlas.destroyed || atlas === Texture.EMPTY || atlas.width <= 0 || atlas.height <= 0) {
      this.runtimeAtlasTextures.delete(src);
      return null;
    }
    return atlas;
  }

  private rememberRuntimeAtlasTexture(src: string, loaded: unknown): boolean {
    if (!(loaded instanceof Texture) || loaded === Texture.EMPTY || loaded.width <= 0 || loaded.height <= 0) {
      this.runtimeAtlasTextures.delete(src);
      return false;
    }
    this.runtimeAtlasTextures.set(src, loaded);
    return true;
  }

  private invalidateEntityStaticViews(): void {
    for (const view of this.entities.values()) {
      view.staticSignature = '';
    }
  }

  private resolveRuntimeTileSpriteRef(tile: Tile): PixiTileSpriteRef | null {
    if (!this.performanceConfig.renderRuntimeTileSprites || this.performanceConfig.terrainTextMode || this.runtimeTileManifestState !== 'loaded') return null;
    const cached = this.runtimeTileSpriteRefCache.get(tile);
    if (cached !== undefined) {
      return cached;
    }
    const key = resolveTopTileSpriteKey(tile, this.runtimeLegacyTileKeys);
    const ref = key ? this.runtimeTileSpriteRefs.get(key) ?? null : null;
    this.runtimeTileSpriteRefCache.set(tile, ref);
    return ref;
  }

  private resolveRuntimeDualGridRef(tile: Tile | null | undefined): PixiTileSpriteRef | null {
    if (!tile) return null;
    const ref = this.resolveRuntimeTileSpriteRef(tile);
    return ref?.dualGrid ? ref : null;
  }

  private getRuntimeTileTexture(ref: PixiTileSpriteRef, sourceMask = 15, quad?: { x: number; y: number; sourceW: number; sourceH: number }): Texture | null {
    const coords = ref.dualGrid ? DUAL_GRID_ATLAS_COORDS[sourceMask] : undefined;
    const frameCol = Math.min(ref.cols - 1, ref.col + (coords?.[0] ?? 0));
    const frameRow = Math.min(ref.rows - 1, ref.row + (coords?.[1] ?? 0));
    const cacheKey = `${ref.key}:${ref.src}:${frameCol}:${frameRow}:${ref.colSpan}:${ref.rowSpan}:${sourceMask}:${quad?.x ?? ''}:${quad?.y ?? ''}:${quad?.sourceW ?? ''}:${quad?.sourceH ?? ''}`;
    const cached = this.runtimeTileTextures.get(cacheKey);
    if (cached && !cached.destroyed) return cached;
    const atlas = this.getRuntimeAtlasTexture(ref.src);
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
    this.runtimeTileTextures.set(cacheKey, texture);
    return texture;
  }

  private requestRuntimeTileTexture(ref: PixiTileSpriteRef): void {
    if (this.runtimeTileTextureRequests.has(ref.src)) return;
    this.runtimeTileTextureRequests.add(ref.src);
    void Assets.load<Texture>(ref.src).then((texture) => {
      this.runtimeTileTextureRequests.delete(ref.src);
      this.rememberRuntimeAtlasTexture(ref.src, texture);
      this.runtimeTileSpriteRevision += 1;
      this.invalidateTerrainChunks();
    }).catch((error) => {
      this.runtimeTileTextureRequests.delete(ref.src);
      console.warn('[map] failed to load Pixi runtime tile texture', ref.src, error);
    });
  }

  private resolveRuntimeEntitySpriteSelection(entity: Pick<ObservedMapEntity, 'id' | 'kind' | 'name' | 'char' | 'facing' | 'monsterId'>): RuntimeEntitySpriteSelection | null {
    if (this.runtimeTileManifestState !== 'loaded') return null;
    return pickRuntimeEntitySpriteSelection(entity, this.runtimeEntitySpriteRefs);
  }

  private getRuntimeEntityTexture(ref: PixiTileSpriteRef): Texture | null {
    const frameCol = Math.min(ref.cols - 1, ref.col);
    const frameRow = Math.min(ref.rows - 1, ref.row);
    const cacheKey = `${ref.key}:${ref.src}:${frameCol}:${frameRow}:${ref.colSpan}:${ref.rowSpan}`;
    const cached = this.runtimeEntityTextures.get(cacheKey);
    if (cached && !cached.destroyed) return cached;
    const atlas = this.getRuntimeAtlasTexture(ref.src);
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
    this.runtimeEntityTextures.set(cacheKey, texture);
    return texture;
  }

  private requestRuntimeEntityTexture(ref: PixiTileSpriteRef): void {
    if (this.runtimeEntityTextureRequests.has(ref.src)) return;
    this.runtimeEntityTextureRequests.add(ref.src);
    void Assets.load<Texture>(ref.src).then((texture) => {
      this.runtimeEntityTextureRequests.delete(ref.src);
      this.rememberRuntimeAtlasTexture(ref.src, texture);
      this.runtimeTileSpriteRevision += 1;
      this.invalidateEntityStaticViews();
    }).catch((error) => {
      this.runtimeEntityTextureRequests.delete(ref.src);
      console.warn('[map] failed to load Pixi runtime entity texture', ref.src, error);
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
    const atlas = this.getRuntimeAtlasTexture(ref.src);
    if (!atlas) {
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

  private collectDualGridVertexRef(
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

  private drawRuntimeDualGridEdges(
    chunkContainer: Container,
    scene: MapSceneSnapshot,
    startX: number,
    startY: number,
    cellSize: number,
  ): void {
    if (!this.performanceConfig.renderRuntimeTileSprites || this.runtimeTileManifestState !== 'loaded') return;
    if (this.runtimeTileSpriteRefs.size === 0) return;
    const scanSize = CHUNK_SIZE + 2;
    const cellRefs = this.dualGridCellRefsScratch;
    cellRefs.length = scanSize * scanSize;
    for (let localY = 0; localY < scanSize; localY += 1) {
      const y = startY - 1 + localY;
      for (let localX = 0; localX < scanSize; localX += 1) {
        const x = startX - 1 + localX;
        cellRefs[localY * scanSize + localX] = this.resolveRuntimeDualGridRef(scene.terrain.tileCache.get(`${x},${y}`));
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
        const refs = this.dualGridVertexRefsScratch;
        const masks = this.dualGridVertexMasksScratch;
        refs[0] = null;
        refs[1] = null;
        refs[2] = null;
        refs[3] = null;
        masks[0] = 0;
        masks[1] = 0;
        masks[2] = 0;
        masks[3] = 0;
        let occupiedMask = 0;
        occupiedMask = this.collectDualGridVertexRef(refs, masks, occupiedMask, nw, 1);
        occupiedMask = this.collectDualGridVertexRef(refs, masks, occupiedMask, sw, 2);
        occupiedMask = this.collectDualGridVertexRef(refs, masks, occupiedMask, ne, 4);
        occupiedMask = this.collectDualGridVertexRef(refs, masks, occupiedMask, se, 8);
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
          this.drawDualGridSprite(chunkContainer, ref, dx, dy, cellSize, targetMask, targetMask);
        }
      }
    }
  }

  private buildTerrainOverlaySignature(scene: MapSceneSnapshot): string {
    return [
      scene.overlays.senseQi ? `sense:${scene.overlays.senseQi.levelBaseValue ?? ''}` : 'null',
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
          chunk = this.createTerrainChunk(key, cx, cy);
          this.terrainChunks.set(key, chunk);
        }
        chunk.lastSeenFrame = this.chunkFrame;
        const staticSignature = this.resolveTerrainChunkStaticSignature(chunk, scene, cellSize);
        if (staticSignature !== chunk.staticSignature) {
          this.profileCount('terrainChunkRebuilds');
          this.profileMeasure('terrainRebuild', () => this.rebuildTerrainChunkStaticLayers(chunk, scene, cellSize, staticSignature));
        }
        const overlaySignature = this.resolveTerrainChunkOverlaySignature(chunk, scene, cellSize);
        if (overlaySignature !== chunk.overlaySignature) {
          this.profileMeasure('terrainRebuild', () => this.rebuildTerrainChunkOverlayLayer(chunk, scene, cellSize, overlaySignature));
        }
      }
    }
    for (const [key, chunk] of this.terrainChunks) {
      if (this.chunkFrame - chunk.lastSeenFrame > 4) {
        this.destroyTerrainChunk(chunk);
        this.terrainChunks.delete(key);
      }
    }
    this.profileSetCounter('visibleChunks', visibleChunkCount);
    this.profileMeasure('terrainFog', () => this.rebuildTerrainFogLayer(scene, startCX, startCY, endCX, endCY, cellSize));
    this.profileMeasure('pathLayer', () => this.rebuildPathLayer(scene));
  }

  private createTerrainChunk(key: string, cx: number, cy: number): TerrainChunkView {
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
      lastSeenFrame: this.chunkFrame,
    };
    chunk.baseContainer.label = `terrain-base-chunk:${key}`;
    chunk.spriteContainer.label = `terrain-sprite-chunk:${key}`;
    chunk.edgeContainer.label = `terrain-edge-chunk:${key}`;
    chunk.glyphContainer.label = `terrain-glyph-chunk:${key}`;
    chunk.overlayContainer.label = `terrain-overlay-chunk:${key}`;
    chunk.overlayContainer.sortableChildren = true;
    this.terrainBaseLayer.addChild(chunk.baseContainer);
    this.terrainSpriteLayer.addChild(chunk.spriteContainer);
    this.terrainEdgeLayer.addChild(chunk.edgeContainer);
    this.terrainGlyphLayer.addChild(chunk.glyphContainer);
    this.terrainOverlayLayer.addChild(chunk.overlayContainer);
    return chunk;
  }

  private destroyTerrainChunk(chunk: TerrainChunkView): void {
    chunk.baseContainer.destroy({ children: true });
    chunk.spriteContainer.destroy({ children: true });
    chunk.edgeContainer.destroy({ children: true });
    chunk.glyphContainer.destroy({ children: true });
    chunk.overlayContainer.destroy({ children: true });
  }

  private rebuildTerrainFogLayer(
    scene: MapSceneSnapshot,
    startCX: number,
    startCY: number,
    endCX: number,
    endCY: number,
    cellSize: number,
  ): void {
    const now = performance.now();
    this.pruneCompletedTerrainFogTransitions(now);
    const signature = [
      cellSize,
      startCX,
      startCY,
      endCX,
      endCY,
      scene.terrain.visibleTileRevision,
      scene.terrain.tileCache.size,
    ].join('|');
    const hasActiveFogTransitions = this.visibleTileFadeStartedAt.size > 0 || this.hiddenTileFadeStartedAt.size > 0;
    if (!hasActiveFogTransitions && signature === this.terrainFogSignature) {
      return;
    }
    this.terrainFogSignature = hasActiveFogTransitions ? '' : signature;
    this.terrainFogLayer.clear();
    for (let cy = startCY; cy <= endCY; cy += 1) {
      for (let cx = startCX; cx <= endCX; cx += 1) {
        const startX = cx * CHUNK_SIZE;
        const startY = cy * CHUNK_SIZE;
        for (let y = startY; y < startY + CHUNK_SIZE; y += 1) {
          for (let x = startX; x < startX + CHUNK_SIZE; x += 1) {
            const key = `${x},${y}`;
            const tile = scene.terrain.tileCache.get(key);
            const sx = x * cellSize;
            const sy = y * cellSize;
            if (!scene.terrain.visibleTiles.has(key)) {
              const hiddenFade = this.resolveTileFade(this.hiddenTileFadeStartedAt.get(key), now, false);
              this.terrainFogLayer.rect(sx, sy, cellSize, cellSize).fill({ color: tile ? 0x0c0a08 : 0x080605, alpha: (tile ? 0.72 : 0.94) * hiddenFade });
              if (hiddenFade >= 1) {
                this.hiddenTileFadeStartedAt.delete(key);
              }
              continue;
            }
            const visibleFade = this.resolveTileFade(this.visibleTileFadeStartedAt.get(key), now, true);
            if (visibleFade > 0) {
              this.terrainFogLayer.rect(sx, sy, cellSize, cellSize).fill({ color: 0x0c0a08, alpha: 0.72 * visibleFade });
            } else {
              this.visibleTileFadeStartedAt.delete(key);
            }
          }
        }
      }
    }
    if (this.visibleTileFadeStartedAt.size === 0 && this.hiddenTileFadeStartedAt.size === 0) {
      this.terrainFogSignature = signature;
    }
  }

  private pruneCompletedTerrainFogTransitions(now: number): void {
    for (const [key, state] of this.visibleTileFadeStartedAt) {
      if (now - state.startedAt >= state.durationMs) {
        this.visibleTileFadeStartedAt.delete(key);
      }
    }
    for (const [key, state] of this.hiddenTileFadeStartedAt) {
      if (now - state.startedAt >= state.durationMs) {
        this.hiddenTileFadeStartedAt.delete(key);
      }
    }
  }

  private resolveTerrainChunkStaticSignature(chunk: TerrainChunkView, scene: MapSceneSnapshot, cellSize: number): string {
    const deps: TerrainChunkStaticSignatureDeps = {
      cellSize,
      renderRuntimeTileSprites: this.performanceConfig.renderRuntimeTileSprites,
      terrainTextMode: this.performanceConfig.terrainTextMode,
      runtimeTileSpriteRevision: this.runtimeTileSpriteRevision,
      terrainChunkRevision: scene.terrain.terrainChunkRevisions.get(chunk.key) ?? 0,
    };
    if (chunk.staticSignature && chunk.staticSignatureDeps && this.isSameTerrainChunkStaticSignatureDeps(chunk.staticSignatureDeps, deps)) {
      this.profileCount('terrainChunkSignatureHits');
      return chunk.staticSignature;
    }
    const signature = this.profileMeasure('terrainSignature', () => this.buildTerrainChunkStaticSignature(scene, chunk.cx, chunk.cy, cellSize));
    this.profileCount('terrainChunkSignatures');
    chunk.staticSignatureDeps = deps;
    return signature;
  }

  private resolveTerrainChunkOverlaySignature(chunk: TerrainChunkView, scene: MapSceneSnapshot, cellSize: number): string {
    const deps: TerrainChunkOverlaySignatureDeps = {
      cellSize,
      terrainOverlaySignature: this.terrainOverlaySignature,
      visibleTileRevision: scene.terrain.visibleTileRevision,
    };
    if (chunk.overlaySignature && chunk.overlaySignatureDeps && this.isSameTerrainChunkOverlaySignatureDeps(chunk.overlaySignatureDeps, deps)) {
      return chunk.overlaySignature;
    }
    const signature = this.profileMeasure('terrainSignature', () => this.buildTerrainChunkOverlaySignature(scene, chunk.cx, chunk.cy, cellSize));
    chunk.overlaySignatureDeps = deps;
    return signature;
  }

  private isSameTerrainChunkStaticSignatureDeps(previous: TerrainChunkStaticSignatureDeps, next: TerrainChunkStaticSignatureDeps): boolean {
    return previous.cellSize === next.cellSize
      && previous.renderRuntimeTileSprites === next.renderRuntimeTileSprites
      && previous.terrainTextMode === next.terrainTextMode
      && previous.runtimeTileSpriteRevision === next.runtimeTileSpriteRevision
      && previous.terrainChunkRevision === next.terrainChunkRevision;
  }

  private isSameTerrainChunkOverlaySignatureDeps(previous: TerrainChunkOverlaySignatureDeps, next: TerrainChunkOverlaySignatureDeps): boolean {
    return previous.cellSize === next.cellSize
      && previous.terrainOverlaySignature === next.terrainOverlaySignature
      && previous.visibleTileRevision === next.visibleTileRevision;
  }

  private buildTerrainChunkStaticSignature(scene: MapSceneSnapshot, cx: number, cy: number, cellSize: number): string {
    const startX = cx * CHUNK_SIZE;
    const startY = cy * CHUNK_SIZE;
    let signature = `${cellSize}|${this.performanceConfig.renderRuntimeTileSprites ? 1 : 0}|${this.performanceConfig.terrainTextMode ? 1 : 0}|${this.runtimeTileSpriteRevision}`;
    for (let y = startY - 1; y <= startY + CHUNK_SIZE; y += 1) {
      for (let x = startX - 1; x <= startX + CHUNK_SIZE; x += 1) {
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
        ].join(':');
      }
    }
    return signature;
  }

  private buildTerrainChunkOverlaySignature(scene: MapSceneSnapshot, cx: number, cy: number, cellSize: number): string {
    const startX = cx * CHUNK_SIZE;
    const startY = cy * CHUNK_SIZE;
    let signature = `${cellSize}|${this.terrainOverlaySignature}`;
    for (let y = startY; y < startY + CHUNK_SIZE; y += 1) {
      for (let x = startX; x < startX + CHUNK_SIZE; x += 1) {
        const key = `${x},${y}`;
        const tile = scene.terrain.tileCache.get(key);
        signature += [
          '',
          key,
          scene.terrain.visibleTiles.has(key) ? 1 : 0,
          tile?.type ?? '',
          tile?.hp ?? '',
          tile?.maxHp ?? '',
          tile?.hpVisible === false ? 0 : 1,
          tile?.aura ?? '',
        ].join(':');
      }
    }
    return signature;
  }

  private rebuildTerrainChunkStaticLayers(chunk: TerrainChunkView, scene: MapSceneSnapshot, cellSize: number, signature: string): void {
    this.disableTerrainChunkCache(chunk.baseContainer);
    this.disableTerrainChunkCache(chunk.spriteContainer);
    this.disableTerrainChunkCache(chunk.edgeContainer);
    this.disableTerrainChunkCache(chunk.glyphContainer);
    this.clearContainer(chunk.baseContainer);
    this.clearContainer(chunk.spriteContainer);
    this.clearContainer(chunk.edgeContainer);
    this.clearContainer(chunk.glyphContainer);
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
          this.drawRuntimeTileSprite(chunk.spriteContainer, tile, sx, sy, cellSize);
        }
        const glyph = tile ? TILE_VISUAL_GLYPHS[tile.type] : null;
        const hasRuntimeSprite = tile ? this.resolveRuntimeTileSpriteRef(tile) !== null : false;
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
    this.drawRuntimeDualGridEdges(chunk.edgeContainer, scene, startX, startY, cellSize);
    chunk.baseContainer.addChild(baseGraphics);
    chunk.staticSignature = signature;
    this.enableTerrainChunkCache(chunk.baseContainer);
    this.enableTerrainChunkCache(chunk.spriteContainer);
    this.enableTerrainChunkCache(chunk.edgeContainer);
    this.enableTerrainChunkCache(chunk.glyphContainer);
  }

  private rebuildTerrainChunkOverlayLayer(chunk: TerrainChunkView, scene: MapSceneSnapshot, cellSize: number, signature: string): void {
    this.disableTerrainChunkCache(chunk.overlayContainer);
    this.clearContainer(chunk.overlayContainer);
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
        this.drawTerrainOverlays(overlayGraphics, chunk.overlayContainer, scene, tile, key, x, y, sx, sy, cellSize, senseQiLevelBaseValue);
      }
    }
    chunk.overlayContainer.addChild(overlayGraphics);
    chunk.overlaySignature = signature;
    this.enableTerrainChunkCache(chunk.overlayContainer);
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
      const visibleFormationRangeVisual = this.resolveFormationRangeVisual(gx, gy, false);
      if (visibleFormationRangeVisual) this.drawFormationRangeVisual(graphics, chunkContainer, sx, sy, cellSize, visibleFormationRangeVisual);
    }
    if (tile && isVisible) {
      this.drawTileHpBar(graphics, tile, sx, sy, cellSize);
    }
    if (scene.overlays.senseQi) {
      const style = isVisible ? getSenseQiOverlayStyle(tile, senseQiLevelBaseValue) : { color: 0x000000, alpha: 0.34 };
      graphics.rect(sx, sy, cellSize, cellSize).fill(style);
      const formationRangeVisual = this.resolveFormationRangeVisual(gx, gy, true);
      if (formationRangeVisual) this.drawFormationRangeVisual(graphics, chunkContainer, sx, sy, cellSize, formationRangeVisual);
    }
  }

  private drawTileHpBar(graphics: Graphics, tile: Tile, sx: number, sy: number, cellSize: number): void {
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
    const signature = `${getCellSize()}|${buildGroundPileSignature(scene.groundPiles)}`;
    if (signature === this.groundPileSignature) {
      return;
    }
    this.groundPileSignature = signature;
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

  private rebuildInteractionOverlayLayer(scene: MapSceneSnapshot): void {
    const cellSize = getCellSize();
    const signature = [
      cellSize,
      scene.overlays.formationRange
        ? `${scene.overlays.formationRange.rangeHighlightColor ?? ''}:${buildGridPointSignature(scene.overlays.formationRange.affectedCells)}`
        : 'formation:null',
      scene.overlays.buildPreview
        ? `${scene.overlays.buildPreview.defId}:${scene.overlays.buildPreview.originX},${scene.overlays.buildPreview.originY}:${scene.overlays.buildPreview.rotation ?? ''}:${buildBuildPreviewSignature(scene.overlays.buildPreview.cells)}`
        : 'build:null',
      scene.overlays.fengShui
        ? `${scene.terrain.visibleTileRevision}:${scene.overlays.fengShui.instanceId}:${scene.overlays.fengShui.revision}:${buildFengShuiOverlaySignature(scene.overlays.fengShui.cells)}`
        : 'feng:null',
    ].join('|');
    if (signature === this.interactionOverlaySignature) {
      return;
    }
    this.interactionOverlaySignature = signature;
    this.interactionOverlayGraphics.clear();
    const formationRange = scene.overlays.formationRange;
    if (formationRange) {
      const fill = colorWithAlpha(formationRange.rangeHighlightColor, 0.22);
      const stroke = colorWithAlpha(formationRange.rangeHighlightColor, 0.86);
      for (const cell of formationRange.affectedCells) {
        const sx = cell.x * cellSize;
        const sy = cell.y * cellSize;
        this.interactionOverlayGraphics.rect(sx + 1, sy + 1, cellSize - 2, cellSize - 2).fill(fill);
        this.interactionOverlayGraphics.rect(sx + 1.5, sy + 1.5, cellSize - 3, cellSize - 3).stroke({ ...stroke, width: 2 });
      }
    }
    if (scene.overlays.fengShui) {
      for (const key of scene.terrain.visibleTiles) {
        const tile = scene.terrain.tileCache.get(key);
        if (!tile) {
          continue;
        }
        const [rawX, rawY] = key.split(',', 2);
        const x = Number(rawX);
        const y = Number(rawY);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          continue;
        }
        this.interactionOverlayGraphics.rect(x * cellSize, y * cellSize, cellSize, cellSize).fill({ color: 0x080605, alpha: 0.34 });
      }
      for (const cell of scene.overlays.fengShui.cells) {
        const sx = cell.x * cellSize;
        const sy = cell.y * cellSize;
        this.interactionOverlayGraphics.rect(sx + 1, sy + 1, cellSize - 2, cellSize - 2).fill(getFengShuiOverlayFill(cell));
        this.interactionOverlayGraphics.rect(sx + 1.5, sy + 1.5, cellSize - 3, cellSize - 3).stroke({ ...getFengShuiOverlayStroke(cell), width: 1 });
      }
    }
    for (const cell of scene.overlays.buildPreview?.cells ?? []) {
      this.drawCellHighlight(
        this.interactionOverlayGraphics,
        cell.x * cellSize,
        cell.y * cellSize,
        cellSize,
        cell.ok ? (cell.warning ? 'rgba(217,119,6,0.24)' : 'rgba(22,163,74,0.24)') : 'rgba(220,38,38,0.30)',
        cell.ok ? (cell.warning ? 'rgba(245,158,11,0.92)' : 'rgba(34,197,94,0.92)') : 'rgba(248,113,113,0.96)',
        false,
      );
    }
  }

  private rebuildTargetingLayer(scene: MapSceneSnapshot): void {
    const signature = `${getCellSize()}|${scene.terrain.visibleTileRevision}|${buildTargetingOverlaySignature(scene.overlays.targeting)}`;
    if (signature === this.targetingOverlaySignature) {
      return;
    }
    this.targetingOverlaySignature = signature;
    this.targetingGraphics.clear();
    const targeting = scene.overlays.targeting;
    if (!targeting) {
      return;
    }
    const cellSize = getCellSize();
    const range = Math.max(0, Math.ceil(Number(targeting.range) || 0));
    const affectedKeys = new Set((targeting.affectedCells ?? []).map((cell) => `${cell.x},${cell.y}`));
    const drawn = new Set<string>();
    const drawCell = (gx: number, gy: number): void => {
      const key = `${gx},${gy}`;
      if (drawn.has(key)) {
        return;
      }
      const isVisible = scene.terrain.visibleTiles.has(key);
      if (targeting.visibleOnly && !isVisible) {
        return;
      }
      const dx = gx - targeting.originX;
      const dy = gy - targeting.originY;
      const affected = affectedKeys.has(key);
      const hovered = gx === targeting.hoverX && gy === targeting.hoverY;
      const inRange = (dx !== 0 || dy !== 0) && isOffsetInRange(dx, dy, targeting.range);
      if (!affected && !inRange) {
        return;
      }
      this.drawCellHighlight(
        this.targetingGraphics,
        gx * cellSize,
        gy * cellSize,
        cellSize,
        affected ? (hovered ? 'rgba(208,76,56,0.42)' : 'rgba(198,72,48,0.3)') : (hovered ? 'rgba(66,153,225,0.3)' : 'rgba(88,180,214,0.18)'),
        affected ? (hovered ? 'rgba(150,28,24,0.98)' : 'rgba(171,56,36,0.9)') : (hovered ? 'rgba(125,211,252,0.94)' : 'rgba(151,236,255,0.72)'),
        hovered || affected,
      );
      drawn.add(key);
    };
    for (let y = targeting.originY - range; y <= targeting.originY + range; y += 1) {
      for (let x = targeting.originX - range; x <= targeting.originX + range; x += 1) {
        drawCell(x, y);
      }
    }
    for (const cell of targeting.affectedCells ?? []) {
      drawCell(cell.x, cell.y);
    }
  }

  private rebuildSenseQiHoverLayer(scene: MapSceneSnapshot): void {
    const signature = `${getCellSize()}|${scene.terrain.visibleTileRevision}|${buildSenseQiHoverSignature(scene.overlays.senseQi)}`;
    if (signature === this.senseQiHoverSignature) {
      return;
    }
    this.senseQiHoverSignature = signature;
    this.senseQiHoverGraphics.clear();
    const overlay = scene.overlays.senseQi;
    if (!overlay || typeof overlay.hoverX !== 'number' || typeof overlay.hoverY !== 'number') {
      return;
    }
    const key = `${overlay.hoverX},${overlay.hoverY}`;
    if (!scene.terrain.visibleTiles.has(key)) {
      return;
    }
    const cellSize = getCellSize();
    this.senseQiHoverGraphics
      .rect(overlay.hoverX * cellSize + 1, overlay.hoverY * cellSize + 1, cellSize - 2, cellSize - 2)
      .stroke({
        color: parseColor(SENSE_QI_OVERLAY_STYLE.hoverStroke),
        alpha: parseAlpha(SENSE_QI_OVERLAY_STYLE.hoverStroke, 1),
        width: 2,
      });
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
    const now = performance.now();
    const fadingAlpha = this.getFadingPathAlpha(now);
    const playerX = scene.player?.x ?? 0;
    const playerY = scene.player?.y ?? 0;
    const signature = [
      getCellSize(),
      playerX,
      playerY,
      buildGridPointSignature(this.pathCells),
      this.fadingPath ? buildGridPointSignature(this.fadingPath.cells) : 'fade:null',
      this.fadingPath ? fadingAlpha.toFixed(3) : '0',
    ].join('|');
    if (signature === this.pathLayerSignature) {
      return;
    }
    this.pathLayerSignature = signature;
    this.pathGraphics.clear();
    this.profileSetCounter('pathCells', this.pathCells.length);
    this.profileSetCounter('fadingPathCells', this.fadingPath?.cells.length ?? 0);
    this.drawPathCells(this.pathGraphics, this.pathCells, 1);
    if (this.fadingPath && fadingAlpha > 0) this.drawPathCells(this.pathGraphics, this.fadingPath.cells, fadingAlpha * PATH_TRAIL_FADE_ALPHA);
    this.drawPathArrows(this.pathGraphics, playerX, playerY, this.pathCells, 1);
    if (this.fadingPath && fadingAlpha > 0) this.drawPathArrows(this.pathGraphics, playerX, playerY, this.fadingPath.cells, fadingAlpha * PATH_TRAIL_FADE_ALPHA);
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
      artifactAura: new Graphics(),
      shadow: new Graphics(),
      image: new Sprite(Texture.EMPTY),
      glyph: new Text({ text: entity.char, style: textStyle('entityGlyph', getCellSize() * 0.75, entity.color), anchor: 0.5 }),
      label: new Text({ text: '', style: textStyle('label', getCellSize() * 0.3, '#cce7ff'), anchor: 0.5 }),
      badgeLayer: new Container(),
      hpBar: new Graphics(),
      progressBar: new Graphics(),
      buffLayer: new Container(),
      questMarker: new Container(),
      formationMarker: new Graphics(),
      respawnLabel: new Text({ text: '', style: textStyle('label', getCellSize() * 0.22, '#e7d5a7'), anchor: 0.5 }),
      staticSignature: '',
      hiddenByFormation: false,
      imageBaseScaleX: 1,
      imageBaseScaleY: 1,
      imageFlipSourceSign: 1,
      imageFlipTargetSign: 1,
      imageFlipStartedAt: 0,
      attackMotionUnitX: 0,
      attackMotionUnitY: 0,
    };
    view.image.anchor.set(0.5);
    view.image.visible = false;
    visualRoot.addChild(view.shadow, view.image, view.glyph);
    root.addChild(view.formationMarker, view.artifactAura, visualRoot, view.badgeLayer, view.label, view.hpBar, view.progressBar, view.buffLayer, view.questMarker, view.respawnLabel);
    return view;
  }

  private patchEntityStatic(view: EntityView): void {
    const anim = view.anim;
    const cellSize = getCellSize();
    const presentation = anim.kind === 'monster' ? getMonsterPresentation(anim.name, anim.monsterTier) : null;
    const badges = resolveNameplateBadges(anim.badges, anim.badge, presentation?.badge);
    const signature = [
      cellSize,
      anim.char, anim.color, anim.name ?? '', anim.kind ?? '', anim.hp ?? '', anim.maxHp ?? '',
      anim.respawnRemainingTicks ?? '', anim.respawnTotalTicks ?? '',
      anim.monsterTier ?? '',
      anim.monsterId ?? '',
      buildNameplateBadgeSignature(badges), anim.hostile ? 1 : 0,
      anim.artifactActive === true ? 1 : 0,
      anim.monsterScale ?? '', anim.facing ?? '',
      this.runtimeTileSpriteRevision,
      anim.buffs?.map((buff) => `${buff.buffId}:${buff.remainingTicks}:${buff.stacks}`).join(',') ?? '',
      anim.npcQuestMarker ? `${anim.npcQuestMarker.line}:${anim.npcQuestMarker.state}` : '',
      anim.formationShowText === false ? 1 : 0,
      anim.formationRangeHighlightColor ?? '',
      this.isEntityTextMode(anim.kind) ? 1 : 0,
    ].join('|');
    if (signature === view.staticSignature) return;
    const visualScale = (presentation?.scale ?? 1) * Math.max(1, anim.monsterScale ?? 1);
    const visualCellSize = cellSize * visualScale;
    view.visualRoot.pivot.set(visualCellSize / 2, visualCellSize - 3);
    view.visualRoot.position.set(cellSize / 2, cellSize - 3);
    view.shadow.clear().ellipse(visualCellSize / 2, visualCellSize - 3, visualCellSize * 0.32, Math.max(2, visualCellSize * 0.1)).fill({ color: 0x000000, alpha: 0.3 });
    const forceTextMode = this.isEntityTextMode(anim.kind);
    let drewEntityImage = false;
    if (forceTextMode) {
      view.image.visible = false;
    } else {
      drewEntityImage = this.patchRuntimeEntitySprite(view, visualCellSize);
    }
    view.glyph.text = anim.char;
    view.glyph.style = textStyle('entityGlyph', visualCellSize * 0.75, anim.color);
    view.glyph.visible = !drewEntityImage;
    view.glyph.position.set(visualCellSize / 2, visualCellSize / 2);
    const label = presentation?.label ?? anim.name ?? resolveEntityFallbackLabel(anim.kind);
    const shouldShowLabel = anim.kind !== 'formation' || anim.formationShowText !== false;
    const labelY = cellSize - visualCellSize - Math.max(6, cellSize * 0.18);
    this.patchEntityNameplate(view, label, badges, shouldShowLabel, labelY, cellSize);
    this.drawEntityBars(view, visualCellSize);
    this.drawBuffs(view, cellSize);
    this.drawArtifactAura(view.artifactAura, anim, cellSize);
    this.drawNpcQuestMarker(view.questMarker, anim.npcQuestMarker ?? undefined, cellSize);
    this.drawFormationMarker(view.formationMarker, anim, cellSize);
    this.drawRespawnLabel(view, cellSize, visualCellSize);
    view.root.zIndex = resolveWorldObjectRenderOrder(anim.kind);
    view.root.alpha = anim.kind === 'building' && (anim.respawnTotalTicks ?? 0) > 0 ? 0.58 : 1;
    view.staticSignature = signature;
  }

  private isEntityTextMode(kind: AnimEntity['kind']): boolean {
    if (kind === 'npc') return this.performanceConfig.npcTextMode;
    if (kind === 'monster') return this.performanceConfig.monsterTextMode;
    if (kind === 'container') return this.performanceConfig.herbTextMode;
    return false;
  }

  private patchRuntimeEntitySprite(view: EntityView, visualCellSize: number): boolean {
    const selection = this.resolveRuntimeEntitySpriteSelection(view.anim);
    if (!selection) {
      view.image.visible = false;
      return false;
    }
    const texture = this.getRuntimeEntityTexture(selection.ref);
    if (!texture) {
      this.requestRuntimeEntityTexture(selection.ref);
      view.image.visible = false;
      return false;
    }
    const inset = Math.max(0, Math.min(0.4, selection.ref.insetRatio)) * visualCellSize;
    const maxW = Math.max(1, visualCellSize - inset * 2);
    const maxH = Math.max(1, visualCellSize - inset * 2);
    let targetW = maxW;
    let targetH = maxH;
    if (selection.ref.fit === 'contain') {
      const scale = Math.min(maxW / Math.max(1, texture.width), maxH / Math.max(1, texture.height));
      targetW = Math.max(1, texture.width * scale);
      targetH = Math.max(1, texture.height * scale);
    }
    view.image.texture = texture;
    const baseScaleX = targetW / Math.max(1, texture.width);
    const baseScaleY = targetH / Math.max(1, texture.height);
    const nextFlipSign = selection.transform.flipX ? -1 : 1;
    const now = performance.now();
    const currentFlipSign = this.resolveCurrentImageFlipSign(view, now);
    const shouldAnimateFlip = view.image.visible && view.imageFlipTargetSign !== nextFlipSign;
    view.imageBaseScaleX = baseScaleX;
    view.imageBaseScaleY = baseScaleY;
    view.imageFlipSourceSign = shouldAnimateFlip ? currentFlipSign : nextFlipSign;
    view.imageFlipTargetSign = nextFlipSign;
    view.imageFlipStartedAt = shouldAnimateFlip ? now : 0;
    this.applyEntityImageScale(view, now);
    view.image.rotation = 0;
    view.image.position.set(visualCellSize / 2, visualCellSize / 2);
    view.image.visible = true;
    return true;
  }

  private resolveCurrentImageFlipSign(view: EntityView, now: number): number {
    if (view.imageFlipStartedAt <= 0) {
      return view.imageFlipTargetSign;
    }
    const progress = clamp01((now - view.imageFlipStartedAt) / ENTITY_FACING_FLIP_TRANSITION_MS);
    if (progress >= 1) {
      return view.imageFlipTargetSign;
    }
    const eased = easeInOutCubic(progress);
    return view.imageFlipSourceSign + (view.imageFlipTargetSign - view.imageFlipSourceSign) * eased;
  }

  private applyEntityImageScale(view: EntityView, now: number): void {
    const sign = this.resolveCurrentImageFlipSign(view, now);
    view.image.scale.set(view.imageBaseScaleX * sign, view.imageBaseScaleY);
    if (view.imageFlipStartedAt > 0 && now - view.imageFlipStartedAt >= ENTITY_FACING_FLIP_TRANSITION_MS) {
      view.imageFlipStartedAt = 0;
      view.imageFlipSourceSign = view.imageFlipTargetSign;
      view.image.scale.set(view.imageBaseScaleX * view.imageFlipTargetSign, view.imageBaseScaleY);
    }
  }

  private patchEntityNameplate(
    view: EntityView,
    label: string,
    badges: readonly EntityNameplateBadge[],
    shouldShowLabel: boolean,
    labelY: number,
    cellSize: number,
  ): void {
    const labelColor = resolveEntityLabelColor(view.anim.kind);
    view.label.visible = shouldShowLabel;
    view.label.text = label;
    view.label.style = textStyle('label', cellSize * (view.anim.kind === 'crowd' ? 0.24 : 0.3), labelColor);

    const visibleBadges = shouldShowLabel ? badges : [];
    this.clearContainer(view.badgeLayer);
    view.badgeLayer.visible = visibleBadges.length > 0;

    if (!shouldShowLabel) {
      return;
    }
    if (visibleBadges.length === 0) {
      view.label.position.set(cellSize / 2, labelY);
      return;
    }

    const badgeTextSize = Math.max(9, cellSize * 0.2);
    const badgePaddingX = Math.max(4, cellSize * 0.1);
    const badgeHeight = Math.max(12, cellSize * 0.28);
    const badgeRadius = Math.max(4, badgeHeight * 0.38);
    const badgeGap = Math.max(2, cellSize * 0.04);
    const labelGap = Math.max(4, cellSize * 0.08);

    const labelWidth = Math.max(0, view.label.width);
    const badgeEntries = visibleBadges.map((badge) => {
      const palette = resolveEntityBadgePalette(badge);
      const text = new Text({
        text: badge.text,
        style: textStyle('badge', badgeTextSize, palette.text, 'rgba(0,0,0,0)', 0),
        anchor: 0.5,
      });
      return {
        badge,
        text,
        width: Math.max(16, text.width + badgePaddingX * 2),
      };
    });
    const badgesWidth = badgeEntries.reduce((sum, entry) => sum + entry.width, 0)
      + Math.max(0, badgeEntries.length - 1) * badgeGap;
    const totalWidth = badgesWidth + labelGap + labelWidth;
    const left = cellSize / 2 - totalWidth / 2;
    const badgeY = labelY - badgeHeight / 2;
    let badgeX = left;
    for (const entry of badgeEntries) {
      const palette = resolveEntityBadgePalette(entry.badge);
      const plate = new Graphics()
        .roundRect(0, 0, entry.width, badgeHeight, badgeRadius)
        .fill({ color: parseColor(palette.fill), alpha: parseAlpha(palette.fill, 1) })
        .stroke({ color: parseColor(palette.stroke), alpha: parseAlpha(palette.stroke, 1), width: 1 });
      plate.position.set(badgeX, badgeY);
      entry.text.position.set(badgeX + entry.width / 2, labelY);
      view.badgeLayer.addChild(plate, entry.text);
      badgeX += entry.width + badgeGap;
    }
    view.label.position.set(left + badgesWidth + labelGap + labelWidth / 2, labelY);
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

  private drawArtifactAura(graphics: Graphics, anim: AnimEntity, cellSize: number, timeMs = 0): void {
    graphics.clear();
    const active = anim.kind === 'player' && anim.artifactActive === true;
    graphics.visible = active;
    if (!active) {
      return;
    }
    const half = Math.max(10, cellSize * 0.56);
    const side = half * 2;
    const perimeter = side * 4;
    const dashLength = Math.max(6, cellSize * 0.18);
    const gapLength = Math.max(4, cellSize * 0.12);
    const cycleLength = dashLength + gapLength;
    const phase = (timeMs % ARTIFACT_AURA_FLOW_MS) / ARTIFACT_AURA_FLOW_MS * cycleLength;
    graphics.position.set(cellSize / 2, cellSize / 2);
    graphics.rotation = 0;

    const pointAt = (distance: number): { x: number; y: number } => {
      const wrapped = ((distance % perimeter) + perimeter) % perimeter;
      if (wrapped < side) {
        return { x: -half + wrapped, y: -half };
      }
      if (wrapped < side * 2) {
        return { x: half, y: -half + wrapped - side };
      }
      if (wrapped < side * 3) {
        return { x: half - (wrapped - side * 2), y: half };
      }
      return { x: -half, y: half - (wrapped - side * 3) };
    };
    const nextCornerDistance = (distance: number): number => {
      const wrapped = ((distance % perimeter) + perimeter) % perimeter;
      const sideIndex = Math.min(3, Math.floor(wrapped / side));
      return distance + (side * (sideIndex + 1) - wrapped);
    };
    const appendDashes = (): void => {
      for (let start = -phase; start < perimeter; start += cycleLength) {
        const end = start + dashLength;
        let cursor = start;
        while (cursor < end - 0.001) {
          const segmentEnd = Math.min(end, nextCornerDistance(cursor));
          const from = pointAt(cursor);
          const to = pointAt(segmentEnd);
          graphics.moveTo(from.x, from.y).lineTo(to.x, to.y);
          cursor = segmentEnd;
        }
      }
    };
    appendDashes();
    graphics.stroke({ color: ARTIFACT_AURA_COLOR, alpha: 0.28, width: Math.max(4, cellSize * 0.13) });
    appendDashes();
    graphics.stroke({ color: ARTIFACT_AURA_COLOR, alpha: 1, width: Math.max(2, cellSize * 0.06) });
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
    const now = performance.now();
    const motionDx = anim.targetWX - anim.oldWX;
    const motionDy = anim.targetWY - anim.oldWY;
    const motionDistance = Math.hypot(motionDx, motionDy);
    const isMoving = isMobileEntityObjectKind(anim.kind) && motionDistance > 0.5 && motionProgress < 1;
    const travelPulse = isMoving ? Math.sin(Math.PI * motionProgress) : 0;
    const landPhase = isMoving && motionProgress > 0.62 ? clamp01((motionProgress - 0.62) / 0.38) : 0;
    const landPulse = landPhase > 0 ? Math.sin(Math.PI * landPhase) : 0;
    const motionUnitX = motionDistance > 0 ? motionDx / motionDistance : 0;
    const motionUnitY = motionDistance > 0 ? motionDy / motionDistance : 0;
    let attackPulse = 0;
    if (view.attackMotionStartedAt !== undefined) {
      const attackProgress = clamp01((now - view.attackMotionStartedAt) / ATTACK_MOTION_DURATION_MS);
      if (attackProgress >= 1) {
        view.attackMotionStartedAt = undefined;
        view.attackMotionUnitX = 0;
        view.attackMotionUnitY = 0;
      } else {
        attackPulse = Math.sin(Math.PI * attackProgress);
      }
    }
    const attackUnitX = view.attackMotionUnitX ?? 0;
    const attackUnitY = view.attackMotionUnitY ?? 0;
    const glyphLean = (motionUnitX - motionUnitY) * travelPulse * 0.1 + (attackUnitX - attackUnitY) * attackPulse * 0.08;
    const impactScaleX = (1 + travelPulse * 0.08 + landPulse * 0.1) * (1 + attackPulse * 0.1);
    const impactScaleY = (1 - travelPulse * 0.06 - landPulse * 0.12) * (1 - attackPulse * 0.08);
    const visualCellSize = Math.max(1, view.visualRoot.pivot.x * 2);
    const cellSize = getCellSize();
    const attackLunge = attackPulse * cellSize * 0.08;
    view.visualRoot.position.set(cellSize / 2 + attackUnitX * attackLunge, cellSize - 3 + attackUnitY * attackLunge);
    view.visualRoot.scale.set(
      (isMoving ? 1 + travelPulse * 0.24 : 1) * (1 + attackPulse * 0.16),
      (isMoving ? 1 - travelPulse * 0.16 : 1) * (1 - attackPulse * 0.1),
    );
    this.applyEntityImageScale(view, now);
    view.glyph.rotation = isMoving || attackPulse > 0 ? glyphLean : 0;
    view.glyph.scale.set(isMoving || attackPulse > 0 ? impactScaleX : 1, isMoving || attackPulse > 0 ? impactScaleY : 1);
    view.glyph.y = visualCellSize / 2 - travelPulse * cellSize * 0.08;
    if (view.artifactAura.visible) this.drawArtifactAura(view.artifactAura, anim, cellSize, now);
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
      const fromCenterX = from.root.x + cellSize / 2;
      const fromCenterY = from.root.y + cellSize / 2;
      const toCenterX = to.root.x + cellSize / 2;
      const toCenterY = to.root.y + cellSize / 2;
      const dx = toCenterX - fromCenterX;
      const dy = toCenterY - fromCenterY;
      const distance = Math.hypot(dx, dy);
      if (distance < Math.max(10, cellSize * 0.45)) continue;
      const ux = dx / distance;
      const uy = dy / distance;
      const startX = fromCenterX + ux * cellSize * 0.34;
      const startY = fromCenterY + uy * cellSize * 0.34;
      const endX = toCenterX - ux * cellSize * 0.34;
      const endY = toCenterY - uy * cellSize * 0.34;
      const curvature = Math.max(cellSize * 0.32, Math.min(distance * 0.18, cellSize * 0.76));
      const controlX = (startX + endX) / 2;
      const controlY = Math.min(startY, endY) - curvature;
      const self = from.anim.kind === 'player';
      const color = parseColor(self ? SELF_THREAT_ARROW_COLOR : OTHER_THREAT_ARROW_COLOR);
      const glow = self ? SELF_THREAT_ARROW_GLOW : OTHER_THREAT_ARROW_GLOW;
      const baseWidth = Math.max(0.55, cellSize * 0.02);
      const dashLength = Math.max(5, cellSize * 0.17);
      const gapLength = Math.max(4, cellSize * 0.12);

      this.drawDashedQuadraticCurve(
        graphics,
        startX,
        startY,
        controlX,
        controlY,
        endX,
        endY,
        dashLength,
        gapLength,
        parseColor(glow),
        parseAlpha(glow, 1),
        baseWidth + Math.max(1.9, cellSize * 0.048),
      );
      this.drawDashedQuadraticCurve(
        graphics,
        startX,
        startY,
        controlX,
        controlY,
        endX,
        endY,
        dashLength,
        gapLength,
        color,
        0.98,
        baseWidth,
      );
      this.drawThreatArrowHead(graphics, startX, startY, controlX, controlY, endX, endY, cellSize, color, 0.98);
    }
  }

  private drawDashedQuadraticCurve(
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
    const straightDistance = Math.hypot(endX - startX, endY - startY);
    const segmentCount = Math.max(12, Math.min(48, Math.ceil(straightDistance / Math.max(4, dashLength))));
    let previousX = startX;
    let previousY = startY;
    let drawingDash = true;
    let remaining = dashLength;
    for (let index = 1; index <= segmentCount; index += 1) {
      const t = index / segmentCount;
      const nextX = this.getQuadraticPoint(startX, controlX, endX, t);
      const nextY = this.getQuadraticPoint(startY, controlY, endY, t);
      const segmentLength = Math.hypot(nextX - previousX, nextY - previousY);
      if (segmentLength < 0.001) {
        previousX = nextX;
        previousY = nextY;
        continue;
      }
      const ux = (nextX - previousX) / segmentLength;
      const uy = (nextY - previousY) / segmentLength;
      let consumed = 0;
      while (consumed < segmentLength) {
        const take = Math.min(remaining, segmentLength - consumed);
        if (drawingDash) {
          const dashStartX = previousX + ux * consumed;
          const dashStartY = previousY + uy * consumed;
          const dashEndX = previousX + ux * (consumed + take);
          const dashEndY = previousY + uy * (consumed + take);
          graphics.moveTo(dashStartX, dashStartY).lineTo(dashEndX, dashEndY);
        }
        consumed += take;
        remaining -= take;
        if (remaining <= 0.001) {
          drawingDash = !drawingDash;
          remaining = drawingDash ? dashLength : gapLength;
        }
      }
      previousX = nextX;
      previousY = nextY;
    }
    graphics.stroke({ color, alpha, width });
  }

  private drawThreatArrowHead(
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
    const tangentX = endX - this.getQuadraticPoint(startX, controlX, endX, 0.86);
    const tangentY = endY - this.getQuadraticPoint(startY, controlY, endY, 0.86);
    const tangentLength = Math.hypot(tangentX, tangentY);
    if (tangentLength < 0.001) return;
    const arrowUx = tangentX / tangentLength;
    const arrowUy = tangentY / tangentLength;
    const headLength = Math.max(7, cellSize * 0.22);
    const headWidth = Math.max(2.4, cellSize * 0.076);
    const baseX = endX - arrowUx * headLength;
    const baseY = endY - arrowUy * headLength;
    graphics
      .moveTo(endX, endY)
      .lineTo(baseX + (-arrowUy) * headWidth, baseY + arrowUx * headWidth)
      .lineTo(baseX - (-arrowUy) * headWidth, baseY - arrowUx * headWidth)
      .closePath()
      .fill({ color, alpha });
  }

  private getQuadraticPoint(start: number, control: number, end: number, t: number): number {
    const invT = 1 - t;
    return invT * invT * start + 2 * invT * t * control + t * t * end;
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
    this.trimFloatingTextEffects();
  }

  private addAttackTrail(fromX: number, fromY: number, toX: number, toY: number, color = '#ffd27a'): void {
    const graphics = new Graphics();
    this.effectLayer.addChild(graphics);
    this.attackTrails.push({
      id: this.nextEffectId++,
      fromX,
      fromY,
      toX,
      toY,
      color,
      graphics,
      createdAt: performance.now(),
      duration: ATTACK_TRAIL_DURATION_MS,
    });
    this.trimAttackTrailEffects();
  }

  private triggerAttackMotion(fromX: number, fromY: number, toX: number, toY: number): void {
    const view = this.resolveAttackMotionView(fromX, fromY);
    if (!view) return;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const distance = Math.hypot(dx, dy);
    view.attackMotionStartedAt = performance.now();
    view.attackMotionUnitX = distance > 0 ? dx / distance : 0;
    view.attackMotionUnitY = distance > 0 ? dy / distance : 0;
  }

  private resolveAttackMotionView(fromX: number, fromY: number): EntityView | null {
    const gridX = Math.round(fromX);
    const gridY = Math.round(fromY);
    for (const view of this.entities.values()) {
      if (!isMobileEntityObjectKind(view.anim.kind)) continue;
      if (view.anim.gridX === gridX && view.anim.gridY === gridY) return view;
    }
    return null;
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
    this.trimWarningZoneEffects();
  }

  private updateEffects(camera: CameraState): void {
    void camera;
    const now = performance.now();
    const cellSize = getCellSize();
    this.floatingTexts = this.floatingTexts.filter((entry) => {
      const progress = (now - entry.createdAt) / entry.duration;
      if (progress >= 1) {
        this.destroyFloatingTextEffect(entry);
        return false;
      }
      return true;
    });
    const groups = new Map<string, FloatingTextEffect[]>();
    const burstMetaById = new Map<number, { index: number; total: number }>();
    for (const entry of this.floatingTexts) {
      const key = `${entry.x},${entry.y},${entry.variant}`;
      const group = groups.get(key);
      if (group) {
        group.push(entry);
      } else {
        groups.set(key, [entry]);
      }
    }
    for (const group of groups.values()) {
      group.sort((left, right) => left.createdAt - right.createdAt || left.id - right.id);
      for (let index = 0; index < group.length; index += 1) {
        burstMetaById.set(group[index].id, { index, total: group.length });
      }
    }
    for (const entry of this.floatingTexts) {
      const progress = (now - entry.createdAt) / entry.duration;
      const rise = entry.variant === 'action' ? cellSize * (0.08 + progress * 0.46) : cellSize * (0.2 + progress * 0.8);
      const burstMeta = burstMetaById.get(entry.id) ?? { index: 0, total: 1 };
      const burst = this.getFloatingTextBurstOffset(burstMeta.index, burstMeta.total, cellSize);
      entry.text.alpha = entry.actionStyle === 'divine' ? 1 - Math.max(0, (progress - 0.86) / 0.14) : 1 - progress;
      entry.text.position.set(entry.x * cellSize + cellSize / 2 + burst.offsetX, entry.y * cellSize - rise - burst.offsetY);
    }
    this.attackTrails = this.attackTrails.filter((entry) => {
      const elapsed = now - entry.createdAt;
      const progress = elapsed / entry.duration;
      if (progress >= 1) {
        this.destroyAttackTrailEffect(entry);
        return false;
      }
      this.drawAttackTrailEffect(entry, cellSize, elapsed);
      return true;
    });
    this.warningZones = this.warningZones.filter((zone) => {
      const progress = (now - zone.createdAt) / zone.duration;
      if (progress >= 1) {
        this.destroyWarningZoneEffect(zone);
        return false;
      }
      zone.graphics.clear();
      const revealDistance = progress * (zone.maxExpandDistance + 1);
      const lifetimeFade = 1 - progress * 0.62;
      for (const cell of zone.cells) {
        const localReveal = clamp01(revealDistance - cell.expandDistance);
        if (localReveal <= 0) continue;
        const revealEase = easeOutCubic(localReveal);
        const edgePulse = 1 - Math.abs(localReveal - 0.5) * 2;
        const sx = cell.x * cellSize;
        const sy = cell.y * cellSize;
        zone.graphics.rect(sx + 1, sy + 1, cellSize - 2, cellSize - 2).fill({ color: parseColor(zone.baseColor), alpha: 0.08 * revealEase * lifetimeFade });
        zone.graphics.rect(sx + 1, sy + 1, cellSize - 2, cellSize - 2).fill({ color: parseColor(zone.color), alpha: (0.10 + edgePulse * 0.12) * revealEase * lifetimeFade });
        zone.graphics.rect(sx + 1.5, sy + 1.5, cellSize - 3, cellSize - 3).stroke({ color: parseColor(zone.color), alpha: (0.42 + edgePulse * 0.34) * revealEase * lifetimeFade, width: Math.max(1.35, cellSize * (0.06 + edgePulse * 0.04)) });
      }
      return true;
    });
  }

  private trimFloatingTextEffects(): void {
    const overflow = this.floatingTexts.length - MAX_FLOATING_TEXTS;
    if (overflow <= 0) return;
    for (const entry of this.floatingTexts.splice(0, overflow)) {
      this.destroyFloatingTextEffect(entry);
    }
  }

  private trimAttackTrailEffects(): void {
    const overflow = this.attackTrails.length - MAX_ATTACK_TRAILS;
    if (overflow <= 0) return;
    for (const entry of this.attackTrails.splice(0, overflow)) {
      this.destroyAttackTrailEffect(entry);
    }
  }

  private trimWarningZoneEffects(): void {
    const overflow = this.warningZones.length - MAX_WARNING_ZONES;
    if (overflow <= 0) return;
    for (const zone of this.warningZones.splice(0, overflow)) {
      this.destroyWarningZoneEffect(zone);
    }
  }

  private destroyFloatingTextEffect(entry: FloatingTextEffect): void {
    entry.text.parent?.removeChild(entry.text);
    entry.text.destroy();
  }

  private destroyAttackTrailEffect(entry: AttackTrailEffect): void {
    entry.graphics.parent?.removeChild(entry.graphics);
    entry.graphics.destroy();
  }

  private destroyWarningZoneEffect(zone: WarningZoneEffect): void {
    zone.graphics.parent?.removeChild(zone.graphics);
    zone.graphics.destroy();
  }

  private getFloatingTextBurstOffset(index: number, count: number, cellSize: number): FloatingTextBurstOffset {
    if (count <= 1 || index < 0) {
      return { offsetX: 0, offsetY: 0 };
    }
    const horizontalStep = cellSize * 0.3;
    const verticalStep = cellSize * 0.12;
    const centeredIndex = index - (count - 1) / 2;
    return {
      offsetX: centeredIndex * horizontalStep,
      offsetY: Math.abs(centeredIndex) * verticalStep,
    };
  }

  private drawAttackTrailEffect(entry: AttackTrailEffect, cellSize: number, elapsed: number): void {
    const sx = entry.fromX * cellSize + cellSize / 2;
    const sy = entry.fromY * cellSize + cellSize / 2;
    const ex = entry.toX * cellSize + cellSize / 2;
    const ey = entry.toY * cellSize + cellSize / 2;
    const dx = ex - sx;
    const dy = ey - sy;
    const distance = Math.hypot(dx, dy);
    entry.graphics.clear();
    if (distance < 1) return;

    const reachProgress = easeOutCubic(elapsed / ATTACK_TRAIL_REACH_MS);
    const tipX = sx + dx * reachProgress;
    const tipY = sy + dy * reachProgress;
    const tailProgress = Math.max(0, reachProgress - 0.72);
    const tailX = sx + dx * tailProgress;
    const tailY = sy + dy * tailProgress;
    const angle = Math.atan2(dy, dx);
    const color = parseColor(entry.color);
    const fadeProgress = Math.min(1, Math.max(0, (elapsed - ATTACK_TRAIL_REACH_MS - ATTACK_TRAIL_HOLD_MS) / ATTACK_TRAIL_FADE_MS));
    const alpha = 1 - fadeProgress * 0.85;

    entry.graphics
      .moveTo(tailX, tailY)
      .lineTo(tipX, tipY)
      .stroke({ color, alpha, width: Math.max(1.25, cellSize * 0.045) });
    const headLength = Math.min(distance * reachProgress * 0.5, Math.max(6, cellSize * 0.18));
    if (headLength < 2) return;
    const headWidth = Math.min(headLength * 0.5, Math.max(3, cellSize * 0.09));
    const headBackX = tipX - headLength * Math.cos(angle);
    const headBackY = tipY - headLength * Math.sin(angle);
    const normalX = -Math.sin(angle);
    const normalY = Math.cos(angle);
    entry.graphics
      .moveTo(tipX, tipY)
      .lineTo(headBackX + normalX * headWidth, headBackY + normalY * headWidth)
      .lineTo(headBackX - normalX * headWidth, headBackY - normalY * headWidth)
      .closePath()
      .fill({ color, alpha });
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
      lastFrameAt: 0,
      frameIndex: 0,
      metrics: createPixiProfileMetrics(),
      counters: createPixiProfileCounters(),
      frameMetrics: createPixiProfileFrameMetrics(),
      frameCounters: createPixiProfileFrameCounters(),
      lastFrameSample: null,
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
      lastFrameAt: 0,
      frameIndex: 0,
      metrics: createPixiProfileMetrics(),
      counters: createPixiProfileCounters(),
      frameMetrics: createPixiProfileFrameMetrics(),
      frameCounters: createPixiProfileFrameCounters(),
      lastFrameSample: null,
    };
    resetRuntimeProfileFrameMetrics();
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

  private recordProfileFrame(frameAtMs: number, schedule: PixiProfileFrameSchedule): void {
    const state = this.profileState;
    if (!state) return;
    state.frameIndex += 1;
    const previousFrameAt = state.lastFrameAt;
    const frameIntervalMs = previousFrameAt > 0 ? Math.max(0, frameAtMs - previousFrameAt) : 0;
    state.lastFrameAt = frameAtMs;
    const renderer = this.buildProfileRendererState();
    const sample: PixiProfileFrameSample = {
      index: state.frameIndex,
      atMs: frameAtMs,
      frameIntervalMs,
      frameFps: frameIntervalMs > 0 ? 1000 / frameIntervalMs : null,
      schedule,
      totalMs: state.frameMetrics.renderFrame,
      metrics: { ...state.frameMetrics },
      runtimeMetrics: consumeRuntimeProfileFrameMetrics(),
      browser: consumeBrowserProfileFrameDiagnostics(frameAtMs),
      counters: { ...state.frameCounters },
      renderer,
    };
    state.lastFrameSample = sample;
    this.profileWindow?.recordFrame(sample);
    state.frameMetrics = createPixiProfileFrameMetrics();
    state.frameCounters = createPixiProfileFrameCounters();
  }

  private buildProfileRendererState(): PixiProfileSnapshot['renderer'] {
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
      floatingTexts: this.floatingTexts.length,
      attackTrails: this.attackTrails.length,
      warningZones: this.warningZones.length,
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
      latestFrame: state.lastFrameSample,
    };
    window.__mudPixiProfile = snapshot;
  }

  private resolveActionTextStyle(effect: Extract<CombatEffect, { type: 'float' }>): FloatingActionTextStyle | undefined {
    if (effect.variant !== 'action') return undefined;
    if (effect.actionStyle) return effect.actionStyle;
    return isLocalDivineSkillName(effect.text) ? 'divine' : 'default';
  }
}

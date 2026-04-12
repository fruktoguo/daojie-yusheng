/**
 * 文字渲染器 —— 基于 Canvas 2D 的地图、实体、特效绘制，实现 IRenderer 接口
 */

import { IRenderer, SenseQiOverlayState, TargetingOverlayState, type FloatingActionTextStyle } from './types';
import {
  DEFAULT_AURA_LEVEL_BASE_VALUE,
  GameTimeState,
  GroundItemEntryView,
  GroundItemPileView,
  isOffsetInRange,
  ItemType,
  NpcQuestMarker,
  TILE_VISUAL_BG_COLORS,
  TILE_VISUAL_GLYPHS,
  TILE_VISUAL_GLYPH_COLORS,
  normalizeAuraLevelBaseValue,
  SENSE_QI_OVERLAY_STYLE,
  Tile,
  type MonsterTier,
  TechniqueGrade,
  TimePhaseId,
  VisibleBuffState,
} from '@mud/shared-next';
import { Camera } from './camera';
import { getCellSize } from '../display';
import { formatDisplayInteger } from '../utils/number';
import {
  PATH_ARROW_COLOR,
  PATH_FILL_COLOR,
  PATH_STROKE_COLOR,
  PATH_TARGET_CORE_COLOR,
  PATH_TARGET_FILL_COLOR,
  PATH_TARGET_STROKE_COLOR,
} from '../constants/visuals/path-highlight';
import {
  OTHER_THREAT_ARROW_COLOR,
  OTHER_THREAT_ARROW_GLOW,
  SELF_THREAT_ARROW_COLOR,
  SELF_THREAT_ARROW_GLOW,
} from '../constants/visuals/threat-arrow';
import {
  TILE_HIDDEN_FADE_MS,
  TIME_FILTER_LERP,
  TIME_ATMOSPHERE_PROFILES,
  type TimeAtmosphereProfile,
} from '../constants/visuals/time-atmosphere';
import { buildCanvasFont } from '../constants/ui/text';
import { getMonsterPresentation } from '../monster-presentation';
import { TextMeasureCache } from './text-measure-cache';
import { TileSpriteCache } from './tile-sprite-cache';

/** TimeAtmosphereState：定义该接口的能力与字段约束。 */
interface TimeAtmosphereState {
/** initialized：定义该变量以承载业务值。 */
  initialized: boolean;
/** overlay：定义该变量以承载业务值。 */
  overlay: [number, number, number, number];
/** sky：定义该变量以承载业务值。 */
  sky: [number, number, number, number];
/** horizon：定义该变量以承载业务值。 */
  horizon: [number, number, number, number];
/** vignetteAlpha：定义该变量以承载业务值。 */
  vignetteAlpha: number;
}

/** GroundItemTypePalette：定义该类型的结构与数据语义。 */
type GroundItemTypePalette = {
/** fill：定义该变量以承载业务值。 */
  fill: string;
/** stroke：定义该变量以承载业务值。 */
  stroke: string;
/** accent：定义该变量以承载业务值。 */
  accent: string;
/** text：定义该变量以承载业务值。 */
  text: string;
};

/** GroundItemGradePalette：定义该类型的结构与数据语义。 */
type GroundItemGradePalette = {
/** border：定义该变量以承载业务值。 */
  border: string;
/** glow：定义该变量以承载业务值。 */
  glow: string;
/** badgeFill：定义该变量以承载业务值。 */
  badgeFill: string;
/** badgeStroke：定义该变量以承载业务值。 */
  badgeStroke: string;
};

/** GROUND_ITEM_TYPE_PALETTES：定义该变量以承载业务值。 */
const GROUND_ITEM_TYPE_PALETTES: Record<ItemType, GroundItemTypePalette> = {
  equipment: {
    fill: 'rgba(46, 38, 30, 0.88)',
    stroke: 'rgba(205, 177, 128, 0.92)',
    accent: 'rgba(135, 103, 63, 0.9)',
    text: '#fff4dc',
  },
  material: {
    fill: 'rgba(32, 45, 40, 0.88)',
    stroke: 'rgba(123, 175, 135, 0.92)',
    accent: 'rgba(88, 126, 96, 0.9)',
    text: '#ecfff1',
  },
  consumable: {
    fill: 'rgba(59, 34, 42, 0.88)',
    stroke: 'rgba(217, 132, 168, 0.92)',
    accent: 'rgba(164, 83, 117, 0.9)',
    text: '#fff0f7',
  },
  quest_item: {
    fill: 'rgba(54, 32, 24, 0.9)',
    stroke: 'rgba(240, 185, 109, 0.94)',
    accent: 'rgba(181, 121, 50, 0.9)',
    text: '#fff5e3',
  },
  skill_book: {
    fill: 'rgba(34, 35, 54, 0.9)',
    stroke: 'rgba(139, 169, 240, 0.94)',
    accent: 'rgba(86, 109, 182, 0.9)',
    text: '#edf3ff',
  },
};

/** GROUND_ITEM_GRADE_PALETTES：定义该变量以承载业务值。 */
const GROUND_ITEM_GRADE_PALETTES: Record<TechniqueGrade, GroundItemGradePalette> = {
  mortal: {
    border: 'rgba(188, 176, 149, 0.96)',
    glow: 'rgba(188, 176, 149, 0.24)',
    badgeFill: 'rgba(76, 66, 51, 0.96)',
    badgeStroke: 'rgba(214, 200, 164, 0.82)',
  },
  yellow: {
    border: 'rgba(245, 211, 111, 0.98)',
    glow: 'rgba(245, 211, 111, 0.28)',
    badgeFill: 'rgba(119, 86, 26, 0.96)',
    badgeStroke: 'rgba(255, 228, 149, 0.88)',
  },
  mystic: {
    border: 'rgba(111, 188, 255, 0.98)',
    glow: 'rgba(111, 188, 255, 0.28)',
    badgeFill: 'rgba(28, 70, 111, 0.96)',
    badgeStroke: 'rgba(166, 216, 255, 0.88)',
  },
  earth: {
    border: 'rgba(152, 199, 116, 0.98)',
    glow: 'rgba(152, 199, 116, 0.28)',
    badgeFill: 'rgba(56, 96, 38, 0.96)',
    badgeStroke: 'rgba(199, 234, 169, 0.88)',
  },
  heaven: {
    border: 'rgba(255, 156, 111, 0.98)',
    glow: 'rgba(255, 156, 111, 0.32)',
    badgeFill: 'rgba(121, 53, 27, 0.96)',
    badgeStroke: 'rgba(255, 204, 182, 0.88)',
  },
  spirit: {
    border: 'rgba(168, 142, 255, 0.98)',
    glow: 'rgba(168, 142, 255, 0.32)',
    badgeFill: 'rgba(72, 49, 126, 0.96)',
    badgeStroke: 'rgba(214, 199, 255, 0.9)',
  },
  saint: {
    border: 'rgba(255, 122, 167, 0.98)',
    glow: 'rgba(255, 122, 167, 0.32)',
    badgeFill: 'rgba(125, 35, 67, 0.96)',
    badgeStroke: 'rgba(255, 196, 217, 0.9)',
  },
  emperor: {
    border: 'rgba(255, 95, 95, 0.98)',
    glow: 'rgba(255, 95, 95, 0.34)',
    badgeFill: 'rgba(125, 22, 22, 0.96)',
    badgeStroke: 'rgba(255, 187, 187, 0.92)',
  },
};

/** DEFAULT_GROUND_ITEM_GRADE：定义该变量以承载业务值。 */
const DEFAULT_GROUND_ITEM_GRADE: TechniqueGrade = 'mortal';
/** GROUND_ITEM_GRID_SIZE：定义该变量以承载业务值。 */
const GROUND_ITEM_GRID_SIZE = 3;
/** GROUND_ITEM_ICON_POSITIONS：定义该变量以承载业务值。 */
const GROUND_ITEM_ICON_POSITIONS = [
  { col: 2, row: 2 },
  { col: 1, row: 2 },
  { col: 0, row: 2 },
  { col: 2, row: 1 },
  { col: 1, row: 1 },
  { col: 0, row: 1 },
  { col: 2, row: 0 },
  { col: 1, row: 0 },
  { col: 0, row: 0 },
] as const;

/** resolveGroundItemLabel：执行对应的业务逻辑。 */
function resolveGroundItemLabel(entry: GroundItemEntryView): string {
/** explicit：定义该变量以承载业务值。 */
  const explicit = [...(entry.groundLabel?.trim() ?? '')].filter((char) => char.trim().length > 0).join('');
  if (explicit) {
    return explicit.slice(0, 2);
  }
/** chars：定义该变量以承载业务值。 */
  const chars = [...entry.name.trim()].filter((char) => char.trim().length > 0);
/** hanChar：定义该变量以承载业务值。 */
  const hanChar = chars.find((char) => /[\u3400-\u9fff\uf900-\ufaff]/u.test(char));
  if (hanChar) {
    return hanChar;
  }
/** wordChar：定义该变量以承载业务值。 */
  const wordChar = chars.find((char) => /[A-Za-z0-9]/.test(char));
  if (wordChar) {
    return wordChar.toUpperCase();
  }
  return chars[0]?.slice(0, 1) ?? '?';
}

/** resolveGroundItemGradePalette：执行对应的业务逻辑。 */
function resolveGroundItemGradePalette(grade?: TechniqueGrade): GroundItemGradePalette {
  return GROUND_ITEM_GRADE_PALETTES[grade ?? DEFAULT_GROUND_ITEM_GRADE] ?? GROUND_ITEM_GRADE_PALETTES[DEFAULT_GROUND_ITEM_GRADE];
}

/** easeOutCubic：执行对应的业务逻辑。 */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** easeInOutCubic：执行对应的业务逻辑。 */
function easeInOutCubic(t: number): number {
  if (t < 0.5) {
    return 4 * t * t * t;
  }
  return 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** getSenseQiOverlayStyle：执行对应的业务逻辑。 */
function getSenseQiOverlayStyle(aura: number, levelBaseValue = DEFAULT_AURA_LEVEL_BASE_VALUE): string {
  void levelBaseValue;
/** normalized：定义该变量以承载业务值。 */
  const normalized = Math.max(0, Math.min(aura, SENSE_QI_OVERLAY_STYLE.maxAuraLevel)) / SENSE_QI_OVERLAY_STYLE.maxAuraLevel;
/** red：定义该变量以承载业务值。 */
  const red = Math.round(SENSE_QI_OVERLAY_STYLE.baseRed + normalized * SENSE_QI_OVERLAY_STYLE.redRange);
/** green：定义该变量以承载业务值。 */
  const green = Math.round(SENSE_QI_OVERLAY_STYLE.baseGreen + normalized * SENSE_QI_OVERLAY_STYLE.greenRange);
/** blue：定义该变量以承载业务值。 */
  const blue = Math.round(SENSE_QI_OVERLAY_STYLE.baseBlue + normalized * SENSE_QI_OVERLAY_STYLE.blueRange);
/** alpha：定义该变量以承载业务值。 */
  const alpha = SENSE_QI_OVERLAY_STYLE.baseAlpha - normalized * SENSE_QI_OVERLAY_STYLE.alphaRange;
  return `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(3)})`;
}

/** AnimEntity：定义该接口的能力与字段约束。 */
interface AnimEntity {
/** id：定义该变量以承载业务值。 */
  id: string;
/** gridX：定义该变量以承载业务值。 */
  gridX: number;
/** gridY：定义该变量以承载业务值。 */
  gridY: number;
/** oldWX：定义该变量以承载业务值。 */
  oldWX: number;
/** oldWY：定义该变量以承载业务值。 */
  oldWY: number;
/** targetWX：定义该变量以承载业务值。 */
  targetWX: number;
/** targetWY：定义该变量以承载业务值。 */
  targetWY: number;
/** char：定义该变量以承载业务值。 */
  char: string;
/** color：定义该变量以承载业务值。 */
  color: string;
  name?: string;
  kind?: string;
  monsterTier?: MonsterTier;
  monsterScale?: number;
  hp?: number;
  maxHp?: number;
  npcQuestMarker?: NpcQuestMarker;
  buffs?: VisibleBuffState[];
}

/** RenderedAnimEntity：定义该接口的能力与字段约束。 */
interface RenderedAnimEntity {
/** anim：定义该变量以承载业务值。 */
  anim: AnimEntity;
/** presentation：定义该变量以承载业务值。 */
  presentation: ReturnType<typeof getMonsterPresentation> | null;
/** sx：定义该变量以承载业务值。 */
  sx: number;
/** sy：定义该变量以承载业务值。 */
  sy: number;
/** centerX：定义该变量以承载业务值。 */
  centerX: number;
/** centerY：定义该变量以承载业务值。 */
  centerY: number;
/** cellSize：定义该变量以承载业务值。 */
  cellSize: number;
/** visualSx：定义该变量以承载业务值。 */
  visualSx: number;
/** visualSy：定义该变量以承载业务值。 */
  visualSy: number;
/** visualCellSize：定义该变量以承载业务值。 */
  visualCellSize: number;
}

/** FloatingText：定义该接口的能力与字段约束。 */
interface FloatingText {
/** id：定义该变量以承载业务值。 */
  id: number;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** text：定义该变量以承载业务值。 */
  text: string;
/** color：定义该变量以承载业务值。 */
  color: string;
/** variant：定义该变量以承载业务值。 */
  variant: 'damage' | 'action';
  actionStyle?: FloatingActionTextStyle;
/** createdAt：定义该变量以承载业务值。 */
  createdAt: number;
/** duration：定义该变量以承载业务值。 */
  duration: number;
}

/** AttackTrail：定义该接口的能力与字段约束。 */
interface AttackTrail {
/** id：定义该变量以承载业务值。 */
  id: number;
/** fromX：定义该变量以承载业务值。 */
  fromX: number;
/** fromY：定义该变量以承载业务值。 */
  fromY: number;
/** toX：定义该变量以承载业务值。 */
  toX: number;
/** toY：定义该变量以承载业务值。 */
  toY: number;
/** color：定义该变量以承载业务值。 */
  color: string;
/** createdAt：定义该变量以承载业务值。 */
  createdAt: number;
/** duration：定义该变量以承载业务值。 */
  duration: number;
}

/** WarningZone：定义该接口的能力与字段约束。 */
interface WarningZone {
/** id：定义该变量以承载业务值。 */
  id: number;
/** cells：定义该变量以承载业务值。 */
  cells: Array<{ x: number; y: number; expandDistance: number }>;
/** color：定义该变量以承载业务值。 */
  color: string;
/** baseColor：定义该变量以承载业务值。 */
  baseColor: string;
/** originX：定义该变量以承载业务值。 */
  originX: number;
/** originY：定义该变量以承载业务值。 */
  originY: number;
/** maxExpandDistance：定义该变量以承载业务值。 */
  maxExpandDistance: number;
/** createdAt：定义该变量以承载业务值。 */
  createdAt: number;
/** duration：定义该变量以承载业务值。 */
  duration: number;
}

/** FloatingTextBurstOffset：定义该接口的能力与字段约束。 */
interface FloatingTextBurstOffset {
/** offsetX：定义该变量以承载业务值。 */
  offsetX: number;
/** offsetY：定义该变量以承载业务值。 */
  offsetY: number;
}

/** FadingPathState：定义该接口的能力与字段约束。 */
interface FadingPathState {
/** cells：定义该变量以承载业务值。 */
  cells: { x: number; y: number }[];
/** keys：定义该变量以承载业务值。 */
  keys: Set<string>;
/** indexByKey：定义该变量以承载业务值。 */
  indexByKey: Map<string, number>;
/** targetKey：定义该变量以承载业务值。 */
  targetKey: string | null;
/** startedAt：定义该变量以承载业务值。 */
  startedAt: number;
/** durationMs：定义该变量以承载业务值。 */
  durationMs: number;
}

/** DEFAULT_PATH_TRAIL_FADE_MS：定义该变量以承载业务值。 */
const DEFAULT_PATH_TRAIL_FADE_MS = 500;
/** PATH_TRAIL_FADE_ALPHA：定义该变量以承载业务值。 */
const PATH_TRAIL_FADE_ALPHA = 0.7;
/** MAX_FLOATING_TEXTS：定义该变量以承载业务值。 */
const MAX_FLOATING_TEXTS = 256;
/** MAX_ATTACK_TRAILS：定义该变量以承载业务值。 */
const MAX_ATTACK_TRAILS = 192;
/** MAX_WARNING_ZONES：定义该变量以承载业务值。 */
const MAX_WARNING_ZONES = 64;
/** DEFAULT_WARNING_ZONE_DURATION_MS：定义该变量以承载业务值。 */
const DEFAULT_WARNING_ZONE_DURATION_MS = 1240;

/** 文字渲染器，用汉字字符绘制地图地块、实体角色和战斗特效 */
export class TextRenderer implements IRenderer {
/** ctx：定义该变量以承载业务值。 */
  private ctx: CanvasRenderingContext2D | null = null;
/** entities：定义该变量以承载业务值。 */
  private entities: Map<string, AnimEntity> = new Map();
/** threatArrows：定义该变量以承载业务值。 */
  private threatArrows: Array<{ ownerId: string; targetId: string }> = [];
  private groundPiles = new Map<string, GroundItemPileView>();
  private containerTileKeys = new Set<string>();
/** pathCells：定义该变量以承载业务值。 */
  private pathCells: { x: number; y: number }[] = [];
  private pathKeys = new Set<string>();
  private pathIndexByKey = new Map<string, number>();
/** pathTargetKey：定义该变量以承载业务值。 */
  private pathTargetKey: string | null = null;
/** fadingPath：定义该变量以承载业务值。 */
  private fadingPath: FadingPathState | null = null;
/** targetingOverlay：定义该变量以承载业务值。 */
  private targetingOverlay: TargetingOverlayState | null = null;
/** senseQiOverlay：定义该变量以承载业务值。 */
  private senseQiOverlay: SenseQiOverlayState | null = null;
  private targetingAffectedKeys = new Set<string>();
/** floatingTexts：定义该变量以承载业务值。 */
  private floatingTexts: FloatingText[] = [];
/** attackTrails：定义该变量以承载业务值。 */
  private attackTrails: AttackTrail[] = [];
/** warningZones：定义该变量以承载业务值。 */
  private warningZones: WarningZone[] = [];
  private nextFloatingTextId = 1;
  private nextAttackTrailId = 1;
  private nextWarningZoneId = 1;
  private lastMotionSyncToken?: number;
  private previousVisibleTileKeys = new Set<string>();
  private previousVisibleTileRevision = -1;
  private hiddenTileFadeStartedAt = new Map<string, number>();
  private visibleTileFadeStartedAt = new Map<string, number>();
  private readonly textMeasureCache = new TextMeasureCache();
  private readonly tileSpriteCache = new TileSpriteCache();
/** timeAtmosphere：定义该变量以承载业务值。 */
  private timeAtmosphere: TimeAtmosphereState = {
    initialized: false,
    overlay: [0, 0, 0, 0],
    sky: [0, 0, 0, 0],
    horizon: [0, 0, 0, 0],
    vignetteAlpha: 0,
  };

/** init：处理当前场景中的对应操作。 */
  init(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

/** clear：处理当前场景中的对应操作。 */
  clear() {
    if (!this.ctx) return;
    const { width, height } = this.ctx.canvas;
    this.ctx.fillStyle = '#1a1816';
    this.ctx.fillRect(0, 0, width, height);
  }

/** resetScene：处理当前场景中的对应操作。 */
  resetScene() {
    this.entities.clear();
    this.threatArrows = [];
    this.groundPiles.clear();
    this.containerTileKeys.clear();
    this.floatingTexts = [];
    this.attackTrails = [];
    this.warningZones = [];
    this.lastMotionSyncToken = undefined;
    this.previousVisibleTileKeys.clear();
    this.previousVisibleTileRevision = -1;
    this.hiddenTileFadeStartedAt.clear();
    this.visibleTileFadeStartedAt.clear();
    this.textMeasureCache.clear();
    this.timeAtmosphere.initialized = false;
    this.fadingPath = null;
  }

  /** 设置寻路路径高亮格子列表 */
  setPathHighlight(cells: { x: number; y: number }[], fadeDurationMs = DEFAULT_PATH_TRAIL_FADE_MS) {
    if (this.pathCells.length > 0 && !this.arePathCellsEqual(this.pathCells, cells)) {
      this.fadingPath = {
        cells: this.pathCells.map((cell) => ({ x: cell.x, y: cell.y })),
        keys: new Set(this.pathKeys),
        indexByKey: new Map(this.pathIndexByKey),
        targetKey: this.pathTargetKey,
        startedAt: performance.now(),
        durationMs: Math.max(1, Math.round(fadeDurationMs)),
      };
    }
    this.pathCells = cells;
    this.pathKeys = new Set(cells.map((cell) => `${cell.x},${cell.y}`));
    this.pathIndexByKey = new Map(cells.map((cell, index) => [`${cell.x},${cell.y}`, index]));
    this.pathTargetKey = cells.length > 0 ? `${cells[cells.length - 1].x},${cells[cells.length - 1].y}` : null;
  }

/** setThreatArrows：处理当前场景中的对应操作。 */
  setThreatArrows(arrows: Array<{ ownerId: string; targetId: string }>) {
    this.threatArrows = arrows.map((entry) => ({ ownerId: entry.ownerId, targetId: entry.targetId }));
  }

/** setTargetingOverlay：处理当前场景中的对应操作。 */
  setTargetingOverlay(state: TargetingOverlayState | null) {
    this.targetingOverlay = state;
    this.targetingAffectedKeys = new Set((state?.affectedCells ?? []).map((cell) => `${cell.x},${cell.y}`));
  }

/** setSenseQiOverlay：处理当前场景中的对应操作。 */
  setSenseQiOverlay(state: SenseQiOverlayState | null) {
    this.senseQiOverlay = state;
  }

/** setGroundPiles：处理当前场景中的对应操作。 */
  setGroundPiles(piles: ReadonlyMap<string, GroundItemPileView> | Iterable<GroundItemPileView>) {
    if (piles instanceof Map) {
      this.groundPiles = piles;
      return;
    }
/** nextPiles：定义该变量以承载业务值。 */
    const nextPiles = new Map<string, GroundItemPileView>();
    for (const pile of piles as Iterable<GroundItemPileView>) {
      nextPiles.set(`${pile.x},${pile.y}`, pile);
    }
    this.groundPiles = nextPiles;
  }

  /** 绘制地图地块、路径高亮、瞄准叠加层和感气视角 */
  renderWorld(
    camera: Camera,
    tileCache: ReadonlyMap<string, Tile>,
    visibleTiles: ReadonlySet<string>,
    visibleTileRevision: number,
    playerX: number,
    playerY: number,
    displayRangeX: number,
    displayRangeY: number,
    time: GameTimeState | null,
  ) {
    if (!this.ctx) return;
/** ctx：定义该变量以承载业务值。 */
    const ctx = this.ctx;
/** sw：定义该变量以承载业务值。 */
    const sw = ctx.canvas.width;
/** sh：定义该变量以承载业务值。 */
    const sh = ctx.canvas.height;
/** cellSize：定义该变量以承载业务值。 */
    const cellSize = getCellSize();
/** now：定义该变量以承载业务值。 */
    const now = performance.now();
/** senseQiLevelBaseValue：定义该变量以承载业务值。 */
    const senseQiLevelBaseValue = normalizeAuraLevelBaseValue(this.senseQiOverlay?.levelBaseValue);
/** fadingPathAlpha：定义该变量以承载业务值。 */
    const fadingPathAlpha = this.getFadingPathAlpha(now);

    if (visibleTileRevision !== this.previousVisibleTileRevision) {
      this.syncTileVisibilityTransitions(visibleTiles, tileCache, now);
      this.previousVisibleTileRevision = visibleTileRevision;
    }

    // 屏幕可见格子范围
    const camWorldX = camera.x - sw / 2;
/** camWorldY：定义该变量以承载业务值。 */
    const camWorldY = camera.y - sh / 2;
/** startGX：定义该变量以承载业务值。 */
    const startGX = Math.floor(camWorldX / cellSize) - 1;
/** startGY：定义该变量以承载业务值。 */
    const startGY = Math.floor(camWorldY / cellSize) - 1;
/** endGX：定义该变量以承载业务值。 */
    const endGX = Math.ceil((camWorldX + sw) / cellSize) + 1;
/** endGY：定义该变量以承载业务值。 */
    const endGY = Math.ceil((camWorldY + sh) / cellSize) + 1;

    for (let gy = startGY; gy <= endGY; gy++) {
      for (let gx = startGX; gx <= endGX; gx++) {
        const { sx, sy } = camera.worldToScreen(gx * cellSize, gy * cellSize, sw, sh);
        if (sx + cellSize < 0 || sx > sw || sy + cellSize < 0 || sy > sh) continue;

/** key：定义该变量以承载业务值。 */
        const key = `${gx},${gy}`;
/** tile：定义该变量以承载业务值。 */
        const tile = tileCache.get(key);
/** isVisible：定义该变量以承载业务值。 */
        const isVisible = visibleTiles.has(key);
/** hiddenFade：定义该变量以承载业务值。 */
        const hiddenFade = this.getHiddenTileFade(key, now);
/** visibleFade：定义该变量以承载业务值。 */
        const visibleFade = this.getVisibleTileFade(key, now);

        if (!isVisible && Math.abs(gx - playerX) > displayRangeX) continue;
        if (!isVisible && Math.abs(gy - playerY) > displayRangeY) continue;
        if (!tile && !isVisible) continue;

        if (tile) {
          this.tileSpriteCache.drawSprite(ctx, tile.type, cellSize, sx, sy);

          if (
            this.fadingPath
            && fadingPathAlpha > 0
            && !this.pathKeys.has(key)
            && this.fadingPath.keys.has(key)
          ) {
            this.drawPathCellHighlight(ctx, sx, sy, cellSize, key === this.fadingPath.targetKey, fadingPathAlpha * PATH_TRAIL_FADE_ALPHA);
          }

          // 路径高亮
          if (this.pathKeys.has(key)) {
            this.drawPathCellHighlight(ctx, sx, sy, cellSize, key === this.pathTargetKey, 1);
          }

          if ((tile.maxHp ?? 0) > 0 && tile.hpVisible) {
/** ratio：定义该变量以承载业务值。 */
            const ratio = Math.max(0, Math.min(1, (tile.hp ?? 0) / Math.max(tile.maxHp ?? 1, 1)));
/** barX：定义该变量以承载业务值。 */
            const barX = sx + 3;
/** barY：定义该变量以承载业务值。 */
            const barY = sy + 2;
/** barW：定义该变量以承载业务值。 */
            const barW = cellSize - 6;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(barX, barY, barW, 3);
            ctx.fillStyle = '#d6c8ae';
            ctx.fillRect(barX, barY, barW * ratio, 3);
          }

          if (isVisible) {
/** pile：定义该变量以承载业务值。 */
            const pile = this.groundPiles.get(key);
            if (pile && !this.containerTileKeys.has(key)) {
              this.drawGroundPileIndicator(sx, sy, cellSize, pile);
            }
          }

          if (this.targetingOverlay && (!this.targetingOverlay.visibleOnly || isVisible)) {
/** dx：定义该变量以承载业务值。 */
            const dx = gx - this.targetingOverlay.originX;
/** dy：定义该变量以承载业务值。 */
            const dy = gy - this.targetingOverlay.originY;
/** hovered：定义该变量以承载业务值。 */
            const hovered = gx === this.targetingOverlay.hoverX && gy === this.targetingOverlay.hoverY;
/** affected：定义该变量以承载业务值。 */
            const affected = this.targetingAffectedKeys.has(key);
/** inCastRange：定义该变量以承载业务值。 */
            const inCastRange = (dx !== 0 || dy !== 0) && isOffsetInRange(dx, dy, this.targetingOverlay.range);
            if (inCastRange || affected) {
              ctx.fillStyle = affected
                ? (hovered ? 'rgba(208, 76, 56, 0.42)' : 'rgba(198, 72, 48, 0.3)')
                : (hovered ? 'rgba(66, 153, 225, 0.3)' : 'rgba(88, 180, 214, 0.18)');
              ctx.fillRect(sx + 1, sy + 1, cellSize - 2, cellSize - 2);
              ctx.strokeStyle = affected
                ? (hovered ? 'rgba(150, 28, 24, 0.98)' : 'rgba(171, 56, 36, 0.9)')
                : (hovered ? 'rgba(125, 211, 252, 0.94)' : 'rgba(151, 236, 255, 0.72)');
              ctx.lineWidth = hovered || affected ? 2 : 1;
              ctx.strokeRect(sx + 1.5, sy + 1.5, cellSize - 3, cellSize - 3);
            }
          }
        }

        if (!isVisible) {
/** overlayAlpha：定义该变量以承载业务值。 */
          const overlayAlpha = tile ? 0.72 * hiddenFade : 0.94 * hiddenFade;
          ctx.fillStyle = tile
            ? `rgba(12, 10, 8, ${overlayAlpha.toFixed(3)})`
            : `rgba(8, 6, 5, ${overlayAlpha.toFixed(3)})`;
          ctx.fillRect(sx, sy, cellSize, cellSize);
        } else if (visibleFade > 0) {
/** overlayAlpha：定义该变量以承载业务值。 */
          const overlayAlpha = 0.72 * visibleFade;
          ctx.fillStyle = `rgba(12, 10, 8, ${overlayAlpha.toFixed(3)})`;
          ctx.fillRect(sx, sy, cellSize, cellSize);
        }

        if (tile && this.senseQiOverlay) {
/** senseQiAura：定义该变量以承载业务值。 */
          const senseQiAura = isVisible ? tile.aura : 0;
          ctx.fillStyle = getSenseQiOverlayStyle(senseQiAura, senseQiLevelBaseValue);
          ctx.fillRect(sx, sy, cellSize, cellSize);
          if (isVisible && gx === this.senseQiOverlay.hoverX && gy === this.senseQiOverlay.hoverY) {
            ctx.strokeStyle = SENSE_QI_OVERLAY_STYLE.hoverStroke;
            ctx.lineWidth = 2;
            ctx.strokeRect(sx + 1, sy + 1, cellSize - 2, cellSize - 2);
          }
        }
      }
    }

    this.renderPathArrows(camera, visibleTiles, playerX, playerY, displayRangeX, displayRangeY);
    this.renderTimeOverlay(time);
  }

/** syncTileVisibilityTransitions：执行对应的业务逻辑。 */
  private syncTileVisibilityTransitions(visibleTiles: ReadonlySet<string>, tileCache: ReadonlyMap<string, Tile>, now: number): void {
/** shouldAnimateVisibleEnter：定义该变量以承载业务值。 */
    const shouldAnimateVisibleEnter = this.previousVisibleTileKeys.size > 0;
    for (const key of this.previousVisibleTileKeys) {
      if (!visibleTiles.has(key) && tileCache.has(key) && !this.hiddenTileFadeStartedAt.has(key)) {
        this.hiddenTileFadeStartedAt.set(key, now);
      }
    }
    for (const key of visibleTiles) {
      if (shouldAnimateVisibleEnter && !this.previousVisibleTileKeys.has(key) && tileCache.has(key) && !this.visibleTileFadeStartedAt.has(key)) {
        this.visibleTileFadeStartedAt.set(key, now);
      }
      this.hiddenTileFadeStartedAt.delete(key);
    }
    for (const key of this.previousVisibleTileKeys) {
      if (!visibleTiles.has(key)) {
        this.visibleTileFadeStartedAt.delete(key);
      }
    }
    for (const [key, startedAt] of this.hiddenTileFadeStartedAt) {
      if (!tileCache.has(key) || now - startedAt >= TILE_HIDDEN_FADE_MS) {
        this.hiddenTileFadeStartedAt.delete(key);
      }
    }
    for (const [key, startedAt] of this.visibleTileFadeStartedAt) {
      if (!visibleTiles.has(key) || !tileCache.has(key) || now - startedAt >= TILE_HIDDEN_FADE_MS) {
        this.visibleTileFadeStartedAt.delete(key);
      }
    }
    this.previousVisibleTileKeys = new Set(visibleTiles);
  }

/** getHiddenTileFade：执行对应的业务逻辑。 */
  private getHiddenTileFade(key: string, now: number): number {
/** startedAt：定义该变量以承载业务值。 */
    const startedAt = this.hiddenTileFadeStartedAt.get(key);
    if (startedAt === undefined) {
      return 1;
    }
    return Math.max(0, Math.min(1, (now - startedAt) / TILE_HIDDEN_FADE_MS));
  }

/** getVisibleTileFade：执行对应的业务逻辑。 */
  private getVisibleTileFade(key: string, now: number): number {
/** startedAt：定义该变量以承载业务值。 */
    const startedAt = this.visibleTileFadeStartedAt.get(key);
    if (startedAt === undefined) {
      return 0;
    }
/** progress：定义该变量以承载业务值。 */
    const progress = Math.max(0, Math.min(1, (now - startedAt) / TILE_HIDDEN_FADE_MS));
    return 1 - progress;
  }

  /** 更新实体列表，记录旧位置用于插值动画 */
  updateEntities(
/** list：定义该变量以承载业务值。 */
    list: readonly { id: string; wx: number; wy: number; char: string; color: string; name?: string; kind?: string; monsterTier?: MonsterTier; monsterScale?: number; hp?: number; maxHp?: number; npcQuestMarker?: NpcQuestMarker | null; buffs?: VisibleBuffState[] }[],
    movedId?: string,
    shiftX = 0,
    shiftY = 0,
    settleMotion = false,
    settleEntityId?: string,
    motionSyncToken?: number,
  ) {
/** seen：定义该变量以承载业务值。 */
    const seen = new Set<string>();
/** cellSize：定义该变量以承载业务值。 */
    const cellSize = getCellSize();
/** sameMotionSync：定义该变量以承载业务值。 */
    const sameMotionSync = motionSyncToken !== undefined && motionSyncToken === this.lastMotionSyncToken;
    this.containerTileKeys = new Set(
      list
        .filter((entry) => entry.kind === 'container')
        .map((entry) => `${entry.wx},${entry.wy}`),
    );
    for (const e of list) {
      seen.add(e.id);
      const twx = e.wx * cellSize;
/** twy：定义该变量以承载业务值。 */
      const twy = e.wy * cellSize;
/** anim：定义该变量以承载业务值。 */
      const anim = this.entities.get(e.id);
      if (anim) {
/** sameGrid：定义该变量以承载业务值。 */
        const sameGrid = anim.gridX === e.wx && anim.gridY === e.wy;
/** sameTarget：定义该变量以承载业务值。 */
        const sameTarget = anim.targetWX === twx && anim.targetWY === twy;
        if (e.id === movedId) {
          anim.oldWX = (e.wx - shiftX) * cellSize;
          anim.oldWY = (e.wy - shiftY) * cellSize;
          anim.targetWX = twx;
          anim.targetWY = twy;
        } else if (settleMotion && e.id === settleEntityId) {
          anim.oldWX = twx;
          anim.oldWY = twy;
          anim.targetWX = twx;
          anim.targetWY = twy;
        } else if (sameGrid && sameTarget && sameMotionSync) {
          // 同一 tick 内重复同步同一份实体快照时，保留已有插值状态，避免动画被覆盖掉。
        } else if (sameGrid && sameTarget) {
          anim.oldWX = twx;
          anim.oldWY = twy;
          anim.targetWX = twx;
          anim.targetWY = twy;
        } else if (sameGrid) {
          anim.oldWX = twx;
          anim.oldWY = twy;
          anim.targetWX = twx;
          anim.targetWY = twy;
        } else {
          anim.oldWX = anim.targetWX;
          anim.oldWY = anim.targetWY;
          anim.targetWX = twx;
          anim.targetWY = twy;
        }
        anim.gridX = e.wx;
        anim.gridY = e.wy;
        anim.char = e.char;
        anim.color = e.color;
        anim.name = e.name;
        anim.kind = e.kind;
        anim.monsterTier = e.monsterTier;
        anim.monsterScale = e.monsterScale;
        anim.hp = e.hp;
        anim.maxHp = e.maxHp;
        anim.npcQuestMarker = e.npcQuestMarker ?? undefined;
        anim.buffs = e.buffs;
      } else {
        this.entities.set(e.id, {
          id: e.id,
          gridX: e.wx,
          gridY: e.wy,
          oldWX: twx,
          oldWY: twy,
          targetWX: twx,
          targetWY: twy,
          char: e.char,
          color: e.color,
          name: e.name,
          kind: e.kind,
          monsterTier: e.monsterTier,
          monsterScale: e.monsterScale,
          hp: e.hp,
          maxHp: e.maxHp,
          npcQuestMarker: e.npcQuestMarker ?? undefined,
          buffs: e.buffs,
        });
      }
    }
    for (const id of this.entities.keys()) {
      if (!seen.has(id)) this.entities.delete(id);
    }
    if (motionSyncToken !== undefined) {
      this.lastMotionSyncToken = motionSyncToken;
    }
  }

  /** 绘制所有实体（角色/怪物/NPC），含位置插值动画 */
  renderEntities(camera: Camera, progress = 1, localPlayerId?: string, localPlayerX?: number, localPlayerY?: number) {
    if (!this.ctx) return;
/** ctx：定义该变量以承载业务值。 */
    const ctx = this.ctx;
/** sw：定义该变量以承载业务值。 */
    const sw = ctx.canvas.width;
/** sh：定义该变量以承载业务值。 */
    const sh = ctx.canvas.height;
/** cellSize：定义该变量以承载业务值。 */
    const cellSize = getCellSize();
/** renderedEntities：定义该变量以承载业务值。 */
    const renderedEntities: RenderedAnimEntity[] = [];
/** motionProgress：定义该变量以承载业务值。 */
    const motionProgress = Math.max(0, Math.min(1, progress));
/** t：定义该变量以承载业务值。 */
    const t = easeInOutCubic(motionProgress);

    for (const anim of this.entities.values()) {
      const wx = anim.oldWX + (anim.targetWX - anim.oldWX) * t;
      const wy = anim.oldWY + (anim.targetWY - anim.oldWY) * t;

      const { sx, sy } = camera.worldToScreen(wx, wy, sw, sh);
      if (sx + cellSize < 0 || sx > sw || sy + cellSize < 0 || sy > sh) continue;
/** presentation：定义该变量以承载业务值。 */
      const presentation = anim.kind === 'monster'
        ? getMonsterPresentation(anim.name, anim.monsterTier)
        : null;
/** visualScale：定义该变量以承载业务值。 */
      const visualScale = (presentation?.scale ?? 1) * Math.max(1, anim.monsterScale ?? 1);
/** visualCellSize：定义该变量以承载业务值。 */
      const visualCellSize = cellSize * visualScale;
/** visualSx：定义该变量以承载业务值。 */
      const visualSx = sx - (visualCellSize - cellSize) / 2;
/** visualSy：定义该变量以承载业务值。 */
      const visualSy = sy - (visualCellSize - cellSize);
      renderedEntities.push({
        anim,
        presentation,
        sx,
        sy,
        centerX: visualSx + visualCellSize / 2,
        centerY: visualSy + visualCellSize / 2,
        cellSize,
        visualSx,
        visualSy,
        visualCellSize,
      });
    }

/** crowdedTileKeys：定义该变量以承载业务值。 */
    const crowdedTileKeys = new Set(
      renderedEntities
        .filter((entry) => entry.anim.kind === 'crowd')
        .map((entry) => `${entry.anim.gridX},${entry.anim.gridY}`),
    );

/** localPlayerRendered：定义该变量以承载业务值。 */
    let localPlayerRendered: RenderedAnimEntity | undefined;
    if (localPlayerId !== undefined
      && Number.isFinite(localPlayerX)
      && Number.isFinite(localPlayerY)
      && !renderedEntities.some((entry) => entry.anim.id === localPlayerId)) {
      const { sx, sy } = camera.worldToScreen(localPlayerX as number, localPlayerY as number, sw, sh);
      localPlayerRendered = {
        anim: {
          id: localPlayerId,
          gridX: localPlayerX as number,
          gridY: localPlayerY as number,
          oldWX: localPlayerX as number,
          oldWY: localPlayerY as number,
          targetWX: localPlayerX as number,
          targetWY: localPlayerY as number,
          char: '@',
          color: '#fff4dc',
          kind: 'player',
        },
        presentation: null,
        sx,
        sy,
        centerX: sx + cellSize / 2,
        centerY: sy + cellSize / 2,
        cellSize,
        visualSx: sx,
        visualSy: sy,
        visualCellSize: cellSize,
      };
    }

    this.renderThreatTargetArrows(renderedEntities, localPlayerId, localPlayerRendered);

    for (const rendered of renderedEntities) {
      const { anim, presentation: monsterPresentation, sx, sy, cellSize: renderedCellSize, visualSx, visualSy, visualCellSize } = rendered;
      const isCrowd = anim.kind === 'crowd';

      if (!isCrowd && anim.kind === 'player' && crowdedTileKeys.has(`${anim.gridX},${anim.gridY}`)) {
        continue;
      }

      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(sx + renderedCellSize / 2, sy + renderedCellSize - 3, visualCellSize * 0.32, Math.max(2, visualCellSize * 0.1), 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = anim.color;
      ctx.font = buildCanvasFont('entityGlyph', visualCellSize * 0.75);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      this.drawOutlinedText(anim.char, visualSx + visualCellSize / 2, visualSy + visualCellSize / 2, anim.color, 'rgba(15,12,10,0.9)');

      if (anim.kind) {
/** isMonster：定义该变量以承载业务值。 */
        const isMonster = anim.kind === 'monster';
/** isPlayer：定义该变量以承载业务值。 */
        const isPlayer = anim.kind === 'player';
/** isNpc：定义该变量以承载业务值。 */
        const isNpc = anim.kind === 'npc';
/** isContainer：定义该变量以承载业务值。 */
        const isContainer = anim.kind === 'container';
/** label：定义该变量以承载业务值。 */
        const label = monsterPresentation?.label ?? anim.name ?? (isCrowd ? '人群' : isMonster ? '妖兽' : isPlayer ? '修士' : isContainer ? '箱具' : '道人');
        ctx.textBaseline = 'alphabetic';
        ctx.font = buildCanvasFont('label', renderedCellSize * (isCrowd ? 0.24 : 0.3));
/** labelY：定义该变量以承载业务值。 */
        const labelY = visualSy - Math.max(6, renderedCellSize * 0.18);
/** labelColor：定义该变量以承载业务值。 */
        const labelColor = isCrowd ? '#f4dfaf' : isMonster ? '#ffddcc' : isPlayer ? '#d8f3c3' : isContainer ? '#ffe3b8' : '#cce7ff';
        if (isMonster && monsterPresentation?.badgeText) {
          this.drawMonsterBadgeLabel(
            label,
            monsterPresentation.badgeText,
            monsterPresentation.badgeClassName ?? 'monster-badge',
            sx + renderedCellSize / 2,
            labelY,
            renderedCellSize,
            labelColor,
          );
        } else {
          this.drawOutlinedText(
            label,
            sx + renderedCellSize / 2,
            labelY,
            labelColor,
            'rgba(15,12,10,0.9)',
          );
        }

        if (!isCrowd) {
          this.drawBuffRows(sx, visualSy, renderedCellSize, anim.buffs);
        }

        if (!isCrowd && (anim.maxHp ?? 0) > 0) {
/** ratio：定义该变量以承载业务值。 */
          const ratio = Math.max(0, Math.min(1, (anim.hp ?? 0) / (anim.maxHp ?? 1)));
/** barX：定义该变量以承载业务值。 */
          const barX = visualSx + 3;
/** barY：定义该变量以承载业务值。 */
          const barY = visualSy + visualCellSize - 5;
/** barW：定义该变量以承载业务值。 */
          const barW = visualCellSize - 6;
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.fillRect(barX, barY, barW, 3);
          ctx.fillStyle = isMonster ? '#d15252' : isNpc ? '#58a8ff' : isContainer ? '#c18b46' : '#63c46b';
          ctx.fillRect(barX, barY, barW * ratio, 3);
        }

        if (isNpc && anim.npcQuestMarker) {
          this.drawNpcQuestMarker(visualSx, visualSy, visualCellSize, anim.npcQuestMarker);
        }
      }
    }
  }

/** renderThreatTargetArrows：执行对应的业务逻辑。 */
  private renderThreatTargetArrows(renderedEntities: RenderedAnimEntity[], localPlayerId?: string, localPlayerRendered?: RenderedAnimEntity): void {
    if (!this.ctx || renderedEntities.length === 0) {
      return;
    }
/** ctx：定义该变量以承载业务值。 */
    const ctx = this.ctx;
/** renderedById：定义该变量以承载业务值。 */
    const renderedById = new Map(renderedEntities.map((entry) => [entry.anim.id, entry]));
    if (localPlayerId !== undefined && localPlayerRendered && !renderedById.has(localPlayerId)) {
      renderedById.set(localPlayerId, localPlayerRendered);
    }

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const arrow of this.threatArrows) {
      const entry = renderedById.get(arrow.ownerId);
      const target = renderedById.get(arrow.targetId);
      if (!entry || !target || target.anim.id === entry.anim.id) {
        continue;
      }
      this.drawThreatTargetArrow(entry, target, localPlayerId !== undefined && entry.anim.id === localPlayerId);
    }

    ctx.restore();
  }

/** drawThreatTargetArrow：执行对应的业务逻辑。 */
  private drawThreatTargetArrow(from: RenderedAnimEntity, to: RenderedAnimEntity, isSelfArrow: boolean): void {
    if (!this.ctx) {
      return;
    }
/** ctx：定义该变量以承载业务值。 */
    const ctx = this.ctx;
/** dx：定义该变量以承载业务值。 */
    const dx = to.centerX - from.centerX;
/** dy：定义该变量以承载业务值。 */
    const dy = to.centerY - from.centerY;
/** distance：定义该变量以承载业务值。 */
    const distance = Math.hypot(dx, dy);
    if (distance < Math.max(10, from.cellSize * 0.45)) {
      return;
    }

/** ux：定义该变量以承载业务值。 */
    const ux = dx / distance;
/** uy：定义该变量以承载业务值。 */
    const uy = dy / distance;
/** startPadding：定义该变量以承载业务值。 */
    const startPadding = from.cellSize * 0.34;
/** endPadding：定义该变量以承载业务值。 */
    const endPadding = to.cellSize * 0.34;
/** startX：定义该变量以承载业务值。 */
    const startX = from.centerX + ux * startPadding;
/** startY：定义该变量以承载业务值。 */
    const startY = from.centerY + uy * startPadding;
/** endX：定义该变量以承载业务值。 */
    const endX = to.centerX - ux * endPadding;
/** endY：定义该变量以承载业务值。 */
    const endY = to.centerY - uy * endPadding;
/** curvature：定义该变量以承载业务值。 */
    const curvature = Math.max(from.cellSize * 0.32, Math.min(distance * 0.18, from.cellSize * 0.76));
/** controlX：定义该变量以承载业务值。 */
    const controlX = (startX + endX) / 2;
/** controlY：定义该变量以承载业务值。 */
    const controlY = Math.min(startY, endY) - curvature;
/** color：定义该变量以承载业务值。 */
    const color = isSelfArrow ? SELF_THREAT_ARROW_COLOR : OTHER_THREAT_ARROW_COLOR;
/** glow：定义该变量以承载业务值。 */
    const glow = isSelfArrow ? SELF_THREAT_ARROW_GLOW : OTHER_THREAT_ARROW_GLOW;
/** baseWidth：定义该变量以承载业务值。 */
    const baseWidth = Math.max(0.55, from.cellSize * 0.02);
/** glowWidth：定义该变量以承载业务值。 */
    const glowWidth = baseWidth + Math.max(1.9, from.cellSize * 0.048);
/** tangentX：定义该变量以承载业务值。 */
    const tangentX = endX - this.getQuadraticPoint(startX, controlX, endX, 0.86);
/** tangentY：定义该变量以承载业务值。 */
    const tangentY = endY - this.getQuadraticPoint(startY, controlY, endY, 0.86);
/** tangentLength：定义该变量以承载业务值。 */
    const tangentLength = Math.hypot(tangentX, tangentY);
    if (tangentLength < 0.001) {
      return;
    }
/** arrowUx：定义该变量以承载业务值。 */
    const arrowUx = tangentX / tangentLength;
/** arrowUy：定义该变量以承载业务值。 */
    const arrowUy = tangentY / tangentLength;
/** headLength：定义该变量以承载业务值。 */
    const headLength = Math.max(7, from.cellSize * 0.22);
/** headWidth：定义该变量以承载业务值。 */
    const headWidth = Math.max(2.4, from.cellSize * 0.076);
/** baseX：定义该变量以承载业务值。 */
    const baseX = endX - arrowUx * headLength;
/** baseY：定义该变量以承载业务值。 */
    const baseY = endY - arrowUy * headLength;

    ctx.strokeStyle = glow;
    ctx.lineWidth = glowWidth;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(controlX, controlY, endX, endY);
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = baseWidth;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(controlX, controlY, endX, endY);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(baseX + (-arrowUy) * headWidth, baseY + arrowUx * headWidth);
    ctx.lineTo(baseX - (-arrowUy) * headWidth, baseY - arrowUx * headWidth);
    ctx.closePath();
    ctx.fill();
  }

/** getQuadraticPoint：执行对应的业务逻辑。 */
  private getQuadraticPoint(start: number, control: number, end: number, t: number): number {
/** invT：定义该变量以承载业务值。 */
    const invT = 1 - t;
    return invT * invT * start + 2 * invT * t * control + t * t * end;
  }

  private drawMonsterBadgeLabel(
    label: string,
    badgeText: string,
    badgeClassName: string,
    centerX: number,
    baselineY: number,
    cellSize: number,
    labelColor: string,
  ): void {
    if (!this.ctx) {
      return;
    }
/** ctx：定义该变量以承载业务值。 */
    const ctx = this.ctx;
/** badgePaddingX：定义该变量以承载业务值。 */
    const badgePaddingX = Math.max(4, cellSize * 0.1);
/** badgeHeight：定义该变量以承载业务值。 */
    const badgeHeight = Math.max(12, cellSize * 0.28);
/** badgeRadius：定义该变量以承载业务值。 */
    const badgeRadius = Math.max(4, badgeHeight * 0.38);
/** badgeTextSize：定义该变量以承载业务值。 */
    const badgeTextSize = Math.max(9, cellSize * 0.2);
/** badgeWidth：定义该变量以承载业务值。 */
    const badgeWidth = Math.max(16, badgeText.length * badgeTextSize + badgePaddingX * 2);
/** gap：定义该变量以承载业务值。 */
    const gap = Math.max(4, cellSize * 0.08);
/** fill：定义该变量以承载业务值。 */
    const fill = badgeClassName.includes('--boss') ? 'rgba(120, 32, 24, 0.92)' : 'rgba(42, 54, 91, 0.92)';
/** stroke：定义该变量以承载业务值。 */
    const stroke = badgeClassName.includes('--boss') ? 'rgba(255, 188, 156, 0.86)' : 'rgba(185, 211, 255, 0.82)';
/** textColor：定义该变量以承载业务值。 */
    const textColor = '#fff6eb';

    ctx.save();
/** labelFont：定义该变量以承载业务值。 */
    const labelFont = buildCanvasFont('label', Math.max(10, cellSize * 0.3));
    ctx.font = labelFont;
/** labelWidth：定义该变量以承载业务值。 */
    const labelWidth = this.textMeasureCache.measureWidth(ctx, labelFont, label);
/** totalWidth：定义该变量以承载业务值。 */
    const totalWidth = badgeWidth + gap + labelWidth;
/** left：定义该变量以承载业务值。 */
    const left = centerX - totalWidth / 2;
/** badgeY：定义该变量以承载业务值。 */
    const badgeY = baselineY - badgeHeight + Math.max(1, cellSize * 0.02);

    ctx.beginPath();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.roundRect(left, badgeY, badgeWidth, badgeHeight, badgeRadius);
    ctx.fill();
    ctx.stroke();

    ctx.font = buildCanvasFont('badge', badgeTextSize);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = textColor;
    ctx.fillText(badgeText, left + badgeWidth / 2, badgeY + badgeHeight / 2 + 0.5);
    ctx.restore();

    this.drawOutlinedText(
      label,
      left + badgeWidth + gap + labelWidth / 2,
      baselineY,
      labelColor,
      'rgba(15,12,10,0.9)',
    );
  }

/** drawBuffRows：处理当前场景中的对应操作。 */
  private drawBuffRows(sx: number, sy: number, cellSize: number, buffs?: VisibleBuffState[]) {
    if (!this.ctx || !buffs || buffs.length === 0) return;
/** visible：定义该变量以承载业务值。 */
    const visible = buffs.filter((buff) => buff.visibility === 'public');
    if (visible.length === 0) return;
/** buffsByCategory：定义该变量以承载业务值。 */
    const buffsByCategory = visible.filter((buff) => buff.category === 'buff');
/** debuffsByCategory：定义该变量以承载业务值。 */
    const debuffsByCategory = visible.filter((buff) => buff.category === 'debuff');
/** badgeSize：定义该变量以承载业务值。 */
    const badgeSize = Math.max(8, Math.floor(cellSize * 0.24));
/** gap：定义该变量以承载业务值。 */
    const gap = 2;
    this.drawBuffRow(sx, sy + 1, cellSize, buffsByCategory, badgeSize, gap, '#7fd69a');
    this.drawBuffRow(sx, sy + badgeSize + 4, cellSize, debuffsByCategory, badgeSize, gap, '#ff9072');
  }

  private drawBuffRow(
    sx: number,
    y: number,
    cellSize: number,
    buffs: VisibleBuffState[],
    badgeSize: number,
    gap: number,
    fallbackColor: string,
  ) {
    if (!this.ctx || buffs.length === 0) return;
/** ctx：定义该变量以承载业务值。 */
    const ctx = this.ctx;
/** visibleLimit：定义该变量以承载业务值。 */
    const visibleLimit = 4;
/** displayed：定义该变量以承载业务值。 */
    const displayed = buffs.slice(0, visibleLimit);
/** overflow：定义该变量以承载业务值。 */
    const overflow = buffs.length - displayed.length;
/** badges：定义该变量以承载业务值。 */
    const badges = overflow > 0
      ? [...displayed.slice(0, Math.max(0, visibleLimit - 1)), {
          buffId: '__overflow__',
          name: `其余 ${overflow} 项`,
          shortMark: `+${overflow}`,
          category: 'buff' as const,
          visibility: 'public' as const,
          remainingTicks: 0,
          duration: 0,
          stacks: 1,
          maxStacks: 1,
          sourceSkillId: '',
        }]
      : displayed;
/** totalWidth：定义该变量以承载业务值。 */
    const totalWidth = badges.length * badgeSize + Math.max(0, badges.length - 1) * gap;
/** x：定义该变量以承载业务值。 */
    let x = sx + Math.round((cellSize - totalWidth) / 2);
    for (const buff of badges) {
      const accent = buff.color ?? fallbackColor;
      const centerX = x + badgeSize / 2;
/** centerY：定义该变量以承载业务值。 */
      const centerY = y + badgeSize / 2;
/** ratio：定义该变量以承载业务值。 */
      const ratio = buff.duration > 0 ? Math.max(0, Math.min(1, buff.remainingTicks / buff.duration)) : 1;
      ctx.save();
      ctx.fillStyle = 'rgba(15, 12, 10, 0.78)';
      ctx.strokeStyle = 'rgba(250, 244, 233, 0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, y, badgeSize, badgeSize, 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(centerX, centerY, badgeSize * 0.62, -Math.PI / 2, Math.PI * 1.5);
      ctx.stroke();

      if (buff.duration > 0) {
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(centerX, centerY, badgeSize * 0.62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
        ctx.stroke();
      }

      ctx.fillStyle = '#f7f0dd';
      ctx.font = buildCanvasFont('badge', Math.max(6, badgeSize * 0.62));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(buff.shortMark, centerX, centerY + 0.5);

      if (buff.stacks > 1) {
        ctx.fillStyle = '#ffd76f';
        ctx.font = buildCanvasFont('badge', Math.max(5, badgeSize * 0.42));
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(`${buff.stacks}`, x + badgeSize - 1, y);
      }
      ctx.restore();
      x += badgeSize + gap;
    }
  }

/** drawNpcQuestMarker：处理当前场景中的对应操作。 */
  private drawNpcQuestMarker(sx: number, sy: number, cellSize: number, marker: NpcQuestMarker) {
    if (!this.ctx) return;
/** ctx：定义该变量以承载业务值。 */
    const ctx = this.ctx;
/** centerX：定义该变量以承载业务值。 */
    const centerX = sx + cellSize + Math.max(8, cellSize * 0.18);
/** centerY：定义该变量以承载业务值。 */
    const centerY = sy + Math.max(9, cellSize * 0.18);
/** size：定义该变量以承载业务值。 */
    const size = Math.max(8, cellSize * 0.18);
/** symbol：定义该变量以承载业务值。 */
    const symbol = marker.state === 'ready' ? '?' : marker.state === 'active' ? '…' : '!';
/** palette：定义该变量以承载业务值。 */
    const palette = this.getNpcQuestMarkerPalette(marker);

    ctx.save();
    ctx.lineWidth = 2;
    ctx.fillStyle = palette.fill;
    ctx.strokeStyle = palette.stroke;

    switch (palette.shape) {
      case 'square':
        ctx.beginPath();
        ctx.roundRect(centerX - size, centerY - size, size * 2, size * 2, Math.max(3, size * 0.45));
        ctx.fill();
        ctx.stroke();
        break;
      case 'diamond':
        ctx.beginPath();
        ctx.moveTo(centerX, centerY - size);
        ctx.lineTo(centerX + size, centerY);
        ctx.lineTo(centerX, centerY + size);
        ctx.lineTo(centerX - size, centerY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      case 'shield':
        ctx.beginPath();
        ctx.moveTo(centerX - size * 0.9, centerY - size * 0.7);
        ctx.quadraticCurveTo(centerX, centerY - size * 1.2, centerX + size * 0.9, centerY - size * 0.7);
        ctx.lineTo(centerX + size * 0.8, centerY + size * 0.25);
        ctx.quadraticCurveTo(centerX, centerY + size * 1.2, centerX - size * 0.8, centerY + size * 0.25);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      case 'circle':
      default:
        ctx.beginPath();
        ctx.arc(centerX, centerY, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        break;
    }

    ctx.fillStyle = palette.text;
    ctx.font = buildCanvasFont('badge', Math.max(11, cellSize * 0.26));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, centerX, centerY + 0.5);
    ctx.restore();
  }

/** getNpcQuestMarkerPalette：执行对应的业务逻辑。 */
  private getNpcQuestMarkerPalette(marker: NpcQuestMarker): {
/** fill：定义该变量以承载业务值。 */
    fill: string;
/** stroke：定义该变量以承载业务值。 */
    stroke: string;
/** text：定义该变量以承载业务值。 */
    text: string;
/** shape：定义该变量以承载业务值。 */
    shape: 'circle' | 'square' | 'diamond' | 'shield';
  } {
    switch (marker.line) {
      case 'main':
        return { fill: 'rgba(236, 179, 55, 0.95)', stroke: '#fff0b0', text: '#3d2500', shape: 'circle' };
      case 'daily':
        return { fill: 'rgba(84, 188, 125, 0.95)', stroke: '#d5ffe2', text: '#0f3420', shape: 'square' };
      case 'encounter':
        return { fill: 'rgba(217, 88, 88, 0.95)', stroke: '#ffd7cf', text: '#3f0e0e', shape: 'diamond' };
      case 'side':
      default:
        return { fill: 'rgba(84, 156, 222, 0.95)', stroke: '#d8f1ff', text: '#0d2337', shape: 'shield' };
    }
  }

  /** 添加浮动文字特效（伤害数字或动作提示） */
  addFloatingText(
    x: number,
    y: number,
    text: string,
    color = '#ffd27a',
/** variant：定义该变量以承载业务值。 */
    variant: 'damage' | 'action' = 'damage',
    actionStyle?: FloatingActionTextStyle,
    durationMs?: number,
  ) {
/** now：定义该变量以承载业务值。 */
    const now = performance.now();
    this.pruneExpiredFloatingTexts(now);
    this.floatingTexts.push({
      id: this.nextFloatingTextId++,
      x,
      y,
      text,
      color,
      variant,
      actionStyle,
      createdAt: now,
/** duration：定义该变量以承载业务值。 */
      duration: durationMs !== undefined
        ? Math.max(1, Math.round(durationMs))
        : variant === 'action' && actionStyle === 'divine'
          ? 1000
          : variant === 'action' && actionStyle === 'chant'
            ? 1240
            : variant === 'action'
              ? 1000
              : 850,
    });
    this.trimFloatingTexts();
  }

  /** 添加攻击拖尾特效（从攻击者到目标的箭头线段） */
  addAttackTrail(fromX: number, fromY: number, toX: number, toY: number, color = '#ffd27a') {
/** now：定义该变量以承载业务值。 */
    const now = performance.now();
    this.pruneExpiredAttackTrails(now);
    this.attackTrails.push({
      id: this.nextAttackTrailId++,
      fromX,
      fromY,
      toX,
      toY,
      color,
      createdAt: now,
      duration: 260,
    });
    this.trimAttackTrails();
  }

  addWarningZone(
/** cells：定义该变量以承载业务值。 */
    cells: Array<{ x: number; y: number }>,
    color = '#ff2a2a',
    durationMs = DEFAULT_WARNING_ZONE_DURATION_MS,
    baseColor?: string,
    originX?: number,
    originY?: number,
  ) {
    if (cells.length === 0) {
      return;
    }
/** now：定义该变量以承载业务值。 */
    const now = performance.now();
    this.pruneExpiredWarningZones(now);
/** origin：定义该变量以承载业务值。 */
    const origin = this.resolveWarningZoneOrigin(cells, originX, originY);
/** rawDistances：定义该变量以承载业务值。 */
    const rawDistances = cells.map((cell) => Math.max(Math.abs(cell.x - origin.x), Math.abs(cell.y - origin.y)));
/** minExpandDistance：定义该变量以承载业务值。 */
    const minExpandDistance = rawDistances.reduce(
      (minDistance, distance) => Math.min(minDistance, distance),
      rawDistances[0] ?? 0,
    );
/** zoneCells：定义该变量以承载业务值。 */
    const zoneCells = cells.map((cell, index) => ({
      x: cell.x,
      y: cell.y,
      expandDistance: Math.max(0, rawDistances[index] - minExpandDistance),
    }));
/** maxExpandDistance：定义该变量以承载业务值。 */
    const maxExpandDistance = zoneCells.reduce(
      (maxDistance, cell) => Math.max(maxDistance, cell.expandDistance),
      0,
    );
    this.warningZones.push({
      id: this.nextWarningZoneId++,
      cells: zoneCells,
      color,
      baseColor: baseColor ?? color,
      originX: origin.x,
      originY: origin.y,
      maxExpandDistance,
      createdAt: now,
      duration: Math.max(1, Math.round(durationMs)),
    });
    this.trimWarningZones();
  }

  /** 绘制所有浮动文字，自动清理过期条目 */
  renderFloatingTexts(camera: Camera) {
    if (!this.ctx || this.floatingTexts.length === 0) return;
/** ctx：定义该变量以承载业务值。 */
    const ctx = this.ctx;
/** now：定义该变量以承载业务值。 */
    const now = performance.now();
/** sw：定义该变量以承载业务值。 */
    const sw = ctx.canvas.width;
/** sh：定义该变量以承载业务值。 */
    const sh = ctx.canvas.height;
/** cellSize：定义该变量以承载业务值。 */
    const cellSize = getCellSize();

    this.pruneExpiredFloatingTexts(now);
/** groups：定义该变量以承载业务值。 */
    const groups = new Map<string, FloatingText[]>();
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
    }

    for (const entry of this.floatingTexts) {
      const progress = Math.min(1, (now - entry.createdAt) / entry.duration);
      const actionStyle = entry.variant === 'action' ? (entry.actionStyle ?? 'default') : undefined;
/** motionProgress：定义该变量以承载业务值。 */
      const motionProgress = entry.variant === 'action' && actionStyle === 'default' ? progress * progress : progress;
/** rise：定义该变量以承载业务值。 */
      const rise = entry.variant === 'action'
        ? actionStyle === 'divine'
          ? 0
          : cellSize * (0.08 + motionProgress * 0.46)
        : cellSize * (0.2 + progress * 0.8);
/** alpha：定义该变量以承载业务值。 */
      const alpha = entry.variant === 'action' && actionStyle === 'divine'
        ? 1 - Math.max(0, (progress - 0.86) / 0.14)
        : 1 - progress;
/** worldX：定义该变量以承载业务值。 */
      const worldX = entry.x * cellSize;
/** worldY：定义该变量以承载业务值。 */
      const worldY = entry.y * cellSize;
      const { sx, sy } = camera.worldToScreen(worldX, worldY, sw, sh);
      if (sx + cellSize < 0 || sx > sw || sy + cellSize < 0 || sy > sh) continue;
/** group：定义该变量以承载业务值。 */
      const group = groups.get(`${entry.x},${entry.y},${entry.variant}`) ?? [entry];
/** index：定义该变量以承载业务值。 */
      const index = group.findIndex((item) => item.id === entry.id);
/** burst：定义该变量以承载业务值。 */
      const burst = this.getFloatingTextBurstOffset(index, group.length, cellSize);

      ctx.save();
      ctx.globalAlpha = alpha;
      if (entry.variant === 'action') {
        if (actionStyle === 'divine') {
/** fontSize：定义该变量以承载业务值。 */
          const fontSize = Math.max(30, cellSize * 0.84);
/** lineHeight：定义该变量以承载业务值。 */
          const lineHeight = fontSize * 1.12;
/** chars：定义该变量以承载业务值。 */
          const chars = [...entry.text.trim()].filter((char) => char.trim().length > 0);
/** stackHeight：定义该变量以承载业务值。 */
          const stackHeight = chars.length > 0 ? lineHeight * Math.max(0, chars.length - 1) + fontSize : fontSize;
/** scale：定义该变量以承载业务值。 */
          const scale = 0.98 + motionProgress * 0.08;
          ctx.translate(
            sx - cellSize * 0.06 + burst.offsetX,
            sy + cellSize - stackHeight - burst.offsetY,
          );
          ctx.scale(scale, scale);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.font = buildCanvasFont('floatingAction', fontSize);
          this.drawOutlinedVerticalText(
            entry.text,
            0,
            0,
            entry.color,
            'rgba(15,12,10,0.9)',
            lineHeight,
          );
        } else if (actionStyle === 'chant') {
/** fontSize：定义该变量以承载业务值。 */
          const fontSize = Math.max(24, cellSize * 0.82);
/** lineHeight：定义该变量以承载业务值。 */
          const lineHeight = fontSize * 1.02;
/** chars：定义该变量以承载业务值。 */
          const chars = [...entry.text.trim()].filter((char) => char.trim().length > 0);
/** stackHeight：定义该变量以承载业务值。 */
          const stackHeight = chars.length > 0 ? lineHeight * Math.max(0, chars.length - 1) + fontSize : fontSize;
/** alpha：定义该变量以承载业务值。 */
          const alpha = progress < 0.95 ? 1 : 1 - Math.max(0, (progress - 0.95) / 0.05);
          ctx.globalAlpha = alpha;
          ctx.translate(
            sx - cellSize * 0.12 + burst.offsetX,
            sy - cellSize * 0.48 - burst.offsetY - stackHeight,
          );
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.font = buildCanvasFont('floatingAction', fontSize);
          ctx.shadowColor = 'rgba(120, 18, 12, 0.55)';
          ctx.shadowBlur = Math.max(6, cellSize * 0.16);
          this.drawChantText(
            entry.text,
            progress,
            0,
            0,
            entry.color,
            'rgba(24,8,6,0.98)',
            lineHeight,
            fontSize,
          );
        } else {
/** fontSize：定义该变量以承载业务值。 */
          const fontSize = Math.max(10, cellSize * 0.28);
/** scale：定义该变量以承载业务值。 */
          const scale = 0.98 + motionProgress * 0.08;
          ctx.translate(
            sx - cellSize * 0.06 + burst.offsetX,
            sy - cellSize * 0.08 - rise - burst.offsetY,
          );
          ctx.scale(scale, scale);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.font = buildCanvasFont('floatingAction', fontSize);
          this.drawOutlinedVerticalText(
            entry.text,
            0,
            0,
            entry.color,
            'rgba(15,12,10,0.9)',
            fontSize * 1.12,
          );
        }
      } else {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.font = buildCanvasFont('floatingDamage', Math.max(14, cellSize * 0.45));
        this.drawOutlinedText(
          entry.text,
          sx + cellSize / 2 + burst.offsetX,
          sy - rise - burst.offsetY,
          entry.color,
          'rgba(15,12,10,0.95)',
        );
      }
      ctx.restore();
    }
  }

  /** 绘制所有攻击拖尾，自动清理过期条目 */
  renderAttackTrails(camera: Camera) {
    if (!this.ctx || this.attackTrails.length === 0) return;
/** ctx：定义该变量以承载业务值。 */
    const ctx = this.ctx;
/** now：定义该变量以承载业务值。 */
    const now = performance.now();
/** sw：定义该变量以承载业务值。 */
    const sw = ctx.canvas.width;
/** sh：定义该变量以承载业务值。 */
    const sh = ctx.canvas.height;
/** cellSize：定义该变量以承载业务值。 */
    const cellSize = getCellSize();

    this.pruneExpiredAttackTrails(now);

    for (const entry of this.attackTrails) {
      const progress = Math.min(1, (now - entry.createdAt) / entry.duration);
      const alpha = 1 - progress * 0.85;
/** from：定义该变量以承载业务值。 */
      const from = camera.worldToScreen(entry.fromX * cellSize + cellSize / 2, entry.fromY * cellSize + cellSize / 2, sw, sh);
/** to：定义该变量以承载业务值。 */
      const to = camera.worldToScreen(entry.toX * cellSize + cellSize / 2, entry.toY * cellSize + cellSize / 2, sw, sh);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = entry.color;
      ctx.fillStyle = entry.color;
      ctx.lineWidth = Math.max(2, cellSize * 0.09);
      ctx.beginPath();
      ctx.moveTo(from.sx, from.sy);
      ctx.lineTo(to.sx, to.sy);
      ctx.stroke();

/** angle：定义该变量以承载业务值。 */
      const angle = Math.atan2(to.sy - from.sy, to.sx - from.sx);
/** head：定义该变量以承载业务值。 */
      const head = Math.max(8, cellSize * 0.22);
      ctx.beginPath();
      ctx.moveTo(to.sx, to.sy);
      ctx.lineTo(to.sx - head * Math.cos(angle - Math.PI / 6), to.sy - head * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(to.sx - head * Math.cos(angle + Math.PI / 6), to.sy - head * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

/** renderWarningZones：处理当前场景中的对应操作。 */
  renderWarningZones(camera: Camera) {
    if (!this.ctx || this.warningZones.length === 0) return;
/** ctx：定义该变量以承载业务值。 */
    const ctx = this.ctx;
/** now：定义该变量以承载业务值。 */
    const now = performance.now();
/** sw：定义该变量以承载业务值。 */
    const sw = ctx.canvas.width;
/** sh：定义该变量以承载业务值。 */
    const sh = ctx.canvas.height;
/** cellSize：定义该变量以承载业务值。 */
    const cellSize = getCellSize();

    this.pruneExpiredWarningZones(now);

    for (const zone of this.warningZones) {
      const progress = Math.min(1, (now - zone.createdAt) / zone.duration);
      const fadeProgress = progress <= 0.72 ? 0 : Math.min(1, (progress - 0.72) / 0.28);
/** pulse：定义该变量以承载业务值。 */
      const pulse = 0.96 + Math.sin(progress * Math.PI * 3) * 0.04;
/** baseFillAlpha：定义该变量以承载业务值。 */
      const baseFillAlpha = Math.max(0.02, (1 - fadeProgress * 0.9) * 0.1);
/** baseStrokeAlpha：定义该变量以承载业务值。 */
      const baseStrokeAlpha = Math.max(0.08, (1 - fadeProgress * 0.84) * 0.32);
/** expandFillAlpha：定义该变量以承载业务值。 */
      const expandFillAlpha = Math.max(0.045, (1 - fadeProgress * 0.9) * 0.18 * pulse);
/** expandStrokeAlpha：定义该变量以承载业务值。 */
      const expandStrokeAlpha = Math.max(0.16, (1 - fadeProgress * 0.82) * 0.72);
/** revealDistance：定义该变量以承载业务值。 */
      const revealDistance = progress * (zone.maxExpandDistance + 1);
/** settledDistance：定义该变量以承载业务值。 */
      const settledDistance = Math.floor(revealDistance);
/** frontierAlpha：定义该变量以承载业务值。 */
      const frontierAlpha = Math.max(0, Math.min(1, revealDistance - settledDistance));

      for (const cell of zone.cells) {
        const { sx, sy } = camera.worldToScreen(cell.x * cellSize, cell.y * cellSize, sw, sh);
        if (sx + cellSize < 0 || sx > sw || sy + cellSize < 0 || sy > sh) {
          continue;
        }

        ctx.save();
        ctx.globalAlpha = baseFillAlpha;
        ctx.fillStyle = zone.baseColor;
        ctx.fillRect(sx + 1, sy + 1, cellSize - 2, cellSize - 2);
        ctx.globalAlpha = baseStrokeAlpha;
        ctx.strokeStyle = zone.baseColor;
        ctx.lineWidth = Math.max(1.25, cellSize * 0.08);
        ctx.strokeRect(sx + 1.5, sy + 1.5, cellSize - 3, cellSize - 3);
        ctx.restore();

/** overlayAlpha：定义该变量以承载业务值。 */
        let overlayAlpha = 0;
        if (cell.expandDistance < settledDistance) {
          overlayAlpha = 1;
        } else if (cell.expandDistance === settledDistance) {
          overlayAlpha = frontierAlpha;
        }
        if (overlayAlpha <= 0.01) {
          continue;
        }

        ctx.save();
        ctx.globalAlpha = expandFillAlpha * overlayAlpha;
        ctx.fillStyle = zone.color;
        ctx.fillRect(sx + 1, sy + 1, cellSize - 2, cellSize - 2);
        ctx.globalAlpha = expandStrokeAlpha * overlayAlpha;
        ctx.strokeStyle = zone.color;
        ctx.lineWidth = Math.max(1.35, cellSize * 0.09);
        ctx.strokeRect(sx + 1.5, sy + 1.5, cellSize - 3, cellSize - 3);
        ctx.restore();
      }
    }
  }

/** destroy：处理当前场景中的对应操作。 */
  destroy() {
    this.ctx = null;
    this.entities.clear();
    this.threatArrows = [];
    this.groundPiles.clear();
    this.containerTileKeys.clear();
    this.pathKeys.clear();
    this.pathIndexByKey.clear();
    this.pathTargetKey = null;
    this.fadingPath = null;
    this.floatingTexts = [];
    this.attackTrails = [];
    this.warningZones = [];
    this.lastMotionSyncToken = undefined;
    this.previousVisibleTileRevision = -1;
    this.textMeasureCache.clear();
    this.tileSpriteCache.clear();
  }

/** getFloatingTextBurstOffset：执行对应的业务逻辑。 */
  private getFloatingTextBurstOffset(index: number, count: number, cellSize: number): FloatingTextBurstOffset {
    if (count <= 1 || index < 0) {
      return { offsetX: 0, offsetY: 0 };
    }
/** horizontalStep：定义该变量以承载业务值。 */
    const horizontalStep = cellSize * 0.3;
/** verticalStep：定义该变量以承载业务值。 */
    const verticalStep = cellSize * 0.12;
/** centeredIndex：定义该变量以承载业务值。 */
    const centeredIndex = index - (count - 1) / 2;
    return {
      offsetX: centeredIndex * horizontalStep,
      offsetY: Math.abs(centeredIndex) * verticalStep,
    };
  }

  private drawChantText(
    text: string,
    progress: number,
    x: number,
    y: number,
    fill: string,
    stroke: string,
    lineHeight: number,
    fontSize: number,
  ): void {
    if (!this.ctx) {
      return;
    }
/** ctx：定义该变量以承载业务值。 */
    const ctx = this.ctx;
/** chars：定义该变量以承载业务值。 */
    const chars = [...text.trim()].filter((char) => char.trim().length > 0);
    if (chars.length === 0) {
      return;
    }
/** segment：定义该变量以承载业务值。 */
    const segment = 1 / chars.length;
/** slamWindow：定义该变量以承载业务值。 */
    const slamWindow = Math.max(segment * 0.45, 0.06);

    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3.2, fontSize * 0.12);
    ctx.strokeStyle = stroke;
    ctx.fillStyle = fill;

    chars.forEach((char, index) => {
/** start：定义该变量以承载业务值。 */
      const start = segment * index;
/** localProgress：定义该变量以承载业务值。 */
      const localProgress = Math.max(0, Math.min(1, (progress - start) / slamWindow));
      if (localProgress <= 0) {
        return;
      }
/** fallPhase：定义该变量以承载业务值。 */
      const fallPhase = Math.min(1, localProgress / 0.72);
/** settlePhase：定义该变量以承载业务值。 */
      const settlePhase = Math.max(0, (localProgress - 0.72) / 0.28);
/** acceleratedFall：定义该变量以承载业务值。 */
      const acceleratedFall = Math.pow(fallPhase, 2.6);
/** impactDrop：定义该变量以承载业务值。 */
      const impactDrop = (1 - acceleratedFall) * fontSize * 0.92;
/** settle：定义该变量以承载业务值。 */
      const settle = easeOutCubic(settlePhase);
/** impactScaleX：定义该变量以承载业务值。 */
      let impactScaleX = 1 - Math.min(1, fallPhase * 1.2) * 0.08;
/** impactScaleY：定义该变量以承载业务值。 */
      let impactScaleY = 1 + Math.min(1, fallPhase * 1.2) * 0.16;
      if (settlePhase > 0) {
        impactScaleX = 1.22 - settle * 0.22;
        impactScaleY = 0.76 + settle * 0.24;
      }
/** charAlpha：定义该变量以承载业务值。 */
      const charAlpha = Math.min(1, localProgress * 1.8);
/** offsetDirection：定义该变量以承载业务值。 */
      const offsetDirection = index % 2 === 0 ? -1 : 1;
/** staggerOffsetX：定义该变量以承载业务值。 */
      const staggerOffsetX = offsetDirection * fontSize * 0.12;
/** drawY：定义该变量以承载业务值。 */
      const drawY = y + lineHeight * index - impactDrop;

      ctx.save();
      ctx.globalAlpha *= charAlpha;
      ctx.translate(x + staggerOffsetX, drawY);
      ctx.scale(impactScaleX, impactScaleY);
      ctx.strokeText(char, 0, 0);
      ctx.fillText(char, 0, 0);
      ctx.restore();
    });
  }

  private resolveWarningZoneOrigin(
/** cells：定义该变量以承载业务值。 */
    cells: Array<{ x: number; y: number }>,
    originX?: number,
    originY?: number,
  ): { x: number; y: number } {
    if (Number.isFinite(originX) && Number.isFinite(originY)) {
      return {
        x: Math.round(originX ?? 0),
        y: Math.round(originY ?? 0),
      };
    }
/** minX：定义该变量以承载业务值。 */
    let minX = cells[0].x;
/** maxX：定义该变量以承载业务值。 */
    let maxX = cells[0].x;
/** minY：定义该变量以承载业务值。 */
    let minY = cells[0].y;
/** maxY：定义该变量以承载业务值。 */
    let maxY = cells[0].y;
    for (const cell of cells) {
      if (cell.x < minX) minX = cell.x;
      if (cell.x > maxX) maxX = cell.x;
      if (cell.y < minY) minY = cell.y;
      if (cell.y > maxY) maxY = cell.y;
    }
    return {
      x: Math.round((minX + maxX) / 2),
      y: Math.round((minY + maxY) / 2),
    };
  }

/** pruneExpiredFloatingTexts：执行对应的业务逻辑。 */
  private pruneExpiredFloatingTexts(now: number): void {
    this.floatingTexts = this.floatingTexts.filter((entry) => now - entry.createdAt < entry.duration);
  }

/** pruneExpiredAttackTrails：执行对应的业务逻辑。 */
  private pruneExpiredAttackTrails(now: number): void {
    this.attackTrails = this.attackTrails.filter((entry) => now - entry.createdAt < entry.duration);
  }

/** pruneExpiredWarningZones：执行对应的业务逻辑。 */
  private pruneExpiredWarningZones(now: number): void {
    this.warningZones = this.warningZones.filter((entry) => now - entry.createdAt < entry.duration);
  }

/** trimFloatingTexts：执行对应的业务逻辑。 */
  private trimFloatingTexts(): void {
/** overflow：定义该变量以承载业务值。 */
    const overflow = this.floatingTexts.length - MAX_FLOATING_TEXTS;
    if (overflow > 0) {
      this.floatingTexts.splice(0, overflow);
    }
  }

/** trimAttackTrails：执行对应的业务逻辑。 */
  private trimAttackTrails(): void {
/** overflow：定义该变量以承载业务值。 */
    const overflow = this.attackTrails.length - MAX_ATTACK_TRAILS;
    if (overflow > 0) {
      this.attackTrails.splice(0, overflow);
    }
  }

/** trimWarningZones：执行对应的业务逻辑。 */
  private trimWarningZones(): void {
/** overflow：定义该变量以承载业务值。 */
    const overflow = this.warningZones.length - MAX_WARNING_ZONES;
    if (overflow > 0) {
      this.warningZones.splice(0, overflow);
    }
  }

  private renderPathArrows(
    camera: Camera,
    visibleTiles: ReadonlySet<string>,
    playerX: number,
    playerY: number,
    displayRangeX: number,
    displayRangeY: number,
  ) {
    if (!this.ctx) return;
/** ctx：定义该变量以承载业务值。 */
    const ctx = this.ctx;
/** sw：定义该变量以承载业务值。 */
    const sw = ctx.canvas.width;
/** sh：定义该变量以承载业务值。 */
    const sh = ctx.canvas.height;
/** fadingPathAlpha：定义该变量以承载业务值。 */
    const fadingPathAlpha = this.getFadingPathAlpha(performance.now());

    if (this.fadingPath && fadingPathAlpha > 0) {
      this.renderPathArrowLayer(
        ctx,
        camera,
        sw,
        sh,
        visibleTiles,
        playerX,
        playerY,
        displayRangeX,
        displayRangeY,
        this.fadingPath.cells,
        this.fadingPath.indexByKey,
        this.fadingPath.targetKey,
        fadingPathAlpha * PATH_TRAIL_FADE_ALPHA,
      );
    }

    if (this.pathCells.length > 0) {
      this.renderPathArrowLayer(
        ctx,
        camera,
        sw,
        sh,
        visibleTiles,
        playerX,
        playerY,
        displayRangeX,
        displayRangeY,
        this.pathCells,
        this.pathIndexByKey,
        this.pathTargetKey,
        1,
      );
    }
  }

  private renderPathArrowLayer(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    sw: number,
    sh: number,
    visibleTiles: ReadonlySet<string>,
    playerX: number,
    playerY: number,
    displayRangeX: number,
    displayRangeY: number,
/** cells：定义该变量以承载业务值。 */
    cells: { x: number; y: number }[],
    indexByKey: Map<string, number>,
    targetKey: string | null,
    alpha: number,
  ) {
    if (cells.length === 0 || alpha <= 0.001) {
      return;
    }

/** cellSize：定义该变量以承载业务值。 */
    const cellSize = getCellSize();
/** route：定义该变量以承载业务值。 */
    const route = [{ x: playerX, y: playerY }, ...cells];
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';

    for (let index = 0; index < route.length - 1; index++) {
      const from = route[index];
      const to = route[index + 1];
/** toKey：定义该变量以承载业务值。 */
      const toKey = `${to.x},${to.y}`;
      if (!indexByKey.has(toKey)) {
        continue;
      }
      if (
        !this.isPathCellRenderable(from.x, from.y, visibleTiles, playerX, playerY, displayRangeX, displayRangeY)
        && !this.isPathCellRenderable(to.x, to.y, visibleTiles, playerX, playerY, displayRangeX, displayRangeY)
      ) {
        continue;
      }

/** fromPos：定义该变量以承载业务值。 */
      const fromPos = camera.worldToScreen(from.x * cellSize + cellSize / 2, from.y * cellSize + cellSize / 2, sw, sh);
/** toPos：定义该变量以承载业务值。 */
      const toPos = camera.worldToScreen(to.x * cellSize + cellSize / 2, to.y * cellSize + cellSize / 2, sw, sh);
/** dx：定义该变量以承载业务值。 */
      const dx = toPos.sx - fromPos.sx;
/** dy：定义该变量以承载业务值。 */
      const dy = toPos.sy - fromPos.sy;
/** distance：定义该变量以承载业务值。 */
      const distance = Math.hypot(dx, dy);
      if (distance < 1) {
        continue;
      }

/** ux：定义该变量以承载业务值。 */
      const ux = dx / distance;
/** uy：定义该变量以承载业务值。 */
      const uy = dy / distance;
/** startPadding：定义该变量以承载业务值。 */
      const startPadding = index === 0 ? cellSize * 0.2 : cellSize * 0.1;
/** endPadding：定义该变量以承载业务值。 */
      const endPadding = cellSize * 0.14;
/** startX：定义该变量以承载业务值。 */
      const startX = fromPos.sx + ux * startPadding;
/** startY：定义该变量以承载业务值。 */
      const startY = fromPos.sy + uy * startPadding;
/** tipX：定义该变量以承载业务值。 */
      const tipX = toPos.sx - ux * endPadding;
/** tipY：定义该变量以承载业务值。 */
      const tipY = toPos.sy - uy * endPadding;
/** isFinalSegment：定义该变量以承载业务值。 */
      const isFinalSegment = toKey === targetKey;
/** arrowColor：定义该变量以承载业务值。 */
      const arrowColor = isFinalSegment ? PATH_TARGET_STROKE_COLOR : PATH_ARROW_COLOR;
/** headLength：定义该变量以承载业务值。 */
      const headLength = Math.max(8, cellSize * 0.2);
/** headWidth：定义该变量以承载业务值。 */
      const headWidth = Math.max(5, cellSize * 0.12);
/** shaftEndX：定义该变量以承载业务值。 */
      const shaftEndX = tipX - ux * headLength;
/** shaftEndY：定义该变量以承载业务值。 */
      const shaftEndY = tipY - uy * headLength;

      if (
        Math.max(startX, tipX) < -cellSize ||
        Math.min(startX, tipX) > sw + cellSize ||
        Math.max(startY, tipY) < -cellSize ||
        Math.min(startY, tipY) > sh + cellSize
      ) {
        continue;
      }

      ctx.strokeStyle = arrowColor;
      ctx.fillStyle = arrowColor;
      ctx.lineWidth = Math.max(1.25, cellSize * 0.06);
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(shaftEndX, shaftEndY);
      ctx.stroke();

/** normalX：定义该变量以承载业务值。 */
      const normalX = -uy;
/** normalY：定义该变量以承载业务值。 */
      const normalY = ux;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(shaftEndX + normalX * headWidth, shaftEndY + normalY * headWidth);
      ctx.lineTo(shaftEndX - normalX * headWidth, shaftEndY - normalY * headWidth);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  private drawPathCellHighlight(
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    cellSize: number,
    isTargetCell: boolean,
    alpha: number,
  ) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = isTargetCell ? PATH_TARGET_FILL_COLOR : PATH_FILL_COLOR;
    ctx.fillRect(sx + 1, sy + 1, cellSize - 2, cellSize - 2);
    ctx.strokeStyle = isTargetCell ? PATH_TARGET_STROKE_COLOR : PATH_STROKE_COLOR;
    ctx.lineWidth = isTargetCell ? 2 : 1.5;
    ctx.strokeRect(sx + 1.5, sy + 1.5, cellSize - 3, cellSize - 3);
    if (isTargetCell) {
      ctx.fillStyle = PATH_TARGET_CORE_COLOR;
      ctx.beginPath();
      ctx.arc(sx + cellSize / 2, sy + cellSize / 2, Math.max(3, cellSize * 0.12), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

/** getFadingPathAlpha：执行对应的业务逻辑。 */
  private getFadingPathAlpha(now: number): number {
    if (!this.fadingPath) {
      return 0;
    }
/** progress：定义该变量以承载业务值。 */
    const progress = (now - this.fadingPath.startedAt) / this.fadingPath.durationMs;
    if (progress >= 1) {
      this.fadingPath = null;
      return 0;
    }
    return Math.max(0, 1 - progress);
  }

/** arePathCellsEqual：执行对应的业务逻辑。 */
  private arePathCellsEqual(a: { x: number; y: number }[], b: { x: number; y: number }[]): boolean {
    if (a.length !== b.length) {
      return false;
    }
    for (let index = 0; index < a.length; index++) {
      if (a[index].x !== b[index].x || a[index].y !== b[index].y) {
        return false;
      }
    }
    return true;
  }

  private isPathCellRenderable(
    x: number,
    y: number,
    visibleTiles: ReadonlySet<string>,
    playerX: number,
    playerY: number,
    displayRangeX: number,
    displayRangeY: number,
  ): boolean {
/** key：定义该变量以承载业务值。 */
    const key = `${x},${y}`;
    return visibleTiles.has(key) || (Math.abs(x - playerX) <= displayRangeX && Math.abs(y - playerY) <= displayRangeY);
  }

/** renderTimeOverlay：执行对应的业务逻辑。 */
  private renderTimeOverlay(time: GameTimeState | null): void {
    if (!this.ctx || !time) {
      return;
    }
/** ctx：定义该变量以承载业务值。 */
    const ctx = this.ctx;
/** atmosphere：定义该变量以承载业务值。 */
    const atmosphere = this.resolveTimeAtmosphere(time);
    ctx.save();
    if (atmosphere.overlay[3] > 0.001) {
      ctx.fillStyle = this.toOverlayColor(atmosphere.overlay);
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    if (atmosphere.sky[3] > 0.001) {
/** skyGradient：定义该变量以承载业务值。 */
      const skyGradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height * 0.72);
      skyGradient.addColorStop(0, this.toOverlayColor(atmosphere.sky));
      skyGradient.addColorStop(0.7, this.toOverlayColor([
        atmosphere.sky[0],
        atmosphere.sky[1],
        atmosphere.sky[2],
        atmosphere.sky[3] * 0.18,
      ]));
      skyGradient.addColorStop(1, this.toOverlayColor([atmosphere.sky[0], atmosphere.sky[1], atmosphere.sky[2], 0]));
      ctx.fillStyle = skyGradient;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    if (atmosphere.horizon[3] > 0.001) {
/** horizonGradient：定义该变量以承载业务值。 */
      const horizonGradient = ctx.createLinearGradient(0, ctx.canvas.height * 0.35, 0, ctx.canvas.height);
      horizonGradient.addColorStop(0, this.toOverlayColor([atmosphere.horizon[0], atmosphere.horizon[1], atmosphere.horizon[2], 0]));
      horizonGradient.addColorStop(0.58, this.toOverlayColor([
        atmosphere.horizon[0],
        atmosphere.horizon[1],
        atmosphere.horizon[2],
        atmosphere.horizon[3] * 0.42,
      ]));
      horizonGradient.addColorStop(1, this.toOverlayColor(atmosphere.horizon));
      ctx.fillStyle = horizonGradient;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    if (atmosphere.vignetteAlpha > 0.001) {
/** radius：定义该变量以承载业务值。 */
      const radius = Math.max(ctx.canvas.width, ctx.canvas.height) * 0.9;
/** vignette：定义该变量以承载业务值。 */
      const vignette = ctx.createRadialGradient(
        ctx.canvas.width * 0.5,
        ctx.canvas.height * 0.46,
        0,
        ctx.canvas.width * 0.5,
        ctx.canvas.height * 0.5,
        radius,
      );
      vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vignette.addColorStop(0.58, `rgba(9, 8, 11, ${(atmosphere.vignetteAlpha * 0.18).toFixed(3)})`);
      vignette.addColorStop(1, `rgba(5, 4, 8, ${atmosphere.vignetteAlpha.toFixed(3)})`);
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    ctx.restore();
  }

/** resolveTimeAtmosphere：执行对应的业务逻辑。 */
  private resolveTimeAtmosphere(time: GameTimeState): TimeAtmosphereState {
/** profile：定义该变量以承载业务值。 */
    const profile = TIME_ATMOSPHERE_PROFILES[time.phase];
/** target：定义该变量以承载业务值。 */
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
    this.timeAtmosphere.vignetteAlpha = this.lerpNumber(
      this.timeAtmosphere.vignetteAlpha,
      target.vignetteAlpha,
      TIME_FILTER_LERP,
    );
    return this.timeAtmosphere;
  }

/** buildRgbaVector：执行对应的业务逻辑。 */
  private buildRgbaVector(hex: string, alpha: number): [number, number, number, number] {
/** value：定义该变量以承载业务值。 */
    const value = hex.trim().replace('#', '');
/** normalized：定义该变量以承载业务值。 */
    const normalized = value.length === 3
      ? value.split('').map((char) => char + char).join('')
      : value.padEnd(6, '0').slice(0, 6);
/** red：定义该变量以承载业务值。 */
    const red = Number.parseInt(normalized.slice(0, 2), 16) || 0;
/** green：定义该变量以承载业务值。 */
    const green = Number.parseInt(normalized.slice(2, 4), 16) || 0;
/** blue：定义该变量以承载业务值。 */
    const blue = Number.parseInt(normalized.slice(4, 6), 16) || 0;
/** safeAlpha：定义该变量以承载业务值。 */
    const safeAlpha = Math.max(0, Math.min(1, alpha));
    return [red, green, blue, safeAlpha];
  }

  private lerpColorVector(
    current: [number, number, number, number],
    target: [number, number, number, number],
    factor: number,
  ): [number, number, number, number] {
    return [
      this.lerpNumber(current[0], target[0], factor),
      this.lerpNumber(current[1], target[1], factor),
      this.lerpNumber(current[2], target[2], factor),
      this.lerpNumber(current[3], target[3], factor),
    ];
  }

/** lerpNumber：执行对应的业务逻辑。 */
  private lerpNumber(current: number, target: number, factor: number): number {
    return current + (target - current) * factor;
  }

/** toOverlayColor：执行对应的业务逻辑。 */
  private toOverlayColor(color: [number, number, number, number]): string {
    const [red, green, blue, alpha] = color;
    return `rgba(${red.toFixed(2)}, ${green.toFixed(2)}, ${blue.toFixed(2)}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
  }

/** drawGroundPileIndicator：处理当前场景中的对应操作。 */
  private drawGroundPileIndicator(sx: number, sy: number, cellSize: number, pile: GroundItemPileView) {
    if (!this.ctx) {
      return;
    }
/** ctx：定义该变量以承载业务值。 */
    const ctx = this.ctx;
/** slotSize：定义该变量以承载业务值。 */
    const slotSize = Math.max(8, Math.floor(cellSize / GROUND_ITEM_GRID_SIZE));
/** gridSize：定义该变量以承载业务值。 */
    const gridSize = slotSize * GROUND_ITEM_GRID_SIZE;
/** offsetX：定义该变量以承载业务值。 */
    const offsetX = sx + Math.max(0, cellSize - gridSize);
/** offsetY：定义该变量以承载业务值。 */
    const offsetY = sy + Math.max(0, cellSize - gridSize);
/** iconCount：定义该变量以承载业务值。 */
    const iconCount = Math.min(pile.items.length, GROUND_ITEM_ICON_POSITIONS.length);
/** hiddenCount：定义该变量以承载业务值。 */
    const hiddenCount = Math.max(0, pile.items.length - GROUND_ITEM_ICON_POSITIONS.length);
/** entries：定义该变量以承载业务值。 */
    const entries = hiddenCount > 0
      ? [...pile.items.slice(0, GROUND_ITEM_ICON_POSITIONS.length - 1), {
          itemKey: `${pile.sourceId}:overflow`,
          itemId: '',
          name: `其余 ${hiddenCount} 种`,
          type: 'material' as const,
          count: hiddenCount,
          groundLabel: '余',
        }]
      : pile.items.slice(0, iconCount);

    for (let index = 0; index < entries.length; index++) {
      const position = GROUND_ITEM_ICON_POSITIONS[index];
      const iconX = offsetX + position.col * slotSize;
/** iconY：定义该变量以承载业务值。 */
      const iconY = offsetY + position.row * slotSize;
      this.drawGroundItemEntryIcon(iconX, iconY, slotSize, entries[index]);
    }
  }

/** drawGroundItemEntryIcon：执行对应的业务逻辑。 */
  private drawGroundItemEntryIcon(x: number, y: number, slotSize: number, entry: GroundItemEntryView): void {
    if (!this.ctx) {
      return;
    }
/** ctx：定义该变量以承载业务值。 */
    const ctx = this.ctx;
/** iconInset：定义该变量以承载业务值。 */
    const iconInset = Math.max(0.75, slotSize * 0.05);
/** iconSize：定义该变量以承载业务值。 */
    const iconSize = Math.max(6, slotSize - iconInset * 2);
/** iconX：定义该变量以承载业务值。 */
    const iconX = x + iconInset;
/** iconY：定义该变量以承载业务值。 */
    const iconY = y + iconInset;
/** typePalette：定义该变量以承载业务值。 */
    const typePalette = GROUND_ITEM_TYPE_PALETTES[entry.type] ?? GROUND_ITEM_TYPE_PALETTES.material;
/** gradePalette：定义该变量以承载业务值。 */
    const gradePalette = resolveGroundItemGradePalette(entry.grade);
/** label：定义该变量以承载业务值。 */
    const label = resolveGroundItemLabel(entry);

    ctx.save();
    ctx.shadowColor = gradePalette.glow;
    ctx.shadowBlur = Math.max(2, slotSize * 0.24);
    ctx.fillStyle = typePalette.fill;
    ctx.strokeStyle = gradePalette.border;
    ctx.lineWidth = Math.max(1, slotSize * 0.08);
    this.drawGroundItemBasePlate(ctx, entry.type, iconX, iconY, iconSize, typePalette.accent);
    ctx.restore();

    ctx.save();
/** fontSize：定义该变量以承载业务值。 */
    const fontSize = this.resolveGroundItemLabelFontSize(slotSize, label);
    ctx.fillStyle = typePalette.text;
    ctx.strokeStyle = 'rgba(12, 10, 8, 0.94)';
    ctx.lineWidth = Math.max(1.6, fontSize * 0.18);
    ctx.lineJoin = 'round';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = buildCanvasFont('badge', fontSize);
    ctx.strokeText(label, x + slotSize / 2, y + slotSize / 2 + slotSize * 0.02);
    ctx.fillText(label, x + slotSize / 2, y + slotSize / 2 + slotSize * 0.02);
    ctx.restore();

    this.drawGroundItemCountBadge(x, y, slotSize, entry.count, gradePalette);
  }

  private drawGroundItemBasePlate(
    ctx: CanvasRenderingContext2D,
    type: ItemType,
    x: number,
    y: number,
    size: number,
    accentColor: string,
  ): void {
/** radius：定义该变量以承载业务值。 */
    const radius = Math.max(2, size * 0.18);

    ctx.beginPath();
    if (type === 'consumable') {
      ctx.ellipse(x + size / 2, y + size / 2, size * 0.44, size * 0.4, 0, 0, Math.PI * 2);
    } else if (type === 'material') {
      ctx.moveTo(x + size * 0.24, y + size * 0.18);
      ctx.lineTo(x + size * 0.72, y + size * 0.12);
      ctx.lineTo(x + size * 0.88, y + size * 0.46);
      ctx.lineTo(x + size * 0.68, y + size * 0.84);
      ctx.lineTo(x + size * 0.3, y + size * 0.88);
      ctx.lineTo(x + size * 0.12, y + size * 0.5);
      ctx.closePath();
    } else if (type === 'skill_book') {
      ctx.roundRect(x + size * 0.08, y + size * 0.12, size * 0.84, size * 0.76, radius);
    } else if (type === 'quest_item') {
      ctx.moveTo(x + size / 2, y + size * 0.08);
      ctx.lineTo(x + size * 0.88, y + size * 0.28);
      ctx.lineTo(x + size * 0.76, y + size * 0.84);
      ctx.lineTo(x + size * 0.24, y + size * 0.84);
      ctx.lineTo(x + size * 0.12, y + size * 0.28);
      ctx.closePath();
    } else {
      ctx.roundRect(x + size * 0.1, y + size * 0.1, size * 0.8, size * 0.8, radius);
    }
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.fillStyle = accentColor;
    if (type === 'equipment') {
      ctx.fillRect(x + size * 0.18, y + size * 0.62, size * 0.64, Math.max(1, size * 0.08));
      ctx.fillRect(x + size * 0.46, y + size * 0.2, Math.max(1, size * 0.08), size * 0.42);
    } else if (type === 'material') {
      ctx.beginPath();
      ctx.arc(x + size * 0.52, y + size * 0.48, size * 0.14, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'consumable') {
      ctx.fillRect(x + size * 0.42, y + size * 0.18, size * 0.16, size * 0.18);
      ctx.fillRect(x + size * 0.34, y + size * 0.34, size * 0.32, size * 0.34);
    } else if (type === 'skill_book') {
      ctx.fillRect(x + size * 0.24, y + size * 0.2, Math.max(1, size * 0.06), size * 0.52);
      ctx.fillRect(x + size * 0.36, y + size * 0.3, size * 0.34, Math.max(1, size * 0.06));
    } else if (type === 'quest_item') {
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size * 0.48, size * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawGroundItemCountBadge(
    x: number,
    y: number,
    slotSize: number,
    count: number,
    palette: GroundItemGradePalette,
  ): void {
    if (!this.ctx || count <= 1) {
      return;
    }
/** ctx：定义该变量以承载业务值。 */
    const ctx = this.ctx;
/** countText：定义该变量以承载业务值。 */
    const countText = formatDisplayInteger(Math.max(0, count));
/** badgeFont：定义该变量以承载业务值。 */
    const badgeFont = Math.max(5, slotSize * 0.26);
    ctx.save();
/** badgeCanvasFont：定义该变量以承载业务值。 */
    const badgeCanvasFont = buildCanvasFont('badge', badgeFont);
    ctx.font = badgeCanvasFont;
/** paddingX：定义该变量以承载业务值。 */
    const paddingX = Math.max(2, slotSize * 0.1);
/** badgeHeight：定义该变量以承载业务值。 */
    const badgeHeight = Math.max(7, slotSize * 0.36);
/** badgeWidth：定义该变量以承载业务值。 */
    const badgeWidth = Math.max(
      badgeHeight,
      this.textMeasureCache.measureWidth(ctx, badgeCanvasFont, countText) + paddingX * 2,
    );
/** badgeX：定义该变量以承载业务值。 */
    const badgeX = x + slotSize - badgeWidth + Math.max(0, slotSize * 0.04);
/** badgeY：定义该变量以承载业务值。 */
    const badgeY = y - Math.max(0, slotSize * 0.02);
    ctx.fillStyle = palette.badgeFill;
    ctx.strokeStyle = palette.badgeStroke;
    ctx.lineWidth = Math.max(1, slotSize * 0.06);
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, badgeHeight / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff9ed';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(countText, badgeX + badgeWidth / 2, badgeY + badgeHeight / 2 + 0.2);
    ctx.restore();
  }

/** resolveGroundItemLabelFontSize：执行对应的业务逻辑。 */
  private resolveGroundItemLabelFontSize(slotSize: number, label: string): number {
/** textLength：定义该变量以承载业务值。 */
    const textLength = [...label].length;
    if (textLength >= 2) {
      return Math.max(5.25, slotSize * 0.28);
    }
    return Math.max(6, slotSize * 0.4);
  }

/** drawOutlinedText：处理当前场景中的对应操作。 */
  private drawOutlinedText(text: string, x: number, y: number, fill: string, stroke: string) {
    if (!this.ctx) return;
    this.ctx.lineJoin = 'round';
    this.ctx.lineWidth = 3;
    this.ctx.strokeStyle = stroke;
    this.ctx.strokeText(text, x, y);
    this.ctx.fillStyle = fill;
    this.ctx.fillText(text, x, y);
  }

/** drawOutlinedVerticalText：处理当前场景中的对应操作。 */
  private drawOutlinedVerticalText(text: string, x: number, y: number, fill: string, stroke: string, lineHeight: number) {
    if (!this.ctx) return;
/** ctx：定义该变量以承载业务值。 */
    const ctx = this.ctx;
/** chars：定义该变量以承载业务值。 */
    const chars = [...text.trim()].filter((char) => char.trim().length > 0);
    if (chars.length === 0) {
      return;
    }
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = stroke;
    ctx.fillStyle = fill;
    chars.forEach((char, index) => {
/** drawY：定义该变量以承载业务值。 */
      const drawY = y + lineHeight * index;
      ctx.strokeText(char, x, drawY);
      ctx.fillText(char, x, drawY);
    });
  }

}


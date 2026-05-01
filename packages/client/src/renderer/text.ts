/**
 * 文字渲染器——基于 Canvas 2D 的地图、实体与特效绘制，默认 IRenderer 实现。
 */

import { FormationRangeOverlayState, IRenderer, SenseQiOverlayState, TargetingOverlayState, type FloatingActionTextStyle } from './types';
import {
  DEFAULT_AURA_LEVEL_BASE_VALUE,
  GameTimeState,
  GroundItemEntryView,
  GroundItemPileView,
  getAuraLevel,
  isOffsetInRange,
  ItemType,
  NpcQuestMarker,
  parseQiResourceKey,
  TILE_VISUAL_BG_COLORS,
  TILE_VISUAL_GLYPHS,
  TILE_VISUAL_GLYPH_COLORS,
  normalizeAuraLevelBaseValue,
  RenderEntity,
  SENSE_QI_OVERLAY_STYLE,
  Tile,
  type FormationRangeShape,
  type MonsterTier,
  TechniqueGrade,
  TimePhaseId,
  VisibleBuffState,
} from '@mud/shared';
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
import { getEntityBadgeClassName, getMonsterPresentation } from '../monster-presentation';
import { TextMeasureCache } from './text-measure-cache';
import { TileSpriteCache } from './tile-sprite-cache';

/** 时间氛围过渡状态。 */
interface TimeAtmosphereState {
/**
 * initialized：initialized相关字段。
 */

  initialized: boolean;  
  /**
 * overlay：overlay相关字段。
 */

  overlay: [number, number, number, number];  
  /**
 * sky：sky相关字段。
 */

  sky: [number, number, number, number];  
  /**
 * horizon：horizon相关字段。
 */

  horizon: [number, number, number, number];  
  /**
 * vignetteAlpha：vignetteAlpha相关字段。
 */

  vignetteAlpha: number;
}

interface TileVisibilityFadeState {
  startedAt: number;
  durationMs: number;
}

/** 地面物品类型配色。 */
type GroundItemTypePalette = {
/**
 * fill：fill相关字段。
 */

  fill: string;  
  /**
 * stroke：stroke相关字段。
 */

  stroke: string;  
  /**
 * accent：accent相关字段。
 */

  accent: string;  
  /**
 * text：text名称或显示文本。
 */

  text: string;
};

/** 地面物品评级配色。 */
type GroundItemGradePalette = {
/**
 * border：border相关字段。
 */

  border: string;  
  /**
 * glow：glow相关字段。
 */

  glow: string;  
  /**
 * badgeFill：badgeFill相关字段。
 */

  badgeFill: string;  
  /**
 * badgeStroke：badgeStroke相关字段。
 */

  badgeStroke: string;
};

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

/** 地面物品默认评级。 */
const DEFAULT_GROUND_ITEM_GRADE: TechniqueGrade = 'mortal';
/** 地面物品在格子中的图标网格边长。 */
const GROUND_ITEM_GRID_SIZE = 3;
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

/** 提取并规范化地面物品显示标签。 */
function resolveGroundItemLabel(entry: GroundItemEntryView): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const explicit = [...(entry.groundLabel?.trim() ?? '')].filter((char) => char.trim().length > 0).join('');
  if (explicit) {
    return explicit.slice(0, 2);
  }
  const chars = [...entry.name.trim()].filter((char) => char.trim().length > 0);
  const hanChar = chars.find((char) => /[\u3400-\u9fff\uf900-\ufaff]/u.test(char));
  if (hanChar) {
    return hanChar;
  }
  const wordChar = chars.find((char) => /[A-Za-z0-9]/.test(char));
  if (wordChar) {
    return wordChar.toUpperCase();
  }
  return chars[0]?.slice(0, 1) ?? '?';
}

/** 按评级读取地面物品配色。 */
function resolveGroundItemGradePalette(grade?: TechniqueGrade): GroundItemGradePalette {
  return GROUND_ITEM_GRADE_PALETTES[grade ?? DEFAULT_GROUND_ITEM_GRADE] ?? GROUND_ITEM_GRADE_PALETTES[DEFAULT_GROUND_ITEM_GRADE];
}

/** 指数衰减的 easeOut 缓动。 */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** 依据感气值计算叠加层 RGBA 样式。 */
function getSenseQiOverlayStyle(
  aura: number,
  levelBaseValue = DEFAULT_AURA_LEVEL_BASE_VALUE,
  family: 'aura' | 'sha' | 'demonic' = 'aura',
): string {
  void levelBaseValue;
  const normalized = Math.max(0, Math.min(aura, SENSE_QI_OVERLAY_STYLE.maxAuraLevel)) / SENSE_QI_OVERLAY_STYLE.maxAuraLevel;
  const palette = family === 'sha'
    ? {
      baseRed: 30,
      redRange: 164,
      baseGreen: 10,
      greenRange: 54,
      baseBlue: 8,
      blueRange: 32,
    }
    : family === 'demonic'
      ? {
        baseRed: 10,
        redRange: 56,
        baseGreen: 24,
        greenRange: 150,
        baseBlue: 12,
        blueRange: 48,
      }
      : SENSE_QI_OVERLAY_STYLE;
  const red = Math.round(palette.baseRed + normalized * palette.redRange);
  const green = Math.round(palette.baseGreen + normalized * palette.greenRange);
  const blue = Math.round(palette.baseBlue + normalized * palette.blueRange);
  const alpha = SENSE_QI_OVERLAY_STYLE.baseAlpha - normalized * SENSE_QI_OVERLAY_STYLE.alphaRange;
  return `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(3)})`;
}

function resolveSenseQiOverlaySignal(tile: Tile | null | undefined, levelBaseValue = DEFAULT_AURA_LEVEL_BASE_VALUE): {
  family: 'aura' | 'sha' | 'demonic';
  value: number;
} {
  if (!tile) {
    return { family: 'aura', value: 0 };
  }
  if (!Array.isArray(tile.resources) || tile.resources.length === 0) {
    return { family: 'aura', value: Math.max(0, tile.aura ?? 0) };
  }
  let strongestFamily: 'aura' | 'sha' | 'demonic' = 'aura';
  let strongestValue = Math.max(0, tile.aura ?? 0);
  for (const resource of tile.resources) {
    const resourceValue = resource.effectiveValue ?? resource.value;
    const candidate = typeof resource.level === 'number' && Number.isFinite(resource.level)
      ? resource.level
      : getAuraLevel(resourceValue, levelBaseValue);
    if (typeof candidate !== 'number' || !Number.isFinite(candidate) || candidate <= strongestValue) {
      continue;
    }
    const parsed = parseQiResourceKey(resource.key);
    if (!parsed) {
      continue;
    }
    strongestFamily = parsed.family;
    strongestValue = candidate;
  }
  return {
    family: strongestFamily,
    value: strongestValue,
  };
}

/** 渲染中实体的动画状态。 */
interface AnimEntity {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * gridX：gridX相关字段。
 */

  gridX: number;  
  /**
 * gridY：gridY相关字段。
 */

  gridY: number;  
  /**
 * oldWX：oldWX相关字段。
 */

  oldWX: number;  
  /**
 * oldWY：oldWY相关字段。
 */

  oldWY: number;  
  /**
 * targetWX：目标WX相关字段。
 */

  targetWX: number;  
  /**
 * targetWY：目标WY相关字段。
 */

  targetWY: number;  
  /**
 * char：char相关字段。
 */

  char: string;  
  /**
 * color：color相关字段。
 */

  color: string;  
  /**
 * badge：badge相关字段。
 */

  badge?: RenderEntity['badge'];  
  /**
 * name：名称名称或显示文本。
 */

  name?: string;  
  /**
 * kind：kind相关字段。
 */

  kind?: string;  
  /**
 * monsterTier：怪物Tier相关字段。
 */

  monsterTier?: MonsterTier;  
  /**
 * monsterScale：怪物Scale相关字段。
 */

  monsterScale?: number;  
  /**
 * hp：hp相关字段。
 */

  hp?: number;  
  /**
 * maxHp：maxHp相关字段。
 */

  maxHp?: number;  
  /**
 * respawnRemainingTicks：回生/重生剩余 tick。
 */

  respawnRemainingTicks?: number;
  /**
 * respawnTotalTicks：回生/重生总 tick。
 */

  respawnTotalTicks?: number;
  /**
 * npcQuestMarker：NPC任务Marker相关字段。
 */

  npcQuestMarker?: NpcQuestMarker;  
  /**
 * hostile：hostile相关字段。
 */

  hostile?: boolean;  
  /**
 * buffs：buff相关字段。
 */

  buffs?: VisibleBuffState[];
  /** 阵法影响半径。 */
  formationRadius?: number;
  /** 阵法范围形状。 */
  formationRangeShape?: FormationRangeShape;
  /** 感气范围高亮颜色。 */
  formationRangeHighlightColor?: string;
  /** 阵法边界专用字符。 */
  formationBoundaryChar?: string;
  /** 阵法边界专用颜色。 */
  formationBoundaryColor?: string;
  /** 阵法边界专用范围高亮色。 */
  formationBoundaryRangeHighlightColor?: string;
  /** 阵眼是否无需感气即可直接看见。 */
  formationEyeVisibleWithoutSenseQi?: boolean;
  /** 阵法范围是否无需感气即可直接看见。 */
  formationRangeVisibleWithoutSenseQi?: boolean;
  /** 阵法边界是否无需感气即可直接看见。 */
  formationBoundaryVisibleWithoutSenseQi?: boolean;
  /** 阵法实体是否显示名称文本。 */
  formationShowText?: boolean;
  /** 阵法边界是否阻挡通行。 */
  formationBlocksBoundary?: boolean;
  /** 阵法是否处于开启状态。 */
  formationActive?: boolean;
}

/** 渲染输出实体快照，包含屏幕坐标。 */
interface RenderedAnimEntity {
/**
 * anim：anim相关字段。
 */

  anim: AnimEntity;  
  /**
 * presentation：presentation相关字段。
 */

  presentation: ReturnType<typeof getMonsterPresentation> | null;  
  /**
 * sx：sx相关字段。
 */

  sx: number;  
  /**
 * sy：sy相关字段。
 */

  sy: number;  
  /**
 * centerX：centerX相关字段。
 */

  centerX: number;  
  /**
 * centerY：centerY相关字段。
 */

  centerY: number;  
  /**
 * cellSize：数量或计量字段。
 */

  cellSize: number;  
  /**
 * visualSx：visualSx相关字段。
 */

  visualSx: number;  
  /**
 * visualSy：visualSy相关字段。
 */

  visualSy: number;  
  /**
 * visualCellSize：数量或计量字段。
 */

  visualCellSize: number;
}

function getEntityRenderLayer(kind: string | null | undefined): number {
  if (kind === 'formation') {
    return 0;
  }
  if (kind === 'container') {
    return 1;
  }
  if (kind === 'npc') {
    return 2;
  }
  if (kind === 'monster') {
    return 3;
  }
  if (kind === 'crowd') {
    return 4;
  }
  if (kind === 'player') {
    return 5;
  }
  return 2;
}

function isTileInsideFormationRange(anim: AnimEntity, gx: number, gy: number): boolean {
  const radius = Math.max(1, Math.trunc(Number(anim.formationRadius) || 0));
  const dx = gx - anim.gridX;
  const dy = gy - anim.gridY;
  if (Math.abs(dx) > radius || Math.abs(dy) > radius) {
    return false;
  }
  if (anim.formationRangeShape === 'circle') {
    return (dx * dx) + (dy * dy) <= radius * radius;
  }
  if (anim.formationRangeShape === 'checkerboard') {
    return ((gx + gy) % 2) === 0;
  }
  return true;
}

function isTileOnFormationBoundary(anim: AnimEntity, gx: number, gy: number): boolean {
  if (!isTileInsideFormationRange(anim, gx, gy)) {
    return false;
  }
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

function colorWithAlpha(color: string | undefined, alpha: number): string {
  const fallback = `rgba(59, 130, 246, ${alpha})`;
  const value = typeof color === 'string' ? color.trim() : '';
  if (!value) {
    return fallback;
  }
  if (/^rgba?\(/i.test(value) || /^hsla?\(/i.test(value)) {
    return value;
  }
  const hex = value.startsWith('#') ? value.slice(1) : '';
  if (hex.length === 3 || hex.length === 6) {
    const expanded = hex.length === 3
      ? hex.split('').map((entry) => `${entry}${entry}`).join('')
      : hex;
    const numeric = Number.parseInt(expanded, 16);
    if (Number.isFinite(numeric)) {
      const r = (numeric >> 16) & 255;
      const g = (numeric >> 8) & 255;
      const b = numeric & 255;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  return value;
}

/** 浮动文字实例。 */
interface FloatingText {
/**
 * id：ID标识。
 */

  id: number;  
  /**
 * x：x相关字段。
 */

  x: number;  
  /**
 * y：y相关字段。
 */

  y: number;  
  /**
 * text：text名称或显示文本。
 */

  text: string;  
  /**
 * color：color相关字段。
 */

  color: string;  
  /**
 * variant：variant相关字段。
 */

  variant: 'damage' | 'action';  
  /**
 * actionStyle：actionStyle相关字段。
 */

  actionStyle?: FloatingActionTextStyle;  
  /**
 * createdAt：createdAt相关字段。
 */

  createdAt: number;  
  /**
 * duration：duration相关字段。
 */

  duration: number;
}

/** 攻击拖尾实例。 */
interface AttackTrail {
/**
 * id：ID标识。
 */

  id: number;  
  /**
 * fromX：fromX相关字段。
 */

  fromX: number;  
  /**
 * fromY：fromY相关字段。
 */

  fromY: number;  
  /**
 * toX：toX相关字段。
 */

  toX: number;  
  /**
 * toY：toY相关字段。
 */

  toY: number;  
  /**
 * color：color相关字段。
 */

  color: string;  
  /**
 * createdAt：createdAt相关字段。
 */

  createdAt: number;  
  /**
 * duration：duration相关字段。
 */

  duration: number;
}

/** 预警区域实例。 */
interface WarningZone {
/**
 * id：ID标识。
 */

  id: number;  
  /**
 * cells：cell相关字段。
 */

  cells: Array<{  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number;  
 /**
 * expandDistance：expandDistance相关字段。
 */
 expandDistance: number }>;  
 /**
 * color：color相关字段。
 */

  color: string;  
  /**
 * baseColor：baseColor相关字段。
 */

  baseColor: string;  
  /**
 * originX：originX相关字段。
 */

  originX: number;  
  /**
 * originY：originY相关字段。
 */

  originY: number;  
  /**
 * maxExpandDistance：maxExpandDistance相关字段。
 */

  maxExpandDistance: number;  
  /**
 * createdAt：createdAt相关字段。
 */

  createdAt: number;  
  /**
 * duration：duration相关字段。
 */

  duration: number;
}

/** 浮动文字在同点堆叠时的偏移。 */
interface FloatingTextBurstOffset {
/**
 * offsetX：offsetX相关字段。
 */

  offsetX: number;  
  /**
 * offsetY：offsetY相关字段。
 */

  offsetY: number;
}

/** 旧路径淡出过渡状态。 */
interface FadingPathState {
/**
 * cells：cell相关字段。
 */

  cells: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number }[];  
 /**
 * keys：key相关字段。
 */

  keys: Set<string>;  
  /**
 * indexByKey：indexByKey标识。
 */

  indexByKey: Map<string, number>;  
  /**
 * targetKey：目标Key标识。
 */

  targetKey: string | null;  
  /**
 * startedAt：startedAt相关字段。
 */

  startedAt: number;  
  /**
 * durationMs：durationM相关字段。
 */

  durationMs: number;
}

/** 路径淡出默认时长（ms）。 */
const DEFAULT_PATH_TRAIL_FADE_MS = 500;
/** 路径过渡最小透明度系数。 */
const PATH_TRAIL_FADE_ALPHA = 0.7;
/** 浮动文字缓存上限。 */
const MAX_FLOATING_TEXTS = 256;
/** 攻击拖尾缓存上限。 */
const MAX_ATTACK_TRAILS = 192;
/** 预警区域缓存上限。 */
const MAX_WARNING_ZONES = 64;
/** 预警区域默认持续时长。 */
const DEFAULT_WARNING_ZONE_DURATION_MS = 1240;

/** 地图/实体/特效的 Canvas 文字渲染器。 */
export class TextRenderer implements IRenderer {
  /** 当前 2D 上下文。 */
  private ctx: CanvasRenderingContext2D | null = null;
  /** 实体动画状态表。 */
  private entities: Map<string, AnimEntity> = new Map();  
  /**
 * threatArrows：集合字段。
 */

  private threatArrows: Array<{  
  /**
 * ownerId：ownerID标识。
 */
 ownerId: string;  
 /**
 * targetId：目标ID标识。
 */
 targetId: string }> = [];
  /** 地面物品堆映射。 */
  private groundPiles = new Map<string, GroundItemPileView>();
  /** 容器地块键集合。 */
  private containerTileKeys = new Set<string>();  
  /**
 * pathCells：路径Cell相关字段。
 */

  private pathCells: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number }[] = [];
  /** 当前路径键集合。 */
  private pathKeys = new Set<string>();
  /** 路径索引映射（用于路径箭头方向）。 */
  private pathIndexByKey = new Map<string, number>();
  /** 当前路径终点。 */
  private pathTargetKey: string | null = null;
  /** 旧路径的淡出状态。 */
  private fadingPath: FadingPathState | null = null;
  /** 瞄准叠加层状态。 */
  private targetingOverlay: TargetingOverlayState | null = null;
  /** 阵法范围叠加层状态。 */
  private formationRangeOverlay: FormationRangeOverlayState | null = null;
  /** 感气叠加层状态。 */
  private senseQiOverlay: SenseQiOverlayState | null = null;
  /** 受到影响的瞄准格子。 */
  private targetingAffectedKeys = new Set<string>();
  /** 受到影响的阵法范围格子。 */
  private formationRangeAffectedKeys = new Set<string>();
  /** 当前浮动文字列表。 */
  private floatingTexts: FloatingText[] = [];
  /** 当前攻击拖尾列表。 */
  private attackTrails: AttackTrail[] = [];
  /** 当前预警区域列表。 */
  private warningZones: WarningZone[] = [];
  /** 浮动文字 ID 自增。 */
  private nextFloatingTextId = 1;
  /** 攻击拖尾 ID 自增。 */
  private nextAttackTrailId = 1;
  /** 预警区域 ID 自增。 */
  private nextWarningZoneId = 1;  
  /**
 * lastMotionSyncToken：lastMotionSyncToken标识。
 */

  private lastMotionSyncToken?: number;
  /** 上一帧可见地块键集合。 */
  private previousVisibleTileKeys = new Set<string>();
  /** 上一版可见地块修订号。 */
  private previousVisibleTileRevision = -1;
  /** 不可见地块淡入淡出起始时间。 */
  private hiddenTileFadeStartedAt = new Map<string, TileVisibilityFadeState>();
  /** 可见地块淡入起始时间。 */
  private visibleTileFadeStartedAt = new Map<string, TileVisibilityFadeState>();
  /** 文本测量缓存。 */
  private readonly textMeasureCache = new TextMeasureCache();
  /** 地块 sprite 缓存。 */
  private readonly tileSpriteCache = new TileSpriteCache();  
  /**
 * timeAtmosphere：时间Atmosphere相关字段。
 */

  private timeAtmosphere: TimeAtmosphereState = {
    initialized: false,
    overlay: [0, 0, 0, 0],
    sky: [0, 0, 0, 0],
    horizon: [0, 0, 0, 0],
    vignetteAlpha: 0,
  };

  /** 绑定渲染上下文。 */
  init(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** 先清空背景，再绘制下一帧。 */
  clear() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.ctx) return;
    const { width, height } = this.ctx.canvas;
    this.ctx.fillStyle = '#1a1816';
    this.ctx.fillRect(0, 0, width, height);
  }

  /** 重置场景级缓存和动画状态。 */
  resetScene() {
    this.entities.clear();
    this.threatArrows = [];
    this.groundPiles.clear();
    this.containerTileKeys.clear();
    this.floatingTexts = [];
    this.attackTrails = [];
    this.warningZones = [];
    this.targetingOverlay = null;
    this.targetingAffectedKeys.clear();
    this.formationRangeOverlay = null;
    this.formationRangeAffectedKeys.clear();
    this.senseQiOverlay = null;
    this.lastMotionSyncToken = undefined;
    this.previousVisibleTileKeys.clear();
    this.previousVisibleTileRevision = -1;
    this.hiddenTileFadeStartedAt.clear();
    this.visibleTileFadeStartedAt.clear();
    this.textMeasureCache.clear();
    this.timeAtmosphere.initialized = false;
    this.fadingPath = null;
  }

  /** 更新路径高亮状态并构建旧路径过渡。 */
  setPathHighlight(cells: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number }[], fadeDurationMs = DEFAULT_PATH_TRAIL_FADE_MS) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** 记录当前帧需要渲染的威胁箭头。 */
  setThreatArrows(arrows: Array<{  
  /**
 * ownerId：ownerID标识。
 */
 ownerId: string;  
 /**
 * targetId：目标ID标识。
 */
 targetId: string }>) {
    this.threatArrows = arrows.map((entry) => ({ ownerId: entry.ownerId, targetId: entry.targetId }));
  }

  /** 设置瞄准叠加层，并同步受影响格子索引。 */
  setTargetingOverlay(state: TargetingOverlayState | null) {
    this.targetingOverlay = state;
    this.targetingAffectedKeys = new Set((state?.affectedCells ?? []).map((cell) => `${cell.x},${cell.y}`));
  }

  /** 设置阵法范围叠加层，并同步受影响格子索引。 */
  setFormationRangeOverlay(state: FormationRangeOverlayState | null) {
    this.formationRangeOverlay = state;
    this.formationRangeAffectedKeys = new Set((state?.affectedCells ?? []).map((cell) => `${cell.x},${cell.y}`));
  }

  /** 设置感气视角叠加层。 */
  setSenseQiOverlay(state: SenseQiOverlayState | null) {
    this.senseQiOverlay = state;
  }

  /** 设置地面物品堆缓存，支持 Map 与可迭代输入。 */
  setGroundPiles(piles: ReadonlyMap<string, GroundItemPileView> | Iterable<GroundItemPileView>) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (piles instanceof Map) {
      this.groundPiles = piles;
      return;
    }
    const nextPiles = new Map<string, GroundItemPileView>();
    for (const pile of piles as Iterable<GroundItemPileView>) {
      nextPiles.set(`${pile.x},${pile.y}`, pile);
    }
    this.groundPiles = nextPiles;
  }

  /** 绘制地图地块、路径高亮、瞄准叠加层和感气视角。 */
  renderWorld(
    camera: Camera,
    tileCache: ReadonlyMap<string, Tile>,
    visibleTiles: ReadonlySet<string>,
    visibleTileRevision: number,
    visibleTileTransitionStartedAt: number,
    visibleTileTransitionDurationMs: number,
    playerX: number,
    playerY: number,
    displayRangeX: number,
    displayRangeY: number,
    time: GameTimeState | null,
  ) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.ctx) return;
    const ctx = this.ctx;
    const sw = ctx.canvas.width;
    const sh = ctx.canvas.height;
    const cellSize = getCellSize();
    const screenOffsetX = sw / 2 - camera.x + camera.offsetX;
    const screenOffsetY = sh / 2 - camera.y + camera.offsetY;
    const now = performance.now();
    const senseQiLevelBaseValue = normalizeAuraLevelBaseValue(this.senseQiOverlay?.levelBaseValue);
    const fadingPathAlpha = this.getFadingPathAlpha(now);

    if (visibleTileRevision !== this.previousVisibleTileRevision) {
      this.syncTileVisibilityTransitions(
        visibleTiles,
        tileCache,
        now,
        visibleTileTransitionStartedAt,
        visibleTileTransitionDurationMs,
      );
      this.previousVisibleTileRevision = visibleTileRevision;
    }

    // 屏幕可见格子范围
    const camWorldX = camera.x - sw / 2;
    const camWorldY = camera.y - sh / 2;
    const startGX = Math.floor(camWorldX / cellSize) - 1;
    const startGY = Math.floor(camWorldY / cellSize) - 1;
    const endGX = Math.ceil((camWorldX + sw) / cellSize) + 1;
    const endGY = Math.ceil((camWorldY + sh) / cellSize) + 1;

    for (let gy = startGY; gy <= endGY; gy++) {
      for (let gx = startGX; gx <= endGX; gx++) {
        const sx = gx * cellSize + screenOffsetX;
        const sy = gy * cellSize + screenOffsetY;
        if (sx + cellSize < 0 || sx > sw || sy + cellSize < 0 || sy > sh) continue;

        const key = `${gx},${gy}`;
        const tile = tileCache.get(key);
        const isVisible = visibleTiles.has(key);
        const hiddenFade = this.getHiddenTileFade(key, now);
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

          const tileHpVisible = tile.hpVisible ?? (
            typeof tile.hp === 'number'
            && typeof tile.maxHp === 'number'
            && tile.hp > 0
            && tile.hp < tile.maxHp
          );
          if ((tile.maxHp ?? 0) > 0 && tileHpVisible) {
            const ratio = Math.max(0, Math.min(1, (tile.hp ?? 0) / Math.max(tile.maxHp ?? 1, 1)));
            const barX = sx + 3;
            const barY = sy + 2;
            const barW = cellSize - 6;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(barX, barY, barW, 3);
            ctx.fillStyle = '#d6c8ae';
            ctx.fillRect(barX, barY, barW * ratio, 3);
          }

          if (isVisible) {
            const pile = this.groundPiles.get(key);
            if (pile && !this.containerTileKeys.has(key)) {
              this.drawGroundPileIndicator(sx, sy, cellSize, pile);
            }
          }

          if (this.targetingOverlay && (!this.targetingOverlay.visibleOnly || isVisible)) {
            const dx = gx - this.targetingOverlay.originX;
            const dy = gy - this.targetingOverlay.originY;
            const hovered = gx === this.targetingOverlay.hoverX && gy === this.targetingOverlay.hoverY;
            const affected = this.targetingAffectedKeys.has(key);
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

          if (this.formationRangeOverlay && this.formationRangeAffectedKeys.has(key)) {
            const rangeColor = this.formationRangeOverlay.rangeHighlightColor;
            ctx.fillStyle = colorWithAlpha(rangeColor, 0.22);
            ctx.fillRect(sx + 1, sy + 1, cellSize - 2, cellSize - 2);
            ctx.strokeStyle = colorWithAlpha(rangeColor, 0.86);
            ctx.lineWidth = 2;
            ctx.strokeRect(sx + 1.5, sy + 1.5, cellSize - 3, cellSize - 3);
          }
          if (tile && !this.senseQiOverlay && isVisible) {
            const visibleFormationRangeVisual = this.resolveFormationRangeVisual(gx, gy, false);
            if (visibleFormationRangeVisual) {
              this.drawFormationRangeVisual(ctx, sx, sy, cellSize, visibleFormationRangeVisual);
            }
          }
        }

        if (!isVisible) {
          const overlayAlpha = tile ? 0.72 * hiddenFade : 0.94 * hiddenFade;
          ctx.fillStyle = tile
            ? `rgba(12, 10, 8, ${overlayAlpha.toFixed(3)})`
            : `rgba(8, 6, 5, ${overlayAlpha.toFixed(3)})`;
          ctx.fillRect(sx, sy, cellSize, cellSize);
        } else if (visibleFade > 0) {
          const overlayAlpha = 0.72 * visibleFade;
          ctx.fillStyle = `rgba(12, 10, 8, ${overlayAlpha.toFixed(3)})`;
          ctx.fillRect(sx, sy, cellSize, cellSize);
        }

        if (tile && this.senseQiOverlay) {
          const signal: ReturnType<typeof resolveSenseQiOverlaySignal> = isVisible
            ? resolveSenseQiOverlaySignal(tile, senseQiLevelBaseValue)
            : { family: 'aura', value: 0 };
          ctx.fillStyle = getSenseQiOverlayStyle(signal.value, senseQiLevelBaseValue, signal.family);
          ctx.fillRect(sx, sy, cellSize, cellSize);
          const formationRangeVisual = this.resolveFormationRangeVisual(gx, gy, true);
          if (formationRangeVisual) {
            this.drawFormationRangeVisual(ctx, sx, sy, cellSize, formationRangeVisual);
          }
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

  /** 根据可见性变化更新地块淡入淡出状态。 */
  private syncTileVisibilityTransitions(
    visibleTiles: ReadonlySet<string>,
    tileCache: ReadonlyMap<string, Tile>,
    now: number,
    transitionStartedAt: number,
    transitionDurationMs: number,
  ): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
      if (shouldAnimateVisibleEnter && !this.previousVisibleTileKeys.has(key) && tileCache.has(key) && !this.visibleTileFadeStartedAt.has(key)) {
        this.visibleTileFadeStartedAt.set(key, transitionState);
      }
      this.hiddenTileFadeStartedAt.delete(key);
    }
    for (const key of this.previousVisibleTileKeys) {
      if (!visibleTiles.has(key)) {
        this.visibleTileFadeStartedAt.delete(key);
      }
    }
    for (const [key, state] of this.hiddenTileFadeStartedAt) {
      if (!tileCache.has(key) || now - state.startedAt >= state.durationMs) {
        this.hiddenTileFadeStartedAt.delete(key);
      }
    }
    for (const [key, state] of this.visibleTileFadeStartedAt) {
      if (!visibleTiles.has(key) || !tileCache.has(key) || now - state.startedAt >= state.durationMs) {
        this.visibleTileFadeStartedAt.delete(key);
      }
    }
    this.previousVisibleTileKeys = new Set(visibleTiles);
  }

  /** 计算已记忆但当前不可见地块的淡出进度。 */
  private getHiddenTileFade(key: string, now: number): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const state = this.hiddenTileFadeStartedAt.get(key);
    if (state === undefined) {
      return 1;
    }
    return Math.max(0, Math.min(1, (now - state.startedAt) / state.durationMs));
  }

  /** 计算刚变为可见的地块淡入进度。 */
  private getVisibleTileFade(key: string, now: number): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const state = this.visibleTileFadeStartedAt.get(key);
    if (state === undefined) {
      return 0;
    }
    const progress = Math.max(0, Math.min(1, (now - state.startedAt) / state.durationMs));
    return 1 - progress;
  }

  /** 更新实体列表，记录旧位置用于插值动画 */
  updateEntities(
    list: readonly {    
    /**
 * id：ID标识。
 */
 id: string;    
 /**
 * wx：wx相关字段。
 */
 wx: number;    
 /**
 * wy：wy相关字段。
 */
 wy: number;    
 /**
 * char：char相关字段。
 */
 char: string;    
 /**
 * color：color相关字段。
 */
 color: string;    
 /**
 * badge：badge相关字段。
 */
 badge?: RenderEntity['badge'] | null;    
 /**
 * name：名称名称或显示文本。
 */
 name?: string;    
 /**
 * kind：kind相关字段。
 */
 kind?: string;    
 /**
 * monsterTier：怪物Tier相关字段。
 */
 monsterTier?: MonsterTier;    
 /**
 * monsterScale：怪物Scale相关字段。
 */
 monsterScale?: number;    
 /**
 * hp：hp相关字段。
 */
 hp?: number;    
 /**
 * maxHp：maxHp相关字段。
 */
 maxHp?: number;    
 /**
 * respawnRemainingTicks：回生/重生剩余 tick。
 */
 respawnRemainingTicks?: number;
 /**
 * respawnTotalTicks：回生/重生总 tick。
 */
 respawnTotalTicks?: number;
 /**
 * npcQuestMarker：NPC任务Marker相关字段。
 */
 npcQuestMarker?: NpcQuestMarker | null;    
 /**
 * hostile：hostile相关字段。
 */
 hostile?: boolean;    
 /**
 * buffs：buff相关字段。
 */
 buffs?: VisibleBuffState[];
 formationRadius?: number;
 formationRangeShape?: FormationRangeShape;
 formationRangeHighlightColor?: string;
 formationBoundaryChar?: string;
 formationBoundaryColor?: string;
 formationBoundaryRangeHighlightColor?: string;
 formationEyeVisibleWithoutSenseQi?: boolean;
 formationRangeVisibleWithoutSenseQi?: boolean;
 formationBoundaryVisibleWithoutSenseQi?: boolean;
 formationShowText?: boolean;
 formationBlocksBoundary?: boolean;
 formationActive?: boolean }[],
    movedId?: string,
    shiftX = 0,
    shiftY = 0,
    settleMotion = false,
    settleEntityId?: string,
    motionSyncToken?: number,
  ) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const seen = new Set<string>();
    const cellSize = getCellSize();
    const sameMotionSync = motionSyncToken !== undefined && motionSyncToken === this.lastMotionSyncToken;
    this.containerTileKeys = new Set(
      list
        .filter((entry) => entry.kind === 'container')
        .map((entry) => `${entry.wx},${entry.wy}`),
    );
    for (const e of list) {
      seen.add(e.id);
      const twx = e.wx * cellSize;
      const twy = e.wy * cellSize;
      const anim = this.entities.get(e.id);
      if (anim) {
        const sameGrid = anim.gridX === e.wx && anim.gridY === e.wy;
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
        anim.badge = e.badge ?? undefined;
        anim.name = e.name;
        anim.kind = e.kind;
        anim.monsterTier = e.monsterTier;
        anim.monsterScale = e.monsterScale;
        anim.hp = e.hp;
        anim.maxHp = e.maxHp;
        anim.respawnRemainingTicks = e.respawnRemainingTicks;
        anim.respawnTotalTicks = e.respawnTotalTicks;
        anim.npcQuestMarker = e.npcQuestMarker ?? undefined;
        anim.hostile = e.hostile;
        anim.buffs = e.buffs;
        anim.formationRadius = e.formationRadius;
        anim.formationRangeShape = e.formationRangeShape;
        anim.formationRangeHighlightColor = e.formationRangeHighlightColor;
        anim.formationBoundaryChar = e.formationBoundaryChar;
        anim.formationBoundaryColor = e.formationBoundaryColor;
        anim.formationBoundaryRangeHighlightColor = e.formationBoundaryRangeHighlightColor;
        anim.formationEyeVisibleWithoutSenseQi = e.formationEyeVisibleWithoutSenseQi;
        anim.formationRangeVisibleWithoutSenseQi = e.formationRangeVisibleWithoutSenseQi;
        anim.formationBoundaryVisibleWithoutSenseQi = e.formationBoundaryVisibleWithoutSenseQi;
        anim.formationShowText = e.formationShowText;
        anim.formationBlocksBoundary = e.formationBlocksBoundary;
        anim.formationActive = e.formationActive;
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
          badge: e.badge ?? undefined,
          name: e.name,
          kind: e.kind,
          monsterTier: e.monsterTier,
          monsterScale: e.monsterScale,
          hp: e.hp,
          maxHp: e.maxHp,
          respawnRemainingTicks: e.respawnRemainingTicks,
          respawnTotalTicks: e.respawnTotalTicks,
          npcQuestMarker: e.npcQuestMarker ?? undefined,
          hostile: e.hostile,
          buffs: e.buffs,
          formationRadius: e.formationRadius,
          formationRangeShape: e.formationRangeShape,
          formationRangeHighlightColor: e.formationRangeHighlightColor,
          formationBoundaryChar: e.formationBoundaryChar,
          formationBoundaryColor: e.formationBoundaryColor,
          formationBoundaryRangeHighlightColor: e.formationBoundaryRangeHighlightColor,
          formationEyeVisibleWithoutSenseQi: e.formationEyeVisibleWithoutSenseQi,
          formationRangeVisibleWithoutSenseQi: e.formationRangeVisibleWithoutSenseQi,
          formationBoundaryVisibleWithoutSenseQi: e.formationBoundaryVisibleWithoutSenseQi,
          formationShowText: e.formationShowText,
          formationBlocksBoundary: e.formationBlocksBoundary,
          formationActive: e.formationActive,
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
  renderEntities(camera: Camera, progress = 1, localPlayerId?: string, localPlayerX?: number, localPlayerY?: number, localPlayerChar?: string) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.ctx) return;
    const ctx = this.ctx;
    const sw = ctx.canvas.width;
    const sh = ctx.canvas.height;
    const cellSize = getCellSize();
    const renderedEntities: RenderedAnimEntity[] = [];
    const motionProgress = Math.max(0, Math.min(1, progress));
    const t = easeOutCubic(motionProgress);
    const screenOffsetX = sw / 2 - camera.x + camera.offsetX;
    const screenOffsetY = sh / 2 - camera.y + camera.offsetY;
    let crowdedTileKeys: Set<string> | null = null;
    let localPlayerInRenderedEntities = false;
    for (const anim of this.entities.values()) {
      if (anim.kind === 'formation'
        && this.senseQiOverlay === null
        && anim.formationEyeVisibleWithoutSenseQi !== true) {
        continue;
      }
      const wx = anim.oldWX + (anim.targetWX - anim.oldWX) * t;
      const wy = anim.oldWY + (anim.targetWY - anim.oldWY) * t;

      const sx = wx + screenOffsetX;
      const sy = wy + screenOffsetY;
      if (sx + cellSize < 0 || sx > sw || sy + cellSize < 0 || sy > sh) continue;
      const presentation = anim.kind === 'monster'
        ? getMonsterPresentation(anim.name, anim.monsterTier)
        : null;
      const visualScale = (presentation?.scale ?? 1) * Math.max(1, anim.monsterScale ?? 1);
      const visualCellSize = cellSize * visualScale;
      const visualSx = sx - (visualCellSize - cellSize) / 2;
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
      if (anim.kind === 'crowd') {
        crowdedTileKeys ??= new Set<string>();
        crowdedTileKeys.add(`${anim.gridX},${anim.gridY}`);
      }
      if (anim.id === localPlayerId) {
        localPlayerInRenderedEntities = true;
      }
    }

    let localPlayerRendered: RenderedAnimEntity | undefined;
    if (localPlayerId !== undefined
      && Number.isFinite(localPlayerX)
      && Number.isFinite(localPlayerY)
      && !localPlayerInRenderedEntities) {
      const sx = (localPlayerX as number) + screenOffsetX;
      const sy = (localPlayerY as number) + screenOffsetY;
      localPlayerRendered = {
        anim: {
          id: localPlayerId,
          gridX: localPlayerX as number,
          gridY: localPlayerY as number,
          oldWX: localPlayerX as number,
          oldWY: localPlayerY as number,
          targetWX: localPlayerX as number,
          targetWY: localPlayerY as number,
          char: localPlayerChar || '我',
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

    renderedEntities.sort((left, right) => (
      getEntityRenderLayer(left.anim.kind) - getEntityRenderLayer(right.anim.kind)
    ));
    for (const rendered of renderedEntities) {
      const { anim, presentation: monsterPresentation, sx, sy, cellSize: renderedCellSize, visualSx, visualSy, visualCellSize } = rendered;
      const isCrowd = anim.kind === 'crowd';

      if (!isCrowd && anim.kind === 'player' && crowdedTileKeys?.has(`${anim.gridX},${anim.gridY}`)) {
        continue;
      }

      const motionDx = anim.targetWX - anim.oldWX;
      const motionDy = anim.targetWY - anim.oldWY;
      const motionDistance = Math.hypot(motionDx, motionDy);
      const isMoving = motionDistance > 0.5 && motionProgress < 1;
      const travelPulse = isMoving ? Math.sin(Math.PI * motionProgress) : 0;
      const landPhase = isMoving && motionProgress > 0.62
        ? Math.max(0, Math.min(1, (motionProgress - 0.62) / 0.38))
        : 0;
      const landPulse = landPhase > 0 ? Math.sin(Math.PI * landPhase) : 0;
      const motionUnitX = motionDistance > 0 ? motionDx / motionDistance : 0;
      const motionUnitY = motionDistance > 0 ? motionDy / motionDistance : 0;
      const glyphLift = travelPulse * renderedCellSize * 0.08;
      const glyphLean = (motionUnitX - motionUnitY) * travelPulse * 0.1;
      const impactScaleX = 1 + travelPulse * 0.08 + landPulse * 0.1;
      const impactScaleY = 1 - travelPulse * 0.06 - landPulse * 0.12;

      ctx.save();
      if (isMoving) {
        ctx.translate(sx + renderedCellSize / 2, sy + renderedCellSize - 3);
        ctx.scale(1 + travelPulse * 0.24, 1 - travelPulse * 0.16);
        ctx.translate(-(sx + renderedCellSize / 2), -(sy + renderedCellSize - 3));
      }
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(sx + renderedCellSize / 2, sy + renderedCellSize - 3, visualCellSize * 0.32, Math.max(2, visualCellSize * 0.1), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = anim.color;
      ctx.font = buildCanvasFont('entityGlyph', visualCellSize * 0.75);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.save();
      ctx.translate(visualSx + visualCellSize / 2, visualSy + visualCellSize / 2 - glyphLift);
      if (isMoving) {
        ctx.rotate(glyphLean);
        ctx.scale(impactScaleX, impactScaleY);
      }
      this.drawOutlinedText(anim.char, 0, 0, anim.color, 'rgba(15,12,10,0.9)');
      ctx.restore();

      if (anim.kind) {
        const isMonster = anim.kind === 'monster';
        const isPlayer = anim.kind === 'player';
        const isNpc = anim.kind === 'npc';
        const isContainer = anim.kind === 'container';
        const isFormation = anim.kind === 'formation';
        const label = monsterPresentation?.label ?? anim.name ?? (isCrowd ? '人群' : isMonster ? '妖兽' : isPlayer ? '修士' : isContainer ? '箱具' : isFormation ? '阵法' : '道人');
        ctx.textBaseline = 'alphabetic';
        ctx.font = buildCanvasFont('label', renderedCellSize * (isCrowd ? 0.24 : 0.3));
        const labelY = visualSy - Math.max(6, renderedCellSize * 0.18);
        const labelColor = isCrowd ? '#f4dfaf' : isMonster ? '#ffddcc' : isPlayer ? '#d8f3c3' : isContainer ? '#ffe3b8' : isFormation ? '#9cc8ff' : '#cce7ff';
        const badge = anim.badge ?? monsterPresentation?.badge;
        if (!isFormation || anim.formationShowText !== false) {
          if (badge) {
            this.drawEntityBadgeLabel(
              label,
              badge,
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
        }

        if (!isCrowd) {
          this.drawBuffRows(sx, visualSy, renderedCellSize, anim.buffs);
        }

        if (!isCrowd && (anim.maxHp ?? 0) > 0) {
          const ratio = Math.max(0, Math.min(1, (anim.hp ?? 0) / (anim.maxHp ?? 1)));
          const barX = visualSx + 3;
          const barY = visualSy + visualCellSize - 5;
          const barW = visualCellSize - 6;
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.fillRect(barX, barY, barW, 3);
          ctx.fillStyle = anim.hostile === true
            ? '#d15252'
            : isMonster
              ? '#d15252'
              : isNpc
                ? '#58a8ff'
                : isContainer
                  ? '#c18b46'
                  : '#63c46b';
          ctx.fillRect(barX, barY, barW * ratio, 3);
        }

        if (isContainer && (anim.respawnRemainingTicks ?? 0) > 0) {
          ctx.textBaseline = 'top';
          ctx.font = buildCanvasFont('label', renderedCellSize * 0.22);
          this.drawOutlinedText(
            `回生 ${this.formatRespawnCountdown(anim.respawnRemainingTicks)}`,
            sx + renderedCellSize / 2,
            visualSy + visualCellSize + 1,
            '#e7d5a7',
            'rgba(15,12,10,0.92)',
          );
        }

        if (isNpc && anim.npcQuestMarker) {
          this.drawNpcQuestMarker(visualSx, visualSy, visualCellSize, anim.npcQuestMarker);
        }
      }
    }
    this.drawFormationTileMarkers(ctx, renderedEntities);
  }

  /** 绘制阵法地面标记，使阵法和玩家同格时仍然可见。 */
  private drawFormationTileMarkers(ctx: CanvasRenderingContext2D, renderedEntities: RenderedAnimEntity[]): void {
    for (const rendered of renderedEntities) {
      if (rendered.anim.kind !== 'formation') {
        continue;
      }
      const { sx, sy, cellSize } = rendered;
      const centerX = sx + cellSize / 2;
      const centerY = sy + cellSize / 2;
      const radius = Math.max(5, cellSize * 0.36);
      const markerColor = rendered.anim.formationRangeHighlightColor ?? rendered.anim.color;
      ctx.save();
      ctx.fillStyle = colorWithAlpha(markerColor, 0.18);
      ctx.strokeStyle = colorWithAlpha(markerColor, 0.9);
      ctx.lineWidth = Math.max(1.5, cellSize * 0.055);
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = colorWithAlpha(markerColor, 0.72);
      ctx.lineWidth = Math.max(1, cellSize * 0.035);
      ctx.beginPath();
      ctx.moveTo(centerX - radius * 0.66, centerY);
      ctx.lineTo(centerX + radius * 0.66, centerY);
      ctx.moveTo(centerX, centerY - radius * 0.66);
      ctx.lineTo(centerX, centerY + radius * 0.66);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** 绘制单格阵法范围表现。 */
  private drawFormationRangeVisual(
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    cellSize: number,
    visual: {
      highlightColor: string;
      boundary: boolean;
      boundaryChar?: string;
      boundaryColor: string;
    },
  ): void {
    ctx.fillStyle = colorWithAlpha(visual.highlightColor, visual.boundary ? 0.34 : 0.24);
    ctx.fillRect(sx + 1, sy + 1, cellSize - 2, cellSize - 2);
    ctx.strokeStyle = colorWithAlpha(visual.highlightColor, visual.boundary ? 0.92 : 0.72);
    ctx.lineWidth = visual.boundary ? 2.25 : 1.5;
    ctx.strokeRect(sx + 1.5, sy + 1.5, cellSize - 3, cellSize - 3);
    if (visual.boundary && visual.boundaryChar) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = buildCanvasFont('tileGlyph', cellSize * 0.42);
      this.drawOutlinedText(
        visual.boundaryChar,
        sx + cellSize / 2,
        sy + cellSize / 2,
        visual.boundaryColor,
        'rgba(5, 18, 26, 0.86)',
      );
    }
  }

  /** 根据当前可见阵法实体解析某格子的范围高亮表现。 */
  private resolveFormationRangeVisual(gx: number, gy: number, senseQiVisible: boolean): {
    highlightColor: string;
    boundary: boolean;
    boundaryChar?: string;
    boundaryColor: string;
  } | null {
    let rangeVisual: { highlightColor: string; boundary: boolean; boundaryChar?: string; boundaryColor: string } | null = null;
    for (const anim of this.entities.values()) {
      if (anim.kind !== 'formation' || !Number.isFinite(Number(anim.formationRadius))) {
        continue;
      }
      if (anim.formationActive === false) {
        continue;
      }
      if (isTileInsideFormationRange(anim, gx, gy)) {
        if (anim.formationBlocksBoundary === true && isTileOnFormationBoundary(anim, gx, gy)) {
          if (senseQiVisible || anim.formationBoundaryVisibleWithoutSenseQi === true) {
            return {
              highlightColor: anim.formationBoundaryRangeHighlightColor ?? anim.formationBoundaryColor ?? anim.formationRangeHighlightColor ?? anim.color,
              boundary: true,
              boundaryChar: anim.formationBoundaryChar,
              boundaryColor: anim.formationBoundaryColor ?? anim.color,
            };
          }
        }
        if (!senseQiVisible && anim.formationRangeVisibleWithoutSenseQi !== true) {
          continue;
        }
        rangeVisual = rangeVisual ?? {
          highlightColor: anim.formationRangeHighlightColor ?? anim.color,
          boundary: false,
          boundaryColor: anim.color,
        };
      }
    }
    return rangeVisual;
  }

  /** 绘制威胁关系箭头。 */
  private renderThreatTargetArrows(renderedEntities: RenderedAnimEntity[], localPlayerId?: string, localPlayerRendered?: RenderedAnimEntity): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.ctx || renderedEntities.length === 0) {
      return;
    }
    const ctx = this.ctx;
    const renderedById = new Map<string, RenderedAnimEntity>();
    for (const entry of renderedEntities) {
      renderedById.set(entry.anim.id, entry);
    }
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

  /** 绘制单条威胁箭头的曲线路径与箭头头部。 */
  private drawThreatTargetArrow(from: RenderedAnimEntity, to: RenderedAnimEntity, isSelfArrow: boolean): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.ctx) {
      return;
    }
    const ctx = this.ctx;
    const dx = to.centerX - from.centerX;
    const dy = to.centerY - from.centerY;
    const distance = Math.hypot(dx, dy);
    if (distance < Math.max(10, from.cellSize * 0.45)) {
      return;
    }

    const ux = dx / distance;
    const uy = dy / distance;
    const startPadding = from.cellSize * 0.34;
    const endPadding = to.cellSize * 0.34;
    const startX = from.centerX + ux * startPadding;
    const startY = from.centerY + uy * startPadding;
    const endX = to.centerX - ux * endPadding;
    const endY = to.centerY - uy * endPadding;
    const curvature = Math.max(from.cellSize * 0.32, Math.min(distance * 0.18, from.cellSize * 0.76));
    const controlX = (startX + endX) / 2;
    const controlY = Math.min(startY, endY) - curvature;
    const color = isSelfArrow ? SELF_THREAT_ARROW_COLOR : OTHER_THREAT_ARROW_COLOR;
    const glow = isSelfArrow ? SELF_THREAT_ARROW_GLOW : OTHER_THREAT_ARROW_GLOW;
    const baseWidth = Math.max(0.55, from.cellSize * 0.02);
    const glowWidth = baseWidth + Math.max(1.9, from.cellSize * 0.048);
    const tangentX = endX - this.getQuadraticPoint(startX, controlX, endX, 0.86);
    const tangentY = endY - this.getQuadraticPoint(startY, controlY, endY, 0.86);
    const tangentLength = Math.hypot(tangentX, tangentY);
    if (tangentLength < 0.001) {
      return;
    }
    const arrowUx = tangentX / tangentLength;
    const arrowUy = tangentY / tangentLength;
    const headLength = Math.max(7, from.cellSize * 0.22);
    const headWidth = Math.max(2.4, from.cellSize * 0.076);
    const baseX = endX - arrowUx * headLength;
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

  private formatRespawnCountdown(ticks: number | undefined): string {
    const totalSeconds = Math.max(0, Math.round(Number(ticks) || 0));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes <= 0) {
      return `${Math.max(1, seconds)}息`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /** 计算二次贝塞尔曲线上的点。 */
  private getQuadraticPoint(start: number, control: number, end: number, t: number): number {
    const invT = 1 - t;
    return invT * invT * start + 2 * invT * t * control + t * t * end;
  }  
  /**
 * drawEntityBadgeLabel：执行draw实体BadgeLabel相关逻辑。
 * @param label string 参数说明。
 * @param badge RenderEntity['badge'] 参数说明。
 * @param centerX number 参数说明。
 * @param baselineY number 参数说明。
 * @param cellSize number 参数说明。
 * @param labelColor string 参数说明。
 * @returns 无返回值，直接更新draw实体BadgeLabel相关状态。
 */


  private drawEntityBadgeLabel(
    label: string,
    badge: NonNullable<RenderEntity['badge']>,
    centerX: number,
    baselineY: number,
    cellSize: number,
    labelColor: string,
  ): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.ctx) {
      return;
    }
    const ctx = this.ctx;
    const badgePaddingX = Math.max(4, cellSize * 0.1);
    const badgeHeight = Math.max(12, cellSize * 0.28);
    const badgeRadius = Math.max(4, badgeHeight * 0.38);
    const badgeTextSize = Math.max(9, cellSize * 0.2);
    const badgeWidth = Math.max(16, badge.text.length * badgeTextSize + badgePaddingX * 2);
    const gap = Math.max(4, cellSize * 0.08);
    const badgeClassName = getEntityBadgeClassName(badge);
    const fill = badgeClassName?.includes('--boss') || badge.tone === 'demonic'
      ? 'rgba(120, 32, 24, 0.92)'
      : 'rgba(42, 54, 91, 0.92)';
    const stroke = badgeClassName?.includes('--boss')
      ? 'rgba(255, 188, 156, 0.86)'
      : badge.tone === 'demonic'
        ? 'rgba(255, 151, 151, 0.84)'
        : 'rgba(185, 211, 255, 0.82)';
    const textColor = '#fff6eb';

    ctx.save();
    const labelFont = buildCanvasFont('label', Math.max(10, cellSize * 0.3));
    ctx.font = labelFont;
    const labelWidth = this.textMeasureCache.measureWidth(ctx, labelFont, label);
    const totalWidth = badgeWidth + gap + labelWidth;
    const left = centerX - totalWidth / 2;
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
    ctx.fillText(badge.text, left + badgeWidth / 2, badgeY + badgeHeight / 2 + 0.5);
    ctx.restore();

    this.drawOutlinedText(
      label,
      left + badgeWidth + gap + labelWidth / 2,
      baselineY,
      labelColor,
      'rgba(15,12,10,0.9)',
    );
  }

  /** 绘制实体头顶的 Buff 与 Debuff 图标行。 */
  private drawBuffRows(sx: number, sy: number, cellSize: number, buffs?: VisibleBuffState[]) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.ctx || !buffs || buffs.length === 0) return;
    const visible = buffs.filter((buff) => buff.visibility === 'public');
    if (visible.length === 0) return;
    const buffsByCategory = visible.filter((buff) => buff.category === 'buff');
    const debuffsByCategory = visible.filter((buff) => buff.category === 'debuff');
    const badgeSize = Math.max(8, Math.floor(cellSize * 0.24));
    const gap = 2;
    this.drawBuffRow(sx, sy + 1, cellSize, buffsByCategory, badgeSize, gap, '#7fd69a');
    this.drawBuffRow(sx, sy + badgeSize + 4, cellSize, debuffsByCategory, badgeSize, gap, '#ff9072');
  }  
  /**
 * drawBuffRow：执行drawBuffRow相关逻辑。
 * @param sx number 参数说明。
 * @param y number Y 坐标。
 * @param cellSize number 参数说明。
 * @param buffs VisibleBuffState[] 参数说明。
 * @param badgeSize number 参数说明。
 * @param gap number 参数说明。
 * @param fallbackColor string 参数说明。
 * @returns 无返回值，直接更新drawBuffRow相关状态。
 */


  private drawBuffRow(
    sx: number,
    y: number,
    cellSize: number,
    buffs: VisibleBuffState[],
    badgeSize: number,
    gap: number,
    fallbackColor: string,
  ) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.ctx || buffs.length === 0) return;
    const ctx = this.ctx;
    const visibleLimit = 4;
    const displayed = buffs.slice(0, visibleLimit);
    const overflow = buffs.length - displayed.length;
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
    const totalWidth = badges.length * badgeSize + Math.max(0, badges.length - 1) * gap;
    let x = sx + Math.round((cellSize - totalWidth) / 2);
    for (const buff of badges) {
      const accent = buff.color ?? fallbackColor;
      const centerX = x + badgeSize / 2;
      const centerY = y + badgeSize / 2;
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

  /** 绘制 NPC 头顶的任务状态标记。 */
  private drawNpcQuestMarker(sx: number, sy: number, cellSize: number, marker: NpcQuestMarker) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.ctx) return;
    const ctx = this.ctx;
    const centerX = sx + cellSize + Math.max(8, cellSize * 0.18);
    const centerY = sy + Math.max(9, cellSize * 0.18);
    const size = Math.max(8, cellSize * 0.18);
    const symbol = marker.state === 'ready' ? '?' : marker.state === 'active' ? '…' : '!';
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

  /** 根据任务线与状态挑选 NPC 标记配色。 */
  private getNpcQuestMarkerPalette(marker: NpcQuestMarker): {  
  /**
 * fill：fill相关字段。
 */

    fill: string;    
    /**
 * stroke：stroke相关字段。
 */

    stroke: string;    
    /**
 * text：text名称或显示文本。
 */

    text: string;    
    /**
 * shape：shape相关字段。
 */

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
    variant: 'damage' | 'action' = 'damage',
    actionStyle?: FloatingActionTextStyle,
    durationMs?: number,
  ) {
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
  /**
 * addWarningZone：处理WarningZone并更新相关状态。
 * @param cells Array<{ x: number; y: number }> 参数说明。
 * @param color 参数说明。
 * @param durationMs 参数说明。
 * @param baseColor string 参数说明。
 * @param originX number 参数说明。
 * @param originY number 参数说明。
 * @returns 无返回值，直接更新WarningZone相关状态。
 */


  addWarningZone(
    cells: Array<{    
    /**
 * x：x相关字段。
 */
 x: number;    
 /**
 * y：y相关字段。
 */
 y: number }>,
    color = '#ff2a2a',
    durationMs = DEFAULT_WARNING_ZONE_DURATION_MS,
    baseColor?: string,
    originX?: number,
    originY?: number,
  ) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (cells.length === 0) {
      return;
    }
    const now = performance.now();
    this.pruneExpiredWarningZones(now);
    const origin = this.resolveWarningZoneOrigin(cells, originX, originY);
    const rawDistances = cells.map((cell) => Math.max(Math.abs(cell.x - origin.x), Math.abs(cell.y - origin.y)));
    const minExpandDistance = rawDistances.reduce(
      (minDistance, distance) => Math.min(minDistance, distance),
      rawDistances[0] ?? 0,
    );
    const zoneCells = cells.map((cell, index) => ({
      x: cell.x,
      y: cell.y,
      expandDistance: Math.max(0, rawDistances[index] - minExpandDistance),
    }));
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.ctx || this.floatingTexts.length === 0) return;
    const ctx = this.ctx;
    const now = performance.now();
    const sw = ctx.canvas.width;
    const sh = ctx.canvas.height;
    const cellSize = getCellSize();
    const screenOffsetX = sw / 2 - camera.x + camera.offsetX;
    const screenOffsetY = sh / 2 - camera.y + camera.offsetY;

    this.pruneExpiredFloatingTexts(now);
    const groups = new Map<string, FloatingText[]>();
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
      const progress = Math.min(1, (now - entry.createdAt) / entry.duration);
      const actionStyle = entry.variant === 'action' ? (entry.actionStyle ?? 'default') : undefined;
      const motionProgress = entry.variant === 'action' && actionStyle === 'default' ? progress * progress : progress;
      const rise = entry.variant === 'action'
        ? actionStyle === 'divine'
          ? 0
          : cellSize * (0.08 + motionProgress * 0.46)
        : cellSize * (0.2 + progress * 0.8);
      const alpha = entry.variant === 'action' && actionStyle === 'divine'
        ? 1 - Math.max(0, (progress - 0.86) / 0.14)
        : 1 - progress;
      const sx = entry.x * cellSize + screenOffsetX;
      const sy = entry.y * cellSize + screenOffsetY;
      if (sx + cellSize < 0 || sx > sw || sy + cellSize < 0 || sy > sh) continue;
      const burstMeta = burstMetaById.get(entry.id) ?? { index: 0, total: 1 };
      const burst = this.getFloatingTextBurstOffset(burstMeta.index, burstMeta.total, cellSize);

      ctx.save();
      ctx.globalAlpha = alpha;
      if (entry.variant === 'action') {
        if (actionStyle === 'divine') {
          const fontSize = Math.max(30, cellSize * 0.84);
          const lineHeight = fontSize * 1.12;
          const chars = [...entry.text.trim()].filter((char) => char.trim().length > 0);
          const stackHeight = chars.length > 0 ? lineHeight * Math.max(0, chars.length - 1) + fontSize : fontSize;
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
          const fontSize = Math.max(24, cellSize * 0.82);
          const lineHeight = fontSize * 1.02;
          const chars = [...entry.text.trim()].filter((char) => char.trim().length > 0);
          const stackHeight = chars.length > 0 ? lineHeight * Math.max(0, chars.length - 1) + fontSize : fontSize;
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
          const fontSize = Math.max(10, cellSize * 0.28);
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.ctx || this.attackTrails.length === 0) return;
    const ctx = this.ctx;
    const now = performance.now();
    const sw = ctx.canvas.width;
    const sh = ctx.canvas.height;
    const cellSize = getCellSize();
    const screenOffsetX = sw / 2 - camera.x + camera.offsetX;
    const screenOffsetY = sh / 2 - camera.y + camera.offsetY;

    this.pruneExpiredAttackTrails(now);

    for (const entry of this.attackTrails) {
      const progress = Math.min(1, (now - entry.createdAt) / entry.duration);
      const alpha = 1 - progress * 0.85;
      const fromSx = entry.fromX * cellSize + cellSize / 2 + screenOffsetX;
      const fromSy = entry.fromY * cellSize + cellSize / 2 + screenOffsetY;
      const toSx = entry.toX * cellSize + cellSize / 2 + screenOffsetX;
      const toSy = entry.toY * cellSize + cellSize / 2 + screenOffsetY;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = entry.color;
      ctx.fillStyle = entry.color;
      ctx.lineWidth = Math.max(2, cellSize * 0.09);
      ctx.beginPath();
      ctx.moveTo(fromSx, fromSy);
      ctx.lineTo(toSx, toSy);
      ctx.stroke();

      const angle = Math.atan2(toSy - fromSy, toSx - fromSx);
      const head = Math.max(8, cellSize * 0.22);
      ctx.beginPath();
      ctx.moveTo(toSx, toSy);
      ctx.lineTo(toSx - head * Math.cos(angle - Math.PI / 6), toSy - head * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(toSx - head * Math.cos(angle + Math.PI / 6), toSy - head * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  /** 绘制会逐步扩散并淡出的警示区域。 */
  renderWarningZones(camera: Camera) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.ctx || this.warningZones.length === 0) return;
    const ctx = this.ctx;
    const now = performance.now();
    const sw = ctx.canvas.width;
    const sh = ctx.canvas.height;
    const cellSize = getCellSize();
    const screenOffsetX = sw / 2 - camera.x + camera.offsetX;
    const screenOffsetY = sh / 2 - camera.y + camera.offsetY;

    this.pruneExpiredWarningZones(now);

    for (const zone of this.warningZones) {
      const progress = Math.min(1, (now - zone.createdAt) / zone.duration);
      const fadeProgress = progress <= 0.72 ? 0 : Math.min(1, (progress - 0.72) / 0.28);
      const pulse = 0.96 + Math.sin(progress * Math.PI * 3) * 0.04;
      const baseFillAlpha = Math.max(0.02, (1 - fadeProgress * 0.9) * 0.1);
      const baseStrokeAlpha = Math.max(0.08, (1 - fadeProgress * 0.84) * 0.32);
      const expandFillAlpha = Math.max(0.045, (1 - fadeProgress * 0.9) * 0.18 * pulse);
      const expandStrokeAlpha = Math.max(0.16, (1 - fadeProgress * 0.82) * 0.72);
      const revealDistance = progress * (zone.maxExpandDistance + 1);
      const settledDistance = Math.floor(revealDistance);
      const frontierAlpha = Math.max(0, Math.min(1, revealDistance - settledDistance));

      for (const cell of zone.cells) {
        const sx = cell.x * cellSize + screenOffsetX;
        const sy = cell.y * cellSize + screenOffsetY;
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

  /** 释放渲染器持有的所有缓存与临时状态。 */
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

  /** 为一组浮动文字计算爆散位移。 */
  private getFloatingTextBurstOffset(index: number, count: number, cellSize: number): FloatingTextBurstOffset {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  /**
 * drawChantText：执行drawChantText相关逻辑。
 * @param text string 参数说明。
 * @param progress number 参数说明。
 * @param x number X 坐标。
 * @param y number Y 坐标。
 * @param fill string 参数说明。
 * @param stroke string 参数说明。
 * @param lineHeight number 参数说明。
 * @param fontSize number 参数说明。
 * @returns 无返回值，直接更新drawChantText相关状态。
 */


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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.ctx) {
      return;
    }
    const ctx = this.ctx;
    const chars = [...text.trim()].filter((char) => char.trim().length > 0);
    if (chars.length === 0) {
      return;
    }
    const segment = 1 / chars.length;
    const slamWindow = Math.max(segment * 0.45, 0.06);

    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3.2, fontSize * 0.12);
    ctx.strokeStyle = stroke;
    ctx.fillStyle = fill;

    chars.forEach((char, index) => {
      const start = segment * index;
      const localProgress = Math.max(0, Math.min(1, (progress - start) / slamWindow));
      if (localProgress <= 0) {
        return;
      }
      const fallPhase = Math.min(1, localProgress / 0.72);
      const settlePhase = Math.max(0, (localProgress - 0.72) / 0.28);
      const acceleratedFall = Math.pow(fallPhase, 2.6);
      const impactDrop = (1 - acceleratedFall) * fontSize * 0.92;
      const settle = easeOutCubic(settlePhase);
      let impactScaleX = 1 - Math.min(1, fallPhase * 1.2) * 0.08;
      let impactScaleY = 1 + Math.min(1, fallPhase * 1.2) * 0.16;
      if (settlePhase > 0) {
        impactScaleX = 1.22 - settle * 0.22;
        impactScaleY = 0.76 + settle * 0.24;
      }
      const charAlpha = Math.min(1, localProgress * 1.8);
      const offsetDirection = index % 2 === 0 ? -1 : 1;
      const staggerOffsetX = offsetDirection * fontSize * 0.12;
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
  /**
 * resolveWarningZoneOrigin：规范化或转换WarningZoneOrigin。
 * @param cells Array<{ x: number; y: number }> 参数说明。
 * @param originX number 参数说明。
 * @param originY number 参数说明。
 * @returns 返回WarningZoneOrigin。
 */


  private resolveWarningZoneOrigin(
    cells: Array<{    
    /**
 * x：x相关字段。
 */
 x: number;    
 /**
 * y：y相关字段。
 */
 y: number }>,
    originX?: number,
    originY?: number,
  ): {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (Number.isFinite(originX) && Number.isFinite(originY)) {
      return {
        x: Math.round(originX ?? 0),
        y: Math.round(originY ?? 0),
      };
    }
    let minX = cells[0].x;
    let maxX = cells[0].x;
    let minY = cells[0].y;
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

  /** 清理过期的浮动文字。 */
  private pruneExpiredFloatingTexts(now: number): void {
    this.floatingTexts = this.floatingTexts.filter((entry) => now - entry.createdAt < entry.duration);
  }

  /** 清理过期的攻击拖尾。 */
  private pruneExpiredAttackTrails(now: number): void {
    this.attackTrails = this.attackTrails.filter((entry) => now - entry.createdAt < entry.duration);
  }

  /** 清理过期的警示区域。 */
  private pruneExpiredWarningZones(now: number): void {
    this.warningZones = this.warningZones.filter((entry) => now - entry.createdAt < entry.duration);
  }

  /** 控制浮动文字缓存上限。 */
  private trimFloatingTexts(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const overflow = this.floatingTexts.length - MAX_FLOATING_TEXTS;
    if (overflow > 0) {
      this.floatingTexts.splice(0, overflow);
    }
  }

  /** 控制攻击拖尾缓存上限。 */
  private trimAttackTrails(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const overflow = this.attackTrails.length - MAX_ATTACK_TRAILS;
    if (overflow > 0) {
      this.attackTrails.splice(0, overflow);
    }
  }

  /** 控制警示区域缓存上限。 */
  private trimWarningZones(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const overflow = this.warningZones.length - MAX_WARNING_ZONES;
    if (overflow > 0) {
      this.warningZones.splice(0, overflow);
    }
  }  
  /**
 * renderPathArrows：执行路径Arrow相关逻辑。
 * @param camera Camera 参数说明。
 * @param visibleTiles ReadonlySet<string> 参数说明。
 * @param playerX number 参数说明。
 * @param playerY number 参数说明。
 * @param displayRangeX number 参数说明。
 * @param displayRangeY number 参数说明。
 * @returns 无返回值，直接更新路径Arrow相关状态。
 */


  private renderPathArrows(
    camera: Camera,
    visibleTiles: ReadonlySet<string>,
    playerX: number,
    playerY: number,
    displayRangeX: number,
    displayRangeY: number,
  ) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.ctx) return;
    const ctx = this.ctx;
    const sw = ctx.canvas.width;
    const sh = ctx.canvas.height;
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
  /**
 * renderPathArrowLayer：执行路径Arrow层相关逻辑。
 * @param ctx CanvasRenderingContext2D 上下文信息。
 * @param camera Camera 参数说明。
 * @param sw number 参数说明。
 * @param sh number 参数说明。
 * @param visibleTiles ReadonlySet<string> 参数说明。
 * @param playerX number 参数说明。
 * @param playerY number 参数说明。
 * @param displayRangeX number 参数说明。
 * @param displayRangeY number 参数说明。
 * @param cells { x: number; y: number }[] 参数说明。
 * @param indexByKey Map<string, number> 参数说明。
 * @param targetKey string | null 参数说明。
 * @param alpha number 参数说明。
 * @returns 无返回值，直接更新路径Arrow层相关状态。
 */


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
    cells: {    
    /**
 * x：x相关字段。
 */
 x: number;    
 /**
 * y：y相关字段。
 */
 y: number }[],
    indexByKey: Map<string, number>,
    targetKey: string | null,
    alpha: number,
  ) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (cells.length === 0 || alpha <= 0.001) {
      return;
    }

    const cellSize = getCellSize();
    const screenOffsetX = sw / 2 - camera.x + camera.offsetX;
    const screenOffsetY = sh / 2 - camera.y + camera.offsetY;
    const route = [{ x: playerX, y: playerY }, ...cells];
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';

    for (let index = 0; index < route.length - 1; index++) {
      const from = route[index];
      const to = route[index + 1];
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

      const fromSx = from.x * cellSize + cellSize / 2 + screenOffsetX;
      const fromSy = from.y * cellSize + cellSize / 2 + screenOffsetY;
      const toSx = to.x * cellSize + cellSize / 2 + screenOffsetX;
      const toSy = to.y * cellSize + cellSize / 2 + screenOffsetY;
      const dx = toSx - fromSx;
      const dy = toSy - fromSy;
      const distance = Math.hypot(dx, dy);
      if (distance < 1) {
        continue;
      }

      const ux = dx / distance;
      const uy = dy / distance;
      const startPadding = index === 0 ? cellSize * 0.2 : cellSize * 0.1;
      const endPadding = cellSize * 0.14;
      const startX = fromSx + ux * startPadding;
      const startY = fromSy + uy * startPadding;
      const tipX = toSx - ux * endPadding;
      const tipY = toSy - uy * endPadding;
      const isFinalSegment = toKey === targetKey;
      const arrowColor = isFinalSegment ? PATH_TARGET_STROKE_COLOR : PATH_ARROW_COLOR;
      const headLength = Math.max(8, cellSize * 0.2);
      const headWidth = Math.max(5, cellSize * 0.12);
      const shaftEndX = tipX - ux * headLength;
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

      const normalX = -uy;
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
  /**
 * drawPathCellHighlight：执行draw路径CellHighlight相关逻辑。
 * @param ctx CanvasRenderingContext2D 上下文信息。
 * @param sx number 参数说明。
 * @param sy number 参数说明。
 * @param cellSize number 参数说明。
 * @param isTargetCell boolean 参数说明。
 * @param alpha number 参数说明。
 * @returns 无返回值，直接更新draw路径CellHighlight相关状态。
 */


  private drawPathCellHighlight(
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    cellSize: number,
    isTargetCell: boolean,
    alpha: number,
  ) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** 计算正在淡出的路径高亮透明度。 */
  private getFadingPathAlpha(now: number): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.fadingPath) {
      return 0;
    }
    const progress = (now - this.fadingPath.startedAt) / this.fadingPath.durationMs;
    if (progress >= 1) {
      this.fadingPath = null;
      return 0;
    }
    return Math.max(0, 1 - progress);
  }

  /** 比较两条路径格子序列是否完全一致。 */
  private arePathCellsEqual(a: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number }[], b: {  
 /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number }[]): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  /**
 * isPathCellRenderable：判断路径CellRenderable是否满足条件。
 * @param x number X 坐标。
 * @param y number Y 坐标。
 * @param visibleTiles ReadonlySet<string> 参数说明。
 * @param playerX number 参数说明。
 * @param playerY number 参数说明。
 * @param displayRangeX number 参数说明。
 * @param displayRangeY number 参数说明。
 * @returns 返回是否满足路径CellRenderable条件。
 */


  private isPathCellRenderable(
    x: number,
    y: number,
    visibleTiles: ReadonlySet<string>,
    playerX: number,
    playerY: number,
    displayRangeX: number,
    displayRangeY: number,
  ): boolean {
    const key = `${x},${y}`;
    return visibleTiles.has(key) || (Math.abs(x - playerX) <= displayRangeX && Math.abs(y - playerY) <= displayRangeY);
  }

  /** 绘制昼夜与气氛叠加层。 */
  private renderTimeOverlay(time: GameTimeState | null): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.ctx || !time) {
      return;
    }
    const ctx = this.ctx;
    const atmosphere = this.resolveTimeAtmosphere(time);
    ctx.save();
    if (atmosphere.overlay[3] > 0.001) {
      ctx.fillStyle = this.toOverlayColor(atmosphere.overlay);
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    if (atmosphere.sky[3] > 0.001) {
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
      const radius = Math.max(ctx.canvas.width, ctx.canvas.height) * 0.9;
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

  /** 根据时间状态解析目标氛围参数。 */
  private resolveTimeAtmosphere(time: GameTimeState): TimeAtmosphereState {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    this.timeAtmosphere.vignetteAlpha = this.lerpNumber(
      this.timeAtmosphere.vignetteAlpha,
      target.vignetteAlpha,
      TIME_FILTER_LERP,
    );
    return this.timeAtmosphere;
  }

  /** 把十六进制颜色与透明度拆成 RGBA 向量。 */
  private buildRgbaVector(hex: string, alpha: number): [number, number, number, number] {
    const value = hex.trim().replace('#', '');
    const normalized = value.length === 3
      ? value.split('').map((char) => char + char).join('')
      : value.padEnd(6, '0').slice(0, 6);
    const red = Number.parseInt(normalized.slice(0, 2), 16) || 0;
    const green = Number.parseInt(normalized.slice(2, 4), 16) || 0;
    const blue = Number.parseInt(normalized.slice(4, 6), 16) || 0;
    const safeAlpha = Math.max(0, Math.min(1, alpha));
    return [red, green, blue, safeAlpha];
  }  
  /**
 * lerpColorVector：执行lerpColorVector相关逻辑。
 * @param current [number, number, number, number] 参数说明。
 * @param target [number, number, number, number] 目标对象。
 * @param factor number 参数说明。
 * @returns 返回lerpColorVector。
 */


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

  /** 对单个数值做线性插值。 */
  private lerpNumber(current: number, target: number, factor: number): number {
    return current + (target - current) * factor;
  }

  /** 把 RGBA 向量转成 CSS 颜色字符串。 */
  private toOverlayColor(color: [number, number, number, number]): string {
    const [red, green, blue, alpha] = color;
    return `rgba(${red.toFixed(2)}, ${green.toFixed(2)}, ${blue.toFixed(2)}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
  }

  /** 绘制地面物品堆的 3x3 图标缩略块。 */
  private drawGroundPileIndicator(sx: number, sy: number, cellSize: number, pile: GroundItemPileView) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.ctx) {
      return;
    }
    const ctx = this.ctx;
    const slotSize = Math.max(8, Math.floor(cellSize / GROUND_ITEM_GRID_SIZE));
    const gridSize = slotSize * GROUND_ITEM_GRID_SIZE;
    const offsetX = sx + Math.max(0, cellSize - gridSize);
    const offsetY = sy + Math.max(0, cellSize - gridSize);
    const iconCount = Math.min(pile.items.length, GROUND_ITEM_ICON_POSITIONS.length);
    const hiddenCount = Math.max(0, pile.items.length - GROUND_ITEM_ICON_POSITIONS.length);
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
      const iconY = offsetY + position.row * slotSize;
      this.drawGroundItemEntryIcon(iconX, iconY, slotSize, entries[index]);
    }
  }

  /** 绘制单个地面物品的图标与数量角标。 */
  private drawGroundItemEntryIcon(x: number, y: number, slotSize: number, entry: GroundItemEntryView): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.ctx) {
      return;
    }
    const ctx = this.ctx;
    const iconInset = Math.max(0.75, slotSize * 0.05);
    const iconSize = Math.max(6, slotSize - iconInset * 2);
    const iconX = x + iconInset;
    const iconY = y + iconInset;
    const typePalette = GROUND_ITEM_TYPE_PALETTES[entry.type] ?? GROUND_ITEM_TYPE_PALETTES.material;
    const gradePalette = resolveGroundItemGradePalette(entry.grade);
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
  /**
 * drawGroundItemBasePlate：执行draw地面道具BasePlate相关逻辑。
 * @param ctx CanvasRenderingContext2D 上下文信息。
 * @param type ItemType 参数说明。
 * @param x number X 坐标。
 * @param y number Y 坐标。
 * @param size number 参数说明。
 * @param accentColor string 参数说明。
 * @returns 无返回值，直接更新drawGround道具BasePlate相关状态。
 */


  private drawGroundItemBasePlate(
    ctx: CanvasRenderingContext2D,
    type: ItemType,
    x: number,
    y: number,
    size: number,
    accentColor: string,
  ): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  /**
 * drawGroundItemCountBadge：执行draw地面道具数量Badge相关逻辑。
 * @param x number X 坐标。
 * @param y number Y 坐标。
 * @param slotSize number 参数说明。
 * @param count number 数量。
 * @param palette GroundItemGradePalette 参数说明。
 * @returns 无返回值，直接更新drawGround道具数量Badge相关状态。
 */


  private drawGroundItemCountBadge(
    x: number,
    y: number,
    slotSize: number,
    count: number,
    palette: GroundItemGradePalette,
  ): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.ctx || count <= 1) {
      return;
    }
    const ctx = this.ctx;
    const countText = formatDisplayInteger(Math.max(0, count));
    const badgeFont = Math.max(5, slotSize * 0.26);
    ctx.save();
    const badgeCanvasFont = buildCanvasFont('badge', badgeFont);
    ctx.font = badgeCanvasFont;
    const paddingX = Math.max(2, slotSize * 0.1);
    const badgeHeight = Math.max(7, slotSize * 0.36);
    const badgeWidth = Math.max(
      badgeHeight,
      this.textMeasureCache.measureWidth(ctx, badgeCanvasFont, countText) + paddingX * 2,
    );
    const badgeX = x + slotSize - badgeWidth + Math.max(0, slotSize * 0.04);
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

  /** 根据标签长度估算地面物品文字字号。 */
  private resolveGroundItemLabelFontSize(slotSize: number, label: string): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const textLength = [...label].length;
    if (textLength >= 2) {
      return Math.max(5.25, slotSize * 0.28);
    }
    return Math.max(6, slotSize * 0.4);
  }

  /** 绘制带描边的普通文本。 */
  private drawOutlinedText(text: string, x: number, y: number, fill: string, stroke: string) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.ctx) return;
    this.ctx.lineJoin = 'round';
    this.ctx.lineWidth = 3;
    this.ctx.strokeStyle = stroke;
    this.ctx.strokeText(text, x, y);
    this.ctx.fillStyle = fill;
    this.ctx.fillText(text, x, y);
  }

  /** 绘制带描边的竖排文本。 */
  private drawOutlinedVerticalText(text: string, x: number, y: number, fill: string, stroke: string, lineHeight: number) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.ctx) return;
    const ctx = this.ctx;
    const chars = [...text.trim()].filter((char) => char.trim().length > 0);
    if (chars.length === 0) {
      return;
    }
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = stroke;
    ctx.fillStyle = fill;
    chars.forEach((char, index) => {
      const drawY = y + lineHeight * index;
      ctx.strokeText(char, x, drawY);
      ctx.fillText(char, x, drawY);
    });
  }

}

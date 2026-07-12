/** Pixi 主世界渲染器复用的纯视觉规则、签名与颜色投影。 */
import type { TextStyleFontWeight, TextStyleOptions } from 'pixi.js';
import {
  DEFAULT_AURA_LEVEL_BASE_VALUE,
  resolveSenseQiOverlaySignal,
  SENSE_QI_OVERLAY_STYLE,
  type FengShuiGrade,
  type GridPoint,
  type GroundItemEntryView,
  type GroundItemPileView,
  type Tile,
} from '@mud/shared';
import { UI_TEXT_SETTINGS } from '../../constants/ui/text';
import { getEntityBadgeClassName } from '../../monster-presentation';
import { t as translateUi } from '../../ui/i18n';
import type { MapSceneSnapshot, ObservedMapEntity } from '../types';
import type { AnimEntity, EntityNameplateBadge } from './pixi-render-state';

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - clamp01(t), 3);
}

export function easeInOutCubic(t: number): number {
  const value = clamp01(t);
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

export function parseColor(input: string | undefined, fallback = 0xffffff): number {
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

export function parseAlpha(input: string | undefined, fallback = 1): number {
  if (!input) return fallback;
  const match = input.match(/rgba?\(([^)]+)\)/i);
  if (!match) return fallback;
  const parts = match[1].split(',').map((entry) => entry.trim());
  return parts.length >= 4 ? clamp01(Number.parseFloat(parts[3])) : fallback;
}

export function colorWithAlpha(color: string | undefined, alpha: number): { color: number; alpha: number } {
  return { color: parseColor(color, 0x3b82f6), alpha: clamp01(alpha) };
}

export function buildGridPointSignature(cells: readonly GridPoint[] | null | undefined): string {
  if (!cells || cells.length === 0) return '0';
  let signature = String(cells.length);
  for (const cell of cells) signature += `|${cell.x},${cell.y}`;
  return signature;
}

export function buildTargetingOverlaySignature(state: MapSceneSnapshot['overlays']['targeting']): string {
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

export function buildSenseQiHoverSignature(state: MapSceneSnapshot['overlays']['senseQi']): string {
  if (!state || typeof state.hoverX !== 'number' || typeof state.hoverY !== 'number') return 'sense-hover:null';
  return `${state.hoverX},${state.hoverY}`;
}

export function resolveEntityFallbackLabel(kind: string | null | undefined): string {
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

export function resolveEntityLabelColor(kind: string | null | undefined): string {
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

export function resolveEntityHpBarColor(kind: string | null | undefined, hostile: boolean | undefined): string {
  if (hostile === true || kind === 'monster') return '#d15252';
  switch (kind) {
    case 'npc': return '#58a8ff';
    case 'container': return '#c18b46';
    case 'building': return '#7dd3fc';
    case 'formation': return '#9cc8ff';
    default: return '#63c46b';
  }
}

export function resolveEntityBadgePalette(badge: EntityNameplateBadge): {
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
  return { fill, stroke, text: '#fff6eb' };
}

export function resolveNameplateBadges(
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

export function buildNameplateBadgeSignature(badges: readonly EntityNameplateBadge[]): string {
  return badges.map((badge) => `${badge.text}:${badge.tone ?? ''}`).join(',');
}

export function resolveGroundItemLabel(entry: GroundItemEntryView): string {
  const explicit = [...(entry.groundLabel?.trim() ?? '')].filter((char) => char.trim().length > 0).join('');
  if (explicit) return explicit.slice(0, 2);
  const chars = [...entry.name.trim()].filter((char) => char.trim().length > 0);
  const hanChar = chars.find((char) => /[\u3400-\u9fff\uf900-\ufaff]/u.test(char));
  if (hanChar) return hanChar;
  const wordChar = chars.find((char) => /[A-Za-z0-9]/.test(char));
  return wordChar ? wordChar.toUpperCase() : chars[0]?.slice(0, 1) ?? '?';
}

export function textStyle(preset: keyof typeof UI_TEXT_SETTINGS.canvasPresets, fontSize: number, fill: string, stroke = 'rgba(15,12,10,0.9)', strokeWidth = 3): TextStyleOptions {
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

export function isTileInsideFormationRange(anim: AnimEntity, gx: number, gy: number): boolean {
  const radius = Math.max(1, Math.trunc(Number(anim.formationRadius) || 0));
  const dx = gx - anim.gridX;
  const dy = gy - anim.gridY;
  if (Math.abs(dx) > radius || Math.abs(dy) > radius) return false;
  if (anim.formationRangeShape === 'circle') return (dx * dx) + (dy * dy) <= radius * radius;
  if (anim.formationRangeShape === 'checkerboard') return ((gx + gy) % 2) === 0;
  return true;
}

export function isTileOnFormationBoundary(anim: AnimEntity, gx: number, gy: number): boolean {
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

export function buildFormationRangeSignature(entities: Iterable<AnimEntity>): string {
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

export function buildFengShuiOverlaySignature(cells: readonly { x: number; y: number; score: number; grade: FengShuiGrade; revision: number }[] | undefined): string {
  if (!cells || cells.length === 0) return '0';
  let signature = String(cells.length);
  for (const cell of cells) signature += `|${cell.x},${cell.y},${Math.trunc(cell.score)},${cell.grade},${cell.revision}`;
  return signature;
}

export function buildBuildPreviewSignature(cells: readonly { x: number; y: number; ok: boolean; warning?: boolean }[] | undefined): string {
  if (!cells || cells.length === 0) return '0';
  let signature = String(cells.length);
  for (const cell of cells) signature += `|${cell.x},${cell.y},${cell.ok ? 1 : 0},${cell.warning === true ? 1 : 0}`;
  return signature;
}

export function buildGroundPileSignature(piles: ReadonlyMap<string, GroundItemPileView>): string {
  let signature = String(piles.size);
  for (const pile of piles.values()) {
    signature += `|${pile.sourceId}:${pile.x},${pile.y}:${pile.items.length}`;
    for (const item of pile.items) {
      signature += `,${item.itemKey}:${item.itemId}:${item.type}:${item.count}:${item.groundLabel ?? ''}:${item.grade ?? ''}:${item.enhanceLevel ?? ''}:${item.name}`;
    }
  }
  return signature;
}

export function getFengShuiOverlayFill(cell: { score: number }): { color: number; alpha: number } {
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

export function getFengShuiOverlayStroke(cell: { score: number }): { color: number; alpha: number } {
  const score = Math.max(-1000, Math.min(1000, Math.trunc(Number(cell.score) || 0)));
  const strength = Math.min(1, Math.abs(score) / 1000);
  if (score === 0) return { color: 0xcbd5e1, alpha: 0.34 };
  return score > 0
    ? { color: 0x4ade80, alpha: 0.42 + strength * 0.50 }
    : { color: 0xf87171, alpha: 0.42 + strength * 0.50 };
}

export function getSenseQiOverlayStyle(tile: Tile | null | undefined, levelBaseValue = DEFAULT_AURA_LEVEL_BASE_VALUE): { color: number; alpha: number } {
  const { family, value } = resolveSenseQiOverlaySignal(tile?.aura, tile?.resources, levelBaseValue);
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

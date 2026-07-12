/** Canvas 观察视图的战斗特效状态、布局、绘制与限额边界。 */
import { getCellSize } from '../display';
import { buildCanvasFont } from '../constants/ui/text';
import type { Camera } from './camera';
import type { FloatingActionTextStyle } from './types';
import {
  FloatingTextBurstLayout,
  normalizeTimedEffectDuration,
  pruneExpiredTimedEffectsInPlace,
  resolveFloatingTextDuration,
  resolveWarningZoneOrigin,
} from './combat-effect-layout';

interface FloatingTextEffect {
  x: number;
  y: number;
  text: string;
  color: string;
  variant: 'damage' | 'action';
  actionStyle?: FloatingActionTextStyle;
  burstOffsetX: number;
  burstOffsetY: number;
  createdAt: number;
  duration: number;
}

interface AttackTrailEffect {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
  createdAt: number;
  duration: number;
}

interface WarningZoneEffect {
  cells: Array<{ x: number; y: number; expandDistance: number }>;
  color: string;
  baseColor: string;
  maxExpandDistance: number;
  createdAt: number;
  duration: number;
}

const MAX_FLOATING_TEXTS = 256;
const MAX_ATTACK_TRAILS = 192;
const ATTACK_TRAIL_REACH_MS = 110;
const ATTACK_TRAIL_HOLD_MS = 200;
const ATTACK_TRAIL_FADE_MS = 170;
const ATTACK_TRAIL_DURATION_MS = ATTACK_TRAIL_REACH_MS + ATTACK_TRAIL_HOLD_MS + ATTACK_TRAIL_FADE_MS;
const MAX_WARNING_ZONES = 64;
export const DEFAULT_CANVAS_WARNING_ZONE_DURATION_MS = 1240;

export class CanvasCombatEffectRuntime {
  private readonly floatingTextBurstLayout = new FloatingTextBurstLayout<FloatingTextEffect>();
  private readonly floatingTexts: FloatingTextEffect[] = [];
  private readonly attackTrails: AttackTrailEffect[] = [];
  private readonly warningZones: WarningZoneEffect[] = [];

  addFloatingText(
    x: number,
    y: number,
    text: string,
    color = '#ffd27a',
    variant: 'damage' | 'action' = 'damage',
    actionStyle?: FloatingActionTextStyle,
    durationMs?: number,
  ): void {
    const now = performance.now();
    pruneExpiredTimedEffectsInPlace(this.floatingTexts, now);
    this.floatingTexts.push({
      x,
      y,
      text,
      color,
      variant,
      actionStyle,
      burstOffsetX: 0,
      burstOffsetY: 0,
      createdAt: now,
      duration: resolveFloatingTextDuration(variant, actionStyle, durationMs),
    });
    trimFromFront(this.floatingTexts, MAX_FLOATING_TEXTS);
  }

  addAttackTrail(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    color = '#ffd27a',
    now = performance.now(),
  ): void {
    pruneExpiredTimedEffectsInPlace(this.attackTrails, now);
    this.attackTrails.push({
      fromX,
      fromY,
      toX,
      toY,
      color,
      createdAt: now,
      duration: ATTACK_TRAIL_DURATION_MS,
    });
    trimFromFront(this.attackTrails, MAX_ATTACK_TRAILS);
  }

  addWarningZone(
    cells: readonly { x: number; y: number }[],
    color = '#ff2a2a',
    durationMs = DEFAULT_CANVAS_WARNING_ZONE_DURATION_MS,
    baseColor?: string,
    originX?: number,
    originY?: number,
  ): void {
    if (cells.length === 0) return;
    const now = performance.now();
    pruneExpiredTimedEffectsInPlace(this.warningZones, now);
    const origin = resolveWarningZoneOrigin(cells, originX, originY);
    let minExpandDistance = Number.POSITIVE_INFINITY;
    for (const cell of cells) {
      minExpandDistance = Math.min(
        minExpandDistance,
        Math.max(Math.abs(cell.x - origin.x), Math.abs(cell.y - origin.y)),
      );
    }
    const zoneCells: WarningZoneEffect['cells'] = [];
    let maxExpandDistance = 0;
    for (const cell of cells) {
      const expandDistance = Math.max(
        0,
        Math.max(Math.abs(cell.x - origin.x), Math.abs(cell.y - origin.y)) - minExpandDistance,
      );
      zoneCells.push({ x: cell.x, y: cell.y, expandDistance });
      maxExpandDistance = Math.max(maxExpandDistance, expandDistance);
    }
    this.warningZones.push({
      cells: zoneCells,
      color,
      baseColor: baseColor ?? color,
      maxExpandDistance,
      createdAt: now,
      duration: normalizeTimedEffectDuration(durationMs, DEFAULT_CANVAS_WARNING_ZONE_DURATION_MS),
    });
    trimFromFront(this.warningZones, MAX_WARNING_ZONES);
  }

  renderFloatingTexts(ctx: CanvasRenderingContext2D, camera: Camera): void {
    if (this.floatingTexts.length === 0) return;
    const now = performance.now();
    const cellSize = getCellSize();
    const screenOffsetX = ctx.canvas.width / 2 - camera.x + camera.offsetX;
    const screenOffsetY = ctx.canvas.height / 2 - camera.y + camera.offsetY;
    pruneExpiredTimedEffectsInPlace(this.floatingTexts, now);
    this.floatingTextBurstLayout.apply(this.floatingTexts, cellSize);
    for (const entry of this.floatingTexts) {
      const progress = Math.min(1, (now - entry.createdAt) / entry.duration);
      const actionStyle = entry.variant === 'action' ? (entry.actionStyle ?? 'default') : undefined;
      const motionProgress = actionStyle === 'default' ? progress * progress : progress;
      const rise = entry.variant === 'action'
        ? actionStyle === 'divine'
          ? 0
          : cellSize * (0.08 + motionProgress * 0.46)
        : cellSize * (0.2 + progress * 0.8);
      const sx = entry.x * cellSize + screenOffsetX;
      const sy = entry.y * cellSize + screenOffsetY;
      if (sx + cellSize < 0 || sx > ctx.canvas.width || sy + cellSize < 0 || sy > ctx.canvas.height) continue;
      ctx.save();
      ctx.globalAlpha = actionStyle === 'divine'
        ? 1 - Math.max(0, (progress - 0.86) / 0.14)
        : 1 - progress;
      if (entry.variant === 'damage') {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.font = buildCanvasFont('floatingDamage', Math.max(14, cellSize * 0.45));
        drawOutlinedText(
          ctx,
          entry.text,
          sx + cellSize / 2 + entry.burstOffsetX,
          sy - rise - entry.burstOffsetY,
          entry.color,
          'rgba(15,12,10,0.95)',
        );
        ctx.restore();
        continue;
      }
      if (actionStyle === 'divine') {
        const fontSize = Math.max(30, cellSize * 0.84);
        const lineHeight = fontSize * 1.12;
        const stackHeight = resolveVerticalTextHeight(entry.text, lineHeight, fontSize);
        ctx.translate(
          sx - cellSize * 0.06 + entry.burstOffsetX,
          sy + cellSize - stackHeight - entry.burstOffsetY,
        );
        ctx.scale(0.98 + motionProgress * 0.08, 0.98 + motionProgress * 0.08);
        ctx.font = buildCanvasFont('floatingAction', fontSize);
        drawOutlinedVerticalText(ctx, entry.text, entry.color, 'rgba(15,12,10,0.9)', lineHeight);
      } else if (actionStyle === 'chant') {
        const fontSize = Math.max(24, cellSize * 0.82);
        const lineHeight = fontSize * 1.02;
        const stackHeight = resolveVerticalTextHeight(entry.text, lineHeight, fontSize);
        ctx.globalAlpha = progress < 0.95 ? 1 : 1 - Math.max(0, (progress - 0.95) / 0.05);
        ctx.translate(
          sx - cellSize * 0.12 + entry.burstOffsetX,
          sy - cellSize * 0.48 - entry.burstOffsetY - stackHeight,
        );
        ctx.font = buildCanvasFont('floatingAction', fontSize);
        ctx.shadowColor = 'rgba(120, 18, 12, 0.55)';
        ctx.shadowBlur = Math.max(6, cellSize * 0.16);
        drawChantText(ctx, entry.text, progress, entry.color, 'rgba(24,8,6,0.98)', lineHeight, fontSize);
      } else {
        const fontSize = Math.max(10, cellSize * 0.28);
        const scale = 0.98 + motionProgress * 0.08;
        ctx.translate(
          sx - cellSize * 0.06 + entry.burstOffsetX,
          sy - cellSize * 0.08 - rise - entry.burstOffsetY,
        );
        ctx.scale(scale, scale);
        ctx.font = buildCanvasFont('floatingAction', fontSize);
        drawOutlinedVerticalText(ctx, entry.text, entry.color, 'rgba(15,12,10,0.9)', fontSize * 1.12);
      }
      ctx.restore();
    }
  }

  renderAttackTrails(ctx: CanvasRenderingContext2D, camera: Camera): void {
    if (this.attackTrails.length === 0) return;
    const now = performance.now();
    const cellSize = getCellSize();
    const screenOffsetX = ctx.canvas.width / 2 - camera.x + camera.offsetX;
    const screenOffsetY = ctx.canvas.height / 2 - camera.y + camera.offsetY;
    pruneExpiredTimedEffectsInPlace(this.attackTrails, now);
    for (const entry of this.attackTrails) {
      const elapsed = now - entry.createdAt;
      const reachProgress = easeOutCubic(Math.min(1, elapsed / ATTACK_TRAIL_REACH_MS));
      const fadeProgress = Math.min(1, Math.max(0, (elapsed - ATTACK_TRAIL_REACH_MS - ATTACK_TRAIL_HOLD_MS) / ATTACK_TRAIL_FADE_MS));
      const fromX = entry.fromX * cellSize + cellSize / 2 + screenOffsetX;
      const fromY = entry.fromY * cellSize + cellSize / 2 + screenOffsetY;
      const dx = (entry.toX - entry.fromX) * cellSize;
      const dy = (entry.toY - entry.fromY) * cellSize;
      const distance = Math.hypot(dx, dy);
      if (distance < 1) continue;
      const tipX = fromX + dx * reachProgress;
      const tipY = fromY + dy * reachProgress;
      const tailProgress = Math.max(0, reachProgress - 0.72);
      const tailX = fromX + dx * tailProgress;
      const tailY = fromY + dy * tailProgress;
      ctx.save();
      ctx.globalAlpha = 1 - fadeProgress * 0.85;
      ctx.strokeStyle = entry.color;
      ctx.fillStyle = entry.color;
      ctx.lineWidth = Math.max(1.25, cellSize * 0.045);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      const angle = Math.atan2(dy, dx);
      const head = Math.min(distance * reachProgress * 0.5, Math.max(6, cellSize * 0.18));
      if (head >= 2) {
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - head * Math.cos(angle - Math.PI / 6), tipY - head * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(tipX - head * Math.cos(angle + Math.PI / 6), tipY - head * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  renderWarningZones(ctx: CanvasRenderingContext2D, camera: Camera): void {
    if (this.warningZones.length === 0) return;
    const now = performance.now();
    const cellSize = getCellSize();
    const screenOffsetX = ctx.canvas.width / 2 - camera.x + camera.offsetX;
    const screenOffsetY = ctx.canvas.height / 2 - camera.y + camera.offsetY;
    pruneExpiredTimedEffectsInPlace(this.warningZones, now);
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
        const x = cell.x * cellSize + screenOffsetX;
        const y = cell.y * cellSize + screenOffsetY;
        if (x + cellSize < 0 || x > ctx.canvas.width || y + cellSize < 0 || y > ctx.canvas.height) continue;
        ctx.save();
        ctx.globalAlpha = baseFillAlpha;
        ctx.fillStyle = zone.baseColor;
        ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
        ctx.globalAlpha = baseStrokeAlpha;
        ctx.strokeStyle = zone.baseColor;
        ctx.lineWidth = Math.max(1.25, cellSize * 0.08);
        ctx.strokeRect(x + 1.5, y + 1.5, cellSize - 3, cellSize - 3);
        const overlayAlpha = cell.expandDistance < settledDistance
          ? 1
          : cell.expandDistance === settledDistance
            ? frontierAlpha
            : 0;
        if (overlayAlpha > 0.01) {
          ctx.globalAlpha = expandFillAlpha * overlayAlpha;
          ctx.fillStyle = zone.color;
          ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
          ctx.globalAlpha = expandStrokeAlpha * overlayAlpha;
          ctx.strokeStyle = zone.color;
          ctx.lineWidth = Math.max(1.35, cellSize * 0.09);
          ctx.strokeRect(x + 1.5, y + 1.5, cellSize - 3, cellSize - 3);
        }
        ctx.restore();
      }
    }
  }

  reset(): void {
    this.floatingTexts.length = 0;
    this.attackTrails.length = 0;
    this.warningZones.length = 0;
    this.floatingTextBurstLayout.reset();
  }
}

function trimFromFront<T>(entries: T[], limit: number): void {
  const overflow = entries.length - limit;
  if (overflow <= 0) return;
  entries.copyWithin(0, overflow);
  entries.length -= overflow;
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

function resolveVerticalTextHeight(text: string, lineHeight: number, fontSize: number): number {
  const count = [...text.trim()].filter((char) => char.trim().length > 0).length;
  return count > 0 ? lineHeight * Math.max(0, count - 1) + fontSize : fontSize;
}

function drawOutlinedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fill: string,
  stroke: string,
): void {
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function drawOutlinedVerticalText(
  ctx: CanvasRenderingContext2D,
  text: string,
  fill: string,
  stroke: string,
  lineHeight: number,
): void {
  const chars = [...text.trim()].filter((char) => char.trim().length > 0);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  for (let index = 0; index < chars.length; index += 1) {
    ctx.strokeText(chars[index], 0, lineHeight * index);
    ctx.fillText(chars[index], 0, lineHeight * index);
  }
}

function drawChantText(
  ctx: CanvasRenderingContext2D,
  text: string,
  progress: number,
  fill: string,
  stroke: string,
  lineHeight: number,
  fontSize: number,
): void {
  const chars = [...text.trim()].filter((char) => char.trim().length > 0);
  if (chars.length === 0) return;
  const segment = 1 / chars.length;
  const slamWindow = Math.max(segment * 0.45, 0.06);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3.2, fontSize * 0.12);
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  for (let index = 0; index < chars.length; index += 1) {
    const localProgress = Math.max(0, Math.min(1, (progress - segment * index) / slamWindow));
    if (localProgress <= 0) continue;
    const fallPhase = Math.min(1, localProgress / 0.72);
    const settlePhase = Math.max(0, (localProgress - 0.72) / 0.28);
    const impactDrop = (1 - Math.pow(fallPhase, 2.6)) * fontSize * 0.92;
    const settle = easeOutCubic(settlePhase);
    let scaleX = 1 - Math.min(1, fallPhase * 1.2) * 0.08;
    let scaleY = 1 + Math.min(1, fallPhase * 1.2) * 0.16;
    if (settlePhase > 0) {
      scaleX = 1.22 - settle * 0.22;
      scaleY = 0.76 + settle * 0.24;
    }
    ctx.save();
    ctx.globalAlpha *= Math.min(1, localProgress * 1.8);
    ctx.translate((index % 2 === 0 ? -1 : 1) * fontSize * 0.12, lineHeight * index - impactDrop);
    ctx.scale(scaleX, scaleY);
    ctx.strokeText(chars[index], 0, 0);
    ctx.fillText(chars[index], 0, 0);
    ctx.restore();
  }
}

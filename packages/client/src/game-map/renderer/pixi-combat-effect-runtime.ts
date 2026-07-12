/** Pixi 战斗表现对象的创建、逐帧更新、限额和销毁边界。 */
import { Container, Graphics, Text } from 'pixi.js';
import type { CombatEffect, GridPoint } from '@mud/shared';
import { getCellSize } from '../../display';
import { isLocalDivineSkillName } from '../../content/local-templates';
import {
  buildVerticalFloatingText,
  FloatingTextBurstLayout,
  normalizeTimedEffectDuration,
  resolveFloatingTextDuration,
  resolveWarningZoneOrigin,
} from '../../renderer/combat-effect-layout';
import {
  clamp01,
  easeOutCubic,
  parseAlpha,
  parseColor,
  textStyle,
} from './pixi-render-primitives';
import type {
  AttackTrailEffect,
  FloatingActionTextStyle,
  FloatingTextEffect,
  WarningZoneEffect,
} from './pixi-render-state';

const MAX_FLOATING_TEXTS = 256;
const MAX_ATTACK_TRAILS = 192;
const ATTACK_TRAIL_REACH_MS = 110;
const ATTACK_TRAIL_HOLD_MS = 200;
const ATTACK_TRAIL_FADE_MS = 170;
const ATTACK_TRAIL_DURATION_MS = ATTACK_TRAIL_REACH_MS + ATTACK_TRAIL_HOLD_MS + ATTACK_TRAIL_FADE_MS;
const MAX_WARNING_ZONES = 64;
const DEFAULT_WARNING_ZONE_DURATION_MS = 1240;

export class PixiCombatEffectRuntime {
  private readonly floatingTextBurstLayout = new FloatingTextBurstLayout<FloatingTextEffect>();
  private readonly floatingTexts: FloatingTextEffect[] = [];
  private readonly attackTrails: AttackTrailEffect[] = [];
  private readonly warningZones: WarningZoneEffect[] = [];

  constructor(private readonly effectLayer: Container) {}

  enqueue(effect: CombatEffect): void {
    if (effect.type === 'attack') {
      this.addAttackTrail(effect.fromX, effect.fromY, effect.toX, effect.toY, effect.color);
      return;
    }
    if (effect.type === 'warning_zone') {
      this.addWarningZone(effect.cells, effect.color, effect.durationMs, effect.baseColor, effect.originX, effect.originY);
      return;
    }
    const actionStyle = this.resolveActionTextStyle(effect);
    this.addFloatingText(
      effect.x,
      effect.y,
      effect.text,
      effect.color,
      effect.variant,
      actionStyle,
      effect.durationMs,
    );
  }

  update(): void {
    if (this.floatingTexts.length === 0 && this.attackTrails.length === 0 && this.warningZones.length === 0) return;
    const now = performance.now();
    const cellSize = getCellSize();
    this.updateFloatingTexts(now, cellSize);
    this.updateAttackTrails(now, cellSize);
    this.updateWarningZones(now, cellSize);
  }

  reset(): void {
    for (const entry of this.floatingTexts) this.destroyFloatingTextEffect(entry);
    for (const entry of this.attackTrails) this.destroyAttackTrailEffect(entry);
    for (const zone of this.warningZones) this.destroyWarningZoneEffect(zone);
    this.floatingTexts.length = 0;
    this.attackTrails.length = 0;
    this.warningZones.length = 0;
    this.floatingTextBurstLayout.reset();
  }

  get floatingTextCount(): number {
    return this.floatingTexts.length;
  }

  get attackTrailCount(): number {
    return this.attackTrails.length;
  }

  get warningZoneCount(): number {
    return this.warningZones.length;
  }

  private addFloatingText(
    x: number,
    y: number,
    content: string,
    color = '#ffd27a',
    variant: 'damage' | 'action' = 'damage',
    actionStyle?: FloatingActionTextStyle,
    durationMs?: number,
  ): void {
    const cellSize = getCellSize();
    const normalizedActionStyle = variant === 'action' ? (actionStyle ?? 'default') : undefined;
    const fontSize = variant !== 'action'
      ? Math.max(14, cellSize * 0.45)
      : normalizedActionStyle === 'divine'
        ? Math.max(30, cellSize * 0.84)
        : normalizedActionStyle === 'chant'
          ? Math.max(24, cellSize * 0.82)
          : Math.max(10, cellSize * 0.28);
    const style = textStyle(
      variant === 'action' ? 'floatingAction' : 'floatingDamage',
      fontSize,
      color,
      normalizedActionStyle === 'chant' ? 'rgba(24,8,6,0.98)' : 'rgba(15,12,10,0.95)',
      normalizedActionStyle === 'chant' ? Math.max(3.2, fontSize * 0.12) : 3,
    );
    if (variant === 'action') {
      style.lineHeight = fontSize * (normalizedActionStyle === 'chant' ? 1.02 : 1.12);
    }
    const label = new Text({
      text: variant === 'action' ? buildVerticalFloatingText(content) : content,
      style,
      anchor: variant === 'action' ? { x: 0, y: 0 } : { x: 0.5, y: 1 },
    });
    this.effectLayer.addChild(label);
    this.floatingTexts.push({
      x,
      y,
      text: label,
      variant,
      actionStyle: normalizedActionStyle,
      burstOffsetX: 0,
      burstOffsetY: 0,
      createdAt: performance.now(),
      duration: resolveFloatingTextDuration(variant, normalizedActionStyle, durationMs),
    });
    this.trimFloatingTextEffects();
  }

  private addAttackTrail(fromX: number, fromY: number, toX: number, toY: number, color = '#ffd27a'): void {
    const graphics = new Graphics();
    this.effectLayer.addChild(graphics);
    this.attackTrails.push({
      fromX,
      fromY,
      toX,
      toY,
      color: parseColor(color),
      colorAlpha: parseAlpha(color, 1),
      graphics,
      createdAt: performance.now(),
      duration: ATTACK_TRAIL_DURATION_MS,
    });
    this.trimAttackTrailEffects();
  }

  private addWarningZone(
    cells: GridPoint[],
    color = '#ff2a2a',
    durationMs = DEFAULT_WARNING_ZONE_DURATION_MS,
    baseColor?: string,
    originX?: number,
    originY?: number,
  ): void {
    if (cells.length === 0) return;
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
    const graphics = new Graphics();
    const normalizedBaseColor = baseColor ?? color;
    this.effectLayer.addChild(graphics);
    this.warningZones.push({
      cells: zoneCells,
      color: parseColor(color),
      colorAlpha: parseAlpha(color, 1),
      baseColor: parseColor(normalizedBaseColor),
      baseColorAlpha: parseAlpha(normalizedBaseColor, 1),
      createdAt: performance.now(),
      duration: normalizeTimedEffectDuration(durationMs, DEFAULT_WARNING_ZONE_DURATION_MS),
      maxExpandDistance,
      graphics,
    });
    this.trimWarningZoneEffects();
  }

  private updateFloatingTexts(now: number, cellSize: number): void {
    let writeIndex = 0;
    for (let readIndex = 0; readIndex < this.floatingTexts.length; readIndex += 1) {
      const entry = this.floatingTexts[readIndex];
      if (now - entry.createdAt >= entry.duration) {
        this.destroyFloatingTextEffect(entry);
        continue;
      }
      this.floatingTexts[writeIndex] = entry;
      writeIndex += 1;
    }
    this.floatingTexts.length = writeIndex;
    this.floatingTextBurstLayout.apply(this.floatingTexts, cellSize);
    for (const entry of this.floatingTexts) {
      const progress = clamp01((now - entry.createdAt) / entry.duration);
      const actionStyle = entry.variant === 'action' ? (entry.actionStyle ?? 'default') : undefined;
      const motionProgress = actionStyle === 'default' ? progress * progress : progress;
      if (entry.variant === 'damage') {
        const rise = cellSize * (0.2 + progress * 0.8);
        entry.text.alpha = 1 - progress;
        entry.text.scale.set(1);
        entry.text.position.set(
          entry.x * cellSize + cellSize / 2 + entry.burstOffsetX,
          entry.y * cellSize - rise - entry.burstOffsetY,
        );
        continue;
      }
      const scale = 0.98 + motionProgress * 0.08;
      entry.text.scale.set(actionStyle === 'chant' ? 1 : scale);
      if (actionStyle === 'divine') {
        entry.text.alpha = 1 - Math.max(0, (progress - 0.86) / 0.14);
        entry.text.position.set(
          entry.x * cellSize - cellSize * 0.06 + entry.burstOffsetX,
          entry.y * cellSize + cellSize - entry.text.height - entry.burstOffsetY,
        );
        continue;
      }
      if (actionStyle === 'chant') {
        entry.text.alpha = progress < 0.95 ? 1 : 1 - Math.max(0, (progress - 0.95) / 0.05);
        entry.text.position.set(
          entry.x * cellSize - cellSize * 0.12 + entry.burstOffsetX,
          entry.y * cellSize - cellSize * 0.48 - entry.text.height - entry.burstOffsetY,
        );
        continue;
      }
      const rise = cellSize * (0.08 + motionProgress * 0.46);
      entry.text.alpha = 1 - progress;
      entry.text.position.set(
        entry.x * cellSize - cellSize * 0.06 + entry.burstOffsetX,
        entry.y * cellSize - cellSize * 0.08 - rise - entry.burstOffsetY,
      );
    }
  }

  private updateAttackTrails(now: number, cellSize: number): void {
    let writeIndex = 0;
    for (let readIndex = 0; readIndex < this.attackTrails.length; readIndex += 1) {
      const entry = this.attackTrails[readIndex];
      const elapsed = now - entry.createdAt;
      if (elapsed >= entry.duration) {
        this.destroyAttackTrailEffect(entry);
        continue;
      }
      this.drawAttackTrailEffect(entry, cellSize, elapsed);
      this.attackTrails[writeIndex] = entry;
      writeIndex += 1;
    }
    this.attackTrails.length = writeIndex;
  }

  private updateWarningZones(now: number, cellSize: number): void {
    let writeIndex = 0;
    for (let readIndex = 0; readIndex < this.warningZones.length; readIndex += 1) {
      const zone = this.warningZones[readIndex];
      const progress = (now - zone.createdAt) / zone.duration;
      if (progress >= 1) {
        this.destroyWarningZoneEffect(zone);
        continue;
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
        zone.graphics.rect(sx + 1, sy + 1, cellSize - 2, cellSize - 2).fill({ color: zone.baseColor, alpha: zone.baseColorAlpha * 0.08 * revealEase * lifetimeFade });
        zone.graphics.rect(sx + 1, sy + 1, cellSize - 2, cellSize - 2).fill({ color: zone.color, alpha: zone.colorAlpha * (0.10 + edgePulse * 0.12) * revealEase * lifetimeFade });
        zone.graphics.rect(sx + 1.5, sy + 1.5, cellSize - 3, cellSize - 3).stroke({ color: zone.color, alpha: zone.colorAlpha * (0.42 + edgePulse * 0.34) * revealEase * lifetimeFade, width: Math.max(1.35, cellSize * (0.06 + edgePulse * 0.04)) });
      }
      this.warningZones[writeIndex] = zone;
      writeIndex += 1;
    }
    this.warningZones.length = writeIndex;
  }

  private trimFloatingTextEffects(): void {
    const overflow = this.floatingTexts.length - MAX_FLOATING_TEXTS;
    if (overflow <= 0) return;
    for (let index = 0; index < overflow; index += 1) this.destroyFloatingTextEffect(this.floatingTexts[index]);
    this.floatingTexts.copyWithin(0, overflow);
    this.floatingTexts.length -= overflow;
  }

  private trimAttackTrailEffects(): void {
    const overflow = this.attackTrails.length - MAX_ATTACK_TRAILS;
    if (overflow <= 0) return;
    for (let index = 0; index < overflow; index += 1) this.destroyAttackTrailEffect(this.attackTrails[index]);
    this.attackTrails.copyWithin(0, overflow);
    this.attackTrails.length -= overflow;
  }

  private trimWarningZoneEffects(): void {
    const overflow = this.warningZones.length - MAX_WARNING_ZONES;
    if (overflow <= 0) return;
    for (let index = 0; index < overflow; index += 1) this.destroyWarningZoneEffect(this.warningZones[index]);
    this.warningZones.copyWithin(0, overflow);
    this.warningZones.length -= overflow;
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
    const fadeProgress = Math.min(1, Math.max(0, (elapsed - ATTACK_TRAIL_REACH_MS - ATTACK_TRAIL_HOLD_MS) / ATTACK_TRAIL_FADE_MS));
    const alpha = entry.colorAlpha * (1 - fadeProgress * 0.85);
    entry.graphics
      .moveTo(tailX, tailY)
      .lineTo(tipX, tipY)
      .stroke({ color: entry.color, alpha, width: Math.max(1.25, cellSize * 0.045) });
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
      .fill({ color: entry.color, alpha });
  }

  private resolveActionTextStyle(effect: Extract<CombatEffect, { type: 'float' }>): FloatingActionTextStyle | undefined {
    if (effect.variant !== 'action') return undefined;
    if (effect.actionStyle) return effect.actionStyle;
    return isLocalDivineSkillName(effect.text) ? 'divine' : 'default';
  }
}

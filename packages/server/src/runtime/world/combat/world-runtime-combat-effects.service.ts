import { Injectable } from '@nestjs/common';
import { formatDisplayInteger, type CombatEffect } from '@mud/shared';

export interface ActionLabelEffectOptions {
  actionStyle?: 'default' | 'divine' | 'chant';
  durationMs?: number;
}

@Injectable()
export class WorldRuntimeCombatEffectsService {
  readonly latestCombatEffectsByInstanceId = new Map<string, CombatEffect[]>();

  getCombatEffects(instanceId: string): CombatEffect[] {
    const effects = this.latestCombatEffectsByInstanceId.get(instanceId);
    return effects ? effects.map((entry) => ({ ...entry })) : [];
  }

  resetFrameEffects(): void {
    this.latestCombatEffectsByInstanceId.clear();
  }

  resetAll(): void {
    this.latestCombatEffectsByInstanceId.clear();
  }

  pushCombatEffect(instanceId: string, effect: CombatEffect): void {
    const list = this.latestCombatEffectsByInstanceId.get(instanceId);
    if (list) {
      list.push(effect);
      return;
    }
    this.latestCombatEffectsByInstanceId.set(instanceId, [effect]);
  }

  pushActionLabelEffect(
    instanceId: string,
    x: number,
    y: number,
    text: string,
    options: ActionLabelEffectOptions | undefined = undefined,
  ): void {
    this.pushCombatEffect(instanceId, {
      type: 'float',
      x,
      y,
      text,
      color: '#efe3c2',
      variant: 'action',
      actionStyle: options?.actionStyle,
      durationMs: options?.durationMs,
    });
  }

  pushDamageFloatEffect(instanceId: string, x: number, y: number, damage: number, color?: string): void {
    this.pushCombatEffect(instanceId, {
      type: 'float',
      x,
      y,
      text: `-${formatDisplayInteger(Math.max(0, Math.round(damage)))}`,
      color,
      variant: 'damage',
    });
  }

  pushCombatTextFloatEffect(
    instanceId: string,
    x: number,
    y: number,
    text: string,
    color?: string,
    durationMs?: number,
  ): void {
    const normalizedText = typeof text === 'string' ? text.trim() : '';
    if (!normalizedText) {
      return;
    }
    this.pushCombatEffect(instanceId, {
      type: 'float',
      x,
      y,
      text: normalizedText,
      color,
      variant: 'action',
      durationMs,
    });
  }

  pushAttackEffect(instanceId: string, fromX: number, fromY: number, toX: number, toY: number, color?: string): void {
    this.pushCombatEffect(instanceId, {
      type: 'attack',
      fromX,
      fromY,
      toX,
      toY,
      color,
    });
  }
}

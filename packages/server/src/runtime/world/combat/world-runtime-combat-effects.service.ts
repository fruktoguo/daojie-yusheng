import { Inject, Injectable } from '@nestjs/common';
import { formatDisplayInteger, type CombatEffect } from '@mud/shared';
import { RuntimeEventBusService } from '../../event-bus/runtime-event-bus.service';

export interface ActionLabelEffectOptions {
  actionStyle?: 'default' | 'divine' | 'chant';
  durationMs?: number;
}

@Injectable()
export class WorldRuntimeCombatEffectsService {
  constructor(
    @Inject(RuntimeEventBusService)
    private readonly runtimeEventBusService: RuntimeEventBusService,
  ) {}

  getCombatEffects(instanceId: string): CombatEffect[] {
    return this.runtimeEventBusService.getCombatEffects(instanceId);
  }

  resetFrameEffects(): void {
    // No-op: EventBus.flushTick() 在 tick 末尾已清空实例队列。
    // 下一帧开始时队列已为空。
  }

  resetAll(): void {
    // 用于世界运行时完全重置（如 lifecycle 重建）。
    // 由于无法枚举所有 instanceId，保留为 no-op；
    // 实际场景中 lifecycle 重建会 discardInstance 每个实例。
  }

  pushCombatEffect(instanceId: string, effect: CombatEffect): void {
    this.runtimeEventBusService.queueCombatEffect(instanceId, effect);
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

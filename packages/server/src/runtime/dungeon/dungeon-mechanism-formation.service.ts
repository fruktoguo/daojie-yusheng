import { Injectable } from '@nestjs/common';
import type { DungeonMechanismFormationConfig } from '@mud/shared';
import { WorldRuntimeService } from '../world/world-runtime.service';

/** 副本/任务/活动共用的机制阵法编排边界；效果计算仍由普通阵法服务负责。 */
@Injectable()
export class DungeonMechanismFormationService {
  constructor(private readonly world: WorldRuntimeService) {}

  create(input: {
    instanceId: string;
    runId: string;
    controllerId: string;
    roomId: string;
    config: DungeonMechanismFormationConfig;
    x: number;
    y: number;
    bossMaxHp: number;
    radius?: number;
  }): string | null {
    const instance = this.world.getInstanceRuntime(input.instanceId) as any;
    if (!instance) return null;
    const formation = this.world.worldRuntimeFormationService.restoreFormationEntry(input.instanceId, {
      id: `formation:dungeon:${input.runId}:room:${input.roomId}`,
      formationId: input.config.formationId,
      lifecycle: 'deployed',
      controlMode: 'controller_only',
      arrayEyeMode: 'none',
      ownerPlayerId: '',
      x: Math.trunc(input.x),
      y: Math.trunc(input.y),
      eyeX: Math.trunc(input.x),
      eyeY: Math.trunc(input.y),
      spiritStoneCount: Math.max(1, Math.trunc(input.config.spiritStoneBudget ?? 1)),
      allocation: {
        radius: Math.max(1, Math.trunc(input.radius ?? Math.max(1, Number(instance.template?.width) || 1, Number(instance.template?.height) || 1))),
        durationHours: 24,
        effectValue: Math.max(1, Math.trunc(Number(input.config.effectValue) || 1)),
      },
      remainingQiBudget: Math.max(1, Math.ceil(input.config.qiBudget ?? (input.bossMaxHp * (input.config.powerMultiplierByBossMaxHp ?? 100)))),
      remainingSpiritStoneBudget: Math.max(1, Math.trunc(input.config.spiritStoneBudget ?? 1)),
      active: true,
      source: 'dungeon_controller',
      controllerId: input.controllerId,
    });
    if (!formation) return null;
    this.world.worldRuntimeFormationService.getFormationList(input.instanceId).push(formation);
    return formation.id;
  }

  disable(instanceId: string, formationId: string): boolean {
    const formation = this.world.worldRuntimeFormationService.getFormationList(instanceId).find((entry: any) => entry.id === formationId);
    if (!formation) return false;
    formation.active = false;
    return true;
  }

  destroy(instanceId: string, formationId: string): boolean {
    return this.world.worldRuntimeFormationService.removeFormationFromInstance(instanceId, formationId, this.world as any, { deferPersistence: true }) === true;
  }
}

/** 通用别名：任务、活动和世界事件可复用同一机制阵法边界。 */
export { DungeonMechanismFormationService as MechanismFormationService };

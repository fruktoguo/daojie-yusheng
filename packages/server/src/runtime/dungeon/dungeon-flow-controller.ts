import type { DungeonDefinition, DungeonRunState } from '@mud/shared';

export interface DungeonFlowControllerContext {
  complete(run: DungeonRunState, reason: string): void;
  advanceRoom?(run: DungeonRunState, roomId: string): void;
  spawnWave?(run: DungeonRunState, waveIndex: number): void;
  countAliveHostiles?(run: DungeonRunState): number;
  now(): number;
}

export interface DungeonFlowController {
  readonly id: string;
  onRunCreated?(run: DungeonRunState, definition: DungeonDefinition, context: DungeonFlowControllerContext): void;
  onPlayerEnter?(run: DungeonRunState, definition: DungeonDefinition, playerId: string, context: DungeonFlowControllerContext): void;
  onPlayerLeave?(run: DungeonRunState, definition: DungeonDefinition, playerId: string, context: DungeonFlowControllerContext): void;
  onTick?(run: DungeonRunState, definition: DungeonDefinition, context: DungeonFlowControllerContext): void;
  onMonsterDefeated?(run: DungeonRunState, definition: DungeonDefinition, monsterId: string, context: DungeonFlowControllerContext): void;
  /** 与设计文档保持同义入口；运行时会优先调用 onEntityDeath。 */
  onEntityDeath?(run: DungeonRunState, definition: DungeonDefinition, entityId: string, entityKind: string, context: DungeonFlowControllerContext): void;
  onRoomEvent?(run: DungeonRunState, definition: DungeonDefinition, event: string, context: DungeonFlowControllerContext): void;
  onFormationDestroyed?(run: DungeonRunState, definition: DungeonDefinition, formationId: string, context: DungeonFlowControllerContext): void;
  onAbort?(run: DungeonRunState, definition: DungeonDefinition, reason: string, context: DungeonFlowControllerContext): void;
}

export class SuppressDemonDungeonFlowController implements DungeonFlowController {
  readonly id = 'suppress_demon';

  onEntityDeath(run: DungeonRunState, definition: DungeonDefinition, entityId: string, entityKind: string, context: DungeonFlowControllerContext): void {
    if (entityKind === 'monster') this.onMonsterDefeated(run, definition, entityId, context);
  }

  onMonsterDefeated(run: DungeonRunState, definition: DungeonDefinition, monsterId: string, context: DungeonFlowControllerContext): void {
    const room = definition.rooms?.find((entry) => entry.roomId === run.currentRoomId);
    if (room?.bossId !== monsterId && room?.clearCondition !== 'boss_defeated') return;
    if (room.nextRoomId && context.advanceRoom) context.advanceRoom(run, room.nextRoomId);
    else context.complete(run, 'boss_defeated');
  }

  onFormationDestroyed(run: DungeonRunState, definition: DungeonDefinition, formationId: string, context: DungeonFlowControllerContext): void {
    const room = definition.rooms?.find((entry) => entry.roomId === run.currentRoomId);
    if (room?.mechanismFormation && formationId) {
      if (room.nextRoomId && context.advanceRoom) context.advanceRoom(run, room.nextRoomId);
      else context.complete(run, 'formation_destroyed');
    }
  }
}

export class DefenseDungeonFlowController implements DungeonFlowController {
  readonly id = 'defense';
  private readonly nextWaveAtByRunId = new Map<string, number>();
  private readonly spawnedWaveByRunId = new Map<string, number>();

  onEntityDeath(run: DungeonRunState, definition: DungeonDefinition, entityId: string, entityKind: string, context: DungeonFlowControllerContext): void {
    if (entityKind === 'monster') {
      // 防守流程由 onTick 根据存活数推进，实体死亡无需额外动作。
      void run; void definition; void entityId; void context;
    }
  }

  onRunCreated(run: DungeonRunState, definition: DungeonDefinition, context: DungeonFlowControllerContext): void {
    run.currentWaveIndex = 0;
    this.nextWaveAtByRunId.set(run.runId, context.now());
    this.spawnedWaveByRunId.delete(run.runId);
    if (!definition.waves?.length) context.complete(run, 'no_waves_configured');
  }

  onTick(run: DungeonRunState, definition: DungeonDefinition, context: DungeonFlowControllerContext): void {
    const waves = definition.waves ?? [];
    if (waves.length === 0) return;
    const index = Math.max(0, Math.trunc(run.currentWaveIndex ?? 0));
    const wave = waves.find((entry) => entry.waveIndex === index) ?? waves[index];
    if (!wave) {
      context.complete(run, 'all_waves_cleared');
      return;
    }
    const spawned = this.spawnedWaveByRunId.get(run.runId);
    if (spawned === index) {
      if ((context.countAliveHostiles?.(run) ?? 0) > 0) return;
      this.spawnedWaveByRunId.delete(run.runId);
      run.currentWaveIndex = index + 1;
      this.nextWaveAtByRunId.set(run.runId, context.now() + Math.max(0, Number(wave.intervalSeconds ?? 0)) * 1000);
      return;
    }
    if (context.now() < (this.nextWaveAtByRunId.get(run.runId) ?? 0)) return;
    context.spawnWave?.(run, wave.waveIndex);
    this.spawnedWaveByRunId.set(run.runId, wave.waveIndex);
  }

  onAbort(run: DungeonRunState): void {
    this.nextWaveAtByRunId.delete(run.runId);
    this.spawnedWaveByRunId.delete(run.runId);
  }
}

export class ExpeditionDungeonFlowController implements DungeonFlowController {
  readonly id = 'expedition';

  onTick(run: DungeonRunState, definition: DungeonDefinition, context: DungeonFlowControllerContext): void {
    const rooms = definition.rooms ?? [];
    if (rooms.length === 0) {
      context.complete(run, 'all_rooms_cleared');
      return;
    }
    if ((context.countAliveHostiles?.(run) ?? 0) > 0) return;
    const currentIndex = Math.max(0, rooms.findIndex((room) => room.roomId === run.currentRoomId));
    const nextRoom = rooms[currentIndex + 1];
    if (nextRoom && context.advanceRoom) context.advanceRoom(run, nextRoom.roomId);
    else context.complete(run, 'all_hostiles_defeated');
  }
}

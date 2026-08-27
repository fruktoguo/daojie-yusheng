import type { DungeonDefinition, DungeonRunState } from '@mud/shared';

export interface DungeonFlowControllerContext {
  complete(run: DungeonRunState, reason: string): void;
  advanceRoom?(run: DungeonRunState, roomId: string): void;
}

export interface DungeonFlowController {
  readonly id: string;
  onMonsterDefeated?(run: DungeonRunState, definition: DungeonDefinition, monsterId: string, context: DungeonFlowControllerContext): void;
  onFormationDestroyed?(run: DungeonRunState, definition: DungeonDefinition, formationId: string, context: DungeonFlowControllerContext): void;
}

export class SuppressDemonDungeonFlowController implements DungeonFlowController {
  readonly id = 'suppress_demon';
  onMonsterDefeated(run: DungeonRunState, definition: DungeonDefinition, monsterId: string, context: DungeonFlowControllerContext): void {
    const room = definition.rooms?.find((entry) => entry.roomId === run.currentRoomId);
    if (room?.bossId === monsterId || room?.clearCondition === 'boss_defeated') {
      if (room.nextRoomId && context.advanceRoom) context.advanceRoom(run, room.nextRoomId);
      else context.complete(run, 'boss_defeated');
    }
  }
  onFormationDestroyed(run: DungeonRunState, definition: DungeonDefinition, _formationId: string, context: DungeonFlowControllerContext): void {
    if (definition.rooms?.some((entry) => entry.roomId === run.currentRoomId && entry.mechanismFormation)) context.complete(run, 'formation_destroyed');
  }
}

export class DefenseDungeonFlowController implements DungeonFlowController {
  readonly id = 'defense';
}

export class ExpeditionDungeonFlowController implements DungeonFlowController {
  readonly id = 'expedition';
}

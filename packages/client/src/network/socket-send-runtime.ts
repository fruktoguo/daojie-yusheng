import {
  Direction,
  NEXT_C2S,
  type NEXT_C2S_EventPayload,
} from '@mud/shared-next';
import { logNextMovement } from '../debug/movement-debug';
import type { SocketConnectedGetter, SocketEmitEvent } from './socket-send-types';

type RuntimeSenderDeps = {
  emitEvent: SocketEmitEvent;
  isConnected: SocketConnectedGetter;
};

export function createSocketRuntimeSender(deps: RuntimeSenderDeps) {
  return {
    sendPing(clientAt = Date.now()): number {
      deps.emitEvent(NEXT_C2S.Ping, { clientAt });
      return clientAt;
    },

    sendMove(direction: Direction): void {
      logNextMovement('client.emit.move', {
        direction,
        connected: deps.isConnected(),
      });
      deps.emitEvent(NEXT_C2S.Move, { d: direction });
    },

    sendMoveTo(
      x: number,
      y: number,
      options?: {
        ignoreVisibilityLimit?: boolean;
        allowNearestReachable?: boolean;
        packedPath?: string;
        packedPathSteps?: number;
        pathStartX?: number;
        pathStartY?: number;
      },
    ): void {
      logNextMovement('client.emit.moveTo', {
        x,
        y,
        allowNearestReachable: options?.allowNearestReachable === true,
        ignoreVisibilityLimit: options?.ignoreVisibilityLimit === true,
        packedPathSteps: options?.packedPathSteps ?? null,
        packedPath: options?.packedPath ?? null,
        pathStartX: options?.pathStartX ?? null,
        pathStartY: options?.pathStartY ?? null,
        connected: deps.isConnected(),
      });
      deps.emitEvent(NEXT_C2S.MoveTo, {
        x,
        y,
        ignoreVisibilityLimit: options?.ignoreVisibilityLimit,
        allowNearestReachable: options?.allowNearestReachable,
        packedPath: options?.packedPath,
        packedPathSteps: options?.packedPathSteps,
        pathStartX: options?.pathStartX,
        pathStartY: options?.pathStartY,
      });
    },

    sendNavigateQuest(questId: string): void {
      logNextMovement('client.emit.navigateQuest', { questId });
      deps.emitEvent(NEXT_C2S.NavigateQuest, { questId });
    },

    sendRequestQuests(): void {
      deps.emitEvent(NEXT_C2S.RequestQuests, {});
    },

    sendRequestNpcQuests(npcId: string): void {
      deps.emitEvent(NEXT_C2S.RequestNpcQuests, { npcId });
    },

    sendAcceptNpcQuest(npcId: string, questId: string): void {
      deps.emitEvent(NEXT_C2S.AcceptNpcQuest, { npcId, questId });
    },

    sendSubmitNpcQuest(npcId: string, questId: string): void {
      deps.emitEvent(NEXT_C2S.SubmitNpcQuest, { npcId, questId });
    },

    sendRequestDetail(
      kind: NEXT_C2S_EventPayload<typeof NEXT_C2S.RequestDetail>['kind'],
      id: string,
    ): void {
      deps.emitEvent(NEXT_C2S.RequestDetail, { kind, id });
    },

    sendInspectTileRuntime(x: number, y: number): void {
      deps.emitEvent(NEXT_C2S.RequestTileDetail, { x, y });
    },

    sendCultivate(techId: string | null): void {
      deps.emitEvent(NEXT_C2S.Cultivate, { techId });
    },

    sendCastSkill(skillId: string, target?: string): void {
      const payload: NEXT_C2S_EventPayload<typeof NEXT_C2S.CastSkill> = { skillId };
      if (target) {
        if (target.startsWith('player:')) {
          payload.targetPlayerId = target.slice('player:'.length) || null;
        } else if (target.startsWith('tile:')) {
          payload.targetRef = target;
        } else {
          payload.targetMonsterId = target;
        }
      }
      deps.emitEvent(NEXT_C2S.CastSkill, payload);
    },

    sendHeavenGateAction(
      action: NEXT_C2S_EventPayload<typeof NEXT_C2S.HeavenGateAction>['action'],
      element?: NEXT_C2S_EventPayload<typeof NEXT_C2S.HeavenGateAction>['element'],
    ): void {
      deps.emitEvent(NEXT_C2S.HeavenGateAction, { action, element });
    },

    sendAction(actionId: string, target?: string): void {
      if (!target && actionId === 'portal:travel') {
        deps.emitEvent(NEXT_C2S.UsePortal, {});
        return;
      }
      deps.emitEvent(NEXT_C2S.UseAction, { actionId, target });
    },

    sendUpdateAutoBattleSkills(skills: NEXT_C2S_EventPayload<typeof NEXT_C2S.UpdateAutoBattleSkills>['skills']): void {
      deps.emitEvent(NEXT_C2S.UpdateAutoBattleSkills, { skills });
    },

    sendUpdateAutoUsePills(pills: NEXT_C2S_EventPayload<typeof NEXT_C2S.UpdateAutoUsePills>['pills']): void {
      deps.emitEvent(NEXT_C2S.UpdateAutoUsePills, { pills });
    },

    sendUpdateCombatTargetingRules(
      combatTargetingRules: NEXT_C2S_EventPayload<typeof NEXT_C2S.UpdateCombatTargetingRules>['combatTargetingRules'],
    ): void {
      deps.emitEvent(NEXT_C2S.UpdateCombatTargetingRules, { combatTargetingRules });
    },

    sendUpdateAutoBattleTargetingMode(mode: NEXT_C2S_EventPayload<typeof NEXT_C2S.UpdateAutoBattleTargetingMode>['mode']): void {
      deps.emitEvent(NEXT_C2S.UpdateAutoBattleTargetingMode, { mode });
    },

    sendUpdateTechniqueSkillAvailability(techId: string, enabled: boolean): void {
      deps.emitEvent(NEXT_C2S.UpdateTechniqueSkillAvailability, { techId, enabled });
    },
  };
}

export type SocketRuntimeSender = ReturnType<typeof createSocketRuntimeSender>;

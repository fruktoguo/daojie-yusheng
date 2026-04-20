import {
  Direction,
  NEXT_C2S,
  type NEXT_C2S_EventPayload,
} from '@mud/shared-next';
import { logNextMovement } from '../debug/movement-debug';
import type { SocketConnectedGetter, SocketEmitEvent } from './socket-send-types';
/**
 * RuntimeSenderDeps：统一结构类型，保证协议与运行时一致性。
 */


type RuntimeSenderDeps = {
/**
 * emitEvent：对象字段。
 */

  emitEvent: SocketEmitEvent;  
  /**
 * isConnected：对象字段。
 */

  isConnected: SocketConnectedGetter;
};
/**
 * createSocketRuntimeSender：构建并返回目标对象。
 * @param deps RuntimeSenderDeps 运行时依赖。
 * @returns 函数返回值。
 */


export function createSocketRuntimeSender(deps: RuntimeSenderDeps) {
  return {  
  /**
 * sendPing：执行核心业务逻辑。
 * @param clientAt 参数说明。
 * @returns number。
 */

    sendPing(clientAt = Date.now()): number {
      deps.emitEvent(NEXT_C2S.Ping, { clientAt });
      return clientAt;
    },    
    /**
 * sendMove：执行核心业务逻辑。
 * @param direction Direction 方向参数。
 * @returns void。
 */


    sendMove(direction: Direction): void {
      logNextMovement('client.emit.move', {
        direction,
        connected: deps.isConnected(),
      });
      deps.emitEvent(NEXT_C2S.Move, { d: direction });
    },    
    /**
 * sendMoveTo：执行核心业务逻辑。
 * @param x number X 坐标。
 * @param y number Y 坐标。
 * @param options {
        ignoreVisibilityLimit?: boolean;
        allowNearestReachable?: boolean;
        packedPath?: string;
        packedPathSteps?: number;
        pathStartX?: number;
        pathStartY?: number;
      } 选项参数。
 * @returns void。
 */


    sendMoveTo(
      x: number,
      y: number,
      options?: {      
      /**
 * ignoreVisibilityLimit：对象字段。
 */

        ignoreVisibilityLimit?: boolean;        
        /**
 * allowNearestReachable：对象字段。
 */

        allowNearestReachable?: boolean;        
        /**
 * packedPath：对象字段。
 */

        packedPath?: string;        
        /**
 * packedPathSteps：对象字段。
 */

        packedPathSteps?: number;        
        /**
 * pathStartX：对象字段。
 */

        pathStartX?: number;        
        /**
 * pathStartY：对象字段。
 */

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
    /**
 * sendNavigateQuest：执行核心业务逻辑。
 * @param questId string quest ID。
 * @returns void。
 */


    sendNavigateQuest(questId: string): void {
      logNextMovement('client.emit.navigateQuest', { questId });
      deps.emitEvent(NEXT_C2S.NavigateQuest, { questId });
    },    
    /**
 * sendRequestQuests：执行核心业务逻辑。
 * @returns void。
 */


    sendRequestQuests(): void {
      deps.emitEvent(NEXT_C2S.RequestQuests, {});
    },    
    /**
 * sendRequestNpcQuests：执行核心业务逻辑。
 * @param npcId string npc ID。
 * @returns void。
 */


    sendRequestNpcQuests(npcId: string): void {
      deps.emitEvent(NEXT_C2S.RequestNpcQuests, { npcId });
    },    
    /**
 * sendAcceptNpcQuest：执行核心业务逻辑。
 * @param npcId string npc ID。
 * @param questId string quest ID。
 * @returns void。
 */


    sendAcceptNpcQuest(npcId: string, questId: string): void {
      deps.emitEvent(NEXT_C2S.AcceptNpcQuest, { npcId, questId });
    },    
    /**
 * sendSubmitNpcQuest：执行核心业务逻辑。
 * @param npcId string npc ID。
 * @param questId string quest ID。
 * @returns void。
 */


    sendSubmitNpcQuest(npcId: string, questId: string): void {
      deps.emitEvent(NEXT_C2S.SubmitNpcQuest, { npcId, questId });
    },    
    /**
 * sendRequestDetail：执行核心业务逻辑。
 * @param kind NEXT_C2S_EventPayload<typeof NEXT_C2S.RequestDetail>['kind'] 参数说明。
 * @param id string 参数说明。
 * @returns void。
 */


    sendRequestDetail(
      kind: NEXT_C2S_EventPayload<typeof NEXT_C2S.RequestDetail>['kind'],
      id: string,
    ): void {
      deps.emitEvent(NEXT_C2S.RequestDetail, { kind, id });
    },    
    /**
 * sendInspectTileRuntime：执行核心业务逻辑。
 * @param x number X 坐标。
 * @param y number Y 坐标。
 * @returns void。
 */


    sendInspectTileRuntime(x: number, y: number): void {
      deps.emitEvent(NEXT_C2S.RequestTileDetail, { x, y });
    },    
    /**
 * sendCultivate：执行核心业务逻辑。
 * @param techId string | null tech ID。
 * @returns void。
 */


    sendCultivate(techId: string | null): void {
      deps.emitEvent(NEXT_C2S.Cultivate, { techId });
    },    
    /**
 * sendCastSkill：执行核心业务逻辑。
 * @param skillId string skill ID。
 * @param target string 目标对象。
 * @returns void。
 */


    sendCastSkill(skillId: string, target?: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * sendHeavenGateAction：执行核心业务逻辑。
 * @param action NEXT_C2S_EventPayload<typeof NEXT_C2S.HeavenGateAction>['action'] 参数说明。
 * @param element NEXT_C2S_EventPayload<typeof NEXT_C2S.HeavenGateAction>['element'] 参数说明。
 * @returns void。
 */


    sendHeavenGateAction(
      action: NEXT_C2S_EventPayload<typeof NEXT_C2S.HeavenGateAction>['action'],
      element?: NEXT_C2S_EventPayload<typeof NEXT_C2S.HeavenGateAction>['element'],
    ): void {
      deps.emitEvent(NEXT_C2S.HeavenGateAction, { action, element });
    },    
    /**
 * sendAction：执行核心业务逻辑。
 * @param actionId string action ID。
 * @param target string 目标对象。
 * @returns void。
 */


    sendAction(actionId: string, target?: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      if (!target && actionId === 'portal:travel') {
        deps.emitEvent(NEXT_C2S.UsePortal, {});
        return;
      }
      deps.emitEvent(NEXT_C2S.UseAction, { actionId, target });
    },    
    /**
 * sendUpdateAutoBattleSkills：执行核心业务逻辑。
 * @param skills NEXT_C2S_EventPayload<typeof NEXT_C2S.UpdateAutoBattleSkills>['skills'] 参数说明。
 * @returns void。
 */


    sendUpdateAutoBattleSkills(skills: NEXT_C2S_EventPayload<typeof NEXT_C2S.UpdateAutoBattleSkills>['skills']): void {
      deps.emitEvent(NEXT_C2S.UpdateAutoBattleSkills, { skills });
    },    
    /**
 * sendUpdateAutoUsePills：执行核心业务逻辑。
 * @param pills NEXT_C2S_EventPayload<typeof NEXT_C2S.UpdateAutoUsePills>['pills'] 参数说明。
 * @returns void。
 */


    sendUpdateAutoUsePills(pills: NEXT_C2S_EventPayload<typeof NEXT_C2S.UpdateAutoUsePills>['pills']): void {
      deps.emitEvent(NEXT_C2S.UpdateAutoUsePills, { pills });
    },    
    /**
 * sendUpdateCombatTargetingRules：执行核心业务逻辑。
 * @param combatTargetingRules NEXT_C2S_EventPayload<typeof NEXT_C2S.UpdateCombatTargetingRules>['combatTargetingRules'] 参数说明。
 * @returns void。
 */


    sendUpdateCombatTargetingRules(
      combatTargetingRules: NEXT_C2S_EventPayload<typeof NEXT_C2S.UpdateCombatTargetingRules>['combatTargetingRules'],
    ): void {
      deps.emitEvent(NEXT_C2S.UpdateCombatTargetingRules, { combatTargetingRules });
    },    
    /**
 * sendUpdateAutoBattleTargetingMode：执行核心业务逻辑。
 * @param mode NEXT_C2S_EventPayload<typeof NEXT_C2S.UpdateAutoBattleTargetingMode>['mode'] 参数说明。
 * @returns void。
 */


    sendUpdateAutoBattleTargetingMode(mode: NEXT_C2S_EventPayload<typeof NEXT_C2S.UpdateAutoBattleTargetingMode>['mode']): void {
      deps.emitEvent(NEXT_C2S.UpdateAutoBattleTargetingMode, { mode });
    },    
    /**
 * sendUpdateTechniqueSkillAvailability：执行核心业务逻辑。
 * @param techId string tech ID。
 * @param enabled boolean 参数说明。
 * @returns void。
 */


    sendUpdateTechniqueSkillAvailability(techId: string, enabled: boolean): void {
      deps.emitEvent(NEXT_C2S.UpdateTechniqueSkillAvailability, { techId, enabled });
    },
  };
}
/**
 * SocketRuntimeSender：统一结构类型，保证协议与运行时一致性。
 */


export type SocketRuntimeSender = ReturnType<typeof createSocketRuntimeSender>;

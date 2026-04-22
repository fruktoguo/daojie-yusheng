import {
  Direction,
  C2S,
  type ClientToServerEventPayload,
} from '@mud/shared';
import { logMovement } from '../debug/movement-debug';
import type { SocketConnectedGetter, SocketEmitEvent } from './socket-send-types';
/**
 * RuntimeSenderDeps：统一结构类型，保证协议与运行时一致性。
 */


type RuntimeSenderDeps = {
/**
 * emitEvent：事件相关字段。
 */

  emitEvent: SocketEmitEvent;  
  /**
 * isConnected：启用开关或状态标识。
 */

  isConnected: SocketConnectedGetter;
};
/**
 * createSocketRuntimeSender：构建并返回目标对象。
 * @param deps RuntimeSenderDeps 运行时依赖。
 * @returns 无返回值，直接更新Socket运行态Sender相关状态。
 */


export function createSocketRuntimeSender(deps: RuntimeSenderDeps) {
  return {  
  /**
 * sendPing：执行sendPing相关逻辑。
 * @param clientAt 参数说明。
 * @returns 返回sendPing。
 */

    sendPing(clientAt = Date.now()): number {
      deps.emitEvent(C2S.Ping, { clientAt });
      return clientAt;
    },    
    /**
 * sendMove：执行sendMove相关逻辑。
 * @param direction Direction 方向参数。
 * @returns 无返回值，直接更新sendMove相关状态。
 */


    sendMove(direction: Direction): void {
      logMovement('client.emit.move', {
        direction,
        connected: deps.isConnected(),
      });
      deps.emitEvent(C2S.Move, { d: direction });
    },    
    /**
 * sendMoveTo：执行sendMoveTo相关逻辑。
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
 * @returns 无返回值，直接更新sendMoveTo相关状态。
 */


    sendMoveTo(
      x: number,
      y: number,
      options?: {      
      /**
 * ignoreVisibilityLimit：ignore可见性Limit相关字段。
 */

        ignoreVisibilityLimit?: boolean;        
        /**
 * allowNearestReachable：allowNearestReachable相关字段。
 */

        allowNearestReachable?: boolean;        
        /**
 * packedPath：packed路径相关字段。
 */

        packedPath?: string;        
        /**
 * packedPathSteps：packed路径Step相关字段。
 */

        packedPathSteps?: number;        
        /**
 * pathStartX：路径StartX相关字段。
 */

        pathStartX?: number;        
        /**
 * pathStartY：路径StartY相关字段。
 */

        pathStartY?: number;
      },
    ): void {
      logMovement('client.emit.moveTo', {
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
      deps.emitEvent(C2S.MoveTo, {
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
 * sendNavigateQuest：执行sendNavigate任务相关逻辑。
 * @param questId string quest ID。
 * @returns 无返回值，直接更新sendNavigate任务相关状态。
 */


    sendNavigateQuest(questId: string): void {
      logMovement('client.emit.navigateQuest', { questId });
      deps.emitEvent(C2S.NavigateQuest, { questId });
    },    
    /**
 * sendRequestQuests：执行sendRequest任务相关逻辑。
 * @returns 无返回值，直接更新sendRequest任务相关状态。
 */


    sendRequestQuests(): void {
      deps.emitEvent(C2S.RequestQuests, {});
    },    
    /**
 * sendRequestNpcQuests：执行sendRequestNPC任务相关逻辑。
 * @param npcId string npc ID。
 * @returns 无返回值，直接更新sendRequestNPC任务相关状态。
 */


    sendRequestNpcQuests(npcId: string): void {
      deps.emitEvent(C2S.RequestNpcQuests, { npcId });
    },    
    /**
 * sendAcceptNpcQuest：执行sendAcceptNPC任务相关逻辑。
 * @param npcId string npc ID。
 * @param questId string quest ID。
 * @returns 无返回值，直接更新sendAcceptNPC任务相关状态。
 */


    sendAcceptNpcQuest(npcId: string, questId: string): void {
      deps.emitEvent(C2S.AcceptNpcQuest, { npcId, questId });
    },    
    /**
 * sendSubmitNpcQuest：执行sendSubmitNPC任务相关逻辑。
 * @param npcId string npc ID。
 * @param questId string quest ID。
 * @returns 无返回值，直接更新sendSubmitNPC任务相关状态。
 */


    sendSubmitNpcQuest(npcId: string, questId: string): void {
      deps.emitEvent(C2S.SubmitNpcQuest, { npcId, questId });
    },    
    /**
 * sendRequestDetail：执行sendRequest详情相关逻辑。
 * @param kind ClientToServerEventPayload<typeof C2S.RequestDetail>['kind'] 参数说明。
 * @param id string 参数说明。
 * @returns 无返回值，直接更新sendRequest详情相关状态。
 */


    sendRequestDetail(
      kind: ClientToServerEventPayload<typeof C2S.RequestDetail>['kind'],
      id: string,
    ): void {
      deps.emitEvent(C2S.RequestDetail, { kind, id });
    },    
    /**
 * sendInspectTileRuntime：执行sendInspectTile运行态相关逻辑。
 * @param x number X 坐标。
 * @param y number Y 坐标。
 * @returns 无返回值，直接更新sendInspectTile运行态相关状态。
 */


    sendInspectTileRuntime(x: number, y: number): void {
      deps.emitEvent(C2S.RequestTileDetail, { x, y });
    },    
    /**
 * sendCultivate：执行sendCultivate相关逻辑。
 * @param techId string | null tech ID。
 * @returns 无返回值，直接更新sendCultivate相关状态。
 */


    sendCultivate(techId: string | null): void {
      deps.emitEvent(C2S.Cultivate, { techId });
    },    
    /**
 * sendCastSkill：执行sendCast技能相关逻辑。
 * @param skillId string skill ID。
 * @param target string 目标对象。
 * @returns 无返回值，直接更新sendCast技能相关状态。
 */


    sendCastSkill(skillId: string, target?: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      const payload: ClientToServerEventPayload<typeof C2S.CastSkill> = { skillId };
      if (target) {
        if (target.startsWith('player:')) {
          payload.targetPlayerId = target.slice('player:'.length) || null;
        } else if (target.startsWith('tile:')) {
          payload.targetRef = target;
        } else {
          payload.targetMonsterId = target;
        }
      }
      deps.emitEvent(C2S.CastSkill, payload);
    },    
    /**
 * sendHeavenGateAction：执行sendHeavenGateAction相关逻辑。
 * @param action ClientToServerEventPayload<typeof C2S.HeavenGateAction>['action'] 参数说明。
 * @param element ClientToServerEventPayload<typeof C2S.HeavenGateAction>['element'] 参数说明。
 * @returns 无返回值，直接更新sendHeavenGateAction相关状态。
 */


    sendHeavenGateAction(
      action: ClientToServerEventPayload<typeof C2S.HeavenGateAction>['action'],
      element?: ClientToServerEventPayload<typeof C2S.HeavenGateAction>['element'],
    ): void {
      deps.emitEvent(C2S.HeavenGateAction, { action, element });
    },    
    /**
 * sendAction：执行sendAction相关逻辑。
 * @param actionId string action ID。
 * @param target string 目标对象。
 * @returns 无返回值，直接更新sendAction相关状态。
 */


    sendAction(actionId: string, target?: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      if (!target && actionId === 'portal:travel') {
        deps.emitEvent(C2S.UsePortal, {});
        return;
      }
      deps.emitEvent(C2S.UseAction, { actionId, target });
    },    
    /**
 * sendUpdateAutoBattleSkills：处理sendUpdateAutoBattle技能并更新相关状态。
 * @param skills ClientToServerEventPayload<typeof C2S.UpdateAutoBattleSkills>['skills'] 参数说明。
 * @returns 无返回值，直接更新sendUpdateAutoBattle技能相关状态。
 */


    sendUpdateAutoBattleSkills(skills: ClientToServerEventPayload<typeof C2S.UpdateAutoBattleSkills>['skills']): void {
      deps.emitEvent(C2S.UpdateAutoBattleSkills, { skills });
    },    
    /**
 * sendUpdateAutoUsePills：处理sendUpdateAutoUsePill并更新相关状态。
 * @param pills ClientToServerEventPayload<typeof C2S.UpdateAutoUsePills>['pills'] 参数说明。
 * @returns 无返回值，直接更新sendUpdateAutoUsePill相关状态。
 */


    sendUpdateAutoUsePills(pills: ClientToServerEventPayload<typeof C2S.UpdateAutoUsePills>['pills']): void {
      deps.emitEvent(C2S.UpdateAutoUsePills, { pills });
    },    
    /**
 * sendUpdateCombatTargetingRules：读取sendUpdate战斗TargetingRule并返回结果。
 * @param combatTargetingRules ClientToServerEventPayload<typeof C2S.UpdateCombatTargetingRules>['combatTargetingRules'] 参数说明。
 * @returns 无返回值，直接更新sendUpdate战斗TargetingRule相关状态。
 */


    sendUpdateCombatTargetingRules(
      combatTargetingRules: ClientToServerEventPayload<typeof C2S.UpdateCombatTargetingRules>['combatTargetingRules'],
    ): void {
      deps.emitEvent(C2S.UpdateCombatTargetingRules, { combatTargetingRules });
    },    
    /**
 * sendUpdateAutoBattleTargetingMode：读取sendUpdateAutoBattleTargetingMode并返回结果。
 * @param mode ClientToServerEventPayload<typeof C2S.UpdateAutoBattleTargetingMode>['mode'] 参数说明。
 * @returns 无返回值，直接更新sendUpdateAutoBattleTargetingMode相关状态。
 */


    sendUpdateAutoBattleTargetingMode(mode: ClientToServerEventPayload<typeof C2S.UpdateAutoBattleTargetingMode>['mode']): void {
      deps.emitEvent(C2S.UpdateAutoBattleTargetingMode, { mode });
    },    
    /**
 * sendUpdateTechniqueSkillAvailability：处理sendUpdate功法技能Availability并更新相关状态。
 * @param techId string tech ID。
 * @param enabled boolean 参数说明。
 * @returns 无返回值，直接更新sendUpdate功法技能Availability相关状态。
 */


    sendUpdateTechniqueSkillAvailability(techId: string, enabled: boolean): void {
      deps.emitEvent(C2S.UpdateTechniqueSkillAvailability, { techId, enabled });
    },
  };
}
/**
 * SocketRuntimeSender：统一结构类型，保证协议与运行时一致性。
 */


export type SocketRuntimeSender = ReturnType<typeof createSocketRuntimeSender>;

import { ActionDef, AutoBattleSkillConfig, PlayerState } from '@mud/shared-next';
import type { SocketRuntimeSender } from './network/socket-send-runtime';
import { ActionPanel } from './ui/panels/action-panel';
/**
 * MainActionStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainActionStateSourceOptions = {
/**
 * actionPanel：action面板相关字段。
 */

  actionPanel: Pick<ActionPanel, 'setCallbacks' | 'initFromPlayer' | 'update' | 'syncDynamic' | 'clear'>;  
  /**
 * socket：socket相关字段。
 */

  socket: Pick<SocketRuntimeSender, 'sendAction' | 'sendCastSkill' | 'sendUpdateAutoBattleSkills'>;  
  /**
 * beginTargeting：beginTargeting相关字段。
 */

  beginTargeting: (actionId: string, actionName: string, targetMode?: string, range?: number) => void;  
  /**
 * cancelTargeting：cancelTargeting相关字段。
 */

  cancelTargeting: () => void;  
  /**
 * hideObserveModal：hideObserve弹层相关字段。
 */

  hideObserveModal: () => void;  
  /**
 * openBreakthroughModal：openBreakthrough弹层相关字段。
 */

  openBreakthroughModal: () => void;  
  /**
 * openNpcShop：openNPCShop相关字段。
 */

  openNpcShop: (npcId: string) => void;  
  /**
 * openNpcQuestPending：openNPC任务Pending相关字段。
 */

  openNpcQuestPending: (npcId: string) => void;  
  /**
 * openAlchemy：open炼丹相关字段。
 */

  openAlchemy: () => void;  
  /**
 * openEnhancement：open强化相关字段。
 */

  openEnhancement: () => void;  
  /**
 * getInfoRadius：InfoRadiu相关字段。
 */

  getInfoRadius: () => number;  
  /**
 * getCurrentActionDef：CurrentActionDef相关字段。
 */

  getCurrentActionDef: (actionId: string) => ActionDef | null;
};
/**
 * MainActionStateSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainActionStateSource = ReturnType<typeof createMainActionStateSource>;
/**
 * createMainActionStateSource：构建并返回目标对象。
 * @param options MainActionStateSourceOptions 选项参数。
 * @returns 无返回值，直接更新MainAction状态来源相关状态。
 */


export function createMainActionStateSource(options: MainActionStateSourceOptions) {
  options.actionPanel.setCallbacks(
    (actionId, requiresTarget, targetMode, range, actionName) => {
      if (actionId === 'loot:open') {
        options.beginTargeting(actionId, actionName ?? actionId, targetMode, range ?? 1);
        return;
      }
      if (actionId === 'realm:breakthrough') {
        options.cancelTargeting();
        options.hideObserveModal();
        options.openBreakthroughModal();
        return;
      }
      if (actionId.startsWith('npc_shop:')) {
        options.cancelTargeting();
        options.hideObserveModal();
        options.openNpcShop(actionId.slice('npc_shop:'.length));
        return;
      }
      if (actionId.startsWith('npc_quests:')) {
        options.cancelTargeting();
        options.hideObserveModal();
        const npcId = actionId.slice('npc_quests:'.length);
        options.openNpcQuestPending(npcId);
        options.socket.sendAction(actionId);
        return;
      }
      if (actionId === 'alchemy:open') {
        options.cancelTargeting();
        options.hideObserveModal();
        options.openAlchemy();
        return;
      }
      if (actionId === 'enhancement:open') {
        options.cancelTargeting();
        options.hideObserveModal();
        options.openEnhancement();
        return;
      }
      if (requiresTarget) {
        options.beginTargeting(actionId, actionName ?? actionId, targetMode, actionId === 'client:observe' ? options.getInfoRadius() : (range ?? 1));
        return;
      }
      options.cancelTargeting();
      options.hideObserveModal();
      const action = options.getCurrentActionDef(actionId);
      if (action?.type === 'skill') {
        options.socket.sendCastSkill(actionId);
        return;
      }
      options.socket.sendAction(actionId);
    },
    (skills: AutoBattleSkillConfig[]) => {
      options.socket.sendUpdateAutoBattleSkills(skills);
    },
  );

  return {  
  /**
 * initFromPlayer：执行initFrom玩家相关逻辑。
 * @param player PlayerState 玩家对象。
 * @returns 无返回值，直接更新initFrom玩家相关状态。
 */

    initFromPlayer(player: PlayerState): void {
      options.actionPanel.initFromPlayer(player);
    },    
    /**
 * update：处理update并更新相关状态。
 * @param actions ActionDef[] 参数说明。
 * @param autoBattle boolean 参数说明。
 * @param autoRetaliate boolean 参数说明。
 * @param player PlayerState 玩家对象。
 * @returns 无返回值，直接更新玩家相关状态。
 */


    update(actions: ActionDef[], autoBattle?: boolean, autoRetaliate?: boolean, player?: PlayerState): void {
      options.actionPanel.update(actions, autoBattle, autoRetaliate, player);
    },    
    /**
 * syncDynamic：处理Dynamic并更新相关状态。
 * @param actions ActionDef[] 参数说明。
 * @param autoBattle boolean 参数说明。
 * @param autoRetaliate boolean 参数说明。
 * @param player PlayerState 玩家对象。
 * @returns 无返回值，直接更新Dynamic相关状态。
 */


    syncDynamic(actions: ActionDef[], autoBattle?: boolean, autoRetaliate?: boolean, player?: PlayerState): void {
      options.actionPanel.syncDynamic(actions, autoBattle, autoRetaliate, player);
    },    
    /**
 * clear：执行clear相关逻辑。
 * @returns 无返回值，直接更新clear相关状态。
 */


    clear(): void {
      options.actionPanel.clear();
    },
  };
}

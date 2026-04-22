import {
  ActionDef,
  AutoBattleSkillConfig,
  PlayerState,
  buildDefaultCombatTargetingRules,
  normalizeAutoBattleTargetingMode,
  normalizeCombatTargetingRules,
} from '@mud/shared';
import type { SocketRuntimeSender } from './network/socket-send-runtime';
import type { ClientTechniqueActivityKind } from './technique-activity-client.helpers';
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

  socket: Pick<
    SocketRuntimeSender,
    | 'sendAction'
    | 'sendCastSkill'
    | 'sendUpdateAutoBattleSkills'
    | 'sendUpdateAutoUsePills'
    | 'sendUpdateCombatTargetingRules'
    | 'sendUpdateAutoBattleTargetingMode'
  >;  
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
 * openTechniqueActivity：打开指定技艺活动面板。
 */

  openTechniqueActivity: (kind: ClientTechniqueActivityKind) => void;  
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

const TECHNIQUE_ACTIVITY_ACTIONS = {
  'alchemy:open': 'alchemy',
  'enhancement:open': 'enhancement',
} as const satisfies Record<string, ClientTechniqueActivityKind>;
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
      const techniqueActivityKind = TECHNIQUE_ACTIVITY_ACTIONS[actionId as keyof typeof TECHNIQUE_ACTIVITY_ACTIONS];
      if (techniqueActivityKind) {
        options.cancelTargeting();
        options.hideObserveModal();
        options.openTechniqueActivity(techniqueActivityKind);
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
    (pills) => {
      options.socket.sendUpdateAutoUsePills(pills);
    },
    (rules) => {
      options.socket.sendUpdateCombatTargetingRules(rules);
    },
    (mode) => {
      options.socket.sendUpdateAutoBattleTargetingMode(mode);
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
 * normalizeBootstrapPlayer：在首包阶段规整动作与战斗设置真源。
 * @param player PlayerState 玩家对象。
 * @returns 无返回值，直接更新玩家相关状态。
 */

    normalizeBootstrapPlayer(player: PlayerState): void {
      player.combatTargetingRules = normalizeCombatTargetingRules(
        player.combatTargetingRules,
        buildDefaultCombatTargetingRules({
          includeAllPlayersHostile: player.allowAoePlayerHit === true,
        }),
      );
      player.autoBattleTargetingMode = normalizeAutoBattleTargetingMode(player.autoBattleTargetingMode);
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

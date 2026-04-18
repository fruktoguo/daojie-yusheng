import { ActionDef, AutoBattleSkillConfig, PlayerState } from '@mud/shared-next';
import type { SocketManager } from './network/socket';
import { ActionPanel } from './ui/panels/action-panel';

type MainActionStateSourceOptions = {
  actionPanel: Pick<ActionPanel, 'setCallbacks' | 'initFromPlayer' | 'update' | 'syncDynamic' | 'clear'>;
  socket: Pick<SocketManager, 'sendAction' | 'sendCastSkill' | 'sendUpdateAutoBattleSkills'>;
  beginTargeting: (actionId: string, actionName: string, targetMode?: string, range?: number) => void;
  cancelTargeting: () => void;
  hideObserveModal: () => void;
  openBreakthroughModal: () => void;
  openNpcShop: (npcId: string) => void;
  openNpcQuestPending: (npcId: string) => void;
  openAlchemy: () => void;
  openEnhancement: () => void;
  getInfoRadius: () => number;
  getCurrentActionDef: (actionId: string) => ActionDef | null;
};

export type MainActionStateSource = ReturnType<typeof createMainActionStateSource>;

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
    initFromPlayer(player: PlayerState): void {
      options.actionPanel.initFromPlayer(player);
    },

    update(actions: ActionDef[], autoBattle?: boolean, autoRetaliate?: boolean, player?: PlayerState): void {
      options.actionPanel.update(actions, autoBattle, autoRetaliate, player);
    },

    syncDynamic(actions: ActionDef[], autoBattle?: boolean, autoRetaliate?: boolean, player?: PlayerState): void {
      options.actionPanel.syncDynamic(actions, autoBattle, autoRetaliate, player);
    },

    clear(): void {
      options.actionPanel.clear();
    },
  };
}

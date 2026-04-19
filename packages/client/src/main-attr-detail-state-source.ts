import { NEXT_S2C_AttrDetail, NEXT_S2C_AttrUpdate, PlayerState } from '@mud/shared-next';
import type { SocketPanelSender } from './network/socket-send-panel';
import { AttrPanel } from './ui/panels/attr-panel';

type MainAttrDetailStateSourceOptions = {
  attrPanel: Pick<AttrPanel, 'update'>;
  socket: Pick<SocketPanelSender, 'sendRequestAttrDetail'>;
  getPlayer: () => PlayerState | null;
  getLatestAttrUpdate: () => NEXT_S2C_AttrUpdate | null;
  setLatestAttrUpdate: (value: NEXT_S2C_AttrUpdate | null) => void;
  mergeAttrUpdatePatch: (current: NEXT_S2C_AttrUpdate | null, data: NEXT_S2C_AttrUpdate) => NEXT_S2C_AttrUpdate;
  cloneJson: <T>(value: T) => T;
};

export type MainAttrDetailStateSource = ReturnType<typeof createMainAttrDetailStateSource>;

export function createMainAttrDetailStateSource(options: MainAttrDetailStateSourceOptions) {
  return {
    requestDetail(): void {
      options.socket.sendRequestAttrDetail();
    },

    init(): void {
      options.socket.sendRequestAttrDetail();
    },

    handleAttrDetail(data: NEXT_S2C_AttrDetail): void {
      const player = options.getPlayer();
      if (!player) {
        return;
      }
      const latestAttrUpdate = options.getLatestAttrUpdate();
      const nextSpecialStats = latestAttrUpdate?.specialStats
        ? options.cloneJson(latestAttrUpdate.specialStats)
        : {
            foundation: Math.max(0, Math.floor(player.foundation ?? 0)),
            combatExp: Math.max(0, Math.floor(player.combatExp ?? 0)),
          };
      const nextAttrUpdate = options.mergeAttrUpdatePatch(latestAttrUpdate, {
        baseAttrs: options.cloneJson(data.baseAttrs),
        bonuses: options.cloneJson(data.bonuses),
        finalAttrs: options.cloneJson(data.finalAttrs),
        numericStats: options.cloneJson(data.numericStats),
        ratioDivisors: options.cloneJson(data.ratioDivisors),
        specialStats: nextSpecialStats,
        alchemySkill: options.cloneJson(data.alchemySkill ?? player.alchemySkill),
        gatherSkill: options.cloneJson(data.gatherSkill ?? player.gatherSkill),
        enhancementSkill: options.cloneJson(data.enhancementSkill ?? player.enhancementSkill),
      });
      options.setLatestAttrUpdate(nextAttrUpdate);

      player.baseAttrs = options.cloneJson(data.baseAttrs);
      player.bonuses = options.cloneJson(data.bonuses);
      player.finalAttrs = options.cloneJson(data.finalAttrs);
      player.numericStats = options.cloneJson(data.numericStats);
      player.ratioDivisors = options.cloneJson(data.ratioDivisors);
      player.alchemySkill = options.cloneJson(data.alchemySkill ?? player.alchemySkill);
      player.gatherSkill = options.cloneJson(data.gatherSkill ?? player.gatherSkill);
      player.enhancementSkill = options.cloneJson(data.enhancementSkill ?? player.enhancementSkill);
      options.attrPanel.update(nextAttrUpdate);
    },
  };
}

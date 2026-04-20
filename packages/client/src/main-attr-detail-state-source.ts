import { NEXT_S2C_AttrDetail, NEXT_S2C_AttrUpdate, PlayerState } from '@mud/shared-next';
import type { SocketPanelSender } from './network/socket-send-panel';
import { AttrPanel } from './ui/panels/attr-panel';
/**
 * MainAttrDetailStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainAttrDetailStateSourceOptions = {
/**
 * attrPanel：attr面板相关字段。
 */

  attrPanel: Pick<AttrPanel, 'update'>;  
  /**
 * socket：socket相关字段。
 */

  socket: Pick<SocketPanelSender, 'sendRequestAttrDetail'>;  
  /**
 * getPlayer：玩家引用。
 */

  getPlayer: () => PlayerState | null;  
  /**
 * getLatestAttrUpdate：LatestAttrUpdate相关字段。
 */

  getLatestAttrUpdate: () => NEXT_S2C_AttrUpdate | null;  
  /**
 * setLatestAttrUpdate：LatestAttrUpdate相关字段。
 */

  setLatestAttrUpdate: (value: NEXT_S2C_AttrUpdate | null) => void;  
  /**
 * mergeAttrUpdatePatch：AttrUpdatePatch相关字段。
 */

  mergeAttrUpdatePatch: (current: NEXT_S2C_AttrUpdate | null, data: NEXT_S2C_AttrUpdate) => NEXT_S2C_AttrUpdate;  
  /**
 * cloneJson：Json相关字段。
 */

  cloneJson: <T>(value: T) => T;
};
/**
 * MainAttrDetailStateSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainAttrDetailStateSource = ReturnType<typeof createMainAttrDetailStateSource>;
/**
 * createMainAttrDetailStateSource：构建并返回目标对象。
 * @param options MainAttrDetailStateSourceOptions 选项参数。
 * @returns 无返回值，直接更新MainAttr详情状态来源相关状态。
 */


export function createMainAttrDetailStateSource(options: MainAttrDetailStateSourceOptions) {
  return {  
  /**
 * requestDetail：执行request详情相关逻辑。
 * @returns 无返回值，直接更新request详情相关状态。
 */

    requestDetail(): void {
      options.socket.sendRequestAttrDetail();
    },    
    /**
 * init：执行init相关逻辑。
 * @returns 无返回值，直接更新init相关状态。
 */


    init(): void {
      options.socket.sendRequestAttrDetail();
    },    
    /**
 * handleAttrDetail：处理Attr详情并更新相关状态。
 * @param data NEXT_S2C_AttrDetail 原始数据。
 * @returns 无返回值，直接更新Attr详情相关状态。
 */


    handleAttrDetail(data: NEXT_S2C_AttrDetail): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

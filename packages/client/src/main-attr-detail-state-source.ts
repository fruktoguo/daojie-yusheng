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

  attrPanel: Pick<AttrPanel, 'update' | 'setCallbacks' | 'applyDetail'>;  
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
  const source = {  
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
      // 按 main 口径，属性低频详情只在 tooltip 交互时按需请求。
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
      const detail = options.cloneJson(data);
      const latestAttrUpdate = options.getLatestAttrUpdate();
      const nextSpecialStats = latestAttrUpdate?.specialStats
        ? options.cloneJson(latestAttrUpdate.specialStats)
        : {
            foundation: Math.max(0, Math.floor(player.foundation ?? 0)),
            combatExp: Math.max(0, Math.floor(player.combatExp ?? 0)),
          };
      const nextAttrUpdateBase = options.mergeAttrUpdatePatch(latestAttrUpdate, {
        baseAttrs: options.cloneJson(detail.baseAttrs),
        bonuses: options.cloneJson(detail.bonuses),
        finalAttrs: options.cloneJson(detail.finalAttrs),
        numericStats: options.cloneJson(detail.numericStats),
        ratioDivisors: options.cloneJson(detail.ratioDivisors),
        specialStats: nextSpecialStats,
        alchemySkill: options.cloneJson(detail.alchemySkill ?? player.alchemySkill),
        gatherSkill: options.cloneJson(detail.gatherSkill ?? player.gatherSkill),
        enhancementSkill: options.cloneJson(detail.enhancementSkill ?? player.enhancementSkill),
      });
      const nextAttrUpdate: NEXT_S2C_AttrUpdate = {
        ...nextAttrUpdateBase,
        numericStatBreakdowns: options.cloneJson(detail.numericStatBreakdowns),
      };
      options.setLatestAttrUpdate(nextAttrUpdate);

      player.baseAttrs = options.cloneJson(detail.baseAttrs);
      player.bonuses = options.cloneJson(detail.bonuses);
      player.finalAttrs = options.cloneJson(detail.finalAttrs);
      player.numericStats = options.cloneJson(detail.numericStats);
      player.ratioDivisors = options.cloneJson(detail.ratioDivisors);
      player.alchemySkill = options.cloneJson(detail.alchemySkill ?? player.alchemySkill);
      player.gatherSkill = options.cloneJson(detail.gatherSkill ?? player.gatherSkill);
      player.enhancementSkill = options.cloneJson(detail.enhancementSkill ?? player.enhancementSkill);
      options.attrPanel.update(nextAttrUpdate);
      options.attrPanel.applyDetail(detail);
    },
  };
  options.attrPanel.setCallbacks({
    onRequestDetail: () => {
      source.requestDetail();
    },
  });
  return source;
}

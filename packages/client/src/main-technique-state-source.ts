import { PlayerState, TechniqueState } from '@mud/shared-next';
import type { SocketRuntimeSender } from './network/socket-send-runtime';
import { TechniquePanel } from './ui/panels/technique-panel';
/**
 * MainTechniqueStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainTechniqueStateSourceOptions = {
/**
 * techniquePanel：对象字段。
 */

  techniquePanel: Pick<TechniquePanel, 'setCallbacks' | 'initFromPlayer' | 'update' | 'syncDynamic' | 'clear'>;  
  /**
 * socket：对象字段。
 */

  socket: Pick<SocketRuntimeSender, 'sendCultivate'>;
};
/**
 * MainTechniqueStateSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainTechniqueStateSource = ReturnType<typeof createMainTechniqueStateSource>;
/**
 * createMainTechniqueStateSource：构建并返回目标对象。
 * @param options MainTechniqueStateSourceOptions 选项参数。
 * @returns 函数返回值。
 */


export function createMainTechniqueStateSource(options: MainTechniqueStateSourceOptions) {
  options.techniquePanel.setCallbacks((techId) => options.socket.sendCultivate(techId));

  return {  
  /**
 * initFromPlayer：初始化并准备运行时基础状态。
 * @param player PlayerState 玩家对象。
 * @returns void。
 */

    initFromPlayer(player: PlayerState): void {
      options.techniquePanel.initFromPlayer(player);
    },    
    /**
 * update：更新/写入相关状态。
 * @param techniques TechniqueState[] 参数说明。
 * @param cultivatingTechId string cultivatingTech ID。
 * @param player PlayerState 玩家对象。
 * @returns void。
 */


    update(techniques: TechniqueState[], cultivatingTechId?: string, player?: PlayerState): void {
      options.techniquePanel.update(techniques, cultivatingTechId, player);
    },    
    /**
 * syncDynamic：执行核心业务逻辑。
 * @param techniques TechniqueState[] 参数说明。
 * @param cultivatingTechId string cultivatingTech ID。
 * @param player PlayerState 玩家对象。
 * @returns void。
 */


    syncDynamic(techniques: TechniqueState[], cultivatingTechId?: string, player?: PlayerState): void {
      options.techniquePanel.syncDynamic(techniques, cultivatingTechId, player);
    },    
    /**
 * clear：执行核心业务逻辑。
 * @returns void。
 */


    clear(): void {
      options.techniquePanel.clear();
    },
  };
}

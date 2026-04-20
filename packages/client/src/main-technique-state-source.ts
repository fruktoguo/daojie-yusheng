import { PlayerState, TechniqueState } from '@mud/shared-next';
import type { SocketRuntimeSender } from './network/socket-send-runtime';
import { TechniquePanel } from './ui/panels/technique-panel';
/**
 * MainTechniqueStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainTechniqueStateSourceOptions = {
/**
 * techniquePanel：功法面板相关字段。
 */

  techniquePanel: Pick<TechniquePanel, 'setCallbacks' | 'initFromPlayer' | 'update' | 'syncDynamic' | 'clear'>;  
  /**
 * socket：socket相关字段。
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
 * @returns 无返回值，直接更新Main功法状态来源相关状态。
 */


export function createMainTechniqueStateSource(options: MainTechniqueStateSourceOptions) {
  options.techniquePanel.setCallbacks((techId) => options.socket.sendCultivate(techId));

  return {  
  /**
 * initFromPlayer：执行initFrom玩家相关逻辑。
 * @param player PlayerState 玩家对象。
 * @returns 无返回值，直接更新initFrom玩家相关状态。
 */

    initFromPlayer(player: PlayerState): void {
      options.techniquePanel.initFromPlayer(player);
    },    
    /**
 * update：处理update并更新相关状态。
 * @param techniques TechniqueState[] 参数说明。
 * @param cultivatingTechId string cultivatingTech ID。
 * @param player PlayerState 玩家对象。
 * @returns 无返回值，直接更新功法、标识、玩家相关状态。
 */


    update(techniques: TechniqueState[], cultivatingTechId?: string, player?: PlayerState): void {
      options.techniquePanel.update(techniques, cultivatingTechId, player);
    },    
    /**
 * syncDynamic：处理Dynamic并更新相关状态。
 * @param techniques TechniqueState[] 参数说明。
 * @param cultivatingTechId string cultivatingTech ID。
 * @param player PlayerState 玩家对象。
 * @returns 无返回值，直接更新Dynamic相关状态。
 */


    syncDynamic(techniques: TechniqueState[], cultivatingTechId?: string, player?: PlayerState): void {
      options.techniquePanel.syncDynamic(techniques, cultivatingTechId, player);
    },    
    /**
 * clear：执行clear相关逻辑。
 * @returns 无返回值，直接更新clear相关状态。
 */


    clear(): void {
      options.techniquePanel.clear();
    },
  };
}

import type {
  ActionDef,
  Inventory,
  NEXT_S2C_AttrUpdate,
  PlayerState,
  TechniqueState,
} from '@mud/shared-next';
import type { PanelCapabilities, PanelRuntimeState } from '../../ui/panel-system/types';
import { panelDataStore } from '../stores/panel-data-store';
import { shellStore } from '../stores/shell-store';

export const nextUiBridge = {
/**
 * syncMounted：执行核心业务逻辑。
 * @param mounted boolean 参数说明。
 * @returns void。
 */

  syncMounted(mounted: boolean): void {
    shellStore.patchState({ mounted });
  },  
  /**
 * syncEnabled：执行核心业务逻辑。
 * @param enabled boolean 参数说明。
 * @returns void。
 */


  syncEnabled(enabled: boolean): void {
    shellStore.patchState({ enabled });
  },  
  /**
 * syncRuntime：执行核心业务逻辑。
 * @param runtime PanelRuntimeState 参数说明。
 * @returns void。
 */


  syncRuntime(runtime: PanelRuntimeState): void {
    shellStore.patchState({ runtime: { ...runtime } });
  },  
  /**
 * syncCapabilities：执行核心业务逻辑。
 * @param capabilities PanelCapabilities 参数说明。
 * @returns void。
 */


  syncCapabilities(capabilities: PanelCapabilities): void {
    shellStore.patchState({
      capabilities: {
        ...capabilities,
        safeAreaInsets: { ...capabilities.safeAreaInsets },
      },
    });
  },  
  /**
 * syncPlayer：执行核心业务逻辑。
 * @param player PlayerState | null 玩家对象。
 * @returns void。
 */


  syncPlayer(player: PlayerState | null): void {
    panelDataStore.patchState({ player });
  },  
  /**
 * syncAttrUpdate：执行核心业务逻辑。
 * @param attrUpdate NEXT_S2C_AttrUpdate | null 参数说明。
 * @returns void。
 */


  syncAttrUpdate(attrUpdate: NEXT_S2C_AttrUpdate | null): void {
    panelDataStore.patchState({ attrUpdate });
  },  
  /**
 * syncInventory：执行核心业务逻辑。
 * @param inventory Inventory | null 参数说明。
 * @returns void。
 */


  syncInventory(inventory: Inventory | null): void {
    panelDataStore.patchState({ inventory });
  },  
  /**
 * syncEquipment：执行核心业务逻辑。
 * @param equipment PlayerState['equipment'] | null 参数说明。
 * @returns void。
 */


  syncEquipment(equipment: PlayerState['equipment'] | null): void {
    panelDataStore.patchState({ equipment });
  },  
  /**
 * syncTechniques：执行核心业务逻辑。
 * @param techniques TechniqueState[] 参数说明。
 * @param cultivatingTechId string | undefined cultivatingTech ID。
 * @returns void。
 */


  syncTechniques(
    techniques: TechniqueState[],
    cultivatingTechId: string | undefined,
  ): void {
    panelDataStore.patchState({
      techniques,
      cultivatingTechId,
    });
  },  
  /**
 * syncActions：执行核心业务逻辑。
 * @param actions ActionDef[] 参数说明。
 * @param autoBattle boolean 参数说明。
 * @param autoRetaliate boolean 参数说明。
 * @returns void。
 */


  syncActions(
    actions: ActionDef[],
    autoBattle: boolean,
    autoRetaliate: boolean,
  ): void {
    panelDataStore.patchState({
      actions,
      autoBattle,
      autoRetaliate,
    });
  },  
  /**
 * syncQuests：执行核心业务逻辑。
 * @param quests PlayerState['quests'] | null 参数说明。
 * @returns void。
 */


  syncQuests(quests: PlayerState['quests'] | null): void {
    panelDataStore.patchState({ quests });
  },  
  /**
 * reset：执行核心业务逻辑。
 * @returns void。
 */


  reset(): void {
    panelDataStore.setState({
      player: null,
      attrUpdate: null,
      inventory: null,
      equipment: null,
      techniques: [],
      cultivatingTechId: undefined,
      actions: [],
      autoBattle: false,
      autoRetaliate: true,
      quests: null,
    });
  },
};

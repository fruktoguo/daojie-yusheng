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
  syncMounted(mounted: boolean): void {
    shellStore.patchState({ mounted });
  },

  syncEnabled(enabled: boolean): void {
    shellStore.patchState({ enabled });
  },

  syncRuntime(runtime: PanelRuntimeState): void {
    shellStore.patchState({ runtime: { ...runtime } });
  },

  syncCapabilities(capabilities: PanelCapabilities): void {
    shellStore.patchState({
      capabilities: {
        ...capabilities,
        safeAreaInsets: { ...capabilities.safeAreaInsets },
      },
    });
  },

  syncPlayer(player: PlayerState | null): void {
    panelDataStore.patchState({ player });
  },

  syncAttrUpdate(attrUpdate: NEXT_S2C_AttrUpdate | null): void {
    panelDataStore.patchState({ attrUpdate });
  },

  syncInventory(inventory: Inventory | null): void {
    panelDataStore.patchState({ inventory });
  },

  syncEquipment(equipment: PlayerState['equipment'] | null): void {
    panelDataStore.patchState({ equipment });
  },

  syncTechniques(
    techniques: TechniqueState[],
    cultivatingTechId: string | undefined,
  ): void {
    panelDataStore.patchState({
      techniques,
      cultivatingTechId,
    });
  },

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

  syncQuests(quests: PlayerState['quests'] | null): void {
    panelDataStore.patchState({ quests });
  },

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

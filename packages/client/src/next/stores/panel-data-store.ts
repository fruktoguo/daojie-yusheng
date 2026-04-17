import type {
  ActionDef,
  Inventory,
  NEXT_S2C_AttrUpdate,
  PlayerState,
  TechniqueState,
} from '@mud/shared-next';
import { createExternalStore } from './create-external-store';

export interface NextUiPanelDataState {
  player: PlayerState | null;
  attrUpdate: NEXT_S2C_AttrUpdate | null;
  inventory: Inventory | null;
  equipment: PlayerState['equipment'] | null;
  techniques: TechniqueState[];
  cultivatingTechId: string | undefined;
  actions: ActionDef[];
  autoBattle: boolean;
  autoRetaliate: boolean;
  quests: PlayerState['quests'] | null;
}

export const panelDataStore = createExternalStore<NextUiPanelDataState>({
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

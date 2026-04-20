import type {
  ActionDef,
  Inventory,
  NEXT_S2C_AttrUpdate,
  PlayerState,
  TechniqueState,
} from '@mud/shared-next';
import { createExternalStore } from './create-external-store';
/**
 * NextUiPanelDataState：定义接口结构约束，明确可交付字段含义。
 */


export interface NextUiPanelDataState {
/**
 * player：NextUiPanelDataState 内部字段。
 */

  player: PlayerState | null;  
  /**
 * attrUpdate：NextUiPanelDataState 内部字段。
 */

  attrUpdate: NEXT_S2C_AttrUpdate | null;  
  /**
 * inventory：NextUiPanelDataState 内部字段。
 */

  inventory: Inventory | null;  
  /**
 * equipment：NextUiPanelDataState 内部字段。
 */

  equipment: PlayerState['equipment'] | null;  
  /**
 * techniques：NextUiPanelDataState 内部字段。
 */

  techniques: TechniqueState[];  
  /**
 * cultivatingTechId：NextUiPanelDataState 内部字段。
 */

  cultivatingTechId: string | undefined;  
  /**
 * actions：NextUiPanelDataState 内部字段。
 */

  actions: ActionDef[];  
  /**
 * autoBattle：NextUiPanelDataState 内部字段。
 */

  autoBattle: boolean;  
  /**
 * autoRetaliate：NextUiPanelDataState 内部字段。
 */

  autoRetaliate: boolean;  
  /**
 * quests：NextUiPanelDataState 内部字段。
 */

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

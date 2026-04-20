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
 * player：玩家引用。
 */

  player: PlayerState | null;  
  /**
 * attrUpdate：attrUpdate相关字段。
 */

  attrUpdate: NEXT_S2C_AttrUpdate | null;  
  /**
 * inventory：背包相关字段。
 */

  inventory: Inventory | null;  
  /**
 * equipment：装备相关字段。
 */

  equipment: PlayerState['equipment'] | null;  
  /**
 * techniques：功法相关字段。
 */

  techniques: TechniqueState[];  
  /**
 * cultivatingTechId：cultivatingTechID标识。
 */

  cultivatingTechId: string | undefined;  
  /**
 * actions：action相关字段。
 */

  actions: ActionDef[];  
  /**
 * autoBattle：autoBattle相关字段。
 */

  autoBattle: boolean;  
  /**
 * autoRetaliate：autoRetaliate相关字段。
 */

  autoRetaliate: boolean;  
  /**
 * quests：集合字段。
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

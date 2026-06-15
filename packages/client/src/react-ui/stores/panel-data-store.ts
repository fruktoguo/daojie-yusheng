/**
 * 本文件属于渐进式 React UI 层，负责壳层、桥接、覆盖层或前端 store 组合。
 *
 * 维护时要复用现有网络、运行态和样式 token，避免形成与 DOM UI 冲突的第二套业务真源。
 */
import type {
  ActionDef,
  Inventory,
  S2C_AttrUpdate,
  PlayerState,
  TechniqueState,
} from '@mud/shared';
import { createExternalStore } from './create-external-store';
/**
 * ReactUiPanelDataState：定义接口结构约束，明确可交付字段含义。
 */


export interface ReactUiPanelDataState {
/**
 * player：玩家引用。
 */

  player: PlayerState | null;
  /**
 * attrUpdate：attrUpdate相关字段。
 */

  attrUpdate: S2C_AttrUpdate | null;
  /**
 * inventory：背包相关字段。
 */

  inventory: Inventory | null;
  /**
 * equipment：装备相关字段。
 */

  equipment: PlayerState['equipment'] | null;
  /**
 * artifacts：法宝相关字段。
 */

  artifacts: PlayerState['artifacts'] | null;
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

export const panelDataStore = createExternalStore<ReactUiPanelDataState>({
  player: null,
  attrUpdate: null,
  inventory: null,
  equipment: null,
  artifacts: null,
  techniques: [],
  cultivatingTechId: undefined,
  actions: [],
  autoBattle: false,
  autoRetaliate: true,
  quests: null,
});

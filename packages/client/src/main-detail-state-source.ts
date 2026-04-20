import {
  LootWindowState,
  NEXT_S2C_AlchemyPanel,
  NEXT_S2C_AttrDetail,
  NEXT_S2C_Detail,
  NEXT_S2C_EnhancementPanel,
  NEXT_S2C_Leaderboard,
  NEXT_S2C_LootWindowUpdate,
  NEXT_S2C_NpcQuests,
  NEXT_S2C_NpcShop,
  NEXT_S2C_QuestNavigateResult,
  NEXT_S2C_QuestUpdate,
  NEXT_S2C_TileDetail,
  NEXT_S2C_WorldSummary,
} from '@mud/shared-next';
import { CraftWorkbenchModal } from './ui/craft-workbench-modal';
import { EntityDetailModal } from './ui/entity-detail-modal';
import { NpcShopModal } from './ui/npc-shop-modal';
import { LootPanel } from './ui/panels/loot-panel';
/**
 * MainDetailStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainDetailStateSourceOptions = {
/**
 * lootPanel：对象字段。
 */

  lootPanel: Pick<LootPanel, 'update'>;  
  /**
 * entityDetailModal：对象字段。
 */

  entityDetailModal: Pick<EntityDetailModal, 'updateDetail'>;  
  /**
 * craftWorkbenchModal：对象字段。
 */

  craftWorkbenchModal: Pick<CraftWorkbenchModal, 'updateAlchemy' | 'updateEnhancement'>;  
  /**
 * npcShopModal：对象字段。
 */

  npcShopModal: Pick<NpcShopModal, 'updateShop'>;  
  /**
 * hydrateLootWindowState：对象字段。
 */

  hydrateLootWindowState: (window: NEXT_S2C_LootWindowUpdate['window']) => LootWindowState | null;  
  /**
 * hydrateNpcShopResponse：对象字段。
 */

  hydrateNpcShopResponse: (data: NEXT_S2C_NpcShop) => Parameters<NpcShopModal['updateShop']>[0];  
  /**
 * handleAttrDetail：对象字段。
 */

  handleAttrDetail: (data: NEXT_S2C_AttrDetail) => void;  
  /**
 * handleLeaderboard：对象字段。
 */

  handleLeaderboard: (data: NEXT_S2C_Leaderboard) => void;  
  /**
 * handleWorldSummary：对象字段。
 */

  handleWorldSummary: (data: NEXT_S2C_WorldSummary) => void;  
  /**
 * handleNpcQuests：对象字段。
 */

  handleNpcQuests: (data: NEXT_S2C_NpcQuests) => void;  
  /**
 * handleQuestUpdate：对象字段。
 */

  handleQuestUpdate: (data: NEXT_S2C_QuestUpdate) => void;  
  /**
 * handleQuestNavigateResult：对象字段。
 */

  handleQuestNavigateResult: (data: NEXT_S2C_QuestNavigateResult) => void;  
  /**
 * handleTileDetailResult：对象字段。
 */

  handleTileDetailResult: (data: NEXT_S2C_TileDetail) => void;
};
/**
 * MainDetailStateSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainDetailStateSource = ReturnType<typeof createMainDetailStateSource>;
/**
 * createMainDetailStateSource：构建并返回目标对象。
 * @param options MainDetailStateSourceOptions 选项参数。
 * @returns 函数返回值。
 */


export function createMainDetailStateSource(options: MainDetailStateSourceOptions) {
  return {  
  /**
 * handleLootWindowUpdate：处理事件并驱动执行路径。
 * @param data NEXT_S2C_LootWindowUpdate 原始数据。
 * @returns void。
 */

    handleLootWindowUpdate(data: NEXT_S2C_LootWindowUpdate): void {
      options.lootPanel.update(options.hydrateLootWindowState(data.window));
    },    
    /**
 * handleTileDetail：处理事件并驱动执行路径。
 * @param data NEXT_S2C_TileDetail 原始数据。
 * @returns void。
 */


    handleTileDetail(data: NEXT_S2C_TileDetail): void {
      options.handleTileDetailResult(data);
    },    
    /**
 * handleDetail：处理事件并驱动执行路径。
 * @param data NEXT_S2C_Detail 原始数据。
 * @returns void。
 */


    handleDetail(data: NEXT_S2C_Detail): void {
      options.entityDetailModal.updateDetail(data);
    },    
    /**
 * handleAttrDetail：处理事件并驱动执行路径。
 * @param data NEXT_S2C_AttrDetail 原始数据。
 * @returns void。
 */


    handleAttrDetail(data: NEXT_S2C_AttrDetail): void {
      options.handleAttrDetail(data);
    },    
    /**
 * handleAlchemyPanel：处理事件并驱动执行路径。
 * @param data NEXT_S2C_AlchemyPanel 原始数据。
 * @returns void。
 */


    handleAlchemyPanel(data: NEXT_S2C_AlchemyPanel): void {
      options.craftWorkbenchModal.updateAlchemy(data);
    },    
    /**
 * handleEnhancementPanel：处理事件并驱动执行路径。
 * @param data NEXT_S2C_EnhancementPanel 原始数据。
 * @returns void。
 */


    handleEnhancementPanel(data: NEXT_S2C_EnhancementPanel): void {
      options.craftWorkbenchModal.updateEnhancement(data);
    },    
    /**
 * handleLeaderboard：处理事件并驱动执行路径。
 * @param data NEXT_S2C_Leaderboard 原始数据。
 * @returns void。
 */


    handleLeaderboard(data: NEXT_S2C_Leaderboard): void {
      options.handleLeaderboard(data);
    },    
    /**
 * handleWorldSummary：处理事件并驱动执行路径。
 * @param data NEXT_S2C_WorldSummary 原始数据。
 * @returns void。
 */


    handleWorldSummary(data: NEXT_S2C_WorldSummary): void {
      options.handleWorldSummary(data);
    },    
    /**
 * handleNpcQuests：处理事件并驱动执行路径。
 * @param data NEXT_S2C_NpcQuests 原始数据。
 * @returns void。
 */


    handleNpcQuests(data: NEXT_S2C_NpcQuests): void {
      options.handleNpcQuests(data);
    },    
    /**
 * handleQuests：处理事件并驱动执行路径。
 * @param data NEXT_S2C_QuestUpdate 原始数据。
 * @returns void。
 */


    handleQuests(data: NEXT_S2C_QuestUpdate): void {
      options.handleQuestUpdate(data);
    },    
    /**
 * handleQuestNavigateResult：处理事件并驱动执行路径。
 * @param data NEXT_S2C_QuestNavigateResult 原始数据。
 * @returns void。
 */


    handleQuestNavigateResult(data: NEXT_S2C_QuestNavigateResult): void {
      options.handleQuestNavigateResult(data);
    },    
    /**
 * handleNpcShop：处理事件并驱动执行路径。
 * @param data NEXT_S2C_NpcShop 原始数据。
 * @returns void。
 */


    handleNpcShop(data: NEXT_S2C_NpcShop): void {
      options.npcShopModal.updateShop(options.hydrateNpcShopResponse(data));
    },
  };
}

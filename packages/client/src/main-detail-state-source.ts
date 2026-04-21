import {
  LootWindowState,
  NEXT_S2C_AlchemyPanel,
  NEXT_S2C_AttrDetail,
  NEXT_S2C_Detail,
  NEXT_S2C_EnhancementPanel,
  NEXT_S2C_Leaderboard,
  NEXT_S2C_LeaderboardPlayerLocations,
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
import { applyTechniqueActivityPanelToWorkbench } from './technique-activity-client.helpers';
/**
 * MainDetailStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainDetailStateSourceOptions = {
/**
 * lootPanel：掉落面板相关字段。
 */

  lootPanel: Pick<LootPanel, 'update'>;  
  /**
 * entityDetailModal：entity详情弹层相关字段。
 */

  entityDetailModal: Pick<EntityDetailModal, 'updateDetail'>;  
  /**
 * craftWorkbenchModal：炼制Workbench弹层相关字段。
 */

  craftWorkbenchModal: Pick<CraftWorkbenchModal, 'updateAlchemy' | 'updateEnhancement'>;  
  /**
 * npcShopModal：NPCShop弹层相关字段。
 */

  npcShopModal: Pick<NpcShopModal, 'updateShop'>;  
  /**
 * hydrateLootWindowState：hydrate掉落窗口状态状态或数据块。
 */

  hydrateLootWindowState: (window: NEXT_S2C_LootWindowUpdate['window']) => LootWindowState | null;  
  /**
 * hydrateNpcShopResponse：hydrateNPCShopResponse相关字段。
 */

  hydrateNpcShopResponse: (data: NEXT_S2C_NpcShop) => Parameters<NpcShopModal['updateShop']>[0];  
  /**
 * handleAttrDetail：Attr详情状态或数据块。
 */

  handleAttrDetail: (data: NEXT_S2C_AttrDetail) => void;  
  /**
 * handleLeaderboard：Leaderboard相关字段。
 */

  handleLeaderboard: (data: NEXT_S2C_Leaderboard) => void;  
  /**
 * handleLeaderboardPlayerLocations：玩家击杀榜坐标追索结果。
 */

  handleLeaderboardPlayerLocations: (data: NEXT_S2C_LeaderboardPlayerLocations) => void;
  /**
 * handleWorldSummary：世界摘要状态或数据块。
 */

  handleWorldSummary: (data: NEXT_S2C_WorldSummary) => void;  
  /**
 * handleNpcQuests：集合字段。
 */

  handleNpcQuests: (data: NEXT_S2C_NpcQuests) => void;  
  /**
 * handleQuestUpdate：任务Update相关字段。
 */

  handleQuestUpdate: (data: NEXT_S2C_QuestUpdate) => void;  
  /**
 * handleQuestNavigateResult：任务Navigate结果相关字段。
 */

  handleQuestNavigateResult: (data: NEXT_S2C_QuestNavigateResult) => void;  
  /**
 * handleTileDetailResult：Tile详情结果相关字段。
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
 * @returns 无返回值，直接更新Main详情状态来源相关状态。
 */


export function createMainDetailStateSource(options: MainDetailStateSourceOptions) {
  return {  
  /**
 * handleLootWindowUpdate：处理掉落窗口Update并更新相关状态。
 * @param data NEXT_S2C_LootWindowUpdate 原始数据。
 * @returns 无返回值，直接更新掉落窗口Update相关状态。
 */

    handleLootWindowUpdate(data: NEXT_S2C_LootWindowUpdate): void {
      options.lootPanel.update(options.hydrateLootWindowState(data.window));
    },    
    /**
 * handleTileDetail：处理Tile详情并更新相关状态。
 * @param data NEXT_S2C_TileDetail 原始数据。
 * @returns 无返回值，直接更新Tile详情相关状态。
 */


    handleTileDetail(data: NEXT_S2C_TileDetail): void {
      options.handleTileDetailResult(data);
    },    
    /**
 * handleDetail：处理详情并更新相关状态。
 * @param data NEXT_S2C_Detail 原始数据。
 * @returns 无返回值，直接更新详情相关状态。
 */


    handleDetail(data: NEXT_S2C_Detail): void {
      options.entityDetailModal.updateDetail(data);
    },    
    /**
 * handleAttrDetail：处理Attr详情并更新相关状态。
 * @param data NEXT_S2C_AttrDetail 原始数据。
 * @returns 无返回值，直接更新Attr详情相关状态。
 */


    handleAttrDetail(data: NEXT_S2C_AttrDetail): void {
      options.handleAttrDetail(data);
    },    
    /**
 * handleAlchemyPanel：处理炼丹面板并更新相关状态。
 * @param data NEXT_S2C_AlchemyPanel 原始数据。
 * @returns 无返回值，直接更新炼丹面板相关状态。
 */


    handleAlchemyPanel(data: NEXT_S2C_AlchemyPanel): void {
      applyTechniqueActivityPanelToWorkbench(options.craftWorkbenchModal, 'alchemy', data);
    },    
    /**
 * handleEnhancementPanel：处理强化面板并更新相关状态。
 * @param data NEXT_S2C_EnhancementPanel 原始数据。
 * @returns 无返回值，直接更新强化面板相关状态。
 */


    handleEnhancementPanel(data: NEXT_S2C_EnhancementPanel): void {
      applyTechniqueActivityPanelToWorkbench(options.craftWorkbenchModal, 'enhancement', data);
    },    
    /**
 * handleLeaderboard：处理Leaderboard并更新相关状态。
 * @param data NEXT_S2C_Leaderboard 原始数据。
 * @returns 无返回值，直接更新Leaderboard相关状态。
 */


    handleLeaderboard(data: NEXT_S2C_Leaderboard): void {
      options.handleLeaderboard(data);
    },    
    /**
 * handleLeaderboardPlayerLocations：处理玩家击杀榜坐标追索结果并更新相关状态。
 * @param data NEXT_S2C_LeaderboardPlayerLocations 原始数据。
 * @returns 无返回值，直接更新玩家击杀榜坐标追索结果相关状态。
 */

    handleLeaderboardPlayerLocations(data: NEXT_S2C_LeaderboardPlayerLocations): void {
      options.handleLeaderboardPlayerLocations(data);
    },    
    /**
 * handleWorldSummary：处理世界摘要并更新相关状态。
 * @param data NEXT_S2C_WorldSummary 原始数据。
 * @returns 无返回值，直接更新世界摘要相关状态。
 */


    handleWorldSummary(data: NEXT_S2C_WorldSummary): void {
      options.handleWorldSummary(data);
    },    
    /**
 * handleNpcQuests：处理NPC任务并更新相关状态。
 * @param data NEXT_S2C_NpcQuests 原始数据。
 * @returns 无返回值，直接更新NPC任务相关状态。
 */


    handleNpcQuests(data: NEXT_S2C_NpcQuests): void {
      options.handleNpcQuests(data);
    },    
    /**
 * handleQuests：处理任务并更新相关状态。
 * @param data NEXT_S2C_QuestUpdate 原始数据。
 * @returns 无返回值，直接更新任务相关状态。
 */


    handleQuests(data: NEXT_S2C_QuestUpdate): void {
      options.handleQuestUpdate(data);
    },    
    /**
 * handleQuestNavigateResult：处理任务Navigate结果并更新相关状态。
 * @param data NEXT_S2C_QuestNavigateResult 原始数据。
 * @returns 无返回值，直接更新任务Navigate结果相关状态。
 */


    handleQuestNavigateResult(data: NEXT_S2C_QuestNavigateResult): void {
      options.handleQuestNavigateResult(data);
    },    
    /**
 * handleNpcShop：处理NPCShop并更新相关状态。
 * @param data NEXT_S2C_NpcShop 原始数据。
 * @returns 无返回值，直接更新NPCShop相关状态。
 */


    handleNpcShop(data: NEXT_S2C_NpcShop): void {
      options.npcShopModal.updateShop(options.hydrateNpcShopResponse(data));
    },
  };
}

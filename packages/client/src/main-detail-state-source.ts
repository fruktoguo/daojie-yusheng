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

type MainDetailStateSourceOptions = {
  lootPanel: Pick<LootPanel, 'update'>;
  entityDetailModal: Pick<EntityDetailModal, 'updateDetail'>;
  craftWorkbenchModal: Pick<CraftWorkbenchModal, 'updateAlchemy' | 'updateEnhancement'>;
  npcShopModal: Pick<NpcShopModal, 'updateShop'>;
  hydrateLootWindowState: (window: NEXT_S2C_LootWindowUpdate['window']) => LootWindowState | null;
  hydrateNpcShopResponse: (data: NEXT_S2C_NpcShop) => Parameters<NpcShopModal['updateShop']>[0];
  handleAttrDetail: (data: NEXT_S2C_AttrDetail) => void;
  handleLeaderboard: (data: NEXT_S2C_Leaderboard) => void;
  handleWorldSummary: (data: NEXT_S2C_WorldSummary) => void;
  handleNpcQuests: (data: NEXT_S2C_NpcQuests) => void;
  handleQuestUpdate: (data: NEXT_S2C_QuestUpdate) => void;
  handleQuestNavigateResult: (data: NEXT_S2C_QuestNavigateResult) => void;
  handleTileDetailResult: (data: NEXT_S2C_TileDetail) => void;
};

export type MainDetailStateSource = ReturnType<typeof createMainDetailStateSource>;

export function createMainDetailStateSource(options: MainDetailStateSourceOptions) {
  return {
    handleLootWindowUpdate(data: NEXT_S2C_LootWindowUpdate): void {
      options.lootPanel.update(options.hydrateLootWindowState(data.window));
    },

    handleTileDetail(data: NEXT_S2C_TileDetail): void {
      options.handleTileDetailResult(data);
    },

    handleDetail(data: NEXT_S2C_Detail): void {
      options.entityDetailModal.updateDetail(data);
    },

    handleAttrDetail(data: NEXT_S2C_AttrDetail): void {
      options.handleAttrDetail(data);
    },

    handleAlchemyPanel(data: NEXT_S2C_AlchemyPanel): void {
      options.craftWorkbenchModal.updateAlchemy(data);
    },

    handleEnhancementPanel(data: NEXT_S2C_EnhancementPanel): void {
      options.craftWorkbenchModal.updateEnhancement(data);
    },

    handleLeaderboard(data: NEXT_S2C_Leaderboard): void {
      options.handleLeaderboard(data);
    },

    handleWorldSummary(data: NEXT_S2C_WorldSummary): void {
      options.handleWorldSummary(data);
    },

    handleNpcQuests(data: NEXT_S2C_NpcQuests): void {
      options.handleNpcQuests(data);
    },

    handleQuests(data: NEXT_S2C_QuestUpdate): void {
      options.handleQuestUpdate(data);
    },

    handleQuestNavigateResult(data: NEXT_S2C_QuestNavigateResult): void {
      options.handleQuestNavigateResult(data);
    },

    handleNpcShop(data: NEXT_S2C_NpcShop): void {
      options.npcShopModal.updateShop(options.hydrateNpcShopResponse(data));
    },
  };
}

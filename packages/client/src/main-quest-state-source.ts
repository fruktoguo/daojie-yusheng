import {
  Inventory,
  NEXT_S2C_NpcQuests,
  NEXT_S2C_QuestNavigateResult,
  NEXT_S2C_QuestUpdate,
  PlayerState,
} from '@mud/shared-next';
import { NpcQuestModal } from './ui/npc-quest-modal';
import { QuestPanel } from './ui/panels/quest-panel';

type MainQuestStateSourceOptions = {
  questPanel: QuestPanel;
  npcQuestModal: NpcQuestModal;
  clearCurrentPath: () => void;
  sendNavigateQuest: (questId: string) => void;
  sendRequestQuests: () => void;
  sendRequestNpcQuests: (npcId: string) => void;
  sendAcceptNpcQuest: (npcId: string, questId: string) => void;
  sendSubmitNpcQuest: (npcId: string, questId: string) => void;
  syncQuestBridgeState: (quests: PlayerState['quests'] | null) => void;
  syncPlayerBridgeState: (player: PlayerState | null) => void;
  refreshUiChrome: () => void;
};

export type MainQuestStateSource = ReturnType<typeof createMainQuestStateSource>;

export function createMainQuestStateSource(options: MainQuestStateSourceOptions) {
  let pendingQuestNavigateId: string | null = null;

  const syncMapId = (mapId?: string): void => {
    options.questPanel.setCurrentMapId(mapId);
    options.npcQuestModal.setCurrentMapId(mapId);
  };

  const navigateToQuest = (questId: string): void => {
    options.clearCurrentPath();
    pendingQuestNavigateId = questId;
    options.sendNavigateQuest(questId);
  };

  options.questPanel.setCallbacks(navigateToQuest);
  options.npcQuestModal.setCallbacks({
    onRequestQuests: (npcId) => options.sendRequestNpcQuests(npcId),
    onAcceptQuest: (npcId, questId) => options.sendAcceptNpcQuest(npcId, questId),
    onSubmitQuest: (npcId, questId) => options.sendSubmitNpcQuest(npcId, questId),
    onNavigateQuest: navigateToQuest,
  });

  return {
    syncBootstrapQuestState(player: PlayerState): void {
      options.syncQuestBridgeState(player.quests ?? null);
    },

    initFromPlayer(player: PlayerState): void {
      options.questPanel.initFromPlayer(player);
      options.sendRequestQuests();
      options.npcQuestModal.initFromPlayer(player);
    },

    syncMapId(mapId?: string): void {
      syncMapId(mapId);
    },

    syncInventory(inventory: Inventory): void {
      options.questPanel.syncInventory(inventory);
    },

    handleNpcQuests(data: NEXT_S2C_NpcQuests): void {
      options.npcQuestModal.updateQuests(data);
    },

    handleQuestUpdate(data: NEXT_S2C_QuestUpdate, player: PlayerState | null): void {
      if (player) {
        player.quests = data.quests;
      }
      syncMapId(player?.mapId);
      options.questPanel.update(data.quests);
      if (options.npcQuestModal.getActiveNpcId()) {
        options.npcQuestModal.refreshActive();
      }
      options.syncQuestBridgeState(data.quests);
      options.syncPlayerBridgeState(player);
      options.refreshUiChrome();
    },

    handleQuestNavigateResult(data: NEXT_S2C_QuestNavigateResult): void {
      if (pendingQuestNavigateId !== data.questId) {
        return;
      }
      pendingQuestNavigateId = null;
      if (!data.ok) {
        return;
      }
      options.questPanel.closeDetail();
    },

    clear(): void {
      pendingQuestNavigateId = null;
      options.questPanel.clear();
      options.npcQuestModal.clear();
      options.syncQuestBridgeState(null);
    },
  };
}

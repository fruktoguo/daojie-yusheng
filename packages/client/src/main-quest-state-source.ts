import {
  Inventory,
  NEXT_S2C_NpcQuests,
  NEXT_S2C_QuestNavigateResult,
  NEXT_S2C_QuestUpdate,
  PlayerState,
} from '@mud/shared-next';
import { NpcQuestModal } from './ui/npc-quest-modal';
import { QuestPanel } from './ui/panels/quest-panel';
/**
 * MainQuestStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainQuestStateSourceOptions = {
/**
 * questPanel：对象字段。
 */

  questPanel: QuestPanel;  
  /**
 * npcQuestModal：对象字段。
 */

  npcQuestModal: NpcQuestModal;  
  /**
 * clearCurrentPath：对象字段。
 */

  clearCurrentPath: () => void;  
  /**
 * sendNavigateQuest：对象字段。
 */

  sendNavigateQuest: (questId: string) => void;  
  /**
 * sendRequestQuests：对象字段。
 */

  sendRequestQuests: () => void;  
  /**
 * sendRequestNpcQuests：对象字段。
 */

  sendRequestNpcQuests: (npcId: string) => void;  
  /**
 * sendAcceptNpcQuest：对象字段。
 */

  sendAcceptNpcQuest: (npcId: string, questId: string) => void;  
  /**
 * sendSubmitNpcQuest：对象字段。
 */

  sendSubmitNpcQuest: (npcId: string, questId: string) => void;  
  /**
 * syncQuestBridgeState：对象字段。
 */

  syncQuestBridgeState: (quests: PlayerState['quests'] | null) => void;  
  /**
 * syncPlayerBridgeState：对象字段。
 */

  syncPlayerBridgeState: (player: PlayerState | null) => void;  
  /**
 * refreshUiChrome：对象字段。
 */

  refreshUiChrome: () => void;
};
/**
 * MainQuestStateSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainQuestStateSource = ReturnType<typeof createMainQuestStateSource>;
/**
 * createMainQuestStateSource：构建并返回目标对象。
 * @param options MainQuestStateSourceOptions 选项参数。
 * @returns 函数返回值。
 */


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
  /**
 * syncBootstrapQuestState：执行核心业务逻辑。
 * @param player PlayerState 玩家对象。
 * @returns void。
 */

    syncBootstrapQuestState(player: PlayerState): void {
      options.syncQuestBridgeState(player.quests ?? null);
    },    
    /**
 * initFromPlayer：初始化并准备运行时基础状态。
 * @param player PlayerState 玩家对象。
 * @returns void。
 */


    initFromPlayer(player: PlayerState): void {
      options.questPanel.initFromPlayer(player);
      options.sendRequestQuests();
      options.npcQuestModal.initFromPlayer(player);
    },    
    /**
 * syncMapId：执行核心业务逻辑。
 * @param mapId string 地图 ID。
 * @returns void。
 */


    syncMapId(mapId?: string): void {
      syncMapId(mapId);
    },    
    /**
 * syncInventory：执行核心业务逻辑。
 * @param inventory Inventory 参数说明。
 * @returns void。
 */


    syncInventory(inventory: Inventory): void {
      options.questPanel.syncInventory(inventory);
    },    
    /**
 * handleNpcQuests：处理事件并驱动执行路径。
 * @param data NEXT_S2C_NpcQuests 原始数据。
 * @returns void。
 */


    handleNpcQuests(data: NEXT_S2C_NpcQuests): void {
      options.npcQuestModal.updateQuests(data);
    },    
    /**
 * handleQuestUpdate：处理事件并驱动执行路径。
 * @param data NEXT_S2C_QuestUpdate 原始数据。
 * @param player PlayerState | null 玩家对象。
 * @returns void。
 */


    handleQuestUpdate(data: NEXT_S2C_QuestUpdate, player: PlayerState | null): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * handleQuestNavigateResult：处理事件并驱动执行路径。
 * @param data NEXT_S2C_QuestNavigateResult 原始数据。
 * @returns void。
 */


    handleQuestNavigateResult(data: NEXT_S2C_QuestNavigateResult): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      if (pendingQuestNavigateId !== data.questId) {
        return;
      }
      pendingQuestNavigateId = null;
      if (!data.ok) {
        return;
      }
      options.questPanel.closeDetail();
    },    
    /**
 * clear：执行核心业务逻辑。
 * @returns void。
 */


    clear(): void {
      pendingQuestNavigateId = null;
      options.questPanel.clear();
      options.npcQuestModal.clear();
      options.syncQuestBridgeState(null);
    },
  };
}

import {
  Inventory,
  PlayerState,
  S2C_NpcQuests,
  S2C_QuestNavigateResult,
  S2C_QuestUpdate,
} from '@mud/shared';
import { resolvePreviewQuests } from './content/local-templates';
import { NpcQuestModal } from './ui/npc-quest-modal';
import { QuestPanel } from './ui/panels/quest-panel';
/**
 * MainQuestStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainQuestStateSourceOptions = {
/**
 * questPanel：任务面板相关字段。
 */

  questPanel: QuestPanel;  
  /**
 * npcQuestModal：NPC任务弹层相关字段。
 */

  npcQuestModal: NpcQuestModal;  
  /**
 * clearCurrentPath：clearCurrent路径相关字段。
 */

  clearCurrentPath: () => void;  
  /**
 * setCurrentPathCells：set当前路径Cell相关字段。
 */

  setCurrentPathCells: (cells: Array<{ x: number; y: number }>) => void;  
  /**
 * sendNavigateQuest：sendNavigate任务相关字段。
 */

  sendNavigateQuest: (questId: string) => void;  
  /**
 * sendRequestQuests：集合字段。
 */

  sendRequestQuests: () => void;  
  /**
 * sendRequestNpcQuests：集合字段。
 */

  sendRequestNpcQuests: (npcId: string) => void;  
  /**
 * sendAcceptNpcQuest：sendAcceptNPC任务相关字段。
 */

  sendAcceptNpcQuest: (npcId: string, questId: string) => void;  
  /**
 * sendSubmitNpcQuest：sendSubmitNPC任务相关字段。
 */

  sendSubmitNpcQuest: (npcId: string, questId: string) => void;  
  /**
 * syncQuestBridgeState：任务桥接状态状态或数据块。
 */

  syncQuestBridgeState: (quests: PlayerState['quests'] | null) => void;  
  /**
 * syncPlayerBridgeState：玩家桥接状态状态或数据块。
 */

  syncPlayerBridgeState: (player: PlayerState | null) => void;  
  /**
 * refreshUiChrome：refreshUiChrome相关字段。
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
 * @returns 无返回值，直接更新Main任务状态来源相关状态。
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
 * syncBootstrapQuestState：处理引导任务状态并更新相关状态。
 * @param player PlayerState 玩家对象。
 * @returns 无返回值，直接更新Bootstrap任务状态相关状态。
 */

    syncBootstrapQuestState(player: PlayerState): void {
      options.syncQuestBridgeState(player.quests ?? null);
    },    
    /**
 * initFromPlayer：执行initFrom玩家相关逻辑。
 * @param player PlayerState 玩家对象。
 * @returns 无返回值，直接更新initFrom玩家相关状态。
 */


    initFromPlayer(player: PlayerState): void {
      options.questPanel.initFromPlayer(player);
      options.sendRequestQuests();
      options.npcQuestModal.initFromPlayer(player);
    },    
    /**
 * syncMapId：处理地图ID并更新相关状态。
 * @param mapId string 地图 ID。
 * @returns 无返回值，直接更新地图ID相关状态。
 */


    syncMapId(mapId?: string): void {
      syncMapId(mapId);
    },    
    /**
 * syncInventory：处理背包并更新相关状态。
 * @param inventory Inventory 参数说明。
 * @returns 无返回值，直接更新背包相关状态。
 */


    syncInventory(inventory: Inventory): void {
      options.questPanel.syncInventory(inventory);
    },    
    /**
 * handleNpcQuests：处理NPC任务并更新相关状态。
 * @param data S2C_NpcQuests 原始数据。
 * @returns 无返回值，直接更新NPC任务相关状态。
 */


    handleNpcQuests(data: S2C_NpcQuests): void {
      if (!options.npcQuestModal.getActiveNpcId()) {
        return;
      }
      options.npcQuestModal.updateQuests({
        ...data,
        quests: resolvePreviewQuests(data.quests as PlayerState['quests']),
      });
    },    
    /**
 * handleQuestUpdate：处理任务Update并更新相关状态。
 * @param data S2C_QuestUpdate 原始数据。
 * @param player PlayerState | null 玩家对象。
 * @returns 无返回值，直接更新任务Update相关状态。
 */


    handleQuestUpdate(data: S2C_QuestUpdate, player: PlayerState | null): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      if (player) {
        player.quests = resolvePreviewQuests(data.quests as PlayerState['quests']);
      }
      syncMapId(player?.mapId);
      const quests = player?.quests ?? resolvePreviewQuests(data.quests as PlayerState['quests']);
      options.questPanel.update(quests);
      if (options.npcQuestModal.getActiveNpcId()) {
        options.npcQuestModal.refreshActive();
      }
      options.syncQuestBridgeState(quests);
      options.syncPlayerBridgeState(player);
      options.refreshUiChrome();
    },    
    /**
 * handleQuestNavigateResult：处理任务Navigate结果并更新相关状态。
 * @param data S2C_QuestNavigateResult 原始数据。
 * @returns 无返回值，直接更新任务Navigate结果相关状态。
 */


    handleQuestNavigateResult(data: S2C_QuestNavigateResult): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      if (pendingQuestNavigateId !== data.questId) {
        return;
      }
      pendingQuestNavigateId = null;
      if (!data.ok) {
        return;
      }
      if (Array.isArray(data.path)) {
        options.setCurrentPathCells(data.path.map(([x, y]) => ({ x, y })));
      }
      options.questPanel.closeDetail();
    },    
    /**
 * clear：执行clear相关逻辑。
 * @returns 无返回值，直接更新clear相关状态。
 */


    clear(): void {
      pendingQuestNavigateId = null;
      options.questPanel.clear();
      options.npcQuestModal.clear();
      options.syncQuestBridgeState(null);
    },
  };
}

/**
 * MainResetStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */
type MainResetStateSourceOptions = {
/**
 * clearRuntimeState：对象字段。
 */

  clearRuntimeState: () => void;  
  /**
 * syncEstimatedServerTick：对象字段。
 */

  syncEstimatedServerTick: (value: number | null) => void;  
  /**
 * syncCurrentTimeState：对象字段。
 */

  syncCurrentTimeState: (value: null) => void;  
  /**
 * clearCurrentPath：对象字段。
 */

  clearCurrentPath: () => void;  
  /**
 * clearTechniqueMap：对象字段。
 */

  clearTechniqueMap: () => void;  
  /**
 * clearActionMap：对象字段。
 */

  clearActionMap: () => void;  
  /**
 * clearObservedEntities：对象字段。
 */

  clearObservedEntities: () => void;  
  /**
 * clearTargetingState：对象字段。
 */

  clearTargetingState: () => void;  
  /**
 * hideObserveModal：对象字段。
 */

  hideObserveModal: () => void;  
  /**
 * syncTargetingOverlay：对象字段。
 */

  syncTargetingOverlay: () => void;  
  /**
 * hideSidePanel：对象字段。
 */

  hideSidePanel: () => void;  
  /**
 * hideChat：对象字段。
 */

  hideChat: () => void;  
  /**
 * clearChatPersistenceScope：对象字段。
 */

  clearChatPersistenceScope: () => void;  
  /**
 * hideDebugPanel：对象字段。
 */

  hideDebugPanel: () => void;  
  /**
 * clearAttrPanel：对象字段。
 */

  clearAttrPanel: () => void;  
  /**
 * clearInventoryState：对象字段。
 */

  clearInventoryState: () => void;  
  /**
 * clearEquipmentPanel：对象字段。
 */

  clearEquipmentPanel: () => void;  
  /**
 * clearTechniqueState：对象字段。
 */

  clearTechniqueState: () => void;  
  /**
 * clearQuestState：对象字段。
 */

  clearQuestState: () => void;  
  /**
 * clearActionState：对象字段。
 */

  clearActionState: () => void;  
  /**
 * clearEntityDetailModal：对象字段。
 */

  clearEntityDetailModal: () => void;  
  /**
 * clearWorldSummaryState：对象字段。
 */

  clearWorldSummaryState: () => void;  
  /**
 * clearLootPanel：对象字段。
 */

  clearLootPanel: () => void;  
  /**
 * clearWorldPanel：对象字段。
 */

  clearWorldPanel: () => void;  
  /**
 * clearMailState：对象字段。
 */

  clearMailState: () => void;  
  /**
 * clearSuggestionState：对象字段。
 */

  clearSuggestionState: () => void;  
  /**
 * resetMapRuntime：对象字段。
 */

  resetMapRuntime: () => void;  
  /**
 * resetNextUiBridge：对象字段。
 */

  resetNextUiBridge: () => void;  
  /**
 * resetPanelRuntime：对象字段。
 */

  resetPanelRuntime: () => void;  
  /**
 * resizeCanvas：对象字段。
 */

  resizeCanvas: () => void;  
  /**
 * hideHud：对象字段。
 */

  hideHud: () => void;
};
/**
 * MainResetStateSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainResetStateSource = ReturnType<typeof createMainResetStateSource>;
/**
 * createMainResetStateSource：构建并返回目标对象。
 * @param options MainResetStateSourceOptions 选项参数。
 * @returns 函数返回值。
 */


export function createMainResetStateSource(options: MainResetStateSourceOptions) {
  return {  
  /**
 * reset：执行核心业务逻辑。
 * @returns void。
 */

    reset(): void {
      options.clearRuntimeState();
      options.syncEstimatedServerTick(null);
      options.syncCurrentTimeState(null);
      options.clearCurrentPath();
      options.clearTechniqueMap();
      options.clearActionMap();
      options.clearObservedEntities();
      options.clearTargetingState();
      options.hideObserveModal();
      options.syncTargetingOverlay();
      options.hideSidePanel();
      options.hideChat();
      options.clearChatPersistenceScope();
      options.hideDebugPanel();
      options.clearAttrPanel();
      options.clearInventoryState();
      options.clearEquipmentPanel();
      options.clearTechniqueState();
      options.clearQuestState();
      options.clearActionState();
      options.clearEntityDetailModal();
      options.clearWorldSummaryState();
      options.clearLootPanel();
      options.clearWorldPanel();
      options.clearMailState();
      options.clearSuggestionState();
      options.resetMapRuntime();
      options.resetNextUiBridge();
      options.resetPanelRuntime();
      options.resizeCanvas();
      options.hideHud();
    },
  };
}

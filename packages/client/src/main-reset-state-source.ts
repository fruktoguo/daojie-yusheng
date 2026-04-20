/**
 * MainResetStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */
type MainResetStateSourceOptions = {
/**
 * clearRuntimeState：clear运行态状态状态或数据块。
 */

  clearRuntimeState: () => void;  
  /**
 * syncEstimatedServerTick：EstimatedServertick相关字段。
 */

  syncEstimatedServerTick: (value: number | null) => void;  
  /**
 * syncCurrentTimeState：Current时间状态状态或数据块。
 */

  syncCurrentTimeState: (value: null) => void;  
  /**
 * clearCurrentPath：clearCurrent路径相关字段。
 */

  clearCurrentPath: () => void;  
  /**
 * clearTechniqueMap：缓存或索引容器。
 */

  clearTechniqueMap: () => void;  
  /**
 * clearActionMap：缓存或索引容器。
 */

  clearActionMap: () => void;  
  /**
 * clearObservedEntities：clearObservedEntity相关字段。
 */

  clearObservedEntities: () => void;  
  /**
 * clearTargetingState：clearTargeting状态状态或数据块。
 */

  clearTargetingState: () => void;  
  /**
 * hideObserveModal：hideObserve弹层相关字段。
 */

  hideObserveModal: () => void;  
  /**
 * syncTargetingOverlay：TargetingOverlay相关字段。
 */

  syncTargetingOverlay: () => void;  
  /**
 * hideSidePanel：hideSide面板相关字段。
 */

  hideSidePanel: () => void;  
  /**
 * hideChat：hideChat相关字段。
 */

  hideChat: () => void;  
  /**
 * clearChatPersistenceScope：clearChatPersistenceScope相关字段。
 */

  clearChatPersistenceScope: () => void;  
  /**
 * hideDebugPanel：hideDebug面板相关字段。
 */

  hideDebugPanel: () => void;  
  /**
 * clearAttrPanel：clearAttr面板相关字段。
 */

  clearAttrPanel: () => void;  
  /**
 * clearInventoryState：clear背包状态状态或数据块。
 */

  clearInventoryState: () => void;  
  /**
 * clearEquipmentPanel：clear装备面板相关字段。
 */

  clearEquipmentPanel: () => void;  
  /**
 * clearTechniqueState：clear功法状态状态或数据块。
 */

  clearTechniqueState: () => void;  
  /**
 * clearQuestState：clear任务状态状态或数据块。
 */

  clearQuestState: () => void;  
  /**
 * clearActionState：clearAction状态状态或数据块。
 */

  clearActionState: () => void;  
  /**
 * clearEntityDetailModal：clearEntity详情弹层相关字段。
 */

  clearEntityDetailModal: () => void;  
  /**
 * clearWorldSummaryState：clear世界摘要状态状态或数据块。
 */

  clearWorldSummaryState: () => void;  
  /**
 * clearLootPanel：clear掉落面板相关字段。
 */

  clearLootPanel: () => void;  
  /**
 * clearWorldPanel：clear世界面板相关字段。
 */

  clearWorldPanel: () => void;  
  /**
 * clearMailState：clear邮件状态状态或数据块。
 */

  clearMailState: () => void;  
  /**
 * clearSuggestionState：clearSuggestion状态状态或数据块。
 */

  clearSuggestionState: () => void;  
  /**
 * resetMapRuntime：reset地图运行态引用。
 */

  resetMapRuntime: () => void;  
  /**
 * resetNextUiBridge：resetNextUi桥接引用。
 */

  resetNextUiBridge: () => void;  
  /**
 * resetPanelRuntime：reset面板运行态引用。
 */

  resetPanelRuntime: () => void;  
  /**
 * resizeCanvas：resizeCanva相关字段。
 */

  resizeCanvas: () => void;  
  /**
 * hideHud：hideHud相关字段。
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
 * @returns 无返回值，直接更新MainReset状态来源相关状态。
 */


export function createMainResetStateSource(options: MainResetStateSourceOptions) {
  return {  
  /**
 * reset：执行reset相关逻辑。
 * @returns 无返回值，直接更新reset相关状态。
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

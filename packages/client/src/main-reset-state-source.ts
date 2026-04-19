type MainResetStateSourceOptions = {
  clearRuntimeState: () => void;
  syncEstimatedServerTick: (value: number | null) => void;
  syncCurrentTimeState: (value: null) => void;
  clearCurrentPath: () => void;
  clearTechniqueMap: () => void;
  clearActionMap: () => void;
  clearObservedEntities: () => void;
  clearTargetingState: () => void;
  hideObserveModal: () => void;
  syncTargetingOverlay: () => void;
  hideSidePanel: () => void;
  hideChat: () => void;
  clearChatPersistenceScope: () => void;
  hideDebugPanel: () => void;
  clearAttrPanel: () => void;
  clearInventoryState: () => void;
  clearEquipmentPanel: () => void;
  clearTechniqueState: () => void;
  clearQuestState: () => void;
  clearActionState: () => void;
  clearEntityDetailModal: () => void;
  clearWorldSummaryState: () => void;
  clearLootPanel: () => void;
  clearWorldPanel: () => void;
  clearMailState: () => void;
  clearSuggestionState: () => void;
  resetMapRuntime: () => void;
  resetNextUiBridge: () => void;
  resetPanelRuntime: () => void;
  resizeCanvas: () => void;
  hideHud: () => void;
};

export type MainResetStateSource = ReturnType<typeof createMainResetStateSource>;

export function createMainResetStateSource(options: MainResetStateSourceOptions) {
  return {
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

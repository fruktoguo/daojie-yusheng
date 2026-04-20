import { syncEstimatedServerTick } from './runtime/server-tick';
import { resolvePreviewTechniques } from './content/local-templates';
import { FloatingTooltip } from './ui/floating-tooltip';
import { refreshHeavenGateModal } from './ui/heaven-gate-modal';
import { getDisplayRangeX, getDisplayRangeY } from './display';
import { nextUiBridge } from './next/bridge/next-ui-bridge';
import { createMainConnectionStateSource } from './main-connection-state-source';
import { createMainMapRuntimeBridgeSource } from './main-map-runtime-bridge-source';
import { createMainNavigationStateSource } from './main-navigation-state-source';
import { createMainObserveStateSource } from './main-observe-state-source';
import { createMainPanelDeltaStateSource } from './main-panel-delta-state-source';
import { createMainResetStateSource } from './main-reset-state-source';
import { createMainRuntimeDeltaStateSource } from './main-runtime-delta-state-source';
import { createMainRuntimeStateSource } from './main-runtime-state-source';
import { createMainTargetingStateSource } from './main-targeting-state-source';
import type { MainDomElements } from './main-dom-elements';
import type { MainFrontendModules } from './main-frontend-modules';
import type { ToastKind } from './main-app-assembly-types';
/**
 * CreateMainRuntimeOwnerContextOptions：统一结构类型，保证协议与运行时一致性。
 */


type CreateMainRuntimeOwnerContextOptions = {
/**
 * documentRef：documentRef相关字段。
 */

  documentRef: Document;  
  /**
 * dom：dom相关字段。
 */

  dom: Pick<
    MainDomElements,
    | 'canvasHost'
    | 'observeModalEl'
    | 'observeModalBodyEl'
    | 'observeModalSubtitleEl'
    | 'observeModalShellEl'
    | 'observeModalAsideEl'
    | 'targetingBadgeEl'
  >;  
  /**
 * modules：模块相关字段。
 */

  modules: MainFrontendModules;  
  /**
 * rootRuntimeSource：根容器运行态来源相关字段。
 */

  rootRuntimeSource: ReturnType<typeof import('./main-root-runtime-source').createMainRootRuntimeSource>;  
  /**
 * runtimeMonitorSource：运行态Monitor来源相关字段。
 */

  runtimeMonitorSource: ReturnType<typeof import('./main-runtime-monitor-source').createMainRuntimeMonitorSource>;  
  /**
 * panelContext：面板上下文状态或数据块。
 */

  panelContext: ReturnType<typeof import('./main-app-panel-context').createMainPanelContext>;  
  /**
 * helpers：辅助函数相关字段。
 */

  helpers: {
    showToast(message: string, kind?: ToastKind): void;
  };
};
/**
 * createMainRuntimeOwnerContext：构建并返回目标对象。
 * @param options CreateMainRuntimeOwnerContextOptions 选项参数。
 * @returns 无返回值，直接更新Main运行态Owner上下文相关状态。
 */


export function createMainRuntimeOwnerContext(options: CreateMainRuntimeOwnerContextOptions) {
  const {
    documentRef,
    dom: {
      canvasHost,
      observeModalEl,
      observeModalBodyEl,
      observeModalSubtitleEl,
      observeModalShellEl,
      observeModalAsideEl,
      targetingBadgeEl,
    },
    modules: {
      socket,
      runtimeSender,
      mapRuntime,
      loginUI,
      bodyTrainingPanel,
      equipmentPanel,
      npcShopModal,
      npcQuestModal,
      attrPanel,
    },
    rootRuntimeSource,
    runtimeMonitorSource,
    panelContext,
    helpers,
  } = options;

  let observeStateSource!: ReturnType<typeof createMainObserveStateSource>;
  let navigationStateSource!: ReturnType<typeof createMainNavigationStateSource>;
  let targetingStateSource!: ReturnType<typeof createMainTargetingStateSource>;
  let panelDeltaStateSource!: ReturnType<typeof createMainPanelDeltaStateSource>;
  let resetStateSource!: ReturnType<typeof createMainResetStateSource>;  
  /**
 * getInfoRadius：读取InfoRadiu。
 * @returns 无返回值，完成InfoRadiu的读取/组装。
 */


  function getInfoRadius() {
    return panelContext.uiStateSource.getInfoRadius(runtimeMonitorSource.getCurrentTimeState());
  }

  const mapRuntimeBridgeSource = createMainMapRuntimeBridgeSource({
    mapRuntime,
    canvasHost,
    getPlayer: () => rootRuntimeSource.getPlayer(),
    getDisplayRangeX: () => getDisplayRangeX(),
    getDisplayRangeY: () => getDisplayRangeY(),
    navigation: {
      clearCurrentPath: () => navigationStateSource.clearCurrentPath(),
      trimCurrentPathProgress: () => navigationStateSource.trimCurrentPathProgress(),
      sendMoveCommand: (direction) => navigationStateSource.sendMoveCommand(direction),
      planPathTo: (target, opts) => navigationStateSource.planPathTo(target, opts),
      findObservedEntityAt: (x, y, kind) => navigationStateSource.findObservedEntityAt(x, y, kind),
      handleNpcClickTarget: (npc) => navigationStateSource.handleNpcClickTarget(npc),
      handlePortalClickTarget: (target, tile) => navigationStateSource.handlePortalClickTarget(target, tile),
    },
    targeting: {
      syncTargetingOverlay: () => targetingStateSource.syncTargetingOverlay(),
      cancelTargeting: (showMessage) => targetingStateSource.cancelTargeting(showMessage),
      getCurrentActionDef: (actionId) => targetingStateSource.getCurrentActionDef(actionId),
      resolveCurrentTargetingRange: (action) => targetingStateSource.resolveCurrentTargetingRange(action),
      beginTargeting: (actionId, actionName, targetMode, range) => targetingStateSource.beginTargeting(actionId, actionName, targetMode, range),
      computeAffectedCellsForAction: (action, anchor) => targetingStateSource.computeAffectedCellsForAction(action, anchor),
      resolveTargetRefForAction: (action, target) => targetingStateSource.resolveTargetRefForAction(action, target),
      hasAffectableTargetInArea: (action, anchorX, anchorY) => targetingStateSource.hasAffectableTargetInArea(action, anchorX, anchorY),
      syncSenseQiOverlay: () => targetingStateSource.syncSenseQiOverlay(),
      setHoveredMapTile: (value) => targetingStateSource.setHoveredMapTile(value),
      getPendingTargetedAction: () => targetingStateSource.getPendingTargetedAction(),
      setPendingTargetedActionHover: (target) => targetingStateSource.setPendingTargetedActionHover(target),
    },
    observe: {
      hide: () => observeStateSource.hide(),
      show: (x, y) => observeStateSource.show(x, y),
      isOpen: () => observeStateSource.isOpen(),
    },
  });  
  /**
 * resizeCanvas：判断resizeCanva是否满足条件。
 * @returns 无返回值，直接更新resizeCanva相关状态。
 */


  function resizeCanvas() {
    mapRuntimeBridgeSource.resizeCanvas();
  }  
  /**
 * syncTargetingOverlay：读取TargetingOverlay并返回结果。
 * @returns 无返回值，直接更新TargetingOverlay相关状态。
 */


  function syncTargetingOverlay() {
    mapRuntimeBridgeSource.syncTargetingOverlay();
  }

  observeStateSource = createMainObserveStateSource({
    observeModalEl,
    observeModalBodyEl,
    observeModalSubtitleEl,
    observeModalAsideEl,
    observeModalShellEl,
    getPlayer: () => rootRuntimeSource.getPlayer(),
    getVisibleTileAt: (x, y) => mapRuntime.getVisibleTileAt(x, y),
    getVisibleGroundPileAt: (x, y) => mapRuntime.getGroundPileAt(x, y),
    getLatestEntities: () => rootRuntimeSource.getLatestEntities(),
    showToast: helpers.showToast,
    sendInspectTileRuntime: (x, y) => runtimeSender.sendInspectTileRuntime(x, y),
    openEntityDetailPending: (kind, id, title) => panelContext.panelDeps.entityDetailModal.openPending(kind, id, title),
    sendRequestDetail: (kind, id) => runtimeSender.sendRequestDetail(kind, id),
  });

  navigationStateSource = createMainNavigationStateSource({
    getPlayer: () => rootRuntimeSource.getPlayer(),
    setPlayerFacing: (direction) => rootRuntimeSource.setPlayerFacing(direction),
    getLatestEntities: () => rootRuntimeSource.getLatestEntities(),
    getLatestEntityById: (id) => rootRuntimeSource.getLatestEntityById(id),
    getMapMeta: () => mapRuntime.getMapMeta(),
    getKnownTileAt: (x, y) => mapRuntimeBridgeSource.getKnownTileAt(x, y),
    setRuntimePathCells: (cells) => mapRuntime.setPathCells(cells),
    sendMove: (direction) => runtimeSender.sendMove(direction),
    sendMoveTo: (x, y, opts) => runtimeSender.sendMoveTo(x, y, opts),
    sendAction: (actionId) => runtimeSender.sendAction(actionId),
    openNpcShop: (npcId) => npcShopModal.open(npcId),
    openNpcQuestPending: (npcId) => npcQuestModal.openPending(npcId),
    showToast: helpers.showToast,
  });

  const senseQiTooltip = new FloatingTooltip();
  targetingStateSource = createMainTargetingStateSource({
    getPlayer: () => rootRuntimeSource.getPlayer(),
    getInfoRadius,
    getLatestEntities: () => rootRuntimeSource.getLatestEntities(),
    getVisibleTileAt: (x, y) => mapRuntime.getVisibleTileAt(x, y),
    setTargetingOverlay: (overlay) => mapRuntime.setTargetingOverlay(overlay),
    setSenseQiOverlay: (overlay) => mapRuntime.setSenseQiOverlay(overlay),
    targetingBadgeEl,
    senseQiTooltip,
    getAuraLevelBaseValue: () => panelContext.breakthroughStateSource.getAuraLevelBaseValue(),
    formatAuraLevelText: (auraValue) => panelContext.breakthroughStateSource.formatAuraLevelText(auraValue),
    showToast: helpers.showToast,
  });

  panelDeltaStateSource = createMainPanelDeltaStateSource({
    getPlayer: () => rootRuntimeSource.getPlayer(),
    refreshObservedDecorations: () => rootRuntimeSource.refreshObservedDecorations(),
    attrPanel,
    equipmentPanel,
    bodyTrainingPanel,
    craftWorkbenchModal: panelContext.panelDeps.craftWorkbenchModal,
    inventoryStateSource: panelContext.inventoryStateSource,
    techniqueStateSource: panelContext.techniqueStateSource,
    actionStateSource: panelContext.actionStateSource,
    syncInventoryBridgeState: (inventory) => nextUiBridge.syncInventory(inventory),
    syncEquipmentBridgeState: (equipment) => nextUiBridge.syncEquipment(equipment),
    syncTechniquesBridgeState: (techniques, cultivatingTechId) => nextUiBridge.syncTechniques(techniques, cultivatingTechId),
    syncActionsBridgeState: (actions, autoBattle, autoRetaliate) => nextUiBridge.syncActions(actions, autoBattle, autoRetaliate),
    syncAttrBridgeState: (value) => nextUiBridge.syncAttrUpdate(value),
    syncPlayerBridgeState: (player) => nextUiBridge.syncPlayer(player),
    refreshHeavenGateModal: (player) => refreshHeavenGateModal(player, {
      showToast: (message) => panelContext.uiStateSource.showToast(message),
      sendAction: (action, element) => runtimeSender.sendHeavenGateAction(action, element),
    }),
    refreshUiChrome: () => panelContext.uiStateSource.refreshUiChrome(),
    syncEstimatedServerTick,
    navigation: {
      hasActivePath: () => navigationStateSource.hasActivePath(),
      clearCurrentPath: () => navigationStateSource.clearCurrentPath(),
    },
    targeting: {
      syncSenseQiOverlay: () => targetingStateSource.syncSenseQiOverlay(),
    },
  });
  panelContext.setPanelDeltaStateSource(panelDeltaStateSource);

  const runtimeDeltaStateSource = createMainRuntimeDeltaStateSource({
    getPlayer: () => rootRuntimeSource.getPlayer(),
    getLatestEntityById: (id) => rootRuntimeSource.getLatestEntityById(id),
    setLatestObservedEntities: (entities) => rootRuntimeSource.setLatestObservedEntities(entities),
    setLatestObservedEntityMap: (value) => rootRuntimeSource.setLatestObservedEntityMap(value),
    refreshObservedDecorations: () => rootRuntimeSource.refreshObservedDecorations(),
    getLatestAttrUpdate: () => panelDeltaStateSource.getLatestAttrUpdate(),
    setLatestAttrUpdate: (value) => panelDeltaStateSource.setLatestAttrUpdate(value),
    mergeAttrUpdatePatch: (current, patch) => panelDeltaStateSource.mergeAttrUpdatePatch(current, patch),
    syncAuraLevelBaseValue: (nextValue) => panelContext.breakthroughStateSource.syncAuraLevelBaseValue(nextValue),
    syncCurrentTimeState: (state) => runtimeMonitorSource.syncCurrentTimeState(state ?? null),
    applyWorldDeltaToRuntime: (input) => mapRuntime.applyNextWorldDelta(input),
    applySelfDeltaToRuntime: (input) => mapRuntime.applyNextSelfDelta(input),
    navigation: {
      trimCurrentPathProgress: () => navigationStateSource.trimCurrentPathProgress(),
      triggerAutoInteractionIfReady: () => navigationStateSource.triggerAutoInteractionIfReady(),
      getPathTarget: () => navigationStateSource.getPathTarget(),
      getPathCells: () => navigationStateSource.getPathCells(),
      clearCurrentPath: () => navigationStateSource.clearCurrentPath(),
      syncPathCellsToRuntime: () => navigationStateSource.syncPathCellsToRuntime(),
    },
    targeting: {
      syncSenseQiOverlay: () => targetingStateSource.syncSenseQiOverlay(),
      syncTargetingOverlay: () => targetingStateSource.syncTargetingOverlay(),
      setHoveredMapTile: (value) => targetingStateSource.setHoveredMapTile(value),
      cancelTargeting: () => targetingStateSource.cancelTargeting(),
    },
    refreshHudChrome: () => panelContext.uiStateSource.refreshHudChrome(),
    hideObserveModal: () => mapRuntimeBridgeSource.hideObserveModal(),
    clearLootPanel: () => panelContext.panelDeps.lootPanel.clear(),
    setPanelRuntimeMapId: (mapId) => panelContext.panelRuntimeSource.setRuntimeMapId(mapId),
    syncQuestMapId: (mapId) => panelContext.questStateSource.syncMapId(mapId),
    updateAttrPanel: (value) => attrPanel.update(value),
    refreshUiChrome: () => panelContext.uiStateSource.refreshUiChrome(),
    handleAttrUpdate: (data) => panelDeltaStateSource.handleAttrUpdate(data),
    handleInventoryUpdate: (data) => panelDeltaStateSource.handleInventoryUpdate(data),
    handleEquipmentUpdate: (data) => panelDeltaStateSource.handleEquipmentUpdate(data),
    handleTechniqueUpdate: (data) => panelDeltaStateSource.handleTechniqueUpdate(data),
    handleActionsUpdate: (data) => panelDeltaStateSource.handleActionsUpdate(data),
  });

  const runtimeStateSource = createMainRuntimeStateSource({
    getPlayer: () => rootRuntimeSource.getPlayer(),
    setPlayer: (player) => rootRuntimeSource.setPlayer(player),
    getLatestAttrUpdate: () => panelDeltaStateSource.getLatestAttrUpdate(),
    setLatestAttrUpdate: (value) => panelDeltaStateSource.setLatestAttrUpdate(value),
    syncAuraLevelBaseValue: (nextValue) => panelContext.breakthroughStateSource.syncAuraLevelBaseValue(nextValue),
    syncCurrentTimeState: (state) => runtimeMonitorSource.syncCurrentTimeState(state ?? null),
    resolvePreviewTechniques,
    buildAttrStateFromPlayer: (player) => panelDeltaStateSource.buildAttrStateFromPlayer(player),
    syncPlayerBridgeState: (player) => nextUiBridge.syncPlayer(player),
    syncAttrBridgeState: (value) => nextUiBridge.syncAttrUpdate(value),
    syncInventoryBridgeState: (inventory) => nextUiBridge.syncInventory(inventory),
    syncEquipmentBridgeState: (equipment) => nextUiBridge.syncEquipment(equipment),
    syncTechniquesBridgeState: (techniques, cultivatingTechId) => nextUiBridge.syncTechniques(techniques, cultivatingTechId),
    syncActionsBridgeState: (actions, autoBattle, autoRetaliate) => nextUiBridge.syncActions(actions, autoBattle, autoRetaliate),
    syncBootstrapQuestState: (player) => panelContext.questStateSource.syncBootstrapQuestState(player),
    syncTargetingOverlay,
    syncSenseQiOverlay: () => mapRuntimeBridgeSource.syncSenseQiOverlay(),
    applyBootstrapToMapRuntime: (data) => mapRuntime.applyBootstrap(data),
    applyMapStaticToRuntime: (data) => mapRuntime.applyMapStatic({
      mapId: data.mapId,
      mapMeta: data.mapMeta,
      minimap: data.minimap,
      tiles: data.tiles,
      tilesOriginX: data.tilesOriginX,
      tilesOriginY: data.tilesOriginY,
      tilePatches: data.tilePatches,
      minimapLibrary: data.minimapLibrary,
      visibleMinimapMarkers: data.visibleMinimapMarkers,
      visibleMinimapMarkerAdds: data.visibleMinimapMarkerAdds,
      visibleMinimapMarkerRemoves: data.visibleMinimapMarkerRemoves,
    }),
    setRuntimePathCells: () => navigationStateSource.syncPathCellsToRuntime(),
    resetObservedBaselinesFromPlayer: (player) => {
      panelDeltaStateSource.seedFromPlayer(player);
      rootRuntimeSource.syncObservedSnapshot();
    },
    clearCurrentPath: () => mapRuntimeBridgeSource.clearCurrentPath(),
    showSidePanel: () => panelContext.panelDeps.sidePanel.show(),
    setChatPersistenceScope: (scope) => panelContext.panelDeps.chatUI.setPersistenceScope(scope),
    showChat: () => panelContext.panelDeps.chatUI.show(),
    showHud: () => {
      documentRef.getElementById('hud')?.classList.remove('hidden');
    },
    resizeCanvas,
    refreshZoomChrome: () => panelContext.uiStateSource.refreshZoomChrome(),
    setPanelRuntime: (state) => panelContext.panelRuntimeSource.setRuntime(state as Record<string, unknown>),
    initAttrPanel: (player) => attrPanel.initFromPlayer(player),
    initAttrDetail: () => panelContext.attrDetailStateSource.init(),
    initInventoryState: (player) => panelContext.inventoryStateSource.initFromPlayer(player),
    initEquipmentPanel: (player) => equipmentPanel.initFromPlayer(player),
    initTechniqueState: (player) => panelContext.techniqueStateSource.initFromPlayer(player),
    initBodyTrainingPanel: (player) => bodyTrainingPanel.initFromPlayer(player),
    initQuestState: (player) => panelContext.questStateSource.initFromPlayer(player),
    initActionState: (player) => panelContext.actionStateSource.initFromPlayer(player),
    initWorldSummaryState: () => panelContext.worldSummaryStateSource.init(),
    refreshUiChrome: () => panelContext.uiStateSource.refreshUiChrome(),
    initMailState: (playerId) => panelContext.mailStateSource.initFromPlayer(playerId),
    initSuggestionState: (playerId) => panelContext.suggestionStateSource.initFromPlayer(playerId),
    hideObserveModal: () => mapRuntimeBridgeSource.hideObserveModal(),
    applyWorldDelta: (data) => runtimeDeltaStateSource.handleWorldDelta(data),
    applySelfDelta: (data) => runtimeDeltaStateSource.handleSelfDelta(data),
    applyPanelDelta: (data) => runtimeDeltaStateSource.handlePanelDelta(data),
    inventorySyncPlayerContext: (player) => panelContext.inventoryStateSource.syncPlayerContext(player),
    refreshHeavenGateModal: (player) => refreshHeavenGateModal(player, {
      showToast: helpers.showToast,
      sendAction: (action, element) => runtimeSender.sendHeavenGateAction(action, element),
    }),
  });

  const connectionStateSource = createMainConnectionStateSource({
    socket,
    restoreSession: () => loginUI.restoreSession(),
    hasRefreshToken: () => loginUI.hasRefreshToken(),
    resetGameState: () => resetStateSource.reset(),
    showLogin: (message) => loginUI.show(message),
    showToast: helpers.showToast,
    logout: (message) => loginUI.logout(message),
    rejectPendingRedeemCodes: (message) => panelContext.settingsStateSource.rejectPendingRedeemCodes(message),
    clearPendingSocketPing: () => runtimeMonitorSource.clearPendingSocketPing(),
    renderPingLatency: (latencyMs, status) => runtimeMonitorSource.renderPingLatency(latencyMs, status),
    setPanelRuntimeDisconnected: () => panelContext.panelRuntimeSource.setRuntimeDisconnected(),
    hasPlayer: () => rootRuntimeSource.hasPlayer(),
    scheduleConnectionRecovery: (delayMs, forceRefresh) => runtimeMonitorSource.scheduleConnectionRecovery(delayMs, forceRefresh),
    getDocumentVisibilityState: () => runtimeMonitorSource.getDocumentVisibilityState(),
    handlePong: (data) => runtimeMonitorSource.handlePong(data),
  });

  resetStateSource = createMainResetStateSource({
    clearRuntimeState: () => {
      rootRuntimeSource.clearPlayer();
      runtimeStateSource.clear();
    },
    syncEstimatedServerTick,
    syncCurrentTimeState: () => runtimeMonitorSource.syncCurrentTimeState(null),
    clearCurrentPath: () => mapRuntimeBridgeSource.clearCurrentPath(),
    clearTechniqueMap: () => panelDeltaStateSource.clearCachedState(),
    clearActionMap: () => {},
    clearObservedEntities: () => rootRuntimeSource.clearObservedEntities(),
    clearTargetingState: () => targetingStateSource.clear(),
    hideObserveModal: () => mapRuntimeBridgeSource.hideObserveModal(),
    syncTargetingOverlay,
    hideSidePanel: () => panelContext.panelDeps.sidePanel.hide(),
    hideChat: () => panelContext.panelDeps.chatUI.hide(),
    clearChatPersistenceScope: () => panelContext.panelDeps.chatUI.setPersistenceScope(null),
    hideDebugPanel: () => panelContext.panelDeps.debugPanel.hide(),
    clearAttrPanel: () => panelContext.panelDeps.attrPanel.clear(),
    clearInventoryState: () => panelContext.inventoryStateSource.clear(),
    clearEquipmentPanel: () => panelContext.panelDeps.equipmentPanel.clear(),
    clearTechniqueState: () => panelContext.techniqueStateSource.clear(),
    clearQuestState: () => panelContext.questStateSource.clear(),
    clearActionState: () => panelContext.actionStateSource.clear(),
    clearEntityDetailModal: () => panelContext.panelDeps.entityDetailModal.clear(),
    clearWorldSummaryState: () => panelContext.worldSummaryStateSource.clear(),
    clearLootPanel: () => panelContext.panelDeps.lootPanel.clear(),
    clearWorldPanel: () => panelContext.panelDeps.worldPanel.clear(),
    clearMailState: () => panelContext.mailStateSource.clear(),
    clearSuggestionState: () => panelContext.suggestionStateSource.clear(),
    resetMapRuntime: () => mapRuntime.reset(),
    resetNextUiBridge: () => {
      nextUiBridge.reset();
      nextUiBridge.syncPlayer(null);
      nextUiBridge.syncAttrUpdate(null);
      nextUiBridge.syncInventory(null);
      nextUiBridge.syncEquipment(null);
      nextUiBridge.syncTechniques([], undefined);
      nextUiBridge.syncActions([], false, true);
    },
    resetPanelRuntime: () => panelContext.panelRuntimeSource.resetRuntime(),
    resizeCanvas,
    hideHud: () => {
      documentRef.getElementById('hud')?.classList.add('hidden');
    },
  });

  return {
    mapRuntimeBridgeSource,
    observeStateSource,
    navigationStateSource,
    targetingStateSource,
    panelDeltaStateSource,
    runtimeDeltaStateSource,
    runtimeStateSource,
    connectionStateSource,
    resetStateSource,
    getInfoRadius,
    resizeCanvas,
    syncTargetingOverlay,
  };
}

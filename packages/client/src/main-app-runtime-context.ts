import { detailModalHost } from './ui/detail-modal-host';
import { getLatestObservedEntitiesSnapshot } from './game-map/store/map-store';
import { syncEstimatedServerTickInterval } from './runtime/server-tick';
import { getAccessToken } from './ui/auth-api';
import { QQ_GROUP_DESKTOP_DEEP_LINK, QQ_GROUP_MOBILE_DEEP_LINK, QQ_GROUP_NUMBER } from './main-dom-elements';
import { createMainRootRuntimeSource } from './main-root-runtime-source';
import { createMainRuntimeMonitorSource } from './main-runtime-monitor-source';
import { createMainPanelContext } from './main-app-panel-context';
import { createMainRuntimeOwnerContext } from './main-app-runtime-owner-context';
import type { InitializeMainAppOptions, ToastKind } from './main-app-assembly-types';

export function createMainAppRuntimeContext(options: InitializeMainAppOptions) {
  const {
    windowRef,
    documentRef,
    dom,
    modules,
  } = options;

  const rootRuntimeSource = createMainRootRuntimeSource({
    replaceVisibleEntities: (entities) => modules.mapRuntime.replaceVisibleEntities(entities),
    getLatestObservedEntitiesSnapshot,
  });

  let panelContext!: ReturnType<typeof createMainPanelContext>;

  function showToast(message: string, kind: ToastKind = 'system') {
    panelContext.uiStateSource.showToast(message, kind);
  }

  const runtimeMonitorSource = createMainRuntimeMonitorSource(
    {
      mapRuntime: modules.mapRuntime,
      connection: modules.socket,
      runtimeSender: modules.runtimeSender,
      login: {
        hasRefreshToken: () => modules.loginUI.hasRefreshToken(),
        restoreSession: () => modules.loginUI.restoreSession(),
        getAccessToken,
      },
      documentRef,
      windowRef,
      locationHost: windowRef.location.host,
      syncEstimatedServerTickInterval,
      showToast: (message) => showToast(message),
      onBeforeVersionReload: () => {
        showToast('检测到新版本，正在刷新页面');
      },
    },
    {
      currentTimeEl: dom.currentTimeEl,
      currentTimePhaseEl: dom.currentTimePhaseEl,
      currentTimeHourAEl: dom.currentTimeHourAEl,
      currentTimeHourBEl: dom.currentTimeHourBEl,
      currentTimeDotEl: dom.currentTimeDotEl,
      currentTimeMinAEl: dom.currentTimeMinAEl,
      currentTimeMinBEl: dom.currentTimeMinBEl,
      tickRateEl: dom.tickRateEl,
      tickRateIntEl: dom.tickRateIntEl,
      tickRateDotEl: dom.tickRateDotEl,
      tickRateFracAEl: dom.tickRateFracAEl,
      tickRateFracBEl: dom.tickRateFracBEl,
      fpsRateEl: dom.fpsRateEl,
      fpsValueEl: dom.fpsValueEl,
      fpsLowValueEl: dom.fpsLowValueEl,
      fpsOnePercentValueEl: dom.fpsOnePercentValueEl,
      pingLatencyEl: dom.pingLatencyEl,
      pingUnitEl: dom.pingUnitEl,
      pingHundredsEl: dom.pingHundredsEl,
      pingTensEl: dom.pingTensEl,
      pingOnesEl: dom.pingOnesEl,
    },
  );

  let runtimeOwnerContext!: ReturnType<typeof createMainRuntimeOwnerContext>;

  panelContext = createMainPanelContext({
    documentRef,
    dom,
    modules,
    rootRuntimeSource,
    callbacks: {
      showToast,
      beginTargeting: (actionId, actionName, targetMode, range) => runtimeOwnerContext.mapRuntimeBridgeSource.beginTargeting(actionId, actionName, targetMode, range),
      cancelTargeting: () => runtimeOwnerContext.mapRuntimeBridgeSource.cancelTargeting(),
      hideObserveModal: () => runtimeOwnerContext.mapRuntimeBridgeSource.hideObserveModal(),
      getInfoRadius: () => runtimeOwnerContext.getInfoRadius(),
      getCurrentActionDef: (actionId) => runtimeOwnerContext.mapRuntimeBridgeSource.getCurrentActionDef(actionId),
      clearCurrentPath: () => runtimeOwnerContext.mapRuntimeBridgeSource.clearCurrentPath(),
      handleTileDetailResult: (data) => runtimeOwnerContext.observeStateSource.handleTileDetail(data),
      resetGameState: () => runtimeOwnerContext.resetStateSource.reset(),
      closeSettingsPanel: () => detailModalHost.close('settings-panel'),
      resizeCanvas: () => runtimeOwnerContext.resizeCanvas(),
      hydrateSyncedItemStack: (item, previous) => runtimeOwnerContext.panelDeltaStateSource.hydrateSyncedItemStack(item, previous),
    },
  });

  runtimeOwnerContext = createMainRuntimeOwnerContext({
    documentRef,
    dom,
    modules,
    rootRuntimeSource,
    runtimeMonitorSource,
    panelContext,
    helpers: { showToast },
  });

  return {
    windowRef,
    documentRef,
    canvasHost: dom.canvasHost,
    joinQqGroupBtns: dom.joinQqGroupBtns,
    observeModalEl: dom.observeModalEl,
    observeModalShellEl: dom.observeModalShellEl,
    qqGroupNumber: QQ_GROUP_NUMBER,
    qqGroupMobileDeepLink: QQ_GROUP_MOBILE_DEEP_LINK,
    qqGroupDesktopDeepLink: QQ_GROUP_DESKTOP_DEEP_LINK,
    initialMapPerformanceConfig: modules.initialMapPerformanceConfig,
    runtimeMonitorSource,
    panelRuntimeSource: panelContext.panelRuntimeSource,
    mapRuntimeBridgeSource: runtimeOwnerContext.mapRuntimeBridgeSource,
    breakthroughStateSource: panelContext.breakthroughStateSource,
    uiStateSource: panelContext.uiStateSource,
    attrDetailStateSource: panelContext.attrDetailStateSource,
    targetingStateSource: runtimeOwnerContext.targetingStateSource,
    runtimeStateSource: runtimeOwnerContext.runtimeStateSource,
    detailStateSource: panelContext.detailStateSource,
    suggestionStateSource: panelContext.suggestionStateSource,
    mailStateSource: panelContext.mailStateSource,
    settingsStateSource: panelContext.settingsStateSource,
    marketStateSource: panelContext.marketStateSource,
    noticeStateSource: panelContext.noticeStateSource,
    connectionStateSource: runtimeOwnerContext.connectionStateSource,
    sidePanel: panelContext.panelDeps.sidePanel,
    chatUI: panelContext.panelDeps.chatUI,
    bodyTrainingPanel: panelContext.panelDeps.bodyTrainingPanel,
    hud: panelContext.panelDeps.hud,
    lootPanel: panelContext.panelDeps.lootPanel,
    equipmentPanel: panelContext.panelDeps.equipmentPanel,
    npcShopModal: panelContext.panelDeps.npcShopModal,
    craftWorkbenchModal: panelContext.panelDeps.craftWorkbenchModal,
    debugPanel: panelContext.panelDeps.debugPanel,
    mapRuntime: modules.mapRuntime,
    socket: modules.socket,
    runtimeSender: modules.runtimeSender,
    panelSender: modules.panelSender,
    socialEconomySender: modules.socialEconomySender,
    adminSender: modules.adminSender,
    loginUI: modules.loginUI,
    rootRuntimeSource,
    showToast,
    syncTargetingOverlay: runtimeOwnerContext.syncTargetingOverlay,
  };
}

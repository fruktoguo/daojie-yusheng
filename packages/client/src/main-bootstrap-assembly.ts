import { MAX_ZOOM, MIN_ZOOM } from './display';
import type { ActionDef, PlayerState } from '@mud/shared-next';
import type { SocketManager } from './network/socket';
import type { LoginUI } from './ui/login';
import type { SidePanel } from './ui/side-panel';
import type { ChatUI } from './ui/chat';
import type { BodyTrainingPanel } from './ui/panels/body-training-panel';
import type { HUD } from './ui/hud';
import type { LootPanel } from './ui/panels/loot-panel';
import type { EquipmentPanel } from './ui/panels/equipment-panel';
import type { NpcShopModal } from './ui/npc-shop-modal';
import type { CraftWorkbenchModal } from './ui/craft-workbench-modal';
import type { DebugPanel } from './ui/debug-panel';
import type { MainAttrDetailStateSource } from './main-attr-detail-state-source';
import type { MainBreakthroughStateSource } from './main-breakthrough-state-source';
import type { MainConnectionStateSource } from './main-connection-state-source';
import type { MainDetailStateSource } from './main-detail-state-source';
import type { MainMailStateSource } from './main-mail-state-source';
import type { MainMapRuntimeBridgeSource } from './main-map-runtime-bridge-source';
import type { MainMarketStateSource } from './main-market-state-source';
import type { MainNoticeStateSource } from './main-notice-state-source';
import type { MainPanelRuntimeSource } from './main-panel-runtime-source';
import type { MainRuntimeMonitorSource } from './main-runtime-monitor-source';
import type { MainRuntimeStateSource } from './main-runtime-state-source';
import type { MainSettingsStateSource } from './main-settings-state-source';
import type { MainSuggestionStateSource } from './main-suggestion-state-source';
import type { MainTargetingStateSource } from './main-targeting-state-source';
import type { MainUiStateSource } from './main-ui-state-source';
import { ChangelogPanel } from './ui/changelog-panel';
import { TutorialPanel } from './ui/tutorial-panel';
import { startClientVersionReload } from './version-reload';
import { mountNextUi } from './next/app/mount';
import { initializeUiStyleConfig } from './ui/ui-style-config';
import { bindMainHighFrequencySocketEvents } from './main-high-frequency-socket-bindings';
import { bindMainLowFrequencySocketEvents } from './main-low-frequency-socket-bindings';
import { bindMainMapInteractions } from './main-map-interaction-bindings';
import { bindMainShellInteractions } from './main-shell-bindings';
import { bindMainStartup } from './main-startup-bindings';
import {
  MAP_PERFORMANCE_CONFIG_CHANGE_EVENT,
  type MapPerformanceConfig,
} from './ui/performance-config';
import {
  RESPONSIVE_VIEWPORT_CHANGE_EVENT,
  bindResponsiveViewportCss,
} from './ui/responsive-viewport';
import type { SocketAdminSender } from './network/socket-send-admin';
import type { SocketPanelSender } from './network/socket-send-panel';
import type { SocketRuntimeSender } from './network/socket-send-runtime';
import type { SocketSocialEconomySender } from './network/socket-send-social-economy';

type ToastKind =
  | 'system'
  | 'chat'
  | 'quest'
  | 'combat'
  | 'loot'
  | 'grudge'
  | 'success'
  | 'warn'
  | 'travel';

type MainBootstrapAssemblyOptions = {
  windowRef: Window;
  documentRef: Document;
  canvasHost: HTMLElement;
  joinQqGroupBtns: Iterable<HTMLAnchorElement>;
  observeModalEl: HTMLElement | null;
  observeModalShellEl: HTMLElement | null;
  qqGroupNumber: string;
  qqGroupMobileDeepLink: string;
  qqGroupDesktopDeepLink: string;
  initialMapPerformanceConfig: {
    showFpsMonitor: boolean;
  };
  runtimeMonitorSource: Pick<
    MainRuntimeMonitorSource,
    | 'initialize'
    | 'syncFpsMonitorVisibility'
    | 'handleVersionReloadBefore'
    | 'scheduleConnectionRecovery'
    | 'restartPingLoop'
    | 'stopPingLoop'
    | 'clearPendingSocketPing'
    | 'renderPingLatency'
  >;
  panelRuntimeSource: Pick<
    MainPanelRuntimeSource,
    | 'syncInitialBridgeState'
    | 'subscribeBridgeState'
    | 'setRuntimeShellVisible'
  >;
  mapRuntimeBridgeSource: Pick<
    MainMapRuntimeBridgeSource,
    | 'resizeCanvas'
    | 'cancelTargeting'
    | 'hideObserveModal'
    | 'isObserveOpen'
    | 'planPathTo'
    | 'findObservedEntityAt'
    | 'getPendingTargetedAction'
    | 'setPendingTargetedActionHover'
    | 'resolveCurrentTargetingRange'
    | 'isPointInsideCurrentMap'
    | 'getVisibleTileAt'
    | 'showObserveModal'
    | 'hasAffectableTargetInArea'
    | 'resolveTargetRefForAction'
    | 'getCurrentActionDef'
    | 'isWithinDisplayedMemoryBounds'
    | 'getKnownTileAt'
    | 'handleNpcClickTarget'
    | 'handlePortalClickTarget'
    | 'clearCurrentPath'
    | 'syncSenseQiOverlay'
    | 'setHoveredMapTile'
    | 'bindKeyboardInput'
  >;
  breakthroughStateSource: Pick<MainBreakthroughStateSource, 'openBreakthroughModal'>;
  uiStateSource: Pick<
    MainUiStateSource,
    | 'showToast'
    | 'refreshZoomChrome'
    | 'applyZoomChange'
    | 'scheduleLayoutViewportSync'
  >;
  attrDetailStateSource: Pick<MainAttrDetailStateSource, 'requestDetail'>;
  targetingStateSource: Pick<MainTargetingStateSource, 'hasPendingTargetedAction'>;
  getPlayer: () => PlayerState | null;
  runtimeStateSource: Pick<
    MainRuntimeStateSource,
    | 'handleBootstrap'
    | 'handleInitSession'
    | 'handleMapEnter'
    | 'handleRealm'
    | 'handleWorldDelta'
    | 'handleSelfDelta'
    | 'handlePanelDelta'
    | 'handleMapStatic'
  >;
  detailStateSource: Pick<
    MainDetailStateSource,
    | 'handleLootWindowUpdate'
    | 'handleTileDetail'
    | 'handleDetail'
    | 'handleAttrDetail'
    | 'handleAlchemyPanel'
    | 'handleEnhancementPanel'
    | 'handleLeaderboard'
    | 'handleWorldSummary'
    | 'handleNpcQuests'
    | 'handleQuests'
    | 'handleQuestNavigateResult'
    | 'handleNpcShop'
  >;
  suggestionStateSource: Pick<MainSuggestionStateSource, 'handleSuggestionUpdate'>;
  mailStateSource: Pick<
    MainMailStateSource,
    | 'handleMailSummary'
    | 'handleMailPage'
    | 'handleMailDetail'
    | 'handleMailOpResult'
  >;
  settingsStateSource: Pick<MainSettingsStateSource, 'handleRedeemCodesResult'>;
  marketStateSource: Pick<
    MainMarketStateSource,
    | 'handleMarketUpdate'
    | 'handleMarketListings'
    | 'handleMarketOrders'
    | 'handleMarketStorage'
    | 'handleMarketItemBook'
    | 'handleMarketTradeHistory'
  >;
  noticeStateSource: Pick<MainNoticeStateSource, 'handleNotice'>;
  connectionStateSource: Pick<
    MainConnectionStateSource,
    | 'handleError'
    | 'handleKick'
    | 'handleConnectError'
    | 'handleDisconnect'
    | 'handlePong'
  >;
  sidePanel: Pick<
    SidePanel,
    | 'setVisibilityChangeCallback'
    | 'setLayoutChangeCallback'
    | 'setTabChangeCallback'
    | 'isVisible'
  >;
  chatUI: Pick<ChatUI, 'setLogbookVisible' | 'setCallback'>;
  bodyTrainingPanel: Pick<BodyTrainingPanel, 'setInfusionHandler'>;
  hud: Pick<HUD, 'setCallbacks'>;
  lootPanel: Pick<LootPanel, 'setCallbacks' | 'clear'>;
  equipmentPanel: Pick<EquipmentPanel, 'setCallbacks'>;
  npcShopModal: Pick<NpcShopModal, 'setCallbacks' | 'open'>;
  craftWorkbenchModal: Pick<CraftWorkbenchModal, 'setCallbacks' | 'openAlchemy' | 'openEnhancement'>;
  debugPanel: Pick<DebugPanel, 'setCallbacks'>;
  mapRuntime: {
    attach: (host: HTMLElement) => void;
    setMoveHandler: (handler: (x: number, y: number) => void) => void;
    setInteractionCallbacks: (callbacks: {
      onTarget: (target: { x: number; y: number; clientX?: number; clientY?: number; entityId?: string; entityKind?: string }) => void;
      onHover: (target: { x: number; y: number; clientX?: number; clientY?: number } | null) => void;
    }) => void;
  };
  socket: Pick<SocketManager, 'on' | 'onKick' | 'onConnectError' | 'onDisconnect'>;
  runtimeSender: Pick<SocketRuntimeSender, 'sendAction' | 'sendCastSkill'>;
  panelSender: Pick<
    SocketPanelSender,
    | 'sendTakeLoot'
    | 'sendUnequip'
    | 'sendRequestNpcShop'
    | 'sendBuyNpcShopItem'
    | 'sendRequestAlchemyPanel'
    | 'sendRequestEnhancementPanel'
    | 'sendStartAlchemy'
    | 'sendCancelAlchemy'
    | 'sendStartEnhancement'
    | 'sendCancelEnhancement'
    | 'sendRequestLeaderboard'
    | 'sendRequestWorldSummary'
  >;
  socialEconomySender: Pick<SocketSocialEconomySender, 'sendChat'>;
  adminSender: Pick<SocketAdminSender, 'sendDebugResetSpawn'>;
  loginUI: Pick<LoginUI, 'restoreSession'>;
  showToast: (message: string, kind?: ToastKind) => void;
  syncTargetingOverlay: () => void;
};

export function bootstrapMainApp(options: MainBootstrapAssemblyOptions): void {
  options.mapRuntimeBridgeSource.resizeCanvas();
  options.uiStateSource.refreshZoomChrome();
  bindResponsiveViewportCss(options.windowRef);
  options.runtimeMonitorSource.initialize(options.initialMapPerformanceConfig.showFpsMonitor);
  options.windowRef.addEventListener(MAP_PERFORMANCE_CONFIG_CHANGE_EVENT, (event) => {
    const config = (event as CustomEvent<MapPerformanceConfig>).detail;
    options.runtimeMonitorSource.syncFpsMonitorVisibility(config.showFpsMonitor);
  });

  bindMainStartup({
    initializeUiStyleConfig,
    mountNextUi: () => mountNextUi(options.windowRef),
    startClientVersionReload,
    onBeforeVersionReload: () => options.runtimeMonitorSource.handleVersionReloadBefore(),
    createChangelogPanel: () => {
      new ChangelogPanel();
    },
    createTutorialPanel: () => {
      new TutorialPanel();
    },
    syncInitialPanelRuntime: () => options.panelRuntimeSource.syncInitialBridgeState(),
    subscribePanelStore: () => options.panelRuntimeSource.subscribeBridgeState(),
    attachMapRuntime: () => {
      options.mapRuntime.attach(options.canvasHost);
    },
    bodyTrainingPanel: options.bodyTrainingPanel,
    hud: options.hud,
    lootPanel: options.lootPanel,
    equipmentPanel: options.equipmentPanel,
    npcShopModal: options.npcShopModal,
    craftWorkbenchModal: options.craftWorkbenchModal,
    debugPanel: options.debugPanel,
    chatUI: options.chatUI,
    zoom: {
      zoomSlider: options.documentRef.getElementById('zoom-slider') as HTMLInputElement | null,
      zoomResetBtn: options.documentRef.getElementById('zoom-reset') as HTMLButtonElement | null,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      applyZoomChange: (nextZoom) => options.uiStateSource.applyZoomChange(nextZoom),
    },
    showToast: (message) => options.showToast(message),
    joinQqGroupBtns: options.joinQqGroupBtns,
    qqGroupNumber: options.qqGroupNumber,
    qqGroupMobileDeepLink: options.qqGroupMobileDeepLink,
    qqGroupDesktopDeepLink: options.qqGroupDesktopDeepLink,
    registerAutoBattleButtons: () => {
      options.documentRef.getElementById('hud-toggle-auto-battle')?.addEventListener('click', () => {
        options.runtimeSender.sendAction('toggle:auto_battle');
      });
      options.documentRef.getElementById('hud-toggle-auto-retaliate')?.addEventListener('click', () => {
        options.runtimeSender.sendAction('toggle:auto_retaliate');
      });
    },
    onOpenRealmAction: () => {
      options.mapRuntimeBridgeSource.cancelTargeting();
      options.mapRuntimeBridgeSource.hideObserveModal();
      options.breakthroughStateSource.openBreakthroughModal();
    },
    runtimeSender: options.runtimeSender,
    panelSender: options.panelSender,
    socialEconomySender: options.socialEconomySender,
    adminSender: options.adminSender,
  });

  bindMainShellInteractions({
    sidePanel: options.sidePanel,
    chatUI: options.chatUI,
    attrDetailStateSource: options.attrDetailStateSource,
    sendRequestLeaderboard: () => options.panelSender.sendRequestLeaderboard(),
    sendRequestWorldSummary: () => options.panelSender.sendRequestWorldSummary(),
    setPanelRuntimeShellVisible: (visible) => options.panelRuntimeSource.setRuntimeShellVisible(visible),
    scheduleLayoutViewportSync: () => options.uiStateSource.scheduleLayoutViewportSync(),
    resizeCanvas: () => options.mapRuntimeBridgeSource.resizeCanvas(),
    responsiveViewportChangeEvent: RESPONSIVE_VIEWPORT_CHANGE_EVENT,
    scheduleConnectionRecovery: (delayMs, forceRefresh) => options.runtimeMonitorSource.scheduleConnectionRecovery(delayMs, forceRefresh),
    restartPingLoop: () => options.runtimeMonitorSource.restartPingLoop(),
    stopPingLoop: () => options.runtimeMonitorSource.stopPingLoop(),
    clearPendingSocketPing: () => options.runtimeMonitorSource.clearPendingSocketPing(),
    renderPingLatency: (latencyMs, status) => options.runtimeMonitorSource.renderPingLatency(latencyMs, status),
    hasPendingTargetedAction: () => options.targetingStateSource.hasPendingTargetedAction(),
    cancelTargeting: (showMessage) => options.mapRuntimeBridgeSource.cancelTargeting(showMessage),
    isObserveOpen: () => options.mapRuntimeBridgeSource.isObserveOpen(),
    hideObserveModal: () => options.mapRuntimeBridgeSource.hideObserveModal(),
    documentRef: options.documentRef,
    getObserveModalEl: () => options.observeModalEl,
    getObserveModalShellEl: () => options.observeModalShellEl,
  });

  bindMainMapInteractions({
    mapRuntime: options.mapRuntime,
    planPathTo: (target, bindOptions) => options.mapRuntimeBridgeSource.planPathTo(target, bindOptions),
    findObservedEntityAt: (x, y, kind) => options.mapRuntimeBridgeSource.findObservedEntityAt(x, y, kind),
    getPendingTargetedAction: () => options.mapRuntimeBridgeSource.getPendingTargetedAction(),
    setPendingTargetedActionHover: (target) => options.mapRuntimeBridgeSource.setPendingTargetedActionHover(target),
    resolveCurrentTargetingRange: (action) => options.mapRuntimeBridgeSource.resolveCurrentTargetingRange(action),
    isPointInsideCurrentMap: (x, y) => options.mapRuntimeBridgeSource.isPointInsideCurrentMap(x, y),
    getVisibleTileAt: (x, y) => options.mapRuntimeBridgeSource.getVisibleTileAt(x, y),
    showToast: (message) => options.showToast(message),
    showObserveModal: (x, y) => options.mapRuntimeBridgeSource.showObserveModal(x, y),
    cancelTargeting: () => options.mapRuntimeBridgeSource.cancelTargeting(),
    getPlayer: () => options.getPlayer(),
    sendAction: (actionId, target) => options.runtimeSender.sendAction(actionId, target),
    sendCastSkill: (actionId, target) => options.runtimeSender.sendCastSkill(actionId, target),
    hasAffectableTargetInArea: (action, x, y) => options.mapRuntimeBridgeSource.hasAffectableTargetInArea(action, x, y),
    resolveTargetRefForAction: (action, target) => options.mapRuntimeBridgeSource.resolveTargetRefForAction(action, target),
    getCurrentActionDef: (actionId) => options.mapRuntimeBridgeSource.getCurrentActionDef(actionId) as ActionDef | null,
    isWithinDisplayedMemoryBounds: (x, y) => options.mapRuntimeBridgeSource.isWithinDisplayedMemoryBounds(x, y),
    getKnownTileAt: (x, y) => options.mapRuntimeBridgeSource.getKnownTileAt(x, y),
    handleNpcClickTarget: (npc) => options.mapRuntimeBridgeSource.handleNpcClickTarget(npc),
    handlePortalClickTarget: (target, tile) => options.mapRuntimeBridgeSource.handlePortalClickTarget(target, tile),
    clearCurrentPath: () => options.mapRuntimeBridgeSource.clearCurrentPath(),
    syncTargetingOverlay: options.syncTargetingOverlay,
    syncSenseQiOverlay: () => options.mapRuntimeBridgeSource.syncSenseQiOverlay(),
    setHoveredMapTile: (value) => options.mapRuntimeBridgeSource.setHoveredMapTile(value),
  });

  bindMainHighFrequencySocketEvents({
    socket: options.socket,
    onBootstrap: (data) => options.runtimeStateSource.handleBootstrap(data),
    onInitSession: (data) => options.runtimeStateSource.handleInitSession(data),
    onMapEnter: (data) => options.runtimeStateSource.handleMapEnter(data),
    onRealm: (data) => options.runtimeStateSource.handleRealm(data),
    onWorldDelta: (data) => options.runtimeStateSource.handleWorldDelta(data),
    onSelfDelta: (data) => options.runtimeStateSource.handleSelfDelta(data),
    onPanelDelta: (data) => options.runtimeStateSource.handlePanelDelta(data),
    onMapStatic: (data) => options.runtimeStateSource.handleMapStatic(data),
  });

  bindMainLowFrequencySocketEvents({
    socket: options.socket,
    onLootWindowUpdate: (data) => options.detailStateSource.handleLootWindowUpdate(data),
    onTileDetail: (data) => options.detailStateSource.handleTileDetail(data),
    onDetail: (data) => options.detailStateSource.handleDetail(data),
    onAttrDetail: (data) => options.detailStateSource.handleAttrDetail(data),
    onAlchemyPanel: (data) => options.detailStateSource.handleAlchemyPanel(data),
    onEnhancementPanel: (data) => options.detailStateSource.handleEnhancementPanel(data),
    onLeaderboard: (data) => options.detailStateSource.handleLeaderboard(data),
    onWorldSummary: (data) => options.detailStateSource.handleWorldSummary(data),
    onNpcQuests: (data) => options.detailStateSource.handleNpcQuests(data),
    onQuests: (data) => options.detailStateSource.handleQuests(data),
    onQuestNavigateResult: (data) => options.detailStateSource.handleQuestNavigateResult(data),
    onSuggestionUpdate: (data) => options.suggestionStateSource.handleSuggestionUpdate(data.suggestions),
    onMailSummary: (data) => options.mailStateSource.handleMailSummary(data.summary),
    onMailPage: (data) => options.mailStateSource.handleMailPage(data.page),
    onMailDetail: (data) => options.mailStateSource.handleMailDetail(data.detail, data.error),
    onRedeemCodesResult: (data) => options.settingsStateSource.handleRedeemCodesResult(data),
    onMailOpResult: (data) => options.mailStateSource.handleMailOpResult(data),
    onMarketUpdate: (data) => options.marketStateSource.handleMarketUpdate(data),
    onMarketListings: (data) => options.marketStateSource.handleMarketListings(data),
    onMarketOrders: (data) => options.marketStateSource.handleMarketOrders(data),
    onMarketStorage: (data) => options.marketStateSource.handleMarketStorage(data),
    onMarketItemBook: (data) => options.marketStateSource.handleMarketItemBook(data),
    onMarketTradeHistory: (data) => options.marketStateSource.handleMarketTradeHistory(data),
    onNpcShop: (data) => options.detailStateSource.handleNpcShop(data),
    onNotice: (payload) => options.noticeStateSource.handleNotice(payload),
    onError: (data) => options.connectionStateSource.handleError(data),
    onKick: () => options.connectionStateSource.handleKick(),
    onConnectError: (message) => options.connectionStateSource.handleConnectError(message),
    onDisconnect: (reason) => options.connectionStateSource.handleDisconnect(reason),
    onPong: (data) => {
      options.connectionStateSource.handlePong(data);
    },
  });

  options.runtimeMonitorSource.restartPingLoop();
  options.mapRuntimeBridgeSource.bindKeyboardInput();
  void options.loginUI.restoreSession();
}

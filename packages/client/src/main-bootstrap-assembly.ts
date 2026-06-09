/**
 * 本文件属于正式客户端主线，负责前端启动、状态拼装、工具函数或表现层逻辑。
 *
 * 维护时要把用户意图、显示派生和服务端权威数据分清，避免为了展示便利复制业务规则。
 */
import { MAX_ZOOM, MIN_ZOOM } from './display';
import { C2S, S2C, TECHNIQUE_GRADE_ORDER } from '@mud/shared';
import type { ActionDef, PlayerState, TechniqueCategory, TechniqueGrade } from '@mud/shared';
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
import type { MainBuildingFengShuiStateSource } from './main-building-fengshui-state-source';
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
import type { MainActivityStateSource } from './main-activity-state-source';
import type { MainTargetingStateSource } from './main-targeting-state-source';
import type { MainUiStateSource } from './main-ui-state-source';
import { ChangelogPanel } from './ui/changelog-panel';
import { TutorialPanel } from './ui/tutorial-panel';
import { startClientVersionReload } from './version-reload';
import { mountReactUi } from './react-ui/app/mount';
import { initializeUiStyleConfig } from './ui/ui-style-config';
import { bindMainHighFrequencySocketEvents } from './main-high-frequency-socket-bindings';
import { bindMainLowFrequencySocketEvents } from './main-low-frequency-socket-bindings';
import { contentResolver } from './content/content-resolver';
import {
  syncTechniqueGenerationState,
  techniqueGenerationStore,
} from './react-ui/panels/technique-generation/mount-technique-generation-panel';
import { cacheUnlockedMinimapLibrary, getCachedMinimapVersions } from './map-static-cache';
import { bindMainMapInteractions } from './main-map-interaction-bindings';
import { bindMainShellInteractions } from './main-shell-bindings';
import { bindMainStartup } from './main-startup-bindings';
import { handleOfflineGainReports } from './ui/offline-gain-modal';
import {
  MAP_PERFORMANCE_CONFIG_CHANGE_EVENT,
  type MapPerformanceConfig,
} from './ui/performance-config';
import {
  RESPONSIVE_VIEWPORT_CHANGE_EVENT,
  bindResponsiveViewportCss,
} from './ui/responsive-viewport';
import type { SocketAdminSender } from './network/socket-send-admin';
import type { SocketBuildingSender } from './network/socket-send-building';
import type { SocketPanelSender } from './network/socket-send-panel';
import type { SocketRuntimeSender } from './network/socket-send-runtime';
import type { SocketSocialEconomySender } from './network/socket-send-social-economy';
import type { SocketTechniqueGenerationSender } from './network/socket-send-technique-generation';
import type { ClientTechniqueActivityKind } from './technique-activity-client.helpers';
/**
 * ToastKind：统一结构类型，保证协议与运行时一致性。
 */


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

const TECHNIQUE_GENERATION_CATEGORIES = new Set<TechniqueCategory>(['arts', 'internal', 'divine', 'secret']);

function parseTechniqueGenerationGrade(value: string): TechniqueGrade | null {
  return (TECHNIQUE_GRADE_ORDER as readonly string[]).includes(value) ? value as TechniqueGrade : null;
}

function parseTechniqueGenerationCategory(value: string): TechniqueCategory | null {
  return TECHNIQUE_GENERATION_CATEGORIES.has(value as TechniqueCategory) ? value as TechniqueCategory : null;
}
  /**
 * MainBootstrapAssemblyOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainBootstrapAssemblyOptions = {
/**
 * windowRef：窗口Ref相关字段。
 */

  windowRef: Window;
  /**
 * documentRef：documentRef相关字段。
 */

  documentRef: Document;
  /**
 * canvasHost：canvaHost相关字段。
 */

  canvasHost: HTMLElement;
  /**
 * joinQqGroupBtns：joinQqGroupBtn相关字段。
 */

  joinQqGroupBtns: Iterable<HTMLAnchorElement>;
  /**
 * observeModalEl：observe弹层El相关字段。
 */

  observeModalEl: HTMLElement | null;
  /**
 * observeModalShellEl：observe弹层ShellEl相关字段。
 */

  observeModalShellEl: HTMLElement | null;
  /**
 * qqGroupNumber：qqGroupNumber相关字段。
 */

  qqGroupNumber: string;
  /**
 * qqGroupMobileDeepLink：qqGroupMobileDeepLink相关字段。
 */

  qqGroupMobileDeepLink: string;
  /**
 * qqGroupDesktopDeepLink：qqGroupDesktopDeepLink相关字段。
 */

  qqGroupDesktopDeepLink: string;
  /**
 * initialMapPerformanceConfig：initial地图Performance配置状态或数据块。
 */

  initialMapPerformanceConfig: MapPerformanceConfig;
  /**
 * runtimeMonitorSource：运行态Monitor来源相关字段。
 */

  runtimeMonitorSource: Pick<
    MainRuntimeMonitorSource,
    | 'initialize'
    | 'recordFpsMonitorFrame'
    | 'syncFpsMonitorVisibility'
    | 'handleVersionReloadBefore'
    | 'scheduleConnectionRecovery'
    | 'restartPingLoop'
    | 'stopPingLoop'
    | 'clearPendingSocketPing'
    | 'renderPingLatency'
  >;
  /**
 * panelRuntimeSource：面板运行态来源相关字段。
 */

  panelRuntimeSource: Pick<
    MainPanelRuntimeSource,
    | 'syncInitialBridgeState'
    | 'subscribeBridgeState'
    | 'setRuntimeShellVisible'
  >;
  /**
 * mapRuntimeBridgeSource：地图运行态桥接来源相关字段。
 */

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
    | 'isCellReachableForCurrentPlayer'
    | 'clearCurrentPath'
    | 'syncSenseQiOverlay'
    | 'syncWangQiOverlay'
    | 'setHoveredMapTile'
    | 'bindKeyboardInput'
  >;
  /**
 * breakthroughStateSource：breakthrough状态来源相关字段。
 */

  breakthroughStateSource: Pick<MainBreakthroughStateSource, 'openBreakthroughModal'>;
  /**
 * uiStateSource：ui状态来源相关字段。
 */

  uiStateSource: Pick<
    MainUiStateSource,
    | 'showToast'
    | 'refreshZoomChrome'
    | 'applyZoomChange'
    | 'scheduleLayoutViewportSync'
  >;
  /**
 * attrDetailStateSource：attr详情状态来源相关字段。
 */

  attrDetailStateSource: Pick<MainAttrDetailStateSource, 'requestDetail'>;
  /**
 * targetingStateSource：targeting状态来源相关字段。
 */

  targetingStateSource: Pick<MainTargetingStateSource, 'hasPendingTargetedAction'>;
  /**
 * getPlayer：玩家引用。
 */

  getPlayer: () => PlayerState | null;
  /**
 * runtimeStateSource：运行态状态来源相关字段。
 */

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
  /**
 * detailStateSource：详情状态来源相关字段。
 */

  detailStateSource: Pick<
    MainDetailStateSource,
    | 'handleLootWindowUpdate'
    | 'handleTileDetail'
    | 'handleDetail'
    | 'handleAttrDetail'
    | 'handleAlchemyPanel'
    | 'handleEnhancementPanel'
    | 'handleTechniqueActivityTasks'
    | 'handleLeaderboard'
    | 'handleLeaderboardPlayerLocations'
    | 'handleWorldSummary'
    | 'handleNpcQuests'
    | 'handleQuests'
    | 'handleQuestNavigateResult'
    | 'handleNpcShop'
  >;
  buildingFengShuiStateSource: Pick<
    MainBuildingFengShuiStateSource,
    | 'hasPendingPlacementTargeting'
    | 'setPendingPlacementHover'
    | 'confirmBuildPlacementTarget'
    | 'cancelPendingPlacementTargeting'
    | 'handleBuildResult'
    | 'handleRoomSummaryPatch'
    | 'handleFengShuiOverlayPatch'
    | 'handleFengShuiDetail'
  >;
  /**
 * activityStateSource：活动中心状态来源。
 */

  activityStateSource: Pick<MainActivityStateSource, 'handleActivityStatus' | 'handleActivityOperationResult'>;
  /**
 * mailStateSource：邮件状态来源相关字段。
 */

  mailStateSource: Pick<
    MainMailStateSource,
    | 'handleMailSummary'
    | 'handleMailPage'
    | 'handleMailDetail'
    | 'handleMailOpResult'
  >;
  /**
 * settingsStateSource：setting状态来源相关字段。
 */

  settingsStateSource: Pick<MainSettingsStateSource, 'handleRedeemCodesResult'>;
  /**
 * marketStateSource：坊市状态来源相关字段。
 */

  marketStateSource: Pick<
    MainMarketStateSource,
    | 'handleMarketUpdate'
    | 'handleMarketListings'
    | 'handleAuctionListings'
    | 'handleMarketOrders'
    | 'handleMarketStorage'
    | 'handleMarketItemBook'
    | 'handleMarketTradeHistory'
  >;
  /**
 * noticeStateSource：notice状态来源相关字段。
 */

  noticeStateSource: Pick<MainNoticeStateSource, 'handleNotice'>;
  /**
 * connectionStateSource：connection状态来源相关字段。
 */

  connectionStateSource: Pick<
    MainConnectionStateSource,
    | 'handleError'
    | 'handleKick'
    | 'handleConnectError'
    | 'handleDisconnect'
    | 'handlePong'
  >;
  /**
 * sidePanel：side面板相关字段。
 */

  sidePanel: Pick<
    SidePanel,
    | 'setVisibilityChangeCallback'
    | 'setLayoutChangeCallback'
    | 'setTabChangeCallback'
    | 'isVisible'
  >;
  /**
 * chatUI：chatUI相关字段。
 */

  chatUI: Pick<ChatUI, 'setLogbookVisible' | 'setCallback'>;
  /**
 * bodyTrainingPanel：bodyTraining面板相关字段。
 */

  bodyTrainingPanel: Pick<BodyTrainingPanel, 'setInfusionHandler'>;
  /**
 * hud：hud相关字段。
 */

  hud: Pick<HUD, 'setCallbacks'>;
  /**
 * lootPanel：掉落面板相关字段。
 */

  lootPanel: Pick<LootPanel, 'setCallbacks' | 'clear' | 'resetManualCloseSuppression'>;
  /**
 * equipmentPanel：装备面板相关字段。
 */

  equipmentPanel: Pick<EquipmentPanel, 'setCallbacks'>;
  /**
 * npcShopModal：NPCShop弹层相关字段。
 */

  npcShopModal: Pick<NpcShopModal, 'setCallbacks' | 'open'>;
  /**
 * craftWorkbenchModal：炼制Workbench弹层相关字段。
 */

  craftWorkbenchModal: Pick<CraftWorkbenchModal, 'setCallbacks' | 'setTransmissionCallbacks' | 'openAlchemy' | 'openForging' | 'openEnhancement' | 'openTransmission'>;
  /**
 * debugPanel：debug面板相关字段。
 */

  debugPanel: Pick<DebugPanel, 'setCallbacks'>;
  /**
 * mapRuntime：地图运行态引用。
 */

  mapRuntime: {
  /**
 * attach：attach相关字段。
 */

    attach: (host: HTMLElement) => void;
    /**
 * setRenderFrameObserver：渲染帧观察器。
 */

    setRenderFrameObserver: (observer: ((frameAtMs: number) => void) | null) => void;
    /**
 * setTargetFps：地图目标渲染 FPS。
 */

    setTargetFps: (targetFps: number) => void;
    setPerformanceConfig: (config: MapPerformanceConfig) => void;
    /**
 * setMoveHandler：MoveHandler相关字段。
 */

    setMoveHandler: (handler: (x: number, y: number) => void) => void;
    /**
 * setInteractionCallbacks：InteractionCallback相关字段。
 */

    setInteractionCallbacks: (callbacks: {
    /**
 * onTarget：on目标相关字段。
 */

      onTarget: (target: {
      /**
 * x：x相关字段。
 */
 x: number;
 /**
 * y：y相关字段。
 */
 y: number;
 /**
 * clientX：clientX相关字段。
 */
 clientX?: number;
 /**
 * clientY：clientY相关字段。
 */
 clientY?: number;
 /**
 * entityId：entityID标识。
 */
 entityId?: string;
 /**
 * entityKind：entityKind相关字段。
 */
 entityKind?: string }) => void;
 /**
 * onHover：onHover相关字段。
 */

      onHover: (target: {
      /**
 * x：x相关字段。
 */
 x: number;
 /**
 * y：y相关字段。
 */
 y: number;
 /**
 * clientX：clientX相关字段。
 */
 clientX?: number;
 /**
 * clientY：clientY相关字段。
 */
 clientY?: number } | null) => void;
    }) => void;
  };
  /**
 * socket：socket相关字段。
 */

  socket: Pick<SocketManager, 'on' | 'onKick' | 'onConnectError' | 'onDisconnect' | 'emitEvent' | 'content'>;
  /**
 * runtimeSender：运行态Sender相关字段。
 */

  runtimeSender: Pick<SocketRuntimeSender, 'sendAction' | 'sendCastSkill'>;
  /**
 * panelSender：面板Sender相关字段。
 */

  panelSender: Pick<
    SocketPanelSender,
    | 'sendTakeLoot'
    | 'sendStartGather'
    | 'sendCancelGather'
    | 'sendStopLootHarvest'
    | 'sendUnequip'
    | 'sendRequestNpcShop'
    | 'sendBuyNpcShopItem'
    | 'sendRequestAlchemyPanel'
    | 'sendRequestForgingPanel'
    | 'sendSaveAlchemyPreset'
    | 'sendDeleteAlchemyPreset'
    | 'sendRequestEnhancementPanel'
    | 'sendStartAlchemy'
    | 'sendStartForging'
    | 'sendCancelAlchemy'
    | 'sendCancelForging'
    | 'sendStartEnhancement'
    | 'sendCancelEnhancement'
    | 'sendCancelTechniqueActivity'
    | 'sendRequestLeaderboard'
    | 'sendRequestWorldSummary'
  >;
  /**
 * socialEconomySender：socialEconomySender相关字段。
 */

  socialEconomySender: Pick<SocketSocialEconomySender, 'sendChat' | 'ackOfflineGainReports' | 'requestOfflineGainReports'>;
  /**
 * adminSender：adminSender相关字段。
 */

  adminSender: Pick<SocketAdminSender, 'sendDebugResetSpawn'>;
  buildingSender: Pick<
    SocketBuildingSender,
    | 'sendBuildPlaceIntent'
    | 'sendBuildDeconstruct'
    | 'sendRoomSetRole'
    | 'sendFengShuiObserve'
  >;
  techniqueGenerationSender: SocketTechniqueGenerationSender;
  /**
 * loginUI：loginUI相关字段。
 */

  loginUI: Pick<LoginUI, 'restoreSession' | 'hide'>;
  /**
 * showToast：showToast相关字段。
 */

  showToast: (message: string, kind?: ToastKind) => void;
  /**
 * syncTargetingOverlay：TargetingOverlay相关字段。
 */

  syncTargetingOverlay: () => void;
};
/**
 * bootstrapMainApp：执行引导MainApp相关逻辑。
 * @param options MainBootstrapAssemblyOptions 选项参数。
 * @returns 无返回值，直接更新bootstrapMainApp相关状态。
 */


export function bootstrapMainApp(options: MainBootstrapAssemblyOptions): void {
  const techniqueActivityPanelHandlers: {
    [K in ClientTechniqueActivityKind]:
      K extends 'enhancement' ? MainDetailStateSource['handleEnhancementPanel'] : MainDetailStateSource['handleAlchemyPanel'];
  } = {
    alchemy: (data: Parameters<MainDetailStateSource['handleAlchemyPanel']>[0]) =>
      options.detailStateSource.handleAlchemyPanel(data),
    forging: (data: Parameters<MainDetailStateSource['handleAlchemyPanel']>[0]) =>
      options.detailStateSource.handleAlchemyPanel(data),
    enhancement: (data: Parameters<MainDetailStateSource['handleEnhancementPanel']>[0]) =>
      options.detailStateSource.handleEnhancementPanel(data),
  };

  options.mapRuntimeBridgeSource.resizeCanvas();
  options.uiStateSource.refreshZoomChrome();
  bindResponsiveViewportCss(options.windowRef);
  options.runtimeMonitorSource.initialize(options.initialMapPerformanceConfig.showFpsMonitor);
  options.mapRuntime.setRenderFrameObserver((frameAtMs) => {
    options.runtimeMonitorSource.recordFpsMonitorFrame(frameAtMs);
  });
  options.mapRuntime.setTargetFps(options.initialMapPerformanceConfig.targetFps);
  options.mapRuntime.setPerformanceConfig(options.initialMapPerformanceConfig);
  options.windowRef.addEventListener(MAP_PERFORMANCE_CONFIG_CHANGE_EVENT, (event) => {
    const config = (event as CustomEvent<MapPerformanceConfig>).detail;
    options.runtimeMonitorSource.syncFpsMonitorVisibility(config.showFpsMonitor);
    options.mapRuntime.setTargetFps(config.targetFps);
    options.mapRuntime.setPerformanceConfig(config);
  });

  bindMainStartup({
    documentRef: options.documentRef,
    initializeUiStyleConfig,
    mountReactUi: () => mountReactUi(options.windowRef),
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
      options.buildingFengShuiStateSource.cancelPendingPlacementTargeting(false);
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
    cancelTargeting: (showMessage) => {
      options.buildingFengShuiStateSource.cancelPendingPlacementTargeting(false);
      options.mapRuntimeBridgeSource.cancelTargeting(showMessage);
    },
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
    hasPendingBuildPlacementTargeting: () => options.buildingFengShuiStateSource.hasPendingPlacementTargeting(),
    setPendingBuildPlacementHover: (target) => options.buildingFengShuiStateSource.setPendingPlacementHover(target),
    confirmBuildPlacementTarget: (x, y) => options.buildingFengShuiStateSource.confirmBuildPlacementTarget(x, y),
    cancelPendingBuildPlacementTargeting: (clearTargeting) => options.buildingFengShuiStateSource.cancelPendingPlacementTargeting(clearTargeting),
    cancelTargeting: () => {
      options.buildingFengShuiStateSource.cancelPendingPlacementTargeting(false);
      options.mapRuntimeBridgeSource.cancelTargeting();
    },
    getPlayer: () => options.getPlayer(),
    sendAction: (actionId, target) => options.runtimeSender.sendAction(actionId, target),
    resetLootPanelManualCloseSuppression: () => options.lootPanel.resetManualCloseSuppression(),
    sendCastSkill: (actionId, target) => options.runtimeSender.sendCastSkill(actionId, target),
    hasAffectableTargetInArea: (action, x, y) => options.mapRuntimeBridgeSource.hasAffectableTargetInArea(action, x, y),
    resolveTargetRefForAction: (action, target) => options.mapRuntimeBridgeSource.resolveTargetRefForAction(action, target),
    getCurrentActionDef: (actionId) => options.mapRuntimeBridgeSource.getCurrentActionDef(actionId) as ActionDef | null,
    isWithinDisplayedMemoryBounds: (x, y) => options.mapRuntimeBridgeSource.isWithinDisplayedMemoryBounds(x, y),
    getKnownTileAt: (x, y) => options.mapRuntimeBridgeSource.getKnownTileAt(x, y),
    handleNpcClickTarget: (npc) => options.mapRuntimeBridgeSource.handleNpcClickTarget(npc),
    handlePortalClickTarget: (target, tile) => options.mapRuntimeBridgeSource.handlePortalClickTarget(target, tile),
    isCellReachableForCurrentPlayer: (x, y) => options.mapRuntimeBridgeSource.isCellReachableForCurrentPlayer(x, y),
    clearCurrentPath: () => options.mapRuntimeBridgeSource.clearCurrentPath(),
    syncTargetingOverlay: options.syncTargetingOverlay,
    syncSenseQiOverlay: () => options.mapRuntimeBridgeSource.syncSenseQiOverlay(),
    syncWangQiOverlay: () => options.mapRuntimeBridgeSource.syncWangQiOverlay?.(),
    setHoveredMapTile: (value) => options.mapRuntimeBridgeSource.setHoveredMapTile(value),
  });

  bindMainHighFrequencySocketEvents({
    socket: options.socket,
    onBootstrap: (data) => {
      options.loginUI.hide();
      options.runtimeStateSource.handleBootstrap(data);
    },
    onInitSession: (data) => options.runtimeStateSource.handleInitSession(data),
    onMapEnter: (data) => options.runtimeStateSource.handleMapEnter(data),
    onRealm: (data) => options.runtimeStateSource.handleRealm(data),
    onWorldDelta: (data) => options.runtimeStateSource.handleWorldDelta(data),
    onSelfDelta: (data) => options.runtimeStateSource.handleSelfDelta(data),
    onPanelDelta: (data) => options.runtimeStateSource.handlePanelDelta(data),
    onMapStatic: (data) => options.runtimeStateSource.handleMapStatic(data),
  });

  // minimapLibrary 版本协商：收到清单后回报本地版本，收到增量后更新缓存
  options.socket.on(S2C.MinimapLibraryManifest, () => {
    const clientVersions = getCachedMinimapVersions();
    options.socket.emitEvent(C2S.ReportMinimapVersions, { versions: clientVersions });
  });
  options.socket.on(S2C.MinimapLibraryDelta, (data) => {
    if (Array.isArray(data?.entries) && data.entries.length > 0) {
      cacheUnlockedMinimapLibrary(data.entries);
    }
  });

  bindMainLowFrequencySocketEvents({
    socket: options.socket,
    onLootWindowUpdate: (data) => options.detailStateSource.handleLootWindowUpdate(data),
    onTileDetail: (data) => options.detailStateSource.handleTileDetail(data),
    onDetail: (data) => options.detailStateSource.handleDetail(data),
    onAttrDetail: (data) => options.detailStateSource.handleAttrDetail(data),
    onAlchemyPanel: techniqueActivityPanelHandlers.alchemy,
    onEnhancementPanel: techniqueActivityPanelHandlers.enhancement,
    onTechniqueActivityTasks: (data) => options.detailStateSource.handleTechniqueActivityTasks(data),
    onLeaderboard: (data) => options.detailStateSource.handleLeaderboard(data),
    onLeaderboardPlayerLocations: (data) => options.detailStateSource.handleLeaderboardPlayerLocations(data),
    onWorldSummary: (data) => options.detailStateSource.handleWorldSummary(data),
    onNpcQuests: (data) => options.detailStateSource.handleNpcQuests(data),
    onQuests: (data) => options.detailStateSource.handleQuests(data),
    onQuestNavigateResult: (data) => options.detailStateSource.handleQuestNavigateResult(data),
    onOfflineGainReports: (data) => handleOfflineGainReports(data, {
      getPlayerId: () => options.getPlayer()?.id,
      ackOfflineGainReports: (reportIds) => options.socialEconomySender.ackOfflineGainReports(reportIds),
      requestOfflineGainReports: () => options.socialEconomySender.requestOfflineGainReports(),
      showToast: (message, kind) => options.showToast(message, kind),
      windowRef: options.windowRef,
    }),
    onActivityStatus: (data) => options.activityStateSource.handleActivityStatus(data),
    onActivityOperationResult: (data) => options.activityStateSource.handleActivityOperationResult(data),
    onMailSummary: (data) => options.mailStateSource.handleMailSummary(data.summary),
    onMailPage: (data) => options.mailStateSource.handleMailPage(data.page),
    onMailDetail: (data) => options.mailStateSource.handleMailDetail(data.detail, data.error),
    onRedeemCodesResult: (data) => options.settingsStateSource.handleRedeemCodesResult(data),
    onMailOpResult: (data) => options.mailStateSource.handleMailOpResult(data),
    onMarketUpdate: (data) => options.marketStateSource.handleMarketUpdate(data),
    onMarketListings: (data) => options.marketStateSource.handleMarketListings(data),
    onAuctionListings: (data) => options.marketStateSource.handleAuctionListings(data),
    onMarketOrders: (data) => options.marketStateSource.handleMarketOrders(data),
    onMarketStorage: (data) => options.marketStateSource.handleMarketStorage(data),
    onMarketItemBook: (data) => options.marketStateSource.handleMarketItemBook(data),
    onMarketTradeHistory: (data) => options.marketStateSource.handleMarketTradeHistory(data),
    onNpcShop: (data) => options.detailStateSource.handleNpcShop(data),
    onBuildResult: (data) => options.buildingFengShuiStateSource.handleBuildResult(data),
    onRoomSummaryPatch: (data) => options.buildingFengShuiStateSource.handleRoomSummaryPatch(data),
    onFengShuiOverlayPatch: (data) => options.buildingFengShuiStateSource.handleFengShuiOverlayPatch(data),
    onFengShuiDetail: (data) => options.buildingFengShuiStateSource.handleFengShuiDetail(data),
    onNotice: (payload) => options.noticeStateSource.handleNotice(payload),
    onTechniqueGenerationStatus: (data) => {
      const jobIsGenerating = data.currentJob?.status === 'pending' || data.currentJob?.status === 'running';
      syncTechniqueGenerationState({
        available: data.available,
        unavailableReason: data.unavailableReason ?? '',
        rollRange: data.rollRange ?? null,
        currentJob: data.currentJob,
        currentDraft: data.currentDraft,
        generating: jobIsGenerating,
        error: data.currentJob?.status === 'generated_draft' && !data.currentDraft
          ? '功法草稿数据异常，请联系管理员处理'
          : '',
      });
    },
    onTechniqueGenerationResult: (data) => {
      const grade = data.preview ? parseTechniqueGenerationGrade(data.preview.grade) : null;
      const category = data.preview ? parseTechniqueGenerationCategory(data.preview.category) : null;
      if (data.result === 'learned') {
        options.showToast(data.techniqueName ? `已学习 ${data.techniqueName}` : '功法已学习', 'success');
        syncTechniqueGenerationState({
          generating: false,
          currentDraft: null,
          currentJob: null,
          error: '',
        });
        if (techniqueGenerationStore.getState().visible) {
          options.techniqueGenerationSender.sendGetStatus();
        }
        return;
      }
      if (data.result === 'discarded') {
        options.showToast('已放弃功法草稿', 'system');
        syncTechniqueGenerationState({
          generating: false,
          currentDraft: null,
          currentJob: null,
          error: '',
        });
        if (techniqueGenerationStore.getState().visible) {
          options.techniqueGenerationSender.sendGetStatus();
        }
        return;
      }
      if (data.result === 'success' && data.preview && grade && category) {
        syncTechniqueGenerationState({
          generating: false,
          currentDraft: {
            jobId: data.jobId,
            techniqueId: data.preview.techniqueId,
            suggestedName: data.preview.suggestedName,
            grade,
            category,
            realmLv: data.preview.realmLv,
            desc: data.preview.desc,
            maxLayer: data.preview.maxLayer,
            fullLevelAttrs: data.preview.fullLevelAttrs,
            skills: data.preview.skills,
          },
          currentJob: null,
          error: '',
        });
        return;
      }
      if (data.result === 'failed') {
        options.showToast(data.errorMessage ?? '功法领悟失败', 'warn');
      }
      const currentGenerationState = techniqueGenerationStore.getState();
      const shouldRefreshAfterFailure = data.result === 'failed'
        && !currentGenerationState.currentDraft
        && currentGenerationState.visible;
      syncTechniqueGenerationState({
        generating: false,
        currentJob: null,
        error: data.result === 'failed'
          ? (data.errorMessage ?? '功法领悟失败')
          : (data.preview && (!grade || !category) ? '功法领悟结果格式异常' : ''),
      });
      if (shouldRefreshAfterFailure) {
        options.techniqueGenerationSender.sendGetStatus();
      }
    },
    onError: (data) => options.connectionStateSource.handleError(data),
    onKick: (data) => options.connectionStateSource.handleKick(data),
    onConnectError: (message) => options.connectionStateSource.handleConnectError(message),
    onDisconnect: (reason) => options.connectionStateSource.handleDisconnect(reason),
    onPong: (data) => {
      options.connectionStateSource.handlePong(data);
    },
  });

  // ContentResolver: 注入发包能力
  contentResolver.bindEmitter((payload) => {
    options.socket.content.sendRequestContentTemplates(payload);
  });

  options.runtimeMonitorSource.restartPingLoop();
  options.mapRuntimeBridgeSource.bindKeyboardInput();
  void options.loginUI.restoreSession();
}

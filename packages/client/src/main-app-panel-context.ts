import { getCurrentAccountName } from './ui/auth-api';
import { DEFAULT_AURA_LEVEL_BASE_VALUE, type ActionDef, type Inventory, type S2C_TileDetail, type SyncedItemStack } from '@mud/shared';
import { reactUiBridge } from './react-ui/bridge/react-ui-bridge';
import { createMainActionStateSource } from './main-action-state-source';
import { createMainAttrDetailStateSource } from './main-attr-detail-state-source';
import { createMainBreakthroughStateSource } from './main-breakthrough-state-source';
import { createMainDetailHydrationSource } from './main-detail-hydration-source';
import { createMainDetailStateSource } from './main-detail-state-source';
import { createMainInventoryStateSource } from './main-inventory-state-source';
import { createMainMailStateSource } from './main-mail-state-source';
import { createMainMarketStateSource } from './main-market-state-source';
import { createMainNoticeStateSource } from './main-notice-state-source';
import { createMainPanelRuntimeSource } from './main-panel-runtime-source';
import { createMainQuestStateSource } from './main-quest-state-source';
import { createMainSettingsStateSource } from './main-settings-state-source';
import { createMainSuggestionStateSource } from './main-suggestion-state-source';
import { createMainTechniqueStateSource } from './main-technique-state-source';
import { createMainUiStateSource } from './main-ui-state-source';
import { createMainWorldSummaryStateSource } from './main-world-summary-state-source';
import type { ClientTechniqueActivityKind } from './technique-activity-client.helpers';
import { openWorldMigrationModal } from './ui/world-migration-modal';
import type { MainDomElements } from './main-dom-elements';
import type { MainFrontendModules } from './main-frontend-modules';
import type { ToastKind } from './main-app-assembly-types';
/**
 * CreateMainPanelContextOptions：统一结构类型，保证协议与运行时一致性。
 */


type CreateMainPanelContextOptions = {
/**
 * documentRef：documentRef相关字段。
 */

  documentRef: Document;  
  /**
 * dom：dom相关字段。
 */

  dom: Pick<MainDomElements, 'zoomSlider' | 'zoomLevelEl'>;  
  /**
 * modules：模块相关字段。
 */

  modules: MainFrontendModules;  
  /**
 * rootRuntimeSource：根容器运行态来源相关字段。
 */

  rootRuntimeSource: ReturnType<typeof import('./main-root-runtime-source').createMainRootRuntimeSource>;  
  /**
 * callbacks：callback相关字段。
 */

  callbacks: {
    showToast(message: string, kind?: ToastKind): void;
    beginTargeting(actionId: string, actionName: string, targetMode?: string, range?: number): void;
    cancelTargeting(): void;
    hideObserveModal(): void;
    getInfoRadius(): number;
    getCurrentActionDef(actionId: string): ActionDef | null;
    clearCurrentPath(): void;
    handleTileDetailResult(data: S2C_TileDetail): void;
    resetGameState(): void;
    closeSettingsPanel(): void;
    resizeCanvas(): void;
    hydrateSyncedItemStack(item: SyncedItemStack, previous?: Inventory['items'][number]): Inventory['items'][number];
  };
};
/**
 * createMainPanelContext：构建并返回目标对象。
 * @param options CreateMainPanelContextOptions 选项参数。
 * @returns 无返回值，直接更新Main面板上下文相关状态。
 */


export function createMainPanelContext(options: CreateMainPanelContextOptions) {
  const {
    documentRef,
    dom: { zoomSlider, zoomLevelEl },
    modules: {
      socket,
      runtimeSender,
      panelSender,
      socialEconomySender,
      mapRuntime,
      loginUI,
      hud,
      chatUI,
      debugPanel,
      sidePanel,
      attrPanel,
      inventoryPanel,
      equipmentPanel,
      techniquePanel,
      bodyTrainingPanel,
      questPanel,
      actionPanel,
      lootPanel,
      worldPanel,
      settingsPanel,
      npcShopModal,
      npcQuestModal,
      entityDetailModal,
      craftWorkbenchModal,
      panelSystem,
    },
    rootRuntimeSource,
    callbacks,
  } = options;

  const mailStateSource = createMainMailStateSource({
    socket: socialEconomySender,
    recoverSession: () => loginUI.restoreSession(),
  });
  const suggestionStateSource = createMainSuggestionStateSource({
    socket: socialEconomySender,
    isSocketConnected: () => socket.connected,
  });

  let uiStateSource!: ReturnType<typeof createMainUiStateSource>;
  let panelDeltaStateSource!: ReturnType<typeof import('./main-panel-delta-state-source').createMainPanelDeltaStateSource>;
  const techniqueActivityOpeners = {
    alchemy: () => craftWorkbenchModal.openAlchemy(),
    enhancement: () => craftWorkbenchModal.openEnhancement(),
  } as const satisfies Record<ClientTechniqueActivityKind, () => void>;

  const actionStateSource = createMainActionStateSource({
    actionPanel,
    socket: runtimeSender,
    beginTargeting: callbacks.beginTargeting,
    cancelTargeting: callbacks.cancelTargeting,
    hideObserveModal: callbacks.hideObserveModal,
    openBreakthroughModal: () => breakthroughStateSource.openBreakthroughModal(),
    openNpcShop: (npcId) => npcShopModal.open(npcId),
    openNpcQuestPending: (npcId) => npcQuestModal.openPending(npcId),
    openTechniqueActivity: (kind) => techniqueActivityOpeners[kind](),
    openWorldMigrationModal: () => openWorldMigrationModal({
      getPlayer: () => rootRuntimeSource.getPlayer(),
      sendAction: (actionId, target) => runtimeSender.sendAction(actionId, target),
      showToast: (message, kind) => callbacks.showToast(message, kind),
    }),
    getInfoRadius: callbacks.getInfoRadius,
    getCurrentActionDef: callbacks.getCurrentActionDef,
  });
  const techniqueStateSource = createMainTechniqueStateSource({
    techniquePanel,
    socket: runtimeSender,
  });
  const attrDetailStateSource = createMainAttrDetailStateSource({
    attrPanel,
    socket: panelSender,
    getPlayer: () => rootRuntimeSource.getPlayer(),
    getLatestAttrUpdate: () => panelDeltaStateSource.getLatestAttrUpdate(),
    setLatestAttrUpdate: (value) => panelDeltaStateSource.setLatestAttrUpdate(value),
    mergeAttrUpdatePatch: (current, data) => panelDeltaStateSource.mergeAttrUpdatePatch(current, data),
    cloneJson: (value) => detailHydrationSource.cloneJson(value),
  });
  const questStateSource = createMainQuestStateSource({
    questPanel,
    npcQuestModal,
    clearCurrentPath: callbacks.clearCurrentPath,
    sendNavigateQuest: (questId) => runtimeSender.sendNavigateQuest(questId),
    sendRequestQuests: () => runtimeSender.sendRequestQuests(),
    sendRequestNpcQuests: (npcId) => runtimeSender.sendRequestNpcQuests(npcId),
    sendAcceptNpcQuest: (npcId, questId) => runtimeSender.sendAcceptNpcQuest(npcId, questId),
    sendSubmitNpcQuest: (npcId, questId) => runtimeSender.sendSubmitNpcQuest(npcId, questId),
    syncQuestBridgeState: (quests) => reactUiBridge.syncQuests(quests),
    syncPlayerBridgeState: (player) => reactUiBridge.syncPlayer(player),
    refreshUiChrome: () => uiStateSource.refreshUiChrome(),
  });
  const marketStateSource = createMainMarketStateSource({
    socket: socialEconomySender,
    getPlayer: () => rootRuntimeSource.getPlayer(),
    hydrateInventoryItem: (item) => detailHydrationSource.hydrateSyncedItemStack(item),
  });
  const breakthroughStateSource = createMainBreakthroughStateSource({
    getPlayer: () => rootRuntimeSource.getPlayer(),
    showToast: callbacks.showToast,
    sendHeavenGateAction: (action, element) => runtimeSender.sendHeavenGateAction(action, element),
    sendAction: (actionId) => runtimeSender.sendAction(actionId),
    defaultAuraLevelBaseValue: DEFAULT_AURA_LEVEL_BASE_VALUE,
  });
  const detailHydrationSource = createMainDetailHydrationSource({
    hydrateSyncedItemStack: callbacks.hydrateSyncedItemStack,
  });
  const worldSummaryStateSource = createMainWorldSummaryStateSource({
    socket: panelSender,
    worldPanel,
  });
  const detailStateSource = createMainDetailStateSource({
    lootPanel,
    entityDetailModal,
    craftWorkbenchModal,
    npcShopModal,
    hydrateLootWindowState: (window) => detailHydrationSource.hydrateLootWindowState(window),
    hydrateNpcShopResponse: (data) => detailHydrationSource.hydrateNpcShopResponse(data),
    handleAttrDetail: (data) => attrDetailStateSource.handleAttrDetail(data),
    handleLeaderboard: (data) => worldSummaryStateSource.handleLeaderboard(data),
    handleLeaderboardPlayerLocations: (data) => worldSummaryStateSource.handleLeaderboardPlayerLocations(data),
    handleWorldSummary: (data) => worldSummaryStateSource.handleWorldSummary(data),
    handleNpcQuests: (data) => questStateSource.handleNpcQuests(data),
    handleQuestUpdate: (data) => questStateSource.handleQuestUpdate(data, rootRuntimeSource.getPlayer()),
    handleQuestNavigateResult: (data) => questStateSource.handleQuestNavigateResult(data),
    handleTileDetailResult: callbacks.handleTileDetailResult,
  });
  const noticeStateSource = createMainNoticeStateSource({
    chatUI,
    ackSystemMessages: (ids) => socialEconomySender.ackSystemMessages(ids),
    showToast: (message, kind) => uiStateSource.showToast(message, kind),
    clearCurrentPath: callbacks.clearCurrentPath,
  });
  const inventoryStateSource = createMainInventoryStateSource({
    inventoryPanel,
    questStateSource,
    marketStateSource,
    npcShopModal,
    craftWorkbenchModal,
    syncInventoryBridgeState: (inventory) => reactUiBridge.syncInventory(inventory),
    syncPlayerBridgeState: (player) => reactUiBridge.syncPlayer(player),
    sendUseItem: (slotIndex, count) => panelSender.sendUseItem(slotIndex, count),
    sendDropItem: (slotIndex, count) => panelSender.sendDropItem(slotIndex, count),
    sendDestroyItem: (slotIndex, count) => panelSender.sendDestroyItem(slotIndex, count),
    sendEquip: (slotIndex) => panelSender.sendEquip(slotIndex),
    sendSortInventory: () => panelSender.sendSortInventory(),
  });
  const settingsStateSource = createMainSettingsStateSource({
    settingsPanel,
    getCurrentAccountName: () => getCurrentAccountName() ?? '',
    getPlayer: () => rootRuntimeSource.getPlayer(),
    applyVisibleDisplayName: (playerId, displayName) => rootRuntimeSource.applyVisibleDisplayName(playerId, displayName),
    applyVisibleRoleName: (playerId, roleName) => rootRuntimeSource.applyVisibleRoleName(playerId, roleName),
    syncPlayerBridgeState: (player) => reactUiBridge.syncPlayer(player),
    refreshHudChrome: () => uiStateSource.refreshHudChrome(),
    showToast: (message) => uiStateSource.showToast(message),
    isSocketConnected: () => socket.connected,
    sendRedeemCodes: (codes) => socialEconomySender.sendRedeemCodes(codes),
    closeSettingsPanel: callbacks.closeSettingsPanel,
    disconnectSocket: () => socket.disconnect(),
    resetGameState: callbacks.resetGameState,
    logout: (message) => loginUI.logout(message),
  });
  const panelRuntimeSource = createMainPanelRuntimeSource({
    store: panelSystem.store,
    reactUiBridge,
  });
  uiStateSource = createMainUiStateSource({
    hud,
    worldPanel,
    mapRuntime,
    zoomSlider,
    zoomLevelEl,
    resizeCanvas: callbacks.resizeCanvas,
    documentRef,
    showToastEl: documentRef.getElementById('toast'),
    getPlayer: () => rootRuntimeSource.getPlayer(),
    getLatestEntities: () => rootRuntimeSource.getLatestEntities(),
  });

  return {
    mailStateSource,
    suggestionStateSource,
    actionStateSource,
    techniqueStateSource,
    attrDetailStateSource,
    questStateSource,
    marketStateSource,
    breakthroughStateSource,
    detailHydrationSource,
    worldSummaryStateSource,
    detailStateSource,
    noticeStateSource,
    inventoryStateSource,
    settingsStateSource,
    panelRuntimeSource,
    uiStateSource,
    panelDeps: {
      sidePanel,
      chatUI,
      bodyTrainingPanel,
      hud,
      lootPanel,
      equipmentPanel,
      npcShopModal,
      craftWorkbenchModal,
      debugPanel,
      attrPanel,
      worldPanel,
      entityDetailModal,
    },    
    /**
 * setPanelDeltaStateSource：写入面板增量状态来源。
 * @param value typeof panelDeltaStateSource 参数说明。
 * @returns 无返回值，直接更新面板Delta状态来源相关状态。
 */

    setPanelDeltaStateSource(value: typeof panelDeltaStateSource) {
      panelDeltaStateSource = value;
    },
  };
}

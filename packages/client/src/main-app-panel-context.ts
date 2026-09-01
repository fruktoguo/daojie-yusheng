/** 本文件负责主面板上下文装配；维护时要区分前端显示派生、用户意图和服务端权威数据，避免把业务真源复制到 UI 层。 */
import { getCurrentAccountName } from './ui/auth-api';
import { DEFAULT_AURA_LEVEL_BASE_VALUE, DUNGEON_PRESENT_RANK_ORDER, S2C, formatDisplayInteger, resolveDungeonStaminaCost, resolveRecoveredStamina, type ActionDef, type DungeonDifficulty, type Inventory, type S2C_DungeonCatalog, type S2C_TileDetail, type SyncedItemStack, type TechniqueGrade } from '@mud/shared';
import { reactUiBridge } from './react-ui/bridge/react-ui-bridge';
import { createMainActionStateSource } from './main-action-state-source';
import { createMainAttrDetailStateSource } from './main-attr-detail-state-source';
import { createMainBreakthroughStateSource } from './main-breakthrough-state-source';
import { createMainBuildingFengShuiStateSource } from './main-building-fengshui-state-source';
import { createMainDetailHydrationSource } from './main-detail-hydration-source';
import { createMainFormationPreviewSource } from './main-formation-preview-source';
import { createMainDetailStateSource } from './main-detail-state-source';
import { createMainInventoryStateSource } from './main-inventory-state-source';
import { createMainMailStateSource } from './main-mail-state-source';
import { createMainActivityStateSource } from './main-activity-state-source';
import { createMainMarketStateSource } from './main-market-state-source';
import { createMainNoticeStateSource } from './main-notice-state-source';
import { createMainPanelRuntimeSource } from './main-panel-runtime-source';
import { createMainQuestStateSource } from './main-quest-state-source';
import { createMainSettingsStateSource } from './main-settings-state-source';
import { createMainSocialStateSource } from './main-social-state-source';
import { bindMainSocialPanelNavigation } from './main-social-panel-navigation';
import { createMainPartyStateSource } from './main-party-state-source';
import { PartyPanel } from './ui/panels/party-panel';
import { PartyFloatingPanel } from './ui/party-floating-panel';
import { PartyWorkspacePanel } from './ui/party-workspace-panel';
import { createMainTimeChamberStateSource } from './main-time-chamber-state-source';
import { createMainTechniqueGenerationPanelSource } from './main-technique-generation-panel-source';
import { createMainTechniqueStateSource } from './main-technique-state-source';
import { createMainUiStateSource } from './main-ui-state-source';
import { createMainWorldSummaryStateSource } from './main-world-summary-state-source';
import type { ClientTechniqueActivityKind } from './technique-activity-client.helpers';
import { getCraftOpenActionId } from './constants/ui/action';
import { openWorldMigrationModal } from './ui/world-migration-modal';
import { openScripturePlatformRecordingModal } from './ui/scripture-platform-modal';
import { resolveNearbyTransmissionTargets } from './main-transmission-targets';
import type { MainDomElements } from './main-dom-elements';
import type { MainFrontendModules } from './main-frontend-modules';
import type { ToastKind } from './main-app-assembly-types';
import { detailModalHost } from './ui/detail-modal-host';
/** CreateMainPanelContextOptions：统一结构类型，保证协议与运行时一致性。 */
type CreateMainPanelContextOptions = {
  /** documentRef：注入浏览器 document，便于测试或宿主环境替换。 */
  documentRef: Document;  
  /** dom：dom相关字段。 */
  dom: Pick<MainDomElements, 'zoomSlider' | 'zoomLevelEl'>;  
  /** modules：模块相关字段。 */
  modules: MainFrontendModules;  
  /** rootRuntimeSource：根容器运行态来源相关字段。 */
  rootRuntimeSource: ReturnType<typeof import('./main-root-runtime-source').createMainRootRuntimeSource>;  
  /** callbacks：callback相关字段。 */
  callbacks: {
    showToast(message: string, kind?: ToastKind): void;
    beginTargeting(actionId: string, actionName: string, targetMode?: string, range?: number): void;
    cancelTargeting(): void;
    hideObserveModal(): void;
    getInfoRadius(): number;
    getPlayerNo?: () => number | null;
    getCurrentActionDef(actionId: string): ActionDef | null;
    clearCurrentPath(): void;
    setCurrentPathCells(cells: Array<{ x: number; y: number }>): void;
    handleTileDetailResult(data: S2C_TileDetail): void;
    resetGameState(): void;
    closeSettingsPanel(): void;
    resizeCanvas(): void;
    hydrateSyncedItemStack(item: SyncedItemStack, previous?: Inventory['items'][number]): Inventory['items'][number];
  };
};
export function createMainPanelContext(options: CreateMainPanelContextOptions) {
  const {
    documentRef,
    dom: { zoomSlider, zoomLevelEl },
    modules: {
      socket,
      runtimeSender,
      panelSender,
      socialEconomySender,
      buildingSender,
      techniqueGenerationSender,
      mapRuntime,
      loginUI,
      hud,
      chatUI,
      sidePanel,
      attrPanel,
      inventoryPanel,
      equipmentPanel,
      techniquePanel,
      bodyTrainingPanel,
      questPanel,
      socialPanel,
      treasureVaultModal,
      actionPanel,
      lootPanel,
      worldPanel,
      settingsPanel,
      npcShopModal,
      npcQuestModal,
      entityDetailModal, timeChamberUsageModal, timeChamberConsoleModal,
      craftWorkbenchModal, accessPolicyClient, panelSystem,
    },
    rootRuntimeSource,
    callbacks,
  } = options;
  const mailStateSource = createMainMailStateSource({
    socket: socialEconomySender,
    recoverSession: () => loginUI.restoreSession(),
  });
  const activityStateSource = createMainActivityStateSource({ socket: socialEconomySender, isSocketConnected: () => socket.connected });
  const socialStateSource = createMainSocialStateSource({ socialPanel, treasureVaultModal, accessPolicyClient, socket: socialEconomySender, getPlayer: () => rootRuntimeSource.getPlayer(), hydrateInventoryItem: (item, previous) => detailHydrationSource.hydrateSyncedItemStack(item, previous), showToast: (message, kind) => uiStateSource.showToast(message, kind) });
  const partyPanel = new PartyPanel(); const partyWorkspace = new PartyWorkspacePanel(partyPanel); const partyHud = new PartyFloatingPanel(); const partyNavigation = bindMainSocialPanelNavigation({ socialPanel, partyPanel: partyWorkspace });
  let dungeonCatalog: S2C_DungeonCatalog | null = null;
  const dungeonModalOwner = 'dungeon-entry-panel';
  const dungeonDifficultyLabels: Record<DungeonDifficulty, string> = { trial: '试炼', hard: '困难', nightmare: '噩梦', present: '现世' };
  const dungeonRankLabels: Record<TechniqueGrade, string> = { mortal: '凡阶', yellow: '黄阶', mystic: '玄阶', earth: '地阶', heaven: '天阶', spirit: '灵阶', saint: '圣阶', emperor: '帝阶' };
  let requestedDungeonId: string | undefined;
  const formatDungeonRecovery = (remainingMs: number): string => {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };
  const renderDungeonUnavailablePanel = (dungeonId: string): void => {
    detailModalHost.patch({
      ownerId: dungeonModalOwner,
      title: '副本不可用',
      subtitle: dungeonId ? `副本标识：${dungeonId}` : '未找到指定副本',
      variantClass: 'detail-modal--dungeon-entry',
      size: 'sm',
      bodyHtml: '<div class="empty-hint compact">当前副本目录已更新，请重新靠近对应忆梦石后再试。</div>',
    });
  };
  const renderDungeonLaunchPanel = (dungeonId: string): void => {
    const catalog = dungeonCatalog;
    const dungeon = catalog?.dungeons.find((entry) => entry.id === dungeonId);
    if (!catalog) {
      return;
    }
    if (!dungeon) {
      renderDungeonUnavailablePanel(dungeonId);
      return;
    }
    requestedDungeonId = dungeon.id;
    const bodyHtml = `<form data-dungeon-launch-form="true" class="dungeon-entry-launch"><div class="dungeon-entry-launch__controls"><label class="dungeon-entry-control"><span>难度</span><select name="difficulty" class="party-select">${Object.entries(dungeonDifficultyLabels).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label><label class="dungeon-entry-control"><span>现世阶位</span><select name="presentRank" class="party-select">${DUNGEON_PRESENT_RANK_ORDER.map((rank) => `<option value="${rank}">${dungeonRankLabels[rank]}</option>`).join('')}</select></label></div><div class="dungeon-entry-stamina"><span class="dungeon-entry-stamina__label">消耗体力</span><strong data-dungeon-stamina-value></strong><span data-dungeon-stamina-recovery></span></div><div class="dungeon-entry-launch__hint">确认发起后，将邀请队友逐一确认；全员确认后才会扣除体力并进入副本。</div><div class="dungeon-entry-launch__actions"><button type="submit" class="small-btn primary" data-dungeon-submit>确认发起并邀请队友确认</button></div></form>`;
    detailModalHost.patch({ ownerId: dungeonModalOwner, title: `副本·${dungeon.name}`, subtitle: '调整难度和阶位', variantClass: 'detail-modal--dungeon-entry', size: 'sm', bodyHtml, onAfterRender: (body, signal) => {
      const form = body.querySelector<HTMLFormElement>('[data-dungeon-launch-form="true"]');
      const difficulty = form?.elements.namedItem('difficulty') as HTMLSelectElement | null;
      const rank = form?.elements.namedItem('presentRank') as HTMLSelectElement | null;
      const staminaValue = body.querySelector<HTMLElement>('[data-dungeon-stamina-value]');
      const staminaRecovery = body.querySelector<HTMLElement>('[data-dungeon-stamina-recovery]');
      const submit = body.querySelector<HTMLButtonElement>('[data-dungeon-submit]');
      if (!form || !difficulty || !rank || !staminaValue || !staminaRecovery || !submit) return;
      const syncRank = (): void => {
        const maxRankStep = DUNGEON_PRESENT_RANK_ORDER.indexOf(dungeon.difficulty.maxPresentRank);
        Array.from(rank.options).forEach((option, index) => { option.disabled = index > maxRankStep; });
        if (rank.selectedIndex > maxRankStep && maxRankStep >= 0) rank.selectedIndex = maxRankStep;
        rank.disabled = difficulty.value !== 'present';
      };
      const syncStamina = (): void => {
        const stamina = resolveRecoveredStamina(catalog.stamina.current, catalog.stamina.updatedAt, Date.now(), catalog.stamina.maximum);
        const selectedDifficulty = difficulty.value as DungeonDifficulty;
        const cost = resolveDungeonStaminaCost(selectedDifficulty, dungeon.difficulty);
        const afterCost = Math.max(0, stamina.current - cost);
        staminaValue.textContent = `${formatDisplayInteger(stamina.current)} → ${formatDisplayInteger(afterCost)} / ${formatDisplayInteger(catalog.stamina.maximum)}`;
        staminaValue.classList.toggle('is-insufficient', stamina.current < cost);
        const recoveryRemain = stamina.nextRecoveryAt ? Math.max(0, stamina.nextRecoveryAt - Date.now()) : 0;
        staminaRecovery.textContent = stamina.current >= catalog.stamina.maximum ? '恢复倒计时：已满' : `恢复倒计时：${formatDungeonRecovery(recoveryRemain)} 后恢复 1 点`;
        submit.disabled = stamina.current < cost;
        submit.textContent = stamina.current < cost ? '体力不足' : '确认发起并邀请队友确认';
      };
      syncRank();
      syncStamina();
      difficulty.addEventListener('change', syncRank, { signal });
      difficulty.addEventListener('change', syncStamina, { signal });
      const timer = window.setInterval(syncStamina, 1000);
      signal.addEventListener('abort', () => window.clearInterval(timer), { once: true });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const selectedDifficulty = difficulty.value as DungeonDifficulty;
        const presentRank = selectedDifficulty === 'present' ? (rank.value as TechniqueGrade) : undefined;
        socket.dungeon.startEntry({ dungeonId: dungeon.id, difficulty: selectedDifficulty, ...(presentRank ? { presentRank } : {}) });
        detailModalHost.close(dungeonModalOwner);
      }, { signal });
    } });
  };
  const renderDungeonEntryPanel = (): void => {
    const catalog = dungeonCatalog;
    if (!catalog) return;
    if (!requestedDungeonId) {
      renderDungeonUnavailablePanel('');
      return;
    }
    const selected = catalog.dungeons.find((entry) => entry.id === requestedDungeonId);
    if (selected) {
      renderDungeonLaunchPanel(selected.id);
    } else {
      renderDungeonUnavailablePanel(requestedDungeonId);
    }
  };
  socket.on(S2C.DungeonCatalog, (catalog) => { dungeonCatalog = catalog; if (detailModalHost.isOpenFor(dungeonModalOwner)) renderDungeonEntryPanel(); });
  const openDungeonPanel = (dungeonId: string): void => {
    const normalizedDungeonId = dungeonId.trim();
    if (!normalizedDungeonId) {
      callbacks.showToast('当前忆梦石未绑定副本', 'warn');
      return;
    }
    requestedDungeonId = normalizedDungeonId;
    dungeonCatalog = null;
    detailModalHost.open({ ownerId: dungeonModalOwner, title: `副本·${normalizedDungeonId}`, subtitle: '正在读取副本信息……', size: 'sm', variantClass: 'detail-modal--dungeon-entry', bodyHtml: '<div class="empty-hint compact">正在读取副本信息……</div>' });
    socket.dungeon.requestCatalog();
  };
  const partyStateSource = createMainPartyStateSource({
    partyPanel, partyHud, chatUI, openPartyPanel: partyNavigation.openPartyPanel, openPartyChat: () => { partyWorkspace.close(false); sidePanel.switchTab('logbook'); chatUI.openChannel('party'); },
    setPartyPanelAvailable: (available) => { partyWorkspace.setAvailable(available); socialPanel.setPartyAvailable(available); },
    setPartyUnread: (count) => { partyWorkspace.setUnreadCount(count); socialPanel.setPartyUnread(count); },
    socket: socket.party, getPlayerId: () => rootRuntimeSource.getPlayer()?.id ?? null, showToast: (message, kind) => uiStateSource.showToast(message, kind),
  });
  socialPanel.setPartyInviteHandler((targetPlayerId) => socket.party.sendInvitePartyPlayer({ targetPlayerId }));
  sidePanel.initializeTabs();
  craftWorkbenchModal.setAccessPolicyClient(accessPolicyClient, (message, kind) => uiStateSource.showToast(message, kind));
  const timeChamberStateSource = createMainTimeChamberStateSource({ usageModal: timeChamberUsageModal, managementModal: timeChamberConsoleModal, socket: buildingSender, getPlayer: () => rootRuntimeSource.getPlayer(), showToast: (message, kind) => uiStateSource.showToast(message, kind) });
  let uiStateSource!: ReturnType<typeof createMainUiStateSource>;
  let panelDeltaStateSource!: ReturnType<typeof import('./main-panel-delta-state-source').createMainPanelDeltaStateSource>;
  const techniqueActivityOpeners = { alchemy: () => craftWorkbenchModal.openAlchemy(), forging: () => craftWorkbenchModal.openForging(), enhancement: () => craftWorkbenchModal.openEnhancement() } as const satisfies Record<ClientTechniqueActivityKind | 'forging', () => void>;
  const techniqueGenerationPanelSource = createMainTechniqueGenerationPanelSource({ sender: techniqueGenerationSender });
  const actionStateSource = createMainActionStateSource({
    actionPanel,
    socket: runtimeSender,
    requestSectApplicationPage: (payload) => panelSender.sendRequestSectApplicationPage(payload),
    beginTargeting: callbacks.beginTargeting,
    cancelTargeting: callbacks.cancelTargeting,
    hideObserveModal: callbacks.hideObserveModal,
    openBreakthroughModal: () => breakthroughStateSource.openBreakthroughModal(),
    openNpcShop: (npcId) => npcShopModal.open(npcId),
    openNpcQuestPending: (npcId) => npcQuestModal.openPending(npcId),
    openTechniqueActivity: (kind) => techniqueActivityOpeners[kind](),
    openBuildingPanel: () => buildingFengShuiStateSource.openBuildingPanel(),
    openTransmissionPanel: () => craftWorkbenchModal.openTransmission(),
    openTechniqueRefiningPanel: () => craftWorkbenchModal.openTechniqueRefining(),
    openTechniqueAggregationPanel: (buildingId) => craftWorkbenchModal.openTechniqueAggregation(buildingId),
    openScripturePlatformRecordingModal: (buildingId) => openScripturePlatformRecordingModal({ buildingId, getPlayer: () => rootRuntimeSource.getPlayer(), sendAction: (actionId) => runtimeSender.sendAction(actionId), showToast: (message, kind) => callbacks.showToast(message, kind) }),
    openTreasureVault: (buildingId) => socialStateSource.openTreasureVault(buildingId),
    openTimeChamberUsage: (buildingId) => timeChamberStateSource.openUsage(buildingId), openTimeChamberManagement: (buildingId) => timeChamberStateSource.openManagement(buildingId),
    openWorldMigrationModal: () => openWorldMigrationModal({
      getPlayer: () => rootRuntimeSource.getPlayer(),
      sendAction: (actionId, target) => runtimeSender.sendAction(actionId, target),
      showToast: (message, kind) => callbacks.showToast(message, kind),
    }),
    openDungeonPanel,
    getInfoRadius: callbacks.getInfoRadius,
    getPlayer: () => rootRuntimeSource.getPlayer(),
    showToast: callbacks.showToast,
    getCurrentActionDef: callbacks.getCurrentActionDef,
  });
  const techniqueStateSource = createMainTechniqueStateSource({ techniquePanel, socket: runtimeSender, panelSocket: panelSender });
  craftWorkbenchModal.setTransmissionCallbacks({
    getTransmissionTargets: () => resolveNearbyTransmissionTargets(rootRuntimeSource.getPlayer(), rootRuntimeSource.getLatestEntities()),
    onRequestTransmissionStatuses: (payload) => panelSender.sendRequestTechniqueTransmissionStatuses(payload),
    onStartTransmission: (learnerPlayerId, techId, options) => runtimeSender.sendStartTechniqueTransmission(learnerPlayerId, techId, options),
    onCancelTransmission: (techId) => runtimeSender.sendCancelTechniqueTransmission(techId), onDiscardTechniqueComprehension: (techId) => runtimeSender.sendDiscardTechniqueComprehension(techId),
  });
  const attrDetailStateSource = createMainAttrDetailStateSource({
    attrPanel,
    socket: panelSender,
    getPlayer: () => rootRuntimeSource.getPlayer(),
    getLatestAttrUpdate: () => panelDeltaStateSource.getLatestAttrUpdate(),
    setLatestAttrUpdate: (value) => panelDeltaStateSource.setLatestAttrUpdate(value),
    mergeAttrUpdatePatch: (current, data) => panelDeltaStateSource.mergeAttrUpdatePatch(current, data),
    cloneJson: (value) => detailHydrationSource.cloneJson(value),
    onOpenCraftSkill: (key) => {
      if (key === 'building') { buildingFengShuiStateSource.openBuildingPanel(); return; }
      if (key === 'transmission') { craftWorkbenchModal.openTransmission(); return; }
      techniqueActivityOpeners[key as keyof typeof techniqueActivityOpeners]?.();
    },
    onBindCraftSkill: (key) => { const actionId = getCraftOpenActionId(key); if (actionId) actionPanel.toggleShortcutBinding(actionId); },
    getCraftSkillBindLabel: (key) => { const actionId = getCraftOpenActionId(key); return actionId ? actionPanel.getShortcutBindLabel(actionId) : '绑定键'; },
  });
  const questStateSource = createMainQuestStateSource({
    questPanel,
    npcQuestModal,
    clearCurrentPath: callbacks.clearCurrentPath,
    setCurrentPathCells: callbacks.setCurrentPathCells,
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
    openTechniqueGeneration: () => techniqueGenerationPanelSource.openNamedPanel('technique_generation'),
  });
  const breakthroughStateSource = createMainBreakthroughStateSource({
    getPlayer: () => rootRuntimeSource.getPlayer(),
    showToast: callbacks.showToast,
    sendHeavenGateAction: (action, element) => runtimeSender.sendHeavenGateAction(action, element),
    sendAction: (actionId) => runtimeSender.sendAction(actionId),
    defaultAuraLevelBaseValue: DEFAULT_AURA_LEVEL_BASE_VALUE,
  });
  const detailHydrationSource = createMainDetailHydrationSource({ hydrateSyncedItemStack: callbacks.hydrateSyncedItemStack });
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
    getCurrentPlayerId: () => rootRuntimeSource.getPlayer()?.id ?? null,
    onOpenPanel: techniqueGenerationPanelSource.openNamedPanel,
  });
  const formationPreviewSource = createMainFormationPreviewSource({
    getPlayer: () => rootRuntimeSource.getPlayer(),
    getMapMeta: () => mapRuntime.getMapMeta(),
    setFormationRangeOverlay: (overlay) => mapRuntime.setFormationRangeOverlay(overlay),
  });
  const buildingFengShuiStateSource = createMainBuildingFengShuiStateSource({
    socket: buildingSender, setFengShuiOverlay: (overlay) => mapRuntime.setFengShuiOverlay(overlay), setBuildPreviewOverlay: (overlay) => mapRuntime.setBuildPreviewOverlay(overlay), getVisibleTileAt: (x, y) => mapRuntime.getVisibleTileAt(x, y),
    getPlayer: () => rootRuntimeSource.getPlayer(),
    showToast: callbacks.showToast,
    beginTargeting: callbacks.beginTargeting,
    cancelTargeting: callbacks.cancelTargeting,
    getInfoRadius: callbacks.getInfoRadius,
    sidePanel,
  });
  const inventoryStateSource = createMainInventoryStateSource({
    inventoryPanel,
    questStateSource,
    marketStateSource,
    npcShopModal,
    craftWorkbenchModal,
    syncInventoryBridgeState: (inventory) => reactUiBridge.syncInventory(inventory),
    syncPlayerBridgeState: (player) => reactUiBridge.syncPlayer(player),
    sendUseItem: (itemInstanceId, count, useOptions) => panelSender.sendUseItem(itemInstanceId, count, useOptions),
    sendRepairInventoryItemInstanceIds: () => panelSender.sendRepairInventoryItemInstanceIds(),
    sendRequestInventoryPage: (payload) => panelSender.sendRequestInventoryPage(payload), hydrateSyncedItemStack: (item, previous) => detailHydrationSource.hydrateSyncedItemStack(item, previous),
    sendCreateFormation: (payload) => panelSender.sendCreateFormation(payload),
    previewFormationRange: (payload) => formationPreviewSource.preview(payload),
    sendDropItem: (itemInstanceId, count) => panelSender.sendDropItem(itemInstanceId, count), sendBulkDropItems: (itemInstanceIds) => panelSender.sendBulkDropItems(itemInstanceIds),
    sendDestroyItem: (itemInstanceId, count) => panelSender.sendDestroyItem(itemInstanceId, count),
    sendEquip: (itemInstanceId) => panelSender.sendEquip(itemInstanceId),
    sendSortInventory: () => panelSender.sendSortInventory(),
  });
  const settingsStateSource = createMainSettingsStateSource({
    settingsPanel,
    getCurrentAccountName: () => getCurrentAccountName() ?? '',
    getCurrentPlayerId: () => rootRuntimeSource.getPlayer()?.id ?? '',
    getPlayerNo: () => callbacks.getPlayerNo?.() ?? null,
    getPlayer: () => rootRuntimeSource.getPlayer(),
    applyVisibleDisplayName: (playerId, displayName) => rootRuntimeSource.applyVisibleDisplayName(playerId, displayName),
    applyVisibleRoleName: (playerId, roleName) => rootRuntimeSource.applyVisibleRoleName(playerId, roleName),
    syncPlayerBridgeState: (player) => reactUiBridge.syncPlayer(player),
    refreshHudChrome: () => uiStateSource.refreshHudChrome(),
    showToast: (message) => uiStateSource.showToast(message),
    isSocketConnected: () => socket.connected,
    sendRedeemCodes: (requestId, codes) => socialEconomySender.sendRedeemCodes(requestId, codes),
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
  });
  return {
    mailStateSource, activityStateSource, socialStateSource, partyStateSource, timeChamberStateSource, buildingFengShuiStateSource,
    actionStateSource, techniqueStateSource, attrDetailStateSource, questStateSource, marketStateSource, breakthroughStateSource,
    detailHydrationSource, worldSummaryStateSource, detailStateSource, noticeStateSource, inventoryStateSource, settingsStateSource,
    panelRuntimeSource, uiStateSource,
    openDungeonPanel,
    panelDeps: {
      sidePanel,
      chatUI,
      bodyTrainingPanel,
      hud,
      lootPanel,
      equipmentPanel,
      npcShopModal,
      craftWorkbenchModal,
      attrPanel,
      worldPanel,
      entityDetailModal,
    },
    setPanelDeltaStateSource(value: typeof panelDeltaStateSource) {
      panelDeltaStateSource = value;
    },
  };
}

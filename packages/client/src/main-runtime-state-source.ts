import {
  NEXT_S2C_Bootstrap,
  NEXT_S2C_InitSession,
  NEXT_S2C_MapEnter,
  NEXT_S2C_MapStatic,
  NEXT_S2C_PanelDelta,
  NEXT_S2C_Realm,
  NEXT_S2C_SelfDelta,
  NEXT_S2C_WorldDelta,
  PlayerState,
  TechniqueState,
  ActionDef,
} from '@mud/shared-next';

type MainRuntimeStateSourceOptions = {
  getPlayer: () => PlayerState | null;
  setPlayer: (player: PlayerState | null) => void;
  getLatestAttrUpdate: () => ReturnType<MainRuntimeStateSourceOptions['buildAttrStateFromPlayer']> | null;
  setLatestAttrUpdate: (value: ReturnType<MainRuntimeStateSourceOptions['buildAttrStateFromPlayer']> | null) => void;
  syncAuraLevelBaseValue: (value?: number) => void;
  syncCurrentTimeState: (state: NEXT_S2C_Bootstrap['time'] | null | undefined) => void;
  resolvePreviewTechniques: (techniques: TechniqueState[]) => TechniqueState[];
  buildAttrStateFromPlayer: (player: PlayerState) => NEXT_S2C_Bootstrap['self'] extends infer _T ? any : never;
  syncPlayerBridgeState: (player: PlayerState | null) => void;
  syncAttrBridgeState: (value: ReturnType<MainRuntimeStateSourceOptions['buildAttrStateFromPlayer']> | null) => void;
  syncInventoryBridgeState: (inventory: PlayerState['inventory'] | null) => void;
  syncEquipmentBridgeState: (equipment: PlayerState['equipment'] | null) => void;
  syncTechniquesBridgeState: (techniques: PlayerState['techniques'], cultivatingTechId?: string) => void;
  syncActionsBridgeState: (actions: PlayerState['actions'], autoBattle: boolean, autoRetaliate: boolean) => void;
  syncBootstrapQuestState: (player: PlayerState) => void;
  syncTargetingOverlay: () => void;
  syncSenseQiOverlay: () => void;
  applyBootstrapToMapRuntime: (data: NEXT_S2C_Bootstrap) => void;
  applyMapStaticToRuntime: (data: NEXT_S2C_MapStatic) => void;
  setRuntimePathCells: () => void;
  resetObservedBaselinesFromPlayer: (player: PlayerState) => void;
  clearCurrentPath: () => void;
  showSidePanel: () => void;
  setChatPersistenceScope: (scope: string | null) => void;
  showChat: () => void;
  showHud: () => void;
  resizeCanvas: () => void;
  refreshZoomChrome: () => void;
  setPanelRuntime: (state: { connected?: boolean; playerId?: string | null; mapId?: string | null; shellVisible?: boolean }) => void;
  initAttrPanel: (player: PlayerState) => void;
  initAttrDetail: () => void;
  initInventoryState: (player: PlayerState) => void;
  initEquipmentPanel: (player: PlayerState) => void;
  initTechniqueState: (player: PlayerState) => void;
  initBodyTrainingPanel: (player: PlayerState) => void;
  initQuestState: (player: PlayerState) => void;
  initActionState: (player: PlayerState) => void;
  initWorldSummaryState: () => void;
  refreshUiChrome: () => void;
  initMailState: (playerId: string) => void;
  initSuggestionState: (playerId: string) => void;
  hideObserveModal: () => void;
  applyWorldDelta: (data: NEXT_S2C_WorldDelta) => void;
  applySelfDelta: (data: NEXT_S2C_SelfDelta) => void;
  applyPanelDelta: (data: NEXT_S2C_PanelDelta) => void;
  inventorySyncPlayerContext: (player?: PlayerState) => void;
  refreshHeavenGateModal: (player: PlayerState | null) => void;
};

export type MainRuntimeStateSource = ReturnType<typeof createMainRuntimeStateSource>;

export function createMainRuntimeStateSource(options: MainRuntimeStateSourceOptions) {
  let latestNextInitSession: NEXT_S2C_InitSession | null = null;
  let latestNextMapEnter: NEXT_S2C_MapEnter | null = null;
  let pendingNextWorldDelta: NEXT_S2C_WorldDelta | null = null;
  let pendingNextSelfDelta: NEXT_S2C_SelfDelta | null = null;
  let pendingNextPanelDelta: NEXT_S2C_PanelDelta | null = null;

  const flushPendingNextBootstrapEnvelope = (): void => {
    if (!options.getPlayer()) {
      return;
    }
    if (pendingNextWorldDelta) {
      const pending = pendingNextWorldDelta;
      pendingNextWorldDelta = null;
      options.applyWorldDelta(pending);
    }
    if (pendingNextSelfDelta) {
      const pending = pendingNextSelfDelta;
      pendingNextSelfDelta = null;
      options.applySelfDelta(pending);
    }
    if (pendingNextPanelDelta) {
      const pending = pendingNextPanelDelta;
      pendingNextPanelDelta = null;
      options.applyPanelDelta(pending);
    }
  };

  return {
    clear(): void {
      latestNextInitSession = null;
      latestNextMapEnter = null;
      pendingNextWorldDelta = null;
      pendingNextSelfDelta = null;
      pendingNextPanelDelta = null;
    },

    handleInitSession(data: NEXT_S2C_InitSession): void {
      latestNextInitSession = data;
    },

    handleMapEnter(data: NEXT_S2C_MapEnter): void {
      latestNextMapEnter = data;
    },

    handleWorldDelta(data: NEXT_S2C_WorldDelta): void {
      if (!options.getPlayer()) {
        pendingNextWorldDelta = data;
        return;
      }
      options.applyWorldDelta(data);
    },

    handleSelfDelta(data: NEXT_S2C_SelfDelta): void {
      if (!options.getPlayer()) {
        pendingNextSelfDelta = data;
        return;
      }
      options.applySelfDelta(data);
    },

    handlePanelDelta(data: NEXT_S2C_PanelDelta): void {
      if (!options.getPlayer()) {
        pendingNextPanelDelta = data;
        return;
      }
      options.applyPanelDelta(data);
    },

    handleRealm(data: NEXT_S2C_Realm): void {
      const player = options.getPlayer();
      if (!player) {
        return;
      }
      const latestAttrUpdate = options.getLatestAttrUpdate();
      const nextRealm = data.realm ? JSON.parse(JSON.stringify(data.realm)) : undefined;
      player.realm = nextRealm;
      player.realmLv = nextRealm?.realmLv;
      player.realmName = nextRealm?.name;
      player.realmStage = nextRealm?.shortName;
      player.realmReview = nextRealm?.review;
      player.breakthroughReady = nextRealm?.breakthroughReady;
      player.heavenGate = nextRealm?.heavenGate ?? undefined;

      if (nextRealm && latestAttrUpdate) {
        nextRealm.progress = latestAttrUpdate.realmProgress ?? nextRealm.progress;
        nextRealm.progressToNext = latestAttrUpdate.realmProgressToNext ?? nextRealm.progressToNext;
        nextRealm.breakthroughReady = latestAttrUpdate.realmBreakthroughReady ?? nextRealm.breakthroughReady;
        player.breakthroughReady = nextRealm.breakthroughReady;
      }

      options.refreshHeavenGateModal(player);
      options.inventorySyncPlayerContext(player ?? undefined);
      options.refreshUiChrome();
    },

    handleMapStatic(data: NEXT_S2C_MapStatic): void {
      options.applyMapStaticToRuntime(data);
      const player = options.getPlayer();
      if (player && data.minimapLibrary) {
        player.unlockedMinimapIds = data.minimapLibrary.map((entry) => entry.mapId).sort();
        options.inventorySyncPlayerContext(player);
      }
      if (player && data.mapId === player.mapId) {
        options.refreshUiChrome();
      }
    },

    handleBootstrap(data: NEXT_S2C_Bootstrap): void {
      options.hideObserveModal();
      latestNextInitSession = latestNextInitSession?.pid === data.self.id ? latestNextInitSession : null;
      latestNextMapEnter = latestNextMapEnter?.mid === data.self.mapId ? latestNextMapEnter : null;
      options.syncAuraLevelBaseValue(data.auraLevelBaseValue);

      const player = data.self;
      player.techniques = options.resolvePreviewTechniques(player.techniques);
      options.syncCurrentTimeState(data.time ?? null);
      options.setLatestAttrUpdate(options.buildAttrStateFromPlayer(player));
      player.senseQiActive = player.senseQiActive === true;
      player.autoBattleStationary = player.autoBattleStationary === true;
      player.allowAoePlayerHit = player.allowAoePlayerHit === true;
      player.autoIdleCultivation = player.autoIdleCultivation !== false;
      player.autoSwitchCultivation = player.autoSwitchCultivation === true;
      player.cultivationActive = player.cultivationActive === true;

      options.setPlayer(player);
      options.syncPlayerBridgeState(player);
      options.syncAttrBridgeState(options.getLatestAttrUpdate());
      options.syncInventoryBridgeState(player.inventory);
      options.syncEquipmentBridgeState(player.equipment);
      options.syncTechniquesBridgeState(player.techniques, player.cultivatingTechId);
      options.syncActionsBridgeState(player.actions, player.autoBattle, player.autoRetaliate !== false);
      options.syncBootstrapQuestState(player);
      options.syncTargetingOverlay();
      options.applyBootstrapToMapRuntime(data);
      options.syncSenseQiOverlay();
      options.resetObservedBaselinesFromPlayer(player);
      options.clearCurrentPath();
      options.setRuntimePathCells();
      options.showSidePanel();
      options.setChatPersistenceScope(player.id);
      options.showChat();
      options.showHud();
      options.resizeCanvas();
      options.refreshZoomChrome();
      options.setPanelRuntime({
        connected: true,
        playerId: latestNextInitSession?.pid ?? player.id,
        mapId: player.mapId,
        shellVisible: true,
      });
      options.initAttrPanel(player);
      options.initAttrDetail();
      options.initInventoryState(player);
      options.initEquipmentPanel(player);
      options.initTechniqueState(player);
      options.initBodyTrainingPanel(player);
      options.initQuestState(player);
      options.initActionState(player);
      options.initWorldSummaryState();
      options.refreshUiChrome();
      options.initMailState(player.id);
      options.initSuggestionState(player.id);
      flushPendingNextBootstrapEnvelope();
    },
  };
}

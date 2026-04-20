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
/**
 * MainRuntimeStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainRuntimeStateSourceOptions = {
/**
 * getPlayer：对象字段。
 */

  getPlayer: () => PlayerState | null;  
  /**
 * setPlayer：对象字段。
 */

  setPlayer: (player: PlayerState | null) => void;  
  /**
 * getLatestAttrUpdate：对象字段。
 */

  getLatestAttrUpdate: () => ReturnType<MainRuntimeStateSourceOptions['buildAttrStateFromPlayer']> | null;  
  /**
 * setLatestAttrUpdate：对象字段。
 */

  setLatestAttrUpdate: (value: ReturnType<MainRuntimeStateSourceOptions['buildAttrStateFromPlayer']> | null) => void;  
  /**
 * syncAuraLevelBaseValue：对象字段。
 */

  syncAuraLevelBaseValue: (value?: number) => void;  
  /**
 * syncCurrentTimeState：对象字段。
 */

  syncCurrentTimeState: (state: NEXT_S2C_Bootstrap['time'] | null | undefined) => void;  
  /**
 * resolvePreviewTechniques：对象字段。
 */

  resolvePreviewTechniques: (techniques: TechniqueState[]) => TechniqueState[];  
  /**
 * buildAttrStateFromPlayer：对象字段。
 */

  buildAttrStateFromPlayer: (player: PlayerState) => NEXT_S2C_Bootstrap['self'] extends infer _T ? any : never;  
  /**
 * syncPlayerBridgeState：对象字段。
 */

  syncPlayerBridgeState: (player: PlayerState | null) => void;  
  /**
 * syncAttrBridgeState：对象字段。
 */

  syncAttrBridgeState: (value: ReturnType<MainRuntimeStateSourceOptions['buildAttrStateFromPlayer']> | null) => void;  
  /**
 * syncInventoryBridgeState：对象字段。
 */

  syncInventoryBridgeState: (inventory: PlayerState['inventory'] | null) => void;  
  /**
 * syncEquipmentBridgeState：对象字段。
 */

  syncEquipmentBridgeState: (equipment: PlayerState['equipment'] | null) => void;  
  /**
 * syncTechniquesBridgeState：对象字段。
 */

  syncTechniquesBridgeState: (techniques: PlayerState['techniques'], cultivatingTechId?: string) => void;  
  /**
 * syncActionsBridgeState：对象字段。
 */

  syncActionsBridgeState: (actions: PlayerState['actions'], autoBattle: boolean, autoRetaliate: boolean) => void;  
  /**
 * syncBootstrapQuestState：对象字段。
 */

  syncBootstrapQuestState: (player: PlayerState) => void;  
  /**
 * syncTargetingOverlay：对象字段。
 */

  syncTargetingOverlay: () => void;  
  /**
 * syncSenseQiOverlay：对象字段。
 */

  syncSenseQiOverlay: () => void;  
  /**
 * applyBootstrapToMapRuntime：对象字段。
 */

  applyBootstrapToMapRuntime: (data: NEXT_S2C_Bootstrap) => void;  
  /**
 * applyMapStaticToRuntime：对象字段。
 */

  applyMapStaticToRuntime: (data: NEXT_S2C_MapStatic) => void;  
  /**
 * setRuntimePathCells：对象字段。
 */

  setRuntimePathCells: () => void;  
  /**
 * resetObservedBaselinesFromPlayer：对象字段。
 */

  resetObservedBaselinesFromPlayer: (player: PlayerState) => void;  
  /**
 * clearCurrentPath：对象字段。
 */

  clearCurrentPath: () => void;  
  /**
 * showSidePanel：对象字段。
 */

  showSidePanel: () => void;  
  /**
 * setChatPersistenceScope：对象字段。
 */

  setChatPersistenceScope: (scope: string | null) => void;  
  /**
 * showChat：对象字段。
 */

  showChat: () => void;  
  /**
 * showHud：对象字段。
 */

  showHud: () => void;  
  /**
 * resizeCanvas：对象字段。
 */

  resizeCanvas: () => void;  
  /**
 * refreshZoomChrome：对象字段。
 */

  refreshZoomChrome: () => void;  
  /**
 * setPanelRuntime：对象字段。
 */

  setPanelRuntime: (state: {  
  /**
 * connected：对象字段。
 */
 connected?: boolean;  
 /**
 * playerId：对象字段。
 */
 playerId?: string | null;  
 /**
 * mapId：对象字段。
 */
 mapId?: string | null;  
 /**
 * shellVisible：对象字段。
 */
 shellVisible?: boolean }) => void;  
 /**
 * initAttrPanel：对象字段。
 */

  initAttrPanel: (player: PlayerState) => void;  
  /**
 * initAttrDetail：对象字段。
 */

  initAttrDetail: () => void;  
  /**
 * initInventoryState：对象字段。
 */

  initInventoryState: (player: PlayerState) => void;  
  /**
 * initEquipmentPanel：对象字段。
 */

  initEquipmentPanel: (player: PlayerState) => void;  
  /**
 * initTechniqueState：对象字段。
 */

  initTechniqueState: (player: PlayerState) => void;  
  /**
 * initBodyTrainingPanel：对象字段。
 */

  initBodyTrainingPanel: (player: PlayerState) => void;  
  /**
 * initQuestState：对象字段。
 */

  initQuestState: (player: PlayerState) => void;  
  /**
 * initActionState：对象字段。
 */

  initActionState: (player: PlayerState) => void;  
  /**
 * initWorldSummaryState：对象字段。
 */

  initWorldSummaryState: () => void;  
  /**
 * refreshUiChrome：对象字段。
 */

  refreshUiChrome: () => void;  
  /**
 * initMailState：对象字段。
 */

  initMailState: (playerId: string) => void;  
  /**
 * initSuggestionState：对象字段。
 */

  initSuggestionState: (playerId: string) => void;  
  /**
 * hideObserveModal：对象字段。
 */

  hideObserveModal: () => void;  
  /**
 * applyWorldDelta：对象字段。
 */

  applyWorldDelta: (data: NEXT_S2C_WorldDelta) => void;  
  /**
 * applySelfDelta：对象字段。
 */

  applySelfDelta: (data: NEXT_S2C_SelfDelta) => void;  
  /**
 * applyPanelDelta：对象字段。
 */

  applyPanelDelta: (data: NEXT_S2C_PanelDelta) => void;  
  /**
 * inventorySyncPlayerContext：对象字段。
 */

  inventorySyncPlayerContext: (player?: PlayerState) => void;  
  /**
 * refreshHeavenGateModal：对象字段。
 */

  refreshHeavenGateModal: (player: PlayerState | null) => void;
};
/**
 * MainRuntimeStateSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainRuntimeStateSource = ReturnType<typeof createMainRuntimeStateSource>;
/**
 * createMainRuntimeStateSource：构建并返回目标对象。
 * @param options MainRuntimeStateSourceOptions 选项参数。
 * @returns 函数返回值。
 */


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
  /**
 * clear：执行核心业务逻辑。
 * @returns void。
 */

    clear(): void {
      latestNextInitSession = null;
      latestNextMapEnter = null;
      pendingNextWorldDelta = null;
      pendingNextSelfDelta = null;
      pendingNextPanelDelta = null;
    },    
    /**
 * handleInitSession：处理事件并驱动执行路径。
 * @param data NEXT_S2C_InitSession 原始数据。
 * @returns void。
 */


    handleInitSession(data: NEXT_S2C_InitSession): void {
      latestNextInitSession = data;
    },    
    /**
 * handleMapEnter：处理事件并驱动执行路径。
 * @param data NEXT_S2C_MapEnter 原始数据。
 * @returns void。
 */


    handleMapEnter(data: NEXT_S2C_MapEnter): void {
      latestNextMapEnter = data;
    },    
    /**
 * handleWorldDelta：处理事件并驱动执行路径。
 * @param data NEXT_S2C_WorldDelta 原始数据。
 * @returns void。
 */


    handleWorldDelta(data: NEXT_S2C_WorldDelta): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      if (!options.getPlayer()) {
        pendingNextWorldDelta = data;
        return;
      }
      options.applyWorldDelta(data);
    },    
    /**
 * handleSelfDelta：处理事件并驱动执行路径。
 * @param data NEXT_S2C_SelfDelta 原始数据。
 * @returns void。
 */


    handleSelfDelta(data: NEXT_S2C_SelfDelta): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      if (!options.getPlayer()) {
        pendingNextSelfDelta = data;
        return;
      }
      options.applySelfDelta(data);
    },    
    /**
 * handlePanelDelta：处理事件并驱动执行路径。
 * @param data NEXT_S2C_PanelDelta 原始数据。
 * @returns void。
 */


    handlePanelDelta(data: NEXT_S2C_PanelDelta): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      if (!options.getPlayer()) {
        pendingNextPanelDelta = data;
        return;
      }
      options.applyPanelDelta(data);
    },    
    /**
 * handleRealm：处理事件并驱动执行路径。
 * @param data NEXT_S2C_Realm 原始数据。
 * @returns void。
 */


    handleRealm(data: NEXT_S2C_Realm): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * handleMapStatic：处理事件并驱动执行路径。
 * @param data NEXT_S2C_MapStatic 原始数据。
 * @returns void。
 */


    handleMapStatic(data: NEXT_S2C_MapStatic): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * handleBootstrap：处理事件并驱动执行路径。
 * @param data NEXT_S2C_Bootstrap 原始数据。
 * @returns void。
 */


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

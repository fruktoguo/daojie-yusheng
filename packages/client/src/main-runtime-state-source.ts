import {
  S2C_Bootstrap,
  S2C_InitSession,
  S2C_MapEnter,
  S2C_MapStatic,
  S2C_PanelDelta,
  S2C_Realm,
  S2C_SelfDelta,
  S2C_WorldDelta,
  PlayerState,
  TechniqueState,
  ActionDef,
} from '@mud/shared';
import { getLocalSkillTemplate, resolvePreviewItem, resolvePreviewQuests } from './content/local-templates';
import { getStaticClientActionDef } from './constants/ui/action';
/**
 * MainRuntimeStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainRuntimeStateSourceOptions = {
/**
 * getPlayer：玩家引用。
 */

  getPlayer: () => PlayerState | null;  
  /**
 * setPlayer：玩家引用。
 */

  setPlayer: (player: PlayerState | null) => void;  
  /**
 * getLatestAttrUpdate：LatestAttrUpdate相关字段。
 */

  getLatestAttrUpdate: () => ReturnType<MainRuntimeStateSourceOptions['buildAttrStateFromPlayer']> | null;  
  /**
 * setLatestAttrUpdate：LatestAttrUpdate相关字段。
 */

  setLatestAttrUpdate: (value: ReturnType<MainRuntimeStateSourceOptions['buildAttrStateFromPlayer']> | null) => void;  
  /**
 * syncAuraLevelBaseValue：Aura等级Base值数值。
 */

  syncAuraLevelBaseValue: (value?: number) => void;  
  /**
 * syncCurrentTimeState：Current时间状态状态或数据块。
 */

  syncCurrentTimeState: (state: S2C_Bootstrap['time'] | null | undefined) => void;
  /**
 * resolvePreviewTechniques：Preview功法相关字段。
 */

  resolvePreviewTechniques: (techniques: TechniqueState[]) => TechniqueState[];  
  /**
 * buildAttrStateFromPlayer：Attr状态From玩家引用。
 */

  buildAttrStateFromPlayer: (player: PlayerState) => S2C_Bootstrap['self'] extends infer _T ? any : never;
  /**
 * syncPlayerBridgeState：玩家桥接状态状态或数据块。
 */

  syncPlayerBridgeState: (player: PlayerState | null) => void;  
  /**
 * syncAttrBridgeState：Attr桥接状态状态或数据块。
 */

  syncAttrBridgeState: (value: ReturnType<MainRuntimeStateSourceOptions['buildAttrStateFromPlayer']> | null) => void;  
  /**
 * syncInventoryBridgeState：背包桥接状态状态或数据块。
 */

  syncInventoryBridgeState: (inventory: PlayerState['inventory'] | null) => void;  
  /**
 * syncEquipmentBridgeState：装备桥接状态状态或数据块。
 */

  syncEquipmentBridgeState: (equipment: PlayerState['equipment'] | null) => void;  
  /**
 * syncTechniquesBridgeState：功法桥接状态状态或数据块。
 */

  syncTechniquesBridgeState: (techniques: PlayerState['techniques'], cultivatingTechId?: string) => void;  
  /**
 * syncActionsBridgeState：Action桥接状态状态或数据块。
 */

  syncActionsBridgeState: (actions: PlayerState['actions'], autoBattle: boolean, autoRetaliate: boolean) => void;  
  /**
 * syncBootstrapQuestState：Bootstrap任务状态状态或数据块。
 */

  syncBootstrapQuestState: (player: PlayerState) => void;  
  /**
 * normalizeBootstrapPlayer：首包阶段规整动作与战斗设置真源。
 */

  normalizeBootstrapPlayer: (player: PlayerState) => void;
  /**
 * clearTargetingState：清空选目标暂态。
 */

  clearTargetingState: () => void;
  /**
 * syncTargetingOverlay：TargetingOverlay相关字段。
 */

  syncTargetingOverlay: () => void;  
  /**
 * syncSenseQiOverlay：SenseQiOverlay相关字段。
 */

  syncSenseQiOverlay: () => void;  
  /**
 * applyBootstrapToMapRuntime：BootstrapTo地图运行态引用。
 */

  applyBootstrapToMapRuntime: (data: HydratedBootstrap) => void;
  /**
 * applyMapStaticToRuntime：地图StaticTo运行态引用。
 */

  applyMapStaticToRuntime: (data: S2C_MapStatic) => void;
  /**
 * setRuntimePathCells：运行态路径Cell相关字段。
 */

  setRuntimePathCells: () => void;  
  /**
 * resetObservedBaselinesFromPlayer：resetObservedBaselineFrom玩家引用。
 */

  resetObservedBaselinesFromPlayer: (player: PlayerState) => void;  
  /**
 * clearCurrentPath：clearCurrent路径相关字段。
 */

  clearCurrentPath: () => void;  
  /**
 * showSidePanel：showSide面板相关字段。
 */

  showSidePanel: () => void;  
  /**
 * setChatPersistenceScope：ChatPersistenceScope相关字段。
 */

  setChatPersistenceScope: (scope: string | null) => void;  
  /**
 * showChat：showChat相关字段。
 */

  showChat: () => void;  
  /**
 * showHud：showHud相关字段。
 */

  showHud: () => void;  
  /**
 * resizeCanvas：resizeCanva相关字段。
 */

  resizeCanvas: () => void;  
  /**
 * refreshZoomChrome：refreshZoomChrome相关字段。
 */

  refreshZoomChrome: () => void;  
  /**
 * setPanelRuntime：面板运行态引用。
 */

  setPanelRuntime: (state: {  
  /**
 * connected：connected相关字段。
 */
 connected?: boolean;  
 /**
 * playerId：玩家ID标识。
 */
 playerId?: string | null;  
 /**
 * mapId：地图ID标识。
 */
 mapId?: string | null;  
 /**
 * shellVisible：shell可见相关字段。
 */
 shellVisible?: boolean }) => void;  
 /**
 * initAttrPanel：initAttr面板相关字段。
 */

  initAttrPanel: (player: PlayerState) => void;  
  /**
 * initAttrDetail：initAttr详情状态或数据块。
 */

  initAttrDetail: () => void;  
  /**
 * initInventoryState：init背包状态状态或数据块。
 */

  initInventoryState: (player: PlayerState) => void;  
  /**
 * initEquipmentPanel：init装备面板相关字段。
 */

  initEquipmentPanel: (player: PlayerState) => void;  
  /**
 * initTechniqueState：init功法状态状态或数据块。
 */

  initTechniqueState: (player: PlayerState) => void;  
  /**
 * initBodyTrainingPanel：initBodyTraining面板相关字段。
 */

  initBodyTrainingPanel: (player: PlayerState) => void;  
  /**
 * initQuestState：init任务状态状态或数据块。
 */

  initQuestState: (player: PlayerState) => void;  
  /**
 * initActionState：initAction状态状态或数据块。
 */

  initActionState: (player: PlayerState) => void;  
  /**
 * initWorldSummaryState：init世界摘要状态状态或数据块。
 */

  initWorldSummaryState: () => void;  
  /**
 * refreshUiChrome：refreshUiChrome相关字段。
 */

  refreshUiChrome: () => void;  
  /**
 * initMailState：init邮件状态状态或数据块。
 */

  initMailState: (playerId: string) => void;  
  /**
 * initSuggestionState：initSuggestion状态状态或数据块。
 */

  initSuggestionState: (playerId: string) => void;  
  /**
 * hideObserveModal：hideObserve弹层相关字段。
 */

  hideObserveModal: () => void;  
  /**
 * applyWorldDelta：世界Delta相关字段。
 */

  applyWorldDelta: (data: S2C_WorldDelta, mapIdHint?: string, instanceIdHint?: string) => void;
  /**
 * applySelfDelta：SelfDelta相关字段。
 */

  applySelfDelta: (data: S2C_SelfDelta) => void;
  /**
 * applyPanelDelta：面板Delta相关字段。
 */

  applyPanelDelta: (data: S2C_PanelDelta) => void;
  /**
 * inventorySyncPlayerContext：背包Sync玩家上下文状态或数据块。
 */

  inventorySyncPlayerContext: (player?: PlayerState) => void;  
  /**
 * refreshHeavenGateModal：refreshHeavenGate弹层相关字段。
 */

  refreshHeavenGateModal: (player: PlayerState | null) => void;
};
/**
 * MainRuntimeStateSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainRuntimeStateSource = ReturnType<typeof createMainRuntimeStateSource>;
type HydratedBootstrap = Omit<S2C_Bootstrap, 'self'> & { self: PlayerState };

function hydrateBootstrapItem(item: PlayerState['inventory']['items'][number]): PlayerState['inventory']['items'][number] {
  return resolvePreviewItem(item);
}

function hydrateBootstrapEquipment(equipment: PlayerState['equipment']): PlayerState['equipment'] {
  return {
    weapon: equipment.weapon ? hydrateBootstrapItem(equipment.weapon) : null,
    head: equipment.head ? hydrateBootstrapItem(equipment.head) : null,
    body: equipment.body ? hydrateBootstrapItem(equipment.body) : null,
    legs: equipment.legs ? hydrateBootstrapItem(equipment.legs) : null,
    accessory: equipment.accessory ? hydrateBootstrapItem(equipment.accessory) : null,
  };
}

function hydrateBootstrapAction(action: Partial<ActionDef> & { id: string }): ActionDef {
  const skillTemplate = getLocalSkillTemplate(action.id);
  const staticAction = getStaticClientActionDef(action.id);
  const nextType = action.type ?? staticAction?.type ?? (skillTemplate ? 'skill' : 'interact');
  return {
    id: action.id,
    name: action.name ?? staticAction?.name ?? skillTemplate?.name ?? action.id,
    type: nextType,
    desc: action.desc ?? staticAction?.desc ?? skillTemplate?.desc ?? '',
    cooldownLeft: action.cooldownLeft ?? 0,
    range: action.range ?? staticAction?.range ?? skillTemplate?.range,
    requiresTarget: action.requiresTarget ?? staticAction?.requiresTarget ?? skillTemplate?.requiresTarget ?? (nextType === 'skill' ? true : undefined),
    targetMode: action.targetMode ?? staticAction?.targetMode ?? skillTemplate?.targetMode ?? (nextType === 'skill' ? 'any' : undefined),
    autoBattleEnabled: action.autoBattleEnabled,
    autoBattleOrder: action.autoBattleOrder,
    skillEnabled: action.skillEnabled,
  };
}

function hydrateBootstrapPlayer(rawPlayer: S2C_Bootstrap['self']): PlayerState {
  const player = rawPlayer as unknown as PlayerState;
  return {
    ...player,
    inventory: {
      ...player.inventory,
      items: (player.inventory?.items ?? []).map((item) => hydrateBootstrapItem(item)),
    },
    equipment: hydrateBootstrapEquipment(player.equipment),
    techniques: optionsResolvePreviewTechniquesSafe(player.techniques),
    actions: (player.actions ?? []).map((action) => hydrateBootstrapAction(action as Partial<ActionDef> & { id: string })),
    bonuses: [],
    quests: resolvePreviewQuests(player.quests),
  };
}

function optionsResolvePreviewTechniquesSafe(techniques: PlayerState['techniques']): PlayerState['techniques'] {
  return (techniques ?? []).map((technique) => ({
    ...technique,
    skills: Array.isArray(technique.skills) ? technique.skills : [],
  }));
}
/**
 * createMainRuntimeStateSource：构建并返回目标对象。
 * @param options MainRuntimeStateSourceOptions 选项参数。
 * @returns 无返回值，直接更新Main运行态状态来源相关状态。
 */


export function createMainRuntimeStateSource(options: MainRuntimeStateSourceOptions) {
  let latestInitSession: S2C_InitSession | null = null;
  let latestMapEnter: S2C_MapEnter | null = null;
  let pendingWorldDelta: S2C_WorldDelta | null = null;
  let pendingSelfDelta: S2C_SelfDelta | null = null;
  let pendingPanelDelta: S2C_PanelDelta | null = null;

  const resolveMapEnterHints = (player: PlayerState | null | undefined): { mapIdHint?: string; instanceIdHint?: string } => {
    return {
      mapIdHint: latestMapEnter?.mid && latestMapEnter.mid !== player?.mapId
        ? latestMapEnter.mid
        : undefined,
      instanceIdHint: latestMapEnter?.iid && latestMapEnter.iid !== player?.instanceId
        ? latestMapEnter.iid
        : undefined,
    };
  };

  const flushPendingBootstrapEnvelope = (): void => {
    if (!options.getPlayer()) {
      return;
    }
    if (pendingWorldDelta) {
      const pending = pendingWorldDelta;
      pendingWorldDelta = null;
      const hints = resolveMapEnterHints(options.getPlayer());
      options.applyWorldDelta(pending, hints.mapIdHint, hints.instanceIdHint);
    }
    if (pendingSelfDelta) {
      const pending = pendingSelfDelta;
      pendingSelfDelta = null;
      options.applySelfDelta(pending);
    }
    if (pendingPanelDelta) {
      const pending = pendingPanelDelta;
      pendingPanelDelta = null;
      options.applyPanelDelta(pending);
    }
  };

  return {  
  /**
 * clear：执行clear相关逻辑。
 * @returns 无返回值，直接更新clear相关状态。
 */

    clear(): void {
      latestInitSession = null;
      latestMapEnter = null;
      pendingWorldDelta = null;
      pendingSelfDelta = null;
      pendingPanelDelta = null;
    },    
    /**
 * handleInitSession：处理InitSession并更新相关状态。
 * @param data S2C_InitSession 原始数据。
 * @returns 无返回值，直接更新InitSession相关状态。
 */


    handleInitSession(data: S2C_InitSession): void {
      latestInitSession = data;
    },    
    /**
 * handleMapEnter：处理地图进入并更新相关状态。
 * @param data S2C_MapEnter 原始数据。
 * @returns 无返回值，直接更新地图Enter相关状态。
 */


    handleMapEnter(data: S2C_MapEnter): void {
      latestMapEnter = data;
    },    
    /**
 * handleWorldDelta：处理世界增量并更新相关状态。
 * @param data S2C_WorldDelta 原始数据。
 * @returns 无返回值，直接更新世界Delta相关状态。
 */


    handleWorldDelta(data: S2C_WorldDelta): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      if (!options.getPlayer()) {
        pendingWorldDelta = data;
        return;
      }
      const player = options.getPlayer();
      const hints = resolveMapEnterHints(player);
      options.applyWorldDelta(data, hints.mapIdHint, hints.instanceIdHint);
    },    
    /**
 * handleSelfDelta：处理Self增量并更新相关状态。
 * @param data S2C_SelfDelta 原始数据。
 * @returns 无返回值，直接更新SelfDelta相关状态。
 */


    handleSelfDelta(data: S2C_SelfDelta): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      if (!options.getPlayer()) {
        pendingSelfDelta = data;
        return;
      }
      options.applySelfDelta(data);
    },    
    /**
 * handlePanelDelta：处理面板增量并更新相关状态。
 * @param data S2C_PanelDelta 原始数据。
 * @returns 无返回值，直接更新面板Delta相关状态。
 */


    handlePanelDelta(data: S2C_PanelDelta): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      if (!options.getPlayer()) {
        pendingPanelDelta = data;
        return;
      }
      options.applyPanelDelta(data);
    },    
    /**
 * handleRealm：处理Realm并更新相关状态。
 * @param data S2C_Realm 原始数据。
 * @returns 无返回值，直接更新Realm相关状态。
 */


    handleRealm(data: S2C_Realm): void {
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
 * handleMapStatic：处理地图Static并更新相关状态。
 * @param data S2C_MapStatic 原始数据。
 * @returns 无返回值，直接更新地图Static相关状态。
 */


    handleMapStatic(data: S2C_MapStatic): void {
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
 * handleBootstrap：处理引导并更新相关状态。
 * @param data S2C_Bootstrap 原始数据。
 * @returns 无返回值，直接更新Bootstrap相关状态。
 */


    handleBootstrap(data: S2C_Bootstrap): void {
      options.hideObserveModal();
      options.clearTargetingState();
      latestInitSession = latestInitSession?.pid === data.self.id ? latestInitSession : null;
      latestMapEnter = latestMapEnter?.mid === data.self.mapId ? latestMapEnter : null;
      if (typeof data.auraLevelBaseValue === 'number') {
        options.syncAuraLevelBaseValue(data.auraLevelBaseValue);
      }

      const player = hydrateBootstrapPlayer(data.self);
      player.techniques = options.resolvePreviewTechniques(player.techniques);
      options.syncCurrentTimeState(data.time ?? null);
      options.setLatestAttrUpdate(options.buildAttrStateFromPlayer(player));
      player.senseQiActive = player.senseQiActive === true;
      player.autoBattleStationary = player.autoBattleStationary === true;
      player.allowAoePlayerHit = player.allowAoePlayerHit === true;
      player.autoIdleCultivation = player.autoIdleCultivation !== false;
      player.autoSwitchCultivation = player.autoSwitchCultivation === true;
      player.cultivationActive = player.cultivationActive === true;
      options.normalizeBootstrapPlayer(player);

      options.setPlayer(player);
      options.syncPlayerBridgeState(player);
      options.syncAttrBridgeState(options.getLatestAttrUpdate());
      options.syncInventoryBridgeState(player.inventory);
      options.syncEquipmentBridgeState(player.equipment);
      options.syncTechniquesBridgeState(player.techniques, player.cultivatingTechId);
      options.syncActionsBridgeState(player.actions, player.autoBattle, player.autoRetaliate !== false);
      options.syncBootstrapQuestState(player);
      options.syncTargetingOverlay();
      options.applyBootstrapToMapRuntime({ ...data, self: player });
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
        playerId: latestInitSession?.pid ?? player.id,
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
      flushPendingBootstrapEnvelope();
    },
  };
}

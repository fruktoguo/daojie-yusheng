/**
 * 本文件属于正式客户端主线，负责前端启动、状态拼装、工具函数或表现层逻辑。
 *
 * 维护时要把用户意图、显示派生和服务端权威数据分清，避免为了展示便利复制业务规则。
 */
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
  SkillTargetingDef,
  resolveSkillRequiresTarget,
} from '@mud/shared';
import type { PanelKind, PanelPatch, PlayerStateDelta, PlayerFeedback, ActiveJobProgress } from '@mud/shared';
import { getLocalSkillTemplate, resolvePreviewItem, resolvePreviewQuests } from './content/local-templates';
import { getStaticClientActionDef } from './constants/ui/action';
import { endRuntimeProfileMetric, startRuntimeProfileMetric } from './debug/runtime-profiler';
import { markPlayerLifeTickSynced } from './runtime/server-tick';
import { handleTickEventBusPayload } from './network/event-bus-consumer';
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
  syncWangQiOverlay?: () => void;
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
 * mapName：地图名称或显示文本。
 */
 mapName?: string | null;  
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
 * initActivityState：初始化活动中心状态。
 */

  initActivityState: () => void;
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
  applyPanelPatch?: (patches: Record<PanelKind, PanelPatch>) => void;
  applyStateDelta?: (delta: PlayerStateDelta) => void;
  applyPlayerFeedback?: (items: PlayerFeedback[]) => void;
  applyJobProgress?: (jobs: ActiveJobProgress[]) => void;
  appendNotices?: (items: NonNullable<NonNullable<S2C_WorldDelta['eventBus']>['notices']>) => void;
  /**
 * inventorySyncPlayerContext：背包Sync玩家上下文状态或数据块。
 */

  inventorySyncPlayerContext: (player?: PlayerState) => void;  
  /**
 * equipmentSyncPlayerContext：装备面板同步玩家上下文。
 */

  equipmentSyncPlayerContext?: (player?: PlayerState) => void;
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

type BootstrapActionSkillTemplate = {
  name?: string;
  desc?: string;
  range?: number;
  requiresTarget?: boolean;
  targetMode?: ActionDef['targetMode'];
  targeting?: SkillTargetingDef;
};

function buildBootstrapActionSkillTemplates(techniques: PlayerState['techniques']): Map<string, BootstrapActionSkillTemplate> {
  const templates = new Map<string, BootstrapActionSkillTemplate>();
  for (const technique of techniques ?? []) {
    for (const skill of technique.skills ?? []) {
      if (typeof skill?.id === 'string' && skill.id.trim()) {
        templates.set(skill.id, skill);
      }
    }
  }
  return templates;
}

function hydrateBootstrapAction(
  action: Partial<ActionDef> & { id: string },
  bootstrapSkillTemplates?: ReadonlyMap<string, BootstrapActionSkillTemplate>,
): ActionDef {
  const skillTemplate = getLocalSkillTemplate(action.id);
  const bootstrapSkillTemplate = bootstrapSkillTemplates?.get(action.id);
  const staticAction = getStaticClientActionDef(action.id);
  const nextType = action.type ?? staticAction?.type ?? (skillTemplate || bootstrapSkillTemplate ? 'skill' : 'interact');
  const range = action.range ?? staticAction?.range ?? skillTemplate?.range ?? bootstrapSkillTemplate?.range;
  const requiresTarget = action.requiresTarget ?? staticAction?.requiresTarget ?? skillTemplate?.requiresTarget ?? bootstrapSkillTemplate?.requiresTarget;
  return {
    id: action.id,
    name: String(action.name ?? staticAction?.name ?? skillTemplate?.name ?? bootstrapSkillTemplate?.name ?? '').trim() || '未知动作',
    type: nextType,
    desc: action.desc ?? staticAction?.desc ?? skillTemplate?.desc ?? bootstrapSkillTemplate?.desc ?? '',
    cooldownLeft: action.cooldownLeft ?? 0,
    cooldownReadyTick: action.cooldownReadyTick,
    range,
    requiresTarget: nextType === 'skill'
      ? resolveSkillRequiresTarget({
        range,
        targeting: skillTemplate?.targeting ?? bootstrapSkillTemplate?.targeting,
        requiresTarget,
      })
      : requiresTarget,
    targetMode: action.targetMode ?? staticAction?.targetMode ?? skillTemplate?.targetMode ?? bootstrapSkillTemplate?.targetMode ?? (nextType === 'skill' ? 'any' : undefined),
    autoBattleEnabled: action.autoBattleEnabled,
    autoBattleOrder: action.autoBattleOrder,
    skillEnabled: action.skillEnabled,
    scriptureTechniqueId: action.scriptureTechniqueId,
    scriptureTechniqueName: action.scriptureTechniqueName,
    scriptureTechniqueRealmLv: action.scriptureTechniqueRealmLv,
    scriptureTechniqueGrade: action.scriptureTechniqueGrade,
    scriptureTechniqueCategory: action.scriptureTechniqueCategory,
  };
}

function hydrateBootstrapPlayer(rawPlayer: S2C_Bootstrap['self']): PlayerState {
  const player = rawPlayer as unknown as PlayerState;
  const techniques = optionsResolvePreviewTechniquesSafe(player.techniques);
  const bootstrapSkillTemplates = buildBootstrapActionSkillTemplates(techniques);
  const hydrated = {
    ...player,
    inventory: {
      ...player.inventory,
      items: (player.inventory?.items ?? []).map((item) => hydrateBootstrapItem(item)),
    },
    equipment: hydrateBootstrapEquipment(player.equipment),
    techniques,
    actions: (player.actions ?? []).map((action) => hydrateBootstrapAction(action as Partial<ActionDef> & { id: string }, bootstrapSkillTemplates)),
    bonuses: [],
    quests: resolvePreviewQuests(player.quests),
  };
  markPlayerLifeTickSynced(hydrated);
  return hydrated;
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
  let pendingMapStatic: S2C_MapStatic | null = null;
  let deferredSideEffectsScheduled = false;
  let deferredSideEffectsRaf: number | null = null;
  let deferredSideEffectsTimer: ReturnType<typeof setTimeout> | null = null;
  const deferredRuntimeSideEffects: Array<
    | { type: 'eventBus'; payload: NonNullable<S2C_WorldDelta['eventBus']> }
    | { type: 'panelDelta'; payload: S2C_PanelDelta }
  > = [];

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

  const applyMapStaticToCurrentRuntime = (data: S2C_MapStatic): void => {
    options.applyMapStaticToRuntime(data);
    const player = options.getPlayer();
    if (player && (data.minimapLibrary || (data as any).unlockedMapIds)) {
      if (data.minimapLibrary) {
        player.unlockedMinimapIds = data.minimapLibrary.map((entry) => entry.mapId).sort();
      } else if (Array.isArray((data as any).unlockedMapIds)) {
        player.unlockedMinimapIds = (data as any).unlockedMapIds.slice().sort();
      }
      options.inventorySyncPlayerContext(player);
    }
    if (player && data.mapId === player.mapId) {
      options.setPanelRuntime({
        mapId: player.mapId,
        mapName: data.mapMeta?.name ?? '未知地域',
      });
      options.refreshUiChrome();
    }
  };

  const flushPendingMapStaticForCurrentMap = (): void => {
    const player = options.getPlayer();
    if (!player || !pendingMapStatic || pendingMapStatic.mapId !== player.mapId) {
      return;
    }
    const pending = pendingMapStatic;
    pendingMapStatic = null;
    applyMapStaticToCurrentRuntime(pending);
  };

  const clearDeferredRuntimeSideEffects = (): void => {
    deferredRuntimeSideEffects.length = 0;
    deferredSideEffectsScheduled = false;
    if (deferredSideEffectsRaf !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(deferredSideEffectsRaf);
    }
    deferredSideEffectsRaf = null;
    if (deferredSideEffectsTimer !== null) {
      clearTimeout(deferredSideEffectsTimer);
    }
    deferredSideEffectsTimer = null;
  };

  const flushDeferredRuntimeSideEffects = (): void => {
    const startedAt = startRuntimeProfileMetric();
    try {
      deferredSideEffectsScheduled = false;
      deferredSideEffectsRaf = null;
      deferredSideEffectsTimer = null;
      while (deferredRuntimeSideEffects.length > 0) {
        const item = deferredRuntimeSideEffects.shift();
        if (!item) {
          continue;
        }
        if (item.type === 'eventBus') {
          applyEventBusPayload(item.payload);
          continue;
        }
        options.applyPanelDelta(item.payload);
      }
    } finally {
      endRuntimeProfileMetric('runtime.flushDeferredSideEffects', startedAt);
    }
  };

  const scheduleDeferredRuntimeSideEffects = (): void => {
    if (deferredSideEffectsScheduled) {
      return;
    }
    deferredSideEffectsScheduled = true;
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      deferredSideEffectsTimer = setTimeout(flushDeferredRuntimeSideEffects, 0);
      return;
    }
    deferredSideEffectsRaf = window.requestAnimationFrame(() => {
      deferredSideEffectsRaf = null;
      deferredSideEffectsTimer = setTimeout(flushDeferredRuntimeSideEffects, 0);
    });
  };

  const deferEventBusPayload = (data: S2C_WorldDelta): void => {
    if (!data.eventBus) {
      return;
    }
    deferredRuntimeSideEffects.push({ type: 'eventBus', payload: data.eventBus });
    scheduleDeferredRuntimeSideEffects();
  };

  const deferPanelDelta = (data: S2C_PanelDelta): void => {
    deferredRuntimeSideEffects.push({ type: 'panelDelta', payload: data });
    scheduleDeferredRuntimeSideEffects();
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
      deferEventBusPayload(pending);
    }
    if (pendingSelfDelta) {
      const pending = pendingSelfDelta;
      pendingSelfDelta = null;
      options.applySelfDelta(pending);
    }
    if (pendingPanelDelta) {
      const pending = pendingPanelDelta;
      pendingPanelDelta = null;
      deferPanelDelta(pending);
    }
    flushPendingMapStaticForCurrentMap();
  };

  const applyEventBusPayload = (eventBus: NonNullable<S2C_WorldDelta['eventBus']>): void => {
    handleTickEventBusPayload(eventBus, {
      appendNotices: (items) => options.appendNotices?.(items),
      applyPanelPatches: (patches) => options.applyPanelPatch?.(patches),
      updateJobProgress: (jobs) => options.applyJobProgress?.(jobs),
      markTechniqueDirty: () => undefined,
      applyStateDelta: (delta) => options.applyStateDelta?.(delta),
      showFeedback: (items) => options.applyPlayerFeedback?.(items),
    });
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
      pendingMapStatic = null;
      clearDeferredRuntimeSideEffects();
    },
    /** 获取当前会话的玩家序列号。 */
    getPlayerNo(): number | null {
      const pno = latestInitSession?.pno;
      return typeof pno === 'number' && Number.isSafeInteger(pno) && pno > 0 ? pno : null;
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

      const startedAt = startRuntimeProfileMetric();
      try {
        if (!options.getPlayer()) {
          pendingWorldDelta = data;
          return;
        }
        const player = options.getPlayer();
        const hints = resolveMapEnterHints(player);
        const applyStartedAt = startRuntimeProfileMetric();
        try {
          options.applyWorldDelta(data, hints.mapIdHint, hints.instanceIdHint);
        } finally {
          endRuntimeProfileMetric('runtime.applyWorldDelta', applyStartedAt);
        }
        const deferStartedAt = startRuntimeProfileMetric();
        try {
          deferEventBusPayload(data);
        } finally {
          endRuntimeProfileMetric('runtime.deferEventBus', deferStartedAt);
        }
      } finally {
        endRuntimeProfileMetric('runtime.handleWorldDelta', startedAt);
      }
    },    
    /**
 * handleSelfDelta：处理Self增量并更新相关状态。
 * @param data S2C_SelfDelta 原始数据。
 * @returns 无返回值，直接更新SelfDelta相关状态。
 */


    handleSelfDelta(data: S2C_SelfDelta): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      const startedAt = startRuntimeProfileMetric();
      try {
        if (!options.getPlayer()) {
          pendingSelfDelta = data;
          return;
        }
        options.applySelfDelta(data);
        flushPendingMapStaticForCurrentMap();
      } finally {
        endRuntimeProfileMetric('runtime.handleSelfDelta', startedAt);
      }
    },    
    /**
 * handlePanelDelta：处理面板增量并更新相关状态。
 * @param data S2C_PanelDelta 原始数据。
 * @returns 无返回值，直接更新面板Delta相关状态。
 */


    handlePanelDelta(data: S2C_PanelDelta): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      const startedAt = startRuntimeProfileMetric();
      try {
        if (!options.getPlayer()) {
          pendingPanelDelta = data;
          return;
        }
        deferPanelDelta(data);
      } finally {
        endRuntimeProfileMetric('runtime.handlePanelDelta', startedAt);
      }
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
      options.equipmentSyncPlayerContext?.(player ?? undefined);
      options.refreshUiChrome();
    },    
    /**
 * handleMapStatic：处理地图Static并更新相关状态。
 * @param data S2C_MapStatic 原始数据。
 * @returns 无返回值，直接更新地图Static相关状态。
 */


    handleMapStatic(data: S2C_MapStatic): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      const player = options.getPlayer();
      if (player && data.mapId !== player.mapId) {
        if (latestMapEnter?.mid === data.mapId) {
          pendingMapStatic = data;
        }
        applyMapStaticToCurrentRuntime(data);
        return;
      }
      if (pendingMapStatic?.mapId === data.mapId) {
        pendingMapStatic = null;
      }
      applyMapStaticToCurrentRuntime(data);
    },    
    /**
 * handleBootstrap：处理引导并更新相关状态。
 * @param data S2C_Bootstrap 原始数据。
 * @returns 无返回值，直接更新Bootstrap相关状态。
 */


    handleBootstrap(data: S2C_Bootstrap): void {
      const currentPlayer = options.getPlayer();
      const isRuntimeSameMapBootstrap = currentPlayer !== null
        && currentPlayer.id === data.self.id
        && currentPlayer.mapId === data.self.mapId;
      pendingMapStatic = null;
      if (!isRuntimeSameMapBootstrap) {
        options.hideObserveModal();
        options.clearTargetingState();
      }
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
      player.wangQiActive = player.wangQiActive === true;
      player.autoBattleStationary = player.autoBattleStationary === true;
      player.allowAoePlayerHit = player.allowAoePlayerHit === true;
      player.autoIdleCultivation = player.autoIdleCultivation !== false;
      player.autoSwitchCultivation = player.autoSwitchCultivation === true;
      player.autoRootFoundation = player.autoRootFoundation === true;
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
      if (!isRuntimeSameMapBootstrap) {
        options.applyBootstrapToMapRuntime({ ...data, self: player });
      }
      options.syncSenseQiOverlay();
      options.syncWangQiOverlay?.();
      if (!isRuntimeSameMapBootstrap) {
        options.resetObservedBaselinesFromPlayer(player);
        options.clearCurrentPath();
        options.setRuntimePathCells();
      }
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
        mapName: data.mapMeta?.name ?? latestMapEnter?.n ?? '未知地域',
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
      options.initActivityState();
      flushPendingBootstrapEnvelope();
    },
  };
}

import {
  type ActionDef,
  type GroundItemPilePatch,
  type NEXT_S2C_AttrUpdate,
  type NEXT_S2C_PanelDelta,
  type NEXT_S2C_SelfDelta,
  type NEXT_S2C_WorldDelta,
  type MonsterTier,
  type PlayerState,
  type RenderEntity,
  type TemporaryBuffState,
  type TickRenderEntity,
  cloneJson,
} from '@mud/shared-next';
import { logNextMovement } from './debug/movement-debug';
import { getLatestObservedEntitiesSnapshot } from './game-map/store/map-store';
import { getMonsterPresentation } from './monster-presentation';
import type { MainRuntimeObservedEntity as ObservedEntity } from './main-runtime-view-types';
/**
 * MainRuntimeDeltaStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainRuntimeDeltaStateSourceOptions = {
/**
 * getPlayer：玩家引用。
 */

  getPlayer: () => PlayerState | null;  
  /**
 * getLatestEntityById：LatestEntityByID标识。
 */

  getLatestEntityById: (id: string) => ObservedEntity | undefined;  
  /**
 * setLatestObservedEntities：LatestObservedEntity相关字段。
 */

  setLatestObservedEntities: (entities: ObservedEntity[]) => void;  
  /**
 * setLatestObservedEntityMap：缓存或索引容器。
 */

  setLatestObservedEntityMap: (map: Map<string, ObservedEntity>) => void;  
  /**
 * getLatestAttrUpdate：LatestAttrUpdate相关字段。
 */

  getLatestAttrUpdate: () => NEXT_S2C_AttrUpdate | null;  
  /**
 * setLatestAttrUpdate：LatestAttrUpdate相关字段。
 */

  setLatestAttrUpdate: (value: NEXT_S2C_AttrUpdate | null) => void;  
  /**
 * mergeAttrUpdatePatch：AttrUpdatePatch相关字段。
 */

  mergeAttrUpdatePatch: (previous: NEXT_S2C_AttrUpdate | null, patch: NEXT_S2C_AttrUpdate) => NEXT_S2C_AttrUpdate;  
  /**
 * syncAuraLevelBaseValue：Aura等级Base值数值。
 */

  syncAuraLevelBaseValue: (value?: number) => void;  
  /**
 * syncCurrentTimeState：Current时间状态状态或数据块。
 */

  syncCurrentTimeState: (state: NEXT_S2C_WorldDelta['time'] | null | undefined) => void;  
  /**
 * applyWorldDeltaToRuntime：世界DeltaTo运行态引用。
 */

  applyWorldDeltaToRuntime: (input: {  
  /**
 * playerPatches：玩家Patche相关字段。
 */

    playerPatches: TickRenderEntity[];    
    /**
 * entityPatches：entityPatche相关字段。
 */

    entityPatches: TickRenderEntity[];    
    /**
 * removedEntityIds：removedEntityID相关字段。
 */

    removedEntityIds: string[];    
    /**
 * groundPatches：groundPatche相关字段。
 */

    groundPatches: GroundItemPilePatch[];    
    /**
 * effects：effect相关字段。
 */

    effects?: NEXT_S2C_WorldDelta['fx'];    
    /**
 * threatArrows：集合字段。
 */

    threatArrows?: Array<{    
    /**
 * ownerId：ownerID标识。
 */
 ownerId: string;    
 /**
 * targetId：目标ID标识。
 */
 targetId: string }>;    
 /**
 * threatArrowAdds：threatArrowAdd相关字段。
 */

    threatArrowAdds?: Array<[string, string]>;    
    /**
 * threatArrowRemoves：threatArrowRemove相关字段。
 */

    threatArrowRemoves?: Array<[string, string]>;    
    /**
 * pathCells：路径Cell相关字段。
 */

    pathCells?: Array<{    
    /**
 * x：x相关字段。
 */
 x: number;    
 /**
 * y：y相关字段。
 */
 y: number }>;    
 /**
 * tickDurationMs：tickDurationM相关字段。
 */

    tickDurationMs?: number;    
    /**
 * time：时间相关字段。
 */

    time?: NEXT_S2C_WorldDelta['time'];    
    /**
 * visibleTiles：可见Tile相关字段。
 */

    visibleTiles?: NEXT_S2C_WorldDelta['v'];    
    /**
 * visibleTilePatches：可见TilePatche相关字段。
 */

    visibleTilePatches?: NEXT_S2C_WorldDelta['tp'];    
    /**
 * mapId：地图ID标识。
 */

    mapId?: string;
  }) => void;  
  /**
 * applySelfDeltaToRuntime：SelfDeltaTo运行态引用。
 */

  applySelfDeltaToRuntime: (input: {  
  /**
 * mapId：地图ID标识。
 */

    mapId?: string;    
    /**
 * x：x相关字段。
 */

    x?: number;    
    /**
 * y：y相关字段。
 */

    y?: number;    
    /**
 * facing：facing相关字段。
 */

    facing?: PlayerState['facing'];    
    /**
 * hp：hp相关字段。
 */

    hp?: number;    
    /**
 * qi：qi相关字段。
 */

    qi?: number;    
    /**
 * playerPatch：玩家Patch相关字段。
 */

    playerPatch: TickRenderEntity | null;
  }) => void;  
  /**
 * navigation：导航相关字段。
 */

  navigation: {  
  /**
 * trimCurrentPathProgress：trimCurrent路径进度状态或数据块。
 */

    trimCurrentPathProgress: () => void;    
    /**
 * triggerAutoInteractionIfReady：triggerAutoInteractionIfReady相关字段。
 */

    triggerAutoInteractionIfReady: () => boolean;    
    /**
 * getPathTarget：路径目标相关字段。
 */

    getPathTarget: () => {    
    /**
 * x：x相关字段。
 */
 x: number;    
 /**
 * y：y相关字段。
 */
 y: number } | null;    
 /**
 * getPathCells：路径Cell相关字段。
 */

    getPathCells: () => Array<{    
    /**
 * x：x相关字段。
 */
 x: number;    
 /**
 * y：y相关字段。
 */
 y: number }>;    
 /**
 * clearCurrentPath：clearCurrent路径相关字段。
 */

    clearCurrentPath: () => void;    
    /**
 * syncPathCellsToRuntime：路径CellTo运行态引用。
 */

    syncPathCellsToRuntime: () => void;
  };  
  /**
 * targeting：targeting相关字段。
 */

  targeting: {  
  /**
 * syncSenseQiOverlay：SenseQiOverlay相关字段。
 */

    syncSenseQiOverlay: () => void;    
    /**
 * syncTargetingOverlay：TargetingOverlay相关字段。
 */

    syncTargetingOverlay: () => void;    
    /**
 * setHoveredMapTile：Hovered地图Tile相关字段。
 */

    setHoveredMapTile: (value: null) => void;    
    /**
 * cancelTargeting：cancelTargeting相关字段。
 */

    cancelTargeting: () => void;
  };  
  /**
 * refreshHudChrome：refreshHudChrome相关字段。
 */

  refreshHudChrome: () => void;  
  /**
 * hideObserveModal：hideObserve弹层相关字段。
 */

  hideObserveModal: () => void;  
  /**
 * clearLootPanel：clear掉落面板相关字段。
 */

  clearLootPanel: () => void;  
  /**
 * setPanelRuntimeMapId：面板运行态地图ID标识。
 */

  setPanelRuntimeMapId: (mapId: string) => void;  
  /**
 * syncQuestMapId：任务地图ID标识。
 */

  syncQuestMapId: (mapId: string) => void;  
  /**
 * updateAttrPanel：Attr面板相关字段。
 */

  updateAttrPanel: (value: NEXT_S2C_AttrUpdate) => void;  
  /**
 * refreshUiChrome：refreshUiChrome相关字段。
 */

  refreshUiChrome: () => void;  
  /**
 * handleAttrUpdate：AttrUpdate相关字段。
 */

  handleAttrUpdate: (data: NEXT_S2C_AttrUpdate) => void;  
  /**
 * handleInventoryUpdate：背包Update相关字段。
 */

  handleInventoryUpdate: (data: NonNullable<NEXT_S2C_PanelDelta['inv']>) => void;  
  /**
 * handleEquipmentUpdate：装备Update相关字段。
 */

  handleEquipmentUpdate: (data: NonNullable<NEXT_S2C_PanelDelta['eq']>) => void;  
  /**
 * handleTechniqueUpdate：功法Update相关字段。
 */

  handleTechniqueUpdate: (data: NonNullable<NEXT_S2C_PanelDelta['tech']>) => void;  
  /**
 * handleActionsUpdate：ActionUpdate相关字段。
 */

  handleActionsUpdate: (data: NonNullable<NEXT_S2C_PanelDelta['act']>) => void;
};

const NEXT_PLAYER_ENTITY_COLOR = '#8ec5ff';
const NEXT_MONSTER_ENTITY_COLOR = '#ff9b73';
const NEXT_NPC_ENTITY_COLOR = '#f3d27a';
const NEXT_PORTAL_ENTITY_COLOR = '#b9a7ff';
const NEXT_CONTAINER_ENTITY_COLOR = '#c18b46';
/**
 * getFirstGrapheme：读取首个Grapheme。
 * @param input string | undefined 输入参数。
 * @param fallback string 参数说明。
 * @returns 返回FirstGrapheme。
 */


function getFirstGrapheme(input: string | undefined, fallback: string): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const normalized = input?.trim();
  if (!normalized) {
    return fallback;
  }
  return [...normalized][0] ?? fallback;
}
/**
 * MainRuntimeDeltaStateSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainRuntimeDeltaStateSource = ReturnType<typeof createMainRuntimeDeltaStateSource>;
/**
 * createMainRuntimeDeltaStateSource：构建并返回目标对象。
 * @param options MainRuntimeDeltaStateSourceOptions 选项参数。
 * @returns 无返回值，直接更新Main运行态Delta状态来源相关状态。
 */


export function createMainRuntimeDeltaStateSource(options: MainRuntimeDeltaStateSourceOptions) {
/**
 * buildNextPlayerTickEntity：构建并返回目标对象。
 * @param patch NonNullable<NEXT_S2C_WorldDelta['p']>[number] 参数说明。
 * @returns 返回Next玩家tickEntity。
 */

  function buildNextPlayerTickEntity(patch: NonNullable<NEXT_S2C_WorldDelta['p']>[number]): TickRenderEntity {
    const previous = options.getLatestEntityById(patch.id);
    const player = options.getPlayer();
    const isSelf = patch.id === player?.id;
    const fallbackName = isSelf ? (player?.name ?? previous?.name) : previous?.name;
    return {
      id: patch.id,
      x: patch.x ?? previous?.wx ?? (isSelf ? player?.x : undefined) ?? 0,
      y: patch.y ?? previous?.wy ?? (isSelf ? player?.y : undefined) ?? 0,
      char: previous?.char ?? getFirstGrapheme(isSelf ? (player?.displayName ?? player?.name) : previous?.name, isSelf ? '我' : '人'),
      color: previous?.color ?? NEXT_PLAYER_ENTITY_COLOR,
      name: previous?.name ?? fallbackName,
      kind: previous?.kind === 'crowd' ? 'crowd' : 'player',
      hp: isSelf ? (player?.hp ?? previous?.hp) : previous?.hp,
      maxHp: isSelf ? (player?.maxHp ?? previous?.maxHp) : previous?.maxHp,
      qi: isSelf ? (player?.qi ?? previous?.qi) : previous?.qi,
      maxQi: isSelf ? (player?.numericStats?.maxQi ?? previous?.maxQi) : previous?.maxQi,
      npcQuestMarker: previous?.npcQuestMarker,
      observation: previous?.observation,
      buffs: previous?.buffs,
    };
  }  
  /**
 * buildNextMonsterTickEntity：构建并返回目标对象。
 * @param patch NonNullable<NEXT_S2C_WorldDelta['m']>[number] 参数说明。
 * @returns 返回Next怪物tickEntity。
 */


  function buildNextMonsterTickEntity(patch: NonNullable<NEXT_S2C_WorldDelta['m']>[number]): TickRenderEntity {
    const previous = options.getLatestEntityById(patch.id);
    const name = patch.n ?? previous?.name;
    return {
      id: patch.id,
      x: patch.x ?? previous?.wx ?? 0,
      y: patch.y ?? previous?.wy ?? 0,
      char: previous?.char ?? getFirstGrapheme(getMonsterPresentation(name, patch.tr ?? previous?.monsterTier).label, '妖'),
      color: patch.c ?? previous?.color ?? NEXT_MONSTER_ENTITY_COLOR,
      name,
      kind: 'monster',
      monsterTier: patch.tr ?? previous?.monsterTier,
      hp: patch.hp ?? previous?.hp,
      maxHp: patch.maxHp ?? previous?.maxHp,
      qi: previous?.qi,
      maxQi: previous?.maxQi,
      npcQuestMarker: previous?.npcQuestMarker,
      observation: previous?.observation,
      buffs: previous?.buffs,
    };
  }  
  /**
 * buildNextNpcTickEntity：构建并返回目标对象。
 * @param patch NonNullable<NEXT_S2C_WorldDelta['n']>[number] 参数说明。
 * @returns 返回NextNPCtickEntity。
 */


  function buildNextNpcTickEntity(patch: NonNullable<NEXT_S2C_WorldDelta['n']>[number]): TickRenderEntity {
    const previous = options.getLatestEntityById(patch.id);
    return {
      id: patch.id,
      x: patch.x ?? previous?.wx ?? 0,
      y: patch.y ?? previous?.wy ?? 0,
      char: patch.ch ?? previous?.char ?? getFirstGrapheme(patch.n ?? previous?.name, '商'),
      color: patch.c ?? previous?.color ?? NEXT_NPC_ENTITY_COLOR,
      name: patch.n ?? previous?.name,
      kind: 'npc',
      hp: previous?.hp,
      maxHp: previous?.maxHp,
      qi: previous?.qi,
      maxQi: previous?.maxQi,
      npcQuestMarker: patch.qm === null ? null : patch.qm ?? previous?.npcQuestMarker,
      observation: previous?.observation,
      buffs: previous?.buffs,
    };
  }  
  /**
 * buildNextPortalTickEntity：构建并返回目标对象。
 * @param patch NonNullable<NEXT_S2C_WorldDelta['o']>[number] 参数说明。
 * @returns 返回NextPortaltickEntity。
 */


  function buildNextPortalTickEntity(patch: NonNullable<NEXT_S2C_WorldDelta['o']>[number]): TickRenderEntity {
    const previous = options.getLatestEntityById(patch.id);
    return {
      id: patch.id,
      x: patch.x ?? previous?.wx ?? 0,
      y: patch.y ?? previous?.wy ?? 0,
      char: previous?.char ?? '门',
      color: previous?.color ?? NEXT_PORTAL_ENTITY_COLOR,
      name: patch.tm ?? previous?.name ?? '传送门',
      kind: (previous?.kind ?? 'portal') as TickRenderEntity['kind'],
      hp: previous?.hp,
      maxHp: previous?.maxHp,
      qi: previous?.qi,
      maxQi: previous?.maxQi,
      npcQuestMarker: previous?.npcQuestMarker,
      observation: previous?.observation,
      buffs: previous?.buffs,
    };
  }  
  /**
 * buildNextContainerTickEntity：构建并返回目标对象。
 * @param patch NonNullable<NEXT_S2C_WorldDelta['c']>[number] 参数说明。
 * @returns 返回NextContainertickEntity。
 */


  function buildNextContainerTickEntity(patch: NonNullable<NEXT_S2C_WorldDelta['c']>[number]): TickRenderEntity {
    const previous = options.getLatestEntityById(patch.id);
    return {
      id: patch.id,
      x: patch.x ?? previous?.wx ?? 0,
      y: patch.y ?? previous?.wy ?? 0,
      char: patch.ch ?? previous?.char ?? '箱',
      color: patch.c ?? previous?.color ?? NEXT_CONTAINER_ENTITY_COLOR,
      name: patch.n ?? previous?.name ?? '可搜索陈设',
      kind: 'container',
      hp: previous?.hp,
      maxHp: previous?.maxHp,
      qi: previous?.qi,
      maxQi: previous?.maxQi,
      npcQuestMarker: previous?.npcQuestMarker,
      observation: previous?.observation,
      buffs: previous?.buffs,
    };
  }  
  /**
 * buildNextWorldDeltaRuntimeInput：构建并返回目标对象。
 * @param data NEXT_S2C_WorldDelta 原始数据。
 * @returns 无返回值，直接更新Next世界Delta运行态输入相关状态。
 */


  function buildNextWorldDeltaRuntimeInput(data: NEXT_S2C_WorldDelta) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const playerPatches: TickRenderEntity[] = [];
    const entityPatches: TickRenderEntity[] = [];
    const removedEntityIds: string[] = [];
    const groundPatches: GroundItemPilePatch[] = [];

    for (const patch of data.p ?? []) {
      if (patch.rm) {
        removedEntityIds.push(patch.id);
        continue;
      }
      playerPatches.push(buildNextPlayerTickEntity(patch));
    }

    for (const patch of data.m ?? []) {
      if (patch.rm) {
        removedEntityIds.push(patch.id);
        continue;
      }
      entityPatches.push(buildNextMonsterTickEntity(patch));
    }

    for (const patch of data.n ?? []) {
      if (patch.rm) {
        removedEntityIds.push(patch.id);
        continue;
      }
      entityPatches.push(buildNextNpcTickEntity(patch));
    }

    for (const patch of data.o ?? []) {
      if (patch.rm) {
        removedEntityIds.push(patch.id);
        continue;
      }
      entityPatches.push(buildNextPortalTickEntity(patch));
    }

    for (const patch of data.g ?? []) {
      groundPatches.push({
        sourceId: patch.sourceId,
        x: patch.x,
        y: patch.y,
        items: patch.items === undefined ? undefined : (patch.items ? cloneJson(patch.items) : null),
      });
    }

    for (const patch of data.c ?? []) {
      if (patch.rm) {
        removedEntityIds.push(patch.id);
        continue;
      }
      entityPatches.push(buildNextContainerTickEntity(patch));
    }

    return {
      playerPatches,
      entityPatches,
      removedEntityIds,
      groundPatches,
      effects: data.fx ? cloneJson(data.fx) : undefined,
      threatArrows: Array.isArray(data.threatArrows)
        ? data.threatArrows
          .map(([ownerId, targetId]) => ({ ownerId, targetId }))
          .filter((entry) => entry.ownerId && entry.targetId)
        : undefined,
      threatArrowAdds: data.threatArrowAdds ? data.threatArrowAdds.map((entry) => [entry[0], entry[1]] as [string, string]) : undefined,
      threatArrowRemoves: data.threatArrowRemoves ? data.threatArrowRemoves.map((entry) => [entry[0], entry[1]] as [string, string]) : undefined,
      pathCells: data.path ? data.path.map(([x, y]) => ({ x, y })) : undefined,
      tickDurationMs: typeof data.dt === 'number' ? data.dt : undefined,
      time: data.time ?? undefined,
      visibleTiles: data.v,
      visibleTilePatches: data.tp,
      mapId: data.mid,
    };
  }  
  /**
 * buildNextSelfRuntimePlayerPatch：构建并返回目标对象。
 * @param data NEXT_S2C_SelfDelta 原始数据。
 * @returns 返回NextSelf运行态玩家Patch。
 */


  function buildNextSelfRuntimePlayerPatch(data: NEXT_S2C_SelfDelta): TickRenderEntity | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const player = options.getPlayer();
    if (!player) {
      return null;
    }
    if (typeof data.x !== 'number' && typeof data.y !== 'number') {
      return null;
    }
    const previous = options.getLatestEntityById(player.id);
    return {
      id: player.id,
      x: data.x ?? player.x,
      y: data.y ?? player.y,
      char: previous?.char ?? getFirstGrapheme(player.displayName ?? player.name, '我'),
      color: previous?.color ?? NEXT_PLAYER_ENTITY_COLOR,
      name: previous?.name ?? player.name,
      kind: previous?.kind === 'crowd' ? 'crowd' : 'player',
      hp: data.hp ?? player.hp,
      maxHp: data.maxHp ?? player.maxHp,
      qi: data.qi ?? player.qi,
      maxQi: data.maxQi ?? player.numericStats?.maxQi,
      npcQuestMarker: previous?.npcQuestMarker,
      observation: previous?.observation,
      buffs: previous?.buffs,
    };
  }  
  /**
 * syncLatestObservedEntitiesFromRuntime：处理最新ObservedEntityFrom运行态并更新相关状态。
 * @returns 无返回值，直接更新LatestObservedEntityFrom运行态相关状态。
 */


  function syncLatestObservedEntitiesFromRuntime(): void {
    const entities = getLatestObservedEntitiesSnapshot() as ObservedEntity[];
    options.setLatestObservedEntities(entities);
    options.setLatestObservedEntityMap(new Map(entities.map((entity) => [entity.id, entity])));
  }  
  /**
 * finalizeNextMovementFrame：执行finalizeNextMovement帧相关逻辑。
 * @returns 无返回值，直接更新finalizeNextMovement帧相关状态。
 */


  function finalizeNextMovementFrame(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    syncLatestObservedEntitiesFromRuntime();
    options.targeting.syncSenseQiOverlay();
    options.targeting.syncTargetingOverlay();
    options.refreshHudChrome();

    options.navigation.trimCurrentPathProgress();
    const autoInteractionTriggered = options.navigation.triggerAutoInteractionIfReady();
    const pathTarget = options.navigation.getPathTarget();
    const player = options.getPlayer();
    if (!autoInteractionTriggered && pathTarget && player && player.x === pathTarget.x && player.y === pathTarget.y) {
      options.navigation.clearCurrentPath();
    }
    options.navigation.syncPathCellsToRuntime();
  }  
  /**
 * applyNextSelfVitalsMetadata：处理NextSelfVitalMetadata并更新相关状态。
 * @param data NEXT_S2C_SelfDelta 原始数据。
 * @returns 无返回值，直接更新NextSelfVitalMetadata相关状态。
 */


  function applyNextSelfVitalsMetadata(data: NEXT_S2C_SelfDelta): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const player = options.getPlayer();
    if (!player) {
      return;
    }
    let attrTouched = false;
    if (typeof data.maxHp === 'number') {
      player.maxHp = data.maxHp;
      attrTouched = true;
    }
    if (typeof data.maxQi === 'number') {
      attrTouched = true;
    }
    if (!attrTouched) {
      return;
    }

    const latestAttrUpdate = options.getLatestAttrUpdate();
    const nextNumericStats = player.numericStats
      ? cloneJson(player.numericStats)
      : latestAttrUpdate?.numericStats
        ? cloneJson(latestAttrUpdate.numericStats)
        : undefined;
    if (nextNumericStats) {
      if (typeof data.maxHp === 'number') {
        nextNumericStats.maxHp = data.maxHp;
      }
      if (typeof data.maxQi === 'number') {
        nextNumericStats.maxQi = data.maxQi;
      }
      player.numericStats = nextNumericStats;
    }

    const nextAttrUpdate = options.mergeAttrUpdatePatch(latestAttrUpdate, {
      maxHp: data.maxHp,
      numericStats: nextNumericStats,
    });
    options.setLatestAttrUpdate(nextAttrUpdate);
    options.updateAttrPanel(nextAttrUpdate);
    options.refreshUiChrome();
  }  
  /**
 * mergeVisibleBuffStates：判断可见Buff状态是否满足条件。
 * @param previous TemporaryBuffState[] | undefined 参数说明。
 * @param data NonNullable<NEXT_S2C_PanelDelta['buff']> 原始数据。
 * @returns 返回可见Buff状态列表。
 */


  function mergeVisibleBuffStates(
    previous: TemporaryBuffState[] | undefined,
    data: NonNullable<NEXT_S2C_PanelDelta['buff']>,
  ): TemporaryBuffState[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const next = new Map((previous ?? []).map((entry) => [entry.buffId, cloneJson(entry)] as const));
    if (data.full) {
      next.clear();
    }
    for (const buff of data.buffs ?? []) {
      next.set(buff.buffId, cloneJson(buff));
    }
    for (const buffId of data.removeBuffIds ?? []) {
      next.delete(buffId);
    }
    return Array.from(next.values()).sort((left, right) => left.buffId.localeCompare(right.buffId, 'zh-Hans-CN'));
  }

  return {  
  /**
 * handleWorldDelta：处理世界增量并更新相关状态。
 * @param data NEXT_S2C_WorldDelta 原始数据。
 * @returns 无返回值，直接更新世界Delta相关状态。
 */

    handleWorldDelta(data: NEXT_S2C_WorldDelta): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      const player = options.getPlayer();
      if (!player) {
        return;
      }
      const previousState = {
        mapId: player.mapId,
        x: player.x,
        y: player.y,
        facing: player.facing,
      };
      const runtimeInput = buildNextWorldDeltaRuntimeInput(data);
      const selfPatch = runtimeInput.playerPatches.find((patch) => patch.id === player.id);
      options.syncAuraLevelBaseValue(data.auraLevelBaseValue);
      options.syncCurrentTimeState(data.time ?? null);
      options.applyWorldDeltaToRuntime(runtimeInput);
      if (selfPatch?.name) {
        player.name = selfPatch.name;
      }
      if (typeof selfPatch?.x === 'number') {
        player.x = selfPatch.x;
      }
      if (typeof selfPatch?.y === 'number') {
        player.y = selfPatch.y;
      }
      if (selfPatch && (typeof selfPatch.x === 'number' || typeof selfPatch.y === 'number')) {
        logNextMovement('client.recv.worldDelta.selfPatch', {
          playerId: player.id,
          before: previousState,
          patch: {
            x: typeof selfPatch.x === 'number' ? selfPatch.x : null,
            y: typeof selfPatch.y === 'number' ? selfPatch.y : null,
          },
          after: {
            mapId: player.mapId,
            x: player.x,
            y: player.y,
            facing: player.facing,
          },
          pathTarget: options.navigation.getPathTarget(),
          pathCells: options.navigation.getPathCells(),
        });
      }
      finalizeNextMovementFrame();
    },    
    /**
 * handleSelfDelta：处理Self增量并更新相关状态。
 * @param data NEXT_S2C_SelfDelta 原始数据。
 * @returns 无返回值，直接更新SelfDelta相关状态。
 */


    handleSelfDelta(data: NEXT_S2C_SelfDelta): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      const player = options.getPlayer();
      if (!player) {
        return;
      }
      const previousState = {
        mapId: player.mapId,
        x: player.x,
        y: player.y,
        facing: player.facing,
      };
      applyNextSelfVitalsMetadata(data);
      const previousMapId = player.mapId;
      const playerPatch = buildNextSelfRuntimePlayerPatch(data);
      options.applySelfDeltaToRuntime({
        mapId: data.mid,
        x: data.x,
        y: data.y,
        facing: data.f,
        hp: data.hp,
        qi: data.qi,
        playerPatch,
      });
      const mapChanged = typeof data.mid === 'string' && previousMapId !== data.mid;
      if (mapChanged) {
        options.navigation.clearCurrentPath();
        options.setLatestObservedEntities([]);
        options.setLatestObservedEntityMap(new Map());
        options.targeting.setHoveredMapTile(null);
        options.hideObserveModal();
        options.clearLootPanel();
        options.targeting.cancelTargeting();
        player.mapId = data.mid!;
        options.setPanelRuntimeMapId(player.mapId);
        options.syncQuestMapId(player.mapId);
      }
      if (typeof data.hp === 'number') {
        player.hp = data.hp;
      }
      if (typeof data.qi === 'number') {
        player.qi = data.qi;
      }
      if (data.f !== undefined) {
        player.facing = data.f;
      }
      if (typeof data.x === 'number') {
        player.x = data.x;
      }
      if (typeof data.y === 'number') {
        player.y = data.y;
      }
      if (typeof data.mid === 'string' || typeof data.x === 'number' || typeof data.y === 'number' || data.f !== undefined) {
        logNextMovement('client.recv.selfDelta', {
          playerId: player.id,
          before: previousState,
          delta: {
            mapId: data.mid ?? null,
            x: typeof data.x === 'number' ? data.x : null,
            y: typeof data.y === 'number' ? data.y : null,
            facing: data.f ?? null,
          },
          after: {
            mapId: player.mapId,
            x: player.x,
            y: player.y,
            facing: player.facing,
          },
          pathTarget: options.navigation.getPathTarget(),
          pathCells: options.navigation.getPathCells(),
        });
      }
      finalizeNextMovementFrame();
    },    
    /**
 * handlePanelDelta：处理面板增量并更新相关状态。
 * @param data NEXT_S2C_PanelDelta 原始数据。
 * @returns 无返回值，直接更新面板Delta相关状态。
 */


    handlePanelDelta(data: NEXT_S2C_PanelDelta): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      if (data.attr) {
        options.handleAttrUpdate(data.attr);
      }
      if (data.inv) {
        options.handleInventoryUpdate(data.inv);
      }
      if (data.eq) {
        options.handleEquipmentUpdate(data.eq);
      }
      if (data.tech) {
        options.handleTechniqueUpdate(data.tech);
      }
      if (data.act) {
        options.handleActionsUpdate(data.act);
      }
      const player = options.getPlayer();
      if (data.buff && player) {
        player.temporaryBuffs = mergeVisibleBuffStates(player.temporaryBuffs, data.buff);
      }
    },
  };
}

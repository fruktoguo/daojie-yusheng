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

type MainRuntimeDeltaStateSourceOptions = {
  getPlayer: () => PlayerState | null;
  getLatestEntityById: (id: string) => ObservedEntity | undefined;
  setLatestObservedEntities: (entities: ObservedEntity[]) => void;
  setLatestObservedEntityMap: (map: Map<string, ObservedEntity>) => void;
  getLatestAttrUpdate: () => NEXT_S2C_AttrUpdate | null;
  setLatestAttrUpdate: (value: NEXT_S2C_AttrUpdate | null) => void;
  mergeAttrUpdatePatch: (previous: NEXT_S2C_AttrUpdate | null, patch: NEXT_S2C_AttrUpdate) => NEXT_S2C_AttrUpdate;
  syncAuraLevelBaseValue: (value?: number) => void;
  syncCurrentTimeState: (state: NEXT_S2C_WorldDelta['time'] | null | undefined) => void;
  applyWorldDeltaToRuntime: (input: {
    playerPatches: TickRenderEntity[];
    entityPatches: TickRenderEntity[];
    removedEntityIds: string[];
    groundPatches: GroundItemPilePatch[];
    effects?: NEXT_S2C_WorldDelta['fx'];
    threatArrows?: Array<{ ownerId: string; targetId: string }>;
    threatArrowAdds?: Array<[string, string]>;
    threatArrowRemoves?: Array<[string, string]>;
    pathCells?: Array<{ x: number; y: number }>;
    tickDurationMs?: number;
    time?: NEXT_S2C_WorldDelta['time'];
    visibleTiles?: NEXT_S2C_WorldDelta['v'];
    visibleTilePatches?: NEXT_S2C_WorldDelta['tp'];
    mapId?: string;
  }) => void;
  applySelfDeltaToRuntime: (input: {
    mapId?: string;
    x?: number;
    y?: number;
    facing?: PlayerState['facing'];
    hp?: number;
    qi?: number;
    playerPatch: TickRenderEntity | null;
  }) => void;
  navigation: {
    trimCurrentPathProgress: () => void;
    triggerAutoInteractionIfReady: () => boolean;
    getPathTarget: () => { x: number; y: number } | null;
    getPathCells: () => Array<{ x: number; y: number }>;
    clearCurrentPath: () => void;
    syncPathCellsToRuntime: () => void;
  };
  targeting: {
    syncSenseQiOverlay: () => void;
    syncTargetingOverlay: () => void;
    setHoveredMapTile: (value: null) => void;
    cancelTargeting: () => void;
  };
  refreshHudChrome: () => void;
  hideObserveModal: () => void;
  clearLootPanel: () => void;
  setPanelRuntimeMapId: (mapId: string) => void;
  syncQuestMapId: (mapId: string) => void;
  updateAttrPanel: (value: NEXT_S2C_AttrUpdate) => void;
  refreshUiChrome: () => void;
  handleAttrUpdate: (data: NEXT_S2C_AttrUpdate) => void;
  handleInventoryUpdate: (data: NonNullable<NEXT_S2C_PanelDelta['inv']>) => void;
  handleEquipmentUpdate: (data: NonNullable<NEXT_S2C_PanelDelta['eq']>) => void;
  handleTechniqueUpdate: (data: NonNullable<NEXT_S2C_PanelDelta['tech']>) => void;
  handleActionsUpdate: (data: NonNullable<NEXT_S2C_PanelDelta['act']>) => void;
};

const NEXT_PLAYER_ENTITY_COLOR = '#8ec5ff';
const NEXT_MONSTER_ENTITY_COLOR = '#ff9b73';
const NEXT_NPC_ENTITY_COLOR = '#f3d27a';
const NEXT_PORTAL_ENTITY_COLOR = '#b9a7ff';
const NEXT_CONTAINER_ENTITY_COLOR = '#c18b46';

function getFirstGrapheme(input: string | undefined, fallback: string): string {
  const normalized = input?.trim();
  if (!normalized) {
    return fallback;
  }
  return [...normalized][0] ?? fallback;
}

export type MainRuntimeDeltaStateSource = ReturnType<typeof createMainRuntimeDeltaStateSource>;

export function createMainRuntimeDeltaStateSource(options: MainRuntimeDeltaStateSourceOptions) {
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

  function buildNextWorldDeltaRuntimeInput(data: NEXT_S2C_WorldDelta) {
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

  function buildNextSelfRuntimePlayerPatch(data: NEXT_S2C_SelfDelta): TickRenderEntity | null {
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

  function syncLatestObservedEntitiesFromRuntime(): void {
    const entities = getLatestObservedEntitiesSnapshot() as ObservedEntity[];
    options.setLatestObservedEntities(entities);
    options.setLatestObservedEntityMap(new Map(entities.map((entity) => [entity.id, entity])));
  }

  function finalizeNextMovementFrame(): void {
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

  function applyNextSelfVitalsMetadata(data: NEXT_S2C_SelfDelta): void {
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

  function mergeVisibleBuffStates(
    previous: TemporaryBuffState[] | undefined,
    data: NonNullable<NEXT_S2C_PanelDelta['buff']>,
  ): TemporaryBuffState[] {
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
    handleWorldDelta(data: NEXT_S2C_WorldDelta): void {
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

    handleSelfDelta(data: NEXT_S2C_SelfDelta): void {
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

    handlePanelDelta(data: NEXT_S2C_PanelDelta): void {
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

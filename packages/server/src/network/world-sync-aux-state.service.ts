import { Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_AURA_LEVEL_BASE_VALUE,
  type BootstrapView,
  type GameTimeState,
  type HeavenGateRootValues,
  type HeavenGateState,
  type MapMinimapArchiveEntry,
  type MapMinimapMarker,
  type MapMinimapSnapshot,
  type MapStaticSyncView,
  type PlayerRealmState,
  type RealmView,
  type SyncedItemStack,
  type SyncedLootWindowState,
  type WorldDeltaView,
} from '@mud/shared';

import { MapTemplateRepository } from '../runtime/map/map-template.repository';
import { WorldSyncMapSnapshotService } from './world-sync-map-snapshot.service';
import { WorldSyncMapStaticAuxService } from './world-sync-map-static-aux.service';
import { WorldSyncMinimapService } from './world-sync-minimap.service';
import { WorldSyncPlayerStateService } from './world-sync-player-state.service';
import { WorldSyncProtocolService } from './world-sync-protocol.service';
import { WorldSyncQuestLootService } from './world-sync-quest-loot.service';
import { WorldSyncThreatService } from './world-sync-threat.service';

type MapTemplateRepositoryInstance = InstanceType<typeof MapTemplateRepository>;
type WorldSyncMapSnapshotServiceInstance = InstanceType<typeof WorldSyncMapSnapshotService>;
type WorldSyncMapStaticAuxServiceInstance = InstanceType<typeof WorldSyncMapStaticAuxService>;
type WorldSyncMinimapServiceInstance = InstanceType<typeof WorldSyncMinimapService>;
type WorldSyncProtocolServiceInstance = InstanceType<typeof WorldSyncProtocolService>;
type WorldSyncQuestLootServiceInstance = InstanceType<typeof WorldSyncQuestLootService>;
type WorldSyncThreatServiceInstance = InstanceType<typeof WorldSyncThreatService>;
type WorldSyncPlayerStateServiceInstance = InstanceType<typeof WorldSyncPlayerStateService>;

type MapTemplate = ReturnType<MapTemplateRepositoryInstance['getOrThrow']>;
type RuntimePlayer = Parameters<WorldSyncPlayerStateServiceInstance['buildPlayerSyncState']>[0];
type PlayerView = Parameters<WorldSyncPlayerStateServiceInstance['buildPlayerSyncState']>[1];
type PlayerSyncState = ReturnType<WorldSyncPlayerStateServiceInstance['buildPlayerSyncState']>;
type VisibleTilesSnapshot = ReturnType<WorldSyncMapStaticAuxServiceInstance['buildInitialMapStaticState']>['visibleTiles'];
type ThreatArrow = ReturnType<WorldSyncThreatServiceInstance['buildThreatArrows']>;
type LootWindowState = ReturnType<WorldSyncQuestLootServiceInstance['buildLootWindowSyncState']>;

interface SocketLike {
  emit(event: string, payload: unknown): void;
}

interface MapTemplateRepositoryPort {
  getOrThrow: MapTemplateRepositoryInstance['getOrThrow'];
}

interface WorldSyncMapSnapshotServicePort {
  buildRenderEntitiesSnapshot: WorldSyncMapSnapshotServiceInstance['buildRenderEntitiesSnapshot'];
  buildMinimapLibrarySync: WorldSyncMapSnapshotServiceInstance['buildMinimapLibrarySync'];
  buildGameTimeState: WorldSyncMapSnapshotServiceInstance['buildGameTimeState'];
  buildMapTickIntervalMs: WorldSyncMapSnapshotServiceInstance['buildMapTickIntervalMs'];
  buildMapMetaSync: WorldSyncMapSnapshotServiceInstance['buildMapMetaSync'];
}

interface WorldSyncMapStaticAuxServicePort {
  clearPlayerCache: WorldSyncMapStaticAuxServiceInstance['clearPlayerCache'];
  buildInitialMapStaticState: WorldSyncMapStaticAuxServiceInstance['buildInitialMapStaticState'];
  buildDeltaMapStaticPlan: WorldSyncMapStaticAuxServiceInstance['buildDeltaMapStaticPlan'];
  commitPlayerCache: WorldSyncMapStaticAuxServiceInstance['commitPlayerCache'];
}

interface WorldSyncMinimapServicePort {
  buildMinimapSnapshotSync: WorldSyncMinimapServiceInstance['buildMinimapSnapshotSync'];
}

interface WorldSyncProtocolServicePort {
  sendBootstrap: WorldSyncProtocolServiceInstance['sendBootstrap'];
  sendMapStatic: WorldSyncProtocolServiceInstance['sendMapStatic'];
  sendWorldDelta: WorldSyncProtocolServiceInstance['sendWorldDelta'];
  sendRealm: WorldSyncProtocolServiceInstance['sendRealm'];
  sendLootWindow: WorldSyncProtocolServiceInstance['sendLootWindow'];
}

interface WorldSyncQuestLootServicePort {
  buildLootWindowSyncState: WorldSyncQuestLootServiceInstance['buildLootWindowSyncState'];
}

interface WorldSyncThreatServicePort {
  buildThreatArrows: WorldSyncThreatServiceInstance['buildThreatArrows'];
  emitInitialThreatSync: WorldSyncThreatServiceInstance['emitInitialThreatSync'];
  emitDeltaThreatSync: WorldSyncThreatServiceInstance['emitDeltaThreatSync'];
}

interface WorldSyncPlayerStateServicePort {
  buildPlayerSyncState: WorldSyncPlayerStateServiceInstance['buildPlayerSyncState'];
}

interface ProtocolAuxState {
  realm: PlayerRealmState | null;
  time: TimeSyncState;
  threatArrows: ThreatArrow;
  lootWindow: LootWindowState;
}

interface TimeSyncState {
  mapId: string;
  tickIntervalMs: number;
  time: GameTimeState;
}

interface MapStaticSyncOptions {
  mapMeta?: MapStaticSyncView['mapMeta'];
  minimap?: MapMinimapSnapshot;
  minimapLibrary?: MapMinimapArchiveEntry[];
  tiles?: VisibleTilesSnapshot['matrix'];
  tilesOriginX?: number;
  tilesOriginY?: number;
  visibleMinimapMarkers?: MapMinimapMarker[];
}

interface WorldDeltaMapPatchSyncOptions {
  tilePatches?: WorldDeltaView['tp'];
  time?: WorldDeltaView['time'];
  tickIntervalMs?: WorldDeltaView['dt'];
  visibleMinimapMarkerAdds?: WorldDeltaView['vma'];
  visibleMinimapMarkerRemoves?: WorldDeltaView['vmr'];
}

@Injectable()
export class WorldSyncAuxStateService {
  private readonly protocolAuxStateByPlayerId = new Map<string, ProtocolAuxState>();

  constructor(
    @Inject(MapTemplateRepository)
    private readonly templateRepository: MapTemplateRepositoryPort,
    @Inject(WorldSyncMapSnapshotService)
    private readonly worldSyncMapSnapshotService: WorldSyncMapSnapshotServicePort,
    @Inject(WorldSyncMapStaticAuxService)
    private readonly worldSyncMapStaticAuxService: WorldSyncMapStaticAuxServicePort,
    @Inject(WorldSyncMinimapService)
    private readonly worldSyncMinimapService: WorldSyncMinimapServicePort,
    @Inject(WorldSyncProtocolService)
    private readonly worldSyncProtocolService: WorldSyncProtocolServicePort,
    @Inject(WorldSyncQuestLootService)
    private readonly worldSyncQuestLootService: WorldSyncQuestLootServicePort,
    @Inject(WorldSyncThreatService)
    private readonly worldSyncThreatService: WorldSyncThreatServicePort,
    @Inject(WorldSyncPlayerStateService)
    private readonly worldSyncPlayerStateService: WorldSyncPlayerStateServicePort,
  ) {}

  clearPlayerCache(playerId: string): void {
    this.worldSyncMapStaticAuxService.clearPlayerCache(playerId);
    this.protocolAuxStateByPlayerId.delete(playerId);
  }

  emitAuxInitialSync(
    playerId: string,
    socket: SocketLike,
    view: PlayerView,
    player: RuntimePlayer,
  ): void {
    const template = this.templateRepository.getOrThrow(view.instance.templateId);
    const mapStaticState = this.worldSyncMapStaticAuxService.buildInitialMapStaticState(view, player, template);
    const visibleTiles = mapStaticState.visibleTiles;
    const minimapLibrary = this.worldSyncMapSnapshotService.buildMinimapLibrarySync(player);
    const timeState = this.worldSyncMapSnapshotService.buildGameTimeState(template, view, player);
    const timeSyncState = this.buildTimeSyncState(template.id, timeState);
    const threatArrows = this.worldSyncThreatService.buildThreatArrows(view);
    const bootstrapPayload = this.buildBootstrapSyncPayload(
      this.worldSyncPlayerStateService.buildPlayerSyncState(
        player,
        view,
        minimapLibrary.map((entry) => entry.mapId),
      ),
      timeState,
    );

    this.worldSyncProtocolService.sendBootstrap(socket, bootstrapPayload);
    this.worldSyncProtocolService.sendMapStatic(
      socket,
      this.buildMapStaticSyncPayload(template, {
        tiles: visibleTiles.matrix,
        tilesOriginX: resolveVisibleTilesOriginX(view, player),
        tilesOriginY: resolveVisibleTilesOriginY(view, player),
      }),
    );
    if (timeSyncState.tickIntervalMs !== 1000) {
      this.worldSyncProtocolService.sendWorldDelta(
        socket,
        this.buildWorldDeltaMapPatchPayload(view, {
          time: cloneGameTimeState(timeSyncState.time),
          tickIntervalMs: timeSyncState.tickIntervalMs,
        }),
      );
    }
    this.worldSyncProtocolService.sendRealm(socket, this.buildRealmSyncPayload(player));

    const lootWindow = this.worldSyncQuestLootService.buildLootWindowSyncState(playerId);
    this.worldSyncProtocolService.sendLootWindow(socket, { window: lootWindow });
    this.worldSyncThreatService.emitInitialThreatSync(socket, view, threatArrows);
    this.worldSyncMapStaticAuxService.commitPlayerCache(playerId, mapStaticState.cacheState);
    this.protocolAuxStateByPlayerId.set(playerId, {
      realm: cloneRealmState(player.realm),
      time: cloneTimeSyncState(timeSyncState),
      threatArrows: cloneThreatArrows(threatArrows),
      lootWindow: cloneLootWindow(lootWindow),
    });
  }

  emitAuxDeltaSync(
    playerId: string,
    socket: SocketLike,
    view: PlayerView,
    player: RuntimePlayer,
  ): void {
    const previous = this.protocolAuxStateByPlayerId.get(playerId) ?? null;
    if (!previous) {
      this.emitAuxInitialSync(playerId, socket, view, player);
      return;
    }

    const template = this.templateRepository.getOrThrow(view.instance.templateId);
    const mapStaticPlan = this.worldSyncMapStaticAuxService.buildDeltaMapStaticPlan(playerId, view, player, template);
    const visibleTiles = mapStaticPlan.visibleTiles;
    const currentVisibleMinimapMarkers = mapStaticPlan.visibleMinimapMarkers;
    const mapChanged = mapStaticPlan.mapChanged;
    const currentTimeSyncState = this.buildTimeSyncState(
      template.id,
      this.worldSyncMapSnapshotService.buildGameTimeState(template, view, player),
    );
    const shouldEmitTimeSync = !isSameTimeSyncState(previous.time, currentTimeSyncState);

    if (mapChanged) {
      const minimapLibrary = this.worldSyncMapSnapshotService.buildMinimapLibrarySync(player);
      const mapUnlocked = Array.isArray(player.unlockedMapIds) && player.unlockedMapIds.includes(template.id);
      this.worldSyncProtocolService.sendMapStatic(
        socket,
        this.buildMapStaticSyncPayload(template, {
          mapMeta: this.worldSyncMapSnapshotService.buildMapMetaSync(template),
          minimap: mapUnlocked ? this.worldSyncMinimapService.buildMinimapSnapshotSync(template) : undefined,
          tiles: visibleTiles.matrix,
          tilesOriginX: resolveVisibleTilesOriginX(view, player),
          tilesOriginY: resolveVisibleTilesOriginY(view, player),
          visibleMinimapMarkers: currentVisibleMinimapMarkers,
          minimapLibrary: minimapLibrary.length > 0 ? minimapLibrary : undefined,
        }),
      );
    }

    const hasMapPatch =
      !mapChanged
      && (
        mapStaticPlan.visibleMinimapMarkerAdds.length > 0
        || mapStaticPlan.visibleMinimapMarkerRemoves.length > 0
        || mapStaticPlan.tilePatches.length > 0
      );
    if (hasMapPatch || shouldEmitTimeSync) {
      this.worldSyncProtocolService.sendWorldDelta(
        socket,
        this.buildWorldDeltaMapPatchPayload(view, {
          tilePatches: hasMapPatch && mapStaticPlan.tilePatches.length > 0 ? mapStaticPlan.tilePatches : undefined,
          time: shouldEmitTimeSync ? cloneGameTimeState(currentTimeSyncState.time) : undefined,
          tickIntervalMs: shouldEmitTimeSync ? currentTimeSyncState.tickIntervalMs : undefined,
          visibleMinimapMarkerAdds:
            hasMapPatch && mapStaticPlan.visibleMinimapMarkerAdds.length > 0
              ? mapStaticPlan.visibleMinimapMarkerAdds
              : undefined,
          visibleMinimapMarkerRemoves:
            hasMapPatch && mapStaticPlan.visibleMinimapMarkerRemoves.length > 0
              ? mapStaticPlan.visibleMinimapMarkerRemoves
              : undefined,
        }),
      );
    }

    const currentRealm = cloneRealmState(player.realm);
    if (!isSameRealmState(previous.realm, currentRealm)) {
      this.worldSyncProtocolService.sendRealm(socket, this.buildRealmSyncPayload(player, currentRealm));
    }

    const lootWindow = this.worldSyncQuestLootService.buildLootWindowSyncState(playerId);
    if (!isSameLootWindow(previous.lootWindow, lootWindow)) {
      this.worldSyncProtocolService.sendLootWindow(socket, { window: lootWindow });
    }

    const currentThreatArrows = this.worldSyncThreatService.emitDeltaThreatSync(
      socket,
      view,
      previous.threatArrows,
      mapChanged,
    );

    this.worldSyncMapStaticAuxService.commitPlayerCache(playerId, mapStaticPlan.cacheState);
    this.protocolAuxStateByPlayerId.set(playerId, {
      realm: currentRealm,
      time: cloneTimeSyncState(currentTimeSyncState),
      threatArrows: cloneThreatArrows(currentThreatArrows),
      lootWindow: cloneLootWindow(lootWindow),
    });
  }

  private buildTimeSyncState(mapId: string, time: GameTimeState): TimeSyncState {
    return {
      mapId,
      tickIntervalMs: this.worldSyncMapSnapshotService.buildMapTickIntervalMs(mapId),
      time: cloneGameTimeState(time),
    };
  }

  private buildBootstrapSyncPayload(
    self: PlayerSyncState,
    timeState: GameTimeState,
  ): BootstrapView {
    return {
      self,
      time: cloneGameTimeState(timeState),
      auraLevelBaseValue: DEFAULT_AURA_LEVEL_BASE_VALUE,
    };
  }

  private buildMapStaticSyncPayload(
    template: MapTemplate,
    options: MapStaticSyncOptions = {},
  ): MapStaticSyncView {
    return {
      mapId: template.id,
      mapMeta: options.mapMeta,
      minimap: options.minimap,
      minimapLibrary: options.minimapLibrary,
      tiles: options.tiles,
      tilesOriginX: options.tilesOriginX,
      tilesOriginY: options.tilesOriginY,
      visibleMinimapMarkers: options.visibleMinimapMarkers,
    };
  }

  private buildWorldDeltaMapPatchPayload(
    view: PlayerView,
    options: WorldDeltaMapPatchSyncOptions = {},
  ): WorldDeltaView {
    return {
      t: view.tick,
      wr: view.worldRevision,
      sr: view.selfRevision,
      tp: options.tilePatches,
      dt: options.tickIntervalMs,
      time: options.time,
      vma: options.visibleMinimapMarkerAdds,
      vmr: options.visibleMinimapMarkerRemoves,
    };
  }

  private buildRealmSyncPayload(
    player: RuntimePlayer,
    realm: PlayerRealmState | null = cloneRealmState(player.realm),
  ): RealmView {
    return { realm };
  }
}

function resolveVisibleTilesOriginX(view: PlayerView, player: RuntimePlayer): number {
  return view.self.x - Math.max(1, Math.round(player.attrs.numericStats.viewRange));
}

function resolveVisibleTilesOriginY(view: PlayerView, player: RuntimePlayer): number {
  return view.self.y - Math.max(1, Math.round(player.attrs.numericStats.viewRange));
}

function cloneGameTimeState(source: GameTimeState): GameTimeState {
  return { ...source };
}

function cloneTimeSyncState(source: TimeSyncState): TimeSyncState {
  return {
    mapId: source.mapId,
    tickIntervalMs: source.tickIntervalMs,
    time: cloneGameTimeState(source.time),
  };
}

function isSameTimeSyncState(left: TimeSyncState | null | undefined, right: TimeSyncState): boolean {
  if (!left) {
    return false;
  }
  return left.mapId === right.mapId
    && left.tickIntervalMs === right.tickIntervalMs
    && isSameGameTimeProjection(left.time, right.time);
}

function isSameGameTimeProjection(left: GameTimeState, right: GameTimeState): boolean {
  return left.dayLength === right.dayLength
    && left.timeScale === right.timeScale
    && left.phase === right.phase
    && left.phaseLabel === right.phaseLabel
    && left.darknessStacks === right.darknessStacks
    && left.visionMultiplier === right.visionMultiplier
    && left.lightPercent === right.lightPercent
    && left.effectiveViewRange === right.effectiveViewRange
    && left.tint === right.tint
    && left.overlayAlpha === right.overlayAlpha
    && hasExpectedLocalTimeProgression(left, right);
}

function hasExpectedLocalTimeProgression(left: GameTimeState, right: GameTimeState): boolean {
  if (
    left.dayLength <= 0
    || right.dayLength <= 0
    || left.dayLength !== right.dayLength
    || !Number.isFinite(left.totalTicks)
    || !Number.isFinite(right.totalTicks)
    || !Number.isFinite(left.localTicks)
    || !Number.isFinite(right.localTicks)
    || !Number.isFinite(right.timeScale)
  ) {
    return false;
  }
  const expected = wrapLocalTicks(left.localTicks + (right.totalTicks - left.totalTicks) * right.timeScale, right.dayLength);
  const actual = wrapLocalTicks(right.localTicks, right.dayLength);
  const directDistance = Math.abs(expected - actual);
  const wrappedDistance = right.dayLength - directDistance;
  return Math.min(directDistance, wrappedDistance) < 0.5;
}

function wrapLocalTicks(value: number, dayLength: number): number {
  return ((value % dayLength) + dayLength) % dayLength;
}

function cloneThreatArrows(source: ThreatArrow): ThreatArrow {
  return source.map(([ownerId, targetId]) => [ownerId, targetId]);
}

function cloneLootWindow(source: LootWindowState): LootWindowState {
  if (!source) {
    return null;
  }

  return {
    tileX: source.tileX,
    tileY: source.tileY,
    title: source.title,
    sources: source.sources.map((entry) => ({
      sourceId: entry.sourceId,
      kind: entry.kind,
      title: entry.title,
      desc: entry.desc,
      grade: entry.grade,
      searchable: entry.searchable,
      search: entry.search ? { ...entry.search } : undefined,
      variant: entry.variant,
      herb: entry.herb ? { ...entry.herb } : undefined,
      destroyed: entry.destroyed,
      items: entry.items.map((item) => ({
        itemKey: item.itemKey,
        item: { ...item.item },
      })),
      emptyText: entry.emptyText,
    })),
  };
}

function cloneRealmState(source: PlayerRealmState | null | undefined): PlayerRealmState | null {
  if (!source) {
    return null;
  }

  return {
    ...source,
    breakthroughItems: source.breakthroughItems.map((entry) => ({ ...entry })),
    breakthrough: source.breakthrough
      ? {
          ...source.breakthrough,
          requirements: source.breakthrough.requirements.map((entry) => ({ ...entry })),
        }
      : undefined,
    heavenGate: cloneHeavenGateState(source.heavenGate),
  };
}

function isSameRealmState(left: PlayerRealmState | null, right: PlayerRealmState | null): boolean {
  if (!left || !right) {
    return left === right;
  }

  return left.stage === right.stage
    && left.realmLv === right.realmLv
    && left.displayName === right.displayName
    && left.name === right.name
    && left.shortName === right.shortName
    && left.path === right.path
    && left.narrative === right.narrative
    && left.review === right.review
    && left.lifespanYears === right.lifespanYears
    && left.progress === right.progress
    && left.progressToNext === right.progressToNext
    && left.breakthroughReady === right.breakthroughReady
    && left.nextStage === right.nextStage
    && left.minTechniqueLevel === right.minTechniqueLevel
    && left.minTechniqueRealm === right.minTechniqueRealm
    && isSameBreakthroughItemList(left.breakthroughItems, right.breakthroughItems)
    && isSameBreakthroughPreview(left.breakthrough, right.breakthrough)
    && isSameHeavenGateState(left.heavenGate, right.heavenGate);
}

function isSameBreakthroughItemList(
  left: PlayerRealmState['breakthroughItems'],
  right: PlayerRealmState['breakthroughItems'],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index].itemId !== right[index].itemId || left[index].count !== right[index].count) {
      return false;
    }
  }

  return true;
}

function isSameBreakthroughPreview(
  left: PlayerRealmState['breakthrough'],
  right: PlayerRealmState['breakthrough'],
): boolean {
  if (!left || !right) {
    return left === right;
  }

  if (
    left.targetRealmLv !== right.targetRealmLv
    || left.targetDisplayName !== right.targetDisplayName
    || left.totalRequirements !== right.totalRequirements
    || left.completedRequirements !== right.completedRequirements
    || left.allCompleted !== right.allCompleted
    || left.canBreakthrough !== right.canBreakthrough
    || left.blockingRequirements !== right.blockingRequirements
    || left.completedBlockingRequirements !== right.completedBlockingRequirements
    || left.blockedReason !== right.blockedReason
    || left.requirements.length !== right.requirements.length
  ) {
    return false;
  }

  for (let index = 0; index < left.requirements.length; index += 1) {
    const leftEntry = left.requirements[index];
    const rightEntry = right.requirements[index];
    if (
      leftEntry.id !== rightEntry.id
      || leftEntry.type !== rightEntry.type
      || leftEntry.label !== rightEntry.label
      || leftEntry.completed !== rightEntry.completed
      || leftEntry.hidden !== rightEntry.hidden
      || leftEntry.optional !== rightEntry.optional
      || leftEntry.blocksBreakthrough !== rightEntry.blocksBreakthrough
      || leftEntry.increasePct !== rightEntry.increasePct
      || leftEntry.detail !== rightEntry.detail
    ) {
      return false;
    }
  }

  return true;
}

function isSameHeavenGateState(
  left: HeavenGateState | null | undefined,
  right: HeavenGateState | null | undefined,
): boolean {
  if (!left || !right) {
    return left === right;
  }

  return left.unlocked === right.unlocked
    && left.entered === right.entered
    && left.averageBonus === right.averageBonus
    && isSameStringArray(left.severed, right.severed)
    && isSameHeavenGateRoots(left.roots, right.roots);
}

function isSameHeavenGateRoots(
  left: HeavenGateRootValues | null | undefined,
  right: HeavenGateRootValues | null | undefined,
): boolean {
  if (!left || !right) {
    return left === right;
  }

  return left.metal === right.metal
    && left.wood === right.wood
    && left.water === right.water
    && left.fire === right.fire
    && left.earth === right.earth;
}

function isSameStringArray(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function cloneHeavenGateState(source: HeavenGateState | null | undefined): HeavenGateState | null {
  if (!source) {
    return null;
  }

  return {
    unlocked: source.unlocked,
    severed: source.severed.slice(),
    roots: cloneHeavenGateRoots(source.roots),
    entered: source.entered,
    averageBonus: source.averageBonus,
  };
}

function cloneHeavenGateRoots(
  source: HeavenGateRootValues | null | undefined,
): HeavenGateRootValues | null {
  if (!source) {
    return null;
  }

  return {
    metal: source.metal,
    wood: source.wood,
    water: source.water,
    fire: source.fire,
    earth: source.earth,
  };
}

function isSameLootWindow(left: LootWindowState, right: LootWindowState): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }

  if (
    left.tileX !== right.tileX
    || left.tileY !== right.tileY
    || left.title !== right.title
    || left.sources.length !== right.sources.length
  ) {
    return false;
  }

  for (let index = 0; index < left.sources.length; index += 1) {
    const leftSource = left.sources[index];
    const rightSource = right.sources[index];
    if (!leftSource || !rightSource) {
      return false;
    }
    if (
      leftSource.sourceId !== rightSource.sourceId
      || leftSource.kind !== rightSource.kind
      || leftSource.title !== rightSource.title
      || leftSource.desc !== rightSource.desc
      || leftSource.grade !== rightSource.grade
      || leftSource.searchable !== rightSource.searchable
      || leftSource.variant !== rightSource.variant
      || leftSource.destroyed !== rightSource.destroyed
      || leftSource.emptyText !== rightSource.emptyText
      || leftSource.items.length !== rightSource.items.length
    ) {
      return false;
    }
    if (Boolean(leftSource.herb) !== Boolean(rightSource.herb)) {
      return false;
    }
    if (leftSource.herb && rightSource.herb) {
      if (
        leftSource.herb.grade !== rightSource.herb.grade
        || leftSource.herb.level !== rightSource.herb.level
        || leftSource.herb.gatherTicks !== rightSource.herb.gatherTicks
        || leftSource.herb.respawnRemainingTicks !== rightSource.herb.respawnRemainingTicks
      ) {
        return false;
      }
    }
    if (Boolean(leftSource.search) !== Boolean(rightSource.search)) {
      return false;
    }
    if (leftSource.search && rightSource.search) {
      if (
        leftSource.search.totalTicks !== rightSource.search.totalTicks
        || leftSource.search.remainingTicks !== rightSource.search.remainingTicks
        || leftSource.search.elapsedTicks !== rightSource.search.elapsedTicks
      ) {
        return false;
      }
    }
    for (let itemIndex = 0; itemIndex < leftSource.items.length; itemIndex += 1) {
      if (
        leftSource.items[itemIndex].itemKey !== rightSource.items[itemIndex].itemKey
        || !isSameSyncedItem(leftSource.items[itemIndex].item, rightSource.items[itemIndex].item)
      ) {
        return false;
      }
    }
  }

  return true;
}

function isSameSyncedItem(left: SyncedItemStack | null | undefined, right: SyncedItemStack | null | undefined): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }

  return left.itemId === right.itemId
    && left.count === right.count
    && left.name === right.name
    && left.type === right.type
    && left.desc === right.desc
    && left.groundLabel === right.groundLabel
    && left.grade === right.grade
    && left.level === right.level
    && left.enhanceLevel === right.enhanceLevel
    && left.equipSlot === right.equipSlot
    && shallowEqualRecord(left.equipAttrs, right.equipAttrs)
    && shallowEqualRecord(left.equipStats, right.equipStats)
    && shallowEqualRecord(left.equipValueStats, right.equipValueStats)
    && shallowEqualArray(left.effects, right.effects)
    && left.healAmount === right.healAmount
    && left.healPercent === right.healPercent
    && left.qiPercent === right.qiPercent
    && shallowEqualArray(left.consumeBuffs, right.consumeBuffs)
    && shallowEqualArray(left.tags, right.tags)
    && left.mapUnlockId === right.mapUnlockId
    && shallowEqualArray(left.mapUnlockIds, right.mapUnlockIds)
    && left.respawnBindMapId === right.respawnBindMapId
    && left.tileAuraGainAmount === right.tileAuraGainAmount
    && shallowEqualTileResourceGainArray(left.tileResourceGains, right.tileResourceGains)
    && left.alchemySuccessRate === right.alchemySuccessRate
    && left.alchemySpeedRate === right.alchemySpeedRate
    && left.enhancementSuccessRate === right.enhancementSuccessRate
    && left.enhancementSpeedRate === right.enhancementSpeedRate
    && left.allowBatchUse === right.allowBatchUse;
}

function shallowEqualTileResourceGainArray(
  left: SyncedItemStack['tileResourceGains'],
  right: SyncedItemStack['tileResourceGains'],
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right || left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index]?.resourceKey !== right[index]?.resourceKey || left[index]?.amount !== right[index]?.amount) {
      return false;
    }
  }

  return true;
}

function shallowEqualArray(left: readonly unknown[] | null | undefined, right: readonly unknown[] | null | undefined): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right || left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (!isPlainEqual(left[index], right[index])) {
      return false;
    }
  }

  return true;
}

function shallowEqualRecord(left: object | null | undefined, right: object | null | undefined): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (const key of leftKeys) {
    if (!isPlainEqual(leftRecord[key], rightRecord[key])) {
      return false;
    }
  }

  return true;
}

function isPlainEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (typeof left !== typeof right) {
    return false;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return shallowEqualArray(left, right);
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    return shallowEqualRecord(left, right);
  }
  return false;
}

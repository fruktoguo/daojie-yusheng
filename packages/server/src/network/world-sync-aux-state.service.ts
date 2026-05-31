/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_AURA_LEVEL_BASE_VALUE,
  S2C,
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
import { projectHeavenGateState, projectRealmState } from '../runtime/player/player-realm-projection.helpers';
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
  buildMinimapLibraryManifest: WorldSyncMapSnapshotServiceInstance['buildMinimapLibraryManifest'];
  buildMinimapLibraryDelta: WorldSyncMapSnapshotServiceInstance['buildMinimapLibraryDelta'];
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
  realmSource: PlayerRealmState | null;
  time: TimeSyncState;
  threatArrows: ThreatArrow;
  lootWindow: LootWindowState;
  lootWindowSource: LootWindowState;
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
  unlockedMapIds?: string[];
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

interface EmitAuxDeltaSyncOptions {
  deferMapChanged?: boolean;
}

/** 辅助状态同步服务：编排 bootstrap 首包和 tick 增量中的地图静态、时间、境界、威胁和拾取窗口同步。 */
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

  /** 清除指定玩家的地图缓存和辅助状态缓存，用于断线或跨图。 */
  clearPlayerCache(playerId: string): void {
    this.worldSyncMapStaticAuxService.clearPlayerCache(playerId);
    this.protocolAuxStateByPlayerId.delete(playerId);
  }

  /** 首次进入或跨图后的全量辅助状态下发：bootstrap 包 + mapStatic + realm + loot + threat。 */
  emitAuxInitialSync(
    playerId: string,
    socket: SocketLike,
    view: PlayerView,
    player: RuntimePlayer,
  ): void {
    const template = this.templateRepository.getOrThrow(view.instance.templateId);
    const mapStaticState = this.worldSyncMapStaticAuxService.buildInitialMapStaticState(view, player, template);
    const visibleTiles = mapStaticState.visibleTiles;
    const minimapManifest = this.worldSyncMapSnapshotService.buildMinimapLibraryManifest(player);
    const unlockedMapIds = minimapManifest.map((entry) => entry.mapId);
    const mapUnlocked = Array.isArray(player.unlockedMapIds) && player.unlockedMapIds.includes(template.id);
    const timeState = this.worldSyncMapSnapshotService.buildGameTimeState(template, view, player);
    const timeSyncState = this.buildTimeSyncState(template.id, timeState);
    const realmState = cloneRealmState(player.realm);
    const threatArrows = this.worldSyncThreatService.buildThreatArrows(view);
    const bootstrapPayload = this.buildBootstrapSyncPayload(
      this.worldSyncPlayerStateService.buildPlayerSyncState(
        player,
        view,
        unlockedMapIds,
      ),
      timeState,
    );

    this.worldSyncProtocolService.sendBootstrap(socket, bootstrapPayload);
    this.worldSyncProtocolService.sendMapStatic(
      socket,
      this.buildMapStaticSyncPayload(template, {
        mapMeta: this.worldSyncMapSnapshotService.buildMapMetaSync(template),
        minimap: mapUnlocked ? this.worldSyncMinimapService.buildMinimapSnapshotSync(template) : undefined,
        tiles: visibleTiles.matrix,
        tilesOriginX: resolveVisibleTilesOriginX(view, player),
        tilesOriginY: resolveVisibleTilesOriginY(view, player),
        visibleMinimapMarkers: mapStaticState.visibleMinimapMarkers,
        unlockedMapIds: unlockedMapIds.length > 0 ? unlockedMapIds : undefined,
      }),
    );
    // 发送 minimapLibrary 版本清单，客户端收到后回报本地版本
    if (minimapManifest.length > 0) {
      socket.emit(S2C.MinimapLibraryManifest, { manifest: minimapManifest });
    }
    if (timeSyncState.tickIntervalMs !== 1000) {
      this.worldSyncProtocolService.sendWorldDelta(
        socket,
        this.buildWorldDeltaMapPatchPayload(view, {
          time: timeSyncState.time,
          tickIntervalMs: timeSyncState.tickIntervalMs,
        }),
      );
    }
    this.worldSyncProtocolService.sendRealm(socket, this.buildRealmSyncPayload(player, realmState));

    const lootWindow = this.worldSyncQuestLootService.buildLootWindowSyncState(playerId);
    this.worldSyncProtocolService.sendLootWindow(socket, { window: lootWindow });
    this.worldSyncThreatService.emitInitialThreatSync(socket, view, threatArrows);
    this.worldSyncMapStaticAuxService.commitPlayerCache(playerId, mapStaticState.cacheState);
    this.protocolAuxStateByPlayerId.set(playerId, {
      realm: realmState,
      realmSource: player.realm ?? null,
      time: timeSyncState,
      threatArrows: cloneThreatArrows(threatArrows),
      lootWindow: cloneLootWindow(lootWindow),
      lootWindowSource: lootWindow,
    });
  }

  /** 处理客户端上报的 minimapLibrary 本地版本，对比后下发变更条目。 */
  handleReportMinimapVersions(
    socket: SocketLike,
    player: RuntimePlayer,
    clientVersions: Record<string, number>,
  ): void {
    const delta = this.worldSyncMapSnapshotService.buildMinimapLibraryDelta(player, clientVersions);
    if (delta.length > 0) {
      socket.emit(S2C.MinimapLibraryDelta, { entries: delta });
    }
  }

  /** tick 增量辅助状态同步：对比前帧缓存，仅下发变化的 tile patch、时间、境界、威胁和拾取窗口。 */
  emitAuxDeltaSync(
    playerId: string,
    socket: SocketLike,
    view: PlayerView,
    player: RuntimePlayer,
    options: EmitAuxDeltaSyncOptions = {},
  ): boolean {
    const previous = this.protocolAuxStateByPlayerId.get(playerId) ?? null;
    if (!previous) {
      if (options.deferMapChanged === true) {
        return false;
      }
      this.emitAuxInitialSync(playerId, socket, view, player);
      return true;
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

    if (mapChanged && options.deferMapChanged === true) {
      return false;
    }

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
          time: shouldEmitTimeSync ? currentTimeSyncState.time : undefined,
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

    const currentRealm = player.realm ?? null;
    const realmChanged = !isCachedRealmCurrent(previous, currentRealm);
    const nextRealm = realmChanged ? cloneRealmState(currentRealm) : previous.realm;
    if (realmChanged) {
      this.worldSyncProtocolService.sendRealm(socket, this.buildRealmSyncPayload(player, nextRealm));
    }

    const lootWindow = this.worldSyncQuestLootService.buildLootWindowSyncState(playerId);
    const lootWindowChanged = !isCachedLootWindowCurrent(previous, lootWindow);
    if (lootWindowChanged) {
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
      realm: nextRealm,
      realmSource: currentRealm,
      time: shouldEmitTimeSync ? currentTimeSyncState : previous.time,
      threatArrows: cloneThreatArrows(currentThreatArrows),
      lootWindow: lootWindowChanged ? cloneLootWindow(lootWindow) : previous.lootWindow,
      lootWindowSource: lootWindow,
    });
    return true;
  }

  private buildTimeSyncState(mapId: string, time: GameTimeState): TimeSyncState {
    return {
      mapId,
      tickIntervalMs: this.worldSyncMapSnapshotService.buildMapTickIntervalMs(mapId),
      time,
    };
  }

  private buildBootstrapSyncPayload(
    self: PlayerSyncState,
    timeState: GameTimeState,
  ): BootstrapView {
    return {
      self,
      time: timeState,
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
      unlockedMapIds: options.unlockedMapIds,
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

function isCachedRealmCurrent(previous: ProtocolAuxState, currentRealm: PlayerRealmState | null): boolean {
  if (previous.realmSource === currentRealm) {
    return true;
  }
  return isSameRealmState(previous.realm, currentRealm);
}

function isCachedLootWindowCurrent(previous: ProtocolAuxState, currentLootWindow: LootWindowState): boolean {
  if (previous.lootWindowSource === currentLootWindow) {
    return true;
  }
  return isSameLootWindow(previous.lootWindow, currentLootWindow);
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
  return projectRealmState(source) as PlayerRealmState | null;
}

function isSameRealmState(left: PlayerRealmState | null, right: PlayerRealmState | null): boolean {
  if (!left || !right) {
    return left === right;
  }

  // 修为进度、进度上限与突破可用状态已经通过 PanelDelta.attr 增量同步。
  // Realm 只保留境界结构、文本、突破预览与天门状态，避免每次修炼进度变化都重发完整境界快照。
  return left.stage === right.stage
    && left.realmLv === right.realmLv
    && left.displayName === right.displayName
    && left.name === right.name
    && left.shortName === right.shortName
    && left.path === right.path
    && left.narrative === right.narrative
    && left.review === right.review
    && left.lifespanYears === right.lifespanYears
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
  return projectHeavenGateState(source) as HeavenGateState | null;
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
    && left.materialCategory === right.materialCategory
    && shallowEqualRecord(left.materialValues, right.materialValues)
    && left.enhanceLevel === right.enhanceLevel
    && left.equipSlot === right.equipSlot
    && shallowEqualRecord(left.equipAttrs, right.equipAttrs)
    && shallowEqualRecord(left.equipStats, right.equipStats)
    && shallowEqualRecord(left.equipValueStats, right.equipValueStats)
    && shallowEqualRecord(left.equipSpecialStats, right.equipSpecialStats)
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
    && left.spiritualRootSeedTier === right.spiritualRootSeedTier
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

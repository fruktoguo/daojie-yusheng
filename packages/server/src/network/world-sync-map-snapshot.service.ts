/**
 * 地图快照同步服务。
 * 负责构造玩家视野内的地块详情快照、可见 tile 集合和地图静态数据下发。
 */

import { Inject, Injectable, Optional, forwardRef } from '@nestjs/common';
import {
  DEFAULT_AURA_LEVEL_BASE_VALUE,
  TileType,
  getAuraLevel,
  getQiResourceDefaultLevel,
  getQiResourceDisplayLabel,
  getFirstGrapheme,
  composeTileTypeFromLayers,
  getTileTypeFromMapChar,
  isTileTypeWalkable,
  doesTileTypeBlockSight,
  resolveDefaultTileLayerFallback,
  resolveTileLayerSeedFromTemplateContext,
  resolveTileLayerSeedFromTileType,
  parseQiResourceKey,
  resolveGameTimeState,
} from '@mud/shared';

import { getTileIndex, MapTemplateRepository } from '../runtime/map/map-template.repository';
import { TileTemplateRegistry } from '../runtime/map/registries/tile-template.registry';
import { NativePlayerAuthStoreService } from '../http/native/native-player-auth-store.service';
import { RuntimeMapConfigService } from '../runtime/map/runtime-map-config.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';
import { WorldSyncMinimapService } from './world-sync-minimap.service';
import { projectVisiblePlayerBuffs } from '../runtime/player/player-buff-projection.helpers';
import { projectPlayerQiResourceValue, resolvePlayerQiResourceProjection } from '../runtime/world/world-runtime-qi-projection.helpers';

interface WorldRuntimePort {
  getInstanceTileState(instanceId: string, x: number, y: number): any;
  getInstanceRuntime?(instanceId: string): any;
  worldRuntimeLootContainerService?: {
    getHerbContainerWorldProjection?(instanceId: string, container: any, currentTick: number): any;
  };
}

interface PlayerRuntimePort {
  getPlayer(playerId: string): any;
}

interface NativePlayerAuthStorePort {
  getMemoryUserByPlayerId?(playerId: string): {
    pendingRoleName?: string | null;
    playerName?: string | null;
    displayName?: string | null;
  } | null;
}

interface TemplateRepositoryPort {
  has(mapId: string): boolean;
  getOrThrow(mapId: string): unknown;
  tileRegistry?: TileTemplateRegistry;
}

interface RuntimeMapConfigPort {
  getMapTimeConfig(mapId: string): unknown;
  getMapTickSpeed(mapId: string): number;
}

interface WorldSyncMinimapPort {
  buildMinimapSnapshotSync(template: unknown): any;
}

const visibleTilesSnapshotCacheByPlayer = new WeakMap<object, any>();
const npcRenderEntityCache = new WeakMap<object, any>();
const containerRenderEntityCache = new WeakMap<object, any>();
const formationRenderEntityCache = new WeakMap<object, any>();
const monsterBuffProjectionCache = new WeakMap<any[], any[]>();
const instanceStaticTileDiffPlanCache = new WeakMap<object, any>();

/** map/static snapshot 构造服务：承接 world-sync 的可见区域与静态展示构造。 */
@Injectable()
export class WorldSyncMapSnapshotService {
  private readonly worldRuntimeService: WorldRuntimePort;
  private readonly playerRuntimeService: PlayerRuntimePort;
  private readonly templateRepository: TemplateRepositoryPort;
  private readonly tileRegistry: TileTemplateRegistry;
  private readonly mapRuntimeConfigService: RuntimeMapConfigPort;
  private readonly worldSyncMinimapService: WorldSyncMinimapPort;
  private readonly playerAuthStore: NativePlayerAuthStorePort | null;

  constructor(
    @Inject(forwardRef(() => WorldRuntimeService))
    worldRuntimeService: unknown,
    @Inject(PlayerRuntimeService)
    playerRuntimeService: unknown,
    @Inject(MapTemplateRepository)
    templateRepository: unknown,
    @Inject(RuntimeMapConfigService)
    mapRuntimeConfigService: unknown,
    @Inject(WorldSyncMinimapService)
    worldSyncMinimapService: unknown,
    @Optional()
    @Inject(NativePlayerAuthStoreService)
    playerAuthStore: NativePlayerAuthStorePort | null = null,
  ) {
    this.worldRuntimeService = worldRuntimeService as WorldRuntimePort;
    this.playerRuntimeService = playerRuntimeService as PlayerRuntimePort;
    this.templateRepository = templateRepository as TemplateRepositoryPort;
    this.tileRegistry = this.templateRepository.tileRegistry ?? new TileTemplateRegistry();
    this.mapRuntimeConfigService = mapRuntimeConfigService as RuntimeMapConfigPort;
    this.worldSyncMinimapService = worldSyncMinimapService as WorldSyncMinimapPort;
    this.playerAuthStore = playerAuthStore;
  }

  /** 构造玩家视野范围内的 tile 快照矩阵和 byKey 索引。 */
  buildVisibleTilesSnapshot(view, player, template) {
    const radius = resolvePlayerEffectiveViewRange(player);
    const originX = view.self.x - radius;
    const originY = view.self.y - radius;
    const visibleTileIndices = new Set(Array.isArray(view.visibleTileIndices) ? view.visibleTileIndices : []);
    const visibleTileKeys = new Set(Array.isArray(view.visibleTileKeys) ? view.visibleTileKeys : []);
    const cacheOwner = resolveVisibleTilesSnapshotCacheOwner(player);
    const cached = cacheOwner ? visibleTilesSnapshotCacheByPlayer.get(cacheOwner) : null;
    if (canReuseVisibleTilesSnapshotCache(cached, view, template, radius, originX, originY)) {
      refreshVisibleTilesSnapshot(
        this,
        cached.snapshot,
        view,
        player,
        template,
        radius,
        originX,
        originY,
        visibleTileIndices,
        visibleTileKeys,
      );
      return cached.snapshot;
    }
    const snapshot = createVisibleTilesSnapshot(
      this,
      view,
      player,
      template,
      radius,
      originX,
      originY,
      visibleTileIndices,
      visibleTileKeys,
    );
    if (cacheOwner) {
      visibleTilesSnapshotCacheByPlayer.set(cacheOwner, {
        templateId: view.instance?.templateId ?? template.id,
        instanceId: view.instance?.instanceId ?? null,
        templateWidth: template.width,
        templateHeight: template.height,
        radius,
        originX,
        originY,
        snapshot,
      });
    }
    return snapshot;
  }

  buildVisibleTileKeySet(view, player, template) {
    const radius = resolvePlayerEffectiveViewRange(player);
    const originX = view.self.x - radius;
    const originY = view.self.y - radius;
    const visibleTileIndices = new Set(Array.isArray(view.visibleTileIndices) ? view.visibleTileIndices : []);
    const visibleTileKeys = new Set(Array.isArray(view.visibleTileKeys) ? view.visibleTileKeys : []);
    const keys = new Set();
    for (let row = 0; row < radius * 2 + 1; row += 1) {
      const y = originY + row;
      for (let column = 0; column < radius * 2 + 1; column += 1) {
        const x = originX + column;
        const coordKey = buildCoordKey(x, y);
        const tileIndex = x >= 0 && y >= 0 && x < template.width && y < template.height
          ? getTileIndex(x, y, template.width)
          : -1;
        const tileVisible = visibleTileKeys.size > 0
          ? visibleTileKeys.has(coordKey)
          : (visibleTileIndices.size > 0 ? visibleTileIndices.has(tileIndex) : true);
        if (!tileVisible) {
          continue;
        }
        const tileLookup = this.resolveCompositeTileLookup(view, template, x, y);
        if (!tileLookup) {
          continue;
        }
        if (!this.worldRuntimeService.getInstanceTileState(tileLookup.instanceId, tileLookup.x, tileLookup.y)
          && !isInTemplateBounds(tileLookup.template, tileLookup.x, tileLookup.y)) {
          continue;
        }
        keys.add(coordKey);
      }
    }
    return keys;
  }

  /** 构造视野内所有可渲染实体（玩家、怪物、NPC、传送门、容器、建筑、阵法）的快照。 */
  buildRenderEntitiesSnapshot(view, player) {
    const entities = new Map();
    entities.set(player.playerId, buildPlayerRenderEntity(player, '#ff0', this.resolveAccountIdentityProjection(player.playerId, player)));
    for (const visible of view.visiblePlayers) {
      const target = this.playerRuntimeService.getPlayer(visible.playerId);
      if (!target) {
        continue;
      }
      if (target.instanceId !== player.instanceId && visible.projectedFromParentMap !== true) {
        continue;
      }
      entities.set(
        target.playerId,
        buildPlayerRenderEntity(
          target,
          '#0f0',
          this.resolveAccountIdentityProjection(target.playerId, target),
          visible.projectedFromParentMap === true ? { x: visible.x, y: visible.y } : null,
        ),
      );
    }
    for (const npc of view.localNpcs) {
      entities.set(npc.npcId, projectNpcRenderEntity(npc));
    }
    for (const monster of view.localMonsters) {
      entities.set(monster.runtimeId, {
        id: monster.runtimeId,
        x: monster.x,
        y: monster.y,
        char: monster.char,
        color: monster.color,
        name: monster.name,
        kind: 'monster',
        monsterTier: monster.tier,
        monsterScale: getBuffPresentationScale(monster.buffs),
        hp: monster.hp,
        maxHp: monster.maxHp,
        qi: monster.qi,
        maxQi: monster.maxQi,
        buffs: projectMonsterBuffs(monster.buffs),
      });
    }
    for (const container of view.localContainers) {
      const containerInstanceId = container.instanceId ?? view.instance?.instanceId;
      const containerTemplateId = container.templateId ?? view.instance?.templateId;
      const runtimeInstance = this.worldRuntimeService.getInstanceRuntime?.(containerInstanceId) ?? null;
      const runtimeContainer = runtimeInstance?.getContainerById?.(container.id) ?? null;
      const projection = this.worldRuntimeService.worldRuntimeLootContainerService?.getHerbContainerWorldProjection?.(
        containerInstanceId,
        runtimeContainer,
        runtimeInstance?.tick ?? view.tick,
      ) ?? null;
      const respawnRemainingTicks = projection?.remainingCount === 0 && projection.respawnRemainingTicks !== undefined
        ? Math.max(0, Math.trunc(Number(projection.respawnRemainingTicks) || 0))
        : undefined;
      const entityId = `container:${containerTemplateId}:${container.id}`;
      entities.set(entityId, projectContainerRenderEntity(container, entityId, respawnRemainingTicks));
    }
    for (const formation of view.localFormations ?? []) {
      entities.set(formation.id, projectFormationRenderEntity(formation));
    }
    return entities;
  }

  private resolveAccountIdentityProjection(playerId: unknown, fallback: any): { name?: string; displayName?: string } | null {
    const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
    if (!normalizedPlayerId || typeof this.playerAuthStore?.getMemoryUserByPlayerId !== 'function') {
      return null;
    }
    const account = this.playerAuthStore.getMemoryUserByPlayerId(normalizedPlayerId);
    if (!account) {
      return null;
    }
    const name = normalizePlayerIdentityText(account.pendingRoleName) || normalizePlayerIdentityText(account.playerName);
    const displayName = normalizePlayerIdentityText(account.displayName);
    if (!name && !displayName) {
      return null;
    }
    return {
      name: name || normalizePlayerIdentityText(fallback?.name),
      displayName: displayName || normalizePlayerIdentityText(fallback?.displayName),
    };
  }

  /** 地图快照版本缓存：mapId → version number（启动期计算，运行时不变）。 */
  private readonly minimapVersionCache = new Map<string, number>();

  /** 获取指定地图的快照版本号（启动期计算后缓存）。 */
  getMinimapSnapshotVersion(mapId: string): number {
    const cached = this.minimapVersionCache.get(mapId);
    if (cached !== undefined) return cached;
    if (!this.templateRepository.has(mapId)) return 0;
    const template = this.templateRepository.getOrThrow(mapId);
    const snapshot = this.worldSyncMinimapService.buildMinimapSnapshotSync(template);
    const version = computeMinimapSnapshotHash(snapshot);
    this.minimapVersionCache.set(mapId, version);
    return version;
  }

  /** 构建 minimapLibrary 版本清单（只含 mapId + version）。 */
  buildMinimapLibraryManifest(player): Array<{ mapId: string; version: number }> {
    const mapIds = this.resolveUnlockedMapIds(player);
    return mapIds.map((mapId) => ({ mapId, version: this.getMinimapSnapshotVersion(mapId) }));
  }

  /** 根据客户端上报的版本对比，返回需要下发的完整条目。 */
  buildMinimapLibraryDelta(
    player: { unlockedMapIds?: string[] },
    clientVersions: Record<string, number>,
  ): any[] {
    const mapIds = this.resolveUnlockedMapIds(player);
    const result: any[] = [];
    for (const mapId of mapIds) {
      const serverVersion = this.getMinimapSnapshotVersion(mapId);
      if ((clientVersions[mapId] ?? 0) !== serverVersion) {
        const template = this.templateRepository.getOrThrow(mapId);
        result.push({
          mapId,
          version: serverVersion,
          mapMeta: this.buildMapMetaSync(template),
          snapshot: this.worldSyncMinimapService.buildMinimapSnapshotSync(template),
        });
      }
    }
    return result;
  }

  /** @deprecated 旧全量构建，保留供 smoke 测试兼容。 */
  buildMinimapLibrarySync(player): any[] {
    const mapIds = this.resolveUnlockedMapIds(player);
    return mapIds.map((mapId) => {
      const template = this.templateRepository.getOrThrow(mapId);
      return {
        mapId,
        version: this.getMinimapSnapshotVersion(mapId),
        mapMeta: this.buildMapMetaSync(template),
        snapshot: this.worldSyncMinimapService.buildMinimapSnapshotSync(template),
      };
    });
  }

  /** 解析玩家已解锁且模板存在的 mapId 列表。 */
  private resolveUnlockedMapIds(player: { unlockedMapIds?: string[] }): string[] {
    const unlockedMapIds: string[] = Array.isArray(player.unlockedMapIds)
      ? player.unlockedMapIds.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
      : [];
    return Array.from(new Set<string>(unlockedMapIds))
      .filter((entry) => this.templateRepository.has(entry))
      .sort(compareStableStrings);
  }

  buildMapMetaSync(template) {
    return buildMapMetaSync(template);
  }

  buildGameTimeState(template, view, player) {
    const timeState = buildGameTimeState(
      template,
      view.tick,
      resolvePlayerBaseViewRange(player),
      this.mapRuntimeConfigService.getMapTimeConfig(view.instance.templateId),
      this.mapRuntimeConfigService.getMapTickSpeed(view.instance.templateId),
    );
    return {
      ...timeState,
      effectiveViewRange: resolvePlayerEffectiveViewRange(player),
    };
  }

  buildMapTickIntervalMs(mapId: string): number {
    return resolveMapTickIntervalMs(this.mapRuntimeConfigService.getMapTickSpeed(mapId));
  }

  getInstanceStaticTileSyncRevision(view) {
    const instanceId = typeof view?.instance?.instanceId === 'string' ? view.instance.instanceId : '';
    const instance: any = instanceId && typeof this.worldRuntimeService.getInstanceRuntime === 'function'
      ? this.worldRuntimeService.getInstanceRuntime(instanceId)
      : null;
    return instance && typeof instance.getStaticTileSyncRevision === 'function'
      ? normalizeStaticTileSyncRevision(instance.getStaticTileSyncRevision())
      : normalizeStaticTileSyncRevision(view?.worldRevision);
  }

  /** 读取并缓存单个实例本轮地块静态 dirty 坐标；玩家侧再按视野过滤和投影。 */
  buildInstanceStaticTileDiffPlan(view, template) {
    if (template?.source?.spaceVisionMode === 'parent_overlay') {
      return null;
    }
    const instanceId = typeof view?.instance?.instanceId === 'string' ? view.instance.instanceId : '';
    const instance: any = instanceId && typeof this.worldRuntimeService.getInstanceRuntime === 'function'
      ? this.worldRuntimeService.getInstanceRuntime(instanceId)
      : null;
    if (!instance || typeof instance.getStaticTileSyncRevision !== 'function' || typeof instance.consumeStaticTileSyncDirtyTiles !== 'function') {
      return null;
    }
    const toRevision = normalizeStaticTileSyncRevision(instance.getStaticTileSyncRevision());
    const cached = instanceStaticTileDiffPlanCache.get(instance);
    if (cached && cached.toRevision === toRevision) {
      return cached;
    }
    const consumed = instance.consumeStaticTileSyncDirtyTiles();
    const plan = {
      fromRevision: normalizeStaticTileSyncRevision(consumed?.fromRevision ?? toRevision),
      toRevision: normalizeStaticTileSyncRevision(consumed?.toRevision ?? toRevision),
      dirtyTileKeys: Array.isArray(consumed?.tileKeys)
        ? consumed.tileKeys.filter((entry) => typeof entry === 'string' && entry.length > 0)
        : [],
    };
    instanceStaticTileDiffPlanCache.set(instance, plan);
    return plan;
  }

  /** 构造单个 tile 的同步状态：合并模板、实例覆盖和运行时动态数据。 */
  buildTileSyncState(template, instanceId, x, y, player = null) {
    const state = this.worldRuntimeService.getInstanceTileState(instanceId, x, y);
    if (!state) {
      return null;
    }

    const destroyed = state.combat?.destroyed === true;
    const defaultLayerFallback = resolveDefaultTileLayerFallback({ templateId: template?.id ?? null, instanceId, x, y });
    const tileType = state.tileType ?? (isInTemplateBounds(template, x, y) ? resolveTemplateLayerSeed(template, x, y).legacyTileType : defaultLayerFallback.legacyTileType);
    const resources = Array.isArray(state.resources)
      ? state.resources
        .filter((entry) => entry && typeof entry.resourceKey === 'string' && Number.isFinite(entry.value) && entry.value > 0)
        .map((entry) => buildProjectedTileResource(entry, player))
        .filter((entry) => entry !== null)
      : undefined;
    const aura = buildProjectedTileAura(state.aura, resources, player);
    const tile: any = {
      type: tileType,
    };
    applyTileEffectProjection(tile, template, x, y, tileType);
    tile.walkable = destroyed
      ? true
      : (typeof state.walkable === 'boolean' ? state.walkable : isTileTypeWalkable(tileType));
    tile.blocksSight = destroyed
      ? false
      : (typeof state.blocksSight === 'boolean' ? state.blocksSight : doesTileTypeBlockSight(tileType));
    const layerState = state.layers ?? null;
    const fallbackLayerSeed = destroyed === true
      ? defaultLayerFallback
      : resolveTileLayerSeedFromTileType(tileType);
    const terrainType = typeof layerState?.terrain === 'string' && destroyed !== true ? layerState.terrain : fallbackLayerSeed.terrain;
    const surfaceType = layerState && destroyed !== true ? layerState.surface ?? null : fallbackLayerSeed.surface;
    const structureType = destroyed === true ? null : (layerState ? layerState.structure ?? null : fallbackLayerSeed.structure);
    const interactableKinds = destroyed === true
      ? [...fallbackLayerSeed.interactables]
      : Array.isArray(layerState?.interactableKinds)
      ? layerState.interactableKinds.filter((kind) => typeof kind === 'string' && kind.length > 0)
      : undefined;
    if (terrainType) {
      tile.terrainType = terrainType;
    }
    if (surfaceType !== undefined) {
      tile.surfaceType = surfaceType;
    }
    if (structureType !== undefined || destroyed === true) {
      tile.structureType = structureType;
    }
    if (interactableKinds && interactableKinds.length > 0) {
      tile.interactableKinds = interactableKinds;
    }
    if (aura > 0) {
      tile.aura = aura;
    }
    if (resources && resources.length > 0) {
      tile.resources = resources;
    }
    const modifiedAt = state.combat?.modifiedAt ?? null;
    if (modifiedAt !== null && modifiedAt !== undefined) {
      tile.modifiedAt = modifiedAt;
    }
    const isTemporaryTile = state.combat?.temporary === true;
    const hpVisible = !destroyed
      && state.combat?.maxHp > 0
      && typeof state.combat?.hp === 'number'
      && state.combat.hp > 0
      && (isTemporaryTile || state.combat.hp < state.combat.maxHp);
    if (hpVisible) {
      tile.hp = state.combat.hp;
      tile.maxHp = state.combat.maxHp;
      tile.hpVisible = true;
    }
    return tile;
  }

  buildCompositeTileSyncState(view, template, x, y, player = null) {
    const lookup = this.resolveCompositeTileLookup(view, template, x, y);
    if (!lookup) {
      return null;
    }
    const tile = this.buildTileSyncState(lookup.template, lookup.instanceId, lookup.x, lookup.y, player)
      ?? buildStaticTileSyncState(lookup.template, lookup.x, lookup.y);
    if (!tile) {
      return null;
    }
    // TileTemplateRegistry 负责模板投影共享；cache 仍挂实例对象，实例销毁时跟着 GC。
    const instance: any = typeof this.worldRuntimeService.getInstanceRuntime === 'function'
      ? this.worldRuntimeService.getInstanceRuntime(lookup.instanceId)
      : null;
    return this.tileRegistry.shareProjection(instance, lookup.x, lookup.y, tile);
  }

  resolveCompositeTileLookup(view, template, x, y) {
    if (this.worldRuntimeService.getInstanceTileState(view.instance.instanceId, x, y)) {
      return {
        template,
        instanceId: view.instance.instanceId,
        x,
        y,
      };
    }
    if (isInTemplateBounds(template, x, y)) {
      return {
        template,
        instanceId: view.instance.instanceId,
        x,
        y,
      };
    }
    const source = template.source ?? {};
    if (source.spaceVisionMode !== 'parent_overlay') {
      return null;
    }
    const parentMapId = typeof source.parentMapId === 'string' ? source.parentMapId.trim() : '';
    if (!parentMapId || !Number.isInteger(source.parentOriginX) || !Number.isInteger(source.parentOriginY)) {
      return null;
    }
    if (!this.templateRepository.has(parentMapId)) {
      return null;
    }
    const parentTemplate = this.templateRepository.getOrThrow(parentMapId);
    const parentX = Math.trunc(x) + Number(source.parentOriginX);
    const parentY = Math.trunc(y) + Number(source.parentOriginY);
    if (!isInTemplateBounds(parentTemplate, parentX, parentY)) {
      return null;
    }
    return {
      template: parentTemplate,
      instanceId: buildOverlayParentInstanceId(view.instance, parentMapId),
      x: parentX,
      y: parentY,
    };
  }
}

function buildStaticTileSyncState(template, x, y) {
  if (!isInTemplateBounds(template, x, y)) {
    return null;
  }
  const layerSeed = resolveTemplateLayerSeed(template, x, y);
  const type = layerSeed.legacyTileType;
  const tile = {
    type,
    terrainType: layerSeed.terrain,
    surfaceType: layerSeed.surface,
    structureType: layerSeed.structure,
    interactableKinds: [...layerSeed.interactables],
  };
  applyTileEffectProjection(tile, template, x, y, type);
  return tile;
}

function resolveTemplateLayerSeed(template, x, y) {
  if (template?.tileRegistry instanceof TileTemplateRegistry) {
    return template.tileRegistry.resolveLayerSeed(template, x, y);
  }
  if (hasTemplateLayerRows(template)
    || Array.isArray(template?.surfaceRows)
    || Array.isArray(template?.structureRows)
    || Array.isArray(template?.interactableRows)) {
    const legacyTileType = composeTileTypeFromLayers(
      template.terrainRows?.[y]?.[x],
      template.surfaceRows?.[y]?.[x] ?? null,
      template.structureRows?.[y]?.[x] ?? null,
      template.interactableRows?.[y]?.[x] ?? [],
    );
    return {
      terrain: template.terrainRows?.[y]?.[x],
      surface: template.surfaceRows?.[y]?.[x] ?? null,
      structure: template.structureRows?.[y]?.[x] ?? null,
      interactables: Array.isArray(template.interactableRows?.[y]?.[x]) ? template.interactableRows[y][x] : [],
      legacyTileType,
    };
  }
  const type = getTileTypeFromMapChar(template.legacyTileRows?.[y]?.[x] ?? template.terrainRows?.[y]?.[x] ?? template.source?.tiles?.[y]?.[x] ?? '#');
  return resolveTileLayerSeedFromTemplateContext(type, x, y, (lookupX, lookupY) => (
    isInTemplateBounds(template, lookupX, lookupY)
      ? getTileTypeFromMapChar(template.legacyTileRows?.[lookupY]?.[lookupX] ?? template.terrainRows?.[lookupY]?.[lookupX] ?? template.source?.tiles?.[lookupY]?.[lookupX] ?? '#')
      : null
  ));
}

function hasTemplateLayerRows(template) {
  return Array.isArray(template?.terrainRows?.[0]);
}

function applyTileEffectProjection(tile, template, x, y, tileType) {
  if (!isInTemplateBounds(template, x, y)) {
    return;
  }
  const tileIndex = getTileIndex(x, y, template.width);
  const movementCost = template.movementCostOverrideByTile?.[tileIndex] ?? 0;
  if (Number.isFinite(movementCost) && movementCost > 0) {
    tile.movementCost = Math.max(1, Math.trunc(movementCost));
  }
  const qiDrainPerTick = template.qiDrainByTile?.[tileIndex] ?? 0;
  if (Number.isFinite(qiDrainPerTick) && qiDrainPerTick > 0) {
    tile.qiDrainPerTick = Math.max(0, Math.trunc(qiDrainPerTick));
  }
}

function freezeTileProjection(tile) {
  if (tile && process.env.NODE_ENV !== 'production') {
    if (Array.isArray(tile.resources)) {
      for (const entry of tile.resources) {
        if (entry && typeof entry === 'object') {
          Object.freeze(entry);
        }
      }
      Object.freeze(tile.resources);
    }
    if (Array.isArray(tile.interactableKinds)) {
      Object.freeze(tile.interactableKinds);
    }
    if (tile.hiddenEntrance && typeof tile.hiddenEntrance === 'object') {
      Object.freeze(tile.hiddenEntrance);
    }
    Object.freeze(tile);
  }
  return tile;
}

function isSameTileProjection(left, right) {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left.type === right.type
    && left.walkable === right.walkable
    && left.blocksSight === right.blocksSight
    && left.aura === right.aura
    && left.movementCost === right.movementCost
    && left.qiDrainPerTick === right.qiDrainPerTick
    && left.occupiedBy === right.occupiedBy
    && left.modifiedAt === right.modifiedAt
    && left.hp === right.hp
    && left.maxHp === right.maxHp
    && left.hpVisible === right.hpVisible
    && left.terrainType === right.terrainType
    && left.surfaceType === right.surfaceType
    && left.structureType === right.structureType
    && isSameTileResourceProjectionList(left.resources, right.resources)
    && isSameStringList(left.interactableKinds, right.interactableKinds)
    && left.hiddenEntrance?.portalId === right.hiddenEntrance?.portalId
    && left.hiddenEntrance?.portalKind === right.hiddenEntrance?.portalKind
    && left.hiddenEntrance?.portalTargetMapId === right.hiddenEntrance?.portalTargetMapId;
}

function isSameTileResourceProjectionList(left, right) {
  if (left === right) {
    return true;
  }
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftEntry = left[index];
    const rightEntry = right[index];
    if (leftEntry?.key !== rightEntry?.key
      || leftEntry?.label !== rightEntry?.label
      || leftEntry?.value !== rightEntry?.value
      || leftEntry?.effectiveValue !== rightEntry?.effectiveValue
      || leftEntry?.level !== rightEntry?.level
      || leftEntry?.sourceValue !== rightEntry?.sourceValue) {
      return false;
    }
  }
  return true;
}

function isSameStringList(left, right) {
  if (left === right) {
    return true;
  }
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function isInTemplateBounds(template, x, y) {
  return x >= 0 && y >= 0 && x < template.width && y < template.height;
}

function buildProjectedTileResource(entry, player) {
  const value = Math.max(0, Math.trunc(entry.value));
  const projection = player ? resolvePlayerQiResourceProjection(player, entry.resourceKey) : null;
  if (projection?.visibility === 'hidden') {
    return null;
  }
  const effectiveValue = projection
    ? (projection.visibility === 'absorbable'
      ? projectPlayerQiResourceValue(player, entry.resourceKey, value)
      : 0)
    : value;
  return {
    key: entry.resourceKey,
    label: getQiResourceDisplayLabel(entry.resourceKey),
    value,
    effectiveValue,
    level: projection?.visibility === 'absorbable'
      ? getAuraLevel(effectiveValue, DEFAULT_AURA_LEVEL_BASE_VALUE)
      : !projection && parseQiResourceKey(entry.resourceKey)
        ? getAuraLevel(value, DEFAULT_AURA_LEVEL_BASE_VALUE)
        : getQiResourceDefaultLevel(entry.resourceKey, value, DEFAULT_AURA_LEVEL_BASE_VALUE),
    sourceValue: Number.isFinite(entry.sourceValue) ? Math.max(0, Math.trunc(entry.sourceValue)) : undefined,
  };
}

function buildProjectedTileAura(rawAura, resources, player) {
  const value = Math.max(0, Math.trunc(Number.isFinite(rawAura) ? rawAura : 0));
  if (Array.isArray(resources) && resources.length > 0) {
    let projectedQiValue = 0;
    let hasProjectableQiResource = false;
    for (const resource of resources) {
      const parsed = parseQiResourceKey(resource.key);
      const effectiveValue = Math.max(0, Math.trunc(resource.effectiveValue ?? 0));
      if (!parsed || effectiveValue <= 0) {
        continue;
      }
      hasProjectableQiResource = true;
      projectedQiValue += effectiveValue;
    }
    if (hasProjectableQiResource) {
      return getAuraLevel(projectedQiValue, DEFAULT_AURA_LEVEL_BASE_VALUE);
    }
  }
  if (!player) {
    return value;
  }
  const effectiveValue = projectPlayerQiResourceValue(player, 'aura.refined.neutral', value);
  return getQiResourceDefaultLevel('aura.refined.neutral', effectiveValue, DEFAULT_AURA_LEVEL_BASE_VALUE) ?? 0;
}

function resolveVisibleTilesSnapshotCacheOwner(player) {
  return player && typeof player === 'object' ? player : null;
}

function canReuseVisibleTilesSnapshotCache(cached, view, template, radius, originX, originY) {
  return Boolean(cached)
    && cached.templateId === (view.instance?.templateId ?? template.id)
    && cached.instanceId === (view.instance?.instanceId ?? null)
    && cached.templateWidth === template.width
    && cached.templateHeight === template.height
    && cached.radius === radius
    && cached.originX === originX
    && cached.originY === originY
    && cached.snapshot?.matrix?.length === radius * 2 + 1
    && cached.snapshot?.byKey instanceof Map;
}

function createVisibleTilesSnapshot(service, view, player, template, radius, originX, originY, visibleTileIndices, visibleTileKeys) {
  const matrix = [];
  const byKey = new Map();
  const snapshot = { matrix, byKey };
  for (let row = 0; row < radius * 2 + 1; row += 1) {
    matrix.push(new Array(radius * 2 + 1).fill(null));
  }
  refreshVisibleTilesSnapshot(service, snapshot, view, player, template, radius, originX, originY, visibleTileIndices, visibleTileKeys);
  return snapshot;
}

function refreshVisibleTilesSnapshot(service, snapshot, view, player, template, radius, originX, originY, visibleTileIndices, visibleTileKeys) {
  const size = radius * 2 + 1;
  const { matrix, byKey } = snapshot;
  byKey.clear();
  for (let row = 0; row < size; row += 1) {
    const y = originY + row;
    const line = matrix[row];
    for (let column = 0; column < size; column += 1) {
      const x = originX + column;
      const tileIndex = x >= 0 && y >= 0 && x < template.width && y < template.height
        ? getTileIndex(x, y, template.width)
        : -1;
      const coordKey = buildCoordKey(x, y);
      const tileVisible = visibleTileKeys.size > 0
        ? visibleTileKeys.has(coordKey)
        : (visibleTileIndices.size > 0 ? visibleTileIndices.has(tileIndex) : true);
      const tile = !tileVisible
        ? null
        : service.buildCompositeTileSyncState(view, template, x, y, player);
      line[column] = tile;
      if (tile) {
        byKey.set(coordKey, tile);
      }
    }
  }
}

function buildCoordKey(x, y) {
    return `${x},${y}`;
}

function normalizeStaticTileSyncRevision(value) {
  const revision = Number(value);
  return Number.isFinite(revision) ? Math.max(0, Math.trunc(revision)) : 0;
}

function buildOverlayParentInstanceId(instance, parentTemplateId) {
  const linePreset = instance?.linePreset === 'real' ? 'real' : 'peaceful';
  const lineIndex = Number.isFinite(Number(instance?.lineIndex))
    ? Math.max(1, Math.trunc(Number(instance.lineIndex)))
    : 1;
  if (lineIndex > 1) {
    return `line:${parentTemplateId}:${linePreset}:${lineIndex}`;
  }
  return linePreset === 'real' ? `real:${parentTemplateId}` : `public:${parentTemplateId}`;
}

function resolveMapTickIntervalMs(tickSpeed) {
  const speed = typeof tickSpeed === 'number' && Number.isFinite(tickSpeed)
    ? Math.max(0, tickSpeed)
    : 1;
  return speed > 0 ? 1000 / speed : 0;
}

function buildGameTimeState(template, totalTicks, baseViewRange, overrideConfig, tickSpeed = 1) {
  return resolveGameTimeState(totalTicks, baseViewRange, overrideConfig ?? template.source.time, tickSpeed);
}

function resolvePlayerEffectiveViewRange(player) {
  return Math.max(1, Math.round(Number(player?.attrs?.numericStats?.viewRange) || 1));
}

function resolvePlayerBaseViewRange(player) {
  const base = Number(player?.worldTimeBaseViewRange);
  if (Number.isFinite(base) && base > 0) {
    return Math.max(1, Math.round(base));
  }
  return resolvePlayerEffectiveViewRange(player);
}

function getBuffPresentationScale(buffs) {
  let scale = 1;
  for (const buff of buffs ?? []) {
    if ((buff?.remainingTicks ?? 0) <= 0 || (buff?.stacks ?? 0) <= 0) {
      continue;
    }
    if (Number.isFinite(buff.presentationScale) && Number(buff.presentationScale) > scale) {
      scale = Number(buff.presentationScale);
    }
  }
  return scale;
}

function buildPlayerRenderEntity(player, color, identity = null, projectedPosition = null) {
  const playerId = normalizePlayerIdentityText(player.playerId);
  const displayName = normalizePlayerDisplayText(identity?.displayName ?? player.displayName, playerId);
  const name = normalizePlayerDisplayText(identity?.name ?? player.name, playerId);
  const charSource = displayName && (displayName !== '@' || !name) ? displayName : name;
  return {
    id: player.playerId,
    x: projectedPosition?.x ?? player.x,
    y: projectedPosition?.y ?? player.y,
    char: getFirstGrapheme(charSource) || '人',
    color,
    name: name || displayName || '修士',
    kind: 'player',
    monsterScale: getBuffPresentationScale(player.buffs?.buffs),
    hp: player.hp,
    maxHp: player.maxHp,
    buffs: projectVisiblePlayerBuffs(player),
  };
}

function projectNpcRenderEntity(npc) {
  const cached = npc && typeof npc === 'object' ? npcRenderEntityCache.get(npc) : null;
  if (cached && isSameNpcRenderEntity(cached, npc)) {
    return cached;
  }
  const projected = {
    id: npc.npcId,
    x: npc.x,
    y: npc.y,
    char: npc.char,
    color: npc.color,
    name: npc.name,
    kind: 'npc',
    npcQuestMarker: npc.questMarker ?? undefined,
  };
  if (npc && typeof npc === 'object') {
    npcRenderEntityCache.set(npc, projected);
  }
  return projected;
}

function projectMonsterBuffs(buffs) {
  if (!Array.isArray(buffs)) {
    return undefined;
  }
  if (buffs.length === 0) {
    return [];
  }
  const cached = monsterBuffProjectionCache.get(buffs);
  if (cached && isSameShallowRecordList(cached, buffs)) {
    return cached;
  }
  const projected = buffs.map((buff) => ({ ...buff }));
  monsterBuffProjectionCache.set(buffs, projected);
  return projected;
}

function projectContainerRenderEntity(container, entityId, respawnRemainingTicks) {
  const cached = container && typeof container === 'object' ? containerRenderEntityCache.get(container) : null;
  if (cached && isSameContainerRenderEntity(cached, container, entityId, respawnRemainingTicks)) {
    return cached;
  }
  const projected = {
    id: entityId,
    x: container.x,
    y: container.y,
    char: container.char,
    color: container.color,
    name: container.name,
    kind: 'container',
    respawnRemainingTicks,
  };
  if (container && typeof container === 'object') {
    containerRenderEntityCache.set(container, projected);
  }
  return projected;
}

function projectFormationRenderEntity(formation) {
  const cached = formation && typeof formation === 'object' ? formationRenderEntityCache.get(formation) : null;
  if (cached && isSameFormationRenderEntity(cached, formation)) {
    return cached;
  }
  const projected = {
    id: formation.id,
    x: formation.x,
    y: formation.y,
    char: formation.char ?? '◎',
    color: formation.active === false ? '#9aa0a6' : formation.color ?? '#4da3ff',
    name: formation.name,
    kind: 'formation',
    formationRadius: formation.radius,
    formationRangeShape: formation.rangeShape,
    formationRangeHighlightColor: formation.rangeHighlightColor,
    formationBoundaryChar: formation.boundaryChar,
    formationBoundaryColor: formation.boundaryColor,
    formationBoundaryRangeHighlightColor: formation.boundaryRangeHighlightColor,
    formationEyeVisibleWithoutSenseQi: formation.eyeVisibleWithoutSenseQi === true,
    formationRangeVisibleWithoutSenseQi: formation.rangeVisibleWithoutSenseQi === true,
    formationBoundaryVisibleWithoutSenseQi: formation.boundaryVisibleWithoutSenseQi === true,
    formationShowText: formation.showText !== false,
    formationBlocksBoundary: formation.blocksBoundary === true,
    formationOwnerSectId: formation.ownerSectId ?? null,
    formationOwnerPlayerId: formation.ownerPlayerId ?? null,
    formationActive: formation.active !== false,
    formationLifecycle: formation.lifecycle === 'persistent' ? 'persistent' : 'deployed',
  };
  if (formation && typeof formation === 'object') {
    formationRenderEntityCache.set(formation, projected);
  }
  return projected;
}

function isSameNpcRenderEntity(projected, npc) {
  return projected.id === npc.npcId
    && projected.x === npc.x
    && projected.y === npc.y
    && projected.char === npc.char
    && projected.color === npc.color
    && projected.name === npc.name
    && projected.npcQuestMarker === (npc.questMarker ?? undefined);
}

function isSameContainerRenderEntity(projected, container, entityId, respawnRemainingTicks) {
  return projected.id === entityId
    && projected.x === container.x
    && projected.y === container.y
    && projected.char === container.char
    && projected.color === container.color
    && projected.name === container.name
    && projected.respawnRemainingTicks === respawnRemainingTicks;
}

function isSameFormationRenderEntity(projected, formation) {
  return projected.id === formation.id
    && projected.x === formation.x
    && projected.y === formation.y
    && projected.char === (formation.char ?? '◎')
    && projected.color === (formation.active === false ? '#9aa0a6' : formation.color ?? '#4da3ff')
    && projected.name === formation.name
    && projected.formationRadius === formation.radius
    && projected.formationRangeShape === formation.rangeShape
    && projected.formationRangeHighlightColor === formation.rangeHighlightColor
    && projected.formationBoundaryChar === formation.boundaryChar
    && projected.formationBoundaryColor === formation.boundaryColor
    && projected.formationBoundaryRangeHighlightColor === formation.boundaryRangeHighlightColor
    && projected.formationEyeVisibleWithoutSenseQi === (formation.eyeVisibleWithoutSenseQi === true)
    && projected.formationRangeVisibleWithoutSenseQi === (formation.rangeVisibleWithoutSenseQi === true)
    && projected.formationBoundaryVisibleWithoutSenseQi === (formation.boundaryVisibleWithoutSenseQi === true)
    && projected.formationShowText === (formation.showText !== false)
    && projected.formationBlocksBoundary === (formation.blocksBoundary === true)
    && projected.formationOwnerSectId === (formation.ownerSectId ?? null)
    && projected.formationOwnerPlayerId === (formation.ownerPlayerId ?? null)
    && projected.formationActive === (formation.active !== false)
    && projected.formationLifecycle === (formation.lifecycle === 'persistent' ? 'persistent' : 'deployed');
}

function isSameShallowRecordList(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (!isSameShallowRecord(left[index], right[index])) {
      return false;
    }
  }
  return true;
}

function isSameShallowRecord(left, right) {
  if (left === right) {
    return true;
  }
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }
  return true;
}

function normalizePlayerIdentityText(value) {
  return typeof value === 'string' ? value.trim().normalize('NFC') : '';
}

function normalizePlayerDisplayText(value, playerId = undefined) {
  const normalized = normalizePlayerIdentityText(value);
  if (!normalized || normalized === normalizePlayerIdentityText(playerId) || isRuntimePlayerIdLike(normalized)) {
    return '';
  }
  return normalized;
}

function isRuntimePlayerIdLike(value) {
  return /^p_[0-9a-f-]+(?:_\d+)?$/i.test(value) || /^player[:_-]/i.test(value);
}

function buildMapMetaSync(template) {
  return {
    id: template.id,
    name: template.name,
    mapGroupId: template.mapGroupId,
    mapGroupName: template.mapGroupName,
    mapGroupOrder: template.mapGroupOrder,
    mapGroupMemberOrder: template.mapGroupMemberOrder,
    width: template.width,
    height: template.height,
    routeDomain: template.routeDomain,
    parentMapId: template.source.parentMapId,
    parentOriginX: template.source.parentOriginX,
    parentOriginY: template.source.parentOriginY,
    floorLevel: template.source.floorLevel,
    floorName: template.source.floorName,
    spaceVisionMode: template.source.spaceVisionMode,
    mapLv: template.source.mapLv,
    description: template.source.description,
    hideMinimap: template.source.hideMinimap || undefined,
    playerOverlapPoints: buildPlayerOverlapPoints(template),
  };
}

function buildPlayerOverlapPoints(template) {
  const mask = template.playerOverlapMask;
  if (!mask) {
    return undefined;
  }
  const points = [];
  const width = template.width;
  const height = template.height;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x] === 1) {
        points.push({ x, y });
      }
    }
  }
  return points.length > 0 ? points : undefined;
}

function compareStableStrings(left, right) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

/** 简单 FNV-1a 32 位哈希，用于 minimap 快照版本号。 */
function computeMinimapSnapshotHash(snapshot: { width: number; height: number; terrainRows: string[]; markers: any[] }): number {
  let hash = 2166136261;
  const str = `${snapshot.width}:${snapshot.height}:${snapshot.terrainRows.join('')}:${snapshot.markers.length}`;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

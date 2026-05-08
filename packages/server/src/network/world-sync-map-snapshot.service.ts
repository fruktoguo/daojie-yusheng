import { Inject, Injectable, Optional, forwardRef } from '@nestjs/common';
import {
  DEFAULT_AURA_LEVEL_BASE_VALUE,
  TileType,
  getAuraLevel,
  getQiResourceDefaultLevel,
  getQiResourceDisplayLabel,
  getFirstGrapheme,
  getTileTypeFromMapChar,
  resolveTileLayerSeedFromTemplateContext,
  parseQiResourceKey,
  resolveGameTimeState,
} from '@mud/shared';

import { getTileIndex, MapTemplateRepository } from '../runtime/map/map-template.repository';
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
}

interface RuntimeMapConfigPort {
  getMapTimeConfig(mapId: string): unknown;
  getMapTickSpeed(mapId: string): number;
}

interface WorldSyncMinimapPort {
  buildMinimapSnapshotSync(template: unknown): any;
}

/** map/static snapshot 构造服务：承接 world-sync 的可见区域与静态展示构造。 */
@Injectable()
export class WorldSyncMapSnapshotService {
  private readonly worldRuntimeService: WorldRuntimePort;
  private readonly playerRuntimeService: PlayerRuntimePort;
  private readonly templateRepository: TemplateRepositoryPort;
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
    this.mapRuntimeConfigService = mapRuntimeConfigService as RuntimeMapConfigPort;
    this.worldSyncMinimapService = worldSyncMinimapService as WorldSyncMinimapPort;
    this.playerAuthStore = playerAuthStore;
  }

  buildVisibleTilesSnapshot(view, player, template) {
    const radius = resolvePlayerEffectiveViewRange(player);
    const originX = view.self.x - radius;
    const originY = view.self.y - radius;
    const visibleTileIndices = new Set(Array.isArray(view.visibleTileIndices) ? view.visibleTileIndices : []);
    const visibleTileKeys = new Set(Array.isArray(view.visibleTileKeys) ? view.visibleTileKeys : []);
    const matrix = [];
    const byKey = new Map();
    for (let row = 0; row < radius * 2 + 1; row += 1) {
      const y = originY + row;
      const line = [];
      for (let column = 0; column < radius * 2 + 1; column += 1) {
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
          : this.buildCompositeTileSyncState(view, template, x, y, player);
        line.push(tile);
        if (tile) {
          byKey.set(coordKey, tile);
        }
      }
      matrix.push(line);
    }
    return {
      matrix,
      byKey,
    };
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
      entities.set(target.playerId, {
        ...buildPlayerRenderEntity(target, '#0f0', this.resolveAccountIdentityProjection(target.playerId, target)),
        x: visible.projectedFromParentMap === true ? visible.x : target.x,
        y: visible.projectedFromParentMap === true ? visible.y : target.y,
      });
    }
    for (const npc of view.localNpcs) {
      entities.set(npc.npcId, {
        id: npc.npcId,
        x: npc.x,
        y: npc.y,
        char: npc.char,
        color: npc.color,
        name: npc.name,
        kind: 'npc',
        npcQuestMarker: npc.questMarker ?? undefined,
      });
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
        buffs: Array.isArray(monster.buffs) ? monster.buffs.map((buff) => ({ ...buff })) : undefined,
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
      entities.set(`container:${containerTemplateId}:${container.id}`, {
        id: `container:${containerTemplateId}:${container.id}`,
        x: container.x,
        y: container.y,
        char: container.char,
        color: container.color,
        name: container.name,
        kind: 'container',
        respawnRemainingTicks,
      });
    }
    for (const formation of view.localFormations ?? []) {
      entities.set(formation.id, {
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
      });
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

  buildMinimapLibrarySync(player): any[] {
    const unlockedMapIds: string[] = Array.isArray(player.unlockedMapIds)
      ? player.unlockedMapIds.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
      : [];
    const mapIds = Array.from(new Set<string>(unlockedMapIds))
      .filter((entry) => this.templateRepository.has(entry))
      .sort(compareStableStrings);
    return mapIds.map((mapId) => {
      const template = this.templateRepository.getOrThrow(mapId);
      return {
        mapId,
        mapMeta: this.buildMapMetaSync(template),
        snapshot: this.worldSyncMinimapService.buildMinimapSnapshotSync(template),
      };
    });
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

  buildTileSyncState(template, instanceId, x, y, player = null) {
    const state = this.worldRuntimeService.getInstanceTileState(instanceId, x, y);
    if (!state) {
      return null;
    }

    const destroyed = state.combat?.destroyed === true;
    const tileType = state.tileType ?? (isInTemplateBounds(template, x, y) ? getTileTypeFromMapChar(template.terrainRows[y]?.[x] ?? '#') : TileType.Floor);
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
    const layerState = state.layers ?? null;
    const terrainType = typeof layerState?.terrain === 'string' ? layerState.terrain : undefined;
    const surfaceType = typeof layerState?.surface === 'string' ? layerState.surface : undefined;
    const structureType = destroyed === true ? null : (typeof layerState?.structure === 'string' ? layerState.structure : undefined);
    const interactableKinds = Array.isArray(layerState?.interactableKinds)
      ? layerState.interactableKinds.filter((kind) => typeof kind === 'string' && kind.length > 0)
      : undefined;
    if (terrainType) {
      tile.terrainType = terrainType;
    }
    if (surfaceType !== undefined) {
      tile.surfaceType = surfaceType;
    }
    if (structureType !== undefined) {
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
    return this.buildTileSyncState(lookup.template, lookup.instanceId, lookup.x, lookup.y, player)
      ?? buildStaticTileSyncState(lookup.template, lookup.x, lookup.y);
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
  const type = getTileTypeFromMapChar(template.terrainRows?.[y]?.[x] ?? '#');
  const layerSeed = resolveTileLayerSeedFromTemplateContext(type, x, y, (lookupX, lookupY) => (
    isInTemplateBounds(template, lookupX, lookupY)
      ? getTileTypeFromMapChar(template.terrainRows?.[lookupY]?.[lookupX] ?? '#')
      : null
  ));
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

function buildCoordKey(x, y) {
  return `${x},${y}`;
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

function buildPlayerRenderEntity(player, color, identity = null) {
  const playerId = normalizePlayerIdentityText(player.playerId);
  const displayName = normalizePlayerDisplayText(identity?.displayName ?? player.displayName, playerId);
  const name = normalizePlayerDisplayText(identity?.name ?? player.name, playerId);
  const charSource = displayName && (displayName !== '@' || !name) ? displayName : name;
  return {
    id: player.playerId,
    x: player.x,
    y: player.y,
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
    dangerLevel: template.source.dangerLevel,
    recommendedRealm: template.source.recommendedRealm,
    description: template.source.description,
  };
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

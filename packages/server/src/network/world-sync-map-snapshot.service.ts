import { Inject, Injectable, forwardRef } from '@nestjs/common';
import {
  DARKNESS_STACK_TO_VISION_MULTIPLIER,
  GAME_DAY_TICKS,
  GAME_TIME_PHASES,
  DEFAULT_AURA_LEVEL_BASE_VALUE,
  doesTileTypeBlockSight,
  getQiResourceDefaultLevel,
  getQiResourceDisplayLabel,
  getTileTypeFromMapChar,
  isTileTypeWalkable,
} from '@mud/shared-next';

import { getTileIndex, MapTemplateRepository } from '../runtime/map/map-template.repository';
import { RuntimeMapConfigService } from '../runtime/map/runtime-map-config.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';
import { WorldSyncMinimapService } from './world-sync-minimap.service';

interface WorldRuntimePort {
  getInstanceTileState(instanceId: string, x: number, y: number): any;
}

interface PlayerRuntimePort {
  getPlayer(playerId: string): any;
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
  ) {
    this.worldRuntimeService = worldRuntimeService as WorldRuntimePort;
    this.playerRuntimeService = playerRuntimeService as PlayerRuntimePort;
    this.templateRepository = templateRepository as TemplateRepositoryPort;
    this.mapRuntimeConfigService = mapRuntimeConfigService as RuntimeMapConfigPort;
    this.worldSyncMinimapService = worldSyncMinimapService as WorldSyncMinimapPort;
  }

  buildVisibleTilesSnapshot(view, player, template) {
    const radius = Math.max(1, Math.round(player.attrs.numericStats.viewRange));
    const originX = view.self.x - radius;
    const originY = view.self.y - radius;
    const visibleTileIndices = new Set(Array.isArray(view.visibleTileIndices) ? view.visibleTileIndices : []);
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

        const tile = visibleTileIndices.size > 0 && !visibleTileIndices.has(tileIndex)
          ? null
          : this.buildTileSyncState(template, view.instance.instanceId, x, y);
        line.push(tile);
        if (tile) {
          byKey.set(buildCoordKey(x, y), tile);
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
    const radius = Math.max(1, Math.round(player.attrs.numericStats.viewRange));
    const originX = view.self.x - radius;
    const originY = view.self.y - radius;
    const visibleTileIndices = new Set(Array.isArray(view.visibleTileIndices) ? view.visibleTileIndices : []);
    const keys = new Set();
    for (let row = 0; row < radius * 2 + 1; row += 1) {
      const y = originY + row;
      for (let column = 0; column < radius * 2 + 1; column += 1) {
        const x = originX + column;
        if (x < 0 || y < 0 || x >= template.width || y >= template.height) {
          continue;
        }

        const tileIndex = getTileIndex(x, y, template.width);
        if (visibleTileIndices.size > 0 && !visibleTileIndices.has(tileIndex)) {
          continue;
        }
        if (!this.worldRuntimeService.getInstanceTileState(view.instance.instanceId, x, y)) {
          continue;
        }
        keys.add(buildCoordKey(x, y));
      }
    }
    return keys;
  }

  buildRenderEntitiesSnapshot(view, player) {
    const entities = new Map();
    entities.set(player.playerId, buildPlayerRenderEntity(player, '#ff0'));
    for (const visible of view.visiblePlayers) {
      const target = this.playerRuntimeService.getPlayer(visible.playerId);
      if (!target || target.instanceId !== player.instanceId) {
        continue;
      }
      entities.set(target.playerId, buildPlayerRenderEntity(target, '#0f0'));
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
      });
    }
    for (const container of view.localContainers) {
      entities.set(`container:${view.instance.templateId}:${container.id}`, {
        id: `container:${view.instance.templateId}:${container.id}`,
        x: container.x,
        y: container.y,
        char: container.char,
        color: container.color,
        name: container.name,
        kind: 'container',
      });
    }
    return entities;
  }

  buildMinimapLibrarySync(player, currentMapId): any[] {
    const mapIds = Array.from(new Set([...player.unlockedMapIds, currentMapId]))
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
    return buildGameTimeState(
      template,
      view.tick,
      Math.max(1, Math.round(player.attrs.numericStats.viewRange)),
      this.mapRuntimeConfigService.getMapTimeConfig(view.instance.templateId),
      this.mapRuntimeConfigService.getMapTickSpeed(view.instance.templateId),
    );
  }

  buildTileSyncState(template, instanceId, x, y) {
    if (x < 0 || y < 0 || x >= template.width || y >= template.height) {
      return null;
    }

    const state = this.worldRuntimeService.getInstanceTileState(instanceId, x, y);
    if (!state) {
      return null;
    }

    const tileType = getTileTypeFromMapChar(template.terrainRows[y]?.[x] ?? '#');
    return {
      type: tileType,
      walkable: isTileTypeWalkable(tileType),
      blocksSight: doesTileTypeBlockSight(tileType),
      aura: state.aura,
      resources: Array.isArray(state.resources)
        ? state.resources
          .filter((entry) => entry && typeof entry.resourceKey === 'string' && Number.isFinite(entry.value) && entry.value > 0)
          .map((entry) => ({
            key: entry.resourceKey,
            label: getQiResourceDisplayLabel(entry.resourceKey),
            value: Math.max(0, Math.trunc(entry.value)),
            effectiveValue: Math.max(0, Math.trunc(entry.value)),
            level: getQiResourceDefaultLevel(entry.resourceKey, entry.value, DEFAULT_AURA_LEVEL_BASE_VALUE),
            sourceValue: Number.isFinite(entry.sourceValue) ? Math.max(0, Math.trunc(entry.sourceValue)) : undefined,
          }))
        : undefined,
      occupiedBy: null,
      modifiedAt: state.combat?.modifiedAt ?? null,
      hp: state.combat?.hp,
      maxHp: state.combat?.maxHp,
    };
  }
}

function buildCoordKey(x, y) {
  return `${x},${y}`;
}

function normalizeMapTimeConfig(input) {
  const candidate = input ?? {};
  return {
    offsetTicks: candidate.offsetTicks,
    scale: candidate.scale,
    light: candidate.light,
    palette: candidate.palette,
  };
}

function resolveDarknessStacks(lightPercent) {
  if (lightPercent >= 95) return 0;
  if (lightPercent >= 85) return 1;
  if (lightPercent >= 75) return 2;
  if (lightPercent >= 65) return 3;
  if (lightPercent >= 55) return 4;
  return 5;
}

function buildGameTimeState(template, totalTicks, baseViewRange, overrideConfig, tickSpeed = 1) {
  const config = normalizeMapTimeConfig(overrideConfig ?? template.source.time);
  const localTimeScale = typeof config.scale === 'number' && Number.isFinite(config.scale) && config.scale >= 0
    ? config.scale
    : 1;
  const timeScale = tickSpeed > 0 ? localTimeScale : 0;
  const offsetTicks = typeof config.offsetTicks === 'number' && Number.isFinite(config.offsetTicks)
    ? Math.round(config.offsetTicks)
    : 0;
  const effectiveTicks = tickSpeed > 0 ? totalTicks : 0;
  const localTicks = ((Math.floor(effectiveTicks * timeScale) + offsetTicks) % GAME_DAY_TICKS + GAME_DAY_TICKS) % GAME_DAY_TICKS;
  const phase = GAME_TIME_PHASES.find((entry) => localTicks >= entry.startTick && localTicks < entry.endTick)
    ?? GAME_TIME_PHASES[GAME_TIME_PHASES.length - 1];
  const baseLight = typeof config.light?.base === 'number' && Number.isFinite(config.light.base)
    ? config.light.base
    : 0;
  const timeInfluence = typeof config.light?.timeInfluence === 'number' && Number.isFinite(config.light.timeInfluence)
    ? config.light.timeInfluence
    : 100;
  const lightPercent = Math.max(0, Math.min(100, Math.round(baseLight + phase.skyLightPercent * (timeInfluence / 100))));
  const darknessStacks = resolveDarknessStacks(lightPercent);
  const visionMultiplier = DARKNESS_STACK_TO_VISION_MULTIPLIER[darknessStacks] ?? 0.5;
  const palette = config.palette?.[phase.id];
  return {
    totalTicks,
    localTicks,
    dayLength: GAME_DAY_TICKS,
    timeScale,
    phase: phase.id,
    phaseLabel: phase.label,
    darknessStacks,
    visionMultiplier,
    lightPercent,
    effectiveViewRange: Math.max(1, Math.ceil(Math.max(1, baseViewRange) * visionMultiplier)),
    tint: palette?.tint ?? phase.tint,
    overlayAlpha: palette?.alpha ?? Math.max(phase.overlayAlpha, (100 - lightPercent) / 100 * 0.8),
  };
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

function buildPlayerRenderEntity(player, color) {
  const displayName = typeof player.displayName === 'string' ? player.displayName.trim() : '';
  const name = typeof player.name === 'string' ? player.name.trim() : '';
  const playerId = typeof player.playerId === 'string' ? player.playerId.trim() : '';
  return {
    id: player.playerId,
    x: player.x,
    y: player.y,
    char: (displayName[0] ?? name[0] ?? playerId[0] ?? '@'),
    color,
    name: player.name,
    kind: 'player',
    monsterScale: getBuffPresentationScale(player.buffs?.buffs),
    hp: player.hp,
    maxHp: player.maxHp,
  };
}

function buildMapMetaSync(template) {
  return {
    id: template.id,
    name: template.name,
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

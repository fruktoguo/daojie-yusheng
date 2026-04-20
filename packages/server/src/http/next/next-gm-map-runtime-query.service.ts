import {
  DARKNESS_STACK_TO_VISION_MULTIPLIER,
  DEFAULT_AURA_LEVEL_BASE_VALUE,
  GAME_DAY_TICKS,
  GAME_TIME_PHASES,
  VIEW_RADIUS,
  getAuraLevel,
  getTileTypeFromMapChar,
  isTileTypeWalkable,
} from '@mud/shared-next';
import type { GameTimeState, MapTimeConfig, TimePaletteEntry, TimePhaseId } from '@mud/shared-next';
import { Inject, Injectable } from '@nestjs/common';
import { getTileIndex, MapTemplateRepository } from '../../runtime/map/map-template.repository';
import { RuntimeMapConfigService } from '../../runtime/map/runtime-map-config.service';
import { PlayerRuntimeService } from '../../runtime/player/player-runtime.service';
import { WorldRuntimeService } from '../../runtime/world/world-runtime.service';
import { isNextGmBotPlayerId } from './next-gm.constants';

interface RuntimePlayerEntryLike {
  playerId: string;
  x: number;
  y: number;
}

interface RuntimePlayerLike {
  displayName?: string;
  name?: string;
  sessionId?: string;
  hp?: number;
  maxHp?: number;
  combat: {
    autoBattle?: boolean;
  };
}

interface RuntimeMonsterLike {
  runtimeId: string;
  x: number;
  y: number;
  char: string;
  color: string;
  name: string;
  hp?: number;
  maxHp?: number;
  alive?: boolean;
  aggroTargetPlayerId?: string | null;
  respawnLeft?: number;
}

interface RuntimeInstanceLike {
  players: RuntimePlayerEntryLike[];
  tick?: number;
}

interface InternalRuntimeInstanceLike {
  getTileAura(x: number, y: number): number | undefined;
  listMonsters(): RuntimeMonsterLike[];
}

interface StaticMapEntityLike {
  id: string;
  x: number;
  y: number;
  char: string;
  color: string;
  name: string;
}

interface MapTemplateLike {
  name: string;
  width: number;
  height: number;
  source: {
    tiles: string[];
    time?: unknown;
  };
  baseAuraByTile: number[];
  npcs: StaticMapEntityLike[];
  containers: StaticMapEntityLike[];
}

interface MapTemplateRepositoryLike {
  getOrThrow(mapId: string): MapTemplateLike;
}

interface PlayerRuntimeServiceLike {
  getPlayer(playerId: string): RuntimePlayerLike | undefined;
}

interface WorldRuntimeServiceLike {
  instances?: Map<string, InternalRuntimeInstanceLike>;
  getInstance(instanceId: string): RuntimeInstanceLike | null | undefined;
  getRuntimeSummary(): { tick: number };
}

interface RuntimeMapConfigServiceLike {
  getMapTickSpeed(mapId: string): number;
  getMapTimeConfig(mapId: string, fallback: Record<string, unknown>): MapTimeConfig;
  isMapPaused(mapId: string): boolean;
}

interface LegacyRuntimeTileInput {
  mapChar?: unknown;
  aura?: unknown;
}

interface LegacyAuraResource {
  key: 'aura';
  label: '灵气';
  value: number;
  effectiveValue: number;
  level: number;
}

interface LegacyRuntimeTileProjection {
  type?: ReturnType<typeof getTileTypeFromMapChar>;
  walkable?: boolean;
  aura: number;
  resources: LegacyAuraResource[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isTimePhaseId(value: string): value is TimePhaseId {
  return GAME_TIME_PHASES.some((entry) => entry.id === value);
}

function normalizePalette(input: unknown): Partial<Record<TimePhaseId, TimePaletteEntry>> | undefined {
  if (!isRecord(input)) {
    return undefined;
  }

  const palette: Partial<Record<TimePhaseId, TimePaletteEntry>> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!isTimePhaseId(key) || !isRecord(value)) {
      continue;
    }

    palette[key] = {
      tint: typeof value.tint === 'string' ? value.tint : undefined,
      alpha: isFiniteNumber(value.alpha) ? value.alpha : undefined,
    };
  }

  return palette;
}

@Injectable()
export class NextGmMapRuntimeQueryService {
  constructor(
    @Inject(MapTemplateRepository) private readonly mapTemplateRepository: MapTemplateRepositoryLike,
    @Inject(PlayerRuntimeService) private readonly playerRuntimeService: PlayerRuntimeServiceLike,
    @Inject(WorldRuntimeService) private readonly worldRuntimeService: WorldRuntimeServiceLike,
    @Inject(RuntimeMapConfigService) private readonly runtimeMapConfigService: RuntimeMapConfigServiceLike,
  ) {}

  getMapRuntime(mapId: string, x?: unknown, y?: unknown, w?: unknown, h?: unknown) {
    const template = this.mapTemplateRepository.getOrThrow(mapId);
    const clampedW = Math.min(20, Math.max(1, Math.trunc(Number(w) || 20)));
    const clampedH = Math.min(20, Math.max(1, Math.trunc(Number(h) || 20)));
    const startX = clamp(Math.trunc(Number(x) || 0), 0, Math.max(0, template.width - 1));
    const startY = clamp(Math.trunc(Number(y) || 0), 0, Math.max(0, template.height - 1));
    const endX = Math.min(template.width, startX + clampedW);
    const endY = Math.min(template.height, startY + clampedH);
    const instanceId = `public:${mapId}`;
    const runtimeInstance = this.worldRuntimeService.getInstance(instanceId);
    const internalInstance = this.worldRuntimeService.instances?.get(instanceId) ?? null;
    const tiles: Array<Array<{ type?: ReturnType<typeof getTileTypeFromMapChar>; walkable?: boolean; aura: number }>> = [];

    for (let row = startY; row < endY; row += 1) {
      const line: Array<{ type?: ReturnType<typeof getTileTypeFromMapChar>; walkable?: boolean; aura: number }> = [];
      const terrainRow = template.source.tiles[row] ?? '';
      for (let column = startX; column < endX; column += 1) {
        const aura =
          internalInstance?.getTileAura(column, row)
          ?? template.baseAuraByTile[getTileIndex(column, row, template.width)]
          ?? 0;
        const tile = projectLegacyRuntimeTile({
          mapChar: terrainRow[column] ?? '#',
          aura,
        });

        line.push({
          type: tile.type,
          walkable: tile.walkable,
          aura: tile.aura,
        });
      }
      tiles.push(line);
    }

    const entities = [];
    if (runtimeInstance) {
      for (const entry of runtimeInstance.players) {
        if (!isInRect(entry.x, entry.y, startX, startY, endX, endY)) {
          continue;
        }

        const player = this.playerRuntimeService.getPlayer(entry.playerId);
        entities.push({
          id: entry.playerId,
          x: entry.x,
          y: entry.y,
          char: player?.displayName?.[0] ?? player?.name?.[0] ?? '人',
          color: typeof player?.sessionId === 'string' && player.sessionId.length > 0 ? '#4caf50' : '#888',
          name: player?.name ?? entry.playerId,
          kind: 'player',
          hp: player?.hp,
          maxHp: player?.maxHp,
          dead: (player?.hp ?? 1) <= 0,
          online: typeof player?.sessionId === 'string' && player.sessionId.length > 0,
          autoBattle: player?.combat.autoBattle === true,
          isBot: isNextGmBotPlayerId(entry.playerId),
        });
      }
    }

    if (internalInstance) {
      for (const monster of internalInstance.listMonsters()) {
        if (!isInRect(monster.x, monster.y, startX, startY, endX, endY)) {
          continue;
        }

        entities.push({
          id: monster.runtimeId,
          x: monster.x,
          y: monster.y,
          char: monster.char,
          color: monster.color,
          name: monster.name,
          kind: 'monster',
          hp: monster.hp,
          maxHp: monster.maxHp,
          dead: monster.alive !== true,
          alive: monster.alive === true,
          targetPlayerId: monster.aggroTargetPlayerId ?? undefined,
          respawnLeft: monster.respawnLeft,
        });
      }
    }

    for (const npc of template.npcs) {
      if (!isInRect(npc.x, npc.y, startX, startY, endX, endY)) {
        continue;
      }

      entities.push({
        id: npc.id,
        x: npc.x,
        y: npc.y,
        char: npc.char,
        color: npc.color,
        name: npc.name,
        kind: 'npc',
      });
    }

    for (const container of template.containers) {
      if (!isInRect(container.x, container.y, startX, startY, endX, endY)) {
        continue;
      }

      entities.push({
        id: container.id,
        x: container.x,
        y: container.y,
        char: container.char,
        color: container.color,
        name: container.name,
        kind: 'container',
      });
    }

    const tickSpeed = this.runtimeMapConfigService.getMapTickSpeed(mapId);
    const timeConfigFallback: Record<string, unknown> = isRecord(template.source.time) ? template.source.time : {};
    const timeConfig = this.runtimeMapConfigService.getMapTimeConfig(mapId, timeConfigFallback);

    return {
      mapId,
      mapName: template.name,
      width: template.width,
      height: template.height,
      tiles,
      entities,
      time: buildLegacyTimeState(
        template,
        runtimeInstance?.tick ?? this.worldRuntimeService.getRuntimeSummary().tick,
        VIEW_RADIUS,
        timeConfig,
        tickSpeed,
      ),
      timeConfig,
      tickSpeed,
      tickPaused: this.runtimeMapConfigService.isMapPaused(mapId),
    };
  }
}

function projectLegacyRuntimeTile(input: LegacyRuntimeTileInput): LegacyRuntimeTileProjection {
  const aura = Number.isFinite(input?.aura) ? Math.trunc(Number(input.aura)) : 0;
  const projection: LegacyRuntimeTileProjection = {
    aura,
    resources: [buildLegacyAuraResource(aura)],
  };

  if (typeof input?.mapChar === 'string') {
    const tileType = getTileTypeFromMapChar(input.mapChar[0] ?? '#');
    projection.type = tileType;
    projection.walkable = isTileTypeWalkable(tileType);
  }

  return projection;
}

function buildLegacyAuraResource(aura: number): LegacyAuraResource {
  return {
    key: 'aura',
    label: '灵气',
    value: aura,
    effectiveValue: aura,
    level: getAuraLevel(aura, DEFAULT_AURA_LEVEL_BASE_VALUE),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isInRect(x: number, y: number, startX: number, startY: number, endX: number, endY: number): boolean {
  return x >= startX && x < endX && y >= startY && y < endY;
}

function buildLegacyTimeState(
  template: { source?: { time?: unknown } },
  totalTicks: number,
  baseViewRange: number,
  overrideConfig: MapTimeConfig | undefined,
  tickSpeed: number,
): GameTimeState {
  const config = normalizeLegacyMapTimeConfig(overrideConfig ?? template.source?.time);
  const localTimeScale = typeof config.scale === 'number' && Number.isFinite(config.scale) && config.scale >= 0 ? config.scale : 1;
  const timeScale = tickSpeed > 0 ? localTimeScale : 0;
  const offsetTicks = typeof config.offsetTicks === 'number' && Number.isFinite(config.offsetTicks) ? Math.round(config.offsetTicks) : 0;
  const effectiveTicks = tickSpeed > 0 ? totalTicks : 0;
  const localTicks = ((Math.floor(effectiveTicks * timeScale) + offsetTicks) % GAME_DAY_TICKS + GAME_DAY_TICKS) % GAME_DAY_TICKS;
  const phase =
    GAME_TIME_PHASES.find((entry) => localTicks >= entry.startTick && localTicks < entry.endTick)
    ?? GAME_TIME_PHASES[GAME_TIME_PHASES.length - 1];
  const baseLight = typeof config.light?.base === 'number' && Number.isFinite(config.light.base) ? config.light.base : 0;
  const timeInfluence =
    typeof config.light?.timeInfluence === 'number' && Number.isFinite(config.light.timeInfluence)
      ? config.light.timeInfluence
      : 100;
  const lightPercent = Math.max(0, Math.min(100, Math.round(baseLight + phase.skyLightPercent * (timeInfluence / 100))));
  const darknessStacks = resolveLegacyDarknessStacks(lightPercent);
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
    overlayAlpha: palette?.alpha ?? Math.max(phase.overlayAlpha, ((100 - lightPercent) / 100) * 0.8),
  };
}

function normalizeLegacyMapTimeConfig(input: unknown): MapTimeConfig {
  const candidate = isRecord(input) ? input : {};

  return {
    offsetTicks: isFiniteNumber(candidate.offsetTicks) ? candidate.offsetTicks : undefined,
    scale: isFiniteNumber(candidate.scale) ? candidate.scale : undefined,
    light: isRecord(candidate.light)
      ? {
          base: isFiniteNumber(candidate.light.base) ? candidate.light.base : undefined,
          timeInfluence: isFiniteNumber(candidate.light.timeInfluence) ? candidate.light.timeInfluence : undefined,
        }
      : undefined,
    palette: normalizePalette(candidate.palette),
  };
}

function resolveLegacyDarknessStacks(lightPercent: number): number {
  if (lightPercent >= 95) return 0;
  if (lightPercent >= 85) return 1;
  if (lightPercent >= 75) return 2;
  if (lightPercent >= 65) return 3;
  if (lightPercent >= 55) return 4;
  return 5;
}

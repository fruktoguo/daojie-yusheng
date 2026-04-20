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
/**
 * RuntimePlayerEntryLike：定义接口结构约束，明确可交付字段含义。
 */


interface RuntimePlayerEntryLike {
/**
 * playerId：RuntimePlayerEntryLike 内部字段。
 */

  playerId: string;  
  /**
 * x：RuntimePlayerEntryLike 内部字段。
 */

  x: number;  
  /**
 * y：RuntimePlayerEntryLike 内部字段。
 */

  y: number;
}
/**
 * RuntimePlayerLike：定义接口结构约束，明确可交付字段含义。
 */


interface RuntimePlayerLike {
/**
 * displayName：RuntimePlayerLike 内部字段。
 */

  displayName?: string;  
  /**
 * name：RuntimePlayerLike 内部字段。
 */

  name?: string;  
  /**
 * sessionId：RuntimePlayerLike 内部字段。
 */

  sessionId?: string;  
  /**
 * hp：RuntimePlayerLike 内部字段。
 */

  hp?: number;  
  /**
 * maxHp：RuntimePlayerLike 内部字段。
 */

  maxHp?: number;  
  /**
 * combat：RuntimePlayerLike 内部字段。
 */

  combat: {  
  /**
 * autoBattle：RuntimePlayerLike 内部字段。
 */

    autoBattle?: boolean;
  };
}
/**
 * RuntimeMonsterLike：定义接口结构约束，明确可交付字段含义。
 */


interface RuntimeMonsterLike {
/**
 * runtimeId：RuntimeMonsterLike 内部字段。
 */

  runtimeId: string;  
  /**
 * x：RuntimeMonsterLike 内部字段。
 */

  x: number;  
  /**
 * y：RuntimeMonsterLike 内部字段。
 */

  y: number;  
  /**
 * char：RuntimeMonsterLike 内部字段。
 */

  char: string;  
  /**
 * color：RuntimeMonsterLike 内部字段。
 */

  color: string;  
  /**
 * name：RuntimeMonsterLike 内部字段。
 */

  name: string;  
  /**
 * hp：RuntimeMonsterLike 内部字段。
 */

  hp?: number;  
  /**
 * maxHp：RuntimeMonsterLike 内部字段。
 */

  maxHp?: number;  
  /**
 * alive：RuntimeMonsterLike 内部字段。
 */

  alive?: boolean;  
  /**
 * aggroTargetPlayerId：RuntimeMonsterLike 内部字段。
 */

  aggroTargetPlayerId?: string | null;  
  /**
 * respawnLeft：RuntimeMonsterLike 内部字段。
 */

  respawnLeft?: number;
}
/**
 * RuntimeInstanceLike：定义接口结构约束，明确可交付字段含义。
 */


interface RuntimeInstanceLike {
/**
 * players：RuntimeInstanceLike 内部字段。
 */

  players: RuntimePlayerEntryLike[];  
  /**
 * tick：RuntimeInstanceLike 内部字段。
 */

  tick?: number;
}
/**
 * InternalRuntimeInstanceLike：定义接口结构约束，明确可交付字段含义。
 */


interface InternalRuntimeInstanceLike {
  getTileAura(x: number, y: number): number | undefined;
  listMonsters(): RuntimeMonsterLike[];
}
/**
 * StaticMapEntityLike：定义接口结构约束，明确可交付字段含义。
 */


interface StaticMapEntityLike {
/**
 * id：StaticMapEntityLike 内部字段。
 */

  id: string;  
  /**
 * x：StaticMapEntityLike 内部字段。
 */

  x: number;  
  /**
 * y：StaticMapEntityLike 内部字段。
 */

  y: number;  
  /**
 * char：StaticMapEntityLike 内部字段。
 */

  char: string;  
  /**
 * color：StaticMapEntityLike 内部字段。
 */

  color: string;  
  /**
 * name：StaticMapEntityLike 内部字段。
 */

  name: string;
}
/**
 * MapTemplateLike：定义接口结构约束，明确可交付字段含义。
 */


interface MapTemplateLike {
/**
 * name：MapTemplateLike 内部字段。
 */

  name: string;  
  /**
 * width：MapTemplateLike 内部字段。
 */

  width: number;  
  /**
 * height：MapTemplateLike 内部字段。
 */

  height: number;  
  /**
 * source：MapTemplateLike 内部字段。
 */

  source: {  
  /**
 * tiles：MapTemplateLike 内部字段。
 */

    tiles: string[];    
    /**
 * time：MapTemplateLike 内部字段。
 */

    time?: unknown;
  };  
  /**
 * baseAuraByTile：MapTemplateLike 内部字段。
 */

  baseAuraByTile: number[];  
  /**
 * npcs：MapTemplateLike 内部字段。
 */

  npcs: StaticMapEntityLike[];  
  /**
 * containers：MapTemplateLike 内部字段。
 */

  containers: StaticMapEntityLike[];
}
/**
 * MapTemplateRepositoryLike：定义接口结构约束，明确可交付字段含义。
 */


interface MapTemplateRepositoryLike {
  getOrThrow(mapId: string): MapTemplateLike;
}
/**
 * PlayerRuntimeServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface PlayerRuntimeServiceLike {
  getPlayer(playerId: string): RuntimePlayerLike | undefined;
}
/**
 * WorldRuntimeServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface WorldRuntimeServiceLike {
/**
 * instances：WorldRuntimeServiceLike 内部字段。
 */

  instances?: Map<string, InternalRuntimeInstanceLike>;
  getInstance(instanceId: string): RuntimeInstanceLike | null | undefined;
  getRuntimeSummary(): {  
  /**
 * tick：WorldRuntimeServiceLike 内部字段。
 */
 tick: number };
}
/**
 * RuntimeMapConfigServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface RuntimeMapConfigServiceLike {
  getMapTickSpeed(mapId: string): number;
  getMapTimeConfig(mapId: string, fallback: Record<string, unknown>): MapTimeConfig;
  isMapPaused(mapId: string): boolean;
}
/**
 * LegacyRuntimeTileInput：定义接口结构约束，明确可交付字段含义。
 */


interface LegacyRuntimeTileInput {
/**
 * mapChar：LegacyRuntimeTileInput 内部字段。
 */

  mapChar?: unknown;  
  /**
 * aura：LegacyRuntimeTileInput 内部字段。
 */

  aura?: unknown;
}
/**
 * LegacyAuraResource：定义接口结构约束，明确可交付字段含义。
 */


interface LegacyAuraResource {
/**
 * key：LegacyAuraResource 内部字段。
 */

  key: 'aura';  
  /**
 * label：LegacyAuraResource 内部字段。
 */

  label: '灵气';  
  /**
 * value：LegacyAuraResource 内部字段。
 */

  value: number;  
  /**
 * effectiveValue：LegacyAuraResource 内部字段。
 */

  effectiveValue: number;  
  /**
 * level：LegacyAuraResource 内部字段。
 */

  level: number;
}
/**
 * LegacyRuntimeTileProjection：定义接口结构约束，明确可交付字段含义。
 */


interface LegacyRuntimeTileProjection {
/**
 * type：LegacyRuntimeTileProjection 内部字段。
 */

  type?: ReturnType<typeof getTileTypeFromMapChar>;  
  /**
 * walkable：LegacyRuntimeTileProjection 内部字段。
 */

  walkable?: boolean;  
  /**
 * aura：LegacyRuntimeTileProjection 内部字段。
 */

  aura: number;  
  /**
 * resources：LegacyRuntimeTileProjection 内部字段。
 */

  resources: LegacyAuraResource[];
}
/**
 * isRecord：执行状态校验并返回判断结果。
 * @param value unknown 参数说明。
 * @returns value is Record<string, unknown>。
 */


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
/**
 * isFiniteNumber：执行状态校验并返回判断结果。
 * @param value unknown 参数说明。
 * @returns value is number。
 */


function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
/**
 * isTimePhaseId：执行状态校验并返回判断结果。
 * @param value string 参数说明。
 * @returns value is TimePhaseId。
 */


function isTimePhaseId(value: string): value is TimePhaseId {
  return GAME_TIME_PHASES.some((entry) => entry.id === value);
}
/**
 * normalizePalette：执行核心业务逻辑。
 * @param input unknown 输入参数。
 * @returns Partial<Record<TimePhaseId, TimePaletteEntry>> | undefined。
 */


function normalizePalette(input: unknown): Partial<Record<TimePhaseId, TimePaletteEntry>> | undefined {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * NextGmMapRuntimeQueryService：封装该能力的入口与生命周期，承载运行时核心协作。
 */


@Injectable()
export class NextGmMapRuntimeQueryService {
/**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param mapTemplateRepository MapTemplateRepositoryLike 参数说明。
 * @param playerRuntimeService PlayerRuntimeServiceLike 参数说明。
 * @param worldRuntimeService WorldRuntimeServiceLike 参数说明。
 * @param runtimeMapConfigService RuntimeMapConfigServiceLike 参数说明。
 * @returns 无返回值（构造函数）。
 */

  constructor(
    @Inject(MapTemplateRepository) private readonly mapTemplateRepository: MapTemplateRepositoryLike,
    @Inject(PlayerRuntimeService) private readonly playerRuntimeService: PlayerRuntimeServiceLike,
    @Inject(WorldRuntimeService) private readonly worldRuntimeService: WorldRuntimeServiceLike,
    @Inject(RuntimeMapConfigService) private readonly runtimeMapConfigService: RuntimeMapConfigServiceLike,
  ) {}  
  /**
 * getMapRuntime：按给定条件读取/查询数据。
 * @param mapId string 地图 ID。
 * @param x unknown X 坐标。
 * @param y unknown Y 坐标。
 * @param w unknown 参数说明。
 * @param h unknown 参数说明。
 * @returns 函数返回值。
 */


  getMapRuntime(mapId: string, x?: unknown, y?: unknown, w?: unknown, h?: unknown) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    const tiles: Array<Array<{    
    /**
 * type：NextGmMapRuntimeQueryService 内部字段。
 */
 type?: ReturnType<typeof getTileTypeFromMapChar>;    
 /**
 * walkable：NextGmMapRuntimeQueryService 内部字段。
 */
 walkable?: boolean;    
 /**
 * aura：NextGmMapRuntimeQueryService 内部字段。
 */
 aura: number }>> = [];

    for (let row = startY; row < endY; row += 1) {
      const line: Array<{      
      /**
 * type：NextGmMapRuntimeQueryService 内部字段。
 */
 type?: ReturnType<typeof getTileTypeFromMapChar>;      
 /**
 * walkable：NextGmMapRuntimeQueryService 内部字段。
 */
 walkable?: boolean;      
 /**
 * aura：NextGmMapRuntimeQueryService 内部字段。
 */
 aura: number }> = [];
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
/**
 * projectLegacyRuntimeTile：执行核心业务逻辑。
 * @param input LegacyRuntimeTileInput 输入参数。
 * @returns LegacyRuntimeTileProjection。
 */


function projectLegacyRuntimeTile(input: LegacyRuntimeTileInput): LegacyRuntimeTileProjection {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * buildLegacyAuraResource：构建并返回目标对象。
 * @param aura number 参数说明。
 * @returns LegacyAuraResource。
 */


function buildLegacyAuraResource(aura: number): LegacyAuraResource {
  return {
    key: 'aura',
    label: '灵气',
    value: aura,
    effectiveValue: aura,
    level: getAuraLevel(aura, DEFAULT_AURA_LEVEL_BASE_VALUE),
  };
}
/**
 * clamp：执行核心业务逻辑。
 * @param value number 参数说明。
 * @param min number 参数说明。
 * @param max number 参数说明。
 * @returns number。
 */


function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
/**
 * isInRect：执行状态校验并返回判断结果。
 * @param x number X 坐标。
 * @param y number Y 坐标。
 * @param startX number 参数说明。
 * @param startY number 参数说明。
 * @param endX number 参数说明。
 * @param endY number 参数说明。
 * @returns boolean。
 */


function isInRect(x: number, y: number, startX: number, startY: number, endX: number, endY: number): boolean {
  return x >= startX && x < endX && y >= startY && y < endY;
}
/**
 * buildLegacyTimeState：构建并返回目标对象。
 * @param template { source?: { time?: unknown } } 参数说明。
 * @param totalTicks number 参数说明。
 * @param baseViewRange number 参数说明。
 * @param overrideConfig MapTimeConfig | undefined 参数说明。
 * @param tickSpeed number 参数说明。
 * @returns GameTimeState。
 */


function buildLegacyTimeState(
  template: {  
  /**
 * source：对象字段。
 */
 source?: {  
 /**
 * time：对象字段。
 */
 time?: unknown } },
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
/**
 * normalizeLegacyMapTimeConfig：执行核心业务逻辑。
 * @param input unknown 输入参数。
 * @returns MapTimeConfig。
 */


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
/**
 * resolveLegacyDarknessStacks：执行核心业务逻辑。
 * @param lightPercent number 参数说明。
 * @returns number。
 */


function resolveLegacyDarknessStacks(lightPercent: number): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (lightPercent >= 95) return 0;
  if (lightPercent >= 85) return 1;
  if (lightPercent >= 75) return 2;
  if (lightPercent >= 65) return 3;
  if (lightPercent >= 55) return 4;
  return 5;
}

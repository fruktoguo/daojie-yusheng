import {
  DARKNESS_STACK_TO_VISION_MULTIPLIER,
  DEFAULT_AURA_LEVEL_BASE_VALUE,
  GAME_DAY_TICKS,
  GAME_TIME_PHASES,
  VIEW_RADIUS,
  getQiResourceDefaultLevel,
  getQiResourceDisplayLabel,
  getTileTypeFromMapChar,
  isTileTypeWalkable,
} from '@mud/shared';
import type { GameTimeState, MapTimeConfig, TimePaletteEntry, TimePhaseId } from '@mud/shared';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { getTileIndex, MapTemplateRepository } from '../../runtime/map/map-template.repository';
import { RuntimeMapConfigService } from '../../runtime/map/runtime-map-config.service';
import { PlayerRuntimeService } from '../../runtime/player/player-runtime.service';
import { WorldRuntimeService } from '../../runtime/world/world-runtime.service';
import { buildPublicInstanceId } from '../../runtime/world/world-runtime.normalization.helpers';
import { isNativeGmBotPlayerId } from './native-gm.constants';
/**
 * RuntimePlayerEntryLike：定义接口结构约束，明确可交付字段含义。
 */


interface RuntimePlayerEntryLike {
/**
 * playerId：玩家ID标识。
 */

  playerId: string;  
  /**
 * x：x相关字段。
 */

  x: number;  
  /**
 * y：y相关字段。
 */

  y: number;
}
/**
 * RuntimePlayerLike：定义接口结构约束，明确可交付字段含义。
 */


interface RuntimePlayerLike {
/**
 * displayName：显示名称名称或显示文本。
 */

  displayName?: string;  
  /**
 * name：名称名称或显示文本。
 */

  name?: string;  
  /**
 * sessionId：sessionID标识。
 */

  sessionId?: string;  
  /**
 * hp：hp相关字段。
 */

  hp?: number;  
  /**
 * maxHp：maxHp相关字段。
 */

  maxHp?: number;  
  /**
 * combat：战斗相关字段。
 */

  combat: {  
  /**
 * autoBattle：autoBattle相关字段。
 */

    autoBattle?: boolean;
  };
}
/**
 * RuntimeMonsterLike：定义接口结构约束，明确可交付字段含义。
 */


interface RuntimeMonsterLike {
/**
 * runtimeId：运行态ID标识。
 */

  runtimeId: string;  
  /**
 * x：x相关字段。
 */

  x: number;  
  /**
 * y：y相关字段。
 */

  y: number;  
  /**
 * char：char相关字段。
 */

  char: string;  
  /**
 * color：color相关字段。
 */

  color: string;  
  /**
 * name：名称名称或显示文本。
 */

  name: string;  
  /**
 * hp：hp相关字段。
 */

  hp?: number;  
  /**
 * maxHp：maxHp相关字段。
 */

  maxHp?: number;  
  /**
 * alive：alive相关字段。
 */

  alive?: boolean;  
  /**
 * aggroTargetPlayerId：aggro目标玩家ID标识。
 */

  aggroTargetPlayerId?: string | null;  
  /**
 * respawnLeft：重生Left相关字段。
 */

  respawnLeft?: number;
}
/**
 * RuntimeInstanceLike：定义接口结构约束，明确可交付字段含义。
 */


interface RuntimeInstanceLike {
/**
 * instanceId：实例 ID 标识。
 */

  instanceId: string;
  /**
 * displayName：实例展示名。
 */

  displayName?: string;
  /**
 * templateId：地图模板 ID 标识。
 */

  templateId: string;
  /**
 * linePreset：分线预设。
 */

  linePreset?: 'peaceful' | 'real';
  /**
 * lineIndex：线路序号。
 */

  lineIndex?: number;
  /**
 * instanceOrigin：实例来源。
 */

  instanceOrigin?: 'bootstrap' | 'gm_manual';
  /**
 * defaultEntry：是否默认入口。
 */

  defaultEntry?: boolean;
  /**
 * persistentPolicy：实例持久化策略。
 */

  persistentPolicy?: 'persistent' | 'long_lived' | 'session' | 'ephemeral';
  /**
 * supportsPvp：是否支持 PVP。
 */

  supportsPvp?: boolean;
  /**
 * canDamageTile：是否可攻击地块。
 */

  canDamageTile?: boolean;
  /**
 * destroyAt：计划销毁时间。
 */

  destroyAt?: string | null;
  /**
 * playerCount：在线人数。
 */

  playerCount?: number;
  /**
 * players：集合字段。
 */

  players: RuntimePlayerEntryLike[];  
  /**
 * tick：tick相关字段。
 */

  tick?: number;
  /**
 * worldRevision：世界版本号。
 */

  worldRevision?: number;
}
/**
 * InternalRuntimeInstanceLike：定义接口结构约束，明确可交付字段含义。
 */


interface InternalRuntimeInstanceLike {
  getTileAura(x: number, y: number): number | undefined;
  listTileResources?(x: number, y: number): Array<{ resourceKey: string; value: number; sourceValue?: number }> | undefined;
  listMonsters(): RuntimeMonsterLike[];
}
/**
 * StaticMapEntityLike：定义接口结构约束，明确可交付字段含义。
 */


interface StaticMapEntityLike {
/**
 * id：ID标识。
 */

  id: string;
  /**
 * x：x相关字段。
 */

  x: number;  
  /**
 * y：y相关字段。
 */

  y: number;  
  /**
 * char：char相关字段。
 */

  char: string;  
  /**
 * color：color相关字段。
 */

  color: string;  
  /**
 * name：名称名称或显示文本。
 */

  name: string;
}
/**
 * MapTemplateLike：定义接口结构约束，明确可交付字段含义。
 */


interface MapTemplateLike {
/**
 * id：地图模板 ID 标识。
 */

  id: string;
  /**
 * name：名称名称或显示文本。
 */

  name: string;
  /**
 * width：width相关字段。
 */

  width: number;  
  /**
 * height：height相关字段。
 */

  height: number;  
  /**
 * source：来源相关字段。
 */

  source: {  
  /**
 * tiles：tile相关字段。
 */

    tiles: string[];    
    /**
 * time：时间相关字段。
 */

    time?: unknown;
  };  
  /**
 * baseAuraByTile：baseAuraByTile相关字段。
 */

  baseAuraByTile: number[];  
  /**
 * npcs：NPC相关字段。
 */

  npcs: StaticMapEntityLike[];  
  /**
 * containers：container相关字段。
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
 * instances：instance相关字段。
 */

  instances?: Map<string, InternalRuntimeInstanceLike>;
  worldRuntimeFormationService?: {
    listRuntimeFormations(instanceId: string): Array<{
      id: string;
      x: number;
      y: number;
      name: string;
      active?: boolean;
      radius?: number;
      rangeShape?: string;
      char?: string;
      color?: string;
      showText?: boolean;
      rangeHighlightColor?: string;
      remainingAuraBudget?: number;
      ownerPlayerId?: string;
      formationId?: string;
    }>;
  };
  getInstance(instanceId: string): RuntimeInstanceLike | null | undefined;
  getInstanceRuntime?(instanceId: string): InternalRuntimeInstanceLike | null | undefined;
  getRuntimeSummary(): {  
  /**
 * tick：tick相关字段。
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
 * mapChar：地图Char相关字段。
 */

  mapChar?: unknown;  
  /**
 * aura：aura相关字段。
 */

  aura?: unknown;
  /**
 * resources：resource相关字段。
 */

  resources?: unknown;
}
/**
 * LegacyAuraResource：定义接口结构约束，明确可交付字段含义。
 */


interface LegacyAuraResource {
/**
 * key：key标识。
 */

  key: string;  
  /**
 * label：label名称或显示文本。
 */

  label: string;  
  /**
 * value：值数值。
 */

  value: number;  
  /**
 * effectiveValue：effective值数值。
 */

  effectiveValue: number;  
  /**
 * level：等级数值。
 */

  level?: number;
  /**
 * sourceValue：来源值数值。
 */

  sourceValue?: number;
}
/**
 * LegacyRuntimeTileProjection：定义接口结构约束，明确可交付字段含义。
 */


interface LegacyRuntimeTileProjection {
/**
 * type：type相关字段。
 */

  type?: ReturnType<typeof getTileTypeFromMapChar>;  
  /**
 * walkable：walkable相关字段。
 */

  walkable?: boolean;  
  /**
 * aura：aura相关字段。
 */

  aura: number;  
  /**
 * resources：resource相关字段。
 */

  resources: LegacyAuraResource[];
}
/**
 * isRecord：判断Record是否满足条件。
 * @param value unknown 参数说明。
 * @returns 返回Record映射/集合。
 */


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
/**
 * isFiniteNumber：判断FiniteNumber是否满足条件。
 * @param value unknown 参数说明。
 * @returns 返回FiniteNumber数值。
 */


function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
/**
 * isTimePhaseId：判断时间阶段ID是否满足条件。
 * @param value string 参数说明。
 * @returns 返回时间PhaseID。
 */


function isTimePhaseId(value: string): value is TimePhaseId {
  return GAME_TIME_PHASES.some((entry) => entry.id === value);
}
/**
 * normalizePalette：规范化或转换Palette。
 * @param input unknown 输入参数。
 * @returns 返回Palette映射/集合。
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
 * NativeGmMapRuntimeQueryService：封装该能力的入口与生命周期，承载运行时核心协作。
 */


@Injectable()
export class NativeGmMapRuntimeQueryService {
/**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param mapTemplateRepository MapTemplateRepositoryLike 参数说明。
 * @param playerRuntimeService PlayerRuntimeServiceLike 参数说明。
 * @param worldRuntimeService WorldRuntimeServiceLike 参数说明。
 * @param runtimeMapConfigService RuntimeMapConfigServiceLike 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

  constructor(
    @Inject(MapTemplateRepository) private readonly mapTemplateRepository: MapTemplateRepositoryLike,
    @Inject(PlayerRuntimeService) private readonly playerRuntimeService: PlayerRuntimeServiceLike,
    @Inject(WorldRuntimeService) private readonly worldRuntimeService: WorldRuntimeServiceLike,
    @Inject(RuntimeMapConfigService) private readonly runtimeMapConfigService: RuntimeMapConfigServiceLike,
  ) {}  
  /**
 * getMapRuntime：读取和平公共线兼容运行态。
 * @param mapId string 地图 ID。
 * @param x unknown X 坐标。
 * @param y unknown Y 坐标。
 * @param w unknown 参数说明。
 * @param h unknown 参数说明。
 * @returns 无返回值，完成和平公共线兼容运行态的读取/组装。
 */


  getMapRuntime(mapId: string, x?: unknown, y?: unknown, w?: unknown, h?: unknown) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.mapTemplateRepository.getOrThrow(mapId);
    return this.getInstanceRuntime(buildPublicInstanceId(mapId), x, y, w, h);
  }

  /**
 * getInstanceRuntime：读取实例运行态。
 * @param instanceId string 实例 ID。
 * @param x unknown X 坐标。
 * @param y unknown Y 坐标。
 * @param w unknown 参数说明。
 * @param h unknown 参数说明。
 * @returns 无返回值，完成实例运行态的读取/组装。
 */

  getInstanceRuntime(instanceId: string, x?: unknown, y?: unknown, w?: unknown, h?: unknown) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const runtimeInstance = this.worldRuntimeService.getInstance(instanceId);
    if (!runtimeInstance) {
      throw new NotFoundException(`目标实例不存在：${instanceId}`);
    }
    const mapId = runtimeInstance.templateId;
    const template = this.mapTemplateRepository.getOrThrow(mapId);
    const clampedW = Math.min(20, Math.max(1, Math.trunc(Number(w) || 20)));
    const clampedH = Math.min(20, Math.max(1, Math.trunc(Number(h) || 20)));
    const startX = clamp(Math.trunc(Number(x) || 0), 0, Math.max(0, template.width - 1));
    const startY = clamp(Math.trunc(Number(y) || 0), 0, Math.max(0, template.height - 1));
    const endX = Math.min(template.width, startX + clampedW);
    const endY = Math.min(template.height, startY + clampedH);
    const internalInstance = this.worldRuntimeService.getInstanceRuntime?.(instanceId)
      ?? this.worldRuntimeService.instances?.get(instanceId)
      ?? null;
    const tiles: Array<Array<{    
    /**
 * type：type相关字段。
 */
 type?: ReturnType<typeof getTileTypeFromMapChar>;    
 /**
 * walkable：walkable相关字段。
 */
 walkable?: boolean;    
 /**
 * aura：aura相关字段。
 */
 aura: number;    
 /**
 * resources：resource相关字段。
 */
 resources?: LegacyAuraResource[] }>> = [];

    for (let row = startY; row < endY; row += 1) {
      const line: Array<{      
      /**
 * type：type相关字段。
 */
 type?: ReturnType<typeof getTileTypeFromMapChar>;      
 /**
 * walkable：walkable相关字段。
 */
 walkable?: boolean;      
 /**
 * aura：aura相关字段。
 */
 aura: number;      
 /**
 * resources：resource相关字段。
 */
 resources?: LegacyAuraResource[] }> = [];
      const terrainRow = template.source.tiles[row] ?? '';
      for (let column = startX; column < endX; column += 1) {
        const aura =
          internalInstance?.getTileAura(column, row)
          ?? template.baseAuraByTile[getTileIndex(column, row, template.width)]
          ?? 0;
        const tile = projectLegacyRuntimeTile({
          mapChar: terrainRow[column] ?? '#',
          aura,
          resources: internalInstance?.listTileResources?.(column, row),
        });

        line.push({
          type: tile.type,
          walkable: tile.walkable,
          aura: tile.aura,
          resources: tile.resources,
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
          isBot: isNativeGmBotPlayerId(entry.playerId),
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

    const formations = typeof this.worldRuntimeService.worldRuntimeFormationService?.listRuntimeFormations === 'function'
      ? this.worldRuntimeService.worldRuntimeFormationService.listRuntimeFormations(instanceId)
      : [];
    for (const formation of formations) {
      if (!isInRect(formation.x, formation.y, startX, startY, endX, endY)) {
        continue;
      }
      entities.push({
        id: formation.id,
        x: formation.x,
        y: formation.y,
        char: formation.char ?? '◎',
        color: formation.active === false ? '#9aa0a6' : formation.color ?? '#4da3ff',
        name: formation.name,
        kind: 'formation',
        active: formation.active !== false,
        radius: formation.radius,
        rangeShape: formation.rangeShape,
        showText: formation.showText !== false,
        rangeHighlightColor: formation.rangeHighlightColor,
        remainingAuraBudget: formation.remainingAuraBudget,
        ownerPlayerId: formation.ownerPlayerId,
        formationId: formation.formationId,
      });
    }

    const tickSpeed = this.runtimeMapConfigService.getMapTickSpeed(mapId);
    const timeConfigFallback: Record<string, unknown> = isRecord(template.source.time) ? template.source.time : {};
    const timeConfig = this.runtimeMapConfigService.getMapTimeConfig(mapId, timeConfigFallback);

    return {
      mapId,
      mapName: template.name,
      instanceId: runtimeInstance.instanceId,
      instanceName: runtimeInstance.displayName ?? template.name,
      templateId: template.id,
      templateName: template.name,
      linePreset: runtimeInstance.linePreset ?? 'peaceful',
      lineIndex: runtimeInstance.lineIndex ?? 1,
      instanceOrigin: runtimeInstance.instanceOrigin ?? 'bootstrap',
      defaultEntry: runtimeInstance.defaultEntry === true,
      persistentPolicy: runtimeInstance.persistentPolicy,
      supportsPvp: runtimeInstance.supportsPvp === true,
      canDamageTile: runtimeInstance.canDamageTile === true,
      destroyAt: typeof runtimeInstance.destroyAt === 'string' ? runtimeInstance.destroyAt : null,
      playerCount: Number.isFinite(runtimeInstance.playerCount) ? Number(runtimeInstance.playerCount) : runtimeInstance.players.length,
      worldRevision: Number.isFinite(runtimeInstance.worldRevision) ? Number(runtimeInstance.worldRevision) : 0,
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
 * projectLegacyRuntimeTile：执行projectLegacy运行态Tile相关逻辑。
 * @param input LegacyRuntimeTileInput 输入参数。
 * @returns 返回projectLegacy运行态Tile。
 */


function projectLegacyRuntimeTile(input: LegacyRuntimeTileInput): LegacyRuntimeTileProjection {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const aura = Number.isFinite(input?.aura) ? Math.trunc(Number(input.aura)) : 0;
  const resources = Array.isArray(input?.resources)
    ? input.resources
      .filter((entry) => entry
        && typeof entry === 'object'
        && typeof entry.resourceKey === 'string'
        && Number.isFinite(entry.value))
      .map((entry) => buildLegacyQiResource(
        entry.resourceKey,
        Number(entry.value),
        Number.isFinite(entry.sourceValue) ? Number(entry.sourceValue) : undefined,
      ))
      .filter((entry) => entry.value > 0)
    : [];
  const projection: LegacyRuntimeTileProjection = {
    aura,
    resources: resources.length > 0 ? resources : [buildLegacyAuraResource(aura)],
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
 * @returns 返回LegacyAuraResource。
 */


function buildLegacyAuraResource(aura: number): LegacyAuraResource {
  return buildLegacyQiResource('aura.refined.neutral', aura, 0);
}

function buildLegacyQiResource(resourceKey: string, value: number, sourceValue?: number): LegacyAuraResource {
  const normalizedValue = Math.max(0, Math.trunc(Number(value) || 0));
  return {
    key: resourceKey,
    label: getQiResourceDisplayLabel(resourceKey),
    value: normalizedValue,
    effectiveValue: normalizedValue,
    level: getQiResourceDefaultLevel(resourceKey, normalizedValue, DEFAULT_AURA_LEVEL_BASE_VALUE),
    sourceValue: Number.isFinite(sourceValue) ? Math.max(0, Math.trunc(Number(sourceValue))) : undefined,
  };
}
/**
 * clamp：执行clamp相关逻辑。
 * @param value number 参数说明。
 * @param min number 参数说明。
 * @param max number 参数说明。
 * @returns 返回clamp。
 */


function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
/**
 * isInRect：判断InRect是否满足条件。
 * @param x number X 坐标。
 * @param y number Y 坐标。
 * @param startX number 参数说明。
 * @param startY number 参数说明。
 * @param endX number 参数说明。
 * @param endY number 参数说明。
 * @returns 返回是否满足InRect条件。
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
 * @returns 返回Legacy时间状态。
 */


function buildLegacyTimeState(
  template: {  
  /**
 * source：来源相关字段。
 */
 source?: {  
 /**
 * time：时间相关字段。
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
 * normalizeLegacyMapTimeConfig：规范化或转换Legacy地图时间配置。
 * @param input unknown 输入参数。
 * @returns 返回Legacy地图时间配置。
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
 * resolveLegacyDarknessStacks：规范化或转换LegacyDarknessStack。
 * @param lightPercent number 参数说明。
 * @returns 返回LegacyDarknessStack。
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

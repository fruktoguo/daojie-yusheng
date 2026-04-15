/**
 * 游戏时间服务：昼夜循环、光照计算、黑暗 Buff 同步
 */
import { Injectable } from '@nestjs/common';
import {
  DARKNESS_STACK_TO_VISION_MULTIPLIER,
  GAME_DAY_TICKS,
  GAME_TIME_PHASES,
  GameTimeState,
  MapTimeConfig,
  normalizeLifeElapsedTicks,
  PlayerState,
  resolveLifeElapsedDays,
  TemporaryBuffState,
  TimePhaseDefinition,
  WORLD_DARKNESS_BUFF_DURATION,
  WORLD_DARKNESS_BUFF_ID,
  WORLD_TIME_SOURCE_ID,
} from '@mud/shared';
import { MapService } from './map.service';

/** TimedEntity：定义该接口的能力与字段约束。 */
interface TimedEntity {
/** mapId：定义该变量以承载业务值。 */
  mapId: string;
/** viewRange：定义该变量以承载业务值。 */
  viewRange: number;
  temporaryBuffs?: TemporaryBuffState[];
}

/** SyncPlayerTimeEffectsOptions：定义该接口的能力与字段约束。 */
interface SyncPlayerTimeEffectsOptions {
  advanceChronology?: boolean;
}

@Injectable()
/** TimeService：封装相关状态与行为。 */
export class TimeService {
  private readonly mapTicks = new Map<string, number>();

/** 构造函数：执行实例初始化流程。 */
  constructor(private readonly mapService: MapService) {}

  /** 推进指定地图的世界时间 tick */
  advanceMapTicks(mapId: string, ticks = 1): number {
/** safeTicks：定义该变量以承载业务值。 */
    const safeTicks = Number.isFinite(ticks) ? Math.max(0, Math.floor(ticks)) : 0;
/** next：定义该变量以承载业务值。 */
    const next = this.getTotalTicks(mapId) + safeTicks;
    this.mapTicks.set(mapId, next);
    this.mapService.setMapTimeTicks(mapId, next);
    return next;
  }

  /** 获取地图当前累计 tick 数 */
  getTotalTicks(mapId: string): number {
/** current：定义该变量以承载业务值。 */
    const current = this.mapTicks.get(mapId);
    if (typeof current === 'number' && Number.isFinite(current)) {
      return Math.max(0, Math.floor(current));
    }

/** persisted：定义该变量以承载业务值。 */
    const persisted = this.mapService.getMapTimeTicks(mapId);
    if (typeof persisted === 'number' && Number.isFinite(persisted)) {
/** normalized：定义该变量以承载业务值。 */
      const normalized = Math.max(0, Math.floor(persisted));
      this.mapTicks.set(mapId, normalized);
      return normalized;
    }

    return 0;
  }

  /** 构建玩家当前时间状态（含光照、黑暗层数、有效视野） */
  buildPlayerTimeState(player: PlayerState): GameTimeState {
    return this.buildTimeState(player.mapId, Math.max(1, player.viewRange));
  }

/** buildMonsterTimeState：执行对应的业务逻辑。 */
  buildMonsterTimeState(monster: Pick<TimedEntity, 'mapId' | 'viewRange'>): GameTimeState {
    return this.buildTimeState(monster.mapId, Math.max(1, monster.viewRange));
  }

  /** 同步玩家的黑暗 Buff 与时间衍生状态，并返回是否产生展示变化 */
  syncPlayerTimeEffects(
    player: PlayerState,
/** options：定义该变量以承载业务值。 */
    options: SyncPlayerTimeEffectsOptions = {},
  ): { state: GameTimeState; changed: boolean; chronologyDayChanged: boolean } {
/** previousRange：定义该变量以承载业务值。 */
    const previousRange = this.getEffectiveViewRangeFromBuff(player.viewRange, player.temporaryBuffs);
/** previousStacks：定义该变量以承载业务值。 */
    const previousStacks = this.getDarknessStacks(player.temporaryBuffs);
/** chronologyDayChanged：定义该变量以承载业务值。 */
    const chronologyDayChanged = options.advanceChronology === true
      ? this.advancePlayerChronology(player)
      : false;
/** state：定义该变量以承载业务值。 */
    const state = this.buildPlayerTimeState(player);
    player.temporaryBuffs ??= [];
    this.syncDarknessBuff(player, state.darknessStacks);
    return {
      state,
/** changed：定义该变量以承载业务值。 */
      changed: previousRange !== state.effectiveViewRange || previousStacks !== state.darknessStacks,
      chronologyDayChanged,
    };
  }

/** syncMonsterTimeEffects：执行对应的业务逻辑。 */
  syncMonsterTimeEffects(monster: TimedEntity): GameTimeState {
/** state：定义该变量以承载业务值。 */
    const state = this.buildTimeState(monster.mapId, Math.max(1, monster.viewRange));
    monster.temporaryBuffs ??= [];
    this.syncDarknessBuff(monster, state.darknessStacks);
    return state;
  }

  /** 根据黑暗 Buff 层数计算实际有效视野 */
  getEffectiveViewRangeFromBuff(baseViewRange: number, buffs?: TemporaryBuffState[]): number {
/** stacks：定义该变量以承载业务值。 */
    const stacks = this.getDarknessStacks(buffs);
    return this.applyVisionMultiplier(baseViewRange, stacks);
  }

  /** 判断当前黑暗层数是否达到夜间仇恨触发阈值 */
  isNightAggroWindow(state: GameTimeState): boolean {
    return state.darknessStacks >= 2;
  }

/** buildTimeState：执行对应的业务逻辑。 */
  private buildTimeState(mapId: string, baseViewRange: number): GameTimeState {
/** totalTicks：定义该变量以承载业务值。 */
    const totalTicks = this.getTotalTicks(mapId);
/** config：定义该变量以承载业务值。 */
    const config = this.mapService.getMapTimeConfig(mapId);
/** timeScale：定义该变量以承载业务值。 */
    const timeScale = this.getTimeScale(config);
/** localTicks：定义该变量以承载业务值。 */
    const localTicks = this.getLocalTicks(totalTicks, config, timeScale);
/** phase：定义该变量以承载业务值。 */
    const phase = this.resolvePhase(localTicks);
/** lightPercent：定义该变量以承载业务值。 */
    const lightPercent = this.resolveLightPercent(config, phase);
/** darknessStacks：定义该变量以承载业务值。 */
    const darknessStacks = this.resolveDarknessStacks(lightPercent);
/** visionMultiplier：定义该变量以承载业务值。 */
    const visionMultiplier = DARKNESS_STACK_TO_VISION_MULTIPLIER[darknessStacks] ?? 0.5;
/** palette：定义该变量以承载业务值。 */
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
      effectiveViewRange: this.applyVisionMultiplier(baseViewRange, darknessStacks),
      tint: palette?.tint ?? phase.tint,
      overlayAlpha: palette?.alpha ?? Math.max(phase.overlayAlpha, (100 - lightPercent) / 100 * 0.8),
    };
  }

  private getLocalTicks(totalTicks: number, config: MapTimeConfig, timeScale = this.getTimeScale(config)): number {
/** offset：定义该变量以承载业务值。 */
    const offset = Number.isFinite(config.offsetTicks) ? Math.round(config.offsetTicks ?? 0) : 0;
/** scaled：定义该变量以承载业务值。 */
    const scaled = Math.floor(totalTicks * timeScale) + offset;
    return ((scaled % GAME_DAY_TICKS) + GAME_DAY_TICKS) % GAME_DAY_TICKS;
  }

/** getTimeScale：执行对应的业务逻辑。 */
  private getTimeScale(config: MapTimeConfig): number {
    return typeof config.scale === 'number' && Number.isFinite(config.scale) && config.scale >= 0 ? config.scale : 1;
  }

/** resolvePhase：执行对应的业务逻辑。 */
  private resolvePhase(localTicks: number): TimePhaseDefinition {
    return GAME_TIME_PHASES.find((phase) => localTicks >= phase.startTick && localTicks < phase.endTick)
      ?? GAME_TIME_PHASES[GAME_TIME_PHASES.length - 1]!;
  }

/** resolveLightPercent：执行对应的业务逻辑。 */
  private resolveLightPercent(config: MapTimeConfig, phase: TimePhaseDefinition): number {
/** base：定义该变量以承载业务值。 */
    const base = typeof config.light?.base === 'number' ? config.light.base : 0;
/** timeInfluence：定义该变量以承载业务值。 */
    const timeInfluence = typeof config.light?.timeInfluence === 'number' ? config.light.timeInfluence : 100;
    return Math.max(0, Math.min(100, Math.round(base + phase.skyLightPercent * (timeInfluence / 100))));
  }

/** resolveDarknessStacks：执行对应的业务逻辑。 */
  private resolveDarknessStacks(lightPercent: number): number {
    if (lightPercent >= 95) return 0;
    if (lightPercent >= 85) return 1;
    if (lightPercent >= 75) return 2;
    if (lightPercent >= 65) return 3;
    if (lightPercent >= 55) return 4;
    return 5;
  }

/** advancePlayerChronology：执行对应的业务逻辑。 */
  private advancePlayerChronology(player: PlayerState): boolean {
/** previousTicks：定义该变量以承载业务值。 */
    const previousTicks = normalizeLifeElapsedTicks(player.lifeElapsedTicks);
/** previousDays：定义该变量以承载业务值。 */
    const previousDays = resolveLifeElapsedDays(previousTicks);
/** timeScale：定义该变量以承载业务值。 */
    const timeScale = this.getTimeScale(this.mapService.getMapTimeConfig(player.mapId));
    if (timeScale <= 0) {
      player.lifeElapsedTicks = previousTicks;
      return false;
    }

/** nextTicks：定义该变量以承载业务值。 */
    const nextTicks = previousTicks + timeScale;
    player.lifeElapsedTicks = nextTicks;
    return resolveLifeElapsedDays(nextTicks) !== previousDays;
  }

/** applyVisionMultiplier：执行对应的业务逻辑。 */
  private applyVisionMultiplier(baseViewRange: number, stacks: number): number {
/** safeBase：定义该变量以承载业务值。 */
    const safeBase = Math.max(1, Math.round(baseViewRange));
/** multiplier：定义该变量以承载业务值。 */
    const multiplier = DARKNESS_STACK_TO_VISION_MULTIPLIER[stacks] ?? 0.5;
    return Math.max(1, Math.ceil(safeBase * multiplier));
  }

/** getDarknessStacks：执行对应的业务逻辑。 */
  private getDarknessStacks(buffs?: TemporaryBuffState[]): number {
/** darknessBuff：定义该变量以承载业务值。 */
    const darknessBuff = buffs?.find((buff) => buff.buffId === WORLD_DARKNESS_BUFF_ID && buff.remainingTicks > 0);
    return Math.max(0, Math.min(5, darknessBuff?.stacks ?? 0));
  }

/** syncDarknessBuff：执行对应的业务逻辑。 */
  private syncDarknessBuff(entity: TimedEntity, stacks: number): void {
    entity.temporaryBuffs ??= [];
/** index：定义该变量以承载业务值。 */
    const index = entity.temporaryBuffs.findIndex((buff) => buff.buffId === WORLD_DARKNESS_BUFF_ID);
    if (stacks <= 0) {
      if (index >= 0) {
        entity.temporaryBuffs.splice(index, 1);
      }
      return;
    }

/** next：定义该变量以承载业务值。 */
    const next: TemporaryBuffState = {
      buffId: WORLD_DARKNESS_BUFF_ID,
      name: '夜色压境',
      desc: '夜色会按层数压缩视野；若身处恒明或得以免疫，此压制可被抵消。',
      shortMark: '夜',
      category: 'debuff',
      visibility: 'observe_only',
      remainingTicks: WORLD_DARKNESS_BUFF_DURATION,
      duration: WORLD_DARKNESS_BUFF_DURATION,
      stacks,
      maxStacks: 5,
      sourceSkillId: WORLD_TIME_SOURCE_ID,
      sourceSkillName: '天时',
      realmLv: 1,
      color: '#89a8c7',
    };

    if (index >= 0) {
      entity.temporaryBuffs[index] = {
        ...entity.temporaryBuffs[index]!,
        ...next,
      };
      return;
    }

    entity.temporaryBuffs.push(next);
  }
}


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

interface TimedEntity {
  mapId: string;
  viewRange: number;
  temporaryBuffs?: TemporaryBuffState[];
}

interface SyncPlayerTimeEffectsOptions {
  advanceChronology?: boolean;
}

@Injectable()
export class TimeService {
  private readonly mapTicks = new Map<string, number>();

  constructor(private readonly mapService: MapService) {}

  /** 推进指定地图的世界时间 tick */
  advanceMapTicks(mapId: string, ticks = 1): number {
    const safeTicks = Number.isFinite(ticks) ? Math.max(0, Math.floor(ticks)) : 0;
    const next = this.getTotalTicks(mapId) + safeTicks;
    this.mapTicks.set(mapId, next);
    this.mapService.setMapTimeTicks(mapId, next);
    return next;
  }

  /** 获取地图当前累计 tick 数 */
  getTotalTicks(mapId: string): number {
    const current = this.mapTicks.get(mapId);
    if (typeof current === 'number' && Number.isFinite(current)) {
      return Math.max(0, Math.floor(current));
    }

    const persisted = this.mapService.getMapTimeTicks(mapId);
    if (typeof persisted === 'number' && Number.isFinite(persisted)) {
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

  buildMonsterTimeState(monster: Pick<TimedEntity, 'mapId' | 'viewRange'>): GameTimeState {
    return this.buildTimeState(monster.mapId, Math.max(1, monster.viewRange));
  }

  /** 同步玩家的黑暗 Buff 与时间衍生状态，并返回是否产生展示变化 */
  syncPlayerTimeEffects(
    player: PlayerState,
    options: SyncPlayerTimeEffectsOptions = {},
  ): { state: GameTimeState; changed: boolean; chronologyDayChanged: boolean } {
    const previousRange = this.getEffectiveViewRangeFromBuff(player.viewRange, player.temporaryBuffs);
    const previousStacks = this.getDarknessStacks(player.temporaryBuffs);
    const chronologyDayChanged = options.advanceChronology === true
      ? this.advancePlayerChronology(player)
      : false;
    const state = this.buildPlayerTimeState(player);
    player.temporaryBuffs ??= [];
    this.syncDarknessBuff(player, state.darknessStacks);
    return {
      state,
      changed: previousRange !== state.effectiveViewRange || previousStacks !== state.darknessStacks,
      chronologyDayChanged,
    };
  }

  syncMonsterTimeEffects(monster: TimedEntity): GameTimeState {
    const state = this.buildTimeState(monster.mapId, Math.max(1, monster.viewRange));
    monster.temporaryBuffs ??= [];
    this.syncDarknessBuff(monster, state.darknessStacks);
    return state;
  }

  /** 根据黑暗 Buff 层数计算实际有效视野 */
  getEffectiveViewRangeFromBuff(baseViewRange: number, buffs?: TemporaryBuffState[]): number {
    const stacks = this.getDarknessStacks(buffs);
    return this.applyVisionMultiplier(baseViewRange, stacks);
  }

  /** 判断当前黑暗层数是否达到夜间仇恨触发阈值 */
  isNightAggroWindow(state: GameTimeState): boolean {
    return state.darknessStacks >= 2;
  }

  private buildTimeState(mapId: string, baseViewRange: number): GameTimeState {
    const totalTicks = this.getTotalTicks(mapId);
    const config = this.mapService.getMapTimeConfig(mapId);
    const timeScale = this.getTimeScale(config);
    const localTicks = this.getLocalTicks(totalTicks, config, timeScale);
    const phase = this.resolvePhase(localTicks);
    const lightPercent = this.resolveLightPercent(config, phase);
    const darknessStacks = this.resolveDarknessStacks(lightPercent);
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
      effectiveViewRange: this.applyVisionMultiplier(baseViewRange, darknessStacks),
      tint: palette?.tint ?? phase.tint,
      overlayAlpha: palette?.alpha ?? Math.max(phase.overlayAlpha, (100 - lightPercent) / 100 * 0.8),
    };
  }

  private getLocalTicks(totalTicks: number, config: MapTimeConfig, timeScale = this.getTimeScale(config)): number {
    const offset = Number.isFinite(config.offsetTicks) ? Math.round(config.offsetTicks ?? 0) : 0;
    const scaled = Math.floor(totalTicks * timeScale) + offset;
    return ((scaled % GAME_DAY_TICKS) + GAME_DAY_TICKS) % GAME_DAY_TICKS;
  }

  private getTimeScale(config: MapTimeConfig): number {
    return typeof config.scale === 'number' && Number.isFinite(config.scale) && config.scale >= 0 ? config.scale : 1;
  }

  private resolvePhase(localTicks: number): TimePhaseDefinition {
    return GAME_TIME_PHASES.find((phase) => localTicks >= phase.startTick && localTicks < phase.endTick)
      ?? GAME_TIME_PHASES[GAME_TIME_PHASES.length - 1]!;
  }

  private resolveLightPercent(config: MapTimeConfig, phase: TimePhaseDefinition): number {
    const base = typeof config.light?.base === 'number' ? config.light.base : 0;
    const timeInfluence = typeof config.light?.timeInfluence === 'number' ? config.light.timeInfluence : 100;
    return Math.max(0, Math.min(100, Math.round(base + phase.skyLightPercent * (timeInfluence / 100))));
  }

  private resolveDarknessStacks(lightPercent: number): number {
    if (lightPercent >= 95) return 0;
    if (lightPercent >= 85) return 1;
    if (lightPercent >= 75) return 2;
    if (lightPercent >= 65) return 3;
    if (lightPercent >= 55) return 4;
    return 5;
  }

  private advancePlayerChronology(player: PlayerState): boolean {
    const previousTicks = normalizeLifeElapsedTicks(player.lifeElapsedTicks);
    const previousDays = resolveLifeElapsedDays(previousTicks);
    const timeScale = this.getTimeScale(this.mapService.getMapTimeConfig(player.mapId));
    if (timeScale <= 0) {
      player.lifeElapsedTicks = previousTicks;
      return false;
    }

    const nextTicks = previousTicks + timeScale;
    player.lifeElapsedTicks = nextTicks;
    return resolveLifeElapsedDays(nextTicks) !== previousDays;
  }

  private applyVisionMultiplier(baseViewRange: number, stacks: number): number {
    const safeBase = Math.max(1, Math.round(baseViewRange));
    const multiplier = DARKNESS_STACK_TO_VISION_MULTIPLIER[stacks] ?? 0.5;
    return Math.max(1, Math.ceil(safeBase * multiplier));
  }

  private getDarknessStacks(buffs?: TemporaryBuffState[]): number {
    const darknessBuff = buffs?.find((buff) => buff.buffId === WORLD_DARKNESS_BUFF_ID && buff.remainingTicks > 0);
    return Math.max(0, Math.min(5, darknessBuff?.stacks ?? 0));
  }

  private syncDarknessBuff(entity: TimedEntity, stacks: number): void {
    entity.temporaryBuffs ??= [];
    const index = entity.temporaryBuffs.findIndex((buff) => buff.buffId === WORLD_DARKNESS_BUFF_ID);
    if (stacks <= 0) {
      if (index >= 0) {
        entity.temporaryBuffs.splice(index, 1);
      }
      return;
    }

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

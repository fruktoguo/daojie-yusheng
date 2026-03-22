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
  PlayerState,
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

@Injectable()
export class TimeService {
  private readonly worldEpochMs = Date.now();

  constructor(private readonly mapService: MapService) {}

  /** 获取自世界纪元以来的总 tick 数 */
  getTotalTicks(now = Date.now()): number {
    return Math.max(0, Math.floor((now - this.worldEpochMs) / 1000));
  }

  /** 构建玩家当前时间状态（含光照、黑暗层数、有效视野） */
  buildPlayerTimeState(player: PlayerState, now = Date.now()): GameTimeState {
    return this.buildTimeState(player.mapId, Math.max(1, player.viewRange), now);
  }

  buildMonsterTimeState(monster: Pick<TimedEntity, 'mapId' | 'viewRange'>, now = Date.now()): GameTimeState {
    return this.buildTimeState(monster.mapId, Math.max(1, monster.viewRange), now);
  }

  /** 同步玩家的黑暗 Buff 并返回时间状态和是否有变化 */
  syncPlayerTimeEffects(player: PlayerState, now = Date.now()): { state: GameTimeState; changed: boolean } {
    const previousRange = this.getEffectiveViewRangeFromBuff(player.viewRange, player.temporaryBuffs);
    const previousStacks = this.getDarknessStacks(player.temporaryBuffs);
    const state = this.buildPlayerTimeState(player, now);
    player.temporaryBuffs ??= [];
    this.syncDarknessBuff(player, state.darknessStacks);
    return {
      state,
      changed: previousRange !== state.effectiveViewRange || previousStacks !== state.darknessStacks,
    };
  }

  syncMonsterTimeEffects(monster: TimedEntity, now = Date.now()): GameTimeState {
    const state = this.buildTimeState(monster.mapId, Math.max(1, monster.viewRange), now);
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

  private buildTimeState(mapId: string, baseViewRange: number, now: number): GameTimeState {
    const totalTicks = this.getTotalTicks(now);
    const config = this.mapService.getMapTimeConfig(mapId);
    const localTicks = this.getLocalTicks(totalTicks, config);
    const phase = this.resolvePhase(localTicks);
    const lightPercent = this.resolveLightPercent(config, phase);
    const darknessStacks = this.resolveDarknessStacks(lightPercent);
    const visionMultiplier = DARKNESS_STACK_TO_VISION_MULTIPLIER[darknessStacks] ?? 0.5;
    const palette = config.palette?.[phase.id];
    return {
      totalTicks,
      localTicks,
      dayLength: GAME_DAY_TICKS,
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

  private getLocalTicks(totalTicks: number, config: MapTimeConfig): number {
    const scale = typeof config.scale === 'number' && config.scale > 0 ? config.scale : 1;
    const offset = Number.isFinite(config.offsetTicks) ? Math.round(config.offsetTicks ?? 0) : 0;
    const scaled = Math.floor(totalTicks * scale) + offset;
    return ((scaled % GAME_DAY_TICKS) + GAME_DAY_TICKS) % GAME_DAY_TICKS;
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

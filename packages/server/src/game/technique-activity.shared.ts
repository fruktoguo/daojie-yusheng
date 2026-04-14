import { PlayerState, VisibleBuffState } from '@mud/shared';

export interface TechniqueActivityBuffOptions {
  buffId: string;
  name: string;
  desc: string;
  shortMark: string;
  remainingTicks: number;
  totalTicks: number;
  sourceSkillId: string;
  sourceSkillName: string;
}

export interface TechniquePauseWindow {
  pausedTicks: number;
  remainingTicks: number;
  totalTicks: number;
  addedPauseTicks: number;
}

export function buildTechniqueActivityBuff(
  player: Pick<PlayerState, 'realm' | 'realmLv'>,
  options: TechniqueActivityBuffOptions,
): VisibleBuffState {
  return {
    buffId: options.buffId,
    name: options.name,
    desc: options.desc,
    shortMark: options.shortMark,
    category: 'buff',
    visibility: 'public',
    remainingTicks: options.remainingTicks,
    duration: options.totalTicks,
    stacks: 1,
    maxStacks: 1,
    sourceSkillId: options.sourceSkillId,
    sourceSkillName: options.sourceSkillName,
    realmLv: Math.max(1, player.realm?.realmLv ?? player.realmLv ?? 1),
    infiniteDuration: true,
  };
}

export function extendTechniquePauseWindow(params: {
  currentPausedTicks: number;
  pauseTicks: number;
  remainingTicks: number;
  totalTicks: number;
}): TechniquePauseWindow {
/** addedPauseTicks：定义该变量以承载业务值。 */
  const addedPauseTicks = Math.max(0, params.pauseTicks - params.currentPausedTicks);
  return {
    pausedTicks: params.pauseTicks,
    remainingTicks: params.remainingTicks + addedPauseTicks,
    totalTicks: params.totalTicks + addedPauseTicks,
    addedPauseTicks,
  };
}

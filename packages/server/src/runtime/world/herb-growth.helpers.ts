import { computeHerbGrowthRate, getAuraLevel } from '@mud/shared';

export interface HerbGrowthProgress {
  lastTick: number;
  remainingWork: number;
  rate: number;
}

export function getHerbGrowthRateAt(instance: any, container: any): number {
  return computeHerbGrowthRate(getAuraLevel(instance?.getTileAura?.(container.x, container.y) ?? 0));
}

/** 保存未完成的基础生长工作量，倍率变动不重置进度，亚息周期可以一次结算多份。 */
export function advanceHerbGrowthProgress(
  state: any, currentTick: number, nextRate: number | undefined,
  generate: (tick: number) => void, nextInterval: () => number,
): boolean {
  if (!Number.isFinite(state.refreshAtTick) || !Number.isFinite(currentTick)) return false;
  const now = Math.max(0, Math.trunc(currentTick));
  const previous: HerbGrowthProgress = state.herbGrowth ?? {
    lastTick: Math.min(now, Math.max(0, Number(state.generatedAtTick) || 0)),
    remainingWork: state.refreshAtTick - Math.min(now, Math.max(0, Number(state.generatedAtTick) || 0)),
    rate: 1,
  };
  const rate = Number.isFinite(nextRate) && Number(nextRate) >= 1 ? Number(nextRate) : previous.rate;
  // 实例时钟回退（checkpoint 恢复/回档）时把进度基准压回当前 tick；
  // 否则 lastTick 停留在未来，elapsed 恒为 0，草药生长会永久停摆。
  if (state.herbGrowth && previous.lastTick > now) {
    previous.lastTick = now;
  }
  const elapsed = Math.max(0, now - previous.lastTick);
  if (elapsed === 0 && state.herbGrowth && rate === previous.rate) return false;
  if (state.herbGrowth && rate === previous.rate && now < state.refreshAtTick) return false;
  let remainingWork = previous.remainingWork - elapsed * previous.rate;
  let steps = 0;
  // 沿用每次最多 256 次的补算预算，但不丢弃未结算工作量。
  while (remainingWork <= 1e-9 && steps < 256) {
    generate(Math.max(0, now + Math.floor(remainingWork / previous.rate)));
    remainingWork += nextInterval();
    steps += 1;
  }
  state.herbGrowth = { lastTick: now, remainingWork, rate } satisfies HerbGrowthProgress;
  state.refreshAtTick = now + Math.max(0, Math.ceil(remainingWork / rate));
  return true;
}

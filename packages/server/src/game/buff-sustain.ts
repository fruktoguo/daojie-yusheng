import type { BuffSustainCostDef, TemporaryBuffState } from '@mud/shared';

/** BuffSustainState：定义该类型的结构与数据语义。 */
type BuffSustainState = Pick<TemporaryBuffState, 'sustainCost' | 'sustainTicksElapsed'>;

/** normalizeGrowthRate：执行对应的业务逻辑。 */
function normalizeGrowthRate(sustainCost: BuffSustainCostDef): number {
  return Math.max(0, Number.isFinite(sustainCost.growthRate) ? Number(sustainCost.growthRate) : 0);
}

/** normalizeBaseCost：执行对应的业务逻辑。 */
function normalizeBaseCost(sustainCost: BuffSustainCostDef): number {
  return Math.max(1, Math.round(Number.isFinite(sustainCost.baseCost) ? Number(sustainCost.baseCost) : 1));
}

/** normalizeElapsedTicks：执行对应的业务逻辑。 */
function normalizeElapsedTicks(buff: BuffSustainState): number {
  return Math.max(0, Math.floor(Number.isFinite(buff.sustainTicksElapsed) ? Number(buff.sustainTicksElapsed) : 0));
}

/** normalizeBuffSustainCost：执行对应的业务逻辑。 */
export function normalizeBuffSustainCost(input: unknown): BuffSustainCostDef | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const candidate = input as Partial<BuffSustainCostDef>;
  if ((candidate.resource !== 'hp' && candidate.resource !== 'qi') || !Number.isFinite(candidate.baseCost)) {
    return undefined;
  }
  return {
    resource: candidate.resource,
    baseCost: normalizeBaseCost(candidate as BuffSustainCostDef),
    growthRate: normalizeGrowthRate({
      resource: candidate.resource,
      baseCost: Number(candidate.baseCost),
      growthRate: candidate.growthRate,
    }),
  };
}

/** getBuffSustainCost：执行对应的业务逻辑。 */
export function getBuffSustainCost(buff: BuffSustainState): number | null {
  if (!buff.sustainCost) {
    return null;
  }
  const growthRate = normalizeGrowthRate(buff.sustainCost);
  const baseCost = normalizeBaseCost(buff.sustainCost);
  const elapsedTicks = normalizeElapsedTicks(buff);
  return Math.max(1, Math.round(baseCost * ((1 + growthRate) ** elapsedTicks)));
}

/** getNextBuffSustainCost：执行对应的业务逻辑。 */
export function getNextBuffSustainCost(buff: BuffSustainState): number | null {
  if (!buff.sustainCost) {
    return null;
  }
  return getBuffSustainCost({
    sustainCost: buff.sustainCost,
    sustainTicksElapsed: normalizeElapsedTicks(buff) + 1,
  });
}

/** getBuffSustainResourceLabel：执行对应的业务逻辑。 */
export function getBuffSustainResourceLabel(resource: BuffSustainCostDef['resource']): string {
  return resource === 'hp' ? '气血' : '灵力';
}


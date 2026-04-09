import type { TemporaryBuffState } from '@mud/shared';
import { SOUL_DEVOUR_EROSION_BUFF_ID } from '../constants/gameplay/equipment';
import { FIRE_BURN_MARK_BUFF_ID } from '../constants/gameplay/technique-buffs';
import { getBuffSustainCost, getBuffSustainResourceLabel, getNextBuffSustainCost } from './buff-sustain';

export function getSoulDevourErosionRatio(stacks: number): number {
  const safeStacks = Math.max(0, stacks);
  if (safeStacks <= 0) {
    return 0;
  }
  return safeStacks / (safeStacks + 1000);
}

function formatDynamicPercent(value: number): string {
  const percent = Math.max(0, value * 100);
  if (percent === 0) {
    return '0%';
  }
  if (percent >= 10) {
    return `${percent.toFixed(percent % 1 === 0 ? 0 : 1)}%`;
  }
  return `${percent.toFixed(2)}%`;
}

function appendSustainDescription(
  buff: Pick<TemporaryBuffState, 'sustainCost' | 'sustainTicksElapsed'>,
  fallback?: string,
): string | undefined {
  if (!buff.sustainCost) {
    return fallback;
  }
  const currentCost = getBuffSustainCost(buff);
  const nextCost = getNextBuffSustainCost(buff);
  if (currentCost === null || nextCost === null) {
    return fallback;
  }
  const resourceLabel = getBuffSustainResourceLabel(buff.sustainCost.resource);
  const sustainText = `当前维持每息消耗 ${currentCost} 点${resourceLabel}，下一息将增至 ${nextCost} 点；${resourceLabel}不足时会自行解体。`;
  return fallback ? `${fallback} ${sustainText}` : sustainText;
}

export function buildDynamicBuffDescription(
  buff: Pick<TemporaryBuffState, 'buffId' | 'stacks' | 'desc' | 'baseDesc' | 'sustainCost' | 'sustainTicksElapsed'>,
): string | undefined {
  const fallback = buff.baseDesc ?? buff.desc;
  if (buff.buffId === SOUL_DEVOUR_EROSION_BUFF_ID) {
    return `当前总层数 ${Math.max(0, Math.round(buff.stacks))}，四维已降低 ${formatDynamicPercent(getSoulDevourErosionRatio(buff.stacks))}；此残意即使身死也不会散去。`;
  }
  if (buff.buffId === FIRE_BURN_MARK_BUFF_ID) {
    const safeStacks = Math.max(0, Math.round(buff.stacks));
    return `当前 ${safeStacks} 层；每层每息造成目标当前气血 1% 的火伤，对精英仅 10% 效果，对 Boss 仅 1% 效果。`;
  }
  return appendSustainDescription(buff, fallback);
}

export function syncDynamicBuffPresentation<T extends Pick<TemporaryBuffState, 'buffId' | 'stacks' | 'desc' | 'baseDesc' | 'sustainCost' | 'sustainTicksElapsed'>>(buff: T): T {
  buff.desc = buildDynamicBuffDescription(buff);
  return buff;
}

import type { TemporaryBuffState } from '@mud/shared';
import { SOUL_DEVOUR_EROSION_BUFF_ID } from '../constants/gameplay/equipment';

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

export function buildDynamicBuffDescription(buffId: string, stacks: number, fallback?: string): string | undefined {
  if (buffId === SOUL_DEVOUR_EROSION_BUFF_ID) {
    return `当前总层数 ${Math.max(0, Math.round(stacks))}，六维已降低 ${formatDynamicPercent(getSoulDevourErosionRatio(stacks))}；此残意即使身死也不会散去。`;
  }
  return fallback;
}

export function syncDynamicBuffPresentation<T extends Pick<TemporaryBuffState, 'buffId' | 'stacks' | 'desc'>>(buff: T): T {
  buff.desc = buildDynamicBuffDescription(buff.buffId, buff.stacks, buff.desc);
  return buff;
}

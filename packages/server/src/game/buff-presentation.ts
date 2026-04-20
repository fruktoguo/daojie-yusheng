import type { TemporaryBuffState } from '@mud/shared';
import { SOUL_DEVOUR_EROSION_BUFF_ID } from '../constants/gameplay/equipment';
import {
  PVP_SHA_BACKLASH_BUFF_ID,
  PVP_SHA_BACKLASH_PERCENT_PER_STACK,
  PVP_SHA_BACKLASH_STACK_DIVISOR,
  PVP_SHA_INFUSION_ATTACK_CAP_PERCENT,
  PVP_SHA_INFUSION_BUFF_ID,
  PVP_SOUL_INJURY_BUFF_ID,
} from '../constants/gameplay/pvp';
import { FIRE_BURN_MARK_BUFF_ID } from '../constants/gameplay/technique-buffs';
import { getBuffSustainCost, getBuffSustainResourceLabel, getNextBuffSustainCost } from './buff-sustain';

/** getSoulDevourErosionRatio：执行对应的业务逻辑。 */
export function getSoulDevourErosionRatio(stacks: number): number {
/** safeStacks：定义该变量以承载业务值。 */
  const safeStacks = Math.max(0, stacks);
  if (safeStacks <= 0) {
    return 0;
  }
  return safeStacks / (safeStacks + 1000);
}

/** formatDynamicPercent：执行对应的业务逻辑。 */
function formatDynamicPercent(value: number): string {
/** percent：定义该变量以承载业务值。 */
  const percent = Math.max(0, value * 100);
  if (percent === 0) {
    return '0%';
  }
  if (percent >= 10) {
    return `${percent.toFixed(percent % 1 === 0 ? 0 : 1)}%`;
  }
  return `${percent.toFixed(2)}%`;
}

/** appendSustainDescription：执行对应的业务逻辑。 */
function appendSustainDescription(
  buff: Pick<TemporaryBuffState, 'sustainCost' | 'sustainTicksElapsed'>,
  fallback?: string,
): string | undefined {
  if (!buff.sustainCost) {
    return fallback;
  }
/** currentCost：定义该变量以承载业务值。 */
  const currentCost = getBuffSustainCost(buff);
/** nextCost：定义该变量以承载业务值。 */
  const nextCost = getNextBuffSustainCost(buff);
  if (currentCost === null || nextCost === null) {
    return fallback;
  }
/** resourceLabel：定义该变量以承载业务值。 */
  const resourceLabel = getBuffSustainResourceLabel(buff.sustainCost.resource);
/** sustainText：定义该变量以承载业务值。 */
  const sustainText = `当前维持每息消耗 ${currentCost} 点${resourceLabel}，下一息将增至 ${nextCost} 点；${resourceLabel}不足时会自行解体。`;
  return fallback ? `${fallback} ${sustainText}` : sustainText;
}

/** buildDynamicBuffDescription：执行对应的业务逻辑。 */
export function buildDynamicBuffDescription(
  buff: Pick<TemporaryBuffState, 'buffId' | 'stacks' | 'desc' | 'baseDesc' | 'sustainCost' | 'sustainTicksElapsed'>,
): string | undefined {
/** fallback：定义该变量以承载业务值。 */
  const fallback = buff.baseDesc ?? buff.desc;
  if (buff.buffId === SOUL_DEVOUR_EROSION_BUFF_ID) {
    return `当前总层数 ${Math.max(0, Math.round(buff.stacks))}，四维已降低 ${formatDynamicPercent(getSoulDevourErosionRatio(buff.stacks))}；此残意即使身死也不会散去。`;
  }
  if (buff.buffId === PVP_SOUL_INJURY_BUFF_ID) {
    return '神魂受创，神识 -1%；身死与遁返都不会清除，需静养满一时辰。';
  }
  if (buff.buffId === PVP_SHA_INFUSION_BUFF_ID) {
    const safeStacks = Math.max(0, Math.round(buff.stacks));
    return `当前 ${safeStacks} 层；每层攻击 +1%（最高 +${PVP_SHA_INFUSION_ATTACK_CAP_PERCENT}%）、防御 -2%，死亡时会按当前层数比例折损当前境界修为，并将其中一半层数转为煞气反噬。`;
  }
  if (buff.buffId === PVP_SHA_BACKLASH_BUFF_ID) {
    const safeStacks = Math.max(0, Math.round(buff.stacks));
    return `当前 ${safeStacks} 层；每层攻击 -${PVP_SHA_BACKLASH_PERCENT_PER_STACK}%、防御 -${PVP_SHA_BACKLASH_PERCENT_PER_STACK}%，来源于死亡时由煞气入体转化而来。`;
  }
  if (buff.buffId === FIRE_BURN_MARK_BUFF_ID) {
/** safeStacks：定义该变量以承载业务值。 */
    const safeStacks = Math.max(0, Math.round(buff.stacks));
    return `当前 ${safeStacks} 层；每层每息造成目标当前气血 1% 的火伤，对精英仅 10% 效果，对 Boss 仅 1% 效果。`;
  }
  return appendSustainDescription(buff, fallback);
}

/** syncDynamicBuffPresentation：执行对应的业务逻辑。 */
export function syncDynamicBuffPresentation<T extends Pick<TemporaryBuffState, 'buffId' | 'stacks' | 'desc' | 'baseDesc' | 'sustainCost' | 'sustainTicksElapsed'>>(buff: T): T {
  buff.desc = buildDynamicBuffDescription(buff);
  return buff;
}

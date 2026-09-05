import type { CombatReactionRegistry } from '../../combat-reaction-registry';
import type { ElementKey } from '@mud/shared';
import { createRuntimeTemporaryBuff } from '../../../player/runtime-buff-instance';
import { hasEnabledPlayerSkill } from '../../../player/player-skill-passive.helpers';

export const SKILL_HEAVEN_DEVOUR_VEIN = 'skill_passive_heaven_devour_vein';
export const BUFF_HEAVEN_DEVOUR_VEIN_PREFIX = 'buff.passive_heaven_devour_vein_';

const FIVE_PHASE_KEYS: Record<string, true> = { metal: true, wood: true, water: true, fire: true, earth: true };
const ELEMENT_ZH: Record<string, string> = { metal: '金', wood: '木', water: '水', fire: '火', earth: '土' };
/** 噬脉引：受五行伤害时叠加对应五行减伤 Buff。 */
export function applyHeavenlyDevourVeinReaction(player: any, damageElement: unknown): boolean {
 if (!player || typeof damageElement !== 'string' || !FIVE_PHASE_KEYS[damageElement]) return false;
 if (!hasEnabledPlayerSkill(player, SKILL_HEAVEN_DEVOUR_VEIN)) return false;
 const elementKey = damageElement as ElementKey;
 const buffId = `${BUFF_HEAVEN_DEVOUR_VEIN_PREFIX}${elementKey}`;
 const existing = player.buffs?.buffs?.find((entry: any) => entry.buffId === buffId);
 const zhName = ELEMENT_ZH[elementKey] ?? elementKey;
 if (existing) {
  existing.stacks = Math.min(100, Math.max(0, Math.round(Number(existing.stacks) || 0)) + 1);
  existing.maxStacks = 100; existing.remainingTicks = 10; existing.duration = 10;
 } else {
  if (!Array.isArray(player.buffs?.buffs)) player.buffs = { ...(player.buffs ?? {}), buffs: [] };
  player.buffs.buffs.push(createRuntimeTemporaryBuff({ buffId, name: `${zhName}行噬脉减伤`, desc: '噬脉引：受到对应五行伤害时叠加，持续十息。', shortMark: '御', category: 'buff', visibility: 'public', remainingTicks: 10, duration: 10, stacks: 1, maxStacks: 100, sourceSkillId: SKILL_HEAVEN_DEVOUR_VEIN, sourceSkillName: '噬脉引', stats: { elementDamageReduce: { [elementKey]: 1 } }, statMode: 'flat' }));
  player.buffs.buffs.sort((left: any, right: any) => String(left.buffId ?? '').localeCompare(String(right.buffId ?? ''), 'zh-Hans-CN'));
 }
 return true;
}

export function registerPlayerHeavenlyDevourReaction(registry: CombatReactionRegistry<any>): void {
 registry.register({ id: 'player.heavenly-devour.before-damage', phase: 'beforeDamage', matches: (context) => context.targetKind === 'player', apply: (context) => ({ changed: applyHeavenlyDevourVeinReaction(context.target, context.damageElement) }) });
}

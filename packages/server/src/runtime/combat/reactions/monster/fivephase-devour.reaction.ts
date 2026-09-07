import { ELEMENT_KEYS } from '@mud/shared';
import { createRuntimeTemporaryBuff } from '../../../player/runtime-buff-instance';
import type { CombatReaction, CombatReactionContext, CombatReactionRegistry } from '../../combat-reaction-registry';

const FIVE_PHASE_DAMAGE_REDUCTION_BUFF_IDS: Record<string, string> = {
 metal: 'buff.dungeon_fivephase_devour_resist_metal', wood: 'buff.dungeon_fivephase_devour_resist_wood', water: 'buff.dungeon_fivephase_devour_resist_water', fire: 'buff.dungeon_fivephase_devour_resist_fire', earth: 'buff.dungeon_fivephase_devour_resist_earth',
};
const FIVE_PHASE_ELEMENT_ZH: Record<string, string> = { metal: '金', wood: '木', water: '水', fire: '火', earth: '土' };
const FIVE_PHASE_ORIGIN_BUFF_ID = 'buff.dungeon_fivephase_origin';
const FIVE_PHASE_DEVOUR_PASSIVE_SKILL_ID = 'skill.dungeon_fivephase_devour_passive';
const FIVE_PHASE_ORIGIN_PASSIVE_SKILL_ID = 'skill.dungeon_fivephase_origin_passive';

type RuntimeBuff = { buffId?: unknown; stacks?: unknown; maxStacks?: unknown; remainingTicks?: unknown; duration?: unknown };
type FivePhaseMonster = { skills?: unknown; buffs: RuntimeBuff[]; hp: number; maxHp: number; runtimeId: string };
export type FivePhaseDevourReactionHost = { recalculateMonsterDerivedState: (monster: FivePhaseMonster) => void; markMonsterRuntimePersistenceDirty: (runtimeId: string) => void; bumpWorldRevision: () => void };

function isRuntimeBuffActive(buff: RuntimeBuff | null | undefined): boolean {
 return Boolean(buff && Number(buff.remainingTicks) > 0 && Number(buff.stacks) > 0);
}

function monsterHasSkill(monster: FivePhaseMonster | null | undefined, expectedSkillId: string): boolean {
 if (!monster) return false;
 for (const skill of Array.isArray(monster.skills) ? monster.skills : []) {
  const skillId = typeof skill === 'string'
   ? skill.trim()
   : (skill && typeof skill === 'object' && 'id' in skill && typeof skill.id === 'string' ? skill.id.trim() : '');
  if (skillId === expectedSkillId) return true;
 }
 return false;
}

function applyFivePhaseDamageReaction(monster: FivePhaseMonster, damageElement: unknown, host: FivePhaseDevourReactionHost): boolean {
 const hasDevourPassive = monsterHasSkill(monster, FIVE_PHASE_DEVOUR_PASSIVE_SKILL_ID);
 const hasOriginPassive = monsterHasSkill(monster, FIVE_PHASE_ORIGIN_PASSIVE_SKILL_ID);
 if (!hasDevourPassive && !hasOriginPassive) return false;

 let changed = false;
 const element = typeof damageElement === 'string' && ELEMENT_KEYS.includes(damageElement as typeof ELEMENT_KEYS[number]) ? damageElement : undefined;
 if (hasDevourPassive && element) {
  const buffId = FIVE_PHASE_DAMAGE_REDUCTION_BUFF_IDS[element];
  const zhName = FIVE_PHASE_ELEMENT_ZH[element] ?? element;
  const existing = monster.buffs.find((entry) => entry.buffId === buffId);
  if (existing) {
   existing.stacks = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(Number(existing.stacks) || 0)) + 1);
   existing.maxStacks = Number.MAX_SAFE_INTEGER;
   existing.remainingTicks = 30;
   existing.duration = 30;
  }
  else {
   monster.buffs.push(createRuntimeTemporaryBuff({ buffId, name: `噬${zhName}`, desc: '五行噬脉：受到对应五行伤害时叠加，持续三十息。', shortMark: zhName, category: 'buff', visibility: 'public', remainingTicks: 30, duration: 30, stacks: 1, maxStacks: Number.MAX_SAFE_INTEGER, sourceSkillId: FIVE_PHASE_DEVOUR_PASSIVE_SKILL_ID, sourceSkillName: '五行噬脉', stats: { elementDamageReduce: { [element]: 1 } }, statMode: 'flat' }));
   monster.buffs.sort((left, right) => String(left.buffId ?? '').localeCompare(String(right.buffId ?? ''), 'zh-Hans-CN'));
  }
  changed = true;
 }

 const hpRatio = monster.maxHp > 0 ? monster.hp / monster.maxHp : 0;
 if (hasOriginPassive && hpRatio <= 0.3 && !monster.buffs.some((entry) => entry.buffId === FIVE_PHASE_ORIGIN_BUFF_ID && isRuntimeBuffActive(entry))) {
  const totalReductionStacks = ELEMENT_KEYS.reduce((sum, key) => sum + Math.max(0, Math.round(Number(monster.buffs.find((entry) => entry.buffId === FIVE_PHASE_DAMAGE_REDUCTION_BUFF_IDS[key])?.stacks) || 0)), 0);
  const allCombatStats = { maxHp: 1, maxQi: 1, maxQiOutputPerTick: 1, physAtk: 1, spellAtk: 1, physDef: 1, spellDef: 1, hit: 1, dodge: 1, crit: 1, antiCrit: 1, breakPower: 1, resolvePower: 1 };
  monster.buffs.push(createRuntimeTemporaryBuff({ buffId: FIVE_PHASE_ORIGIN_BUFF_ID, name: '五行归元', desc: '生命低于百分之三十时触发；每层提升全战斗属性百分之一，持续九百九十九息。', shortMark: '元', category: 'buff', visibility: 'public', remainingTicks: 1000, duration: 999, stacks: 1 + totalReductionStacks, maxStacks: Number.MAX_SAFE_INTEGER, sourceSkillId: FIVE_PHASE_ORIGIN_PASSIVE_SKILL_ID, sourceSkillName: '五行归元', stats: allCombatStats, statMode: 'percent' }));
  monster.buffs.sort((left, right) => String(left.buffId ?? '').localeCompare(String(right.buffId ?? ''), 'zh-Hans-CN'));
  changed = true;
 }
 if (changed) {
  host.recalculateMonsterDerivedState(monster);
  host.markMonsterRuntimePersistenceDirty(monster.runtimeId);
  host.bumpWorldRevision();
 }
 return changed;
}

export function registerFivePhaseDevourReaction(registry: CombatReactionRegistry<unknown>, host: FivePhaseDevourReactionHost): void {
 const reaction: CombatReaction<unknown> = {
  id: 'monster.fivephase-devour.after-damage',
  phase: 'afterDamage',
  matches: (context) => context.targetKind === 'monster',
  apply: (context: CombatReactionContext<unknown>) => ({ changed: applyFivePhaseDamageReaction(context.target as FivePhaseMonster, context.damageElement, host) }),
 };
 registry.register(reaction);
}

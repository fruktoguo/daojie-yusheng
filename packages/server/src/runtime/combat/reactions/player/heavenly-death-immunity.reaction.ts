import type { CombatReactionRegistry } from '../../combat-reaction-registry';
import { createRuntimeTemporaryBuff } from '../../../player/runtime-buff-instance';
import { hasEnabledPlayerSkill } from '../../../player/player-skill-passive.helpers';

export const SKILL_HEAVEN_DEATH_IMMUNITY = 'skill_passive_heaven_death_immunity';
export const BUFF_HEAVEN_DEATH_IMMUNITY_ACTIVE = 'buff.passive_heaven_death_immunity_active';
export const COOLDOWN_HEAVEN_DEATH_IMMUNITY = 1800;

/** 谷神不死：拦截致死伤害并锁定生命为 1 点（持续 1 息，冷却 1800 息）。 */
export function interceptLethalDamageWithDeathImmunity(player: any, damage: number, currentTick: number): { prevented: boolean; finalHp: number } {
 const currentHp = Math.max(0, Math.round(Number(player.hp) || 0));
 const normalizedDamage = Math.max(0, Math.round(Number(damage) || 0));
 if (currentHp - normalizedDamage > 0) return { prevented: false, finalHp: currentHp - normalizedDamage };
 const activeImmunityBuff = player.buffs?.buffs?.find((entry: any) => entry.buffId === BUFF_HEAVEN_DEATH_IMMUNITY_ACTIVE && (entry.remainingTicks ?? 0) > 0);
 if (activeImmunityBuff) return { prevented: true, finalHp: 1 };
 if (!hasEnabledPlayerSkill(player, SKILL_HEAVEN_DEATH_IMMUNITY)) return { prevented: false, finalHp: Math.max(0, currentHp - normalizedDamage) };
 const readyTick = Number(player.combat?.cooldownReadyTickBySkillId?.[SKILL_HEAVEN_DEATH_IMMUNITY] ?? 0);
 if (currentTick < readyTick) return { prevented: false, finalHp: Math.max(0, currentHp - normalizedDamage) };
 if (!player.combat) player.combat = { cooldownReadyTickBySkillId: {} };
 if (!player.combat.cooldownReadyTickBySkillId) player.combat.cooldownReadyTickBySkillId = {};
 player.combat.cooldownReadyTickBySkillId[SKILL_HEAVEN_DEATH_IMMUNITY] = currentTick + COOLDOWN_HEAVEN_DEATH_IMMUNITY;
 if (!Array.isArray(player.buffs?.buffs)) player.buffs = { ...(player.buffs ?? {}), buffs: [] };
 player.buffs.buffs.push(createRuntimeTemporaryBuff({ buffId: BUFF_HEAVEN_DEATH_IMMUNITY_ACTIVE, name: '真元护体', desc: '谷神不死，玄牝长存。生命值最低锁定为1点。', shortMark: '真', category: 'buff', visibility: 'public', remainingTicks: 1, duration: 1, stacks: 1, maxStacks: 1, sourceSkillId: SKILL_HEAVEN_DEATH_IMMUNITY, sourceSkillName: '谷神不死' }));
 player.buffs.buffs.sort((left: any, right: any) => String(left.buffId ?? '').localeCompare(String(right.buffId ?? ''), 'zh-Hans-CN'));
 return { prevented: true, finalHp: 1 };
}

export function registerPlayerHeavenlyDeathImmunityReaction(registry: CombatReactionRegistry<any>): void {
 registry.register({ id: 'player.heavenly-death-immunity.before-damage', phase: 'beforeDamage', matches: (context) => context.targetKind === 'player', apply: (context) => interceptLethalDamageWithDeathImmunity(context.target, context.damage, context.currentTick) });
}

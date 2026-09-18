import type { CombatReactionRegistry } from '../../combat-reaction-registry';
import { createRuntimeTemporaryBuff } from '../../../player/runtime-buff-instance';
import { findEnabledPlayerSkill } from '../../../player/player-skill-passive.helpers';

export const SKILL_HEAVEN_DEVOUR_VEIN = 'skill_passive_heaven_devour_vein';
export const BUFF_HEAVEN_DEVOUR_VEIN_PREFIX = 'buff.passive_heaven_devour_vein_';
export const SKILL_HEAVEN_ORIGIN_RETURN = 'skill_passive_heaven_origin_return';
export const BUFF_HEAVEN_ORIGIN_RETURN_ACTIVE = 'buff.passive_heaven_origin_return_active';
export const COOLDOWN_HEAVEN_ORIGIN_RETURN = 300;
export const SKILL_HEAVEN_AVATAR_AWAKENING = 'skill_passive_heaven_avatar_awakening';
export const BUFF_HUANLING_FAXIANG = 'buff.huanling_candan_faxiang';
export const BUFF_HUANLING_KUOYU = 'buff.huanling_candan_kuoyu';
export const COOLDOWN_HEAVEN_AVATAR_AWAKENING = 300;

/** 被动触发冷却以技能定义 cooldown 为准（不受冷却缩减影响），缺省回退到内置常量。 */
function resolvePassiveTriggerCooldownTicks(skill: any, fallback: number): number {
 return Math.max(1, Math.trunc(Number(skill?.cooldown) || fallback));
}

/** 触发 30% 低血量天阶被动机制（五炁归元 + 在天成象）。 */
export function triggerLowHpHeavenlyPassives(player: any, currentTick: number): boolean {
 if (!player || player.hp <= 0 || player.maxHp <= 0 || player.hp / player.maxHp > 0.3) return false;
 let changed = false;
 const originReturnSkill = findEnabledPlayerSkill(player, SKILL_HEAVEN_ORIGIN_RETURN);
 if (originReturnSkill) {
  const readyTick = Number(player.combat?.cooldownReadyTickBySkillId?.[SKILL_HEAVEN_ORIGIN_RETURN] ?? 0);
  if (currentTick >= readyTick) {
   let totalDevourStacks = 0; const buffs = Array.isArray(player.buffs?.buffs) ? player.buffs.buffs : []; const remainingBuffs: any[] = [];
   for (const buff of buffs) { if (typeof buff?.buffId === 'string' && buff.buffId.startsWith(BUFF_HEAVEN_DEVOUR_VEIN_PREFIX)) totalDevourStacks += Math.max(0, Math.round(Number(buff.stacks) || 0)); else remainingBuffs.push(buff); }
   if (totalDevourStacks > 0) {
    player.buffs.buffs = remainingBuffs; const originStacks = Math.min(500, totalDevourStacks);
    player.buffs.buffs.push(createRuntimeTemporaryBuff({ buffId: BUFF_HEAVEN_ORIGIN_RETURN_ACTIVE, name: '五行归元', desc: '散则成气，聚则成形。每层提升1%双抗与生命回复。', shortMark: '元', category: 'buff', visibility: 'public', remainingTicks: 60, duration: 60, stacks: originStacks, maxStacks: 500, sourceSkillId: SKILL_HEAVEN_ORIGIN_RETURN, sourceSkillName: '五炁归元', stats: { physDef: originStacks, spellDef: originStacks, hpRegenRate: originStacks }, statMode: 'percent' }));
    if (!player.combat) player.combat = { cooldownReadyTickBySkillId: {} }; if (!player.combat.cooldownReadyTickBySkillId) player.combat.cooldownReadyTickBySkillId = {};
    player.combat.cooldownReadyTickBySkillId[SKILL_HEAVEN_ORIGIN_RETURN] = currentTick + resolvePassiveTriggerCooldownTicks(originReturnSkill, COOLDOWN_HEAVEN_ORIGIN_RETURN); changed = true;
   }
  }
 }
 const avatarAwakeningSkill = findEnabledPlayerSkill(player, SKILL_HEAVEN_AVATAR_AWAKENING);
 if (avatarAwakeningSkill) {
  const readyTick = Number(player.combat?.cooldownReadyTickBySkillId?.[SKILL_HEAVEN_AVATAR_AWAKENING] ?? 0);
  if (currentTick >= readyTick) {
   const hasFaxiang = Array.isArray(player.buffs?.buffs) && player.buffs.buffs.some((b: any) => b.buffId === BUFF_HUANLING_FAXIANG && (b.remainingTicks > 0 || b.infiniteDuration));
   if (!hasFaxiang) {
    if (!Array.isArray(player.buffs?.buffs)) player.buffs = { ...(player.buffs ?? {}), buffs: [] };
    player.buffs.buffs.push(createRuntimeTemporaryBuff({ buffId: BUFF_HUANLING_FAXIANG, name: '残丹法相虚影', desc: '丹力强行撑起残丹法相虚影，体型额外暴涨三倍，攻势与术势尽数失控。', sourceSkillId: 'skill.huanling_candan_faxiang', shortMark: '相', category: 'buff', visibility: 'public', duration: 1, infiniteDuration: true, sustainCost: { resource: 'qi', baseCost: 100, growthRate: 0.2 }, stats: { physAtk: 100, spellAtk: 100, cooldownSpeed: 100, viewRange: 50 }, statMode: 'percent', presentationScale: 4 }));
    player.buffs.buffs.push(createRuntimeTemporaryBuff({ buffId: BUFF_HUANLING_KUOYU, name: '虚影扩域', desc: '法相虚影外翻余波，术法的射程与杀域同时扩开。', sourceSkillId: 'skill.huanling_candan_faxiang', shortMark: '域', category: 'buff', visibility: 'hidden', duration: 1, infiniteDuration: true, expireWithBuffId: BUFF_HUANLING_FAXIANG, stats: { extraRange: 5, extraArea: 1 }, statMode: 'flat' }));
    if (!player.combat) player.combat = { cooldownReadyTickBySkillId: {} }; if (!player.combat.cooldownReadyTickBySkillId) player.combat.cooldownReadyTickBySkillId = {};
    player.combat.cooldownReadyTickBySkillId[SKILL_HEAVEN_AVATAR_AWAKENING] = currentTick + resolvePassiveTriggerCooldownTicks(avatarAwakeningSkill, COOLDOWN_HEAVEN_AVATAR_AWAKENING); changed = true;
   }
  }
 }
 if (changed && Array.isArray(player.buffs?.buffs)) player.buffs.buffs.sort((left: any, right: any) => String(left.buffId ?? '').localeCompare(String(right.buffId ?? ''), 'zh-Hans-CN'));
 return changed;
}

export function registerPlayerLowHpReaction(registry: CombatReactionRegistry<any>): void {
 registry.register({ id: 'player.heavenly-low-hp.after-health-change', phase: 'afterHealthChange', matches: (context) => context.targetKind === 'player', apply: (context) => ({ changed: triggerLowHpHeavenlyPassives(context.target, context.currentTick) }) });
}

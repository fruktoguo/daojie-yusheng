/**
 * 天阶被动功法独门战斗机制：
 * 1. 《噬脉引》(skill_passive_heaven_devour_vein)：受到五行伤害获得对应五行减伤 Buff，持续 10 息，最多 100 层。
 * 2. 《五炁归元》(skill_passive_heaven_origin_return)：生命低于 30% 触发，消耗全部噬脉 Buff 转化为等量五行归元 Buff，持续 60 息，CD 300 息。
 * 3. 《谷神不死》(skill_passive_heaven_death_immunity)：致命伤害拦截，生命最低锁定为 1 点，持续 1 息，CD 1800 息。
 * 4. 《在天成象》(skill_passive_heaven_avatar_awakening)：生命低于 30% 自动开启法相（等同凝相丹效果），CD 300 息。
 */
import { ELEMENT_KEYS, type ElementKey } from '@mud/shared';
import { createRuntimeTemporaryBuff } from './runtime-buff-instance';
import { hasEnabledPlayerSkill } from './player-skill-passive.helpers';

export const SKILL_HEAVEN_DEVOUR_VEIN = 'skill_passive_heaven_devour_vein';
export const BUFF_HEAVEN_DEVOUR_VEIN_PREFIX = 'buff.passive_heaven_devour_vein_';

export const SKILL_HEAVEN_ORIGIN_RETURN = 'skill_passive_heaven_origin_return';
export const BUFF_HEAVEN_ORIGIN_RETURN_ACTIVE = 'buff.passive_heaven_origin_return_active';
export const COOLDOWN_HEAVEN_ORIGIN_RETURN = 300;

export const SKILL_HEAVEN_DEATH_IMMUNITY = 'skill_passive_heaven_death_immunity';
export const BUFF_HEAVEN_DEATH_IMMUNITY_ACTIVE = 'buff.passive_heaven_death_immunity_active';
export const COOLDOWN_HEAVEN_DEATH_IMMUNITY = 1800;

export const SKILL_HEAVEN_AVATAR_AWAKENING = 'skill_passive_heaven_avatar_awakening';
export const BUFF_HUANLING_FAXIANG = 'buff.huanling_candan_faxiang';
export const BUFF_HUANLING_KUOYU = 'buff.huanling_candan_kuoyu';
export const COOLDOWN_HEAVEN_AVATAR_AWAKENING = 300;

const FIVE_PHASE_KEYS: Record<string, true> = {
 metal: true,
 wood: true,
 water: true,
 fire: true,
 earth: true,
};
const ELEMENT_ZH: Record<string, string> = {
 metal: '金',
 wood: '木',
 water: '水',
 fire: '火',
 earth: '土',
};

/**
 * 噬脉引：受五行伤害时叠加对应五行减伤 Buff。
 */
export function applyHeavenlyDevourVeinReaction(
 player: any,
 damageElement: unknown,
): boolean {
 if (!player || typeof damageElement !== 'string' || !FIVE_PHASE_KEYS[damageElement]) {
  return false;
 }
 if (!hasEnabledPlayerSkill(player, SKILL_HEAVEN_DEVOUR_VEIN)) {
  return false;
 }
 const elementKey = damageElement as ElementKey;
 const buffId = `${BUFF_HEAVEN_DEVOUR_VEIN_PREFIX}${elementKey}`;
 const existing = player.buffs?.buffs?.find((entry: any) => entry.buffId === buffId);
 const zhName = ELEMENT_ZH[elementKey] ?? elementKey;

 if (existing) {
  existing.stacks = Math.min(100, Math.max(0, Math.round(Number(existing.stacks) || 0)) + 1);
  existing.maxStacks = 100;
  existing.remainingTicks = 10;
  existing.duration = 10;
 } else {
  if (!Array.isArray(player.buffs?.buffs)) {
   player.buffs = { ...(player.buffs ?? {}), buffs: [] };
  }
  player.buffs.buffs.push(createRuntimeTemporaryBuff({
   buffId,
   name: `${zhName}行噬脉减伤`,
   desc: '噬脉引：受到对应五行伤害时叠加，持续十息。',
   shortMark: '御',
   category: 'buff',
   visibility: 'public',
   remainingTicks: 10,
   duration: 10,
   stacks: 1,
   maxStacks: 100,
   sourceSkillId: SKILL_HEAVEN_DEVOUR_VEIN,
   sourceSkillName: '噬脉引',
   stats: { elementDamageReduce: { [elementKey]: 1 } },
   statMode: 'flat',
  }));
  player.buffs.buffs.sort((left: any, right: any) => String(left.buffId ?? '').localeCompare(String(right.buffId ?? ''), 'zh-Hans-CN'));
 }
 return true;
}

/**
 * 谷神不死：拦截致死伤害并锁定生命为 1 点（持续 1 息，冷却 1800 息）。
 */
export function interceptLethalDamageWithDeathImmunity(
 player: any,
 damage: number,
 currentTick: number,
): { prevented: boolean; finalHp: number } {
 const currentHp = Math.max(0, Math.round(Number(player.hp) || 0));
 const normalizedDamage = Math.max(0, Math.round(Number(damage) || 0));
 if (currentHp - normalizedDamage > 0) {
  return { prevented: false, finalHp: currentHp - normalizedDamage };
 }

 // 1. 已处于真元护体生效期内 -> 锁血为 1 点
 const activeImmunityBuff = player.buffs?.buffs?.find(
  (entry: any) => entry.buffId === BUFF_HEAVEN_DEATH_IMMUNITY_ACTIVE && (entry.remainingTicks ?? 0) > 0,
 );
 if (activeImmunityBuff) {
  return { prevented: true, finalHp: 1 };
 }

 // 2. 检查玩家是否启用了《谷神不死》被动
 if (!hasEnabledPlayerSkill(player, SKILL_HEAVEN_DEATH_IMMUNITY)) {
  return { prevented: false, finalHp: Math.max(0, currentHp - normalizedDamage) };
 }

 // 3. 检查冷却
 const readyTick = Number(player.combat?.cooldownReadyTickBySkillId?.[SKILL_HEAVEN_DEATH_IMMUNITY] ?? 0);
 if (currentTick < readyTick) {
  return { prevented: false, finalHp: Math.max(0, currentHp - normalizedDamage) };
 }

 // 4. 触发真元护体
 if (!player.combat) player.combat = { cooldownReadyTickBySkillId: {} };
 if (!player.combat.cooldownReadyTickBySkillId) player.combat.cooldownReadyTickBySkillId = {};
 player.combat.cooldownReadyTickBySkillId[SKILL_HEAVEN_DEATH_IMMUNITY] = currentTick + COOLDOWN_HEAVEN_DEATH_IMMUNITY;

 if (!Array.isArray(player.buffs?.buffs)) {
  player.buffs = { ...(player.buffs ?? {}), buffs: [] };
 }
 player.buffs.buffs.push(createRuntimeTemporaryBuff({
  buffId: BUFF_HEAVEN_DEATH_IMMUNITY_ACTIVE,
  name: '真元护体',
  desc: '谷神不死，玄牝长存。生命值最低锁定为1点。',
  shortMark: '真',
  category: 'buff',
  visibility: 'public',
  remainingTicks: 1,
  duration: 1,
  stacks: 1,
  maxStacks: 1,
  sourceSkillId: SKILL_HEAVEN_DEATH_IMMUNITY,
  sourceSkillName: '谷神不死',
 }));
 player.buffs.buffs.sort((left: any, right: any) => String(left.buffId ?? '').localeCompare(String(right.buffId ?? ''), 'zh-Hans-CN'));

 return { prevented: true, finalHp: 1 };
}

/**
 * 触发 30% 低血量天阶被动机制（五炁归元 + 在天成象）。
 */
export function triggerLowHpHeavenlyPassives(
 player: any,
 currentTick: number,
): boolean {
 if (!player || player.hp <= 0 || player.maxHp <= 0) {
  return false;
 }
 const hpRatio = player.hp / player.maxHp;
 if (hpRatio > 0.3) {
  return false;
 }

 let changed = false;

 // 1. 五炁归元
 if (hasEnabledPlayerSkill(player, SKILL_HEAVEN_ORIGIN_RETURN)) {
  const readyTick = Number(player.combat?.cooldownReadyTickBySkillId?.[SKILL_HEAVEN_ORIGIN_RETURN] ?? 0);
  if (currentTick >= readyTick) {
   // 统计全部噬脉 buff 层数
   let totalDevourStacks = 0;
   const buffs = Array.isArray(player.buffs?.buffs) ? player.buffs.buffs : [];
   const remainingBuffs: any[] = [];
   for (const buff of buffs) {
    if (typeof buff?.buffId === 'string' && buff.buffId.startsWith(BUFF_HEAVEN_DEVOUR_VEIN_PREFIX)) {
     totalDevourStacks += Math.max(0, Math.round(Number(buff.stacks) || 0));
    } else {
     remainingBuffs.push(buff);
    }
   }
   if (totalDevourStacks > 0) {
    player.buffs.buffs = remainingBuffs;
    const originStacks = Math.min(500, totalDevourStacks);
    player.buffs.buffs.push(createRuntimeTemporaryBuff({
     buffId: BUFF_HEAVEN_ORIGIN_RETURN_ACTIVE,
     name: '五行归元',
     desc: '散则成气，聚则成形。每层提升1%双抗与生命回复。',
     shortMark: '元',
     category: 'buff',
     visibility: 'public',
     remainingTicks: 60,
     duration: 60,
     stacks: originStacks,
     maxStacks: 500,
     sourceSkillId: SKILL_HEAVEN_ORIGIN_RETURN,
     sourceSkillName: '五炁归元',
     stats: {
      physDef: originStacks,
      spellDef: originStacks,
      hpRegenRate: originStacks,
     },
     statMode: 'percent',
    }));
    if (!player.combat) player.combat = { cooldownReadyTickBySkillId: {} };
    if (!player.combat.cooldownReadyTickBySkillId) player.combat.cooldownReadyTickBySkillId = {};
    player.combat.cooldownReadyTickBySkillId[SKILL_HEAVEN_ORIGIN_RETURN] = currentTick + COOLDOWN_HEAVEN_ORIGIN_RETURN;
    changed = true;
   }
  }
 }

 // 2. 在天成象（30%血自动开启法相）
 if (hasEnabledPlayerSkill(player, SKILL_HEAVEN_AVATAR_AWAKENING)) {
  const readyTick = Number(player.combat?.cooldownReadyTickBySkillId?.[SKILL_HEAVEN_AVATAR_AWAKENING] ?? 0);
  if (currentTick >= readyTick) {
   const hasFaxiang = Array.isArray(player.buffs?.buffs) && player.buffs.buffs.some(
    (b: any) => b.buffId === BUFF_HUANLING_FAXIANG && (b.remainingTicks > 0 || b.infiniteDuration),
   );
   if (!hasFaxiang) {
    if (!Array.isArray(player.buffs?.buffs)) {
     player.buffs = { ...(player.buffs ?? {}), buffs: [] };
    }
    // 施加残丹法相虚影与虚影扩域
    player.buffs.buffs.push(createRuntimeTemporaryBuff({
     buffId: BUFF_HUANLING_FAXIANG,
     name: '残丹法相虚影',
     desc: '丹力强行撑起残丹法相虚影，体型额外暴涨三倍，攻势与术势尽数失控。',
     sourceSkillId: 'skill.huanling_candan_faxiang',
     shortMark: '相',
     category: 'buff',
     visibility: 'public',
     duration: 1,
     infiniteDuration: true,
     sustainCost: {
      resource: 'qi',
      baseCost: 100,
      growthRate: 0.2,
     },
     stats: {
      physAtk: 100,
      spellAtk: 100,
      cooldownSpeed: 100,
      viewRange: 50,
     },
     statMode: 'percent',
     presentationScale: 4,
    }));
    player.buffs.buffs.push(createRuntimeTemporaryBuff({
     buffId: BUFF_HUANLING_KUOYU,
     name: '虚影扩域',
     desc: '法相虚影外翻余波，术法的射程与杀域同时扩开。',
     sourceSkillId: 'skill.huanling_candan_faxiang',
     shortMark: '域',
     category: 'buff',
     visibility: 'hidden',
     duration: 1,
     infiniteDuration: true,
     expireWithBuffId: BUFF_HUANLING_FAXIANG,
     stats: {
      extraRange: 5,
      extraArea: 1,
     },
     statMode: 'flat',
    }));
    if (!player.combat) player.combat = { cooldownReadyTickBySkillId: {} };
    if (!player.combat.cooldownReadyTickBySkillId) player.combat.cooldownReadyTickBySkillId = {};
    player.combat.cooldownReadyTickBySkillId[SKILL_HEAVEN_AVATAR_AWAKENING] = currentTick + COOLDOWN_HEAVEN_AVATAR_AWAKENING;
    changed = true;
   }
  }
 }

 if (changed && Array.isArray(player.buffs?.buffs)) {
  player.buffs.buffs.sort((left: any, right: any) => String(left.buffId ?? '').localeCompare(String(right.buffId ?? ''), 'zh-Hans-CN'));
 }

 return changed;
}

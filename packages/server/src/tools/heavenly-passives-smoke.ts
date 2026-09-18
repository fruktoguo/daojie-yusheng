import assert from 'node:assert/strict';
import {
 applyHeavenlyDevourVeinReaction,
 BUFF_HEAVEN_DEVOUR_VEIN_PREFIX,
 SKILL_HEAVEN_DEVOUR_VEIN,
} from '../runtime/combat/reactions/player/heavenly-devour.reaction';
import {
 interceptLethalDamageWithDeathImmunity,
 BUFF_HEAVEN_DEATH_IMMUNITY_ACTIVE,
 SKILL_HEAVEN_DEATH_IMMUNITY,
} from '../runtime/combat/reactions/player/heavenly-death-immunity.reaction';
import {
 BUFF_HEAVEN_ORIGIN_RETURN_ACTIVE,
 BUFF_HUANLING_FAXIANG,
 BUFF_HUANLING_KUOYU,
 SKILL_HEAVEN_AVATAR_AWAKENING,
 SKILL_HEAVEN_ORIGIN_RETURN,
 triggerLowHpHeavenlyPassives,
} from '../runtime/combat/reactions/player/low-hp.reaction';
import { buildActionEntries } from '../runtime/player/player-runtime.technique-queue.helpers';

const HEAVENLY_SKILL_COOLDOWNS: Record<string, number> = {
 [SKILL_HEAVEN_ORIGIN_RETURN]: 300,
 [SKILL_HEAVEN_DEATH_IMMUNITY]: 1800,
 [SKILL_HEAVEN_AVATAR_AWAKENING]: 300,
};

function createMockPlayer(options: {
 hp?: number;
 maxHp?: number;
 skills?: string[];
 buffs?: any[];
 cooldowns?: Record<string, number>;
 cooldownSpeed?: number;
} = {}): any {
 const hp = options.hp ?? 1000;
 const maxHp = options.maxHp ?? 1000;
 const skillIds = options.skills ?? [];
 return {
  playerId: 'player:test_heavenly',
  hp,
  maxHp,
  techniques: {
   revision: 1,
   techniques: [
    {
     techId: 'tech_heavenly',
     level: 1,
     skills: skillIds.map((id) => ({
      id,
      name: id,
      unlockLevel: 1,
      active: false,
      cooldown: HEAVENLY_SKILL_COOLDOWNS[id] ?? 0,
      ignoreCooldownReduction: HEAVENLY_SKILL_COOLDOWNS[id] !== undefined ? true : undefined,
      passiveEffects: [
       {
        type: 'buff',
        buffId: `buff_${id}`,
        name: id,
        stats: {},
       },
      ],
     })),
    },
   ],
  },
  combat: {
   autoBattleSkills: skillIds.map((id) => ({ skillId: id, skillEnabled: true })),
   cooldownReadyTickBySkillId: { ...(options.cooldowns ?? {}) },
  },
  attrs: {
   numericStats: { cooldownSpeed: options.cooldownSpeed ?? 0 },
  },
  actions: {
   revision: 1,
   actions: [],
   contextActions: [],
  },
  buffs: {
   revision: 1,
   buffs: options.buffs ? [...options.buffs] : [],
  },
 };
}

// 1. 测试《噬脉引》受五行伤害叠层
function testDevourVein(): void {
 const player = createMockPlayer({ skills: [SKILL_HEAVEN_DEVOUR_VEIN] });

 // 非五行伤害 -> 不触发
 const noReaction = applyHeavenlyDevourVeinReaction(player, 'physical');
 assert.equal(noReaction, false);
 assert.equal(player.buffs.buffs.length, 0);

 // 金系伤害 -> 获得金行噬脉减伤 1 层，持续 10 息
 const metalReaction = applyHeavenlyDevourVeinReaction(player, 'metal');
 assert.equal(metalReaction, true);
 const metalBuff = player.buffs.buffs.find((b: any) => b.buffId === `${BUFF_HEAVEN_DEVOUR_VEIN_PREFIX}metal`);
 assert.ok(metalBuff);
 assert.equal(metalBuff.stacks, 1);
 assert.equal(metalBuff.duration, 10);
 assert.equal(metalBuff.remainingTicks, 10);
 assert.equal(metalBuff.stats?.elementDamageReduce?.metal, 1);

 // 再次受金系伤害 -> 叠到 2 层
 applyHeavenlyDevourVeinReaction(player, 'metal');
 assert.equal(metalBuff.stacks, 2);
 assert.equal(metalBuff.remainingTicks, 10);

 // 火系伤害 -> 独立叠加火行噬脉减伤
 applyHeavenlyDevourVeinReaction(player, 'fire');
 const fireBuff = player.buffs.buffs.find((b: any) => b.buffId === `${BUFF_HEAVEN_DEVOUR_VEIN_PREFIX}fire`);
 assert.ok(fireBuff);
 assert.equal(fireBuff.stacks, 1);
 assert.equal(metalBuff.stacks, 2);

 // 叠满 100 层限制
 for (let i = 0; i < 150; i++) {
  applyHeavenlyDevourVeinReaction(player, 'metal');
 }
 assert.equal(metalBuff.stacks, 100);
}

// 2. 测试《五炁归元》在低血量时转化全部噬脉 Buff
function testOriginReturn(): void {
 const player = createMockPlayer({
  hp: 200, // 20% < 30%
  maxHp: 1000,
  skills: [SKILL_HEAVEN_ORIGIN_RETURN],
  buffs: [
   { buffId: `${BUFF_HEAVEN_DEVOUR_VEIN_PREFIX}metal`, stacks: 20, remainingTicks: 5, duration: 10 },
   { buffId: `${BUFF_HEAVEN_DEVOUR_VEIN_PREFIX}water`, stacks: 30, remainingTicks: 8, duration: 10 },
  ],
 });

 const changed = triggerLowHpHeavenlyPassives(player, 10);
 assert.equal(changed, true);

 // 噬脉 Buff 应被全额清除
 assert.ok(!player.buffs.buffs.some((b: any) => b.buffId.startsWith(BUFF_HEAVEN_DEVOUR_VEIN_PREFIX)));

 // 获得【五行归元】Buff，层数 = 20 + 30 = 50，持续 60 息
 const originBuff = player.buffs.buffs.find((b: any) => b.buffId === BUFF_HEAVEN_ORIGIN_RETURN_ACTIVE);
 assert.ok(originBuff);
 assert.equal(originBuff.stacks, 50);
 assert.equal(originBuff.remainingTicks, 60);
 assert.equal(originBuff.stats?.physDef, 50);
 assert.equal(originBuff.stats?.spellDef, 50);
 assert.equal(originBuff.stats?.hpRegenRate, 50);

 // 冷却记录应为 10 + 300 = 310
 assert.equal(player.combat.cooldownReadyTickBySkillId[SKILL_HEAVEN_ORIGIN_RETURN], 310);

 // 冷却期间再次触发应无效
 const triggeredAgain = triggerLowHpHeavenlyPassives(player, 50);
 assert.equal(triggeredAgain, false);
}

// 3. 测试《谷神不死》致命伤害锁血 1 点
function testDeathImmunity(): void {
 const player = createMockPlayer({
  hp: 500,
  maxHp: 1000,
  skills: [SKILL_HEAVEN_DEATH_IMMUNITY],
 });

 // 非致命伤害 (200) -> 正常结算
 const normalHit = interceptLethalDamageWithDeathImmunity(player, 200, 100);
 assert.equal(normalHit.prevented, false);
 assert.equal(normalHit.finalHp, 300);

 // 致命过量伤害 (10000) -> 触发真元护体，锁血为 1 点
 const lethalHit = interceptLethalDamageWithDeathImmunity(player, 10000, 100);
 assert.equal(lethalHit.prevented, true);
 assert.equal(lethalHit.finalHp, 1);

 // 检查是否获得了真元护体 Buff，持续 1 息
 const immunityBuff = player.buffs.buffs.find((b: any) => b.buffId === BUFF_HEAVEN_DEATH_IMMUNITY_ACTIVE);
 assert.ok(immunityBuff);
 assert.equal(immunityBuff.remainingTicks, 1);

 // 冷却记录应为 100 + 1800 = 1900
 assert.equal(player.combat.cooldownReadyTickBySkillId[SKILL_HEAVEN_DEATH_IMMUNITY], 1900);

 // 在真元护体生效期间再次受到致命伤害 -> 依然锁定 1 点
 player.hp = 1;
 const duringImmunityHit = interceptLethalDamageWithDeathImmunity(player, 99999, 100);
 assert.equal(duringImmunityHit.prevented, true);
 assert.equal(duringImmunityHit.finalHp, 1);

 // 护体消失后，冷却期内受到致死伤害 -> 无法拦截，致死 (hp=0)
 player.buffs.buffs = [];
 const onCooldownHit = interceptLethalDamageWithDeathImmunity(player, 50, 500);
 assert.equal(onCooldownHit.prevented, false);
 assert.equal(onCooldownHit.finalHp, 0);
}

// 4. 测试《在天成象》低血量自动开启法相
function testAvatarAwakening(): void {
 const player = createMockPlayer({
  hp: 250, // 25% < 30%
  maxHp: 1000,
  skills: [SKILL_HEAVEN_AVATAR_AWAKENING],
 });

 const changed = triggerLowHpHeavenlyPassives(player, 10);
 assert.equal(changed, true);

 // 获得残丹法相虚影与阔域
 const faxiangBuff = player.buffs.buffs.find((b: any) => b.buffId === BUFF_HUANLING_FAXIANG);
 const kuoyuBuff = player.buffs.buffs.find((b: any) => b.buffId === BUFF_HUANLING_KUOYU);
 assert.ok(faxiangBuff);
 assert.ok(kuoyuBuff);
 assert.equal(faxiangBuff.infiniteDuration, true);
 assert.equal(faxiangBuff.stats?.physAtk, 100);
 assert.equal(kuoyuBuff.stats?.extraRange, 5);

 // 冷却记录应为 10 + 300 = 310
 assert.equal(player.combat.cooldownReadyTickBySkillId[SKILL_HEAVEN_AVATAR_AWAKENING], 310);
}
// 5. 回归：action 冷却收敛不得删除标记 ignoreCooldownReduction 的被动冷却
function testPassiveCooldownSurvivesActionRebuild(): void {
 const player = createMockPlayer({
  hp: 100,
  maxHp: 1000,
  skills: [SKILL_HEAVEN_DEATH_IMMUNITY, SKILL_HEAVEN_DEVOUR_VEIN],
  cooldownSpeed: 500,
 });

 // 谷神不死触发后写入 100 + 1800 = 1900
 interceptLethalDamageWithDeathImmunity(player, 99999, 100);
 assert.equal(player.combat.cooldownReadyTickBySkillId[SKILL_HEAVEN_DEATH_IMMUNITY], 1900);

 // 高冷却速度下重建 action 状态：标记技能按原始 1800 息收敛，冷却保留
 const rebuilt = buildActionEntries(player, 500);
 player.actions.actions = rebuilt.actions;
 assert.equal(player.combat.cooldownReadyTickBySkillId[SKILL_HEAVEN_DEATH_IMMUNITY], 1900);
 const immunityAction = rebuilt.actions.find((entry: any) => entry.id === SKILL_HEAVEN_DEATH_IMMUNITY);
 assert.ok(immunityAction);
 assert.equal(immunityAction.cooldownLeft, 1400);

 // 未标记技能（cooldown=0 的噬脉引）遗留超窗冷却仍会被清理
 player.combat.cooldownReadyTickBySkillId[SKILL_HEAVEN_DEVOUR_VEIN] = 1900;
 const rebuiltAgain = buildActionEntries(player, 500);
 assert.equal(player.combat.cooldownReadyTickBySkillId[SKILL_HEAVEN_DEVOUR_VEIN], undefined);
 assert.equal(player.combat.cooldownReadyTickBySkillId[SKILL_HEAVEN_DEATH_IMMUNITY], 1900);
}

function testHeavenlyTechniquesHaveNoNegativeStats(): void {
 const fs = require('node:fs');
 const path = require('node:path');
 const jsonPath = path.resolve(__dirname, '../../data/content/techniques/被动功法/通用被动.json');
 const techniques = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
 const heavenIds = [
  'passive_heaven_devour_vein',
  'passive_heaven_origin_return',
  'passive_heaven_death_immunity',
  'passive_heaven_avatar_awakening',
 ];
 for (const id of heavenIds) {
  const tech = techniques.find((t: any) => t.id === id);
  assert.ok(tech, `Technique ${id} should exist`);
  assert.equal(tech.attrFloat, 0, `${id} attrFloat should be 0`);
  const stats = tech.skills?.[0]?.passiveEffects?.[0]?.stats ?? {};
  for (const [key, value] of Object.entries(stats)) {
   if (typeof value === 'number') {
    assert.ok(value >= 0, `${id} stat ${key} should not be negative, got ${value}`);
   }
  }
 }
}

testDevourVein();
testOriginReturn();
testDeathImmunity();
testAvatarAwakening();
testPassiveCooldownSurvivesActionRebuild();
testHeavenlyTechniquesHaveNoNegativeStats();

console.log(JSON.stringify({ ok: true, case: 'heavenly-passives', checks: 34 }));

import assert from 'node:assert/strict';
import { ContentTemplateRepository } from '../content/content-template.repository.js';
import { DungeonTemplateRegistry } from '../content/registries/dungeon-template.registry.js';
import { hydrateDungeonMonsterSkills } from '../runtime/dungeon/dungeon-runtime.service.js';
import { canMonsterCastSkill } from '../runtime/monster-ai/monster-ai.helpers.js';
import { getSkillEffectColor, isHostileSkill } from '../runtime/world/world-runtime.normalization.helpers.js';

interface HydratedSkill {
  id?: string;
  active?: boolean;
  effects?: unknown[];
}
function main(): void {
  assert.doesNotThrow(() => getSkillEffectColor(undefined));
  assert.doesNotThrow(() => getSkillEffectColor('skill.dungeon_fivephase_devour_passive'));
  assert.doesNotThrow(() => getSkillEffectColor({ id: 'x' }));
  assert.equal(isHostileSkill(undefined), false);
  assert.equal(isHostileSkill({}), false);

  const content = new ContentTemplateRepository();
  content.loadAll();
  const registry = new DungeonTemplateRegistry();
  registry.loadAll();
  const dungeon = registry.getRef('dungeon_fivephase_devourer');
  const skillIds = dungeon?.rooms?.[0]?.bossSkillIds ?? [];
  assert.ok(Array.isArray(skillIds) && skillIds.length > 0, '五行噬脉兽必须配置 bossSkillIds');

  const mixed = hydrateDungeonMonsterSkills(
    [...skillIds, { id: 'skill.dungeon_fivephase_devour' }, 'skill.dungeon_fivephase_devour'],
    (skillId) => content.getSkillRef(skillId),
  ) as HydratedSkill[];
  assert.equal(mixed.length, skillIds.length, '技能 ID 必须去重并解析成对象');
  for (const skill of mixed) {
    assert.equal(typeof skill?.id, 'string');
    assert.equal(Array.isArray(skill?.effects), true, `${skill?.id} 必须带 effects 数组`);
    assert.doesNotThrow(() => getSkillEffectColor(skill));
  }

  const passive = mixed.find((skill) => skill?.id === 'skill.dungeon_fivephase_devour_passive');
  const devour = mixed.find((skill) => skill?.id === 'skill.dungeon_fivephase_devour');
  assert.equal(passive?.active, false);
  assert.ok(devour && devour.active !== false);
  const monster = {
    skills: mixed,
    hp: 100,
    maxHp: 100,
    qi: 999,
    numericStats: { maxQiOutputPerTick: 100, extraRange: 0, extraArea: 0 },
    cooldownReadyTickBySkillId: {},
    x: 10,
    y: 10,
  };
  const target = { id: 'p_tester', x: 11, y: 10 };
  assert.equal(canMonsterCastSkill(monster as never, 'skill.dungeon_fivephase_devour' as never, target, 1, 0), false);
  assert.equal(canMonsterCastSkill(monster as never, passive as never, target, 1, 0), false);
  assert.notEqual(devour?.active, false);

  console.log(JSON.stringify({
    ok: true,
    case: 'dungeon-boss-skill-hydrate',
    skills: mixed.map((skill) => ({
      id: skill?.id,
      active: skill?.active !== false,
      effects: Array.isArray(skill?.effects) ? skill.effects.length : -1,
    })),
  }));
}

main();

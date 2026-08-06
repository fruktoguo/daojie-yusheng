import assert from 'node:assert/strict';

import { PlayerCombatService } from '../runtime/combat/player-combat.service';
import { findPlayerSkill } from '../runtime/world/world-runtime.normalization.helpers';

interface SkillFixture {
  id?: string;
  unlockLevel?: number;
  cooldown?: number;
}

interface TechniqueFixture {
  level: number;
  skills: SkillFixture[];
}

interface TechniqueStateFixture {
  revision: number;
  techniques: TechniqueFixture[];
}

interface PlayerFixture {
  playerId: string;
  techniques: TechniqueStateFixture;
  combat: {
    cooldownReadyTickBySkillId: Record<string, number>;
  };
  attrs: {
    numericStats: Record<string, number>;
    ratioDivisors: Record<string, number>;
  };
}

function createPlayer(): PlayerFixture {
  return {
    playerId: 'player:skill-lookup-cache',
    techniques: {
      revision: 1,
      techniques: [
        {
          level: 2,
          skills: [
            { id: 'skill:duplicate', unlockLevel: 1, cooldown: 5 },
            { id: 'skill:existing', unlockLevel: 1, cooldown: 5 },
          ],
        },
        {
          level: 2,
          skills: [{ id: 'skill:duplicate', unlockLevel: 1, cooldown: 5 }],
        },
      ],
    },
    combat: { cooldownReadyTickBySkillId: {} },
    attrs: { numericStats: {}, ratioDivisors: {} },
  };
}

function testNormalizationLookupPreservesFirstSkillAndRevisionInvalidation(): void {
  const player = createPlayer();
  const firstDuplicate = player.techniques.techniques[0]?.skills[0];
  assert.equal(findPlayerSkill(player as never, 'skill:duplicate'), firstDuplicate);

  const addedSkill = { id: 'skill:added', unlockLevel: 1, cooldown: 5 };
  player.techniques.techniques[0]?.skills.push(addedSkill);
  player.techniques.revision += 1;
  assert.equal(findPlayerSkill(player as never, 'skill:added'), addedSkill);

  const replacement = [{ level: 2, skills: [{ id: 'skill:replacement', unlockLevel: 1, cooldown: 5 }] }];
  player.techniques.techniques = replacement;
  assert.equal(findPlayerSkill(player as never, 'skill:replacement'), replacement[0]?.skills[0]);
  assert.equal(findPlayerSkill(player as never, 'skill:existing'), null);
}

function testCombatLookupReadsCooldownAndTechniqueStateAfterCacheWarmup(): void {
  const player = createPlayer();
  const service = new PlayerCombatService({});

  const first = service.resolvePlayerSkillForCast(player as never, 'skill:existing', 10);
  assert.equal(first.skill.id, 'skill:existing');
  assert.equal(first.level, 2);

  player.combat.cooldownReadyTickBySkillId['skill:existing'] = 12;
  const withCooldown = service.resolvePlayerSkillForCast(player as never, 'skill:existing', 10);
  assert.equal(withCooldown.readyTick, 12);

  player.combat.cooldownReadyTickBySkillId['skill:existing'] = 14;
  const refreshedCooldown = service.resolvePlayerSkillForCast(player as never, 'skill:existing', 10);
  assert.equal(refreshedCooldown.readyTick, 14);

  const existing = player.techniques.techniques[0]?.skills[1];
  if (!existing) {
    throw new Error('测试功法缺少 existing 技能');
  }
  existing.unlockLevel = 3;
  assert.throws(
    () => service.resolvePlayerSkillForCast(player as never, 'skill:existing', 10),
    /尚未解锁/,
  );
}

function main(): void {
  testNormalizationLookupPreservesFirstSkillAndRevisionInvalidation();
  testCombatLookupReadsCooldownAndTechniqueStateAfterCacheWarmup();
  console.log(JSON.stringify({
    ok: true,
    case: 'player-skill-lookup-cache',
  }));
}

main();

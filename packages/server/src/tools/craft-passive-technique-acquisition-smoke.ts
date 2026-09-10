import assert from 'node:assert/strict';

import type { CraftEffectSkillKind } from '@mud/shared';
import { ContentTemplateRepository } from '../content/content-template.repository';
import {
  computeCraftPassiveTechniqueAcquisitionProbability,
  resolveCraftPassiveGradeByActionLevel,
  tryAcquireCraftPassiveTechnique,
} from '../runtime/craft/craft-passive-technique-acquisition.helpers';

const ACTIVITY_KINDS: CraftEffectSkillKind[] = [
  'alchemy',
  'forging',
  'enhancement',
  'transmission',
  'gather',
  'mining',
  'building',
  'formation',
];

const GRADE_CASES: Array<{
  actionLevel: number;
  grade: 'mortal' | 'yellow' | 'mystic';
  idPrefix: string;
}> = [
  { actionLevel: 1, grade: 'mortal', idPrefix: 'passive_craft_mortal_mortal_' },
  { actionLevel: 23, grade: 'yellow', idPrefix: 'passive_craft_qi_yellow_' },
  { actionLevel: 31, grade: 'mystic', idPrefix: 'passive_craft_foundation_mystic_' },
];

function main(): void {
  verifyGradeBoundaries();
  verifyProbabilityFormula();
  verifyAllConfiguredBooksMaterialize();
  verifyCandidateCacheRefreshesAfterRepositoryReload();

  console.log(JSON.stringify({
    ok: true,
    case: 'craft-passive-technique-acquisition',
    techniqueKinds: ACTIVITY_KINDS.length,
    grades: GRADE_CASES.length,
    verifiedBooks: ACTIVITY_KINDS.length * GRADE_CASES.length,
    answers: '8 类技艺的凡人/黄阶/玄阶共 24 本标准被动功法书均能按行动等级选中、按公式判定并生成可用功法书；同一内容仓储热重载后候选缓存会换代。',
    excludes: '不做随机分布收敛统计，不启动完整玩家会话或数据库持久化链。',
  }, null, 2));
}

function verifyGradeBoundaries(): void {
  assert.equal(resolveCraftPassiveGradeByActionLevel(1), 'mortal');
  assert.equal(resolveCraftPassiveGradeByActionLevel(22), 'mortal');
  assert.equal(resolveCraftPassiveGradeByActionLevel(23), 'yellow');
  assert.equal(resolveCraftPassiveGradeByActionLevel(30), 'yellow');
  assert.equal(resolveCraftPassiveGradeByActionLevel(31), 'mystic');
  assert.equal(resolveCraftPassiveGradeByActionLevel(999), 'mystic');
}

function verifyProbabilityFormula(): void {
  assertApproxEqual(computeProbability('mortal'), 1 / (4 * 3600));
  assertApproxEqual(computeProbability('yellow'), 1 / (12 * 3600));
  assertApproxEqual(computeProbability('mystic'), 1 / (36 * 3600));
  assertApproxEqual(computeCraftPassiveTechniqueAcquisitionProbability({
    actionLevel: 1,
    skillLevel: 2,
    baseActionTicks: 5,
    grade: 'mortal',
    luck: 7,
  }), (5 / (2 * 4 * 3600)) * 1.07);
  assert.equal(computeCraftPassiveTechniqueAcquisitionProbability({
    actionLevel: 1,
    skillLevel: 1,
    baseActionTicks: Number.MAX_VALUE,
    grade: 'mortal',
    luck: 0,
  }), 1);
}

function verifyAllConfiguredBooksMaterialize(): void {
  const repository = new ContentTemplateRepository();
  repository.loadAll();
  const received: Array<Record<string, unknown>> = [];
  const runtime = {
    receiveInventoryItem(playerId: string, item: Record<string, unknown>): void {
      assert.equal(playerId, 'player:craft-passive-smoke');
      received.push(item);
    },
  };

  for (const activityKind of ACTIVITY_KINDS) {
    for (const gradeCase of GRADE_CASES) {
      received.length = 0;
      const expectedTechniqueId = `${gradeCase.idPrefix}${activityKind}`;
      const result = tryAcquireCraftPassiveTechnique({
        player: { playerId: 'player:craft-passive-smoke', luck: 0 },
        activityKind,
        actionLevel: gradeCase.actionLevel,
        skillLevel: 1,
        baseActionTicks: 1,
        actionCount: 1,
        contentTemplateRepository: repository,
        playerRuntimeService: runtime,
        random: () => 0,
      });

      assert.equal(result.acquiredCount, 1, `未命中技艺被动功法：${activityKind}/${gradeCase.grade}`);
      assert.equal(result.inventoryChanged, true);
      assert.equal(result.messages.length, 1);
      assert.equal(received.length, 1);
      assert.equal(received[0]?.itemId, `book.${expectedTechniqueId}`);
      assert.equal(received[0]?.type, 'skill_book');
      assert.equal(received[0]?.learnTechniqueId, expectedTechniqueId);
      assert.equal(repository.techniqueTemplates.has(expectedTechniqueId), true);
      assert.equal(repository.itemTemplates.has(`book.${expectedTechniqueId}`), true);
    }
  }
}

function verifyCandidateCacheRefreshesAfterRepositoryReload(): void {
  const techniqueTemplates = new Map<string, Record<string, unknown>>();
  let techniqueTemplateRevision = 1;
  const received: string[] = [];
  const repository = {
    techniqueTemplates,
    get techniqueTemplateRevision(): number {
      return techniqueTemplateRevision;
    },
    listTechniqueTemplates: () => Array.from(techniqueTemplates.values()),
    createItem: (itemId: string, count = 1) => ({ itemId, count, type: 'skill_book' }),
    normalizeItem: (item: Record<string, unknown>) => item,
  };
  const runtime = {
    receiveInventoryItem(_playerId: string, item: Record<string, unknown>): void {
      received.push(String(item.itemId));
    },
  };

  techniqueTemplates.set('passive_craft_reload_old', buildCandidate('passive_craft_reload_old', '旧炼丹心法'));
  acquireReloadCandidate(repository, runtime);

  techniqueTemplates.clear();
  techniqueTemplateRevision += 1;
  techniqueTemplates.set('passive_craft_reload_new', buildCandidate('passive_craft_reload_new', '新炼丹心法'));
  acquireReloadCandidate(repository, runtime);

  assert.deepEqual(received, [
    'book.passive_craft_reload_old',
    'book.passive_craft_reload_new',
  ]);
}

function acquireReloadCandidate(
  repository: {
    techniqueTemplateRevision: number;
    techniqueTemplates: Map<string, Record<string, unknown>>;
    listTechniqueTemplates: () => Array<Record<string, unknown>>;
    createItem: (itemId: string, count?: number) => Record<string, unknown>;
    normalizeItem: (item: Record<string, unknown>) => Record<string, unknown>;
  },
  runtime: { receiveInventoryItem: (playerId: string, item: Record<string, unknown>) => void },
): void {
  const result = tryAcquireCraftPassiveTechnique({
    player: { playerId: 'player:reload-smoke', luck: 0 },
    activityKind: 'alchemy',
    actionLevel: 1,
    skillLevel: 1,
    baseActionTicks: 1,
    actionCount: 1,
    contentTemplateRepository: repository,
    playerRuntimeService: runtime,
    random: () => 0,
  });
  assert.equal(result.acquiredCount, 1);
}

function buildCandidate(id: string, name: string): Record<string, unknown> {
  return {
    id,
    name,
    grade: 'mortal',
    skills: [{
      active: false,
      passiveEffects: [{ craftEffectStats: { alchemy: { speedRate: 0.08 } } }],
    }],
  };
}

function computeProbability(grade: 'mortal' | 'yellow' | 'mystic'): number {
  return computeCraftPassiveTechniqueAcquisitionProbability({
    actionLevel: 1,
    skillLevel: 1,
    baseActionTicks: 1,
    grade,
    luck: 0,
  });
}

function assertApproxEqual(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) <= 1e-15, `expected ${actual} ~= ${expected}`);
}

main();

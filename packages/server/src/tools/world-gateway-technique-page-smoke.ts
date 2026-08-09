import assert from 'node:assert/strict';
import { TechniqueRealm, fromWireTechniqueEntry, toWireTechniqueEntry } from '@mud/shared';
import { buildTechniquePagePayload } from '../network/world-gateway-technique.helper';

function createTechnique(input: {
  techId: string;
  name: string;
  realmLv: number;
  grade: 'mortal' | 'yellow' | 'mystic' | 'earth' | 'heaven' | 'spirit' | 'saint' | 'emperor';
  level: number;
  realm: TechniqueRealm;
  strengthPercent?: number;
}) {
  return {
    ...input,
    exp: 0,
    expToNext: 100,
    category: 'internal',
    skills: [],
    layers: Array.from({ length: 9 }, (_, index) => ({
      level: index + 1,
      expToNext: index === 8 ? 0 : 100,
    })),
  };
}

const player = {
  techniques: {
    revision: 7,
    techniques: [
      createTechnique({
        techId: 'low-realm-high-grade',
        name: '低境界帝阶功法',
        realmLv: 20,
        grade: 'emperor',
        level: 9,
        realm: TechniqueRealm.Perfection,
      }),
      createTechnique({
        techId: 'high-realm-low-grade',
        name: '高境界凡阶功法',
        realmLv: 60,
        grade: 'mortal',
        level: 1,
        realm: TechniqueRealm.Entry,
      }),
      createTechnique({
        techId: 'high-realm-high-grade-default',
        name: '高境界天阶基准功法',
        realmLv: 60,
        grade: 'heaven',
        level: 9,
        realm: TechniqueRealm.Perfection,
      }),
      createTechnique({
        techId: 'high-realm-high-grade-strong',
        name: '高境界天阶强功法',
        realmLv: 60,
        grade: 'heaven',
        level: 1,
        realm: TechniqueRealm.Entry,
        strengthPercent: 120,
      }),
      createTechnique({
        techId: 'high-realm-high-grade-weak',
        name: '高境界天阶弱功法',
        realmLv: 60,
        grade: 'heaven',
        level: 9,
        realm: TechniqueRealm.Perfection,
        strengthPercent: 80,
      }),
    ],
  },
};

const page = buildTechniquePagePayload(player, {
  category: 'all',
  status: 'all',
  offset: 0,
  limit: 4,
  requestId: 'technique-page-sort-smoke',
});

assert.deepEqual(
  page.items.map((entry) => entry.techId),
  [
    'high-realm-high-grade-strong',
    'high-realm-high-grade-default',
    'high-realm-high-grade-weak',
    'high-realm-low-grade',
  ],
  '功法分页必须在分页前依次按境界等级、品阶、强度降序，强度优先于当前修炼层数',
);
assert.equal(page.total, 5);
assert.equal(page.revision, 7);
assert.equal(page.items[0]?.strengthPercent, 120);
assert.equal(
  fromWireTechniqueEntry(toWireTechniqueEntry(page.items[0]!)).strengthPercent,
  120,
  '功法强度必须通过 protobuf 增量编解码完整保留',
);

console.log(JSON.stringify({
  ok: true,
  case: 'world-gateway-technique-page-sort',
  order: page.items.map((entry) => entry.techId),
}));

import assert from 'node:assert/strict';
import { TechniqueRealm } from '@mud/shared';
import { buildTechniquePagePayload } from '../network/world-gateway-technique.helper';

function createTechnique(input: {
  techId: string;
  name: string;
  realmLv: number;
  grade: 'mortal' | 'yellow' | 'mystic' | 'earth' | 'heaven' | 'spirit' | 'saint' | 'emperor';
  level: number;
  realm: TechniqueRealm;
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
        techId: 'high-realm-high-grade',
        name: '高境界天阶功法',
        realmLv: 60,
        grade: 'heaven',
        level: 1,
        realm: TechniqueRealm.Entry,
      }),
    ],
  },
};

const page = buildTechniquePagePayload(player, {
  category: 'all',
  status: 'all',
  offset: 0,
  limit: 2,
  requestId: 'technique-page-sort-smoke',
});

assert.deepEqual(
  page.items.map((entry) => entry.techId),
  ['high-realm-high-grade', 'high-realm-low-grade'],
  '功法分页必须先按境界等级降序，再按品阶降序，且排序必须发生在分页之前',
);
assert.equal(page.total, 3);
assert.equal(page.revision, 7);

console.log(JSON.stringify({
  ok: true,
  case: 'world-gateway-technique-page-sort',
  order: page.items.map((entry) => entry.techId),
}));

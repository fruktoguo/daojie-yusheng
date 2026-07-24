/** GM 手工功法构建、预算水合和幂等发布烟测。 */
import assert from 'node:assert/strict';
import type { GmCustomTechniqueInput, TechniqueTemplate } from '@mud/shared';
import type { Pool } from 'pg';

import { normalizeTechniqueTemplate } from '../content/content-template-utils';
import {
  publishGmCustomTechnique,
  type PublishGmCustomTechniqueInput,
} from '../persistence/gm-custom-technique-persistence';
import { buildGmCustomTechnique } from '../runtime/technique-generation/gm-custom-technique-builder';

const internalInput: GmCustomTechniqueInput = {
  name: '烟测归元诀',
  desc: '验证 GM 手工内功的预算展开。',
  category: 'internal',
  grade: 'mystic',
  realmLv: 31,
  maxLayer: 10,
  expDifficulty: 1,
  budgetPercent: 0.8,
  attrRatio: {
    constitution: 1,
    strength: 1,
  },
};

async function main(): Promise<void> {
  testBudgetAndTemplateHydration();
  testArtsExpansion();
  testStrictValidation();
  await testIdempotentPublish();
  console.log(JSON.stringify({
    ok: true,
    case: 'gm-custom-technique',
    assertions: [
      '强度倍率改变满层属性并被模板水合保留',
      '术法权重展开为正式 SkillDef',
      '未知字段和字符串数值被拒绝',
      '发布支持同请求重放并拒绝同键异请求和同名功法',
    ],
  }, null, 2));
}

function testBudgetAndTemplateHydration(): void {
  const weak = requireBuilt(buildGmCustomTechnique(internalInput, 'gen_gm_smoke_weak'));
  const strong = requireBuilt(buildGmCustomTechnique({ ...internalInput, budgetPercent: 1.2 }, 'gen_gm_smoke_strong'));
  assert.ok(sumAttributes(strong.fullLevelAttrs) > sumAttributes(weak.fullLevelAttrs));
  assert.ok(Number(strong.template.totalBudget) > Number(weak.template.totalBudget));

  const hydrated = normalizeTechniqueTemplate(strong.template) as TechniqueTemplate | null;
  assert.ok(hydrated);
  assert.equal(hydrated.budgetPercent, 1.2);
  assert.equal(hydrated.totalBudget, strong.template.totalBudget);
}

function testArtsExpansion(): void {
  const artsInput: GmCustomTechniqueInput = {
    name: '烟测流火术',
    desc: '验证 GM 手工术法的强度展开。',
    category: 'arts',
    grade: 'earth',
    realmLv: 40,
    maxLayer: 12,
    expDifficulty: 1.1,
    budgetPercent: 1.05,
    skills: [{
      name: '流火印',
      desc: '以灵力凝聚火印。',
      unlockLevel: 2,
      damageKind: 'spell',
      element: 'fire',
      target: { type: 'area', targetMode: 'any' },
      structureStrength: {
        damage: 100,
        cost: 40,
        cooldown: 30,
        chant: 10,
        castRange: 20,
        area: 30,
      },
      formulaStrength: {
        attributeBases: { spellAtk: 100, maxQi: 10 },
        percentBonuses: { techLevel: 15, moveSpeed: -5 },
      },
    }],
  };
  const built = requireBuilt(buildGmCustomTechnique(artsInput, 'gen_gm_smoke_arts'));
  const skill = built.template.skills?.[0];
  assert.ok(skill);
  assert.equal(skill.id, 'gen_gm_smoke_arts_skill_1');
  assert.ok(Array.isArray(skill.effects) && skill.effects.length > 0);
  assert.equal('structureStrength' in (skill as unknown as Record<string, unknown>), false);
  assert.ok('artsStrength' in built.validationReport);
}

function testStrictValidation(): void {
  const unknownField = buildGmCustomTechnique({ ...internalInput, unexpected: true }, 'gen_gm_smoke_invalid');
  assert.equal(unknownField.ok, false);
  if (unknownField.ok === false) {
    assert.ok(unknownField.errors.some((entry) => entry.field === 'technique.unexpected'));
  }

  const stringNumber = buildGmCustomTechnique({ ...internalInput, realmLv: '31' }, 'gen_gm_smoke_string');
  assert.equal(stringNumber.ok, false);
  if (stringNumber.ok === false) {
    assert.ok(stringNumber.errors.some((entry) => entry.field === 'realmLv'));
  }
}

async function testIdempotentPublish(): Promise<void> {
  const built = requireBuilt(buildGmCustomTechnique(internalInput, 'gen_gm_smoke_publish'));
  const database = new FakeGeneratedTechniqueDatabase();
  const input: PublishGmCustomTechniqueInput = {
    id: built.template.id,
    generationId: 'gmop_smoke_operation',
    operationId: 'smoke-operation',
    requestFingerprint: 'fingerprint-a',
    template: built.template,
    schemaVersion: 1,
    createdByPlayerId: 'gm_manual',
    normalizedName: '烟测归元诀',
    validationReport: {
      ...built.validationReport,
      manual: { requestFingerprint: 'fingerprint-a' },
    },
  };
  const created = await publishGmCustomTechnique(database.pool, input);
  assert.deepEqual(created, { ok: true, created: true, techniqueId: built.template.id });

  const replayed = await publishGmCustomTechnique(database.pool, input);
  assert.deepEqual(replayed, { ok: true, created: false, techniqueId: built.template.id });

  const operationConflict = await publishGmCustomTechnique(database.pool, {
    ...input,
    requestFingerprint: 'fingerprint-b',
  });
  assert.deepEqual(operationConflict, { ok: false, errorCode: 'OPERATION_CONFLICT' });

  const nameConflict = await publishGmCustomTechnique(database.pool, {
    ...input,
    id: 'gen_gm_smoke_publish_2',
    generationId: 'gmop_smoke_operation_2',
    operationId: 'smoke-operation-2',
    requestFingerprint: 'fingerprint-c',
  });
  assert.deepEqual(nameConflict, { ok: false, errorCode: 'NAME_CONFLICT' });
  assert.ok(database.queries.filter((query) => query.includes('pg_advisory_xact_lock')).length >= 5);
}

function requireBuilt(result: ReturnType<typeof buildGmCustomTechnique>) {
  if (result.ok === false) {
    throw new Error(`GM 手工功法烟测构建失败：${JSON.stringify(result.errors)}`);
  }
  return result;
}

function sumAttributes(attrs: Record<string, number> | undefined): number {
  return Object.values(attrs ?? {}).reduce((sum, value) => sum + value, 0);
}

interface StoredTechniqueRow {
  id: string;
  generationId: string;
  normalizedName: string;
  requestFingerprint: string;
}

class FakeGeneratedTechniqueDatabase {
  readonly rows: StoredTechniqueRow[] = [];
  readonly queries: string[] = [];
  readonly pool = {
    connect: async () => ({
      query: async (sql: unknown, params: unknown[] = []) => this.query(String(sql), params),
      release: () => undefined,
    }),
  } as unknown as Pool;

  private query(sql: string, params: unknown[]): { rows: unknown[]; rowCount: number } {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    this.queries.push(normalized);
    if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
      return { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith('SELECT pg_advisory_xact_lock')) {
      return { rows: [{}], rowCount: 1 };
    }
    if (normalized.includes('WHERE id = $1')) {
      const matches = this.rows.filter((row) => row.id === params[0]).slice(0, 1);
      return {
        rows: matches.map((row) => ({
          id: row.id,
          generation_id: row.generationId,
          request_fingerprint: row.requestFingerprint,
        })),
        rowCount: matches.length,
      };
    }
    if (normalized.includes('WHERE normalized_name = $1')) {
      const row = this.rows.find((entry) => entry.normalizedName === params[0]);
      return { rows: row ? [{ id: row.id }] : [], rowCount: row ? 1 : 0 };
    }
    if (normalized.startsWith('INSERT INTO generated_technique')) {
      const report = JSON.parse(String(params[7] ?? '{}')) as { manual?: { requestFingerprint?: string } };
      this.rows.push({
        id: String(params[0]),
        generationId: String(params[1]),
        normalizedName: String(params[5]),
        requestFingerprint: report.manual?.requestFingerprint ?? '',
      });
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`未处理的 GM 手工功法烟测 SQL：${normalized}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

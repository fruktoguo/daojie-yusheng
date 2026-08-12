/**
 * 自创术法吟唱归零转换 smoke。
 *
 * 使用内存假池验证范围隔离、目标指纹、事务更新、缓存刷新和重复执行幂等性。
 */
import assert from 'node:assert/strict';

import {
  expandTechniqueArtsStrengthSkill,
  normalizeTechniqueArtsStrengthSkill,
} from '@mud/shared';
import type { Pool } from 'pg';

import { ZeroPublishedGeneratedTechniqueChantConversion } from '../gm/compat-conversions/conversions/technique/zero-published-generated-technique-chant';
import type { GeneratedTechniqueStoreService } from '../runtime/technique-generation/generated-technique-store.service';

type StoredTechniqueRow = Record<string, unknown> & {
  id: string;
  status: string;
  is_published: boolean;
  template: Record<string, unknown>;
  validation_report: Record<string, unknown>;
};

class FakeGeneratedTechniquePool {
  rows: StoredTechniqueRow[];
  updateCount = 0;
  commitCount = 0;
  rollbackCount = 0;
  conflictOnUpdateId: string | null = null;
  private backup: StoredTechniqueRow[] | null = null;

  constructor(rows: StoredTechniqueRow[]) {
    this.rows = structuredClone(rows);
  }

  asPool(): Pool {
    return {
      query: async (sql: unknown) => this.query(String(sql)),
      connect: async () => ({
        query: async (sql: unknown, params?: unknown[]) => this.clientQuery(String(sql), params ?? []),
        release: () => undefined,
      }),
    } as unknown as Pool;
  }

  private query(sql: string): { rows: Array<Record<string, unknown>>; rowCount: number } {
    const normalized = normalizeSql(sql);
    if (normalized.includes('FROM generated_technique') && normalized.includes("status = 'published'")) {
      const rows = this.rows
        .filter((row) => row.status === 'published' && row.is_published)
        .map((row) => structuredClone(row));
      return { rows, rowCount: rows.length };
    }
    return { rows: [], rowCount: 0 };
  }

  private clientQuery(
    sql: string,
    params: unknown[],
  ): { rows: Array<Record<string, unknown>>; rowCount: number } {
    const normalized = normalizeSql(sql);
    if (normalized === 'BEGIN') {
      this.backup = structuredClone(this.rows);
      return { rows: [], rowCount: 0 };
    }
    if (normalized === 'COMMIT') {
      this.backup = null;
      this.commitCount += 1;
      return { rows: [], rowCount: 0 };
    }
    if (normalized === 'ROLLBACK') {
      if (this.backup) {
        this.rows = this.backup;
      }
      this.backup = null;
      this.rollbackCount += 1;
      return { rows: [], rowCount: 0 };
    }
    if (!normalized.startsWith('UPDATE generated_technique')) {
      return { rows: [], rowCount: 0 };
    }

    const row = this.rows.find((entry) => entry.id === String(params[0] ?? ''));
    const expectedTemplate = JSON.parse(String(params[3] ?? '{}')) as Record<string, unknown>;
    const expectedValidationReport = JSON.parse(String(params[4] ?? '{}')) as Record<string, unknown>;
    if (
      !row
      || row.id === this.conflictOnUpdateId
      || row.status !== 'published'
      || !row.is_published
      || JSON.stringify(row.template) !== JSON.stringify(expectedTemplate)
      || JSON.stringify(row.validation_report) !== JSON.stringify(expectedValidationReport)
    ) {
      return { rows: [], rowCount: 0 };
    }
    row.template = JSON.parse(String(params[1] ?? '{}')) as Record<string, unknown>;
    row.validation_report = JSON.parse(String(params[2] ?? '{}')) as Record<string, unknown>;
    this.updateCount += 1;
    return { rows: [], rowCount: 1 };
  }
}

async function main(): Promise<void> {
  const chanting = createTechniqueRow('gen_chanting', 'published', true, -100, true);
  const instant = createTechniqueRow('gen_instant', 'published', true, 0, false);
  const staleWithoutCast = createTechniqueRow('gen_stale_without_cast', 'published', true, -100, false);
  const draft = createTechniqueRow('gen_draft', 'draft', false, -100, true);
  const beforeEffects = structuredClone(readSkill(chanting).effects);
  const fakePool = new FakeGeneratedTechniquePool([chanting, instant, staleWithoutCast, draft]);
  let refreshCount = 0;
  const conversion = new ZeroPublishedGeneratedTechniqueChantConversion(
    { getPool: () => fakePool.asPool() } as never,
    null,
    { refreshAfterPublish: async () => { refreshCount += 1; } } as unknown as GeneratedTechniqueStoreService,
  );

  const dryRun = await conversion.run({ mode: 'dry-run' });
  assert.equal(dryRun.matchedRows, 1);
  assert.equal(dryRun.convertedRows, 1);
  assert.equal(dryRun.skippedRows, 2);
  assert.equal(dryRun.failedRows, 0);
  assert.equal(dryRun.targetedSkills, 1);
  assert.deepEqual(dryRun.targetIds, ['gen_chanting']);
  assert.match(dryRun.targetFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(fakePool.updateCount, 0);
  const commitsBeforeApply = fakePool.commitCount;
  const rollbacksBeforeApply = fakePool.rollbackCount;

  await assert.rejects(
    conversion.run({ mode: 'apply' }),
    (error: unknown) => readErrorCode(error) === 'INVALID_GENERATED_TECHNIQUE_CHANT_ZERO_FINGERPRINT',
  );
  await assert.rejects(
    conversion.run({
      mode: 'apply',
      expectedMatchedRows: 1,
      expectedTargetFingerprint: '0'.repeat(64),
    }),
    (error: unknown) => readErrorCode(error) === 'GENERATED_TECHNIQUE_CHANT_ZERO_TARGET_DRIFT',
  );
  assert.equal(fakePool.updateCount, 0);

  const applied = await conversion.run({
    mode: 'apply',
    expectedMatchedRows: dryRun.matchedRows,
    expectedTargetFingerprint: dryRun.targetFingerprint,
  });
  assert.equal(applied.convertedRows, 1);
  assert.equal(applied.verifiedRows, 1);
  assert.equal(fakePool.updateCount, 1);
  assert.equal(fakePool.commitCount, commitsBeforeApply + 1);
  assert.equal(fakePool.rollbackCount, rollbacksBeforeApply);
  assert.equal(refreshCount, 1);

  const updated = fakePool.rows.find((row) => row.id === 'gen_chanting');
  assert.ok(updated);
  assert.equal(readRawChantWeight(updated), 0);
  assert.equal(readWindupTicks(readSkill(updated)), 0);
  assert.notDeepEqual(readSkill(updated).effects, beforeEffects);
  const migration = readRecord(readRecord(updated.validation_report.artsStrength).migration);
  const marker = readRecord(migration.zeroPublishedGeneratedTechniqueChant);
  const previousSkills = Array.isArray(marker.previousSkills) ? marker.previousSkills : [];
  assert.equal(readRecord(previousSkills[0]).chantWeight, -100);
  assert.equal(readRecord(previousSkills[0]).windupTicks, readWindupTicks(readSkill(chanting)));
  assert.equal(readRawChantWeight(fakePool.rows.find((row) => row.id === 'gen_stale_without_cast')), -100);
  assert.equal(readRawChantWeight(fakePool.rows.find((row) => row.id === 'gen_draft')), -100);

  const repeated = await conversion.run({ mode: 'dry-run' });
  assert.equal(repeated.matchedRows, 0);
  assert.equal(repeated.convertedRows, 0);
  assert.equal(repeated.failedRows, 0);
  assert.equal(repeated.skippedRows, 3);
  assert.deepEqual(repeated.targetIds, []);

  const rollbackPool = new FakeGeneratedTechniquePool([
    createTechniqueRow('gen_rollback_a', 'published', true, -100, true),
    createTechniqueRow('gen_rollback_b', 'published', true, -100, true),
  ]);
  let rollbackRefreshCount = 0;
  const rollbackConversion = new ZeroPublishedGeneratedTechniqueChantConversion(
    { getPool: () => rollbackPool.asPool() } as never,
    null,
    { refreshAfterPublish: async () => { rollbackRefreshCount += 1; } } as unknown as GeneratedTechniqueStoreService,
  );
  const rollbackDryRun = await rollbackConversion.run({ mode: 'dry-run' });
  rollbackPool.conflictOnUpdateId = 'gen_rollback_b';
  await assert.rejects(
    rollbackConversion.run({
      mode: 'apply',
      expectedMatchedRows: rollbackDryRun.matchedRows,
      expectedTargetFingerprint: rollbackDryRun.targetFingerprint,
    }),
    (error: unknown) => readErrorCode(error) === 'GENERATED_TECHNIQUE_CHANT_ZERO_ROW_DRIFT',
  );
  assert.equal(rollbackPool.rollbackCount, 1);
  assert.equal(rollbackRefreshCount, 0);
  assert.equal(readRawChantWeight(rollbackPool.rows.find((row) => row.id === 'gen_rollback_a')), -100);
  assert.equal(readRawChantWeight(rollbackPool.rows.find((row) => row.id === 'gen_rollback_b')), -100);

  console.log(JSON.stringify({
    ok: true,
    case: 'generated-technique-chant-zero-conversion',
    targetFingerprint: dryRun.targetFingerprint,
  }, null, 2));
}

function createTechniqueRow(
  id: string,
  status: string,
  isPublished: boolean,
  chantWeight: number,
  persistPlayerCast: boolean,
): StoredTechniqueRow {
  const rawCandidate = {
    name: `${id}功法`,
    desc: '用于验证自创术法吟唱归零转换。',
    grade: 'heaven',
    category: 'arts',
    realmLv: 42,
    maxLayer: 9,
    budgetPercent: 1,
    totalBudget: 80,
    skills: [{
      name: `${id}术法`,
      desc: '以术法权重验证正式模板重算。',
      unlockLevel: 1,
      damageKind: 'spell',
      element: 'fire',
      target: { type: 'area', castRangeWeight: 20, areaWeight: 20 },
      structureStrength: {
        damage: 80,
        cost: -10,
        cooldown: 20,
        chant: chantWeight,
        castRange: 20,
        area: 20,
      },
      formulaStrength: { attributeBases: { spellAtk: 100 } },
    }],
  };
  const skill = expandTechniqueArtsStrengthSkill({
    techniqueId: id,
    grade: 'heaven',
    realmLv: 42,
    skillIndex: 0,
    skill: normalizeTechniqueArtsStrengthSkill(rawCandidate.skills[0]),
    targetBudget: rawCandidate.totalBudget,
  }).skill;
  if (!persistPlayerCast) {
    delete skill.playerCast;
  }
  return {
    id,
    status,
    is_published: isPublished,
    display_name: rawCandidate.name,
    grade: rawCandidate.grade,
    realm_lv: rawCandidate.realmLv,
    template: {
      id,
      name: rawCandidate.name,
      grade: rawCandidate.grade,
      category: rawCandidate.category,
      realmLv: rawCandidate.realmLv,
      maxLayer: rawCandidate.maxLayer,
      budgetPercent: rawCandidate.budgetPercent,
      totalBudget: rawCandidate.totalBudget,
      skills: [skill],
    },
    validation_report: {
      artsStrength: {
        version: 2,
        rawCandidate,
      },
    },
  };
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function readSkill(row: StoredTechniqueRow): Record<string, unknown> {
  const skills = Array.isArray(row.template.skills) ? row.template.skills : [];
  return readRecord(skills[0]);
}

function readRawChantWeight(row: StoredTechniqueRow | undefined): number {
  const report = readRecord(row?.validation_report);
  const artsStrength = readRecord(report.artsStrength);
  const rawCandidate = readRecord(artsStrength.rawCandidate);
  const skills = Array.isArray(rawCandidate.skills) ? rawCandidate.skills : [];
  const skill = readRecord(skills[0]);
  const structureStrength = readRecord(skill.structureStrength);
  return Number(structureStrength.chant ?? 0);
}

function readWindupTicks(skill: Record<string, unknown>): number {
  return Number(readRecord(skill.playerCast).windupTicks ?? 0);
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('getResponse' in error)) {
    return null;
  }
  const response = (error as { getResponse: () => unknown }).getResponse();
  return typeof response === 'object' && response !== null && 'code' in response
    ? String((response as { code?: unknown }).code ?? '')
    : null;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

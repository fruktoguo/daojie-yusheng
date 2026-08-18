/** GM 手工功法构建、预算水合和幂等发布烟测。 */
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';

import {
  TECHNIQUE_ARTS_STRENGTH_SCALAR_PERCENT_BONUS_KEYS,
  TECHNIQUE_ARTS_STRENGTH_SCALAR_PERCENT_BONUS_SOURCE_BY_KEY,
  calculateTechniqueArtsStrengthPercentBonusSynergy,
  type GmCustomTechniqueInput,
  type SkillFormula,
  type SkillFormulaVar,
  type TechniqueTemplate,
} from '@mud/shared';
import type { Pool } from 'pg';

import { normalizeTechniqueTemplate } from '../content/content-template-utils';
import { preferStoredCustomTechniquePreview } from '../http/native/native-gm-generated-technique.service';
import {
  publishGmCustomTechnique,
  type PublishGmCustomTechniqueInput,
} from '../persistence/gm-custom-technique-persistence';
import type {
  ContentTemplateRepositoryLike,
  MapTemplateRepositoryLike,
  MarketRuntimeServiceLike,
  NativeManagedAccountServiceLike,
  PlayerDomainPersistenceServiceLike,
  PlayerProgressionServiceLike,
  PlayerRuntimeServiceLike,
  WorldRuntimeServiceLike,
} from '../http/native/native-gm-player.ports';

import { NativeGmPlayerService } from '../http/native/native-gm-player.service';

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
  testPercentBonusSynergyBalance();
  testPercentBonusRefundPreservesRatio();
  testArtsExpansion();
  testGeneratedLineTargetingCoverage();
  testNegativeChantExpansion();
  testStrictValidation();
  testIdempotentPreviewUsesStoredTruth();
  await testLegacyGeneratedTechniqueRejectsReadableGmPlayerSave();

  await testIdempotentPublish();
  console.log(JSON.stringify({
    ok: true,
    case: 'gm-custom-technique',
    assertions: [
      '强度倍率改变满层属性并被模板水合保留',
      '百分比组合倍率按配比平衡度连续衰减并封顶',
      '触顶回流保持百分比来源原始正权重比例',
      '术法权重展开为正式 SkillDef',
      '自创直线术法按线长乘宽度生成最大目标数',
      '负吟唱预算展开为正式玩家吟唱并通过模板水合保留',
      '未知字段和字符串数值被拒绝',
      '幂等重放返回数据库已发布模板而非重新计算预览',
      '发布支持同请求重放并拒绝同键异请求和同名功法',
      '旧版自创术法写入玩家功法时返回可读 400 而不是未知错误',

    ],
  }, null, 2));
}

function testGeneratedLineTargetingCoverage(): void {
  const built = requireBuilt(buildGmCustomTechnique({
    name: '直线覆盖烟测术',
    category: 'arts',
    grade: 'spirit',
    realmLv: 36,
    maxLayer: 9,
    expDifficulty: 1,
    budgetPercent: 1.2,
    skills: [{
      name: '九曜横断',
      unlockLevel: 1,
      damageKind: 'spell',
      target: { type: 'line' },
      structureStrength: {
        damage: 1,
        cost: 0,
        cooldown: 0,
        chant: 0,
        castRange: -100,
        area: 100,
      },
      formulaStrength: { attributeBases: { spellAtk: 1 } },
    }],
  }, 'gen_gm_smoke_line_strip'));
  assert.deepEqual(built.template.skills?.[0]?.targeting, {
    shape: 'line',
    range: 1,
    width: 9,
    maxTargets: 9,
  });
}

function testPercentBonusRefundPreservesRatio(): void {
  const built = requireBuilt(buildGmCustomTechnique({
    name: '比例回流烟测术',
    category: 'arts',
    grade: 'earth',
    realmLv: 43,
    maxLayer: 9,
    expDifficulty: 1,
    budgetPercent: 1,
    skills: [{
      name: '比例回流烟测',
      unlockLevel: 1,
      damageKind: 'spell',
      target: { type: 'single' },
      structureStrength: { damage: 0, cost: 0, cooldown: 0, chant: 0, castRange: 0, area: 100 },
      formulaStrength: {
        attributeBases: { spellAtk: 1 },
        percentBonuses: { moveSpeed: 100, realmLevel: 1 },
      },
    }],
  }, 'gen_gm_smoke_ratio_refund'));
  const report = built.validationReport.artsStrength as {
    expansion?: Array<{
      budgetBreakdown?: {
        percentBonusSynergy?: { multiplier?: number };
        items?: Array<{ key?: string; allocatedBudget?: number }>;
      };
    }>;
  };
  const breakdown = report.expansion?.[0]?.budgetBreakdown;
  const moveSpeedBudget = breakdown?.items?.find((item) => item.key === 'formula.percentBonuses.moveSpeed')?.allocatedBudget ?? 0;
  const realmLevelBudget = breakdown?.items?.find((item) => item.key === 'formula.percentBonuses.realmLevel')?.allocatedBudget ?? 0;
  assert.ok(moveSpeedBudget > 0 && realmLevelBudget > 0);
  assertApprox(moveSpeedBudget / realmLevelBudget, 100, 0.001);
  assert.ok((breakdown?.percentBonusSynergy?.multiplier ?? 2) < 1.01);
}

function testPercentBonusSynergyBalance(): void {
  assert.deepEqual(calculateTechniqueArtsStrengthPercentBonusSynergy({}), {
    sourceCount: 0,
    cappedSourceCount: 0,
    coefficientOfVariation: 0,
    balanceFactor: 0,
    maximumMultiplier: 1,
    multiplier: 1,
  });
  assert.deepEqual(calculateTechniqueArtsStrengthPercentBonusSynergy({ moveSpeed: 1 }), {
    sourceCount: 1,
    cappedSourceCount: 1,
    coefficientOfVariation: 0,
    balanceFactor: 1,
    maximumMultiplier: 1,
    multiplier: 1,
  });
  assert.equal(calculateTechniqueArtsStrengthPercentBonusSynergy({
    moveSpeed: 1,
    realmLevel: 1,
  }).multiplier, 1.1);
  assert.equal(calculateTechniqueArtsStrengthPercentBonusSynergy({
    moveSpeed: 1,
    realmLevel: 1,
    alchemyLevel: 1,
  }).multiplier, 1.3);
  assert.equal(calculateTechniqueArtsStrengthPercentBonusSynergy({
    moveSpeed: 1,
    realmLevel: 1,
    alchemyLevel: 1,
    forgingLevel: 1,
    enhancementLevel: 1,
  }).multiplier, 2);

  const forcedTinySource = calculateTechniqueArtsStrengthPercentBonusSynergy({
    moveSpeed: 1.99,
    realmLevel: 0.01,
  });
  assert.ok(forcedTinySource.multiplier < 1.01, '极小凑项不得获得有意义的组合增幅');

  const severelyUnbalancedFiveSources = calculateTechniqueArtsStrengthPercentBonusSynergy({
    moveSpeed: 100,
    realmLevel: 1,
    alchemyLevel: 1,
    forgingLevel: 1,
    enhancementLevel: 1,
  });
  assert.equal(severelyUnbalancedFiveSources.sourceCount, 5);
  assert.equal(severelyUnbalancedFiveSources.balanceFactor, 0);
  assert.equal(severelyUnbalancedFiveSources.multiplier, 1);
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
      target: { type: 'area' },
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
        percentBonuses: {
          techLevel: 0,
          moveSpeed: 10,
          realmLevel: 10,
          alchemyLevel: 10,
          forgingLevel: 10,
          enhancementLevel: 10,
          transmissionLevel: 10,
          gatherLevel: 10,
          miningLevel: 10,
          buildingLevel: 10,
          formationLevel: 10,
        },
      },
    }],
  };
  const built = requireBuilt(buildGmCustomTechnique(artsInput, 'gen_gm_smoke_arts'));
  const skill = built.template.skills?.[0];
  assert.ok(skill);
  assert.equal(skill.id, 'gen_gm_smoke_arts_skill_1');
  assert.ok(Array.isArray(skill.effects) && skill.effects.length > 0);
  assert.equal(skill.playerCast, undefined, '正吟唱预算触底回流后仍应保持瞬发');
  assert.equal('structureStrength' in (skill as unknown as Record<string, unknown>), false);
  assert.ok('artsStrength' in built.validationReport);
  const artsStrengthReport = built.validationReport.artsStrength as {
    expansion?: Array<{
      budgetBreakdown?: {
        percentBonusSynergy?: { sourceCount?: number; cappedSourceCount?: number; multiplier?: number };
        items?: Array<{ key?: string; allocatedBudget?: number }>;
      };
    }>;
  };
  const budgetBreakdown = artsStrengthReport.expansion?.[0]?.budgetBreakdown;
  const synergy = budgetBreakdown?.percentBonusSynergy;
  assert.equal(synergy?.sourceCount, 10);
  assert.equal(synergy?.cappedSourceCount, 5);
  assert.equal(synergy?.multiplier, 2);
  const formula = skill.effects?.[0]?.type === 'damage' ? skill.effects[0].formula : undefined;
  const moveSpeedScale = extractFormulaVarScale(formula, 'caster.stat.moveSpeed');
  assert.ok(moveSpeedScale > 0);
  const moveSpeedBudget = budgetBreakdown?.items?.find((item) => item.key === 'formula.percentBonuses.moveSpeed')?.allocatedBudget ?? 0;
  assertApprox(moveSpeedScale, moveSpeedBudget * 0.001 * 2, 0.000001);
  assert.equal(extractFormulaVarScale(formula, 'techLevel'), 0.1, '层数基础10%不得被组合倍率放大');
  for (const key of TECHNIQUE_ARTS_STRENGTH_SCALAR_PERCENT_BONUS_KEYS) {
    const source = TECHNIQUE_ARTS_STRENGTH_SCALAR_PERCENT_BONUS_SOURCE_BY_KEY[key];
    const actualScale = extractFormulaVarScale(formula, source.formulaVar);
    assert.ok(actualScale > 0, `${key} 应展开为正式公式变量`);
    assertApprox(actualScale / moveSpeedScale, source.moveSpeedEquivalent, 0.05);
  }
}

function testNegativeChantExpansion(): void {
  const built = requireBuilt(buildGmCustomTechnique({
    name: '烟测蓄雷术',
    desc: '验证负吟唱预算会形成真实施法前摇。',
    category: 'arts',
    grade: 'heaven',
    realmLv: 40,
    maxLayer: 9,
    expDifficulty: 1,
    budgetPercent: 1,
    skills: [{
      name: '蓄雷一击',
      desc: '长久蓄势后引雷轰击目标。',
      unlockLevel: 1,
      damageKind: 'spell',
      element: 'fire',
      target: { type: 'single' },
      structureStrength: {
        damage: 100,
        cost: 0,
        cooldown: 0,
        chant: -100,
        castRange: 0,
        area: 0,
      },
      formulaStrength: {
        attributeBases: { spellAtk: 100 },
      },
    }],
  }, 'gen_gm_smoke_chant'));
  const skill = built.template.skills?.[0];
  assert.ok(skill);
  const report = built.validationReport.artsStrength as {
    expansion?: Array<{
      budgetBreakdown?: {
        items?: Array<{ key?: string; usedBudget?: number; value?: number }>;
      };
    }>;
  };
  const chantItem = report.expansion?.[0]?.budgetBreakdown?.items?.find((item) => item.key === 'structure.chant');
  const expectedWindupTicks = Math.round(Math.abs(chantItem?.usedBudget ?? 0));
  assert.ok(expectedWindupTicks > 0, '负吟唱权重必须分配到真实负预算');
  assert.equal(chantItem?.value, expectedWindupTicks);
  assert.equal(skill.playerCast?.windupTicks, expectedWindupTicks);

  const hydrated = normalizeTechniqueTemplate(built.template) as TechniqueTemplate | null;
  assert.equal(hydrated?.skills?.[0]?.playerCast?.windupTicks, expectedWindupTicks);
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

  const removedTargetMode = buildGmCustomTechnique({
    name: '旧目标模式烟测术',
    category: 'arts',
    grade: 'mystic',
    realmLv: 31,
    maxLayer: 9,
    expDifficulty: 1,
    budgetPercent: 1,
    skills: [{
      name: '旧目标模式',
      unlockLevel: 1,
      damageKind: 'spell',
      target: { type: 'single', targetMode: 'entity' },
      structureStrength: { damage: 1, cost: 0, cooldown: 0, chant: 0, castRange: 0, area: 0 },
      formulaStrength: { attributeBases: { spellAtk: 1 } },
    }],
  }, 'gen_gm_smoke_removed_target_mode');
  assert.equal(removedTargetMode.ok, false);
  if (removedTargetMode.ok === false) {
    assert.ok(removedTargetMode.errors.some((entry) => entry.field === 'skills[0].target.targetMode'));
  }

  const negativePercentBonus = buildGmCustomTechnique({
    name: '负权重烟测术',
    category: 'arts',
    grade: 'mystic',
    realmLv: 31,
    maxLayer: 9,
    expDifficulty: 1,
    budgetPercent: 1,
    skills: [{
      name: '负权重烟测',
      unlockLevel: 1,
      damageKind: 'spell',
      target: { type: 'single' },
      structureStrength: { damage: 1, cost: 0, cooldown: 0, chant: 0, castRange: 0, area: 0 },
      formulaStrength: {
        attributeBases: { spellAtk: 1 },
        percentBonuses: { moveSpeed: -1 },
      },
    }],
  }, 'gen_gm_smoke_negative_percent');
  assert.equal(negativePercentBonus.ok, false);
  if (negativePercentBonus.ok === false) {
    assert.ok(negativePercentBonus.errors.some((entry) => (
      entry.field === 'skills[0].formulaStrength.percentBonuses.moveSpeed'
      && entry.message.includes('0 到 100')
    )));
  }
}

function testIdempotentPreviewUsesStoredTruth(): void {
  const built = requireBuilt(buildGmCustomTechnique(internalInput, 'gen_gm_smoke_preview_truth'));
  const recomputedPreview = {
    template: built.template,
    expandedLayers: built.expandedLayers,
    fullLevelAttrs: built.fullLevelAttrs,
    validationReport: built.validationReport,
  };
  const storedTemplate = structuredClone(built.template);
  storedTemplate.name = '已发布修订版归元诀';
  const storedValidationReport = { source: 'stored_revision' };
  const replayPreview = preferStoredCustomTechniquePreview(recomputedPreview, {
    template: storedTemplate,
    validationReport: storedValidationReport,
  });

  assert.equal(replayPreview.template.name, '已发布修订版归元诀');
  assert.deepEqual(replayPreview.validationReport, storedValidationReport);
  assert.deepEqual(replayPreview.expandedLayers, built.expandedLayers);
  assert.strictEqual(preferStoredCustomTechniquePreview(recomputedPreview, null), recomputedPreview);
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

async function testLegacyGeneratedTechniqueRejectsReadableGmPlayerSave(): Promise<void> {
  const persistence: PlayerDomainPersistenceServiceLike = {
    loadProjectedSnapshot: async () => ({
      techniques: {
        revision: 1,
        cultivatingTechId: null,
        techniques: [],
      },
      combat: {
        autoBattleSkills: [],
      },
    }),
    savePlayerSnapshotProjectionDomains: async () => {
      throw new Error('旧版自创术法拒绝路径不应落库');
    },
    listProjectedSnapshots: async () => [],
  };
  const contentTemplateRepository: ContentTemplateRepositoryLike = {
    createItem: () => null,
    getItemName: () => null,
    normalizeItem: (input: unknown) => input,
    hydrateTechniqueState: () => {
      throw new Error('生成功法模板 gen_legacy_raw 含 artsStrength/raw* 旧草稿字段，请先执行显式兼容转换');
    },
  };
  const mapTemplateRepository: MapTemplateRepositoryLike = {
    getOrThrow: () => ({}),
  };
  const playerProgressionService: PlayerProgressionServiceLike = {
    createRealmStateFromLevel: (realmLv: number, progress: number) => ({ realmLv, progress }),
    initializePlayer: () => undefined,
  };
  const playerRuntimeService: PlayerRuntimeServiceLike = {
    snapshot: () => null,
    buildStarterPersistenceSnapshot: () => null,
    buildPersistenceSnapshot: () => null,
    restoreSnapshot: () => undefined,
    listPlayerSnapshots: () => [],
    rebuildActionState: () => undefined,
    refreshOnlineTechniqueTemplates: () => ({}),
    getPersistenceRevision: () => null,
    markPersisted: () => undefined,
    setManagedBodyTrainingLevel: () => ({}),
  };
  const marketRuntimeService: MarketRuntimeServiceLike = {
    getStorage: () => ({ items: [] }),
    runExclusiveMarketMutation: async (_playerId, action) => action({}),
    setStorage: () => undefined,
  };
  const worldRuntimeService: WorldRuntimeServiceLike = {
    worldRuntimeCommandIntakeFacadeService: {
      enqueueGmUpdatePlayer: () => undefined,
      enqueueGmResetPlayer: () => undefined,
      enqueueGmSpawnBots: () => undefined,
      enqueueGmRemoveBots: () => undefined,
    },
  };
  const managedAccountService: NativeManagedAccountServiceLike = {
    getManagedAccountIndex: async () => new Map(),
  };
  const service = new NativeGmPlayerService(
    contentTemplateRepository,
    mapTemplateRepository,
    persistence,
    playerProgressionService,
    playerRuntimeService,
    marketRuntimeService,
    worldRuntimeService,
    managedAccountService,
    null,
    null,
    null,
  );

  await assert.rejects(
    () => service.updatePlayer('gm-smoke-player', {
      section: 'techniques',
      snapshot: {
        techniques: [{ techId: 'gen_legacy_raw', level: 1, exp: 0, expToNext: 0, realmLv: 31 }],
        autoBattleSkills: [],
        cultivatingTechId: null,
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.match(error.message, /迁移旧版AI术法草稿/);
      assert.match(error.message, /gen_legacy_raw/);
      return true;
    },
  );
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

function extractFormulaVarScale(formula: SkillFormula | undefined, varName: SkillFormulaVar): number {
  if (formula === undefined || typeof formula === 'number') {
    return 0;
  }
  if ('var' in formula) {
    return formula.var === varName ? Number(formula.scale ?? 1) : 0;
  }
  if ('args' in formula) {
    for (const child of formula.args) {
      const scale = extractFormulaVarScale(child, varName);
      if (scale !== 0) return scale;
    }
  }
  if ('value' in formula) {
    return extractFormulaVarScale(formula.value, varName);
  }
  return 0;
}

function assertApprox(actual: number, expected: number, epsilon: number): void {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} is not within ${epsilon} of ${expected}`);
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

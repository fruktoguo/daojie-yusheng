/**
 * 本文件是可执行验证工具，覆盖服务端启动、持久化或运行时链路的最小回归场景。
 *
 * 维护时要让验证数据可控、可清理，并避免依赖线上外部服务。
 */
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import {
  S2C,
  calcTechniqueAttrValues,
  expandTechniqueArtsStrengthSkill,
  normalizeTechniqueArtsStrengthSkill,
} from '@mud/shared';
import type { SkillFormula, SkillFormulaVar } from '@mud/shared';
import type { Socket } from 'socket.io';

import { TechniqueGenerationService } from '../runtime/technique-generation/technique-generation.service';
import type { GeneratedTechniqueStoreService } from '../runtime/technique-generation/generated-technique-store.service';
import type { AiTextModelConfig } from '../ai/ai-model-config';
import { WorldGatewayTechniqueGenerationHelper } from '../network/world-gateway-technique-generation.helper';
import {
  ensureGeneratedTechniqueTables,
  publishGeneratedTechnique,
} from '../persistence/generated-technique-persistence.service';
import { TechniqueTemplateRegistry } from '../content/registries/technique-template.registry';
import { validateTechniqueCandidate } from '../runtime/technique-generation/technique-candidate-validator';
import { calcArtsBudgetMax } from '../runtime/technique-generation/technique-budget-normalizer';
import { buildTechniquePrompt } from '../runtime/technique-generation/technique-prompt-builder';
import { projectBootstrapTechniqueStateForSync } from '../network/world-sync-player-state.service';

type QueryRecord = {
  sql: string;
  params: unknown[] | undefined;
};

function createFakePool(records: QueryRecord[]): Pool {
  return {
    query: async (sql: unknown, params?: unknown[]) => {
      records.push({ sql: String(sql), params });
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
}

function createFakeSchemaPool(records: QueryRecord[]): Pool {
  return {
    connect: async () => ({
      query: async (sql: unknown, params?: unknown[]) => {
        records.push({ sql: String(sql), params });
        return { rows: [], rowCount: 0 };
      },
      release: () => undefined,
    }),
  } as unknown as Pool;
}

function createFakeTextModelConfig(): AiTextModelConfig {
  return {
    provider: 'openai',
    apiKey: 'smoke-key',
    baseURL: 'https://example.invalid/v1',
    modelName: 'smoke-model',
    timeoutMs: 1,
    anthropicMaxTokens: 1,
  };
}

async function testUninitializedServiceDoesNotConsumeItem(): Promise<void> {
  const service = new TechniqueGenerationService();
  let consumeCount = 0;

  const result = await service.requestGeneration({
    playerId: 'p_uninitialized_smoke',
    playerRealmLv: 31,
    category: 'internal',
    consumeItem: async () => {
      consumeCount += 1;
      return true;
    },
  });

  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'SERVICE_UNAVAILABLE');
  assert.equal(consumeCount, 0);
}

async function testNoModelFailsWithoutConsumingItem(): Promise<void> {
  const queries: QueryRecord[] = [];
  const service = new TechniqueGenerationService();
  service.initialize({
    pool: createFakePool(queries),
    generatedStore: { refreshAfterPublish: async () => undefined } as unknown as GeneratedTechniqueStoreService,
    modelConfigResolver: async () => null,
  });

  let consumeCount = 0;
  const result = await service.requestGeneration({
    playerId: 'p_no_model_smoke',
    playerRealmLv: 31,
    category: 'internal',
    playerContext: '  test context  ',
    consumeItem: async () => {
      consumeCount += 1;
      return true;
    },
  });

  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'NO_MODEL');
  assert.equal(consumeCount, 0);
  const insertJobQuery = queries.find((entry) => entry.sql.includes('INSERT INTO technique_generation_job'));
  assert.ok(insertJobQuery);
  assert.equal(insertJobQuery.params?.[1], 'p_no_model_smoke');
  assert.ok(!queries.some((entry) => entry.sql.includes('UPDATE technique_generation_job') && entry.sql.includes('item_consumed = true')));
  assert.ok(queries.some((entry) => entry.sql.includes('UPDATE technique_generation_job') && entry.params?.[2] === 'NO_MODEL'));
}

async function testInitializedServiceConsumesRequestedItemSpend(): Promise<void> {
  const queries: QueryRecord[] = [];
  const service = new TechniqueGenerationService();
  service.initialize({
    pool: createFakePool(queries),
    generatedStore: { refreshAfterPublish: async () => undefined } as unknown as GeneratedTechniqueStoreService,
    modelConfigResolver: async () => createFakeTextModelConfig(),
  });
  let executedJobId = '';
  let executedModelName = '';
  service.executeGeneration = async (jobId, params) => {
    executedJobId = jobId;
    executedModelName = params.modelConfig?.modelName ?? '';
    return { success: true };
  };

  let consumedCount = 0;
  const result = await service.requestGeneration({
    playerId: 'p_generation_boost_smoke',
    playerRealmLv: 31,
    category: 'arts',
    itemSpend: 4,
    consumeItem: async (count) => {
      consumedCount = count;
      return true;
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.itemSpend, 4);
  assert.ok((result.budgetPercent ?? 0) >= 0.8 && (result.budgetPercent ?? 0) <= 1.2);
  assert.ok((result.totalBudget ?? 0) > 0);
  assert.equal(consumedCount, 4);
  const insertJobQuery = queries.find((entry) => entry.sql.includes('INSERT INTO technique_generation_job'));
  assert.equal(insertJobQuery?.params?.[6], 4);
  assert.equal(insertJobQuery?.params?.[7], result.budgetPercent);
  assert.equal(insertJobQuery?.params?.[8], result.totalBudget);
  assert.ok(queries.some((entry) => entry.sql.includes('UPDATE technique_generation_job') && entry.sql.includes('item_consumed = true')));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(executedJobId, result.jobId);
  assert.equal(executedModelName, 'smoke-model');
}

async function testItemShortageMarksJobFailedAfterAudit(): Promise<void> {
  const queries: QueryRecord[] = [];
  const service = new TechniqueGenerationService();
  service.initialize({
    pool: createFakePool(queries),
    generatedStore: { refreshAfterPublish: async () => undefined } as unknown as GeneratedTechniqueStoreService,
    modelConfigResolver: async () => createFakeTextModelConfig(),
  });

  const result = await service.requestGeneration({
    playerId: 'p_item_shortage_smoke',
    playerRealmLv: 31,
    category: 'internal',
    consumeItem: async () => false,
  });

  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'ITEM_NOT_ENOUGH');
  const insertIndex = queries.findIndex((entry) => entry.sql.includes('INSERT INTO technique_generation_job'));
  const failedIndex = queries.findIndex((entry) => entry.sql.includes('UPDATE technique_generation_job') && entry.params?.[2] === 'ITEM_NOT_ENOUGH');
  assert.notEqual(insertIndex, -1);
  assert.notEqual(failedIndex, -1);
  assert.ok(insertIndex < failedIndex);
}

async function testNoModelConsumedJobRefundsOnce(): Promise<void> {
  const queries: QueryRecord[] = [];
  const pool = {
    query: async (sql: unknown, params?: unknown[]) => {
      const text = String(sql);
      queries.push({ sql: text, params });
      if (text.includes('FROM technique_generation_job') && text.includes("error_code = 'NO_MODEL'")) {
        return {
          rows: [{ id: 'job_refund_smoke', player_id: 'p_refund_smoke', item_spend: 10 }],
          rowCount: 1,
        };
      }
      if (text.includes('UPDATE technique_generation_job') && text.includes('item_refunded = true')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
  const service = new TechniqueGenerationService();
  service.initialize({
    pool,
    generatedStore: { refreshAfterPublish: async () => undefined } as unknown as GeneratedTechniqueStoreService,
    modelConfigResolver: async () => null,
  });

  let refundedCount = 0;
  const result = await service.refundNoModelFailedConsumedJobsForPlayer({
    playerId: 'p_refund_smoke',
    refundItem: async (count) => {
      refundedCount += count;
      return true;
    },
  });

  assert.equal(result, 10);
  assert.equal(refundedCount, 10);
  assert.ok(queries.some((entry) => entry.sql.includes('item_refunded = true') && entry.params?.[0] === 'job_refund_smoke'));
}

async function testSchemaMigratesPlayerIdsToVarchar(): Promise<void> {
  const queries: QueryRecord[] = [];
  await ensureGeneratedTechniqueTables(createFakeSchemaPool(queries));

  const normalizedSql = queries.map((entry) => entry.sql.replace(/\s+/g, ' ').trim().toLowerCase());
  assert.ok(normalizedSql.some((sql) => sql.includes('created_by_player_id varchar(120) not null')));
  assert.ok(normalizedSql.some((sql) => sql.includes('player_id varchar(120) not null')));
  assert.ok(normalizedSql.some((sql) => sql.includes('alter column created_by_player_id type varchar(120)')));
  assert.ok(normalizedSql.some((sql) => sql.includes('alter column player_id type varchar(120)')));
  assert.ok(normalizedSql.some((sql) => sql.includes('item_refunded boolean not null default false')));
  assert.ok(normalizedSql.some((sql) => sql.includes('add column if not exists item_refunded boolean not null default false')));
  assert.ok(normalizedSql.some((sql) => sql.includes('add column if not exists refunded_at timestamptz')));
}

async function testPublishGeneratedTechniqueCastsRepeatedNameParameter(): Promise<void> {
  const queries: QueryRecord[] = [];
  await publishGeneratedTechnique(createFakePool(queries), {
    id: 'gen_publish_cast_smoke',
    displayName: '蛮荒霸体诀',
    normalizedName: '蛮荒霸体诀',
  });

  const sql = queries[0]?.sql.replace(/\s+/g, ' ').trim().toLowerCase() ?? '';
  assert.ok(sql.includes('display_name = $2::text'));
  assert.ok(sql.includes('normalized_name = $3::text'));
  assert.ok(sql.includes("template = jsonb_set(template, '{name}', to_jsonb($2::text), true)"));
}

async function testGatewayStatusEmitsRollRange(): Promise<void> {
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const helper = new WorldGatewayTechniqueGenerationHelper({
    gatewayGuardHelper: {
      requirePlayerId: () => 'p_gateway_status_smoke',
    },
    worldClientEventService: {
      emitGatewayError: (client: Socket, code: string, error: unknown) => {
        client.emit('gatewayError', { code, error });
      },
    },
    playerRuntimeService: {
      getPlayerRealmLv: () => 31,
      consumeItemByItemId: () => true,
      learnTechniqueById: () => true,
    },
  });
  helper.setService({} as unknown as TechniqueGenerationService);

  const result = await helper.handleTechniqueGeneration({
    emit: (event: string, payload: unknown) => {
      emitted.push({ event, payload });
      return true;
    },
  } as unknown as Socket, { action: 'getStatus', itemSpend: 3 });

  assert.equal(emitted[0]?.event, S2C.TechniqueGenerationStatus);
  const payload = emitted[0]?.payload as {
    available?: boolean;
    rollRange?: {
      itemSpendDefault?: number;
      realmLvChances?: unknown[];
      gradeChances?: unknown[];
    };
  };
  assert.equal(payload.available, true);
  assert.equal(payload.rollRange?.itemSpendDefault, 3);
  assert.ok((payload.rollRange?.realmLvChances?.length ?? 0) > 0);
  assert.ok((payload.rollRange?.gradeChances?.length ?? 0) > 0);
  assert.deepEqual(result, emitted[0]?.payload);
}

async function testGatewayGenerateExceptionEmitsFailureResult(): Promise<void> {
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const helper = new WorldGatewayTechniqueGenerationHelper({
    gatewayGuardHelper: {
      requirePlayerId: () => 'p_gateway_smoke',
    },
    worldClientEventService: {
      emitGatewayError: (client: Socket, code: string, error: unknown) => {
        client.emit('gatewayError', { code, error });
      },
    },
    playerRuntimeService: {
      getPlayerRealmLv: () => 31,
      consumeItemByItemId: () => true,
      learnTechniqueById: () => true,
    },
  });
  helper.setService({
    requestGeneration: async () => {
      throw new Error('simulated_insert_failure');
    },
  } as unknown as TechniqueGenerationService);

  const result = await helper.handleTechniqueGeneration({
    emit: (event: string, payload: unknown) => {
      emitted.push({ event, payload });
      return true;
    },
  } as unknown as Socket, { action: 'generate', category: 'internal' });

  assert.deepEqual(result, { success: false, error: '功法领悟失败', errorCode: 'GENERATION_FAILED' });
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0]?.event, S2C.TechniqueGenerationResult);
  assert.equal((emitted[0]?.payload as { result?: string; errorMessage?: string }).result, 'failed');
  assert.equal((emitted[0]?.payload as { result?: string; errorMessage?: string }).errorMessage, 'simulated_insert_failure');
}

async function testGatewayAdoptAndDiscardEmitResultEvents(): Promise<void> {
  const emitted: Array<{ event: string; payload: unknown }> = [];
  let syncCount = 0;
  let learnedTechniqueId = '';
  const helper = new WorldGatewayTechniqueGenerationHelper({
    gatewayGuardHelper: {
      requirePlayerId: () => 'p_gateway_adopt_smoke',
    },
    worldClientEventService: {
      emitGatewayError: (client: Socket, code: string, error: unknown) => {
        client.emit('gatewayError', { code, error });
      },
    },
    playerRuntimeService: {
      getPlayerRealmLv: () => 31,
      consumeItemByItemId: () => true,
      learnTechniqueById: (_playerId: string, techniqueId: string) => {
        learnedTechniqueId = techniqueId;
        return true;
      },
    },
    worldSyncService: {
      emitDeltaSync: () => {
        syncCount += 1;
      },
    },
  });
  helper.setService({
    adoptDraft: async () => ({ success: true, techniqueId: 'gen_adopt_smoke', techniqueName: '烟霞诀' }),
    discardDraft: async () => ({ success: true }),
  } as unknown as TechniqueGenerationService);

  const socket = {
    emit: (event: string, payload: unknown) => {
      emitted.push({ event, payload });
      return true;
    },
  } as unknown as Socket;

  const adoptResult = await helper.handleTechniqueGeneration(socket, {
    action: 'adopt',
    jobId: 'job_adopt_smoke',
    customName: '烟霞诀',
  });
  assert.deepEqual(adoptResult, { success: true, techniqueId: 'gen_adopt_smoke', techniqueName: '烟霞诀' });
  assert.equal(learnedTechniqueId, 'gen_adopt_smoke');
  assert.equal(syncCount, 1);
  assert.equal(emitted[0]?.event, S2C.TechniqueGenerationResult);
  assert.deepEqual(emitted[0]?.payload, {
    jobId: 'job_adopt_smoke',
    result: 'learned',
    techniqueId: 'gen_adopt_smoke',
    techniqueName: '烟霞诀',
  });

  const discardResult = await helper.handleTechniqueGeneration(socket, {
    action: 'discard',
    jobId: 'job_discard_smoke',
  });
  assert.deepEqual(discardResult, { success: true });
  assert.equal(emitted[1]?.event, S2C.TechniqueGenerationResult);
  assert.equal((emitted[1]?.payload as { jobId?: string; result?: string }).jobId, 'job_discard_smoke');
  assert.equal((emitted[1]?.payload as { jobId?: string; result?: string }).result, 'discarded');
}

async function testGeneratedInternalPreviewNormalizesAttrRatioAliases(): Promise<void> {
  const service = new TechniqueGenerationService();
  service.initialize({
    pool: {
      query: async () => ({
        rows: [{
          template: {
            id: 'gen_preview_alias_smoke',
            name: '蛮荒霸体诀',
            grade: 'mystic',
            category: 'internal',
            realmLv: 41,
            attrRatio: { 力道: 3, 体魄: 2 },
            maxLayer: 9,
            expDifficulty: 1,
          },
        }],
        rowCount: 1,
      }),
    } as unknown as Pool,
    generatedStore: { refreshAfterPublish: async () => undefined } as unknown as GeneratedTechniqueStoreService,
    modelConfigResolver: async () => null,
  });

  const preview = await service.getPreview('p_preview_alias_smoke', 'job_preview_alias_smoke');
  assert.ok(preview);
  assert.ok((preview.fullLevelAttrs?.strength ?? 0) > 0);
  assert.ok((preview.fullLevelAttrs?.constitution ?? 0) > 0);
}

async function testGeneratedTechniqueRegistryExpandsQuantifiedTemplates(): Promise<void> {
  const registry = new TechniqueTemplateRegistry();
  registry.setGeneratedStore({
    getById: () => ({
      id: 'gen_registry_alias_smoke',
      name: '蛮荒霸体诀',
      grade: 'mystic',
      category: 'internal',
      realmLv: 41,
      attrRatio: { 力道: 3, 体魄: 2 },
      maxLayer: 9,
      expDifficulty: 1,
    }),
  } as unknown as GeneratedTechniqueStoreService);

  const state = registry.createTechniqueState('gen_registry_alias_smoke') as { layers?: Parameters<typeof calcTechniqueAttrValues>[1] } | null;
  assert.ok(state);
  assert.equal(state.layers?.length, 9);
  const attrs = calcTechniqueAttrValues(9, state.layers);
  assert.ok((attrs.strength ?? 0) > 0);
  assert.ok((attrs.constitution ?? 0) > 0);
}

async function testGeneratedTechniqueBootstrapProjectionKeepsTemplateFields(): Promise<void> {
  const registry = new TechniqueTemplateRegistry();
  registry.setGeneratedStore({
    getById: () => ({
      id: 'gen_bootstrap_projection_smoke',
      name: '撼岳真诀',
      grade: 'mystic',
      category: 'internal',
      realmLv: 31,
      attrRatio: { strength: 3, constitution: 1 },
      maxLayer: 9,
      expDifficulty: 1,
    }),
  } as unknown as GeneratedTechniqueStoreService);

  const state = registry.createTechniqueState('gen_bootstrap_projection_smoke');
  assert.ok(state);
  const projected = projectBootstrapTechniqueStateForSync(state);
  assert.equal(projected.name, '撼岳真诀');
  assert.equal(projected.grade, 'mystic');
  assert.equal(projected.category, 'internal');
  assert.equal(projected.realmLv, 31);
  assert.equal(projected.layers?.length, 9);
}

async function testGeneratedArtsTechniqueRecoversDraftSkillShape(): Promise<void> {
  const registry = new TechniqueTemplateRegistry();
  registry.setGeneratedStore({
    getById: () => ({
      id: 'gen_arts_skill_shape_smoke',
      name: '裂风剑诀',
      grade: 'mystic',
      category: 'arts',
      realmLv: 31,
      maxLayer: 9,
      expDifficulty: 1,
      skills: [{
        name: '裂风斩',
        desc: '凝风成刃，斩击前方敌人。',
        cooldown: 3,
        cost: 1.2,
        range: 4,
        targeting: { shape: 'single', range: 4 },
        effects: [{ type: 'damage', value: 6, damageKind: 'spell' }],
        unlockLevel: 1,
      }],
    }),
  } as unknown as GeneratedTechniqueStoreService);

  const state = registry.createTechniqueState('gen_arts_skill_shape_smoke') as {
    skills?: Array<{ id?: string; cost?: number; costMultiplier?: number; effects?: Array<{ formula?: unknown }> }>;
    layers?: unknown[];
  } | null;
  assert.ok(state);
  assert.equal(state.layers?.length, 9);
  assert.equal(state.skills?.length, 1);
  assert.equal(state.skills?.[0]?.id, 'gen_arts_skill_shape_smoke_skill_1');
  assert.ok((state.skills?.[0]?.cost ?? 0) > 0);
  assert.equal(state.skills?.[0]?.costMultiplier, 1.2);
  assert.deepEqual(state.skills?.[0]?.effects?.[0]?.formula, {
    op: 'mul',
    args: [
      {
        op: 'add',
        args: [
          {
            var: 'caster.stat.spellAtk',
            scale: 6,
          },
        ],
      },
      {
        op: 'add',
        args: [
          1,
          {
            var: 'techLevel',
            scale: 0.1,
          },
        ],
      },
    ],
  });
}

async function testInternalCandidateRejectsUnknownAttrRatioKeys(): Promise<void> {
  const result = validateTechniqueCandidate({
    name: '无效功法',
    grade: 'mystic',
    category: 'internal',
    realmLv: 41,
    attrRatio: { 蛮荒血力: 1, 霸体: 1 },
    maxLayer: 9,
  }, 'internal');
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((entry) => entry.field === 'attrRatio'));
}

async function testArtsCandidateAcceptsStrengthShape(): Promise<void> {
  const result = validateTechniqueCandidate({
    name: '裂风剑诀',
    grade: 'mystic',
    category: 'arts',
    realmLv: 31,
    maxLayer: 9,
    skills: [{
      name: '裂风斩',
      desc: '凝风成刃，直斩前方敌人。',
      unlockLevel: 1,
      damageKind: 'spell',
      element: 'wood',
      target: { type: 'line', targetMode: 'tile' },
      structureStrength: { damage: 4, cost: 0, cooldown: 1, chant: 0, castRange: 3, area: 1 },
      formulaStrength: {
        attributeBases: { spellAtk: 4, resolvePower: 1 },
        percentBonuses: { moveSpeed: 0 },
      },
    }],
  }, 'arts');
  assert.equal(result.valid, true);
}

async function testTechniquePromptIncludesRolledBudgetContext(): Promise<void> {
  const artsPrompt = buildTechniquePrompt({
    category: 'arts',
    grade: 'earth',
    realmLv: 43,
    maxLayer: 9,
    itemSpend: 3,
    budgetPercent: 1.1,
    totalBudget: Math.round(calcArtsBudgetMax('earth', 43) * 1.1 * 10_000) / 10_000,
    playerContext: '伤害范围32格,冷却1息,伤害特别低',
  });
  const artsPayload = JSON.parse(artsPrompt.userMessage) as {
    generationContext?: Record<string, unknown>;
    budgetContext?: Record<string, unknown>;
    strengthRules?: { calculationFormulas?: string[] };
  };
  assert.equal(artsPayload.generationContext?.grade, 'earth');
  assert.equal(artsPayload.generationContext?.realmLv, 43);
  assert.equal(artsPayload.generationContext?.realmStageLabel, '金丹前期');
  assert.equal(artsPayload.generationContext?.itemSpend, 3);
  assert.equal(artsPayload.generationContext?.budgetPercent, 1.1);
  assertApprox(Number(artsPayload.budgetContext?.actualTotalBudget), calcArtsBudgetMax('earth', 43) * 1.1, 0.0001);
  assert.ok(artsPayload.strengthRules?.calculationFormulas?.some((entry) => entry.includes('itemBudget')));

  const internalPrompt = buildTechniquePrompt({
    category: 'internal',
    grade: 'mortal',
    realmLv: 31,
    maxLayer: 9,
    budgetPercent: 0.9,
    playerContext: '稳固根基',
  });
  const internalPayload = JSON.parse(internalPrompt.userMessage) as {
    generationContext?: { toneGuidance?: string[] };
    budgetContext?: Record<string, unknown>;
  };
  assert.equal(internalPayload.budgetContext?.budgetType, 'internal_attr_ratio');
  assert.equal(internalPayload.budgetContext?.budgetPercent, 0.9);
  assert.ok((internalPayload.generationContext?.toneGuidance ?? []).some((entry) => entry.includes('不使用灭世')));
}

async function testZeroRangeArtsStrengthExpandsAsMinimumCastRangeSkill(): Promise<void> {
  const normalized = normalizeTechniqueArtsStrengthSkill({
    name: '雷环诀',
    desc: '雷光绕身成环，震荡近处妖邪。',
    unlockLevel: 1,
    damageKind: 'spell',
    element: 'metal',
    target: { type: 'area', targetMode: 'tile' },
    structureStrength: { damage: 1, cost: 0, cooldown: 0, chant: 0, castRange: 0, area: 4 },
    formulaStrength: {
      attributeBases: { spellAtk: 1 },
      percentBonuses: { techLevel: 0 },
    },
  });
  const expanded = expandTechniqueArtsStrengthSkill({
    techniqueId: 'gen_zero_range_arts_smoke',
    grade: 'mystic',
    realmLv: 31,
    skill: normalized,
  });
  assert.equal(expanded.skill.range, 1);
  assert.equal(expanded.skill.requiresTarget, undefined);
  assert.equal(expanded.skill.targeting?.range, 1);
  assert.ok((expanded.skill.targeting?.radius ?? 0) >= 0);
}

async function testArtsStrengthBudgetAllocatesAndRefundsByItem(): Promise<void> {
  const normalized = normalizeTechniqueArtsStrengthSkill({
    name: '散星诀',
    desc: '催动灵力化作漫天星芒，覆盖广域却威能稀薄。',
    unlockLevel: 1,
    damageKind: 'spell',
    element: 'water',
    target: { type: 'area', targetMode: 'tile' },
    structureStrength: { damage: 1, cost: -20, cooldown: 80, chant: 0, castRange: 6, area: 6 },
    formulaStrength: {
      attributeBases: { spellAtk: 1 },
    },
  });
  const expanded = expandTechniqueArtsStrengthSkill({
    techniqueId: 'gen_scattered_star_arts_smoke',
    grade: 'earth',
    realmLv: 43,
    skill: normalized,
    targetBudget: calcArtsBudgetMax('earth', 43),
  });

  assertApprox(expanded.totalBudget, calcArtsBudgetMax('earth', 43), 0.0001);
  assert.equal(expanded.budgetBreakdown.totalWeight, 113);
  assert.equal(expanded.budgetBreakdown.positiveWeight, 93);
  assert.equal(expanded.budgetBreakdown.negativeWeight, 20);
  assert.equal(expanded.skill.range, 3);
  assert.equal(expanded.skill.targeting?.range, 3);
  assert.equal(expanded.skill.targeting?.radius, 1);
  assert.equal(expanded.skill.cooldown, 34);
  assertApprox(expanded.skill.costMultiplier ?? 0, 9.5892, 0.0001);
  const formula = extractSkillEffectFormula(expanded.skill.effects[0]);
  assertApprox(extractFormulaVarScale(formula, 'caster.stat.spellAtk'), 3.4947, 0.001);
  assert.equal(extractFormulaVarScale(formula, 'techLevel'), 0.1);
}

function assertApprox(actual: number, expected: number, epsilon: number): void {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} is not within ${epsilon} of ${expected}`);
}

function extractFormulaVarScale(formula: SkillFormula | undefined, varName: SkillFormulaVar): number {
  if (formula === undefined) {
    return 0;
  }
  if (typeof formula === 'number') {
    return 0;
  }
  if ('var' in formula && formula.var === varName) {
    return Number(formula.scale ?? 1);
  }
  if ('args' in formula && Array.isArray(formula.args)) {
    for (const child of formula.args) {
      const scale = extractFormulaVarScale(child, varName);
      if (scale !== 0) {
        return scale;
      }
    }
  }
  if ('value' in formula) {
    return extractFormulaVarScale(formula.value, varName);
  }
  return 0;
}

function extractSkillEffectFormula(effect: unknown): SkillFormula | undefined {
  return effect && typeof effect === 'object' && 'formula' in effect
    ? (effect as { formula?: SkillFormula }).formula
    : undefined;
}

async function testArtsCandidateRejectsLegacyEffectsShape(): Promise<void> {
  const result = validateTechniqueCandidate({
    name: '旧术法',
    grade: 'mystic',
    category: 'arts',
    realmLv: 31,
    maxLayer: 9,
    skills: [{
      name: '旧式技能',
      effects: [{ type: 'buff', buffId: 'buff.fake', value: 1 }],
    }],
  }, 'arts');
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((entry) => entry.field.includes('effects')));
}

async function main(): Promise<void> {
  await testUninitializedServiceDoesNotConsumeItem();
  await testNoModelFailsWithoutConsumingItem();
  await testInitializedServiceConsumesRequestedItemSpend();
  await testItemShortageMarksJobFailedAfterAudit();
  await testNoModelConsumedJobRefundsOnce();
  await testSchemaMigratesPlayerIdsToVarchar();
  await testPublishGeneratedTechniqueCastsRepeatedNameParameter();
  await testGatewayStatusEmitsRollRange();
  await testGatewayGenerateExceptionEmitsFailureResult();
  await testGatewayAdoptAndDiscardEmitResultEvents();
  await testGeneratedInternalPreviewNormalizesAttrRatioAliases();
  await testGeneratedTechniqueRegistryExpandsQuantifiedTemplates();
  await testGeneratedTechniqueBootstrapProjectionKeepsTemplateFields();
  await testGeneratedArtsTechniqueRecoversDraftSkillShape();
  await testInternalCandidateRejectsUnknownAttrRatioKeys();
  await testArtsCandidateAcceptsStrengthShape();
  await testTechniquePromptIncludesRolledBudgetContext();
  await testZeroRangeArtsStrengthExpandsAsMinimumCastRangeSkill();
  await testArtsStrengthBudgetAllocatesAndRefundsByItem();
  await testArtsCandidateRejectsLegacyEffectsShape();
  console.log('technique-generation-initialization-smoke ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

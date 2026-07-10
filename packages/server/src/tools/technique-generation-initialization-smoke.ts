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

import {
  TechniqueGenerationService,
  normalizeGeneratedTechniqueCandidateForServer,
} from '../runtime/technique-generation/technique-generation.service';
import { AiArtsStrengthV1ToV2Conversion } from '../gm/compat-conversions/conversions/technique/ai-arts-strength-v1-to-v2';
import type { GeneratedTechniqueStoreService } from '../runtime/technique-generation/generated-technique-store.service';
import type { AiTextModelConfig } from '../ai/ai-model-config';
import { WorldGatewayTechniqueGenerationHelper } from '../network/world-gateway-technique-generation.helper';
import {
  ensureGeneratedTechniqueTables,
  previewFailedTechniqueGenerationItemRefunds,
  publishGeneratedTechnique,
  refundFailedTechniqueGenerationItems,
} from '../persistence/generated-technique-persistence.service';
import {
  adoptDurableTechniqueDraft,
  beginDurableTechniqueGeneration,
  discardDurableTechniqueDraft,
} from '../persistence/technique-generation-durable-persistence';
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

function createFakeConnectedPool(
  records: QueryRecord[],
  handler: (sql: string, params: unknown[] | undefined) => { rows: unknown[]; rowCount?: number },
): Pool {
  const query = async (sql: unknown, params?: unknown[]) => {
    const text = String(sql);
    records.push({ sql: text, params });
    return handler(text, params);
  };
  return {
    query,
    connect: async () => ({
      query,
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

  const result = await service.requestGeneration({
    playerId: 'p_uninitialized_smoke',
    playerRealmLv: 31,
    category: 'internal',
  });

  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'SERVICE_UNAVAILABLE');
}

async function testNoModelFailsWithoutConsumingItem(): Promise<void> {
  const queries: QueryRecord[] = [];
  const service = new TechniqueGenerationService();
  service.initialize({
    pool: createFakePool(queries),
    generatedStore: { refreshAfterPublish: async () => undefined } as unknown as GeneratedTechniqueStoreService,
    modelConfigResolver: async () => null,
  });

  const result = await service.requestGeneration({
    playerId: 'p_no_model_smoke',
    playerRealmLv: 31,
    category: 'internal',
    playerContext: '  test context  ',
  });

  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'NO_MODEL');
  assert.ok(!queries.some((entry) => entry.sql.includes('INSERT INTO technique_generation_job')));
  assert.ok(!queries.some((entry) => entry.sql.includes('player_inventory_item')));
  assert.ok(!queries.some((entry) => entry.sql.includes('UPDATE technique_generation_job') && entry.sql.includes('item_consumed = true')));
}

async function testInitializedServiceConsumesRequestedItemSpend(): Promise<void> {
  const queries: QueryRecord[] = [];
  const service = new TechniqueGenerationService();
  const pool = createFakeConnectedPool(queries, (sql) => {
    if (sql.includes('FROM player_presence')) {
      return { rows: [{ runtime_owner_id: 'runtime:techgen-smoke', session_epoch: 7 }], rowCount: 1 };
    }
    if (sql.includes('FROM player_inventory_item') && sql.includes('item_id = $2') && sql.includes('FOR UPDATE')) {
      return { rows: [{ item_instance_id: 'item:wudao', count: 10 }], rowCount: 1 };
    }
    if (sql.includes('FROM player_inventory_item') && sql.includes('raw_payload') && !sql.includes('FOR UPDATE')) {
      return {
        rows: [{ item_instance_id: 'item:wudao', item_id: 'wudao_yujian', count: 6, slot_index: 0, raw_payload: { count: 6, enhanceLevel: 2 } }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  });
  service.initialize({
    pool,
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

  let appliedItemCount = 0;
  let appliedEnhanceLevel = 0;
  const result = await service.requestGeneration({
    playerId: 'p_generation_boost_smoke',
    playerRealmLv: 31,
    category: 'arts',
    itemSpend: 4,
    expectedRuntimeOwnerId: 'runtime:techgen-smoke',
    expectedSessionEpoch: 7,
    applyInventorySnapshot: async (items) => {
      const item = items.find((entry) => entry.itemId === 'wudao_yujian');
      appliedItemCount = item?.count ?? 0;
      appliedEnhanceLevel = Number((item as { enhanceLevel?: unknown } | undefined)?.enhanceLevel ?? 0);
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.itemSpend, 4);
  assert.ok((result.budgetPercent ?? 0) >= 0.8 && (result.budgetPercent ?? 0) <= 1.2);
  assert.ok((result.totalBudget ?? 0) > 0);
  assert.equal(appliedItemCount, 6);
  assert.equal(appliedEnhanceLevel, 2);
  const insertJobQuery = queries.find((entry) => entry.sql.includes('INSERT INTO technique_generation_job'));
  assert.equal(insertJobQuery?.params?.[6], 4);
  assert.equal(insertJobQuery?.params?.[7], result.budgetPercent);
  assert.equal(insertJobQuery?.params?.[8], result.totalBudget);
  assert.ok(insertJobQuery?.sql.includes('item_consumed'));
  assert.ok(queries.some((entry) => entry.sql.includes('INSERT INTO durable_operation_log')));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(executedJobId, result.jobId);
  assert.equal(executedModelName, 'smoke-model');
}

async function testItemShortageMarksJobFailedAfterAudit(): Promise<void> {
  const queries: QueryRecord[] = [];
  const service = new TechniqueGenerationService();
  const pool = createFakeConnectedPool(queries, (sql) => {
    if (sql.includes('FROM player_presence')) {
      return { rows: [{ runtime_owner_id: 'runtime:shortage', session_epoch: 3 }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  service.initialize({
    pool,
    generatedStore: { refreshAfterPublish: async () => undefined } as unknown as GeneratedTechniqueStoreService,
    modelConfigResolver: async () => createFakeTextModelConfig(),
  });

  const result = await service.requestGeneration({
    playerId: 'p_item_shortage_smoke',
    playerRealmLv: 31,
    category: 'internal',
    expectedRuntimeOwnerId: 'runtime:shortage',
    expectedSessionEpoch: 3,
    applyInventorySnapshot: async () => undefined,
  });

  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'ITEM_NOT_ENOUGH');
  assert.ok(!queries.some((entry) => entry.sql.includes('INSERT INTO technique_generation_job')));
  assert.ok(!queries.some((entry) => entry.sql.includes('INSERT INTO durable_operation_log')));
}

async function testExecuteGenerationFailureRefundsConsumedItems(): Promise<void> {
  const queries: QueryRecord[] = [];
  const service = new TechniqueGenerationService();
  const pool = {
    query: async (sql: unknown, params?: unknown[]) => {
      const text = String(sql);
      queries.push({ sql: text, params });
      if (text.includes('UPDATE technique_generation_job') && text.includes('RETURNING id')) {
        return { rows: [{ id: 'job_execute_refund_smoke' }], rowCount: 1 };
      }
      if (text.includes('SET status = $2') && params?.[1] === 'failed') {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
  service.initialize({
    pool,
    generatedStore: { refreshAfterPublish: async () => undefined } as unknown as GeneratedTechniqueStoreService,
    modelConfigResolver: async () => null,
  });

  let settleCount = 0;
  const result = await service.executeGeneration('job_execute_refund_smoke', {
    playerId: 'p_execute_refund_smoke',
    category: 'internal',
    grade: 'mystic',
    realmLv: 31,
    playerContext: '',
    itemSpend: 7,
    settleFailedRefund: async () => {
      settleCount += 1;
      return true;
    },
  });

  assert.equal(result.success, false);
  assert.equal(settleCount, 1);
  assert.ok(queries.some((entry) => entry.sql.includes('UPDATE technique_generation_job') && entry.params?.[2] === 'NO_MODEL'));
}

async function testFailedConsumedJobRefundsOnce(): Promise<void> {
  const queries: QueryRecord[] = [];
  const pool = createFakeConnectedPool(queries, (sql) => {
    if (sql.includes('FROM player_presence')) {
      return { rows: [{ runtime_owner_id: 'runtime:refund', session_epoch: 11 }], rowCount: 1 };
    }
    if (sql.includes('FROM technique_generation_job') && sql.includes("status = 'failed'")) {
      return { rows: [{ id: 'job_refund_smoke', item_spend: 10 }], rowCount: 1 };
    }
    if (sql.includes('FROM player_inventory_item') && sql.includes('item_id = $2') && sql.includes('LIMIT 1')) {
      return { rows: [{ item_instance_id: 'item:wudao', count: 3 }], rowCount: 1 };
    }
    if (sql.includes('COALESCE(SUM(count)')) {
      return { rows: [{ total: 3 }], rowCount: 1 };
    }
    if (sql.includes('UPDATE technique_generation_job') && sql.includes('item_refunded = true')) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('FROM player_inventory_item') && sql.includes('raw_payload') && !sql.includes('FOR UPDATE')) {
      return {
        rows: [{ item_instance_id: 'item:wudao', item_id: 'wudao_yujian', count: 13, slot_index: 0, raw_payload: { count: 13 } }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  });
  const service = new TechniqueGenerationService();
  service.initialize({
    pool,
    generatedStore: { refreshAfterPublish: async () => undefined } as unknown as GeneratedTechniqueStoreService,
    modelConfigResolver: async () => null,
  });

  let appliedCount = 0;
  const result = await service.refundFailedConsumedJobsForPlayer({
    playerId: 'p_refund_smoke',
    expectedRuntimeOwnerId: 'runtime:refund',
    expectedSessionEpoch: 11,
    applyInventorySnapshot: async (items) => {
      appliedCount = items.find((entry) => entry.itemId === 'wudao_yujian')?.count ?? 0;
    },
  });

  assert.equal(result, 10);
  assert.equal(appliedCount, 13);
  assert.ok(queries.some((entry) => entry.sql.includes('item_refunded = true') && entry.params?.[0] === 'job_refund_smoke'));
  assert.ok(queries.some((entry) => entry.sql.includes('INSERT INTO durable_operation_log')));
}

async function testGenerationConsumeCommitAcknowledgementLossReplaysIdempotently(): Promise<void> {
  const queries: QueryRecord[] = [];
  let connectionCount = 0;
  let committed = false;
  let inventoryCount = 5;
  const pool = {
    connect: async () => {
      connectionCount += 1;
      const connectionNumber = connectionCount;
      return {
        query: async (sql: unknown, params?: unknown[]) => {
          const text = String(sql);
          queries.push({ sql: text, params });
          if (text.includes('FROM player_presence')) {
            return { rows: [{ runtime_owner_id: 'runtime:commit-replay', session_epoch: 17 }], rowCount: 1 };
          }
          if (text.includes('FROM durable_operation_log')) {
            return committed
              ? {
                  rows: [{
                    player_id: 'player:commit-replay',
                    operation_type: 'technique_generation_consume',
                    aggregate_type: 'technique_generation_job',
                    payload_jsonb: { jobId: 'job:commit-replay', itemId: 'wudao_yujian', itemSpend: 2 },
                  }],
                  rowCount: 1,
                }
              : { rows: [], rowCount: 0 };
          }
          if (text.includes('FROM technique_generation_job') && text.includes('ORDER BY created_at')) {
            return { rows: [], rowCount: 0 };
          }
          if (text.includes('FROM player_inventory_item') && text.includes('item_id = $2') && text.includes('FOR UPDATE')) {
            return { rows: [{ item_instance_id: 'item:commit-replay', count: inventoryCount }], rowCount: 1 };
          }
          if (text.includes('UPDATE player_inventory_item')) {
            inventoryCount = Number(params?.[2] ?? inventoryCount);
            return { rows: [], rowCount: 1 };
          }
          if (text.includes('FROM player_inventory_item') && text.includes('raw_payload')) {
            return {
              rows: [{
                item_instance_id: 'item:commit-replay',
                item_id: 'wudao_yujian',
                count: inventoryCount,
                slot_index: 0,
                raw_payload: { count: inventoryCount },
              }],
              rowCount: 1,
            };
          }
          if (text === 'COMMIT' && connectionNumber === 1) {
            committed = true;
            throw new Error('simulated_commit_acknowledgement_loss');
          }
          return { rows: [], rowCount: 0 };
        },
        release: () => undefined,
      };
    },
  } as unknown as Pool;

  const result = await beginDurableTechniqueGeneration(pool, {
    id: 'job:commit-replay',
    playerId: 'player:commit-replay',
    requestedCategory: 'internal',
    rolledGrade: 'mystic',
    rolledRealmLv: 31,
    playerContext: '',
    itemSpend: 2,
    budgetPercent: 1,
    totalBudget: 100,
    expectedRuntimeOwnerId: 'runtime:commit-replay',
    expectedSessionEpoch: 17,
  });

  assert.equal(result.ok, true);
  assert.equal(result.alreadyCommitted, true);
  assert.equal(result.inventoryItems[0]?.count, 3);
  assert.equal(connectionCount, 2);
  assert.equal(queries.filter((entry) => entry.sql.includes('UPDATE player_inventory_item')).length, 1);
  assert.equal(queries.filter((entry) => entry.sql.includes('INSERT INTO technique_generation_job')).length, 1);
  assert.equal(queries.filter((entry) => entry.sql.includes('INSERT INTO durable_operation_log')).length, 1);
  assert.equal(queries.filter((entry) => entry.sql === 'COMMIT').length, 2);
}

async function testStaleGenerationWorkerFailureCannotRefundCommittedDraft(): Promise<void> {
  const queries: QueryRecord[] = [];
  const service = new TechniqueGenerationService();
  service.initialize({
    pool: {
      query: async (sql: unknown, params?: unknown[]) => {
        const text = String(sql);
        queries.push({ sql: text, params });
        if (text.includes("SET status = 'running'") && text.includes('RETURNING id')) {
          return { rows: [{ id: 'job:stale-worker' }], rowCount: 1 };
        }
        if (text.includes('SET status = $2') && params?.[1] === 'failed') {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      },
    } as unknown as Pool,
    generatedStore: { refreshAfterPublish: async () => undefined } as unknown as GeneratedTechniqueStoreService,
    modelConfigResolver: async () => null,
  });
  let settleCount = 0;

  const result = await service.executeGeneration('job:stale-worker', {
    playerId: 'player:stale-worker',
    category: 'internal',
    grade: 'mystic',
    realmLv: 31,
    playerContext: '',
    itemSpend: 4,
    settleFailedRefund: async () => {
      settleCount += 1;
      return true;
    },
  });

  assert.equal(result.success, false);
  assert.equal(settleCount, 0);
  const failedUpdate = queries.find((entry) => entry.sql.includes('SET status = $2') && entry.params?.[1] === 'failed');
  assert.ok(failedUpdate?.sql.includes("status = 'running'"));
  assert.ok(failedUpdate?.sql.includes('draft_technique_id IS NULL'));
}

async function testRefundCommitReplayAlwaysHydratesRuntimeInventory(): Promise<void> {
  const queries: QueryRecord[] = [];
  let connectionCount = 0;
  let refunded = false;
  let inventoryCount = 3;
  const pool = {
    connect: async () => {
      connectionCount += 1;
      const connectionNumber = connectionCount;
      return {
        query: async (sql: unknown, params?: unknown[]) => {
          const text = String(sql);
          queries.push({ sql: text, params });
          if (text.includes('FROM player_presence')) {
            return { rows: [{ runtime_owner_id: 'runtime:refund-replay', session_epoch: 19 }], rowCount: 1 };
          }
          if (text.includes('FROM technique_generation_job') && text.includes("status = 'failed'") && text.includes('FOR UPDATE')) {
            return refunded
              ? { rows: [], rowCount: 0 }
              : { rows: [{ id: 'job:refund-replay', item_spend: 10 }], rowCount: 1 };
          }
          if (text.includes('FROM durable_operation_log')) {
            return { rows: [], rowCount: 0 };
          }
          if (text.includes('FROM player_inventory_item') && text.includes('item_id = $2') && text.includes('LIMIT 1')) {
            return { rows: [{ item_instance_id: 'item:refund-replay', count: inventoryCount }], rowCount: 1 };
          }
          if (text.includes('COALESCE(SUM(count)')) {
            return { rows: [{ total: inventoryCount }], rowCount: 1 };
          }
          if (text.includes('UPDATE player_inventory_item')) {
            inventoryCount = Number(params?.[2] ?? inventoryCount);
            return { rows: [], rowCount: 1 };
          }
          if (text.includes('UPDATE technique_generation_job') && text.includes('item_refunded = true')) {
            refunded = true;
            return { rows: [], rowCount: 1 };
          }
          if (text.includes('FROM player_inventory_item') && text.includes('raw_payload')) {
            return {
              rows: [{
                item_instance_id: 'item:refund-replay',
                item_id: 'wudao_yujian',
                count: inventoryCount,
                slot_index: 0,
                raw_payload: { count: inventoryCount },
              }],
              rowCount: 1,
            };
          }
          if (text === 'COMMIT' && connectionNumber === 1) {
            throw new Error('simulated_refund_commit_acknowledgement_loss');
          }
          return { rows: [], rowCount: 0 };
        },
        release: () => undefined,
      };
    },
  } as unknown as Pool;
  const service = new TechniqueGenerationService();
  service.initialize({
    pool,
    generatedStore: { refreshAfterPublish: async () => undefined } as unknown as GeneratedTechniqueStoreService,
    modelConfigResolver: async () => null,
  });
  let appliedCount = 0;

  const result = await service.refundFailedConsumedJobsForPlayer({
    playerId: 'player:refund-replay',
    expectedRuntimeOwnerId: 'runtime:refund-replay',
    expectedSessionEpoch: 19,
    applyInventorySnapshot: async (items) => {
      appliedCount = items.find((entry) => entry.itemId === 'wudao_yujian')?.count ?? 0;
    },
  });

  assert.equal(result, 0);
  assert.equal(appliedCount, 13);
  assert.equal(connectionCount, 2);
  assert.equal(queries.filter((entry) => entry.sql.includes('UPDATE player_inventory_item')).length, 1);
  assert.equal(queries.filter((entry) => entry.sql.includes('item_refunded = true')).length, 1);
  assert.equal(queries.filter((entry) => entry.sql.includes('INSERT INTO durable_operation_log')).length, 1);
}

async function testDurableGenerationRejectsSecondActiveJobUnderPlayerLock(): Promise<void> {
  const queries: QueryRecord[] = [];
  const pool = createFakeConnectedPool(queries, (sql) => {
    if (sql.includes('FROM player_presence')) {
      return { rows: [{ runtime_owner_id: 'runtime:active-lock', session_epoch: 9 }], rowCount: 1 };
    }
    if (sql.includes('FROM technique_generation_job') && sql.includes('ORDER BY created_at')) {
      return { rows: [{ id: 'job:already-active' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });

  const result = await beginDurableTechniqueGeneration(pool, {
    id: 'job:new-active',
    playerId: 'player:active-lock',
    requestedCategory: 'internal',
    rolledGrade: 'mystic',
    rolledRealmLv: 31,
    playerContext: '',
    itemSpend: 1,
    budgetPercent: 1,
    totalBudget: 100,
    expectedRuntimeOwnerId: 'runtime:active-lock',
    expectedSessionEpoch: 9,
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'ACTIVE_JOB_EXISTS');
  const lockIndex = queries.findIndex((entry) => entry.sql.includes('pg_advisory_xact_lock'));
  const activeCheckIndex = queries.findIndex((entry) => entry.sql.includes('FROM technique_generation_job') && entry.sql.includes('ORDER BY created_at'));
  assert.ok(lockIndex >= 0 && activeCheckIndex > lockIndex);
  assert.ok(!queries.some((entry) => entry.sql.includes('FROM player_inventory_item')));
  assert.ok(!queries.some((entry) => entry.sql.includes('INSERT INTO technique_generation_job')));
}

async function testDurableAdoptCommitsComprehensionBeforeLearnedMarkerAndRetriesIdempotently(): Promise<void> {
  const queries: QueryRecord[] = [];
  const pool = createFakeConnectedPool(queries, (sql) => {
    if (sql.includes('FROM player_presence')) {
      return { rows: [{ runtime_owner_id: 'runtime:adopt-durable', session_epoch: 12 }], rowCount: 1 };
    }
    if (sql.includes('LEFT JOIN generated_technique')) {
      return {
        rows: [{
          status: 'generated_draft',
          draft_technique_id: 'gen:durable-adopt',
          draft_expire_at: '2099-01-01T00:00:00.000Z',
          template: {
            id: 'gen:durable-adopt',
            name: '旧名',
            grade: 'mystic',
            category: 'internal',
            realmLv: 31,
          },
        }],
        rowCount: 1,
      };
    }
    if (sql.includes("SET status = 'learned'")) {
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });

  const result = await adoptDurableTechniqueDraft(pool, {
    playerId: 'player:adopt-durable',
    jobId: 'job:adopt-durable',
    displayName: '烟霞诀',
    normalizedName: '烟霞诀',
    learnerRealmLv: 31,
    currentTick: 77,
    expectedRuntimeOwnerId: 'runtime:adopt-durable',
    expectedSessionEpoch: 12,
  });
  assert.equal(result.ok, true);
  assert.equal(result.techniqueId, 'gen:durable-adopt');
  const publishIndex = queries.findIndex((entry) => entry.sql.includes('UPDATE generated_technique'));
  const comprehensionIndex = queries.findIndex((entry) => entry.sql.includes('INSERT INTO player_technique_comprehension'));
  const learnedIndex = queries.findIndex((entry) => entry.sql.includes("SET status = 'learned'"));
  const operationIndex = queries.findIndex((entry) => entry.sql.includes('INSERT INTO durable_operation_log'));
  assert.ok(publishIndex >= 0 && comprehensionIndex > publishIndex);
  assert.ok(learnedIndex > comprehensionIndex && operationIndex > learnedIndex);
  assert.ok(queries.some((entry) => entry.sql === 'COMMIT'));

  const retryQueries: QueryRecord[] = [];
  const retryPool = createFakeConnectedPool(retryQueries, (sql) => {
    if (sql.includes('FROM player_presence')) {
      return { rows: [{ runtime_owner_id: 'runtime:adopt-durable', session_epoch: 12 }], rowCount: 1 };
    }
    if (sql.includes('FROM durable_operation_log')) {
      return {
        rows: [{
          player_id: 'player:adopt-durable',
          operation_type: 'technique_generation_adopt',
          aggregate_type: 'player_technique_comprehension',
          payload_jsonb: {
            jobId: 'job:adopt-durable',
            techniqueId: 'gen:durable-adopt',
            techniqueName: '烟霞诀',
          },
        }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  });
  const retried = await adoptDurableTechniqueDraft(retryPool, {
    playerId: 'player:adopt-durable',
    jobId: 'job:adopt-durable',
    displayName: '另一个名字',
    normalizedName: '另一个名字',
    learnerRealmLv: 31,
    currentTick: 80,
    expectedRuntimeOwnerId: 'runtime:adopt-durable',
    expectedSessionEpoch: 12,
  });
  assert.equal(retried.ok, true);
  assert.equal(retried.alreadyCommitted, true);
  assert.equal(retried.techniqueName, '烟霞诀');
  assert.ok(!retryQueries.some((entry) => entry.sql.includes('UPDATE generated_technique')));
  assert.ok(!retryQueries.some((entry) => entry.sql.includes('INSERT INTO player_technique_comprehension')));
}

async function testDurableDiscardPersistsFirstRefundRollAndDoesNotGrantTwice(): Promise<void> {
  const queries: QueryRecord[] = [];
  const pool = createFakeConnectedPool(queries, (sql) => {
    if (sql.includes('FROM player_presence')) {
      return { rows: [{ runtime_owner_id: 'runtime:discard-durable', session_epoch: 13 }], rowCount: 1 };
    }
    if (sql.includes('FROM technique_generation_job') && sql.includes('item_spend')) {
      return {
        rows: [{ status: 'generated_draft', item_spend: 2, item_consumed: true, item_refunded: false }],
        rowCount: 1,
      };
    }
    if (sql.includes('FROM player_inventory_item') && sql.includes('item_id = $2') && sql.includes('LIMIT 1')) {
      return { rows: [{ item_instance_id: 'item:merit', count: 5 }], rowCount: 1 };
    }
    if (sql.includes('COALESCE(SUM(count)')) {
      return { rows: [{ total: 5 }], rowCount: 1 };
    }
    if (sql.includes('FROM player_inventory_item') && sql.includes('raw_payload') && !sql.includes('FOR UPDATE')) {
      return {
        rows: [{ item_instance_id: 'item:merit', item_id: 'merit', count: 1005, slot_index: 0, raw_payload: { count: 1005 } }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  });
  const result = await discardDurableTechniqueDraft(pool, {
    playerId: 'player:discard-durable',
    jobId: 'job:discard-durable',
    refundCurrencyItemId: 'merit',
    refundRatio: 0.5,
    refundBasePrice: 1000,
    expectedRuntimeOwnerId: 'runtime:discard-durable',
    expectedSessionEpoch: 13,
  });
  assert.equal(result.ok, true);
  assert.equal(result.refundAmount, 1000);
  assert.equal(result.inventoryItems[0]?.count, 1005);
  assert.equal(queries.filter((entry) => entry.sql.includes('UPDATE player_inventory_item')).length, 1);
  assert.ok(queries.some((entry) => entry.sql.includes("SET status = 'discarded'")));
  assert.ok(queries.some((entry) => entry.sql.includes('INSERT INTO durable_operation_log')));

  const retryQueries: QueryRecord[] = [];
  const retryPool = createFakeConnectedPool(retryQueries, (sql) => {
    if (sql.includes('FROM player_presence')) {
      return { rows: [{ runtime_owner_id: 'runtime:discard-durable', session_epoch: 13 }], rowCount: 1 };
    }
    if (sql.includes('FROM durable_operation_log')) {
      return {
        rows: [{
          player_id: 'player:discard-durable',
          operation_type: 'technique_generation_discard',
          aggregate_type: 'technique_generation_job',
          payload_jsonb: {
            jobId: 'job:discard-durable',
            itemSpend: 2,
            refundRatio: 0.5,
            refundAmount: 1000,
            refundCurrencyItemId: 'merit',
          },
        }],
        rowCount: 1,
      };
    }
    if (sql.includes('FROM player_inventory_item') && sql.includes('raw_payload')) {
      return {
        rows: [{ item_instance_id: 'item:merit', item_id: 'merit', count: 1005, slot_index: 0, raw_payload: { count: 1005 } }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  });
  const retried = await discardDurableTechniqueDraft(retryPool, {
    playerId: 'player:discard-durable',
    jobId: 'job:discard-durable',
    refundCurrencyItemId: 'merit',
    refundRatio: 0.7,
    refundBasePrice: 1000,
    expectedRuntimeOwnerId: 'runtime:discard-durable',
    expectedSessionEpoch: 13,
  });
  assert.equal(retried.ok, true);
  assert.equal(retried.alreadyCommitted, true);
  assert.equal(retried.refundRatio, 0.5);
  assert.equal(retried.refundAmount, 1000);
  assert.ok(!retryQueries.some((entry) => entry.sql.includes('UPDATE player_inventory_item')));
}

async function testCommittedTechniqueReplayRejectsCrossPlayerAndWrongOperationType(): Promise<void> {
  const adoptQueries: QueryRecord[] = [];
  const adoptPool = createFakeConnectedPool(adoptQueries, (sql) => {
    if (sql.includes('FROM player_presence')) {
      return { rows: [{ runtime_owner_id: 'runtime:replay-attacker', session_epoch: 21 }], rowCount: 1 };
    }
    if (sql.includes('FROM durable_operation_log')) {
      return {
        rows: [{
          player_id: 'player:replay-owner',
          operation_type: 'technique_generation_adopt',
          aggregate_type: 'player_technique_comprehension',
          payload_jsonb: {
            jobId: 'job:replay-owner',
            techniqueId: 'gen:replay-owner',
            techniqueName: '他人功法',
          },
        }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  });
  const service = new TechniqueGenerationService();
  let refreshCount = 0;
  let pendingApplyCount = 0;
  service.initialize({
    pool: adoptPool,
    generatedStore: {
      refreshAfterPublish: async () => {
        refreshCount += 1;
      },
    } as unknown as GeneratedTechniqueStoreService,
    modelConfigResolver: async () => null,
  });

  await assert.rejects(
    () => service.adoptDraft({
      playerId: 'player:replay-attacker',
      jobId: 'job:replay-owner',
      customName: '窃取功法',
      learnerRealmLv: 31,
      currentTick: 100,
      expectedRuntimeOwnerId: 'runtime:replay-attacker',
      expectedSessionEpoch: 21,
      applyPendingComprehension: async () => {
        pendingApplyCount += 1;
        return true;
      },
    }),
    /technique_generation_operation_replay_identity_conflict/,
  );
  assert.equal(refreshCount, 0);
  assert.equal(pendingApplyCount, 0);
  assert.ok(!adoptQueries.some((entry) => entry.sql.includes('INSERT INTO player_technique_comprehension')));

  const discardQueries: QueryRecord[] = [];
  const discardPool = createFakeConnectedPool(discardQueries, (sql) => {
    if (sql.includes('FROM player_presence')) {
      return { rows: [{ runtime_owner_id: 'runtime:discard-replay', session_epoch: 22 }], rowCount: 1 };
    }
    if (sql.includes('FROM durable_operation_log')) {
      return {
        rows: [{
          player_id: 'player:discard-replay',
          operation_type: 'technique_generation_adopt',
          aggregate_type: 'technique_generation_job',
          payload_jsonb: {
            jobId: 'job:discard-replay',
            itemSpend: 2,
            refundRatio: 0.5,
            refundAmount: 1000,
            refundCurrencyItemId: 'merit',
          },
        }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  });
  await assert.rejects(
    () => discardDurableTechniqueDraft(discardPool, {
      playerId: 'player:discard-replay',
      jobId: 'job:discard-replay',
      refundCurrencyItemId: 'merit',
      refundRatio: 0.5,
      refundBasePrice: 1000,
      expectedRuntimeOwnerId: 'runtime:discard-replay',
      expectedSessionEpoch: 22,
    }),
    /technique_generation_operation_replay_identity_conflict/,
  );
  assert.ok(!discardQueries.some((entry) => entry.sql.includes('UPDATE player_inventory_item')));
  assert.ok(!discardQueries.some((entry) => entry.sql.includes("SET status = 'discarded'")));
}

async function testPreviewFailedTechniqueGenerationItemRefunds(): Promise<void> {
  const queries: QueryRecord[] = [];
  const pool = {
    query: async (sql: unknown) => {
      const text = String(sql);
      queries.push({ sql: text, params: undefined });
      if (text.includes('COUNT(DISTINCT player_id)')) {
        return { rows: [{ jobs: 3, players: 2, items: 8 }], rowCount: 1 };
      }
      if (text.includes('GROUP BY player_id')) {
        return {
          rows: [
            { player_id: 'p_refund_a', jobs: 2, items: 5 },
            { player_id: 'p_refund_b', jobs: 1, items: 3 },
          ],
          rowCount: 2,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;

  const preview = await previewFailedTechniqueGenerationItemRefunds(pool);

  assert.equal(preview.jobs, 3);
  assert.equal(preview.players, 2);
  assert.equal(preview.items, 8);
  assert.deepEqual(preview.samples.map((entry) => entry.playerId), ['p_refund_a', 'p_refund_b']);
  assert.equal(queries.length, 2);
  for (const query of queries) {
    assert.ok(query.sql.includes("status = 'failed'"));
    assert.ok(query.sql.includes('item_consumed = true'));
    assert.ok(query.sql.includes('item_refunded = false'));
  }
}

async function testRefundFailedTechniqueGenerationItemsWritesInventoryAuditAndMarkers(): Promise<void> {
  const queries: QueryRecord[] = [];
  const pool = createFakeConnectedPool(queries, (sql) => {
    if (sql.includes('FROM technique_generation_job') && sql.includes('FOR UPDATE SKIP LOCKED')) {
      return {
        rows: [
          { id: 'job_refund_history_1', player_id: 'p_history_refund', item_spend: 2 },
          { id: 'job_refund_history_2', player_id: 'p_history_refund', item_spend: 5 },
        ],
        rowCount: 2,
      };
    }
    if (sql.includes('FROM player_presence') && sql.includes('online = true')) {
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('FROM player_inventory_item') && sql.includes('item_id = $2')) {
      return {
        rows: [{ item_instance_id: 'item_existing_wudao_yujian', count: 3 }],
        rowCount: 1,
      };
    }
    if (sql.includes('UPDATE technique_generation_job') && sql.includes('item_refunded = true')) {
      return { rows: [], rowCount: 2 };
    }
    return { rows: [], rowCount: 0 };
  });

  const result = await refundFailedTechniqueGenerationItems(pool, { batchSize: 10, maxJobs: 2 });

  assert.deepEqual(result, { jobs: 2, players: 1, items: 7 });
  assert.ok(queries.some((entry) => entry.sql === 'BEGIN'));
  assert.ok(queries.some((entry) => entry.sql === 'COMMIT'));
  assert.ok(!queries.some((entry) => entry.sql === 'ROLLBACK'));
  assert.ok(queries.some((entry) => entry.sql.includes('FOR UPDATE SKIP LOCKED')));
  assert.ok(queries.some((entry) => entry.sql.includes('FROM player_presence') && entry.sql.includes('online = true')));
  assert.ok(queries.some((entry) => entry.sql.includes('pg_advisory_xact_lock') && entry.params?.[1] === 'p_history_refund'));
  const inventoryUpdate = queries.find((entry) => entry.sql.includes('UPDATE player_inventory_item'));
  assert.ok(inventoryUpdate);
  assert.equal(inventoryUpdate.params?.[0], 'item_existing_wudao_yujian');
  assert.equal(inventoryUpdate.params?.[1], 'wudao_yujian');
  assert.equal(inventoryUpdate.params?.[2], 10);
  assert.ok(queries.some((entry) => entry.sql.includes('INSERT INTO player_recovery_watermark')));
  assert.equal(queries.filter((entry) => entry.sql.includes('INSERT INTO outbox_event')).length, 2);
  assert.equal(queries.filter((entry) => entry.sql.includes('INSERT INTO asset_audit_log')).length, 2);
  const markerUpdate = queries.find((entry) => entry.sql.includes('UPDATE technique_generation_job') && entry.sql.includes('item_refunded = true'));
  assert.ok(markerUpdate);
  assert.deepEqual(markerUpdate.params?.[0], ['job_refund_history_1', 'job_refund_history_2']);
}

async function testRefundFailedTechniqueGenerationItemsBlocksOnlinePlayersByDefault(): Promise<void> {
  const queries: QueryRecord[] = [];
  const pool = createFakeConnectedPool(queries, (sql) => {
    if (sql.includes('FROM technique_generation_job') && sql.includes('FOR UPDATE SKIP LOCKED')) {
      return {
        rows: [{ id: 'job_online_history', player_id: 'p_online_history', item_spend: 1 }],
        rowCount: 1,
      };
    }
    if (sql.includes('FROM player_presence') && sql.includes('online = true')) {
      return { rows: [{ player_id: 'p_online_history' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });

  await assert.rejects(
    () => refundFailedTechniqueGenerationItems(pool, { batchSize: 10 }),
    /online players=p_online_history/,
  );
  assert.ok(queries.some((entry) => entry.sql === 'ROLLBACK'));
  assert.ok(!queries.some((entry) => entry.sql.includes('UPDATE player_inventory_item')));
  assert.ok(!queries.some((entry) => entry.sql.includes('item_refunded = true') && entry.sql.includes('UPDATE technique_generation_job')));
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

async function testCurrentStatusRestoresGeneratedDraftPreview(): Promise<void> {
  const queries: QueryRecord[] = [];
  const pool = {
    query: async (sql: unknown, params?: unknown[]) => {
      const text = String(sql);
      queries.push({ sql: text, params });
      if (text.includes('JOIN generated_technique')) {
        return {
          rows: [{
            template: {
              id: 'gen_restore_draft_smoke',
              name: '烟霞诀',
              grade: 'mystic',
              category: 'internal',
              realmLv: 31,
              attrRatio: { strength: 1, physique: 1 },
              maxLayer: 9,
              expDifficulty: 1,
            },
            model_name: 'deepseek-chat',
          }],
          rowCount: 1,
        };
      }
      if (text.includes('FROM technique_generation_job') && text.includes('requested_category')) {
        return {
          rows: [{
            id: 'job_restore_draft_smoke',
            status: 'generated_draft',
            requested_category: 'internal',
            rolled_grade: 'mystic',
            rolled_realm_lv: 31,
            created_at: '2026-06-09T00:00:00.000Z',
            draft_expire_at: '2026-06-10T00:00:00.000Z',
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
  const service = new TechniqueGenerationService();
  service.initialize({
    pool,
    generatedStore: { refreshAfterPublish: async () => undefined } as unknown as GeneratedTechniqueStoreService,
    modelConfigResolver: async () => createFakeTextModelConfig(),
  });

  const status = await service.getCurrentStatusForPlayer('p_restore_draft_smoke');

  assert.equal(status.currentJob?.jobId, 'job_restore_draft_smoke');
  assert.equal(status.currentJob?.status, 'generated_draft');
  assert.equal(status.currentDraft?.techniqueId, 'gen_restore_draft_smoke');
  assert.equal(status.currentDraft?.suggestedName, '烟霞诀');
  assert.equal(status.currentDraft?.modelName, 'deepseek-chat');
  assert.ok(queries.some((entry) => entry.sql.includes('ORDER BY CASE status')));
}

async function testRequestGenerationBlocksActiveDraftWithoutConsumingItem(): Promise<void> {
  const queries: QueryRecord[] = [];
  const pool = {
    query: async (sql: unknown, params?: unknown[]) => {
      const text = String(sql);
      queries.push({ sql: text, params });
      if (text.includes('FROM technique_generation_job') && text.includes('requested_category')) {
        return {
          rows: [{
            id: 'job_active_draft_smoke',
            status: 'generated_draft',
            requested_category: 'arts',
            rolled_grade: 'yellow',
            rolled_realm_lv: 31,
            created_at: '2026-06-09T00:00:00.000Z',
            draft_expire_at: '2026-06-10T00:00:00.000Z',
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
  const service = new TechniqueGenerationService();
  let modelResolveCount = 0;
  let consumedCount = 0;
  service.initialize({
    pool,
    generatedStore: { refreshAfterPublish: async () => undefined } as unknown as GeneratedTechniqueStoreService,
    modelConfigResolver: async () => {
      modelResolveCount += 1;
      return createFakeTextModelConfig();
    },
  });

  const result = await service.requestGeneration({
    playerId: 'p_active_draft_smoke',
    playerRealmLv: 31,
    category: 'internal',
  });

  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'ACTIVE_JOB_EXISTS');
  assert.equal(modelResolveCount, 0);
  assert.equal(consumedCount, 0);
  assert.ok(!queries.some((entry) => entry.sql.includes('INSERT INTO technique_generation_job')));
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
      getSessionFence: () => ({ runtimeOwnerId: 'runtime:gateway-smoke', sessionEpoch: 1 }),
      replaceInventoryItems: () => undefined,
    },
  });
  helper.setService({
    getCurrentStatusForPlayer: async () => ({ currentJob: null, currentDraft: null }),
  } as unknown as TechniqueGenerationService);

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
      itemSpendMax?: number;
      itemSpendDefault?: number;
      realmLvChances?: unknown[];
      gradeChances?: unknown[];
    };
  };
  assert.equal(payload.available, true);
  assert.equal(payload.rollRange?.itemSpendMax, 100);
  assert.equal(payload.rollRange?.itemSpendDefault, 3);
  assert.ok((payload.rollRange?.realmLvChances?.length ?? 0) > 0);
  assert.ok((payload.rollRange?.gradeChances?.length ?? 0) > 0);
  assert.deepEqual(result, emitted[0]?.payload);
}

async function testGatewayRequiresDirtyDomainFlushBeforeDurableMutation(): Promise<void> {
  let flushCalls = 0;
  const dirtyByPlayerId = new Map<string, Set<string>>([
    ['player:dirty-technique-generation', new Set(['inventory'])],
  ]);
  const helper = new WorldGatewayTechniqueGenerationHelper({
    gatewayGuardHelper: { requirePlayerId: () => null },
    worldClientEventService: { emitGatewayError: () => undefined },
    playerRuntimeService: {
      getPlayerRealmLv: () => 31,
      listDirtyPlayerDomains: () => dirtyByPlayerId,
    },
    playerPersistenceFlushService: {
      async flushPlayerDomains() {
        flushCalls += 1;
        return false;
      },
    },
  });
  const privateHelper = helper as unknown as {
    prepareInventoryForDurableMutation(playerId: string): Promise<void>;
  };

  await assert.rejects(
    () => privateHelper.prepareInventoryForDurableMutation('player:dirty-technique-generation'),
    /technique_generation_dirty_inventory_flush_failed/,
  );
  assert.equal(flushCalls, 1);

  dirtyByPlayerId.clear();
  await privateHelper.prepareInventoryForDurableMutation('player:clean-technique-generation');
  assert.equal(flushCalls, 1);
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
      getSessionFence: () => ({ runtimeOwnerId: 'runtime:gateway-error', sessionEpoch: 2 }),
      replaceInventoryItems: () => undefined,
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
      getPlayer: () => ({ lifeElapsedTicks: 42 }),
      getSessionFence: () => ({ runtimeOwnerId: 'runtime:gateway-adopt', sessionEpoch: 5 }),
      replaceInventoryItems: () => undefined,
      addPendingTechniqueComprehensionById: (_playerId: string, techniqueId: string) => {
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
    adoptDraft: async (params) => {
      await params.applyPendingComprehension?.('gen_adopt_smoke');
      return { success: true, techniqueId: 'gen_adopt_smoke', techniqueName: '烟霞诀' };
    },
    discardDraft: async (params) => {
      await params.applyInventorySnapshot?.([]);
      return { success: true };
    },
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
      target: { type: 'line', targetMode: 'entity' },
      structureStrength: { damage: 4, cost: 0, cooldown: 1, chant: 0, castRange: 3, area: 1 },
      formulaStrength: {
        attributeBases: { spellAtk: 4, resolvePower: 1 },
        percentBonuses: { moveSpeed: 0 },
      },
    }],
  }, 'arts');
  assert.equal(result.valid, true);
}

async function testArtsTileTargetModeNormalizesForEntityDamage(): Promise<void> {
  const fixed = normalizeGeneratedTechniqueCandidateForServer({
    name: '裂风剑诀',
    category: 'arts',
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
        attributeBases: { spellAtk: 4 },
      },
    }],
  }, {
    category: 'arts',
    grade: 'mystic',
    realmLv: 31,
    maxLayer: 9,
    budgetPercent: 1,
    totalBudget: calcArtsBudgetMax('mystic', 31),
    playerContext: '范围攻击，打前方敌人',
  });
  const skill = (fixed.skills as { target?: { targetMode?: string } }[])[0];
  assert.equal(skill?.target?.targetMode, 'any');

  const previousEntityFixed = normalizeGeneratedTechniqueCandidateForServer({
    name: '裂风剑诀',
    category: 'arts',
    maxLayer: 9,
    skills: [{
      name: '裂风斩',
      desc: '凝风成刃，直斩前方敌人。',
      unlockLevel: 1,
      damageKind: 'spell',
      element: 'wood',
      target: { type: 'line', targetMode: 'entity' },
      structureStrength: { damage: 4, cost: 0, cooldown: 1, chant: 0, castRange: 3, area: 1 },
      formulaStrength: {
        attributeBases: { spellAtk: 4 },
      },
    }],
  }, {
    category: 'arts',
    grade: 'mystic',
    realmLv: 31,
    maxLayer: 9,
    budgetPercent: 1,
    totalBudget: calcArtsBudgetMax('mystic', 31),
    playerContext: '上一版错误迁移后的范围攻击',
  });
  const previousEntitySkill = (previousEntityFixed.skills as { target?: { targetMode?: string } }[])[0];
  assert.equal(previousEntitySkill?.target?.targetMode, 'any');

  const singleFixed = normalizeGeneratedTechniqueCandidateForServer({
    name: '点星诀',
    category: 'arts',
    maxLayer: 9,
    skills: [{
      name: '点星指',
      desc: '凝聚星芒点杀眼前敌人。',
      unlockLevel: 1,
      damageKind: 'spell',
      element: 'water',
      target: { type: 'single', targetMode: 'tile' },
      structureStrength: { damage: 4, cost: 0, cooldown: 1, chant: 0, castRange: 3, area: 0 },
      formulaStrength: {
        attributeBases: { spellAtk: 4 },
      },
    }],
  }, {
    category: 'arts',
    grade: 'mystic',
    realmLv: 31,
    maxLayer: 9,
    budgetPercent: 1,
    totalBudget: calcArtsBudgetMax('mystic', 31),
    playerContext: '单体攻击，打眼前敌人',
  });
  const singleSkill = (singleFixed.skills as { target?: { targetMode?: string } }[])[0];
  assert.equal(singleSkill?.target?.targetMode, 'entity');

  const terrainFixed = normalizeGeneratedTechniqueCandidateForServer({
    name: '裂石诀',
    category: 'arts',
    maxLayer: 9,
    skills: [{
      name: '裂石术',
      desc: '震裂地块与临时石头。',
      unlockLevel: 1,
      damageKind: 'spell',
      element: 'earth',
      target: { type: 'area', targetMode: 'tile' },
      structureStrength: { damage: 1, cost: 0, cooldown: 0, chant: 0, castRange: 0, area: 2 },
      formulaStrength: {
        attributeBases: { spellAtk: 1 },
      },
    }],
  }, {
    category: 'arts',
    grade: 'mystic',
    realmLv: 31,
    maxLayer: 9,
    budgetPercent: 1,
    totalBudget: calcArtsBudgetMax('mystic', 31),
    playerContext: '破坏地块和临时障碍',
  });
  const terrainSkill = (terrainFixed.skills as { target?: { targetMode?: string } }[])[0];
  assert.equal(terrainSkill?.target?.targetMode, 'tile');
}

async function testAiArtsStrengthMigrationNormalizesPublishedTileDamageSkill(): Promise<void> {
  const queries: QueryRecord[] = [];
  let storedTemplate: any = null;
  let storedValidationReport: any = null;
  let refreshCount = 0;
  const row = createPublishedTileDamageArtsRow();
  const pool = createFakeConnectedPool(queries, (sql) => {
    if (sql.includes('SELECT id,') && sql.includes('FROM generated_technique') && sql.includes("validation_report ? 'artsStrength'")) {
      return { rows: [row], rowCount: 1 };
    }
    if (sql.includes('UPDATE generated_technique') && sql.includes('SET template = $2::jsonb')) {
      const params = queries[queries.length - 1]?.params ?? [];
      storedTemplate = JSON.parse(String(params[1]));
      storedValidationReport = JSON.parse(String(params[2]));
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  const conversion = new AiArtsStrengthV1ToV2Conversion(
    { getPool: () => pool } as never,
    null,
    { refreshAfterPublish: async () => { refreshCount += 1; } } as unknown as GeneratedTechniqueStoreService,
  );

  const dryRun = await conversion.run({ mode: 'dry-run' });
  assert.equal(dryRun.matchedRows, 1);
  assert.equal(dryRun.convertedRows, 1);
  assert.equal((dryRun.samples[0]?.before as any)?.target?.targetMode, 'tile');
  assert.equal((dryRun.samples[0]?.after as any)?.target?.targetMode, 'any');

  const applied = await conversion.run({ mode: 'apply' });
  assert.equal(applied.matchedRows, 1);
  assert.equal(applied.convertedRows, 1);
  assert.equal(refreshCount, 1);
  assert.equal(storedTemplate?.skills?.[0]?.targetMode, 'any');
  assert.equal(storedTemplate?.skills?.[0]?.targeting?.targetMode, 'any');
  assert.equal(storedValidationReport?.artsStrength?.rawCandidate?.skills?.[0]?.target?.targetMode, 'any');
  assert.equal(storedValidationReport?.artsStrength?.normalizedTemplate?.skills?.[0]?.target?.targetMode, 'any');
}

function createPublishedTileDamageArtsRow(): Record<string, unknown> {
  const rawCandidate = {
    name: '万虚归墟',
    desc: '引动虚空乱流，以大湮灭之法吞没八方，灵力激荡，威压天地。',
    grade: 'heaven',
    category: 'arts',
    realmLv: 45,
    maxLayer: 9,
    budgetPercent: 1.0012,
    totalBudget: 89.5433,
    skills: [{
      name: '大湮灭术',
      desc: '虚空塌陷，湮灭万物，瞬息吞噬广大区域。',
      unlockLevel: 1,
      damageKind: 'spell',
      element: 'water',
      target: { type: 'area', targetMode: 'tile' },
      structureStrength: { area: 100, cost: -10, chant: 0, damage: -100, cooldown: 30, castRange: -100 },
      formulaStrength: { attributeBases: { spellAtk: 1 } },
    }],
  };
  const skill = expandTechniqueArtsStrengthSkill({
    techniqueId: 'gen_e24a698b2bc44477',
    grade: 'heaven',
    realmLv: 45,
    skillIndex: 0,
    skill: normalizeTechniqueArtsStrengthSkill(rawCandidate.skills[0]),
    targetBudget: rawCandidate.totalBudget,
  }).skill;
  return {
    id: 'gen_e24a698b2bc44477',
    status: 'published',
    display_name: '万虚归墟',
    grade: 'heaven',
    realm_lv: 45,
    template: {
      id: 'gen_e24a698b2bc44477',
      name: '万虚归墟',
      grade: 'heaven',
      category: 'arts',
      realmLv: 45,
      budgetPercent: 1.0012,
      totalBudget: 89.5433,
      maxLayer: 9,
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
    outputChecklist?: string[];
    outputExample?: { skills?: { target?: { targetMode?: string } }[] };
  };
  assert.equal(artsPayload.generationContext?.grade, 'earth');
  assert.equal(artsPayload.generationContext?.realmLv, 43);
  assert.equal(artsPayload.generationContext?.realmStageLabel, '金丹前期');
  assert.equal(artsPayload.generationContext?.itemSpend, 3);
  assert.equal(artsPayload.generationContext?.budgetPercent, 1.1);
  assertApprox(Number(artsPayload.budgetContext?.actualTotalBudget), calcArtsBudgetMax('earth', 43) * 1.1, 0.0001);
  assert.ok(artsPayload.strengthRules?.calculationFormulas?.some((entry) => entry.includes('itemBudget')));
  assert.ok(artsPayload.outputChecklist?.some((entry) => entry.includes('普通范围伤害术法的 targetMode 必须优先使用 any')));
  assert.equal(artsPayload.outputExample?.skills?.[0]?.target?.targetMode, 'any');

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
    target: { type: 'area', targetMode: 'entity' },
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
  assert.equal(expanded.skill.targetMode, 'entity');
  assert.equal(expanded.skill.targeting?.range, 1);
  assert.equal(expanded.skill.targeting?.targetMode, 'entity');
  assert.ok((expanded.skill.targeting?.radius ?? 0) >= 0);
}

async function testArtsStrengthBudgetAllocatesAndRefundsByItem(): Promise<void> {
  const normalized = normalizeTechniqueArtsStrengthSkill({
    name: '散星诀',
    desc: '催动灵力化作漫天星芒，覆盖广域却威能稀薄。',
    unlockLevel: 1,
    damageKind: 'spell',
    element: 'water',
    target: { type: 'area', targetMode: 'entity' },
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
  assert.equal(expanded.skill.targetMode, 'entity');
  assert.equal(expanded.skill.targeting?.range, 3);
  assert.equal(expanded.skill.targeting?.targetMode, 'entity');
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
  await testExecuteGenerationFailureRefundsConsumedItems();
  await testFailedConsumedJobRefundsOnce();
  await testGenerationConsumeCommitAcknowledgementLossReplaysIdempotently();
  await testStaleGenerationWorkerFailureCannotRefundCommittedDraft();
  await testRefundCommitReplayAlwaysHydratesRuntimeInventory();
  await testDurableGenerationRejectsSecondActiveJobUnderPlayerLock();
  await testDurableAdoptCommitsComprehensionBeforeLearnedMarkerAndRetriesIdempotently();
  await testDurableDiscardPersistsFirstRefundRollAndDoesNotGrantTwice();
  await testCommittedTechniqueReplayRejectsCrossPlayerAndWrongOperationType();
  await testPreviewFailedTechniqueGenerationItemRefunds();
  await testRefundFailedTechniqueGenerationItemsWritesInventoryAuditAndMarkers();
  await testRefundFailedTechniqueGenerationItemsBlocksOnlinePlayersByDefault();
  await testSchemaMigratesPlayerIdsToVarchar();
  await testPublishGeneratedTechniqueCastsRepeatedNameParameter();
  await testCurrentStatusRestoresGeneratedDraftPreview();
  await testRequestGenerationBlocksActiveDraftWithoutConsumingItem();
  await testGatewayStatusEmitsRollRange();
  await testGatewayRequiresDirtyDomainFlushBeforeDurableMutation();
  await testGatewayGenerateExceptionEmitsFailureResult();
  await testGatewayAdoptAndDiscardEmitResultEvents();
  await testGeneratedInternalPreviewNormalizesAttrRatioAliases();
  await testGeneratedTechniqueRegistryExpandsQuantifiedTemplates();
  await testGeneratedTechniqueBootstrapProjectionKeepsTemplateFields();
  await testGeneratedArtsTechniqueRecoversDraftSkillShape();
  await testInternalCandidateRejectsUnknownAttrRatioKeys();
  await testArtsCandidateAcceptsStrengthShape();
  await testArtsTileTargetModeNormalizesForEntityDamage();
  await testAiArtsStrengthMigrationNormalizesPublishedTileDamageSkill();
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

/**
 * 自创功法生命周期的专用持久化事务。
 *
 * 功法生成会同时改变 job、玩家背包、生成模板和待领悟功法。这里复用玩家资产
 * advisory lock、session fence、durable operation、outbox 与资产审计，避免运行态
 * 先扣发资产后再补数据库标记形成崩溃窗口。
 */

import type { Pool, PoolClient } from 'pg';
import {
  TECHNIQUE_GRADE_ORDER,
  TECHNIQUE_AGGREGATION_MAX_JADE_ITEM_SPEND,
  calculateTechniqueComprehensionRequiredProgress,
  type TechniqueCategory,
  type TechniqueGrade,
  type TechniqueTemplate,
} from '@mud/shared';

import {
  GENERATED_TECHNIQUE_TABLE,
  TECHNIQUE_GENERATION_JOB_TABLE,
  insertPublishedAggregateTechnique,
  type InsertGeneratedTechniqueParams,
  type InsertGenerationJobParams,
  type InsertPublishedAggregateTechniqueParams,
} from './generated-technique-persistence.service';

const PLAYER_PRESENCE_TABLE = 'player_presence';
const PLAYER_INVENTORY_ITEM_TABLE = 'player_inventory_item';
const PLAYER_TECHNIQUE_STATE_TABLE = 'player_technique_state';
const PLAYER_TECHNIQUE_COMPREHENSION_TABLE = 'player_technique_comprehension';
const PLAYER_RECOVERY_WATERMARK_TABLE = 'player_recovery_watermark';
const DURABLE_OPERATION_LOG_TABLE = 'durable_operation_log';
const OUTBOX_EVENT_TABLE = 'outbox_event';
const ASSET_AUDIT_LOG_TABLE = 'asset_audit_log';
const PLAYER_ASSET_LOCK_NAMESPACE = 7101;
const TECHNIQUE_GENERATION_ITEM_ID = 'wudao_yujian';
const GENERATION_EXECUTION_STALE_INTERVAL = '10 minutes';

const ACTIVE_GENERATION_JOB_PREDICATE = `(
  status IN ('pending', 'running')
  OR (
    status = 'generated_draft'
    AND (draft_expire_at IS NULL OR draft_expire_at > NOW())
  )
)`;

export interface TechniqueGenerationSessionFence {
  expectedRuntimeOwnerId: string;
  expectedSessionEpoch: number;
}

/** 自创功法事务已发送 COMMIT，但经过一次幂等重放后仍无法确认最终结果。 */
export class TechniqueGenerationCommitOutcomeUnknownError extends Error {
  constructor(readonly playerId: string, cause: unknown) {
    super(
      `technique_generation_commit_outcome_unknown:${playerId}`,
      cause === undefined ? undefined : { cause },
    );
    this.name = 'TechniqueGenerationCommitOutcomeUnknownError';
  }
}

export interface TechniqueGenerationRuntimeInventoryItem {
  itemId: string;
  itemInstanceId: string;
  count: number;
  slotIndex: number;
  rawPayload: Record<string, unknown>;
}

export interface BeginDurableTechniqueGenerationInput extends InsertGenerationJobParams, TechniqueGenerationSessionFence {}

export interface BeginDurableTechniqueGenerationResult {
  ok: boolean;
  alreadyCommitted: boolean;
  inventoryItems: TechniqueGenerationRuntimeInventoryItem[];
  errorCode?: 'ACTIVE_JOB_EXISTS' | 'ITEM_NOT_ENOUGH';
}

export interface PublishDurableJadeTechniqueAggregationInput
  extends InsertPublishedAggregateTechniqueParams, TechniqueGenerationSessionFence {
  playerId: string;
  operationId: string;
  requestFingerprint: string;
  itemSpend: number;
}

export interface PublishDurableJadeTechniqueAggregationResult {
  ok: boolean;
  alreadyCommitted: boolean;
  inventoryItems: TechniqueGenerationRuntimeInventoryItem[];
  errorCode?: 'ITEM_NOT_ENOUGH';
}

/** 将指定数量悟道玉简的扣除与统合法卷发布原子提交，重放只回读已提交结果。 */
export async function publishDurableJadeTechniqueAggregation(
  pool: Pool,
  input: PublishDurableJadeTechniqueAggregationInput,
): Promise<PublishDurableJadeTechniqueAggregationResult> {
  if (!Number.isInteger(input.itemSpend)
    || input.itemSpend < 1
    || input.itemSpend > TECHNIQUE_AGGREGATION_MAX_JADE_ITEM_SPEND) {
    throw new Error('technique_aggregation_jade_item_spend_invalid');
  }
  return withPlayerTechniqueGenerationTransaction(pool, input.playerId, async (client) => {
    await assertTechniqueGenerationSessionFence(client, input.playerId, input);
    const operationId = buildTechniqueAggregationJadeOperationId(input.operationId);
    const existingOperation = await loadCommittedTechniqueAggregationJadeOperation(client, operationId, input);
    if (existingOperation) {
      return {
        ok: true,
        alreadyCommitted: true,
        inventoryItems: await loadTechniqueGenerationRuntimeInventory(client, input.playerId),
      };
    }

    const consumed = await consumeTechniqueGenerationItem(
      client,
      input.playerId,
      TECHNIQUE_GENERATION_ITEM_ID,
      input.itemSpend,
    );
    if (!consumed.ok) {
      return {
        ok: false,
        alreadyCommitted: false,
        inventoryItems: [],
        errorCode: 'ITEM_NOT_ENOUGH',
      };
    }

    const inserted = await insertPublishedAggregateTechnique(client, input);
    if (inserted !== 'inserted') {
      throw new Error(`technique_aggregation_jade_operation_missing:${input.id}`);
    }
    await touchTechniqueGenerationRecoveryWatermark(client, input.playerId, 'inventory_version');
    await insertCommittedTechniqueGenerationOperation(client, {
      operationId,
      playerId: input.playerId,
      operationType: 'technique_aggregation_jade_consume',
      aggregateType: GENERATED_TECHNIQUE_TABLE,
      aggregateId: input.id,
      fence: input,
      payload: {
        jobId: input.id,
        aggregateTechniqueId: input.id,
        requestFingerprint: input.requestFingerprint,
        itemId: TECHNIQUE_GENERATION_ITEM_ID,
        itemSpend: input.itemSpend,
      },
    });
    await insertTechniqueGenerationOutbox(client, {
      operationId,
      topic: 'player.inventory.consumed',
      playerId: input.playerId,
      payload: {
        playerId: input.playerId,
        sourceType: 'technique_aggregation_jade',
        sourceRefId: input.id,
        consumedItems: [{ itemId: TECHNIQUE_GENERATION_ITEM_ID, count: input.itemSpend }],
      },
    });
    await insertTechniqueGenerationAssetAudit(client, {
      operationId,
      playerId: input.playerId,
      assetRefId: input.id,
      action: 'consume',
      delta: {
        sourceType: 'technique_aggregation_jade',
        itemId: TECHNIQUE_GENERATION_ITEM_ID,
        count: -input.itemSpend,
      },
      before: { itemId: TECHNIQUE_GENERATION_ITEM_ID, count: consumed.beforeCount },
      after: { itemId: TECHNIQUE_GENERATION_ITEM_ID, count: consumed.afterCount },
    });

    return {
      ok: true,
      alreadyCommitted: false,
      inventoryItems: await loadTechniqueGenerationRuntimeInventory(client, input.playerId),
    };
  });
}

export async function beginDurableTechniqueGeneration(
  pool: Pool,
  input: BeginDurableTechniqueGenerationInput,
): Promise<BeginDurableTechniqueGenerationResult> {
  return withPlayerTechniqueGenerationTransaction(pool, input.playerId, async (client) => {
    await assertTechniqueGenerationSessionFence(client, input.playerId, input);
    const operationId = buildTechniqueGenerationOperationId('consume', input.id);
    const existingOperation = await loadCommittedTechniqueGenerationOperation(client, operationId, {
      playerId: input.playerId,
      operationType: 'technique_generation_consume',
      aggregateType: TECHNIQUE_GENERATION_JOB_TABLE,
      jobId: input.id,
    });
    if (existingOperation) {
      return {
        ok: true,
        alreadyCommitted: true,
        inventoryItems: await loadTechniqueGenerationRuntimeInventory(client, input.playerId),
      };
    }

    const activeJob = await client.query(
      `SELECT id
         FROM ${TECHNIQUE_GENERATION_JOB_TABLE}
        WHERE player_id = $1
          AND ${ACTIVE_GENERATION_JOB_PREDICATE}
        ORDER BY created_at ASC, id ASC
        LIMIT 1
        FOR UPDATE`,
      [input.playerId],
    );
    if ((activeJob.rowCount ?? 0) > 0) {
      return {
        ok: false,
        alreadyCommitted: false,
        inventoryItems: [],
        errorCode: 'ACTIVE_JOB_EXISTS',
      };
    }

    const consumed = await consumeTechniqueGenerationItem(
      client,
      input.playerId,
      TECHNIQUE_GENERATION_ITEM_ID,
      input.itemSpend,
    );
    if (!consumed.ok) {
      return {
        ok: false,
        alreadyCommitted: false,
        inventoryItems: [],
        errorCode: 'ITEM_NOT_ENOUGH',
      };
    }

    await client.query(
      `INSERT INTO ${TECHNIQUE_GENERATION_JOB_TABLE} (
        id, player_id, status, requested_category,
        rolled_grade, rolled_realm_lv, player_context, item_spend,
        rolled_budget_percent, rolled_total_budget,
        item_consumed, consumed_at
      ) VALUES ($1,$2,'pending',$3,$4,$5,$6,$7,$8,$9,true,NOW())`,
      [
        input.id,
        input.playerId,
        input.requestedCategory,
        input.rolledGrade,
        input.rolledRealmLv,
        input.playerContext,
        input.itemSpend,
        input.budgetPercent,
        input.totalBudget,
      ],
    );
    await touchTechniqueGenerationRecoveryWatermark(client, input.playerId, 'inventory_version');
    await insertCommittedTechniqueGenerationOperation(client, {
      operationId,
      playerId: input.playerId,
      operationType: 'technique_generation_consume',
      aggregateType: TECHNIQUE_GENERATION_JOB_TABLE,
      aggregateId: input.id,
      fence: input,
      payload: {
        jobId: input.id,
        itemId: TECHNIQUE_GENERATION_ITEM_ID,
        itemSpend: input.itemSpend,
      },
    });
    await insertTechniqueGenerationOutbox(client, {
      operationId,
      topic: 'player.inventory.consumed',
      playerId: input.playerId,
      payload: {
        playerId: input.playerId,
        sourceType: 'technique_generation',
        sourceRefId: input.id,
        consumedItems: [{ itemId: TECHNIQUE_GENERATION_ITEM_ID, count: input.itemSpend }],
      },
    });
    await insertTechniqueGenerationAssetAudit(client, {
      operationId,
      playerId: input.playerId,
      assetRefId: input.id,
      action: 'consume',
      delta: {
        sourceType: 'technique_generation',
        itemId: TECHNIQUE_GENERATION_ITEM_ID,
        count: -input.itemSpend,
      },
      before: { itemId: TECHNIQUE_GENERATION_ITEM_ID, count: consumed.beforeCount },
      after: { itemId: TECHNIQUE_GENERATION_ITEM_ID, count: consumed.afterCount },
    });

    return {
      ok: true,
      alreadyCommitted: false,
      inventoryItems: await loadTechniqueGenerationRuntimeInventory(client, input.playerId),
    };
  });
}

/** 只允许一个执行者把 pending 或超时 running job 认领为 running。 */
export async function claimTechniqueGenerationExecution(pool: Pool, jobId: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE ${TECHNIQUE_GENERATION_JOB_TABLE}
        SET status = 'running',
            finished_at = NULL,
            error_code = NULL,
            error_message = NULL,
            updated_at = NOW()
      WHERE id = $1
        AND item_consumed = true
        AND draft_technique_id IS NULL
        AND (
          status = 'pending'
          OR (
            status = 'running'
            AND updated_at <= NOW() - INTERVAL '${GENERATION_EXECUTION_STALE_INTERVAL}'
          )
        )
      RETURNING id`,
    [jobId],
  );
  return (result.rowCount ?? 0) > 0;
}

export interface PersistGeneratedTechniqueDraftInput extends InsertGeneratedTechniqueParams {
  draftExpireHours: number;
  attemptCount: number;
}

/** 生成模板和 job 的 draft 指针必须同事务提交，避免模板孤儿或 job 丢失草稿。 */
export async function persistGeneratedTechniqueDraft(
  pool: Pool,
  input: PersistGeneratedTechniqueDraftInput,
): Promise<{ ok: boolean; techniqueId: string }> {
  return withPlayerTechniqueGenerationTransaction(pool, input.createdByPlayerId, async (client) => {
    const jobResult = await client.query(
      `SELECT status, draft_technique_id
         FROM ${TECHNIQUE_GENERATION_JOB_TABLE}
        WHERE id = $1 AND player_id = $2
        FOR UPDATE`,
      [input.generationId, input.createdByPlayerId],
    );
    const job = jobResult.rows[0] as { status?: unknown; draft_technique_id?: unknown } | undefined;
    const existingTechniqueId = normalizeOptionalString(job?.draft_technique_id);
    if (existingTechniqueId) {
      return { ok: true, techniqueId: existingTechniqueId };
    }
    if (job?.status !== 'running') {
      return { ok: false, techniqueId: input.id };
    }

    await client.query(
      `INSERT INTO ${GENERATED_TECHNIQUE_TABLE} (
        id, generation_id, template, schema_version,
        status, created_by_player_id, model_name,
        prompt_snapshot, validation_report,
        grade, category, realm_lv
      ) VALUES ($1,$2,$3::jsonb,$4,'draft',$5,$6,$7,$8::jsonb,$9,$10,$11)`,
      [
        input.id,
        input.generationId,
        JSON.stringify(input.template),
        input.schemaVersion,
        input.createdByPlayerId,
        input.modelName,
        input.promptSnapshot,
        JSON.stringify(input.validationReport),
        input.grade,
        input.category,
        input.realmLv,
      ],
    );
    const updated = await client.query(
      `UPDATE ${TECHNIQUE_GENERATION_JOB_TABLE}
          SET status = 'generated_draft',
              draft_technique_id = $2,
              model_name = $3,
              attempt_count = $4,
              draft_expire_at = NOW() + ($5::int * INTERVAL '1 hour'),
              finished_at = NOW(),
              updated_at = NOW()
        WHERE id = $1 AND status = 'running'`,
      [input.generationId, input.id, input.modelName, input.attemptCount, input.draftExpireHours],
    );
    if ((updated.rowCount ?? 0) !== 1) {
      throw new Error(`technique_generation_draft_state_conflict:${input.generationId}`);
    }
    return { ok: true, techniqueId: input.id };
  });
}

export interface AdoptDurableTechniqueDraftInput extends TechniqueGenerationSessionFence {
  playerId: string;
  jobId: string;
  displayName: string;
  normalizedName: string;
  learnerRealmLv: number;
  currentTick: number;
}

export interface AdoptDurableTechniqueDraftResult {
  ok: boolean;
  alreadyCommitted: boolean;
  techniqueId?: string;
  techniqueName?: string;
  errorCode?: 'JOB_NOT_FOUND' | 'JOB_STATE_INVALID' | 'DRAFT_EXPIRED' | 'NAME_CONFLICT' | 'TECHNIQUE_ALREADY_LEARNED';
}

/** 发布模板、写入待领悟真源和标记 learned 同事务完成。 */
export async function adoptDurableTechniqueDraft(
  pool: Pool,
  input: AdoptDurableTechniqueDraftInput,
): Promise<AdoptDurableTechniqueDraftResult> {
  return withPlayerTechniqueGenerationTransaction(pool, input.playerId, async (client) => {
    await assertTechniqueGenerationSessionFence(client, input.playerId, input);
    const operationId = buildTechniqueGenerationOperationId('adopt', input.jobId);
    const existingOperation = await loadCommittedTechniqueGenerationOperation(client, operationId, {
      playerId: input.playerId,
      operationType: 'technique_generation_adopt',
      aggregateType: PLAYER_TECHNIQUE_COMPREHENSION_TABLE,
      jobId: input.jobId,
    });
    if (existingOperation) {
      return {
        ok: true,
        alreadyCommitted: true,
        techniqueId: normalizeOptionalString(existingOperation.techniqueId) ?? undefined,
        techniqueName: normalizeOptionalString(existingOperation.techniqueName) ?? undefined,
      };
    }

    const jobResult = await client.query(
      `SELECT j.status,
              j.draft_technique_id,
              j.draft_expire_at,
              gt.template
         FROM ${TECHNIQUE_GENERATION_JOB_TABLE} j
         LEFT JOIN ${GENERATED_TECHNIQUE_TABLE} gt ON gt.id = j.draft_technique_id
        WHERE j.id = $1 AND j.player_id = $2
        FOR UPDATE OF j`,
      [input.jobId, input.playerId],
    );
    const job = jobResult.rows[0] as {
      status?: unknown;
      draft_technique_id?: unknown;
      draft_expire_at?: unknown;
      template?: unknown;
    } | undefined;
    if (!job) {
      return { ok: false, alreadyCommitted: false, errorCode: 'JOB_NOT_FOUND' };
    }
    if (job.status !== 'generated_draft') {
      return { ok: false, alreadyCommitted: false, errorCode: 'JOB_STATE_INVALID' };
    }
    const expireAt = normalizeTimestamp(job.draft_expire_at);
    if (expireAt !== null && expireAt <= Date.now()) {
      return { ok: false, alreadyCommitted: false, errorCode: 'DRAFT_EXPIRED' };
    }
    const techniqueId = normalizeOptionalString(job.draft_technique_id);
    const template = asRecord(job.template) as unknown as TechniqueTemplate | null;
    if (!techniqueId || !template) {
      return { ok: false, alreadyCommitted: false, errorCode: 'JOB_STATE_INVALID' };
    }

    const nameConflict = await client.query(
      `SELECT id
         FROM ${GENERATED_TECHNIQUE_TABLE}
        WHERE normalized_name = $1
          AND is_published = true
          AND id <> $2
        LIMIT 1`,
      [input.normalizedName, techniqueId],
    );
    if ((nameConflict.rowCount ?? 0) > 0) {
      return { ok: false, alreadyCommitted: false, errorCode: 'NAME_CONFLICT' };
    }
    const alreadyLearned = await client.query(
      `SELECT 1
         FROM ${PLAYER_TECHNIQUE_STATE_TABLE}
        WHERE player_id = $1 AND tech_id = $2
        LIMIT 1
        FOR UPDATE`,
      [input.playerId, techniqueId],
    );
    if ((alreadyLearned.rowCount ?? 0) > 0) {
      return { ok: false, alreadyCommitted: false, errorCode: 'TECHNIQUE_ALREADY_LEARNED' };
    }

    const grade = normalizeTechniqueGrade(template.grade);
    const category = normalizeTechniqueCategory(template.category);
    const realmLv = Math.max(1, Math.trunc(Number(template.realmLv) || 1));
    const currentTick = Math.max(0, Math.trunc(Number(input.currentTick) || 0));
    const requiredProgress = calculateTechniqueComprehensionRequiredProgress({
      sourceKind: 'created',
      techniqueRealmLv: realmLv,
      grade,
      learnerRealmLv: Math.max(1, Math.trunc(Number(input.learnerRealmLv) || 1)),
    });

    await client.query(
      `UPDATE ${GENERATED_TECHNIQUE_TABLE}
          SET is_published = true,
              published_at = COALESCE(published_at, NOW()),
              display_name = $2::text,
              normalized_name = $3::text,
              name_locked = true,
              template = jsonb_set(template, '{name}', to_jsonb($2::text), true),
              status = 'published',
              updated_at = NOW()
        WHERE id = $1`,
      [techniqueId, input.displayName, input.normalizedName],
    );
    await client.query(
      `INSERT INTO ${PLAYER_TECHNIQUE_COMPREHENSION_TABLE}(
        player_id,
        tech_id,
        source_kind,
        progress,
        required_progress,
        realm_lv,
        grade,
        category,
        creator_player_id,
        self_comprehension_allowed,
        created_at_tick,
        updated_at_tick,
        active_transfer_job_id,
        active_transfer_teacher_id,
        raw_payload,
        updated_at
      ) VALUES ($1,$2,'created',0,$3,$4,$5,$6,$1,true,$7,$7,NULL,NULL,'{}'::jsonb,NOW())
      ON CONFLICT (player_id, tech_id)
      DO UPDATE SET
        source_kind = 'created',
        required_progress = EXCLUDED.required_progress,
        realm_lv = EXCLUDED.realm_lv,
        grade = EXCLUDED.grade,
        category = EXCLUDED.category,
        creator_player_id = EXCLUDED.creator_player_id,
        self_comprehension_allowed = true,
        updated_at_tick = GREATEST(${PLAYER_TECHNIQUE_COMPREHENSION_TABLE}.updated_at_tick, EXCLUDED.updated_at_tick),
        updated_at = NOW()`,
      [input.playerId, techniqueId, requiredProgress, realmLv, grade, category, currentTick],
    );
    await client.query(
      `UPDATE ${TECHNIQUE_GENERATION_JOB_TABLE}
          SET status = 'learned',
              finished_at = COALESCE(finished_at, NOW()),
              error_code = NULL,
              error_message = NULL,
              updated_at = NOW()
        WHERE id = $1 AND player_id = $2 AND status = 'generated_draft'`,
      [input.jobId, input.playerId],
    );
    await touchTechniqueGenerationRecoveryWatermark(client, input.playerId, 'technique_version');
    const operationPayload = {
      jobId: input.jobId,
      techniqueId,
      techniqueName: input.displayName,
      requiredProgress,
      realmLv,
      grade,
      category,
      currentTick,
    };
    await insertCommittedTechniqueGenerationOperation(client, {
      operationId,
      playerId: input.playerId,
      operationType: 'technique_generation_adopt',
      aggregateType: PLAYER_TECHNIQUE_COMPREHENSION_TABLE,
      aggregateId: techniqueId,
      fence: input,
      payload: operationPayload,
    });
    await insertTechniqueGenerationOutbox(client, {
      operationId,
      topic: 'player.technique.comprehension.created',
      playerId: input.playerId,
      payload: { playerId: input.playerId, ...operationPayload },
    });
    return {
      ok: true,
      alreadyCommitted: false,
      techniqueId,
      techniqueName: input.displayName,
    };
  });
}

export interface DiscardDurableTechniqueDraftInput extends TechniqueGenerationSessionFence {
  playerId: string;
  jobId: string;
  refundCurrencyItemId: string;
  refundRatio: number;
  refundBasePrice: number;
}

export interface DiscardDurableTechniqueDraftResult {
  ok: boolean;
  alreadyCommitted: boolean;
  inventoryItems: TechniqueGenerationRuntimeInventoryItem[];
  itemSpend?: number;
  refundRatio?: number;
  refundAmount?: number;
  refundCurrencyItemId?: string;
  errorCode?: 'JOB_STATE_INVALID';
}

/** 放弃标记与功德返还同事务提交，重复调用返回首次提交的随机返还结果。 */
export async function discardDurableTechniqueDraft(
  pool: Pool,
  input: DiscardDurableTechniqueDraftInput,
): Promise<DiscardDurableTechniqueDraftResult> {
  return withPlayerTechniqueGenerationTransaction(pool, input.playerId, async (client) => {
    await assertTechniqueGenerationSessionFence(client, input.playerId, input);
    const operationId = buildTechniqueGenerationOperationId('discard', input.jobId);
    const existingOperation = await loadCommittedTechniqueGenerationOperation(client, operationId, {
      playerId: input.playerId,
      operationType: 'technique_generation_discard',
      aggregateType: TECHNIQUE_GENERATION_JOB_TABLE,
      jobId: input.jobId,
    });
    if (existingOperation) {
      return {
        ok: true,
        alreadyCommitted: true,
        inventoryItems: await loadTechniqueGenerationRuntimeInventory(client, input.playerId),
        itemSpend: normalizePositiveInteger(existingOperation.itemSpend, 1),
        refundRatio: normalizePositiveNumber(existingOperation.refundRatio, input.refundRatio),
        refundAmount: normalizePositiveInteger(existingOperation.refundAmount, input.refundBasePrice),
        refundCurrencyItemId: normalizeOptionalString(existingOperation.refundCurrencyItemId) ?? input.refundCurrencyItemId,
      };
    }

    const jobResult = await client.query(
      `SELECT status, item_spend, item_consumed, item_refunded
         FROM ${TECHNIQUE_GENERATION_JOB_TABLE}
        WHERE id = $1 AND player_id = $2
        FOR UPDATE`,
      [input.jobId, input.playerId],
    );
    const job = jobResult.rows[0] as {
      status?: unknown;
      item_spend?: unknown;
      item_consumed?: unknown;
      item_refunded?: unknown;
    } | undefined;
    if (!job || job.status !== 'generated_draft') {
      return {
        ok: false,
        alreadyCommitted: false,
        inventoryItems: [],
        errorCode: 'JOB_STATE_INVALID',
      };
    }
    const itemSpend = normalizePositiveInteger(job.item_spend, 1);
    const refundAmount = Math.max(
      1,
      Math.floor(itemSpend * normalizePositiveInteger(input.refundBasePrice, 1) * normalizePositiveNumber(input.refundRatio, 0.3)),
    );
    const beforeAfter = job.item_consumed === true && job.item_refunded !== true
      ? await grantTechniqueGenerationInventoryItem(
          client,
          input.playerId,
          input.refundCurrencyItemId,
          refundAmount,
          operationId,
        )
      : { beforeCount: 0, afterCount: 0 };

    await client.query(
      `UPDATE ${TECHNIQUE_GENERATION_JOB_TABLE}
          SET status = 'discarded',
              item_refunded = CASE WHEN item_consumed = true THEN true ELSE item_refunded END,
              refunded_at = CASE WHEN item_consumed = true THEN COALESCE(refunded_at, NOW()) ELSE refunded_at END,
              finished_at = COALESCE(finished_at, NOW()),
              updated_at = NOW()
        WHERE id = $1 AND player_id = $2 AND status = 'generated_draft'`,
      [input.jobId, input.playerId],
    );
    if (job.item_consumed === true && job.item_refunded !== true) {
      await touchTechniqueGenerationRecoveryWatermark(client, input.playerId, 'inventory_version');
    }
    const operationPayload = {
      jobId: input.jobId,
      itemSpend,
      refundRatio: input.refundRatio,
      refundAmount,
      refundCurrencyItemId: input.refundCurrencyItemId,
    };
    await insertCommittedTechniqueGenerationOperation(client, {
      operationId,
      playerId: input.playerId,
      operationType: 'technique_generation_discard',
      aggregateType: TECHNIQUE_GENERATION_JOB_TABLE,
      aggregateId: input.jobId,
      fence: input,
      payload: operationPayload,
    });
    if (job.item_consumed === true && job.item_refunded !== true) {
      await insertTechniqueGenerationOutbox(client, {
        operationId,
        topic: 'player.inventory.granted',
        playerId: input.playerId,
        payload: {
          playerId: input.playerId,
          sourceType: 'technique_generation_discard',
          sourceRefId: input.jobId,
          grantedItems: [{ itemId: input.refundCurrencyItemId, count: refundAmount }],
        },
      });
      await insertTechniqueGenerationAssetAudit(client, {
        operationId,
        playerId: input.playerId,
        assetRefId: input.jobId,
        action: 'grant',
        delta: {
          sourceType: 'technique_generation_discard',
          itemId: input.refundCurrencyItemId,
          count: refundAmount,
        },
        before: { itemId: input.refundCurrencyItemId, count: beforeAfter.beforeCount },
        after: { itemId: input.refundCurrencyItemId, count: beforeAfter.afterCount },
      });
    }
    return {
      ok: true,
      alreadyCommitted: false,
      inventoryItems: await loadTechniqueGenerationRuntimeInventory(client, input.playerId),
      ...operationPayload,
    };
  });
}

export interface RefundDurableFailedTechniqueGenerationJobsInput extends TechniqueGenerationSessionFence {
  playerId: string;
  limit?: number;
}

export interface RefundDurableFailedTechniqueGenerationJobsResult {
  refundedItems: number;
  refundedJobs: number;
  inventoryItems: TechniqueGenerationRuntimeInventoryItem[];
}

/** 失败 job 的玉简返还与 item_refunded 标记同事务提交。 */
export async function refundDurableFailedTechniqueGenerationJobs(
  pool: Pool,
  input: RefundDurableFailedTechniqueGenerationJobsInput,
): Promise<RefundDurableFailedTechniqueGenerationJobsResult> {
  return withPlayerTechniqueGenerationTransaction(pool, input.playerId, async (client) => {
    await assertTechniqueGenerationSessionFence(client, input.playerId, input);
    const jobsResult = await client.query(
      `SELECT id, item_spend
         FROM ${TECHNIQUE_GENERATION_JOB_TABLE}
        WHERE player_id = $1
          AND status = 'failed'
          AND item_consumed = true
          AND item_refunded = false
        ORDER BY created_at ASC, id ASC
        LIMIT $2
        FOR UPDATE`,
      [input.playerId, clampInteger(input.limit, 1, 200, 20)],
    );
    const jobs = (jobsResult.rows as Array<{ id?: unknown; item_spend?: unknown }>)
      .map((row) => ({
        id: normalizeOptionalString(row.id) ?? '',
        itemSpend: normalizePositiveInteger(row.item_spend, 1),
      }))
      .filter((job) => job.id.length > 0);
    if (jobs.length === 0) {
      return {
        refundedItems: 0,
        refundedJobs: 0,
        inventoryItems: await loadTechniqueGenerationRuntimeInventory(client, input.playerId),
      };
    }

    let refundedItems = 0;
    for (const job of jobs) {
      const operationId = buildTechniqueGenerationOperationId('refund', job.id);
      const existingOperation = await loadCommittedTechniqueGenerationOperation(client, operationId, {
        playerId: input.playerId,
        operationType: 'technique_generation_refund',
        aggregateType: TECHNIQUE_GENERATION_JOB_TABLE,
        jobId: job.id,
      });
      if (existingOperation) {
        continue;
      }
      const beforeAfter = await grantTechniqueGenerationInventoryItem(
        client,
        input.playerId,
        TECHNIQUE_GENERATION_ITEM_ID,
        job.itemSpend,
        operationId,
      );
      const marked = await client.query(
        `UPDATE ${TECHNIQUE_GENERATION_JOB_TABLE}
            SET item_refunded = true,
                refunded_at = COALESCE(refunded_at, NOW()),
                updated_at = NOW()
          WHERE id = $1
            AND player_id = $2
            AND status = 'failed'
            AND item_consumed = true
            AND item_refunded = false`,
        [job.id, input.playerId],
      );
      if ((marked.rowCount ?? 0) !== 1) {
        throw new Error(`technique_generation_refund_state_conflict:${job.id}`);
      }
      await insertCommittedTechniqueGenerationOperation(client, {
        operationId,
        playerId: input.playerId,
        operationType: 'technique_generation_refund',
        aggregateType: TECHNIQUE_GENERATION_JOB_TABLE,
        aggregateId: job.id,
        fence: input,
        payload: {
          jobId: job.id,
          itemId: TECHNIQUE_GENERATION_ITEM_ID,
          itemSpend: job.itemSpend,
        },
      });
      await insertTechniqueGenerationOutbox(client, {
        operationId,
        topic: 'player.inventory.granted',
        playerId: input.playerId,
        payload: {
          playerId: input.playerId,
          sourceType: 'technique_generation_refund',
          sourceRefId: job.id,
          grantedItems: [{ itemId: TECHNIQUE_GENERATION_ITEM_ID, count: job.itemSpend }],
        },
      });
      await insertTechniqueGenerationAssetAudit(client, {
        operationId,
        playerId: input.playerId,
        assetRefId: job.id,
        action: 'grant',
        delta: {
          sourceType: 'technique_generation_refund',
          itemId: TECHNIQUE_GENERATION_ITEM_ID,
          count: job.itemSpend,
        },
        before: { itemId: TECHNIQUE_GENERATION_ITEM_ID, count: beforeAfter.beforeCount },
        after: { itemId: TECHNIQUE_GENERATION_ITEM_ID, count: beforeAfter.afterCount },
      });
      refundedItems += job.itemSpend;
    }
    if (refundedItems > 0) {
      await touchTechniqueGenerationRecoveryWatermark(client, input.playerId, 'inventory_version');
    }
    return {
      refundedItems,
      refundedJobs: jobs.length,
      inventoryItems: await loadTechniqueGenerationRuntimeInventory(client, input.playerId),
    };
  });
}

async function withPlayerTechniqueGenerationTransaction<T>(
  pool: Pool,
  playerId: string,
  action: (client: PoolClient) => Promise<T>,
  commitOutcomeRetryRemaining = 1,
): Promise<T> {
  const normalizedPlayerId = normalizeOptionalString(playerId);
  if (!normalizedPlayerId) {
    throw new Error('invalid_technique_generation_player_id');
  }
  const client = await pool.connect();
  let commitAttempted = false;
  let commitOutcomeUnknown = false;
  let commitOutcomeCause: unknown = null;
  try {
    await client.query('BEGIN');
    await client.query(
      'SELECT pg_advisory_xact_lock($1::integer, hashtext($2))',
      [PLAYER_ASSET_LOCK_NAMESPACE, normalizedPlayerId],
    );
    const result = await action(client);
    commitAttempted = true;
    await client.query('COMMIT');
    commitAttempted = false;
    return result;
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (commitAttempted) {
      commitOutcomeUnknown = true;
      commitOutcomeCause = error;
    } else {
      throw error;
    }
  } finally {
    client.release();
  }

  if (commitOutcomeUnknown) {
    if (commitOutcomeRetryRemaining > 0) {
      try {
        return await withPlayerTechniqueGenerationTransaction(
          pool,
          normalizedPlayerId,
          action,
          commitOutcomeRetryRemaining - 1,
        );
      } catch (retryError: unknown) {
        throw new TechniqueGenerationCommitOutcomeUnknownError(
          normalizedPlayerId,
          new AggregateError([commitOutcomeCause, retryError], 'technique_generation_commit_reconciliation_failed'),
        );
      }
    }
    throw new TechniqueGenerationCommitOutcomeUnknownError(normalizedPlayerId, commitOutcomeCause);
  }

  throw new Error(`technique_generation_transaction_unreachable_state:${normalizedPlayerId}`);
}

async function assertTechniqueGenerationSessionFence(
  client: PoolClient,
  playerId: string,
  fence: TechniqueGenerationSessionFence,
): Promise<void> {
  const expectedRuntimeOwnerId = normalizeOptionalString(fence.expectedRuntimeOwnerId);
  const expectedSessionEpoch = Math.max(1, Math.trunc(Number(fence.expectedSessionEpoch) || 0));
  if (!expectedRuntimeOwnerId || expectedSessionEpoch <= 0) {
    throw new Error('technique_generation_session_fence_required');
  }
  const result = await client.query(
    `SELECT runtime_owner_id, session_epoch
       FROM ${PLAYER_PRESENCE_TABLE}
      WHERE player_id = $1
      FOR UPDATE`,
    [playerId],
  );
  const row = result.rows[0] as { runtime_owner_id?: unknown; session_epoch?: unknown } | undefined;
  const runtimeOwnerId = normalizeOptionalString(row?.runtime_owner_id);
  const sessionEpoch = Math.max(0, Math.trunc(Number(row?.session_epoch) || 0));
  if (runtimeOwnerId !== expectedRuntimeOwnerId || sessionEpoch !== expectedSessionEpoch) {
    throw new Error(
      `technique_generation_session_fencing_conflict:expectedOwner=${expectedRuntimeOwnerId}:expectedEpoch=${expectedSessionEpoch}:persistedOwner=${runtimeOwnerId ?? 'null'}:persistedEpoch=${sessionEpoch}`,
    );
  }
}

async function consumeTechniqueGenerationItem(
  client: PoolClient,
  playerId: string,
  itemId: string,
  count: number,
): Promise<{ ok: boolean; beforeCount: number; afterCount: number }> {
  const normalizedCount = normalizePositiveInteger(count, 1);
  const result = await client.query(
    `SELECT item_instance_id, count
       FROM ${PLAYER_INVENTORY_ITEM_TABLE}
      WHERE player_id = $1
        AND item_id = $2
        AND locked_by IS NULL
      ORDER BY slot_index ASC, item_instance_id ASC
      FOR UPDATE`,
    [playerId, itemId],
  );
  const rows = (result.rows as Array<{ item_instance_id?: unknown; count?: unknown }>)
    .map((row) => ({
      itemInstanceId: normalizeOptionalString(row.item_instance_id) ?? '',
      count: Math.max(0, Math.trunc(Number(row.count) || 0)),
    }))
    .filter((row) => row.itemInstanceId && row.count > 0);
  const beforeCount = rows.reduce((sum, row) => sum + row.count, 0);
  if (beforeCount < normalizedCount) {
    return { ok: false, beforeCount, afterCount: beforeCount };
  }
  let remaining = normalizedCount;
  for (const row of rows) {
    if (remaining <= 0) {
      break;
    }
    const consumed = Math.min(row.count, remaining);
    const nextCount = row.count - consumed;
    if (nextCount <= 0) {
      await client.query(
        `DELETE FROM ${PLAYER_INVENTORY_ITEM_TABLE}
          WHERE player_id = $1 AND item_instance_id = $2`,
        [playerId, row.itemInstanceId],
      );
    } else {
      await client.query(
        `UPDATE ${PLAYER_INVENTORY_ITEM_TABLE}
            SET count = $3,
                raw_payload = jsonb_set(COALESCE(raw_payload, '{}'::jsonb), '{count}', to_jsonb($3::bigint), true),
                updated_at = NOW()
          WHERE player_id = $1 AND item_instance_id = $2`,
        [playerId, row.itemInstanceId, nextCount],
      );
    }
    remaining -= consumed;
  }
  return { ok: true, beforeCount, afterCount: beforeCount - normalizedCount };
}

async function grantTechniqueGenerationInventoryItem(
  client: PoolClient,
  playerId: string,
  itemId: string,
  count: number,
  operationId: string,
): Promise<{ beforeCount: number; afterCount: number }> {
  const normalizedCount = normalizePositiveInteger(count, 1);
  const existing = await client.query(
    `SELECT item_instance_id, count
       FROM ${PLAYER_INVENTORY_ITEM_TABLE}
      WHERE player_id = $1
        AND item_id = $2
        AND locked_by IS NULL
      ORDER BY slot_index ASC, item_instance_id ASC
      LIMIT 1
      FOR UPDATE`,
    [playerId, itemId],
  );
  const existingRow = existing.rows[0] as { item_instance_id?: unknown; count?: unknown } | undefined;
  const beforeCount = await loadTechniqueGenerationItemCount(client, playerId, itemId);
  const itemInstanceId = normalizeOptionalString(existingRow?.item_instance_id);
  if (itemInstanceId) {
    const nextStackCount = Math.max(0, Math.trunc(Number(existingRow?.count) || 0)) + normalizedCount;
    await client.query(
      `UPDATE ${PLAYER_INVENTORY_ITEM_TABLE}
          SET count = $3,
              raw_payload = jsonb_set(COALESCE(raw_payload, '{}'::jsonb), '{count}', to_jsonb($3::bigint), true),
              updated_at = NOW()
        WHERE player_id = $1 AND item_instance_id = $2`,
      [playerId, itemInstanceId, nextStackCount],
    );
  } else {
    const slotResult = await client.query(
      `SELECT slot_index
         FROM ${PLAYER_INVENTORY_ITEM_TABLE}
        WHERE player_id = $1 AND locked_by IS NULL
        ORDER BY slot_index ASC
        FOR UPDATE`,
      [playerId],
    );
    const maxSlotIndex = slotResult.rows.reduce(
      (max, row) => Math.max(max, Math.trunc(Number(row?.slot_index) || 0)),
      -1,
    );
    const slotIndex = maxSlotIndex + 1;
    await client.query(
      `INSERT INTO ${PLAYER_INVENTORY_ITEM_TABLE}(
        item_instance_id, player_id, slot_index, item_id, count, raw_payload, locked_by, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,NULL,NOW())`,
      [
        buildTechniqueGenerationItemInstanceId(operationId),
        playerId,
        slotIndex,
        itemId,
        normalizedCount,
        JSON.stringify({ count: normalizedCount }),
      ],
    );
  }
  return { beforeCount, afterCount: beforeCount + normalizedCount };
}

async function loadTechniqueGenerationItemCount(
  client: PoolClient,
  playerId: string,
  itemId: string,
): Promise<number> {
  const result = await client.query(
    `SELECT COALESCE(SUM(count), 0)::bigint AS total
       FROM ${PLAYER_INVENTORY_ITEM_TABLE}
      WHERE player_id = $1 AND item_id = $2 AND locked_by IS NULL`,
    [playerId, itemId],
  );
  return Math.max(0, Math.trunc(Number(result.rows[0]?.total) || 0));
}

async function loadTechniqueGenerationRuntimeInventory(
  client: PoolClient,
  playerId: string,
): Promise<TechniqueGenerationRuntimeInventoryItem[]> {
  const result = await client.query(
    `SELECT item_instance_id, item_id, count, slot_index, raw_payload
       FROM ${PLAYER_INVENTORY_ITEM_TABLE}
      WHERE player_id = $1 AND locked_by IS NULL
      ORDER BY slot_index ASC, item_instance_id ASC`,
    [playerId],
  );
  return (result.rows as Array<{
    item_instance_id?: unknown;
    item_id?: unknown;
    count?: unknown;
    slot_index?: unknown;
    raw_payload?: unknown;
  }>).map((row) => {
    const rawPayload = asRecord(row.raw_payload) ?? {};
    return {
      // 兼容旧实例字段并把强化/功法书等动态字段恢复到运行态顶层；列字段仍覆盖旧镜像。
      ...rawPayload,
      itemId: normalizeOptionalString(row.item_id) ?? '',
      itemInstanceId: normalizeOptionalString(row.item_instance_id) ?? '',
      count: normalizePositiveInteger(row.count, 1),
      slotIndex: Math.max(0, Math.trunc(Number(row.slot_index) || 0)),
      rawPayload,
    };
  }).filter((row) => row.itemId && row.itemInstanceId);
}

async function touchTechniqueGenerationRecoveryWatermark(
  client: PoolClient,
  playerId: string,
  column: 'inventory_version' | 'technique_version',
): Promise<void> {
  await client.query(
    `INSERT INTO ${PLAYER_RECOVERY_WATERMARK_TABLE}(player_id, ${column}, updated_at)
     VALUES ($1, FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint, NOW())
     ON CONFLICT (player_id)
     DO UPDATE SET
       ${column} = GREATEST(
         ${PLAYER_RECOVERY_WATERMARK_TABLE}.${column},
         EXCLUDED.${column}
       ),
       updated_at = NOW()`,
    [playerId],
  );
}

interface InsertCommittedOperationInput {
  operationId: string;
  playerId: string;
  operationType: string;
  aggregateType: string;
  aggregateId: string;
  fence: TechniqueGenerationSessionFence;
  payload: Record<string, unknown>;
}

async function insertCommittedTechniqueGenerationOperation(
  client: PoolClient,
  input: InsertCommittedOperationInput,
): Promise<void> {
  await client.query(
    `INSERT INTO ${DURABLE_OPERATION_LOG_TABLE}(
      operation_id,
      operation_type,
      aggregate_type,
      aggregate_id,
      player_id,
      runtime_owner_id,
      session_epoch,
      request_id,
      payload_jsonb,
      status,
      created_at,
      committed_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$1,$8::jsonb,'committed',NOW(),NOW())`,
    [
      input.operationId,
      input.operationType,
      input.aggregateType,
      input.aggregateId,
      input.playerId,
      input.fence.expectedRuntimeOwnerId,
      input.fence.expectedSessionEpoch,
      JSON.stringify(input.payload),
    ],
  );
}

async function loadCommittedTechniqueGenerationOperation(
  client: PoolClient,
  operationId: string,
  expected: {
    playerId: string;
    operationType: string;
    aggregateType: string;
    jobId: string;
  },
): Promise<Record<string, unknown> | null> {
  const result = await client.query<{
    player_id?: unknown;
    operation_type?: unknown;
    aggregate_type?: unknown;
    payload_jsonb?: unknown;
  }>(
    `SELECT player_id, operation_type, aggregate_type, payload_jsonb
       FROM ${DURABLE_OPERATION_LOG_TABLE}
      WHERE operation_id = $1 AND status = 'committed'
      FOR UPDATE`,
    [operationId],
  );
  if ((result.rowCount ?? 0) === 0) {
    return null;
  }
  const row = result.rows[0];
  const payload = asRecord(row?.payload_jsonb);
  if (
    normalizeOptionalString(row?.player_id) !== normalizeOptionalString(expected.playerId)
    || normalizeOptionalString(row?.operation_type) !== normalizeOptionalString(expected.operationType)
    || normalizeOptionalString(row?.aggregate_type) !== normalizeOptionalString(expected.aggregateType)
    || normalizeOptionalString(payload?.jobId) !== normalizeOptionalString(expected.jobId)
  ) {
    throw new Error(`technique_generation_operation_replay_identity_conflict:${operationId}`);
  }
  return payload;
}

async function loadCommittedTechniqueAggregationJadeOperation(
  client: PoolClient,
  operationId: string,
  expected: PublishDurableJadeTechniqueAggregationInput,
): Promise<Record<string, unknown> | null> {
  const result = await client.query<{
    player_id?: unknown;
    operation_type?: unknown;
    aggregate_type?: unknown;
    aggregate_id?: unknown;
    payload_jsonb?: unknown;
  }>(
    `SELECT player_id, operation_type, aggregate_type, aggregate_id, payload_jsonb
       FROM ${DURABLE_OPERATION_LOG_TABLE}
      WHERE operation_id = $1 AND status = 'committed'
      FOR UPDATE`,
    [operationId],
  );
  if ((result.rowCount ?? 0) === 0) return null;
  const row = result.rows[0];
  const payload = asRecord(row?.payload_jsonb);
  if (
    normalizeOptionalString(row?.player_id) !== normalizeOptionalString(expected.playerId)
    || normalizeOptionalString(row?.operation_type) !== 'technique_aggregation_jade_consume'
    || normalizeOptionalString(row?.aggregate_type) !== GENERATED_TECHNIQUE_TABLE
    || normalizeOptionalString(row?.aggregate_id) !== normalizeOptionalString(expected.id)
    || normalizeOptionalString(payload?.aggregateTechniqueId) !== normalizeOptionalString(expected.id)
    || normalizeOptionalString(payload?.requestFingerprint) !== normalizeOptionalString(expected.requestFingerprint)
    || Math.trunc(Number(payload?.itemSpend) || 0) !== expected.itemSpend
  ) {
    throw new Error(`technique_aggregation_jade_operation_replay_identity_conflict:${operationId}`);
  }
  return payload;
}

async function insertTechniqueGenerationOutbox(
  client: PoolClient,
  input: {
    operationId: string;
    topic: string;
    playerId: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO ${OUTBOX_EVENT_TABLE}(
      event_id, operation_id, topic, partition_key, payload_jsonb,
      status, attempt_count, next_retry_at, created_at
    ) VALUES ($1,$2,$3,$4,$5::jsonb,'ready',0,NOW(),NOW())
    ON CONFLICT (event_id) DO NOTHING`,
    [
      `outbox:${input.operationId}`,
      input.operationId,
      input.topic,
      input.playerId,
      JSON.stringify(input.payload),
    ],
  );
}

async function insertTechniqueGenerationAssetAudit(
  client: PoolClient,
  input: {
    operationId: string;
    playerId: string;
    assetRefId: string;
    action: 'consume' | 'grant';
    delta: Record<string, unknown>;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO ${ASSET_AUDIT_LOG_TABLE}(
      log_id, operation_id, player_id, asset_type, asset_ref_id,
      action, delta_jsonb, before_jsonb, after_jsonb, created_at
    ) VALUES ($1,$2,$3,'inventory',$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,NOW())
    ON CONFLICT (log_id) DO NOTHING`,
    [
      `audit:${input.operationId}`,
      input.operationId,
      input.playerId,
      input.assetRefId,
      input.action,
      JSON.stringify(input.delta),
      JSON.stringify(input.before),
      JSON.stringify(input.after),
    ],
  );
}

function buildTechniqueGenerationOperationId(kind: string, jobId: string): string {
  return `op:technique-generation-${kind}:${jobId}`;
}

function buildTechniqueAggregationJadeOperationId(value: string): string {
  const normalized = normalizeOptionalString(value)?.slice(0, 96);
  if (!normalized) throw new Error('technique_aggregation_jade_operation_id_required');
  return `op:technique-aggregation-jade:${normalized}`;
}

function buildTechniqueGenerationItemInstanceId(operationId: string): string {
  return `techgen-item:${operationId}`.slice(0, 180);
}

function normalizeTechniqueGrade(value: unknown): TechniqueGrade {
  const normalized = normalizeOptionalString(value);
  return normalized && (TECHNIQUE_GRADE_ORDER as readonly string[]).includes(normalized)
    ? normalized as TechniqueGrade
    : 'mortal';
}

function normalizeTechniqueCategory(value: unknown): TechniqueCategory {
  return value === 'arts' ? 'arts' : 'internal';
}

function normalizeTimestamp(value: unknown): number | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.getTime() : null;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  return null;
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0
    ? Math.max(1, Math.trunc(numeric))
    : Math.max(1, Math.trunc(fallback));
}

function normalizePositiveNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = Number(value);
  const normalized = Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
  return Math.max(min, Math.min(max, normalized));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

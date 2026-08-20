/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */

/**
 * AI 功法生成主服务。
 *
 * 编排完整生命周期：前置校验 → 随机 → AI 调用 → 校验 → 落库 → 发布/学习。
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import { Injectable, Logger } from '@nestjs/common';
import type { Attributes, TechniqueCategory, TechniqueLayerDef, TechniqueTemplate } from '@mud/shared';
import {
  CUSTOM_TECHNIQUE_NAME_MAX_LENGTH,
  CUSTOM_TECHNIQUE_NAME_MIN_LENGTH,
  CUSTOM_TECHNIQUE_PROMPT_MAX_LENGTH,
  HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID,
  HEAVENLY_DAO_SHOP_ITEMS,
  TECHNIQUE_GRADE_ORDER,
  TECHNIQUE_INTERNAL_DEFAULT_MAX_LAYER,
  calcTechniqueAttrValues,
  expandTechniqueAttrRatio,
  shouldExpandTechniqueAttrRatio,
} from '@mud/shared';
import { executeAiTask, type AiTaskRequest, type AiTaskResult } from '../../ai/ai-task-execution.service';
import { sanitizePlayerContext } from '../../ai/ai-prompt-sanitizer';
import type { AiTextModelConfig } from '../../ai/ai-model-config';

import {
  loadRecoverableGenerationJobs,
  updateGenerationJobStatus,
  expireStaleGenerationJobs,
} from '../../persistence/generated-technique-persistence.service';
import {
  adoptDurableTechniqueDraft,
  adoptDurableTechniqueDraftBatch,
  beginDurableTechniqueGeneration,
  beginDurableTechniqueGenerationBatch,
  cancelDurableIncompleteTechniqueGeneration,
  claimTechniqueGenerationBatchExecution,
  claimTechniqueGenerationExecution,
  discardDurableTechniqueDraft,
  discardDurableTechniqueDraftBatch,
  failDurableTechniqueGenerationBatch,
  persistGeneratedTechniqueDraft,
  persistGeneratedTechniqueDraftBatch,
  refundDurableFailedTechniqueGenerationJobs,
  TechniqueGenerationCommitOutcomeUnknownError,
  type TechniqueGenerationRuntimeInventoryItem,
} from '../../persistence/technique-generation-durable-persistence';

import { GeneratedTechniqueStoreService } from './generated-technique-store.service';
import { validateTechniqueCandidate } from './technique-candidate-validator';
import {
  buildBatchInternalTechniqueNamingPrompt,
  buildTechniquePrompt,
  buildRetryPrompt,
} from './technique-prompt-builder';
import {
  buildGeneratedTechniqueTemplate,
  calculateGeneratedTechniqueTotalBudget,
  normalizeGeneratedTechniqueCandidateForServer as normalizeGeneratedTechniqueCandidateBase,
} from './generated-technique-template-builder';
import {
  normalizeTechniqueGenerationItemSpend,
  rollTechniqueBudgetPercent,
  rollBoostedTechniqueOutcome,
} from './technique-generation-roll';
import {
  TECHNIQUE_GENERATION_UNLOCK_REALM_LV,
  TECHNIQUE_GENERATION_DRAFT_EXPIRE_HOURS,
  TECHNIQUE_GENERATION_AUTO_CANCEL_AFTER_MS,
  TECHNIQUE_GENERATION_MANUAL_CANCEL_AFTER_MS,
  TECHNIQUE_GENERATION_ITEM_ID,
  TECHNIQUE_GENERATION_SCHEMA_VERSION,
} from './technique-generation-constants';
import {
  buildBalancedInternalTechniqueCandidate,
  createTechniqueGenerationBatchIdentity,
  resolveTechniqueGenerationBatchId,
  resolveTechniqueGenerationBatchIndex,
} from './technique-generation-batch';
import type {
  GenerationJobResult,
  GenerationExecutionResult,
  AdoptResult,
  BatchAdoptResult,
  GenerationStatus,
  TechniqueBatchPreview,
  TechniqueGenerationBatchStatus,
  TechniquePreview,
  DiscardResult,
} from './technique-generation.types';

const DISCARD_REFUND_RATIO_MIN = 0.3;
const DISCARD_REFUND_RATIO_MAX = 0.7;
const TECHNIQUE_GENERATION_REFUND_BASE_PRICE = HEAVENLY_DAO_SHOP_ITEMS.find((entry) => entry.itemId === 'wudao_yujian')?.price ?? 1000;

@Injectable()
export class TechniqueGenerationService {
  private readonly logger = new Logger(TechniqueGenerationService.name);
  private pool: Pool | null = null;
  private generatedStore: GeneratedTechniqueStoreService | null = null;
  private modelConfigResolver: (() => Promise<AiTextModelConfig | null>) | null = null;

  initialize(params: {
    pool: Pool;
    generatedStore: GeneratedTechniqueStoreService;
    modelConfigResolver: () => Promise<AiTextModelConfig | null>;
  }): void {
    this.pool = params.pool;
    this.generatedStore = params.generatedStore;
    this.modelConfigResolver = params.modelConfigResolver;
  }

  isReady(): boolean {
    return this.pool !== null && this.generatedStore !== null && this.modelConfigResolver !== null;
  }

  async getCurrentStatusForPlayer(
    playerId: string,
  ): Promise<Pick<GenerationStatus, 'currentJob' | 'currentDraft' | 'currentBatch'>> {
    const jobs = await this.loadCurrentGenerationJobsForPlayer(playerId);
    if (jobs.length === 0) {
      return { currentJob: null, currentDraft: null, currentBatch: null };
    }
    const batchId = resolveTechniqueGenerationBatchId(jobs[0].id);
    if (batchId) {
      const batchJobs = jobs
        .filter((job) => resolveTechniqueGenerationBatchId(job.id) === batchId)
        .sort(compareLoadedGenerationJobs);
      const status = resolveTechniqueGenerationBatchStatus(batchJobs);
      const drafts = status === 'generated_draft'
        ? await this.getBatchPreviews(playerId, batchId)
        : [];
      const currentBatch: TechniqueGenerationBatchStatus = {
        batchId,
        status,
        count: batchJobs.length,
        createdAt: formatTechniqueGenerationTimestamp(batchJobs[0]?.createdAt),
        draftExpireAt: batchJobs[0]?.draftExpireAt
          ? formatTechniqueGenerationTimestamp(batchJobs[0].draftExpireAt)
          : undefined,
        jobs: batchJobs.map((job) => ({
          jobId: job.id,
          rolledGrade: job.rolledGrade,
          rolledRealmLv: job.rolledRealmLv,
        })),
        drafts,
      };
      return { currentJob: null, currentDraft: null, currentBatch };
    }
    const job = jobs[0];
    const currentJob = {
      jobId: job.id,
      status: job.status,
      category: job.category,
      rolledGrade: job.rolledGrade,
      rolledRealmLv: job.rolledRealmLv,
      createdAt: formatTechniqueGenerationTimestamp(job.createdAt),
      draftExpireAt: job.draftExpireAt ? formatTechniqueGenerationTimestamp(job.draftExpireAt) : undefined,
    };
    const currentDraft = job.status === 'generated_draft'
      ? await this.getPreview(playerId, job.id)
      : null;
    return { currentJob, currentDraft, currentBatch: null };
  }

  /** 发起生成 */
  async requestGeneration(params: {
    playerId: string;
    playerRealmLv: number;
    playerHighestRealmLv: number;
    category: TechniqueCategory;
    playerContext?: string;
    itemSpend?: number;
    expectedRuntimeOwnerId?: string | null;
    expectedSessionEpoch?: number | null;
    applyInventorySnapshot?: (items: TechniqueGenerationRuntimeInventoryItem[]) => Promise<void> | void;
    settleFailedRefund?: () => Promise<boolean>;
  }): Promise<GenerationJobResult> {
    const pool = this.pool;
    if (!pool) {
      return { success: false, error: '功法领悟系统未就绪', errorCode: 'SERVICE_UNAVAILABLE' };
    }

    // 1. 历史最高境界校验，解锁后不因当前境界回落而关闭
    if (params.playerHighestRealmLv < TECHNIQUE_GENERATION_UNLOCK_REALM_LV) {
      return { success: false, error: '需筑基期方可领悟', errorCode: 'REALM_LOCKED' };
    }

    // 2. category 限制
    if (params.category !== 'internal' && params.category !== 'arts') {
      return { success: false, error: '当前仅开放内功和术法', errorCode: 'CATEGORY_LOCKED' };
    }

    const activeJobs = await this.loadCurrentGenerationJobsForPlayer(params.playerId);
    if (activeJobs.length > 0) {
      return { success: false, error: '请先处理未完成的功法领悟', errorCode: 'ACTIVE_JOB_EXISTS' };
    }

    // 3. 功法境界按当前境界随机，品阶按历史最高境界随机；投入多个悟道玉简时，多次抽取并择优。
    const itemSpend = normalizeTechniqueGenerationItemSpend(params.itemSpend);
    const roll = rollBoostedTechniqueOutcome(params.playerRealmLv, params.playerHighestRealmLv, itemSpend);
    const rolledRealmLv = roll.realmLv;
    const rolledGrade = roll.grade;
    const budgetPercent = rollTechniqueBudgetPercent();
    const totalBudget = calculateGeneratedTechniqueTotalBudget(params.category, rolledGrade, rolledRealmLv, budgetPercent);

    // 4. 模型不可用时不创建 job，也不触碰玩家资产。
    const modelConfig = await this.modelConfigResolver?.();
    if (!modelConfig) {
      return { success: false, error: 'AI 模型未配置', errorCode: 'NO_MODEL' };
    }
    const expectedRuntimeOwnerId = normalizeTechniqueGenerationOwnerId(params.expectedRuntimeOwnerId);
    const expectedSessionEpoch = normalizeTechniqueGenerationSessionEpoch(params.expectedSessionEpoch);
    if (!expectedRuntimeOwnerId || expectedSessionEpoch === null || typeof params.applyInventorySnapshot !== 'function') {
      return { success: false, error: '玩家资产持久化上下文不可用', errorCode: 'PERSISTENCE_CONTEXT_UNAVAILABLE' };
    }

    // 5. 玩家锁内原子扣除玉简并创建 pending job；并发请求只能成功一个。
    const jobId = randomUUID();
    const sanitizedContext = sanitizePlayerContext(params.playerContext, CUSTOM_TECHNIQUE_PROMPT_MAX_LENGTH);
    const beginResult = await beginDurableTechniqueGeneration(pool, {
      id: jobId,
      playerId: params.playerId,
      requestedCategory: params.category,
      rolledGrade,
      rolledRealmLv,
      playerContext: sanitizedContext,
      itemSpend,
      budgetPercent,
      totalBudget,
      expectedRuntimeOwnerId,
      expectedSessionEpoch,
    });
    if (!beginResult.ok) {
      if (beginResult.errorCode === 'ACTIVE_JOB_EXISTS') {
        return { success: false, error: '请先处理未完成的功法领悟', errorCode: 'ACTIVE_JOB_EXISTS' };
      }
      return { success: false, error: '悟道玉简不足', errorCode: 'ITEM_NOT_ENOUGH' };
    }
    try {
      await params.applyInventorySnapshot(beginResult.inventoryItems);
    } catch (error: unknown) {
      this.logger.error(
        `自创功法扣除玉简已提交但运行态同步失败 playerId=${params.playerId} jobId=${jobId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    // 6. 异步触发执行；失败返还由同一 durable 链完成。
    setImmediate(() => {
      this.executeGeneration(jobId, {
        category: params.category,
        grade: rolledGrade,
        realmLv: rolledRealmLv,
        playerContext: sanitizedContext,
        playerId: params.playerId,
        itemSpend,
        budgetPercent,
        totalBudget,
        modelConfig,
        settleFailedRefund: params.settleFailedRefund,
      }).catch(() => undefined);
    });

    return { success: true, jobId, rolledGrade, rolledRealmLv, itemSpend, budgetPercent, totalBudget };
  }

  /** 发起批量内功领悟；每枚玉简对应一部独立随机结果。 */
  async requestBatchGeneration(params: {
    playerId: string;
    playerRealmLv: number;
    playerHighestRealmLv: number;
    playerContext?: string;
    itemSpend?: number;
    expectedRuntimeOwnerId?: string | null;
    expectedSessionEpoch?: number | null;
    applyInventorySnapshot?: (items: TechniqueGenerationRuntimeInventoryItem[]) => Promise<void> | void;
    settleFailedRefund?: () => Promise<boolean>;
  }): Promise<GenerationJobResult> {
    const pool = this.pool;
    if (!pool) {
      return { success: false, error: '功法领悟系统未就绪', errorCode: 'SERVICE_UNAVAILABLE' };
    }
    if (params.playerHighestRealmLv < TECHNIQUE_GENERATION_UNLOCK_REALM_LV) {
      return { success: false, error: '需筑基期方可领悟', errorCode: 'REALM_LOCKED' };
    }
    const activeJobs = await this.loadCurrentGenerationJobsForPlayer(params.playerId);
    if (activeJobs.length > 0) {
      return { success: false, error: '请先处理未完成的功法领悟', errorCode: 'ACTIVE_JOB_EXISTS' };
    }
    const modelConfig = await this.modelConfigResolver?.();
    if (!modelConfig) {
      return { success: false, error: 'AI 模型未配置', errorCode: 'NO_MODEL' };
    }
    const expectedRuntimeOwnerId = normalizeTechniqueGenerationOwnerId(params.expectedRuntimeOwnerId);
    const expectedSessionEpoch = normalizeTechniqueGenerationSessionEpoch(params.expectedSessionEpoch);
    if (!expectedRuntimeOwnerId || expectedSessionEpoch === null || typeof params.applyInventorySnapshot !== 'function') {
      return { success: false, error: '玩家资产持久化上下文不可用', errorCode: 'PERSISTENCE_CONTEXT_UNAVAILABLE' };
    }

    const batchCount = normalizeTechniqueGenerationItemSpend(params.itemSpend);
    const identity = createTechniqueGenerationBatchIdentity(batchCount);
    const sanitizedContext = sanitizePlayerContext(params.playerContext, CUSTOM_TECHNIQUE_PROMPT_MAX_LENGTH);
    const jobs: BatchGenerationExecutionJob[] = identity.jobIds.map((jobId, index) => {
      const roll = rollBoostedTechniqueOutcome(params.playerRealmLv, params.playerHighestRealmLv, 1);
      const budgetPercent = rollTechniqueBudgetPercent();
      return {
        jobId,
        batchId: identity.batchId,
        index: index + 1,
        grade: roll.grade,
        realmLv: roll.realmLv,
        budgetPercent,
        totalBudget: calculateGeneratedTechniqueTotalBudget('internal', roll.grade, roll.realmLv, budgetPercent),
      };
    });
    const beginResult = await beginDurableTechniqueGenerationBatch(pool, {
      batchId: identity.batchId,
      playerId: params.playerId,
      jobs: jobs.map((job) => ({
        id: job.jobId,
        playerId: params.playerId,
        requestedCategory: 'internal',
        rolledGrade: job.grade,
        rolledRealmLv: job.realmLv,
        playerContext: sanitizedContext,
        itemSpend: 1,
        budgetPercent: job.budgetPercent,
        totalBudget: job.totalBudget,
      })),
      expectedRuntimeOwnerId,
      expectedSessionEpoch,
    });
    if (!beginResult.ok) {
      if (beginResult.errorCode === 'ACTIVE_JOB_EXISTS') {
        return { success: false, error: '请先处理未完成的功法领悟', errorCode: 'ACTIVE_JOB_EXISTS' };
      }
      return { success: false, error: '悟道玉简不足', errorCode: 'ITEM_NOT_ENOUGH' };
    }
    try {
      await params.applyInventorySnapshot(beginResult.inventoryItems);
    } catch (error: unknown) {
      this.logger.error(
        `批量内功扣除玉简已提交但运行态同步失败 playerId=${params.playerId} batchId=${identity.batchId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
    setImmediate(() => {
      this.executeBatchGeneration(identity.batchId, {
        playerId: params.playerId,
        playerContext: sanitizedContext,
        jobs,
        modelConfig,
        settleFailedRefund: params.settleFailedRefund,
      }).catch(() => undefined);
    });
    return {
      success: true,
      jobId: identity.jobIds[0],
      batchId: identity.batchId,
      batchCount,
      jobIds: identity.jobIds,
      itemSpend: batchCount,
    };
  }

  /** 执行生成（异步） */
  async executeGeneration(jobId: string, params: {
    category: TechniqueCategory;
    grade: string;
    realmLv: number;
    playerContext: string;
    playerId: string;
    itemSpend?: number;
    budgetPercent?: number;
    totalBudget?: number;
    modelConfig?: AiTextModelConfig;
    settleFailedRefund?: () => Promise<boolean>;
  }): Promise<GenerationExecutionResult> {
    const pool = this.pool;
    if (!pool) {
      return { success: false, error: '功法领悟系统未就绪' };
    }
    let claimed = false;
    try {
      claimed = await claimTechniqueGenerationExecution(pool, jobId);
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : '功法领悟任务认领失败' };
    }
    if (!claimed) {
      return { success: false, error: '功法领悟任务已由其他执行器处理' };
    }
    try {

      // 获取模型配置
      const modelConfig = params.modelConfig ?? await this.modelConfigResolver?.();
      if (!modelConfig) {
        await this.failGenerationAndRefundItem(jobId, 'NO_MODEL', 'AI 模型未配置', params);
        return { success: false, error: 'AI 模型未配置' };
      }

      const maxLayer = TECHNIQUE_INTERNAL_DEFAULT_MAX_LAYER;
      const budgetPercent = Number.isFinite(params.budgetPercent)
        ? Number(params.budgetPercent)
        : 1;
      const totalBudget = Number.isFinite(params.totalBudget) && Number(params.totalBudget) > 0
        ? Number(params.totalBudget)
        : calculateGeneratedTechniqueTotalBudget(params.category as Extract<TechniqueCategory, 'internal' | 'arts'>, params.grade as any, params.realmLv, budgetPercent);
      const basePrompt = buildTechniquePrompt({
        category: params.category as TechniqueCategory,
        grade: params.grade as any,
        realmLv: params.realmLv,
        maxLayer,
        playerContext: params.playerContext,
        itemSpend: params.itemSpend,
        budgetPercent,
        totalBudget,
      });

      let candidate: Record<string, unknown> | null = null;
      let successfulAiResult: AiTaskResult | null = null;
      let lastFailureReason = '';
      let lastFailureCode: 'AI_FAILED' | 'PARSE_FAILED' | 'VALIDATION_FAILED' = 'VALIDATION_FAILED';
      const maxAttempts = 3;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const prompt = lastFailureReason ? buildRetryPrompt(basePrompt, lastFailureReason) : basePrompt;
        const taskRequest: AiTaskRequest = {
          taskType: 'technique_generation',
          modelConfig,
          systemMessage: prompt.systemMessage,
          userMessage: prompt.userMessage,
          responseFormat: 'json_object',
          temperature: lastFailureReason ? 0.7 : 0.9,
          timeoutMs: 60_000,
          maxAttempts: 1,
        };

        const aiResult = await executeAiTask(taskRequest);
        if (!aiResult.success) {
          lastFailureReason = aiResult.error || 'AI 调用失败';
          lastFailureCode = 'AI_FAILED';
          continue;
        }

        const parsedResult = parseAiJsonObject(aiResult.content);
        if (parsedResult.ok === false) {
          lastFailureReason = [
            'JSON 解析失败，请只输出单个合法 JSON 对象，不要包含代码块标记或解释文本',
            parsedResult.error ? `解析错误：${parsedResult.error}` : '',
            parsedResult.excerpt ? `原始返回片段：${parsedResult.excerpt}` : '',
          ].filter(Boolean).join('；');
          lastFailureCode = 'PARSE_FAILED';
          continue;
        }
        const parsed = parsedResult.value;

        const fixedCandidate = normalizeGeneratedTechniqueCandidateForServer(parsed, {
          category: params.category as TechniqueCategory,
          grade: params.grade,
          realmLv: params.realmLv,
          maxLayer,
          budgetPercent,
          totalBudget,
          playerContext: params.playerContext,
        });
        const validation = validateTechniqueCandidate(fixedCandidate, params.category as TechniqueCategory);
        if (!validation.valid) {
          lastFailureReason = validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ');
          lastFailureCode = 'VALIDATION_FAILED';
          continue;
        }

        candidate = fixedCandidate;
        successfulAiResult = { ...aiResult, attemptCount: attempt };
        break;
      }

      if (!candidate || !successfulAiResult) {
        const reason = lastFailureReason || '生成内容未通过校验';
        await this.failGenerationAndRefundItem(jobId, lastFailureCode, reason, params);
        return { success: false, error: reason };
      }

      const techniqueId = `gen_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const builtTemplate = buildGeneratedTechniqueTemplate({
        techniqueId,
        candidate,
        category: params.category as Extract<TechniqueCategory, 'internal' | 'arts'>,
        grade: params.grade as any,
        realmLv: params.realmLv,
        maxLayer,
        budgetPercent,
        totalBudget,
      });
      if (builtTemplate.ok === false) {
        const reason = builtTemplate.errors.map((entry) => `${entry.field}: ${entry.message}`).join('; ')
          || '生成功法模板无法构建';
        await this.failGenerationAndRefundItem(jobId, 'VALIDATION_FAILED', reason, params);
        return { success: false, error: reason };
      }
      const { template, validationReport } = builtTemplate;

      // 模板与 job 草稿指针必须同事务落库，避免崩溃后留下孤儿模板。
      const persistedDraft = await persistGeneratedTechniqueDraft(pool, {
        id: techniqueId,
        generationId: jobId,
        template,
        schemaVersion: TECHNIQUE_GENERATION_SCHEMA_VERSION,
        createdByPlayerId: params.playerId,
        modelName: successfulAiResult.modelName,
        promptSnapshot: params.playerContext,
        validationReport,
        grade: params.grade,
        category: params.category,
        realmLv: params.realmLv,
        attemptCount: successfulAiResult.attemptCount,
        draftExpireHours: TECHNIQUE_GENERATION_DRAFT_EXPIRE_HOURS,
      });
      if (!persistedDraft.ok) {
        throw new Error(`technique_generation_draft_state_conflict:${jobId}`);
      }

      return { success: true, techniqueId: persistedDraft.techniqueId };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '功法领悟失败';
      if (error instanceof TechniqueGenerationCommitOutcomeUnknownError) {
        this.logger.warn(`自创功法草稿事务结果待确认，保留 running 状态供幂等恢复 jobId=${jobId}`);
        return { success: false, error: '功法草稿正在确认中，请稍后查看。' };
      }
      await this.failGenerationAndRefundItem(jobId, 'GENERATION_FAILED', message, params).catch(() => undefined);
      return { success: false, error: message };
    }
  }

  /** 批量执行只让 AI 生成名称和描述，数值模板完全由服务端构建。 */
  async executeBatchGeneration(batchId: string, params: {
    playerId: string;
    playerContext: string;
    jobs: BatchGenerationExecutionJob[];
    modelConfig?: AiTextModelConfig;
    settleFailedRefund?: () => Promise<boolean>;
  }): Promise<GenerationExecutionResult> {
    const pool = this.pool;
    if (!pool) return { success: false, error: '功法领悟系统未就绪' };
    const jobIds = params.jobs.map((job) => job.jobId);
    let claimed = false;
    try {
      claimed = await claimTechniqueGenerationBatchExecution(pool, params.playerId, jobIds);
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : '批量领悟任务认领失败' };
    }
    if (!claimed) return { success: false, error: '批量领悟任务已由其他执行器处理' };

    try {
      const modelConfig = params.modelConfig ?? await this.modelConfigResolver?.();
      if (!modelConfig) {
        await this.failBatchGenerationAndRefund(batchId, params, 'NO_MODEL', 'AI 模型未配置');
        return { success: false, error: 'AI 模型未配置' };
      }
      const basePrompt = buildBatchInternalTechniqueNamingPrompt({
        playerContext: params.playerContext,
        entries: params.jobs.map((job) => ({
          index: job.index,
          grade: job.grade,
          realmLv: job.realmLv,
        })),
      });
      let namingEntries: BatchTechniqueNamingEntry[] | null = null;
      let successfulAiResult: AiTaskResult | null = null;
      let lastFailureReason = '';
      let lastFailureCode: 'AI_FAILED' | 'PARSE_FAILED' | 'VALIDATION_FAILED' = 'VALIDATION_FAILED';
      const maxAttempts = 3;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const prompt = lastFailureReason ? buildRetryPrompt(basePrompt, lastFailureReason) : basePrompt;
        const aiResult = await executeAiTask({
          taskType: 'technique_generation_batch_naming',
          modelConfig,
          systemMessage: prompt.systemMessage,
          userMessage: prompt.userMessage,
          responseFormat: 'json_object',
          temperature: lastFailureReason ? 0.65 : 0.85,
          timeoutMs: 90_000,
          maxAttempts: 1,
        });
        if (!aiResult.success) {
          lastFailureReason = aiResult.error || 'AI 调用失败';
          lastFailureCode = 'AI_FAILED';
          continue;
        }
        const parsedResult = parseAiJsonObject(aiResult.content);
        if (parsedResult.ok === false) {
          lastFailureReason = [
            'JSON 解析失败，请只输出包含 techniques 数组的合法 JSON 对象',
            parsedResult.error ? `解析错误：${parsedResult.error}` : '',
          ].filter(Boolean).join('；');
          lastFailureCode = 'PARSE_FAILED';
          continue;
        }
        const normalized = normalizeBatchTechniqueNamingResponse(parsedResult.value, params.jobs.length);
        if (normalized.ok === false) {
          lastFailureReason = normalized.error;
          lastFailureCode = 'VALIDATION_FAILED';
          continue;
        }
        const conflicts = await this.findPublishedTechniqueNameConflicts(normalized.value.map((entry) => entry.normalizedName));
        if (conflicts.length > 0) {
          lastFailureReason = `以下名称已存在，请全部更换：${conflicts.join('、')}`;
          lastFailureCode = 'VALIDATION_FAILED';
          continue;
        }
        namingEntries = normalized.value;
        successfulAiResult = { ...aiResult, attemptCount: attempt };
        break;
      }
      if (!namingEntries || !successfulAiResult) {
        const reason = lastFailureReason || '批量功法文案未通过校验';
        await this.failBatchGenerationAndRefund(batchId, params, lastFailureCode, reason);
        return { success: false, error: reason };
      }

      const maxLayer = TECHNIQUE_INTERNAL_DEFAULT_MAX_LAYER;
      const drafts = params.jobs.map((job, index) => {
        const naming = namingEntries![index];
        const techniqueId = `gen_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
        const candidate = buildBalancedInternalTechniqueCandidate({
          name: naming.name,
          desc: naming.desc,
          maxLayer,
        });
        const built = buildGeneratedTechniqueTemplate({
          techniqueId,
          candidate,
          category: 'internal',
          grade: job.grade,
          realmLv: job.realmLv,
          maxLayer,
          budgetPercent: job.budgetPercent,
          totalBudget: job.totalBudget,
        });
        if (built.ok === false) {
          throw new Error(built.errors.map((entry) => `${entry.field}: ${entry.message}`).join('; ') || '批量内功模板无法构建');
        }
        return {
          id: techniqueId,
          generationId: job.jobId,
          template: built.template,
          schemaVersion: TECHNIQUE_GENERATION_SCHEMA_VERSION,
          createdByPlayerId: params.playerId,
          modelName: successfulAiResult!.modelName,
          promptSnapshot: params.playerContext,
          validationReport: {
            ...built.validationReport,
            batchNamingOnly: true,
            batchId,
            batchIndex: job.index,
            equalSixAttributeWeights: true,
          },
          grade: job.grade,
          category: 'internal',
          realmLv: job.realmLv,
          attemptCount: successfulAiResult!.attemptCount,
          draftExpireHours: TECHNIQUE_GENERATION_DRAFT_EXPIRE_HOURS,
        };
      });
      const persisted = await persistGeneratedTechniqueDraftBatch(pool, {
        playerId: params.playerId,
        modelName: successfulAiResult.modelName,
        attemptCount: successfulAiResult.attemptCount,
        draftExpireHours: TECHNIQUE_GENERATION_DRAFT_EXPIRE_HOURS,
        drafts,
      });
      if (!persisted.ok || persisted.techniqueIds.length !== drafts.length) {
        throw new Error(`technique_generation_batch_draft_state_conflict:${batchId}`);
      }
      return { success: true, techniqueId: persisted.techniqueIds[0] };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '批量领悟失败';
      if (error instanceof TechniqueGenerationCommitOutcomeUnknownError) {
        this.logger.warn(`批量内功草稿事务结果待确认 batchId=${batchId}`);
        return { success: false, error: '批量功法草稿正在确认中，请稍后查看。' };
      }
      await this.failBatchGenerationAndRefund(batchId, params, 'GENERATION_FAILED', message).catch(() => undefined);
      return { success: false, error: message };
    }
  }

  async getPreview(playerId: string, jobId: string): Promise<TechniquePreview | null> {
    const pool = this.pool;
    if (!pool) {
      return null;
    }
    const result = await pool.query(
      `SELECT gt.template,
              gt.model_name
       FROM technique_generation_job j
       JOIN generated_technique gt ON gt.id = j.draft_technique_id
       WHERE j.id = $1 AND j.player_id = $2 AND j.status = 'generated_draft'
       LIMIT 1`,
      [jobId, playerId],
    );
    const row = result.rows[0] as { template?: unknown; model_name?: unknown } | undefined;
    const template = row?.template as TechniqueTemplate | undefined;
    if (!template) {
      return null;
    }
    return buildTechniquePreview(template, row?.model_name);
  }

  async getJobOutcomeForPlayer(
    playerId: string,
    jobId: string,
  ): Promise<{ status: string | null; errorMessage?: string | null }> {
    const pool = this.pool;
    if (!pool) return { status: null };
    const result = await pool.query(
      `SELECT status, error_message
         FROM technique_generation_job
        WHERE player_id = $1 AND id = $2
        LIMIT 1`,
      [playerId, jobId],
    );
    const row = result.rows[0] as { status?: unknown; error_message?: unknown } | undefined;
    return {
      status: typeof row?.status === 'string' ? row.status : null,
      errorMessage: typeof row?.error_message === 'string' ? row.error_message : null,
    };
  }

  async getBatchOutcomeForPlayer(
    playerId: string,
    batchId: string,
  ): Promise<{ status: string | null; errorMessage?: string | null }> {
    const pool = this.pool;
    if (!pool) return { status: null };
    const result = await pool.query(
      `SELECT status, error_message
         FROM technique_generation_job
        WHERE player_id = $1
          AND LEFT(id, CHAR_LENGTH($2) + 1) = $2 || '_'
        ORDER BY id ASC`,
      [playerId, batchId],
    );
    const rows = result.rows as Array<{ status?: unknown; error_message?: unknown }>;
    if (rows.length === 0) return { status: null };
    const statuses = rows.map((row) => typeof row.status === 'string' ? row.status : '');
    const failed = rows.find((row) => row.status === 'failed');
    if (failed) {
      return {
        status: 'failed',
        errorMessage: typeof failed.error_message === 'string' ? failed.error_message : null,
      };
    }
    if (statuses.some((status) => status === 'cancelled')) return { status: 'cancelled' };
    if (statuses.every((status) => status === 'generated_draft')) return { status: 'generated_draft' };
    if (statuses.some((status) => status === 'running')) return { status: 'running' };
    if (statuses.every((status) => status === 'pending')) return { status: 'pending' };
    return { status: statuses[0] ?? null };
  }
  async getBatchPreviews(playerId: string, batchId: string): Promise<TechniqueBatchPreview[]> {
    const pool = this.pool;
    if (!pool) return [];
    const result = await pool.query(
      `SELECT j.id AS job_id,
              gt.template,
              gt.model_name
         FROM technique_generation_job j
         JOIN generated_technique gt ON gt.id = j.draft_technique_id
        WHERE j.player_id = $1
          AND LEFT(j.id, CHAR_LENGTH($2) + 1) = $2 || '_'
          AND j.status = 'generated_draft'
        ORDER BY j.id ASC`,
      [playerId, batchId],
    );
    return (result.rows as Array<{ job_id?: unknown; template?: unknown; model_name?: unknown }>)
      .map((row) => {
        const jobId = typeof row.job_id === 'string' ? row.job_id : '';
        const template = row.template as TechniqueTemplate | undefined;
        return jobId && template ? { jobId, ...buildTechniquePreview(template, row.model_name) } : null;
      })
      .filter((entry): entry is TechniqueBatchPreview => entry !== null);
  }

  /** 采纳草稿 → 直接学习 */
  async adoptDraft(params: {
    playerId: string;
    jobId: string;
    customName: string;
    learnerRealmLv: number;
    currentTick: number;
    expectedRuntimeOwnerId?: string | null;
    expectedSessionEpoch?: number | null;
    applyPendingComprehension?: (techniqueId: string) => Promise<boolean> | boolean;
  }): Promise<AdoptResult> {
    const pool = this.pool;
    if (!pool) {
      return { success: false, error: '功法领悟系统未就绪', errorCode: 'SERVICE_UNAVAILABLE' };
    }

    // 命名校验
    const name = params.customName.trim();
    const nameLength = [...name].length;
    if (!name || nameLength < CUSTOM_TECHNIQUE_NAME_MIN_LENGTH || nameLength > CUSTOM_TECHNIQUE_NAME_MAX_LENGTH) {
      return {
        success: false,
        error: `功法名称需 ${CUSTOM_TECHNIQUE_NAME_MIN_LENGTH}~${CUSTOM_TECHNIQUE_NAME_MAX_LENGTH} 字`,
        errorCode: 'NAME_INVALID',
      };
    }

    // 归一化名称（用于唯一检查）
    const normalizedName = name.toLowerCase().replace(/\s+/g, '');
    const expectedRuntimeOwnerId = normalizeTechniqueGenerationOwnerId(params.expectedRuntimeOwnerId);
    const expectedSessionEpoch = normalizeTechniqueGenerationSessionEpoch(params.expectedSessionEpoch);
    if (!expectedRuntimeOwnerId || expectedSessionEpoch === null || typeof params.applyPendingComprehension !== 'function') {
      return { success: false, error: '玩家功法持久化上下文不可用', errorCode: 'PERSISTENCE_CONTEXT_UNAVAILABLE' };
    }

    let adopted;
    try {
      adopted = await adoptDurableTechniqueDraft(pool, {
        playerId: params.playerId,
        jobId: params.jobId,
        displayName: name,
        normalizedName,
        learnerRealmLv: params.learnerRealmLv,
        currentTick: params.currentTick,
        expectedRuntimeOwnerId,
        expectedSessionEpoch,
      });
    } catch (error: unknown) {
      if (isPostgresUniqueViolation(error)) {
        return { success: false, error: '名称已存在，请更换', errorCode: 'NAME_CONFLICT' };
      }
      throw error;
    }
    if (!adopted.ok || !adopted.techniqueId) {
      return mapTechniqueGenerationAdoptError(adopted.errorCode);
    }

    // DB 已经同时写入 pending comprehension；缓存刷新后再应用同一状态到在线运行态。
    await this.generatedStore?.refreshAfterPublish();
    try {
      const applied = await params.applyPendingComprehension(adopted.techniqueId);
      if (!applied) {
        this.logger.warn(
          `自创功法采纳已提交但运行态已存在冲突 playerId=${params.playerId} jobId=${params.jobId} techniqueId=${adopted.techniqueId}`,
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        `自创功法采纳已提交但运行态同步失败 playerId=${params.playerId} jobId=${params.jobId} techniqueId=${adopted.techniqueId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    return {
      success: true,
      techniqueId: adopted.techniqueId,
      techniqueName: adopted.techniqueName ?? name,
    };
  }

  async adoptBatchDraft(params: {
    playerId: string;
    batchId: string;
    learnerRealmLv: number;
    currentTick: number;
    expectedRuntimeOwnerId?: string | null;
    expectedSessionEpoch?: number | null;
    applyPendingComprehensions?: (techniqueIds: string[]) => Promise<void> | void;
  }): Promise<BatchAdoptResult> {
    const pool = this.pool;
    if (!pool) return { success: false, error: '功法领悟系统未就绪', errorCode: 'SERVICE_UNAVAILABLE' };
    const expectedRuntimeOwnerId = normalizeTechniqueGenerationOwnerId(params.expectedRuntimeOwnerId);
    const expectedSessionEpoch = normalizeTechniqueGenerationSessionEpoch(params.expectedSessionEpoch);
    if (!expectedRuntimeOwnerId || expectedSessionEpoch === null || typeof params.applyPendingComprehensions !== 'function') {
      return { success: false, error: '玩家功法持久化上下文不可用', errorCode: 'PERSISTENCE_CONTEXT_UNAVAILABLE' };
    }
    const jobs = (await this.loadCurrentGenerationJobsForPlayer(params.playerId))
      .filter((job) => resolveTechniqueGenerationBatchId(job.id) === params.batchId)
      .sort(compareLoadedGenerationJobs);
    if (jobs.length === 0) return { success: false, error: '批量领悟任务不存在', errorCode: 'JOB_NOT_FOUND' };
    let adopted;
    try {
      adopted = await adoptDurableTechniqueDraftBatch(pool, {
        playerId: params.playerId,
        batchId: params.batchId,
        jobIds: jobs.map((job) => job.id),
        learnerRealmLv: params.learnerRealmLv,
        currentTick: params.currentTick,
        expectedRuntimeOwnerId,
        expectedSessionEpoch,
      });
    } catch (error: unknown) {
      if (isPostgresUniqueViolation(error)) {
        return { success: false, error: '部分功法名称已存在，请重新领悟', errorCode: 'NAME_CONFLICT' };
      }
      throw error;
    }
    if (!adopted.ok) {
      const mapped = mapTechniqueGenerationAdoptError(adopted.errorCode);
      return { success: false, error: mapped.error, errorCode: mapped.errorCode };
    }
    await this.generatedStore?.refreshAfterPublish();
    try {
      await params.applyPendingComprehensions(adopted.techniqueIds);
    } catch (error: unknown) {
      this.logger.error(
        `批量内功采纳已提交但运行态同步失败 playerId=${params.playerId} batchId=${params.batchId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
    return {
      success: true,
      batchId: params.batchId,
      techniqueIds: adopted.techniqueIds,
      techniqueNames: adopted.techniqueNames,
    };
  }

  /** 取消草稿并按悟道玉简投入折算返还功德。 */
  async discardDraft(params: {
    playerId: string;
    jobId: string;
    expectedRuntimeOwnerId?: string | null;
    expectedSessionEpoch?: number | null;
    applyInventorySnapshot?: (items: TechniqueGenerationRuntimeInventoryItem[]) => Promise<void> | void;
  }): Promise<DiscardResult> {
    const pool = this.pool;
    if (!pool) {
      return { success: false, error: '功法领悟系统未就绪', errorCode: 'SERVICE_UNAVAILABLE' };
    }
    const expectedRuntimeOwnerId = normalizeTechniqueGenerationOwnerId(params.expectedRuntimeOwnerId);
    const expectedSessionEpoch = normalizeTechniqueGenerationSessionEpoch(params.expectedSessionEpoch);
    if (!expectedRuntimeOwnerId || expectedSessionEpoch === null || typeof params.applyInventorySnapshot !== 'function') {
      return { success: false, error: '玩家资产持久化上下文不可用', errorCode: 'PERSISTENCE_CONTEXT_UNAVAILABLE' };
    }
    const refundRatio = rollDiscardRefundRatio();
    const refundCurrencyItemId = HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID;
    const discarded = await discardDurableTechniqueDraft(pool, {
      playerId: params.playerId,
      jobId: params.jobId,
      refundCurrencyItemId,
      refundRatio,
      refundBasePrice: TECHNIQUE_GENERATION_REFUND_BASE_PRICE,
      expectedRuntimeOwnerId,
      expectedSessionEpoch,
    });
    if (!discarded.ok) {
      return { success: false, error: '无可取消的草稿', errorCode: discarded.errorCode ?? 'JOB_STATE_INVALID' };
    }
    try {
      await params.applyInventorySnapshot(discarded.inventoryItems);
    } catch (error: unknown) {
      this.logger.error(
        `自创功法放弃返还已提交但运行态同步失败 playerId=${params.playerId} jobId=${params.jobId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
    const itemSpend = normalizeRefundItemSpend(discarded.itemSpend);
    const committedRefundRatio = Number(discarded.refundRatio ?? refundRatio);
    const committedRefundAmount = normalizeRefundItemSpend(discarded.refundAmount);
    this.logger.log(
      `自创功法取消返还 playerId=${params.playerId} jobId=${params.jobId} itemSpend=${itemSpend} refundRatio=${Math.round(committedRefundRatio * 100)}% refundCurrency=${discarded.refundCurrencyItemId ?? refundCurrencyItemId} refundAmount=${committedRefundAmount}`,
    );
    return {
      success: true,
      refund: {
        itemSpend,
        refundRatio: committedRefundRatio,
        refundAmount: committedRefundAmount,
        refundCurrencyItemId: discarded.refundCurrencyItemId ?? refundCurrencyItemId,
      },
    };
  }

  async discardBatchDraft(params: {
    playerId: string;
    batchId: string;
    expectedRuntimeOwnerId?: string | null;
    expectedSessionEpoch?: number | null;
    applyInventorySnapshot?: (items: TechniqueGenerationRuntimeInventoryItem[]) => Promise<void> | void;
  }): Promise<DiscardResult> {
    const pool = this.pool;
    if (!pool) return { success: false, error: '功法领悟系统未就绪', errorCode: 'SERVICE_UNAVAILABLE' };
    const expectedRuntimeOwnerId = normalizeTechniqueGenerationOwnerId(params.expectedRuntimeOwnerId);
    const expectedSessionEpoch = normalizeTechniqueGenerationSessionEpoch(params.expectedSessionEpoch);
    if (!expectedRuntimeOwnerId || expectedSessionEpoch === null || typeof params.applyInventorySnapshot !== 'function') {
      return { success: false, error: '玩家资产持久化上下文不可用', errorCode: 'PERSISTENCE_CONTEXT_UNAVAILABLE' };
    }
    const jobs = (await this.loadCurrentGenerationJobsForPlayer(params.playerId))
      .filter((job) => resolveTechniqueGenerationBatchId(job.id) === params.batchId)
      .sort(compareLoadedGenerationJobs);
    if (jobs.length === 0) return { success: false, error: '无可取消的批量草稿', errorCode: 'JOB_STATE_INVALID' };
    const refundRatio = rollDiscardRefundRatio();
    const refundCurrencyItemId = HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID;
    const discarded = await discardDurableTechniqueDraftBatch(pool, {
      playerId: params.playerId,
      batchId: params.batchId,
      jobIds: jobs.map((job) => job.id),
      refundCurrencyItemId,
      refundRatio,
      refundBasePrice: TECHNIQUE_GENERATION_REFUND_BASE_PRICE,
      expectedRuntimeOwnerId,
      expectedSessionEpoch,
    });
    if (!discarded.ok) {
      return { success: false, error: '无可取消的批量草稿', errorCode: discarded.errorCode ?? 'JOB_STATE_INVALID' };
    }
    try {
      await params.applyInventorySnapshot(discarded.inventoryItems);
    } catch (error: unknown) {
      this.logger.error(
        `批量内功放弃返还已提交但运行态同步失败 playerId=${params.playerId} batchId=${params.batchId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
    return {
      success: true,
      refund: {
        itemSpend: normalizeRefundItemSpend(discarded.itemSpend),
        refundRatio: Number(discarded.refundRatio ?? refundRatio),
        refundAmount: normalizeRefundItemSpend(discarded.refundAmount),
        refundCurrencyItemId: discarded.refundCurrencyItemId ?? refundCurrencyItemId,
      },
    };
  }

  async cancelGeneration(params: {
    playerId: string;
    jobId: string;
    expectedRuntimeOwnerId?: string | null;
    expectedSessionEpoch?: number | null;
    applyInventorySnapshot?: (items: TechniqueGenerationRuntimeInventoryItem[]) => Promise<void> | void;
  }): Promise<DiscardResult> {
    return this.cancelIncompleteGenerationJobs({
      playerId: params.playerId,
      operationRefId: params.jobId,
      operationKind: 'cancel',
      jobIds: [params.jobId],
      minAgeMs: TECHNIQUE_GENERATION_MANUAL_CANCEL_AFTER_MS,
      errorCode: 'PLAYER_CANCELLED',
      errorMessage: '玩家手动取消功法推演',
      expectedRuntimeOwnerId: params.expectedRuntimeOwnerId,
      expectedSessionEpoch: params.expectedSessionEpoch,
      applyInventorySnapshot: params.applyInventorySnapshot,
    });
  }

  async cancelBatchGeneration(params: {
    playerId: string;
    batchId: string;
    expectedRuntimeOwnerId?: string | null;
    expectedSessionEpoch?: number | null;
    applyInventorySnapshot?: (items: TechniqueGenerationRuntimeInventoryItem[]) => Promise<void> | void;
  }): Promise<DiscardResult> {
    const jobs = (await this.loadCurrentGenerationJobsForPlayer(params.playerId))
      .filter((job) => resolveTechniqueGenerationBatchId(job.id) === params.batchId)
      .sort(compareLoadedGenerationJobs);
    return this.cancelIncompleteGenerationJobs({
      playerId: params.playerId,
      operationRefId: params.batchId,
      operationKind: 'cancel_batch',
      jobIds: jobs.map((job) => job.id),
      minAgeMs: TECHNIQUE_GENERATION_MANUAL_CANCEL_AFTER_MS,
      errorCode: 'PLAYER_CANCELLED',
      errorMessage: '玩家手动取消批量功法推演',
      expectedRuntimeOwnerId: params.expectedRuntimeOwnerId,
      expectedSessionEpoch: params.expectedSessionEpoch,
      applyInventorySnapshot: params.applyInventorySnapshot,
    });
  }

  async cancelTimedOutIncompleteGenerationForPlayer(params: {
    playerId: string;
    expectedRuntimeOwnerId?: string | null;
    expectedSessionEpoch?: number | null;
    applyInventorySnapshot?: (items: TechniqueGenerationRuntimeInventoryItem[]) => Promise<void> | void;
  }): Promise<DiscardResult> {
    const jobs = (await this.loadCurrentGenerationJobsForPlayer(params.playerId))
      .filter((job) => job.status === 'pending' || job.status === 'running')
      .sort(compareLoadedGenerationJobs);
    if (jobs.length === 0) {
      return { success: false, error: '无可取消的推演任务', errorCode: 'JOB_STATE_INVALID' };
    }
    const batchId = resolveTechniqueGenerationBatchId(jobs[0].id);
    const targetJobs = batchId
      ? jobs.filter((job) => resolveTechniqueGenerationBatchId(job.id) === batchId)
      : [jobs[0]];
    return this.cancelIncompleteGenerationJobs({
      playerId: params.playerId,
      operationRefId: batchId ?? targetJobs[0]!.id,
      operationKind: batchId ? 'auto_cancel_batch' : 'auto_cancel',
      jobIds: targetJobs.map((job) => job.id),
      minAgeMs: TECHNIQUE_GENERATION_AUTO_CANCEL_AFTER_MS,
      errorCode: 'AUTO_TIMEOUT',
      errorMessage: '功法推演超过30分钟未完成，已自动取消',
      expectedRuntimeOwnerId: params.expectedRuntimeOwnerId,
      expectedSessionEpoch: params.expectedSessionEpoch,
      applyInventorySnapshot: params.applyInventorySnapshot,
    });
  }

  private async cancelIncompleteGenerationJobs(params: {
    playerId: string;
    operationRefId: string;
    operationKind: 'cancel' | 'cancel_batch' | 'auto_cancel' | 'auto_cancel_batch';
    jobIds: string[];
    minAgeMs: number;
    errorCode: string;
    errorMessage: string;
    expectedRuntimeOwnerId?: string | null;
    expectedSessionEpoch?: number | null;
    applyInventorySnapshot?: (items: TechniqueGenerationRuntimeInventoryItem[]) => Promise<void> | void;
  }): Promise<DiscardResult> {
    const pool = this.pool;
    if (!pool) return { success: false, error: '功法领悟系统未就绪', errorCode: 'SERVICE_UNAVAILABLE' };
    const expectedRuntimeOwnerId = normalizeTechniqueGenerationOwnerId(params.expectedRuntimeOwnerId);
    const expectedSessionEpoch = normalizeTechniqueGenerationSessionEpoch(params.expectedSessionEpoch);
    if (!expectedRuntimeOwnerId || expectedSessionEpoch === null || typeof params.applyInventorySnapshot !== 'function') {
      return { success: false, error: '玩家资产持久化上下文不可用', errorCode: 'PERSISTENCE_CONTEXT_UNAVAILABLE' };
    }
    const cancelled = await cancelDurableIncompleteTechniqueGeneration(pool, {
      playerId: params.playerId,
      operationRefId: params.operationRefId,
      operationKind: params.operationKind,
      jobIds: params.jobIds,
      minAgeMs: params.minAgeMs,
      errorCode: params.errorCode,
      errorMessage: params.errorMessage,
      expectedRuntimeOwnerId,
      expectedSessionEpoch,
    });
    if (!cancelled.ok) {
      const error = cancelled.errorCode === 'CANCEL_TOO_EARLY'
        ? '推演开始未满一分钟，暂不可取消'
        : '无可取消的推演任务';
      return { success: false, error, errorCode: cancelled.errorCode ?? 'JOB_STATE_INVALID' };
    }
    try {
      await params.applyInventorySnapshot(cancelled.inventoryItems);
    } catch (error: unknown) {
      this.logger.error(
        `自创功法取消返还已提交但运行态同步失败 playerId=${params.playerId} ref=${params.operationRefId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
    const itemSpend = normalizeRefundItemSpend(cancelled.itemSpend);
    return {
      success: true,
      refund: {
        itemSpend,
        refundRatio: 1,
        refundAmount: itemSpend,
        refundCurrencyItemId: TECHNIQUE_GENERATION_ITEM_ID,
      },
    };
  }

  /** 过期清理 */
  async expireStaleJobs(): Promise<number> {
    if (!this.pool) return 0;
    return expireStaleGenerationJobs(this.pool);
  }

  async recoverPendingJobs(limit = 200): Promise<number> {
    const pool = this.pool;
    if (!pool) {
      return 0;
    }
    await this.expireStaleJobs();
    const modelConfig = await this.modelConfigResolver?.();
    if (!modelConfig) {
      return 0;
    }
    const jobs = await loadRecoverableGenerationJobs(pool, limit);
    const scheduledBatchIds = new Set<string>();
    let scheduledCount = 0;
    for (const job of jobs) {
      const batchId = resolveTechniqueGenerationBatchId(job.id);
      if (batchId) {
        if (scheduledBatchIds.has(batchId)) continue;
        scheduledBatchIds.add(batchId);
        const batchJobs = await this.loadRecoverableBatchGenerationJobs(job.playerId, batchId);
        if (batchJobs.length === 0) continue;
        scheduledCount += batchJobs.length;
        setImmediate(() => {
          this.executeBatchGeneration(batchId, {
            playerId: job.playerId,
            playerContext: batchJobs[0]?.playerContext ?? '',
            jobs: batchJobs.map((entry, index) => ({
              jobId: entry.id,
              batchId,
              index: resolveTechniqueGenerationBatchIndex(entry.id) ?? index + 1,
              grade: normalizeTechniqueGenerationGrade(entry.grade),
              realmLv: entry.realmLv,
              budgetPercent: entry.budgetPercent,
              totalBudget: entry.totalBudget,
            })),
            modelConfig,
          }).catch(() => undefined);
        });
        continue;
      }
      scheduledCount += 1;
      setImmediate(() => {
        this.executeGeneration(job.id, {
          category: job.category as TechniqueCategory,
          grade: job.grade,
          realmLv: job.realmLv,
          playerContext: job.playerContext,
          playerId: job.playerId,
          itemSpend: job.itemSpend,
          budgetPercent: job.budgetPercent,
          totalBudget: job.totalBudget,
          modelConfig,
        }).catch(() => undefined);
      });
    }
    return scheduledCount;
  }

  async refundFailedConsumedJobsForPlayer(params: {
    playerId: string;
    expectedRuntimeOwnerId?: string | null;
    expectedSessionEpoch?: number | null;
    applyInventorySnapshot?: (items: TechniqueGenerationRuntimeInventoryItem[]) => Promise<void> | void;
    limit?: number;
  }): Promise<number> {
    const pool = this.pool;
    if (!pool) {
      return 0;
    }
    const expectedRuntimeOwnerId = normalizeTechniqueGenerationOwnerId(params.expectedRuntimeOwnerId);
    const expectedSessionEpoch = normalizeTechniqueGenerationSessionEpoch(params.expectedSessionEpoch);
    if (!expectedRuntimeOwnerId || expectedSessionEpoch === null || typeof params.applyInventorySnapshot !== 'function') {
      return 0;
    }
    const result = await refundDurableFailedTechniqueGenerationJobs(pool, {
      playerId: params.playerId,
      expectedRuntimeOwnerId,
      expectedSessionEpoch,
      limit: params.limit,
    });
    try {
      await params.applyInventorySnapshot(result.inventoryItems);
    } catch (error: unknown) {
      this.logger.error(
        `自创功法失败返还状态已回读但运行态同步失败 playerId=${params.playerId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
    return result.refundedItems;
  }

  async refundNoModelFailedConsumedJobsForPlayer(params: {
    playerId: string;
    expectedRuntimeOwnerId?: string | null;
    expectedSessionEpoch?: number | null;
    applyInventorySnapshot?: (items: TechniqueGenerationRuntimeInventoryItem[]) => Promise<void> | void;
    limit?: number;
  }): Promise<number> {
    return this.refundFailedConsumedJobsForPlayer(params);
  }

  private async failGenerationAndRefundItem(
    jobId: string,
    errorCode: string,
    errorMessage: string,
    params: { settleFailedRefund?: () => Promise<boolean> },
  ): Promise<void> {
    const pool = this.pool;
    if (!pool) {
      return;
    }
    const markedFailed = await updateGenerationJobStatus(pool, jobId, 'failed', errorCode, errorMessage);
    if (!markedFailed) {
      return;
    }
    if (typeof params.settleFailedRefund === 'function') {
      try {
        await params.settleFailedRefund();
      } catch (error: unknown) {
        this.logger.warn(
          `自创功法失败返还暂未完成，保留 item_refunded=false 供幂等重试 jobId=${jobId} error=${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private async failBatchGenerationAndRefund(
    batchId: string,
    params: {
      playerId: string;
      jobs: BatchGenerationExecutionJob[];
      settleFailedRefund?: () => Promise<boolean>;
    },
    errorCode: string,
    errorMessage: string,
  ): Promise<void> {
    const pool = this.pool;
    if (!pool) return;
    const marked = await failDurableTechniqueGenerationBatch(
      pool,
      params.playerId,
      params.jobs.map((job) => job.jobId),
      errorCode,
      errorMessage,
    );
    if (marked === 0 || typeof params.settleFailedRefund !== 'function') return;
    try {
      await params.settleFailedRefund();
    } catch (error: unknown) {
      this.logger.warn(
        `批量内功失败返还暂未完成 batchId=${batchId} error=${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async findPublishedTechniqueNameConflicts(normalizedNames: readonly string[]): Promise<string[]> {
    const pool = this.pool;
    if (!pool || normalizedNames.length === 0) return [];
    const result = await pool.query(
      `SELECT COALESCE(display_name, template->>'name', normalized_name) AS name
         FROM generated_technique
        WHERE is_published = true
          AND normalized_name = ANY($1::text[])
        ORDER BY name ASC`,
      [[...normalizedNames]],
    );
    return (result.rows as Array<{ name?: unknown }>)
      .map((row) => typeof row.name === 'string' ? row.name.trim() : '')
      .filter(Boolean);
  }

  private async loadCurrentGenerationJobsForPlayer(playerId: string): Promise<LoadedCurrentGenerationJob[]> {
    const pool = this.pool;
    if (!pool) {
      return [];
    }
    const result = await pool.query(
      `SELECT id,
              status,
              requested_category,
              rolled_grade,
              rolled_realm_lv,
              created_at,
              draft_expire_at
         FROM technique_generation_job
        WHERE player_id = $1
          AND (
            status IN ('pending', 'running')
            OR (
              status = 'generated_draft'
              AND (draft_expire_at IS NULL OR draft_expire_at > NOW())
            )
          )
        ORDER BY CASE status
                   WHEN 'generated_draft' THEN 0
                   WHEN 'running' THEN 1
                   ELSE 2
                 END ASC,
                 created_at ASC,
                 id ASC
        LIMIT 100`,
      [playerId],
    );
    return (result.rows as CurrentGenerationJobRow[])
      .filter((row) => isRecoverableGenerationJobStatus(row.status))
      .map((row) => ({
        id: row.id,
        status: row.status as LoadedCurrentGenerationJob['status'],
        category: typeof row.requested_category === 'string' ? row.requested_category : '',
        rolledGrade: normalizeTechniqueGenerationGrade(row.rolled_grade),
        rolledRealmLv: normalizePositiveInteger(row.rolled_realm_lv, 0),
        createdAt: row.created_at,
        draftExpireAt: row.draft_expire_at ?? null,
      }));
  }

  private async loadRecoverableBatchGenerationJobs(
    playerId: string,
    batchId: string,
  ): Promise<Array<{
    id: string;
    playerContext: string;
    grade: string;
    realmLv: number;
    budgetPercent: number;
    totalBudget: number;
  }>> {
    const pool = this.pool;
    if (!pool) return [];
    const result = await pool.query(
      `SELECT id,
              player_context,
              rolled_grade,
              rolled_realm_lv,
              rolled_budget_percent,
              rolled_total_budget
         FROM technique_generation_job
        WHERE player_id = $1
          AND LEFT(id, CHAR_LENGTH($2) + 1) = $2 || '_'
          AND (
            status = 'pending'
            OR (status = 'running' AND updated_at <= NOW() - INTERVAL '10 minutes')
          )
          AND item_consumed = true
          AND draft_technique_id IS NULL
        ORDER BY id ASC`,
      [playerId, batchId],
    );
    return (result.rows as Array<Record<string, unknown>>).map((row) => ({
      id: typeof row.id === 'string' ? row.id : '',
      playerContext: typeof row.player_context === 'string' ? row.player_context : '',
      grade: typeof row.rolled_grade === 'string' ? row.rolled_grade : 'mortal',
      realmLv: normalizePositiveInteger(row.rolled_realm_lv, 1),
      budgetPercent: normalizePositiveNumber(row.rolled_budget_percent, 1),
      totalBudget: normalizePositiveNumber(row.rolled_total_budget, 0),
    })).filter((row) => row.id.length > 0);
  }
}

type CurrentGenerationJob = NonNullable<GenerationStatus['currentJob']>;

interface LoadedCurrentGenerationJob {
  id: string;
  status: CurrentGenerationJob['status'];
  category: string;
  rolledGrade: CurrentGenerationJob['rolledGrade'];
  rolledRealmLv: number;
  createdAt: unknown;
  draftExpireAt: unknown;
}

interface BatchGenerationExecutionJob {
  jobId: string;
  batchId: string;
  index: number;
  grade: TechniqueTemplate['grade'];
  realmLv: number;
  budgetPercent: number;
  totalBudget: number;
}

interface BatchTechniqueNamingEntry {
  name: string;
  desc: string;
  normalizedName: string;
}

interface CurrentGenerationJobRow {
  id: string;
  status: unknown;
  requested_category?: unknown;
  rolled_grade?: unknown;
  rolled_realm_lv?: unknown;
  created_at?: unknown;
  draft_expire_at?: unknown;
}

const RECOVERABLE_GENERATION_JOB_STATUSES = new Set<CurrentGenerationJob['status']>([
  'pending',
  'running',
  'generated_draft',
]);

function isRecoverableGenerationJobStatus(value: unknown): value is CurrentGenerationJob['status'] {
  return typeof value === 'string' && RECOVERABLE_GENERATION_JOB_STATUSES.has(value as CurrentGenerationJob['status']);
}

function normalizeTechniqueGenerationGrade(value: unknown): CurrentGenerationJob['rolledGrade'] {
  const raw = typeof value === 'string' ? value : '';
  return (TECHNIQUE_GRADE_ORDER as readonly string[]).includes(raw)
    ? raw as CurrentGenerationJob['rolledGrade']
    : 'mortal';
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.trunc(numeric));
}

function normalizePositiveNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function rollDiscardRefundRatio(): number {
  const raw = DISCARD_REFUND_RATIO_MIN + Math.random() * (DISCARD_REFUND_RATIO_MAX - DISCARD_REFUND_RATIO_MIN);
  return Math.round(raw * 10000) / 10000;
}

function formatTechniqueGenerationTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  return new Date(0).toISOString();
}

function compareLoadedGenerationJobs(left: LoadedCurrentGenerationJob, right: LoadedCurrentGenerationJob): number {
  const leftIndex = resolveTechniqueGenerationBatchIndex(left.id) ?? 0;
  const rightIndex = resolveTechniqueGenerationBatchIndex(right.id) ?? 0;
  return leftIndex - rightIndex || left.id.localeCompare(right.id);
}

function resolveTechniqueGenerationBatchStatus(
  jobs: readonly LoadedCurrentGenerationJob[],
): TechniqueGenerationBatchStatus['status'] {
  if (jobs.length > 0 && jobs.every((job) => job.status === 'generated_draft')) return 'generated_draft';
  if (jobs.some((job) => job.status === 'running' || job.status === 'generated_draft')) return 'running';
  return 'pending';
}

function buildTechniquePreview(template: TechniqueTemplate, modelNameInput: unknown): TechniquePreview {
  const previewLayers = resolvePreviewLayers(template);
  const maxLayer = template.maxLayer ?? TECHNIQUE_INTERNAL_DEFAULT_MAX_LAYER;
  const fullLevelAttrs = previewLayers
    ? normalizePositiveAttrs(calcTechniqueAttrValues(maxLayer, previewLayers))
    : undefined;
  return {
    techniqueId: template.id,
    suggestedName: template.name,
    grade: template.grade,
    category: template.category ?? 'internal',
    realmLv: template.realmLv ?? 1,
    desc: template.desc ?? '',
    fullLevelAttrs,
    skills: Array.isArray(template.skills) ? template.skills : undefined,
    maxLayer,
    expDifficulty: template.expDifficulty ?? 1,
    modelName: typeof modelNameInput === 'string' && modelNameInput.trim() ? modelNameInput.trim() : undefined,
    budgetPercent: template.budgetPercent,
    totalBudget: template.totalBudget,
  };
}

function normalizeBatchTechniqueNamingResponse(
  value: Record<string, unknown>,
  expectedCount: number,
): { ok: true; value: BatchTechniqueNamingEntry[] } | { ok: false; error: string } {
  const techniques = value.techniques;
  if (!Array.isArray(techniques) || techniques.length !== expectedCount) {
    return { ok: false, error: `techniques 数量必须严格等于 ${expectedCount}` };
  }
  const entries: BatchTechniqueNamingEntry[] = [];
  for (let index = 0; index < techniques.length; index += 1) {
    const raw = techniques[index];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, error: `techniques[${index}] 必须是对象` };
    }
    const record = raw as Record<string, unknown>;
    const extraKeys = Object.keys(record).filter((key) => key !== 'name' && key !== 'desc');
    if (extraKeys.length > 0) {
      return { ok: false, error: `techniques[${index}] 只能包含 name 和 desc` };
    }
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    const desc = typeof record.desc === 'string' ? record.desc.trim() : '';
    const nameLength = [...name].length;
    const descLength = [...desc].length;
    if (nameLength < CUSTOM_TECHNIQUE_NAME_MIN_LENGTH || nameLength > CUSTOM_TECHNIQUE_NAME_MAX_LENGTH) {
      return { ok: false, error: `techniques[${index}].name 必须为 ${CUSTOM_TECHNIQUE_NAME_MIN_LENGTH}~${CUSTOM_TECHNIQUE_NAME_MAX_LENGTH} 字` };
    }
    if (descLength < 20 || descLength > 60) {
      return { ok: false, error: `techniques[${index}].desc 必须为 20~60 字` };
    }
    entries.push({
      name,
      desc,
      normalizedName: name.toLowerCase().replace(/\s+/g, ''),
    });
  }
  if (new Set(entries.map((entry) => entry.normalizedName)).size !== entries.length) {
    return { ok: false, error: '同批功法名称不得重复' };
  }
  return { ok: true, value: entries };
}

function resolvePreviewLayers(template: TechniqueTemplate): TechniqueLayerDef[] | undefined {
  if (shouldExpandTechniqueAttrRatio(template)) {
    return expandTechniqueAttrRatio(template).layers;
  }
  if (!Array.isArray(template.layers)) {
    return undefined;
  }
  const layers: TechniqueLayerDef[] = [];
  for (const layer of template.layers) {
    if (isTechniqueLayerDef(layer)) {
      layers.push(layer);
    }
  }
  return layers.length > 0 ? layers : undefined;
}

type TechniqueTemplateLayerEntry = NonNullable<TechniqueTemplate['layers']>[number];

function isTechniqueLayerDef(layer: TechniqueTemplateLayerEntry): layer is TechniqueLayerDef {
  return Boolean(layer && Number.isFinite((layer as TechniqueLayerDef).level) && Number.isFinite((layer as TechniqueLayerDef).expToNext));
}

function normalizePositiveAttrs(attrs: Partial<Attributes>): Partial<Attributes> | undefined {
  const result: Partial<Attributes> = {};
  for (const [key, value] of Object.entries(attrs) as Array<[keyof Attributes, number]>) {
    if (Number.isFinite(value) && value > 0) {
      result[key] = Math.round(value);
    }
  }
  return Object.keys(result).length > 0 ? result : {};
}

function normalizeRefundItemSpend(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  return Math.max(1, Math.trunc(numeric));
}

function normalizeTechniqueGenerationOwnerId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeTechniqueGenerationSessionEpoch(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) {
    return null;
  }
  return Math.trunc(numeric);
}

function mapTechniqueGenerationAdoptError(errorCode: string | undefined): AdoptResult {
  switch (errorCode) {
    case 'JOB_NOT_FOUND':
      return { success: false, error: '任务不存在', errorCode };
    case 'DRAFT_EXPIRED':
      return { success: false, error: '草稿已过期', errorCode };
    case 'NAME_CONFLICT':
      return { success: false, error: '名称已存在，请更换', errorCode };
    case 'TECHNIQUE_ALREADY_LEARNED':
      return { success: false, error: '功法已经掌握', errorCode };
    default:
      return { success: false, error: '草稿状态异常', errorCode: errorCode ?? 'JOB_STATE_INVALID' };
  }
}

function isPostgresUniqueViolation(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && String((error as { code?: unknown }).code ?? '') === '23505'
  );
}

export function normalizeGeneratedTechniqueCandidateForServer(
  candidate: Record<string, unknown>,
  fixed: {
    category: TechniqueCategory;
    grade: string;
    realmLv: number;
    maxLayer: number;
    budgetPercent: number;
    totalBudget: number;
    playerContext?: string;
  },
): Record<string, unknown> {
  const fixedCandidate = normalizeGeneratedTechniqueCandidateBase(candidate, {
    category: fixed.category as Extract<TechniqueCategory, 'internal' | 'arts'>,
    grade: fixed.grade as TechniqueTemplate['grade'],
    realmLv: fixed.realmLv,
    maxLayer: fixed.maxLayer,
    budgetPercent: fixed.budgetPercent,
    totalBudget: fixed.totalBudget,
  });
  return fixedCandidate;
}

type ParseAiJsonObjectResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string; excerpt: string };

function parseAiJsonObject(content: string): ParseAiJsonObjectResult {
  const candidates = uniqueNonEmptyStrings([
    content.trim(),
    extractFirstJsonObjectText(content),
  ]);
  let lastError = '';
  for (const candidate of candidates) {
    const direct = tryParseJsonRecord(candidate);
    if (direct.ok) return direct;
    if (direct.ok === false) {
      lastError = direct.error;
    }
    const repaired = repairMissingCommasBeforeObjectKeys(candidate);
    if (repaired !== candidate) {
      const repairedResult = tryParseJsonRecord(repaired);
      if (repairedResult.ok) return repairedResult;
      if (repairedResult.ok === false) {
        lastError = repairedResult.error;
      }
    }
  }
  return {
    ok: false,
    error: lastError || '未找到合法 JSON 对象',
    excerpt: truncateAiContentExcerpt(content, 1000),
  };
}

function tryParseJsonRecord(content: string): ParseAiJsonObjectResult {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'JSON 根节点必须是对象', excerpt: truncateAiContentExcerpt(content, 1000) };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      excerpt: truncateAiContentExcerpt(content, 1000),
    };
  }
}

function extractFirstJsonObjectText(content: string): string {
  const start = content.indexOf('{');
  if (start < 0) return '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < content.length; index += 1) {
    const char = content[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      depth += 1;
      continue;
    }
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return content.slice(start, index + 1).trim();
      }
    }
  }
  return '';
}

function repairMissingCommasBeforeObjectKeys(content: string): string {
  let result = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (inString) {
      result += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      const closingQuote = findStringClosingQuote(content, index);
      const nextNonWhitespace = findNextNonWhitespaceIndex(content, closingQuote + 1);
      const previousNonWhitespace = findPreviousNonWhitespaceChar(result);
      if (
        closingQuote > index
        && content[nextNonWhitespace] === ':'
        && previousNonWhitespace
        && previousNonWhitespace !== '{'
        && previousNonWhitespace !== '['
        && previousNonWhitespace !== ','
        && previousNonWhitespace !== ':'
      ) {
        result += ',';
      }
      inString = true;
    }
    result += char;
  }
  return result;
}

function findStringClosingQuote(content: string, start: number): number {
  let escaped = false;
  for (let index = start + 1; index < content.length; index += 1) {
    const char = content[index];
    if (escaped) {
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (char === '"') {
      return index;
    }
  }
  return -1;
}

function findNextNonWhitespaceIndex(content: string, start: number): number {
  for (let index = Math.max(0, start); index < content.length; index += 1) {
    if (!/\s/.test(content[index])) return index;
  }
  return -1;
}

function findPreviousNonWhitespaceChar(content: string): string {
  for (let index = content.length - 1; index >= 0; index -= 1) {
    if (!/\s/.test(content[index])) return content[index];
  }
  return '';
}

function uniqueNonEmptyStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function truncateAiContentExcerpt(content: string, limit: number): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}

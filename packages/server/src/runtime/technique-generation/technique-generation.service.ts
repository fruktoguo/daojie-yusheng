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
import { Injectable } from '@nestjs/common';
import type { Attributes, TechniqueCategory, TechniqueLayerDef, TechniqueTemplate } from '@mud/shared';
import {
  TECHNIQUE_GRADE_ORDER,
  TECHNIQUE_INTERNAL_DEFAULT_MAX_LAYER,
  calcInternalTechniqueAttrTotalByBudgetPercent,
  calcTechniqueAttrValues,
  expandTechniqueArtsStrengthSkill,
  expandTechniqueAttrRatio,
  normalizeTechniqueArtsStrengthTemplate,
  normalizeTechniqueAttrRatio,
  shouldExpandTechniqueAttrRatio,
  type ExpandedTechniqueArtsStrengthSkill,
  type NormalizedTechniqueArtsStrengthTemplate,
} from '@mud/shared';

import { executeAiTask, type AiTaskRequest, type AiTaskResult } from '../../ai/ai-task-execution.service';
import { sanitizePlayerContext } from '../../ai/ai-prompt-sanitizer';
import type { AiTextModelConfig } from '../../ai/ai-model-config';

import {
  insertGeneratedTechnique,
  insertGenerationJob,
  loadRecoverableGenerationJobs,
  loadRefundableFailedGenerationJobsForPlayer,
  markGenerationJobItemConsumed,
  markGenerationJobItemRefunded,
  markGenerationJobRunning,
  updateGenerationJobToDraft,
  updateGenerationJobStatus,
  publishGeneratedTechnique,
  expireStaleGenerationJobs,
} from '../../persistence/generated-technique-persistence.service';

import { GeneratedTechniqueStoreService } from './generated-technique-store.service';
import { validateTechniqueCandidate } from './technique-candidate-validator';
import { buildTechniquePrompt, buildRetryPrompt } from './technique-prompt-builder';
import { calcArtsBudgetMax } from './technique-budget-normalizer';
import {
  normalizeTechniqueGenerationItemSpend,
  rollTechniqueBudgetPercent,
  rollBoostedTechniqueOutcome,
} from './technique-generation-roll';
import {
  TECHNIQUE_GENERATION_UNLOCK_REALM_LV,
  TECHNIQUE_GENERATION_DRAFT_EXPIRE_HOURS,
  TECHNIQUE_GENERATION_SCHEMA_VERSION,
} from './technique-generation-constants';
import type {
  GenerationJobResult,
  GenerationExecutionResult,
  AdoptResult,
  GenerationStatus,
  TechniquePreview,
} from './technique-generation.types';

@Injectable()
export class TechniqueGenerationService {
  private pool: Pool | null = null;
  private generatedStore: GeneratedTechniqueStoreService | null = null;
  private modelConfigResolver: (() => Promise<AiTextModelConfig | null>) | null = null;
  private readonly refundingJobIds = new Set<string>();

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

  async getCurrentStatusForPlayer(playerId: string): Promise<Pick<GenerationStatus, 'currentJob' | 'currentDraft'>> {
    const job = await this.loadCurrentGenerationJobForPlayer(playerId);
    if (!job) {
      return { currentJob: null, currentDraft: null };
    }
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
    return { currentJob, currentDraft };
  }

  /** 发起生成 */
  async requestGeneration(params: {
    playerId: string;
    playerRealmLv: number;
    category: TechniqueCategory;
    playerContext?: string;
    itemSpend?: number;
    consumeItem: (count: number) => Promise<boolean>;
    refundItem?: (count: number) => Promise<boolean>;
  }): Promise<GenerationJobResult> {
    const pool = this.pool;
    if (!pool) {
      return { success: false, error: '功法领悟系统未就绪', errorCode: 'SERVICE_UNAVAILABLE' };
    }

    // 1. 境界校验
    if (params.playerRealmLv < TECHNIQUE_GENERATION_UNLOCK_REALM_LV) {
      return { success: false, error: '需筑基期方可领悟', errorCode: 'REALM_LOCKED' };
    }

    // 2. category 限制
    if (params.category !== 'internal' && params.category !== 'arts') {
      return { success: false, error: '当前仅开放内功和术法', errorCode: 'CATEGORY_LOCKED' };
    }

    const activeJob = await this.loadCurrentGenerationJobForPlayer(params.playerId);
    if (activeJob) {
      return { success: false, error: '请先处理未完成的功法领悟', errorCode: 'ACTIVE_JOB_EXISTS' };
    }

    // 3. 随机 realmLv + 品阶；投入多个悟道玉简时，多次抽取并择优。
    const itemSpend = normalizeTechniqueGenerationItemSpend(params.itemSpend);
    const roll = rollBoostedTechniqueOutcome(params.playerRealmLv, itemSpend);
    const rolledRealmLv = roll.realmLv;
    const rolledGrade = roll.grade;
    const budgetPercent = rollTechniqueBudgetPercent();
    const totalBudget = calculateGenerationTotalBudget(params.category, rolledGrade, rolledRealmLv, budgetPercent);

    // 4. 先创建 job 审计，再消耗道具；数据库不可写时不能扣玩家资产。
    const jobId = randomUUID();
    const sanitizedContext = sanitizePlayerContext(params.playerContext);

    await insertGenerationJob(pool, {
      id: jobId,
      playerId: params.playerId,
      requestedCategory: params.category,
      rolledGrade,
      rolledRealmLv,
      playerContext: sanitizedContext,
      itemSpend,
      budgetPercent,
      totalBudget,
    });

    // 5. 模型未配置属于系统不可用，不消耗玩家资产。
    const modelConfig = await this.modelConfigResolver?.();
    if (!modelConfig) {
      await updateGenerationJobStatus(pool, jobId, 'failed', 'NO_MODEL', 'AI 模型未配置');
      return { success: false, error: 'AI 模型未配置', errorCode: 'NO_MODEL' };
    }

    // 6. 消耗悟道玉简
    const consumed = await params.consumeItem(itemSpend);
    if (!consumed) {
      await updateGenerationJobStatus(pool, jobId, 'failed', 'ITEM_NOT_ENOUGH', '悟道玉简不足');
      return { success: false, error: '悟道玉简不足', errorCode: 'ITEM_NOT_ENOUGH' };
    }
    await markGenerationJobItemConsumed(pool, jobId);

    // 6. 异步触发执行
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
        refundItem: params.refundItem,
      }).catch(() => undefined);
    });

    return { success: true, jobId, rolledGrade, rolledRealmLv, itemSpend, budgetPercent, totalBudget };
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
    refundItem?: (count: number) => Promise<boolean>;
  }): Promise<GenerationExecutionResult> {
    const pool = this.pool;
    if (!pool) {
      return { success: false, error: '功法领悟系统未就绪' };
    }
    try {
      await markGenerationJobRunning(pool, jobId);

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
        : calculateGenerationTotalBudget(params.category as TechniqueCategory, params.grade as any, params.realmLv, budgetPercent);
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

        const fixedCandidate = applyServerFixedTechniqueFields(parsed, {
          category: params.category as TechniqueCategory,
          grade: params.grade,
          realmLv: params.realmLv,
          maxLayer,
          budgetPercent,
          totalBudget,
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

      const rawCandidate = cloneJsonRecord(candidate);
      let artsStrengthNormalizationReport: ArtsStrengthGenerationReport | undefined;

      // 补全字段
      const techniqueId = `gen_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

      // 术法归一化：把 AI 强度草稿展开成正式 SkillDef，避免恢复时被模板注册表过滤。
      if (params.category === 'arts') {
        const normalizedArts = normalizeTechniqueArtsStrengthTemplate(candidate);
        if (!normalizedArts.ok || !normalizedArts.template) {
          const reason = normalizedArts.errors.join('; ') || '术法强度草稿无法归一化';
          await this.failGenerationAndRefundItem(jobId, 'VALIDATION_FAILED', reason, params);
          return { success: false, error: reason };
        }
        const targetBudget = totalBudget;
        const expandedArts = normalizedArts.template.skills.map((skill, index) => (
          expandTechniqueArtsStrengthSkill({
            techniqueId,
            grade: params.grade as any,
            realmLv: params.realmLv,
            skillIndex: index,
            skill,
            targetBudget,
          })
        ));
        candidate.skills = expandedArts.map((entry) => entry.skill);
        artsStrengthNormalizationReport = buildArtsStrengthGenerationReport({
          rawCandidate,
          normalizedTemplate: normalizedArts.template,
          expandedSkills: expandedArts,
        });
      }

      const template: TechniqueTemplate = {
        id: techniqueId,
        name: String(candidate.name ?? '无名功法'),
        desc: typeof candidate.desc === 'string' ? candidate.desc : undefined,
        grade: params.grade as any,
        category: params.category,
        realmLv: params.realmLv,
        budgetPercent,
        totalBudget,
        attrRatio: params.category === 'internal'
          ? normalizeTechniqueAttrRatio(candidate.attrRatio as Record<string, unknown>)
          : undefined,
        attrFloat: typeof candidate.attrFloat === 'number' ? candidate.attrFloat : undefined,
        maxLayer,
        expDifficulty: typeof candidate.expDifficulty === 'number' ? candidate.expDifficulty : 1.0,
        skills: params.category === 'arts' ? candidate.skills as any : undefined,
      };

      // 落库
      await insertGeneratedTechnique(pool, {
        id: techniqueId,
        generationId: jobId,
        template,
        schemaVersion: TECHNIQUE_GENERATION_SCHEMA_VERSION,
        createdByPlayerId: params.playerId,
        modelName: successfulAiResult.modelName,
        promptSnapshot: params.playerContext,
        validationReport: {
          valid: true,
          errors: [],
          ...(artsStrengthNormalizationReport ? { artsStrength: artsStrengthNormalizationReport } : {}),
        },
        grade: params.grade,
        category: params.category,
        realmLv: params.realmLv,
      });

      await updateGenerationJobToDraft(pool, {
        id: jobId,
        draftTechniqueId: techniqueId,
        modelName: successfulAiResult.modelName,
        attemptCount: successfulAiResult.attemptCount,
        draftExpireHours: TECHNIQUE_GENERATION_DRAFT_EXPIRE_HOURS,
      });

      return { success: true, techniqueId };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '功法领悟失败';
      await this.failGenerationAndRefundItem(jobId, 'GENERATION_FAILED', message, params).catch(() => undefined);
      return { success: false, error: message };
    }
  }

  async getPreview(playerId: string, jobId: string): Promise<TechniquePreview | null> {
    const pool = this.pool;
    if (!pool) {
      return null;
    }
    const result = await pool.query(
      `SELECT gt.template
       FROM technique_generation_job j
       JOIN generated_technique gt ON gt.id = j.draft_technique_id
       WHERE j.id = $1 AND j.player_id = $2 AND j.status = 'generated_draft'
       LIMIT 1`,
      [jobId, playerId],
    );
    const template = result.rows[0]?.template as TechniqueTemplate | undefined;
    if (!template) {
      return null;
    }
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
      budgetPercent: template.budgetPercent,
      totalBudget: template.totalBudget,
    };
  }

  /** 采纳草稿 → 直接学习 */
  async adoptDraft(params: {
    playerId: string;
    jobId: string;
    customName: string;
  }): Promise<AdoptResult> {
    const pool = this.pool;
    if (!pool) {
      return { success: false, error: '功法领悟系统未就绪', errorCode: 'SERVICE_UNAVAILABLE' };
    }

    // 命名校验
    const name = params.customName.trim();
    if (!name || [...name].length < 2 || [...name].length > 8) {
      return { success: false, error: '功法名称需 2~8 字', errorCode: 'NAME_INVALID' };
    }

    // 归一化名称（用于唯一检查）
    const normalizedName = name.toLowerCase().replace(/\s+/g, '');

    // 唯一检查
    const conflictResult = await pool.query(
      `SELECT id FROM generated_technique WHERE normalized_name = $1 AND is_published = true LIMIT 1`,
      [normalizedName],
    );
    if ((conflictResult.rowCount ?? 0) > 0) {
      return { success: false, error: '名称已存在，请更换', errorCode: 'NAME_CONFLICT' };
    }

    // 读取 job
    const jobResult = await pool.query(
      `SELECT status, draft_technique_id, draft_expire_at FROM technique_generation_job WHERE id = $1 AND player_id = $2`,
      [params.jobId, params.playerId],
    );
    const job = jobResult.rows[0] as Record<string, unknown> | undefined;
    if (!job) {
      return { success: false, error: '任务不存在', errorCode: 'JOB_NOT_FOUND' };
    }
    if (job.status !== 'generated_draft') {
      return { success: false, error: '草稿状态异常', errorCode: 'JOB_STATE_INVALID' };
    }
    const expireAt = job.draft_expire_at ? new Date(String(job.draft_expire_at)) : null;
    if (expireAt && expireAt.getTime() <= Date.now()) {
      return { success: false, error: '草稿已过期', errorCode: 'DRAFT_EXPIRED' };
    }

    const techniqueId = String(job.draft_technique_id);

    // 发布
    await publishGeneratedTechnique(pool, {
      id: techniqueId,
      displayName: name,
      normalizedName,
    });

    // 更新 job
    await updateGenerationJobStatus(pool, params.jobId, 'learned');

    // 刷新缓存
    await this.generatedStore?.refreshAfterPublish();

    return { success: true, techniqueId, techniqueName: name };
  }

  /** 放弃草稿 */
  async discardDraft(playerId: string, jobId: string): Promise<{ success: boolean; error?: string }> {
    const pool = this.pool;
    if (!pool) {
      return { success: false, error: '功法领悟系统未就绪' };
    }
    const jobResult = await pool.query(
      `SELECT status FROM technique_generation_job WHERE id = $1 AND player_id = $2`,
      [jobId, playerId],
    );
    const job = jobResult.rows[0] as Record<string, unknown> | undefined;
    if (!job || job.status !== 'generated_draft') {
      return { success: false, error: '无可放弃的草稿' };
    }
    await updateGenerationJobStatus(pool, jobId, 'discarded');
    return { success: true };
  }

  /** 过期清理 */
  async expireStaleJobs(): Promise<number> {
    if (!this.pool) return 0;
    return expireStaleGenerationJobs(this.pool);
  }

  async recoverPendingJobs(limit = 20): Promise<number> {
    const pool = this.pool;
    if (!pool) {
      return 0;
    }
    const modelConfig = await this.modelConfigResolver?.();
    if (!modelConfig) {
      return 0;
    }
    const jobs = await loadRecoverableGenerationJobs(pool, limit);
    for (const job of jobs) {
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
    return jobs.length;
  }

  async refundFailedConsumedJobsForPlayer(params: {
    playerId: string;
    refundItem: (count: number) => Promise<boolean>;
    limit?: number;
  }): Promise<number> {
    const pool = this.pool;
    if (!pool) {
      return 0;
    }
    const jobs = await loadRefundableFailedGenerationJobsForPlayer(pool, params.playerId, params.limit ?? 20);
    let refunded = 0;
    for (const job of jobs) {
      if (this.refundingJobIds.has(job.id)) {
        continue;
      }
      this.refundingJobIds.add(job.id);
      try {
        const refundOk = await params.refundItem(job.itemSpend);
        if (!refundOk) {
          continue;
        }
        const marked = await markGenerationJobItemRefunded(pool, job.id);
        if (marked) {
          refunded += job.itemSpend;
        }
      } finally {
        this.refundingJobIds.delete(job.id);
      }
    }
    return refunded;
  }

  async refundNoModelFailedConsumedJobsForPlayer(params: {
    playerId: string;
    refundItem: (count: number) => Promise<boolean>;
    limit?: number;
  }): Promise<number> {
    return this.refundFailedConsumedJobsForPlayer(params);
  }

  private async failGenerationAndRefundItem(
    jobId: string,
    errorCode: string,
    errorMessage: string,
    params: { itemSpend?: number; refundItem?: (count: number) => Promise<boolean> },
  ): Promise<void> {
    const pool = this.pool;
    if (!pool) {
      return;
    }
    await updateGenerationJobStatus(pool, jobId, 'failed', errorCode, errorMessage);
    if (typeof params.refundItem !== 'function') {
      return;
    }
    if (this.refundingJobIds.has(jobId)) {
      return;
    }
    this.refundingJobIds.add(jobId);
    try {
      const itemSpend = normalizeRefundItemSpend(params.itemSpend);
      const refundOk = await params.refundItem(itemSpend);
      if (!refundOk) {
        return;
      }
      await markGenerationJobItemRefunded(pool, jobId);
    } finally {
      this.refundingJobIds.delete(jobId);
    }
  }

  private async loadCurrentGenerationJobForPlayer(playerId: string): Promise<LoadedCurrentGenerationJob | null> {
    const pool = this.pool;
    if (!pool) {
      return null;
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
        LIMIT 1`,
      [playerId],
    );
    const row = result.rows[0] as CurrentGenerationJobRow | undefined;
    if (!row || !isRecoverableGenerationJobStatus(row.status)) {
      return null;
    }
    return {
      id: row.id,
      status: row.status,
      category: typeof row.requested_category === 'string' ? row.requested_category : '',
      rolledGrade: normalizeTechniqueGenerationGrade(row.rolled_grade),
      rolledRealmLv: normalizePositiveInteger(row.rolled_realm_lv, 0),
      createdAt: row.created_at,
      draftExpireAt: row.draft_expire_at ?? null,
    };
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

function calculateGenerationTotalBudget(
  category: TechniqueCategory,
  grade: TechniqueTemplate['grade'],
  realmLv: number,
  budgetPercent: number,
): number {
  const normalizedBudgetPercent = Number.isFinite(budgetPercent) ? Math.max(0, budgetPercent) : 1;
  const totalBudget = category === 'arts'
    ? calcArtsBudgetMax(grade, realmLv) * normalizedBudgetPercent
    : calcInternalTechniqueAttrTotalByBudgetPercent(grade, realmLv, normalizedBudgetPercent);
  return Math.round(totalBudget * 10_000) / 10_000;
}

function normalizeRefundItemSpend(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  return Math.max(1, Math.trunc(numeric));
}

function applyServerFixedTechniqueFields(
  candidate: Record<string, unknown>,
  fixed: {
    category: TechniqueCategory;
    grade: string;
    realmLv: number;
    maxLayer: number;
    budgetPercent: number;
    totalBudget: number;
  },
): Record<string, unknown> {
  return {
    ...candidate,
    grade: fixed.grade,
    category: fixed.category,
    realmLv: fixed.realmLv,
    maxLayer: fixed.maxLayer,
    budgetPercent: fixed.budgetPercent,
    totalBudget: fixed.totalBudget,
  };
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

interface ArtsStrengthGenerationReport {
  version: 1;
  note: string;
  rawCandidate: Record<string, unknown>;
  normalizedTemplate: NormalizedTechniqueArtsStrengthTemplate;
  expansion: Array<{
    skillId: string;
    inputBudget: number;
    totalBudget: number;
    targetBudget: number;
    effectScale: number;
    structureBudgetMultiplier: number;
    budgetBreakdown: ExpandedTechniqueArtsStrengthSkill['budgetBreakdown'];
  }>;
}

function buildArtsStrengthGenerationReport(params: {
  rawCandidate: Record<string, unknown>;
  normalizedTemplate: NormalizedTechniqueArtsStrengthTemplate;
  expandedSkills: ExpandedTechniqueArtsStrengthSkill[];
}): ArtsStrengthGenerationReport {
  return {
    version: 1,
    note: 'template.skills 是服务端展开后的运行时 SkillDef；rawCandidate/normalizedTemplate 保留 AI 原始权重草稿与归一化权重，expansion.totalBudget 为服务端总预算，budgetBreakdown 记录分项权重、实际预算、返还预算和回流结果。',
    rawCandidate: params.rawCandidate,
    normalizedTemplate: params.normalizedTemplate,
    expansion: params.expandedSkills.map((entry) => ({
      skillId: entry.skill.id,
      inputBudget: entry.inputBudget,
      totalBudget: entry.totalBudget,
      targetBudget: entry.targetBudget,
      effectScale: entry.effectScale,
      structureBudgetMultiplier: entry.structureBudgetMultiplier,
      budgetBreakdown: entry.budgetBreakdown,
    })),
  };
}

function cloneJsonRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

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
import type { TechniqueCategory, TechniqueTemplate } from '@mud/shared';
import { TECHNIQUE_INTERNAL_DEFAULT_MAX_LAYER } from '@mud/shared';

import { executeAiTask, type AiTaskRequest } from '../../ai/ai-task-execution.service';
import { sanitizePlayerContext } from '../../ai/ai-prompt-sanitizer';
import type { AiTextModelConfig } from '../../ai/ai-model-config';

import {
  insertGeneratedTechnique,
  insertGenerationJob,
  updateGenerationJobToDraft,
  updateGenerationJobStatus,
  publishGeneratedTechnique,
  expireStaleGenerationJobs,
} from '../../persistence/generated-technique-persistence.service';

import { GeneratedTechniqueStoreService } from './generated-technique-store.service';
import { validateTechniqueCandidate } from './technique-candidate-validator';
import { buildTechniquePrompt, buildRetryPrompt } from './technique-prompt-builder';
import { normalizeArtsSkills } from './technique-budget-normalizer';
import { rollTechniqueRealmLv, rollTechniqueGrade } from './technique-generation-roll';
import {
  TECHNIQUE_GENERATION_UNLOCK_REALM_LV,
  TECHNIQUE_GENERATION_DRAFT_EXPIRE_HOURS,
  TECHNIQUE_GENERATION_ITEM_ID,
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

  initialize(params: {
    pool: Pool;
    generatedStore: GeneratedTechniqueStoreService;
    modelConfigResolver: () => Promise<AiTextModelConfig | null>;
  }): void {
    this.pool = params.pool;
    this.generatedStore = params.generatedStore;
    this.modelConfigResolver = params.modelConfigResolver;
  }

  /** 发起生成 */
  async requestGeneration(params: {
    playerId: number;
    playerRealmLv: number;
    category: TechniqueCategory;
    playerContext?: string;
    consumeItem: () => Promise<boolean>;
  }): Promise<GenerationJobResult> {
    // 1. 境界校验
    if (params.playerRealmLv < TECHNIQUE_GENERATION_UNLOCK_REALM_LV) {
      return { success: false, error: '需筑基期方可领悟', errorCode: 'REALM_LOCKED' };
    }

    // 2. category 限制
    if (params.category !== 'internal' && params.category !== 'arts') {
      return { success: false, error: '当前仅开放内功和术法', errorCode: 'CATEGORY_LOCKED' };
    }

    // 3. 消耗悟道玉简
    const consumed = await params.consumeItem();
    if (!consumed) {
      return { success: false, error: '悟道玉简不足', errorCode: 'ITEM_NOT_ENOUGH' };
    }

    // 4. 随机 realmLv + 品阶
    const rolledRealmLv = rollTechniqueRealmLv(params.playerRealmLv);
    const rolledGrade = rollTechniqueGrade(rolledRealmLv);

    // 5. 创建 job
    const jobId = randomUUID();
    const sanitizedContext = sanitizePlayerContext(params.playerContext);

    await insertGenerationJob(this.pool!, {
      id: jobId,
      playerId: params.playerId,
      requestedCategory: params.category,
      rolledGrade,
      rolledRealmLv,
      playerContext: sanitizedContext,
    });

    // 6. 异步触发执行
    setImmediate(() => {
      this.executeGeneration(jobId, {
        category: params.category,
        grade: rolledGrade,
        realmLv: rolledRealmLv,
        playerContext: sanitizedContext,
        playerId: params.playerId,
      }).catch(() => undefined);
    });

    return { success: true, jobId, rolledGrade, rolledRealmLv };
  }

  /** 执行生成（异步） */
  async executeGeneration(jobId: string, params: {
    category: TechniqueCategory;
    grade: string;
    realmLv: number;
    playerContext: string;
    playerId: number;
  }): Promise<GenerationExecutionResult> {
    const pool = this.pool!;

    // 获取模型配置
    const modelConfig = await this.modelConfigResolver?.();
    if (!modelConfig) {
      await updateGenerationJobStatus(pool, jobId, 'failed', 'NO_MODEL', 'AI 模型未配置');
      return { success: false, error: 'AI 模型未配置' };
    }

    const maxLayer = TECHNIQUE_INTERNAL_DEFAULT_MAX_LAYER;
    const prompt = buildTechniquePrompt({
      category: params.category as TechniqueCategory,
      grade: params.grade as any,
      realmLv: params.realmLv,
      maxLayer,
      playerContext: params.playerContext,
    });

    // AI 调用
    const taskRequest: AiTaskRequest = {
      taskType: 'technique_generation',
      modelConfig,
      systemMessage: prompt.systemMessage,
      userMessage: prompt.userMessage,
      responseFormat: 'json_object',
      temperature: 0.9,
      timeoutMs: 60_000,
      maxAttempts: 2,
    };

    const aiResult = await executeAiTask(taskRequest);
    if (!aiResult.success) {
      await updateGenerationJobStatus(pool, jobId, 'failed', 'AI_FAILED', aiResult.error);
      return { success: false, error: aiResult.error };
    }

    // 解析 JSON
    let candidate: Record<string, unknown>;
    try {
      candidate = JSON.parse(aiResult.content);
    } catch {
      // 重试一次
      const retryPrompt = buildRetryPrompt(prompt, 'JSON 解析失败，请输出合法 JSON');
      const retryResult = await executeAiTask({ ...taskRequest, userMessage: retryPrompt.userMessage });
      if (!retryResult.success) {
        await updateGenerationJobStatus(pool, jobId, 'failed', 'PARSE_FAILED', '生成内容无法解析');
        return { success: false, error: '生成内容无法解析' };
      }
      try {
        candidate = JSON.parse(retryResult.content);
      } catch {
        await updateGenerationJobStatus(pool, jobId, 'failed', 'PARSE_FAILED', '重试后仍无法解析');
        return { success: false, error: '重试后仍无法解析' };
      }
    }

    // 校验
    const validation = validateTechniqueCandidate(candidate, params.category as TechniqueCategory);
    if (!validation.valid) {
      const reason = validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ');
      await updateGenerationJobStatus(pool, jobId, 'failed', 'VALIDATION_FAILED', reason);
      return { success: false, error: reason };
    }

    // 术法归一化
    if (params.category === 'arts' && Array.isArray(candidate.skills)) {
      candidate.skills = normalizeArtsSkills({
        skills: candidate.skills as Array<Record<string, unknown>>,
        grade: params.grade as any,
        realmLv: params.realmLv,
        maxLayer,
      });
    }

    // 补全字段
    const techniqueId = `gen_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const template: TechniqueTemplate = {
      id: techniqueId,
      name: String(candidate.name ?? '无名功法'),
      desc: typeof candidate.desc === 'string' ? candidate.desc : undefined,
      grade: params.grade as any,
      category: params.category,
      realmLv: params.realmLv,
      attrRatio: params.category === 'internal' ? candidate.attrRatio as any : undefined,
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
      modelName: aiResult.modelName,
      promptSnapshot: aiResult.requestSnapshot,
      validationReport: { valid: true, errors: [] },
      grade: params.grade,
      category: params.category,
      realmLv: params.realmLv,
    });

    await updateGenerationJobToDraft(pool, {
      id: jobId,
      draftTechniqueId: techniqueId,
      modelName: aiResult.modelName,
      attemptCount: aiResult.attemptCount,
      draftExpireHours: TECHNIQUE_GENERATION_DRAFT_EXPIRE_HOURS,
    });

    return { success: true, techniqueId };
  }

  /** 采纳草稿 → 直接学习 */
  async adoptDraft(params: {
    playerId: number;
    jobId: string;
    customName: string;
  }): Promise<AdoptResult> {
    const pool = this.pool!;

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
  async discardDraft(playerId: number, jobId: string): Promise<{ success: boolean; error?: string }> {
    const pool = this.pool!;
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
}

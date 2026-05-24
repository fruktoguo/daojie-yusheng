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
  TECHNIQUE_INTERNAL_DEFAULT_MAX_LAYER,
  calcTechniqueAttrValues,
  expandTechniqueAttrRatio,
  normalizeTechniqueAttrRatio,
  shouldExpandTechniqueAttrRatio,
} from '@mud/shared';

import { executeAiTask, type AiTaskRequest } from '../../ai/ai-task-execution.service';
import { sanitizePlayerContext } from '../../ai/ai-prompt-sanitizer';
import type { AiTextModelConfig } from '../../ai/ai-model-config';

import {
  insertGeneratedTechnique,
  insertGenerationJob,
  loadRecoverableGenerationJobs,
  markGenerationJobItemConsumed,
  markGenerationJobRunning,
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

  isReady(): boolean {
    return this.pool !== null && this.generatedStore !== null && this.modelConfigResolver !== null;
  }

  /** 发起生成 */
  async requestGeneration(params: {
    playerId: string;
    playerRealmLv: number;
    category: TechniqueCategory;
    playerContext?: string;
    consumeItem: () => Promise<boolean>;
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

    // 3. 随机 realmLv + 品阶
    const rolledRealmLv = rollTechniqueRealmLv(params.playerRealmLv);
    const rolledGrade = rollTechniqueGrade(rolledRealmLv);

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
    });

    // 5. 消耗悟道玉简
    const consumed = await params.consumeItem();
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
    playerId: string;
  }): Promise<GenerationExecutionResult> {
    const pool = this.pool;
    if (!pool) {
      return { success: false, error: '功法领悟系统未就绪' };
    }
    await markGenerationJobRunning(pool, jobId);

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

    // 补全字段
    const techniqueId = `gen_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    // 术法归一化：把 AI 草稿技能收敛成正式 SkillDef 形态，避免恢复时被模板注册表过滤。
    if (params.category === 'arts' && Array.isArray(candidate.skills)) {
      candidate.skills = normalizeArtsSkills({
        skills: normalizeGeneratedArtsSkillTemplates(candidate.skills as Array<Record<string, unknown>>, techniqueId),
        grade: params.grade as any,
        realmLv: params.realmLv,
        maxLayer,
      });
    }

    const template: TechniqueTemplate = {
      id: techniqueId,
      name: String(candidate.name ?? '无名功法'),
      desc: typeof candidate.desc === 'string' ? candidate.desc : undefined,
      grade: params.grade as any,
      category: params.category,
      realmLv: params.realmLv,
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
    const jobs = await loadRecoverableGenerationJobs(pool, limit);
    for (const job of jobs) {
      setImmediate(() => {
        this.executeGeneration(job.id, {
          category: job.category as TechniqueCategory,
          grade: job.grade,
          realmLv: job.realmLv,
          playerContext: job.playerContext,
          playerId: job.playerId,
        }).catch(() => undefined);
      });
    }
    return jobs.length;
  }
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

function normalizeGeneratedArtsSkillTemplates(
  skills: Array<Record<string, unknown>>,
  techniqueId: string,
): Array<Record<string, unknown>> {
  return skills.map((skill, index) => normalizeGeneratedArtsSkillTemplate(skill, techniqueId, index));
}

function normalizeGeneratedArtsSkillTemplate(
  skill: Record<string, unknown>,
  techniqueId: string,
  index: number,
): Record<string, unknown> {
  const name = typeof skill.name === 'string' && skill.name.trim()
    ? skill.name.trim()
    : `术法${index + 1}`;
  const fallbackId = `${techniqueId}_skill_${index + 1}`;
  const id = typeof skill.id === 'string' && skill.id.trim()
    ? normalizeGeneratedSkillId(skill.id, fallbackId)
    : fallbackId;
  const costMultiplier = Number.isFinite(Number(skill.costMultiplier))
    ? Math.max(0, Number(skill.costMultiplier))
    : Number.isFinite(Number(skill.cost))
      ? Math.max(0, Number(skill.cost))
      : 1;
  const range = Number.isFinite(Number(skill.range))
    ? Math.max(1, Math.trunc(Number(skill.range)))
    : Math.max(1, Math.trunc(Number((skill.targeting as Record<string, unknown> | undefined)?.range ?? 1)));
  const cooldown = Number.isFinite(Number(skill.cooldown)) ? Math.max(0, Math.trunc(Number(skill.cooldown))) : 0;
  return {
    ...skill,
    id,
    name,
    desc: typeof skill.desc === 'string' ? skill.desc : '',
    cooldown,
    costMultiplier,
    range,
    targeting: normalizeGeneratedSkillTargeting(skill.targeting, range),
    effects: normalizeGeneratedSkillEffects(skill.effects, id, name),
    unlockLevel: Number.isFinite(Number(skill.unlockLevel))
      ? Math.max(1, Math.trunc(Number(skill.unlockLevel)))
      : 1,
  };
}

function normalizeGeneratedSkillId(raw: string, fallback: string): string {
  const normalized = raw.trim().replace(/[^A-Za-z0-9:_-]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

function normalizeGeneratedSkillTargeting(raw: unknown, fallbackRange: number): Record<string, unknown> {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const shape = source.shape === 'line' || source.shape === 'area' || source.shape === 'single'
    ? source.shape
    : 'single';
  const range = Number.isFinite(Number(source.range))
    ? Math.max(1, Math.trunc(Number(source.range)))
    : fallbackRange;
  return { ...source, shape, range };
}

function normalizeGeneratedSkillEffects(raw: unknown, skillId: string, skillName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry, index) => normalizeGeneratedSkillEffect(entry as Record<string, unknown>, skillId, skillName, index));
}

function normalizeGeneratedSkillEffect(
  effect: Record<string, unknown>,
  skillId: string,
  skillName: string,
  index: number,
): Record<string, unknown> {
  if (effect.type === 'damage' || effect.type === 'heal') {
    return {
      ...effect,
      target: effect.type === 'heal' ? normalizeGeneratedEffectTarget(effect.target, 'self') : effect.target,
      formula: normalizeGeneratedSkillFormula(effect.formula ?? effect.value),
    };
  }
  if (effect.type === 'buff') {
    return {
      ...effect,
      target: normalizeGeneratedEffectTarget(effect.target, 'self'),
      buffId: typeof effect.buffId === 'string' && effect.buffId.trim()
        ? normalizeGeneratedSkillId(effect.buffId, `${skillId}_buff_${index + 1}`)
        : `${skillId}_buff_${index + 1}`,
      name: typeof effect.name === 'string' && effect.name.trim() ? effect.name.trim() : skillName,
      duration: Number.isFinite(Number(effect.duration)) ? Math.max(1, Math.trunc(Number(effect.duration))) : 3,
    };
  }
  return { ...effect };
}

function normalizeGeneratedEffectTarget(raw: unknown, fallback: 'self' | 'target' | 'allies'): 'self' | 'target' | 'allies' {
  return raw === 'self' || raw === 'target' || raw === 'allies' ? raw : fallback;
}

function normalizeGeneratedSkillFormula(raw: unknown): unknown {
  if (raw && typeof raw === 'object') {
    return raw;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, value) : 1;
}

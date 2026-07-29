/**
 * 本文件属于服务端 HTTP 或 GM 辅助入口，负责把运维能力接入内部服务。
 *
 * 维护时要注意鉴权、审计和后台任务边界，避免把管理操作暴露成无保护公开接口。
 */
/**
 * GM AI 生成功法查询服务。
 * 列表只返回摘要，详情按需返回原始 JSON，避免管理端一次性拉取大对象。
 */
import { createHash } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  GmCreateCustomTechniqueReq,
  GmCreateCustomTechniqueRes,
  GmCustomTechniquePreview,
  GmGeneratedTechniqueDetailRes,
  GmGeneratedTechniqueListQuery,
  GmGeneratedTechniqueListRes,
  GmPreviewCustomTechniqueReq,
  GmPreviewCustomTechniqueRes,
  GmTechniqueGenerationJobDetailRes,
  GmTechniqueGenerationJobListQuery,
  GmTechniqueGenerationJobListRes,
} from '@mud/shared';
import type { Pool } from 'pg';

import { DatabasePoolProvider } from '../../persistence/database-pool.provider';
import {
  ensureGeneratedTechniqueTables,
  getGeneratedTechniqueForGm,
  getTechniqueGenerationJobForGm,
  listGeneratedTechniquesForGm,
  listTechniqueGenerationJobsForGm,
} from '../../persistence/generated-technique-persistence.service';
import { publishGmCustomTechnique } from '../../persistence/gm-custom-technique-persistence';
import { GeneratedTechniqueStoreService } from '../../runtime/technique-generation/generated-technique-store.service';
import { buildGmCustomTechnique, normalizeCustomTechniquePublishedName } from '../../runtime/technique-generation/gm-custom-technique-builder';
import { TECHNIQUE_GENERATION_SCHEMA_VERSION } from '../../runtime/technique-generation/technique-generation-constants';

const GM_MANUAL_CREATOR_ID = 'gm_manual';
const GM_CUSTOM_TECHNIQUE_OPERATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

@Injectable()
export class NativeGmGeneratedTechniqueService {
  private schemaReady: Promise<void> | null = null;

  constructor(
    private readonly databasePoolProvider: DatabasePoolProvider,
    private readonly generatedTechniqueStoreService: GeneratedTechniqueStoreService,
  ) {}

  previewCustomTechnique(request: GmPreviewCustomTechniqueReq | null | undefined): GmPreviewCustomTechniqueRes {
    assertCustomTechniqueRequestEnvelope(request, false);
    const built = buildGmCustomTechnique(request?.technique, 'preview_gm_custom');
    if (built.ok === false) {
      throwCustomTechniqueValidationError(built.errors);
    }
    return { preview: toCustomTechniquePreview(built) };
  }

  async createCustomTechnique(request: GmCreateCustomTechniqueReq | null | undefined): Promise<GmCreateCustomTechniqueRes> {
    assertCustomTechniqueRequestEnvelope(request, true);
    const operationId = normalizeOperationId(request?.operationId);
    const creatorPlayerId = normalizeCreatorPlayerId(request?.creatorPlayerId);
    const operationHash = hashText(`gm-custom-technique:${operationId}`);
    const techniqueId = `gen_gm_${operationHash.slice(0, 32)}`;
    const generationId = `gmop_${operationHash.slice(0, 40)}`;
    const built = buildGmCustomTechnique(request?.technique, techniqueId);
    if (built.ok === false) {
      throwCustomTechniqueValidationError(built.errors);
    }

    const requestFingerprint = hashText(JSON.stringify({
      creatorPlayerId,
      technique: built.normalizedInput,
    }));
    const validationReport = {
      ...built.validationReport,
      manual: {
        version: 1,
        source: 'gm_manual',
        operationId,
        requestFingerprint,
        normalizedInput: built.normalizedInput,
      },
    };
    const pool = this.getPool();
    if (!pool) {
      throw new ServiceUnavailableException('database_unavailable');
    }
    await this.ensureSchema(pool);
    const published = await publishGmCustomTechnique(pool, {
      id: techniqueId,
      generationId,
      operationId,
      requestFingerprint,
      template: built.template,
      schemaVersion: TECHNIQUE_GENERATION_SCHEMA_VERSION,
      createdByPlayerId: creatorPlayerId,
      normalizedName: normalizeCustomTechniquePublishedName(built.template.name),
      validationReport,
    });
    if (published.ok === false) {
      if (published.errorCode === 'NAME_CONFLICT') {
        throw new ConflictException({
          code: 'CUSTOM_TECHNIQUE_NAME_CONFLICT',
          message: '已存在同名的已发布功法',
        });
      }
      throw new ConflictException({
        code: 'CUSTOM_TECHNIQUE_OPERATION_CONFLICT',
        message: 'operationId 已用于其他自定义功法请求',
      });
    }
    let preview = toCustomTechniquePreview({ ...built, validationReport });
    if (!published.created) {
      const storedTechnique = await getGeneratedTechniqueForGm(pool, published.techniqueId);
      preview = preferStoredCustomTechniquePreview(preview, storedTechnique);
    }
    await this.generatedTechniqueStoreService.refreshAfterPublish();
    return {
      techniqueId: published.techniqueId,
      created: published.created,
      preview,
    };
  }

  async listGeneratedTechniques(query: GmGeneratedTechniqueListQuery | null | undefined): Promise<GmGeneratedTechniqueListRes> {
    const pool = this.getPool();
    if (!pool) {
      return {
        techniques: [],
        page: {
          page: 1,
          pageSize: 50,
          total: 0,
          totalPages: 1,
        },
      };
    }
    await this.ensureSchema(pool);
    return listGeneratedTechniquesForGm(pool, {
      page: normalizePositiveInteger(query?.page, 1),
      pageSize: normalizePositiveInteger(query?.pageSize, 50),
      keyword: normalizeOptionalString(query?.keyword),
      category: normalizeOptionalString(query?.category),
      grade: normalizeOptionalString(query?.grade),
      realmLv: normalizeOptionalPositiveInteger(query?.realmLv),
      status: normalizeOptionalString(query?.status),
      createdByPlayerId: normalizeOptionalString(query?.createdByPlayerId),
      publishedOnly: normalizeBoolean(query?.publishedOnly),
    });
  }

  async getGeneratedTechnique(id: string): Promise<GmGeneratedTechniqueDetailRes> {
    const normalizedId = id.trim();
    if (!normalizedId) {
      throw new NotFoundException('generated_technique_not_found');
    }
    const pool = this.getPool();
    if (!pool) {
      throw new ServiceUnavailableException('database_unavailable');
    }
    await this.ensureSchema(pool);
    const technique = await getGeneratedTechniqueForGm(pool, normalizedId);
    if (!technique) {
      throw new NotFoundException('generated_technique_not_found');
    }
    return { technique };
  }

  async listGenerationJobs(query: GmTechniqueGenerationJobListQuery | null | undefined): Promise<GmTechniqueGenerationJobListRes> {
    const pool = this.getPool();
    if (!pool) {
      return {
        jobs: [],
        page: {
          page: 1,
          pageSize: 50,
          total: 0,
          totalPages: 1,
        },
      };
    }
    await this.ensureSchema(pool);
    return listTechniqueGenerationJobsForGm(pool, {
      page: normalizePositiveInteger(query?.page, 1),
      pageSize: normalizePositiveInteger(query?.pageSize, 50),
    });
  }

  async getGenerationJob(id: string): Promise<GmTechniqueGenerationJobDetailRes> {
    const normalizedId = id.trim();
    if (!normalizedId) {
      throw new NotFoundException('technique_generation_job_not_found');
    }
    const pool = this.getPool();
    if (!pool) {
      throw new ServiceUnavailableException('database_unavailable');
    }
    await this.ensureSchema(pool);
    const job = await getTechniqueGenerationJobForGm(pool, normalizedId);
    if (!job) {
      throw new NotFoundException('technique_generation_job_not_found');
    }
    return { job };
  }

  private getPool(): Pool | null {
    return this.databasePoolProvider.getPool('gm-generated-techniques');
  }

  private ensureSchema(pool: Pool): Promise<void> {
    if (!this.schemaReady) {
      this.schemaReady = ensureGeneratedTechniqueTables(pool).catch((error: unknown) => {
        this.schemaReady = null;
        throw error;
      });
    }
    return this.schemaReady;
  }
}

function toCustomTechniquePreview(
  built: {
    template: GmCustomTechniquePreview['template'];
    expandedLayers: GmCustomTechniquePreview['expandedLayers'];
    fullLevelAttrs?: GmCustomTechniquePreview['fullLevelAttrs'];
    validationReport: unknown;
  },
): GmCustomTechniquePreview {
  return {
    template: built.template,
    expandedLayers: built.expandedLayers,
    ...(built.fullLevelAttrs ? { fullLevelAttrs: built.fullLevelAttrs } : {}),
    validationReport: built.validationReport,
  };
}

export function preferStoredCustomTechniquePreview(
  preview: GmCustomTechniquePreview,
  storedTechnique: Pick<GmGeneratedTechniqueDetailRes['technique'], 'template' | 'validationReport'> | null,
): GmCustomTechniquePreview {
  if (!storedTechnique || !isTechniqueTemplateRecord(storedTechnique.template)) {
    return preview;
  }
  return {
    ...preview,
    template: storedTechnique.template,
    validationReport: storedTechnique.validationReport ?? preview.validationReport,
  };
}

function isTechniqueTemplateRecord(value: unknown): value is GmCustomTechniquePreview['template'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as { id?: unknown; name?: unknown };
  return typeof candidate.id === 'string' && typeof candidate.name === 'string';
}

function normalizeOperationId(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!GM_CUSTOM_TECHNIQUE_OPERATION_ID_PATTERN.test(normalized)) {
    throw new BadRequestException({
      code: 'INVALID_OPERATION_ID',
      message: 'operationId 必须由 1 到 64 个字母、数字、点、下划线、冒号或连字符组成',
    });
  }
  return normalized;
}

function assertCustomTechniqueRequestEnvelope(
  value: unknown,
  includeCreateFields: boolean,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException({
      code: 'INVALID_CUSTOM_TECHNIQUE_REQUEST',
      message: '请求体必须是对象',
    });
  }
  const allowed = includeCreateFields
    ? new Set(['operationId', 'creatorPlayerId', 'technique'])
    : new Set(['technique']);
  const unknownKeys = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknownKeys.length > 0) {
    throw new BadRequestException({
      code: 'INVALID_CUSTOM_TECHNIQUE_REQUEST',
      message: `请求体包含未允许字段：${unknownKeys.join(', ')}`,
    });
  }
}

function normalizeCreatorPlayerId(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return GM_MANUAL_CREATOR_ID;
  }
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > 120) {
    throw new BadRequestException({
      code: 'INVALID_CREATOR_PLAYER_ID',
      message: 'creatorPlayerId 必须是长度不超过 120 的非空字符串',
    });
  }
  return normalized;
}

function throwCustomTechniqueValidationError(errors: Array<{ field: string; message: string }>): never {
  const detail = errors.map((entry) => `${entry.field}: ${entry.message}`).join('；');
  throw new BadRequestException({
    code: 'INVALID_CUSTOM_TECHNIQUE',
    message: detail ? `自定义功法配置未通过校验：${detail}` : '自定义功法配置未通过校验',
    errors: errors.map((entry) => ({ field: entry.field, message: entry.message })),
  });
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(1, Math.trunc(numeric));
}

function normalizeOptionalPositiveInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.max(1, Math.trunc(numeric));
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeBoolean(value: unknown): boolean | undefined {
  if (value === true || value === 'true' || value === '1') {
    return true;
  }
  if (value === false || value === 'false' || value === '0') {
    return false;
  }
  return undefined;
}

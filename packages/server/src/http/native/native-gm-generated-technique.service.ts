/**
 * 本文件属于服务端 HTTP 或 GM 辅助入口，负责把运维能力接入内部服务。
 *
 * 维护时要注意鉴权、审计和后台任务边界，避免把管理操作暴露成无保护公开接口。
 */
/**
 * GM AI 生成功法查询服务。
 * 列表只返回摘要，详情按需返回原始 JSON，避免管理端一次性拉取大对象。
 */
import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type {
  GmGeneratedTechniqueDetailRes,
  GmGeneratedTechniqueListQuery,
  GmGeneratedTechniqueListRes,
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

@Injectable()
export class NativeGmGeneratedTechniqueService {
  private schemaReady: Promise<void> | null = null;

  constructor(private readonly databasePoolProvider: DatabasePoolProvider) {}

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

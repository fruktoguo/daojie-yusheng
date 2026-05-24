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
import type { GmGeneratedTechniqueDetailRes, GmGeneratedTechniqueListQuery, GmGeneratedTechniqueListRes } from '@mud/shared';
import type { Pool } from 'pg';

import { DatabasePoolProvider } from '../../persistence/database-pool.provider';
import {
  ensureGeneratedTechniqueTables,
  getGeneratedTechniqueForGm,
  listGeneratedTechniquesForGm,
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

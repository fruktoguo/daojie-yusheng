/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */

/**
 * AI 生成功法内存缓存服务。
 *
 * 职责：
 * 1. 启动期从 DB 加载已发布的生成功法模板
 * 2. 提供同步只读查询（getById / listAll）
 * 3. 发布后主动刷新缓存
 * 4. 签名比对避免无变化时全量 IO
 */

import type { Pool } from 'pg';
import type { TechniqueTemplate } from '@mud/shared';
import {
  loadGeneratedTechniqueSignature,
  loadPublishedGeneratedTechniques,
  type GeneratedTechniqueSignature,
} from '../../persistence/generated-technique-persistence.service';

export class GeneratedTechniqueStoreService {
  private cache = new Map<string, TechniqueTemplate>();
  private lastSignature: GeneratedTechniqueSignature | null = null;
  private pool: Pool | null = null;

  /** 注入数据库连接池（由外部在启动期调用） */
  initialize(pool: Pool): void {
    this.pool = pool;
  }

  /** 启动期加载 */
  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  /** 签名比对 + 按需重载 */
  async reload(): Promise<void> {
    if (!this.pool) return;

    try {
      const sig = await loadGeneratedTechniqueSignature(this.pool);
      if (this.isSignatureEqual(sig)) return;

      const rows = await loadPublishedGeneratedTechniques(this.pool);
      this.cache.clear();
      for (const row of rows) {
        if (row.id && row.template && typeof row.template === 'object') {
          this.cache.set(row.id, row.template as TechniqueTemplate);
        }
      }
      this.lastSignature = sig;
    } catch {
      // 表未初始化时静默忽略（启动期容错）
    }
  }

  /** 发布后主动刷新 */
  async refreshAfterPublish(): Promise<void> {
    this.lastSignature = null;
    await this.reload();
  }

  /** 按 ID 查找已发布的生成功法模板 */
  getById(id: string): TechniqueTemplate | undefined {
    return this.cache.get(id);
  }

  /** 列出所有已发布的生成功法模板 */
  listAll(): TechniqueTemplate[] {
    return [...this.cache.values()];
  }

  /** 当前缓存数量 */
  get size(): number {
    return this.cache.size;
  }

  private isSignatureEqual(sig: GeneratedTechniqueSignature): boolean {
    return this.lastSignature !== null
      && this.lastSignature.count === sig.count
      && this.lastSignature.maxUpdatedAt === sig.maxUpdatedAt;
  }
}

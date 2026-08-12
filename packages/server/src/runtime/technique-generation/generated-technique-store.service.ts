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
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  normalizeTechniqueAggregationMetadata,
  type TechniqueAggregationCatalogChangedView,
  type TechniqueAggregationMetadata,
  type TechniqueTemplate,
} from '@mud/shared';
import {
  insertPublishedAggregateTechnique,
  loadGeneratedTechniqueSignature,
  loadPublishedGeneratedTechniques,
  type GeneratedTechniqueSignature,
} from '../../persistence/generated-technique-persistence.service';

const GENERATED_TECHNIQUE_CATALOG_REFRESH_INTERVAL_MS = 5_000;

@Injectable()
export class GeneratedTechniqueStoreService implements OnModuleDestroy {
  private readonly logger = new Logger(GeneratedTechniqueStoreService.name);
  private cache = new Map<string, TechniqueTemplate>();
  private creatorById = new Map<string, string>();
  private aggregateMetadataById = new Map<string, TechniqueAggregationMetadata>();
  private lastSignature: GeneratedTechniqueSignature | null = null;
  private pool: Pool | null = null;
  private reloadInFlight: Promise<boolean> | null = null;
  private catalogLoaded = false;
  private catalogRefreshTimer: NodeJS.Timeout | null = null;
  private readonly aggregateCatalogChangeListeners = new Set<(
    change: TechniqueAggregationCatalogChangedView,
  ) => void>();

  /** 注入数据库连接池（由外部在启动期调用） */
  initialize(pool: Pool): void {
    this.pool = pool;
  }

  /** 启动期加载 */
  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  /** 数据库表与首次目录加载就绪后，由启动链路编排器开启跨进程目录刷新。 */
  startCatalogRefresh(): void {
    if (this.catalogRefreshTimer) return;
    this.catalogRefreshTimer = setInterval(() => {
      void this.reload();
    }, GENERATED_TECHNIQUE_CATALOG_REFRESH_INTERVAL_MS);
    this.catalogRefreshTimer.unref();
    this.logger.log(`生成功法目录刷新已启动，间隔 ${GENERATED_TECHNIQUE_CATALOG_REFRESH_INTERVAL_MS}ms`);
  }

  onModuleDestroy(): void {
    if (this.catalogRefreshTimer) {
      clearInterval(this.catalogRefreshTimer);
      this.catalogRefreshTimer = null;
    }
    this.aggregateCatalogChangeListeners.clear();
  }

  /** 签名比对 + 按需重载 */
  async reload(): Promise<void> {
    await this.reloadOnce();
  }

  /** 低频权威入口调用；数据库不可用时失败关闭，避免继续使用陈旧版本。 */
  async ensureFresh(): Promise<void> {
    if (!(await this.reloadOnce())) {
      throw new Error('generated_technique_cache_refresh_failed');
    }
  }

  private async reloadOnce(): Promise<boolean> {
    if (this.reloadInFlight) {
      return this.reloadInFlight;
    }
    const run = this.reloadFromPersistence();
    this.reloadInFlight = run;
    try {
      return await run;
    } finally {
      if (this.reloadInFlight === run) {
        this.reloadInFlight = null;
      }
    }
  }

  private async reloadFromPersistence(): Promise<boolean> {
    if (!this.pool) return false;

    try {
      const sig = await loadGeneratedTechniqueSignature(this.pool);
      if (this.isSignatureEqual(sig)) return true;

      const rows = await loadPublishedGeneratedTechniques(this.pool);
      const previousLatestRevisions = this.collectLatestAggregateRevisions(this.aggregateMetadataById);
      const nextCache = new Map<string, TechniqueTemplate>();
      const nextCreatorById = new Map<string, string>();
      const nextAggregateMetadataById = new Map<string, TechniqueAggregationMetadata>();
      for (const row of rows) {
        if (row.id && row.template && typeof row.template === 'object') {
          const template = row.template as TechniqueTemplate;
          nextCache.set(row.id, template);
          if (typeof row.created_by_player_id === 'string' && row.created_by_player_id.trim()) {
            nextCreatorById.set(row.id, row.created_by_player_id.trim());
          }
          const normalizedMetadata = resolvePersistedTechniqueAggregationMetadata(
            template,
            row.created_by_player_id,
          );
          if (normalizedMetadata) {
            nextAggregateMetadataById.set(row.id, normalizedMetadata);
          }
        }
      }
      this.cache = nextCache;
      this.creatorById = nextCreatorById;
      this.aggregateMetadataById = nextAggregateMetadataById;
      this.lastSignature = sig;
      const shouldNotify = this.catalogLoaded;
      this.catalogLoaded = true;
      if (shouldNotify) {
        this.notifyAggregateCatalogChanges(
          previousLatestRevisions,
          this.collectLatestAggregateRevisions(nextAggregateMetadataById),
        );
      }
      return true;
    } catch {
      // 表未初始化时静默忽略（启动期容错）
      return false;
    }
  }

  /** 发布后主动刷新 */
  async refreshAfterPublish(): Promise<void> {
    if (this.reloadInFlight) {
      await this.reloadInFlight;
    }
    this.lastSignature = null;
    if (!(await this.reloadOnce())) {
      throw new Error('generated_technique_cache_refresh_failed');
    }
  }

  /** 按 ID 查找已发布的生成功法模板 */
  getById(id: string): TechniqueTemplate | undefined {
    return this.cache.get(id);
  }

  getCreatorPlayerId(id: string): string | undefined {
    return this.creatorById.get(id);
  }

  getAggregateMetadata(id: string): TechniqueAggregationMetadata | undefined {
    return this.aggregateMetadataById.get(id);
  }

  listAggregateMetadata(): Array<{ techniqueId: string; metadata: TechniqueAggregationMetadata }> {
    return [...this.aggregateMetadataById.entries()]
      .map(([techniqueId, metadata]) => ({ techniqueId, metadata }))
      .sort((left, right) => left.metadata.familyId.localeCompare(right.metadata.familyId) || left.metadata.revision - right.metadata.revision);
  }

  getLatestAggregateForFamily(familyId: string): { techniqueId: string; template: TechniqueTemplate; metadata: TechniqueAggregationMetadata } | undefined {
    const candidates = this.listAggregateMetadata()
      .filter((entry) => entry.metadata.familyId === familyId)
      .sort((left, right) => right.metadata.revision - left.metadata.revision);
    const latest = candidates[0];
    if (!latest) return undefined;
    const template = this.cache.get(latest.techniqueId);
    return template ? { techniqueId: latest.techniqueId, template, metadata: latest.metadata } : undefined;
  }

  onAggregateCatalogChanged(
    listener: (change: TechniqueAggregationCatalogChangedView) => void,
  ): () => void {
    this.aggregateCatalogChangeListeners.add(listener);
    return () => this.aggregateCatalogChangeListeners.delete(listener);
  }

  async publishAggregate(params: {
    id: string;
    generationId: string;
    template: TechniqueTemplate;
    createdByPlayerId: string;
    validationReport: unknown;
  }): Promise<'inserted' | 'existing'> {
    if (!this.pool) {
      throw new Error('technique_aggregation_persistence_unavailable');
    }
    const result = await insertPublishedAggregateTechnique(this.pool, {
      id: params.id,
      generationId: params.generationId,
      template: params.template,
      schemaVersion: 1,
      createdByPlayerId: params.createdByPlayerId,
      displayName: params.template.name,
      grade: params.template.grade,
      category: params.template.category ?? 'internal',
      realmLv: params.template.realmLv,
      validationReport: params.validationReport,
    });
    await this.refreshAfterPublish();
    if (!this.cache.has(params.id)) {
      throw new Error('technique_aggregation_persistence_unavailable');
    }
    return result;
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

  private collectLatestAggregateRevisions(
    metadataById: ReadonlyMap<string, TechniqueAggregationMetadata>,
  ): Map<string, number> {
    const revisions = new Map<string, number>();
    for (const metadata of metadataById.values()) {
      const current = revisions.get(metadata.familyId) ?? 0;
      if (metadata.revision > current) revisions.set(metadata.familyId, metadata.revision);
    }
    return revisions;
  }

  private notifyAggregateCatalogChanges(
    previous: ReadonlyMap<string, number>,
    next: ReadonlyMap<string, number>,
  ): void {
    for (const [familyId, latestRevision] of next) {
      if (latestRevision <= (previous.get(familyId) ?? 0)) continue;
      const change = { familyId, latestRevision };
      for (const listener of this.aggregateCatalogChangeListeners) {
        try {
          listener(change);
        } catch (error) {
          this.logger.error(
            `统法目录变更监听失败：${familyId} v${latestRevision}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    }
  }
}

/** @internal 聚合行的数据库创建者是本卷修订者，稳定法脉初创者来自不可变模板。 */
export function resolvePersistedTechniqueAggregationMetadata(
  template: TechniqueTemplate,
  createdByPlayerId: unknown,
): TechniqueAggregationMetadata | null {
  const metadata = normalizeTechniqueAggregationMetadata(
    (template as unknown as Record<string, unknown>).aggregate,
  );
  if (!metadata) return null;
  const revisionAuthorPlayerId = typeof createdByPlayerId === 'string' && createdByPlayerId.trim()
    ? createdByPlayerId.trim()
    : metadata.revisionAuthorPlayerId;
  return {
    ...metadata,
    ...(metadata.creatorPlayerId
      ? { creatorPlayerId: metadata.creatorPlayerId }
      : revisionAuthorPlayerId ? { creatorPlayerId: revisionAuthorPlayerId } : {}),
    ...(revisionAuthorPlayerId ? { revisionAuthorPlayerId } : {}),
  };
}

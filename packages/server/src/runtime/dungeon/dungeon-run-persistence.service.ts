import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import type { DungeonRunState } from '@mud/shared';
import { DatabasePoolProvider } from '../../persistence/database-pool.provider';

const TABLE = 'dungeon_run';

/** 副本流程快照持久化；tick 只投递异步写入，不阻塞实例主循环。 */
@Injectable()
export class DungeonRunPersistenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DungeonRunPersistenceService.name);
  private pool: Pool | null = null;
  private initializationError: Error | null = null;
  /** 同一副本的快照必须按调用顺序落库，避免“战败”被较早的 active 快照覆盖。 */
  private readonly saveChains = new Map<string, Promise<void>>();
  /** 记录最近一次写入失败，避免异步 fire-and-forget 失败后仍被当作已持久化。 */
  private readonly saveErrors = new Map<string, Error>();
  private flushPromise: Promise<void> | null = null;

  constructor(@Inject(DatabasePoolProvider) private readonly provider: DatabasePoolProvider | null = null) {}

  async onModuleInit(): Promise<void> {
    this.pool = this.provider?.getPool('runtimeCritical') ?? null;
    if (!this.pool) {
      this.logger.log('副本流程快照持久化已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
      return;
    }
    try {
      await this.pool.query(`CREATE TABLE IF NOT EXISTS ${TABLE} (run_id varchar(100) PRIMARY KEY, party_id varchar(100) NOT NULL, dungeon_id varchar(120) NOT NULL, status varchar(32) NOT NULL, run_payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
      await this.pool.query(`CREATE INDEX IF NOT EXISTS dungeon_run_status_idx ON ${TABLE}(status)`);
    } catch (error) {
      this.initializationError = error instanceof Error ? error : new Error(String(error));
      this.pool = null;
      this.logger.error(`副本流程快照表初始化失败，已禁止无提示的内存回退：${this.initializationError.message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.flushAllNow();
    } catch (error) {
      this.logger.error(`副本流程快照关机刷盘失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  isEnabled(): boolean {
    return this.pool !== null && this.initializationError === null;
  }

  /** 等待进程关闭前所有已排队的副本快照写入完成。 */
  async flushAllNow(): Promise<void> {
    this.throwIfInitializationFailed();
    if (!this.pool) return;
    if (this.flushPromise) {
      return this.flushPromise;
    }
    this.flushPromise = this.drainSaveChains();
    try {
      await this.flushPromise;
    } finally {
      this.flushPromise = null;
    }
  }

  save(run: DungeonRunState): void {
    if (!this.isEnabled()) return;
    const payload = JSON.stringify(run);
    const previous = this.saveChains.get(run.runId) ?? Promise.resolve();
    this.saveErrors.delete(run.runId);
    const current = previous
      .catch(() => undefined)
      .then(async () => {
        if (!this.pool) return;
        await this.pool.query(
          `INSERT INTO ${TABLE}(run_id, party_id, dungeon_id, status, run_payload, updated_at) VALUES($1,$2,$3,$4,$5::jsonb,now()) ON CONFLICT(run_id) DO UPDATE SET party_id=EXCLUDED.party_id,dungeon_id=EXCLUDED.dungeon_id,status=EXCLUDED.status,run_payload=EXCLUDED.run_payload,updated_at=now()`,
          [run.runId, run.partyId, run.dungeonId, run.status, payload],
        );
        this.saveErrors.delete(run.runId);
      })
      .catch((error) => {
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        this.saveErrors.set(run.runId, normalizedError);
        this.logger.warn(`副本流程快照写入失败 ${run.runId}：${normalizedError.message}`);
      });
    this.saveChains.set(run.runId, current);
    void current.finally(() => {
      if (this.saveChains.get(run.runId) === current) this.saveChains.delete(run.runId);
    });
  }

  /** 等待指定副本已经排队的快照写入完成，用于启动恢复后的目录对账。 */
  async waitForSave(runId: string): Promise<void> {
    this.throwIfInitializationFailed();
    if (!this.pool) return;
    await (this.saveChains.get(runId) ?? Promise.resolve());
    const error = this.saveErrors.get(runId);
    if (error) {
      throw error;
    }
  }

  async loadRecoverableRuns(): Promise<DungeonRunState[]> {
    this.throwIfInitializationFailed();
    if (!this.pool) return [];
    try {
      const result = await this.pool.query(
        `SELECT run_payload FROM ${TABLE}
          WHERE status IN ('created','activating','active','completing')
             OR (status IN ('completed','failed') AND COALESCE(run_payload->>'destroyedAt', '') = '')
          ORDER BY updated_at ASC`,
      );
      return result.rows
        .map((row) => row?.run_payload)
        .filter((payload): payload is DungeonRunState => Boolean(payload && typeof payload.runId === 'string' && typeof payload.mapInstanceId === 'string'));
    } catch (error) {
      this.logger.error(`副本流程快照读取失败：${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /** 查询指定副本实例对应的流程状态，用于判断缺失实例是可恢复还是应当撤离。 */
  async loadRunStatusByInstanceId(instanceId: string): Promise<DungeonRunState | null> {
    const normalizedInstanceId = typeof instanceId === 'string' ? instanceId.trim() : '';
    this.throwIfInitializationFailed();
    if (!this.pool || !normalizedInstanceId) return null;
    try {
      const result = await this.pool.query(
        `SELECT run_payload FROM ${TABLE} WHERE run_payload->>'mapInstanceId' = $1 ORDER BY updated_at DESC LIMIT 1`,
        [normalizedInstanceId],
      );
      const payload = result.rows[0]?.run_payload;
      return payload && typeof payload.runId === 'string' && typeof payload.mapInstanceId === 'string'
        ? payload as DungeonRunState
        : null;
    } catch (error) {
      this.logger.warn(`副本实例状态读取失败 ${normalizedInstanceId}：${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /** 清理流程已结束但因运行态缺失未能落库销毁的副本目录记录。 */
  async reconcileTerminalCatalogInstances(): Promise<number> {
    this.throwIfInitializationFailed();
    if (!this.pool) return 0;
    try {
      const result = await this.pool.query(
        `UPDATE instance_catalog AS catalog
            SET status = 'destroyed',
                runtime_status = 'stopped',
                assigned_node_id = NULL,
                lease_token = NULL,
                lease_expire_at = NULL,
                ownership_epoch = COALESCE(catalog.ownership_epoch, 0) + 1,
                metadata_version = COALESCE(catalog.metadata_version, 0) + 1,
                destroy_at = COALESCE(catalog.destroy_at, now())
          WHERE catalog.instance_type = 'dungeon'
            AND catalog.status <> 'destroyed'
            AND NOT EXISTS (
              SELECT 1
                FROM ${TABLE} AS run
               WHERE run.run_payload->>'mapInstanceId' = catalog.instance_id
                 AND (
                   run.status IN ('created', 'activating', 'active', 'completing')
                   OR (run.status IN ('completed', 'failed') AND COALESCE(run.run_payload->>'destroyedAt', '') = '')
                 )
            )
        RETURNING catalog.instance_id`,
      );
      return result.rowCount ?? 0;
    } catch (error) {
      this.logger.error(`副本实例目录终态对账失败：${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  remove(runId: string): void {
    if (!this.isEnabled()) return;
    const previous = this.saveChains.get(runId) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(async () => {
        if (!this.pool) return;
        await this.pool.query(`DELETE FROM ${TABLE} WHERE run_id=$1`, [runId]);
        this.saveErrors.delete(runId);
      })
      .catch((error) => {
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        this.saveErrors.set(runId, normalizedError);
        this.logger.warn(`副本流程快照删除失败 ${runId}：${normalizedError.message}`);
      });
    this.saveChains.set(runId, current);
    void current.finally(() => {
      if (this.saveChains.get(runId) === current) this.saveChains.delete(runId);
    });
  }

  private async drainSaveChains(): Promise<void> {
    const failures: Error[] = [];
    for (let round = 0; round < 8 && this.saveChains.size > 0; round += 1) {
      const pending = Array.from(this.saveChains.entries());
      await Promise.all(pending.map(([, task]) => task));
    }
    if (this.saveChains.size > 0) {
      failures.push(new Error(`dungeon_run_shutdown_drain_stalled:pending=${this.saveChains.size}`));
    }
    for (const error of this.saveErrors.values()) {
      failures.push(error);
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, `dungeon_run_shutdown_flush_failed:count=${failures.length}`);
    }
  }

  private throwIfInitializationFailed(): void {
    if (this.initializationError) {
      throw new Error(`dungeon_run_persistence_unavailable:${this.initializationError.message}`);
    }
  }
}

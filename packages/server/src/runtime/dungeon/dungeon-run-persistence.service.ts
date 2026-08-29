import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import type { DungeonRunState } from '@mud/shared';
import { DatabasePoolProvider } from '../../persistence/database-pool.provider';

const TABLE = 'dungeon_run';

/** 副本流程快照持久化；tick 只投递异步写入，不阻塞实例主循环。 */
@Injectable()
export class DungeonRunPersistenceService implements OnModuleInit {
  private readonly logger = new Logger(DungeonRunPersistenceService.name);
  private pool: Pool | null = null;
  /** 同一副本的快照必须按调用顺序落库，避免“战败”被较早的 active 快照覆盖。 */
  private readonly saveChains = new Map<string, Promise<void>>();

  constructor(@Inject(DatabasePoolProvider) private readonly provider: DatabasePoolProvider | null = null) {}

  async onModuleInit(): Promise<void> {
    this.pool = this.provider?.getPool('runtimeCritical') ?? null;
    if (!this.pool) return;
    try {
      await this.pool.query(`CREATE TABLE IF NOT EXISTS ${TABLE} (run_id varchar(100) PRIMARY KEY, party_id varchar(100) NOT NULL, dungeon_id varchar(120) NOT NULL, status varchar(32) NOT NULL, run_payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
      await this.pool.query(`CREATE INDEX IF NOT EXISTS dungeon_run_status_idx ON ${TABLE}(status)`);
    } catch (error) {
      this.logger.warn(`副本流程快照表初始化失败，回退内存态：${error instanceof Error ? error.message : String(error)}`);
      this.pool = null;
    }
  }

  save(run: DungeonRunState): void {
    if (!this.pool) return;
    const payload = JSON.stringify(run);
    const previous = this.saveChains.get(run.runId) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(async () => {
        if (!this.pool) return;
        await this.pool.query(
          `INSERT INTO ${TABLE}(run_id, party_id, dungeon_id, status, run_payload, updated_at) VALUES($1,$2,$3,$4,$5::jsonb,now()) ON CONFLICT(run_id) DO UPDATE SET party_id=EXCLUDED.party_id,dungeon_id=EXCLUDED.dungeon_id,status=EXCLUDED.status,run_payload=EXCLUDED.run_payload,updated_at=now()`,
          [run.runId, run.partyId, run.dungeonId, run.status, payload],
        );
      })
      .catch((error) => {
        this.logger.warn(`副本流程快照写入失败 ${run.runId}：${error instanceof Error ? error.message : String(error)}`);
      });
    this.saveChains.set(run.runId, current);
    void current.finally(() => {
      if (this.saveChains.get(run.runId) === current) this.saveChains.delete(run.runId);
    });
  }

  /** 等待指定副本已经排队的快照写入完成，用于启动恢复后的目录对账。 */
  async waitForSave(runId: string): Promise<void> {
    await (this.saveChains.get(runId) ?? Promise.resolve());
  }

  async loadRecoverableRuns(): Promise<DungeonRunState[]> {
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
      this.logger.warn(`副本流程快照读取失败：${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /** 查询指定副本实例对应的流程状态，用于判断缺失实例是可恢复还是应当撤离。 */
  async loadRunStatusByInstanceId(instanceId: string): Promise<DungeonRunState | null> {
    const normalizedInstanceId = typeof instanceId === 'string' ? instanceId.trim() : '';
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
      this.logger.warn(`副本实例目录终态对账失败：${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }
  }

  remove(runId: string): void {
    if (!this.pool) return;
    void this.pool.query(`DELETE FROM ${TABLE} WHERE run_id=$1`, [runId]).catch((error) => this.logger.warn(`副本流程快照删除失败 ${runId}：${error instanceof Error ? error.message : String(error)}`));
  }
}

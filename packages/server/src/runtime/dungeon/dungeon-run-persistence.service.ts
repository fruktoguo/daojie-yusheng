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
    void this.pool.query(
      `INSERT INTO ${TABLE}(run_id, party_id, dungeon_id, status, run_payload, updated_at) VALUES($1,$2,$3,$4,$5::jsonb,now()) ON CONFLICT(run_id) DO UPDATE SET party_id=EXCLUDED.party_id,dungeon_id=EXCLUDED.dungeon_id,status=EXCLUDED.status,run_payload=EXCLUDED.run_payload,updated_at=now()`,
      [run.runId, run.partyId, run.dungeonId, run.status, JSON.stringify(run)],
    ).catch((error) => this.logger.warn(`副本流程快照写入失败 ${run.runId}：${error instanceof Error ? error.message : String(error)}`));
  }

  async loadRecoverableRuns(): Promise<DungeonRunState[]> {
    if (!this.pool) return [];
    try {
      const result = await this.pool.query(
        `SELECT run_payload FROM ${TABLE} WHERE status IN ('created','activating','active','completing') OR (status = 'completed' AND COALESCE(run_payload->>'destroyedAt', '') = '') ORDER BY updated_at ASC`,
      );
      return result.rows
        .map((row) => row?.run_payload)
        .filter((payload): payload is DungeonRunState => Boolean(payload && typeof payload.runId === 'string' && typeof payload.mapInstanceId === 'string'));
    } catch (error) {
      this.logger.warn(`副本流程快照读取失败：${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  remove(runId: string): void {
    if (!this.pool) return;
    void this.pool.query(`DELETE FROM ${TABLE} WHERE run_id=$1`, [runId]).catch((error) => this.logger.warn(`副本流程快照删除失败 ${runId}：${error instanceof Error ? error.message : String(error)}`));
  }
}

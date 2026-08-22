/**
 * 坊市托管仓 storage_item_id 规范化兼容转换。
 *
 * 历史版本曾存在 storage_item_id 与 slot_index 槽位规则不一致的行。
 * 转换只处理有效槽位 (slot_index >= 0) 且 ID 不符合 'market_storage:{playerId}:{slotIndex}' 的行。
 */
import { Inject, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import type { Pool } from 'pg';

import { DatabasePoolProvider } from '../../../../persistence/database-pool.provider';
import { GmAuditLogPersistenceService } from '../../../../persistence/gm-audit-log-persistence.service';
import type {
  GmCompatConversionRunOptions,
  GmCompatConversionRunResult,
  GmCompatConversionSample,
} from '../../types';

export const MARKET_STORAGE_ITEM_ID_CONVERSION_ID = 'market_storage_item_id';

const PLAYER_MARKET_STORAGE_ITEM_TABLE = 'player_market_storage_item';
const SAMPLE_LIMIT = 10;

export interface MarketStorageItemIdRepairSample {
  playerId: string;
  slotIndex: number;
  oldStorageItemId: string;
  nextStorageItemId: string;
}

export interface MarketStorageItemIdRepairStats {
  mismatchedRows: number;
  affectedPlayers: number;
  invalidSlotRows: number;
  sample: MarketStorageItemIdRepairSample[];
}

function createEmptyResult(mode: GmCompatConversionRunOptions['mode']): GmCompatConversionRunResult {
  return {
    ok: true,
    conversionId: MARKET_STORAGE_ITEM_ID_CONVERSION_ID,
    mode,
    matchedRows: 0,
    convertedRows: 0,
    skippedRows: 0,
    failedRows: 0,
    verifiedRows: 0,
    samples: [],
    errors: [],
  };
}

function buildSample(row: MarketStorageItemIdRepairSample): GmCompatConversionSample {
  return {
    id: `${row.playerId}:${row.slotIndex}`,
    name: '坊市托管仓槽位标识',
    status: 'convertible_mismatched_storage_item_id',
    before: {
      playerId: row.playerId,
      slotIndex: row.slotIndex,
      storageItemId: row.oldStorageItemId,
    },
    after: {
      storageItemId: row.nextStorageItemId,
    },
  };
}

@Injectable()
export class MarketStorageItemIdConversion {
  private readonly logger = new Logger(MarketStorageItemIdConversion.name);

  constructor(
    @Inject(DatabasePoolProvider)
    private readonly databasePoolProvider: DatabasePoolProvider,
    @Optional()
    @Inject(GmAuditLogPersistenceService)
    private readonly gmAuditLogPersistenceService: GmAuditLogPersistenceService | null = null,
  ) {}

  async run(options: GmCompatConversionRunOptions): Promise<GmCompatConversionRunResult> {
    const pool = this.databasePoolProvider.getPool('gm-compat-market-storage-item-id');
    if (!pool) {
      throw new ServiceUnavailableException('database_unavailable');
    }

    const result = createEmptyResult(options.mode);

    if (options.mode === 'dry-run') {
      const stats = await this.readStats(pool);
      result.matchedRows = stats.mismatchedRows;
      result.convertedRows = stats.mismatchedRows;
      result.skippedRows = stats.invalidSlotRows;
      result.samples = stats.sample.slice(0, SAMPLE_LIMIT).map(buildSample);
      if (stats.invalidSlotRows > 0) {
        result.errors.push(`发现 ${stats.invalidSlotRows} 条非法槽位行 (slot_index < 0)，已跳过`);
      }
      await this.recordAudit(result, options);
      return result;
    }

    const client = await pool.connect();
    let statsBefore: MarketStorageItemIdRepairStats;
    try {
      await client.query('BEGIN');
      await client.query(`LOCK TABLE ${PLAYER_MARKET_STORAGE_ITEM_TABLE} IN SHARE ROW EXCLUSIVE MODE`);
      statsBefore = await this.readStats(client);
      result.matchedRows = statsBefore.mismatchedRows;
      result.skippedRows = statsBefore.invalidSlotRows;
      result.samples = statsBefore.sample.slice(0, SAMPLE_LIMIT).map(buildSample);

      if (statsBefore.mismatchedRows > 0) {
        const updateResult = await client.query(`
          WITH candidates AS (
            SELECT
              storage_item_id AS old_storage_item_id,
              player_id,
              slot_index,
              ('market_storage:' || player_id || ':' || slot_index::text) AS next_storage_item_id
            FROM ${PLAYER_MARKET_STORAGE_ITEM_TABLE}
            WHERE slot_index >= 0
              AND storage_item_id <> ('market_storage:' || player_id || ':' || slot_index::text)
          ),
          updated AS (
            UPDATE ${PLAYER_MARKET_STORAGE_ITEM_TABLE} target
               SET storage_item_id = candidates.next_storage_item_id,
                   updated_at = now()
              FROM candidates
             WHERE target.storage_item_id = candidates.old_storage_item_id
            RETURNING
              candidates.player_id,
              candidates.slot_index,
              candidates.old_storage_item_id,
              candidates.next_storage_item_id
          )
          SELECT
            COUNT(*)::bigint AS repaired_rows,
            COUNT(DISTINCT player_id)::bigint AS repaired_players
          FROM updated
        `);
        const row = updateResult.rows[0];
        result.convertedRows = toNonNegativeInteger(row?.repaired_rows);
      }

      const statsAfter = await this.readStats(client);
      if (statsAfter.mismatchedRows > 0) {
        await client.query('ROLLBACK');
        throw new Error(`market_storage_item_id_repair_incomplete: mismatchedRows=${statsAfter.mismatchedRows}`);
      }
      await client.query('COMMIT');
      result.verifiedRows = result.convertedRows;
      result.appliedAt = new Date().toISOString();
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      result.convertedRows = 0;
      result.failedRows = result.matchedRows;
      result.errors.push(error instanceof Error ? error.message : String(error));
      this.logger.error(`坊市托管仓 storage_item_id 转换失败并已回滚：${result.errors[result.errors.length - 1]}`);
      await this.recordAudit(result, options);
      return result;
    } finally {
      client.release();
    }

    this.logger.log(
      `坊市托管仓 storage_item_id 转换完成：命中 ${result.matchedRows}，转换 ${result.convertedRows}，`
      + `跳过 ${result.skippedRows}，验证 ${result.verifiedRows}`,
    );
    await this.recordAudit(result, options);
    return result;
  }

  private async readStats(queryable: { query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> }): Promise<MarketStorageItemIdRepairStats> {
    const summary = await queryable.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE slot_index >= 0
            AND storage_item_id <> ('market_storage:' || player_id || ':' || slot_index::text)
        )::bigint AS mismatched_rows,
        COUNT(DISTINCT player_id) FILTER (
          WHERE slot_index >= 0
            AND storage_item_id <> ('market_storage:' || player_id || ':' || slot_index::text)
        )::bigint AS affected_players,
        COUNT(*) FILTER (WHERE slot_index < 0)::bigint AS invalid_slot_rows
      FROM ${PLAYER_MARKET_STORAGE_ITEM_TABLE}
    `);
    const sample = await queryable.query(`
      SELECT
        player_id,
        slot_index,
        storage_item_id,
        ('market_storage:' || player_id || ':' || slot_index::text) AS next_storage_item_id
      FROM ${PLAYER_MARKET_STORAGE_ITEM_TABLE}
      WHERE slot_index >= 0
        AND storage_item_id <> ('market_storage:' || player_id || ':' || slot_index::text)
      ORDER BY player_id ASC, slot_index ASC, storage_item_id ASC
      LIMIT $1
    `, [SAMPLE_LIMIT]);
    return {
      mismatchedRows: toNonNegativeInteger(summary.rows[0]?.mismatched_rows),
      affectedPlayers: toNonNegativeInteger(summary.rows[0]?.affected_players),
      invalidSlotRows: toNonNegativeInteger(summary.rows[0]?.invalid_slot_rows),
      sample: sample.rows.map((row) => ({
        playerId: String(row.player_id ?? ''),
        slotIndex: toInteger(row.slot_index),
        oldStorageItemId: String(row.storage_item_id ?? ''),
        nextStorageItemId: String(row.next_storage_item_id ?? ''),
      })),
    };
  }

  private async recordAudit(result: GmCompatConversionRunResult, options: GmCompatConversionRunOptions): Promise<void> {
    if (!this.gmAuditLogPersistenceService) {
      return;
    }
    try {
      await this.gmAuditLogPersistenceService.recordEntry({
        op: `gm.compat.${MARKET_STORAGE_ITEM_ID_CONVERSION_ID}.${options.mode}`,
        targetType: 'compat_conversion',
        targetId: MARKET_STORAGE_ITEM_ID_CONVERSION_ID,
        actor: options.actor ?? { tokenRev: null, ip: null, userAgent: null, receivedAt: Date.now() },
        before: { mode: options.mode },
        after: {
          matchedRows: result.matchedRows,
          convertedRows: result.convertedRows,
          skippedRows: result.skippedRows,
          failedRows: result.failedRows,
          verifiedRows: result.verifiedRows,
        },
        delta: {
          sampleIds: result.samples.map((sample) => sample.id),
          errors: result.errors.slice(0, 20),
        },
        success: result.failedRows === 0,
        errorMessage: result.failedRows === 0 ? null : result.errors.slice(0, 3).join('; '),
      });
    } catch (error) {
      this.logger.warn(`坊市托管仓 storage_item_id 转换审计写入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function toNonNegativeInteger(value: unknown): number {
  return Math.max(0, toInteger(value));
}

function toInteger(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
}

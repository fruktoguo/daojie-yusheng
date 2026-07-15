/**
 * 恢复历史空白自创功法书：只在书名唯一命中已发布生成功法时补回功法身份。
 *
 * 该转换只通过 GM 显式执行；运行时不按名称猜测功法 ID，避免把兼容逻辑带入正常加载链路。
 */
import { Inject, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { CUSTOM_TECHNIQUE_BOOK_ITEM_ID } from '@mud/shared';
import type { Pool } from 'pg';

import { DatabasePoolProvider } from '../../../../persistence/database-pool.provider';
import { GmAuditLogPersistenceService } from '../../../../persistence/gm-audit-log-persistence.service';
import { MarketRuntimeService } from '../../../../runtime/market/market-runtime.service';
import { PlayerRuntimeService } from '../../../../runtime/player/player-runtime.service';
import type { GmCompatConversionRunOptions, GmCompatConversionRunResult } from '../../types';
import {
  asRecord,
  buildCustomTechniqueBookRecoverySample,
  createEmptyBookCandidate,
  groupValuesBy,
  normalizePositiveInteger,
  normalizeText,
  resolveCustomTechniqueBookRepairDecision,
  updateCustomTechniqueBookRepairRow,
  type CustomTechniqueBookRepair,
  type EmptyCustomTechniqueBookCandidate,
  type GeneratedTechniqueRecoveryRef,
} from './custom-technique-book-recovery';

export const RECOVER_EMPTY_CUSTOM_TECHNIQUE_BOOKS_CONVERSION_ID = 'technique_recover_empty_custom_books';

const SAMPLE_LIMIT = 8;

interface AppliedRepairBatch {
  updatedRows: number;
  repairs: CustomTechniqueBookRepair[];
}

function emptyResult(mode: GmCompatConversionRunOptions['mode']): GmCompatConversionRunResult {
  return {
    ok: true,
    conversionId: RECOVER_EMPTY_CUSTOM_TECHNIQUE_BOOKS_CONVERSION_ID,
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

@Injectable()
export class RecoverEmptyCustomTechniqueBooksConversion {
  private readonly logger = new Logger(RecoverEmptyCustomTechniqueBooksConversion.name);

  constructor(
    @Inject(DatabasePoolProvider) private readonly databasePoolProvider: DatabasePoolProvider,
    @Optional() @Inject(PlayerRuntimeService) private readonly playerRuntimeService: PlayerRuntimeService | null = null,
    @Optional() @Inject(MarketRuntimeService) private readonly marketRuntimeService: MarketRuntimeService | null = null,
    @Optional() @Inject(GmAuditLogPersistenceService) private readonly auditService: GmAuditLogPersistenceService | null = null,
  ) {}

  async run(options: GmCompatConversionRunOptions): Promise<GmCompatConversionRunResult> {
    const pool = this.databasePoolProvider.getPool('gm-compat-recover-empty-custom-technique-books');
    if (!pool) throw new ServiceUnavailableException('database_unavailable');

    const result = emptyResult(options.mode);
    const [techniques, candidates] = await Promise.all([
      this.loadPublishedTechniques(pool),
      this.loadCandidates(pool),
    ]);
    const decisions = candidates.map((candidate) => resolveCustomTechniqueBookRepairDecision(candidate, techniques));
    const repairs = decisions.flatMap((decision) => decision.repair ? [decision.repair] : []);
    result.matchedRows = decisions.length;
    result.convertedRows = repairs.length;
    result.skippedRows = decisions.length - repairs.length;
    for (const decision of decisions.slice(0, SAMPLE_LIMIT)) {
      result.samples.push(buildCustomTechniqueBookRecoverySample(decision));
    }

    if (options.mode === 'dry-run') {
      await this.recordAudit(result, options);
      return result;
    }

    result.convertedRows = 0;
    const hasMarketRepairs = repairs.some((repair) => repair.surface !== 'inventory');
    if (hasMarketRepairs && !this.marketRuntimeService) {
      const blocked = repairs.filter((repair) => repair.surface !== 'inventory');
      result.failedRows += blocked.length;
      result.errors.push('坊市运行态不可用，已跳过托管仓或订单修复');
    }
    const applicable = this.marketRuntimeService
      ? repairs
      : repairs.filter((repair) => repair.surface === 'inventory');

    const failedRowsBeforeApply = result.failedRows;
    try {
      const applied = await this.applyRepairsWithRuntimeFences(pool, applicable, result);
      result.convertedRows = applied.updatedRows;
      result.verifiedRows = await this.verifyRepairs(pool, applied.repairs);
      const unverified = Math.max(0, applied.repairs.length - result.verifiedRows);
      result.failedRows += unverified;
      if (unverified > 0) result.errors.push(`回读有 ${unverified} 行未恢复为预期功法身份`);
      result.appliedAt = new Date().toISOString();
      this.logger.log(`空白功法书恢复完成：写入 ${result.convertedRows} 行，验证 ${result.verifiedRows} 行，跳过 ${result.skippedRows} 行`);
    } catch (error) {
      const failedDuringApply = Math.max(0, result.failedRows - failedRowsBeforeApply);
      result.failedRows += Math.max(0, applicable.length - failedDuringApply);
      result.errors.push(error instanceof Error ? error.message : String(error));
      this.logger.error(`空白功法书恢复失败：${result.errors[result.errors.length - 1]}`);
    }
    await this.recordAudit(result, options);
    return result;
  }

  private async loadPublishedTechniques(pool: Pool): Promise<GeneratedTechniqueRecoveryRef[]> {
    const rows = await pool.query(`
      SELECT id, display_name, grade, realm_lv, template
        FROM generated_technique
       WHERE is_published = true
       ORDER BY id ASC
    `);
    return rows.rows.flatMap((row: Record<string, unknown>) => {
      const template = asRecord(row.template);
      const id = normalizeText(row.id);
      const name = normalizeText(row.display_name) || normalizeText(template?.name);
      if (!id || !name) return [];
      return [{
        id,
        name,
        grade: normalizeText(row.grade) || normalizeText(template?.grade),
        realmLv: normalizePositiveInteger(row.realm_lv ?? template?.realmLv) ?? 1,
        maxLayer: normalizePositiveInteger(template?.maxLayer) ?? 1,
      }];
    });
  }

  private async loadCandidates(pool: Pool): Promise<EmptyCustomTechniqueBookCandidate[]> {
    const [inventory, storage, orders] = await Promise.all([
      pool.query(`SELECT item_instance_id AS row_id, player_id AS owner_id, raw_payload, locked_by
        FROM player_inventory_item WHERE item_id = $1 AND COALESCE(raw_payload->>'learnTechniqueId', '') = ''`, [CUSTOM_TECHNIQUE_BOOK_ITEM_ID]),
      pool.query(`SELECT storage_item_id AS row_id, player_id AS owner_id, raw_payload
        FROM player_market_storage_item WHERE item_id = $1 AND COALESCE(raw_payload->>'learnTechniqueId', '') = ''`, [CUSTOM_TECHNIQUE_BOOK_ITEM_ID]),
      pool.query(`SELECT order_id AS row_id, owner_id, raw_payload
        FROM server_market_order WHERE item_id = $1 AND side = 'sell' AND status = 'open'
          AND COALESCE(raw_payload->'item'->>'learnTechniqueId', '') = ''`, [CUSTOM_TECHNIQUE_BOOK_ITEM_ID]),
    ]);
    return [
      ...inventory.rows.map((row) => createEmptyBookCandidate('inventory', row)),
      ...storage.rows.map((row) => createEmptyBookCandidate('storage', row)),
      ...orders.rows.map((row) => createEmptyBookCandidate('order', row)),
    ].filter((entry): entry is EmptyCustomTechniqueBookCandidate => Boolean(entry));
  }

  private async applyRepairsWithRuntimeFences(
    pool: Pool,
    repairs: CustomTechniqueBookRepair[],
    result: GmCompatConversionRunResult,
  ): Promise<AppliedRepairBatch> {
    const applyWithPlayerLocks = async (): Promise<AppliedRepairBatch> => {
      const snapshots = new Map<string, NonNullable<ReturnType<PlayerRuntimeService['snapshot']>>>();
      const apply = async (): Promise<AppliedRepairBatch> => {
        try {
          const safeRepairs = this.patchOnlineInventories(repairs, result, snapshots);
          return { updatedRows: await this.applyRepairs(pool, safeRepairs), repairs: safeRepairs };
        } catch (error) {
          for (const snapshot of snapshots.values()) this.playerRuntimeService?.restoreSnapshot(snapshot);
          throw error;
        }
      };
      if (!this.playerRuntimeService) return apply();
      const ownerIds = repairs
        .filter((repair) => repair.surface === 'inventory')
        .map((repair) => repair.ownerId)
        .filter(Boolean);
      return this.playerRuntimeService.runExclusiveAssetMutation(ownerIds, apply);
    };

    const marketRepairCount = repairs.filter((repair) => repair.surface !== 'inventory').length;
    if (marketRepairCount <= 0 || !this.marketRuntimeService) return applyWithPlayerLocks();
    const outcome = await this.marketRuntimeService.runExclusiveCompatibilityPersistenceReload(applyWithPlayerLocks);
    if (outcome.reloadError) {
      result.failedRows += marketRepairCount;
      result.errors.push(`数据已恢复，但坊市运行态重载失败：${outcome.reloadError}`);
    }
    return outcome.result;
  }

  private patchOnlineInventories(
    repairs: CustomTechniqueBookRepair[],
    result: GmCompatConversionRunResult,
    snapshots: Map<string, NonNullable<ReturnType<PlayerRuntimeService['snapshot']>>>,
  ): CustomTechniqueBookRepair[] {
    if (!this.playerRuntimeService) return repairs;
    const rejected = new Set<string>();
    const byOwner = groupValuesBy(repairs.filter((repair) => repair.surface === 'inventory'), (repair) => repair.ownerId);
    for (const [ownerId, ownerRepairs] of byOwner) {
      const snapshot = this.playerRuntimeService.snapshot(ownerId);
      if (!snapshot) continue;
      snapshots.set(ownerId, snapshot);
      const nextItems = snapshot.inventory.items.map((item) => ({ ...item }));
      let changed = false;
      for (const repair of ownerRepairs) {
        const item = nextItems.find((entry) => normalizeText(entry.itemInstanceId) === repair.rowId);
        const currentId = normalizeText(item?.learnTechniqueId);
        const currentMaxLevel = normalizePositiveInteger(item?.learnTechniqueMaxLevel) ?? undefined;
        if (!item
          || item.itemId !== CUSTOM_TECHNIQUE_BOOK_ITEM_ID
          || (currentId && currentId !== repair.techniqueId)
          || (currentMaxLevel !== undefined && currentMaxLevel !== repair.learnTechniqueMaxLevel)) {
          rejected.add(`${repair.surface}:${repair.rowId}`);
          result.failedRows += 1;
          result.errors.push(`${ownerId}/${repair.rowId}: 在线背包条目缺失或功法身份冲突`);
          continue;
        }
        item.learnTechniqueId = repair.techniqueId;
        if (repair.learnTechniqueMaxLevel === undefined) delete item.learnTechniqueMaxLevel;
        else item.learnTechniqueMaxLevel = repair.learnTechniqueMaxLevel;
        changed = true;
      }
      if (changed) this.playerRuntimeService.replaceInventoryItems(ownerId, nextItems);
    }
    return repairs.filter((repair) => !rejected.has(`${repair.surface}:${repair.rowId}`));
  }

  private async applyRepairs(pool: Pool, repairs: CustomTechniqueBookRepair[]): Promise<number> {
    if (repairs.length <= 0) return 0;
    const client = await pool.connect();
    let updated = 0;
    try {
      await client.query('BEGIN');
      for (const repair of repairs) {
        const rowCount = await updateCustomTechniqueBookRepairRow(client, repair);
        if (rowCount !== 1) throw new Error(`空白功法书已并发变化：${repair.surface}/${repair.rowId}`);
        updated += rowCount;
      }
      await client.query('COMMIT');
      return updated;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async verifyRepairs(pool: Pool, repairs: CustomTechniqueBookRepair[]): Promise<number> {
    let verified = 0;
    for (const repair of repairs) {
      const query = repair.surface === 'inventory'
        ? `SELECT raw_payload FROM player_inventory_item WHERE item_instance_id = $1`
        : repair.surface === 'storage'
          ? `SELECT raw_payload FROM player_market_storage_item WHERE storage_item_id = $1`
          : `SELECT raw_payload FROM server_market_order WHERE order_id = $1`;
      const row = (await pool.query(query, [repair.rowId])).rows[0] as Record<string, unknown> | undefined;
      const raw = asRecord(row?.raw_payload);
      const item = repair.surface === 'order' ? asRecord(raw?.item) : raw;
      const actualMaxLevel = normalizePositiveInteger(item?.learnTechniqueMaxLevel) ?? undefined;
      if (normalizeText(item?.learnTechniqueId) === repair.techniqueId
        && actualMaxLevel === repair.learnTechniqueMaxLevel) verified += 1;
    }
    return verified;
  }

  private async recordAudit(result: GmCompatConversionRunResult, options: GmCompatConversionRunOptions): Promise<void> {
    if (!this.auditService) return;
    await this.auditService.recordEntry({
      op: `gm.compat.${RECOVER_EMPTY_CUSTOM_TECHNIQUE_BOOKS_CONVERSION_ID}.${options.mode}`,
      targetType: 'compat_conversion',
      targetId: RECOVER_EMPTY_CUSTOM_TECHNIQUE_BOOKS_CONVERSION_ID,
      actor: options.actor ?? { tokenRev: null, ip: null, userAgent: null, receivedAt: Date.now() },
      before: { mode: options.mode, itemId: CUSTOM_TECHNIQUE_BOOK_ITEM_ID },
      after: { matchedRows: result.matchedRows, convertedRows: result.convertedRows, skippedRows: result.skippedRows, failedRows: result.failedRows, verifiedRows: result.verifiedRows },
      delta: { samples: result.samples, errors: result.errors.slice(0, 20) },
      success: result.failedRows === 0,
      errorMessage: result.failedRows === 0 ? null : result.errors.slice(0, 3).join('; '),
    }).catch((error) => this.logger.warn(`恢复审计写入失败：${error instanceof Error ? error.message : String(error)}`));
  }
}

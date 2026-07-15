/**
 * 删除不可恢复的「空书」：itemId 为 book.custom_technique、已丢失 learnTechniqueId，
 * 且书名和描述也都为空的历史残留。
 *
 * 历史缺陷（market toFullItem / 邮件附件白名单剥离实例字段）会把残卷的功法身份物理抹掉，
 * 但实际旧数据仍可能保留书名和描述，可由恢复转换唯一匹配已发布功法。此入口不得删除这些可恢复资产。
 *
 * 安全边界：只删除「不持有任何冻结资产」的行。
 * - 求购单冻结了买家灵石（createBuyOrder -> consumeMarketCurrencyFromInventory），
 *   且其 item 由模板重建、天然不含 learnTechniqueId，会无差别命中空书判定，直接删除等于吞掉买家资产。
 * - 拍卖挂单可能已有出价冻结灵石（placeAuctionBid -> consumeMarketCurrencyFromInventory），
 *   直删订单行会让 refundAuctionBidReserves 永远没机会退款。
 * - 被 durable operation 锁定（locked_by）的背包行处于事务中途，删除会破坏该操作。
 * 以上三类只统计并上报，交由 GM 走正常撤单/撤拍流程处理（会自动退款），不在此处触碰。
 *
 * 只作为 GM 显式运维入口，不进入运行时加载或热路径；apply 前应先跑 dry-run 人工复核。
 */
import { Inject, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { CUSTOM_TECHNIQUE_BOOK_ITEM_ID } from '@mud/shared';
import type { Pool } from 'pg';

import { DatabasePoolProvider } from '../../../../persistence/database-pool.provider';
import { GmAuditLogPersistenceService } from '../../../../persistence/gm-audit-log-persistence.service';
import { PlayerRuntimeService } from '../../../../runtime/player/player-runtime.service';
import type {
  GmCompatConversionRunOptions,
  GmCompatConversionRunResult,
  GmCompatConversionSample,
} from '../../types';
import { hasCustomTechniqueBookRecoveryHint } from './custom-technique-book-recovery';

export const DELETE_EMPTY_CUSTOM_TECHNIQUE_BOOKS_CONVERSION_ID = 'technique_delete_empty_custom_books';

const SAMPLE_LIMIT = 5;

/** 空书判定统一口径：缺键与空串都算空书，所以用 COALESCE(...,'') = '' 而不是 IS NULL。 */
const EMPTY_AT_ROOT = `COALESCE(raw_payload->>'learnTechniqueId', '') = ''`;
/** 订单把整个 order 对象写进 raw_payload，物品在 item 子对象下，路径比背包/托管仓深一层。 */
const EMPTY_IN_ORDER_ITEM = `COALESCE(raw_payload->'item'->>'learnTechniqueId', '') = ''`;
const IS_AUCTION_LOT = `COALESCE(raw_payload->'auction'->>'mode', '') = 'auction'`;
const HAS_RECOVERY_HINT_AT_ROOT = `(
  COALESCE(BTRIM(raw_payload->>'name'), '') <> ''
  OR COALESCE(BTRIM(raw_payload->>'desc'), '') <> ''
)`;
const HAS_RECOVERY_HINT_IN_ORDER_ITEM = `(
  COALESCE(BTRIM(raw_payload->'item'->>'name'), '') <> ''
  OR COALESCE(BTRIM(raw_payload->'item'->>'desc'), '') <> ''
)`;

interface ScanTarget {
  readonly table: string;
  readonly idColumn: string;
  readonly ownerColumn: string;
  readonly predicate: string;
  readonly status: string;
}

const DELETE_TARGETS: readonly ScanTarget[] = [
  {
    table: 'player_inventory_item',
    idColumn: 'item_instance_id',
    ownerColumn: 'player_id',
    predicate: `item_id = $1 AND ${EMPTY_AT_ROOT} AND NOT (${HAS_RECOVERY_HINT_AT_ROOT}) AND locked_by IS NULL`,
    status: 'empty_book',
  },
  {
    table: 'player_market_storage_item',
    idColumn: 'storage_item_id',
    ownerColumn: 'player_id',
    predicate: `item_id = $1 AND ${EMPTY_AT_ROOT} AND NOT (${HAS_RECOVERY_HINT_AT_ROOT})`,
    status: 'empty_book',
  },
  {
    // 普通坊市卖单与传法台寄售：只托管物品本身，不冻结任何灵石，可直接连行删除。
    table: 'server_market_order',
    idColumn: 'order_id',
    ownerColumn: 'owner_id',
    predicate: `item_id = $1 AND side = 'sell' AND status = 'open' AND NOT (${IS_AUCTION_LOT})
      AND ${EMPTY_IN_ORDER_ITEM} AND NOT (${HAS_RECOVERY_HINT_IN_ORDER_ITEM})`,
    status: 'empty_book',
  },
];

const RECOVERY_REVIEW_TARGETS: readonly ScanTarget[] = [
  {
    table: 'player_inventory_item',
    idColumn: 'item_instance_id',
    ownerColumn: 'player_id',
    predicate: `item_id = $1 AND ${EMPTY_AT_ROOT} AND ${HAS_RECOVERY_HINT_AT_ROOT}`,
    status: 'recoverable_book_run_repair_first',
  },
  {
    table: 'player_market_storage_item',
    idColumn: 'storage_item_id',
    ownerColumn: 'player_id',
    predicate: `item_id = $1 AND ${EMPTY_AT_ROOT} AND ${HAS_RECOVERY_HINT_AT_ROOT}`,
    status: 'recoverable_book_run_repair_first',
  },
  {
    table: 'server_market_order',
    idColumn: 'order_id',
    ownerColumn: 'owner_id',
    predicate: `item_id = $1 AND side = 'sell' AND status = 'open'
      AND ${EMPTY_IN_ORDER_ITEM} AND ${HAS_RECOVERY_HINT_IN_ORDER_ITEM}`,
    status: 'recoverable_book_run_repair_first',
  },
];

const MANUAL_REVIEW_TARGETS: readonly ScanTarget[] = [
  {
    table: 'server_market_order',
    idColumn: 'order_id',
    ownerColumn: 'owner_id',
    predicate: `item_id = $1 AND side = 'buy' AND status = 'open'`,
    status: 'needs_manual_cancel_buy_order',
  },
  {
    table: 'server_market_order',
    idColumn: 'order_id',
    ownerColumn: 'owner_id',
    predicate: `item_id = $1 AND side = 'sell' AND status = 'open' AND ${IS_AUCTION_LOT}
      AND ${EMPTY_IN_ORDER_ITEM} AND NOT (${HAS_RECOVERY_HINT_IN_ORDER_ITEM})`,
    status: 'needs_manual_cancel_auction_lot',
  },
  {
    table: 'player_inventory_item',
    idColumn: 'item_instance_id',
    ownerColumn: 'player_id',
    predicate: `item_id = $1 AND ${EMPTY_AT_ROOT} AND NOT (${HAS_RECOVERY_HINT_AT_ROOT}) AND locked_by IS NOT NULL`,
    status: 'needs_manual_unlock',
  },
];

function createEmptyResult(mode: GmCompatConversionRunOptions['mode']): GmCompatConversionRunResult {
  return {
    ok: true,
    conversionId: DELETE_EMPTY_CUSTOM_TECHNIQUE_BOOKS_CONVERSION_ID,
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

function buildSample(target: ScanTarget, row: { id: string; owner_id: string }): GmCompatConversionSample {
  const deleted = target.status === 'empty_book';
  return {
    id: `${target.table}:${row.id}`,
    name: CUSTOM_TECHNIQUE_BOOK_ITEM_ID,
    status: target.status,
    before: { table: target.table, ownerId: row.owner_id, learnTechniqueId: null },
    after: { table: target.table, deleted },
  };
}

@Injectable()
export class DeleteEmptyCustomTechniqueBooksConversion {
  private readonly logger = new Logger(DeleteEmptyCustomTechniqueBooksConversion.name);

  constructor(
    @Inject(DatabasePoolProvider)
    private readonly databasePoolProvider: DatabasePoolProvider,
    @Optional()
    @Inject(PlayerRuntimeService)
    private readonly playerRuntimeService: PlayerRuntimeService | null = null,
    @Optional()
    @Inject(GmAuditLogPersistenceService)
    private readonly gmAuditLogPersistenceService: GmAuditLogPersistenceService | null = null,
  ) {}

  async run(options: GmCompatConversionRunOptions): Promise<GmCompatConversionRunResult> {
    const pool = this.databasePoolProvider.getPool('gm-compat-delete-empty-custom-technique-books');
    if (!pool) {
      throw new ServiceUnavailableException('database_unavailable');
    }
    const result = createEmptyResult(options.mode);

    result.matchedRows = await this.collectRows(pool, DELETE_TARGETS, result);
    const recoverableRows = await this.collectRows(pool, RECOVERY_REVIEW_TARGETS, result);
    const manualReviewRows = await this.collectRows(pool, MANUAL_REVIEW_TARGETS, result);
    result.skippedRows = recoverableRows + manualReviewRows;
    if (recoverableRows > 0) {
      result.errors.push(`${recoverableRows} 行仍有书名或描述线索，已保护跳过；请先执行空白功法书恢复转换`);
    }
    if (manualReviewRows > 0) {
      result.errors.push(`${manualReviewRows} 行持有冻结资产或处于锁定态，已跳过；请走撤单/撤拍流程退款后重跑`);
    }

    if (options.mode === 'dry-run') {
      // 与其他兼容转换保持同一语义：convertedRows 表示「将要处理的行数」，
      // GM 面板据此判断是否 noop（preview.convertedRows <= 0 直接提示无需转换）。
      result.convertedRows = result.matchedRows;
      await this.recordAudit(result, options);
      return result;
    }

    // 顺序不可颠倒：先清在线玩家内存，再删库。
    // 反过来的话在线玩家下线 flush 会把内存里的空书重新写回，删除结果被覆盖。
    const runtimeRemoved = this.removeOnlinePlayerEmptyBooks(result);

    const client = await pool.connect();
    let deletedRows = 0;
    try {
      await client.query('BEGIN');
      for (const target of DELETE_TARGETS) {
        // DELETE ... WHERE 天然幂等：重复执行只会删到 0 行。
        const deleted = await client.query(
          `DELETE FROM ${target.table} WHERE ${target.predicate}`,
          [CUSTOM_TECHNIQUE_BOOK_ITEM_ID],
        );
        deletedRows += deleted.rowCount ?? 0;
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      result.failedRows = result.matchedRows;
      result.errors.push(error instanceof Error ? error.message : String(error));
      this.logger.error(`空书清理失败并已回滚：${result.errors[result.errors.length - 1]}`);
      await this.recordAudit(result, options);
      return result;
    } finally {
      client.release();
    }

    result.convertedRows = deletedRows;
    result.verifiedRows = await this.countRemaining(pool);
    if (result.verifiedRows > 0) {
      result.failedRows = result.verifiedRows;
      result.errors.push(`回读仍有 ${result.verifiedRows} 行空书未清除`);
    }
    result.appliedAt = new Date().toISOString();
    this.logger.log(
      `空书清理完成：删除 ${deletedRows} 行，在线内存移除 ${runtimeRemoved} 摞，`
      + `跳过 ${result.skippedRows} 行，回读残留 ${result.verifiedRows} 行`,
    );
    await this.recordAudit(result, options);
    return result;
  }

  /** 扫描一组目标，累计命中行数并按上限补充样本。 */
  private async collectRows(pool: Pool, targets: readonly ScanTarget[], result: GmCompatConversionRunResult): Promise<number> {
    let total = 0;
    for (const target of targets) {
      const rows = await pool.query(
        `SELECT ${target.idColumn} AS id, ${target.ownerColumn} AS owner_id
           FROM ${target.table}
          WHERE ${target.predicate}
          ORDER BY ${target.idColumn} ASC`,
        [CUSTOM_TECHNIQUE_BOOK_ITEM_ID],
      );
      total += rows.rowCount ?? 0;
      for (const row of rows.rows as Array<{ id: string; owner_id: string }>) {
        if (result.samples.length >= SAMPLE_LIMIT) {
          break;
        }
        result.samples.push(buildSample(target, row));
      }
    }
    return total;
  }

  /** 在线玩家的空书同时存在于内存快照里，必须先移除，否则下线 flush 会写回。 */
  private removeOnlinePlayerEmptyBooks(result: GmCompatConversionRunResult): number {
    if (!this.playerRuntimeService) {
      return 0;
    }
    let removed = 0;
    for (const online of this.playerRuntimeService.listPlayerSnapshots()) {
      const playerId = String(online?.playerId ?? '').trim();
      if (!playerId) {
        continue;
      }
      const items = this.playerRuntimeService.snapshot(playerId)?.inventory?.items ?? [];
      for (const item of items) {
        const techId = typeof item?.learnTechniqueId === 'string' ? item.learnTechniqueId.trim() : '';
        const instanceId = typeof item?.itemInstanceId === 'string' ? item.itemInstanceId.trim() : '';
        if (item?.itemId !== CUSTOM_TECHNIQUE_BOOK_ITEM_ID
          || techId
          || !instanceId
          || hasCustomTechniqueBookRecoveryHint(item)) {
          continue;
        }
        const count = Math.max(1, Math.trunc(Number(item.count) || 1));
        try {
          this.playerRuntimeService.consumeInventoryItemByInstanceId(playerId, instanceId, count);
          removed += 1;
        } catch (error) {
          result.errors.push(`${playerId}/${instanceId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    return removed;
  }

  /** apply 后回读校验：可删目标必须清零（人工复核目标不计入）。 */
  private async countRemaining(pool: Pool): Promise<number> {
    let remaining = 0;
    for (const target of DELETE_TARGETS) {
      const rows = await pool.query(
        `SELECT COUNT(*)::int AS total FROM ${target.table} WHERE ${target.predicate}`,
        [CUSTOM_TECHNIQUE_BOOK_ITEM_ID],
      );
      remaining += Number((rows.rows[0] as { total?: number } | undefined)?.total ?? 0);
    }
    return remaining;
  }

  private async recordAudit(result: GmCompatConversionRunResult, options: GmCompatConversionRunOptions): Promise<void> {
    if (!this.gmAuditLogPersistenceService) {
      return;
    }
    try {
      await this.gmAuditLogPersistenceService.recordEntry({
        op: `gm.compat.${DELETE_EMPTY_CUSTOM_TECHNIQUE_BOOKS_CONVERSION_ID}.${options.mode}`,
        targetType: 'compat_conversion',
        targetId: DELETE_EMPTY_CUSTOM_TECHNIQUE_BOOKS_CONVERSION_ID,
        actor: options.actor ?? { tokenRev: null, ip: null, userAgent: null, receivedAt: Date.now() },
        before: { mode: options.mode, itemId: CUSTOM_TECHNIQUE_BOOK_ITEM_ID },
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
      this.logger.warn(`空书清理审计写入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

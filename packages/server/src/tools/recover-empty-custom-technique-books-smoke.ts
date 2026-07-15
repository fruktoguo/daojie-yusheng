import assert from 'node:assert/strict';

import { CUSTOM_TECHNIQUE_BOOK_ITEM_ID } from '@mud/shared';

import { DeleteEmptyCustomTechniqueBooksConversion } from '../gm/compat-conversions/conversions/technique/delete-empty-custom-technique-books';
import { RecoverEmptyCustomTechniqueBooksConversion } from '../gm/compat-conversions/conversions/technique/recover-empty-custom-technique-books';

type StoredRow = {
  rowId: string;
  ownerId: string;
  rawPayload: Record<string, unknown>;
  lockedBy?: string | null;
};

type RuntimeItem = Record<string, unknown> & { itemInstanceId: string };

function book(name: string, desc: string, grade = 'xuan', level = 3): Record<string, unknown> {
  return { itemId: CUSTOM_TECHNIQUE_BOOK_ITEM_ID, count: 1, name, desc, grade, level };
}

class FakePool {
  readonly techniques = [
    { id: 'gen_full', display_name: '霸天罡劲诀', grade: 'xuan', realm_lv: 3, template: { maxLayer: 9 } },
    { id: 'gen_fragment', display_name: '天一诀', grade: 'huang', realm_lv: 1, template: { maxLayer: 10 } },
    { id: 'gen_locked', display_name: '锁灵诀', grade: 'xuan', realm_lv: 3, template: { maxLayer: 9 } },
    { id: 'gen_dup_a', display_name: '重名诀', grade: 'xuan', realm_lv: 3, template: { maxLayer: 9 } },
    { id: 'gen_dup_b', display_name: '重名诀', grade: 'xuan', realm_lv: 3, template: { maxLayer: 9 } },
  ];
  inventory: StoredRow[] = [
    { rowId: 'inv_full', ownerId: 'player_offline', rawPayload: book('霸天罡劲诀', '完整记载霸天罡劲诀。') },
    { rowId: 'inv_fragment', ownerId: 'player_online', rawPayload: book('《天一诀》残卷', '记载天一诀前 8 层的残卷。', 'huang', 1) },
    { rowId: 'inv_ambiguous', ownerId: 'player_ambiguous', rawPayload: book('《重名诀》', '完整记载重名诀。') },
    { rowId: 'inv_locked', ownerId: 'player_locked', rawPayload: book('《锁灵诀》', '完整记载锁灵诀。'), lockedBy: 'operation:1' },
  ];
  storage: StoredRow[] = [
    { rowId: 'storage_full', ownerId: 'player_storage', rawPayload: book('《霸天罡劲诀》', '完整记载霸天罡劲诀。') },
  ];
  orders: StoredRow[] = [
    {
      rowId: 'order_fragment',
      ownerId: 'player_seller',
      rawPayload: { item: book('《天一诀》残卷', '记载天一诀前 8 层的残卷。', 'huang', 1), listingMode: null },
    },
  ];
  private transactionBackup: { inventory: StoredRow[]; storage: StoredRow[]; orders: StoredRow[] } | null = null;

  async query(sql: string, params: unknown[] = []): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number }> {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized.includes('FROM generated_technique')) return this.result(this.techniques);
    if (normalized.startsWith('SELECT item_instance_id AS row_id')) {
      return this.result(this.inventory.filter((row) => this.isEmpty(row.rawPayload)).map((row) => ({
        row_id: row.rowId, owner_id: row.ownerId, raw_payload: row.rawPayload, locked_by: row.lockedBy ?? null,
      })));
    }
    if (normalized.startsWith('SELECT storage_item_id AS row_id')) {
      return this.result(this.storage.filter((row) => this.isEmpty(row.rawPayload)).map((row) => ({
        row_id: row.rowId, owner_id: row.ownerId, raw_payload: row.rawPayload,
      })));
    }
    if (normalized.startsWith('SELECT order_id AS row_id')) {
      return this.result(this.orders.filter((row) => this.isEmpty(this.orderItem(row))).map((row) => ({
        row_id: row.rowId, owner_id: row.ownerId, raw_payload: row.rawPayload,
      })));
    }
    if (normalized.startsWith('SELECT raw_payload FROM player_inventory_item')) {
      return this.rawPayloadResult(this.inventory, String(params[0] ?? ''));
    }
    if (normalized.startsWith('SELECT raw_payload FROM player_market_storage_item')) {
      return this.rawPayloadResult(this.storage, String(params[0] ?? ''));
    }
    if (normalized.startsWith('SELECT raw_payload FROM server_market_order')) {
      return this.rawPayloadResult(this.orders, String(params[0] ?? ''));
    }
    throw new Error(`unexpected_query:${normalized}`);
  }

  async connect(): Promise<{
    query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount: number }>;
    release: () => void;
  }> {
    return { query: (sql, params = []) => this.clientQuery(sql, params), release: () => undefined };
  }

  private async clientQuery(sql: string, params: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number }> {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized === 'BEGIN') {
      this.transactionBackup = structuredClone({ inventory: this.inventory, storage: this.storage, orders: this.orders });
      return this.result([]);
    }
    if (normalized === 'COMMIT') {
      this.transactionBackup = null;
      return this.result([]);
    }
    if (normalized === 'ROLLBACK') {
      if (this.transactionBackup) {
        this.inventory = this.transactionBackup.inventory;
        this.storage = this.transactionBackup.storage;
        this.orders = this.transactionBackup.orders;
      }
      this.transactionBackup = null;
      return this.result([]);
    }
    const payload = JSON.parse(String(params[1] ?? '{}')) as Record<string, unknown>;
    const expected = JSON.parse(String(params[3] ?? '{}')) as Record<string, unknown>;
    assert.equal(params[2], CUSTOM_TECHNIQUE_BOOK_ITEM_ID);
    if (normalized.startsWith('UPDATE player_inventory_item')) return this.update(this.inventory, String(params[0] ?? ''), payload, expected, false);
    if (normalized.startsWith('UPDATE player_market_storage_item')) return this.update(this.storage, String(params[0] ?? ''), payload, expected, false);
    if (normalized.startsWith('UPDATE server_market_order')) return this.update(this.orders, String(params[0] ?? ''), payload, expected, true);
    throw new Error(`unexpected_client_query:${normalized}`);
  }

  private update(
    rows: StoredRow[],
    rowId: string,
    payload: Record<string, unknown>,
    expected: Record<string, unknown>,
    order: boolean,
  ) {
    const row = rows.find((entry) => entry.rowId === rowId);
    if (!row
      || JSON.stringify(row.rawPayload) !== JSON.stringify(expected)
      || !this.isEmpty(order ? this.orderItem(row) : row.rawPayload)) return this.result([]);
    row.rawPayload = payload;
    return { rows: [], rowCount: 1 };
  }

  private rawPayloadResult(rows: StoredRow[], rowId: string) {
    const row = rows.find((entry) => entry.rowId === rowId);
    return this.result(row ? [{ raw_payload: row.rawPayload }] : []);
  }

  private orderItem(row: StoredRow): Record<string, unknown> {
    return row.rawPayload.item as Record<string, unknown>;
  }

  private isEmpty(payload: Record<string, unknown>): boolean {
    return typeof payload.learnTechniqueId !== 'string' || payload.learnTechniqueId.trim() === '';
  }

  private result(rows: Array<Record<string, unknown>>) {
    return { rows, rowCount: rows.length };
  }
}

class DeleteGuardPool {
  private selectCount = 0;

  async query(sql: string): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number }> {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    assert.ok(normalized.startsWith('SELECT '), `dry-run 不应写库：${normalized}`);
    const callIndex = this.selectCount;
    this.selectCount += 1;
    if (callIndex < 3) {
      assert.ok(normalized.includes('BTRIM(') && normalized.includes('AND NOT ('), `删除目标缺少恢复线索保护：${normalized}`);
      return { rows: [], rowCount: 0 };
    }
    if (callIndex < 6) {
      assert.ok(normalized.includes('BTRIM(') && !normalized.includes('AND NOT ('), `恢复线索目标条件错误：${normalized}`);
      const row = { id: `recoverable:${callIndex}`, owner_id: `player:${callIndex}` };
      return { rows: [row], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }
}

async function main(): Promise<void> {
  const pool = new FakePool();
  const onlinePlayer = {
    playerId: 'player_online',
    inventory: {
      items: [{
        ...pool.inventory.find((row) => row.rowId === 'inv_fragment')!.rawPayload,
        itemInstanceId: 'inv_fragment',
      }] as RuntimeItem[],
    },
  };
  let playerLockRuns = 0;
  let marketReloadRuns = 0;
  const playerRuntime = {
    snapshot(playerId: string) {
      return playerId === onlinePlayer.playerId ? structuredClone(onlinePlayer) : null;
    },
    replaceInventoryItems(playerId: string, items: RuntimeItem[]) {
      assert.equal(playerId, onlinePlayer.playerId);
      onlinePlayer.inventory.items = structuredClone(items);
    },
    restoreSnapshot(snapshot: typeof onlinePlayer) {
      onlinePlayer.inventory.items = structuredClone(snapshot.inventory.items);
    },
    async runExclusiveAssetMutation(_playerIds: string[], action: () => Promise<unknown>) {
      playerLockRuns += 1;
      return action();
    },
  };
  const marketRuntime = {
    async runExclusiveCompatibilityPersistenceReload<T>(action: () => Promise<T>) {
      const result = await action();
      marketReloadRuns += 1;
      return { result, reloadError: null };
    },
  };
  const conversion = new RecoverEmptyCustomTechniqueBooksConversion(
    { getPool: () => pool } as never,
    playerRuntime as never,
    marketRuntime as never,
    null,
  );

  const preview = await conversion.run({ mode: 'dry-run' });
  assert.deepEqual(
    { matched: preview.matchedRows, converted: preview.convertedRows, skipped: preview.skippedRows, failed: preview.failedRows },
    { matched: 6, converted: 4, skipped: 2, failed: 0 },
  );
  assert.ok(preview.samples.some((sample) => sample.status === 'template_ambiguous'));
  assert.ok(preview.samples.some((sample) => sample.status === 'locked'));

  const applied = await conversion.run({ mode: 'apply' });
  assert.deepEqual(
    { converted: applied.convertedRows, verified: applied.verifiedRows, skipped: applied.skippedRows, failed: applied.failedRows },
    { converted: 4, verified: 4, skipped: 2, failed: 0 },
  );
  assert.equal(playerLockRuns, 1);
  assert.equal(marketReloadRuns, 1);
  assert.equal(pool.inventory.find((row) => row.rowId === 'inv_full')?.rawPayload.learnTechniqueId, 'gen_full');
  assert.equal('learnTechniqueMaxLevel' in pool.inventory.find((row) => row.rowId === 'inv_full')!.rawPayload, false);
  assert.equal(onlinePlayer.inventory.items[0]?.learnTechniqueId, 'gen_fragment');
  assert.equal(onlinePlayer.inventory.items[0]?.learnTechniqueMaxLevel, 8);
  assert.equal(pool.storage[0]?.rawPayload.learnTechniqueId, 'gen_full');
  const repairedOrder = pool.orders[0]?.rawPayload;
  assert.equal((repairedOrder?.item as Record<string, unknown>)?.learnTechniqueId, 'gen_fragment');
  assert.equal((repairedOrder?.item as Record<string, unknown>)?.learnTechniqueMaxLevel, 8);
  assert.equal(repairedOrder?.listingMode, 'transmission');

  const repeated = await conversion.run({ mode: 'dry-run' });
  assert.deepEqual(
    { matched: repeated.matchedRows, converted: repeated.convertedRows, skipped: repeated.skippedRows },
    { matched: 2, converted: 0, skipped: 2 },
  );

  const deleteGuard = new DeleteEmptyCustomTechniqueBooksConversion(
    { getPool: () => new DeleteGuardPool() } as never,
    null,
    null,
  );
  const deletePreview = await deleteGuard.run({ mode: 'dry-run' });
  assert.deepEqual(
    { matched: deletePreview.matchedRows, converted: deletePreview.convertedRows, skipped: deletePreview.skippedRows },
    { matched: 0, converted: 0, skipped: 3 },
  );
  console.log(JSON.stringify({ ok: true, case: 'recover-empty-custom-technique-books' }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

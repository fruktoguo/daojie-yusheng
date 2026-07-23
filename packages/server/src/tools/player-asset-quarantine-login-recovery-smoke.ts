import assert from 'node:assert/strict';

import {
  createNumericRatioDivisors,
  createNumericStats,
  DEFAULT_INVENTORY_CAPACITY,
} from '@mud/shared';

import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';

interface RuntimeInventoryIdentity {
  itemInstanceId?: unknown;
  itemId?: unknown;
}

interface RepairOptions {
  allowOfflineFenceRebase?: boolean;
  logUnresolved?: boolean;
  runtimeInventoryItems?: readonly RuntimeInventoryIdentity[];
}

class FakeFlushLedgerService {
  quarantined = true;
  repairCalls: RepairOptions[] = [];

  constructor(
    private readonly previousItemInstanceId: string,
    private readonly nextItemInstanceId: string,
    private readonly itemId: string,
  ) {}

  async isPlayerFlushAssetConflictQuarantined(): Promise<boolean> {
    return this.quarantined;
  }

  async repairPlayerFlushAssetConflictQuarantines(
    playerId: string,
    options: RepairOptions,
  ): Promise<Record<string, unknown>> {
    this.repairCalls.push(options);
    const runtimeIdentityMatches = options.runtimeInventoryItems?.some((item) => (
      item.itemInstanceId === this.previousItemInstanceId
      && item.itemId === this.itemId
    )) === true;
    if (!runtimeIdentityMatches) {
      return {
        repairedPlayers: 0,
        unresolvedPlayers: [playerId],
        repairs: [],
      };
    }
    this.quarantined = false;
    return {
      repairedPlayers: 1,
      unresolvedPlayers: [],
      repairs: [{
        playerId,
        previousItemInstanceId: this.previousItemInstanceId,
        nextItemInstanceId: this.nextItemInstanceId,
        ownerPlayerId: 'player:foreign-owner',
        itemId: this.itemId,
      }],
    };
  }
}

function createRuntime(ledger: FakeFlushLedgerService): PlayerRuntimeService {
  return new PlayerRuntimeService(
    {
      createStarterInventory() {
        return { capacity: DEFAULT_INVENTORY_CAPACITY, items: [] };
      },
      createDefaultEquipment() {
        return {};
      },
      normalizeItem(item: unknown) {
        return item;
      },
      hydrateTechniqueState(entry: unknown) {
        return entry;
      },
    } as never,
    {
      has() {
        return true;
      },
      getOrThrow() {
        return { id: 'yunlai_town', spawnX: 32, spawnY: 5 };
      },
      list() {
        return [{ id: 'yunlai_town', spawnX: 32, spawnY: 5 }];
      },
    } as never,
    {
      createInitialState() {
        return {
          stage: '炼气',
          baseAttrs: { constitution: 1, spirit: 1, perception: 1, talent: 1, strength: 1, meridians: 1 },
          finalAttrs: { constitution: 1, spirit: 1, perception: 1, talent: 1, strength: 1, meridians: 1 },
          numericStats: createNumericStats(),
          ratioDivisors: createNumericRatioDivisors(),
        };
      },
      recalculate() {
        return undefined;
      },
    } as never,
    {
      initializePlayer() {
        return undefined;
      },
      refreshPreview() {
        return undefined;
      },
    } as never,
    undefined,
    undefined,
    ledger as never,
  );
}

function createDetachedPlayer(
  runtime: PlayerRuntimeService,
  playerId: string,
  itemInstanceId: string,
  itemId: string,
) {
  const player = runtime.ensurePlayer(playerId, 'session:old');
  player.sessionId = null;
  player.offlineSinceAt = Date.now() - 1_000;
  player.inventory.items = [{
    itemId,
    itemInstanceId,
    count: 135,
    rawPayload: { itemInstanceId },
  }];
  runtime.markPersisted(playerId);
  return player;
}

async function verifyDetachedLoginRepairsRuntimeIdentity(): Promise<void> {
  const playerId = 'player:detached-repair';
  const previousItemInstanceId = '11111111-1111-4111-8111-111111111111';
  const nextItemInstanceId = '22222222-2222-4222-8222-222222222222';
  const itemId = 'pill.fivephase_harmony_pellet';
  const ledger = new FakeFlushLedgerService(previousItemInstanceId, nextItemInstanceId, itemId);
  const runtime = createRuntime(ledger);
  const player = createDetachedPlayer(runtime, playerId, previousItemInstanceId, itemId);
  const inventoryRevisionBefore = player.inventory.revision;
  const persistentRevisionBefore = player.persistentRevision;

  const loaded = await runtime.loadOrCreatePlayer(
    playerId,
    'session:new',
    async () => {
      throw new Error('existing detached runtime must not reload a stale database snapshot');
    },
  );

  assert.equal(loaded, player);
  assert.equal(player.sessionId, 'session:new');
  assert.equal(player.inventory.items[0]?.itemInstanceId, nextItemInstanceId);
  assert.equal(player.inventory.items[0]?.rawPayload?.itemInstanceId, nextItemInstanceId);
  assert.equal(player.inventory.revision, inventoryRevisionBefore + 1);
  assert(player.persistentRevision > persistentRevisionBefore);
  assert(player.dirtyDomains.has('inventory'));
  assert.equal(ledger.quarantined, false);
  assert.equal(ledger.repairCalls.length, 1);
  assert.equal(ledger.repairCalls[0]?.allowOfflineFenceRebase, true);
  assert.equal(ledger.repairCalls[0]?.logUnresolved, false);
}

async function verifyOnlineRuntimeCannotBypassQuarantine(): Promise<void> {
  const playerId = 'player:online-rejected';
  const oldId = '33333333-3333-4333-8333-333333333333';
  const nextId = '44444444-4444-4444-8444-444444444444';
  const itemId = 'pill.fivephase_harmony_pellet';
  const ledger = new FakeFlushLedgerService(oldId, nextId, itemId);
  const runtime = createRuntime(ledger);
  const player = runtime.ensurePlayer(playerId, 'session:active');
  player.inventory.items = [{ itemId, itemInstanceId: oldId, count: 1 }];

  await assert.rejects(
    () => runtime.assertPlayerAssetFlushNotQuarantined(playerId),
    /player_asset_flush_quarantined/,
  );
  assert.equal(ledger.repairCalls.length, 0);
  assert.equal(player.inventory.items[0]?.itemInstanceId, oldId);
}

async function verifyRuntimeIdentityMismatchRemainsQuarantined(): Promise<void> {
  const playerId = 'player:runtime-mismatch';
  const quarantinedId = '55555555-5555-4555-8555-555555555555';
  const runtimeId = '66666666-6666-4666-8666-666666666666';
  const nextId = '77777777-7777-4777-8777-777777777777';
  const itemId = 'pill.fivephase_harmony_pellet';
  const ledger = new FakeFlushLedgerService(quarantinedId, nextId, itemId);
  const runtime = createRuntime(ledger);
  const player = createDetachedPlayer(runtime, playerId, runtimeId, itemId);

  await assert.rejects(
    () => runtime.assertPlayerAssetFlushNotQuarantined(playerId),
    /player_asset_flush_quarantined/,
  );
  assert.equal(ledger.repairCalls.length, 1);
  assert.equal(ledger.quarantined, true);
  assert.equal(player.inventory.items[0]?.itemInstanceId, runtimeId);
}

async function main(): Promise<void> {
  await verifyDetachedLoginRepairsRuntimeIdentity();
  await verifyOnlineRuntimeCannotBypassQuarantine();
  await verifyRuntimeIdentityMismatchRemainsQuarantined();
  console.log(JSON.stringify({
    ok: true,
    answers: '离线挂机玩家登录会在资产锁内核对并同步换发冲突实例 ID；在线玩家和运行时身份不一致仍保持隔离。',
    excludes: '不替代真实 PostgreSQL 多进程竞态与正式服登录验收。',
  }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});

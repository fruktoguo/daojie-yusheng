import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { MailRuntimeService } from '../runtime/mail/mail-runtime.service';

async function main(): Promise<void> {
  const playerId = 'player:mail-wallet-attachment';
  const durableCalls: Array<Record<string, unknown>> = [];
  const runtime = new MailRuntimeService(
    {
      createItem(itemId: string, count: number) {
        return { itemId, count, name: itemId, type: 'material' };
      },
      normalizeItem(item: Record<string, unknown>) {
        return item;
      },
    } as never,
    {
      getPlayerOrThrow() {
        return {
          inventory: {
            capacity: 2,
            items: [{ itemId: 'spirit_stone', count: 10, name: '灵石', type: 'currency' }],
          },
        };
      },
      getSessionFence() {
        return { runtimeOwnerId: 'runtime:mail-wallet-attachment', sessionEpoch: 7 };
      },
      buildPersistenceSnapshot() {
        return {
          inventory: { revision: 1, items: [{ itemId: 'spirit_stone', count: 10 }] },
          wallet: {
            balances: [{ walletType: 'spirit_stone', balance: 1, frozenBalance: 0, version: 4 }],
          },
          placement: { instanceId: null },
        };
      },
    } as never,
    {} as never,
    {
      async claimMailAttachments(input: Record<string, unknown>) {
        durableCalls.push(input);
        return { ok: true, alreadyCommitted: false, unreadCount: 0, unclaimedCount: 0 };
      },
    } as never,
    {} as never,
    {} as never,
  );

  const resolution = runtime.resolveAttachmentItems([
    {
      attachments: [
        { itemId: 'rat_tail', count: 2 },
        { itemId: 'spirit_stone', count: 10 },
      ],
    },
  ] as never);

  assert.deepEqual(resolution?.inventoryItems.map((entry) => ({ itemId: entry.itemId, count: entry.count })), [
    { itemId: 'rat_tail', count: 2 },
    { itemId: 'spirit_stone', count: 10 },
  ]);
  assert.equal(resolution?.hasWalletAttachments, true);

  const nextInventoryItems = runtime.buildNextInventoryItems(playerId, resolution?.inventoryItems ?? []);
  assert.equal(Array.isArray(nextInventoryItems), true);
  await runtime.claimAttachmentsDurably(
    playerId,
    ['mail:wallet-attachment'],
    [{ mailId: 'mail:wallet-attachment' }],
    nextInventoryItems,
    true,
  );
  assert.equal(durableCalls.length, 1);
  assert.deepEqual(durableCalls[0]?.nextWalletBalances, [
    { walletType: 'spirit_stone', balance: 20, frozenBalance: 0, version: 5 },
  ]);

  const overflowRuntime = new MailRuntimeService(
    {
      normalizeItem(item: Record<string, unknown>) {
        return item;
      },
    } as never,
    {
      getPlayerOrThrow() {
        return {
          inventory: {
            capacity: 1,
            items: [{ itemId: 'spirit_stone', count: 2_147_483_647, type: 'currency' }],
          },
        };
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  assert.equal(
    overflowRuntime.buildNextInventoryItems(playerId, [{ itemId: 'spirit_stone', count: 1, type: 'currency' }]),
    undefined,
  );
  assert.equal(
    overflowRuntime.canReceiveAllAttachments(playerId, [{ itemId: 'spirit_stone', count: 1, type: 'currency' }]),
    false,
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        answers: '邮件附件中的 spirit_stone 进入背包真源，钱包投影从最终背包精确重建而不使用旧投影增量；单堆达到上限时拒绝领取。',
        excludes: '不证明 PostgreSQL durable claim 事务或客户端领取入口。',
        completionMapping: 'release:proof:mail-wallet-attachment',
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { MailRuntimeService } from '../runtime/mail/mail-runtime.service';

function main(): void {
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
        return { inventory: { capacity: 1, items: [] } };
      },
    } as never,
    {} as never,
    {} as never,
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
  assert.deepEqual(resolution?.walletCredits, [
    { walletType: 'spirit_stone', count: 10 },
  ]);

  console.log(
    JSON.stringify(
      {
        ok: true,
        answers: '邮件附件中的 spirit_stone 同时进入背包物品真源与钱包镜像计划，崩溃恢复不会只剩钱包孤立余额。',
        excludes: '不证明 PostgreSQL durable claim 事务或客户端领取入口。',
        completionMapping: 'release:proof:mail-wallet-attachment',
      },
      null,
      2,
    ),
  );
}

main();

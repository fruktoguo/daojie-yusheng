import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { MailRuntimeService } from '../runtime/mail/mail-runtime.service';

async function main(): Promise<void> {
  const playerId = 'player:mail-durable-required';
  const mailId = 'mail:durable-required';
  const receivedItems: Array<Record<string, unknown>> = [];
  const walletCredits: Array<Record<string, unknown>> = [];
  const savedMailboxes: Array<Record<string, unknown>> = [];
  const mailbox = {
    version: 1,
    revision: 1,
    welcomeMailDeliveredAt: null,
    mails: [
      {
        version: 1,
        mailVersion: 1,
        mailId,
        senderLabel: '司命台',
        templateId: null,
        args: [],
        fallbackTitle: 'durable required',
        fallbackBody: 'durable required',
        attachments: [{ itemId: 'rat_tail', count: 1 }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        expireAt: null,
        firstSeenAt: null,
        readAt: null,
        claimedAt: null,
        deletedAt: null,
      },
    ],
  };
  const runtime = new MailRuntimeService(
    {
      createItem(itemId: string, count: number) {
        return { itemId, count, name: itemId, type: 'material' };
      },
      normalizeItem(item: Record<string, unknown>) {
        return {
          ...item,
          itemId: String(item.itemId ?? ''),
          count: Math.max(1, Math.trunc(Number(item.count ?? 1))),
        };
      },
    } as never,
    {
      getPlayerOrThrow(requestedPlayerId: string) {
        assert.equal(requestedPlayerId, playerId);
        return {
          playerId,
          inventory: {
            capacity: 8,
            items: [],
          },
        };
      },
      receiveInventoryItem(_requestedPlayerId: string, item: Record<string, unknown>) {
        receivedItems.push(item);
      },
      creditWallet(_requestedPlayerId: string, walletType: string, count: number) {
        walletCredits.push({ walletType, count });
      },
      replaceInventoryItems() {
        throw new Error('replaceInventoryItems should not be called when durable is unavailable');
      },
    } as never,
    {
      async loadMailbox(requestedPlayerId: string) {
        assert.equal(requestedPlayerId, playerId);
        return mailbox;
      },
      async saveMailbox(_requestedPlayerId: string, payload: Record<string, unknown>) {
        savedMailboxes.push(payload);
      },
    } as never,
    {
      isEnabled() {
        return false;
      },
    } as never,
    null as never,
    null as never,
  );

  const result = await runtime.claimAttachments(playerId, [mailId]);
  assert.equal(result.ok, false);
  assert.equal(result.message, '邮件附件领取事务暂不可用，请稍后再试。');
  assert.equal(receivedItems.length, 0);
  assert.equal(walletCredits.length, 0);
  assert.equal(savedMailboxes.length, 0);
  assert.equal(mailbox.mails[0]?.claimedAt, null);

  console.log(
    JSON.stringify(
      {
        ok: true,
        answers: 'MailRuntimeService 在 DurableOperationService 不可用时会拒绝附件领取，不再走先发奖后持久化的非事务 fallback',
        excludes: '不证明真实 PostgreSQL claimMailAttachments 事务或客户端领取入口',
        completionMapping: 'release:proof:mail-runtime-durable-required',
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

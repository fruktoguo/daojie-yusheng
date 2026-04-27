import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { Pool } from 'pg';

import { ContentTemplateRepository } from '../content/content-template.repository';
import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DurableOperationService } from '../persistence/durable-operation.service';
import { MailPersistenceService } from '../persistence/mail-persistence.service';
import type { PersistedPlayerSnapshot } from '../persistence/player-persistence.service';
import { MailRuntimeService } from '../runtime/mail/mail-runtime.service';

const databaseUrl = resolveServerDatabaseUrl();

const PLAYER_SCOPED_TABLES = [
  'durable_operation_log',
  'outbox_event',
  'asset_audit_log',
  'player_mail_attachment',
  'player_mail',
  'player_mail_counter',
  'player_wallet',
  'player_inventory_item',
  'player_market_storage_item',
  'player_equipment_slot',
  'player_active_job',
  'player_presence',
  'player_recovery_watermark',
  'server_player_snapshot',
] as const;

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
          answers: 'with-db 下 DurableOperationService 会校验 session fencing，并驱动 MailRuntimeService 的邮件附件领取在单事务内提交 mail/wallet/inventory/snapshot/outbox/audit/watermark',
          excludes: '不证明真实世界 tick 入口、并发客户端冲突窗口、GM 备份恢复或多节点 outbox 消费',
          completionMapping: 'replace-ready:proof:with-db.durable-operation',
        },
        null,
        2,
      ),
    );
    return;
  }

  const now = Date.now();
  const playerId = `do_${now.toString(36)}`;
  const runtimePlayerId = `mr_${now.toString(36)}`;
  const marketPlayerId = `mk_${now.toString(36)}`;
  const marketBuyPlayerId = `mbuy_${now.toString(36)}`;
  const marketBuySellerId = `msell_${now.toString(36)}`;
  const marketCancelPlayerId = `mcancel_${now.toString(36)}`;
  const shopPlayerId = `shop_${now.toString(36)}`;
  const walletPlayerId = `wallet_${now.toString(36)}`;
  const equipPlayerId = `equip_${now.toString(36)}`;
  const activeJobPlayerId = `job_${now.toString(36)}`;
  const activeJobStartPlayerId = `jobstart_${now.toString(36)}`;
  const activeJobCancelPlayerId = `jobcancel_${now.toString(36)}`;
  const runtimeOwnerId = `runtime:${playerId}:7`;
  const operationId = `op:${playerId}:claim:1`;
  const marketOperationId = `op:${marketPlayerId}:storage:1`;
  const marketSellPlayerId = `msellnow_${now.toString(36)}`;
  const marketSellBuyerId = `mbuyer_${now.toString(36)}`;
  const marketSellOperationId = `op:${marketSellPlayerId}:sell-now:1`;
  const marketBuyOperationId = `op:${marketBuyPlayerId}:buy-now:1`;
  const marketCancelOperationId = `op:${marketCancelPlayerId}:cancel-order:1`;
  const shopOperationId = `op:${shopPlayerId}:npc-shop:1`;
  const walletOperationId = `op:${walletPlayerId}:wallet:1`;
  const equipOperationId = `op:${equipPlayerId}:equip:1`;
  const activeJobUpdateOperationId = `op:${activeJobPlayerId}:active-job:update:1`;
  const activeJobReplaceOperationId = `op:${activeJobPlayerId}:active-job:replace:2`;
  const activeJobStartOperationId = `op:${activeJobStartPlayerId}:active-job:start:1`;
  const activeJobCancelOperationId = `op:${activeJobCancelPlayerId}:active-job:cancel:1`;
  const activeJobCompletePlayerId = `player:durable-active-job-complete:${Date.now().toString(36)}`;
  const activeJobCompleteOperationId = `op:${activeJobCompletePlayerId}:active-job:complete:1`;
  const mailId = `mail:${playerId}:1`;
  const attachmentId = `attachment:${playerId}:1`;
  const runtimeOwnerRuntimeId = `runtime:${runtimePlayerId}:7`;
  const marketRuntimeOwnerId = `runtime:${marketPlayerId}:9`;
  const marketSellRuntimeOwnerId = `runtime:${marketSellPlayerId}:10`;
  const marketBuyRuntimeOwnerId = `runtime:${marketBuyPlayerId}:10`;
  const marketCancelRuntimeOwnerId = `runtime:${marketCancelPlayerId}:10`;
  const shopRuntimeOwnerId = `runtime:${shopPlayerId}:11`;
  const walletRuntimeOwnerId = `runtime:${walletPlayerId}:12`;
  const equipRuntimeOwnerId = `runtime:${equipPlayerId}:13`;
  const activeJobRuntimeOwnerId = `runtime:${activeJobPlayerId}:15`;
  const activeJobStartRuntimeOwnerId = `runtime:${activeJobStartPlayerId}:16`;
  const activeJobCancelRuntimeOwnerId = `runtime:${activeJobCancelPlayerId}:17`;
  const activeJobCompleteRuntimeOwnerId = `runtime:${activeJobCompletePlayerId}:18`;
  const runtimeMailId = `mail:${runtimePlayerId}:1`;
  const runtimeAttachmentId = `attachment:${runtimePlayerId}:1`;
  const runtimeLeaseInstanceId = `instance:${runtimePlayerId}:mail-lease`;
  const leasedMarketSellInstanceId = `instance:${marketSellPlayerId}:lease`;
  const leasedMarketBuyInstanceId = `instance:${marketBuyPlayerId}:lease`;
  const leasedMarketCancelInstanceId = `instance:${marketCancelPlayerId}:lease`;
  const leasedActiveJobCancelInstanceId = `instance:${activeJobCancelPlayerId}:lease`;
  const leasedActiveJobCompleteInstanceId = `instance:${activeJobCompletePlayerId}:lease`;
  const service = new DurableOperationService();
  const leaseAwareService = new DurableOperationService({
    getNodeId() {
      return 'node:durable-operation-smoke';
    },
  } as never);
  const mailPersistence = new MailPersistenceService();
  const contentTemplateRepository = new ContentTemplateRepository();
  const pool = new Pool({ connectionString: databaseUrl });
  const runtimePlayerState = {
    sessionEpoch: 7,
    runtimeOwnerId: runtimeOwnerRuntimeId,
    inventoryItems: [] as Array<Record<string, unknown>>,
    walletBalances: [] as Array<{ walletType: string; balance: number; frozenBalance: number; version: number }>,
  };
  const mailRuntime = new MailRuntimeService(
    contentTemplateRepository,
    {
      getPlayerOrThrow(targetPlayerId: string) {
        if (targetPlayerId !== runtimePlayerId) {
          throw new Error(`unexpected runtime player: ${targetPlayerId}`);
        }
        return {
          inventory: {
            capacity: 24,
            items: runtimePlayerState.inventoryItems.map((entry) => ({ ...entry })),
          },
        };
      },
      getSessionFence(targetPlayerId: string) {
        if (targetPlayerId !== runtimePlayerId) {
          return null;
        }
        return {
          runtimeOwnerId: runtimePlayerState.runtimeOwnerId,
          sessionEpoch: runtimePlayerState.sessionEpoch,
        };
      },
      describePersistencePresence(targetPlayerId: string) {
        if (targetPlayerId !== runtimePlayerId) {
          return null;
        }
        return {
          online: true,
          inWorld: true,
          lastHeartbeatAt: now + 100,
          runtimeOwnerId: runtimePlayerState.runtimeOwnerId,
          sessionEpoch: runtimePlayerState.sessionEpoch,
        };
      },
      buildPersistenceSnapshot(targetPlayerId: string) {
        if (targetPlayerId !== runtimePlayerId) {
          return null;
        }
        const snapshot = buildNextSnapshot(now + 100, runtimeLeaseInstanceId);
        return {
          ...snapshot,
          inventory: {
            ...snapshot.inventory,
            items: runtimePlayerState.inventoryItems.map((entry) => ({ ...entry })),
          },
          wallet: {
            ...snapshot.wallet,
            balances: runtimePlayerState.walletBalances.map((entry) => ({ ...entry })),
          },
        };
      },
      replaceInventoryItems(targetPlayerId: string, items: unknown[]) {
        if (targetPlayerId !== runtimePlayerId) {
          throw new Error(`unexpected runtime inventory replace player: ${targetPlayerId}`);
        }
        runtimePlayerState.inventoryItems = Array.isArray(items)
          ? items
              .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
              .map((entry) => ({ ...entry }))
          : [];
      },
      creditWallet(targetPlayerId: string, walletType: string, amount = 1) {
        if (targetPlayerId !== runtimePlayerId) {
          throw new Error(`unexpected runtime wallet credit player: ${targetPlayerId}`);
        }
        const normalizedWalletType = String(walletType ?? '').trim();
        const normalizedAmount = Math.max(0, Math.trunc(Number(amount ?? 0)));
        if (!normalizedWalletType || normalizedAmount <= 0) {
          return;
        }
        const entry = runtimePlayerState.walletBalances.find((row) => row.walletType === normalizedWalletType);
        if (entry) {
          entry.balance += normalizedAmount;
          entry.version += 1;
          return;
        }
        runtimePlayerState.walletBalances.push({
          walletType: normalizedWalletType,
          balance: normalizedAmount,
          frozenBalance: 0,
          version: 1,
        });
      },
      receiveInventoryItem() {
        throw new Error('runtime fallback path should not execute during durable-operation smoke');
      },
    } as any,
    mailPersistence,
    leaseAwareService,
    {
      isEnabled() {
        return true;
      },
      async savePlayerPresence(targetPlayerId: string, presence: Record<string, unknown>) {
        await pool.query(
          `
            INSERT INTO player_presence(
              player_id,
              online,
              in_world,
              last_heartbeat_at,
              runtime_owner_id,
              session_epoch,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, now())
            ON CONFLICT (player_id) DO UPDATE
            SET
              online = EXCLUDED.online,
              in_world = EXCLUDED.in_world,
              last_heartbeat_at = EXCLUDED.last_heartbeat_at,
              runtime_owner_id = EXCLUDED.runtime_owner_id,
              session_epoch = EXCLUDED.session_epoch,
              updated_at = now()
          `,
          [
            targetPlayerId,
            Boolean(presence?.online),
            Boolean(presence?.inWorld),
            Math.max(0, Math.trunc(Number(presence?.lastHeartbeatAt ?? Date.now()))),
            String(presence?.runtimeOwnerId ?? ''),
            Math.max(0, Math.trunc(Number(presence?.sessionEpoch ?? 0))),
          ],
        );
      },
    } as any,
    {
      isEnabled() {
        return false;
      },
      async loadInstanceCatalog() {
        return null;
      },
    } as any,
  );

  await service.onModuleInit();
  await leaseAwareService.onModuleInit();
  await mailPersistence.onModuleInit();
  contentTemplateRepository.onModuleInit();
  if (!service.isEnabled()) {
    throw new Error('durable-operation service not enabled');
  }
  if (!leaseAwareService.isEnabled()) {
    throw new Error('lease-aware durable-operation service not enabled');
  }
  if (!mailPersistence.isEnabled()) {
    throw new Error('mail-persistence service not enabled');
  }

  try {
    await cleanupPlayer(pool, playerId);
    await cleanupPlayer(pool, runtimePlayerId);
    await cleanupPlayer(pool, marketPlayerId);
    await cleanupPlayer(pool, marketSellPlayerId);
    await cleanupPlayer(pool, marketSellBuyerId);
    await cleanupPlayer(pool, marketBuyPlayerId);
    await cleanupPlayer(pool, marketBuySellerId);
    await cleanupPlayer(pool, marketCancelPlayerId);
    await cleanupPlayer(pool, shopPlayerId);
    await cleanupPlayer(pool, walletPlayerId);
    await cleanupPlayer(pool, equipPlayerId);
    await cleanupPlayer(pool, activeJobPlayerId);
    await seedClaimFixture(pool, {
      playerId,
      runtimeOwnerId,
      sessionEpoch: 7,
      mailId,
      attachmentId,
      now,
    });

    let fencingRejected = false;
    try {
      await service.claimMailAttachments({
        operationId: `op:${playerId}:wrong-owner`,
        playerId,
        expectedRuntimeOwnerId: `${runtimeOwnerId}:stale`,
        expectedSessionEpoch: 7,
        mailIds: [mailId],
        nextInventoryItems: buildNextInventoryItems(),
        nextWalletBalances: buildNextWalletBalances(),
        nextPlayerSnapshot: buildNextSnapshot(now),
      });
    } catch (error) {
      fencingRejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!fencingRejected) {
      throw new Error('expected stale runtime owner fencing rejection before durable claim');
    }

    fencingRejected = false;
    try {
      await service.claimMailAttachments({
        operationId: `op:${playerId}:wrong-session`,
        playerId,
        expectedRuntimeOwnerId: runtimeOwnerId,
        expectedSessionEpoch: 8,
        mailIds: [mailId],
        nextInventoryItems: buildNextInventoryItems(),
        nextWalletBalances: buildNextWalletBalances(),
        nextPlayerSnapshot: buildNextSnapshot(now),
      });
    } catch (error) {
      fencingRejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!fencingRejected) {
      throw new Error('expected stale session fencing rejection before durable claim');
    }

    const firstResult = await service.claimMailAttachments({
      operationId,
      playerId,
      expectedRuntimeOwnerId: runtimeOwnerId,
      expectedSessionEpoch: 7,
      mailIds: [mailId],
      nextInventoryItems: buildNextInventoryItems(),
      nextWalletBalances: buildNextWalletBalances(),
      nextPlayerSnapshot: buildNextSnapshot(now),
    });
    if (!firstResult.ok || firstResult.alreadyCommitted) {
      throw new Error(`unexpected first durable claim result: ${JSON.stringify(firstResult)}`);
    }

    const secondResult = await service.claimMailAttachments({
      operationId,
      playerId,
      expectedRuntimeOwnerId: runtimeOwnerId,
      expectedSessionEpoch: 7,
      mailIds: [mailId],
      nextInventoryItems: buildNextInventoryItems(),
      nextWalletBalances: buildNextWalletBalances(),
      nextPlayerSnapshot: buildNextSnapshot(now),
    });
    if (!secondResult.ok || !secondResult.alreadyCommitted) {
      throw new Error(`unexpected replay durable claim result: ${JSON.stringify(secondResult)}`);
    }

    const operationRow = await fetchSingleRow(
      pool,
      'SELECT status, committed_at FROM durable_operation_log WHERE operation_id = $1',
      [operationId],
    );
    const outboxRows = await fetchRows(
      pool,
      'SELECT topic, status FROM outbox_event WHERE operation_id = $1 ORDER BY event_id ASC',
      [operationId],
    );
    const auditRows = await fetchRows(
      pool,
      'SELECT asset_type, action FROM asset_audit_log WHERE operation_id = $1 ORDER BY log_id ASC',
      [operationId],
    );
    const inventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [playerId],
    );
    const claimedMailWalletRows = await fetchRows(
      pool,
      'SELECT wallet_type, balance FROM player_wallet WHERE player_id = $1 ORDER BY wallet_type ASC',
      [playerId],
    );
    const mailRow = await fetchSingleRow(pool, 'SELECT read_at, claimed_at, mail_version FROM player_mail WHERE mail_id = $1', [
      mailId,
    ]);
    const attachmentRow = await fetchSingleRow(
      pool,
      'SELECT claim_operation_id, claimed_at FROM player_mail_attachment WHERE attachment_id = $1',
      [attachmentId],
    );
    const counterRow = await fetchSingleRow(
      pool,
      'SELECT unread_count, unclaimed_count, counter_version FROM player_mail_counter WHERE player_id = $1',
      [playerId],
    );
    const watermarkRow = await fetchSingleRow(
      pool,
      'SELECT wallet_version, inventory_version, mail_version, mail_counter_version FROM player_recovery_watermark WHERE player_id = $1',
      [playerId],
    );
    const snapshotRow = await fetchSingleRow(
      pool,
      'SELECT persisted_source, saved_at, payload FROM server_player_snapshot WHERE player_id = $1',
      [playerId],
    );

    if (!operationRow || operationRow.status !== 'committed' || !operationRow.committed_at) {
      throw new Error(`unexpected durable_operation_log row: ${JSON.stringify(operationRow)}`);
    }
    if (outboxRows.length !== 1 || outboxRows[0]?.topic !== 'player.mail.claimed' || outboxRows[0]?.status !== 'ready') {
      throw new Error(`unexpected outbox_event rows: ${JSON.stringify(outboxRows)}`);
    }
    if (auditRows.length !== 1 || auditRows[0]?.asset_type !== 'mail_claim' || auditRows[0]?.action !== 'claim') {
      throw new Error(`unexpected asset_audit_log rows: ${JSON.stringify(auditRows)}`);
    }
    if (inventoryRows.length !== 0) {
      throw new Error(`unexpected player_inventory_item rows: ${JSON.stringify(inventoryRows)}`);
    }
    if (
      claimedMailWalletRows.length !== 1
      || claimedMailWalletRows[0]?.wallet_type !== 'spirit_stone'
      || Number(claimedMailWalletRows[0]?.balance) !== 1
    ) {
      throw new Error(`unexpected player_wallet rows: ${JSON.stringify(claimedMailWalletRows)}`);
    }
    if (!mailRow || !mailRow.read_at || !mailRow.claimed_at || Number(mailRow.mail_version) < 2) {
      throw new Error(`unexpected player_mail row: ${JSON.stringify(mailRow)}`);
    }
    if (!attachmentRow || attachmentRow.claim_operation_id !== operationId || !attachmentRow.claimed_at) {
      throw new Error(`unexpected player_mail_attachment row: ${JSON.stringify(attachmentRow)}`);
    }
    if (
      !counterRow
      || Number(counterRow.unread_count) !== 0
      || Number(counterRow.unclaimed_count) !== 0
      || Number(counterRow.counter_version) <= 0
    ) {
      throw new Error(`unexpected player_mail_counter row: ${JSON.stringify(counterRow)}`);
    }
    if (
      !watermarkRow
      || Number(watermarkRow.wallet_version) <= 0
      || Number(watermarkRow.inventory_version) <= 0
      || Number(watermarkRow.mail_version) <= 0
      || Number(watermarkRow.mail_counter_version) <= 0
    ) {
      throw new Error(`unexpected player_recovery_watermark row: ${JSON.stringify(watermarkRow)}`);
    }
    const snapshotPayload = asRecord(snapshotRow?.payload);
    const inventoryItems = Array.isArray(snapshotPayload?.inventory && asRecord(snapshotPayload.inventory)?.items)
      ? (asRecord(snapshotPayload.inventory)?.items as unknown[])
      : [];
    const walletBalances = Array.isArray(snapshotPayload?.wallet && asRecord(snapshotPayload.wallet)?.balances)
      ? (asRecord(snapshotPayload.wallet)?.balances as Array<Record<string, unknown>>)
      : [];
    if (
      !snapshotRow
      || snapshotRow.persisted_source !== 'native'
      || inventoryItems.length !== 0
      || walletBalances.length !== 1
      || walletBalances[0]?.walletType !== 'spirit_stone'
      || Number(walletBalances[0]?.balance ?? 0) !== 1
    ) {
      throw new Error(`unexpected server_player_snapshot row: ${JSON.stringify(snapshotRow)}`);
    }

    await seedClaimFixture(pool, {
      playerId: runtimePlayerId,
      runtimeOwnerId: runtimeOwnerRuntimeId,
      sessionEpoch: 7,
      mailId: runtimeMailId,
      attachmentId: runtimeAttachmentId,
      now: now + 10,
    });
    await seedInstanceCatalogFixture(pool, {
      instanceId: runtimeLeaseInstanceId,
      assignedNodeId: 'node:durable-operation-smoke:other',
      leaseExpireAt: new Date(Date.now() + 60_000).toISOString(),
      ownershipEpoch: 2,
    });

    await seedInstanceCatalogFixture(pool, {
      instanceId: runtimeLeaseInstanceId,
      assignedNodeId: 'node:durable-operation-smoke',
      leaseExpireAt: new Date(Date.now() + 60_000).toISOString(),
      ownershipEpoch: 2,
    });

    runtimePlayerState.sessionEpoch = 8;
    const runtimeResult = await mailRuntime.claimAttachments(runtimePlayerId, [runtimeMailId]);
    if (!runtimeResult.ok) {
      throw new Error(`unexpected runtime durable claim result: ${JSON.stringify(runtimeResult)}`);
    }
    const runtimeReplayResult = await mailRuntime.claimAttachments(runtimePlayerId, [runtimeMailId]);
    if (runtimeReplayResult.ok || !String(runtimeReplayResult.message ?? '').includes('当前没有可领取附件的邮件')) {
      throw new Error(`expected runtime replay to observe claimed mailbox state, got ${JSON.stringify(runtimeReplayResult)}`);
    }
    const runtimeSummary = await mailRuntime.getSummary(runtimePlayerId);
    if (runtimeSummary.unreadCount !== 0 || runtimeSummary.claimableCount !== 0) {
      throw new Error(`unexpected runtime mail summary after claim: ${JSON.stringify(runtimeSummary)}`);
    }
    const runtimeInventoryItem = runtimePlayerState.inventoryItems[0];
    if (
      runtimePlayerState.inventoryItems.length !== 1
      || runtimeInventoryItem?.itemId !== 'spirit_stone'
      || Number(runtimeInventoryItem?.count ?? 0) !== 1
    ) {
      throw new Error(`unexpected runtime inventory after durable claim: ${JSON.stringify(runtimePlayerState.inventoryItems)}`);
    }
    const runtimeWalletBalances = runtimePlayerState.walletBalances as Array<{
      walletType: string;
      balance: number;
      frozenBalance: number;
      version: number;
    }>;
    if (runtimeWalletBalances.length !== 0) {
      throw new Error(`unexpected runtime wallet after durable claim: ${JSON.stringify(runtimePlayerState.walletBalances)}`);
    }

    const runtimeMailRow = await fetchSingleRow(
      pool,
      'SELECT read_at, claimed_at, mail_version FROM player_mail WHERE mail_id = $1',
      [runtimeMailId],
    );
    const runtimeOperationRows = await pool.query(
      `
        SELECT operation_id, status, committed_at
        FROM durable_operation_log
        WHERE player_id = $1
          AND operation_id LIKE $2
        ORDER BY created_at ASC, operation_id ASC
      `,
      [runtimePlayerId, `mail-claim:${runtimePlayerId}:%:${runtimeMailId}`],
    );
    const runtimeAttachmentRows = await pool.query(
      `
        SELECT attachment_id, claim_operation_id, claimed_at
        FROM player_mail_attachment
        WHERE mail_id = $1
        ORDER BY attachment_id ASC
      `,
      [runtimeMailId],
    );
    const runtimeCounterRow = await fetchSingleRow(
      pool,
      'SELECT unread_count, unclaimed_count, counter_version FROM player_mail_counter WHERE player_id = $1',
      [runtimePlayerId],
    );
    if (!runtimeMailRow || !runtimeMailRow.read_at || !runtimeMailRow.claimed_at || Number(runtimeMailRow.mail_version) < 2) {
      throw new Error(`unexpected runtime player_mail row: ${JSON.stringify(runtimeMailRow)}`);
    }
    const committedRuntimeOperation = runtimeOperationRows.rows.find(
      (row) => row?.status === 'committed' && row?.committed_at,
    );
    if (!committedRuntimeOperation) {
      throw new Error(`unexpected runtime durable_operation_log rows: ${JSON.stringify(runtimeOperationRows.rows)}`);
    }
    if (
      runtimeAttachmentRows.rows.length !== 1
      || !runtimeAttachmentRows.rows[0]?.claimed_at
    ) {
      throw new Error(`unexpected runtime player_mail_attachment rows: ${JSON.stringify(runtimeAttachmentRows.rows)}`);
    }
    if (
      !runtimeCounterRow
      || Number(runtimeCounterRow.unread_count) !== 0
      || Number(runtimeCounterRow.unclaimed_count) !== 0
      || Number(runtimeCounterRow.counter_version) <= 0
    ) {
      throw new Error(`unexpected runtime player_mail_counter row: ${JSON.stringify(runtimeCounterRow)}`);
    }

    await seedMarketClaimFixture(pool, {
      playerId: marketPlayerId,
      runtimeOwnerId: marketRuntimeOwnerId,
      sessionEpoch: 9,
      now: now + 20,
    });
    let marketFencingRejected = false;
    try {
      await service.claimMarketStorage({
        operationId: `${marketOperationId}:wrong-owner`,
        playerId: marketPlayerId,
        expectedRuntimeOwnerId: `${marketRuntimeOwnerId}:stale`,
        expectedSessionEpoch: 9,
        movedCount: 11,
        remainingCount: 0,
        nextInventoryItems: [
          {
            itemId: 'spirit_stone',
            count: 9,
            rawPayload: {
              itemId: 'spirit_stone',
              count: 9,
            },
          },
          {
            itemId: 'moon_herb',
            count: 4,
            rawPayload: {
              itemId: 'moon_herb',
              count: 4,
            },
          },
        ],
        nextMarketStorageItems: [],
      });
    } catch (error) {
      marketFencingRejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!marketFencingRejected) {
      throw new Error('expected stale runtime owner fencing rejection before market durable claim');
    }
    marketFencingRejected = false;
    try {
      await service.claimMarketStorage({
        operationId: `${marketOperationId}:wrong-session`,
        playerId: marketPlayerId,
        expectedRuntimeOwnerId: marketRuntimeOwnerId,
        expectedSessionEpoch: 10,
        movedCount: 11,
        remainingCount: 0,
        nextInventoryItems: [
          {
            itemId: 'spirit_stone',
            count: 9,
            rawPayload: {
              itemId: 'spirit_stone',
              count: 9,
            },
          },
          {
            itemId: 'moon_herb',
            count: 4,
            rawPayload: {
              itemId: 'moon_herb',
              count: 4,
            },
          },
        ],
        nextMarketStorageItems: [],
      });
    } catch (error) {
      marketFencingRejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!marketFencingRejected) {
      throw new Error('expected stale session fencing rejection before market durable claim');
    }
    const marketRejectedInventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [marketPlayerId],
    );
    const marketRejectedStorageRows = await fetchRows(
      pool,
      'SELECT storage_item_id, item_id, count FROM player_market_storage_item WHERE player_id = $1 ORDER BY slot_index ASC, storage_item_id ASC',
      [marketPlayerId],
    );
    if (
      marketRejectedInventoryRows.length !== 1
      || marketRejectedInventoryRows[0]?.item_id !== 'spirit_stone'
      || Number(marketRejectedInventoryRows[0]?.count) !== 2
    ) {
      throw new Error(`unexpected market inventory rows after rejected claim: ${JSON.stringify(marketRejectedInventoryRows)}`);
    }
    if (
      marketRejectedStorageRows.length !== 2
      || marketRejectedStorageRows[0]?.item_id !== 'spirit_stone'
      || Number(marketRejectedStorageRows[0]?.count) !== 7
      || marketRejectedStorageRows[1]?.item_id !== 'moon_herb'
      || Number(marketRejectedStorageRows[1]?.count) !== 4
    ) {
      throw new Error(`unexpected market storage rows after rejected claim: ${JSON.stringify(marketRejectedStorageRows)}`);
    }
    const marketOperationResult = await service.claimMarketStorage({
      operationId: marketOperationId,
      playerId: marketPlayerId,
      expectedRuntimeOwnerId: marketRuntimeOwnerId,
      expectedSessionEpoch: 9,
      movedCount: 11,
      remainingCount: 0,
      nextInventoryItems: [
        {
          itemId: 'spirit_stone',
          count: 9,
          rawPayload: {
            itemId: 'spirit_stone',
            count: 9,
          },
        },
        {
          itemId: 'moon_herb',
          count: 4,
          rawPayload: {
            itemId: 'moon_herb',
            count: 4,
          },
        },
      ],
      nextMarketStorageItems: [],
    });
    if (!marketOperationResult.ok || marketOperationResult.alreadyCommitted || marketOperationResult.movedCount !== 11) {
      throw new Error(`unexpected market durable claim result: ${JSON.stringify(marketOperationResult)}`);
    }

    const leasedMarketInstanceId = `instance:${marketPlayerId}:lease`;
    await seedInstanceCatalogFixture(pool, {
      instanceId: leasedMarketInstanceId,
      assignedNodeId: 'node:durable-operation-smoke',
      leaseExpireAt: new Date(Date.now() + 60_000).toISOString(),
      ownershipEpoch: 1,
    });
    const leaseAwareMarketResult = await leaseAwareService.claimMarketStorage({
      operationId: `${marketOperationId}:lease-aware`,
      playerId: marketPlayerId,
      expectedRuntimeOwnerId: marketRuntimeOwnerId,
      expectedSessionEpoch: 9,
      expectedInstanceId: leasedMarketInstanceId,
      expectedAssignedNodeId: 'node:durable-operation-smoke',
      expectedOwnershipEpoch: 1,
      movedCount: 11,
      remainingCount: 0,
      nextInventoryItems: [
        {
          itemId: 'spirit_stone',
          count: 9,
          rawPayload: {
            itemId: 'spirit_stone',
            count: 9,
          },
        },
        {
          itemId: 'moon_herb',
          count: 4,
          rawPayload: {
            itemId: 'moon_herb',
            count: 4,
          },
        },
      ],
      nextMarketStorageItems: [],
    });
    if (
      !leaseAwareMarketResult.ok
      || leaseAwareMarketResult.alreadyCommitted
      || leaseAwareMarketResult.movedCount !== 11
      || leaseAwareMarketResult.remainingCount !== 0
    ) {
      throw new Error(`unexpected market lease-aware claim result: ${JSON.stringify(leaseAwareMarketResult)}`);
    }
    await seedInstanceCatalogFixture(pool, {
      instanceId: leasedMarketInstanceId,
      assignedNodeId: 'node:durable-operation-smoke:other',
      leaseExpireAt: new Date(Date.now() + 60_000).toISOString(),
      ownershipEpoch: 2,
    });
    let leaseRejected = false;
    try {
      await leaseAwareService.claimMarketStorage({
        operationId: `${marketOperationId}:lease-mismatch`,
        playerId: marketPlayerId,
        expectedRuntimeOwnerId: marketRuntimeOwnerId,
        expectedSessionEpoch: 9,
        expectedInstanceId: leasedMarketInstanceId,
        expectedAssignedNodeId: 'node:durable-operation-smoke:other',
        expectedOwnershipEpoch: 1,
        movedCount: 11,
        remainingCount: 0,
        nextInventoryItems: [
          {
            itemId: 'spirit_stone',
            count: 9,
            rawPayload: {
              itemId: 'spirit_stone',
              count: 9,
            },
          },
          {
            itemId: 'moon_herb',
            count: 4,
            rawPayload: {
              itemId: 'moon_herb',
              count: 4,
            },
          },
        ],
        nextMarketStorageItems: [],
      });
    } catch (error) {
      leaseRejected = String(error instanceof Error ? error.message : error).includes('instance_lease_fencing_conflict');
    }
    if (!leaseRejected) {
      throw new Error('expected instance lease fencing rejection before market durable claim');
    }
    const marketReplayResult = await service.claimMarketStorage({
      operationId: marketOperationId,
      playerId: marketPlayerId,
      expectedRuntimeOwnerId: marketRuntimeOwnerId,
      expectedSessionEpoch: 9,
      movedCount: 11,
      remainingCount: 0,
      nextInventoryItems: [
        {
          itemId: 'spirit_stone',
          count: 9,
          rawPayload: {
            itemId: 'spirit_stone',
            count: 9,
          },
        },
        {
          itemId: 'moon_herb',
          count: 4,
          rawPayload: {
            itemId: 'moon_herb',
            count: 4,
          },
        },
      ],
      nextMarketStorageItems: [],
    });
    if (!marketReplayResult.ok || !marketReplayResult.alreadyCommitted) {
      throw new Error(`unexpected market replay durable claim result: ${JSON.stringify(marketReplayResult)}`);
    }
    const marketInventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [marketPlayerId],
    );
    const marketStorageRows = await fetchRows(
      pool,
      'SELECT storage_item_id, item_id, count FROM player_market_storage_item WHERE player_id = $1 ORDER BY slot_index ASC, storage_item_id ASC',
      [marketPlayerId],
    );
    const marketOperationRow = await fetchSingleRow(
      pool,
      'SELECT status, committed_at FROM durable_operation_log WHERE operation_id = $1',
      [marketOperationId],
    );
    const marketOutboxRows = await fetchRows(
      pool,
      'SELECT topic, status FROM outbox_event WHERE operation_id = $1 ORDER BY event_id ASC',
      [marketOperationId],
    );
    const marketAuditRows = await fetchRows(
      pool,
      'SELECT asset_type, action FROM asset_audit_log WHERE operation_id = $1 ORDER BY log_id ASC',
      [marketOperationId],
    );
    const marketWatermarkRow = await fetchSingleRow(
      pool,
      'SELECT inventory_version, market_storage_version FROM player_recovery_watermark WHERE player_id = $1',
      [marketPlayerId],
    );
    if (!marketOperationRow || marketOperationRow.status !== 'committed' || !marketOperationRow.committed_at) {
      throw new Error(`unexpected market durable operation row: ${JSON.stringify(marketOperationRow)}`);
    }
    if (marketInventoryRows.length !== 2 || Number(marketInventoryRows[0]?.count) !== 9 || Number(marketInventoryRows[1]?.count) !== 4) {
      throw new Error(`unexpected market inventory rows: ${JSON.stringify(marketInventoryRows)}`);
    }
    if (marketStorageRows.length !== 0) {
      throw new Error(`expected market storage rows to be cleared, got: ${JSON.stringify(marketStorageRows)}`);
    }
    if (marketOutboxRows.length !== 1 || marketOutboxRows[0]?.topic !== 'player.market.storage.claimed') {
      throw new Error(`unexpected market outbox rows: ${JSON.stringify(marketOutboxRows)}`);
    }
    if (marketAuditRows.length !== 1 || marketAuditRows[0]?.asset_type !== 'market_storage' || marketAuditRows[0]?.action !== 'claim') {
      throw new Error(`unexpected market audit rows: ${JSON.stringify(marketAuditRows)}`);
    }
    if (
      !marketWatermarkRow
      || Number(marketWatermarkRow.inventory_version) <= 0
      || Number(marketWatermarkRow.market_storage_version) <= 0
    ) {
      throw new Error(`unexpected market watermark row: ${JSON.stringify(marketWatermarkRow)}`);
    }

    await seedMarketSellNowFixture(pool, {
      sellerId: marketSellPlayerId,
      sellerRuntimeOwnerId: marketSellRuntimeOwnerId,
      sellerSessionEpoch: 10,
      buyerId: marketSellBuyerId,
      now: now + 24,
    });
    await seedInstanceCatalogFixture(pool, {
      instanceId: leasedMarketSellInstanceId,
      assignedNodeId: 'node:durable-operation-smoke',
      leaseExpireAt: new Date(Date.now() + 60_000).toISOString(),
      ownershipEpoch: 7,
    });
    let marketSellRejected = false;
    try {
      await service.settleMarketSellNow({
        operationId: `${marketSellOperationId}:wrong-owner`,
        sellerId: marketSellPlayerId,
        expectedRuntimeOwnerId: `${marketSellRuntimeOwnerId}:stale`,
        expectedSessionEpoch: 10,
        itemId: 'rat_tail',
        itemName: '鼠尾',
        quantity: 2,
        totalIncome: 6,
        nextSellerInventoryItems: buildMarketSellNowSellerInventoryItems(),
        nextSellerWalletBalances: buildMarketSellNowSellerWalletBalances(),
        matches: buildMarketSellNowMatches(marketSellBuyerId),
      });
    } catch (error) {
      marketSellRejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!marketSellRejected) {
      throw new Error('expected stale runtime owner fencing rejection before market sell-now durable settlement');
    }
    marketSellRejected = false;
    try {
      await service.settleMarketSellNow({
        operationId: `${marketSellOperationId}:wrong-session`,
        sellerId: marketSellPlayerId,
        expectedRuntimeOwnerId: marketSellRuntimeOwnerId,
        expectedSessionEpoch: 11,
        itemId: 'rat_tail',
        itemName: '鼠尾',
        quantity: 2,
        totalIncome: 6,
        nextSellerInventoryItems: buildMarketSellNowSellerInventoryItems(),
        nextSellerWalletBalances: buildMarketSellNowSellerWalletBalances(),
        matches: buildMarketSellNowMatches(marketSellBuyerId),
      });
    } catch (error) {
      marketSellRejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!marketSellRejected) {
      throw new Error('expected stale session fencing rejection before market sell-now durable settlement');
    }
    marketSellRejected = false;
    try {
      await leaseAwareService.settleMarketSellNow({
        operationId: `${marketSellOperationId}:wrong-lease`,
        sellerId: marketSellPlayerId,
        expectedRuntimeOwnerId: marketSellRuntimeOwnerId,
        expectedSessionEpoch: 10,
        expectedInstanceId: leasedMarketSellInstanceId,
        expectedAssignedNodeId: 'node:durable-operation-smoke',
        expectedOwnershipEpoch: 8,
        itemId: 'rat_tail',
        itemName: '鼠尾',
        quantity: 2,
        totalIncome: 6,
        nextSellerInventoryItems: buildMarketSellNowSellerInventoryItems(),
        nextSellerWalletBalances: buildMarketSellNowSellerWalletBalances(),
        matches: buildMarketSellNowMatches(marketSellBuyerId),
      });
    } catch (error) {
      marketSellRejected = String(error instanceof Error ? error.message : error).includes('instance_lease_fencing_conflict');
    }
    if (!marketSellRejected) {
      throw new Error('expected stale instance lease rejection before market sell-now durable settlement');
    }
    const marketSellRejectedSellerInventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [marketSellPlayerId],
    );
    const marketSellRejectedSellerWalletRows = await fetchRows(
      pool,
      'SELECT wallet_type, balance FROM player_wallet WHERE player_id = $1 ORDER BY wallet_type ASC',
      [marketSellPlayerId],
    );
    const marketSellRejectedBuyerInventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [marketSellBuyerId],
    );
    if (
      marketSellRejectedSellerInventoryRows.length !== 1
      || marketSellRejectedSellerInventoryRows[0]?.item_id !== 'rat_tail'
      || Number(marketSellRejectedSellerInventoryRows[0]?.count) !== 4
    ) {
      throw new Error(`unexpected market sell-now seller inventory rows after rejection: ${JSON.stringify(marketSellRejectedSellerInventoryRows)}`);
    }
    if (
      marketSellRejectedSellerWalletRows.length !== 1
      || marketSellRejectedSellerWalletRows[0]?.wallet_type !== 'spirit_stone'
      || Number(marketSellRejectedSellerWalletRows[0]?.balance) !== 3
    ) {
      throw new Error(`unexpected market sell-now seller wallet rows after rejection: ${JSON.stringify(marketSellRejectedSellerWalletRows)}`);
    }
    if (marketSellRejectedBuyerInventoryRows.length !== 0) {
      throw new Error(`unexpected market sell-now buyer inventory rows after rejection: ${JSON.stringify(marketSellRejectedBuyerInventoryRows)}`);
    }
    const marketSellResult = await leaseAwareService.settleMarketSellNow({
      operationId: marketSellOperationId,
      sellerId: marketSellPlayerId,
      expectedRuntimeOwnerId: marketSellRuntimeOwnerId,
      expectedSessionEpoch: 10,
      expectedInstanceId: leasedMarketSellInstanceId,
      expectedAssignedNodeId: 'node:durable-operation-smoke',
      expectedOwnershipEpoch: 7,
      itemId: 'rat_tail',
      itemName: '鼠尾',
      quantity: 2,
      totalIncome: 6,
      nextSellerInventoryItems: buildMarketSellNowSellerInventoryItems(),
      nextSellerWalletBalances: buildMarketSellNowSellerWalletBalances(),
      matches: buildMarketSellNowMatches(marketSellBuyerId),
    });
    if (!marketSellResult.ok || marketSellResult.alreadyCommitted) {
      throw new Error(`unexpected market sell-now durable result: ${JSON.stringify(marketSellResult)}`);
    }
    const marketSellReplayResult = await leaseAwareService.settleMarketSellNow({
      operationId: marketSellOperationId,
      sellerId: marketSellPlayerId,
      expectedRuntimeOwnerId: marketSellRuntimeOwnerId,
      expectedSessionEpoch: 10,
      expectedInstanceId: leasedMarketSellInstanceId,
      expectedAssignedNodeId: 'node:durable-operation-smoke',
      expectedOwnershipEpoch: 7,
      itemId: 'rat_tail',
      itemName: '鼠尾',
      quantity: 2,
      totalIncome: 6,
      nextSellerInventoryItems: buildMarketSellNowSellerInventoryItems(),
      nextSellerWalletBalances: buildMarketSellNowSellerWalletBalances(),
      matches: buildMarketSellNowMatches(marketSellBuyerId),
    });
    if (!marketSellReplayResult.ok || !marketSellReplayResult.alreadyCommitted) {
      throw new Error(`unexpected market sell-now replay result: ${JSON.stringify(marketSellReplayResult)}`);
    }
    const marketSellSellerInventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [marketSellPlayerId],
    );
    const marketSellSellerWalletRows = await fetchRows(
      pool,
      'SELECT wallet_type, balance FROM player_wallet WHERE player_id = $1 ORDER BY wallet_type ASC',
      [marketSellPlayerId],
    );
    const marketSellBuyerInventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [marketSellBuyerId],
    );
    const marketSellOperationRow = await fetchSingleRow(
      pool,
      'SELECT status, committed_at FROM durable_operation_log WHERE operation_id = $1',
      [marketSellOperationId],
    );
    const marketSellOutboxRows = await fetchRows(
      pool,
      'SELECT topic, status FROM outbox_event WHERE operation_id = $1 ORDER BY event_id ASC',
      [marketSellOperationId],
    );
    const marketSellAuditRows = await fetchRows(
      pool,
      'SELECT asset_type, action FROM asset_audit_log WHERE operation_id = $1 ORDER BY log_id ASC',
      [marketSellOperationId],
    );
    const marketSellSellerWatermarkRow = await fetchSingleRow(
      pool,
      'SELECT inventory_version, wallet_version FROM player_recovery_watermark WHERE player_id = $1',
      [marketSellPlayerId],
    );
    const marketSellBuyerWatermarkRow = await fetchSingleRow(
      pool,
      'SELECT inventory_version FROM player_recovery_watermark WHERE player_id = $1',
      [marketSellBuyerId],
    );
    if (!marketSellOperationRow || marketSellOperationRow.status !== 'committed' || !marketSellOperationRow.committed_at) {
      throw new Error(`unexpected market sell-now durable operation row: ${JSON.stringify(marketSellOperationRow)}`);
    }
    if (
      marketSellSellerInventoryRows.length !== 1
      || marketSellSellerInventoryRows[0]?.item_id !== 'rat_tail'
      || Number(marketSellSellerInventoryRows[0]?.count) !== 2
    ) {
      throw new Error(`unexpected market sell-now seller inventory rows: ${JSON.stringify(marketSellSellerInventoryRows)}`);
    }
    if (
      marketSellSellerWalletRows.length !== 1
      || marketSellSellerWalletRows[0]?.wallet_type !== 'spirit_stone'
      || Number(marketSellSellerWalletRows[0]?.balance) !== 9
    ) {
      throw new Error(`unexpected market sell-now seller wallet rows: ${JSON.stringify(marketSellSellerWalletRows)}`);
    }
    if (
      marketSellBuyerInventoryRows.length !== 1
      || marketSellBuyerInventoryRows[0]?.item_id !== 'rat_tail'
      || Number(marketSellBuyerInventoryRows[0]?.count) !== 2
    ) {
      throw new Error(`unexpected market sell-now buyer inventory rows: ${JSON.stringify(marketSellBuyerInventoryRows)}`);
    }
    if (
      marketSellOutboxRows.length !== 2
      || !marketSellOutboxRows.some((row) => row?.topic === 'player.market.sell_now' && row?.status === 'ready')
      || !marketSellOutboxRows.some((row) => row?.topic === 'player.market.sell_now.trade_delivered' && row?.status === 'ready')
    ) {
      throw new Error(`unexpected market sell-now outbox rows: ${JSON.stringify(marketSellOutboxRows)}`);
    }
    if (
      marketSellAuditRows.length !== 1
      || marketSellAuditRows[0]?.asset_type !== 'market_sell_now'
      || marketSellAuditRows[0]?.action !== 'sell'
    ) {
      throw new Error(`unexpected market sell-now audit rows: ${JSON.stringify(marketSellAuditRows)}`);
    }
    if (
      !marketSellSellerWatermarkRow
      || Number(marketSellSellerWatermarkRow.inventory_version) <= 0
      || Number(marketSellSellerWatermarkRow.wallet_version) <= 0
    ) {
      throw new Error(`unexpected market sell-now seller watermark row: ${JSON.stringify(marketSellSellerWatermarkRow)}`);
    }
    if (
      !marketSellBuyerWatermarkRow
      || Number(marketSellBuyerWatermarkRow.inventory_version) <= 0
    ) {
      throw new Error(`unexpected market sell-now buyer watermark row: ${JSON.stringify(marketSellBuyerWatermarkRow)}`);
    }

    await seedMarketBuyNowFixture(pool, {
      buyerId: marketBuyPlayerId,
      buyerRuntimeOwnerId: marketBuyRuntimeOwnerId,
      buyerSessionEpoch: 10,
      sellerId: marketBuySellerId,
      now: now + 25,
    });
    await seedInstanceCatalogFixture(pool, {
      instanceId: leasedMarketBuyInstanceId,
      assignedNodeId: 'node:durable-operation-smoke',
      leaseExpireAt: new Date(Date.now() + 60_000).toISOString(),
      ownershipEpoch: 8,
    });
    let marketBuyRejected = false;
    try {
      await service.settleMarketBuyNow({
        operationId: `${marketBuyOperationId}:wrong-owner`,
        buyerId: marketBuyPlayerId,
        expectedRuntimeOwnerId: `${marketBuyRuntimeOwnerId}:stale`,
        expectedSessionEpoch: 10,
        itemId: 'rat_tail',
        itemName: '鼠尾',
        quantity: 2,
        totalCost: 6,
        nextBuyerInventoryItems: buildMarketBuyNowBuyerInventoryItems(),
        nextBuyerWalletBalances: buildMarketBuyNowBuyerWalletBalances(),
        matches: buildMarketBuyNowMatches(marketBuySellerId),
      });
    } catch (error) {
      marketBuyRejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!marketBuyRejected) {
      throw new Error('expected stale runtime owner fencing rejection before market buy-now durable settlement');
    }
    marketBuyRejected = false;
    try {
      await service.settleMarketBuyNow({
        operationId: `${marketBuyOperationId}:wrong-session`,
        buyerId: marketBuyPlayerId,
        expectedRuntimeOwnerId: marketBuyRuntimeOwnerId,
        expectedSessionEpoch: 11,
        itemId: 'rat_tail',
        itemName: '鼠尾',
        quantity: 2,
        totalCost: 6,
        nextBuyerInventoryItems: buildMarketBuyNowBuyerInventoryItems(),
        nextBuyerWalletBalances: buildMarketBuyNowBuyerWalletBalances(),
        matches: buildMarketBuyNowMatches(marketBuySellerId),
      });
    } catch (error) {
      marketBuyRejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!marketBuyRejected) {
      throw new Error('expected stale session fencing rejection before market buy-now durable settlement');
    }
    marketBuyRejected = false;
    try {
      await leaseAwareService.settleMarketBuyNow({
        operationId: `${marketBuyOperationId}:wrong-lease`,
        buyerId: marketBuyPlayerId,
        expectedRuntimeOwnerId: marketBuyRuntimeOwnerId,
        expectedSessionEpoch: 10,
        expectedInstanceId: leasedMarketBuyInstanceId,
        expectedAssignedNodeId: 'node:durable-operation-smoke',
        expectedOwnershipEpoch: 9,
        itemId: 'rat_tail',
        itemName: '鼠尾',
        quantity: 2,
        totalCost: 6,
        nextBuyerInventoryItems: buildMarketBuyNowBuyerInventoryItems(),
        nextBuyerWalletBalances: buildMarketBuyNowBuyerWalletBalances(),
        matches: buildMarketBuyNowMatches(marketBuySellerId),
      });
    } catch (error) {
      marketBuyRejected = String(error instanceof Error ? error.message : error).includes('instance_lease_fencing_conflict');
    }
    if (!marketBuyRejected) {
      throw new Error('expected stale instance lease rejection before market buy-now durable settlement');
    }
    const marketBuyRejectedBuyerInventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [marketBuyPlayerId],
    );
    const marketBuyRejectedBuyerWalletRows = await fetchRows(
      pool,
      'SELECT wallet_type, balance FROM player_wallet WHERE player_id = $1 ORDER BY wallet_type ASC',
      [marketBuyPlayerId],
    );
    const marketBuyRejectedSellerInventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [marketBuySellerId],
    );
    const marketBuyRejectedSellerWalletRows = await fetchRows(
      pool,
      'SELECT wallet_type, balance FROM player_wallet WHERE player_id = $1 ORDER BY wallet_type ASC',
      [marketBuySellerId],
    );
    if (marketBuyRejectedBuyerInventoryRows.length !== 0) {
      throw new Error(`unexpected market buy-now buyer inventory rows after rejection: ${JSON.stringify(marketBuyRejectedBuyerInventoryRows)}`);
    }
    if (
      marketBuyRejectedBuyerWalletRows.length !== 1
      || marketBuyRejectedBuyerWalletRows[0]?.wallet_type !== 'spirit_stone'
      || Number(marketBuyRejectedBuyerWalletRows[0]?.balance) !== 20
    ) {
      throw new Error(`unexpected market buy-now buyer wallet rows after rejection: ${JSON.stringify(marketBuyRejectedBuyerWalletRows)}`);
    }
    if (
      marketBuyRejectedSellerInventoryRows.length !== 1
      || marketBuyRejectedSellerInventoryRows[0]?.item_id !== 'rat_tail'
      || Number(marketBuyRejectedSellerInventoryRows[0]?.count) !== 4
    ) {
      throw new Error(`unexpected market buy-now seller inventory rows after rejection: ${JSON.stringify(marketBuyRejectedSellerInventoryRows)}`);
    }
    if (
      marketBuyRejectedSellerWalletRows.length !== 1
      || marketBuyRejectedSellerWalletRows[0]?.wallet_type !== 'spirit_stone'
      || Number(marketBuyRejectedSellerWalletRows[0]?.balance) !== 3
    ) {
      throw new Error(`unexpected market buy-now seller wallet rows after rejection: ${JSON.stringify(marketBuyRejectedSellerWalletRows)}`);
    }
    const marketBuyResult = await leaseAwareService.settleMarketBuyNow({
      operationId: marketBuyOperationId,
      buyerId: marketBuyPlayerId,
      expectedRuntimeOwnerId: marketBuyRuntimeOwnerId,
      expectedSessionEpoch: 10,
      expectedInstanceId: leasedMarketBuyInstanceId,
      expectedAssignedNodeId: 'node:durable-operation-smoke',
      expectedOwnershipEpoch: 8,
      itemId: 'rat_tail',
      itemName: '鼠尾',
      quantity: 2,
      totalCost: 6,
      nextBuyerInventoryItems: buildMarketBuyNowBuyerInventoryItems(),
      nextBuyerWalletBalances: buildMarketBuyNowBuyerWalletBalances(),
      matches: buildMarketBuyNowMatches(marketBuySellerId),
    });
    if (!marketBuyResult.ok || marketBuyResult.alreadyCommitted) {
      throw new Error(`unexpected market buy-now durable result: ${JSON.stringify(marketBuyResult)}`);
    }
    const marketBuyReplayResult = await leaseAwareService.settleMarketBuyNow({
      operationId: marketBuyOperationId,
      buyerId: marketBuyPlayerId,
      expectedRuntimeOwnerId: marketBuyRuntimeOwnerId,
      expectedSessionEpoch: 10,
      expectedInstanceId: leasedMarketBuyInstanceId,
      expectedAssignedNodeId: 'node:durable-operation-smoke',
      expectedOwnershipEpoch: 8,
      itemId: 'rat_tail',
      itemName: '鼠尾',
      quantity: 2,
      totalCost: 6,
      nextBuyerInventoryItems: buildMarketBuyNowBuyerInventoryItems(),
      nextBuyerWalletBalances: buildMarketBuyNowBuyerWalletBalances(),
      matches: buildMarketBuyNowMatches(marketBuySellerId),
    });
    if (!marketBuyReplayResult.ok || !marketBuyReplayResult.alreadyCommitted) {
      throw new Error(`unexpected market buy-now replay result: ${JSON.stringify(marketBuyReplayResult)}`);
    }
    const marketBuyBuyerInventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [marketBuyPlayerId],
    );
    const marketBuyBuyerWalletRows = await fetchRows(
      pool,
      'SELECT wallet_type, balance FROM player_wallet WHERE player_id = $1 ORDER BY wallet_type ASC',
      [marketBuyPlayerId],
    );
    const marketBuySellerInventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [marketBuySellerId],
    );
    const marketBuySellerWalletRows = await fetchRows(
      pool,
      'SELECT wallet_type, balance FROM player_wallet WHERE player_id = $1 ORDER BY wallet_type ASC',
      [marketBuySellerId],
    );
    const marketBuyOperationRow = await fetchSingleRow(
      pool,
      'SELECT status, committed_at FROM durable_operation_log WHERE operation_id = $1',
      [marketBuyOperationId],
    );
    const marketBuyOutboxRows = await fetchRows(
      pool,
      'SELECT topic, status FROM outbox_event WHERE operation_id = $1 ORDER BY event_id ASC',
      [marketBuyOperationId],
    );
    const marketBuyBuyerWatermarkRow = await fetchSingleRow(
      pool,
      'SELECT inventory_version, wallet_version FROM player_recovery_watermark WHERE player_id = $1',
      [marketBuyPlayerId],
    );
    const marketBuySellerWatermarkRow = await fetchSingleRow(
      pool,
      'SELECT inventory_version, wallet_version FROM player_recovery_watermark WHERE player_id = $1',
      [marketBuySellerId],
    );
    if (!marketBuyOperationRow || marketBuyOperationRow.status !== 'committed' || !marketBuyOperationRow.committed_at) {
      throw new Error(`unexpected market buy-now durable operation row: ${JSON.stringify(marketBuyOperationRow)}`);
    }
    if (
      marketBuyBuyerInventoryRows.length !== 1
      || marketBuyBuyerInventoryRows[0]?.item_id !== 'rat_tail'
      || Number(marketBuyBuyerInventoryRows[0]?.count) !== 2
    ) {
      throw new Error(`unexpected market buy-now buyer inventory rows: ${JSON.stringify(marketBuyBuyerInventoryRows)}`);
    }
    if (
      marketBuyBuyerWalletRows.length !== 1
      || marketBuyBuyerWalletRows[0]?.wallet_type !== 'spirit_stone'
      || Number(marketBuyBuyerWalletRows[0]?.balance) !== 14
    ) {
      throw new Error(`unexpected market buy-now buyer wallet rows: ${JSON.stringify(marketBuyBuyerWalletRows)}`);
    }
    if (
      marketBuySellerInventoryRows.length !== 1
      || marketBuySellerInventoryRows[0]?.item_id !== 'rat_tail'
      || Number(marketBuySellerInventoryRows[0]?.count) !== 2
    ) {
      throw new Error(`unexpected market buy-now seller inventory rows: ${JSON.stringify(marketBuySellerInventoryRows)}`);
    }
    if (
      marketBuySellerWalletRows.length !== 1
      || marketBuySellerWalletRows[0]?.wallet_type !== 'spirit_stone'
      || Number(marketBuySellerWalletRows[0]?.balance) !== 9
    ) {
      throw new Error(`unexpected market buy-now seller wallet rows: ${JSON.stringify(marketBuySellerWalletRows)}`);
    }
    if (
      marketBuyOutboxRows.length !== 1
      || marketBuyOutboxRows[0]?.topic !== 'player.market.buy_now'
      || marketBuyOutboxRows[0]?.status !== 'ready'
    ) {
      throw new Error(`unexpected market buy-now outbox rows: ${JSON.stringify(marketBuyOutboxRows)}`);
    }
    if (
      !marketBuyBuyerWatermarkRow
      || Number(marketBuyBuyerWatermarkRow.inventory_version) <= 0
      || Number(marketBuyBuyerWatermarkRow.wallet_version) <= 0
    ) {
      throw new Error(`unexpected market buy-now buyer watermark row: ${JSON.stringify(marketBuyBuyerWatermarkRow)}`);
    }
    if (
      !marketBuySellerWatermarkRow
      || Number(marketBuySellerWatermarkRow.inventory_version) <= 0
      || Number(marketBuySellerWatermarkRow.wallet_version) <= 0
    ) {
      throw new Error(`unexpected market buy-now seller watermark row: ${JSON.stringify(marketBuySellerWatermarkRow)}`);
    }

    await seedMarketCancelFixture(pool, {
      playerId: marketCancelPlayerId,
      runtimeOwnerId: marketCancelRuntimeOwnerId,
      sessionEpoch: 10,
      now: now + 28,
    });
    await seedInstanceCatalogFixture(pool, {
      instanceId: leasedMarketCancelInstanceId,
      assignedNodeId: 'node:durable-operation-smoke',
      leaseExpireAt: new Date(Date.now() + 60_000).toISOString(),
      ownershipEpoch: 9,
    });
    let marketCancelRejected = false;
    try {
      await service.settleMarketCancelOrder({
        operationId: `${marketCancelOperationId}:wrong-owner`,
        playerId: marketCancelPlayerId,
        expectedRuntimeOwnerId: `${marketCancelRuntimeOwnerId}:stale`,
        expectedSessionEpoch: 10,
        orderId: `order:${marketCancelPlayerId}:sell:1`,
        side: 'sell',
        nextInventoryItems: buildMarketCancelSellInventoryItems(),
        nextWalletBalances: buildMarketCancelWalletBalances(),
      });
    } catch (error) {
      marketCancelRejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!marketCancelRejected) {
      throw new Error('expected stale runtime owner fencing rejection before market cancel durable settlement');
    }
    marketCancelRejected = false;
    try {
      await service.settleMarketCancelOrder({
        operationId: `${marketCancelOperationId}:wrong-session`,
        playerId: marketCancelPlayerId,
        expectedRuntimeOwnerId: marketCancelRuntimeOwnerId,
        expectedSessionEpoch: 11,
        orderId: `order:${marketCancelPlayerId}:sell:1`,
        side: 'sell',
        nextInventoryItems: buildMarketCancelSellInventoryItems(),
        nextWalletBalances: buildMarketCancelWalletBalances(),
      });
    } catch (error) {
      marketCancelRejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!marketCancelRejected) {
      throw new Error('expected stale session fencing rejection before market cancel durable settlement');
    }
    marketCancelRejected = false;
    try {
      await leaseAwareService.settleMarketCancelOrder({
        operationId: `${marketCancelOperationId}:wrong-lease`,
        playerId: marketCancelPlayerId,
        expectedRuntimeOwnerId: marketCancelRuntimeOwnerId,
        expectedSessionEpoch: 10,
        expectedInstanceId: leasedMarketCancelInstanceId,
        expectedAssignedNodeId: 'node:durable-operation-smoke',
        expectedOwnershipEpoch: 10,
        orderId: `order:${marketCancelPlayerId}:sell:1`,
        side: 'sell',
        nextInventoryItems: buildMarketCancelSellInventoryItems(),
        nextWalletBalances: buildMarketCancelWalletBalances(),
      });
    } catch (error) {
      marketCancelRejected = String(error instanceof Error ? error.message : error).includes('instance_lease_fencing_conflict');
    }
    if (!marketCancelRejected) {
      throw new Error('expected stale instance lease rejection before market cancel durable settlement');
    }
    const marketCancelRejectedInventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [marketCancelPlayerId],
    );
    const marketCancelRejectedWalletRows = await fetchRows(
      pool,
      'SELECT wallet_type, balance FROM player_wallet WHERE player_id = $1 ORDER BY wallet_type ASC',
      [marketCancelPlayerId],
    );
    if (marketCancelRejectedInventoryRows.length !== 0) {
      throw new Error(`unexpected market cancel inventory rows after rejection: ${JSON.stringify(marketCancelRejectedInventoryRows)}`);
    }
    if (
      marketCancelRejectedWalletRows.length !== 1
      || marketCancelRejectedWalletRows[0]?.wallet_type !== 'spirit_stone'
      || Number(marketCancelRejectedWalletRows[0]?.balance) !== 5
    ) {
      throw new Error(`unexpected market cancel wallet rows after rejection: ${JSON.stringify(marketCancelRejectedWalletRows)}`);
    }
    const marketCancelResult = await leaseAwareService.settleMarketCancelOrder({
      operationId: marketCancelOperationId,
      playerId: marketCancelPlayerId,
      expectedRuntimeOwnerId: marketCancelRuntimeOwnerId,
      expectedSessionEpoch: 10,
      expectedInstanceId: leasedMarketCancelInstanceId,
      expectedAssignedNodeId: 'node:durable-operation-smoke',
      expectedOwnershipEpoch: 9,
      orderId: `order:${marketCancelPlayerId}:sell:1`,
      side: 'sell',
      nextInventoryItems: buildMarketCancelSellInventoryItems(),
      nextWalletBalances: buildMarketCancelWalletBalances(),
    });
    if (!marketCancelResult.ok || marketCancelResult.alreadyCommitted) {
      throw new Error(`unexpected market cancel durable result: ${JSON.stringify(marketCancelResult)}`);
    }
    const marketCancelReplayResult = await leaseAwareService.settleMarketCancelOrder({
      operationId: marketCancelOperationId,
      playerId: marketCancelPlayerId,
      expectedRuntimeOwnerId: marketCancelRuntimeOwnerId,
      expectedSessionEpoch: 10,
      expectedInstanceId: leasedMarketCancelInstanceId,
      expectedAssignedNodeId: 'node:durable-operation-smoke',
      expectedOwnershipEpoch: 9,
      orderId: `order:${marketCancelPlayerId}:sell:1`,
      side: 'sell',
      nextInventoryItems: buildMarketCancelSellInventoryItems(),
      nextWalletBalances: buildMarketCancelWalletBalances(),
    });
    if (!marketCancelReplayResult.ok || !marketCancelReplayResult.alreadyCommitted) {
      throw new Error(`unexpected market cancel replay result: ${JSON.stringify(marketCancelReplayResult)}`);
    }
    const marketCancelInventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [marketCancelPlayerId],
    );
    const marketCancelWalletRows = await fetchRows(
      pool,
      'SELECT wallet_type, balance FROM player_wallet WHERE player_id = $1 ORDER BY wallet_type ASC',
      [marketCancelPlayerId],
    );
    const marketCancelOperationRow = await fetchSingleRow(
      pool,
      'SELECT status, committed_at FROM durable_operation_log WHERE operation_id = $1',
      [marketCancelOperationId],
    );
    const marketCancelWatermarkRow = await fetchSingleRow(
      pool,
      'SELECT inventory_version, wallet_version FROM player_recovery_watermark WHERE player_id = $1',
      [marketCancelPlayerId],
    );
    if (!marketCancelOperationRow || marketCancelOperationRow.status !== 'committed' || !marketCancelOperationRow.committed_at) {
      throw new Error(`unexpected market cancel durable operation row: ${JSON.stringify(marketCancelOperationRow)}`);
    }
    if (
      marketCancelInventoryRows.length !== 1
      || marketCancelInventoryRows[0]?.item_id !== 'rat_tail'
      || Number(marketCancelInventoryRows[0]?.count) !== 2
    ) {
      throw new Error(`unexpected market cancel inventory rows: ${JSON.stringify(marketCancelInventoryRows)}`);
    }
    if (
      marketCancelWalletRows.length !== 1
      || marketCancelWalletRows[0]?.wallet_type !== 'spirit_stone'
      || Number(marketCancelWalletRows[0]?.balance) !== 5
    ) {
      throw new Error(`unexpected market cancel wallet rows: ${JSON.stringify(marketCancelWalletRows)}`);
    }
    if (
      !marketCancelWatermarkRow
      || Number(marketCancelWatermarkRow.inventory_version) <= 0
      || Number(marketCancelWatermarkRow.wallet_version) <= 0
    ) {
      throw new Error(`unexpected market cancel watermark row: ${JSON.stringify(marketCancelWatermarkRow)}`);
    }

    await seedNpcShopFixture(pool, {
      playerId: shopPlayerId,
      runtimeOwnerId: shopRuntimeOwnerId,
      sessionEpoch: 11,
      now: now + 30,
    });
    const leasedShopInstanceId = `instance:${shopPlayerId}:lease`;
    await seedInstanceCatalogFixture(pool, {
      instanceId: leasedShopInstanceId,
      assignedNodeId: 'node:durable-operation-smoke',
      leaseExpireAt: new Date(Date.now() + 60_000).toISOString(),
    });
    let shopFencingRejected = false;
    try {
      await service.purchaseNpcShopItem({
        operationId: `${shopOperationId}:wrong-owner`,
        playerId: shopPlayerId,
        expectedRuntimeOwnerId: `${shopRuntimeOwnerId}:stale`,
        expectedSessionEpoch: 11,
        itemId: 'qi_pill',
        quantity: 2,
        totalCost: 10,
        nextInventoryItems: buildNpcShopInventoryItems(),
        nextWalletBalances: buildNpcShopWalletBalances(),
      });
    } catch (error) {
      shopFencingRejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!shopFencingRejected) {
      throw new Error('expected stale runtime owner fencing rejection before npc shop durable purchase');
    }
    shopFencingRejected = false;
    try {
      await service.purchaseNpcShopItem({
        operationId: `${shopOperationId}:wrong-session`,
        playerId: shopPlayerId,
        expectedRuntimeOwnerId: shopRuntimeOwnerId,
        expectedSessionEpoch: 12,
        itemId: 'qi_pill',
        quantity: 2,
        totalCost: 10,
        nextInventoryItems: buildNpcShopInventoryItems(),
        nextWalletBalances: buildNpcShopWalletBalances(),
      });
    } catch (error) {
      shopFencingRejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!shopFencingRejected) {
      throw new Error('expected stale session fencing rejection before npc shop durable purchase');
    }
    shopFencingRejected = false;
    try {
      await leaseAwareService.purchaseNpcShopItem({
        operationId: `${shopOperationId}:wrong-lease-epoch`,
        playerId: shopPlayerId,
        expectedRuntimeOwnerId: shopRuntimeOwnerId,
        expectedSessionEpoch: 11,
        expectedInstanceId: leasedShopInstanceId,
        expectedAssignedNodeId: 'node:durable-operation-smoke',
        expectedOwnershipEpoch: 4,
        itemId: 'qi_pill',
        quantity: 2,
        totalCost: 10,
        nextInventoryItems: buildNpcShopInventoryItems(),
        nextWalletBalances: buildNpcShopWalletBalances(),
      });
    } catch (error) {
      shopFencingRejected = String(error instanceof Error ? error.message : error).includes('instance_lease_fencing_conflict');
    }
    if (!shopFencingRejected) {
      throw new Error('expected stale lease ownership epoch rejection before npc shop durable purchase');
    }
    const shopRejectedInventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [shopPlayerId],
    );
    const shopRejectedWalletRows = await fetchRows(
      pool,
      'SELECT wallet_type, balance FROM player_wallet WHERE player_id = $1 ORDER BY wallet_type ASC',
      [shopPlayerId],
    );
    if (shopRejectedInventoryRows.length !== 0) {
      throw new Error(`unexpected npc shop inventory rows after rejected purchase: ${JSON.stringify(shopRejectedInventoryRows)}`);
    }
    if (
      shopRejectedWalletRows.length !== 1
      || shopRejectedWalletRows[0]?.wallet_type !== 'spirit_stone'
      || Number(shopRejectedWalletRows[0]?.balance) !== 20
    ) {
      throw new Error(`unexpected npc shop wallet rows after rejected purchase: ${JSON.stringify(shopRejectedWalletRows)}`);
    }
    const shopOperationResult = await leaseAwareService.purchaseNpcShopItem({
      operationId: shopOperationId,
      playerId: shopPlayerId,
      expectedRuntimeOwnerId: shopRuntimeOwnerId,
      expectedSessionEpoch: 11,
      expectedInstanceId: leasedShopInstanceId,
      expectedAssignedNodeId: 'node:durable-operation-smoke',
      expectedOwnershipEpoch: 1,
      itemId: 'qi_pill',
      quantity: 2,
      totalCost: 10,
      nextInventoryItems: buildNpcShopInventoryItems(),
      nextWalletBalances: buildNpcShopWalletBalances(),
    });
    if (
      !shopOperationResult.ok
      || shopOperationResult.alreadyCommitted
      || shopOperationResult.itemId !== 'qi_pill'
      || shopOperationResult.quantity !== 2
      || shopOperationResult.totalCost !== 10
    ) {
      throw new Error(`unexpected npc shop durable purchase result: ${JSON.stringify(shopOperationResult)}`);
    }
    const shopReplayResult = await leaseAwareService.purchaseNpcShopItem({
      operationId: shopOperationId,
      playerId: shopPlayerId,
      expectedRuntimeOwnerId: shopRuntimeOwnerId,
      expectedSessionEpoch: 11,
      expectedInstanceId: leasedShopInstanceId,
      expectedAssignedNodeId: 'node:durable-operation-smoke',
      expectedOwnershipEpoch: 1,
      itemId: 'qi_pill',
      quantity: 2,
      totalCost: 10,
      nextInventoryItems: buildNpcShopInventoryItems(),
      nextWalletBalances: buildNpcShopWalletBalances(),
    });
    if (!shopReplayResult.ok || !shopReplayResult.alreadyCommitted) {
      throw new Error(`unexpected npc shop replay durable purchase result: ${JSON.stringify(shopReplayResult)}`);
    }
    const shopInventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [shopPlayerId],
    );
    const shopWalletRows = await fetchRows(
      pool,
      'SELECT wallet_type, balance FROM player_wallet WHERE player_id = $1 ORDER BY wallet_type ASC',
      [shopPlayerId],
    );
    const shopOperationRow = await fetchSingleRow(
      pool,
      'SELECT status, committed_at FROM durable_operation_log WHERE operation_id = $1',
      [shopOperationId],
    );
    const shopOutboxRows = await fetchRows(
      pool,
      'SELECT topic, status FROM outbox_event WHERE operation_id = $1 ORDER BY event_id ASC',
      [shopOperationId],
    );
    const shopAuditRows = await fetchRows(
      pool,
      'SELECT asset_type, action FROM asset_audit_log WHERE operation_id = $1 ORDER BY log_id ASC',
      [shopOperationId],
    );
    const shopWatermarkRow = await fetchSingleRow(
      pool,
      'SELECT wallet_version, inventory_version FROM player_recovery_watermark WHERE player_id = $1',
      [shopPlayerId],
    );
    if (!shopOperationRow || shopOperationRow.status !== 'committed' || !shopOperationRow.committed_at) {
      throw new Error(`unexpected npc shop durable operation row: ${JSON.stringify(shopOperationRow)}`);
    }
    if (
      shopInventoryRows.length !== 1
      || shopInventoryRows[0]?.item_id !== 'qi_pill'
      || Number(shopInventoryRows[0]?.count) !== 2
    ) {
      throw new Error(`unexpected npc shop inventory rows: ${JSON.stringify(shopInventoryRows)}`);
    }
    if (
      shopWalletRows.length !== 1
      || shopWalletRows[0]?.wallet_type !== 'spirit_stone'
      || Number(shopWalletRows[0]?.balance) !== 10
    ) {
      throw new Error(`unexpected npc shop wallet rows: ${JSON.stringify(shopWalletRows)}`);
    }
    if (
      shopOutboxRows.length !== 1
      || shopOutboxRows[0]?.topic !== 'player.npc_shop.item_purchased'
      || shopOutboxRows[0]?.status !== 'ready'
    ) {
      throw new Error(`unexpected npc shop outbox rows: ${JSON.stringify(shopOutboxRows)}`);
    }
    if (
      shopAuditRows.length !== 1
      || shopAuditRows[0]?.asset_type !== 'npc_shop_purchase'
      || shopAuditRows[0]?.action !== 'purchase'
    ) {
      throw new Error(`unexpected npc shop audit rows: ${JSON.stringify(shopAuditRows)}`);
    }
    if (
      !shopWatermarkRow
      || Number(shopWatermarkRow.wallet_version) <= 0
      || Number(shopWatermarkRow.inventory_version) <= 0
    ) {
      throw new Error(`unexpected npc shop watermark row: ${JSON.stringify(shopWatermarkRow)}`);
    }

    await seedPlayerWalletFixture(pool, {
      playerId: walletPlayerId,
      runtimeOwnerId: walletRuntimeOwnerId,
      sessionEpoch: 12,
      now: now + 35,
      walletBalance: 20,
    });
    const leasedWalletInstanceId = `instance:${walletPlayerId}:lease`;
    await seedInstanceCatalogFixture(pool, {
      instanceId: leasedWalletInstanceId,
      assignedNodeId: 'node:durable-operation-smoke',
      leaseExpireAt: new Date(Date.now() + 60_000).toISOString(),
      ownershipEpoch: 5,
    });
    let walletFencingRejected = false;
    try {
      await service.mutatePlayerWallet({
        operationId: `${walletOperationId}:wrong-owner`,
        playerId: walletPlayerId,
        expectedRuntimeOwnerId: `${walletRuntimeOwnerId}:stale`,
        expectedSessionEpoch: 12,
        walletType: 'spirit_stone',
        action: 'debit',
        delta: 7,
        nextWalletBalances: buildWalletMutationBalances(13),
      });
    } catch (error) {
      walletFencingRejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!walletFencingRejected) {
      throw new Error('expected stale runtime owner fencing rejection before wallet durable mutation');
    }
    walletFencingRejected = false;
    try {
      await service.mutatePlayerWallet({
        operationId: `${walletOperationId}:wrong-session`,
        playerId: walletPlayerId,
        expectedRuntimeOwnerId: walletRuntimeOwnerId,
        expectedSessionEpoch: 13,
        walletType: 'spirit_stone',
        action: 'debit',
        delta: 7,
        nextWalletBalances: buildWalletMutationBalances(13),
      });
    } catch (error) {
      walletFencingRejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!walletFencingRejected) {
      throw new Error('expected stale session fencing rejection before wallet durable mutation');
    }
    walletFencingRejected = false;
    try {
      await service.mutatePlayerWallet({
        operationId: `${walletOperationId}:wrong-lease`,
        playerId: walletPlayerId,
        expectedRuntimeOwnerId: walletRuntimeOwnerId,
        expectedSessionEpoch: 12,
        expectedInstanceId: leasedWalletInstanceId,
        walletType: 'spirit_stone',
        action: 'debit',
        delta: 7,
        nextWalletBalances: buildWalletMutationBalances(13),
      });
    } catch (error) {
      walletFencingRejected = String(error instanceof Error ? error.message : error).includes('instance_lease_fencing_conflict');
    }
    if (!walletFencingRejected) {
      throw new Error('expected stale instance lease rejection before wallet durable mutation');
    }
    const walletRejectedRows = await fetchRows(
      pool,
      'SELECT wallet_type, balance FROM player_wallet WHERE player_id = $1 ORDER BY wallet_type ASC',
      [walletPlayerId],
    );
    if (
      walletRejectedRows.length !== 1
      || walletRejectedRows[0]?.wallet_type !== 'spirit_stone'
      || Number(walletRejectedRows[0]?.balance) !== 20
    ) {
      throw new Error(`unexpected wallet rows after rejected mutation: ${JSON.stringify(walletRejectedRows)}`);
    }
    const walletMutationResult = await service.mutatePlayerWallet({
      operationId: walletOperationId,
      playerId: walletPlayerId,
      expectedRuntimeOwnerId: walletRuntimeOwnerId,
      expectedSessionEpoch: 12,
      walletType: 'spirit_stone',
      action: 'debit',
      delta: 7,
      nextWalletBalances: buildWalletMutationBalances(13),
    });
    if (
      !walletMutationResult.ok
      || walletMutationResult.alreadyCommitted
      || walletMutationResult.walletType !== 'spirit_stone'
      || walletMutationResult.action !== 'debit'
      || walletMutationResult.delta !== 7
    ) {
      throw new Error(`unexpected wallet durable mutation result: ${JSON.stringify(walletMutationResult)}`);
    }
    const walletReplayResult = await service.mutatePlayerWallet({
      operationId: walletOperationId,
      playerId: walletPlayerId,
      expectedRuntimeOwnerId: walletRuntimeOwnerId,
      expectedSessionEpoch: 12,
      walletType: 'spirit_stone',
      action: 'debit',
      delta: 7,
      nextWalletBalances: buildWalletMutationBalances(13),
    });
    if (!walletReplayResult.ok || !walletReplayResult.alreadyCommitted) {
      throw new Error(`unexpected wallet replay durable mutation result: ${JSON.stringify(walletReplayResult)}`);
    }
    const committedWalletMutationRows = await fetchRows(
      pool,
      'SELECT wallet_type, balance FROM player_wallet WHERE player_id = $1 ORDER BY wallet_type ASC',
      [walletPlayerId],
    );
    const walletOperationRow = await fetchSingleRow(
      pool,
      'SELECT status, committed_at FROM durable_operation_log WHERE operation_id = $1',
      [walletOperationId],
    );
    const walletOutboxRows = await fetchRows(
      pool,
      'SELECT topic, status FROM outbox_event WHERE operation_id = $1 ORDER BY event_id ASC',
      [walletOperationId],
    );
    const walletAuditRows = await fetchRows(
      pool,
      'SELECT asset_type, action, asset_ref_id FROM asset_audit_log WHERE operation_id = $1 ORDER BY log_id ASC',
      [walletOperationId],
    );
    const walletWatermarkRow = await fetchSingleRow(
      pool,
      'SELECT wallet_version FROM player_recovery_watermark WHERE player_id = $1',
      [walletPlayerId],
    );
    if (!walletOperationRow || walletOperationRow.status !== 'committed' || !walletOperationRow.committed_at) {
      throw new Error(`unexpected wallet durable operation row: ${JSON.stringify(walletOperationRow)}`);
    }
    if (
      committedWalletMutationRows.length !== 1
      || committedWalletMutationRows[0]?.wallet_type !== 'spirit_stone'
      || Number(committedWalletMutationRows[0]?.balance) !== 13
    ) {
      throw new Error(`unexpected wallet rows after mutation: ${JSON.stringify(committedWalletMutationRows)}`);
    }
    if (
      walletOutboxRows.length !== 1
      || walletOutboxRows[0]?.topic !== 'player.wallet.updated'
      || walletOutboxRows[0]?.status !== 'ready'
    ) {
      throw new Error(`unexpected wallet outbox rows: ${JSON.stringify(walletOutboxRows)}`);
    }
    if (
      walletAuditRows.length !== 1
      || walletAuditRows[0]?.asset_type !== 'wallet'
      || walletAuditRows[0]?.action !== 'debit'
      || walletAuditRows[0]?.asset_ref_id !== 'spirit_stone'
    ) {
      throw new Error(`unexpected wallet audit rows: ${JSON.stringify(walletAuditRows)}`);
    }
    if (!walletWatermarkRow || Number(walletWatermarkRow.wallet_version) <= 0) {
      throw new Error(`unexpected wallet watermark row: ${JSON.stringify(walletWatermarkRow)}`);
    }

    await seedEquipmentFixture(pool, {
      playerId: equipPlayerId,
      runtimeOwnerId: equipRuntimeOwnerId,
      sessionEpoch: 13,
      now: now + 40,
    });
    const leasedEquipInstanceId = `instance:${equipPlayerId}:lease`;
    await seedInstanceCatalogFixture(pool, {
      instanceId: leasedEquipInstanceId,
      assignedNodeId: 'node:durable-operation-smoke',
      leaseExpireAt: new Date(Date.now() + 60_000).toISOString(),
      ownershipEpoch: 6,
    });
    let equipFencingRejected = false;
    try {
      await service.updateEquipmentLoadout({
        operationId: `${equipOperationId}:wrong-owner`,
        playerId: equipPlayerId,
        expectedRuntimeOwnerId: `${equipRuntimeOwnerId}:stale`,
        expectedSessionEpoch: 13,
        action: 'equip',
        slot: 'weapon',
        nextInventoryItems: [],
        nextEquipmentSlots: buildEquipmentSlots(equipPlayerId),
      });
    } catch (error) {
      equipFencingRejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!equipFencingRejected) {
      throw new Error('expected stale runtime owner fencing rejection before equipment durable update');
    }
    equipFencingRejected = false;
    try {
      await service.updateEquipmentLoadout({
        operationId: `${equipOperationId}:wrong-session`,
        playerId: equipPlayerId,
        expectedRuntimeOwnerId: equipRuntimeOwnerId,
        expectedSessionEpoch: 14,
        action: 'equip',
        slot: 'weapon',
        nextInventoryItems: [],
        nextEquipmentSlots: buildEquipmentSlots(equipPlayerId),
      });
    } catch (error) {
      equipFencingRejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!equipFencingRejected) {
      throw new Error('expected stale session fencing rejection before equipment durable update');
    }
    equipFencingRejected = false;
    try {
      await service.updateEquipmentLoadout({
        operationId: `${equipOperationId}:wrong-lease`,
        playerId: equipPlayerId,
        expectedRuntimeOwnerId: equipRuntimeOwnerId,
        expectedSessionEpoch: 13,
        expectedInstanceId: leasedEquipInstanceId,
        action: 'equip',
        slot: 'weapon',
        nextInventoryItems: [],
        nextEquipmentSlots: buildEquipmentSlots(equipPlayerId),
      });
    } catch (error) {
      equipFencingRejected = String(error instanceof Error ? error.message : error).includes('instance_lease_fencing_conflict');
    }
    if (!equipFencingRejected) {
      throw new Error('expected stale instance lease rejection before equipment durable update');
    }
    const equipRejectedInventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [equipPlayerId],
    );
    const equipRejectedEquipmentRows = await fetchRows(
      pool,
      'SELECT slot_type, item_id FROM player_equipment_slot WHERE player_id = $1 ORDER BY slot_type ASC',
      [equipPlayerId],
    );
    if (
      equipRejectedInventoryRows.length !== 1
      || equipRejectedInventoryRows[0]?.item_id !== 'iron_sword'
      || Number(equipRejectedInventoryRows[0]?.count) !== 1
    ) {
      throw new Error(`unexpected equipment inventory rows after rejected update: ${JSON.stringify(equipRejectedInventoryRows)}`);
    }
    if (equipRejectedEquipmentRows.length !== 0) {
      throw new Error(`unexpected equipment slot rows after rejected update: ${JSON.stringify(equipRejectedEquipmentRows)}`);
    }
    const equipOperationResult = await service.updateEquipmentLoadout({
      operationId: equipOperationId,
      playerId: equipPlayerId,
      expectedRuntimeOwnerId: equipRuntimeOwnerId,
      expectedSessionEpoch: 13,
      action: 'equip',
      slot: 'weapon',
      nextInventoryItems: [],
      nextEquipmentSlots: buildEquipmentSlots(equipPlayerId),
    });
    if (
      !equipOperationResult.ok
      || equipOperationResult.alreadyCommitted
      || equipOperationResult.action !== 'equip'
      || equipOperationResult.slot !== 'weapon'
    ) {
      throw new Error(`unexpected equipment durable update result: ${JSON.stringify(equipOperationResult)}`);
    }
    const equipReplayResult = await service.updateEquipmentLoadout({
      operationId: equipOperationId,
      playerId: equipPlayerId,
      expectedRuntimeOwnerId: equipRuntimeOwnerId,
      expectedSessionEpoch: 13,
      action: 'equip',
      slot: 'weapon',
      nextInventoryItems: [],
      nextEquipmentSlots: buildEquipmentSlots(equipPlayerId),
    });
    if (!equipReplayResult.ok || !equipReplayResult.alreadyCommitted) {
      throw new Error(`unexpected equipment replay durable update result: ${JSON.stringify(equipReplayResult)}`);
    }
    const equipInventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [equipPlayerId],
    );
    const equipEquipmentRows = await fetchRows(
      pool,
      'SELECT slot_type, item_id FROM player_equipment_slot WHERE player_id = $1 ORDER BY slot_type ASC',
      [equipPlayerId],
    );
    const equipOperationRow = await fetchSingleRow(
      pool,
      'SELECT status, committed_at FROM durable_operation_log WHERE operation_id = $1',
      [equipOperationId],
    );
    const equipOutboxRows = await fetchRows(
      pool,
      'SELECT topic, status FROM outbox_event WHERE operation_id = $1 ORDER BY event_id ASC',
      [equipOperationId],
    );
    const equipAuditRows = await fetchRows(
      pool,
      'SELECT asset_type, action FROM asset_audit_log WHERE operation_id = $1 ORDER BY log_id ASC',
      [equipOperationId],
    );
    const equipWatermarkRow = await fetchSingleRow(
      pool,
      'SELECT inventory_version, equipment_version FROM player_recovery_watermark WHERE player_id = $1',
      [equipPlayerId],
    );
    if (!equipOperationRow || equipOperationRow.status !== 'committed' || !equipOperationRow.committed_at) {
      throw new Error(`unexpected equipment durable operation row: ${JSON.stringify(equipOperationRow)}`);
    }
    if (equipInventoryRows.length !== 0) {
      throw new Error(`unexpected equipment inventory rows: ${JSON.stringify(equipInventoryRows)}`);
    }
    if (
      equipEquipmentRows.length !== 1
      || equipEquipmentRows[0]?.slot_type !== 'weapon'
      || equipEquipmentRows[0]?.item_id !== 'iron_sword'
    ) {
      throw new Error(`unexpected equipment slot rows: ${JSON.stringify(equipEquipmentRows)}`);
    }
    if (
      equipOutboxRows.length !== 1
      || equipOutboxRows[0]?.topic !== 'player.equipment.updated'
      || equipOutboxRows[0]?.status !== 'ready'
    ) {
      throw new Error(`unexpected equipment outbox rows: ${JSON.stringify(equipOutboxRows)}`);
    }
    if (
      equipAuditRows.length !== 1
      || equipAuditRows[0]?.asset_type !== 'equipment'
      || equipAuditRows[0]?.action !== 'equip'
    ) {
      throw new Error(`unexpected equipment audit rows: ${JSON.stringify(equipAuditRows)}`);
    }
    if (
      !equipWatermarkRow
      || Number(equipWatermarkRow.inventory_version) <= 0
      || Number(equipWatermarkRow.equipment_version) <= 0
    ) {
      throw new Error(`unexpected equipment watermark row: ${JSON.stringify(equipWatermarkRow)}`);
    }

    await seedActiveJobStartFixture(pool, {
      playerId: activeJobStartPlayerId,
      runtimeOwnerId: activeJobStartRuntimeOwnerId,
      sessionEpoch: 16,
      now: now + 49,
    });
    const leasedActiveJobStartInstanceId = `instance:${activeJobStartPlayerId}:lease`;
    await seedInstanceCatalogFixture(pool, {
      instanceId: leasedActiveJobStartInstanceId,
      assignedNodeId: 'node:durable-operation-smoke',
      leaseExpireAt: new Date(Date.now() + 60_000).toISOString(),
      ownershipEpoch: 6,
    });
    let activeJobStartRejected = false;
    try {
      await service.startActiveJobWithAssets({
        operationId: `${activeJobStartOperationId}:wrong-owner`,
        playerId: activeJobStartPlayerId,
        expectedRuntimeOwnerId: `${activeJobStartRuntimeOwnerId}:stale`,
        expectedSessionEpoch: 16,
        nextInventoryItems: buildActiveJobStartInventoryItems(),
        nextWalletBalances: buildActiveJobStartWalletBalances(),
        nextActiveJob: buildActiveJobSnapshot(activeJobStartPlayerId, {
          jobRunId: `job:${activeJobStartPlayerId}:alchemy:start:1`,
          jobType: 'alchemy',
          jobVersion: 2,
          phase: 'preparing',
          remainingTicks: 8,
        }),
        nextEnhancementRecords: buildActiveJobStartEnhancementRecords(),
      });
    } catch (error) {
      activeJobStartRejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!activeJobStartRejected) {
      throw new Error('expected stale runtime owner fencing rejection before active-job start durable settlement');
    }
    activeJobStartRejected = false;
    try {
      await service.startActiveJobWithAssets({
        operationId: `${activeJobStartOperationId}:wrong-session`,
        playerId: activeJobStartPlayerId,
        expectedRuntimeOwnerId: activeJobStartRuntimeOwnerId,
        expectedSessionEpoch: 17,
        nextInventoryItems: buildActiveJobStartInventoryItems(),
        nextWalletBalances: buildActiveJobStartWalletBalances(),
        nextActiveJob: buildActiveJobSnapshot(activeJobStartPlayerId, {
          jobRunId: `job:${activeJobStartPlayerId}:alchemy:start:1`,
          jobType: 'alchemy',
          jobVersion: 2,
          phase: 'preparing',
          remainingTicks: 8,
        }),
        nextEnhancementRecords: buildActiveJobStartEnhancementRecords(),
      });
    } catch (error) {
      activeJobStartRejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!activeJobStartRejected) {
      throw new Error('expected stale session fencing rejection before active-job start durable settlement');
    }
    activeJobStartRejected = false;
    try {
      await leaseAwareService.startActiveJobWithAssets({
        operationId: `${activeJobStartOperationId}:wrong-lease`,
        playerId: activeJobStartPlayerId,
        expectedRuntimeOwnerId: activeJobStartRuntimeOwnerId,
        expectedSessionEpoch: 16,
        expectedInstanceId: leasedActiveJobStartInstanceId,
        expectedAssignedNodeId: 'node:durable-operation-smoke',
        expectedOwnershipEpoch: 7,
        nextInventoryItems: buildActiveJobStartInventoryItems(),
        nextWalletBalances: buildActiveJobStartWalletBalances(),
        nextActiveJob: buildActiveJobSnapshot(activeJobStartPlayerId, {
          jobRunId: `job:${activeJobStartPlayerId}:alchemy:start:1`,
          jobType: 'alchemy',
          jobVersion: 2,
          phase: 'preparing',
          remainingTicks: 8,
        }),
        nextEnhancementRecords: buildActiveJobStartEnhancementRecords(),
      });
    } catch (error) {
      activeJobStartRejected = String(error instanceof Error ? error.message : error).includes('instance_lease_fencing_conflict');
    }
    if (!activeJobStartRejected) {
      throw new Error('expected stale instance lease rejection before active-job start durable settlement');
    }
    const activeJobStartRejectedInventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [activeJobStartPlayerId],
    );
    const activeJobStartRejectedWalletRows = await fetchRows(
      pool,
      'SELECT wallet_type, balance FROM player_wallet WHERE player_id = $1 ORDER BY wallet_type ASC',
      [activeJobStartPlayerId],
    );
    const activeJobStartRejectedJobRow = await fetchSingleRow(
      pool,
      'SELECT job_run_id FROM player_active_job WHERE player_id = $1',
      [activeJobStartPlayerId],
    );
    const activeJobStartRejectedEnhancementRows = await fetchRows(
      pool,
      'SELECT item_id, highest_level, status FROM player_enhancement_record WHERE player_id = $1 ORDER BY item_id ASC',
      [activeJobStartPlayerId],
    );
    if (
      activeJobStartRejectedInventoryRows.length !== 1
      || activeJobStartRejectedInventoryRows[0]?.item_id !== 'moon_grass'
      || Number(activeJobStartRejectedInventoryRows[0]?.count) !== 3
    ) {
      throw new Error(`unexpected active-job start inventory rows after rejection: ${JSON.stringify(activeJobStartRejectedInventoryRows)}`);
    }
    if (
      activeJobStartRejectedWalletRows.length !== 1
      || activeJobStartRejectedWalletRows[0]?.wallet_type !== 'spirit_stone'
      || Number(activeJobStartRejectedWalletRows[0]?.balance) !== 8
    ) {
      throw new Error(`unexpected active-job start wallet rows after rejection: ${JSON.stringify(activeJobStartRejectedWalletRows)}`);
    }
    if (activeJobStartRejectedJobRow) {
      throw new Error(`unexpected active-job row after rejected start: ${JSON.stringify(activeJobStartRejectedJobRow)}`);
    }
    if (activeJobStartRejectedEnhancementRows.length !== 0) {
      throw new Error(`unexpected active-job start enhancement rows after rejection: ${JSON.stringify(activeJobStartRejectedEnhancementRows)}`);
    }
    const activeJobStartResult = await leaseAwareService.startActiveJobWithAssets({
      operationId: activeJobStartOperationId,
      playerId: activeJobStartPlayerId,
      expectedRuntimeOwnerId: activeJobStartRuntimeOwnerId,
      expectedSessionEpoch: 16,
      expectedInstanceId: leasedActiveJobStartInstanceId,
      expectedAssignedNodeId: 'node:durable-operation-smoke',
      expectedOwnershipEpoch: 6,
      nextInventoryItems: buildActiveJobStartInventoryItems(),
      nextWalletBalances: buildActiveJobStartWalletBalances(),
      nextActiveJob: buildActiveJobSnapshot(activeJobStartPlayerId, {
        jobRunId: `job:${activeJobStartPlayerId}:alchemy:start:1`,
        jobType: 'alchemy',
        jobVersion: 2,
        phase: 'preparing',
        remainingTicks: 8,
      }),
      nextEnhancementRecords: buildActiveJobStartEnhancementRecords(),
    });
    if (
      !activeJobStartResult.ok
      || activeJobStartResult.alreadyCommitted
      || activeJobStartResult.jobRunId !== `job:${activeJobStartPlayerId}:alchemy:start:1`
      || activeJobStartResult.jobVersion !== 2
    ) {
      throw new Error(`unexpected active-job start durable result: ${JSON.stringify(activeJobStartResult)}`);
    }
    const activeJobStartReplayResult = await leaseAwareService.startActiveJobWithAssets({
      operationId: activeJobStartOperationId,
      playerId: activeJobStartPlayerId,
      expectedRuntimeOwnerId: activeJobStartRuntimeOwnerId,
      expectedSessionEpoch: 16,
      expectedInstanceId: leasedActiveJobStartInstanceId,
      expectedAssignedNodeId: 'node:durable-operation-smoke',
      expectedOwnershipEpoch: 6,
      nextInventoryItems: buildActiveJobStartInventoryItems(),
      nextWalletBalances: buildActiveJobStartWalletBalances(),
      nextActiveJob: buildActiveJobSnapshot(activeJobStartPlayerId, {
        jobRunId: `job:${activeJobStartPlayerId}:alchemy:start:1`,
        jobType: 'alchemy',
        jobVersion: 2,
        phase: 'preparing',
        remainingTicks: 8,
      }),
      nextEnhancementRecords: buildActiveJobStartEnhancementRecords(),
    });
    if (!activeJobStartReplayResult.ok || !activeJobStartReplayResult.alreadyCommitted) {
      throw new Error(`unexpected active-job start replay result: ${JSON.stringify(activeJobStartReplayResult)}`);
    }
    const activeJobStartInventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [activeJobStartPlayerId],
    );
    const activeJobStartWalletRows = await fetchRows(
      pool,
      'SELECT wallet_type, balance FROM player_wallet WHERE player_id = $1 ORDER BY wallet_type ASC',
      [activeJobStartPlayerId],
    );
    const activeJobStartRow = await fetchSingleRow(
      pool,
      'SELECT job_run_id, job_type, job_version, phase, remaining_ticks FROM player_active_job WHERE player_id = $1',
      [activeJobStartPlayerId],
    );
    const activeJobStartEnhancementRows = await fetchRows(
      pool,
      'SELECT item_id, highest_level, status FROM player_enhancement_record WHERE player_id = $1 ORDER BY item_id ASC',
      [activeJobStartPlayerId],
    );
    const activeJobStartOperationRow = await fetchSingleRow(
      pool,
      'SELECT status, committed_at FROM durable_operation_log WHERE operation_id = $1',
      [activeJobStartOperationId],
    );
    const activeJobStartOutboxRows = await fetchRows(
      pool,
      'SELECT topic, status FROM outbox_event WHERE operation_id = $1 ORDER BY event_id ASC',
      [activeJobStartOperationId],
    );
    const activeJobStartAuditRows = await fetchRows(
      pool,
      'SELECT asset_type, action FROM asset_audit_log WHERE operation_id = $1 ORDER BY log_id ASC',
      [activeJobStartOperationId],
    );
    const activeJobStartWatermarkRow = await fetchSingleRow(
      pool,
      'SELECT inventory_version, wallet_version, active_job_version, enhancement_record_version FROM player_recovery_watermark WHERE player_id = $1',
      [activeJobStartPlayerId],
    );
    if (
      activeJobStartInventoryRows.length !== 1
      || activeJobStartInventoryRows[0]?.item_id !== 'moon_grass'
      || Number(activeJobStartInventoryRows[0]?.count) !== 1
    ) {
      throw new Error(`unexpected active-job start inventory rows: ${JSON.stringify(activeJobStartInventoryRows)}`);
    }
    if (
      activeJobStartWalletRows.length !== 1
      || activeJobStartWalletRows[0]?.wallet_type !== 'spirit_stone'
      || Number(activeJobStartWalletRows[0]?.balance) !== 6
    ) {
      throw new Error(`unexpected active-job start wallet rows: ${JSON.stringify(activeJobStartWalletRows)}`);
    }
    if (
      !activeJobStartRow
      || activeJobStartRow.job_run_id !== `job:${activeJobStartPlayerId}:alchemy:start:1`
      || activeJobStartRow.job_type !== 'alchemy'
      || Number(activeJobStartRow.job_version) !== 2
      || activeJobStartRow.phase !== 'preparing'
      || Number(activeJobStartRow.remaining_ticks) !== 8
    ) {
      throw new Error(`unexpected active-job start row: ${JSON.stringify(activeJobStartRow)}`);
    }
    if (
      activeJobStartEnhancementRows.length !== 1
      || activeJobStartEnhancementRows[0]?.item_id !== 'iron_sword'
      || Number(activeJobStartEnhancementRows[0]?.highest_level) !== 1
      || activeJobStartEnhancementRows[0]?.status !== 'running'
    ) {
      throw new Error(`unexpected active-job start enhancement rows: ${JSON.stringify(activeJobStartEnhancementRows)}`);
    }
    if (!activeJobStartOperationRow || activeJobStartOperationRow.status !== 'committed' || !activeJobStartOperationRow.committed_at) {
      throw new Error(`unexpected active-job start durable operation row: ${JSON.stringify(activeJobStartOperationRow)}`);
    }
    if (
      activeJobStartOutboxRows.length !== 1
      || activeJobStartOutboxRows[0]?.topic !== 'player.active_job.started'
      || activeJobStartOutboxRows[0]?.status !== 'ready'
    ) {
      throw new Error(`unexpected active-job start outbox rows: ${JSON.stringify(activeJobStartOutboxRows)}`);
    }
    if (
      activeJobStartAuditRows.length !== 1
      || activeJobStartAuditRows[0]?.asset_type !== 'active_job'
      || activeJobStartAuditRows[0]?.action !== 'start'
    ) {
      throw new Error(`unexpected active-job start audit rows: ${JSON.stringify(activeJobStartAuditRows)}`);
    }
    if (
      !activeJobStartWatermarkRow
      || Number(activeJobStartWatermarkRow.inventory_version) <= 0
      || Number(activeJobStartWatermarkRow.wallet_version) <= 0
      || Number(activeJobStartWatermarkRow.active_job_version) <= 0
      || Number(activeJobStartWatermarkRow.enhancement_record_version) <= 0
    ) {
      throw new Error(`unexpected active-job start watermark row: ${JSON.stringify(activeJobStartWatermarkRow)}`);
    }

    await seedActiveJobCancelFixture(pool, {
      playerId: activeJobCancelPlayerId,
      runtimeOwnerId: activeJobCancelRuntimeOwnerId,
      sessionEpoch: 17,
      now: now + 50,
    });
    await seedInstanceCatalogFixture(pool, {
      instanceId: leasedActiveJobCancelInstanceId,
      assignedNodeId: 'node:durable-operation-smoke',
      leaseExpireAt: new Date(Date.now() + 60_000).toISOString(),
      ownershipEpoch: 7,
    });
    let activeJobCancelRejected = false;
    try {
      await service.cancelActiveJobWithAssets({
        operationId: `${activeJobCancelOperationId}:wrong-owner`,
        playerId: activeJobCancelPlayerId,
        expectedRuntimeOwnerId: `${activeJobCancelRuntimeOwnerId}:stale`,
        expectedSessionEpoch: 17,
        expectedJobRunId: `job:${activeJobCancelPlayerId}:alchemy:cancel:1`,
        expectedJobVersion: 4,
        nextInventoryItems: buildActiveJobCancelInventoryItems(),
        nextWalletBalances: buildActiveJobCancelWalletBalances(),
        nextEquipmentSlots: buildActiveJobCancelEquipmentSlots(),
        nextEnhancementRecords: buildActiveJobCancelEnhancementRecords(),
      });
    } catch (error) {
      activeJobCancelRejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!activeJobCancelRejected) {
      throw new Error('expected stale runtime owner fencing rejection before active-job cancel durable settlement');
    }
    activeJobCancelRejected = false;
    try {
      await service.cancelActiveJobWithAssets({
        operationId: `${activeJobCancelOperationId}:wrong-session`,
        playerId: activeJobCancelPlayerId,
        expectedRuntimeOwnerId: activeJobCancelRuntimeOwnerId,
        expectedSessionEpoch: 18,
        expectedJobRunId: `job:${activeJobCancelPlayerId}:alchemy:cancel:1`,
        expectedJobVersion: 4,
        nextInventoryItems: buildActiveJobCancelInventoryItems(),
        nextWalletBalances: buildActiveJobCancelWalletBalances(),
        nextEquipmentSlots: buildActiveJobCancelEquipmentSlots(),
        nextEnhancementRecords: buildActiveJobCancelEnhancementRecords(),
      });
    } catch (error) {
      activeJobCancelRejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!activeJobCancelRejected) {
      throw new Error('expected stale session fencing rejection before active-job cancel durable settlement');
    }
    activeJobCancelRejected = false;
    try {
      await leaseAwareService.cancelActiveJobWithAssets({
        operationId: `${activeJobCancelOperationId}:wrong-lease`,
        playerId: activeJobCancelPlayerId,
        expectedRuntimeOwnerId: activeJobCancelRuntimeOwnerId,
        expectedSessionEpoch: 17,
        expectedInstanceId: leasedActiveJobCancelInstanceId,
        expectedAssignedNodeId: 'node:durable-operation-smoke',
        expectedOwnershipEpoch: 8,
        expectedJobRunId: `job:${activeJobCancelPlayerId}:alchemy:cancel:1`,
        expectedJobVersion: 4,
        nextInventoryItems: buildActiveJobCancelInventoryItems(),
        nextWalletBalances: buildActiveJobCancelWalletBalances(),
        nextEquipmentSlots: buildActiveJobCancelEquipmentSlots(),
        nextEnhancementRecords: buildActiveJobCancelEnhancementRecords(),
      });
    } catch (error) {
      activeJobCancelRejected = String(error instanceof Error ? error.message : error).includes('instance_lease_fencing_conflict');
    }
    if (!activeJobCancelRejected) {
      throw new Error('expected stale instance lease rejection before active-job cancel durable settlement');
    }
    const activeJobCancelRejectedInventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [activeJobCancelPlayerId],
    );
    const activeJobCancelRejectedWalletRows = await fetchRows(
      pool,
      'SELECT wallet_type, balance FROM player_wallet WHERE player_id = $1 ORDER BY wallet_type ASC',
      [activeJobCancelPlayerId],
    );
    const activeJobCancelRejectedJobRow = await fetchSingleRow(
      pool,
      'SELECT job_run_id, job_version FROM player_active_job WHERE player_id = $1',
      [activeJobCancelPlayerId],
    );
    const activeJobCancelRejectedEquipmentRows = await fetchRows(
      pool,
      'SELECT slot_type, item_id FROM player_equipment_slot WHERE player_id = $1 ORDER BY slot_type ASC',
      [activeJobCancelPlayerId],
    );
    const activeJobCancelRejectedEnhancementRows = await fetchRows(
      pool,
      'SELECT item_id, highest_level, status FROM player_enhancement_record WHERE player_id = $1 ORDER BY item_id ASC',
      [activeJobCancelPlayerId],
    );
    if (activeJobCancelRejectedInventoryRows.length !== 0) {
      throw new Error(`unexpected active-job cancel inventory rows after rejection: ${JSON.stringify(activeJobCancelRejectedInventoryRows)}`);
    }
    if (
      activeJobCancelRejectedWalletRows.length !== 1
      || activeJobCancelRejectedWalletRows[0]?.wallet_type !== 'spirit_stone'
      || Number(activeJobCancelRejectedWalletRows[0]?.balance) !== 0
    ) {
      throw new Error(`unexpected active-job cancel wallet rows after rejection: ${JSON.stringify(activeJobCancelRejectedWalletRows)}`);
    }
    if (
      !activeJobCancelRejectedJobRow
      || activeJobCancelRejectedJobRow.job_run_id !== `job:${activeJobCancelPlayerId}:alchemy:cancel:1`
      || Number(activeJobCancelRejectedJobRow.job_version) !== 4
    ) {
      throw new Error(`unexpected active-job row after rejected cancel: ${JSON.stringify(activeJobCancelRejectedJobRow)}`);
    }
    if (activeJobCancelRejectedEquipmentRows.length !== 0) {
      throw new Error(`unexpected active-job cancel equipment rows after rejection: ${JSON.stringify(activeJobCancelRejectedEquipmentRows)}`);
    }
    if (activeJobCancelRejectedEnhancementRows.length !== 0) {
      throw new Error(`unexpected active-job cancel enhancement rows after rejection: ${JSON.stringify(activeJobCancelRejectedEnhancementRows)}`);
    }
    const activeJobCancelResult = await leaseAwareService.cancelActiveJobWithAssets({
      operationId: activeJobCancelOperationId,
      playerId: activeJobCancelPlayerId,
      expectedRuntimeOwnerId: activeJobCancelRuntimeOwnerId,
      expectedSessionEpoch: 17,
      expectedInstanceId: leasedActiveJobCancelInstanceId,
      expectedAssignedNodeId: 'node:durable-operation-smoke',
      expectedOwnershipEpoch: 7,
      expectedJobRunId: `job:${activeJobCancelPlayerId}:alchemy:cancel:1`,
      expectedJobVersion: 4,
      nextInventoryItems: buildActiveJobCancelInventoryItems(),
      nextWalletBalances: buildActiveJobCancelWalletBalances(),
      nextEquipmentSlots: buildActiveJobCancelEquipmentSlots(),
      nextEnhancementRecords: buildActiveJobCancelEnhancementRecords(),
    });
    if (!activeJobCancelResult.ok || activeJobCancelResult.alreadyCommitted || activeJobCancelResult.jobRunId !== null || activeJobCancelResult.jobVersion !== null) {
      throw new Error(`unexpected active-job cancel durable result: ${JSON.stringify(activeJobCancelResult)}`);
    }
    const activeJobCancelReplayResult = await leaseAwareService.cancelActiveJobWithAssets({
      operationId: activeJobCancelOperationId,
      playerId: activeJobCancelPlayerId,
      expectedRuntimeOwnerId: activeJobCancelRuntimeOwnerId,
      expectedSessionEpoch: 17,
      expectedInstanceId: leasedActiveJobCancelInstanceId,
      expectedAssignedNodeId: 'node:durable-operation-smoke',
      expectedOwnershipEpoch: 7,
      expectedJobRunId: `job:${activeJobCancelPlayerId}:alchemy:cancel:1`,
      expectedJobVersion: 4,
      nextInventoryItems: buildActiveJobCancelInventoryItems(),
      nextWalletBalances: buildActiveJobCancelWalletBalances(),
      nextEquipmentSlots: buildActiveJobCancelEquipmentSlots(),
      nextEnhancementRecords: buildActiveJobCancelEnhancementRecords(),
    });
    if (!activeJobCancelReplayResult.ok || !activeJobCancelReplayResult.alreadyCommitted) {
      throw new Error(`unexpected active-job cancel replay result: ${JSON.stringify(activeJobCancelReplayResult)}`);
    }
    const activeJobCancelInventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [activeJobCancelPlayerId],
    );
    const activeJobCancelWalletRows = await fetchRows(
      pool,
      'SELECT wallet_type, balance FROM player_wallet WHERE player_id = $1 ORDER BY wallet_type ASC',
      [activeJobCancelPlayerId],
    );
    const activeJobCancelEquipmentRows = await fetchRows(
      pool,
      'SELECT slot_type, item_id FROM player_equipment_slot WHERE player_id = $1 ORDER BY slot_type ASC',
      [activeJobCancelPlayerId],
    );
    const activeJobCancelEnhancementRows = await fetchRows(
      pool,
      'SELECT item_id, highest_level, status FROM player_enhancement_record WHERE player_id = $1 ORDER BY item_id ASC',
      [activeJobCancelPlayerId],
    );
    const activeJobCancelRow = await fetchSingleRow(
      pool,
      'SELECT job_run_id FROM player_active_job WHERE player_id = $1',
      [activeJobCancelPlayerId],
    );
    const activeJobCancelOperationRow = await fetchSingleRow(
      pool,
      'SELECT status, committed_at FROM durable_operation_log WHERE operation_id = $1',
      [activeJobCancelOperationId],
    );
    const activeJobCancelOutboxRows = await fetchRows(
      pool,
      'SELECT topic, status FROM outbox_event WHERE operation_id = $1 ORDER BY event_id ASC',
      [activeJobCancelOperationId],
    );
    const activeJobCancelAuditRows = await fetchRows(
      pool,
      'SELECT asset_type, action FROM asset_audit_log WHERE operation_id = $1 ORDER BY log_id ASC',
      [activeJobCancelOperationId],
    );
    const activeJobCancelWatermarkRow = await fetchSingleRow(
      pool,
      'SELECT inventory_version, wallet_version, equipment_version, active_job_version, enhancement_record_version FROM player_recovery_watermark WHERE player_id = $1',
      [activeJobCancelPlayerId],
    );
    if (
      activeJobCancelInventoryRows.length !== 1
      || activeJobCancelInventoryRows[0]?.item_id !== 'moon_grass'
      || Number(activeJobCancelInventoryRows[0]?.count) !== 4
    ) {
      throw new Error(`unexpected active-job cancel inventory rows: ${JSON.stringify(activeJobCancelInventoryRows)}`);
    }
    if (
      activeJobCancelWalletRows.length !== 1
      || activeJobCancelWalletRows[0]?.wallet_type !== 'spirit_stone'
      || Number(activeJobCancelWalletRows[0]?.balance) !== 2
    ) {
      throw new Error(`unexpected active-job cancel wallet rows: ${JSON.stringify(activeJobCancelWalletRows)}`);
    }
    if (
      activeJobCancelEquipmentRows.length !== 1
      || activeJobCancelEquipmentRows[0]?.slot_type !== 'weapon'
      || activeJobCancelEquipmentRows[0]?.item_id !== 'iron_sword'
    ) {
      throw new Error(`unexpected active-job cancel equipment rows: ${JSON.stringify(activeJobCancelEquipmentRows)}`);
    }
    if (
      activeJobCancelEnhancementRows.length !== 1
      || activeJobCancelEnhancementRows[0]?.item_id !== 'iron_sword'
      || Number(activeJobCancelEnhancementRows[0]?.highest_level) !== 2
      || activeJobCancelEnhancementRows[0]?.status !== 'cancelled'
    ) {
      throw new Error(`unexpected active-job cancel enhancement rows: ${JSON.stringify(activeJobCancelEnhancementRows)}`);
    }
    if (activeJobCancelRow) {
      throw new Error(`unexpected active-job row after durable cancel: ${JSON.stringify(activeJobCancelRow)}`);
    }
    if (!activeJobCancelOperationRow || activeJobCancelOperationRow.status !== 'committed' || !activeJobCancelOperationRow.committed_at) {
      throw new Error(`unexpected active-job cancel durable operation row: ${JSON.stringify(activeJobCancelOperationRow)}`);
    }
    if (
      activeJobCancelOutboxRows.length !== 1
      || activeJobCancelOutboxRows[0]?.topic !== 'player.active_job.cancelled'
      || activeJobCancelOutboxRows[0]?.status !== 'ready'
    ) {
      throw new Error(`unexpected active-job cancel outbox rows: ${JSON.stringify(activeJobCancelOutboxRows)}`);
    }
    if (
      activeJobCancelAuditRows.length !== 1
      || activeJobCancelAuditRows[0]?.asset_type !== 'active_job'
      || activeJobCancelAuditRows[0]?.action !== 'cancel'
    ) {
      throw new Error(`unexpected active-job cancel audit rows: ${JSON.stringify(activeJobCancelAuditRows)}`);
    }
    if (
      !activeJobCancelWatermarkRow
      || Number(activeJobCancelWatermarkRow.inventory_version) <= 0
      || Number(activeJobCancelWatermarkRow.wallet_version) <= 0
      || Number(activeJobCancelWatermarkRow.equipment_version) <= 0
      || Number(activeJobCancelWatermarkRow.active_job_version) <= 0
      || Number(activeJobCancelWatermarkRow.enhancement_record_version) <= 0
    ) {
      throw new Error(`unexpected active-job cancel watermark row: ${JSON.stringify(activeJobCancelWatermarkRow)}`);
    }

    await seedActiveJobCompleteFixture(pool, {
      playerId: activeJobCompletePlayerId,
      runtimeOwnerId: activeJobCompleteRuntimeOwnerId,
      sessionEpoch: 18,
      now: now + 75,
    });
    await seedInstanceCatalogFixture(pool, {
      instanceId: leasedActiveJobCompleteInstanceId,
      assignedNodeId: 'node:durable-operation-smoke',
      leaseExpireAt: new Date(Date.now() + 60_000).toISOString(),
      ownershipEpoch: 9,
    });
    let activeJobCompleteRejected = false;
    try {
      await service.completeActiveJobWithAssets({
        operationId: `${activeJobCompleteOperationId}:wrong-owner`,
        playerId: activeJobCompletePlayerId,
        expectedRuntimeOwnerId: `${activeJobCompleteRuntimeOwnerId}:stale`,
        expectedSessionEpoch: 18,
        expectedJobRunId: `job:${activeJobCompletePlayerId}:alchemy:complete:1`,
        expectedJobVersion: 8,
        nextInventoryItems: buildActiveJobCompleteInventoryItems(),
        nextWalletBalances: buildActiveJobCompleteWalletBalances(),
        nextEnhancementRecords: buildActiveJobCompleteEnhancementRecords(),
      });
    } catch (error) {
      activeJobCompleteRejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!activeJobCompleteRejected) {
      throw new Error('expected stale runtime owner fencing rejection before active-job complete durable settlement');
    }
    activeJobCompleteRejected = false;
    try {
      await service.completeActiveJobWithAssets({
        operationId: `${activeJobCompleteOperationId}:wrong-session`,
        playerId: activeJobCompletePlayerId,
        expectedRuntimeOwnerId: activeJobCompleteRuntimeOwnerId,
        expectedSessionEpoch: 19,
        expectedJobRunId: `job:${activeJobCompletePlayerId}:alchemy:complete:1`,
        expectedJobVersion: 8,
        nextInventoryItems: buildActiveJobCompleteInventoryItems(),
        nextWalletBalances: buildActiveJobCompleteWalletBalances(),
        nextEnhancementRecords: buildActiveJobCompleteEnhancementRecords(),
      });
    } catch (error) {
      activeJobCompleteRejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!activeJobCompleteRejected) {
      throw new Error('expected stale session fencing rejection before active-job complete durable settlement');
    }
    activeJobCompleteRejected = false;
    try {
      await leaseAwareService.completeActiveJobWithAssets({
        operationId: `${activeJobCompleteOperationId}:wrong-lease`,
        playerId: activeJobCompletePlayerId,
        expectedRuntimeOwnerId: activeJobCompleteRuntimeOwnerId,
        expectedSessionEpoch: 18,
        expectedInstanceId: leasedActiveJobCompleteInstanceId,
        expectedAssignedNodeId: 'node:durable-operation-smoke',
        expectedOwnershipEpoch: 10,
        expectedJobRunId: `job:${activeJobCompletePlayerId}:alchemy:complete:1`,
        expectedJobVersion: 8,
        nextInventoryItems: buildActiveJobCompleteInventoryItems(),
        nextWalletBalances: buildActiveJobCompleteWalletBalances(),
        nextEnhancementRecords: buildActiveJobCompleteEnhancementRecords(),
      });
    } catch (error) {
      activeJobCompleteRejected = String(error instanceof Error ? error.message : error).includes('instance_lease_fencing_conflict');
    }
    if (!activeJobCompleteRejected) {
      throw new Error('expected stale instance lease rejection before active-job complete durable settlement');
    }
    let activeJobCompleteCasRejected = false;
    try {
      await service.completeActiveJobWithAssets({
        operationId: `${activeJobCompleteOperationId}:wrong-version`,
        playerId: activeJobCompletePlayerId,
        expectedRuntimeOwnerId: activeJobCompleteRuntimeOwnerId,
        expectedSessionEpoch: 18,
        expectedJobRunId: `job:${activeJobCompletePlayerId}:alchemy:complete:1`,
        expectedJobVersion: 7,
        nextInventoryItems: buildActiveJobCompleteInventoryItems(),
        nextWalletBalances: buildActiveJobCompleteWalletBalances(),
        nextEnhancementRecords: buildActiveJobCompleteEnhancementRecords(),
      });
    } catch (error) {
      activeJobCompleteCasRejected = String(error instanceof Error ? error.message : error).includes('player_active_job_cas_conflict');
    }
    if (!activeJobCompleteCasRejected) {
      throw new Error('expected stale job version cas rejection before active-job complete durable settlement');
    }
    const activeJobCompleteRejectedInventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [activeJobCompletePlayerId],
    );
    const activeJobCompleteRejectedWalletRows = await fetchRows(
      pool,
      'SELECT wallet_type, balance FROM player_wallet WHERE player_id = $1 ORDER BY wallet_type ASC',
      [activeJobCompletePlayerId],
    );
    const activeJobCompleteRejectedJobRow = await fetchSingleRow(
      pool,
      'SELECT job_run_id, job_version FROM player_active_job WHERE player_id = $1',
      [activeJobCompletePlayerId],
    );
    const activeJobCompleteRejectedEnhancementRows = await fetchRows(
      pool,
      'SELECT item_id, highest_level, status FROM player_enhancement_record WHERE player_id = $1 ORDER BY item_id ASC',
      [activeJobCompletePlayerId],
    );
    if (activeJobCompleteRejectedInventoryRows.length !== 0) {
      throw new Error(`unexpected active-job complete inventory rows after rejection: ${JSON.stringify(activeJobCompleteRejectedInventoryRows)}`);
    }
    if (
      activeJobCompleteRejectedWalletRows.length !== 1
      || activeJobCompleteRejectedWalletRows[0]?.wallet_type !== 'spirit_stone'
      || Number(activeJobCompleteRejectedWalletRows[0]?.balance) !== 6
    ) {
      throw new Error(`unexpected active-job complete wallet rows after rejection: ${JSON.stringify(activeJobCompleteRejectedWalletRows)}`);
    }
    if (
      !activeJobCompleteRejectedJobRow
      || activeJobCompleteRejectedJobRow.job_run_id !== `job:${activeJobCompletePlayerId}:alchemy:complete:1`
      || Number(activeJobCompleteRejectedJobRow.job_version) !== 8
    ) {
      throw new Error(`unexpected active-job row after rejected complete: ${JSON.stringify(activeJobCompleteRejectedJobRow)}`);
    }
    if (activeJobCompleteRejectedEnhancementRows.length !== 0) {
      throw new Error(`unexpected active-job complete enhancement rows after rejection: ${JSON.stringify(activeJobCompleteRejectedEnhancementRows)}`);
    }
    const activeJobCompleteResult = await leaseAwareService.completeActiveJobWithAssets({
      operationId: activeJobCompleteOperationId,
      playerId: activeJobCompletePlayerId,
      expectedRuntimeOwnerId: activeJobCompleteRuntimeOwnerId,
      expectedSessionEpoch: 18,
      expectedInstanceId: leasedActiveJobCompleteInstanceId,
      expectedAssignedNodeId: 'node:durable-operation-smoke',
      expectedOwnershipEpoch: 9,
      expectedJobRunId: `job:${activeJobCompletePlayerId}:alchemy:complete:1`,
      expectedJobVersion: 8,
      nextInventoryItems: buildActiveJobCompleteInventoryItems(),
      nextWalletBalances: buildActiveJobCompleteWalletBalances(),
      nextEnhancementRecords: buildActiveJobCompleteEnhancementRecords(),
    });
    if (!activeJobCompleteResult.ok || activeJobCompleteResult.alreadyCommitted || activeJobCompleteResult.jobRunId !== null || activeJobCompleteResult.jobVersion !== null) {
      throw new Error(`unexpected active-job complete durable result: ${JSON.stringify(activeJobCompleteResult)}`);
    }
    const activeJobCompleteReplayResult = await leaseAwareService.completeActiveJobWithAssets({
      operationId: activeJobCompleteOperationId,
      playerId: activeJobCompletePlayerId,
      expectedRuntimeOwnerId: activeJobCompleteRuntimeOwnerId,
      expectedSessionEpoch: 18,
      expectedInstanceId: leasedActiveJobCompleteInstanceId,
      expectedAssignedNodeId: 'node:durable-operation-smoke',
      expectedOwnershipEpoch: 9,
      expectedJobRunId: `job:${activeJobCompletePlayerId}:alchemy:complete:1`,
      expectedJobVersion: 8,
      nextInventoryItems: buildActiveJobCompleteInventoryItems(),
      nextWalletBalances: buildActiveJobCompleteWalletBalances(),
      nextEnhancementRecords: buildActiveJobCompleteEnhancementRecords(),
    });
    if (!activeJobCompleteReplayResult.ok || !activeJobCompleteReplayResult.alreadyCommitted) {
      throw new Error(`unexpected active-job complete replay result: ${JSON.stringify(activeJobCompleteReplayResult)}`);
    }
    const activeJobCompleteInventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [activeJobCompletePlayerId],
    );
    const activeJobCompleteWalletRows = await fetchRows(
      pool,
      'SELECT wallet_type, balance FROM player_wallet WHERE player_id = $1 ORDER BY wallet_type ASC',
      [activeJobCompletePlayerId],
    );
    const activeJobCompleteRow = await fetchSingleRow(
      pool,
      'SELECT job_run_id FROM player_active_job WHERE player_id = $1',
      [activeJobCompletePlayerId],
    );
    const activeJobCompleteEnhancementRows = await fetchRows(
      pool,
      'SELECT item_id, highest_level, status FROM player_enhancement_record WHERE player_id = $1 ORDER BY item_id ASC',
      [activeJobCompletePlayerId],
    );
    const activeJobCompleteOperationRow = await fetchSingleRow(
      pool,
      'SELECT status, committed_at FROM durable_operation_log WHERE operation_id = $1',
      [activeJobCompleteOperationId],
    );
    const activeJobCompleteOutboxRows = await fetchRows(
      pool,
      'SELECT topic, status FROM outbox_event WHERE operation_id = $1 ORDER BY event_id ASC',
      [activeJobCompleteOperationId],
    );
    const activeJobCompleteAuditRows = await fetchRows(
      pool,
      'SELECT asset_type, action FROM asset_audit_log WHERE operation_id = $1 ORDER BY log_id ASC',
      [activeJobCompleteOperationId],
    );
    const activeJobCompleteWatermarkRow = await fetchSingleRow(
      pool,
      'SELECT inventory_version, wallet_version, active_job_version, enhancement_record_version FROM player_recovery_watermark WHERE player_id = $1',
      [activeJobCompletePlayerId],
    );
    if (
      activeJobCompleteInventoryRows.length !== 1
      || activeJobCompleteInventoryRows[0]?.item_id !== 'qi_pill'
      || Number(activeJobCompleteInventoryRows[0]?.count) !== 1
    ) {
      throw new Error(`unexpected active-job complete inventory rows: ${JSON.stringify(activeJobCompleteInventoryRows)}`);
    }
    if (
      activeJobCompleteWalletRows.length !== 1
      || activeJobCompleteWalletRows[0]?.wallet_type !== 'spirit_stone'
      || Number(activeJobCompleteWalletRows[0]?.balance) !== 6
    ) {
      throw new Error(`unexpected active-job complete wallet rows: ${JSON.stringify(activeJobCompleteWalletRows)}`);
    }
    if (activeJobCompleteRow) {
      throw new Error(`unexpected active-job row after durable complete: ${JSON.stringify(activeJobCompleteRow)}`);
    }
    if (
      activeJobCompleteEnhancementRows.length !== 1
      || activeJobCompleteEnhancementRows[0]?.item_id !== 'iron_sword'
      || Number(activeJobCompleteEnhancementRows[0]?.highest_level) !== 3
      || activeJobCompleteEnhancementRows[0]?.status !== 'completed'
    ) {
      throw new Error(`unexpected active-job complete enhancement rows: ${JSON.stringify(activeJobCompleteEnhancementRows)}`);
    }
    if (!activeJobCompleteOperationRow || activeJobCompleteOperationRow.status !== 'committed' || !activeJobCompleteOperationRow.committed_at) {
      throw new Error(`unexpected active-job complete durable operation row: ${JSON.stringify(activeJobCompleteOperationRow)}`);
    }
    if (
      activeJobCompleteOutboxRows.length !== 1
      || activeJobCompleteOutboxRows[0]?.topic !== 'player.active_job.completed'
      || activeJobCompleteOutboxRows[0]?.status !== 'ready'
    ) {
      throw new Error(`unexpected active-job complete outbox rows: ${JSON.stringify(activeJobCompleteOutboxRows)}`);
    }
    if (
      activeJobCompleteAuditRows.length !== 1
      || activeJobCompleteAuditRows[0]?.asset_type !== 'active_job'
      || activeJobCompleteAuditRows[0]?.action !== 'complete'
    ) {
      throw new Error(`unexpected active-job complete audit rows: ${JSON.stringify(activeJobCompleteAuditRows)}`);
    }
    if (
      !activeJobCompleteWatermarkRow
      || Number(activeJobCompleteWatermarkRow.inventory_version) <= 0
      || Number(activeJobCompleteWatermarkRow.wallet_version) <= 0
      || Number(activeJobCompleteWatermarkRow.active_job_version) <= 0
      || Number(activeJobCompleteWatermarkRow.enhancement_record_version) <= 0
    ) {
      throw new Error(`unexpected active-job complete watermark row: ${JSON.stringify(activeJobCompleteWatermarkRow)}`);
    }

    await seedActiveJobFixture(pool, {
      playerId: activeJobPlayerId,
      runtimeOwnerId: activeJobRuntimeOwnerId,
      sessionEpoch: 15,
      now: now + 50,
    });
    const leasedActiveJobInstanceId = `instance:${activeJobPlayerId}:lease`;
    await seedInstanceCatalogFixture(pool, {
      instanceId: leasedActiveJobInstanceId,
      assignedNodeId: 'node:durable-operation-smoke',
      leaseExpireAt: new Date(Date.now() + 60_000).toISOString(),
      ownershipEpoch: 7,
    });
    let activeJobRejected = false;
    try {
      await service.updateActiveJobState({
        operationId: `${activeJobUpdateOperationId}:wrong-owner`,
        playerId: activeJobPlayerId,
        expectedRuntimeOwnerId: `${activeJobRuntimeOwnerId}:stale`,
        expectedSessionEpoch: 15,
        action: 'update',
        expectedJobRunId: `job:${activeJobPlayerId}:alchemy:1`,
        expectedJobVersion: 4,
        nextActiveJob: buildActiveJobSnapshot(activeJobPlayerId, {
          jobRunId: `job:${activeJobPlayerId}:alchemy:1`,
          jobType: 'alchemy',
          jobVersion: 5,
          phase: 'paused',
          remainingTicks: 8,
        }),
      });
    } catch (error) {
      activeJobRejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!activeJobRejected) {
      throw new Error('expected stale runtime owner fencing rejection before active-job durable update');
    }
    activeJobRejected = false;
    try {
      await service.updateActiveJobState({
        operationId: `${activeJobUpdateOperationId}:wrong-session`,
        playerId: activeJobPlayerId,
        expectedRuntimeOwnerId: activeJobRuntimeOwnerId,
        expectedSessionEpoch: 16,
        action: 'update',
        expectedJobRunId: `job:${activeJobPlayerId}:alchemy:1`,
        expectedJobVersion: 4,
        nextActiveJob: buildActiveJobSnapshot(activeJobPlayerId, {
          jobRunId: `job:${activeJobPlayerId}:alchemy:1`,
          jobType: 'alchemy',
          jobVersion: 5,
          phase: 'paused',
          remainingTicks: 8,
        }),
      });
    } catch (error) {
      activeJobRejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!activeJobRejected) {
      throw new Error('expected stale session fencing rejection before active-job durable update');
    }
    activeJobRejected = false;
    try {
      await leaseAwareService.updateActiveJobState({
        operationId: `${activeJobUpdateOperationId}:wrong-lease`,
        playerId: activeJobPlayerId,
        expectedRuntimeOwnerId: activeJobRuntimeOwnerId,
        expectedSessionEpoch: 15,
        expectedInstanceId: leasedActiveJobInstanceId,
        expectedAssignedNodeId: 'node:durable-operation-smoke',
        expectedOwnershipEpoch: 8,
        action: 'update',
        expectedJobRunId: `job:${activeJobPlayerId}:alchemy:1`,
        expectedJobVersion: 4,
        nextActiveJob: buildActiveJobSnapshot(activeJobPlayerId, {
          jobRunId: `job:${activeJobPlayerId}:alchemy:1`,
          jobType: 'alchemy',
          jobVersion: 5,
          phase: 'paused',
          remainingTicks: 8,
        }),
      });
    } catch (error) {
      activeJobRejected = String(error instanceof Error ? error.message : error).includes('instance_lease_fencing_conflict');
    }
    if (!activeJobRejected) {
      throw new Error('expected stale instance lease rejection before active-job durable update');
    }
    let activeJobCasRejected = false;
    try {
      await service.updateActiveJobState({
        operationId: `${activeJobUpdateOperationId}:wrong-version`,
        playerId: activeJobPlayerId,
        expectedRuntimeOwnerId: activeJobRuntimeOwnerId,
        expectedSessionEpoch: 15,
        action: 'update',
        expectedJobRunId: `job:${activeJobPlayerId}:alchemy:1`,
        expectedJobVersion: 3,
        nextActiveJob: buildActiveJobSnapshot(activeJobPlayerId, {
          jobRunId: `job:${activeJobPlayerId}:alchemy:1`,
          jobType: 'alchemy',
          jobVersion: 5,
          phase: 'paused',
          remainingTicks: 8,
        }),
      });
    } catch (error) {
      activeJobCasRejected = String(error instanceof Error ? error.message : error).includes('player_active_job_cas_conflict');
    }
    if (!activeJobCasRejected) {
      throw new Error('expected stale job version cas rejection before active-job durable update');
    }
    const activeJobRejectedRow = await fetchSingleRow(
      pool,
      'SELECT job_run_id, job_type, job_version, phase, remaining_ticks FROM player_active_job WHERE player_id = $1',
      [activeJobPlayerId],
    );
    if (
      !activeJobRejectedRow
      || activeJobRejectedRow.job_run_id !== `job:${activeJobPlayerId}:alchemy:1`
      || activeJobRejectedRow.job_type !== 'alchemy'
      || Number(activeJobRejectedRow.job_version) !== 4
      || activeJobRejectedRow.phase !== 'running'
      || Number(activeJobRejectedRow.remaining_ticks) !== 9
    ) {
      throw new Error(`unexpected active job row after rejected update: ${JSON.stringify(activeJobRejectedRow)}`);
    }
    const activeJobUpdateResult = await leaseAwareService.updateActiveJobState({
      operationId: activeJobUpdateOperationId,
      playerId: activeJobPlayerId,
      expectedRuntimeOwnerId: activeJobRuntimeOwnerId,
      expectedSessionEpoch: 15,
      expectedInstanceId: leasedActiveJobInstanceId,
      expectedAssignedNodeId: 'node:durable-operation-smoke',
      expectedOwnershipEpoch: 7,
      action: 'update',
      expectedJobRunId: `job:${activeJobPlayerId}:alchemy:1`,
      expectedJobVersion: 4,
      nextActiveJob: buildActiveJobSnapshot(activeJobPlayerId, {
        jobRunId: `job:${activeJobPlayerId}:alchemy:1`,
        jobType: 'alchemy',
        jobVersion: 5,
        phase: 'paused',
        remainingTicks: 8,
      }),
    });
    if (
      !activeJobUpdateResult.ok
      || activeJobUpdateResult.alreadyCommitted
      || activeJobUpdateResult.jobRunId !== `job:${activeJobPlayerId}:alchemy:1`
      || activeJobUpdateResult.jobVersion !== 5
    ) {
      throw new Error(`unexpected active-job durable update result: ${JSON.stringify(activeJobUpdateResult)}`);
    }
    const activeJobReplayResult = await leaseAwareService.updateActiveJobState({
      operationId: activeJobUpdateOperationId,
      playerId: activeJobPlayerId,
      expectedRuntimeOwnerId: activeJobRuntimeOwnerId,
      expectedSessionEpoch: 15,
      expectedInstanceId: leasedActiveJobInstanceId,
      expectedAssignedNodeId: 'node:durable-operation-smoke',
      expectedOwnershipEpoch: 7,
      action: 'update',
      expectedJobRunId: `job:${activeJobPlayerId}:alchemy:1`,
      expectedJobVersion: 4,
      nextActiveJob: buildActiveJobSnapshot(activeJobPlayerId, {
        jobRunId: `job:${activeJobPlayerId}:alchemy:1`,
        jobType: 'alchemy',
        jobVersion: 5,
        phase: 'paused',
        remainingTicks: 8,
      }),
    });
    if (!activeJobReplayResult.ok || !activeJobReplayResult.alreadyCommitted) {
      throw new Error(`unexpected active-job replay durable update result: ${JSON.stringify(activeJobReplayResult)}`);
    }
    const activeJobReplaceResult = await leaseAwareService.updateActiveJobState({
      operationId: activeJobReplaceOperationId,
      playerId: activeJobPlayerId,
      expectedRuntimeOwnerId: activeJobRuntimeOwnerId,
      expectedSessionEpoch: 15,
      expectedInstanceId: leasedActiveJobInstanceId,
      expectedAssignedNodeId: 'node:durable-operation-smoke',
      expectedOwnershipEpoch: 7,
      action: 'start',
      expectedJobRunId: `job:${activeJobPlayerId}:alchemy:1`,
      expectedJobVersion: 5,
      nextActiveJob: buildActiveJobSnapshot(activeJobPlayerId, {
        jobRunId: `job:${activeJobPlayerId}:enhancement:2`,
        jobType: 'enhancement',
        jobVersion: 1,
        phase: 'enhancing',
        remainingTicks: 6,
      }),
    });
    if (
      !activeJobReplaceResult.ok
      || activeJobReplaceResult.alreadyCommitted
      || activeJobReplaceResult.jobRunId !== `job:${activeJobPlayerId}:enhancement:2`
      || activeJobReplaceResult.jobVersion !== 1
    ) {
      throw new Error(`unexpected active-job durable replace result: ${JSON.stringify(activeJobReplaceResult)}`);
    }
    let delayedJobRejected = false;
    try {
      await leaseAwareService.updateActiveJobState({
        operationId: `op:${activeJobPlayerId}:active-job:stale-complete:3`,
        playerId: activeJobPlayerId,
        expectedRuntimeOwnerId: activeJobRuntimeOwnerId,
        expectedSessionEpoch: 15,
        expectedInstanceId: leasedActiveJobInstanceId,
        expectedAssignedNodeId: 'node:durable-operation-smoke',
        expectedOwnershipEpoch: 7,
        action: 'complete',
        expectedJobRunId: `job:${activeJobPlayerId}:alchemy:1`,
        expectedJobVersion: 5,
        nextActiveJob: null,
      });
    } catch (error) {
      delayedJobRejected = String(error instanceof Error ? error.message : error).includes('player_active_job_cas_conflict');
    }
    if (!delayedJobRejected) {
      throw new Error('expected stale active-job completion cas rejection after replacement');
    }
    const activeJobRow = await fetchSingleRow(
      pool,
      'SELECT job_run_id, job_type, job_version, phase, remaining_ticks FROM player_active_job WHERE player_id = $1',
      [activeJobPlayerId],
    );
    const activeJobUpdateOperationRow = await fetchSingleRow(
      pool,
      'SELECT status, committed_at FROM durable_operation_log WHERE operation_id = $1',
      [activeJobUpdateOperationId],
    );
    const activeJobReplaceOperationRow = await fetchSingleRow(
      pool,
      'SELECT status, committed_at FROM durable_operation_log WHERE operation_id = $1',
      [activeJobReplaceOperationId],
    );
    const activeJobOutboxRows = await fetchRows(
      pool,
      'SELECT topic, status FROM outbox_event WHERE operation_id = $1 ORDER BY event_id ASC',
      [activeJobReplaceOperationId],
    );
    const activeJobAuditRows = await fetchRows(
      pool,
      'SELECT asset_type, action FROM asset_audit_log WHERE operation_id = $1 ORDER BY log_id ASC',
      [activeJobReplaceOperationId],
    );
    const activeJobWatermarkRow = await fetchSingleRow(
      pool,
      'SELECT active_job_version FROM player_recovery_watermark WHERE player_id = $1',
      [activeJobPlayerId],
    );
    if (
      !activeJobRow
      || activeJobRow.job_run_id !== `job:${activeJobPlayerId}:enhancement:2`
      || activeJobRow.job_type !== 'enhancement'
      || Number(activeJobRow.job_version) !== 1
      || activeJobRow.phase !== 'enhancing'
      || Number(activeJobRow.remaining_ticks) !== 6
    ) {
      throw new Error(`unexpected active job row after replacement: ${JSON.stringify(activeJobRow)}`);
    }
    if (!activeJobUpdateOperationRow || activeJobUpdateOperationRow.status !== 'committed' || !activeJobUpdateOperationRow.committed_at) {
      throw new Error(`unexpected active-job update durable operation row: ${JSON.stringify(activeJobUpdateOperationRow)}`);
    }
    if (!activeJobReplaceOperationRow || activeJobReplaceOperationRow.status !== 'committed' || !activeJobReplaceOperationRow.committed_at) {
      throw new Error(`unexpected active-job replace durable operation row: ${JSON.stringify(activeJobReplaceOperationRow)}`);
    }
    if (
      activeJobOutboxRows.length !== 1
      || activeJobOutboxRows[0]?.topic !== 'player.active_job.updated'
      || activeJobOutboxRows[0]?.status !== 'ready'
    ) {
      throw new Error(`unexpected active-job outbox rows: ${JSON.stringify(activeJobOutboxRows)}`);
    }
    if (
      activeJobAuditRows.length !== 1
      || activeJobAuditRows[0]?.asset_type !== 'active_job'
      || activeJobAuditRows[0]?.action !== 'start'
    ) {
      throw new Error(`unexpected active-job audit rows: ${JSON.stringify(activeJobAuditRows)}`);
    }
    if (!activeJobWatermarkRow || Number(activeJobWatermarkRow.active_job_version) <= 0) {
      throw new Error(`unexpected active-job watermark row: ${JSON.stringify(activeJobWatermarkRow)}`);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          playerId,
          runtimePlayerId,
          answers: 'with-db 下已验证 DurableOperationService 的 runtime_owner_id + session_epoch fencing，以及 mail/market-storage/market-sell-now/market-buy-now/market-cancel/npc-shop/wallet/equipment/active-job-start/active-job-cancel/active-job-complete/active-job-update 十二条强事务链的幂等回放与拒绝回滚；其中 mail 与 market buy/sell/claim/cancel、npc-shop、active-job-start/cancel/complete/update 均已覆盖 instance lease 二次校验，MailRuntimeService 真实领取入口也会走 durable claim 主链并刷新结构化邮箱真源',
          excludes: '不证明真实客户端并发窗口、tick 编排内 mutation intent、GM restore、批量投递或 outbox dispatcher 消费',
          completionMapping: 'replace-ready:proof:with-db.durable-operation',
          firstResult,
          secondResult,
          runtimeResult,
          marketOperationResult,
          marketSellResult,
          marketBuyResult,
          marketCancelResult,
          shopOperationResult,
          walletMutationResult,
          equipOperationResult,
          activeJobStartResult,
          activeJobCancelResult,
          activeJobCompleteResult,
          activeJobUpdateResult,
          activeJobReplaceResult,
          outboxCount: outboxRows.length,
          auditCount: auditRows.length,
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupInstanceCatalog(pool, [
      `instance:${marketPlayerId}:lease`,
      leasedMarketSellInstanceId,
      leasedMarketBuyInstanceId,
      leasedMarketCancelInstanceId,
      leasedActiveJobCancelInstanceId,
      `instance:${shopPlayerId}:lease`,
      runtimeLeaseInstanceId,
    ]).catch(() => undefined);
    await cleanupPlayer(pool, playerId).catch(() => undefined);
    await cleanupPlayer(pool, runtimePlayerId).catch(() => undefined);
    await cleanupPlayer(pool, marketPlayerId).catch(() => undefined);
    await cleanupPlayer(pool, marketSellPlayerId).catch(() => undefined);
    await cleanupPlayer(pool, marketSellBuyerId).catch(() => undefined);
    await cleanupPlayer(pool, marketBuyPlayerId).catch(() => undefined);
    await cleanupPlayer(pool, marketBuySellerId).catch(() => undefined);
    await cleanupPlayer(pool, marketCancelPlayerId).catch(() => undefined);
    await cleanupPlayer(pool, shopPlayerId).catch(() => undefined);
    await cleanupPlayer(pool, walletPlayerId).catch(() => undefined);
    await cleanupPlayer(pool, equipPlayerId).catch(() => undefined);
    await cleanupPlayer(pool, activeJobStartPlayerId).catch(() => undefined);
    await cleanupPlayer(pool, activeJobCancelPlayerId).catch(() => undefined);
    await cleanupPlayer(pool, activeJobPlayerId).catch(() => undefined);
    await pool.end().catch(() => undefined);
    await mailPersistence.onModuleDestroy().catch(() => undefined);
    await leaseAwareService.onModuleDestroy().catch(() => undefined);
    await service.onModuleDestroy().catch(() => undefined);
  }
}

async function seedClaimFixture(
  pool: Pool,
  input: {
    playerId: string;
    runtimeOwnerId: string;
    sessionEpoch: number;
    mailId: string;
    attachmentId: string;
    now: number;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO player_presence(
          player_id,
          online,
          in_world,
          last_heartbeat_at,
          runtime_owner_id,
          session_epoch,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now())
      `,
      [input.playerId, true, true, input.now, input.runtimeOwnerId, input.sessionEpoch],
    );
    await client.query(
      `
        INSERT INTO player_mail(
          mail_id,
          player_id,
          sender_type,
          sender_label,
          mail_type,
          title,
          body,
          metadata_jsonb,
          mail_version,
          created_at,
          updated_at
        )
        VALUES ($1, $2, 'system', 'system', 'system', $3, $4, '{}'::jsonb, 1, $5, now())
      `,
      [input.mailId, input.playerId, 'durable smoke', 'durable smoke body', input.now],
    );
    await client.query(
      `
        INSERT INTO player_mail_attachment(
          attachment_id,
          mail_id,
          player_id,
          attachment_kind,
          item_id,
          count,
          item_payload_jsonb,
          created_at
        )
        VALUES ($1, $2, $3, 'item', 'spirit_stone', 1, $4::jsonb, now())
      `,
      [input.attachmentId, input.mailId, input.playerId, JSON.stringify({ itemId: 'spirit_stone', count: 1 })],
    );
    await client.query(
      `
        INSERT INTO server_player_snapshot(
          player_id,
          template_id,
          instance_id,
          persisted_source,
          saved_at,
          updated_at,
          payload
        )
        VALUES ($1, 'yunlai_town', 'public:yunlai_town', 'native', $2, now(), $3::jsonb)
      `,
      [input.playerId, input.now, JSON.stringify(buildNextSnapshot(input.now))],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function seedMarketClaimFixture(
  pool: Pool,
  input: {
    playerId: string;
    runtimeOwnerId: string;
    sessionEpoch: number;
    now: number;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO player_presence(
          player_id,
          online,
          in_world,
          last_heartbeat_at,
          runtime_owner_id,
          session_epoch,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now())
      `,
      [input.playerId, true, true, input.now, input.runtimeOwnerId, input.sessionEpoch],
    );
    await client.query(
      `
        INSERT INTO player_inventory_item(
          item_instance_id,
          player_id,
          slot_index,
          item_id,
          count,
          raw_payload,
          updated_at
        )
        VALUES ($1, $2, 0, 'spirit_stone', 2, $3::jsonb, now())
      `,
      [
        `inventory:${input.playerId}:0`,
        input.playerId,
        JSON.stringify({ itemId: 'spirit_stone', count: 2 }),
      ],
    );
    await client.query(
      `
        INSERT INTO player_market_storage_item(
          storage_item_id,
          player_id,
          slot_index,
          item_id,
          count,
          enhance_level,
          raw_payload,
          updated_at
        )
        VALUES
          ($1, $2, 0, 'spirit_stone', 7, NULL, $3::jsonb, now()),
          ($4, $2, 1, 'moon_herb', 4, NULL, $5::jsonb, now())
      `,
      [
        `storage:${input.playerId}:0`,
        input.playerId,
        JSON.stringify({ itemId: 'spirit_stone', count: 7 }),
        `storage:${input.playerId}:1`,
        JSON.stringify({ itemId: 'moon_herb', count: 4 }),
      ],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function seedNpcShopFixture(
  pool: Pool,
  input: {
    playerId: string;
    runtimeOwnerId: string;
    sessionEpoch: number;
    now: number;
  },
): Promise<void> {
  return seedNpcShopFixtureImpl(pool, input);
}

async function seedPlayerWalletFixture(
  pool: Pool,
  input: {
    playerId: string;
    runtimeOwnerId: string;
    sessionEpoch: number;
    now: number;
    walletBalance: number;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO player_presence(
          player_id,
          online,
          in_world,
          last_heartbeat_at,
          runtime_owner_id,
          session_epoch,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now())
      `,
      [input.playerId, true, true, input.now, input.runtimeOwnerId, input.sessionEpoch],
    );
    await client.query(
      `
        INSERT INTO player_wallet(
          player_id,
          wallet_type,
          balance,
          frozen_balance,
          version,
          updated_at
        )
        VALUES ($1, 'spirit_stone', $2, 0, 1, now())
      `,
      [input.playerId, Math.max(0, Math.trunc(Number(input.walletBalance ?? 0)))],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function buildNpcShopInventoryItems() {
  return buildNpcShopInventoryItemsImpl();
}

function buildNpcShopWalletBalances() {
  return buildNpcShopWalletBalancesImpl();
}

function buildWalletMutationBalances(balance: number) {
  return [
    {
      walletType: 'spirit_stone',
      balance: Math.max(0, Math.trunc(Number(balance ?? 0))),
      frozenBalance: 0,
      version: 2,
    },
  ];
}

async function seedMarketBuyNowFixture(
  pool: Pool,
  input: {
    buyerId: string;
    buyerRuntimeOwnerId: string;
    buyerSessionEpoch: number;
    sellerId: string;
    now: number;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO player_presence(
          player_id,
          online,
          in_world,
          last_heartbeat_at,
          runtime_owner_id,
          session_epoch,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now())
      `,
      [input.buyerId, true, true, input.now, input.buyerRuntimeOwnerId, input.buyerSessionEpoch],
    );
    await client.query(
      `
        INSERT INTO player_wallet(
          player_id,
          wallet_type,
          balance,
          frozen_balance,
          version,
          updated_at
        )
        VALUES
          ($1, 'spirit_stone', 20, 0, 1, now()),
          ($2, 'spirit_stone', 3, 0, 1, now())
      `,
      [input.buyerId, input.sellerId],
    );
    await client.query(
      `
        INSERT INTO player_inventory_item(
          item_instance_id,
          item_id,
          player_id,
          slot_index,
          count,
          raw_payload,
          updated_at
        )
        VALUES ($1, 'rat_tail', $2, 0, 4, $3::jsonb, now())
      `,
      [
        `inventory:${input.sellerId}:0`,
        input.sellerId,
        JSON.stringify({
          itemId: 'rat_tail',
          itemInstanceId: `inventory:${input.sellerId}:0`,
          count: 4,
        }),
      ],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function seedMarketSellNowFixture(
  pool: Pool,
  input: {
    sellerId: string;
    sellerRuntimeOwnerId: string;
    sellerSessionEpoch: number;
    buyerId: string;
    now: number;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO player_presence(
          player_id,
          online,
          in_world,
          last_heartbeat_at,
          runtime_owner_id,
          session_epoch,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now())
      `,
      [input.sellerId, true, true, input.now, input.sellerRuntimeOwnerId, input.sellerSessionEpoch],
    );
    await client.query(
      `
        INSERT INTO player_wallet(
          player_id,
          wallet_type,
          balance,
          frozen_balance,
          version,
          updated_at
        )
        VALUES ($1, 'spirit_stone', 3, 0, 1, now())
      `,
      [input.sellerId],
    );
    await client.query(
      `
        INSERT INTO player_inventory_item(
          item_instance_id,
          item_id,
          player_id,
          slot_index,
          count,
          raw_payload,
          updated_at
        )
        VALUES ($1, 'rat_tail', $2, 0, 4, $3::jsonb, now())
      `,
      [
        `inventory:${input.sellerId}:0`,
        input.sellerId,
        JSON.stringify({
          itemId: 'rat_tail',
          itemInstanceId: `inventory:${input.sellerId}:0`,
          count: 4,
        }),
      ],
    );
    await client.query(
      `
        INSERT INTO player_wallet(
          player_id,
          wallet_type,
          balance,
          frozen_balance,
          version,
          updated_at
        )
        VALUES ($1, 'spirit_stone', 0, 0, 1, now())
        ON CONFLICT (player_id, wallet_type) DO NOTHING
      `,
      [input.buyerId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function buildMarketSellNowSellerInventoryItems() {
  return [
    {
      itemId: 'rat_tail',
      count: 2,
      rawPayload: {
        itemId: 'rat_tail',
        count: 2,
      },
    },
  ];
}

function buildMarketSellNowSellerWalletBalances() {
  return [
    {
      walletType: 'spirit_stone',
      balance: 9,
      frozenBalance: 0,
      version: 2,
    },
  ];
}

function buildMarketSellNowMatches(buyerId: string) {
  return [
    {
      buyerId,
      tradeQuantity: 2,
      totalCost: 6,
      nextBuyerInventoryItems: [
        {
          itemId: 'rat_tail',
          count: 2,
          rawPayload: {
            itemId: 'rat_tail',
            count: 2,
          },
        },
      ],
    },
  ];
}

function buildMarketBuyNowBuyerInventoryItems() {
  return [
    {
      itemId: 'rat_tail',
      count: 2,
      rawPayload: {
        itemId: 'rat_tail',
        count: 2,
      },
    },
  ];
}

function buildMarketBuyNowBuyerWalletBalances() {
  return [
    {
      walletType: 'spirit_stone',
      balance: 14,
      frozenBalance: 0,
      version: 2,
    },
  ];
}

function buildMarketBuyNowMatches(sellerId: string) {
  return [
    {
      sellerId,
      tradeQuantity: 2,
      totalCost: 6,
      nextSellerInventoryItems: [
        {
          itemId: 'rat_tail',
          count: 2,
          rawPayload: {
            itemId: 'rat_tail',
            count: 2,
          },
        },
      ],
      nextSellerWalletBalances: [
        {
          walletType: 'spirit_stone',
          balance: 9,
          frozenBalance: 0,
          version: 2,
        },
      ],
    },
  ];
}

async function seedMarketCancelFixture(
  pool: Pool,
  input: {
    playerId: string;
    runtimeOwnerId: string;
    sessionEpoch: number;
    now: number;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO player_presence(
          player_id,
          online,
          in_world,
          last_heartbeat_at,
          runtime_owner_id,
          session_epoch,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now())
      `,
      [input.playerId, true, true, input.now, input.runtimeOwnerId, input.sessionEpoch],
    );
    await client.query(
      `
        INSERT INTO player_wallet(
          player_id,
          wallet_type,
          balance,
          frozen_balance,
          version,
          updated_at
        )
        VALUES ($1, 'spirit_stone', 5, 0, 1, now())
      `,
      [input.playerId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function buildMarketCancelSellInventoryItems() {
  return [
    {
      itemId: 'rat_tail',
      count: 2,
      rawPayload: {
        itemId: 'rat_tail',
        count: 2,
      },
    },
  ];
}

function buildMarketCancelWalletBalances() {
  return [
    {
      walletType: 'spirit_stone',
      balance: 5,
      frozenBalance: 0,
      version: 1,
    },
  ];
}

async function seedNpcShopFixtureImpl(
  pool: Pool,
  input: {
    playerId: string;
    runtimeOwnerId: string;
    sessionEpoch: number;
    now: number;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO player_presence(
          player_id,
          online,
          in_world,
          last_heartbeat_at,
          runtime_owner_id,
          session_epoch,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now())
      `,
      [input.playerId, true, true, input.now, input.runtimeOwnerId, input.sessionEpoch],
    );
    await client.query(
      `
        INSERT INTO player_wallet(
          player_id,
          wallet_type,
          balance,
          frozen_balance,
          version,
          updated_at
        )
        VALUES ($1, 'spirit_stone', 20, 0, 1, now())
      `,
      [input.playerId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function buildNextInventoryItems() {
  return [];
}

function buildNextWalletBalances() {
  return [
    {
      walletType: 'spirit_stone',
      balance: 1,
      frozenBalance: 0,
      version: 1,
    },
  ];
}

function buildNpcShopInventoryItemsImpl() {
  return [
    {
      itemId: 'qi_pill',
      count: 2,
      rawPayload: {
        itemId: 'qi_pill',
        count: 2,
      },
    },
  ];
}

function buildNpcShopWalletBalancesImpl() {
  return [
    {
      walletType: 'spirit_stone',
      balance: 10,
      frozenBalance: 0,
      version: 2,
    },
  ];
}

function buildActiveJobStartInventoryItems() {
  return [
    {
      itemId: 'moon_grass',
      count: 1,
      rawPayload: {
        itemId: 'moon_grass',
        count: 1,
      },
    },
  ];
}

function buildActiveJobStartWalletBalances() {
  return [
    {
      walletType: 'spirit_stone',
      balance: 6,
      frozenBalance: 0,
      version: 2,
    },
  ];
}

function buildActiveJobStartEnhancementRecords() {
  return [
    {
      itemId: 'iron_sword',
      highestLevel: 1,
      levels: [],
      actionStartedAt: 100,
      actionEndedAt: null,
      startLevel: 1,
      initialTargetLevel: 2,
      desiredTargetLevel: 2,
      protectionStartLevel: null,
      status: 'running',
    },
  ];
}

function buildActiveJobCancelInventoryItems() {
  return [
    {
      itemId: 'moon_grass',
      count: 4,
      rawPayload: {
        itemId: 'moon_grass',
        count: 4,
      },
    },
  ];
}

function buildActiveJobCancelWalletBalances() {
  return [
    {
      walletType: 'spirit_stone',
      balance: 2,
      frozenBalance: 0,
      version: 2,
    },
  ];
}

function buildActiveJobCancelEnhancementRecords() {
  return [
    {
      itemId: 'iron_sword',
      highestLevel: 2,
      levels: [{ level: 2, success: true }],
      actionStartedAt: 100,
      actionEndedAt: 160,
      startLevel: 1,
      initialTargetLevel: 3,
      desiredTargetLevel: 3,
      protectionStartLevel: null,
      status: 'cancelled',
    },
  ];
}

function buildActiveJobCancelEquipmentSlots() {
  return [
    {
      slot: 'weapon',
      item: {
        itemId: 'iron_sword',
        name: '铁剑',
        count: 1,
        type: 'equipment',
        level: 8,
        enhanceLevel: 1,
      },
    },
    {
      slot: 'armor',
      item: null,
    },
  ];
}

function buildActiveJobCompleteInventoryItems() {
  return [
    {
      itemId: 'qi_pill',
      count: 1,
      rawPayload: {
        itemId: 'qi_pill',
        count: 1,
      },
    },
  ];
}

function buildActiveJobCompleteWalletBalances() {
  return [
    {
      walletType: 'spirit_stone',
      balance: 6,
      frozenBalance: 0,
      version: 2,
    },
  ];
}

function buildActiveJobCompleteEnhancementRecords() {
  return [
    {
      itemId: 'iron_sword',
      highestLevel: 3,
      levels: [{ level: 3, success: true }],
      actionStartedAt: 100,
      actionEndedAt: 180,
      startLevel: 2,
      initialTargetLevel: 3,
      desiredTargetLevel: 3,
      protectionStartLevel: null,
      status: 'completed',
    },
  ];
}

async function seedEquipmentFixture(
  pool: Pool,
  input: {
    playerId: string;
    runtimeOwnerId: string;
    sessionEpoch: number;
    now: number;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO player_presence(
          player_id,
          online,
          in_world,
          last_heartbeat_at,
          runtime_owner_id,
          session_epoch,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now())
      `,
      [input.playerId, true, true, input.now, input.runtimeOwnerId, input.sessionEpoch],
    );
    await client.query(
      `
        INSERT INTO player_inventory_item(
          item_instance_id,
          item_id,
          player_id,
          slot_index,
          count,
          raw_payload,
          updated_at
        )
        VALUES ($1, $2, $3, 0, 1, $4::jsonb, now())
      `,
      [
        `inventory:${input.playerId}:0`,
        'iron_sword',
        input.playerId,
        JSON.stringify({
          itemId: 'iron_sword',
          itemInstanceId: `inventory:${input.playerId}:0`,
          count: 1,
          slot: 'weapon',
        }),
      ],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function buildEquipmentSlots(playerId: string) {
  const itemInstanceId = `inventory:${playerId}:0`;
  return [
    {
      slot: 'weapon',
      itemInstanceId,
      item: {
        itemId: 'iron_sword',
        itemInstanceId,
        count: 1,
        slot: 'weapon',
      },
    },
  ];
}

async function seedActiveJobFixture(
  pool: Pool,
  input: {
    playerId: string;
    runtimeOwnerId: string;
    sessionEpoch: number;
    now: number;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO player_presence(
          player_id,
          online,
          in_world,
          last_heartbeat_at,
          runtime_owner_id,
          session_epoch,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now())
      `,
      [input.playerId, true, true, input.now, input.runtimeOwnerId, input.sessionEpoch],
    );
    const baselineJob = buildActiveJobSnapshot(input.playerId, {
      jobRunId: `job:${input.playerId}:alchemy:1`,
      jobType: 'alchemy',
      jobVersion: 4,
      phase: 'running',
      remainingTicks: 9,
    });
    await client.query(
      `
        INSERT INTO player_active_job(
          player_id,
          job_run_id,
          job_type,
          status,
          phase,
          started_at,
          finished_at,
          paused_ticks,
          total_ticks,
          remaining_ticks,
          success_rate,
          speed_rate,
          job_version,
          detail_jsonb,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, now())
      `,
      [
        input.playerId,
        baselineJob.jobRunId,
        baselineJob.jobType,
        baselineJob.status,
        baselineJob.phase,
        baselineJob.startedAt,
        baselineJob.finishedAt ?? null,
        baselineJob.pausedTicks,
        baselineJob.totalTicks,
        baselineJob.remainingTicks,
        baselineJob.successRate,
        baselineJob.speedRate,
        baselineJob.jobVersion,
        JSON.stringify(baselineJob.detailJson),
      ],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function seedActiveJobStartFixture(
  pool: Pool,
  input: {
    playerId: string;
    runtimeOwnerId: string;
    sessionEpoch: number;
    now: number;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO player_presence(
          player_id,
          online,
          in_world,
          last_heartbeat_at,
          runtime_owner_id,
          session_epoch,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now())
      `,
      [input.playerId, true, true, input.now, input.runtimeOwnerId, input.sessionEpoch],
    );
    await client.query(
      `
        INSERT INTO player_wallet(
          player_id,
          wallet_type,
          balance,
          frozen_balance,
          version,
          updated_at
        )
        VALUES ($1, 'spirit_stone', 8, 0, 1, now())
      `,
      [input.playerId],
    );
    await client.query(
      `
        INSERT INTO player_inventory_item(
          item_instance_id,
          item_id,
          player_id,
          slot_index,
          count,
          raw_payload,
          updated_at
        )
        VALUES ($1, $2, $3, 0, $4, $5::jsonb, now())
      `,
      [
        `inventory:${input.playerId}:0`,
        'moon_grass',
        input.playerId,
        3,
        JSON.stringify({
          itemId: 'moon_grass',
          itemInstanceId: `inventory:${input.playerId}:0`,
          count: 3,
        }),
      ],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function seedActiveJobCancelFixture(
  pool: Pool,
  input: {
    playerId: string;
    runtimeOwnerId: string;
    sessionEpoch: number;
    now: number;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO player_presence(
          player_id,
          online,
          in_world,
          last_heartbeat_at,
          runtime_owner_id,
          session_epoch,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now())
      `,
      [input.playerId, true, true, input.now, input.runtimeOwnerId, input.sessionEpoch],
    );
    await client.query(
      `
        INSERT INTO player_wallet(
          player_id,
          wallet_type,
          balance,
          frozen_balance,
          version,
          updated_at
        )
        VALUES ($1, 'spirit_stone', 0, 0, 1, now())
      `,
      [input.playerId],
    );
    await client.query(
      `
        INSERT INTO player_active_job(
          player_id,
          job_run_id,
          job_type,
          status,
          phase,
          started_at,
          finished_at,
          paused_ticks,
          total_ticks,
          remaining_ticks,
          success_rate,
          speed_rate,
          job_version,
          detail_jsonb,
          updated_at
        )
        VALUES ($1, $2, 'alchemy', 'running', 'paused', $3, null, 2, 12, 6, 1, 1, 4, $4::jsonb, now())
      `,
      [
        input.playerId,
        `job:${input.playerId}:alchemy:cancel:1`,
        input.now - 500,
        JSON.stringify({
          recipeId: 'qi_pill',
          ingredients: [{ itemId: 'moon_grass', count: 2 }],
          quantity: 3,
          completedCount: 1,
          spiritStoneCost: 3,
        }),
      ],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function seedActiveJobCompleteFixture(
  pool: Pool,
  input: {
    playerId: string;
    runtimeOwnerId: string;
    sessionEpoch: number;
    now: number;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO player_presence(
          player_id,
          online,
          in_world,
          last_heartbeat_at,
          runtime_owner_id,
          session_epoch,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now())
      `,
      [input.playerId, true, true, input.now, input.runtimeOwnerId, input.sessionEpoch],
    );
    await client.query(
      `
        INSERT INTO player_wallet(
          player_id,
          wallet_type,
          balance,
          frozen_balance,
          version,
          updated_at
        )
        VALUES ($1, 'spirit_stone', 6, 0, 2, now())
      `,
      [input.playerId],
    );
    await client.query(
      `
        INSERT INTO player_active_job(
          player_id,
          job_run_id,
          job_type,
          status,
          phase,
          started_at,
          finished_at,
          paused_ticks,
          total_ticks,
          remaining_ticks,
          success_rate,
          speed_rate,
          job_version,
          detail_jsonb,
          updated_at
        )
        VALUES ($1, $2, 'alchemy', 'running', 'brewing', $3, null, 0, 8, 1, 1, 1, 8, $4::jsonb, now())
      `,
      [
        input.playerId,
        `job:${input.playerId}:alchemy:complete:1`,
        input.now - 500,
        JSON.stringify({
          recipeId: 'qi_pill',
          outputItemId: 'qi_pill',
          outputCount: 1,
          quantity: 1,
          completedCount: 0,
          spiritStoneCost: 2,
        }),
      ],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function buildActiveJobSnapshot(
  playerId: string,
  options: {
    jobRunId: string;
    jobType: 'alchemy' | 'enhancement';
    jobVersion: number;
    phase: string;
    remainingTicks: number;
  },
) {
  return {
    jobRunId: options.jobRunId,
    jobType: options.jobType,
    status: options.remainingTicks > 0 ? 'running' : 'completed',
    phase: options.phase,
    startedAt: Date.now(),
    finishedAt: options.remainingTicks > 0 ? null : Date.now(),
    pausedTicks: options.phase === 'paused' ? 2 : 0,
    totalTicks: 12,
    remainingTicks: options.remainingTicks,
    successRate: options.jobType === 'alchemy' ? 0.9 : 0.75,
    speedRate: options.jobType === 'alchemy' ? 1.1 : 1.2,
    jobVersion: options.jobVersion,
    detailJson: {
      playerId,
      jobRunId: options.jobRunId,
      jobType: options.jobType,
      jobVersion: options.jobVersion,
      phase: options.phase,
      remainingTicks: options.remainingTicks,
      status: options.remainingTicks > 0 ? 'running' : 'completed',
    },
  };
}

function buildNextSnapshot(now: number, instanceId = 'public:yunlai_town'): PersistedPlayerSnapshot {
  return {
    version: 1,
    savedAt: now + 1,
    placement: {
      instanceId,
      templateId: 'yunlai_town',
      x: 31,
      y: 54,
      facing: 1,
    },
    worldPreference: {
      linePreset: 'peaceful',
    },
    vitals: {
      hp: 100,
      maxHp: 100,
      qi: 0,
      maxQi: 100,
    },
    progression: {
      foundation: 0,
      combatExp: 0,
      bodyTraining: null,
      alchemySkill: null,
      gatherSkill: null,
      gatherJob: null,
      alchemyPresets: [],
      alchemyJob: null,
      enhancementSkill: null,
      enhancementSkillLevel: 1,
      enhancementJob: null,
      enhancementRecords: [],
      boneAgeBaseYears: 18,
      lifeElapsedTicks: 0,
      lifespanYears: null,
      realm: null,
      heavenGate: null,
      spiritualRoots: null,
    },
    unlockedMapIds: ['yunlai_town'],
    inventory: {
      revision: 2,
      capacity: 24,
      items: [],
    },
    wallet: {
      balances: buildNextWalletBalances(),
    },
    equipment: {
      revision: 1,
      slots: [],
    },
    techniques: {
      revision: 1,
      techniques: [],
      cultivatingTechId: null,
    },
    buffs: {
      revision: 1,
      buffs: [],
    },
    quests: {
      revision: 1,
      entries: [],
    },
    combat: {
      autoBattle: false,
      autoRetaliate: true,
      autoBattleStationary: false,
      combatTargetId: null,
      combatTargetLocked: false,
      allowAoePlayerHit: false,
      autoIdleCultivation: true,
      autoSwitchCultivation: false,
      senseQiActive: false,
      autoBattleSkills: [],
    },
    pendingLogbookMessages: [],
    runtimeBonuses: [],
  };
}

async function cleanupPlayer(pool: Pool, playerId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM outbox_event WHERE partition_key = $1 OR operation_id LIKE $2', [playerId, `op:${playerId}:%`]);
    await client.query('DELETE FROM asset_audit_log WHERE player_id = $1 OR operation_id LIKE $2', [playerId, `op:${playerId}:%`]);
    await client.query('DELETE FROM durable_operation_log WHERE player_id = $1 OR operation_id LIKE $2', [playerId, `op:${playerId}:%`]);
    for (const tableName of PLAYER_SCOPED_TABLES.slice(3)) {
      await client.query(`DELETE FROM ${quoteIdentifier(tableName)} WHERE player_id = $1`, [playerId]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function seedInstanceCatalogFixture(
  pool: Pool,
  input: { instanceId: string; assignedNodeId: string; leaseExpireAt: string; ownershipEpoch?: number },
): Promise<void> {
  const ownershipEpoch = Math.max(1, Math.trunc(Number(input.ownershipEpoch ?? 1)));
  await pool.query(
    `
      INSERT INTO instance_catalog(
        instance_id, template_id, instance_type, persistent_policy,
        status, runtime_status, assigned_node_id, lease_token, lease_expire_at,
        ownership_epoch, shard_key, created_at
      )
      VALUES ($1, 'yunlai_town', 'public', 'map', 'active', 'leased', $2, 'lease-token', $3, $4, $1, now())
      ON CONFLICT (instance_id)
      DO UPDATE SET
        assigned_node_id = EXCLUDED.assigned_node_id,
        lease_token = EXCLUDED.lease_token,
        lease_expire_at = EXCLUDED.lease_expire_at,
        ownership_epoch = EXCLUDED.ownership_epoch,
        runtime_status = EXCLUDED.runtime_status,
        status = EXCLUDED.status
    `,
    [input.instanceId, input.assignedNodeId, input.leaseExpireAt, ownershipEpoch],
  );
}

async function cleanupInstanceCatalog(pool: Pool, instanceIds: string[]): Promise<void> {
  await pool.query('DELETE FROM instance_catalog WHERE instance_id = ANY($1::varchar[])', [instanceIds]);
}

async function fetchSingleRow(pool: Pool, sql: string, params: unknown[]): Promise<Record<string, unknown> | null> {
  const result = await pool.query(sql, params);
  return (result.rows?.[0] as Record<string, unknown> | undefined) ?? null;
}

async function fetchRows(pool: Pool, sql: string, params: unknown[]): Promise<Array<Record<string, unknown>>> {
  const result = await pool.query(sql, params);
  return (result.rows ?? []) as Array<Record<string, unknown>>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/gu, '""')}"`;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

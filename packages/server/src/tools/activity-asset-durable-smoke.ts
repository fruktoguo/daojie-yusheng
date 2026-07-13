import {
  INVITATION_INVITEE_MERIT_REWARD,
  INVITATION_INVITEE_SPIRIT_STONE_REWARD,
  MERIT_ETERNAL_DAILY_SIGN_IN_FIXED_BONUS,
  MERIT_ETERNAL_POOL_GRANT,
  MERIT_ITEM_ID,
  MERIT_MONTH_CARD_POOL_GRANT,
  SPIRIT_STONE_ITEM_ID,
} from '@mud/shared';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { ActivityPersistenceService } from '../persistence/activity-persistence.service';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import { DurableOperationService } from '../persistence/durable-operation.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

const databaseUrl = resolveServerDatabaseUrl();
const itemInstanceIdByKey = new Map<string, string>();

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
      answers: 'with-db 下活动道具消耗、权益激活、月卡/签到/邀请奖励与背包在同一 durable transaction 内提交',
      excludes: '不证明真实网络断线时 COMMIT 回包丢失或活动面板并发点击',
    }, null, 2));
    return;
  }

  const now = Date.now();
  const playerId = `activity_asset_${now.toString(36)}`;
  const runtimeOwnerId = `runtime:${playerId}`;
  const monthCardItem = inventoryItem(playerId, 'month-card', 'merit_month_card', 2);
  const eternalItem = inventoryItem(playerId, 'eternal', 'merit_eternal', 1);
  const pool = new Pool({ connectionString: databaseUrl });
  const databasePoolProvider = new DatabasePoolProvider();
  const durable = new DurableOperationService({ getNodeId: () => 'node:activity-asset-smoke' } as never, databasePoolProvider);
  const activityPersistence = new ActivityPersistenceService(databasePoolProvider);

  try {
    await durable.onModuleInit();
    await activityPersistence.onModuleInit();
    await cleanup(pool, playerId);
    await seedPlayer(pool, playerId, runtimeOwnerId, now, [monthCardItem, eternalItem]);

    const activateMonthCardRequest = {
      operationId: `op:${playerId}:activate-month-card`,
      playerId,
      expectedRuntimeOwnerId: runtimeOwnerId,
      expectedSessionEpoch: 7,
      sourceType: 'activity_month_card_activation',
      sourceRefId: `${monthCardItem.itemInstanceId}:x2`,
      inventoryAction: 'remove' as const,
      grantedItems: [monthCardItem],
      nextInventoryItems: [eternalItem],
      sourceMutation: {
        kind: 'activity_asset' as const,
        action: 'activate_month_card' as const,
        playerId,
        occurredAtMs: now,
        count: 2,
      },
    };
    const activationResult = await durable.grantInventoryItems(activateMonthCardRequest);
    const activationReplay = await durable.grantInventoryItems(activateMonthCardRequest);
    assertResult(activationResult, false, 2, 'month card activation');
    assertResult(activationReplay, true, 2, 'month card activation replay');

    const monthReward = Math.floor((MERIT_MONTH_CARD_POOL_GRANT * 2) / 30);
    const meritAfterMonthClaim = inventoryItem(playerId, 'merit', MERIT_ITEM_ID, monthReward);
    await durable.grantInventoryItems({
      operationId: `op:${playerId}:claim-month-card`,
      playerId,
      expectedRuntimeOwnerId: runtimeOwnerId,
      expectedSessionEpoch: 7,
      sourceType: 'activity_month_card_claim',
      sourceRefId: `2026-07-13:${monthReward}`,
      inventoryAction: 'grant',
      grantedItems: [meritAfterMonthClaim],
      nextInventoryItems: [eternalItem, meritAfterMonthClaim],
      sourceMutation: {
        kind: 'activity_asset',
        action: 'claim_month_card',
        playerId,
        occurredAtMs: now,
        claimDate: '2026-07-13',
        expectedRewardMerit: monthReward,
      },
    });

    const signInReward = 123;
    const meritAfterSignIn = inventoryItem(playerId, 'merit', MERIT_ITEM_ID, monthReward + signInReward);
    await durable.grantInventoryItems({
      operationId: `op:${playerId}:claim-daily-sign-in`,
      playerId,
      expectedRuntimeOwnerId: runtimeOwnerId,
      expectedSessionEpoch: 7,
      sourceType: 'activity_daily_sign_in_claim',
      sourceRefId: `2026-07-13:${signInReward}`,
      inventoryAction: 'grant',
      grantedItems: [inventoryItem(playerId, 'daily-merit', MERIT_ITEM_ID, signInReward)],
      nextInventoryItems: [eternalItem, meritAfterSignIn],
      sourceMutation: {
        kind: 'activity_asset',
        action: 'claim_daily_sign_in',
        playerId,
        occurredAtMs: now,
        claimDate: '2026-07-13',
        expectedRewardMerit: signInReward,
        rewardPayload: {
          itemId: MERIT_ITEM_ID,
          count: signInReward,
          randomMerit: 100,
          fixedMerit: 23,
          fortune: { tier: 'good', ratioPercent: 66, luckDelta: 9, randomMerit: 100, baseRandomMaxMerit: 80, randomMaxMerit: 800 },
        },
      },
    });

    await seedInvitation(pool, playerId);
    const meritAfterInvitation = inventoryItem(
      playerId,
      'merit',
      MERIT_ITEM_ID,
      monthReward + signInReward + INVITATION_INVITEE_MERIT_REWARD,
    );
    const spiritStone = inventoryItem(playerId, 'spirit-stone', SPIRIT_STONE_ITEM_ID, INVITATION_INVITEE_SPIRIT_STONE_REWARD);
    await durable.grantInventoryItems({
      operationId: `op:${playerId}:claim-invitation`,
      playerId,
      expectedRuntimeOwnerId: runtimeOwnerId,
      expectedSessionEpoch: 7,
      sourceType: 'activity_invitation_reward_claim',
      sourceRefId: `${INVITATION_INVITEE_SPIRIT_STONE_REWARD}:${INVITATION_INVITEE_MERIT_REWARD}:0`,
      inventoryAction: 'grant',
      grantedItems: [
        inventoryItem(playerId, 'invite-merit', MERIT_ITEM_ID, INVITATION_INVITEE_MERIT_REWARD),
        spiritStone,
      ],
      nextInventoryItems: [eternalItem, meritAfterInvitation, spiritStone],
      sourceMutation: {
        kind: 'activity_asset',
        action: 'claim_invitation_rewards',
        playerId,
        occurredAtMs: now,
        expectedRewards: {
          inviteeSpiritStone: INVITATION_INVITEE_SPIRIT_STONE_REWARD,
          inviteeMerit: INVITATION_INVITEE_MERIT_REWARD,
          inviterMerit: 0,
        },
      },
    });

    await durable.grantInventoryItems({
      operationId: `op:${playerId}:activate-eternal`,
      playerId,
      expectedRuntimeOwnerId: runtimeOwnerId,
      expectedSessionEpoch: 7,
      sourceType: 'activity_eternal_activation',
      sourceRefId: `${eternalItem.itemInstanceId}:x1`,
      inventoryAction: 'remove',
      grantedItems: [eternalItem],
      nextInventoryItems: [meritAfterInvitation, spiritStone],
      sourceMutation: {
        kind: 'activity_asset',
        action: 'activate_eternal',
        playerId,
        occurredAtMs: now + 1,
        count: 1,
      },
    });

    const beforeRejectedInventory = await readInventory(pool, playerId);
    let rejected = false;
    try {
      await durable.grantInventoryItems({
        operationId: `op:${playerId}:claim-daily-sign-in-mismatch`,
        playerId,
        expectedRuntimeOwnerId: runtimeOwnerId,
        expectedSessionEpoch: 7,
        sourceType: 'activity_daily_sign_in_claim',
        sourceRefId: '2026-07-14:999',
        inventoryAction: 'grant',
        grantedItems: [inventoryItem(playerId, 'bad-merit', MERIT_ITEM_ID, 999)],
        nextInventoryItems: [inventoryItem(playerId, 'merit', MERIT_ITEM_ID, 999), spiritStone],
        sourceMutation: {
          kind: 'activity_asset',
          action: 'claim_daily_sign_in',
          playerId,
          occurredAtMs: now + 1,
          claimDate: '2026-07-14',
          expectedRewardMerit: 999,
          rewardPayload: { itemId: MERIT_ITEM_ID, count: 998 },
        },
      });
    }
    catch (error) {
      rejected = String(error instanceof Error ? error.message : error).includes('activity_reward_snapshot_changed');
    }
    if (!rejected || JSON.stringify(await readInventory(pool, playerId)) !== JSON.stringify(beforeRejectedInventory)) {
      throw new Error('activity reward snapshot mismatch did not rollback inventory and source state');
    }

    const monthCard = await fetchSingle(pool,
      `SELECT total_pool_merit, remaining_pool_merit, eternal_enabled, daily_sign_in_fixed_merit_bonus, last_claim_date
         FROM player_merit_month_card WHERE player_id = $1`,
      [playerId]);
    const dailySignIn = await fetchSingle(pool,
      'SELECT last_claim_date, last_reward_merit FROM player_daily_sign_in WHERE player_id = $1',
      [playerId]);
    const invitation = await fetchSingle(pool,
      'SELECT invitee_reward_claimed FROM player_invitation WHERE invitee_player_id = $1',
      [playerId]);
    const inventory = await readInventory(pool, playerId);
    const auditRows = await fetchRows(pool,
      'SELECT asset_type, action FROM asset_audit_log WHERE player_id = $1 ORDER BY created_at ASC, log_id ASC',
      [playerId]);
    if (
      Number(monthCard?.total_pool_merit) !== MERIT_MONTH_CARD_POOL_GRANT * 2 - monthReward + MERIT_ETERNAL_POOL_GRANT
      || Number(monthCard?.remaining_pool_merit) !== MERIT_MONTH_CARD_POOL_GRANT * 2 - monthReward + MERIT_ETERNAL_POOL_GRANT
      || monthCard?.eternal_enabled !== true
      || Number(monthCard?.daily_sign_in_fixed_merit_bonus) !== MERIT_ETERNAL_DAILY_SIGN_IN_FIXED_BONUS
      || monthCard?.last_claim_date !== '2026-07-13'
    ) {
      throw new Error(`unexpected month card state: ${JSON.stringify(monthCard)}`);
    }
    if (dailySignIn?.last_claim_date !== '2026-07-13' || Number(dailySignIn?.last_reward_merit) !== signInReward) {
      throw new Error(`unexpected daily sign-in state: ${JSON.stringify(dailySignIn)}`);
    }
    if (invitation?.invitee_reward_claimed !== true) {
      throw new Error(`unexpected invitation state: ${JSON.stringify(invitation)}`);
    }
    if (
      inventory.length !== 2
      || inventory[0]?.item_id !== MERIT_ITEM_ID
      || Number(inventory[0]?.count) !== monthReward + signInReward + INVITATION_INVITEE_MERIT_REWARD
      || inventory[1]?.item_id !== SPIRIT_STONE_ITEM_ID
      || Number(inventory[1]?.count) !== INVITATION_INVITEE_SPIRIT_STONE_REWARD
    ) {
      throw new Error(`unexpected activity inventory state: ${JSON.stringify(inventory)}`);
    }
    const activityAuditCount = auditRows.filter((entry) => entry.asset_type === 'activity_asset').length;
    const inventoryAuditCount = auditRows.filter((entry) => entry.asset_type === 'inventory').length;
    if (activityAuditCount !== 5 || inventoryAuditCount !== 5) {
      throw new Error(`unexpected activity audit rows: ${JSON.stringify(auditRows)}`);
    }

    console.log(JSON.stringify({
      ok: true,
      case: 'activity-asset-durable',
      answers: '功德月卡/永恒激活、月卡领取、每日签到和邀请奖励均与背包真源、watermark、outbox 及双资产审计同事务提交；精确重放不重复，奖励快照变化整笔回滚。',
      excludes: '不证明真实网络断线时 COMMIT 回包丢失或多节点同时操作同一活动入口。',
      activationResult,
      activationReplay,
      activityAuditCount,
      inventoryAuditCount,
    }, null, 2));
  }
  finally {
    await cleanup(pool, playerId).catch(() => undefined);
    await activityPersistence.onModuleDestroy().catch(() => undefined);
    await durable.onModuleDestroy().catch(() => undefined);
    await databasePoolProvider.onModuleDestroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

function inventoryItem(playerId: string, suffix: string, itemId: string, count: number) {
  const key = `${playerId}:${suffix}`;
  const itemInstanceId = itemInstanceIdByKey.get(key) ?? randomUUID();
  itemInstanceIdByKey.set(key, itemInstanceId);
  return {
    itemId,
    itemInstanceId,
    count,
    rawPayload: { itemId, itemInstanceId, count },
  };
}

async function seedPlayer(
  pool: Pool,
  playerId: string,
  runtimeOwnerId: string,
  now: number,
  items: ReturnType<typeof inventoryItem>[],
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO player_presence(
         player_id, online, in_world, last_heartbeat_at, runtime_owner_id, session_epoch, updated_at
       ) VALUES ($1, true, true, $2, $3, 7, now())`,
      [playerId, now, runtimeOwnerId],
    );
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      await client.query(
        `INSERT INTO player_inventory_item(
           item_instance_id, player_id, slot_index, item_id, count, raw_payload, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, now())`,
        [item.itemInstanceId, playerId, index, item.itemId, item.count, JSON.stringify(item.rawPayload)],
      );
    }
    await client.query('COMMIT');
  }
  catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
  finally {
    client.release();
  }
}

async function seedInvitation(pool: Pool, playerId: string): Promise<void> {
  await pool.query(
    `INSERT INTO player_invitation(
       inviter_user_id, inviter_player_id, invitee_user_id, invitee_player_id,
       invitation_code, invitee_highest_realm_lv, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, 1, now(), now())`,
    [`user:inviter:${playerId}`, `player:inviter:${playerId}`, `user:${playerId}`, playerId, 'SMOKE123'],
  );
}

async function cleanup(pool: Pool, playerId: string): Promise<void> {
  await pool.query('DELETE FROM player_merit_month_card_claim WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM player_merit_month_card WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM player_daily_sign_in_claim WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM player_daily_sign_in WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM player_invitation WHERE invitee_player_id = $1 OR inviter_player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM durable_operation_log WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM outbox_event WHERE partition_key = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM asset_audit_log WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM player_inventory_item WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM player_presence WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM player_recovery_watermark WHERE player_id = $1', [playerId]).catch(() => undefined);
}

function assertResult(
  result: { ok?: boolean; alreadyCommitted?: boolean; grantedCount?: number },
  alreadyCommitted: boolean,
  grantedCount: number,
  label: string,
): void {
  if (!result.ok || result.alreadyCommitted !== alreadyCommitted || result.grantedCount !== grantedCount) {
    throw new Error(`unexpected ${label} result: ${JSON.stringify(result)}`);
  }
}

async function readInventory(pool: Pool, playerId: string) {
  return fetchRows(
    pool,
    'SELECT slot_index, item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
    [playerId],
  );
}

async function fetchRows(pool: Pool, sql: string, params: readonly unknown[]) {
  const result = await pool.query(sql, [...params]);
  return Array.isArray(result.rows) ? result.rows : [];
}

async function fetchSingle(pool: Pool, sql: string, params: readonly unknown[]) {
  return (await fetchRows(pool, sql, params))[0] ?? null;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

/**
 * 邀请活动运行时 smoke。
 * 覆盖活动状态投影、邀请链接字段和邀请奖励补发编排。
 */
import { strict as assert } from 'node:assert';

import {
  INVITATION_INVITEE_MERIT_REWARD,
  INVITATION_INVITEE_SPIRIT_STONE_REWARD,
  INVITATION_INVITER_BASE_MERIT_REWARD,
  INVITATION_INVITER_FOUNDATION_REALM_JADE_REWARD,
  INVITATION_INVITER_FOUNDATION_REALM_MERIT_REWARD,
  INVITATION_INVITER_QI_REALM_JADE_REWARD,
  INVITATION_INVITER_QI_REALM_MERIT_REWARD,
  MERIT_ITEM_ID,
  SPIRIT_STONE_ITEM_ID,
  WUDAO_YUJIAN_ITEM_ID,
} from '@mud/shared';

import { ActivityPersistenceService } from '../persistence/activity-persistence.service';
import { MailPersistenceService } from '../persistence/mail-persistence.service';

import { ActivityRuntimeService } from '../runtime/activity/activity-runtime.service';

async function main(): Promise<void> {
  const durableCalls: Array<Record<string, unknown>> = [];
  const jadeMailClaims: string[] = [];
  const progressUpdates: Array<{ playerId: string; highestRealmLv: number }> = [];
  const expectedRewards = {
    inviteeSpiritStone: INVITATION_INVITEE_SPIRIT_STONE_REWARD,
    inviteeMerit: INVITATION_INVITEE_MERIT_REWARD,
    inviterMerit:
      INVITATION_INVITER_BASE_MERIT_REWARD
      + INVITATION_INVITER_QI_REALM_MERIT_REWARD
      + INVITATION_INVITER_FOUNDATION_REALM_MERIT_REWARD,
  };
  const activityPersistence = {
    isEnabled: () => true,
    loadMonthCard: async () => null,
    loadDailySignIn: async () => null,
    updateInvitationInviteeHighestRealmLv: async (playerId: string, highestRealmLv: number) => {
      progressUpdates.push({ playerId, highestRealmLv });
    },
    listInvitationInviteeProgress: async () => [
      { inviteePlayerId: 'p_invitee_qi', highestRealmLv: 1 },
      { inviteePlayerId: 'p_invitee_foundation', highestRealmLv: 19 },
    ],
    previewPendingInvitationRewards: async () => expectedRewards,
    loadInvitationStatus: async () => ({
      totalInvitees: 2,
      registeredRewardedCount: 2,
      qiReachedCount: 2,
      foundationReachedCount: 1,
    }),
    deliverPendingInvitationJadeRewardMailsForPlayer: async (playerId: string) => {
      jadeMailClaims.push(playerId);
      return true;
    },
  };
  const player = {
    playerId: 'p_inviter',
    realm: { realmLv: 31 },
    runtimeOwnerId: 'runtime:activity-smoke',
    sessionEpoch: 3,
    instanceId: null,
    inventory: { items: [], capacity: 24, revision: 0 },
  };
  const playerRuntime = {
    contentTemplateRepository: {
      createItem: (itemId: string, count: number) => ({ itemId, count }),
    },
    playerDomainPersistenceService: {
      isEnabled: () => true,
      loadPlayerPresence: async () => ({ runtimeOwnerId: player.runtimeOwnerId, sessionEpoch: 2 }),
      savePlayerPresence: async () => undefined,
    },
    getPlayerOrThrow: (playerId: string) => {
      assert.equal(playerId, 'p_inviter');
      return player;
    },
    getPlayer: (playerId: string) => {
      if (playerId === 'p_inviter') {
        return player;
      }
      return null;
    },
    runExclusiveAssetMutation: async (_playerIds: string[], action: () => Promise<unknown>) => action(),
    describePersistencePresence: () => ({ runtimeOwnerId: player.runtimeOwnerId, sessionEpoch: player.sessionEpoch }),
    getSessionFence: () => ({ runtimeOwnerId: player.runtimeOwnerId, sessionEpoch: player.sessionEpoch }),
    ensureRuntimeSessionFenceAtLeast: (_playerId: string, persistedEpoch: number) => {
      player.sessionEpoch = persistedEpoch + 1;
    },
    replaceInventoryItems: (playerId: string, items: Array<{ itemId: string; count: number }>) => {
      assert.equal(playerId, 'p_inviter');
      player.inventory.items = items.map((entry) => ({ ...entry }));
    },
  };
  const durable = {
    isEnabled: () => true,
    grantInventoryItems: async (input: Record<string, unknown>) => {
      durableCalls.push(input);
      return { ok: true, alreadyCommitted: false };
    },
  };
  const counters = {
    get: (playerId: string, key: string) => {
      if (key !== 'highestRealmLv') {
        return 0;
      }
      if (playerId === 'p_invitee_foundation') {
        return 31;
      }
      if (playerId === 'p_invitee_qi') {
        return 19;
      }
      return 0;
    },
  };
  const authStore = {
    getMemoryUserByPlayerId: () => ({ inviteCode: 'ABCD1234' }),
  };
  const service = new ActivityRuntimeService(
    activityPersistence as never,
    playerRuntime as never,
    durable as never,
    {} as never,
    counters as never,
    authStore as never,
  );

  const status = await service.getStatus('p_inviter', 1_700_000_000_000);
  assert.equal(status.invitation.inviteCode, 'ABCD1234');
  assert.equal(status.invitation.invitePath, '/?invite=ABCD1234');
  assert.equal(status.invitation.totalInvitees, 2);
  assert.equal(status.invitation.qiReachedCount, 2);
  assert.equal(status.invitation.foundationReachedCount, 1);
  assert.equal(status.invitation.stages.find((stage) => stage.key === 'qi')?.rewardJade, INVITATION_INVITER_QI_REALM_JADE_REWARD);
  assert.equal(status.invitation.stages.find((stage) => stage.key === 'foundation')?.rewardJade, INVITATION_INVITER_FOUNDATION_REALM_JADE_REWARD);
  assert.equal(status.dailySignIn.rewardPreview.randomMinMerit, 1);
  assert.equal(status.dailySignIn.rewardPreview.randomMaxMerit, 710);
  assert.equal(status.dailySignIn.rewardPreview.baseRandomMaxMerit, 71);
  assert.ok(Math.abs(status.dailySignIn.rewardPreview.expectedRandomMerit - 36.34653465346535) < 1e-9);
  assert.equal(status.dailySignIn.rewardPreview.fixedMerit, 0);
  assert.equal(status.dailySignIn.rewardPreview.effectiveStreakDays, 1);
  assert.equal(status.dailySignIn.rewardPreview.streakBonusPercent, 1);
  assert.equal(status.dailySignIn.lastFortune, null);
  assert.equal(status.hasRedDot, true);
  assert.deepEqual(player.inventory.items, [
    { itemId: SPIRIT_STONE_ITEM_ID, count: INVITATION_INVITEE_SPIRIT_STONE_REWARD },
    { itemId: MERIT_ITEM_ID, count: expectedRewards.inviteeMerit + expectedRewards.inviterMerit },
  ]);
  assert.equal(durableCalls.length, 1);
  assert.equal(durableCalls[0]?.sourceType, 'activity_invitation_reward_claim');
  assert.deepEqual((durableCalls[0]?.sourceMutation as { expectedRewards?: unknown })?.expectedRewards, expectedRewards);
  assert.deepEqual(progressUpdates, [
    { playerId: 'p_inviter', highestRealmLv: 31 },
    { playerId: 'p_invitee_qi', highestRealmLv: 19 },
    { playerId: 'p_invitee_foundation', highestRealmLv: 31 },
  ]);

  await assertInvitationJadeBackfillPersistence();
  await assertInvitationJadeMailPersistenceShape();
  assert.deepEqual(jadeMailClaims, ['p_inviter']);

  process.stdout.write(JSON.stringify({
    ok: true,
    case: 'invitation-activity',
    assertions: [
      'activity status exposes invite code and invite link path',
      'invitation stage counts are projected into the activity view',
      'pending invitation rewards contribute to the activity red dot',
      'invitee and inviter merit/spirit-stone rewards share one durable inventory transaction',
      'invitee highest realm progress is refreshed before reward claims',
      'invitation realm-stage jade rewards are projected into the activity view',
      'historical invitation jade rewards are marked only after mail persistence accepts the batch',
      'invitation jade compensation mail is permanent and idempotent',
      'pending invitation jade rewards are routed to permanent mail delivery',
    ],
  }, null, 2));
}

async function assertInvitationJadeBackfillPersistence(): Promise<void> {
  const invitationRows = [
    { inviterPlayerId: 'p_inviter_backfill', inviteePlayerId: 'p_invitee_qi', highestRealmLv: 19, qiClaimed: false, foundationClaimed: false },
    { inviterPlayerId: 'p_inviter_backfill', inviteePlayerId: 'p_invitee_foundation', highestRealmLv: 31, qiClaimed: false, foundationClaimed: false },
  ];
  const transactions: string[] = [];
  const deliveredMailBatches: Array<{ playerId: string; jadeCount: number; batchId: string; rewardKey: string }> = [];
  const fakeClient = {
    async query(sql: string, params: unknown[] = []) {
      const text = String(sql);
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
        transactions.push(text);
        return { rows: [], rowCount: 0 };
      }
      if (text.includes('SELECT invitee_player_id') && text.includes('FOR UPDATE')) {
        const inviterPlayerId = String(params[0] ?? '');
        return {
          rows: invitationRows
            .filter((row) => row.inviterPlayerId === inviterPlayerId)
            .filter((row) => (row.highestRealmLv >= 19 && !row.qiClaimed) || (row.highestRealmLv >= 31 && !row.foundationClaimed))
            .map((row) => ({
              invitee_player_id: row.inviteePlayerId,
              invitee_highest_realm_lv: row.highestRealmLv,
              inviter_qi_jade_reward_claimed: row.qiClaimed,
              inviter_foundation_jade_reward_claimed: row.foundationClaimed,
            })),
        };
      }
      if (text.includes('SET inviter_qi_jade_reward_claimed = true')) {
        const inviteeIds = new Set(Array.isArray(params[1]) ? params[1].map(String) : []);
        const rows = invitationRows
          .filter((row) => row.inviterPlayerId === params[0] && inviteeIds.has(row.inviteePlayerId) && row.highestRealmLv >= 19 && !row.qiClaimed)
          .map((row) => {
            row.qiClaimed = true;
            return { invitee_player_id: row.inviteePlayerId };
          });
        return { rows, rowCount: rows.length };
      }
      if (text.includes('SET inviter_foundation_jade_reward_claimed = true')) {
        const inviteeIds = new Set(Array.isArray(params[1]) ? params[1].map(String) : []);
        const rows = invitationRows
          .filter((row) => row.inviterPlayerId === params[0] && inviteeIds.has(row.inviteePlayerId) && row.highestRealmLv >= 31 && !row.foundationClaimed)
          .map((row) => {
            row.foundationClaimed = true;
            return { invitee_player_id: row.inviteePlayerId };
          });
        return { rows, rowCount: rows.length };
      }
      throw new Error(`unexpected fake activity query: ${text}`);
    },
    release() {},
  };
  const fakePool = {
    async query(sql: string, params: unknown[] = []) {
      const text = String(sql);
      if (text.includes('SELECT DISTINCT inviter_player_id')) {
        const limit = Math.max(1, Math.trunc(Number(params[2]) || 1));
        const pendingInviters = Array.from(new Set(invitationRows
          .filter((row) => (row.highestRealmLv >= 19 && !row.qiClaimed) || (row.highestRealmLv >= 31 && !row.foundationClaimed))
          .map((row) => row.inviterPlayerId)))
          .sort()
          .slice(0, limit);
        return { rows: pendingInviters.map((playerId) => ({ inviter_player_id: playerId })), rowCount: pendingInviters.length };
      }
      throw new Error(`unexpected fake activity pool query: ${text}`);
    },
    async connect() {
      return fakeClient;
    },
  };
  const fakeMailPersistence = {
    isEnabled: () => true,
    async insertActivityInvitationJadeRewardMailWithClient(_client: unknown, input: { playerId: string; jadeCount: number; batchId: string; rewardKey: string }) {
      deliveredMailBatches.push(input);
      return `mail:${input.playerId}`;
    },
  };
  const service = new ActivityPersistenceService({ getPool: () => null } as never, fakeMailPersistence as never);
  service.pool = fakePool as never;
  service.enabled = true;
  const first = await service.deliverPendingInvitationJadeRewardMails({ limit: 8 });
  const second = await service.deliverPendingInvitationJadeRewardMails({ limit: 8 });
  assert.deepEqual(first, { processedInviters: 1, deliveredMails: 1, totalJade: 5 });
  assert.deepEqual(second, { processedInviters: 0, deliveredMails: 0, totalJade: 0 });
  assert.equal(deliveredMailBatches.length, 1);
  assert.equal(deliveredMailBatches[0]?.jadeCount, 5);
  assert.ok(deliveredMailBatches[0]?.batchId.startsWith('activity:invitation-jade:v1:'));
  assert.deepEqual(transactions, ['BEGIN', 'COMMIT']);
  assert.equal(invitationRows.every((row) => row.qiClaimed === true), true);
  assert.equal(invitationRows.find((row) => row.inviteePlayerId === 'p_invitee_foundation')?.foundationClaimed, true);
}

async function assertInvitationJadeMailPersistenceShape(): Promise<void> {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  let mailInsertAttempts = 0;
  let attachmentInsertCount = 0;
  let counterRefreshCount = 0;
  const fakeClient = {
    async query(sql: string, params: unknown[] = []) {
      const text = String(sql);
      queries.push({ sql: text, params });
      if (text.includes('pg_advisory_xact_lock')) {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes('INSERT INTO player_mail(')) {
        mailInsertAttempts += 1;
        return mailInsertAttempts === 1
          ? { rows: [{ mail_id: String(params[0]) }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (text.includes('INSERT INTO player_mail_attachment(')) {
        attachmentInsertCount += 1;
        return { rows: [], rowCount: 1 };
      }
      if (text.includes('SELECT COUNT(*)::bigint AS compatible_count') && text.includes('activity_invitation_jade_reward')) {
        return { rows: [{ compatible_count: '1' }], rowCount: 1 };
      }
      if (text.includes('INSERT INTO player_mail_counter(')) {
        counterRefreshCount += 1;
        const playerIds = Array.isArray(params[0]) ? params[0] : [];
        return { rows: [{ player_id: playerIds[0], counter_version: 1 }], rowCount: 1 };
      }
      if (text.includes('INSERT INTO player_recovery_watermark(')) {
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`unexpected fake mail query: ${text}`);
    },
  };
  const mailPersistence = new MailPersistenceService(null);
  const input = {
    playerId: 'p_inviter_mail_shape',
    batchId: 'activity:invitation-jade:v1:shape-proof',
    jadeCount: 4,
    rewardKey: 'reward-key-shape-proof',
    nowMs: 1_700_000_001_000,
  };
  const firstMailId = await mailPersistence.insertActivityInvitationJadeRewardMailWithClient(fakeClient as never, input);
  const replayMailId = await mailPersistence.insertActivityInvitationJadeRewardMailWithClient(fakeClient as never, input);
  const mailInsert = queries.find((entry) => entry.sql.includes('activity_invitation_jade_reward'));
  const attachmentInsert = queries.find((entry) => entry.sql.includes('INSERT INTO player_mail_attachment('));
  const metadata = JSON.parse(String(mailInsert?.params[5] ?? '{}')) as { activityInvitationJadeRewardKey?: string; activityInvitationJadeCount?: number };
  assert.equal(firstMailId, replayMailId);
  assert.equal(mailInsertAttempts, 2);
  assert.equal(attachmentInsertCount, 1);
  assert.equal(counterRefreshCount, 1);
  assert.ok(mailInsert?.sql.includes('expire_at'));
  assert.ok(mailInsert?.sql.includes('NULL'));
  assert.equal(metadata.activityInvitationJadeRewardKey, input.rewardKey);
  assert.equal(metadata.activityInvitationJadeCount, input.jadeCount);
  assert.equal(attachmentInsert?.params[3], WUDAO_YUJIAN_ITEM_ID);
  assert.equal(attachmentInsert?.params[4], input.jadeCount);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

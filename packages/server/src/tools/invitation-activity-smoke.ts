/**
 * 邀请活动运行时 smoke。
 * 覆盖活动状态投影、邀请链接字段和邀请奖励补发编排。
 */
import { strict as assert } from 'node:assert';

import {
  INVITATION_INVITEE_MERIT_REWARD,
  INVITATION_INVITEE_SPIRIT_STONE_REWARD,
  INVITATION_INVITER_BASE_MERIT_REWARD,
  INVITATION_INVITER_FOUNDATION_REALM_MERIT_REWARD,
  INVITATION_INVITER_QI_REALM_MERIT_REWARD,
  MERIT_ITEM_ID,
  SPIRIT_STONE_ITEM_ID,
} from '@mud/shared';

import { ActivityRuntimeService } from '../runtime/activity/activity-runtime.service';

async function main(): Promise<void> {
  const durableCalls: Array<Record<string, unknown>> = [];
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

  process.stdout.write(JSON.stringify({
    ok: true,
    case: 'invitation-activity',
    assertions: [
      'activity status exposes invite code and invite link path',
      'invitation stage counts are projected into the activity view',
      'pending invitation rewards contribute to the activity red dot',
      'invitee and inviter merit/spirit-stone rewards share one durable inventory transaction',
      'invitee highest realm progress is refreshed before reward claims',
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

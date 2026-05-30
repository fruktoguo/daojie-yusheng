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
  const granted: Array<{ playerId: string; itemId: string; count: number }> = [];
  const progressUpdates: Array<{ playerId: string; highestRealmLv: number }> = [];
  const activityPersistence = {
    isEnabled: () => true,
    loadMonthCard: async () => null,
    loadDailySignIn: async () => null,
    updateInvitationInviteeHighestRealmLv: async (playerId: string, highestRealmLv: number) => {
      progressUpdates.push({ playerId, highestRealmLv });
    },
    hasPendingInvitationRewards: async () => true,
    listInvitationInviteeProgress: async () => [
      { inviteePlayerId: 'p_invitee_qi', highestRealmLv: 1 },
      { inviteePlayerId: 'p_invitee_foundation', highestRealmLv: 19 },
    ],
    claimPendingInvitationRewards: async () => ({
      inviteeSpiritStone: INVITATION_INVITEE_SPIRIT_STONE_REWARD,
      inviteeMerit: INVITATION_INVITEE_MERIT_REWARD,
      inviterMerit:
        INVITATION_INVITER_BASE_MERIT_REWARD
        + INVITATION_INVITER_QI_REALM_MERIT_REWARD
        + INVITATION_INVITER_FOUNDATION_REALM_MERIT_REWARD,
    }),
    loadInvitationStatus: async () => ({
      totalInvitees: 2,
      registeredRewardedCount: 2,
      qiReachedCount: 2,
      foundationReachedCount: 1,
    }),
  };
  const playerRuntime = {
    getPlayerOrThrow: (playerId: string) => ({ playerId, realm: { realmLv: 31 } }),
    getPlayer: (playerId: string) => {
      if (playerId === 'p_inviter') {
        return { playerId, realm: { realmLv: 31 }, inventory: { items: [] } };
      }
      return null;
    },
    grantItem: (playerId: string, itemId: string, count: number) => {
      granted.push({ playerId, itemId, count });
    },
    receiveInventoryItem: (playerId: string, item: { itemId: string; count: number }) => {
      granted.push({ playerId, itemId: item.itemId, count: item.count });
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
    counters as never,
    authStore as never,
  );

  const status = await service.getStatus('p_inviter', 1_700_000_000_000);
  assert.equal(status.invitation.inviteCode, 'ABCD1234');
  assert.equal(status.invitation.invitePath, '/?invite=ABCD1234');
  assert.equal(status.invitation.totalInvitees, 2);
  assert.equal(status.invitation.qiReachedCount, 2);
  assert.equal(status.invitation.foundationReachedCount, 1);
  assert.equal(status.hasRedDot, true);
  assert.deepEqual(granted, [
    { playerId: 'p_inviter', itemId: SPIRIT_STONE_ITEM_ID, count: INVITATION_INVITEE_SPIRIT_STONE_REWARD },
    { playerId: 'p_inviter', itemId: MERIT_ITEM_ID, count: INVITATION_INVITEE_MERIT_REWARD },
    {
      playerId: 'p_inviter',
      itemId: MERIT_ITEM_ID,
      count:
        INVITATION_INVITER_BASE_MERIT_REWARD
        + INVITATION_INVITER_QI_REALM_MERIT_REWARD
        + INVITATION_INVITER_FOUNDATION_REALM_MERIT_REWARD,
    },
  ]);
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
      'invitee and inviter merit/spirit-stone rewards are granted through runtime item paths',
      'invitee highest realm progress is refreshed before reward claims',
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

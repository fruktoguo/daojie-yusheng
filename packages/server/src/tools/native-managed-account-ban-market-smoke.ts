import assert from 'node:assert/strict';

import { NativeManagedAccountService } from '../http/native/native-managed-account.service';

type UserRecord = {
  id: string;
  username: string;
  playerId: string;
  playerNo: number;
  pendingRoleName: string;
  displayName: string | null;
  passwordHash: string;
  totalOnlineSeconds: number;
  currentOnlineStartedAt: string | null;
  registerIp: string | null;
  lastLoginIp: string | null;
  lastLoginAt: string | null;
  registerDeviceId: string | null;
  lastLoginDeviceId: string | null;
  lastUserAgent: string | null;
  inviteCode: string | null;
  registerInvitationCode: string | null;
  bannedAt: string | null;
  banReason: string | null;
  bannedBy: string | null;
  createdAt: string;
  updatedAt: number;
};

function createUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: 'user:ban-market',
    username: 'ban_market_user',
    playerId: 'player:ban-market',
    playerNo: 1001,
    pendingRoleName: '封禁测试',
    displayName: null,
    passwordHash: 'hash',
    totalOnlineSeconds: 0,
    currentOnlineStartedAt: null,
    registerIp: null,
    lastLoginIp: null,
    lastLoginAt: null,
    registerDeviceId: null,
    lastLoginDeviceId: null,
    lastUserAgent: null,
    inviteCode: null,
    registerInvitationCode: null,
    bannedAt: null,
    banReason: null,
    bannedBy: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: 1,
    ...overrides,
  };
}

async function main(): Promise<void> {
  const user = createUser();
  const savedUsers: UserRecord[] = [];
  const marketCancelledPlayerIds: string[] = [];
  let cacheInvalidationCount = 0;
  const authStore = {
    getMemoryUserByPlayerId(playerId: string) {
      return playerId === user.playerId ? structuredClone(user) : null;
    },
    async findUserByPlayerId() {
      return null;
    },
    async saveUser(nextUser: UserRecord) {
      savedUsers.push(structuredClone(nextUser));
      Object.assign(user, nextUser);
      return structuredClone(user);
    },
  };
  const service = new NativeManagedAccountService(
    authStore as never,
    { isEnabled: () => false, savePlayerIdentity: async () => undefined } as never,
    { getPlayerIdentityProjection: () => null, setIdentity: () => undefined } as never,
    {
      async cancelOpenOrdersForBannedPlayer(playerId: string) {
        marketCancelledPlayerIds.push(playerId);
      },
    } as never,
    {
      invalidateCaches() {
        cacheInvalidationCount += 1;
      },
    } as never,
  );

  await service.banManagedPlayerAccount(user.playerId, '外挂刷灵石', 'gm:test');
  assert.equal(savedUsers.length, 1);
  assert.equal(savedUsers[0]?.bannedAt !== null, true);
  assert.equal(savedUsers[0]?.banReason, '外挂刷灵石');
  assert.equal(savedUsers[0]?.bannedBy, 'gm:test');
  assert.deepEqual(marketCancelledPlayerIds, [user.playerId]);
  assert.equal(cacheInvalidationCount, 1);

  const rollbackUser = createUser({ playerId: 'player:ban-market-rollback' });
  const rollbackSaves: UserRecord[] = [];
  const rollbackAuthStore = {
    getMemoryUserByPlayerId(playerId: string) {
      return playerId === rollbackUser.playerId ? structuredClone(rollbackUser) : null;
    },
    async findUserByPlayerId() {
      return null;
    },
    async saveUser(nextUser: UserRecord) {
      rollbackSaves.push(structuredClone(nextUser));
      Object.assign(rollbackUser, nextUser);
      return structuredClone(rollbackUser);
    },
  };
  const rollbackService = new NativeManagedAccountService(
    rollbackAuthStore as never,
    { isEnabled: () => false, savePlayerIdentity: async () => undefined } as never,
    { getPlayerIdentityProjection: () => null, setIdentity: () => undefined } as never,
    {
      async cancelOpenOrdersForBannedPlayer() {
        throw new Error('market_cancel_failed');
      },
    } as never,
    {
      invalidateCaches() {
        cacheInvalidationCount += 1;
      },
    } as never,
  );
  (rollbackService as unknown as { logger: { error: () => void; warn: () => void; log: () => void } }).logger = {
    error: () => undefined,
    warn: () => undefined,
    log: () => undefined,
  };

  await assert.rejects(
    () => rollbackService.banManagedPlayerAccount(rollbackUser.playerId, '撤单失败测试', 'gm:test'),
    /market_cancel_failed/,
  );
  assert.equal(rollbackSaves.length, 2);
  assert.equal(rollbackSaves[0]?.bannedAt !== null, true);
  assert.equal(rollbackSaves[1]?.bannedAt, null);
  assert.equal(rollbackUser.bannedAt, null);

  console.log('native-managed-account-ban-market-smoke passed');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

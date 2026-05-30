/**
 * 注册激活码冷路径 smoke。
 * 覆盖注册/登录共用账号库的同 IP 激活码门禁，以及邀请链接带入的邀请码持久化字段。
 */
import { strict as assert } from 'node:assert';

import { AUTH_REGISTER_ACTIVATION_REQUIRED_CODE } from '@mud/shared';

import { NativePlayerAuthService } from '../http/native/native-player-auth.service';
import { NativePlayerAuthStoreService } from '../http/native/native-player-auth-store.service';

async function main(): Promise<void> {
  const previousCodes = process.env.SERVER_REGISTRATION_ACTIVATION_CODES;
  process.env.SERVER_REGISTRATION_ACTIVATION_CODES = 'OPEN-SESAME';

  try {
    const authStore = new NativePlayerAuthStoreService();
    const service = new NativePlayerAuthService(
      authStore,
      createTokenCodecStub(),
      { isEnabled: () => false, savePlayerIdentity: async () => ({ ok: true }) },
      { getPlayerIdentityProjection: () => null, setIdentity: () => undefined },
      { ensureNativeStarterSnapshot: async () => ({ ok: true }) },
    );

    const first = await service.register(
      'regact1',
      'password123',
      '甲',
      '激活码烟测甲',
      { ip: '198.51.100.40', deviceId: 'device-a', userAgent: 'registration-smoke' },
      { invitationCode: 'INVITE-A' },
    );
    assert.ok(first.accessToken);

    const firstUser = await authStore.findUserByUsername('regact1');
    assert.equal(firstUser?.registerInvitationCode, 'INVITE-A');
    assert.equal(await authStore.hasObservedAuthIp('198.51.100.40'), true);
    assert.equal(await authStore.hasObservedAuthIp('203.0.113.91'), false);

    await service.login(
      'regact1',
      'password123',
      { ip: '203.0.113.91', deviceId: 'device-login', userAgent: 'registration-smoke' },
    );
    assert.equal(await authStore.hasObservedAuthIp('203.0.113.91'), true);

    await assert.rejects(
      () => service.register(
        'regact2',
        'password123',
        '乙',
        '激活码烟测乙',
        { ip: '203.0.113.91', deviceId: 'device-b', userAgent: 'registration-smoke' },
      ),
      (error: unknown) => isActivationRequiredError(error),
    );

    await assert.rejects(
      () => service.register(
        'regact3',
        'password123',
        '丙',
        '激活码烟测丙',
        { ip: '203.0.113.91', deviceId: 'device-c', userAgent: 'registration-smoke' },
        { activationCode: 'WRONG-CODE' },
      ),
      (error: unknown) => isActivationRequiredError(error),
    );

    const second = await service.register(
      'regact4',
      'password123',
      '丁',
      '激活码烟测丁',
      { ip: '203.0.113.91', deviceId: 'device-d', userAgent: 'registration-smoke' },
      { activationCode: 'open-sesame' },
    );
    assert.ok(second.refreshToken);

    process.stdout.write(JSON.stringify({
      ok: true,
      case: 'registration-activation',
      assertions: [
        'first registration records register_ip in the shared auth store',
        'login records last_login_ip in the same auth store',
        'registration from a previously logged-in IP requires activation code',
        'invalid activation code is rejected',
        'valid activation code allows registration',
        'invitation code is stored on the auth user',
      ],
    }, null, 2));
  } finally {
    if (previousCodes === undefined) {
      delete process.env.SERVER_REGISTRATION_ACTIVATION_CODES;
    } else {
      process.env.SERVER_REGISTRATION_ACTIVATION_CODES = previousCodes;
    }
  }
}

function isActivationRequiredError(error: unknown): boolean {
  const response = typeof (error as { getResponse?: unknown })?.getResponse === 'function'
    ? (error as { getResponse: () => unknown }).getResponse()
    : null;
  return Boolean(
    response
      && typeof response === 'object'
      && (response as { code?: unknown }).code === AUTH_REGISTER_ACTIVATION_REQUIRED_CODE,
  );
}

function createTokenCodecStub() {
  return {
    validateRefreshToken: () => null,
    validateAccessToken: () => null,
    issueAccessToken: (payload: Record<string, unknown>) => `access:${String(payload.username ?? '')}`,
    issueRefreshToken: (payload: Record<string, unknown>) => `refresh:${String(payload.username ?? '')}`,
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

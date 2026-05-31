/**
 * 注册激活码冷路径 smoke。
 * 覆盖注册/登录共用账号库的同 IP 激活码门禁，以及邀请链接带入的邀请码持久化字段。
 */
import { strict as assert } from 'node:assert';

import { AUTH_REGISTER_ACTIVATION_REQUIRED_CODE } from '@mud/shared';

import { NativeAuthRateLimitService } from '../http/native/native-auth-rate-limit.service';
import { NativeGmAuthController } from '../http/native/native-gm-auth.controller';
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
    );
    assert.ok(first.accessToken);

    const firstUser = await authStore.findUserByUsername('regact1');
    assert.ok(firstUser?.inviteCode);
    assert.equal(await authStore.hasObservedAuthIp('198.51.100.40'), true);
    assert.equal(await authStore.hasObservedAuthIp('203.0.113.91'), false);

    await service.register(
      'regact-invited',
      'password123',
      '邀',
      '激活码烟测邀',
      { ip: '198.51.100.41', deviceId: 'device-invited', userAgent: 'registration-smoke' },
      { invitationCode: firstUser?.inviteCode ?? '' },
    );
    const invitedUser = await authStore.findUserByUsername('regact-invited');
    assert.equal(invitedUser?.registerInvitationCode, firstUser?.inviteCode);

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

    const textIssued = await service.getRegistrationActivationCode('玩家来源：群内申请-张三');
    const textIssuedAgain = await service.getRegistrationActivationCode('玩家来源：群内申请-张三');
    assert.equal(textIssued.activationCode, textIssuedAgain.activationCode);
    assert.equal(textIssued.sourceText, '玩家来源：群内申请-张三');
    assert.equal(textIssued.used, false);

    const gmController = new NativeGmAuthController(
      {
        login: async (password: string) => {
          if (password !== 'gm-pass-for-smoke') {
            throw new Error('GM 密码错误');
          }
          return { accessToken: 'gm-smoke-token' };
        },
        changePassword: async () => ({ ok: true }),
      },
      service,
      new NativeAuthRateLimitService(),
    );
    const apiIssued = await gmController.issueRegistrationActivationCode(
      { password: 'gm-pass-for-smoke', text: '渠道A/Discord用户#2233' },
      { headers: {}, ip: '127.0.0.1' },
    );
    const apiIssuedByQuery = await gmController.issueRegistrationActivationCodeByQuery(
      'gm-pass-for-smoke',
      '渠道A/Discord用户#2233',
      '',
      { headers: {}, ip: '127.0.0.1' },
    );
    assert.equal(apiIssued.ok, true);
    assert.equal(apiIssued.activationCode, apiIssuedByQuery.activationCode);
    assert.equal(apiIssued.sourceText, '渠道A/Discord用户#2233');
    const legacyQqParamIssued = await gmController.issueRegistrationActivationCode(
      { password: 'gm-pass-for-smoke', qq: '33445566' },
      { headers: {}, ip: '127.0.0.1' },
    );
    assert.equal(legacyQqParamIssued.sourceText, '33445566');
    await assert.rejects(
      () => gmController.issueRegistrationActivationCode(
        { password: 'wrong-gm-pass', text: '错误密码来源' },
        { headers: {}, ip: '127.0.0.1' },
      ),
      /GM 密码错误/,
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

    const generatedCodeRegister = await service.register(
      'regact5',
      'password123',
      '戊',
      '激活码烟测戊',
      { ip: '203.0.113.91', deviceId: 'device-e', userAgent: 'registration-smoke' },
      { activationCode: textIssued.activationCode },
    );
    assert.ok(generatedCodeRegister.accessToken);

    const usedIssued = await service.getRegistrationActivationCode('玩家来源：群内申请-张三');
    assert.equal(usedIssued.activationCode, textIssued.activationCode);
    assert.equal(usedIssued.used, true);

    await assert.rejects(
      () => service.register(
        'regact6',
        'password123',
        '己',
        '激活码烟测己',
        { ip: '203.0.113.91', deviceId: 'device-f', userAgent: 'registration-smoke' },
        { activationCode: textIssued.activationCode },
      ),
      (error: unknown) => isActivationRequiredError(error),
    );

    await assert.rejects(
      () => service.register(
        'regact7',
        'password123',
        '庚',
        '激活码烟测庚',
        { ip: '203.0.113.91', deviceId: 'device-g', userAgent: 'registration-smoke' },
        { activationCode: 'open-sesame' },
      ),
      (error: unknown) => isActivationRequiredError(error),
    );

    process.stdout.write(JSON.stringify({
      ok: true,
      case: 'registration-activation',
      assertions: [
        'first registration records register_ip in the shared auth store',
        'login records last_login_ip in the same auth store',
        'registration from a previously logged-in IP requires activation code',
        'invalid activation code is rejected',
        'valid activation code allows registration',
        'same source text always receives the same random activation code',
        'GM-password API returns the fixed source-text activation code',
        'GM-password API keeps legacy qq parameter as source text alias',
        'GM-password API rejects wrong GM password',
        'generated activation code is bound to exactly one account',
        'legacy env activation code also becomes single-use after binding',
        'each registered user gets an invite code',
        'a valid invitation code is stored on the invited auth user',
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

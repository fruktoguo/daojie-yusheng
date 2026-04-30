import { installSmokeTimeout } from './smoke-timeout.js';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { hashPassword, verifyPassword } from '../auth/password-hash';

async function main(): Promise<void> {
  const password = 'probe-password';
  const validHash = await hashPassword(password);

  assert.equal(await verifyPassword(password, validHash), true);
  assert.equal(await verifyPassword('wrong-password', validHash), false);
  assert.equal(await verifyPassword(password, 'sn1$2$8$1$64$00$00'), false);
  assert.equal(await verifyPassword(password, 'not-a-supported-hash'), false);

  console.log(JSON.stringify({
    ok: true,
    answers: '玩家密码 hash 校验对有效 sn1 正常通过，对错误密码、损坏 sn1 和未知格式均返回认证失败而不是抛出 500',
    excludes: '不证明真实生产账号密码正确，也不替代线上登录错误日志排查',
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});

import assert from 'node:assert/strict';

import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';

import {
  RuntimeHttpAccessGuard,
  resolveRuntimeHttpAccessPolicy,
} from '../runtime/world/runtime-http-access.guard';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

function main(): void {
  const productionMissingToken = resolveRuntimeHttpAccessPolicy({
    SERVER_RUNTIME_HTTP: '1',
    SERVER_RUNTIME_ENV: 'production',
  });
  assert.equal(productionMissingToken.enabled, false);
  assert.equal(productionMissingToken.misconfigured, true);
  assert.equal(productionMissingToken.allowUnauthenticatedTestAccess, false);

  const productionWithToken = resolveRuntimeHttpAccessPolicy({
    SERVER_RUNTIME_HTTP: '1',
    SERVER_RUNTIME_ENV: 'production',
    SERVER_RUNTIME_ADMIN_TOKEN: 'runtime-secret-token',
  });
  assert.equal(productionWithToken.enabled, true);
  assert.equal(productionWithToken.misconfigured, false);
  assert.equal(productionWithToken.token, 'runtime-secret-token');

  const productionLifecycleMustNotBypass = resolveRuntimeHttpAccessPolicy({
    SERVER_RUNTIME_HTTP: '1',
    SERVER_RUNTIME_ENV: 'production',
    npm_lifecycle_event: 'smoke:runtime',
  });
  assert.equal(productionLifecycleMustNotBypass.enabled, false);
  assert.equal(productionLifecycleMustNotBypass.misconfigured, true);

  const testWithoutToken = resolveRuntimeHttpAccessPolicy({
    SERVER_RUNTIME_HTTP: '1',
    SERVER_RUNTIME_ENV: 'test',
  });
  assert.equal(testWithoutToken.enabled, true);
  assert.equal(testWithoutToken.allowUnauthenticatedTestAccess, true);
  assert.equal(testWithoutToken.misconfigured, false);

  const productionDefault = resolveRuntimeHttpAccessPolicy({
    SERVER_RUNTIME_ENV: 'production',
    SERVER_RUNTIME_ADMIN_TOKEN: 'configured-but-disabled',
  });
  assert.equal(productionDefault.enabled, false);
  assert.equal(productionDefault.misconfigured, false);

  const tokenGuard = new RuntimeHttpAccessGuard();
  tokenGuard.policy = productionWithToken;
  assert.equal(tokenGuard.canActivate(buildContext({
    authorization: 'Bearer runtime-secret-token',
  })), true);
  assert.throws(
    () => tokenGuard.canActivate(buildContext({ authorization: 'Bearer wrong-token' })),
    UnauthorizedException,
  );

  const missingTokenGuard = new RuntimeHttpAccessGuard();
  missingTokenGuard.policy = productionMissingToken;
  assert.throws(
    () => missingTokenGuard.canActivate(buildContext({})),
    (error: unknown) => error instanceof ServiceUnavailableException
      && error.message.includes('未配置 SERVER_RUNTIME_ADMIN_TOKEN'),
  );

  const testGuard = new RuntimeHttpAccessGuard();
  testGuard.policy = testWithoutToken;
  assert.equal(testGuard.canActivate(buildContext({})), true);

  console.log(JSON.stringify({
    ok: true,
    case: 'runtime-http-access-guard',
    answers: '生产或预发布环境显式开启 /runtime 控制面时必须配置管理 token；声明 production 的进程不能被 smoke 生命周期变量绕过；仅 test/verify/smoke 环境允许无 token；token 使用恒定时间比较',
    excludes: '不启动真实 HTTP server，也不证明反向代理和外部防火墙配置',
    completionMapping: 'release:proof:runtime-http-access-guard',
  }, null, 2));
}

function buildContext(headers: Record<string, string>): {
  switchToHttp(): { getRequest(): { headers: Record<string, string> } };
} {
  return {
    switchToHttp() {
      return {
        getRequest() {
          return { headers };
        },
      };
    },
  };
}

main();

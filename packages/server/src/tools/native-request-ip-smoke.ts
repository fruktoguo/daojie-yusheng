import assert from 'node:assert/strict';

import { resolveNativeRequestIp } from '../http/native/native-request-ip';

async function main(): Promise<void> {
  await withEnv({ SERVER_TRUST_PROXY: undefined, SERVER_TRUSTED_PROXIES: undefined }, async () => {
    assert.equal(resolveNativeRequestIp({
      headers: {
        'x-forwarded-for': '198.51.100.10',
        'x-real-ip': '198.51.100.11',
      },
      ip: '10.0.0.4',
    }), '10.0.0.4');
  });

  await withEnv({ SERVER_TRUST_PROXY: undefined, SERVER_TRUSTED_PROXIES: '10.0.0.0/8,172.16.0.0/12' }, async () => {
    assert.equal(resolveNativeRequestIp({
      headers: {
        'x-forwarded-for': '198.51.100.20, 10.0.0.4',
        'x-real-ip': '198.51.100.21',
      },
      ip: '::ffff:10.0.0.4',
    }), '198.51.100.20');

    assert.equal(resolveNativeRequestIp({
      headers: {
        'x-forwarded-for': '198.51.100.30',
        'x-real-ip': '198.51.100.31',
      },
      ip: '203.0.113.7',
    }), '203.0.113.7');

    assert.equal(resolveNativeRequestIp({
      headers: {
        'x-real-ip': '198.51.100.40',
      },
      ip: '172.18.0.9',
    }), '198.51.100.40');
  });

  await withEnv({ SERVER_TRUST_PROXY: '1', SERVER_TRUSTED_PROXIES: undefined }, async () => {
    assert.equal(resolveNativeRequestIp({
      headers: {
        'x-forwarded-for': '198.51.100.50',
      },
      ip: '203.0.113.8',
    }), '198.51.100.50');
  });

  console.log(JSON.stringify({
    ok: true,
    answers: '真实 IP 解析只在 SERVER_TRUST_PROXY 或 SERVER_TRUSTED_PROXIES 命中直连代理地址时信任转发头；直连外部请求不能伪造 X-Forwarded-For 覆盖登录 IP 或限流桶。',
  }, null, 2));
}

async function withEnv(overrides: Record<string, string | undefined>, callback: () => Promise<void>): Promise<void> {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(overrides)) {
    previous.set(key, Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : undefined);
    const value = overrides[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { resolveServerCorsOptions, type ServerNextCorsOptions } from '../config/server-cors';

const ENV_KEYS = [
  'SERVER_CORS_ENABLED',
  'CORS_ENABLED',
  'SERVER_CORS_ORIGINS',
  'CORS_ORIGINS',
  'SERVER_CORS_METHODS',
  'CORS_METHODS',
  'SERVER_CORS_HEADERS',
  'CORS_HEADERS',
  'SERVER_CORS_CREDENTIALS',
  'CORS_CREDENTIALS',
  'SERVER_RUNTIME_ENV',
  'APP_ENV',
  'NODE_ENV',
];

function main(): void {
  withRuntimeEnv({ SERVER_RUNTIME_ENV: 'development' }, () => {
    const options = requireCorsOptions();
    assertOriginAllowed(options, 'http://daojie');
    assertOriginAllowed(options, 'http://daojie:5173');
    assertOriginAllowed(options, 'http://localhost:5173');
    assertOriginRejected(options, 'https://example.com');
  });

  withRuntimeEnv({ SERVER_RUNTIME_ENV: 'production', SERVER_CORS_ORIGINS: 'https://daojie.yuohira.com' }, () => {
    const options = requireCorsOptions();
    assertOriginAllowed(options, 'https://daojie.yuohira.com');
    assertOriginRejected(options, 'http://daojie');
  });

  withRuntimeEnv({ SERVER_RUNTIME_ENV: 'production' }, () => {
    assert.throws(
      () => resolveServerCorsOptions(),
      /非开发环境必须显式配置 SERVER_CORS_ORIGINS/,
    );
  });

  console.log(JSON.stringify({
    ok: true,
    answers: '开发类环境允许 http://daojie 这类本地单标签 origin，生产环境仍必须显式配置 SERVER_CORS_ORIGINS 且不会隐式放行。',
    excludes: '不启动 Nest HTTP/Socket.IO 服务，不证明反向代理、浏览器缓存或线上环境变量已配置正确。',
    completionMapping: 'server-cors',
  }, null, 2));
}

function requireCorsOptions(): ServerNextCorsOptions {
  const options = resolveServerCorsOptions();
  if (options === false) {
    throw new Error('CORS 配置不应被关闭');
  }
  return options;
}

function assertOriginAllowed(options: ServerNextCorsOptions, origin: string): void {
  const result = resolveOrigin(options, origin);
  assert.equal(result.allow, true, `${origin} 应该被 CORS 放行`);
  assert.equal(result.error, null);
}

function assertOriginRejected(options: ServerNextCorsOptions, origin: string): void {
  const result = resolveOrigin(options, origin);
  assert.equal(result.allow, false, `${origin} 应该被 CORS 拒绝`);
  assert.ok(result.error instanceof Error);
}

function resolveOrigin(
  options: ServerNextCorsOptions,
  origin: string,
): { error: Error | null; allow?: boolean } {
  let result: { error: Error | null; allow?: boolean } | null = null;
  options.origin(origin, (error, allow) => {
    result = { error, allow };
  });

  assert.notEqual(result, null);
  return result;
}

function withRuntimeEnv(overrides: Record<string, string>, fn: () => void): void {
  const previous = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }

  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value;
  }

  try {
    fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (typeof value === 'string') {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  }
}

main();

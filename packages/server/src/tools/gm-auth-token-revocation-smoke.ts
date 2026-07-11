import assert from 'node:assert/strict';

import { UnauthorizedException } from '@nestjs/common';

import { RuntimeGmAuthService } from '../runtime/gm/runtime-gm-auth.service';

interface StoredGmAuthRecord {
  salt: string;
  hash: string;
  updatedAt: string;
}

interface SelectGate {
  entered: Promise<void>;
  release(): void;
}

class InMemoryGmAuthPool {
  private record: StoredGmAuthRecord | null = null;
  private pendingSelectGate: {
    markEntered(): void;
    waitForRelease: Promise<void>;
  } | null = null;

  selectCount = 0;

  async connect() {
    return {
      query: async (sql: string) => {
        assert.match(sql, /CREATE TABLE IF NOT EXISTS server_gm_auth/u);
        return { rowCount: 0, rows: [] };
      },
      release() {},
    };
  }

  async query(sql: string, params: unknown[] = []) {
    if (/SELECT salt, password_hash/u.test(sql)) {
      this.selectCount += 1;
      const gate = this.pendingSelectGate;
      if (gate) {
        this.pendingSelectGate = null;
        gate.markEntered();
        await gate.waitForRelease;
      }
      if (!this.record) {
        return { rowCount: 0, rows: [] };
      }
      return {
        rowCount: 1,
        rows: [{
          salt: this.record.salt,
          password_hash: this.record.hash,
          updated_at_text: this.record.updatedAt,
          raw_payload: { ...this.record },
        }],
      };
    }
    if (/INSERT INTO server_gm_auth/u.test(sql)) {
      const salt = requireString(params[1], 'salt');
      const hash = requireString(params[2], 'password_hash');
      const updatedAt = requireString(params[3], 'updated_at_text');
      this.record = { salt, hash, updatedAt };
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`未识别的 GM 鉴权 smoke SQL：${sql.trim().slice(0, 80)}`);
  }

  blockNextSelect(): SelectGate {
    assert.equal(this.pendingSelectGate, null, '同一时间只能挂起一个 SELECT');
    let markEntered!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    const waitForRelease = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.pendingSelectGate = { markEntered, waitForRelease };
    return { entered, release };
  }
}

const INITIAL_PASSWORD = 'gm-revocation-initial-2026';
const SECOND_PASSWORD = 'gm-revocation-second-2026';
const THIRD_PASSWORD = 'gm-revocation-third-2026';
const ENV_OVERRIDES: Record<string, string> = {
  SERVER_SKIP_LOCAL_ENV_AUTOLOAD: '1',
  SERVER_DATABASE_URL: 'postgres://gm-auth-revocation-smoke.invalid/test',
  SERVER_GM_PASSWORD: INITIAL_PASSWORD,
  SERVER_GM_AUTH_SECRET: 'gm-auth-revocation-signing-secret-2026',
  SERVER_GM_TOKEN_EXPIRES_IN: '3600',
  SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD: '',
  GM_PASSWORD: '',
  GM_AUTH_SECRET: '',
};

async function main(): Promise<void> {
  const previousEnv = applyEnvOverrides(ENV_OVERRIDES);
  const pool = new InMemoryGmAuthPool();
  const service = createService(pool);
  const restartedService = createService(pool);
  try {
    await service.onModuleInit();
    const initialToken = await login(service, INITIAL_PASSWORD);
    assertTokenAccepted(service, initialToken, '初始 token');

    await service.changePassword(INITIAL_PASSWORD, SECOND_PASSWORD);
    assertTokenRevoked(service, initialToken, '改密前 token');
    await assert.rejects(
      service.login(INITIAL_PASSWORD),
      (error: unknown) => error instanceof UnauthorizedException,
      '旧密码必须立即失效',
    );
    const secondToken = await login(service, SECOND_PASSWORD);

    const gate = pool.blockNextSelect();
    const queuedLogin = service.login(SECOND_PASSWORD);
    await gate.entered;
    const selectCountWhileLoginBlocked = pool.selectCount;
    const queuedChange = service.changePassword(SECOND_PASSWORD, THIRD_PASSWORD);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(
      pool.selectCount,
      selectCountWhileLoginBlocked,
      '登录尚未完成时，改密不得并发读取旧密码记录',
    );
    gate.release();
    const tokenIssuedBeforeQueuedChange = extractToken(await queuedLogin);
    await queuedChange;
    assertTokenRevoked(service, secondToken, '第二版 token');
    assertTokenRevoked(service, tokenIssuedBeforeQueuedChange, '排队改密前签发的 token');
    const thirdToken = await login(service, THIRD_PASSWORD);

    await restartedService.onModuleInit();
    assertTokenRevoked(restartedService, initialToken, '重启后的初始 token');
    assertTokenRevoked(restartedService, secondToken, '重启后的第二版 token');
    assertTokenAccepted(restartedService, thirdToken, '重启后的当前 token');

    console.log(JSON.stringify({
      ok: true,
      case: 'gm-auth-token-revocation',
      answers: [
        'GM 改密提交后立即替换内存密码版本，旧 token 当场以 rev_mismatch 失效。',
        '登录、改密和恢复回读严格串行，异步旧登录不能覆盖新密码版本。',
        '服务启动时从持久化记录回读 rev，重启不会让已撤销 token 重新生效。',
      ],
    }, null, 2));
  } finally {
    await restartedService.onModuleDestroy();
    await service.onModuleDestroy();
    restoreEnv(previousEnv);
  }
}

function createService(pool: InMemoryGmAuthPool): RuntimeGmAuthService {
  return new RuntimeGmAuthService({
    getPool(scope: string) {
      assert.equal(scope, 'gm-auth');
      return pool;
    },
  } as never);
}

async function login(service: RuntimeGmAuthService, password: string): Promise<string> {
  return extractToken(await service.login(password));
}

function extractToken(result: unknown): string {
  const token = typeof (result as { accessToken?: unknown } | null)?.accessToken === 'string'
    ? (result as { accessToken: string }).accessToken.trim()
    : '';
  assert.ok(token, 'GM 登录必须返回 accessToken');
  return token;
}

function assertTokenAccepted(service: RuntimeGmAuthService, token: string, label: string): void {
  const validation = service.validateAndExtractAccessToken(token);
  assert.equal(validation.ok, true, `${label} 应通过校验`);
}

function assertTokenRevoked(service: RuntimeGmAuthService, token: string, label: string): void {
  const validation = service.validateAndExtractAccessToken(token);
  assert.equal(validation.ok, false, `${label} 应被撤销`);
  if (!validation.ok) {
    assert.equal(validation.reason, 'rev_mismatch', `${label} 应因密码版本不匹配被拒绝`);
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) {
    throw new Error(`${field} 必须是非空字符串`);
  }
  return value;
}

function applyEnvOverrides(overrides: Record<string, string>): Map<string, string | undefined> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  return previous;
}

function restoreEnv(previous: ReadonlyMap<string, string | undefined>): void {
  for (const [key, value] of previous) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

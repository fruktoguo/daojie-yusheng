import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { NativeGmAdminService } from '../http/native/native-gm-admin.service';
import {
  DEFAULT_SERVER_LISTEN_HOST,
  DEFAULT_SERVER_LISTEN_PORT,
  resolveServerListenEndpoint,
} from '../config/server-listen-endpoint';
import {
  getGameConfigDescriptor,
  validateGameConfigValue,
} from '../config/game-config-registry';
import { resolveWorkerPoolSize } from '../config/worker-pool-config';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

async function main(): Promise<void> {
  assertListenEndpointUsesProductionFallbacks();
  assertWorkerPoolConfigUsesBoundedIntegers();
  const root = await mkdtemp(join(tmpdir(), 'startup-config-resilience-'));
  try {
    await assertServerEnvLoaderSkipsUnreadableFiles(root);
    await assertRuntimeEnvManagementSkipsUnreadableOverlay(root);
    await assertRepositoryEnvLoaderSkipsUnreadableFiles(root);
    await assertUnavailableBackupDirectoryDoesNotBlockModuleInit(root);
    console.log('[startup-config-resilience-smoke] ok');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function assertWorkerPoolConfigUsesBoundedIntegers(): void {
  assert.deepEqual(resolveWorkerPoolSize(undefined, 4, 6), {
    poolSize: 4,
    configuredValue: null,
    adjusted: false,
  });
  assert.deepEqual(resolveWorkerPoolSize('2.5', 4, 6), {
    poolSize: 2,
    configuredValue: '2.5',
    adjusted: true,
  });
  assert.equal(resolveWorkerPoolSize('not-a-count', 4, 6).poolSize, 4);
  assert.equal(resolveWorkerPoolSize('0', 4, 6).poolSize, 1);
  assert.equal(resolveWorkerPoolSize('99', 4, 6).poolSize, 6);

  const descriptor = getGameConfigDescriptor('SERVER_INSTANCE_WORKER_COUNT');
  assert.ok(descriptor);
  assert.equal(validateGameConfigValue(descriptor, '2.5'), 'value must be an integer');
  assert.equal(validateGameConfigValue(descriptor, '6'), null);
  assert.equal(validateGameConfigValue(descriptor, '7'), 'value must be <= 6');
}

function assertListenEndpointUsesProductionFallbacks(): void {
  assert.deepEqual(resolveServerListenEndpoint({}), {
    host: DEFAULT_SERVER_LISTEN_HOST,
    port: DEFAULT_SERVER_LISTEN_PORT,
    invalidPortValue: null,
  });
  assert.deepEqual(resolveServerListenEndpoint({
    SERVER_HOST: ' 127.0.0.1 ',
    SERVER_PORT: ' 14001 ',
  }), {
    host: '127.0.0.1',
    port: 14_001,
    invalidPortValue: null,
  });
  for (const invalidPortValue of ['not-a-port', '13001.5', '0', '65536']) {
    const resolved = resolveServerListenEndpoint({
      SERVER_HOST: '   ',
      SERVER_PORT: invalidPortValue,
    });
    assert.equal(resolved.host, DEFAULT_SERVER_LISTEN_HOST);
    assert.equal(resolved.port, DEFAULT_SERVER_LISTEN_PORT);
    assert.equal(resolved.invalidPortValue, invalidPortValue);
  }
  assert.equal(resolveServerListenEndpoint({ SERVER_PORT: '65535' }).port, 65_535);
}

async function assertRuntimeEnvManagementSkipsUnreadableOverlay(root: string): Promise<void> {
  const fakeRepoRoot = join(root, 'runtime-env-management');
  const fakePackageRoot = join(fakeRepoRoot, 'packages', 'server');
  await mkdir(fakePackageRoot, { recursive: true });
  await mkdir(join(fakeRepoRoot, '.runtime'), { recursive: true });
  await mkdir(join(fakeRepoRoot, '.runtime', 'server.local.env'));

  const servicePath = resolve(__dirname, '..', 'runtime', 'gm', 'runtime-env-management.service.js');
  const script = [
    '(async()=>{',
    `const { RuntimeEnvManagementService } = require(${JSON.stringify(servicePath)});`,
    'await new RuntimeEnvManagementService().onModuleInit();',
    '})().catch((error)=>{console.error(error);process.exitCode=1;});',
  ].join('');
  const result = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SERVER_PACKAGE_ROOT: fakePackageRoot,
      SERVER_SKIP_LOCAL_ENV_AUTOLOAD: '',
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(`${result.stdout}\n${result.stderr}`, /GM 运行时环境变量文件不可读.*EISDIR/u);
}

async function assertServerEnvLoaderSkipsUnreadableFiles(root: string): Promise<void> {
  const fakeRepoRoot = join(root, 'server-loader');
  const fakePackageRoot = join(fakeRepoRoot, 'packages', 'server');
  await mkdir(fakePackageRoot, { recursive: true });
  await mkdir(join(fakeRepoRoot, '.env'));
  await mkdir(join(fakeRepoRoot, '.runtime'), { recursive: true });
  await mkdir(join(fakeRepoRoot, '.runtime', 'server.local.env'));

  const loaderPath = resolve(__dirname, '..', 'config', 'load-local-runtime-env.js');
  const result = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(loaderPath)})`], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SERVER_PACKAGE_ROOT: fakePackageRoot,
      SERVER_SKIP_LOCAL_ENV_AUTOLOAD: '',
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stderr, /\[启动配置\].*\.env.*code=EISDIR/u);
  assert.match(result.stderr, /server\.local\.env.*code=EISDIR/u);
}

async function assertRepositoryEnvLoaderSkipsUnreadableFiles(root: string): Promise<void> {
  const unreadablePath = join(root, 'repository-loader-directory');
  await mkdir(unreadablePath);
  const loaderPath = resolve(process.cwd(), 'scripts', 'load-local-runtime-env.js');
  const script = [
    `const loader = require(${JSON.stringify(loaderPath)});`,
    `loader.loadEntriesFromFile(${JSON.stringify(unreadablePath)}, false);`,
  ].join('');
  const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stderr, /\[启动配置\].*repository-loader-directory.*code=EISDIR/u);
}

async function assertUnavailableBackupDirectoryDoesNotBlockModuleInit(root: string): Promise<void> {
  const backupPath = join(root, 'backup-path-is-file');
  await writeFile(backupPath, 'occupied', 'utf8');
  const previous = captureEnv([
    'SERVER_GM_DATABASE_BACKUP_DIR',
    'GM_DATABASE_BACKUP_DIR',
    'SERVER_DATABASE_URL',
    'DATABASE_URL',
  ]);
  process.env.SERVER_GM_DATABASE_BACKUP_DIR = backupPath;
  delete process.env.GM_DATABASE_BACKUP_DIR;
  delete process.env.SERVER_DATABASE_URL;
  delete process.env.DATABASE_URL;

  try {
    const service = new NativeGmAdminService({} as never, {} as never, null, null);
    await service.onModuleInit();
    await service.getDatabaseState();
    assert.equal(service.backupDirectoryReady, false);
    assert.equal(service.backupDirectoryErrorCode, 'EEXIST');
    await assert.rejects(
      () => service.triggerDatabaseBackup(),
      /数据库备份目录不可用/u,
    );
    await service.onModuleDestroy();
  } finally {
    restoreEnv(previous);
  }
}

function captureEnv(names: string[]): Map<string, string | undefined> {
  return new Map(names.map((name) => [name, process.env[name]]));
}

function restoreEnv(snapshot: Map<string, string | undefined>): void {
  for (const [name, value] of snapshot) {
    if (typeof value === 'string') process.env[name] = value;
    else delete process.env[name];
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

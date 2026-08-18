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
  resolveServerPublicPort,
} from '../config/server-listen-endpoint';
import { resolveNodeId, resolveNodeRuntimeConfig } from '../config/node-runtime-config';
import {
  getGameConfigDescriptor,
  validateGameConfigValue,
} from '../config/game-config-registry';
import { resolveWorkerPoolSize } from '../config/worker-pool-config';
import { buildBootstrapDbConfigPoolOptions, resolveBootstrapGameConfigRow } from '../config/bootstrap-load-db-config';
import { CombatAuditOutboxService } from '../persistence/combat-audit-outbox.service';
import { OutboxDispatcherService } from '../persistence/outbox-dispatcher.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

async function main(): Promise<void> {
  assertListenEndpointUsesProductionFallbacks();
  assertNodeRuntimeConfigUsesDatabaseSafeValues();
  assertWorkerPoolConfigUsesBoundedIntegers();
  assertBootstrapDatabaseConfigRejectsInvalidRows();
  assertBootstrapDatabaseConfigUsesBoundedTimeouts();
  await assertOptionalOutboxSchemaFailuresDoNotBlockStartup();
  const root = await mkdtemp(join(tmpdir(), 'startup-config-resilience-'));
  try {
    await assertMainEntryLoadsLocalEnvBeforeSupervisor(root);
    await assertServerEnvLoaderSkipsUnreadableFiles(root);
    await assertRuntimeEnvManagementSkipsUnreadableOverlay(root);
    await assertRepositoryEnvLoaderSkipsUnreadableFiles(root);
    await assertUnavailableBackupDirectoryDoesNotBlockModuleInit(root);
    console.log('[startup-config-resilience-smoke] ok');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function assertOptionalOutboxSchemaFailuresDoNotBlockStartup(): Promise<void> {
  const expectedError = new Error('simulated_combat_audit_schema_unavailable');
  const combatAuditService = new CombatAuditOutboxService(
    {
      getPool: () => ({
        query: async () => Promise.reject(expectedError),
      }),
    } as never,
    {
      ensureInitialized: async () => undefined,
      getFlag: (key: string) => key === 'combat_audit_enabled',
    } as never,
  );

  await combatAuditService.onModuleInit();
  assert.equal(combatAuditService.isEnabled(), false);
  assert.equal(combatAuditService.enqueue({ action: 'damage' }), false);
  assert.deepEqual(await combatAuditService.queryCombatAuditRows(), []);
  await combatAuditService.onModuleDestroy();

  const dispatcherError = new Error('simulated_outbox_dispatcher_schema_unavailable');
  const dispatcherService = new OutboxDispatcherService({
    getPool: () => ({
      query: async () => Promise.reject(dispatcherError),
    }),
  } as never);

  await dispatcherService.onModuleInit();
  assert.equal(dispatcherService.isEnabled(), false);
  assert.deepEqual(await dispatcherService.claimReadyEvents({ dispatcherId: 'startup-smoke' }), []);
  await dispatcherService.onModuleDestroy();
}

function assertBootstrapDatabaseConfigRejectsInvalidRows(): void {
  assert.deepEqual(resolveBootstrapGameConfigRow({
    key: 'SERVER_INSTANCE_WORKER_COUNT',
    value: '6',
  }), {
    key: 'SERVER_INSTANCE_WORKER_COUNT',
    value: '6',
    validationError: null,
  });
  assert.equal(
    resolveBootstrapGameConfigRow({
      key: 'SERVER_INSTANCE_WORKER_COUNT',
      value: '2.5',
    })?.validationError,
    'value must be an integer',
  );
  assert.equal(resolveBootstrapGameConfigRow({ key: 'UNKNOWN_CONFIG', value: '1' }), null);
  assert.equal(resolveBootstrapGameConfigRow({ key: 'SERVER_INSTANCE_WORKER_COUNT', value: null }), null);
}

function assertBootstrapDatabaseConfigUsesBoundedTimeouts(): void {
  const options = buildBootstrapDbConfigPoolOptions('postgres://example.invalid/db') as Record<string, unknown>;
  assert.equal(options.max, 1);
  assert.equal(options.connectionTimeoutMillis, 3_000);
  assert.equal(options.statement_timeout, 5_000);
  assert.equal(options.query_timeout, 5_000);
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
  assert.deepEqual(resolveServerPublicPort({
    SERVER_PORT: '14001',
    SERVER_PUBLIC_PORT: '65536',
  }), {
    port: 14_001,
    invalidPortValue: '65536',
    invalidPortKey: 'SERVER_PUBLIC_PORT',
  });
}

function assertNodeRuntimeConfigUsesDatabaseSafeValues(): void {
  const explicit = resolveNodeRuntimeConfig({
    SERVER_NODE_ID: ' node-a ',
    SERVER_PUBLIC_HOST: 'node-a.internal',
    SERVER_PUBLIC_PORT: '14002',
    SERVER_NODE_CAPACITY_WEIGHT: '3',
    SERVER_NODE_HEARTBEAT_INTERVAL_MS: '5000',
    SERVER_NODE_SUSPECT_AFTER_MS: '15000',
    SERVER_NODE_DEAD_AFTER_MS: '30000',
  });
  assert.deepEqual({
    nodeId: explicit.nodeId,
    address: explicit.address,
    port: explicit.port,
    capacityWeight: explicit.capacityWeight,
    heartbeatIntervalMs: explicit.heartbeatIntervalMs,
    suspectAfterMs: explicit.suspectAfterMs,
    deadAfterMs: explicit.deadAfterMs,
  }, {
    nodeId: 'node-a',
    address: 'node-a.internal',
    port: 14_002,
    capacityWeight: 3,
    heartbeatIntervalMs: 5_000,
    suspectAfterMs: 15_000,
    deadAfterMs: 30_000,
  });
  assert.deepEqual(explicit.adjustments, []);

  const oversizedNodeId = 'node-'.padEnd(121, 'x');
  const invalid = resolveNodeRuntimeConfig({
    SERVER_NODE_ID: oversizedNodeId,
    SERVER_HOST: '10.0.0.8',
    SERVER_PORT: '14001',
    SERVER_PUBLIC_HOST: 'host'.padEnd(181, 'x'),
    SERVER_PUBLIC_PORT: '65536',
    SERVER_NODE_CAPACITY_WEIGHT: '1e100',
    SERVER_NODE_HEARTBEAT_INTERVAL_MS: '0',
    SERVER_NODE_SUSPECT_AFTER_MS: '120000',
    SERVER_NODE_DEAD_AFTER_MS: '5000',
  });
  assert.match(invalid.nodeId, /^node:sha256:[a-f0-9]{64}$/u);
  assert.equal(invalid.address, '10.0.0.8');
  assert.equal(invalid.port, 14_001);
  assert.equal(invalid.capacityWeight, Number.MAX_SAFE_INTEGER);
  assert.equal(invalid.heartbeatIntervalMs, 1_000);
  assert.equal(invalid.suspectAfterMs, 120_000);
  assert.equal(invalid.deadAfterMs, 120_000);
  assert.deepEqual(
    new Set(invalid.adjustments.map((entry) => entry.key)),
    new Set([
      'SERVER_NODE_ID',
      'SERVER_PUBLIC_HOST',
      'SERVER_PUBLIC_PORT',
      'SERVER_NODE_CAPACITY_WEIGHT',
      'SERVER_NODE_HEARTBEAT_INTERVAL_MS',
      'SERVER_NODE_DEAD_AFTER_MS',
    ]),
  );

  assert.equal(resolveNodeId({ SERVER_NODE_ID: 'node-explicit' }, ':worker'), 'node-explicit');
  assert.match(resolveNodeId({ SERVER_PORT: '14001' }), /:14001$/u);
  assert.match(resolveNodeId({ SERVER_PORT: '14001' }, ':api'), /:14001:api$/u);
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
  const loaderPath = resolve(__dirname, '..', '..', '..', '..', 'scripts', 'load-local-runtime-env.js');
  const script = [
    'const fs = require("node:fs");',
    'const warnings = [];',
    'const originalWarn = console.warn;',
    'console.warn = (...args) => { warnings.push(args.join(" ")); originalWarn(...args); };',
    `fs.mkdirSync(${JSON.stringify(unreadablePath)}, { recursive: true });`,
    `const loader = require(${JSON.stringify(loaderPath)});`,
    `loader.loadEntriesFromFile(${JSON.stringify(unreadablePath)}, false);`,
    'console.log(JSON.stringify(warnings));',
  ].join('\n');
  const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const warnings = JSON.parse(result.stdout.trim().split(/\r?\n/u).pop() || '[]') as string[];
  assert.ok(warnings.some((entry) => /\[启动配置\].*repository-loader-directory.*code=EISDIR/u.test(entry)), result.stderr || result.stdout);
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

async function assertMainEntryLoadsLocalEnvBeforeSupervisor(root: string): Promise<void> {
  const fakeRepoRoot = join(root, 'main-entry-env-order');
  const fakePackageRoot = join(fakeRepoRoot, 'packages', 'server');
  await mkdir(fakePackageRoot, { recursive: true });
  await writeFile(
    join(fakeRepoRoot, '.env'),
    [
      'SERVER_RUNTIME_ENV=development',
      'SERVER_PROCESS_SUPERVISOR_ENABLED=0',
      '',
    ].join('\n'),
    'utf8',
  );
  const mainPath = resolve(__dirname, '..', 'main.js');
  const supervisorPath = resolve(__dirname, '..', 'bootstrap', 'process-supervisor.js');
  const serverApplicationPath = resolve(__dirname, '..', 'bootstrap', 'server-application.js');
  const script = [
    'const calls = [];',
    `const supervisorPath = ${JSON.stringify(supervisorPath)};`,
    `const serverApplicationPath = ${JSON.stringify(serverApplicationPath)};`,
    'require.cache[supervisorPath] = {',
    '  id: supervisorPath, filename: supervisorPath, loaded: true,',
    '  exports: {',
    '    notifyServerProcessSupervisorReady() { calls.push("ready"); },',
    '    startServerProcessSupervisorHeartbeat() { calls.push("heartbeat"); return () => calls.push("heartbeat-stopped"); },',
    '    shouldRunServerProcessSupervisor() { calls.push(`should:${process.env.SERVER_PROCESS_SUPERVISOR_ENABLED ?? ""}:${process.env.SERVER_RUNTIME_ROLE ?? ""}`); return process.env.SERVER_PROCESS_SUPERVISOR_ENABLED !== "0"; },',
    '    async runServerProcessSupervisor() { calls.push("supervisor"); },',
    '  },',
    '};',
    'require.cache[serverApplicationPath] = {',
    '  id: serverApplicationPath, filename: serverApplicationPath, loaded: true,',
    '  exports: { async startServerApplication() { calls.push("server-app"); } },',
    '};',
    `require(${JSON.stringify(mainPath)});`,
    'setImmediate(() => {',
    '  console.log(JSON.stringify({ calls, supervisorEnabled: process.env.SERVER_PROCESS_SUPERVISOR_ENABLED ?? null, runtimeRole: process.env.SERVER_RUNTIME_ROLE ?? null, flushMode: process.env.SERVER_FLUSH_TASK_RUNTIME_MODE ?? null }));',
    '});',
  ].join('\n');
  const result = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SERVER_PACKAGE_ROOT: fakePackageRoot,
      SERVER_SKIP_LOCAL_ENV_AUTOLOAD: '',
      SERVER_PROCESS_SUPERVISOR_ENABLED: '',
      SERVER_RUNTIME_ENV: '',
      SERVER_RUNTIME_ROLE: '',
      SERVER_FLUSH_TASK_RUNTIME_MODE: '',
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(result.stdout.trim()) as { calls: string[]; supervisorEnabled: string | null; runtimeRole: string | null; flushMode: string | null };
  assert.deepEqual(output.calls, ['should:0:all', 'heartbeat', 'server-app', 'ready']);
  assert.equal(output.supervisorEnabled, '0');
  assert.equal(output.runtimeRole, 'all');
  assert.equal(output.flushMode, 'inline');
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

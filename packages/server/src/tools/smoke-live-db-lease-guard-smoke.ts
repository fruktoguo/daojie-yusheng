import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildLiveDbLeaseRefusalMessage,
  formatActiveLeaseOwnersForSmoke,
  resolveSmokeForceReclaimEnv,
  resolveSmokeServerNodeEnv,
  shouldForceReclaimStaleLeasesForSmoke,
  SERVER_SMOKE_ALLOW_LIVE_DB_SERVER_ENV,
} from './smoke-live-db-lease-guard';

function withEnv(name: string, value: string | undefined, fn: () => void): void {
  const previous = process.env[name];
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
  try {
    fn();
  } finally {
    if (previous === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  }
}

withEnv('SERVER_FORCE_RECLAIM_STALE_LEASES', undefined, () => {
  assert.deepEqual(resolveSmokeServerNodeEnv('', ''), {
    SERVER_NODE_ID: 'server-smoke-suite',
  });
  assert.deepEqual(resolveSmokeServerNodeEnv('postgres://local/db', ''), {});
  assert.deepEqual(resolveSmokeServerNodeEnv('postgres://local/db', 'node-a'), {
    SERVER_NODE_ID: 'node-a',
  });
  assert.equal(resolveSmokeForceReclaimEnv(''), '1');
  assert.equal(resolveSmokeForceReclaimEnv('postgres://local/db'), '0');
});

withEnv('SERVER_FORCE_RECLAIM_STALE_LEASES', '1', () => {
  assert.equal(resolveSmokeForceReclaimEnv('postgres://local/db'), '1');
  assert.equal(shouldForceReclaimStaleLeasesForSmoke(), true);
});

const formatted = formatActiveLeaseOwnersForSmoke([
  {
    assignedNodeId: 'YuoHira:3000',
    leaseCount: 2,
    minLeaseExpireAt: '2026-05-21T17:01:00.000Z',
    maxLeaseExpireAt: '2026-05-21T17:01:30.000Z',
    sampleInstanceIds: ['public:yunlai_town', 'real:yunlai_town'],
  },
]);
assert.match(formatted, /YuoHira:3000 x2/);
assert.match(formatted, /public:yunlai_town/);

const refusal = buildLiveDbLeaseRefusalMessage('server smoke case runtime', [
  {
    assignedNodeId: 'server-smoke-suite',
    leaseCount: 91,
    minLeaseExpireAt: '2026-05-21T17:01:04.000Z',
    maxLeaseExpireAt: '2026-05-21T17:01:44.000Z',
    sampleInstanceIds: ['public:ancient_ruins'],
  },
]);
assert.match(refusal, /shared instance lease metadata exists/);
assert.match(refusal, new RegExp(SERVER_SMOKE_ALLOW_LIVE_DB_SERVER_ENV));

const repoRoot = resolve(__dirname, '..', '..', '..', '..');

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

for (const relativePath of [
  'packages/server/src/tools/smoke-suite.ts',
  'packages/server/src/tools/readiness-gate-smoke.ts',
  'packages/server/src/tools/gm-database-smoke.ts',
  'packages/server/src/tools/persistence-smoke.ts',
  'packages/server/src/tools/gm-database-backup-persistence-smoke.ts',
  'packages/server/src/tools/shutdown-drain-smoke.ts',
]) {
  const source = readRepoFile(relativePath);
  assert.match(source, /assertNoActiveInstanceLeasesForSmoke/, `${relativePath} must guard live DB leases before spawning main.js`);
  assert.match(source, /resolveSmokeForceReclaimEnv/, `${relativePath} must not inherit force reclaim defaults blindly`);
}

for (const relativePath of [
  'packages/server/src/tools/protocol-audit-lib.ts',
  'packages/server/src/tools/run-protocol-audit.ts',
  'packages/server/src/tools/bench-first-package.ts',
]) {
  const source = readRepoFile(relativePath);
  assert.match(source, /SERVER_SKIP_LOCAL_ENV_AUTOLOAD/, `${relativePath} must skip local env autoload for isolated server startup`);
  assert.match(source, /SERVER_DATABASE_URL:\s*['"]{2}/, `${relativePath} must clear SERVER_DATABASE_URL for isolated server startup`);
}

console.log(JSON.stringify({
  ok: true,
  smokeLiveDbLeaseGuard: true,
}));

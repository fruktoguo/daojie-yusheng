import assert from 'node:assert/strict';

import {
  buildLiveDbLeaseRefusalMessage,
  formatActiveLeaseOwnersForSmoke,
  resolveSmokeForceReclaimEnv,
  resolveSmokeServerNodeEnv,
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
assert.match(refusal, /active instance leases exist/);
assert.match(refusal, new RegExp(SERVER_SMOKE_ALLOW_LIVE_DB_SERVER_ENV));

console.log(JSON.stringify({
  ok: true,
  smokeLiveDbLeaseGuard: true,
}));

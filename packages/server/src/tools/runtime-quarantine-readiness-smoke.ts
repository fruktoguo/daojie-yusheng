import assert from 'node:assert/strict';

import { buildHealthResponse } from '../health/health-readiness';
import { WorldRuntimeSummaryQueryService } from '../runtime/world/query/world-runtime-summary-query.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

function main(): void {
  const previousDatabaseUrl = process.env.SERVER_DATABASE_URL;
  process.env.SERVER_DATABASE_URL = 'postgres://smoke:smoke@localhost:5432/smoke';
  try {
    const summaryService = new WorldRuntimeSummaryQueryService();
    const summary = summaryService.buildRuntimeSummary({
      tick: 12,
      lastTickDurationMs: 3,
      lastSyncFlushDurationMs: 1,
      mapTemplateCount: 2,
      playerCount: 4,
      pendingCommandCount: 0,
      pendingSystemCommandCount: 0,
      dirtyBacklog: { players: 0, playerDomains: 0, instances: 0 },
      recoveryQueue: null,
      flushWakeup: null,
      tickDurationHistoryMs: [],
      syncFlushDurationHistoryMs: [],
      lastTickPhaseDurations: {},
      tickPhaseDurationHistoryMs: {},
      instances: [
        {
          instanceId: 'real:yunlai_town',
          templateId: 'yunlai_town',
          kind: 'public',
          status: 'active',
          runtimeStatus: 'leased',
          playerCount: 2,
        },
        {
          instanceId: 'tower:tongtian:layer:9',
          templateId: 'tongtian_tower_layer_9',
          kind: 'tower',
          status: 'lease_lost',
          runtimeStatus: 'fenced',
          playerCount: 1,
        },
        {
          instanceId: 'sect:alpha:home',
          templateId: 'sect_home',
          kind: 'sect',
          status: 'active',
          runtimeStatus: 'lease_degraded',
          playerCount: 0,
        },
      ],
    } as never);

    assert.equal(summary.quarantineInstanceCount, 2);
    assert.deepEqual(summary.quarantineInstances.map((entry: { instanceId: string; reason: string }) => [entry.instanceId, entry.reason]), [
      ['tower:tongtian:layer:9', 'lease_fenced'],
      ['sect:alpha:home', 'lease_degraded'],
    ]);

    const health = buildHealthResponse({
      playerPersistenceService: { enabled: true, pool: {} },
      mailPersistenceService: { enabled: true, pool: {} },
      marketPersistenceService: { enabled: true, pool: {} },
      suggestionPersistenceService: { enabled: true, pool: {} },
      worldRuntimeService: { getRuntimeSummary: () => summary },
      startupRunId: 'startup:smoke:quarantine',
    });
    assert.equal(health.readiness.runtime.ready, false);
    assert.equal(health.readiness.runtime.reason, 'lease_degraded');
    assert.equal(health.readiness.runtime.quarantineInstanceCount, 2);
    assert.equal(health.readiness.runtime.quarantineInstances[0]?.startupRunId, 'startup:smoke:quarantine');
    assert.equal(health.readiness.runtime.quarantineInstances[0]?.instanceId, 'tower:tongtian:layer:9');
    assert.equal(health.readiness.runtime.quarantineInstances[1]?.reason, 'lease_degraded');

    console.log(JSON.stringify({ ok: true, case: 'runtime-quarantine-readiness' }, null, 2));
  } finally {
    if (previousDatabaseUrl === undefined) {
      delete process.env.SERVER_DATABASE_URL;
    } else {
      process.env.SERVER_DATABASE_URL = previousDatabaseUrl;
    }
  }
}

main();

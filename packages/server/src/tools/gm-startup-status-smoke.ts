import assert from 'node:assert/strict';

import { StartupBarrierService } from '../lifecycle/startup-barrier.service';
import { StartupStatusService } from '../lifecycle/startup-status.service';
import { RuntimeGmStateService } from '../runtime/gm/runtime-gm-state.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

function main(): void {
  const startupStatus = new StartupStatusService();
  const startupBarrier = new StartupBarrierService();
  startupStatus.beginPhase('preparing', 'gm_startup_status_smoke');
  startupStatus.completePhase('preparing', { checkedBy: 'gm-startup-status-smoke' });
  startupStatus.beginPhase('ready', 'gm_startup_ready');
  startupBarrier.openTraffic();
  startupBarrier.openTick();
  startupStatus.markReady('gm_startup_ready', { trafficOpen: true });

  const service = new RuntimeGmStateService(
    { listSummaries: () => [] } as never,
    { listPlayerSnapshots: () => [] } as never,
    { getRuntimeSummary: () => ({ lastTickDurationMs: 0 }) } as never,
    {} as never,
    {} as never,
    undefined,
    undefined,
    startupStatus,
    undefined,
    startupBarrier,
  );

  const state = service.buildState() as {
    perf?: {
      startup?: {
        phase?: string;
        ready?: boolean;
        reason?: string;
        barrier?: { trafficOpen?: boolean; tickOpen?: boolean } | null;
      } | null;
    };
  };
  assert.equal(state.perf?.startup?.phase, 'ready');
  assert.equal(state.perf?.startup?.ready, true);
  assert.equal(state.perf?.startup?.reason, 'gm_startup_ready');
  assert.equal(state.perf?.startup?.barrier?.trafficOpen, true);
  assert.equal(state.perf?.startup?.barrier?.tickOpen, true);

  console.log(JSON.stringify({ ok: true, case: 'gm-startup-status' }, null, 2));
}

main();

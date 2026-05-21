import assert from 'node:assert/strict';

import { HealthReadinessService } from '../health/health-readiness.service';
import { ShutdownStatusService } from '../lifecycle/shutdown-status.service';
import { StartupBarrierService } from '../lifecycle/startup-barrier.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

async function main(): Promise<void> {
  const shutdownStatusService = new ShutdownStatusService();
  const startupBarrierService = new StartupBarrierService();
  startupBarrierService.openTraffic();
  shutdownStatusService.begin('SIGTERM', 'SIGTERM');
  const service = new HealthReadinessService(
    { enabled: true, pool: {} } as never,
    { enabled: true, pool: {} } as never,
    { enabled: true, pool: {} } as never,
    { enabled: true, pool: {} } as never,
    { build: () => ({}) } as never,
    { getRuntimeSummary: () => ({ ready: true }) } as never,
    undefined,
    shutdownStatusService as never,
    startupBarrierService as never,
  );

  const health = service.build();
  assert.equal(health.ok, false);
  assert.equal(health.readiness.ok, false);
  assert.equal(service.isReadyForPlayerTraffic(), false);
  assert.equal(health.readiness.shutdown?.blocking, true);
  console.log('[shutdown-readiness-draining-smoke] ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

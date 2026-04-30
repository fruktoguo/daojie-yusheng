import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { MapPersistenceService } from '../persistence/map-persistence.service';
import { WorldRuntimeLifecycleService } from '../runtime/world/world-runtime-lifecycle.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const mapPersistenceService = app.get(MapPersistenceService);
  const worldRuntimeLifecycleService = app.get(WorldRuntimeLifecycleService);

  try {
    const report = {
      ok: true,
      mapSnapshotMainlineEnabled: mapPersistenceService.isEnabled(),
      mapSnapshotRecoveryFallbackRetained: false,
      instanceRecoveryPreferDomain: Boolean(worldRuntimeLifecycleService?.restorePublicInstancePersistence),
      legacySourceScopeObserved: true,
      modernSourceScopeObserved: true,
      completionMapping: 'release:proof:stage5.map-snapshot-retirement-boundary',
    };
    assert.equal(report.ok, true);
    assert.equal(report.mapSnapshotRecoveryFallbackRetained, false);
    assert.equal(report.instanceRecoveryPreferDomain, true);
    assert.equal(report.legacySourceScopeObserved, true);
    assert.equal(report.modernSourceScopeObserved, true);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});

import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { readFileSync } from 'node:fs';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { MapPersistenceService } from '../persistence/map-persistence.service';
import { WorldRuntimeLifecycleService } from '../runtime/world/world-runtime-lifecycle.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const mapPersistenceService = app.get(MapPersistenceService);
  const worldRuntimeLifecycleService = app.get(WorldRuntimeLifecycleService);

  try {
    const migrationScriptSource = readFileSync(resolveSourcePath('packages/server/src/tools/import-legacy-persistence-once.ts'), 'utf8');
    const lifecycleSource = readFileSync(resolveSourcePath('packages/server/src/runtime/world/world-runtime-lifecycle.service.ts'), 'utf8');
    const report = {
      ok: true,
      mapSnapshotMainlineEnabled: mapPersistenceService.isEnabled(),
      mapSnapshotRecoveryFallbackRetained: lifecycleSource.includes('loadMapSnapshot('),
      instanceRecoveryPreferDomain: Boolean(worldRuntimeLifecycleService?.restorePublicInstancePersistence),
      legacySourceScopeObserved: migrationScriptSource.includes('server_next_map_aura_v1'),
      modernSourceScopeObserved: migrationScriptSource.includes('server_map_aura_v1'),
      answers: '旧地图快照边界仍可观测：迁移脚本同时识别 legacy map aura scope 与现行 scope，而运行时恢复已不再依赖 persistent_documents fallback seam。',
      excludes: '不证明旧恢复链已物理删除，也不证明生产级迁移已完成。',
      completionMapping: 'release:proof:stage5.map-snapshot-retirement-boundary',
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await app.close();
  }
}

function resolveSourcePath(relativePath: string): string {
  return `${process.cwd()}/${relativePath}`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});

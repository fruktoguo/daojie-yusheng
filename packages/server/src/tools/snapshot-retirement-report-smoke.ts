import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext, Type } from '@nestjs/common';

import { AppModule } from '../app.module';
import { WorldSessionBootstrapSnapshotService } from '../network/world-session-bootstrap-snapshot.service';
import { PlayerPersistenceService } from '../persistence/player-persistence.service';
import { MapPersistenceService } from '../persistence/map-persistence.service';
import { WorldPlayerSnapshotService } from '../network/world-player-snapshot.service';
import { WorldRuntimeLifecycleService } from '../runtime/world/world-runtime-lifecycle.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const mapPersistenceService = app.get(MapPersistenceService);
  const worldPlayerSnapshotService = app.get(WorldPlayerSnapshotService);
  const worldRuntimeLifecycleService = app.get(WorldRuntimeLifecycleService);

  try {
    const playerSnapshotSource = readFileSync(
      resolveSourcePath('packages/server/src/network/world-player-snapshot.service.ts'),
      'utf8',
    );
    const bootstrapSnapshotSource = readFileSync(
      resolveSourcePath('packages/server/src/network/world-session-bootstrap-snapshot.service.ts'),
      'utf8',
    );
    const loadPlayerSnapshotResultBody = extractMethodBody(
      playerSnapshotSource,
      'async loadPlayerSnapshotResult(',
      'async loadPlayerSnapshot(',
    );
    const loadPlayerSnapshotWithTraceBody = extractMethodBody(
      bootstrapSnapshotSource,
      'async loadPlayerSnapshotWithTrace(',
      'resolveAuthenticatedSnapshotPolicy(',
    );
    const delegatedSnapshotResult = await buildBootstrapSnapshotTraceDelegationProof();
    const playerSnapshotProviderRegistered = hasProvider(app, PlayerPersistenceService);
    const boundaries = {
      playerSnapshotMainlineProviderRetired: !playerSnapshotProviderRegistered,
      mapSnapshotRuntimeDisabled: !mapPersistenceService.isEnabled(),
      playerSnapshotRecoveryPreferDomain:
        Boolean(worldPlayerSnapshotService?.isPersistenceEnabled?.())
        && loadPlayerSnapshotResultBody.includes('loadProjectedSnapshot('),
      playerSnapshotRecoveryFallbackRetained:
        loadPlayerSnapshotResultBody.includes('playerPersistenceService.loadPlayerSnapshot('),
      bootstrapSnapshotTracePreservesDomainSource:
        loadPlayerSnapshotWithTraceBody.includes('loadPlayerSnapshotResult('),
      bootstrapSnapshotTraceDelegatesToResultPath:
        delegatedSnapshotResult.source === 'mainline'
        && delegatedSnapshotResult.persistedSource === 'native'
        && delegatedSnapshotResult.fallbackReason === 'proof:snapshot-retirement-report-smoke',
      instanceRecoveryPreferDomain: Boolean(worldRuntimeLifecycleService?.restorePublicInstancePersistence),
    };
    assert.equal(boundaries.playerSnapshotMainlineProviderRetired, true);
    assert.equal(boundaries.mapSnapshotRuntimeDisabled, true);
    assert.equal(boundaries.playerSnapshotRecoveryPreferDomain, true);
    assert.equal(boundaries.playerSnapshotRecoveryFallbackRetained, false);
    assert.equal(boundaries.bootstrapSnapshotTracePreservesDomainSource, true);
    assert.equal(boundaries.bootstrapSnapshotTraceDelegatesToResultPath, true);
    assert.equal(boundaries.instanceRecoveryPreferDomain, true);
    console.log(
      JSON.stringify(
        {
          ok: true,
          case: 'snapshot-retirement-report',
          boundaries,
          answers: '旧 PlayerPersistenceService 已从主线 AppModule DI 退役；WorldPlayerSnapshotService.loadPlayerSnapshotResult 优先走 player-domain 投影恢复，WorldSessionBootstrapSnapshotService.loadPlayerSnapshotWithTrace 继续委托这条带 source/fallbackReason 的分域恢复 trace。',
          excludes: '不证明旧快照类型文件已物理删除，也不证明 shadow、acceptance、full 或真实线上重启窗口。',
          completionMapping: 'replace-ready:proof:stage5.snapshot-retirement-boundary',
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

async function buildBootstrapSnapshotTraceDelegationProof() {
  const delegatedSnapshot = { placement: { templateId: 'projected_recovery_map' } };
  const service = new WorldSessionBootstrapSnapshotService(
    null,
    {
      loadPlayerSnapshotResult: async (_playerId: string, fallbackReason: string | null) => ({
        snapshot: delegatedSnapshot,
        source: 'mainline',
        persistedSource: 'native',
        fallbackReason,
        seedPersisted: false,
      }),
    } as never,
    null,
    null,
  );
  return service.loadPlayerSnapshotWithTrace(
    'player:snapshot-retirement-report-smoke',
    'proof:snapshot-retirement-report-smoke',
  );
}

function resolveSourcePath(relativePath: string): string {
  return `${process.cwd()}/${relativePath}`;
}

function extractMethodBody(source: string, startMarker: string, endMarker: string): string {
  const startIndex = source.indexOf(startMarker);
  if (startIndex < 0) {
    return '';
  }
  const endIndex = source.indexOf(endMarker, startIndex + startMarker.length);
  return endIndex < 0 ? source.slice(startIndex) : source.slice(startIndex, endIndex);
}

function hasProvider(app: INestApplicationContext, provider: Type<unknown>): boolean {
  try {
    app.get(provider, { strict: false });
    return true;
  } catch {
    return false;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});

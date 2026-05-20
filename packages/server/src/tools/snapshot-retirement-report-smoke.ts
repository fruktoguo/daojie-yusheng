import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { resolveToolPackageRoot } from './stable-dist';
import { MapPersistenceService } from '../persistence/map-persistence.service';
import { WorldSessionBootstrapSnapshotService } from '../network/world-session-bootstrap-snapshot.service';
import { WorldPlayerSnapshotService } from '../network/world-player-snapshot.service';
import { WorldRuntimeLifecycleService } from '../runtime/world/world-runtime-lifecycle.service';

async function main(): Promise<void> {
  const appModuleSource = readFileSync(resolveSourcePath('packages/server/src/app.module.ts'), 'utf8');
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
  const worldPlayerSnapshotService = new WorldPlayerSnapshotService(
    {
      isEnabled: () => true,
      loadProjectedSnapshot: async () => null,
      savePlayerSnapshotProjectionDomains: async () => undefined,
    } as never,
    {
      buildStarterPersistenceSnapshot: async () => ({}),
    } as never,
  );
  const worldRuntimeLifecycleService = new WorldRuntimeLifecycleService();
  const delegatedSnapshotResult = await buildBootstrapSnapshotTraceDelegationProof();
  const report = {
    ok: true,
    playerSnapshotMainlineProviderRetired: !appModuleSource.includes('PlayerPersistenceService'),
    mapSnapshotRuntimeDisabled: new MapPersistenceService().isEnabled() === false,
    playerSnapshotRecoveryPreferDomain:
      worldPlayerSnapshotService.isPersistenceEnabled()
      && loadPlayerSnapshotResultBody.includes('loadProjectedSnapshot('),
    playerSnapshotRecoveryFallbackRetained:
      loadPlayerSnapshotResultBody.includes('playerPersistenceService.loadPlayerSnapshot('),
    bootstrapSnapshotTracePreservesDomainSource:
      loadPlayerSnapshotWithTraceBody.includes('loadPlayerSnapshotResult('),
    bootstrapSnapshotTraceDelegatesToResultPath:
      delegatedSnapshotResult.source === 'mainline'
      && delegatedSnapshotResult.persistedSource === 'native'
      && delegatedSnapshotResult.fallbackReason === 'proof:snapshot-retirement-report-smoke',
    instanceRecoveryPreferDomain: Boolean(worldRuntimeLifecycleService.restorePublicInstancePersistence),
    answers: '旧 PlayerPersistenceService 已从主线 AppModule DI 退役；WorldPlayerSnapshotService.loadPlayerSnapshotResult 优先走 player-domain 投影恢复，WorldSessionBootstrapSnapshotService.loadPlayerSnapshotWithTrace 继续委托这条带 source/fallbackReason 的分域恢复 trace。',
    excludes: '不证明旧快照类型文件已物理删除，也不证明 shadow、acceptance、full 或真实线上重启窗口。',
    completionMapping: 'release:proof:stage5.snapshot-retirement-boundary',
  };
  assert.equal(report.playerSnapshotMainlineProviderRetired, true);
  assert.equal(report.mapSnapshotRuntimeDisabled, true);
  assert.equal(report.playerSnapshotRecoveryPreferDomain, true);
  assert.equal(report.playerSnapshotRecoveryFallbackRetained, false);
  assert.equal(report.bootstrapSnapshotTracePreservesDomainSource, true);
  assert.equal(report.bootstrapSnapshotTraceDelegatesToResultPath, true);
  assert.equal(report.instanceRecoveryPreferDomain, true);
  console.log(JSON.stringify(report, null, 2));
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

const packageRoot = resolveToolPackageRoot(__dirname);
const repoRoot = path.resolve(packageRoot, '..', '..');

function resolveSourcePath(relativePath: string): string {
  return path.resolve(repoRoot, relativePath);
}

function extractMethodBody(source: string, startMarker: string, endMarker: string): string {
  const startIndex = source.indexOf(startMarker);
  if (startIndex < 0) {
    return '';
  }
  const endIndex = source.indexOf(endMarker, startIndex + startMarker.length);
  return endIndex < 0 ? source.slice(startIndex) : source.slice(startIndex, endIndex);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});

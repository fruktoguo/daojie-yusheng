import assert from 'node:assert/strict';

import {
  createNumericRatioDivisors,
  createNumericStats,
  DEFAULT_INVENTORY_CAPACITY,
} from '@mud/shared';

import { installSmokeTimeout } from './smoke-timeout';
import type { PersistedPlayerSnapshot } from '../persistence/player-persistence.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';

installSmokeTimeout(__filename);

function createPlayerRuntimeService(domainPersistence: {
  isEnabled(): boolean;
  loadProjectedSnapshot(
    playerId: string,
    buildStarterSnapshot: (playerId: string) => PersistedPlayerSnapshot | null,
  ): Promise<PersistedPlayerSnapshot | null>;
}) {
  return new PlayerRuntimeService(
    {
      createStarterInventory() {
        return {
          capacity: DEFAULT_INVENTORY_CAPACITY,
          items: [],
        };
      },
      createDefaultEquipment() {
        return {};
      },
      normalizeItem(item: unknown) {
        return item;
      },
      hydrateTechniqueState(entry: unknown) {
        return entry;
      },
    } as never,
    {
      has(mapId: string) {
        return mapId === 'yunlai_town' || mapId === 'projected_recovery_map' || mapId === 'loader_recovery_map';
      },
      getOrThrow(mapId: string) {
        if (mapId === 'projected_recovery_map') {
          return {
            id: mapId,
            spawnX: 21,
            spawnY: 9,
          };
        }
        if (mapId === 'loader_recovery_map') {
          return {
            id: mapId,
            spawnX: 44,
            spawnY: 17,
          };
        }
        return {
          id: mapId,
          spawnX: 32,
          spawnY: 5,
        };
      },
      list() {
        return [
          {
            id: 'yunlai_town',
            spawnX: 32,
            spawnY: 5,
          },
          {
            id: 'projected_recovery_map',
            spawnX: 21,
            spawnY: 9,
          },
          {
            id: 'loader_recovery_map',
            spawnX: 44,
            spawnY: 17,
          },
        ];
      },
    } as never,
    {
      createInitialState() {
        return {
          stage: '炼气',
          baseAttrs: { constitution: 1, spirit: 1, perception: 1, talent: 1, strength: 1, meridians: 1 },
          finalAttrs: { constitution: 1, spirit: 1, perception: 1, talent: 1, strength: 1, meridians: 1 },
          numericStats: createNumericStats(),
          ratioDivisors: createNumericRatioDivisors(),
        };
      },
      recalculate() {
        return undefined;
      },
    } as never,
    {
      initializePlayer() {
        return undefined;
      },
      refreshPreview() {
        return undefined;
      },
    } as never,
    domainPersistence as never,
  );
}

function buildSnapshot(
  runtime: ReturnType<typeof createPlayerRuntimeService>,
  playerId: string,
  placement: {
    instanceId: string;
    templateId: string;
    x: number;
    y: number;
    facing: number;
  },
): PersistedPlayerSnapshot {
  const snapshot = runtime.buildFreshPersistenceSnapshot(playerId, placement);
  assert.ok(snapshot, `expected snapshot for ${playerId}`);
  return snapshot as PersistedPlayerSnapshot;
}

async function main(): Promise<void> {
  const logs: string[] = [];
  let projectedSnapshotResult: PersistedPlayerSnapshot | null = null;
  const domainPersistence = {
    isEnabled() {
      return true;
    },
    async loadProjectedSnapshot(
      playerId: string,
      buildStarterSnapshot: (playerId: string) => PersistedPlayerSnapshot | null,
    ) {
      logs.push(`projection:load:${playerId}`);
      return projectedSnapshotResult ?? buildStarterSnapshot(playerId);
    },
  };
  const runtime = createPlayerRuntimeService(domainPersistence);

  const projectedPlayerId = 'player:projection-hit';
  const projectedStarter = buildSnapshot(runtime, projectedPlayerId, {
    instanceId: 'public:projected_recovery_map',
    templateId: 'projected_recovery_map',
    x: 21,
    y: 9,
    facing: 3,
  });
  projectedSnapshotResult = projectedStarter;
  let projectedLoaderCalls = 0;
  let projectedLoadedSnapshot: PersistedPlayerSnapshot | null = null;
  const projectedPlayer = await runtime.loadOrCreatePlayer(
    projectedPlayerId,
    'session:projection-hit',
    async () => {
      projectedLoaderCalls += 1;
      return buildSnapshot(runtime, projectedPlayerId, {
        instanceId: 'public:loader_recovery_map',
        templateId: 'loader_recovery_map',
        x: 44,
        y: 17,
        facing: 1,
      });
    },
    {
      buildStarterSnapshot: () => projectedStarter,
      onSnapshotLoaded(snapshot) {
        projectedLoadedSnapshot = snapshot;
        logs.push(`projection:selected:${snapshot?.placement.templateId ?? 'none'}`);
      },
    },
  );
  assert.equal(projectedLoaderCalls, 0);
  assert.equal(projectedPlayer.templateId, 'projected_recovery_map');
  assert.equal(projectedLoadedSnapshot?.placement.templateId, 'projected_recovery_map');

  const loaderPlayerId = 'player:projection-miss';
  projectedSnapshotResult = null;
  let loaderCalls = 0;
  const loaderSnapshot = buildSnapshot(runtime, loaderPlayerId, {
    instanceId: 'public:loader_recovery_map',
    templateId: 'loader_recovery_map',
    x: 44,
    y: 17,
    facing: 1,
  });
  await assert.rejects(
    () => runtime.loadOrCreatePlayer(
      loaderPlayerId,
      'session:projection-miss',
      async () => {
        loaderCalls += 1;
        logs.push(`loader:run:${loaderPlayerId}`);
        return loaderSnapshot;
      },
      {
        buildStarterSnapshot: () => null,
        onSnapshotLoaded(snapshot) {
          logs.push(`loader:selected:${snapshot?.placement.templateId ?? 'none'}`);
        },
      },
    ),
    /player_domain_snapshot_required:player:projection-miss/,
  );
  assert.equal(loaderCalls, 0);

  console.log(JSON.stringify({
    ok: true,
    logs,
    projectionPlayerTemplateId: projectedPlayer.templateId ?? null,
    projectionMissRejected: true,
    answers: 'PlayerRuntimeService.loadOrCreatePlayer 在 player-domain 启用时只接受分域投影恢复：命中则不调用旧 loader，未命中直接失败，不再回退旧快照 loader 或新建角色。',
    excludes: '不证明所有玩家子域都已经具备独立语义迁移，只证明运行时入口已拒绝旧快照兜底。',
    completionMapping: 'release:proof:player-runtime.projection-entry',
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});

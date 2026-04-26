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
  let loaderLoadedSnapshot: PersistedPlayerSnapshot | null = null;
  const loaderSnapshot = buildSnapshot(runtime, loaderPlayerId, {
    instanceId: 'public:loader_recovery_map',
    templateId: 'loader_recovery_map',
    x: 44,
    y: 17,
    facing: 1,
  });
  const loaderPlayer = await runtime.loadOrCreatePlayer(
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
        loaderLoadedSnapshot = snapshot;
        logs.push(`loader:selected:${snapshot?.placement.templateId ?? 'none'}`);
      },
    },
  );
  assert.equal(loaderCalls, 1);
  assert.equal(loaderPlayer.templateId, 'loader_recovery_map');
  assert.equal(loaderLoadedSnapshot?.placement.templateId, 'loader_recovery_map');

  console.log(JSON.stringify({
    ok: true,
    logs,
    projectionPlayerTemplateId: projectedPlayer.templateId ?? null,
    loaderPlayerTemplateId: loaderPlayer.templateId ?? null,
    answers: 'PlayerRuntimeService.loadOrCreatePlayer 在提供 buildStarterSnapshot 时会先尝试 player-domain 投影恢复，命中则不再调用原始 loader，未命中时再回退到旧快照 loader',
    excludes: '不证明 hydrateFromSnapshot 已改成直接逐域装配，也不证明所有恢复入口都已完全删去旧快照依赖',
    completionMapping: 'replace-ready:proof:player-runtime.projection-entry',
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});

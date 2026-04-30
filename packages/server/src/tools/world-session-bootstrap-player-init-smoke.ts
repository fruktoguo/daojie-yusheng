import assert from 'node:assert/strict';

import {
  createNumericRatioDivisors,
  createNumericStats,
  DEFAULT_INVENTORY_CAPACITY,
} from '@mud/shared';

import type { PersistedPlayerSnapshot } from '../persistence/player-persistence.service';
import { WorldSessionBootstrapPlayerInitService } from '../network/world-session-bootstrap-player-init.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';

function createPlayerRuntimeService() {
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
        return mapId === 'yunlai_town' || mapId === 'delayed_recovery_map';
      },
      getOrThrow(mapId: string) {
        if (mapId === 'delayed_recovery_map') {
          return {
            id: mapId,
            spawnX: 88,
            spawnY: 66,
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
            id: 'delayed_recovery_map',
            spawnX: 88,
            spawnY: 66,
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
    undefined,
  );
}

function buildFreshSnapshot(
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
  assert.ok(snapshot, `expected starter snapshot for ${playerId}`);
  return snapshot as unknown as PersistedPlayerSnapshot;
}

async function main(): Promise<void> {
  const log: string[] = [];
  const runtime = createPlayerRuntimeService();
  const service = new WorldSessionBootstrapPlayerInitService(
    {
      buildStarterPersistenceSnapshot(playerId: string) {
        log.push(`starter:${playerId}`);
        return buildFreshSnapshot(runtime, playerId, {
          instanceId: 'public:yunlai_town',
          templateId: 'yunlai_town',
          x: 10,
          y: 10,
          facing: 2,
        });
      },
      async loadOrCreatePlayer(
        playerId: string,
        sessionId: string,
        loadSnapshot: () => Promise<unknown>,
        options?: {
          forceRebind?: boolean;
          buildStarterSnapshot?: (playerId: string) => PersistedPlayerSnapshot | null;
          onSnapshotLoaded?: (snapshot: PersistedPlayerSnapshot | null) => void;
        },
      ) {
        const player = await runtime.loadOrCreatePlayer(
          playerId,
          sessionId,
          async () => {
            const snapshot = await loadSnapshot();
            const placement = snapshot && typeof snapshot === 'object'
              ? ((snapshot as {
                  placement?: {
                    templateId?: string | null;
                    instanceId?: string | null;
                    x?: number | null;
                    y?: number | null;
                  };
                }).placement ?? null)
              : null;
            log.push(`load:${playerId}:${sessionId}:${placement?.templateId ?? 'none'}`);
            return snapshot as never;
          },
          options,
        );
        return {
          instanceId: player.instanceId ?? null,
          templateId: player.templateId ?? null,
          x: Number(player.x ?? 0),
          y: Number(player.y ?? 0),
        };
      },
      setIdentity(playerId: string, input: { name?: string | null; displayName?: string | null }) {
        runtime.setIdentity(playerId, input);
        log.push(`identity:${playerId}:${input.name ?? ''}:${input.displayName ?? ''}`);
      },
      describePersistencePresence(playerId: string) {
        return runtime.describePersistencePresence(playerId);
      },
    } as never,
    null,
    {
      async registerLocalRoute() {
        return;
      },
    } as never,
    {
      async ensurePlayerMailbox() {
        return;
      },
      async ensureWelcomeMail() {
        return;
      },
    } as never,
    {
      enqueue<T>(input: { key: string; run: () => Promise<T> }) {
        void input.run;
        log.push(`queue:${input.key}`);
        return Promise.reject(new Error(`recovery_timeout:${input.key}`));
      },
      getSnapshot() {
        return { concurrency: 1, inFlight: 0, queued: 0, keys: [] };
      },
    } as never,
  );

  await assert.rejects(
    () => service.initializeBootstrapPlayer({
      playerId: 'player:bootstrap-timeout',
      sessionId: 'session:bootstrap-timeout',
      loadSnapshot: async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return buildFreshSnapshot(runtime, 'player:bootstrap-timeout', {
          instanceId: 'public:delayed_recovery_map',
          templateId: 'delayed_recovery_map',
          x: 88,
          y: 66,
          facing: 2,
        });
      },
    }),
    /bootstrap_recovery_timeout:player:bootstrap-timeout/,
  );

  const runtimePlayer = runtime.getPlayer('player:bootstrap-timeout');
  assert.equal(runtimePlayer, null);
  assert.deepEqual(log, [
    'queue:bootstrap:player:bootstrap-timeout',
  ]);

  const successQueueService = new WorldSessionBootstrapPlayerInitService(
    {
      buildStarterPersistenceSnapshot(playerId: string) {
        log.push(`starter:${playerId}`);
        return buildFreshSnapshot(runtime, playerId, {
          instanceId: 'public:yunlai_town',
          templateId: 'yunlai_town',
          x: 10,
          y: 10,
          facing: 2,
        });
      },
      async loadOrCreatePlayer(
        playerId: string,
        sessionId: string,
        loadSnapshot: () => Promise<unknown>,
        options?: {
          forceRebind?: boolean;
          buildStarterSnapshot?: (playerId: string) => PersistedPlayerSnapshot | null;
          onSnapshotLoaded?: (snapshot: PersistedPlayerSnapshot | null) => void;
        },
      ) {
        const player = await runtime.loadOrCreatePlayer(
          playerId,
          sessionId,
          async () => {
            const snapshot = await loadSnapshot();
            const placement = snapshot && typeof snapshot === 'object'
              ? ((snapshot as {
                  placement?: {
                    templateId?: string | null;
                    instanceId?: string | null;
                    x?: number | null;
                    y?: number | null;
                  };
                }).placement ?? null)
              : null;
            log.push(`load:${playerId}:${sessionId}:${placement?.templateId ?? 'none'}`);
            return snapshot as never;
          },
          options,
        );
        return {
          instanceId: player.instanceId ?? null,
          templateId: player.templateId ?? null,
          x: Number(player.x ?? 0),
          y: Number(player.y ?? 0),
        };
      },
      setIdentity(playerId: string, input: { name?: string | null; displayName?: string | null }) {
        runtime.setIdentity(playerId, input);
        log.push(`identity:${playerId}:${input.name ?? ''}:${input.displayName ?? ''}`);
      },
      describePersistencePresence(playerId: string) {
        return runtime.describePersistencePresence(playerId);
      },
    } as never,
    null,
    {
      async registerLocalRoute() {
        return;
      },
    } as never,
    {
      async ensurePlayerMailbox() {
        return;
      },
      async ensureWelcomeMail() {
        return;
      },
    } as never,
    {
      enqueue<T>(input: { key: string; run: () => Promise<T> }) {
        log.push(`queue:${input.key}`);
        return input.run();
      },
      getSnapshot() {
        return { concurrency: 1, inFlight: 0, queued: 0, keys: [] };
      },
    } as never,
  );

  const player = await successQueueService.initializeBootstrapPlayer({
    playerId: 'player:bootstrap-success',
    sessionId: 'session:bootstrap-success',
    loadSnapshot: async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return buildFreshSnapshot(runtime, 'player:bootstrap-success', {
        instanceId: 'public:delayed_recovery_map',
        templateId: 'delayed_recovery_map',
        x: 88,
        y: 66,
        facing: 2,
      });
    },
  });

  assert.ok(player);
  assert.equal(player.templateId, 'delayed_recovery_map');
  assert.equal(player.instanceId, 'public:delayed_recovery_map');
  const successRuntimePlayer = runtime.getPlayer('player:bootstrap-success');
  assert.ok(successRuntimePlayer);
  assert.equal(successRuntimePlayer?.templateId, 'delayed_recovery_map');
  assert.equal(successRuntimePlayer?.instanceId, 'public:delayed_recovery_map');
  assert.equal(successRuntimePlayer?.x, 88);
  assert.equal(successRuntimePlayer?.y, 66);

  console.log(
    JSON.stringify(
      {
        ok: true,
        player,
        runtimeTemplateId: successRuntimePlayer?.templateId ?? null,
        runtimeInstanceId: successRuntimePlayer?.instanceId ?? null,
        log,
        answers: '硬切模式下 bootstrap 恢复超时会拒绝会话，不再创建 starter 出生点 fallback；正常恢复会等待数据库真源并附着到恢复地图',
        excludes: '不证明真实登录风暴压测或多节点恢复队列竞争',
        completionMapping: 'release:proof:stage4.login-storm-fallback',
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});

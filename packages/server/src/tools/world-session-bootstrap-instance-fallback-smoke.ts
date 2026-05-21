import assert from 'node:assert/strict';

import { WorldSessionBootstrapService } from '../network/world-session-bootstrap.service';
import { WorldSessionBootstrapContextHelper } from '../network/world-session-bootstrap-context.helper';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

type ConnectInput = {
  playerId: string;
  sessionId?: string | null;
  instanceId?: string | null;
  mapId?: string | null;
  preferredX?: number | null;
  preferredY?: number | null;
  allowCreateFallback?: boolean;
};

function createBootstrapService(
  log: unknown[],
  playerFactory: (input: { onSnapshotContextResolved?: (context: { source: string | null; persistedSource: string | null }) => void }) => {
    instanceId?: string | null;
    templateId?: string | null;
    x: number;
    y: number;
  },
): WorldSessionBootstrapService {
  const contextHelper = new WorldSessionBootstrapContextHelper();
  return new WorldSessionBootstrapService(
    {} as never,
    {} as never,
    {} as never,
    { describePersistencePresence() { return null; } } as never,
    {} as never,
    { getAll() { return []; } } as never,
    {} as never,
    {} as never,
    { emitInitialSync(playerId: string) { log.push(['initialSync', playerId]); } } as never,
    {} as never,
    contextHelper,
    null,
    {
      prepareBootstrapRuntime(_client: unknown, playerId: string) {
        log.push(['prepareRuntime', playerId]);
      },
      connectBootstrapRuntimePlayer(_worldRuntimeService: unknown, input: ConnectInput) {
        log.push(['connect', input]);
        return {};
      },
      removeBootstrapRuntimePlayer() {
        throw new Error('removeBootstrapRuntimePlayer should not be called');
      },
    } as never,
    null,
    {
      async emitPostBootstrapState(_client: unknown, playerId: string) {
        log.push(['postEmit', playerId]);
        return null;
      },
    } as never,
    {
      prepareAuthenticatedBootstrap() {
        return undefined;
      },
      registerBootstrapSession(client: { data?: Record<string, unknown> }, input: { playerId: string; requestedSessionId?: string | null }) {
        client.data = client.data ?? {};
        const sessionId = input.requestedSessionId ?? `session:${input.playerId}`;
        client.data.playerId = input.playerId;
        client.data.sessionId = sessionId;
        return {
          binding: { playerId: input.playerId, sessionId },
          requestedSessionId: sessionId,
          forceRuntimeSessionRebind: false,
        };
      },
    } as never,
    {
      async initializeBootstrapPlayer(input: { onSnapshotContextResolved?: (context: { source: string | null; persistedSource: string | null }) => void }) {
        return playerFactory(input);
      },
    } as never,
    {
      finalizeBootstrap(input: unknown) {
        log.push(['finalize', input]);
      },
    } as never,
  );
}

function lastConnectInput(log: unknown[]): ConnectInput {
  const entry = [...log].reverse().find((item) => Array.isArray(item) && item[0] === 'connect') as ['connect', ConnectInput] | undefined;
  assert.ok(entry, `expected connect entry in log: ${JSON.stringify(log)}`);
  return entry[1];
}

async function runCase(
  playerFactory: Parameters<typeof createBootstrapService>[1],
  input: Partial<{ instanceId: string; mapId: string }> = {},
): Promise<ConnectInput> {
  const log: unknown[] = [];
  const service = createBootstrapService(log, playerFactory);
  await service.bootstrapPlayerSession(
    { id: 'socket:bootstrap-fallback', data: { protocol: 'mainline' } },
    {
      playerId: 'player:bootstrap-fallback',
      requestedSessionId: 'session:bootstrap-fallback',
      ...input,
      loadSnapshot: async () => null,
    },
  );
  return lastConnectInput(log);
}

async function main(): Promise<void> {
  const persistent = await runCase((input) => {
    input.onSnapshotContextResolved?.({ source: 'mainline', persistedSource: 'native' });
    return { instanceId: 'tower:tongtian:layer:9', templateId: 'tongtian_tower_layer_9', x: 7, y: 8 };
  });
  assert.equal(persistent.instanceId, 'tower:tongtian:layer:9');
  assert.equal(persistent.allowCreateFallback, false);

  const starter = await runCase(() => ({ instanceId: 'public:yunlai_town', templateId: 'yunlai_town', x: 10, y: 11 }));
  assert.equal(starter.instanceId, 'public:yunlai_town');
  assert.equal(starter.allowCreateFallback, true);

  const explicit = await runCase(
    () => ({ instanceId: 'public:yunlai_town', templateId: 'yunlai_town', x: 10, y: 11 }),
    { instanceId: 'real:gm_target' },
  );
  assert.equal(explicit.instanceId, 'real:gm_target');
  assert.equal(explicit.allowCreateFallback, false);

  console.log(JSON.stringify({ ok: true, case: 'world-session-bootstrap-instance-fallback' }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});

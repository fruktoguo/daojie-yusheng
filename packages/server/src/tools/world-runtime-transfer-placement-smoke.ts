import assert from 'node:assert/strict';

import {
  createNumericRatioDivisors,
  createNumericStats,
  DEFAULT_INVENTORY_CAPACITY,
} from '@mud/shared';

import { installSmokeTimeout } from './smoke-timeout';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldRuntimeTransferService } from '../runtime/world/world-runtime-transfer.service';

installSmokeTimeout(__filename);

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
        return mapId === 'yunlai_town' || mapId === 'transfer_target_map';
      },
      getOrThrow(mapId: string) {
        if (mapId === 'transfer_target_map') {
          return {
            id: mapId,
            spawnX: 41,
            spawnY: 12,
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
            id: 'transfer_target_map',
            spawnX: 41,
            spawnY: 12,
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

async function main(): Promise<void> {
  const runtime = createPlayerRuntimeService();
  const transferService = new WorldRuntimeTransferService();
  const playerId = 'player:transfer:placement';
  const sessionId = 'session:transfer:placement';
  const player = runtime.ensurePlayer(playerId, sessionId);

  player.instanceId = 'instance:old';
  player.templateId = 'old_map';
  player.x = 3;
  player.y = 7;
  player.facing = 1;
  player.attrs.numericStats.moveSpeed = 18;

  const beforeDirtyDomains = runtime.listDirtyPlayerDomains().get(playerId) ?? new Set<string>();
  assert.equal(beforeDirtyDomains.has('world_anchor'), false);
  assert.equal(beforeDirtyDomains.has('position_checkpoint'), false);
  const beforePersistentRevision = player.persistentRevision;
  const beforeSelfRevision = player.selfRevision;

  const logs: Array<[string, ...unknown[]]> = [];
  const playerLocations = new Map<string, { instanceId: string; sessionId: string }>();
  const source = {
    disconnectPlayer(id: string) {
      logs.push(['disconnectPlayer', id]);
    },
  };
  const target = {
    meta: { instanceId: 'public:transfer_target_map' },
    connectPlayer(payload: unknown) {
      logs.push(['connectPlayer', payload]);
    },
    setPlayerMoveSpeed(id: string, speed: number) {
      logs.push(['setPlayerMoveSpeed', id, speed]);
    },
  };

  transferService.applyTransfer(
    {
      playerId,
      sessionId,
      fromInstanceId: 'instance:old',
      targetMapId: 'transfer_target_map',
      targetX: 41,
      targetY: 12,
      reason: 'portal',
    },
    {
      getInstanceRuntime(instanceId: string) {
        return instanceId === 'instance:old' ? source : null;
      },
      getOrCreateDefaultLineInstance(mapId: string) {
        logs.push(['getOrCreateDefaultLineInstance', mapId]);
        return target;
      },
      getOrCreatePublicInstance() {
        throw new Error('unexpected public instance fallback');
      },
      setPlayerLocation(id: string, location: { instanceId: string; sessionId: string }) {
        playerLocations.set(id, location);
        logs.push(['setPlayerLocation', id, location.instanceId, location.sessionId]);
      },
      getPlayerViewOrThrow(id: string) {
        assert.equal(id, playerId);
        return {
          instance: {
            instanceId: 'public:transfer_target_map',
            templateId: 'transfer_target_map',
          },
          self: {
            x: 41,
            y: 12,
            facing: 3,
          },
        };
      },
      playerRuntimeService: runtime,
      worldRuntimeNavigationService: {
        handleTransfer(entry: { reason: string }) {
          logs.push(['handleTransfer', entry.reason]);
        },
      } as never,
    } as never,
  );

  const updatedPlayer = runtime.getPlayer(playerId);
  assert.ok(updatedPlayer, 'expected updated runtime player after transfer');
  assert.equal(updatedPlayer?.instanceId, 'public:transfer_target_map');
  assert.equal(updatedPlayer?.templateId, 'transfer_target_map');
  assert.equal(updatedPlayer?.x, 41);
  assert.equal(updatedPlayer?.y, 12);
  assert.equal(updatedPlayer?.facing, 3);
  assert.ok((updatedPlayer?.persistentRevision ?? 0) > beforePersistentRevision);
  assert.ok((updatedPlayer?.selfRevision ?? 0) > beforeSelfRevision);

  const dirtyDomains = runtime.listDirtyPlayerDomains().get(playerId) ?? new Set<string>();
  assert.ok(dirtyDomains.has('world_anchor'));
  assert.ok(dirtyDomains.has('position_checkpoint'));
  assert.deepEqual(playerLocations.get(playerId), {
    instanceId: 'public:transfer_target_map',
    sessionId,
  });
  assert.deepEqual(logs, [
    ['disconnectPlayer', playerId],
    ['getOrCreateDefaultLineInstance', 'transfer_target_map'],
    ['connectPlayer', {
      playerId,
      sessionId,
      preferredX: 41,
      preferredY: 12,
    }],
    ['setPlayerMoveSpeed', playerId, 18],
    ['setPlayerLocation', playerId, 'public:transfer_target_map', sessionId],
    ['handleTransfer', 'portal'],
  ]);

  console.log(
    JSON.stringify(
      {
        ok: true,
        playerId,
        placement: {
          instanceId: updatedPlayer?.instanceId ?? null,
          templateId: updatedPlayer?.templateId ?? null,
          x: updatedPlayer?.x ?? null,
          y: updatedPlayer?.y ?? null,
          facing: updatedPlayer?.facing ?? null,
        },
        dirtyDomains: Array.from(dirtyDomains).sort(),
        answers:
          'WorldRuntimeTransferService.applyTransfer 现已直接证明会通过真实 PlayerRuntimeService.syncFromWorldView 更新玩家落点，并把 world_anchor 与 position_checkpoint 一起打进 dirty domains',
        excludes:
          '不证明 player_position_checkpoint/player_world_anchor 的跨节点协议消息格式已完全固化，也不证明真实多节点 socket redirect、route handoff 或数据库写回时序',
        completionMapping: 'replace-ready:proof:world-runtime-transfer.placement-dirty-domains',
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

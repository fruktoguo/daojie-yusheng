import assert from 'node:assert/strict';

import { TileType } from '@mud/shared';
import { WorldRuntimeDetailQueryService } from '../runtime/world/query/world-runtime-detail-query.service';
import { createTileCombatAttributes, createTileCombatNumericStats } from '../runtime/world/query/world-runtime.observation.helpers';

function createDetailService(targetPlayer: Record<string, unknown>): WorldRuntimeDetailQueryService {
  return new WorldRuntimeDetailQueryService(
    {} as never,
    {
      has() {
        return false;
      },
      getOrThrow() {
        throw new Error('unexpected template lookup');
      },
    } as never,
    {
      getPlayer(playerId: string) {
        return playerId === targetPlayer.playerId ? targetPlayer : null;
      },
    } as never,
    {
      getMemoryUserByPlayerId(playerId: string) {
        return playerId === targetPlayer.playerId
          ? {
              pendingRoleName: '云渡',
              playerName: '云渡',
              displayName: '云',
            }
          : null;
      },
    } as never,
  );
}

function createObservedPlayer(): Record<string, unknown> {
  return {
    playerId: 'p_28be0b16-0f11-4583-a397-bb7741016e75_1773932128803',
    name: '修士',
    displayName: '@',
    instanceId: 'instance:observe-name',
    x: 1,
    y: 0,
    hp: 100,
    maxHp: 100,
    qi: 50,
    maxQi: 50,
    buffs: [],
    attrs: {
      finalAttrs: {
        ...createTileCombatAttributes(),
        spirit: 100,
      },
      numericStats: {
        ...createTileCombatNumericStats(100),
        viewRange: 8,
      },
    },
    realm: {
      displayName: '炼气',
    },
  };
}

function createDetailContext(targetPlayer: Record<string, unknown>) {
  return {
    view: {
      self: { x: 0, y: 0 },
      visibleTileKeys: ['1,0'],
      visibleTileIndices: [],
      instance: { width: 2, height: 1 },
      localNpcs: [],
      localMonsters: [],
      visiblePlayers: [{ playerId: targetPlayer.playerId, x: 1, y: 0 }],
      localPortals: [],
      localGroundPiles: [],
    },
    viewer: {
      playerId: 'player:observer',
      attrs: {
        numericStats: { viewRange: 8 },
        finalAttrs: { spirit: 100 },
      },
    },
    location: { instanceId: 'instance:observe-name' },
    instance: {
      getTileAura() {
        return 1;
      },
      listTileResources() {
        return [];
      },
      getTileGroundPile() {
        return null;
      },
      getPortalAtTile() {
        return null;
      },
      getSafeZoneAtTile() {
        return null;
      },
      getTileCombatState() {
        return null;
      },
      getTileLayerState() {
        return null;
      },
      getEffectiveTileType() {
        return TileType.Grass;
      },
      isWalkable() {
        return true;
      },
      isTileSightBlocked() {
        return false;
      },
      getTileTraversalCost() {
        return 1;
      },
      getTileQiDrainPerTick() {
        return 0;
      },
      getContainerAtTile() {
        return null;
      },
    },
  };
}

function assertObservePlayerNameUsesAccountIdentity(): void {
  const targetPlayer = createObservedPlayer();
  const detailService = createDetailService(targetPlayer);
  const context = createDetailContext(targetPlayer);

  const tileDetail = detailService.buildTileDetail(context, { x: 1, y: 0 });
  assert.equal(tileDetail.entities?.[0]?.id, targetPlayer.playerId);
  assert.equal(tileDetail.entities?.[0]?.name, '云渡');

  const playerDetail = detailService.buildDetail(context, { kind: 'player', id: targetPlayer.playerId });
  assert.equal(playerDetail.player?.id, targetPlayer.playerId);
  assert.equal(playerDetail.player?.name, '云渡');
}

assertObservePlayerNameUsesAccountIdentity();

console.log('world-runtime-observe-player-name-smoke ok');

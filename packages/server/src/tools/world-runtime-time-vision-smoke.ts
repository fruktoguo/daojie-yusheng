import assert from 'node:assert/strict';

import { WORLD_DARKNESS_BUFF_ID } from '@mud/shared';
import { PlayerAttributesService } from '../runtime/player/player-attributes.service';
import { projectVisiblePlayerBuffs } from '../runtime/player/player-buff-projection.helpers';
import { syncWorldTimeVisionForPlayers } from '../runtime/world/world-runtime-instance-tick-orchestration.service';

type RuntimePlayerLike = ReturnType<typeof createPlayer>;

function createPlayer(attributesService: PlayerAttributesService) {
  const attrs = attributesService.createInitialState();
  return {
    playerId: 'player:time-vision',
    hp: attrs.numericStats.maxHp,
    maxHp: attrs.numericStats.maxHp,
    qi: attrs.numericStats.maxQi,
    maxQi: attrs.numericStats.maxQi,
    selfRevision: 1,
    attrs,
    realm: { stage: attrs.stage, realmLv: 1 },
    rootFoundation: 0,
    bodyTraining: null,
    runtimeBonuses: [],
    techniques: { revision: 1, techniques: [] },
    equipment: { revision: 1, slots: [] },
    buffs: { revision: 1, buffs: [] },
    spiritualRoots: null,
    combat: {},
    worldTime: null,
    worldTimeBaseViewRange: null,
  };
}

function createPlayerRuntimeService(player: RuntimePlayerLike, attributesService: PlayerAttributesService) {
  return {
    playerAttributesService: attributesService,
    getPlayer(playerId: string) {
      return playerId === player.playerId ? player : null;
    },
  };
}

function hasDarknessBuff(player: RuntimePlayerLike): boolean {
  return projectVisiblePlayerBuffs(player).some((buff) => buff.buffId === WORLD_DARKNESS_BUFF_ID);
}

function main(): void {
  const attributesService = new PlayerAttributesService();
  const player = createPlayer(attributesService);
  const playerRuntimeService = createPlayerRuntimeService(player, attributesService);
  const instance = {
    tick: 0,
    meta: { instanceId: 'instance:time-vision', templateId: 'map:time-vision' },
    template: {
      id: 'map:time-vision',
      source: {
        time: {
          scale: 1,
          offsetTicks: 0,
          light: { base: 0, timeInfluence: 100 },
        },
      },
    },
  };

  syncWorldTimeVisionForPlayers(instance, [player.playerId], playerRuntimeService, 1);
  assert.equal(player.worldTime?.phase, 'deep_night');
  assert.equal(player.worldTime?.darknessStacks, 5);
  assert.equal(player.worldTimeBaseViewRange, 10);
  assert.equal(player.attrs.numericStats.viewRange, 5);
  assert.equal(hasDarknessBuff(player), true);

  syncWorldTimeVisionForPlayers(instance, [player.playerId], playerRuntimeService, 1, {
    getMapTimeConfig(mapId: string, baseTimeConfig: Record<string, unknown>) {
      assert.equal(mapId, 'map:time-vision');
      return {
        ...baseTimeConfig,
        offsetTicks: 2700,
      };
    },
  });

  assert.equal(player.worldTime?.phase, 'day');
  assert.equal(player.worldTime?.darknessStacks, 0);
  assert.equal(player.worldTime?.visionMultiplier, 1);
  assert.equal(player.attrs.numericStats.viewRange, player.worldTimeBaseViewRange);
  assert.equal(hasDarknessBuff(player), false);

  console.log('world-runtime-time-vision-smoke ok');
}

main();

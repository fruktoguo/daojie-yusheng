import assert from 'node:assert/strict';

import { WORLD_DARKNESS_BUFF_ID } from '@mud/shared';
import { WorldProjectorService } from '../network/world-projector.service';
import { PlayerAttributesService } from '../runtime/player/player-attributes.service';
import { projectVisiblePlayerBuffs } from '../runtime/player/player-buff-projection.helpers';
import { syncWorldTimeVisionForPlayers } from '../runtime/world/world-runtime-instance-tick-orchestration.service';

type RuntimePlayerLike = ReturnType<typeof createPlayer>;

function createPlayer(attributesService: PlayerAttributesService) {
  const attrs = attributesService.createInitialState();
  return {
    playerId: 'player:time-vision',
    instanceId: 'instance:time-vision',
    templateId: 'map:time-vision',
    x: 8,
    y: 8,
    facing: 'south',
    hp: attrs.numericStats.maxHp,
    maxHp: attrs.numericStats.maxHp,
    qi: attrs.numericStats.maxQi,
    maxQi: attrs.numericStats.maxQi,
    selfRevision: 1,
    wallet: { balances: [] },
    inventory: { revision: 1, capacity: 20, items: [] },
    attrs,
    realm: { stage: attrs.stage, realmLv: 1 },
    foundation: 0,
    rootFoundation: 0,
    combatExp: 0,
    boneAgeBaseYears: 18,
    lifeElapsedTicks: 0,
    lifespanYears: 60,
    bodyTraining: null,
    runtimeBonuses: [],
    techniques: { revision: 1, techniques: [] },
    equipment: { revision: 1, slots: [] },
    actions: { revision: 1, actions: [] },
    buffs: { revision: 1, buffs: [] },
    spiritualRoots: null,
    combat: {
      autoBattle: false,
      autoUsePills: [],
      combatTargetingRules: undefined,
      autoBattleTargetingMode: 'nearest',
      combatTargetId: null,
      combatTargetLocked: false,
      autoRetaliate: false,
      autoBattleStationary: false,
      allowAoePlayerHit: false,
      autoIdleCultivation: false,
      autoSwitchCultivation: false,
      autoRootFoundation: false,
      cultivationActive: false,
      senseQiActive: false,
      wangQiActive: false,
    },
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

function createProjectorView(player: RuntimePlayerLike, tick: number) {
  return {
    playerId: player.playerId,
    tick,
    worldRevision: tick,
    selfRevision: player.selfRevision,
    instance: {
      instanceId: player.instanceId,
      templateId: player.templateId,
      name: player.templateId,
      kind: 'public',
      width: 32,
      height: 32,
    },
    self: {
      x: player.x,
      y: player.y,
      facing: player.facing,
      name: 'time-vision',
      displayName: 'time-vision',
      buffs: [],
    },
    visiblePlayers: [],
    localNpcs: [],
    localMonsters: [],
    localPortals: [],
    localGroundPiles: [],
    localContainers: [],
    localBuildings: [],
    localFormations: [],
  };
}

function createTemplateRepository() {
  return {
    has: () => true,
    getOrThrow: (mapId: string) => ({ id: mapId, name: mapId }),
  };
}

function main(): void {
  const attributesService = new PlayerAttributesService();
  const player = createPlayer(attributesService);
  const playerRuntimeService = createPlayerRuntimeService(player, attributesService);
  const projector = new WorldProjectorService(createTemplateRepository() as never, null);
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
  const projectedDarknessBuff = projectVisiblePlayerBuffs(player).find((buff) => buff.buffId === WORLD_DARKNESS_BUFF_ID);
  assert.equal(projectedDarknessBuff?.remainingTicks, 2);
  assert.equal(projectedDarknessBuff?.duration, 2);
  assert.equal(projectedDarknessBuff?.infiniteDuration, true);
  projector.createInitialEnvelope(
    { playerId: player.playerId, sessionId: 'session:time-vision' },
    createProjectorView(player, 1),
    player,
  );

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
  const daylightEnvelope = projector.createDeltaEnvelope(createProjectorView(player, 2), player);
  assert.deepEqual(daylightEnvelope?.panelDelta?.buff?.removeBuffIds, [WORLD_DARKNESS_BUFF_ID]);
  assert.equal(daylightEnvelope?.panelDelta?.buff?.buffs?.some((buff) => buff.buffId === WORLD_DARKNESS_BUFF_ID), undefined);

  console.log('world-runtime-time-vision-smoke ok');
}

main();

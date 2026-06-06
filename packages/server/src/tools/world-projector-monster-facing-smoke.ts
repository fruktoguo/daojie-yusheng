import assert from 'node:assert/strict';
import { createNumericRatioDivisors, createNumericStats } from '@mud/shared';
import { WorldProjectorService } from '../network/world-projector.service';

function createTemplateRepository() {
  return {
    has: () => true,
    getOrThrow: (mapId: string) => ({ id: mapId, name: mapId }),
  };
}

function createPlayer() {
  return {
    playerId: 'monster_facing_player',
    instanceId: 'public:monster_facing',
    templateId: 'monster_facing_map',
    x: 1,
    y: 1,
    facing: 1,
    hp: 100,
    maxHp: 100,
    qi: 100,
    maxQi: 100,
    selfRevision: 1,
    wallet: { balances: [] },
    inventory: { revision: 1, capacity: 20, items: [] },
    equipment: { revision: 1, slots: [] },
    techniques: { revision: 1, techniques: [], cultivatingTechId: null },
    bodyTraining: null,
    attrs: {
      revision: 1,
      stage: '炼气',
      baseAttrs: {
        constitution: 1,
        spirit: 1,
        perception: 1,
        talent: 1,
        strength: 1,
        meridians: 1,
      },
      finalAttrs: {
        constitution: 1,
        spirit: 1,
        perception: 1,
        talent: 1,
        strength: 1,
        meridians: 1,
      },
      numericStats: createNumericStats(),
      ratioDivisors: createNumericRatioDivisors(),
    },
    realm: {
      stage: '炼气',
      realmLv: 1,
      displayName: '炼气一层',
      name: '炼气',
      narrative: 'narrative',
      review: 'review',
      lifespanYears: 60,
      progress: 0,
      progressToNext: 100,
      breakthroughReady: false,
      nextStage: '炼气二层',
      minTechniqueLevel: 1,
      minTechniqueRealm: 1,
      breakthroughItems: [],
      breakthrough: null,
      heavenGate: null,
    },
    actions: { revision: 1, actions: [] },
    combat: {
      autoBattle: false,
      autoUsePills: [],
      combatTargetingRules: null,
      autoBattleTargetingMode: 'nearest',
      retaliatePlayerTargetId: null,
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
    buffs: { revision: 1, buffs: [] },
  };
}

function createView(monster: Record<string, unknown>, worldRevision: number) {
  return {
    playerId: 'monster_facing_player',
    tick: worldRevision,
    worldRevision,
    selfRevision: 1,
    instance: {
      instanceId: 'public:monster_facing',
      templateId: 'monster_facing_map',
      name: 'monster_facing_map',
      kind: 'public',
      width: 16,
      height: 16,
    },
    self: {
      x: 1,
      y: 1,
      name: '测试',
      displayName: '测试',
      buffs: [],
    },
    visiblePlayers: [],
    localNpcs: [],
    localMonsters: [monster],
    localPortals: [],
    localGroundPiles: [],
    localContainers: [],
    localBuildings: [],
    localFormations: [],
  };
}

function main(): void {
  const projector = new WorldProjectorService(createTemplateRepository() as never, null);
  const player = createPlayer();
  const monster = {
    runtimeId: 'monster:facing:1',
    monsterId: 'm_facing_smoke',
    x: 2,
    y: 2,
    facing: 3,
    hp: 10,
    maxHp: 10,
    qi: 5,
    maxQi: 5,
    name: '转向妖兽',
    char: '妖',
    color: '#f00',
    tier: 'mortal_blood',
  };

  projector.createInitialEnvelope(
    { playerId: player.playerId, sessionId: 'monster_facing_session' },
    createView(monster, 1),
    player,
  );

  monster.facing = 2;
  const delta = projector.createDeltaEnvelope(createView(monster, 2), player);
  const facingPatch = delta?.worldDelta?.m?.[0]?.f;
  const cached = projector.getCachedProjectorState(player.playerId);
  const cacheUpdated = cached?.monsters.get(monster.runtimeId)?.f === 2;

  assert.equal(facingPatch, 2);
  assert.equal(cacheUpdated, true);

  console.log(JSON.stringify({
    ok: true,
    case: 'world-projector-monster-facing',
    facingPatch,
    cacheUpdated,
  }, null, 2));
}

main();

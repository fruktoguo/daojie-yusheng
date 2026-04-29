// @ts-nocheck

const assert = require('node:assert/strict');

const { Direction, PlayerRealmStage } = require('@mud/shared');
const { WorldProjectorService } = require('../network/world-projector.service');

function main() {
  const projector = new WorldProjectorService(createTemplateRepository());
  const binding = {
    playerId: 'respawn_player',
    sessionId: 'respawn_session',
    resumed: false,
  };
  const player = createPlayer();
  const initial = projector.createInitialEnvelope(
    binding,
    createView({ tick: 100, respawnRemainingTicks: 5 }),
    player,
  );
  const initialContainer = initial.worldDelta?.c?.find((entry) => entry.id === 'container:herb.qingling');
  assert.equal(initialContainer?.rr, 5);

  const ticking = projector.createDeltaEnvelope(
    createView({ tick: 101, respawnRemainingTicks: 4 }),
    player,
  );
  const tickingContainer = ticking?.worldDelta?.c?.find((entry) => entry.id === 'container:herb.qingling');
  assert.equal(tickingContainer?.rr, 4);

  const cleared = projector.createDeltaEnvelope(
    createView({ tick: 105, respawnRemainingTicks: undefined }),
    player,
  );
  const clearedContainer = cleared?.worldDelta?.c?.find((entry) => entry.id === 'container:herb.qingling');
  assert.equal(clearedContainer?.rr, null);

  console.log(JSON.stringify({ ok: true, case: 'world-projector-container-respawn' }, null, 2));
}

function createTemplateRepository() {
  return {
    has() {
      return false;
    },
    getOrThrow(mapId) {
      return { id: mapId };
    },
  };
}

function createView({ tick, respawnRemainingTicks }) {
  const container = {
    id: 'herb.qingling',
    x: 7,
    y: 8,
    name: '青灵茎',
    char: '茎',
    color: '#6ba06f',
  };
  if (respawnRemainingTicks !== undefined) {
    container.respawnRemainingTicks = respawnRemainingTicks;
  }
  return {
    playerId: 'respawn_player',
    sessionId: 'respawn_session',
    tick,
    worldRevision: 10,
    selfRevision: 5,
    instance: {
      instanceId: 'public:respawn',
      templateId: 'respawn_map',
      name: 'Respawn Map',
      kind: 'public',
      width: 16,
      height: 16,
    },
    self: {
      x: 1,
      y: 1,
      facing: Direction.South,
    },
    localLandmarks: [],
    localSafeZones: [],
    visiblePlayers: [],
    localContainers: [container],
    localMonsters: [],
    localNpcs: [],
    localPortals: [],
    localGroundPiles: [],
  };
}

function createPlayer() {
  return {
    playerId: 'respawn_player',
    sessionId: 'respawn_session',
    name: 'respawn_player',
    displayName: 'P',
    persistentRevision: 1,
    persistedRevision: 1,
    instanceId: 'public:respawn',
    templateId: 'respawn_map',
    x: 1,
    y: 1,
    facing: Direction.South,
    hp: 100,
    maxHp: 100,
    qi: 20,
    maxQi: 100,
    foundation: 0,
    combatExp: 0,
    boneAgeBaseYears: 16,
    lifeElapsedTicks: 0,
    lifespanYears: null,
    realm: null,
    heavenGate: null,
    spiritualRoots: null,
    unlockedMapIds: [],
    selfRevision: 5,
    inventory: {
      revision: 1,
      capacity: 100,
      items: [],
    },
    equipment: {
      revision: 1,
      slots: [
        { slot: 'weapon', item: null },
        { slot: 'head', item: null },
        { slot: 'body', item: null },
        { slot: 'legs', item: null },
        { slot: 'accessory', item: null },
      ],
    },
    techniques: {
      revision: 1,
      techniques: [],
      cultivatingTechId: null,
    },
    attrs: {
      revision: 1,
      stage: PlayerRealmStage.Mortal,
      baseAttrs: {
        constitution: 10,
        spirit: 10,
        perception: 10,
        talent: 10,
        strength: 0,
        meridians: 0,
      },
      finalAttrs: {
        constitution: 10,
        spirit: 10,
        perception: 10,
        talent: 10,
        strength: 0,
        meridians: 0,
      },
      numericStats: {
        maxHp: 120,
        maxQi: 60,
        physAtk: 11,
        spellAtk: 5.5,
        physDef: 10,
        spellDef: 10,
        hit: 10,
        dodge: 10,
        crit: 0,
        critDamage: 0,
        breakPower: 0,
        resolvePower: 10,
        maxQiOutputPerTick: 10,
        qiRegenRate: 50,
        hpRegenRate: 50,
        cooldownSpeed: 0,
        auraCostReduce: 0,
        auraPowerRate: 0,
        playerExpRate: 0,
        techniqueExpRate: 0,
        realmExpPerTick: 0,
        techniqueExpPerTick: 0,
        lootRate: 0,
        rareLootRate: 0,
        viewRange: 10,
        moveSpeed: 10,
        extraAggroRate: 0,
        elementDamageBonus: {
          metal: 0,
          wood: 0,
          water: 0,
          fire: 0,
          earth: 0,
        },
        elementDamageReduce: {
          metal: 0,
          wood: 0,
          water: 0,
          fire: 0,
          earth: 0,
        },
      },
      ratioDivisors: {
        dodge: 100,
        crit: 100,
        breakPower: 100,
        resolvePower: 100,
        cooldownSpeed: 100,
        moveSpeed: 100,
        elementDamageReduce: {
          metal: 100,
          wood: 100,
          water: 100,
          fire: 100,
          earth: 100,
        },
      },
    },
    combat: {
      cooldownReadyTickBySkillId: {},
      autoBattle: false,
      autoRetaliate: true,
      autoBattleStationary: false,
      autoUsePills: [],
      combatTargetingRules: undefined,
      autoBattleTargetingMode: 'auto',
      combatTargetId: null,
      combatTargetLocked: false,
      allowAoePlayerHit: false,
      autoIdleCultivation: true,
      autoSwitchCultivation: false,
      senseQiActive: false,
      autoBattleSkills: [],
      cultivationActive: false,
      lastActiveTick: 0,
    },
    actions: {
      revision: 1,
      contextActions: [],
      actions: [],
    },
    buffs: {
      revision: 1,
      buffs: [],
    },
    notices: {
      nextId: 1,
      queue: [],
    },
    quests: {
      revision: 1,
      quests: [],
    },
    lootWindowTarget: null,
    pendingLogbookMessages: [],
    vitalRecoveryDeferredUntilTick: -1,
  };
}

main();

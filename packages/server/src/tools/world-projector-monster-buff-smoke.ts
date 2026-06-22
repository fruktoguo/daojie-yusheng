import assert from 'node:assert/strict';
import { createNumericRatioDivisors, createNumericStats, type VisibleBuffState } from '@mud/shared';
import { WorldProjectorService } from '../network/world-projector.service';
import { WorldRuntimeDetailQueryService } from '../runtime/world/query/world-runtime-detail-query.service';

function createTemplateRepository() {
  return {
    has: () => true,
    getOrThrow: (mapId: string) => ({ id: mapId, name: mapId }),
  };
}

function createPlayer() {
  const numericStats = createNumericStats();
  numericStats.viewRange = 10;
  return {
    playerId: 'monster_buff_player',
    instanceId: 'public:monster_buff',
    templateId: 'monster_buff_map',
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
        constitution: 20,
        spirit: 999,
        perception: 20,
        talent: 20,
        strength: 20,
        meridians: 20,
      },
      finalAttrs: {
        constitution: 20,
        spirit: 999,
        perception: 20,
        talent: 20,
        strength: 20,
        meridians: 20,
      },
      numericStats,
      ratioDivisors: createNumericRatioDivisors(),
    },
    realm: { stage: '炼气', realmLv: 1, displayName: '炼气一层' },
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

function createBuff(buffId: string, visibility: VisibleBuffState['visibility'], category: VisibleBuffState['category']): VisibleBuffState {
  return {
    buffId,
    name: buffId,
    shortMark: buffId.slice(-1),
    category,
    visibility,
    remainingTicks: 12,
    duration: 20,
    stacks: 1,
    maxStacks: 3,
    sourceSkillId: 'skill.monster_buff_smoke',
  };
}

function createMonster(buffs: VisibleBuffState[] = []) {
  return {
    runtimeId: 'monster:buff:1',
    monsterId: 'm_buff_smoke',
    x: 2,
    y: 2,
    facing: 3,
    hp: 100,
    maxHp: 100,
    qi: 50,
    maxQi: 50,
    name: '带状态妖王',
    char: '王',
    color: '#f00',
    level: 1,
    attrs: {
      constitution: 10,
      spirit: 10,
      perception: 10,
      talent: 10,
      strength: 10,
      meridians: 10,
    },
    numericStats: createNumericStats(),
    ratioDivisors: createNumericRatioDivisors(),
    tier: 'demon_king',
    alive: true,
    respawnTicks: 60,
    buffs,
  };
}

function createView(monster: ReturnType<typeof createMonster>, worldRevision: number, duplicateMonsterView = false) {
  const monsterView = {
    runtimeId: monster.runtimeId,
    monsterId: monster.monsterId,
    x: monster.x,
    y: monster.y,
    facing: monster.facing,
    hp: monster.hp,
    maxHp: monster.maxHp,
    qi: monster.qi,
    maxQi: monster.maxQi,
    name: monster.name,
    char: monster.char,
    color: monster.color,
    tier: monster.tier,
    buffs: monster.buffs,
  };
  return {
    playerId: 'monster_buff_player',
    tick: worldRevision,
    worldRevision,
    selfRevision: 1,
    instance: {
      instanceId: 'public:monster_buff',
      templateId: 'monster_buff_map',
      name: 'monster_buff_map',
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
    localMonsters: duplicateMonsterView ? [monsterView, { ...monsterView }] : [monsterView],
    localPortals: [],
    localGroundPiles: [],
    localContainers: [],
    localBuildings: [],
    localFormations: [],
  };
}

function runProjectorProof(): void {
  const projector = new WorldProjectorService(createTemplateRepository() as never, null);
  const player = createPlayer();
  const publicBuff = createBuff('buff.public_burn', 'public', 'debuff');
  const observeOnlyBuff = createBuff('buff.observe_only_guard', 'observe_only', 'buff');
  const hiddenBuff = createBuff('buff.hidden_seed', 'hidden', 'buff');
  const monster = createMonster([publicBuff, observeOnlyBuff, hiddenBuff]);

  const initial = projector.createInitialEnvelope(
    { playerId: player.playerId, sessionId: 'monster_buff_session' },
    createView(monster, 1),
    player,
  );
  assert.deepEqual(initial.worldDelta?.m?.[0]?.buffs?.map((buff) => buff.buffId), ['buff.public_burn']);

  publicBuff.stacks = 2;
  const changed = projector.createDeltaEnvelope(createView(monster, 2), player);
  assert.deepEqual(changed?.worldDelta?.m?.[0]?.buffs?.map((buff) => `${buff.buffId}:${buff.stacks}`), ['buff.public_burn:2']);

  publicBuff.remainingTicks = 0;
  const removed = projector.createDeltaEnvelope(createView(monster, 3), player);
  assert.equal(removed?.worldDelta?.m?.[0]?.buffs, null);

  const plainMonster = createMonster([]);
  plainMonster.runtimeId = 'monster:buff:none';
  const plainProjector = new WorldProjectorService(createTemplateRepository() as never, null);
  const plainInitial = plainProjector.createInitialEnvelope(
    { playerId: player.playerId, sessionId: 'monster_plain_session' },
    createView(plainMonster, 1),
    player,
  );
  assert.equal(Object.prototype.hasOwnProperty.call(plainInitial.worldDelta?.m?.[0] ?? {}, 'buffs'), false);
}

function runDetailProof(): void {
  const player = createPlayer();
  const publicBuff = createBuff('buff.public_burn', 'public', 'debuff');
  const observeOnlyBuff = createBuff('buff.observe_only_guard', 'observe_only', 'buff');
  const hiddenBuff = createBuff('buff.hidden_seed', 'hidden', 'buff');
  const monster = createMonster([publicBuff, observeOnlyBuff, hiddenBuff]);
  const service = new WorldRuntimeDetailQueryService(
    { monsterDropsByMonsterId: new Map() } as never,
    createTemplateRepository() as never,
    { getPlayer: (playerId: string) => (playerId === player.playerId ? player : null) } as never,
    null as never,
  );
  const context = {
    viewer: player,
    location: { instanceId: player.instanceId },
    view: createView(monster, 1, true),
    instance: {
      getMonster: (runtimeId: string) => (runtimeId === monster.runtimeId ? monster : null),
      getTileAura: () => 1,
      listTileResources: () => [],
      getTileGroundPile: () => null,
      getPortalAtTile: () => null,
      getSafeZoneAtTile: () => null,
      getTileCombatState: () => null,
      getTileLayerState: () => null,
      getEffectiveTileType: () => undefined,
      isWalkable: () => true,
      isTileSightBlocked: () => false,
      getTileTraversalCost: () => 1,
      getTileQiDrainPerTick: () => 0,
      isPlayerOverlapTile: () => false,
      getContainerAtTile: () => null,
      getBuildingsAtTile: () => [],
      getNpc: () => null,
    },
  };

  const detail = service.buildDetail(context, { kind: 'monster', id: monster.runtimeId });
  assert.deepEqual(detail.monster?.buffs?.map((buff: VisibleBuffState) => buff.buffId), [
    'buff.observe_only_guard',
    'buff.public_burn',
  ]);

  const tile = service.buildTileDetail(context, { x: monster.x, y: monster.y });
  const monsters = tile.entities?.filter((entry: { kind?: string }) => entry.kind === 'monster') ?? [];
  assert.equal(monsters.length, 1);
  assert.deepEqual(monsters[0]?.buffs?.map((buff: VisibleBuffState) => buff.buffId), [
    'buff.observe_only_guard',
    'buff.public_burn',
  ]);
}

function main(): void {
  runProjectorProof();
  runDetailProof();
  console.log(JSON.stringify({ ok: true, case: 'world-projector-monster-buff' }, null, 2));
}

main();

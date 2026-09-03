import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DUNGEON_MONSTER_ENGAGE_DISTANCE, MapInstanceRuntime } from '../runtime/instance/map-instance.runtime.js';
import { DungeonPresentationController } from '../runtime/dungeon/dungeon-presentation-controller.js';
import { DungeonTemplateRegistry } from '../content/registries/dungeon-template.registry.js';
import type { DungeonDefinition, DungeonRunState } from '@mud/shared';

function loadRealDungeonMapTemplate() {
  const mapPath = '/home/yuohira/mud-mmo-next/packages/server/data/maps/dungeon_huanling_zhenren_instance.json';
  const raw = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const width = raw.width;
  const height = raw.height;
  return {
    ...raw,
    terrainRows: raw.terrain,
    structureRows: raw.structure,
    baseAuraByTile: new Float64Array(width * height),
    baseTerrainByTile: new Uint8Array(width * height),
    npcs: raw.npcs ?? [],
    landmarks: raw.landmarks ?? [],
    containers: raw.containers ?? [],
    auras: raw.auras ?? [],
    portals: raw.portals ?? [],
    safeZones: raw.safeZones ?? [],
    spawnX: 4,
    spawnY: 8,
  } as any;
}
const huanlingTechPath = '/home/yuohira/mud-mmo-next/packages/server/data/content/techniques/凡人期/术法/地阶.json';
const huanlingTechData = JSON.parse(fs.readFileSync(huanlingTechPath, 'utf8'));
const huanlingTech = huanlingTechData.find((t: any) => t.id === 'monster_huanling_arts');


function createHuanlingMonsterSpawn(x: number, y: number) {
  return {
    runtimeId: 'm_boss_huanling',
    monsterId: 'm_huanling_zhenren_instance',
    name: '唤灵真人',
    char: '真',
    color: '#f0d2a4',
    tier: 'demon_king',
    level: 43,
    x,
    y,
    hp: 1000000,
    maxHp: 1000000,
    qi: 500,
    maxQi: 500,
    alive: true,
    aggroRange: 10,
    leashRange: 20,
    attackRange: 2,
    attackCooldownTicks: 2,
    wanderRadius: 0,
    combatOpeningTicks: 3,
    skills: huanlingTech?.skills ?? [],
    baseAttrs: { constitution: 100, spirit: 100, strength: 100 },
    baseNumericStats: { maxHp: 1000000, maxQi: 500, attack: 100, defense: 50, speed: 10 },
  };
}

function createNormalMonsterSpawn(x: number, y: number) {
  return {
    runtimeId: 'm_normal_wolf',
    monsterId: 'm_wild_wolf_dungeon',
    name: '洞府妖狼',
    tier: 'mortal_blood',
    level: 30,
    x,
    y,
    hp: 10000,
    maxHp: 10000,
    qi: 100,
    maxQi: 100,
    alive: true,
    aggroRange: 8,
    leashRange: 15,
    attackRange: 1,
    attackCooldownTicks: 1,
    wanderRadius: 0,
    combatOpeningTicks: 0,
    skills: [
      {
        id: 'skill.wolf_bite',
        name: '撕咬',
        type: 'active',
        range: 1,
        cost: 5,
        cooldown: 1,
      },
    ],
    baseAttrs: { constitution: 50, strength: 50 },
    baseNumericStats: { maxHp: 10000, maxQi: 100, attack: 50, defense: 20, speed: 10 },
  };
}

async function runDungeonMonsterEngageSmoke(): Promise<void> {
  console.log('[dungeon-monster-engage-smoke] 开始验证副本开怪机制与三秒说话阶段...');

  // 1. 验证常量契约
  assert.equal(DUNGEON_MONSTER_ENGAGE_DISTANCE, 5, '副本怪物默认开怪感知半径必须严格为 5 格');

  const dungeonRegistry = new DungeonTemplateRegistry();
  dungeonRegistry.loadAll();
  const definition = dungeonRegistry.getRef('dungeon_huanling_zhenren');
  assert.ok(definition, '必须成功加载唤灵真人副本真源配置');
  assert.ok(
    definition.presentation?.onCombatEngaged?.some((step) => step.stepId === 'intro_rebuke_foundation'),
    '唤灵真人开场对白必须配置在 onCombatEngaged 剧情步骤中',
  );

  // ─────────────────────────────────────────────────────────────
  // 场景 1：距离 6 格（五格之外，真实副本入口位置）不触发战斗、不产生仇恨、不触发说话
  // ─────────────────────────────────────────────────────────────
  {
    console.log('[Case 1] 验证 6 格入口距离不触发开怪...');
    const bossSpawn = createHuanlingMonsterSpawn(10, 7);
    const instance = new MapInstanceRuntime({
      instanceId: 'dungeon:smoke_case_1',
      template: loadRealDungeonMapTemplate(),
      kind: 'dungeon',
      persistent: false,
      monsterSpawns: [bossSpawn],
    } as any);

    // 玩家放置在真实入口 (4, 8)，切比雪夫距离 = max(|10 - 4|, |7 - 8|) = 6 格（大于 5 格）
    const playerId = 'p_tester_6_cells';
    instance.connectPlayer({
      playerId,
      sessionId: 'sess_1',
      preferredX: 4,
      preferredY: 8,
    });

    const monster = instance.getMonster(bossSpawn.runtimeId);
    assert.ok(monster);
    assert.equal(monster.engaged, false, '副本中怪物初始状态必须为未开怪 (engaged=false)');
    assert.equal(monster.speechTicksLeft, 0, '未开怪时 speechTicksLeft 必须为 0');

    // 执行 3 个 tick
    for (let tick = 1; tick <= 3; tick += 1) {
      const result = instance.tickOnce();
      assert.equal(monster.engaged, false, `tick ${tick}: 6 格距离下怪物仍不得进入战斗状态`);
      assert.equal(monster.aggroTargetPlayerId, null, `tick ${tick}: 6 格距离下怪物不得锁定玩家为仇恨目标`);
      assert.equal(result.monsterActions.length, 0, `tick ${tick}: 6 格距离下怪物不得产生任何攻击或技能动作`);
      assert.equal(result.engagedMonsterEvents.length, 0, `tick ${tick}: 6 格距离下不得产生开怪事件`);
      assert.equal(monster.x, 10, '怪物位置不得改变');
      assert.equal(monster.y, 7, '怪物位置不得改变');
    }
    console.log('✓ 场景 1 通过：6 格距离完全脱战静止');
  }

  // ─────────────────────────────────────────────────────────────
  // 场景 2：玩家进入 5 格触发开怪，并进入 3 秒（3 tick）说话阶段且不攻击
  // ─────────────────────────────────────────────────────────────
  {
    console.log('[Case 2] 验证 5 格距离触发开怪与 3 tick 禁攻说话阶段...');
    const bossSpawn = createHuanlingMonsterSpawn(10, 7);
    const instance = new MapInstanceRuntime({
      instanceId: 'dungeon:smoke_case_2',
      template: loadRealDungeonMapTemplate(),
      kind: 'dungeon',
      persistent: false,
      monsterSpawns: [bossSpawn],
    } as any);

    const playerId = 'p_tester_5_cells';
    instance.connectPlayer({
      playerId,
      sessionId: 'sess_2',
      preferredX: 4,
      preferredY: 8,
    });

    // 初始在 6 格外 (4, 8)
    instance.tickOnce();
    const monster = instance.getMonster(bossSpawn.runtimeId);
    assert.ok(monster);
    assert.equal(monster.engaged, false, '6 格外未开怪');

    // 模拟 presentation 收集气泡
    const presentationController = new DungeonPresentationController();
    const bubbles: Array<{ text: string; durationMs: number }> = [];
    const run: DungeonRunState = {
      runId: 'smoke-run-2',
      dungeonId: 'dungeon_huanling_zhenren',
      partyId: 'party:1',
      status: 'active',
      difficulty: { difficulty: 'trial' },
      effectiveStep: 0,
      mapInstanceId: 'dungeon:smoke_case_2',
      members: [{ playerId, joinedAt: 0 }],
      createdAt: 0,
    } as any;
    const presentationContext = {
      getInstance: () => instance,
      getPlayer: () => ({ realm: { realmLv: 35 } }),
      resolveActorPosition: () => ({ x: monster.x, y: monster.y }),
      pushDialogueBubble: (_r: any, _pos: any, text: string, durationMs: number) => {
        bubbles.push({ text, durationMs });
      },
      applyActions: () => new Set<string>(),
    } as any;

    // 玩家向前走，进入 (5, 7)，切比雪夫距离 = |10 - 5| = 5 格（五格内且直线可见！）
    const moved = instance.relocatePlayer(playerId, 5, 7);
    // Tick 1（进入 5 格当帧）
    const tick1Result = instance.tickOnce();
    assert.equal(instance.getMonster(bossSpawn.runtimeId)?.engaged, true, '进入 5 格内必须立即触发开怪 (engaged=true)');
    assert.equal(tick1Result.engagedMonsterEvents.length, 1, '当帧必须产出 1 个开怪事件');
    assert.equal(tick1Result.engagedMonsterEvents[0]?.runtimeId, bossSpawn.runtimeId);

    // 驱动 PresentationController 消费开怪事件
    for (const evt of tick1Result.engagedMonsterEvents) {
      const speechTicks = presentationController.onMonsterEngaged(run, definition, evt.monsterId, presentationContext);
      assert.equal(speechTicks, 3, '唤灵真人开场对白必须返回 3 tick 说话时长');
    }
    assert.equal(bubbles.length, 1, '进入 5 格必须触发 1 次开场气泡');
    assert.equal(bubbles[0]?.text, '尔等筑基小辈, 安敢逆伐金丹!', '气泡内容必须匹配唤灵真人对白');
    assert.equal(bubbles[0]?.durationMs, 3000, '气泡时长必须为 3000ms');

    // 关键验证：进入 5 格的当帧（Tick 1），怪物必须处于禁攻说话阶段，不得有任何伤害或施法动作！
    assert.equal(tick1Result.monsterActions.length, 0, 'Tick 1: 进入 5 格当帧怪物不得攻击或施放技能');
    assert.equal(instance.getMonster(bossSpawn.runtimeId)?.speechTicksLeft, 2, 'Tick 1 结束时 speechTicksLeft 递减为 2');

    // Tick 2（说话第 2 秒）
    const tick2Result = instance.tickOnce();
    assert.equal(tick2Result.monsterActions.length, 0, 'Tick 2: 说话阶段中怪物不得攻击');
    assert.equal(instance.getMonster(bossSpawn.runtimeId)?.speechTicksLeft, 1, 'Tick 2 结束时 speechTicksLeft 递减为 1');

    // Tick 3（说话第 3 秒）
    const tick3Result = instance.tickOnce();
    assert.equal(tick3Result.monsterActions.length, 0, 'Tick 3: 说话阶段中怪物不得攻击');
    assert.equal(instance.getMonster(bossSpawn.runtimeId)?.speechTicksLeft, 0, 'Tick 3 结束时 speechTicksLeft 归零');

    // 3 秒说话阶段内，总共 0 次攻击！
    console.log('✓ 场景 2 通过：5 格触发开怪，整整 3 个 tick 严格禁攻并在头顶展示对白');

    // ─────────────────────────────────────────────────────────────
    // 场景 3：说话阶段结束后（Tick 4），怪物正式开始攻击
    // ─────────────────────────────────────────────────────────────
    console.log('[Case 3] 验证 3 tick 说话阶段结束后恢复正常攻击...');
    const tick4Result = instance.tickOnce();
    assert.ok(tick4Result.monsterActions.length > 0, 'Tick 4: 说话阶段结束后怪物必须正式开始攻击/施法');
    const attackAction = tick4Result.monsterActions[0];
    assert.ok(
      attackAction?.kind === 'skill_chant' || attackAction?.kind === 'skill' || attackAction?.kind === 'basic',
      '动作必须为技能吟唱、技能或普通攻击',
    );
    console.log(`✓ 场景 3 通过：Tick 4 怪物恢复攻击，动作类型=[${attackAction?.kind}]`);
  }

  // ─────────────────────────────────────────────────────────────
  // 场景 4：远距离受击触发开怪并进入 3 秒说话禁攻阶段
  // ─────────────────────────────────────────────────────────────
  {
    console.log('[Case 4] 验证远距离受击触发开怪与 3 tick 禁攻...');
    const bossSpawn = createHuanlingMonsterSpawn(10, 7);
    const instance = new MapInstanceRuntime({
      instanceId: 'dungeon:smoke_case_4',
      template: loadRealDungeonMapTemplate(),
      kind: 'dungeon',
      persistent: false,
      monsterSpawns: [bossSpawn],
    } as any);

    const playerId = 'p_tester_sniper';
    instance.connectPlayer({
      playerId,
      sessionId: 'sess_4',
      preferredX: 2,
      preferredY: 7,
    });

    assert.equal(instance.getMonster(bossSpawn.runtimeId)?.engaged, false, '受击前为未开怪');
    // 模拟远程攻击命中唤灵真人（8 格远）
    const damageResult = instance.applyDamageToMonster(bossSpawn.runtimeId, 100, playerId);
    assert.ok(damageResult && damageResult.appliedDamage > 0);
    assert.equal(instance.getMonster(bossSpawn.runtimeId)?.engaged, true, '受到伤害必须立即开怪 (engaged=true)');
    assert.equal(instance.getMonster(bossSpawn.runtimeId)?.speechTicksLeft, 3, '受击后必须同步获得 3 tick 说话阶段');

    // 接下来推进 3 个 tick，检验是否在此期间不反击
    for (let t = 1; t <= 3; t += 1) {
      const res = instance.tickOnce();
      assert.equal(res.monsterActions.length, 0, `受击说话阶段 tick ${t}: 怪物不得反击或出招`);
      assert.equal(instance.getMonster(bossSpawn.runtimeId)?.x, 10, `受击说话阶段 tick ${t}: 怪物保持原地说话不移动`);
    }
    assert.equal(instance.getMonster(bossSpawn.runtimeId)?.speechTicksLeft, 0, '3 tick 后说话阶段结束');
    // 第 4 tick 说话阶段结束，怪物解除禁攻与禁锢，向玩家发起追击
    instance.tickOnce();
    assert.equal(instance.getMonster(bossSpawn.runtimeId)?.x, 9, '受击说话阶段结束后怪物解除禁锢并正式向玩家追击');
    console.log('✓ 场景 4 通过：远距离受击后同样严格进入 3 秒说话阶段，且 3 秒内不直接攻击/不移动，结束后正式行动');
  }

  // ─────────────────────────────────────────────────────────────
  // 场景 5：无开怪对白的普通副本怪（combatOpeningTicks=0）直接开始战斗
  // ─────────────────────────────────────────────────────────────
  {
    console.log('[Case 5] 验证无对白的普通副本怪进入 5 格直接开始战斗...');
    const normalWolfSpawn = createNormalMonsterSpawn(10, 7);
    const instance = new MapInstanceRuntime({
      instanceId: 'dungeon:smoke_case_5',
      template: loadRealDungeonMapTemplate(),
      kind: 'dungeon',
      persistent: false,
      monsterSpawns: [normalWolfSpawn],
    } as any);

    const playerId = 'p_tester_wolf';
    instance.connectPlayer({
      playerId,
      sessionId: 'sess_5',
      preferredX: 4,
      preferredY: 8,
    });

    // 初始在 6 格外
    instance.tickOnce();
    const wolf = instance.getMonster(normalWolfSpawn.runtimeId);
    assert.ok(wolf);
    assert.equal(wolf.engaged, false);

    // 走到 1 格近战位 (9, 7)
    instance.relocatePlayer(playerId, 9, 7);
    const combatResult = instance.tickOnce();
    assert.equal(instance.getMonster(normalWolfSpawn.runtimeId)?.engaged, true, '进入近身范围必须开怪');
    assert.equal(instance.getMonster(normalWolfSpawn.runtimeId)?.speechTicksLeft, 0, '无对白怪物 speechTicksLeft 为 0');
    assert.ok(combatResult.monsterActions.length > 0, '无对白怪物无需等待 3 秒，直接开始战斗');
    console.log('✓ 场景 5 通过：无对白怪物进入 5 格后直接开打');
  }

  console.log('=== 所有 5 个核心场景全部通过！===');
}

runDungeonMonsterEngageSmoke().catch((error) => {
  console.error('[dungeon-monster-engage-smoke] 失败:', error);
  process.exit(1);
});

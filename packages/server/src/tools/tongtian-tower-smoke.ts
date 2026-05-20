import assert from 'node:assert/strict';

import { resolveGameTimeState } from '@mud/shared';
import { ContentTemplateRepository } from '../content/content-template.repository';
import { PlayerCombatService } from '../runtime/combat/player-combat.service';
import { resolveMonsterCombatExpEquivalentFallback } from '../runtime/combat/monster-combat-exp-equivalent.helper';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { MapTemplateRepository } from '../runtime/map/map-template.repository';
import { WorldRuntimePlayerSessionService } from '../runtime/world/world-runtime-player-session.service';
import { WorldRuntimeTongtianTowerService } from '../runtime/world/world-runtime-tongtian-tower.service';
import type { TongtianTowerProgress } from '../persistence/tongtian-tower-persistence.service';

class InMemoryTowerProgress {
  readonly rows = new Map<string, TongtianTowerProgress>();

  getOrCreateProgress(playerId: string): TongtianTowerProgress {
    const existing = this.rows.get(playerId);
    if (existing) return { ...existing };
    const progress = { playerId, currentLayer: 1, highestLayer: 1 };
    this.rows.set(playerId, progress);
    return { ...progress };
  }

  updateCurrentLayer(playerId: string, layer: number): TongtianTowerProgress {
    const current = this.rows.get(playerId) ?? { playerId, currentLayer: 1, highestLayer: 1 };
    current.currentLayer = Math.max(1, Math.trunc(layer));
    current.highestLayer = Math.max(current.highestLayer, current.currentLayer);
    this.rows.set(playerId, current);
    return { ...current };
  }

  promoteHighestLayer(playerId: string, layer: number): TongtianTowerProgress {
    const current = this.rows.get(playerId) ?? { playerId, currentLayer: 1, highestLayer: 1 };
    current.highestLayer = Math.max(current.highestLayer, Math.max(1, Math.trunc(layer)));
    this.rows.set(playerId, current);
    return { ...current };
  }
}

async function main(): Promise<void> {
  const content = new ContentTemplateRepository();
  content.onModuleInit();
  const templates = new MapTemplateRepository();
  templates.onModuleInit();
  const persistence = new InMemoryTowerProgress();
  const tower = new WorldRuntimeTongtianTowerService(content, templates, persistence as any);
  const deps = createDeps(content, templates, tower);
  const entryTemplate = templates.getOrThrow('qizhen_crossing') as any;
  assert.ok(
    entryTemplate.containers.some((container: any) => container.id === 'lm_qizhen_tongtian_tower' && container.char === '塔'),
    '栖真渡通天塔入口应作为可见地图实体投影',
  );
  assert.deepEqual(content.rollMonsterDrops('m_tongtian_shadow'), [], '虚影只能给正常经验，不能有掉落或灵石');
  assert.deepEqual(content.rollMonsterDrops('m_tongtian_shadow_elite'), [], '虚影精英只能给正常经验，不能有掉落或灵石');
  const shadowSkill = content.getSkill('skill.tongtian_shadow_strike');
  assert.ok(shadowSkill, '虚影技能应能从内容仓库加载');
  assert.equal(shadowSkill.cooldown, 10, '虚影重击冷却应为 10 tick');

  connectToPublicMap(deps, 'player:1', 31, 15);
  const enterView = tower.executeAction('player:1', 'tower:tongtian:enter', deps);
  assert.equal(enterView.instance.instanceId, 'tower:tongtian:layer:1');
  const layer1Template = templates.getOrThrow('tongtian_tower_layer_1') as any;
  assert.equal(layer1Template.mapGroupName, '秘境', '通天塔层地图分类应归为秘境');
  assert.ok(
    layer1Template.containers.some((container: any) => container.id === 'tongtian_tower_1_next' && container.char === '上'),
    '通天塔下一层层阶应作为可见地图实体投影',
  );
  deps.refreshPlayerContextActions('player:1', enterView);
  assert.deepEqual(
    deps.getContextActionIds('player:1').filter((id: string) => id.startsWith('tower:tongtian:')),
    ['tower:tongtian:exit'],
    '进入通天塔后入口动作必须移除，只保留当前层可用动作',
  );
  assert.equal(persistence.rows.get('player:1')?.currentLayer, 1);
  assert.equal(persistence.rows.get('player:1')?.highestLayer, 1);
  assert.deepEqual(
    tower.buildContextActions(layerViewWithPosition(enterView, 5, 5), deps).map((action) => action.id),
    ['tower:tongtian:exit'],
    '塔内任意位置都可退出，未解锁下一层时不显示下一层',
  );

  assert.throws(
    () => tower.executeAction('player:1', 'tower:tongtian:previous', deps),
    /第一层不能退到上一层/,
  );
  assert.throws(
    () => tower.executeAction('player:1', 'tower:tongtian:next', deps),
    /尚未通关当前层/,
  );

  const layer1 = deps.getInstanceRuntimeOrThrow('tower:tongtian:layer:1');
  const layer1TimeAtNight = resolveGameTimeState(0, 20, layer1.template.source.time, 1);
  const layer1TimeLater = resolveGameTimeState(6900, 20, layer1.template.source.time, 1);
  assert.equal(layer1TimeAtNight.phase, 'day', '通天塔应恒定白昼，不进入夜晚相位');
  assert.equal(layer1TimeAtNight.visionMultiplier, 1, '通天塔不受夜晚视野衰减');
  assert.equal(layer1TimeAtNight.effectiveViewRange, 20, '通天塔有效视野应保持基础视野');
  assert.equal(layer1TimeLater.visionMultiplier, 1, '通天塔长期运行后仍不受夜晚视野衰减');
  assert.equal(layer1.listMonsters().length, 5);
  assertTowerMonsterMix(layer1, 4, 1);
  assert.equal(layer1.listMonsters().every((monster: any) => monster.name.startsWith('虚影')), true);

  connectToPublicMap(deps, 'player:2', 31, 15);
  tower.executeAction('player:2', 'tower:tongtian:enter', deps);
  assert.equal(layer1.listMonsters().length, 5, '中途进入不增加当前波次怪物');
  assertTowerMonsterMix(layer1, 4, 1);

  clearWaveMonsters(layer1);
  tower.advanceInstance(layer1, deps);
  assert.equal(persistence.rows.get('player:1')?.highestLayer, 2);
  assert.equal(persistence.rows.get('player:2')?.highestLayer, 1, '中途进入者不推进本波最高层');
  layer1.tongtianTowerState.nextSpawnTick = layer1.tick;
  tower.advanceInstance(layer1, deps);
  assert.equal(layer1.listMonsters().length, 10, '两名玩家都在场的新波应刷新 8 小怪 2 精英');
  assertTowerMonsterMix(layer1, 8, 2);
  assert.deepEqual(
    tower.buildContextActions(layerViewWithPosition(layer1.buildPlayerView('player:1', 20), 5, 5), deps).map((action) => action.id),
    ['tower:tongtian:next', 'tower:tongtian:exit'],
    '解锁后塔内任意位置都可下一层或退出',
  );

  assert.throws(
    () => tower.executeAction('player:2', 'tower:tongtian:next', deps),
    /尚未通关当前层/,
  );
  const layer2View = tower.executeAction('player:1', 'tower:tongtian:next', deps);
  assert.equal(layer2View.instance.instanceId, 'tower:tongtian:layer:2');
  assert.equal(persistence.rows.get('player:1')?.currentLayer, 2);

  let layer2 = deps.getInstanceRuntimeOrThrow('tower:tongtian:layer:2');
  assert.equal(layer2.listMonsters().length, 5);
  assertTowerMonsterMix(layer2, 4, 1);
  assert.deepEqual(
    tower.buildContextActions(layerViewWithPosition(layer2.buildPlayerView('player:1', 20), 5, 5), deps).map((action) => action.id),
    ['tower:tongtian:previous', 'tower:tongtian:exit'],
    '第二层任意位置都可上一层或退出，未通关时不显示下一层',
  );

  persistence.updateCurrentLayer('player:dead', 99);
  persistence.promoteHighestLayer('player:dead', 99);
  connectToPublicMap(deps, 'player:dead', 31, 15);
  const deadLayerView = tower.executeAction('player:dead', 'tower:tongtian:enter', deps);
  assert.equal(deadLayerView.instance.instanceId, 'tower:tongtian:layer:99');
  const deadPlayer = deps.playerRuntimeService.getPlayer('player:dead');
  assert.ok(deadPlayer, '死亡传送回归用例需要玩家运行态');
  deadPlayer.hp = 0;
  deps.worldRuntimeGmQueueService.markPendingRespawn('player:dead');
  assert.throws(
    () => tower.executeAction('player:dead', 'tower:tongtian:exit', deps),
    /重伤倒地时不能操作通天塔/,
    '死亡时不能通过通天塔动作换层或退出',
  );
  assert.equal(
    deps.worldRuntimeGmQueueService.hasPendingRespawn('player:dead'),
    true,
    '死亡后的通天塔动作不能清掉待复活标记',
  );
  deps.worldRuntimePlayerSessionService.connectPlayer({
    playerId: 'player:dead',
    sessionId: 'session:player:dead',
    instanceId: 'tower:tongtian:layer:99',
    preferredX: 10,
    preferredY: 10,
  }, deps);
  assert.equal(
    deps.worldRuntimeGmQueueService.hasPendingRespawn('player:dead'),
    true,
    '死亡态会话附着不能清掉待复活标记',
  );

  deps.worldRuntimeInstanceStateService.deleteInstanceRuntime('tower:tongtian:layer:2');
  deps.playerLocations.delete('player:1');
  const restoreSession = new WorldRuntimePlayerSessionService(createWorldAccessForSessionRestore(), null);
  const restoredLayer2View = restoreSession.connectPlayer({
    playerId: 'player:1',
    sessionId: 'session:player:1:restore',
    instanceId: 'tower:tongtian:layer:2',
    mapId: 'tongtian_tower_layer_2',
    preferredX: 10,
    preferredY: 10,
  }, deps) as any;
  assert.equal(restoredLayer2View.instance.instanceId, 'tower:tongtian:layer:2', '恢复到已销毁的通天塔层时要按需重建层实例');
  layer2 = deps.getInstanceRuntimeOrThrow('tower:tongtian:layer:2');
  assert.equal(layer2.listMonsters().length, 5, '恢复进入通天塔层后也要立即按当前玩家刷新');
  assertTowerMonsterMix(layer2, 4, 1);

  const cachedTowerLoaded = await tower.primeLayerInstanceCache(
    { instance_id: 'tower:tongtian:layer:7', template_id: 'tongtian_tower_layer_7' },
    deps,
  );
  assert.equal(cachedTowerLoaded, true, '启动恢复应先把通天塔持久化缓存到内存，不直接重建到 runtime');
  assert.equal(
    deps.createInstanceCalls.some((input: any) => input.instanceId === 'tower:tongtian:layer:7'),
    false,
    '缓存恢复不应触发通天塔实例重建',
  );
  assert.equal(
    deps.hydrationCalls.includes('tower:tongtian:layer:7'),
    true,
    '缓存恢复要从磁盘回填通天塔实例状态',
  );
  persistence.updateCurrentLayer('player:cache', 7);
  persistence.promoteHighestLayer('player:cache', 7);
  connectToPublicMap(deps, 'player:cache', 31, 15);
  const cachedLayerView = tower.executeAction('player:cache', 'tower:tongtian:enter', deps);
  assert.equal(cachedLayerView.instance.instanceId, 'tower:tongtian:layer:7');
  assert.equal(
    deps.getInstanceRuntimeOrThrow('tower:tongtian:layer:7').__towerRestoreMarker,
    'hydrated:tower:tongtian:layer:7',
    '恢复后的通天塔层应保留磁盘回填标记',
  );

  tower.executeAction('player:1', 'tower:tongtian:previous', deps);
  assert.equal(persistence.rows.get('player:1')?.currentLayer, 1);

  clearWaveMonsters(layer1);
  const layer1State = layer1.tongtianTowerState;
  layer1State.activeWave = null;
  layer1State.nextSpawnTick = layer1.tick + 60;
  const cooldownPlayer = deps.playerRuntimeService.getPlayer('player:1');
  assert.ok(cooldownPlayer, '通天塔退出前应存在玩家运行态');
  cooldownPlayer.lifeElapsedTicks = 100;
  cooldownPlayer.combat.cooldownReadyTickBySkillId['skill:tongtian:cooldown-smoke'] = 130;
  cooldownPlayer.actions.actions = [{
    id: 'skill:tongtian:cooldown-smoke',
    name: '通天塔冷却测试',
    type: 'skill',
    desc: '',
    cooldownLeft: 30,
  }];
  tower.executeAction('player:1', 'tower:tongtian:exit', deps);
  assert.equal(cooldownPlayer.lifeElapsedTicks, 100, '退出通天塔不能重置玩家自己的 tick');
  assert.equal(
    cooldownPlayer.combat.cooldownReadyTickBySkillId['skill:tongtian:cooldown-smoke'],
    130,
    '退出通天塔不能按源/目标地图 tick 平移技能冷却',
  );
  assert.equal(
    cooldownPlayer.actions.actions.find((entry: any) => entry.id === 'skill:tongtian:cooldown-smoke')?.cooldownLeft,
    30,
    '退出通天塔后技能冷却剩余时间应保持玩家 tick 坐标',
  );
  deps.refreshPlayerContextActions('player:1', deps.getPlayerViewOrThrow('player:1'));
  assert.deepEqual(
    deps.getContextActionIds('player:1').filter((id: string) => id.startsWith('tower:tongtian:')),
    ['tower:tongtian:enter'],
    '退出通天塔后上一层/下一层/退出动作必须移除，只显示入口动作',
  );
  tower.executeAction('player:2', 'tower:tongtian:exit', deps);
  assert.equal(layer1.listMonsters().length, 0, '空层清理后不保留怪物');
  for (let index = 0; index < 60; index += 1) {
    layer1.tickOnce();
  }
  connectToPublicMap(deps, 'player:1', 31, 15);
  tower.executeAction('player:1', 'tower:tongtian:enter', deps);
  assert.equal(layer1.listMonsters().length, 5, '停刷超过一轮后进入立即刷新');
  assertTowerMonsterMix(layer1, 4, 1);

  persistence.updateCurrentLayer('player:3', 50);
  persistence.promoteHighestLayer('player:3', 50);
  assert.equal(tower.getLayerMonsterLevel(50), 50);
  connectToPublicMap(deps, 'player:3', 31, 15);
  tower.executeAction('player:3', 'tower:tongtian:enter', deps);
  const layer50 = deps.getInstanceRuntimeOrThrow('tower:tongtian:layer:50');
  const layer50Monster = layer50.listMonsters().find((monster: any) => monster.monsterId === 'm_tongtian_shadow');
  assert.ok(layer50Monster, '第 50 层应刷新普通虚影');
  assertTowerShadowSkillDamage(layer50Monster);

  const layer1BeforeDestroy = deps.getInstanceRuntime('tower:tongtian:layer:1');
  assert.ok(layer1BeforeDestroy);
  layer1BeforeDestroy.disconnectPlayer('player:1');
  deps.playerLocations.delete('player:1');
  tower.advanceInstance(layer1BeforeDestroy, deps);
  deps.instanceTickProgressById.set('tower:tongtian:layer:1', 0.5);
  deps.tick += 3599;
  await tower.cleanupIdleInstances(deps);
  assert.equal(deps.getInstanceRuntime('tower:tongtian:layer:1'), layer1BeforeDestroy, '不足一小时不能销毁通天塔');
  deps.tick += 1;
  await tower.cleanupIdleInstances(deps);
  assert.equal(deps.getInstanceRuntime('tower:tongtian:layer:1'), null);
  assert.equal(deps.tickProgressClears.includes('tower:tongtian:layer:1'), true, '空闲销毁要清理 tick progress');
  assert.equal(deps.lootStateClears.includes('tower:tongtian:layer:1'), true, '空闲销毁要清理 loot container 内存态');
  assert.equal(deps.flushCalls.includes('tower:tongtian:layer:1'), true, '销毁前应先落盘通天塔地图状态');
  assert.equal(
    deps.catalogWrites.some((entry: any) => entry.instanceId === 'tower:tongtian:layer:1' && entry.status === 'destroyed' && entry.runtimeStatus === 'stopped'),
    true,
    '空闲销毁要标记实例目录 destroyed/stopped',
  );

  console.log('tongtian-tower-smoke ok');
}

function createDeps(
  content: any,
  templates: any,
  tower: WorldRuntimeTongtianTowerService,
): any {
  const instances = new Map<string, MapInstanceRuntime>();
  const playerLocations = new Map<string, { instanceId: string; sessionId: string }>();
  const players = new Map<string, any>();
  const notices: Array<{ playerId: string; text: string; kind: string }> = [];
  const contextActionsByPlayerId = new Map<string, any[]>();
  const instanceTickProgressById = new Map<string, number>();
  const pendingRespawnPlayerIds = new Set<string>();
  const tickProgressClears: string[] = [];
  const lootStateClears: string[] = [];
  const catalogWrites: any[] = [];
  const flushCalls: string[] = [];
  const hydrationCalls: string[] = [];
  const createInstanceCalls: any[] = [];
  const deps: any = {
    tick: 0,
    logger: {
      debug() {},
      warn() {},
    },
    contentTemplateRepository: content,
    templateRepository: templates,
    worldRuntimeTongtianTowerService: tower,
    worldRuntimeInstanceStateService: {
      deleteInstanceRuntime(instanceId: string) {
        instances.delete(instanceId);
      },
      setInstanceRuntime(instanceId: string, instance: MapInstanceRuntime) {
        instances.set(instanceId, instance);
      },
    },
    worldRuntimeTickProgressService: {
      clearInstance(instanceId: string) {
        tickProgressClears.push(instanceId);
        instanceTickProgressById.delete(instanceId);
      },
      initializeInstance(instanceId: string) {
        instanceTickProgressById.set(instanceId, 0);
      },
    },
    worldRuntimeLootContainerService: {
      removeInstanceState(instanceId: string) {
        lootStateClears.push(instanceId);
      },
    },
    instanceCatalogService: {
      isEnabled() {
        return true;
      },
      async upsertInstanceCatalog(input: any) {
        catalogWrites.push(input);
      },
    },
    async hydratePersistentInstanceSnapshot(instanceId: string, instance: any) {
      hydrationCalls.push(instanceId);
      instance.__towerRestoreMarker = `hydrated:${instanceId}`;
      instance.tongtianTowerState = instance.tongtianTowerState ?? {
        layer: Number(instanceId.split(':').pop() ?? 0),
        nextWaveId: 1,
        nextSpawnTick: 0,
        lastEmptyTick: null,
        lastActiveTick: 0,
        activeWave: null,
      };
    },
    async flushInstanceDomains(instanceId: string) {
      flushCalls.push(instanceId);
      return { skipped: false, persistedDomains: [] };
    },
    instanceTickProgressById,
    tickProgressClears,
    lootStateClears,
    catalogWrites,
    flushCalls,
    hydrationCalls,
    createInstanceCalls,
    playerLocations,
    notices,
    getInstanceRuntime(instanceId: string) {
      return instances.get(instanceId) ?? null;
    },
    getInstanceRuntimeOrThrow(instanceId: string) {
      const instance = instances.get(instanceId);
      if (!instance) throw new Error(`missing instance ${instanceId}`);
      return instance;
    },
    setInstanceRuntime(instanceId: string, instance: MapInstanceRuntime) {
      instances.set(instanceId, instance);
    },
    listInstanceEntries() {
      return instances.entries();
    },
    getPlayerLocation(playerId: string) {
      return playerLocations.get(playerId) ?? null;
    },
    getPlayerLocationOrThrow(playerId: string) {
      const location = playerLocations.get(playerId);
      if (!location) throw new Error(`missing player location ${playerId}`);
      return location;
    },
    getPlayerViewOrThrow(playerId: string) {
      const location = deps.getPlayerLocationOrThrow(playerId);
      return deps.getInstanceRuntimeOrThrow(location.instanceId).buildPlayerView(playerId, 20);
    },
    setPlayerLocation(playerId: string, location: { instanceId: string; sessionId: string }) {
      playerLocations.set(playerId, location);
    },
    clearPlayerLocation(playerId: string) {
      playerLocations.delete(playerId);
    },
    clearPendingCommand() {},
    refreshPlayerContextActions(playerId: string, view?: any) {
      const resolvedView = view ?? deps.getPlayerViewOrThrow(playerId);
      const actions = tower.buildContextActions(resolvedView, deps);
      contextActionsByPlayerId.set(playerId, actions);
      return resolvedView;
    },
    getContextActionIds(playerId: string) {
      return (contextActionsByPlayerId.get(playerId) ?? []).map((action: any) => action.id);
    },
    worldRuntimeNavigationService: {
      clearNavigationIntent() {},
    },
    playerRuntimeService: {
      ensurePlayer(playerId: string, sessionId: string) {
        let player = players.get(playerId);
        if (!player) {
          player = {
            playerId,
            sessionId,
            attrs: { numericStats: { moveSpeed: 100, viewRange: 20 } },
            hp: 100,
            maxHp: 100,
            lifeElapsedTicks: 0,
            combat: { cooldownReadyTickBySkillId: {} },
            actions: { actions: [], contextActions: [], revision: 1 },
          };
          players.set(playerId, player);
        }
        player.sessionId = sessionId;
        return player;
      },
      getPlayer(playerId: string) {
        return players.get(playerId) ?? null;
      },
      syncFromWorldView() {},
    },
    worldRuntimeGmQueueService: {
      markPendingRespawn(playerId: string) {
        pendingRespawnPlayerIds.add(playerId);
      },
      clearPendingRespawn(playerId: string) {
        pendingRespawnPlayerIds.delete(playerId);
      },
      hasPendingRespawn(playerId: string) {
        return pendingRespawnPlayerIds.has(playerId);
      },
    },
    worldRuntimePlayerSessionService: {
      connectPlayer(input: any, runtime: any) {
        const playerId = input.playerId;
        const sessionId = input.sessionId ?? `session:${playerId}`;
        const target = runtime.getInstanceRuntimeOrThrow(input.instanceId);
        const previous = runtime.getPlayerLocation(playerId);
        if (previous && previous.instanceId !== target.meta.instanceId) {
          runtime.getInstanceRuntime(previous.instanceId)?.disconnectPlayer(playerId);
        }
        const player = runtime.playerRuntimeService.ensurePlayer(playerId, sessionId);
        target.connectPlayer({
          playerId,
          sessionId,
          preferredX: input.preferredX,
          preferredY: input.preferredY,
        });
        target.setPlayerMoveSpeed(playerId, player.attrs.numericStats.moveSpeed);
        runtime.setPlayerLocation(playerId, {
          instanceId: target.meta.instanceId,
          sessionId,
        });
        const view = target.buildPlayerView(playerId, 20);
        runtime.refreshPlayerContextActions(playerId, view);
        return view;
      },
    },
    getOrCreatePublicInstance(templateId: string) {
      const instanceId = `public:${templateId}`;
      const existing = instances.get(instanceId);
      if (existing) return existing;
      const template = templates.getOrThrow(templateId);
      const instance = new MapInstanceRuntime({
        instanceId,
        template,
        monsterSpawns: content.createRuntimeMonstersForMap(template.id),
        kind: 'public',
        persistent: false,
        createdAt: Date.now(),
        displayName: template.name,
      });
      instances.set(instanceId, instance);
      return instance;
    },
    createInstance(input: any) {
      createInstanceCalls.push(input);
      const existing = instances.get(input.instanceId);
      if (existing) return existing;
      const template = templates.getOrThrow(input.templateId);
      const instance = new MapInstanceRuntime({
        instanceId: input.instanceId,
        template,
        monsterSpawns: content.createRuntimeMonstersForMap(template.id),
        kind: input.kind,
        persistent: input.persistent,
        createdAt: Date.now(),
        displayName: input.displayName,
        linePreset: input.linePreset,
        lineIndex: input.lineIndex,
        instanceOrigin: input.instanceOrigin,
        routeDomain: input.routeDomain,
      });
      instances.set(input.instanceId, instance);
      return instance;
    },
    queuePlayerNotice(playerId: string, text: string, kind = 'info') {
      notices.push({ playerId, text, kind });
    },
  };
  return deps;
}

function connectToPublicMap(deps: any, playerId: string, x: number, y: number): void {
  const instance = deps.getOrCreatePublicInstance('qizhen_crossing');
  deps.worldRuntimePlayerSessionService.connectPlayer({
    playerId,
    sessionId: `session:${playerId}`,
    instanceId: instance.meta.instanceId,
    preferredX: x,
    preferredY: y,
  }, deps);
}

function clearWaveMonsters(instance: any): void {
  const state = instance.tongtianTowerState;
  for (const runtimeId of state?.activeWave?.monsterRuntimeIds ?? []) {
    instance.removeRuntimeMonster(runtimeId);
  }
}

function assertTowerMonsterMix(instance: any, normalCount: number, eliteCount: number): void {
  const monsters = instance.listMonsters();
  assert.equal(
    monsters.filter((monster: any) => monster.monsterId === 'm_tongtian_shadow').length,
    normalCount,
    `通天塔普通虚影数量应为 ${normalCount}`,
  );
  assert.equal(
    monsters.filter((monster: any) => monster.monsterId === 'm_tongtian_shadow_elite').length,
    eliteCount,
    `通天塔精英虚影数量应为 ${eliteCount}`,
  );
}

function assertTowerShadowSkillDamage(monster: any): void {
  const service = new PlayerCombatService({
    applyDamage() {},
    applyTemporaryBuff() {},
  } as any);
  const attackerStats = {
    ...monster.numericStats,
    hit: 100000,
    crit: 0,
    breakPower: 0,
  };
  const target = {
    playerId: 'player:tower-skill-target',
    hp: 10_000_000,
    maxHp: 10_000_000,
    qi: 0,
    maxQi: 0,
    realm: { realmLv: monster.level },
    combatExp: resolveMonsterCombatExpEquivalentFallback(monster.level),
    attrs: {
      finalAttrs: {},
      numericStats: { physDef: 0, spellDef: 0, dodge: 0, antiCrit: 0, resolvePower: 0 },
      ratioDivisors: {},
    },
    buffs: { buffs: [] },
  };
  const expectedBaseDamage = Math.max(1, Math.round(monster.numericStats.physAtk * (1 + monster.level * 0.5)));
  const result = service.castMonsterSkill(
    {
      runtimeId: monster.runtimeId,
      monsterId: monster.monsterId,
      hp: monster.hp,
      maxHp: monster.maxHp,
      qi: monster.qi,
      maxQi: monster.maxQi,
      level: monster.level,
      skills: monster.skills,
      cooldownReadyTickBySkillId: monster.cooldownReadyTickBySkillId,
      attrs: {
        finalAttrs: monster.attrs,
        numericStats: attackerStats,
        ratioDivisors: monster.ratioDivisors,
      },
      buffs: monster.buffs,
    },
    target,
    'skill.tongtian_shadow_strike',
    0,
    1,
    () => undefined,
    () => undefined,
    () => undefined,
  );
  assert.equal(result.skillId, 'skill.tongtian_shadow_strike');
  assert.equal(result.damageRolls?.[0]?.rawDamage, expectedBaseDamage, '虚影技能应按自身境界等级而非功法等级计算基础伤害');
}

function layerViewWithPosition(view: any, x: number, y: number): any {
  return {
    ...view,
    self: {
      ...view.self,
      x,
      y,
    },
  };
}

function createWorldAccessForSessionRestore(): any {
  return {
    resolveDefaultRespawnMapId() {
      return 'qizhen_crossing';
    },
    getOrCreatePublicInstance(mapId: string, deps: any) {
      return deps.getOrCreatePublicInstance(mapId);
    },
    getOrCreateDefaultLineInstance(mapId: string, _linePreset: string, deps: any) {
      return deps.getOrCreatePublicInstance(mapId);
    },
    getPlayerViewOrThrow(playerId: string, deps: any) {
      const location = deps.getPlayerLocationOrThrow(playerId);
      return deps.getInstanceRuntimeOrThrow(location.instanceId).buildPlayerView(playerId, 20);
    },
  };
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

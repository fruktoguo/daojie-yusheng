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
    const progress = { playerId, currentLayer: 1, highestLayer: 1, layerChangeCooldownUntilMs: 0 };
    this.rows.set(playerId, progress);
    return { ...progress };
  }

  updateCurrentLayer(playerId: string, layer: number): TongtianTowerProgress {
    const current = this.rows.get(playerId) ?? {
      playerId,
      currentLayer: 1,
      highestLayer: 1,
      layerChangeCooldownUntilMs: 0,
    };
    current.currentLayer = Math.max(1, Math.trunc(layer));
    current.highestLayer = Math.max(current.highestLayer, current.currentLayer);
    this.rows.set(playerId, current);
    return { ...current };
  }

  promoteHighestLayer(playerId: string, layer: number): TongtianTowerProgress {
    const current = this.rows.get(playerId) ?? {
      playerId,
      currentLayer: 1,
      highestLayer: 1,
      layerChangeCooldownUntilMs: 0,
    };
    current.highestLayer = Math.max(current.highestLayer, Math.max(1, Math.trunc(layer)));
    this.rows.set(playerId, current);
    return { ...current };
  }

  recordLayerClear(playerId: string, unlockedLayer: number, cooldownUntilMs: number): {
    progress: TongtianTowerProgress;
    firstClear: boolean;
  } {
    const current = this.rows.get(playerId) ?? {
      playerId,
      currentLayer: 1,
      highestLayer: 1,
      layerChangeCooldownUntilMs: 0,
    };
    const normalizedLayer = Math.max(1, Math.trunc(unlockedLayer));
    const firstClear = current.highestLayer < normalizedLayer;
    current.highestLayer = Math.max(current.highestLayer, normalizedLayer);
    if (!firstClear) {
      current.layerChangeCooldownUntilMs = Math.max(
        current.layerChangeCooldownUntilMs,
        Math.max(0, Math.trunc(cooldownUntilMs)),
      );
    }
    this.rows.set(playerId, current);
    return { progress: { ...current }, firstClear };
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
  const enterView = await tower.executeAction('player:1', 'tower:tongtian:enter', deps);
  assert.equal(enterView.instance.instanceId, 'tower:tongtian:layer:1');
  assert.deepEqual(
    deps.notices.at(-1),
    {
      playerId: 'player:1',
      text: '你进入通天塔第 1 层。',
      kind: 'success',
      key: 'notice.tower.entered',
      vars: { layer: 1 },
    },
    '进入通天塔必须发送由客户端渲染的结构化通知',
  );
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

  await assert.rejects(
    tower.executeAction('player:1', 'tower:tongtian:previous', deps),
    /第一层不能退到上一层/,
  );
  await assert.rejects(
    tower.executeAction('player:1', 'tower:tongtian:next', deps),
    /尚未通关当前层/,
  );

  const layer1 = deps.getInstanceRuntimeOrThrow('tower:tongtian:layer:1');
  const layer1CreateInput = deps.createInstanceCalls.find((input: any) => input.instanceId === 'tower:tongtian:layer:1');
  assert.equal(layer1CreateInput?.supportsPvp, false, '通天塔正常创建路径必须显式禁用 PVP，不能依赖实例默认能力');
  assert.equal(layer1CreateInput?.canDamageTile, false, '通天塔正常创建路径必须显式禁用地块攻击');
  assert.equal(layer1.meta.supportsPvp, false, '通天塔实例不允许玩家互攻');
  assert.equal(layer1.meta.canDamageTile, false, '通天塔实例不允许攻击地块');
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
  await tower.executeAction('player:2', 'tower:tongtian:enter', deps);
  assert.equal(layer1.listMonsters().length, 5, '中途进入不增加当前波次怪物');
  assertTowerMonsterMix(layer1, 4, 1);

  clearWaveMonsters(layer1);
  tower.advanceInstance(layer1, deps);
  assert.equal(persistence.rows.get('player:1')?.highestLayer, 2);
  assert.equal(persistence.rows.get('player:2')?.highestLayer, 2, '中途加入并参与清层的玩家也应推进本波最高层');
  assert.equal(persistence.rows.get('player:1')?.layerChangeCooldownUntilMs, 0, '首次通过者不进入换层冷却');
  assert.equal(persistence.rows.get('player:2')?.layerChangeCooldownUntilMs, 0, '中途参与者首次通过也不进入换层冷却');
  assert.deepEqual(
    deps.notices.filter((notice: any) => notice.key === 'notice.tower.layer-cleared'),
    [
      {
        playerId: 'player:1',
        text: '通天塔第 1 层已通关，可前往第 2 层。',
        kind: 'success',
        key: 'notice.tower.layer-cleared',
        vars: { layer: 1, unlockedLayer: 2 },
      },
      {
        playerId: 'player:2',
        text: '通天塔第 1 层已通关，可前往第 2 层。',
        kind: 'success',
        key: 'notice.tower.layer-cleared',
        vars: { layer: 1, unlockedLayer: 2 },
      },
    ],
    '首次通关通知应发给所有清层参与者，并携带客户端渲染所需层数变量',
  );
  layer1.tongtianTowerState.nextSpawnTick = layer1.tick;
  tower.advanceInstance(layer1, deps);
  assert.equal(layer1.listMonsters().length, 10, '两名玩家都在场的新波应刷新 8 小怪 2 精英');
  assertTowerMonsterMix(layer1, 8, 2);
  assert.deepEqual(
    tower.buildContextActions(layerViewWithPosition(layer1.buildPlayerView('player:1', 20), 5, 5), deps).map((action) => action.id),
    ['tower:tongtian:next', 'tower:tongtian:exit'],
    '解锁后塔内任意位置都可下一层或退出',
  );

  assert.equal(
    tower.buildContextActions(layer1.buildPlayerView('player:2', 20), deps)
      .find((action) => action.id === 'tower:tongtian:next')?.cooldownLeft,
    0,
    '中途参与者首次通过后应能立即换层',
  );
  const layer2View = await tower.executeAction('player:1', 'tower:tongtian:next', deps);
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

  clearWaveMonsters(layer1);
  layer1.tongtianTowerState.activeWave = null;
  layer1.tongtianTowerState.nextSpawnTick = layer1.tick;
  tower.advanceInstance(layer1, deps);
  assert.equal(layer1.listMonsters().length, 5, '重复挑战波次应只按当前留在本层的玩家刷新');
  connectToPublicMap(deps, 'player:first-participant', 31, 15);
  await tower.executeAction('player:first-participant', 'tower:tongtian:enter', deps);
  assert.equal(layer1.listMonsters().length, 5, '首次参与者中途加入不增加当前波次怪物');

  const repeatCooldownUntilMs = deps.resolveCurrentTimeMs() + 30_000;
  clearWaveMonsters(layer1);
  tower.advanceInstance(layer1, deps);
  assert.equal(
    persistence.rows.get('player:2')?.layerChangeCooldownUntilMs,
    repeatCooldownUntilMs,
    '已通过当前层的参与者再次清层后应进入 30 秒换层冷却',
  );
  assert.equal(
    persistence.rows.get('player:first-participant')?.highestLayer,
    2,
    '中途加入清层的首次参与者应解锁下一层',
  );
  assert.equal(
    persistence.rows.get('player:first-participant')?.layerChangeCooldownUntilMs,
    0,
    '中途加入清层的首次参与者不应进入换层冷却',
  );
  assert.deepEqual(
    deps.notices.slice(-2),
    [
      {
        playerId: 'player:2',
        text: '通天塔第 1 层已清空，需等待 30 秒后换层。',
        kind: 'success',
        key: 'notice.tower.layer-cleared-cooldown',
        vars: { layer: 1, cooldownSeconds: 30 },
      },
      {
        playerId: 'player:first-participant',
        text: '通天塔第 1 层已通关，可前往第 2 层。',
        kind: 'success',
        key: 'notice.tower.layer-cleared',
        vars: { layer: 1, unlockedLayer: 2 },
      },
    ],
    '同一波应按玩家分别发送重复清层冷却与首次通关通知',
  );

  const repeatedNextAction = tower.buildContextActions(layer1.buildPlayerView('player:2', 20), deps)
    .find((action) => action.id === 'tower:tongtian:next');
  assert.equal(repeatedNextAction?.cooldownLeft, 30, '重复清层者的下一层动作应显示 30 秒冷却');
  assert.equal(repeatedNextAction?.cooldownReadyTick, 30, '换层动作应投影稳定的玩家生命 tick 冷却终点');
  assert.equal(
    tower.buildContextActions(layer1.buildPlayerView('player:first-participant', 20), deps)
      .find((action) => action.id === 'tower:tongtian:next')?.cooldownLeft,
    0,
    '首次参与者的下一层动作应立即可用',
  );
  await assert.rejects(
    tower.executeAction('player:2', 'tower:tongtian:next', deps),
    /还需 30 秒/,
    '服务端必须拒绝处于换层冷却中的动作，不能只依赖客户端禁用按钮',
  );
  const firstParticipantLayer2View = await tower.executeAction(
    'player:first-participant',
    'tower:tongtian:next',
    deps,
  );
  assert.equal(firstParticipantLayer2View.instance.instanceId, 'tower:tongtian:layer:2');
  deps.advanceTimeSeconds(29);
  await assert.rejects(
    tower.executeAction('player:2', 'tower:tongtian:next', deps),
    /还需 1 秒/,
  );
  deps.advanceTimeSeconds(1);
  const repeatedLayer2View = await tower.executeAction('player:2', 'tower:tongtian:next', deps);
  assert.equal(repeatedLayer2View.instance.instanceId, 'tower:tongtian:layer:2', '冷却结束后应允许换层');

  persistence.updateCurrentLayer('player:dead', 99);
  persistence.promoteHighestLayer('player:dead', 99);
  connectToPublicMap(deps, 'player:dead', 31, 15);
  const deadLayerView = await tower.executeAction('player:dead', 'tower:tongtian:enter', deps);
  assert.equal(deadLayerView.instance.instanceId, 'tower:tongtian:layer:99');
  const deadPlayer = deps.playerRuntimeService.getPlayer('player:dead');
  assert.ok(deadPlayer, '死亡传送回归用例需要玩家运行态');
  deadPlayer.hp = 0;
  deps.worldRuntimeGmQueueService.markPendingRespawn('player:dead');
  await assert.rejects(
    tower.executeAction('player:dead', 'tower:tongtian:exit', deps),
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
  const restoredLayer2View = await restoreSession.connectPlayerWhenReady({
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

  tower.restoreCatalogTowerTemplate({ instance_id: 'real:tongtian_tower_layer_30', template_id: 'tongtian_tower_layer_30' }, deps);
  deps.createInstance({
    instanceId: 'real:tongtian_tower_layer_30',
    templateId: 'tongtian_tower_layer_30',
    kind: 'public',
    persistent: true,
    linePreset: 'real',
    lineIndex: 1,
    displayName: '通天塔 第 30 层·真实',
  });
  const wrongRealTowerView = await restoreSession.connectPlayerWhenReady({
    playerId: 'player:wrong-real-tower',
    sessionId: 'session:wrong-real-tower',
    instanceId: 'real:tongtian_tower_layer_30',
    preferredX: 10,
    preferredY: 10,
  }, deps) as any;
  assert.equal(
    wrongRealTowerView.instance.instanceId,
    'tower:tongtian:layer:30',
    '已有真实线通天塔普通实例时，重连也必须强制回到通天塔专用实例',
  );

  const cachedTowerLoaded = await tower.primeLayerInstanceCache(
    { instance_id: 'tower:tongtian:layer:7', template_id: 'tongtian_tower_layer_7' },
    deps,
  );
  assert.equal(cachedTowerLoaded, true, '启动恢复只注册通天塔模板');
  assert.equal(
    deps.createInstanceCalls.some((input: any) => input.instanceId === 'tower:tongtian:layer:7'),
    false,
    '模板恢复不应提前物化通天塔实例',
  );
  assert.equal(
    deps.hydrationCalls.includes('tower:tongtian:layer:7'),
    false,
    '模板恢复不应使用启动快照提前水合塔层',
  );
  assert.equal(tower.ensureLayerInstanceForRestore(
    { instanceId: 'tower:tongtian:layer:10' },
    deps,
    { allowCreate: true, requireCatalogEntry: true },
  ), null, '离线恢复不能为 catalog 缺失的塔层制造第二真源');

  await tower.executeAction('player:1', 'tower:tongtian:previous', deps);
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
  await tower.executeAction('player:1', 'tower:tongtian:exit', deps);
  assert.deepEqual(
    deps.notices.at(-1),
    {
      playerId: 'player:1',
      text: '你退出通天塔，回到栖真渡。',
      kind: 'success',
      key: 'notice.tower.exited',
      vars: { mapName: '栖真渡' },
    },
    '退出通天塔必须把目标地图名作为结构化变量发送',
  );
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
  await tower.executeAction('player:2', 'tower:tongtian:exit', deps);
  assert.equal(layer1.listMonsters().length, 0, '空层清理后不保留怪物');
  for (let index = 0; index < 60; index += 1) {
    layer1.tickOnce();
  }
  connectToPublicMap(deps, 'player:1', 31, 15);
  await tower.executeAction('player:1', 'tower:tongtian:enter', deps);
  assert.equal(layer1.listMonsters().length, 5, '停刷超过一轮后进入立即刷新');
  assertTowerMonsterMix(layer1, 4, 1);

  persistence.updateCurrentLayer('player:3', 50);
  persistence.promoteHighestLayer('player:3', 50);
  assert.equal(tower.getLayerMonsterLevel(50), 50);
  connectToPublicMap(deps, 'player:3', 31, 15);
  await tower.executeAction('player:3', 'tower:tongtian:enter', deps);
  const layer50 = deps.getInstanceRuntimeOrThrow('tower:tongtian:layer:50');
  const layer50Monster = layer50.listMonsters().find((monster: any) => monster.monsterId === 'm_tongtian_shadow');
  assert.ok(layer50Monster, '第 50 层应刷新普通虚影');
  assertTowerShadowSkillDamage(layer50Monster);

  const layer1BeforeDestroy = deps.getInstanceRuntime('tower:tongtian:layer:1');
  assert.ok(layer1BeforeDestroy);
  layer1BeforeDestroy.disconnectPlayer('player:1');
  deps.playerLocations.delete('player:1');
  tower.advanceInstance(layer1BeforeDestroy, deps);
  layer1BeforeDestroy.meta.assignedNodeId = 'node:tongtian-smoke';
  layer1BeforeDestroy.meta.leaseToken = 'lease:tongtian-smoke:layer:1';
  layer1BeforeDestroy.meta.leaseExpireAt = new Date(Date.now() + 60_000).toISOString();
  layer1BeforeDestroy.meta.ownershipEpoch = 4;
  layer1BeforeDestroy.meta.runtimeStatus = 'leased';
  deps.setCatalogEnabled(true);
  deps.instanceTickProgressById.set('tower:tongtian:layer:1', 0.5);
  deps.tick += 3599;
  await tower.cleanupIdleInstances(deps);
  assert.equal(deps.getInstanceRuntime('tower:tongtian:layer:1'), layer1BeforeDestroy, '不足一小时不能销毁通天塔');
  deps.tick += 1;
  deps.failFlushForInstance('tower:tongtian:layer:1');
  await tower.cleanupIdleInstances(deps);
  assert.equal(deps.getInstanceRuntime('tower:tongtian:layer:1'), layer1BeforeDestroy, '空闲落盘失败时必须保留通天塔运行态');
  assert.equal(
    deps.catalogDestroyCalls.filter((entry: any) => entry.instanceId === 'tower:tongtian:layer:1').length,
    0,
    '空闲落盘失败时不能尝试 catalog 销毁',
  );
  deps.restoreFlushForInstance('tower:tongtian:layer:1');
  deps.markDirtyAfterFlush('tower:tongtian:layer:1');
  await tower.cleanupIdleInstances(deps);
  assert.equal(deps.getInstanceRuntime('tower:tongtian:layer:1'), layer1BeforeDestroy, '落盘后仍有 dirty domain 时必须保留通天塔运行态');
  assert.equal(
    deps.catalogDestroyCalls.filter((entry: any) => entry.instanceId === 'tower:tongtian:layer:1').length,
    0,
    '仍有 dirty domain 时不能尝试 catalog 销毁',
  );
  deps.clearDirtyAfterFlush('tower:tongtian:layer:1');
  await tower.cleanupIdleInstances(deps);
  assert.equal(deps.getInstanceRuntime('tower:tongtian:layer:1'), layer1BeforeDestroy, 'catalog lease/epoch 冲突时必须保留通天塔运行态');
  assert.equal(layer1BeforeDestroy.meta.status, 'active', 'catalog 销毁冲突不能先污染内存状态');
  assert.equal(deps.tickProgressClears.includes('tower:tongtian:layer:1'), false, 'catalog 销毁冲突不能清理 tick progress');
  deps.allowCatalogDestroy('tower:tongtian:layer:1');
  await tower.cleanupIdleInstances(deps);
  assert.equal(deps.getInstanceRuntime('tower:tongtian:layer:1'), null);
  assert.equal(deps.tickProgressClears.includes('tower:tongtian:layer:1'), true, '空闲销毁要清理 tick progress');
  assert.equal(deps.lootStateClears.includes('tower:tongtian:layer:1'), true, '空闲销毁要清理 loot container 内存态');
  assert.equal(deps.flushCalls.includes('tower:tongtian:layer:1'), true, '销毁前应先落盘通天塔地图状态');
  assert.equal(layer1BeforeDestroy.meta.ownershipEpoch, 5, '空闲销毁成功后要采用 catalog 返回的新 ownership epoch');
  assert.deepEqual(
    deps.catalogDestroyCalls.filter((entry: any) => entry.instanceId === 'tower:tongtian:layer:1').at(-1),
    {
      instanceId: 'tower:tongtian:layer:1',
      assignedNodeId: 'node:tongtian-smoke',
      leaseToken: 'lease:tongtian-smoke:layer:1',
      expectedOwnershipEpoch: 4,
      destroyAt: layer1BeforeDestroy.meta.destroyAt,
    },
    '空闲销毁必须携带当前 lease/epoch 进入统一 catalog CAS',
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
  const notices: Array<{
    playerId: string;
    text: string;
    kind: string;
    key: string | null;
    vars?: Record<string, string | number>;
  }> = [];
  const contextActionsByPlayerId = new Map<string, any[]>();
  const instanceTickProgressById = new Map<string, number>();
  const pendingRespawnPlayerIds = new Set<string>();
  const tickProgressClears: string[] = [];
  const lootStateClears: string[] = [];
  const catalogDestroyCalls: any[] = [];
  const catalogDestroyAllowedInstanceIds = new Set<string>();
  const flushFailureInstanceIds = new Set<string>();
  const dirtyAfterFlushInstanceIds = new Set<string>();
  const flushCalls: string[] = [];
  const hydrationCalls: string[] = [];
  const leaseSyncCalls: string[] = [];
  const restoreOrder: string[] = [];
  const createInstanceCalls: any[] = [];
  let catalogEnabled = false;
  let currentTimeMs = 1_000_000;
  const deps: any = {
    tick: 0,
    resolveCurrentTimeMs() {
      return currentTimeMs;
    },
    resolveCurrentTickForPlayerId(playerId: string) {
      return Math.max(0, Math.trunc(Number(players.get(playerId)?.lifeElapsedTicks ?? 0)));
    },
    advanceTimeSeconds(secondsInput: number) {
      const seconds = Math.max(0, Math.trunc(Number(secondsInput) || 0));
      currentTimeMs += seconds * 1_000;
      for (const player of players.values()) {
        player.lifeElapsedTicks = Math.max(0, Math.trunc(Number(player.lifeElapsedTicks) || 0)) + seconds;
      }
    },
    logger: {
      debug() {},
      warn() {},
      log() {},
    },
    nodeRegistryService: {
      getNodeId() {
        return 'node:tongtian-smoke';
      },
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
        return catalogEnabled;
      },
      async destroyInstanceCatalogWithFence(input: any) {
        catalogDestroyCalls.push(input);
        if (!catalogDestroyAllowedInstanceIds.has(input.instanceId)) {
          return { ok: false, ownershipEpoch: null };
        }
        return { ok: true, ownershipEpoch: Number(input.expectedOwnershipEpoch) + 1 };
      },
    },
    async hydratePersistentInstanceSnapshot(instanceId: string, instance: any) {
      hydrationCalls.push(instanceId);
      restoreOrder.push(`hydrate:${instanceId}`);
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
    async waitForInstanceLeaseReady() {},
    async flushInstanceDomains(instanceId: string) {
      flushCalls.push(instanceId);
      if (flushFailureInstanceIds.has(instanceId)) {
        throw new Error(`simulated_tower_flush_failure:${instanceId}`);
      }
      return { skipped: false, persistedDomains: [] };
    },
    listDirtyPersistentInstances() {
      return Array.from(dirtyAfterFlushInstanceIds);
    },
    failFlushForInstance(instanceId: string) {
      flushFailureInstanceIds.add(instanceId);
    },
    restoreFlushForInstance(instanceId: string) {
      flushFailureInstanceIds.delete(instanceId);
    },
    markDirtyAfterFlush(instanceId: string) {
      dirtyAfterFlushInstanceIds.add(instanceId);
    },
    clearDirtyAfterFlush(instanceId: string) {
      dirtyAfterFlushInstanceIds.delete(instanceId);
    },
    allowCatalogDestroy(instanceId: string) {
      catalogDestroyAllowedInstanceIds.add(instanceId);
    },
    instanceTickProgressById,
    tickProgressClears,
    lootStateClears,
    catalogDestroyCalls,
    flushCalls,
    hydrationCalls,
    leaseSyncCalls,
    restoreOrder,
    createInstanceCalls,
    setCatalogEnabled(enabled: boolean) {
      catalogEnabled = enabled;
    },
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
        supportsPvp: input.supportsPvp,
        canDamageTile: input.canDamageTile,
        status: input.status,
        runtimeStatus: input.runtimeStatus,
        assignedNodeId: input.assignedNodeId,
        leaseToken: input.leaseToken,
        leaseExpireAt: input.leaseExpireAt,
        ownershipEpoch: input.ownershipEpoch,
        clusterId: input.clusterId,
        shardKey: input.shardKey,
        routeDomain: input.routeDomain,
        destroyAt: input.destroyAt,
        lastActiveAt: input.lastActiveAt,
        lastPersistedAt: input.lastPersistedAt,
      });
      instances.set(input.instanceId, instance);
      return instance;
    },
    queuePlayerNotice(
      playerId: string,
      text: string,
      kind = 'info',
      _title?: string,
      _icon?: string,
      structured?: { key?: string; vars?: Record<string, string | number> },
    ) {
      notices.push({
        playerId,
        text,
        kind,
        key: structured?.key ?? null,
        ...(structured?.vars ? { vars: structured.vars } : undefined),
      });
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

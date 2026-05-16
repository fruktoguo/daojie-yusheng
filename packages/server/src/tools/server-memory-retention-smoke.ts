import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { NativeAuthRateLimitService } from '../http/native/native-auth-rate-limit.service';
import { WorldProjectorService } from '../network/world-projector.service';
import { WorldSyncMapSnapshotService } from '../network/world-sync-map-snapshot.service';
import { WorldSyncMapStaticAuxService } from '../network/world-sync-map-static-aux.service';
import { WorldSessionRecoveryQueueService } from '../network/world-session-recovery-queue.service';
import { FlushWakeupService } from '../persistence/flush-wakeup.service';
import { OutboxDispatcherRuntimeService } from '../persistence/outbox-dispatcher-runtime.service';
import { PlayerCountersPersistenceService } from '../persistence/player-counters-persistence.service';
import { RuntimeEventBusService } from '../runtime/event-bus/runtime-event-bus.service';
import { MailRuntimeService } from '../runtime/mail/mail-runtime.service';
import { RedeemCodeRuntimeService } from '../runtime/redeem/redeem-code-runtime.service';
import { SuggestionRuntimeService } from '../runtime/suggestion/suggestion-runtime.service';

async function main(): Promise<void> {
  const mailProof = await proveMailboxCacheBound();
  const redeemProof = await proveRedeemRateCachePrune();
  const recoveryProof = await proveRecoveryQueueBoundaries();
  const outboxProof = await proveOutboxDedupeBound();
  const authRateProof = await proveAuthRateLimitPrune();
  const flushWakeupProof = proveFlushWakeupBound();
  const eventBusProof = proveEventBusReleasesQueues();
  const playerCountersProof = provePlayerCountersSkipGmBots();
  const projectorProof = proveProjectorKeepsCacheOnNoopDelta();
  const instanceProjectionProof = proveProjectorSharesStableInstanceEntryRefs();
  const projectorFullEnvelopeRefProof = proveProjectorFullEnvelopeUsesCapturedRefs();
  const tileProjectionProof = proveTileProjectionRefsReachPlayerCache();
  const panelSliceRefProof = provePanelSliceCacheReusedOnNoopDelta();
  const combatEffectRefProof = proveCombatEffectRefsPassThroughEventBus();
  const persistenceDirtyDomainProjectionProof = provePersistenceDirtyDomainProjectionPresent();
  const viewHotpathProof = proveViewHotpathOptimizationsPresent();
  const cacheLifecycleProof = proveEntryCachesFollowLifecycle();
  const suggestionProof = await proveSuggestionTextBounds();
  const gmObserverProof = proveGmWorldObserverIdsRemoved();

  console.log(JSON.stringify({
    ok: true,
    mailProof,
    redeemProof,
    recoveryProof,
    outboxProof,
    authRateProof,
    flushWakeupProof,
    eventBusProof,
    playerCountersProof,
    projectorProof,
    instanceProjectionProof,
    projectorFullEnvelopeRefProof,
    tileProjectionProof,
    panelSliceRefProof,
    combatEffectRefProof,
    persistenceDirtyDomainProjectionProof,
    viewHotpathProof,
    cacheLifecycleProof,
    suggestionProof,
    gmObserverProof,
    answers:
      '已证明本轮新增的内存保留边界：邮箱缓存 LRU 有上限且加载失败释放 pending；兑换频率表会按 TTL 清理；恢复队列同 key 覆盖且有最大排队；Outbox 本地去重有环形上限；认证限流桶会清理过期项；flush wakeup key 有上限；EventBus drain/flush 后释放玩家和实例队列；PlayerCounters 不缓存/落库 GM bot；Projector 无变化 delta 不替换缓存/不重捕获玩家 panel；多玩家共享同一稳定实例条目的 projector 投影 ref；Projector 全量 envelope 与 panel diff patch 复用已捕获 world/panel 引用；Projector runtime bonus 克隆按源数组复用；tile projection ref 会进入玩家 map static cache；panel slice 在 noop delta 下复用缓存；combat effect 以只读 ref 透传；持久化 flush 已把 dirtyDomains 下传到运行态快照并按域裁剪大子树克隆；玩家视野、妖兽视野条目与 overlay 热路径优化已落在生产源码；建议文本服务端限长；GM world 不再保留 observer id。',
    excludes:
      '不证明正式服真实 RSS 曲线，也不证明全量业务缓存已改为懒加载；这里只覆盖本轮确定修复的保留边界。',
  }, null, 2));
}

async function proveMailboxCacheBound(): Promise<{ cacheSize: number; failedLoadPendingSize: number }> {
  const service = new MailRuntimeService(
    {},
    {},
    { loadMailbox: async () => null },
    {},
    {},
    {},
  );
  for (let index = 0; index < 5005; index += 1) {
    await service.ensurePlayerMailbox(`mail_cache_${index}`);
  }
  assert.equal(service.mailboxByPlayerId.size, 5000);

  const failing = new MailRuntimeService(
    {},
    {},
    { loadMailbox: async () => { throw new Error('simulated_mail_load_failure'); } },
    {},
    {},
    {},
  );
  await assert.rejects(() => failing.ensurePlayerMailbox('mail_cache_fail'));
  assert.equal(failing.loadingMailboxByPlayerId.size, 0);
  return { cacheSize: service.mailboxByPlayerId.size, failedLoadPendingSize: failing.loadingMailboxByPlayerId.size };
}

async function proveRedeemRateCachePrune(): Promise<{ before: number; after: number }> {
  const service = new RedeemCodeRuntimeService({}, {}, {}, {}, {});
  const now = Date.now();
  service._redeemRateMap = new Map([
    ['stale_a', now - 120_000],
    ['stale_b', now - 90_000],
    ['fresh', now],
  ]);
  const before = service._redeemRateMap.size;
  service.pruneRedeemRateMap(now);
  assert.equal(service._redeemRateMap.size, 1);
  assert.equal(service._redeemRateMap.has('fresh'), true);
  return { before, after: service._redeemRateMap.size };
}

async function proveRecoveryQueueBoundaries(): Promise<{ queued: number; maxQueued: number; firstRejected: boolean }> {
  process.env.SERVER_BOOTSTRAP_RECOVERY_QUEUE_MAX = '64';
  const service = new WorldSessionRecoveryQueueService();
  (service as unknown as { inFlight: number }).inFlight = 64;
  const first = service.enqueue({ key: 'same_player', run: async () => 'first' }).catch((error: unknown) => error);
  const second = service.enqueue({ key: 'same_player', run: async () => 'second' });
  const firstResult = await first;
  const snapshot = service.getSnapshot();
  assert.equal(firstResult instanceof Error && firstResult.message === 'recovery_queue_superseded', true);
  assert.equal(snapshot.queued, 1);
  assert.equal(snapshot.maxQueued, 64);
  (service as unknown as { inFlight: number }).inFlight = 0;
  await (service as unknown as { drain: () => Promise<void> }).drain();
  await second;
  return { queued: snapshot.queued, maxQueued: snapshot.maxQueued, firstRejected: true };
}

async function proveOutboxDedupeBound(): Promise<{ eventIds: number; operationIds: number }> {
  process.env.SERVER_OUTBOX_LOCAL_DEDUPE_LIMIT = '1000';
  const service = new OutboxDispatcherRuntimeService({ isEnabled: () => false } as never, null);
  for (let index = 0; index < 1005; index += 1) {
    service.markProcessedEvent(`event_${index}`, `operation_${index}`);
  }
  const state = service as unknown as {
    processedEventIds: Set<string>;
    processedOperationIds: Set<string>;
  };
  assert.equal(state.processedEventIds.size, 1000);
  assert.equal(state.processedOperationIds.size, 1000);
  assert.equal(state.processedEventIds.has('event_0'), false);
  assert.equal(state.processedEventIds.has('event_1004'), true);
  return { eventIds: state.processedEventIds.size, operationIds: state.processedOperationIds.size };
}

async function proveAuthRateLimitPrune(): Promise<{ before: number; after: number }> {
  const service = new NativeAuthRateLimitService();
  const state = service as unknown as {
    buckets: Map<string, { failures: number; blockedUntil: number; lastTouchedAt: number }>;
    lastPrunedAt: number;
  };
  const now = Date.now();
  state.buckets.set('login:ip:stale', { failures: 1, blockedUntil: 0, lastTouchedAt: now - 900_000 });
  state.buckets.set('login:ip:fresh', { failures: 1, blockedUntil: 0, lastTouchedAt: now });
  state.lastPrunedAt = 0;
  const before = state.buckets.size;
  service.recordFailure('login', { ip: '127.0.0.1' }, 'fresh_user');
  assert.equal(state.buckets.has('login:ip:stale'), false);
  assert.equal(state.buckets.has('login:ip:fresh'), true);
  return { before, after: state.buckets.size };
}

function proveFlushWakeupBound(): { count: number; oldestDropped: boolean; newestKept: boolean } {
  process.env.SERVER_FLUSH_WAKEUP_KEY_LIMIT = '128';
  const service = new FlushWakeupService();
  for (let index = 0; index < 140; index += 1) {
    service.signalPlayerFlush(`flush_player_${index}`);
  }
  const keys = service.listWakeupKeys();
  assert.equal(keys.length, 128);
  const oldestDropped = !keys.includes('flush:wakeup:player:flush_player_0');
  const newestKept = keys.includes('flush:wakeup:player:flush_player_139');
  assert.equal(oldestDropped, true);
  assert.equal(newestKept, true);
  return { count: keys.length, oldestDropped, newestKept };
}

function proveEventBusReleasesQueues(): {
  playerAfterDrain: number;
  instanceAfterDrain: number;
  playerAfterFlush: number;
  instanceAfterFlush: number;
} {
  const service = new RuntimeEventBusService();
  service.queuePlayerNotice('event_player_drain', { kind: 'info', text: 'drain' });
  service.queueCombatEffect('event_instance_drain', { type: 'float', x: 0, y: 0, text: 'drain' });
  assert.ok(service.drainPlayer('event_player_drain'));
  assert.ok(service.drainInstance('event_instance_drain'));
  const playerAfterDrain = service.getPlayerQueueCount();
  const instanceAfterDrain = service.getInstanceQueueCount();

  service.queuePlayerNotice('event_player_flush', { kind: 'info', text: 'flush' });
  service.queueCombatEffect('event_instance_flush', { type: 'float', x: 0, y: 0, text: 'flush' });
  service.flushTick();
  const playerAfterFlush = service.getPlayerQueueCount();
  const instanceAfterFlush = service.getInstanceQueueCount();

  assert.equal(playerAfterDrain, 0);
  assert.equal(instanceAfterDrain, 0);
  assert.equal(playerAfterFlush, 0);
  assert.equal(instanceAfterFlush, 0);
  return { playerAfterDrain, instanceAfterDrain, playerAfterFlush, instanceAfterFlush };
}

function provePlayerCountersSkipGmBots(): { cachedPlayerIds: string[]; realCounter: number; botCounter: number } {
  const service = new PlayerCountersPersistenceService(null);
  service.increment('gm_bot_memory_1', 'monsterKillCount');
  service.setMax('gm_bot_memory_1', 'highestRealmLv', 99);
  service.increment('real_player_memory_1', 'monsterKillCount', 3);

  const cachedPlayerIds = service.listCachedPlayerIds();
  assert.deepEqual(cachedPlayerIds, ['real_player_memory_1']);
  assert.equal(service.get('real_player_memory_1', 'monsterKillCount'), 3);
  assert.equal(service.get('gm_bot_memory_1', 'monsterKillCount'), 0);
  assert.equal(service.getAll('gm_bot_memory_1').size, 0);
  return {
    cachedPlayerIds,
    realCounter: service.get('real_player_memory_1', 'monsterKillCount'),
    botCounter: service.get('gm_bot_memory_1', 'monsterKillCount'),
  };
}

function proveProjectorKeepsCacheOnNoopDelta(): { deltaIsNull: boolean; cacheReused: boolean } {
  const service = new WorldProjectorService({
    has: () => true,
    getOrThrow: (mapId: string) => ({ name: mapId }),
  } as never, null);
  const view = createProjectorView();
  const player = createProjectorPlayer();
  service.createInitialEnvelope({ playerId: 'projector_player', sessionId: 'projector_session' }, view, player);
  const state = service as unknown as { cacheByPlayerId: Map<string, unknown> };
  const before = state.cacheByPlayerId.get('projector_player');
  const delta = service.createDeltaEnvelope({ ...view, tick: 2 }, player);
  const after = state.cacheByPlayerId.get('projector_player');
  assert.equal(delta, null);
  assert.equal(after, before);
  return { deltaIsNull: delta === null, cacheReused: after === before };
}

function proveProjectorSharesStableInstanceEntryRefs(): { monsterRefShared: boolean; npcRefShared: boolean; containerRefShared: boolean } {
  const service = new WorldProjectorService({
    has: () => true,
    getOrThrow: (mapId: string) => ({ name: mapId }),
  } as never, null);
  const sharedMonster = {
    runtimeId: 'shared_monster',
    monsterId: 'm_shared',
    x: 2,
    y: 2,
    hp: 10,
    maxHp: 10,
    qi: 5,
    maxQi: 5,
    name: '共享妖兽',
    char: '妖',
    color: '#f00',
    tier: 'common',
  };
  const sharedNpc = {
    npcId: 'shared_npc',
    x: 3,
    y: 3,
    name: '共享 NPC',
    char: '人',
    color: '#fff',
    hasShop: false,
  };
  const sharedContainer = {
    id: 'shared_container',
    x: 4,
    y: 4,
    name: '共享容器',
    char: '箱',
    color: '#c18b46',
  };
  const playerA = createProjectorPlayerWithId('projection_player_a');
  const playerB = createProjectorPlayerWithId('projection_player_b');
  service.createInitialEnvelope(
    { playerId: playerA.playerId, sessionId: 'projection_session_a' },
    createProjectorViewWithEntries(playerA.playerId, [sharedMonster], [sharedNpc], [sharedContainer]),
    playerA,
  );
  service.createInitialEnvelope(
    { playerId: playerB.playerId, sessionId: 'projection_session_b' },
    createProjectorViewWithEntries(playerB.playerId, [sharedMonster], [sharedNpc], [sharedContainer]),
    playerB,
  );
  const state = service as unknown as { cacheByPlayerId: Map<string, any> };
  const cacheA = state.cacheByPlayerId.get(playerA.playerId);
  const cacheB = state.cacheByPlayerId.get(playerB.playerId);
  const monsterRefShared = cacheA.monsters.get(sharedMonster.runtimeId) === cacheB.monsters.get(sharedMonster.runtimeId);
  const npcRefShared = cacheA.npcs.get(sharedNpc.npcId) === cacheB.npcs.get(sharedNpc.npcId);
  const containerRefShared = cacheA.containers.get(`container:${sharedContainer.id}`) === cacheB.containers.get(`container:${sharedContainer.id}`);
  assert.equal(monsterRefShared, true);
  assert.equal(npcRefShared, true);
  assert.equal(containerRefShared, true);
  return { monsterRefShared, npcRefShared, containerRefShared };
}

function proveProjectorFullEnvelopeUsesCapturedRefs(): {
  groundItemsRefShared: boolean;
  inventoryItemRefShared: boolean;
  equipmentItemRefShared: boolean;
  techniqueRefShared: boolean;
  actionRefShared: boolean;
  attrRefShared: boolean;
  inventoryDiffRefShared: boolean;
  equipmentDiffRefShared: boolean;
  techniqueDiffRefShared: boolean;
  actionDiffRefShared: boolean;
} {
  const service = new WorldProjectorService({
    has: () => true,
    getOrThrow: (mapId: string) => ({ name: mapId }),
  } as never, null);
  const groundItem = { itemId: 'ground_item', count: 1 };
  const initial = service.createInitialEnvelope(
    { playerId: 'projector_player', sessionId: 'projector_session' },
    {
      ...createProjectorView(),
      localGroundPiles: [{ sourceId: 'ground_1', x: 2, y: 2, items: [groundItem] }],
    },
    createProjectorPlayer(),
  );
  const state = service as unknown as { cacheByPlayerId: Map<string, any> };
  const initialCache = state.cacheByPlayerId.get('projector_player');
  const groundItemsRefShared = initial.worldDelta.g?.[0]?.items === initialCache.groundPiles.get('ground_1')?.items;

  const fullService = new WorldProjectorService({
    has: () => true,
    getOrThrow: (mapId: string) => ({ name: mapId }),
  } as never, null);
  const item = { itemId: 'full_item', count: 1 };
  const technique = { techId: 'tech_ref', name: '引用功法', level: 1, exp: 0, expToNext: 1, realmLv: 1, realm: 0 };
  const action = { id: 'action_ref', name: '引用行动', cooldownLeft: 0 };
  const player = createProjectorPlayer();
  player.inventory.items = [item];
  player.equipment.slots = [{ slot: 'weapon', item }];
  player.techniques.techniques = [technique];
  player.actions.actions = [action];
  const full = fullService.createDeltaEnvelope(createProjectorView(), player);
  const fullCache = (fullService as unknown as { cacheByPlayerId: Map<string, any> }).cacheByPlayerId.get('projector_player');
  const inventoryItemRefShared = full?.panelDelta?.inv?.slots?.[0]?.item === fullCache.panel.inventory.items[0];
  const equipmentItemRefShared = full?.panelDelta?.eq?.slots?.[0]?.item === fullCache.panel.equipment.slots[0].item;
  const techniqueRefShared = full?.panelDelta?.tech?.techniques?.[0] === fullCache.panel.technique.techniques[0];
  const actionRefShared = full?.panelDelta?.act?.actions?.[0] === fullCache.panel.action.actions[0];
  const attrRefShared = full?.panelDelta?.attr?.baseAttrs === fullCache.panel.attr.baseAttrs;

  const diffService = new WorldProjectorService({
    has: () => true,
    getOrThrow: (mapId: string) => ({ name: mapId }),
  } as never, null);
  const diffPlayer = createProjectorPlayer();
  diffService.createInitialEnvelope({ playerId: 'projector_player', sessionId: 'projector_session' }, createProjectorView(), diffPlayer);
  const diffItem = { itemId: 'diff_item', count: 2 };
  const diffTechnique = { techId: 'tech_diff', name: '差量功法', level: 1, exp: 0, expToNext: 1, realmLv: 1, realm: 0 };
  const diffAction = { id: 'action_diff', name: '差量行动', cooldownLeft: 0 };
  diffPlayer.inventory = { ...diffPlayer.inventory, revision: 2, items: [diffItem] };
  diffPlayer.equipment = { ...diffPlayer.equipment, revision: 2, slots: [{ slot: 'weapon', item: diffItem }] };
  diffPlayer.techniques = { ...diffPlayer.techniques, revision: 2, techniques: [diffTechnique] };
  diffPlayer.actions = { ...diffPlayer.actions, revision: 2, actions: [diffAction] };
  const diff = diffService.createDeltaEnvelope({ ...createProjectorView(), tick: 2 }, diffPlayer);
  const diffCache = (diffService as unknown as { cacheByPlayerId: Map<string, any> }).cacheByPlayerId.get('projector_player');
  const inventoryDiffRefShared = diff?.panelDelta?.inv?.slots?.[0]?.item === diffCache.panel.inventory.items[0];
  const equipmentDiffRefShared = diff?.panelDelta?.eq?.slots?.[0]?.item === diffCache.panel.equipment.slots[0].item;
  const techniqueDiffRefShared = diff?.panelDelta?.tech?.techniques?.[0] === diffCache.panel.technique.techniques[0];
  const actionDiffRefShared = diff?.panelDelta?.act?.actions?.[0] === diffCache.panel.action.actions[0];

  assert.equal(groundItemsRefShared, true);
  assert.equal(inventoryItemRefShared, true);
  assert.equal(equipmentItemRefShared, true);
  assert.equal(techniqueRefShared, true);
  assert.equal(actionRefShared, true);
  assert.equal(attrRefShared, true);
  assert.equal(inventoryDiffRefShared, true);
  assert.equal(equipmentDiffRefShared, true);
  assert.equal(techniqueDiffRefShared, true);
  assert.equal(actionDiffRefShared, true);
  return {
    groundItemsRefShared,
    inventoryItemRefShared,
    equipmentItemRefShared,
    techniqueRefShared,
    actionRefShared,
    attrRefShared,
    inventoryDiffRefShared,
    equipmentDiffRefShared,
    techniqueDiffRefShared,
    actionDiffRefShared,
  };
}

function proveTileProjectionRefsReachPlayerCache(): { sameSnapshotRef: boolean; cacheRefShared: boolean; deltaPatchCount: number; instanceCacheUsed: boolean } {
  // mock instance：tileProjectionByCoord 现在挂在实例对象上，跟随实例 GC 释放。
  const fakeInstance: { tileProjectionByCoord?: Map<string, any> } = {};
  const snapshotService = new WorldSyncMapSnapshotService(
    {
      getInstanceTileState: () => null,
      getInstanceRuntime: () => fakeInstance,
    },
    { getPlayer: () => null },
    { has: () => true, getOrThrow: () => createTileTemplate() },
    { getMapTimeConfig: () => null, getMapTickSpeed: () => 1 },
    {},
    null,
  );
  const staticAuxService = new WorldSyncMapStaticAuxService(
    snapshotService as never,
    {
      buildMinimapMarkers: () => [],
      buildVisibleMinimapMarkers: () => [],
      diffVisibleMinimapMarkers: () => ({ adds: [], removes: [] }),
    } as never,
  );
  const template = createTileTemplate();
  const player = createProjectorPlayer();
  player.attrs.numericStats.viewRange = 1;
  const view = createTileView();
  const first = staticAuxService.buildInitialMapStaticState(view, player, template);
  staticAuxService.commitPlayerCache('tile_player', first.cacheState);
  const second = staticAuxService.buildDeltaMapStaticPlan('tile_player', view, player, template);
  const firstTile = first.visibleTiles.byKey.get('1,1');
  const secondTile = second.visibleTiles.byKey.get('1,1');
  const cachedTile = (staticAuxService as unknown as { cacheByPlayerId: Map<string, any> }).cacheByPlayerId.get('tile_player').visibleTiles.get('1,1');
  const sameSnapshotRef = firstTile === secondTile;
  const cacheRefShared = cachedTile === firstTile;
  // 验证 cache 真的写到了 instance 对象上，而不是 service 自己的 field。
  const instanceCacheUsed = fakeInstance.tileProjectionByCoord instanceof Map
    && fakeInstance.tileProjectionByCoord.size > 0;
  assert.equal(sameSnapshotRef, true);
  assert.equal(cacheRefShared, true);
  assert.equal(second.tilePatches.length, 0);
  assert.equal(instanceCacheUsed, true);
  return { sameSnapshotRef, cacheRefShared, deltaPatchCount: second.tilePatches.length, instanceCacheUsed };
}

function provePanelSliceCacheReusedOnNoopDelta(): { panelRefReused: boolean; deltaIsNull: boolean } {
  const service = new WorldProjectorService({
    has: () => true,
    getOrThrow: (mapId: string) => ({ name: mapId }),
  } as never, null);
  const view = createProjectorView();
  const player = createProjectorPlayer();
  service.createInitialEnvelope({ playerId: 'projector_player', sessionId: 'projector_session' }, view, player);
  const state = service as unknown as { cacheByPlayerId: Map<string, any> };
  const before = state.cacheByPlayerId.get('projector_player')?.panel;
  const delta = service.createDeltaEnvelope({ ...view, tick: 2 }, player);
  const after = state.cacheByPlayerId.get('projector_player')?.panel;
  const panelRefReused = before === after;
  assert.equal(delta, null);
  assert.equal(panelRefReused, true);
  return { panelRefReused, deltaIsNull: delta === null };
}

function proveCombatEffectRefsPassThroughEventBus(): { queuedRefShared: boolean; drainedRefShared: boolean } {
  const service = new RuntimeEventBusService();
  const effect = { type: 'float', x: 1, y: 1, text: 'ref' } as const;
  service.queueCombatEffect('combat_ref_instance', effect);
  const queued = service.getCombatEffects('combat_ref_instance');
  const queuedRefShared = queued[0] === effect;
  const drained = service.drainInstance('combat_ref_instance');
  const drainedRefShared = drained?.combatEffects?.[0] === effect;
  assert.equal(queuedRefShared, true);
  assert.equal(drainedRefShared, true);
  return { queuedRefShared, drainedRefShared };
}

function provePersistenceDirtyDomainProjectionPresent(): { dirtyDomainsForwarded: boolean; snapshotUsesDomainGate: boolean } {
  const flushSource = readFileSync(resolve(process.cwd(), 'packages/server/src/persistence/player-persistence-flush.service.ts'), 'utf8');
  const runtimeSource = readFileSync(resolve(process.cwd(), 'packages/server/src/runtime/player/player-runtime.service.ts'), 'utf8');
  const dirtyDomainsForwarded = flushSource.includes('buildPersistenceSnapshot(playerId, dirtyDomains)');
  const snapshotUsesDomainGate = runtimeSource.includes('function buildRuntimePlayerPersistenceSnapshot(player, mapTemplateRepository = null, dirtyDomains = null)')
    && runtimeSource.includes('const needsDomain = (...domains)')
    && runtimeSource.includes("inventory: needsDomain('inventory')")
    && runtimeSource.includes("runtimeBonuses: needsDomain('attr')");
  assert.equal(dirtyDomainsForwarded, true);
  assert.equal(snapshotUsesDomainGate, true);
  return { dirtyDomainsForwarded, snapshotUsesDomainGate };
}

function createProjectorView(): any {
  return {
    playerId: 'projector_player',
    tick: 1,
    worldRevision: 1,
    selfRevision: 1,
    instance: {
      instanceId: 'public:projector',
      templateId: 'yunlai_town',
      name: '云来镇',
      kind: 'public',
      width: 16,
      height: 16,
    },
    self: { x: 1, y: 1, name: '测试', displayName: '测试', buffs: [] },
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

function createProjectorViewWithEntries(playerId: string, localMonsters: any[], localNpcs: any[], localContainers: any[]): any {
  return {
    ...createProjectorView(),
    playerId,
    self: { x: 1, y: 1, name: playerId, displayName: playerId, buffs: [] },
    localMonsters,
    localNpcs,
    localContainers,
  };
}

function createProjectorPlayerWithId(playerId: string): any {
  return {
    ...createProjectorPlayer(),
    playerId,
  };
}

function createTileView(): any {
  return {
    playerId: 'tile_player',
    tick: 1,
    worldRevision: 1,
    selfRevision: 1,
    instance: {
      instanceId: 'public:tile',
      templateId: 'tile_template',
      name: 'tile',
      kind: 'public',
      width: 3,
      height: 3,
    },
    self: { x: 1, y: 1, name: 'tile', displayName: 'tile', buffs: [] },
    visibleTileKeys: ['0,0', '1,0', '2,0', '0,1', '1,1', '2,1', '0,2', '1,2', '2,2'],
    visibleTileIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  };
}

function createTileTemplate(): any {
  return {
    id: 'tile_template',
    name: 'tile',
    width: 3,
    height: 3,
    source: {},
    terrainRows: [
      ['grass', 'grass', 'grass'],
      ['grass', 'grass', 'grass'],
      ['grass', 'grass', 'grass'],
    ],
    surfaceRows: [
      [null, null, null],
      [null, null, null],
      [null, null, null],
    ],
    structureRows: [
      [null, null, null],
      [null, null, null],
      [null, null, null],
    ],
    interactableRows: [
      [[], [], []],
      [[], [], []],
      [[], [], []],
    ],
  };
}

function createProjectorPlayer(): any {
  const attrs = createAttributes();
  return {
    playerId: 'projector_player',
    instanceId: 'public:projector',
    templateId: 'yunlai_town',
    x: 1,
    y: 1,
    facing: 'south',
    hp: 10,
    maxHp: 10,
    qi: 5,
    maxQi: 5,
    selfRevision: 1,
    wallet: { balances: [] },
    inventory: { revision: 1, capacity: 20, items: [] },
    equipment: { revision: 1, slots: [] },
    techniques: { revision: 1, techniques: [], cultivatingTechId: null },
    bodyTraining: null,
    attrs: {
      revision: 1,
      stage: '炼气',
      baseAttrs: attrs,
      finalAttrs: attrs,
      numericStats: createNumericStats(),
      ratioDivisors: createRatioDivisors(),
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
    bonuses: [
      {
        source: 'runtime:realm_state',
        label: '境界',
        attrs: { constitution: 1 },
        attrMode: 'flat',
        stats: { maxHp: 1 },
      },
    ],
    foundation: 1,
    rootFoundation: 1,
    combatExp: 0,
    comprehension: 0,
    luck: 0,
    fengShuiLuck: 0,
    boneAgeBaseYears: 18,
    lifeElapsedTicks: 0,
    lifespanYears: 80,
    realm: { realmLv: 1, progress: 0, progressToNext: 100, breakthroughReady: false },
    alchemySkill: null,
    forgingSkill: null,
    buildingSkill: null,
    gatherSkill: null,
    enhancementSkill: null,
    miningSkill: null,
  };
}

function createAttributes(): Record<string, number> {
  return { constitution: 1, spirit: 1, perception: 1, talent: 1, strength: 1, meridians: 1 };
}

function createRatioDivisors(): Record<string, unknown> {
  return {
    dodge: 100,
    crit: 100,
    breakPower: 100,
    resolvePower: 100,
    cooldownSpeed: 100,
    moveSpeed: 100,
    elementDamageReduce: { metal: 100, wood: 100, water: 100, fire: 100, earth: 100 },
  };
}

function createNumericStats(): Record<string, unknown> {
  return {
    maxHp: 10,
    maxQi: 5,
    physAtk: 1,
    spellAtk: 1,
    physDef: 1,
    spellDef: 1,
    hit: 1,
    dodge: 1,
    crit: 0,
    antiCrit: 0,
    critDamage: 0,
    breakPower: 0,
    resolvePower: 0,
    maxQiOutputPerTick: 1,
    qiRegenRate: 0,
    hpRegenRate: 0,
    cooldownSpeed: 0,
    auraCostReduce: 0,
    auraPowerRate: 0,
    playerExpRate: 0,
    techniqueExpRate: 0,
    realmExpPerTick: 0,
    techniqueExpPerTick: 0,
    lootRate: 0,
    rareLootRate: 0,
    viewRange: 8,
    moveSpeed: 1,
    extraAggroRate: 0,
    extraRange: 0,
    extraArea: 0,
    actionsPerTurn: 1,
    elementDamageBonus: { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 },
    elementDamageReduce: { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 },
  };
}

function proveViewHotpathOptimizationsPresent(): {
  playerViewCache: boolean;
  localMonsterEntryCache: boolean;
  overlayAvoidsConcatMap: boolean;
  projectorSkipsUnchangedPanelCapture: boolean;
  projectorCachesAttrBonusClones: boolean;
  contentTemplateAvoidsDuplicateMonsterClone: boolean;
  playerViewCacheHitReusesViewRef: boolean;
} {
  const mapInstanceSource = readFileSync(resolve(process.cwd(), 'packages/server/src/runtime/instance/map-instance.runtime.ts'), 'utf8');
  const viewQuerySource = readFileSync(resolve(process.cwd(), 'packages/server/src/runtime/world/query/world-runtime-player-view-query.service.ts'), 'utf8');
  const projectorSource = readFileSync(resolve(process.cwd(), 'packages/server/src/network/world-projector.service.ts'), 'utf8');
  const projectorHelperSource = readFileSync(resolve(process.cwd(), 'packages/server/src/network/world-projector.helpers.ts'), 'utf8');
  const contentTemplateSource = readFileSync(resolve(process.cwd(), 'packages/server/src/content/content-template.repository.ts'), 'utf8');
  const playerViewCache = mapInstanceSource.includes('playerViewCacheByPlayerId')
    && mapInstanceSource.includes('cached.worldRevision === this.worldRevision')
    && mapInstanceSource.includes('this.playerViewCacheByPlayerId.delete(playerId)');
  const localMonsterEntryCache = mapInstanceSource.includes('localMonsterViewCacheByRuntimeId')
    && mapInstanceSource.includes('getLocalMonsterViewEntry(monster)')
    && mapInstanceSource.includes('this.localMonsterViewCacheByRuntimeId.delete(runtimeId)');
  const overlayAvoidsConcatMap = viewQuerySource.includes('appendProjectedParentEntries')
    && !viewQuerySource.includes('.concat(\n            parentInstance.collectLocalMonsters')
    && !viewQuerySource.includes('.map(project)');
  const projectorSkipsUnchangedPanelCapture = projectorSource.includes('const playerChanged = Boolean(selfDelta || panelDelta)')
    && projectorSource.includes('const panelUpdate = buildPanelUpdate(previous, player)')
    && projectorSource.includes('panel: panelUpdate.panel');
  const projectorCachesAttrBonusClones = projectorHelperSource.includes('const attrBonusCloneCache = new WeakMap<AttrBonus[], AttrBonus[]>')
    && projectorHelperSource.includes('attrBonusCloneCache.get(source)')
    && projectorHelperSource.includes('attrBonusCloneCache.set(source, cloned)');
  const contentTemplateAvoidsDuplicateMonsterClone = contentTemplateSource.includes('baseAttrs: resolvedStats.attrs')
    && contentTemplateSource.includes('statFormula: template.statFormula')
    && contentTemplateSource.includes('skills: template.skills')
    && !contentTemplateSource.includes('baseAttrs: cloneMonsterAttributes(resolvedStats.attrs)');
  // P0-8：cache hit 路径不应再 spread cached.view，而是直接复用引用并就地刷新 tick/session/worldRevision/selfRevision。
  const playerViewCacheHitReusesViewRef = mapInstanceSource.includes('const view = cached.view;')
    && mapInstanceSource.includes('view.sessionId = player.sessionId;')
    && mapInstanceSource.includes('view.tick = this.tick;')
    && mapInstanceSource.includes('view.worldRevision = this.worldRevision;')
    && mapInstanceSource.includes('view.selfRevision = player.selfRevision;')
    && !mapInstanceSource.includes('...cached.view,');
  assert.equal(playerViewCache, true);
  assert.equal(localMonsterEntryCache, true);
  assert.equal(overlayAvoidsConcatMap, true);
  assert.equal(projectorSkipsUnchangedPanelCapture, true);
  assert.equal(projectorCachesAttrBonusClones, true);
  assert.equal(contentTemplateAvoidsDuplicateMonsterClone, true);
  assert.equal(playerViewCacheHitReusesViewRef, true);
  return {
    playerViewCache,
    localMonsterEntryCache,
    overlayAvoidsConcatMap,
    projectorSkipsUnchangedPanelCapture,
    projectorCachesAttrBonusClones,
    contentTemplateAvoidsDuplicateMonsterClone,
    playerViewCacheHitReusesViewRef,
  };
}

function proveEntryCachesFollowLifecycle(): {
  tileProjectionOnInstance: boolean;
  npcQuestMarkerCacheOnPlayer: boolean;
  removePlayerClearsLocalPlayerView: boolean;
  buildingDeconstructClearsCache: boolean;
  groundPilePickupClearsCache: boolean;
  hydrateGroundPilesClearsCache: boolean;
} {
  const mapInstanceSource = readFileSync(resolve(process.cwd(), 'packages/server/src/runtime/instance/map-instance.runtime.ts'), 'utf8');
  const mapSnapshotSource = readFileSync(resolve(process.cwd(), 'packages/server/src/network/world-sync-map-snapshot.service.ts'), 'utf8');
  const playerViewQuerySource = readFileSync(resolve(process.cwd(), 'packages/server/src/runtime/world/query/world-runtime-player-view-query.service.ts'), 'utf8');
  const playerRuntimeSource = readFileSync(resolve(process.cwd(), 'packages/server/src/runtime/player/player-runtime.service.ts'), 'utf8');

  // tileProjectionByCoord 必须挂在 MapInstanceRuntime 上，且 service 内不再持有 service-level 字段。
  const tileProjectionOnInstance = mapInstanceSource.includes('tileProjectionByCoord = new Map()')
    && mapSnapshotSource.includes('instance.tileProjectionByCoord = projectionByCoord')
    && !mapSnapshotSource.includes('private readonly tileProjectionByCoord = new Map');

  // npcQuestMarkerCache 必须挂在 player runtime 对象上，且 service 内不再持有 service-level 字段。
  const npcQuestMarkerCacheOnPlayer = playerRuntimeSource.includes('npcQuestMarkerCache: new Map()')
    && playerViewQuerySource.includes('player.npcQuestMarkerCache = playerCache')
    && !playerViewQuerySource.includes('npcQuestMarkerViewCacheByPlayerId = new Map()');

  // removePlayer 必须清理 localPlayerViewCacheByPlayerId。
  const removePlayerClearsLocalPlayerView = mapInstanceSource.includes('this.localPlayerViewCacheByPlayerId.delete(playerId)');

  // building deconstruct 必须清理 localBuildingViewCacheById。
  const buildingDeconstructClearsCache = mapInstanceSource.includes('this.localBuildingViewCacheById.delete(buildingId)');

  // groundPile 拾取空必须清理 localGroundPileViewCacheBySourceId。
  const groundPilePickupClearsCache = mapInstanceSource.includes('this.localGroundPileViewCacheBySourceId.delete(buildGroundSourceId(tileIndex))');

  // hydrateGroundPiles 重置时也要清理 view cache。
  const hydrateGroundPilesClearsCache = mapInstanceSource.includes('this.localGroundPileViewCacheBySourceId.clear()');

  assert.equal(tileProjectionOnInstance, true);
  assert.equal(npcQuestMarkerCacheOnPlayer, true);
  assert.equal(removePlayerClearsLocalPlayerView, true);
  assert.equal(buildingDeconstructClearsCache, true);
  assert.equal(groundPilePickupClearsCache, true);
  assert.equal(hydrateGroundPilesClearsCache, true);
  return {
    tileProjectionOnInstance,
    npcQuestMarkerCacheOnPlayer,
    removePlayerClearsLocalPlayerView,
    buildingDeconstructClearsCache,
    groundPilePickupClearsCache,
    hydrateGroundPilesClearsCache,
  };
}

async function proveSuggestionTextBounds(): Promise<{ titleLength: number; descriptionLength: number; replyLength: number }> {
  let persisted: unknown = null;
  const service = new SuggestionRuntimeService({
    loadSuggestions: async () => null,
    saveSuggestions: async (document: unknown) => {
      persisted = document;
    },
  });
  const suggestion = await service.create('suggestion_player', 'suggestion_author'.repeat(10), '题'.repeat(80), '描'.repeat(700));
  assert.ok(suggestion);
  assert.equal(suggestion.title.length, 50);
  assert.equal(suggestion.description.length, 500);
  const reply = await service.addReply(suggestion.id, 'gm', 'gm', 'developer'.repeat(10), '回'.repeat(700));
  assert.ok(reply);
  const replyLength = reply.replies[0]?.content.length ?? 0;
  assert.equal(replyLength, 500);
  assert.ok(persisted);
  return { titleLength: suggestion.title.length, descriptionLength: suggestion.description.length, replyLength };
}

function proveGmWorldObserverIdsRemoved(): { retainedObserverField: boolean } {
  const source = readFileSync(resolve(process.cwd(), 'packages/server/src/http/native/native-gm-world.service.ts'), 'utf8');
  const retainedObserverField = source.includes('worldObserverIds');
  assert.equal(retainedObserverField, false);
  return { retainedObserverField };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

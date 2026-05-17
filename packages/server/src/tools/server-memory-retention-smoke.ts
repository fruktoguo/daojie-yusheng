import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ContentTemplateRepository } from '../content/content-template.repository';
import { NativeAuthRateLimitService } from '../http/native/native-auth-rate-limit.service';
import { hydratePersistedEquipmentItem, hydratePersistedInventoryItem } from '../persistence/inventory-item-persistence';
import { WorldProjectorService } from '../network/world-projector.service';
import { WorldSyncAuxStateService } from '../network/world-sync-aux-state.service';
import { WorldSyncEnvelopeService } from '../network/world-sync-envelope.service';
import { WorldSyncMapSnapshotService } from '../network/world-sync-map-snapshot.service';
import { WorldSyncMapStaticAuxService } from '../network/world-sync-map-static-aux.service';
import { WorldSyncMinimapService } from '../network/world-sync-minimap.service';
import { WorldSyncPlayerStateService } from '../network/world-sync-player-state.service';
import { toPlayerSnapshotFromMigrationRow } from '../network/world-player-source.service';
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
  const itemTemplatePrototypeProof = proveItemInstancesUseTemplatePrototype();
  const eventBusProof = proveEventBusReleasesQueues();
  const playerCountersProof = provePlayerCountersSkipGmBots();
  const projectorProof = proveProjectorKeepsCacheOnNoopDelta();
  const instanceProjectionProof = proveProjectorSharesStableInstanceEntryRefs();
  const projectorFullEnvelopeRefProof = proveProjectorFullEnvelopeAvoidsPanelCache();
  const bootstrapPlayerStateRefProof = proveBootstrapPlayerStateDoesNotDependOnProjectorPanelCache();
  const auxStateRefProof = proveAuxStateReusesStableProjectionRefs();
  const minimapAuxRefProof = proveMinimapAuxReusesStaticMarkerRefs();
  const tileProjectionProof = proveTileProjectionRefsReachPlayerCache();
  const renderEntityRefProof = proveRenderEntitiesReuseStableRefs();
  const envelopeContainerRespawnProof = proveEnvelopeContainerRespawnAvoidsNoopArrayClone();
  const envelopeThreatHotpathProof = proveEnvelopeThreatHotpathOptimizationsPresent();
  const playerSourceMigrationRefProof = provePlayerSourceMigrationRefsReused();
  const mapStaticAuxTilePatchProof = proveMapStaticAuxTilePatchResourceCachePresent();
  const panelSliceRefProof = provePanelCursorCacheReusedOnNoopDelta();
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
    itemTemplatePrototypeProof,
    eventBusProof,
    playerCountersProof,
    projectorProof,
    instanceProjectionProof,
    projectorFullEnvelopeRefProof,
    bootstrapPlayerStateRefProof,
    auxStateRefProof,
    minimapAuxRefProof,
    tileProjectionProof,
    renderEntityRefProof,
    envelopeContainerRespawnProof,
    envelopeThreatHotpathProof,
    playerSourceMigrationRefProof,
    mapStaticAuxTilePatchProof,
    panelSliceRefProof,
    combatEffectRefProof,
    persistenceDirtyDomainProjectionProof,
    viewHotpathProof,
    cacheLifecycleProof,
    suggestionProof,
    gmObserverProof,
    answers:
      '已证明本轮新增的内存保留边界：邮箱缓存 LRU 有上限且加载失败释放 pending；兑换频率表会按 TTL 清理；恢复队列同 key 覆盖且有最大排队；Outbox 本地去重有环形上限；认证限流桶会清理过期项；flush wakeup key 有上限；物品实例通过模板 prototype 读取静态字段，own/JSON 只保留实例字段；EventBus drain/flush 后释放玩家和实例队列；PlayerCounters 不缓存/落库 GM bot；Projector 无变化 delta 不替换缓存，玩家 panel 只常驻 revision/signature cursor，不再常驻完整 panel clone；多玩家共享同一稳定实例条目的 projector 投影 ref；Projector 全量 envelope 和面板变更包只生成一次性 panel delta，不写回完整 panel cache；Bootstrap 玩家状态直接从玩家真源构造，不依赖 projector panel cache；Aux 状态复用稳定 time/realm/loot/minimap marker 引用；Projector runtime bonus 克隆按源数组复用；tile projection ref 会进入玩家 map static cache，稳定视野下 visible tile matrix/byKey 也会复用；render entity 对 NPC/容器/阵法/怪物 buffs 复用稳定投影且玩家投影坐标不再二次 spread；container respawn 投影无变化时复用原 view/localContainers；projector/envelope/threat 小热路径已移除 identity 全量 map、buff scale 临时数组、eventBus worldDelta spread 与 threat arrow clone；迁移快照的 technique skills/layer attrs/quest rewards 复用只读子对象引用；map static aux tile patch 复用按源 resources 数组缓存的 compact resource；panel cursor 在 noop delta 下复用缓存；combat effect 以只读 ref 透传；持久化 flush 已把 dirtyDomains 下传到运行态快照并按域裁剪大子树克隆；玩家视野、妖兽视野条目与 overlay 热路径优化已落在生产源码；地面物品 flush 和静态地图对象不再复制模板外壳；妖兽 spawn 基础属性和 ratioDivisors 复用模板/已解析引用；妖兽公式重算只浅层覆盖 level/tier，不再递归深拷 raw；静态 snapshot 视图复用源引用，地面物品 snapshot 不再 spread item；妖兽 snapshot 不再深拷属性、buff、冷却和伤害贡献子结构；building/room 查询列表复用运行态引用；room/fengShui hydrate 补 instanceId 时不再复制整条对象；妖兽运行态 hydrate 和落盘投影复用 payload 子结构引用；地面物品 DB hydrate 直接接管 payload 引用并仅就地规范化 itemId/count；玩家临时 Buff clone 以 prototype 承载静态/加成字段，持久化和出网显式 materialize；fallback 通知 drain 直接摘走队列引用并重置为空队列；建议文本服务端限长；GM world 不再保留 observer id。',
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

function proveItemInstancesUseTemplatePrototype(): {
  createItemOwnKeysMinimal: boolean;
  createItemReadsTemplateFields: boolean;
  normalizeItemOwnKeysMinimal: boolean;
  hydrateInventoryOwnKeysMinimal: boolean;
  hydrateEquipmentOwnKeysMinimal: boolean;
  jsonPayloadOmitsTemplateFields: boolean;
} {
  const repository = new ContentTemplateRepository();
  const template = {
    itemId: 'item:memory-proof',
    name: 'Memory Proof Item',
    type: 'equipment',
    desc: 'template fields stay on prototype',
    equipSlot: 'weapon',
    equipAttrs: { strength: 1 },
    effects: [{ type: 'progress_boost', target: 'alchemy', rate: 1 }],
  };
  (repository as any).itemTemplates.set(template.itemId, template);

  const created = repository.createItem(template.itemId, 2) as any;
  const normalized = repository.normalizeItem({
    itemId: template.itemId,
    count: 3,
    enhanceLevel: 2,
  }) as any;
  const hydratedInventory = hydratePersistedInventoryItem({
    itemId: template.itemId,
    count: 4,
    rawPayload: { enhanceLevel: 2 },
  }, repository as any) as any;
  const hydratedEquipment = hydratePersistedEquipmentItem({
    itemId: template.itemId,
    slot: 'weapon',
    rawPayload: { enhanceLevel: 2 },
  }, repository as any) as any;
  const createItemOwnKeysMinimal = JSON.stringify(Object.keys(created).sort()) === JSON.stringify(['count', 'itemId']);
  const createItemReadsTemplateFields = created.name === template.name
    && created.type === template.type
    && created.equipAttrs === template.equipAttrs;
  const normalizeItemOwnKeysMinimal = JSON.stringify(Object.keys(normalized).sort()) === JSON.stringify(['count', 'enhanceLevel', 'itemId']);
  const hydrateInventoryOwnKeysMinimal = JSON.stringify(Object.keys(hydratedInventory).sort()) === JSON.stringify(['count', 'enhanceLevel', 'itemId']);
  const hydrateEquipmentOwnKeysMinimal = JSON.stringify(Object.keys(hydratedEquipment).sort()) === JSON.stringify(['count', 'enhanceLevel', 'equipSlot', 'itemId']);
  const jsonPayload = JSON.parse(JSON.stringify(normalized));
  const jsonPayloadOmitsTemplateFields = jsonPayload.itemId === template.itemId
    && jsonPayload.count === 3
    && jsonPayload.enhanceLevel === 2
    && jsonPayload.name === undefined
    && jsonPayload.equipAttrs === undefined;

  assert.equal(createItemOwnKeysMinimal, true);
  assert.equal(createItemReadsTemplateFields, true);
  assert.equal(normalizeItemOwnKeysMinimal, true);
  assert.equal(hydrateInventoryOwnKeysMinimal, true);
  assert.equal(hydrateEquipmentOwnKeysMinimal, true);
  assert.equal(jsonPayloadOmitsTemplateFields, true);
  return {
    createItemOwnKeysMinimal,
    createItemReadsTemplateFields,
    normalizeItemOwnKeysMinimal,
    hydrateInventoryOwnKeysMinimal,
    hydrateEquipmentOwnKeysMinimal,
    jsonPayloadOmitsTemplateFields,
  };
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

function proveProjectorFullEnvelopeAvoidsPanelCache(): {
  groundItemsRefShared: boolean;
  fullCacheHasNoPanel: boolean;
  fullCacheHasPanelCursor: boolean;
  diffCacheHasNoPanel: boolean;
  diffCacheHasPanelCursor: boolean;
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
  assert.ok(full?.panelDelta?.inv?.slots?.[0]?.item);
  assert.ok(full?.panelDelta?.eq?.slots?.[0]?.item);
  assert.ok(full?.panelDelta?.tech?.techniques?.[0]);
  assert.ok(full?.panelDelta?.act?.actions?.[0]);
  const fullCacheHasNoPanel = fullCache.panel === undefined;
  const fullCacheHasPanelCursor = typeof fullCache.panelCursor?.inventoryRevision === 'number'
    && typeof fullCache.panelCursor?.attrSignature === 'string';

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
  assert.equal(diff?.panelDelta?.inv?.full, 1);
  assert.equal(diff?.panelDelta?.eq?.full, 1);
  assert.equal(diff?.panelDelta?.tech?.full, 1);
  assert.equal(diff?.panelDelta?.act?.full, 1);
  const diffCacheHasNoPanel = diffCache.panel === undefined;
  const diffCacheHasPanelCursor = diffCache.panelCursor?.inventoryRevision === 2
    && diffCache.panelCursor?.equipmentRevision === 2
    && diffCache.panelCursor?.techniqueRevision === 2
    && diffCache.panelCursor?.actionRevision === 2;

  assert.equal(groundItemsRefShared, true);
  assert.equal(fullCacheHasNoPanel, true);
  assert.equal(fullCacheHasPanelCursor, true);
  assert.equal(diffCacheHasNoPanel, true);
  assert.equal(diffCacheHasPanelCursor, true);
  return {
    groundItemsRefShared,
    fullCacheHasNoPanel,
    fullCacheHasPanelCursor,
    diffCacheHasNoPanel,
    diffCacheHasPanelCursor,
  };
}

function proveBootstrapPlayerStateDoesNotDependOnProjectorPanelCache(): {
  cacheHasNoPanel: boolean;
  baseAttrsBuilt: boolean;
  temporaryBuffsBuilt: boolean;
  autoUsePillsBuilt: boolean;
  autoBattleSkillsCloneReused: boolean;
} {
  const projector = new WorldProjectorService({
    has: () => true,
    getOrThrow: (mapId: string) => ({ name: mapId }),
  } as never, null);
  const player = createProjectorPlayer();
  player.name = '缓存修士';
  player.displayName = '缓存修士';
  player.quests = { quests: [] };
  player.realm = { ...player.realm, breakthroughItems: [], breakthrough: null, heavenGate: null };
  player.heavenGate = null;
  player.spiritualRoots = null;
  player.combat.autoUsePills = [{
    itemId: 'pill_ref',
    enabled: true,
    threshold: 50,
    conditions: [{ type: 'hp_ratio', op: '<=', value: 50 }],
  }];
  player.combat.autoBattleSkills = [{ skillId: 'skill_ref', enabled: true, skillEnabled: true, order: 1 }];
  projector.createInitialEnvelope({ playerId: player.playerId, sessionId: 'projector_session' }, createProjectorView(), player);
  const state = (projector as unknown as { cacheByPlayerId: Map<string, any> }).cacheByPlayerId.get(player.playerId);
  const playerStateService = new WorldSyncPlayerStateService();
  const bootstrap = playerStateService.buildPlayerSyncState(player, createProjectorView(), ['yunlai_town']);
  const secondBootstrap = playerStateService.buildPlayerSyncState(player, createProjectorView(), ['yunlai_town']);
  const cacheHasNoPanel = state.panel === undefined && state.panelCursor?.inventoryRevision === player.inventory.revision;
  const baseAttrsBuilt = bootstrap.baseAttrs?.constitution === player.attrs.baseAttrs.constitution;
  const temporaryBuffsBuilt = Array.isArray(bootstrap.temporaryBuffs);
  const autoUsePillsBuilt = bootstrap.autoUsePills?.[0]?.itemId === 'pill_ref';
  const autoBattleSkillsCloneReused = bootstrap.autoBattleSkills === secondBootstrap.autoBattleSkills;

  assert.equal(cacheHasNoPanel, true);
  assert.equal(baseAttrsBuilt, true);
  assert.equal(temporaryBuffsBuilt, true);
  assert.equal(autoUsePillsBuilt, true);
  assert.equal(autoBattleSkillsCloneReused, true);
  return { cacheHasNoPanel, baseAttrsBuilt, temporaryBuffsBuilt, autoUsePillsBuilt, autoBattleSkillsCloneReused };
}

function proveAuxStateReusesStableProjectionRefs(): {
  bootstrapTimeRefShared: boolean;
  initialRealmRefShared: boolean;
  stableTimeCacheRefReused: boolean;
  stableRealmCacheRefReused: boolean;
  stableLootCacheRefReused: boolean;
  stableLootSourceRefStored: boolean;
} {
  const log: any[] = [];
  const player = createAuxPlayer();
  const lootWindow = { tileX: 1, tileY: 1, title: '稳定拾取', sources: [] };
  const service = new WorldSyncAuxStateService(
    {
      getOrThrow: (mapId: string) => ({
        id: mapId,
        width: 4,
        height: 4,
      }),
    } as never,
    {
      buildMinimapLibrarySync: () => [],
      buildGameTimeState: (_template: any, view: any) => ({
        totalTicks: view.tick,
        localTicks: view.tick,
        dayLength: 120,
        timeScale: 1,
        phase: 'day',
        phaseLabel: '白昼',
        darknessStacks: 0,
        visionMultiplier: 1,
        lightPercent: 100,
        effectiveViewRange: 2,
        tint: null,
        overlayAlpha: 0,
      }),
      buildMapTickIntervalMs: () => 1000,
      buildMapMetaSync: (template: any) => ({ id: template.id }),
    } as never,
    {
      buildInitialMapStaticState: () => ({
        visibleTiles: { matrix: [[]], byKey: new Map() },
        visibleMinimapMarkers: [],
        cacheState: { marker: 'initial' },
      }),
      buildDeltaMapStaticPlan: () => ({
        mapChanged: false,
        visibleTiles: { matrix: [[]], byKey: new Map() },
        visibleMinimapMarkers: [],
        tilePatches: [],
        visibleMinimapMarkerAdds: [],
        visibleMinimapMarkerRemoves: [],
        cacheState: { marker: 'delta' },
      }),
      commitPlayerCache: () => undefined,
      clearPlayerCache: () => undefined,
    } as never,
    { buildMinimapSnapshotSync: () => ({ markers: [] }) } as never,
    {
      sendBootstrap: (_socket: any, payload: any) => log.push(['bootstrapTime', payload.time]),
      sendMapStatic: () => undefined,
      sendWorldDelta: (_socket: any, payload: any) => log.push(['deltaTime', payload.time]),
      sendRealm: (_socket: any, payload: any) => log.push(['realm', payload.realm]),
      sendLootWindow: () => undefined,
    } as never,
    { buildLootWindowSyncState: () => lootWindow } as never,
    {
      buildThreatArrows: () => [],
      emitInitialThreatSync: () => undefined,
      emitDeltaThreatSync: (_socket: any, _view: any, previous: any) => previous,
    } as never,
    {
      buildPlayerSyncState: (_player: any, _view: any, unlockedMinimapIds: string[]) => ({ unlockedMinimapIds }),
    } as never,
  );
  service.emitAuxInitialSync('aux_player', { emit: () => undefined }, createAuxView(10), player as never);
  const cache = service as unknown as { protocolAuxStateByPlayerId: Map<string, any> };
  const first = cache.protocolAuxStateByPlayerId.get('aux_player');
  service.emitAuxDeltaSync('aux_player', { emit: () => undefined }, createAuxView(11), player as never);
  const second = cache.protocolAuxStateByPlayerId.get('aux_player');
  const bootstrapTimeRefShared = log.find((entry) => entry[0] === 'bootstrapTime')?.[1] === first.time.time;
  const initialRealmRefShared = log.find((entry) => entry[0] === 'realm')?.[1] === first.realm;
  const stableTimeCacheRefReused = second.time === first.time;
  const stableRealmCacheRefReused = second.realm === first.realm;
  const stableLootCacheRefReused = second.lootWindow === first.lootWindow;
  const stableLootSourceRefStored = second.lootWindowSource === lootWindow;

  assert.equal(bootstrapTimeRefShared, true);
  assert.equal(initialRealmRefShared, true);
  assert.equal(stableTimeCacheRefReused, true);
  assert.equal(stableRealmCacheRefReused, true);
  assert.equal(stableLootCacheRefReused, true);
  assert.equal(stableLootSourceRefStored, true);
  return {
    bootstrapTimeRefShared,
    initialRealmRefShared,
    stableTimeCacheRefReused,
    stableRealmCacheRefReused,
    stableLootCacheRefReused,
    stableLootSourceRefStored,
  };
}

function proveMinimapAuxReusesStaticMarkerRefs(): {
  visibleMarkerRefShared: boolean;
  diffAddRefShared: boolean;
  mapStaticUsesVisibleTileByKey: boolean;
  cacheMarkerRefShared: boolean;
} {
  const marker = { id: 'marker.ref', kind: 'npc', x: 1, y: 1, label: '静态点', detail: 'ref' };
  const minimapService = new WorldSyncMinimapService();
  const visible = minimapService.buildVisibleMinimapMarkers([marker], new Map([['1,1', { type: 'floor' }]]));
  const diff = minimapService.diffVisibleMinimapMarkers([], visible);
  let buildVisibleTileKeySetCalls = 0;
  let receivedVisibleTiles: any = null;
  const visibleTiles = {
    matrix: [[{ type: 'floor' }]],
    byKey: new Map([['1,1', { type: 'floor' }]]),
  };
  const staticAuxService = new WorldSyncMapStaticAuxService(
    {
      buildVisibleTilesSnapshot: () => visibleTiles,
      buildVisibleTileKeySet: () => {
        buildVisibleTileKeySetCalls += 1;
        return new Set();
      },
    } as never,
    {
      buildMinimapMarkers: () => [marker],
      buildVisibleMinimapMarkers: (_markers: any, visibleTileKeys: any) => {
        receivedVisibleTiles = visibleTileKeys;
        return visible;
      },
      diffVisibleMinimapMarkers: () => ({ adds: diff.adds, removes: [] }),
    } as never,
  );
  const plan = staticAuxService.buildDeltaMapStaticPlan('minimap_aux_player', createAuxView(1), createAuxPlayer(), { id: 'map.a' });
  const visibleMarkerRefShared = visible[0] === marker;
  const diffAddRefShared = diff.adds[0] === marker;
  const mapStaticUsesVisibleTileByKey = buildVisibleTileKeySetCalls === 0 && receivedVisibleTiles === visibleTiles.byKey;
  const cacheMarkerRefShared = plan.cacheState.visibleMinimapMarkers[0] === marker;

  assert.equal(visibleMarkerRefShared, true);
  assert.equal(diffAddRefShared, true);
  assert.equal(mapStaticUsesVisibleTileByKey, true);
  assert.equal(cacheMarkerRefShared, true);
  return { visibleMarkerRefShared, diffAddRefShared, mapStaticUsesVisibleTileByKey, cacheMarkerRefShared };
}

function proveTileProjectionRefsReachPlayerCache(): {
  sameSnapshotRef: boolean;
  matrixRefReused: boolean;
  byKeyRefReused: boolean;
  cacheRefShared: boolean;
  deltaPatchCount: number;
  instanceCacheUsed: boolean;
} {
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
  const matrixRefReused = first.visibleTiles.matrix === second.visibleTiles.matrix;
  const byKeyRefReused = first.visibleTiles.byKey === second.visibleTiles.byKey;
  const cacheRefShared = cachedTile === firstTile;
  // 验证 cache 真的写到了 instance 对象上，而不是 service 自己的 field。
  const instanceCacheUsed = fakeInstance.tileProjectionByCoord instanceof Map
    && fakeInstance.tileProjectionByCoord.size > 0;
  assert.equal(sameSnapshotRef, true);
  assert.equal(matrixRefReused, true);
  assert.equal(byKeyRefReused, true);
  assert.equal(cacheRefShared, true);
  assert.equal(second.tilePatches.length, 0);
  assert.equal(instanceCacheUsed, true);
  return {
    sameSnapshotRef,
    matrixRefReused,
    byKeyRefReused,
    cacheRefShared,
    deltaPatchCount: second.tilePatches.length,
    instanceCacheUsed,
  };
}

function proveRenderEntitiesReuseStableRefs(): {
  npcRefShared: boolean;
  containerRefShared: boolean;
  formationRefShared: boolean;
  monsterBuffsRefShared: boolean;
  projectedPlayerPositionApplied: boolean;
  playerProjectionAvoidsSpread: boolean;
} {
  const player = createProjectorPlayer();
  const target = {
    ...createProjectorPlayer(),
    playerId: 'render_target',
    instanceId: player.instanceId,
    x: 2,
    y: 2,
    name: '目标',
    displayName: '目标',
  };
  const npc = { npcId: 'npc_ref', x: 1, y: 1, char: '商', color: '#fff', name: '商人', questMarker: null };
  const monsterBuffs = [{ id: 'burning', remainingTicks: 3, stacks: 1, presentationScale: 1.2 }];
  const monster = {
    runtimeId: 'monster_ref',
    x: 2,
    y: 1,
    char: '妖',
    color: '#f00',
    name: '妖兽',
    tier: 'normal',
    buffs: monsterBuffs,
    hp: 10,
    maxHp: 10,
    qi: 5,
    maxQi: 5,
  };
  const container = { id: 'container_ref', x: 3, y: 1, char: '箱', color: '#ccc', name: '箱子' };
  const formation = {
    id: 'formation_ref',
    x: 4,
    y: 1,
    char: '阵',
    color: '#0af',
    name: '阵法',
    radius: 2,
    rangeShape: 'circle',
    active: true,
  };
  const service = new WorldSyncMapSnapshotService(
    {
      getInstanceTileState: () => null,
      getInstanceRuntime: () => null,
    },
    { getPlayer: (playerId: string) => (playerId === target.playerId ? target : null) },
    { has: () => true, getOrThrow: () => createTileTemplate() },
    { getMapTimeConfig: () => null, getMapTickSpeed: () => 1 },
    {},
    null,
  );
  const view = {
    ...createProjectorView(),
    visiblePlayers: [{ playerId: target.playerId, projectedFromParentMap: true, x: 7, y: 8 }],
    localNpcs: [npc],
    localMonsters: [monster],
    localContainers: [container],
    localFormations: [formation],
  };
  const first = service.buildRenderEntitiesSnapshot(view, player);
  const second = service.buildRenderEntitiesSnapshot(view, player);
  const npcRefShared = first.get(npc.npcId) === second.get(npc.npcId);
  const containerRefShared = first.get(`container:${view.instance.templateId}:${container.id}`) === second.get(`container:${view.instance.templateId}:${container.id}`);
  const formationRefShared = first.get(formation.id) === second.get(formation.id);
  const monsterBuffsRefShared = first.get(monster.runtimeId)?.buffs === second.get(monster.runtimeId)?.buffs;
  const projectedTarget = first.get(target.playerId);
  const projectedPlayerPositionApplied = projectedTarget?.x === 7 && projectedTarget?.y === 8;
  const source = readFileSync(resolve(process.cwd(), 'packages/server/src/network/world-sync-map-snapshot.service.ts'), 'utf8');
  const playerProjectionAvoidsSpread = source.includes('projectedPosition?.x ?? player.x')
    && !source.includes('...buildPlayerRenderEntity(target');

  assert.equal(npcRefShared, true);
  assert.equal(containerRefShared, true);
  assert.equal(formationRefShared, true);
  assert.equal(monsterBuffsRefShared, true);
  assert.equal(projectedPlayerPositionApplied, true);
  assert.equal(playerProjectionAvoidsSpread, true);
  return {
    npcRefShared,
    containerRefShared,
    formationRefShared,
    monsterBuffsRefShared,
    projectedPlayerPositionApplied,
    playerProjectionAvoidsSpread,
  };
}

function proveEnvelopeContainerRespawnAvoidsNoopArrayClone(): {
  noopReturnsSameView: boolean;
  noopLocalContainersRefShared: boolean;
  changedReturnsNewView: boolean;
  changedKeepsUnchangedEntryRef: boolean;
} {
  let respawnRemainingTicks = 5;
  const service = new WorldSyncEnvelopeService(
    {
      createDeltaEnvelope: () => ({}),
      createInitialEnvelope: () => ({}),
      clear: () => undefined,
    } as never,
    {
      getInstanceRuntime: () => ({
        tick: 10,
        getContainerById: (id: string) => ({ id }),
      }),
      worldRuntimeLootContainerService: {
        getHerbContainerWorldProjection: () => ({
          remainingCount: 0,
          respawnRemainingTicks,
        }),
      },
      getCombatEffects: () => [],
    } as never,
    { getOrThrow: () => ({}) } as never,
    { buildVisibleTileKeySet: () => new Set() } as never,
    {
      drainPlayerEventBusPayload: () => ({ payload: null }),
      getAoiPresentations: () => [],
      discardPlayer: () => undefined,
    } as never,
  );
  const stableEntry = { id: 'herb_a', respawnRemainingTicks };
  const view = {
    instance: { instanceId: 'instance_a', templateId: 'map_a' },
    localContainers: [stableEntry],
  };
  const noop = service.withContainerRespawnProjection(view);
  respawnRemainingTicks = 4;
  const changed = service.withContainerRespawnProjection(view);
  const noopReturnsSameView = noop === view;
  const noopLocalContainersRefShared = noop.localContainers === view.localContainers;
  const changedReturnsNewView = changed !== view && changed.localContainers !== view.localContainers;
  const changedKeepsUnchangedEntryRef = changed.localContainers[0] !== stableEntry
    && changed.localContainers[0].id === stableEntry.id
    && changed.localContainers[0].respawnRemainingTicks === 4;

  assert.equal(noopReturnsSameView, true);
  assert.equal(noopLocalContainersRefShared, true);
  assert.equal(changedReturnsNewView, true);
  assert.equal(changedKeepsUnchangedEntryRef, true);
  return { noopReturnsSameView, noopLocalContainersRefShared, changedReturnsNewView, changedKeepsUnchangedEntryRef };
}

function proveEnvelopeThreatHotpathOptimizationsPresent(): {
  identityProjectionLazyArray: boolean;
  presentationScaleAvoidsCandidatesSpread: boolean;
  eventBusMutatesWorldDelta: boolean;
  threatArrowsPassThrough: boolean;
  threatVisibleSetsAvoidIntermediateArrays: boolean;
} {
  const projectorSource = readFileSync(resolve(process.cwd(), 'packages/server/src/network/world-projector.service.ts'), 'utf8');
  const envelopeSource = readFileSync(resolve(process.cwd(), 'packages/server/src/network/world-sync-envelope.service.ts'), 'utf8');
  const threatSource = readFileSync(resolve(process.cwd(), 'packages/server/src/network/world-sync-threat.service.ts'), 'utf8');
  const identityProjectionLazyArray = projectorSource.includes('view.visiblePlayers.slice(0, index)')
    && !projectorSource.includes('view.visiblePlayers.map((entry');
  const presentationScaleAvoidsCandidatesSpread = !projectorSource.includes('const candidates = [')
    && projectorSource.includes('for (const entry of view.visiblePlayers)');
  const eventBusMutatesWorldDelta = envelopeSource.includes('const worldDelta = nextEnvelope.worldDelta ??')
    && envelopeSource.includes('worldDelta.eventBus = eventBus')
    && !envelopeSource.includes('...(nextEnvelope.worldDelta ?? {})');
  const threatArrowsPassThrough = threatSource.includes('threatArrows,')
    && threatSource.includes('full: current')
    && !threatSource.includes('function cloneThreatArrows');
  const threatVisibleSetsAvoidIntermediateArrays = threatSource.includes('const visiblePlayerIds = new Set();')
    && threatSource.includes('const visibleEntityIds = new Set();')
    && !threatSource.includes('...view.visiblePlayers.map')
    && !threatSource.includes('view.localMonsters.map');

  assert.equal(identityProjectionLazyArray, true);
  assert.equal(presentationScaleAvoidsCandidatesSpread, true);
  assert.equal(eventBusMutatesWorldDelta, true);
  assert.equal(threatArrowsPassThrough, true);
  assert.equal(threatVisibleSetsAvoidIntermediateArrays, true);
  return {
    identityProjectionLazyArray,
    presentationScaleAvoidsCandidatesSpread,
    eventBusMutatesWorldDelta,
    threatArrowsPassThrough,
    threatVisibleSetsAvoidIntermediateArrays,
  };
}

function provePlayerSourceMigrationRefsReused(): {
  techniqueSkillsRefShared: boolean;
  techniqueLayerAttrsRefShared: boolean;
  questRewardsRefShared: boolean;
} {
  const skill = {
    id: 'skill:memory-proof',
    name: 'memory proof skill',
    description: '',
    type: 'active',
    effects: [],
  };
  const layerAttrs = {
    constitution: 1,
    spirit: 0,
    perception: 0,
    talent: 0,
    strength: 0,
    meridians: 0,
  };
  const reward = {
    itemId: 'item:memory-proof',
    count: 1,
  };
  const row = {
    mapId: 'map:memory-proof',
    unlockedMinimapIds: [],
    techniques: [{
      techId: 'tech:memory-proof',
      level: 1,
      exp: 0,
      expToNext: 10,
      skills: [skill],
      layers: [{
        level: 1,
        expToNext: 10,
        attrs: layerAttrs,
      }],
    }],
    quests: [{
      id: 'quest:memory-proof',
      questId: 'quest:memory-proof',
      status: 'active',
      rewardItemIds: ['item:memory-proof'],
      rewards: [reward],
    }],
  };

  const snapshot = toPlayerSnapshotFromMigrationRow(row as any) as any;
  const technique = snapshot.techniques.techniques[0];
  const quest = snapshot.quests.entries[0];
  const techniqueSkillsRefShared = technique.skills === row.techniques[0].skills
    && technique.skills[0] === skill;
  const techniqueLayerAttrsRefShared = technique.layers[0].attrs === layerAttrs;
  const questRewardsRefShared = quest.rewards === row.quests[0].rewards
    && quest.rewards[0] === reward;

  assert.equal(techniqueSkillsRefShared, true);
  assert.equal(techniqueLayerAttrsRefShared, true);
  assert.equal(questRewardsRefShared, true);
  return {
    techniqueSkillsRefShared,
    techniqueLayerAttrsRefShared,
    questRewardsRefShared,
  };
}

function proveMapStaticAuxTilePatchResourceCachePresent(): {
  compactResourcesWeakMapPresent: boolean;
  compactResourcesRefCached: boolean;
  unusedCloneTileRemoved: boolean;
  tileCloneSpreadRemoved: boolean;
} {
  const source = readFileSync(resolve(process.cwd(), 'packages/server/src/network/world-sync-map-static-aux.service.ts'), 'utf8');
  const compactResourcesWeakMapPresent = source.includes('const compactTileResourcesBySource = new WeakMap');
  const compactResourcesRefCached = source.includes('compactTileResourcesBySource.get(resources)')
    && source.includes('compactTileResourcesBySource.set(resources, compact)');
  const unusedCloneTileRemoved = !source.includes('function cloneTile(source)');
  const tileCloneSpreadRemoved = !source.includes('source.resources?.map((entry) => ({ ...entry }))')
    && !source.includes('hiddenEntrance: source.hiddenEntrance ? { ...source.hiddenEntrance } : undefined');

  assert.equal(compactResourcesWeakMapPresent, true);
  assert.equal(compactResourcesRefCached, true);
  assert.equal(unusedCloneTileRemoved, true);
  assert.equal(tileCloneSpreadRemoved, true);
  return {
    compactResourcesWeakMapPresent,
    compactResourcesRefCached,
    unusedCloneTileRemoved,
    tileCloneSpreadRemoved,
  };
}

function provePanelCursorCacheReusedOnNoopDelta(): { panelCursorRefReused: boolean; panelCacheRemoved: boolean; deltaIsNull: boolean } {
  const service = new WorldProjectorService({
    has: () => true,
    getOrThrow: (mapId: string) => ({ name: mapId }),
  } as never, null);
  const view = createProjectorView();
  const player = createProjectorPlayer();
  service.createInitialEnvelope({ playerId: 'projector_player', sessionId: 'projector_session' }, view, player);
  const state = service as unknown as { cacheByPlayerId: Map<string, any> };
  const before = state.cacheByPlayerId.get('projector_player')?.panelCursor;
  const delta = service.createDeltaEnvelope({ ...view, tick: 2 }, player);
  const afterState = state.cacheByPlayerId.get('projector_player');
  const after = afterState?.panelCursor;
  const panelCursorRefReused = before === after;
  const panelCacheRemoved = afterState?.panel === undefined;
  assert.equal(delta, null);
  assert.equal(panelCursorRefReused, true);
  assert.equal(panelCacheRemoved, true);
  return { panelCursorRefReused, panelCacheRemoved, deltaIsNull: delta === null };
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

function createAuxView(tick: number): any {
  return {
    tick,
    worldRevision: tick,
    selfRevision: tick,
    instance: {
      instanceId: 'aux_instance',
      templateId: 'map.a',
    },
    self: { x: 1, y: 1 },
  };
}

function createAuxPlayer(): any {
  return {
    unlockedMapIds: [],
    attrs: { numericStats: { viewRange: 1 } },
    realm: {
      stage: '炼气',
      realmLv: 1,
      displayName: '炼气一层',
      name: '炼气',
      shortName: '炼气',
      path: 'qi',
      narrative: 'narrative',
      review: 'review',
      lifespanYears: 60,
      progress: 10,
      progressToNext: 100,
      breakthroughReady: false,
      nextStage: '炼气二层',
      minTechniqueLevel: 1,
      minTechniqueRealm: 1,
      breakthroughItems: [],
      breakthrough: null,
      heavenGate: null,
    },
  };
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
  const contentTemplateSource = [
    readFileSync(resolve(process.cwd(), 'packages/server/src/content/content-template.repository.ts'), 'utf8'),
    readFileSync(resolve(process.cwd(), 'packages/server/src/content/registries/monster-template.registry.ts'), 'utf8'),
  ].join('\n');
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
    && projectorSource.includes('panelCursor: panelUpdate.panelCursor')
    && !projectorSource.includes('panel: panelUpdate.panel');
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
  groundPersistenceAvoidsItemSpread: boolean;
  staticMapObjectsUseTemplateRefs: boolean;
  monsterSpawnUsesTemplateBaseRefs: boolean;
  monsterFormulaRecalcAvoidsDeepClone: boolean;
  staticSnapshotViewsReuseSourceRefs: boolean;
  groundPileSnapshotAvoidsItemSpread: boolean;
  monsterSnapshotAvoidsNestedClones: boolean;
  buildingRoomQueriesReuseRefs: boolean;
  buildingRoomHydrateAvoidsInstanceIdSpread: boolean;
  monsterRuntimeHydrateAndPersistenceReusePayloadRefs: boolean;
  groundHydrateReusesPayloadRefs: boolean;
  playerTemporaryBuffCloneUsesPrototypeRefs: boolean;
  playerNoticeDrainSwapsQueueRef: boolean;
  playerEquipmentSnapshotReusesSlotItemRefs: boolean;
  playerContextActionsAvoidEntrySpread: boolean;
  playerProgressionConfigViewsReuseRefs: boolean;
  playerRealmProjectionReusesStableRefs: boolean;
  playerAttributesAvoidHotpathScratchClones: boolean;
  playerDomainPayloadColumnsAreJsonb: boolean;
  playerDomainCloneJsonValueDecodesOnly: boolean;
  playerProjectedSnapshotHydratesStarterInPlace: boolean;
  playerSnapshotNormalizeAndProjectionHydrateHaveSingleOwner: boolean;
  playerItemDomainRawPayloadsAreMinimal: boolean;
  marketBuySellSnapshotsLazyDurableOnly: boolean;
  gmPlayerListUsesLightSummaries: boolean;
  leaderboardUsesLightRuntimeProjections: boolean;
  authRuntimeSyncUsesIdentityProjection: boolean;
  questRuntimeStoresLightState: boolean;
  instancePersistenceNormalizesItemPayloads: boolean;
  instancePersistenceNormalizesObjectPayloads: boolean;
  instanceOverlayPortalPersistenceUsesWhitelist: boolean;
} {
  const mapInstanceSource = readFileSync(resolve(process.cwd(), 'packages/server/src/runtime/instance/map-instance.runtime.ts'), 'utf8');
  const instanceDomainPersistenceSource = readFileSync(resolve(process.cwd(), 'packages/server/src/persistence/instance-domain-persistence.service.ts'), 'utf8');
  const mapSnapshotSource = readFileSync(resolve(process.cwd(), 'packages/server/src/network/world-sync-map-snapshot.service.ts'), 'utf8');
  const playerViewQuerySource = readFileSync(resolve(process.cwd(), 'packages/server/src/runtime/world/query/world-runtime-player-view-query.service.ts'), 'utf8');
  const playerRuntimeSource = readFileSync(resolve(process.cwd(), 'packages/server/src/runtime/player/player-runtime.service.ts'), 'utf8');
  const playerAttributesSource = readFileSync(resolve(process.cwd(), 'packages/server/src/runtime/player/player-attributes.service.ts'), 'utf8');
  const playerRealmProjectionSource = readFileSync(resolve(process.cwd(), 'packages/server/src/runtime/player/player-realm-projection.helpers.ts'), 'utf8');
  const playerProgressionSource = readFileSync(resolve(process.cwd(), 'packages/server/src/runtime/player/player-progression.service.ts'), 'utf8');
  const playerDomainPersistenceSource = readFileSync(resolve(process.cwd(), 'packages/server/src/persistence/player-domain-persistence.service.ts'), 'utf8');
  const playerPersistenceSource = readFileSync(resolve(process.cwd(), 'packages/server/src/persistence/player-persistence.service.ts'), 'utf8');
  const marketRuntimeSource = readFileSync(resolve(process.cwd(), 'packages/server/src/runtime/market/market-runtime.service.ts'), 'utf8');
  const leaderboardRuntimeSource = readFileSync(resolve(process.cwd(), 'packages/server/src/runtime/player/leaderboard-runtime.service.ts'), 'utf8');
  const nativeGmStateQuerySource = readFileSync(resolve(process.cwd(), 'packages/server/src/http/native/native-gm-state-query.service.ts'), 'utf8');
  const nativePlayerAuthSource = readFileSync(resolve(process.cwd(), 'packages/server/src/http/native/native-player-auth.service.ts'), 'utf8');
  const nativeManagedAccountSource = readFileSync(resolve(process.cwd(), 'packages/server/src/http/native/native-managed-account.service.ts'), 'utf8');
  const questQuerySource = readFileSync(resolve(process.cwd(), 'packages/server/src/runtime/world/query/world-runtime-quest-query.service.ts'), 'utf8');
  const npcQuestInteractionSource = readFileSync(resolve(process.cwd(), 'packages/server/src/runtime/world/query/world-runtime-npc-quest-interaction-query.service.ts'), 'utf8');
  const questNormalizationSource = readFileSync(resolve(process.cwd(), 'packages/server/src/runtime/world/world-runtime.normalization.helpers.ts'), 'utf8');
  const npcQuestWriteSource = readFileSync(resolve(process.cwd(), 'packages/server/src/runtime/world/world-runtime-npc-quest-write.service.ts'), 'utf8');
  const worldLifecycleSource = readFileSync(resolve(process.cwd(), 'packages/server/src/runtime/world/world-runtime-lifecycle.service.ts'), 'utf8');
  const worldInstanceLeaseSource = readFileSync(resolve(process.cwd(), 'packages/server/src/runtime/world/world-runtime-instance-lease.helpers.ts'), 'utf8');

  // tileProjectionByCoord 必须挂在 MapInstanceRuntime 上，且 service / registry 内不再持有 service-level 字段。
  const tileTemplateRegistrySource = readFileSync(resolve(process.cwd(), 'packages/server/src/runtime/map/registries/tile-template.registry.ts'), 'utf8');
  const tileProjectionOnInstance = mapInstanceSource.includes('tileProjectionByCoord = new Map()')
    && tileTemplateRegistrySource.includes('instance.tileProjectionByCoord = projectionByCoord')
    && mapSnapshotSource.includes('this.tileRegistry.shareProjection(instance,')
    && !mapSnapshotSource.includes('private readonly tileProjectionByCoord = new Map')
    && !tileTemplateRegistrySource.includes('private readonly tileProjectionByCoord = new Map');

  // npcQuestMarkerCache 必须挂在 player runtime 对象上，且 service 内不再持有 service-level 字段。
  const npcQuestMarkerCacheOnPlayer = playerRuntimeSource.includes('npcQuestMarkerCache: new Map()')
    && playerViewQuerySource.includes('player.npcQuestMarkerCache = playerCache')
    && playerViewQuerySource.includes('playerCache.set(entry.npcId, nextEntry)')
    && playerViewQuerySource.includes('function isSameNpcQuestMarkerEntry(cached, source, questMarker)')
    && !playerViewQuerySource.includes('source: entry, questMarker, entry: nextEntry')
    && !playerViewQuerySource.includes('npcQuestMarkerViewCacheByPlayerId = new Map()');

  // removePlayer 必须清理 localPlayerViewCacheByPlayerId。
  const removePlayerClearsLocalPlayerView = mapInstanceSource.includes('this.localPlayerViewCacheByPlayerId.delete(playerId)');

  // building deconstruct 必须清理 localBuildingViewCacheById。
  const buildingDeconstructClearsCache = mapInstanceSource.includes('this.localBuildingViewCacheById.delete(buildingId)');

  // groundPile 拾取空必须清理 localGroundPileViewCacheBySourceId。
  const groundPilePickupClearsCache = mapInstanceSource.includes('this.localGroundPileViewCacheBySourceId.delete(buildGroundSourceId(tileIndex))');

  // hydrateGroundPiles 重置时也要清理 view cache。
  const hydrateGroundPilesClearsCache = mapInstanceSource.includes('this.localGroundPileViewCacheBySourceId.clear()');

  // 地面物品 flush/delta 只重建 tile entries，不再逐 item spread 模板字段。
  const groundPersistenceAvoidsItemSpread = mapInstanceSource.includes('items: pile.items.map((entry) => entry.item)')
    && !mapInstanceSource.includes('items: pile.items.map((entry) => ({ ...entry.item }))');

  // landmark/container/npc 静态对象直接挂模板引用，不再为每个实例复制外壳与 drops/lootPools。
  const staticMapObjectsUseTemplateRefs = mapInstanceSource.includes('this.landmarksById.set(landmark.id, landmark)')
    && mapInstanceSource.includes('this.containersById.set(container.id, container)')
    && mapInstanceSource.includes('this.npcsById.set(npc.npcId, npc)')
    && !mapInstanceSource.includes('this.landmarksById.set(landmark.id, {')
    && !mapInstanceSource.includes('this.containersById.set(container.id, {')
    && !mapInstanceSource.includes('this.npcsById.set(state.npcId, state)');

  // 妖兽 spawn 初始化复用模板/已解析基础属性引用，派生态由 recalculateMonsterDerivedState 后续 copy-on-write。
  const monsterSpawnUsesTemplateBaseRefs = mapInstanceSource.includes('baseAttrs: monster.baseAttrs')
    && mapInstanceSource.includes('baseNumericStats: monster.baseNumericStats')
    && mapInstanceSource.includes('ratioDivisors: monster.ratioDivisors')
    && !mapInstanceSource.includes('baseAttrs: cloneAttributes(monster.baseAttrs)')
    && !mapInstanceSource.includes('baseNumericStats: cloneNumericStats(monster.baseNumericStats)')
    && !mapInstanceSource.includes('ratioDivisors: cloneNumericRatioDivisors(monster.ratioDivisors)');

  const monsterFormulaRecalcAvoidsDeepClone = mapInstanceSource.includes('const formulaRaw = formula.raw;')
    && mapInstanceSource.includes('...formulaRaw,')
    && !mapInstanceSource.includes('clonePlainValue(formula.raw)')
    && !mapInstanceSource.includes('function clonePlainValue');

  const staticSnapshotViewsReuseSourceRefs = mapInstanceSource.includes('function snapshotNpc(source) {\n    return source;\n}')
    && mapInstanceSource.includes('function snapshotContainer(source) {\n    return source;\n}')
    && mapInstanceSource.includes('function snapshotLandmark(source) {\n    return source;\n}');

  const groundPileSnapshotAvoidsItemSpread = mapInstanceSource.includes('item: entry.item')
    && !mapInstanceSource.includes('item: { ...entry.item }');

  const monsterSnapshotAvoidsNestedClones = mapInstanceSource.includes('baseAttrs: source.baseAttrs')
    && mapInstanceSource.includes('numericStats: source.numericStats')
    && mapInstanceSource.includes('buffs: source.buffs')
    && mapInstanceSource.includes('cooldownReadyTickBySkillId: source.cooldownReadyTickBySkillId')
    && mapInstanceSource.includes('damageContributors: source.damageContributors')
    && !mapInstanceSource.includes('baseAttrs: cloneAttributes(source.baseAttrs)')
    && !mapInstanceSource.includes('buffs: source.buffs.map((entry) => cloneTemporaryBuff(entry))')
    && !mapInstanceSource.includes('cooldownReadyTickBySkillId: { ...source.cooldownReadyTickBySkillId }')
    && !mapInstanceSource.includes('damageContributors: { ...source.damageContributors }');

  const buildingRoomQueriesReuseRefs = mapInstanceSource.includes('return Array.from(this.buildingById.values());')
    && mapInstanceSource.includes('return Array.from(this.roomsById.values());')
    && !mapInstanceSource.includes('return Array.from(this.buildingById.values()).map((building) => ({ ...building }))')
    && !mapInstanceSource.includes('return Array.from(this.roomsById.values()).map((room) => ({ ...room }))')
    && !mapInstanceSource.includes('filter(Boolean).map((building) => ({ ...building }))');

  const buildingRoomHydrateAvoidsInstanceIdSpread = mapInstanceSource.includes('room.instanceId = this.meta.instanceId;')
    && mapInstanceSource.includes('this.roomsById.set(id, room);')
    && mapInstanceSource.includes('snapshot.instanceId = this.meta.instanceId;')
    && mapInstanceSource.includes('this.fengShuiByRoomId.set(roomId, snapshot);')
    && !mapInstanceSource.includes('this.roomsById.set(id, { ...room, instanceId: this.meta.instanceId })')
    && !mapInstanceSource.includes('this.fengShuiByRoomId.set(roomId, { ...snapshot, instanceId: this.meta.instanceId })');

  const monsterRuntimeHydrateAndPersistenceReusePayloadRefs = mapInstanceSource.includes('monster.buffs = payload.buffs;')
    && mapInstanceSource.includes('monster.cooldownReadyTickBySkillId = payload.cooldownReadyTickBySkillId;')
    && mapInstanceSource.includes('monster.damageContributors = payload.damageContributors;')
    && mapInstanceSource.includes('cooldownReadyTickBySkillId: monster.cooldownReadyTickBySkillId ?? {}')
    && mapInstanceSource.includes('damageContributors: monster.damageContributors ?? {}')
    && mapInstanceSource.includes('buffs: Array.isArray(monster.buffs) ? monster.buffs : []')
    && !mapInstanceSource.includes('monster.buffs = payload.buffs.map((buff) => ({ ...buff }))')
    && !mapInstanceSource.includes('monster.cooldownReadyTickBySkillId = { ...payload.cooldownReadyTickBySkillId }')
    && !mapInstanceSource.includes('monster.damageContributors = { ...payload.damageContributors }')
    && !mapInstanceSource.includes('cooldownReadyTickBySkillId: { ...(monster.cooldownReadyTickBySkillId ?? {}) }')
    && !mapInstanceSource.includes('damageContributors: { ...(monster.damageContributors ?? {}) }')
    && !mapInstanceSource.includes('buffs: Array.isArray(monster.buffs) ? monster.buffs.map((buff) => ({ ...buff })) : []');

  const groundHydrateReusesPayloadRefs = worldLifecycleSource.includes('current.items.push(payload);')
    && worldInstanceLeaseSource.includes('current.items.push(payload);')
    && mapInstanceSource.includes('item.itemId = item.itemId.trim();')
    && mapInstanceSource.includes('item.count = Number.isFinite(Number(item.count)) ? Math.max(1, Math.trunc(Number(item.count))) : 1;')
    && mapInstanceSource.includes('return item;')
    && !worldLifecycleSource.includes('itemId: typeof payload.itemId === \'string\' ? payload.itemId : \'unknown\'')
    && !worldInstanceLeaseSource.includes('itemId: typeof payload.itemId === \'string\' ? payload.itemId : \'unknown\'')
    && !mapInstanceSource.includes('return {\n        ...item,')
    && !mapInstanceSource.includes('return {\n        ...item,\n        itemId: item.itemId,');

  const runtimeBuffInstanceSource = readFileSync(resolve(process.cwd(), 'packages/server/src/runtime/player/runtime-buff-instance.ts'), 'utf8');
  const playerTemporaryBuffCloneUsesPrototypeRefs = runtimeBuffInstanceSource.includes('function createRuntimeTemporaryBuffPrototype(source')
    && runtimeBuffInstanceSource.includes('Object.assign(Object.create(prototype), {')
    && runtimeBuffInstanceSource.includes('attrs: source.attrs,')
    && runtimeBuffInstanceSource.includes('stats: source.stats,')
    && runtimeBuffInstanceSource.includes('qiProjection: source.qiProjection,')
    && runtimeBuffInstanceSource.includes('export function materializeRuntimeTemporaryBuff(source')
    && runtimeBuffInstanceSource.includes('toJSON() {\n      return materializeRuntimeTemporaryBuff(this);\n    }')
    && playerRuntimeSource.includes('buffs: player.buffs.buffs.map((entry) => materializeRuntimeTemporaryBuff(entry))')
    && mapInstanceSource.includes('monster.buffs.push(createRuntimeTemporaryBuff(buff))')
    && mapInstanceSource.includes('refreshRuntimeTemporaryBuffPrototype(existing, buff)')
    && !playerRuntimeSource.includes('function cloneTemporaryBuff')
    && !mapInstanceSource.includes('function cloneTemporaryBuff')
    && !mapInstanceSource.includes('existing.attrs = buff.attrs ? { ...buff.attrs } : undefined')
    && !mapInstanceSource.includes('existing.stats = buff.stats ? { ...buff.stats } : undefined')
    && !mapInstanceSource.includes('existing.qiProjection = buff.qiProjection ? buff.qiProjection.map((entry) => ({ ...entry })) : undefined');

  const playerNoticeDrainSwapsQueueRef = playerRuntimeSource.includes('const queue = player.notices.queue;\n        player.notices.queue = [];')
    && !playerRuntimeSource.includes('const queue = player.notices.queue.map((entry) => ({ ...entry }));\n        player.notices.queue.length = 0;');

  const playerEquipmentSnapshotReusesSlotItemRefs = playerRuntimeSource.includes('item: equipment[slot] ?? null')
    && !playerRuntimeSource.includes('item: equipment[slot] ? { ...equipment[slot] } : null');

  const playerContextActionsAvoidEntrySpread = playerRuntimeSource.includes('const normalized = actions\n            .slice()\n            .sort((left, right) => left.id.localeCompare(right.id, \'zh-Hans-CN\'));')
    && !playerRuntimeSource.includes('const normalized = actions\n            .map((entry) => ({ ...entry }))\n            .sort((left, right) => left.id.localeCompare(right.id, \'zh-Hans-CN\'));');

  const playerProgressionConfigViewsReuseRefs = playerProgressionSource.includes('return entry;')
    && playerProgressionSource.includes('                    : config.breakthroughItems)')
    && playerProgressionSource.includes(': (realm.breakthroughItems ?? []);')
    && playerProgressionSource.includes('return transition.rootFoundationItems ?? [];')
    && !playerProgressionSource.includes('return entry ? { ...entry } : undefined;')
    && !playerProgressionSource.includes('config.breakthroughItems.map((item) => ({ ...item }))')
    && !playerProgressionSource.includes('(realm.breakthroughItems ?? []).map((item) => ({ ...item }))')
    && !playerProgressionSource.includes('return (transition.rootFoundationItems ?? []).map((item) => ({ itemId: item.itemId, count: item.count }));');

  const playerRealmProjectionReusesStableRefs = playerRealmProjectionSource.includes('breakthroughItems: Array.isArray(source.breakthroughItems) ? source.breakthroughItems : []')
    && playerRealmProjectionSource.includes('requirements: Array.isArray(source.breakthrough.requirements) ? source.breakthrough.requirements : []')
    && playerRealmProjectionSource.includes('severed: Array.isArray(source.severed) ? source.severed : []')
    && !playerRealmProjectionSource.includes('breakthroughItems.map((entry) => ({ ...entry }))')
    && !playerRealmProjectionSource.includes('requirements.map((entry) => ({ ...entry }))')
    && playerRuntimeSource.includes('return projectRealmState(realm);')
    && playerRuntimeSource.includes('return projectHeavenGateState(state);');

  const playerAttributesAvoidHotpathScratchClones = playerAttributesSource.includes('techniqueStatesScratch = [];')
    && playerAttributesSource.includes('const techniques = resolveTechniqueStatesForCalculation(')
    && playerAttributesSource.includes('if (!needsNormalization) {\n        return techniques;\n    }')
    && playerAttributesSource.includes('scratch.length = 0;')
    && playerAttributesSource.includes('const baseAttrs = cloneAttributes(rawBaseAttrs);')
    && playerAttributesSource.includes('addScaledAttributes(flatBuffAttrs, buff.attrs, effectFactor);')
    && playerAttributesSource.includes('addScaledPartialNumericStats(target, weight, value);')
    && playerAttributesSource.includes('addBuffNumericStats(target, buff, effectFactor);')
    && !playerAttributesSource.includes('const techniqueStates = player.techniques.techniques.map(toTechniqueState);')
    && !playerAttributesSource.includes('function toTechniqueState(entry)')
    && !playerAttributesSource.includes('const realmBaseAttrs = cloneAttributes(rawBaseAttrs);')
    && !playerAttributesSource.includes('addAttributes(flatBuffAttrs, scaleAttributes(buff.attrs, effectFactor));')
    && !playerAttributesSource.includes('addPartialNumericStats(target, scalePartialNumericStats(weight, value));')
    && !playerAttributesSource.includes('function scaleBuffNumericStats');

  const playerDomainPayloadColumnsAreJsonb = [
    'raw_payload jsonb',
    'targeting_rules_payload jsonb',
    'condition_payload jsonb',
    'base_attrs_payload jsonb',
    'bonus_entries_payload jsonb',
    'realm_payload jsonb',
    'heaven_gate_payload jsonb',
    'spiritual_roots_payload jsonb',
    'ingredients_payload jsonb',
    'detail_jsonb jsonb',
    'levels_payload jsonb',
  ].every((needle) => playerDomainPersistenceSource.includes(needle));

  const playerDomainCloneJsonValueDecodesOnly = playerDomainPersistenceSource.includes('function cloneJsonValue<T>(value: T): T {\n  return decodeJsonValue(value) as T;\n}')
    && !playerDomainPersistenceSource.includes('return decoded.map((entry) => cloneJsonValue(entry)) as T;')
    && !playerDomainPersistenceSource.includes('Object.entries(normalized).map(([key, entry]) => [key, cloneJsonValue(entry)])');

  const playerProjectedSnapshotHydratesStarterInPlace = playerDomainPersistenceSource.includes('const snapshot = starterSnapshot;')
    && playerDomainPersistenceSource.includes('snapshot.wallet = {\n    balances: normalizeProjectedWalletRows(domains.walletRows) ?? [],\n  };')
    && playerDomainPersistenceSource.includes('snapshot.marketStorage = {\n    items: normalizeProjectedMarketStorageRows(domains.marketStorageItems) ?? [],\n  };')
    && !playerDomainPersistenceSource.includes('const snapshot = {\n    ...starterSnapshot,')
    && !playerDomainPersistenceSource.includes('enhancementRecords: Array.isArray(starterSnapshot.progression.enhancementRecords)\n        ? starterSnapshot.progression.enhancementRecords.map((entry) => cloneJsonValue(entry))')
    && !playerDomainPersistenceSource.includes('buffs: Array.isArray(starterSnapshot.buffs?.buffs)\n        ? starterSnapshot.buffs.buffs.map((entry) => cloneJsonValue(entry))');

  const playerSnapshotNormalizeAndProjectionHydrateHaveSingleOwner = playerPersistenceSource.includes('items: Array.isArray(inventory?.items) ? inventory.items : []')
    && playerPersistenceSource.includes('slots: Array.isArray(equipment?.slots) ? equipment.slots : []')
    && playerPersistenceSource.includes('techniques: Array.isArray(techniques?.techniques) ? techniques.techniques : []')
    && playerDomainPersistenceSource.includes('function applyProjectedInventory(')
    && playerDomainPersistenceSource.includes('function applyProjectedEquipment(')
    && playerDomainPersistenceSource.includes('function applyProjectedTechniques(')
    && playerDomainPersistenceSource.includes('function applyProjectedInventory(\n  snapshot: PersistedPlayerSnapshot,\n  rows: PlayerInventoryItemLoadRow[],\n  contentTemplateRepository?: InventoryItemTemplateRepository | null,\n): void {\n  if (rows.length === 0) {\n    return;\n  }')
    && playerDomainPersistenceSource.includes('function applyProjectedEquipment(\n  snapshot: PersistedPlayerSnapshot,\n  rows: PlayerEquipmentSlotLoadRow[],\n  contentTemplateRepository?: InventoryItemTemplateRepository | null,\n): void {\n  if (rows.length === 0) {\n    return;\n  }')
    && playerDomainPersistenceSource.includes('function applyProjectedTechniques(\n  snapshot: PersistedPlayerSnapshot,\n  rows: PlayerTechniqueStateLoadRow[],\n): void {\n  if (rows.length === 0) {\n    return;\n  }');

  const playerItemDomainRawPayloadsAreMinimal = playerDomainPersistenceSource.includes('buildPersistedInventoryItemRawPayload({\n      itemId,\n      count,\n      enhanceLevel: entry?.enhanceLevel,\n      rawPayload,\n    })')
    && playerDomainPersistenceSource.includes('buildPersistedInventoryItemRawPayload({\n      itemId,\n      count,\n      enhanceLevel,\n      rawPayload,\n    })')
    && playerDomainPersistenceSource.includes('buildPersistedEquipmentItemRawPayload({\n      itemId,\n      slot: slotType,\n      enhanceLevel: item?.enhanceLevel,\n      rawPayload: item,\n    })')
    && !playerDomainPersistenceSource.includes('...(rawPayload ?? entry ?? {})')
    && !playerDomainPersistenceSource.includes('JSON.stringify(row.rawPayload),\n    );\n    parameterIndex += 7;');

  const marketBuySellSnapshotsLazyDurableOnly = marketRuntimeSource.includes('const canUseDurableBuyNow = false;\n            let buyerSnapshot = null;\n            const matchedSellerPlans = [];\n            if (canUseDurableBuyNow) {\n                buyerSnapshot = this.playerRuntimeService.snapshot(playerId);')
    && marketRuntimeSource.includes('const canUseDurableSellNow = false;\n            let sellerSnapshot = null;\n            const matchedBuyerPlans = [];\n            if (canUseDurableSellNow) {\n                sellerSnapshot = this.playerRuntimeService.snapshot(playerId);')
    && !marketRuntimeSource.includes('const buyerSnapshot = this.playerRuntimeService.snapshot(playerId);\n            const durableOperationService = this.durableOperationService;\n            const canUseDurableBuyNow = false;')
    && !marketRuntimeSource.includes('const sellerSnapshot = this.playerRuntimeService.snapshot(playerId);\n            const durableOperationService = this.durableOperationService;\n            const canUseDurableSellNow = false;');

  const gmPlayerListUsesLightSummaries = playerRuntimeSource.includes('listGmPlayerSummaries()')
    && playerRuntimeSource.includes('displayName: player.displayName,')
    && playerRuntimeSource.includes('persistentRevision: player.persistentRevision,')
    && nativeGmStateQuerySource.includes('const runtimePlayers = typeof this.playerRuntimeService.listGmPlayerSummaries === \'function\'\n      ? this.playerRuntimeService.listGmPlayerSummaries()\n      : this.playerRuntimeService.listPlayerSnapshots();')
    && !nativeGmStateQuerySource.includes('const runtimePlayers = this.playerRuntimeService.listPlayerSnapshots();');

  const leaderboardUsesLightRuntimeProjections = playerRuntimeSource.includes('listLeaderboardPlayerProjections()')
    && playerRuntimeSource.includes('inventory: player.inventory,')
    && playerRuntimeSource.includes('attrs: player.attrs,')
    && leaderboardRuntimeSource.includes('typeof this.playerRuntimeService.listLeaderboardPlayerProjections === \'function\'\n            ? this.playerRuntimeService.listLeaderboardPlayerProjections()\n            : this.playerRuntimeService.listPlayerSnapshots();')
    && !leaderboardRuntimeSource.includes('const players = this.playerRuntimeService.listPlayerSnapshots()');

  const authRuntimeSyncUsesIdentityProjection = playerRuntimeSource.includes('getPlayerIdentityProjection(playerId)')
    && playerRuntimeSource.includes('displayName: player.displayName,')
    && nativePlayerAuthSource.includes('getPlayerIdentityProjection(playerId: string): PlayerRuntimeIdentityProjection | null;')
    && nativePlayerAuthSource.includes('if (!this.playerRuntimeService.getPlayerIdentityProjection(user.playerId))')
    && nativePlayerAuthSource.includes('const runtime = this.playerRuntimeService.getPlayerIdentityProjection(user.playerId);')
    && nativeManagedAccountSource.includes('getPlayerIdentityProjection(playerId: string): PlayerRuntimeIdentityProjection | null;')
    && nativeManagedAccountSource.includes('if (!this.playerRuntimeService.getPlayerIdentityProjection(user.playerId))')
    && !nativePlayerAuthSource.includes('this.playerRuntimeService.snapshot(user.playerId)')
    && !nativeManagedAccountSource.includes('this.playerRuntimeService.snapshot(user.playerId)');

  const questRuntimeStoresLightState = questNormalizationSource.includes('const cloned: any = {\n        id: quest.id,')
    && !questNormalizationSource.includes('return {\n        ...quest,\n        status,')
    && !questNormalizationSource.includes('rewardItemIds: quest.rewardItemIds.slice()')
    && questQuerySource.includes('const built = cloneQuestState({')
    && questQuerySource.includes('materializeQuestView(playerId, quest)')
    && questQuerySource.includes('quest = this.materializeQuestView(\'\', quest);')
    && questQuerySource.includes('resolveAvailableNpcQuestMarker(playerId, npc)')
    && questQuerySource.includes('resolveAvailableNpcQuestMarkerForPlayer(player, npc)')
    && questQuerySource.includes('findPlayerQuestById(playerQuests, questId)')
    && questQuerySource.includes('hasIncompletePreviousNpcQuest(playerQuests, npc.quests, index)')
    && npcQuestWriteSource.includes('materializeQuestForNpcWrite(deps, playerId, quest)')
    && npcQuestWriteSource.includes('player.quests.quests.push(cloneQuestState(questView, \'active\'));')
    && !npcQuestWriteSource.includes('player.quests.quests.push(cloneQuestState(quest, \'active\'));')
    && npcQuestInteractionSource.includes('return this.worldRuntimeQuestQueryService.resolveAvailableNpcQuestMarkerForPlayer(player, npc);')
    && !npcQuestInteractionSource.includes('collectNpcQuestViews(playerId, npc)')
    && playerRuntimeSource.includes('return player.quests.quests;')
    && playerRuntimeSource.includes('function cloneQuestRuntimeEntry(entry)')
    && playerRuntimeSource.includes('function cloneQuestRuntimeEntries(entries)')
    && playerRuntimeSource.includes('quests: cloneQuestRuntimeEntries(snapshot.quests.entries)')
    && playerRuntimeSource.includes('quests: cloneQuestRuntimeEntries(player.quests.quests)')
    && playerRuntimeSource.includes('entries: cloneQuestRuntimeEntries(player.quests.quests)')
    && playerRuntimeSource.includes('id: typeof entry.id === \'string\' ? entry.id : \'\',')
    && playerRuntimeSource.includes('targetMonsterId: typeof entry.targetMonsterId === \'string\' ? entry.targetMonsterId : \'\',')
    && playerRuntimeSource.includes('function cloneRuntimeBonusesForSnapshot(source)')
    && playerRuntimeSource.includes('if (!shouldKeepRuntimeBonusSource(entry))')
    && playerRuntimeSource.includes('runtimeBonuses: cloneRuntimeBonusesForSnapshot(player.runtimeBonuses)')
    && playerRuntimeSource.includes('runtimeBonuses: needsDomain(\'attr\') ? cloneRuntimeBonusesForSnapshot(player.runtimeBonuses) : []')
    && !playerRuntimeSource.includes('const cloned: any = {\n        ...entry,')
    && !playerRuntimeSource.includes('rewardItemIds: entry.rewardItemIds.slice()')
    && !playerRuntimeSource.includes('rewards: entry.rewards.map((reward) => ({ ...reward }))')
    && !playerRuntimeSource.includes('.map((entry) => cloneRuntimeBonus(entry))\n                .filter((entry) => shouldKeepRuntimeBonus(entry))')
    && !playerRuntimeSource.includes('player.runtimeBonuses.map((entry) => cloneRuntimeBonus(entry)).filter((entry) => shouldKeepRuntimeBonus(entry))')
    && !playerRuntimeSource.includes('return player.quests.quests.map((entry) => ({ ...entry, rewards: entry.rewards.map((reward) => ({ ...reward })) }));');

  const instancePersistenceNormalizesItemPayloads = instanceDomainPersistenceSource.includes('function normalizePersistedItemPayload(value: unknown): Record<string, unknown>')
    && instanceDomainPersistenceSource.includes('JSON.stringify(normalizePersistedItemPayload(input.itemPayload))')
    && instanceDomainPersistenceSource.includes('item_instance_payload: normalizePersistedItemPayload(entry.itemPayload)')
    && instanceDomainPersistenceSource.includes('JSON.stringify(normalizePersistedItemPayload(entry.item))')
    && instanceDomainPersistenceSource.includes('item_payload: normalizePersistedItemPayload(entry?.item)')
    && !instanceDomainPersistenceSource.includes('JSON.stringify(input.itemPayload ?? {})')
    && !instanceDomainPersistenceSource.includes('JSON.stringify(entry.itemPayload ?? {})')
    && !instanceDomainPersistenceSource.includes('JSON.stringify(entry.item ?? {})')
    && !instanceDomainPersistenceSource.includes('JSON.stringify(entry?.item ?? {})')
    && !instanceDomainPersistenceSource.includes('item_instance_payload: entry.itemPayload ?? {}');

  const instancePersistenceNormalizesObjectPayloads = instanceDomainPersistenceSource.includes('function normalizeJsonObjectPayload(value: unknown): Record<string, unknown>')
    && instanceDomainPersistenceSource.includes('JSON.stringify(normalizeJsonObjectPayload(activeSearchPayload))')
    && instanceDomainPersistenceSource.includes('state_payload: normalizeJsonObjectPayload(state.statePayload)')
    && instanceDomainPersistenceSource.includes('active_search_payload: normalizeJsonObjectPayload(state.activeSearchPayload)')
    && instanceDomainPersistenceSource.includes('JSON.stringify(normalizeJsonObjectPayload(input.statePayload))')
    && instanceDomainPersistenceSource.includes('state_payload: normalizeJsonObjectPayload(entry.statePayload)')
    && instanceDomainPersistenceSource.includes('JSON.stringify(normalizeJsonObjectPayload(input.patchPayload))')
    && instanceDomainPersistenceSource.includes('patchPayload: normalizeJsonObjectPayload(entry?.patchPayload)')
    && instanceDomainPersistenceSource.includes('patch_payload: entry.patchPayload')
    && !instanceDomainPersistenceSource.includes('JSON.stringify(activeSearchPayload ?? {})')
    && !instanceDomainPersistenceSource.includes('JSON.stringify(state.statePayload ?? {})')
    && !instanceDomainPersistenceSource.includes('JSON.stringify(state.activeSearchPayload ?? {})')
    && !instanceDomainPersistenceSource.includes('JSON.stringify(input.statePayload ?? {})')
    && !instanceDomainPersistenceSource.includes('state_payload: entry.statePayload ?? {}')
    && !instanceDomainPersistenceSource.includes('JSON.stringify(input.patchPayload ?? {})')
    && !instanceDomainPersistenceSource.includes('patchPayload: entry?.patchPayload ?? {}')
    && !instanceDomainPersistenceSource.includes('JSON.stringify(entry.patchPayload ?? {})');

  const instanceOverlayPortalPersistenceUsesWhitelist = mapInstanceSource.includes('id: portal.id,')
    && mapInstanceSource.includes('targetInstanceId: portal.targetInstanceId ?? null,')
    && mapInstanceSource.includes('sectId: portal.sectId,')
    && !mapInstanceSource.includes('.map((portal) => ({ ...portal }))');

  assert.equal(tileProjectionOnInstance, true);
  assert.equal(npcQuestMarkerCacheOnPlayer, true);
  assert.equal(removePlayerClearsLocalPlayerView, true);
  assert.equal(buildingDeconstructClearsCache, true);
  assert.equal(groundPilePickupClearsCache, true);
  assert.equal(hydrateGroundPilesClearsCache, true);
  assert.equal(groundPersistenceAvoidsItemSpread, true);
  assert.equal(staticMapObjectsUseTemplateRefs, true);
  assert.equal(monsterSpawnUsesTemplateBaseRefs, true);
  assert.equal(monsterFormulaRecalcAvoidsDeepClone, true);
  assert.equal(staticSnapshotViewsReuseSourceRefs, true);
  assert.equal(groundPileSnapshotAvoidsItemSpread, true);
  assert.equal(monsterSnapshotAvoidsNestedClones, true);
  assert.equal(buildingRoomQueriesReuseRefs, true);
  assert.equal(buildingRoomHydrateAvoidsInstanceIdSpread, true);
  assert.equal(monsterRuntimeHydrateAndPersistenceReusePayloadRefs, true);
  assert.equal(groundHydrateReusesPayloadRefs, true);
  assert.equal(playerTemporaryBuffCloneUsesPrototypeRefs, true);
  assert.equal(playerNoticeDrainSwapsQueueRef, true);
  assert.equal(playerEquipmentSnapshotReusesSlotItemRefs, true);
  assert.equal(playerContextActionsAvoidEntrySpread, true);
  assert.equal(playerProgressionConfigViewsReuseRefs, true);
  assert.equal(playerRealmProjectionReusesStableRefs, true);
  assert.equal(playerAttributesAvoidHotpathScratchClones, true);
  assert.equal(playerDomainPayloadColumnsAreJsonb, true);
  assert.equal(playerDomainCloneJsonValueDecodesOnly, true);
  assert.equal(playerProjectedSnapshotHydratesStarterInPlace, true);
  assert.equal(playerSnapshotNormalizeAndProjectionHydrateHaveSingleOwner, true);
  assert.equal(playerItemDomainRawPayloadsAreMinimal, true);
  assert.equal(marketBuySellSnapshotsLazyDurableOnly, true);
  assert.equal(gmPlayerListUsesLightSummaries, true);
  assert.equal(leaderboardUsesLightRuntimeProjections, true);
  assert.equal(authRuntimeSyncUsesIdentityProjection, true);
  assert.equal(questRuntimeStoresLightState, true);
  assert.equal(instancePersistenceNormalizesItemPayloads, true);
  assert.equal(instancePersistenceNormalizesObjectPayloads, true);
  assert.equal(instanceOverlayPortalPersistenceUsesWhitelist, true);
  return {
    tileProjectionOnInstance,
    npcQuestMarkerCacheOnPlayer,
    removePlayerClearsLocalPlayerView,
    buildingDeconstructClearsCache,
    groundPilePickupClearsCache,
    hydrateGroundPilesClearsCache,
    groundPersistenceAvoidsItemSpread,
    staticMapObjectsUseTemplateRefs,
    monsterSpawnUsesTemplateBaseRefs,
    monsterFormulaRecalcAvoidsDeepClone,
    staticSnapshotViewsReuseSourceRefs,
    groundPileSnapshotAvoidsItemSpread,
    monsterSnapshotAvoidsNestedClones,
    buildingRoomQueriesReuseRefs,
    buildingRoomHydrateAvoidsInstanceIdSpread,
    monsterRuntimeHydrateAndPersistenceReusePayloadRefs,
    groundHydrateReusesPayloadRefs,
    playerTemporaryBuffCloneUsesPrototypeRefs,
    playerNoticeDrainSwapsQueueRef,
    playerEquipmentSnapshotReusesSlotItemRefs,
    playerContextActionsAvoidEntrySpread,
    playerProgressionConfigViewsReuseRefs,
    playerRealmProjectionReusesStableRefs,
    playerAttributesAvoidHotpathScratchClones,
    playerDomainPayloadColumnsAreJsonb,
    playerDomainCloneJsonValueDecodesOnly,
    playerProjectedSnapshotHydratesStarterInPlace,
    playerSnapshotNormalizeAndProjectionHydrateHaveSingleOwner,
    playerItemDomainRawPayloadsAreMinimal,
    marketBuySellSnapshotsLazyDurableOnly,
    gmPlayerListUsesLightSummaries,
    leaderboardUsesLightRuntimeProjections,
    authRuntimeSyncUsesIdentityProjection,
    questRuntimeStoresLightState,
    instancePersistenceNormalizesItemPayloads,
    instancePersistenceNormalizesObjectPayloads,
    instanceOverlayPortalPersistenceUsesWhitelist,
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

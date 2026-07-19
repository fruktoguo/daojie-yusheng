import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { resolvePlayerFacingContentName } from '@mud/shared';

import { ContentTemplateRepository } from '../content/content-template.repository';
import * as playerDomainPersistence from '../persistence/player-domain-persistence.service';
import { CraftPanelEnhancementQueryService } from '../runtime/craft/craft-panel-enhancement-query.service';
import { CraftPanelRuntimeService } from '../runtime/craft/craft-panel-runtime.service';
import * as playerRuntimeModule from '../runtime/player/player-runtime.service';

const MARKER = 'REPAIR_PROOF:ISSUE-000025:PASS';
const ITEM_ID = 'equip.copper_luopan';
const ITEM_NAME = '铜罗盘';

type CapturedQueueRow = {
  label?: string | null;
  payloadJson?: Record<string, unknown>;
  detailJson?: Record<string, unknown>;
};

type CapturedEnhancementRecordRow = {
  itemId?: string;
  itemName?: string | null;
};

type PlayerRuntimeModuleWithRepair = typeof playerRuntimeModule & {
  repairEnhancementRecoveryDisplayNames?: (
    player: Record<string, any>,
    contentTemplateRepository: ContentTemplateRepository,
  ) => boolean;
};

async function main(): Promise<void> {
  const contentRepository = new ContentTemplateRepository();
  contentRepository.loadAll();

  const firstTarget = contentRepository.createItem(ITEM_ID, 1) as Record<string, any> | null;
  const secondTarget = contentRepository.createItem(ITEM_ID, 1) as Record<string, any> | null;
  const spiritStones = contentRepository.createItem('spirit_stone', 100) as Record<string, any> | null;
  assert(firstTarget && secondTarget && spiritStones, '真实内容目录未能创建 proof 物品');
  assert.equal(firstTarget.name, ITEM_NAME, '内容目录没有返回真实物品名');
  assert.equal(
    Object.prototype.hasOwnProperty.call(firstTarget, 'name'),
    false,
    'proof 必须覆盖模板名位于原型链的生产实例',
  );

  const player = createPlayer(firstTarget, secondTarget, spiritStones);
  const queueWrites: CapturedQueueRow[][] = [];
  const enhancementRecordWrites: CapturedEnhancementRecordRow[][] = [];
  const playerRuntimeService = createPlayerRuntimeService(player);
  const persistenceService = createPersistenceRecorder(queueWrites, enhancementRecordWrites);
  const enhancementQueryService = new CraftPanelEnhancementQueryService(contentRepository);
  const craftService = new CraftPanelRuntimeService(
    contentRepository,
    playerRuntimeService as never,
    persistenceService as never,
    {
      buildAlchemyPanelPayload: () => ({}),
      buildAlchemyPanelPatchPayload: () => ({}),
    } as never,
    enhancementQueryService,
    null as never,
  );
  craftService.enhancementConfigs.set(ITEM_ID, { steps: [] });

  const start = craftService.startEnhancement(player, {
    target: buildInventoryRef(firstTarget),
    targetLevel: 2,
  });
  assert.equal(start.ok, true, '真实强化入口未能启动任务');
  assert.equal(player.enhancementJob?.targetItemName, ITEM_NAME, '强化 job 必须保留真实物品名');
  assert.equal(player.enhancementRecords[0]?.itemName, ITEM_NAME, '强化记录必须保留真实物品名');
  assert.equal(start.messages?.[0]?.vars?.itemName, ITEM_NAME, '强化启动通知不得显示未知物品');

  const queued = craftService.startEnhancement(player, {
    target: buildInventoryRef(secondTarget),
    targetLevel: 1,
    queueMode: 'append',
  });
  assert.equal(queued.ok, true, '追加强化任务未能入队');
  assert.equal((queued as { queued?: boolean }).queued, true, '追加的强化任务未进入等待队列');
  assert.equal(player.techniqueActivityQueue[0]?.label, ITEM_NAME, '强化队列项必须显示真实物品名');
  assert.equal(player.techniqueActivityQueue[0]?.payload?.targetItemId, ITEM_ID, '强化队列必须快照目标物品 ID');
  assert.equal(player.techniqueActivityQueue[0]?.payload?.targetItemName, ITEM_NAME, '强化队列必须快照目标物品名');

  await settleAsyncPersistence();
  await craftService.persistTechniqueActivitySnapshot(player);
  await craftService.persistEnhancementRecords(player);

  const persistedQueue = queueWrites.at(-1) ?? [];
  const persistedQueueRow = persistedQueue[0];
  assert.equal(persistedQueueRow?.label, ITEM_NAME, '技艺队列写入载荷丢失物品名');
  assert.equal(persistedQueueRow?.payloadJson?.targetItemName, ITEM_NAME, '技艺队列写入载荷丢失名称快照');
  assert.equal(persistedQueueRow?.detailJson?.label, ITEM_NAME, '技艺队列详情写入载荷丢失物品名');

  const persistedRecords = enhancementRecordWrites.at(-1) ?? [];
  assert.equal(persistedRecords[0]?.itemName, ITEM_NAME, '强化记录写入载荷丢失物品名');
  const restartedRecords = playerDomainPersistence.projectEnhancementRecordsFromPersistenceRows(
    JSON.parse(JSON.stringify(persistedRecords)) as never,
  );
  assert.equal(restartedRecords[0]?.itemName, ITEM_NAME, '强化记录重启回读丢失物品名');

  const repairDisplayNames = (playerRuntimeModule as PlayerRuntimeModuleWithRepair)
    .repairEnhancementRecoveryDisplayNames;
  assert.equal(typeof repairDisplayNames, 'function', '强化恢复链路必须可调用生产名称修复');
  const restartedPlayer = {
    ...player,
    enhancementJob: null,
    enhancementRecords: restartedRecords.map((record) => ({ ...record, itemName: '未知物品' })),
    inventory: {
      ...player.inventory,
      items: [secondTarget, spiritStones],
      lockedItems: [],
    },
    techniqueActivityQueue: [{
      ...(JSON.parse(JSON.stringify(persistedQueueRow?.detailJson)) as Record<string, any>),
      label: '未知物品',
    }],
    dirtyDomains: new Set<string>(),
  };
  assert.equal(repairDisplayNames!(restartedPlayer, contentRepository), true, '重启水合未修复旧占位名');
  assert.equal(restartedPlayer.techniqueActivityQueue[0]?.label, ITEM_NAME, '重启后强化队列仍显示未知物品');
  assert.equal(restartedPlayer.enhancementRecords[0]?.itemName, ITEM_NAME, '重启后强化记录仍显示未知物品');
  assert.equal(restartedPlayer.dirtyDomains.has('active_job'), true, '修复队列名后必须标记 active_job 回写');
  assert.equal(restartedPlayer.dirtyDomains.has('enhancement_record'), true, '修复记录名后必须标记强化记录回写');

  const panelPayload = enhancementQueryService.buildEnhancementPanelPayload(restartedPlayer, new Map());
  const taskPayload = craftService.buildTechniqueActivityTaskListPayload(restartedPlayer, 123);
  const wirePayload = JSON.parse(JSON.stringify({ panelPayload, taskPayload })) as {
    panelPayload?: { state?: { records?: Array<{ itemId?: string; itemName?: string }>; queue?: Array<{ label?: string }> } };
    taskPayload?: { tasks?: Array<{ kind?: string; label?: string }> };
  };
  assert.equal(wirePayload.panelPayload?.state?.records?.[0]?.itemName, ITEM_NAME, '强化面板网络载荷丢失记录名');
  assert.equal(wirePayload.panelPayload?.state?.queue?.[0]?.label, ITEM_NAME, '强化面板网络载荷丢失队列名');
  const queuedTask = wirePayload.taskPayload?.tasks?.find((task) => task.kind === 'enhancement');
  assert.equal(queuedTask?.label, ITEM_NAME, '客户端统一任务投影丢失强化队列名');
  assert.equal(
    resolvePlayerFacingContentName(
      wirePayload.panelPayload?.state?.records?.[0]?.itemId,
      '未知物品',
      wirePayload.panelPayload?.state?.records?.[0]?.itemName,
    ),
    ITEM_NAME,
    '客户端共享显示解析不得退回未知物品',
  );

  console.log(MARKER);
}

function createPlayer(
  firstTarget: Record<string, any>,
  secondTarget: Record<string, any>,
  spiritStones: Record<string, any>,
): Record<string, any> {
  return {
    playerId: 'repair-proof:issue-000025',
    sessionId: null,
    runtimeOwnerId: 'repair-proof-runtime',
    sessionEpoch: 1,
    instanceId: 'repair-proof-instance',
    inventory: {
      items: [firstTarget, secondTarget, spiritStones],
      lockedItems: [],
      capacity: 40,
      revision: 1,
    },
    equipment: { slots: [], revision: 1 },
    artifacts: { slots: [], revision: 1 },
    wallet: {
      balances: [{ walletType: 'spirit_stone', balance: 100, frozenBalance: 0, version: 1 }],
    },
    realm: { realmLv: 1 },
    attrs: { craftEffectStats: null },
    enhancementSkill: { level: 5, exp: 0, expToNext: 60 },
    enhancementSkillLevel: 5,
    alchemySkill: { level: 1, exp: 0, expToNext: 60 },
    forgingSkill: { level: 1, exp: 0, expToNext: 60 },
    gatherSkill: { level: 1, exp: 0, expToNext: 60 },
    miningSkill: { level: 1, exp: 0, expToNext: 60 },
    formationSkill: { level: 1, exp: 0, expToNext: 60 },
    transmissionSkill: { level: 1, exp: 0, expToNext: 60 },
    buildingSkill: { level: 1, exp: 0, expToNext: 60 },
    alchemyPresets: [],
    enhancementRecords: [],
    techniqueActivityQueue: [],
    persistentRevision: 1,
    selfRevision: 1,
    dirtyDomains: new Set<string>(),
  };
}

function createPlayerRuntimeService(player: Record<string, any>): Record<string, any> {
  return {
    getPlayer: (playerId: string) => playerId === player.playerId ? player : null,
    getPlayerOrThrow(playerId: string) {
      assert.equal(playerId, player.playerId);
      return player;
    },
    canAffordWallet: (_playerId: string, itemId: string, amount: number) => (
      itemId !== 'spirit_stone' || Number(player.wallet.balances[0]?.balance ?? 0) >= amount
    ),
    debitWallet() {},
    creditWallet() {},
    refreshWalletCacheFromInventory: () => false,
    receiveInventoryItem(_playerId: string, item: Record<string, any>) {
      player.inventory.items.push({ ...item, itemInstanceId: randomUUID() });
    },
    captureOfflineGainBeforeTick: () => null,
    recordAssetStatisticMutation() {},
    markPersistenceDirtyDomains(targetPlayer: Record<string, any>, domains: string[]) {
      for (const domain of domains) targetPlayer.dirtyDomains.add(domain);
    },
    bumpPersistentRevision(targetPlayer: Record<string, any>) {
      targetPlayer.persistentRevision += 1;
    },
    playerProgressionService: {
      refreshPreview() {},
      grantCraftRealmExp: () => null,
    },
    playerAttributesService: { recalculate() {} },
    rebuildActionState() {},
  };
}

function createPersistenceRecorder(
  queueWrites: CapturedQueueRow[][],
  enhancementRecordWrites: CapturedEnhancementRecordRow[][],
): Record<string, any> {
  return {
    isEnabled: () => true,
    async savePlayerActiveJob() {},
    async savePlayerTechniqueActivityQueue(_playerId: string, rows: CapturedQueueRow[]) {
      queueWrites.push(structuredClone(rows));
    },
    async savePlayerEnhancementRecords(_playerId: string, rows: CapturedEnhancementRecordRow[]) {
      enhancementRecordWrites.push(structuredClone(rows));
    },
  };
}

function buildInventoryRef(item: Record<string, any>): {
  source: 'inventory';
  itemInstanceId: string;
  expectedItemInstanceId: string;
} {
  const itemInstanceId = typeof item.itemInstanceId === 'string' ? item.itemInstanceId : '';
  assert(itemInstanceId, 'proof 强化物品缺少实例 ID');
  return { source: 'inventory', itemInstanceId, expectedItemInstanceId: itemInstanceId };
}

async function settleAsyncPersistence(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

void main();

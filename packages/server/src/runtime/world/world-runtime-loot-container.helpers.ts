/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 从 world-runtime-loot-container.service.ts 抽取的容器/战利品相关游离辅助函数。
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mergeItemStackEntryInto } from '@mud/shared';
import * as world_runtime_normalization_helpers_1 from './world-runtime.normalization.helpers';

const { buildContainerSourceId, cloneContainerItem } = world_runtime_normalization_helpers_1;

const DURABLE_OPERATION_ID_MAX_LENGTH = 180;
const DURABLE_OUTBOX_EVENT_PREFIX_LENGTH = 'outbox:'.length;
const LOOT_OPERATION_ID_SAFE_LENGTH = DURABLE_OPERATION_ID_MAX_LENGTH - DURABLE_OUTBOX_EVENT_PREFIX_LENGTH;
const MAX_HERB_GROWTH_CATCH_UP_STEPS = 256;
const HERB_STALE_FUTURE_SCHEDULE_GRACE_TICKS = 300;
/**
 * buildIsContainerSourceId：构建并返回目标对象。
 * @param sourceId source ID。
 * @returns 无返回值，直接更新IContainer来源ID相关状态。
 */

export function buildIsContainerSourceId(sourceId) {
 return typeof sourceId === 'string' && sourceId.startsWith('container:');
}

export function resolveContainerRefreshAtTick(container, currentTick) {
 const fixedRefreshTicks = Number.isInteger(container.refreshTicks) && Number(container.refreshTicks) > 0
  ? Number(container.refreshTicks)
  : undefined;
 if (fixedRefreshTicks) {
  return currentTick + fixedRefreshTicks;
 }
 const refreshTicksMin = Number.isInteger(container.refreshTicksMin) && Number(container.refreshTicksMin) > 0
  ? Number(container.refreshTicksMin)
  : undefined;
 const refreshTicksMax = Number.isInteger(container.refreshTicksMax) && Number(container.refreshTicksMax) > 0
  ? Number(container.refreshTicksMax)
  : undefined;
 if (!refreshTicksMin && !refreshTicksMax) {
  return undefined;
 }
 const min = refreshTicksMin ?? refreshTicksMax ?? 1;
 const max = Math.max(min, refreshTicksMax ?? min);
 return currentTick + randomIntInclusive(min, max);
}

export function resolveContainerMaxRefreshTicks(container) {
 const fixedRefreshTicks = Number.isInteger(container?.refreshTicks) && Number(container.refreshTicks) > 0
  ? Number(container.refreshTicks)
  : undefined;
 if (fixedRefreshTicks) {
  return fixedRefreshTicks;
 }
 const refreshTicksMin = Number.isInteger(container?.refreshTicksMin) && Number(container.refreshTicksMin) > 0
  ? Number(container.refreshTicksMin)
  : undefined;
 const refreshTicksMax = Number.isInteger(container?.refreshTicksMax) && Number(container.refreshTicksMax) > 0
  ? Number(container.refreshTicksMax)
  : undefined;
 return Math.max(1, refreshTicksMax ?? refreshTicksMin ?? 1);
}

export function repairStaleHerbSchedule(container, state, currentTick) {
 if (container?.variant !== 'herb' || !Number.isFinite(Number(currentTick))) {
  return false;
 }
 if (typeof state?.refreshAtTick !== 'number' || !Number.isFinite(Number(state.refreshAtTick))) {
  return false;
 }
 const normalizedCurrentTick = Math.max(0, Math.trunc(Number(currentTick) || 0));
 const refreshAtTick = Math.max(0, Math.trunc(Number(state.refreshAtTick) || 0));
 const maxRefreshTicks = resolveContainerMaxRefreshTicks(container);
 const staleFutureThreshold = Math.max(
  maxRefreshTicks * 2,
  maxRefreshTicks + HERB_STALE_FUTURE_SCHEDULE_GRACE_TICKS,
 );
 if (refreshAtTick - normalizedCurrentTick <= staleFutureThreshold) {
  return false;
 }
 state.generatedAtTick = normalizedCurrentTick;
 state.refreshAtTick = resolveContainerRefreshAtTick(container, normalizedCurrentTick) ?? (normalizedCurrentTick + maxRefreshTicks);
 // 排程重建后旧生长进度（lastTick/remainingWork）已失效；不清理会让
 // herbGrowth.lastTick 停留在未来时钟上，导致 advanceHerbGrowthProgress 永久停摆。
 delete state.herbGrowth;
 clampLegacyHerbStock(state.entries, MAX_HERB_GROWTH_CATCH_UP_STEPS);
 return true;
}

export function clampLegacyHerbStock(entries, limit) {
 if (!Array.isArray(entries)) {
  return false;
 }
 const normalizedLimit = Math.max(1, Math.trunc(Number(limit) || 1));
 let remaining = normalizedLimit;
 let changed = false;
 for (let index = 0; index < entries.length; index += 1) {
  const entry = entries[index];
  const count = Math.max(0, Math.trunc(Number(entry?.item?.count) || 0));
  if (remaining <= 0) {
   if (count > 0) {
    entry.item.count = 0;
    changed = true;
   }
   continue;
  }
  if (count > remaining) {
   entry.item.count = remaining;
   changed = true;
   remaining = 0;
   continue;
  }
  remaining -= count;
 }
 for (let index = entries.length - 1; index >= 0; index -= 1) {
  if (Math.max(0, Math.trunc(Number(entries[index]?.item?.count) || 0)) <= 0) {
   entries.splice(index, 1);
   changed = true;
  }
 }
 return changed;
}

export function randomIntInclusive(min, max) {
 const normalizedMin = Math.max(1, Math.floor(Number(min) || 1));
 const normalizedMax = Math.max(normalizedMin, Math.floor(Number(max) || normalizedMin));
 return normalizedMin + Math.floor(Math.random() * ((normalizedMax - normalizedMin) + 1));
}

export function buildContainerMutationResult(error) {
 return {
  ok: false,
  error,
  messages: [],
  panelChanged: false,
 };
}

export function resolveActiveSearchPlayerId(activeSearch) {
 const playerId = typeof activeSearch?.playerId === 'string' ? activeSearch.playerId.trim() : '';
 return playerId || '';
}

export function resolveActiveSearchJobRunId(activeSearch) {
 return typeof activeSearch?.jobRunId === 'string' ? activeSearch.jobRunId.trim() : '';
}

export function resolveGatherJobRunId(job) {
 return typeof job?.jobRunId === 'string' ? job.jobRunId.trim() : '';
}

export function hasGatherJobRunIdConflict(activeSearch, job) {
 const activeSearchJobRunId = resolveActiveSearchJobRunId(activeSearch);
 const gatherJobRunId = resolveGatherJobRunId(job);
 return Boolean(activeSearchJobRunId && gatherJobRunId && activeSearchJobRunId !== gatherJobRunId);
}

export function hasGatherItemKeyConflict(activeSearch, job) {
 const activeSearchItemKey = typeof activeSearch?.itemKey === 'string' ? activeSearch.itemKey.trim() : '';
 const gatherJobItemKey = typeof job?.itemKey === 'string' ? job.itemKey.trim() : '';
 return Boolean(activeSearchItemKey && gatherJobItemKey && activeSearchItemKey !== gatherJobItemKey);
}

export function createGatherJobRunId() {
 return `job:gather:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeGatherJobRemainingTicks(job) {
 return Math.max(0, Math.trunc(Number(job?.workRemainingTicks ?? job?.remainingTicks) || 0));
}

export function isActiveGatherJobForTarget(player, job, instanceId, containerId) {
 if (!job || normalizeGatherJobRemainingTicks(job) <= 0) {
  return false;
 }
 const playerInstanceId = typeof player?.instanceId === 'string' ? player.instanceId.trim() : '';
 const jobInstanceId = typeof job?.instanceId === 'string' && job.instanceId.trim()
  ? job.instanceId.trim()
  : playerInstanceId;
 if (playerInstanceId !== instanceId || jobInstanceId !== instanceId) {
  return false;
 }
 const expectedSourceId = buildContainerSourceId(instanceId, containerId);
 const jobSourceId = typeof job?.sourceId === 'string' ? job.sourceId.trim() : '';
 const resourceNodeId = typeof job?.resourceNodeId === 'string' ? job.resourceNodeId.trim() : '';
 return jobSourceId === expectedSourceId || resourceNodeId === containerId;
}

export function isGatherJobExactSearchMatch(player, job, instanceId, containerId, activeSearch) {
 if (!isActiveGatherJobForTarget(player, job, instanceId, containerId)) {
  return false;
 }
 const searchRemainingTicks = Math.max(0, Math.trunc(Number(activeSearch?.remainingTicks) || 0));
 if (normalizeGatherJobRemainingTicks(job) !== searchRemainingTicks) {
  return false;
 }
 const searchItemKey = typeof activeSearch?.itemKey === 'string' ? activeSearch.itemKey.trim() : '';
 const jobItemKey = typeof job?.itemKey === 'string' ? job.itemKey.trim() : '';
 if (searchItemKey && jobItemKey && searchItemKey !== jobItemKey) {
  return false;
 }
 const searchJobRunId = resolveActiveSearchJobRunId(activeSearch);
 const gatherJobRunId = resolveGatherJobRunId(job);
 return !searchJobRunId || !gatherJobRunId || searchJobRunId === gatherJobRunId;
}

export function collectHydratedInstanceResidentPlayers(instance, playerRuntimeService) {
 if (typeof instance?.listPlayerIds !== 'function' || typeof playerRuntimeService?.getPlayer !== 'function') {
  return { complete: false, players: [] };
 }
 let playerIds;
 try {
  playerIds = instance.listPlayerIds();
 }
 catch (_error) {
  return { complete: false, players: [] };
 }
 if (!Array.isArray(playerIds)) {
  return { complete: false, players: [] };
 }
 const players = [];
 const seenPlayerIds = new Set();
 for (const rawPlayerId of playerIds) {
  const playerId = typeof rawPlayerId === 'string' ? rawPlayerId.trim() : '';
  if (!playerId || seenPlayerIds.has(playerId)) {
   continue;
  }
  seenPlayerIds.add(playerId);
  const player = playerRuntimeService.getPlayer(playerId);
  if (!player) {
   return { complete: false, players: [] };
  }
  players.push(player);
 }
 return { complete: true, players };
}

export function isInstancePlayerHydrationConfirmed(instanceId, deps) {
 if (typeof deps?.areInstancePlayersHydrated === 'function') {
  return deps.areInstancePlayersHydrated(instanceId) === true;
 }
 return deps?.startupBarrierService?.isTrafficOpen?.() === true;
}

export function isActiveSearchOwnedByPlayer(activeSearch, playerId) {
 if (!activeSearch) {
  return false;
 }
 const activeSearchPlayerId = resolveActiveSearchPlayerId(activeSearch);
 return !activeSearchPlayerId || activeSearchPlayerId === playerId;
}

export function buildContainerTickResult(panelChanged = false, messages = [], inventoryChanged = false, equipmentChanged = false, attrChanged = false, groundDrops = []) {
 return {
  ok: true,
  panelChanged,
  inventoryChanged,
  equipmentChanged,
  attrChanged,
  messages,
  groundDrops,
 };
}

export function buildGatherTechniqueNotice(kind, key, vars = undefined, pills = undefined) {
 return {
  kind,
  key,
  ...(vars ? { vars } : {}),
  ...(pills ? { pills } : {}),
 };
}

export function normalizeGatherResourceNodeName(value) {
 return typeof value === 'string' && value.trim() ? value.trim() : '采集目标';
}

export function resolveGatherInterruptReasonLabel(reason) {
 switch (reason) {
  case 'move':
   return '移动';
  case 'attack':
   return '出手';
  case 'cultivate':
   return '打坐';
  case 'defeat':
   return '身陨';
  default:
   return '手动取消';
 }
}

export function buildContainerTickSleepResult(sleepPayload, messages = []) {
 return {
  ...buildContainerTickResult(true, messages),
  sleepPayload,
 };
}

export function cloneContainerState(state) {
 return {
  sourceId: state.sourceId,
  containerId: state.containerId,
  generatedAtTick: state.generatedAtTick,
  refreshAtTick: state.refreshAtTick,
  entries: Array.isArray(state.entries)
   ? state.entries.map((entry) => ({
    item: entry?.item ? cloneContainerItem(entry.item) : entry.item,
    createdTick: entry?.createdTick,
    visible: entry?.visible,
   }))
   : [],
  activeSearch: state.activeSearch
   ? {
    playerId: resolveActiveSearchPlayerId(state.activeSearch) || undefined,
    jobRunId: resolveActiveSearchJobRunId(state.activeSearch) || undefined,
    itemKey: state.activeSearch.itemKey,
    totalTicks: state.activeSearch.totalTicks,
    remainingTicks: state.activeSearch.remainingTicks,
   }
   : undefined,
 };
}

export function removeSingleContainerRowItem(entries, row) {
 const target = row.entries.find((entry) => Math.max(0, Math.trunc(Number(entry?.item?.count) || 0)) > 0) ?? null;
 if (!target) {
  return null;
 }
 const harvestedItem = {
  ...target.item,
  count: 1,
 };
 target.item.count = Math.max(0, Math.trunc(Number(target.item.count) || 0)) - 1;
 if (target.item.count <= 0) {
  const index = entries.indexOf(target);
  if (index >= 0) {
   entries.splice(index, 1);
  }
 }
 return harvestedItem;
}

export function mergeContainerEntries(entries, nextEntries) {
 for (const nextEntry of nextEntries) {
  mergeItemStackEntryInto(entries, cloneContainerItem(nextEntry.item), {
   getItem: (entry: any) => entry.item,
   createEntry: (item) => ({
    item,
    createdTick: nextEntry.createdTick,
    visible: nextEntry.visible,
   }),
   onMerged: (entry: any) => {
    entry.createdTick = Math.min(entry.createdTick, nextEntry.createdTick);
   },
   canMergeEntry: (entry: any) => entry.visible === nextEntry.visible,
  });
 }
}

export function countContainerEntryItems(entries) {
 return entries.reduce((sum, entry) => sum + Math.max(0, Math.trunc(Number(entry?.item?.count) || 0)), 0);
}

export function touchRuntimeInstanceRevision(deps, instanceId, x = null, y = null) {
 const instance = typeof deps?.getInstanceRuntime === 'function'
  ? deps.getInstanceRuntime(instanceId)
  : null;
 if (!instance || !Number.isFinite(Number(instance.worldRevision))) {
  return;
 }
 if (Number.isFinite(Number(x)) && Number.isFinite(Number(y))) {
  instance.markAoiViewChangedAt?.(Math.trunc(Number(x)), Math.trunc(Number(y)));
 }
 else {
  instance.markAoiViewChangedGlobally?.();
 }
 instance.worldRevision += 1;
}

export function getContainerRespawnRemainingTicks(state, currentTick) {
 if (typeof state?.refreshAtTick !== 'number' || !Number.isFinite(Number(currentTick))) {
  return undefined;
 }
 return Math.max(0, Math.trunc(state.refreshAtTick) - Math.max(0, Math.trunc(Number(currentTick) || 0)));
}

export function buildNextInventorySnapshots(items) {
 return Array.isArray(items)
  ? items.map((entry) => ({
   itemId: typeof entry?.itemId === 'string' ? entry.itemId : '',
   count: Math.max(1, Math.trunc(Number(entry?.count ?? 1))),
   rawPayload: entry ? { ...entry } : {},
  })).filter((entry) => entry.itemId)
  : [];
}

export function buildGrantedInventorySnapshots(items) {
 return Array.isArray(items)
  ? items.map((item) => ({
   itemId: typeof item?.itemId === 'string' ? item.itemId : '',
   count: Math.max(1, Math.trunc(Number(item?.count ?? 1))),
   rawPayload: item ? { ...item } : {},
  })).filter((entry) => entry.itemId)
  : [];
}

export function cloneContainerEntryForRestore(entry) {
 return {
  ...entry,
  item: {
   ...(entry?.item ?? {}),
  },
 };
}

export function cloneContainerStateForRollback(state) {
 return {
  ...state,
  entries: Array.isArray(state?.entries)
   ? state.entries.map(cloneContainerEntryForRestore)
   : [],
  activeSearch: state?.activeSearch ? { ...state.activeSearch } : undefined,
 };
}

export function restoreContainerStateFromRollbackSnapshot(state, snapshot) {
 const restored = cloneContainerStateForRollback(snapshot);
 for (const key of Object.keys(state)) {
  if (!(key in restored)) {
   delete state[key];
  }
 }
 Object.assign(state, restored);
}

export function readInstancePersistenceDomainRevision(instance, domain) {
 if (typeof instance?.getPersistenceDomainRevision !== 'function') {
  return null;
 }
 const revision = Number(instance.getPersistenceDomainRevision(domain));
 return Number.isFinite(revision) ? Math.max(0, Math.trunc(revision)) : null;
}

export function restoreGroundSourceAfterFailedTake(
 instance,
 tileIndex,
 sourceItemsBefore,
 takenSourceItems,
 sourceRevisionAfterMutation,
 originalPosition,
) {
 const currentRevision = readInstancePersistenceDomainRevision(instance, 'ground_item');
 const normalizedTick = Math.max(0, Math.trunc(Number(instance?.tick ?? 0)));
 const hasExpiredTakenItem = (Array.isArray(takenSourceItems) ? takenSourceItems : []).some((item) => {
  const expiresAtTick = Number(item?.expiresAtTick);
  return Number.isFinite(expiresAtTick) && expiresAtTick > 0 && normalizedTick >= Math.trunc(expiresAtTick);
 });
 if (!hasExpiredTakenItem
  && sourceRevisionAfterMutation != null
  && currentRevision === sourceRevisionAfterMutation
  && typeof instance?.restoreGroundTileItemsForAssetMutation === 'function') {
  instance.restoreGroundTileItemsForAssetMutation(tileIndex, sourceItemsBefore);
  return;
 }
 if (typeof instance?.restoreGroundItemsAfterFailedAssetTake === 'function') {
  instance.restoreGroundItemsAfterFailedAssetTake(tileIndex, takenSourceItems);
  return;
 }
 for (const item of Array.isArray(takenSourceItems) ? takenSourceItems : []) {
  const x = Number.isFinite(Number(originalPosition?.x)) ? Math.trunc(Number(originalPosition.x)) : 0;
  const y = Number.isFinite(Number(originalPosition?.y)) ? Math.trunc(Number(originalPosition.y)) : 0;
  instance?.dropGroundItem?.(x, y, item);
 }
}

export function captureInventoryGrantRollbackState(player) {
 return {
  suppressImmediateDomainPersistence: player?.suppressImmediateDomainPersistence === true,
  inventoryItems: buildNextInventorySnapshots(player.inventory?.items ?? []),
  inventoryRevision: Math.max(0, Math.trunc(Number(player.inventory?.revision ?? 0))),
  persistentRevision: Math.max(0, Math.trunc(Number(player?.persistentRevision ?? 0))),
  selfRevision: Math.max(0, Math.trunc(Number(player?.selfRevision ?? 0))),
  dirtyDomains: player?.dirtyDomains instanceof Set ? Array.from(player.dirtyDomains) : [],
 };
}

export function restoreInventoryGrantRollbackState(player, rollbackState, playerRuntimeService) {
 player.inventory.items = Array.isArray(rollbackState.inventoryItems)
  ? rollbackState.inventoryItems.map((entry) => ({ ...(entry.rawPayload ?? entry), itemId: entry.itemId, count: entry.count }))
  : [];
 player.inventory.revision = rollbackState.inventoryRevision;
 player.persistentRevision = rollbackState.persistentRevision;
 player.selfRevision = rollbackState.selfRevision;
 player.suppressImmediateDomainPersistence = rollbackState.suppressImmediateDomainPersistence === true;
 player.dirtyDomains = new Set(Array.isArray(rollbackState.dirtyDomains) ? rollbackState.dirtyDomains : []);
 playerRuntimeService.playerProgressionService.refreshPreview(player);
}

export function resolveLootSourceOwnershipEpoch(instance) {
 const ownershipEpoch = Math.trunc(Number(instance?.meta?.ownershipEpoch));
 if (!Number.isSafeInteger(ownershipEpoch) || ownershipEpoch <= 0) {
  throw new BadRequestException('当前地图实例资产事务围栏暂不可用，请稍后重试');
 }
 return ownershipEpoch;
}

export function buildGroundSourceFlushLedgerPayload(instance, sourceTileIndex, sourceItems, flushLedgerVersion) {
 const delta = typeof instance?.buildGroundPersistenceDelta === 'function'
  ? instance.buildGroundPersistenceDelta()
  : null;
 let payload;
 if (delta?.fullReplace === true) {
  payload = {
   fullReplace: true,
   entries: typeof instance?.buildGroundPersistenceEntries === 'function'
    ? instance.buildGroundPersistenceEntries()
    : [],
  };
 }
 else {
  const tileIndices = new Set<number>(
   (Array.isArray(delta?.tileIndices) ? delta.tileIndices : [])
    .map((tileIndex) => Math.trunc(Number(tileIndex)))
    .filter((tileIndex) => Number.isSafeInteger(tileIndex) && tileIndex >= 0),
  );
  tileIndices.add(sourceTileIndex);
  const entriesByTileIndex = new Map<number, { tileIndex: number; items: any[] }>();
  for (const entry of Array.isArray(delta?.entries) ? delta.entries : []) {
   const tileIndex = Math.trunc(Number(entry?.tileIndex));
   if (Number.isSafeInteger(tileIndex) && tileIndex >= 0) {
    entriesByTileIndex.set(tileIndex, {
     tileIndex,
     items: Array.isArray(entry?.items) ? entry.items.map((item) => ({ ...item })) : [],
    });
   }
  }
  if (Array.isArray(sourceItems) && sourceItems.length > 0) {
   entriesByTileIndex.set(sourceTileIndex, {
    tileIndex: sourceTileIndex,
    items: sourceItems.map((item) => ({ ...item })),
   });
  }
  else {
   entriesByTileIndex.delete(sourceTileIndex);
  }
  payload = {
   fullReplace: false,
   tileIndices: Array.from(tileIndices).sort((left, right) => left - right),
   entries: Array.from(entriesByTileIndex.values()).sort((left, right) => left.tileIndex - right.tileIndex),
  };
 }
 return buildLootSourceFlushLedgerPayload(
  'ground_item',
  payload,
  flushLedgerVersion,
  readInstancePersistenceDomainRevision(instance, 'ground_item'),
 );
}

export function buildContainerSourceFlushLedgerPayload(
 instance,
 states,
 containerRevision,
 flushLedgerVersion,
) {
 return {
  ...buildLootSourceFlushLedgerPayload(
   'container_state',
   Array.isArray(states) ? states.map((state) => ({ ...state })) : [],
   flushLedgerVersion,
   readInstancePersistenceDomainRevision(instance, 'container_state'),
  ),
  containerRevision: Math.max(0, Math.trunc(Number(containerRevision) || 0)),
 };
}

export function buildLootSourceFlushLedgerPayload(domain, payload, flushLedgerVersion, domainRevision) {
 const normalizedDomainRevision = Math.max(0, Math.trunc(Number(domainRevision) || 0));
 return {
  kind: 'instance_domain_state',
  domain,
  payload,
  revision: flushLedgerVersion,
  domainRevisions: normalizedDomainRevision > 0 ? { [domain]: normalizedDomainRevision } : {},
  stagedDomains: [domain],
  stagingGenerationId: `durable-source:${domain}:${flushLedgerVersion}`,
 };
}

export async function resolveLootInstanceLeaseContext(instanceId, deps) {
 const normalizedInstanceId = typeof instanceId === 'string' ? instanceId.trim() : '';
 if (!normalizedInstanceId || !deps?.instanceCatalogService?.isEnabled?.()) {
  return null;
 }
 const row = await deps.instanceCatalogService.loadInstanceCatalog(normalizedInstanceId);
 if (!row) {
  return null;
 }
 const assignedNodeId = typeof row.assigned_node_id === 'string' ? row.assigned_node_id.trim() : '';
 const leaseToken = typeof row.lease_token === 'string' ? row.lease_token.trim() : '';
 const ownershipEpoch = Number.isFinite(Number(row.ownership_epoch)) ? Math.max(1, Math.trunc(Number(row.ownership_epoch))) : 0;
 if (!assignedNodeId || !leaseToken || ownershipEpoch <= 0) {
  return null;
 }
 return {
  assignedNodeId,
  leaseToken,
  ownershipEpoch,
 };
}

export function buildLootInventoryGrantOperationId(playerId, sourceType, sourceRefId, items) {
 const normalizedPlayerId = typeof playerId === 'string' && playerId.trim() ? playerId.trim() : 'player';
 const normalizedSourceType = typeof sourceType === 'string' && sourceType.trim() ? sourceType.trim() : 'inventory';
 const normalizedSourceRefId = typeof sourceRefId === 'string' && sourceRefId.trim() ? sourceRefId.trim() : 'source';
 const normalizedItemSignature = Array.isArray(items)
  ? items.map((item) => {
   const itemId = typeof item?.itemId === 'string' && item.itemId.trim() ? item.itemId.trim() : 'item';
   const count = Math.max(1, Math.trunc(Number(item?.count ?? 1)));
   const itemInstanceId = typeof item?.itemInstanceId === 'string' && item.itemInstanceId.trim()
    ? item.itemInstanceId.trim()
    : 'no-instance';
   return `${itemId}:x${count}:${itemInstanceId}`;
  }).join('|')
  : 'items';
 return compactLootOperationId(`op:${normalizedPlayerId}:${normalizedSourceType}:${normalizedSourceRefId}:${normalizedItemSignature}`);
}

export function parseGroundLootSourceTileIndex(sourceId) {
 if (typeof sourceId !== 'string' || !sourceId.startsWith('g:')) {
  return null;
 }
 const tileIndex = Number(sourceId.slice(2));
 return Number.isInteger(tileIndex) && tileIndex >= 0 ? tileIndex : null;
}

export function compactLootOperationId(operationId) {
 if (operationId.length <= LOOT_OPERATION_ID_SAFE_LENGTH) {
  return operationId;
 }
 const digest = createHash('sha256').update(operationId).digest('hex').slice(0, 24);
 const suffix = `:h:${digest}`;
 return `${operationId.slice(0, LOOT_OPERATION_ID_SAFE_LENGTH - suffix.length)}${suffix}`;
}

/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
import { Inject, Injectable, BadRequestException, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import {
    isDurableCommitOutcomeUnknownError,
    reconcileDurableInventoryCommitOutcome,
} from './durable-source-asset-reconciliation.helpers';
import { buildStructuredNotice } from './structured-notice.helpers';
import * as world_runtime_normalization_helpers_1 from './world-runtime.normalization.helpers';

const { formatItemStackLabel } = world_runtime_normalization_helpers_1;

/** world-runtime item ground orchestration：承接丢弃/拾取地面与容器物品链路。 */
@Injectable()
export class WorldRuntimeItemGroundService {
    logger = new Logger(WorldRuntimeItemGroundService.name);
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Inject(PlayerRuntimeService) playerRuntimeService: any,
    ) {
        this.playerRuntimeService = playerRuntimeService;
    }
    /**
 * dispatchDropItem：判断Drop道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param itemInstanceId 物品实例 ID。
 * @param count 数量。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Drop道具相关状态。
 */

    async dispatchDropItem(playerId, itemInstanceId, count, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
        return this.runExclusivePlayerAssetMutation(playerId, async () => {
            const location = deps.getPlayerLocationOrThrow(playerId);
            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
            const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
            const tileIndex = resolveGroundDropTileIndex(instance, player.x, player.y);
            const sourceId = tileIndex >= 0 ? `g:${tileIndex}` : `coord:${player.x}:${player.y}`;
            return this.runExclusiveGroundSourceMutation(location.instanceId, sourceId, deps, async () => {
            const rollback = captureGroundDropRollbackState(player, instance, tileIndex);
            const droppedGroundItems = [];
            let sourceRevisionAfterMutation = null;
            const release = this.acquireGroundPersistenceHold(instance, deps);
            player.suppressImmediateDomainPersistence = true;
            try {
                const item = this.playerRuntimeService.splitInventoryItemByInstanceId(playerId, itemInstanceId, count);
                const displayItem = normalizeGroundNoticeItem(this.playerRuntimeService, item);
                const pile = instance.dropGroundItem(player.x, player.y, displayItem);
                if (!pile) {
                    throw new BadRequestException(`无法在 ${player.x},${player.y} 掉落物品`);
                }
                droppedGroundItems.push({ ...displayItem });
                sourceRevisionAfterMutation = readInstancePersistenceDomainRevision(instance, 'ground_item');
                const durableCommit = this.commitGroundDropDurably({
                    playerId,
                    player,
                    instance,
                    instanceId: location.instanceId,
                    sourceId: pile.sourceId,
                    itemInstanceIds: [itemInstanceId],
                    affectedItems: [item],
                    rollbackInventoryRevision: rollback.inventoryRevision,
                    deps,
                });
                if (durableCommit) {
                    await durableCommit;
                }
                deps.refreshQuestStates(playerId);
                const itemLabel = formatItemStackLabel(displayItem);
                const n = buildStructuredNotice('info', 'notice.item.dropped', `放下 ${itemLabel}`, {
                    vars: { itemName: itemLabel },
                    pills: [{ key: 'itemName', style: 'target' }],
                });
                deps.queuePlayerNotice(playerId, n.text, n.kind, undefined, undefined, n.structured);
            }
            catch (error) {
                if (isDurableCommitOutcomeUnknownError(error)) {
                    this.logger.error(`地面丢弃事务结果仍未确认，保留运行态与 dirty 等待后续 flush：playerId=${playerId} instanceId=${location.instanceId}`);
                    throw error;
                }
                restoreGroundDropRollbackState(
                    playerId,
                    player,
                    instance,
                    tileIndex,
                    rollback,
                    droppedGroundItems,
                    sourceRevisionAfterMutation,
                    this.playerRuntimeService,
                );
                throw error;
            }
            finally {
                player.suppressImmediateDomainPersistence = rollback.suppressImmediateDomainPersistence;
                release();
            }
            });
        });
    }
    async dispatchBulkDropItems(playerId, itemInstanceIds, deps) {
        return this.runExclusivePlayerAssetMutation(playerId, async () => {
            const location = deps.getPlayerLocationOrThrow(playerId);
            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
            const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
            const normalizedIds = normalizeBulkDropItemInstanceIds(itemInstanceIds);
            if (normalizedIds.length === 0) {
                throw new BadRequestException('请选择要丢弃的物品。');
            }
            const tileIndex = resolveGroundDropTileIndex(instance, player.x, player.y);
            const groundSourceId = tileIndex >= 0 ? `g:${tileIndex}` : `coord:${player.x}:${player.y}`;
            return this.runExclusiveGroundSourceMutation(location.instanceId, groundSourceId, deps, async () => {
            const rollback = captureGroundDropRollbackState(player, instance, tileIndex);
            const droppedGroundItems = [];
            let sourceRevisionAfterMutation = null;
            const release = this.acquireGroundPersistenceHold(instance, deps);
            player.suppressImmediateDomainPersistence = true;
            try {
                let droppedStacks = 0;
                let droppedCount = 0;
                const affectedItems = [];
                let sourceId = '';
                for (const itemInstanceId of normalizedIds) {
                    const current = this.playerRuntimeService.peekInventoryItemByInstanceId(playerId, itemInstanceId);
                    if (!current) {
                        continue;
                    }
                    const count = Math.max(1, Math.trunc(Number(current.count ?? 1) || 1));
                    const item = this.playerRuntimeService.splitInventoryItemByInstanceId(playerId, itemInstanceId, count);
                    const displayItem = normalizeGroundNoticeItem(this.playerRuntimeService, item);
                    const pile = instance.dropGroundItem(player.x, player.y, displayItem);
                    if (!pile) {
                        throw new BadRequestException(`无法在 ${player.x},${player.y} 掉落物品`);
                    }
                    sourceId = pile.sourceId;
                    affectedItems.push(item);
                    droppedGroundItems.push({ ...displayItem });
                    droppedStacks += 1;
                    droppedCount += Math.max(1, Math.trunc(Number(displayItem.count ?? 1) || 1));
                }
                if (droppedStacks === 0) {
                    throw new BadRequestException('选中的物品已不在背包中。');
                }
                sourceRevisionAfterMutation = readInstancePersistenceDomainRevision(instance, 'ground_item');
                const durableCommit = this.commitGroundDropDurably({
                    playerId,
                    player,
                    instance,
                    instanceId: location.instanceId,
                    sourceId,
                    itemInstanceIds: normalizedIds,
                    affectedItems,
                    rollbackInventoryRevision: rollback.inventoryRevision,
                    deps,
                });
                if (durableCommit) {
                    await durableCommit;
                }
                deps.refreshQuestStates(playerId);
                const n = buildStructuredNotice('info', 'notice.item.bulk_dropped', `已丢弃 ${droppedStacks} 组物品`, {
                    vars: { stackCount: String(droppedStacks), itemCount: String(droppedCount) },
                    pills: [{ key: 'stackCount', style: 'target' }],
                });
                deps.queuePlayerNotice(playerId, n.text, n.kind, undefined, undefined, n.structured);
            }
            catch (error) {
                if (isDurableCommitOutcomeUnknownError(error)) {
                    this.logger.error(`批量地面丢弃事务结果仍未确认，保留运行态与 dirty 等待后续 flush：playerId=${playerId} instanceId=${location.instanceId}`);
                    throw error;
                }
                restoreGroundDropRollbackState(
                    playerId,
                    player,
                    instance,
                    tileIndex,
                    rollback,
                    droppedGroundItems,
                    sourceRevisionAfterMutation,
                    this.playerRuntimeService,
                );
                throw error;
            }
            finally {
                player.suppressImmediateDomainPersistence = rollback.suppressImmediateDomainPersistence;
                release();
            }
            });
        });
    }

    async runExclusivePlayerAssetMutation(playerId, action) {
        const coordinator = this.playerRuntimeService?.runExclusiveAssetMutation;
        if (typeof coordinator !== 'function') {
            return action();
        }
        return coordinator.call(this.playerRuntimeService, [playerId], action);
    }

    async runExclusiveGroundSourceMutation(instanceId, sourceId, deps, action) {
        const instance = typeof deps?.getInstanceRuntime === 'function'
            ? deps.getInstanceRuntime(instanceId)
            : null;
        const runDomainMutation = () => {
            const domainCoordinator = instance?.runExclusivePersistenceDomainMutation;
            if (typeof domainCoordinator !== 'function') {
                return action();
            }
            return domainCoordinator.call(instance, ['ground_item'], action);
        };
        const sourceCoordinator = deps?.worldRuntimeLootContainerService?.runExclusiveLootSourceMutation;
        if (typeof sourceCoordinator !== 'function') {
            return runDomainMutation();
        }
        return sourceCoordinator.call(
            deps.worldRuntimeLootContainerService,
            instanceId,
            sourceId,
            runDomainMutation,
        );
    }

    acquireGroundPersistenceHold(instance, deps) {
        if (!deps?.durableOperationService?.isEnabled?.() || typeof instance?.acquirePersistenceDomainHold !== 'function') {
            return () => undefined;
        }
        return instance.acquirePersistenceDomainHold('ground_item');
    }

    commitGroundDropDurably(input) {
        const durable = input.deps?.durableOperationService;
        if (!durable?.isEnabled?.() || typeof durable.grantInventoryItems !== 'function') {
            return null;
        }
        return this.commitGroundDropWithDurableService(input, durable);
    }

    async commitGroundDropWithDurableService(input, durable) {
        await input.deps.worldRuntimeLootContainerService?.syncCurrentPresenceFence?.(input.playerId);
        const runtimeOwnerId = typeof input.player?.runtimeOwnerId === 'string' ? input.player.runtimeOwnerId.trim() : '';
        const sessionEpoch = Number.isFinite(Number(input.player?.sessionEpoch))
            ? Math.max(1, Math.trunc(Number(input.player.sessionEpoch)))
            : 0;
        if (!runtimeOwnerId || sessionEpoch <= 0) {
            throw new Error('ground_drop_session_fence_missing');
        }
        const lease = await resolveGroundDropInstanceLease(input.instanceId, input.deps);
        const sourceMutation = input.deps.worldRuntimeLootContainerService?.buildDurableGroundSourceMutation?.(
            input.instance,
            input.instanceId,
            input.sourceId,
        );
        if (!sourceMutation) {
            throw new Error('ground_drop_source_mutation_unavailable');
        }
        const operationSignature = createHash('sha256')
            .update(`${input.itemInstanceIds.join('|')}:${input.rollbackInventoryRevision}`)
            .digest('hex')
            .slice(0, 24);
        const operationId = `ground-drop:${input.playerId}:${input.instanceId}:${operationSignature}`;
        const durableInput = {
            operationId,
            playerId: input.playerId,
            expectedRuntimeOwnerId: runtimeOwnerId,
            expectedSessionEpoch: sessionEpoch,
            expectedInstanceId: input.instanceId,
            expectedAssignedNodeId: lease?.assignedNodeId ?? null,
            expectedOwnershipEpoch: lease?.ownershipEpoch ?? null,
            sourceType: 'ground_drop',
            sourceRefId: `${input.sourceId}:${operationSignature}`,
            inventoryAction: 'remove',
            sourceMutation,
            grantedItems: buildGroundDropInventorySnapshots(input.affectedItems),
            nextInventoryItems: buildGroundDropInventorySnapshots(input.player.inventory?.items ?? []),
        };
        try {
            await durable.grantInventoryItems(durableInput);
        }
        catch (error) {
            if (!isDurableCommitOutcomeUnknownError(error)) {
                throw error;
            }
            const reconciled = await this.reconcileGroundDropCommitOutcome(
                input.playerId,
                durable,
                durableInput,
            );
            if (!reconciled) {
                throw error;
            }
        }
    }

    async reconcileGroundDropCommitOutcome(playerId, durable, durableInput) {
        const operationId = durableInput.operationId;
        const result = await reconcileDurableInventoryCommitOutcome(durable, durableInput);
        if (result.outcome === 'failed') {
            throw result.error;
        }
        if (result.outcome === 'unknown') {
            this.logger.error(`地面丢弃 operation 仍无法确认，保留 dirty 等待后续 flush：operationId=${operationId}`);
            return false;
        }
        this.playerRuntimeService.replaceInventoryItems(playerId, result.inventoryItems);
        this.logger.warn(result.replayReadFailed
            ? `地面丢弃已确认提交，但 operation 明细暂不可读，已按同一请求后态收敛：operationId=${operationId}`
            : `地面丢弃 COMMIT 回包不确定，已按 durable operation 回读收敛：operationId=${operationId}`);
        return true;
    }
    /**
 * dispatchTakeGround：判断Take地面是否满足条件。
 * @param playerId 玩家 ID。
 * @param sourceId source ID。
 * @param itemKey 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新TakeGround相关状态。
 */

    async dispatchTakeGround(playerId, sourceId, itemKey, deps) {
        return deps.worldRuntimeLootContainerService.dispatchTakeGround(playerId, sourceId, itemKey, deps);
    }
    /**
 * dispatchTakeGroundAll：判断Take地面All是否满足条件。
 * @param playerId 玩家 ID。
 * @param sourceId source ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新TakeGroundAll相关状态。
 */

    async dispatchTakeGroundAll(playerId, sourceId, deps) {
        return deps.worldRuntimeLootContainerService.dispatchTakeGroundAll(playerId, sourceId, deps);
    }
    /**
 * spawnGroundItem：执行spawn地面道具相关逻辑。
 * @param instance 地图实例。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param item 道具。
 * @returns 无返回值，直接更新spawnGround道具相关状态。
 */

    spawnGroundItem(instance, x, y, item) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const pile = instance.dropGroundItem(x, y, item);
        if (!pile) {
            throw new BadRequestException(`无法在 ${x},${y} 生成掉落`);
        }
    }
};

function normalizeGroundNoticeItem(playerRuntimeService, item) {
    const normalized = playerRuntimeService?.contentTemplateRepository?.normalizeItem?.(item);
    return normalized && typeof normalized === 'object' ? normalized : item;
}

function normalizeBulkDropItemInstanceIds(input) {
    if (!Array.isArray(input)) {
        return [];
    }
    const result = [];
    const seen = new Set();
    for (const entry of input) {
        const itemInstanceId = typeof entry === 'string' ? entry.trim() : '';
        if (!itemInstanceId || seen.has(itemInstanceId)) {
            continue;
        }
        seen.add(itemInstanceId);
        result.push(itemInstanceId);
    }
    return result;
}

function captureGroundDropRollbackState(player, instance, tileIndex) {
    return {
        suppressImmediateDomainPersistence: player?.suppressImmediateDomainPersistence === true,
        inventoryItems: Array.isArray(player?.inventory?.items)
            ? player.inventory.items.map((item) => ({ ...item }))
            : [],
        inventoryRevision: Math.max(0, Math.trunc(Number(player?.inventory?.revision ?? 0))),
        persistentRevision: Math.max(0, Math.trunc(Number(player?.persistentRevision ?? 0))),
        selfRevision: Math.max(0, Math.trunc(Number(player?.selfRevision ?? 0))),
        dirtyDomains: player?.dirtyDomains instanceof Set ? Array.from(player.dirtyDomains) : [],
        groundItemsBefore: typeof instance?.captureGroundTileItemsForAssetMutation === 'function'
            ? instance.captureGroundTileItemsForAssetMutation(tileIndex)
            : [],
    };
}

function restoreGroundDropRollbackState(
    playerId,
    player,
    instance,
    tileIndex,
    rollback,
    droppedGroundItems,
    sourceRevisionAfterMutation,
    playerRuntimeService,
) {
    playerRuntimeService.replaceInventoryItems(playerId, rollback.inventoryItems);
    player.inventory.revision = rollback.inventoryRevision;
    player.persistentRevision = rollback.persistentRevision;
    player.selfRevision = rollback.selfRevision;
    player.dirtyDomains = new Set(rollback.dirtyDomains);
    const currentSourceRevision = readInstancePersistenceDomainRevision(instance, 'ground_item');
    if (sourceRevisionAfterMutation != null
        && currentSourceRevision === sourceRevisionAfterMutation
        && typeof instance?.restoreGroundTileItemsForAssetMutation === 'function') {
        instance.restoreGroundTileItemsForAssetMutation(tileIndex, rollback.groundItemsBefore);
        return;
    }
    if (typeof instance?.removeGroundItemsAfterFailedAssetDrop === 'function') {
        instance.removeGroundItemsAfterFailedAssetDrop(tileIndex, droppedGroundItems);
        return;
    }
    if (currentSourceRevision == null && typeof instance?.restoreGroundTileItemsForAssetMutation === 'function') {
        instance.restoreGroundTileItemsForAssetMutation(tileIndex, rollback.groundItemsBefore);
    }
}

function readInstancePersistenceDomainRevision(instance, domain) {
    if (typeof instance?.getPersistenceDomainRevision !== 'function') {
        return null;
    }
    const revision = Number(instance.getPersistenceDomainRevision(domain));
    return Number.isFinite(revision) ? Math.max(0, Math.trunc(revision)) : null;
}


function buildGroundDropInventorySnapshots(items) {
    return (Array.isArray(items) ? items : [])
        .map((item) => ({
            itemId: typeof item?.itemId === 'string' ? item.itemId : '',
            count: Math.max(1, Math.trunc(Number(item?.count ?? 1))),
            rawPayload: item && typeof item === 'object' ? { ...item } : {},
        }))
        .filter((item) => item.itemId);
}

async function resolveGroundDropInstanceLease(instanceId, deps) {
    if (!deps?.instanceCatalogService?.isEnabled?.()) {
        return null;
    }
    const row = await deps.instanceCatalogService.loadInstanceCatalog(instanceId);
    const assignedNodeId = typeof row?.assigned_node_id === 'string' ? row.assigned_node_id.trim() : '';
    const ownershipEpoch = Number.isFinite(Number(row?.ownership_epoch))
        ? Math.max(1, Math.trunc(Number(row.ownership_epoch)))
        : 0;
    return assignedNodeId && ownershipEpoch > 0
        ? { assignedNodeId, ownershipEpoch }
        : null;
}

function resolveGroundDropTileIndex(instance, x, y) {
    if (typeof instance?.toTileIndex === 'function') {
        const tileIndex = Number(instance.toTileIndex(x, y));
        return Number.isInteger(tileIndex) && tileIndex >= 0 ? tileIndex : -1;
    }
    const width = Number(instance?.template?.width);
    const normalizedX = Math.trunc(Number(x));
    const normalizedY = Math.trunc(Number(y));
    if (Number.isInteger(width) && width > 0 && normalizedX >= 0 && normalizedY >= 0) {
        return normalizedY * width + normalizedX;
    }
    return -1;
}

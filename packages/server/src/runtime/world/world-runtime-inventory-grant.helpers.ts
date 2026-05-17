
/**
 * 持久化背包授予辅助函数
 * 提供 durable inventory grant 的前置检查、快照构建、乐观执行和回滚恢复
 */
export function canUseDurableInventoryGrant(player, durableOperationService) {
    const runtimeOwnerId = typeof player?.runtimeOwnerId === 'string' ? player.runtimeOwnerId.trim() : '';
    const sessionEpoch = Number.isFinite(player?.sessionEpoch) ? Math.max(1, Math.trunc(Number(player.sessionEpoch))) : 0;
    return Boolean(durableOperationService?.isEnabled?.() && typeof durableOperationService?.grantInventoryItems === 'function' && runtimeOwnerId && sessionEpoch > 0);
}

/** 解析实例 lease 上下文，用于 durable grant 的节点归属校验 */
export async function resolveInventoryGrantLeaseContext(instanceId, instanceCatalogService) {
    const normalizedInstanceId = typeof instanceId === 'string' ? instanceId.trim() : '';
    if (!normalizedInstanceId || !instanceCatalogService?.isEnabled?.()) {
        return null;
    }
    const row = await instanceCatalogService.loadInstanceCatalog(normalizedInstanceId);
    if (!row) {
        return null;
    }
    const assignedNodeId = typeof row.assigned_node_id === 'string' ? row.assigned_node_id.trim() : '';
    const ownershipEpoch = Number.isFinite(Number(row.ownership_epoch)) ? Math.max(1, Math.trunc(Number(row.ownership_epoch))) : 0;
    if (!assignedNodeId || ownershipEpoch <= 0) {
        return null;
    }
    return {
        assignedNodeId,
        ownershipEpoch,
    };
}

export function buildNextInventorySnapshots(items) {
    return Array.isArray(items)
        ? items.map((entry) => ({
            itemId: typeof entry?.itemId === 'string' ? entry.itemId : '',
            itemInstanceId: typeof entry?.itemInstanceId === 'string' && entry.itemInstanceId.length > 0
                ? entry.itemInstanceId
                : undefined,
            count: Math.max(1, Math.trunc(Number(entry?.count ?? 1))),
            rawPayload: entry ? { ...entry } : {},
        })).filter((entry) => entry.itemId)
        : [];
}

export function buildGrantedInventorySnapshots(items) {
    return Array.isArray(items)
        ? items.map((item) => ({
            itemId: typeof item?.itemId === 'string' ? item.itemId : '',
            itemInstanceId: typeof item?.itemInstanceId === 'string' && item.itemInstanceId.length > 0
                ? item.itemInstanceId
                : undefined,
            count: Math.max(1, Math.trunc(Number(item?.count ?? 1))),
            rawPayload: item ? { ...item } : {},
        })).filter((entry) => entry.itemId)
        : [];
}

/** 捕获授予前的背包快照，用于失败时回滚 */
export function captureInventoryGrantRollbackState(player) {
    return {
        suppressImmediateDomainPersistence: player?.suppressImmediateDomainPersistence === true,
        inventoryItems: buildNextInventorySnapshots(player?.inventory?.items ?? []),
        inventoryRevision: Math.max(0, Math.trunc(Number(player?.inventory?.revision ?? 0))),
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

/** 执行持久化背包授予：乐观变更 → 持久化提交 → 失败回滚 */
export async function applyDurableInventoryGrant(input) {
    const rollbackState = captureInventoryGrantRollbackState(input.player);
    input.player.suppressImmediateDomainPersistence = true;
    try {
        await input.mutateRuntime();
        const leaseContext = await resolveInventoryGrantLeaseContext(input.player.instanceId, input.instanceCatalogService);
        if (typeof input.player?.instanceId === 'string' && input.player.instanceId.trim() && !leaseContext) {
            throw new Error(`inventory_grant_lease_context_required:${input.player.instanceId}`);
        }
        await input.durableOperationService.grantInventoryItems({
            operationId: input.operationId,
            playerId: input.playerId,
            expectedRuntimeOwnerId: input.player.runtimeOwnerId,
            expectedSessionEpoch: Math.max(1, Math.trunc(Number(input.player.sessionEpoch ?? 1))),
            expectedInstanceId: input.player.instanceId ?? null,
            expectedAssignedNodeId: leaseContext?.assignedNodeId ?? null,
            expectedOwnershipEpoch: leaseContext?.ownershipEpoch ?? null,
            sourceType: input.sourceType,
            sourceRefId: input.sourceRefId ?? null,
            grantedItems: buildGrantedInventorySnapshots(input.grantedItems),
            nextInventoryItems: buildNextInventorySnapshots(input.player.inventory?.items ?? []),
        });
    }
    catch (error) {
        restoreInventoryGrantRollbackState(input.player, rollbackState, input.playerRuntimeService);
        if (typeof input.onFailure === 'function') {
            await input.onFailure(error);
        }
        if (input.swallowFailure === true) {
            return false;
        }
        throw error;
    }
    finally {
        input.player.suppressImmediateDomainPersistence = rollbackState.suppressImmediateDomainPersistence === true;
    }
    if (typeof input.afterCommit === 'function') {
        await input.afterCommit();
    }
    return true;
}

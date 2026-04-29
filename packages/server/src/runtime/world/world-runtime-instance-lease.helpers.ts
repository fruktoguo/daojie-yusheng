// @ts-nocheck
"use strict";

import { normalizeRuntimeInstancePersistentPolicy, parseRuntimeInstanceDescriptor } from "./world-runtime.normalization.helpers";

const INSTANCE_LEASE_TTL_MS = 45_000;
const INSTANCE_LEASE_RENEW_SKEW_MS = 5_000;
const LONG_LIVED_INSTANCE_TTL_MS = 24 * 60 * 60 * 1000;

export function syncManagedInstanceRegistration(runtime, instanceId, instance) {
  if (!runtime.instanceCatalogService?.isEnabled?.()) {
    return;
  }
  const templateId = instance?.template?.id ?? instance?.templateId ?? '';
  const kind = typeof instance?.kind === 'string' && instance.kind.trim() ? instance.kind.trim() : 'public';
  const persistentPolicy = normalizeRuntimeInstancePersistentPolicy(
    instance?.meta?.persistentPolicy
    ?? (instance?.meta?.persistent === true || instance?.persistent === true ? 'persistent' : 'ephemeral'),
  );
  void (async () => {
    try {
      await runtime.instanceCatalogService.upsertInstanceCatalog({
        instanceId,
        templateId,
        instanceType: kind,
        persistentPolicy,
        ownerPlayerId: instance?.meta?.ownerPlayerId ?? null,
        ownerSectId: instance?.meta?.ownerSectId ?? null,
        partyId: instance?.meta?.partyId ?? null,
        lineId: instance?.meta?.lineId ?? null,
        status: instance?.meta?.status ?? 'active',
        runtimeStatus: instance?.meta?.runtimeStatus ?? 'running',
        assignedNodeId: instance?.meta?.assignedNodeId ?? null,
        leaseToken: instance?.meta?.leaseToken ?? null,
        leaseExpireAt: instance?.meta?.leaseExpireAt ?? null,
        ownershipEpoch: instance?.meta?.ownershipEpoch ?? 0,
        clusterId: instance?.meta?.clusterId ?? null,
        shardKey: instance?.meta?.shardKey ?? instanceId,
        routeDomain: instance?.meta?.routeDomain ?? null,
        destroyAt: instance?.meta?.destroyAt ?? null,
        lastActiveAt: instance?.meta?.lastActiveAt ?? null,
        lastPersistedAt: instance?.meta?.lastPersistedAt ?? null,
        preserveExistingLease: persistentPolicy === 'persistent' || persistentPolicy === 'long_lived',
      });
    } catch (error) {
      runtime.logger.warn(`实例目录同步失败：${instanceId} ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    await syncInstanceLease(runtime, instanceId);
  })().catch((error) => {
    runtime.logger.warn(`实例 lease 同步失败：${instanceId} ${error instanceof Error ? error.message : String(error)}`);
  });
}

export function isInstanceLeaseWritable(runtime, instance) {
  if (!instance || instance?.meta?.runtimeStatus === 'fenced') {
    return false;
  }
  if (!runtime.instanceCatalogService?.isEnabled?.()) {
    return true;
  }
  const assignedNodeId = typeof instance?.meta?.assignedNodeId === 'string' ? instance.meta.assignedNodeId.trim() : '';
  const leaseToken = typeof instance?.meta?.leaseToken === 'string' ? instance.meta.leaseToken.trim() : '';
  if (!assignedNodeId || !leaseToken) {
    return true;
  }
  if (assignedNodeId !== runtime.nodeRegistryService.getNodeId()) {
    return false;
  }
  const leaseExpireAt = instance?.meta?.leaseExpireAt ? new Date(instance.meta.leaseExpireAt).getTime() : 0;
  return leaseExpireAt > Date.now() - INSTANCE_LEASE_RENEW_SKEW_MS;
}

export function fenceInstanceRuntime(runtime, instanceId, reason = 'lease_lost') {
  const instance = runtime.getInstanceRuntime(instanceId);
  if (!instance || instance?.meta?.runtimeStatus === 'fenced') {
    return;
  }
  instance.meta.runtimeStatus = 'fenced';
  instance.meta.status = 'lease_lost';
  instance.meta.leaseToken = null;
  instance.meta.leaseExpireAt = null;
  const activePlayers = typeof instance.listPlayerIds === 'function' ? instance.listPlayerIds() : [];
  if (!Array.isArray(activePlayers) || activePlayers.length === 0) {
    runtime.worldRuntimeInstanceStateService.deleteInstanceRuntime(instanceId);
    runtime.worldRuntimeTickProgressService.clearInstance(instanceId);
    runtime.worldRuntimeLootContainerService.removeInstanceState(instanceId);
    runtime.logger.warn(`实例 ${instanceId} 已因 lease fencing 被卸载：${reason}`);
    return;
  }
  runtime.logger.error(`实例 ${instanceId} lease fencing 命中但仍有在线玩家，已停止写入：${reason} players=${activePlayers.join(',')}`);
}

export async function destroyManagedInstance(runtime, instanceId, reason = 'scheduled_destroy') {
  const instance = runtime.getInstanceRuntime(instanceId);
  if (!instance) {
    return { ok: false, reason: 'instance_not_found' };
  }
  const activePlayers = typeof instance.listPlayerIds === 'function' ? instance.listPlayerIds() : [];
  if (Array.isArray(activePlayers) && activePlayers.length > 0) {
    return { ok: false, reason: 'players_present', players: activePlayers };
  }
  instance.meta.runtimeStatus = 'stopped';
  instance.meta.status = 'destroyed';
  instance.meta.leaseToken = null;
  instance.meta.leaseExpireAt = null;
  instance.meta.destroyAt = instance.meta.destroyAt ?? new Date().toISOString();
  runtime.worldRuntimeInstanceStateService.deleteInstanceRuntime(instanceId);
  runtime.worldRuntimeTickProgressService.clearInstance(instanceId);
  runtime.worldRuntimeLootContainerService.removeInstanceState(instanceId);
  if (runtime.instanceCatalogService?.isEnabled?.()) {
    await runtime.instanceCatalogService.upsertInstanceCatalog({
      instanceId,
      templateId: instance?.template?.id ?? instance?.templateId ?? '',
      instanceType: typeof instance?.kind === 'string' ? instance.kind : 'public',
      persistentPolicy: typeof instance?.meta?.persistentPolicy === 'string' ? instance.meta.persistentPolicy : 'persistent',
      ownerPlayerId: instance?.meta?.ownerPlayerId ?? null,
      ownerSectId: instance?.meta?.ownerSectId ?? null,
      partyId: instance?.meta?.partyId ?? null,
      lineId: instance?.meta?.lineId ?? null,
      status: 'destroyed',
      runtimeStatus: 'stopped',
      assignedNodeId: null,
      leaseToken: null,
      leaseExpireAt: null,
      ownershipEpoch: instance?.meta?.ownershipEpoch ?? 0,
      clusterId: instance?.meta?.clusterId ?? null,
      shardKey: instance?.meta?.shardKey ?? instanceId,
      routeDomain: instance?.meta?.routeDomain ?? null,
      destroyAt: instance?.meta?.destroyAt ?? new Date().toISOString(),
      lastActiveAt: instance?.meta?.lastActiveAt ?? null,
      lastPersistedAt: instance?.meta?.lastPersistedAt ?? null,
    });
  }
  runtime.logger.log(`实例 ${instanceId} 已按生命周期销毁：${reason}`);
  return { ok: true };
}

export function unfreezeInstanceWriting(runtime, instanceId) {
  const instance = runtime.getInstanceRuntime(instanceId);
  if (!instance) {
    return { ok: false, reason: 'instance_not_found' };
  }
  const nodeId = runtime.nodeRegistryService.getNodeId();
  const assignedNodeId = typeof instance.meta.assignedNodeId === 'string' ? instance.meta.assignedNodeId.trim() : '';
  const leaseToken = typeof instance.meta.leaseToken === 'string' ? instance.meta.leaseToken.trim() : '';
  if (!assignedNodeId || !leaseToken) {
    return { ok: false, reason: 'lease_missing' };
  }
  if (assignedNodeId !== nodeId || !isInstanceLeaseWritable(runtime, instance)) {
    return { ok: false, reason: 'lease_not_local' };
  }
  instance.meta.runtimeStatus = 'leased';
  instance.meta.status = 'active';
  return { ok: true };
}

export async function syncInstanceLease(runtime, instanceId) {
  if (!runtime.instanceCatalogService?.isEnabled?.()) {
    return;
  }
  const instance = runtime.getInstanceRuntime(instanceId);
  if (!instance) {
    return;
  }
  const nodeId = runtime.nodeRegistryService.getNodeId();
  const leaseToken = `${nodeId}:${instanceId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  const leaseExpireAt = new Date(Date.now() + INSTANCE_LEASE_TTL_MS);
  let assignedNodeId = typeof instance.meta.assignedNodeId === 'string' ? instance.meta.assignedNodeId.trim() : '';
  let currentLeaseToken = typeof instance.meta.leaseToken === 'string' ? instance.meta.leaseToken.trim() : '';
  let currentLeaseExpireAt = instance.meta.leaseExpireAt ? new Date(instance.meta.leaseExpireAt).getTime() : 0;
  let expectedOwnershipEpoch = Number.isFinite(Number(instance.meta.ownershipEpoch))
    ? Math.trunc(Number(instance.meta.ownershipEpoch))
    : 0;
  if (assignedNodeId
    && currentLeaseToken
    && assignedNodeId !== nodeId
    && (!Number.isFinite(currentLeaseExpireAt) || currentLeaseExpireAt <= Date.now() - INSTANCE_LEASE_RENEW_SKEW_MS)) {
    assignedNodeId = '';
    currentLeaseToken = '';
  }
  if ((!assignedNodeId || !currentLeaseToken) && runtime.instanceCatalogService?.isEnabled?.()) {
    const catalog = await runtime.instanceCatalogService.loadInstanceCatalog(instanceId);
    const catalogAssignedNodeId = typeof catalog?.assigned_node_id === 'string' ? catalog.assigned_node_id.trim() : '';
    const catalogLeaseToken = typeof catalog?.lease_token === 'string' ? catalog.lease_token.trim() : '';
    const catalogLeaseExpireAt = catalog?.lease_expire_at ? new Date(catalog.lease_expire_at).getTime() : 0;
    const catalogOwnershipEpoch = Number.isFinite(Number(catalog?.ownership_epoch))
      ? Math.trunc(Number(catalog.ownership_epoch))
      : 0;
    if (catalogAssignedNodeId === nodeId
      && catalogLeaseToken
      && Number.isFinite(catalogLeaseExpireAt)
      && catalogLeaseExpireAt > Date.now() - INSTANCE_LEASE_RENEW_SKEW_MS) {
      assignedNodeId = catalogAssignedNodeId;
      currentLeaseToken = catalogLeaseToken;
      currentLeaseExpireAt = catalogLeaseExpireAt;
      expectedOwnershipEpoch = catalogOwnershipEpoch;
      instance.meta.assignedNodeId = catalogAssignedNodeId;
      instance.meta.leaseToken = catalogLeaseToken;
      instance.meta.leaseExpireAt = new Date(catalogLeaseExpireAt).toISOString();
      instance.meta.ownershipEpoch = catalogOwnershipEpoch;
    }
  }
  const renewResult = assignedNodeId && currentLeaseToken
    ? await runtime.instanceCatalogService.renewInstanceLease({
      instanceId,
      nodeId,
      leaseToken: currentLeaseToken,
      leaseExpireAt,
      expectedOwnershipEpoch,
    })
    : null;
  const claimResult = !assignedNodeId || !currentLeaseToken
    ? await runtime.instanceCatalogService.claimInstanceLease({
      instanceId,
      nodeId,
      leaseToken,
      leaseExpireAt,
    })
    : null;
  const ok = renewResult === true || claimResult?.ok === true;
  if (!ok) {
    const adopted = await adoptLocalCatalogLeaseAndRenew(runtime, instance, instanceId, nodeId, leaseExpireAt);
    if (adopted) {
      return;
    }
    fenceInstanceRuntime(runtime, instanceId, 'lease_sync_failed');
    return;
  }
  instance.meta.assignedNodeId = nodeId;
  instance.meta.leaseToken = assignedNodeId && currentLeaseToken ? currentLeaseToken : leaseToken;
  instance.meta.leaseExpireAt = leaseExpireAt.toISOString();
  instance.meta.ownershipEpoch = assignedNodeId && currentLeaseToken
    ? expectedOwnershipEpoch
    : Number.isFinite(Number(claimResult?.ownershipEpoch)) ? Math.trunc(Number(claimResult.ownershipEpoch)) : expectedOwnershipEpoch + 1;
  instance.meta.runtimeStatus = 'leased';
  instance.meta.status = 'active';
}

async function adoptLocalCatalogLeaseAndRenew(runtime, instance, instanceId, nodeId, leaseExpireAt) {
  if (!runtime.instanceCatalogService?.isEnabled?.()) {
    return false;
  }
  const catalog = await runtime.instanceCatalogService.loadInstanceCatalog(instanceId);
  const catalogAssignedNodeId = typeof catalog?.assigned_node_id === 'string' ? catalog.assigned_node_id.trim() : '';
  const catalogLeaseToken = typeof catalog?.lease_token === 'string' ? catalog.lease_token.trim() : '';
  const catalogLeaseExpireAt = catalog?.lease_expire_at ? new Date(catalog.lease_expire_at).getTime() : 0;
  const catalogOwnershipEpoch = Number.isFinite(Number(catalog?.ownership_epoch))
    ? Math.trunc(Number(catalog.ownership_epoch))
    : 0;
  if (catalogAssignedNodeId !== nodeId
    || !catalogLeaseToken
    || !Number.isFinite(catalogLeaseExpireAt)
    || catalogLeaseExpireAt <= Date.now() - INSTANCE_LEASE_RENEW_SKEW_MS) {
    return false;
  }
  const renewed = await runtime.instanceCatalogService.renewInstanceLease({
    instanceId,
    nodeId,
    leaseToken: catalogLeaseToken,
    leaseExpireAt,
    expectedOwnershipEpoch: catalogOwnershipEpoch,
  });
  if (renewed !== true) {
    return false;
  }
  instance.meta.assignedNodeId = nodeId;
  instance.meta.leaseToken = catalogLeaseToken;
  instance.meta.leaseExpireAt = leaseExpireAt.toISOString();
  instance.meta.ownershipEpoch = catalogOwnershipEpoch;
  instance.meta.runtimeStatus = 'leased';
  instance.meta.status = 'active';
  return true;
}

export async function rebuildPersistentInstance(runtime, instanceId) {
  const current = runtime.getInstanceRuntime(instanceId);
  if (!current) {
    return { ok: false, reason: 'instance_not_found' };
  }
  if (!(current.meta?.persistent === true || current.persistent === true)) {
    return { ok: false, reason: 'instance_not_persistent' };
  }
  const templateId = current.template?.id ?? current.templateId ?? '';
  if (!templateId) {
    return { ok: false, reason: 'template_missing' };
  }
  const currentMeta = { ...(current.meta ?? {}) };
  runtime.worldRuntimeInstanceStateService.deleteInstanceRuntime(instanceId);
  const descriptor = parseRuntimeInstanceDescriptor(instanceId);
  const rebuilt = runtime.createInstance({
    instanceId,
    templateId,
    kind: typeof current.kind === 'string' && current.kind.trim() ? current.kind.trim() : 'public',
    persistent: true,
    linePreset: descriptor?.linePreset ?? currentMeta.linePreset ?? (currentMeta.routeDomain === 'real' ? 'real' : 'peaceful'),
    lineIndex: descriptor?.lineIndex ?? currentMeta.lineIndex ?? 1,
    instanceOrigin: descriptor?.instanceOrigin ?? currentMeta.instanceOrigin ?? 'gm_manual',
    defaultEntry: descriptor?.defaultEntry !== false,
    ownerPlayerId: currentMeta.ownerPlayerId ?? null,
    ownerSectId: currentMeta.ownerSectId ?? null,
    partyId: currentMeta.partyId ?? null,
    status: currentMeta.status ?? 'active',
    runtimeStatus: currentMeta.runtimeStatus ?? 'running',
    assignedNodeId: currentMeta.assignedNodeId ?? null,
    leaseToken: currentMeta.leaseToken ?? null,
    leaseExpireAt: currentMeta.leaseExpireAt ?? null,
    ownershipEpoch: Number.isFinite(Number(currentMeta.ownershipEpoch)) ? Math.trunc(Number(currentMeta.ownershipEpoch)) : 0,
    clusterId: currentMeta.clusterId ?? null,
    shardKey: currentMeta.shardKey ?? instanceId,
    routeDomain: currentMeta.routeDomain ?? null,
    destroyAt: currentMeta.destroyAt ?? null,
    lastActiveAt: currentMeta.lastActiveAt ?? null,
    lastPersistedAt: currentMeta.lastPersistedAt ?? null,
  });
  await hydratePersistentInstanceSnapshot(runtime, instanceId, rebuilt);
  return { ok: true, snapshot: typeof rebuilt?.snapshot === 'function' ? rebuilt.snapshot() : null };
}

export async function migrateInstanceToNode(runtime, instanceId, targetNodeId) {
  const normalizedTargetNodeId = typeof targetNodeId === 'string' ? targetNodeId.trim() : '';
  if (!normalizedTargetNodeId) {
    return { ok: false, reason: 'target_node_required' };
  }
  const current = runtime.getInstanceRuntime(instanceId);
  if (!current) {
    return { ok: false, reason: 'instance_not_found' };
  }
  const currentNodeId = runtime.nodeRegistryService.getNodeId();
  if (normalizedTargetNodeId === currentNodeId && isInstanceLeaseWritable(runtime, current)) {
    return { ok: true };
  }
  fenceInstanceRuntime(runtime, instanceId, 'gm_instance_migrate');
  const leaseExpireAt = new Date(Date.now() - 1000);
  const ownershipEpoch = Number.isFinite(Number(current.meta.ownershipEpoch))
    ? Math.trunc(Number(current.meta.ownershipEpoch)) + 1
    : 1;
  if (runtime.instanceCatalogService?.isEnabled?.()) {
    await runtime.instanceCatalogService.upsertInstanceCatalog({
      instanceId,
      templateId: current.template?.id ?? current.templateId ?? '',
      instanceType: typeof current.kind === 'string' ? current.kind : 'public',
      persistentPolicy: typeof current.meta?.persistentPolicy === 'string' ? current.meta.persistentPolicy : 'persistent',
      ownerPlayerId: current.meta?.ownerPlayerId ?? null,
      ownerSectId: current.meta?.ownerSectId ?? null,
      partyId: current.meta?.partyId ?? null,
      lineId: current.meta?.lineId ?? null,
      status: 'active',
      runtimeStatus: 'leased',
      assignedNodeId: normalizedTargetNodeId,
      leaseToken: null,
      leaseExpireAt: leaseExpireAt.toISOString(),
      ownershipEpoch,
      clusterId: current.meta?.clusterId ?? null,
      shardKey: current.meta?.shardKey ?? instanceId,
      routeDomain: current.meta?.routeDomain ?? null,
      destroyAt: current.meta?.destroyAt ?? null,
      lastActiveAt: current.meta?.lastActiveAt ?? null,
      lastPersistedAt: current.meta?.lastPersistedAt ?? null,
    });
  }
  current.meta.assignedNodeId = normalizedTargetNodeId;
  current.meta.leaseToken = null;
  current.meta.leaseExpireAt = leaseExpireAt.toISOString();
  current.meta.ownershipEpoch = ownershipEpoch;
  current.meta.runtimeStatus = 'leased';
  current.meta.status = 'active';
  return { ok: true };
}

export async function getInstanceLeaseStatus(runtime, instanceId) {
  const instance = runtime.getInstanceRuntime(instanceId);
  const catalog = runtime.instanceCatalogService?.isEnabled?.()
    ? await runtime.instanceCatalogService.loadInstanceCatalog(instanceId)
    : null;
  const runtimeLease = instance ? {
    assignedNodeId: typeof instance?.meta?.assignedNodeId === 'string' && instance.meta.assignedNodeId.trim() ? instance.meta.assignedNodeId.trim() : null,
    leaseToken: typeof instance?.meta?.leaseToken === 'string' && instance.meta.leaseToken.trim() ? instance.meta.leaseToken.trim() : null,
    leaseExpireAt: typeof instance?.meta?.leaseExpireAt === 'string' && instance.meta.leaseExpireAt.trim() ? instance.meta.leaseExpireAt.trim() : null,
    ownershipEpoch: Number.isFinite(Number(instance?.meta?.ownershipEpoch)) ? Math.trunc(Number(instance.meta.ownershipEpoch)) : 0,
    runtimeStatus: typeof instance?.meta?.runtimeStatus === 'string' && instance.meta.runtimeStatus.trim() ? instance.meta.runtimeStatus.trim() : 'running',
    status: typeof instance?.meta?.status === 'string' && instance.meta.status.trim() ? instance.meta.status.trim() : 'active',
  } : null;
  const catalogLease = catalog ? {
    assignedNodeId: typeof catalog.assigned_node_id === 'string' && catalog.assigned_node_id.trim() ? catalog.assigned_node_id.trim() : null,
    leaseToken: typeof catalog.lease_token === 'string' && catalog.lease_token.trim() ? catalog.lease_token.trim() : null,
    leaseExpireAt: typeof catalog.lease_expire_at === 'string' && catalog.lease_expire_at.trim() ? catalog.lease_expire_at.trim() : null,
    ownershipEpoch: Number.isFinite(Number(catalog.ownership_epoch)) ? Math.trunc(Number(catalog.ownership_epoch)) : 0,
    runtimeStatus: typeof catalog.runtime_status === 'string' && catalog.runtime_status.trim() ? catalog.runtime_status.trim() : 'unknown',
    status: typeof catalog.status === 'string' && catalog.status.trim() ? catalog.status.trim() : 'unknown',
  } : null;
  return {
    instanceId,
    nodeId: runtime.nodeRegistryService.getNodeId(),
    runtime: runtimeLease,
    catalog: catalogLease,
    writable: isInstanceLeaseWritable(runtime, instance),
  };
}

export async function destroyExpiredManagedInstances(runtime) {
  const now = Date.now();
  for (const [instanceId, instance] of runtime.listInstanceEntries()) {
    const destroyAt = typeof instance?.meta?.destroyAt === 'string' && instance.meta.destroyAt.trim()
      ? Date.parse(instance.meta.destroyAt)
      : NaN;
    if (!Number.isFinite(destroyAt) || destroyAt > now) {
      continue;
    }
    await destroyManagedInstance(runtime, instanceId, 'expire_at_reached');
  }
}

export async function syncAllInstanceLeases(runtime) {
  await destroyExpiredManagedInstances(runtime);
  if (!runtime.instanceCatalogService?.isEnabled?.()) {
    return;
  }
  for (const [instanceId] of runtime.listInstanceEntries()) {
    await syncInstanceLease(runtime, instanceId);
  }
  await claimRecoverableCatalogInstances(runtime);
}

export async function claimRecoverableCatalogInstances(runtime) {
  if (!runtime.instanceCatalogService?.isEnabled?.()) {
    return;
  }
  const nodeId = runtime.nodeRegistryService.getNodeId();
  const catalogEntries = await runtime.instanceCatalogService.listInstanceCatalogEntries();
  for (const entry of catalogEntries) {
    if (!shouldRestoreCatalogEntry(entry)) {
      continue;
    }
    const instanceId = typeof entry?.instance_id === 'string' ? entry.instance_id.trim() : '';
    const templateId = typeof entry?.template_id === 'string' ? entry.template_id.trim() : '';
    if (!instanceId || !templateId || runtime.getInstanceRuntime(instanceId)) {
      continue;
    }
    if (typeof runtime.templateRepository?.has === 'function'
      && !runtime.templateRepository.has(templateId)
      && typeof runtime.worldRuntimeSectService?.restoreCatalogSectTemplate === 'function') {
      runtime.worldRuntimeSectService.restoreCatalogSectTemplate(entry, runtime);
    }
    if (typeof runtime.templateRepository?.has === 'function' && !runtime.templateRepository.has(templateId)) {
      runtime.logger.warn(`实例目录引用的地图模板不存在，跳过 lease 接管：${instanceId} -> ${templateId}`);
      continue;
    }
    const leaseToken = `${nodeId}:${instanceId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    const leaseExpireAt = new Date(Date.now() + INSTANCE_LEASE_TTL_MS);
    const claim = await runtime.instanceCatalogService.claimInstanceLease({
      instanceId,
      nodeId,
      leaseToken,
      leaseExpireAt,
    });
    if (!claim.ok) {
      continue;
    }
    const descriptor = parseRuntimeInstanceDescriptor(instanceId);
    const instance = runtime.createInstance({
      instanceId,
      templateId,
      kind: typeof entry.instance_type === 'string' && entry.instance_type.trim() ? entry.instance_type.trim() : 'public',
      persistent: true,
      linePreset: descriptor?.linePreset ?? (entry.route_domain === 'real' ? 'real' : 'peaceful'),
      lineIndex: descriptor?.lineIndex ?? 1,
      instanceOrigin: descriptor?.instanceOrigin ?? 'catalog',
      defaultEntry: descriptor?.defaultEntry !== false,
      ownerPlayerId: typeof entry.owner_player_id === 'string' ? entry.owner_player_id : null,
      ownerSectId: typeof entry.owner_sect_id === 'string' ? entry.owner_sect_id : null,
      partyId: typeof entry.party_id === 'string' ? entry.party_id : null,
      status: 'active',
      runtimeStatus: 'leased',
      assignedNodeId: nodeId,
      leaseToken,
      leaseExpireAt: leaseExpireAt.toISOString(),
      ownershipEpoch: Number.isFinite(Number(claim.ownershipEpoch)) ? Math.trunc(Number(claim.ownershipEpoch)) : 0,
      clusterId: typeof entry.cluster_id === 'string' ? entry.cluster_id : null,
      shardKey: typeof entry.shard_key === 'string' && entry.shard_key.trim() ? entry.shard_key.trim() : instanceId,
      routeDomain: typeof entry.route_domain === 'string' ? entry.route_domain : null,
      destroyAt: entry.destroy_at ? new Date(entry.destroy_at).toISOString() : null,
      lastActiveAt: entry.last_active_at ? new Date(entry.last_active_at).toISOString() : null,
      lastPersistedAt: entry.last_persisted_at ? new Date(entry.last_persisted_at).toISOString() : null,
    });
    await hydratePersistentInstanceSnapshot(runtime, instanceId, instance);
    runtime.logger.log(`实例 lease 自动接管成功：${instanceId} ownershipEpoch=${claim.ownershipEpoch ?? 0}`);
  }
}

export async function hydratePersistentInstanceSnapshot(runtime, instanceId, instance) {
  const domainPersistenceService = runtime.instanceDomainPersistenceService;
  const domainPersistenceEnabled = typeof domainPersistenceService?.isEnabled === 'function'
    && domainPersistenceService.isEnabled();
  if (!domainPersistenceEnabled) {
    await restorePersistentInstanceFormations(runtime, instanceId);
    return;
  }
  const runtimeTileCells = typeof domainPersistenceService.loadRuntimeTileCells === 'function'
    ? await domainPersistenceService.loadRuntimeTileCells(instanceId)
    : [];
  if (Array.isArray(runtimeTileCells) && runtimeTileCells.length > 0 && typeof instance.hydrateRuntimeTiles === 'function') {
    instance.hydrateRuntimeTiles(runtimeTileCells);
  }
  const tileDiffs = await domainPersistenceService.loadTileResourceDiffs(instanceId);
  if (Array.isArray(tileDiffs) && tileDiffs.length > 0) {
    instance.patchTileResources(tileDiffs.map((entry) => ({
      resourceKey: entry.resourceKey,
      tileIndex: entry.tileIndex,
      value: entry.value,
    })));
  }
  const tileDamageStates = typeof domainPersistenceService.loadTileDamageStates === 'function'
    ? await domainPersistenceService.loadTileDamageStates(instanceId)
    : [];
  if (Array.isArray(tileDamageStates) && tileDamageStates.length > 0) {
    instance.hydrateTileDamage(tileDamageStates);
  }
  const temporaryTileStates = typeof domainPersistenceService.loadTemporaryTileStates === 'function'
    ? await domainPersistenceService.loadTemporaryTileStates(instanceId)
    : [];
  if (Array.isArray(temporaryTileStates) && temporaryTileStates.length > 0 && typeof instance.hydrateTemporaryTiles === 'function') {
    instance.hydrateTemporaryTiles(temporaryTileStates);
  }
  const groundItems = await domainPersistenceService.loadGroundItems(instanceId);
  if (Array.isArray(groundItems) && groundItems.length > 0) {
    instance.hydrateGroundPiles(groupGroundItemsByTile(groundItems));
  }
  const containerStates = await domainPersistenceService.loadContainerStates(instanceId);
  runtime.worldRuntimeLootContainerService.hydrateContainerStates(instanceId, normalizeLoadedContainerStates(containerStates ?? []));
  const monsterStates = await domainPersistenceService.loadMonsterRuntimeStates(instanceId);
  instance.hydrateMonsterRuntimeStates(monsterStates ?? []);
  const overlayChunks = await domainPersistenceService.loadOverlayChunks(instanceId);
  if (Array.isArray(overlayChunks) && overlayChunks.length > 0 && typeof instance.hydrateOverlayChunks === 'function') {
    instance.hydrateOverlayChunks(overlayChunks);
  }
  const checkpoint = await domainPersistenceService.loadInstanceCheckpoint(instanceId);
  if (checkpoint) {
    hydrateInstanceFromCheckpoint(instance, checkpoint, runtime, instanceId);
  }
  await restorePersistentInstanceFormations(runtime, instanceId);
}

async function restorePersistentInstanceFormations(runtime, instanceId) {
  if (typeof runtime.worldRuntimeFormationService?.restoreInstanceFormations !== 'function') {
    return;
  }
  const restoredFormations = await runtime.worldRuntimeFormationService.restoreInstanceFormations(instanceId);
  if (restoredFormations > 0) {
    runtime.logger.log(`实例阵法已恢复：${instanceId} x${restoredFormations}`);
  }
}

function shouldRestoreCatalogEntry(entry) {
  const destroyAt = entry?.destroy_at ? new Date(entry.destroy_at).getTime() : 0;
  if (Number.isFinite(destroyAt) && destroyAt > 0 && destroyAt <= Date.now()) {
    return false;
  }
  const persistentPolicy = normalizeRuntimeInstancePersistentPolicy(entry?.persistent_policy);
  if (persistentPolicy === 'persistent') {
    return true;
  }
  if (persistentPolicy !== 'long_lived') {
    return false;
  }
  const lastActiveAt = entry?.last_active_at ? new Date(entry.last_active_at).getTime() : 0;
  if (!Number.isFinite(lastActiveAt) || lastActiveAt <= 0) {
    return false;
  }
  return Date.now() - lastActiveAt <= LONG_LIVED_INSTANCE_TTL_MS;
}

function normalizeLoadedContainerStates(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const payload = row?.statePayload && typeof row.statePayload === 'object' ? row.statePayload : {};
      return {
        ...payload,
        sourceId: typeof row?.sourceId === 'string' && row.sourceId.trim() ? row.sourceId : payload.sourceId,
        containerId: typeof row?.containerId === 'string' && row.containerId.trim() ? row.containerId : payload.containerId,
      };
    });
}

function groupGroundItemsByTile(items) {
  const piles = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const tileIndex = Number.isFinite(Number(item?.tileIndex)) ? Math.trunc(Number(item.tileIndex)) : -1;
    if (tileIndex < 0) {
      continue;
    }
    const current = piles.get(tileIndex) ?? { tileIndex, items: [] };
    const payload = item.itemPayload && typeof item.itemPayload === 'object' ? item.itemPayload : {};
    current.items.push({
      ...payload,
      itemId: typeof payload.itemId === 'string' ? payload.itemId : 'unknown',
      name: typeof payload.name === 'string' ? payload.name : undefined,
      count: Number.isFinite(Number(payload.count)) ? Math.max(1, Math.trunc(Number(payload.count))) : 1,
      grade: typeof payload.grade === 'string' ? payload.grade : undefined,
      type: typeof payload.type === 'string' ? payload.type : undefined,
    });
    piles.set(tileIndex, current);
  }
  return Array.from(piles.values(), (pile) => ({
    tileIndex: pile.tileIndex,
    items: pile.items,
  }));
}

function hydrateInstanceFromCheckpoint(instance, checkpoint, runtime, instanceId) {
  if (!checkpoint || typeof checkpoint !== 'object') {
    return;
  }
  const snapshot = resolveCheckpointSnapshot(checkpoint);
  if (!snapshot) {
    return;
  }
  if (typeof instance.hydrateTime === 'function') {
    instance.hydrateTime(snapshot.tick);
  }
  void runtime;
  void instanceId;
}

function resolveCheckpointSnapshot(checkpoint) {
  if (!checkpoint || typeof checkpoint !== 'object') {
    return null;
  }
  if (checkpoint.snapshot && typeof checkpoint.snapshot === 'object') {
    return checkpoint.snapshot;
  }
  return checkpoint;
}

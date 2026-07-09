/**
 * 本文件属于服务端权威运行时，负责启动自检摧毁违规建筑时的资产兜底与审计。
 *
 * hydrateBuildingRoomFengShuiState 会丢弃落在受保护点位或定义已删除的建筑，
 * 随后 prune 会把 instance_building_state 行物理删除。宝库的库存存在独立表
 * instance_building_storage_item，不随建筑行删除，且活实例期间 orphan 扫描
 * 覆盖不到，因此必须在 prune 之前把库存邮件返还给 owner。
 */

/** 摧毁审计日志逐条打印上限，超出只汇总计数，避免启动期刷屏。 */
const PRUNE_AUDIT_LOG_LIMIT = 50;

interface SkippedBuildingRecord {
  id?: string;
  defId?: string;
  ownerPlayerId?: string | null;
  reason?: string;
}

/**
 * recoverPrunedBuildingVaults：返还被启动自检摧毁的建筑所持有的宝库库存。
 *
 * 必须在 saveBuildingRoomFengShuiState 删除 instance_building_state 之前调用，
 * 否则宝库的 owner_player_id 无法从建筑行回退取得。
 */
export async function recoverPrunedBuildingVaults(
  runtime: any,
  instanceId: string,
  hydrateResult: unknown,
  logger: any,
): Promise<void> {
  const skipped = resolveSkippedBuildings(hydrateResult);
  if (skipped.length === 0) {
    return;
  }
  logPrunedBuildingAudit(instanceId, skipped, logger);
  const service = runtime?.treasureVaultRuntimeService;
  if (typeof service?.recoverVaultItemsForBuildings !== 'function') {
    return;
  }
  const buildingIds = skipped.map((entry) => entry?.id).filter((id): id is string => Boolean(id));
  try {
    const result = await service.recoverVaultItemsForBuildings({
      instanceId,
      buildingIds,
      reason: 'startup_placement_prune',
    });
    if (result?.recoveredVaults > 0) {
      logger?.warn?.(`启动摧毁违规建筑前返还了 ${result.recoveredVaults} 个宝库共 ${result.recoveredItems} 件物品：${instanceId}`);
    }
    if (result?.blockedVaults > 0) {
      logger?.error?.(`启动摧毁违规建筑时有 ${result.blockedVaults} 个宝库库存无法自动返还（缺少 owner），物品仍保留在 instance_building_storage_item，需要 GM 处理：${instanceId}`);
    }
  } catch (error) {
    // 返还失败时不阻断实例恢复：库存行仍在表中，未静默丢失，交由 GM 处理。
    logger?.error?.(`启动摧毁违规建筑时返还宝库库存失败：${instanceId} ${(error as Error)?.message ?? error}`);
  }
}

function logPrunedBuildingAudit(instanceId: string, skipped: SkippedBuildingRecord[], logger: any): void {
  for (const entry of skipped.slice(0, PRUNE_AUDIT_LOG_LIMIT)) {
    logger?.warn?.(
      `启动摧毁违规建筑 instance=${instanceId} building=${entry?.id ?? ''} def=${entry?.defId ?? ''} owner=${entry?.ownerPlayerId ?? ''} reason=${entry?.reason ?? ''}`,
    );
  }
  if (skipped.length > PRUNE_AUDIT_LOG_LIMIT) {
    logger?.warn?.(`启动摧毁违规建筑共 ${skipped.length} 个，已省略 ${skipped.length - PRUNE_AUDIT_LOG_LIMIT} 条明细：${instanceId}`);
  }
}

function resolveSkippedBuildings(hydrateResult: unknown): SkippedBuildingRecord[] {
  const skipped = (hydrateResult as any)?.skippedBuildings;
  return Array.isArray(skipped) ? skipped : [];
}

/**
 * 本文件属于服务端权威运行时，负责启动自检摧毁违规建筑时的资产兜底与审计。
 *
 * hydrateBuildingRoomFengShuiState 会丢弃落在受保护点位或定义已删除的建筑，
 * 随后 prune 会把 instance_building_state 行物理删除。宝库的库存存在独立表
 * instance_building_storage_item，不随建筑行删除，且活实例期间 orphan 扫描
 * 覆盖不到，因此必须在 prune 之前把库存邮件返还给 owner。
 *
 * 与玩家主动拆除一致：宝库库存返还失败时不摧毁宝库，原地保留等待下次启动或 GM 处理。
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
 * recoverVaultsBeforePlacementPrune：返还即将被启动自检摧毁的宝库库存。
 *
 * 必须在 saveBuildingRoomFengShuiState 删除 instance_building_state 之前调用，
 * 否则宝库的 owner_player_id 无法从建筑行回退取得。
 *
 * @returns 返还失败、因而必须豁免摧毁的建筑 id 集合。定义已删除的宝库无法恢复
 *          运行态，即使返还失败也不能保留，只写 error 日志交由 GM 处理。
 */
export async function recoverVaultsBeforePlacementPrune(
  runtime: any,
  instanceId: string,
  instance: any,
  state: unknown,
  logger: any,
): Promise<Set<string>> {
  const blocked = new Set<string>();
  if (typeof instance?.listPrunableVaultBuildings !== 'function') {
    return blocked;
  }
  const vaults: SkippedBuildingRecord[] = instance.listPrunableVaultBuildings(state) ?? [];
  if (vaults.length === 0) {
    return blocked;
  }
  const service = runtime?.treasureVaultRuntimeService;
  if (typeof service?.recoverVaultItemsToOwnerMail !== 'function') {
    logger?.error?.(`启动摧毁违规宝库时返还服务不可用，全部豁免摧毁：${instanceId}`);
    for (const vault of vaults) {
      markBlocked(blocked, vault);
    }
    return blocked;
  }
  for (const vault of vaults) {
    const buildingId = vault?.id;
    if (!buildingId) {
      continue;
    }
    try {
      const result = await service.recoverVaultItemsToOwnerMail({
        instanceId,
        buildingId,
        ownerPlayerId: vault?.ownerPlayerId ?? null,
        reason: 'startup_placement_prune',
      });
      if (result?.ok === true) {
        if (result.itemCount > 0) {
          logger?.warn?.(`启动摧毁违规宝库前返还了 ${result.itemCount} 件物品 instance=${instanceId} building=${buildingId} owner=${vault?.ownerPlayerId ?? ''}`);
        }
        continue;
      }
      logger?.error?.(`启动摧毁违规宝库时库存无法返还，${describeBlockOutcome(vault)} instance=${instanceId} building=${buildingId} reason=${result?.reason ?? ''}`);
      markBlocked(blocked, vault);
    } catch (error) {
      logger?.error?.(`启动摧毁违规宝库时返还库存异常，${describeBlockOutcome(vault)} instance=${instanceId} building=${buildingId} ${(error as Error)?.message ?? error}`);
      markBlocked(blocked, vault);
    }
  }
  return blocked;
}

/** 启动自检摧毁密室外部建筑前，先原子释放对应独立实例与燃料状态。 */
export async function releaseTimeChambersBeforePlacementPrune(
  runtime: any,
  instanceId: string,
  instance: any,
  state: unknown,
  logger: any,
): Promise<Set<string>> {
  const blocked = new Set<string>();
  if (typeof instance?.listPrunableTimeChamberBuildings !== 'function') {
    return blocked;
  }
  const chambers: SkippedBuildingRecord[] = instance.listPrunableTimeChamberBuildings(state) ?? [];
  if (chambers.length === 0) {
    return blocked;
  }
  const service = runtime?.timeChamberRuntimeService;
  if (typeof service?.prepareDeconstruct !== 'function') {
    logger?.error?.(`启动摧毁违规密室时释放服务不可用，全部可恢复密室豁免摧毁：${instanceId}`);
    for (const chamber of chambers) {
      markBlocked(blocked, chamber);
    }
    return blocked;
  }
  for (const chamber of chambers) {
    if (!chamber.id) {
      continue;
    }
    try {
      const result = await service.prepareDeconstruct(instanceId, chamber.id, runtime);
      if (result?.ok === true) {
        continue;
      }
      logger?.error?.(`启动摧毁违规密室时无法释放独立实例，${describeChamberBlockOutcome(chamber)} instance=${instanceId} building=${chamber.id} reason=${result?.reason ?? ''}`);
      markBlocked(blocked, chamber);
    } catch (error) {
      logger?.error?.(`启动摧毁违规密室时释放异常，${describeChamberBlockOutcome(chamber)} instance=${instanceId} building=${chamber.id} ${(error as Error)?.message ?? error}`);
      markBlocked(blocked, chamber);
    }
  }
  return blocked;
}

/** logPrunedBuildingAudit：逐条记录被启动自检摧毁的建筑，供事后回读与申诉。 */
export function logPrunedBuildingAudit(instanceId: string, hydrateResult: unknown, logger: any): void {
  const skipped = resolveSkippedBuildings(hydrateResult);
  for (const entry of skipped.slice(0, PRUNE_AUDIT_LOG_LIMIT)) {
    logger?.warn?.(
      `启动摧毁违规建筑 instance=${instanceId} building=${entry?.id ?? ''} def=${entry?.defId ?? ''} owner=${entry?.ownerPlayerId ?? ''} reason=${entry?.reason ?? ''}`,
    );
  }
  if (skipped.length > PRUNE_AUDIT_LOG_LIMIT) {
    logger?.warn?.(`启动摧毁违规建筑共 ${skipped.length} 个，已省略 ${skipped.length - PRUNE_AUDIT_LOG_LIMIT} 条明细：${instanceId}`);
  }
  const kept = Math.max(0, Math.trunc(Number((hydrateResult as any)?.keptProtectedPlacementCount) || 0));
  if (kept > 0) {
    logger?.error?.(`有 ${kept} 个违规宝库因库存无法返还而豁免摧毁，仍占据禁建区，需要 GM 处理：${instanceId}`);
  }
}

/** 定义已删除的宝库无法恢复运行态，不能靠豁免保留。 */
function markBlocked(blocked: Set<string>, vault: SkippedBuildingRecord): void {
  if (vault?.id && vault.reason !== 'unknown_def') {
    blocked.add(vault.id);
  }
}

function describeBlockOutcome(vault: SkippedBuildingRecord): string {
  return vault?.reason === 'unknown_def'
    ? '该宝库定义已删除、无法保留，库存仍留在 instance_building_storage_item'
    : '已豁免摧毁并原地保留';
}

function describeChamberBlockOutcome(chamber: SkippedBuildingRecord): string {
  return chamber?.reason === 'unknown_def'
    ? '该密室定义已删除、无法保留，独立实例需由 GM 检查'
    : '已豁免摧毁并原地保留';
}

function resolveSkippedBuildings(hydrateResult: unknown): SkippedBuildingRecord[] {
  const skipped = (hydrateResult as any)?.skippedBuildings;
  return Array.isArray(skipped) ? skipped : [];
}

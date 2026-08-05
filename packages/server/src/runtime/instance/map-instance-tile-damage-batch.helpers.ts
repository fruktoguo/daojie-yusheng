export type TileDropRollOptions = {
  dropRateBonus?: number;
  /** 调用方已由技能目标规划保证坐标唯一时，跳过批处理内的重复坐标 Set。 */
  assumeUniqueEntries?: boolean;
  /** 批处理内部阶段计时；聚合完成后每个阶段只回调一次。 */
  recordBatchSectionDuration?: (section: TileDamageBatchPerformanceSection, durationMs: number, count?: number) => void;
};

export type TileDamageBatchPerformanceSection =
  | 'entryResolveMs'
  | 'fallbackMs'
  | 'dropRollMs'
  | 'mutationMs'
  | 'stateWriteMs'
  | 'staticSyncMs'
  | 'finalizeMs'
  | 'fastPathEntries'
  | 'fallbackEntries'
  | 'fallbackVirtualBoundaryEntries'
  | 'fallbackTemporaryEntries'
  | 'fallbackBuildingEntries'
  | 'fallbackInvalidTileEntries'
  | 'fallbackSectBoundaryEntries'
  | 'fallbackRoomTopologyEntries'
  | 'fallbackRoomIntegrityEntries'
  | 'destroyedEntries'
  | 'dirtyEntries';

export type TileDamageBatchInput = {
  x: number;
  y: number;
  damage: number;
  /** 同一事件循环内完成权威校验的地块快照；重复坐标会自动回退实时读取。 */
  state?: TileCombatState;
};

interface TileDamageBatchMutationContext {
  modifiedAt: number;
  dirtyTileIndices: Set<number>;
  performanceTotals: TileDamageBatchPerformanceTotals | null;
}

interface TileDamageBatchPerformanceTotals {
  entryResolveMs: number;
  fallbackMs: number;
  dropRollMs: number;
  mutationMs: number;
  stateWriteMs: number;
  staticSyncMs: number;
  finalizeMs: number;
}

export interface TileCombatState {
  tileType: string;
  hp: number;
  maxHp: number;
  destroyed?: boolean;
  virtualBoundary?: boolean;
  temporary?: boolean;
  building?: boolean;
}

interface TileDamageResult {
  destroyed: boolean;
  hp: number;
  maxHp: number;
  appliedDamage: number;
  targetType: unknown;
  tileDrops?: unknown[];
  [key: string]: unknown;
}

interface OrdinaryTileDamageMutationInput {
  current: TileCombatState;
  tileIndex: number;
  appliedDamage: number;
  nextHp: number;
  destroyed: boolean;
  tileDrops: unknown[];
  affectsRoomTopology: boolean;
  affectsRoomIntegrity: boolean;
}

interface TileDamageBatchHost {
  meta: { canDamageTile?: boolean };
  tileDamageByTile: Map<number, {
    hp: number;
    maxHp: number;
    destroyed: boolean;
    respawnLeft: number;
    modifiedAt: number;
  }>;
  worldRevision: number;
  persistentRevision: number;
  getTileCombatState(x: number, y: number): TileCombatState | null;
  toTileIndex(x: number, y: number): number;
  damageTile(x: number, y: number, damage: number, options?: TileDropRollOptions): TileDamageResult | null;
  shouldRecalculateRoomsForTileMutation(tileIndex: number, previousTileType?: unknown, nextTileType?: unknown): boolean;
  getDestroyedTileLayerStateByCellIndex(tileIndex: number): { tileType: unknown };
  isCellInRoomInfluence(tileIndex: number): boolean;
  isSectRuntimeExpandedBoundaryStone(tileIndex: number, current: unknown): boolean;
  rollTileDrops(current: unknown, appliedDamage: number, destroyed: boolean, options: TileDropRollOptions): unknown[];
  markStaticTileSyncDirtyByIndex(tileIndex: number, options?: { sightBlockingChanged?: boolean; pathingChanged?: boolean }): void;
  markTileDamagePersistenceDirtyHighPriority(tileIndex: number): void;
  markTileDamagePersistenceDirtyBatchHighPriority(tileIndices: ReadonlySet<number>): void;
  recalculateRoomsAndFengShuiAfterTopologyChange(input: { reason: string; dirtyCellCount: number }): void;
  recalculateFengShuiAfterRoomInfluenceChange(tileIndex: number, reason: string): void;
  markPersistenceDirtyDomainsHighPriority(domains: string[]): void;
}

/**
 * 批量伤害普通可破坏地块；特殊建筑、临时地块和房间拓扑相关地块自动回退单格结算。
 * 同批普通地块共享一次世界版本与持久化版本推进，逐格掉落和静态同步语义保持不变。
 */
export function damageMapInstanceTilesBatch(
  instance: TileDamageBatchHost,
  entries: readonly TileDamageBatchInput[],
  options: TileDropRollOptions,
  calculateRestoreTicks: (tileType: unknown) => number,
) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { results: [], fastPathCount: 0, fallbackCount: 0 };
  }
  if (instance.meta.canDamageTile !== true) {
    return {
      results: entries.map(() => null),
      fastPathCount: 0,
      fallbackCount: 0,
    };
  }

  const batch: TileDamageBatchMutationContext = {
    modifiedAt: Date.now(),
    dirtyTileIndices: new Set(),
    performanceTotals: typeof options?.recordBatchSectionDuration === 'function'
      ? {
        entryResolveMs: 0,
        fallbackMs: 0,
        dropRollMs: 0,
        mutationMs: 0,
        stateWriteMs: 0,
        staticSyncMs: 0,
        finalizeMs: 0,
      }
      : null,
  };
  const results: Array<TileDamageResult | null> = [];
  const assumeUniqueEntries = options?.assumeUniqueEntries === true;
  const seenTileIndices = assumeUniqueEntries ? null : new Set<number>();
  let fastPathCount = 0;
  let fallbackCount = 0;
  let fallbackVirtualBoundaryCount = 0;
  let fallbackTemporaryCount = 0;
  let fallbackBuildingCount = 0;
  let fallbackInvalidTileCount = 0;
  let fallbackSectBoundaryCount = 0;
  let fallbackRoomTopologyCount = 0;
  let fallbackRoomIntegrityCount = 0;
  let destroyedCount = 0;
  for (const entry of entries) {
    const entryResolveStartedAt = batch.performanceTotals ? performance.now() : 0;
    const x = Math.trunc(Number(entry?.x));
    const y = Math.trunc(Number(entry?.y));
    const normalizedDamage = Math.max(0, Math.round(Number(entry?.damage) || 0));
    const tileIndex = instance.toTileIndex(x, y);
    const canUsePrevalidatedState = Boolean(entry?.state)
      && tileIndex >= 0
      && (assumeUniqueEntries || !seenTileIndices?.has(tileIndex));
    const current = canUsePrevalidatedState
      ? entry.state ?? null
      : instance.getTileCombatState(x, y);
    if (tileIndex >= 0 && seenTileIndices) {
      seenTileIndices.add(tileIndex);
    }
    if (!current || current.destroyed === true) {
      if (batch.performanceTotals) {
        batch.performanceTotals.entryResolveMs += performance.now() - entryResolveStartedAt;
      }
      results.push(null);
      continue;
    }
    if (normalizedDamage <= 0) {
      if (batch.performanceTotals) {
        batch.performanceTotals.entryResolveMs += performance.now() - entryResolveStartedAt;
      }
      results.push({
        destroyed: current.destroyed,
        hp: current.hp,
        maxHp: current.maxHp,
        appliedDamage: 0,
        targetType: current.tileType,
      });
      continue;
    }

    const requiresStateFallback = current.virtualBoundary === true
      || current.temporary === true
      || current.building === true
      || tileIndex < 0;
    if (requiresStateFallback) {
      if (batch.performanceTotals) {
        batch.performanceTotals.entryResolveMs += performance.now() - entryResolveStartedAt;
      }
      fallbackCount += 1;
      if (current.virtualBoundary === true) {
        fallbackVirtualBoundaryCount += 1;
      } else if (current.temporary === true) {
        fallbackTemporaryCount += 1;
      } else if (current.building === true) {
        fallbackBuildingCount += 1;
      } else {
        fallbackInvalidTileCount += 1;
      }
      const fallbackStartedAt = batch.performanceTotals ? performance.now() : 0;
      const result = instance.damageTile(x, y, normalizedDamage, options);
      if (batch.performanceTotals) {
        batch.performanceTotals.fallbackMs += performance.now() - fallbackStartedAt;
      }
      if (result?.destroyed === true) {
        destroyedCount += 1;
      }
      results.push(result);
      continue;
    }

    const appliedDamage = Math.min(current.hp, normalizedDamage);
    const nextHp = Math.max(0, current.hp - appliedDamage);
    const destroyed = nextHp <= 0;
    const affectsRoomTopology = destroyed === true
      && instance.shouldRecalculateRoomsForTileMutation(
        tileIndex,
        current.tileType,
        instance.getDestroyedTileLayerStateByCellIndex(tileIndex).tileType,
      );
    const affectsRoomIntegrity = destroyed !== true
      && current.hp >= current.maxHp
      && instance.isCellInRoomInfluence(tileIndex);
    const isSectBoundary = destroyed && instance.isSectRuntimeExpandedBoundaryStone(tileIndex, current);
    const requiresFallback = isSectBoundary
      || affectsRoomTopology
      || affectsRoomIntegrity;
    if (batch.performanceTotals) {
      batch.performanceTotals.entryResolveMs += performance.now() - entryResolveStartedAt;
    }
    if (requiresFallback) {
      fallbackCount += 1;
      if (isSectBoundary) {
        fallbackSectBoundaryCount += 1;
      } else if (affectsRoomTopology) {
        fallbackRoomTopologyCount += 1;
      } else {
        fallbackRoomIntegrityCount += 1;
      }
      const fallbackStartedAt = batch.performanceTotals ? performance.now() : 0;
      const result = instance.damageTile(x, y, normalizedDamage, options);
      if (batch.performanceTotals) {
        batch.performanceTotals.fallbackMs += performance.now() - fallbackStartedAt;
      }
      if (result?.destroyed === true) {
        destroyedCount += 1;
      }
      results.push(result);
      continue;
    }

    const dropRollStartedAt = batch.performanceTotals ? performance.now() : 0;
    const tileDrops = instance.rollTileDrops(current, appliedDamage, destroyed, options);
    if (batch.performanceTotals) {
      batch.performanceTotals.dropRollMs += performance.now() - dropRollStartedAt;
    }
    const mutationStartedAt = batch.performanceTotals ? performance.now() : 0;
    const result = applyMapInstanceOrdinaryTileDamageMutation(instance, {
      current,
      tileIndex,
      appliedDamage,
      nextHp,
      destroyed,
      tileDrops,
      affectsRoomTopology: false,
      affectsRoomIntegrity: false,
    }, batch, calculateRestoreTicks);
    if (batch.performanceTotals) {
      batch.performanceTotals.mutationMs += performance.now() - mutationStartedAt;
    }
    fastPathCount += 1;
    if (destroyed) {
      destroyedCount += 1;
    }
    results.push(result);
  }

  const finalizeStartedAt = batch.performanceTotals ? performance.now() : 0;
  if (batch.dirtyTileIndices.size > 0) {
    instance.worldRevision += 1;
    instance.markTileDamagePersistenceDirtyBatchHighPriority(batch.dirtyTileIndices);
    instance.persistentRevision += 1;
  }
  if (batch.performanceTotals) {
    batch.performanceTotals.finalizeMs += performance.now() - finalizeStartedAt;
    const recorder = options.recordBatchSectionDuration;
    recorder?.('entryResolveMs', batch.performanceTotals.entryResolveMs, entries.length);
    recorder?.('dropRollMs', batch.performanceTotals.dropRollMs, fastPathCount);
    recorder?.('mutationMs', batch.performanceTotals.mutationMs, fastPathCount);
    recorder?.('stateWriteMs', batch.performanceTotals.stateWriteMs, fastPathCount);
    recorder?.('staticSyncMs', batch.performanceTotals.staticSyncMs, fastPathCount);
    recorder?.('finalizeMs', batch.performanceTotals.finalizeMs, 1);
    if (fallbackCount > 0) {
      recorder?.('fallbackMs', batch.performanceTotals.fallbackMs, fallbackCount);
    }
    recorder?.('fastPathEntries', 0, fastPathCount);
    if (fallbackCount > 0) {
      recorder?.('fallbackEntries', 0, fallbackCount);
    }
    recordTileDamageBatchCount(recorder, 'fallbackVirtualBoundaryEntries', fallbackVirtualBoundaryCount);
    recordTileDamageBatchCount(recorder, 'fallbackTemporaryEntries', fallbackTemporaryCount);
    recordTileDamageBatchCount(recorder, 'fallbackBuildingEntries', fallbackBuildingCount);
    recordTileDamageBatchCount(recorder, 'fallbackInvalidTileEntries', fallbackInvalidTileCount);
    recordTileDamageBatchCount(recorder, 'fallbackSectBoundaryEntries', fallbackSectBoundaryCount);
    recordTileDamageBatchCount(recorder, 'fallbackRoomTopologyEntries', fallbackRoomTopologyCount);
    recordTileDamageBatchCount(recorder, 'fallbackRoomIntegrityEntries', fallbackRoomIntegrityCount);
    if (destroyedCount > 0) {
      recorder?.('destroyedEntries', 0, destroyedCount);
    }
    recorder?.('dirtyEntries', 0, batch.dirtyTileIndices.size);
  }
  return { results, fastPathCount, fallbackCount };
}

function recordTileDamageBatchCount(
  recorder: TileDropRollOptions['recordBatchSectionDuration'],
  section: TileDamageBatchPerformanceSection,
  count: number,
): void {
  if (count > 0) {
    recorder?.(section, 0, count);
  }
}

export function applyMapInstanceOrdinaryTileDamageMutation(
  instance: TileDamageBatchHost,
  input: OrdinaryTileDamageMutationInput,
  batch: TileDamageBatchMutationContext | null,
  calculateRestoreTicks: (tileType: unknown) => number,
) {
  const stateWriteStartedAt = batch?.performanceTotals ? performance.now() : 0;
  instance.tileDamageByTile.set(input.tileIndex, {
    hp: input.nextHp,
    maxHp: input.current.maxHp,
    destroyed: input.destroyed,
    respawnLeft: input.destroyed ? calculateRestoreTicks(input.current.tileType) : 0,
    modifiedAt: batch?.modifiedAt ?? Date.now(),
  });
  if (batch?.performanceTotals) {
    batch.performanceTotals.stateWriteMs += performance.now() - stateWriteStartedAt;
  }
  const staticSyncStartedAt = batch?.performanceTotals ? performance.now() : 0;
  instance.markStaticTileSyncDirtyByIndex(input.tileIndex, {
    sightBlockingChanged: input.destroyed === true,
    pathingChanged: input.destroyed === true,
  });
  if (batch?.performanceTotals) {
    batch.performanceTotals.staticSyncMs += performance.now() - staticSyncStartedAt;
  }
  if (batch) {
    batch.dirtyTileIndices.add(input.tileIndex);
  } else {
    instance.worldRevision += 1;
    instance.markTileDamagePersistenceDirtyHighPriority(input.tileIndex);
    if (input.affectsRoomTopology) {
      instance.recalculateRoomsAndFengShuiAfterTopologyChange({ reason: 'tile_destroyed', dirtyCellCount: 1 });
      instance.markPersistenceDirtyDomainsHighPriority(['room', 'fengshui']);
    } else if (input.affectsRoomIntegrity) {
      instance.recalculateFengShuiAfterRoomInfluenceChange(input.tileIndex, 'tile_integrity_damaged');
      instance.markPersistenceDirtyDomainsHighPriority(['fengshui']);
    }
    instance.persistentRevision += 1;
  }
  return {
    destroyed: input.destroyed,
    hp: input.nextHp,
    maxHp: input.current.maxHp,
    appliedDamage: input.appliedDamage,
    targetType: input.current.tileType,
    tileDrops: input.tileDrops,
  };
}

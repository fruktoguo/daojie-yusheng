export type TileDropRollOptions = {
  dropRateBonus?: number;
};

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
  recordTileDamageForRecovery?(tileIndex: number, tileType: string, appliedDamage: number, destroyed: boolean): void;
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
  };
  const results: Array<TileDamageResult | null> = [];
  const seenTileIndices = new Set<number>();
  let fastPathCount = 0;
  let fallbackCount = 0;
  for (const entry of entries) {
    const x = Math.trunc(Number(entry?.x));
    const y = Math.trunc(Number(entry?.y));
    const normalizedDamage = Math.max(0, Math.round(Number(entry?.damage) || 0));
    const tileIndex = instance.toTileIndex(x, y);
    const canUsePrevalidatedState = Boolean(entry?.state)
      && tileIndex >= 0
      && !seenTileIndices.has(tileIndex);
    const current = canUsePrevalidatedState
      ? entry.state ?? null
      : instance.getTileCombatState(x, y);
    if (tileIndex >= 0) {
      seenTileIndices.add(tileIndex);
    }
    if (!current || current.destroyed === true) {
      results.push(null);
      continue;
    }
    if (normalizedDamage <= 0) {
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
      fallbackCount += 1;
      results.push(instance.damageTile(x, y, normalizedDamage, options));
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
    const requiresFallback = (destroyed && instance.isSectRuntimeExpandedBoundaryStone(tileIndex, current))
      || affectsRoomTopology
      || affectsRoomIntegrity;
    if (requiresFallback) {
      fallbackCount += 1;
      results.push(instance.damageTile(x, y, normalizedDamage, options));
      continue;
    }

    const tileDrops = instance.rollTileDrops(current, appliedDamage, destroyed, options);
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
    fastPathCount += 1;
    results.push(result);
  }

  if (batch.dirtyTileIndices.size > 0) {
    instance.worldRevision += 1;
    instance.markTileDamagePersistenceDirtyBatchHighPriority(batch.dirtyTileIndices);
    instance.persistentRevision += 1;
  }
  return { results, fastPathCount, fallbackCount };
}

export function applyMapInstanceOrdinaryTileDamageMutation(
  instance: TileDamageBatchHost,
  input: OrdinaryTileDamageMutationInput,
  batch: TileDamageBatchMutationContext | null,
  calculateRestoreTicks: (tileType: unknown) => number,
) {
  instance.tileDamageByTile.set(input.tileIndex, {
    hp: input.nextHp,
    maxHp: input.current.maxHp,
    destroyed: input.destroyed,
    respawnLeft: input.destroyed ? calculateRestoreTicks(input.current.tileType) : 0,
    modifiedAt: batch?.modifiedAt ?? Date.now(),
  });
  instance.recordTileDamageForRecovery?.(
    input.tileIndex,
    input.current.tileType,
    input.appliedDamage,
    input.destroyed,
  );
  instance.markStaticTileSyncDirtyByIndex(input.tileIndex, {
    sightBlockingChanged: input.destroyed === true,
    pathingChanged: input.destroyed === true,
  });
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

/**
 * 本文件属于世界运行时查询层，负责把权威状态整理为只读视图。
 *
 * 维护时应避免查询路径产生副作用，并控制返回字段，防止高频同步带出完整大对象。
 */
import { Injectable } from '@nestjs/common';

interface SnapshotSource<TSnapshot = unknown> {
  snapshot(): TSnapshot;
}

interface RuntimeInstanceRegistry<TInstance extends SnapshotSource = SnapshotSource> {
  listInstanceRuntimes(): Iterable<TInstance>;
  getInstanceRuntime(instanceId: string): TInstance | null | undefined;
}

interface MonsterInstanceLike<TMonster = unknown> {
  listMonsters(): TMonster[];
  getMonster(runtimeId: string): TMonster | null | undefined;
}

interface TileStateInstanceLike {
  getTileAura(x: number, y: number): unknown | null;
  getEffectiveTileType?: (x: number, y: number) => unknown;
  getTileLayerState?: (x: number, y: number) => unknown;
  isWalkable?: (x: number, y: number, playerId?: string | null) => boolean;
  isTileSightBlocked?: (x: number, y: number) => boolean;
  listTileResources?: (x: number, y: number) => unknown[];
  getSafeZoneAtTile(x: number, y: number): unknown;
  getContainerAtTile(x: number, y: number): unknown;
  getTileGroundPile(x: number, y: number): unknown;
  getTileCombatState(x: number, y: number): unknown;
}

export interface RuntimeInstanceTileStateView {
  tileType?: unknown;
  walkable?: boolean;
  blocksSight?: boolean;
  aura: unknown;
  resources: unknown[];
  safeZone: unknown;
  container: unknown;
  groundPile: unknown;
  combat: unknown;
  layers?: unknown;
}

@Injectable()
export class WorldRuntimeInstanceQueryService {
  listInstances<TSnapshot>(runtime: RuntimeInstanceRegistry<SnapshotSource<TSnapshot>>): TSnapshot[] {
    return Array.from(runtime.listInstanceRuntimes(), (instance) => instance.snapshot());
  }

  getInstance<TSnapshot>(runtime: RuntimeInstanceRegistry<SnapshotSource<TSnapshot>>, instanceId: string): TSnapshot | null {
    return runtime.getInstanceRuntime(instanceId)?.snapshot() ?? null;
  }

  listInstanceMonsters<TMonster>(instance: MonsterInstanceLike<TMonster>): TMonster[] {
    return instance.listMonsters();
  }

  getInstanceMonster<TMonster>(instance: MonsterInstanceLike<TMonster>, runtimeId: string): TMonster | null {
    return instance.getMonster(runtimeId) ?? null;
  }

  getInstanceTileState(instance: TileStateInstanceLike, x: number, y: number): RuntimeInstanceTileStateView | null {
    const aura = instance.getTileAura(x, y);
    if (aura === null) {
      return null;
    }
    return {
      tileType: typeof instance.getEffectiveTileType === 'function' ? instance.getEffectiveTileType(x, y) : undefined,
      walkable: typeof instance.isWalkable === 'function' ? instance.isWalkable(x, y, null) : undefined,
      blocksSight: typeof instance.isTileSightBlocked === 'function' ? instance.isTileSightBlocked(x, y) : undefined,
      layers: typeof instance.getTileLayerState === 'function' ? instance.getTileLayerState(x, y) : undefined,
      aura,
      resources: instance.listTileResources?.(x, y) ?? [],
      safeZone: instance.getSafeZoneAtTile(x, y),
      container: instance.getContainerAtTile(x, y),
      groundPile: instance.getTileGroundPile(x, y),
      combat: instance.getTileCombatState(x, y),
    };
  }
}

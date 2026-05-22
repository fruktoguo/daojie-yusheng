/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
// ─── PersistenceDomain 枚举 ───────────────────────────────────────────────────

export enum PersistenceDomain {
  TileResource = 'tile_resource',
  Ground = 'ground_item',
  TileDamage = 'tile_damage',
  MonsterRuntime = 'monster_runtime',
  Aura = 'aura',
  Building = 'building',
  Overlay = 'overlay',
  TemporaryTile = 'temporary_tile',
  RuntimeTile = 'runtime_tile',
}

// ─── Delta / Entry 类型 ──────────────────────────────────────────────────────

export interface TileResourceDeltaEntry {
  resourceKey: string;
  tileIndex: number;
  value: number;
}

export interface TileResourcePersistenceDelta {
  fullReplace: boolean;
  upserts: TileResourceDeltaEntry[];
  deletes: { resourceKey: string; tileIndex: number }[];
}

export interface GroundPersistenceEntry {
  tileIndex: number;
  items: Record<string, unknown>[];
}

export interface GroundPersistenceDelta {
  fullReplace: boolean;
  tileIndices: number[];
  entries: GroundPersistenceEntry[];
}

export interface TileDamageEntry {
  tileIndex: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  destroyed: boolean;
  respawnLeft: number;
  modifiedAt: number;
}

export interface TileDamagePersistenceDelta {
  fullReplace: boolean;
  upserts: TileDamageEntry[];
  deletes: number[];
}

export interface MonsterRuntimeEntry {
  monsterRuntimeId: string;
  monsterId: string;
  monsterName: string;
  monsterTier: string;
  monsterLevel: number;
  tileIndex: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  qi: number;
  maxQi: number;
  alive: boolean;
  respawnLeft: number;
  respawnTicks: number;
  aggroTargetPlayerId: string | null;
  statePayload: Record<string, unknown>;
}

export interface MonsterRuntimePersistenceDelta {
  fullReplace: boolean;
  upserts: MonsterRuntimeEntry[];
  deletes: string[];
}

export interface AuraPersistenceEntry {
  tileIndex: number;
  value: number;
}

export interface TileResourcePersistenceEntry {
  resourceKey: string;
  tileIndex: number;
  value: number;
}

export interface TemporaryTilePersistenceEntry {
  tileIndex: number;
  x: number;
  y: number;
  tileType: string;
  hp: number;
  maxHp: number;
  expiresAtTick: number;
  ownerPlayerId: string | null;
  sourceSkillId: string | null;
  createdAt: number;
  modifiedAt: number;
}

export interface RuntimeTilePersistenceEntry {
  x: number;
  y: number;
  tileType: string;
  terrainType: string | undefined;
  surfaceType: string | null;
  structureType: string | null;
  interactableKinds: string[];
}

export interface OverlayPersistenceChunk {
  patchKind: string;
  chunkKey: string;
  patchVersion: number;
  patchPayload: Record<string, unknown>;
}

export interface BuildingCellPersistenceEntry {
  tileIndex: number;
  x: number;
  y: number;
  tileType: string;
  previousTileType: string;
  previousTerrainType: string;
  previousSurfaceType: string | null;
  previousStructureType: string | null;
  previousInteractableKinds: string[];
}

export interface BuildingPersistenceEntry {
  id: string;
  defId: string;
  cells: BuildingCellPersistenceEntry[];
  [key: string]: unknown;
}

export interface RoomCellPersistenceEntry {
  roomId: string;
  tileIndex: number;
  x: number;
  y: number;
  edgeFlags: number;
}

export interface BuildingRoomFengShuiPersistenceState {
  buildings: BuildingPersistenceEntry[];
  rooms: unknown[];
  roomCells: RoomCellPersistenceEntry[];
  fengShui: unknown[];
}

// ─── MapInstancePersistenceProjector 接口 ─────────────────────────────────────

export interface MapInstancePersistenceProjector {
  // Delta builders
  buildTileResourcePersistenceDelta(): TileResourcePersistenceDelta;
  buildGroundPersistenceDelta(): GroundPersistenceDelta;
  buildTileDamagePersistenceDelta(): TileDamagePersistenceDelta;
  buildMonsterRuntimePersistenceDelta(): MonsterRuntimePersistenceDelta;

  // Full entry builders
  buildAuraPersistenceEntries(): AuraPersistenceEntry[];
  buildTileResourcePersistenceEntries(): TileResourcePersistenceEntry[];
  buildGroundPersistenceEntries(): GroundPersistenceEntry[];
  buildTileDamagePersistenceEntries(): TileDamageEntry[];
  buildTemporaryTilePersistenceEntries(): TemporaryTilePersistenceEntry[];
  buildRuntimeTilePersistenceEntries(): RuntimeTilePersistenceEntry[];
  buildOverlayPersistenceChunks(): OverlayPersistenceChunk[];
  buildMonsterRuntimePersistenceEntries(): MonsterRuntimeEntry[];
  buildBuildingPersistenceEntries(): BuildingPersistenceEntry[];
  buildBuildingCellPersistenceEntries(buildingId: string): BuildingCellPersistenceEntry[];
  buildBuildingRoomFengShuiPersistenceState(): BuildingRoomFengShuiPersistenceState;
  buildRoomCellPersistenceEntries(): RoomCellPersistenceEntry[];

  // Dirty tracking
  isPersistentDirty(): boolean;
  getPersistenceRevision(): number;
  getDirtyDomains(): Set<string>;
  markPersistenceDirtyDomains(domains: string[]): void;
  markTileResourcePersistenceDirty(resourceKey: string, tileIndex: number): void;
  markTileDamagePersistenceDirty(tileIndex: number): void;
  markGroundItemPersistenceDirty(tileIndex: number): void;
  markMonsterRuntimePersistenceDirty(runtimeId: string): void;
  markPersistenceDomainsPersisted(domains: string[]): void;
  clearDirtyDomains(): void;
}

// ─── DirtyTracker 类 ──────────────────────────────────────────────────────────

export class DirtyTracker {
  private dirtyDomains: Set<string> = new Set();
  private fullReplaceDomains: Set<string> = new Set();
  private revision = 0;
  private persistedRevision = 0;

  private static readonly INCREMENTAL_DOMAINS: ReadonlySet<string> = new Set([
    PersistenceDomain.TileResource,
    PersistenceDomain.Ground,
    PersistenceDomain.TileDamage,
    PersistenceDomain.MonsterRuntime,
  ]);

  isDirty(): boolean {
    return this.dirtyDomains.size > 0;
  }

  getRevision(): number {
    return this.revision;
  }

  getDirtyDomains(): Set<string> {
    return this.dirtyDomains;
  }

  markDirty(domains: string[]): void {
    for (const domain of domains) {
      if (typeof domain === 'string' && domain.trim()) {
        const normalized = domain.trim();
        this.dirtyDomains.add(normalized);
        if (DirtyTracker.INCREMENTAL_DOMAINS.has(normalized)) {
          this.fullReplaceDomains.add(normalized);
        }
      }
    }
    this.revision += 1;
  }

  isFullReplace(domain: string): boolean {
    return this.fullReplaceDomains.has(domain);
  }

  markPersisted(domains: string[]): void {
    for (const domain of domains) {
      if (typeof domain === 'string' && domain.trim()) {
        const normalized = domain.trim();
        this.dirtyDomains.delete(normalized);
        this.fullReplaceDomains.delete(normalized);
      }
    }
    if (this.dirtyDomains.size === 0) {
      this.persistedRevision = this.revision;
    }
  }

  clear(): void {
    this.dirtyDomains.clear();
    this.fullReplaceDomains.clear();
  }
}

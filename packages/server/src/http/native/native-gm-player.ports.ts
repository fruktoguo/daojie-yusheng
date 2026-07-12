import type { ManagedAccountEntryLike } from './native-gm-player.helpers';

export interface ContentTemplateRepositoryLike {
  createItem(itemId: string, count?: number): Record<string, unknown> | null;
  getItemName(itemId: string): string | null;
  normalizeItem(input: unknown): unknown;
  hydrateTechniqueState(input: unknown): unknown;
}

export interface MapTemplateRepositoryLike {
  getOrThrow(mapId: string): any;
}

export interface PersistedPlayerEntryLike {
  playerId: string;
  snapshot: any;
}

export interface GmPlayerScopeOptions {
  playerIds?: unknown;
  targetPlayerIds?: unknown;
}

export interface PlayerDomainPersistenceServiceLike {
  loadProjectedSnapshot(
    playerId: string,
    buildStarterSnapshot: (playerId: string) => any | null,
  ): Promise<any | null>;
  savePlayerSnapshotProjectionDomains(
    playerId: string,
    snapshot: any,
    domains: Iterable<string>,
    options?: {
      allowInventoryEmptyOverwrite?: boolean;
      allowEquipmentEmptyOverwrite?: boolean;
      allowArtifactEmptyOverwrite?: boolean;
      allowBuffEmptyOverwrite?: boolean;
    },
  ): Promise<void>;
  listProjectedSnapshots(
    buildStarterSnapshot: (playerId: string) => any | null,
  ): Promise<PersistedPlayerEntryLike[]>;
}

export interface PlayerProgressionServiceLike {
  createRealmStateFromLevel(realmLv: number, progress: number): any;
  initializePlayer(snapshot: any): void;
}

export interface PlayerRuntimeServiceLike {
  snapshot(playerId: string): any;
  buildStarterPersistenceSnapshot(playerId: string): any;
  buildPersistenceSnapshot(playerId: string): any;
  restoreSnapshot(snapshot: any): void;
  listPlayerSnapshots(): any[];
  rebuildActionState(snapshot: any, tick: number): void;
  refreshOnlineTechniqueTemplates(): any;
  getPersistenceRevision(playerId: string): number | null;
  markPersisted(
    playerId: string,
    persistedDomains?: Iterable<string> | null,
    persistedRevision?: number | null,
  ): void;
  setManagedBodyTrainingLevel(playerId: string, level: number): any;
}

export interface MarketRuntimeServiceLike {
  getStorage(playerId: string): { items: any[] };
  runExclusiveMarketMutation(
    playerId: string,
    action: (context: any) => Promise<any> | any,
  ): Promise<any>;
  setStorage(playerId: string, storage: { items: any[] }, context: any): void;
  ensureStorageHydrated?(playerId: string): Promise<void>;
}

export interface ActivityPersistenceServiceLike {
  isEnabled(): boolean;
  loadMonthCard(playerId: string): Promise<{
    startAt: number;
    expireAt: number;
    totalPoolMerit: number;
    remainingPoolMerit: number;
    eternalEnabled: boolean;
    dailySignInFixedMeritBonus: number;
    lastClaimDate: string | null;
  } | null>;
  setMonthCardPool(
    playerId: string,
    totalPoolMerit: number,
    remainingPoolMerit: number,
    nowMs?: number,
    options?: { eternalEnabled?: boolean; dailySignInFixedMeritBonus?: number },
  ): Promise<{
    startAt: number;
    expireAt: number;
    totalPoolMerit: number;
    remainingPoolMerit: number;
    eternalEnabled: boolean;
    dailySignInFixedMeritBonus: number;
    lastClaimDate: string | null;
  }>;
  activateEternalMonthCard(
    playerId: string,
    nowMs?: number,
    poolGrant?: number,
    fixedSignInBonus?: number,
    durationDays?: number,
  ): Promise<{
    startAt: number;
    expireAt: number;
    totalPoolMerit: number;
    remainingPoolMerit: number;
    eternalEnabled: boolean;
    dailySignInFixedMeritBonus: number;
    lastClaimDate: string | null;
  }>;
}

export interface WorldRuntimeServiceLike {
  worldRuntimeCommandIntakeFacadeService: {
    enqueueGmUpdatePlayer(input: unknown): void;
    enqueueGmResetPlayer(playerId: string): void;
    enqueueGmSpawnBots(anchorPlayerId: string, count: number): void;
    enqueueGmRemoveBots(playerIds: string[], all: boolean): void;
  };
}

export interface NativeManagedAccountServiceLike {
  getManagedAccountIndex(playerIds: string[]): Promise<Map<string, ManagedAccountEntryLike>>;
}

export interface GmPlayerDatabaseTableViewLike {
  table: string;
  rowCount: number;
  payload: unknown;
}

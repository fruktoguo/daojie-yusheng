import {
  ActionDef,
  buildQiResourceKey,
  DEFAULT_AURA_LEVEL_BASE_VALUE,
  DEFAULT_QI_RESOURCE_DESCRIPTOR,
  Direction,
  MapMeta,
  MapMinimapMarker,
  MapRouteDomain,
  PlayerState,
  SyncedInventoryCooldownState,
  TechniqueState,
} from '@mud/shared';
import type { TimeService } from './time.service';
import type { DirtyFlag } from './player.service';

/** LastSentTickState：定义该接口的能力与字段约束。 */
export interface LastSentTickState {
  mapId?: string;
  hp?: number;
  qi?: number;
  facing?: Direction;
  auraLevelBaseValue?: number;
  pathVersion: number;
  timeState?: ReturnType<TimeService['buildPlayerTimeState']>;
  threatArrows?: Array<[string, string]>;
  visibleMinimapMarkers?: MapMinimapMarker[];
  visibilityKey?: string;
  tilePatchRevision?: number;
  mapMeta?: MapMeta;
  minimapSignature?: string;
  minimapLibrarySignature?: string;
}

export const REFINED_AURA_RESOURCE_KEY = buildQiResourceKey(DEFAULT_QI_RESOURCE_DESCRIPTOR);

/** ActionSyncStateEntry：定义该接口的能力与字段约束。 */
export interface ActionSyncStateEntry {
  id: string;
  name: string;
  desc: string;
  cooldownLeft: number;
  type: string;
  range?: number;
  requiresTarget?: boolean;
  targetMode?: 'any' | 'entity' | 'tile';
  autoBattleEnabled?: boolean;
  autoBattleOrder?: number;
  skillEnabled?: boolean;
}

/** ActionPanelSyncState：定义该接口的能力与字段约束。 */
export interface ActionPanelSyncState {
  autoBattle: boolean;
  autoUsePills: PlayerState['autoUsePills'];
  combatTargetingRules: NonNullable<PlayerState['combatTargetingRules']>;
  autoBattleTargetingMode: PlayerState['autoBattleTargetingMode'];
  autoRetaliate: boolean;
  autoBattleStationary: boolean;
  allowAoePlayerHit: boolean;
  autoIdleCultivation: boolean;
  autoSwitchCultivation: boolean;
  cultivationActive: boolean;
  senseQiActive: boolean;
}

/** SyncActionsOptions：定义该接口的能力与字段约束。 */
export interface SyncActionsOptions {
  skipQuestSync?: boolean;
}

/** TickConfigDocument：定义该接口的能力与字段约束。 */
export interface TickConfigDocument {
  version: 1;
  minTickInterval?: number;
  offlinePlayerTimeoutSec?: number;
  auraLevelBaseValue?: number;
}

export const SERVER_CONFIG_SCOPE = 'server_config';
export const TICK_CONFIG_DOCUMENT_KEY = 'tick_runtime';
export const DEFAULT_SYSTEM_ROUTE_DOMAINS: readonly MapRouteDomain[] = ['system'];
export const PERIODIC_SYNC_INTERVAL_MS = 60_000;
export const PERIODIC_SYNC_DIRTY_FLAGS: readonly DirtyFlag[] = ['attr', 'inv', 'equip', 'tech', 'actions', 'loot', 'quest'];
/** PersistTrigger：定义该类型的结构与数据语义。 */
export type PersistTrigger = 'interval' | 'interval_catchup' | 'maintenance' | 'shutdown';

/** normalizeConsumableBuffShortMark：执行对应的业务逻辑。 */
export function normalizeConsumableBuffShortMark(raw: string | undefined, fallbackName: string): string {
  const trimmed = raw?.trim();
  if (trimmed) {
    return [...trimmed][0] ?? trimmed;
  }
  const fallback = [...fallbackName.trim()][0];
  return fallback ?? '丹';
}

export const DEFAULT_TICK_CONFIG_DOCUMENT: TickConfigDocument = {
  version: 1,
  minTickInterval: 1000,
  offlinePlayerTimeoutSec: 60,
  auraLevelBaseValue: DEFAULT_AURA_LEVEL_BASE_VALUE,
};


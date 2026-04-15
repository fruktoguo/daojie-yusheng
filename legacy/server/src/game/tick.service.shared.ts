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
/** pathVersion：定义该变量以承载业务值。 */
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

/** REFINED_AURA_RESOURCE_KEY：定义该变量以承载业务值。 */
export const REFINED_AURA_RESOURCE_KEY = buildQiResourceKey(DEFAULT_QI_RESOURCE_DESCRIPTOR);

/** ActionSyncStateEntry：定义该接口的能力与字段约束。 */
export interface ActionSyncStateEntry {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** desc：定义该变量以承载业务值。 */
  desc: string;
/** cooldownLeft：定义该变量以承载业务值。 */
  cooldownLeft: number;
/** type：定义该变量以承载业务值。 */
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
/** autoBattle：定义该变量以承载业务值。 */
  autoBattle: boolean;
/** autoUsePills：定义该变量以承载业务值。 */
  autoUsePills: PlayerState['autoUsePills'];
/** combatTargetingRules：定义该变量以承载业务值。 */
  combatTargetingRules: NonNullable<PlayerState['combatTargetingRules']>;
/** autoBattleTargetingMode：定义该变量以承载业务值。 */
  autoBattleTargetingMode: PlayerState['autoBattleTargetingMode'];
/** autoRetaliate：定义该变量以承载业务值。 */
  autoRetaliate: boolean;
/** autoBattleStationary：定义该变量以承载业务值。 */
  autoBattleStationary: boolean;
/** allowAoePlayerHit：定义该变量以承载业务值。 */
  allowAoePlayerHit: boolean;
/** autoIdleCultivation：定义该变量以承载业务值。 */
  autoIdleCultivation: boolean;
/** autoSwitchCultivation：定义该变量以承载业务值。 */
  autoSwitchCultivation: boolean;
/** cultivationActive：定义该变量以承载业务值。 */
  cultivationActive: boolean;
/** senseQiActive：定义该变量以承载业务值。 */
  senseQiActive: boolean;
}

/** SyncActionsOptions：定义该接口的能力与字段约束。 */
export interface SyncActionsOptions {
  skipQuestSync?: boolean;
}

/** TickConfigDocument：定义该接口的能力与字段约束。 */
export interface TickConfigDocument {
/** version：定义该变量以承载业务值。 */
  version: 1;
  minTickInterval?: number;
  offlinePlayerTimeoutSec?: number;
  auraLevelBaseValue?: number;
}

/** SERVER_CONFIG_SCOPE：定义该变量以承载业务值。 */
export const SERVER_CONFIG_SCOPE = 'server_config';
/** TICK_CONFIG_DOCUMENT_KEY：定义该变量以承载业务值。 */
export const TICK_CONFIG_DOCUMENT_KEY = 'tick_runtime';
/** DEFAULT_SYSTEM_ROUTE_DOMAINS：定义该变量以承载业务值。 */
export const DEFAULT_SYSTEM_ROUTE_DOMAINS: readonly MapRouteDomain[] = ['system'];
/** PERIODIC_SYNC_INTERVAL_MS：定义该变量以承载业务值。 */
export const PERIODIC_SYNC_INTERVAL_MS = 60_000;
/** PERIODIC_SYNC_DIRTY_FLAGS：定义该变量以承载业务值。 */
export const PERIODIC_SYNC_DIRTY_FLAGS: readonly DirtyFlag[] = ['attr', 'inv', 'equip', 'tech', 'actions', 'loot', 'quest'];
/** PersistTrigger：定义该类型的结构与数据语义。 */
export type PersistTrigger = 'interval' | 'interval_catchup' | 'maintenance' | 'shutdown';

/** normalizeConsumableBuffShortMark：执行对应的业务逻辑。 */
export function normalizeConsumableBuffShortMark(raw: string | undefined, fallbackName: string): string {
/** trimmed：定义该变量以承载业务值。 */
  const trimmed = raw?.trim();
  if (trimmed) {
    return [...trimmed][0] ?? trimmed;
  }
/** fallback：定义该变量以承载业务值。 */
  const fallback = [...fallbackName.trim()][0];
  return fallback ?? '丹';
}

/** DEFAULT_TICK_CONFIG_DOCUMENT：定义该变量以承载业务值。 */
export const DEFAULT_TICK_CONFIG_DOCUMENT: TickConfigDocument = {
  version: 1,
  minTickInterval: 1000,
  offlinePlayerTimeoutSec: 60,
  auraLevelBaseValue: DEFAULT_AURA_LEVEL_BASE_VALUE,
};


/**
 * 本文件属于持久化边界，负责数据库真源、flush、兼容转换或失败策略等可靠性逻辑。
 *
 * 维护时要优先考虑幂等、崩溃恢复和自动清理，避免在 tick 内直接引入阻塞 IO。
 */
/**
 * 玩家分域持久化服务。
 * 管理 player_presence、player_wallet、player_world_anchor、player_position_checkpoint、
 * player_vitals、player_progression_core、player_attr_state、player_body_training_state、
 * player_inventory_item、player_equipment_slot、player_technique_state、player_persistent_buff_state、
 * player_quest_progress、player_combat_preferences、player_active_job、player_technique_activity_queue、player_enhancement_record、
 * player_logbook_message、player_offline_gain_*、player_statistic_day_total 等分域表，
 * 按域独立读写，支持增量刷盘、恢复水位和旧快照兼容水合。
 */
import { Inject, Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ARTIFACT_SLOTS, createItemStackSignature, DEFAULT_COMBAT_ATTACK_INTENSITY, DUNGEON_MAX_STAMINA, EQUIP_SLOTS, isCreatedTechniqueId, isLegacyItemInstanceId, normalizeCombatAttackIntensity, PLAYER_HEARTBEAT_TIMEOUT_MS, resolvePlayerFacingContentName, resolveRecoveredStamina, TechniqueRealm } from '@mud/shared';
import type { OfflineGainReportView, PlayerStatisticPeriodTotalView } from '@mud/shared';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { Pool } from 'pg';

import { ContentTemplateRepository } from '../content/content-template.repository';
import { DatabasePoolProvider } from './database-pool.provider';
import { resolveServerDatabaseUrl } from '../config/env-alias';
import { PersistenceWorkerPoolService } from '../concurrency/persistence-worker-pool.service';
import { buildPlayerSnapshotProjectionWritePlan, executePlayerDomainWritePlan, type PlayerDomainWritePlan, type PlayerDomainWritePlanPayload } from './player-domain-write-plan';
import {
  assignStableItemInstanceId,
  upsertEquipmentSlotRowsWithItemInstanceIdRepair,
  type EquipmentSlotPersistenceRow,
  type ItemInstanceIdPersistenceRowSource,
} from './compat/item-instance-id-compat';
import {
  buildPersistedEquipmentItemRawPayload,
  buildPersistedInventoryItemRawPayload,
  hydratePersistedEquipmentItem,
  hydratePersistedInventoryItem,
  type InventoryItemTemplateRepository,
} from './inventory-item-persistence';
import type { PersistedPlayerSnapshot } from './player-persistence.service';
export type { PersistedPlayerSnapshot };
import { ensureBigintColumnsWithClient, ensureDoubleColumnsWithClient } from './schema-bigint-migration';

export type TechniqueTemplateRepositoryPort = InventoryItemTemplateRepository & {
  hydrateTechniqueState?(input: Record<string, unknown>): Record<string, unknown> | null;
  createTechniqueState?(techniqueId: string): Record<string, unknown> | null;
  getTechniqueName?(techniqueId: string): string | null;
};
// 常量和低级工具函数从 helpers 导入
import {
  PLAYER_PRESENCE_TABLE,
  PLAYER_WALLET_TABLE,
  PLAYER_SECT_MEMBERSHIP_TABLE,
  PLAYER_WORLD_ANCHOR_TABLE,
  PLAYER_POSITION_CHECKPOINT_TABLE,
  PLAYER_VITALS_TABLE,
  PLAYER_PROGRESSION_CORE_TABLE,
  PLAYER_ATTR_STATE_TABLE,
  PLAYER_BODY_TRAINING_STATE_TABLE,
  PLAYER_INVENTORY_ITEM_TABLE,
  PLAYER_MARKET_STORAGE_ITEM_TABLE,
  PLAYER_MAP_UNLOCK_TABLE,
  PLAYER_EQUIPMENT_SLOT_TABLE,
  PLAYER_ARTIFACT_SLOT_TABLE,
  PLAYER_TECHNIQUE_STATE_TABLE,
  PLAYER_TECHNIQUE_COMPREHENSION_TABLE,
  PLAYER_PERSISTENT_BUFF_STATE_TABLE,
  PLAYER_QUEST_PROGRESS_TABLE,
  PLAYER_COMBAT_PREFERENCES_TABLE,
  PLAYER_AUTO_BATTLE_SKILL_TABLE,
  PLAYER_AUTO_USE_ITEM_RULE_TABLE,
  PLAYER_PROFESSION_STATE_TABLE,
  PLAYER_ALCHEMY_PRESET_TABLE,
  PLAYER_ACTIVE_JOB_TABLE,
  PLAYER_TECHNIQUE_ACTIVITY_QUEUE_TABLE,
  PLAYER_ENHANCEMENT_RECORD_TABLE,
  PLAYER_LOGBOOK_MESSAGE_TABLE,
  PLAYER_OFFLINE_GAIN_SESSION_TABLE,
  PLAYER_OFFLINE_GAIN_REPORT_TABLE,
  PLAYER_STATISTIC_DAY_TOTAL_TABLE,
  PLAYER_RECOVERY_WATERMARK_TABLE,
  PLAYER_DOMAIN_BIGINT_COLUMNS_BY_TABLE,
  PLAYER_DOMAIN_DOUBLE_COLUMNS_BY_TABLE,
  INVENTORY_TEMP_SLOT_BASE,
  PLAYER_DOMAIN_PROJECTED_TABLES,
  PLAYER_SNAPSHOT_PROJECTABLE_DIRTY_DOMAINS,
  WATERMARK_COLUMNS,
  PLAYER_PROJECTED_STATE_WATERMARK_COLUMNS,
  PLAYER_PROJECTION_WATERMARK_COLUMN_BY_DOMAIN,
  playerDomainModuleLogger,
  ensurePlayerDomainTables,
  ensurePlayerDomainTablesWithClient,
  querySingleRow,
  queryRows,
  indexRowsByPlayerId,
  indexMultiRowsByPlayerId,
  normalizeRequiredString,
  normalizeOptionalString,
  normalizeOptionalInteger,
  normalizeOptionalNumber,
  normalizeIntegerWithFallback,
  normalizeNumberWithFallback,
  normalizeMinimumInteger,
  normalizeMinimumNumber,
  normalizeVersionSeed,
  normalizePlayerIdList,
  normalizeOfflineGainReportPayload,
  normalizePlayerStatisticPeriodTotal,
  acquireSchemaInitLock,
  acquirePlayerPersistenceLock,
  assertPlayerSnapshotProjectionFenceCurrent,
  isConvergedPlayerProjectionFenceError,
  isConvergedPlayerPresenceFenceError,
  isSupersededPlayerFlushFenceError,
  isSupersededPlayerAssetFenceError,
  hasProjectedPlayerDomainState,
  hasAnyLoadedPlayerDomainState,
  buildProjectedSnapshotFromDomains,
  applyProjectedPlacement,
  applyProjectedWorldPreference,
  applyProjectedInventory,
  applyProjectedMapUnlocks,
  applyProjectedEquipment,
  applyProjectedArtifacts,
  applyProjectedTechniques,
  applyProjectedTechniqueComprehensions,
  hydrateProjectedTechniqueState,
  resolveProjectedTechniqueName,
  applyProjectedPersistentBuffs,
  applyProjectedQuestProgress,
  applyProjectedCombatPreferences,
  applyProjectedAutoBattleSkills,
  applyProjectedAutoUseItemRules,
  applyProjectedVitals,
  applyProjectedProgressionCore,
  applyProjectedAttrState,
  applyProjectedBodyTraining,
  applyProjectedProfessions,
  applyProjectedAlchemyPresets,
  applyProjectedActiveJob,
  applyProjectedTechniqueActivityQueue,
  applyProjectedEnhancementRecords,
  applyProjectedLogbook,
  resolveProjectedSnapshotSavedAt,
  projectEnhancementRecordsFromPersistenceRows,
  asRecord,
  decodeJsonValue,
  type RecoveryWatermarkColumn,
  type RecoveryWatermarkPatch,
} from './player-domain-persistence.helpers';
import {
  upsertRecoveryWatermark,
  canPruneEmptyTechniqueComprehensions,
  replacePlayerInventoryItems,
  replacePlayerWalletRows,
  replacePlayerMapUnlockRows,
  replacePlayerMarketStorageItems,
  replacePlayerEquipmentSlots,
  replacePlayerArtifactSlots,
  replacePlayerTechniqueStates,
  replacePlayerTechniqueComprehensions,
  replacePlayerPersistentBuffStates,
  replacePlayerQuestProgressRows,
  replacePlayerCombatPreferences,
  replacePlayerAutoBattleSkills,
  replacePlayerAutoUseItemRules,
  replacePlayerBodyTrainingState,
  replacePlayerAttrState,
  replacePlayerProfessionStates,
  replacePlayerAlchemyPresets,
  replacePlayerActiveJob,
  replacePlayerTechniqueActivityQueue,
  replacePlayerEnhancementRecords,
  replacePlayerLogbookMessages,
} from './player-domain-persistence.rows';
import {
  savePlayerSnapshotProjectionWithClient,
  savePlayerSnapshotProjectionDomainsWithClient,
  shouldApplyPlayerRecoveryWatermarkVersion,
  normalizeProjectedDirtyDomains,
  resolveApplicablePlayerSnapshotProjectionDomains,
  replacePlayerWorldAnchor,
  replacePlayerSectMembership,
  replacePlayerPositionCheckpoint,
  replacePlayerVitals,
  replacePlayerProgressionCore,
} from './player-domain-persistence.projection';
import {
  loadPlayerDomainsImpl,
  loadProjectedSnapshotImpl,
  listProjectedPlayerIdsImpl,
  listProjectedSnapshotsImpl,
  listLeaderboardSnapshotsImpl,
} from './player-domain-persistence.domains';

// re-export 供外部模块引用
export { ensurePlayerDomainTables } from './player-domain-persistence.helpers';
export { ensurePlayerDomainTablesWithClient } from './player-domain-persistence.helpers';
export { PLAYER_SNAPSHOT_PROJECTABLE_DIRTY_DOMAINS } from './player-domain-persistence.helpers';
export { PLAYER_DOMAIN_PROJECTED_TABLES } from './player-domain-persistence.helpers';
export { savePlayerSnapshotProjectionDomainsWithClient } from './player-domain-persistence.projection';
export { buildEnhancementRecordRowsFromEntries } from './player-domain-persistence.build-rows';
export { projectEnhancementRecordsFromPersistenceRows } from './player-domain-persistence.helpers';
export { canPruneEmptyTechniqueComprehensions } from './player-domain-persistence.rows';
export { isConvergedPlayerProjectionFenceError } from './player-domain-persistence.helpers';
export { isConvergedPlayerPresenceFenceError } from './player-domain-persistence.helpers';
export { isSupersededPlayerFlushFenceError } from './player-domain-persistence.helpers';
export { isSupersededPlayerAssetFenceError } from './player-domain-persistence.helpers';



let lastPlayerPersistenceVersion = 0;

/**
 * 生成进程内单调递增的玩家持久化版本。
 *
 * 同一毫秒内可能连续发生上线、离线或多次业务变更，不能直接把 `Date.now()` 当作唯一顺序；
 * durable replay 会继续使用载荷中已经固化的版本，不应在消费时重新生成。
 */
export function nextPlayerPersistenceVersion(nowInput: number = Date.now()): number {
  const now = Math.max(1, Math.trunc(Number.isFinite(nowInput) ? nowInput : Date.now()));
  const next = Math.max(now, lastPlayerPersistenceVersion + 1);
  lastPlayerPersistenceVersion = next;
  return next;
}

export interface PlayerPresenceUpsertInput {
  online: boolean;
  inWorld: boolean;
  lastHeartbeatAt?: number | null;
  offlineSinceAt?: number | null;
  runtimeOwnerId?: string | null;
  sessionEpoch?: number | null;
  transferState?: string | null;
  transferTargetNodeId?: string | null;
  versionSeed?: number | null;
}

export interface PersistedPlayerPresence {
  playerId: string;
  online: boolean;
  inWorld: boolean;
  lastHeartbeatAt: number | null;
  offlineSinceAt: number | null;
  runtimeOwnerId: string | null;
  sessionEpoch: number | null;
  transferState: string | null;
  transferTargetNodeId: string | null;
}

export interface PlayerRuntimeOwnershipClaim {
  runtimeOwnerId: string;
  sessionEpoch: number;
}

export interface PlayerWalletUpsertInput {
  walletType: string;
  balance: number;
  frozenBalance?: number | null;
  version?: number | null;
}

export interface PlayerDomainWriteOptions {
  versionSeed?: number | null;
  allowBuffEmptyOverwrite?: boolean;
}

export interface PlayerSnapshotProjectionDomainWriteOptions {
  allowInventoryEmptyOverwrite?: boolean;
  allowWalletEmptyOverwrite?: boolean;
  allowEquipmentEmptyOverwrite?: boolean;
  allowArtifactEmptyOverwrite?: boolean;
  allowBuffEmptyOverwrite?: boolean;
  expectedRuntimeOwnerId?: string | null;
  expectedSessionEpoch?: number | null;
  /**
   * durable staging 为本次投影分配的单调版本。
   * worker 必须在玩家事务锁内逐域比较 recovery watermark，旧版本不得覆盖较新的分域真源。
   */
  expectedProjectionVersion?: number | null;
}

export interface PlayerSnapshotProjectionDomainBatchEntry {
  snapshot: PersistedPlayerSnapshot;
  domains: Iterable<string>;
  options?: PlayerSnapshotProjectionDomainWriteOptions;
}

export interface PlayerDomainPruneOptions {
  allowEmptyOverwrite?: boolean;
}

export interface TechniqueComprehensionReplaceOptions {
  completedTechniqueIds?: ReadonlySet<string>;
  allowExplicitEmptyOverwrite?: boolean;
  explicitlyRemovedTechniqueIds?: ReadonlySet<string>;
}

export interface PlayerWorldAnchorUpsertInput {
  respawnTemplateId: string;
  respawnInstanceId?: string | null;
  respawnX: number;
  respawnY: number;
  lastSafeTemplateId: string;
  lastSafeInstanceId?: string | null;
  lastSafeX: number;
  lastSafeY: number;
  preferredLinePreset?: 'peaceful' | 'real' | null;
  lastTransferAt?: number | null;
}

export interface PlayerPositionCheckpointUpsertInput {
  instanceId: string;
  x: number;
  y: number;
  facing: number;
  checkpointKind: string;
}

export interface PlayerVitalsUpsertInput {
  hp: number;
  maxHp: number;
  qi: number;
  maxQi: number;
}

export interface PlayerProgressionCoreUpsertInput {
  foundation: number;
  rootFoundation?: number;
  combatExp: number;
  boneAgeBaseYears: number;
  lifeElapsedTicks: number;
  lifespanYears?: number | null;
  stamina?: number;
  staminaUpdatedAt?: number;
}

type DungeonStaminaSessionFence = Pick<
  PlayerSnapshotProjectionDomainWriteOptions,
  'expectedRuntimeOwnerId' | 'expectedSessionEpoch'
>;


export interface PlayerBodyTrainingStateUpsertInput {
  level: number;
  exp: number;
  expToNext: number;
}

export interface PlayerInventoryItemUpsertInput {
  itemId: string;
  count: number;
  slotIndex?: number | null;
  itemInstanceId?: string | null;
  enhanceLevel?: number | null;
  rawPayload?: Record<string, unknown> | null;
}

export interface PersistedInventoryRow {
  item_instance_id: string;
  slot_index: number;
  item_id: string;
  count: number;
  raw_payload: Record<string, unknown>;
  locked_by: string | null;
}

export interface PlayerMarketStorageItemUpsertInput {
  itemId: string;
  count: number;
  slotIndex?: number | null;
  storageItemId?: string | null;
  enhanceLevel?: number | null;
  rawPayload?: Record<string, unknown> | null;
}

export interface PlayerMapUnlockUpsertInput {
  mapId: string;
  unlockedAt?: number | null;
}

export interface PlayerEquipmentSlotUpsertInput {
  slot: (typeof EQUIP_SLOTS)[number];
  itemInstanceId?: string | null;
  item: Record<string, unknown> & { itemId: string };
}

export interface PlayerArtifactSlotUpsertInput {
  slot: (typeof ARTIFACT_SLOTS)[number];
  unlocked: boolean;
  enabled: boolean;
  qi: number;
  maxQi: number;
  item?: (Record<string, unknown> & { itemId: string }) | null;
  itemInstanceId?: string | null;
}

export interface PlayerLogbookMessageUpsertInput {
  id: string;
  kind: string;
  text: string;
  from?: string | null;
  at?: number | null;
  ackedAt?: number | null;
  structured?: Record<string, unknown> | null;
  structuredGroup?: Array<Record<string, unknown>> | null;
}

export interface PlayerOfflineGainSessionRecord {
  playerId: string;
  sessionId: string;
  startedAt: number;
  baselinePayload: Record<string, unknown>;
  accumulatedPayload?: Record<string, unknown>;
  accumulatedDurationMs?: number;
}

export interface PlayerOfflineGainSessionUpsertInput {
  sessionId: string;
  startedAt: number;
  baselinePayload: Record<string, unknown>;
  accumulatedPayload?: Record<string, unknown>;
  accumulatedDurationMs?: number;
}

export interface PlayerStatisticDayTotalRecord {
  playerId: string;
  dayKey: string;
  total: PlayerStatisticPeriodTotalView;
}

export interface AlchemyPresetRow {
  presetId: string;
  recipeId: string | null;
  name: string;
  ingredients: unknown[];
}

export interface AttrStateRow {
  baseAttrsPayload: Record<string, unknown> | null;
  bonusEntriesPayload: unknown[];
  revealedBreakthroughRequirementIds: string[];
  realmPayload: Record<string, unknown> | null;
  heavenGatePayload: Record<string, unknown> | null;
  spiritualRootsPayload: Record<string, unknown> | null;
}

export interface ProfessionStateRow {
  professionType: 'alchemy' | 'building' | 'gather' | 'enhancement' | 'forging' | 'mining' | 'formation' | 'transmission';
  level: number;
  exp: number | null;
  expToNext: number | null;
}

export interface TechniqueStateRow {
  techId: string;
  level: number;
  exp: number | null;
  expToNext: number | null;
  realmLv: number | null;
  skillsEnabled: boolean;
  rawPayload: Record<string, unknown>;
}

export interface TechniqueComprehensionRow {
  techId: string;
  sourceKind: string;
  progress: number;
  requiredProgress: number;
  realmLv: number | null;
  grade: string | null;
  category: string | null;
  creatorPlayerId: string | null;
  selfComprehensionAllowed: boolean;
  createdAtTick: number;
  updatedAtTick: number;
  activeTransferJobId: string | null;
  activeTransferTeacherId: string | null;
  rawPayload: Record<string, unknown>;
}

export interface QuestProgressRow {
  questId: string;
  status: string;
  progressPayload: Record<string, unknown> | unknown[] | null;
  rawPayload: Record<string, unknown>;
}

export interface PersistentBuffStateRow {
  buffId: string;
  sourceSkillId: string;
  sourceCasterId: string | null;
  realmLv: number | null;
  remainingTicks: number;
  duration: number;
  stacks: number;
  maxStacks: number;
  sustainTicksElapsed: number | null;
  rawPayload: Record<string, unknown>;
}

export interface CombatPreferencesRow {
  autoBattle: boolean;
  autoRetaliate: boolean;
  autoBattleStationary: boolean;
  autoBattleTargetingMode: string;
  retaliatePlayerTargetId: string | null;
  retaliatePlayerTargetLastAttackTick: number | null;
  combatTargetId: string | null;
  combatTargetLocked: boolean;
  allowAoePlayerHit: boolean;
  autoIdleCultivation: boolean;
  autoSwitchCultivation: boolean;
  autoRootFoundation: boolean;
  combatAttackIntensity: number;
  senseQiActive: boolean;
  cultivationActive: boolean;
  cultivatingTechId: string | null;
  targetingRulesPayload: Record<string, unknown> | null;
}

export interface AutoBattleSkillRow {
  skillId: string;
  enabled: boolean;
  skillEnabled: boolean;
  autoBattleOrder: number;
}

export interface AutoUseItemRuleRow {
  itemId: string;
  conditionPayload: unknown[];
}

export interface ActiveJobRow {
  jobRunId: string;
  jobType: 'alchemy' | 'forging' | 'enhancement' | 'formation' | 'transmission' | 'gather' | 'mining' | 'building';
  status: string;
  phase: string;
  startedAt: number;
  finishedAt: number | null;
  pausedTicks: number;
  totalTicks: number;
  remainingTicks: number;
  successRate: number;
  speedRate: number;
  jobVersion: number;
  detailJson: Record<string, unknown>;
}

export interface TechniqueActivityQueueRow {
  queueId: string;
  kind: string;
  state: string;
  label: string | null;
  targetLabel: string | null;
  sleepReason: string | null;
  retryAfterTicks: number | null;
  createdAt: number;
  payloadJson: unknown;
  cancelRefJson: unknown;
  detailJson: Record<string, unknown>;
}

export interface EnhancementRecordRow {
  recordId: string;
  itemId: string;
  itemName?: string | null;
  highestLevel: number;
  levelsPayload: unknown[];
  actionStartedAt: number | null;
  actionEndedAt: number | null;
  startLevel: number | null;
  initialTargetLevel: number | null;
  desiredTargetLevel: number | null;
  protectionStartLevel: number | null;
  status: string | null;
}

export type PlayerAttrStateUpsertInput = AttrStateRow;
export type PlayerTechniqueStateUpsertInput = TechniqueStateRow;
export type PlayerQuestProgressUpsertInput = QuestProgressRow;
export type PlayerPersistentBuffStateUpsertInput = PersistentBuffStateRow;
export type PlayerCombatPreferencesUpsertInput = CombatPreferencesRow;
export type PlayerAutoBattleSkillUpsertInput = AutoBattleSkillRow;
export type PlayerAutoUseItemRuleUpsertInput = AutoUseItemRuleRow;
export type PlayerProfessionStateUpsertInput = ProfessionStateRow;
export type PlayerAlchemyPresetUpsertInput = AlchemyPresetRow;
export type PlayerActiveJobUpsertInput = ActiveJobRow;
export type PlayerTechniqueActivityQueueUpsertInput = TechniqueActivityQueueRow;
export type PlayerEnhancementRecordUpsertInput = EnhancementRecordRow;

export interface PlayerWorldAnchorLoadRow {
  respawn_template_id?: unknown;
  respawn_instance_id?: unknown;
  respawn_x?: unknown;
  respawn_y?: unknown;
  last_safe_template_id?: unknown;
  last_safe_instance_id?: unknown;
  last_safe_x?: unknown;
  last_safe_y?: unknown;
  preferred_line_preset?: unknown;
  last_transfer_at?: unknown;
}

export interface PlayerPositionCheckpointLoadRow {
  instance_id?: unknown;
  x?: unknown;
  y?: unknown;
  facing?: unknown;
  checkpoint_kind?: unknown;
}

export interface PlayerVitalsLoadRow {
  hp?: unknown;
  max_hp?: unknown;
  qi?: unknown;
  max_qi?: unknown;
}

export interface PlayerProgressionCoreLoadRow {
  foundation?: unknown;
  root_foundation?: unknown;
  combat_exp?: unknown;
  bone_age_base_years?: unknown;
  life_elapsed_ticks?: unknown;
  lifespan_years?: unknown;
  stamina?: unknown;
  stamina_updated_at?: unknown;
}

export interface PlayerAttrStateLoadRow {
  base_attrs_payload?: unknown;
  bonus_entries_payload?: unknown;
  revealed_breakthrough_requirement_ids?: unknown;
  realm_payload?: unknown;
  heaven_gate_payload?: unknown;
  spiritual_roots_payload?: unknown;
}

export interface PlayerBodyTrainingLoadRow {
  level?: unknown;
  exp?: unknown;
  exp_to_next?: unknown;
}

export interface PlayerWalletLoadRow {
  wallet_type?: unknown;
  balance?: unknown;
  frozen_balance?: unknown;
  version?: unknown;
}

export interface PlayerSectMembershipLoadRow {
  sect_id?: unknown;
  updated_at_ms?: unknown;
}

export interface PlayerInventoryItemLoadRow {
  item_instance_id?: unknown;
  item_id?: unknown;
  count?: unknown;
  slot_index?: unknown;
  raw_payload?: unknown;
  locked_by?: unknown;
}

export interface PlayerMarketStorageItemLoadRow {
  storage_item_id?: unknown;
  item_id?: unknown;
  count?: unknown;
  slot_index?: unknown;
  enhance_level?: unknown;
  raw_payload?: unknown;
}

export interface PlayerMapUnlockLoadRow {
  map_id?: unknown;
  unlocked_at?: unknown;
}

export interface PlayerEquipmentSlotLoadRow {
  slot_type?: unknown;
  item_instance_id?: unknown;
  item_id?: unknown;
  raw_payload?: unknown;
}

export interface PlayerArtifactSlotLoadRow {
  slot_type?: unknown;
  unlocked?: unknown;
  enabled?: unknown;
  qi?: unknown;
  max_qi?: unknown;
  item_instance_id?: unknown;
  item_id?: unknown;
  raw_payload?: unknown;
}

export interface PlayerTechniqueStateLoadRow {
  tech_id?: unknown;
  level?: unknown;
  exp?: unknown;
  exp_to_next?: unknown;
  realm_lv?: unknown;
  skills_enabled?: unknown;
  raw_payload?: unknown;
}

export interface PlayerTechniqueComprehensionLoadRow {
  tech_id?: unknown;
  source_kind?: unknown;
  progress?: unknown;
  required_progress?: unknown;
  realm_lv?: unknown;
  grade?: unknown;
  category?: unknown;
  creator_player_id?: unknown;
  self_comprehension_allowed?: unknown;
  created_at_tick?: unknown;
  updated_at_tick?: unknown;
  active_transfer_job_id?: unknown;
  active_transfer_teacher_id?: unknown;
  raw_payload?: unknown;
}

export interface PlayerPersistentBuffStateLoadRow {
  buff_id?: unknown;
  source_skill_id?: unknown;
  source_caster_id?: unknown;
  realm_lv?: unknown;
  remaining_ticks?: unknown;
  duration?: unknown;
  stacks?: unknown;
  max_stacks?: unknown;
  sustain_ticks_elapsed?: unknown;
  raw_payload?: unknown;
}

export interface PlayerQuestProgressLoadRow {
  quest_id?: unknown;
  status?: unknown;
  progress_payload?: unknown;
  raw_payload?: unknown;
}

export interface PlayerCombatPreferencesLoadRow {
  auto_battle?: unknown;
  auto_retaliate?: unknown;
  auto_battle_stationary?: unknown;
  auto_battle_targeting_mode?: unknown;
  retaliate_player_target_id?: unknown;
  retaliate_player_target_last_attack_tick?: unknown;
  combat_target_id?: unknown;
  combat_target_locked?: unknown;
  allow_aoe_player_hit?: unknown;
  auto_idle_cultivation?: unknown;
  auto_switch_cultivation?: unknown;
  auto_root_foundation?: unknown;
  combat_attack_intensity?: unknown;
  sense_qi_active?: unknown;
  cultivation_active?: unknown;
  cultivating_tech_id?: unknown;
  targeting_rules_payload?: unknown;
}

export interface PlayerAutoBattleSkillLoadRow {
  skill_id?: unknown;
  enabled?: unknown;
  skill_enabled?: unknown;
  auto_battle_order?: unknown;
}

export interface PlayerAutoUseItemRuleLoadRow {
  item_id?: unknown;
  condition_payload?: unknown;
}

export interface PlayerProfessionStateLoadRow {
  profession_type?: unknown;
  level?: unknown;
  exp?: unknown;
  exp_to_next?: unknown;
}

export interface PlayerAlchemyPresetLoadRow {
  preset_id?: unknown;
  recipe_id?: unknown;
  name?: unknown;
  ingredients_payload?: unknown;
}

export interface PlayerActiveJobLoadRow {
  job_run_id?: unknown;
  job_type?: unknown;
  status?: unknown;
  phase?: unknown;
  started_at?: unknown;
  finished_at?: unknown;
  paused_ticks?: unknown;
  total_ticks?: unknown;
  remaining_ticks?: unknown;
  success_rate?: unknown;
  speed_rate?: unknown;
  job_version?: unknown;
  detail_jsonb?: unknown;
}

export interface PlayerTechniqueActivityQueueLoadRow {
  queue_id?: unknown;
  kind?: unknown;
  state?: unknown;
  label?: unknown;
  target_label?: unknown;
  sleep_reason?: unknown;
  retry_after_ticks?: unknown;
  created_at?: unknown;
  queue_order?: unknown;
  payload_jsonb?: unknown;
  cancel_ref_jsonb?: unknown;
  detail_jsonb?: unknown;
}

export interface PlayerEnhancementRecordLoadRow {
  recordId?: unknown;
  itemId?: unknown;
  itemName?: unknown;
  highestLevel?: unknown;
  levelsPayload?: unknown;
  actionStartedAt?: unknown;
  actionEndedAt?: unknown;
  startLevel?: unknown;
  initialTargetLevel?: unknown;
  desiredTargetLevel?: unknown;
  protectionStartLevel?: unknown;
  status?: unknown;
}

export interface PlayerLogbookMessageLoadRow {
  message_id?: unknown;
  kind?: unknown;
  text?: unknown;
  from_name?: unknown;
  occurred_at?: unknown;
  acked_at?: unknown;
  structured_payload?: unknown;
  structured_group_payload?: unknown;
}

export interface PlayerRecoveryWatermarkLoadRow {
  [key: string]: unknown;
}

export interface LoadedPlayerDomains {
  worldAnchor: PlayerWorldAnchorLoadRow | null;
  positionCheckpoint: PlayerPositionCheckpointLoadRow | null;
  vitals: PlayerVitalsLoadRow | null;
  progressionCore: PlayerProgressionCoreLoadRow | null;
  attrState: PlayerAttrStateLoadRow | null;
  bodyTraining: PlayerBodyTrainingLoadRow | null;
  sectMembership: PlayerSectMembershipLoadRow | null;
  walletRows: PlayerWalletLoadRow[];
  inventoryItems: PlayerInventoryItemLoadRow[];
  marketStorageItems: PlayerMarketStorageItemLoadRow[];
  mapUnlocks: PlayerMapUnlockLoadRow[];
  equipmentSlots: PlayerEquipmentSlotLoadRow[];
  artifactSlots: PlayerArtifactSlotLoadRow[];
  techniqueStates: PlayerTechniqueStateLoadRow[];
  techniqueComprehensions: PlayerTechniqueComprehensionLoadRow[];
  persistentBuffStates: PlayerPersistentBuffStateLoadRow[];
  questProgressRows: PlayerQuestProgressLoadRow[];
  combatPreferences: PlayerCombatPreferencesLoadRow | null;
  autoBattleSkills: PlayerAutoBattleSkillLoadRow[];
  autoUseItemRules: PlayerAutoUseItemRuleLoadRow[];
  professionStates: PlayerProfessionStateLoadRow[];
  alchemyPresets: PlayerAlchemyPresetLoadRow[];
  activeJob: PlayerActiveJobLoadRow | null;
  techniqueActivityQueue: PlayerTechniqueActivityQueueLoadRow[];
  enhancementRecords: PlayerEnhancementRecordLoadRow[];
  logbookMessages: PlayerLogbookMessageLoadRow[];
  recoveryWatermark: PlayerRecoveryWatermarkLoadRow | null;
  hasProjectedState: boolean;
}

/** 玩家分域持久化服务：按域独立管理玩家位置、钱包、背包、装备、功法、任务等状态的落库与恢复 */
@Injectable()
export class PlayerDomainPersistenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlayerDomainPersistenceService.name);
  pool: Pool | null = null;
  enabled = false;
  private startupMaintenancePromise: Promise<void> | null = null;

  constructor(
    @Optional()
    @Inject(ContentTemplateRepository)
    readonly contentTemplateRepository: TechniqueTemplateRepositoryPort | null = null,
    @Inject(DatabasePoolProvider)
    private readonly databasePoolProvider: DatabasePoolProvider | null = null,
    @Optional()
    @Inject(PersistenceWorkerPoolService)
    private readonly persistenceWorkerPool: PersistenceWorkerPoolService | null = null,
  ) {}

  async onModuleInit(): Promise<void> {
    const databaseUrl = resolveServerDatabaseUrl();
    if (!databaseUrl.trim()) {
      this.logger.log('玩家分域持久化已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
      return;
    }

    const sharedPool = this.databasePoolProvider?.getPool('player-domain') ?? null;
    if (!sharedPool) {
      this.logger.warn('玩家分域持久化已禁用：数据库连接池提供者未提供连接池');
      return;
    }
    this.pool = sharedPool;

    try {
      await ensurePlayerDomainTables(this.pool);
      this.enabled = true;
      this.logger.log('玩家分域持久化已启用');
    } catch (error: unknown) {
      this.logger.error(
        '玩家分域持久化初始化失败，已回退为禁用模式',
        error instanceof Error ? error.stack : String(error),
      );
      this.releasePoolReference();
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.releasePoolReference();
  }

  isEnabled(): boolean {
    return this.enabled && this.pool !== null;
  }

  /**
   * durable ledger 恢复完成后再执行启动修复。
   * 旧 session 的 owner/epoch 是历史 payload 的恢复围栏，不能在 replay 前提前清空。
   */
  runPostReplayStartupMaintenance(): Promise<void> {
    if (!this.pool || !this.enabled) {
      return Promise.resolve();
    }
    if (this.startupMaintenancePromise) {
      return this.startupMaintenancePromise;
    }
    const maintenance = (async () => {
      await this.expireStaleOnlinePresenceOnStartup();
      await this.repairOrphanEnhancementLockedItemsOnStartup();
      await this.cleanupDerivedRuntimeBonusEntriesOnStartup();
    })();
    this.startupMaintenancePromise = maintenance;
    return maintenance;
  }

  private async expireStaleOnlinePresenceOnStartup(): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }

    const now = Date.now();
    const staleOnlineCutoffMs = now - PLAYER_HEARTBEAT_TIMEOUT_MS;
    const result = await this.pool.query(
      `
        UPDATE ${PLAYER_PRESENCE_TABLE}
        SET
          online = false,
          offline_since_at = COALESCE(offline_since_at, $2::bigint),
          runtime_owner_id = NULL,
          updated_at = now()
        WHERE online IS TRUE
          AND COALESCE(last_heartbeat_at, 0) < $1::bigint
      `,
      [staleOnlineCutoffMs, now],
    );
    const expiredCount = Number(result.rowCount ?? 0);
    if (expiredCount > 0) {
      this.logger.log(`已清理陈旧玩家在线态：count=${expiredCount} timeoutMs=${PLAYER_HEARTBEAT_TIMEOUT_MS}`);
    }
  }

  private async cleanupDerivedRuntimeBonusEntriesOnStartup(): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }

    const result = await this.pool.query(`
      UPDATE ${PLAYER_ATTR_STATE_TABLE}
      SET
        bonus_entries_payload = (
          SELECT COALESCE(jsonb_agg(entry), '[]'::jsonb)
          FROM jsonb_array_elements(bonus_entries_payload) AS entry
          WHERE NOT (
            entry->>'source' IN (
              'runtime:realm_stage',
              'runtime:realm_state',
              'runtime:heaven_gate_roots',
              'runtime:technique_aggregate',
              'technique:aggregate',
              'realm:state',
              'realm:stage',
              'heaven_gate:roots'
            )
            OR entry->>'source' LIKE 'technique:%'
            OR entry->>'source' LIKE 'equipment:%'
            OR entry->>'source' LIKE 'equip:%'
            OR entry->>'source' LIKE 'equip-effect:%'
            OR entry->>'source' LIKE 'body_training:%'
            OR entry->>'source' LIKE 'buff:%'
          )
        ),
        updated_at = now()
      WHERE jsonb_typeof(bonus_entries_payload) = 'array'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(bonus_entries_payload) AS entry
          WHERE (
            entry->>'source' IN (
              'runtime:realm_stage',
              'runtime:realm_state',
              'runtime:heaven_gate_roots',
              'runtime:technique_aggregate',
              'technique:aggregate',
              'realm:state',
              'realm:stage',
              'heaven_gate:roots'
            )
            OR entry->>'source' LIKE 'technique:%'
            OR entry->>'source' LIKE 'equipment:%'
            OR entry->>'source' LIKE 'equip:%'
            OR entry->>'source' LIKE 'equip-effect:%'
            OR entry->>'source' LIKE 'body_training:%'
            OR entry->>'source' LIKE 'buff:%'
          )
        )
    `);
    const cleanedCount = Number(result.rowCount ?? 0);
    if (cleanedCount > 0) {
      this.logger.warn(`已清理玩家属性派生加成残留：count=${cleanedCount}`);
    }
  }

  private async repairOrphanEnhancementLockedItemsOnStartup(): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }

    const now = Date.now();
    const result = await this.pool.query(
      `
        WITH orphan_locked_candidates AS (
          SELECT
            i.player_id,
            i.item_instance_id,
            i.slot_index
          FROM ${PLAYER_INVENTORY_ITEM_TABLE} i
          LEFT JOIN ${PLAYER_ACTIVE_JOB_TABLE} j
            ON j.player_id = i.player_id
          WHERE i.locked_by LIKE 'enhancement:%'
            AND (
              j.player_id IS NULL
              OR j.job_type IS DISTINCT FROM 'enhancement'
              OR i.locked_by IS DISTINCT FROM ('enhancement:' || j.job_run_id)
            )
          FOR UPDATE OF i
        ),
        orphan_locked AS (
          SELECT
            player_id,
            item_instance_id,
            slot_index,
            row_number() OVER (
              PARTITION BY player_id
              ORDER BY slot_index ASC, item_instance_id ASC
            ) AS restore_order
          FROM orphan_locked_candidates
        ),
        visible_max_slot AS (
          SELECT
            i.player_id,
            COALESCE(MAX(i.slot_index), -1) AS max_slot_index
          FROM ${PLAYER_INVENTORY_ITEM_TABLE} i
          WHERE i.locked_by IS NULL
             OR i.locked_by = ''
          GROUP BY i.player_id
        ),
        restored AS (
          UPDATE ${PLAYER_INVENTORY_ITEM_TABLE} target
          SET
            slot_index = COALESCE(visible_max_slot.max_slot_index, -1) + orphan_locked.restore_order,
            locked_by = NULL,
            raw_payload = CASE
              WHEN jsonb_typeof(COALESCE(target.raw_payload, '{}'::jsonb)) = 'object'
                THEN COALESCE(target.raw_payload, '{}'::jsonb) - 'lockedAt'
              ELSE '{}'::jsonb
            END,
            updated_at = now()
          FROM orphan_locked
          LEFT JOIN visible_max_slot
            ON visible_max_slot.player_id = orphan_locked.player_id
          WHERE target.player_id = orphan_locked.player_id
            AND target.item_instance_id = orphan_locked.item_instance_id
          RETURNING target.player_id
        ),
        affected_players AS (
          SELECT player_id, COUNT(*)::bigint AS item_count
          FROM restored
          GROUP BY player_id
        )
        INSERT INTO ${PLAYER_RECOVERY_WATERMARK_TABLE}(
          player_id,
          inventory_version,
          updated_at
        )
        SELECT
          player_id,
          $1::bigint,
          now()
        FROM affected_players
        ON CONFLICT (player_id)
        DO UPDATE SET
          inventory_version = GREATEST(
            COALESCE(${PLAYER_RECOVERY_WATERMARK_TABLE}.inventory_version, 0),
            EXCLUDED.inventory_version
          ),
          updated_at = now()
        RETURNING player_id
      `,
      [now],
    );
    const affectedPlayerCount = Number(result.rowCount ?? 0);
    if (affectedPlayerCount > 0) {
      this.logger.warn(`已自动恢复异常强化锁定物品：players=${affectedPlayerCount}`);
    }
  }

  /** 写入/更新玩家在线状态（节点、session epoch、实例、心跳等） */
  async savePlayerPresence(playerId: string, input: PlayerPresenceUpsertInput): Promise<void> {
    const normalizedPlayerId = normalizeRequiredString(playerId);
    if (!this.pool || !this.enabled || !normalizedPlayerId) {
      return;
    }

    const versionSeed = normalizeVersionSeed(input.versionSeed);
    await this.withTransaction(async (client) => {
      await acquirePlayerPersistenceLock(client, normalizedPlayerId);
      const runtimeOwnerId = normalizeOptionalString(input.runtimeOwnerId);
      const sessionEpoch = normalizeMinimumInteger(input.sessionEpoch, 1, 1);
      const currentResult = await client.query<{
        session_epoch?: unknown;
        runtime_owner_id?: unknown;
        presence_version?: unknown;
      }>(
        `
          SELECT
            presence.session_epoch,
            presence.runtime_owner_id,
            COALESCE(watermark.presence_version, 0) AS presence_version
          FROM ${PLAYER_PRESENCE_TABLE} presence
          LEFT JOIN ${PLAYER_RECOVERY_WATERMARK_TABLE} watermark
            ON watermark.player_id = presence.player_id
          WHERE presence.player_id = $1
          FOR UPDATE OF presence
        `,
        [normalizedPlayerId],
      );
      const current = currentResult.rows[0];
      if (current) {
        const currentEpoch = normalizeMinimumInteger(current.session_epoch, 1, 1);
        const currentOwnerId = normalizeOptionalString(current.runtime_owner_id);
        if (sessionEpoch < currentEpoch
          || (sessionEpoch === currentEpoch && runtimeOwnerId !== currentOwnerId)) {
          throw new Error(`player_presence_stale_fence:${normalizedPlayerId}`);
        }
        const currentVersion = Math.max(0, normalizeOptionalInteger(current.presence_version) ?? 0);
        if (sessionEpoch === currentEpoch && versionSeed <= currentVersion) {
          return;
        }
      }
      const presenceWrite = await client.query(
        `
          INSERT INTO ${PLAYER_PRESENCE_TABLE}(
            player_id,
            online,
            in_world,
            last_heartbeat_at,
            offline_since_at,
            runtime_owner_id,
            session_epoch,
            transfer_state,
            transfer_target_node_id,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
          ON CONFLICT (player_id)
          DO UPDATE SET
            online = EXCLUDED.online,
            in_world = EXCLUDED.in_world,
            last_heartbeat_at = EXCLUDED.last_heartbeat_at,
            offline_since_at = EXCLUDED.offline_since_at,
            runtime_owner_id = EXCLUDED.runtime_owner_id,
            session_epoch = EXCLUDED.session_epoch,
            transfer_state = EXCLUDED.transfer_state,
            transfer_target_node_id = EXCLUDED.transfer_target_node_id,
            updated_at = now()
          WHERE EXCLUDED.session_epoch > ${PLAYER_PRESENCE_TABLE}.session_epoch
             OR (
               EXCLUDED.session_epoch = ${PLAYER_PRESENCE_TABLE}.session_epoch
               AND EXCLUDED.runtime_owner_id IS NOT DISTINCT FROM ${PLAYER_PRESENCE_TABLE}.runtime_owner_id
             )
          RETURNING player_id
        `,
        [
          normalizedPlayerId,
          input.online === true,
          input.inWorld === true,
          normalizeOptionalInteger(input.lastHeartbeatAt),
          normalizeOptionalInteger(input.offlineSinceAt),
          runtimeOwnerId,
          sessionEpoch,
          normalizeOptionalString(input.transferState),
          normalizeOptionalString(input.transferTargetNodeId),
        ],
      );
      if ((presenceWrite.rowCount ?? 0) === 0) {
        throw new Error(`player_presence_stale_fence:${normalizedPlayerId}`);
      }
      await upsertRecoveryWatermark(client, normalizedPlayerId, {
        presence_version: versionSeed,
      });
    });
  }

  /**
   * 原子认领玩家运行态所有权。
   *
   * claim 与普通 presence 写入共用玩家 advisory lock，并始终从数据库当前 epoch 递增，
   * 因而调用方不得用内存 epoch 推算或预生成 owner。启动批量恢复应先完成实例 lease 裁定，
   * 仅由最终接管该玩家的节点调用本方法。
   */
  async claimPlayerRuntimeOwnership(
    playerId: string,
    input: Omit<PlayerPresenceUpsertInput, 'runtimeOwnerId' | 'sessionEpoch'>,
  ): Promise<PlayerRuntimeOwnershipClaim | null> {
    const normalizedPlayerId = normalizeRequiredString(playerId);
    if (!this.pool || !this.enabled || !normalizedPlayerId) {
      return null;
    }

    const runtimeOwnerId = `rt:claim:${randomUUID()}`;
    const versionSeed = normalizeVersionSeed(input.versionSeed);
    return this.withTransaction(async (client) => {
      await acquirePlayerPersistenceLock(client, normalizedPlayerId);
      const currentResult = await client.query<{ session_epoch?: unknown }>(
        `SELECT session_epoch
           FROM ${PLAYER_PRESENCE_TABLE}
          WHERE player_id = $1
          FOR UPDATE`,
        [normalizedPlayerId],
      );
      const currentSessionEpoch = Math.max(
        0,
        normalizeOptionalInteger(currentResult.rows[0]?.session_epoch) ?? 0,
      );
      const sessionEpoch = currentSessionEpoch + 1;
      await client.query(
        `
          INSERT INTO ${PLAYER_PRESENCE_TABLE}(
            player_id,
            online,
            in_world,
            last_heartbeat_at,
            offline_since_at,
            runtime_owner_id,
            session_epoch,
            transfer_state,
            transfer_target_node_id,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
          ON CONFLICT (player_id)
          DO UPDATE SET
            online = EXCLUDED.online,
            in_world = EXCLUDED.in_world,
            last_heartbeat_at = EXCLUDED.last_heartbeat_at,
            offline_since_at = EXCLUDED.offline_since_at,
            runtime_owner_id = EXCLUDED.runtime_owner_id,
            session_epoch = EXCLUDED.session_epoch,
            transfer_state = EXCLUDED.transfer_state,
            transfer_target_node_id = EXCLUDED.transfer_target_node_id,
            updated_at = now()
        `,
        [
          normalizedPlayerId,
          input.online === true,
          input.inWorld === true,
          normalizeOptionalInteger(input.lastHeartbeatAt),
          normalizeOptionalInteger(input.offlineSinceAt),
          runtimeOwnerId,
          sessionEpoch,
          normalizeOptionalString(input.transferState),
          normalizeOptionalString(input.transferTargetNodeId),
        ],
      );
      await upsertRecoveryWatermark(client, normalizedPlayerId, {
        presence_version: versionSeed,
      });
      return { runtimeOwnerId, sessionEpoch };
    });
  }

  /** 加载玩家在线状态记录 */
  async loadPlayerPresence(playerId: string): Promise<PersistedPlayerPresence | null> {
    const normalizedPlayerId = normalizeRequiredString(playerId);
    if (!this.pool || !this.enabled || !normalizedPlayerId) {
      return null;
    }

    const result = await this.pool.query<{
      player_id?: string;
      online?: boolean;
      in_world?: boolean;
      last_heartbeat_at?: string | number | null;
      offline_since_at?: string | number | null;
      runtime_owner_id?: string | null;
      session_epoch?: string | number | null;
      transfer_state?: string | null;
      transfer_target_node_id?: string | null;
    }>(
      `
        SELECT
          player_id,
          online,
          in_world,
          last_heartbeat_at,
          offline_since_at,
          runtime_owner_id,
          session_epoch,
          transfer_state,
          transfer_target_node_id
        FROM ${PLAYER_PRESENCE_TABLE}
        WHERE player_id = $1
      `,
      [normalizedPlayerId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      playerId: normalizeRequiredString(row.player_id) || normalizedPlayerId,
      online: row.online === true,
      inWorld: row.in_world === true,
      lastHeartbeatAt: normalizeOptionalInteger(row.last_heartbeat_at),
      offlineSinceAt: normalizeOptionalInteger(row.offline_since_at),
      runtimeOwnerId: normalizeOptionalString(row.runtime_owner_id),
      sessionEpoch: normalizeOptionalInteger(row.session_epoch),
      transferState: normalizeOptionalString(row.transfer_state),
      transferTargetNodeId: normalizeOptionalString(row.transfer_target_node_id),
    };
  }

  async listPlayerPresence(playerIds: Iterable<string> | null | undefined): Promise<Map<string, PersistedPlayerPresence>> {
    if (!this.pool || !this.enabled) {
      return new Map();
    }
    const normalizedPlayerIds = Array.from(new Set(Array.from(playerIds ?? [])
      .map((playerId) => normalizeRequiredString(playerId))
      .filter((playerId) => playerId.length > 0)));
    if (normalizedPlayerIds.length === 0) {
      return new Map();
    }

    const result = await this.pool.query<{
      player_id?: string;
      online?: boolean;
      in_world?: boolean;
      last_heartbeat_at?: string | number | null;
      offline_since_at?: string | number | null;
      runtime_owner_id?: string | null;
      session_epoch?: string | number | null;
      transfer_state?: string | null;
      transfer_target_node_id?: string | null;
    }>(
      `
        SELECT
          player_id,
          online,
          in_world,
          last_heartbeat_at,
          offline_since_at,
          runtime_owner_id,
          session_epoch,
          transfer_state,
          transfer_target_node_id
        FROM ${PLAYER_PRESENCE_TABLE}
        WHERE player_id = ANY($1::text[])
      `,
      [normalizedPlayerIds],
    );

    const presences = new Map<string, PersistedPlayerPresence>();
    for (const row of result.rows ?? []) {
      const playerId = normalizeRequiredString(row.player_id);
      if (!playerId) {
        continue;
      }
      presences.set(playerId, {
        playerId,
        online: row.online === true,
        inWorld: row.in_world === true,
        lastHeartbeatAt: normalizeOptionalInteger(row.last_heartbeat_at),
        offlineSinceAt: normalizeOptionalInteger(row.offline_since_at),
        runtimeOwnerId: normalizeOptionalString(row.runtime_owner_id),
        sessionEpoch: normalizeOptionalInteger(row.session_epoch),
        transferState: normalizeOptionalString(row.transfer_state),
        transferTargetNodeId: normalizeOptionalString(row.transfer_target_node_id),
      });
    }
    return presences;
  }

  /** 保存玩家离线收益会话记录 */
  async savePlayerOfflineGainSession(
    playerId: string,
    input: PlayerOfflineGainSessionUpsertInput,
  ): Promise<void> {
    const normalizedPlayerId = normalizeRequiredString(playerId);
    const sessionId = normalizeRequiredString(input.sessionId);
    if (!this.pool || !this.enabled || !normalizedPlayerId || !sessionId) {
      return;
    }

    await this.withTransaction(async (client) => {
      await acquirePlayerPersistenceLock(client, normalizedPlayerId);
      await client.query(
        `
          INSERT INTO ${PLAYER_OFFLINE_GAIN_SESSION_TABLE}(
            player_id,
            session_id,
            started_at,
            baseline_payload,
            accumulated_payload,
            accumulated_duration_ms,
            updated_at
          )
          VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, now())
          ON CONFLICT (player_id)
          DO UPDATE SET
            session_id = EXCLUDED.session_id,
            started_at = EXCLUDED.started_at,
            baseline_payload = EXCLUDED.baseline_payload,
            accumulated_payload = EXCLUDED.accumulated_payload,
            accumulated_duration_ms = EXCLUDED.accumulated_duration_ms,
            updated_at = now()
        `,
        [
          normalizedPlayerId,
          sessionId,
          normalizeMinimumInteger(input.startedAt, Date.now(), 0),
          JSON.stringify(input.baselinePayload ?? {}),
          JSON.stringify(input.accumulatedPayload ?? {}),
          Math.max(0, Math.trunc(Number(input.accumulatedDurationMs) || 0)),
        ],
      );
    });
  }

  /** 加载玩家离线收益会话记录 */
  async loadPlayerOfflineGainSession(playerId: string): Promise<PlayerOfflineGainSessionRecord | null> {
    const normalizedPlayerId = normalizeRequiredString(playerId);
    if (!this.pool || !this.enabled || !normalizedPlayerId) {
      return null;
    }

    const result = await this.pool.query<{
      player_id?: unknown;
      session_id?: unknown;
      started_at?: unknown;
      baseline_payload?: unknown;
      accumulated_payload?: unknown;
      accumulated_duration_ms?: unknown;
    }>(
      `
        SELECT player_id, session_id, started_at, baseline_payload, accumulated_payload, accumulated_duration_ms
        FROM ${PLAYER_OFFLINE_GAIN_SESSION_TABLE}
        WHERE player_id = $1
      `,
      [normalizedPlayerId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    const sessionId = normalizeRequiredString(row.session_id);
    if (!sessionId) {
      return null;
    }
    return {
      playerId: normalizeRequiredString(row.player_id) || normalizedPlayerId,
      sessionId,
      startedAt: normalizeMinimumInteger(row.started_at, Date.now(), 0),
      baselinePayload: asRecord(decodeJsonValue(row.baseline_payload)) ?? {},
      accumulatedPayload: asRecord(decodeJsonValue(row.accumulated_payload)) ?? {},
      accumulatedDurationMs: Math.max(0, Math.trunc(Number(row.accumulated_duration_ms) || 0)),
    };
  }

  async deletePlayerOfflineGainSession(playerId: string, sessionId?: string | null): Promise<void> {
    const normalizedPlayerId = normalizeRequiredString(playerId);
    if (!this.pool || !this.enabled || !normalizedPlayerId) {
      return;
    }
    const normalizedSessionId = normalizeOptionalString(sessionId);
    await this.withTransaction(async (client) => {
      await acquirePlayerPersistenceLock(client, normalizedPlayerId);
      if (normalizedSessionId) {
        await client.query(
          `DELETE FROM ${PLAYER_OFFLINE_GAIN_SESSION_TABLE} WHERE player_id = $1 AND session_id = $2`,
          [normalizedPlayerId, normalizedSessionId],
        );
        return;
      }
      await client.query(
        `DELETE FROM ${PLAYER_OFFLINE_GAIN_SESSION_TABLE} WHERE player_id = $1`,
        [normalizedPlayerId],
      );
    });
  }

  /** 增量更新离线收益会话的累积数据（不覆盖 baseline） */
  async updatePlayerOfflineGainAccumulated(
    playerId: string,
    accumulatedPayload: Record<string, unknown>,
    accumulatedDurationMs: number,
  ): Promise<void> {
    const normalizedPlayerId = normalizeRequiredString(playerId);
    if (!this.pool || !this.enabled || !normalizedPlayerId) {
      return;
    }
    await this.pool.query(
      `
        UPDATE ${PLAYER_OFFLINE_GAIN_SESSION_TABLE}
        SET accumulated_payload = $2::jsonb,
            accumulated_duration_ms = $3,
            updated_at = now()
        WHERE player_id = $1
      `,
      [
        normalizedPlayerId,
        JSON.stringify(accumulatedPayload ?? {}),
        Math.max(0, Math.trunc(Number(accumulatedDurationMs) || 0)),
      ],
    );
  }

  /** 查询所有离线挂机中的玩家位置（in_world=true, online=false, 未超时） */
  async listOfflineHangingPlayerPositions(
    offlineTimeoutMs: number = 48 * 60 * 60 * 1000,
    extendedPlayerIds: string[] = [],
    extendedOfflineTimeoutMs: number = offlineTimeoutMs,
    permanentPlayerIds: string[] = [],
  ): Promise<Array<{
    playerId: string;
    instanceId: string;
    x: number;
    y: number;
  }>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const now = Date.now();
    const cutoffAt = now - Math.max(0, Math.trunc(offlineTimeoutMs));
    const extendedCutoffAt = now - Math.max(0, Math.trunc(extendedOfflineTimeoutMs));
    const normalizedExtendedPlayerIds = normalizePlayerIdList(extendedPlayerIds);
    const normalizedPermanentPlayerIds = normalizePlayerIdList(permanentPlayerIds);
    const result = await this.pool.query<{
      player_id?: unknown;
      instance_id?: unknown;
      x?: unknown;
      y?: unknown;
    }>(
      `
        SELECT p.player_id, pc.instance_id, pc.x, pc.y
        FROM ${PLAYER_PRESENCE_TABLE} p
        JOIN ${PLAYER_POSITION_CHECKPOINT_TABLE} pc ON pc.player_id = p.player_id
        WHERE p.in_world = true
          AND p.online = false
          AND pc.instance_id IS NOT NULL
          AND pc.instance_id <> ''
          AND (
            p.player_id = ANY($4::text[])
            OR
            COALESCE(p.offline_since_at, 0) >= $1
            OR (
              p.player_id = ANY($2::text[])
              AND COALESCE(p.offline_since_at, 0) >= $3
            )
          )
      `,
      [cutoffAt, normalizedExtendedPlayerIds, extendedCutoffAt, normalizedPermanentPlayerIds],
    );
    return result.rows
      .map((row) => ({
        playerId: normalizeRequiredString(row.player_id),
        instanceId: normalizeRequiredString(row.instance_id),
        x: Math.trunc(Number(row.x) || 0),
        y: Math.trunc(Number(row.y) || 0),
      }))
      .filter((entry) => entry.playerId.length > 0 && entry.instanceId.length > 0);
  }

  /** 查询仍保留在世界中的离线挂机玩家 ID，供 GM 批量操作限定目标范围。 */
  async listOfflineHangingPlayerIds(playerIds: Iterable<string> = []): Promise<string[]> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const normalizedPlayerIds = normalizePlayerIdList(playerIds);
    const params: unknown[] = [];
    const scopeClause = normalizedPlayerIds.length > 0
      ? `AND presence.player_id = ANY($1::text[])`
      : '';
    if (normalizedPlayerIds.length > 0) {
      params.push(normalizedPlayerIds);
    }
    const result = await this.pool.query<{ player_id?: unknown }>(
      `
        SELECT presence.player_id
        FROM ${PLAYER_PRESENCE_TABLE} presence
        WHERE presence.online = false
          AND presence.in_world = true
          AND presence.player_id NOT LIKE 'gm_bot_%'
          ${scopeClause}
        ORDER BY presence.player_id ASC
      `,
      params,
    );
    return (result.rows ?? [])
      .map((row) => normalizeRequiredString(row.player_id))
      .filter((playerId) => playerId.length > 0);
  }

  async hasOnlinePlayersInInstance(instanceId: string): Promise<boolean> {
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!this.pool || !this.enabled || !normalizedInstanceId) {
      return false;
    }
    const result = await this.pool.query(
      `
        SELECT 1
        FROM ${PLAYER_PRESENCE_TABLE} p
        JOIN ${PLAYER_POSITION_CHECKPOINT_TABLE} pc ON pc.player_id = p.player_id
        WHERE p.online = true
          AND pc.instance_id = $1
        LIMIT 1
      `,
      [normalizedInstanceId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** 拆除持久实例前检查在线与离线挂机位置，避免把仍在世界中的玩家留在孤儿实例。 */
  async hasRetainedPlayersInInstance(instanceId: string): Promise<boolean> {
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!this.pool || !this.enabled || !normalizedInstanceId) {
      return false;
    }
    const result = await this.pool.query(
      `
        SELECT 1
        FROM ${PLAYER_PRESENCE_TABLE} presence
        JOIN ${PLAYER_POSITION_CHECKPOINT_TABLE} position ON position.player_id = presence.player_id
        WHERE presence.in_world = true
          AND position.instance_id = $1
        LIMIT 1
      `,
      [normalizedInstanceId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** 密室准入读取在线与离线挂机占用者；返回 ID 便于与运行时占用集合去重。 */
  async listRetainedPlayerIdsInInstance(instanceId: string, limit = 101): Promise<string[]> {
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!this.pool || !this.enabled || !normalizedInstanceId) {
      return [];
    }
    const normalizedLimit = Math.max(1, Math.min(101, Math.trunc(Number(limit) || 101)));
    const result = await this.pool.query(
      `
        SELECT presence.player_id
        FROM ${PLAYER_PRESENCE_TABLE} presence
        JOIN ${PLAYER_POSITION_CHECKPOINT_TABLE} position ON position.player_id = presence.player_id
        WHERE presence.in_world = true
          AND position.instance_id = $1
        ORDER BY presence.player_id ASC
        LIMIT $2
      `,
      [normalizedInstanceId, normalizedLimit],
    );
    return (result.rows ?? [])
      .map((row) => normalizeRequiredString(row?.player_id))
      .filter((playerId) => playerId.length > 0);
  }

  /** 将超时离线玩家标记为彻底离线（in_world=false） */
  async expireOfflineHangingPlayers(
    offlineTimeoutMs: number = 48 * 60 * 60 * 1000,
    extendedPlayerIds: string[] = [],
    extendedOfflineTimeoutMs: number = offlineTimeoutMs,
    permanentPlayerIds: string[] = [],
  ): Promise<number> {
    if (!this.pool || !this.enabled) {
      return 0;
    }
    const now = Date.now();
    const cutoffAt = now - Math.max(0, Math.trunc(offlineTimeoutMs));
    const extendedCutoffAt = now - Math.max(0, Math.trunc(extendedOfflineTimeoutMs));
    const normalizedExtendedPlayerIds = normalizePlayerIdList(extendedPlayerIds);
    const normalizedPermanentPlayerIds = normalizePlayerIdList(permanentPlayerIds);
    const result = await this.pool.query(
      `
        UPDATE ${PLAYER_PRESENCE_TABLE}
        SET in_world = false, updated_at = now()
        WHERE in_world = true
          AND online = false
          AND NOT (player_id = ANY($4::text[]))
          AND COALESCE(offline_since_at, 0) < $1
          AND NOT (
            player_id = ANY($2::text[])
            AND COALESCE(offline_since_at, 0) >= $3
          )
      `,
      [cutoffAt, normalizedExtendedPlayerIds, extendedCutoffAt, normalizedPermanentPlayerIds],
    );
    return Number(result.rowCount ?? 0);
  }

  /** 保存玩家离线收益报告 */
  async savePlayerOfflineGainReport(playerId: string, report: OfflineGainReportView): Promise<void> {
    const normalizedPlayerId = normalizeRequiredString(playerId);
    const payload = this.normalizeOfflineGainReportForStorage(normalizedPlayerId, report);
    if (!this.pool || !this.enabled || !normalizedPlayerId || !payload) {
      return;
    }

    await this.withTransaction(async (client) => {
      await acquirePlayerPersistenceLock(client, normalizedPlayerId);
      await this.upsertPlayerOfflineGainReportWithClient(client, normalizedPlayerId, payload);
    });
  }

  /** 替换玩家当前未确认的收支报告；离线报告合并，在线报告保持独立范围。 */
  async replacePlayerOfflineGainReports(
    playerId: string,
    reports: OfflineGainReportView | readonly OfflineGainReportView[],
  ): Promise<void> {
    const normalizedPlayerId = normalizeRequiredString(playerId);
    const payloads = (Array.isArray(reports) ? reports : [reports])
      .map((report) => this.normalizeOfflineGainReportForStorage(normalizedPlayerId, report))
      .filter((report): report is OfflineGainReportView => Boolean(report));
    if (!this.pool || !this.enabled || !normalizedPlayerId || payloads.length === 0) {
      return;
    }

    await this.withTransaction(async (client) => {
      await acquirePlayerPersistenceLock(client, normalizedPlayerId);
      await client.query(
        `DELETE FROM ${PLAYER_OFFLINE_GAIN_REPORT_TABLE} WHERE player_id = $1`,
        [normalizedPlayerId],
      );
      for (const payload of payloads) {
        await this.upsertPlayerOfflineGainReportWithClient(client, normalizedPlayerId, payload);
      }
    });
  }

  async loadPlayerOfflineGainReports(playerId: string): Promise<OfflineGainReportView[]> {
    const normalizedPlayerId = normalizeRequiredString(playerId);
    if (!this.pool || !this.enabled || !normalizedPlayerId) {
      return [];
    }

    const result = await this.pool.query<{ payload?: unknown }>(
      `
        SELECT payload
        FROM ${PLAYER_OFFLINE_GAIN_REPORT_TABLE}
        WHERE player_id = $1
        ORDER BY started_at ASC, ended_at ASC
      `,
      [normalizedPlayerId],
    );
    return (result.rows ?? [])
      .map((row) => normalizeOfflineGainReportPayload(asRecord(decodeJsonValue(row.payload)), normalizedPlayerId))
      .filter((entry): entry is OfflineGainReportView => Boolean(entry));
  }

  async deletePlayerOfflineGainReports(playerId: string, reportIds: Iterable<string>): Promise<void> {
    const normalizedPlayerId = normalizeRequiredString(playerId);
    if (!this.pool || !this.enabled || !normalizedPlayerId) {
      return;
    }
    const normalizedReportIds = Array.from(new Set(Array.from(reportIds ?? [])
      .map((reportId) => normalizeRequiredString(reportId))
      .filter((reportId) => reportId.length > 0)));
    if (normalizedReportIds.length === 0) {
      return;
    }

    await this.withTransaction(async (client) => {
      await acquirePlayerPersistenceLock(client, normalizedPlayerId);
      await client.query(
        `
          DELETE FROM ${PLAYER_OFFLINE_GAIN_REPORT_TABLE}
          WHERE player_id = $1
            AND report_id = ANY($2::text[])
        `,
        [normalizedPlayerId, normalizedReportIds],
      );
    });
  }

  private normalizeOfflineGainReportForStorage(
    normalizedPlayerId: string,
    report: OfflineGainReportView,
  ): OfflineGainReportView | null {
    const reportId = normalizeRequiredString(report?.id);
    if (!normalizedPlayerId || !reportId) {
      return null;
    }
    return {
      ...report,
      id: reportId,
      playerId: normalizeOptionalString(report.playerId) ?? normalizedPlayerId,
      startedAt: normalizeMinimumInteger(report.startedAt, Date.now(), 0),
      endedAt: normalizeMinimumInteger(report.endedAt, Date.now(), 0),
      durationMs: normalizeMinimumInteger(report.durationMs, 0, 0),
      generatedAt: normalizeMinimumInteger(report.generatedAt, Date.now(), 0),
      items: Array.isArray(report.items) ? report.items : [],
      progress: Array.isArray(report.progress) ? report.progress : [],
      techniques: Array.isArray(report.techniques) ? report.techniques : [],
      professions: Array.isArray(report.professions) ? report.professions : [],
    };
  }

  private async upsertPlayerOfflineGainReportWithClient(
    client: PoolClient,
    normalizedPlayerId: string,
    payload: OfflineGainReportView,
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO ${PLAYER_OFFLINE_GAIN_REPORT_TABLE}(
          player_id,
          report_id,
          started_at,
          ended_at,
          duration_ms,
          payload,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, now())
        ON CONFLICT (player_id, report_id)
        DO UPDATE SET
          started_at = EXCLUDED.started_at,
          ended_at = EXCLUDED.ended_at,
          duration_ms = EXCLUDED.duration_ms,
          payload = EXCLUDED.payload,
          updated_at = now()
      `,
      [
        normalizedPlayerId,
        payload.id,
        payload.startedAt,
        payload.endedAt,
        payload.durationMs,
        JSON.stringify(payload),
      ],
    );
  }

  async incrementPlayerStatisticDayTotal(
    playerId: string,
    dayKey: string,
    delta: PlayerStatisticPeriodTotalView,
  ): Promise<void> {
    const normalizedPlayerId = normalizeRequiredString(playerId);
    const normalizedDayKey = normalizeRequiredString(dayKey);
    if (!this.pool || !this.enabled || !normalizedPlayerId || !normalizedDayKey) {
      return;
    }
    const normalizedDelta = normalizePlayerStatisticPeriodTotal(delta);
    await this.withTransaction(async (client) => {
      await acquirePlayerPersistenceLock(client, normalizedPlayerId);
      await client.query(
        `
          INSERT INTO ${PLAYER_STATISTIC_DAY_TOTAL_TABLE}(
            player_id,
            day_key,
            spirit_gained,
            spirit_lost,
            progress_gained,
            progress_lost,
            technique_gained,
            technique_lost,
            profession_gained,
            profession_lost,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
          ON CONFLICT (player_id, day_key)
          DO UPDATE SET
            spirit_gained = ${PLAYER_STATISTIC_DAY_TOTAL_TABLE}.spirit_gained + EXCLUDED.spirit_gained,
            spirit_lost = ${PLAYER_STATISTIC_DAY_TOTAL_TABLE}.spirit_lost + EXCLUDED.spirit_lost,
            progress_gained = ${PLAYER_STATISTIC_DAY_TOTAL_TABLE}.progress_gained + EXCLUDED.progress_gained,
            progress_lost = ${PLAYER_STATISTIC_DAY_TOTAL_TABLE}.progress_lost + EXCLUDED.progress_lost,
            technique_gained = ${PLAYER_STATISTIC_DAY_TOTAL_TABLE}.technique_gained + EXCLUDED.technique_gained,
            technique_lost = ${PLAYER_STATISTIC_DAY_TOTAL_TABLE}.technique_lost + EXCLUDED.technique_lost,
            profession_gained = ${PLAYER_STATISTIC_DAY_TOTAL_TABLE}.profession_gained + EXCLUDED.profession_gained,
            profession_lost = ${PLAYER_STATISTIC_DAY_TOTAL_TABLE}.profession_lost + EXCLUDED.profession_lost,
            updated_at = now()
        `,
        [
          normalizedPlayerId,
          normalizedDayKey,
          normalizedDelta.spiritStones.gained,
          normalizedDelta.spiritStones.lost,
          normalizedDelta.progress.gained,
          normalizedDelta.progress.lost,
          normalizedDelta.techniques.gained,
          normalizedDelta.techniques.lost,
          normalizedDelta.professions.gained,
          normalizedDelta.professions.lost,
        ],
      );
    });
  }

  /** 加载玩家每日统计汇总（按日期范围） */
  async loadPlayerStatisticDayTotals(
    playerId: string,
    dayKeys: readonly string[],
  ): Promise<PlayerStatisticDayTotalRecord[]> {
    const normalizedPlayerId = normalizeRequiredString(playerId);
    const normalizedDayKeys = Array.from(new Set((Array.isArray(dayKeys) ? dayKeys : [])
      .map((dayKey) => normalizeRequiredString(dayKey))
      .filter((dayKey) => dayKey.length > 0)));
    if (!this.pool || !this.enabled || !normalizedPlayerId || normalizedDayKeys.length === 0) {
      return [];
    }
    const result = await this.pool.query<{
      player_id?: unknown;
      day_key?: unknown;
      spirit_gained?: unknown;
      spirit_lost?: unknown;
      progress_gained?: unknown;
      progress_lost?: unknown;
      technique_gained?: unknown;
      technique_lost?: unknown;
      profession_gained?: unknown;
      profession_lost?: unknown;
    }>(
      `
        SELECT
          player_id,
          day_key,
          spirit_gained,
          spirit_lost,
          progress_gained,
          progress_lost,
          technique_gained,
          technique_lost,
          profession_gained,
          profession_lost
        FROM ${PLAYER_STATISTIC_DAY_TOTAL_TABLE}
        WHERE player_id = $1
          AND day_key = ANY($2::text[])
      `,
      [normalizedPlayerId, normalizedDayKeys],
    );
    return (result.rows ?? [])
      .map((row) => {
        const dayKey = normalizeRequiredString(row.day_key);
        if (!dayKey) {
          return null;
        }
        return {
          playerId: normalizeRequiredString(row.player_id) || normalizedPlayerId,
          dayKey,
          total: normalizePlayerStatisticPeriodTotal({
            spiritStones: {
              gained: row.spirit_gained,
              lost: row.spirit_lost,
              net: Number(row.spirit_gained ?? 0) - Number(row.spirit_lost ?? 0),
            },
            progress: {
              gained: row.progress_gained,
              lost: row.progress_lost,
              net: Number(row.progress_gained ?? 0) - Number(row.progress_lost ?? 0),
            },
            techniques: {
              gained: row.technique_gained,
              lost: row.technique_lost,
              net: Number(row.technique_gained ?? 0) - Number(row.technique_lost ?? 0),
            },
            professions: {
              gained: row.profession_gained,
              lost: row.profession_lost,
              net: Number(row.profession_gained ?? 0) - Number(row.profession_lost ?? 0),
            },
          }),
        };
      })
      .filter((entry): entry is PlayerStatisticDayTotalRecord => Boolean(entry));
  }

  /** 保存玩家世界锚点（重生点/安全点） */
  async savePlayerWorldAnchor(
    playerId: string,
    input: PlayerWorldAnchorUpsertInput,
    options: PlayerDomainWriteOptions = {},
  ): Promise<void> {
    await this.saveProjectedDomain(playerId, options.versionSeed, ['anchor_version'], (client, normalizedPlayerId) =>
      replacePlayerWorldAnchor(client, normalizedPlayerId, input),
    );
  }

  async savePlayerPositionCheckpoint(
    playerId: string,
    input: PlayerPositionCheckpointUpsertInput,
    options: PlayerDomainWriteOptions = {},
  ): Promise<void> {
    await this.saveProjectedDomain(
      playerId,
      options.versionSeed,
      ['position_checkpoint_version'],
      (client, normalizedPlayerId) => replacePlayerPositionCheckpoint(client, normalizedPlayerId, input),
    );
  }

  async savePlayerVitals(
    playerId: string,
    input: PlayerVitalsUpsertInput,
    options: PlayerDomainWriteOptions = {},
  ): Promise<void> {
    await this.saveProjectedDomain(playerId, options.versionSeed, ['vitals_version'], (client, normalizedPlayerId) =>
      replacePlayerVitals(client, normalizedPlayerId, input),
    );
  }

  async savePlayerProgressionCore(
    playerId: string,
    input: PlayerProgressionCoreUpsertInput,
    options: PlayerDomainWriteOptions = {},
  ): Promise<void> {
    await this.saveProjectedDomain(playerId, options.versionSeed, ['progression_version'], (client, normalizedPlayerId) =>
      replacePlayerProgressionCore(client, normalizedPlayerId, input),
    );
  }

  /** 在 progression 行锁内结算恢复并扣除副本精力，避免并发进入覆盖彼此的余额。 */
  async consumeDungeonStaminaAtomic(
    playerIdInput: string,
    costInput: number,
    now: number,
    fence: DungeonStaminaSessionFence,
  ): Promise<{ ok: boolean; current: number; maximum: number; updatedAt: number; nextRecoveryAt?: number }> {
    const playerId = normalizeRequiredString(playerIdInput);
    const cost = Math.max(0, Math.trunc(Number(costInput) || 0));
    if (!playerId) throw new Error('player_id_required');
    return this.withTransaction(async (client) => {
      await acquirePlayerPersistenceLock(client, playerId);
      await assertPlayerSnapshotProjectionFenceCurrent(client, playerId, fence);
      let result = await client.query(
        `SELECT stamina, stamina_updated_at FROM ${PLAYER_PROGRESSION_CORE_TABLE} WHERE player_id = $1 FOR UPDATE`,
        [playerId],
      );
      if (!result.rows?.[0]) {
        await client.query(
          `INSERT INTO ${PLAYER_PROGRESSION_CORE_TABLE}(player_id, stamina, stamina_updated_at) VALUES ($1, $2, $3) ON CONFLICT (player_id) DO NOTHING`,
          [playerId, DUNGEON_MAX_STAMINA, now],
        );
        result = await client.query(
          `SELECT stamina, stamina_updated_at FROM ${PLAYER_PROGRESSION_CORE_TABLE} WHERE player_id = $1 FOR UPDATE`,
          [playerId],
        );
      }
      const row = result.rows?.[0] ?? {};
      const recovered = resolveRecoveredStamina(
        Number(row.stamina ?? DUNGEON_MAX_STAMINA),
        Number(row.stamina_updated_at ?? now),
        now,
      );
      if (recovered.current < cost) {
        if (recovered.current !== Number(row.stamina) || recovered.updatedAt !== Number(row.stamina_updated_at)) {
          await client.query(
            `UPDATE ${PLAYER_PROGRESSION_CORE_TABLE} SET stamina = $2, stamina_updated_at = $3, updated_at = now() WHERE player_id = $1`,
            [playerId, recovered.current, recovered.updatedAt],
          );
        }
        return { ok: false, current: recovered.current, maximum: DUNGEON_MAX_STAMINA, updatedAt: recovered.updatedAt, ...(recovered.nextRecoveryAt ? { nextRecoveryAt: recovered.nextRecoveryAt } : {}) };
      }
      const nextCurrent = recovered.current - cost;
      await client.query(
        `UPDATE ${PLAYER_PROGRESSION_CORE_TABLE} SET stamina = $2, stamina_updated_at = $3, updated_at = now() WHERE player_id = $1`,
        [playerId, nextCurrent, now],
      );
      return { ok: true, current: nextCurrent, maximum: DUNGEON_MAX_STAMINA, updatedAt: now, ...(nextCurrent < DUNGEON_MAX_STAMINA ? { nextRecoveryAt: now + 60 * 60 * 1000 } : {}) };
    });
  }

  async refundDungeonStaminaAtomic(
    playerIdInput: string,
    amountInput: number,
    now: number,
    fence: DungeonStaminaSessionFence,
  ): Promise<{ current: number; maximum: number; updatedAt: number; nextRecoveryAt?: number }> {
    const playerId = normalizeRequiredString(playerIdInput);
    const amount = Math.max(0, Math.trunc(Number(amountInput) || 0));
    if (!playerId) throw new Error('player_id_required');
    return this.withTransaction(async (client) => {
      await acquirePlayerPersistenceLock(client, playerId);
      await assertPlayerSnapshotProjectionFenceCurrent(client, playerId, fence);
      const result = await client.query(
        `SELECT stamina, stamina_updated_at FROM ${PLAYER_PROGRESSION_CORE_TABLE} WHERE player_id = $1 FOR UPDATE`,
        [playerId],
      );
      const row = result.rows?.[0] ?? {};
      const recovered = resolveRecoveredStamina(Number(row.stamina ?? DUNGEON_MAX_STAMINA), Number(row.stamina_updated_at ?? now), now);
      const nextCurrent = Math.min(DUNGEON_MAX_STAMINA, recovered.current + amount);
      await client.query(
        `INSERT INTO ${PLAYER_PROGRESSION_CORE_TABLE}(player_id, stamina, stamina_updated_at) VALUES ($1, $2, $3)
         ON CONFLICT (player_id) DO UPDATE SET stamina = EXCLUDED.stamina, stamina_updated_at = EXCLUDED.stamina_updated_at, updated_at = now()`,
        [playerId, nextCurrent, now],
      );
      return { current: nextCurrent, maximum: DUNGEON_MAX_STAMINA, updatedAt: now, ...(nextCurrent < DUNGEON_MAX_STAMINA ? { nextRecoveryAt: now + 60 * 60 * 1000 } : {}) };
    });
  }

  /** 一次事务锁定全队精力行，确保“全员足够才统一扣除”，不会出现部分扣除。 */
  async consumeDungeonStaminaForPlayersAtomic(
    playerIdsInput: readonly string[],
    costInput: number,
    now: number,
    fences: Readonly<Record<string, DungeonStaminaSessionFence | undefined>>,
  ): Promise<{ ok: boolean; reason?: string; views: Record<string, { current: number; maximum: number; updatedAt: number; nextRecoveryAt?: number }> }> {
    const playerIds = [...new Set(playerIdsInput.map((value) => normalizeRequiredString(value)).filter(Boolean))].sort();
    const cost = Math.max(0, Math.trunc(Number(costInput) || 0));
    if (playerIds.length === 0) throw new Error('player_ids_required');
    return this.withTransaction(async (client) => {
      for (const playerId of playerIds) {
        await acquirePlayerPersistenceLock(client, playerId);
      }
      for (const playerId of playerIds) {
        const fence = fences[playerId];
        if (!fence) throw new Error(`dungeon_stamina_session_fence_required:${playerId}`);
        await assertPlayerSnapshotProjectionFenceCurrent(client, playerId, fence);
      }
      const rows = new Map<string, any>();
      for (const playerId of playerIds) {
        const result = await client.query(
          `SELECT stamina, stamina_updated_at FROM ${PLAYER_PROGRESSION_CORE_TABLE} WHERE player_id = $1 FOR UPDATE`,
          [playerId],
        );
        if (result.rows?.[0]) rows.set(playerId, result.rows[0]);
        else {
          await client.query(
            `INSERT INTO ${PLAYER_PROGRESSION_CORE_TABLE}(player_id, stamina, stamina_updated_at) VALUES ($1, $2, $3) ON CONFLICT (player_id) DO NOTHING`,
            [playerId, DUNGEON_MAX_STAMINA, now],
          );
          const inserted = await client.query(
            `SELECT stamina, stamina_updated_at FROM ${PLAYER_PROGRESSION_CORE_TABLE} WHERE player_id = $1 FOR UPDATE`,
            [playerId],
          );
          rows.set(playerId, inserted.rows?.[0] ?? { stamina: DUNGEON_MAX_STAMINA, stamina_updated_at: now });
        }
      }
      const views: Record<string, { current: number; maximum: number; updatedAt: number; nextRecoveryAt?: number }> = {};
      let insufficient = false;
      for (const playerId of playerIds) {
        const row = rows.get(playerId) ?? {};
        const recovered = resolveRecoveredStamina(Number(row.stamina ?? DUNGEON_MAX_STAMINA), Number(row.stamina_updated_at ?? now), now);
        views[playerId] = { current: recovered.current, maximum: DUNGEON_MAX_STAMINA, updatedAt: recovered.updatedAt, ...(recovered.nextRecoveryAt ? { nextRecoveryAt: recovered.nextRecoveryAt } : {}) };
        if (recovered.current < cost) insufficient = true;
      }
      if (insufficient) {
        for (const playerId of playerIds) {
          const view = views[playerId]!;
          const row = rows.get(playerId) ?? {};
          if (view.current !== Number(row.stamina) || view.updatedAt !== Number(row.stamina_updated_at)) {
            await client.query(
              `UPDATE ${PLAYER_PROGRESSION_CORE_TABLE} SET stamina = $2, stamina_updated_at = $3, updated_at = now() WHERE player_id = $1`,
              [playerId, view.current, view.updatedAt],
            );
          }
        }
        return { ok: false, reason: 'stamina_insufficient', views };
      }
      for (const playerId of playerIds) {
        const nextCurrent = views[playerId]!.current - cost;
        views[playerId] = { current: nextCurrent, maximum: DUNGEON_MAX_STAMINA, updatedAt: now, ...(nextCurrent < DUNGEON_MAX_STAMINA ? { nextRecoveryAt: now + 60 * 60 * 1000 } : {}) };
        await client.query(
          `UPDATE ${PLAYER_PROGRESSION_CORE_TABLE} SET stamina = $2, stamina_updated_at = $3, updated_at = now() WHERE player_id = $1`,
          [playerId, nextCurrent, now],
        );
      }
      return { ok: true, views };
    });
  }

  async savePlayerAttrState(
    playerId: string,
    input: PlayerAttrStateUpsertInput | null,
    options: PlayerDomainWriteOptions = {},
  ): Promise<void> {
    await this.saveProjectedDomain(playerId, options.versionSeed, ['attr_version'], (client, normalizedPlayerId) =>
      replacePlayerAttrState(client, normalizedPlayerId, input),
    );
  }

  async savePlayerWallet(
    playerId: string,
    rows: readonly PlayerWalletUpsertInput[],
    options: PlayerDomainWriteOptions = {},
  ): Promise<void> {
    await this.saveProjectedDomain(playerId, options.versionSeed, ['wallet_version'], (client, normalizedPlayerId, versionSeed) =>
      replacePlayerWalletRows(client, normalizedPlayerId, [...rows], versionSeed),
    );
  }

  async savePlayerInventoryItems(
    playerId: string,
    items: readonly PlayerInventoryItemUpsertInput[],
    options: PlayerDomainWriteOptions = {},
  ): Promise<void> {
    await this.saveProjectedDomain(playerId, options.versionSeed, ['inventory_version'], (client, normalizedPlayerId) =>
      replacePlayerInventoryItems(client, normalizedPlayerId, [...items]),
    );
  }

  async savePlayerMarketStorageItems(
    playerId: string,
    items: readonly PlayerMarketStorageItemUpsertInput[],
    options: PlayerDomainWriteOptions = {},
  ): Promise<void> {
    await this.saveProjectedDomain(
      playerId,
      options.versionSeed,
      ['market_storage_version'],
      (client, normalizedPlayerId) => replacePlayerMarketStorageItems(client, normalizedPlayerId, [...items]),
    );
  }

  async savePlayerMapUnlocks(
    playerId: string,
    rows: readonly PlayerMapUnlockUpsertInput[],
    options: PlayerDomainWriteOptions = {},
  ): Promise<void> {
    await this.saveProjectedDomain(playerId, options.versionSeed, ['map_unlock_version'], async (client, normalizedPlayerId, versionSeed) =>
      replacePlayerMapUnlockRows(client, normalizedPlayerId, rows, versionSeed),
    );
  }

  async savePlayerEquipmentSlots(
    playerId: string,
    slots: readonly PlayerEquipmentSlotUpsertInput[],
    options: PlayerDomainWriteOptions = {},
  ): Promise<void> {
    await this.saveProjectedDomain(playerId, options.versionSeed, ['equipment_version'], (client, normalizedPlayerId) =>
      replacePlayerEquipmentSlots(client, normalizedPlayerId, [...slots]),
    );
  }

  async savePlayerArtifactSlots(
    playerId: string,
    slots: readonly PlayerArtifactSlotUpsertInput[],
    options: PlayerDomainWriteOptions = {},
  ): Promise<void> {
    await this.saveProjectedDomain(playerId, options.versionSeed, ['artifact_version'], (client, normalizedPlayerId) =>
      replacePlayerArtifactSlots(client, normalizedPlayerId, [...slots]),
    );
  }

  async savePlayerTechniques(
    playerId: string,
    rows: readonly PlayerTechniqueStateUpsertInput[],
    options: PlayerDomainWriteOptions = {},
  ): Promise<void> {
    await this.saveProjectedDomain(playerId, options.versionSeed, ['technique_version'], (client, normalizedPlayerId) =>
      replacePlayerTechniqueStates(client, normalizedPlayerId, [...rows]),
    );
  }

  async savePlayerBodyTraining(
    playerId: string,
    input: PlayerBodyTrainingStateUpsertInput | null,
    options: PlayerDomainWriteOptions = {},
  ): Promise<void> {
    await this.saveProjectedDomain(playerId, options.versionSeed, ['body_training_version'], (client, normalizedPlayerId) =>
      replacePlayerBodyTrainingState(client, normalizedPlayerId, input),
    );
  }

  async savePlayerQuests(
    playerId: string,
    rows: readonly PlayerQuestProgressUpsertInput[],
    options: PlayerDomainWriteOptions = {},
  ): Promise<void> {
    await this.saveProjectedDomain(playerId, options.versionSeed, ['quest_version'], (client, normalizedPlayerId) =>
      replacePlayerQuestProgressRows(client, normalizedPlayerId, [...rows]),
    );
  }

  async savePlayerCombatPreferences(
    playerId: string,
    input: PlayerCombatPreferencesUpsertInput | null,
    options: PlayerDomainWriteOptions = {},
  ): Promise<void> {
    await this.saveProjectedDomain(playerId, options.versionSeed, ['combat_pref_version'], (client, normalizedPlayerId) =>
      replacePlayerCombatPreferences(client, normalizedPlayerId, input),
    );
  }

  async savePlayerAutoBattleSkills(
    playerId: string,
    rows: readonly PlayerAutoBattleSkillUpsertInput[],
    options: PlayerDomainWriteOptions = {},
  ): Promise<void> {
    await this.saveProjectedDomain(playerId, options.versionSeed, ['auto_battle_skill_version'], (client, normalizedPlayerId) =>
      replacePlayerAutoBattleSkills(client, normalizedPlayerId, [...rows]),
    );
  }

  async savePlayerAutoUseItemRules(
    playerId: string,
    rows: readonly PlayerAutoUseItemRuleUpsertInput[],
    options: PlayerDomainWriteOptions = {},
  ): Promise<void> {
    await this.saveProjectedDomain(playerId, options.versionSeed, ['auto_use_item_rule_version'], (client, normalizedPlayerId) =>
      replacePlayerAutoUseItemRules(client, normalizedPlayerId, [...rows]),
    );
  }

  async savePlayerBuffs(
    playerId: string,
    rows: readonly PlayerPersistentBuffStateUpsertInput[],
    options: PlayerDomainWriteOptions = {},
  ): Promise<void> {
    await this.saveProjectedDomain(playerId, options.versionSeed, ['buff_version'], (client, normalizedPlayerId) =>
      replacePlayerPersistentBuffStates(client, normalizedPlayerId, [...rows]),
    );
  }

  async savePlayerProfessionState(
    playerId: string,
    rows: readonly PlayerProfessionStateUpsertInput[],
    options: PlayerDomainWriteOptions = {},
  ): Promise<void> {
    await this.saveProjectedDomain(playerId, options.versionSeed, ['profession_version'], (client, normalizedPlayerId) =>
      replacePlayerProfessionStates(client, normalizedPlayerId, [...rows]),
    );
  }

  async savePlayerAlchemyPresets(
    playerId: string,
    rows: readonly PlayerAlchemyPresetUpsertInput[],
    options: PlayerDomainWriteOptions = {},
  ): Promise<void> {
    await this.saveProjectedDomain(playerId, options.versionSeed, ['alchemy_preset_version'], (client, normalizedPlayerId) =>
      replacePlayerAlchemyPresets(client, normalizedPlayerId, [...rows]),
    );
  }

  async savePlayerActiveJob(
    playerId: string,
    row: PlayerActiveJobUpsertInput | null,
    options: PlayerDomainWriteOptions = {},
  ): Promise<void> {
    await this.saveProjectedDomain(playerId, options.versionSeed, ['active_job_version'], (client, normalizedPlayerId) =>
      replacePlayerActiveJob(client, normalizedPlayerId, row),
    );
  }

  async savePlayerTechniqueActivityQueue(
    playerId: string,
    rows: readonly PlayerTechniqueActivityQueueUpsertInput[],
    options: PlayerDomainWriteOptions = {},
  ): Promise<void> {
    await this.saveProjectedDomain(playerId, options.versionSeed, ['active_job_version'], (client, normalizedPlayerId) =>
      replacePlayerTechniqueActivityQueue(client, normalizedPlayerId, [...rows]),
    );
  }

  async savePlayerEnhancementRecords(
    playerId: string,
    rows: readonly PlayerEnhancementRecordUpsertInput[],
    options: PlayerDomainWriteOptions = {},
  ): Promise<void> {
    await this.saveProjectedDomain(
      playerId,
      options.versionSeed,
      ['enhancement_record_version'],
      (client, normalizedPlayerId) => replacePlayerEnhancementRecords(client, normalizedPlayerId, [...rows]),
    );
  }

  async savePlayerLogbookMessages(
    playerId: string,
    rows: readonly PlayerLogbookMessageUpsertInput[],
    options: PlayerDomainWriteOptions = {},
  ): Promise<void> {
    await this.saveProjectedDomain(playerId, options.versionSeed, ['logbook_version'], (client, normalizedPlayerId) =>
      replacePlayerLogbookMessages(client, normalizedPlayerId, [...rows]),
    );
  }

  async savePlayerSnapshotProjection(
    playerId: string,
    snapshot: PersistedPlayerSnapshot | null | undefined,
  ): Promise<void> {
    const normalizedPlayerId = normalizeRequiredString(playerId);
    if (!this.pool || !this.enabled || !normalizedPlayerId || !snapshot?.placement?.templateId) {
      return;
    }

    await this.withTransaction(async (client) => {
      await acquirePlayerPersistenceLock(client, normalizedPlayerId);
      await savePlayerSnapshotProjectionWithClient(client, normalizedPlayerId, snapshot);
    });
  }

  async savePlayerSnapshotProjectionDomains(
    playerId: string,
    snapshot: PersistedPlayerSnapshot | null | undefined,
    domains: Iterable<string>,
    options: PlayerSnapshotProjectionDomainWriteOptions = {},
  ): Promise<void> {
    if (!snapshot) {
      return;
    }
    await this.savePlayerSnapshotProjectionDomainBatch(playerId, [{ snapshot, domains, options }]);
  }

  /**
   * 同一玩家本轮已认领的分域 payload 必须共用一个数据库事务。
   * 每个 domain 仍保留自己的瘦 snapshot、版本水位和空覆盖守卫；任一写入失败时整批回滚。
   */
  async savePlayerSnapshotProjectionDomainBatch(
    playerId: string,
    entries: readonly PlayerSnapshotProjectionDomainBatchEntry[],
  ): Promise<void> {
    const normalizedPlayerId = normalizeRequiredString(playerId);
    if (!this.pool || !this.enabled || !normalizedPlayerId || entries.length === 0) {
      return;
    }

    const normalizedEntries: Array<{
      domain: string;
      snapshot: PersistedPlayerSnapshot;
      options: PlayerSnapshotProjectionDomainWriteOptions;
      requiresLiveDbStateWrite: boolean;
      writePlan: PlayerDomainWritePlan | null;
    }> = [];
    const seenDomains = new Set<string>();
    for (const entry of entries) {
      if (!entry?.snapshot?.placement?.templateId) {
        throw new Error(`player_snapshot_projection_batch_snapshot_missing:${normalizedPlayerId}`);
      }
      const entryOptions = entry.options ?? {};
      for (const domain of Array.from(normalizeProjectedDirtyDomains(entry.domains)).sort()) {
        if (seenDomains.has(domain)) {
          throw new Error(`player_snapshot_projection_batch_duplicate_domain:${normalizedPlayerId}:${domain}`);
        }
        seenDomains.add(domain);
        const requiresLiveDbStateWrite = domain === 'equipment'
          || domain === 'inventory'
          || domain === 'artifact';
        normalizedEntries.push({
          domain,
          snapshot: entry.snapshot,
          options: entryOptions,
          requiresLiveDbStateWrite,
          writePlan: null,
        });
      }
    }
    if (normalizedEntries.length === 0) {
      return;
    }

    for (const entry of normalizedEntries) {
      if (entry.requiresLiveDbStateWrite) {
        continue;
      }
      entry.writePlan = await this.resolvePlayerSnapshotProjectionWritePlan(
        normalizedPlayerId,
        entry.snapshot,
        [entry.domain],
        entry.options,
      );
    }

    await this.withTransaction(async (client) => {
      await acquirePlayerPersistenceLock(client, normalizedPlayerId);
      const checkedFenceKeys = new Set<string>();
      for (const entry of normalizedEntries) {
        const fenceKey = `${normalizeOptionalString(entry.options.expectedRuntimeOwnerId) ?? ''}\u0000${normalizeOptionalInteger(entry.options.expectedSessionEpoch) ?? ''}`;
        if (checkedFenceKeys.has(fenceKey)) {
          continue;
        }
        await assertPlayerSnapshotProjectionFenceCurrent(client, normalizedPlayerId, entry.options);
        checkedFenceKeys.add(fenceKey);
      }
      const applicableDomains = await resolveApplicablePlayerSnapshotProjectionDomains(
        client,
        normalizedPlayerId,
        normalizedEntries.map((entry) => ({
          domain: entry.domain,
          expectedProjectionVersion: entry.options.expectedProjectionVersion,
        })),
      );
      for (const entry of normalizedEntries) {
        if (!applicableDomains.has(entry.domain)) {
          continue;
        }
        if (entry.requiresLiveDbStateWrite) {
          await savePlayerSnapshotProjectionDomainsWithClient(
            client,
            normalizedPlayerId,
            entry.snapshot,
            new Set([entry.domain]),
            entry.options,
          );
          continue;
        }
        // 仅做 live-client SELECT 级验证，避免空覆盖保护失效；真正写入仍使用 worker 产出的 plan。
        await buildPlayerSnapshotProjectionWritePlan(
          normalizedPlayerId,
          entry.snapshot,
          [entry.domain],
          entry.options,
          client,
        );
        if (!entry.writePlan) {
          throw new Error(`player snapshot projection write plan missing:${normalizedPlayerId}:${entry.domain}`);
        }
        await executePlayerDomainWritePlan(client, entry.writePlan);
      }
    });
  }

  private async resolvePlayerSnapshotProjectionWritePlan(
    playerId: string,
    snapshot: PersistedPlayerSnapshot,
    domains: Iterable<string>,
    options: PlayerSnapshotProjectionDomainWriteOptions = {},
  ): Promise<PlayerDomainWritePlan> {
    const normalizedPlayerId = normalizeRequiredString(playerId);
    const normalizedDomains = Array.from(normalizeProjectedDirtyDomains(domains));
    if (!normalizedPlayerId || !snapshot?.placement?.templateId || normalizedDomains.length === 0) {
      return { playerId: normalizedPlayerId, domains: [], steps: [] };
    }

    const payload: PlayerDomainWritePlanPayload = {
      playerId: normalizedPlayerId,
      snapshot,
      domains: normalizedDomains,
      options,
    };

    if (!this.persistenceWorkerPool) {
      return buildPlayerSnapshotProjectionWritePlan(
        payload.playerId,
        payload.snapshot,
        payload.domains,
        payload.options,
      );
    }

    const result = await this.persistenceWorkerPool.submit<PlayerDomainWritePlanPayload, PlayerDomainWritePlan | Promise<PlayerDomainWritePlan>>(
      'persistence-build',
      payload,
      async (input) => buildPlayerSnapshotProjectionWritePlan(
        input.playerId,
        input.snapshot,
        input.domains,
        input.options,
      ),
      1000,
    );

    if (!result.ok || !result.result) {
      throw new Error(result.errorMessage ?? `player snapshot projection write plan build failed:${normalizedPlayerId}`);
    }

    return await result.result;
  }

  /**
   * 检查玩家是否已经在 player_recovery_watermark 表中有任何 row。
   *
   * 用途：阻止"老玩家被 starter snapshot 覆盖"事故。watermark 行只在玩家任意一次分域 save 后产生，
   * 因此 row 存在等价于"该玩家是已有数据的老玩家"。当 ensureNativeStarterSnapshot 因为 PG 读失败
   * 误判为新玩家时，这个 helper 是最后一道纵深防御。
   *
   * - 持久化未启用 / 玩家 ID 非法 → 返回 false（让上层走默认安全分支）。
   * - PG 错误会向上抛出，由调用方决定如何处理（默认应当拒绝写 starter）。
   */
  async hasRecoveryWatermark(playerId: string): Promise<boolean> {
    const normalizedPlayerId = normalizeRequiredString(playerId);
    if (!this.pool || !this.enabled || !normalizedPlayerId) {
      return false;
    }
    const result = await this.pool.query<{ exists: unknown }>(
      `SELECT 1 AS exists FROM ${PLAYER_RECOVERY_WATERMARK_TABLE} WHERE player_id = $1 LIMIT 1`,
      [normalizedPlayerId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async loadPlayerDomains(playerId: string): Promise<LoadedPlayerDomains | null> {
    return loadPlayerDomainsImpl(this, playerId);
  }

  /** 从分域表投影出完整玩家快照（兼容旧快照格式，用于恢复和迁移） */
  async loadProjectedSnapshot(
    playerId: string,
    buildStarterSnapshot: (playerId: string) => PersistedPlayerSnapshot | null,
  ): Promise<PersistedPlayerSnapshot | null> {
    return loadProjectedSnapshotImpl(this, playerId, buildStarterSnapshot);
  }

  async listProjectedPlayerIds(): Promise<string[]> {
    return listProjectedPlayerIdsImpl(this);
  }

  async listProjectedSnapshots(
    buildStarterSnapshot: (playerId: string) => PersistedPlayerSnapshot | null,
  ): Promise<Array<{ playerId: string; snapshot: PersistedPlayerSnapshot; updatedAt: number }>> {
    return listProjectedSnapshotsImpl(this, buildStarterSnapshot);
  }

  /**
   * 列出所有玩家的排行榜快照投影。
   *
   * 返回的 snapshot 形状与 buildLeaderboardProjectionFromSnapshot 兼容。
   */
  async listLeaderboardSnapshots(
    buildStarterSnapshot: (playerId: string) => PersistedPlayerSnapshot | null,
    currencyItemId: string,
  ): Promise<Array<{ playerId: string; snapshot: PersistedPlayerSnapshot }>> {
    return listLeaderboardSnapshotsImpl(this, buildStarterSnapshot, currencyItemId);
  }

  async withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool || !this.enabled) {
      throw new Error('player_domain_persistence_disabled');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error: unknown) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async saveProjectedDomain(
    playerId: string,
    versionSeedInput: unknown,
    watermarkColumns: readonly RecoveryWatermarkColumn[],
    write: (client: PoolClient, normalizedPlayerId: string, versionSeed: number) => Promise<void>,
  ): Promise<void> {
    const normalizedPlayerId = normalizeRequiredString(playerId);
    if (!this.pool || !this.enabled || !normalizedPlayerId) {
      return;
    }

    const versionSeed = normalizeVersionSeed(versionSeedInput);
    await this.withTransaction(async (client) => {
      await acquirePlayerPersistenceLock(client, normalizedPlayerId);
      if (!await shouldApplyPlayerRecoveryWatermarkVersion(
        client,
        normalizedPlayerId,
        watermarkColumns,
        versionSeed,
        true,
      )) {
        return;
      }
      await write(client, normalizedPlayerId, versionSeed);
      if (watermarkColumns.length > 0) {
        const patch: RecoveryWatermarkPatch = {};
        for (const column of watermarkColumns) {
          patch[column] = versionSeed;
        }
        await upsertRecoveryWatermark(client, normalizedPlayerId, patch);
      }
    });
  }

  private releasePoolReference(): void {
    this.pool = null;
    this.enabled = false;
  }
}


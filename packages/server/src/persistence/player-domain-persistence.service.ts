/**
 * 玩家分域持久化服务。
 * 管理 player_presence、player_wallet、player_world_anchor、player_position_checkpoint、
 * player_vitals、player_progression_core、player_attr_state、player_body_training_state、
 * player_inventory_item、player_equipment_slot、player_technique_state、player_persistent_buff_state、
 * player_quest_progress、player_combat_preferences、player_active_job、player_enhancement_record、
 * player_logbook_message、player_offline_gain_*、player_statistic_day_total 等分域表，
 * 按域独立读写，支持增量刷盘、恢复水位和旧快照兼容水合。
 */
import { Inject, Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { createItemStackSignature, EQUIP_SLOTS, isLegacyItemInstanceId, PLAYER_HEARTBEAT_TIMEOUT_MS } from '@mud/shared';
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
import { ensureBigintColumnsWithClient, ensureDoubleColumnsWithClient } from './schema-bigint-migration';

const PLAYER_PRESENCE_TABLE = 'player_presence';
const PLAYER_WALLET_TABLE = 'player_wallet';
const PLAYER_WORLD_ANCHOR_TABLE = 'player_world_anchor';
const PLAYER_POSITION_CHECKPOINT_TABLE = 'player_position_checkpoint';
const PLAYER_VITALS_TABLE = 'player_vitals';
const PLAYER_PROGRESSION_CORE_TABLE = 'player_progression_core';
const PLAYER_ATTR_STATE_TABLE = 'player_attr_state';
const PLAYER_BODY_TRAINING_STATE_TABLE = 'player_body_training_state';
const PLAYER_INVENTORY_ITEM_TABLE = 'player_inventory_item';
const PLAYER_MARKET_STORAGE_ITEM_TABLE = 'player_market_storage_item';
const PLAYER_MAP_UNLOCK_TABLE = 'player_map_unlock';
const PLAYER_EQUIPMENT_SLOT_TABLE = 'player_equipment_slot';
const PLAYER_TECHNIQUE_STATE_TABLE = 'player_technique_state';
const PLAYER_PERSISTENT_BUFF_STATE_TABLE = 'player_persistent_buff_state';
const PLAYER_QUEST_PROGRESS_TABLE = 'player_quest_progress';
const PLAYER_COMBAT_PREFERENCES_TABLE = 'player_combat_preferences';
const PLAYER_AUTO_BATTLE_SKILL_TABLE = 'player_auto_battle_skill';
const PLAYER_AUTO_USE_ITEM_RULE_TABLE = 'player_auto_use_item_rule';
const PLAYER_PROFESSION_STATE_TABLE = 'player_profession_state';
const PLAYER_ALCHEMY_PRESET_TABLE = 'player_alchemy_preset';
const PLAYER_ACTIVE_JOB_TABLE = 'player_active_job';
const PLAYER_ENHANCEMENT_RECORD_TABLE = 'player_enhancement_record';
const PLAYER_LOGBOOK_MESSAGE_TABLE = 'player_logbook_message';
const PLAYER_OFFLINE_GAIN_SESSION_TABLE = 'player_offline_gain_session';
const PLAYER_OFFLINE_GAIN_REPORT_TABLE = 'player_offline_gain_report';
const PLAYER_STATISTIC_DAY_TOTAL_TABLE = 'player_statistic_day_total';
const PLAYER_RECOVERY_WATERMARK_TABLE = 'player_recovery_watermark';
const PLAYER_DOMAIN_BIGINT_COLUMNS_BY_TABLE = {
  [PLAYER_WORLD_ANCHOR_TABLE]: ['respawn_x', 'respawn_y', 'last_safe_x', 'last_safe_y'],
  [PLAYER_POSITION_CHECKPOINT_TABLE]: ['x', 'y', 'facing'],
  [PLAYER_PROGRESSION_CORE_TABLE]: ['bone_age_base_years', 'lifespan_years'],
  [PLAYER_BODY_TRAINING_STATE_TABLE]: ['level'],
  [PLAYER_MARKET_STORAGE_ITEM_TABLE]: ['slot_index', 'count', 'enhance_level'],
  [PLAYER_TECHNIQUE_STATE_TABLE]: ['level', 'realm_lv'],
  [PLAYER_PERSISTENT_BUFF_STATE_TABLE]: [
    'realm_lv',
    'remaining_ticks',
    'duration',
    'stacks',
    'max_stacks',
    'sustain_ticks_elapsed',
  ],
  [PLAYER_AUTO_BATTLE_SKILL_TABLE]: ['auto_battle_order'],
  [PLAYER_PROFESSION_STATE_TABLE]: ['level'],
  [PLAYER_ACTIVE_JOB_TABLE]: ['paused_ticks', 'total_ticks', 'remaining_ticks'],
  [PLAYER_ENHANCEMENT_RECORD_TABLE]: [
    'highest_level',
    'start_level',
    'initial_target_level',
    'desired_target_level',
    'protection_start_level',
  ],
} as const;
const PLAYER_DOMAIN_DOUBLE_COLUMNS_BY_TABLE = {
  [PLAYER_VITALS_TABLE]: ['hp', 'max_hp', 'qi', 'max_qi'],
  [PLAYER_PROGRESSION_CORE_TABLE]: ['foundation', 'root_foundation', 'combat_exp'],
  [PLAYER_BODY_TRAINING_STATE_TABLE]: ['exp', 'exp_to_next'],
  [PLAYER_TECHNIQUE_STATE_TABLE]: ['exp', 'exp_to_next'],
  [PLAYER_PROFESSION_STATE_TABLE]: ['exp', 'exp_to_next'],
  [PLAYER_STATISTIC_DAY_TOTAL_TABLE]: [
    'spirit_gained',
    'spirit_lost',
    'progress_gained',
    'progress_lost',
    'technique_gained',
    'technique_lost',
    'profession_gained',
    'profession_lost',
  ],
} as const;

export const PLAYER_DOMAIN_PROJECTED_TABLES = [
  PLAYER_PRESENCE_TABLE,
  PLAYER_WALLET_TABLE,
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
  PLAYER_TECHNIQUE_STATE_TABLE,
  PLAYER_PERSISTENT_BUFF_STATE_TABLE,
  PLAYER_QUEST_PROGRESS_TABLE,
  PLAYER_COMBAT_PREFERENCES_TABLE,
  PLAYER_AUTO_BATTLE_SKILL_TABLE,
  PLAYER_AUTO_USE_ITEM_RULE_TABLE,
  PLAYER_PROFESSION_STATE_TABLE,
  PLAYER_ALCHEMY_PRESET_TABLE,
  PLAYER_ACTIVE_JOB_TABLE,
  PLAYER_ENHANCEMENT_RECORD_TABLE,
  PLAYER_LOGBOOK_MESSAGE_TABLE,
  PLAYER_OFFLINE_GAIN_SESSION_TABLE,
  PLAYER_OFFLINE_GAIN_REPORT_TABLE,
  PLAYER_STATISTIC_DAY_TOTAL_TABLE,
  PLAYER_RECOVERY_WATERMARK_TABLE,
] as const;

export const PLAYER_SNAPSHOT_PROJECTABLE_DIRTY_DOMAINS = [
  'world_anchor',
  'position_checkpoint',
  'vitals',
  'progression',
  'attr',
  'wallet',
  'market_storage',
  'inventory',
  'map_unlock',
  'equipment',
  'technique',
  'body_training',
  'buff',
  'quest',
  'combat_pref',
  'auto_battle_skill',
  'auto_use_item_rule',
  'profession',
  'alchemy_preset',
  'active_job',
  'enhancement_record',
  'logbook',
] as const;

const WATERMARK_COLUMNS = [
  'identity_version',
  'presence_version',
  'anchor_version',
  'position_checkpoint_version',
  'vitals_version',
  'progression_version',
  'attr_version',
  'wallet_version',
  'inventory_version',
  'market_storage_version',
  'equipment_version',
  'technique_version',
  'body_training_version',
  'buff_version',
  'quest_version',
  'map_unlock_version',
  'combat_pref_version',
  'auto_battle_skill_version',
  'auto_use_item_rule_version',
  'profession_version',
  'alchemy_preset_version',
  'active_job_version',
  'enhancement_record_version',
  'logbook_version',
  'mail_version',
  'mail_counter_version',
] as const;

type RecoveryWatermarkColumn = (typeof WATERMARK_COLUMNS)[number];
type RecoveryWatermarkPatch = Partial<Record<RecoveryWatermarkColumn, number>>;

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
  allowEquipmentEmptyOverwrite?: boolean;
  allowBuffEmptyOverwrite?: boolean;
}

interface PlayerDomainPruneOptions {
  allowEmptyOverwrite?: boolean;
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
}

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

export interface PlayerLogbookMessageUpsertInput {
  id: string;
  kind: string;
  text: string;
  from?: string | null;
  at?: number | null;
  ackedAt?: number | null;
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

interface AlchemyPresetRow {
  presetId: string;
  recipeId: string | null;
  name: string;
  ingredients: unknown[];
}

interface AttrStateRow {
  baseAttrsPayload: Record<string, unknown> | null;
  bonusEntriesPayload: unknown[];
  revealedBreakthroughRequirementIds: string[];
  realmPayload: Record<string, unknown> | null;
  heavenGatePayload: Record<string, unknown> | null;
  spiritualRootsPayload: Record<string, unknown> | null;
}

interface ProfessionStateRow {
  professionType: 'alchemy' | 'building' | 'gather' | 'enhancement' | 'forging' | 'mining';
  level: number;
  exp: number | null;
  expToNext: number | null;
}

interface TechniqueStateRow {
  techId: string;
  level: number;
  exp: number | null;
  expToNext: number | null;
  realmLv: number | null;
  skillsEnabled: boolean;
  rawPayload: Record<string, unknown>;
}

interface QuestProgressRow {
  questId: string;
  status: string;
  progressPayload: Record<string, unknown> | unknown[] | null;
  rawPayload: Record<string, unknown>;
}

interface PersistentBuffStateRow {
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

interface CombatPreferencesRow {
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
  senseQiActive: boolean;
  cultivatingTechId: string | null;
  targetingRulesPayload: Record<string, unknown> | null;
}

interface AutoBattleSkillRow {
  skillId: string;
  enabled: boolean;
  skillEnabled: boolean;
  autoBattleOrder: number;
}

interface AutoUseItemRuleRow {
  itemId: string;
  conditionPayload: unknown[];
}

interface ActiveJobRow {
  jobRunId: string;
  jobType: 'alchemy' | 'forging' | 'enhancement';
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

interface EnhancementRecordRow {
  recordId: string;
  itemId: string;
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
export type PlayerEnhancementRecordUpsertInput = EnhancementRecordRow;

interface PlayerWorldAnchorLoadRow {
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

interface PlayerPositionCheckpointLoadRow {
  instance_id?: unknown;
  x?: unknown;
  y?: unknown;
  facing?: unknown;
  checkpoint_kind?: unknown;
}

interface PlayerVitalsLoadRow {
  hp?: unknown;
  max_hp?: unknown;
  qi?: unknown;
  max_qi?: unknown;
}

interface PlayerProgressionCoreLoadRow {
  foundation?: unknown;
  root_foundation?: unknown;
  combat_exp?: unknown;
  bone_age_base_years?: unknown;
  life_elapsed_ticks?: unknown;
  lifespan_years?: unknown;
}

interface PlayerAttrStateLoadRow {
  base_attrs_payload?: unknown;
  bonus_entries_payload?: unknown;
  revealed_breakthrough_requirement_ids?: unknown;
  realm_payload?: unknown;
  heaven_gate_payload?: unknown;
  spiritual_roots_payload?: unknown;
}

interface PlayerBodyTrainingLoadRow {
  level?: unknown;
  exp?: unknown;
  exp_to_next?: unknown;
}

interface PlayerWalletLoadRow {
  wallet_type?: unknown;
  balance?: unknown;
  frozen_balance?: unknown;
  version?: unknown;
}

interface PlayerInventoryItemLoadRow {
  item_instance_id?: unknown;
  item_id?: unknown;
  count?: unknown;
  slot_index?: unknown;
  raw_payload?: unknown;
  locked_by?: unknown;
}

interface PlayerMarketStorageItemLoadRow {
  storage_item_id?: unknown;
  item_id?: unknown;
  count?: unknown;
  slot_index?: unknown;
  enhance_level?: unknown;
  raw_payload?: unknown;
}

interface PlayerMapUnlockLoadRow {
  map_id?: unknown;
  unlocked_at?: unknown;
}

interface PlayerEquipmentSlotLoadRow {
  slot_type?: unknown;
  item_instance_id?: unknown;
  item_id?: unknown;
  raw_payload?: unknown;
}

interface PlayerTechniqueStateLoadRow {
  tech_id?: unknown;
  level?: unknown;
  exp?: unknown;
  exp_to_next?: unknown;
  realm_lv?: unknown;
  skills_enabled?: unknown;
  raw_payload?: unknown;
}

interface PlayerPersistentBuffStateLoadRow {
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

interface PlayerQuestProgressLoadRow {
  quest_id?: unknown;
  status?: unknown;
  progress_payload?: unknown;
  raw_payload?: unknown;
}

interface PlayerCombatPreferencesLoadRow {
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
  sense_qi_active?: unknown;
  cultivating_tech_id?: unknown;
  targeting_rules_payload?: unknown;
}

interface PlayerAutoBattleSkillLoadRow {
  skill_id?: unknown;
  enabled?: unknown;
  skill_enabled?: unknown;
  auto_battle_order?: unknown;
}

interface PlayerAutoUseItemRuleLoadRow {
  item_id?: unknown;
  condition_payload?: unknown;
}

interface PlayerProfessionStateLoadRow {
  profession_type?: unknown;
  level?: unknown;
  exp?: unknown;
  exp_to_next?: unknown;
}

interface PlayerAlchemyPresetLoadRow {
  preset_id?: unknown;
  recipe_id?: unknown;
  name?: unknown;
  ingredients_payload?: unknown;
}

interface PlayerActiveJobLoadRow {
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

interface PlayerEnhancementRecordLoadRow {
  record_id?: unknown;
  item_id?: unknown;
  highest_level?: unknown;
  levels_payload?: unknown;
  action_started_at?: unknown;
  action_ended_at?: unknown;
  start_level?: unknown;
  initial_target_level?: unknown;
  desired_target_level?: unknown;
  protection_start_level?: unknown;
  status?: unknown;
}

interface PlayerLogbookMessageLoadRow {
  message_id?: unknown;
  kind?: unknown;
  text?: unknown;
  from_name?: unknown;
  occurred_at?: unknown;
  acked_at?: unknown;
}

interface PlayerRecoveryWatermarkLoadRow {
  [key: string]: unknown;
}

export interface LoadedPlayerDomains {
  worldAnchor: PlayerWorldAnchorLoadRow | null;
  positionCheckpoint: PlayerPositionCheckpointLoadRow | null;
  vitals: PlayerVitalsLoadRow | null;
  progressionCore: PlayerProgressionCoreLoadRow | null;
  attrState: PlayerAttrStateLoadRow | null;
  bodyTraining: PlayerBodyTrainingLoadRow | null;
  walletRows: PlayerWalletLoadRow[];
  inventoryItems: PlayerInventoryItemLoadRow[];
  marketStorageItems: PlayerMarketStorageItemLoadRow[];
  mapUnlocks: PlayerMapUnlockLoadRow[];
  equipmentSlots: PlayerEquipmentSlotLoadRow[];
  techniqueStates: PlayerTechniqueStateLoadRow[];
  persistentBuffStates: PlayerPersistentBuffStateLoadRow[];
  questProgressRows: PlayerQuestProgressLoadRow[];
  combatPreferences: PlayerCombatPreferencesLoadRow | null;
  autoBattleSkills: PlayerAutoBattleSkillLoadRow[];
  autoUseItemRules: PlayerAutoUseItemRuleLoadRow[];
  professionStates: PlayerProfessionStateLoadRow[];
  alchemyPresets: PlayerAlchemyPresetLoadRow[];
  activeJob: PlayerActiveJobLoadRow | null;
  enhancementRecords: PlayerEnhancementRecordLoadRow[];
  logbookMessages: PlayerLogbookMessageLoadRow[];
  recoveryWatermark: PlayerRecoveryWatermarkLoadRow | null;
  hasProjectedState: boolean;
}

/** 玩家分域持久化服务：按域独立管理玩家位置、钱包、背包、装备、功法、任务等状态的落库与恢复 */
@Injectable()
export class PlayerDomainPersistenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlayerDomainPersistenceService.name);
  private pool: Pool | null = null;
  private enabled = false;

  constructor(
    @Optional()
    @Inject(ContentTemplateRepository)
    private readonly contentTemplateRepository: InventoryItemTemplateRepository | null = null,
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
      await this.expireStaleOnlinePresenceOnStartup();
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
      this.logger.warn(`已清理陈旧玩家在线态：count=${expiredCount} timeoutMs=${PLAYER_HEARTBEAT_TIMEOUT_MS}`);
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
            online = CASE
              WHEN EXCLUDED.session_epoch >= ${PLAYER_PRESENCE_TABLE}.session_epoch
                THEN EXCLUDED.online
              ELSE ${PLAYER_PRESENCE_TABLE}.online
            END,
            in_world = CASE
              WHEN EXCLUDED.session_epoch >= ${PLAYER_PRESENCE_TABLE}.session_epoch
                THEN EXCLUDED.in_world
              ELSE ${PLAYER_PRESENCE_TABLE}.in_world
            END,
            last_heartbeat_at = CASE
              WHEN EXCLUDED.session_epoch >= ${PLAYER_PRESENCE_TABLE}.session_epoch
                THEN EXCLUDED.last_heartbeat_at
              ELSE ${PLAYER_PRESENCE_TABLE}.last_heartbeat_at
            END,
            offline_since_at = CASE
              WHEN EXCLUDED.session_epoch >= ${PLAYER_PRESENCE_TABLE}.session_epoch
                THEN EXCLUDED.offline_since_at
              ELSE ${PLAYER_PRESENCE_TABLE}.offline_since_at
            END,
            runtime_owner_id = CASE
              WHEN EXCLUDED.session_epoch >= ${PLAYER_PRESENCE_TABLE}.session_epoch
                THEN EXCLUDED.runtime_owner_id
              ELSE ${PLAYER_PRESENCE_TABLE}.runtime_owner_id
            END,
            session_epoch = GREATEST(${PLAYER_PRESENCE_TABLE}.session_epoch, EXCLUDED.session_epoch),
            transfer_state = CASE
              WHEN EXCLUDED.session_epoch >= ${PLAYER_PRESENCE_TABLE}.session_epoch
                THEN EXCLUDED.transfer_state
              ELSE ${PLAYER_PRESENCE_TABLE}.transfer_state
            END,
            transfer_target_node_id = CASE
              WHEN EXCLUDED.session_epoch >= ${PLAYER_PRESENCE_TABLE}.session_epoch
                THEN EXCLUDED.transfer_target_node_id
              ELSE ${PLAYER_PRESENCE_TABLE}.transfer_target_node_id
            END,
            updated_at = now()
        `,
        [
          normalizedPlayerId,
          input.online === true,
          input.inWorld === true,
          normalizeOptionalInteger(input.lastHeartbeatAt),
          normalizeOptionalInteger(input.offlineSinceAt),
          normalizeOptionalString(input.runtimeOwnerId),
          normalizeMinimumInteger(input.sessionEpoch, 1, 1),
          normalizeOptionalString(input.transferState),
          normalizeOptionalString(input.transferTargetNodeId),
        ],
      );

      await upsertRecoveryWatermark(client, normalizedPlayerId, {
        presence_version: versionSeed,
      });
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
  async listOfflineHangingPlayerPositions(offlineTimeoutMs: number = 48 * 60 * 60 * 1000): Promise<Array<{
    playerId: string;
    instanceId: string;
    x: number;
    y: number;
  }>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const cutoffAt = Date.now() - Math.max(0, Math.trunc(offlineTimeoutMs));
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
          AND COALESCE(p.offline_since_at, 0) >= $1
      `,
      [cutoffAt],
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

  /** 将超时离线玩家标记为彻底离线（in_world=false） */
  async expireOfflineHangingPlayers(offlineTimeoutMs: number = 48 * 60 * 60 * 1000): Promise<number> {
    if (!this.pool || !this.enabled) {
      return 0;
    }
    const cutoffAt = Date.now() - Math.max(0, Math.trunc(offlineTimeoutMs));
    const result = await this.pool.query(
      `
        UPDATE ${PLAYER_PRESENCE_TABLE}
        SET in_world = false, updated_at = now()
        WHERE in_world = true
          AND online = false
          AND COALESCE(offline_since_at, 0) < $1
      `,
      [cutoffAt],
    );
    return Number(result.rowCount ?? 0);
  }

  /** 保存玩家离线收益报告 */
  async savePlayerOfflineGainReport(playerId: string, report: OfflineGainReportView): Promise<void> {
    const normalizedPlayerId = normalizeRequiredString(playerId);
    const reportId = normalizeRequiredString(report?.id);
    if (!this.pool || !this.enabled || !normalizedPlayerId || !reportId) {
      return;
    }

    const payload: OfflineGainReportView = {
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

    await this.withTransaction(async (client) => {
      await acquirePlayerPersistenceLock(client, normalizedPlayerId);
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
          reportId,
          payload.startedAt,
          payload.endedAt,
          payload.durationMs,
          JSON.stringify(payload),
        ],
      );
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
    const normalizedPlayerId = normalizeRequiredString(playerId);
    if (!this.pool || !this.enabled || !normalizedPlayerId || !snapshot?.placement?.templateId) {
      return;
    }

    const normalizedDomains = normalizeProjectedDirtyDomains(domains);
    if (normalizedDomains.size === 0) {
      return;
    }

    const requiresLiveEquipmentWrite = normalizedDomains.has('equipment');
    const writePlan = requiresLiveEquipmentWrite
      ? null
      : await this.resolvePlayerSnapshotProjectionWritePlan(
        normalizedPlayerId,
        snapshot,
        normalizedDomains,
        options,
      );

    await this.withTransaction(async (client) => {
      await acquirePlayerPersistenceLock(client, normalizedPlayerId);
      if (requiresLiveEquipmentWrite) {
        await savePlayerSnapshotProjectionDomainsWithClient(
          client,
          normalizedPlayerId,
          snapshot,
          normalizedDomains,
          options,
        );
        return;
      }
      // 仅做 live-client SELECT 级验证，避免空覆盖保护失效；真正写入仍使用 worker 产出的 plan。
      await buildPlayerSnapshotProjectionWritePlan(
        normalizedPlayerId,
        snapshot,
        normalizedDomains,
        options,
        client,
      );
      if (!writePlan) {
        throw new Error(`player snapshot projection write plan missing:${normalizedPlayerId}`);
      }
      await executePlayerDomainWritePlan(client, writePlan);
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

  /** 一次性加载玩家全部分域数据（位置、钱包、背包、装备、功法、任务等） */
  async loadPlayerDomains(playerId: string): Promise<LoadedPlayerDomains | null> {
    const normalizedPlayerId = normalizeRequiredString(playerId);
    if (!this.pool || !this.enabled || !normalizedPlayerId) {
      return null;
    }

    const client = await this.pool.connect();
    try {
      const worldAnchor = await querySingleRow<PlayerWorldAnchorLoadRow>(
        client,
        `
          SELECT
            respawn_template_id,
            respawn_instance_id,
            respawn_x,
            respawn_y,
            last_safe_template_id,
            last_safe_instance_id,
            last_safe_x,
            last_safe_y,
            preferred_line_preset,
            last_transfer_at
          FROM ${PLAYER_WORLD_ANCHOR_TABLE}
          WHERE player_id = $1
        `,
        [normalizedPlayerId],
      );
      const positionCheckpoint = await querySingleRow<PlayerPositionCheckpointLoadRow>(
        client,
        `
          SELECT
            instance_id,
            x,
            y,
            facing,
            checkpoint_kind
          FROM ${PLAYER_POSITION_CHECKPOINT_TABLE}
          WHERE player_id = $1
        `,
        [normalizedPlayerId],
      );
      const vitals = await querySingleRow<PlayerVitalsLoadRow>(
        client,
        `
          SELECT
            hp,
            max_hp,
            qi,
            max_qi
          FROM ${PLAYER_VITALS_TABLE}
          WHERE player_id = $1
        `,
        [normalizedPlayerId],
      );
      const progressionCore = await querySingleRow<PlayerProgressionCoreLoadRow>(
        client,
        `
          SELECT
            foundation,
            root_foundation,
            combat_exp,
            bone_age_base_years,
            life_elapsed_ticks,
            lifespan_years
          FROM ${PLAYER_PROGRESSION_CORE_TABLE}
          WHERE player_id = $1
        `,
        [normalizedPlayerId],
      );
      const attrState = await querySingleRow<PlayerAttrStateLoadRow>(
        client,
        `
          SELECT
            base_attrs_payload,
            bonus_entries_payload,
            revealed_breakthrough_requirement_ids,
            realm_payload,
            heaven_gate_payload,
            spiritual_roots_payload
          FROM ${PLAYER_ATTR_STATE_TABLE}
          WHERE player_id = $1
        `,
        [normalizedPlayerId],
      );
      const bodyTraining = await querySingleRow<PlayerBodyTrainingLoadRow>(
        client,
        `
          SELECT
            level,
            exp,
            exp_to_next
          FROM ${PLAYER_BODY_TRAINING_STATE_TABLE}
          WHERE player_id = $1
        `,
        [normalizedPlayerId],
      );
      const walletRows = await queryRows<PlayerWalletLoadRow>(
        client,
        `
          SELECT
            wallet_type,
            balance,
            frozen_balance,
            version
          FROM ${PLAYER_WALLET_TABLE}
          WHERE player_id = $1
          ORDER BY wallet_type ASC
        `,
        [normalizedPlayerId],
      );
      const inventoryItems = await queryRows<PlayerInventoryItemLoadRow>(
        client,
        `
          SELECT
            item_instance_id,
            item_id,
            count,
            slot_index,
            raw_payload,
            locked_by
          FROM ${PLAYER_INVENTORY_ITEM_TABLE}
          WHERE player_id = $1
          ORDER BY slot_index ASC
        `,
        [normalizedPlayerId],
      );
      const marketStorageItems = await queryRows<PlayerMarketStorageItemLoadRow>(
        client,
        `
          SELECT
            storage_item_id,
            item_id,
            count,
            slot_index,
            enhance_level,
            raw_payload
          FROM ${PLAYER_MARKET_STORAGE_ITEM_TABLE}
          WHERE player_id = $1
          ORDER BY slot_index ASC, storage_item_id ASC
        `,
        [normalizedPlayerId],
      );
      const mapUnlocks = await queryRows<PlayerMapUnlockLoadRow>(
        client,
        `
          SELECT
            map_id,
            unlocked_at
          FROM ${PLAYER_MAP_UNLOCK_TABLE}
          WHERE player_id = $1
          ORDER BY unlocked_at ASC, map_id ASC
        `,
        [normalizedPlayerId],
      );
      const equipmentSlots = await queryRows<PlayerEquipmentSlotLoadRow>(
        client,
        `
          SELECT
            slot_type,
            item_instance_id,
            item_id,
            raw_payload
          FROM ${PLAYER_EQUIPMENT_SLOT_TABLE}
          WHERE player_id = $1
          ORDER BY slot_type ASC
        `,
        [normalizedPlayerId],
      );
      const techniqueStates = await queryRows<PlayerTechniqueStateLoadRow>(
        client,
        `
          SELECT
            tech_id,
            level,
            exp,
            exp_to_next,
            realm_lv,
            skills_enabled,
            raw_payload
          FROM ${PLAYER_TECHNIQUE_STATE_TABLE}
          WHERE player_id = $1
          ORDER BY realm_lv ASC NULLS LAST, tech_id ASC
        `,
        [normalizedPlayerId],
      );
      const persistentBuffStates = await queryRows<PlayerPersistentBuffStateLoadRow>(
        client,
        `
          SELECT
            buff_id,
            source_skill_id,
            source_caster_id,
            realm_lv,
            remaining_ticks,
            duration,
            stacks,
            max_stacks,
            sustain_ticks_elapsed,
            raw_payload
          FROM ${PLAYER_PERSISTENT_BUFF_STATE_TABLE}
          WHERE player_id = $1
          ORDER BY buff_id ASC, source_skill_id ASC
        `,
        [normalizedPlayerId],
      );
      const questProgressRows = await queryRows<PlayerQuestProgressLoadRow>(
        client,
        `
          SELECT
            quest_id,
            status,
            progress_payload,
            raw_payload
          FROM ${PLAYER_QUEST_PROGRESS_TABLE}
          WHERE player_id = $1
          ORDER BY quest_id ASC
        `,
        [normalizedPlayerId],
      );
      const combatPreferences = await querySingleRow<PlayerCombatPreferencesLoadRow>(
        client,
        `
          SELECT
            auto_battle,
            auto_retaliate,
            auto_battle_stationary,
            auto_battle_targeting_mode,
            retaliate_player_target_id,
            retaliate_player_target_last_attack_tick,
            combat_target_id,
            combat_target_locked,
            allow_aoe_player_hit,
            auto_idle_cultivation,
            auto_switch_cultivation,
            auto_root_foundation,
            sense_qi_active,
            cultivating_tech_id,
            targeting_rules_payload
          FROM ${PLAYER_COMBAT_PREFERENCES_TABLE}
          WHERE player_id = $1
        `,
        [normalizedPlayerId],
      );
      const autoBattleSkills = await queryRows<PlayerAutoBattleSkillLoadRow>(
        client,
        `
          SELECT
            skill_id,
            enabled,
            skill_enabled,
            auto_battle_order
          FROM ${PLAYER_AUTO_BATTLE_SKILL_TABLE}
          WHERE player_id = $1
          ORDER BY auto_battle_order ASC, skill_id ASC
        `,
        [normalizedPlayerId],
      );
      const autoUseItemRules = await queryRows<PlayerAutoUseItemRuleLoadRow>(
        client,
        `
          SELECT
            item_id,
            condition_payload
          FROM ${PLAYER_AUTO_USE_ITEM_RULE_TABLE}
          WHERE player_id = $1
          ORDER BY item_id ASC
        `,
        [normalizedPlayerId],
      );
      const professionStates = await queryRows<PlayerProfessionStateLoadRow>(
        client,
        `
          SELECT
            profession_type,
            level,
            exp,
            exp_to_next
          FROM ${PLAYER_PROFESSION_STATE_TABLE}
          WHERE player_id = $1
          ORDER BY profession_type ASC
        `,
        [normalizedPlayerId],
      );
      const alchemyPresets = await queryRows<PlayerAlchemyPresetLoadRow>(
        client,
        `
          SELECT
            preset_id,
            recipe_id,
            name,
            ingredients_payload
          FROM ${PLAYER_ALCHEMY_PRESET_TABLE}
          WHERE player_id = $1
          ORDER BY preset_id ASC
        `,
        [normalizedPlayerId],
      );
      const activeJob = await querySingleRow<PlayerActiveJobLoadRow>(
        client,
        `
          SELECT
            job_run_id,
            job_type,
            status,
            phase,
            started_at,
            finished_at,
            paused_ticks,
            total_ticks,
            remaining_ticks,
            success_rate,
            speed_rate,
            job_version,
            detail_jsonb
          FROM ${PLAYER_ACTIVE_JOB_TABLE}
          WHERE player_id = $1
        `,
        [normalizedPlayerId],
      );
      const enhancementRecords = await queryRows<PlayerEnhancementRecordLoadRow>(
        client,
        `
          SELECT
            record_id,
            item_id,
            highest_level,
            levels_payload,
            action_started_at,
            action_ended_at,
            start_level,
            initial_target_level,
            desired_target_level,
            protection_start_level,
            status
          FROM ${PLAYER_ENHANCEMENT_RECORD_TABLE}
          WHERE player_id = $1
          ORDER BY item_id ASC, record_id ASC
        `,
        [normalizedPlayerId],
      );
      const logbookMessages = await queryRows<PlayerLogbookMessageLoadRow>(
        client,
        `
          SELECT
            message_id,
            kind,
            text,
            from_name,
            occurred_at,
            acked_at
          FROM ${PLAYER_LOGBOOK_MESSAGE_TABLE}
          WHERE player_id = $1
          ORDER BY occurred_at ASC, message_id ASC
        `,
        [normalizedPlayerId],
      );
      const recoveryWatermark = await querySingleRow<PlayerRecoveryWatermarkLoadRow>(
        client,
        `SELECT * FROM ${PLAYER_RECOVERY_WATERMARK_TABLE} WHERE player_id = $1`,
        [normalizedPlayerId],
      );
      const hasProjectedState = hasProjectedPlayerDomainState({
        worldAnchor,
        positionCheckpoint,
        vitals,
        progressionCore,
        attrState,
        bodyTraining,
        walletRows,
        inventoryItems,
        marketStorageItems,
        mapUnlocks,
        equipmentSlots,
        techniqueStates,
        persistentBuffStates,
        questProgressRows,
        combatPreferences,
        autoBattleSkills,
        autoUseItemRules,
        professionStates,
        alchemyPresets,
        activeJob,
        enhancementRecords,
        logbookMessages,
        recoveryWatermark,
      });
      const hasAnyLoadedState = hasAnyLoadedPlayerDomainState({
        worldAnchor,
        positionCheckpoint,
        vitals,
        progressionCore,
        attrState,
        bodyTraining,
        walletRows,
        inventoryItems,
        marketStorageItems,
        mapUnlocks,
        equipmentSlots,
        techniqueStates,
        persistentBuffStates,
        questProgressRows,
        combatPreferences,
        autoBattleSkills,
        autoUseItemRules,
        professionStates,
        alchemyPresets,
        activeJob,
        enhancementRecords,
        logbookMessages,
        recoveryWatermark,
      });

      if (!hasAnyLoadedState) {
        return null;
      }

      return {
        worldAnchor,
        positionCheckpoint,
        vitals,
        progressionCore,
        attrState,
        bodyTraining,
        walletRows,
        inventoryItems,
        marketStorageItems,
        mapUnlocks,
        equipmentSlots,
        techniqueStates,
        persistentBuffStates,
        questProgressRows,
        combatPreferences,
        autoBattleSkills,
        autoUseItemRules,
        professionStates,
        alchemyPresets,
        activeJob,
        enhancementRecords,
        logbookMessages,
        recoveryWatermark,
        hasProjectedState,
      };
    } finally {
      client.release();
    }
  }

  /** 从分域表投影出完整玩家快照（兼容旧快照格式，用于恢复和迁移） */
  async loadProjectedSnapshot(
    playerId: string,
    buildStarterSnapshot: (playerId: string) => PersistedPlayerSnapshot | null,
  ): Promise<PersistedPlayerSnapshot | null> {
    const normalizedPlayerId = normalizeRequiredString(playerId);
    if (!normalizedPlayerId) {
      return null;
    }

    const domains = await this.loadPlayerDomains(normalizedPlayerId);
    if (!domains?.hasProjectedState) {
      return null;
    }

    const starterSnapshot = buildStarterSnapshot(normalizedPlayerId);
    if (!starterSnapshot) {
      return null;
    }

    return buildProjectedSnapshotFromDomains(starterSnapshot, domains, this.contentTemplateRepository);
  }

  async listProjectedSnapshots(
    buildStarterSnapshot: (playerId: string) => PersistedPlayerSnapshot | null,
  ): Promise<Array<{ playerId: string; snapshot: PersistedPlayerSnapshot; updatedAt: number }>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const result = await this.pool.query<{ player_id?: unknown; updated_at_ms?: unknown }>(
      `
        SELECT player_id, (EXTRACT(EPOCH FROM updated_at) * 1000)::bigint AS updated_at_ms
        FROM ${PLAYER_RECOVERY_WATERMARK_TABLE}
        ORDER BY player_id ASC
      `,
    );
    const rows = result.rows ?? [];
    const entries: Array<{ playerId: string; snapshot: PersistedPlayerSnapshot; updatedAt: number }> = [];
    const BATCH_SIZE = 50;
    const CONCURRENCY = 4;
    for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
      const batch = rows.slice(offset, offset + BATCH_SIZE);
      const tasks = batch.map((row) => async () => {
        const playerId = normalizeRequiredString(row.player_id);
        if (!playerId) return null;
        const snapshot = await this.loadProjectedSnapshot(playerId, buildStarterSnapshot);
        if (!snapshot) return null;
        return {
          playerId,
          snapshot,
          updatedAt: Math.max(0, Math.trunc(Number(row.updated_at_ms ?? snapshot.savedAt ?? 0))),
        };
      });
      // 按 CONCURRENCY 并发执行当前批次
      for (let i = 0; i < tasks.length; i += CONCURRENCY) {
        const chunk = tasks.slice(i, i + CONCURRENCY);
        const results = await Promise.all(chunk.map((fn) => fn()));
        for (const entry of results) {
          if (entry) entries.push(entry);
        }
      }
    }
    return entries;
  }

  /**
   * 批量查询排行榜所需的最小字段集。
   * 用 ~10 个全表/条件查询替代逐个玩家的 loadPlayerDomains（20+ 表/玩家），
   * 跳过 quests、logbook、map_unlocks、auto_battle_skills 等排行榜不需要的表。
   * 返回的 snapshot 形状与 buildLeaderboardProjectionFromSnapshot 兼容。
   */
  async listLeaderboardSnapshots(
    buildStarterSnapshot: (playerId: string) => PersistedPlayerSnapshot | null,
    currencyItemId: string,
  ): Promise<Array<{ playerId: string; snapshot: PersistedPlayerSnapshot }>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const client = await this.pool.connect();
    try {
      // 1. 获取所有玩家 ID
      const watermarkResult = await client.query<{ player_id?: unknown }>(
        `SELECT player_id FROM ${PLAYER_RECOVERY_WATERMARK_TABLE} ORDER BY player_id ASC`,
      );
      const playerIds = (watermarkResult.rows ?? [])
        .map((row) => normalizeRequiredString(row.player_id))
        .filter((id) => id.length > 0);
      if (playerIds.length === 0) {
        return [];
      }

      // 2. 批量查询所有排行榜所需表
      const [
        worldAnchorRows,
        checkpointRows,
        progressionRows,
        attrStateRows,
        bodyTrainingRows,
        walletRows,
        inventorySpiritStoneRows,
        marketStorageSpiritStoneRows,
        equipmentRows,
        techniqueRows,
        buffRows,
        combatRows,
        activeJobRows,
      ] = await Promise.all([
        this.pool.query<{ player_id?: unknown } & PlayerWorldAnchorLoadRow>(
          `SELECT player_id, respawn_template_id, last_safe_template_id, last_safe_instance_id, last_safe_x, last_safe_y, respawn_instance_id, respawn_x, respawn_y FROM ${PLAYER_WORLD_ANCHOR_TABLE}`,
        ),
        this.pool.query<{ player_id?: unknown } & PlayerPositionCheckpointLoadRow>(
          `SELECT player_id, instance_id, x, y, facing FROM ${PLAYER_POSITION_CHECKPOINT_TABLE}`,
        ),
        this.pool.query<{ player_id?: unknown } & PlayerProgressionCoreLoadRow>(
          `SELECT player_id, foundation, root_foundation FROM ${PLAYER_PROGRESSION_CORE_TABLE}`,
        ),
        this.pool.query<{ player_id?: unknown } & PlayerAttrStateLoadRow>(
          `SELECT player_id, base_attrs_payload, bonus_entries_payload, realm_payload FROM ${PLAYER_ATTR_STATE_TABLE}`,
        ),
        this.pool.query<{ player_id?: unknown } & PlayerBodyTrainingLoadRow>(
          `SELECT player_id, level, exp, exp_to_next FROM ${PLAYER_BODY_TRAINING_STATE_TABLE}`,
        ),
        this.pool.query<{ player_id?: unknown; wallet_type?: unknown; balance?: unknown }>(
          `SELECT player_id, wallet_type, balance FROM ${PLAYER_WALLET_TABLE} WHERE wallet_type = $1`,
          [currencyItemId],
        ),
        this.pool.query<{ player_id?: unknown; total_count?: unknown }>(
          `SELECT player_id, SUM(count)::bigint AS total_count FROM ${PLAYER_INVENTORY_ITEM_TABLE} WHERE item_id = $1 AND (locked_by IS NULL OR locked_by = '') GROUP BY player_id`,
          [currencyItemId],
        ),
        this.pool.query<{ player_id?: unknown; total_count?: unknown }>(
          `SELECT player_id, SUM(count)::bigint AS total_count FROM ${PLAYER_MARKET_STORAGE_ITEM_TABLE} WHERE item_id = $1 GROUP BY player_id`,
          [currencyItemId],
        ),
        this.pool.query<{ player_id?: unknown } & PlayerEquipmentSlotLoadRow>(
          `SELECT player_id, slot_type, item_instance_id, item_id, raw_payload FROM ${PLAYER_EQUIPMENT_SLOT_TABLE}`,
        ),
        this.pool.query<{ player_id?: unknown } & PlayerTechniqueStateLoadRow>(
          `SELECT player_id, tech_id, level, exp, exp_to_next, realm_lv, skills_enabled, raw_payload FROM ${PLAYER_TECHNIQUE_STATE_TABLE}`,
        ),
        this.pool.query<{ player_id?: unknown } & PlayerPersistentBuffStateLoadRow>(
          `SELECT player_id, buff_id, source_skill_id, source_caster_id, realm_lv, remaining_ticks, duration, stacks, max_stacks, sustain_ticks_elapsed, raw_payload FROM ${PLAYER_PERSISTENT_BUFF_STATE_TABLE}`,
        ),
        this.pool.query<{ player_id?: unknown } & PlayerCombatPreferencesLoadRow>(
          `SELECT player_id, auto_battle, combat_target_id, cultivating_tech_id FROM ${PLAYER_COMBAT_PREFERENCES_TABLE}`,
        ),
        this.pool.query<{ player_id?: unknown; job_type?: unknown }>(
          `SELECT player_id, job_type FROM ${PLAYER_ACTIVE_JOB_TABLE}`,
        ),
      ]);

      // 3. 按 playerId 索引
      const worldAnchorByPid = indexRowsByPlayerId(worldAnchorRows.rows);
      const checkpointByPid = indexRowsByPlayerId(checkpointRows.rows);
      const progressionByPid = indexRowsByPlayerId(progressionRows.rows);
      const attrStateByPid = indexRowsByPlayerId(attrStateRows.rows);
      const bodyTrainingByPid = indexRowsByPlayerId(bodyTrainingRows.rows);
      const walletByPid = indexRowsByPlayerId(walletRows.rows);
      const invSpiritByPid = indexRowsByPlayerId(inventorySpiritStoneRows.rows);
      const mktSpiritByPid = indexRowsByPlayerId(marketStorageSpiritStoneRows.rows);
      const equipByPid = indexMultiRowsByPlayerId(equipmentRows.rows);
      const techByPid = indexMultiRowsByPlayerId(techniqueRows.rows);
      const buffByPid = indexMultiRowsByPlayerId(buffRows.rows);
      const combatByPid = indexRowsByPlayerId(combatRows.rows);
      const activeJobByPid = indexRowsByPlayerId(activeJobRows.rows);

      // 4. 组装每个玩家的轻量 snapshot
      const entries: Array<{ playerId: string; snapshot: PersistedPlayerSnapshot }> = [];
      for (const playerId of playerIds) {
        const starterSnapshot = buildStarterSnapshot(playerId);
        if (!starterSnapshot) {
          continue;
        }
        const snapshot = starterSnapshot;
        // placement
        const worldAnchor = worldAnchorByPid.get(playerId) ?? null;
        const checkpoint = checkpointByPid.get(playerId) ?? null;
        applyProjectedPlacement(snapshot, worldAnchor, checkpoint);
        // progression
        applyProjectedProgressionCore(snapshot, progressionByPid.get(playerId) ?? null);
        // attr state (realm, baseAttrs, runtimeBonuses)
        applyProjectedAttrState(snapshot, attrStateByPid.get(playerId) ?? null);
        // body training
        applyProjectedBodyTraining(snapshot, bodyTrainingByPid.get(playerId) ?? null);
        // equipment
        applyProjectedEquipment(snapshot, equipByPid.get(playerId) ?? [], this.contentTemplateRepository);
        // techniques
        applyProjectedTechniques(snapshot, techByPid.get(playerId) ?? []);
        // buffs
        applyProjectedPersistentBuffs(snapshot, buffByPid.get(playerId) ?? []);
        // combat preferences (排行榜只需 autoBattle, combatTargetId, cultivatingTechId)
        applyProjectedCombatPreferences(snapshot, combatByPid.get(playerId) ?? null);
        // wallet/inventory/marketStorage 灵石计数
        const walletRow = walletByPid.get(playerId);
        const walletBalance = walletRow ? Math.max(0, Math.trunc(Number(walletRow.balance) || 0)) : 0;
        const invCount = Math.max(0, Math.trunc(Number(invSpiritByPid.get(playerId)?.total_count) || 0));
        const mktCount = Math.max(0, Math.trunc(Number(mktSpiritByPid.get(playerId)?.total_count) || 0));
        snapshot.wallet = { balances: walletBalance > 0 || invCount > 0
          ? [{ walletType: currencyItemId, balance: walletBalance, count: invCount }] as any
          : [] };
        snapshot.inventory = { ...snapshot.inventory, items: invCount > 0
          ? [{ itemId: currencyItemId, count: invCount }] as any
          : [] };
        snapshot.marketStorage = { items: mktCount > 0
          ? [{ itemId: currencyItemId, count: mktCount }] as any
          : [] };
        // active job (排行榜只需判断 alchemy/enhancement 存在性)
        const jobRow = activeJobByPid.get(playerId);
        const jobType = jobRow ? normalizeOptionalString(jobRow.job_type) : null;
        snapshot.progression.alchemyJob = (jobType === 'alchemy' ? {} : null) as any;
        snapshot.progression.forgingJob = (jobType === 'forging' ? {} : null) as any;
        snapshot.progression.enhancementJob = (jobType === 'enhancement' ? {} : null) as any;
        // 排行榜不需要的字段保持 starter 默认值
        entries.push({ playerId, snapshot });
      }
      return entries;
    } finally {
      client.release();
    }
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

export async function savePlayerSnapshotProjectionWithClient(
  client: PoolClient,
  playerId: string,
  snapshot: PersistedPlayerSnapshot,
): Promise<void> {
  const normalizedPlayerId = normalizeRequiredString(playerId);
  if (!normalizedPlayerId || !snapshot?.placement?.templateId) {
    return;
  }

  const versionSeed = normalizeVersionSeed(snapshot.savedAt);
  const placement = snapshot.placement;
  const respawn = snapshot.respawn ?? placement;
  const vitals = snapshot.vitals;
  const progression = asRecord(snapshot.progression);
  const attrState = buildAttrStateRow(snapshot);
  const bodyTraining = asRecord(progression?.bodyTraining);
  const inventoryItems = Array.isArray(snapshot.inventory?.items) ? snapshot.inventory.items : [];
  const inventoryLockedItems = Array.isArray(snapshot.inventory?.lockedItems)
    ? snapshot.inventory.lockedItems
    : [];
  const walletBalances = Array.isArray(snapshot.wallet?.balances) ? snapshot.wallet.balances : [];
  const marketStorageItems = Array.isArray(snapshot.marketStorage?.items) ? snapshot.marketStorage.items : [];
  const mapUnlockIds = Array.isArray(snapshot.unlockedMapIds) ? snapshot.unlockedMapIds : [];
  const equipmentSlots = Array.isArray(snapshot.equipment?.slots) ? snapshot.equipment.slots : [];
  const techniqueStates = buildTechniqueStateRows(snapshot);
  const persistentBuffStates = buildPersistentBuffStateRows(snapshot);
  const questProgressRows = buildQuestProgressRows(snapshot);
  const combatPreferences = buildCombatPreferencesRow(snapshot);
  const autoBattleSkills = buildAutoBattleSkillRows(snapshot);
  const autoUseItemRules = buildAutoUseItemRuleRows(snapshot);
  const professions = buildProfessionStateRows(snapshot);
  const presets = buildAlchemyPresetRows(snapshot);
  const activeJob = buildActiveJobRow(normalizedPlayerId, snapshot, versionSeed);
  const enhancementRecords = buildEnhancementRecordRows(normalizedPlayerId, snapshot);
  const logbookMessages = Array.isArray(snapshot.pendingLogbookMessages)
    ? snapshot.pendingLogbookMessages
    : [];
  const placementX = normalizeIntegerWithFallback(placement.x, 0);
  const placementY = normalizeIntegerWithFallback(placement.y, 0);
  const placementFacing = normalizeIntegerWithFallback(placement.facing, 1);
  const vitalsHp = normalizeMinimumNumber(vitals?.hp, 0, 0);
  const vitalsMaxHp = normalizeMinimumNumber(vitals?.maxHp, 1, 1);
  const vitalsQi = normalizeMinimumNumber(vitals?.qi, 0, 0);
  const vitalsMaxQi = normalizeMinimumNumber(vitals?.maxQi, 0, 0);
  const foundation = normalizeMinimumNumber(progression?.foundation, 0, 0);
  const rootFoundation = normalizeMinimumNumber(progression?.rootFoundation, 0, 0);
  const combatExp = normalizeMinimumNumber(progression?.combatExp, 0, 0);
  const boneAgeBaseYears = normalizeMinimumInteger(progression?.boneAgeBaseYears, 18, 0);
  const lifeElapsedTicks = normalizeMinimumInteger(progression?.lifeElapsedTicks, 0, 0);

  await client.query(
    `
      INSERT INTO ${PLAYER_WORLD_ANCHOR_TABLE}(
        player_id,
        respawn_template_id,
        respawn_instance_id,
        respawn_x,
        respawn_y,
        last_safe_template_id,
        last_safe_instance_id,
        last_safe_x,
        last_safe_y,
        preferred_line_preset,
        last_transfer_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        respawn_template_id = EXCLUDED.respawn_template_id,
        respawn_instance_id = EXCLUDED.respawn_instance_id,
        respawn_x = EXCLUDED.respawn_x,
        respawn_y = EXCLUDED.respawn_y,
        last_safe_template_id = EXCLUDED.last_safe_template_id,
        last_safe_instance_id = EXCLUDED.last_safe_instance_id,
        last_safe_x = EXCLUDED.last_safe_x,
        last_safe_y = EXCLUDED.last_safe_y,
        preferred_line_preset = EXCLUDED.preferred_line_preset,
        last_transfer_at = EXCLUDED.last_transfer_at,
        updated_at = now()
    `,
    [
      normalizedPlayerId,
      normalizeRequiredString(respawn.templateId) || placement.templateId,
      normalizeOptionalString(respawn.instanceId),
      normalizeIntegerWithFallback(respawn.x, 0),
      normalizeIntegerWithFallback(respawn.y, 0),
      placement.templateId,
      normalizeOptionalString(placement.instanceId),
      placementX,
      placementY,
      normalizeWorldPreferenceLinePreset(snapshot.worldPreference?.linePreset),
      versionSeed,
    ],
  );

  await client.query(
    `
      INSERT INTO ${PLAYER_VITALS_TABLE}(
        player_id,
        hp,
        max_hp,
        qi,
        max_qi,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        hp = EXCLUDED.hp,
        max_hp = EXCLUDED.max_hp,
        qi = EXCLUDED.qi,
        max_qi = EXCLUDED.max_qi,
        updated_at = now()
    `,
    [
      normalizedPlayerId,
      vitalsHp,
      vitalsMaxHp,
      vitalsQi,
      vitalsMaxQi,
    ],
  );

  await client.query(
    `
      INSERT INTO ${PLAYER_PROGRESSION_CORE_TABLE}(
        player_id,
        foundation,
        root_foundation,
        combat_exp,
        bone_age_base_years,
        life_elapsed_ticks,
        lifespan_years,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        foundation = EXCLUDED.foundation,
        root_foundation = EXCLUDED.root_foundation,
        combat_exp = EXCLUDED.combat_exp,
        bone_age_base_years = EXCLUDED.bone_age_base_years,
        life_elapsed_ticks = EXCLUDED.life_elapsed_ticks,
        lifespan_years = EXCLUDED.lifespan_years,
        updated_at = now()
    `,
    [
      normalizedPlayerId,
      foundation,
      rootFoundation,
      combatExp,
      boneAgeBaseYears,
      lifeElapsedTicks,
      normalizeOptionalInteger(progression?.lifespanYears),
    ],
  );

  await client.query(
    `
      INSERT INTO ${PLAYER_POSITION_CHECKPOINT_TABLE}(
        player_id,
        instance_id,
        x,
        y,
        facing,
        checkpoint_kind,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        instance_id = EXCLUDED.instance_id,
        x = EXCLUDED.x,
        y = EXCLUDED.y,
        facing = EXCLUDED.facing,
        checkpoint_kind = EXCLUDED.checkpoint_kind,
        updated_at = now()
    `,
    [
      normalizedPlayerId,
      normalizeOptionalString(placement.instanceId) ?? `public:${placement.templateId}`,
      placementX,
      placementY,
      placementFacing,
      'runtime',
    ],
  );

  await replacePlayerBodyTrainingState(client, normalizedPlayerId, bodyTraining);
  await replacePlayerAttrState(client, normalizedPlayerId, attrState);

  await replacePlayerInventoryItems(client, normalizedPlayerId, [...inventoryItems, ...inventoryLockedItems]);
  await replacePlayerWalletRows(
    client,
    normalizedPlayerId,
    walletBalances as readonly PlayerWalletUpsertInput[],
    versionSeed,
  );
  await replacePlayerMarketStorageItems(
    client,
    normalizedPlayerId,
    marketStorageItems as readonly PlayerMarketStorageItemUpsertInput[],
  );
    await replacePlayerMapUnlockRows(client, normalizedPlayerId, mapUnlockIds, versionSeed);

  await replacePlayerEquipmentSlots(client, normalizedPlayerId, equipmentSlots);
  await replacePlayerTechniqueStates(client, normalizedPlayerId, techniqueStates);
  await replacePlayerPersistentBuffStates(client, normalizedPlayerId, persistentBuffStates);
  await replacePlayerQuestProgressRows(client, normalizedPlayerId, questProgressRows);
  await replacePlayerCombatPreferences(client, normalizedPlayerId, combatPreferences);
  await replacePlayerAutoBattleSkills(client, normalizedPlayerId, autoBattleSkills);
  await replacePlayerAutoUseItemRules(client, normalizedPlayerId, autoUseItemRules);
  await replacePlayerProfessionStates(client, normalizedPlayerId, professions);
  await replacePlayerAlchemyPresets(client, normalizedPlayerId, presets);
  await replacePlayerActiveJob(client, normalizedPlayerId, activeJob);
  await replacePlayerEnhancementRecords(client, normalizedPlayerId, enhancementRecords);
  await replacePlayerLogbookMessages(client, normalizedPlayerId, logbookMessages);

  await upsertRecoveryWatermark(client, normalizedPlayerId, {
    anchor_version: versionSeed,
    position_checkpoint_version: versionSeed,
    vitals_version: versionSeed,
    progression_version: versionSeed,
    attr_version: versionSeed,
    body_training_version: versionSeed,
    inventory_version: versionSeed,
    wallet_version: versionSeed,
    market_storage_version: versionSeed,
    map_unlock_version: versionSeed,
    equipment_version: versionSeed,
    technique_version: versionSeed,
    buff_version: versionSeed,
    quest_version: versionSeed,
    combat_pref_version: versionSeed,
    auto_battle_skill_version: versionSeed,
    auto_use_item_rule_version: versionSeed,
    profession_version: versionSeed,
    alchemy_preset_version: versionSeed,
    active_job_version: versionSeed,
    enhancement_record_version: versionSeed,
    logbook_version: versionSeed,
  });
}

const PLAYER_SNAPSHOT_PROJECTION_FALLBACK_DOMAIN = 'snapshot';
const PLAYER_SNAPSHOT_PROJECTABLE_DIRTY_DOMAIN_SET = new Set<string>(PLAYER_SNAPSHOT_PROJECTABLE_DIRTY_DOMAINS);

export async function savePlayerSnapshotProjectionDomainsWithClient(
  client: PoolClient,
  playerId: string,
  snapshot: PersistedPlayerSnapshot,
  domains: Iterable<string>,
  options: PlayerSnapshotProjectionDomainWriteOptions = {},
): Promise<void> {
  const normalizedPlayerId = normalizeRequiredString(playerId);
  if (!normalizedPlayerId || !snapshot?.placement?.templateId) {
    return;
  }

  const rawDomains = normalizeProjectedDirtyDomains(domains);
  if (
    rawDomains.size === 0
    || rawDomains.has(PLAYER_SNAPSHOT_PROJECTION_FALLBACK_DOMAIN)
    || Array.from(rawDomains).some((domain) => !PLAYER_SNAPSHOT_PROJECTABLE_DIRTY_DOMAIN_SET.has(domain))
  ) {
    const normalizedDomains = Array.from(rawDomains).sort().join(',') || 'none';
    throw new Error(`player_domain_projection_delta_required:${normalizedPlayerId}:${normalizedDomains}`);
  }

  const versionSeed = normalizeVersionSeed(snapshot.savedAt);
  const placement = snapshot.placement;
  const respawn = snapshot.respawn ?? placement;
  const progression = asRecord(snapshot.progression);
  const watermarkPatch: RecoveryWatermarkPatch = {};

  if (rawDomains.has('world_anchor')) {
    await replacePlayerWorldAnchor(client, normalizedPlayerId, {
      respawnTemplateId: normalizeRequiredString(respawn.templateId),
      respawnInstanceId: normalizeOptionalString(respawn.instanceId),
      respawnX: normalizeIntegerWithFallback(respawn.x, 0),
      respawnY: normalizeIntegerWithFallback(respawn.y, 0),
      lastSafeTemplateId: normalizeRequiredString(placement.templateId),
      lastSafeInstanceId: normalizeOptionalString(placement.instanceId),
      lastSafeX: normalizeIntegerWithFallback(placement.x, 0),
      lastSafeY: normalizeIntegerWithFallback(placement.y, 0),
      preferredLinePreset: normalizeWorldPreferenceLinePreset(snapshot.worldPreference?.linePreset),
      lastTransferAt: versionSeed,
    });
    watermarkPatch.anchor_version = versionSeed;
  }

  if (rawDomains.has('position_checkpoint')) {
    await replacePlayerPositionCheckpoint(client, normalizedPlayerId, {
      instanceId: normalizeOptionalString(placement.instanceId) ?? `public:${placement.templateId}`,
      x: normalizeIntegerWithFallback(placement.x, 0),
      y: normalizeIntegerWithFallback(placement.y, 0),
      facing: normalizeIntegerWithFallback(placement.facing, 1),
      checkpointKind: 'runtime',
    });
    watermarkPatch.position_checkpoint_version = versionSeed;
  }

  if (rawDomains.has('vitals')) {
    await replacePlayerVitals(client, normalizedPlayerId, {
      hp: normalizeMinimumNumber(snapshot.vitals?.hp, 0, 0),
      maxHp: normalizeMinimumNumber(snapshot.vitals?.maxHp, 1, 1),
      qi: normalizeMinimumNumber(snapshot.vitals?.qi, 0, 0),
      maxQi: normalizeMinimumNumber(snapshot.vitals?.maxQi, 0, 0),
    });
    watermarkPatch.vitals_version = versionSeed;
  }

  if (rawDomains.has('progression')) {
    await replacePlayerProgressionCore(client, normalizedPlayerId, {
      foundation: normalizeMinimumNumber(progression?.foundation, 0, 0),
      rootFoundation: normalizeMinimumNumber(progression?.rootFoundation, 0, 0),
      combatExp: normalizeMinimumNumber(progression?.combatExp, 0, 0),
      boneAgeBaseYears: normalizeMinimumInteger(progression?.boneAgeBaseYears, 18, 0),
      lifeElapsedTicks: normalizeMinimumInteger(progression?.lifeElapsedTicks, 0, 0),
      lifespanYears: normalizeOptionalInteger(progression?.lifespanYears),
    });
    watermarkPatch.progression_version = versionSeed;
  }

  if (rawDomains.has('attr')) {
    await replacePlayerAttrState(client, normalizedPlayerId, buildAttrStateRow(snapshot));
    watermarkPatch.attr_version = versionSeed;
  }

  if (rawDomains.has('wallet')) {
    const walletBalances = Array.isArray(snapshot.wallet?.balances)
      ? (snapshot.wallet.balances as readonly PlayerWalletUpsertInput[])
      : [];
    await replacePlayerWalletRows(
      client,
      normalizedPlayerId,
      walletBalances,
      versionSeed,
    );
    watermarkPatch.wallet_version = versionSeed;
  }

  if (rawDomains.has('market_storage')) {
    await replacePlayerMarketStorageItems(
      client,
      normalizedPlayerId,
      Array.isArray(snapshot.marketStorage?.items)
        ? (snapshot.marketStorage.items as readonly PlayerMarketStorageItemUpsertInput[])
        : [],
    );
    watermarkPatch.market_storage_version = versionSeed;
  }

  if (rawDomains.has('body_training')) {
    await replacePlayerBodyTrainingState(client, normalizedPlayerId, asRecord(progression?.bodyTraining));
    watermarkPatch.body_training_version = versionSeed;
  }

  if (rawDomains.has('inventory')) {
    const projectedInventoryItems = Array.isArray(snapshot.inventory?.items) ? snapshot.inventory.items : [];
    const projectedInventoryLockedItems = Array.isArray(snapshot.inventory?.lockedItems)
      ? snapshot.inventory.lockedItems
      : [];
    await replacePlayerInventoryItems(
      client,
      normalizedPlayerId,
      [...projectedInventoryItems, ...projectedInventoryLockedItems],
      { allowEmptyOverwrite: options.allowInventoryEmptyOverwrite === true && Array.isArray(snapshot.inventory?.items) },
    );
    watermarkPatch.inventory_version = versionSeed;
  }

  if (rawDomains.has('map_unlock')) {
    await replacePlayerMapUnlockRows(
      client,
      normalizedPlayerId,
      Array.isArray(snapshot.unlockedMapIds) ? snapshot.unlockedMapIds : [],
      versionSeed,
    );
    watermarkPatch.map_unlock_version = versionSeed;
  }

  if (rawDomains.has('equipment')) {
    const equipmentSlots = Array.isArray(snapshot.equipment?.slots) ? snapshot.equipment.slots : [];
    await replacePlayerEquipmentSlots(
      client,
      normalizedPlayerId,
      equipmentSlots,
      {
        allowEmptyOverwrite: options.allowEquipmentEmptyOverwrite === true
          && isExplicitEquipmentSlotProjection(equipmentSlots),
      },
    );
    watermarkPatch.equipment_version = versionSeed;
  }

  if (rawDomains.has('technique')) {
    await replacePlayerTechniqueStates(client, normalizedPlayerId, buildTechniqueStateRows(snapshot));
    watermarkPatch.technique_version = versionSeed;
  }

  if (rawDomains.has('buff')) {
    await replacePlayerPersistentBuffStates(
      client,
      normalizedPlayerId,
      buildPersistentBuffStateRows(snapshot),
      { allowBuffEmptyOverwrite: options.allowBuffEmptyOverwrite === true },
    );
    watermarkPatch.buff_version = versionSeed;
  }

  if (rawDomains.has('quest')) {
    await replacePlayerQuestProgressRows(client, normalizedPlayerId, buildQuestProgressRows(snapshot));
    watermarkPatch.quest_version = versionSeed;
  }

  if (rawDomains.has('combat_pref')) {
    await replacePlayerCombatPreferences(client, normalizedPlayerId, buildCombatPreferencesRow(snapshot));
    watermarkPatch.combat_pref_version = versionSeed;
  }

  if (rawDomains.has('auto_battle_skill')) {
    await replacePlayerAutoBattleSkills(client, normalizedPlayerId, buildAutoBattleSkillRows(snapshot));
    watermarkPatch.auto_battle_skill_version = versionSeed;
  }

  if (rawDomains.has('auto_use_item_rule')) {
    await replacePlayerAutoUseItemRules(client, normalizedPlayerId, buildAutoUseItemRuleRows(snapshot));
    watermarkPatch.auto_use_item_rule_version = versionSeed;
  }

  if (rawDomains.has('profession')) {
    await replacePlayerProfessionStates(client, normalizedPlayerId, buildProfessionStateRows(snapshot));
    watermarkPatch.profession_version = versionSeed;
  }

  if (rawDomains.has('alchemy_preset')) {
    await replacePlayerAlchemyPresets(client, normalizedPlayerId, buildAlchemyPresetRows(snapshot));
    watermarkPatch.alchemy_preset_version = versionSeed;
  }

  if (rawDomains.has('active_job')) {
    await replacePlayerActiveJob(client, normalizedPlayerId, buildActiveJobRow(normalizedPlayerId, snapshot, versionSeed));
    watermarkPatch.active_job_version = versionSeed;
  }

  if (rawDomains.has('enhancement_record')) {
    await replacePlayerEnhancementRecords(
      client,
      normalizedPlayerId,
      buildEnhancementRecordRows(normalizedPlayerId, snapshot),
    );
    watermarkPatch.enhancement_record_version = versionSeed;
  }

  if (rawDomains.has('logbook')) {
    await replacePlayerLogbookMessages(
      client,
      normalizedPlayerId,
      Array.isArray(snapshot.pendingLogbookMessages) ? snapshot.pendingLogbookMessages : [],
    );
    watermarkPatch.logbook_version = versionSeed;
  }

  if (Object.keys(watermarkPatch).length > 0) {
    await upsertRecoveryWatermark(client, normalizedPlayerId, watermarkPatch);
  }
}

function normalizeProjectedDirtyDomains(domains: Iterable<string>): Set<string> {
  const normalized = new Set<string>();
  for (const domain of domains ?? []) {
    if (typeof domain === 'string' && domain.trim()) {
      normalized.add(domain.trim());
    }
  }
  return normalized;
}

async function replacePlayerWorldAnchor(
  client: PoolClient,
  playerId: string,
  row: PlayerWorldAnchorUpsertInput,
): Promise<void> {
  await client.query(
    `
      INSERT INTO ${PLAYER_WORLD_ANCHOR_TABLE}(
        player_id,
        respawn_template_id,
        respawn_instance_id,
        respawn_x,
        respawn_y,
        last_safe_template_id,
        last_safe_instance_id,
        last_safe_x,
        last_safe_y,
        preferred_line_preset,
        last_transfer_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        respawn_template_id = EXCLUDED.respawn_template_id,
        respawn_instance_id = EXCLUDED.respawn_instance_id,
        respawn_x = EXCLUDED.respawn_x,
        respawn_y = EXCLUDED.respawn_y,
        last_safe_template_id = EXCLUDED.last_safe_template_id,
        last_safe_instance_id = EXCLUDED.last_safe_instance_id,
        last_safe_x = EXCLUDED.last_safe_x,
        last_safe_y = EXCLUDED.last_safe_y,
        preferred_line_preset = EXCLUDED.preferred_line_preset,
        last_transfer_at = EXCLUDED.last_transfer_at,
        updated_at = now()
    `,
    [
      playerId,
      normalizeRequiredString(row.respawnTemplateId),
      normalizeOptionalString(row.respawnInstanceId),
      normalizeIntegerWithFallback(row.respawnX, 0),
      normalizeIntegerWithFallback(row.respawnY, 0),
      normalizeRequiredString(row.lastSafeTemplateId),
      normalizeOptionalString(row.lastSafeInstanceId),
      normalizeIntegerWithFallback(row.lastSafeX, 0),
      normalizeIntegerWithFallback(row.lastSafeY, 0),
      normalizeWorldPreferenceLinePreset(row.preferredLinePreset),
      normalizeOptionalInteger(row.lastTransferAt),
    ],
  );
}

async function replacePlayerPositionCheckpoint(
  client: PoolClient,
  playerId: string,
  row: PlayerPositionCheckpointUpsertInput,
): Promise<void> {
  await client.query(
    `
      INSERT INTO ${PLAYER_POSITION_CHECKPOINT_TABLE}(
        player_id,
        instance_id,
        x,
        y,
        facing,
        checkpoint_kind,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        instance_id = EXCLUDED.instance_id,
        x = EXCLUDED.x,
        y = EXCLUDED.y,
        facing = EXCLUDED.facing,
        checkpoint_kind = EXCLUDED.checkpoint_kind,
        updated_at = now()
    `,
    [
      playerId,
      normalizeRequiredString(row.instanceId),
      normalizeIntegerWithFallback(row.x, 0),
      normalizeIntegerWithFallback(row.y, 0),
      normalizeIntegerWithFallback(row.facing, 1),
      normalizeRequiredString(row.checkpointKind),
    ],
  );
}

async function replacePlayerVitals(
  client: PoolClient,
  playerId: string,
  row: PlayerVitalsUpsertInput,
): Promise<void> {
  await client.query(
    `
      INSERT INTO ${PLAYER_VITALS_TABLE}(
        player_id,
        hp,
        max_hp,
        qi,
        max_qi,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        hp = EXCLUDED.hp,
        max_hp = EXCLUDED.max_hp,
        qi = EXCLUDED.qi,
        max_qi = EXCLUDED.max_qi,
        updated_at = now()
    `,
    [
      playerId,
      normalizeMinimumNumber(row.hp, 0, 0),
      normalizeMinimumNumber(row.maxHp, 1, 1),
      normalizeMinimumNumber(row.qi, 0, 0),
      normalizeMinimumNumber(row.maxQi, 0, 0),
    ],
  );
}

async function replacePlayerProgressionCore(
  client: PoolClient,
  playerId: string,
  row: PlayerProgressionCoreUpsertInput,
): Promise<void> {
  await client.query(
    `
      INSERT INTO ${PLAYER_PROGRESSION_CORE_TABLE}(
        player_id,
        foundation,
        root_foundation,
        combat_exp,
        bone_age_base_years,
        life_elapsed_ticks,
        lifespan_years,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        foundation = EXCLUDED.foundation,
        root_foundation = EXCLUDED.root_foundation,
        combat_exp = EXCLUDED.combat_exp,
        bone_age_base_years = EXCLUDED.bone_age_base_years,
        life_elapsed_ticks = EXCLUDED.life_elapsed_ticks,
        lifespan_years = EXCLUDED.lifespan_years,
        updated_at = now()
    `,
    [
      playerId,
      normalizeMinimumNumber(row.foundation, 0, 0),
      normalizeMinimumNumber(row.rootFoundation, 0, 0),
      normalizeMinimumNumber(row.combatExp, 0, 0),
      normalizeMinimumInteger(row.boneAgeBaseYears, 18, 0),
      normalizeMinimumInteger(row.lifeElapsedTicks, 0, 0),
      normalizeOptionalInteger(row.lifespanYears),
    ],
  );
}

export async function ensurePlayerDomainTables(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensurePlayerDomainTablesWithClient(client);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function ensurePlayerDomainTablesWithClient(client: PoolClient): Promise<void> {
  await acquireSchemaInitLock(client);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_PRESENCE_TABLE} (
      player_id varchar(100) PRIMARY KEY,
      online boolean NOT NULL DEFAULT false,
      in_world boolean NOT NULL DEFAULT false,
      last_heartbeat_at bigint,
      offline_since_at bigint,
      runtime_owner_id varchar(180),
      session_epoch bigint NOT NULL DEFAULT 1,
      transfer_state varchar(32),
      transfer_target_node_id varchar(120),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await ensurePlayerPresenceColumnsWithClient(client);
  await client.query(`
    ALTER TABLE ${PLAYER_PRESENCE_TABLE}
    ALTER COLUMN runtime_owner_id TYPE varchar(180)
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_WORLD_ANCHOR_TABLE} (
      player_id varchar(100) PRIMARY KEY,
      respawn_template_id varchar(120) NOT NULL,
      respawn_instance_id varchar(160),
      respawn_x bigint NOT NULL,
      respawn_y bigint NOT NULL,
      last_safe_template_id varchar(120) NOT NULL,
      last_safe_instance_id varchar(160),
      last_safe_x bigint NOT NULL,
      last_safe_y bigint NOT NULL,
      preferred_line_preset varchar(16) NOT NULL DEFAULT 'peaceful',
      last_transfer_at bigint,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_WORLD_ANCHOR_TABLE}
    ADD COLUMN IF NOT EXISTS preferred_line_preset varchar(16) NOT NULL DEFAULT 'peaceful'
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_POSITION_CHECKPOINT_TABLE} (
      player_id varchar(100) PRIMARY KEY,
      instance_id varchar(160) NOT NULL,
      x bigint NOT NULL,
      y bigint NOT NULL,
      facing bigint NOT NULL,
      checkpoint_kind varchar(32) NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_VITALS_TABLE} (
      player_id varchar(100) PRIMARY KEY,
      hp double precision NOT NULL,
      max_hp double precision NOT NULL,
      qi double precision NOT NULL,
      max_qi double precision NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_PROGRESSION_CORE_TABLE} (
      player_id varchar(100) PRIMARY KEY,
      foundation double precision NOT NULL DEFAULT 0,
      root_foundation double precision NOT NULL DEFAULT 0,
      combat_exp double precision NOT NULL DEFAULT 0,
      bone_age_base_years bigint NOT NULL DEFAULT 18,
      life_elapsed_ticks bigint NOT NULL DEFAULT 0,
      lifespan_years bigint,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_PROGRESSION_CORE_TABLE}
    ADD COLUMN IF NOT EXISTS root_foundation double precision NOT NULL DEFAULT 0
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_ATTR_STATE_TABLE} (
      player_id varchar(100) PRIMARY KEY,
      base_attrs_payload jsonb,
      bonus_entries_payload jsonb NOT NULL DEFAULT '[]'::jsonb,
      revealed_breakthrough_requirement_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      realm_payload jsonb,
      heaven_gate_payload jsonb,
      spiritual_roots_payload jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_BODY_TRAINING_STATE_TABLE} (
      player_id varchar(100) PRIMARY KEY,
      level bigint NOT NULL DEFAULT 0,
      exp double precision NOT NULL DEFAULT 0,
      exp_to_next double precision NOT NULL DEFAULT 1,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_WALLET_TABLE} (
      player_id varchar(100) NOT NULL,
      wallet_type varchar(64) NOT NULL,
      balance bigint NOT NULL DEFAULT 0,
      frozen_balance bigint NOT NULL DEFAULT 0,
      version bigint NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(player_id, wallet_type)
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS player_wallet_player_idx
    ON ${PLAYER_WALLET_TABLE}(player_id, wallet_type ASC)
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_INVENTORY_ITEM_TABLE} (
      item_instance_id varchar(180) PRIMARY KEY,
      player_id varchar(100) NOT NULL,
      slot_index bigint NOT NULL,
      item_id varchar(160) NOT NULL,
      count bigint NOT NULL DEFAULT 1,
      raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      locked_by varchar(180) DEFAULT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(player_id, slot_index)
    )
  `);
  // 旧表升级：为已有 player_inventory_item 表补上 locked_by 列。
  // locked_by 为 NULL 表示常规背包行；非 NULL 表示进入锁定空间（强化/市场托管等），
  // 不参与 (player_id, slot_index) 唯一约束的语义槽位（locked 行用负 slot_index 自避让）。
  await client.query(`
    ALTER TABLE ${PLAYER_INVENTORY_ITEM_TABLE}
    ADD COLUMN IF NOT EXISTS locked_by varchar(180) DEFAULT NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS player_inventory_item_player_idx
    ON ${PLAYER_INVENTORY_ITEM_TABLE}(player_id, slot_index ASC)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS player_inventory_item_item_idx
    ON ${PLAYER_INVENTORY_ITEM_TABLE}(item_id, player_id ASC)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS player_inventory_item_locked_idx
    ON ${PLAYER_INVENTORY_ITEM_TABLE}(player_id, locked_by)
    WHERE locked_by IS NOT NULL
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_MARKET_STORAGE_ITEM_TABLE} (
      storage_item_id varchar(160) PRIMARY KEY,
      player_id varchar(100) NOT NULL,
      slot_index bigint NOT NULL,
      item_id varchar(160) NOT NULL,
      count bigint NOT NULL DEFAULT 1,
      enhance_level bigint,
      raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(player_id, slot_index)
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS player_market_storage_item_player_idx
    ON ${PLAYER_MARKET_STORAGE_ITEM_TABLE}(player_id, slot_index ASC)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS player_market_storage_item_item_idx
    ON ${PLAYER_MARKET_STORAGE_ITEM_TABLE}(item_id, player_id ASC)
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_MAP_UNLOCK_TABLE} (
      player_id varchar(100) NOT NULL,
      map_id varchar(120) NOT NULL,
      unlocked_at bigint NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(player_id, map_id)
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS player_map_unlock_player_idx
    ON ${PLAYER_MAP_UNLOCK_TABLE}(player_id, unlocked_at ASC)
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_EQUIPMENT_SLOT_TABLE} (
      player_id varchar(100) NOT NULL,
      slot_type varchar(32) NOT NULL,
      item_instance_id varchar(180) NOT NULL,
      item_id varchar(120) NOT NULL,
      raw_payload jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(player_id, slot_type),
      UNIQUE(item_instance_id)
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS player_equipment_slot_player_idx
    ON ${PLAYER_EQUIPMENT_SLOT_TABLE}(player_id)
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_TECHNIQUE_STATE_TABLE} (
      player_id varchar(100) NOT NULL,
      tech_id varchar(120) NOT NULL,
      level bigint NOT NULL DEFAULT 1,
      exp double precision,
      exp_to_next double precision,
      realm_lv bigint,
      skills_enabled boolean NOT NULL DEFAULT true,
      raw_payload jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(player_id, tech_id)
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS player_technique_state_player_idx
    ON ${PLAYER_TECHNIQUE_STATE_TABLE}(player_id, realm_lv ASC, tech_id ASC)
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_PERSISTENT_BUFF_STATE_TABLE} (
      player_id varchar(100) NOT NULL,
      buff_id varchar(160) NOT NULL,
      source_skill_id varchar(160) NOT NULL,
      source_caster_id varchar(120),
      realm_lv bigint,
      remaining_ticks bigint NOT NULL DEFAULT 0,
      duration bigint NOT NULL DEFAULT 0,
      stacks bigint NOT NULL DEFAULT 1,
      max_stacks bigint NOT NULL DEFAULT 1,
      sustain_ticks_elapsed bigint,
      raw_payload jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(player_id, buff_id, source_skill_id)
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS player_persistent_buff_state_player_idx
    ON ${PLAYER_PERSISTENT_BUFF_STATE_TABLE}(player_id, buff_id ASC, source_skill_id ASC)
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_QUEST_PROGRESS_TABLE} (
      player_id varchar(100) NOT NULL,
      quest_id varchar(160) NOT NULL,
      status varchar(32) NOT NULL,
      progress_payload jsonb,
      raw_payload jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(player_id, quest_id)
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS player_quest_progress_player_idx
    ON ${PLAYER_QUEST_PROGRESS_TABLE}(player_id, status ASC, quest_id ASC)
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_COMBAT_PREFERENCES_TABLE} (
      player_id varchar(100) PRIMARY KEY,
      auto_battle boolean NOT NULL DEFAULT false,
      auto_retaliate boolean NOT NULL DEFAULT true,
      auto_battle_stationary boolean NOT NULL DEFAULT false,
      auto_battle_targeting_mode varchar(32) NOT NULL DEFAULT 'auto',
      retaliate_player_target_id varchar(120),
      retaliate_player_target_last_attack_tick bigint,
      combat_target_id varchar(120),
      combat_target_locked boolean NOT NULL DEFAULT false,
      allow_aoe_player_hit boolean NOT NULL DEFAULT false,
      auto_idle_cultivation boolean NOT NULL DEFAULT true,
      auto_switch_cultivation boolean NOT NULL DEFAULT true,
      auto_root_foundation boolean NOT NULL DEFAULT false,
      sense_qi_active boolean NOT NULL DEFAULT false,
      cultivating_tech_id varchar(120),
      targeting_rules_payload jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_COMBAT_PREFERENCES_TABLE}
    ADD COLUMN IF NOT EXISTS retaliate_player_target_last_attack_tick bigint
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_COMBAT_PREFERENCES_TABLE}
    ADD COLUMN IF NOT EXISTS auto_root_foundation boolean NOT NULL DEFAULT false
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_AUTO_BATTLE_SKILL_TABLE} (
      player_id varchar(100) NOT NULL,
      skill_id varchar(160) NOT NULL,
      enabled boolean NOT NULL DEFAULT true,
      skill_enabled boolean NOT NULL DEFAULT true,
      auto_battle_order bigint NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(player_id, skill_id)
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS player_auto_battle_skill_player_idx
    ON ${PLAYER_AUTO_BATTLE_SKILL_TABLE}(player_id, auto_battle_order ASC, skill_id ASC)
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_AUTO_USE_ITEM_RULE_TABLE} (
      player_id varchar(100) NOT NULL,
      item_id varchar(120) NOT NULL,
      condition_payload jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(player_id, item_id)
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS player_auto_use_item_rule_player_idx
    ON ${PLAYER_AUTO_USE_ITEM_RULE_TABLE}(player_id, item_id ASC)
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_PROFESSION_STATE_TABLE} (
      player_id varchar(100) NOT NULL,
      profession_type varchar(32) NOT NULL,
      level bigint NOT NULL,
      exp double precision,
      exp_to_next double precision,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(player_id, profession_type)
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS player_profession_state_player_idx
    ON ${PLAYER_PROFESSION_STATE_TABLE}(player_id, profession_type ASC)
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_ALCHEMY_PRESET_TABLE} (
      player_id varchar(100) NOT NULL,
      preset_id varchar(180) NOT NULL,
      recipe_id varchar(120),
      name varchar(160) NOT NULL,
      ingredients_payload jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(player_id, preset_id)
    )
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_ALCHEMY_PRESET_TABLE}
    DROP CONSTRAINT IF EXISTS player_alchemy_preset_pkey
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_ALCHEMY_PRESET_TABLE}
    ADD PRIMARY KEY (player_id, preset_id)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS player_alchemy_preset_player_idx
    ON ${PLAYER_ALCHEMY_PRESET_TABLE}(player_id)
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_ACTIVE_JOB_TABLE} (
      player_id varchar(100) PRIMARY KEY,
      job_run_id varchar(180) NOT NULL UNIQUE,
      job_type varchar(32) NOT NULL,
      status varchar(32) NOT NULL,
      phase varchar(64) NOT NULL,
      started_at bigint NOT NULL,
      finished_at bigint,
      paused_ticks bigint NOT NULL DEFAULT 0,
      total_ticks bigint NOT NULL DEFAULT 0,
      remaining_ticks bigint NOT NULL DEFAULT 0,
      success_rate double precision NOT NULL DEFAULT 0,
      speed_rate double precision NOT NULL DEFAULT 1,
      job_version bigint NOT NULL DEFAULT 1,
      detail_jsonb jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS player_active_job_job_idx
    ON ${PLAYER_ACTIVE_JOB_TABLE}(job_type, status ASC, player_id ASC)
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_ENHANCEMENT_RECORD_TABLE} (
      record_id varchar(180) PRIMARY KEY,
      player_id varchar(100) NOT NULL,
      item_id varchar(160) NOT NULL,
      highest_level bigint NOT NULL DEFAULT 0,
      levels_payload jsonb NOT NULL DEFAULT '[]'::jsonb,
      action_started_at bigint,
      action_ended_at bigint,
      start_level bigint,
      initial_target_level bigint,
      desired_target_level bigint,
      protection_start_level bigint,
      status varchar(32),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS player_enhancement_record_player_idx
    ON ${PLAYER_ENHANCEMENT_RECORD_TABLE}(player_id, item_id ASC)
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_LOGBOOK_MESSAGE_TABLE} (
      player_id varchar(100) NOT NULL,
      message_id varchar(180) NOT NULL,
      kind varchar(32) NOT NULL,
      text text NOT NULL,
      from_name varchar(120),
      occurred_at bigint NOT NULL,
      acked_at bigint,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(player_id, message_id)
    )
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_LOGBOOK_MESSAGE_TABLE}
    DROP CONSTRAINT IF EXISTS player_logbook_message_pkey
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_LOGBOOK_MESSAGE_TABLE}
    ADD PRIMARY KEY (player_id, message_id)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS player_logbook_message_player_idx
    ON ${PLAYER_LOGBOOK_MESSAGE_TABLE}(player_id, occurred_at DESC)
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_OFFLINE_GAIN_SESSION_TABLE} (
      player_id varchar(100) PRIMARY KEY,
      session_id varchar(180) NOT NULL,
      started_at bigint NOT NULL,
      baseline_payload jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_OFFLINE_GAIN_SESSION_TABLE}
    ADD COLUMN IF NOT EXISTS accumulated_payload jsonb DEFAULT '{}'
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_OFFLINE_GAIN_SESSION_TABLE}
    ADD COLUMN IF NOT EXISTS accumulated_duration_ms bigint DEFAULT 0
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_OFFLINE_GAIN_REPORT_TABLE} (
      player_id varchar(100) NOT NULL,
      report_id varchar(180) NOT NULL,
      started_at bigint NOT NULL,
      ended_at bigint NOT NULL,
      duration_ms bigint NOT NULL DEFAULT 0,
      payload jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(player_id, report_id)
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS player_offline_gain_report_player_idx
    ON ${PLAYER_OFFLINE_GAIN_REPORT_TABLE}(player_id, ended_at DESC)
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_STATISTIC_DAY_TOTAL_TABLE} (
      player_id varchar(100) NOT NULL,
      day_key varchar(16) NOT NULL,
      spirit_gained double precision NOT NULL DEFAULT 0,
      spirit_lost double precision NOT NULL DEFAULT 0,
      progress_gained double precision NOT NULL DEFAULT 0,
      progress_lost double precision NOT NULL DEFAULT 0,
      technique_gained double precision NOT NULL DEFAULT 0,
      technique_lost double precision NOT NULL DEFAULT 0,
      profession_gained double precision NOT NULL DEFAULT 0,
      profession_lost double precision NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(player_id, day_key)
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS player_statistic_day_total_player_idx
    ON ${PLAYER_STATISTIC_DAY_TOTAL_TABLE}(player_id, day_key DESC)
  `);
  await ensurePlayerDomainBigintColumnsWithClient(client);
  await ensurePlayerDomainDoubleColumnsWithClient(client);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_RECOVERY_WATERMARK_TABLE} (
      player_id varchar(100) PRIMARY KEY,
      identity_version bigint NOT NULL DEFAULT 0,
      presence_version bigint NOT NULL DEFAULT 0,
      anchor_version bigint NOT NULL DEFAULT 0,
      position_checkpoint_version bigint NOT NULL DEFAULT 0,
      vitals_version bigint NOT NULL DEFAULT 0,
      progression_version bigint NOT NULL DEFAULT 0,
      attr_version bigint NOT NULL DEFAULT 0,
      wallet_version bigint NOT NULL DEFAULT 0,
      inventory_version bigint NOT NULL DEFAULT 0,
      market_storage_version bigint NOT NULL DEFAULT 0,
      equipment_version bigint NOT NULL DEFAULT 0,
      technique_version bigint NOT NULL DEFAULT 0,
      body_training_version bigint NOT NULL DEFAULT 0,
      buff_version bigint NOT NULL DEFAULT 0,
      quest_version bigint NOT NULL DEFAULT 0,
      map_unlock_version bigint NOT NULL DEFAULT 0,
      combat_pref_version bigint NOT NULL DEFAULT 0,
      auto_battle_skill_version bigint NOT NULL DEFAULT 0,
      auto_use_item_rule_version bigint NOT NULL DEFAULT 0,
      profession_version bigint NOT NULL DEFAULT 0,
      alchemy_preset_version bigint NOT NULL DEFAULT 0,
      active_job_version bigint NOT NULL DEFAULT 0,
      enhancement_record_version bigint NOT NULL DEFAULT 0,
      logbook_version bigint NOT NULL DEFAULT 0,
      mail_version bigint NOT NULL DEFAULT 0,
      mail_counter_version bigint NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await ensureRecoveryWatermarkColumnsWithClient(client);
}

async function ensurePlayerPresenceColumnsWithClient(client: PoolClient): Promise<void> {
  await client.query(`
    ALTER TABLE ${PLAYER_PRESENCE_TABLE}
    ADD COLUMN IF NOT EXISTS player_id varchar(100)
  `);
  if (await hasColumn(client, PLAYER_PRESENCE_TABLE, 'playerId')) {
    await client.query(`
      UPDATE ${PLAYER_PRESENCE_TABLE}
      SET player_id = "playerId"
      WHERE player_id IS NULL
        AND "playerId" IS NOT NULL
    `);
  }
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS player_presence_player_id_idx
    ON ${PLAYER_PRESENCE_TABLE}(player_id)
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_PRESENCE_TABLE}
    ADD COLUMN IF NOT EXISTS online boolean NOT NULL DEFAULT false
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_PRESENCE_TABLE}
    ADD COLUMN IF NOT EXISTS in_world boolean NOT NULL DEFAULT false
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_PRESENCE_TABLE}
    ADD COLUMN IF NOT EXISTS last_heartbeat_at bigint
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_PRESENCE_TABLE}
    ADD COLUMN IF NOT EXISTS offline_since_at bigint
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_PRESENCE_TABLE}
    ADD COLUMN IF NOT EXISTS runtime_owner_id varchar(180)
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_PRESENCE_TABLE}
    ADD COLUMN IF NOT EXISTS session_epoch bigint NOT NULL DEFAULT 1
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_PRESENCE_TABLE}
    ADD COLUMN IF NOT EXISTS transfer_state varchar(32)
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_PRESENCE_TABLE}
    ADD COLUMN IF NOT EXISTS transfer_target_node_id varchar(120)
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_PRESENCE_TABLE}
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
  `);
}

async function hasColumn(client: PoolClient, tableName: string, columnName: string): Promise<boolean> {
  const result = await client.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1
        AND column_name = $2
      LIMIT 1
    `,
    [tableName, columnName],
  );
  return (result.rowCount ?? 0) > 0;
}

async function ensureRecoveryWatermarkColumnsWithClient(client: PoolClient): Promise<void> {
  for (const column of WATERMARK_COLUMNS) {
    await client.query(`
      ALTER TABLE ${PLAYER_RECOVERY_WATERMARK_TABLE}
      ADD COLUMN IF NOT EXISTS ${column} bigint NOT NULL DEFAULT 0
    `);
  }
}

async function ensurePlayerDomainBigintColumnsWithClient(client: PoolClient): Promise<void> {
  await ensureBigintColumnsWithClient(client, PLAYER_DOMAIN_BIGINT_COLUMNS_BY_TABLE);
}

async function ensurePlayerDomainDoubleColumnsWithClient(client: PoolClient): Promise<void> {
  await ensureDoubleColumnsWithClient(client, PLAYER_DOMAIN_DOUBLE_COLUMNS_BY_TABLE);
}

/** 把 inventory entry 安全地序列化成日志字符串，处理循环引用与超长输出，避免 throw 时再炸。 */
function safeStringifyInventoryEntry(value: unknown): string {
  const MAX_DIGEST_LENGTH = 240;
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    serialized = '[unserializable]';
  }
  if (typeof serialized !== 'string') {
    return '[non-string]';
  }
  return serialized.length > MAX_DIGEST_LENGTH
    ? `${serialized.slice(0, MAX_DIGEST_LENGTH)}...`
    : serialized;
}

function isSamePersistedPayload(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isExplicitEquipmentSlotProjection(slots: readonly unknown[]): boolean {
  if (!Array.isArray(slots) || slots.length < EQUIP_SLOTS.length) {
    return false;
  }
  const projectedSlots = new Set<string>();
  for (const slotEntry of slots) {
    const slotType = normalizeRequiredString(asRecord(slotEntry)?.slot);
    if (slotType) {
      projectedSlots.add(slotType);
    }
  }
  return EQUIP_SLOTS.every((slotType) => projectedSlots.has(slotType));
}

/**
 * 拒绝"用空 incoming 把整玩家分域表清空"的 SQL 层最终防御。
 *
 * 背景：玩家分域 replace 函数（inventory/wallet/equipment/market_storage/technique/buff/quest）末尾都有
 * 一段 `WHERE player_id = $1 AND NOT EXISTS (SELECT 1 FROM <incoming> ...)` 形态的 cleanup DELETE。
 * 当 incoming 为空数组时这条 SQL 退化为"无差别清空整玩家该域所有 row"，曾经被 ensureNativeStarterSnapshot
 * 的 silent-rebirth fallback（PG 读失败 → catch null → fall through 写空 starter）触发过事故。
 *
 * 这个 helper 在每个 replace 函数末尾的 cleanup DELETE 之前调用：
 * - incoming 不为空 → 正常进入 cleanup（合法 stale 删除）；
 * - incoming 为空 + PG 中该玩家在该域有 N>0 行 → throw，让 withTransaction 整体 rollback；
 * - incoming 为空 + PG 中本来也是空 → no-op 通过（合法零状态）。
 *
 * 玩家正常游戏中 inventory/wallet/equipment/market_storage 不会从有变成全空（至少有起步装备/初始铜钱），
 * technique/buff/quest 同样不会一次清光。如果有合法 reset 场景，应该走显式专门 API，不能通过整快照 replace 触发。
 */
async function refuseEmptyOverwriteIfRowsExist(
  client: PoolClient,
  tableName: string,
  playerId: string,
  incomingCount: number,
  domainTag: string,
): Promise<void> {
  if (incomingCount > 0) {
    return;
  }
  const result = await client.query(
    `SELECT 1 AS exists FROM ${tableName} WHERE player_id = $1 LIMIT 1`,
    [playerId],
  );
  if ((result.rowCount ?? 0) > 0) {
    throw new Error(
      `replace_${domainTag}_refused_empty_overwrite:playerId=${playerId} table=${tableName}`,
    );
  }
}

async function replacePlayerInventoryItems(
  client: PoolClient,
  playerId: string,
  items: unknown[],
  options: PlayerDomainPruneOptions = {},
): Promise<void> {
  const sourceItems = Array.isArray(items) ? items : [];
  const rowsByInstanceId = new Map<string, {
    item_instance_id: string;
    slot_index: number;
    item_id: string;
    count: number;
    raw_payload: Record<string, unknown>;
    locked_by: string | null;
  }>();
  // 锁定行使用负数 slot_index 与常规背包行 (>=0) 自避让，避免命中 (player_id, slot_index)
  // 唯一约束。这样保留旧 DDL 约束语义、又不需要把约束改成 partial unique index。
  let lockedSlotCounter = -1;
  for (let index = 0; index < sourceItems.length; index += 1) {
    const entry = asRecord(sourceItems[index]);
    const itemId = normalizeRequiredString(entry?.itemId);
    if (!itemId) {
      // 静默 continue 是商业级 MMO 资产丢失的隐藏通道：玩家会无声丢东西，运维事后无法定位。
      // 这里改为抛错，让外层 withTransaction 整体 rollback（DELETE 也一起撤销），DB 维持
      // 上一次成功 flush 的状态；同时错误信息携带 playerId/index/原始 entry 摘要，便于排障。
      const entryDigest = safeStringifyInventoryEntry(sourceItems[index]);
      throw new Error(
        `replacePlayerInventoryItems: 非法 inventory entry 拒绝写入 playerId=${playerId} index=${index} entry=${entryDigest}`,
      );
    }
    const lockedBy = normalizeOptionalString(entry?.lockedBy);
    const slotIndex = lockedBy != null
      ? lockedSlotCounter--
      : (normalizeOptionalInteger(entry?.slotIndex) ?? index);
    const sourceItemInstanceId = normalizeOptionalString(entry?.itemInstanceId);
    let itemInstanceId = sourceItemInstanceId && !isLegacyItemInstanceId(sourceItemInstanceId)
      ? sourceItemInstanceId
      : `inv:${playerId}:${slotIndex}`;
    const rawPayload = asRecord(entry?.rawPayload);
    const count = normalizeMinimumInteger(entry?.count, rawPayload?.count, 1);
    const persistedPayload = buildPersistedInventoryItemRawPayload({
      itemId,
      count,
      enhanceLevel: entry?.enhanceLevel,
      rawPayload,
    });
    if (lockedBy != null) {
      // 锁定空间还需要保留 lockedAt 才能在水合后还原 LockedItem 形态。lockedAt 不进
      // buildPersistedInventoryItemRawPayload（保持其"只 enhanceLevel"的最小 payload 语义），
      // 而是在 locked 行单独追加进 raw_payload。
      const lockedAt = normalizeOptionalInteger(entry?.lockedAt)
        ?? normalizeOptionalInteger(rawPayload?.lockedAt);
      if (lockedAt != null) {
        persistedPayload.lockedAt = lockedAt;
      }
    }
    const row = {
      item_instance_id: itemInstanceId,
      slot_index: slotIndex,
      item_id: itemId,
      count,
      raw_payload: persistedPayload,
      locked_by: lockedBy,
    };
    const persistedRowSignature = createPersistedInventoryRowSignature(itemId, persistedPayload);
    const existingRow = rowsByInstanceId.get(itemInstanceId);
    const existingRowSignature = existingRow
      ? createPersistedInventoryRowSignature(existingRow.item_id, existingRow.raw_payload)
      : null;
    if (existingRow) {
      if (
        existingRow.locked_by == null
        && lockedBy == null
        && existingRowSignature === persistedRowSignature
      ) {
        existingRow.count += count;
        continue;
      }
      if (
        existingRow.slot_index !== slotIndex
        || existingRow.item_id !== itemId
        || existingRow.locked_by !== lockedBy
        || existingRowSignature !== persistedRowSignature
      ) {
        if (lockedBy == null) {
          itemInstanceId = randomUUID();
          row.item_instance_id = itemInstanceId;
          rowsByInstanceId.set(itemInstanceId, row);
          continue;
        }
        if (existingRow.locked_by == null) {
          const reassignedExistingId = randomUUID();
          rowsByInstanceId.delete(itemInstanceId);
          existingRow.item_instance_id = reassignedExistingId;
          rowsByInstanceId.set(reassignedExistingId, existingRow);
          rowsByInstanceId.set(itemInstanceId, row);
          continue;
        }
        throw new Error(
          `replacePlayerInventoryItems: duplicate item_instance_id with conflicting payload playerId=${playerId} itemInstanceId=${itemInstanceId} existingSlot=${existingRow.slot_index} incomingSlot=${slotIndex} existingLockedBy=${existingRow.locked_by ?? 'null'} incomingLockedBy=${lockedBy ?? 'null'} existingItemId=${existingRow.item_id} incomingItemId=${itemId}`,
        );
      }
      existingRow.count += count;
      continue;
    }
    rowsByInstanceId.set(itemInstanceId, row);
  }
  const rows = Array.from(rowsByInstanceId.values());
  const rowsJson = JSON.stringify(rows);

  if (rows.length > 0) {
    await client.query(
      `
        WITH incoming AS (
          SELECT item_instance_id, slot_index
          FROM jsonb_to_recordset($2::jsonb) AS entry(item_instance_id varchar(180), slot_index bigint)
        )
        DELETE FROM ${PLAYER_INVENTORY_ITEM_TABLE} target
        WHERE target.player_id = $1
          AND EXISTS (
            SELECT 1
            FROM incoming
            WHERE incoming.slot_index = target.slot_index
              AND incoming.item_instance_id <> target.item_instance_id
          )
      `,
      [playerId, rowsJson],
    );
    const result = await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            item_instance_id varchar(180),
            slot_index bigint,
            item_id varchar(160),
            count bigint,
            raw_payload jsonb,
            locked_by varchar(180)
          )
        )
        INSERT INTO ${PLAYER_INVENTORY_ITEM_TABLE}(
          item_instance_id,
          player_id,
          slot_index,
          item_id,
          count,
          raw_payload,
          locked_by,
          updated_at
        )
        SELECT item_instance_id, $1, slot_index, item_id, count, COALESCE(raw_payload, '{}'::jsonb), locked_by, now()
        FROM incoming
        ON CONFLICT (item_instance_id)
        DO UPDATE SET
          player_id = EXCLUDED.player_id,
          slot_index = EXCLUDED.slot_index,
          item_id = EXCLUDED.item_id,
          count = EXCLUDED.count,
          raw_payload = EXCLUDED.raw_payload,
          locked_by = EXCLUDED.locked_by,
          updated_at = now()
        WHERE ${PLAYER_INVENTORY_ITEM_TABLE}.player_id = EXCLUDED.player_id
      `,
      [playerId, rowsJson],
    );
    if ((result.rowCount ?? 0) !== rows.length) {
      throw new Error(`replacePlayerInventoryItems: item_instance_id conflict outside player scope playerId=${playerId}`);
    }
  }
  if (options.allowEmptyOverwrite !== true) {
    await refuseEmptyOverwriteIfRowsExist(client, PLAYER_INVENTORY_ITEM_TABLE, playerId, rows.length, 'inventory');
  }
  await client.query(
    `
      WITH incoming AS (
        SELECT item_instance_id
        FROM jsonb_to_recordset($2::jsonb) AS entry(item_instance_id varchar(180))
      )
      DELETE FROM ${PLAYER_INVENTORY_ITEM_TABLE} target
      WHERE target.player_id = $1
        AND NOT EXISTS (
          SELECT 1
          FROM incoming
          WHERE incoming.item_instance_id = target.item_instance_id
        )
    `,
    [playerId, rowsJson],
  );
}


function createPersistedInventoryRowSignature(itemId: string, rawPayload: Record<string, unknown>): string {
  return createItemStackSignature({
    itemId,
    ...rawPayload,
  });
}

async function replacePlayerWalletRows(
  client: PoolClient,
  playerId: string,
  rows: readonly PlayerWalletUpsertInput[],
  versionSeed: number,
): Promise<void> {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const normalizedRows: Array<{
    wallet_type: string;
    balance: number;
    frozen_balance: number;
    version: number;
  }> = [];
  for (const row of sourceRows) {
    const walletType = normalizeRequiredString(row?.walletType);
    if (!walletType) {
      throw new Error(
        `replacePlayerWalletRows: 非法 wallet entry 拒绝写入 playerId=${playerId} entry=${safeStringifyInventoryEntry(row)}`,
      );
    }
    const balance = normalizeMinimumInteger(row?.balance, 0, 0);
    const frozenBalance = normalizeMinimumInteger(row?.frozenBalance, 0, 0);
    const version = normalizeMinimumInteger(row?.version, versionSeed, 1);
    normalizedRows.push({
      wallet_type: walletType,
      balance,
      frozen_balance: frozenBalance,
      version,
    });
  }

  if (normalizedRows.length === 0) {
    await refuseEmptyOverwriteIfRowsExist(client, PLAYER_WALLET_TABLE, playerId, 0, 'wallet');
    return;
  }
  const normalizedRowsJson = JSON.stringify(normalizedRows);
  await client.query(
    `
      WITH incoming AS (
        SELECT *
        FROM jsonb_to_recordset($2::jsonb) AS entry(
          wallet_type varchar(64),
          balance bigint,
          frozen_balance bigint,
          version bigint
        )
      )
      INSERT INTO ${PLAYER_WALLET_TABLE}(
        player_id,
        wallet_type,
        balance,
        frozen_balance,
        version,
        updated_at
      )
      SELECT $1, wallet_type, balance, frozen_balance, version, now()
      FROM incoming
      ON CONFLICT (player_id, wallet_type)
      DO UPDATE SET
        balance = EXCLUDED.balance,
        frozen_balance = EXCLUDED.frozen_balance,
        version = EXCLUDED.version,
        updated_at = now()
    `,
    [playerId, normalizedRowsJson],
  );
  await refuseEmptyOverwriteIfRowsExist(client, PLAYER_WALLET_TABLE, playerId, normalizedRows.length, 'wallet');
  await client.query(
    `
      WITH incoming AS (
        SELECT wallet_type
        FROM jsonb_to_recordset($2::jsonb) AS entry(wallet_type varchar(64))
      )
      DELETE FROM ${PLAYER_WALLET_TABLE} target
      WHERE target.player_id = $1
        AND NOT EXISTS (
          SELECT 1
          FROM incoming
          WHERE incoming.wallet_type = target.wallet_type
        )
    `,
    [playerId, normalizedRowsJson],
  );
}

async function replacePlayerMapUnlockRows(
  client: PoolClient,
  playerId: string,
  mapUnlocks: readonly unknown[],
  unlockedAtSeed: number,
): Promise<void> {
  const normalizedMapUnlocks = new Map<string, number>();
  for (const entry of Array.isArray(mapUnlocks) ? mapUnlocks : []) {
    const record = asRecord(entry);
    const mapId = normalizeRequiredString(record?.mapId ?? entry);
    if (!mapId) {
      continue;
    }
    const unlockedAt = normalizeOptionalInteger(record?.unlockedAt) ?? unlockedAtSeed;
    if (!normalizedMapUnlocks.has(mapId) || unlockedAt < (normalizedMapUnlocks.get(mapId) ?? unlockedAt)) {
      normalizedMapUnlocks.set(mapId, unlockedAt);
    }
  }
  const rows = Array.from(normalizedMapUnlocks.entries()).map(([mapId, unlockedAt]) => ({
    map_id: mapId,
    unlocked_at: unlockedAt,
  }));
  const normalizedRowsJson = JSON.stringify(rows);

  if (rows.length > 0) {
    await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(map_id varchar(120), unlocked_at bigint)
        )
        INSERT INTO ${PLAYER_MAP_UNLOCK_TABLE}(
          player_id,
          map_id,
          unlocked_at,
          updated_at
        )
        SELECT $1, map_id, unlocked_at, now()
        FROM incoming
        ON CONFLICT (player_id, map_id)
        DO UPDATE SET
          unlocked_at = EXCLUDED.unlocked_at,
          updated_at = now()
      `,
      [playerId, normalizedRowsJson],
    );
  }
  await prunePlayerRowsBySnapshotKeys(
    client,
    PLAYER_MAP_UNLOCK_TABLE,
    playerId,
    rows.map(({ map_id }) => ({ map_id })),
    'map_id varchar(120)',
    'incoming.map_id = target.map_id',
  );
}

async function replacePlayerMarketStorageItems(
  client: PoolClient,
  playerId: string,
  items: readonly PlayerMarketStorageItemUpsertInput[],
): Promise<void> {
  if (!Array.isArray(items) || items.length === 0) {
    await refuseEmptyOverwriteIfRowsExist(client, PLAYER_MARKET_STORAGE_ITEM_TABLE, playerId, 0, 'market_storage');
    return;
  }

  type MarketStoragePersistenceRow = {
    storage_item_id: string;
    slot_index: number;
    item_id: string;
    count: number;
    enhance_level: number | null;
    raw_payload: Record<string, unknown>;
  };
  const rowsByStorageItemId = new Map<string, MarketStoragePersistenceRow>();
  const rowsBySlotIndex = new Map<number, MarketStoragePersistenceRow>();
  for (let index = 0; index < items.length; index += 1) {
    const entry = items[index];
    const itemId = normalizeRequiredString(entry?.itemId);
    if (!itemId) {
      throw new Error(
        `replacePlayerMarketStorageItems: 非法 market_storage entry 拒绝写入 playerId=${playerId} index=${index} entry=${safeStringifyInventoryEntry(entry)}`,
      );
    }
    const slotIndex = normalizeOptionalInteger(entry?.slotIndex) ?? index;
    const storageItemId =
      normalizeOptionalString(entry?.storageItemId)
      ?? `market_storage:${playerId}:${slotIndex}`;
    const rawPayload = asRecord(entry?.rawPayload);
    const count = normalizeMinimumInteger(entry?.count, rawPayload?.count, 1);
    const enhanceLevel = normalizeOptionalInteger(entry?.enhanceLevel ?? rawPayload?.enhanceLevel ?? rawPayload?.enhancementLevel ?? rawPayload?.level);
    const persistedPayload = buildPersistedInventoryItemRawPayload({
      itemId,
      count,
      enhanceLevel,
      rawPayload,
    });
    const row = {
      storage_item_id: storageItemId,
      slot_index: slotIndex,
      item_id: itemId,
      count,
      enhance_level: enhanceLevel,
      raw_payload: persistedPayload,
    };
    const existingSlotRow = rowsBySlotIndex.get(slotIndex);
    if (existingSlotRow) {
      if (
        existingSlotRow.storage_item_id !== storageItemId
        || existingSlotRow.item_id !== itemId
        || existingSlotRow.count !== count
        || existingSlotRow.enhance_level !== enhanceLevel
        || !isSamePersistedPayload(existingSlotRow.raw_payload, persistedPayload)
      ) {
        throw new Error(
          `replacePlayerMarketStorageItems: duplicate slot_index with conflicting payload playerId=${playerId} slotIndex=${slotIndex}`,
        );
      }
      continue;
    }
    const existingStorageRow = rowsByStorageItemId.get(storageItemId);
    if (existingStorageRow) {
      throw new Error(
        `replacePlayerMarketStorageItems: duplicate storage_item_id with conflicting slot playerId=${playerId} storageItemId=${storageItemId} slots=${existingStorageRow.slot_index},${slotIndex}`,
      );
    }
    rowsBySlotIndex.set(slotIndex, row);
    rowsByStorageItemId.set(storageItemId, row);
  }
  const rows = Array.from(rowsBySlotIndex.values());

  if (rows.length === 0) {
    await prunePlayerMarketStorageStaleSlots(client, playerId, []);
    return;
  }

  await prunePlayerMarketStorageConflictingSlotRows(
    client,
    playerId,
    rows.map((row) => ({ storageItemId: row.storage_item_id, slotIndex: row.slot_index })),
  );

  const result = await client.query(
    `
      WITH incoming AS (
        SELECT *
        FROM jsonb_to_recordset($2::jsonb) AS entry(
          storage_item_id varchar(160),
          slot_index bigint,
          item_id varchar(160),
          count bigint,
          enhance_level bigint,
          raw_payload jsonb
        )
      )
      INSERT INTO ${PLAYER_MARKET_STORAGE_ITEM_TABLE}(
        storage_item_id,
        player_id,
        slot_index,
        item_id,
        count,
        enhance_level,
        raw_payload,
        updated_at
      )
      SELECT storage_item_id, $1, slot_index, item_id, count, enhance_level, COALESCE(raw_payload, '{}'::jsonb), now()
      FROM incoming
      ON CONFLICT (storage_item_id)
      DO UPDATE SET
        player_id = EXCLUDED.player_id,
        slot_index = EXCLUDED.slot_index,
        item_id = EXCLUDED.item_id,
        count = EXCLUDED.count,
        enhance_level = EXCLUDED.enhance_level,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = now()
      WHERE ${PLAYER_MARKET_STORAGE_ITEM_TABLE}.player_id = EXCLUDED.player_id
    `,
    [playerId, JSON.stringify(rows)],
  );
  if ((result.rowCount ?? 0) !== rows.length) {
    throw new Error(`replacePlayerMarketStorageItems: storage_item_id conflict outside player scope playerId=${playerId}`);
  }
  await prunePlayerMarketStorageStaleSlots(client, playerId, rows.map((entry) => entry.slot_index));
}

async function prunePlayerMarketStorageConflictingSlotRows(
  client: PoolClient,
  playerId: string,
  entries: ReadonlyArray<{ storageItemId: string; slotIndex: number }>,
): Promise<void> {
  await client.query(
    `
      WITH incoming AS (
        SELECT storage_item_id, slot_index
        FROM jsonb_to_recordset($2::jsonb) AS entry(storage_item_id varchar(160), slot_index bigint)
      )
      DELETE FROM ${PLAYER_MARKET_STORAGE_ITEM_TABLE} target
      USING incoming
      WHERE target.player_id = $1
        AND target.slot_index = incoming.slot_index
        AND target.storage_item_id <> incoming.storage_item_id
    `,
    [
      playerId,
      JSON.stringify(entries.map((entry) => ({
        storage_item_id: entry.storageItemId,
        slot_index: Math.max(0, Math.trunc(Number(entry.slotIndex))),
      }))),
    ],
  );
}

async function prunePlayerMarketStorageStaleSlots(
  client: PoolClient,
  playerId: string,
  slotIndices: readonly number[],
): Promise<void> {
  if (slotIndices.length === 0) {
    return;
  }
  await refuseEmptyOverwriteIfRowsExist(
    client,
    PLAYER_MARKET_STORAGE_ITEM_TABLE,
    playerId,
    slotIndices.length,
    'market_storage',
  );
  await client.query(
    `
      WITH incoming AS (
        SELECT slot_index
        FROM jsonb_to_recordset($2::jsonb) AS entry(slot_index bigint)
      )
      DELETE FROM ${PLAYER_MARKET_STORAGE_ITEM_TABLE} target
      WHERE target.player_id = $1
        AND NOT EXISTS (
          SELECT 1
          FROM incoming
          WHERE incoming.slot_index = target.slot_index
        )
    `,
    [
      playerId,
      JSON.stringify(slotIndices.map((slotIndex) => ({ slot_index: Math.max(0, Math.trunc(Number(slotIndex))) }))),
    ],
  );
}

async function prunePlayerRowsBySnapshotKeys(
  client: PoolClient,
  tableName: string,
  playerId: string,
  keys: readonly Record<string, unknown>[],
  recordsetColumns: string,
  matchPredicate: string,
  options: PlayerDomainPruneOptions = {},
): Promise<void> {
  // 把 PG 表名 (e.g. 'player_inventory_item') 转成 domain tag (e.g. 'inventory_item') 用于错误日志。
  // SQL 表名是稳定的常量，不会出现注入风险；这里只是给运维一个比 tableName 短的 tag。
  const domainTag = typeof tableName === 'string'
    ? tableName.replace(/^player_/u, '').replace(/_table$/u, '') || tableName
    : 'unknown';
  if (options.allowEmptyOverwrite !== true) {
    await refuseEmptyOverwriteIfRowsExist(client, tableName, playerId, keys.length, domainTag);
  }
  await client.query(
    `
      WITH incoming AS (
        SELECT *
        FROM jsonb_to_recordset($2::jsonb) AS entry(${recordsetColumns})
      )
      DELETE FROM ${tableName} target
      WHERE target.player_id = $1
        AND NOT EXISTS (
          SELECT 1
          FROM incoming
          WHERE ${matchPredicate}
        )
    `,
    [playerId, JSON.stringify(keys)],
  );
}

async function replacePlayerEquipmentSlots(
  client: PoolClient,
  playerId: string,
  slots: unknown[],
  options: PlayerDomainPruneOptions = {},
): Promise<void> {
  const rowsBySlotType = new Map<string, EquipmentSlotPersistenceRow>();
  const rowsByInstanceId = new Map<string, EquipmentSlotPersistenceRow>();
  const equipmentRowSources = new Map<EquipmentSlotPersistenceRow, ItemInstanceIdPersistenceRowSource>();
  for (const slotEntry of Array.isArray(slots) ? slots : []) {
    const entry = asRecord(slotEntry);
    const slotType = normalizeRequiredString(entry?.slot);
    if (!EQUIP_SLOTS.includes(slotType as (typeof EQUIP_SLOTS)[number])) {
      throw new Error(
        `replacePlayerEquipmentSlots: 非法 equipment slot 拒绝写入 playerId=${playerId} slot=${slotType || 'null'} entry=${safeStringifyInventoryEntry(slotEntry)}`,
      );
    }
    const item = asRecord(entry?.item);
    if (!item) {
      continue;
    }
    const itemId = normalizeRequiredString(item?.itemId);
    if (!itemId) {
      throw new Error(
        `replacePlayerEquipmentSlots: 非法 equipment item 拒绝写入 playerId=${playerId} slot=${slotType} entry=${safeStringifyInventoryEntry(slotEntry)}`,
      );
    }
    const itemInstanceId = assignStableItemInstanceId(
      normalizeOptionalString(entry?.itemInstanceId) || normalizeOptionalString(item?.itemInstanceId),
      { entry, item },
    );
    const persistedPayload = buildPersistedEquipmentItemRawPayload({
      itemId,
      slot: slotType,
      enhanceLevel: item?.enhanceLevel,
      rawPayload: item,
    });
    const row = {
      slot_type: slotType,
      item_instance_id: itemInstanceId,
      item_id: itemId,
      raw_payload: persistedPayload,
    };
    const existingSlotRow = rowsBySlotType.get(slotType);
    if (existingSlotRow) {
      if (
        existingSlotRow.item_instance_id !== itemInstanceId
        || existingSlotRow.item_id !== itemId
        || !isSamePersistedPayload(existingSlotRow.raw_payload, persistedPayload)
      ) {
        throw new Error(
          `replacePlayerEquipmentSlots: duplicate slot with conflicting payload playerId=${playerId} slot=${slotType}`,
        );
      }
      continue;
    }
    const existingInstanceRow = rowsByInstanceId.get(itemInstanceId);
    if (existingInstanceRow) {
      throw new Error(
        `replacePlayerEquipmentSlots: duplicate item_instance_id with conflicting slot playerId=${playerId} itemInstanceId=${itemInstanceId} slots=${existingInstanceRow.slot_type},${slotType}`,
      );
    }
    rowsBySlotType.set(slotType, row);
    rowsByInstanceId.set(itemInstanceId, row);
    equipmentRowSources.set(row, { entry, item });
  }
  const rows = Array.from(rowsBySlotType.values());
  const rowsJson = JSON.stringify(rows);

  if (rows.length === 0) {
    if (options.allowEmptyOverwrite === true) {
      await client.query(
        `
          WITH incoming AS (
            SELECT slot_type
            FROM jsonb_to_recordset($2::jsonb) AS entry(slot_type varchar(40))
          )
          DELETE FROM ${PLAYER_EQUIPMENT_SLOT_TABLE} target
          WHERE target.player_id = $1
            AND NOT EXISTS (
              SELECT 1
              FROM incoming
              WHERE incoming.slot_type = target.slot_type
            )
        `,
        [playerId, rowsJson],
      );
    } else {
      await refuseEmptyOverwriteIfRowsExist(client, PLAYER_EQUIPMENT_SLOT_TABLE, playerId, 0, 'equipment');
    }
    return;
  }

  await upsertEquipmentSlotRowsWithItemInstanceIdRepair(client, playerId, rows, equipmentRowSources);
  if (options.allowEmptyOverwrite !== true) {
    await refuseEmptyOverwriteIfRowsExist(client, PLAYER_EQUIPMENT_SLOT_TABLE, playerId, rows.length, 'equipment');
  }
  await client.query(
    `
      WITH incoming AS (
        SELECT slot_type
        FROM jsonb_to_recordset($2::jsonb) AS entry(slot_type varchar(40))
      )
      DELETE FROM ${PLAYER_EQUIPMENT_SLOT_TABLE} target
      WHERE target.player_id = $1
        AND NOT EXISTS (
          SELECT 1
          FROM incoming
          WHERE incoming.slot_type = target.slot_type
        )
    `,
    [playerId, rowsJson],
  );
}

async function replacePlayerTechniqueStates(
  client: PoolClient,
  playerId: string,
  rows: TechniqueStateRow[],
): Promise<void> {
  const normalizedRows = rows.map((row) => ({
    tech_id: row.techId,
    level: row.level,
    exp: row.exp,
    exp_to_next: row.expToNext,
    realm_lv: row.realmLv,
    skills_enabled: row.skillsEnabled,
    raw_payload: row.rawPayload,
  }));
  const normalizedRowsJson = JSON.stringify(normalizedRows);
  if (normalizedRows.length > 0) {
    await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            tech_id varchar(120),
            level bigint,
            exp double precision,
            exp_to_next double precision,
            realm_lv bigint,
            skills_enabled boolean,
            raw_payload jsonb
          )
        )
        INSERT INTO ${PLAYER_TECHNIQUE_STATE_TABLE}(
          player_id,
          tech_id,
          level,
          exp,
          exp_to_next,
          realm_lv,
          skills_enabled,
          raw_payload,
          updated_at
        )
        SELECT $1, tech_id, level, exp, exp_to_next, realm_lv, skills_enabled, COALESCE(raw_payload, '{}'::jsonb), now()
        FROM incoming
        ON CONFLICT (player_id, tech_id)
        DO UPDATE SET
          level = EXCLUDED.level,
          exp = EXCLUDED.exp,
          exp_to_next = EXCLUDED.exp_to_next,
          realm_lv = EXCLUDED.realm_lv,
          skills_enabled = EXCLUDED.skills_enabled,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = now()
      `,
      [playerId, normalizedRowsJson],
    );
  }
  await prunePlayerRowsBySnapshotKeys(
    client,
    PLAYER_TECHNIQUE_STATE_TABLE,
    playerId,
    normalizedRows.map(({ tech_id }) => ({ tech_id })),
    'tech_id varchar(120)',
    'incoming.tech_id = target.tech_id',
  );
}

async function replacePlayerPersistentBuffStates(
  client: PoolClient,
  playerId: string,
  rows: PersistentBuffStateRow[],
  options: PlayerDomainWriteOptions = {},
): Promise<void> {
  const normalizedRows = rows.map((row) => ({
    buff_id: row.buffId,
    source_skill_id: row.sourceSkillId,
    source_caster_id: row.sourceCasterId,
    realm_lv: row.realmLv,
    remaining_ticks: row.remainingTicks,
    duration: row.duration,
    stacks: row.stacks,
    max_stacks: row.maxStacks,
    sustain_ticks_elapsed: row.sustainTicksElapsed,
    raw_payload: row.rawPayload,
  }));
  const normalizedRowsJson = JSON.stringify(normalizedRows);
  if (normalizedRows.length > 0) {
    await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            buff_id varchar(160),
            source_skill_id varchar(160),
            source_caster_id varchar(120),
            realm_lv bigint,
            remaining_ticks bigint,
            duration bigint,
            stacks bigint,
            max_stacks bigint,
            sustain_ticks_elapsed bigint,
            raw_payload jsonb
          )
        )
        INSERT INTO ${PLAYER_PERSISTENT_BUFF_STATE_TABLE}(
          player_id,
          buff_id,
          source_skill_id,
          source_caster_id,
          realm_lv,
          remaining_ticks,
          duration,
          stacks,
          max_stacks,
          sustain_ticks_elapsed,
          raw_payload,
          updated_at
        )
        SELECT $1, buff_id, source_skill_id, source_caster_id, realm_lv, remaining_ticks, duration, stacks, max_stacks, sustain_ticks_elapsed, COALESCE(raw_payload, '{}'::jsonb), now()
        FROM incoming
        ON CONFLICT (player_id, buff_id, source_skill_id)
        DO UPDATE SET
          source_caster_id = EXCLUDED.source_caster_id,
          realm_lv = EXCLUDED.realm_lv,
          remaining_ticks = EXCLUDED.remaining_ticks,
          duration = EXCLUDED.duration,
          stacks = EXCLUDED.stacks,
          max_stacks = EXCLUDED.max_stacks,
          sustain_ticks_elapsed = EXCLUDED.sustain_ticks_elapsed,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = now()
      `,
      [playerId, normalizedRowsJson],
    );
  }
  await prunePlayerRowsBySnapshotKeys(
    client,
    PLAYER_PERSISTENT_BUFF_STATE_TABLE,
    playerId,
    normalizedRows.map(({ buff_id, source_skill_id }) => ({ buff_id, source_skill_id })),
    'buff_id varchar(160), source_skill_id varchar(160)',
    'incoming.buff_id = target.buff_id AND incoming.source_skill_id = target.source_skill_id',
    { allowEmptyOverwrite: options.allowBuffEmptyOverwrite === true },
  );
}

async function replacePlayerQuestProgressRows(
  client: PoolClient,
  playerId: string,
  rows: QuestProgressRow[],
): Promise<void> {
  const normalizedRows = rows.map((row) => ({
    quest_id: row.questId,
    status: row.status,
    progress_payload: row.progressPayload,
    raw_payload: row.rawPayload,
  }));
  if (normalizedRows.length > 0) {
    await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            quest_id varchar(120),
            status varchar(40),
            progress_payload jsonb,
            raw_payload jsonb
          )
        )
        INSERT INTO ${PLAYER_QUEST_PROGRESS_TABLE}(
          player_id,
          quest_id,
          status,
          progress_payload,
          raw_payload,
          updated_at
        )
        SELECT $1, quest_id, status, COALESCE(progress_payload, '{}'::jsonb), COALESCE(raw_payload, '{}'::jsonb), now()
        FROM incoming
        ON CONFLICT (player_id, quest_id)
        DO UPDATE SET
          status = EXCLUDED.status,
          progress_payload = EXCLUDED.progress_payload,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = now()
      `,
      [playerId, JSON.stringify(normalizedRows)],
    );
  }
  await prunePlayerRowsBySnapshotKeys(
    client,
    PLAYER_QUEST_PROGRESS_TABLE,
    playerId,
    normalizedRows.map(({ quest_id }) => ({ quest_id })),
    'quest_id varchar(120)',
    'incoming.quest_id = target.quest_id',
  );
}

async function replacePlayerCombatPreferences(
  client: PoolClient,
  playerId: string,
  row: CombatPreferencesRow | null,
): Promise<void> {
  if (!row) {
    await client.query(`DELETE FROM ${PLAYER_COMBAT_PREFERENCES_TABLE} WHERE player_id = $1`, [playerId]);
    return;
  }

  await client.query(
    `
      INSERT INTO ${PLAYER_COMBAT_PREFERENCES_TABLE}(
        player_id,
        auto_battle,
        auto_retaliate,
        auto_battle_stationary,
        auto_battle_targeting_mode,
        retaliate_player_target_id,
        retaliate_player_target_last_attack_tick,
        combat_target_id,
        combat_target_locked,
        allow_aoe_player_hit,
        auto_idle_cultivation,
        auto_switch_cultivation,
        auto_root_foundation,
        sense_qi_active,
        cultivating_tech_id,
        targeting_rules_payload,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        auto_battle = EXCLUDED.auto_battle,
        auto_retaliate = EXCLUDED.auto_retaliate,
        auto_battle_stationary = EXCLUDED.auto_battle_stationary,
        auto_battle_targeting_mode = EXCLUDED.auto_battle_targeting_mode,
        retaliate_player_target_id = EXCLUDED.retaliate_player_target_id,
        retaliate_player_target_last_attack_tick = EXCLUDED.retaliate_player_target_last_attack_tick,
        combat_target_id = EXCLUDED.combat_target_id,
        combat_target_locked = EXCLUDED.combat_target_locked,
        allow_aoe_player_hit = EXCLUDED.allow_aoe_player_hit,
        auto_idle_cultivation = EXCLUDED.auto_idle_cultivation,
        auto_switch_cultivation = EXCLUDED.auto_switch_cultivation,
        auto_root_foundation = EXCLUDED.auto_root_foundation,
        sense_qi_active = EXCLUDED.sense_qi_active,
        cultivating_tech_id = EXCLUDED.cultivating_tech_id,
        targeting_rules_payload = EXCLUDED.targeting_rules_payload,
        updated_at = now()
    `,
    [
      playerId,
      row.autoBattle,
      row.autoRetaliate,
      row.autoBattleStationary,
      row.autoBattleTargetingMode,
      row.retaliatePlayerTargetId,
      row.retaliatePlayerTargetLastAttackTick,
      row.combatTargetId,
      row.combatTargetLocked,
      row.allowAoePlayerHit,
      row.autoIdleCultivation,
      row.autoSwitchCultivation,
      row.autoRootFoundation,
      row.senseQiActive,
      row.cultivatingTechId,
      JSON.stringify(row.targetingRulesPayload),
    ],
  );
}

async function replacePlayerAutoBattleSkills(
  client: PoolClient,
  playerId: string,
  rows: AutoBattleSkillRow[],
): Promise<void> {
  const normalizedRows = rows.map((row) => ({
    skill_id: row.skillId,
    enabled: row.enabled,
    skill_enabled: row.skillEnabled,
    auto_battle_order: row.autoBattleOrder,
  }));
  if (normalizedRows.length > 0) {
    await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            skill_id varchar(120),
            enabled boolean,
            skill_enabled boolean,
            auto_battle_order bigint
          )
        )
        INSERT INTO ${PLAYER_AUTO_BATTLE_SKILL_TABLE}(
          player_id,
          skill_id,
          enabled,
          skill_enabled,
          auto_battle_order,
          updated_at
        )
        SELECT $1, skill_id, enabled, skill_enabled, auto_battle_order, now()
        FROM incoming
        ON CONFLICT (player_id, skill_id)
        DO UPDATE SET
          enabled = EXCLUDED.enabled,
          skill_enabled = EXCLUDED.skill_enabled,
          auto_battle_order = EXCLUDED.auto_battle_order,
          updated_at = now()
      `,
      [playerId, JSON.stringify(normalizedRows)],
    );
  }
  await prunePlayerRowsBySnapshotKeys(
    client,
    PLAYER_AUTO_BATTLE_SKILL_TABLE,
    playerId,
    normalizedRows.map(({ skill_id }) => ({ skill_id })),
    'skill_id varchar(120)',
    'incoming.skill_id = target.skill_id',
  );
}

async function replacePlayerAutoUseItemRules(
  client: PoolClient,
  playerId: string,
  rows: AutoUseItemRuleRow[],
): Promise<void> {
  const normalizedRows = rows.map((row) => ({
    item_id: row.itemId,
    condition_payload: row.conditionPayload,
  }));
  if (normalizedRows.length > 0) {
    await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(item_id varchar(120), condition_payload jsonb)
        )
        INSERT INTO ${PLAYER_AUTO_USE_ITEM_RULE_TABLE}(
          player_id,
          item_id,
          condition_payload,
          updated_at
        )
        SELECT $1, item_id, COALESCE(condition_payload, '{}'::jsonb), now()
        FROM incoming
        ON CONFLICT (player_id, item_id)
        DO UPDATE SET
          condition_payload = EXCLUDED.condition_payload,
          updated_at = now()
      `,
      [playerId, JSON.stringify(normalizedRows)],
    );
  }
  await prunePlayerRowsBySnapshotKeys(
    client,
    PLAYER_AUTO_USE_ITEM_RULE_TABLE,
    playerId,
    normalizedRows.map(({ item_id }) => ({ item_id })),
    'item_id varchar(120)',
    'incoming.item_id = target.item_id',
  );
}

async function replacePlayerBodyTrainingState(
  client: PoolClient,
  playerId: string,
  row:
    | {
        level?: unknown;
        exp?: unknown;
        expToNext?: unknown;
      }
    | null,
): Promise<void> {
  await client.query(`DELETE FROM ${PLAYER_BODY_TRAINING_STATE_TABLE} WHERE player_id = $1`, [playerId]);
  if (!row) {
    return;
  }

  await client.query(
    `
      INSERT INTO ${PLAYER_BODY_TRAINING_STATE_TABLE}(
        player_id,
        level,
        exp,
        exp_to_next,
        updated_at
      )
      VALUES ($1, $2, $3, $4, now())
    `,
    [
      playerId,
      normalizeMinimumInteger(row.level, 0, 0),
      normalizeMinimumNumber(row.exp, 0, 0),
      normalizeMinimumNumber(row.expToNext, 1, 1),
    ],
  );
}

async function replacePlayerAttrState(
  client: PoolClient,
  playerId: string,
  row: AttrStateRow | null,
): Promise<void> {
  if (!row) {
    await client.query(`DELETE FROM ${PLAYER_ATTR_STATE_TABLE} WHERE player_id = $1`, [playerId]);
    return;
  }

  await client.query(
    `
      INSERT INTO ${PLAYER_ATTR_STATE_TABLE}(
        player_id,
        base_attrs_payload,
        bonus_entries_payload,
        revealed_breakthrough_requirement_ids,
        realm_payload,
        heaven_gate_payload,
        spiritual_roots_payload,
        updated_at
      )
      VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        base_attrs_payload = EXCLUDED.base_attrs_payload,
        bonus_entries_payload = EXCLUDED.bonus_entries_payload,
        revealed_breakthrough_requirement_ids = EXCLUDED.revealed_breakthrough_requirement_ids,
        realm_payload = EXCLUDED.realm_payload,
        heaven_gate_payload = EXCLUDED.heaven_gate_payload,
        spiritual_roots_payload = EXCLUDED.spiritual_roots_payload,
        updated_at = now()
    `,
    [
      playerId,
      JSON.stringify(row.baseAttrsPayload),
      JSON.stringify(row.bonusEntriesPayload),
      JSON.stringify(row.revealedBreakthroughRequirementIds),
      JSON.stringify(row.realmPayload),
      JSON.stringify(row.heavenGatePayload),
      JSON.stringify(row.spiritualRootsPayload),
    ],
  );
}

async function replacePlayerProfessionStates(
  client: PoolClient,
  playerId: string,
  rows: ProfessionStateRow[],
): Promise<void> {
  const normalizedRows = rows.map((row) => ({
    profession_type: row.professionType,
    level: row.level,
    exp: row.exp,
    exp_to_next: row.expToNext,
  }));
  if (normalizedRows.length > 0) {
    await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            profession_type varchar(80),
            level bigint,
            exp double precision,
            exp_to_next double precision
          )
        )
        INSERT INTO ${PLAYER_PROFESSION_STATE_TABLE}(
          player_id,
          profession_type,
          level,
          exp,
          exp_to_next,
          updated_at
        )
        SELECT $1, profession_type, level, exp, exp_to_next, now()
        FROM incoming
        ON CONFLICT (player_id, profession_type)
        DO UPDATE SET
          level = EXCLUDED.level,
          exp = EXCLUDED.exp,
          exp_to_next = EXCLUDED.exp_to_next,
          updated_at = now()
      `,
      [playerId, JSON.stringify(normalizedRows)],
    );
  }
  await prunePlayerRowsBySnapshotKeys(
    client,
    PLAYER_PROFESSION_STATE_TABLE,
    playerId,
    normalizedRows.map(({ profession_type }) => ({ profession_type })),
    'profession_type varchar(80)',
    'incoming.profession_type = target.profession_type',
  );
}

async function replacePlayerAlchemyPresets(
  client: PoolClient,
  playerId: string,
  rows: AlchemyPresetRow[],
): Promise<void> {
  const normalizedRows = rows.map((row) => ({
    preset_id: row.presetId,
    recipe_id: row.recipeId,
    name: row.name,
    ingredients_payload: row.ingredients,
  }));
  if (normalizedRows.length > 0) {
    await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            preset_id varchar(120),
            recipe_id varchar(120),
            name varchar(120),
            ingredients_payload jsonb
          )
        )
        INSERT INTO ${PLAYER_ALCHEMY_PRESET_TABLE}(
          preset_id,
          player_id,
          recipe_id,
          name,
          ingredients_payload,
          updated_at
        )
        SELECT preset_id, $1, recipe_id, name, COALESCE(ingredients_payload, '[]'::jsonb), now()
        FROM incoming
        ON CONFLICT (player_id, preset_id)
        DO UPDATE SET
          recipe_id = EXCLUDED.recipe_id,
          name = EXCLUDED.name,
          ingredients_payload = EXCLUDED.ingredients_payload,
          updated_at = now()
      `,
      [playerId, JSON.stringify(normalizedRows)],
    );
  }
  await prunePlayerRowsBySnapshotKeys(
    client,
    PLAYER_ALCHEMY_PRESET_TABLE,
    playerId,
    normalizedRows.map(({ preset_id }) => ({ preset_id })),
    'preset_id varchar(120)',
    'incoming.preset_id = target.preset_id',
  );
}

async function replacePlayerActiveJob(
  client: PoolClient,
  playerId: string,
  row: ActiveJobRow | null,
): Promise<void> {
  if (!row) {
    await client.query(`DELETE FROM ${PLAYER_ACTIVE_JOB_TABLE} WHERE player_id = $1`, [playerId]);
    return;
  }

  await client.query(
    `
      INSERT INTO ${PLAYER_ACTIVE_JOB_TABLE}(
        player_id,
        job_run_id,
        job_type,
        status,
        phase,
        started_at,
        finished_at,
        paused_ticks,
        total_ticks,
        remaining_ticks,
        success_rate,
        speed_rate,
        job_version,
        detail_jsonb,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        job_run_id = EXCLUDED.job_run_id,
        job_type = EXCLUDED.job_type,
        status = EXCLUDED.status,
        phase = EXCLUDED.phase,
        started_at = EXCLUDED.started_at,
        finished_at = EXCLUDED.finished_at,
        paused_ticks = EXCLUDED.paused_ticks,
        total_ticks = EXCLUDED.total_ticks,
        remaining_ticks = EXCLUDED.remaining_ticks,
        success_rate = EXCLUDED.success_rate,
        speed_rate = EXCLUDED.speed_rate,
        job_version = EXCLUDED.job_version,
        detail_jsonb = EXCLUDED.detail_jsonb,
        updated_at = now()
    `,
    [
      playerId,
      row.jobRunId,
      row.jobType,
      row.status,
      row.phase,
      row.startedAt,
      row.finishedAt,
      row.pausedTicks,
      row.totalTicks,
      row.remainingTicks,
      row.successRate,
      row.speedRate,
      row.jobVersion,
      JSON.stringify(row.detailJson),
    ],
  );
}

async function replacePlayerEnhancementRecords(
  client: PoolClient,
  playerId: string,
  rows: EnhancementRecordRow[],
): Promise<void> {
  const normalizedRows = rows.map((row) => ({
    record_id: row.recordId,
    item_id: row.itemId,
    highest_level: row.highestLevel,
    levels_payload: row.levelsPayload,
    action_started_at: row.actionStartedAt,
    action_ended_at: row.actionEndedAt,
    start_level: row.startLevel,
    initial_target_level: row.initialTargetLevel,
    desired_target_level: row.desiredTargetLevel,
    protection_start_level: row.protectionStartLevel,
    status: row.status,
  }));
  if (normalizedRows.length > 0) {
    const result = await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            record_id varchar(180),
            item_id varchar(160),
            highest_level bigint,
            levels_payload jsonb,
            action_started_at bigint,
            action_ended_at bigint,
            start_level bigint,
            initial_target_level bigint,
            desired_target_level bigint,
            protection_start_level bigint,
            status varchar(40)
          )
        )
        INSERT INTO ${PLAYER_ENHANCEMENT_RECORD_TABLE}(
          record_id,
          player_id,
          item_id,
          highest_level,
          levels_payload,
          action_started_at,
          action_ended_at,
          start_level,
          initial_target_level,
          desired_target_level,
          protection_start_level,
          status,
          updated_at
        )
        SELECT record_id, $1, item_id, highest_level, COALESCE(levels_payload, '[]'::jsonb),
          action_started_at, action_ended_at, start_level, initial_target_level,
          desired_target_level, protection_start_level, status, now()
        FROM incoming
        ON CONFLICT (record_id)
        DO UPDATE SET
          player_id = EXCLUDED.player_id,
          item_id = EXCLUDED.item_id,
          highest_level = EXCLUDED.highest_level,
          levels_payload = EXCLUDED.levels_payload,
          action_started_at = EXCLUDED.action_started_at,
          action_ended_at = EXCLUDED.action_ended_at,
          start_level = EXCLUDED.start_level,
          initial_target_level = EXCLUDED.initial_target_level,
          desired_target_level = EXCLUDED.desired_target_level,
          protection_start_level = EXCLUDED.protection_start_level,
          status = EXCLUDED.status,
          updated_at = now()
        WHERE ${PLAYER_ENHANCEMENT_RECORD_TABLE}.player_id = EXCLUDED.player_id
      `,
      [playerId, JSON.stringify(normalizedRows)],
    );
    if ((result.rowCount ?? 0) !== normalizedRows.length) {
      throw new Error(`replacePlayerEnhancementRecords: record_id conflict outside player scope playerId=${playerId}`);
    }
  }
  await prunePlayerRowsBySnapshotKeys(
    client,
    PLAYER_ENHANCEMENT_RECORD_TABLE,
    playerId,
    normalizedRows.map(({ record_id }) => ({ record_id })),
    'record_id varchar(180)',
    'incoming.record_id = target.record_id',
  );
}

async function replacePlayerLogbookMessages(
  client: PoolClient,
  playerId: string,
  rows: unknown[],
): Promise<void> {
  const normalizedRows: Array<{
    message_id: string;
    kind: string;
    text: string;
    from_name: string | null;
    occurred_at: number;
    acked_at: number | null;
  }> = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const entry = asRecord(row);
    const messageId = normalizeRequiredString(entry?.id ?? entry?.messageId);
    const kind = normalizeRequiredString(entry?.kind);
    const text = typeof entry?.text === 'string' ? entry.text : '';
    if (!messageId || !kind || !text) {
      continue;
    }
    normalizedRows.push({
      message_id: messageId,
      kind,
      text,
      from_name: normalizeOptionalString(entry?.from ?? entry?.fromName),
      occurred_at: normalizeOptionalInteger(entry?.at ?? entry?.occurredAt) ?? Date.now(),
      acked_at: normalizeOptionalInteger(entry?.ackedAt),
    });
  }

  if (normalizedRows.length > 0) {
    const result = await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            message_id varchar(180),
            kind varchar(40),
            text text,
            from_name varchar(120),
            occurred_at bigint,
            acked_at bigint
          )
        )
        INSERT INTO ${PLAYER_LOGBOOK_MESSAGE_TABLE}(
          message_id,
          player_id,
          kind,
          text,
          from_name,
          occurred_at,
          acked_at,
          updated_at
        )
        SELECT message_id, $1, kind, text, from_name, occurred_at, acked_at, now()
        FROM incoming
        ON CONFLICT (player_id, message_id)
        DO UPDATE SET
          kind = EXCLUDED.kind,
          text = EXCLUDED.text,
          from_name = EXCLUDED.from_name,
          occurred_at = EXCLUDED.occurred_at,
          acked_at = EXCLUDED.acked_at,
          updated_at = now()
      `,
      [playerId, JSON.stringify(normalizedRows)],
    );
    if ((result.rowCount ?? 0) !== normalizedRows.length) {
      throw new Error(`replacePlayerLogbookMessages: message conflict outside player scope playerId=${playerId}`);
    }
  }
  await prunePlayerRowsBySnapshotKeys(
    client,
    PLAYER_LOGBOOK_MESSAGE_TABLE,
    playerId,
    normalizedRows.map(({ message_id }) => ({ message_id })),
    'message_id varchar(180)',
    'incoming.message_id = target.message_id',
  );
}

async function upsertRecoveryWatermark(
  client: PoolClient,
  playerId: string,
  patch: RecoveryWatermarkPatch,
): Promise<void> {
  const entries = Object.entries(patch).filter((entry): entry is [RecoveryWatermarkColumn, number] => {
    return WATERMARK_COLUMNS.includes(entry[0] as RecoveryWatermarkColumn) && Number.isFinite(entry[1]);
  });
  if (entries.length === 0) {
    return;
  }

  const insertColumns = ['player_id', ...entries.map(([column]) => column), 'updated_at'];
  const watermarkVersionSeed = Math.max(...entries.map(([, value]) => Math.max(0, Math.trunc(value))));
  const insertValues: unknown[] = [playerId, ...entries.map(([, value]) => Math.max(0, Math.trunc(value))),];
  const updatedAtPlaceholder = `$${insertValues.length + 1}`;
  insertValues.push(new Date(Math.max(1, watermarkVersionSeed)).toISOString());

  const valuePlaceholders = insertColumns.map((_, index) => `$${index + 1}`);
  valuePlaceholders[valuePlaceholders.length - 1] = updatedAtPlaceholder;

  const updateClauses = entries.map(([column]) => {
    return `${column} = GREATEST(COALESCE(${PLAYER_RECOVERY_WATERMARK_TABLE}.${column}, 0), EXCLUDED.${column})`;
  });
  updateClauses.push('updated_at = now()');

  await client.query(
    `
      INSERT INTO ${PLAYER_RECOVERY_WATERMARK_TABLE}(${insertColumns.join(', ')})
      VALUES (${valuePlaceholders.join(', ')})
      ON CONFLICT (player_id)
      DO UPDATE SET ${updateClauses.join(', ')}
    `,
    insertValues,
  );
}

function buildTechniqueStateRows(snapshot: PersistedPlayerSnapshot): TechniqueStateRow[] {
  const techniqueEntries = Array.isArray(snapshot.techniques?.techniques) ? snapshot.techniques.techniques : [];
  const rows: TechniqueStateRow[] = [];
  for (const entry of techniqueEntries) {
    const normalized = asRecord(entry);
    const techId = normalizeRequiredString(normalized?.techId);
    if (!techId) {
      continue;
    }
    rows.push({
      techId,
      level: normalizeMinimumInteger(normalized?.level, 1, 1),
      exp: normalizeOptionalNumber(normalized?.exp),
      expToNext: normalizeOptionalNumber(normalized?.expToNext),
      realmLv: normalizeOptionalInteger(normalized?.realmLv),
      skillsEnabled: normalized?.skillsEnabled !== false,
      rawPayload: buildTechniqueStateRawPayload(normalized, techId),
    });
  }
  return rows;
}

function buildTechniqueStateRawPayload(entry: Record<string, unknown>, techId: string): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    techId,
    level: normalizeMinimumInteger(entry.level, 1, 1),
    exp: normalizeOptionalNumber(entry.exp) ?? 0,
    expToNext: normalizeOptionalNumber(entry.expToNext) ?? 0,
    skillsEnabled: entry.skillsEnabled !== false,
  };
  const realm = normalizeOptionalInteger(entry.realm);
  if (realm !== null) {
    payload.realm = realm;
  }
  const realmLv = normalizeOptionalInteger(entry.realmLv);
  if (realmLv !== null) {
    payload.realmLv = realmLv;
  }
  return payload;
}

function buildPersistentBuffStateRows(snapshot: PersistedPlayerSnapshot): PersistentBuffStateRow[] {
  const buffEntries = Array.isArray(snapshot.buffs?.buffs) ? snapshot.buffs.buffs : [];
  const rows: PersistentBuffStateRow[] = [];
  for (const entry of buffEntries) {
    const normalized = asRecord(entry);
    const buffId = normalizeRequiredString(normalized?.buffId);
    if (!buffId) {
      continue;
    }
    const sourceSkillId =
      normalizeOptionalString(normalized?.sourceSkillId)
      ?? `buff_source:${buffId}`;
    rows.push({
      buffId,
      sourceSkillId,
      sourceCasterId: normalizeOptionalString(normalized?.sourceCasterId),
      realmLv: normalizeOptionalInteger(normalized?.realmLv),
      remainingTicks: normalizeMinimumInteger(normalized?.remainingTicks, 0, 0),
      duration: normalizeMinimumInteger(normalized?.duration, 0, 0),
      stacks: normalizeMinimumInteger(normalized?.stacks, 1, 1),
      maxStacks: normalizeMinimumInteger(normalized?.maxStacks, 1, 1),
      sustainTicksElapsed: normalizeOptionalInteger(normalized?.sustainTicksElapsed),
      rawPayload: {
        ...normalized,
        buffId,
        sourceSkillId,
      },
    });
  }
  return rows;
}

function buildQuestProgressRows(snapshot: PersistedPlayerSnapshot): QuestProgressRow[] {
  const questEntries = Array.isArray(snapshot.quests?.entries) ? snapshot.quests.entries : [];
  const rows: QuestProgressRow[] = [];
  for (const entry of questEntries) {
    const normalized = asRecord(entry);
    const questId =
      normalizeRequiredString(normalized?.questId)
      || normalizeRequiredString(normalized?.id);
    if (!questId) {
      continue;
    }
    rows.push({
      questId,
      status: normalizeOptionalString(normalized?.status) ?? 'active',
      progressPayload: normalizeQuestProgressPayload(normalized?.progress),
      rawPayload: { ...normalized, id: questId },
    });
  }
  return rows;
}

function buildEnhancementRecordRows(playerId: string, snapshot: PersistedPlayerSnapshot): EnhancementRecordRow[] {
  const progression = asRecord(snapshot.progression);
  const entries = Array.isArray(progression?.enhancementRecords) ? progression.enhancementRecords : [];
  return buildEnhancementRecordRowsFromEntries(playerId, entries);
}

/**
 * 将运行时形态的强化记录条目归一为 DB 行形态。
 * 运行时记录字段为 `levels`，DB 列名为 `levels_payload`；这里统一负责字段映射、类型清洗和 recordId 兜底。
 * 直接调用 `savePlayerEnhancementRecords` 的链路（如 `CraftPanelRuntimeService.persistEnhancementRecords`）必须先经过此归一，
 * 否则 `levels_payload` 会因 undefined → null 触发 `player_enhancement_record.levels_payload` NOT NULL 约束违反。
 */
export function buildEnhancementRecordRowsFromEntries(
  playerId: string,
  entries: readonly unknown[],
): EnhancementRecordRow[] {
  const rows: EnhancementRecordRow[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const normalized = asRecord(entries[index]);
    const itemId = normalizeRequiredString(normalized?.itemId);
    if (!itemId) {
      continue;
    }
    const recordId =
      normalizeOptionalString(normalized?.recordId)
      ?? normalizeOptionalString(normalized?.id)
      ?? `enhancement_record:${playerId}:${itemId}:${index}`;
    rows.push({
      recordId,
      itemId,
      highestLevel: normalizeMinimumInteger(normalized?.highestLevel, 0, 0),
      levelsPayload: Array.isArray(normalized?.levels) ? normalized.levels.map((entry) => cloneJsonValue(entry)) : [],
      actionStartedAt: normalizeOptionalInteger(normalized?.actionStartedAt),
      actionEndedAt: normalizeOptionalInteger(normalized?.actionEndedAt),
      startLevel: normalizeOptionalInteger(normalized?.startLevel),
      initialTargetLevel: normalizeOptionalInteger(normalized?.initialTargetLevel),
      desiredTargetLevel: normalizeOptionalInteger(normalized?.desiredTargetLevel),
      protectionStartLevel: normalizeOptionalInteger(normalized?.protectionStartLevel),
      status: normalizeOptionalString(normalized?.status),
    });
  }
  return rows;
}

function buildCombatPreferencesRow(snapshot: PersistedPlayerSnapshot): CombatPreferencesRow | null {
  const combat = asRecord(snapshot.combat);
  if (!combat) {
    return null;
  }
  const targetingRulesPayload = asRecord(combat.combatTargetingRules);
  return {
    autoBattle: combat.autoBattle === true,
    autoRetaliate: combat.autoRetaliate === true,
    autoBattleStationary: combat.autoBattleStationary === true,
    autoBattleTargetingMode: normalizeOptionalString(combat.autoBattleTargetingMode) ?? 'auto',
    retaliatePlayerTargetId: normalizeOptionalString(combat.retaliatePlayerTargetId),
    retaliatePlayerTargetLastAttackTick: normalizeOptionalInteger(combat.retaliatePlayerTargetLastAttackTick),
    combatTargetId: normalizeOptionalString(combat.combatTargetId),
    combatTargetLocked: combat.combatTargetLocked === true,
    allowAoePlayerHit: combat.allowAoePlayerHit === true,
    autoIdleCultivation: combat.autoIdleCultivation === true,
    autoSwitchCultivation: combat.autoSwitchCultivation === true,
    autoRootFoundation: combat.autoRootFoundation === true,
    senseQiActive: combat.senseQiActive === true,
    cultivatingTechId: normalizeOptionalString(snapshot.techniques?.cultivatingTechId),
    targetingRulesPayload: targetingRulesPayload ? { ...targetingRulesPayload } : null,
  };
}

function buildAutoBattleSkillRows(snapshot: PersistedPlayerSnapshot): AutoBattleSkillRow[] {
  const entries = Array.isArray(snapshot.combat?.autoBattleSkills) ? snapshot.combat.autoBattleSkills : [];
  const rows: AutoBattleSkillRow[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const normalized = asRecord(entries[index]);
    const skillId = normalizeRequiredString(normalized?.skillId);
    if (!skillId) {
      continue;
    }
    rows.push({
      skillId,
      enabled: normalized?.enabled !== false,
      skillEnabled: normalized?.skillEnabled !== false,
      autoBattleOrder: normalizeMinimumInteger(normalized?.autoBattleOrder, index, 0),
    });
  }
  return rows;
}

function buildAutoUseItemRuleRows(snapshot: PersistedPlayerSnapshot): AutoUseItemRuleRow[] {
  const combat = asRecord(snapshot.combat);
  const entries = Array.isArray(combat?.autoUsePills) ? combat.autoUsePills : [];
  const rows: AutoUseItemRuleRow[] = [];
  for (const entry of entries) {
    const normalized = asRecord(entry);
    const itemId = normalizeRequiredString(normalized?.itemId);
    if (!itemId) {
      continue;
    }
    rows.push({
      itemId,
      conditionPayload: normalizeJsonArray(normalized?.conditions),
    });
  }
  return rows;
}

function buildProfessionStateRows(snapshot: PersistedPlayerSnapshot): ProfessionStateRow[] {
  const progression = asRecord(snapshot.progression);
  const rows: ProfessionStateRow[] = [];

  const alchemy = asRecord(progression?.alchemySkill);
  if (alchemy) {
    rows.push({
      professionType: 'alchemy',
      level: normalizeMinimumInteger(alchemy.level, 1, 1),
      exp: normalizeOptionalNumber(alchemy.exp),
      expToNext: normalizeOptionalNumber(alchemy.expToNext),
    });
  }

  const gather = asRecord(progression?.gatherSkill);
  if (gather) {
    rows.push({
      professionType: 'gather',
      level: normalizeMinimumInteger(gather.level, 1, 1),
      exp: normalizeOptionalNumber(gather.exp),
      expToNext: normalizeOptionalNumber(gather.expToNext),
    });
  }

  const mining = asRecord(progression?.miningSkill);
  if (mining) {
    rows.push({
      professionType: 'mining',
      level: normalizeMinimumInteger(mining.level, 1, 1),
      exp: normalizeOptionalNumber(mining.exp),
      expToNext: normalizeOptionalNumber(mining.expToNext),
    });
  }

  const building = asRecord(progression?.buildingSkill);
  if (building) {
    rows.push({
      professionType: 'building',
      level: normalizeMinimumInteger(building.level, 1, 1),
      exp: normalizeOptionalNumber(building.exp),
      expToNext: normalizeOptionalNumber(building.expToNext),
    });
  }

  const forging = asRecord(progression?.forgingSkill);
  if (forging) {
    rows.push({
      professionType: 'forging',
      level: normalizeMinimumInteger(forging.level, 1, 1),
      exp: normalizeOptionalNumber(forging.exp),
      expToNext: normalizeOptionalNumber(forging.expToNext),
    });
  }

  const enhancement = asRecord(progression?.enhancementSkill);
  const enhancementLevel = normalizeMinimumInteger(
    enhancement?.level ?? progression?.enhancementSkillLevel,
    1,
    1,
  );
  rows.push({
    professionType: 'enhancement',
    level: enhancementLevel,
    exp: normalizeOptionalNumber(enhancement?.exp),
    expToNext: normalizeOptionalNumber(enhancement?.expToNext),
  });

  return rows;
}

function buildAlchemyPresetRows(snapshot: PersistedPlayerSnapshot): AlchemyPresetRow[] {
  const progression = asRecord(snapshot.progression);
  const presets = Array.isArray(progression?.alchemyPresets) ? progression.alchemyPresets : [];
  return presets
    .map((entry, index) => {
      const preset = asRecord(entry);
      const presetId =
        normalizeOptionalString(preset?.presetId)
        ?? normalizeOptionalString(preset?.id)
        ?? `alchemy_preset:${index}`;
      if (!presetId) {
        return null;
      }
      return {
        presetId,
        recipeId: normalizeOptionalString(preset?.recipeId),
        name: normalizeOptionalString(preset?.name) ?? `preset:${index + 1}`,
        ingredients: Array.isArray(preset?.ingredients) ? preset.ingredients : [],
      };
    })
    .filter((entry): entry is AlchemyPresetRow => entry !== null);
}

function buildActiveJobRow(
  playerId: string,
  snapshot: PersistedPlayerSnapshot,
  versionSeed: number,
): ActiveJobRow | null {
  const progression = asRecord(snapshot.progression);
  const enhancementJob = asRecord(progression?.enhancementJob);
  if (enhancementJob && Object.keys(enhancementJob).length > 0) {
    const startedAt = normalizeOptionalInteger(enhancementJob.startedAt) ?? versionSeed;
    const jobRunId =
      normalizeOptionalString(enhancementJob.jobRunId)
      ?? `job:${playerId}:enhancement:${startedAt}`;
    const jobVersion = Math.max(
      1,
      Math.trunc(
        Number(
          normalizeOptionalInteger(enhancementJob.jobVersion)
          ?? versionSeed,
        ),
      ),
    );
    return {
      jobRunId,
      jobType: 'enhancement',
      status: normalizeJobStatus(enhancementJob),
      phase: normalizeOptionalString(enhancementJob.phase) ?? 'running',
      startedAt,
      finishedAt: normalizeOptionalInteger(enhancementJob.finishedAt),
      pausedTicks: normalizeMinimumInteger(enhancementJob.pausedTicks, 0, 0),
      totalTicks: normalizeMinimumInteger(enhancementJob.totalTicks, 0, 0),
      remainingTicks: normalizeMinimumInteger(enhancementJob.remainingTicks, 0, 0),
      successRate: normalizeOptionalNumber(enhancementJob.successRate) ?? 0,
      speedRate: normalizeOptionalNumber(enhancementJob.totalSpeedRate) ?? 1,
      jobVersion,
      detailJson: {
        ...enhancementJob,
        jobRunId,
        jobVersion,
      },
    };
  }

  const forgingJob = asRecord(progression?.forgingJob);
  if (forgingJob && Object.keys(forgingJob).length > 0) {
    return buildAlchemyActiveJobRow(playerId, forgingJob, 'forging', versionSeed);
  }

  const alchemyJob = asRecord(progression?.alchemyJob);
  if (alchemyJob && Object.keys(alchemyJob).length > 0) {
    return buildAlchemyActiveJobRow(playerId, alchemyJob, alchemyJob.jobType === 'forging' ? 'forging' : 'alchemy', versionSeed);
  }

  return null;
}

function buildAlchemyActiveJobRow(
  playerId: string,
  job: Record<string, unknown>,
  jobType: 'alchemy' | 'forging',
  versionSeed: number,
): ActiveJobRow {
  const startedAt = normalizeOptionalInteger(job.startedAt) ?? versionSeed;
  const jobRunId =
    normalizeOptionalString(job.jobRunId)
    ?? `job:${playerId}:${jobType}:${startedAt}`;
  const jobVersion = Math.max(
    1,
    Math.trunc(
      Number(
        normalizeOptionalInteger(job.jobVersion)
        ?? versionSeed,
      ),
    ),
  );
  return {
    jobRunId,
    jobType,
    status: normalizeJobStatus(job),
    phase: normalizeOptionalString(job.phase) ?? 'running',
    startedAt,
    finishedAt: normalizeOptionalInteger(job.finishedAt),
    pausedTicks: normalizeMinimumInteger(job.pausedTicks, 0, 0),
    totalTicks: normalizeMinimumInteger(job.totalTicks, 0, 0),
    remainingTicks: normalizeMinimumInteger(job.remainingTicks, 0, 0),
    successRate: normalizeOptionalNumber(job.successRate) ?? 0,
    speedRate: normalizeOptionalNumber(job.totalSpeedRate) ?? 1,
    jobVersion,
    detailJson: {
      ...job,
      jobRunId,
      jobType,
      jobVersion,
    },
  };
}

function normalizeJobStatus(job: Record<string, unknown>): string {
  const explicitStatus = normalizeOptionalString(job.status);
  if (explicitStatus) {
    return explicitStatus;
  }
  if ((normalizeOptionalInteger(job.remainingTicks) ?? 1) <= 0) {
    return 'completed';
  }
  if ((normalizeOptionalInteger(job.pausedTicks) ?? 0) > 0 && job.phase === 'paused') {
    return 'paused';
  }
  return 'running';
}

function normalizeWorldPreferenceLinePreset(value: unknown): 'peaceful' | 'real' {
  return value === 'real' ? 'real' : 'peaceful';
}

function buildAttrStateRow(snapshot: PersistedPlayerSnapshot): AttrStateRow | null {
  const progression = asRecord(snapshot.progression);
  const attrState = asRecord(snapshot.attrState);
  const baseAttrsPayload = asRecord(attrState?.baseAttrs);
  const bonusEntriesPayload = Array.isArray(snapshot.runtimeBonuses)
    ? snapshot.runtimeBonuses.filter((entry) => !isDerivedPersistentRuntimeBonusSource(String(entry?.source ?? '')))
    : [];
  const revealedBreakthroughRequirementIds = normalizeStringArray(
    attrState?.revealedBreakthroughRequirementIds,
  );
  const realmPayload = asRecord(progression?.realm);
  const heavenGatePayload = asRecord(progression?.heavenGate);
  const spiritualRootsPayload = asRecord(progression?.spiritualRoots);
  if (
    !baseAttrsPayload
    && bonusEntriesPayload.length === 0
    && revealedBreakthroughRequirementIds.length === 0
    && !realmPayload
    && !heavenGatePayload
    && !spiritualRootsPayload
  ) {
    return null;
  }
  return {
    baseAttrsPayload: baseAttrsPayload ? { ...baseAttrsPayload } : null,
    bonusEntriesPayload: bonusEntriesPayload.map((entry) => cloneJsonValue(entry)),
    revealedBreakthroughRequirementIds,
    realmPayload: realmPayload ? { ...realmPayload } : null,
    heavenGatePayload: heavenGatePayload ? { ...heavenGatePayload } : null,
    spiritualRootsPayload: spiritualRootsPayload ? { ...spiritualRootsPayload } : null,
  };
}

function hasProjectedPlayerDomainState(domains: Omit<LoadedPlayerDomains, 'hasProjectedState'>): boolean {
  if (
    domains.worldAnchor
    || domains.positionCheckpoint
    || domains.vitals
    || domains.progressionCore
    || domains.attrState
    || domains.bodyTraining
    || domains.activeJob
  ) {
    return true;
  }
  if (
    domains.inventoryItems.length > 0
    || domains.mapUnlocks.length > 0
    || domains.equipmentSlots.length > 0
    || domains.techniqueStates.length > 0
    || domains.persistentBuffStates.length > 0
    || domains.questProgressRows.length > 0
    || domains.combatPreferences !== null
    || domains.autoBattleSkills.length > 0
    || domains.autoUseItemRules.length > 0
    || domains.professionStates.length > 0
    || domains.alchemyPresets.length > 0
    || domains.enhancementRecords.length > 0
    || domains.logbookMessages.length > 0
  ) {
    return true;
  }
  const watermark = domains.recoveryWatermark;
  if (!watermark) {
    return false;
  }
  return [
    'anchor_version',
    'position_checkpoint_version',
    'vitals_version',
    'progression_version',
    'attr_version',
    'body_training_version',
    'inventory_version',
    'map_unlock_version',
    'equipment_version',
    'technique_version',
    'buff_version',
    'quest_version',
    'combat_pref_version',
    'auto_battle_skill_version',
    'auto_use_item_rule_version',
    'profession_version',
    'alchemy_preset_version',
    'active_job_version',
    'enhancement_record_version',
    'logbook_version',
  ].some((column) => (normalizeOptionalInteger(watermark[column]) ?? 0) > 0);
}

function hasAnyLoadedPlayerDomainState(domains: Omit<LoadedPlayerDomains, 'hasProjectedState'>): boolean {
  if (hasProjectedPlayerDomainState(domains)) {
    return true;
  }
  if (domains.walletRows.length > 0 || domains.marketStorageItems.length > 0) {
    return true;
  }
  const watermark = domains.recoveryWatermark;
  if (!watermark) {
    return false;
  }
  return ['wallet_version', 'market_storage_version'].some(
    (column) => (normalizeOptionalInteger(watermark[column]) ?? 0) > 0,
  );
}

function buildProjectedSnapshotFromDomains(
  starterSnapshot: PersistedPlayerSnapshot,
  domains: LoadedPlayerDomains,
  contentTemplateRepository?: InventoryItemTemplateRepository | null,
): PersistedPlayerSnapshot {
  const snapshot = starterSnapshot;
  snapshot.worldPreference ??= { linePreset: 'peaceful' };
  snapshot.attrState ??= {
    baseAttrs: null,
    revealedBreakthroughRequirementIds: [],
  };
  snapshot.inventory.items = Array.isArray(snapshot.inventory.items) ? snapshot.inventory.items : [];
  snapshot.inventory.lockedItems = Array.isArray(snapshot.inventory.lockedItems)
    ? snapshot.inventory.lockedItems
    : [];
  snapshot.equipment.slots = Array.isArray(snapshot.equipment?.slots) ? snapshot.equipment.slots : [];
  snapshot.techniques.techniques = Array.isArray(snapshot.techniques?.techniques) ? snapshot.techniques.techniques : [];
  snapshot.buffs.buffs = Array.isArray(snapshot.buffs?.buffs) ? snapshot.buffs.buffs : [];
  snapshot.quests.entries = Array.isArray(snapshot.quests?.entries) ? snapshot.quests.entries : [];
  snapshot.combat.autoUsePills = normalizeJsonArray(snapshot.combat?.autoUsePills);
  snapshot.combat.autoBattleSkills = Array.isArray(snapshot.combat?.autoBattleSkills)
    ? snapshot.combat.autoBattleSkills
    : [];
  snapshot.pendingLogbookMessages = Array.isArray(snapshot.pendingLogbookMessages)
    ? snapshot.pendingLogbookMessages
    : [];
  snapshot.runtimeBonuses = normalizeRuntimeBonuses(snapshot.runtimeBonuses);
  snapshot.unlockedMapIds = Array.isArray(snapshot.unlockedMapIds) ? snapshot.unlockedMapIds : [];
  snapshot.wallet = {
    balances: normalizeProjectedWalletRows(domains.walletRows) ?? [],
  };
  snapshot.marketStorage = {
    items: normalizeProjectedMarketStorageRows(domains.marketStorageItems) ?? [],
  };
  if (domains.worldAnchor) {
    snapshot.respawn = {
      instanceId: normalizeOptionalString(domains.worldAnchor.respawn_instance_id)
        ?? `public:${normalizeRequiredString(domains.worldAnchor.respawn_template_id)}`,
      templateId: normalizeRequiredString(domains.worldAnchor.respawn_template_id),
      x: normalizeIntegerWithFallback(domains.worldAnchor.respawn_x, 0),
      y: normalizeIntegerWithFallback(domains.worldAnchor.respawn_y, 0),
      facing: starterSnapshot.placement.facing,
    };
  }

  applyProjectedPlacement(snapshot, domains.worldAnchor, domains.positionCheckpoint);
  applyProjectedWorldPreference(snapshot, domains.worldAnchor);
  applyProjectedVitals(snapshot, domains.vitals);
  applyProjectedProgressionCore(snapshot, domains.progressionCore);
  applyProjectedAttrState(snapshot, domains.attrState);
  applyProjectedBodyTraining(snapshot, domains.bodyTraining);
  applyProjectedInventory(snapshot, domains.inventoryItems, contentTemplateRepository);
  applyProjectedMapUnlocks(snapshot, domains.mapUnlocks);
  applyProjectedEquipment(snapshot, domains.equipmentSlots, contentTemplateRepository);
  applyProjectedTechniques(snapshot, domains.techniqueStates);
  applyProjectedPersistentBuffs(snapshot, domains.persistentBuffStates);
  applyProjectedQuestProgress(snapshot, domains.questProgressRows);
  applyProjectedCombatPreferences(snapshot, domains.combatPreferences);
  applyProjectedAutoBattleSkills(snapshot, domains.autoBattleSkills);
  applyProjectedAutoUseItemRules(snapshot, domains.autoUseItemRules);
  applyProjectedProfessions(snapshot, domains.professionStates);
  applyProjectedAlchemyPresets(snapshot, domains.alchemyPresets);
  applyProjectedActiveJob(snapshot, domains.activeJob);
  applyProjectedEnhancementRecords(snapshot, domains.enhancementRecords);
  applyProjectedLogbook(snapshot, domains.logbookMessages);
  snapshot.savedAt = resolveProjectedSnapshotSavedAt(snapshot, domains.recoveryWatermark);

  if (snapshot.placement.templateId) {
    const unlockedMapIds = new Set([
      ...starterSnapshot.unlockedMapIds,
      ...snapshot.unlockedMapIds,
      snapshot.placement.templateId,
    ].filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0));
    snapshot.unlockedMapIds = [...unlockedMapIds];
  }

  return snapshot;
}

function normalizeProjectedWalletRows(
  rows: readonly PlayerWalletLoadRow[],
): PlayerWalletUpsertInput[] | undefined {
  if (!Array.isArray(rows) || rows.length === 0) {
    return undefined;
  }

  const normalized: PlayerWalletUpsertInput[] = [];
  for (const row of rows) {
    const walletType = normalizeRequiredString(row.wallet_type);
    if (!walletType) {
      continue;
    }
    normalized.push({
      walletType,
      balance: normalizeMinimumInteger(row.balance, 0, 0),
      frozenBalance: normalizeOptionalInteger(row.frozen_balance),
      version: normalizeOptionalInteger(row.version),
    });
  }

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeProjectedMarketStorageRows(
  rows: readonly PlayerMarketStorageItemLoadRow[],
): PlayerMarketStorageItemUpsertInput[] | undefined {
  if (!Array.isArray(rows) || rows.length === 0) {
    return undefined;
  }

  const normalized: PlayerMarketStorageItemUpsertInput[] = [];
  rows.forEach((row, index) => {
    const itemId = normalizeRequiredString(row.item_id);
    if (!itemId) {
      return;
    }
    normalized.push({
      itemId,
      count: normalizeMinimumInteger(row.count, 0, 0),
      slotIndex: normalizeOptionalInteger(row.slot_index) ?? index,
      storageItemId: normalizeOptionalString(row.storage_item_id),
      enhanceLevel: normalizeOptionalInteger(row.enhance_level),
      rawPayload: cloneJsonValue(row.raw_payload),
    });
  });

  return normalized.length > 0 ? normalized : undefined;
}

function applyProjectedPlacement(
  snapshot: PersistedPlayerSnapshot,
  worldAnchor: PlayerWorldAnchorLoadRow | null,
  checkpoint: PlayerPositionCheckpointLoadRow | null,
): void {
  const templateId =
    normalizeOptionalString(worldAnchor?.last_safe_template_id)
    ?? normalizeOptionalString(worldAnchor?.respawn_template_id)
    ?? snapshot.placement.templateId;
  const instanceId =
    normalizeOptionalString(checkpoint?.instance_id)
    ?? normalizeOptionalString(worldAnchor?.last_safe_instance_id)
    ?? normalizeOptionalString(worldAnchor?.respawn_instance_id)
    ?? snapshot.placement.instanceId;
  const x =
    normalizeOptionalInteger(checkpoint?.x)
    ?? normalizeOptionalInteger(worldAnchor?.last_safe_x)
    ?? normalizeOptionalInteger(worldAnchor?.respawn_x)
    ?? snapshot.placement.x;
  const y =
    normalizeOptionalInteger(checkpoint?.y)
    ?? normalizeOptionalInteger(worldAnchor?.last_safe_y)
    ?? normalizeOptionalInteger(worldAnchor?.respawn_y)
    ?? snapshot.placement.y;
  const facing = normalizeOptionalInteger(checkpoint?.facing) ?? snapshot.placement.facing;

  snapshot.placement = {
    instanceId: instanceId || snapshot.placement.instanceId || `public:${templateId}`,
    templateId,
    x,
    y,
    facing,
  };
}

function applyProjectedWorldPreference(
  snapshot: PersistedPlayerSnapshot,
  worldAnchor: PlayerWorldAnchorLoadRow | null,
): void {
  const preferredLinePreset = normalizeOptionalString(worldAnchor?.preferred_line_preset);
  if (!preferredLinePreset) {
    return;
  }
  snapshot.worldPreference = {
    linePreset: normalizeWorldPreferenceLinePreset(preferredLinePreset),
  };
}

function applyProjectedInventory(
  snapshot: PersistedPlayerSnapshot,
  rows: PlayerInventoryItemLoadRow[],
  contentTemplateRepository?: InventoryItemTemplateRepository | null,
): void {
  if (rows.length === 0) {
    return;
  }
  const items: unknown[] = [];
  const lockedItems: unknown[] = [];
  for (const row of rows) {
    const decodedRawPayload = decodeJsonValue(row.raw_payload);
    const hydrated = hydratePersistedInventoryItem({
      itemId: row.item_id,
      itemInstanceId: row.item_instance_id,
      count: row.count,
      rawPayload: decodedRawPayload,
    }, contentTemplateRepository);
    const lockedBy = normalizeOptionalString(row.locked_by);
    if (lockedBy != null) {
      // lockedAt 来自 raw_payload；命中模板时 hydrated 是 Object.create(template) 实例，
      // lockedBy/lockedAt 不在模板字段上，但 raw_payload 中可能有同名 key 已落到 own props，
      // 用 defineProperty 写 own key 兜底，避免严格模式下意外击中模板 readonly 描述符。
      const rawPayloadRecord = asRecord(decodedRawPayload);
      const lockedAt = normalizeOptionalInteger(rawPayloadRecord?.lockedAt) ?? Date.now();
      Object.defineProperty(hydrated, 'lockedBy', {
        value: lockedBy,
        writable: true,
        configurable: true,
        enumerable: true,
      });
      Object.defineProperty(hydrated, 'lockedAt', {
        value: lockedAt,
        writable: true,
        configurable: true,
        enumerable: true,
      });
      lockedItems.push(hydrated);
    } else {
      items.push(hydrated);
    }
  }
  snapshot.inventory = {
    ...snapshot.inventory,
    items,
    lockedItems,
  };
}

function applyProjectedMapUnlocks(
  snapshot: PersistedPlayerSnapshot,
  rows: PlayerMapUnlockLoadRow[],
): void {
  if (rows.length === 0) {
    return;
  }
  const mapUnlockIds = new Set(snapshot.unlockedMapIds);
  for (const row of rows) {
    const mapId = normalizeOptionalString(row.map_id);
    if (mapId) {
      mapUnlockIds.add(mapId);
    }
  }
  snapshot.unlockedMapIds = [...mapUnlockIds];
}

function applyProjectedEquipment(
  snapshot: PersistedPlayerSnapshot,
  rows: PlayerEquipmentSlotLoadRow[],
  contentTemplateRepository?: InventoryItemTemplateRepository | null,
): void {
  if (rows.length === 0) {
    return;
  }
  const slotMap = new Map(
    EQUIP_SLOTS.map((slotType) => {
      const existing = Array.isArray(snapshot.equipment?.slots)
        ? snapshot.equipment.slots.find((entry) => normalizeOptionalString(asRecord(entry)?.slot) === slotType)
        : null;
      const existingRecord = asRecord(existing);
      return [
        slotType,
        {
          slot: slotType,
          item: existingRecord?.item && typeof existingRecord.item === 'object'
            ? existingRecord.item as Record<string, unknown>
            : null,
        },
      ] as const;
    }),
  );
  for (const row of rows) {
    const slotType = normalizeOptionalString(row.slot_type);
    if (!slotType || !EQUIP_SLOTS.includes(slotType as (typeof EQUIP_SLOTS)[number])) {
      continue;
    }
    const normalizedSlotType = slotType as (typeof EQUIP_SLOTS)[number];
    const rawPayload = asRecord(decodeJsonValue(row.raw_payload));
    const item = hydratePersistedEquipmentItem({
      itemId: row.item_id,
      itemInstanceId: row.item_instance_id,
      slot: normalizedSlotType,
      rawPayload,
    }, contentTemplateRepository);
    slotMap.set(normalizedSlotType, {
      slot: normalizedSlotType,
      item,
    });
  }
  snapshot.equipment = {
    ...snapshot.equipment,
    revision: Math.max(1, Number(snapshot.equipment?.revision ?? 1)),
    slots: EQUIP_SLOTS.map((slotType) => slotMap.get(slotType) ?? { slot: slotType, item: null }),
  };
}

function applyProjectedTechniques(
  snapshot: PersistedPlayerSnapshot,
  rows: PlayerTechniqueStateLoadRow[],
): void {
  if (rows.length === 0) {
    return;
  }
  snapshot.techniques = {
    ...snapshot.techniques,
    revision: Math.max(1, Number(snapshot.techniques?.revision ?? 1)),
    techniques: rows.map((row) => {
      const rawPayload = asRecord(decodeJsonValue(row.raw_payload));
      const techId = normalizeOptionalString(rawPayload?.techId) ?? normalizeOptionalString(row.tech_id) ?? 'tech:unknown';
      return {
        ...(rawPayload ?? {}),
        techId,
        level: normalizeMinimumInteger(rawPayload?.level ?? row.level, 1, 1),
        exp: normalizeOptionalNumber(rawPayload?.exp ?? row.exp) ?? 0,
        expToNext: normalizeOptionalNumber(rawPayload?.expToNext ?? row.exp_to_next) ?? 0,
        realmLv: normalizeOptionalInteger(rawPayload?.realmLv ?? row.realm_lv) ?? undefined,
        skillsEnabled: rawPayload?.skillsEnabled !== false && row.skills_enabled !== false,
      };
    }),
  };
}

function applyProjectedPersistentBuffs(
  snapshot: PersistedPlayerSnapshot,
  rows: PlayerPersistentBuffStateLoadRow[],
): void {
  if (rows.length === 0) {
    snapshot.buffs = {
      ...snapshot.buffs,
      revision: Math.max(1, Number(snapshot.buffs?.revision ?? 1)),
      buffs: [],
    };
    return;
  }
  snapshot.buffs = {
    ...snapshot.buffs,
    revision: Math.max(1, Number(snapshot.buffs?.revision ?? 1)),
    buffs: rows.map((row) => {
      const rawPayload = asRecord(decodeJsonValue(row.raw_payload));
      const buffId = normalizeOptionalString(rawPayload?.buffId) ?? normalizeOptionalString(row.buff_id) ?? 'buff:unknown';
      const sourceSkillId =
        normalizeOptionalString(rawPayload?.sourceSkillId)
        ?? normalizeOptionalString(row.source_skill_id)
        ?? `buff_source:${buffId}`;
      return {
        ...(rawPayload ?? {}),
        buffId,
        sourceSkillId,
        sourceCasterId: normalizeOptionalString(rawPayload?.sourceCasterId ?? row.source_caster_id) ?? undefined,
        realmLv: normalizeOptionalInteger(rawPayload?.realmLv ?? row.realm_lv) ?? undefined,
        remainingTicks: normalizeMinimumInteger(rawPayload?.remainingTicks ?? row.remaining_ticks, 0, 0),
        duration: normalizeMinimumInteger(rawPayload?.duration ?? row.duration, 0, 0),
        stacks: normalizeMinimumInteger(rawPayload?.stacks ?? row.stacks, 1, 1),
        maxStacks: normalizeMinimumInteger(rawPayload?.maxStacks ?? row.max_stacks, 1, 1),
        sustainTicksElapsed: normalizeOptionalInteger(
          rawPayload?.sustainTicksElapsed ?? row.sustain_ticks_elapsed,
        ) ?? undefined,
      };
    }),
  };
}

function applyProjectedQuestProgress(
  snapshot: PersistedPlayerSnapshot,
  rows: PlayerQuestProgressLoadRow[],
): void {
  if (rows.length === 0) {
    return;
  }
  snapshot.quests = {
    ...snapshot.quests,
    revision: Math.max(1, Number(snapshot.quests?.revision ?? 1)),
    entries: rows.map((row) => {
      const rawPayload = asRecord(decodeJsonValue(row.raw_payload));
      const questId = normalizeOptionalString(rawPayload?.questId)
        ?? normalizeOptionalString(rawPayload?.id)
        ?? normalizeOptionalString(row.quest_id)
        ?? 'quest:unknown';
      return {
        ...(rawPayload ?? {}),
        id: questId,
        questId,
        status: normalizeOptionalString(rawPayload?.status) ?? normalizeOptionalString(row.status) ?? 'active',
        progress: decodeJsonValue(row.progress_payload) ?? rawPayload?.progress ?? {},
      };
    }),
  };
}

function applyProjectedCombatPreferences(
  snapshot: PersistedPlayerSnapshot,
  row: PlayerCombatPreferencesLoadRow | null,
): void {
  if (!row) {
    return;
  }
  const targetingRules = asRecord(decodeJsonValue(row.targeting_rules_payload));
  snapshot.combat = {
    ...snapshot.combat,
    autoBattle: row.auto_battle === true,
    autoRetaliate: row.auto_retaliate === true,
    autoBattleStationary: row.auto_battle_stationary === true,
    autoBattleTargetingMode: normalizeOptionalString(row.auto_battle_targeting_mode) ?? 'auto',
    retaliatePlayerTargetId: normalizeOptionalString(row.retaliate_player_target_id),
    retaliatePlayerTargetLastAttackTick: normalizeOptionalInteger(row.retaliate_player_target_last_attack_tick),
    combatTargetId: normalizeOptionalString(row.combat_target_id),
    combatTargetLocked: row.combat_target_locked === true,
    allowAoePlayerHit: row.allow_aoe_player_hit === true,
    autoIdleCultivation: row.auto_idle_cultivation === true,
    autoSwitchCultivation: row.auto_switch_cultivation === true,
    autoRootFoundation: row.auto_root_foundation === true,
    senseQiActive: row.sense_qi_active === true,
    combatTargetingRules: targetingRules ? { ...targetingRules } : undefined,
  };
  snapshot.techniques = {
    ...snapshot.techniques,
    cultivatingTechId: normalizeOptionalString(row.cultivating_tech_id),
  };
}

function applyProjectedAutoBattleSkills(
  snapshot: PersistedPlayerSnapshot,
  rows: PlayerAutoBattleSkillLoadRow[],
): void {
  if (rows.length === 0) {
    return;
  }
  snapshot.combat = {
    ...snapshot.combat,
    autoBattleSkills: rows.map((row, index) => ({
      skillId: normalizeOptionalString(row.skill_id) ?? `skill:${index}`,
      enabled: row.enabled !== false,
      skillEnabled: row.skill_enabled !== false,
      autoBattleOrder: normalizeMinimumInteger(row.auto_battle_order, index, 0),
    })),
  };
}

function applyProjectedAutoUseItemRules(
  snapshot: PersistedPlayerSnapshot,
  rows: PlayerAutoUseItemRuleLoadRow[],
): void {
  if (rows.length === 0) {
    return;
  }
  snapshot.combat = {
    ...snapshot.combat,
    autoUsePills: rows.map((row) => ({
      itemId: normalizeOptionalString(row.item_id) ?? 'item:unknown',
      conditions: normalizeJsonArray(row.condition_payload),
    })),
  };
}

function applyProjectedVitals(
  snapshot: PersistedPlayerSnapshot,
  row: PlayerVitalsLoadRow | null,
): void {
  if (!row) {
    return;
  }
  snapshot.vitals = {
    hp: normalizeMinimumNumber(row.hp, snapshot.vitals.hp, 0),
    maxHp: normalizeMinimumNumber(row.max_hp, snapshot.vitals.maxHp, 1),
    qi: normalizeMinimumNumber(row.qi, snapshot.vitals.qi, 0),
    maxQi: normalizeMinimumNumber(row.max_qi, snapshot.vitals.maxQi, 0),
  };
}

function applyProjectedProgressionCore(
  snapshot: PersistedPlayerSnapshot,
  row: PlayerProgressionCoreLoadRow | null,
): void {
  if (!row) {
    return;
  }
  snapshot.progression.foundation = normalizeMinimumNumber(
    row.foundation,
    snapshot.progression.foundation,
    0,
  );
  snapshot.progression.rootFoundation = normalizeMinimumNumber(
    row.root_foundation,
    snapshot.progression.rootFoundation,
    0,
  );
  snapshot.progression.combatExp = normalizeMinimumNumber(
    row.combat_exp,
    snapshot.progression.combatExp,
    0,
  );
  snapshot.progression.boneAgeBaseYears = normalizeMinimumInteger(
    row.bone_age_base_years,
    snapshot.progression.boneAgeBaseYears,
    0,
  );
  snapshot.progression.lifeElapsedTicks = normalizeMinimumInteger(
    row.life_elapsed_ticks,
    snapshot.progression.lifeElapsedTicks,
    0,
  );
  snapshot.progression.lifespanYears = normalizeOptionalInteger(row.lifespan_years) ?? snapshot.progression.lifespanYears;
}

function applyProjectedAttrState(
  snapshot: PersistedPlayerSnapshot,
  row: PlayerAttrStateLoadRow | null,
): void {
  if (!row) {
    return;
  }
  const baseAttrs = asRecord(decodeJsonValue(row.base_attrs_payload));
  const bonusEntries = normalizeJsonArray(row.bonus_entries_payload);
  const revealedIds = normalizeStringArray(decodeJsonValue(row.revealed_breakthrough_requirement_ids));
  const realm = asRecord(decodeJsonValue(row.realm_payload));
  const heavenGate = asRecord(decodeJsonValue(row.heaven_gate_payload));
  const spiritualRoots = asRecord(decodeJsonValue(row.spiritual_roots_payload));
  snapshot.attrState = {
    baseAttrs: baseAttrs ? { ...baseAttrs } : null,
    revealedBreakthroughRequirementIds: revealedIds,
  };
  snapshot.runtimeBonuses = normalizeRuntimeBonuses(bonusEntries);
  snapshot.progression.realm = realm ? { ...realm } : null;
  snapshot.progression.heavenGate = heavenGate ? { ...heavenGate } : null;
  snapshot.progression.spiritualRoots = spiritualRoots ? { ...spiritualRoots } : null;
}

function applyProjectedBodyTraining(
  snapshot: PersistedPlayerSnapshot,
  row: PlayerBodyTrainingLoadRow | null,
): void {
  if (!row) {
    return;
  }
  snapshot.progression.bodyTraining = {
    level: normalizeMinimumInteger(row.level, snapshot.progression.bodyTraining?.level ?? 0, 0),
    exp: normalizeMinimumNumber(row.exp, snapshot.progression.bodyTraining?.exp ?? 0, 0),
    expToNext: normalizeMinimumNumber(
      row.exp_to_next,
      snapshot.progression.bodyTraining?.expToNext ?? 1,
      1,
    ),
  };
}

function applyProjectedProfessions(
  snapshot: PersistedPlayerSnapshot,
  rows: PlayerProfessionStateLoadRow[],
): void {
  for (const row of rows) {
    const professionType = normalizeOptionalString(row.profession_type);
    if (!professionType) {
      continue;
    }
    const state = {
      level: normalizeMinimumInteger(row.level, 1, 1),
      exp: normalizeOptionalNumber(row.exp),
      expToNext: normalizeOptionalNumber(row.exp_to_next),
    };
    if (professionType === 'alchemy') {
      snapshot.progression.alchemySkill = state;
    } else if (professionType === 'forging') {
      snapshot.progression.forgingSkill = state;
    } else if (professionType === 'building') {
      snapshot.progression.buildingSkill = state;
    } else if (professionType === 'gather') {
      snapshot.progression.gatherSkill = state;
    } else if (professionType === 'mining') {
      snapshot.progression.miningSkill = state;
    } else if (professionType === 'enhancement') {
      snapshot.progression.enhancementSkill = state;
      snapshot.progression.enhancementSkillLevel = state.level;
    }
  }
}

function applyProjectedAlchemyPresets(
  snapshot: PersistedPlayerSnapshot,
  rows: PlayerAlchemyPresetLoadRow[],
): void {
  if (rows.length === 0) {
    return;
  }
  snapshot.progression.alchemyPresets = rows.map((row) => ({
    presetId: normalizeOptionalString(row.preset_id) ?? 'alchemy_preset:unknown',
    recipeId: normalizeOptionalString(row.recipe_id),
    name: normalizeOptionalString(row.name) ?? '未命名丹方',
    ingredients: normalizeJsonArray(row.ingredients_payload),
  }));
}

function applyProjectedActiveJob(
  snapshot: PersistedPlayerSnapshot,
  row: PlayerActiveJobLoadRow | null,
): void {
  if (!row) {
    snapshot.progression.alchemyJob = null;
    snapshot.progression.forgingJob = null;
    snapshot.progression.enhancementJob = null;
    return;
  }
  const detail = asRecord(decodeJsonValue(row.detail_jsonb)) ?? {};
  const normalizedJob = {
    ...detail,
    status: normalizeOptionalString(row.status) ?? normalizeOptionalString(detail.status) ?? 'running',
    phase: normalizeOptionalString(row.phase) ?? normalizeOptionalString(detail.phase) ?? 'running',
    startedAt: normalizeOptionalInteger(row.started_at) ?? normalizeOptionalInteger(detail.startedAt) ?? snapshot.savedAt,
    finishedAt: normalizeOptionalInteger(row.finished_at) ?? normalizeOptionalInteger(detail.finishedAt),
    pausedTicks: normalizeOptionalInteger(row.paused_ticks) ?? normalizeOptionalInteger(detail.pausedTicks) ?? 0,
    totalTicks: normalizeOptionalInteger(row.total_ticks) ?? normalizeOptionalInteger(detail.totalTicks) ?? 0,
    remainingTicks: normalizeOptionalInteger(row.remaining_ticks) ?? normalizeOptionalInteger(detail.remainingTicks) ?? 0,
    successRate: normalizeOptionalNumber(row.success_rate) ?? normalizeOptionalNumber(detail.successRate) ?? 0,
    totalSpeedRate: normalizeOptionalNumber(row.speed_rate) ?? normalizeOptionalNumber(detail.totalSpeedRate) ?? 1,
    jobRunId: normalizeOptionalString(row.job_run_id),
    jobVersion: normalizeOptionalInteger(row.job_version) ?? 1,
  };
  const jobType = normalizeOptionalString(row.job_type);
  if (jobType === 'enhancement') {
    snapshot.progression.enhancementJob = { ...normalizedJob, jobType: 'enhancement' };
    snapshot.progression.alchemyJob = null;
    snapshot.progression.forgingJob = null;
    return;
  }
  if (jobType === 'forging') {
    snapshot.progression.forgingJob = { ...normalizedJob, jobType: 'forging' };
    snapshot.progression.alchemyJob = null;
  } else {
    snapshot.progression.alchemyJob = { ...normalizedJob, jobType: 'alchemy' };
    snapshot.progression.forgingJob = null;
  }
  snapshot.progression.enhancementJob = null;
}

function applyProjectedEnhancementRecords(
  snapshot: PersistedPlayerSnapshot,
  rows: PlayerEnhancementRecordLoadRow[],
): void {
  if (rows.length === 0) {
    snapshot.progression.enhancementRecords = [];
    return;
  }
  snapshot.progression.enhancementRecords = rows.map((row) => ({
    recordId: normalizeOptionalString(row.record_id) ?? undefined,
    itemId: normalizeOptionalString(row.item_id) ?? 'item:unknown',
    highestLevel: normalizeMinimumInteger(row.highest_level, 0, 0),
    levels: normalizeJsonArray(row.levels_payload).map((entry) => cloneJsonValue(entry)),
    actionStartedAt: normalizeOptionalInteger(row.action_started_at) ?? undefined,
    actionEndedAt: normalizeOptionalInteger(row.action_ended_at) ?? undefined,
    startLevel: normalizeOptionalInteger(row.start_level) ?? undefined,
    initialTargetLevel: normalizeOptionalInteger(row.initial_target_level) ?? undefined,
    desiredTargetLevel: normalizeOptionalInteger(row.desired_target_level) ?? undefined,
    protectionStartLevel: normalizeOptionalInteger(row.protection_start_level) ?? undefined,
    status: normalizeOptionalString(row.status) ?? undefined,
  }));
}

function applyProjectedLogbook(
  snapshot: PersistedPlayerSnapshot,
  rows: PlayerLogbookMessageLoadRow[],
): void {
  if (rows.length === 0) {
    return;
  }
  snapshot.pendingLogbookMessages = rows.map((row) => ({
    id: normalizeOptionalString(row.message_id) ?? 'logbook:unknown',
    kind: normalizeOptionalString(row.kind) as PersistedPlayerSnapshot['pendingLogbookMessages'][number]['kind'] ?? 'system',
    text: normalizeOptionalString(row.text) ?? '',
    from: normalizeOptionalString(row.from_name) ?? undefined,
    at: normalizeOptionalInteger(row.occurred_at) ?? snapshot.savedAt,
  }));
}

function resolveProjectedSnapshotSavedAt(
  snapshot: PersistedPlayerSnapshot,
  watermark: PlayerRecoveryWatermarkLoadRow | null,
): number {
  const candidates = [
    snapshot.savedAt,
    normalizeOptionalInteger(watermark?.anchor_version),
    normalizeOptionalInteger(watermark?.position_checkpoint_version),
    normalizeOptionalInteger(watermark?.vitals_version),
    normalizeOptionalInteger(watermark?.progression_version),
    normalizeOptionalInteger(watermark?.attr_version),
    normalizeOptionalInteger(watermark?.body_training_version),
    normalizeOptionalInteger(watermark?.inventory_version),
    normalizeOptionalInteger(watermark?.map_unlock_version),
    normalizeOptionalInteger(watermark?.equipment_version),
    normalizeOptionalInteger(watermark?.technique_version),
    normalizeOptionalInteger(watermark?.buff_version),
    normalizeOptionalInteger(watermark?.quest_version),
    normalizeOptionalInteger(watermark?.combat_pref_version),
    normalizeOptionalInteger(watermark?.auto_battle_skill_version),
    normalizeOptionalInteger(watermark?.auto_use_item_rule_version),
    normalizeOptionalInteger(watermark?.profession_version),
    normalizeOptionalInteger(watermark?.alchemy_preset_version),
    normalizeOptionalInteger(watermark?.active_job_version),
    normalizeOptionalInteger(watermark?.enhancement_record_version),
    normalizeOptionalInteger(watermark?.logbook_version),
  ].filter((value): value is number => Number.isFinite(value) && value > 0);
  return candidates.length > 0 ? Math.max(...candidates) : Date.now();
}

function normalizeJsonArray(value: unknown): unknown[] {
  const decoded = decodeJsonValue(value);
  return Array.isArray(decoded) ? decoded : [];
}

function normalizeStringArray(value: unknown): string[] {
  return normalizeJsonArray(value)
    .map((entry) => normalizeOptionalString(entry))
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function normalizeRuntimeBonuses(value: unknown): PersistedPlayerSnapshot['runtimeBonuses'] {
  return normalizeJsonArray(value)
    .map((entry) => normalizeRuntimeBonusEntry(entry))
    .filter((entry): entry is PersistedPlayerSnapshot['runtimeBonuses'][number] => entry !== null);
}

function normalizeRuntimeBonusEntry(
  value: unknown,
): PersistedPlayerSnapshot['runtimeBonuses'][number] | null {
  const entry = asRecord(decodeJsonValue(value));
  if (!entry) {
    return null;
  }
  const source = normalizeOptionalString(entry.source);
  if (!source || isDerivedPersistentRuntimeBonusSource(source)) {
    return null;
  }
  const attrs = asRecord(decodeJsonValue(entry.attrs));
  const stats = asRecord(decodeJsonValue(entry.stats));
  const meta = asRecord(decodeJsonValue(entry.meta));
  const qiProjection = Array.isArray(entry.qiProjection)
    ? entry.qiProjection
        .map((item) => asRecord(decodeJsonValue(item)))
        .filter((item): item is Record<string, unknown> => item !== null)
        .map((item) => cloneJsonValue(item))
    : undefined;
  return {
    source,
    label: normalizeOptionalString(entry.label) ?? undefined,
    attrs: attrs ? cloneJsonValue(attrs) : undefined,
    stats: stats ? cloneJsonValue(stats) : undefined,
    qiProjection,
    meta: meta ? cloneJsonValue(meta) : undefined,
  };
}

function isDerivedPersistentRuntimeBonusSource(source: string): boolean {
  return source === 'runtime:realm_stage'
    || source === 'runtime:realm_state'
    || source === 'runtime:heaven_gate_roots'
    || source === 'runtime:technique_aggregate';
}

function cloneJsonValue<T>(value: T): T {
  return decodeJsonValue(value) as T;
}

function normalizeQuestProgressPayload(value: unknown): Record<string, unknown> | unknown[] | null {
  const decoded = decodeJsonValue(value);
  if (Array.isArray(decoded)) {
    return decoded;
  }
  const normalized = asRecord(decoded);
  return normalized ? { ...normalized } : null;
}

function decodeJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  try {
    return JSON.parse(normalized);
  } catch {
    return value;
  }
}

async function querySingleRow<T>(
  client: PoolClient,
  sql: string,
  params: unknown[],
): Promise<T | null> {
  const result = await client.query<T>(sql, params);
  return result.rows[0] ?? null;
}

async function queryRows<T>(
  client: PoolClient,
  sql: string,
  params: unknown[],
): Promise<T[]> {
  const result = await client.query<T>(sql, params);
  return result.rows ?? [];
}

/** 按 player_id 索引单行结果（后出现的覆盖先出现的）。 */
function indexRowsByPlayerId<T extends { player_id?: unknown }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    const pid = typeof row.player_id === 'string' ? row.player_id.trim() : '';
    if (pid) map.set(pid, row);
  }
  return map;
}

/** 按 player_id 索引多行结果（同一 player_id 聚合为数组）。 */
function indexMultiRowsByPlayerId<T extends { player_id?: unknown }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const pid = typeof row.player_id === 'string' ? row.player_id.trim() : '';
    if (!pid) continue;
    const list = map.get(pid);
    if (list) list.push(row);
    else map.set(pid, [row]);
  }
  return map;
}

function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = normalizeRequiredString(value);
  return normalized ? normalized : null;
}

async function acquireSchemaInitLock(client: PoolClient): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock($1::integer, $2::integer)', [7100, 1]);
}

async function acquirePlayerPersistenceLock(client: PoolClient, playerId: string): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock($1::integer, hashtext($2))', [7101, playerId]);
}

function normalizeOptionalInteger(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

function normalizeOptionalNumber(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeIntegerWithFallback(value: unknown, fallback: unknown): number {
  const normalized = normalizeOptionalInteger(value);
  if (normalized != null) {
    return normalized;
  }
  const normalizedFallback = normalizeOptionalInteger(fallback);
  return normalizedFallback ?? 0;
}

function normalizeNumberWithFallback(value: unknown, fallback: unknown): number {
  const normalized = normalizeOptionalNumber(value);
  if (normalized != null) {
    return normalized;
  }
  const normalizedFallback = normalizeOptionalNumber(fallback);
  return normalizedFallback ?? 0;
}

function normalizeMinimumInteger(value: unknown, fallback: unknown, minimum: number): number {
  return Math.max(minimum, normalizeIntegerWithFallback(value, fallback));
}

function normalizeMinimumNumber(value: unknown, fallback: unknown, minimum: number): number {
  return Math.max(minimum, normalizeNumberWithFallback(value, fallback));
}

function normalizeVersionSeed(value: unknown): number {
  if (value == null || value === '') {
    return Math.max(1, Math.trunc(Date.now()));
  }
  const numeric = Number(value);
  return Math.max(1, Math.trunc(Number.isFinite(numeric) ? numeric : Date.now()));
}

function normalizeOfflineGainReportPayload(
  record: Record<string, unknown> | null,
  fallbackPlayerId: string,
): OfflineGainReportView | null {
  const id = normalizeRequiredString(record?.id);
  if (!id) {
    return null;
  }
  return {
    id,
    playerId: normalizeOptionalString(record?.playerId) ?? fallbackPlayerId,
    scope: record?.scope === 'online' ? 'online' : 'offline',
    source: normalizeOptionalString(record?.source) ?? (record?.scope === 'online' ? 'system' : 'cultivation'),
    startedAt: normalizeMinimumInteger(record?.startedAt, Date.now(), 0),
    endedAt: normalizeMinimumInteger(record?.endedAt, Date.now(), 0),
    durationMs: normalizeMinimumInteger(record?.durationMs, 0, 0),
    generatedAt: normalizeMinimumInteger(record?.generatedAt, Date.now(), 0),
    spiritStones: normalizeStatisticAmountRecord(asRecord(record?.spiritStones)),
    items: Array.isArray(record?.items)
      ? record.items
        .map((entry) => asRecord(entry))
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
        .map((entry) => {
          const amount = normalizeStatisticAmountRecord(entry);
          return {
            itemId: normalizeRequiredString(entry.itemId),
            name: normalizeOptionalString(entry.name) ?? undefined,
            gained: amount.gained,
            lost: amount.lost,
            net: amount.net,
            count: amount.gained,
          };
        })
        .filter((entry) => entry.itemId && (entry.gained > 0 || entry.lost > 0))
      : [],
    progress: Array.isArray(record?.progress)
      ? record.progress
        .map((entry) => asRecord(entry))
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
        .map((entry) => {
          const amount = normalizeStatisticAmountRecord(entry);
          return {
            kind: normalizeOfflineGainProgressKind(entry.kind),
            label: normalizeOptionalString(entry.label) ?? '收益',
            gained: amount.gained,
            lost: amount.lost,
            net: amount.net,
            amount: amount.gained,
            levelGain: normalizeOptionalInteger(entry.levelGain) ?? undefined,
            levelLoss: normalizeOptionalInteger(entry.levelLoss) ?? undefined,
            currentLevel: normalizeOptionalInteger(entry.currentLevel) ?? undefined,
          };
        })
        .filter((entry) => entry.gained > 0 || entry.lost > 0 || (entry.levelGain ?? 0) > 0 || (entry.levelLoss ?? 0) > 0)
      : [],
    techniques: Array.isArray(record?.techniques)
      ? record.techniques
        .map((entry) => asRecord(entry))
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
        .map((entry) => {
          const amount = normalizeStatisticExpAmountRecord(entry);
          return {
            techniqueId: normalizeRequiredString(entry.techniqueId),
            name: normalizeOptionalString(entry.name) ?? undefined,
            expGained: amount.gained,
            expLost: amount.lost,
            netExp: amount.net,
            expGain: amount.gained,
            levelGain: normalizeOptionalInteger(entry.levelGain) ?? undefined,
            levelLoss: normalizeOptionalInteger(entry.levelLoss) ?? undefined,
            currentLevel: normalizeOptionalInteger(entry.currentLevel) ?? undefined,
          };
        })
        .filter((entry) => entry.techniqueId && (entry.expGained > 0 || entry.expLost > 0 || (entry.levelGain ?? 0) > 0 || (entry.levelLoss ?? 0) > 0))
      : [],
    professions: Array.isArray(record?.professions)
      ? record.professions
        .map((entry) => asRecord(entry))
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
        .map((entry) => {
          const amount = normalizeStatisticExpAmountRecord(entry);
          return {
            professionType: normalizeRequiredString(entry.professionType) || 'unknown',
            label: normalizeOptionalString(entry.label) ?? '技艺',
            expGained: amount.gained,
            expLost: amount.lost,
            netExp: amount.net,
            expGain: amount.gained,
            levelGain: normalizeOptionalInteger(entry.levelGain) ?? undefined,
            levelLoss: normalizeOptionalInteger(entry.levelLoss) ?? undefined,
            currentLevel: normalizeOptionalInteger(entry.currentLevel) ?? undefined,
          };
        })
        .filter((entry) => entry.expGained > 0 || entry.expLost > 0 || (entry.levelGain ?? 0) > 0 || (entry.levelLoss ?? 0) > 0)
      : [],
  };
}

function normalizePlayerStatisticPeriodTotal(value: unknown): PlayerStatisticPeriodTotalView {
  const record = asRecord(value) ?? {};
  return {
    spiritStones: normalizeStatisticAmountRecord(asRecord(record.spiritStones)),
    progress: normalizeStatisticAmountRecord(asRecord(record.progress)),
    techniques: normalizeStatisticAmountRecord(asRecord(record.techniques)),
    professions: normalizeStatisticAmountRecord(asRecord(record.professions)),
  };
}

function normalizeStatisticAmountRecord(record: Record<string, unknown> | null): { gained: number; lost: number; net: number } {
  const gained = normalizeMinimumNumber(record?.gained ?? record?.amount ?? record?.count, 0, 0);
  const lost = normalizeMinimumNumber(record?.lost, 0, 0);
  const numericNet = Number(record?.net ?? gained - lost);
  return {
    gained,
    lost,
    net: Number.isFinite(numericNet) ? numericNet : gained - lost,
  };
}

function normalizeStatisticExpAmountRecord(record: Record<string, unknown> | null): { gained: number; lost: number; net: number } {
  const gained = normalizeMinimumNumber(record?.expGained ?? record?.expGain, 0, 0);
  const lost = normalizeMinimumNumber(record?.expLost, 0, 0);
  const numericNet = Number(record?.netExp ?? gained - lost);
  return {
    gained,
    lost,
    net: Number.isFinite(numericNet) ? numericNet : gained - lost,
  };
}

function normalizeOfflineGainProgressKind(value: unknown): OfflineGainReportView['progress'][number]['kind'] {
  switch (value) {
    case 'realmExp':
    case 'foundation':
    case 'rootFoundation':
    case 'combatExp':
    case 'bodyTrainingExp':
      return value;
    default:
      return 'foundation';
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

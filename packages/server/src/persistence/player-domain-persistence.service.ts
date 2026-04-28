import { Inject, Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { EQUIP_SLOTS } from '@mud/shared';
import type { PoolClient } from 'pg';
import { Pool } from 'pg';

import { ContentTemplateRepository } from '../content/content-template.repository';
import { resolveServerDatabaseUrl } from '../config/env-alias';
import {
  buildPersistedInventoryItemRawPayload,
  hydratePersistedInventoryItem,
  type InventoryItemTemplateRepository,
} from './inventory-item-persistence';
import type { PersistedPlayerSnapshot } from './player-persistence.service';

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
const PLAYER_RECOVERY_WATERMARK_TABLE = 'player_recovery_watermark';
const PLAYER_DOMAIN_BIGINT_COLUMNS_BY_TABLE = {
  [PLAYER_WORLD_ANCHOR_TABLE]: ['respawn_x', 'respawn_y', 'last_safe_x', 'last_safe_y'],
  [PLAYER_POSITION_CHECKPOINT_TABLE]: ['x', 'y', 'facing'],
  [PLAYER_VITALS_TABLE]: ['hp', 'max_hp', 'qi', 'max_qi'],
  [PLAYER_PROGRESSION_CORE_TABLE]: ['foundation', 'combat_exp', 'bone_age_base_years', 'lifespan_years'],
  [PLAYER_BODY_TRAINING_STATE_TABLE]: ['level', 'exp', 'exp_to_next'],
  [PLAYER_MARKET_STORAGE_ITEM_TABLE]: ['slot_index', 'count', 'enhance_level'],
  [PLAYER_TECHNIQUE_STATE_TABLE]: ['level', 'exp', 'exp_to_next', 'realm_lv'],
  [PLAYER_PERSISTENT_BUFF_STATE_TABLE]: [
    'realm_lv',
    'remaining_ticks',
    'duration',
    'stacks',
    'max_stacks',
    'sustain_ticks_elapsed',
  ],
  [PLAYER_AUTO_BATTLE_SKILL_TABLE]: ['auto_battle_order'],
  [PLAYER_PROFESSION_STATE_TABLE]: ['level', 'exp', 'exp_to_next'],
  [PLAYER_ACTIVE_JOB_TABLE]: ['paused_ticks', 'total_ticks', 'remaining_ticks'],
  [PLAYER_ENHANCEMENT_RECORD_TABLE]: [
    'highest_level',
    'start_level',
    'initial_target_level',
    'desired_target_level',
    'protection_start_level',
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
  professionType: 'alchemy' | 'gather' | 'enhancement';
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
  combatTargetId: string | null;
  combatTargetLocked: boolean;
  allowAoePlayerHit: boolean;
  autoIdleCultivation: boolean;
  autoSwitchCultivation: boolean;
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
  jobType: 'alchemy' | 'enhancement';
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
  item_id?: unknown;
  count?: unknown;
  slot_index?: unknown;
  raw_payload?: unknown;
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
  combat_target_id?: unknown;
  combat_target_locked?: unknown;
  allow_aoe_player_hit?: unknown;
  auto_idle_cultivation?: unknown;
  auto_switch_cultivation?: unknown;
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

@Injectable()
export class PlayerDomainPersistenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlayerDomainPersistenceService.name);
  private pool: Pool | null = null;
  private enabled = false;

  constructor(
    @Optional()
    @Inject(ContentTemplateRepository)
    private readonly contentTemplateRepository: InventoryItemTemplateRepository | null = null,
  ) {}

  async onModuleInit(): Promise<void> {
    const databaseUrl = resolveServerDatabaseUrl();
    if (!databaseUrl.trim()) {
      this.logger.log('玩家分域持久化已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
      return;
    }

    this.pool = new Pool({
      connectionString: databaseUrl,
    });

    try {
      await ensurePlayerDomainTables(this.pool);
      this.enabled = true;
      this.logger.log('玩家分域持久化已启用');
    } catch (error: unknown) {
      this.logger.error(
        '玩家分域持久化初始化失败，已回退为禁用模式',
        error instanceof Error ? error.stack : String(error),
      );
      await this.safeClosePool();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.safeClosePool();
  }

  isEnabled(): boolean {
    return this.enabled && this.pool !== null;
  }

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
  ): Promise<void> {
    const normalizedPlayerId = normalizeRequiredString(playerId);
    if (!this.pool || !this.enabled || !normalizedPlayerId || !snapshot?.placement?.templateId) {
      return;
    }

    await this.withTransaction(async (client) => {
      await acquirePlayerPersistenceLock(client, normalizedPlayerId);
      await savePlayerSnapshotProjectionDomainsWithClient(client, normalizedPlayerId, snapshot, domains);
    });
  }

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
            item_id,
            count,
            slot_index,
            raw_payload
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
            combat_target_id,
            combat_target_locked,
            allow_aoe_player_hit,
            auto_idle_cultivation,
            auto_switch_cultivation,
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
    const entries: Array<{ playerId: string; snapshot: PersistedPlayerSnapshot; updatedAt: number }> = [];
    for (const row of result.rows ?? []) {
      const playerId = normalizeRequiredString(row.player_id);
      if (!playerId) {
        continue;
      }
      const snapshot = await this.loadProjectedSnapshot(playerId, buildStarterSnapshot);
      if (snapshot) {
        entries.push({
          playerId,
          snapshot,
          updatedAt: Math.max(0, Math.trunc(Number(row.updated_at_ms ?? snapshot.savedAt ?? 0))),
        });
      }
    }
    return entries;
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

  private async safeClosePool(): Promise<void> {
    const pool = this.pool;
    this.pool = null;
    this.enabled = false;
    if (pool) {
      await pool.end().catch(() => undefined);
    }
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
  const vitalsHp = normalizeMinimumInteger(vitals?.hp, 0, 0);
  const vitalsMaxHp = normalizeMinimumInteger(vitals?.maxHp, 1, 1);
  const vitalsQi = normalizeMinimumInteger(vitals?.qi, 0, 0);
  const vitalsMaxQi = normalizeMinimumInteger(vitals?.maxQi, 0, 0);
  const foundation = normalizeMinimumInteger(progression?.foundation, 0, 0);
  const combatExp = normalizeMinimumInteger(progression?.combatExp, 0, 0);
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
        combat_exp,
        bone_age_base_years,
        life_elapsed_ticks,
        lifespan_years,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        foundation = EXCLUDED.foundation,
        combat_exp = EXCLUDED.combat_exp,
        bone_age_base_years = EXCLUDED.bone_age_base_years,
        life_elapsed_ticks = EXCLUDED.life_elapsed_ticks,
        lifespan_years = EXCLUDED.lifespan_years,
        updated_at = now()
    `,
    [
      normalizedPlayerId,
      foundation,
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

  await replacePlayerInventoryItems(client, normalizedPlayerId, inventoryItems);
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
  await replacePlayerMapUnlocks(client, normalizedPlayerId, mapUnlockIds, versionSeed);
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
      hp: normalizeMinimumInteger(snapshot.vitals?.hp, 0, 0),
      maxHp: normalizeMinimumInteger(snapshot.vitals?.maxHp, 1, 1),
      qi: normalizeMinimumInteger(snapshot.vitals?.qi, 0, 0),
      maxQi: normalizeMinimumInteger(snapshot.vitals?.maxQi, 0, 0),
    });
    watermarkPatch.vitals_version = versionSeed;
  }

  if (rawDomains.has('progression')) {
    await replacePlayerProgressionCore(client, normalizedPlayerId, {
      foundation: normalizeMinimumInteger(progression?.foundation, 0, 0),
      combatExp: normalizeMinimumInteger(progression?.combatExp, 0, 0),
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
    await replacePlayerInventoryItems(
      client,
      normalizedPlayerId,
      Array.isArray(snapshot.inventory?.items) ? snapshot.inventory.items : [],
    );
    watermarkPatch.inventory_version = versionSeed;
  }

  if (rawDomains.has('map_unlock')) {
    await replacePlayerMapUnlocks(
      client,
      normalizedPlayerId,
      Array.isArray(snapshot.unlockedMapIds) ? snapshot.unlockedMapIds : [],
      versionSeed,
    );
    watermarkPatch.map_unlock_version = versionSeed;
  }

  if (rawDomains.has('equipment')) {
    await replacePlayerEquipmentSlots(
      client,
      normalizedPlayerId,
      Array.isArray(snapshot.equipment?.slots) ? snapshot.equipment.slots : [],
    );
    watermarkPatch.equipment_version = versionSeed;
  }

  if (rawDomains.has('technique')) {
    await replacePlayerTechniqueStates(client, normalizedPlayerId, buildTechniqueStateRows(snapshot));
    watermarkPatch.technique_version = versionSeed;
  }

  if (rawDomains.has('buff')) {
    await replacePlayerPersistentBuffStates(client, normalizedPlayerId, buildPersistentBuffStateRows(snapshot));
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
      normalizeMinimumInteger(row.hp, 0, 0),
      normalizeMinimumInteger(row.maxHp, 1, 1),
      normalizeMinimumInteger(row.qi, 0, 0),
      normalizeMinimumInteger(row.maxQi, 0, 0),
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
        combat_exp,
        bone_age_base_years,
        life_elapsed_ticks,
        lifespan_years,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        foundation = EXCLUDED.foundation,
        combat_exp = EXCLUDED.combat_exp,
        bone_age_base_years = EXCLUDED.bone_age_base_years,
        life_elapsed_ticks = EXCLUDED.life_elapsed_ticks,
        lifespan_years = EXCLUDED.lifespan_years,
        updated_at = now()
    `,
    [
      playerId,
      normalizeMinimumInteger(row.foundation, 0, 0),
      normalizeMinimumInteger(row.combatExp, 0, 0),
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
      runtime_owner_id varchar(120),
      session_epoch bigint NOT NULL DEFAULT 1,
      transfer_state varchar(32),
      transfer_target_node_id varchar(120),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
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
      hp bigint NOT NULL,
      max_hp bigint NOT NULL,
      qi bigint NOT NULL,
      max_qi bigint NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_PROGRESSION_CORE_TABLE} (
      player_id varchar(100) PRIMARY KEY,
      foundation bigint NOT NULL DEFAULT 0,
      combat_exp bigint NOT NULL DEFAULT 0,
      bone_age_base_years bigint NOT NULL DEFAULT 18,
      life_elapsed_ticks bigint NOT NULL DEFAULT 0,
      lifespan_years bigint,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
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
      exp bigint NOT NULL DEFAULT 0,
      exp_to_next bigint NOT NULL DEFAULT 1,
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
      exp bigint,
      exp_to_next bigint,
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
      combat_target_id varchar(120),
      combat_target_locked boolean NOT NULL DEFAULT false,
      allow_aoe_player_hit boolean NOT NULL DEFAULT false,
      auto_idle_cultivation boolean NOT NULL DEFAULT true,
      auto_switch_cultivation boolean NOT NULL DEFAULT true,
      sense_qi_active boolean NOT NULL DEFAULT false,
      cultivating_tech_id varchar(120),
      targeting_rules_payload jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
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
      exp bigint,
      exp_to_next bigint,
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
  await ensurePlayerDomainBigintColumnsWithClient(client);
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

async function ensureRecoveryWatermarkColumnsWithClient(client: PoolClient): Promise<void> {
  for (const column of WATERMARK_COLUMNS) {
    await client.query(`
      ALTER TABLE ${PLAYER_RECOVERY_WATERMARK_TABLE}
      ADD COLUMN IF NOT EXISTS ${column} bigint NOT NULL DEFAULT 0
    `);
  }
}

async function ensurePlayerDomainBigintColumnsWithClient(client: PoolClient): Promise<void> {
  for (const [tableName, columns] of Object.entries(PLAYER_DOMAIN_BIGINT_COLUMNS_BY_TABLE)) {
    for (const column of columns) {
      await client.query(`
        ALTER TABLE ${tableName}
        ALTER COLUMN ${column} TYPE bigint USING ${column}::bigint
      `);
    }
  }
}

async function replacePlayerInventoryItems(
  client: PoolClient,
  playerId: string,
  items: unknown[],
): Promise<void> {
  await client.query(`DELETE FROM ${PLAYER_INVENTORY_ITEM_TABLE} WHERE player_id = $1`, [playerId]);
  if (!Array.isArray(items) || items.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let parameterIndex = 1;
  for (let index = 0; index < items.length; index += 1) {
    const entry = asRecord(items[index]);
    const itemId = normalizeRequiredString(entry?.itemId);
    if (!itemId) {
      continue;
    }
    const slotIndex = normalizeOptionalInteger(entry?.slotIndex) ?? index;
    const itemInstanceId =
      normalizeOptionalString(entry?.itemInstanceId)
      ?? `inv:${playerId}:${slotIndex}`;
    const rawPayload = asRecord(entry?.rawPayload);
    const count = normalizeMinimumInteger(entry?.count, rawPayload?.count, 1);
    const persistedPayload = buildPersistedInventoryItemRawPayload({
      itemId,
      count,
      rawPayload,
    });
    placeholders.push(
      `($${parameterIndex}, $${parameterIndex + 1}, $${parameterIndex + 2}, $${parameterIndex + 3}, $${parameterIndex + 4}, $${parameterIndex + 5}::jsonb, now())`,
    );
    values.push(
      itemInstanceId,
      playerId,
      slotIndex,
      itemId,
      count,
      JSON.stringify(persistedPayload),
    );
    parameterIndex += 6;
  }

  if (placeholders.length === 0) {
    return;
  }

  await client.query(
    `
      INSERT INTO ${PLAYER_INVENTORY_ITEM_TABLE}(
        item_instance_id,
        player_id,
        slot_index,
        item_id,
        count,
        raw_payload,
        updated_at
      )
      VALUES ${placeholders.join(',\n')}
    `,
    values,
  );
}

async function replacePlayerWalletRows(
  client: PoolClient,
  playerId: string,
  rows: readonly PlayerWalletUpsertInput[],
  versionSeed: number,
): Promise<void> {
  await client.query(`DELETE FROM ${PLAYER_WALLET_TABLE} WHERE player_id = $1`, [playerId]);
  if (!Array.isArray(rows) || rows.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let parameterIndex = 1;
  for (const row of rows) {
    const walletType = normalizeRequiredString(row?.walletType);
    if (!walletType) {
      continue;
    }
    const balance = normalizeMinimumInteger(row?.balance, 0, 0);
    const frozenBalance = normalizeMinimumInteger(row?.frozenBalance, 0, 0);
    const version = normalizeMinimumInteger(row?.version, versionSeed, 1);
    placeholders.push(
      `($${parameterIndex}, $${parameterIndex + 1}, $${parameterIndex + 2}, $${parameterIndex + 3}, $${parameterIndex + 4}, now())`,
    );
    values.push(playerId, walletType, balance, frozenBalance, version);
    parameterIndex += 5;
  }

  if (placeholders.length === 0) {
    return;
  }

  await client.query(
    `
      INSERT INTO ${PLAYER_WALLET_TABLE}(
        player_id,
        wallet_type,
        balance,
        frozen_balance,
        version,
        updated_at
      )
      VALUES ${placeholders.join(',\n')}
    `,
    values,
  );
}

async function replacePlayerMapUnlocks(
  client: PoolClient,
  playerId: string,
  mapUnlockIds: unknown[],
  unlockedAtSeed: number,
): Promise<void> {
  await replacePlayerMapUnlockRows(client, playerId, mapUnlockIds, unlockedAtSeed);
}

async function replacePlayerMapUnlockRows(
  client: PoolClient,
  playerId: string,
  mapUnlocks: readonly unknown[],
  unlockedAtSeed: number,
): Promise<void> {
  await client.query(`DELETE FROM ${PLAYER_MAP_UNLOCK_TABLE} WHERE player_id = $1`, [playerId]);
  if (!Array.isArray(mapUnlocks) || mapUnlocks.length === 0) {
    return;
  }

  const normalizedMapUnlocks = new Map<string, number>();
  for (const entry of mapUnlocks) {
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
  if (normalizedMapUnlocks.size === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let parameterIndex = 1;
  for (const [mapId, unlockedAt] of normalizedMapUnlocks.entries()) {
    placeholders.push(`($${parameterIndex}, $${parameterIndex + 1}, $${parameterIndex + 2}, now())`);
    values.push(playerId, mapId, unlockedAt);
    parameterIndex += 3;
  }

  await client.query(
    `
      INSERT INTO ${PLAYER_MAP_UNLOCK_TABLE}(
        player_id,
        map_id,
        unlocked_at,
        updated_at
      )
      VALUES ${placeholders.join(',\n')}
    `,
    values,
  );
}

async function replacePlayerMarketStorageItems(
  client: PoolClient,
  playerId: string,
  items: readonly PlayerMarketStorageItemUpsertInput[],
): Promise<void> {
  await client.query(`DELETE FROM ${PLAYER_MARKET_STORAGE_ITEM_TABLE} WHERE player_id = $1`, [playerId]);
  if (!Array.isArray(items) || items.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let parameterIndex = 1;
  for (let index = 0; index < items.length; index += 1) {
    const entry = items[index];
    const itemId = normalizeRequiredString(entry?.itemId);
    if (!itemId) {
      continue;
    }
    const slotIndex = normalizeOptionalInteger(entry?.slotIndex) ?? index;
    const storageItemId =
      normalizeOptionalString(entry?.storageItemId)
      ?? `market_storage:${playerId}:${slotIndex}`;
    const rawPayload = asRecord(entry?.rawPayload);
    const count = normalizeMinimumInteger(entry?.count, rawPayload?.count, 1);
    const enhanceLevel = normalizeOptionalInteger(entry?.enhanceLevel ?? rawPayload?.enhanceLevel ?? rawPayload?.enhancementLevel ?? rawPayload?.level);
    const persistedPayload = {
      ...(rawPayload ?? entry ?? {}),
      itemId,
      count,
      ...(enhanceLevel == null ? {} : { enhanceLevel }),
    };
    placeholders.push(
      `($${parameterIndex}, $${parameterIndex + 1}, $${parameterIndex + 2}, $${parameterIndex + 3}, $${parameterIndex + 4}, $${parameterIndex + 5}, $${parameterIndex + 6}::jsonb, now())`,
    );
    values.push(
      storageItemId,
      playerId,
      slotIndex,
      itemId,
      count,
      enhanceLevel,
      JSON.stringify(persistedPayload),
    );
    parameterIndex += 7;
  }

  if (placeholders.length === 0) {
    return;
  }

  await client.query(
    `
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
      VALUES ${placeholders.join(',\n')}
    `,
    values,
  );
}

async function replacePlayerEquipmentSlots(
  client: PoolClient,
  playerId: string,
  slots: unknown[],
): Promise<void> {
  await client.query(`DELETE FROM ${PLAYER_EQUIPMENT_SLOT_TABLE} WHERE player_id = $1`, [playerId]);
  if (!Array.isArray(slots) || slots.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let parameterIndex = 1;
  for (const slotEntry of slots) {
    const entry = asRecord(slotEntry);
    const slotType = normalizeRequiredString(entry?.slot);
    if (!EQUIP_SLOTS.includes(slotType as (typeof EQUIP_SLOTS)[number])) {
      continue;
    }
    const item = asRecord(entry?.item);
    const itemId = normalizeRequiredString(item?.itemId);
    if (!itemId) {
      continue;
    }
    const itemInstanceId =
      normalizeOptionalString(entry?.itemInstanceId)
      ?? normalizeOptionalString(item?.itemInstanceId)
      ?? `equip:${playerId}:${slotType}`;
    placeholders.push(
      `($${parameterIndex}, $${parameterIndex + 1}, $${parameterIndex + 2}, $${parameterIndex + 3}, $${parameterIndex + 4}::jsonb, now())`,
    );
    values.push(
      playerId,
      slotType,
      itemInstanceId,
      itemId,
      JSON.stringify(item),
    );
    parameterIndex += 5;
  }

  if (placeholders.length === 0) {
    return;
  }

  await client.query(
    `
      INSERT INTO ${PLAYER_EQUIPMENT_SLOT_TABLE}(
        player_id,
        slot_type,
        item_instance_id,
        item_id,
        raw_payload,
        updated_at
      )
      VALUES ${placeholders.join(',\n')}
    `,
    values,
  );
}

async function replacePlayerTechniqueStates(
  client: PoolClient,
  playerId: string,
  rows: TechniqueStateRow[],
): Promise<void> {
  await client.query(`DELETE FROM ${PLAYER_TECHNIQUE_STATE_TABLE} WHERE player_id = $1`, [playerId]);
  if (rows.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let parameterIndex = 1;
  for (const row of rows) {
    placeholders.push(
      `($${parameterIndex}, $${parameterIndex + 1}, $${parameterIndex + 2}, $${parameterIndex + 3}, $${parameterIndex + 4}, $${parameterIndex + 5}, $${parameterIndex + 6}, $${parameterIndex + 7}::jsonb, now())`,
    );
    values.push(
      playerId,
      row.techId,
      row.level,
      row.exp,
      row.expToNext,
      row.realmLv,
      row.skillsEnabled,
      JSON.stringify(row.rawPayload),
    );
    parameterIndex += 8;
  }

  await client.query(
    `
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
      VALUES ${placeholders.join(',\n')}
    `,
    values,
  );
}

async function replacePlayerPersistentBuffStates(
  client: PoolClient,
  playerId: string,
  rows: PersistentBuffStateRow[],
): Promise<void> {
  await client.query(`DELETE FROM ${PLAYER_PERSISTENT_BUFF_STATE_TABLE} WHERE player_id = $1`, [playerId]);
  if (rows.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let parameterIndex = 1;
  for (const row of rows) {
    placeholders.push(
      `($${parameterIndex}, $${parameterIndex + 1}, $${parameterIndex + 2}, $${parameterIndex + 3}, $${parameterIndex + 4}, $${parameterIndex + 5}, $${parameterIndex + 6}, $${parameterIndex + 7}, $${parameterIndex + 8}, $${parameterIndex + 9}, $${parameterIndex + 10}::jsonb, now())`,
    );
    values.push(
      playerId,
      row.buffId,
      row.sourceSkillId,
      row.sourceCasterId,
      row.realmLv,
      row.remainingTicks,
      row.duration,
      row.stacks,
      row.maxStacks,
      row.sustainTicksElapsed,
      JSON.stringify(row.rawPayload),
    );
    parameterIndex += 11;
  }

  await client.query(
    `
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
      VALUES ${placeholders.join(',\n')}
    `,
    values,
  );
}

async function replacePlayerQuestProgressRows(
  client: PoolClient,
  playerId: string,
  rows: QuestProgressRow[],
): Promise<void> {
  await client.query(`DELETE FROM ${PLAYER_QUEST_PROGRESS_TABLE} WHERE player_id = $1`, [playerId]);
  if (rows.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let parameterIndex = 1;
  for (const row of rows) {
    placeholders.push(
      `($${parameterIndex}, $${parameterIndex + 1}, $${parameterIndex + 2}, $${parameterIndex + 3}::jsonb, $${parameterIndex + 4}::jsonb, now())`,
    );
    values.push(
      playerId,
      row.questId,
      row.status,
      JSON.stringify(row.progressPayload),
      JSON.stringify(row.rawPayload),
    );
    parameterIndex += 5;
  }

  await client.query(
    `
      INSERT INTO ${PLAYER_QUEST_PROGRESS_TABLE}(
        player_id,
        quest_id,
        status,
        progress_payload,
        raw_payload,
        updated_at
      )
      VALUES ${placeholders.join(',\n')}
    `,
    values,
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
        combat_target_id,
        combat_target_locked,
        allow_aoe_player_hit,
        auto_idle_cultivation,
        auto_switch_cultivation,
        sense_qi_active,
        cultivating_tech_id,
        targeting_rules_payload,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        auto_battle = EXCLUDED.auto_battle,
        auto_retaliate = EXCLUDED.auto_retaliate,
        auto_battle_stationary = EXCLUDED.auto_battle_stationary,
        auto_battle_targeting_mode = EXCLUDED.auto_battle_targeting_mode,
        retaliate_player_target_id = EXCLUDED.retaliate_player_target_id,
        combat_target_id = EXCLUDED.combat_target_id,
        combat_target_locked = EXCLUDED.combat_target_locked,
        allow_aoe_player_hit = EXCLUDED.allow_aoe_player_hit,
        auto_idle_cultivation = EXCLUDED.auto_idle_cultivation,
        auto_switch_cultivation = EXCLUDED.auto_switch_cultivation,
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
      row.combatTargetId,
      row.combatTargetLocked,
      row.allowAoePlayerHit,
      row.autoIdleCultivation,
      row.autoSwitchCultivation,
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
  await client.query(`DELETE FROM ${PLAYER_AUTO_BATTLE_SKILL_TABLE} WHERE player_id = $1`, [playerId]);
  if (rows.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let parameterIndex = 1;
  for (const row of rows) {
    placeholders.push(
      `($${parameterIndex}, $${parameterIndex + 1}, $${parameterIndex + 2}, $${parameterIndex + 3}, $${parameterIndex + 4}, now())`,
    );
    values.push(playerId, row.skillId, row.enabled, row.skillEnabled, row.autoBattleOrder);
    parameterIndex += 5;
  }

  await client.query(
    `
      INSERT INTO ${PLAYER_AUTO_BATTLE_SKILL_TABLE}(
        player_id,
        skill_id,
        enabled,
        skill_enabled,
        auto_battle_order,
        updated_at
      )
      VALUES ${placeholders.join(',\n')}
    `,
    values,
  );
}

async function replacePlayerAutoUseItemRules(
  client: PoolClient,
  playerId: string,
  rows: AutoUseItemRuleRow[],
): Promise<void> {
  await client.query(`DELETE FROM ${PLAYER_AUTO_USE_ITEM_RULE_TABLE} WHERE player_id = $1`, [playerId]);
  if (rows.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let parameterIndex = 1;
  for (const row of rows) {
    placeholders.push(`($${parameterIndex}, $${parameterIndex + 1}, $${parameterIndex + 2}::jsonb, now())`);
    values.push(playerId, row.itemId, JSON.stringify(row.conditionPayload));
    parameterIndex += 3;
  }

  await client.query(
    `
      INSERT INTO ${PLAYER_AUTO_USE_ITEM_RULE_TABLE}(
        player_id,
        item_id,
        condition_payload,
        updated_at
      )
      VALUES ${placeholders.join(',\n')}
    `,
    values,
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
      normalizeMinimumInteger(row.exp, 0, 0),
      normalizeMinimumInteger(row.expToNext, 1, 1),
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
  await client.query(`DELETE FROM ${PLAYER_PROFESSION_STATE_TABLE} WHERE player_id = $1`, [playerId]);
  if (rows.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let parameterIndex = 1;
  for (const row of rows) {
    placeholders.push(
      `($${parameterIndex}, $${parameterIndex + 1}, $${parameterIndex + 2}, $${parameterIndex + 3}, $${parameterIndex + 4}, now())`,
    );
    values.push(playerId, row.professionType, row.level, row.exp, row.expToNext);
    parameterIndex += 5;
  }
  await client.query(
    `
      INSERT INTO ${PLAYER_PROFESSION_STATE_TABLE}(
        player_id,
        profession_type,
        level,
        exp,
        exp_to_next,
        updated_at
      )
      VALUES ${placeholders.join(',\n')}
    `,
    values,
  );
}

async function replacePlayerAlchemyPresets(
  client: PoolClient,
  playerId: string,
  rows: AlchemyPresetRow[],
): Promise<void> {
  await client.query(`DELETE FROM ${PLAYER_ALCHEMY_PRESET_TABLE} WHERE player_id = $1`, [playerId]);
  if (rows.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let parameterIndex = 1;
  for (const row of rows) {
    placeholders.push(
      `($${parameterIndex}, $${parameterIndex + 1}, $${parameterIndex + 2}, $${parameterIndex + 3}, $${parameterIndex + 4}::jsonb, now())`,
    );
    values.push(row.presetId, playerId, row.recipeId, row.name, JSON.stringify(row.ingredients));
    parameterIndex += 5;
  }
  await client.query(
    `
      INSERT INTO ${PLAYER_ALCHEMY_PRESET_TABLE}(
        preset_id,
        player_id,
        recipe_id,
        name,
        ingredients_payload,
        updated_at
      )
      VALUES ${placeholders.join(',\n')}
    `,
    values,
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
  await client.query(`DELETE FROM ${PLAYER_ENHANCEMENT_RECORD_TABLE} WHERE player_id = $1`, [playerId]);
  if (rows.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let parameterIndex = 1;
  for (const row of rows) {
    placeholders.push(
      `($${parameterIndex}, $${parameterIndex + 1}, $${parameterIndex + 2}, $${parameterIndex + 3}, $${parameterIndex + 4}::jsonb, $${parameterIndex + 5}, $${parameterIndex + 6}, $${parameterIndex + 7}, $${parameterIndex + 8}, $${parameterIndex + 9}, $${parameterIndex + 10}, $${parameterIndex + 11}, now())`,
    );
    values.push(
      row.recordId,
      playerId,
      row.itemId,
      row.highestLevel,
      JSON.stringify(row.levelsPayload),
      row.actionStartedAt,
      row.actionEndedAt,
      row.startLevel,
      row.initialTargetLevel,
      row.desiredTargetLevel,
      row.protectionStartLevel,
      row.status,
    );
    parameterIndex += 12;
  }

  await client.query(
    `
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
      VALUES ${placeholders.join(',\n')}
    `,
    values,
  );
}

async function replacePlayerLogbookMessages(
  client: PoolClient,
  playerId: string,
  rows: unknown[],
): Promise<void> {
  await client.query(`DELETE FROM ${PLAYER_LOGBOOK_MESSAGE_TABLE} WHERE player_id = $1`, [playerId]);
  if (!Array.isArray(rows) || rows.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let parameterIndex = 1;
  for (const row of rows) {
    const entry = asRecord(row);
    const messageId = normalizeRequiredString(entry?.id ?? entry?.messageId);
    const kind = normalizeRequiredString(entry?.kind);
    const text = typeof entry?.text === 'string' ? entry.text : '';
    if (!messageId || !kind || !text) {
      continue;
    }
    placeholders.push(
      `($${parameterIndex}, $${parameterIndex + 1}, $${parameterIndex + 2}, $${parameterIndex + 3}, $${parameterIndex + 4}, $${parameterIndex + 5}, $${parameterIndex + 6}, now())`,
    );
    values.push(
      messageId,
      playerId,
      kind,
      text,
      normalizeOptionalString(entry?.from ?? entry?.fromName),
      normalizeOptionalInteger(entry?.at ?? entry?.occurredAt) ?? Date.now(),
      normalizeOptionalInteger(entry?.ackedAt),
    );
    parameterIndex += 7;
  }

  if (placeholders.length === 0) {
    return;
  }

  await client.query(
    `
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
      VALUES ${placeholders.join(',\n')}
    `,
    values,
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
  const insertValues: unknown[] = [playerId, ...entries.map(([, value]) => Math.max(0, Math.trunc(value))),];
  const updatedAtPlaceholder = `$${insertValues.length + 1}`;
  insertValues.push(new Date().toISOString());

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
      exp: normalizeOptionalInteger(normalized?.exp),
      expToNext: normalizeOptionalInteger(normalized?.expToNext),
      realmLv: normalizeOptionalInteger(normalized?.realmLv),
      skillsEnabled: normalized?.skillsEnabled !== false,
      rawPayload: { ...normalized, techId },
    });
  }
  return rows;
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
    combatTargetId: normalizeOptionalString(combat.combatTargetId),
    combatTargetLocked: combat.combatTargetLocked === true,
    allowAoePlayerHit: combat.allowAoePlayerHit === true,
    autoIdleCultivation: combat.autoIdleCultivation === true,
    autoSwitchCultivation: combat.autoSwitchCultivation === true,
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
      exp: normalizeOptionalInteger(alchemy.exp),
      expToNext: normalizeOptionalInteger(alchemy.expToNext),
    });
  }

  const gather = asRecord(progression?.gatherSkill);
  if (gather) {
    rows.push({
      professionType: 'gather',
      level: normalizeMinimumInteger(gather.level, 1, 1),
      exp: normalizeOptionalInteger(gather.exp),
      expToNext: normalizeOptionalInteger(gather.expToNext),
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
    exp: normalizeOptionalInteger(enhancement?.exp),
    expToNext: normalizeOptionalInteger(enhancement?.expToNext),
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

  const alchemyJob = asRecord(progression?.alchemyJob);
  if (alchemyJob && Object.keys(alchemyJob).length > 0) {
    const startedAt = normalizeOptionalInteger(alchemyJob.startedAt) ?? versionSeed;
    const jobRunId =
      normalizeOptionalString(alchemyJob.jobRunId)
      ?? `job:${playerId}:alchemy:${startedAt}`;
    const jobVersion = Math.max(
      1,
      Math.trunc(
        Number(
          normalizeOptionalInteger(alchemyJob.jobVersion)
          ?? versionSeed,
        ),
      ),
    );
    return {
      jobRunId,
      jobType: 'alchemy',
      status: normalizeJobStatus(alchemyJob),
      phase: normalizeOptionalString(alchemyJob.phase) ?? 'running',
      startedAt,
      finishedAt: normalizeOptionalInteger(alchemyJob.finishedAt),
      pausedTicks: normalizeMinimumInteger(alchemyJob.pausedTicks, 0, 0),
      totalTicks: normalizeMinimumInteger(alchemyJob.totalTicks, 0, 0),
      remainingTicks: normalizeMinimumInteger(alchemyJob.remainingTicks, 0, 0),
      successRate: normalizeOptionalNumber(alchemyJob.successRate) ?? 0,
      speedRate: normalizeOptionalNumber(alchemyJob.totalSpeedRate) ?? 1,
      jobVersion,
      detailJson: {
        ...alchemyJob,
        jobRunId,
        jobVersion,
      },
    };
  }

  return null;
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
  const bonusEntriesPayload = Array.isArray(snapshot.runtimeBonuses) ? snapshot.runtimeBonuses : [];
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
  const snapshot = {
    ...starterSnapshot,
    placement: {
      ...starterSnapshot.placement,
    },
    worldPreference: {
      ...(starterSnapshot.worldPreference ?? { linePreset: 'peaceful' }),
    },
    progression: {
      ...starterSnapshot.progression,
      bodyTraining: starterSnapshot.progression.bodyTraining
        ? { ...starterSnapshot.progression.bodyTraining }
        : null,
      alchemyPresets: [...starterSnapshot.progression.alchemyPresets],
      alchemyJob: starterSnapshot.progression.alchemyJob ? { ...starterSnapshot.progression.alchemyJob } : null,
      enhancementJob: starterSnapshot.progression.enhancementJob
        ? { ...starterSnapshot.progression.enhancementJob }
        : null,
      enhancementRecords: Array.isArray(starterSnapshot.progression.enhancementRecords)
        ? starterSnapshot.progression.enhancementRecords.map((entry) => cloneJsonValue(entry))
        : [],
    },
    attrState: starterSnapshot.attrState
      ? {
          baseAttrs: asRecord(starterSnapshot.attrState.baseAttrs)
            ? { ...(starterSnapshot.attrState.baseAttrs as Record<string, unknown>) }
            : null,
          revealedBreakthroughRequirementIds: normalizeStringArray(
            starterSnapshot.attrState.revealedBreakthroughRequirementIds,
          ),
        }
      : undefined,
    inventory: {
      ...starterSnapshot.inventory,
      items: [...starterSnapshot.inventory.items],
    },
    equipment: {
      ...starterSnapshot.equipment,
      slots: Array.isArray(starterSnapshot.equipment?.slots)
        ? starterSnapshot.equipment.slots.map((entry) => ({
            ...(typeof entry === 'object' && entry !== null ? entry : {}),
          }))
        : [],
    },
    techniques: {
      ...starterSnapshot.techniques,
      techniques: Array.isArray(starterSnapshot.techniques?.techniques)
        ? starterSnapshot.techniques.techniques.map((entry) => ({
            ...(typeof entry === 'object' && entry !== null ? entry : {}),
          }))
        : [],
    },
    buffs: {
      ...starterSnapshot.buffs,
      buffs: Array.isArray(starterSnapshot.buffs?.buffs)
        ? starterSnapshot.buffs.buffs.map((entry) => cloneJsonValue(entry))
        : [],
    },
    quests: {
      ...starterSnapshot.quests,
      entries: Array.isArray(starterSnapshot.quests?.entries)
        ? starterSnapshot.quests.entries.map((entry) => ({
            ...(typeof entry === 'object' && entry !== null ? entry : {}),
          }))
        : [],
    },
    combat: {
      ...starterSnapshot.combat,
      autoUsePills: normalizeJsonArray(starterSnapshot.combat?.autoUsePills),
      combatTargetingRules: asRecord(starterSnapshot.combat?.combatTargetingRules)
        ? { ...(starterSnapshot.combat?.combatTargetingRules as Record<string, unknown>) }
        : undefined,
      autoBattleSkills: Array.isArray(starterSnapshot.combat?.autoBattleSkills)
        ? starterSnapshot.combat.autoBattleSkills.map((entry) => ({
            ...(typeof entry === 'object' && entry !== null ? entry : {}),
          }))
        : [],
    },
    pendingLogbookMessages: [...starterSnapshot.pendingLogbookMessages],
    runtimeBonuses: normalizeRuntimeBonuses(starterSnapshot.runtimeBonuses),
    unlockedMapIds: [...starterSnapshot.unlockedMapIds],
    wallet: {
      balances: normalizeProjectedWalletRows(domains.walletRows) ?? [],
    },
    marketStorage: {
      items: normalizeProjectedMarketStorageRows(domains.marketStorageItems) ?? [],
    },
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
  applyProjectedEquipment(snapshot, domains.equipmentSlots);
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
  snapshot.inventory = {
    ...snapshot.inventory,
    items: rows.map((row) => hydratePersistedInventoryItem({
      itemId: row.item_id,
      count: row.count,
      rawPayload: decodeJsonValue(row.raw_payload),
    }, contentTemplateRepository)),
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
            ? { ...(existingRecord.item as Record<string, unknown>) }
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
    const itemId = normalizeOptionalString(rawPayload?.itemId) ?? normalizeOptionalString(row.item_id);
    slotMap.set(normalizedSlotType, {
      slot: normalizedSlotType,
      item: itemId
        ? {
            ...(rawPayload ?? {}),
            itemId,
            count: normalizeMinimumInteger(rawPayload?.count, 1, 1),
            equipSlot: normalizeOptionalString(rawPayload?.equipSlot) ?? normalizedSlotType,
          }
        : null,
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
        exp: normalizeOptionalInteger(rawPayload?.exp ?? row.exp) ?? 0,
        expToNext: normalizeOptionalInteger(rawPayload?.expToNext ?? row.exp_to_next) ?? 0,
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
    combatTargetId: normalizeOptionalString(row.combat_target_id),
    combatTargetLocked: row.combat_target_locked === true,
    allowAoePlayerHit: row.allow_aoe_player_hit === true,
    autoIdleCultivation: row.auto_idle_cultivation === true,
    autoSwitchCultivation: row.auto_switch_cultivation === true,
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
    hp: normalizeMinimumInteger(row.hp, snapshot.vitals.hp, 0),
    maxHp: normalizeMinimumInteger(row.max_hp, snapshot.vitals.maxHp, 1),
    qi: normalizeMinimumInteger(row.qi, snapshot.vitals.qi, 0),
    maxQi: normalizeMinimumInteger(row.max_qi, snapshot.vitals.maxQi, 0),
  };
}

function applyProjectedProgressionCore(
  snapshot: PersistedPlayerSnapshot,
  row: PlayerProgressionCoreLoadRow | null,
): void {
  if (!row) {
    return;
  }
  snapshot.progression.foundation = normalizeMinimumInteger(
    row.foundation,
    snapshot.progression.foundation,
    0,
  );
  snapshot.progression.combatExp = normalizeMinimumInteger(
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
    exp: normalizeMinimumInteger(row.exp, snapshot.progression.bodyTraining?.exp ?? 0, 0),
    expToNext: normalizeMinimumInteger(
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
      exp: normalizeOptionalInteger(row.exp),
      expToNext: normalizeOptionalInteger(row.exp_to_next),
    };
    if (professionType === 'alchemy') {
      snapshot.progression.alchemySkill = state;
    } else if (professionType === 'gather') {
      snapshot.progression.gatherSkill = state;
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
    snapshot.progression.enhancementJob = normalizedJob;
    snapshot.progression.alchemyJob = null;
    return;
  }
  snapshot.progression.alchemyJob = normalizedJob;
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
  if (!source) {
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

function cloneJsonValue<T>(value: T): T {
  const decoded = decodeJsonValue(value);
  if (Array.isArray(decoded)) {
    return decoded.map((entry) => cloneJsonValue(entry)) as T;
  }
  const normalized = asRecord(decoded);
  if (normalized) {
    return Object.fromEntries(
      Object.entries(normalized).map(([key, entry]) => [key, cloneJsonValue(entry)]),
    ) as T;
  }
  return decoded as T;
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

function normalizeMinimumInteger(value: unknown, fallback: unknown, minimum: number): number {
  return Math.max(minimum, normalizeIntegerWithFallback(value, fallback));
}

function normalizeVersionSeed(value: unknown): number {
  if (value == null || value === '') {
    return Math.max(1, Math.trunc(Date.now()));
  }
  const numeric = Number(value);
  return Math.max(1, Math.trunc(Number.isFinite(numeric) ? numeric : Date.now()));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

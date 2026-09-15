/**
 * player-domain-persistence.helpers.ts
 *
 * 从 player-domain-persistence.service.ts 拆出的低级工具函数：
 * schema 初始化、投影应用、规范化、查询工具等。
 * 不包含 @Injectable provider，不修改持久化语义。
 */
import type { Pool, PoolClient } from 'pg';
import { Logger } from '@nestjs/common';
import type {
  PersistedPlayerSnapshot,
  LoadedPlayerDomains,
  PlayerSnapshotProjectionDomainWriteOptions,
  PlayerPresenceUpsertInput,
  PlayerWalletUpsertInput,
  PlayerWorldAnchorUpsertInput,
  PlayerPositionCheckpointUpsertInput,
  PlayerVitalsUpsertInput,
  PlayerProgressionCoreUpsertInput,
  PlayerInventoryItemUpsertInput,
  PlayerMarketStorageItemUpsertInput,
  PlayerMapUnlockUpsertInput,
  PlayerEquipmentSlotUpsertInput,
  PlayerArtifactSlotUpsertInput,
  PlayerLogbookMessageUpsertInput,
  PlayerOfflineGainSessionRecord,
  PlayerTechniqueActivityQueueUpsertInput,
  PlayerDomainWriteOptions,
  PlayerSnapshotProjectionDomainBatchEntry,
  PersistedInventoryRow,
  AlchemyPresetRow,
  ActiveJobRow,
  TechniqueActivityQueueRow,
  AttrStateRow,
  TechniqueStateRow,
  TechniqueComprehensionRow,
  PersistentBuffStateRow,
  QuestProgressRow,
  CombatPreferencesRow,
  AutoBattleSkillRow,
  AutoUseItemRuleRow,
  ProfessionStateRow,
  EnhancementRecordRow,
  PlayerWorldAnchorLoadRow,
  PlayerPositionCheckpointLoadRow,
  PlayerVitalsLoadRow,
  PlayerProgressionCoreLoadRow,
  PlayerAttrStateLoadRow,
  PlayerBodyTrainingLoadRow,
  PlayerWalletLoadRow,
  PlayerSectMembershipLoadRow,
  PlayerInventoryItemLoadRow,
  PlayerMarketStorageItemLoadRow,
  PlayerMapUnlockLoadRow,
  PlayerEquipmentSlotLoadRow,
  PlayerArtifactSlotLoadRow,
  PlayerTechniqueStateLoadRow,
  PlayerTechniqueComprehensionLoadRow,
  PlayerPersistentBuffStateLoadRow,
  PlayerQuestProgressLoadRow,
  PlayerCombatPreferencesLoadRow,
  PlayerAutoBattleSkillLoadRow,
  PlayerAutoUseItemRuleLoadRow,
  PlayerProfessionStateLoadRow,
  PlayerAlchemyPresetLoadRow,
  PlayerActiveJobLoadRow,
  PlayerTechniqueActivityQueueLoadRow,
  PlayerEnhancementRecordLoadRow,
  PlayerLogbookMessageLoadRow,
  PlayerRecoveryWatermarkLoadRow,
} from './player-domain-persistence.service';
import type { TechniqueTemplateRepositoryPort } from './player-domain-persistence.service';
import { nextPlayerPersistenceVersion } from './player-domain-persistence.service';
import type {
  OfflineGainReportView,
  PlayerStatisticPeriodTotalView,
} from '@mud/shared';
import {
  EQUIP_SLOTS,
  ARTIFACT_SLOTS,
  resolvePlayerFacingContentName,
  normalizeCombatAttackIntensity,
  DEFAULT_COMBAT_ATTACK_INTENSITY,
  isCreatedTechniqueId,
  TechniqueRealm,
  DUNGEON_MAX_STAMINA,
} from '@mud/shared';
import { ensureBigintColumnsWithClient, ensureDoubleColumnsWithClient } from './schema-bigint-migration';
import type { InventoryItemTemplateRepository } from './inventory-item-persistence';
import { hydratePersistedInventoryItem, hydratePersistedEquipmentItem } from './inventory-item-persistence';

export const PLAYER_PRESENCE_TABLE = 'player_presence';
export const PLAYER_WALLET_TABLE = 'player_wallet';
export const playerDomainModuleLogger = new Logger('PlayerDomainPersistence:LegacyCompat');
export const PLAYER_SECT_MEMBERSHIP_TABLE = 'player_sect_membership';
export const PLAYER_WORLD_ANCHOR_TABLE = 'player_world_anchor';
export const PLAYER_POSITION_CHECKPOINT_TABLE = 'player_position_checkpoint';
export const PLAYER_VITALS_TABLE = 'player_vitals';
export const PLAYER_PROGRESSION_CORE_TABLE = 'player_progression_core';
export const PLAYER_ATTR_STATE_TABLE = 'player_attr_state';
export const PLAYER_BODY_TRAINING_STATE_TABLE = 'player_body_training_state';
export const PLAYER_INVENTORY_ITEM_TABLE = 'player_inventory_item';
export const PLAYER_MARKET_STORAGE_ITEM_TABLE = 'player_market_storage_item';
export const PLAYER_MAP_UNLOCK_TABLE = 'player_map_unlock';
export const PLAYER_EQUIPMENT_SLOT_TABLE = 'player_equipment_slot';
export const PLAYER_ARTIFACT_SLOT_TABLE = 'player_artifact_slot';
export const PLAYER_TECHNIQUE_STATE_TABLE = 'player_technique_state';
export const PLAYER_TECHNIQUE_COMPREHENSION_TABLE = 'player_technique_comprehension';
export const PLAYER_PERSISTENT_BUFF_STATE_TABLE = 'player_persistent_buff_state';
export const PLAYER_QUEST_PROGRESS_TABLE = 'player_quest_progress';
export const PLAYER_COMBAT_PREFERENCES_TABLE = 'player_combat_preferences';
export const PLAYER_AUTO_BATTLE_SKILL_TABLE = 'player_auto_battle_skill';
export const PLAYER_AUTO_USE_ITEM_RULE_TABLE = 'player_auto_use_item_rule';
export const PLAYER_PROFESSION_STATE_TABLE = 'player_profession_state';
export const PLAYER_ALCHEMY_PRESET_TABLE = 'player_alchemy_preset';
export const PLAYER_ACTIVE_JOB_TABLE = 'player_active_job';
export const PLAYER_TECHNIQUE_ACTIVITY_QUEUE_TABLE = 'player_technique_activity_queue';
export const PLAYER_ENHANCEMENT_RECORD_TABLE = 'player_enhancement_record';
export const PLAYER_LOGBOOK_MESSAGE_TABLE = 'player_logbook_message';
export const PLAYER_OFFLINE_GAIN_SESSION_TABLE = 'player_offline_gain_session';
export const PLAYER_OFFLINE_GAIN_REPORT_TABLE = 'player_offline_gain_report';
export const PLAYER_STATISTIC_DAY_TOTAL_TABLE = 'player_statistic_day_total';
export const PLAYER_RECOVERY_WATERMARK_TABLE = 'player_recovery_watermark';
export const PLAYER_DOMAIN_BIGINT_COLUMNS_BY_TABLE = {
  [PLAYER_WORLD_ANCHOR_TABLE]: ['respawn_x', 'respawn_y', 'last_safe_x', 'last_safe_y'],
  [PLAYER_POSITION_CHECKPOINT_TABLE]: ['x', 'y', 'facing'],
  [PLAYER_PROGRESSION_CORE_TABLE]: ['bone_age_base_years', 'lifespan_years', 'stamina', 'stamina_updated_at'],
  [PLAYER_BODY_TRAINING_STATE_TABLE]: ['level'],
  [PLAYER_MARKET_STORAGE_ITEM_TABLE]: ['slot_index', 'count', 'enhance_level'],
  [PLAYER_TECHNIQUE_STATE_TABLE]: ['level', 'realm_lv'],
  [PLAYER_TECHNIQUE_COMPREHENSION_TABLE]: ['realm_lv', 'created_at_tick', 'updated_at_tick'],
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
export const PLAYER_DOMAIN_DOUBLE_COLUMNS_BY_TABLE = {
  [PLAYER_VITALS_TABLE]: ['hp', 'max_hp', 'qi', 'max_qi'],
  [PLAYER_PROGRESSION_CORE_TABLE]: ['foundation', 'root_foundation', 'combat_exp'],
  [PLAYER_ARTIFACT_SLOT_TABLE]: ['qi', 'max_qi'],
  [PLAYER_BODY_TRAINING_STATE_TABLE]: ['exp', 'exp_to_next'],
  [PLAYER_TECHNIQUE_STATE_TABLE]: ['exp', 'exp_to_next'],
  [PLAYER_TECHNIQUE_COMPREHENSION_TABLE]: ['progress', 'required_progress'],
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
export const INVENTORY_TEMP_SLOT_BASE = 1_000_000_000_000;

export const PLAYER_DOMAIN_PROJECTED_TABLES = [
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
] as const;

export const PLAYER_SNAPSHOT_PROJECTABLE_DIRTY_DOMAINS = [
  'world_anchor',
  'position_checkpoint',
  'vitals',
  'progression',
  'attr',
  'wallet',
  'sect_membership',
  'market_storage',
  'inventory',
  'map_unlock',
  'equipment',
  'artifact',
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

export const WATERMARK_COLUMNS = [
  'identity_version',
  'presence_version',
  'anchor_version',
  'position_checkpoint_version',
  'vitals_version',
  'progression_version',
  'attr_version',
  'wallet_version',
  'sect_membership_version',
  'inventory_version',
  'market_storage_version',
  'equipment_version',
  'artifact_version',
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

export type RecoveryWatermarkColumn = (typeof WATERMARK_COLUMNS)[number];
export type RecoveryWatermarkPatch = Partial<Record<RecoveryWatermarkColumn, number>>;

/** 能证明角色分域已经建立的水位；identity/presence/mail 单独存在时不代表角色快照完整。 */
export const PLAYER_PROJECTED_STATE_WATERMARK_COLUMNS: readonly RecoveryWatermarkColumn[] = [
  'anchor_version',
  'position_checkpoint_version',
  'vitals_version',
  'progression_version',
  'attr_version',
  'body_training_version',
  'wallet_version',
  'sect_membership_version',
  'market_storage_version',
  'inventory_version',
  'map_unlock_version',
  'equipment_version',
  'artifact_version',
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
];

export const PLAYER_PROJECTION_WATERMARK_COLUMN_BY_DOMAIN: Readonly<Record<string, RecoveryWatermarkColumn>> = {
  world_anchor: 'anchor_version',
  position_checkpoint: 'position_checkpoint_version',
  vitals: 'vitals_version',
  progression: 'progression_version',
  attr: 'attr_version',
  wallet: 'wallet_version',
  sect_membership: 'sect_membership_version',
  market_storage: 'market_storage_version',
  body_training: 'body_training_version',
  inventory: 'inventory_version',
  map_unlock: 'map_unlock_version',
  equipment: 'equipment_version',
  artifact: 'artifact_version',
  technique: 'technique_version',
  buff: 'buff_version',
  quest: 'quest_version',
  combat_pref: 'combat_pref_version',
  auto_battle_skill: 'auto_battle_skill_version',
  auto_use_item_rule: 'auto_use_item_rule_version',
  profession: 'profession_version',
  alchemy_preset: 'alchemy_preset_version',
  active_job: 'active_job_version',
  enhancement_record: 'enhancement_record_version',
  logbook: 'logbook_version',
};


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
    CREATE TABLE IF NOT EXISTS ${PLAYER_SECT_MEMBERSHIP_TABLE} (
      player_id varchar(100) PRIMARY KEY,
      sect_id varchar(180),
      updated_at_ms bigint NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS player_sect_membership_sect_idx
    ON ${PLAYER_SECT_MEMBERSHIP_TABLE}(sect_id)
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
      stamina bigint NOT NULL DEFAULT 240,
      stamina_updated_at bigint NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_PROGRESSION_CORE_TABLE}
    ADD COLUMN IF NOT EXISTS root_foundation double precision NOT NULL DEFAULT 0
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_PROGRESSION_CORE_TABLE}
    ADD COLUMN IF NOT EXISTS stamina bigint NOT NULL DEFAULT 240
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_PROGRESSION_CORE_TABLE}
    ADD COLUMN IF NOT EXISTS stamina_updated_at bigint NOT NULL DEFAULT 0
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
    CREATE TABLE IF NOT EXISTS ${PLAYER_ARTIFACT_SLOT_TABLE} (
      player_id varchar(100) NOT NULL,
      slot_type varchar(32) NOT NULL,
      unlocked boolean NOT NULL DEFAULT false,
      enabled boolean NOT NULL DEFAULT true,
      qi double precision NOT NULL DEFAULT 0,
      max_qi double precision NOT NULL DEFAULT 0,
      item_instance_id varchar(180),
      item_id varchar(120),
      raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(player_id, slot_type),
      UNIQUE(item_instance_id)
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS player_artifact_slot_player_idx
    ON ${PLAYER_ARTIFACT_SLOT_TABLE}(player_id)
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
    CREATE TABLE IF NOT EXISTS ${PLAYER_TECHNIQUE_COMPREHENSION_TABLE} (
      player_id varchar(100) NOT NULL,
      tech_id varchar(120) NOT NULL,
      source_kind varchar(24) NOT NULL,
      progress double precision NOT NULL DEFAULT 0,
      required_progress double precision NOT NULL DEFAULT 1,
      realm_lv bigint,
      grade varchar(32),
      category varchar(32),
      creator_player_id varchar(100),
      self_comprehension_allowed boolean NOT NULL DEFAULT true,
      created_at_tick bigint NOT NULL DEFAULT 0,
      updated_at_tick bigint NOT NULL DEFAULT 0,
      active_transfer_job_id varchar(180),
      active_transfer_teacher_id varchar(100),
      raw_payload jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(player_id, tech_id)
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS player_technique_comprehension_player_idx
    ON ${PLAYER_TECHNIQUE_COMPREHENSION_TABLE}(player_id, realm_lv ASC, tech_id ASC)
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_TECHNIQUE_COMPREHENSION_TABLE}
      ADD COLUMN IF NOT EXISTS self_comprehension_allowed boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS created_at_tick bigint NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS updated_at_tick bigint NOT NULL DEFAULT 0
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
      combat_attack_intensity integer NOT NULL DEFAULT 10,
      sense_qi_active boolean NOT NULL DEFAULT false,
      cultivation_active boolean NOT NULL DEFAULT true,
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
    ALTER TABLE ${PLAYER_COMBAT_PREFERENCES_TABLE}
    ADD COLUMN IF NOT EXISTS combat_attack_intensity integer NOT NULL DEFAULT 10
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_COMBAT_PREFERENCES_TABLE}
    ADD COLUMN IF NOT EXISTS cultivation_active boolean NOT NULL DEFAULT true
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
    CREATE TABLE IF NOT EXISTS ${PLAYER_TECHNIQUE_ACTIVITY_QUEUE_TABLE} (
      player_id varchar(100) NOT NULL,
      queue_id varchar(180) NOT NULL,
      kind varchar(32) NOT NULL,
      state varchar(32) NOT NULL,
      label varchar(160),
      target_label varchar(160),
      sleep_reason varchar(240),
      retry_after_ticks bigint,
      created_at bigint NOT NULL,
      queue_order bigint NOT NULL DEFAULT 0,
      payload_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
      cancel_ref_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
      detail_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(player_id, queue_id)
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS player_technique_activity_queue_player_idx
    ON ${PLAYER_TECHNIQUE_ACTIVITY_QUEUE_TABLE}(player_id, queue_order ASC, created_at ASC)
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${PLAYER_ENHANCEMENT_RECORD_TABLE} (
      record_id varchar(180) PRIMARY KEY,
      player_id varchar(100) NOT NULL,
      item_id varchar(160) NOT NULL,
      item_name varchar(240),
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
    ALTER TABLE ${PLAYER_ENHANCEMENT_RECORD_TABLE}
    ADD COLUMN IF NOT EXISTS item_name varchar(240)
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
      structured_payload jsonb,
      structured_group_payload jsonb,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(player_id, message_id)
    )
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_LOGBOOK_MESSAGE_TABLE}
    ADD COLUMN IF NOT EXISTS structured_payload jsonb
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_LOGBOOK_MESSAGE_TABLE}
    ADD COLUMN IF NOT EXISTS structured_group_payload jsonb
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
      sect_membership_version bigint NOT NULL DEFAULT 0,
      inventory_version bigint NOT NULL DEFAULT 0,
      market_storage_version bigint NOT NULL DEFAULT 0,
      equipment_version bigint NOT NULL DEFAULT 0,
      artifact_version bigint NOT NULL DEFAULT 0,
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

export async function ensurePlayerPresenceColumnsWithClient(client: PoolClient): Promise<void> {
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

export async function hasColumn(client: PoolClient, tableName: string, columnName: string): Promise<boolean> {
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

export async function ensureRecoveryWatermarkColumnsWithClient(client: PoolClient): Promise<void> {
  for (const column of WATERMARK_COLUMNS) {
    await client.query(`
      ALTER TABLE ${PLAYER_RECOVERY_WATERMARK_TABLE}
      ADD COLUMN IF NOT EXISTS ${column} bigint NOT NULL DEFAULT 0
    `);
  }
}

export async function ensurePlayerDomainBigintColumnsWithClient(client: PoolClient): Promise<void> {
  await ensureBigintColumnsWithClient(client, PLAYER_DOMAIN_BIGINT_COLUMNS_BY_TABLE);
}

export async function ensurePlayerDomainDoubleColumnsWithClient(client: PoolClient): Promise<void> {
  await ensureDoubleColumnsWithClient(client, PLAYER_DOMAIN_DOUBLE_COLUMNS_BY_TABLE);
}

export function hasProjectedPlayerDomainState(domains: Omit<LoadedPlayerDomains, 'hasProjectedState'>): boolean {
  if (
    domains.worldAnchor
    || domains.positionCheckpoint
    || domains.vitals
    || domains.progressionCore
    || domains.attrState
    || domains.bodyTraining
    || domains.sectMembership
    || domains.activeJob
  ) {
    return true;
  }
  if (
    domains.walletRows.length > 0
    || domains.inventoryItems.length > 0
    || domains.marketStorageItems.length > 0
    || domains.mapUnlocks.length > 0
    || domains.equipmentSlots.length > 0
    || domains.artifactSlots.length > 0
    || domains.techniqueStates.length > 0
    || domains.techniqueComprehensions.length > 0
    || domains.persistentBuffStates.length > 0
    || domains.questProgressRows.length > 0
    || domains.combatPreferences !== null
    || domains.autoBattleSkills.length > 0
    || domains.autoUseItemRules.length > 0
    || domains.professionStates.length > 0
    || domains.alchemyPresets.length > 0
    || domains.techniqueActivityQueue.length > 0
    || domains.enhancementRecords.length > 0
    || domains.logbookMessages.length > 0
  ) {
    return true;
  }
  const watermark = domains.recoveryWatermark;
  if (!watermark) {
    return false;
  }
  return PLAYER_PROJECTED_STATE_WATERMARK_COLUMNS.some(
    (column) => (normalizeOptionalInteger(watermark[column]) ?? 0) > 0,
  );
}

export function hasAnyLoadedPlayerDomainState(domains: Omit<LoadedPlayerDomains, 'hasProjectedState'>): boolean {
  if (hasProjectedPlayerDomainState(domains)) {
    return true;
  }
  const watermark = domains.recoveryWatermark;
  if (!watermark) {
    return false;
  }
  return false;
}

/** 用 watermark 区分“集合真源已合法清空”和“该域从未投影”。 */
export function isProjectedCollectionAuthoritative(
  watermark: PlayerRecoveryWatermarkLoadRow | null,
  column: RecoveryWatermarkColumn,
  rows: readonly unknown[],
): boolean {
  return rows.length > 0 || (normalizeOptionalInteger(watermark?.[column]) ?? 0) > 0;
}

export function buildProjectedSnapshotFromDomains(
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
  snapshot.artifacts = {
    revision: Math.max(1, Math.trunc(Number(snapshot.artifacts?.revision ?? 1) || 1)),
    slots: Array.isArray(snapshot.artifacts?.slots) ? snapshot.artifacts.slots : [],
  };
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
  if (domains.sectMembership) {
    snapshot.sectId = normalizeOptionalString(domains.sectMembership.sect_id);
  }
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
  applyProjectedInventory(
    snapshot,
    domains.inventoryItems,
    contentTemplateRepository,
    isProjectedCollectionAuthoritative(domains.recoveryWatermark, 'inventory_version', domains.inventoryItems),
  );
  applyProjectedMapUnlocks(snapshot, domains.mapUnlocks);
  applyProjectedEquipment(
    snapshot,
    domains.equipmentSlots,
    contentTemplateRepository,
    isProjectedCollectionAuthoritative(domains.recoveryWatermark, 'equipment_version', domains.equipmentSlots),
  );
  applyProjectedArtifacts(
    snapshot,
    domains.artifactSlots,
    contentTemplateRepository,
    isProjectedCollectionAuthoritative(domains.recoveryWatermark, 'artifact_version', domains.artifactSlots),
  );
  applyProjectedTechniques(
    snapshot,
    domains.techniqueStates,
    contentTemplateRepository,
    isProjectedCollectionAuthoritative(domains.recoveryWatermark, 'technique_version', domains.techniqueStates),
  );
  applyProjectedTechniqueComprehensions(snapshot, domains.techniqueComprehensions, contentTemplateRepository);
  applyProjectedPersistentBuffs(snapshot, domains.persistentBuffStates);
  applyProjectedQuestProgress(
    snapshot,
    domains.questProgressRows,
    isProjectedCollectionAuthoritative(domains.recoveryWatermark, 'quest_version', domains.questProgressRows),
  );
  applyProjectedCombatPreferences(snapshot, domains.combatPreferences);
  applyProjectedAutoBattleSkills(
    snapshot,
    domains.autoBattleSkills,
    isProjectedCollectionAuthoritative(domains.recoveryWatermark, 'auto_battle_skill_version', domains.autoBattleSkills),
  );
  applyProjectedAutoUseItemRules(
    snapshot,
    domains.autoUseItemRules,
    isProjectedCollectionAuthoritative(domains.recoveryWatermark, 'auto_use_item_rule_version', domains.autoUseItemRules),
  );
  applyProjectedProfessions(snapshot, domains.professionStates);
  applyProjectedAlchemyPresets(
    snapshot,
    domains.alchemyPresets,
    isProjectedCollectionAuthoritative(domains.recoveryWatermark, 'alchemy_preset_version', domains.alchemyPresets),
  );
  applyProjectedActiveJob(snapshot, domains.activeJob);
  applyProjectedTechniqueActivityQueue(snapshot, domains.techniqueActivityQueue);
  applyProjectedEnhancementRecords(snapshot, domains.enhancementRecords);
  applyProjectedLogbook(
    snapshot,
    domains.logbookMessages,
    isProjectedCollectionAuthoritative(domains.recoveryWatermark, 'logbook_version', domains.logbookMessages),
  );
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

export function normalizeProjectedWalletRows(
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

export function normalizeProjectedMarketStorageRows(
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

export function applyProjectedPlacement(
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

export function applyProjectedWorldPreference(
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

export function applyProjectedInventory(
  snapshot: PersistedPlayerSnapshot,
  rows: PlayerInventoryItemLoadRow[],
  contentTemplateRepository?: InventoryItemTemplateRepository | null,
  authoritative = rows.length > 0,
): void {
  if (rows.length === 0 && !authoritative) {
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

export function applyProjectedMapUnlocks(
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

export function applyProjectedEquipment(
  snapshot: PersistedPlayerSnapshot,
  rows: PlayerEquipmentSlotLoadRow[],
  contentTemplateRepository?: InventoryItemTemplateRepository | null,
  authoritative = rows.length > 0,
): void {
  if (rows.length === 0 && !authoritative) {
    return;
  }
  const slotMap = new Map(
    EQUIP_SLOTS.map((slotType) => {
      const existing = !authoritative && Array.isArray(snapshot.equipment?.slots)
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

export function applyProjectedArtifacts(
  snapshot: PersistedPlayerSnapshot,
  rows: PlayerArtifactSlotLoadRow[],
  contentTemplateRepository?: InventoryItemTemplateRepository | null,
  authoritative = rows.length > 0,
): void {
  if (rows.length === 0 && !authoritative) {
    return;
  }
  const slotMap = new Map(
    ARTIFACT_SLOTS.map((slotType) => {
      const existing = !authoritative && Array.isArray(snapshot.artifacts?.slots)
        ? snapshot.artifacts.slots.find((entry) => normalizeOptionalString(asRecord(entry)?.slot) === slotType)
        : null;
      const existingRecord = asRecord(existing);
      return [
        slotType,
        {
          slot: slotType,
          unlocked: existingRecord?.unlocked === true,
          enabled: existingRecord?.enabled !== false,
          qi: normalizeMinimumNumber(existingRecord?.qi, 0, 0),
          maxQi: normalizeMinimumNumber(existingRecord?.maxQi, 0, 0),
          item: existingRecord?.item && typeof existingRecord.item === 'object'
            ? existingRecord.item as Record<string, unknown>
            : null,
        },
      ] as const;
    }),
  );
  for (const row of rows) {
    const slotType = normalizeOptionalString(row.slot_type);
    if (!slotType || !ARTIFACT_SLOTS.includes(slotType as (typeof ARTIFACT_SLOTS)[number])) {
      continue;
    }
    const normalizedSlotType = slotType as (typeof ARTIFACT_SLOTS)[number];
    const rawPayload = asRecord(decodeJsonValue(row.raw_payload));
    const itemId = normalizeOptionalString(row.item_id);
    const item = itemId
      ? hydratePersistedInventoryItem({
        itemId,
        itemInstanceId: row.item_instance_id,
        count: 1,
        rawPayload,
      }, contentTemplateRepository)
      : null;
    slotMap.set(normalizedSlotType, {
      slot: normalizedSlotType,
      unlocked: row.unlocked === true,
      enabled: row.enabled !== false,
      qi: normalizeMinimumNumber(row.qi, 0, 0),
      maxQi: normalizeMinimumNumber(row.max_qi, 0, 0),
      item,
    });
  }
  snapshot.artifacts = {
    revision: Math.max(1, Number(snapshot.artifacts?.revision ?? 1)),
    slots: ARTIFACT_SLOTS.map((slotType) => slotMap.get(slotType) ?? {
      slot: slotType,
      unlocked: false,
      enabled: true,
      qi: 0,
      maxQi: 0,
      item: null,
    }),
  };
}

export function applyProjectedTechniques(
  snapshot: PersistedPlayerSnapshot,
  rows: PlayerTechniqueStateLoadRow[],
  contentTemplateRepository?: TechniqueTemplateRepositoryPort | null,
  authoritative = rows.length > 0,
): void {
  if (rows.length === 0 && !authoritative) {
    return;
  }
  snapshot.techniques = {
    ...snapshot.techniques,
    revision: Math.max(1, Number(snapshot.techniques?.revision ?? 1)),
    techniques: rows.map((row) => {
      const techId = normalizeOptionalString(row.tech_id) ?? 'tech:unknown';
      const rawPayload = asRecord(decodeJsonValue(row.raw_payload));
      const learnTechniqueMaxLevelInput = normalizeOptionalInteger(rawPayload?.learnTechniqueMaxLevel);
      const dynamicState = {
        techId,
        level: normalizeMinimumInteger(row.level, 1, 1),
        exp: normalizeOptionalNumber(row.exp) ?? 0,
        expToNext: normalizeOptionalNumber(row.exp_to_next) ?? 0,
        realmLv: normalizeOptionalInteger(row.realm_lv) ?? undefined,
        skillsEnabled: row.skills_enabled !== false,
        ...(learnTechniqueMaxLevelInput !== null && learnTechniqueMaxLevelInput > 0
          ? { learnTechniqueMaxLevel: learnTechniqueMaxLevelInput }
          : {}),
      };
      return hydrateProjectedTechniqueState(dynamicState, contentTemplateRepository);
    }),
  };
}

export function applyProjectedTechniqueComprehensions(
  snapshot: PersistedPlayerSnapshot,
  rows: PlayerTechniqueComprehensionLoadRow[],
  contentTemplateRepository?: TechniqueTemplateRepositoryPort | null,
): void {
  snapshot.techniques = {
    ...snapshot.techniques,
    pendingComprehensions: rows.map((row) => {
      const techId = normalizeOptionalString(row.tech_id) ?? 'tech:unknown';
      const name = resolveProjectedTechniqueName(techId, contentTemplateRepository);
      return {
        techId,
        name: resolvePlayerFacingContentName(techId, '未知功法', name),
        sourceKind: normalizeOptionalString(row.source_kind) === 'created'
          ? 'created'
          : 'normal',
        creatorPlayerId: normalizeOptionalString(row.creator_player_id) ?? undefined,
        selfComprehensionAllowed: row.self_comprehension_allowed !== false,
        maxLevel: normalizeOptionalInteger(asRecord(decodeJsonValue(row.raw_payload))?.maxLevel) ?? undefined,
        progress: normalizeMinimumNumber(row.progress, 0, 0),
        requiredProgress: normalizeMinimumNumber(row.required_progress, 1, 1),
        realmLv: normalizeOptionalInteger(row.realm_lv) ?? 1,
        grade: normalizeOptionalString(row.grade) ?? undefined,
        category: normalizeOptionalString(row.category) ?? undefined,
        createdAtTick: normalizeMinimumInteger(row.created_at_tick, 0, 0),
        updatedAtTick: normalizeMinimumInteger(row.updated_at_tick, 0, 0),
        activeTransferJob: null,
      };
    }),
  };
}

export function hydrateProjectedTechniqueState(
  dynamicState: Record<string, unknown> & { techId: string },
  contentTemplateRepository?: TechniqueTemplateRepositoryPort | null,
): Record<string, unknown> {
  const hydrated = contentTemplateRepository?.hydrateTechniqueState?.(dynamicState);
  if (hydrated) {
    return hydrated;
  }
  const fallbackName = resolveProjectedTechniqueName(dynamicState.techId, contentTemplateRepository) ?? dynamicState.techId;
  // 自创功法在玩家分域中无静态模板；若 expToNext > 0 则按 realmLv 估算存根层数，
  // 保证修炼系统能正常推进而不因 layers:[] 导致 maxLevel = currentLevel 被卡住
  const expToNext = Math.max(0, Math.trunc(Number(dynamicState.expToNext ?? 0)));
  const realmLv = Math.max(1, Math.trunc(Number(dynamicState.realmLv ?? 1)));
  const stubLayers = isCreatedTechniqueId(dynamicState.techId) && expToNext > 0
    ? Array.from({ length: realmLv * 3 }, (_, i) => ({
        level: i + 1,
        expToNext: i < realmLv * 3 - 1 ? expToNext : 0,
      }))
    : [];
  return {
    ...dynamicState,
    name: fallbackName,
    realm: TechniqueRealm.Entry,
    skills: [],
    layers: stubLayers,
  };
}

export function resolveProjectedTechniqueName(
  techId: string,
  contentTemplateRepository?: TechniqueTemplateRepositoryPort | null,
): string | null {
  return normalizeOptionalString(contentTemplateRepository?.getTechniqueName?.(techId))
    ?? normalizeOptionalString(contentTemplateRepository?.createTechniqueState?.(techId)?.name)
    ?? null;
}

export function applyProjectedPersistentBuffs(
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

export function applyProjectedQuestProgress(
  snapshot: PersistedPlayerSnapshot,
  rows: PlayerQuestProgressLoadRow[],
  authoritative = rows.length > 0,
): void {
  if (rows.length === 0 && !authoritative) {
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
      const status = normalizeOptionalString(rawPayload?.status) ?? normalizeOptionalString(row.status) ?? 'active';
      const progress = decodeJsonValue(row.progress_payload) ?? rawPayload?.progress;
      const entry = {
        ...(rawPayload ?? {}),
        id: questId,
        questId,
        status,
      };
      if (status !== 'completed') {
        (entry as Record<string, unknown>).progress = normalizeQuestProgressValue(progress);
      }
      return {
        ...entry,
      };
    }),
  };
}

export function applyProjectedCombatPreferences(
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
    combatAttackIntensity: normalizeCombatAttackIntensity(row.combat_attack_intensity ?? DEFAULT_COMBAT_ATTACK_INTENSITY),
    senseQiActive: row.sense_qi_active === true,
    cultivationActive: row.cultivation_active !== false,
    combatTargetingRules: targetingRules ? { ...targetingRules } : undefined,
  };
  snapshot.techniques = {
    ...snapshot.techniques,
    cultivatingTechId: normalizeOptionalString(row.cultivating_tech_id),
  };
}

export function applyProjectedAutoBattleSkills(
  snapshot: PersistedPlayerSnapshot,
  rows: PlayerAutoBattleSkillLoadRow[],
  authoritative = rows.length > 0,
): void {
  if (rows.length === 0 && !authoritative) {
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

export function applyProjectedAutoUseItemRules(
  snapshot: PersistedPlayerSnapshot,
  rows: PlayerAutoUseItemRuleLoadRow[],
  authoritative = rows.length > 0,
): void {
  if (rows.length === 0 && !authoritative) {
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

export function applyProjectedVitals(
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

export function applyProjectedProgressionCore(
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
  snapshot.progression.stamina = normalizeMinimumInteger(
    row.stamina,
    snapshot.progression.stamina ?? DUNGEON_MAX_STAMINA,
    0,
  );
  snapshot.progression.staminaUpdatedAt = normalizeMinimumInteger(
    row.stamina_updated_at,
    snapshot.progression.staminaUpdatedAt ?? Date.now(),
    0,
  );
}

export function applyProjectedAttrState(
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

export function applyProjectedBodyTraining(
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

export function applyProjectedProfessions(
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
    } else if (professionType === 'formation') {
      snapshot.progression.formationSkill = state;
    } else if (professionType === 'transmission') {
      snapshot.progression.transmissionSkill = state;
    } else if (professionType === 'enhancement') {
      snapshot.progression.enhancementSkill = state;
      snapshot.progression.enhancementSkillLevel = state.level;
    }
  }
}

export function applyProjectedAlchemyPresets(
  snapshot: PersistedPlayerSnapshot,
  rows: PlayerAlchemyPresetLoadRow[],
  authoritative = rows.length > 0,
): void {
  if (rows.length === 0 && !authoritative) {
    return;
  }
  snapshot.progression.alchemyPresets = rows.map((row) => ({
    presetId: normalizeOptionalString(row.preset_id) ?? 'alchemy_preset:unknown',
    recipeId: normalizeOptionalString(row.recipe_id),
    name: normalizeOptionalString(row.name) ?? '未命名丹方',
    ingredients: normalizeJsonArray(row.ingredients_payload),
  }));
}

export function applyProjectedActiveJob(
  snapshot: PersistedPlayerSnapshot,
  row: PlayerActiveJobLoadRow | null,
): void {
  if (!row) {
    snapshot.progression.alchemyJob = null;
    snapshot.progression.forgingJob = null;
    snapshot.progression.enhancementJob = null;
    snapshot.progression.gatherJob = null;
    snapshot.progression.miningJob = null;
    snapshot.progression.buildingJob = null;
    snapshot.progression.formationJob = null;
    snapshot.progression.transmissionJob = null;
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
    snapshot.progression.gatherJob = null;
    snapshot.progression.miningJob = null;
    snapshot.progression.buildingJob = null;
    snapshot.progression.formationJob = null;
    snapshot.progression.transmissionJob = null;
    return;
  }
  if (jobType === 'formation') {
    snapshot.progression.formationJob = { ...normalizedJob, jobType: 'formation' };
    snapshot.progression.alchemyJob = null;
    snapshot.progression.forgingJob = null;
    snapshot.progression.enhancementJob = null;
    snapshot.progression.gatherJob = null;
    snapshot.progression.miningJob = null;
    snapshot.progression.buildingJob = null;
    snapshot.progression.transmissionJob = null;
    return;
  }
  if (jobType === 'transmission') {
    const detailJobType = normalizeOptionalString(detail.jobType);
    snapshot.progression.transmissionJob = {
      ...normalizedJob,
      jobType: detailJobType === 'scripture_recording' || detailJobType === 'scripture_contemplation'
        ? detailJobType
        : 'transmission',
    };
    snapshot.progression.alchemyJob = null;
    snapshot.progression.forgingJob = null;
    snapshot.progression.enhancementJob = null;
    snapshot.progression.gatherJob = null;
    snapshot.progression.miningJob = null;
    snapshot.progression.buildingJob = null;
    snapshot.progression.formationJob = null;
    return;
  }
  if (jobType === 'gather') {
    snapshot.progression.gatherJob = { ...normalizedJob, jobType: 'gather' };
    snapshot.progression.alchemyJob = null;
    snapshot.progression.forgingJob = null;
    snapshot.progression.enhancementJob = null;
    snapshot.progression.miningJob = null;
    snapshot.progression.buildingJob = null;
    snapshot.progression.formationJob = null;
    snapshot.progression.transmissionJob = null;
    return;
  }
  if (jobType === 'mining') {
    snapshot.progression.miningJob = { ...normalizedJob, jobType: 'mining' };
    snapshot.progression.alchemyJob = null;
    snapshot.progression.forgingJob = null;
    snapshot.progression.enhancementJob = null;
    snapshot.progression.gatherJob = null;
    snapshot.progression.buildingJob = null;
    snapshot.progression.formationJob = null;
    snapshot.progression.transmissionJob = null;
    return;
  }
  if (jobType === 'building') {
    snapshot.progression.buildingJob = { ...normalizedJob, jobType: 'building' };
    snapshot.progression.alchemyJob = null;
    snapshot.progression.forgingJob = null;
    snapshot.progression.enhancementJob = null;
    snapshot.progression.gatherJob = null;
    snapshot.progression.miningJob = null;
    snapshot.progression.formationJob = null;
    snapshot.progression.transmissionJob = null;
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
  snapshot.progression.gatherJob = null;
  snapshot.progression.miningJob = null;
  snapshot.progression.buildingJob = null;
  snapshot.progression.formationJob = null;
  snapshot.progression.transmissionJob = null;
}

export function applyProjectedTechniqueActivityQueue(
  snapshot: PersistedPlayerSnapshot,
  rows: PlayerTechniqueActivityQueueLoadRow[],
): void {
  if (rows.length === 0) {
    snapshot.progression.techniqueActivityQueue = [];
    return;
  }
  snapshot.progression.techniqueActivityQueue = rows
    .map((row, index) => {
      const detail = asRecord(decodeJsonValue(row.detail_jsonb)) ?? {};
      const kind = normalizeOptionalString(row.kind) ?? normalizeOptionalString(detail.kind);
      const queueId = normalizeOptionalString(row.queue_id) ?? normalizeOptionalString(detail.queueId);
      if (!kind || !queueId) {
        return null;
      }
      const payload = decodeJsonValue(row.payload_jsonb);
      const cancelRef = asRecord(decodeJsonValue(row.cancel_ref_jsonb)) ?? asRecord(detail.cancelRef) ?? { kind, queueId };
      return {
        ...detail,
        queueId,
        kind,
        state: normalizeOptionalString(row.state) ?? normalizeOptionalString(detail.state) ?? 'pending',
        label: normalizeOptionalString(row.label) ?? normalizeOptionalString(detail.label) ?? undefined,
        targetLabel: normalizeOptionalString(row.target_label) ?? normalizeOptionalString(detail.targetLabel) ?? undefined,
        sleepReason: normalizeOptionalString(row.sleep_reason) ?? normalizeOptionalString(detail.sleepReason) ?? undefined,
        retryAfterTicks: normalizeOptionalInteger(row.retry_after_ticks) ?? normalizeOptionalInteger(detail.retryAfterTicks) ?? undefined,
        createdAt: normalizeOptionalInteger(row.created_at) ?? normalizeOptionalInteger(detail.createdAt) ?? snapshot.savedAt + index,
        payload: payload == null ? cloneJsonValue(detail.payload ?? {}) : payload,
        cancelRef: {
          ...cancelRef,
          kind: normalizeOptionalString(cancelRef.kind) ?? kind,
          queueId: normalizeOptionalString(cancelRef.queueId) ?? queueId,
        },
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

export function applyProjectedEnhancementRecords(
  snapshot: PersistedPlayerSnapshot,
  rows: PlayerEnhancementRecordLoadRow[],
): void {
  if (rows.length === 0) {
    snapshot.progression.enhancementRecords = [];
    return;
  }
  snapshot.progression.enhancementRecords = projectEnhancementRecordsFromPersistenceRows(rows);
}

/** 将强化记录持久化行投影回重启水合使用的运行时记录。 */
export function projectEnhancementRecordsFromPersistenceRows(
  rows: readonly PlayerEnhancementRecordLoadRow[],
) {
  return rows.map((row) => {
    const itemId = normalizeOptionalString(row.itemId) ?? 'item:unknown';
    const itemName = normalizePersistedEnhancementItemName(itemId, row.itemName);
    return {
      recordId: normalizeOptionalString(row.recordId) ?? undefined,
      itemId,
      ...(itemName ? { itemName } : {}),
      highestLevel: normalizeMinimumInteger(row.highestLevel, 0, 0),
      levels: normalizeJsonArray(row.levelsPayload).map((entry) => cloneJsonValue(entry)),
      actionStartedAt: normalizeOptionalInteger(row.actionStartedAt) ?? undefined,
      actionEndedAt: normalizeOptionalInteger(row.actionEndedAt) ?? undefined,
      startLevel: normalizeOptionalInteger(row.startLevel) ?? undefined,
      initialTargetLevel: normalizeOptionalInteger(row.initialTargetLevel) ?? undefined,
      desiredTargetLevel: normalizeOptionalInteger(row.desiredTargetLevel) ?? undefined,
      protectionStartLevel: normalizeOptionalInteger(row.protectionStartLevel) ?? undefined,
      status: normalizeOptionalString(row.status) ?? undefined,
    };
  });
}

export function applyProjectedLogbook(
  snapshot: PersistedPlayerSnapshot,
  rows: PlayerLogbookMessageLoadRow[],
  authoritative = rows.length > 0,
): void {
  if (rows.length === 0 && !authoritative) {
    return;
  }
  snapshot.pendingLogbookMessages = rows.map((row) => ({
    id: normalizeOptionalString(row.message_id) ?? 'logbook:unknown',
    kind: normalizeOptionalString(row.kind) as PersistedPlayerSnapshot['pendingLogbookMessages'][number]['kind'] ?? 'system',
    text: normalizeOptionalString(row.text) ?? '',
    from: normalizeOptionalString(row.from_name) ?? undefined,
    at: normalizeOptionalInteger(row.occurred_at) ?? snapshot.savedAt,
    ...(asRecord(row.structured_payload) ? { structured: asRecord(row.structured_payload) as any } : undefined),
    ...(normalizeJsonArray(row.structured_group_payload).length > 0
      ? { structuredGroup: normalizeJsonArray(row.structured_group_payload) as any }
      : undefined),
  }));
}

export function resolveProjectedSnapshotSavedAt(
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
    normalizeOptionalInteger(watermark?.artifact_version),
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

export function normalizeJsonArray(value: unknown): unknown[] {
  const decoded = decodeJsonValue(value);
  return Array.isArray(decoded) ? decoded : [];
}

export function normalizeStringArray(value: unknown): string[] {
  return normalizeJsonArray(value)
    .map((entry) => normalizeOptionalString(entry))
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

export function normalizeRuntimeBonuses(value: unknown): PersistedPlayerSnapshot['runtimeBonuses'] {
  return normalizeJsonArray(value)
    .map((entry) => normalizeRuntimeBonusEntry(entry))
    .filter((entry): entry is PersistedPlayerSnapshot['runtimeBonuses'][number] => entry !== null);
}

export function normalizeRuntimeBonusEntry(
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

export function isDerivedPersistentRuntimeBonusSource(source: string): boolean {
  const normalized = typeof source === 'string' ? source.trim() : '';
  return normalized === 'runtime:realm_stage'
    || normalized === 'runtime:realm_state'
    || normalized === 'runtime:heaven_gate_roots'
    || normalized === 'runtime:technique_aggregate'
    || normalized === 'technique:aggregate'
    || normalized === 'realm:state'
    || normalized === 'realm:stage'
    || normalized === 'heaven_gate:roots'
    || normalized.startsWith('technique:')
    || normalized.startsWith('equipment:')
    || normalized.startsWith('equip:')
    || normalized.startsWith('equip-effect:')
    || normalized.startsWith('body_training:')
    || normalized.startsWith('buff:');
}

export function cloneJsonValue<T>(value: T): T {
  return decodeJsonValue(value) as T;
}

export function normalizeQuestProgressPayload(value: unknown): Record<string, unknown> | unknown[] | null {
  const decoded = decodeJsonValue(value);
  if (Array.isArray(decoded)) {
    return decoded;
  }
  const normalized = asRecord(decoded);
  return normalized ? { ...normalized } : null;
}

export function normalizeQuestProgressValue(value: unknown): number {
  const decoded = decodeJsonValue(value);
  const direct = Number(decoded);
  if (Number.isFinite(direct)) {
    return Math.max(0, Math.trunc(direct));
  }
  const record = asRecord(decoded);
  if (!record) {
    return 0;
  }
  const candidates = [
    record.progress,
    record.current,
    record.count,
    record.kills,
    record.value,
  ];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) {
      return Math.max(0, Math.trunc(numeric));
    }
  }
  return 0;
}

export function decodeJsonValue(value: unknown): unknown {
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

export async function querySingleRow<T>(
  client: PoolClient,
  sql: string,
  params: unknown[],
): Promise<T | null> {
  const result = await client.query<T>(sql, params);
  return result.rows[0] ?? null;
}

export async function queryRows<T>(
  client: PoolClient,
  sql: string,
  params: unknown[],
): Promise<T[]> {
  const result = await client.query<T>(sql, params);
  return result.rows ?? [];
}

/** 按 player_id 索引单行结果（后出现的覆盖先出现的）。 */
export function indexRowsByPlayerId<T extends { player_id?: unknown }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    const pid = typeof row.player_id === 'string' ? row.player_id.trim() : '';
    if (pid) map.set(pid, row);
  }
  return map;
}

/** 按 player_id 索引多行结果（同一 player_id 聚合为数组）。 */
export function indexMultiRowsByPlayerId<T extends { player_id?: unknown }>(rows: T[]): Map<string, T[]> {
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

export function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizePlayerIdList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(value.map((entry) => normalizeRequiredString(entry)).filter((entry) => entry.length > 0)));
}

export function normalizeOptionalString(value: unknown): string | null {
  const normalized = normalizeRequiredString(value);
  return normalized ? normalized : null;
}

export async function assertPlayerSnapshotProjectionFenceCurrent(
  client: PoolClient,
  playerId: string,
  options: PlayerSnapshotProjectionDomainWriteOptions,
): Promise<void> {
  const expectedEpoch = normalizeOptionalInteger(options.expectedSessionEpoch) ?? 0;
  const expectedOwner = normalizeOptionalString(options.expectedRuntimeOwnerId);
  // owner 与 epoch 都未提供是管理后台、初始化和一次性导入的明确无围栏契约。
  // 历史 durable payload 可能只有 epoch；此时只允许精确匹配 DB 中同样已释放 owner 的 fence。
  if (expectedEpoch <= 0 && !expectedOwner) {
    return;
  }
  if (expectedEpoch <= 0) {
    throw new Error(`player_snapshot_projection_incomplete_fence:${playerId}:expectedOwner=${expectedOwner ?? 'none'}:expectedEpoch=${expectedEpoch || 'none'}`);
  }
  const result = await client.query<{
    runtime_owner_id?: unknown;
    session_epoch?: unknown;
  }>(
    `SELECT runtime_owner_id, session_epoch
       FROM ${PLAYER_PRESENCE_TABLE}
      WHERE player_id = $1
      FOR UPDATE`,
    [playerId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`player_snapshot_projection_missing_presence:${playerId}`);
  }
  const persistedEpoch = normalizeOptionalInteger(row.session_epoch) ?? 0;
  if (persistedEpoch <= 0) {
    throw new Error(`player_snapshot_projection_invalid_persisted_fence:${playerId}:persistedEpoch=${persistedEpoch}`);
  }
  if (expectedEpoch !== persistedEpoch) {
    throw new Error(`player_snapshot_projection_stale_session:${playerId}:expected=${expectedEpoch}:persisted=${persistedEpoch}`);
  }
  const persistedOwner = normalizeOptionalString(row.runtime_owner_id);
  if (expectedOwner ? expectedOwner !== persistedOwner : persistedOwner !== null) {
    throw new Error(`player_snapshot_projection_stale_owner:${playerId}:expected=${expectedOwner ?? 'none'}:persisted=${persistedOwner ?? 'none'}`);
  }
}

/**
 * 判定玩家快照投影围栏是否因“已被更新会话/所有者取代”而拒绝写入。
 * stale_session / stale_owner / missing_presence 都表示更高权威已接管该玩家，
 * 本次投影写入是过期的良性收敛（stale-safe），调用方应跳过而非当作失败重试或报错。
 */
export function isConvergedPlayerProjectionFenceError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.startsWith('player_snapshot_projection_stale_session:')
    || error.message.startsWith('player_snapshot_projection_stale_owner:')
    || error.message.startsWith('player_snapshot_projection_missing_presence:');
}

/** 玩家在线状态围栏因更新会话已推进 epoch/owner 而拒绝写入的良性收敛判定。 */
export function isConvergedPlayerPresenceFenceError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('player_presence_stale_fence:');
}

/**
 * 脱机 drain 刷盘因玩家已被更新会话接管而应跳过的合并判定（投影围栏 + 在线状态围栏）。
 * 命中即代表本次刷盘过期，安全跳过，不应打成 error。
 */
export function isSupersededPlayerFlushFenceError(error: unknown): boolean {
  return isConvergedPlayerProjectionFenceError(error)
    || isConvergedPlayerPresenceFenceError(error);
}

/**
 * 判定资产强事务是否已被更高 session epoch 接管。
 * 只有数据库中的 epoch 严格高于本次调用的 expected epoch 才能按 stale-safe 让位；
 * 同 epoch owner 不一致或数据库 epoch 更旧仍属于真实围栏/实现错误，不能吞掉。
 */
export function isSupersededPlayerAssetFenceError(error: unknown): boolean {
  if (!(error instanceof Error) || !error.message.startsWith('player_session_fencing_conflict:')) {
    return false;
  }
  const expectedEpoch = readFenceEpoch(error.message, 'expectedSessionEpoch');
  const persistedEpoch = readFenceEpoch(error.message, 'persistedSessionEpoch');
  return expectedEpoch > 0 && persistedEpoch > expectedEpoch;
}

export function readFenceEpoch(message: string, key: string): number {
  const match = message.match(new RegExp(`(?:^|:)${key}=(\\d+)(?::|$)`));
  if (!match) {
    return 0;
  }
  const epoch = Number(match[1]);
  return Number.isFinite(epoch) ? Math.trunc(epoch) : 0;
}

export async function acquireSchemaInitLock(client: PoolClient): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock($1::integer, $2::integer)', [7100, 1]);
}

export async function acquirePlayerPersistenceLock(client: PoolClient, playerId: string): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock($1::integer, hashtext($2))', [7101, playerId]);
}

export function normalizeOptionalInteger(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

export function normalizeOptionalNumber(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function normalizeIntegerWithFallback(value: unknown, fallback: unknown): number {
  const normalized = normalizeOptionalInteger(value);
  if (normalized != null) {
    return normalized;
  }
  const normalizedFallback = normalizeOptionalInteger(fallback);
  return normalizedFallback ?? 0;
}

export function normalizeNumberWithFallback(value: unknown, fallback: unknown): number {
  const normalized = normalizeOptionalNumber(value);
  if (normalized != null) {
    return normalized;
  }
  const normalizedFallback = normalizeOptionalNumber(fallback);
  return normalizedFallback ?? 0;
}

export function normalizeMinimumInteger(value: unknown, fallback: unknown, minimum: number): number {
  return Math.max(minimum, normalizeIntegerWithFallback(value, fallback));
}

export function normalizeMinimumNumber(value: unknown, fallback: unknown, minimum: number): number {
  return Math.max(minimum, normalizeNumberWithFallback(value, fallback));
}

export function normalizeVersionSeed(value: unknown): number {
  if (value == null || value === '') {
    return nextPlayerPersistenceVersion();
  }
  const numeric = Number(value);
  return Math.max(1, Math.trunc(Number.isFinite(numeric) ? numeric : nextPlayerPersistenceVersion()));
}

export function normalizeOfflineGainReportPayload(
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

export function normalizePlayerStatisticPeriodTotal(value: unknown): PlayerStatisticPeriodTotalView {
  const record = asRecord(value) ?? {};
  return {
    spiritStones: normalizeStatisticAmountRecord(asRecord(record.spiritStones)),
    progress: normalizeStatisticAmountRecord(asRecord(record.progress)),
    techniques: normalizeStatisticAmountRecord(asRecord(record.techniques)),
    professions: normalizeStatisticAmountRecord(asRecord(record.professions)),
  };
}

export function normalizeStatisticAmountRecord(record: Record<string, unknown> | null): { gained: number; lost: number; net: number } {
  const gained = normalizeMinimumNumber(record?.gained ?? record?.amount ?? record?.count, 0, 0);
  const lost = normalizeMinimumNumber(record?.lost, 0, 0);
  const numericNet = Number(record?.net ?? gained - lost);
  return {
    gained,
    lost,
    net: Number.isFinite(numericNet) ? numericNet : gained - lost,
  };
}

export function normalizeStatisticExpAmountRecord(record: Record<string, unknown> | null): { gained: number; lost: number; net: number } {
  const gained = normalizeMinimumNumber(record?.expGained ?? record?.expGain, 0, 0);
  const lost = normalizeMinimumNumber(record?.expLost, 0, 0);
  const numericNet = Number(record?.netExp ?? gained - lost);
  return {
    gained,
    lost,
    net: Number.isFinite(numericNet) ? numericNet : gained - lost,
  };
}

export function normalizeOfflineGainProgressKind(value: unknown): OfflineGainReportView['progress'][number]['kind'] {
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

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

export function normalizeWorldPreferenceLinePreset(value: unknown): 'peaceful' | 'real' {
  return value === 'real' ? 'real' : 'peaceful';
}

export function normalizePersistedEnhancementItemName(itemId: string, value: unknown): string | null {
  const itemName = resolvePlayerFacingContentName(itemId, '未知物品', normalizeOptionalString(value));
  return itemName === '未知物品' ? null : itemName;
}

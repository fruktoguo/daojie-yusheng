/**
 * durable-operation.sql.ts
 *
 * 从 durable-operation.service.ts 拆出的模块级常量与游离函数。
 * 包含：表名常量、DDL 建表/列迁移函数、事务回滚/连接处置、玩家资产锁、
 * 标识符安全校验、replay identity 断言、payload 规范化/比较/序列化、
 * 市场结算 SQL helper、资产审计日志 helper 等。
 * 不包含 @Injectable provider，不修改持久化语义。
 */
import { Logger } from '@nestjs/common';
import {
  calculateTimeChamberActivationCost,
  createItemStackSignature,
  EQUIP_SLOTS,
  isLegacyItemInstanceId,
  requiresTimeChamberActivation,
  resolveTimeChamberCapacityLimit,
  TIME_CHAMBER_MAX_USAGE_HOURS,
  TIME_CHAMBER_MIN_USAGE_HOURS,
} from '@mud/shared';
import { createHash } from 'node:crypto';
import { assertPlantSeedSourceMutation } from './plant-seed-source-validation';
import {
  assignStableItemInstanceId,
  upsertEquipmentSlotRowsWithItemInstanceIdRepair,
  type EquipmentSlotPersistenceRow,
  type ItemInstanceIdPersistenceRowSource,
} from './compat/item-instance-id-compat';
import { Pool } from 'pg';

import { resolveNodeId } from '../config/node-runtime-config';
import { assertInstanceLeaseWriteFence } from './instance-lease-write-fence';
import {
  buildPersistedEquipmentItemRawPayload,
  buildPersistedInventoryItemRawPayload,
} from './inventory-item-persistence';
import { isTransientPostgresError } from './pg-error-utils';
import {
  nextPlayerPersistenceVersion,
  savePlayerSnapshotProjectionDomainsWithClient,
  type PlayerTechniqueActivityQueueUpsertInput,
} from './player-domain-persistence.service';
import { ensureBigintColumnsWithClient } from './schema-bigint-migration';
import { normalizeDurableMineralCrystalSourceMutation, persistDurableMineralCrystalSourceMutation, type DurableMineralCrystalSourceMutation } from './mineral-crystal-durable-persistence';
import {
  persistDurableFormationWriteWithClient,
  type DurableSectFormationWrite,
} from './sect-durable-persistence';
import {
  normalizeDurableTileResourceSourceMutation,
  persistDurableTileResourceSourceMutation,
  type DurableTileResourceSourceMutation,
} from './tile-resource-durable-persistence';
import {
  normalizeDurableLootSourceMutation,
  persistDurableLootSourceMutation,
  type DurableContainerStateSourceMutation,
  type DurableGroundTileSourceMutation,
} from './loot-source-durable-persistence';
import {
  normalizeDurableActivityAssetSourceMutation,
  persistDurableActivityAssetSourceMutation,
  type DurableActivityAssetSourceMutation,
} from './activity-asset-durable-persistence';
import {
  normalizeDurablePlayerItemUseSourceMutation,
  persistDurablePlayerItemUseSourceMutation,
  type DurablePlayerItemUseSourceMutation,
} from './player-item-use-durable-persistence';
import type {
  ActiveJobCompletionKind,
  DurableActiveJobSnapshot,
  DurableEnhancementRecordSnapshot,
  DurableEquipmentSlotSnapshot,
  DurableInventoryGrantSourceMutation,
  DurableInventoryItemSnapshot,
  DurableMarketExpectedOrderSnapshot,
  DurableMarketMutationInput,
  DurableMarketPlayerMutationSnapshot,
  DurableMarketStorageItemSnapshot,
  DurableProfessionStateSnapshot,
  DurableQuestProgressSnapshot,
  DurableWalletBalanceSnapshot,
  AssetMutationCompactionContext,
} from './durable-operation.service';

// ── 表名常量 ──
export const PLAYER_PRESENCE_TABLE = 'player_presence';
export const PLAYER_WALLET_TABLE = 'player_wallet';
export const PLAYER_INVENTORY_ITEM_TABLE = 'player_inventory_item';
export const PLAYER_MARKET_STORAGE_ITEM_TABLE = 'player_market_storage_item';
export const MARKET_ORDER_TABLE = 'server_market_order';
export const MARKET_TRADE_TABLE = 'server_market_trade_history';
export const PLAYER_HEAVENLY_DAO_SHOP_PURCHASE_TABLE = 'player_heavenly_dao_shop_purchase';
export const PLAYER_AUTH_TABLE = 'server_player_auth';
export const PLAYER_EQUIPMENT_SLOT_TABLE = 'player_equipment_slot';
export const PLAYER_QUEST_PROGRESS_TABLE = 'player_quest_progress';
export const durableModuleLogger = new Logger('DurableOperation:LegacyCompat');
export const PLAYER_ACTIVE_JOB_TABLE = 'player_active_job';
export const PLAYER_TECHNIQUE_ACTIVITY_QUEUE_TABLE = 'player_technique_activity_queue';
export const PLAYER_ENHANCEMENT_RECORD_TABLE = 'player_enhancement_record';
export const PLAYER_PROFESSION_STATE_TABLE = 'player_profession_state';
export const PLAYER_MAIL_TABLE = 'player_mail';
export const PLAYER_MAIL_ATTACHMENT_TABLE = 'player_mail_attachment';
export const PLAYER_MAIL_COUNTER_TABLE = 'player_mail_counter';
export const PLAYER_RECOVERY_WATERMARK_TABLE = 'player_recovery_watermark';
export const DURABLE_OPERATION_LOG_TABLE = 'durable_operation_log';
export const OUTBOX_EVENT_TABLE = 'outbox_event';
export const DEAD_LETTER_EVENT_TABLE = 'dead_letter_event';
export const ASSET_AUDIT_LOG_TABLE = 'asset_audit_log';
export const ASSET_AUDIT_LOG_ARCHIVE_TABLE = 'asset_audit_log_archive';
export const DURABLE_OPERATION_ID_SAFE_LENGTH = 173;
export const HIGH_FREQUENCY_ASSET_AUDIT_CHECKPOINT_INTERVAL = 60;
export const DURABLE_OPERATION_COMPACTION_META_KEY = '_compaction';
export const DURABLE_OPERATION_BIGINT_COLUMNS_BY_TABLE = {
  [OUTBOX_EVENT_TABLE]: ['attempt_count'],
  [PLAYER_MAIL_ATTACHMENT_TABLE]: ['count'],
  [PLAYER_MAIL_COUNTER_TABLE]: ['unread_count', 'unclaimed_count'],
  [PLAYER_INVENTORY_ITEM_TABLE]: ['slot_index', 'count'],
  [PLAYER_MARKET_STORAGE_ITEM_TABLE]: ['slot_index', 'count', 'enhance_level'],
 [PLAYER_HEAVENLY_DAO_SHOP_PURCHASE_TABLE]: ['purchased_count'],
  [PLAYER_ACTIVE_JOB_TABLE]: ['paused_ticks', 'total_ticks', 'remaining_ticks'],
  [PLAYER_PROFESSION_STATE_TABLE]: ['level'],
  [PLAYER_ENHANCEMENT_RECORD_TABLE]: [
    'highest_level',
    'start_level',
    'initial_target_level',
    'desired_target_level',
    'protection_start_level',
  ],
} as const;
export async function rollbackTransactionOrDestroyClient(
  client: import('pg').PoolClient,
): Promise<boolean> {
  try {
    await client.query('ROLLBACK');
    return false;
  } catch {
    client.release(true);
    return true;
  }
}

/** COMMIT 已发送或服务正在关停时，不再向未决连接追加 ROLLBACK。 */
export async function disposeFailedDurableTransactionClient(
  client: import('pg').PoolClient,
  input: { commitAttempted: boolean; shuttingDown: boolean },
): Promise<boolean> {
  if (input.commitAttempted || input.shuttingDown) {
    client.release(true);
    return true;
  }
  return rollbackTransactionOrDestroyClient(client);
}

export async function acquirePlayerAssetLock(
  client: import('pg').PoolClient,
  playerId: string,
): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock($1::integer, hashtext($2))', [7101, playerId]);
}

export async function ensureDurableOperationTables(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await acquireSchemaInitLock(client);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${DURABLE_OPERATION_LOG_TABLE} (
        operation_id varchar(180) PRIMARY KEY,
        operation_type varchar(64) NOT NULL,
        aggregate_type varchar(64) NOT NULL,
        aggregate_id varchar(180) NOT NULL,
        player_id varchar(100) NOT NULL,
        runtime_owner_id varchar(120),
        session_epoch bigint,
        request_id varchar(180),
        payload_jsonb jsonb NOT NULL,
        status varchar(32) NOT NULL,
        error_code varchar(64),
        created_at timestamptz NOT NULL DEFAULT now(),
        committed_at timestamptz
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS durable_operation_log_player_idx
      ON ${DURABLE_OPERATION_LOG_TABLE}(player_id, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS durable_operation_log_status_idx
      ON ${DURABLE_OPERATION_LOG_TABLE}(status, created_at DESC)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${OUTBOX_EVENT_TABLE} (
        event_id varchar(180) PRIMARY KEY,
        operation_id varchar(180) NOT NULL,
        topic varchar(120) NOT NULL,
        partition_key varchar(180) NOT NULL,
        payload_jsonb jsonb NOT NULL,
        status varchar(32) NOT NULL,
        attempt_count bigint NOT NULL DEFAULT 0,
        next_retry_at timestamptz,
        claimed_by varchar(120),
        claim_until timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        delivered_at timestamptz
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS outbox_event_operation_idx
      ON ${OUTBOX_EVENT_TABLE}(operation_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS outbox_event_status_retry_idx
      ON ${OUTBOX_EVENT_TABLE}(status, next_retry_at, created_at)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${ASSET_AUDIT_LOG_TABLE} (
        log_id varchar(180) PRIMARY KEY,
        operation_id varchar(180) NOT NULL,
        player_id varchar(100) NOT NULL,
        asset_type varchar(64) NOT NULL,
        asset_ref_id varchar(180) NOT NULL,
        action varchar(64) NOT NULL,
        delta_jsonb jsonb NOT NULL,
        before_jsonb jsonb NOT NULL,
        after_jsonb jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS asset_audit_log_operation_idx
      ON ${ASSET_AUDIT_LOG_TABLE}(operation_id, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS asset_audit_log_player_idx
      ON ${ASSET_AUDIT_LOG_TABLE}(player_id, created_at DESC)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${ASSET_AUDIT_LOG_ARCHIVE_TABLE} (
        log_id varchar(180) PRIMARY KEY,
        operation_id varchar(180) NOT NULL,
        player_id varchar(100) NOT NULL,
        asset_type varchar(64) NOT NULL,
        asset_ref_id varchar(180) NOT NULL,
        action varchar(64) NOT NULL,
        delta_jsonb jsonb NOT NULL,
        before_jsonb jsonb NOT NULL,
        after_jsonb jsonb NOT NULL,
        created_at timestamptz NOT NULL,
        archived_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await ensureVarcharColumnLength(client, ASSET_AUDIT_LOG_ARCHIVE_TABLE, 'operation_id', 180);
    await client.query(`
      CREATE INDEX IF NOT EXISTS asset_audit_log_archive_created_idx
      ON ${ASSET_AUDIT_LOG_ARCHIVE_TABLE}(created_at DESC, archived_at DESC)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_MAIL_TABLE} (
        mail_id varchar(180) PRIMARY KEY,
        player_id varchar(100) NOT NULL,
        sender_type varchar(32) NOT NULL DEFAULT 'system',
        sender_label varchar(120) NOT NULL,
        template_id varchar(120),
        mail_type varchar(32) NOT NULL DEFAULT 'system',
        title varchar(240),
        body text,
        source_type varchar(64),
        source_ref_id varchar(180),
        metadata_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
        mail_version bigint NOT NULL DEFAULT 1,
        created_at bigint NOT NULL,
        expire_at bigint,
        first_seen_at bigint,
        read_at bigint,
        claimed_at bigint,
        deleted_at bigint,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS player_mail_player_idx
      ON ${PLAYER_MAIL_TABLE}(player_id, created_at DESC)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_MAIL_ATTACHMENT_TABLE} (
        attachment_id varchar(180) PRIMARY KEY,
        mail_id varchar(180) NOT NULL,
        player_id varchar(100) NOT NULL,
        attachment_kind varchar(32) NOT NULL DEFAULT 'item',
        item_id varchar(120),
        count bigint,
        currency_type varchar(64),
        amount bigint,
        item_payload_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
        claim_operation_id varchar(180),
        claimed_at bigint,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS player_mail_attachment_mail_idx
      ON ${PLAYER_MAIL_ATTACHMENT_TABLE}(mail_id)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_MAIL_COUNTER_TABLE} (
        player_id varchar(100) PRIMARY KEY,
        unread_count bigint NOT NULL DEFAULT 0,
        unclaimed_count bigint NOT NULL DEFAULT 0,
        latest_mail_at bigint,
        counter_version bigint NOT NULL DEFAULT 0,
        welcome_mail_delivered_at bigint,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      ALTER TABLE ${PLAYER_MAIL_COUNTER_TABLE}
      ADD COLUMN IF NOT EXISTS welcome_mail_delivered_at bigint
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_INVENTORY_ITEM_TABLE} (
        item_instance_id varchar(180) PRIMARY KEY,
        player_id varchar(100) NOT NULL,
        slot_index bigint NOT NULL,
        item_id varchar(120) NOT NULL,
        count bigint NOT NULL,
        raw_payload jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(player_id, slot_index)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${MARKET_ORDER_TABLE} (
        order_id varchar(160) PRIMARY KEY,
        owner_id varchar(100) NOT NULL,
        side varchar(16) NOT NULL,
        status varchar(24) NOT NULL,
        item_key varchar(240) NOT NULL,
        item_id varchar(160) NOT NULL,
        remaining_quantity bigint NOT NULL DEFAULT 0,
        unit_price numeric(20, 2) NOT NULL DEFAULT 1,
        created_at_ms bigint NOT NULL,
        updated_at_ms bigint NOT NULL,
        raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS server_market_order_open_idx
      ON ${MARKET_ORDER_TABLE}(status, item_key, side, unit_price, created_at_ms)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS server_market_order_owner_idx
      ON ${MARKET_ORDER_TABLE}(owner_id, status, updated_at_ms DESC)
    `);
  await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_HEAVENLY_DAO_SHOP_PURCHASE_TABLE} (
        player_id varchar(100) NOT NULL,
        item_id varchar(160) NOT NULL,
        purchase_date date NOT NULL,
        purchased_count bigint NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(player_id, item_id, purchase_date)
      )
    `);
  await client.query(`
      CREATE INDEX IF NOT EXISTS player_heavenly_dao_shop_purchase_date_idx
      ON ${PLAYER_HEAVENLY_DAO_SHOP_PURCHASE_TABLE}(purchase_date, item_id)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${MARKET_TRADE_TABLE} (
        trade_id varchar(160) PRIMARY KEY,
        buyer_id varchar(100) NOT NULL,
        seller_id varchar(100) NOT NULL,
        item_id varchar(160) NOT NULL,
        quantity bigint NOT NULL DEFAULT 1,
        unit_price numeric(20, 2) NOT NULL DEFAULT 1,
        created_at_ms bigint NOT NULL,
        raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS server_market_trade_created_idx
      ON ${MARKET_TRADE_TABLE}(created_at_ms DESC, trade_id ASC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS server_market_trade_buyer_created_idx
      ON ${MARKET_TRADE_TABLE}(buyer_id, created_at_ms DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS server_market_trade_seller_created_idx
      ON ${MARKET_TRADE_TABLE}(seller_id, created_at_ms DESC)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_MARKET_STORAGE_ITEM_TABLE} (
        storage_item_id varchar(180) PRIMARY KEY,
        player_id varchar(100) NOT NULL,
        slot_index bigint NOT NULL,
        item_id varchar(120) NOT NULL,
        count bigint NOT NULL DEFAULT 1,
        enhance_level bigint,
        raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
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
        item_id varchar(120) NOT NULL,
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
      CREATE TABLE IF NOT EXISTS ${PLAYER_PROFESSION_STATE_TABLE} (
        player_id varchar(100) NOT NULL,
        profession_type varchar(32) NOT NULL,
        level bigint NOT NULL DEFAULT 1,
        exp double precision,
        exp_to_next double precision,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(player_id, profession_type)
      )
    `);
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
      CREATE TABLE IF NOT EXISTS ${PLAYER_RECOVERY_WATERMARK_TABLE} (
        player_id varchar(100) PRIMARY KEY,
        wallet_version bigint NOT NULL DEFAULT 0,
        inventory_version bigint NOT NULL DEFAULT 0,
        market_storage_version bigint NOT NULL DEFAULT 0,
        equipment_version bigint NOT NULL DEFAULT 0,
        artifact_version bigint NOT NULL DEFAULT 0,
        profession_version bigint NOT NULL DEFAULT 0,
        active_job_version bigint NOT NULL DEFAULT 0,
        enhancement_record_version bigint NOT NULL DEFAULT 0,
        mail_version bigint NOT NULL DEFAULT 0,
        mail_counter_version bigint NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      ALTER TABLE ${PLAYER_RECOVERY_WATERMARK_TABLE}
      ADD COLUMN IF NOT EXISTS wallet_version bigint NOT NULL DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE ${PLAYER_RECOVERY_WATERMARK_TABLE}
      ADD COLUMN IF NOT EXISTS market_storage_version bigint NOT NULL DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE ${PLAYER_RECOVERY_WATERMARK_TABLE}
      ADD COLUMN IF NOT EXISTS equipment_version bigint NOT NULL DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE ${PLAYER_RECOVERY_WATERMARK_TABLE}
      ADD COLUMN IF NOT EXISTS artifact_version bigint NOT NULL DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE ${PLAYER_RECOVERY_WATERMARK_TABLE}
      ADD COLUMN IF NOT EXISTS profession_version bigint NOT NULL DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE ${PLAYER_RECOVERY_WATERMARK_TABLE}
      ADD COLUMN IF NOT EXISTS active_job_version bigint NOT NULL DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE ${PLAYER_RECOVERY_WATERMARK_TABLE}
      ADD COLUMN IF NOT EXISTS enhancement_record_version bigint NOT NULL DEFAULT 0
    `);
    await ensureDurableOperationBigintColumnsWithClient(client);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function ensureDurableOperationBigintColumnsWithClient(client: import('pg').PoolClient): Promise<void> {
  await ensureBigintColumnsWithClient(client, DURABLE_OPERATION_BIGINT_COLUMNS_BY_TABLE);
}

export async function ensureVarcharColumnLength(
  queryable: { query: (sql: string, params?: unknown[]) => Promise<{ rows?: unknown[] }> },
  tableName: string,
  columnName: string,
  minLength: number,
): Promise<void> {
  assertSafeIdentifier(tableName);
  assertSafeIdentifier(columnName);
  const result = await queryable.query(
    `
      SELECT data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1
        AND column_name = $2
      LIMIT 1
    `,
    [tableName, columnName],
  );
  const row = Array.isArray(result.rows) ? (result.rows[0] as Record<string, unknown> | undefined) : undefined;
  if (!row || row.data_type === 'text' || row.data_type !== 'character varying') {
    return;
  }
  const currentLength = Number(row.character_maximum_length ?? 0);
  if (Number.isFinite(currentLength) && currentLength >= minLength) {
    return;
  }
  await queryable.query(
    `ALTER TABLE ${quoteIdentifier(tableName)} ALTER COLUMN ${quoteIdentifier(columnName)} TYPE varchar(${minLength})`,
  );
}

export function assertSafeIdentifier(identifier: string): void {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error(`unsafe_sql_identifier:${identifier}`);
  }
}

export function quoteIdentifier(identifier: string): string {
  assertSafeIdentifier(identifier);
  return `"${identifier.replace(/"/g, '""')}"`;
}

export async function ensurePlayerPresenceColumnsWithClient(client: import('pg').PoolClient): Promise<void> {
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
    ALTER COLUMN runtime_owner_id TYPE varchar(180)
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

export interface DurableReplaceOptions {
  allowEmptyOverwrite?: boolean;
  replaceLockedItems?: boolean;
}

export function safeStringifyDurableEntry(value: unknown): string {
  const maxLength = 240;
  let serialized = '';
  try {
    serialized = JSON.stringify(value);
  } catch {
    serialized = '[unserializable]';
  }
  if (!serialized) {
    return '[empty]';
  }
  return serialized.length > maxLength ? `${serialized.slice(0, maxLength)}...` : serialized;
}

export function isSameDurablePayload(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return stableJsonStringify(left) === stableJsonStringify(right);
}

export function stableJsonStringify(value: unknown): string {
  if (value == null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJsonStringify(entry)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries: string[] = [];
    for (const key of Object.keys(record).sort()) {
      const entry = record[key];
      if (typeof entry === 'undefined' || typeof entry === 'function' || typeof entry === 'symbol') {
        continue;
      }
      entries.push(`${JSON.stringify(key)}:${stableJsonStringify(entry)}`);
    }
    return `{${entries.join(',')}}`;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  return 'null';
}

export async function refuseEmptyOverwriteIfRowsExist(
  client: import('pg').PoolClient,
  tableName: string,
  playerId: string,
  incomingCount: number,
  domainTag: string,
  options: DurableReplaceOptions = {},
): Promise<void> {
  if (incomingCount > 0 || options.allowEmptyOverwrite === true) {
    return;
  }
  const result = await client.query(
    `SELECT 1 AS exists FROM ${tableName} WHERE player_id = $1 LIMIT 1`,
    [playerId],
  );
  if ((result.rowCount ?? 0) > 0) {
    throw new Error(`replace_${domainTag}_refused_empty_overwrite:playerId=${playerId} table=${tableName}`);
  }
}

export async function assertPlayerItemUseConsumesLastUnlockedInventoryItem(
  client: import('pg').PoolClient,
  playerId: string,
  removedItems: readonly DurableInventoryItemSnapshot[],
): Promise<true> {
  if (removedItems.length !== 1) {
    throw new Error('player_item_use_empty_inventory_removal_invalid');
  }
  const removedItem = removedItems[0];
  const itemId = normalizeRequiredString(removedItem?.itemId);
  const itemInstanceId = normalizeRequiredString(removedItem?.itemInstanceId)
    || normalizeRequiredString((removedItem?.rawPayload as { itemInstanceId?: unknown } | null)?.itemInstanceId);
  const count = Math.max(1, Math.trunc(Number(removedItem?.count ?? 1)));
  if (!itemId || !itemInstanceId || isLegacyItemInstanceId(itemInstanceId) || count !== 1) {
    throw new Error('player_item_use_empty_inventory_removal_invalid');
  }

  const persisted = await client.query<{
    item_instance_id?: unknown;
    item_id?: unknown;
    count?: unknown;
    raw_payload?: unknown;
  }>(
    `SELECT item_instance_id, item_id, count, raw_payload
       FROM ${PLAYER_INVENTORY_ITEM_TABLE}
      WHERE player_id = $1
        AND locked_by IS NULL
      FOR UPDATE`,
    [playerId],
  );
  const row = persisted.rows[0];
  const expectedRawPayload = buildPersistedInventoryItemRawPayload({
    itemId,
    count,
    name: removedItem.name,
    desc: removedItem.desc,
    enhanceLevel: removedItem.enhanceLevel,
    learnTechniqueId: removedItem.learnTechniqueId,
    learnTechniqueMaxLevel: removedItem.learnTechniqueMaxLevel,
    grade: removedItem.grade,
    level: removedItem.level,
    rawPayload: removedItem.rawPayload,
  });
  if (
    (persisted.rowCount ?? 0) !== 1
    || normalizeRequiredString(row?.item_instance_id) !== itemInstanceId
    || normalizeRequiredString(row?.item_id) !== itemId
    || Math.trunc(Number(row?.count ?? 0)) !== 1
    || createPersistedInventoryRowSignature(itemId, normalizeDurableJsonObject(row?.raw_payload))
      !== createPersistedInventoryRowSignature(itemId, expectedRawPayload)
  ) {
    throw new Error('player_item_use_empty_inventory_snapshot_changed');
  }
  return true;
}

export async function assertInventoryRemovalConsumesAllUnlockedItems(
  client: import('pg').PoolClient,
  playerId: string,
  removedItems: readonly DurableInventoryItemSnapshot[],
): Promise<true> {
  if (removedItems.length === 0) {
    throw new Error('inventory_empty_removal_invalid');
  }
  const persisted = await client.query<{
    item_id?: unknown;
    count?: unknown;
    raw_payload?: unknown;
  }>(
    `SELECT item_id, count, raw_payload
       FROM ${PLAYER_INVENTORY_ITEM_TABLE}
      WHERE player_id = $1
        AND locked_by IS NULL
      FOR UPDATE`,
    [playerId],
  );
  const persistedCounts = new Map<string, number>();
  for (const row of persisted.rows) {
    const itemId = normalizeRequiredString(row?.item_id);
    const count = Math.max(1, Math.trunc(Number(row?.count ?? 1)));
    const signature = createPersistedInventoryRowSignature(itemId, normalizeDurableJsonObject(row?.raw_payload));
    const key = `${itemId}\u0000${signature}`;
    persistedCounts.set(key, (persistedCounts.get(key) ?? 0) + count);
  }
  const removedCounts = new Map<string, number>();
  for (const removedItem of removedItems) {
    const itemId = normalizeRequiredString(removedItem?.itemId);
    const count = Math.max(1, Math.trunc(Number(removedItem?.count ?? 1)));
    if (!itemId) {
      throw new Error('inventory_empty_removal_invalid');
    }
    const rawPayload = buildPersistedInventoryItemRawPayload({
      itemId,
      count,
      name: removedItem.name,
      desc: removedItem.desc,
      enhanceLevel: removedItem.enhanceLevel,
      learnTechniqueId: removedItem.learnTechniqueId,
      learnTechniqueMaxLevel: removedItem.learnTechniqueMaxLevel,
      grade: removedItem.grade,
      level: removedItem.level,
      rawPayload: removedItem.rawPayload,
    });
    const signature = createPersistedInventoryRowSignature(itemId, rawPayload);
    const key = `${itemId}\u0000${signature}`;
    removedCounts.set(key, (removedCounts.get(key) ?? 0) + count);
  }
  if (
    persistedCounts.size !== removedCounts.size
    || Array.from(persistedCounts).some(([key, count]) => removedCounts.get(key) !== count)
  ) {
    throw new Error('inventory_empty_removal_snapshot_changed');
  }
  return true;
}

export async function assertUnlockedInventoryIsEmpty(
  client: import('pg').PoolClient,
  playerId: string,
): Promise<true> {
  const persisted = await client.query(
    `SELECT 1
       FROM ${PLAYER_INVENTORY_ITEM_TABLE}
      WHERE player_id = $1
        AND locked_by IS NULL
      LIMIT 1
      FOR UPDATE`,
    [playerId],
  );
  if ((persisted.rowCount ?? 0) > 0) {
    throw new Error('inventory_empty_snapshot_changed');
  }
  return true;
}

export async function assertNoForeignPlayerOwnedIds(
  client: import('pg').PoolClient,
  tableName: string,
  idColumnName: string,
  playerId: string,
  ids: readonly string[],
  domainTag: string,
): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  assertSafeIdentifier(tableName);
  assertSafeIdentifier(idColumnName);
  const result = await client.query<{ conflicting_id?: unknown; owner_id?: unknown }>(
    `
      SELECT ${quoteIdentifier(idColumnName)} AS conflicting_id, player_id AS owner_id
      FROM ${quoteIdentifier(tableName)}
      WHERE ${quoteIdentifier(idColumnName)} = ANY($2::varchar[])
        AND player_id <> $1
      LIMIT 1
      FOR UPDATE
    `,
    [playerId, ids],
  );
  if ((result.rowCount ?? 0) > 0) {
    throw new Error(
      `replace_${domainTag}_ownership_conflict:playerId=${playerId}`
      + ` id=${normalizeRequiredString(result.rows[0]?.conflicting_id) || 'unknown'}`
      + ` owner=${normalizeRequiredString(result.rows[0]?.owner_id) || 'unknown'}`,
    );
  }
}

export function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeDurableJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  try {
    const parsed = JSON.parse(JSON.stringify(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  }
  catch {
    return {};
  }
}

export function createPersistedInventoryRowSignature(itemId: string, rawPayload: Record<string, unknown>): string {
  return createItemStackSignature({
    itemId,
    ...rawPayload,
  });
}

export async function acquireSchemaInitLock(client: import('pg').PoolClient): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock($1::integer, $2::integer)', [7100, 1]);
}


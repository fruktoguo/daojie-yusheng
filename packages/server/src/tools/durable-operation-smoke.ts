import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { Pool } from 'pg';

import { ContentTemplateRepository } from '../content/content-template.repository';
import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DurableOperationService } from '../persistence/durable-operation.service';
import { MailPersistenceService } from '../persistence/mail-persistence.service';
import type { PersistedPlayerSnapshot } from '../persistence/player-persistence.service';
import { MailRuntimeService } from '../runtime/mail/mail-runtime.service';

const databaseUrl = resolveServerDatabaseUrl();

const PLAYER_SCOPED_TABLES = [
  'durable_operation_log',
  'outbox_event',
  'asset_audit_log',
  'player_mail_attachment',
  'player_mail',
  'player_mail_counter',
  'player_inventory_item',
  'player_presence',
  'player_recovery_watermark',
  'server_player_snapshot',
] as const;

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
          answers: 'with-db 下 DurableOperationService 会校验 session fencing，并驱动 MailRuntimeService 的邮件附件领取在单事务内提交 mail/inventory/snapshot/outbox/audit/watermark',
          excludes: '不证明真实世界 tick 入口、并发客户端冲突窗口、GM 备份恢复或多节点 outbox 消费',
          completionMapping: 'replace-ready:proof:with-db.durable-operation',
        },
        null,
        2,
      ),
    );
    return;
  }

  const now = Date.now();
  const playerId = `do_${now.toString(36)}`;
  const runtimePlayerId = `mr_${now.toString(36)}`;
  const runtimeOwnerId = `runtime:${playerId}:7`;
  const operationId = `op:${playerId}:claim:1`;
  const mailId = `mail:${playerId}:1`;
  const attachmentId = `attachment:${playerId}:1`;
  const runtimeOwnerRuntimeId = `runtime:${runtimePlayerId}:7`;
  const runtimeMailId = `mail:${runtimePlayerId}:1`;
  const runtimeAttachmentId = `attachment:${runtimePlayerId}:1`;
  const service = new DurableOperationService();
  const mailPersistence = new MailPersistenceService();
  const contentTemplateRepository = new ContentTemplateRepository();
  const pool = new Pool({ connectionString: databaseUrl });
  const runtimePlayerState = {
    sessionEpoch: 7,
    runtimeOwnerId: runtimeOwnerRuntimeId,
    inventoryItems: [] as Array<Record<string, unknown>>,
  };
  const mailRuntime = new MailRuntimeService(
    contentTemplateRepository,
    {
      getPlayerOrThrow(targetPlayerId: string) {
        if (targetPlayerId !== runtimePlayerId) {
          throw new Error(`unexpected runtime player: ${targetPlayerId}`);
        }
        return {
          inventory: {
            capacity: 24,
            items: runtimePlayerState.inventoryItems.map((entry) => ({ ...entry })),
          },
        };
      },
      getSessionFence(targetPlayerId: string) {
        if (targetPlayerId !== runtimePlayerId) {
          return null;
        }
        return {
          runtimeOwnerId: runtimePlayerState.runtimeOwnerId,
          sessionEpoch: runtimePlayerState.sessionEpoch,
        };
      },
      buildPersistenceSnapshot(targetPlayerId: string) {
        if (targetPlayerId !== runtimePlayerId) {
          return null;
        }
        return buildNextSnapshot(now + 100);
      },
      replaceInventoryItems(targetPlayerId: string, items: unknown[]) {
        if (targetPlayerId !== runtimePlayerId) {
          throw new Error(`unexpected runtime inventory replace player: ${targetPlayerId}`);
        }
        runtimePlayerState.inventoryItems = Array.isArray(items)
          ? items
              .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
              .map((entry) => ({ ...entry }))
          : [];
      },
      receiveInventoryItem() {
        throw new Error('runtime fallback path should not execute during durable-operation smoke');
      },
    } as any,
    mailPersistence,
    service,
    {
      isEnabled() {
        return true;
      },
      async savePlayerPresence() {
        return;
      },
    } as any,
  );

  await service.onModuleInit();
  await mailPersistence.onModuleInit();
  contentTemplateRepository.onModuleInit();
  if (!service.isEnabled()) {
    throw new Error('durable-operation service not enabled');
  }
  if (!mailPersistence.isEnabled()) {
    throw new Error('mail-persistence service not enabled');
  }

  try {
    await cleanupPlayer(pool, playerId);
    await cleanupPlayer(pool, runtimePlayerId);
    await seedClaimFixture(pool, {
      playerId,
      runtimeOwnerId,
      sessionEpoch: 7,
      mailId,
      attachmentId,
      now,
    });

    let fencingRejected = false;
    try {
      await service.claimMailAttachments({
        operationId: `op:${playerId}:wrong-session`,
        playerId,
        expectedRuntimeOwnerId: runtimeOwnerId,
        expectedSessionEpoch: 8,
        mailIds: [mailId],
        nextInventoryItems: buildNextInventoryItems(),
        nextPlayerSnapshot: buildNextSnapshot(now),
      });
    } catch (error) {
      fencingRejected = String(error instanceof Error ? error.message : error).includes('player_session_fencing_conflict');
    }
    if (!fencingRejected) {
      throw new Error('expected stale session fencing rejection before durable claim');
    }

    const firstResult = await service.claimMailAttachments({
      operationId,
      playerId,
      expectedRuntimeOwnerId: runtimeOwnerId,
      expectedSessionEpoch: 7,
      mailIds: [mailId],
      nextInventoryItems: buildNextInventoryItems(),
      nextPlayerSnapshot: buildNextSnapshot(now),
    });
    if (!firstResult.ok || firstResult.alreadyCommitted) {
      throw new Error(`unexpected first durable claim result: ${JSON.stringify(firstResult)}`);
    }

    const secondResult = await service.claimMailAttachments({
      operationId,
      playerId,
      expectedRuntimeOwnerId: runtimeOwnerId,
      expectedSessionEpoch: 7,
      mailIds: [mailId],
      nextInventoryItems: buildNextInventoryItems(),
      nextPlayerSnapshot: buildNextSnapshot(now),
    });
    if (!secondResult.ok || !secondResult.alreadyCommitted) {
      throw new Error(`unexpected replay durable claim result: ${JSON.stringify(secondResult)}`);
    }

    const operationRow = await fetchSingleRow(
      pool,
      'SELECT status, committed_at FROM durable_operation_log WHERE operation_id = $1',
      [operationId],
    );
    const outboxRows = await fetchRows(
      pool,
      'SELECT topic, status FROM outbox_event WHERE operation_id = $1 ORDER BY event_id ASC',
      [operationId],
    );
    const auditRows = await fetchRows(
      pool,
      'SELECT asset_type, action FROM asset_audit_log WHERE operation_id = $1 ORDER BY log_id ASC',
      [operationId],
    );
    const inventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [playerId],
    );
    const mailRow = await fetchSingleRow(pool, 'SELECT read_at, claimed_at, mail_version FROM player_mail WHERE mail_id = $1', [
      mailId,
    ]);
    const attachmentRow = await fetchSingleRow(
      pool,
      'SELECT claim_operation_id, claimed_at FROM player_mail_attachment WHERE attachment_id = $1',
      [attachmentId],
    );
    const counterRow = await fetchSingleRow(
      pool,
      'SELECT unread_count, unclaimed_count, counter_version FROM player_mail_counter WHERE player_id = $1',
      [playerId],
    );
    const watermarkRow = await fetchSingleRow(
      pool,
      'SELECT inventory_version, mail_version, mail_counter_version FROM player_recovery_watermark WHERE player_id = $1',
      [playerId],
    );
    const snapshotRow = await fetchSingleRow(
      pool,
      'SELECT persisted_source, saved_at, payload FROM server_player_snapshot WHERE player_id = $1',
      [playerId],
    );

    if (!operationRow || operationRow.status !== 'committed' || !operationRow.committed_at) {
      throw new Error(`unexpected durable_operation_log row: ${JSON.stringify(operationRow)}`);
    }
    if (outboxRows.length !== 1 || outboxRows[0]?.topic !== 'player.mail.claimed' || outboxRows[0]?.status !== 'ready') {
      throw new Error(`unexpected outbox_event rows: ${JSON.stringify(outboxRows)}`);
    }
    if (auditRows.length !== 1 || auditRows[0]?.asset_type !== 'mail_claim' || auditRows[0]?.action !== 'claim') {
      throw new Error(`unexpected asset_audit_log rows: ${JSON.stringify(auditRows)}`);
    }
    if (inventoryRows.length !== 1 || inventoryRows[0]?.item_id !== 'spirit_stone' || Number(inventoryRows[0]?.count) !== 1) {
      throw new Error(`unexpected player_inventory_item rows: ${JSON.stringify(inventoryRows)}`);
    }
    if (!mailRow || !mailRow.read_at || !mailRow.claimed_at || Number(mailRow.mail_version) < 2) {
      throw new Error(`unexpected player_mail row: ${JSON.stringify(mailRow)}`);
    }
    if (!attachmentRow || attachmentRow.claim_operation_id !== operationId || !attachmentRow.claimed_at) {
      throw new Error(`unexpected player_mail_attachment row: ${JSON.stringify(attachmentRow)}`);
    }
    if (
      !counterRow
      || Number(counterRow.unread_count) !== 0
      || Number(counterRow.unclaimed_count) !== 0
      || Number(counterRow.counter_version) <= 0
    ) {
      throw new Error(`unexpected player_mail_counter row: ${JSON.stringify(counterRow)}`);
    }
    if (
      !watermarkRow
      || Number(watermarkRow.inventory_version) <= 0
      || Number(watermarkRow.mail_version) <= 0
      || Number(watermarkRow.mail_counter_version) <= 0
    ) {
      throw new Error(`unexpected player_recovery_watermark row: ${JSON.stringify(watermarkRow)}`);
    }
    const snapshotPayload = asRecord(snapshotRow?.payload);
    const inventoryItems = Array.isArray(snapshotPayload?.inventory && asRecord(snapshotPayload.inventory)?.items)
      ? (asRecord(snapshotPayload.inventory)?.items as unknown[])
      : [];
    if (!snapshotRow || snapshotRow.persisted_source !== 'native' || inventoryItems.length !== 1) {
      throw new Error(`unexpected server_player_snapshot row: ${JSON.stringify(snapshotRow)}`);
    }

    await seedClaimFixture(pool, {
      playerId: runtimePlayerId,
      runtimeOwnerId: runtimeOwnerRuntimeId,
      sessionEpoch: 7,
      mailId: runtimeMailId,
      attachmentId: runtimeAttachmentId,
      now: now + 10,
    });

    runtimePlayerState.sessionEpoch = 8;
    const runtimeRejectedResult = await mailRuntime.claimAttachments(runtimePlayerId, [runtimeMailId]);
    if (runtimeRejectedResult.ok || !String(runtimeRejectedResult.message ?? '').includes('当前会话已失效')) {
      throw new Error(`expected runtime fencing rejection before durable claim, got ${JSON.stringify(runtimeRejectedResult)}`);
    }
    const runtimeRejectedSummary = await mailRuntime.getSummary(runtimePlayerId);
    if (runtimeRejectedSummary.unreadCount !== 1 || runtimeRejectedSummary.claimableCount !== 1) {
      throw new Error(`expected runtime state to stay unchanged after rejected durable claim, got ${JSON.stringify(runtimeRejectedSummary)}`);
    }
    if (runtimePlayerState.inventoryItems.length !== 0) {
      throw new Error(`expected runtime inventory to stay unchanged after rejected durable claim, got ${JSON.stringify(runtimePlayerState.inventoryItems)}`);
    }

    runtimePlayerState.sessionEpoch = 7;
    const runtimeResult = await mailRuntime.claimAttachments(runtimePlayerId, [runtimeMailId]);
    if (!runtimeResult.ok) {
      throw new Error(`unexpected runtime durable claim result: ${JSON.stringify(runtimeResult)}`);
    }
    const runtimeReplayResult = await mailRuntime.claimAttachments(runtimePlayerId, [runtimeMailId]);
    if (runtimeReplayResult.ok || !String(runtimeReplayResult.message ?? '').includes('当前没有可领取附件的邮件')) {
      throw new Error(`expected runtime replay to observe claimed mailbox state, got ${JSON.stringify(runtimeReplayResult)}`);
    }
    const runtimeSummary = await mailRuntime.getSummary(runtimePlayerId);
    if (runtimeSummary.unreadCount !== 0 || runtimeSummary.claimableCount !== 0) {
      throw new Error(`unexpected runtime mail summary after claim: ${JSON.stringify(runtimeSummary)}`);
    }

    const runtimeMailRow = await fetchSingleRow(
      pool,
      'SELECT read_at, claimed_at, mail_version FROM player_mail WHERE mail_id = $1',
      [runtimeMailId],
    );
    const runtimeAttachmentRow = await fetchSingleRow(
      pool,
      'SELECT claim_operation_id, claimed_at FROM player_mail_attachment WHERE attachment_id = $1',
      [runtimeAttachmentId],
    );
    const runtimeCounterRow = await fetchSingleRow(
      pool,
      'SELECT unread_count, unclaimed_count, counter_version FROM player_mail_counter WHERE player_id = $1',
      [runtimePlayerId],
    );
    if (!runtimeMailRow || !runtimeMailRow.read_at || !runtimeMailRow.claimed_at || Number(runtimeMailRow.mail_version) < 2) {
      throw new Error(`unexpected runtime player_mail row: ${JSON.stringify(runtimeMailRow)}`);
    }
    if (
      !runtimeAttachmentRow
      || runtimeAttachmentRow.claim_operation_id !== `mail-claim:${runtimePlayerId}:7:${runtimeMailId}`
      || !runtimeAttachmentRow.claimed_at
    ) {
      throw new Error(`unexpected runtime player_mail_attachment row: ${JSON.stringify(runtimeAttachmentRow)}`);
    }
    if (
      !runtimeCounterRow
      || Number(runtimeCounterRow.unread_count) !== 0
      || Number(runtimeCounterRow.unclaimed_count) !== 0
      || Number(runtimeCounterRow.counter_version) <= 0
    ) {
      throw new Error(`unexpected runtime player_mail_counter row: ${JSON.stringify(runtimeCounterRow)}`);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          playerId,
          runtimePlayerId,
          answers: 'with-db 下已验证 DurableOperationService 的 session fencing 与 operation_id 幂等回放，以及 MailRuntimeService 真实领取入口会走 durable claim 主链并刷新结构化邮箱真源',
          excludes: '不证明真实客户端并发窗口、tick 编排内 mutation intent、GM restore、批量投递或 outbox dispatcher 消费',
          completionMapping: 'replace-ready:proof:with-db.durable-operation',
          firstResult,
          secondResult,
          runtimeRejectedResult,
          runtimeResult,
          outboxCount: outboxRows.length,
          auditCount: auditRows.length,
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupPlayer(pool, playerId).catch(() => undefined);
    await cleanupPlayer(pool, runtimePlayerId).catch(() => undefined);
    await pool.end().catch(() => undefined);
    await mailPersistence.onModuleDestroy().catch(() => undefined);
    await service.onModuleDestroy().catch(() => undefined);
  }
}

async function seedClaimFixture(
  pool: Pool,
  input: {
    playerId: string;
    runtimeOwnerId: string;
    sessionEpoch: number;
    mailId: string;
    attachmentId: string;
    now: number;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO player_presence(
          player_id,
          online,
          in_world,
          last_heartbeat_at,
          runtime_owner_id,
          session_epoch,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now())
      `,
      [input.playerId, true, true, input.now, input.runtimeOwnerId, input.sessionEpoch],
    );
    await client.query(
      `
        INSERT INTO player_mail(
          mail_id,
          player_id,
          sender_type,
          sender_label,
          mail_type,
          title,
          body,
          metadata_jsonb,
          mail_version,
          created_at,
          updated_at
        )
        VALUES ($1, $2, 'system', 'system', 'system', $3, $4, '{}'::jsonb, 1, $5, now())
      `,
      [input.mailId, input.playerId, 'durable smoke', 'durable smoke body', input.now],
    );
    await client.query(
      `
        INSERT INTO player_mail_attachment(
          attachment_id,
          mail_id,
          player_id,
          attachment_kind,
          item_id,
          count,
          item_payload_jsonb,
          created_at
        )
        VALUES ($1, $2, $3, 'item', 'spirit_stone', 1, $4::jsonb, now())
      `,
      [input.attachmentId, input.mailId, input.playerId, JSON.stringify({ itemId: 'spirit_stone', count: 1 })],
    );
    await client.query(
      `
        INSERT INTO server_player_snapshot(
          player_id,
          template_id,
          instance_id,
          persisted_source,
          saved_at,
          updated_at,
          payload
        )
        VALUES ($1, 'yunlai_town', 'public:yunlai_town', 'native', $2, now(), $3::jsonb)
      `,
      [input.playerId, input.now, JSON.stringify(buildNextSnapshot(input.now))],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function buildNextInventoryItems() {
  return [
    {
      itemId: 'spirit_stone',
      count: 1,
      rawPayload: {
        itemId: 'spirit_stone',
        count: 1,
      },
    },
  ];
}

function buildNextSnapshot(now: number): PersistedPlayerSnapshot {
  return {
    version: 1,
    savedAt: now + 1,
    placement: {
      instanceId: 'public:yunlai_town',
      templateId: 'yunlai_town',
      x: 31,
      y: 54,
      facing: 1,
    },
    worldPreference: {
      linePreset: 'peaceful',
    },
    vitals: {
      hp: 100,
      maxHp: 100,
      qi: 0,
      maxQi: 100,
    },
    progression: {
      foundation: 0,
      combatExp: 0,
      bodyTraining: null,
      alchemySkill: null,
      gatherSkill: null,
      gatherJob: null,
      alchemyPresets: [],
      alchemyJob: null,
      enhancementSkill: null,
      enhancementSkillLevel: 1,
      enhancementJob: null,
      enhancementRecords: [],
      boneAgeBaseYears: 18,
      lifeElapsedTicks: 0,
      lifespanYears: null,
      realm: null,
      heavenGate: null,
      spiritualRoots: null,
    },
    unlockedMapIds: ['yunlai_town'],
    inventory: {
      revision: 2,
      capacity: 24,
      items: [{ itemId: 'spirit_stone', count: 1 }],
    },
    equipment: {
      revision: 1,
      slots: [],
    },
    techniques: {
      revision: 1,
      techniques: [],
      cultivatingTechId: null,
    },
    buffs: {
      revision: 1,
      buffs: [],
    },
    quests: {
      revision: 1,
      entries: [],
    },
    combat: {
      autoBattle: false,
      autoRetaliate: true,
      autoBattleStationary: false,
      combatTargetId: null,
      combatTargetLocked: false,
      allowAoePlayerHit: false,
      autoIdleCultivation: true,
      autoSwitchCultivation: false,
      senseQiActive: false,
      autoBattleSkills: [],
    },
    pendingLogbookMessages: [],
    runtimeBonuses: [],
  };
}

async function cleanupPlayer(pool: Pool, playerId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM outbox_event WHERE partition_key = $1 OR operation_id LIKE $2', [playerId, `op:${playerId}:%`]);
    await client.query('DELETE FROM asset_audit_log WHERE player_id = $1 OR operation_id LIKE $2', [playerId, `op:${playerId}:%`]);
    await client.query('DELETE FROM durable_operation_log WHERE player_id = $1 OR operation_id LIKE $2', [playerId, `op:${playerId}:%`]);
    for (const tableName of PLAYER_SCOPED_TABLES.slice(3)) {
      await client.query(`DELETE FROM ${quoteIdentifier(tableName)} WHERE player_id = $1`, [playerId]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function fetchSingleRow(pool: Pool, sql: string, params: unknown[]): Promise<Record<string, unknown> | null> {
  const result = await pool.query(sql, params);
  return (result.rows?.[0] as Record<string, unknown> | undefined) ?? null;
}

async function fetchRows(pool: Pool, sql: string, params: unknown[]): Promise<Array<Record<string, unknown>>> {
  const result = await pool.query(sql, params);
  return (result.rows ?? []) as Array<Record<string, unknown>>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/gu, '""')}"`;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

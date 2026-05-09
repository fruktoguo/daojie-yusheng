import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { CombatAuditOutboxService, COMBAT_AUDIT_TOPIC } from '../persistence/combat-audit-outbox.service';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

const databaseUrl = resolveServerDatabaseUrl();

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
      answers: 'with-db 下验证战斗审计事件异步转出到 outbox_event 和 asset_audit_log；无数据库环境时跳过',
      excludes: '不证明真实战斗 tick 已产生线上审计，也不证明 outbox worker 已消费 topic',
    }, null, 2));
    return;
  }

  const playerId = `combat_audit_${Date.now().toString(36)}`;
  const provider = new DatabasePoolProvider();
  let service = new CombatAuditOutboxService(provider);
  const pool = new Pool({ connectionString: databaseUrl });
  const touchedOperationIds: string[] = [];
  const instanceId = `instance:${playerId}`;
  const targetId = `monster:${playerId}`;
  const since = new Date(Date.now() - 60_000).toISOString();

  try {
    await service.onModuleInit();
    if (!service.isEnabled()) {
      throw new Error('combat audit outbox service should be enabled with database url');
    }

    const events = [
      {
        action: 'damage',
        result: {
          damage: 7,
          rawDamage: 9,
          dodged: false,
        },
        tags: ['smoke'],
      },
      {
        action: 'kill',
        actionId: 'monster_kill',
        result: {
          defeated: true,
          monsterId: targetId,
        },
        tags: ['smoke', 'semantic'],
      },
      {
        action: 'death',
        actionId: 'player_death',
        result: {
          defeated: true,
          deathPenalty: { consumedProgress: 1 },
        },
        tags: ['smoke', 'semantic'],
      },
      {
        action: 'loot_drop',
        actionId: 'monster_loot',
        result: {
          item: { itemId: 'rat_tail', count: 1 },
          dropped: true,
          reason: 'inventory_full',
        },
        tags: ['smoke', 'semantic'],
      },
      {
        action: 'loot_grant',
        actionId: 'monster_loot',
        result: {
          item: { itemId: 'rat_tail', count: 1 },
          granted: true,
        },
        tags: ['smoke', 'semantic'],
      },
      {
        action: 'exp_gain',
        actionId: 'monster_kill_progress',
        result: {
          delta: { combatExp: 12 },
        },
        tags: ['smoke', 'semantic'],
      },
    ];
    for (const event of events) {
      const enqueued = service.enqueue({
      type: 'combat_audit',
      action: event.action,
      instanceId,
      phase: 'instant',
      actor: {
        kind: 'player',
        id: playerId,
      },
      actionId: 'basic_attack',
      target: {
        kind: 'monster',
        id: targetId,
        x: 12,
        y: 8,
      },
      result: event.result,
      application: {
        dirtyDomains: ['instance:monster_runtime'],
      },
      createdAt: new Date().toISOString(),
      tags: event.tags,
    });
      if (!enqueued) {
        throw new Error(`combat audit event should enqueue action=${event.action}`);
      }
    }
    if (service.getQueueSize() !== events.length) {
      throw new Error(`combat audit event should enqueue without synchronous DB write: size=${service.getQueueSize()}`);
    }

    const flushed = await service.flushOnce();
    if (flushed !== events.length || service.getQueueSize() !== 0) {
      throw new Error(`unexpected combat audit flush result flushed=${flushed} queue=${service.getQueueSize()}`);
    }

    const auditRows = await service.queryCombatAuditRows({
      playerId,
      instanceId,
      targetId,
      since,
      until: new Date(Date.now() + 60_000).toISOString(),
      limit: 20,
    });
    const actions = new Set(auditRows.map((row) => String(row.action ?? '')));
    if (
      auditRows.length !== events.length
      || auditRows.some((row) => row?.player_id !== playerId || row?.asset_type !== 'combat')
      || events.some((event) => !actions.has(event.action))
    ) {
      throw new Error(`unexpected combat audit rows: ${JSON.stringify(auditRows)}`);
    }
    const operationId = String(auditRows[0]?.operation_id ?? '');
    touchedOperationIds.push(...auditRows.map((row) => String(row.operation_id ?? '')).filter(Boolean));

    const outboxRows = await fetchRows(
      pool,
      'SELECT topic, partition_key, status FROM outbox_event WHERE operation_id = ANY($1::varchar[]) ORDER BY event_id ASC',
      [touchedOperationIds],
    );
    if (
      outboxRows.length !== events.length
      || outboxRows.some((row) => row?.topic !== COMBAT_AUDIT_TOPIC || row?.partition_key !== playerId || row?.status !== 'ready')
    ) {
      throw new Error(`unexpected combat audit outbox rows: ${JSON.stringify(outboxRows)}`);
    }

    await service.onModuleDestroy();
    service = new CombatAuditOutboxService(provider);
    await service.onModuleInit();
    const recoveredRows = await service.queryCombatAuditRows({
      playerId,
      instanceId,
      targetId,
      since,
      limit: 20,
    });
    const recoveredActions = new Set(recoveredRows.map((row) => String(row.action ?? '')));
    if (recoveredRows.length !== events.length || events.some((event) => !recoveredActions.has(event.action))) {
      throw new Error(`combat audit row should remain queryable after service rebuild: ${JSON.stringify(recoveredRows)}`);
    }

    console.log(JSON.stringify({
      ok: true,
      case: 'combat-audit-outbox',
      answers: 'with-db 下战斗审计事件现在会先同步进入内存队列，再异步 flush 到 outbox_event 和 asset_audit_log；写库不发生在战斗 recordOutcome 同步路径内；数据库审计可按玩家/实例/目标/时间范围查询，且 damage/kill/death/loot_drop/loot_grant/exp_gain 语义化 action 服务重建后仍可回读',
      excludes: '不证明 outbox worker 已消费 combat.audit.recorded；真实战斗副作用点是否产出语义 action 由 world-runtime-player-combat smoke 覆盖',
      operationId,
      outboxRows,
      recoveredRowCount: recoveredRows.length,
      auditRows: auditRows.map((row) => ({
        operation_id: row.operation_id,
        player_id: row.player_id,
        asset_type: row.asset_type,
        action: row.action,
      })),
    }, null, 2));
  } finally {
    await service.cleanupByOperationIds(touchedOperationIds).catch(() => undefined);
    await service.onModuleDestroy().catch(() => undefined);
    await provider.onModuleDestroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

async function fetchRows(pool: Pool, sql: string, params: unknown[]): Promise<Array<Record<string, unknown>>> {
  const result = await pool.query(sql, params);
  return Array.isArray(result.rows) ? result.rows as Array<Record<string, unknown>> : [];
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

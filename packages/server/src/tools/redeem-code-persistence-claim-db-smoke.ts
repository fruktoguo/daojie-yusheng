import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

import { installSmokeTimeout } from './smoke-timeout';
import { resolveServerDatabasePoolerUrl, resolveServerDatabaseUrl } from '../config/env-alias';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import { RedeemCodePersistenceService } from '../persistence/redeem-code-persistence.service';

installSmokeTimeout(__filename);

async function main(): Promise<void> {
  const databaseUrl = resolveServerDatabasePoolerUrl() || resolveServerDatabaseUrl();
  if (!databaseUrl.trim()) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
      answers: '兑换码持久化核销真实 PostgreSQL 参数类型验证需要数据库连接',
    }, null, 2));
    return;
  }

  const poolProvider = new DatabasePoolProvider();
  const service = new RedeemCodePersistenceService(poolProvider);
  const now = new Date().toISOString();
  const suffix = randomUUID();
  const groupId = `redeem-group:claim-db-smoke:${suffix}`;
  const codeId = `redeem-code:claim-db-smoke:${suffix}`;
  const code = `DBCLAIM${suffix.replace(/-/gu, '').toUpperCase()}`;
  const playerId = `player:claim-db-smoke:${suffix}`;
  const playerName = '兑换核销DB烟测';
  const pool = poolProvider.getPool('redeem-code');
  if (!pool) {
    throw new Error('redeem_code_db_smoke_pool_missing');
  }

  try {
    await service.onModuleInit();
    assert.equal(service.isEnabled(), true);
    await pool.query(
      `
        INSERT INTO server_redeem_code_group(group_id, name, rewards_payload, created_at, updated_at, raw_payload)
        VALUES ($1, $2, $3::jsonb, $4::timestamptz, $4::timestamptz, $5::jsonb)
      `,
      [
        groupId,
        '兑换核销DB烟测',
        JSON.stringify([{ itemId: 'spirit_stone', count: 1 }]),
        now,
        JSON.stringify({
          id: groupId,
          name: '兑换核销DB烟测',
          rewards: [{ itemId: 'spirit_stone', count: 1 }],
          createdAt: now,
          updatedAt: now,
        }),
      ],
    );
    await pool.query(
      `
        INSERT INTO server_redeem_code(code_id, group_id, code, status, created_at, updated_at, raw_payload)
        VALUES ($1, $2, $3, 'active', $4::timestamptz, $4::timestamptz, $5::jsonb)
      `,
      [
        codeId,
        groupId,
        code,
        now,
        JSON.stringify({
          id: codeId,
          groupId,
          code,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        }),
      ],
    );

    const claimResult = await service.claimCodeForUse({
      code,
      playerId,
      playerName,
      usedAt: now,
    });
    assert.equal(claimResult.ok, true);
    assert.equal(claimResult.code?.usedByPlayerId, playerId);

    const rowResult = await pool.query(
      'SELECT status, used_by_player_id, used_by_role_name, raw_payload FROM server_redeem_code WHERE code_id = $1',
      [codeId],
    );
    const row = rowResult.rows[0];
    assert.equal(row.status, 'used');
    assert.equal(row.used_by_player_id, playerId);
    assert.equal(row.used_by_role_name, playerName);
    assert.equal(row.raw_payload?.usedByPlayerId, playerId);
    assert.equal(row.raw_payload?.usedByRoleName, playerName);
    assert.equal(row.raw_payload?.usedAt, now);

    console.log(JSON.stringify({
      ok: true,
      case: 'redeem-code-persistence-claim-db',
      codeId,
      answers: 'RedeemCodePersistenceService.claimCodeForUse 已在真实 PostgreSQL 上完成核销和 raw_payload 写入，参数类型不会再冲突',
      excludes: '不证明完整 socket 兑换、背包发奖或跨节点并发竞争',
      completionMapping: 'release:proof:redeem-code-persistence-claim-db',
    }, null, 2));
  }
  finally {
    await pool.query('DELETE FROM server_redeem_code WHERE code_id = $1', [codeId]).catch(() => undefined);
    await pool.query('DELETE FROM server_redeem_code_group WHERE group_id = $1', [groupId]).catch(() => undefined);
    await poolProvider.onModuleDestroy();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

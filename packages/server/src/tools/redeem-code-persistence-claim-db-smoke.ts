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
  const destroyCodeId = `redeem-code:claim-destroy-db-smoke:${suffix}`;
  const destroyCode = `DBDESTROY${suffix.replace(/-/gu, '').toUpperCase()}`;
  const playerId = `player:claim-db-smoke:${suffix}`;
  const playerName = '兑换核销DB烟测';
  let previousStateRevision: number | null = null;
  let expectedFinalStateRevision: number | null = null;
  const pool = poolProvider.getPool('redeem-code');
  if (!pool) {
    throw new Error('redeem_code_db_smoke_pool_missing');
  }

  try {
    await service.onModuleInit();
    assert.equal(service.isEnabled(), true);
    const previousState = await pool.query(
      'SELECT revision FROM server_redeem_code_state WHERE state_key = $1',
      ['global'],
    );
    previousStateRevision = previousState.rowCount
      ? Number(previousState.rows[0]?.revision)
      : null;
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

    const operationId = `op:${playerId}:redeem-code:${code}`;
    const claimResult = await service.claimCodeForUse({
      code,
      playerId,
      playerName,
      usedAt: now,
      operationId,
    });
    assert.equal(claimResult.ok, true);
    assert.equal(claimResult.code?.status, 'pending');
    assert.equal(claimResult.code?.pendingOperationId, operationId);
    assert.deepEqual(claimResult.code?.pendingRewards, [{ itemId: 'spirit_stone', count: 1 }]);

    await pool.query(
      'UPDATE server_redeem_code_group SET rewards_payload = $2::jsonb WHERE group_id = $1',
      [groupId, JSON.stringify([{ itemId: 'spirit_stone', count: 99 }])],
    );
    const replayedClaimResult = await service.claimCodeForUse({
      code,
      playerId,
      playerName,
      usedAt: now,
      operationId,
    });
    assert.equal(replayedClaimResult.ok, true);
    assert.deepEqual(
      replayedClaimResult.code?.pendingRewards,
      [{ itemId: 'spirit_stone', count: 1 }],
      'pending 重试必须保留首次 claim 时的奖励快照',
    );

    const pendingRowResult = await pool.query(
      'SELECT status, used_by_player_id, used_by_role_name, raw_payload FROM server_redeem_code WHERE code_id = $1',
      [codeId],
    );
    const pendingRow = pendingRowResult.rows[0];
    assert.equal(pendingRow.status, 'pending');
    assert.equal(pendingRow.used_by_player_id, null);
    assert.equal(pendingRow.raw_payload?.pendingOperationId, operationId);
    assert.equal(pendingRow.raw_payload?.pendingByPlayerId, playerId);
    assert.deepEqual(pendingRow.raw_payload?.pendingRewards, [{ itemId: 'spirit_stone', count: 1 }]);

    const finalizeResult = await service.finalizeCodeUse({
      code,
      playerId,
      playerName,
      usedAt: now,
      operationId,
    });
    assert.equal(finalizeResult.ok, true);
    assert.equal(finalizeResult.code?.usedByPlayerId, playerId);

    const stateBeforeStaleSave = await pool.query(
      'SELECT revision FROM server_redeem_code_state WHERE state_key = $1',
      ['global'],
    );
    const staleSaveResult = await service.saveDocument({
      version: 1,
      revision: 1,
      groups: [{
        id: groupId,
        name: '兑换核销DB烟测',
        rewards: [{ itemId: 'spirit_stone', count: 99 }],
        createdAt: now,
        updatedAt: now,
      }],
      codes: [{
        id: codeId,
        groupId,
        code,
        status: 'active',
        usedByPlayerId: null,
        usedByRoleName: null,
        usedAt: null,
        destroyedAt: null,
        createdAt: now,
        updatedAt: now,
      }],
    });
    assert.equal(staleSaveResult, true);
    const stateAfterStaleSave = await pool.query(
      'SELECT revision FROM server_redeem_code_state WHERE state_key = $1',
      ['global'],
    );
    assert.ok(
      Number(stateAfterStaleSave.rows[0]?.revision) > Number(stateBeforeStaleSave.rows[0]?.revision),
      '陈旧全量保存也只能推进全局 revision',
    );
    const rowResult = await pool.query(
      'SELECT status, used_by_player_id, used_by_role_name, raw_payload FROM server_redeem_code WHERE code_id = $1',
      [codeId],
    );
    const row = rowResult.rows[0];
    assert.equal(row.status, 'used');
    assert.equal(row.used_by_player_id, playerId);
    assert.equal(row.used_by_role_name, playerName);
    assert.equal(row.raw_payload?.redeemOperationId, operationId);
    assert.equal(row.raw_payload?.usedByPlayerId, playerId);
    assert.equal(row.raw_payload?.usedByRoleName, playerName);
    assert.equal(new Date(row.raw_payload?.usedAt).toISOString(), now);

    await pool.query(
      `
        INSERT INTO server_redeem_code(code_id, group_id, code, status, created_at, updated_at, raw_payload)
        VALUES ($1, $2, $3, 'active', $4::timestamptz, $4::timestamptz, $5::jsonb)
      `,
      [
        destroyCodeId,
        groupId,
        destroyCode,
        now,
        JSON.stringify({
          id: destroyCodeId,
          groupId,
          code: destroyCode,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        }),
      ],
    );
    const destroyOperationId = `op:${playerId}:redeem-code:${destroyCode}`;
    const destroyClaimResult = await service.claimCodeForUse({
      code: destroyCode,
      playerId,
      playerName,
      usedAt: now,
      operationId: destroyOperationId,
    });
    assert.equal(destroyClaimResult.code?.status, 'pending');
    const destroySaveResult = await service.saveDocument({
      version: 1,
      revision: 1,
      groups: [{
        id: groupId,
        name: '兑换核销DB烟测',
        rewards: [{ itemId: 'spirit_stone', count: 99 }],
        createdAt: now,
        updatedAt: now,
      }],
      codes: [{
        id: destroyCodeId,
        groupId,
        code: destroyCode,
        status: 'destroyed',
        usedByPlayerId: null,
        usedByRoleName: null,
        usedAt: null,
        destroyedAt: now,
        createdAt: now,
        updatedAt: now,
      }],
    });
    assert.equal(destroySaveResult, true);
    const destroyedRowResult = await pool.query(
      'SELECT status, destroyed_at, raw_payload FROM server_redeem_code WHERE code_id = $1',
      [destroyCodeId],
    );
    assert.equal(destroyedRowResult.rows[0]?.status, 'destroyed');
    assert.equal(new Date(destroyedRowResult.rows[0]?.destroyed_at).toISOString(), now);
    assert.equal(destroyedRowResult.rows[0]?.raw_payload?.status, 'destroyed');

    const finalState = await pool.query(
      'SELECT revision FROM server_redeem_code_state WHERE state_key = $1',
      ['global'],
    );
    expectedFinalStateRevision = Number(finalState.rows[0]?.revision);

    console.log(JSON.stringify({
      ok: true,
      case: 'redeem-code-persistence-claim-db',
      codeId,
      answers: 'RedeemCodePersistenceService.claimCodeForUse 已在真实 PostgreSQL 上抢占 pending 并冻结首次奖励快照，分组奖励变化后的同 operationId 重放仍返回原快照；finalizeCodeUse 核销 used 后，陈旧 active 全量保存不能回退状态/raw payload；GM 仍可把 pending 码显式销毁；全局 revision 始终单调前进',
      excludes: '不证明完整 socket 兑换、背包发奖或跨节点并发竞争',
      completionMapping: 'release:proof:redeem-code-persistence-claim-db',
    }, null, 2));
  }
  finally {
    await pool.query('DELETE FROM server_redeem_code WHERE code_id = ANY($1::varchar[])', [[codeId, destroyCodeId]]).catch(() => undefined);
    await pool.query('DELETE FROM server_redeem_code_group WHERE group_id = $1', [groupId]).catch(() => undefined);
    if (expectedFinalStateRevision !== null) {
      if (previousStateRevision === null) {
        await pool.query(
          'DELETE FROM server_redeem_code_state WHERE state_key = $1 AND revision = $2',
          ['global', expectedFinalStateRevision],
        ).catch(() => undefined);
      } else {
        await pool.query(
          'UPDATE server_redeem_code_state SET revision = $2, updated_at = now() WHERE state_key = $1 AND revision = $3',
          ['global', previousStateRevision, expectedFinalStateRevision],
        ).catch(() => undefined);
      }
    }
    await poolProvider.onModuleDestroy();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

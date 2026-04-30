// @ts-nocheck

const core = require('@nestjs/core');

const { AppModule } = require('../app.module');
const { resolveServerDatabaseUrl } = require('../config/env-alias');
const { DatabasePoolProvider } = require('../persistence/database-pool.provider');
const { InstanceDomainPersistenceService } = require('../persistence/instance-domain-persistence.service');

const MAP_SNAPSHOT_SCOPES = ['server_next_map_aura_v1', 'server_map_aura_v1'];
const FORMATION_SNAPSHOT_SCOPE = 'server_instance_formations_v1';

function parseArgs(argv) {
  const options = {
    apply: false,
    dryRun: false,
    instanceIds: [],
  };
  for (const arg of argv) {
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg.startsWith('--instance-id=')) {
      const instanceId = arg.slice('--instance-id='.length).trim();
      if (instanceId) {
        options.instanceIds.push(instanceId);
      }
    }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.apply && !options.dryRun) {
    throw new Error('map dynamic persistence audit must pass either --dry-run or --apply');
  }
  const databaseUrl = resolveServerDatabaseUrl();
  if (!databaseUrl.trim()) {
    throw new Error('missing SERVER_DATABASE_URL/DATABASE_URL');
  }

  const app = await core.NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const poolProvider = app.get(DatabasePoolProvider);
    const pool = poolProvider.getPool('map-dynamic-persistence-audit');
    const instanceDomainService = app.get(InstanceDomainPersistenceService);
    const mapSnapshots = await listLegacyMapSnapshots(pool, options.instanceIds);
    const formationSnapshots = await listLegacyFormationSnapshots(pool, options.instanceIds);
    const actions = [];
    const conflicts = [];
    const skipped = [];

    for (const snapshot of mapSnapshots) {
      const counts = await loadInstanceCounts(pool, snapshot.instanceId);
      const tileResourceEntries = normalizeTileResourceEntries(snapshot.payload);
      const tileDamageEntries = normalizeTileDamageEntries(snapshot.payload);
      const groundPileEntries = Array.isArray(snapshot.payload?.groundPileEntries) ? snapshot.payload.groundPileEntries : [];
      const containerStates = Array.isArray(snapshot.payload?.containerStates) ? snapshot.payload.containerStates : [];
      const migratedDomains = [];

      if (tileResourceEntries.length > 0) {
        if (counts.tileResource === 0) {
          actions.push(buildAction(snapshot.instanceId, 'tile_resource', tileResourceEntries.length, options.apply));
          if (options.apply) {
            await instanceDomainService.saveTileResourceDiffs(snapshot.instanceId, tileResourceEntries);
            migratedDomains.push('tile_resource');
          }
        } else if (counts.tileResource !== tileResourceEntries.length) {
          conflicts.push(buildConflict(snapshot.instanceId, 'tile_resource', tileResourceEntries.length, counts.tileResource));
        } else {
          skipped.push(buildSkip(snapshot.instanceId, 'tile_resource', 'target already populated'));
        }
      }

      if (tileDamageEntries.length > 0) {
        if (counts.tileDamage === 0) {
          actions.push(buildAction(snapshot.instanceId, 'tile_damage', tileDamageEntries.length, options.apply));
          if (options.apply) {
            await instanceDomainService.saveTileDamageStates(snapshot.instanceId, tileDamageEntries);
            migratedDomains.push('tile_damage');
          }
        } else if (counts.tileDamage !== tileDamageEntries.length) {
          conflicts.push(buildConflict(snapshot.instanceId, 'tile_damage', tileDamageEntries.length, counts.tileDamage));
        } else {
          skipped.push(buildSkip(snapshot.instanceId, 'tile_damage', 'target already populated'));
        }
      }

      if (groundPileEntries.length > 0) {
        if (counts.groundItem === 0) {
          actions.push(buildAction(snapshot.instanceId, 'ground_item', groundPileEntries.length, options.apply));
          if (options.apply) {
            await instanceDomainService.replaceGroundItems(snapshot.instanceId, groundPileEntries);
            migratedDomains.push('ground_item');
          }
        } else if (counts.groundItem !== groundPileEntries.length) {
          conflicts.push(buildConflict(snapshot.instanceId, 'ground_item', groundPileEntries.length, counts.groundItem));
        } else {
          skipped.push(buildSkip(snapshot.instanceId, 'ground_item', 'target already populated'));
        }
      }

      if (containerStates.length > 0) {
        if (counts.containerState === 0) {
          actions.push(buildAction(snapshot.instanceId, 'container_state', containerStates.length, options.apply));
          if (options.apply) {
            await instanceDomainService.replaceContainerStates(snapshot.instanceId, containerStates);
            migratedDomains.push('container_state');
          }
        } else if (counts.containerState !== containerStates.length) {
          conflicts.push(buildConflict(snapshot.instanceId, 'container_state', containerStates.length, counts.containerState));
        } else {
          skipped.push(buildSkip(snapshot.instanceId, 'container_state', 'target already populated'));
        }
      }

      if (options.apply && migratedDomains.length > 0 && counts.checkpoint === 0) {
        await instanceDomainService.saveInstanceCheckpoint(snapshot.instanceId, {
          kind: 'migrated_from_map_dynamic_persistence_audit',
          sourceScope: snapshot.scope,
          migratedDomains,
          savedAt: normalizeFiniteInteger(snapshot.payload?.savedAt, Date.now()),
          templateId: typeof snapshot.payload?.templateId === 'string' ? snapshot.payload.templateId : null,
          tileResourceEntries,
          tileDamageEntries,
          groundPileEntries,
          containerStates,
        });
        actions.push(buildAction(snapshot.instanceId, 'checkpoint', 1, true));
      }
    }

    for (const snapshot of formationSnapshots) {
      const formationEntries = normalizeFormationEntries(snapshot.payload);
      if (formationEntries.length <= 0) {
        continue;
      }
      const counts = await loadInstanceCounts(pool, snapshot.instanceId);
      if (counts.formationState === 0) {
        actions.push(buildAction(snapshot.instanceId, 'formation_state', formationEntries.length, options.apply));
        if (options.apply) {
          await replaceFormationStates(pool, snapshot.instanceId, formationEntries);
        }
      } else if (counts.formationState !== formationEntries.length) {
        conflicts.push(buildConflict(snapshot.instanceId, 'formation_state', formationEntries.length, counts.formationState));
      } else {
        skipped.push(buildSkip(snapshot.instanceId, 'formation_state', 'target already populated'));
      }
    }

    const ledgerBacklog = await listFlushLedgerBacklog(pool);
    const totals = await loadDomainTotals(pool);
    process.stdout.write(JSON.stringify({
      ok: true,
      apply: options.apply,
      dryRun: options.dryRun,
      scopedInstanceIds: options.instanceIds,
      legacyMapSnapshotCount: mapSnapshots.length,
      legacyFormationSnapshotCount: formationSnapshots.length,
      actions,
      conflicts,
      skipped,
      ledgerBacklog,
      totals,
      answers: 'Audits map dynamic legacy snapshots against instance domain tables and applies only missing-domain migrations when the target table is empty.',
      excludes: 'Does not overwrite populated domain tables; reported conflicts require manual review because the populated domain table is treated as newer truth.',
      completionMapping: 'release:proof:with-db.map-dynamic-persistence-audit',
    }, null, 2));
    process.stdout.write('\n');
  } finally {
    await app.close();
  }
}

async function listLegacyMapSnapshots(pool, instanceIds) {
  const conditions = ['scope = ANY($1::varchar[])'];
  const values = [MAP_SNAPSHOT_SCOPES];
  if (Array.isArray(instanceIds) && instanceIds.length > 0) {
    conditions.push(`key = ANY($${values.length + 1}::varchar[])`);
    values.push(instanceIds);
  }
  const result = await pool.query(
    `SELECT scope, key, payload FROM persistent_documents WHERE ${conditions.join(' AND ')} ORDER BY scope ASC, key ASC`,
    values,
  );
  return (Array.isArray(result.rows) ? result.rows : [])
    .map((row) => ({ scope: row.scope, instanceId: row.key, payload: row.payload ?? {} }));
}

async function listLegacyFormationSnapshots(pool, instanceIds) {
  const conditions = ['scope = $1'];
  const values = [FORMATION_SNAPSHOT_SCOPE];
  if (Array.isArray(instanceIds) && instanceIds.length > 0) {
    conditions.push(`key = ANY($${values.length + 1}::varchar[])`);
    values.push(instanceIds);
  }
  const result = await pool.query(
    `SELECT key, payload FROM persistent_documents WHERE ${conditions.join(' AND ')} ORDER BY key ASC`,
    values,
  );
  return (Array.isArray(result.rows) ? result.rows : [])
    .map((row) => ({ instanceId: row.key, payload: row.payload ?? {} }));
}

async function loadInstanceCounts(pool, instanceId) {
  const result = await pool.query(
    `
      SELECT
        (SELECT count(*)::int FROM instance_tile_resource_state WHERE instance_id = $1) AS tile_resource,
        (SELECT count(*)::int FROM instance_tile_damage_state WHERE instance_id = $1) AS tile_damage,
        (SELECT count(*)::int FROM instance_ground_item WHERE instance_id = $1) AS ground_item,
        (SELECT count(*)::int FROM instance_container_state WHERE instance_id = $1) AS container_state,
        (SELECT count(*)::int FROM instance_checkpoint WHERE instance_id = $1) AS checkpoint,
        (SELECT count(*)::int FROM instance_formation_state WHERE instance_id = $1) AS formation_state
    `,
    [instanceId],
  );
  const row = result.rows?.[0] ?? {};
  return {
    tileResource: Number(row.tile_resource) || 0,
    tileDamage: Number(row.tile_damage) || 0,
    groundItem: Number(row.ground_item) || 0,
    containerState: Number(row.container_state) || 0,
    checkpoint: Number(row.checkpoint) || 0,
    formationState: Number(row.formation_state) || 0,
  };
}

function normalizeTileResourceEntries(payload) {
  const explicitEntries = Array.isArray(payload?.tileResourceEntries) ? payload.tileResourceEntries : [];
  const auraEntries = Array.isArray(payload?.auraEntries) ? payload.auraEntries : [];
  const sourceEntries = explicitEntries.length > 0
    ? explicitEntries
    : auraEntries.map((entry) => ({ ...entry, resourceKey: 'aura.refined.neutral' }));
  return sourceEntries
    .filter((entry) => entry && typeof entry.resourceKey === 'string' && Number.isFinite(Number(entry.tileIndex)) && Number.isFinite(Number(entry.value)))
    .map((entry) => ({
      resourceKey: entry.resourceKey.trim(),
      tileIndex: Math.max(0, Math.trunc(Number(entry.tileIndex))),
      value: Math.max(0, Math.trunc(Number(entry.value))),
    }))
    .filter((entry) => entry.resourceKey);
}

function normalizeTileDamageEntries(payload) {
  return (Array.isArray(payload?.tileDamageEntries) ? payload.tileDamageEntries : [])
    .filter((entry) => entry && Number.isFinite(Number(entry.tileIndex)))
    .map((entry) => ({
      tileIndex: Math.max(0, Math.trunc(Number(entry.tileIndex))),
      hp: Math.max(0, Math.trunc(Number(entry.hp) || 0)),
      maxHp: Math.max(1, Math.trunc(Number(entry.maxHp) || 1)),
      destroyed: entry.destroyed === true,
      respawnLeft: Math.max(0, Math.trunc(Number(entry.respawnLeft) || 0)),
      modifiedAt: normalizeFiniteInteger(entry.modifiedAt, Date.now()),
    }));
}

function normalizeFormationEntries(payload) {
  return (Array.isArray(payload?.formations) ? payload.formations : [])
    .filter((entry) => entry && typeof entry.formationId === 'string' && Number.isFinite(Number(entry.x)) && Number.isFinite(Number(entry.y)))
    .map((entry) => ({
      id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : '',
      ownerPlayerId: typeof entry.ownerPlayerId === 'string' ? entry.ownerPlayerId : '',
      ownerSectId: typeof entry.ownerSectId === 'string' && entry.ownerSectId.trim() ? entry.ownerSectId.trim() : null,
      formationId: entry.formationId.trim(),
      diskItemId: typeof entry.diskItemId === 'string' ? entry.diskItemId : '',
      diskTier: typeof entry.diskTier === 'string' && entry.diskTier.trim() ? entry.diskTier.trim() : 'mortal',
      diskMultiplier: Number.isFinite(Number(entry.diskMultiplier)) ? Math.max(1, Number(entry.diskMultiplier)) : 1,
      spiritStoneCount: Math.max(1, Math.trunc(Number(entry.spiritStoneCount) || 1)),
      qiCost: Math.max(0, Math.trunc(Number(entry.qiCost) || 0)),
      x: Math.trunc(Number(entry.x)),
      y: Math.trunc(Number(entry.y)),
      eyeInstanceId: typeof entry.eyeInstanceId === 'string' && entry.eyeInstanceId.trim() ? entry.eyeInstanceId.trim() : null,
      eyeX: Number.isFinite(Number(entry.eyeX)) ? Math.trunc(Number(entry.eyeX)) : Math.trunc(Number(entry.x)),
      eyeY: Number.isFinite(Number(entry.eyeY)) ? Math.trunc(Number(entry.eyeY)) : Math.trunc(Number(entry.y)),
      allocation: entry.allocation && typeof entry.allocation === 'object' ? entry.allocation : {},
      active: entry.active !== false,
      remainingAuraBudget: Math.max(0, Number(entry.remainingAuraBudget) || 0),
      createdAt: normalizeFiniteInteger(entry.createdAt, Date.now()),
      updatedAt: normalizeFiniteInteger(entry.updatedAt, Date.now()),
    }))
    .filter((entry) => entry.id && entry.remainingAuraBudget > 0);
}

async function replaceFormationStates(pool, instanceId, formations) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [instanceId]);
    await client.query('DELETE FROM instance_formation_state WHERE instance_id = $1', [instanceId]);
    for (const formation of formations) {
      await client.query(
        `
          INSERT INTO instance_formation_state(
            instance_id,
            formation_instance_id,
            owner_player_id,
            owner_sect_id,
            formation_id,
            disk_item_id,
            disk_tier,
            disk_multiplier,
            spirit_stone_count,
            qi_cost,
            x,
            y,
            eye_instance_id,
            eye_x,
            eye_y,
            allocation_payload,
            active,
            remaining_aura_budget,
            created_at_ms,
            updated_at_ms,
            updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15,
            $16::jsonb, $17, $18, $19, $20, now()
          )
        `,
        [
          instanceId,
          formation.id,
          formation.ownerPlayerId,
          formation.ownerSectId,
          formation.formationId,
          formation.diskItemId,
          formation.diskTier,
          formation.diskMultiplier,
          formation.spiritStoneCount,
          formation.qiCost,
          formation.x,
          formation.y,
          formation.eyeInstanceId ?? instanceId,
          formation.eyeX,
          formation.eyeY,
          JSON.stringify(formation.allocation ?? {}),
          formation.active,
          formation.remainingAuraBudget,
          formation.createdAt,
          formation.updatedAt,
        ],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function listFlushLedgerBacklog(pool) {
  const result = await pool.query(`
    SELECT instance_id, domain, latest_version, flushed_version, dirty_since_at, next_attempt_at, claimed_by, claim_until
    FROM instance_flush_ledger
    WHERE latest_version > flushed_version
    ORDER BY updated_at DESC, instance_id ASC, domain ASC
    LIMIT 100
  `);
  return (Array.isArray(result.rows) ? result.rows : []).map((row) => ({
    instanceId: row.instance_id,
    domain: row.domain,
    latestVersion: Number(row.latest_version) || 0,
    flushedVersion: Number(row.flushed_version) || 0,
    dirtySinceAt: row.dirty_since_at ?? null,
    nextAttemptAt: row.next_attempt_at ?? null,
    claimedBy: row.claimed_by ?? null,
    claimUntil: row.claim_until ?? null,
  }));
}

async function loadDomainTotals(pool) {
  const result = await pool.query(`
    SELECT 'instance_catalog' AS domain, count(*)::int AS count FROM instance_catalog
    UNION ALL SELECT 'tile_resource', count(*)::int FROM instance_tile_resource_state
    UNION ALL SELECT 'tile_damage', count(*)::int FROM instance_tile_damage_state
    UNION ALL SELECT 'ground_item', count(*)::int FROM instance_ground_item
    UNION ALL SELECT 'container_state', count(*)::int FROM instance_container_state
    UNION ALL SELECT 'container_entry', count(*)::int FROM instance_container_entry
    UNION ALL SELECT 'container_timer', count(*)::int FROM instance_container_timer
    UNION ALL SELECT 'monster_runtime', count(*)::int FROM instance_monster_runtime_state
    UNION ALL SELECT 'event_state', count(*)::int FROM instance_event_state
    UNION ALL SELECT 'overlay_chunk', count(*)::int FROM instance_overlay_chunk
    UNION ALL SELECT 'checkpoint', count(*)::int FROM instance_checkpoint
    UNION ALL SELECT 'recovery_watermark', count(*)::int FROM instance_recovery_watermark
    UNION ALL SELECT 'formation_state', count(*)::int FROM instance_formation_state
    ORDER BY domain ASC
  `);
  const totals = {};
  for (const row of Array.isArray(result.rows) ? result.rows : []) {
    totals[row.domain] = Number(row.count) || 0;
  }
  return totals;
}

function buildAction(instanceId, domain, count, applied) {
  return { instanceId, domain, count, applied };
}

function buildConflict(instanceId, domain, legacyCount, targetCount) {
  return {
    instanceId,
    domain,
    legacyCount,
    targetCount,
    reason: 'target already populated; no overwrite',
  };
}

function buildSkip(instanceId, domain, reason) {
  return { instanceId, domain, reason };
}

function normalizeFiniteInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// @ts-nocheck

const core = require('@nestjs/core');
const { Pool } = require('pg');

const { AppModule } = require('../app.module');
const { DatabasePoolProvider } = require('../persistence/database-pool.provider');
const { resolveServerDatabaseUrl } = require('../config/env-alias');
const { MapPersistenceService } = require('../persistence/map-persistence.service');
const { PlayerPersistenceService } = require('../persistence/player-persistence.service');
const { PlayerDomainPersistenceService } = require('../persistence/player-domain-persistence.service');
const { InstanceDomainPersistenceService } = require('../persistence/instance-domain-persistence.service');
const { MailPersistenceService } = require('../persistence/mail-persistence.service');

const SUPPORTED_DOMAINS = new Set(['player-domain', 'instance-domain', 'mail-domain']);
const INSTANCE_DOMAIN_SOURCE_SCOPES = ['server_next_map_aura_v1', 'server_map_aura_v1'];
const MAIL_DOMAIN_SOURCE_SCOPE = 'server_mailboxes_v1';
const PLAYER_DOMAIN_PROJECTION_TARGETS = [
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
];

function parseArgs(argv) {
  const options = {
    dryRun: false,
    domains: ['player-domain'],
    playerIds: [],
    instanceIds: [],
    mailboxIds: [],
    apply: false,
  };
  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }
    if (arg.startsWith('--domains=')) {
      options.domains = arg.slice('--domains='.length)
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
      continue;
    }
    if (arg.startsWith('--player-id=')) {
      const playerId = arg.slice('--player-id='.length).trim();
      if (playerId) {
        options.playerIds.push(playerId);
      }
      continue;
    }
    if (arg.startsWith('--instance-id=')) {
      const instanceId = arg.slice('--instance-id='.length).trim();
      if (instanceId) {
        options.instanceIds.push(instanceId);
      }
      continue;
    }
    if (arg.startsWith('--mailbox-id=')) {
      const mailboxId = arg.slice('--mailbox-id='.length).trim();
      if (mailboxId) {
        options.mailboxIds.push(mailboxId);
      }
      continue;
    }
  }
  return options;
}

async function main() {
  const { dryRun, apply, domains, playerIds, instanceIds, mailboxIds } = parseArgs(process.argv.slice(2));
  const databaseUrl = resolveServerDatabaseUrl();
  if (!databaseUrl.trim()) {
    throw new Error('missing SERVER_DATABASE_URL/DATABASE_URL');
  }

  if (domains.length !== 1 || !SUPPORTED_DOMAINS.has(domains[0])) {
    throw new Error(`unsupported migration domains: ${domains.join(', ') || '(empty)'}`);
  }

  const app = await core.NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const poolProvider = app.get(DatabasePoolProvider);
    const snapshotService = app.get(PlayerPersistenceService);
    const domainService = app.get(PlayerDomainPersistenceService);
    const instanceDomainService = app.get(InstanceDomainPersistenceService);
    const mailService = app.get(MailPersistenceService);
    const snapshots = playerIds.length > 0
      ? (await Promise.all(playerIds.map(async (playerId) => {
          const snapshot = await snapshotService.loadPlayerSnapshot(playerId);
          return snapshot ? { playerId, snapshot, updatedAt: snapshot.savedAt ?? Date.now() } : null;
        }))).filter(Boolean)
      : await snapshotService.listPlayerSnapshots();
    const instanceSnapshots = await listInstanceSnapshots(poolProvider.getPool('migrate-next-mainline-instance') ?? new Pool({ connectionString: databaseUrl }), instanceIds);
    const mailboxSnapshots = await listMailboxSnapshots(poolProvider.getPool('migrate-next-mainline-mail') ?? new Pool({ connectionString: databaseUrl }), mailboxIds);

    if (!dryRun && !apply) {
      throw new Error('migration must pass either --dry-run or --apply');
    }
    const migrated = [];
    const dryRunChecks = [];
    for (const entry of snapshots) {
      if (!entry?.playerId || !entry?.snapshot) {
        continue;
      }
      if (dryRun) {
        dryRunChecks.push({
          playerId: entry.playerId,
          templateId: entry.snapshot.placement?.templateId ?? null,
          snapshotSavedAt: entry.snapshot.savedAt ?? null,
          projectedDomains: PLAYER_DOMAIN_PROJECTION_TARGETS,
        });
        continue;
      }
      await domainService.savePlayerSnapshotProjectionDomains(
        entry.playerId,
        entry.snapshot,
        PLAYER_DOMAIN_PROJECTION_TARGETS,
      );
      migrated.push({
        playerId: entry.playerId,
        templateId: entry.snapshot.placement?.templateId ?? null,
        snapshotSavedAt: entry.snapshot.savedAt ?? null,
      });
    }
    if (domains.includes('instance-domain')) {
      for (const entry of instanceSnapshots) {
        if (!entry?.instanceId || !entry?.snapshot) {
          continue;
        }
        if (dryRun) {
          dryRunChecks.push({
            instanceId: entry.instanceId,
            templateId: entry.snapshot.templateId ?? null,
            snapshotSavedAt: entry.snapshot.savedAt ?? null,
            projectedDomains: ['tile_resource', 'ground_item', 'container_state', 'monster_runtime', 'event_state', 'overlay_chunk', 'checkpoint', 'recovery_watermark'],
          });
          continue;
        }
        await migrateInstanceSnapshot(instanceDomainService, entry.instanceId, entry.snapshot, apply);
        migrated.push({
          instanceId: entry.instanceId,
          templateId: entry.snapshot.templateId ?? null,
          snapshotSavedAt: entry.snapshot.savedAt ?? null,
        });
      }
    }
    if (domains.includes('mail-domain')) {
      for (const entry of mailboxSnapshots) {
        if (!entry?.playerId || !entry?.mailbox) {
          continue;
        }
        if (dryRun) {
          dryRunChecks.push({
            playerId: entry.playerId,
            mailboxRevision: entry.mailbox.revision ?? null,
            projectedDomains: ['player_mail', 'player_mail_attachment', 'player_mail_counter', 'player_recovery_watermark'],
          });
          continue;
        }
        await mailService.saveMailbox(entry.playerId, entry.mailbox);
        migrated.push({
          playerId: entry.playerId,
          mailboxRevision: entry.mailbox.revision ?? null,
        });
      }
    }

    process.stdout.write(JSON.stringify({
      ok: true,
      dryRun,
      apply,
      domains,
      processed: dryRun ? dryRunChecks.length : migrated.length,
      totalSnapshots: snapshots.length,
      projectedDomains: PLAYER_DOMAIN_PROJECTION_TARGETS,
      dryRunChecks: dryRun ? dryRunChecks : undefined,
      migrated: dryRun ? undefined : migrated,
      completionMapping: domains.includes('mail-domain')
        ? 'replace-ready:proof:with-db.mail-domain-migration'
        : domains.includes('instance-domain')
          ? 'replace-ready:proof:with-db.instance-domain-migration'
          : 'replace-ready:proof:with-db.player-domain-migration',
    }, null, 2));
    process.stdout.write('\n');
  } finally {
    await app.close();
  }
}

async function listMailboxSnapshots(pool, mailboxIds) {
  const conditions = ['scope = $1'];
  const values = [MAIL_DOMAIN_SOURCE_SCOPE];
  if (Array.isArray(mailboxIds) && mailboxIds.length > 0) {
    conditions.push(`key = ANY($${values.length + 1}::varchar[])`);
    values.push(mailboxIds);
  }
  const result = await pool.query(
    `SELECT key, payload FROM persistent_documents WHERE ${conditions.join(' AND ')} ORDER BY key ASC`,
    values,
  );
  return Array.isArray(result.rows)
    ? result.rows.map((row) => ({
        playerId: typeof row.key === 'string' ? row.key : '',
        mailbox: normalizeMailboxSnapshot(row.payload),
      }))
    : [];
}

async function listInstanceSnapshots(pool, instanceIds) {
  const conditions = ['scope = ANY($1::varchar[])'];
  const values = [INSTANCE_DOMAIN_SOURCE_SCOPES];
  if (Array.isArray(instanceIds) && instanceIds.length > 0) {
    conditions.push(`key = ANY($${values.length + 1}::varchar[])`);
    values.push(instanceIds);
  }
  const result = await pool.query(
    `SELECT key, payload FROM persistent_documents WHERE ${conditions.join(' AND ')} ORDER BY key ASC`,
    values,
  );
  return Array.isArray(result.rows)
    ? result.rows.map((row) => ({
        instanceId: typeof row.key === 'string' ? row.key : '',
        snapshot: normalizeInstanceSnapshot(row.payload),
      }))
    : [];
}

async function migrateInstanceSnapshot(service, instanceId, snapshot, apply) {
  const tileResourceEntries = Array.isArray(snapshot.tileResourceEntries) ? snapshot.tileResourceEntries : [];
  const normalizedTileResourceEntries = tileResourceEntries
    .filter((entry) => entry && typeof entry.resourceKey === 'string' && Number.isFinite(Number(entry.tileIndex)) && Number.isFinite(Number(entry.value)))
    .map((entry) => ({
      resourceKey: entry.resourceKey,
      tileIndex: Math.trunc(Number(entry.tileIndex)),
      value: Math.max(0, Math.trunc(Number(entry.value))),
    }));
  if (apply) {
    await service.saveTileResourceDiffs(instanceId, normalizedTileResourceEntries);
    await service.saveInstanceCheckpoint(instanceId, {
      kind: 'migrated_from_map_snapshot',
      templateId: snapshot.templateId ?? null,
      savedAt: snapshot.savedAt ?? null,
      tileResourceEntries: normalizedTileResourceEntries,
      groundPileEntries: Array.isArray(snapshot.groundPileEntries) ? snapshot.groundPileEntries : [],
      containerStates: Array.isArray(snapshot.containerStates) ? snapshot.containerStates : [],
    });
    await service.saveInstanceRecoveryWatermark(instanceId, {
      catalogVersion: Number.isFinite(Number(snapshot.savedAt)) ? Math.trunc(Number(snapshot.savedAt)) : Date.now(),
      recoveryVersion: Number.isFinite(Number(snapshot.savedAt)) ? Math.trunc(Number(snapshot.savedAt)) : Date.now(),
      checkpointKind: 'migrated_from_map_snapshot',
    });
  }
  if (Array.isArray(snapshot.groundPileEntries) && snapshot.groundPileEntries.length > 0) {
    for (const pile of snapshot.groundPileEntries) {
      if (!pile || !Number.isFinite(Number(pile.tileIndex)) || !Array.isArray(pile.items)) {
        continue;
      }
      for (const item of pile.items) {
        const normalizedItem = normalizePersistedGroundItem(item);
        if (!normalizedItem) {
          continue;
        }
        await service.saveGroundItem({
          groundItemId: `ground:${instanceId}:${Math.trunc(Number(pile.tileIndex))}:${normalizedItem.itemId}`,
          instanceId,
          tileIndex: Math.trunc(Number(pile.tileIndex)),
          itemPayload: normalizedItem,
          expireAt: null,
        });
      }
    }
  }
  if (Array.isArray(snapshot.containerStates)) {
    for (const container of snapshot.containerStates) {
      if (!container || typeof container.id !== 'string') {
        continue;
      }
      await service.saveContainerState({
        instanceId,
        containerId: container.id,
        sourceId: container.sourceId ?? container.id,
        statePayload: container,
      });
    }
  }
}

function normalizeInstanceSnapshot(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const payload = raw;
  return {
    version: 1,
    savedAt: Number.isFinite(Number(payload.savedAt)) ? Math.trunc(Number(payload.savedAt)) : Date.now(),
    templateId: typeof payload.templateId === 'string' ? payload.templateId : '',
    tileResourceEntries: Array.isArray(payload.tileResourceEntries) ? payload.tileResourceEntries : [],
    groundPileEntries: Array.isArray(payload.groundPileEntries) ? payload.groundPileEntries : [],
    containerStates: Array.isArray(payload.containerStates) ? payload.containerStates : [],
  };
}

function normalizeMailboxSnapshot(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const payload = raw;
  return {
    version: 1,
    revision: Number.isFinite(Number(payload.revision)) ? Math.trunc(Number(payload.revision)) : 1,
    welcomeMailDeliveredAt: Number.isFinite(Number(payload.welcomeMailDeliveredAt))
      ? Math.trunc(Number(payload.welcomeMailDeliveredAt))
      : null,
    mails: Array.isArray(payload.mails)
      ? payload.mails.map((entry) => ({
          version: 1,
          mailVersion: Number.isFinite(Number(entry?.mailVersion)) ? Math.trunc(Number(entry.mailVersion)) : 1,
          mailId: typeof entry?.mailId === 'string' ? entry.mailId : '',
          senderLabel: typeof entry?.senderLabel === 'string' ? entry.senderLabel : '系统',
          templateId: typeof entry?.templateId === 'string' ? entry.templateId : null,
          args: Array.isArray(entry?.args) ? entry.args : [],
          fallbackTitle: typeof entry?.fallbackTitle === 'string' ? entry.fallbackTitle : null,
          fallbackBody: typeof entry?.fallbackBody === 'string' ? entry.fallbackBody : null,
          attachments: Array.isArray(entry?.attachments) ? entry.attachments : [],
          createdAt: Number.isFinite(Number(entry?.createdAt)) ? Math.trunc(Number(entry.createdAt)) : Date.now(),
          updatedAt: Number.isFinite(Number(entry?.updatedAt)) ? Math.trunc(Number(entry.updatedAt)) : Date.now(),
          expireAt: Number.isFinite(Number(entry?.expireAt)) ? Math.trunc(Number(entry.expireAt)) : null,
          firstSeenAt: Number.isFinite(Number(entry?.firstSeenAt)) ? Math.trunc(Number(entry.firstSeenAt)) : null,
          readAt: Number.isFinite(Number(entry?.readAt)) ? Math.trunc(Number(entry.readAt)) : null,
          claimedAt: Number.isFinite(Number(entry?.claimedAt)) ? Math.trunc(Number(entry.claimedAt)) : null,
          deletedAt: Number.isFinite(Number(entry?.deletedAt)) ? Math.trunc(Number(entry.deletedAt)) : null,
        }))
      : [],
  };
}

function normalizePersistedGroundItem(item) {
  if (!item || typeof item !== 'object' || typeof item.itemId !== 'string' || !item.itemId.trim()) {
    return null;
  }
  return {
    ...item,
    itemId: item.itemId.trim(),
    count: Number.isFinite(Number(item.count)) ? Math.max(1, Math.trunc(Number(item.count))) : 1,
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});

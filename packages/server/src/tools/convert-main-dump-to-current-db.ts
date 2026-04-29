// @ts-nocheck

const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const DEFAULT_DUMP_PATH = '参考/Test/20260428-060004-067__hourly.dump';
const DEFAULT_TARGET_DB_PREFIX = 'mud_mmo_next_converted_main';
const GM_AUTH_RECORD_KEY = 'gm_auth';
const LEGACY_BCRYPT_SENTINEL_SALT = '__legacy_bcrypt__';

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
  const args = {
    dump: DEFAULT_DUMP_PATH,
    sourceDatabaseUrl: '',
    targetDatabaseUrl: '',
    maintenanceDatabaseUrl: '',
    stagingDatabaseName: '',
    createTargetDatabaseName: '',
    apply: false,
    keepStaging: false,
    limit: null,
    include: new Set(['players', 'instances', 'mail', 'market', 'suggestions', 'gm-auth']),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--apply') {
      args.apply = true;
      continue;
    }
    if (arg === '--dry-run') {
      args.apply = false;
      continue;
    }
    if (arg === '--keep-staging') {
      args.keepStaging = true;
      continue;
    }
    if (arg === '--dump') {
      args.dump = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg.startsWith('--dump=')) {
      args.dump = arg.slice('--dump='.length);
      continue;
    }
    if (arg === '--source-database-url') {
      args.sourceDatabaseUrl = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg.startsWith('--source-database-url=')) {
      args.sourceDatabaseUrl = arg.slice('--source-database-url='.length);
      continue;
    }
    if (arg === '--target-database-url') {
      args.targetDatabaseUrl = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg.startsWith('--target-database-url=')) {
      args.targetDatabaseUrl = arg.slice('--target-database-url='.length);
      continue;
    }
    if (arg === '--maintenance-database-url') {
      args.maintenanceDatabaseUrl = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg.startsWith('--maintenance-database-url=')) {
      args.maintenanceDatabaseUrl = arg.slice('--maintenance-database-url='.length);
      continue;
    }
    if (arg === '--staging-database-name') {
      args.stagingDatabaseName = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg.startsWith('--staging-database-name=')) {
      args.stagingDatabaseName = arg.slice('--staging-database-name='.length);
      continue;
    }
    if (arg === '--create-target-database-name') {
      args.createTargetDatabaseName = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg.startsWith('--create-target-database-name=')) {
      args.createTargetDatabaseName = arg.slice('--create-target-database-name='.length);
      continue;
    }
    if (arg.startsWith('--limit=')) {
      const parsed = Number(arg.slice('--limit='.length));
      if (Number.isFinite(parsed)) {
        args.limit = Math.max(0, Math.trunc(parsed));
      }
      continue;
    }
    if (arg.startsWith('--include=')) {
      args.include = new Set(arg.slice('--include='.length).split(',').map((part) => part.trim()).filter(Boolean));
      continue;
    }
  }
  return args;
}

function printUsage() {
  process.stdout.write([
    'Usage:',
    '  node dist/tools/convert-main-dump-to-current-db.js --dump ref.dump --target-database-url postgres://... --apply',
    '',
    'Default mode is dry-run. Pass --apply to write target current-schema tables.',
    'If --source-database-url is omitted, the dump is restored into a temporary staging database first.',
    'Use --create-target-database-name to create a new converted database before applying.',
  ].join('\n'));
  process.stdout.write('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const maintenanceDatabaseUrl = normalizeString(args.maintenanceDatabaseUrl)
    || normalizeString(process.env.SERVER_DATABASE_URL)
    || normalizeString(process.env.DATABASE_URL);
  let targetDatabaseUrl = normalizeString(args.targetDatabaseUrl)
    || (args.createTargetDatabaseName ? buildDatabaseUrl(maintenanceDatabaseUrl, args.createTargetDatabaseName) : maintenanceDatabaseUrl);

  if (!maintenanceDatabaseUrl) {
    throw new Error('missing maintenance database url: pass --maintenance-database-url or SERVER_DATABASE_URL/DATABASE_URL');
  }
  if (!targetDatabaseUrl) {
    throw new Error('missing target database url: pass --target-database-url or SERVER_DATABASE_URL/DATABASE_URL');
  }
  if (args.createTargetDatabaseName) {
    if (!args.apply) {
      throw new Error('--create-target-database-name requires --apply');
    }
    await recreateDatabase(maintenanceDatabaseUrl, args.createTargetDatabaseName);
    targetDatabaseUrl = buildDatabaseUrl(maintenanceDatabaseUrl, args.createTargetDatabaseName);
  }

  const stagingDatabaseName = normalizeString(args.stagingDatabaseName)
    || `${DEFAULT_TARGET_DB_PREFIX}_staging_${Date.now()}`;
  let sourceDatabaseUrl = normalizeString(args.sourceDatabaseUrl);
  let restoredStaging = false;
  if (!sourceDatabaseUrl) {
    const dumpPath = path.resolve(process.cwd(), args.dump || DEFAULT_DUMP_PATH);
    if (!existsSync(dumpPath)) {
      throw new Error(`dump file not found: ${dumpPath}`);
    }
    await recreateDatabase(maintenanceDatabaseUrl, stagingDatabaseName);
    sourceDatabaseUrl = buildDatabaseUrl(maintenanceDatabaseUrl, stagingDatabaseName);
    await restoreCustomDumpToDatabase(dumpPath, sourceDatabaseUrl);
    restoredStaging = true;
  }

  const sourcePool = new Pool({ connectionString: sourceDatabaseUrl });
  const targetPool = new Pool({ connectionString: targetDatabaseUrl });
  let services = null;
  try {
    const sourceSummary = await inspectSource(sourcePool);
    const sourceChecks = await buildSourceChecks(sourcePool, args.limit);
    if (!args.apply) {
      process.stdout.write(JSON.stringify({
        ok: true,
        mode: 'dry-run',
        sourceDatabase: redactDatabaseUrl(sourceDatabaseUrl),
        targetDatabase: redactDatabaseUrl(targetDatabaseUrl),
        restoredStaging,
        stagingDatabaseName: restoredStaging ? stagingDatabaseName : null,
        sourceSummary,
        sourceChecks,
        include: Array.from(args.include).sort(),
      }, null, 2));
      process.stdout.write('\n');
      return;
    }

    services = await initializeTargetServices(targetDatabaseUrl);
    const converted = {
      players: args.include.has('players') ? await convertPlayers(sourcePool, services, args.limit) : null,
      instances: args.include.has('instances') ? await convertRuntimeState(sourcePool, services, args.limit) : null,
      mail: args.include.has('mail') ? await convertMail(sourcePool, services, args.limit) : null,
      market: args.include.has('market') ? await convertMarket(sourcePool, services, args.limit) : null,
      suggestions: args.include.has('suggestions') ? await convertSuggestions(sourcePool, services) : null,
      gmAuth: args.include.has('gm-auth') ? await convertGmAuth(sourcePool, targetPool) : null,
    };
    const targetChecks = await inspectTarget(targetPool);
    process.stdout.write(JSON.stringify({
      ok: true,
      mode: 'apply',
      sourceDatabase: redactDatabaseUrl(sourceDatabaseUrl),
      targetDatabase: redactDatabaseUrl(targetDatabaseUrl),
      restoredStaging,
      stagingDatabaseName: restoredStaging ? stagingDatabaseName : null,
      sourceSummary,
      converted,
      targetChecks,
      skippedLegacyScopes: sourceSummary.persistentDocumentScopes
        .filter((entry) => !['runtime_state', 'server_config'].includes(entry.scope))
        .map((entry) => ({ scope: entry.scope, count: entry.count, reason: 'no current runtime database truth target' })),
    }, null, 2));
    process.stdout.write('\n');
  } finally {
    await safeDestroyServices(services);
    await targetPool.end().catch(() => undefined);
    await sourcePool.end().catch(() => undefined);
    if (restoredStaging && !args.keepStaging) {
      await dropDatabase(maintenanceDatabaseUrl, stagingDatabaseName).catch(() => undefined);
    }
  }
}

async function initializeTargetServices(targetDatabaseUrl) {
  process.env.SERVER_DATABASE_URL = targetDatabaseUrl;
  process.env.DATABASE_URL = targetDatabaseUrl;
  const { DatabasePoolProvider } = require('../persistence/database-pool.provider');
  const { ContentTemplateRepository } = require('../content/content-template.repository');
  const { NativePlayerAuthStoreService } = require('../http/native/native-player-auth-store.service');
  const { PlayerIdentityPersistenceService } = require('../persistence/player-identity-persistence.service');
  const { PlayerPersistenceService } = require('../persistence/player-persistence.service');
  const { PlayerDomainPersistenceService } = require('../persistence/player-domain-persistence.service');
  const { DurableOperationService } = require('../persistence/durable-operation.service');
  const { InstanceDomainPersistenceService } = require('../persistence/instance-domain-persistence.service');
  const { MailPersistenceService } = require('../persistence/mail-persistence.service');
  const { MarketPersistenceService } = require('../persistence/market-persistence.service');
  const { SuggestionPersistenceService } = require('../persistence/suggestion-persistence.service');

  const provider = new DatabasePoolProvider();
  const content = new ContentTemplateRepository();
  content.onModuleInit?.();
  const services = {
    provider,
    content,
    authStore: new NativePlayerAuthStoreService(),
    identity: new PlayerIdentityPersistenceService(),
    playerSnapshots: new PlayerPersistenceService(),
    durable: new DurableOperationService(null),
    playerDomains: new PlayerDomainPersistenceService(content),
    instanceDomains: new InstanceDomainPersistenceService(provider),
    mail: new MailPersistenceService(),
    market: new MarketPersistenceService(),
    suggestions: new SuggestionPersistenceService(),
  };
  await services.authStore.onModuleInit();
  await services.identity.onModuleInit();
  await services.playerSnapshots.onModuleInit();
  await services.durable.onModuleInit();
  await services.playerDomains.onModuleInit();
  await services.instanceDomains.onModuleInit();
  await services.mail.onModuleInit();
  await services.market.onModuleInit();
  await services.suggestions.onModuleInit();
  return services;
}

async function safeDestroyServices(services) {
  if (!services) return;
  const destroyers = [
    services.suggestions,
    services.market,
    services.mail,
    services.instanceDomains,
    services.playerDomains,
    services.durable,
    services.playerSnapshots,
    services.identity,
    services.authStore,
  ];
  for (const service of destroyers) {
    if (service && typeof service.onModuleDestroy === 'function') {
      await service.onModuleDestroy().catch(() => undefined);
    }
  }
}

async function inspectSource(pool) {
  const tables = [
    'users',
    'players',
    'player_collections',
    'player_settings',
    'player_presence',
    'persistent_documents',
    'mail_campaigns',
    'mail_audience_members',
    'player_mail_receipts',
    'market_orders',
    'market_trade_history',
    'suggestions',
    'afdian_orders',
    'gm_risk_operation_audits',
  ];
  const tableCounts = {};
  for (const table of tables) {
    tableCounts[table] = await countTableRows(pool, table);
  }
  const scopeResult = await pool.query(`
    SELECT scope, count(*)::int AS count
    FROM persistent_documents
    GROUP BY scope
    ORDER BY scope ASC
  `).catch(() => ({ rows: [] }));
  return {
    tableCounts,
    persistentDocumentScopes: scopeResult.rows.map((row) => ({
      scope: String(row.scope ?? ''),
      count: Number(row.count ?? 0),
    })),
  };
}

async function buildSourceChecks(pool, limit) {
  const playerCount = await countPlayerRows(pool, limit);
  const runtimeMaps = await countRuntimeMaps(pool);
  const mailPlayers = await countMailPlayers(pool, limit);
  return { playerCount, runtimeMaps, mailPlayers };
}

async function convertPlayers(pool, services, limit) {
  const entries = await loadLegacyPlayerRows(pool, limit);
  let converted = 0;
  let skipped = 0;
  const failures = [];
  for (const entry of entries) {
    try {
      const playerId = normalizeString(entry.player?.id);
      const userId = normalizeString(entry.user?.id ?? entry.player?.userId);
      const username = normalizeString(entry.user?.username);
      const playerName = normalizeString(entry.player?.name) || username || playerId;
      if (!playerId || !userId || !username) {
        skipped += 1;
        continue;
      }
      await services.authStore.saveUser({
        id: userId,
        userId,
        username,
        displayName: normalizeString(entry.user?.displayName) || playerName,
        pendingRoleName: normalizeString(entry.user?.pendingRoleName) || playerName,
        playerId,
        playerName,
        passwordHash: normalizeString(entry.user?.passwordHash),
        totalOnlineSeconds: normalizeInteger(entry.user?.totalOnlineSeconds, 0),
        currentOnlineStartedAt: normalizeDateString(entry.user?.currentOnlineStartedAt),
        createdAt: normalizeDateString(entry.user?.createdAt) || new Date(0).toISOString(),
        updatedAt: resolveUpdatedAtMs(entry.user, entry.player, entry.collections, entry.settings),
      });
      await services.identity.savePlayerIdentity({
        userId,
        username,
        displayName: normalizeString(entry.user?.displayName) || playerName,
        playerId,
        playerName,
        persistedSource: 'native',
        updatedAt: resolveUpdatedAtMs(entry.user, entry.player, entry.collections, entry.settings),
      });
      const merged = mergeLegacyPlayerRow(entry.player, entry.collections, entry.settings);
      const snapshot = buildPlayerSnapshot(merged, resolveUpdatedAtMs(entry.player, entry.collections, entry.settings));
      snapshot.name = playerName;
      snapshot.displayName = normalizeString(entry.user?.displayName) || playerName;
      await services.playerSnapshots.savePlayerSnapshot(playerId, snapshot, {
        persistedSource: 'native',
        seededAt: snapshot.savedAt,
      });
      await services.playerDomains.savePlayerSnapshotProjectionDomains(playerId, snapshot, PLAYER_DOMAIN_PROJECTION_TARGETS);
      await services.playerDomains.savePlayerPresence(playerId, {
        online: entry.presence?.online === true || entry.player?.online === true,
        inWorld: entry.presence?.inWorld === true || entry.player?.inWorld === true,
        lastHeartbeatAt: normalizeDateMs(entry.presence?.lastHeartbeatAt ?? entry.player?.lastHeartbeatAt),
        offlineSinceAt: normalizeDateMs(entry.presence?.offlineSinceAt ?? entry.player?.offlineSinceAt),
        runtimeOwnerId: normalizeString(entry.presence?.runtimeOwnerId),
        sessionEpoch: 1,
        transferState: normalizeString(entry.presence?.transferState),
        transferTargetNodeId: normalizeString(entry.presence?.transferTargetNodeId),
        versionSeed: snapshot.savedAt,
      });
      converted += 1;
    } catch (error) {
      skipped += 1;
      failures.push({
        playerId: normalizeString(entry.player?.id) || null,
        error: error instanceof Error ? error.message : String(error),
      });
      if (failures.length >= 20) break;
    }
  }
  return { sourceRows: entries.length, converted, skipped, failures };
}

function buildPlayerSnapshot(row, savedAt) {
  const { toPlayerSnapshotFromMigrationRow } = require('../network/world-player-source.service');
  const normalizedRow = {
    ...row,
    unlockedMinimapIds: Array.isArray(row.unlockedMinimapIds) ? row.unlockedMinimapIds : [],
  };
  const snapshot = toPlayerSnapshotFromMigrationRow(normalizedRow);
  snapshot.savedAt = savedAt;
  const placement = snapshot.placement;
  const respawnMapId = normalizeString(row.respawnMapId) || placement.templateId;
  snapshot.respawn = {
    templateId: respawnMapId,
    instanceId: `public:${respawnMapId}`,
    x: respawnMapId === placement.templateId ? placement.x : 0,
    y: respawnMapId === placement.templateId ? placement.y : 0,
    facing: placement.facing,
  };
  snapshot.attrState = {
    baseAttrs: asRecord(row.baseAttrs),
    revealedBreakthroughRequirementIds: arrayOfStrings(row.revealedBreakthroughRequirementIds),
  };
  snapshot.wallet = { balances: [] };
  snapshot.marketStorage = normalizeMarketStoragePayload(row.marketStorage);
  snapshot.progression = {
    ...snapshot.progression,
    alchemySkill: asRecord(row.alchemySkill),
    gatherSkill: asRecord(row.gatherSkill),
    gatherJob: asRecord(row.gatherJob),
    alchemyPresets: Array.isArray(row.alchemyPresets) ? row.alchemyPresets : [],
    alchemyJob: asRecord(row.alchemyJob),
    enhancementSkill: buildEnhancementSkill(row),
    enhancementSkillLevel: normalizeInteger(row.enhancementSkillLevel, 1),
    enhancementJob: asRecord(row.enhancementJob),
    enhancementRecords: Array.isArray(row.enhancementRecords) ? row.enhancementRecords : [],
    heavenGate: asRecord(row.heavenGate),
    spiritualRoots: asRecord(row.spiritualRoots),
  };
  snapshot.combat = {
    ...snapshot.combat,
    autoBattleTargetingMode: normalizeString(row.autoBattleTargetingMode) || 'auto',
    retaliatePlayerTargetId: null,
    combatTargetingRules: asRecord(row.combatTargetingRules) ?? null,
    autoUsePills: Array.isArray(row.autoUsePills) ? row.autoUsePills : [],
  };
  const unlocks = new Set(Array.isArray(snapshot.unlockedMapIds) ? snapshot.unlockedMapIds : []);
  if (placement.templateId) unlocks.add(placement.templateId);
  if (respawnMapId) unlocks.add(respawnMapId);
  snapshot.unlockedMapIds = Array.from(unlocks).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
  return snapshot;
}

async function convertRuntimeState(pool, services, limit) {
  const documents = await loadRuntimeDocuments(pool);
  const mapDocuments = await loadMapDocuments(pool);
  const snapshots = buildInstanceSnapshotsFromRuntimeDocuments(documents, mapDocuments, services.content);
  const selected = limit === null ? snapshots : snapshots.slice(0, Math.max(0, limit));
  let converted = 0;
  let skipped = 0;
  const failures = [];
  for (const snapshot of selected) {
    try {
      await services.instanceDomains.saveTileResourceDiffs(snapshot.instanceId, snapshot.tileResourceEntries);
      await services.instanceDomains.saveTileDamageStates(snapshot.instanceId, snapshot.tileDamageEntries);
      await services.instanceDomains.replaceGroundItems(snapshot.instanceId, snapshot.groundPileEntries);
      await services.instanceDomains.replaceContainerStates(snapshot.instanceId, snapshot.containerStates);
      await services.instanceDomains.replaceMonsterRuntimeStates(snapshot.instanceId, snapshot.monsterRuntimeEntries);
      await services.instanceDomains.saveInstanceCheckpoint(snapshot.instanceId, {
        kind: 'migrated_from_main_runtime_state',
        templateId: snapshot.templateId,
        savedAt: snapshot.savedAt,
        sourceKeys: snapshot.sourceKeys,
        tileResourceEntries: snapshot.tileResourceEntries,
        tileDamageEntries: snapshot.tileDamageEntries,
        groundPileEntries: snapshot.groundPileEntries,
        containerStates: snapshot.containerStates,
        monsterRuntimeEntries: snapshot.monsterRuntimeEntries,
      });
      await services.instanceDomains.saveInstanceRecoveryWatermark(snapshot.instanceId, {
        catalogVersion: snapshot.savedAt,
        recoveryVersion: snapshot.savedAt,
        checkpointKind: 'migrated_from_main_runtime_state',
      });
      converted += 1;
    } catch (error) {
      skipped += 1;
      failures.push({
        instanceId: snapshot.instanceId,
        error: error instanceof Error ? error.message : String(error),
      });
      if (failures.length >= 20) break;
    }
  }
  return {
    sourceMaps: snapshots.length,
    converted,
    skipped,
    totals: selected.reduce((acc, snapshot) => {
      acc.tileResourceEntries += snapshot.tileResourceEntries.length;
      acc.tileDamageEntries += snapshot.tileDamageEntries.length;
      acc.groundPileEntries += snapshot.groundPileEntries.length;
      acc.containerStates += snapshot.containerStates.length;
      acc.monsterRuntimeEntries += snapshot.monsterRuntimeEntries.length;
      return acc;
    }, {
      tileResourceEntries: 0,
      tileDamageEntries: 0,
      groundPileEntries: 0,
      containerStates: 0,
      monsterRuntimeEntries: 0,
    }),
    failures,
  };
}

function buildInstanceSnapshotsFromRuntimeDocuments(documents, mapDocuments, content) {
  const mapIds = new Set([
    ...Object.keys(documents.map_tile?.maps ?? {}),
    ...Object.keys(documents.map_monster?.maps ?? {}),
    ...Object.keys(documents.map_loot?.maps ?? {}),
  ]);
  const savedAt = Date.now();
  return Array.from(mapIds).sort().map((mapId) => {
    const width = resolveMapWidth(mapId, mapDocuments);
    const instanceId = `public:${mapId}`;
    const tileEntries = Array.isArray(documents.map_tile?.maps?.[mapId]) ? documents.map_tile.maps[mapId] : [];
    const loot = asRecord(documents.map_loot?.maps?.[mapId]) ?? {};
    const monsters = Array.isArray(documents.map_monster?.maps?.[mapId]) ? documents.map_monster.maps[mapId] : [];
    const tileResourceEntries = [];
    const tileDamageEntries = [];
    for (const entry of tileEntries) {
      const x = normalizeInteger(entry?.x, Number.NaN);
      const y = normalizeInteger(entry?.y, Number.NaN);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const tileIndex = y * width + x;
      const resources = asRecord(entry.resources);
      if (resources) {
        for (const [resourceKey, resourceState] of Object.entries(resources)) {
          const value = normalizeInteger(resourceState?.value, 0);
          if (normalizeString(resourceKey)) {
            tileResourceEntries.push({ resourceKey, tileIndex, value });
          }
        }
      }
      const terrain = asRecord(entry.terrain);
      if (terrain) {
        tileDamageEntries.push({
          tileIndex,
          x,
          y,
          hp: normalizeInteger(terrain.hp, 0),
          maxHp: Math.max(1, normalizeInteger(terrain.maxHp, Math.max(1, normalizeInteger(terrain.hp, 1)))),
          destroyed: terrain.destroyed === true,
          respawnLeft: Math.max(0, normalizeInteger(terrain.restoreTicksLeft ?? terrain.respawnLeft, 0)),
          modifiedAt: savedAt,
        });
      }
    }
    const groundPileEntries = Array.isArray(loot.groundPiles)
      ? loot.groundPiles.map((pile) => ({
          tileIndex: resolveTileIndex(pile, width),
          items: Array.isArray(pile?.items) ? pile.items : [],
        })).filter((pile) => Number.isFinite(pile.tileIndex))
      : [];
    const containerStates = Array.isArray(loot.containers)
      ? loot.containers.map((container) => ({ ...container, sourceId: normalizeString(container?.sourceId) || normalizeString(container?.containerId) }))
          .filter((container) => normalizeString(container.containerId))
      : [];
    const monsterRuntimeEntries = monsters
      .map((monster) => normalizeMonsterRuntimeEntry(monster, mapId, width, content))
      .filter(Boolean);
    return {
      instanceId,
      templateId: mapId,
      savedAt,
      sourceKeys: ['runtime_state/map_tile', 'runtime_state/map_loot', 'runtime_state/map_monster'],
      tileResourceEntries,
      tileDamageEntries,
      groundPileEntries,
      containerStates,
      monsterRuntimeEntries,
    };
  });
}

function normalizeMonsterRuntimeEntry(monster, mapId, width, content) {
  const runtimeId = normalizeString(monster?.runtimeId);
  const monsterId = normalizeString(monster?.monsterId) || parseMonsterIdFromRuntimeId(runtimeId);
  if (!runtimeId || !monsterId) return null;
  const template = content?.monsterRuntimeTemplates?.get?.(monsterId) ?? null;
  if (!template) return null;
  const monsterTier = normalizeString(template.tier) || 'mortal_blood';
  if (monsterTier === 'mortal_blood') return null;
  const x = normalizeInteger(monster.x, 0);
  const y = normalizeInteger(monster.y, 0);
  return {
    monsterRuntimeId: runtimeId,
    monsterId,
    monsterName: normalizeString(template.name) || monsterId,
    monsterTier,
    monsterLevel: normalizeInteger(template.level, null),
    tileIndex: y * width + x,
    x,
    y,
    hp: Math.max(0, normalizeInteger(monster.hp, template.maxHp ?? 1)),
    maxHp: Math.max(1, normalizeInteger(template.maxHp, monster.maxHp ?? monster.hp ?? 1)),
    alive: monster.alive === true,
    respawnLeft: normalizeInteger(monster.respawnLeft, 0),
    respawnTicks: normalizeInteger(template.respawnTicks, null),
    aggroTargetPlayerId: normalizeString(monster.aggroTargetPlayerId) || null,
    statePayload: {
      facing: normalizeInteger(monster.facing, 1),
      qi: normalizeInteger(monster.qi, 0),
      temporaryBuffs: Array.isArray(monster.temporaryBuffs) ? monster.temporaryBuffs : [],
      source: 'main_runtime_state',
    },
  };
}

async function convertMail(pool, services, limit) {
  const mailboxes = await loadLegacyMailboxes(pool, limit);
  let converted = 0;
  for (const mailbox of mailboxes) {
    await services.mail.saveMailbox(mailbox.playerId, mailbox.mailbox);
    converted += 1;
  }
  return {
    sourcePlayers: mailboxes.length,
    converted,
    mailCount: mailboxes.reduce((count, entry) => count + entry.mailbox.mails.length, 0),
  };
}

async function convertMarket(pool, services, limit) {
  const orders = await loadLegacyMarketOrders(pool, limit);
  const trades = await loadLegacyMarketTrades(pool, limit);
  await services.market.persistMutation({
    upsertOrders: orders,
    deleteOrderIds: [],
    upsertStorages: [],
    deleteStoragePlayerIds: [],
    tradeRecords: trades,
  });
  return { orders: orders.length, trades: trades.length };
}

async function convertSuggestions(pool, services) {
  const result = await pool.query(`
    SELECT id, "authorId", "authorName", title, description, status, upvotes, downvotes, "createdAt", replies, "authorLastReadGmReplyAt"
    FROM suggestions
    ORDER BY "createdAt" DESC, id ASC
  `).catch(() => ({ rows: [] }));
  const suggestions = result.rows.map((row) => ({
    id: normalizeString(row.id),
    authorId: normalizeString(row.authorId),
    authorName: normalizeString(row.authorName),
    title: normalizeString(row.title),
    description: normalizeString(row.description),
    status: normalizeString(row.status) || 'open',
    upvotes: Array.isArray(row.upvotes) ? row.upvotes : [],
    downvotes: Array.isArray(row.downvotes) ? row.downvotes : [],
    replies: Array.isArray(row.replies) ? row.replies : [],
    createdAt: normalizeInteger(row.createdAt, Date.now()),
    updatedAt: normalizeInteger(row.createdAt, Date.now()),
    authorLastReadGmReplyAt: normalizeInteger(row.authorLastReadGmReplyAt, 0),
  })).filter((entry) => entry.id);
  await services.suggestions.saveSuggestions({
    version: 1,
    revision: Date.now(),
    suggestions,
  });
  return { suggestions: suggestions.length };
}

async function convertGmAuth(sourcePool, targetPool) {
  const result = await sourcePool.query(`
    SELECT payload
    FROM persistent_documents
    WHERE scope = 'server_config' AND key = 'gm_auth'
    LIMIT 1
  `).catch(() => ({ rows: [] }));
  const payload = asRecord(result.rows?.[0]?.payload);
  if (!payload) {
    return { converted: false, reason: 'missing server_config/gm_auth' };
  }
  const passwordHash = normalizeString(payload.passwordHash ?? payload.hash);
  if (!passwordHash) {
    return { converted: false, reason: 'missing password hash' };
  }
  const updatedAt = normalizeString(payload.updatedAt) || new Date().toISOString();
  await targetPool.query(`
    CREATE TABLE IF NOT EXISTS server_gm_auth (
      record_key varchar(80) PRIMARY KEY,
      salt varchar(160) NOT NULL,
      password_hash varchar(256) NOT NULL,
      updated_at_text varchar(80) NOT NULL,
      raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await targetPool.query(`
    INSERT INTO server_gm_auth(record_key, salt, password_hash, updated_at_text, raw_payload, updated_at)
    VALUES ($1, $2, $3, $4, $5::jsonb, now())
    ON CONFLICT (record_key)
    DO UPDATE SET
      salt = EXCLUDED.salt,
      password_hash = EXCLUDED.password_hash,
      updated_at_text = EXCLUDED.updated_at_text,
      raw_payload = EXCLUDED.raw_payload,
      updated_at = now()
  `, [
    GM_AUTH_RECORD_KEY,
    normalizeString(payload.salt) || LEGACY_BCRYPT_SENTINEL_SALT,
    passwordHash,
    updatedAt,
    JSON.stringify({ salt: normalizeString(payload.salt) || LEGACY_BCRYPT_SENTINEL_SALT, hash: passwordHash, updatedAt }),
  ]);
  return { converted: true };
}

async function inspectTarget(pool) {
  const tables = [
    'server_player_auth',
    'server_player_identity',
    'player_identity',
    'server_player_snapshot',
    'player_world_anchor',
    'player_position_checkpoint',
    'player_vitals',
    'player_inventory_item',
    'player_market_storage_item',
    'player_mail',
    'player_mail_attachment',
    'player_mail_counter',
    'server_market_order',
    'server_market_trade_history',
    'server_suggestion',
    'server_gm_auth',
    'instance_tile_resource_state',
    'instance_tile_damage_state',
    'instance_ground_item',
    'instance_container_state',
    'instance_container_entry',
    'instance_monster_runtime_state',
    'instance_checkpoint',
  ];
  const tableCounts = {};
  for (const table of tables) {
    tableCounts[table] = await countTableRows(pool, table);
  }
  return { tableCounts };
}

async function loadLegacyPlayerRows(pool, limit) {
  const values = [];
  const limitSql = limit === null ? '' : ` LIMIT $${values.push(limit)}`;
  const result = await pool.query(`
    SELECT
      to_jsonb(u) AS "user",
      to_jsonb(p) AS player,
      to_jsonb(pc) AS collections,
      to_jsonb(ps) AS settings,
      to_jsonb(pp) AS presence
    FROM players p
    JOIN users u ON u.id = p."userId"
    LEFT JOIN player_collections pc ON pc."playerId" = p.id
    LEFT JOIN player_settings ps ON ps."playerId" = p.id
    LEFT JOIN player_presence pp ON pp."playerId" = p.id
    ORDER BY p.id ASC
    ${limitSql}
  `, values);
  return result.rows.map((row) => ({
    user: asRecord(row.user),
    player: asRecord(row.player),
    collections: asRecord(row.collections),
    settings: asRecord(row.settings),
    presence: asRecord(row.presence),
  }));
}

function mergeLegacyPlayerRow(player, collections, settings) {
  const row = { ...(player ?? {}) };
  for (const key of ['temporaryBuffs', 'inventory', 'marketStorage', 'equipment', 'techniques', 'bodyTraining', 'quests']) {
    if (collections && Object.prototype.hasOwnProperty.call(collections, key)) row[key] = collections[key];
  }
  for (const key of [
    'unlockedMinimapIds',
    'alchemySkill',
    'gatherSkill',
    'alchemyPresets',
    'alchemyJob',
    'enhancementSkillLevel',
    'enhancementJob',
    'enhancementRecords',
    'autoBattle',
    'autoBattleSkills',
    'autoUsePills',
    'combatTargetingRules',
    'autoBattleTargetingMode',
    'combatTargetId',
    'combatTargetLocked',
    'autoRetaliate',
    'autoBattleStationary',
    'allowAoePlayerHit',
    'autoIdleCultivation',
    'autoSwitchCultivation',
    'cultivatingTechId',
  ]) {
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) row[key] = settings[key];
  }
  return row;
}

async function loadRuntimeDocuments(pool) {
  const result = await pool.query(`
    SELECT key, payload
    FROM persistent_documents
    WHERE scope = 'runtime_state'
      AND key = ANY($1::varchar[])
  `, [['map_tile', 'map_monster', 'map_loot', 'npc_shop']]).catch(() => ({ rows: [] }));
  const documents = {};
  for (const row of result.rows) {
    documents[normalizeString(row.key)] = asRecord(row.payload) ?? {};
  }
  return documents;
}

async function loadMapDocuments(pool) {
  const result = await pool.query(`
    SELECT key, payload
    FROM persistent_documents
    WHERE scope = 'map_document'
  `).catch(() => ({ rows: [] }));
  const documents = new Map();
  for (const row of result.rows) {
    documents.set(normalizeString(row.key), asRecord(row.payload) ?? {});
  }
  return documents;
}

async function loadLegacyMailboxes(pool, limit) {
  const values = [];
  const limitSql = limit === null ? '' : ` LIMIT $${values.push(limit)}`;
  const result = await pool.query(`
    SELECT
      audience."playerId" AS player_id,
      jsonb_agg(jsonb_build_object(
        'mailId', campaign.id::text,
        'senderLabel', campaign."senderLabel",
        'templateId', campaign."templateId",
        'args', campaign.args,
        'fallbackTitle', campaign."fallbackTitle",
        'fallbackBody', campaign."fallbackBody",
        'attachments', campaign.attachments,
        'createdAt', campaign."createdAt",
        'updatedAt', campaign."updatedAt",
        'expireAt', campaign."expireAt",
        'firstSeenAt', receipt."firstSeenAt",
        'readAt', receipt."readAt",
        'claimedAt', receipt."claimedAt",
        'deletedAt', receipt."deletedAt"
      ) ORDER BY campaign."createdAt" DESC, campaign.id ASC) AS mails
    FROM mail_audience_members audience
    JOIN mail_campaigns campaign ON campaign.id = audience."mailId"
    LEFT JOIN player_mail_receipts receipt ON receipt."mailId" = audience."mailId" AND receipt."playerId" = audience."playerId"
    GROUP BY audience."playerId"
    ORDER BY audience."playerId" ASC
    ${limitSql}
  `, values).catch(() => ({ rows: [] }));
  return result.rows.map((row) => ({
    playerId: normalizeString(row.player_id),
    mailbox: {
      version: 1,
      revision: Date.now(),
      welcomeMailDeliveredAt: null,
      mails: (Array.isArray(row.mails) ? row.mails : []).map((mail) => ({
        version: 1,
        mailVersion: 1,
        mailId: normalizeString(mail.mailId),
        senderLabel: normalizeString(mail.senderLabel) || '系统',
        templateId: normalizeString(mail.templateId) || null,
        args: Array.isArray(mail.args) ? mail.args : [],
        fallbackTitle: normalizeString(mail.fallbackTitle) || null,
        fallbackBody: normalizeString(mail.fallbackBody) || null,
        attachments: Array.isArray(mail.attachments) ? mail.attachments : [],
        createdAt: normalizeInteger(mail.createdAt, Date.now()),
        updatedAt: normalizeInteger(mail.updatedAt, normalizeInteger(mail.createdAt, Date.now())),
        expireAt: normalizeNullableInteger(mail.expireAt),
        firstSeenAt: normalizeNullableInteger(mail.firstSeenAt),
        readAt: normalizeNullableInteger(mail.readAt),
        claimedAt: normalizeNullableInteger(mail.claimedAt),
        deletedAt: normalizeNullableInteger(mail.deletedAt),
      })).filter((mail) => mail.mailId),
    },
  })).filter((entry) => entry.playerId);
}

async function loadLegacyMarketOrders(pool, limit) {
  const values = [];
  const limitSql = limit === null ? '' : ` LIMIT $${values.push(limit)}`;
  const result = await pool.query(`
    SELECT id::text, "ownerId", "ownerName", side, "itemKey", "itemSnapshot", "remainingQuantity", "unitPrice", status, "createdAt", "updatedAt"
    FROM market_orders
    ORDER BY "createdAt" ASC, id ASC
    ${limitSql}
  `, values).catch(() => ({ rows: [] }));
  return result.rows.map((row) => ({
    version: 1,
    id: normalizeString(row.id),
    ownerId: normalizeString(row.ownerId),
    ownerName: normalizeString(row.ownerName),
    side: row.side === 'buy' ? 'buy' : 'sell',
    status: ['open', 'filled', 'cancelled'].includes(row.status) ? row.status : 'open',
    itemKey: normalizeLegacyMarketItemKey(row.itemKey, row.itemSnapshot),
    item: buildLegacyMarketOrderItem(row.itemSnapshot, row.itemKey),
    legacyOriginalItemKey: normalizeString(row.itemKey),
    remainingQuantity: Math.max(0, normalizeInteger(row.remainingQuantity, 0)),
    unitPrice: Number(row.unitPrice ?? 1),
    createdAt: normalizeInteger(row.createdAt, Date.now()),
    updatedAt: normalizeInteger(row.updatedAt, normalizeInteger(row.createdAt, Date.now())),
  })).filter((order) => order.id && order.ownerId && order.itemKey && order.item?.itemId);
}

function normalizeLegacyMarketItemKey(itemKey, itemSnapshot) {
  const rawKey = normalizeString(itemKey);
  if (rawKey && rawKey.length <= 240) {
    return rawKey;
  }
  const itemId = normalizeString(itemSnapshot?.itemId) || normalizeString(itemSnapshot?.id) || 'unknown';
  const hashSource = rawKey || JSON.stringify(itemSnapshot ?? {});
  if (!hashSource) {
    return itemId;
  }
  const digest = createHash('sha1').update(hashSource).digest('base64url').replace(/[-_]/g, '').slice(0, 28);
  return `legacy:${itemId}:${digest}`.slice(0, 240);
}

function buildLegacyMarketOrderItem(itemSnapshot, itemKey) {
  const item = asRecord(itemSnapshot);
  if (item) {
    return item;
  }
  const rawKey = normalizeString(itemKey);
  if (rawKey.startsWith('{')) {
    try {
      return asRecord(JSON.parse(rawKey)) ?? { itemId: rawKey, count: 1 };
    } catch {
      return { itemId: rawKey, count: 1 };
    }
  }
  return { itemId: rawKey, count: 1 };
}

async function loadLegacyMarketTrades(pool, limit) {
  const values = [];
  const limitSql = limit === null ? '' : ` LIMIT $${values.push(limit)}`;
  const result = await pool.query(`
    SELECT id::text, "buyerId", "sellerId", "itemId", quantity, "unitPrice", "createdAt"
    FROM market_trade_history
    ORDER BY "createdAt" ASC, id ASC
    ${limitSql}
  `, values).catch(() => ({ rows: [] }));
  return result.rows.map((row) => ({
    version: 1,
    id: normalizeString(row.id),
    buyerId: normalizeString(row.buyerId),
    sellerId: normalizeString(row.sellerId),
    itemId: normalizeString(row.itemId),
    quantity: Math.max(1, normalizeInteger(row.quantity, 1)),
    unitPrice: Number(row.unitPrice ?? 1),
    createdAt: normalizeInteger(row.createdAt, Date.now()),
  })).filter((trade) => trade.id && trade.buyerId && trade.sellerId && trade.itemId);
}

async function countPlayerRows(pool, limit) {
  if (limit !== null) return limit;
  const result = await pool.query('SELECT count(*)::int AS count FROM players').catch(() => ({ rows: [{ count: 0 }] }));
  return Number(result.rows[0]?.count ?? 0);
}

async function countRuntimeMaps(pool) {
  const result = await pool.query(`
    SELECT payload
    FROM persistent_documents
    WHERE scope = 'runtime_state' AND key = 'map_tile'
    LIMIT 1
  `).catch(() => ({ rows: [] }));
  const maps = asRecord(result.rows?.[0]?.payload)?.maps;
  return maps && typeof maps === 'object' ? Object.keys(maps).length : 0;
}

async function countMailPlayers(pool, limit) {
  if (limit !== null) return limit;
  const result = await pool.query('SELECT count(DISTINCT "playerId")::int AS count FROM mail_audience_members').catch(() => ({ rows: [{ count: 0 }] }));
  return Number(result.rows[0]?.count ?? 0);
}

async function countTableRows(pool, table) {
  const exists = await pool.query(
    `SELECT to_regclass($1) AS regclass`,
    [`public.${table}`],
  ).catch(() => ({ rows: [] }));
  if (!exists.rows?.[0]?.regclass) return 0;
  const result = await pool.query(`SELECT count(*)::int AS count FROM ${table}`).catch(() => ({ rows: [{ count: 0 }] }));
  return Number(result.rows[0]?.count ?? 0);
}

async function recreateDatabase(maintenanceDatabaseUrl, databaseName) {
  await dropDatabase(maintenanceDatabaseUrl, databaseName);
  await runCommand('createdb', [`--maintenance-db=${maintenanceDatabaseUrl}`, databaseName]);
}

async function dropDatabase(maintenanceDatabaseUrl, databaseName) {
  await runCommand('dropdb', ['--if-exists', `--maintenance-db=${maintenanceDatabaseUrl}`, databaseName]);
}

async function restoreCustomDumpToDatabase(dumpPath, databaseUrl) {
  await new Promise((resolve, reject) => {
    const restore = spawn('pg_restore', ['--no-owner', '--no-privileges', '-f', '-', dumpPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    const psql = spawn('psql', ['-v', 'ON_ERROR_STOP=1', databaseUrl], { stdio: ['pipe', 'ignore', 'pipe'] });
    const stderr = [];
    let carry = '';
    restore.stderr.on('data', (chunk) => stderr.push(String(chunk)));
    psql.stderr.on('data', (chunk) => stderr.push(String(chunk)));
    restore.stdout.on('data', (chunk) => {
      const text = carry + String(chunk);
      const lines = text.split(/\r?\n/u);
      carry = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim() === 'SET transaction_timeout = 0;') continue;
        psql.stdin.write(`${line}\n`);
      }
    });
    restore.stdout.on('end', () => {
      if (carry.trim() && carry.trim() !== 'SET transaction_timeout = 0;') {
        psql.stdin.write(carry);
      }
      psql.stdin.end();
    });
    let restoreCode = null;
    let psqlCode = null;
    const finish = () => {
      if (restoreCode === null || psqlCode === null) return;
      if (restoreCode !== 0 || psqlCode !== 0) {
        reject(new Error(`dump restore failed: pg_restore=${restoreCode} psql=${psqlCode}\n${stderr.join('')}`));
        return;
      }
      resolve();
    };
    restore.on('error', reject);
    psql.on('error', reject);
    restore.on('close', (code) => {
      restoreCode = code;
      finish();
    });
    psql.on('close', (code) => {
      psqlCode = code;
      finish();
    });
  });
}

async function runCommand(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const stderr = [];
    child.stderr.on('data', (chunk) => stderr.push(String(chunk)));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} failed with code ${code}: ${stderr.join('')}`));
    });
  });
}

function buildDatabaseUrl(baseUrl, databaseName) {
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function redactDatabaseUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return '<invalid-url>';
  }
}

function resolveUpdatedAtMs(...records) {
  let latest = 0;
  for (const record of records) {
    for (const key of ['updatedAt', 'createdAt']) {
      const value = normalizeDateMs(record?.[key]);
      if (value !== null) latest = Math.max(latest, value);
    }
  }
  return latest > 0 ? latest : Date.now();
}

function normalizeDateMs(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && !value.trim()) return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();
  if (Number.isFinite(Number(value))) return Math.max(0, Math.trunc(Number(value)));
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeDateString(value) {
  const ms = normalizeDateMs(value);
  return ms === null ? null : new Date(ms).toISOString();
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function normalizeNullableInteger(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim()) : [];
}

function normalizeMarketStoragePayload(value) {
  const record = asRecord(value) ?? {};
  return {
    items: Array.isArray(record.items) ? record.items : [],
  };
}

function buildEnhancementSkill(row) {
  const existing = asRecord(row.enhancementSkill);
  if (existing) return existing;
  return {
    level: normalizeInteger(row.enhancementSkillLevel, 1),
    exp: 0,
    expToNext: 60,
  };
}

function resolveMapWidth(mapId, mapDocuments) {
  const doc = mapDocuments.get(mapId);
  if (Number.isFinite(Number(doc?.width))) return Math.max(1, Math.trunc(Number(doc.width)));
  if (Array.isArray(doc?.tiles) && typeof doc.tiles[0] === 'string') return Math.max(1, doc.tiles[0].length);
  return 1000;
}

function resolveTileIndex(value, width) {
  if (Number.isFinite(Number(value?.tileIndex))) return Math.max(0, Math.trunc(Number(value.tileIndex)));
  const x = normalizeInteger(value?.x, Number.NaN);
  const y = normalizeInteger(value?.y, Number.NaN);
  return Number.isFinite(x) && Number.isFinite(y) ? y * width + x : Number.NaN;
}

function parseMonsterIdFromRuntimeId(runtimeId) {
  const parts = normalizeString(runtimeId).split(':');
  return parts[0] === 'monster' && parts.length >= 3 ? normalizeString(parts[2]) : '';
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});

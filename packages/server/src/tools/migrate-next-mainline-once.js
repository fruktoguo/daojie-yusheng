"use strict";

const fs = require("fs/promises");
const path = require("path");
const { Pool } = require("pg");
const { resolveServerNextDatabaseUrl } = require("../config/env-alias");

const PLAYER_AUTH_SCOPE = 'server_next_player_auth_v1';
const PLAYER_AUTH_TABLE = 'server_next_player_auth';
const PLAYER_IDENTITY_SCOPE = 'server_next_player_identities_v1';
const PLAYER_IDENTITY_TABLE = 'server_next_player_identity';
const PLAYER_SNAPSHOT_SCOPE = 'server_next_player_snapshots_v1';
const PLAYER_SNAPSHOT_TABLE = 'server_next_player_snapshot';
const MAILBOX_SCOPE = 'server_next_mailboxes_v1';
const MARKET_ORDER_SCOPE = 'server_next_market_orders_v1';
const MARKET_TRADE_SCOPE = 'server_next_market_trade_history_v1';
const MARKET_STORAGE_SCOPE = 'server_next_market_storage_v1';
const REDEEM_CODE_SCOPE = 'server_next_redeem_codes_v1';
const REDEEM_CODE_KEY = 'global';
const GM_AUTH_SCOPE = 'server_next_gm_auth_v1';
const GM_AUTH_KEY = 'gm_auth';
const LEGACY_GM_AUTH_SCOPES = ['server_next_legacy_gm_auth_v1', 'server_config'];
const DATABASE_BACKUP_METADATA_SCOPE = 'server_next_db_backups_v1';
const LEGACY_DATABASE_BACKUP_METADATA_SCOPE = 'server_next_legacy_db_backups_v1';
const DATABASE_JOB_STATE_SCOPE = 'server_next_db_jobs_v1';
const LEGACY_DATABASE_JOB_STATE_SCOPE = 'server_next_legacy_db_jobs_v1';
const DATABASE_JOB_STATE_KEY = 'gm_database';
const BACKUP_SCOPE_LABEL = 'persistent_documents_only';
const SUGGESTION_SCOPE = 'server_next_suggestions_v1';
const SUGGESTION_KEY = 'global';
const LEGACY_SUGGESTION_FILE = path.resolve(__dirname, "../../../../legacy/server/data/runtime/suggestions.json");

const SUPPORTED_DOMAINS = ['auth', 'identity', 'snapshot', 'mail', 'market', 'redeem', 'suggestion', 'gm-auth', 'gm-database'];

const CREATE_PLAYER_AUTH_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${PLAYER_AUTH_TABLE} (
    user_id varchar(100) PRIMARY KEY,
    username varchar(80) NOT NULL UNIQUE,
    player_id varchar(100) NOT NULL UNIQUE,
    pending_role_name varchar(120) NOT NULL,
    display_name varchar(32),
    password_hash text NOT NULL,
    total_online_seconds integer NOT NULL DEFAULT 0,
    current_online_started_at timestamptz,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL
  )
`;
const CREATE_PLAYER_IDENTITY_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${PLAYER_IDENTITY_TABLE} (
    user_id varchar(100) PRIMARY KEY,
    username varchar(80) NOT NULL UNIQUE,
    player_id varchar(100) NOT NULL UNIQUE,
    display_name varchar(32),
    player_name varchar(120) NOT NULL,
    persisted_source varchar(32) NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL
  )
`;
const CREATE_PLAYER_SNAPSHOT_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${PLAYER_SNAPSHOT_TABLE} (
    player_id varchar(100) PRIMARY KEY,
    template_id varchar(120) NOT NULL,
    persisted_source varchar(32) NOT NULL,
    seeded_at bigint,
    saved_at bigint NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL
  )
`;

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        printHelp();
        return;
    }
    const fixture = options.fixturePath ? await loadFixture(options.fixturePath) : null;
    const databaseUrl = resolveServerNextDatabaseUrl();
    if (!databaseUrl.trim() && !fixture) {
        throw new Error('缺少 SERVER_NEXT_DATABASE_URL/DATABASE_URL');
    }
    if (fixture && !databaseUrl.trim() && !options.dryRun) {
        throw new Error('fixture 模式仅支持 dry-run；缺少数据库时不能执行 --write');
    }
    const pool = databaseUrl.trim() ? new Pool({ connectionString: databaseUrl }) : null;
    const summary = {
        dryRun: options.dryRun,
        domains: options.domains,
        fixturePath: options.fixturePath ?? null,
        migrated: {},
        failed: [],
    };
    try {
        const client = pool ? await pool.connect() : null;
        try {
            if (client) {
                await client.query('BEGIN');
                await ensurePersistentDocuments(client);
                await ensureTargetTables(client);
            }
            for (const domain of options.domains) {
                summary.migrated[domain] = await migrateDomain(client, fixture, domain, options.dryRun, summary.failed);
            }
            if (client) {
                if (options.dryRun) {
                    await client.query('ROLLBACK');
                }
                else {
                    await client.query('COMMIT');
                }
            }
        }
        catch (error) {
            if (client) {
                await client.query('ROLLBACK').catch(() => undefined);
            }
            throw error;
        }
        finally {
            client?.release();
        }
    }
    finally {
        await pool?.end().catch(() => undefined);
    }
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (summary.failed.length > 0) {
        process.exitCode = 2;
    }
}

function parseArgs(argv) {
    const options = {
        help: false,
        dryRun: true,
        domains: [...SUPPORTED_DOMAINS],
        fixturePath: null,
    };
    for (const arg of argv) {
        if (arg === '--help' || arg === '-h') {
            options.help = true;
            continue;
        }
        if (arg === '--write') {
            options.dryRun = false;
            continue;
        }
        if (arg === '--dry-run') {
            options.dryRun = true;
            continue;
        }
        if (arg.startsWith('--domains=')) {
            const requested = arg.slice('--domains='.length)
                .split(',')
                .map((entry) => entry.trim())
                .filter(Boolean);
            options.domains = requested.filter((entry) => SUPPORTED_DOMAINS.includes(entry));
            continue;
        }
        if (arg.startsWith('--fixture=')) {
            const fixturePath = arg.slice('--fixture='.length).trim();
            options.fixturePath = fixturePath ? path.resolve(process.cwd(), fixturePath) : null;
        }
    }
    return options;
}

function printHelp() {
    process.stdout.write([
        '用法：node packages/server/src/tools/migrate-next-mainline-once.js [--dry-run] [--write] [--fixture=path/to/sample.json] [--domains=auth,identity,snapshot,mail,market,redeem,suggestion,gm-auth,gm-database]',
        '',
        '默认行为：',
        '- 连接 SERVER_NEXT_DATABASE_URL / DATABASE_URL',
        '- 从 persistent_documents 旧 scope 读取 auth/identity/snapshot',
        '- 从 legacy mail_campaigns/mail_audience_members/player_mail_receipts 读取 mail',
        '- 从 legacy market_orders/market_trade_history/players.marketStorage 读取 market',
        '- 从 legacy redeem_code_groups/redeem_codes 读取 redeem',
        '- 从 legacy suggestions 表或 legacy/server/data/runtime/suggestions.json 读取 suggestion',
        '- 从 server_next_legacy_gm_auth_v1/server_config 读取 gm-auth',
        '- 从 server_next_legacy_db_backups_v1/server_next_legacy_db_jobs_v1 读取 gm-database',
        '- 指定 --fixture 时，可在无数据库环境下执行样本 dry-run',
        '- 输出迁移摘要与失败清单',
        '- 默认 dry-run，只回滚不落库',
    ].join('\n') + '\n');
}

async function loadFixture(fixturePath) {
    const raw = await fs.readFile(fixturePath, 'utf8');
    return asRecord(JSON.parse(raw));
}

async function ensurePersistentDocuments(client) {
    const relation = await client.query(`SELECT to_regclass('public.persistent_documents') AS relation_name`);
    if (!relation.rows[0]?.relation_name) {
        throw new Error('缺少 persistent_documents，无法执行一次性迁移');
    }
}

async function ensureTargetTables(client) {
    await client.query(CREATE_PLAYER_AUTH_TABLE_SQL);
    await client.query(CREATE_PLAYER_IDENTITY_TABLE_SQL);
    await client.query(CREATE_PLAYER_SNAPSHOT_TABLE_SQL);
}

async function migrateDomain(client, fixture, domain, dryRun, failures) {
    switch (domain) {
        case 'auth':
            return migrateRows(client, fixture, {
                scope: PLAYER_AUTH_SCOPE,
                table: PLAYER_AUTH_TABLE,
                normalize: normalizeAuthRecord,
                upsert: upsertAuthRecord,
                dryRun,
                failures,
            });
        case 'identity':
            return migrateRows(client, fixture, {
                scope: PLAYER_IDENTITY_SCOPE,
                table: PLAYER_IDENTITY_TABLE,
                normalize: normalizeIdentityRecord,
                upsert: upsertIdentityRecord,
                dryRun,
                failures,
            });
        case 'snapshot':
            return migrateRows(client, fixture, {
                scope: PLAYER_SNAPSHOT_SCOPE,
                table: PLAYER_SNAPSHOT_TABLE,
                normalize: normalizeSnapshotRecord,
                upsert: upsertSnapshotRecord,
                dryRun,
                failures,
            });
        case 'mail':
            return migrateMailDomain(client, fixture, dryRun, failures);
        case 'market':
            return migrateMarketDomain(client, fixture, dryRun, failures);
        case 'redeem':
            return migrateRedeemDomain(client, fixture, dryRun, failures);
        case 'suggestion':
            return migrateSuggestionDomain(client, fixture, dryRun, failures);
        case 'gm-auth':
            return migrateGmAuthDomain(client, fixture, dryRun, failures);
        case 'gm-database':
            return migrateGmDatabaseDomain(client, fixture, dryRun, failures);
        default:
            return { read: 0, migrated: 0, skipped: 0 };
    }
}

async function migrateGmDatabaseDomain(client, fixture, dryRun, failures) {
    const backupRows = await loadLegacyScopeRows(client, fixture, LEGACY_DATABASE_BACKUP_METADATA_SCOPE);
    const normalizedBackups = backupRows
        .map((row) => normalizeDatabaseBackupMetadataRecord(row))
        .filter(Boolean);
    const legacyJobPayload = await loadPersistentPayload(client, fixture, LEGACY_DATABASE_JOB_STATE_SCOPE, DATABASE_JOB_STATE_KEY);
    const normalizedJobState = normalizeDatabaseJobStateRecord(legacyJobPayload);
    if (!dryRun) {
        for (const backup of normalizedBackups) {
            await upsertPersistentDocument(client, DATABASE_BACKUP_METADATA_SCOPE, backup.id, backup);
        }
        if (normalizedJobState) {
            await upsertPersistentDocument(client, DATABASE_JOB_STATE_SCOPE, DATABASE_JOB_STATE_KEY, normalizedJobState);
        }
    }
    return {
        read: backupRows.length + (legacyJobPayload ? 1 : 0),
        migrated: normalizedBackups.length + (normalizedJobState ? 1 : 0),
        skipped: Math.max(0, backupRows.length - normalizedBackups.length) + (legacyJobPayload && !normalizedJobState ? 1 : 0),
    };
}

async function migrateGmAuthDomain(client, fixture, dryRun, failures) {
    const record = await loadLegacyGmAuthRecord(client, fixture);
    if (!record) {
        return { read: 0, migrated: 0, skipped: 0 };
    }
    const normalized = normalizeGmAuthRecord(record);
    if (!normalized) {
        failures.push({
            domain: GM_AUTH_SCOPE,
            key: GM_AUTH_KEY,
            error: 'legacy gm auth payload invalid',
        });
        return { read: 1, migrated: 0, skipped: 1 };
    }
    if (!dryRun) {
        await upsertGmAuthRecord(client, normalized);
    }
    return { read: 1, migrated: 1, skipped: 0 };
}

async function migrateRedeemDomain(client, fixture, dryRun, failures) {
    const groups = await loadLegacyRedeemGroups(client, fixture);
    const codes = await loadLegacyRedeemCodes(client, fixture);
    const normalizedGroups = groups
        .map((entry) => normalizeRedeemGroupRecord(entry))
        .filter(Boolean);
    const validGroupIds = new Set(normalizedGroups.map((entry) => entry.id));
    let skipped = groups.length - normalizedGroups.length;
    const normalizedCodes = [];
    for (const entry of codes) {
        const code = normalizeRedeemCodeRecord(entry);
        if (!code || !validGroupIds.has(code.groupId)) {
            skipped += 1;
            continue;
        }
        normalizedCodes.push(code);
    }
    if (!dryRun && (normalizedGroups.length > 0 || normalizedCodes.length > 0)) {
        await upsertRedeemDocument(client, {
            version: 1,
            revision: Math.max(1, normalizedGroups.length + normalizedCodes.length),
            groups: normalizedGroups,
            codes: normalizedCodes,
        });
    }
    return {
        read: groups.length + codes.length,
        migrated: normalizedGroups.length + normalizedCodes.length,
        skipped,
    };
}

async function migrateMarketDomain(client, fixture, dryRun, failures) {
    const orders = (await loadLegacyMarketOrders(client, fixture))
        .map((entry) => normalizeMarketOrderRecord(entry))
        .filter(Boolean);
    const trades = (await loadLegacyMarketTrades(client, fixture))
        .map((entry) => normalizeMarketTradeRecord(entry))
        .filter(Boolean);
    const storages = (await loadLegacyMarketStorages(client, fixture))
        .map((entry) => normalizeMarketStorageRecord(entry))
        .filter(Boolean);
    if (!dryRun) {
        for (const order of orders) {
            await upsertMarketOrder(client, order);
        }
        for (const trade of trades) {
            await upsertMarketTrade(client, trade);
        }
        for (const storage of storages) {
            await upsertMarketStorage(client, storage);
        }
    }
    return {
        read: orders.length + trades.length + storages.length,
        migrated: orders.length + trades.length + storages.length,
        skipped: 0,
    };
}

async function migrateMailDomain(client, fixture, dryRun, failures) {
    const campaigns = await loadLegacyMailCampaigns(client, fixture);
    if (campaigns.length === 0) {
        return { read: 0, migrated: 0, skipped: 0 };
    }
    const audienceRows = await loadLegacyMailAudienceRows(client, fixture);
    const receiptRows = await loadLegacyMailReceiptRows(client, fixture);
    const players = await loadLegacyPlayers(client, fixture);
    const playerIds = new Set(players.map((entry) => entry.playerId));
    const playerCreatedAtById = new Map(players.map((entry) => [entry.playerId, entry.createdAt]));
    for (const row of audienceRows) {
        if (row.playerId) {
            playerIds.add(row.playerId);
        }
    }
    for (const row of receiptRows) {
        if (row.playerId) {
            playerIds.add(row.playerId);
        }
    }
    const audienceByMailId = new Map();
    for (const row of audienceRows) {
        const list = audienceByMailId.get(row.mailId) ?? [];
        list.push(row.playerId);
        audienceByMailId.set(row.mailId, list);
    }
    const receiptByMailAndPlayer = new Map();
    for (const row of receiptRows) {
        receiptByMailAndPlayer.set(`${row.mailId}::${row.playerId}`, row);
    }
    const mailboxByPlayerId = new Map();
    let skipped = 0;
    for (const campaign of campaigns) {
        const normalizedCampaign = normalizeMailCampaign(campaign);
        if (!normalizedCampaign) {
            skipped += 1;
            continue;
        }
        const recipientIds = resolveMailRecipientIds(normalizedCampaign, audienceByMailId, playerIds, playerCreatedAtById);
        if (recipientIds.length === 0) {
            skipped += 1;
            continue;
        }
        for (const playerId of recipientIds) {
            const receipt = receiptByMailAndPlayer.get(`${normalizedCampaign.mailId}::${playerId}`) ?? null;
            const mailbox = mailboxByPlayerId.get(playerId) ?? [];
            mailbox.push(buildMailboxMailEntry(normalizedCampaign, receipt));
            mailboxByPlayerId.set(playerId, mailbox);
        }
    }
    let migrated = 0;
    if (!dryRun) {
        for (const [playerId, mails] of mailboxByPlayerId.entries()) {
            await upsertMailboxDocument(client, playerId, mails);
            migrated += 1;
        }
    }
    else {
        migrated = mailboxByPlayerId.size;
    }
    return {
        read: campaigns.length + audienceRows.length + receiptRows.length,
        migrated,
        skipped,
    };
}

async function migrateSuggestionDomain(client, fixture, dryRun, failures) {
    const suggestions = await loadLegacySuggestions(client, fixture, failures);
    const normalized = [];
    let skipped = 0;
    for (const entry of suggestions) {
        const suggestion = normalizeSuggestionEntry(entry);
        if (!suggestion) {
            skipped += 1;
            continue;
        }
        normalized.push(suggestion);
    }
    if (!dryRun && normalized.length > 0) {
        await upsertSuggestionDocument(client, {
            version: 1,
            revision: Math.max(1, normalized.length),
            suggestions: normalized,
        });
    }
    return {
        read: suggestions.length,
        migrated: normalized.length,
        skipped,
    };
}

async function migrateRows(client, fixture, options) {
    const rows = fixture
        ? getFixtureScopeRows(fixture, options.scope)
        : (await client.query('SELECT key, payload FROM persistent_documents WHERE scope = $1 ORDER BY key ASC', [options.scope])).rows;
    const summary = { read: rows.length, migrated: 0, skipped: 0 };
    for (const row of rows) {
        try {
            const normalized = options.normalize(row);
            if (!normalized) {
                summary.skipped += 1;
                continue;
            }
            if (!options.dryRun) {
                await options.upsert(client, normalized);
            }
            summary.migrated += 1;
        }
        catch (error) {
            options.failures.push({
                domain: options.scope,
                key: row?.key ?? null,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    return summary;
}

function normalizeAuthRecord(row) {
    const payload = asRecord(row?.payload);
    const id = readString(payload.id || payload.userId || row?.key);
    const username = readString(payload.username || payload.accountName || payload.loginName);
    const playerId = readString(payload.playerId || payload.roleId || payload.pendingRoleName || payload.playerName);
    const pendingRoleName = readString(payload.pendingRoleName || payload.playerName || payload.roleName || playerId);
    const passwordHash = readString(payload.passwordHash || payload.password);
    const createdAt = normalizeTimestamp(payload.createdAt) || new Date().toISOString();
    if (!id || !username || !playerId || !pendingRoleName || !passwordHash) {
        return null;
    }
    const displayName = readNullableString(payload.displayName);
    const totalOnlineSeconds = normalizeInteger(payload.totalOnlineSeconds);
    const currentOnlineStartedAt = normalizeNullableTimestamp(payload.currentOnlineStartedAt);
    const nextPayload = {
        ...payload,
        id,
        userId: id,
        username,
        playerId,
        pendingRoleName,
        displayName,
        passwordHash,
        totalOnlineSeconds,
        currentOnlineStartedAt,
        createdAt,
    };
    return {
        userId: id,
        username,
        playerId,
        pendingRoleName,
        displayName,
        passwordHash,
        totalOnlineSeconds,
        currentOnlineStartedAt,
        createdAt,
        payload: nextPayload,
    };
}

function normalizeIdentityRecord(row) {
    const payload = asRecord(row?.payload);
    const userId = readString(payload.userId || payload.id || row?.key);
    const username = readString(payload.username);
    const playerId = readString(payload.playerId || payload.playerName);
    const playerName = readString(payload.playerName || payload.playerId);
    if (!userId || !username || !playerId || !playerName) {
        return null;
    }
    return {
        userId,
        username,
        playerId,
        displayName: readNullableString(payload.displayName),
        playerName,
        persistedSource: readString(payload.persistedSource || 'native') || 'native',
        payload: {
            ...payload,
            userId,
            username,
            playerId,
            displayName: readNullableString(payload.displayName),
            playerName,
            persistedSource: readString(payload.persistedSource || 'native') || 'native',
        },
    };
}

function normalizeSnapshotRecord(row) {
    const payload = asRecord(row?.payload);
    const playerId = readString(payload.playerId || row?.key);
    const placement = asRecord(payload.placement);
    const templateId = readString(placement.templateId || payload.templateId);
    if (!playerId || !templateId) {
        return null;
    }
    const snapshotMeta = asRecord(payload.__snapshotMeta);
    const persistedSource = readString(snapshotMeta.persistedSource || payload.persistedSource || 'native') || 'native';
    const seededAt = normalizeNullableInteger(snapshotMeta.seededAt);
    const savedAt = normalizeInteger(payload.savedAt || snapshotMeta.savedAt || Date.now());
    return {
        playerId,
        templateId,
        persistedSource,
        seededAt,
        savedAt,
        payload,
    };
}

async function upsertAuthRecord(client, record) {
    await client.query(`
      INSERT INTO ${PLAYER_AUTH_TABLE}(
        user_id,
        username,
        player_id,
        pending_role_name,
        display_name,
        password_hash,
        total_online_seconds,
        current_online_started_at,
        created_at,
        updated_at,
        payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz, now(), $10::jsonb)
      ON CONFLICT (user_id)
      DO UPDATE SET
        username = EXCLUDED.username,
        player_id = EXCLUDED.player_id,
        pending_role_name = EXCLUDED.pending_role_name,
        display_name = EXCLUDED.display_name,
        password_hash = EXCLUDED.password_hash,
        total_online_seconds = EXCLUDED.total_online_seconds,
        current_online_started_at = EXCLUDED.current_online_started_at,
        created_at = EXCLUDED.created_at,
        updated_at = now(),
        payload = EXCLUDED.payload
    `, [
        record.userId,
        record.username,
        record.playerId,
        record.pendingRoleName,
        record.displayName,
        record.passwordHash,
        record.totalOnlineSeconds,
        record.currentOnlineStartedAt,
        record.createdAt,
        JSON.stringify(record.payload),
    ]);
}

async function upsertIdentityRecord(client, record) {
    await client.query(`
      INSERT INTO ${PLAYER_IDENTITY_TABLE}(
        user_id,
        username,
        player_id,
        display_name,
        player_name,
        persisted_source,
        updated_at,
        payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, now(), $7::jsonb)
      ON CONFLICT (user_id)
      DO UPDATE SET
        username = EXCLUDED.username,
        player_id = EXCLUDED.player_id,
        display_name = EXCLUDED.display_name,
        player_name = EXCLUDED.player_name,
        persisted_source = EXCLUDED.persisted_source,
        updated_at = now(),
        payload = EXCLUDED.payload
    `, [
        record.userId,
        record.username,
        record.playerId,
        record.displayName,
        record.playerName,
        record.persistedSource,
        JSON.stringify(record.payload),
    ]);
}

async function upsertSnapshotRecord(client, record) {
    await client.query(`
      INSERT INTO ${PLAYER_SNAPSHOT_TABLE}(
        player_id,
        template_id,
        persisted_source,
        seeded_at,
        saved_at,
        updated_at,
        payload
      )
      VALUES ($1, $2, $3, $4, $5, now(), $6::jsonb)
      ON CONFLICT (player_id)
      DO UPDATE SET
        template_id = EXCLUDED.template_id,
        persisted_source = EXCLUDED.persisted_source,
        seeded_at = EXCLUDED.seeded_at,
        saved_at = EXCLUDED.saved_at,
        updated_at = now(),
        payload = EXCLUDED.payload
    `, [
        record.playerId,
        record.templateId,
        record.persistedSource,
        record.seededAt,
        record.savedAt,
        JSON.stringify(record.payload),
    ]);
}

async function loadLegacySuggestions(client, fixture, failures) {
    if (fixture) {
        return getFixtureTableRows(fixture, 'suggestions');
    }
    const suggestionTableExists = await hasTable(client, 'suggestions');
    if (suggestionTableExists) {
        const result = await client.query(`
          SELECT
            id,
            author_id AS "authorId",
            author_name AS "authorName",
            title,
            description,
            status,
            upvotes,
            downvotes,
            replies,
            author_last_read_gm_reply_at AS "authorLastReadGmReplyAt",
            created_at AS "createdAt"
          FROM suggestions
          ORDER BY created_at ASC, id ASC
        `);
        return result.rows;
    }
    try {
        const raw = await fs.readFile(LEGACY_SUGGESTION_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch (error) {
        if (error && typeof error === 'object' && error.code === 'ENOENT') {
            return [];
        }
        failures.push({
            domain: SUGGESTION_SCOPE,
            key: LEGACY_SUGGESTION_FILE,
            error: error instanceof Error ? error.message : String(error),
        });
        return [];
    }
}

async function loadLegacyRedeemGroups(client, fixture) {
    if (fixture) {
        return getFixtureTableRows(fixture, 'redeem_code_groups');
    }
    if (!(await hasTable(client, 'redeem_code_groups'))) {
        return [];
    }
    const result = await client.query(`
      SELECT
        id,
        name,
        rewards,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM redeem_code_groups
      ORDER BY created_at ASC, id ASC
    `);
    return result.rows;
}

async function loadLegacyMarketOrders(client, fixture) {
    if (fixture) {
        return getFixtureTableRows(fixture, 'market_orders');
    }
    if (!(await hasTable(client, 'market_orders'))) {
        return [];
    }
    const result = await client.query(`
      SELECT
        id,
        owner_id AS "ownerId",
        side,
        item_key AS "itemKey",
        item_snapshot AS "itemSnapshot",
        remaining_quantity AS "remainingQuantity",
        unit_price AS "unitPrice",
        status,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM market_orders
      ORDER BY created_at ASC, id ASC
    `);
    return result.rows;
}

async function loadLegacyMarketTrades(client, fixture) {
    if (fixture) {
        return getFixtureTableRows(fixture, 'market_trade_history');
    }
    if (!(await hasTable(client, 'market_trade_history'))) {
        return [];
    }
    const result = await client.query(`
      SELECT
        id,
        buyer_id AS "buyerId",
        seller_id AS "sellerId",
        item_id AS "itemId",
        quantity,
        unit_price AS "unitPrice",
        created_at AS "createdAt"
      FROM market_trade_history
      ORDER BY created_at ASC, id ASC
    `);
    return result.rows;
}

async function loadLegacyMarketStorages(client, fixture) {
    if (fixture) {
        return getFixtureTableRows(fixture, 'players');
    }
    if (!(await hasTable(client, 'players'))) {
        return [];
    }
    const result = await client.query(`
      SELECT
        id AS "playerId",
        market_storage AS "marketStorage"
      FROM players
      ORDER BY id ASC
    `);
    return result.rows;
}

async function loadLegacyMailCampaigns(client, fixture) {
    if (fixture) {
        return getFixtureTableRows(fixture, 'mail_campaigns');
    }
    if (!(await hasTable(client, 'mail_campaigns'))) {
        return [];
    }
    const result = await client.query(`
      SELECT
        id,
        scope,
        status,
        template_id AS "templateId",
        args,
        fallback_title AS "fallbackTitle",
        fallback_body AS "fallbackBody",
        sender_label AS "senderLabel",
        attachments,
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        expire_at AS "expireAt"
      FROM mail_campaigns
      WHERE status = 'active'
      ORDER BY created_at ASC, id ASC
    `);
    return result.rows;
}

async function loadLegacyMailAudienceRows(client, fixture) {
    if (fixture) {
        return getFixtureTableRows(fixture, 'mail_audience_members');
    }
    if (!(await hasTable(client, 'mail_audience_members'))) {
        return [];
    }
    const result = await client.query(`
      SELECT
        mail_id AS "mailId",
        player_id AS "playerId"
      FROM mail_audience_members
      ORDER BY created_at ASC, player_id ASC
    `);
    return result.rows;
}

async function loadLegacyMailReceiptRows(client, fixture) {
    if (fixture) {
        return getFixtureTableRows(fixture, 'player_mail_receipts');
    }
    if (!(await hasTable(client, 'player_mail_receipts'))) {
        return [];
    }
    const result = await client.query(`
      SELECT
        mail_id AS "mailId",
        player_id AS "playerId",
        first_seen_at AS "firstSeenAt",
        read_at AS "readAt",
        claimed_at AS "claimedAt",
        deleted_at AS "deletedAt",
        updated_at AS "updatedAt"
      FROM player_mail_receipts
      ORDER BY updated_at ASC, player_id ASC, mail_id ASC
    `);
    return result.rows;
}

async function loadLegacyPlayers(client, fixture) {
    if (fixture) {
        return getFixtureTableRows(fixture, 'players').map((row) => ({
            playerId: readString(row.playerId || row.id),
            createdAt: normalizeNullableTimestamp(row.createdAt),
        })).filter((row) => row.playerId);
    }
    if (!(await hasTable(client, 'players'))) {
        return [];
    }
    const result = await client.query(`
      SELECT
        id AS "playerId",
        created_at AS "createdAt"
      FROM players
      ORDER BY created_at ASC NULLS FIRST, id ASC
    `);
    return result.rows.map((row) => ({
        playerId: readString(row.playerId),
        createdAt: normalizeNullableTimestamp(row.createdAt),
    })).filter((row) => row.playerId);
}

async function loadLegacyRedeemCodes(client, fixture) {
    if (fixture) {
        return getFixtureTableRows(fixture, 'redeem_codes');
    }
    if (!(await hasTable(client, 'redeem_codes'))) {
        return [];
    }
    const result = await client.query(`
      SELECT
        id,
        group_id AS "groupId",
        code,
        status,
        used_by_player_id AS "usedByPlayerId",
        used_by_role_name AS "usedByRoleName",
        used_at AS "usedAt",
        destroyed_at AS "destroyedAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM redeem_codes
      ORDER BY created_at ASC, id ASC
    `);
    return result.rows;
}

async function loadLegacyGmAuthRecord(client, fixture) {
    for (const scope of LEGACY_GM_AUTH_SCOPES) {
        const payload = await loadPersistentPayload(client, fixture, scope, GM_AUTH_KEY);
        if (payload) {
            return payload;
        }
    }
    return null;
}

async function loadLegacyScopeRows(client, fixture, scope) {
    if (fixture) {
        return getFixtureScopeRows(fixture, scope);
    }
    const result = await client.query('SELECT key, payload FROM persistent_documents WHERE scope = $1 ORDER BY key ASC', [scope]);
    return result.rows;
}

async function loadPersistentPayload(client, fixture, scope, key) {
    if (fixture) {
        return getFixturePersistentPayload(fixture, scope, key);
    }
    const result = await client.query('SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2 LIMIT 1', [scope, key]);
    if (result.rowCount > 0) {
        return result.rows[0]?.payload ?? null;
    }
    return null;
}

function normalizeSuggestionEntry(raw) {
    const candidate = asRecord(raw);
    const id = readString(candidate.id);
    const authorId = readString(candidate.authorId);
    const authorName = readString(candidate.authorName || authorId);
    const title = readString(candidate.title);
    const description = readString(candidate.description);
    if (!id || !authorId || !authorName || !title || !description) {
        return null;
    }
    return {
        id,
        authorId,
        authorName,
        title,
        description,
        status: normalizeSuggestionStatus(candidate.status),
        upvotes: normalizeStringList(candidate.upvotes),
        downvotes: normalizeStringList(candidate.downvotes),
        replies: normalizeSuggestionReplies(candidate.replies),
        authorLastReadGmReplyAt: normalizeInteger(candidate.authorLastReadGmReplyAt),
        createdAt: normalizeEpochMs(candidate.createdAt || Date.now()),
    };
}

function normalizeRedeemGroupRecord(raw) {
    const candidate = asRecord(raw);
    const id = readString(candidate.id);
    const name = readString(candidate.name);
    if (!id || !name) {
        return null;
    }
    return {
        id,
        name,
        rewards: normalizeRewardList(candidate.rewards),
        createdAt: normalizeTimestamp(candidate.createdAt) || new Date(0).toISOString(),
        updatedAt: normalizeTimestamp(candidate.updatedAt) || new Date(0).toISOString(),
    };
}

function normalizeMarketOrderRecord(raw) {
    const candidate = asRecord(raw);
    const id = readString(candidate.id);
    const ownerId = readString(candidate.ownerId);
    const side = readString(candidate.side);
    const itemKey = readString(candidate.itemKey);
    const item = asRecord(candidate.itemSnapshot);
    const itemId = readString(item.itemId);
    if (!id || !ownerId || !itemKey || !itemId || (side !== 'buy' && side !== 'sell')) {
        return null;
    }
    return {
        version: 1,
        id,
        ownerId,
        side,
        status: normalizeMarketOrderStatus(candidate.status),
        itemKey,
        item: {
            ...item,
            itemId,
            count: 1,
        },
        remainingQuantity: Math.max(0, Math.trunc(Number(candidate.remainingQuantity) || 0)),
        unitPrice: Math.max(1, Number(candidate.unitPrice) || 1),
        createdAt: normalizeEpochMs(candidate.createdAt || Date.now()),
        updatedAt: normalizeEpochMs(candidate.updatedAt || candidate.createdAt || Date.now()),
    };
}

function normalizeMarketTradeRecord(raw) {
    const candidate = asRecord(raw);
    const id = readString(candidate.id);
    const buyerId = readString(candidate.buyerId);
    const sellerId = readString(candidate.sellerId);
    const itemId = readString(candidate.itemId);
    if (!id || !buyerId || !sellerId || !itemId) {
        return null;
    }
    return {
        version: 1,
        id,
        buyerId,
        sellerId,
        itemId,
        quantity: Math.max(1, Math.trunc(Number(candidate.quantity) || 1)),
        unitPrice: Math.max(1, Number(candidate.unitPrice) || 1),
        createdAt: normalizeEpochMs(candidate.createdAt || Date.now()),
    };
}

function normalizeMarketStorageRecord(raw) {
    const candidate = asRecord(raw);
    const playerId = readString(candidate.playerId);
    const marketStorage = asRecord(candidate.marketStorage);
    if (!playerId) {
        return null;
    }
    return {
        playerId,
        storage: {
            items: Array.isArray(marketStorage.items)
                ? marketStorage.items
                    .map((entry) => {
                    const item = asRecord(entry);
                    const itemId = readString(item.itemId);
                    if (!itemId) {
                        return null;
                    }
                    return {
                        ...item,
                        itemId,
                        count: Math.max(1, Math.trunc(Number(item.count) || 1)),
                    };
                })
                    .filter(Boolean)
                : [],
        },
    };
}

function normalizeMailCampaign(raw) {
    const candidate = asRecord(raw);
    const mailId = readString(candidate.id);
    const senderLabel = readString(candidate.senderLabel || '司命台') || '司命台';
    if (!mailId || !senderLabel) {
        return null;
    }
    return {
        mailId,
        scope: readString(candidate.scope) === 'global' ? 'global' : 'direct',
        templateId: readNullableString(candidate.templateId),
        args: Array.isArray(candidate.args) ? candidate.args.map((entry) => ({ ...asRecord(entry) })) : [],
        fallbackTitle: readNullableString(candidate.fallbackTitle),
        fallbackBody: readNullableString(candidate.fallbackBody),
        senderLabel,
        attachments: normalizeRewardList(candidate.attachments),
        createdAt: normalizeEpochMs(candidate.createdAt || Date.now()),
        updatedAt: normalizeEpochMs(candidate.updatedAt || candidate.createdAt || Date.now()),
        expireAt: normalizeNullableEpochMs(candidate.expireAt),
    };
}

function normalizeRedeemCodeRecord(raw) {
    const candidate = asRecord(raw);
    const id = readString(candidate.id);
    const groupId = readString(candidate.groupId);
    const code = readString(candidate.code).toUpperCase();
    if (!id || !groupId || !code) {
        return null;
    }
    const status = readString(candidate.status);
    return {
        id,
        groupId,
        code,
        status: status === 'used' || status === 'destroyed' ? status : 'active',
        usedByPlayerId: readNullableString(candidate.usedByPlayerId),
        usedByRoleName: readNullableString(candidate.usedByRoleName),
        usedAt: normalizeNullableTimestamp(candidate.usedAt),
        destroyedAt: normalizeNullableTimestamp(candidate.destroyedAt),
        createdAt: normalizeTimestamp(candidate.createdAt) || new Date(0).toISOString(),
        updatedAt: normalizeTimestamp(candidate.updatedAt) || new Date(0).toISOString(),
    };
}

function normalizeGmAuthRecord(raw) {
    const candidate = asRecord(raw);
    const updatedAt = normalizeTimestamp(candidate.updatedAt) || new Date().toISOString();
    const salt = readString(candidate.salt);
    const hash = readString(candidate.hash);
    const legacyPasswordHash = readString(candidate.passwordHash);
    if (salt && hash) {
        return {
            salt,
            hash,
            updatedAt,
        };
    }
    if (legacyPasswordHash) {
        return {
            salt: '__legacy_bcrypt__',
            hash: legacyPasswordHash,
            updatedAt,
        };
    }
    return null;
}

function normalizeDatabaseBackupMetadataRecord(row) {
    const payload = asRecord(row?.payload);
    const id = readString(payload.id || row?.key);
    const fileName = readString(payload.fileName);
    const createdAt = normalizeTimestamp(payload.createdAt);
    const sizeBytes = normalizeNullableInteger(payload.sizeBytes);
    const kind = normalizeDatabaseJobKind(payload.kind);
    if (!id || !fileName || !createdAt || sizeBytes === null || !kind) {
        return null;
    }
    const documentsCount = normalizeNullableInteger(payload.documentsCount);
    const checksumSha256 = readNullableString(payload.checksumSha256);
    const filePath = readNullableString(payload.filePath);
    return {
        id,
        kind,
        fileName,
        createdAt,
        sizeBytes,
        scope: BACKUP_SCOPE_LABEL,
        documentsCount,
        checksumSha256,
        ...(filePath ? { filePath } : {}),
    };
}

function normalizeDatabaseJobStateRecord(raw) {
    const payload = asRecord(raw);
    const currentJob = normalizeDatabaseJobRecord(payload.currentJob);
    const lastJob = normalizeDatabaseJobRecord(payload.lastJob);
    if (!currentJob && !lastJob) {
        return null;
    }
    return {
        currentJob,
        lastJob,
    };
}

function normalizeDatabaseJobRecord(raw) {
    const payload = asRecord(raw);
    const id = readString(payload.id);
    const type = payload.type === 'backup' || payload.type === 'restore' ? payload.type : null;
    const status = payload.status === 'running' || payload.status === 'completed' || payload.status === 'failed'
        ? payload.status
        : null;
    const startedAt = normalizeTimestamp(payload.startedAt);
    if (!id || !type || !status || !startedAt) {
        return null;
    }
    const normalized = {
        id,
        type,
        status,
        startedAt,
    };
    const finishedAt = normalizeNullableTimestamp(payload.finishedAt);
    const kind = normalizeDatabaseJobKind(payload.kind);
    const backupId = readNullableString(payload.backupId);
    const sourceBackupId = readNullableString(payload.sourceBackupId);
    const checkpointBackupId = readNullableString(payload.checkpointBackupId);
    const appliedAt = normalizeNullableTimestamp(payload.appliedAt);
    const phase = readNullableString(payload.phase);
    const error = readNullableString(payload.error);
    if (finishedAt) {
        normalized.finishedAt = finishedAt;
    }
    if (kind) {
        normalized.kind = kind;
    }
    if (backupId) {
        normalized.backupId = backupId;
    }
    if (sourceBackupId) {
        normalized.sourceBackupId = sourceBackupId;
    }
    if (checkpointBackupId) {
        normalized.checkpointBackupId = checkpointBackupId;
    }
    if (appliedAt) {
        normalized.appliedAt = appliedAt;
    }
    if (phase) {
        normalized.phase = phase;
    }
    if (error) {
        normalized.error = error;
    }
    return normalized;
}

function normalizeDatabaseJobKind(value) {
    const kind = readString(value);
    return kind === 'hourly' || kind === 'daily' || kind === 'manual' || kind === 'pre_import'
        ? kind
        : null;
}

function normalizeMarketOrderStatus(value) {
    const status = readString(value);
    if (status === 'filled' || status === 'cancelled') {
        return status;
    }
    return 'open';
}

function resolveMailRecipientIds(campaign, audienceByMailId, playerIds, playerCreatedAtById) {
    if (campaign.scope === 'direct') {
        return Array.from(new Set((audienceByMailId.get(campaign.mailId) ?? []).filter(Boolean)));
    }
    const recipients = [];
    for (const playerId of playerIds) {
        const createdAt = playerCreatedAtById.get(playerId) ?? null;
        if (campaign.templateId || createdAt === null || Date.parse(createdAt) <= campaign.createdAt) {
            recipients.push(playerId);
        }
    }
    return recipients;
}

function buildMailboxMailEntry(campaign, receipt) {
    return {
        version: 1,
        mailId: campaign.mailId,
        senderLabel: campaign.senderLabel,
        templateId: campaign.templateId,
        args: campaign.args.map((entry) => ({ ...entry })),
        fallbackTitle: campaign.fallbackTitle,
        fallbackBody: campaign.fallbackBody,
        attachments: campaign.attachments.map((entry) => ({ ...entry })),
        createdAt: campaign.createdAt,
        updatedAt: normalizeEpochMs(receipt?.updatedAt || campaign.updatedAt),
        expireAt: normalizeNullableEpochMs(campaign.expireAt),
        firstSeenAt: normalizeNullableInteger(receipt?.firstSeenAt),
        readAt: normalizeNullableInteger(receipt?.readAt),
        claimedAt: normalizeNullableInteger(receipt?.claimedAt),
        deletedAt: normalizeNullableInteger(receipt?.deletedAt),
    };
}

function normalizeRewardList(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((entry) => {
        const candidate = asRecord(entry);
        const itemId = readString(candidate.itemId);
        if (!itemId) {
            return null;
        }
        return {
            itemId,
            count: Math.max(1, Math.trunc(Number(candidate.count) || 1)),
        };
    })
        .filter(Boolean);
}

function normalizeSuggestionReplies(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((entry) => {
        const candidate = asRecord(entry);
        const id = readString(candidate.id);
        const authorType = readString(candidate.authorType) === 'gm' ? 'gm' : 'author';
        const authorId = readString(candidate.authorId);
        const authorName = readString(candidate.authorName || authorId);
        const content = readString(candidate.content);
        if (!id || !authorId || !authorName || !content) {
            return null;
        }
        return {
            id,
            authorType,
            authorId,
            authorName,
            content,
            createdAt: normalizeInteger(candidate.createdAt || Date.now()),
        };
    })
        .filter(Boolean);
}

function normalizeSuggestionStatus(value) {
    return readString(value) === 'completed' ? 'completed' : 'pending';
}

function normalizeStringList(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((entry) => readString(entry))
        .filter(Boolean);
}

async function upsertSuggestionDocument(client, document) {
    await client.query(`
      INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
      VALUES ($1, $2, $3::jsonb, now())
      ON CONFLICT (scope, key)
      DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
    `, [SUGGESTION_SCOPE, SUGGESTION_KEY, JSON.stringify(document)]);
}

async function upsertRedeemDocument(client, document) {
    await client.query(`
      INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
      VALUES ($1, $2, $3::jsonb, now())
      ON CONFLICT (scope, key)
      DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
    `, [REDEEM_CODE_SCOPE, REDEEM_CODE_KEY, JSON.stringify(document)]);
}

async function upsertGmAuthRecord(client, record) {
    await upsertPersistentDocument(client, GM_AUTH_SCOPE, GM_AUTH_KEY, record);
}

async function upsertMailboxDocument(client, playerId, mails) {
    const payload = {
        version: 1,
        revision: Math.max(1, mails.length),
        mails: [...mails].sort((left, right) => right.createdAt - left.createdAt || left.mailId.localeCompare(right.mailId)),
    };
    await upsertPersistentDocument(client, MAILBOX_SCOPE, playerId, payload);
}

async function upsertMarketOrder(client, order) {
    await upsertPersistentDocument(client, MARKET_ORDER_SCOPE, order.id, order);
}

async function upsertMarketTrade(client, trade) {
    await upsertPersistentDocument(client, MARKET_TRADE_SCOPE, trade.id, trade);
}

async function upsertMarketStorage(client, entry) {
    await upsertPersistentDocument(client, MARKET_STORAGE_SCOPE, entry.playerId, entry.storage);
}

async function upsertPersistentDocument(client, scope, key, payload) {
    await client.query(`
      INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
      VALUES ($1, $2, $3::jsonb, now())
      ON CONFLICT (scope, key)
      DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
    `, [scope, key, JSON.stringify(payload)]);
}

function getFixtureScopeRows(fixture, scope) {
    const persistentDocuments = asRecord(fixture?.persistentDocuments);
    const rows = persistentDocuments?.[scope];
    return Array.isArray(rows)
        ? rows.map((entry) => ({
            key: readString(entry?.key),
            payload: entry?.payload ?? null,
        }))
        : [];
}

function getFixturePersistentPayload(fixture, scope, key) {
    const rows = getFixtureScopeRows(fixture, scope);
    const match = rows.find((entry) => entry.key === key);
    return match?.payload ?? null;
}

function getFixtureTableRows(fixture, tableName) {
    const tables = asRecord(fixture?.tables);
    const rows = tables?.[tableName];
    return Array.isArray(rows) ? rows : [];
}

async function hasTable(client, tableName) {
    const result = await client.query(`SELECT to_regclass($1) AS relation_name`, [`public.${tableName}`]);
    return Boolean(result.rows[0]?.relation_name);
}

function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function readString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function readNullableString(value) {
    const normalized = readString(value);
    return normalized || null;
}

function normalizeInteger(value) {
    return Math.max(0, Math.trunc(Number(value) || 0));
}

function normalizeNullableInteger(value) {
    return Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : null;
}

function normalizeEpochMs(value) {
    const normalized = normalizeTimestamp(value);
    if (normalized) {
        return Date.parse(normalized);
    }
    return normalizeInteger(value);
}

function normalizeNullableEpochMs(value) {
    const normalized = normalizeTimestamp(value);
    if (normalized) {
        return Date.parse(normalized);
    }
    return normalizeNullableInteger(value);
}

function normalizeTimestamp(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString();
    }
    if (typeof value === 'string' && value.trim()) {
        const timestamp = Date.parse(value);
        if (!Number.isNaN(timestamp)) {
            return new Date(timestamp).toISOString();
        }
    }
    if (Number.isFinite(Number(value))) {
        const timestamp = Number(value);
        return new Date(timestamp > 1e12 ? timestamp : timestamp * 1000).toISOString();
    }
    return '';
}

function normalizeNullableTimestamp(value) {
    const normalized = normalizeTimestamp(value);
    return normalized || null;
}

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exit(1);
});

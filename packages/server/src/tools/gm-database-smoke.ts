// @ts-nocheck

/**
 * 用途：执行 gm-database 链路的冒烟验证。
 */

Object.defineProperty(exports, "__esModule", { value: true });
const smoke_timeout_1 = require("./smoke-timeout");
(0, smoke_timeout_1.installSmokeTimeout)(__filename);
const node_child_process_1 = require("node:child_process");
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_net_1 = require("node:net");
const node_path_1 = require("node:path");
const socket_io_client_1 = require("socket.io-client");
const shared_next_1 = require("@mud/shared");
const pg_1 = require("pg");
const env_alias_1 = require("../config/env-alias");
const next_gm_contract_1 = require("../http/native/native-gm-contract");
const smoke_player_auth_1 = require("./smoke-player-auth");
const smoke_player_cleanup_1 = require("./smoke-player-cleanup");
const stable_dist_1 = require("./stable-dist");
/**
 * 记录包根目录。
 */
const packageRoot = (0, stable_dist_1.resolveToolPackageRoot)(__dirname);
/**
 * 记录持有的稳定 dist 快照。
 */
const ownedDistSnapshot = (() => {
    const explicitDistRoot = typeof process.env.SERVER_TOOL_DIST_ROOT === 'string'
        ? process.env.SERVER_TOOL_DIST_ROOT.trim()
        : '';
    if (explicitDistRoot) {
        return null;
    }
    return (0, stable_dist_1.createStableDistSnapshot)({
        label: 'gm-database-smoke',
        packageRoot,
    });
})();
/**
 * 记录dist根目录。
 */
const distRoot = ownedDistSnapshot?.distRoot ?? (0, stable_dist_1.resolveToolDistRoot)(__dirname, packageRoot);
/**
 * 记录仓库根目录。
 */
const repoRoot = (0, node_path_1.resolve)(packageRoot, '..', '..');
/**
 * 记录服务端入口文件路径。
 */
const serverEntry = (0, node_path_1.join)(distRoot, 'main.js');
/**
 * 记录数据库地址。
 */
const databaseUrl = (0, env_alias_1.resolveServerDatabaseUrl)();
/**
 * 记录GMpassword。
 */
const gmPassword = (0, env_alias_1.resolveServerGmPassword)('admin123');
const GM_DATABASE_SMOKE_CONTRACT = Object.freeze({
    answers: '本地维护窗口下的 GM database destructive 链：backup、校验、restore、checkpoint backup、并发拒绝与维护态 socket 拒绝',
    excludes: '真实 shadow 目标机、运营审批链、跨环境灾备取证与人工维护记录',
    completionMapping: 'replace-ready:proof:with-db.gm-database-destructive-local',
});

const GM_DATABASE_JOB_SETTLE_TIMEOUT_MS = 120_000;

const GM_DATABASE_RESTORE_SETTLE_TIMEOUT_MS = 720_000;

const GM_DATABASE_JOB_STATE_SCOPE = 'server_db_jobs_v1';

const GM_DATABASE_JOB_STATE_KEY = 'gm_database';

const POSTGRES_DUMP_MAGIC = Buffer.from('PGDMP');

const backupFileSnapshots = new Map();
/**
 * 记录changedGMpassword。
 */
const changedGmPassword = `gm-smoke-${Date.now().toString(36)}-changed`;
/**
 * 记录备份directory。
 */
const backupDirectory = (0, node_path_1.join)(packageRoot, '.runtime', `gm-database-smoke-${Date.now().toString(36)}`);
/**
 * 记录玩家suffix。
 */
const playerSuffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/**
 * 记录account名称。
 */
const accountName = `gdb_${playerSuffix.slice(-10)}`;
/**
 * 记录玩家password。
 */
const playerPassword = `Pass_${playerSuffix}`;
/**
 * 记录备份前结构化炼体状态。
 */
const BASELINE_BODY_TRAINING_STATE = Object.freeze({
    level: 3,
    exp: 9,
    expToNext: 27,
});
/**
 * 记录备份前结构化生命状态。
 */
const BASELINE_VITALS_STATE = Object.freeze({
    hp: 61,
    maxHp: 88,
    qi: 17,
    maxQi: 35,
});
/**
 * 记录备份后结构化生命状态。
 */
const POST_BACKUP_VITALS_STATE = Object.freeze({
    hp: 23,
    maxHp: 104,
    qi: 4,
    maxQi: 46,
});
/**
 * 记录备份前结构化进度核心状态。
 */
const BASELINE_PROGRESSION_CORE_STATE = Object.freeze({
    foundation: 12,
    combatExp: 41,
    boneAgeBaseYears: 19,
    lifeElapsedTicks: 1234,
    lifespanYears: 81,
});
/**
 * 记录备份后结构化进度核心状态。
 */
const POST_BACKUP_PROGRESSION_CORE_STATE = Object.freeze({
    foundation: 4,
    combatExp: 99,
    boneAgeBaseYears: 22,
    lifeElapsedTicks: 5678,
    lifespanYears: 95,
});
/**
 * 记录备份后结构化炼体状态。
 */
const POST_BACKUP_BODY_TRAINING_STATE = Object.freeze({
    level: 8,
    exp: 64,
    expToNext: 125,
});
/**
 * 记录备份前结构化属性状态。
 */
const BASELINE_ATTR_STATE = Object.freeze({
    baseAttrs: {
        constitution: 13,
        spirit: 9,
        perception: 8,
        talent: 7,
        comprehension: 6,
        luck: 5,
    },
    bonusEntries: [
        {
            source: 'runtime:gm-database-smoke',
            label: '备份前校验',
            attrs: { constitution: 2 },
            stats: { attack: 3 },
        },
    ],
    revealedBreakthroughRequirementIds: ['realm.req.technique', 'realm.req.item'],
    realm: {
        stage: 'qi_refining',
        realmLv: 2,
        progress: 18,
        breakthrough: {
            requirements: [{ id: 'realm.req.technique', hidden: false, completed: true }],
        },
    },
    heavenGate: {
        unlocked: true,
        averageBonus: 12,
        severed: ['metal'],
    },
    spiritualRoots: {
        metal: 18,
        wood: 12,
        water: 9,
        fire: 7,
        earth: 5,
    },
});
/**
 * 记录备份后结构化属性状态。
 */
const POST_BACKUP_ATTR_STATE = Object.freeze({
    baseAttrs: {
        constitution: 21,
        spirit: 15,
        perception: 11,
        talent: 10,
        comprehension: 9,
        luck: 8,
    },
    bonusEntries: [
        {
            source: 'runtime:gm-database-smoke:mutated',
            label: '备份后篡改',
            attrs: { constitution: 5 },
            stats: { attack: 9 },
        },
    ],
    revealedBreakthroughRequirementIds: ['realm.req.mutated'],
    realm: {
        stage: 'foundation',
        realmLv: 1,
        progress: 2,
        breakthrough: {
            requirements: [{ id: 'realm.req.mutated', hidden: false, completed: false }],
        },
    },
    heavenGate: {
        unlocked: false,
        averageBonus: 1,
        severed: ['wood'],
    },
    spiritualRoots: {
        metal: 1,
        wood: 2,
        water: 3,
        fire: 4,
        earth: 5,
    },
});
/**
 * 记录备份前结构化持续 buff 状态。
 */
const BASELINE_PERSISTENT_BUFF_STATES = Object.freeze([
    {
        buffId: 'buff.qi_shield',
        sourceSkillId: 'skill.qi.shield',
        sourceCasterId: 'npc.master',
        realmLv: 2,
        remainingTicks: 15,
        duration: 30,
        stacks: 1,
        maxStacks: 3,
        sustainTicksElapsed: 4,
        rawPayload: {
            buffId: 'buff.qi_shield',
            sourceSkillId: 'skill.qi.shield',
            remainingTicks: 15,
            duration: 30,
            stacks: 1,
            maxStacks: 3,
            sustainTicksElapsed: 4,
            name: '气盾',
        },
    },
]);
/**
 * 记录备份后结构化持续 buff 状态。
 */
const POST_BACKUP_PERSISTENT_BUFF_STATES = Object.freeze([
    {
        buffId: 'buff.flame_armor',
        sourceSkillId: 'skill.fire.armor',
        sourceCasterId: 'npc.elder',
        realmLv: 4,
        remainingTicks: 6,
        duration: 12,
        stacks: 2,
        maxStacks: 2,
        sustainTicksElapsed: 7,
        rawPayload: {
            buffId: 'buff.flame_armor',
            sourceSkillId: 'skill.fire.armor',
            remainingTicks: 6,
            duration: 12,
            stacks: 2,
            maxStacks: 2,
            sustainTicksElapsed: 7,
            name: '炎甲',
        },
    },
]);
/**
 * 记录备份前结构化强化记录。
 */
const BASELINE_ENHANCEMENT_RECORDS = Object.freeze([
    {
        recordId: `gm-backup:baseline:${playerSuffix}:iron_sword`,
        itemId: 'iron_sword',
        highestLevel: 4,
        levels: [{ targetLevel: 3, successCount: 2, failureCount: 1 }],
        actionStartedAt: 1_720_000_000_000,
        actionEndedAt: 1_720_000_030_000,
        startLevel: 2,
        initialTargetLevel: 3,
        desiredTargetLevel: 4,
        protectionStartLevel: 2,
        status: 'completed',
    },
]);
/**
 * 记录备份后结构化强化记录。
 */
const POST_BACKUP_ENHANCEMENT_RECORDS = Object.freeze([
    {
        recordId: `gm-backup:mutated:${playerSuffix}:bronze_blade`,
        itemId: 'bronze_blade',
        highestLevel: 1,
        levels: [{ targetLevel: 1, successCount: 1, failureCount: 0 }],
        actionStartedAt: 1_720_100_000_000,
        actionEndedAt: 1_720_100_010_000,
        startLevel: 0,
        initialTargetLevel: 1,
        desiredTargetLevel: 1,
        protectionStartLevel: 0,
        status: 'completed',
    },
]);
/**
 * 记录备份前结构化市场仓物品。
 */
const BASELINE_MARKET_STORAGE_ITEMS = Object.freeze([
    {
        itemId: 'rat_tail',
        count: 3,
        name: '鼠尾',
    },
    {
        itemId: 'iron_sword',
        count: 1,
        name: '铁剑',
        enhanceLevel: 2,
        equipSlot: 'weapon',
    },
]);
/**
 * 记录备份后结构化市场仓物品。
 */
const POST_BACKUP_MARKET_STORAGE_ITEMS = Object.freeze([
    {
        itemId: 'wolf_fang',
        count: 5,
        name: '狼牙',
    },
]);
/**
 * 记录role名称。
 */
const roleName = `归档${playerSuffix.slice(-4)}`;
/**
 * 记录显示信息名称seed。
 */
const displayNameSeed = Number.parseInt(playerSuffix.slice(-6), 36) || Date.now();
/**
 * 记录当前值端口。
 */
let currentPort = Number(process.env.SERVER_SMOKE_PORT ?? 3212);
/**
 * 记录base地址。
 */
let baseUrl = `http://127.0.0.1:${currentPort}`;
/**
 * 处理seedstructuredplayerpresence。
 */
async function seedStructuredPlayerPresence(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const client = new pg_1.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        await client.query(`
      INSERT INTO player_presence(
        player_id,
        online,
        in_world,
        last_heartbeat_at,
        runtime_owner_id,
        session_epoch,
        transfer_state,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        online = EXCLUDED.online,
        in_world = EXCLUDED.in_world,
        last_heartbeat_at = EXCLUDED.last_heartbeat_at,
        runtime_owner_id = EXCLUDED.runtime_owner_id,
        session_epoch = EXCLUDED.session_epoch,
        transfer_state = EXCLUDED.transfer_state,
        updated_at = now()
    `, [playerId, true, true, Date.now(), `gm-restore:${playerId}`, 1, 'idle']);
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
/**
 * 处理upsertstructuredplayerbodytrainingstate。
 */
async function upsertStructuredPlayerBodyTrainingState(playerId, state) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const client = new pg_1.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        await client.query(`
      INSERT INTO player_body_training_state(
        player_id,
        level,
        exp,
        exp_to_next,
        updated_at
      )
      VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        level = EXCLUDED.level,
        exp = EXCLUDED.exp,
        exp_to_next = EXCLUDED.exp_to_next,
        updated_at = now()
    `, [
            playerId,
            Number(state?.level ?? 0),
            Number(state?.exp ?? 0),
            Number(state?.expToNext ?? 0),
        ]);
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
/**
 * 处理upsertstructuredplayervitals。
 */
async function upsertStructuredPlayerVitals(playerId, state) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const client = new pg_1.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        await client.query(`
      INSERT INTO player_vitals(
        player_id,
        hp,
        max_hp,
        qi,
        max_qi,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        hp = EXCLUDED.hp,
        max_hp = EXCLUDED.max_hp,
        qi = EXCLUDED.qi,
        max_qi = EXCLUDED.max_qi,
        updated_at = now()
    `, [
            playerId,
            Number(state?.hp ?? 0),
            Number(state?.maxHp ?? 0),
            Number(state?.qi ?? 0),
            Number(state?.maxQi ?? 0),
        ]);
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
/**
 * 处理upsertstructuredplayerprogressioncore。
 */
async function upsertStructuredPlayerProgressionCore(playerId, state) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const client = new pg_1.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        await client.query(`
      INSERT INTO player_progression_core(
        player_id,
        foundation,
        combat_exp,
        bone_age_base_years,
        life_elapsed_ticks,
        lifespan_years,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        foundation = EXCLUDED.foundation,
        combat_exp = EXCLUDED.combat_exp,
        bone_age_base_years = EXCLUDED.bone_age_base_years,
        life_elapsed_ticks = EXCLUDED.life_elapsed_ticks,
        lifespan_years = EXCLUDED.lifespan_years,
        updated_at = now()
    `, [
            playerId,
            Number(state?.foundation ?? 0),
            Number(state?.combatExp ?? 0),
            Number(state?.boneAgeBaseYears ?? 0),
            Number(state?.lifeElapsedTicks ?? 0),
            Number(state?.lifespanYears ?? 0),
        ]);
    }
    finally {
        await client.end().catch(() => undefined);
    }
}

async function upsertStructuredPlayerAttrState(playerId, state) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const client = new pg_1.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        await client.query(`
      INSERT INTO player_attr_state(
        player_id,
        base_attrs_payload,
        bonus_entries_payload,
        revealed_breakthrough_requirement_ids,
        realm_payload,
        heaven_gate_payload,
        spiritual_roots_payload,
        updated_at
      )
      VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        base_attrs_payload = EXCLUDED.base_attrs_payload,
        bonus_entries_payload = EXCLUDED.bonus_entries_payload,
        revealed_breakthrough_requirement_ids = EXCLUDED.revealed_breakthrough_requirement_ids,
        realm_payload = EXCLUDED.realm_payload,
        heaven_gate_payload = EXCLUDED.heaven_gate_payload,
        spiritual_roots_payload = EXCLUDED.spiritual_roots_payload,
        updated_at = now()
    `, [
            playerId,
            JSON.stringify(state?.baseAttrs ?? null),
            JSON.stringify(Array.isArray(state?.bonusEntries) ? state.bonusEntries : []),
            JSON.stringify(Array.isArray(state?.revealedBreakthroughRequirementIds) ? state.revealedBreakthroughRequirementIds : []),
            JSON.stringify(state?.realm ?? null),
            JSON.stringify(state?.heavenGate ?? null),
            JSON.stringify(state?.spiritualRoots ?? null),
        ]);
    }
    finally {
        await client.end().catch(() => undefined);
    }
}

async function replaceStructuredPlayerPersistentBuffStates(playerId, states) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const client = new pg_1.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM player_persistent_buff_state WHERE player_id = $1', [playerId]);
        for (const entry of Array.isArray(states) ? states : []) {
            await client.query(`
        INSERT INTO player_persistent_buff_state(
          player_id,
          buff_id,
          source_skill_id,
          source_caster_id,
          realm_lv,
          remaining_ticks,
          duration,
          stacks,
          max_stacks,
          sustain_ticks_elapsed,
          raw_payload,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, now())
      `, [
                playerId,
                String(entry?.buffId ?? ''),
                String(entry?.sourceSkillId ?? ''),
                entry?.sourceCasterId ?? null,
                Number(entry?.realmLv ?? 0),
                Number(entry?.remainingTicks ?? 0),
                Number(entry?.duration ?? 0),
                Number(entry?.stacks ?? 1),
                Number(entry?.maxStacks ?? 1),
                entry?.sustainTicksElapsed == null ? null : Number(entry.sustainTicksElapsed),
                JSON.stringify(entry?.rawPayload ?? entry ?? {}),
            ]);
        }
        await client.query('COMMIT');
    }
    catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    }
    finally {
        await client.end().catch(() => undefined);
    }
}

async function replaceStructuredPlayerEnhancementRecords(playerId, records) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const client = new pg_1.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM player_enhancement_record WHERE player_id = $1', [playerId]);
        for (const entry of Array.isArray(records) ? records : []) {
            await client.query(`
        INSERT INTO player_enhancement_record(
          record_id,
          player_id,
          item_id,
          highest_level,
          levels_payload,
          action_started_at,
          action_ended_at,
          start_level,
          initial_target_level,
          desired_target_level,
          protection_start_level,
          status,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, now())
      `, [
                String(entry?.recordId ?? ''),
                playerId,
                String(entry?.itemId ?? ''),
                Number(entry?.highestLevel ?? 0),
                JSON.stringify(Array.isArray(entry?.levels) ? entry.levels : []),
                Number(entry?.actionStartedAt ?? 0),
                Number(entry?.actionEndedAt ?? 0),
                Number(entry?.startLevel ?? 0),
                Number(entry?.initialTargetLevel ?? 0),
                Number(entry?.desiredTargetLevel ?? 0),
                Number(entry?.protectionStartLevel ?? 0),
                String(entry?.status ?? ''),
            ]);
        }
        await client.query('COMMIT');
    }
    catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    }
    finally {
        await client.end().catch(() => undefined);
    }
}

async function replaceStructuredPlayerMarketStorageItems(playerId, items) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const client = new pg_1.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM player_market_storage_item WHERE player_id = $1', [playerId]);
        for (let slotIndex = 0; slotIndex < (Array.isArray(items) ? items : []).length; slotIndex += 1) {
            const entry = items[slotIndex];
            await client.query(`
        INSERT INTO player_market_storage_item(
          storage_item_id,
          player_id,
          slot_index,
          item_id,
          count,
          enhance_level,
          raw_payload,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, now())
      `, [
                `gm-market-storage:${playerId}:${slotIndex}`,
                playerId,
                slotIndex,
                String(entry?.itemId ?? ''),
                Number(entry?.count ?? 1),
                normalizeOptionalInteger(entry?.enhanceLevel ?? entry?.enhancementLevel ?? entry?.level),
                JSON.stringify(entry ?? {}),
            ]);
        }
        await client.query('COMMIT');
    }
    catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
/**
 * 串联执行脚本主流程。
 */
async function main() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!databaseUrl.trim()) {
        console.log(JSON.stringify({
            ok: true,
            skipped: true,
            reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
            answers: GM_DATABASE_SMOKE_CONTRACT.answers,
            excludes: GM_DATABASE_SMOKE_CONTRACT.excludes,
            completionMapping: GM_DATABASE_SMOKE_CONTRACT.completionMapping,
        }, null, 2));
        return;
    }
    await resetGmAuthPasswordRecord();
    await node_fs_1.promises.mkdir(backupDirectory, { recursive: true });
/**
 * 记录original备份ID。
 */
    let originalBackupId = '';
/**
 * 记录checkpoint备份ID。
 */
    let checkpointBackupId = '';
/**
 * 记录玩家ID。
 */
    let playerId = '';
/**
 * 记录post备份suggestionID。
 */
    let postBackupSuggestionId = '';
/**
 * 记录pre备份mailID。
 */
    let preBackupMailId = '';
/**
 * 记录post备份mailID。
 */
    let postBackupMailId = '';
/**
 * 记录mail汇总baseline。
 */
    let mailSummaryBaseline = null;
/**
 * 记录备份内 GM 认证文档。
 */
    let backupGmAuthPayload = null;
/**
 * 记录原始备份record。
 */
    let originalBackupRecord = null;
/**
 * 记录mailpagetotalbaseline。
 */
    let mailPageTotalBaseline = 0;
/**
 * 记录interrupted恢复jobID。
 */
    let interruptedRestoreJobId = '';
/**
 * 记录interrupted恢复observedphase。
 */
    let interruptedRestoreObservedPhase = '';
/**
 * 记录interrupted恢复checkpoint备份ID。
 */
    let interruptedRestoreCheckpointBackupId = '';
/**
 * 记录interrupted恢复lastjob。
 */
    let interruptedRestoreLastJob = null;
/**
 * 记录服务端。
 */
    let server = await startServer({ maintenance: false });
    try {
        await waitForHealth({ expectedStatus: 200, expectMaintenance: false });
/**
 * 记录令牌。
 */
        const token = await login(gmPassword);
/**
 * 记录玩家认证。
 */
        const playerAuth = await registerAndLoginPlayer();
        playerId = playerAuth.playerId;
        await seedStructuredPlayerPresence(playerId);
        await upsertStructuredPlayerVitals(playerId, BASELINE_VITALS_STATE);
        await upsertStructuredPlayerProgressionCore(playerId, BASELINE_PROGRESSION_CORE_STATE);
        await upsertStructuredPlayerBodyTrainingState(playerId, BASELINE_BODY_TRAINING_STATE);
        await upsertStructuredPlayerAttrState(playerId, BASELINE_ATTR_STATE);
        await replaceStructuredPlayerPersistentBuffStates(playerId, BASELINE_PERSISTENT_BUFF_STATES);
        await replaceStructuredPlayerEnhancementRecords(playerId, BASELINE_ENHANCEMENT_RECORDS);
        await replaceStructuredPlayerMarketStorageItems(playerId, BASELINE_MARKET_STORAGE_ITEMS);
        const initialMailPage = await fetchMailPage(playerId);
        const initialMailSummary = await fetchMailSummary(playerId);
        if (!initialMailSummary || !initialMailPage) {
            throw new Error(`expected initial mail state before baseline direct mail, got ${JSON.stringify({
                summary: initialMailSummary,
                page: initialMailPage,
            })}`);
        }
        preBackupMailId = await createDirectMail(token, playerId, {
            fallbackTitle: `baseline-mail-${playerSuffix.slice(-6)}`,
            fallbackBody: `baseline mail ${playerSuffix}`,
            attachments: [{ itemId: 'pill.minor_heal', count: 1 }],
        });
        await waitForMailSummary(playerId, (summary) => {
            return Number(summary?.unreadCount ?? 0) === Number(initialMailSummary.unreadCount ?? 0) + 1
                && Number(summary?.claimableCount ?? 0) === Number(initialMailSummary.claimableCount ?? 0) + 1
                && Number(summary?.revision ?? 0) === Number(initialMailSummary.revision ?? 0) + 1;
        }, 10000);
        await waitForMailPresent(playerId, preBackupMailId, Number(initialMailPage.total ?? 0) + 1);
        await waitForStructuredMailPresent(preBackupMailId);
/**
 * 记录备份结果。
 */
        logStage('backup:start');
        const backupResult = await triggerBackupWithConcurrentRejection(token);
        originalBackupId = String(backupResult?.job?.backupId ?? '').trim();
        if (!originalBackupId) {
            throw new Error(`missing backupId from backup result: ${JSON.stringify(backupResult)}`);
        }
/**
 * 记录备份状态。
 */
        const backupState = await waitForJobSettled(token, String(backupResult?.job?.id ?? ''), 'backup');
        logStage('backup:completed', {
            backupId: originalBackupId,
            jobId: String(backupResult?.job?.id ?? ''),
        });
        originalBackupRecord = requireBackupRecord(backupState, originalBackupId, 'manual backup');
        await assertBackupDownload(token, originalBackupId, originalBackupRecord);
        backupGmAuthPayload = await readGmAuthPasswordRecordPayload();
        if (!backupGmAuthPayload) {
            throw new Error('expected GM auth password record to exist before backup mutation');
        }
        await upsertStructuredPlayerVitals(playerId, POST_BACKUP_VITALS_STATE);
        await assertStructuredPlayerVitals(playerId, POST_BACKUP_VITALS_STATE);
        await upsertStructuredPlayerProgressionCore(playerId, POST_BACKUP_PROGRESSION_CORE_STATE);
        await assertStructuredPlayerProgressionCore(playerId, POST_BACKUP_PROGRESSION_CORE_STATE);
        await upsertStructuredPlayerBodyTrainingState(playerId, POST_BACKUP_BODY_TRAINING_STATE);
        await assertStructuredPlayerBodyTrainingState(playerId, POST_BACKUP_BODY_TRAINING_STATE);
        await upsertStructuredPlayerAttrState(playerId, POST_BACKUP_ATTR_STATE);
        await assertStructuredPlayerAttrState(playerId, POST_BACKUP_ATTR_STATE);
        await replaceStructuredPlayerPersistentBuffStates(playerId, POST_BACKUP_PERSISTENT_BUFF_STATES);
        await assertStructuredPlayerPersistentBuffStates(playerId, POST_BACKUP_PERSISTENT_BUFF_STATES);
        await replaceStructuredPlayerEnhancementRecords(playerId, POST_BACKUP_ENHANCEMENT_RECORDS);
        await assertStructuredPlayerEnhancementRecords(playerId, POST_BACKUP_ENHANCEMENT_RECORDS);
        await replaceStructuredPlayerMarketStorageItems(playerId, POST_BACKUP_MARKET_STORAGE_ITEMS);
        await assertStructuredPlayerMarketStorageItems(playerId, POST_BACKUP_MARKET_STORAGE_ITEMS);
        postBackupSuggestionId = await createSuggestion(playerId, {
            title: `restore-suggestion-${playerSuffix.slice(-6)}`,
            description: `post-backup suggestion ${playerSuffix}`,
        });
        await waitForSuggestionPresent(token, postBackupSuggestionId);
/**
 * 记录mailpagebaseline。
 */
        const mailPageBaseline = await fetchMailPage(playerId);
        mailSummaryBaseline = await fetchMailSummary(playerId);
        if (!mailSummaryBaseline || !mailPageBaseline) {
            throw new Error(`expected mail baseline before direct mail, got ${JSON.stringify({
                summary: mailSummaryBaseline,
                page: mailPageBaseline,
            })}`);
        }
        mailPageTotalBaseline = Number(mailPageBaseline.total ?? 0);
        postBackupMailId = await createDirectMail(token, playerId, {
            fallbackTitle: `restore-mail-${playerSuffix.slice(-6)}`,
            fallbackBody: `post-backup mail ${playerSuffix}`,
            attachments: [{ itemId: 'spirit_stone', count: 1 }],
        });
        await waitForMailSummary(playerId, (summary) => {
            if (!mailSummaryBaseline) {
                return false;
            }
            return Number(summary?.unreadCount ?? 0) === Number(mailSummaryBaseline.unreadCount ?? 0) + 1
                && Number(summary?.claimableCount ?? 0) === Number(mailSummaryBaseline.claimableCount ?? 0) + 1
                && Number(summary?.revision ?? 0) === Number(mailSummaryBaseline.revision ?? 0) + 1;
        }, 10000);
        await waitForMailPresent(playerId, postBackupMailId, mailPageTotalBaseline + 1);
        await waitForStructuredMailPresent(postBackupMailId);
        await resetGmAuthPasswordRecord();
        const passwordChangeToken = await login(gmPassword);
        await authedPostJson('/api/auth/gm/password', passwordChangeToken, {
            currentPassword: gmPassword,
            newPassword: changedGmPassword,
        });
/**
 * 记录changed令牌。
 */
        const changedToken = await login(changedGmPassword);
        await expectRestoreRejectedWithoutMaintenance(changedToken, originalBackupId);
    }
    finally {
        await stopServer(server);
    }
    server = await startServer({ maintenance: true });
    try {
        await waitForHealth({ expectedStatus: 503, expectMaintenance: true });
/**
 * 记录maintenancesocketerrorcode。
 */
        const maintenanceSocketErrorCode = await expectMainlineSocketRejectedForMaintenance();
        if (maintenanceSocketErrorCode !== 'SERVER_BUSY') {
            throw new Error(`expected maintenance socket rejection code SERVER_BUSY, got ${maintenanceSocketErrorCode}`);
        }
/**
 * 记录令牌。
 */
        const token = await login(changedGmPassword);
        await corruptBackupChecksum(originalBackupRecord);
        await expectRestoreRejectedForInvalidBackup(token, originalBackupId);
        await restoreOriginalBackupFile(originalBackupRecord);
        if (normalizeBackupFormat(originalBackupRecord?.format, originalBackupRecord?.fileName) === 'mainline_json_snapshot') {
            await corruptBackupDocumentsCount(originalBackupRecord);
            await expectRestoreRejectedForInvalidDocumentsCount(token, originalBackupId);
            await restoreOriginalBackupFile(originalBackupRecord);
        }
        else {
            logStage('restore:skip-invalid-documents-count-test', {
                backupId: originalBackupId,
                format: normalizeBackupFormat(originalBackupRecord?.format, originalBackupRecord?.fileName),
            });
        }
/**
 * 记录恢复结果。
 */
        logStage('restore:start', {
            backupId: originalBackupId,
        });
        const restoreResult = await triggerRestoreWithConcurrentRejection(token, {
            backupId: originalBackupId,
        });
/**
 * 记录恢复jobID。
 */
        const restoreJobId = String(restoreResult?.job?.id ?? '').trim();
        if (!restoreJobId) {
            throw new Error(`missing restore job id: ${JSON.stringify(restoreResult)}`);
        }
/**
 * 记录恢复状态。
 */
        const restoreState = await waitForRestoreSettledAfterPasswordRollback(restoreJobId, token);
        logStage('restore:completed', {
            jobId: restoreJobId,
        });
        await assertGmAuthPasswordRecordMatchesBackup(backupGmAuthPayload);
        checkpointBackupId = String(restoreState.lastJob?.checkpointBackupId ?? '').trim();
        if (!checkpointBackupId) {
            throw new Error(`expected checkpointBackupId in restore lastJob: ${JSON.stringify(restoreState.lastJob)}`);
        }
/**
 * 记录备份ids。
 */
        const backupIds = new Set((restoreState.backups ?? []).map((entry) => String(entry?.id ?? '').trim()).filter((entry) => entry.length > 0));
        if (!backupIds.has(originalBackupId) || !backupIds.has(checkpointBackupId)) {
            throw new Error(`expected backups to include original and checkpoint ids, got ${JSON.stringify(restoreState.backups)}`);
        }
/**
 * 记录rollback令牌。
 */
        const rollbackToken = await login(gmPassword);
        await assertBackupDownload(rollbackToken, checkpointBackupId, requireBackupRecord(restoreState, checkpointBackupId, 'checkpoint backup'));
        await waitForMailPresent(playerId, preBackupMailId, mailPageTotalBaseline);
        await waitForSuggestionAbsent(rollbackToken, postBackupSuggestionId);
        await waitForMailAbsent(playerId, postBackupMailId, mailPageTotalBaseline);
        await waitForMailSummary(playerId, (summary) => matchesMailSummary(summary, mailSummaryBaseline), 10000);
        await assertStructuredPlayerPresencePresent(playerId);
        await assertStructuredPlayerVitals(playerId, BASELINE_VITALS_STATE);
        await assertStructuredPlayerProgressionCore(playerId, BASELINE_PROGRESSION_CORE_STATE);
        await assertStructuredPlayerBodyTrainingState(playerId, BASELINE_BODY_TRAINING_STATE);
        await assertStructuredPlayerAttrState(playerId, BASELINE_ATTR_STATE);
        await assertStructuredPlayerPersistentBuffStates(playerId, BASELINE_PERSISTENT_BUFF_STATES);
        await assertStructuredPlayerEnhancementRecords(playerId, BASELINE_ENHANCEMENT_RECORDS);
        await assertStructuredPlayerMarketStorageItems(playerId, BASELINE_MARKET_STORAGE_ITEMS);
        await assertStructuredMailPresent(preBackupMailId);
        await assertStructuredMailAbsent(postBackupMailId);
    }
    finally {
        await stopServer(server);
    }
    server = await startServer({ maintenance: false });
    try {
        await waitForHealth({ expectedStatus: 200, expectMaintenance: false });
        await login(gmPassword);
        await expectLoginFailure(changedGmPassword);
/**
 * 记录令牌。
 */
        const token = await login(gmPassword);
/**
 * 记录final状态。
 */
        const finalState = await authedGetJson('/api/gm/database/state', token);
        if (finalState.runningJob) {
            throw new Error(`expected no runningJob after restart, got ${JSON.stringify(finalState.runningJob)}`);
        }
        if (finalState.lastJob?.type !== 'restore' || finalState.lastJob?.status !== 'completed' || finalState.lastJob?.phase !== 'completed') {
            throw new Error(`expected completed restore lastJob after restart, got ${JSON.stringify(finalState.lastJob)}`);
        }
        if (String(finalState.lastJob?.sourceBackupId ?? '') !== originalBackupId) {
            throw new Error(`expected sourceBackupId=${originalBackupId}, got ${JSON.stringify(finalState.lastJob)}`);
        }
        if (String(finalState.lastJob?.checkpointBackupId ?? '') !== checkpointBackupId) {
            throw new Error(`expected checkpointBackupId=${checkpointBackupId}, got ${JSON.stringify(finalState.lastJob)}`);
        }
        if (typeof finalState.lastJob?.finishedAt !== 'string' || !finalState.lastJob.finishedAt.trim()) {
            throw new Error(`expected finishedAt to persist after restart, got ${JSON.stringify(finalState.lastJob)}`);
        }
        if (typeof finalState.lastJob?.appliedAt !== 'string' || !finalState.lastJob.appliedAt.trim()) {
            throw new Error(`expected appliedAt to persist after restart, got ${JSON.stringify(finalState.lastJob)}`);
        }
        await waitForMailPresent(playerId, preBackupMailId, mailPageTotalBaseline);
        await waitForSuggestionAbsent(token, postBackupSuggestionId);
        await waitForMailAbsent(playerId, postBackupMailId, mailPageTotalBaseline);
        await waitForMailSummary(playerId, (summary) => matchesMailSummary(summary, mailSummaryBaseline), 10000);
        await assertStructuredPlayerPresencePresent(playerId);
        await assertStructuredPlayerVitals(playerId, BASELINE_VITALS_STATE);
        await assertStructuredPlayerProgressionCore(playerId, BASELINE_PROGRESSION_CORE_STATE);
        await assertStructuredPlayerBodyTrainingState(playerId, BASELINE_BODY_TRAINING_STATE);
        await assertStructuredPlayerAttrState(playerId, BASELINE_ATTR_STATE);
        await assertStructuredPlayerPersistentBuffStates(playerId, BASELINE_PERSISTENT_BUFF_STATES);
        await assertStructuredPlayerEnhancementRecords(playerId, BASELINE_ENHANCEMENT_RECORDS);
        await assertStructuredPlayerMarketStorageItems(playerId, BASELINE_MARKET_STORAGE_ITEMS);
        await assertStructuredMailPresent(preBackupMailId);
        await assertStructuredMailAbsent(postBackupMailId);
    }
    finally {
        await stopServer(server);
    }
    server = await startServer({ maintenance: true });
    try {
        await waitForHealth({ expectedStatus: 503, expectMaintenance: true });
/**
 * 记录令牌。
 */
        const token = await login(gmPassword);
/**
 * 记录interrupted恢复。
 */
        const interruptedRestore = await triggerInterruptedRestoreAndStopServer(server, token, {
            backupId: originalBackupId,
        });
        interruptedRestoreJobId = interruptedRestore.jobId;
        interruptedRestoreObservedPhase = interruptedRestore.observedPhase;
        interruptedRestoreCheckpointBackupId = interruptedRestore.checkpointBackupId;
        server = null;
    }
    finally {
        await stopServer(server);
    }
    server = await startServer({ maintenance: true });
    try {
        await waitForHealth({ expectedStatus: 503, expectMaintenance: true });
/**
 * 记录令牌。
 */
        const token = await login(gmPassword);
        interruptedRestoreLastJob = await assertInterruptedRestoreFailedAfterRestart(token, {
            jobId: interruptedRestoreJobId,
            backupId: originalBackupId,
            observedPhase: interruptedRestoreObservedPhase,
            checkpointBackupId: interruptedRestoreCheckpointBackupId,
        });
        console.log(JSON.stringify({
            ok: true,
            answers: GM_DATABASE_SMOKE_CONTRACT.answers,
            excludes: GM_DATABASE_SMOKE_CONTRACT.excludes,
            completionMapping: GM_DATABASE_SMOKE_CONTRACT.completionMapping,
            originalBackupId,
            checkpointBackupId,
            playerId,
            revertedSuggestionId: postBackupSuggestionId,
            revertedMailId: postBackupMailId,
            mailSummaryBaseline,
            maintenanceSocketErrorCode: 'SERVER_BUSY',
            lastCompletedJob: {
                type: 'restore',
                status: 'completed',
                checkpointBackupId,
                sourceBackupId: originalBackupId,
            },
            interruptedRestore: {
                jobId: interruptedRestoreJobId,
                observedPhase: interruptedRestoreObservedPhase,
                checkpointBackupId: interruptedRestoreCheckpointBackupId,
                lastJob: interruptedRestoreLastJob,
            },
        }, null, 2));
        await deletePlayer(playerId).catch(() => undefined);
    }
    finally {
        await stopServer(server);
        await node_fs_1.promises.rm(backupDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
}
/**
 * 启动服务端。
 */
async function startServer(options) {
    currentPort = await allocateFreePort();
    baseUrl = `http://127.0.0.1:${currentPort}`;
/**
 * 记录子进程。
 */
    const child = (0, node_child_process_1.spawn)('node', [serverEntry], {
        cwd: repoRoot,
        env: {
            ...process.env,
            SERVER_PACKAGE_ROOT: packageRoot,
            SERVER_TOOL_DIST_ROOT: distRoot,
            SERVER_PORT: String(currentPort),
            SERVER_DATABASE_URL: databaseUrl,
            SERVER_RUNTIME_HTTP: '1',
            SERVER_ALLOW_LEGACY_HTTP_COMPAT: '1',
            SERVER_GM_DATABASE_BACKUP_DIR: backupDirectory,
            ...(options.maintenance
                ? { SERVER_RUNTIME_MAINTENANCE: '1' }
                : {}),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (chunk) => process.stdout.write(String(chunk)));
    child.stderr?.on('data', (chunk) => process.stderr.write(String(chunk)));
    return child;
}
/**
 * 处理resetGM认证passwordrecord。
 */
async function resetGmAuthPasswordRecord() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录客户端。
 */
    const client = new pg_1.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        await client.query('DELETE FROM persistent_documents WHERE scope = $1 AND key = $2', [
            next_gm_contract_1.GM_AUTH_CONTRACT.passwordRecordScope,
            next_gm_contract_1.GM_AUTH_CONTRACT.passwordRecordKey,
        ]);
    }
    catch (error) {
        if (error && typeof error === 'object' && error.code === '42P01') {
            return;
        }
        throw error;
    }
    finally {
        await client.end().catch(() => undefined);
    }
}

async function readGmAuthPasswordRecordPayload() {
  const client = new pg_1.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query('SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2 LIMIT 1', [
      next_gm_contract_1.GM_AUTH_CONTRACT.passwordRecordScope,
      next_gm_contract_1.GM_AUTH_CONTRACT.passwordRecordKey,
    ]);
    if ((result.rowCount ?? 0) === 0) {
      return null;
    }
    return result.rows[0]?.payload ?? null;
  }
  catch (error) {
    if (error && typeof error === 'object' && error.code === '42P01') {
      return null;
    }
    throw error;
  }
  finally {
    await client.end().catch(() => undefined);
  }
}
/**
 * 处理waitforstructuredmailpresent。
 */
async function waitForStructuredMailPresent(mailId) {
    await waitForCondition(async () => {
        const client = new pg_1.Client({ connectionString: databaseUrl });
        await client.connect();
        try {
            const [mailResult, attachmentResult] = await Promise.all([
                client.query('SELECT 1 FROM player_mail WHERE mail_id = $1 LIMIT 1', [mailId]),
                client.query('SELECT 1 FROM player_mail_attachment WHERE mail_id = $1 LIMIT 1', [mailId]),
            ]);
            return (mailResult.rowCount ?? 0) > 0 && (attachmentResult.rowCount ?? 0) > 0;
        }
        finally {
            await client.end().catch(() => undefined);
        }
    }, 5000);
}
/**
 * 处理assertstructuredmailpresent。
 */
async function assertStructuredMailPresent(mailId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const client = new pg_1.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        const [mailResult, attachmentResult] = await Promise.all([
            client.query('SELECT mail_version, deleted_at FROM player_mail WHERE mail_id = $1 LIMIT 1', [mailId]),
            client.query('SELECT claimed_at FROM player_mail_attachment WHERE mail_id = $1 ORDER BY attachment_id ASC LIMIT 1', [mailId]),
        ]);
        if ((mailResult.rowCount ?? 0) === 0) {
            throw new Error(`expected structured player_mail row ${mailId} to be present after restore`);
        }
        if ((attachmentResult.rowCount ?? 0) === 0) {
            throw new Error(`expected structured player_mail_attachment row for ${mailId} to be present after restore`);
        }
        const mailRow = mailResult.rows[0] ?? {};
        if (mailRow?.deleted_at != null || Number(mailRow?.mail_version ?? 0) <= 0) {
            throw new Error(`expected structured player_mail row ${mailId} to stay visible after restore, got ${JSON.stringify(mailRow)}`);
        }
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
/**
 * 处理assertstructuredplayerpresencepresent。
 */
async function assertStructuredPlayerPresencePresent(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const client = new pg_1.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        const result = await client.query('SELECT online, in_world FROM player_presence WHERE player_id = $1 LIMIT 1', [playerId]);
        if ((result.rowCount ?? 0) === 0) {
            throw new Error(`expected player_presence row for ${playerId}`);
        }
        const row = result.rows[0];
        if (row?.online !== true || row?.in_world !== true) {
            throw new Error(`expected player_presence online/in_world to survive restore, got ${JSON.stringify(row)}`);
        }
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
/**
 * 处理assertstructuredplayerbodytrainingstate。
 */
async function assertStructuredPlayerBodyTrainingState(playerId, expectedState) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const client = new pg_1.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        const result = await client.query('SELECT level, exp, exp_to_next FROM player_body_training_state WHERE player_id = $1 LIMIT 1', [playerId]);
        if ((result.rowCount ?? 0) === 0) {
            throw new Error(`expected player_body_training_state row for ${playerId}`);
        }
        const row = result.rows[0] ?? {};
        const actual = {
            level: Number(row?.level ?? 0),
            exp: Number(row?.exp ?? 0),
            expToNext: Number(row?.exp_to_next ?? 0),
        };
        const expected = {
            level: Number(expectedState?.level ?? 0),
            exp: Number(expectedState?.exp ?? 0),
            expToNext: Number(expectedState?.expToNext ?? 0),
        };
        if (actual.level !== expected.level || actual.exp !== expected.exp || actual.expToNext !== expected.expToNext) {
            throw new Error(`expected player_body_training_state=${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        }
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
/**
 * 处理assertstructuredplayervitals。
 */
async function assertStructuredPlayerVitals(playerId, expectedState) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const client = new pg_1.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        const result = await client.query('SELECT hp, max_hp, qi, max_qi FROM player_vitals WHERE player_id = $1 LIMIT 1', [playerId]);
        if ((result.rowCount ?? 0) === 0) {
            throw new Error(`expected player_vitals row for ${playerId}`);
        }
        const row = result.rows[0] ?? {};
        const actual = {
            hp: Number(row?.hp ?? 0),
            maxHp: Number(row?.max_hp ?? 0),
            qi: Number(row?.qi ?? 0),
            maxQi: Number(row?.max_qi ?? 0),
        };
        const expected = {
            hp: Number(expectedState?.hp ?? 0),
            maxHp: Number(expectedState?.maxHp ?? 0),
            qi: Number(expectedState?.qi ?? 0),
            maxQi: Number(expectedState?.maxQi ?? 0),
        };
        if (actual.hp !== expected.hp || actual.maxHp !== expected.maxHp || actual.qi !== expected.qi || actual.maxQi !== expected.maxQi) {
            throw new Error(`expected player_vitals=${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        }
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
/**
 * 处理assertstructuredplayerprogressioncore。
 */
async function assertStructuredPlayerProgressionCore(playerId, expectedState) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const client = new pg_1.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        const result = await client.query(`
      SELECT foundation, combat_exp, bone_age_base_years, life_elapsed_ticks, lifespan_years
      FROM player_progression_core
      WHERE player_id = $1
      LIMIT 1
    `, [playerId]);
        if ((result.rowCount ?? 0) === 0) {
            throw new Error(`expected player_progression_core row for ${playerId}`);
        }
        const row = result.rows[0] ?? {};
        const actual = {
            foundation: Number(row?.foundation ?? 0),
            combatExp: Number(row?.combat_exp ?? 0),
            boneAgeBaseYears: Number(row?.bone_age_base_years ?? 0),
            lifeElapsedTicks: Number(row?.life_elapsed_ticks ?? 0),
            lifespanYears: Number(row?.lifespan_years ?? 0),
        };
        const expected = {
            foundation: Number(expectedState?.foundation ?? 0),
            combatExp: Number(expectedState?.combatExp ?? 0),
            boneAgeBaseYears: Number(expectedState?.boneAgeBaseYears ?? 0),
            lifeElapsedTicks: Number(expectedState?.lifeElapsedTicks ?? 0),
            lifespanYears: Number(expectedState?.lifespanYears ?? 0),
        };
        if (actual.foundation !== expected.foundation
            || actual.combatExp !== expected.combatExp
            || actual.boneAgeBaseYears !== expected.boneAgeBaseYears
            || actual.lifeElapsedTicks !== expected.lifeElapsedTicks
            || actual.lifespanYears !== expected.lifespanYears) {
            throw new Error(`expected player_progression_core=${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        }
    }
    finally {
        await client.end().catch(() => undefined);
    }
}

async function assertStructuredPlayerAttrState(playerId, expectedState) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const client = new pg_1.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        const result = await client.query(`
      SELECT
        base_attrs_payload,
        bonus_entries_payload,
        revealed_breakthrough_requirement_ids,
        realm_payload,
        heaven_gate_payload,
        spiritual_roots_payload
      FROM player_attr_state
      WHERE player_id = $1
      LIMIT 1
    `, [playerId]);
        if ((result.rowCount ?? 0) === 0) {
            throw new Error(`expected player_attr_state row for ${playerId}`);
        }
        const row = result.rows[0] ?? {};
        const actual = {
            baseAttrs: row?.base_attrs_payload ?? null,
            bonusEntries: Array.isArray(row?.bonus_entries_payload) ? row.bonus_entries_payload : [],
            revealedBreakthroughRequirementIds: Array.isArray(row?.revealed_breakthrough_requirement_ids)
                ? row.revealed_breakthrough_requirement_ids
                : [],
            realm: row?.realm_payload ?? null,
            heavenGate: row?.heaven_gate_payload ?? null,
            spiritualRoots: row?.spiritual_roots_payload ?? null,
        };
        const expected = {
            baseAttrs: expectedState?.baseAttrs ?? null,
            bonusEntries: Array.isArray(expectedState?.bonusEntries) ? expectedState.bonusEntries : [],
            revealedBreakthroughRequirementIds: Array.isArray(expectedState?.revealedBreakthroughRequirementIds)
                ? expectedState.revealedBreakthroughRequirementIds
                : [],
            realm: expectedState?.realm ?? null,
            heavenGate: expectedState?.heavenGate ?? null,
            spiritualRoots: expectedState?.spiritualRoots ?? null,
        };
        if (JSON.stringify(normalizeComparableJson(actual)) !== JSON.stringify(normalizeComparableJson(expected))) {
            throw new Error(`expected player_attr_state=${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        }
    }
    finally {
        await client.end().catch(() => undefined);
    }
}

async function assertStructuredPlayerPersistentBuffStates(playerId, expectedStates) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const client = new pg_1.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        const result = await client.query(`
      SELECT
        buff_id,
        source_skill_id,
        source_caster_id,
        realm_lv,
        remaining_ticks,
        duration,
        stacks,
        max_stacks,
        sustain_ticks_elapsed,
        raw_payload
      FROM player_persistent_buff_state
      WHERE player_id = $1
      ORDER BY buff_id ASC, source_skill_id ASC
    `, [playerId]);
        const actual = normalizeComparablePersistentBuffStates(result.rows ?? []);
        const expected = normalizeComparablePersistentBuffStates(expectedStates);
        if (JSON.stringify(normalizeComparableJson(actual)) !== JSON.stringify(normalizeComparableJson(expected))) {
            throw new Error(`expected player_persistent_buff_state=${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        }
    }
    finally {
        await client.end().catch(() => undefined);
    }
}

async function assertStructuredPlayerEnhancementRecords(playerId, expectedRecords) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const client = new pg_1.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        const result = await client.query(`
      SELECT
        record_id,
        item_id,
        highest_level,
        levels_payload,
        action_started_at,
        action_ended_at,
        start_level,
        initial_target_level,
        desired_target_level,
        protection_start_level,
        status
      FROM player_enhancement_record
      WHERE player_id = $1
      ORDER BY record_id ASC
    `, [playerId]);
        const actual = normalizeComparableEnhancementRecords(result.rows ?? []);
        const expected = normalizeComparableEnhancementRecords(expectedRecords);
        if (JSON.stringify(normalizeComparableJson(actual)) !== JSON.stringify(normalizeComparableJson(expected))) {
            throw new Error(`expected player_enhancement_record=${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        }
    }
    finally {
        await client.end().catch(() => undefined);
    }
}

async function assertStructuredPlayerMarketStorageItems(playerId, expectedItems) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const client = new pg_1.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        const result = await client.query(`
      SELECT
        slot_index,
        item_id,
        count,
        enhance_level,
        raw_payload
      FROM player_market_storage_item
      WHERE player_id = $1
      ORDER BY slot_index ASC, storage_item_id ASC
    `, [playerId]);
        const actual = normalizeComparableMarketStorageItems(result.rows ?? []);
        const expected = normalizeComparableMarketStorageItems(expectedItems);
        if (JSON.stringify(normalizeComparableJson(actual)) !== JSON.stringify(normalizeComparableJson(expected))) {
            throw new Error(`expected player_market_storage_item=${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        }
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
/**
 * 处理assertstructuredmailabsent。
 */
async function assertStructuredMailAbsent(mailId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const client = new pg_1.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        const result = await client.query('SELECT 1 FROM player_mail WHERE mail_id = $1 LIMIT 1', [mailId]);
        if ((result.rowCount ?? 0) !== 0) {
            throw new Error(`expected structured player_mail row ${mailId} to be absent after restore`);
        }
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
/**
 * 处理assertstructuredtablepresent。
 */
function assertStructuredTablePresent(payload, tableName) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const tables = Array.isArray(payload?.tables) ? payload.tables : [];
    const record = tables.find((entry) => String(entry?.tableName ?? '').trim() === tableName);
    if (!record) {
        throw new Error(`expected backup payload to include structured table ${tableName}, got ${JSON.stringify(tables)}`);
    }
}

function requireBackupDocumentPayload(payload, scope, key) {
  const docs = Array.isArray(payload?.docs) ? payload.docs : [];
  const record = docs.find((entry) => String(entry?.scope ?? '').trim() === scope && String(entry?.key ?? '').trim() === key);
  if (!record) {
    throw new Error(`expected backup payload to include document ${scope}/${key}, got ${JSON.stringify(docs)}`);
  }
  return record?.payload ?? null;
}

function normalizeComparablePersistentBuffStates(states) {
    return (Array.isArray(states) ? states : []).map((entry) => ({
        buffId: String(entry?.buffId ?? entry?.buff_id ?? ''),
        sourceSkillId: String(entry?.sourceSkillId ?? entry?.source_skill_id ?? ''),
        sourceCasterId: entry?.sourceCasterId ?? entry?.source_caster_id ?? null,
        realmLv: Number(entry?.realmLv ?? entry?.realm_lv ?? 0),
        remainingTicks: Number(entry?.remainingTicks ?? entry?.remaining_ticks ?? 0),
        duration: Number(entry?.duration ?? 0),
        stacks: Number(entry?.stacks ?? 1),
        maxStacks: Number(entry?.maxStacks ?? entry?.max_stacks ?? 1),
        sustainTicksElapsed: entry?.sustainTicksElapsed ?? entry?.sustain_ticks_elapsed ?? null,
        rawPayload: entry?.rawPayload ?? entry?.raw_payload ?? null,
    })).sort((left, right) => left.buffId.localeCompare(right.buffId, 'zh-Hans-CN')
        || left.sourceSkillId.localeCompare(right.sourceSkillId, 'zh-Hans-CN'));
}

function normalizeComparableEnhancementRecords(records) {
    return (Array.isArray(records) ? records : []).map((entry) => ({
        recordId: String(entry?.recordId ?? entry?.record_id ?? ''),
        itemId: String(entry?.itemId ?? entry?.item_id ?? ''),
        highestLevel: Number(entry?.highestLevel ?? entry?.highest_level ?? 0),
        levels: Array.isArray(entry?.levels ?? entry?.levels_payload) ? (entry?.levels ?? entry?.levels_payload) : [],
        actionStartedAt: Number(entry?.actionStartedAt ?? entry?.action_started_at ?? 0),
        actionEndedAt: Number(entry?.actionEndedAt ?? entry?.action_ended_at ?? 0),
        startLevel: Number(entry?.startLevel ?? entry?.start_level ?? 0),
        initialTargetLevel: Number(entry?.initialTargetLevel ?? entry?.initial_target_level ?? 0),
        desiredTargetLevel: Number(entry?.desiredTargetLevel ?? entry?.desired_target_level ?? 0),
        protectionStartLevel: Number(entry?.protectionStartLevel ?? entry?.protection_start_level ?? 0),
        status: String(entry?.status ?? ''),
    })).sort((left, right) => left.recordId.localeCompare(right.recordId, 'zh-Hans-CN'));
}

function normalizeComparableMarketStorageItems(items) {
    return (Array.isArray(items) ? items : []).map((entry, index) => ({
        slotIndex: Number(entry?.slotIndex ?? entry?.slot_index ?? index),
        itemId: String(entry?.itemId ?? entry?.item_id ?? ''),
        count: Number(entry?.count ?? 1),
        enhanceLevel: normalizeOptionalInteger(
            entry?.enhanceLevel
            ?? entry?.enhancementLevel
            ?? entry?.enhance_level
            ?? entry?.level,
        ),
        rawPayload: entry?.rawPayload ?? entry?.raw_payload ?? entry ?? null,
    })).sort((left, right) => left.slotIndex - right.slotIndex
        || left.itemId.localeCompare(right.itemId, 'zh-Hans-CN'));
}

function normalizeOptionalInteger(value) {
    if (!Number.isFinite(value)) {
        return null;
    }
    return Math.trunc(Number(value));
}

function normalizeComparableJson(value) {
    if (Array.isArray(value)) {
        return value.map((entry) => normalizeComparableJson(entry));
    }
    if (!value || typeof value !== 'object') {
        return value;
    }
    return Object.fromEntries(Object.keys(value)
        .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))
        .map((key) => [key, normalizeComparableJson(value[key])]));
}

async function assertGmAuthPasswordRecordMatchesBackup(expectedPayload) {
  const client = new pg_1.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query('SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2 LIMIT 1', [
      next_gm_contract_1.GM_AUTH_CONTRACT.passwordRecordScope,
      next_gm_contract_1.GM_AUTH_CONTRACT.passwordRecordKey,
    ]);
    if ((result.rowCount ?? 0) === 0) {
      throw new Error('expected restored GM auth password record to exist before relogin');
    }
    const currentPayload = result.rows[0]?.payload ?? null;
    if (JSON.stringify(currentPayload) !== JSON.stringify(expectedPayload)) {
      throw new Error(`expected restored GM auth password record to match backup payload, got ${JSON.stringify({
        expectedPayload,
        currentPayload,
      })}`);
    }
  }
  finally {
    await client.end().catch(() => undefined);
  }
}
/**
 * 停止服务端。
 */
async function stopServer(child) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!child) {
        return;
    }
    if (child.killed || child.exitCode !== null) {
        return;
    }
    child.kill('SIGINT');
    await new Promise((resolve) => {
/**
 * 记录timer。
 */
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            resolve();
        }, 4000);
        child.once('exit', () => {
            clearTimeout(timer);
            resolve();
        });
    });
}
/**
 * 停止服务端hard。
 */
async function stopServerHard(child) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!child) {
        return;
    }
    if (child.killed || child.exitCode !== null) {
        return;
    }
    child.kill('SIGKILL');
    await new Promise((resolve) => {
/**
 * 记录timer。
 */
        const timer = setTimeout(() => resolve(), 2000);
        child.once('exit', () => {
            clearTimeout(timer);
            resolve();
        });
    });
}
/**
 * 等待for健康状态。
 */
async function waitForHealth(options) {
    await waitForCondition(async () => {
        try {
/**
 * 记录response。
 */
            const response = await fetch(`${baseUrl}/health`);
            if (response.status !== options.expectedStatus) {
                return false;
            }
/**
 * 记录请求体。
 */
            const body = await response.json();
            return options.expectMaintenance
                ? body?.readiness?.maintenance?.active === true
                : body?.readiness?.maintenance?.active !== true;
        }
        catch {
            return false;
        }
    }, 10000);
}
/**
 * 处理login。
 */
async function login(password) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录response。
 */
    const response = await fetch(`${baseUrl}/api/auth/gm/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
    });
    if (!response.ok) {
        throw new Error(`gm login failed: ${response.status} ${await response.text()}`);
    }
/**
 * 记录请求体。
 */
    const body = await response.json();
/**
 * 记录令牌。
 */
    const token = String(body?.accessToken ?? '').trim();
    if (!token) {
        throw new Error(`gm login missing accessToken: ${JSON.stringify(body)}`);
    }
    return token;
}
/**
 * 处理expectloginfailure。
 */
async function expectLoginFailure(password) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录response。
 */
    const response = await fetch(`${baseUrl}/api/auth/gm/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
    });
    if (response.ok) {
        throw new Error(`expected gm login to fail for password=${password}`);
    }
}
/**
 * 处理registerandlogin玩家。
 */
async function registerAndLoginPlayer() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录显示信息名称。
 */
    const displayName = await pickAvailableDisplayName();
    await requestJson('/api/auth/register', {
        method: 'POST',
        body: {
            accountName,
            password: playerPassword,
            displayName,
            roleName,
        },
    });
/**
 * 记录login结果。
 */
    const loginResult = await requestJson('/api/auth/login', {
        method: 'POST',
        body: {
            loginName: accountName,
            password: playerPassword,
        },
    });
/**
 * 记录access令牌。
 */
    const accessToken = String(loginResult?.accessToken ?? '').trim();
/**
 * 记录payload。
 */
    const payload = parseJwtPayload(accessToken);
/**
 * 记录玩家ID。
 */
    const playerId = resolveTokenPlayerId(payload);
    if (!accessToken || !playerId) {
        throw new Error(`unexpected player login payload: ${JSON.stringify(loginResult)}`);
    }
    (0, smoke_player_auth_1.registerSmokePlayerForCleanup)(playerId, {
        serverUrl: baseUrl,
        databaseUrl,
    });
    return {
        accessToken,
        playerId,
    };
}
/**
 * 处理pickavailable显示信息名称。
 */
async function pickAvailableDisplayName() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录rangestart。
 */
    const rangeStart = 0x4E00;
/**
 * 记录rangesize。
 */
    const rangeSize = 0x9FFF - rangeStart + 1;
    for (let index = 0; index < 512; index += 1) {
/**
 * 记录codepoint。
 */
        const codePoint = rangeStart + ((displayNameSeed + index * 131) % rangeSize);
/**
 * 记录candidate。
 */
        const candidate = String.fromCodePoint(codePoint);
/**
 * 记录payload。
 */
        const payload = await requestJson(`/api/auth/display-name/check?displayName=${encodeURIComponent(candidate)}`, {
            method: 'GET',
        });
        if (payload?.available === true) {
            return candidate;
        }
    }
    throw new Error('failed to allocate unique single-character displayName for gm-database smoke');
}
/**
 * 处理authedgetjson。
 */
async function authedGetJson(path, token) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录response。
 */
    const response = await fetch(`${baseUrl}${path}`, {
        headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
        throw new Error(`request failed: GET ${path} -> ${response.status} ${await response.text()}`);
    }
    return response.json();
}
/**
 * 处理requestjson。
 */
async function requestJson(path, init = {}) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录response。
 */
    const response = await fetch(`${baseUrl}${path}`, {
        method: init.method ?? 'GET',
        headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (!response.ok) {
        throw new Error(`request failed: ${init.method ?? 'GET'} ${path} -> ${response.status} ${await response.text()}`);
    }
    return response.status === 204 ? null : response.json();
}
/**
 * 处理authedpostjson。
 */
async function authedPostJson(path, token, body) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录response。
 */
    const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify(body ?? {}),
    });
    if (!response.ok) {
        throw new Error(`request failed: POST ${path} -> ${response.status} ${await response.text()}`);
    }
    return response.json();
}
/**
 * 创建suggestion。
 */
async function createSuggestion(playerId, body) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录payload。
 */
    const payload = await requestJson(`/runtime/players/${playerId}/suggestions`, {
        method: 'POST',
        body,
    });
/**
 * 记录suggestionID。
 */
    const suggestionId = String(payload?.suggestion?.id ?? '').trim();
    if (!suggestionId) {
        throw new Error(`unexpected suggestion create payload: ${JSON.stringify(payload)}`);
    }
    return suggestionId;
}
/**
 * 创建directmail。
 */
async function createDirectMail(token, playerId, body) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录payload。
 */
    const payload = await authedPostJson(`/api/gm/players/${playerId}/mail`, token, body);
/**
 * 记录mailID。
 */
    const mailId = String(payload?.mailId ?? '').trim();
    if (!mailId) {
        throw new Error(`unexpected direct mail payload: ${JSON.stringify(payload)}`);
    }
    return mailId;
}
/**
 * 处理fetchmail汇总。
 */
async function fetchMailSummary(playerId) {
/**
 * 记录payload。
 */
    const payload = await requestJson(`/runtime/players/${playerId}/mail/summary`, {
        method: 'GET',
    });
    return payload?.summary ?? null;
}
/**
 * 处理fetchmailpage。
 */
async function fetchMailPage(playerId) {
/**
 * 记录payload。
 */
    const payload = await requestJson(`/runtime/players/${playerId}/mail/page?page=1&pageSize=50`, {
        method: 'GET',
    });
    return payload?.page ?? null;
}
/**
 * 处理fetchmaildetail。
 */
async function fetchMailDetail(playerId, mailId) {
/**
 * 记录payload。
 */
    const payload = await requestJson(`/runtime/players/${playerId}/mail/${encodeURIComponent(mailId)}`, {
        method: 'GET',
    });
    return payload?.detail ?? null;
}
/**
 * 等待formail汇总。
 */
async function waitForMailSummary(playerId, predicate, timeoutMs) {
/**
 * 记录resolved。
 */
    let resolved = null;
    await waitForCondition(async () => {
/**
 * 记录汇总。
 */
        const summary = await fetchMailSummary(playerId);
        if (!summary || !(await predicate(summary))) {
            return false;
        }
        resolved = summary;
        return true;
    }, timeoutMs);
    return resolved;
}
/**
 * 等待formaildetail。
 */
async function waitForMailDetail(playerId, mailId, predicate, timeoutMs) {
/**
 * 记录resolved。
 */
    let resolved = null;
    await waitForCondition(async () => {
/**
 * 记录detail。
 */
        const detail = await fetchMailDetail(playerId, mailId);
        if (!(await predicate(detail))) {
            return false;
        }
        resolved = detail;
        return true;
    }, timeoutMs);
    return resolved;
}
/**
 * 等待formailpresent。
 */
async function waitForMailPresent(playerId, mailId, expectedTotal) {
    await waitForCondition(async () => {
        const [detail, page] = await Promise.all([
            fetchMailDetail(playerId, mailId),
            fetchMailPage(playerId),
        ]);
        return detail !== null && Number(page?.total ?? 0) === expectedTotal;
    }, 10000);
}
/**
 * 等待formailabsent。
 */
async function waitForMailAbsent(playerId, mailId, expectedTotal) {
    await waitForCondition(async () => {
        const [detail, page] = await Promise.all([
            fetchMailDetail(playerId, mailId),
            fetchMailPage(playerId),
        ]);
        return detail === null && Number(page?.total ?? 0) === expectedTotal;
    }, 10000);
}
/**
 * 判断是否匹配mail汇总。
 */
function matchesMailSummary(summary, baseline) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!summary || !baseline) {
        return false;
    }
    return Number(summary.unreadCount ?? 0) === Number(baseline.unreadCount ?? 0)
        && Number(summary.claimableCount ?? 0) === Number(baseline.claimableCount ?? 0)
        && Number(summary.revision ?? 0) === Number(baseline.revision ?? 0);
}
/**
 * 等待forsuggestionpresent。
 */
async function waitForSuggestionPresent(token, suggestionId) {
    await waitForCondition(async () => {
/**
 * 记录payload。
 */
        const payload = await authedGetJson('/api/gm/suggestions?page=1&pageSize=50', token);
        return findSuggestion(payload, suggestionId) !== null;
    }, 10000);
}
/**
 * 等待forsuggestionabsent。
 */
async function waitForSuggestionAbsent(token, suggestionId) {
    await waitForCondition(async () => {
/**
 * 记录payload。
 */
        const payload = await authedGetJson('/api/gm/suggestions?page=1&pageSize=50', token);
        return findSuggestion(payload, suggestionId) === null;
    }, 10000);
}
/**
 * 处理authedpost。
 */
async function authedPost(path, token, body) {
    return fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify(body ?? {}),
    });
}
/**
 * 处理trigger备份withconcurrentrejection。
 */
async function triggerBackupWithConcurrentRejection(token) {
    const [primary, secondary] = await Promise.all([
        authedPost('/api/gm/database/backup', token, {}),
        authedPost('/api/gm/database/backup', token, {}),
    ]);
    return pickAcceptedJobAndAssertConcurrentRejection([primary, secondary], 'backup');
}
/**
 * 处理trigger恢复withconcurrentrejection。
 */
async function triggerRestoreWithConcurrentRejection(token, body) {
    const [primary, secondary] = await Promise.all([
        authedPost('/api/gm/database/restore', token, body),
        authedPost('/api/gm/database/restore', token, body),
    ]);
    return pickAcceptedJobAndAssertConcurrentRejection([primary, secondary], 'restore');
}
/**
 * 处理trigger恢复。
 */
async function triggerRestore(token, body) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录response。
 */
    const response = await authedPost('/api/gm/database/restore', token, body);
    if (!response.ok) {
        throw new Error(`request failed: POST /api/gm/database/restore -> ${response.status} ${await response.text()}`);
    }
    return response.json();
}
/**
 * 处理pickacceptedjobandassertconcurrentrejection。
 */
async function pickAcceptedJobAndAssertConcurrentRejection(responses, jobType) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录accepted。
 */
    const accepted = [];
/**
 * 记录rejected。
 */
    const rejected = [];
    for (const response of responses) {
        if (response.ok) {
            accepted.push(response);
            continue;
        }
        rejected.push(response);
    }
    if (accepted.length !== 1 || rejected.length !== 1) {
/**
 * 记录details。
 */
        const details = await Promise.all(responses.map(async (response) => ({
            status: response.status,
            body: await response.text(),
        })));
        throw new Error(`expected exactly one accepted and one rejected concurrent ${jobType} request, got ${JSON.stringify(details)}`);
    }
    await assertConcurrentDatabaseJobRejected(rejected[0], jobType);
    return accepted[0].json();
}
/**
 * 断言concurrent数据库jobrejected。
 */
async function assertConcurrentDatabaseJobRejected(response, jobType) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录text。
 */
    const text = await response.text();
    if (response.status !== 400) {
        throw new Error(`expected concurrent ${jobType} rejection with 400, got ${response.status} ${text}`);
    }
    if (!text.includes('当前已有数据库任务执行中')) {
        throw new Error(`expected concurrent ${jobType} rejection to mention running database job, got ${text}`);
    }
}
/**
 * 查找suggestion。
 */
function findSuggestion(payload, suggestionId) {
    return Array.isArray(payload?.items)
        ? payload.items.find((entry) => String(entry?.id ?? '').trim() === suggestionId) ?? null
        : null;
}
/**
 * 处理require备份record。
 */
function requireBackupRecord(state, backupId, label) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录record。
 */
    const record = (state?.backups ?? []).find((entry) => String(entry?.id ?? '').trim() === backupId);
    if (!record) {
        throw new Error(`missing ${label} metadata for backupId=${backupId}: ${JSON.stringify(state?.backups ?? [])}`);
    }
    return record;
}
/**
 * 解析jwtpayload。
 */
function parseJwtPayload(token) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (typeof token !== 'string') {
        return null;
    }
/**
 * 记录segments。
 */
    const segments = token.split('.');
    if (segments.length < 2) {
        return null;
    }
    try {
        return JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'));
    }
    catch {
        return null;
    }
}
/**
 * 从 主线玩家令牌中解析 playerId，优先信任显式 playerId 字段。
 */
function resolveTokenPlayerId(payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const direct = normalizeMainlinePlayerId(typeof payload?.playerId === 'string' ? payload.playerId.trim() : '');
    if (direct) {
        return direct;
    }
    return normalizeMainlinePlayerId(typeof payload?.sub === 'string' ? payload.sub.trim() : '');
}
/**
 * 规范化 主线玩家ID，统一为 p_<uuid> 形态。
 */
function normalizeMainlinePlayerId(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (typeof value !== 'string') {
        return '';
    }
/**
 * 记录trimmed。
 */
    const trimmed = value.trim();
    if (!trimmed) {
        return '';
    }
    if (trimmed.startsWith('p_')) {
        return trimmed;
    }
    return /^[0-9a-fA-F-]{36}$/.test(trimmed) ? `p_${trimmed}` : trimmed;
}
/**
 * 断言备份download。
 */
async function assertBackupDownload(token, backupId, expectedRecord = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录expected文件名称。
 */
    const expectedFileName = String(expectedRecord?.fileName ?? `server-database-backup-${backupId}.dump`).trim();
    const expectedFormat = normalizeBackupFormat(expectedRecord?.format, expectedFileName);
/**
 * 记录response。
 */
    const response = await fetch(`${baseUrl}/api/gm/database/backups/${backupId}/download`, {
        headers: {
            authorization: `Bearer ${token}`,
        },
    });
    if (!response.ok) {
        throw new Error(`request failed: GET /api/gm/database/backups/${backupId}/download -> ${response.status} ${await response.text()}`);
    }
/**
 * 记录contentdisposition。
 */
    const contentDisposition = response.headers.get('content-disposition') ?? '';
    if (!contentDisposition.includes(expectedFileName)) {
        throw new Error(`expected content-disposition to include ${expectedFileName}, got ${contentDisposition || '<empty>'}`);
    }
    const downloadedBytes = Buffer.from(await response.arrayBuffer());
    if (expectedFormat === 'postgres_custom_dump') {
        if (!isPostgresCustomDumpBuffer(downloadedBytes)) {
            throw new Error(`expected downloaded backup to be PostgreSQL custom dump, got ${downloadedBytes.subarray(0, POSTGRES_DUMP_MAGIC.length).toString('utf8') || '<empty>'}`);
        }
        const downloadedChecksum = computeBufferSha256(downloadedBytes);
        const diskBytes = await node_fs_1.promises.readFile(resolveBackupFilePath(expectedRecord ?? backupId));
        if (computeBufferSha256(diskBytes) !== downloadedChecksum) {
            throw new Error(`expected downloaded PostgreSQL backup checksum to match on-disk backup for ${backupId}`);
        }
        if (expectedRecord) {
            const expectedChecksum = String(expectedRecord?.checksumSha256 ?? '').trim();
            if (expectedChecksum && expectedChecksum !== downloadedChecksum) {
                throw new Error(`expected metadata checksumSha256=${expectedChecksum}, got ${downloadedChecksum}`);
            }
        }
        return {
            backupId,
            format: 'postgres_custom_dump',
            checksumSha256: downloadedChecksum,
            sizeBytes: downloadedBytes.length,
        };
    }
/**
 * 记录payload。
 */
    const payload = JSON.parse(downloadedBytes.toString('utf8'));
    if (payload?.backupId !== backupId) {
        throw new Error(`expected downloaded backupId=${backupId}, got ${JSON.stringify(payload)}`);
    }
    if (payload?.kind !== 'server_persistent_documents_backup_v1'
        && payload?.kind !== 'server_persistence_backup_v2') {
        throw new Error(`unexpected backup payload kind: ${JSON.stringify(payload)}`);
    }
    if (!Array.isArray(payload?.docs) || payload.docs.length === 0) {
        throw new Error(`expected downloaded backup docs, got ${JSON.stringify(payload)}`);
    }
    if (Number(payload?.documentsCount) !== payload.docs.length) {
        throw new Error(`expected documentsCount to match docs length, got ${JSON.stringify(payload)}`);
    }
    if (typeof payload?.checksumSha256 !== 'string' || payload.checksumSha256.trim().length === 0) {
        throw new Error(`expected downloaded backup checksumSha256, got ${JSON.stringify(payload)}`);
    }
/**
 * 记录downloadedchecksum。
 */
    const downloadedChecksum = computeChecksumForDocs(payload.docs);
    if (payload.checksumSha256 !== downloadedChecksum) {
        throw new Error(`expected downloaded checksumSha256=${downloadedChecksum}, got ${payload.checksumSha256}`);
    }
    if (payload?.kind === 'server_persistence_backup_v2') {
        if (!Array.isArray(payload?.tables) || payload.tables.length === 0) {
            throw new Error(`expected downloaded backup structured tables, got ${JSON.stringify(payload)}`);
        }
        if (Number(payload?.tablesCount) !== payload.tables.length) {
            throw new Error(`expected tablesCount to match tables length, got ${JSON.stringify(payload)}`);
        }
        if (typeof payload?.tablesChecksumSha256 !== 'string' || payload.tablesChecksumSha256.trim().length === 0) {
            throw new Error(`expected downloaded backup tablesChecksumSha256, got ${JSON.stringify(payload)}`);
        }
        const downloadedTablesChecksum = computeChecksumForTables(payload.tables);
        if (payload.tablesChecksumSha256 !== downloadedTablesChecksum) {
            throw new Error(`expected downloaded tablesChecksumSha256=${downloadedTablesChecksum}, got ${payload.tablesChecksumSha256}`);
        }
    }
/**
 * 记录diskpayload。
 */
    const diskPayload = JSON.parse(await node_fs_1.promises.readFile(resolveBackupFilePath(expectedRecord ?? backupId), 'utf8'));
    if (computeChecksumForDocs(diskPayload?.docs ?? []) !== downloadedChecksum) {
        throw new Error(`expected downloaded backup checksum to match on-disk backup for ${backupId}`);
    }
    if (payload?.kind === 'server_persistence_backup_v2'
        && computeChecksumForTables(diskPayload?.tables ?? []) !== String(payload?.tablesChecksumSha256 ?? '')) {
        throw new Error(`expected downloaded backup structured table checksum to match on-disk backup for ${backupId}`);
    }
    if (expectedRecord) {
/**
 * 记录expecteddocuments数量。
 */
        const expectedDocumentsCount = Number(expectedRecord?.documentsCount);
/**
 * 记录expectedchecksum。
 */
        const expectedChecksum = String(expectedRecord?.checksumSha256 ?? '').trim();
        if (Number.isFinite(expectedDocumentsCount) && expectedDocumentsCount !== payload.documentsCount) {
            throw new Error(`expected metadata documentsCount=${expectedDocumentsCount}, got ${payload.documentsCount}`);
        }
        if (expectedChecksum && expectedChecksum !== payload.checksumSha256) {
            throw new Error(`expected metadata checksumSha256=${expectedChecksum}, got ${payload.checksumSha256}`);
        }
        const expectedTablesCount = Number(expectedRecord?.tablesCount);
        const expectedTablesChecksum = String(expectedRecord?.tablesChecksumSha256 ?? '').trim();
        if (Number.isFinite(expectedTablesCount) && expectedTablesCount !== Number(payload?.tablesCount ?? 0)) {
            throw new Error(`expected metadata tablesCount=${expectedTablesCount}, got ${payload?.tablesCount}`);
        }
        if (expectedTablesChecksum && expectedTablesChecksum !== String(payload?.tablesChecksumSha256 ?? '')) {
            throw new Error(`expected metadata tablesChecksumSha256=${expectedTablesChecksum}, got ${payload?.tablesChecksumSha256}`);
        }
    }
    return payload;
}
/**
 * 处理expect恢复rejectedwithoutmaintenance。
 */
async function expectRestoreRejectedWithoutMaintenance(token, backupId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录response。
 */
    const response = await fetch(`${baseUrl}/api/gm/database/restore`, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({ backupId }),
    });
    if (response.status !== 400) {
        throw new Error(`expected restore without maintenance to fail with 400, got ${response.status} ${await response.text()}`);
    }
/**
 * 记录text。
 */
    const text = await response.text();
    if (!text.includes('维护态')) {
        throw new Error(`expected restore rejection to mention maintenance, got ${text}`);
    }
}
/**
 * 处理expect恢复rejectedforinvalid备份。
 */
async function expectRestoreRejectedForInvalidBackup(token, backupId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录response。
 */
    const response = await fetch(`${baseUrl}/api/gm/database/restore`, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({ backupId }),
    });
    if (response.status !== 400) {
        throw new Error(`expected invalid backup restore to fail with 400, got ${response.status} ${await response.text()}`);
    }
/**
 * 记录text。
 */
    const text = await response.text();
    if (!text.includes('checksumSha256')) {
        throw new Error(`expected invalid backup rejection to mention checksumSha256, got ${text}`);
    }
}
/**
 * 处理expect恢复rejectedforinvaliddocuments数量。
 */
async function expectRestoreRejectedForInvalidDocumentsCount(token, backupId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录response。
 */
    const response = await fetch(`${baseUrl}/api/gm/database/restore`, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({ backupId }),
    });
    if (response.status !== 400) {
        throw new Error(`expected invalid documentsCount restore to fail with 400, got ${response.status} ${await response.text()}`);
    }
/**
 * 记录text。
 */
    const text = await response.text();
    if (!text.includes('documentsCount')) {
        throw new Error(`expected invalid documentsCount rejection to mention documentsCount, got ${text}`);
    }
}
/**
 * 处理expectnextsocketrejectedformaintenance。
 */
async function expectMainlineSocketRejectedForMaintenance() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录socket。
 */
    const socket = (0, socket_io_client_1.io)(baseUrl, {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        auth: {
            protocol: 'mainline',
        },
    });
/**
 * 记录errorpayload。
 */
    let errorPayload = null;
/**
 * 记录disconnected。
 */
    let disconnected = false;
    try {
        socket.on(shared_next_1.S2C.Error, (payload) => {
            errorPayload = payload;
        });
        socket.on('disconnect', () => {
            disconnected = true;
        });
        await onceConnected(socket);
/**
 * 记录finalpayload。
 */
        const finalPayload = await waitForCondition(() => {
            if (!errorPayload) {
                return false;
            }
            if (!disconnected) {
                return false;
            }
            return errorPayload;
        }, 5000);
        return typeof finalPayload?.code === 'string' ? finalPayload.code.trim() : '';
    }
    finally {
        socket.close();
    }
}
/**
 * 等待forjobsettled。
 */
async function waitForJobSettled(token, jobId, type) {
    return waitForCondition(async () => {
/**
 * 记录状态。
 */
        const state = await authedGetJson('/api/gm/database/state', token);
        if (state.runningJob?.id === jobId) {
            return false;
        }
        if (state.lastJob?.id !== jobId) {
            return false;
        }
        if (state.lastJob?.type !== type) {
            throw new Error(`expected lastJob.type=${type}, got ${JSON.stringify(state.lastJob)}`);
        }
        if (state.lastJob?.status !== 'completed') {
            throw new Error(`expected lastJob completed, got ${JSON.stringify(state.lastJob)}`);
        }
        if (state.lastJob?.phase !== 'completed') {
            throw new Error(`expected lastJob phase completed, got ${JSON.stringify(state.lastJob)}`);
        }
        return state;
    }, GM_DATABASE_JOB_SETTLE_TIMEOUT_MS);
}
/**
 * 等待for恢复settledafterpasswordrollback。
 */
async function waitForRestoreSettledAfterPasswordRollback(jobId, token) {
    await waitForCondition(async () => {
        let state;
        try {
            state = await authedGetJson('/api/gm/database/state', token);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('GET /api/gm/database/state -> 401')) {
                return {
                    reauthRequired: true,
                };
            }
            throw error;
        }
        if (state.runningJob?.id === jobId) {
            return false;
        }
        if (state.lastJob?.id !== jobId) {
            return false;
        }
        if (state.lastJob?.type !== 'restore' || state.lastJob?.status !== 'completed' || state.lastJob?.phase !== 'completed') {
            throw new Error(`expected completed restore lastJob, got ${JSON.stringify(state.lastJob)}`);
        }
        return state;
    }, GM_DATABASE_RESTORE_SETTLE_TIMEOUT_MS, 1000);
/**
 * 记录rollback令牌。
 */
    const rollbackToken = await login(gmPassword);
    return waitForCondition(async () => {
/**
 * 记录状态。
 */
        const state = await authedGetJson('/api/gm/database/state', rollbackToken);
        if (state.runningJob?.id === jobId) {
            return false;
        }
        if (state.lastJob?.id !== jobId) {
            return false;
        }
        if (state.lastJob?.type !== 'restore' || state.lastJob?.status !== 'completed' || state.lastJob?.phase !== 'completed') {
            throw new Error(`expected completed restore lastJob, got ${JSON.stringify(state.lastJob)}`);
        }
        return state;
    }, 15000, 1000);
}

async function readPersistedDatabaseJobState() {
/**
 * 记录客户端。
 */
    const client = new pg_1.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        const result = await client.query('SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2 LIMIT 1', [
            GM_DATABASE_JOB_STATE_SCOPE,
            GM_DATABASE_JOB_STATE_KEY,
        ]);
        return result.rows[0]?.payload ?? {};
    }
    catch (error) {
        if (error && typeof error === 'object' && error.code === '42P01') {
            return {};
        }
        throw error;
    }
    finally {
        await client.end().catch(() => undefined);
    }
}

function logStage(stage, extra = {}) {
    process.stdout.write(`[gm-database-smoke] ${stage} ${JSON.stringify(extra)}\n`);
}
/**
 * 等待for恢复running。
 */
async function waitForRestoreRunning(token, jobId) {
    return waitForCondition(async () => {
/**
 * 记录状态。
 */
        const state = await authedGetJson('/api/gm/database/state', token);
        if (state.runningJob?.id === jobId) {
            if (state.runningJob?.type !== 'restore' || state.runningJob?.status !== 'running') {
                throw new Error(`expected running restore job, got ${JSON.stringify(state.runningJob)}`);
            }
/**
 * 记录phase。
 */
            const phase = String(state.runningJob?.phase ?? '').trim();
            if (!phase || phase === 'completed') {
                return false;
            }
            return state.runningJob;
        }
        if (state.lastJob?.id === jobId) {
            throw new Error(`restore job ${jobId} settled before interruption window: ${JSON.stringify(state.lastJob)}`);
        }
        return false;
    }, 5000);
}
/**
 * 处理triggerinterrupted恢复andstop服务端。
 */
async function triggerInterruptedRestoreAndStopServer(server, token, body) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录恢复结果。
 */
    const restoreResult = await triggerRestore(token, body);
/**
 * 记录jobID。
 */
    const jobId = String(restoreResult?.job?.id ?? '').trim();
    if (!jobId) {
        throw new Error(`missing interrupted restore job id: ${JSON.stringify(restoreResult)}`);
    }
/**
 * 记录runningjob。
 */
    const runningJob = await waitForRestoreRunning(token, jobId);
    await stopServerHard(server);
    return {
        jobId,
        observedPhase: String(runningJob?.phase ?? '').trim(),
        checkpointBackupId: String(runningJob?.checkpointBackupId ?? '').trim(),
    };
}
/**
 * 断言interrupted恢复failedafterrestart。
 */
async function assertInterruptedRestoreFailedAfterRestart(token, input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录状态。
 */
    const state = await authedGetJson('/api/gm/database/state', token);
    if (state.runningJob) {
        throw new Error(`expected no runningJob after interrupted restore restart, got ${JSON.stringify(state.runningJob)}`);
    }
/**
 * 记录lastjob。
 */
    const lastJob = state.lastJob;
    if (lastJob?.id !== input.jobId) {
        throw new Error(`expected interrupted restore lastJob.id=${input.jobId}, got ${JSON.stringify(lastJob)}`);
    }
    if (lastJob?.type !== 'restore') {
        throw new Error(`expected interrupted restore lastJob.type=restore, got ${JSON.stringify(lastJob)}`);
    }
    if (lastJob?.status !== 'failed') {
        throw new Error(`expected interrupted restore lastJob.status=failed, got ${JSON.stringify(lastJob)}`);
    }
    if (lastJob?.phase === 'completed') {
        throw new Error(`expected interrupted restore lastJob.phase to stay non-completed, got ${JSON.stringify(lastJob)}`);
    }
    if (String(lastJob?.sourceBackupId ?? '') !== input.backupId) {
        throw new Error(`expected interrupted restore sourceBackupId=${input.backupId}, got ${JSON.stringify(lastJob)}`);
    }
    if (input.checkpointBackupId && String(lastJob?.checkpointBackupId ?? '') !== input.checkpointBackupId) {
        throw new Error(`expected interrupted restore checkpointBackupId=${input.checkpointBackupId}, got ${JSON.stringify(lastJob)}`);
    }
    if (typeof lastJob?.finishedAt !== 'string' || !lastJob.finishedAt.trim()) {
        throw new Error(`expected interrupted restore finishedAt to persist, got ${JSON.stringify(lastJob)}`);
    }
/**
 * 记录errortext。
 */
    const errorText = String(lastJob?.error ?? '');
    if (!errorText.includes('服务重启导致数据库任务在阶段')) {
        throw new Error(`expected interrupted restore error to mention restart interruption, got ${JSON.stringify(lastJob)}`);
    }
/**
 * 记录failedphase。
 */
    const failedPhase = String(lastJob?.phase ?? '').trim();
    if (failedPhase && !errorText.includes(failedPhase)) {
        throw new Error(`expected interrupted restore error to include failed phase ${failedPhase}, got ${JSON.stringify(lastJob)}`);
    }
    if (input.observedPhase && (!failedPhase || failedPhase === input.observedPhase) && !errorText.includes(input.observedPhase)) {
        throw new Error(`expected interrupted restore error to include observed phase ${input.observedPhase}, got ${JSON.stringify(lastJob)}`);
    }
    return lastJob;
}
/**
 * 处理corrupt备份checksum。
 */
async function corruptBackupChecksum(backupRecord) {
/**
 * 记录文件路径。
 */
    const filePath = resolveBackupFilePath(backupRecord);
    const raw = await node_fs_1.promises.readFile(filePath);
    rememberOriginalBackupFile(filePath, raw);
    if (normalizeBackupFormat(backupRecord?.format, backupRecord?.fileName) === 'postgres_custom_dump') {
        if (raw.length === 0) {
            throw new Error(`cannot corrupt empty PostgreSQL backup file: ${filePath}`);
        }
        const corrupted = Buffer.from(raw);
        corrupted[0] = corrupted[0] ^ 0xff;
        await node_fs_1.promises.writeFile(filePath, corrupted);
        return;
    }
    const parsed = JSON.parse(raw.toString('utf8'));
    parsed.checksumSha256 = 'broken-checksum';
    await node_fs_1.promises.writeFile(filePath, JSON.stringify(parsed, null, 2), 'utf8');
}
/**
 * 处理corrupt备份documents数量。
 */
async function corruptBackupDocumentsCount(backupRecord) {
/**
 * 记录文件路径。
 */
    if (normalizeBackupFormat(backupRecord?.format, backupRecord?.fileName) === 'postgres_custom_dump') {
        throw new Error('PostgreSQL custom dump 不支持 documentsCount 篡改测试');
    }
    const filePath = resolveBackupFilePath(backupRecord);
    const raw = await node_fs_1.promises.readFile(filePath);
    rememberOriginalBackupFile(filePath, raw);
    const parsed = JSON.parse(raw.toString('utf8'));
/**
 * 记录当前值数量。
 */
    const currentCount = Number(parsed?.documentsCount);
/**
 * 记录normalized数量。
 */
    const normalizedCount = Number.isFinite(currentCount)
        ? Math.trunc(currentCount)
        : Array.isArray(parsed?.docs) ? parsed.docs.length : 0;
    parsed.documentsCount = normalizedCount + 1;
    await node_fs_1.promises.writeFile(filePath, JSON.stringify(parsed, null, 2), 'utf8');
}
/**
 * 处理恢复original备份文件。
 */
async function restoreOriginalBackupFile(backupRecord) {
/**
 * 记录文件路径。
 */
    const filePath = resolveBackupFilePath(backupRecord);
    const original = backupFileSnapshots.get(filePath);
    if (original) {
        await node_fs_1.promises.writeFile(filePath, original);
        backupFileSnapshots.delete(filePath);
        return;
    }
    if (normalizeBackupFormat(backupRecord?.format, backupRecord?.fileName) === 'postgres_custom_dump') {
        throw new Error(`missing original PostgreSQL backup snapshot for restore: ${filePath}`);
    }
    const raw = await node_fs_1.promises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    parsed.documentsCount = Array.isArray(parsed?.docs) ? parsed.docs.length : 0;
    parsed.checksumSha256 = computeChecksumForDocs(parsed.docs ?? []);
    await node_fs_1.promises.writeFile(filePath, JSON.stringify(parsed, null, 2), 'utf8');
}
/**
 * 解析备份文件路径。
 */
function resolveBackupFilePath(backupRecordOrId) {
    const fileName = typeof backupRecordOrId?.fileName === 'string' && backupRecordOrId.fileName.trim()
        ? backupRecordOrId.fileName.trim()
        : typeof backupRecordOrId === 'string' && backupRecordOrId.trim()
            ? `server-database-backup-${backupRecordOrId.trim()}.dump`
            : '';
    if (!fileName) {
        throw new Error(`cannot resolve backup file path from ${JSON.stringify(backupRecordOrId)}`);
    }
    return (0, node_path_1.join)(backupDirectory, fileName);
}
/**
 * 处理computechecksumfordocs。
 */
function computeChecksumForDocs(docs) {
    return computeBufferSha256(Buffer.from(JSON.stringify(docs)));
}
/**
 * 处理computechecksumfortables。
 */
function computeChecksumForTables(tables) {
    const normalized = Array.isArray(tables)
        ? tables.map((entry) => ({
            tableName: typeof entry?.tableName === 'string' ? entry.tableName : '',
            rowCount: Number(entry?.rowCount ?? 0),
            checksumSha256: typeof entry?.checksumSha256 === 'string' ? entry.checksumSha256 : '',
        }))
        : [];
    return computeBufferSha256(Buffer.from(JSON.stringify(normalized)));
}

function normalizeBackupFormat(format, fileName) {
    if (format === 'postgres_custom_dump' || format === 'mainline_json_snapshot') {
        return format;
    }
    const normalizedFileName = typeof fileName === 'string' ? fileName.trim().toLowerCase() : '';
    if (normalizedFileName.endsWith('.json')) {
        return 'mainline_json_snapshot';
    }
    return 'postgres_custom_dump';
}

function rememberOriginalBackupFile(filePath, raw) {
    if (!backupFileSnapshots.has(filePath)) {
        backupFileSnapshots.set(filePath, Buffer.from(raw));
    }
}

function isPostgresCustomDumpBuffer(buffer) {
    return Buffer.isBuffer(buffer)
        && buffer.length >= POSTGRES_DUMP_MAGIC.length
        && buffer.subarray(0, POSTGRES_DUMP_MAGIC.length).equals(POSTGRES_DUMP_MAGIC);
}

function computeBufferSha256(buffer) {
    return (0, node_crypto_1.createHash)('sha256').update(buffer).digest('hex');
}
/**
 * 等待forcondition。
 */
async function waitForCondition(predicate, timeoutMs, intervalMs = 100) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录startedat。
 */
    const startedAt = Date.now();
    while (true) {
/**
 * 累计当前结果。
 */
        const result = await predicate();
        if (result) {
            return result;
        }
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error('waitFor timeout');
        }
        await delay(intervalMs);
    }
}
/**
 * 处理delay。
 */
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * 处理onceconnected。
 */
async function onceConnected(socket) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (socket.connected) {
        return;
    }
    await new Promise((resolve, reject) => {
/**
 * 记录timer。
 */
        const timer = setTimeout(() => reject(new Error('socket connect timeout')), 5000);
        socket.once('connect', () => {
            clearTimeout(timer);
            resolve();
        });
        socket.once('connect_error', (error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}
/**
 * 处理delete玩家。
 */
async function deletePlayer(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!playerId) {
        return;
    }
    await (0, smoke_player_cleanup_1.purgeSmokePlayerArtifactsByPlayerId)(playerId, {
        serverUrl: baseUrl,
        databaseUrl,
    });
}
/**
 * 分配free端口。
 */
async function allocateFreePort() {
    return new Promise((resolve, reject) => {
/**
 * 记录服务端。
 */
        const server = (0, node_net_1.createServer)();
        server.unref();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
/**
 * 记录address。
 */
            const address = server.address();
            if (!address || typeof address === 'string') {
                server.close(() => reject(new Error('failed to allocate free port')));
                return;
            }
/**
 * 记录端口。
 */
            const port = address.port;
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(port);
            });
        });
    });
}
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(() => {
    return (0, smoke_player_auth_1.flushRegisteredSmokePlayers)()
        .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
        .finally(() => {
        ownedDistSnapshot?.cleanup();
    });
});

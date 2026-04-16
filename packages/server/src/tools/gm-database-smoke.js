"use strict";
/**
 * 用途：执行 gm-database 链路的冒烟验证。
 */
// TODO(next:T10): 在真实维护窗口补齐 destructive backup/restore 取证后，把这里的脚本边界收成正式 GM database 证明链，而不是长期依赖本地替代场景。

Object.defineProperty(exports, "__esModule", { value: true });
const smoke_timeout_1 = require("./smoke-timeout");
(0, smoke_timeout_1.installSmokeTimeout)(__filename);
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_net_1 = require("node:net");
const node_path_1 = require("node:path");
const socket_io_client_1 = require("socket.io-client");
const shared_next_1 = require("@mud/shared-next");
const pg_1 = require("pg");
const env_alias_1 = require("../config/env-alias");
/**
 * 记录包根目录。
 */
const packageRoot = (0, node_path_1.resolve)(__dirname, '..', '..');
/**
 * 记录服务端入口文件路径。
 */
const serverEntry = (0, node_path_1.join)(packageRoot, 'dist', 'main.js');
/**
 * 记录数据库地址。
 */
const databaseUrl = (0, env_alias_1.resolveServerNextDatabaseUrl)();
/**
 * 记录GMpassword。
 */
const gmPassword = (0, env_alias_1.resolveServerNextGmPassword)('admin123');
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
let currentPort = Number(process.env.SERVER_NEXT_SMOKE_PORT ?? 3212);
/**
 * 记录base地址。
 */
let baseUrl = `http://127.0.0.1:${currentPort}`;
/**
 * 串联执行脚本主流程。
 */
async function main() {
    if (!databaseUrl.trim()) {
        console.log(JSON.stringify({ ok: true, skipped: true, reason: 'SERVER_NEXT_DATABASE_URL/DATABASE_URL missing' }, null, 2));
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
 * 记录post备份mailID。
 */
    let postBackupMailId = '';
/**
 * 记录mail汇总baseline。
 */
    let mailSummaryBaseline = null;
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
/**
 * 记录备份结果。
 */
        const backupResult = await triggerBackupWithConcurrentRejection(token);
        originalBackupId = String(backupResult?.job?.backupId ?? '').trim();
        if (!originalBackupId) {
            throw new Error(`missing backupId from backup result: ${JSON.stringify(backupResult)}`);
        }
/**
 * 记录备份状态。
 */
        const backupState = await waitForJobSettled(token, String(backupResult?.job?.id ?? ''), 'backup');
        await assertBackupDownload(token, originalBackupId, requireBackupRecord(backupState, originalBackupId, 'manual backup'));
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
        await authedPostJson('/api/auth/gm/password', token, {
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
        const maintenanceSocketErrorCode = await expectNextSocketRejectedForMaintenance();
        if (maintenanceSocketErrorCode !== 'SERVER_BUSY') {
            throw new Error(`expected maintenance socket rejection code SERVER_BUSY, got ${maintenanceSocketErrorCode}`);
        }
/**
 * 记录令牌。
 */
        const token = await login(changedGmPassword);
        await corruptBackupChecksum(originalBackupId);
        await expectRestoreRejectedForInvalidBackup(token, originalBackupId);
        await restoreOriginalBackupFile(originalBackupId);
        await corruptBackupDocumentsCount(originalBackupId);
        await expectRestoreRejectedForInvalidDocumentsCount(token, originalBackupId);
        await restoreOriginalBackupFile(originalBackupId);
/**
 * 记录恢复结果。
 */
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
        const restoreState = await waitForRestoreSettledAfterPasswordRollback(restoreJobId);
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
        await waitForSuggestionAbsent(rollbackToken, postBackupSuggestionId);
        await waitForMailAbsent(playerId, postBackupMailId, mailPageTotalBaseline);
        await waitForMailSummary(playerId, (summary) => matchesMailSummary(summary, mailSummaryBaseline), 10000);
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
        await waitForSuggestionAbsent(token, postBackupSuggestionId);
        await waitForMailAbsent(playerId, postBackupMailId, mailPageTotalBaseline);
        await waitForMailSummary(playerId, (summary) => matchesMailSummary(summary, mailSummaryBaseline), 10000);
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
        cwd: packageRoot,
        env: {
            ...process.env,
            SERVER_NEXT_PORT: String(currentPort),
            SERVER_NEXT_DATABASE_URL: databaseUrl,
            SERVER_NEXT_RUNTIME_HTTP: '1',
            SERVER_NEXT_ALLOW_LEGACY_HTTP_COMPAT: '1',
            SERVER_NEXT_GM_DATABASE_BACKUP_DIR: backupDirectory,
            ...(options.maintenance
                ? { SERVER_NEXT_RUNTIME_MAINTENANCE: '1' }
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
/**
 * 记录客户端。
 */
    const client = new pg_1.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        await client.query('DELETE FROM persistent_documents WHERE scope = $1 AND key = $2', [
            'server_next_legacy_gm_auth_v1',
            'gm_auth',
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
/**
 * 停止服务端。
 */
async function stopServer(child) {
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
    const playerId = payload?.sub ? `p_${String(payload.sub).trim()}` : '';
    if (!accessToken || !playerId) {
        throw new Error(`unexpected player login payload: ${JSON.stringify(loginResult)}`);
    }
    return {
        accessToken,
        playerId,
    };
}
/**
 * 处理pickavailable显示信息名称。
 */
async function pickAvailableDisplayName() {
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
 * 断言备份download。
 */
async function assertBackupDownload(token, backupId, expectedRecord = null) {
/**
 * 记录expected文件名称。
 */
    const expectedFileName = String(expectedRecord?.fileName ?? `server-next-persistent-documents-${backupId}.json`).trim();
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
/**
 * 记录payload。
 */
    const payload = JSON.parse(await response.text());
    if (payload?.backupId !== backupId) {
        throw new Error(`expected downloaded backupId=${backupId}, got ${JSON.stringify(payload)}`);
    }
    if (payload?.kind !== 'server_next_persistent_documents_backup_v1') {
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
/**
 * 记录diskpayload。
 */
    const diskPayload = JSON.parse(await node_fs_1.promises.readFile(resolveBackupFilePath(backupId), 'utf8'));
    if (computeChecksumForDocs(diskPayload?.docs ?? []) !== downloadedChecksum) {
        throw new Error(`expected downloaded backup checksum to match on-disk backup for ${backupId}`);
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
    }
}
/**
 * 处理expect恢复rejectedwithoutmaintenance。
 */
async function expectRestoreRejectedWithoutMaintenance(token, backupId) {
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
async function expectNextSocketRejectedForMaintenance() {
/**
 * 记录socket。
 */
    const socket = (0, socket_io_client_1.io)(baseUrl, {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        auth: {
            protocol: 'next',
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
        socket.on(shared_next_1.NEXT_S2C.Error, (payload) => {
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
    }, 15000);
}
/**
 * 等待for恢复settledafterpasswordrollback。
 */
async function waitForRestoreSettledAfterPasswordRollback(jobId) {
    return waitForCondition(async () => {
/**
 * 记录令牌。
 */
        let token = '';
        try {
            token = await login(gmPassword);
        }
        catch {
            return false;
        }
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
        if (state.lastJob?.type !== 'restore' || state.lastJob?.status !== 'completed' || state.lastJob?.phase !== 'completed') {
            throw new Error(`expected completed restore lastJob, got ${JSON.stringify(state.lastJob)}`);
        }
        return state;
    }, 15000);
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
async function corruptBackupChecksum(backupId) {
/**
 * 记录文件路径。
 */
    const filePath = resolveBackupFilePath(backupId);
/**
 * 记录raw。
 */
    const raw = await node_fs_1.promises.readFile(filePath, 'utf8');
/**
 * 记录parsed。
 */
    const parsed = JSON.parse(raw);
    parsed.checksumSha256 = 'broken-checksum';
    await node_fs_1.promises.writeFile(filePath, JSON.stringify(parsed, null, 2), 'utf8');
}
/**
 * 处理corrupt备份documents数量。
 */
async function corruptBackupDocumentsCount(backupId) {
/**
 * 记录文件路径。
 */
    const filePath = resolveBackupFilePath(backupId);
/**
 * 记录raw。
 */
    const raw = await node_fs_1.promises.readFile(filePath, 'utf8');
/**
 * 记录parsed。
 */
    const parsed = JSON.parse(raw);
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
async function restoreOriginalBackupFile(backupId) {
/**
 * 记录文件路径。
 */
    const filePath = resolveBackupFilePath(backupId);
/**
 * 记录raw。
 */
    const raw = await node_fs_1.promises.readFile(filePath, 'utf8');
/**
 * 记录parsed。
 */
    const parsed = JSON.parse(raw);
    parsed.documentsCount = Array.isArray(parsed?.docs) ? parsed.docs.length : 0;
    parsed.checksumSha256 = computeChecksumForDocs(parsed.docs ?? []);
    await node_fs_1.promises.writeFile(filePath, JSON.stringify(parsed, null, 2), 'utf8');
}
/**
 * 解析备份文件路径。
 */
function resolveBackupFilePath(backupId) {
    return (0, node_path_1.join)(backupDirectory, `server-next-persistent-documents-${backupId}.json`);
}
/**
 * 处理computechecksumfordocs。
 */
function computeChecksumForDocs(docs) {
    const crypto = require('node:crypto');
    return crypto.createHash('sha256').update(JSON.stringify(docs)).digest('hex');
}
/**
 * 等待forcondition。
 */
async function waitForCondition(predicate, timeoutMs) {
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
        await delay(100);
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
    if (!playerId) {
        return;
    }
/**
 * 记录response。
 */
    const response = await fetch(`${baseUrl}/runtime/players/${playerId}`, {
        method: 'DELETE',
    });
    if (!response.ok && response.status !== 404) {
        throw new Error(`delete player failed: ${response.status} ${await response.text()}`);
    }
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
});

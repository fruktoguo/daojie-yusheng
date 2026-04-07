"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_net_1 = require("node:net");
const node_path_1 = require("node:path");
const socket_io_client_1 = require("socket.io-client");
const shared_next_1 = require("@mud/shared-next");
const pg_1 = require("pg");
const env_alias_1 = require("../config/env-alias");
const packageRoot = (0, node_path_1.resolve)(__dirname, '..', '..');
const serverEntry = (0, node_path_1.join)(packageRoot, 'dist', 'main.js');
const databaseUrl = (0, env_alias_1.resolveServerNextDatabaseUrl)();
const gmPassword = (0, env_alias_1.resolveServerNextGmPassword)('admin123');
const changedGmPassword = `gm-smoke-${Date.now().toString(36)}-changed`;
const backupDirectory = (0, node_path_1.join)(packageRoot, '.runtime', `gm-database-smoke-${Date.now().toString(36)}`);
const playerSuffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const accountName = `gdb_${playerSuffix.slice(-10)}`;
const playerPassword = `Pass_${playerSuffix}`;
const roleName = `归档${playerSuffix.slice(-4)}`;
const displayNameSeed = Number.parseInt(playerSuffix.slice(-6), 36) || Date.now();
let currentPort = Number(process.env.SERVER_NEXT_SMOKE_PORT ?? 3212);
let baseUrl = `http://127.0.0.1:${currentPort}`;
async function main() {
    if (!databaseUrl.trim()) {
        console.log(JSON.stringify({ ok: true, skipped: true, reason: 'SERVER_NEXT_DATABASE_URL/DATABASE_URL missing' }, null, 2));
        return;
    }
    await resetGmAuthPasswordRecord();
    await node_fs_1.promises.mkdir(backupDirectory, { recursive: true });
    let originalBackupId = '';
    let checkpointBackupId = '';
    let playerId = '';
    let postBackupSuggestionId = '';
    let postBackupMailId = '';
    let mailSummaryBaseline = null;
    let mailPageTotalBaseline = 0;
    let interruptedRestoreJobId = '';
    let interruptedRestoreObservedPhase = '';
    let interruptedRestoreCheckpointBackupId = '';
    let interruptedRestoreLastJob = null;
    let server = await startServer({ maintenance: false });
    try {
        await waitForHealth({ expectedStatus: 200, expectMaintenance: false });
        const token = await login(gmPassword);
        const playerAuth = await registerAndLoginPlayer();
        playerId = playerAuth.playerId;
        const backupResult = await triggerBackupWithConcurrentRejection(token);
        originalBackupId = String(backupResult?.job?.backupId ?? '').trim();
        if (!originalBackupId) {
            throw new Error(`missing backupId from backup result: ${JSON.stringify(backupResult)}`);
        }
        const backupState = await waitForJobSettled(token, String(backupResult?.job?.id ?? ''), 'backup');
        await assertBackupDownload(token, originalBackupId, requireBackupRecord(backupState, originalBackupId, 'manual backup'));
        postBackupSuggestionId = await createSuggestion(playerId, {
            title: `restore-suggestion-${playerSuffix.slice(-6)}`,
            description: `post-backup suggestion ${playerSuffix}`,
        });
        await waitForSuggestionPresent(token, postBackupSuggestionId);
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
        await authedPostJson('/auth/gm/password', token, {
            currentPassword: gmPassword,
            newPassword: changedGmPassword,
        });
        const changedToken = await login(changedGmPassword);
        await expectRestoreRejectedWithoutMaintenance(changedToken, originalBackupId);
    }
    finally {
        await stopServer(server);
    }
    server = await startServer({ maintenance: true });
    try {
        await waitForHealth({ expectedStatus: 503, expectMaintenance: true });
        const maintenanceSocketErrorCode = await expectNextSocketRejectedForMaintenance();
        if (maintenanceSocketErrorCode !== 'SERVER_BUSY') {
            throw new Error(`expected maintenance socket rejection code SERVER_BUSY, got ${maintenanceSocketErrorCode}`);
        }
        const token = await login(changedGmPassword);
        await corruptBackupChecksum(originalBackupId);
        await expectRestoreRejectedForInvalidBackup(token, originalBackupId);
        await restoreOriginalBackupFile(originalBackupId);
        await corruptBackupDocumentsCount(originalBackupId);
        await expectRestoreRejectedForInvalidDocumentsCount(token, originalBackupId);
        await restoreOriginalBackupFile(originalBackupId);
        const restoreResult = await triggerRestoreWithConcurrentRejection(token, {
            backupId: originalBackupId,
        });
        const restoreJobId = String(restoreResult?.job?.id ?? '').trim();
        if (!restoreJobId) {
            throw new Error(`missing restore job id: ${JSON.stringify(restoreResult)}`);
        }
        const restoreState = await waitForRestoreSettledAfterPasswordRollback(restoreJobId);
        checkpointBackupId = String(restoreState.lastJob?.checkpointBackupId ?? '').trim();
        if (!checkpointBackupId) {
            throw new Error(`expected checkpointBackupId in restore lastJob: ${JSON.stringify(restoreState.lastJob)}`);
        }
        const backupIds = new Set((restoreState.backups ?? []).map((entry) => String(entry?.id ?? '').trim()).filter((entry) => entry.length > 0));
        if (!backupIds.has(originalBackupId) || !backupIds.has(checkpointBackupId)) {
            throw new Error(`expected backups to include original and checkpoint ids, got ${JSON.stringify(restoreState.backups)}`);
        }
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
        const token = await login(gmPassword);
        const finalState = await authedGetJson('/gm/database/state', token);
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
        const token = await login(gmPassword);
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
async function startServer(options) {
    currentPort = await allocateFreePort();
    baseUrl = `http://127.0.0.1:${currentPort}`;
    const child = (0, node_child_process_1.spawn)('node', [serverEntry], {
        cwd: packageRoot,
        env: {
            ...process.env,
            SERVER_NEXT_PORT: String(currentPort),
            SERVER_NEXT_DATABASE_URL: databaseUrl,
            SERVER_NEXT_RUNTIME_HTTP: '1',
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
async function resetGmAuthPasswordRecord() {
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
async function stopServer(child) {
    if (!child) {
        return;
    }
    if (child.killed || child.exitCode !== null) {
        return;
    }
    child.kill('SIGINT');
    await new Promise((resolve) => {
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
async function stopServerHard(child) {
    if (!child) {
        return;
    }
    if (child.killed || child.exitCode !== null) {
        return;
    }
    child.kill('SIGKILL');
    await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(), 2000);
        child.once('exit', () => {
            clearTimeout(timer);
            resolve();
        });
    });
}
async function waitForHealth(options) {
    await waitForCondition(async () => {
        try {
            const response = await fetch(`${baseUrl}/health`);
            if (response.status !== options.expectedStatus) {
                return false;
            }
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
async function login(password) {
    const response = await fetch(`${baseUrl}/auth/gm/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
    });
    if (!response.ok) {
        throw new Error(`gm login failed: ${response.status} ${await response.text()}`);
    }
    const body = await response.json();
    const token = String(body?.accessToken ?? '').trim();
    if (!token) {
        throw new Error(`gm login missing accessToken: ${JSON.stringify(body)}`);
    }
    return token;
}
async function expectLoginFailure(password) {
    const response = await fetch(`${baseUrl}/auth/gm/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
    });
    if (response.ok) {
        throw new Error(`expected gm login to fail for password=${password}`);
    }
}
async function registerAndLoginPlayer() {
    const displayName = await pickAvailableDisplayName();
    await requestJson('/auth/register', {
        method: 'POST',
        body: {
            accountName,
            password: playerPassword,
            displayName,
            roleName,
        },
    });
    const loginResult = await requestJson('/auth/login', {
        method: 'POST',
        body: {
            loginName: accountName,
            password: playerPassword,
        },
    });
    const accessToken = String(loginResult?.accessToken ?? '').trim();
    const payload = parseJwtPayload(accessToken);
    const playerId = payload?.sub ? `p_${String(payload.sub).trim()}` : '';
    if (!accessToken || !playerId) {
        throw new Error(`unexpected player login payload: ${JSON.stringify(loginResult)}`);
    }
    return {
        accessToken,
        playerId,
    };
}
async function pickAvailableDisplayName() {
    const rangeStart = 0x4E00;
    const rangeSize = 0x9FFF - rangeStart + 1;
    for (let index = 0; index < 512; index += 1) {
        const codePoint = rangeStart + ((displayNameSeed + index * 131) % rangeSize);
        const candidate = String.fromCodePoint(codePoint);
        const payload = await requestJson(`/auth/display-name/check?displayName=${encodeURIComponent(candidate)}`, {
            method: 'GET',
        });
        if (payload?.available === true) {
            return candidate;
        }
    }
    throw new Error('failed to allocate unique single-character displayName for gm-database smoke');
}
async function authedGetJson(path, token) {
    const response = await fetch(`${baseUrl}${path}`, {
        headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
        throw new Error(`request failed: GET ${path} -> ${response.status} ${await response.text()}`);
    }
    return response.json();
}
async function requestJson(path, init = {}) {
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
async function authedPostJson(path, token, body) {
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
async function createSuggestion(playerId, body) {
    const payload = await requestJson(`/runtime/players/${playerId}/suggestions`, {
        method: 'POST',
        body,
    });
    const suggestionId = String(payload?.suggestion?.id ?? '').trim();
    if (!suggestionId) {
        throw new Error(`unexpected suggestion create payload: ${JSON.stringify(payload)}`);
    }
    return suggestionId;
}
async function createDirectMail(token, playerId, body) {
    const payload = await authedPostJson(`/gm/players/${playerId}/mail`, token, body);
    const mailId = String(payload?.mailId ?? '').trim();
    if (!mailId) {
        throw new Error(`unexpected direct mail payload: ${JSON.stringify(payload)}`);
    }
    return mailId;
}
async function fetchMailSummary(playerId) {
    const payload = await requestJson(`/runtime/players/${playerId}/mail/summary`, {
        method: 'GET',
    });
    return payload?.summary ?? null;
}
async function fetchMailPage(playerId) {
    const payload = await requestJson(`/runtime/players/${playerId}/mail/page?page=1&pageSize=50`, {
        method: 'GET',
    });
    return payload?.page ?? null;
}
async function fetchMailDetail(playerId, mailId) {
    const payload = await requestJson(`/runtime/players/${playerId}/mail/${encodeURIComponent(mailId)}`, {
        method: 'GET',
    });
    return payload?.detail ?? null;
}
async function waitForMailSummary(playerId, predicate, timeoutMs) {
    let resolved = null;
    await waitForCondition(async () => {
        const summary = await fetchMailSummary(playerId);
        if (!summary || !(await predicate(summary))) {
            return false;
        }
        resolved = summary;
        return true;
    }, timeoutMs);
    return resolved;
}
async function waitForMailDetail(playerId, mailId, predicate, timeoutMs) {
    let resolved = null;
    await waitForCondition(async () => {
        const detail = await fetchMailDetail(playerId, mailId);
        if (!(await predicate(detail))) {
            return false;
        }
        resolved = detail;
        return true;
    }, timeoutMs);
    return resolved;
}
async function waitForMailPresent(playerId, mailId, expectedTotal) {
    await waitForCondition(async () => {
        const [detail, page] = await Promise.all([
            fetchMailDetail(playerId, mailId),
            fetchMailPage(playerId),
        ]);
        return detail !== null && Number(page?.total ?? 0) === expectedTotal;
    }, 10000);
}
async function waitForMailAbsent(playerId, mailId, expectedTotal) {
    await waitForCondition(async () => {
        const [detail, page] = await Promise.all([
            fetchMailDetail(playerId, mailId),
            fetchMailPage(playerId),
        ]);
        return detail === null && Number(page?.total ?? 0) === expectedTotal;
    }, 10000);
}
function matchesMailSummary(summary, baseline) {
    if (!summary || !baseline) {
        return false;
    }
    return Number(summary.unreadCount ?? 0) === Number(baseline.unreadCount ?? 0)
        && Number(summary.claimableCount ?? 0) === Number(baseline.claimableCount ?? 0)
        && Number(summary.revision ?? 0) === Number(baseline.revision ?? 0);
}
async function waitForSuggestionPresent(token, suggestionId) {
    await waitForCondition(async () => {
        const payload = await authedGetJson('/gm/suggestions?page=1&pageSize=50', token);
        return findSuggestion(payload, suggestionId) !== null;
    }, 10000);
}
async function waitForSuggestionAbsent(token, suggestionId) {
    await waitForCondition(async () => {
        const payload = await authedGetJson('/gm/suggestions?page=1&pageSize=50', token);
        return findSuggestion(payload, suggestionId) === null;
    }, 10000);
}
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
async function triggerBackupWithConcurrentRejection(token) {
    const [primary, secondary] = await Promise.all([
        authedPost('/gm/database/backup', token, {}),
        authedPost('/gm/database/backup', token, {}),
    ]);
    return pickAcceptedJobAndAssertConcurrentRejection([primary, secondary], 'backup');
}
async function triggerRestoreWithConcurrentRejection(token, body) {
    const [primary, secondary] = await Promise.all([
        authedPost('/gm/database/restore', token, body),
        authedPost('/gm/database/restore', token, body),
    ]);
    return pickAcceptedJobAndAssertConcurrentRejection([primary, secondary], 'restore');
}
async function triggerRestore(token, body) {
    const response = await authedPost('/gm/database/restore', token, body);
    if (!response.ok) {
        throw new Error(`request failed: POST /gm/database/restore -> ${response.status} ${await response.text()}`);
    }
    return response.json();
}
async function pickAcceptedJobAndAssertConcurrentRejection(responses, jobType) {
    const accepted = [];
    const rejected = [];
    for (const response of responses) {
        if (response.ok) {
            accepted.push(response);
            continue;
        }
        rejected.push(response);
    }
    if (accepted.length !== 1 || rejected.length !== 1) {
        const details = await Promise.all(responses.map(async (response) => ({
            status: response.status,
            body: await response.text(),
        })));
        throw new Error(`expected exactly one accepted and one rejected concurrent ${jobType} request, got ${JSON.stringify(details)}`);
    }
    await assertConcurrentDatabaseJobRejected(rejected[0], jobType);
    return accepted[0].json();
}
async function assertConcurrentDatabaseJobRejected(response, jobType) {
    const text = await response.text();
    if (response.status !== 400) {
        throw new Error(`expected concurrent ${jobType} rejection with 400, got ${response.status} ${text}`);
    }
    if (!text.includes('当前已有数据库任务执行中')) {
        throw new Error(`expected concurrent ${jobType} rejection to mention running database job, got ${text}`);
    }
}
function findSuggestion(payload, suggestionId) {
    return Array.isArray(payload?.items)
        ? payload.items.find((entry) => String(entry?.id ?? '').trim() === suggestionId) ?? null
        : null;
}
function requireBackupRecord(state, backupId, label) {
    const record = (state?.backups ?? []).find((entry) => String(entry?.id ?? '').trim() === backupId);
    if (!record) {
        throw new Error(`missing ${label} metadata for backupId=${backupId}: ${JSON.stringify(state?.backups ?? [])}`);
    }
    return record;
}
function parseJwtPayload(token) {
    if (typeof token !== 'string') {
        return null;
    }
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
async function assertBackupDownload(token, backupId, expectedRecord = null) {
    const expectedFileName = String(expectedRecord?.fileName ?? `server-next-persistent-documents-${backupId}.json`).trim();
    const response = await fetch(`${baseUrl}/gm/database/backups/${backupId}/download`, {
        headers: {
            authorization: `Bearer ${token}`,
        },
    });
    if (!response.ok) {
        throw new Error(`request failed: GET /gm/database/backups/${backupId}/download -> ${response.status} ${await response.text()}`);
    }
    const contentDisposition = response.headers.get('content-disposition') ?? '';
    if (!contentDisposition.includes(expectedFileName)) {
        throw new Error(`expected content-disposition to include ${expectedFileName}, got ${contentDisposition || '<empty>'}`);
    }
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
    const downloadedChecksum = computeChecksumForDocs(payload.docs);
    if (payload.checksumSha256 !== downloadedChecksum) {
        throw new Error(`expected downloaded checksumSha256=${downloadedChecksum}, got ${payload.checksumSha256}`);
    }
    const diskPayload = JSON.parse(await node_fs_1.promises.readFile(resolveBackupFilePath(backupId), 'utf8'));
    if (computeChecksumForDocs(diskPayload?.docs ?? []) !== downloadedChecksum) {
        throw new Error(`expected downloaded backup checksum to match on-disk backup for ${backupId}`);
    }
    if (expectedRecord) {
        const expectedDocumentsCount = Number(expectedRecord?.documentsCount);
        const expectedChecksum = String(expectedRecord?.checksumSha256 ?? '').trim();
        if (Number.isFinite(expectedDocumentsCount) && expectedDocumentsCount !== payload.documentsCount) {
            throw new Error(`expected metadata documentsCount=${expectedDocumentsCount}, got ${payload.documentsCount}`);
        }
        if (expectedChecksum && expectedChecksum !== payload.checksumSha256) {
            throw new Error(`expected metadata checksumSha256=${expectedChecksum}, got ${payload.checksumSha256}`);
        }
    }
}
async function expectRestoreRejectedWithoutMaintenance(token, backupId) {
    const response = await fetch(`${baseUrl}/gm/database/restore`, {
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
    const text = await response.text();
    if (!text.includes('维护态')) {
        throw new Error(`expected restore rejection to mention maintenance, got ${text}`);
    }
}
async function expectRestoreRejectedForInvalidBackup(token, backupId) {
    const response = await fetch(`${baseUrl}/gm/database/restore`, {
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
    const text = await response.text();
    if (!text.includes('checksumSha256')) {
        throw new Error(`expected invalid backup rejection to mention checksumSha256, got ${text}`);
    }
}
async function expectRestoreRejectedForInvalidDocumentsCount(token, backupId) {
    const response = await fetch(`${baseUrl}/gm/database/restore`, {
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
    const text = await response.text();
    if (!text.includes('documentsCount')) {
        throw new Error(`expected invalid documentsCount rejection to mention documentsCount, got ${text}`);
    }
}
async function expectNextSocketRejectedForMaintenance() {
    const socket = (0, socket_io_client_1.io)(baseUrl, {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        auth: {
            protocol: 'next',
        },
    });
    let errorPayload = null;
    let disconnected = false;
    try {
        socket.on(shared_next_1.NEXT_S2C.Error, (payload) => {
            errorPayload = payload;
        });
        socket.on('disconnect', () => {
            disconnected = true;
        });
        await onceConnected(socket);
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
async function waitForJobSettled(token, jobId, type) {
    return waitForCondition(async () => {
        const state = await authedGetJson('/gm/database/state', token);
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
async function waitForRestoreSettledAfterPasswordRollback(jobId) {
    return waitForCondition(async () => {
        let token = '';
        try {
            token = await login(gmPassword);
        }
        catch {
            return false;
        }
        const state = await authedGetJson('/gm/database/state', token);
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
async function waitForRestoreRunning(token, jobId) {
    return waitForCondition(async () => {
        const state = await authedGetJson('/gm/database/state', token);
        if (state.runningJob?.id === jobId) {
            if (state.runningJob?.type !== 'restore' || state.runningJob?.status !== 'running') {
                throw new Error(`expected running restore job, got ${JSON.stringify(state.runningJob)}`);
            }
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
async function triggerInterruptedRestoreAndStopServer(server, token, body) {
    const restoreResult = await triggerRestore(token, body);
    const jobId = String(restoreResult?.job?.id ?? '').trim();
    if (!jobId) {
        throw new Error(`missing interrupted restore job id: ${JSON.stringify(restoreResult)}`);
    }
    const runningJob = await waitForRestoreRunning(token, jobId);
    await stopServerHard(server);
    return {
        jobId,
        observedPhase: String(runningJob?.phase ?? '').trim(),
        checkpointBackupId: String(runningJob?.checkpointBackupId ?? '').trim(),
    };
}
async function assertInterruptedRestoreFailedAfterRestart(token, input) {
    const state = await authedGetJson('/gm/database/state', token);
    if (state.runningJob) {
        throw new Error(`expected no runningJob after interrupted restore restart, got ${JSON.stringify(state.runningJob)}`);
    }
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
    const errorText = String(lastJob?.error ?? '');
    if (!errorText.includes('服务重启导致数据库任务在阶段')) {
        throw new Error(`expected interrupted restore error to mention restart interruption, got ${JSON.stringify(lastJob)}`);
    }
    const failedPhase = String(lastJob?.phase ?? '').trim();
    if (failedPhase && !errorText.includes(failedPhase)) {
        throw new Error(`expected interrupted restore error to include failed phase ${failedPhase}, got ${JSON.stringify(lastJob)}`);
    }
    if (input.observedPhase && (!failedPhase || failedPhase === input.observedPhase) && !errorText.includes(input.observedPhase)) {
        throw new Error(`expected interrupted restore error to include observed phase ${input.observedPhase}, got ${JSON.stringify(lastJob)}`);
    }
    return lastJob;
}
async function corruptBackupChecksum(backupId) {
    const filePath = resolveBackupFilePath(backupId);
    const raw = await node_fs_1.promises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    parsed.checksumSha256 = 'broken-checksum';
    await node_fs_1.promises.writeFile(filePath, JSON.stringify(parsed, null, 2), 'utf8');
}
async function corruptBackupDocumentsCount(backupId) {
    const filePath = resolveBackupFilePath(backupId);
    const raw = await node_fs_1.promises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const currentCount = Number(parsed?.documentsCount);
    const normalizedCount = Number.isFinite(currentCount)
        ? Math.trunc(currentCount)
        : Array.isArray(parsed?.docs) ? parsed.docs.length : 0;
    parsed.documentsCount = normalizedCount + 1;
    await node_fs_1.promises.writeFile(filePath, JSON.stringify(parsed, null, 2), 'utf8');
}
async function restoreOriginalBackupFile(backupId) {
    const filePath = resolveBackupFilePath(backupId);
    const raw = await node_fs_1.promises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    parsed.documentsCount = Array.isArray(parsed?.docs) ? parsed.docs.length : 0;
    parsed.checksumSha256 = computeChecksumForDocs(parsed.docs ?? []);
    await node_fs_1.promises.writeFile(filePath, JSON.stringify(parsed, null, 2), 'utf8');
}
function resolveBackupFilePath(backupId) {
    return (0, node_path_1.join)(backupDirectory, `server-next-persistent-documents-${backupId}.json`);
}
function computeChecksumForDocs(docs) {
    const crypto = require('node:crypto');
    return crypto.createHash('sha256').update(JSON.stringify(docs)).digest('hex');
}
async function waitForCondition(predicate, timeoutMs) {
    const startedAt = Date.now();
    while (true) {
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
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function onceConnected(socket) {
    if (socket.connected) {
        return;
    }
    await new Promise((resolve, reject) => {
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
async function deletePlayer(playerId) {
    if (!playerId) {
        return;
    }
    const response = await fetch(`${baseUrl}/runtime/players/${playerId}`, {
        method: 'DELETE',
    });
    if (!response.ok && response.status !== 404) {
        throw new Error(`delete player failed: ${response.status} ${await response.text()}`);
    }
}
async function allocateFreePort() {
    return new Promise((resolve, reject) => {
        const server = (0, node_net_1.createServer)();
        server.unref();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
                server.close(() => reject(new Error('failed to allocate free port')));
                return;
            }
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

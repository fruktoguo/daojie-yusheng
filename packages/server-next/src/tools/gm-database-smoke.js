"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_net_1 = require("node:net");
const node_path_1 = require("node:path");
const pg_1 = require("pg");
const packageRoot = (0, node_path_1.resolve)(__dirname, '..', '..');
const serverEntry = (0, node_path_1.join)(packageRoot, 'dist', 'main.js');
const databaseUrl = process.env.SERVER_NEXT_DATABASE_URL ?? '';
const gmPassword = process.env.SERVER_NEXT_GM_PASSWORD?.trim()
    || 'admin123';
const changedGmPassword = `gm-smoke-${Date.now().toString(36)}-changed`;
const backupDirectory = (0, node_path_1.join)(packageRoot, '.runtime', `gm-database-smoke-${Date.now().toString(36)}`);
let currentPort = Number(process.env.SERVER_NEXT_SMOKE_PORT ?? 3212);
let baseUrl = `http://127.0.0.1:${currentPort}`;
async function main() {
    if (!databaseUrl.trim()) {
        console.log(JSON.stringify({ ok: true, skipped: true, reason: 'SERVER_NEXT_DATABASE_URL missing' }, null, 2));
        return;
    }
    await resetGmAuthPasswordRecord();
    await node_fs_1.promises.mkdir(backupDirectory, { recursive: true });
    let originalBackupId = '';
    let checkpointBackupId = '';
    let server = await startServer({ maintenance: false });
    try {
        await waitForHealth({ expectedStatus: 200, expectMaintenance: false });
        const token = await login(gmPassword);
        const backupResult = await authedPostJson('/gm/database/backup', token, {});
        originalBackupId = String(backupResult?.job?.backupId ?? '').trim();
        if (!originalBackupId) {
            throw new Error(`missing backupId from backup result: ${JSON.stringify(backupResult)}`);
        }
        await waitForJobSettled(token, String(backupResult?.job?.id ?? ''), 'backup');
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
        const token = await login(changedGmPassword);
        await corruptBackupChecksum(originalBackupId);
        await expectRestoreRejectedForInvalidBackup(token, originalBackupId);
        await restoreOriginalBackupFile(originalBackupId);
        const restoreResult = await authedPostJson('/gm/database/restore', token, {
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
        console.log(JSON.stringify({
            ok: true,
            originalBackupId,
            checkpointBackupId,
            lastJob: finalState.lastJob,
        }, null, 2));
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
async function authedGetJson(path, token) {
    const response = await fetch(`${baseUrl}${path}`, {
        headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
        throw new Error(`request failed: GET ${path} -> ${response.status} ${await response.text()}`);
    }
    return response.json();
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
async function corruptBackupChecksum(backupId) {
    const filePath = resolveBackupFilePath(backupId);
    const raw = await node_fs_1.promises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    parsed.checksumSha256 = 'broken-checksum';
    await node_fs_1.promises.writeFile(filePath, JSON.stringify(parsed, null, 2), 'utf8');
}
async function restoreOriginalBackupFile(backupId) {
    const filePath = resolveBackupFilePath(backupId);
    const raw = await node_fs_1.promises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
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

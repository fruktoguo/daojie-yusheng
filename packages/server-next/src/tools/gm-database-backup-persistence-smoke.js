"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_net_1 = require("node:net");
const node_path_1 = require("node:path");
const pg_1 = require("pg");
const env_alias_1 = require("../config/env-alias");
const gm_database_proof_lib_1 = require("./gm-database-proof-lib");
const packageRoot = (0, node_path_1.resolve)(__dirname, '..', '..');
const serverEntry = (0, node_path_1.join)(packageRoot, 'dist', 'main.js');
const databaseUrl = (0, env_alias_1.resolveServerNextDatabaseUrl)();
const gmPassword = (0, env_alias_1.resolveServerNextGmPassword)('admin123');
const backupDirectory = (0, node_path_1.join)(packageRoot, '.runtime', `gm-database-backup-persistence-${Date.now().toString(36)}`);
let currentPort = Number(process.env.SERVER_NEXT_SMOKE_PORT ?? 3212);
let baseUrl = `http://127.0.0.1:${currentPort}`;
async function main() {
    if (!databaseUrl.trim()) {
        console.log(JSON.stringify({ ok: true, skipped: true, reason: 'SERVER_NEXT_DATABASE_URL/DATABASE_URL missing' }, null, 2));
        return;
    }
    await resetGmAuthPasswordRecord();
    await node_fs_1.promises.mkdir(backupDirectory, { recursive: true });
    let server = await startServer();
    let originalBackupId = '';
    let backupJobId = '';
    try {
        await (0, gm_database_proof_lib_1.waitForHealth)(baseUrl, {
            expectedStatus: 200,
            expectMaintenance: false,
        });
        const token = await (0, gm_database_proof_lib_1.loginGm)(baseUrl, gmPassword);
        const backupResult = await (0, gm_database_proof_lib_1.triggerBackup)(baseUrl, token);
        originalBackupId = String(backupResult?.job?.backupId ?? '').trim();
        backupJobId = String(backupResult?.job?.id ?? '').trim();
        if (!originalBackupId || !backupJobId) {
            throw new Error(`missing backup job identity: ${JSON.stringify(backupResult)}`);
        }
        const backupState = await (0, gm_database_proof_lib_1.waitForJobSettled)(baseUrl, token, backupJobId, 'backup');
        const backupRecord = (0, gm_database_proof_lib_1.requireBackupRecord)(backupState, originalBackupId, 'backup persistence smoke');
        await (0, gm_database_proof_lib_1.assertBackupDownload)(baseUrl, token, originalBackupId, backupRecord, {
            expectedFilePath: (0, gm_database_proof_lib_1.buildBackupFilePath)(backupDirectory, originalBackupId),
        });
    }
    finally {
        await stopServer(server);
    }
    server = await startServer();
    try {
        await (0, gm_database_proof_lib_1.waitForHealth)(baseUrl, {
            expectedStatus: 200,
            expectMaintenance: false,
        });
        const token = await (0, gm_database_proof_lib_1.loginGm)(baseUrl, gmPassword);
        const persistedState = await (0, gm_database_proof_lib_1.authedGetJson)(baseUrl, '/gm/database/state', token);
        if (persistedState.runningJob) {
            throw new Error(`expected no running job after restart, got ${JSON.stringify(persistedState.runningJob)}`);
        }
        if (persistedState.lastJob?.id !== backupJobId || persistedState.lastJob?.type !== 'backup') {
            throw new Error(`expected persisted lastJob to be backup ${backupJobId}, got ${JSON.stringify(persistedState.lastJob)}`);
        }
        if (persistedState.lastJob?.status !== 'completed' || persistedState.lastJob?.phase !== 'completed') {
            throw new Error(`expected persisted lastJob completed, got ${JSON.stringify(persistedState.lastJob)}`);
        }
        const persistedRecord = (0, gm_database_proof_lib_1.requireBackupRecord)(persistedState, originalBackupId, 'persisted backup after restart');
        await (0, gm_database_proof_lib_1.assertBackupDownload)(baseUrl, token, originalBackupId, persistedRecord, {
            expectedFilePath: (0, gm_database_proof_lib_1.buildBackupFilePath)(backupDirectory, originalBackupId),
        });
        console.log(JSON.stringify({
            ok: true,
            backupDirectory,
            backupId: originalBackupId,
            lastJob: {
                id: persistedState.lastJob?.id ?? null,
                type: persistedState.lastJob?.type ?? null,
                status: persistedState.lastJob?.status ?? null,
                phase: persistedState.lastJob?.phase ?? null,
                finishedAt: persistedState.lastJob?.finishedAt ?? null,
            },
            proof: 'same backup directory survives process rebuild and still serves download/state metadata',
        }, null, 2));
    }
    finally {
        await stopServer(server);
        await node_fs_1.promises.rm(backupDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
}
async function startServer() {
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
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (chunk) => process.stdout.write(String(chunk)));
    child.stderr?.on('data', (chunk) => process.stderr.write(String(chunk)));
    return child;
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
async function allocateFreePort() {
    return new Promise((resolve, reject) => {
        const server = (0, node_net_1.createServer)();
        server.unref();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const port = typeof address === 'object' && address ? address.port : 0;
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

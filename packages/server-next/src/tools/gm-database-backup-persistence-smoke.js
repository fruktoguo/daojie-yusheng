"use strict";
/**
 * 用途：执行 gm-database-backup-persistence 链路的冒烟验证。
 */

Object.defineProperty(exports, "__esModule", { value: true });
/** smoke_timeout_1：定义该变量以承载业务值。 */
const smoke_timeout_1 = require("./smoke-timeout");
(0, smoke_timeout_1.installSmokeTimeout)(__filename);
/** node_child_process_1：定义该变量以承载业务值。 */
const node_child_process_1 = require("node:child_process");
/** node_fs_1：定义该变量以承载业务值。 */
const node_fs_1 = require("node:fs");
/** node_net_1：定义该变量以承载业务值。 */
const node_net_1 = require("node:net");
/** node_path_1：定义该变量以承载业务值。 */
const node_path_1 = require("node:path");
/** pg_1：定义该变量以承载业务值。 */
const pg_1 = require("pg");
/** env_alias_1：定义该变量以承载业务值。 */
const env_alias_1 = require("../config/env-alias");
/** gm_database_proof_lib_1：定义该变量以承载业务值。 */
const gm_database_proof_lib_1 = require("./gm-database-proof-lib");
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
 * 记录备份directory。
 */
const backupDirectory = (0, node_path_1.join)(packageRoot, '.runtime', `gm-database-backup-persistence-${Date.now().toString(36)}`);
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
 * 记录服务端。
 */
    let server = await startServer();
/**
 * 记录original备份ID。
 */
    let originalBackupId = '';
/**
 * 记录备份jobID。
 */
    let backupJobId = '';
    try {
        await (0, gm_database_proof_lib_1.waitForHealth)(baseUrl, {
            expectedStatus: 200,
            expectMaintenance: false,
        });
/**
 * 记录令牌。
 */
        const token = await (0, gm_database_proof_lib_1.loginGm)(baseUrl, gmPassword);
/**
 * 记录备份结果。
 */
        const backupResult = await (0, gm_database_proof_lib_1.triggerBackup)(baseUrl, token);
        originalBackupId = String(backupResult?.job?.backupId ?? '').trim();
        backupJobId = String(backupResult?.job?.id ?? '').trim();
        if (!originalBackupId || !backupJobId) {
            throw new Error(`missing backup job identity: ${JSON.stringify(backupResult)}`);
        }
/**
 * 记录备份状态。
 */
        const backupState = await (0, gm_database_proof_lib_1.waitForJobSettled)(baseUrl, token, backupJobId, 'backup');
/**
 * 记录备份record。
 */
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
/**
 * 记录令牌。
 */
        const token = await (0, gm_database_proof_lib_1.loginGm)(baseUrl, gmPassword);
/**
 * 记录persisted状态。
 */
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
/**
 * 记录persistedrecord。
 */
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
/**
 * 启动服务端。
 */
async function startServer() {
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
            SERVER_NEXT_GM_DATABASE_BACKUP_DIR: backupDirectory,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (chunk) => process.stdout.write(String(chunk)));
    child.stderr?.on('data', (chunk) => process.stderr.write(String(chunk)));
    return child;
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
/**
 * 记录端口。
 */
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

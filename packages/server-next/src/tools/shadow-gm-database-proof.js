"use strict";
/**
 * 用途：执行 shadow 环境下的 GM 数据库破坏性 proof 验证。
 */

Object.defineProperty(exports, "__esModule", { value: true });
const env_alias_1 = require("../config/env-alias");
const gm_database_proof_lib_1 = require("./gm-database-proof-lib");
/**
 * 记录服务端地址。
 */
const serverUrl = (0, env_alias_1.resolveServerNextShadowUrl)() || 'http://127.0.0.1:11923';
/**
 * 记录GMpassword。
 */
const gmPassword = (0, env_alias_1.resolveServerNextGmPassword)('admin123');
/**
 * 记录allowdestructive。
 */
const allowDestructive = (0, gm_database_proof_lib_1.normalizeBooleanEnv)(process.env.SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE);
/**
 * 串联执行脚本主流程。
 */
async function main() {
    if (!allowDestructive) {
        throw new Error('shadow gm-database destructive proof requires SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1');
    }
/**
 * 记录健康状态。
 */
    const health = await (0, gm_database_proof_lib_1.fetchHealth)(serverUrl);
    if (health.body?.readiness?.maintenance?.active !== true) {
        throw new Error(`shadow gm-database destructive proof requires maintenance-active target, got status=${health.status} body=${health.text}`);
    }
/**
 * 记录令牌。
 */
    const token = await (0, gm_database_proof_lib_1.loginGm)(serverUrl, gmPassword);
/**
 * 记录状态before。
 */
    const stateBefore = await (0, gm_database_proof_lib_1.authedGetJson)(serverUrl, '/gm/database/state', token);
    if (stateBefore.runningJob) {
        throw new Error(`expected no running database job before destructive proof, got ${JSON.stringify(stateBefore.runningJob)}`);
    }
/**
 * 记录备份结果。
 */
    const backupResult = await (0, gm_database_proof_lib_1.triggerBackup)(serverUrl, token);
/**
 * 记录original备份ID。
 */
    const originalBackupId = String(backupResult?.job?.backupId ?? '').trim();
/**
 * 记录备份jobID。
 */
    const backupJobId = String(backupResult?.job?.id ?? '').trim();
    if (!originalBackupId || !backupJobId) {
        throw new Error(`missing shadow backup identifiers: ${JSON.stringify(backupResult)}`);
    }
/**
 * 记录备份状态。
 */
    const backupState = await (0, gm_database_proof_lib_1.waitForJobSettled)(serverUrl, token, backupJobId, 'backup', 30000);
    await (0, gm_database_proof_lib_1.assertBackupDownload)(serverUrl, token, originalBackupId, (0, gm_database_proof_lib_1.requireBackupRecord)(backupState, originalBackupId, 'shadow backup'));
/**
 * 记录恢复结果。
 */
    const restoreResult = await (0, gm_database_proof_lib_1.triggerRestore)(serverUrl, token, {
        backupId: originalBackupId,
    });
/**
 * 记录恢复jobID。
 */
    const restoreJobId = String(restoreResult?.job?.id ?? '').trim();
    if (!restoreJobId) {
        throw new Error(`missing shadow restore job id: ${JSON.stringify(restoreResult)}`);
    }
/**
 * 记录恢复状态。
 */
    const restoreState = await (0, gm_database_proof_lib_1.waitForJobSettled)(serverUrl, token, restoreJobId, 'restore', 60000);
/**
 * 记录checkpoint备份ID。
 */
    const checkpointBackupId = String(restoreState?.lastJob?.checkpointBackupId ?? '').trim();
    if (!checkpointBackupId) {
        throw new Error(`expected checkpointBackupId after shadow restore, got ${JSON.stringify(restoreState?.lastJob ?? null)}`);
    }
    await (0, gm_database_proof_lib_1.assertBackupDownload)(serverUrl, token, checkpointBackupId, (0, gm_database_proof_lib_1.requireBackupRecord)(restoreState, checkpointBackupId, 'shadow restore checkpoint'));
    console.log(JSON.stringify({
        ok: true,
        url: serverUrl,
        maintenance: true,
        backupId: originalBackupId,
        checkpointBackupId,
        backupCountBefore: Array.isArray(stateBefore?.backups) ? stateBefore.backups.length : null,
        backupCountAfter: Array.isArray(restoreState?.backups) ? restoreState.backups.length : null,
        lastJob: {
            id: restoreState?.lastJob?.id ?? null,
            type: restoreState?.lastJob?.type ?? null,
            status: restoreState?.lastJob?.status ?? null,
            phase: restoreState?.lastJob?.phase ?? null,
            sourceBackupId: restoreState?.lastJob?.sourceBackupId ?? null,
            checkpointBackupId: restoreState?.lastJob?.checkpointBackupId ?? null,
            appliedAt: restoreState?.lastJob?.appliedAt ?? null,
            finishedAt: restoreState?.lastJob?.finishedAt ?? null,
        },
        proof: 'shadow backup -> download -> restore destructive chain under maintenance window',
    }, null, 2));
}
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

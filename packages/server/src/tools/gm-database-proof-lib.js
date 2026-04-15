"use strict";
/**
 * 用途：提供 GM 数据库 proof 脚本的共享函数。
 */

Object.defineProperty(exports, "__esModule", { value: true });
exports.buildBackupFilePath = exports.requireBackupRecord = exports.assertBackupDownload = exports.waitForJobSettled = exports.triggerRestore = exports.triggerBackup = exports.triggerRestoreWithConcurrentRejection = exports.triggerBackupWithConcurrentRejection = exports.authedPost = exports.authedPostJson = exports.authedGetJson = exports.fetchHealth = exports.fetchJson = exports.loginGm = exports.waitForHealth = exports.waitForCondition = exports.normalizeBooleanEnv = void 0;
/** node_fs_1：定义该变量以承载业务值。 */
const node_fs_1 = require("node:fs");
/** node_path_1：定义该变量以承载业务值。 */
const node_path_1 = require("node:path");
/**
 * 规范化boolean环境变量。
 */
function normalizeBooleanEnv(value) {
    if (typeof value !== 'string') {
        return false;
    }
/**
 * 记录normalized。
 */
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}
exports.normalizeBooleanEnv = normalizeBooleanEnv;
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
exports.waitForCondition = waitForCondition;
/**
 * 等待for健康状态。
 */
async function waitForHealth(baseUrl, options) {
    await waitForCondition(async () => {
        try {
/**
 * 记录健康状态。
 */
            const health = await fetchHealth(baseUrl);
            if (health.status !== options.expectedStatus) {
                return false;
            }
            return options.expectMaintenance
                ? health.body?.readiness?.maintenance?.active === true
                : health.body?.readiness?.maintenance?.active !== true;
        }
        catch {
            return false;
        }
    }, options.timeoutMs ?? 10000);
}
exports.waitForHealth = waitForHealth;
/**
 * 处理loginGM。
 */
async function loginGm(baseUrl, password) {
/**
 * 记录response。
 */
    const response = await fetch(`${baseUrl}/api/auth/gm/login`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
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
exports.loginGm = loginGm;
/**
 * 处理fetchjson。
 */
async function fetchJson(baseUrl, path, options) {
/**
 * 记录response。
 */
    const response = await fetch(`${baseUrl}${path}`, options);
    if (!response.ok) {
        throw new Error(`request failed: ${path} -> ${response.status} ${await response.text()}`);
    }
    return response.json();
}
exports.fetchJson = fetchJson;
/**
 * 处理fetch健康状态。
 */
async function fetchHealth(baseUrl) {
/**
 * 记录response。
 */
    const response = await fetch(`${baseUrl}/health`);
/**
 * 记录text。
 */
    const text = await response.text();
/**
 * 记录请求体。
 */
    let body = null;
    try {
        body = text ? JSON.parse(text) : null;
    }
    catch {
        body = null;
    }
    return {
        status: response.status,
        ok: response.ok,
        body,
        text,
    };
}
exports.fetchHealth = fetchHealth;
/**
 * 处理authedgetjson。
 */
async function authedGetJson(baseUrl, path, token) {
    return fetchJson(baseUrl, path, {
        headers: {
            authorization: `Bearer ${token}`,
        },
    });
}
exports.authedGetJson = authedGetJson;
/**
 * 处理authedpostjson。
 */
async function authedPostJson(baseUrl, path, token, body) {
/**
 * 记录response。
 */
    const response = await authedPost(baseUrl, path, token, body);
    if (!response.ok) {
        throw new Error(`request failed: POST ${path} -> ${response.status} ${await response.text()}`);
    }
    return response.json();
}
exports.authedPostJson = authedPostJson;
/**
 * 处理authedpost。
 */
async function authedPost(baseUrl, path, token, body) {
    return fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify(body ?? {}),
    });
}
exports.authedPost = authedPost;
/**
 * 处理trigger备份withconcurrentrejection。
 */
async function triggerBackupWithConcurrentRejection(baseUrl, token) {
    const [primary, secondary] = await Promise.all([
        authedPost(baseUrl, '/api/gm/database/backup', token, {}),
        authedPost(baseUrl, '/api/gm/database/backup', token, {}),
    ]);
    return pickAcceptedJobAndAssertConcurrentRejection([primary, secondary], 'backup');
}
exports.triggerBackupWithConcurrentRejection = triggerBackupWithConcurrentRejection;
/**
 * 处理trigger恢复withconcurrentrejection。
 */
async function triggerRestoreWithConcurrentRejection(baseUrl, token, body) {
    const [primary, secondary] = await Promise.all([
        authedPost(baseUrl, '/api/gm/database/restore', token, body),
        authedPost(baseUrl, '/api/gm/database/restore', token, body),
    ]);
    return pickAcceptedJobAndAssertConcurrentRejection([primary, secondary], 'restore');
}
exports.triggerRestoreWithConcurrentRejection = triggerRestoreWithConcurrentRejection;
/**
 * 处理trigger备份。
 */
async function triggerBackup(baseUrl, token) {
    return authedPostJson(baseUrl, '/api/gm/database/backup', token, {});
}
exports.triggerBackup = triggerBackup;
/**
 * 处理trigger恢复。
 */
async function triggerRestore(baseUrl, token, body) {
    return authedPostJson(baseUrl, '/api/gm/database/restore', token, body);
}
exports.triggerRestore = triggerRestore;
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
 * 等待forjobsettled。
 */
async function waitForJobSettled(baseUrl, token, jobId, type, timeoutMs = 15000) {
    return waitForCondition(async () => {
/**
 * 记录状态。
 */
        const state = await authedGetJson(baseUrl, '/api/gm/database/state', token);
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
    }, timeoutMs);
}
exports.waitForJobSettled = waitForJobSettled;
/**
 * 断言备份download。
 */
async function assertBackupDownload(baseUrl, token, backupId, expectedRecord = null, options = {}) {
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
    if (options.expectedFilePath) {
/**
 * 记录diskpayload。
 */
        const diskPayload = JSON.parse(await node_fs_1.promises.readFile(options.expectedFilePath, 'utf8'));
        if (computeChecksumForDocs(diskPayload?.docs ?? []) !== downloadedChecksum) {
            throw new Error(`expected downloaded backup checksum to match on-disk backup for ${backupId}`);
        }
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
exports.assertBackupDownload = assertBackupDownload;
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
exports.requireBackupRecord = requireBackupRecord;
/**
 * 构建备份文件路径。
 */
function buildBackupFilePath(backupDirectory, backupId) {
    return (0, node_path_1.join)(backupDirectory, `server-next-persistent-documents-${backupId}.json`);
}
exports.buildBackupFilePath = buildBackupFilePath;
/**
 * 处理computechecksumfordocs。
 */
function computeChecksumForDocs(docs) {
/** crypto：定义该变量以承载业务值。 */
    const crypto = require('node:crypto');
    return crypto.createHash('sha256').update(JSON.stringify(docs)).digest('hex');
}
/**
 * 处理delay。
 */
function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

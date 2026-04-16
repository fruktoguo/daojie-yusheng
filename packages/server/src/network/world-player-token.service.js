"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldPlayerTokenService = exports.clearAuthTrace = exports.readAuthTrace = exports.recordAuthTrace = exports.ensureAuthTraceState = void 0;

const common_1 = require("@nestjs/common");

const shared_1 = require("@mud/shared-next");

const fs = require("fs");

const path = require("path");

const world_player_token_codec_service_1 = require("./world-player-token-codec.service");

const TRACE_FILE_ENV_VAR = "NEXT_AUTH_TRACE_FILE";

const TRACE_RECORD_LIMIT = 256;

const AUTH_TRACE_ENABLE_ENV_KEYS = ['SERVER_NEXT_AUTH_TRACE_ENABLED', 'NEXT_AUTH_TRACE_ENABLED'];

const AUTH_TRACE_TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enable', 'enabled']);
const AUTH_TRACE_PURPOSE = 'debug_and_audit_summary';
/** 玩家认证 trace 服务：记录鉴权、回填和 bootstrap 的调试轨迹。 */
function resolveTraceFilePath() {

    const configured = typeof process.env[TRACE_FILE_ENV_VAR] === "string" ? process.env[TRACE_FILE_ENV_VAR].trim() : "";
    if (!configured) {
        return null;
    }
    return path.resolve(configured);
}
/** 读取 trace 开关。 */
function isAuthTraceEnabled() {
    for (const key of AUTH_TRACE_ENABLE_ENV_KEYS) {
        const configured = typeof process.env[key] === "string" ? process.env[key].trim().toLowerCase() : "";
        if (AUTH_TRACE_TRUE_VALUES.has(configured)) {
            return true;
        }
    }
    return false;
}

/** 初始化或读取全局 trace 状态。 */
function ensureAuthTraceState() {
    if (!globalThis.__NEXT_AUTH_TRACE) {
        globalThis.__NEXT_AUTH_TRACE = {
            enabled: isAuthTraceEnabled(),
            records: [],
            filePath: resolveTraceFilePath(),
            filePrepared: false,
            fileErrored: false,
        };
    }
    return globalThis.__NEXT_AUTH_TRACE;
}
exports.ensureAuthTraceState = ensureAuthTraceState;

/** 追加一条认证 trace 记录。 */
function recordAuthTrace(entry) {

    const trace = ensureAuthTraceState();
    if (!trace.enabled)
        return;

    const payload = Object.assign({ timestamp: Date.now() }, entry);
    trace.records.push(payload);
    if (trace.records.length > TRACE_RECORD_LIMIT) {
        trace.records.splice(0, trace.records.length - TRACE_RECORD_LIMIT);
    }
    appendTraceFile(trace, payload);
}
exports.recordAuthTrace = recordAuthTrace;
/** 读取当前认证 trace 快照。 */
function readAuthTrace() {

    const trace = ensureAuthTraceState();
    const summary = buildAuthTraceSummary(trace.records);
    return {
        purpose: AUTH_TRACE_PURPOSE,
        completionDefinition: false,
        boundedRecords: true,
        enabled: trace.enabled,
        limit: TRACE_RECORD_LIMIT,
        records: trace.records.slice(),
        filePath: trace.filePath,
        fileErrored: trace.fileErrored,
        summary,
    };
}
exports.readAuthTrace = readAuthTrace;
/** 清空认证 trace。 */
function clearAuthTrace() {

    const trace = ensureAuthTraceState();
    trace.records.length = 0;
    if (trace.filePath) {
        try {
            fs.writeFileSync(trace.filePath, '', { encoding: 'utf8' });
        }
        catch (error) {
            trace.fileErrored = true;
        }
    }
    return {
        ok: true,
        enabled: trace.enabled,
        filePath: trace.filePath,
    };
}
exports.clearAuthTrace = clearAuthTrace;
/** 将单条 trace 同步写入文件。 */
function appendTraceFile(trace, entry) {
    if (trace.fileErrored || !trace.filePath) {
        return;
    }
    if (!trace.filePrepared) {
        try {
            fs.mkdirSync(path.dirname(trace.filePath), { recursive: true });
        }
        catch (error) {
            trace.fileErrored = true;
            return;
        }
        try {
            fs.writeFileSync(trace.filePath, '', { flag: 'a', encoding: 'utf8' });
        }
        catch (error) {
            trace.fileErrored = true;
            return;
        }
        trace.filePrepared = true;
    }
    try {
        fs.appendFileSync(trace.filePath, `${JSON.stringify(entry)}\n`, { encoding: 'utf8' });
    }
    catch (error) {
        trace.fileErrored = true;
    }
}
/** 汇总认证 trace 为可读统计。 */
function buildAuthTraceSummary(records) {

    const typeCounts = {};

    const token = {
        acceptCount: 0,
        rejectCount: 0,
        rejectReasonCounts: {},
        tokenKindCounts: {},
    };

    const identity = {
        sourceCounts: {},
        persistedSourceCounts: {},
        persistenceEnabledCount: 0,
        nextLoadHitCount: 0,
        compatTriedCount: 0,
        persistAttemptedCount: 0,
        persistSucceededCount: 0,
        persistFailedCount: 0,
        persistFailureStageCounts: {},
    };

    const snapshot = {
        sourceCounts: {},
        persistedSourceCounts: {},
        fallbackHitCount: 0,
        allowLegacyFallbackCount: 0,
        fallbackReasonCounts: {},
        seedPersistedCount: 0,
    };

    const snapshotRecovery = {
        count: 0,
        successCount: 0,
        blockedCount: 0,
        failedCount: 0,
        reasonCounts: {},
        persistedSourceCounts: {},
        identityPersistedSourceCounts: {},
        failureStageCounts: {},
    };

    const bootstrap = {
        count: 0,
        protocolCounts: {},
        gmCount: 0,
        requestedSessionCount: 0,
        entryPathCounts: {},
        identitySourceCounts: {},
        identityPersistedSourceCounts: {},
        snapshotSourceCounts: {},
        snapshotPersistedSourceCounts: {},
        recoveryOutcomeCounts: {},
        recoveryReasonCounts: {},
        recoveryIdentityPersistedSourceCounts: {},
        recoverySnapshotPersistedSourceCounts: {},
        linkedSourceCounts: {},
        linkedPersistedSourceCounts: {},
    };

    const latestIdentityByPlayerId = new Map();

    const latestSnapshotByPlayerId = new Map();

    const latestSnapshotPersistedSourceByPlayerId = new Map();
    for (const entry of Array.isArray(records) ? records : []) {
        const type = typeof entry?.type === 'string' ? entry.type : 'unknown';
        incrementSummaryCount(typeCounts, type);
        if (type === 'token') {

            const outcome = typeof entry?.outcome === 'string' ? entry.outcome : 'unknown';
            if (outcome === 'accept') {
                token.acceptCount += 1;
            }
            else if (outcome === 'reject') {
                token.rejectCount += 1;
                incrementSummaryCount(token.rejectReasonCounts, typeof entry?.reason === 'string' ? entry.reason : 'unknown');
            }
            incrementSummaryCount(token.tokenKindCounts, typeof entry?.tokenKind === 'string' ? entry.tokenKind : 'unknown');
            continue;
        }
        if (type === 'identity') {

            const source = typeof entry?.source === 'string' ? entry.source : 'unknown';
            incrementSummaryCount(identity.sourceCounts, source);
            if (typeof entry?.persistedSource === 'string' && entry.persistedSource) {
                incrementSummaryCount(identity.persistedSourceCounts, entry.persistedSource);
            }
            if (entry?.persistenceEnabled === true) {
                identity.persistenceEnabledCount += 1;
            }
            if (entry?.nextLoadHit === true) {
                identity.nextLoadHitCount += 1;
            }
            if (entry?.compatTried === true) {
                identity.compatTriedCount += 1;
            }
            if (entry?.persistAttempted === true) {
                identity.persistAttemptedCount += 1;
            }
            if (entry?.persistSucceeded === true) {
                identity.persistSucceededCount += 1;
            }
            else if (entry?.persistSucceeded === false) {
                identity.persistFailedCount += 1;
            }
            if (typeof entry?.persistFailureStage === 'string' && entry.persistFailureStage) {
                incrementSummaryCount(identity.persistFailureStageCounts, entry.persistFailureStage);
            }

            const playerId = typeof entry?.playerId === 'string' ? entry.playerId : '';
            if (playerId) {
                latestIdentityByPlayerId.set(playerId, source);
            }
            continue;
        }
        if (type === 'snapshot') {

            const source = typeof entry?.source === 'string' ? entry.source : 'unknown';
            incrementSummaryCount(snapshot.sourceCounts, source);
            if (typeof entry?.persistedSource === 'string' && entry.persistedSource) {
                incrementSummaryCount(snapshot.persistedSourceCounts, entry.persistedSource);
            }
            if (entry?.fallbackHit === true) {
                snapshot.fallbackHitCount += 1;
            }
            if (entry?.allowLegacyFallback === true) {
                snapshot.allowLegacyFallbackCount += 1;
            }
            if (typeof entry?.fallbackReason === 'string' && entry.fallbackReason) {
                incrementSummaryCount(snapshot.fallbackReasonCounts, entry.fallbackReason);
            }
            if (entry?.seedPersisted === true) {
                snapshot.seedPersistedCount += 1;
            }

            const playerId = typeof entry?.playerId === 'string' ? entry.playerId : '';
            if (playerId) {
                latestSnapshotByPlayerId.set(playerId, source);
                latestSnapshotPersistedSourceByPlayerId.set(playerId, typeof entry?.persistedSource === 'string' && entry.persistedSource ? entry.persistedSource : 'none');
            }
            continue;
        }
        if (type === 'snapshot_recovery') {
            snapshotRecovery.count += 1;

            const outcome = typeof entry?.outcome === 'string' ? entry.outcome : 'unknown';
            if (outcome === 'success') {
                snapshotRecovery.successCount += 1;
            }
            else if (outcome === 'blocked') {
                snapshotRecovery.blockedCount += 1;
            }
            else if (outcome === 'failure') {
                snapshotRecovery.failedCount += 1;
            }
            if (typeof entry?.reason === 'string' && entry.reason) {
                incrementSummaryCount(snapshotRecovery.reasonCounts, entry.reason);
            }
            if (typeof entry?.persistedSource === 'string' && entry.persistedSource) {
                incrementSummaryCount(snapshotRecovery.persistedSourceCounts, entry.persistedSource);
            }
            if (typeof entry?.identityPersistedSource === 'string' && entry.identityPersistedSource) {
                incrementSummaryCount(snapshotRecovery.identityPersistedSourceCounts, entry.identityPersistedSource);
            }
            if (typeof entry?.failureStage === 'string' && entry.failureStage) {
                incrementSummaryCount(snapshotRecovery.failureStageCounts, entry.failureStage);
            }
            continue;
        }
        if (type === 'bootstrap') {
            bootstrap.count += 1;
            incrementSummaryCount(bootstrap.protocolCounts, typeof entry?.protocol === 'string' ? entry.protocol : 'unknown');
            incrementSummaryCount(bootstrap.entryPathCounts, typeof entry?.entryPath === 'string' ? entry.entryPath : 'unknown');
            incrementSummaryCount(bootstrap.identitySourceCounts, typeof entry?.identitySource === 'string' ? entry.identitySource : 'unknown');
            incrementSummaryCount(bootstrap.identityPersistedSourceCounts, typeof entry?.identityPersistedSource === 'string' ? entry.identityPersistedSource : 'none');
            incrementSummaryCount(bootstrap.snapshotSourceCounts, typeof entry?.snapshotSource === 'string' ? entry.snapshotSource : 'none');
            incrementSummaryCount(bootstrap.snapshotPersistedSourceCounts, typeof entry?.snapshotPersistedSource === 'string' ? entry.snapshotPersistedSource : 'none');
            incrementSummaryCount(bootstrap.recoveryOutcomeCounts, typeof entry?.recoveryOutcome === 'string' ? entry.recoveryOutcome : 'none');
            incrementSummaryCount(bootstrap.recoveryReasonCounts, typeof entry?.recoveryReason === 'string' ? entry.recoveryReason : 'none');
            incrementSummaryCount(bootstrap.recoveryIdentityPersistedSourceCounts, typeof entry?.recoveryIdentityPersistedSource === 'string' ? entry.recoveryIdentityPersistedSource : 'none');
            incrementSummaryCount(bootstrap.recoverySnapshotPersistedSourceCounts, typeof entry?.recoverySnapshotPersistedSource === 'string' ? entry.recoverySnapshotPersistedSource : 'none');
            if (typeof entry?.requestedSessionId === 'string' && entry.requestedSessionId) {
                bootstrap.requestedSessionCount += 1;
            }
            if (entry?.gm === true) {
                bootstrap.gmCount += 1;
            }

            const playerId = typeof entry?.playerId === 'string' ? entry.playerId : '';

            const linkedIdentitySource = typeof entry?.linkedIdentitySource === 'string' && entry.linkedIdentitySource
                ? entry.linkedIdentitySource
                : playerId ? latestIdentityByPlayerId.get(playerId) ?? 'unknown' : 'unknown';

            const linkedSnapshotSource = typeof entry?.linkedSnapshotSource === 'string' && entry.linkedSnapshotSource
                ? entry.linkedSnapshotSource
                : playerId ? latestSnapshotByPlayerId.get(playerId) ?? 'unknown' : 'unknown';

            const linkedSnapshotPersistedSource = typeof entry?.linkedSnapshotPersistedSource === 'string' && entry.linkedSnapshotPersistedSource
                ? entry.linkedSnapshotPersistedSource
                : playerId ? latestSnapshotPersistedSourceByPlayerId.get(playerId) ?? 'none' : 'none';
            incrementSummaryCount(bootstrap.linkedSourceCounts, `${linkedIdentitySource}|${linkedSnapshotSource}`);
            incrementSummaryCount(bootstrap.linkedPersistedSourceCounts, linkedSnapshotPersistedSource);
        }
    }
    return {
        recordCount: Array.isArray(records) ? records.length : 0,
        typeCounts,
        token,
        identity,
        snapshot,
        snapshotRecovery,
        bootstrap,
    };
}
function incrementSummaryCount(target, key) {

    const normalizedKey = typeof key === 'string' && key ? key : 'unknown';
    target[normalizedKey] = (target[normalizedKey] ?? 0) + 1;
}

let WorldPlayerTokenService = class WorldPlayerTokenService {
    logger = new common_1.Logger(WorldPlayerTokenService.name);
    worldPlayerTokenCodecService;
    constructor(worldPlayerTokenCodecService) {
        this.worldPlayerTokenCodecService = worldPlayerTokenCodecService;
    }
    validatePlayerToken(token) {

        const payload = this.worldPlayerTokenCodecService.validateAccessToken(token);
        if (!payload) {
            this.logger.debug('拒绝玩家令牌：access token 无效');
            recordAuthTrace({ type: 'token', outcome: 'reject', reason: 'invalid_access_token' });
            return null;
        }

        const tokenKind = resolvePlayerTokenKind(payload);
        if (payload.role === 'gm') {
            this.logger.debug('拒绝玩家令牌：GM 令牌不能当作玩家令牌使用');
            recordAuthTrace({ type: 'token', outcome: 'reject', reason: 'gm_role_not_player' });
            return null;
        }
        if (tokenKind === 'refresh') {
            this.logger.debug('拒绝玩家令牌：不允许使用 refresh token');
            recordAuthTrace({ type: 'token', outcome: 'reject', reason: 'refresh_token_not_allowed' });
            return null;
        }
        if (typeof payload.sub !== 'string' || typeof payload.username !== 'string') {
            this.logger.debug('拒绝玩家令牌：缺少 sub 或 username');
            recordAuthTrace({ type: 'token', outcome: 'reject', reason: 'missing_sub_or_username' });
            return null;
        }
        recordAuthTrace({
            type: 'token',
            outcome: 'accept',
            userId: payload.sub,

            playerId: typeof payload.playerId === 'string' && payload.playerId.trim()
                ? payload.playerId.trim()
                : payload.sub,
            username: payload.username,

            role: typeof payload.role === 'string' ? payload.role : 'player',
            tokenKind,

            tokenIdentityReady: this.resolvePlayerIdentityFromPayload(payload) !== null,
        });
        return payload;
    }
    resolvePlayerIdentityFromPayload(payload) {

        const userId = typeof payload?.sub === 'string' ? payload.sub.trim() : '';

        const username = typeof payload?.username === 'string' ? payload.username.trim() : '';

        const playerId = typeof payload?.playerId === 'string' && payload.playerId.trim()
            ? payload.playerId.trim()
            : (userId ? `p_${userId}` : '');

        const displayName = normalizeDisplayName(payload?.displayName, username);

        const playerName = normalizePlayerName(payload?.playerName, displayName, username);
        if (!userId || !username || !playerId || !playerName) {
            return null;
        }
        return {
            userId,
            username,
            displayName,
            playerId,
            playerName,
        };
    }
};
exports.WorldPlayerTokenService = WorldPlayerTokenService;
exports.WorldPlayerTokenService = WorldPlayerTokenService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_player_token_codec_service_1.WorldPlayerTokenCodecService])
], WorldPlayerTokenService);
function resolvePlayerTokenKind(payload) {

    const kind = typeof payload?.kind === 'string' ? payload.kind.trim().toLowerCase() : '';
    if (kind === 'access' || kind === 'refresh') {
        return kind;
    }

    const scope = typeof payload?.scope === 'string' ? payload.scope.trim().toLowerCase() : '';
    if (scope === 'access' || scope === 'refresh') {
        return scope;
    }
    return 'access';
}
function normalizeDisplayName(displayName, username) {

    const normalized = typeof displayName === 'string' ? displayName.trim().normalize('NFC') : '';
    if (isValidVisibleDisplayName(normalized)) {
        return normalized;
    }

    const normalizedUsername = typeof username === 'string' ? username.trim().normalize('NFC') : '';
    return (0, shared_1.resolveDefaultVisibleDisplayName)(normalizedUsername);
}
function normalizePlayerName(playerName, displayName, username) {

    const normalized = typeof playerName === 'string' ? playerName.trim().normalize('NFC') : '';
    if (normalized) {
        return normalized;
    }
    if (typeof displayName === 'string' && displayName.trim()) {
        return displayName.trim().normalize('NFC');
    }
    return typeof username === 'string' ? username.trim().normalize('NFC') : '';
}
function isValidVisibleDisplayName(value) {
    return typeof value === 'string'
        && value.length > 0
        && (0, shared_1.getGraphemeCount)(value) === 1
        && (0, shared_1.hasVisibleNameGrapheme)(value)
        && !(0, shared_1.containsInvisibleOnlyNameGrapheme)(value);
}
//# sourceMappingURL=world-player-token.service.js.map

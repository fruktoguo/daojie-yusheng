"use strict";
/** __decorate：定义该变量以承载业务值。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** __metadata：定义该变量以承载业务值。 */
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldPlayerTokenService = exports.clearAuthTrace = exports.readAuthTrace = exports.recordAuthTrace = exports.ensureAuthTraceState = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** fs：定义该变量以承载业务值。 */
const fs = require("fs");
/** path：定义该变量以承载业务值。 */
const path = require("path");
/** world_player_token_codec_service_1：定义该变量以承载业务值。 */
const world_player_token_codec_service_1 = require("./world-player-token-codec.service");
/** TRACE_FILE_ENV_VAR：定义该变量以承载业务值。 */
const TRACE_FILE_ENV_VAR = "NEXT_AUTH_TRACE_FILE";
/** TRACE_RECORD_LIMIT：定义该变量以承载业务值。 */
const TRACE_RECORD_LIMIT = 256;
/** AUTH_TRACE_ENABLE_ENV_KEYS：定义该变量以承载业务值。 */
const AUTH_TRACE_ENABLE_ENV_KEYS = ['SERVER_NEXT_AUTH_TRACE_ENABLED', 'NEXT_AUTH_TRACE_ENABLED'];
/** AUTH_TRACE_TRUE_VALUES：定义该变量以承载业务值。 */
const AUTH_TRACE_TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enable', 'enabled']);
/** resolveTraceFilePath：执行对应的业务逻辑。 */
function resolveTraceFilePath() {
/** configured：定义该变量以承载业务值。 */
    const configured = typeof process.env[TRACE_FILE_ENV_VAR] === "string" ? process.env[TRACE_FILE_ENV_VAR].trim() : "";
    if (!configured) {
        return null;
    }
    return path.resolve(configured);
}
/** isAuthTraceEnabled：执行对应的业务逻辑。 */
function isAuthTraceEnabled() {
    for (const key of AUTH_TRACE_ENABLE_ENV_KEYS) {
        const configured = typeof process.env[key] === "string" ? process.env[key].trim().toLowerCase() : "";
        if (AUTH_TRACE_TRUE_VALUES.has(configured)) {
            return true;
        }
    }
    return false;
}

/** ensureAuthTraceState：执行对应的业务逻辑。 */
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

/** recordAuthTrace：执行对应的业务逻辑。 */
function recordAuthTrace(entry) {
/** trace：定义该变量以承载业务值。 */
    const trace = ensureAuthTraceState();
    if (!trace.enabled)
        return;
/** payload：定义该变量以承载业务值。 */
    const payload = Object.assign({ timestamp: Date.now() }, entry);
    trace.records.push(payload);
    if (trace.records.length > TRACE_RECORD_LIMIT) {
        trace.records.splice(0, trace.records.length - TRACE_RECORD_LIMIT);
    }
    appendTraceFile(trace, payload);
}
exports.recordAuthTrace = recordAuthTrace;
/** readAuthTrace：执行对应的业务逻辑。 */
function readAuthTrace() {
/** trace：定义该变量以承载业务值。 */
    const trace = ensureAuthTraceState();
    return {
        enabled: trace.enabled,
        limit: TRACE_RECORD_LIMIT,
        records: trace.records.slice(),
        filePath: trace.filePath,
        fileErrored: trace.fileErrored,
        summary: buildAuthTraceSummary(trace.records),
    };
}
exports.readAuthTrace = readAuthTrace;
/** clearAuthTrace：执行对应的业务逻辑。 */
function clearAuthTrace() {
/** trace：定义该变量以承载业务值。 */
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
/** appendTraceFile：执行对应的业务逻辑。 */
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
/** buildAuthTraceSummary：执行对应的业务逻辑。 */
function buildAuthTraceSummary(records) {
/** typeCounts：定义该变量以承载业务值。 */
    const typeCounts = {};
/** token：定义该变量以承载业务值。 */
    const token = {
        acceptCount: 0,
        rejectCount: 0,
        rejectReasonCounts: {},
        tokenKindCounts: {},
    };
/** identity：定义该变量以承载业务值。 */
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
/** snapshot：定义该变量以承载业务值。 */
    const snapshot = {
        sourceCounts: {},
        persistedSourceCounts: {},
        fallbackHitCount: 0,
        allowLegacyFallbackCount: 0,
        fallbackReasonCounts: {},
        seedPersistedCount: 0,
    };
/** snapshotRecovery：定义该变量以承载业务值。 */
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
/** bootstrap：定义该变量以承载业务值。 */
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
/** latestIdentityByPlayerId：定义该变量以承载业务值。 */
    const latestIdentityByPlayerId = new Map();
/** latestSnapshotByPlayerId：定义该变量以承载业务值。 */
    const latestSnapshotByPlayerId = new Map();
/** latestSnapshotPersistedSourceByPlayerId：定义该变量以承载业务值。 */
    const latestSnapshotPersistedSourceByPlayerId = new Map();
    for (const entry of Array.isArray(records) ? records : []) {
        const type = typeof entry?.type === 'string' ? entry.type : 'unknown';
        incrementSummaryCount(typeCounts, type);
        if (type === 'token') {
/** outcome：定义该变量以承载业务值。 */
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
/** source：定义该变量以承载业务值。 */
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
/** playerId：定义该变量以承载业务值。 */
            const playerId = typeof entry?.playerId === 'string' ? entry.playerId : '';
            if (playerId) {
                latestIdentityByPlayerId.set(playerId, source);
            }
            continue;
        }
        if (type === 'snapshot') {
/** source：定义该变量以承载业务值。 */
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
/** playerId：定义该变量以承载业务值。 */
            const playerId = typeof entry?.playerId === 'string' ? entry.playerId : '';
            if (playerId) {
                latestSnapshotByPlayerId.set(playerId, source);
                latestSnapshotPersistedSourceByPlayerId.set(playerId, typeof entry?.persistedSource === 'string' && entry.persistedSource ? entry.persistedSource : 'none');
            }
            continue;
        }
        if (type === 'snapshot_recovery') {
            snapshotRecovery.count += 1;
/** outcome：定义该变量以承载业务值。 */
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
/** playerId：定义该变量以承载业务值。 */
            const playerId = typeof entry?.playerId === 'string' ? entry.playerId : '';
/** linkedIdentitySource：定义该变量以承载业务值。 */
            const linkedIdentitySource = typeof entry?.linkedIdentitySource === 'string' && entry.linkedIdentitySource
                ? entry.linkedIdentitySource
                : playerId ? latestIdentityByPlayerId.get(playerId) ?? 'unknown' : 'unknown';
/** linkedSnapshotSource：定义该变量以承载业务值。 */
            const linkedSnapshotSource = typeof entry?.linkedSnapshotSource === 'string' && entry.linkedSnapshotSource
                ? entry.linkedSnapshotSource
                : playerId ? latestSnapshotByPlayerId.get(playerId) ?? 'unknown' : 'unknown';
/** linkedSnapshotPersistedSource：定义该变量以承载业务值。 */
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
/** incrementSummaryCount：执行对应的业务逻辑。 */
function incrementSummaryCount(target, key) {
/** normalizedKey：定义该变量以承载业务值。 */
    const normalizedKey = typeof key === 'string' && key ? key : 'unknown';
    target[normalizedKey] = (target[normalizedKey] ?? 0) + 1;
}
/** WorldPlayerTokenService：定义该变量以承载业务值。 */
let WorldPlayerTokenService = class WorldPlayerTokenService {
    logger = new common_1.Logger(WorldPlayerTokenService.name);
    worldPlayerTokenCodecService;
/** 构造函数：执行实例初始化流程。 */
    constructor(worldPlayerTokenCodecService) {
        this.worldPlayerTokenCodecService = worldPlayerTokenCodecService;
    }
/** validatePlayerToken：执行对应的业务逻辑。 */
    validatePlayerToken(token) {
/** payload：定义该变量以承载业务值。 */
        const payload = this.worldPlayerTokenCodecService.validateAccessToken(token);
        if (!payload) {
            this.logger.debug('拒绝玩家令牌：access token 无效');
            recordAuthTrace({ type: 'token', outcome: 'reject', reason: 'invalid_access_token' });
            return null;
        }
/** tokenKind：定义该变量以承载业务值。 */
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
/** playerId：定义该变量以承载业务值。 */
            playerId: typeof payload.playerId === 'string' && payload.playerId.trim()
                ? payload.playerId.trim()
                : payload.sub,
            username: payload.username,
/** role：定义该变量以承载业务值。 */
            role: typeof payload.role === 'string' ? payload.role : 'player',
            tokenKind,
/** tokenIdentityReady：定义该变量以承载业务值。 */
            tokenIdentityReady: this.resolvePlayerIdentityFromPayload(payload) !== null,
        });
        return payload;
    }
/** resolvePlayerIdentityFromPayload：执行对应的业务逻辑。 */
    resolvePlayerIdentityFromPayload(payload) {
/** userId：定义该变量以承载业务值。 */
        const userId = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
/** username：定义该变量以承载业务值。 */
        const username = typeof payload?.username === 'string' ? payload.username.trim() : '';
/** playerId：定义该变量以承载业务值。 */
        const playerId = typeof payload?.playerId === 'string' && payload.playerId.trim()
            ? payload.playerId.trim()
            : (userId ? `p_${userId}` : '');
/** displayName：定义该变量以承载业务值。 */
        const displayName = normalizeDisplayName(payload?.displayName, username);
/** playerName：定义该变量以承载业务值。 */
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
/** resolvePlayerTokenKind：执行对应的业务逻辑。 */
function resolvePlayerTokenKind(payload) {
/** kind：定义该变量以承载业务值。 */
    const kind = typeof payload?.kind === 'string' ? payload.kind.trim().toLowerCase() : '';
    if (kind === 'access' || kind === 'refresh') {
        return kind;
    }
/** scope：定义该变量以承载业务值。 */
    const scope = typeof payload?.scope === 'string' ? payload.scope.trim().toLowerCase() : '';
    if (scope === 'access' || scope === 'refresh') {
        return scope;
    }
    return 'access';
}
/** normalizeDisplayName：执行对应的业务逻辑。 */
function normalizeDisplayName(displayName, username) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = typeof displayName === 'string' ? displayName.trim().normalize('NFC') : '';
    if (isValidVisibleDisplayName(normalized)) {
        return normalized;
    }
/** normalizedUsername：定义该变量以承载业务值。 */
    const normalizedUsername = typeof username === 'string' ? username.trim().normalize('NFC') : '';
    return (0, shared_1.resolveDefaultVisibleDisplayName)(normalizedUsername);
}
/** normalizePlayerName：执行对应的业务逻辑。 */
function normalizePlayerName(playerName, displayName, username) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = typeof playerName === 'string' ? playerName.trim().normalize('NFC') : '';
    if (normalized) {
        return normalized;
    }
    if (typeof displayName === 'string' && displayName.trim()) {
        return displayName.trim().normalize('NFC');
    }
    return typeof username === 'string' ? username.trim().normalize('NFC') : '';
}
/** isValidVisibleDisplayName：执行对应的业务逻辑。 */
function isValidVisibleDisplayName(value) {
    return typeof value === 'string'
        && value.length > 0
        && (0, shared_1.getGraphemeCount)(value) === 1
        && (0, shared_1.hasVisibleNameGrapheme)(value)
        && !(0, shared_1.containsInvisibleOnlyNameGrapheme)(value);
}
//# sourceMappingURL=world-player-token.service.js.map

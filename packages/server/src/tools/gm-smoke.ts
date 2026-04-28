// @ts-nocheck

/**
 * 用途：执行 GM 主链路的冒烟验证。
 */
Object.defineProperty(exports, "__esModule", { value: true });
const smoke_timeout_1 = require("./smoke-timeout");
(0, smoke_timeout_1.installSmokeTimeout)(__filename);
const pg_1 = require("pg");
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared");
const env_alias_1 = require("../config/env-alias");
const next_gm_contract_1 = require("../http/native/native-gm-contract");
const smoke_player_auth_1 = require("./smoke-player-auth");
const smoke_player_cleanup_1 = require("./smoke-player-cleanup");
/**
 * 指定烟测要连接的 server 地址。
 */
const SERVER_URL = (0, env_alias_1.resolveServerUrl)() || 'http://127.0.0.1:3111';
/**
 * 读取数据库连接串，用于决定是否走带数据库真源补齐分支。
 */
const SERVER_DATABASE_URL = (0, env_alias_1.resolveServerDatabaseUrl)();
/**
 * 标记当前是否具备数据库环境。
 */
const hasDatabaseUrl = Boolean(SERVER_DATABASE_URL);
const LEGACY_HTTP_MEMORY_FALLBACK_ENABLED = readBooleanEnv('SERVER_ALLOW_LEGACY_HTTP_MEMORY_FALLBACK')
    || readBooleanEnv('SERVER_ALLOW_LEGACY_HTTP_MEMORY_FALLBACK');
const LEGACY_SOCKET_PROTOCOL_ENABLED = readBooleanEnv('SERVER_ALLOW_LEGACY_SOCKET_PROTOCOL')
    || readBooleanEnv('SERVER_ALLOW_LEGACY_SOCKET_PROTOCOL');
/**
 * 读取 GM 登录密码，供兼容链路验证使用。
 */
const GM_PASSWORD = (0, env_alias_1.resolveServerGmPassword)('admin123');
/**
 * 生成本次烟测专用的唯一后缀，避免账号和数据冲突。
 */
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/**
 * 本次 GM 兼容烟测使用的临时账号名。
 */
const accountName = `gc_${suffix.slice(-10)}`;
/**
 * 记录password。
 */
const password = `Pass_${suffix}`;
/**
 * 本次烟测注册角色使用的临时角色名。
 */
const roleName = `兼烟${suffix.slice(-4)}`;
/**
 * 预留给 GM 改密验证链路使用的新密码。
 */
const gmChangedPassword = `${password}_gmchg${suffix.slice(-4)}`;
const GM_MAINLINE_SMOKE_BOUNDARY = Object.freeze({
    answers: [
        'shadow 或本地带库环境下，GM socket / HTTP 主链、玩家编辑、邮件、建议与地图控制关键写路径是否可跑通',
        'GM 协议守卫、GM sessionId 守卫与 mainline-only 协议边界是否生效',
    ],
    excludes: [
        '不证明 backup / restore / destructive 维护窗口',
        '不证明 acceptance/full 已经自动闭环',
        '不证明 GM/admin/restore 的长期完成定义已经全部收口',
    ],
    completionMapping: [
        '映射 acceptance 里的 GM 关键写路径自动证据',
        '不能单独替代 full、shadow-destructive 或人工运营回归',
    ],
});
const LEGACY_ERROR_EVENT = 's:error';
/**
 * 串联 socket GM、HTTP GM、邮件、建议和地图控制等兼容验证流程。
 */
async function main() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录认证。
 */
    let auth = null;
/**
 * 记录GM令牌。
 */
    let gmToken = '';
/**
 * 记录协议守卫socket。
 */
    let protocolGuardSocket = null;
/**
 * 记录legacy协议守卫socket。
 */
    let legacyProtocolGuardSocket = null;
/**
 * 记录GM sessionId 守卫socket。
 */
    let gmSessionIdGuardSocket = null;
/**
 * 记录socket。
 */
    let socket = null;
    if (!hasDatabaseUrl && !LEGACY_HTTP_MEMORY_FALLBACK_ENABLED) {
        console.log(JSON.stringify({
            ok: true,
            url: SERVER_URL,
            skipped: true,
            reason: 'no_db_legacy_http_memory_fallback_disabled',
            answers: GM_MAINLINE_SMOKE_BOUNDARY.answers,
            excludes: GM_MAINLINE_SMOKE_BOUNDARY.excludes,
            completionMapping: GM_MAINLINE_SMOKE_BOUNDARY.completionMapping,
        }, null, 2));
        return;
    }
    await resetLocalGmPasswordRecordIfNeeded();
    auth = await registerAndLoginPlayer();
    gmToken = await loginGm();
    protocolGuardSocket = (0, socket_io_client_1.io)(SERVER_URL, {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        auth: {
            token: auth.accessToken,
            gmToken,
        },
    });
/**
 * 记录协议守卫错误。
 */
    let protocolGuardError = null;
/**
 * 记录legacy协议守卫错误。
 */
    let legacyProtocolGuardError = null;
/**
 * 记录GM sessionId 守卫错误。
 */
    let gmSessionIdGuardError = null;
    protocolGuardSocket.on(shared_1.S2C.Error, (payload) => {
        protocolGuardError = payload ?? null;
    });
    await onceConnected(protocolGuardSocket);
    await waitFor(() => {
        return protocolGuardError?.code === 'AUTH_PROTOCOL_REQUIRED';
    }, 5000, 'authenticated gm socket protocol required');
    protocolGuardSocket.close();
    legacyProtocolGuardSocket = (0, socket_io_client_1.io)(SERVER_URL, {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        auth: {
            token: auth.accessToken,
            gmToken,
            protocol: 'legacy',
        },
    });
    legacyProtocolGuardSocket.on(LEGACY_ERROR_EVENT, (payload) => {
        legacyProtocolGuardError = payload ?? null;
    });
    legacyProtocolGuardSocket.on(shared_1.S2C.Error, (payload) => {
        legacyProtocolGuardError = payload ?? null;
    });
    await onceConnected(legacyProtocolGuardSocket);
    await waitFor(() => {
        return legacyProtocolGuardError?.code === resolveExpectedLegacySocketProtocolGuardCode();
    }, 5000, 'authenticated gm socket legacy protocol mismatch');
    legacyProtocolGuardSocket.close();
    gmSessionIdGuardSocket = (0, socket_io_client_1.io)(SERVER_URL, {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        auth: {
            token: auth.accessToken,
            gmToken,
            protocol: 'mainline',
            sessionId: `gm_forbidden_${suffix}`,
        },
    });
    gmSessionIdGuardSocket.on(shared_1.S2C.Error, (payload) => {
        gmSessionIdGuardError = payload ?? null;
    });
    await onceConnected(gmSessionIdGuardSocket);
    await waitFor(() => {
        return gmSessionIdGuardError?.code === 'GM_SESSION_ID_FORBIDDEN';
    }, 5000, 'authenticated gm socket requested sessionId forbidden');
    gmSessionIdGuardSocket.close();
    if (!hasDatabaseUrl) {
        console.log(JSON.stringify({
            ok: true,
            url: SERVER_URL,
            skipped: true,
            reason: 'no_db_mainline_protocol_rejects_token_runtime',
            answers: GM_MAINLINE_SMOKE_BOUNDARY.answers,
            excludes: GM_MAINLINE_SMOKE_BOUNDARY.excludes,
            completionMapping: GM_MAINLINE_SMOKE_BOUNDARY.completionMapping,
            protocolGuardRejectedCode: protocolGuardError?.code ?? null,
            legacyProtocolGuardRejectedCode: legacyProtocolGuardError?.code ?? null,
            gmSessionIdGuardRejectedCode: gmSessionIdGuardError?.code ?? null,
        }, null, 2));
        return;
    }
/**
 * 记录非GM socket。
 */
    let nonGmSocket = null;
    try {
        nonGmSocket = (0, socket_io_client_1.io)(SERVER_URL, {
            path: '/socket.io',
            transports: ['websocket'],
            forceNew: true,
            auth: {
                token: auth.accessToken,
                protocol: 'mainline',
            },
        });
/**
 * 记录非GM init。
 */
        let nonGmInit = null;
/**
 * 记录非GM错误。
 */
        let nonGmSocketError = null;
/**
 * 记录非GM 主线 GM 状态数量。
 */
        let nonGmMainlineGmStateCount = 0;
/**
 * 记录非GM legacy GM状态数量。
 */
        let nonGmLegacyGmStateCount = 0;
        nonGmSocket.on(shared_1.S2C.InitSession, (payload) => {
            nonGmInit = payload;
        });
        nonGmSocket.on(shared_1.S2C.Error, (payload) => {
            nonGmSocketError = payload ?? null;
        });
        nonGmSocket.on(shared_1.S2C.GmState, () => {
            nonGmMainlineGmStateCount += 1;
        });
        nonGmSocket.on('s:gmState', () => {
            nonGmLegacyGmStateCount += 1;
        });
        await onceConnected(nonGmSocket);
        await waitFor(() => {
            return nonGmInit !== null;
        }, 5000, 'non-gm mainline init');
        nonGmSocket.emit(shared_1.C2S.GmGetState, {});
        await waitFor(() => {
            return nonGmSocketError?.code === 'GM_FORBIDDEN';
        }, 5000, 'non-gm socket gmGetState forbidden');
        if (nonGmMainlineGmStateCount > 0 || nonGmLegacyGmStateCount > 0) {
            throw new Error(`non-gm socket unexpectedly received gm state: ${JSON.stringify({
                mainline: nonGmMainlineGmStateCount,
                legacy: nonGmLegacyGmStateCount,
            })}`);
        }
    }
    finally {
        nonGmSocket?.close();
    }
/**
 * 记录未授权读接口响应。
 */
    const unauthorizedReadResponse = await requestRaw('/api/gm/state');
    if (unauthorizedReadResponse.status !== 401) {
        throw new Error(`expected unauthorized /api/gm/state status 401, got ${unauthorizedReadResponse.status}`);
    }
/**
 * 记录未授权写接口响应。
 */
    const unauthorizedWriteResponse = await requestRaw(`/api/gm/players/${auth.playerId}/reset`, {
        method: 'POST',
        headers: {
            authorization: 'Bearer invalid-gm-token',
        },
    });
    if (unauthorizedWriteResponse.status !== 401) {
        throw new Error(`expected unauthorized gm write status 401, got ${unauthorizedWriteResponse.status}`);
    }
    socket = (0, socket_io_client_1.io)(SERVER_URL, {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        auth: {
            token: auth.accessToken,
            gmToken,
            protocol: 'mainline',
        },
    });
/**
 * 记录GM状态events。
 */
    const gmStateEvents = [];
/**
 * 记录mainline init。
 */
    let nextInit = null;
/**
 * 记录bootstrap数量。
 */
    let bootstrapCount = 0;
/**
 * 记录mapenter数量。
 */
    let mapEnterCount = 0;
/**
 * 记录mapstatic数量。
 */
    let mapStaticCount = 0;
/**
 * 记录realm数量。
 */
    let realmCount = 0;
/**
 * 记录worlddelta数量。
 */
    let worldDeltaCount = 0;
/**
 * 记录selfdelta数量。
 */
    let selfDeltaCount = 0;
/**
 * 记录paneldelta数量。
 */
    let panelDeltaCount = 0;
/**
 * 记录socketerror。
 */
    let socketError = null;
    socket.on(LEGACY_ERROR_EVENT, (payload) => {
        socketError = new Error(`legacy socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.S2C.Error, (payload) => {
        socketError = new Error(`mainline socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.S2C.InitSession, (payload) => {
        nextInit = payload;
    });
    socket.on(shared_1.S2C.Bootstrap, () => {
        bootstrapCount += 1;
    });
    socket.on(shared_1.S2C.MapEnter, () => {
        mapEnterCount += 1;
    });
    socket.on(shared_1.S2C.MapStatic, () => {
        mapStaticCount += 1;
    });
    socket.on(shared_1.S2C.Realm, () => {
        realmCount += 1;
    });
    socket.on(shared_1.S2C.WorldDelta, () => {
        worldDeltaCount += 1;
    });
    socket.on(shared_1.S2C.SelfDelta, () => {
        selfDeltaCount += 1;
    });
    socket.on(shared_1.S2C.PanelDelta, () => {
        panelDeltaCount += 1;
    });
    socket.on(shared_1.S2C.GmState, (payload) => {
        gmStateEvents.push({ kind: 'mainline', payload });
    });
    socket.on('s:gmState', (payload) => {
        gmStateEvents.push({ kind: 'legacy', payload });
    });
    try {
        await onceConnected(socket);
        await waitFor(() => {
            throwIfSocketError(socketError);
            return nextInit !== null;
        }, 5000, 'mainline init');
        await waitFor(() => {
            throwIfSocketError(socketError);
            return bootstrapCount > 0
                && mapEnterCount > 0
                && mapStaticCount > 0
                && realmCount > 0
                && worldDeltaCount > 0
                && selfDeltaCount > 0
                && panelDeltaCount > 0;
        }, 12000, 'gm mainline bootstrap ready');
/**
 * 记录initial运行态。
 */
        const initialRuntime = await waitForPlayerState(auth.playerId, () => true, 12000);
/**
 * 记录initialmaps。
 */
        const initialMaps = await authedGetJson('/api/gm/maps', gmToken);
/**
 * 记录当前值地图汇总。
 */
        const currentMapSummary = assertGmMapsShape(initialMaps, initialRuntime.templateId);
/**
 * 记录编辑器目录。
 */
        const editorCatalog = await authedGetJson('/api/gm/editor-catalog', gmToken);
/**
 * 记录编辑器目录汇总。
 */
        const editorCatalogSummary = assertEditorCatalogShape(editorCatalog);
/**
 * 记录运行态inspection。
 */
        const runtimeInspection = await inspectMapRuntime(gmToken, auth.playerId, initialRuntime.templateId, initialRuntime.x, initialRuntime.y);
/**
 * 记录initialsocketGM状态。
 */
        const initialSocketGmState = await emitAndWaitForGmState(socket, gmStateEvents, socketError, shared_1.C2S.GmGetState, {}, (entry) => {
            return Array.isArray(entry?.payload?.players) && Array.isArray(entry?.payload?.mapIds);
        }, 5000, 'socket gmGetState');
        assertMainlineGmState(initialSocketGmState, 'socket gmGetState');
/**
 * 记录socketbotbaseline。
 */
        const socketBotBaseline = Number(initialSocketGmState?.payload?.botCount ?? 0);
/**
 * 记录socket目标position。
 */
        const socketTargetPosition = await findNearbyWalkablePosition(gmToken, auth.playerId, initialRuntime.templateId, initialRuntime.x, initialRuntime.y);
/**
 * 记录socket目标hp。
 */
        const socketTargetHp = computeReducedHp(initialRuntime.hp, initialRuntime.maxHp, 7);
/**
 * 记录socket目标autobattle。
 */
        const socketTargetAutoBattle = !Boolean(initialRuntime.combat?.autoBattle);
/**
 * 记录socket出生点状态。
 */
        const socketSpawnAck = await emitAndWaitForGmState(socket, gmStateEvents, socketError, shared_1.C2S.GmSpawnBots, {
            count: 1,
        }, (entry) => Array.isArray(entry?.payload?.players) && Array.isArray(entry?.payload?.mapIds), 8000, 'socket gmSpawnBots ack');
        assertMainlineGmState(socketSpawnAck, 'socket gmSpawnBots ack');
/**
 * 记录socket出生点bot数量。
 */
        const socketSpawnObserved = await waitForGmState(gmToken, (payload) => Number(payload?.botCount ?? 0) >= socketBotBaseline + 1, 8000, 'socket gmSpawnBots observed');
        const socketSpawnBotCount = Number(socketSpawnObserved?.botCount ?? socketSpawnAck?.payload?.botCount ?? 0);
        const socketUpdateAck = await emitAndWaitForGmState(socket, gmStateEvents, socketError, shared_1.C2S.GmUpdatePlayer, {
            playerId: auth.playerId,
            mapId: initialRuntime.templateId,
            x: socketTargetPosition.x,
            y: socketTargetPosition.y,
            hp: socketTargetHp,
            autoBattle: socketTargetAutoBattle,
        }, (entry) => Array.isArray(entry?.payload?.players) && Array.isArray(entry?.payload?.mapIds), 12000, 'socket gmUpdatePlayer ack');
        assertMainlineGmState(socketUpdateAck, 'socket gmUpdatePlayer ack');
/**
 * 记录socketupdated。
 */
        const socketUpdated = await waitForRuntimeAndGmPlayerState(auth.playerId, gmToken, (runtime, summary) => {
            return matchesUpdatedRuntimeAndSummary(runtime, summary, {
                previousMapId: initialRuntime.templateId,
                previousX: initialRuntime.x,
                previousY: initialRuntime.y,
                previousHp: initialRuntime.hp,
                previousAutoBattle: initialRuntime.combat?.autoBattle ?? false,
                nextMapId: initialRuntime.templateId,
                autoBattle: socketTargetAutoBattle,
            });
        }, 12000, 'socket gmUpdatePlayer');
/**
 * 记录socketupdated运行态。
 */
        const socketUpdatedRuntime = socketUpdated.runtime;
/**
 * 记录socketreset状态。
 */
        const socketResetAck = await emitAndWaitForGmState(socket, gmStateEvents, socketError, shared_1.C2S.GmResetPlayer, {
            playerId: auth.playerId,
        }, (entry) => Array.isArray(entry?.payload?.players) && Array.isArray(entry?.payload?.mapIds), 12000, 'socket gmResetPlayer ack');
        assertMainlineGmState(socketResetAck, 'socket gmResetPlayer ack');
/**
 * 记录socketreset。
 */
        const socketReset = await waitForRuntimeAndGmPlayerState(auth.playerId, gmToken, (runtime, summary) => {
            return runtime.templateId === 'yunlai_town'
                && runtime.hp === runtime.maxHp
                && runtime.combat?.autoBattle === false
                && summary.mapId === 'yunlai_town'
                && summary.dead === false
                && summary.autoBattle === false;
        }, 12000, 'socket gmResetPlayer');
/**
 * 记录socketreset运行态。
 */
        const socketResetRuntime = socketReset.runtime;
/**
 * 记录socketremove状态。
 */
        const socketRemoveAck = await emitAndWaitForGmState(socket, gmStateEvents, socketError, shared_1.C2S.GmRemoveBots, {
            all: true,
        }, (entry) => Array.isArray(entry?.payload?.players) && Array.isArray(entry?.payload?.mapIds), 8000, 'socket gmRemoveBots ack');
        assertMainlineGmState(socketRemoveAck, 'socket gmRemoveBots ack');
        const socketRemoveObserved = await waitForGmState(gmToken, (payload) => Number(payload?.botCount ?? 0) === 0, 8000, 'socket gmRemoveBots observed');
/**
 * 记录initialhttp状态。
 */
        const initialHttpState = await authedGetJson('/api/gm/state', gmToken);
        assertGmStateShape(initialHttpState, 'initial http gm state');
        const queriedHttpState = await authedGetJson(`/api/gm/state?page=1&pageSize=5&sort=name&keyword=${encodeURIComponent(auth.loginName)}`, gmToken);
        assertGmStateShape(queriedHttpState, 'queried http gm state');
        assertGmStateQueryContract(queriedHttpState, {
            pageSize: 5,
            sort: 'name',
            keyword: auth.loginName,
            expectedPlayerId: auth.playerId,
        });
        assertGmPerfHotspots(queriedHttpState, 'queried http gm state');
        if (gmStateEvents.some((entry) => entry?.kind === 'legacy')) {
            throw new Error(`gm socket leaked legacy gm state before mutations: ${JSON.stringify(gmStateEvents)}`);
        }
/**
 * 记录http运行态before。
 */
        const httpRuntimeBefore = await waitForPlayerState(auth.playerId, () => true, 5000);
/**
 * 记录http目标position。
 */
        const httpTargetPosition = await findNearbyWalkablePosition(gmToken, auth.playerId, httpRuntimeBefore.templateId, httpRuntimeBefore.x, httpRuntimeBefore.y);
/**
 * 记录http目标hp。
 */
        const httpTargetHp = computeReducedHp(httpRuntimeBefore.hp, httpRuntimeBefore.maxHp, 11);
        await authedRequestJson(`/api/gm/players/${auth.playerId}`, {
            method: 'PUT',
            token: gmToken,
            body: {
                section: 'position',
                snapshot: {
                    mapId: httpRuntimeBefore.templateId,
                    x: httpTargetPosition.x,
                    y: httpTargetPosition.y,
                    hp: httpTargetHp,
                },
            },
        });
/**
 * 记录httpupdated。
 */
        const httpUpdated = await waitForRuntimeAndGmPlayerState(auth.playerId, gmToken, (runtime, summary) => {
            return matchesUpdatedRuntimeAndSummary(runtime, summary, {
                previousMapId: httpRuntimeBefore.templateId,
                previousX: httpRuntimeBefore.x,
                previousY: httpRuntimeBefore.y,
                previousHp: httpRuntimeBefore.hp,
                previousAutoBattle: httpRuntimeBefore.combat?.autoBattle ?? false,
                nextMapId: httpRuntimeBefore.templateId,
            });
        }, 8000, 'http gmUpdatePlayer');
/**
 * 记录httpupdated运行态。
 */
        const httpUpdatedRuntime = httpUpdated.runtime;
/**
 * 记录httpupdatedGM状态。
 */
        const httpUpdatedGmState = httpUpdated.gmState;
        await authedRequestJson(`/api/gm/players/${auth.playerId}/reset`, {
            method: 'POST',
            token: gmToken,
            body: {},
        });
/**
 * 记录httpreset运行态。
 */
        const httpResetRuntime = await waitForPlayerState(auth.playerId, (player) => {
            return player.templateId === 'yunlai_town'
                && player.hp === player.maxHp
                && player.combat?.autoBattle === false;
        }, 8000);
/**
 * 记录httpresetGM状态。
 */
        const httpResetGmState = await waitForGmState(gmToken, (payload) => hasGmPlayerSummary(payload, auth.playerId, (player) => {
            return player.mapId === 'yunlai_town'
                && player.autoBattle === false
                && player.dead === false;
        }), 8000, 'http gmResetPlayer');
        await authedRequestJson('/api/gm/bots/spawn', {
            method: 'POST',
            token: gmToken,
            body: {
                anchorPlayerId: auth.playerId,
                count: 1,
            },
        });
/**
 * 记录http出生点状态。
 */
        const httpSpawnState = await waitForGmState(gmToken, (payload) => Number(payload?.botCount ?? 0) >= 1, 8000, 'http gmSpawnBots');
        await authedRequestJson('/api/gm/bots/remove', {
            method: 'POST',
            token: gmToken,
            body: {
                all: true,
            },
        });
/**
 * 记录httpremove状态。
 */
        const httpRemoveState = await waitForGmState(gmToken, (payload) => Number(payload?.botCount ?? 0) === 0, 8000, 'http gmRemoveBots');
/**
 * 记录GM详情before。
 */
        const gmPlayerDetailBefore = await fetchGmPlayerDetail(gmToken, auth.playerId);
/**
 * 记录bodytraining等级before。
 */
        const bodyTrainingLevelBefore = getBodyTrainingLevel(gmPlayerDetailBefore?.player?.snapshot);
/**
 * 记录foundation before。
 */
        const foundationBefore = getNonNegativeInt(gmPlayerDetailBefore?.player?.snapshot?.foundation);
/**
 * 记录combatexp before。
 */
        const combatExpBefore = getNonNegativeInt(gmPlayerDetailBefore?.player?.snapshot?.combatExp);
/**
 * 记录目标bodytraining等级。
 */
        const targetBodyTrainingLevel = bodyTrainingLevelBefore + 1;
/**
 * 记录foundation调整值。
 */
        const foundationDelta = 17;
/**
 * 记录combatexp调整值。
 */
        const combatExpDelta = 19;
        await authedRequestJson(`/api/gm/players/${auth.playerId}/body-training/level`, {
            method: 'POST',
            token: gmToken,
            body: {
                level: targetBodyTrainingLevel,
            },
        });
/**
 * 记录bodytraining已更新详情。
 */
        const bodyTrainingUpdatedDetail = await waitForGmPlayerDetail(gmToken, auth.playerId, (payload) => getBodyTrainingLevel(payload?.player?.snapshot) === targetBodyTrainingLevel, 8000, 'gm set body training level');
/**
 * 记录bodytraining已更新运行态。
 */
        const bodyTrainingUpdatedRuntime = await waitForPlayerState(auth.playerId, (player) => getBodyTrainingLevel(player) === targetBodyTrainingLevel, 8000);
        await authedRequestJson(`/api/gm/players/${auth.playerId}/foundation/add`, {
            method: 'POST',
            token: gmToken,
            body: {
                amount: foundationDelta,
            },
        });
/**
 * 记录foundation已更新运行态。
 */
        const foundationUpdatedRuntime = await waitForPlayerState(auth.playerId, (player) => getNonNegativeInt(player?.foundation) === foundationBefore + foundationDelta, 8000);
        await authedRequestJson(`/api/gm/players/${auth.playerId}/combat-exp/add`, {
            method: 'POST',
            token: gmToken,
            body: {
                amount: combatExpDelta,
            },
        });
/**
 * 记录combatexp已更新运行态。
 */
        const combatExpUpdatedRuntime = await waitForPlayerState(auth.playerId, (player) => getNonNegativeInt(player?.combatExp) === combatExpBefore + combatExpDelta, 8000);
/**
 * 记录mail汇总before。
 */
        const mailSummaryBefore = await fetchMailSummary(auth.playerId);
/**
 * 记录directmail。
 */
        const directMail = await authedRequestJson(`/api/gm/players/${auth.playerId}/mail`, {
            method: 'POST',
            token: gmToken,
            body: {
                fallbackTitle: `GM直邮${suffix.slice(-4)}`,
                fallbackBody: `gm direct ${suffix}`,
                attachments: [{ itemId: 'spirit_stone', count: 1 }],
            },
        });
/**
 * 记录broadcastmail。
 */
        const broadcastMail = await authedRequestJson('/api/gm/mail/broadcast', {
            method: 'POST',
            token: gmToken,
            body: {
                fallbackTitle: `GM群邮${suffix.slice(-4)}`,
                fallbackBody: `gm broadcast ${suffix}`,
                attachments: [{ itemId: 'pill.minor_heal', count: 1 }],
            },
        });
/**
 * 记录mail汇总after。
 */
        const mailSummaryAfter = await waitForMailSummary(auth.playerId, (summary) => summary.unreadCount >= mailSummaryBefore.unreadCount + 2
            && summary.claimableCount >= mailSummaryBefore.claimableCount + 2, 8000, 'gm mail summary');
/**
 * 记录mailpage。
 */
        const mailPage = await waitForMailPage(auth.playerId, (page) => page.items.some((entry) => entry?.mailId === directMail?.mailId)
            && page.items.some((entry) => typeof entry?.title === 'string' && entry.title.includes('GM群邮')), 8000, 'gm mail page');
/**
 * 记录createdsuggestion。
 */
        const createdSuggestion = await requestJson(`/runtime/players/${auth.playerId}/suggestions`, {
            method: 'POST',
            body: {
                title: `GM建议${suffix.slice(-4)}`,
                description: `gm suggestion ${suffix}`,
            },
        });
/**
 * 记录suggestionID。
 */
        const suggestionId = String(createdSuggestion?.suggestion?.id ?? '').trim();
        if (!suggestionId) {
            throw new Error(`unexpected suggestion create payload: ${JSON.stringify(createdSuggestion)}`);
        }
        await waitForGmSuggestions(gmToken, (payload) => findSuggestion(payload, suggestionId)?.status === 'pending', 8000, 'gm suggestions list');
        await authedRequestJson(`/api/gm/suggestions/${suggestionId}/replies`, {
            method: 'POST',
            token: gmToken,
            body: {
                content: `GM回复${suffix}`,
            },
        });
        await authedRequestJson(`/api/gm/suggestions/${suggestionId}/complete`, {
            method: 'POST',
            token: gmToken,
            body: {},
        });
/**
 * 记录completedsuggestions。
 */
        const completedSuggestions = await waitForGmSuggestions(gmToken, (payload) => {
/**
 * 记录suggestion。
 */
            const suggestion = findSuggestion(payload, suggestionId);
            return suggestion?.status === 'completed'
                && Array.isArray(suggestion?.replies)
                && suggestion.replies.some((entry) => entry?.authorType === 'gm');
        }, 8000, 'gm suggestions complete');
        await authedRequestJson(`/api/gm/suggestions/${suggestionId}`, {
            method: 'DELETE',
            token: gmToken,
    });
    await waitForGmSuggestions(gmToken, (payload) => findSuggestion(payload, suggestionId) === null, 8000, 'gm suggestions remove');
/**
 * 记录地图运行态before。
 */
        const mapRuntimeBefore = await fetchGmMapRuntime(gmToken, httpResetRuntime.templateId, auth.playerId, httpResetRuntime.x, httpResetRuntime.y);
/**
 * 记录nexttickspeed。
 */
        const nextTickSpeed = Math.max(1, Number(mapRuntimeBefore?.tickSpeed ?? 1) + 2);
/**
 * 记录nexttimescale。
 */
        const nextTimeScale = Math.max(1, Number(mapRuntimeBefore?.timeConfig?.scale ?? 1) + 1);
/**
 * 记录nextoffsetticks。
 */
        const nextOffsetTicks = Math.trunc(Number(mapRuntimeBefore?.timeConfig?.offsetTicks ?? 0) + 60);
        await authedRequestJson(`/api/gm/maps/${httpResetRuntime.templateId}/tick`, {
            method: 'PUT',
            token: gmToken,
            body: {
                paused: false,
                speed: nextTickSpeed,
            },
        });
        await authedRequestJson(`/api/gm/maps/${httpResetRuntime.templateId}/time`, {
            method: 'PUT',
            token: gmToken,
            body: {
                scale: nextTimeScale,
                offsetTicks: nextOffsetTicks,
            },
        });
/**
 * 记录地图运行态updated。
 */
        const mapRuntimeUpdated = await waitForGmMapRuntime(gmToken, httpResetRuntime.templateId, auth.playerId, httpResetRuntime.x, httpResetRuntime.y, (runtime) => Number(runtime?.tickSpeed ?? 0) === nextTickSpeed
            && runtime?.tickPaused === false
            && Number(runtime?.timeConfig?.scale ?? 0) === nextTimeScale
            && Number(runtime?.timeConfig?.offsetTicks ?? 0) === nextOffsetTicks, 8000, 'gm map runtime update');
        await authedRequestJson('/api/gm/tick-config/reload', {
            method: 'POST',
            token: gmToken,
            body: {},
        });
/**
 * 记录地图运行态reloaded。
 */
        const mapRuntimeReloaded = await waitForGmMapRuntime(gmToken, httpResetRuntime.templateId, auth.playerId, httpResetRuntime.x, httpResetRuntime.y, (runtime) => Number(runtime?.tickSpeed ?? 0) === nextTickSpeed
            && Number(runtime?.timeConfig?.scale ?? 0) === nextTimeScale
            && Number(runtime?.timeConfig?.offsetTicks ?? 0) === nextOffsetTicks, 8000, 'gm tick reload');
/**
 * 记录shortcut return-all前运行态。
 */
        const runtimeBeforeShortcutReturn = await waitForPlayerState(auth.playerId, () => true, 5000);
/**
 * 记录shortcut return-all目标位置。
 */
        const shortcutReturnMoveTarget = await findNearbyWalkablePosition(gmToken, auth.playerId, runtimeBeforeShortcutReturn.templateId, runtimeBeforeShortcutReturn.x, runtimeBeforeShortcutReturn.y);
/**
 * 记录shortcut return-all目标血量。
 */
        const shortcutReturnMoveHp = computeReducedHp(runtimeBeforeShortcutReturn.hp, runtimeBeforeShortcutReturn.maxHp, 7);
        await authedRequestJson(`/api/gm/players/${auth.playerId}`, {
            method: 'PUT',
            token: gmToken,
            body: {
                section: 'position',
                snapshot: {
                    mapId: runtimeBeforeShortcutReturn.templateId,
                    x: shortcutReturnMoveTarget.x,
                    y: shortcutReturnMoveTarget.y,
                    hp: shortcutReturnMoveHp,
                },
            },
        });
        await waitForRuntimeAndGmPlayerState(auth.playerId, gmToken, (runtime, summary) => {
            return matchesUpdatedRuntimeAndSummary(runtime, summary, {
                previousMapId: runtimeBeforeShortcutReturn.templateId,
                previousX: runtimeBeforeShortcutReturn.x,
                previousY: runtimeBeforeShortcutReturn.y,
                previousHp: runtimeBeforeShortcutReturn.hp,
                previousAutoBattle: runtimeBeforeShortcutReturn.combat?.autoBattle ?? false,
                nextMapId: runtimeBeforeShortcutReturn.templateId,
            });
        }, 8000, 'gm shortcut pre-return-all move');
/**
 * 记录return-all快捷执行结果。
 */
        const returnAllPlayersResult = assertGmShortcutRunRes(await authedRequestJson('/api/gm/shortcuts/players/return-all-to-default-spawn', {
            method: 'POST',
            token: gmToken,
            body: {},
        }), 'gm shortcut return-all-to-default-spawn');
/**
 * 记录return-all后运行态。
 */
        const returnAllPlayersRuntime = await waitForPlayerState(auth.playerId, (player) => player.templateId === returnAllPlayersResult.targetMapId
            && player.x === returnAllPlayersResult.targetX
            && player.y === returnAllPlayersResult.targetY
            && player.hp === player.maxHp
            && player.combat?.autoBattle === false, 8000);
/**
 * 记录cleanup快捷执行结果。
 */
        const cleanupInvalidItemsResult = assertGmShortcutRunRes(await authedRequestJson('/api/gm/shortcuts/players/cleanup-invalid-items', {
            method: 'POST',
            token: gmToken,
            body: {},
        }), 'gm shortcut cleanup-invalid-items');
/**
 * 记录战斗经验补偿前运行态。
 */
        const runtimeBeforeCombatCompensation = await waitForPlayerState(auth.playerId, () => true, 5000);
/**
 * 记录当前玩家预期战斗经验补偿。
 */
        const expectedCombatExpCompensation = getExpectedCombatExpCompensation(runtimeBeforeCombatCompensation);
/**
 * 记录combatexp补偿快捷执行结果。
 */
        const combatExpCompensationResult = assertGmShortcutRunRes(await authedRequestJson('/api/gm/shortcuts/compensation/combat-exp-2026-04-09', {
            method: 'POST',
            token: gmToken,
            body: {},
        }), 'gm shortcut compensate combat exp');
/**
 * 记录combatexp补偿后运行态。
 */
        const combatExpCompensatedRuntime = expectedCombatExpCompensation > 0
            ? await waitForPlayerState(auth.playerId, (player) => getNonNegativeInt(player?.combatExp) === getNonNegativeInt(runtimeBeforeCombatCompensation?.combatExp) + expectedCombatExpCompensation, 8000)
            : runtimeBeforeCombatCompensation;
/**
 * 记录底蕴补偿前运行态。
 */
        const runtimeBeforeFoundationCompensation = await waitForPlayerState(auth.playerId, () => true, 5000);
/**
 * 记录当前玩家预期底蕴补偿。
 */
        const expectedFoundationCompensation = getExpectedFoundationCompensation(runtimeBeforeFoundationCompensation);
/**
 * 记录foundation补偿快捷执行结果。
 */
        const foundationCompensationResult = assertGmShortcutRunRes(await authedRequestJson('/api/gm/shortcuts/compensation/foundation-2026-04-09', {
            method: 'POST',
            token: gmToken,
            body: {},
        }), 'gm shortcut compensate foundation');
/**
 * 记录foundation补偿后运行态。
 */
        const foundationCompensatedRuntime = expectedFoundationCompensation > 0
            ? await waitForPlayerState(auth.playerId, (player) => getNonNegativeInt(player?.foundation) === getNonNegativeInt(runtimeBeforeFoundationCompensation?.foundation) + expectedFoundationCompensation, 8000)
            : runtimeBeforeFoundationCompensation;
        await authedRequestJson(`/api/gm/players/${auth.playerId}/password`, {
            method: 'POST',
            token: gmToken,
            body: {
                password: gmChangedPassword,
            },
        });
/**
 * 记录reloginpayload。
 */
        const reloginPayload = await requestJson('/api/auth/login', {
            method: 'POST',
            body: {
                loginName: auth.loginName,
                password: gmChangedPassword,
            },
        });
/**
 * 记录reloginaccess令牌。
 */
        const reloginAccessToken = typeof reloginPayload?.accessToken === 'string' ? reloginPayload.accessToken : '';
        if (!reloginAccessToken) {
            throw new Error(`gm password change login missing token: ${JSON.stringify(reloginPayload)}`);
        }
/**
 * 记录relogindecoded。
 */
    const reloginDecoded = parseJwtPayload(reloginAccessToken);
/**
 * 记录relogin玩家ID。
 */
        const reloginPlayerId = resolveTokenPlayerId(reloginDecoded);
        if (reloginPlayerId !== auth.playerId) {
            throw new Error(`gm password change login player mismatch: expected ${auth.playerId} but got ${reloginPlayerId}`);
        }
        console.log(JSON.stringify({
            ok: true,
            url: SERVER_URL,
            answers: GM_MAINLINE_SMOKE_BOUNDARY.answers,
            excludes: GM_MAINLINE_SMOKE_BOUNDARY.excludes,
            completionMapping: GM_MAINLINE_SMOKE_BOUNDARY.completionMapping,
            playerId: auth.playerId,
            socket: {
                gmStateEvents: gmStateEvents.length,
                legacyGmStateEvents: gmStateEvents.filter((entry) => entry.kind === 'legacy').length,
                mainlineGmStateEvents: gmStateEvents.filter((entry) => entry.kind === 'mainline').length,
                bootstrap: {
                    initSessionCount: nextInit ? 1 : 0,
                    bootstrapCount,
                    mapEnterCount,
                    mapStaticCount,
                    realmCount,
                    worldDeltaCount,
                    selfDeltaCount,
                    panelDeltaCount,
                },
                protocolGuardRejectedCode: protocolGuardError?.code ?? null,
                legacyProtocolGuardRejectedCode: legacyProtocolGuardError?.code ?? null,
                gmSessionIdGuardRejectedCode: gmSessionIdGuardError?.code ?? null,
                spawnBotCount: socketSpawnBotCount,
                update: {
                    x: socketUpdatedRuntime.x,
                    y: socketUpdatedRuntime.y,
                    hp: socketUpdatedRuntime.hp,
                    autoBattle: socketUpdatedRuntime.combat?.autoBattle ?? false,
                },
                reset: {
                    mapId: socketResetRuntime.templateId,
                    hp: socketResetRuntime.hp,
                    maxHp: socketResetRuntime.maxHp,
                    autoBattle: socketResetRuntime.combat?.autoBattle ?? false,
                },
                finalBotCount: Number(socketRemoveObserved?.botCount ?? socketRemoveAck?.payload?.botCount ?? 0),
            },
            http: {
                update: {
                    x: httpUpdatedRuntime.x,
                    y: httpUpdatedRuntime.y,
                    hp: httpUpdatedRuntime.hp,
                    autoBattle: httpUpdatedRuntime.combat?.autoBattle ?? false,
                },
                reset: {
                    mapId: httpResetRuntime.templateId,
                    hp: httpResetRuntime.hp,
                    maxHp: httpResetRuntime.maxHp,
                    autoBattle: httpResetRuntime.combat?.autoBattle ?? false,
                },
                botCountAfterSpawn: Number(httpSpawnState?.botCount ?? 0),
                botCountAfterRemove: Number(httpRemoveState?.botCount ?? 0),
                playerSummary: summarizeGmPlayer(httpUpdatedGmState, auth.playerId),
                resetSummary: summarizeGmPlayer(httpResetGmState, auth.playerId),
                playerDetail: {
                    accountUsername: gmPlayerDetailBefore?.player?.account?.username ?? null,
                    bodyTrainingLevelBefore,
                    bodyTrainingLevelAfter: getBodyTrainingLevel(bodyTrainingUpdatedDetail?.player?.snapshot),
                    bodyTrainingRuntimeLevelAfter: getBodyTrainingLevel(bodyTrainingUpdatedRuntime),
                    foundationBefore,
                    foundationAfter: getNonNegativeInt(foundationUpdatedRuntime?.foundation),
                    combatExpBefore,
                    combatExpAfter: getNonNegativeInt(combatExpUpdatedRuntime?.combatExp),
                },
                mail: {
                    directMailId: String(directMail?.mailId ?? ''),
                    broadcastMailId: String(broadcastMail?.mailId ?? ''),
                    broadcastRecipientCount: Number(broadcastMail?.recipientCount ?? 0),
                    unreadCount: Number(mailSummaryAfter?.unreadCount ?? 0),
                    claimableCount: Number(mailSummaryAfter?.claimableCount ?? 0),
                    topMailIds: Array.isArray(mailPage?.items) ? mailPage.items.slice(0, 3).map((entry) => entry?.mailId ?? null) : [],
                },
                suggestions: {
                    suggestionId,
                    status: findSuggestion(completedSuggestions, suggestionId)?.status ?? null,
                    replyCount: Array.isArray(findSuggestion(completedSuggestions, suggestionId)?.replies)
                        ? findSuggestion(completedSuggestions, suggestionId).replies.length
                        : 0,
                },
                mapRuntime: {
                    mapId: httpResetRuntime.templateId,
                    tickSpeed: Number(mapRuntimeReloaded?.tickSpeed ?? 0),
                    tickPaused: mapRuntimeReloaded?.tickPaused === true,
                    timeScale: Number(mapRuntimeReloaded?.timeConfig?.scale ?? 0),
                    offsetTicks: Number(mapRuntimeReloaded?.timeConfig?.offsetTicks ?? 0),
                    entityCount: Array.isArray(mapRuntimeUpdated?.entities) ? mapRuntimeUpdated.entities.length : 0,
                },
                shortcuts: {
                    returnAllToDefaultSpawn: {
                        totalPlayers: returnAllPlayersResult.totalPlayers,
                        queuedRuntimePlayers: returnAllPlayersResult.queuedRuntimePlayers,
                        updatedOfflinePlayers: returnAllPlayersResult.updatedOfflinePlayers,
                        targetMapId: returnAllPlayersResult.targetMapId ?? null,
                        targetX: returnAllPlayersResult.targetX ?? null,
                        targetY: returnAllPlayersResult.targetY ?? null,
                        selectedPlayerMapId: returnAllPlayersRuntime.templateId,
                    },
                    cleanupInvalidItems: {
                        totalPlayers: cleanupInvalidItemsResult.totalPlayers,
                        inventoryStacksRemoved: cleanupInvalidItemsResult.totalInvalidInventoryStacksRemoved ?? 0,
                        marketStorageStacksRemoved: cleanupInvalidItemsResult.totalInvalidMarketStorageStacksRemoved ?? 0,
                        equipmentRemoved: cleanupInvalidItemsResult.totalInvalidEquipmentRemoved ?? 0,
                    },
                    combatExpCompensation: {
                        totalPlayers: combatExpCompensationResult.totalPlayers,
                        totalGranted: combatExpCompensationResult.totalCombatExpGranted ?? 0,
                        expectedForSelectedPlayer: expectedCombatExpCompensation,
                        selectedPlayerCombatExp: getNonNegativeInt(combatExpCompensatedRuntime?.combatExp),
                    },
                    foundationCompensation: {
                        totalPlayers: foundationCompensationResult.totalPlayers,
                        totalGranted: foundationCompensationResult.totalFoundationGranted ?? 0,
                        expectedForSelectedPlayer: expectedFoundationCompensation,
                        selectedPlayerFoundation: getNonNegativeInt(foundationCompensatedRuntime?.foundation),
                    },
                },
            },
            gmState: {
                initialPlayers: initialHttpState.players.length,
                initialMaps: initialHttpState.mapIds.length,
                cpuBreakdownCount: queriedHttpState?.perf?.cpu?.breakdown?.length ?? 0,
                networkInBucketCount: queriedHttpState?.perf?.networkInBuckets?.length ?? 0,
                networkOutBucketCount: queriedHttpState?.perf?.networkOutBuckets?.length ?? 0,
            },
            passwordChange: {
                verifiedPlayerId: reloginPlayerId,
                status: 'gm-password-update',
            },
            adminRead: {
                currentMap: {
                    id: currentMapSummary.id,
                    width: currentMapSummary.width,
                    height: currentMapSummary.height,
                },
                editorCatalog: editorCatalogSummary,
                runtimeInspection,
            },
        }, null, 2));
    }
    finally {
        protocolGuardSocket?.close();
        legacyProtocolGuardSocket?.close();
        gmSessionIdGuardSocket?.close();
        socket?.close();
        await cleanup(gmToken, auth?.playerId ?? '').catch(() => undefined);
    }
}
/**
 * 在烟测结束后清理临时角色和遗留测试数据。
 */
async function cleanup(gmToken, playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (gmToken) {
        await authedRequestJson('/api/gm/bots/remove', {
            method: 'POST',
            token: gmToken,
            body: { all: true },
        }).catch(() => undefined);
    }
    await deletePlayer(playerId).catch(() => undefined);
}
/**
 * 计算用于状态变更验证的目标血量。
 */
function computeReducedHp(currentHp, maxHp, preferredDelta) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录safemaxhp。
 */
    const safeMaxHp = Math.max(1, Math.trunc(maxHp || currentHp || 1));
/**
 * 记录safe当前值hp。
 */
    const safeCurrentHp = Math.max(1, Math.min(safeMaxHp, Math.trunc(currentHp || safeMaxHp)));
/**
 * 记录delta。
 */
    const delta = Math.max(1, Math.trunc(preferredDelta || 1));
    if (safeCurrentHp - delta >= 1) {
        return safeCurrentHp - delta;
    }
    if (safeMaxHp > 1) {
        return safeMaxHp - 1;
    }
    return 1;
}
/**
 * 注册并登录一个临时玩家，作为 GM 操作目标。
 */
async function registerAndLoginPlayer() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    let registered = false;
/**
 * 记录注册账号名。
 */
    let registeredAccountName = accountName;
    for (let attempt = 0; attempt < 4096; attempt += 1) {
/**
 * 记录候选显示名。
 */
        const candidateDisplayName = buildUniqueDisplayNameChar(suffix, attempt);
        if (candidateDisplayName.length !== 1) {
            throw new Error(`invalid displayName candidate length: ${candidateDisplayName.length}`);
        }
/**
 * 记录候选账号名。
 */
        const candidateAccountName = attempt === 0 ? accountName : `${accountName}${attempt.toString(36)}`;
/**
 * 记录候选角色名。
 */
        const candidateRoleName = attempt === 0 ? roleName : `${roleName}${attempt.toString(36)}`;
        try {
            await requestJson('/api/auth/register', {
                method: 'POST',
                body: {
                    accountName: candidateAccountName,
                    password,
                    displayName: candidateDisplayName,
                    roleName: candidateRoleName,
                },
            });
            registeredAccountName = candidateAccountName;
            registered = true;
            break;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!message.includes('显示名称已存在')
                && !message.includes('账号已存在')
                && !message.includes('角色名已存在')) {
                throw error;
            }
        }
    }
    if (!registered) {
        throw new Error('register failed: display name collision retries exhausted');
    }
/**
 * 记录login。
 */
    const login = await requestJson('/api/auth/login', {
        method: 'POST',
        body: {
            loginName: registeredAccountName,
            password,
        },
    });
/**
 * 记录payload。
 */
    const payload = parseJwtPayload(login?.accessToken);
    if (!payload?.sub || typeof login?.accessToken !== 'string') {
        throw new Error(`unexpected login payload: ${JSON.stringify(login)}`);
    }
    await ensureNativeDocsForAccessToken(login.accessToken);
    const playerId = resolveTokenPlayerId(payload);
    (0, smoke_player_auth_1.registerSmokePlayerForCleanup)(playerId, {
        serverUrl: SERVER_URL,
        databaseUrl: SERVER_DATABASE_URL,
    });
    return {
        accessToken: login.accessToken,
        playerId,
        loginName: registeredAccountName,
    };
}
/**
 * 在带库 smoke 中，确保 access token 对应账号已有 主线 identity/snapshot 真源文档。
 */
async function ensureNativeDocsForAccessToken(token) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!hasDatabaseUrl || typeof token !== 'string' || !token.trim()) {
        return;
    }
/**
 * 记录payload。
 */
    const payload = parseJwtPayload(token);
/**
 * 记录用户ID。
 */
    const tokenUserId = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
/**
 * 记录玩家ID。
 */
    let tokenPlayerId = normalizeMainlinePlayerId(typeof payload?.playerId === 'string' ? payload.playerId.trim() : '');
/**
 * 记录用户名。
 */
    let tokenUsername = typeof payload?.username === 'string' ? payload.username.trim() : '';
/**
 * 记录显示名。
 */
    let tokenDisplayName = typeof payload?.displayName === 'string' ? payload.displayName.trim() : '';
/**
 * 记录角色名。
 */
    let tokenPlayerName = typeof payload?.playerName === 'string' ? payload.playerName.trim() : tokenDisplayName;
    if (!tokenUserId) {
        return;
    }
    const pool = new pg_1.Pool({
        connectionString: SERVER_DATABASE_URL,
    });
    try {
        if (!tokenPlayerId) {
            const playerResult = await pool.query('SELECT id, name FROM players WHERE "userId" = $1::uuid LIMIT 1', [tokenUserId]);
            const playerRow = Array.isArray(playerResult?.rows) ? playerResult.rows[0] : null;
            tokenPlayerId = normalizeMainlinePlayerId(typeof playerRow?.id === 'string' ? playerRow.id.trim() : tokenPlayerId);
            if (!tokenPlayerName) {
                tokenPlayerName = typeof playerRow?.name === 'string' ? playerRow.name.trim() : tokenPlayerName;
            }
        }
        if (!tokenUsername || !tokenDisplayName) {
            const userResult = await pool.query('SELECT username, "displayName" FROM users WHERE id = $1::uuid LIMIT 1', [tokenUserId]);
            const userRow = Array.isArray(userResult?.rows) ? userResult.rows[0] : null;
            if (!tokenUsername) {
                tokenUsername = typeof userRow?.username === 'string' ? userRow.username.trim() : tokenUsername;
            }
            if (!tokenDisplayName) {
                tokenDisplayName = typeof userRow?.displayName === 'string' ? userRow.displayName.trim() : tokenDisplayName;
            }
        }
        if (!tokenPlayerName) {
            tokenPlayerName = tokenDisplayName;
        }
        if (!tokenPlayerId || !tokenUsername || !tokenDisplayName || !tokenPlayerName) {
            return;
        }
        await pool.query(`
      INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
      VALUES ($1, $2, $3::jsonb, now())
      ON CONFLICT (scope, key)
      DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
    `, ['server_player_identities_v1', tokenUserId, JSON.stringify({
                version: 1,
                userId: tokenUserId,
                username: tokenUsername,
                displayName: tokenDisplayName,
                playerId: tokenPlayerId,
                playerName: tokenPlayerName,
                persistedSource: 'token_seed',
                updatedAt: Date.now(),
            })]);
        await pool.query(`
      INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
      VALUES ($1, $2, $3::jsonb, now())
      ON CONFLICT (scope, key)
      DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
    `, ['server_player_snapshots_v1', tokenPlayerId, JSON.stringify({
                version: 1,
                savedAt: Date.now(),
                placement: {
                    templateId: 'yunlai_town',
                    x: 32,
                    y: 5,
                    facing: 1,
                },
                vitals: {
                    hp: 100,
                    maxHp: 100,
                    qi: 0,
                    maxQi: 100,
                },
                progression: {
                    foundation: 0,
                    combatExp: 0,
                    bodyTraining: null,
                    boneAgeBaseYears: 18,
                    lifeElapsedTicks: 0,
                    lifespanYears: null,
                    realm: null,
                    heavenGate: null,
                    spiritualRoots: null,
                },
                unlockedMapIds: ['yunlai_town'],
                inventory: {
                    revision: 1,
                    capacity: 24,
                    items: [],
                },
                equipment: {
                    revision: 1,
                    slots: [],
                },
                techniques: {
                    revision: 1,
                    techniques: [],
                    cultivatingTechId: null,
                },
                buffs: {
                    revision: 1,
                    buffs: [],
                },
                quests: {
                    revision: 1,
                    entries: [],
                },
                combat: {
                    autoBattle: false,
                    autoRetaliate: true,
                    autoBattleStationary: false,
                    combatTargetId: null,
                    combatTargetLocked: false,
                    allowAoePlayerHit: false,
                    autoIdleCultivation: true,
                    autoSwitchCultivation: false,
                    senseQiActive: false,
                    autoBattleSkills: [],
                },
                pendingLogbookMessages: [],
                runtimeBonuses: [],
                __snapshotMeta: {
                    persistedSource: 'token_seed',
                    seededAt: Date.now(),
                },
            })]);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
/**
 * 登录 GM 接口并获取后续请求所需令牌。
 */
async function loginGm() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录payload。
 */
    const payload = await requestJson('/api/auth/gm/login', {
        method: 'POST',
        body: {
            password: GM_PASSWORD,
        },
    });
/**
 * 记录令牌。
 */
    const token = typeof payload?.accessToken === 'string' ? payload.accessToken.trim() : '';
    if (!token) {
        throw new Error(`unexpected GM login payload: ${JSON.stringify(payload)}`);
    }
    return token;
}
/**
 * 在本地带库 proof 环境下，把 GM 密码记录重置成当前 env 口径，避免历史持久化密码污染 smoke。
 */
async function resetLocalGmPasswordRecordIfNeeded() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!hasDatabaseUrl) {
        return;
    }
    if (!SERVER_URL.startsWith('http://127.0.0.1:')) {
        return;
    }
    const pool = new pg_1.Pool({
        connectionString: SERVER_DATABASE_URL,
    });
    try {
        await pool.query('DELETE FROM server_gm_auth WHERE record_key = $1', [next_gm_contract_1.GM_AUTH_CONTRACT.passwordRecordKey]).catch((error) => {
            if (!error || typeof error !== 'object' || error.code !== '42P01') {
                throw error;
            }
        });
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
/**
 * 统一发送 JSON 请求并校验基础响应格式。
 */
async function requestJson(path, init = {}) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录请求体。
 */
    const body = init.body === undefined ? undefined : JSON.stringify(init.body);
/**
 * 记录headers。
 */
    const headers = {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    };
/**
 * 记录response。
 */
    const response = await fetch(`${SERVER_URL}${path}`, {
        method: init.method ?? 'GET',
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        body,
    });
    if (!response.ok) {
        throw new Error(`request failed: ${init.method ?? 'GET'} ${path}: ${response.status} ${await response.text()}`);
    }
    if (response.status === 204) {
        return null;
    }
    return response.json();
}
/**
 * 发送原始 HTTP 请求，供未授权/非 JSON 场景验证使用。
 */
async function requestRaw(path, init = {}) {
/**
 * 记录请求体。
 */
    const body = init.body === undefined ? undefined : JSON.stringify(init.body);
/**
 * 记录headers。
 */
    const headers = {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(init.headers ?? {}),
    };
    return fetch(`${SERVER_URL}${path}`, {
        method: init.method ?? 'GET',
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        body,
    });
}
/**
 * 处理authedgetjson。
 */
async function authedGetJson(path, token) {
    return requestJson(path, {
        method: 'GET',
        token,
    });
}
/**
 * 附带 GM 令牌发送授权请求。
 */
async function authedRequestJson(path, init) {
    return requestJson(path, init);
}
/**
 * 处理fetch玩家状态。
 */
async function fetchPlayerState(playerId) {
    return requestJson(`/runtime/players/${playerId}/state`, {
        method: 'GET',
    });
}
/**
 * 处理fetchGM玩家详情。
 */
async function fetchGmPlayerDetail(token, playerId) {
/**
 * 记录payload。
 */
    const payload = await authedGetJson(`/api/gm/players/${playerId}`, token);
    return assertGmPlayerDetailShape(payload, `/api/gm/players/${playerId}`);
}
/**
 * 处理fetch玩家地块详情。
 */
async function fetchPlayerTileDetail(playerId, x, y) {
    return requestJson(`/runtime/players/${playerId}/tile-detail?x=${Math.trunc(x)}&y=${Math.trunc(y)}`, {
        method: 'GET',
    });
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
    const payload = await requestJson(`/runtime/players/${playerId}/mail/page?page=1&pageSize=10`, {
        method: 'GET',
    });
    return payload?.page ?? null;
}
/**
 * 等待formail汇总。
 */
async function waitForMailSummary(playerId, predicate, timeoutMs, label) {
/**
 * 记录resolved。
 */
    let resolved = null;
    await waitFor(async () => {
/**
 * 记录汇总。
 */
        const summary = await fetchMailSummary(playerId);
        if (!summary || !(await predicate(summary))) {
            return false;
        }
        resolved = summary;
        return true;
    }, timeoutMs, label);
    return resolved;
}
/**
 * 等待formailpage。
 */
async function waitForMailPage(playerId, predicate, timeoutMs, label) {
/**
 * 记录resolved。
 */
    let resolved = null;
    await waitFor(async () => {
/**
 * 记录page。
 */
        const page = await fetchMailPage(playerId);
        if (!page || !(await predicate(page))) {
            return false;
        }
        resolved = page;
        return true;
    }, timeoutMs, label);
    return resolved;
}
/**
 * 轮询 GM 玩家详情直到满足指定断言。
 */
async function waitForGmPlayerDetail(token, playerId, predicate, timeoutMs, label) {
/**
 * 记录resolved。
 */
    let resolved = null;
    await waitFor(async () => {
/**
 * 记录payload。
 */
        const payload = await fetchGmPlayerDetail(token, playerId);
        if (!(await predicate(payload))) {
            return false;
        }
        resolved = payload;
        return true;
    }, timeoutMs, label);
    return resolved;
}
/**
 * 轮询玩家运行态，直到满足指定断言。
 */
async function waitForPlayerState(playerId, predicate, timeoutMs) {
/**
 * 记录resolved。
 */
    let resolved = null;
    await waitFor(async () => {
/**
 * 记录payload。
 */
        const payload = await fetchPlayerState(playerId);
/**
 * 记录玩家。
 */
        const player = payload?.player ?? null;
        if (!player) {
            return false;
        }
        if (!(await predicate(player, payload))) {
            return false;
        }
        resolved = player;
        return true;
    }, timeoutMs, `player state ${playerId}`);
    return resolved;
}
/**
 * 为 GM 改位测试寻找附近可落点坐标。
 */
async function findNearbyWalkablePosition(token, playerId, mapId, x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录搜索半径。
 */
    const searchRadius = 8;
/**
 * 记录startx。
 */
    const startX = Math.max(0, Math.trunc(x) - searchRadius);
/**
 * 记录starty。
 */
    const startY = Math.max(0, Math.trunc(y) - searchRadius);
/**
 * 记录运行态。
 */
    const runtime = await authedGetJson(`/api/gm/maps/${mapId}/runtime?x=${startX}&y=${startY}&w=${searchRadius * 2 + 1}&h=${searchRadius * 2 + 1}&viewerId=${encodeURIComponent(playerId)}`, token);
/**
 * 记录tiles。
 */
    const tiles = Array.isArray(runtime?.tiles) ? runtime.tiles : [];
/**
 * 记录occupiedkeys。
 */
    const occupiedKeys = new Set((Array.isArray(runtime?.entities) ? runtime.entities : [])
        .filter((entry) => entry
        && entry.id !== playerId
        && Number.isFinite(entry.x)
        && Number.isFinite(entry.y))
        .map((entry) => `${Math.trunc(entry.x)},${Math.trunc(entry.y)}`));
/**
 * 记录候补坐标。
 */
    let fallback = null;
    for (let row = 0; row < tiles.length; row += 1) {
/**
 * 记录line。
 */
        const line = Array.isArray(tiles[row]) ? tiles[row] : [];
        for (let column = 0; column < line.length; column += 1) {
/**
 * 记录tile。
 */
            const tile = line[column];
            if (!tile || tile.walkable !== true) {
                continue;
            }
/**
 * 记录candidatex。
 */
            const candidateX = startX + column;
/**
 * 记录candidatey。
 */
            const candidateY = startY + row;
            if (candidateX === x && candidateY === y) {
                continue;
            }
            if (occupiedKeys.has(`${candidateX},${candidateY}`)) {
                continue;
            }
            if (!fallback) {
                fallback = { x: candidateX, y: candidateY };
            }
            const detail = await fetchPlayerTileDetail(playerId, candidateX, candidateY);
            if (detail?.safeZone) {
                continue;
            }
            return { x: candidateX, y: candidateY };
        }
    }
    return fallback ?? { x, y };
}
/**
 * 处理inspect地图运行态。
 */
async function inspectMapRuntime(token, playerId, mapId, x, y) {
/**
 * 记录startx。
 */
    const startX = Math.max(0, Math.trunc(x) - 2);
/**
 * 记录starty。
 */
    const startY = Math.max(0, Math.trunc(y) - 2);
/**
 * 记录运行态。
 */
    const runtime = await authedGetJson(`/api/gm/maps/${mapId}/runtime?x=${startX}&y=${startY}&w=5&h=5&viewerId=${encodeURIComponent(playerId)}`, token);
    return assertMapRuntimeShape(runtime, mapId, playerId);
}
/**
 * 发出 GM socket 事件并等待匹配的状态回包。
 */
async function emitAndWaitForGmState(socket, gmStateEvents, socketError, event, payload, predicate, timeoutMs, label) {
/**
 * 记录before数量。
 */
    const beforeCount = gmStateEvents.length;
    socket.emit(event, payload);
/**
 * 记录resolved。
 */
    let resolved = null;
    await waitFor(() => {
        throwIfSocketError(socketError);
        for (let index = beforeCount; index < gmStateEvents.length; index += 1) {
/**
 * 记录当前值。
 */
            const current = gmStateEvents[index];
            if (predicate(current)) {
                resolved = current;
                return true;
            }
        }
        return false;
    }, timeoutMs, label);
    return resolved;
}
/**
 * 等待forGM状态。
 */
async function waitForGmState(token, predicate, timeoutMs, label) {
/**
 * 记录resolved。
 */
    let resolved = null;
    await waitFor(async () => {
/**
 * 记录payload。
 */
        const payload = await authedGetJson('/api/gm/state', token);
        assertGmStateShape(payload, label);
        if (!(await predicate(payload))) {
            return false;
        }
        resolved = payload;
        return true;
    }, timeoutMs, label);
    return resolved;
}
/**
 * 处理fetchGMsuggestions。
 */
async function fetchGmSuggestions(token) {
    return authedGetJson('/api/gm/suggestions?page=1&pageSize=20', token);
}
/**
 * 轮询 GM 建议列表直到建议状态满足预期。
 */
async function waitForGmSuggestions(token, predicate, timeoutMs, label) {
/**
 * 记录resolved。
 */
    let resolved = null;
    await waitFor(async () => {
/**
 * 记录payload。
 */
        const payload = await fetchGmSuggestions(token);
        if (!Array.isArray(payload?.items) || !(await predicate(payload))) {
            return false;
        }
        resolved = payload;
        return true;
    }, timeoutMs, label);
    return resolved;
}
/**
 * 处理fetchGM地图运行态。
 */
async function fetchGmMapRuntime(token, mapId, viewerId, x, y) {
/**
 * 记录startx。
 */
    const startX = Math.max(0, Math.trunc(x) - 2);
/**
 * 记录starty。
 */
    const startY = Math.max(0, Math.trunc(y) - 2);
    return authedGetJson(`/api/gm/maps/${mapId}/runtime?x=${startX}&y=${startY}&w=5&h=5&viewerId=${encodeURIComponent(viewerId)}`, token);
}
/**
 * 等待forGM地图运行态。
 */
async function waitForGmMapRuntime(token, mapId, viewerId, x, y, predicate, timeoutMs, label) {
/**
 * 记录resolved。
 */
    let resolved = null;
    await waitFor(async () => {
/**
 * 记录运行态。
 */
        const runtime = await fetchGmMapRuntime(token, mapId, viewerId, x, y);
        if (!runtime || !(await predicate(runtime))) {
            return false;
        }
        resolved = runtime;
        return true;
    }, timeoutMs, label);
    return resolved;
}
/**
 * 同时校验运行态和 GM 摘要中的玩家状态是否已一致更新。
 */
async function waitForRuntimeAndGmPlayerState(playerId, token, predicate, timeoutMs, label) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录resolved。
 */
    let resolved = null;
/**
 * 记录最后观测。
 */
    let lastObserved = null;
    try {
        await waitFor(async () => {
            const [runtimePayload, gmPayload] = await Promise.all([
                fetchPlayerState(playerId),
                authedGetJson('/api/gm/state', token),
            ]);
            assertGmStateShape(gmPayload, label);
/**
 * 记录运行态。
 */
            const runtime = runtimePayload?.player ?? null;
/**
 * 记录汇总。
 */
            const summary = summarizeGmPlayer(gmPayload, playerId);
            lastObserved = {
                runtime: runtime ? summarizeRuntimePlayer(runtime) : null,
                summary: summary ? summarizeObservedGmPlayer(summary) : null,
            };
            if (!runtime || !summary) {
                return false;
            }
            if (!(await predicate(runtime, summary, runtimePayload, gmPayload))) {
                return false;
            }
            resolved = {
                runtime,
                summary,
                gmState: gmPayload,
            };
            return true;
        }, timeoutMs, label);
    }
    catch (error) {
        if (error instanceof Error && `${error.message}`.includes(`${label} timeout`) && lastObserved) {
            throw new Error(`${label} timeout; lastObserved=${JSON.stringify(lastObserved)}`);
        }
        throw error;
    }
    return resolved;
}
/**
 * 等待forsocketGM状态。
 */
async function waitForSocketGmState(gmStateEvents, socketError, playerId, expected, timeoutMs, label) {
/**
 * 记录resolved。
 */
    let resolved = null;
    await waitFor(() => {
        throwIfSocketError(socketError);
        for (let index = 0; index < gmStateEvents.length; index += 1) {
/**
 * 记录当前值。
 */
            const current = gmStateEvents[index];
            if (!hasGmPlayerSummary(current?.payload, playerId, (player) => matchesUpdatedSummary(player, expected))) {
                continue;
            }
            resolved = current;
            return true;
        }
        return false;
    }, timeoutMs, label);
    return resolved;
}
/**
 * 断言GM状态shape。
 */
function assertGmStateShape(payload, label) {
    if (!Array.isArray(payload?.players)
        || !Array.isArray(payload?.mapIds)
        || !Number.isFinite(payload?.botCount)
        || !Number.isFinite(payload?.playerPage?.page)
        || !Number.isFinite(payload?.playerPage?.pageSize)
        || !Number.isFinite(payload?.playerPage?.total)
        || !Number.isFinite(payload?.playerPage?.totalPages)
        || typeof payload?.playerPage?.keyword !== 'string'
        || typeof payload?.playerPage?.sort !== 'string'
        || !Number.isFinite(payload?.playerStats?.totalPlayers)
        || !Number.isFinite(payload?.playerStats?.onlinePlayers)
        || !Number.isFinite(payload?.playerStats?.offlineHangingPlayers)
        || !Number.isFinite(payload?.playerStats?.offlinePlayers)
        || typeof payload?.perf !== 'object'
        || payload?.perf === null) {
        throw new Error(`unexpected ${label} payload: ${JSON.stringify(payload)}`);
    }
}
/**
 * 断言 GM 性能热点数据不为空。
 */
function assertGmPerfHotspots(payload, label) {
    if (!Array.isArray(payload?.perf?.cpu?.breakdown) || payload.perf.cpu.breakdown.length <= 0) {
        throw new Error(`unexpected ${label} cpu breakdown payload: ${JSON.stringify(payload?.perf?.cpu)}`);
    }
    if (!Array.isArray(payload?.perf?.networkInBuckets) || payload.perf.networkInBuckets.length <= 0) {
        throw new Error(`unexpected ${label} network in buckets payload: ${JSON.stringify(payload?.perf)}`);
    }
    if (!Array.isArray(payload?.perf?.networkOutBuckets) || payload.perf.networkOutBuckets.length <= 0) {
        throw new Error(`unexpected ${label} network out buckets payload: ${JSON.stringify(payload?.perf)}`);
    }
}
/**
 * 断言 GM 玩家详情结构。
 */
function assertGmPlayerDetailShape(payload, label) {
    if (typeof payload?.player?.id !== 'string'
        || !payload.player.id.trim()
        || typeof payload?.player?.snapshot !== 'object'
        || payload.player.snapshot === null
        || typeof payload?.player?.name !== 'string'
        || typeof payload?.player?.roleName !== 'string'
        || !Array.isArray(payload?.player?.databaseTables)) {
        throw new Error(`unexpected ${label} payload: ${JSON.stringify(payload)}`);
    }
    return payload;
}
/**
 * 断言 GM 快捷执行结果结构。
 */
function assertGmShortcutRunRes(payload, label) {
    if (payload?.ok !== true
        || !Number.isFinite(payload?.totalPlayers)
        || !Number.isFinite(payload?.queuedRuntimePlayers)
        || !Number.isFinite(payload?.updatedOfflinePlayers)) {
        throw new Error(`unexpected ${label} payload: ${JSON.stringify(payload)}`);
    }
    if (payload.totalPlayers !== payload.queuedRuntimePlayers + payload.updatedOfflinePlayers) {
        throw new Error(`unexpected ${label} player totals: ${JSON.stringify(payload)}`);
    }
    return payload;
}
/**
 * 读取非负整数。
 */
function getNonNegativeInt(value) {
    return Math.max(0, Math.trunc(Number(value) || 0));
}
/**
 * 读取炼体等级。
 */
function getBodyTrainingLevel(snapshot) {
    return getNonNegativeInt(snapshot?.bodyTraining?.level);
}
/**
 * 计算当前玩家预期战斗经验补偿。
 */
function getExpectedCombatExpCompensation(player) {
    return getNonNegativeInt(player?.realm?.progressToNext) + getNonNegativeInt(shared_1.normalizeBodyTrainingState(player?.bodyTraining).expToNext);
}
/**
 * 计算当前玩家预期底蕴补偿。
 */
function getExpectedFoundationCompensation(player) {
    return getNonNegativeInt(player?.realm?.progressToNext) * 5;
}
/**
 * 校验 GM 状态查询参数确实被服务端消费，而不是只回默认列表。
 */
function assertGmStateQueryContract(payload, expected) {
    if (payload?.playerPage?.pageSize !== expected.pageSize) {
        throw new Error(`unexpected gm state pageSize: ${JSON.stringify(payload?.playerPage ?? null)}`);
    }
    if (payload?.playerPage?.sort !== expected.sort) {
        throw new Error(`unexpected gm state sort: ${JSON.stringify(payload?.playerPage ?? null)}`);
    }
    if (payload?.playerPage?.keyword !== expected.keyword) {
        throw new Error(`unexpected gm state keyword: ${JSON.stringify(payload?.playerPage ?? null)}`);
    }
    if (!Array.isArray(payload?.players) || payload.players.length === 0) {
        throw new Error(`gm state query unexpectedly empty: ${JSON.stringify(payload)}`);
    }
    if (payload.players.length > expected.pageSize) {
        throw new Error(`gm state query exceeded pageSize: ${JSON.stringify({ length: payload.players.length, pageSize: expected.pageSize })}`);
    }
    if (!payload.players.some((entry) => entry?.id === expected.expectedPlayerId)) {
        throw new Error(`gm state query missing expected player ${expected.expectedPlayerId}: ${JSON.stringify(payload.players)}`);
    }
    if (!payload.players.every((entry) => typeof entry?.accountName === 'string' && entry.accountName.toLowerCase().includes(expected.keyword.toLowerCase()))) {
        throw new Error(`gm state keyword filter did not constrain accountName as expected: ${JSON.stringify(payload.players)}`);
    }
    for (let index = 1; index < payload.players.length; index += 1) {
        const previous = payload.players[index - 1];
        const current = payload.players[index];
        const previousName = typeof previous?.roleName === 'string' ? previous.roleName : '';
        const currentName = typeof current?.roleName === 'string' ? current.roleName : '';
        if (previousName.localeCompare(currentName, 'zh-Hans-CN') > 0) {
            throw new Error(`gm state name sort is not ascending: ${JSON.stringify(payload.players.map((entry) => entry?.roleName ?? null))}`);
        }
    }
}
/**
 * 校验 GM 地图列表返回结构是否符合兼容预期。
 */
function assertGmMapsShape(payload, expectedMapId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Array.isArray(payload?.maps) || payload.maps.length === 0) {
        throw new Error(`unexpected gm maps payload: ${JSON.stringify(payload)}`);
    }
/**
 * 记录汇总。
 */
    const summary = payload.maps.find((entry) => entry?.id === expectedMapId);
    if (!summary || !Number.isFinite(summary.width) || !Number.isFinite(summary.height)) {
        throw new Error(`missing current map summary for ${expectedMapId}: ${JSON.stringify(payload)}`);
    }
    return summary;
}
/**
 * 断言编辑器目录shape。
 */
function assertEditorCatalogShape(payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录items。
 */
    const items = Array.isArray(payload?.items) ? payload.items : null;
/**
 * 记录techniques。
 */
    const techniques = Array.isArray(payload?.techniques) ? payload.techniques : null;
/**
 * 记录境界levels。
 */
    const realmLevels = Array.isArray(payload?.realmLevels) ? payload.realmLevels : null;
/**
 * 记录buffs。
 */
    const buffs = Array.isArray(payload?.buffs) ? payload.buffs : null;
    if (!items || !techniques || !realmLevels || !buffs) {
        throw new Error(`unexpected gm editor catalog payload: ${JSON.stringify(payload)}`);
    }
    if (items.length === 0 || techniques.length === 0 || realmLevels.length === 0) {
        throw new Error(`gm editor catalog unexpectedly empty: ${JSON.stringify({
            items: items.length,
            techniques: techniques.length,
            realmLevels: realmLevels.length,
            buffs: buffs.length,
        })}`);
    }
    return {
        itemCount: items.length,
        techniqueCount: techniques.length,
        realmLevelCount: realmLevels.length,
        buffCount: buffs.length,
    };
}
/**
 * 校验 GM 地图运行态详情返回结构是否完整可用。
 */
function assertMapRuntimeShape(payload, expectedMapId, playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (payload?.mapId !== expectedMapId || !Array.isArray(payload?.tiles) || !Array.isArray(payload?.entities)) {
        throw new Error(`unexpected gm map runtime payload: ${JSON.stringify(payload)}`);
    }
/**
 * 汇总tile行数据。
 */
    const tileRows = payload.tiles;
    if (tileRows.length === 0 || !Array.isArray(tileRows[0]) || tileRows[0].length === 0) {
        throw new Error(`gm map runtime tiles unexpectedly empty: ${JSON.stringify(payload)}`);
    }
/**
 * 记录玩家entity。
 */
    const playerEntity = payload.entities.find((entry) => entry?.id === playerId);
    if (!playerEntity || playerEntity.kind !== 'player') {
        throw new Error(`gm map runtime missing player entity ${playerId}: ${JSON.stringify(payload.entities)}`);
    }
    return {
        mapId: payload.mapId,
        tileRows: tileRows.length,
        tileColumns: Array.isArray(tileRows[0]) ? tileRows[0].length : 0,
        entityCount: payload.entities.length,
        playerEntityKind: playerEntity.kind,
    };
}
/**
 * 确认收到的是 legacy GM 状态包而不是异常格式。
 */
function assertLegacyGmState(entry, label) {
    if (entry?.kind !== 'legacy') {
        throw new Error(`expected legacy gm state for ${label}, got ${entry?.kind ?? 'none'}`);
    }
}
/**
 * 确认收到的是主线 GM 状态包而不是异常格式。
 */
function assertMainlineGmState(entry, label) {
    if (entry?.kind !== 'mainline') {
        throw new Error(`expected mainline gm state for ${label}, got ${entry?.kind ?? 'none'}`);
    }
}
/**
 * 判断是否已GM玩家汇总。
 */
function hasGmPlayerSummary(payload, playerId, predicate) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录玩家。
 */
    const player = summarizeGmPlayer(payload, playerId);
    if (!player) {
        return false;
    }
    return predicate(player);
}
/**
 * 处理summarizeGM玩家。
 */
function summarizeGmPlayer(payload, playerId) {
    return Array.isArray(payload?.players)
        ? payload.players.find((entry) => entry?.id === playerId) ?? null
        : null;
}
/**
 * 查找suggestion。
 */
function findSuggestion(payload, suggestionId) {
    return Array.isArray(payload?.items)
        ? payload.items.find((entry) => entry?.id === suggestionId) ?? null
        : null;
}
/**
 * 判断是否updatedposition状态。
 */
function isUpdatedPositionState(player, expected) {
    return player.templateId === expected.nextMapId
        && (expected.autoBattle === undefined || (player.combat?.autoBattle ?? false) === expected.autoBattle)
        && hasMeaningfulPlayerUpdate(player.templateId, player.x, player.y, player.hp, player.combat?.autoBattle ?? false, expected)
        && (expected.expectedX === undefined || player.x === expected.expectedX)
        && (expected.expectedY === undefined || player.y === expected.expectedY);
}
/**
 * 判断是否匹配updated汇总。
 */
function matchesUpdatedSummary(player, expected) {
    return player.mapId === expected.nextMapId
        && (expected.autoBattle === undefined || player.autoBattle === expected.autoBattle)
        && hasMeaningfulPlayerUpdate(player.mapId, player.x, player.y, player.hp, player.autoBattle, expected)
        && (expected.expectedX === undefined || player.x === expected.expectedX)
        && (expected.expectedY === undefined || player.y === expected.expectedY);
}
/**
 * 判断运行态与 GM 摘要是否对同一份更新收敛一致。
 */
function matchesUpdatedRuntimeAndSummary(runtime, summary, expected) {
    return runtime.templateId === expected.nextMapId
        && summary.mapId === expected.nextMapId
        && runtime.x === summary.x
        && runtime.y === summary.y
        && runtime.hp === summary.hp
        && Boolean(runtime.combat?.autoBattle) === Boolean(summary.autoBattle)
        && isUpdatedPositionState(runtime, expected)
        && matchesUpdatedSummary(summary, expected);
}
/**
 * 判断是否已relocatedposition。
 */
function hasRelocatedPosition(x, y, previousX, previousY) {
    return x !== previousX || y !== previousY;
}
/**
 * 判断 GM 更新后是否至少有一项目标字段真实变化。
 */
function hasMeaningfulPlayerUpdate(mapId, x, y, hp, autoBattle, expected) {
    return mapId !== expected.previousMapId
        || hasRelocatedPosition(x, y, expected.previousX, expected.previousY)
        || hp !== expected.previousHp
        || autoBattle !== expected.previousAutoBattle;
}
/**
 * 压缩运行态玩家字段，便于超时诊断。
 */
function summarizeRuntimePlayer(player) {
    return player
        ? {
            mapId: player.templateId ?? null,
            x: Number.isFinite(player.x) ? Math.trunc(player.x) : null,
            y: Number.isFinite(player.y) ? Math.trunc(player.y) : null,
            hp: Number.isFinite(player.hp) ? Math.trunc(player.hp) : null,
            maxHp: Number.isFinite(player.maxHp) ? Math.trunc(player.maxHp) : null,
            autoBattle: Boolean(player.combat?.autoBattle),
        }
        : null;
}
/**
 * 压缩 GM 摘要字段，便于超时诊断。
 */
function summarizeObservedGmPlayer(player) {
    return player
        ? {
            mapId: player.mapId ?? null,
            x: Number.isFinite(player.x) ? Math.trunc(player.x) : null,
            y: Number.isFinite(player.y) ? Math.trunc(player.y) : null,
            hp: Number.isFinite(player.hp) ? Math.trunc(player.hp) : null,
            maxHp: Number.isFinite(player.maxHp) ? Math.trunc(player.maxHp) : null,
            autoBattle: Boolean(player.autoBattle),
            dead: Boolean(player.dead),
        }
        : null;
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

    const tokenPlayerId = normalizeMainlinePlayerId(typeof payload?.playerId === 'string' ? payload.playerId.trim() : '');
    if (tokenPlayerId) {
        return tokenPlayerId;
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
 * 等待for。
 */
async function waitFor(predicate, timeoutMs, label) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录startedat。
 */
    const startedAt = Date.now();
    while (true) {
        if (await predicate()) {
            return;
        }
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error(`${label} timeout`);
        }
        await delay(100);
    }
}
/**
 * 处理delay。
 */
function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
/**
 * resolveExpectedLegacySocketProtocolGuardCode：规范化或转换ExpectedLegacySocketProtocolGuardCode。
 * @returns 无返回值，直接更新ExpectedLegacySocketProtocolGuardCode相关状态。
 */

function resolveExpectedLegacySocketProtocolGuardCode() {
    return LEGACY_SOCKET_PROTOCOL_ENABLED ? 'AUTH_PROTOCOL_MISMATCH' : 'LEGACY_PROTOCOL_DISABLED';
}
/**
 * readBooleanEnv：读取BooleanEnv并返回结果。
 * @param key 参数说明。
 * @returns 无返回值，完成BooleanEnv的读取/组装。
 */

function readBooleanEnv(key) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const value = process.env[key];
    if (typeof value !== 'string') {
        return false;
    }
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}
/**
 * 生成满足“1 个字符”约束且可重试的显示名。
 */
function buildUniqueDisplayNameChar(seed, attempt) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录source。
 */
    const source = `${seed}:${attempt}`;
/**
 * 记录hash。
 */
    let hash = 0;
    for (let index = 0; index < source.length; index += 1) {
        hash = (hash * 131 + source.charCodeAt(index)) >>> 0;
    }
    return String.fromCharCode(0x4e00 + ((hash + attempt) % 0x4fff));
}
/**
 * 处理throwifsocketerror。
 */
function throwIfSocketError(error) {
    if (error instanceof Error) {
        throw error;
    }
}
/**
 * 处理delete玩家。
 */
async function deletePlayer(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    await (0, smoke_player_cleanup_1.purgeSmokePlayerArtifactsByPlayerId)(playerId, {
        serverUrl: SERVER_URL,
        databaseUrl: SERVER_DATABASE_URL,
    });
}
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    await (0, smoke_player_auth_1.flushRegisteredSmokePlayers)();
});

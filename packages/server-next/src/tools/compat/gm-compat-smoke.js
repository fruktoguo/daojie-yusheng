"use strict";
/**
 * 用途：执行 gm-compat 兼容链路的冒烟验证。
 */

Object.defineProperty(exports, "__esModule", { value: true });
/** pg_1：定义该变量以承载业务值。 */
const pg_1 = require("pg");
/** socket_io_client_1：定义该变量以承载业务值。 */
const socket_io_client_1 = require("socket.io-client");
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** env_alias_1：定义该变量以承载业务值。 */
const env_alias_1 = require("../../config/env-alias");
/**
 * 指定烟测要连接的 server-next 地址。
 */
const SERVER_NEXT_URL = (0, env_alias_1.resolveServerNextUrl)() || 'http://127.0.0.1:3111';
/**
 * 读取数据库连接串，用于决定是否走带数据库真源补齐分支。
 */
const SERVER_NEXT_DATABASE_URL = (0, env_alias_1.resolveServerNextDatabaseUrl)();
/**
 * 标记当前是否具备数据库环境。
 */
const hasDatabaseUrl = Boolean(SERVER_NEXT_DATABASE_URL);
/** LEGACY_HTTP_MEMORY_FALLBACK_ENABLED：定义该变量以承载业务值。 */
const LEGACY_HTTP_MEMORY_FALLBACK_ENABLED = readBooleanEnv('SERVER_NEXT_ALLOW_LEGACY_HTTP_MEMORY_FALLBACK')
    || readBooleanEnv('NEXT_ALLOW_LEGACY_HTTP_MEMORY_FALLBACK');
/** LEGACY_SOCKET_PROTOCOL_ENABLED：定义该变量以承载业务值。 */
const LEGACY_SOCKET_PROTOCOL_ENABLED = readBooleanEnv('SERVER_NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL')
    || readBooleanEnv('NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL');
/**
 * 读取 GM 登录密码，供兼容链路验证使用。
 */
const GM_PASSWORD = (0, env_alias_1.resolveServerNextGmPassword)('admin123');
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
/**
 * 串联 socket GM、HTTP GM、邮件、建议和地图控制等兼容验证流程。
 */
async function main() {
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
 * 记录socket。
 */
    let socket = null;
    if (!hasDatabaseUrl && !LEGACY_HTTP_MEMORY_FALLBACK_ENABLED) {
        console.log(JSON.stringify({
            ok: true,
            url: SERVER_NEXT_URL,
            skipped: true,
            reason: 'no_db_legacy_http_memory_fallback_disabled',
        }, null, 2));
        return;
    }
    auth = await registerAndLoginPlayer();
    gmToken = await loginGm();
    protocolGuardSocket = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
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
    protocolGuardSocket.on(shared_1.NEXT_S2C.Error, (payload) => {
        protocolGuardError = payload ?? null;
    });
    await onceConnected(protocolGuardSocket);
    await waitFor(() => {
        return protocolGuardError?.code === 'AUTH_PROTOCOL_REQUIRED';
    }, 5000, 'authenticated gm socket protocol required');
    protocolGuardSocket.close();
    legacyProtocolGuardSocket = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        auth: {
            token: auth.accessToken,
            gmToken,
            protocol: 'legacy',
        },
    });
    legacyProtocolGuardSocket.on(shared_1.S2C.Error, (payload) => {
        legacyProtocolGuardError = payload ?? null;
    });
    legacyProtocolGuardSocket.on(shared_1.NEXT_S2C.Error, (payload) => {
        legacyProtocolGuardError = payload ?? null;
    });
    await onceConnected(legacyProtocolGuardSocket);
    await waitFor(() => {
        return legacyProtocolGuardError?.code === resolveExpectedLegacySocketProtocolGuardCode();
    }, 5000, 'authenticated gm socket legacy protocol mismatch');
    legacyProtocolGuardSocket.close();
    if (!hasDatabaseUrl) {
        console.log(JSON.stringify({
            ok: true,
            url: SERVER_NEXT_URL,
            skipped: true,
            reason: 'no_db_next_protocol_rejects_token_runtime',
            protocolGuardRejectedCode: protocolGuardError?.code ?? null,
            legacyProtocolGuardRejectedCode: legacyProtocolGuardError?.code ?? null,
        }, null, 2));
        return;
    }
    socket = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        auth: {
            token: auth.accessToken,
            gmToken,
            protocol: 'next',
        },
    });
/**
 * 记录GM状态events。
 */
    const gmStateEvents = [];
/**
 * 记录next init。
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
    socket.on(shared_1.S2C.Error, (payload) => {
        socketError = new Error(`legacy socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.NEXT_S2C.Error, (payload) => {
        socketError = new Error(`next socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.NEXT_S2C.InitSession, (payload) => {
        nextInit = payload;
    });
    socket.on(shared_1.NEXT_S2C.Bootstrap, () => {
        bootstrapCount += 1;
    });
    socket.on(shared_1.NEXT_S2C.MapEnter, () => {
        mapEnterCount += 1;
    });
    socket.on(shared_1.NEXT_S2C.MapStatic, () => {
        mapStaticCount += 1;
    });
    socket.on(shared_1.NEXT_S2C.Realm, () => {
        realmCount += 1;
    });
    socket.on(shared_1.NEXT_S2C.WorldDelta, () => {
        worldDeltaCount += 1;
    });
    socket.on(shared_1.NEXT_S2C.SelfDelta, () => {
        selfDeltaCount += 1;
    });
    socket.on(shared_1.NEXT_S2C.PanelDelta, () => {
        panelDeltaCount += 1;
    });
    socket.on(shared_1.S2C.GmState, (payload) => {
        gmStateEvents.push({ kind: 'legacy', payload });
    });
    socket.on(shared_1.NEXT_S2C.GmState, (payload) => {
        gmStateEvents.push({ kind: 'next', payload });
    });
    try {
        await onceConnected(socket);
        await waitFor(() => {
            throwIfSocketError(socketError);
            return nextInit !== null;
        }, 5000, 'next init');
        await waitFor(() => {
            throwIfSocketError(socketError);
            return bootstrapCount > 0
                && mapEnterCount > 0
                && mapStaticCount > 0
                && realmCount > 0
                && worldDeltaCount > 0
                && selfDeltaCount > 0
                && panelDeltaCount > 0;
        }, 12000, 'gm next bootstrap ready');
/**
 * 记录initial运行态。
 */
        const initialRuntime = await waitForPlayerState(auth.playerId, () => true, 12000);
/**
 * 记录initialmaps。
 */
        const initialMaps = await authedGetJson('/gm/maps', gmToken);
/**
 * 记录当前值地图汇总。
 */
        const currentMapSummary = assertGmMapsShape(initialMaps, initialRuntime.templateId);
/**
 * 记录编辑器目录。
 */
        const editorCatalog = await authedGetJson('/gm/editor-catalog', gmToken);
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
        const initialSocketGmState = await emitAndWaitForGmState(socket, gmStateEvents, socketError, shared_1.NEXT_C2S.GmGetState, {}, (entry) => {
            return Array.isArray(entry?.payload?.players) && Array.isArray(entry?.payload?.mapIds);
        }, 5000, 'socket gmGetState');
        assertNextGmState(initialSocketGmState, 'socket gmGetState');
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
        const socketSpawnState = await emitAndWaitForGmState(socket, gmStateEvents, socketError, shared_1.NEXT_C2S.GmSpawnBots, {
            count: 1,
        }, (entry) => Number(entry?.payload?.botCount ?? 0) >= socketBotBaseline + 1, 8000, 'socket gmSpawnBots');
        assertNextGmState(socketSpawnState, 'socket gmSpawnBots');
/**
 * 记录socket出生点bot数量。
 */
        const socketSpawnBotCount = Number(socketSpawnState?.payload?.botCount ?? 0);
/** socketUpdateAck：定义该变量以承载业务值。 */
        const socketUpdateAck = await emitAndWaitForGmState(socket, gmStateEvents, socketError, shared_1.NEXT_C2S.GmUpdatePlayer, {
            playerId: auth.playerId,
            mapId: initialRuntime.templateId,
            x: socketTargetPosition.x,
            y: socketTargetPosition.y,
            hp: socketTargetHp,
            autoBattle: socketTargetAutoBattle,
        }, (entry) => Array.isArray(entry?.payload?.players) && Array.isArray(entry?.payload?.mapIds), 12000, 'socket gmUpdatePlayer ack');
        assertNextGmState(socketUpdateAck, 'socket gmUpdatePlayer ack');
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
        const socketResetAck = await emitAndWaitForGmState(socket, gmStateEvents, socketError, shared_1.NEXT_C2S.GmResetPlayer, {
            playerId: auth.playerId,
        }, (entry) => Array.isArray(entry?.payload?.players) && Array.isArray(entry?.payload?.mapIds), 12000, 'socket gmResetPlayer ack');
        assertNextGmState(socketResetAck, 'socket gmResetPlayer ack');
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
        const socketRemoveState = await emitAndWaitForGmState(socket, gmStateEvents, socketError, shared_1.NEXT_C2S.GmRemoveBots, {
            all: true,
        }, (entry) => Number(entry?.payload?.botCount ?? 0) === 0, 8000, 'socket gmRemoveBots');
        assertNextGmState(socketRemoveState, 'socket gmRemoveBots');
/**
 * 记录initialhttp状态。
 */
        const initialHttpState = await authedGetJson('/gm/state', gmToken);
        assertGmStateShape(initialHttpState, 'initial http gm state');
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
        await authedRequestJson(`/gm/players/${auth.playerId}`, {
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
        await authedRequestJson(`/gm/players/${auth.playerId}/reset`, {
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
        await authedRequestJson('/gm/bots/spawn', {
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
        await authedRequestJson('/gm/bots/remove', {
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
 * 记录mail汇总before。
 */
        const mailSummaryBefore = await fetchMailSummary(auth.playerId);
/**
 * 记录directmail。
 */
        const directMail = await authedRequestJson(`/gm/players/${auth.playerId}/mail`, {
            method: 'POST',
            token: gmToken,
            body: {
                fallbackTitle: `GM直邮${suffix.slice(-4)}`,
                fallbackBody: `gm-compat direct ${suffix}`,
                attachments: [{ itemId: 'spirit_stone', count: 1 }],
            },
        });
/**
 * 记录broadcastmail。
 */
        const broadcastMail = await authedRequestJson('/gm/mail/broadcast', {
            method: 'POST',
            token: gmToken,
            body: {
                fallbackTitle: `GM群邮${suffix.slice(-4)}`,
                fallbackBody: `gm-compat broadcast ${suffix}`,
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
                description: `gm-compat suggestion ${suffix}`,
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
        await authedRequestJson(`/gm/suggestions/${suggestionId}/replies`, {
            method: 'POST',
            token: gmToken,
            body: {
                content: `GM回复${suffix}`,
            },
        });
        await authedRequestJson(`/gm/suggestions/${suggestionId}/complete`, {
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
        await authedRequestJson(`/gm/suggestions/${suggestionId}`, {
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
        await authedRequestJson(`/gm/maps/${httpResetRuntime.templateId}/tick`, {
            method: 'PUT',
            token: gmToken,
            body: {
                paused: false,
                speed: nextTickSpeed,
            },
        });
        await authedRequestJson(`/gm/maps/${httpResetRuntime.templateId}/time`, {
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
        await authedRequestJson('/gm/tick-config/reload', {
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
        await authedRequestJson(`/gm/players/${auth.playerId}/password`, {
            method: 'POST',
            token: gmToken,
            body: {
                password: gmChangedPassword,
            },
        });
/**
 * 记录reloginpayload。
 */
        const reloginPayload = await requestJson('/auth/login', {
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
        const reloginPlayerId = reloginDecoded?.sub ? `p_${String(reloginDecoded.sub).trim()}` : '';
        if (reloginPlayerId !== auth.playerId) {
            throw new Error(`gm password change login player mismatch: expected ${auth.playerId} but got ${reloginPlayerId}`);
        }
        console.log(JSON.stringify({
            ok: true,
            url: SERVER_NEXT_URL,
            playerId: auth.playerId,
            socket: {
                gmStateEvents: gmStateEvents.length,
                legacyGmStateEvents: gmStateEvents.filter((entry) => entry.kind === 'legacy').length,
                nextGmStateEvents: gmStateEvents.filter((entry) => entry.kind === 'next').length,
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
                finalBotCount: Number(socketRemoveState?.payload?.botCount ?? 0),
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
/** tickPaused：定义该变量以承载业务值。 */
                    tickPaused: mapRuntimeReloaded?.tickPaused === true,
                    timeScale: Number(mapRuntimeReloaded?.timeConfig?.scale ?? 0),
                    offsetTicks: Number(mapRuntimeReloaded?.timeConfig?.offsetTicks ?? 0),
                    entityCount: Array.isArray(mapRuntimeUpdated?.entities) ? mapRuntimeUpdated.entities.length : 0,
                },
            },
            gmState: {
                initialPlayers: initialHttpState.players.length,
                initialMaps: initialHttpState.mapIds.length,
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
        socket?.close();
        await cleanup(gmToken, auth?.playerId ?? '').catch(() => undefined);
    }
}
/**
 * 在烟测结束后清理临时角色和遗留测试数据。
 */
async function cleanup(gmToken, playerId) {
    if (gmToken) {
        await authedRequestJson('/gm/bots/remove', {
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
/** registered：定义该变量以承载业务值。 */
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
            await requestJson('/auth/register', {
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
/** message：定义该变量以承载业务值。 */
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
    const login = await requestJson('/auth/login', {
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
    return {
        accessToken: login.accessToken,
        playerId: `p_${String(payload.sub).trim()}`,
        loginName: registeredAccountName,
    };
}
/**
 * 在带库 smoke 中，确保 access token 对应账号已有 next identity/snapshot 真源文档。
 */
async function ensureNativeDocsForAccessToken(token) {
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
    let tokenPlayerId = normalizeNextPlayerId(typeof payload?.playerId === 'string' ? payload.playerId.trim() : '');
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
/** pool：定义该变量以承载业务值。 */
    const pool = new pg_1.Pool({
        connectionString: SERVER_NEXT_DATABASE_URL,
    });
    try {
        if (!tokenPlayerId) {
/** playerResult：定义该变量以承载业务值。 */
            const playerResult = await pool.query('SELECT id, name FROM players WHERE "userId" = $1::uuid LIMIT 1', [tokenUserId]);
/** playerRow：定义该变量以承载业务值。 */
            const playerRow = Array.isArray(playerResult?.rows) ? playerResult.rows[0] : null;
            tokenPlayerId = normalizeNextPlayerId(typeof playerRow?.id === 'string' ? playerRow.id.trim() : tokenPlayerId);
            if (!tokenPlayerName) {
                tokenPlayerName = typeof playerRow?.name === 'string' ? playerRow.name.trim() : tokenPlayerName;
            }
        }
        if (!tokenUsername || !tokenDisplayName) {
/** userResult：定义该变量以承载业务值。 */
            const userResult = await pool.query('SELECT username, "displayName" FROM users WHERE id = $1::uuid LIMIT 1', [tokenUserId]);
/** userRow：定义该变量以承载业务值。 */
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
    `, ['server_next_player_identities_v1', tokenUserId, JSON.stringify({
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
    `, ['server_next_player_snapshots_v1', tokenPlayerId, JSON.stringify({
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
/**
 * 记录payload。
 */
    const payload = await requestJson('/auth/gm/login', {
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
 * 统一发送 JSON 请求并校验基础响应格式。
 */
async function requestJson(path, init = {}) {
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
    const response = await fetch(`${SERVER_NEXT_URL}${path}`, {
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
    const runtime = await authedGetJson(`/gm/maps/${mapId}/runtime?x=${startX}&y=${startY}&w=${searchRadius * 2 + 1}&h=${searchRadius * 2 + 1}&viewerId=${encodeURIComponent(playerId)}`, token);
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
/** detail：定义该变量以承载业务值。 */
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
    const runtime = await authedGetJson(`/gm/maps/${mapId}/runtime?x=${startX}&y=${startY}&w=5&h=5&viewerId=${encodeURIComponent(playerId)}`, token);
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
        const payload = await authedGetJson('/gm/state', token);
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
    return authedGetJson('/gm/suggestions?page=1&pageSize=20', token);
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
    return authedGetJson(`/gm/maps/${mapId}/runtime?x=${startX}&y=${startY}&w=5&h=5&viewerId=${encodeURIComponent(viewerId)}`, token);
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
                authedGetJson('/gm/state', token),
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
    if (!Array.isArray(payload?.players) || !Array.isArray(payload?.mapIds)) {
        throw new Error(`unexpected ${label} payload: ${JSON.stringify(payload)}`);
    }
}
/**
 * 校验 GM 地图列表返回结构是否符合兼容预期。
 */
function assertGmMapsShape(payload, expectedMapId) {
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
 * 确认收到的是 next GM 状态包而不是异常格式。
 */
function assertNextGmState(entry, label) {
    if (entry?.kind !== 'next') {
        throw new Error(`expected next gm state for ${label}, got ${entry?.kind ?? 'none'}`);
    }
}
/**
 * 判断是否已GM玩家汇总。
 */
function hasGmPlayerSummary(payload, playerId, predicate) {
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
 * 规范化 next 玩家ID，统一为 p_<uuid> 形态。
 */
function normalizeNextPlayerId(value) {
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
/** resolveExpectedLegacySocketProtocolGuardCode：执行对应的业务逻辑。 */
function resolveExpectedLegacySocketProtocolGuardCode() {
    return LEGACY_SOCKET_PROTOCOL_ENABLED ? 'AUTH_PROTOCOL_MISMATCH' : 'LEGACY_PROTOCOL_DISABLED';
}
/** readBooleanEnv：执行对应的业务逻辑。 */
function readBooleanEnv(key) {
/** value：定义该变量以承载业务值。 */
    const value = process.env[key];
    if (typeof value !== 'string') {
        return false;
    }
/** normalized：定义该变量以承载业务值。 */
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}
/**
 * 生成满足“1 个字符”约束且可重试的显示名。
 */
function buildUniqueDisplayNameChar(seed, attempt) {
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
/**
 * 记录response。
 */
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/players/${playerId}`, {
        method: 'DELETE',
    });
    if (!response.ok && response.status !== 404) {
        throw new Error(`delete player failed: ${response.status} ${await response.text()}`);
    }
}
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

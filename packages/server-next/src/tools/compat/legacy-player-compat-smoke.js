"use strict";
/**
 * 用途：执行 legacy-player-compat 兼容链路的冒烟验证。
 * 当前合同：legacy HTTP 账号链仍可用，但 authenticated socket 必须显式使用 next 协议。
 */

Object.defineProperty(exports, "__esModule", { value: true });
/** socket_io_client_1：定义该变量以承载业务值。 */
const socket_io_client_1 = require("socket.io-client");
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** env_alias_1：定义该变量以承载业务值。 */
const env_alias_1 = require("../../config/env-alias");
/** lib：定义该变量以承载业务值。 */
const lib = require("../next-protocol-audit-lib");
/**
 * 记录 server-next 访问地址。
 */
const SERVER_NEXT_URL = (0, env_alias_1.resolveServerNextUrl)() || 'http://127.0.0.1:3111';
/** SERVER_NEXT_DATABASE_URL：定义该变量以承载业务值。 */
const SERVER_NEXT_DATABASE_URL = (0, env_alias_1.resolveServerNextDatabaseUrl)();
/**
 * 记录运行态API。
 */
const runtimeApi = lib.createRuntimeApi(SERVER_NEXT_URL);
/** LEGACY_HTTP_MEMORY_FALLBACK_ENABLED：定义该变量以承载业务值。 */
const LEGACY_HTTP_MEMORY_FALLBACK_ENABLED = readBooleanEnv('SERVER_NEXT_ALLOW_LEGACY_HTTP_MEMORY_FALLBACK')
    || readBooleanEnv('NEXT_ALLOW_LEGACY_HTTP_MEMORY_FALLBACK');
/** LEGACY_SOCKET_PROTOCOL_ENABLED：定义该变量以承载业务值。 */
const LEGACY_SOCKET_PROTOCOL_ENABLED = readBooleanEnv('SERVER_NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL')
    || readBooleanEnv('NEXT_ALLOW_LEGACY_SOCKET_PROTOCOL');
/**
 * 记录suffix。
 */
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/**
 * 记录sender显示信息名称。
 */
const senderDisplayName = buildUniqueDisplayName(`legacy-player-sender:${suffix}`);
/**
 * 记录receiver显示信息名称。
 */
const receiverDisplayName = buildUniqueDisplayName(`legacy-player-receiver:${suffix}`);
/**
 * 串联执行脚本主流程。
 */
async function main() {
    if (!SERVER_NEXT_DATABASE_URL.trim() && !LEGACY_HTTP_MEMORY_FALLBACK_ENABLED) {
        console.log(JSON.stringify({
            ok: true,
            skipped: true,
            reason: 'no_db_legacy_http_memory_fallback_disabled',
        }, null, 2));
        return;
    }
/**
 * 记录sender认证。
 */
    const senderAuth = await registerAndLoginPlayer(`ls_${suffix.slice(-6)}`, senderDisplayName, `兼发角${suffix.slice(-4)}`);
/**
 * 记录receiver认证。
 */
    const receiverAuth = await registerAndLoginPlayer(`lr_${suffix.slice(-6)}`, receiverDisplayName, `兼收角${suffix.slice(-4)}`);
/**
 * 记录sender玩家ID。
 */
    const senderPlayerId = senderAuth.playerId;
/**
 * 记录receiver玩家ID。
 */
    const receiverPlayerId = receiverAuth.playerId;
/**
 * 记录协议守卫socket。
 */
    let protocolGuardSocket = null;
/**
 * 记录legacy协议守卫socket。
 */
    let legacyProtocolGuardSocket = null;
/**
 * 记录sendersocket。
 */
    let senderSocket = null;
/**
 * 记录receiversocket。
 */
    let receiverSocket = null;
/**
 * 记录pendingmessageID。
 */
    const pendingMessageId = `legacy_logbook_${suffix}`;
    try {
        protocolGuardSocket = createAuthenticatedNextSocket(senderAuth.accessToken, {
            protocol: null,
        });
        legacyProtocolGuardSocket = createAuthenticatedNextSocket(senderAuth.accessToken, {
            protocol: 'legacy',
        });
        await expectProtocolGuardError(protocolGuardSocket, 'AUTH_PROTOCOL_REQUIRED');
        await expectProtocolGuardError(legacyProtocolGuardSocket, resolveExpectedLegacySocketProtocolGuardCode());
/** protocolGuardRejectedCode：定义该变量以承载业务值。 */
        const protocolGuardRejectedCode = protocolGuardSocket.protocolGuardCode;
/** legacyProtocolGuardRejectedCode：定义该变量以承载业务值。 */
        const legacyProtocolGuardRejectedCode = legacyProtocolGuardSocket.protocolGuardCode;
        await runtimeApi.connectPlayer({
            playerId: senderPlayerId,
            mapId: 'yunlai_town',
            preferredX: 32,
            preferredY: 5,
        });
        await runtimeApi.connectPlayer({
            playerId: receiverPlayerId,
            mapId: 'yunlai_town',
            preferredX: 33,
            preferredY: 5,
        });
        await runtimeApi.queuePendingLogbookMessage(senderPlayerId, {
            id: pendingMessageId,
            kind: 'grudge',
            text: `legacy compat 待确认 ${suffix}`,
            from: '兼容烟测',
            at: 1711929600000,
        });
        senderSocket = createAuthenticatedNextSocket(senderAuth.accessToken, {
            protocol: 'next',
        });
        receiverSocket = createAuthenticatedNextSocket(receiverAuth.accessToken, {
            protocol: 'next',
        });
        await waitForAuthenticatedNextBootstrap(senderSocket, senderPlayerId);
        await waitForAuthenticatedNextBootstrap(receiverSocket, receiverPlayerId);
/**
 * 记录pendingmessage。
 */
        const pendingMessage = await senderSocket.waitForEvent(shared_1.NEXT_S2C.Notice, (payload) => {
            return flattenNoticeItems(payload).some((entry) => entry?.messageId === pendingMessageId
                && entry.persistUntilAck === true
                && entry.kind === 'grudge');
        }, 5000);
/**
 * 记录navigate任务ID。
 */
        const navigateQuestId = `legacy_quest_${suffix}`;
/**
 * 记录navigateafter。
 */
        const navigateAfter = senderSocket.getEventCount(shared_1.NEXT_S2C.QuestNavigateResult);
        senderSocket.emit(shared_1.NEXT_C2S.NavigateQuest, { questId: navigateQuestId });
/**
 * 记录navigate结果。
 */
        const navigateResult = await senderSocket.waitForEventAfter(shared_1.NEXT_S2C.QuestNavigateResult, navigateAfter, (payload) => payload?.questId === navigateQuestId, 5000);
        await runtimeApi.grantItem(senderPlayerId, 'rat_tail', 1);
/**
 * 记录senderbefore掉落。
 */
        const senderBeforeLoot = await fetchPlayerState(senderPlayerId);
/**
 * 记录rattailslot。
 */
        const ratTailSlot = slot(senderBeforeLoot.inventory?.items ?? [], 'rat_tail');
        await runtimeApi.post(`/runtime/players/${senderPlayerId}/drop-item`, {
            slotIndex: ratTailSlot,
            count: 1,
        });
        await lib.waitForState(runtimeApi, senderPlayerId, (player) => count(player.inventory?.items ?? [], 'rat_tail') === 0, 5000, 'legacyDropRatTail');
/**
 * 记录掉落tile。
 */
        const lootTile = await lib.waitForValue(async () => {
/**
 * 记录当前值。
 */
            const current = await fetchPlayerState(senderPlayerId);
/**
 * 记录detail。
 */
            const detail = await runtimeApi.get(`/runtime/players/${senderPlayerId}/tile-detail?x=${current.x}&y=${current.y}`);
            return Array.isArray(detail?.ground?.items) && detail.ground.items.length > 0
                ? { x: current.x, y: current.y, detail }
                : null;
        }, 5000, 'legacyLootGroundReady');
/**
 * 记录tiledetailafter。
 */
        const lootWindowAfter = senderSocket.getEventCount(shared_1.NEXT_S2C.LootWindowUpdate);
        senderSocket.emit(shared_1.NEXT_C2S.UseAction, {
            actionId: 'loot:open',
            target: `tile:${lootTile.x}:${lootTile.y}`,
        });
/**
 * 记录掉落windowupdate。
 */
        const lootWindowUpdate = await senderSocket.waitForEventAfter(shared_1.NEXT_S2C.LootWindowUpdate, lootWindowAfter, (payload) => {
            return payload?.window?.tileX === lootTile.x
                && payload?.window?.tileY === lootTile.y
                && Array.isArray(payload.window.sources)
                && payload.window.sources.length > 0;
        }, 5000);
        await runtimeApi.grantItem(senderPlayerId, 'spirit_stone', 2);
        await runtimeApi.grantItem(senderPlayerId, 'rat_tail', 1);
/**
 * 记录senderinventory状态。
 */
        let senderInventoryState = await fetchPlayerState(senderPlayerId);
/**
 * 记录spiritbefore索引。
 */
        const spiritBeforeIndex = slot(senderInventoryState.inventory?.items ?? [], 'spirit_stone');
/**
 * 记录ratbefore索引。
 */
        const ratBeforeIndex = slot(senderInventoryState.inventory?.items ?? [], 'rat_tail');
/**
 * 记录sortnoticeafter。
 */
        senderSocket.emit(shared_1.NEXT_C2S.SortInventory, {});
        await lib.waitForState(runtimeApi, senderPlayerId, (player) => {
/**
 * 记录inventoryitems。
 */
            const inventoryItems = player.inventory?.items ?? [];
/**
 * 记录nextspirit索引。
 */
            const nextSpiritIndex = slot(inventoryItems, 'spirit_stone');
/**
 * 记录nextrat索引。
 */
            const nextRatIndex = slot(inventoryItems, 'rat_tail');
            return nextRatIndex < nextSpiritIndex
                && nextSpiritIndex !== spiritBeforeIndex
                && nextRatIndex !== ratBeforeIndex;
        }, 5000, 'legacySortInventory');
        senderInventoryState = await fetchPlayerState(senderPlayerId);
/**
 * 记录spiritbeforedestroy。
 */
        const spiritBeforeDestroy = count(senderInventoryState.inventory?.items ?? [], 'spirit_stone');
        senderSocket.emit(shared_1.NEXT_C2S.DestroyItem, {
            slotIndex: slot(senderInventoryState.inventory?.items ?? [], 'spirit_stone'),
            count: 1,
        });
        await lib.waitForState(runtimeApi, senderPlayerId, (player) => count(player.inventory?.items ?? [], 'spirit_stone') === Math.max(0, spiritBeforeDestroy - 1), 5000, 'legacyDestroyItem');
        senderSocket.emit(shared_1.NEXT_C2S.AckSystemMessages, {
            ids: [pendingMessageId],
        });
        await lib.waitForState(runtimeApi, senderPlayerId, (player) => {
            return !Array.isArray(player.pendingLogbookMessages)
                || player.pendingLogbookMessages.every((entry) => entry.id !== pendingMessageId);
        }, 5000, 'legacyAckSystemMessages');
/**
 * 记录chattext。
 */
        const chatText = `legacy compat chat ${suffix}`;
/**
 * 记录chatafter。
 */
        const chatAfter = receiverSocket.getEventCount(shared_1.NEXT_S2C.Notice);
        senderSocket.emit(shared_1.NEXT_C2S.Chat, { message: chatText });
/**
 * 记录chatmessage。
 */
        const chatMessage = await receiverSocket.waitForEventAfter(shared_1.NEXT_S2C.Notice, chatAfter, (payload) => {
            return flattenNoticeItems(payload).some((entry) => entry?.kind === 'chat'
                && entry.text === chatText
                && entry.from === senderDisplayName);
        }, 5000);
        assertNoLegacyEvents(senderSocket, 'sender');
        assertNoLegacyEvents(receiverSocket, 'receiver');
        console.log(JSON.stringify({
            ok: true,
            url: SERVER_NEXT_URL,
            senderPlayerId,
            receiverPlayerId,
            verified: {
                protocolGuardRejectedCode: protocolGuardRejectedCode ?? null,
                legacyProtocolGuardRejectedCode: legacyProtocolGuardRejectedCode ?? null,
                bootstrap: {
                    senderInitPlayerId: senderSocket.initSessionPayload?.pid ?? null,
                    receiverInitPlayerId: receiverSocket.initSessionPayload?.pid ?? null,
                },
                pendingLogbookMessageId: findNoticeItem(pendingMessage, (entry) => entry?.messageId === pendingMessageId)?.messageId ?? null,
                navigateQuest: {
                    questId: navigateResult.questId,
                    ok: navigateResult.ok,
                },
                lootOpen: {
                    tileX: lootWindowUpdate.window?.tileX ?? null,
                    tileY: lootWindowUpdate.window?.tileY ?? null,
                    sourceCount: lootWindowUpdate.window?.sources?.length ?? 0,
                },
                sortInventoryApplied: true,
                destroyItemApplied: true,
                chat: {
                    text: findNoticeItem(chatMessage, (entry) => entry?.kind === 'chat' && entry.text === chatText)?.text ?? null,
                    from: findNoticeItem(chatMessage, (entry) => entry?.kind === 'chat' && entry.text === chatText)?.from ?? null,
                },
            },
            legacyEventsOnNextSockets: {
                sender: senderSocket.legacyEvents.length,
                receiver: receiverSocket.legacyEvents.length,
            },
        }, null, 2));
    }
    finally {
        protocolGuardSocket?.close();
        legacyProtocolGuardSocket?.close();
        senderSocket?.close();
        receiverSocket?.close();
        await runtimeApi.deletePlayer(senderPlayerId).catch(() => undefined);
        await runtimeApi.deletePlayer(receiverPlayerId).catch(() => undefined);
    }
}
/**
 * 创建 authenticated next socket。
 */
function createAuthenticatedNextSocket(token, options = {}) {
/**
 * 记录socket。
 */
    const socket = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        autoConnect: false,
        auth: {
            token,
            ...(typeof options.protocol === 'string' ? { protocol: options.protocol } : {}),
        },
    });
/**
 * 记录byevent。
 */
    const byEvent = new Map();
/**
 * 记录legacyevents。
 */
    const legacyEvents = [];
/**
 * 记录fatalerror。
 */
    let fatalError = null;
/**
 * 记录initsessionpayload。
 */
    let initSessionPayload = null;
/**
 * 记录protocolguardcode。
 */
    let protocolGuardCode = null;
    socket.onAny((event, payload) => {
/**
 * 记录existing。
 */
        const existing = byEvent.get(event) ?? [];
        existing.push(payload);
        byEvent.set(event, existing);
        if (typeof event === 'string' && event.startsWith('s:')) {
            legacyEvents.push({
                event,
                payload,
            });
        }
    });
    socket.on(shared_1.S2C.Error, (payload) => {
/** code：定义该变量以承载业务值。 */
        const code = typeof payload?.code === 'string' ? payload.code : null;
        protocolGuardCode = code;
        fatalError = new Error(`legacy socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.NEXT_S2C.Error, (payload) => {
/** code：定义该变量以承载业务值。 */
        const code = typeof payload?.code === 'string' ? payload.code : null;
        protocolGuardCode = code;
        fatalError = new Error(`next socket error: ${JSON.stringify(payload)}`);
    });
    socket.on('connect_error', (error) => {
        fatalError = error instanceof Error ? error : new Error(String(error));
    });
    socket.on(shared_1.NEXT_S2C.InitSession, (payload) => {
        initSessionPayload = payload;
    });
/**
 * 处理throwiffatal。
 */
    function throwIfFatal() {
        if (fatalError) {
            throw fatalError;
        }
    }
    return {
        socket,
        legacyEvents,
/** initSessionPayload：执行对应的业务逻辑。 */
        get initSessionPayload() {
            return initSessionPayload;
        },
/** protocolGuardCode：执行对应的业务逻辑。 */
        get protocolGuardCode() {
            return protocolGuardCode;
        },
/** onceConnected：执行对应的业务逻辑。 */
        async onceConnected() {
            if (socket.connected) {
                return;
            }
            await new Promise((resolve, reject) => {
/**
 * 记录timer。
 */
                const timer = setTimeout(() => reject(new Error('authenticated next socket connect timeout')), 5000);
                socket.once('connect', () => {
                    clearTimeout(timer);
                    resolve();
                });
                socket.once('connect_error', (error) => {
                    clearTimeout(timer);
                    reject(error);
                });
                socket.connect();
            });
        },
/** emit：执行对应的业务逻辑。 */
        emit(event, payload) {
            throwIfFatal();
            socket.emit(event, payload);
        },
/** getEventCount：执行对应的业务逻辑。 */
        getEventCount(event) {
            return (byEvent.get(event) ?? []).length;
        },
        async waitForEvent(event, predicate = () => true, timeoutMs = 5000) {
            return lib.waitForValue(async () => {
                throwIfFatal();
/**
 * 记录payloads。
 */
                const payloads = byEvent.get(event) ?? [];
                for (let index = payloads.length - 1; index >= 0; index -= 1) {
/**
 * 记录payload。
 */
                    const payload = payloads[index];
                    if (await predicate(payload)) {
                        return payload;
                    }
                }
                return null;
            }, timeoutMs, `legacy:${event}`);
        },
        async waitForEventAfter(event, afterCount, predicate = () => true, timeoutMs = 5000) {
            return lib.waitForValue(async () => {
                throwIfFatal();
/**
 * 记录payloads。
 */
                const payloads = byEvent.get(event) ?? [];
                for (let index = payloads.length - 1; index >= afterCount; index -= 1) {
/**
 * 记录payload。
 */
                    const payload = payloads[index];
                    if (await predicate(payload)) {
                        return payload;
                    }
                }
                return null;
            }, timeoutMs, `legacy:${event}:after:${afterCount}`);
        },
/** close：执行对应的业务逻辑。 */
        close() {
            socket.close();
        },
    };
}
/**
 * 等待 authenticated next bootstrap。
 */
async function waitForAuthenticatedNextBootstrap(client, expectedPlayerId) {
    await client.onceConnected();
    await client.waitForEvent(shared_1.NEXT_S2C.InitSession, (payload) => payload?.pid === expectedPlayerId, 5000);
    await client.waitForEvent(shared_1.NEXT_S2C.Bootstrap, (payload) => payload?.self?.id === expectedPlayerId, 5000);
    await client.waitForEvent(shared_1.NEXT_S2C.MapEnter, (payload) => payload?.mid === 'yunlai_town', 5000);
    await client.waitForEvent(shared_1.NEXT_S2C.MapStatic, (payload) => payload?.mapId === 'yunlai_town', 5000);
    await client.waitForEvent(shared_1.NEXT_S2C.Realm, (payload) => typeof payload === 'object' && payload !== null, 5000);
    await client.waitForEvent(shared_1.NEXT_S2C.WorldDelta, () => true, 5000);
    await client.waitForEvent(shared_1.NEXT_S2C.SelfDelta, () => true, 5000);
    await client.waitForEvent(shared_1.NEXT_S2C.PanelDelta, () => true, 5000);
}
/**
 * 处理fetch玩家状态。
 */
async function fetchPlayerState(playerId) {
/**
 * 记录payload。
 */
    const payload = await runtimeApi.fetchState(playerId);
    if (!payload?.player) {
        throw new Error(`runtime state missing player ${playerId}`);
    }
    return payload.player;
}
/**
 * 处理slot。
 */
function slot(items, itemId) {
/**
 * 记录索引。
 */
    const index = items.findIndex((entry) => entry?.itemId === itemId);
    if (index < 0) {
        throw new Error(`missing inventory slot for item: ${itemId}`);
    }
    return index;
}
/**
 * 处理数量。
 */
function count(items, itemId) {
/**
 * 记录entry。
 */
    const entry = items.find((item) => item?.itemId === itemId);
    return entry ? Number(entry.count ?? 0) : 0;
}
/**
 * 等待协议守卫错误。
 */
async function expectProtocolGuardError(client, expectedCode) {
    await client.onceConnected();
    await lib.waitForValue(async () => client.protocolGuardCode === expectedCode ? client.protocolGuardCode : null, 5000, `protocolGuard:${expectedCode}`);
}
/**
 * 断言 no legacy events。
 */
function assertNoLegacyEvents(client, label) {
    if (client.legacyEvents.length === 0) {
        return;
    }
/**
 * 记录detail。
 */
    const detail = client.legacyEvents.map((entry) => entry.event).join(', ');
    throw new Error(`next socket ${label} received legacy events: ${detail}`);
}
/**
 * 展平 notice items。
 */
function flattenNoticeItems(payload) {
    return Array.isArray(payload?.items)
        ? payload.items.filter((entry) => entry && typeof entry === 'object')
        : [];
}
/**
 * 从 notice 里找目标项。
 */
function findNoticeItem(payload, predicate) {
    return flattenNoticeItems(payload).find((entry) => predicate(entry)) ?? null;
}
/**
 * 处理registerandlogin玩家。
 */
async function registerAndLoginPlayer(prefix, displayName, roleName) {
/**
 * 记录normalizedprefix。
 */
    const normalizedPrefix = String(prefix ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();
/**
 * 记录account名称。
 */
    const accountName = `a_${normalizedPrefix.slice(-18)}`;
/**
 * 记录password。
 */
    const password = `P_${normalizedPrefix.slice(-18)}`;
    await requestJson('/auth/register', {
        method: 'POST',
        body: {
            accountName,
            password,
            displayName,
            roleName,
        },
    });
/**
 * 记录login。
 */
    const login = await requestJson('/auth/login', {
        method: 'POST',
        body: {
            loginName: accountName,
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
    return {
        accessToken: login.accessToken,
        playerId: `p_${payload.sub}`,
    };
}
/**
 * 处理requestjson。
 */
async function requestJson(pathname, init) {
/**
 * 记录请求体。
 */
    const body = init?.body === undefined ? undefined : JSON.stringify(init.body);
/**
 * 记录response。
 */
    const response = await fetch(`${SERVER_NEXT_URL}${pathname}`, {
        method: init?.method ?? 'GET',
/** headers：定义该变量以承载业务值。 */
        headers: body === undefined ? undefined : {
            'content-type': 'application/json',
        },
        body,
    });
    if (!response.ok) {
        throw new Error(`request failed: ${pathname}: ${response.status} ${await response.text()}`);
    }
    if (response.status === 204) {
        return null;
    }
    return response.json();
}
/**
 * 解析jwtpayload。
 */
function parseJwtPayload(token) {
    if (typeof token !== 'string') {
        return null;
    }
/**
 * 记录parts。
 */
    const parts = token.split('.');
    if (parts.length < 2) {
        return null;
    }
    try {
        return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    }
    catch {
        return null;
    }
}
/**
 * 构建unique显示信息名称。
 */
function buildUniqueDisplayName(seed) {
/**
 * 记录hash。
 */
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
        hash = (hash * 33 + seed.charCodeAt(index)) >>> 0;
    }
    return String.fromCodePoint(0x4E00 + (hash % (0x9FFF - 0x4E00 + 1)));
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
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

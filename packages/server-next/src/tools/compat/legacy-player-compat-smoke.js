"use strict";
/**
 * 用途：执行 legacy-player-compat 兼容链路的冒烟验证。
 */

Object.defineProperty(exports, "__esModule", { value: true });
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared-next");
const env_alias_1 = require("../../config/env-alias");
const lib = require("../next-protocol-audit-lib");
/**
 * 记录 server-next 访问地址。
 */
const SERVER_NEXT_URL = (0, env_alias_1.resolveServerNextUrl)() || 'http://127.0.0.1:3111';
/**
 * 记录运行态API。
 */
const runtimeApi = lib.createRuntimeApi(SERVER_NEXT_URL);
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
        senderSocket = createLegacySocket(senderAuth.accessToken);
        receiverSocket = createLegacySocket(receiverAuth.accessToken);
        await waitForLegacyBootstrap(senderSocket, senderPlayerId);
        await waitForLegacyBootstrap(receiverSocket, receiverPlayerId);
/**
 * 记录pendingmessage。
 */
        const pendingMessage = await senderSocket.waitForEvent(shared_1.S2C.SystemMsg, (payload) => {
            return payload?.id === pendingMessageId
                && payload.persistUntilAck === true
                && payload.kind === 'grudge';
        }, 5000);
/**
 * 记录navigate任务ID。
 */
        const navigateQuestId = `legacy_quest_${suffix}`;
/**
 * 记录navigateafter。
 */
        const navigateAfter = senderSocket.getEventCount(shared_1.S2C.QuestNavigateResult);
        senderSocket.emit(shared_1.C2S.NavigateQuest, { questId: navigateQuestId });
/**
 * 记录navigate结果。
 */
        const navigateResult = await senderSocket.waitForEventAfter(shared_1.S2C.QuestNavigateResult, navigateAfter, (payload) => payload?.questId === navigateQuestId, 5000);
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
        const tileDetailAfter = senderSocket.getEventCount(shared_1.S2C.TileRuntimeDetail);
/**
 * 记录掉落windowafter。
 */
        const lootWindowAfter = senderSocket.getEventCount(shared_1.S2C.LootWindowUpdate);
        senderSocket.emit(shared_1.C2S.Action, {
            type: 'loot:open',
            target: `tile:${lootTile.x}:${lootTile.y}`,
        });
/**
 * 记录tile运行态detail。
 */
        const tileRuntimeDetail = await senderSocket.waitForEventAfter(shared_1.S2C.TileRuntimeDetail, tileDetailAfter, (payload) => payload?.x === lootTile.x && payload?.y === lootTile.y, 5000);
/**
 * 记录掉落windowupdate。
 */
        const lootWindowUpdate = await senderSocket.waitForEventAfter(shared_1.S2C.LootWindowUpdate, lootWindowAfter, (payload) => {
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
        const sortNoticeAfter = senderSocket.getEventCount(shared_1.S2C.SystemMsg);
        senderSocket.emit(shared_1.C2S.SortInventory, {});
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
/**
 * 记录sortnotice。
 */
        const sortNotice = await senderSocket.waitForEventAfter(shared_1.S2C.SystemMsg, sortNoticeAfter, (payload) => typeof payload?.text === 'string' && payload.text.includes('背包已整理'), 5000);
        senderInventoryState = await fetchPlayerState(senderPlayerId);
/**
 * 记录spiritbeforedestroy。
 */
        const spiritBeforeDestroy = count(senderInventoryState.inventory?.items ?? [], 'spirit_stone');
/**
 * 记录destroynoticeafter。
 */
        const destroyNoticeAfter = senderSocket.getEventCount(shared_1.S2C.SystemMsg);
        senderSocket.emit(shared_1.C2S.DestroyItem, {
            slotIndex: slot(senderInventoryState.inventory?.items ?? [], 'spirit_stone'),
            count: 1,
        });
        await lib.waitForState(runtimeApi, senderPlayerId, (player) => count(player.inventory?.items ?? [], 'spirit_stone') === Math.max(0, spiritBeforeDestroy - 1), 5000, 'legacyDestroyItem');
/**
 * 记录destroynotice。
 */
        const destroyNotice = await senderSocket.waitForEventAfter(shared_1.S2C.SystemMsg, destroyNoticeAfter, (payload) => typeof payload?.text === 'string' && payload.text.includes('你摧毁了'), 5000);
        senderSocket.emit(shared_1.C2S.AckSystemMessages, {
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
        const chatAfter = receiverSocket.getEventCount(shared_1.S2C.SystemMsg);
        senderSocket.emit(shared_1.C2S.Chat, { message: chatText });
/**
 * 记录chatmessage。
 */
        const chatMessage = await receiverSocket.waitForEventAfter(shared_1.S2C.SystemMsg, chatAfter, (payload) => {
            return payload?.kind === 'chat'
                && payload.text === chatText
                && payload.from === senderDisplayName;
        }, 5000);
        assertNoNextEvents(senderSocket, 'sender');
        assertNoNextEvents(receiverSocket, 'receiver');
        console.log(JSON.stringify({
            ok: true,
            url: SERVER_NEXT_URL,
            senderPlayerId,
            receiverPlayerId,
            verified: {
                bootstrap: {
                    senderInitPlayerId: senderSocket.initPayload?.self?.id ?? null,
                    receiverInitPlayerId: receiverSocket.initPayload?.self?.id ?? null,
                },
                pendingLogbookMessageId: pendingMessage.id ?? null,
                navigateQuest: {
                    questId: navigateResult.questId,
                    ok: navigateResult.ok,
                },
                lootOpen: {
                    tileX: lootWindowUpdate.window?.tileX ?? null,
                    tileY: lootWindowUpdate.window?.tileY ?? null,
                    sourceCount: lootWindowUpdate.window?.sources?.length ?? 0,
                    legacyTileDetailMapId: tileRuntimeDetail.mapId ?? null,
                },
                sortInventoryNotice: sortNotice.text,
                destroyItemNotice: destroyNotice.text,
                chat: {
                    text: chatMessage.text,
                    from: chatMessage.from ?? null,
                },
            },
            nextEventsOnLegacySockets: {
                sender: senderSocket.nextEvents.length,
                receiver: receiverSocket.nextEvents.length,
            },
        }, null, 2));
    }
    finally {
        senderSocket?.close();
        receiverSocket?.close();
        await runtimeApi.deletePlayer(senderPlayerId).catch(() => undefined);
        await runtimeApi.deletePlayer(receiverPlayerId).catch(() => undefined);
    }
}
/**
 * 创建legacysocket。
 */
function createLegacySocket(token) {
/**
 * 记录socket。
 */
    const socket = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        auth: {
            token,
            protocol: 'legacy',
        },
    });
/**
 * 记录byevent。
 */
    const byEvent = new Map();
/**
 * 记录nextevents。
 */
    const nextEvents = [];
/**
 * 记录fatalerror。
 */
    let fatalError = null;
/**
 * 记录initpayload。
 */
    let initPayload = null;
    socket.onAny((event, payload) => {
/**
 * 记录existing。
 */
        const existing = byEvent.get(event) ?? [];
        existing.push(payload);
        byEvent.set(event, existing);
        if (typeof event === 'string' && event.startsWith('n:s:')) {
            nextEvents.push({
                event,
                payload,
            });
        }
    });
    socket.on(shared_1.S2C.Error, (payload) => {
        fatalError = new Error(`legacy socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.NEXT_S2C.Error, (payload) => {
        fatalError = new Error(`next socket error on legacy protocol: ${JSON.stringify(payload)}`);
    });
    socket.on('connect_error', (error) => {
        fatalError = error instanceof Error ? error : new Error(String(error));
    });
    socket.on(shared_1.S2C.Init, (payload) => {
        initPayload = payload;
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
        nextEvents,
        get initPayload() {
            return initPayload;
        },
        async onceConnected() {
            if (socket.connected) {
                return;
            }
            await new Promise((resolve, reject) => {
/**
 * 记录timer。
 */
                const timer = setTimeout(() => reject(new Error('legacy socket connect timeout')), 5000);
                socket.once('connect', () => {
                    clearTimeout(timer);
                    resolve();
                });
                socket.once('connect_error', (error) => {
                    clearTimeout(timer);
                    reject(error);
                });
            });
        },
        emit(event, payload) {
            throwIfFatal();
            socket.emit(event, payload);
        },
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
        close() {
            socket.close();
        },
    };
}
/**
 * 等待forlegacybootstrap。
 */
async function waitForLegacyBootstrap(client, expectedPlayerId) {
    await client.onceConnected();
    await client.waitForEvent(shared_1.S2C.Init, (payload) => payload?.self?.id === expectedPlayerId, 5000);
    await client.waitForEvent(shared_1.S2C.MapStaticSync, (payload) => typeof payload?.mapId === 'string' && payload.mapId.length > 0, 5000);
    await client.waitForEvent(shared_1.S2C.RealmUpdate, (payload) => typeof payload === 'object' && payload !== null && Object.prototype.hasOwnProperty.call(payload, 'realm'), 5000);
    await client.waitForEvent(shared_1.S2C.InventoryUpdate, (payload) => typeof payload === 'object' && payload !== null && (Object.prototype.hasOwnProperty.call(payload, 'inventory') || Array.isArray(payload?.slots)), 5000);
    await client.waitForEvent(shared_1.S2C.ActionsUpdate, (payload) => Array.isArray(payload?.actions), 5000);
    await client.waitForEvent(shared_1.S2C.LootWindowUpdate, (payload) => Object.prototype.hasOwnProperty.call(payload ?? {}, 'window'), 5000);
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
 * 断言nonextevents。
 */
function assertNoNextEvents(client, label) {
    if (client.nextEvents.length === 0) {
        return;
    }
/**
 * 记录detail。
 */
    const detail = client.nextEvents.map((entry) => entry.event).join(', ');
    throw new Error(`legacy socket ${label} received next events: ${detail}`);
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
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

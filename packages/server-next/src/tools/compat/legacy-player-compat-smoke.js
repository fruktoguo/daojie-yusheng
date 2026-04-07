"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared-next");
const env_alias_1 = require("../../config/env-alias");
const lib = require("../next-protocol-audit-lib");
const SERVER_NEXT_URL = (0, env_alias_1.resolveServerNextUrl)() || 'http://127.0.0.1:3111';
const runtimeApi = lib.createRuntimeApi(SERVER_NEXT_URL);
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const senderDisplayName = buildUniqueDisplayName(`legacy-player-sender:${suffix}`);
const receiverDisplayName = buildUniqueDisplayName(`legacy-player-receiver:${suffix}`);
async function main() {
    const senderAuth = await registerAndLoginPlayer(`ls_${suffix.slice(-6)}`, senderDisplayName, `兼发角${suffix.slice(-4)}`);
    const receiverAuth = await registerAndLoginPlayer(`lr_${suffix.slice(-6)}`, receiverDisplayName, `兼收角${suffix.slice(-4)}`);
    const senderPlayerId = senderAuth.playerId;
    const receiverPlayerId = receiverAuth.playerId;
    let senderSocket = null;
    let receiverSocket = null;
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
        const pendingMessage = await senderSocket.waitForEvent(shared_1.S2C.SystemMsg, (payload) => {
            return payload?.id === pendingMessageId
                && payload.persistUntilAck === true
                && payload.kind === 'grudge';
        }, 5000);
        const navigateQuestId = `legacy_quest_${suffix}`;
        const navigateAfter = senderSocket.getEventCount(shared_1.S2C.QuestNavigateResult);
        senderSocket.emit(shared_1.C2S.NavigateQuest, { questId: navigateQuestId });
        const navigateResult = await senderSocket.waitForEventAfter(shared_1.S2C.QuestNavigateResult, navigateAfter, (payload) => payload?.questId === navigateQuestId, 5000);
        await runtimeApi.grantItem(senderPlayerId, 'rat_tail', 1);
        const senderBeforeLoot = await fetchPlayerState(senderPlayerId);
        const ratTailSlot = slot(senderBeforeLoot.inventory?.items ?? [], 'rat_tail');
        await runtimeApi.post(`/runtime/players/${senderPlayerId}/drop-item`, {
            slotIndex: ratTailSlot,
            count: 1,
        });
        await lib.waitForState(runtimeApi, senderPlayerId, (player) => count(player.inventory?.items ?? [], 'rat_tail') === 0, 5000, 'legacyDropRatTail');
        const lootTile = await lib.waitForValue(async () => {
            const current = await fetchPlayerState(senderPlayerId);
            const detail = await runtimeApi.get(`/runtime/players/${senderPlayerId}/tile-detail?x=${current.x}&y=${current.y}`);
            return Array.isArray(detail?.ground?.items) && detail.ground.items.length > 0
                ? { x: current.x, y: current.y, detail }
                : null;
        }, 5000, 'legacyLootGroundReady');
        const tileDetailAfter = senderSocket.getEventCount(shared_1.S2C.TileRuntimeDetail);
        const lootWindowAfter = senderSocket.getEventCount(shared_1.S2C.LootWindowUpdate);
        senderSocket.emit(shared_1.C2S.Action, {
            type: 'loot:open',
            target: `tile:${lootTile.x}:${lootTile.y}`,
        });
        const tileRuntimeDetail = await senderSocket.waitForEventAfter(shared_1.S2C.TileRuntimeDetail, tileDetailAfter, (payload) => payload?.x === lootTile.x && payload?.y === lootTile.y, 5000);
        const lootWindowUpdate = await senderSocket.waitForEventAfter(shared_1.S2C.LootWindowUpdate, lootWindowAfter, (payload) => {
            return payload?.window?.tileX === lootTile.x
                && payload?.window?.tileY === lootTile.y
                && Array.isArray(payload.window.sources)
                && payload.window.sources.length > 0;
        }, 5000);
        await runtimeApi.grantItem(senderPlayerId, 'spirit_stone', 2);
        await runtimeApi.grantItem(senderPlayerId, 'rat_tail', 1);
        let senderInventoryState = await fetchPlayerState(senderPlayerId);
        const spiritBeforeIndex = slot(senderInventoryState.inventory?.items ?? [], 'spirit_stone');
        const ratBeforeIndex = slot(senderInventoryState.inventory?.items ?? [], 'rat_tail');
        const sortNoticeAfter = senderSocket.getEventCount(shared_1.S2C.SystemMsg);
        senderSocket.emit(shared_1.C2S.SortInventory, {});
        await lib.waitForState(runtimeApi, senderPlayerId, (player) => {
            const inventoryItems = player.inventory?.items ?? [];
            const nextSpiritIndex = slot(inventoryItems, 'spirit_stone');
            const nextRatIndex = slot(inventoryItems, 'rat_tail');
            return nextRatIndex < nextSpiritIndex
                && nextSpiritIndex !== spiritBeforeIndex
                && nextRatIndex !== ratBeforeIndex;
        }, 5000, 'legacySortInventory');
        const sortNotice = await senderSocket.waitForEventAfter(shared_1.S2C.SystemMsg, sortNoticeAfter, (payload) => typeof payload?.text === 'string' && payload.text.includes('背包已整理'), 5000);
        senderInventoryState = await fetchPlayerState(senderPlayerId);
        const spiritBeforeDestroy = count(senderInventoryState.inventory?.items ?? [], 'spirit_stone');
        const destroyNoticeAfter = senderSocket.getEventCount(shared_1.S2C.SystemMsg);
        senderSocket.emit(shared_1.C2S.DestroyItem, {
            slotIndex: slot(senderInventoryState.inventory?.items ?? [], 'spirit_stone'),
            count: 1,
        });
        await lib.waitForState(runtimeApi, senderPlayerId, (player) => count(player.inventory?.items ?? [], 'spirit_stone') === Math.max(0, spiritBeforeDestroy - 1), 5000, 'legacyDestroyItem');
        const destroyNotice = await senderSocket.waitForEventAfter(shared_1.S2C.SystemMsg, destroyNoticeAfter, (payload) => typeof payload?.text === 'string' && payload.text.includes('你摧毁了'), 5000);
        senderSocket.emit(shared_1.C2S.AckSystemMessages, {
            ids: [pendingMessageId],
        });
        await lib.waitForState(runtimeApi, senderPlayerId, (player) => {
            return !Array.isArray(player.pendingLogbookMessages)
                || player.pendingLogbookMessages.every((entry) => entry.id !== pendingMessageId);
        }, 5000, 'legacyAckSystemMessages');
        const chatText = `legacy compat chat ${suffix}`;
        const chatAfter = receiverSocket.getEventCount(shared_1.S2C.SystemMsg);
        senderSocket.emit(shared_1.C2S.Chat, { message: chatText });
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
function createLegacySocket(token) {
    const socket = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        auth: {
            token,
            protocol: 'legacy',
        },
    });
    const byEvent = new Map();
    const nextEvents = [];
    let fatalError = null;
    let initPayload = null;
    socket.onAny((event, payload) => {
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
                const payloads = byEvent.get(event) ?? [];
                for (let index = payloads.length - 1; index >= 0; index -= 1) {
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
                const payloads = byEvent.get(event) ?? [];
                for (let index = payloads.length - 1; index >= afterCount; index -= 1) {
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
async function waitForLegacyBootstrap(client, expectedPlayerId) {
    await client.onceConnected();
    await client.waitForEvent(shared_1.S2C.Init, (payload) => payload?.self?.id === expectedPlayerId, 5000);
    await client.waitForEvent(shared_1.S2C.MapStaticSync, (payload) => typeof payload?.mapId === 'string' && payload.mapId.length > 0, 5000);
    await client.waitForEvent(shared_1.S2C.RealmUpdate, (payload) => typeof payload === 'object' && payload !== null && Object.prototype.hasOwnProperty.call(payload, 'realm'), 5000);
    await client.waitForEvent(shared_1.S2C.InventoryUpdate, (payload) => typeof payload === 'object' && payload !== null && (Object.prototype.hasOwnProperty.call(payload, 'inventory') || Array.isArray(payload?.slots)), 5000);
    await client.waitForEvent(shared_1.S2C.ActionsUpdate, (payload) => Array.isArray(payload?.actions), 5000);
    await client.waitForEvent(shared_1.S2C.LootWindowUpdate, (payload) => Object.prototype.hasOwnProperty.call(payload ?? {}, 'window'), 5000);
}
async function fetchPlayerState(playerId) {
    const payload = await runtimeApi.fetchState(playerId);
    if (!payload?.player) {
        throw new Error(`runtime state missing player ${playerId}`);
    }
    return payload.player;
}
function slot(items, itemId) {
    const index = items.findIndex((entry) => entry?.itemId === itemId);
    if (index < 0) {
        throw new Error(`missing inventory slot for item: ${itemId}`);
    }
    return index;
}
function count(items, itemId) {
    const entry = items.find((item) => item?.itemId === itemId);
    return entry ? Number(entry.count ?? 0) : 0;
}
function assertNoNextEvents(client, label) {
    if (client.nextEvents.length === 0) {
        return;
    }
    const detail = client.nextEvents.map((entry) => entry.event).join(', ');
    throw new Error(`legacy socket ${label} received next events: ${detail}`);
}
async function registerAndLoginPlayer(prefix, displayName, roleName) {
    const normalizedPrefix = String(prefix ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const accountName = `a_${normalizedPrefix.slice(-18)}`;
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
    const login = await requestJson('/auth/login', {
        method: 'POST',
        body: {
            loginName: accountName,
            password,
        },
    });
    const payload = parseJwtPayload(login?.accessToken);
    if (!payload?.sub || typeof login?.accessToken !== 'string') {
        throw new Error(`unexpected login payload: ${JSON.stringify(login)}`);
    }
    return {
        accessToken: login.accessToken,
        playerId: `p_${payload.sub}`,
    };
}
async function requestJson(pathname, init) {
    const body = init?.body === undefined ? undefined : JSON.stringify(init.body);
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
function parseJwtPayload(token) {
    if (typeof token !== 'string') {
        return null;
    }
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
function buildUniqueDisplayName(seed) {
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

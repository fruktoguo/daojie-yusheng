"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared-next");
const SERVER_NEXT_URL = process.env.SERVER_NEXT_URL ?? 'http://127.0.0.1:3111';
const dropperId = process.env.SERVER_NEXT_SMOKE_DROPPER_ID ?? `loot_dropper_${Date.now().toString(36)}`;
const looterId = process.env.SERVER_NEXT_SMOKE_LOOTER_ID ?? `loot_looter_${Date.now().toString(36)}`;
const TARGET_ITEM_ID = 'rat_tail';
const DROP_COUNT = 2;
async function main() {
    const dropper = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
    });
    const looter = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
    });
    const dropperPanels = [];
    const looterPanels = [];
    const dropperWorld = [];
    const looterWorld = [];
    dropper.on(shared_1.NEXT_S2C.Error, (payload) => {
        throw new Error(`dropper socket error: ${JSON.stringify(payload)}`);
    });
    looter.on(shared_1.NEXT_S2C.Error, (payload) => {
        throw new Error(`looter socket error: ${JSON.stringify(payload)}`);
    });
    dropper.on(shared_1.NEXT_S2C.PanelDelta, (payload) => {
        dropperPanels.push(payload);
    });
    looter.on(shared_1.NEXT_S2C.PanelDelta, (payload) => {
        looterPanels.push(payload);
    });
    dropper.on(shared_1.NEXT_S2C.WorldDelta, (payload) => {
        dropperWorld.push(payload);
    });
    looter.on(shared_1.NEXT_S2C.WorldDelta, (payload) => {
        looterWorld.push(payload);
    });
    await Promise.all([onceConnected(dropper), onceConnected(looter)]);
    dropper.emit(shared_1.NEXT_C2S.Hello, {
        playerId: dropperId,
        mapId: 'yunlai_town',
        preferredX: 32,
        preferredY: 5,
    });
    looter.emit(shared_1.NEXT_C2S.Hello, {
        playerId: looterId,
        mapId: 'yunlai_town',
        preferredX: 33,
        preferredY: 5,
    });
    await waitFor(async () => {
        const [dropperState, looterState] = await Promise.all([fetchState(dropperId), fetchState(looterId)]);
        return dropperState.player && looterState.player && chebyshevDistance(dropperState.player, looterState.player) <= 1;
    }, 5000);
    await postJson(`/runtime/players/${dropperId}/grant-item`, {
        itemId: TARGET_ITEM_ID,
        count: DROP_COUNT,
    });
    await waitFor(() => dropperPanels.some((payload) => hasInventoryCountPatch(payload, TARGET_ITEM_ID, DROP_COUNT)), 5000);
    const dropperSlot = await waitForState(async () => findLatestInventorySlotPatch(dropperPanels, TARGET_ITEM_ID, DROP_COUNT), 5000);
    const dropperLocation = await fetchState(dropperId);
    if (!dropperSlot) {
        throw new Error(`missing ${TARGET_ITEM_ID} before drop`);
    }
    const slotIndex = dropperSlot.slotIndex;
    const dropX = dropperLocation.player.x;
    const dropY = dropperLocation.player.y;
    const dropperCountBefore = dropperSlot.count;
    const looterCountBefore = getInventoryCount((await fetchState(looterId)).player, TARGET_ITEM_ID);
    const tileBeforeDrop = await fetchTileState(dropperLocation.player.instanceId, dropX, dropY);
    const groundCountBefore = getGroundItemCount(tileBeforeDrop?.tile?.groundPile, TARGET_ITEM_ID);
    dropper.emit(shared_1.NEXT_C2S.DropItem, {
        slotIndex,
        count: DROP_COUNT,
    });
    const droppedPile = await waitForState(async () => {
        const [dropperState, tileState] = await Promise.all([
            fetchState(dropperId),
            fetchTileState(dropperLocation.player.instanceId, dropX, dropY),
        ]);
        const inventoryCount = getInventoryCount(dropperState.player, TARGET_ITEM_ID);
        const groundPile = tileState?.tile?.groundPile ?? null;
        const groundCount = getGroundItemCount(groundPile, TARGET_ITEM_ID);
        if (inventoryCount !== Math.max(0, dropperCountBefore - DROP_COUNT)) {
            return null;
        }
        if (groundCount < groundCountBefore + DROP_COUNT) {
            return null;
        }
        return groundPile;
    }, 5000).catch(async (error) => {
        const tileState = await fetchTileState(dropperLocation.player.instanceId, dropX, dropY).catch(() => null);
        throw new Error([
            error instanceof Error ? error.message : String(error),
            `tileState=${JSON.stringify(tileState)}`,
            `dropperLastPanel=${JSON.stringify(dropperPanels[dropperPanels.length - 1] ?? null)}`,
            `dropperLastWorld=${JSON.stringify(dropperWorld[dropperWorld.length - 1] ?? null)}`,
            `looterLastWorld=${JSON.stringify(looterWorld[looterWorld.length - 1] ?? null)}`,
        ].join('\n'));
    });
    await waitFor(() => (dropperPanels.some((payload) => hasInventoryPatchForCount(payload, TARGET_ITEM_ID, dropperCountBefore - DROP_COUNT))), 5000);
    const dropperAfterMove = { x: null, y: null };
    looter.emit(shared_1.NEXT_C2S.TakeGround, {
        sourceId: droppedPile.sourceId,
        itemKey: TARGET_ITEM_ID,
    });
    await waitFor(async () => {
        const [looterState, tileState] = await Promise.all([
            fetchState(looterId),
            fetchTileState(dropperLocation.player.instanceId, dropX, dropY),
        ]);
        const looterCount = getInventoryCount(looterState.player, TARGET_ITEM_ID);
        const groundCount = getGroundItemCount(tileState?.tile?.groundPile, TARGET_ITEM_ID);
        return looterCount >= looterCountBefore + DROP_COUNT && groundCount <= groundCountBefore;
    }, 5000);
    const finalDropper = await safeFetchState(dropperId);
    const finalLooter = await safeFetchState(looterId);
    dropper.close();
    await deletePlayer(dropperId);
    looter.close();
    await deletePlayer(looterId);
    console.log(JSON.stringify({
        ok: true,
        url: SERVER_NEXT_URL,
        dropperId,
        looterId,
        dropTile: { x: dropX, y: dropY },
        movedDropperTo: { x: dropperAfterMove.x, y: dropperAfterMove.y },
        groundSourceId: droppedPile.sourceId,
        dropPatchedForDropper: Boolean(findGroundPatch(dropperWorld, dropX, dropY, TARGET_ITEM_ID, groundCountBefore + DROP_COUNT)),
        dropPatchedForLooter: Boolean(findGroundPatch(looterWorld, dropX, dropY, TARGET_ITEM_ID, groundCountBefore + DROP_COUNT)),
        removePatchedForDropper: hasGroundRemovePatch(dropperWorld, droppedPile.sourceId),
        removePatchedForLooter: hasGroundRemovePatch(looterWorld, droppedPile.sourceId),
        finalDropperCount: getInventoryCount(finalDropper?.player, TARGET_ITEM_ID),
        finalLooterCount: getInventoryCount(finalLooter?.player, TARGET_ITEM_ID),
        groundCountBefore,
        finalGroundCount: getGroundItemCount((await fetchTileState(dropperLocation.player.instanceId, dropX, dropY).catch(() => null))?.tile?.groundPile, TARGET_ITEM_ID),
        finalDropper,
        finalLooter,
    }, null, 2));
}
async function moveAwayFromTile(socket, playerId, fromX, fromY) {
    const candidates = [
        { x: fromX, y: fromY - 1 },
        { x: fromX, y: fromY + 1 },
        { x: fromX - 1, y: fromY },
        { x: fromX + 1, y: fromY },
    ];
    for (const candidate of candidates) {
        socket.emit(shared_1.NEXT_C2S.MoveTo, {
            x: candidate.x,
            y: candidate.y,
            allowNearestReachable: false,
        });
        const moved = await waitForState(async () => {
            const state = await fetchState(playerId);
            return state.player.x === candidate.x && state.player.y === candidate.y
                ? { x: state.player.x, y: state.player.y }
                : null;
        }, 2500, false);
        if (moved) {
            return moved;
        }
    }
    throw new Error(`player ${playerId} failed to move away from ${fromX},${fromY}`);
}
async function movePlayerToTile(socket, playerId, targetX, targetY) {
    const state = await fetchState(playerId);
    if (state.player.x === targetX && state.player.y === targetY) {
        return { x: state.player.x, y: state.player.y };
    }
    socket.emit(shared_1.NEXT_C2S.MoveTo, {
        x: targetX,
        y: targetY,
        allowNearestReachable: false,
    });
    return waitForState(async () => {
        const next = await fetchState(playerId);
        return next.player.x === targetX && next.player.y === targetY
            ? { x: next.player.x, y: next.player.y }
            : null;
    }, 4000);
}
function findGroundPatch(events, x, y, itemKey, count) {
    for (let index = events.length - 1; index >= 0; index -= 1) {
        const piles = events[index]?.g;
        if (!piles) {
            continue;
        }
        for (const pile of piles) {
            const item = pile.items?.find((entry) => entry.itemKey === itemKey);
            if (pile.x === x && pile.y === y && item?.count === count) {
                return pile;
            }
        }
    }
    return null;
}
function hasGroundRemovePatch(events, sourceId) {
    return events.some((payload) => payload.g?.some((entry) => entry.sourceId === sourceId && entry.items === null));
}
function hasInventoryCountPatch(payload, itemId, count) {
    return payload.inv?.slots?.some((entry) => entry.item?.itemId === itemId && entry.item.count === count) ?? false;
}
function hasInventoryPatchForCount(payload, itemId, count) {
    if (count > 0) {
        return hasInventoryCountPatch(payload, itemId, count);
    }
    return payload.inv?.slots?.some((entry) => entry.item === null) ?? false;
}
function getInventoryCount(player, itemId) {
    const entry = player.inventory?.items?.find((item) => item.itemId === itemId);
    return entry?.count ?? 0;
}
function getGroundItemCount(groundPile, itemId) {
    const entry = groundPile?.items?.find((item) => item.itemId === itemId || item.itemKey === itemId);
    return entry?.count ?? 0;
}
function findInventorySlot(items, itemId) {
    if (!items) {
        return null;
    }
    const slotIndex = items.findIndex((item) => item?.itemId === itemId);
    if (slotIndex < 0) {
        return null;
    }
    return {
        slotIndex,
        count: items[slotIndex]?.count ?? 0,
    };
}
function findLatestInventorySlotPatch(payloads, itemId, minimumCount) {
    for (let index = payloads.length - 1; index >= 0; index -= 1) {
        const slots = payloads[index]?.inv?.slots;
        if (!slots) {
            continue;
        }
        for (const entry of slots) {
            if (entry.item?.itemId === itemId && entry.item.count >= minimumCount) {
                return {
                    slotIndex: entry.slotIndex,
                    count: entry.item.count,
                };
            }
        }
    }
    return null;
}
function chebyshevDistance(left, right) {
    return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
}
async function fetchState(playerId) {
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/players/${playerId}/state`);
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
}
async function fetchTileState(instanceId, x, y) {
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/instances/${instanceId}/tiles/${x}/${y}`);
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
}
async function safeFetchState(playerId) {
    try {
        return await fetchState(playerId);
    }
    catch {
        return null;
    }
}
async function postJson(path, body) {
    const response = await fetch(`${SERVER_NEXT_URL}${path}`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
}
async function onceConnected(socket) {
    if (socket.connected) {
        return;
    }
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('socket connect timeout')), 4000);
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
async function deletePlayer(playerId) {
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/players/${playerId}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
}
async function waitFor(predicate, timeoutMs) {
    const startedAt = Date.now();
    while (!(await predicate())) {
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error('waitFor timeout');
        }
        await sleep(100);
    }
}
async function waitForState(loader, timeoutMs, rejectOnTimeout = true) {
    const startedAt = Date.now();
    while (true) {
        const value = await loader();
        if (value) {
            return value;
        }
        if (Date.now() - startedAt > timeoutMs) {
            if (rejectOnTimeout) {
                throw new Error('waitForState timeout');
            }
            return null;
        }
        await sleep(100);
    }
}
function sleep(timeoutMs) {
    return new Promise((resolve) => setTimeout(resolve, timeoutMs));
}
main();
//# sourceMappingURL=loot-smoke.js.map

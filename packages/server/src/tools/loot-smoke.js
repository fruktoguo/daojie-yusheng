"use strict";
/**
 * 用途：执行 loot 链路的冒烟验证。
 */

Object.defineProperty(exports, "__esModule", { value: true });
const smoke_timeout_1 = require("./smoke-timeout");
(0, smoke_timeout_1.installSmokeTimeout)(__filename);
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared-next");
const env_alias_1 = require("../config/env-alias");
/**
 * 记录 server-next 访问地址。
 */
const SERVER_NEXT_URL = (0, env_alias_1.resolveServerNextUrl)() || 'http://127.0.0.1:3111';
/**
 * 记录dropperID。
 */
let dropperId = '';
/**
 * 记录looterID。
 */
let looterId = '';
/**
 * 记录目标物品ID。
 */
const TARGET_ITEM_ID = 'rat_tail';
/**
 * 记录drop数量。
 */
const DROP_COUNT = 2;
/**
 * 串联执行脚本主流程。
 */
async function main() {
/**
 * 记录dropper。
 */
    const dropper = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
    });
/**
 * 记录looter。
 */
    const looter = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
    });
/**
 * 记录dropperpanels。
 */
    const dropperPanels = [];
/**
 * 记录looterpanels。
 */
    const looterPanels = [];
/**
 * 记录dropperworld。
 */
    const dropperWorld = [];
/**
 * 记录looterworld。
 */
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
    dropper.on(shared_1.NEXT_S2C.InitSession, (payload) => {
        dropperId = String(payload?.pid ?? '');
    });
    looter.on(shared_1.NEXT_S2C.InitSession, (payload) => {
        looterId = String(payload?.pid ?? '');
    });
    await Promise.all([onceConnected(dropper), onceConnected(looter)]);
    dropper.emit(shared_1.NEXT_C2S.Hello, {
        mapId: 'yunlai_town',
        preferredX: 32,
        preferredY: 5,
    });
    looter.emit(shared_1.NEXT_C2S.Hello, {
        mapId: 'yunlai_town',
        preferredX: 33,
        preferredY: 5,
    });
    await waitFor(async () => {
        if (!dropperId || !looterId) {
            return false;
        }
        const [dropperState, looterState] = await Promise.all([fetchState(dropperId), fetchState(looterId)]);
        return dropperState.player && looterState.player && chebyshevDistance(dropperState.player, looterState.player) <= 1;
    }, 5000);
    await postJson(`/runtime/players/${dropperId}/grant-item`, {
        itemId: TARGET_ITEM_ID,
        count: DROP_COUNT,
    });
    await waitFor(() => dropperPanels.some((payload) => hasInventoryCountPatch(payload, TARGET_ITEM_ID, DROP_COUNT)), 5000);
/**
 * 记录dropperslot。
 */
    const dropperSlot = await waitForState(async () => findLatestInventorySlotPatch(dropperPanels, TARGET_ITEM_ID, DROP_COUNT), 5000);
/**
 * 记录dropperlocation。
 */
    const dropperLocation = await fetchState(dropperId);
    if (!dropperSlot) {
        throw new Error(`missing ${TARGET_ITEM_ID} before drop`);
    }
/**
 * 记录slot索引。
 */
    const slotIndex = dropperSlot.slotIndex;
/**
 * 记录dropx。
 */
    const dropX = dropperLocation.player.x;
/**
 * 记录dropy。
 */
    const dropY = dropperLocation.player.y;
/**
 * 记录dropper数量before。
 */
    const dropperCountBefore = dropperSlot.count;
/**
 * 记录looter数量before。
 */
    const looterCountBefore = getInventoryCount((await fetchState(looterId)).player, TARGET_ITEM_ID);
/**
 * 记录tilebeforedrop。
 */
    const tileBeforeDrop = await fetchTileState(dropperLocation.player.instanceId, dropX, dropY);
/**
 * 记录ground数量before。
 */
    const groundCountBefore = getGroundItemCount(tileBeforeDrop?.tile?.groundPile, TARGET_ITEM_ID);
    dropper.emit(shared_1.NEXT_C2S.DropItem, {
        slotIndex,
        count: DROP_COUNT,
    });
/**
 * 记录droppedpile。
 */
    const droppedPile = await waitForState(async () => {
        const [dropperState, tileState] = await Promise.all([
            fetchState(dropperId),
            fetchTileState(dropperLocation.player.instanceId, dropX, dropY),
        ]);
/**
 * 记录inventory数量。
 */
        const inventoryCount = getInventoryCount(dropperState.player, TARGET_ITEM_ID);
/**
 * 记录groundpile。
 */
        const groundPile = tileState?.tile?.groundPile ?? null;
/**
 * 记录ground数量。
 */
        const groundCount = getGroundItemCount(groundPile, TARGET_ITEM_ID);
        if (inventoryCount !== Math.max(0, dropperCountBefore - DROP_COUNT)) {
            return null;
        }
        if (groundCount < groundCountBefore + DROP_COUNT) {
            return null;
        }
        return groundPile;
    }, 5000).catch(async (error) => {
/**
 * 记录tile状态。
 */
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
/**
 * 记录dropperaftermove。
 */
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
/**
 * 记录looter数量。
 */
        const looterCount = getInventoryCount(looterState.player, TARGET_ITEM_ID);
/**
 * 记录ground数量。
 */
        const groundCount = getGroundItemCount(tileState?.tile?.groundPile, TARGET_ITEM_ID);
        return looterCount >= looterCountBefore + DROP_COUNT && groundCount <= groundCountBefore;
    }, 5000);
/**
 * 记录finaldropper。
 */
    const finalDropper = await safeFetchState(dropperId);
/**
 * 记录finallooter。
 */
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
/**
 * 处理moveawayfromtile。
 */
async function moveAwayFromTile(socket, playerId, fromX, fromY) {
/**
 * 记录candidates。
 */
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
/**
 * 记录moved。
 */
        const moved = await waitForState(async () => {
/**
 * 记录状态。
 */
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
/**
 * 处理move玩家totile。
 */
async function movePlayerToTile(socket, playerId, targetX, targetY) {
/**
 * 记录状态。
 */
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
/**
 * 记录next。
 */
        const next = await fetchState(playerId);
        return next.player.x === targetX && next.player.y === targetY
            ? { x: next.player.x, y: next.player.y }
            : null;
    }, 4000);
}
/**
 * 查找groundpatch。
 */
function findGroundPatch(events, x, y, itemKey, count) {
    for (let index = events.length - 1; index >= 0; index -= 1) {
/**
 * 记录piles。
 */
        const piles = events[index]?.g;
        if (!piles) {
            continue;
        }
        for (const pile of piles) {
/**
 * 记录物品。
 */
            const item = pile.items?.find((entry) => entry.itemKey === itemKey);
            if (pile.x === x && pile.y === y && item?.count === count) {
                return pile;
            }
        }
    }
    return null;
}
/**
 * 判断是否已groundremovepatch。
 */
function hasGroundRemovePatch(events, sourceId) {
    return events.some((payload) => payload.g?.some((entry) => entry.sourceId === sourceId && entry.items === null));
}
/**
 * 判断是否已inventory数量patch。
 */
function hasInventoryCountPatch(payload, itemId, count) {
    return payload.inv?.slots?.some((entry) => entry.item?.itemId === itemId && entry.item.count === count) ?? false;
}
/**
 * 判断是否已inventorypatchfor数量。
 */
function hasInventoryPatchForCount(payload, itemId, count) {
    if (count > 0) {
        return hasInventoryCountPatch(payload, itemId, count);
    }
    return payload.inv?.slots?.some((entry) => entry.item === null) ?? false;
}
/**
 * 获取inventory数量。
 */
function getInventoryCount(player, itemId) {
/**
 * 记录entry。
 */
    const entry = player.inventory?.items?.find((item) => item.itemId === itemId);
    return entry?.count ?? 0;
}
/**
 * 获取ground物品数量。
 */
function getGroundItemCount(groundPile, itemId) {
/**
 * 记录entry。
 */
    const entry = groundPile?.items?.find((item) => item.itemId === itemId || item.itemKey === itemId);
    return entry?.count ?? 0;
}
/**
 * 查找inventoryslot。
 */
function findInventorySlot(items, itemId) {
    if (!items) {
        return null;
    }
/**
 * 记录slot索引。
 */
    const slotIndex = items.findIndex((item) => item?.itemId === itemId);
    if (slotIndex < 0) {
        return null;
    }
    return {
        slotIndex,
        count: items[slotIndex]?.count ?? 0,
    };
}
/**
 * 查找latestinventoryslotpatch。
 */
function findLatestInventorySlotPatch(payloads, itemId, minimumCount) {
    for (let index = payloads.length - 1; index >= 0; index -= 1) {
/**
 * 记录slots。
 */
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
/**
 * 处理chebyshevdistance。
 */
function chebyshevDistance(left, right) {
    return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
}
/**
 * 处理fetch状态。
 */
async function fetchState(playerId) {
/**
 * 记录response。
 */
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/players/${playerId}/state`);
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
}
/**
 * 处理fetchtile状态。
 */
async function fetchTileState(instanceId, x, y) {
/**
 * 记录response。
 */
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/instances/${instanceId}/tiles/${x}/${y}`);
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
}
/**
 * 处理safefetch状态。
 */
async function safeFetchState(playerId) {
    try {
        return await fetchState(playerId);
    }
    catch {
        return null;
    }
}
/**
 * 处理postjson。
 */
async function postJson(path, body) {
/**
 * 记录response。
 */
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
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
}
/**
 * 等待for。
 */
async function waitFor(predicate, timeoutMs) {
/**
 * 记录startedat。
 */
    const startedAt = Date.now();
    while (!(await predicate())) {
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error('waitFor timeout');
        }
        await sleep(100);
    }
}
/**
 * 等待for状态。
 */
async function waitForState(loader, timeoutMs, rejectOnTimeout = true) {
/**
 * 记录startedat。
 */
    const startedAt = Date.now();
    while (true) {
/**
 * 记录价值。
 */
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
/**
 * 处理sleep。
 */
function sleep(timeoutMs) {
    return new Promise((resolve) => setTimeout(resolve, timeoutMs));
}
main();
//# sourceMappingURL=loot-smoke.js.map

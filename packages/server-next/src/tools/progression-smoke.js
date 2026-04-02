"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared-next");
const SERVER_NEXT_URL = process.env.SERVER_NEXT_URL ?? 'http://127.0.0.1:3111';
const playerId = process.env.SERVER_NEXT_SMOKE_PLAYER_ID ?? `progress_${Date.now().toString(36)}`;
async function main() {
    const socket = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
    });
    const panelEvents = [];
    const selfEvents = [];
    socket.on(shared_1.NEXT_S2C.Error, (payload) => {
        throw new Error(`socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.NEXT_S2C.PanelDelta, (payload) => {
        panelEvents.push(payload);
    });
    socket.on(shared_1.NEXT_S2C.SelfDelta, (payload) => {
        selfEvents.push(payload);
    });
    await onceConnected(socket);
    socket.emit(shared_1.NEXT_C2S.Hello, {
        playerId,
        mapId: 'yunlai_town',
        preferredX: 32,
        preferredY: 5,
    });
    await waitFor(async () => {
        const state = await fetchState();
        return Array.isArray(state.player?.inventory.items) && state.player.inventory.items.length >= 2 && panelEvents.length > 0;
    }, 5000);
    await postJson(`/runtime/players/${playerId}/grant-item`, {
        itemId: 'equip.road_cleaver',
        count: 1,
    });
    await waitFor(() => panelEvents.some(hasGrantedEquipmentPatch), 5000);
    let currentState = await fetchState();
    const bookSlot = currentState.player.inventory.items.findIndex((entry) => entry.itemId === 'book.qingmu_sword');
    if (bookSlot < 0) {
        throw new Error('starter technique book missing');
    }
    socket.emit(shared_1.NEXT_C2S.UseItem, { slotIndex: bookSlot });
    await waitFor(async () => {
        const state = await fetchState();
        return state.player?.techniques?.techniques?.some((entry) => entry.techId === 'qingmu_sword')
            && panelEvents.some(hasLearnTechniquePatch)
            && panelEvents.some(hasTechniqueAttrPatch);
    }, 5000);
    currentState = await fetchState();
    const equipmentSlot = currentState.player.inventory.items.findIndex((entry) => entry.itemId === 'equip.road_cleaver');
    if (equipmentSlot < 0) {
        throw new Error('equipment item missing after learning');
    }
    socket.emit(shared_1.NEXT_C2S.Equip, { slotIndex: equipmentSlot });
    await waitFor(async () => {
        const state = await fetchState();
        return state.player?.equipment?.slots?.some((entry) => entry.slot === 'weapon' && entry.item?.itemId === 'equip.road_cleaver')
            && panelEvents.some(hasEquipPatch)
            && panelEvents.some(hasEquipmentAttrPatch);
    }, 5000);
    socket.emit(shared_1.NEXT_C2S.Cultivate, { techId: 'qingmu_sword' });
    await waitFor(async () => {
        const state = await fetchState();
        return state.player?.techniques?.cultivatingTechId === 'qingmu_sword'
            && panelEvents.some(hasCultivatePatch);
    }, 5000);
    socket.emit(shared_1.NEXT_C2S.Unequip, { slot: 'weapon' });
    await waitFor(async () => {
        const state = await fetchState();
        return state.player?.equipment?.slots?.some((entry) => entry.slot === 'weapon' && entry.item === null)
            && panelEvents.some(hasUnequipPatch);
    }, 5000);
    await postJson(`/runtime/players/${playerId}/vitals`, { hp: 50, qi: 0 });
    currentState = await fetchState();
    const healSlot = currentState.player.inventory.items.findIndex((entry) => entry.itemId === 'pill.minor_heal');
    if (healSlot < 0) {
        throw new Error('starter heal consumable missing');
    }
    socket.emit(shared_1.NEXT_C2S.UseItem, { slotIndex: healSlot });
    await waitFor(async () => {
        const state = await fetchState();
        return (state.player?.hp ?? 0) >= 76
            && state.player?.inventory?.items?.some((entry) => entry.itemId === 'pill.minor_heal' && entry.count === 2)
            && selfEvents.some((entry) => (entry.hp ?? 0) >= 76)
            && panelEvents.some(hasHealConsumablePatch);
    }, 5000);
    await postJson(`/runtime/players/${playerId}/grant-item`, {
        itemId: 'pill.windstride_elixir',
        count: 1,
    });
    await waitFor(() => panelEvents.some(hasWindstrideInventoryPatch), 5000);
    currentState = await fetchState();
    const buffSlot = currentState.player.inventory.items.findIndex((entry) => entry.itemId === 'pill.windstride_elixir');
    if (buffSlot < 0) {
        throw new Error('windstride consumable missing');
    }
    socket.emit(shared_1.NEXT_C2S.UseItem, { slotIndex: buffSlot });
    await waitFor(async () => {
        const state = await fetchState();
        return state.player?.buffs?.buffs?.some((entry) => entry.buffId === 'item_buff.windstride' && entry.remainingTicks > 0)
            && (state.player?.attrs?.numericStats?.moveSpeed ?? 0) >= 28
            && panelEvents.some(hasWindstrideBuffPatch)
            && panelEvents.some(hasWindstrideAttrPatch);
    }, 5000);
    await postJson(`/runtime/players/${playerId}/grant-item`, {
        itemId: 'map.bamboo_forest',
        count: 1,
    });
    await waitFor(() => panelEvents.some(hasBambooMapInventoryPatch), 5000);
    currentState = await fetchState();
    const mapSlot = currentState.player.inventory.items.findIndex((entry) => entry.itemId === 'map.bamboo_forest');
    if (mapSlot < 0) {
        throw new Error('bamboo map item missing');
    }
    socket.emit(shared_1.NEXT_C2S.UseItem, { slotIndex: mapSlot });
    await waitFor(async () => {
        const state = await fetchState();
        return state.player?.unlockedMapIds?.includes('bamboo_forest')
            && state.player?.inventory?.items?.every((entry) => entry.itemId !== 'map.bamboo_forest')
            && panelEvents.some(hasBambooMapConsumePatch);
    }, 5000);
    await postJson(`/runtime/players/${playerId}/grant-item`, {
        itemId: 'spirit_stone',
        count: 1,
    });
    await waitFor(() => panelEvents.some(hasSpiritStoneInventoryPatch), 5000);
    currentState = await fetchState();
    const spiritStoneSlot = currentState.player.inventory.items.findIndex((entry) => entry.itemId === 'spirit_stone');
    if (spiritStoneSlot < 0) {
        throw new Error('spirit stone missing');
    }
    const auraBefore = await fetchTileAura(currentState.player.instanceId, currentState.player.x, currentState.player.y);
    socket.emit(shared_1.NEXT_C2S.UseItem, { slotIndex: spiritStoneSlot });
    await waitFor(async () => {
        const state = await fetchState();
        const auraAfter = await fetchTileAura(state.player.instanceId, state.player.x, state.player.y);
        return auraAfter === auraBefore + 100
            && state.player?.inventory?.items?.every((entry) => entry.itemId !== 'spirit_stone')
            && panelEvents.some(hasSpiritStoneConsumePatch);
    }, 5000);
    const finalTileAura = await fetchTileAura(currentState.player.instanceId, currentState.player.x, currentState.player.y);
    socket.close();
    await deletePlayer(playerId);
    console.log(JSON.stringify({
        ok: true,
        url: SERVER_NEXT_URL,
        playerId,
        panelEventCount: panelEvents.length,
        learnedTechniquePatched: panelEvents.some(hasLearnTechniquePatch),
        techniqueAttrPatched: panelEvents.some(hasTechniqueAttrPatch),
        equipPatched: panelEvents.some(hasEquipPatch),
        equipmentAttrPatched: panelEvents.some(hasEquipmentAttrPatch),
        cultivatePatched: panelEvents.some(hasCultivatePatch),
        unequipPatched: panelEvents.some(hasUnequipPatch),
        healConsumablePatched: panelEvents.some(hasHealConsumablePatch),
        healSelfPatched: selfEvents.some((entry) => entry.hp === 76),
        windstrideBuffPatched: panelEvents.some(hasWindstrideBuffPatch),
        windstrideAttrPatched: panelEvents.some(hasWindstrideAttrPatch),
        mapUnlockPatched: panelEvents.some(hasBambooMapConsumePatch),
        spiritStonePatched: panelEvents.some(hasSpiritStoneConsumePatch),
        finalTileAura,
        finalState: await fetchState(),
    }, null, 2));
}
function hasGrantedEquipmentPatch(payload) {
    return payload.inv?.slots?.some((entry) => entry.item?.itemId === 'equip.road_cleaver') ?? false;
}
function hasLearnTechniquePatch(payload) {
    return payload.tech?.techniques?.some((entry) => entry.techId === 'qingmu_sword') ?? false;
}
function hasTechniqueAttrPatch(payload) {
    return (payload.attr?.finalAttrs?.perception ?? 0) >= 13;
}
function hasEquipPatch(payload) {
    return payload.eq?.slots?.some((entry) => entry.slot === 'weapon' && entry.item?.itemId === 'equip.road_cleaver') ?? false;
}
function hasEquipmentAttrPatch(payload) {
    return (payload.attr?.numericStats?.physAtk ?? 0) >= 14;
}
function hasCultivatePatch(payload) {
    return payload.tech?.cultivatingTechId === 'qingmu_sword';
}
function hasUnequipPatch(payload) {
    return payload.eq?.slots?.some((entry) => entry.slot === 'weapon' && entry.item === null) ?? false;
}
function hasHealConsumablePatch(payload) {
    return payload.inv?.slots?.some((entry) => entry.item?.itemId === 'pill.minor_heal' && entry.item.count === 2) ?? false;
}
function hasWindstrideInventoryPatch(payload) {
    return payload.inv?.slots?.some((entry) => entry.item?.itemId === 'pill.windstride_elixir') ?? false;
}
function hasWindstrideBuffPatch(payload) {
    return payload.buff?.buffs?.some((entry) => entry.buffId === 'item_buff.windstride' && entry.remainingTicks > 0) ?? false;
}
function hasWindstrideAttrPatch(payload) {
    return (payload.attr?.numericStats?.moveSpeed ?? 0) >= 28;
}
function hasBambooMapInventoryPatch(payload) {
    return payload.inv?.slots?.some((entry) => entry.item?.itemId === 'map.bamboo_forest') ?? false;
}
function hasBambooMapConsumePatch(payload) {
    return payload.inv?.slots?.some((entry) => entry.item === null || entry.item?.itemId !== 'map.bamboo_forest') ?? false;
}
function hasSpiritStoneInventoryPatch(payload) {
    return payload.inv?.slots?.some((entry) => entry.item?.itemId === 'spirit_stone') ?? false;
}
function hasSpiritStoneConsumePatch(payload) {
    return payload.inv?.slots?.some((entry) => entry.item === null || entry.item?.itemId !== 'spirit_stone') ?? false;
}
async function fetchState() {
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/players/${playerId}/state`);
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
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
}
async function deletePlayer(playerIdToDelete) {
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/players/${playerIdToDelete}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
}
async function fetchTileAura(instanceId, x, y) {
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/instances/${instanceId}/tiles/${x}/${y}`);
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
    const payload = await response.json();
    return payload.tile?.aura ?? 0;
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
async function waitFor(predicate, timeoutMs) {
    const startedAt = Date.now();
    while (!(await predicate())) {
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error('waitFor timeout');
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
}
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
//# sourceMappingURL=progression-smoke.js.map
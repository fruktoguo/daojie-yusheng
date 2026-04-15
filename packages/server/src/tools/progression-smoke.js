"use strict";
/**
 * 用途：执行 progression 链路的冒烟验证。
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
 * 记录玩家ID。
 */
let playerId = '';
/**
 * 串联执行脚本主流程。
 */
async function main() {
/**
 * 记录socket。
 */
    const socket = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
    });
/**
 * 记录panelevents。
 */
    const panelEvents = [];
/**
 * 记录selfevents。
 */
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
    socket.on(shared_1.NEXT_S2C.InitSession, (payload) => {
        playerId = String(payload?.pid ?? '');
    });
    await onceConnected(socket);
    socket.emit(shared_1.NEXT_C2S.Hello, {
        mapId: 'yunlai_town',
        preferredX: 32,
        preferredY: 5,
    });
    await waitFor(async () => {
        if (!playerId) {
            return false;
        }
/**
 * 记录状态。
 */
        const state = await fetchState();
        return Array.isArray(state.player?.inventory.items) && state.player.inventory.items.length >= 2 && panelEvents.length > 0;
    }, 5000);
    await postJson(`/runtime/players/${playerId}/grant-item`, {
        itemId: 'equip.geng_gate_blade',
        count: 1,
    });
    await waitFor(() => panelEvents.some(hasGrantedEquipmentPatch), 5000);
/**
 * 记录当前值状态。
 */
    let currentState = await fetchState();
/**
 * 记录bookslot。
 */
    const bookSlot = currentState.player.inventory.items.findIndex((entry) => entry.itemId === 'book.qingmu_sword');
    if (bookSlot < 0) {
        throw new Error('starter technique book missing');
    }
    socket.emit(shared_1.NEXT_C2S.UseItem, { slotIndex: bookSlot });
    await waitFor(async () => {
/**
 * 记录状态。
 */
        const state = await fetchState();
        return state.player?.techniques?.techniques?.some((entry) => entry.techId === 'qingmu_sword')
            && panelEvents.some(hasLearnTechniquePatch)
            && panelEvents.some(hasTechniqueAttrPatch);
    }, 5000);
    currentState = await fetchState();
/**
 * 记录equipmentslot。
 */
    const equipmentSlot = currentState.player.inventory.items.findIndex((entry) => entry.itemId === 'equip.geng_gate_blade');
    if (equipmentSlot < 0) {
        throw new Error('equipment item missing after learning');
    }
    socket.emit(shared_1.NEXT_C2S.Equip, { slotIndex: equipmentSlot });
    await waitFor(async () => {
/**
 * 记录状态。
 */
        const state = await fetchState();
        return state.player?.equipment?.slots?.some((entry) => entry.slot === 'weapon' && entry.item?.itemId === 'equip.geng_gate_blade')
            && panelEvents.some(hasEquipPatch)
            && panelEvents.some(hasEquipmentAttrPatch);
    }, 5000);
    socket.emit(shared_1.NEXT_C2S.Cultivate, { techId: 'qingmu_sword' });
    await waitFor(async () => {
/**
 * 记录状态。
 */
        const state = await fetchState();
        return state.player?.techniques?.cultivatingTechId === 'qingmu_sword'
            && panelEvents.some(hasCultivatePatch);
    }, 5000);
    socket.emit(shared_1.NEXT_C2S.Unequip, { slot: 'weapon' });
    await waitFor(async () => {
/**
 * 记录状态。
 */
        const state = await fetchState();
        return state.player?.equipment?.slots?.some((entry) => entry.slot === 'weapon' && entry.item === null)
            && panelEvents.some(hasUnequipPatch);
    }, 5000);
    await postJson(`/runtime/players/${playerId}/vitals`, { hp: 50, qi: 0 });
    currentState = await fetchState();
/**
 * 记录healslot。
 */
    const healSlot = currentState.player.inventory.items.findIndex((entry) => entry.itemId === 'pill.minor_heal');
    if (healSlot < 0) {
        throw new Error('starter heal consumable missing');
    }
    socket.emit(shared_1.NEXT_C2S.UseItem, { slotIndex: healSlot });
    await waitFor(async () => {
/**
 * 记录状态。
 */
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
/**
 * 记录Buffslot。
 */
    const buffSlot = currentState.player.inventory.items.findIndex((entry) => entry.itemId === 'pill.windstride_elixir');
    if (buffSlot < 0) {
        throw new Error('windstride consumable missing');
    }
    socket.emit(shared_1.NEXT_C2S.UseItem, { slotIndex: buffSlot });
    await waitFor(async () => {
/**
 * 记录状态。
 */
        const state = await fetchState();
        return state.player?.buffs?.buffs?.some((entry) => entry.buffId === 'item_buff.windstride' && entry.remainingTicks > 0)
            && hasWindstrideStateBoost(state)
            && panelEvents.some(hasWindstrideBuffPatch)
            && panelEvents.some(hasWindstrideAttrPatch);
    }, 5000);
    await postJson(`/runtime/players/${playerId}/grant-item`, {
        itemId: 'map.bamboo_forest',
        count: 1,
    });
    await waitFor(() => panelEvents.some(hasBambooMapInventoryPatch), 5000);
    currentState = await fetchState();
/**
 * 记录地图slot。
 */
    const mapSlot = currentState.player.inventory.items.findIndex((entry) => entry.itemId === 'map.bamboo_forest');
    if (mapSlot < 0) {
        throw new Error('bamboo map item missing');
    }
    socket.emit(shared_1.NEXT_C2S.UseItem, { slotIndex: mapSlot });
    await waitFor(async () => {
/**
 * 记录状态。
 */
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
/**
 * 记录spiritstoneslot。
 */
    const spiritStoneSlot = currentState.player.inventory.items.findIndex((entry) => entry.itemId === 'spirit_stone');
    if (spiritStoneSlot < 0) {
        throw new Error('spirit stone missing');
    }
/**
 * 记录灵气before。
 */
    const auraBefore = await fetchTileAura(currentState.player.instanceId, currentState.player.x, currentState.player.y);
    socket.emit(shared_1.NEXT_C2S.UseItem, { slotIndex: spiritStoneSlot });
    await waitFor(async () => {
/**
 * 记录状态。
 */
        const state = await fetchState();
/**
 * 记录灵气after。
 */
        const auraAfter = await fetchTileAura(state.player.instanceId, state.player.x, state.player.y);
        return auraAfter === auraBefore + 100
            && state.player?.inventory?.items?.every((entry) => entry.itemId !== 'spirit_stone')
            && panelEvents.some(hasSpiritStoneConsumePatch);
    }, 5000);
/**
 * 记录finaltile灵气。
 */
    const finalTileAura = await fetchTileAura(currentState.player.instanceId, currentState.player.x, currentState.player.y);
    socket.close();
    if (playerId) {
        await deletePlayer(playerId);
    }
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
        healSelfPatched: selfEvents.some((entry) => (entry.hp ?? 0) >= 76),
        windstrideBuffPatched: panelEvents.some(hasWindstrideBuffPatch),
        windstrideAttrPatched: panelEvents.some(hasWindstrideAttrPatch),
        mapUnlockPatched: panelEvents.some(hasBambooMapConsumePatch),
        spiritStonePatched: panelEvents.some(hasSpiritStoneConsumePatch),
        finalTileAura,
        finalState: await fetchState(),
    }, null, 2));
}
/**
 * 判断是否已grantedequipmentpatch。
 */
function hasGrantedEquipmentPatch(payload) {
    return payload.inv?.slots?.some((entry) => entry.item?.itemId === 'equip.geng_gate_blade') ?? false;
}
/**
 * 判断是否已learn功法patch。
 */
function hasLearnTechniquePatch(payload) {
    return payload.tech?.techniques?.some((entry) => entry.techId === 'qingmu_sword') ?? false;
}
/**
 * 判断是否已功法attrpatch。
 */
function hasTechniqueAttrPatch(payload) {
    return (payload.attr?.realmProgress ?? 0) > 0
        || (payload.attr?.numericStats?.techniqueExpPerTick ?? 0) > 0
        || (payload.attr?.numericStats?.spellAtk ?? 0) > 5.5;
}
/**
 * 判断是否已equippatch。
 */
function hasEquipPatch(payload) {
    return payload.eq?.slots?.some((entry) => entry.slot === 'weapon' && entry.item?.itemId === 'equip.geng_gate_blade') ?? false;
}
/**
 * 判断是否已equipmentattrpatch。
 */
function hasEquipmentAttrPatch(payload) {
    return (payload.attr?.numericStats?.physAtk ?? 0) >= 14;
}
/**
 * 判断是否已cultivatepatch。
 */
function hasCultivatePatch(payload) {
    return payload.tech?.cultivatingTechId === 'qingmu_sword';
}
/**
 * 判断是否已unequippatch。
 */
function hasUnequipPatch(payload) {
    return payload.eq?.slots?.some((entry) => entry.slot === 'weapon' && entry.item === null) ?? false;
}
/**
 * 判断是否已healconsumablepatch。
 */
function hasHealConsumablePatch(payload) {
    return payload.inv?.slots?.some((entry) => entry.item?.itemId === 'pill.minor_heal' && entry.item.count === 2) ?? false;
}
/**
 * 判断是否已windstrideinventorypatch。
 */
function hasWindstrideInventoryPatch(payload) {
    return payload.inv?.slots?.some((entry) => entry.item?.itemId === 'pill.windstride_elixir') ?? false;
}
/**
 * 判断是否已windstrideBuffpatch。
 */
function hasWindstrideBuffPatch(payload) {
    return payload.buff?.buffs?.some((entry) => entry.buffId === 'item_buff.windstride' && entry.remainingTicks > 0) ?? false;
}
/**
 * 判断是否已windstrideattrpatch。
 */
function hasWindstrideAttrPatch(payload) {
    return (payload.attr?.numericStats?.moveSpeed ?? 0) > 10
        || (payload.attr?.numericStats?.dodge ?? 0) > 10;
}
/**
 * 判断状态是否已出现轻身丹增益。
 */
function hasWindstrideStateBoost(state) {
    return (state.player?.attrs?.numericStats?.moveSpeed ?? 0) > 10
        || (state.player?.attrs?.numericStats?.dodge ?? 0) > 10;
}
/**
 * 判断是否已bamboo地图inventorypatch。
 */
function hasBambooMapInventoryPatch(payload) {
    return payload.inv?.slots?.some((entry) => entry.item?.itemId === 'map.bamboo_forest') ?? false;
}
/**
 * 判断是否已bamboo地图consumepatch。
 */
function hasBambooMapConsumePatch(payload) {
    return payload.inv?.slots?.some((entry) => entry.item === null || entry.item?.itemId !== 'map.bamboo_forest') ?? false;
}
/**
 * 判断是否已spiritstoneinventorypatch。
 */
function hasSpiritStoneInventoryPatch(payload) {
    return payload.inv?.slots?.some((entry) => entry.item?.itemId === 'spirit_stone') ?? false;
}
/**
 * 判断是否已spiritstoneconsumepatch。
 */
function hasSpiritStoneConsumePatch(payload) {
    return payload.inv?.slots?.some((entry) => entry.item === null || entry.item?.itemId !== 'spirit_stone') ?? false;
}
/**
 * 处理fetch状态。
 */
async function fetchState() {
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
}
/**
 * 处理delete玩家。
 */
async function deletePlayer(playerIdToDelete) {
/**
 * 记录response。
 */
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/players/${playerIdToDelete}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
}
/**
 * 处理fetchtile灵气。
 */
async function fetchTileAura(instanceId, x, y) {
/**
 * 记录response。
 */
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/instances/${instanceId}/tiles/${x}/${y}`);
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
/**
 * 记录payload。
 */
    const payload = await response.json();
    return payload.tile?.aura ?? 0;
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
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
}
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
//# sourceMappingURL=progression-smoke.js.map

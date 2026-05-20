// @ts-nocheck

/**
 * 用途：执行 progression 链路的冒烟验证。
 */

Object.defineProperty(exports, "__esModule", { value: true });
const smoke_timeout_1 = require("./smoke-timeout");
(0, smoke_timeout_1.installSmokeTimeout)(__filename);
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared");
const env_alias_1 = require("../config/env-alias");
const smoke_player_auth_1 = require("./smoke-player-auth");
/**
 * 记录 server 访问地址。
 */
const SERVER_URL = (0, env_alias_1.resolveServerUrl)() || 'http://127.0.0.1:3111';
const PROGRESSION_WAIT_MS = 60_000;
const PROGRESSION_EQUIPMENT_ITEM_ID = 'equip.orebreak_hammer';
const PROGRESSION_RESOURCE_MAP_ID = 'bamboo_forest';
const PROGRESSION_RESOURCE_TILE = Object.freeze({
    x: 12,
    y: 8,
});
const GM_PASSWORD = (0, env_alias_1.resolveServerGmPassword)('admin123');
/**
 * 记录玩家ID。
 */
let playerId = '';
let sessionId = '';
let progressionResourceInstanceId = '';
let progressionStage = 'bootstrap';
/**
 * 串联执行脚本主流程。
 */
async function main() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录认证。
 */
    const auth = await (0, smoke_player_auth_1.registerAndLoginSmokePlayer)(SERVER_URL, {
        accountPrefix: 'pg',
        rolePrefix: '进',
        seed: `progression-${Date.now().toString(36)}`,
    });
/**
 * 记录socket。
 */
    const socket = (0, socket_io_client_1.io)(SERVER_URL, {
        path: '/socket.io',
        transports: ['websocket'],
        auth: {
            token: auth.accessToken,
            protocol: 'mainline',
        },
    });
/**
 * 记录panelevents。
 */
    const panelEvents = [];
/**
 * 记录selfevents。
 */
    const selfEvents = [];
    socket.on(shared_1.S2C.Error, (payload) => {
        throw new Error(`socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.S2C.PanelDelta, (payload) => {
        panelEvents.push(payload);
    });
    socket.on(shared_1.S2C.SelfDelta, (payload) => {
        selfEvents.push(payload);
    });
    socket.on(shared_1.S2C.InitSession, (payload) => {
        playerId = String(payload?.pid ?? '');
        sessionId = String(payload?.sid ?? '');
    });
    await onceConnected(socket);
    socket.emit(shared_1.C2S.Hello, {
        mapId: 'yunlai_town',
        preferredX: 32,
        preferredY: 5,
    });
    progressionStage = 'initial-state';
    await waitFor(async () => {
        if (!playerId) {
            return false;
        }
/**
 * 记录状态。
 */
        const state = await fetchState();
        return Array.isArray(state.player?.inventory.items) && state.player.inventory.items.length >= 2 && panelEvents.length > 0;
    }, PROGRESSION_WAIT_MS);
    await postJson(`/runtime/players/${playerId}/grant-item`, {
        itemId: PROGRESSION_EQUIPMENT_ITEM_ID,
        count: 1,
    });
    progressionStage = 'grant-equipment';
    await waitFor(async () => {
        const state = await fetchState();
        return state.player?.inventory?.items?.some((entry) => entry.itemId === PROGRESSION_EQUIPMENT_ITEM_ID);
    }, PROGRESSION_WAIT_MS);
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
    socket.emit(shared_1.C2S.UseItem, { slotIndex: bookSlot });
    progressionStage = 'learn-technique';
    await waitFor(async () => {
/**
 * 记录状态。
 */
        const state = await fetchState();
        return state.player?.techniques?.techniques?.some((entry) => entry.techId === 'qingmu_sword');
    }, PROGRESSION_WAIT_MS);
    currentState = await fetchState();
/**
 * 记录equipmentslot。
 */
    const equipmentSlot = currentState.player.inventory.items.findIndex((entry) => entry.itemId === PROGRESSION_EQUIPMENT_ITEM_ID);
    if (equipmentSlot < 0) {
        throw new Error('equipment item missing after learning');
    }
    const beforeEquipStats = currentState.player?.attrs?.numericStats ?? {};
    socket.emit(shared_1.C2S.Equip, { slotIndex: equipmentSlot });
    progressionStage = 'equip-weapon';
    await waitFor(async () => {
/**
 * 记录状态。
 */
        const state = await fetchState();
        return state.player?.equipment?.slots?.some((entry) => entry.slot === 'weapon' && entry.item?.itemId === PROGRESSION_EQUIPMENT_ITEM_ID)
            && hasEquipmentStateBoost(state, beforeEquipStats);
    }, PROGRESSION_WAIT_MS);
    socket.emit(shared_1.C2S.Cultivate, { techId: 'qingmu_sword' });
    progressionStage = 'cultivate';
    await waitFor(async () => {
/**
 * 记录状态。
 */
        const state = await fetchState();
        return state.player?.techniques?.cultivatingTechId === 'qingmu_sword';
    }, PROGRESSION_WAIT_MS);
    socket.emit(shared_1.C2S.Unequip, { slot: 'weapon' });
    progressionStage = 'unequip-weapon';
    await waitFor(async () => {
/**
 * 记录状态。
 */
        const state = await fetchState();
        return state.player?.equipment?.slots?.some((entry) => entry.slot === 'weapon' && entry.item === null);
    }, PROGRESSION_WAIT_MS);
    await postJson(`/runtime/players/${playerId}/vitals`, { hp: 50, qi: 0 });
    currentState = await fetchState();
/**
 * 记录healslot。
 */
    const healSlot = currentState.player.inventory.items.findIndex((entry) => entry.itemId === 'pill.minor_heal');
    if (healSlot < 0) {
        throw new Error('starter heal consumable missing');
    }
    socket.emit(shared_1.C2S.UseItem, { slotIndex: healSlot });
    progressionStage = 'heal-consumable';
    await waitFor(async () => {
/**
 * 记录状态。
 */
        const state = await fetchState();
        return (state.player?.hp ?? 0) >= 76
            && state.player?.inventory?.items?.some((entry) => entry.itemId === 'pill.minor_heal' && entry.count === 2);
    }, PROGRESSION_WAIT_MS);
    await postJson(`/runtime/players/${playerId}/grant-item`, {
        itemId: 'pill.windstride_elixir',
        count: 1,
    });
    progressionStage = 'windstride-grant';
    await waitFor(async () => {
        const state = await fetchState();
        return state.player?.inventory?.items?.some((entry) => entry.itemId === 'pill.windstride_elixir');
    }, PROGRESSION_WAIT_MS);
    currentState = await fetchState();
/**
 * 记录Buffslot。
 */
    const buffSlot = currentState.player.inventory.items.findIndex((entry) => entry.itemId === 'pill.windstride_elixir');
    if (buffSlot < 0) {
        throw new Error('windstride consumable missing');
    }
    await sleep(1100);
    socket.emit(shared_1.C2S.UseItem, { slotIndex: buffSlot });
    progressionStage = 'windstride-use';
    await waitFor(async () => {
/**
 * 记录状态。
 */
        const state = await fetchState();
        return state.player?.buffs?.buffs?.some((entry) => entry.buffId === 'item_buff.windstride' && entry.remainingTicks > 0);
    }, PROGRESSION_WAIT_MS);
    await postJson(`/runtime/players/${playerId}/grant-item`, {
        itemId: 'map.bamboo_forest',
        count: 1,
    });
    progressionStage = 'bamboo-map-grant';
    await waitFor(async () => {
        const state = await fetchState();
        return state.player?.inventory?.items?.some((entry) => entry.itemId === 'map.bamboo_forest');
    }, PROGRESSION_WAIT_MS);
    currentState = await fetchState();
/**
 * 记录地图slot。
 */
    const mapSlot = currentState.player.inventory.items.findIndex((entry) => entry.itemId === 'map.bamboo_forest');
    if (mapSlot < 0) {
        throw new Error('bamboo map item missing');
    }
    await sleep(1100);
    socket.emit(shared_1.C2S.UseItem, { slotIndex: mapSlot });
    progressionStage = 'bamboo-map-use';
    await waitFor(async () => {
/**
 * 记录状态。
 */
        const state = await fetchState();
        return state.player?.unlockedMapIds?.includes('bamboo_forest')
            && state.player?.inventory?.items?.every((entry) => entry.itemId !== 'map.bamboo_forest');
    }, PROGRESSION_WAIT_MS);
    progressionResourceInstanceId = await ensureProgressionResourceInstance();
    await ensureProgressionResourceTile();
    await postJson(`/runtime/players/${playerId}/grant-item`, {
        itemId: 'spirit_stone',
        count: 1,
    });
    progressionStage = 'spirit-stone-grant';
    await waitFor(async () => {
        const state = await fetchState();
        return state.player?.inventory?.items?.some((entry) => entry.itemId === 'spirit_stone');
    }, PROGRESSION_WAIT_MS);
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
    await sleep(1100);
    socket.emit(shared_1.C2S.UseItem, { slotIndex: spiritStoneSlot });
    progressionStage = 'spirit-stone-use';
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
            && state.player?.inventory?.items?.every((entry) => entry.itemId !== 'spirit_stone');
    }, PROGRESSION_WAIT_MS);
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
        url: SERVER_URL,
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
    return payload.inv?.slots?.some((entry) => entry.item?.itemId === PROGRESSION_EQUIPMENT_ITEM_ID) ?? false;
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
    return payload.eq?.slots?.some((entry) => entry.slot === 'weapon' && entry.item?.itemId === PROGRESSION_EQUIPMENT_ITEM_ID) ?? false;
}
/**
 * 判断是否已equipmentattrpatch。
 */
function hasEquipmentAttrPatch(payload) {
    return (payload.attr?.numericStats?.physAtk ?? 0) >= 14;
}
function hasEquipmentStateBoost(state, beforeStats) {
    const stats = state.player?.attrs?.numericStats ?? {};
    return (stats.physAtk ?? 0) > (beforeStats.physAtk ?? 0)
        || (stats.spellAtk ?? 0) > (beforeStats.spellAtk ?? 0)
        || (stats.hit ?? 0) > (beforeStats.hit ?? 0)
        || (stats.crit ?? 0) > (beforeStats.crit ?? 0)
        || (stats.breakPower ?? 0) > (beforeStats.breakPower ?? 0);
}
function pickEquipmentProofStats(stats) {
    return {
        physAtk: stats.physAtk ?? null,
        spellAtk: stats.spellAtk ?? null,
        hit: stats.hit ?? null,
        crit: stats.crit ?? null,
        breakPower: stats.breakPower ?? null,
    };
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
 * 确保地块资源道具在非保护地块上验证。
 */
async function ensureProgressionResourceInstance() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const gmToken = await loginGm();
    const payload = await requestJson('/api/gm/world/instances', {
        method: 'POST',
        token: gmToken,
        body: {
            templateId: PROGRESSION_RESOURCE_MAP_ID,
            linePreset: 'real',
            persistentPolicy: 'ephemeral',
            displayName: `进阶资源_${Date.now().toString(36)}`,
        },
    });
    const instanceId = String(payload?.instance?.instanceId ?? '').trim();
    if (!instanceId) {
        throw new Error(`unexpected progression resource instance payload: ${JSON.stringify(payload)}`);
    }
    return instanceId;
}
async function ensureProgressionResourceTile() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    await postJson('/runtime/players/connect', {
        playerId,
        sessionId: sessionId || undefined,
        instanceId: progressionResourceInstanceId || undefined,
        mapId: PROGRESSION_RESOURCE_MAP_ID,
        preferredX: PROGRESSION_RESOURCE_TILE.x,
        preferredY: PROGRESSION_RESOURCE_TILE.y,
    });
    progressionStage = 'resource-tile';
    await waitFor(async () => {
/**
 * 记录状态。
 */
        const state = await fetchState();
        const instanceId = String(state.player?.instanceId ?? '');
        return (instanceId === progressionResourceInstanceId || instanceId.endsWith(`:${PROGRESSION_RESOURCE_MAP_ID}`))
            && state.player?.x === PROGRESSION_RESOURCE_TILE.x
            && state.player?.y === PROGRESSION_RESOURCE_TILE.y;
    }, PROGRESSION_WAIT_MS);
}
/**
 * 处理fetch状态。
 */
async function fetchState() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录response。
 */
    const response = await fetch(`${SERVER_URL}/runtime/players/${playerId}/state`);
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
}
/**
 * 处理postjson。
 */
async function postJson(path, body) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录response。
 */
    const response = await fetch(`${SERVER_URL}${path}`, {
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
async function loginGm() {
    const payload = await requestJson('/api/auth/gm/login', {
        method: 'POST',
        body: {
            password: GM_PASSWORD,
        },
    });
    const token = typeof payload?.accessToken === 'string' ? payload.accessToken.trim() : '';
    if (!token) {
        throw new Error(`gm login did not return accessToken: ${JSON.stringify(payload)}`);
    }
    return token;
}
async function requestJson(path, options = {}) {
    const response = await fetch(`${SERVER_URL}${path}`, {
        method: options.method ?? 'GET',
        headers: {
            'content-type': 'application/json',
            ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${text}`);
    }
    return text ? JSON.parse(text) : null;
}
/**
 * 处理delete玩家。
 */
async function deletePlayer(playerIdToDelete) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录response。
 */
    const response = await fetch(`${SERVER_URL}/runtime/players/${playerIdToDelete}`, {
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录response。
 */
    const response = await fetch(`${SERVER_URL}/runtime/instances/${instanceId}/tiles/${x}/${y}`);
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录startedat。
 */
    const startedAt = Date.now();
    while (!(await predicate())) {
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error(`waitFor timeout: ${progressionStage}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    await (0, smoke_player_auth_1.flushRegisteredSmokePlayers)();
});

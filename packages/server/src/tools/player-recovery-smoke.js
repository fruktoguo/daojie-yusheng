"use strict";
/**
 * 用途：执行 player-recovery 链路的冒烟验证。
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
 * 记录地图enterevents。
 */
    const mapEnterEvents = [];
/**
 * 记录selfevents。
 */
    const selfEvents = [];
    socket.on(shared_1.NEXT_S2C.Error, (payload) => {
        throw new Error(`socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.NEXT_S2C.MapEnter, (payload) => {
        mapEnterEvents.push(payload);
    });
    socket.on(shared_1.NEXT_S2C.SelfDelta, (payload) => {
        selfEvents.push(payload);
    });
    socket.on(shared_1.NEXT_S2C.InitSession, (payload) => {
        playerId = String(payload?.pid ?? '');
    });
    await onceConnected(socket);
    socket.emit('n:c:hello', {
        mapId: 'yunlai_town',
        preferredX: 31,
        preferredY: 5,
    });
    await waitFor(() => playerId.length > 0 && mapEnterEvents.length > 0 && selfEvents.length > 0, 4000);
/**
 * 记录initial状态。
 */
    const initialState = await fetchJson(`${SERVER_NEXT_URL}/runtime/players/${playerId}/state`);
    if (!initialState.player) {
        throw new Error('player state missing');
    }
/**
 * 记录injuredhp。
 */
    const injuredHp = Math.max(1, initialState.player.maxHp - 17);
/**
 * 记录injuredqi。
 */
    const injuredQi = Math.max(0, initialState.player.maxQi - 23);
    await postJson(`/runtime/players/${playerId}/vitals`, {
        hp: injuredHp,
        qi: injuredQi,
    });
/**
 * 记录recovered状态。
 */
    let recoveredState = null;
    await waitForCondition(async () => {
/**
 * 记录状态。
 */
        const state = await fetchJson(`${SERVER_NEXT_URL}/runtime/players/${playerId}/state`);
        if (!state.player) {
            return false;
        }
/**
 * 记录hprecovered。
 */
        const hpRecovered = state.player.hp > injuredHp;
/**
 * 记录qirecovered。
 */
        const qiRecovered = state.player.qi > injuredQi;
        if (!hpRecovered || !qiRecovered) {
            return false;
        }
        recoveredState = state.player;
        return true;
    }, 6000);
    await waitFor(() => selfEvents.some((entry) => (entry.hp ?? 0) > injuredHp && (entry.qi ?? 0) > injuredQi), 4000);
    socket.close();
    if (playerId) {
        await deletePlayer(playerId);
    }
    console.log(JSON.stringify({
        ok: true,
        playerId,
        mapId: mapEnterEvents[0]?.mid ?? null,
        injured: {
            hp: injuredHp,
            qi: injuredQi,
        },
        recovered: recoveredState,
        regenRates: initialState.player.attrs.numericStats,
    }, null, 2));
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
 * 处理fetchjson。
 */
async function fetchJson(url) {
/**
 * 记录response。
 */
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
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
 * 等待for。
 */
async function waitFor(predicate, timeoutMs) {
/**
 * 记录startedat。
 */
    const startedAt = Date.now();
    while (!predicate()) {
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error('waitFor timeout');
        }
        await delay(100);
    }
}
/**
 * 等待forcondition。
 */
async function waitForCondition(predicate, timeoutMs) {
/**
 * 记录startedat。
 */
    const startedAt = Date.now();
    while (!(await predicate())) {
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error('waitForCondition timeout');
        }
        await delay(150);
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
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
//# sourceMappingURL=player-recovery-smoke.js.map

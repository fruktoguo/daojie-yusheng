// @ts-nocheck

/**
 * 用途：执行 runtime 链路的冒烟验证。
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
/**
 * 串联执行脚本主流程。
 */
async function main() {
/**
 * 记录认证。
 */
    const auth = await (0, smoke_player_auth_1.registerAndLoginSmokePlayer)(SERVER_URL, {
        accountPrefix: 'rt',
        rolePrefix: '运',
        seed: 'runtime',
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
 * 记录eventlog。
 */
    const eventLog = [];
/**
 * 记录玩家ID。
 */
    let playerId = '';
/**
 * 记录initialpanel。
 */
    let initialPanel = null;
/**
 * 记录vitalsdelta。
 */
    let vitalsDelta = null;
/**
 * 记录inventorydelta。
 */
    let inventoryDelta = null;
    socket.on(shared_1.S2C.Error, (payload) => {
        throw new Error(`socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.S2C.InitSession, (payload) => {
        playerId = String(payload?.pid ?? '');
        eventLog.push('initSession');
    });
    socket.on(shared_1.S2C.MapEnter, () => {
        eventLog.push('mapEnter');
    });
    socket.on(shared_1.S2C.WorldDelta, () => {
        eventLog.push('worldDelta');
    });
    socket.on(shared_1.S2C.SelfDelta, (payload) => {
        eventLog.push('selfDelta');
        if ((payload.hp ?? 0) >= 72 && (payload.qi ?? 0) >= 18) {
            vitalsDelta = payload;
        }
    });
    socket.on(shared_1.S2C.PanelDelta, (payload) => {
        eventLog.push('panelDelta');
        if (!initialPanel) {
            initialPanel = payload;
            return;
        }
        if (payload.inv?.slots?.some((entry) => entry.item?.itemId === 'rat_tail' && entry.item.count >= 2)) {
            inventoryDelta = payload;
        }
    });
    await onceConnected(socket);
    socket.emit('n:c:hello', {
        mapId: 'yunlai_town',
        preferredX: 32,
        preferredY: 5,
    });
    await waitFor(() => playerId.length > 0 && initialPanel !== null && eventLog.includes('initSession') && eventLog.includes('mapEnter'), 4000);
    socket.emit('n:c:move', { d: shared_1.Direction.North });
    await delay(1200);
    await postJson(`/runtime/players/${playerId}/vitals`, {
        hp: 72,
        qi: 18,
    });
    await postJson(`/runtime/players/${playerId}/grant-item`, {
        itemId: 'rat_tail',
        count: 2,
    });
    await waitFor(() => vitalsDelta !== null && inventoryDelta !== null, 4000);
    socket.close();
    await deletePlayer(playerId);
    console.log(JSON.stringify({
        ok: true,
        url: SERVER_URL,
        playerId,
        events: eventLog,
        vitalsDelta,
        inventoryDelta,
    }, null, 2));
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
 * 等待for。
 */
async function waitFor(predicate, timeoutMs) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
}).finally(async () => {
    await (0, smoke_player_auth_1.flushRegisteredSmokePlayers)();
});

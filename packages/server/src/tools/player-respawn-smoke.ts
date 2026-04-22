// @ts-nocheck

/**
 * 用途：执行 player-respawn 链路的冒烟验证。
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
 * 记录玩家ID。
 */
let playerId = '';
/**
 * 记录会话ID。
 */
let sessionId = '';
/**
 * 串联执行脚本主流程。
 */
async function main() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录认证。
 */
    const auth = await (0, smoke_player_auth_1.registerAndLoginSmokePlayer)(SERVER_URL, {
        accountPrefix: 'prs',
        rolePrefix: '返',
        seed: 'player-respawn',
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
 * 记录地图enterevents。
 */
    const mapEnterEvents = [];
/**
 * 记录selfevents。
 */
    const selfEvents = [];
    socket.on(shared_1.S2C.Error, (payload) => {
        throw new Error(`socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.S2C.MapEnter, (payload) => {
        mapEnterEvents.push(payload);
    });
    socket.on(shared_1.S2C.SelfDelta, (payload) => {
        selfEvents.push(payload);
    });
    socket.on(shared_1.S2C.InitSession, (payload) => {
        playerId = String(payload?.pid ?? '');
        sessionId = String(payload?.sid ?? '');
    });
    await onceConnected(socket);
    await waitFor(() => playerId.length > 0 && sessionId.length > 0, 5000);
    await postJson('/runtime/players/connect', {
        playerId,
        sessionId,
        mapId: 'wildlands',
        preferredX: 6,
        preferredY: 6,
    });
    await waitForCondition(async () => {
/**
 * 记录状态。
 */
        const state = await fetchJson(`${SERVER_URL}/runtime/players/${playerId}/state`);
        return state.player?.templateId === 'wildlands';
    }, 6000);
    await postJson(`/runtime/players/${playerId}/damage`, {
        amount: 999999,
    });
/**
 * 记录respawned状态。
 */
    let respawnedState = null;
    await waitForCondition(async () => {
/**
 * 记录状态。
 */
        const state = await fetchJson(`${SERVER_URL}/runtime/players/${playerId}/state`);
        if (!state.player) {
            return false;
        }
        if (state.player.templateId !== 'yunlai_town') {
            return false;
        }
        if (state.player.hp !== state.player.maxHp || state.player.qi !== state.player.maxQi) {
            return false;
        }
        respawnedState = state.player;
        return true;
    }, 6000);
    await waitFor(() => mapEnterEvents.some((entry) => entry.mid === 'yunlai_town'), 4000);
    await waitFor(() => selfEvents.some((entry) => entry.mid === 'yunlai_town' && entry.hp === entry.maxHp && entry.qi === entry.maxQi), 4000);
    socket.close();
    if (playerId) {
        await deletePlayer(playerId);
    }
    console.log(JSON.stringify({
        ok: true,
        playerId,
        maps: mapEnterEvents.map((entry) => entry.mid),
        respawned: respawnedState,
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
 * 处理fetchjson。
 */
async function fetchJson(url) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
 * 等待forcondition。
 */
async function waitForCondition(predicate, timeoutMs) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
}).finally(async () => {
    await (0, smoke_player_auth_1.flushRegisteredSmokePlayers)();
});

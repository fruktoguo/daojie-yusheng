// @ts-nocheck

/**
 * 用途：执行 monster-runtime 链路的冒烟验证。
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
 * 记录instanceID。
 */
const instanceId = process.env.SERVER_NEXT_SMOKE_INSTANCE_ID ?? 'public:wildlands';
/**
 * 串联执行脚本主流程。
 */
async function main() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录initialmonsters。
 */
    const initialMonsters = await fetchJson(`${SERVER_NEXT_URL}/runtime/instances/${instanceId}/monsters`);
/**
 * 记录seed目标。
 */
    const seedTarget = initialMonsters.monsters.find((entry) => entry.alive);
    if (!seedTarget) {
        throw new Error(`no alive monster found in ${instanceId}`);
    }
/**
 * 记录socket。
 */
    const socket = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
    });
/**
 * 记录worldevents。
 */
    const worldEvents = [];
    socket.on(shared_1.NEXT_S2C.Error, (payload) => {
        throw new Error(`socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.NEXT_S2C.WorldDelta, (payload) => {
        worldEvents.push(payload);
    });
    socket.on(shared_1.NEXT_S2C.InitSession, (payload) => {
        playerId = String(payload?.pid ?? '');
    });
    await onceConnected(socket);
    socket.emit(shared_1.NEXT_C2S.Hello, {
        mapId: instanceId.replace('public:', ''),
        preferredX: seedTarget.x,
        preferredY: seedTarget.y,
    });
/**
 * 记录目标。
 */
    const target = await waitForState(async () => {
        if (!playerId) {
            return null;
        }
/**
 * 记录view。
 */
        const view = await fetchJson(`${SERVER_NEXT_URL}/runtime/players/${playerId}/view`);
        if (!view.view?.localMonsters?.some((entry) => entry.runtimeId === seedTarget.runtimeId)) {
            return null;
        }
/**
 * 记录怪物。
 */
        const monster = await fetchJson(`${SERVER_NEXT_URL}/runtime/instances/${instanceId}/monsters/${seedTarget.runtimeId}`);
        return monster.monster;
    }, 5000);
    if (!target || !target.alive) {
        throw new Error(`no visible alive monster found in ${instanceId}`);
    }
    await waitFor(() => hasMonsterSnapshot(worldEvents, target.runtimeId), 5000);
    await postJson(`/runtime/instances/${instanceId}/monsters/${target.runtimeId}/defeat`, {});
    await waitFor(async () => {
/**
 * 记录怪物。
 */
        const monster = await fetchJson(`${SERVER_NEXT_URL}/runtime/instances/${instanceId}/monsters/${target.runtimeId}`);
        return monster.monster?.alive === false
            && (monster.monster?.respawnLeft ?? 0) > 0;
    }, 5000);
    await waitFor(async () => {
/**
 * 记录怪物。
 */
        const monster = await fetchJson(`${SERVER_NEXT_URL}/runtime/instances/${instanceId}/monsters/${target.runtimeId}`);
        return monster.monster?.alive === true
            && monster.monster.hp === monster.monster.maxHp;
    }, (target.respawnTicks + 3) * 1000);
/**
 * 记录final怪物。
 */
    const finalMonster = await fetchJson(`${SERVER_NEXT_URL}/runtime/instances/${instanceId}/monsters/${target.runtimeId}`);
    socket.close();
    if (playerId) {
        await deletePlayer(playerId);
    }
    console.log(JSON.stringify({
        ok: true,
        url: SERVER_NEXT_URL,
        playerId,
        instanceId,
        runtimeId: target.runtimeId,
        monsterId: target.monsterId,
        respawnTicks: target.respawnTicks,
        worldEventCount: worldEvents.length,
        finalMonster,
    }, null, 2));
}
/**
 * 判断是否已怪物snapshot。
 */
function hasMonsterSnapshot(events, runtimeId) {
    return events.some((payload) => payload.m?.some((entry) => entry.id === runtimeId && entry.mid && typeof entry.hp === 'number'));
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
 * 处理postjson。
 */
async function postJson(path, body) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
            throw new Error('waitFor timeout');
        }
        await delay(100);
    }
}
/**
 * 等待for状态。
 */
async function waitForState(loader, timeoutMs) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
            throw new Error('waitForState timeout');
        }
        await delay(100);
    }
}
/**
 * 处理delete玩家。
 */
async function deletePlayer(playerIdValue) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录response。
 */
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/players/${playerIdValue}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
}
/**
 * 处理delay。
 */
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
main();

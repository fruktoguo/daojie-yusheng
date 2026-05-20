// @ts-nocheck

/**
 * 用途：执行 monster-runtime 链路的冒烟验证。
 */

Object.defineProperty(exports, "__esModule", { value: true });
const smoke_timeout_1 = require("./smoke-timeout");
(0, smoke_timeout_1.installSmokeTimeout)(__filename);
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared");
const env_alias_1 = require("../config/env-alias");
const smoke_payload_1 = require("./smoke-payload");
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
 * 记录instanceID。
 */
let instanceId = process.env.SERVER_SMOKE_INSTANCE_ID ?? 'public:wildlands';
/**
 * 串联执行脚本主流程。
 */
async function main() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录initialmonsters。
 */
    const resolvedInitial = await resolveInitialMonsterContext(instanceId);
    instanceId = resolvedInitial.instanceId;
    const initialMonsters = resolvedInitial.monsters;
/**
 * 记录seed目标。
 */
    const seedTarget = initialMonsters.monsters.find((entry) => entry.alive);
    if (!seedTarget) {
        throw new Error(`no alive monster found in ${instanceId}`);
    }
/**
 * 记录认证。
 */
    const auth = await (0, smoke_player_auth_1.registerAndLoginSmokePlayer)(SERVER_URL, {
        accountPrefix: 'mrt',
        rolePrefix: '妖',
        seed: 'monster-runtime',
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
 * 记录worldevents。
 */
    const worldEvents = [];
    socket.on(shared_1.S2C.Error, (payload) => {
        throw new Error(`socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.S2C.WorldDelta, (payload) => {
        worldEvents.push(smoke_payload_1.decodeSmokePayload(payload));
    });
    socket.on(shared_1.S2C.InitSession, (payload) => {
        const decodedPayload = smoke_payload_1.decodeSmokePayload(payload);
        playerId = String(decodedPayload?.pid ?? '');
        sessionId = String(decodedPayload?.sid ?? '');
    });
    await onceConnected(socket);
    await waitFor(() => playerId.length > 0 && sessionId.length > 0, 15000);
    await postJson('/runtime/players/connect', {
        playerId,
        sessionId,
        instanceId,
            mapId: resolveMonsterMapId(instanceId),
        preferredX: seedTarget.x,
        preferredY: seedTarget.y,
    });
    await waitFor(async () => {
        try {
            return sameSmokeInstanceId((await fetchJson(`${SERVER_URL}/runtime/players/${playerId}/state`))?.player?.instanceId, instanceId);
        }
        catch (error) {
            if (isRecoverableMonsterLookupError(error)) {
                return false;
            }
            throw error;
        }
    }, 15000);
/**
 * 记录目标。
 */
    const target = await waitForState(async () => {
        try {
            if (!playerId) {
                return null;
            }
/**
 * 记录view。
 */
            const view = await fetchJson(`${SERVER_URL}/runtime/players/${playerId}/view`);
            if (!view.view?.localMonsters?.some((entry) => entry.runtimeId === seedTarget.runtimeId)) {
                return null;
            }
/**
 * 记录怪物。
 */
            const monster = await fetchJson(`${SERVER_URL}/runtime/instances/${instanceId}/monsters/${seedTarget.runtimeId}`);
            return monster.monster;
        }
        catch (error) {
            if (isRecoverableMonsterLookupError(error)) {
                return null;
            }
            throw error;
        }
    }, 15000);
    if (!target || !target.alive) {
        throw new Error(`no visible alive monster found in ${instanceId}`);
    }
    await waitFor(() => hasMonsterSnapshot(worldEvents, target.runtimeId), 15000);
    await postJson(`/runtime/instances/${instanceId}/monsters/${target.runtimeId}/defeat`, {});
    await waitFor(async () => {
        try {
/**
 * 记录怪物。
 */
            const monster = await fetchJson(`${SERVER_URL}/runtime/instances/${instanceId}/monsters/${target.runtimeId}`);
            return monster.monster?.alive === false
                && (monster.monster?.respawnLeft ?? 0) > 0;
        }
        catch (error) {
            if (isRecoverableMonsterLookupError(error)) {
                return false;
            }
            throw error;
        }
    }, 10000);
    await waitFor(async () => {
        try {
/**
 * 记录怪物。
 */
            const monster = await fetchJson(`${SERVER_URL}/runtime/instances/${instanceId}/monsters/${target.runtimeId}`);
            return monster.monster?.alive === true
                && monster.monster.hp === monster.monster.maxHp;
        }
        catch (error) {
            if (isRecoverableMonsterLookupError(error)) {
                return false;
            }
            throw error;
        }
    }, Math.max((target.respawnTicks + 10) * 1000, 20000));
/**
 * 记录final怪物。
 */
    const finalMonster = await fetchJson(`${SERVER_URL}/runtime/instances/${instanceId}/monsters/${target.runtimeId}`);
    socket.close();
    if (playerId) {
        await deletePlayer(playerId);
    }
    console.log(JSON.stringify({
        ok: true,
        url: SERVER_URL,
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
 * 解析可用的妖兽实例，兼容 public 实例被旧 lease fencing 短暂卸载。
 */
async function resolveInitialMonsterContext(preferredInstanceId) {
    return waitForState(async () => {
        for (const candidate of buildMonsterInstanceCandidates(preferredInstanceId)) {
            try {
                const monsters = await fetchJson(`${SERVER_URL}/runtime/instances/${candidate}/monsters`);
                if (Array.isArray(monsters?.monsters)) {
                    return { instanceId: candidate, monsters };
                }
            }
            catch (error) {
                if (!isRecoverableMonsterLookupError(error)) {
                    throw error;
                }
            }
        }
        return null;
    }, 15000);
}
function buildMonsterInstanceCandidates(preferredInstanceId) {
    const raw = typeof preferredInstanceId === 'string' && preferredInstanceId.trim()
        ? preferredInstanceId.trim()
        : 'public:wildlands';
    const candidates = [raw];
    const match = raw.match(/^(public|real):(.+)$/);
    if (match) {
        const [, scope, templateId] = match;
        candidates.push(`${scope === 'public' ? 'real' : 'public'}:${templateId}`);
    }
    else {
        candidates.push(`public:${raw}`, `real:${raw}`);
    }
    return [...new Set(candidates)];
}
function resolveMonsterMapId(instanceIdValue) {
    const value = typeof instanceIdValue === 'string' ? instanceIdValue.trim() : '';
    if (!value) {
        return '';
    }
    return value.replace(/^(public|real):/, '');
}
function sameSmokeInstanceId(left, right) {
    return resolveMonsterMapId(left) === resolveMonsterMapId(right);
}
function isRecoverableMonsterLookupError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('request failed: 404')
        && message.includes('地图实例不存在');
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
    const response = await fetch(`${SERVER_URL}/runtime/players/${playerIdValue}`, {
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
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    await (0, smoke_player_auth_1.flushRegisteredSmokePlayers)();
});

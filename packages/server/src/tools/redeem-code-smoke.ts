// @ts-nocheck

/**
 * 用途：执行 redeem-code 链路的冒烟验证。
 */

Object.defineProperty(exports, "__esModule", { value: true });
const smoke_timeout_1 = require("./smoke-timeout");
(0, smoke_timeout_1.installSmokeTimeout)(__filename);
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared");
const env_alias_1 = require("../config/env-alias");
/**
 * 记录 server 访问地址。
 */
const SERVER_URL = (0, env_alias_1.resolveServerUrl)() || 'http://127.0.0.1:3111';
/**
 * 记录GMpassword。
 */
const GM_PASSWORD = (0, env_alias_1.resolveServerGmPassword)('admin123');
/**
 * 记录数据库地址。
 */
const databaseUrl = (0, env_alias_1.resolveServerDatabaseUrl)();
/**
 * 记录玩家ID。
 */
let playerId = '';
/**
 * 记录奖励物品ID。
 */
const REWARD_ITEM_ID = 'spirit_stone';
/**
 * 记录奖励数量。
 */
const REWARD_COUNT = 4;
/**
 * 串联执行脚本主流程。
 */
async function main() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!databaseUrl.trim()) {
        console.log(JSON.stringify({ ok: true, skipped: true, reason: 'database persistence disabled' }, null, 2));
        return;
    }
/**
 * 记录GM令牌。
 */
    const gmToken = await loginGm();
/**
 * 记录created。
 */
    const created = await requestJson('/api/gm/redeem-code-groups', {
        method: 'POST',
        token: gmToken,
        body: {
            name: `烟测兑换码_${Date.now().toString(36)}`,
            rewards: [{ itemId: REWARD_ITEM_ID, count: REWARD_COUNT }],
            count: 1,
        },
    });
/**
 * 记录groupID。
 */
    const groupId = created?.group?.id;
/**
 * 记录code。
 */
    const code = Array.isArray(created?.codes) ? created.codes[0] : '';
    if (!groupId || !code) {
        throw new Error(`unexpected create group payload: ${JSON.stringify(created)}`);
    }
/**
 * 记录socket。
 */
    const socket = (0, socket_io_client_1.io)(SERVER_URL, {
        path: '/socket.io',
        transports: ['websocket'],
        auth: {
            protocol: 'mainline',
        },
    });
/**
 * 记录panelevents。
 */
    const panelEvents = [];
/**
 * 汇总redeemresults。
 */
    const redeemResults = [];
    socket.on(shared_1.S2C.Error, (payload) => {
        throw new Error(`socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.S2C.PanelDelta, (payload) => {
        panelEvents.push(payload);
    });
    socket.on(shared_1.S2C.RedeemCodesResult, (payload) => {
        redeemResults.push(payload);
    });
    socket.on(shared_1.S2C.InitSession, (payload) => {
        playerId = String(payload?.pid ?? '');
    });
    try {
        await onceConnected(socket);
        socket.emit(shared_1.C2S.Hello, {
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
            return Boolean(state.player?.playerId) && panelEvents.length > 0;
        }, 5000);
/**
 * 记录before。
 */
        const before = await fetchState();
/**
 * 记录before数量。
 */
        const beforeCount = inventoryCount(before, REWARD_ITEM_ID);
        socket.emit(shared_1.C2S.RedeemCodes, { codes: [code] });
        await waitFor(async () => {
/**
 * 记录latest。
 */
            const latest = redeemResults[redeemResults.length - 1];
/**
 * 记录状态。
 */
            const state = await fetchState();
            return latest?.result?.results?.some((entry) => entry.code === code && entry.ok === true)
                && inventoryCount(state, REWARD_ITEM_ID) === beforeCount + REWARD_COUNT
                && panelEvents.some((payload) => inventoryCountFromPanel(payload, REWARD_ITEM_ID) >= beforeCount + REWARD_COUNT);
        }, 5000);
/**
 * 记录afterfirst状态。
 */
        const afterFirstState = await fetchState();
/**
 * 记录afterfirst数量。
 */
        const afterFirstCount = inventoryCount(afterFirstState, REWARD_ITEM_ID);
/**
 * 记录detail。
 */
        const detail = await requestJson(`/api/gm/redeem-code-groups/${groupId}`, {
            method: 'GET',
            token: gmToken,
        });
/**
 * 记录redeemed。
 */
        const redeemed = detail?.codes?.find((entry) => entry.code === code) ?? null;
        if (!redeemed || redeemed.status !== 'used' || redeemed.usedByPlayerId !== playerId) {
            throw new Error(`redeemed code state mismatch: ${JSON.stringify(redeemed)}`);
        }
/**
 * 记录appended。
 */
        const appended = await requestJson(`/api/gm/redeem-code-groups/${groupId}/codes`, {
            method: 'POST',
            token: gmToken,
            body: { count: 1 },
        });
/**
 * 记录appendedcode。
 */
        const appendedCode = Array.isArray(appended?.codes) ? appended.codes[0] : '';
        if (!appendedCode) {
            throw new Error(`unexpected append codes payload: ${JSON.stringify(appended)}`);
        }
/**
 * 记录appendeddetail。
 */
        const appendedDetail = await requestJson(`/api/gm/redeem-code-groups/${groupId}`, {
            method: 'GET',
            token: gmToken,
        });
/**
 * 记录appendedentry。
 */
        const appendedEntry = appendedDetail?.codes?.find((entry) => entry.code === appendedCode) ?? null;
        if (!appendedEntry?.id) {
            throw new Error(`appended code not found in detail: ${JSON.stringify(appendedDetail)}`);
        }
        await requestJson(`/api/gm/redeem-codes/${appendedEntry.id}`, {
            method: 'DELETE',
            token: gmToken,
        });
/**
 * 记录afterdestroy。
 */
        const afterDestroy = await requestJson(`/api/gm/redeem-code-groups/${groupId}`, {
            method: 'GET',
            token: gmToken,
        });
/**
 * 记录destroyedentry。
 */
        const destroyedEntry = afterDestroy?.codes?.find((entry) => entry.id === appendedEntry.id) ?? null;
        if (destroyedEntry?.status !== 'destroyed') {
            throw new Error(`destroyed code state mismatch: ${JSON.stringify(destroyedEntry)}`);
        }
        socket.emit(shared_1.C2S.RedeemCodes, { codes: [code] });
        await waitFor(async () => {
/**
 * 记录latest。
 */
            const latest = redeemResults[redeemResults.length - 1];
/**
 * 记录状态。
 */
            const state = await fetchState();
            return latest?.result?.results?.some((entry) => entry.code === code && entry.ok === false && entry.message === '兑换码已被使用')
                && inventoryCount(state, REWARD_ITEM_ID) === afterFirstCount;
        }, 5000);
        console.log(JSON.stringify({
            ok: true,
            url: SERVER_URL,
            playerId,
            groupId,
            redeemedCode: code,
            appendedCode,
            rewardItemId: REWARD_ITEM_ID,
            rewardCount: REWARD_COUNT,
            redeemResultCount: redeemResults.length,
        }, null, 2));
    }
    finally {
        socket.close();
        if (playerId) {
            await deletePlayer(playerId).catch(() => undefined);
        }
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
    for (;;) {
        if (await predicate()) {
            return;
        }
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error('waitFor timeout');
        }
        await delay(100);
    }
}
/**
 * 处理loginGM。
 */
async function loginGm() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录payload。
 */
    const payload = await requestJson('/api/auth/gm/login', {
        method: 'POST',
        body: { password: GM_PASSWORD },
    });
    if (!payload?.accessToken) {
        throw new Error(`unexpected GM login payload: ${JSON.stringify(payload)}`);
    }
    return payload.accessToken;
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
 * 处理inventory数量。
 */
function inventoryCount(state, itemId) {
    return Array.isArray(state?.player?.inventory?.items)
        ? state.player.inventory.items.reduce((total, entry) => entry.itemId === itemId ? total + Number(entry.count ?? 0) : total, 0)
        : 0;
}
/**
 * 处理inventory数量frompanel。
 */
function inventoryCountFromPanel(payload, itemId) {
    return Array.isArray(payload?.inv?.slots)
        ? payload.inv.slots.reduce((total, entry) => entry?.item?.itemId === itemId ? total + Number(entry.item.count ?? 0) : total, 0)
        : 0;
}
/**
 * 处理requestjson。
 */
async function requestJson(path, init = {}) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录请求体。
 */
    const body = init.body && typeof init.body !== 'string'
        ? JSON.stringify(init.body)
        : init.body;
/**
 * 记录response。
 */
    const response = await fetch(`${SERVER_URL}${path}`, {
        method: init.method ?? 'GET',
        headers: {
            'content-type': 'application/json',
            ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
        },
        body,
    });
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
    if (!response.ok && response.status !== 404) {
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
});

// @ts-nocheck

/**
 * 用途：执行 combat 链路的冒烟验证。
 */

Object.defineProperty(exports, "__esModule", { value: true });
const smoke_timeout_1 = require("./smoke-timeout");
(0, smoke_timeout_1.installSmokeTimeout)(__filename);
const pg_1 = require("pg");
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared");
const env_alias_1 = require("../config/env-alias");
const next_gm_contract_1 = require("../http/native/native-gm-contract");
const smoke_player_auth_1 = require("./smoke-player-auth");
/**
 * 记录 server 访问地址。
 */
const SERVER_URL = (0, env_alias_1.resolveServerUrl)() || 'http://127.0.0.1:3111';
/**
 * 记录数据库连接串。
 */
const SERVER_DATABASE_URL = (0, env_alias_1.resolveServerDatabaseUrl)();
/**
 * 标记当前是否具备数据库环境。
 */
const hasDatabaseUrl = Boolean(SERVER_DATABASE_URL);
/**
 * 记录GMpassword。
 */
const GM_PASSWORD = (0, env_alias_1.resolveServerGmPassword)('admin123');
/**
 * 记录attackerID。
 */
let attackerId = '';
/**
 * 记录defenderID。
 */
let defenderId = '';
/**
 * 记录attacker会话ID。
 */
let attackerSessionId = '';
/**
 * 记录defender会话ID。
 */
let defenderSessionId = '';
/**
 * 从当前玩家状态里解析指定功法已解锁的真实技能 ID。
 */
function resolveTechniqueSkillId(player, techId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录technique。
 */
    const technique = player?.techniques?.techniques?.find((entry) => entry.techId === techId) ?? null;
    if (!technique || !Array.isArray(technique.skills)) {
        throw new Error(`missing technique skills for tech: ${techId}`);
    }
/**
 * 记录level。
 */
    const level = Number.isFinite(technique.level) ? technique.level : 1;
/**
 * 记录skill。
 */
    const skill = technique.skills.find((entry) => {
        if (!entry || typeof entry.id !== 'string' || !entry.id.trim()) {
            return false;
        }
        const unlockLevel = Number.isFinite(entry.unlockLevel) ? entry.unlockLevel : 1;
        return level >= unlockLevel;
    }) ?? null;
    if (!skill) {
        throw new Error(`missing unlocked technique skill for tech: ${techId}`);
    }
    return skill.id;
}
/**
 * 串联执行脚本主流程。
 */
async function main() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录攻击者认证。
 */
    const attackerAuth = await (0, smoke_player_auth_1.registerAndLoginSmokePlayer)(SERVER_URL, {
        accountPrefix: 'atk',
        rolePrefix: '攻',
        seed: 'combat-attacker',
    });
/**
 * 记录防守者认证。
 */
    const defenderAuth = await (0, smoke_player_auth_1.registerAndLoginSmokePlayer)(SERVER_URL, {
        accountPrefix: 'def',
        rolePrefix: '守',
        seed: 'combat-defender',
    });
/**
 * 记录战斗实例ID。
 */
    const combatSetup = await ensureCombatInstance();
    const combatInstanceId = combatSetup.instanceId;
/**
 * 记录attacker。
 */
    const attacker = (0, socket_io_client_1.io)(SERVER_URL, {
        path: '/socket.io',
        transports: ['websocket'],
        auth: {
            token: attackerAuth.accessToken,
            protocol: 'mainline',
        },
    });
/**
 * 记录defender。
 */
    const defender = (0, socket_io_client_1.io)(SERVER_URL, {
        path: '/socket.io',
        transports: ['websocket'],
        auth: {
            token: defenderAuth.accessToken,
            protocol: 'mainline',
        },
    });
/**
 * 记录attackerpanels。
 */
    const attackerPanels = [];
/**
 * 记录defenderpanels。
 */
    const defenderPanels = [];
/**
 * 记录attackerself。
 */
    const attackerSelf = [];
/**
 * 记录defenderself。
 */
    const defenderSelf = [];
    const attackerWorld = [];
    attacker.on(shared_1.S2C.Error, (payload) => {
        throw new Error(`attacker socket error: ${JSON.stringify(payload)}`);
    });
    defender.on(shared_1.S2C.Error, (payload) => {
        throw new Error(`defender socket error: ${JSON.stringify(payload)}`);
    });
    attacker.on(shared_1.S2C.PanelDelta, (payload) => {
        attackerPanels.push(payload);
    });
    defender.on(shared_1.S2C.PanelDelta, (payload) => {
        defenderPanels.push(payload);
    });
    attacker.on(shared_1.S2C.SelfDelta, (payload) => {
        attackerSelf.push(payload);
    });
    defender.on(shared_1.S2C.SelfDelta, (payload) => {
        defenderSelf.push(payload);
    });
    attacker.on(shared_1.S2C.WorldDelta, (payload) => {
        attackerWorld.push(payload);
    });
    attacker.on(shared_1.S2C.InitSession, (payload) => {
        attackerId = String(payload?.pid ?? '');
        attackerSessionId = String(payload?.sid ?? '');
    });
    defender.on(shared_1.S2C.InitSession, (payload) => {
        defenderId = String(payload?.pid ?? '');
        defenderSessionId = String(payload?.sid ?? '');
    });
    await Promise.all([onceConnected(attacker), onceConnected(defender)]);
    await waitFor(() => attackerId.length > 0 && defenderId.length > 0 && attackerSessionId.length > 0 && defenderSessionId.length > 0, 5000);
    await requestJson('/api/gm/world/instances/transfer-player', {
        method: 'POST',
        token: combatSetup.gmToken,
        body: {
            playerId: attackerId,
            instanceId: combatInstanceId,
            x: 18,
            y: 18,
        },
    });
    await requestJson('/api/gm/world/instances/transfer-player', {
        method: 'POST',
        token: combatSetup.gmToken,
        body: {
            playerId: defenderId,
            instanceId: combatInstanceId,
            x: 19,
            y: 18,
        },
    });
    await waitFor(async () => {
        if (!attackerId || !defenderId) {
            return false;
        }
        const [attackerState, defenderState] = await Promise.all([fetchState(attackerId), fetchState(defenderId)]);
        return attackerState.player?.instanceId === combatInstanceId
            && defenderState.player?.instanceId === combatInstanceId;
    }, 5000);
    await ensurePlayersAdjacent(attacker, attackerId, defender, defenderId);
/**
 * 记录attacker状态。
 */
    const attackerState = await fetchState(attackerId);
/**
 * 记录bookslot。
 */
    const bookSlot = attackerState.player.inventory.items.findIndex((entry) => entry.itemId === 'book.qingmu_sword');
    if (bookSlot < 0) {
        throw new Error('combat smoke missing starter technique book');
    }
    attacker.emit(shared_1.C2S.UseItem, { slotIndex: bookSlot });
    await waitFor(async () => {
/**
 * 记录状态。
 */
        const state = await fetchState(attackerId);
        return state.player?.techniques?.techniques?.some((entry) => entry.techId === 'qingmu_sword')
            && state.player?.actions?.actions?.some((entry) => entry.id === resolveTechniqueSkillId(state.player, 'qingmu_sword'));
    }, 5000);
/**
 * 记录learnedattacker。
 */
    const learnedAttacker = await fetchState(attackerId);
/**
 * 记录真实技能ID。
 */
    const learnedSkillId = resolveTechniqueSkillId(learnedAttacker.player, 'qingmu_sword');
/**
 * 记录preparedqi。
 */
    const preparedQi = Math.max(30, learnedAttacker.player.maxQi);
    await postJson(`/runtime/players/${attackerId}/vitals`, { qi: preparedQi });
    await waitFor(async () => {
/**
 * 记录状态。
 */
        const state = await fetchState(attackerId);
        return (state.player?.qi ?? 0) >= preparedQi;
    }, 5000);
    attacker.emit(shared_1.C2S.UseAction, { actionId: 'toggle:allow_aoe_player_hit' });
    await waitFor(async () => {
/**
 * 记录状态。
 */
        const state = await fetchState(attackerId);
        return state.player?.combat?.allowAoePlayerHit === true;
    }, 5000);
/**
 * 记录attackerbeforecast。
 */
    let attackerBeforeCast = null;
/**
 * 记录defenderbefore。
 */
    let defenderBefore = null;
/**
 * 记录cast状态attacker。
 */
    let castStateAttacker = null;
/**
 * 记录cast状态defender。
 */
    let castStateDefender = null;
    /**
     * 记录damagedetected。
     */
    let damageDetected = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        attackerBeforeCast = await fetchState(attackerId);
        defenderBefore = await fetchState(defenderId);
        attacker.emit(shared_1.C2S.CastSkill, {
            skillId: learnedSkillId,
            targetPlayerId: defenderId,
        });
        await waitFor(async () => {
            const [attackerAfter, defenderAfter] = await Promise.all([fetchState(attackerId), fetchState(defenderId)]);
            return attackerAfter.player.qi < attackerBeforeCast.player.qi
                || defenderAfter.player.hp < defenderBefore.player.hp
                || readCooldownLeft(attackerAfter.player, learnedSkillId) > 0
                || readBuffRemaining(defenderAfter.player, 'buff.qingmu_mark') > 0;
        }, 5000);
        castStateAttacker = await fetchState(attackerId);
        castStateDefender = await fetchState(defenderId);
        damageDetected = castStateDefender.player.hp < defenderBefore.player.hp;
        if (damageDetected && attackerWorld.some(hasCombatFx)) {
            break;
        }
        if (attempt === 2) {
            break;
        }
        await waitFor(async () => readCooldownLeft((await fetchState(attackerId)).player, learnedSkillId) === 0, 20000);
        await postJson(`/runtime/players/${attackerId}/vitals`, { qi: castStateAttacker.player.maxQi });
        await waitFor(async () => (await fetchState(attackerId)).player.qi >= castStateAttacker.player.maxQi, 5000);
    }
/**
 * 记录cooldownaftercast。
 */
    const cooldownAfterCast = readCooldownLeft(castStateAttacker.player, learnedSkillId);
/**
 * 记录Buffaftercast。
 */
    const buffAfterCast = readBuffRemaining(castStateDefender.player, 'buff.qingmu_mark');
    if (!damageDetected) {
        throw new Error(`expected player skill damage after retries, attackerQi=${attackerBeforeCast.player.qi} defenderHp=${defenderBefore.player.hp} cooldown=${cooldownAfterCast} buff=${buffAfterCast}`);
    }
    if (cooldownAfterCast <= 0) {
        throw new Error(`expected skill cooldown after cast, got ${cooldownAfterCast}`);
    }
    if (!attackerWorld.some(hasCombatFx)) {
        throw new Error('expected combat fx world delta after cast');
    }
    await waitFor(async () => {
        const [attackerAfterTick, defenderAfterTick] = await Promise.all([fetchState(attackerId), fetchState(defenderId)]);
        const cooldownTicked = readCooldownLeft(attackerAfterTick.player, learnedSkillId) < cooldownAfterCast;
        if (buffAfterCast > 0) {
            return cooldownTicked && readBuffRemaining(defenderAfterTick.player, 'buff.qingmu_mark') < buffAfterCast;
        }
        return cooldownTicked;
    }, 5000);
/**
 * 记录finalattacker。
 */
    const finalAttacker = await fetchState(attackerId);
/**
 * 记录finaldefender。
 */
    const finalDefender = await fetchState(defenderId);
    attacker.close();
    defender.close();
    if (attackerId) {
        await deletePlayer(attackerId);
    }
    if (defenderId) {
        await deletePlayer(defenderId);
    }
    console.log(JSON.stringify({
        ok: true,
        url: SERVER_URL,
        attackerId,
        defenderId,
        attackerQiSpent: attackerBeforeCast.player.qi - castStateAttacker.player.qi,
        defenderHpLost: defenderBefore.player.hp - castStateDefender.player.hp,
        cooldownAfterCast,
        cooldownAfterTick: readCooldownLeft(finalAttacker.player, learnedSkillId),
        buffAfterCast,
        buffAfterTick: readBuffRemaining(finalDefender.player, 'buff.qingmu_mark'),
        attackerSelfEvents: attackerSelf,
        defenderSelfEvents: defenderSelf,
        attackerPanels: attackerPanels.length,
        defenderPanels: defenderPanels.length,
        attackerWorldEvents: attackerWorld.length,
        finalAttacker,
        finalDefender,
    }, null, 2));
}
/**
 * hasCombatFx：判断战斗Fx是否满足条件。
 * @param payload 载荷参数。
 * @returns 无返回值，完成战斗Fx的条件判断。
 */

function hasCombatFx(payload) {
    return Array.isArray(payload?.fx) && payload.fx.length > 0;
}
/**
 * 确保战斗 smoke 使用支持 PVP 的真实实例。
 */
async function ensureCombatInstance() {
    await resetLocalGmPasswordRecordIfNeeded();
/**
 * 记录GM令牌。
 */
    const gmToken = await loginGm();
/**
 * 记录payload。
 */
    const payload = await requestJson('/api/gm/world/instances', {
        method: 'POST',
        token: gmToken,
        body: {
            templateId: 'wildlands',
            linePreset: 'real',
            persistentPolicy: 'ephemeral',
            displayName: `战烟_${Date.now().toString(36)}`,
        },
    });
/**
 * 记录instanceId。
 */
    const instanceId = String(payload?.instance?.instanceId ?? '').trim();
    if (!instanceId) {
        throw new Error(`unexpected gm world instance payload: ${JSON.stringify(payload)}`);
    }
    return {
        instanceId,
        gmToken,
    };
}
/**
 * 登录 GM 接口并返回 access token。
 */
async function loginGm() {
/**
 * 记录payload。
 */
    const payload = await requestJson('/api/auth/gm/login', {
        method: 'POST',
        body: {
            password: GM_PASSWORD,
        },
    });
/**
 * 记录token。
 */
    const token = typeof payload?.accessToken === 'string' ? payload.accessToken.trim() : '';
    if (!token) {
        throw new Error(`unexpected GM login payload: ${JSON.stringify(payload)}`);
    }
    return token;
}
/**
 * 在本地带库 smoke 环境下，先清掉持久化 GM 密码记录，避免历史密码污染当前登录链。
 */
async function resetLocalGmPasswordRecordIfNeeded() {
    if (!hasDatabaseUrl) {
        return;
    }
    if (!SERVER_URL.startsWith('http://127.0.0.1:')) {
        return;
    }
    const pool = new pg_1.Pool({
        connectionString: SERVER_DATABASE_URL,
    });
    try {
        await pool.query('DELETE FROM persistent_documents WHERE scope = $1 AND key = $2', [next_gm_contract_1.GM_AUTH_CONTRACT.passwordRecordScope, next_gm_contract_1.GM_AUTH_CONTRACT.passwordRecordKey]);
    }
    finally {
        await pool.end().catch(() => undefined);
    }
}
/**
 * 处理fetch状态。
 */
async function fetchState(playerId) {
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
/**
 * 统一发送 JSON 请求并按需附带鉴权头。
 */
async function requestJson(path, init = {}) {
/**
 * 记录body。
 */
    const body = init.body === undefined ? undefined : JSON.stringify(init.body);
/**
 * 记录response。
 */
    const response = await fetch(`${SERVER_URL}${path}`, {
        method: init.method ?? 'GET',
        headers: {
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
            ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
        },
        body,
    });
    if (!response.ok) {
        throw new Error(`request failed: ${init.method ?? 'GET'} ${path}: ${response.status} ${await response.text()}`);
    }
    if (response.status === 204) {
        return null;
    }
    return response.json();
}
/**
 * 处理delete玩家。
 */
async function deletePlayer(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录response。
 */
    const response = await fetch(`${SERVER_URL}/runtime/players/${playerId}`, {
        method: 'DELETE',
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
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
}
/**
 * 确保playersadjacent。
 */
async function ensurePlayersAdjacent(attacker, attackerId, defender, defenderId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    for (let attempt = 0; attempt < 8; attempt += 1) {
        const [attackerState, defenderState] = await Promise.all([fetchState(attackerId), fetchState(defenderId)]);
        if (chebyshevDistance(attackerState.player, defenderState.player) <= 1) {
            return;
        }
/**
 * 记录attackermoved。
 */
        const attackerMoved = await moveOneStepToward(attacker, attackerId, defenderState.player.x, defenderState.player.y);
        const [nextAttacker, nextDefender] = await Promise.all([fetchState(attackerId), fetchState(defenderId)]);
        if (chebyshevDistance(nextAttacker.player, nextDefender.player) <= 1) {
            return;
        }
/**
 * 记录defendermoved。
 */
        const defenderMoved = await moveOneStepToward(defender, defenderId, nextAttacker.player.x, nextAttacker.player.y);
        const [finalAttacker, finalDefender] = await Promise.all([fetchState(attackerId), fetchState(defenderId)]);
        if (chebyshevDistance(finalAttacker.player, finalDefender.player) <= 1) {
            return;
        }
        if (!attackerMoved && !defenderMoved) {
            break;
        }
    }
    const [attackerState, defenderState] = await Promise.all([fetchState(attackerId), fetchState(defenderId)]);
    throw new Error(`failed to align players for combat: attacker=${attackerState.player.x},${attackerState.player.y} defender=${defenderState.player.x},${defenderState.player.y}`);
}
/**
 * 处理moveonesteptoward。
 */
async function moveOneStepToward(socket, playerId, targetX, targetY) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录状态。
 */
    const state = await fetchState(playerId);
/**
 * 记录directions。
 */
    const directions = buildPreferredDirections(state.player.x, state.player.y, targetX, targetY);
    for (const direction of directions) {
        socket.emit(shared_1.C2S.Move, { d: direction });
/**
 * 记录moved。
 */
        const moved = await waitForMove(playerId, state.player.x, state.player.y, 1800);
        if (moved) {
            return true;
        }
    }
    return false;
}
/**
 * 等待formove。
 */
async function waitForMove(playerId, startX, startY, timeoutMs) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录startedat。
 */
    const startedAt = Date.now();
    while (Date.now() - startedAt <= timeoutMs) {
/**
 * 记录状态。
 */
        const state = await fetchState(playerId);
        if (state.player.x !== startX || state.player.y !== startY) {
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
}
/**
 * 构建优先值directions。
 */
function buildPreferredDirections(currentX, currentY, targetX, targetY) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录directions。
 */
    const directions = [];
/**
 * 记录deltax。
 */
    const deltaX = targetX - currentX;
/**
 * 记录deltay。
 */
    const deltaY = targetY - currentY;
    if (Math.abs(deltaX) >= Math.abs(deltaY)) {
        pushDirectionByDeltaX(directions, deltaX);
        pushDirectionByDeltaY(directions, deltaY);
    }
    else {
        pushDirectionByDeltaY(directions, deltaY);
        pushDirectionByDeltaX(directions, deltaX);
    }
    for (const fallback of [shared_1.Direction.North, shared_1.Direction.South, shared_1.Direction.West, shared_1.Direction.East]) {
        if (!directions.includes(fallback)) {
            directions.push(fallback);
        }
    }
    return directions;
}
/**
 * 追加directionbydeltax。
 */
function pushDirectionByDeltaX(directions, deltaX) {
    if (deltaX < 0) {
        directions.push(shared_1.Direction.West);
    }
    else if (deltaX > 0) {
        directions.push(shared_1.Direction.East);
    }
}
/**
 * 追加directionbydeltay。
 */
function pushDirectionByDeltaY(directions, deltaY) {
    if (deltaY < 0) {
        directions.push(shared_1.Direction.North);
    }
    else if (deltaY > 0) {
        directions.push(shared_1.Direction.South);
    }
}
/**
 * 处理chebyshevdistance。
 */
function chebyshevDistance(left, right) {
    return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
}
/**
 * 读取cooldownleft。
 */
function readCooldownLeft(player, actionId) {
/**
 * 记录entry。
 */
    const entry = player.actions?.actions?.find((item) => item.id === actionId);
    return typeof entry?.cooldownLeft === 'number' ? entry.cooldownLeft : 0;
}
/**
 * 读取Buffremaining。
 */
function readBuffRemaining(player, buffId) {
/**
 * 记录entry。
 */
    const entry = player.buffs?.buffs?.find((item) => item.buffId === buffId);
    return typeof entry?.remainingTicks === 'number' ? entry.remainingTicks : 0;
}
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    await (0, smoke_player_auth_1.flushRegisteredSmokePlayers)();
});

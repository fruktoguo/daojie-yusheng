"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared-next");
const env_alias_1 = require("../config/env-alias");
const SERVER_NEXT_URL = (0, env_alias_1.resolveServerNextUrl)() || 'http://127.0.0.1:3111';
let attackerId = '';
let defenderId = '';
async function main() {
    const attacker = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
    });
    const defender = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
    });
    const attackerPanels = [];
    const defenderPanels = [];
    const attackerSelf = [];
    const defenderSelf = [];
    attacker.on(shared_1.NEXT_S2C.Error, (payload) => {
        throw new Error(`attacker socket error: ${JSON.stringify(payload)}`);
    });
    defender.on(shared_1.NEXT_S2C.Error, (payload) => {
        throw new Error(`defender socket error: ${JSON.stringify(payload)}`);
    });
    attacker.on(shared_1.NEXT_S2C.PanelDelta, (payload) => {
        attackerPanels.push(payload);
    });
    defender.on(shared_1.NEXT_S2C.PanelDelta, (payload) => {
        defenderPanels.push(payload);
    });
    attacker.on(shared_1.NEXT_S2C.SelfDelta, (payload) => {
        attackerSelf.push(payload);
    });
    defender.on(shared_1.NEXT_S2C.SelfDelta, (payload) => {
        defenderSelf.push(payload);
    });
    attacker.on(shared_1.NEXT_S2C.InitSession, (payload) => {
        attackerId = String(payload?.pid ?? '');
    });
    defender.on(shared_1.NEXT_S2C.InitSession, (payload) => {
        defenderId = String(payload?.pid ?? '');
    });
    await Promise.all([onceConnected(attacker), onceConnected(defender)]);
    attacker.emit(shared_1.NEXT_C2S.Hello, {
        mapId: 'yunlai_town',
        preferredX: 24,
        preferredY: 5,
    });
    defender.emit(shared_1.NEXT_C2S.Hello, {
        mapId: 'yunlai_town',
        preferredX: 25,
        preferredY: 5,
    });
    await waitFor(async () => {
        if (!attackerId || !defenderId) {
            return false;
        }
        const [attackerState, defenderState] = await Promise.all([fetchState(attackerId), fetchState(defenderId)]);
        return attackerState.player && defenderState.player;
    }, 5000);
    await ensurePlayersAdjacent(attacker, attackerId, defender, defenderId);
    const attackerState = await fetchState(attackerId);
    const bookSlot = attackerState.player.inventory.items.findIndex((entry) => entry.itemId === 'book.qingmu_sword');
    if (bookSlot < 0) {
        throw new Error('combat smoke missing starter technique book');
    }
    attacker.emit(shared_1.NEXT_C2S.UseItem, { slotIndex: bookSlot });
    await waitFor(async () => {
        const state = await fetchState(attackerId);
        return state.player?.techniques?.techniques?.some((entry) => entry.techId === 'qingmu_sword')
            && state.player?.actions?.actions?.some((entry) => entry.id === 'skill.qingmu_slash');
    }, 5000);
    const learnedAttacker = await fetchState(attackerId);
    const preparedQi = Math.max(30, learnedAttacker.player.maxQi);
    await postJson(`/runtime/players/${attackerId}/vitals`, { qi: preparedQi });
    await waitFor(async () => {
        const state = await fetchState(attackerId);
        return (state.player?.qi ?? 0) >= preparedQi;
    }, 5000);
    let attackerBeforeCast = null;
    let defenderBefore = null;
    let castStateAttacker = null;
    let castStateDefender = null;
    let damageDetected = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        attackerBeforeCast = await fetchState(attackerId);
        defenderBefore = await fetchState(defenderId);
        attacker.emit(shared_1.NEXT_C2S.CastSkill, {
            skillId: 'skill.qingmu_slash',
            targetPlayerId: defenderId,
        });
        await waitFor(async () => {
            const [attackerAfter, defenderAfter] = await Promise.all([fetchState(attackerId), fetchState(defenderId)]);
            return attackerAfter.player.qi < attackerBeforeCast.player.qi
                || defenderAfter.player.hp < defenderBefore.player.hp
                || readCooldownLeft(attackerAfter.player, 'skill.qingmu_slash') > 0
                || readBuffRemaining(defenderAfter.player, 'buff.qingmu_mark') > 0;
        }, 5000);
        castStateAttacker = await fetchState(attackerId);
        castStateDefender = await fetchState(defenderId);
        damageDetected = castStateDefender.player.hp < defenderBefore.player.hp;
        if (damageDetected) {
            break;
        }
        if (attempt === 2) {
            break;
        }
        await waitFor(async () => readCooldownLeft((await fetchState(attackerId)).player, 'skill.qingmu_slash') === 0, 20000);
        await postJson(`/runtime/players/${attackerId}/vitals`, { qi: castStateAttacker.player.maxQi });
        await waitFor(async () => (await fetchState(attackerId)).player.qi >= castStateAttacker.player.maxQi, 5000);
    }
    const cooldownAfterCast = readCooldownLeft(castStateAttacker.player, 'skill.qingmu_slash');
    const buffAfterCast = readBuffRemaining(castStateDefender.player, 'buff.qingmu_mark');
    if (!damageDetected) {
        throw new Error(`expected player skill damage after retries, attackerQi=${attackerBeforeCast.player.qi} defenderHp=${defenderBefore.player.hp} cooldown=${cooldownAfterCast} buff=${buffAfterCast}`);
    }
    if (cooldownAfterCast <= 0) {
        throw new Error(`expected skill cooldown after cast, got ${cooldownAfterCast}`);
    }
    if (buffAfterCast <= 0) {
        throw new Error(`expected target buff after cast, got ${buffAfterCast}`);
    }
    await waitFor(async () => {
        const [attackerAfterTick, defenderAfterTick] = await Promise.all([fetchState(attackerId), fetchState(defenderId)]);
        return readCooldownLeft(attackerAfterTick.player, 'skill.qingmu_slash') < cooldownAfterCast
            && readBuffRemaining(defenderAfterTick.player, 'buff.qingmu_mark') < buffAfterCast;
    }, 5000);
    const finalAttacker = await fetchState(attackerId);
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
        url: SERVER_NEXT_URL,
        attackerId,
        defenderId,
        attackerQiSpent: attackerBeforeCast.player.qi - castStateAttacker.player.qi,
        defenderHpLost: defenderBefore.player.hp - castStateDefender.player.hp,
        cooldownAfterCast,
        cooldownAfterTick: readCooldownLeft(finalAttacker.player, 'skill.qingmu_slash'),
        buffAfterCast,
        buffAfterTick: readBuffRemaining(finalDefender.player, 'buff.qingmu_mark'),
        attackerSelfEvents: attackerSelf,
        defenderSelfEvents: defenderSelf,
        attackerPanels: attackerPanels.length,
        defenderPanels: defenderPanels.length,
        finalAttacker,
        finalDefender,
    }, null, 2));
}
async function fetchState(playerId) {
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
async function deletePlayer(playerId) {
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/players/${playerId}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        throw new Error(`request failed: ${response.status} ${await response.text()}`);
    }
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
async function ensurePlayersAdjacent(attacker, attackerId, defender, defenderId) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const [attackerState, defenderState] = await Promise.all([fetchState(attackerId), fetchState(defenderId)]);
        if (chebyshevDistance(attackerState.player, defenderState.player) <= 1) {
            return;
        }
        const attackerMoved = await moveOneStepToward(attacker, attackerId, defenderState.player.x, defenderState.player.y);
        const [nextAttacker, nextDefender] = await Promise.all([fetchState(attackerId), fetchState(defenderId)]);
        if (chebyshevDistance(nextAttacker.player, nextDefender.player) <= 1) {
            return;
        }
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
async function moveOneStepToward(socket, playerId, targetX, targetY) {
    const state = await fetchState(playerId);
    const directions = buildPreferredDirections(state.player.x, state.player.y, targetX, targetY);
    for (const direction of directions) {
        socket.emit(shared_1.NEXT_C2S.Move, { d: direction });
        const moved = await waitForMove(playerId, state.player.x, state.player.y, 1800);
        if (moved) {
            return true;
        }
    }
    return false;
}
async function waitForMove(playerId, startX, startY, timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt <= timeoutMs) {
        const state = await fetchState(playerId);
        if (state.player.x !== startX || state.player.y !== startY) {
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
}
function buildPreferredDirections(currentX, currentY, targetX, targetY) {
    const directions = [];
    const deltaX = targetX - currentX;
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
function pushDirectionByDeltaX(directions, deltaX) {
    if (deltaX < 0) {
        directions.push(shared_1.Direction.West);
    }
    else if (deltaX > 0) {
        directions.push(shared_1.Direction.East);
    }
}
function pushDirectionByDeltaY(directions, deltaY) {
    if (deltaY < 0) {
        directions.push(shared_1.Direction.North);
    }
    else if (deltaY > 0) {
        directions.push(shared_1.Direction.South);
    }
}
function chebyshevDistance(left, right) {
    return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
}
function readCooldownLeft(player, actionId) {
    const entry = player.actions?.actions?.find((item) => item.id === actionId);
    return typeof entry?.cooldownLeft === 'number' ? entry.cooldownLeft : 0;
}
function readBuffRemaining(player, buffId) {
    const entry = player.buffs?.buffs?.find((item) => item.buffId === buffId);
    return typeof entry?.remainingTicks === 'number' ? entry.remainingTicks : 0;
}
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
//# sourceMappingURL=combat-smoke.js.map

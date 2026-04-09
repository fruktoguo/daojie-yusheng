"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const socket_io_client_1 = require("socket.io-client");
const shared_1 = require("@mud/shared-next");
const env_alias_1 = require("../../config/env-alias");
const SERVER_NEXT_URL = (0, env_alias_1.resolveServerNextUrl)() || 'http://127.0.0.1:3111';
const GM_PASSWORD = (0, env_alias_1.resolveServerNextGmPassword)('admin123');
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const accountName = `gc_${suffix.slice(-10)}`;
const password = `Pass_${suffix}`;
const roleName = `兼烟${suffix.slice(-4)}`;
const displayName = suffix[suffix.length - 1] ?? '测';
const gmChangedPassword = `${password}_gmchg${suffix.slice(-4)}`;
async function main() {
    let auth = null;
    let gmToken = '';
    let socket = null;
    auth = await registerAndLoginPlayer();
    gmToken = await loginGm();
    socket = (0, socket_io_client_1.io)(SERVER_NEXT_URL, {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        auth: {
            token: auth.accessToken,
            gmToken,
            protocol: 'legacy',
        },
    });
    const gmStateEvents = [];
    let legacyInit = null;
    let socketError = null;
    socket.on(shared_1.S2C.Error, (payload) => {
        socketError = new Error(`legacy socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.NEXT_S2C.Error, (payload) => {
        socketError = new Error(`next socket error: ${JSON.stringify(payload)}`);
    });
    socket.on(shared_1.S2C.Init, (payload) => {
        legacyInit = payload;
    });
    socket.on(shared_1.S2C.GmState, (payload) => {
        gmStateEvents.push({ kind: 'legacy', payload });
    });
    socket.on(shared_1.NEXT_S2C.GmState, (payload) => {
        gmStateEvents.push({ kind: 'next', payload });
    });
    try {
        await onceConnected(socket);
        await waitFor(() => {
            throwIfSocketError(socketError);
            return legacyInit !== null;
        }, 5000, 'legacy init');
        const initialRuntime = await waitForPlayerState(auth.playerId, () => true, 5000);
        const initialMaps = await authedGetJson('/gm/maps', gmToken);
        const currentMapSummary = assertGmMapsShape(initialMaps, initialRuntime.templateId);
        const editorCatalog = await authedGetJson('/gm/editor-catalog', gmToken);
        const editorCatalogSummary = assertEditorCatalogShape(editorCatalog);
        const runtimeInspection = await inspectMapRuntime(gmToken, auth.playerId, initialRuntime.templateId, initialRuntime.x, initialRuntime.y);
        const initialSocketGmState = await emitAndWaitForGmState(socket, gmStateEvents, socketError, shared_1.C2S.GmGetState, {}, (entry) => {
            return Array.isArray(entry?.payload?.players) && Array.isArray(entry?.payload?.mapIds);
        }, 5000, 'socket gmGetState');
        assertLegacyGmState(initialSocketGmState, 'socket gmGetState');
        const socketBotBaseline = Number(initialSocketGmState?.payload?.botCount ?? 0);
        const socketTargetPosition = await findNearbyWalkablePosition(gmToken, auth.playerId, initialRuntime.templateId, initialRuntime.x, initialRuntime.y);
        const socketTargetHp = computeReducedHp(initialRuntime.hp, initialRuntime.maxHp, 7);
        const socketTargetAutoBattle = !Boolean(initialRuntime.combat?.autoBattle);
        const socketSpawnState = await emitAndWaitForGmState(socket, gmStateEvents, socketError, shared_1.C2S.GmSpawnBots, {
            count: 1,
        }, (entry) => Number(entry?.payload?.botCount ?? 0) >= socketBotBaseline + 1, 8000, 'socket gmSpawnBots');
        assertLegacyGmState(socketSpawnState, 'socket gmSpawnBots');
        const socketSpawnBotCount = Number(socketSpawnState?.payload?.botCount ?? 0);
        socket.emit(shared_1.C2S.GmUpdatePlayer, {
            playerId: auth.playerId,
            mapId: initialRuntime.templateId,
            x: socketTargetPosition.x,
            y: socketTargetPosition.y,
            hp: socketTargetHp,
            autoBattle: socketTargetAutoBattle,
        });
        const socketUpdatedRuntime = await waitForPlayerState(auth.playerId, (player) => {
            return isUpdatedPositionState(player, {
                previousMapId: initialRuntime.templateId,
                previousX: initialRuntime.x,
                previousY: initialRuntime.y,
                nextMapId: initialRuntime.templateId,
                hp: socketTargetHp,
                autoBattle: socketTargetAutoBattle,
            });
        }, 8000);
        const socketUpdateState = await waitForSocketGmState(gmStateEvents, socketError, auth.playerId, {
            previousMapId: initialRuntime.templateId,
            previousX: initialRuntime.x,
            previousY: initialRuntime.y,
            nextMapId: socketUpdatedRuntime.templateId,
            hp: socketUpdatedRuntime.hp,
            autoBattle: socketUpdatedRuntime.combat?.autoBattle ?? false,
            expectedX: socketUpdatedRuntime.x,
            expectedY: socketUpdatedRuntime.y,
        }, 8000, 'socket gmUpdatePlayer');
        assertLegacyGmState(socketUpdateState, 'socket gmUpdatePlayer');
        const socketResetState = await emitAndWaitForGmState(socket, gmStateEvents, socketError, shared_1.C2S.GmResetPlayer, {
            playerId: auth.playerId,
        }, (entry) => hasGmPlayerSummary(entry?.payload, auth.playerId, (player) => {
            return player.mapId === 'yunlai_town'
                && player.autoBattle === false
                && player.dead === false;
        }), 8000, 'socket gmResetPlayer');
        assertLegacyGmState(socketResetState, 'socket gmResetPlayer');
        const socketResetRuntime = await waitForPlayerState(auth.playerId, (player) => {
            return player.templateId === 'yunlai_town'
                && player.hp === player.maxHp
                && player.combat?.autoBattle === false;
        }, 8000);
        const socketRemoveState = await emitAndWaitForGmState(socket, gmStateEvents, socketError, shared_1.C2S.GmRemoveBots, {
            all: true,
        }, (entry) => Number(entry?.payload?.botCount ?? 0) === 0, 8000, 'socket gmRemoveBots');
        assertLegacyGmState(socketRemoveState, 'socket gmRemoveBots');
        const initialHttpState = await authedGetJson('/gm/state', gmToken);
        assertGmStateShape(initialHttpState, 'initial http gm state');
        const httpRuntimeBefore = await waitForPlayerState(auth.playerId, () => true, 5000);
        const httpTargetPosition = await findNearbyWalkablePosition(gmToken, auth.playerId, httpRuntimeBefore.templateId, httpRuntimeBefore.x, httpRuntimeBefore.y);
        const httpTargetHp = computeReducedHp(httpRuntimeBefore.hp, httpRuntimeBefore.maxHp, 11);
        const httpTargetAutoBattle = false;
        await authedRequestJson(`/gm/players/${auth.playerId}`, {
            method: 'PUT',
            token: gmToken,
            body: {
                section: 'position',
                snapshot: {
                    mapId: httpRuntimeBefore.templateId,
                    x: httpTargetPosition.x,
                    y: httpTargetPosition.y,
                    hp: httpTargetHp,
                    autoBattle: httpTargetAutoBattle,
                },
            },
        });
        const httpUpdated = await waitForRuntimeAndGmPlayerState(auth.playerId, gmToken, (runtime, summary) => {
            return runtime.templateId === httpRuntimeBefore.templateId
                && summary.mapId === httpRuntimeBefore.templateId
                && runtime.x === summary.x
                && runtime.y === summary.y
                && runtime.hp === summary.hp
                && Boolean(runtime.combat?.autoBattle) === Boolean(summary.autoBattle)
                && (runtime.x !== httpRuntimeBefore.x
                    || runtime.y !== httpRuntimeBefore.y
                    || runtime.hp !== httpRuntimeBefore.hp
                    || Boolean(runtime.combat?.autoBattle) !== Boolean(httpRuntimeBefore.combat?.autoBattle));
        }, 8000, 'http gmUpdatePlayer');
        const httpUpdatedRuntime = httpUpdated.runtime;
        const httpUpdatedGmState = httpUpdated.gmState;
        await authedRequestJson(`/gm/players/${auth.playerId}/reset`, {
            method: 'POST',
            token: gmToken,
            body: {},
        });
        const httpResetRuntime = await waitForPlayerState(auth.playerId, (player) => {
            return player.templateId === 'yunlai_town'
                && player.hp === player.maxHp
                && player.combat?.autoBattle === false;
        }, 8000);
        const httpResetGmState = await waitForGmState(gmToken, (payload) => hasGmPlayerSummary(payload, auth.playerId, (player) => {
            return player.mapId === 'yunlai_town'
                && player.autoBattle === false
                && player.dead === false;
        }), 8000, 'http gmResetPlayer');
        await authedRequestJson('/gm/bots/spawn', {
            method: 'POST',
            token: gmToken,
            body: {
                anchorPlayerId: auth.playerId,
                count: 1,
            },
        });
        const httpSpawnState = await waitForGmState(gmToken, (payload) => Number(payload?.botCount ?? 0) >= 1, 8000, 'http gmSpawnBots');
        await authedRequestJson('/gm/bots/remove', {
            method: 'POST',
            token: gmToken,
            body: {
                all: true,
            },
        });
        const httpRemoveState = await waitForGmState(gmToken, (payload) => Number(payload?.botCount ?? 0) === 0, 8000, 'http gmRemoveBots');
        const mailSummaryBefore = await fetchMailSummary(auth.playerId);
        const directMail = await authedRequestJson(`/gm/players/${auth.playerId}/mail`, {
            method: 'POST',
            token: gmToken,
            body: {
                fallbackTitle: `GM直邮${suffix.slice(-4)}`,
                fallbackBody: `gm-compat direct ${suffix}`,
                attachments: [{ itemId: 'spirit_stone', count: 1 }],
            },
        });
        const broadcastMail = await authedRequestJson('/gm/mail/broadcast', {
            method: 'POST',
            token: gmToken,
            body: {
                fallbackTitle: `GM群邮${suffix.slice(-4)}`,
                fallbackBody: `gm-compat broadcast ${suffix}`,
                attachments: [{ itemId: 'pill.minor_heal', count: 1 }],
            },
        });
        const mailSummaryAfter = await waitForMailSummary(auth.playerId, (summary) => summary.unreadCount >= mailSummaryBefore.unreadCount + 2
            && summary.claimableCount >= mailSummaryBefore.claimableCount + 2, 8000, 'gm mail summary');
        const mailPage = await waitForMailPage(auth.playerId, (page) => page.items.some((entry) => entry?.mailId === directMail?.mailId)
            && page.items.some((entry) => typeof entry?.title === 'string' && entry.title.includes('GM群邮')), 8000, 'gm mail page');
        const createdSuggestion = await requestJson(`/runtime/players/${auth.playerId}/suggestions`, {
            method: 'POST',
            body: {
                title: `GM建议${suffix.slice(-4)}`,
                description: `gm-compat suggestion ${suffix}`,
            },
        });
        const suggestionId = String(createdSuggestion?.suggestion?.id ?? '').trim();
        if (!suggestionId) {
            throw new Error(`unexpected suggestion create payload: ${JSON.stringify(createdSuggestion)}`);
        }
        await waitForGmSuggestions(gmToken, (payload) => findSuggestion(payload, suggestionId)?.status === 'pending', 8000, 'gm suggestions list');
        await authedRequestJson(`/gm/suggestions/${suggestionId}/replies`, {
            method: 'POST',
            token: gmToken,
            body: {
                content: `GM回复${suffix}`,
            },
        });
        await authedRequestJson(`/gm/suggestions/${suggestionId}/complete`, {
            method: 'POST',
            token: gmToken,
            body: {},
        });
        const completedSuggestions = await waitForGmSuggestions(gmToken, (payload) => {
            const suggestion = findSuggestion(payload, suggestionId);
            return suggestion?.status === 'completed'
                && Array.isArray(suggestion?.replies)
                && suggestion.replies.some((entry) => entry?.authorType === 'gm');
        }, 8000, 'gm suggestions complete');
        await authedRequestJson(`/gm/suggestions/${suggestionId}`, {
            method: 'DELETE',
            token: gmToken,
        });
        await waitForGmSuggestions(gmToken, (payload) => findSuggestion(payload, suggestionId) === null, 8000, 'gm suggestions remove');
        const mapRuntimeBefore = await fetchGmMapRuntime(gmToken, httpResetRuntime.templateId, auth.playerId, httpResetRuntime.x, httpResetRuntime.y);
        const nextTickSpeed = Math.max(1, Number(mapRuntimeBefore?.tickSpeed ?? 1) + 2);
        const nextTimeScale = Math.max(1, Number(mapRuntimeBefore?.timeConfig?.scale ?? 1) + 1);
        const nextOffsetTicks = Math.trunc(Number(mapRuntimeBefore?.timeConfig?.offsetTicks ?? 0) + 60);
        await authedRequestJson(`/gm/maps/${httpResetRuntime.templateId}/tick`, {
            method: 'PUT',
            token: gmToken,
            body: {
                paused: false,
                speed: nextTickSpeed,
            },
        });
        await authedRequestJson(`/gm/maps/${httpResetRuntime.templateId}/time`, {
            method: 'PUT',
            token: gmToken,
            body: {
                scale: nextTimeScale,
                offsetTicks: nextOffsetTicks,
            },
        });
        const mapRuntimeUpdated = await waitForGmMapRuntime(gmToken, httpResetRuntime.templateId, auth.playerId, httpResetRuntime.x, httpResetRuntime.y, (runtime) => Number(runtime?.tickSpeed ?? 0) === nextTickSpeed
            && runtime?.tickPaused === false
            && Number(runtime?.timeConfig?.scale ?? 0) === nextTimeScale
            && Number(runtime?.timeConfig?.offsetTicks ?? 0) === nextOffsetTicks, 8000, 'gm map runtime update');
        await authedRequestJson('/gm/tick-config/reload', {
            method: 'POST',
            token: gmToken,
            body: {},
        });
        const mapRuntimeReloaded = await waitForGmMapRuntime(gmToken, httpResetRuntime.templateId, auth.playerId, httpResetRuntime.x, httpResetRuntime.y, (runtime) => Number(runtime?.tickSpeed ?? 0) === nextTickSpeed
            && Number(runtime?.timeConfig?.scale ?? 0) === nextTimeScale
            && Number(runtime?.timeConfig?.offsetTicks ?? 0) === nextOffsetTicks, 8000, 'gm tick reload');
        await authedRequestJson(`/gm/players/${auth.playerId}/password`, {
            method: 'POST',
            token: gmToken,
            body: {
                password: gmChangedPassword,
            },
        });
        const reloginPayload = await requestJson('/auth/login', {
            method: 'POST',
            body: {
                loginName: accountName,
                password: gmChangedPassword,
            },
        });
        const reloginAccessToken = typeof reloginPayload?.accessToken === 'string' ? reloginPayload.accessToken : '';
        if (!reloginAccessToken) {
            throw new Error(`gm password change login missing token: ${JSON.stringify(reloginPayload)}`);
        }
        const reloginDecoded = parseJwtPayload(reloginAccessToken);
        const reloginPlayerId = reloginDecoded?.sub ? `p_${String(reloginDecoded.sub).trim()}` : '';
        if (reloginPlayerId !== auth.playerId) {
            throw new Error(`gm password change login player mismatch: expected ${auth.playerId} but got ${reloginPlayerId}`);
        }
        console.log(JSON.stringify({
            ok: true,
            url: SERVER_NEXT_URL,
            playerId: auth.playerId,
            socket: {
                gmStateEvents: gmStateEvents.length,
                legacyGmStateEvents: gmStateEvents.filter((entry) => entry.kind === 'legacy').length,
                nextGmStateEvents: gmStateEvents.filter((entry) => entry.kind === 'next').length,
                spawnBotCount: socketSpawnBotCount,
                update: {
                    x: socketUpdatedRuntime.x,
                    y: socketUpdatedRuntime.y,
                    hp: socketUpdatedRuntime.hp,
                    autoBattle: socketUpdatedRuntime.combat?.autoBattle ?? false,
                },
                reset: {
                    mapId: socketResetRuntime.templateId,
                    hp: socketResetRuntime.hp,
                    maxHp: socketResetRuntime.maxHp,
                    autoBattle: socketResetRuntime.combat?.autoBattle ?? false,
                },
                finalBotCount: Number(socketRemoveState?.payload?.botCount ?? 0),
            },
            http: {
                update: {
                    x: httpUpdatedRuntime.x,
                    y: httpUpdatedRuntime.y,
                    hp: httpUpdatedRuntime.hp,
                    autoBattle: httpUpdatedRuntime.combat?.autoBattle ?? false,
                },
                reset: {
                    mapId: httpResetRuntime.templateId,
                    hp: httpResetRuntime.hp,
                    maxHp: httpResetRuntime.maxHp,
                    autoBattle: httpResetRuntime.combat?.autoBattle ?? false,
                },
                botCountAfterSpawn: Number(httpSpawnState?.botCount ?? 0),
                botCountAfterRemove: Number(httpRemoveState?.botCount ?? 0),
                playerSummary: summarizeGmPlayer(httpUpdatedGmState, auth.playerId),
                resetSummary: summarizeGmPlayer(httpResetGmState, auth.playerId),
                mail: {
                    directMailId: String(directMail?.mailId ?? ''),
                    broadcastMailId: String(broadcastMail?.mailId ?? ''),
                    broadcastRecipientCount: Number(broadcastMail?.recipientCount ?? 0),
                    unreadCount: Number(mailSummaryAfter?.unreadCount ?? 0),
                    claimableCount: Number(mailSummaryAfter?.claimableCount ?? 0),
                    topMailIds: Array.isArray(mailPage?.items) ? mailPage.items.slice(0, 3).map((entry) => entry?.mailId ?? null) : [],
                },
                suggestions: {
                    suggestionId,
                    status: findSuggestion(completedSuggestions, suggestionId)?.status ?? null,
                    replyCount: Array.isArray(findSuggestion(completedSuggestions, suggestionId)?.replies)
                        ? findSuggestion(completedSuggestions, suggestionId).replies.length
                        : 0,
                },
                mapRuntime: {
                    mapId: httpResetRuntime.templateId,
                    tickSpeed: Number(mapRuntimeReloaded?.tickSpeed ?? 0),
                    tickPaused: mapRuntimeReloaded?.tickPaused === true,
                    timeScale: Number(mapRuntimeReloaded?.timeConfig?.scale ?? 0),
                    offsetTicks: Number(mapRuntimeReloaded?.timeConfig?.offsetTicks ?? 0),
                    entityCount: Array.isArray(mapRuntimeUpdated?.entities) ? mapRuntimeUpdated.entities.length : 0,
                },
            },
            gmState: {
                initialPlayers: initialHttpState.players.length,
                initialMaps: initialHttpState.mapIds.length,
            },
            passwordChange: {
                verifiedPlayerId: reloginPlayerId,
                status: 'gm-password-update',
            },
            adminRead: {
                currentMap: {
                    id: currentMapSummary.id,
                    width: currentMapSummary.width,
                    height: currentMapSummary.height,
                },
                editorCatalog: editorCatalogSummary,
                runtimeInspection,
            },
        }, null, 2));
    }
    finally {
        socket?.close();
        await cleanup(gmToken, auth?.playerId ?? '').catch(() => undefined);
    }
}
async function cleanup(gmToken, playerId) {
    if (gmToken) {
        await authedRequestJson('/gm/bots/remove', {
            method: 'POST',
            token: gmToken,
            body: { all: true },
        }).catch(() => undefined);
    }
    await deletePlayer(playerId).catch(() => undefined);
}
function computeReducedHp(currentHp, maxHp, preferredDelta) {
    const safeMaxHp = Math.max(1, Math.trunc(maxHp || currentHp || 1));
    const safeCurrentHp = Math.max(1, Math.min(safeMaxHp, Math.trunc(currentHp || safeMaxHp)));
    const delta = Math.max(1, Math.trunc(preferredDelta || 1));
    if (safeCurrentHp - delta >= 1) {
        return safeCurrentHp - delta;
    }
    if (safeMaxHp > 1) {
        return safeMaxHp - 1;
    }
    return 1;
}
async function registerAndLoginPlayer() {
    await requestJson('/auth/register', {
        method: 'POST',
        body: {
            accountName,
            password,
            displayName,
            roleName,
        },
    });
    const login = await requestJson('/auth/login', {
        method: 'POST',
        body: {
            loginName: accountName,
            password,
        },
    });
    const payload = parseJwtPayload(login?.accessToken);
    if (!payload?.sub || typeof login?.accessToken !== 'string') {
        throw new Error(`unexpected login payload: ${JSON.stringify(login)}`);
    }
    return {
        accessToken: login.accessToken,
        playerId: `p_${String(payload.sub).trim()}`,
    };
}
async function loginGm() {
    const payload = await requestJson('/auth/gm/login', {
        method: 'POST',
        body: {
            password: GM_PASSWORD,
        },
    });
    const token = typeof payload?.accessToken === 'string' ? payload.accessToken.trim() : '';
    if (!token) {
        throw new Error(`unexpected GM login payload: ${JSON.stringify(payload)}`);
    }
    return token;
}
async function requestJson(path, init = {}) {
    const body = init.body === undefined ? undefined : JSON.stringify(init.body);
    const headers = {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    };
    const response = await fetch(`${SERVER_NEXT_URL}${path}`, {
        method: init.method ?? 'GET',
        headers: Object.keys(headers).length > 0 ? headers : undefined,
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
async function authedGetJson(path, token) {
    return requestJson(path, {
        method: 'GET',
        token,
    });
}
async function authedRequestJson(path, init) {
    return requestJson(path, init);
}
async function fetchPlayerState(playerId) {
    return requestJson(`/runtime/players/${playerId}/state`, {
        method: 'GET',
    });
}
async function fetchMailSummary(playerId) {
    const payload = await requestJson(`/runtime/players/${playerId}/mail/summary`, {
        method: 'GET',
    });
    return payload?.summary ?? null;
}
async function fetchMailPage(playerId) {
    const payload = await requestJson(`/runtime/players/${playerId}/mail/page?page=1&pageSize=10`, {
        method: 'GET',
    });
    return payload?.page ?? null;
}
async function waitForMailSummary(playerId, predicate, timeoutMs, label) {
    let resolved = null;
    await waitFor(async () => {
        const summary = await fetchMailSummary(playerId);
        if (!summary || !(await predicate(summary))) {
            return false;
        }
        resolved = summary;
        return true;
    }, timeoutMs, label);
    return resolved;
}
async function waitForMailPage(playerId, predicate, timeoutMs, label) {
    let resolved = null;
    await waitFor(async () => {
        const page = await fetchMailPage(playerId);
        if (!page || !(await predicate(page))) {
            return false;
        }
        resolved = page;
        return true;
    }, timeoutMs, label);
    return resolved;
}
async function waitForPlayerState(playerId, predicate, timeoutMs) {
    let resolved = null;
    await waitFor(async () => {
        const payload = await fetchPlayerState(playerId);
        const player = payload?.player ?? null;
        if (!player) {
            return false;
        }
        if (!(await predicate(player, payload))) {
            return false;
        }
        resolved = player;
        return true;
    }, timeoutMs, `player state ${playerId}`);
    return resolved;
}
async function findNearbyWalkablePosition(token, playerId, mapId, x, y) {
    const startX = Math.max(0, Math.trunc(x) - 2);
    const startY = Math.max(0, Math.trunc(y) - 2);
    const runtime = await authedGetJson(`/gm/maps/${mapId}/runtime?x=${startX}&y=${startY}&w=5&h=5&viewerId=${encodeURIComponent(playerId)}`, token);
    const tiles = Array.isArray(runtime?.tiles) ? runtime.tiles : [];
    const occupiedKeys = new Set((Array.isArray(runtime?.entities) ? runtime.entities : [])
        .filter((entry) => entry
        && entry.id !== playerId
        && Number.isFinite(entry.x)
        && Number.isFinite(entry.y))
        .map((entry) => `${Math.trunc(entry.x)},${Math.trunc(entry.y)}`));
    for (let row = 0; row < tiles.length; row += 1) {
        const line = Array.isArray(tiles[row]) ? tiles[row] : [];
        for (let column = 0; column < line.length; column += 1) {
            const tile = line[column];
            if (!tile || tile.walkable !== true) {
                continue;
            }
            const candidateX = startX + column;
            const candidateY = startY + row;
            if (candidateX === x && candidateY === y) {
                continue;
            }
            if (occupiedKeys.has(`${candidateX},${candidateY}`)) {
                continue;
            }
            return { x: candidateX, y: candidateY };
        }
    }
    return { x, y };
}
async function inspectMapRuntime(token, playerId, mapId, x, y) {
    const startX = Math.max(0, Math.trunc(x) - 2);
    const startY = Math.max(0, Math.trunc(y) - 2);
    const runtime = await authedGetJson(`/gm/maps/${mapId}/runtime?x=${startX}&y=${startY}&w=5&h=5&viewerId=${encodeURIComponent(playerId)}`, token);
    return assertMapRuntimeShape(runtime, mapId, playerId);
}
async function emitAndWaitForGmState(socket, gmStateEvents, socketError, event, payload, predicate, timeoutMs, label) {
    const beforeCount = gmStateEvents.length;
    socket.emit(event, payload);
    let resolved = null;
    await waitFor(() => {
        throwIfSocketError(socketError);
        for (let index = beforeCount; index < gmStateEvents.length; index += 1) {
            const current = gmStateEvents[index];
            if (predicate(current)) {
                resolved = current;
                return true;
            }
        }
        return false;
    }, timeoutMs, label);
    return resolved;
}
async function waitForGmState(token, predicate, timeoutMs, label) {
    let resolved = null;
    await waitFor(async () => {
        const payload = await authedGetJson('/gm/state', token);
        assertGmStateShape(payload, label);
        if (!(await predicate(payload))) {
            return false;
        }
        resolved = payload;
        return true;
    }, timeoutMs, label);
    return resolved;
}
async function fetchGmSuggestions(token) {
    return authedGetJson('/gm/suggestions?page=1&pageSize=20', token);
}
async function waitForGmSuggestions(token, predicate, timeoutMs, label) {
    let resolved = null;
    await waitFor(async () => {
        const payload = await fetchGmSuggestions(token);
        if (!Array.isArray(payload?.items) || !(await predicate(payload))) {
            return false;
        }
        resolved = payload;
        return true;
    }, timeoutMs, label);
    return resolved;
}
async function fetchGmMapRuntime(token, mapId, viewerId, x, y) {
    const startX = Math.max(0, Math.trunc(x) - 2);
    const startY = Math.max(0, Math.trunc(y) - 2);
    return authedGetJson(`/gm/maps/${mapId}/runtime?x=${startX}&y=${startY}&w=5&h=5&viewerId=${encodeURIComponent(viewerId)}`, token);
}
async function waitForGmMapRuntime(token, mapId, viewerId, x, y, predicate, timeoutMs, label) {
    let resolved = null;
    await waitFor(async () => {
        const runtime = await fetchGmMapRuntime(token, mapId, viewerId, x, y);
        if (!runtime || !(await predicate(runtime))) {
            return false;
        }
        resolved = runtime;
        return true;
    }, timeoutMs, label);
    return resolved;
}
async function waitForRuntimeAndGmPlayerState(playerId, token, predicate, timeoutMs, label) {
    let resolved = null;
    await waitFor(async () => {
        const [runtimePayload, gmPayload] = await Promise.all([
            fetchPlayerState(playerId),
            authedGetJson('/gm/state', token),
        ]);
        assertGmStateShape(gmPayload, label);
        const runtime = runtimePayload?.player ?? null;
        const summary = summarizeGmPlayer(gmPayload, playerId);
        if (!runtime || !summary) {
            return false;
        }
        if (!(await predicate(runtime, summary, runtimePayload, gmPayload))) {
            return false;
        }
        resolved = {
            runtime,
            summary,
            gmState: gmPayload,
        };
        return true;
    }, timeoutMs, label);
    return resolved;
}
async function waitForSocketGmState(gmStateEvents, socketError, playerId, expected, timeoutMs, label) {
    let resolved = null;
    await waitFor(() => {
        throwIfSocketError(socketError);
        for (let index = 0; index < gmStateEvents.length; index += 1) {
            const current = gmStateEvents[index];
            if (!hasGmPlayerSummary(current?.payload, playerId, (player) => matchesUpdatedSummary(player, expected))) {
                continue;
            }
            resolved = current;
            return true;
        }
        return false;
    }, timeoutMs, label);
    return resolved;
}
function assertGmStateShape(payload, label) {
    if (!Array.isArray(payload?.players) || !Array.isArray(payload?.mapIds)) {
        throw new Error(`unexpected ${label} payload: ${JSON.stringify(payload)}`);
    }
}
function assertGmMapsShape(payload, expectedMapId) {
    if (!Array.isArray(payload?.maps) || payload.maps.length === 0) {
        throw new Error(`unexpected gm maps payload: ${JSON.stringify(payload)}`);
    }
    const summary = payload.maps.find((entry) => entry?.id === expectedMapId);
    if (!summary || !Number.isFinite(summary.width) || !Number.isFinite(summary.height)) {
        throw new Error(`missing current map summary for ${expectedMapId}: ${JSON.stringify(payload)}`);
    }
    return summary;
}
function assertEditorCatalogShape(payload) {
    const items = Array.isArray(payload?.items) ? payload.items : null;
    const techniques = Array.isArray(payload?.techniques) ? payload.techniques : null;
    const realmLevels = Array.isArray(payload?.realmLevels) ? payload.realmLevels : null;
    const buffs = Array.isArray(payload?.buffs) ? payload.buffs : null;
    if (!items || !techniques || !realmLevels || !buffs) {
        throw new Error(`unexpected gm editor catalog payload: ${JSON.stringify(payload)}`);
    }
    if (items.length === 0 || techniques.length === 0 || realmLevels.length === 0) {
        throw new Error(`gm editor catalog unexpectedly empty: ${JSON.stringify({
            items: items.length,
            techniques: techniques.length,
            realmLevels: realmLevels.length,
            buffs: buffs.length,
        })}`);
    }
    return {
        itemCount: items.length,
        techniqueCount: techniques.length,
        realmLevelCount: realmLevels.length,
        buffCount: buffs.length,
    };
}
function assertMapRuntimeShape(payload, expectedMapId, playerId) {
    if (payload?.mapId !== expectedMapId || !Array.isArray(payload?.tiles) || !Array.isArray(payload?.entities)) {
        throw new Error(`unexpected gm map runtime payload: ${JSON.stringify(payload)}`);
    }
    const tileRows = payload.tiles;
    if (tileRows.length === 0 || !Array.isArray(tileRows[0]) || tileRows[0].length === 0) {
        throw new Error(`gm map runtime tiles unexpectedly empty: ${JSON.stringify(payload)}`);
    }
    const playerEntity = payload.entities.find((entry) => entry?.id === playerId);
    if (!playerEntity || playerEntity.kind !== 'player') {
        throw new Error(`gm map runtime missing player entity ${playerId}: ${JSON.stringify(payload.entities)}`);
    }
    return {
        mapId: payload.mapId,
        tileRows: tileRows.length,
        tileColumns: Array.isArray(tileRows[0]) ? tileRows[0].length : 0,
        entityCount: payload.entities.length,
        playerEntityKind: playerEntity.kind,
    };
}
function assertLegacyGmState(entry, label) {
    if (entry?.kind !== 'legacy') {
        throw new Error(`expected legacy gm state for ${label}, got ${entry?.kind ?? 'none'}`);
    }
}
function hasGmPlayerSummary(payload, playerId, predicate) {
    const player = summarizeGmPlayer(payload, playerId);
    if (!player) {
        return false;
    }
    return predicate(player);
}
function summarizeGmPlayer(payload, playerId) {
    return Array.isArray(payload?.players)
        ? payload.players.find((entry) => entry?.id === playerId) ?? null
        : null;
}
function findSuggestion(payload, suggestionId) {
    return Array.isArray(payload?.items)
        ? payload.items.find((entry) => entry?.id === suggestionId) ?? null
        : null;
}
function isUpdatedPositionState(player, expected) {
    return player.templateId === expected.nextMapId
        && player.hp === expected.hp
        && (player.combat?.autoBattle ?? false) === expected.autoBattle
        && hasRelocatedPosition(player.x, player.y, expected.previousX, expected.previousY)
        && (expected.expectedX === undefined || player.x === expected.expectedX)
        && (expected.expectedY === undefined || player.y === expected.expectedY);
}
function matchesUpdatedSummary(player, expected) {
    return player.mapId === expected.nextMapId
        && player.hp === expected.hp
        && player.autoBattle === expected.autoBattle
        && hasRelocatedPosition(player.x, player.y, expected.previousX, expected.previousY)
        && (expected.expectedX === undefined || player.x === expected.expectedX)
        && (expected.expectedY === undefined || player.y === expected.expectedY);
}
function hasRelocatedPosition(x, y, previousX, previousY) {
    return x !== previousX || y !== previousY;
}
function parseJwtPayload(token) {
    if (typeof token !== 'string') {
        return null;
    }
    const segments = token.split('.');
    if (segments.length < 2) {
        return null;
    }
    try {
        return JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'));
    }
    catch {
        return null;
    }
}
async function onceConnected(socket) {
    if (socket.connected) {
        return;
    }
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('socket connect timeout')), 5000);
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
async function waitFor(predicate, timeoutMs, label) {
    const startedAt = Date.now();
    while (true) {
        if (await predicate()) {
            return;
        }
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error(`${label} timeout`);
        }
        await delay(100);
    }
}
function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
function throwIfSocketError(error) {
    if (error instanceof Error) {
        throw error;
    }
}
async function deletePlayer(playerId) {
    const response = await fetch(`${SERVER_NEXT_URL}/runtime/players/${playerId}`, {
        method: 'DELETE',
    });
    if (!response.ok && response.status !== 404) {
        throw new Error(`delete player failed: ${response.status} ${await response.text()}`);
    }
}
void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

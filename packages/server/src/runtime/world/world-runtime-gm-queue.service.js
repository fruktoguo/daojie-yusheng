"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeGmQueueService = void 0;

const common_1 = require("@nestjs/common");
const next_gm_constants_1 = require("../../http/next/next-gm.constants");

/** GM runtime queue 服务：承接 GM 命令归一、入队与执行。 */
let WorldRuntimeGmQueueService = class WorldRuntimeGmQueueService {
    nextGmBotSequence = 1;
    pendingSystemCommands = [];
    pendingRespawnPlayerIds = new Set();
    enqueueSystemCommand(command) {
        this.pendingSystemCommands.push(command);
        return { queued: true };
    }
    enqueueGmUpdatePlayer(input) {
        const playerId = typeof input?.playerId === 'string' ? input.playerId.trim() : '';
        if (!playerId) {
            throw new common_1.BadRequestException('playerId is required');
        }
        this.pendingSystemCommands.push({
            kind: 'gmUpdatePlayer',
            playerId,
            mapId: typeof input?.mapId === 'string' ? input.mapId.trim() : '',
            x: Number.isFinite(input?.x) ? Math.trunc(input.x) : undefined,
            y: Number.isFinite(input?.y) ? Math.trunc(input.y) : undefined,
            hp: Number.isFinite(input?.hp) ? Math.trunc(input.hp) : undefined,
            autoBattle: typeof input?.autoBattle === 'boolean' ? input.autoBattle : undefined,
        });
        return { queued: true };
    }
    enqueueGmResetPlayer(playerIdInput) {
        const playerId = typeof playerIdInput === 'string' ? playerIdInput.trim() : '';
        if (!playerId) {
            throw new common_1.BadRequestException('playerId is required');
        }
        this.pendingSystemCommands.push({ kind: 'gmResetPlayer', playerId });
        return { queued: true };
    }
    enqueueGmSpawnBots(anchorPlayerIdInput, countInput) {
        const anchorPlayerId = typeof anchorPlayerIdInput === 'string' ? anchorPlayerIdInput.trim() : '';
        if (!anchorPlayerId) {
            throw new common_1.BadRequestException('anchorPlayerId is required');
        }
        const count = Math.max(0, Math.min(200, Math.trunc(countInput)));
        if (!Number.isFinite(count) || count <= 0) {
            throw new common_1.BadRequestException('count must be greater than 0');
        }
        this.pendingSystemCommands.push({ kind: 'gmSpawnBots', anchorPlayerId, count });
        return { queued: true };
    }
    enqueueGmRemoveBots(playerIdsInput, allInput) {
        const playerIds = Array.isArray(playerIdsInput)
            ? playerIdsInput.filter((entry) => typeof entry === 'string').map((entry) => entry.trim()).filter((entry) => entry.length > 0)
            : [];
        this.pendingSystemCommands.push({ kind: 'gmRemoveBots', playerIds, all: allInput === true });
        return { queued: true };
    }
    markPendingRespawn(playerId) {
        this.pendingRespawnPlayerIds.add(playerId);
    }
    clearPendingRespawn(playerId) {
        this.pendingRespawnPlayerIds.delete(playerId);
    }
    getPendingSystemCommandCount() {
        return this.pendingSystemCommands.length;
    }
    drainPendingSystemCommands() {
        if (this.pendingSystemCommands.length === 0) {
            return [];
        }
        return this.pendingSystemCommands.splice(0, this.pendingSystemCommands.length);
    }
    drainPendingRespawnPlayerIds() {
        if (this.pendingRespawnPlayerIds.size === 0) {
            return [];
        }
        const pending = Array.from(this.pendingRespawnPlayerIds);
        this.pendingRespawnPlayerIds.clear();
        return pending;
    }
    hasPendingRespawns() {
        return this.pendingRespawnPlayerIds.size > 0;
    }
    resetState() {
        this.pendingSystemCommands.length = 0;
        this.pendingRespawnPlayerIds.clear();
    }
    dispatchGmUpdatePlayer(command, deps) {
        const playerId = command.playerId;
        const player = deps.playerRuntimeService.getPlayerOrThrow(playerId);
        const nextMapId = command.mapId || player.templateId || deps.resolveDefaultRespawnMapId();
        const targetInstance = deps.getOrCreatePublicInstance(nextMapId);
        const previous = deps.getPlayerLocation(playerId);
        const sessionId = previous?.sessionId ?? player.sessionId ?? `session:${playerId}`;
        if (!previous) {
            deps.playerRuntimeService.ensurePlayer(playerId, sessionId);
            const runtimePlayer = targetInstance.connectPlayer({ playerId, sessionId, preferredX: command.x, preferredY: command.y });
            targetInstance.setPlayerMoveSpeed(playerId, player.attrs.numericStats.moveSpeed);
            deps.setPlayerLocation(playerId, { instanceId: targetInstance.meta.instanceId, sessionId: runtimePlayer.sessionId });
        }
        else if (previous.instanceId !== targetInstance.meta.instanceId) {
            deps.getInstanceRuntime(previous.instanceId)?.disconnectPlayer(playerId);
            const runtimePlayer = targetInstance.connectPlayer({ playerId, sessionId, preferredX: command.x, preferredY: command.y });
            targetInstance.setPlayerMoveSpeed(playerId, player.attrs.numericStats.moveSpeed);
            deps.setPlayerLocation(playerId, { instanceId: targetInstance.meta.instanceId, sessionId: runtimePlayer.sessionId });
        }
        else if (command.x !== undefined && command.y !== undefined) {
            targetInstance.relocatePlayer(playerId, command.x, command.y);
        }
        const view = deps.getPlayerViewOrThrow(playerId);
        deps.refreshPlayerContextActions(playerId, view);
        deps.playerRuntimeService.syncFromWorldView(playerId, sessionId, view);
        if (command.hp !== undefined) {
            deps.playerRuntimeService.setVitals(playerId, { hp: command.hp });
            deps.playerRuntimeService.deferVitalRecoveryUntilTick(playerId, deps.resolveCurrentTickForPlayerId(playerId));
        }
        if (command.autoBattle !== undefined) {
            deps.playerRuntimeService.updateCombatSettings(playerId, { autoBattle: command.autoBattle }, deps.resolveCurrentTickForPlayerId(playerId));
        }
    }
    dispatchGmSpawnBots(anchorPlayerId, count, deps) {
        const anchor = deps.playerRuntimeService.getPlayerOrThrow(anchorPlayerId);
        for (let index = 0; index < count; index += 1) {
            const sequence = this.nextGmBotSequence++;
            const playerId = `${next_gm_constants_1.NEXT_GM_BOT_ID_PREFIX}${Date.now().toString(36)}_${sequence.toString(36)}`;
            const sessionId = `bot:${playerId}`;
            deps.playerRuntimeService.ensurePlayer(playerId, sessionId);
            deps.playerRuntimeService.setIdentity(playerId, {
                name: `挂机分身${sequence}`,
                displayName: `挂机分身${sequence}`,
            });
            deps.connectPlayer({
                playerId,
                sessionId,
                mapId: anchor.templateId || deps.resolveDefaultRespawnMapId(),
                preferredX: anchor.x,
                preferredY: anchor.y,
            });
            const view = deps.getPlayerViewOrThrow(playerId);
            deps.refreshPlayerContextActions(playerId, view);
            deps.playerRuntimeService.syncFromWorldView(playerId, sessionId, view);
            deps.playerRuntimeService.updateCombatSettings(playerId, { autoBattle: true, autoRetaliate: true }, deps.resolveCurrentTickForPlayerId(playerId));
        }
    }
    dispatchGmRemoveBots(playerIds, removeAll, deps) {
        const requestedIds = Array.isArray(playerIds)
            ? playerIds.filter((entry) => typeof entry === 'string' && (0, next_gm_constants_1.isNextGmBotPlayerId)(entry))
            : [];
        const targets = removeAll
            ? deps.playerRuntimeService.listPlayerSnapshots().map((player) => player.playerId).filter((playerId) => (0, next_gm_constants_1.isNextGmBotPlayerId)(playerId))
            : requestedIds;
        for (const playerId of targets) {
            deps.removePlayer(playerId);
        }
    }
};
exports.WorldRuntimeGmQueueService = WorldRuntimeGmQueueService;
exports.WorldRuntimeGmQueueService = WorldRuntimeGmQueueService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimeGmQueueService);

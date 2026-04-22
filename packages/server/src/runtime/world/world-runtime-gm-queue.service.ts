// @ts-nocheck
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
const next_gm_constants_1 = require("../../http/native/native-gm.constants");

/** GM runtime queue 服务：承接 GM 命令归一、入队与执行。 */
let WorldRuntimeGmQueueService = class WorldRuntimeGmQueueService {
/**
 * nextGmBotSequence：nextGMBotSequence相关字段。
 */

    nextGmBotSequence = 1;    
    /**
 * pendingSystemCommands：pendingSystemCommand相关字段。
 */

    pendingSystemCommands = [];    
    /**
 * pendingRespawnPlayerIds：pending重生玩家ID相关字段。
 */

    pendingRespawnPlayerIds = new Set();    
    /**
 * enqueueSystemCommand：处理SystemCommand并更新相关状态。
 * @param command 输入指令。
 * @returns 无返回值，直接更新SystemCommand相关状态。
 */

    enqueueSystemCommand(command) {
        this.pendingSystemCommands.push(command);
        return { queued: true };
    }    
    /**
 * enqueueGmUpdatePlayer：处理GMUpdate玩家并更新相关状态。
 * @param input 输入参数。
 * @returns 无返回值，直接更新GMUpdate玩家相关状态。
 */

    enqueueGmUpdatePlayer(input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = typeof input?.playerId === 'string' ? input.playerId.trim() : '';
        if (!playerId) {
            throw new common_1.BadRequestException('playerId is required');
        }
        this.pendingSystemCommands.push({
            kind: 'gmUpdatePlayer',
            playerId,
            instanceId: typeof input?.instanceId === 'string' ? input.instanceId.trim() : '',
            mapId: typeof input?.mapId === 'string' ? input.mapId.trim() : '',
            x: Number.isFinite(input?.x) ? Math.trunc(input.x) : undefined,
            y: Number.isFinite(input?.y) ? Math.trunc(input.y) : undefined,
            hp: Number.isFinite(input?.hp) ? Math.trunc(input.hp) : undefined,
            autoBattle: typeof input?.autoBattle === 'boolean' ? input.autoBattle : undefined,
        });
        return { queued: true };
    }    
    /**
 * enqueueGmResetPlayer：处理GMReset玩家并更新相关状态。
 * @param playerIdInput 参数说明。
 * @returns 无返回值，直接更新GMReset玩家相关状态。
 */

    enqueueGmResetPlayer(playerIdInput) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = typeof playerIdInput === 'string' ? playerIdInput.trim() : '';
        if (!playerId) {
            throw new common_1.BadRequestException('playerId is required');
        }
        this.pendingSystemCommands.push({ kind: 'gmResetPlayer', playerId });
        return { queued: true };
    }    
    /**
 * enqueueGmSpawnBots：处理GMSpawnBot并更新相关状态。
 * @param anchorPlayerIdInput 参数说明。
 * @param countInput 参数说明。
 * @returns 无返回值，直接更新GMSpawnBot相关状态。
 */

    enqueueGmSpawnBots(anchorPlayerIdInput, countInput) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * enqueueGmRemoveBots：处理GMRemoveBot并更新相关状态。
 * @param playerIdsInput 参数说明。
 * @param allInput 参数说明。
 * @returns 无返回值，直接更新GMRemoveBot相关状态。
 */

    enqueueGmRemoveBots(playerIdsInput, allInput) {
        const playerIds = Array.isArray(playerIdsInput)
            ? playerIdsInput.filter((entry) => typeof entry === 'string').map((entry) => entry.trim()).filter((entry) => entry.length > 0)
            : [];
        this.pendingSystemCommands.push({ kind: 'gmRemoveBots', playerIds, all: allInput === true });
        return { queued: true };
    }    
    /**
 * markPendingRespawn：处理待处理重生并更新相关状态。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新Pending重生相关状态。
 */

    markPendingRespawn(playerId) {
        this.pendingRespawnPlayerIds.add(playerId);
    }    
    /**
 * clearPendingRespawn：执行clear待处理重生相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新clearPending重生相关状态。
 */

    clearPendingRespawn(playerId) {
        this.pendingRespawnPlayerIds.delete(playerId);
    }    
    /**
 * getPendingSystemCommandCount：读取待处理SystemCommand数量。
 * @returns 无返回值，完成PendingSystemCommand数量的读取/组装。
 */

    getPendingSystemCommandCount() {
        return this.pendingSystemCommands.length;
    }    
    /**
 * drainPendingSystemCommands：执行drain待处理SystemCommand相关逻辑。
 * @returns 无返回值，直接更新drainPendingSystemCommand相关状态。
 */

    drainPendingSystemCommands() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (this.pendingSystemCommands.length === 0) {
            return [];
        }
        return this.pendingSystemCommands.splice(0, this.pendingSystemCommands.length);
    }    
    /**
 * drainPendingRespawnPlayerIds：执行drain待处理重生玩家ID相关逻辑。
 * @returns 无返回值，直接更新drainPending重生玩家ID相关状态。
 */

    drainPendingRespawnPlayerIds() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (this.pendingRespawnPlayerIds.size === 0) {
            return [];
        }
        const pending = Array.from(this.pendingRespawnPlayerIds);
        this.pendingRespawnPlayerIds.clear();
        return pending;
    }    
    /**
 * hasPendingRespawns：判断待处理重生是否满足条件。
 * @returns 无返回值，完成Pending重生的条件判断。
 */

  hasPendingRespawns() {
    return this.pendingRespawnPlayerIds.size > 0;
  }    
  /**
 * hasPendingRespawn：判断指定玩家是否处于待复生队列。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成指定玩家待复生条件判断。
 */

  hasPendingRespawn(playerId: string) {
    const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
    if (!normalizedPlayerId) {
      return false;
    }
    return this.pendingRespawnPlayerIds.has(normalizedPlayerId);
  }    
  /**
 * resetState：执行reset状态相关逻辑。
 * @returns 无返回值，直接更新reset状态相关状态。
 */

    resetState() {
        this.pendingSystemCommands.length = 0;
        this.pendingRespawnPlayerIds.clear();
    }    
    /**
 * dispatchGmUpdatePlayer：判断GMUpdate玩家是否满足条件。
 * @param command 输入指令。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新GMUpdate玩家相关状态。
 */

    dispatchGmUpdatePlayer(command, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = command.playerId;
        const player = deps.playerRuntimeService.getPlayerOrThrow(playerId);
        const requestedInstanceId = typeof command.instanceId === 'string' ? command.instanceId.trim() : '';
        const targetInstance = requestedInstanceId
            ? deps.getInstanceRuntime(requestedInstanceId)
            : null;
        if (requestedInstanceId && !targetInstance) {
            throw new common_1.BadRequestException(`instanceId not found: ${requestedInstanceId}`);
        }
        const nextMapId = command.mapId || player.templateId || deps.resolveDefaultRespawnMapId();
        const resolvedTargetInstance = targetInstance ?? deps.getOrCreatePublicInstance(nextMapId);
        const previous = deps.getPlayerLocation(playerId);
        const sessionId = previous?.sessionId ?? player.sessionId ?? `session:${playerId}`;
        if (!previous) {
            deps.playerRuntimeService.ensurePlayer(playerId, sessionId);
            const runtimePlayer = resolvedTargetInstance.connectPlayer({ playerId, sessionId, preferredX: command.x, preferredY: command.y });
            resolvedTargetInstance.setPlayerMoveSpeed(playerId, player.attrs.numericStats.moveSpeed);
            deps.setPlayerLocation(playerId, { instanceId: resolvedTargetInstance.meta.instanceId, sessionId: runtimePlayer.sessionId });
        }
        else if (previous.instanceId !== resolvedTargetInstance.meta.instanceId) {
            deps.getInstanceRuntime(previous.instanceId)?.disconnectPlayer(playerId);
            const runtimePlayer = resolvedTargetInstance.connectPlayer({ playerId, sessionId, preferredX: command.x, preferredY: command.y });
            resolvedTargetInstance.setPlayerMoveSpeed(playerId, player.attrs.numericStats.moveSpeed);
            deps.setPlayerLocation(playerId, { instanceId: resolvedTargetInstance.meta.instanceId, sessionId: runtimePlayer.sessionId });
        }
        else if (command.x !== undefined && command.y !== undefined) {
            resolvedTargetInstance.relocatePlayer(playerId, command.x, command.y);
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
    /**
 * dispatchGmSpawnBots：判断GMSpawnBot是否满足条件。
 * @param anchorPlayerId anchorPlayer ID。
 * @param count 数量。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新GMSpawnBot相关状态。
 */

    dispatchGmSpawnBots(anchorPlayerId, count, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const anchor = deps.playerRuntimeService.getPlayerOrThrow(anchorPlayerId);
        for (let index = 0; index < count; index += 1) {
            const sequence = this.nextGmBotSequence++;
            const playerId = `${next_gm_constants_1.NATIVE_GM_BOT_ID_PREFIX}${Date.now().toString(36)}_${sequence.toString(36)}`;
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
    /**
 * dispatchGmRemoveBots：判断GMRemoveBot是否满足条件。
 * @param playerIds player ID 集合。
 * @param removeAll 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新GMRemoveBot相关状态。
 */

    dispatchGmRemoveBots(playerIds, removeAll, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const requestedIds = Array.isArray(playerIds)
            ? playerIds.filter((entry) => typeof entry === 'string' && (0, next_gm_constants_1.isNativeGmBotPlayerId)(entry))
            : [];
        const targets = removeAll
            ? deps.playerRuntimeService.listPlayerSnapshots().map((player) => player.playerId).filter((playerId) => (0, next_gm_constants_1.isNativeGmBotPlayerId)(playerId))
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

export { WorldRuntimeGmQueueService };

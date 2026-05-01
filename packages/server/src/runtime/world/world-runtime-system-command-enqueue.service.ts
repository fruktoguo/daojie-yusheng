// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") {
        r = Reflect.decorate(decorators, target, key, desc);
    }
    else {
        for (var i = decorators.length - 1; i >= 0; i--) {
            if (d = decorators[i]) {
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
            }
        }
    }
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") {
        return Reflect.metadata(k, v);
    }
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeSystemCommandEnqueueService = void 0;

const common_1 = require("@nestjs/common");
const world_runtime_gm_queue_service_1 = require("./world-runtime-gm-queue.service");
const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");

const { normalizeCoordinate, normalizeRollCount } = world_runtime_normalization_helpers_1;

/** world-runtime system-command enqueue orchestration：承接系统/GM 命令入队前的校验与归一化。 */
let WorldRuntimeSystemCommandEnqueueService = class WorldRuntimeSystemCommandEnqueueService {
/**
 * worldRuntimeGmQueueService：世界运行态GMQueue服务引用。
 */

    worldRuntimeGmQueueService;
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldRuntimeGmQueueService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(worldRuntimeGmQueueService) {
        this.worldRuntimeGmQueueService = worldRuntimeGmQueueService;
    }
    /**
 * enqueueSpawnMonsterLoot：处理Spawn怪物掉落并更新相关状态。
 * @param instanceIdInput 参数说明。
 * @param monsterIdInput 参数说明。
 * @param xInput 参数说明。
 * @param yInput 参数说明。
 * @param rollsInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Spawn怪物掉落相关状态。
 */

    enqueueSpawnMonsterLoot(instanceIdInput, monsterIdInput, xInput, yInput, rollsInput, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const instanceId = typeof instanceIdInput === 'string' ? instanceIdInput.trim() : '';
        const monsterId = typeof monsterIdInput === 'string' ? monsterIdInput.trim() : '';
        if (!instanceId) {
            throw new common_1.BadRequestException('地图实例 ID 不能为空');
        }
        if (!monsterId) {
            throw new common_1.BadRequestException('妖兽 ID 不能为空');
        }
        deps.getInstanceRuntimeOrThrow(instanceId);
        return this.worldRuntimeGmQueueService.enqueueSystemCommand({
            kind: 'spawnMonsterLoot',
            instanceId,
            monsterId,
            x: normalizeCoordinate(xInput, 'x'),
            y: normalizeCoordinate(yInput, 'y'),
            rolls: normalizeRollCount(rollsInput),
        });
    }
    /**
 * enqueueDefeatMonster：处理Defeat怪物并更新相关状态。
 * @param instanceIdInput 参数说明。
 * @param runtimeIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Defeat怪物相关状态。
 */

    enqueueDefeatMonster(instanceIdInput, runtimeIdInput, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const instanceId = typeof instanceIdInput === 'string' ? instanceIdInput.trim() : '';
        const runtimeId = typeof runtimeIdInput === 'string' ? runtimeIdInput.trim() : '';
        if (!instanceId) {
            throw new common_1.BadRequestException('地图实例 ID 不能为空');
        }
        if (!runtimeId) {
            throw new common_1.BadRequestException('运行时 ID 不能为空');
        }
        deps.getInstanceRuntimeOrThrow(instanceId);
        return this.worldRuntimeGmQueueService.enqueueSystemCommand({
            kind: 'defeatMonster',
            instanceId,
            runtimeId,
        });
    }
    /**
 * enqueueDamageMonster：处理Damage怪物并更新相关状态。
 * @param instanceIdInput 参数说明。
 * @param runtimeIdInput 参数说明。
 * @param amountInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Damage怪物相关状态。
 */

    enqueueDamageMonster(instanceIdInput, runtimeIdInput, amountInput, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const instanceId = typeof instanceIdInput === 'string' ? instanceIdInput.trim() : '';
        const runtimeId = typeof runtimeIdInput === 'string' ? runtimeIdInput.trim() : '';
        if (!instanceId) {
            throw new common_1.BadRequestException('地图实例 ID 不能为空');
        }
        if (!runtimeId) {
            throw new common_1.BadRequestException('运行时 ID 不能为空');
        }

        const amount = Math.max(1, Math.trunc(amountInput));
        if (!Number.isFinite(amount)) {
            throw new common_1.BadRequestException('数量不能为空');
        }
        deps.getInstanceRuntimeOrThrow(instanceId);
        return this.worldRuntimeGmQueueService.enqueueSystemCommand({
            kind: 'damageMonster',
            instanceId,
            runtimeId,
            amount,
        });
    }
    /**
 * enqueueDamagePlayer：处理Damage玩家并更新相关状态。
 * @param playerIdInput 参数说明。
 * @param amountInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Damage玩家相关状态。
 */

    enqueueDamagePlayer(playerIdInput, amountInput, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = typeof playerIdInput === 'string' ? playerIdInput.trim() : '';
        if (!playerId) {
            throw new common_1.BadRequestException('玩家 ID 不能为空');
        }

        const amount = Math.max(1, Math.trunc(amountInput));
        if (!Number.isFinite(amount)) {
            throw new common_1.BadRequestException('数量不能为空');
        }
        deps.getPlayerLocationOrThrow(playerId);
        return this.worldRuntimeGmQueueService.enqueueSystemCommand({
            kind: 'damagePlayer',
            playerId,
            amount,
        });
    }
    /**
 * enqueueRespawnPlayer：处理重生玩家并更新相关状态。
 * @param playerIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新重生玩家相关状态。
 */

    enqueueRespawnPlayer(playerIdInput, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = typeof playerIdInput === 'string' ? playerIdInput.trim() : '';
        if (!playerId) {
            throw new common_1.BadRequestException('玩家 ID 不能为空');
        }
        deps.getPlayerLocationOrThrow(playerId);
        return this.worldRuntimeGmQueueService.enqueueSystemCommand({
            kind: 'respawnPlayer',
            playerId,
        });
    }
    /**
 * enqueueResetPlayerSpawn：处理Reset玩家Spawn并更新相关状态。
 * @param playerIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Reset玩家Spawn相关状态。
 */

    enqueueResetPlayerSpawn(playerIdInput, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = typeof playerIdInput === 'string' ? playerIdInput.trim() : '';
        if (!playerId) {
            throw new common_1.BadRequestException('玩家 ID 不能为空');
        }
        deps.getPlayerLocationOrThrow(playerId);
        return this.worldRuntimeGmQueueService.enqueueSystemCommand({
            kind: 'resetPlayerSpawn',
            playerId,
        });
    }
    /**
 * enqueueReturnToSpawn：处理遁返到复活点并更新相关状态。
 * @param playerIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新遁返相关状态。
 */

    enqueueReturnToSpawn(playerIdInput, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = typeof playerIdInput === 'string' ? playerIdInput.trim() : '';
        if (!playerId) {
            throw new common_1.BadRequestException('玩家 ID 不能为空');
        }
        deps.getPlayerLocationOrThrow(playerId);
        return this.worldRuntimeGmQueueService.enqueueSystemCommand({
            kind: 'returnToSpawn',
            playerId,
        });
    }
    /**
 * enqueueGmUpdatePlayer：处理GMUpdate玩家并更新相关状态。
 * @param input 输入参数。
 * @returns 无返回值，直接更新GMUpdate玩家相关状态。
 */

    enqueueGmUpdatePlayer(input) {
        return this.worldRuntimeGmQueueService.enqueueGmUpdatePlayer(input);
    }
    /**
 * enqueueGmResetPlayer：处理GMReset玩家并更新相关状态。
 * @param playerIdInput 参数说明。
 * @returns 无返回值，直接更新GMReset玩家相关状态。
 */

    enqueueGmResetPlayer(playerIdInput) {
        return this.worldRuntimeGmQueueService.enqueueGmResetPlayer(playerIdInput);
    }
    /**
 * enqueueGmSpawnBots：处理GMSpawnBot并更新相关状态。
 * @param anchorPlayerIdInput 参数说明。
 * @param countInput 参数说明。
 * @returns 无返回值，直接更新GMSpawnBot相关状态。
 */

    enqueueGmSpawnBots(anchorPlayerIdInput, countInput) {
        return this.worldRuntimeGmQueueService.enqueueGmSpawnBots(anchorPlayerIdInput, countInput);
    }
    /**
 * enqueueGmRemoveBots：处理GMRemoveBot并更新相关状态。
 * @param playerIdsInput 参数说明。
 * @param allInput 参数说明。
 * @returns 无返回值，直接更新GMRemoveBot相关状态。
 */

    enqueueGmRemoveBots(playerIdsInput, allInput) {
        return this.worldRuntimeGmQueueService.enqueueGmRemoveBots(playerIdsInput, allInput);
    }
};
exports.WorldRuntimeSystemCommandEnqueueService = WorldRuntimeSystemCommandEnqueueService;
exports.WorldRuntimeSystemCommandEnqueueService = WorldRuntimeSystemCommandEnqueueService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_runtime_gm_queue_service_1.WorldRuntimeGmQueueService])
], WorldRuntimeSystemCommandEnqueueService);

export { WorldRuntimeSystemCommandEnqueueService };

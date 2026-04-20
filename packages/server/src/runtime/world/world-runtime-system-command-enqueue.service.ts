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
 * worldRuntimeGmQueueService：对象字段。
 */

    worldRuntimeGmQueueService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldRuntimeGmQueueService 参数说明。
 * @returns 无返回值（构造函数）。
 */

    constructor(worldRuntimeGmQueueService) {
        this.worldRuntimeGmQueueService = worldRuntimeGmQueueService;
    }    
    /**
 * enqueueSpawnMonsterLoot：执行核心业务逻辑。
 * @param instanceIdInput 参数说明。
 * @param monsterIdInput 参数说明。
 * @param xInput 参数说明。
 * @param yInput 参数说明。
 * @param rollsInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueSpawnMonsterLoot(instanceIdInput, monsterIdInput, xInput, yInput, rollsInput, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const instanceId = typeof instanceIdInput === 'string' ? instanceIdInput.trim() : '';
        const monsterId = typeof monsterIdInput === 'string' ? monsterIdInput.trim() : '';
        if (!instanceId) {
            throw new common_1.BadRequestException('instanceId is required');
        }
        if (!monsterId) {
            throw new common_1.BadRequestException('monsterId is required');
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
 * enqueueDefeatMonster：执行核心业务逻辑。
 * @param instanceIdInput 参数说明。
 * @param runtimeIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueDefeatMonster(instanceIdInput, runtimeIdInput, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const instanceId = typeof instanceIdInput === 'string' ? instanceIdInput.trim() : '';
        const runtimeId = typeof runtimeIdInput === 'string' ? runtimeIdInput.trim() : '';
        if (!instanceId) {
            throw new common_1.BadRequestException('instanceId is required');
        }
        if (!runtimeId) {
            throw new common_1.BadRequestException('runtimeId is required');
        }
        deps.getInstanceRuntimeOrThrow(instanceId);
        return this.worldRuntimeGmQueueService.enqueueSystemCommand({
            kind: 'defeatMonster',
            instanceId,
            runtimeId,
        });
    }    
    /**
 * enqueueDamageMonster：执行核心业务逻辑。
 * @param instanceIdInput 参数说明。
 * @param runtimeIdInput 参数说明。
 * @param amountInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueDamageMonster(instanceIdInput, runtimeIdInput, amountInput, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const instanceId = typeof instanceIdInput === 'string' ? instanceIdInput.trim() : '';
        const runtimeId = typeof runtimeIdInput === 'string' ? runtimeIdInput.trim() : '';
        if (!instanceId) {
            throw new common_1.BadRequestException('instanceId is required');
        }
        if (!runtimeId) {
            throw new common_1.BadRequestException('runtimeId is required');
        }

        const amount = Math.max(1, Math.trunc(amountInput));
        if (!Number.isFinite(amount)) {
            throw new common_1.BadRequestException('amount is required');
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
 * enqueueDamagePlayer：执行核心业务逻辑。
 * @param playerIdInput 参数说明。
 * @param amountInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueDamagePlayer(playerIdInput, amountInput, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = typeof playerIdInput === 'string' ? playerIdInput.trim() : '';
        if (!playerId) {
            throw new common_1.BadRequestException('playerId is required');
        }

        const amount = Math.max(1, Math.trunc(amountInput));
        if (!Number.isFinite(amount)) {
            throw new common_1.BadRequestException('amount is required');
        }
        deps.getPlayerLocationOrThrow(playerId);
        return this.worldRuntimeGmQueueService.enqueueSystemCommand({
            kind: 'damagePlayer',
            playerId,
            amount,
        });
    }    
    /**
 * enqueueRespawnPlayer：执行核心业务逻辑。
 * @param playerIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueRespawnPlayer(playerIdInput, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = typeof playerIdInput === 'string' ? playerIdInput.trim() : '';
        if (!playerId) {
            throw new common_1.BadRequestException('playerId is required');
        }
        deps.getPlayerLocationOrThrow(playerId);
        return this.worldRuntimeGmQueueService.enqueueSystemCommand({
            kind: 'respawnPlayer',
            playerId,
        });
    }    
    /**
 * enqueueResetPlayerSpawn：执行核心业务逻辑。
 * @param playerIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueResetPlayerSpawn(playerIdInput, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = typeof playerIdInput === 'string' ? playerIdInput.trim() : '';
        if (!playerId) {
            throw new common_1.BadRequestException('playerId is required');
        }
        deps.getPlayerLocationOrThrow(playerId);
        return this.worldRuntimeGmQueueService.enqueueSystemCommand({
            kind: 'resetPlayerSpawn',
            playerId,
        });
    }    
    /**
 * enqueueGmUpdatePlayer：执行核心业务逻辑。
 * @param input 输入参数。
 * @returns 函数返回值。
 */

    enqueueGmUpdatePlayer(input) {
        return this.worldRuntimeGmQueueService.enqueueGmUpdatePlayer(input);
    }    
    /**
 * enqueueGmResetPlayer：执行核心业务逻辑。
 * @param playerIdInput 参数说明。
 * @returns 函数返回值。
 */

    enqueueGmResetPlayer(playerIdInput) {
        return this.worldRuntimeGmQueueService.enqueueGmResetPlayer(playerIdInput);
    }    
    /**
 * enqueueGmSpawnBots：执行核心业务逻辑。
 * @param anchorPlayerIdInput 参数说明。
 * @param countInput 参数说明。
 * @returns 函数返回值。
 */

    enqueueGmSpawnBots(anchorPlayerIdInput, countInput) {
        return this.worldRuntimeGmQueueService.enqueueGmSpawnBots(anchorPlayerIdInput, countInput);
    }    
    /**
 * enqueueGmRemoveBots：执行核心业务逻辑。
 * @param playerIdsInput 参数说明。
 * @param allInput 参数说明。
 * @returns 函数返回值。
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

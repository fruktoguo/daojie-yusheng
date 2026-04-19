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
    worldRuntimeGmQueueService;
    constructor(worldRuntimeGmQueueService) {
        this.worldRuntimeGmQueueService = worldRuntimeGmQueueService;
    }
    enqueueSpawnMonsterLoot(instanceIdInput, monsterIdInput, xInput, yInput, rollsInput, deps) {
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
    enqueueDefeatMonster(instanceIdInput, runtimeIdInput, deps) {
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
    enqueueDamageMonster(instanceIdInput, runtimeIdInput, amountInput, deps) {
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
    enqueueDamagePlayer(playerIdInput, amountInput, deps) {
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
    enqueueRespawnPlayer(playerIdInput, deps) {
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
    enqueueResetPlayerSpawn(playerIdInput, deps) {
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
    enqueueGmUpdatePlayer(input) {
        return this.worldRuntimeGmQueueService.enqueueGmUpdatePlayer(input);
    }
    enqueueGmResetPlayer(playerIdInput) {
        return this.worldRuntimeGmQueueService.enqueueGmResetPlayer(playerIdInput);
    }
    enqueueGmSpawnBots(anchorPlayerIdInput, countInput) {
        return this.worldRuntimeGmQueueService.enqueueGmSpawnBots(anchorPlayerIdInput, countInput);
    }
    enqueueGmRemoveBots(playerIdsInput, allInput) {
        return this.worldRuntimeGmQueueService.enqueueGmRemoveBots(playerIdsInput, allInput);
    }
};
exports.WorldRuntimeSystemCommandEnqueueService = WorldRuntimeSystemCommandEnqueueService;
exports.WorldRuntimeSystemCommandEnqueueService = WorldRuntimeSystemCommandEnqueueService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_runtime_gm_queue_service_1.WorldRuntimeGmQueueService])
], WorldRuntimeSystemCommandEnqueueService);

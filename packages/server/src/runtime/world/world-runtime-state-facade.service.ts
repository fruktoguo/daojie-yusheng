// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeStateFacadeService = void 0;

const common_1 = require("@nestjs/common");

/** world-runtime state facade：承接 pending/player-location/instance-registry 薄访问层。 */
let WorldRuntimeStateFacadeService = class WorldRuntimeStateFacadeService {
/**
 * enqueuePendingCommand：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueuePendingCommand(playerId, command, deps) {
        deps.worldRuntimePendingCommandService.enqueuePendingCommand(playerId, command);
    }    
    /**
 * getPendingCommand：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    getPendingCommand(playerId, deps) {
        return deps.worldRuntimePendingCommandService.getPendingCommand(playerId);
    }    
    /**
 * hasPendingCommand：执行状态校验并返回判断结果。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    hasPendingCommand(playerId, deps) {
        return deps.worldRuntimePendingCommandService.hasPendingCommand(playerId);
    }    
    /**
 * clearPendingCommand：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    clearPendingCommand(playerId, deps) {
        deps.worldRuntimePendingCommandService.clearPendingCommand(playerId);
    }    
    /**
 * getPendingCommandCount：按给定条件读取/查询数据。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    getPendingCommandCount(deps) {
        return deps.worldRuntimePendingCommandService.getPendingCommandCount();
    }    
    /**
 * getPlayerLocation：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    getPlayerLocation(playerId, deps) {
        return deps.worldRuntimePlayerLocationService.getPlayerLocation(playerId);
    }    
    /**
 * setPlayerLocation：更新/写入相关状态。
 * @param playerId 玩家 ID。
 * @param location 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    setPlayerLocation(playerId, location, deps) {
        deps.worldRuntimePlayerLocationService.setPlayerLocation(playerId, location);
    }    
    /**
 * clearPlayerLocation：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    clearPlayerLocation(playerId, deps) {
        deps.worldRuntimePlayerLocationService.clearPlayerLocation(playerId);
    }    
    /**
 * getPlayerLocationCount：按给定条件读取/查询数据。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    getPlayerLocationCount(deps) {
        return deps.worldRuntimePlayerLocationService.getPlayerLocationCount();
    }    
    /**
 * listConnectedPlayerIds：执行核心业务逻辑。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    listConnectedPlayerIds(deps) {
        return deps.worldRuntimePlayerLocationService.listConnectedPlayerIds();
    }    
    /**
 * getInstanceRuntime：按给定条件读取/查询数据。
 * @param instanceId instance ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    getInstanceRuntime(instanceId, deps) {
        return deps.worldRuntimeInstanceStateService.getInstanceRuntime(instanceId);
    }    
    /**
 * setInstanceRuntime：更新/写入相关状态。
 * @param instanceId instance ID。
 * @param instance 地图实例。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    setInstanceRuntime(instanceId, instance, deps) {
        deps.worldRuntimeInstanceStateService.setInstanceRuntime(instanceId, instance);
    }    
    /**
 * listInstanceRuntimes：执行核心业务逻辑。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    listInstanceRuntimes(deps) {
        return deps.worldRuntimeInstanceStateService.listInstanceRuntimes();
    }    
    /**
 * listInstanceEntries：执行核心业务逻辑。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    listInstanceEntries(deps) {
        return deps.worldRuntimeInstanceStateService.listInstanceEntries();
    }    
    /**
 * getInstanceCount：按给定条件读取/查询数据。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    getInstanceCount(deps) {
        return deps.worldRuntimeInstanceStateService.getInstanceCount();
    }    
    /**
 * listDirtyPersistentInstances：执行核心业务逻辑。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    listDirtyPersistentInstances(deps) {
        return deps.worldRuntimePersistenceStateService.listDirtyPersistentInstances(deps);
    }    
    /**
 * buildMapPersistenceSnapshot：构建并返回目标对象。
 * @param instanceId instance ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    buildMapPersistenceSnapshot(instanceId, deps) {
        return deps.worldRuntimePersistenceStateService.buildMapPersistenceSnapshot(instanceId, deps);
    }    
    /**
 * markMapPersisted：执行核心业务逻辑。
 * @param instanceId instance ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    markMapPersisted(instanceId, deps) {
        deps.worldRuntimePersistenceStateService.markMapPersisted(instanceId, deps);
    }    
    /**
 * tickAll：执行核心业务逻辑。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    tickAll(deps) {
        return deps.worldRuntimeFrameService.tickAll(deps);
    }    
    /**
 * advanceFrame：执行核心业务逻辑。
 * @param frameDurationMs 参数说明。
 * @param getInstanceTickSpeed 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    advanceFrame(frameDurationMs, getInstanceTickSpeed, deps) {
        return deps.worldRuntimeFrameService.advanceFrame(deps, frameDurationMs, getInstanceTickSpeed);
    }    
    /**
 * recordSyncFlushDuration：执行核心业务逻辑。
 * @param durationMs 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    recordSyncFlushDuration(durationMs, deps) {
        deps.worldRuntimeFrameService.recordSyncFlushDuration(durationMs);
    }    
    /**
 * bootstrapPublicInstances：执行核心业务逻辑。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    bootstrapPublicInstances(deps) {
        deps.worldRuntimeLifecycleService.bootstrapPublicInstances(deps);
    }    
    /**
 * restorePublicInstancePersistence：执行核心业务逻辑。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    async restorePublicInstancePersistence(deps) {
        await deps.worldRuntimeLifecycleService.restorePublicInstancePersistence(deps);
    }    
    /**
 * rebuildPersistentRuntimeAfterRestore：执行核心业务逻辑。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    async rebuildPersistentRuntimeAfterRestore(deps) {
        await deps.worldRuntimeLifecycleService.rebuildPersistentRuntimeAfterRestore(deps);
    }
};
exports.WorldRuntimeStateFacadeService = WorldRuntimeStateFacadeService;
exports.WorldRuntimeStateFacadeService = WorldRuntimeStateFacadeService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimeStateFacadeService);

export { WorldRuntimeStateFacadeService };

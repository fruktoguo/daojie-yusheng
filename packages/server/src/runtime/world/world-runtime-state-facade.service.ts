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
 * enqueuePendingCommand：处理待处理Command并更新相关状态。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新PendingCommand相关状态。
 */

    enqueuePendingCommand(playerId, command, deps) {
        deps.worldRuntimePendingCommandService.enqueuePendingCommand(playerId, command);
    }    
    /**
 * getPendingCommand：读取待处理Command。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成PendingCommand的读取/组装。
 */

    getPendingCommand(playerId, deps) {
        return deps.worldRuntimePendingCommandService.getPendingCommand(playerId);
    }    
    /**
 * hasPendingCommand：判断待处理Command是否满足条件。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成PendingCommand的条件判断。
 */

    hasPendingCommand(playerId, deps) {
        return deps.worldRuntimePendingCommandService.hasPendingCommand(playerId);
    }    
    /**
 * clearPendingCommand：执行clear待处理Command相关逻辑。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新clearPendingCommand相关状态。
 */

    clearPendingCommand(playerId, deps) {
        deps.worldRuntimePendingCommandService.clearPendingCommand(playerId);
    }    
    /**
 * getPendingCommandCount：读取待处理Command数量。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成PendingCommand数量的读取/组装。
 */

    getPendingCommandCount(deps) {
        return deps.worldRuntimePendingCommandService.getPendingCommandCount();
    }    
    /**
 * getPlayerLocation：读取玩家位置。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成玩家位置的读取/组装。
 */

    getPlayerLocation(playerId, deps) {
        return deps.worldRuntimePlayerLocationService.getPlayerLocation(playerId);
    }    
    /**
 * setPlayerLocation：写入玩家位置。
 * @param playerId 玩家 ID。
 * @param location 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新玩家位置相关状态。
 */

    setPlayerLocation(playerId, location, deps) {
        deps.worldRuntimePlayerLocationService.setPlayerLocation(playerId, location);
    }    
    /**
 * clearPlayerLocation：执行clear玩家位置相关逻辑。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新clear玩家位置相关状态。
 */

    clearPlayerLocation(playerId, deps) {
        deps.worldRuntimePlayerLocationService.clearPlayerLocation(playerId);
    }    
    /**
 * getPlayerLocationCount：读取玩家位置数量。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成玩家位置数量的读取/组装。
 */

    getPlayerLocationCount(deps) {
        return deps.worldRuntimePlayerLocationService.getPlayerLocationCount();
    }    
    /**
 * listConnectedPlayerIds：读取Connected玩家ID并返回结果。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成Connected玩家ID的读取/组装。
 */

    listConnectedPlayerIds(deps) {
        return deps.worldRuntimePlayerLocationService.listConnectedPlayerIds();
    }    
    /**
 * getInstanceRuntime：读取Instance运行态。
 * @param instanceId instance ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成Instance运行态的读取/组装。
 */

    getInstanceRuntime(instanceId, deps) {
        return deps.worldRuntimeInstanceStateService.getInstanceRuntime(instanceId);
    }    
    /**
 * setInstanceRuntime：写入Instance运行态。
 * @param instanceId instance ID。
 * @param instance 地图实例。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Instance运行态相关状态。
 */

    setInstanceRuntime(instanceId, instance, deps) {
        deps.worldRuntimeInstanceStateService.setInstanceRuntime(instanceId, instance);
    }    
    /**
 * listInstanceRuntimes：读取Instance运行态并返回结果。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成Instance运行态的读取/组装。
 */

    listInstanceRuntimes(deps) {
        return deps.worldRuntimeInstanceStateService.listInstanceRuntimes();
    }    
    /**
 * listInstanceEntries：读取Instance条目并返回结果。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成Instance条目的读取/组装。
 */

    listInstanceEntries(deps) {
        return deps.worldRuntimeInstanceStateService.listInstanceEntries();
    }    
    /**
 * getInstanceCount：读取Instance数量。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成Instance数量的读取/组装。
 */

    getInstanceCount(deps) {
        return deps.worldRuntimeInstanceStateService.getInstanceCount();
    }    
    /**
 * listDirtyPersistentInstances：读取DirtyPersistentInstance并返回结果。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成DirtyPersistentInstance的读取/组装。
 */

    listDirtyPersistentInstances(deps) {
        return deps.worldRuntimePersistenceStateService.listDirtyPersistentInstances(deps);
    }    
    /**
 * buildMapPersistenceSnapshot：构建并返回目标对象。
 * @param instanceId instance ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新地图Persistence快照相关状态。
 */

    buildMapPersistenceSnapshot(instanceId, deps) {
        return deps.worldRuntimePersistenceStateService.buildMapPersistenceSnapshot(instanceId, deps);
    }    
    /**
 * markMapPersisted：判断地图Persisted是否满足条件。
 * @param instanceId instance ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新地图Persisted相关状态。
 */

    markMapPersisted(instanceId, deps) {
        deps.worldRuntimePersistenceStateService.markMapPersisted(instanceId, deps);
    }    
    /**
 * tickAll：执行tickAll相关逻辑。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新tickAll相关状态。
 */

    async tickAll(deps) {
        return deps.worldRuntimeFrameService.tickAll(deps);
    }    
    /**
 * advanceFrame：执行advance帧相关逻辑。
 * @param frameDurationMs 参数说明。
 * @param getInstanceTickSpeed 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新advance帧相关状态。
 */

    async advanceFrame(frameDurationMs, getInstanceTickSpeed, deps) {
        return deps.worldRuntimeFrameService.advanceFrame(deps, frameDurationMs, getInstanceTickSpeed);
    }    
    /**
 * recordSyncFlushDuration：处理record同步刷新耗时并更新相关状态。
 * @param durationMs 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新recordSyncFlushDuration相关状态。
 */

    recordSyncFlushDuration(durationMs, deps) {
        deps.worldRuntimeFrameService.recordSyncFlushDuration(durationMs);
    }    
    /**
 * bootstrapPublicInstances：执行引导PublicInstance相关逻辑。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新bootstrapPublicInstance相关状态。
 */

    bootstrapPublicInstances(deps) {
        deps.worldRuntimeLifecycleService.bootstrapPublicInstances(deps);
    }    
    /**
 * restorePublicInstancePersistence：判断restorePublicInstancePersistence是否满足条件。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新restorePublicInstancePersistence相关状态。
 */

    async restorePublicInstancePersistence(deps) {
        await deps.worldRuntimeLifecycleService.restorePublicInstancePersistence(deps);
    }    
    /**
 * rebuildPersistentRuntimeAfterRestore：判断rebuildPersistent运行态AfterRestore是否满足条件。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新rebuildPersistent运行态AfterRestore相关状态。
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

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
    enqueuePendingCommand(playerId, command, deps) {
        deps.worldRuntimePendingCommandService.enqueuePendingCommand(playerId, command);
    }
    getPendingCommand(playerId, deps) {
        return deps.worldRuntimePendingCommandService.getPendingCommand(playerId);
    }
    hasPendingCommand(playerId, deps) {
        return deps.worldRuntimePendingCommandService.hasPendingCommand(playerId);
    }
    clearPendingCommand(playerId, deps) {
        deps.worldRuntimePendingCommandService.clearPendingCommand(playerId);
    }
    getPendingCommandCount(deps) {
        return deps.worldRuntimePendingCommandService.getPendingCommandCount();
    }
    getPlayerLocation(playerId, deps) {
        return deps.worldRuntimePlayerLocationService.getPlayerLocation(playerId);
    }
    setPlayerLocation(playerId, location, deps) {
        deps.worldRuntimePlayerLocationService.setPlayerLocation(playerId, location);
    }
    clearPlayerLocation(playerId, deps) {
        deps.worldRuntimePlayerLocationService.clearPlayerLocation(playerId);
    }
    getPlayerLocationCount(deps) {
        return deps.worldRuntimePlayerLocationService.getPlayerLocationCount();
    }
    listConnectedPlayerIds(deps) {
        return deps.worldRuntimePlayerLocationService.listConnectedPlayerIds();
    }
    getInstanceRuntime(instanceId, deps) {
        return deps.worldRuntimeInstanceStateService.getInstanceRuntime(instanceId);
    }
    setInstanceRuntime(instanceId, instance, deps) {
        deps.worldRuntimeInstanceStateService.setInstanceRuntime(instanceId, instance);
    }
    listInstanceRuntimes(deps) {
        return deps.worldRuntimeInstanceStateService.listInstanceRuntimes();
    }
    listInstanceEntries(deps) {
        return deps.worldRuntimeInstanceStateService.listInstanceEntries();
    }
    getInstanceCount(deps) {
        return deps.worldRuntimeInstanceStateService.getInstanceCount();
    }
    listDirtyPersistentInstances(deps) {
        return deps.worldRuntimePersistenceStateService.listDirtyPersistentInstances(deps);
    }
    buildMapPersistenceSnapshot(instanceId, deps) {
        return deps.worldRuntimePersistenceStateService.buildMapPersistenceSnapshot(instanceId, deps);
    }
    markMapPersisted(instanceId, deps) {
        deps.worldRuntimePersistenceStateService.markMapPersisted(instanceId, deps);
    }
    tickAll(deps) {
        return deps.worldRuntimeFrameService.tickAll(deps);
    }
    advanceFrame(frameDurationMs, getInstanceTickSpeed, deps) {
        return deps.worldRuntimeFrameService.advanceFrame(deps, frameDurationMs, getInstanceTickSpeed);
    }
    recordSyncFlushDuration(durationMs, deps) {
        deps.worldRuntimeFrameService.recordSyncFlushDuration(durationMs);
    }
    bootstrapPublicInstances(deps) {
        deps.worldRuntimeLifecycleService.bootstrapPublicInstances(deps);
    }
    async restorePublicInstancePersistence(deps) {
        await deps.worldRuntimeLifecycleService.restorePublicInstancePersistence(deps);
    }
    async rebuildPersistentRuntimeAfterRestore(deps) {
        await deps.worldRuntimeLifecycleService.rebuildPersistentRuntimeAfterRestore(deps);
    }
};
exports.WorldRuntimeStateFacadeService = WorldRuntimeStateFacadeService;
exports.WorldRuntimeStateFacadeService = WorldRuntimeStateFacadeService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimeStateFacadeService);

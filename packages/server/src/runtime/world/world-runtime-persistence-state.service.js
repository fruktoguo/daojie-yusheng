"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimePersistenceStateService = void 0;

const common_1 = require("@nestjs/common");

/** world-runtime persistence-state seam：承接 dirty map 检测、快照构造与持久化落盘回标。 */
let WorldRuntimePersistenceStateService = class WorldRuntimePersistenceStateService {
    listDirtyPersistentInstances(deps) {
        const dirty = new Set(deps.worldRuntimeLootContainerService.getDirtyInstanceIds());
        for (const [instanceId, instance] of deps.listInstanceEntries()) {
            if (instance.meta.persistent && instance.isPersistentDirty()) {
                dirty.add(instanceId);
            }
        }
        return Array.from(dirty).sort(deps.compareStableStrings);
    }
    buildMapPersistenceSnapshot(instanceId, deps) {
        const instance = deps.getInstanceRuntime(instanceId);
        if (!instance || !instance.meta.persistent) {
            return null;
        }
        return {
            version: 1,
            savedAt: Date.now(),
            templateId: instance.template.id,
            auraEntries: instance.buildAuraPersistenceEntries(),
            groundPileEntries: instance.buildGroundPersistenceEntries(),
            containerStates: deps.worldRuntimeLootContainerService.buildContainerPersistenceStates(instanceId),
        };
    }
    markMapPersisted(instanceId, deps) {
        deps.getInstanceRuntime(instanceId)?.markAuraPersisted();
        deps.worldRuntimeLootContainerService.clearPersisted(instanceId);
    }
};
exports.WorldRuntimePersistenceStateService = WorldRuntimePersistenceStateService;
exports.WorldRuntimePersistenceStateService = WorldRuntimePersistenceStateService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimePersistenceStateService);

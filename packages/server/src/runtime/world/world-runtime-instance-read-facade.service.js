"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeInstanceReadFacadeService = void 0;

const common_1 = require("@nestjs/common");
const map_instance_runtime_1 = require("../instance/map-instance.runtime");
const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");

/** world-runtime instance-read facade：承接地图模板、实例和 tile/combat 只读 facade。 */
let WorldRuntimeInstanceReadFacadeService = class WorldRuntimeInstanceReadFacadeService {
    listMapTemplates(deps) {
        return deps.templateRepository.listSummaries();
    }
    listInstances(deps) {
        return deps.worldRuntimeInstanceQueryService.listInstances(deps);
    }
    getInstance(instanceId, deps) {
        return deps.worldRuntimeInstanceQueryService.getInstance(deps, instanceId);
    }
    listInstanceMonsters(instanceId, deps) {
        return deps.worldRuntimeInstanceQueryService.listInstanceMonsters(deps.getInstanceRuntimeOrThrow(instanceId));
    }
    getInstanceMonster(instanceId, runtimeId, deps) {
        return deps.worldRuntimeInstanceQueryService.getInstanceMonster(deps.getInstanceRuntimeOrThrow(instanceId), runtimeId);
    }
    getInstanceTileState(instanceId, x, y, deps) {
        const instance = deps.getInstanceRuntime(instanceId);
        if (!instance) {
            return null;
        }
        return deps.worldRuntimeInstanceQueryService.getInstanceTileState(instance, x, y);
    }
    getCombatEffects(instanceId, deps) {
        return deps.worldRuntimeCombatEffectsService.getCombatEffects(instanceId).map((entry) => (0, world_runtime_normalization_helpers_1.cloneCombatEffect)(entry));
    }
    createInstance(input, deps) {
        const existing = deps.getInstanceRuntime(input.instanceId);
        if (existing) {
            return existing;
        }
        const template = deps.templateRepository.getOrThrow(input.templateId);
        const instance = new map_instance_runtime_1.MapInstanceRuntime({
            instanceId: input.instanceId,
            template,
            monsterSpawns: deps.contentTemplateRepository.createRuntimeMonstersForMap(template.id),
            kind: input.kind,
            persistent: input.persistent,
            createdAt: Date.now(),
        });
        deps.setInstanceRuntime(input.instanceId, instance);
        deps.worldRuntimeTickProgressService.initializeInstance(input.instanceId);
        return instance;
    }
};
exports.WorldRuntimeInstanceReadFacadeService = WorldRuntimeInstanceReadFacadeService;
exports.WorldRuntimeInstanceReadFacadeService = WorldRuntimeInstanceReadFacadeService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimeInstanceReadFacadeService);

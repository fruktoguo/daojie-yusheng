"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeInstanceQueryService = void 0;

const common_1 = require("@nestjs/common");

/** 世界运行时实例查询服务：承接 instance 维度的只读查询。 */
let WorldRuntimeInstanceQueryService = class WorldRuntimeInstanceQueryService {
    listInstances(runtime) {
        return Array.from(runtime.listInstanceRuntimes(), (instance) => instance.snapshot());
    }
    getInstance(runtime, instanceId) {
        return runtime.getInstanceRuntime(instanceId)?.snapshot() ?? null;
    }
    listInstanceMonsters(instance) {
        return instance.listMonsters();
    }
    getInstanceMonster(instance, runtimeId) {
        return instance.getMonster(runtimeId);
    }
    getInstanceTileState(instance, x, y) {
        const aura = instance.getTileAura(x, y);
        if (aura === null) {
            return null;
        }
        return {
            aura,
            safeZone: instance.getSafeZoneAtTile(x, y),
            container: instance.getContainerAtTile(x, y),
            groundPile: instance.getTileGroundPile(x, y),
            combat: instance.getTileCombatState(x, y),
        };
    }
};
exports.WorldRuntimeInstanceQueryService = WorldRuntimeInstanceQueryService;
exports.WorldRuntimeInstanceQueryService = WorldRuntimeInstanceQueryService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimeInstanceQueryService);

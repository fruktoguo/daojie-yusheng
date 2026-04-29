// @ts-nocheck
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
/**
 * listInstances：读取Instance并返回结果。
 * @param runtime 参数说明。
 * @returns 无返回值，完成Instance的读取/组装。
 */

    listInstances(runtime) {
        return Array.from(runtime.listInstanceRuntimes(), (instance) => instance.snapshot());
    }    
    /**
 * getInstance：读取Instance。
 * @param runtime 参数说明。
 * @param instanceId instance ID。
 * @returns 无返回值，完成Instance的读取/组装。
 */

    getInstance(runtime, instanceId) {
        return runtime.getInstanceRuntime(instanceId)?.snapshot() ?? null;
    }    
    /**
 * listInstanceMonsters：读取Instance怪物并返回结果。
 * @param instance 地图实例。
 * @returns 无返回值，完成Instance怪物的读取/组装。
 */

    listInstanceMonsters(instance) {
        return instance.listMonsters();
    }    
    /**
 * getInstanceMonster：读取Instance怪物。
 * @param instance 地图实例。
 * @param runtimeId runtime ID。
 * @returns 无返回值，完成Instance怪物的读取/组装。
 */

    getInstanceMonster(instance, runtimeId) {
        return instance.getMonster(runtimeId);
    }    
    /**
 * getInstanceTileState：读取InstanceTile状态。
 * @param instance 地图实例。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @returns 无返回值，完成InstanceTile状态的读取/组装。
 */

    getInstanceTileState(instance, x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const aura = instance.getTileAura(x, y);
        if (aura === null) {
            return null;
        }
        return {
            tileType: typeof instance.getEffectiveTileType === 'function' ? instance.getEffectiveTileType(x, y) : undefined,
            aura,
            resources: instance.listTileResources?.(x, y) ?? [],
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

export { WorldRuntimeInstanceQueryService };

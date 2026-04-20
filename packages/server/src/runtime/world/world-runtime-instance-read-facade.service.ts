// @ts-nocheck
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
/**
 * listMapTemplates：执行核心业务逻辑。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    listMapTemplates(deps) {
        return deps.templateRepository.listSummaries();
    }    
    /**
 * listInstances：执行核心业务逻辑。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    listInstances(deps) {
        return deps.worldRuntimeInstanceQueryService.listInstances(deps);
    }    
    /**
 * getInstance：按给定条件读取/查询数据。
 * @param instanceId instance ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    getInstance(instanceId, deps) {
        return deps.worldRuntimeInstanceQueryService.getInstance(deps, instanceId);
    }    
    /**
 * listInstanceMonsters：执行核心业务逻辑。
 * @param instanceId instance ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    listInstanceMonsters(instanceId, deps) {
        return deps.worldRuntimeInstanceQueryService.listInstanceMonsters(deps.getInstanceRuntimeOrThrow(instanceId));
    }    
    /**
 * getInstanceMonster：按给定条件读取/查询数据。
 * @param instanceId instance ID。
 * @param runtimeId runtime ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    getInstanceMonster(instanceId, runtimeId, deps) {
        return deps.worldRuntimeInstanceQueryService.getInstanceMonster(deps.getInstanceRuntimeOrThrow(instanceId), runtimeId);
    }    
    /**
 * getInstanceTileState：按给定条件读取/查询数据。
 * @param instanceId instance ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    getInstanceTileState(instanceId, x, y, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const instance = deps.getInstanceRuntime(instanceId);
        if (!instance) {
            return null;
        }
        return deps.worldRuntimeInstanceQueryService.getInstanceTileState(instance, x, y);
    }    
    /**
 * getCombatEffects：按给定条件读取/查询数据。
 * @param instanceId instance ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    getCombatEffects(instanceId, deps) {
        return deps.worldRuntimeCombatEffectsService.getCombatEffects(instanceId).map((entry) => (0, world_runtime_normalization_helpers_1.cloneCombatEffect)(entry));
    }    
    /**
 * createInstance：构建并返回目标对象。
 * @param input 输入参数。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    createInstance(input, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

export { WorldRuntimeInstanceReadFacadeService };

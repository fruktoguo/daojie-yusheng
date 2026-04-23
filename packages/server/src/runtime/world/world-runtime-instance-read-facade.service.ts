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
const {
    buildRuntimeInstancePresetMeta,
    parseRuntimeInstanceDescriptor,
    normalizeRuntimeInstanceLinePreset,
} = world_runtime_normalization_helpers_1;

/** world-runtime instance-read facade：承接地图模板、实例和 tile/combat 只读 facade。 */
let WorldRuntimeInstanceReadFacadeService = class WorldRuntimeInstanceReadFacadeService {
/**
 * listMapTemplates：读取地图Template并返回结果。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成地图Template的读取/组装。
 */

    listMapTemplates(deps) {
        return deps.templateRepository.listSummaries();
    }    
    /**
 * listInstances：读取Instance并返回结果。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成Instance的读取/组装。
 */

    listInstances(deps) {
        return deps.worldRuntimeInstanceQueryService.listInstances(deps);
    }    
    /**
 * getInstance：读取Instance。
 * @param instanceId instance ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成Instance的读取/组装。
 */

    getInstance(instanceId, deps) {
        return deps.worldRuntimeInstanceQueryService.getInstance(deps, instanceId);
    }    
    /**
 * listInstanceMonsters：读取Instance怪物并返回结果。
 * @param instanceId instance ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成Instance怪物的读取/组装。
 */

    listInstanceMonsters(instanceId, deps) {
        return deps.worldRuntimeInstanceQueryService.listInstanceMonsters(deps.getInstanceRuntimeOrThrow(instanceId));
    }    
    /**
 * getInstanceMonster：读取Instance怪物。
 * @param instanceId instance ID。
 * @param runtimeId runtime ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成Instance怪物的读取/组装。
 */

    getInstanceMonster(instanceId, runtimeId, deps) {
        return deps.worldRuntimeInstanceQueryService.getInstanceMonster(deps.getInstanceRuntimeOrThrow(instanceId), runtimeId);
    }    
    /**
 * getInstanceTileState：读取InstanceTile状态。
 * @param instanceId instance ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成InstanceTile状态的读取/组装。
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
 * getCombatEffects：读取战斗Effect。
 * @param instanceId instance ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成战斗Effect的读取/组装。
 */

    getCombatEffects(instanceId, deps) {
        return deps.worldRuntimeCombatEffectsService.getCombatEffects(instanceId).map((entry) => (0, world_runtime_normalization_helpers_1.cloneCombatEffect)(entry));
    }    
    /**
 * createInstance：构建并返回目标对象。
 * @param input 输入参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Instance相关状态。
 */

    createInstance(input, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const existing = deps.getInstanceRuntime(input.instanceId);
        if (existing) {
            return existing;
        }
        const template = deps.templateRepository.getOrThrow(input.templateId);
        const descriptor = parseRuntimeInstanceDescriptor(input.instanceId);
        const presetMeta = buildRuntimeInstancePresetMeta({
            templateName: template.name,
            displayName: input.displayName,
            linePreset: input.linePreset ?? descriptor?.linePreset ?? normalizeRuntimeInstanceLinePreset(undefined),
            lineIndex: input.lineIndex ?? descriptor?.lineIndex,
            instanceOrigin: input.instanceOrigin ?? descriptor?.instanceOrigin,
            defaultEntry: input.defaultEntry ?? descriptor?.defaultEntry,
        });
        const instance = new map_instance_runtime_1.MapInstanceRuntime({
            instanceId: input.instanceId,
            template,
            monsterSpawns: deps.contentTemplateRepository.createRuntimeMonstersForMap(template.id),
            kind: input.kind,
            persistent: input.persistent,
            createdAt: Date.now(),
            displayName: presetMeta.displayName,
            linePreset: presetMeta.linePreset,
            lineIndex: presetMeta.lineIndex,
            instanceOrigin: presetMeta.instanceOrigin,
            supportsPvp: presetMeta.supportsPvp,
            canDamageTile: presetMeta.canDamageTile,
            defaultEntry: presetMeta.defaultEntry,
            ownerPlayerId: input.ownerPlayerId,
            ownerSectId: input.ownerSectId,
            partyId: input.partyId,
            status: input.status,
            runtimeStatus: input.runtimeStatus,
            assignedNodeId: input.assignedNodeId,
            leaseToken: input.leaseToken,
            leaseExpireAt: input.leaseExpireAt,
            ownershipEpoch: input.ownershipEpoch,
            clusterId: input.clusterId,
            shardKey: input.shardKey,
            routeDomain: input.routeDomain,
            lastActiveAt: input.lastActiveAt,
            lastPersistedAt: input.lastPersistedAt,
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

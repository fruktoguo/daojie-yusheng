// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeLifecycleService = void 0;

const common_1 = require("@nestjs/common");
const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");

/** world-runtime lifecycle seam：承接公共实例 bootstrap、持久化恢复与整体验证前 rebuild。 */
let WorldRuntimeLifecycleService = class WorldRuntimeLifecycleService {
/**
 * bootstrapPublicInstances：执行引导PublicInstance相关逻辑。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新bootstrapPublicInstance相关状态。
 */

    bootstrapPublicInstances(deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        for (const template of deps.templateRepository.list()) {
            deps.createInstance({
                instanceId: (0, world_runtime_normalization_helpers_1.buildPublicInstanceId)(template.id),
                templateId: template.id,
                kind: 'public',
                persistent: true,
            });
        }
        deps.logger.log(`已初始化 ${deps.getInstanceCount()} 个公共实例`);
    }    
    /**
 * restorePublicInstancePersistence：判断restorePublicInstancePersistence是否满足条件。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新restorePublicInstancePersistence相关状态。
 */

    async restorePublicInstancePersistence(deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!deps.mapPersistenceService.isEnabled()) {
            return;
        }
        for (const [instanceId, instance] of deps.listInstanceEntries()) {
            if (!instance.meta.persistent) {
                continue;
            }
            const snapshot = await deps.mapPersistenceService.loadMapSnapshot(instanceId);
            if (!snapshot || snapshot.templateId !== instance.template.id) {
                continue;
            }
            instance.hydrateAura(snapshot.auraEntries);
            instance.hydrateGroundPiles(snapshot.groundPileEntries);
            deps.worldRuntimeLootContainerService.hydrateContainerStates(instanceId, snapshot.containerStates ?? []);
        }
    }    
    /**
 * rebuildPersistentRuntimeAfterRestore：判断rebuildPersistent运行态AfterRestore是否满足条件。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新rebuildPersistent运行态AfterRestore相关状态。
 */

    async rebuildPersistentRuntimeAfterRestore(deps) {
        deps.worldRuntimeInstanceStateService.resetState();
        deps.worldRuntimePlayerLocationService.resetState();
        deps.worldRuntimePendingCommandService.resetState();
        deps.worldRuntimeGmQueueService.resetState();
        deps.worldRuntimeNavigationService.reset();
        deps.worldRuntimeTickProgressService.resetState();
        deps.worldRuntimeLootContainerService.reset();
        deps.worldRuntimeCombatEffectsService.resetAll();
        this.bootstrapPublicInstances(deps);
        await this.restorePublicInstancePersistence(deps);
    }
};
exports.WorldRuntimeLifecycleService = WorldRuntimeLifecycleService;
exports.WorldRuntimeLifecycleService = WorldRuntimeLifecycleService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimeLifecycleService);

export { WorldRuntimeLifecycleService };

// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeWorldAccessService = void 0;

const common_1 = require("@nestjs/common");

const world_runtime_summary_query_service_1 = require("./world-runtime-summary-query.service");
const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");

const { buildPublicInstanceId } = world_runtime_normalization_helpers_1;

const DEFAULT_PLAYER_RESPAWN_MAP_ID = 'yunlai_town';

/** world-runtime world-access seam：承接世界级 access/utility/query 外壳。 */
let WorldRuntimeWorldAccessService = class WorldRuntimeWorldAccessService {
/**
 * worldRuntimeSummaryQueryService：对象字段。
 */

    worldRuntimeSummaryQueryService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldRuntimeSummaryQueryService 参数说明。
 * @returns 无返回值（构造函数）。
 */

    constructor(worldRuntimeSummaryQueryService) {
        this.worldRuntimeSummaryQueryService = worldRuntimeSummaryQueryService;
    }    
    /**
 * resolveCurrentTickForPlayerId：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    resolveCurrentTickForPlayerId(playerId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = deps.playerRuntimeService.getPlayer(playerId);
        if (!player?.instanceId) {
            return deps.tick;
        }
        return deps.getInstanceRuntime(player.instanceId)?.tick ?? deps.tick;
    }    
    /**
 * getRuntimeSummary：按给定条件读取/查询数据。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    getRuntimeSummary(deps) {
        const instances = deps.listInstances();
        return this.worldRuntimeSummaryQueryService.buildRuntimeSummary({
            tick: deps.tick,
            lastTickDurationMs: deps.lastTickDurationMs,
            lastSyncFlushDurationMs: deps.lastSyncFlushDurationMs,
            mapTemplateCount: deps.templateRepository.list().length,
            playerCount: deps.getPlayerLocationCount(),
            pendingCommandCount: deps.getPendingCommandCount(),
            pendingSystemCommandCount: deps.worldRuntimeGmQueueService.getPendingSystemCommandCount(),
            tickDurationHistoryMs: deps.tickDurationHistoryMs,
            syncFlushDurationHistoryMs: deps.syncFlushDurationHistoryMs,
            lastTickPhaseDurations: deps.lastTickPhaseDurations,
            instances,
        });
    }    
    /**
 * getOrCreatePublicInstance：按给定条件读取/查询数据。
 * @param templateId template ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    getOrCreatePublicInstance(templateId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!deps.templateRepository.has(templateId)) {
            throw new common_1.NotFoundException(`Unknown map template: ${templateId}`);
        }
        return deps.createInstance({
            instanceId: buildPublicInstanceId(templateId),
            templateId,
            kind: 'public',
            persistent: true,
        });
    }    
    /**
 * resolveDefaultRespawnMapId：执行核心业务逻辑。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    resolveDefaultRespawnMapId(deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (deps.templateRepository.has(DEFAULT_PLAYER_RESPAWN_MAP_ID)) {
            return DEFAULT_PLAYER_RESPAWN_MAP_ID;
        }
        const fallback = deps.templateRepository.list()[0]?.id;
        if (!fallback) {
            throw new common_1.NotFoundException('No map template available');
        }
        return fallback;
    }    
    /**
 * findMapRoute：执行核心业务逻辑。
 * @param fromMapId fromMap ID。
 * @param toMapId toMap ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    findMapRoute(fromMapId, toMapId, deps) {
        return deps.worldRuntimeNavigationService.findMapRoute(fromMapId, toMapId);
    }    
    /**
 * getPlayerLocationOrThrow：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    getPlayerLocationOrThrow(playerId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const location = deps.getPlayerLocation(playerId);
        if (!location) {
            throw new common_1.NotFoundException(`Player ${playerId} is not connected`);
        }
        return location;
    }    
    /**
 * getInstanceRuntimeOrThrow：按给定条件读取/查询数据。
 * @param instanceId instance ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    getInstanceRuntimeOrThrow(instanceId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const instance = deps.getInstanceRuntime(instanceId);
        if (!instance) {
            throw new common_1.NotFoundException(`Instance ${instanceId} not found`);
        }
        return instance;
    }    
    /**
 * cancelPendingInstanceCommand：执行状态校验并返回判断结果。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    cancelPendingInstanceCommand(playerId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const location = deps.getPlayerLocation(playerId);
        if (!location) {
            return false;
        }
        return deps.getInstanceRuntime(location.instanceId)?.cancelPendingCommand(playerId) ?? false;
    }    
    /**
 * interruptManualNavigation：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    interruptManualNavigation(playerId, deps) {
        deps.worldRuntimeNavigationService.interruptManualNavigation(playerId, deps);
    }    
    /**
 * interruptManualCombat：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    interruptManualCombat(playerId, deps) {
        deps.worldRuntimeNavigationService.clearNavigationIntent(playerId);
        this.cancelPendingInstanceCommand(playerId, deps);
    }    
    /**
 * getPlayerViewOrThrow：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    getPlayerViewOrThrow(playerId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const view = deps.getPlayerView(playerId);
        if (!view) {
            throw new common_1.NotFoundException(`Player ${playerId} not found`);
        }
        return view;
    }
};
exports.WorldRuntimeWorldAccessService = WorldRuntimeWorldAccessService;
exports.WorldRuntimeWorldAccessService = WorldRuntimeWorldAccessService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_runtime_summary_query_service_1.WorldRuntimeSummaryQueryService])
], WorldRuntimeWorldAccessService);

export { WorldRuntimeWorldAccessService };

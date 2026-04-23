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

const { buildPublicInstanceId, buildRealInstanceId, normalizeRuntimeInstanceLinePreset } = world_runtime_normalization_helpers_1;

const DEFAULT_PLAYER_RESPAWN_MAP_ID = 'yunlai_town';

/** world-runtime world-access seam：承接世界级 access/utility/query 外壳。 */
let WorldRuntimeWorldAccessService = class WorldRuntimeWorldAccessService {
/**
 * worldRuntimeSummaryQueryService：世界运行态摘要Query服务引用。
 */

    worldRuntimeSummaryQueryService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldRuntimeSummaryQueryService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(worldRuntimeSummaryQueryService) {
        this.worldRuntimeSummaryQueryService = worldRuntimeSummaryQueryService;
    }    
    /**
 * resolveCurrentTickForPlayerId：规范化或转换当前tickFor玩家ID。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新CurrenttickFor玩家ID相关状态。
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
 * getRuntimeSummary：读取运行态摘要。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成运行态摘要的读取/组装。
 */

    getRuntimeSummary(deps) {
        const instances = deps.listInstances();
        const dirtyPlayerDomains = typeof deps.playerRuntimeService?.listDirtyPlayerDomains === 'function'
            ? deps.playerRuntimeService.listDirtyPlayerDomains()
            : new Map();
        const dirtyInstanceIds = typeof deps.listDirtyPersistentInstances === 'function'
            ? deps.listDirtyPersistentInstances()
            : [];
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
            tickPhaseDurationHistoryMs: deps.tickPhaseDurationHistoryMs,
            instances,
            dirtyBacklog: {
                players: dirtyPlayerDomains.size,
                playerDomains: Array.from(dirtyPlayerDomains.values()).reduce((total, domains) => total + (domains?.size ?? 0), 0),
                instances: dirtyInstanceIds.length,
            },
            recoveryQueue: typeof deps.worldSessionRecoveryQueueService?.getSnapshot === 'function'
                ? deps.worldSessionRecoveryQueueService.getSnapshot()
                : null,
            flushWakeup: typeof deps.flushWakeupService?.listWakeupKeys === 'function'
                ? {
                    concurrency: 0,
                    inFlight: 0,
                    queued: deps.flushWakeupService.listWakeupKeys().length,
                    keys: deps.flushWakeupService.listWakeupKeys(),
                }
                : null,
        });
    }    
    /**
 * getOrCreatePublicInstance：读取OrCreatePublicInstance。
 * @param templateId template ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成OrCreatePublicInstance的读取/组装。
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
            linePreset: 'peaceful',
            lineIndex: 1,
            instanceOrigin: 'bootstrap',
            defaultEntry: true,
        });
    }    
    /**
 * getOrCreateDefaultLineInstance：按默认和平/真实线获取实例。
 * @param templateId template ID。
 * @param linePreset 分线预设。
 * @param deps 运行时依赖。
 * @returns 返回默认入口实例。
 */

    getOrCreateDefaultLineInstance(templateId, linePreset, deps) {
        const normalizedPreset = normalizeRuntimeInstanceLinePreset(linePreset);
        if (normalizedPreset !== 'real') {
            return this.getOrCreatePublicInstance(templateId, deps);
        }
        if (!deps.templateRepository.has(templateId)) {
            throw new common_1.NotFoundException(`Unknown map template: ${templateId}`);
        }
        return deps.createInstance({
            instanceId: buildRealInstanceId(templateId),
            templateId,
            kind: 'default_real',
            persistent: true,
            linePreset: 'real',
            lineIndex: 1,
            instanceOrigin: 'bootstrap',
            defaultEntry: true,
        });
    }    
    /**
 * resolveDefaultRespawnMapId：规范化或转换默认重生地图ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Default重生地图ID相关状态。
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
 * findMapRoute：读取地图路线并返回结果。
 * @param fromMapId fromMap ID。
 * @param toMapId toMap ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成地图路线的读取/组装。
 */

    findMapRoute(fromMapId, toMapId, deps) {
        return deps.worldRuntimeNavigationService.findMapRoute(fromMapId, toMapId);
    }    
    /**
 * getPlayerLocationOrThrow：读取玩家位置OrThrow。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成玩家位置OrThrow的读取/组装。
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
 * getInstanceRuntimeOrThrow：读取Instance运行态OrThrow。
 * @param instanceId instance ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成Instance运行态OrThrow的读取/组装。
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
 * cancelPendingInstanceCommand：判断cancel待处理InstanceCommand是否满足条件。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成cancelPendingInstanceCommand的条件判断。
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
 * interruptManualNavigation：执行interruptManual导航相关逻辑。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新interruptManual导航相关状态。
 */

    interruptManualNavigation(playerId, deps) {
        deps.worldRuntimeNavigationService.interruptManualNavigation(playerId, deps);
    }    
    /**
 * interruptManualCombat：执行interruptManual战斗相关逻辑。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新interruptManual战斗相关状态。
 */

    interruptManualCombat(playerId, deps) {
        deps.worldRuntimeNavigationService.clearNavigationIntent(playerId);
        this.cancelPendingInstanceCommand(playerId, deps);
    }    
    /**
 * getPlayerViewOrThrow：读取玩家视图OrThrow。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成玩家视图OrThrow的读取/组装。
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

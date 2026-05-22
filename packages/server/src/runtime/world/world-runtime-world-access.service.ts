/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 世界级访问与工具服务
 * 提供实例创建/查找、默认复生地图、线路分配等世界级公共操作
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { WorldRuntimeSummaryQueryService } from './query/world-runtime-summary-query.service';
import * as world_runtime_normalization_helpers_1 from './world-runtime.normalization.helpers';

const { buildPublicInstanceId, buildRealInstanceId, normalizeRuntimeInstanceLinePreset } = world_runtime_normalization_helpers_1;

const DEFAULT_PLAYER_RESPAWN_MAP_ID = 'yunlai_town';

/** world-runtime world-access seam：承接世界级 access/utility/query 外壳。 */
@Injectable()
export class WorldRuntimeWorldAccessService {
/**
 * worldRuntimeSummaryQueryService：世界运行态摘要Query服务引用。
 */

    worldRuntimeSummaryQueryService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldRuntimeSummaryQueryService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(worldRuntimeSummaryQueryService: WorldRuntimeSummaryQueryService) {
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
        if (player && Number.isFinite(Number(player.lifeElapsedTicks))) {
            return Math.max(0, Math.trunc(Number(player.lifeElapsedTicks) || 0));
        }
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
        const dirtyPlayerDomains: Map<string, any> = typeof deps.playerRuntimeService?.listDirtyPlayerDomains === 'function'
            ? deps.playerRuntimeService.listDirtyPlayerDomains()
            : new Map();
        const dirtyInstanceIds = typeof deps.listDirtyPersistentInstances === 'function'
            ? deps.listDirtyPersistentInstances()
            : [];
        const flushWakeupKeys = typeof deps.flushWakeupService?.listWakeupKeys === 'function'
            ? deps.flushWakeupService.listWakeupKeys()
            : null;
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
            flushWakeup: flushWakeupKeys
                ? {
                    concurrency: 0,
                    inFlight: 0,
                    queued: flushWakeupKeys.length,
                    keys: flushWakeupKeys,
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

        const towerInstance = resolveTongtianTowerInstance(templateId, deps);
        if (towerInstance) {
            return towerInstance;
        }
        if (!deps.templateRepository.has(templateId)) {
            throw new NotFoundException(`地图模板不存在：${templateId}`);
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
        const towerInstance = resolveTongtianTowerInstance(templateId, deps);
        if (towerInstance) {
            return towerInstance;
        }
        const normalizedPreset = normalizeRuntimeInstanceLinePreset(linePreset);
        if (normalizedPreset !== 'real') {
            return this.getOrCreatePublicInstance(templateId, deps);
        }
        if (!deps.templateRepository.has(templateId)) {
            throw new NotFoundException(`地图模板不存在：${templateId}`);
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
            throw new NotFoundException('没有可用地图模板');
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
            throw new NotFoundException(`玩家 ${playerId} 尚未连接`);
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
            throw new NotFoundException(`地图实例不存在：${instanceId}`);
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
        if (typeof deps.clearPendingCommand === 'function') {
            deps.clearPendingCommand(playerId);
        }
        deps.playerRuntimeService?.clearManualEngagePending?.(playerId);
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
            throw new NotFoundException(`玩家不存在：${playerId}`);
        }
        return view;
    }
};

function resolveTongtianTowerInstance(templateId, deps) {
    if (typeof templateId !== 'string' || !templateId.startsWith('tongtian_tower_layer_')) {
        return null;
    }
    if (typeof deps.worldRuntimeTongtianTowerService?.ensureLayerInstanceForRestore !== 'function') {
        return null;
    }
    return deps.worldRuntimeTongtianTowerService.ensureLayerInstanceForRestore({ templateId }, deps);
}

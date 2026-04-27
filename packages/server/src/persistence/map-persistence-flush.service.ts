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

var MapPersistenceFlushService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MapPersistenceFlushService = void 0;

const common_1 = require("@nestjs/common");
const perf_hooks_1 = require("node:perf_hooks");

const world_runtime_service_1 = require("../runtime/world/world-runtime.service");
const env_alias_1 = require("../config/env-alias");

const map_persistence_service_1 = require("./map-persistence.service");

const MAP_PERSISTENCE_FLUSH_INTERVAL_MS = 5000;
const MAP_PERSISTENCE_FLUSH_BATCH_SIZE = 16;
const MAP_PERSISTENCE_FLUSH_PARALLELISM = 3;
const MAP_PERSISTENCE_FLUSH_RETRY_COUNT = 1;
const PERSISTENCE_SLOW_FLUSH_THRESHOLD_MIN_MS = 100;
const MAP_PERSISTENCE_TIME_DOMAIN = 'time';
const MAP_PERSISTENCE_SLOW_FLUSH_THRESHOLD_MS = normalizePositiveInteger((0, env_alias_1.readTrimmedEnv)('SERVER_PERSISTENCE_FLUSH_SLOW_THRESHOLD_MS', 'PERSISTENCE_FLUSH_SLOW_THRESHOLD_MS'), 100, PERSISTENCE_SLOW_FLUSH_THRESHOLD_MIN_MS, 10_000);
const MAP_PERSISTENCE_SLOW_FLUSH_BACKOFF_MS = normalizePositiveInteger((0, env_alias_1.readTrimmedEnv)('SERVER_PERSISTENCE_FLUSH_SLOW_BACKOFF_MS', 'PERSISTENCE_FLUSH_SLOW_BACKOFF_MS'), 5_000, 1_000, 60_000);
const MAP_PERSISTENCE_TIME_CHECKPOINT_INTERVAL_MS = normalizePositiveInteger((0, env_alias_1.readTrimmedEnv)('SERVER_MAP_TIME_CHECKPOINT_INTERVAL_MS', 'MAP_TIME_CHECKPOINT_INTERVAL_MS'), 300_000, 60_000, 3_600_000);

/**
 * normalizePositiveInteger：执行normalize正整数相关逻辑。
 * @param value 参数说明。
 * @param defaultValue 参数说明。
 * @param min 参数说明。
 * @param max 参数说明。
 * @returns 无返回值，直接更新normalize正整数相关状态。
 */

function normalizePositiveInteger(value, defaultValue, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return defaultValue;
    }
    const normalized = Math.trunc(parsed);
    if (normalized < min) {
        return min;
    }
    if (normalized > max) {
        return max;
    }
    return normalized;
}

/** 地图快照脏实例定时刷盘服务：按周期落库并支持进程关闭前强刷。 */
let MapPersistenceFlushService = MapPersistenceFlushService_1 = class MapPersistenceFlushService {
/**
 * worldRuntimeService：世界运行态服务引用。
 */

    worldRuntimeService;    
    /**
 * mapPersistenceService：地图Persistence服务引用。
 */

    mapPersistenceService;    
    /**
 * logger：日志器引用。
 */

    logger = new common_1.Logger(MapPersistenceFlushService_1.name);    
    /**
 * timer：timer相关字段。
 */

    timer = null;    
    /**
* flushPromise：flushPromise相关字段。
 */

    flushPromise = null;    
    /**
 * flushThrottleUntilAt：flushThrottleUntilAt相关字段。
 */

    flushThrottleUntilAt = 0;    
    /**
 * nextTimeCheckpointFlushAt：下一次 interval 允许写入 time checkpoint 的时间。
 */

    nextTimeCheckpointFlushAt = 0;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldRuntimeService 参数说明。
 * @param mapPersistenceService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(worldRuntimeService, mapPersistenceService) {
        this.worldRuntimeService = worldRuntimeService;
        this.mapPersistenceService = mapPersistenceService;
    }    
    /**
 * onModuleInit：执行on模块Init相关逻辑。
 * @returns 无返回值，直接更新on模块Init相关状态。
 */

    onModuleInit() {
        this.timer = setInterval(() => {
            void this.flushDirtyInstances();
        }, MAP_PERSISTENCE_FLUSH_INTERVAL_MS);
        this.timer.unref();
        this.logger.log(`地图持久化刷新已启动，间隔 ${MAP_PERSISTENCE_FLUSH_INTERVAL_MS}ms`);
    }    
    /**
 * onModuleDestroy：执行on模块Destroy相关逻辑。
 * @returns 无返回值，直接更新on模块Destroy相关状态。
 */

    onModuleDestroy() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /** 应用关闭前强制刷盘一次，避免脏快照丢失。 */
    async beforeApplicationShutdown() {
        await this.flushAllNow();
    }

    /** 执行一次全量脏实例刷盘。 */
    async flushAllNow() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isDomainPersistenceEnabled() && !this.mapPersistenceService.isEnabled()) {
            return;
        }
        if (this.flushPromise) {
            await this.flushPromise;
        }
        await this.runFlushCycle('shutdown');
    }    
    /**
 * flushInstance：执行flush实例相关逻辑。
 * @param instanceId 实例 ID。
 * @returns 无返回值，直接更新flush实例相关状态。
 */

    async flushInstance(instanceId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isDomainPersistenceEnabled() && !this.mapPersistenceService.isEnabled()) {
            return;
        }
        if (typeof this.worldRuntimeService.flushInstanceDomains === 'function') {
            await this.worldRuntimeService.flushInstanceDomains(instanceId);
            return;
        }
        const snapshot = this.worldRuntimeService.buildMapPersistenceSnapshot(instanceId);
        if (!snapshot) {
            return;
        }
        await retryFlush(MAP_PERSISTENCE_FLUSH_RETRY_COUNT, async () => {
            await this.mapPersistenceService.saveMapSnapshot(instanceId, snapshot);
        });
        this.worldRuntimeService.markMapPersisted(instanceId);
    }    
    /**
 * flushDirtyInstances：执行刷新DirtyInstance相关逻辑。
 * @returns 无返回值，直接更新flushDirtyInstance相关状态。
 */

    async flushDirtyInstances() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if ((!this.isDomainPersistenceEnabled() && !this.mapPersistenceService.isEnabled())
            || this.flushPromise
            || isRestoreFreezeActive()
            || this.isFlushThrottleActive()) {
            return;
        }
        await this.runFlushCycle('interval');
    }

    /** 采集 dirty map 并持久化，失败仅记录错误不中断主循环。 */
    async runFlushCycle(reason) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isDomainPersistenceEnabled() && !this.mapPersistenceService.isEnabled()) {
            return;
        }
        const startedAt = perf_hooks_1.performance.now();
        let dirtyInstanceCount = 0;
        let persistedInstanceCount = 0;

        const promise = (async () => {

            const rawDirtyDomainEntries = typeof this.worldRuntimeService.listDirtyPersistentInstanceDomains === 'function'
                ? this.worldRuntimeService.listDirtyPersistentInstanceDomains()
                : [];
            const timeCheckpointDue = reason !== 'interval' || Date.now() >= this.nextTimeCheckpointFlushAt;
            const dirtyDomainSelection = selectFlushDomainEntries(rawDirtyDomainEntries, reason, timeCheckpointDue);
            const dirtyDomainEntries = dirtyDomainSelection.entries;
            const dirtyInstanceIds = rawDirtyDomainEntries.length > 0
                ? dirtyDomainEntries.map((entry) => entry.instanceId)
                : this.worldRuntimeService.listDirtyPersistentInstances();
            dirtyInstanceCount = dirtyInstanceIds.length;
            if (dirtyInstanceIds.length === 0) {
                return;
            }
            const prioritizedInstanceIds = prioritizeMapFlushTargets(dirtyInstanceIds);
            const dirtyDomainEntryByInstanceId = new Map(dirtyDomainEntries.map((entry) => [entry.instanceId, entry]));
            const batches = chunkValues(prioritizedInstanceIds, MAP_PERSISTENCE_FLUSH_BATCH_SIZE);
            for (const batch of batches) {
                await runConcurrent(batch, MAP_PERSISTENCE_FLUSH_PARALLELISM, async (instanceId) => {
                    const domainEntry = dirtyDomainEntryByInstanceId.get(instanceId);
                    if (typeof this.worldRuntimeService.flushInstanceDomains === 'function') {
                        const result = await this.worldRuntimeService.flushInstanceDomains(instanceId, domainEntry?.domains ?? null);
                        if (result?.skipped === true) {
                            return;
                        }
                    }
                    else {
                        const snapshot = this.worldRuntimeService.buildMapPersistenceSnapshot(instanceId);
                        if (!snapshot) {
                            return;
                        }
                        await retryFlush(MAP_PERSISTENCE_FLUSH_RETRY_COUNT, async () => {
                            await this.mapPersistenceService.saveMapSnapshot(instanceId, snapshot);
                        });
                        this.worldRuntimeService.markMapPersisted(instanceId);
                    }
                    persistedInstanceCount += 1;
                }, (instanceId, error) => {
                    this.logger.error(`地图持久化刷新失败（${reason}） instanceId=${instanceId}`, error instanceof Error ? error.stack : String(error));
                });
            }
            if (reason === 'interval' && dirtyDomainSelection.includesTimeCheckpoint === true) {
                this.nextTimeCheckpointFlushAt = Date.now() + MAP_PERSISTENCE_TIME_CHECKPOINT_INTERVAL_MS;
            }
        })();
        this.flushPromise = promise;
        try {
            await promise;
        }
        finally {
            if (this.flushPromise === promise) {
                this.flushPromise = null;
            }
            if (reason === 'interval') {
                const durationMs = perf_hooks_1.performance.now() - startedAt;
                this.updateFlushThrottle(durationMs, dirtyInstanceCount, persistedInstanceCount);
            }
        }
    }
};
exports.MapPersistenceFlushService = MapPersistenceFlushService;
exports.MapPersistenceFlushService = MapPersistenceFlushService = MapPersistenceFlushService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_runtime_service_1.WorldRuntimeService,
        map_persistence_service_1.MapPersistenceService])
], MapPersistenceFlushService);
/**
 * isRestoreFreezeActive：判断RestoreFreeze激活是否满足条件。
 * @returns 无返回值，完成RestoreFreeze激活的条件判断。
 */

function isRestoreFreezeActive() {

    const value = process.env.SERVER_RUNTIME_RESTORE_ACTIVE;
    return typeof value === 'string' && /^(1|true|yes|on)$/iu.test(value.trim());
}
export { MapPersistenceFlushService };
/**
 * prioritizeMapFlushTargets：读取prioritize地图刷新目标并返回结果。
 * @param instanceIds instance ID 集合。
 * @returns 无返回值，直接更新prioritize地图Flush目标相关状态。
 */

function prioritizeMapFlushTargets(instanceIds) {
    return [...instanceIds].sort((left, right) => {
        const leftPriority = left.includes('container:') ? 0 : 1;
        const rightPriority = right.includes('container:') ? 0 : 1;
        return leftPriority - rightPriority || left.localeCompare(right);
    });
}
function selectFlushDomainEntries(entries, reason, timeCheckpointDue) {
    if (!Array.isArray(entries) || entries.length === 0 || reason !== 'interval' || timeCheckpointDue === true) {
        return { entries: Array.isArray(entries) ? entries : [], includesTimeCheckpoint: hasTimeCheckpointDomain(entries) };
    }
    const selected = [];
    for (const entry of entries) {
        const instanceId = typeof entry?.instanceId === 'string' ? entry.instanceId.trim() : '';
        const domains = Array.isArray(entry?.domains)
            ? entry.domains.filter((domain) => typeof domain === 'string' && domain.trim() && domain.trim() !== MAP_PERSISTENCE_TIME_DOMAIN)
            : [];
        if (instanceId && domains.length > 0) {
            selected.push({ instanceId, domains });
        }
    }
    return { entries: selected, includesTimeCheckpoint: false };
}
function hasTimeCheckpointDomain(entries) {
    return Array.isArray(entries)
        && entries.some((entry) => Array.isArray(entry?.domains)
            && entry.domains.some((domain) => typeof domain === 'string' && domain.trim() === MAP_PERSISTENCE_TIME_DOMAIN));
}
/**
 * isFlushThrottleActive：判断FlushThrottle激活是否满足条件。
 * @returns 无返回值，完成FlushThrottle激活的条件判断。
 */

MapPersistenceFlushService.prototype.isFlushThrottleActive = function isFlushThrottleActive() {
    return Date.now() < this.flushThrottleUntilAt;
};
MapPersistenceFlushService.prototype.isDomainPersistenceEnabled = function isDomainPersistenceEnabled() {
    const service = this.worldRuntimeService?.instanceDomainPersistenceService;
    return Boolean(service && typeof service.isEnabled === 'function' && service.isEnabled());
};
/**
 * updateFlushThrottle：执行updateFlushThrottle相关逻辑。
 * @param durationMs 参数说明。
 * @returns 无返回值，直接更新updateFlushThrottle相关状态。
 */

MapPersistenceFlushService.prototype.updateFlushThrottle = function updateFlushThrottle(durationMs, dirtyInstanceCount = 0, persistedInstanceCount = 0) {
    if (durationMs < MAP_PERSISTENCE_SLOW_FLUSH_THRESHOLD_MS) {
        return;
    }
    this.flushThrottleUntilAt = Date.now() + MAP_PERSISTENCE_SLOW_FLUSH_BACKOFF_MS;
    this.logger.warn(`地图最终一致刷盘触发降级退避：durationMs=${Math.trunc(durationMs)} thresholdMs=${MAP_PERSISTENCE_SLOW_FLUSH_THRESHOLD_MS} backoffMs=${MAP_PERSISTENCE_SLOW_FLUSH_BACKOFF_MS} dirtyInstanceCount=${dirtyInstanceCount} persistedInstanceCount=${persistedInstanceCount}`);
};
/**
 * chunkValues：执行chunk值相关逻辑。
 * @param values 参数说明。
 * @param chunkSize 参数说明。
 * @returns 无返回值，直接更新chunk值相关状态。
 */

function chunkValues(values, chunkSize) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Array.isArray(values) || values.length === 0) {
        return [];
    }
    const normalizedChunkSize = Math.max(1, Math.trunc(chunkSize));
    const chunks = [];
    for (let index = 0; index < values.length; index += normalizedChunkSize) {
        chunks.push(values.slice(index, index + normalizedChunkSize));
    }
    return chunks;
}
/**
 * runConcurrent：执行runConcurrent相关逻辑。
 * @param values 参数说明。
 * @param parallelism 参数说明。
 * @param worker 参数说明。
 * @param onError 参数说明。
 * @returns 无返回值，直接更新runConcurrent相关状态。
 */

async function runConcurrent(values, parallelism, worker, onError) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalizedParallelism = Math.max(1, Math.trunc(parallelism));
    for (let index = 0; index < values.length; index += normalizedParallelism) {
        const slice = values.slice(index, index + normalizedParallelism);
        const results = await Promise.allSettled(slice.map((value) => worker(value)));
        results.forEach((result, resultIndex) => {
            if (result.status === 'rejected') {
                onError?.(slice[resultIndex], result.reason);
            }
        });
    }
}
/**
 * retryFlush：执行retry刷新相关逻辑。
 * @param retryCount 参数说明。
 * @param work 参数说明。
 * @returns 无返回值，直接更新retryFlush相关状态。
 */

async function retryFlush(retryCount, work) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const attempts = Math.max(0, Math.trunc(retryCount)) + 1;
    let lastError = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            await work();
            return;
        }
        catch (error) {
            lastError = error;
        }
    }
    throw lastError;
}
//# sourceMappingURL=map-persistence-flush.service.js.map

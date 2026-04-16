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

const world_runtime_service_1 = require("../runtime/world/world-runtime.service");

const map_persistence_service_1 = require("./map-persistence.service");

const MAP_PERSISTENCE_FLUSH_INTERVAL_MS = 5000;
const MAP_PERSISTENCE_FLUSH_BATCH_SIZE = 16;
const MAP_PERSISTENCE_FLUSH_PARALLELISM = 3;
const MAP_PERSISTENCE_FLUSH_RETRY_COUNT = 1;

/** 地图快照脏实例定时刷盘服务：按周期落库并支持进程关闭前强刷。 */
let MapPersistenceFlushService = MapPersistenceFlushService_1 = class MapPersistenceFlushService {
    worldRuntimeService;
    mapPersistenceService;
    logger = new common_1.Logger(MapPersistenceFlushService_1.name);
    timer = null;
    flushPromise = null;
    constructor(worldRuntimeService, mapPersistenceService) {
        this.worldRuntimeService = worldRuntimeService;
        this.mapPersistenceService = mapPersistenceService;
    }
    onModuleInit() {
        this.timer = setInterval(() => {
            void this.flushDirtyInstances();
        }, MAP_PERSISTENCE_FLUSH_INTERVAL_MS);
        this.timer.unref();
        this.logger.log(`地图持久化刷新已启动，间隔 ${MAP_PERSISTENCE_FLUSH_INTERVAL_MS}ms`);
    }
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
        if (!this.mapPersistenceService.isEnabled()) {
            return;
        }
        if (this.flushPromise) {
            await this.flushPromise;
        }
        await this.runFlushCycle('shutdown');
    }
    async flushDirtyInstances() {
        if (!this.mapPersistenceService.isEnabled()
            || this.flushPromise
            || isRestoreFreezeActive()) {
            return;
        }
        await this.runFlushCycle('interval');
    }

    /** 采集 dirty map 并持久化，失败仅记录错误不中断主循环。 */
    async runFlushCycle(reason) {
        if (!this.mapPersistenceService.isEnabled()) {
            return;
        }

        const promise = (async () => {

            const dirtyInstanceIds = this.worldRuntimeService.listDirtyPersistentInstances();
            if (dirtyInstanceIds.length === 0) {
                return;
            }
            const prioritizedInstanceIds = prioritizeMapFlushTargets(dirtyInstanceIds);
            const batches = chunkValues(prioritizedInstanceIds, MAP_PERSISTENCE_FLUSH_BATCH_SIZE);
            for (const batch of batches) {
                await runConcurrent(batch, MAP_PERSISTENCE_FLUSH_PARALLELISM, async (instanceId) => {
                    const snapshot = this.worldRuntimeService.buildMapPersistenceSnapshot(instanceId);
                    if (!snapshot) {
                        return;
                    }
                    await retryFlush(MAP_PERSISTENCE_FLUSH_RETRY_COUNT, async () => {
                        await this.mapPersistenceService.saveMapSnapshot(instanceId, snapshot);
                    });
                    this.worldRuntimeService.markMapPersisted(instanceId);
                }, (instanceId, error) => {
                    this.logger.error(`地图持久化刷新失败（${reason}） instanceId=${instanceId}`, error instanceof Error ? error.stack : String(error));
                });
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
        }
    }
};
exports.MapPersistenceFlushService = MapPersistenceFlushService;
exports.MapPersistenceFlushService = MapPersistenceFlushService = MapPersistenceFlushService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_runtime_service_1.WorldRuntimeService,
        map_persistence_service_1.MapPersistenceService])
], MapPersistenceFlushService);
function isRestoreFreezeActive() {

    const value = process.env.SERVER_NEXT_RUNTIME_RESTORE_ACTIVE;
    return typeof value === 'string' && /^(1|true|yes|on)$/iu.test(value.trim());
}
function prioritizeMapFlushTargets(instanceIds) {
    return [...instanceIds].sort((left, right) => {
        const leftPriority = left.includes('container:') ? 0 : 1;
        const rightPriority = right.includes('container:') ? 0 : 1;
        return leftPriority - rightPriority || left.localeCompare(right);
    });
}
function chunkValues(values, chunkSize) {
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
async function runConcurrent(values, parallelism, worker, onError) {
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
async function retryFlush(retryCount, work) {
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

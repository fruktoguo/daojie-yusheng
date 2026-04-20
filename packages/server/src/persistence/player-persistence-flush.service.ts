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

var PlayerPersistenceFlushService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerPersistenceFlushService = void 0;

const common_1 = require("@nestjs/common");

const player_runtime_service_1 = require("../runtime/player/player-runtime.service");

const player_persistence_service_1 = require("./player-persistence.service");

const PLAYER_PERSISTENCE_FLUSH_INTERVAL_MS = 5000;
const PLAYER_PERSISTENCE_FLUSH_BATCH_SIZE = 24;
const PLAYER_PERSISTENCE_FLUSH_PARALLELISM = 4;
const PLAYER_PERSISTENCE_FLUSH_RETRY_COUNT = 1;

/** 玩家快照脏数据刷盘服务：定时/退出时持久化玩家运行时快照。 */
let PlayerPersistenceFlushService = PlayerPersistenceFlushService_1 = class PlayerPersistenceFlushService {
/**
 * playerRuntimeService：对象字段。
 */

    playerRuntimeService;    
    /**
 * playerPersistenceService：对象字段。
 */

    playerPersistenceService;    
    /**
 * logger：对象字段。
 */

    logger = new common_1.Logger(PlayerPersistenceFlushService_1.name);    
    /**
 * timer：对象字段。
 */

    timer = null;    
    /**
 * flushPromise：对象字段。
 */

    flushPromise = null;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @param playerPersistenceService 参数说明。
 * @returns 无返回值（构造函数）。
 */

    constructor(playerRuntimeService, playerPersistenceService) {
        this.playerRuntimeService = playerRuntimeService;
        this.playerPersistenceService = playerPersistenceService;
    }    
    /**
 * onModuleInit：执行核心业务逻辑。
 * @returns 函数返回值。
 */

    onModuleInit() {
        this.timer = setInterval(() => {
            void this.flushDirtyPlayers();
        }, PLAYER_PERSISTENCE_FLUSH_INTERVAL_MS);
        this.timer.unref();
        this.logger.log(`玩家持久化刷新已启动，间隔 ${PLAYER_PERSISTENCE_FLUSH_INTERVAL_MS}ms`);
    }    
    /**
 * onModuleDestroy：执行核心业务逻辑。
 * @returns 函数返回值。
 */

    onModuleDestroy() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /** 应用关闭前 flush 全量脏玩家，保证关键状态落库。 */
    async beforeApplicationShutdown() {
        await this.flushAllNow();
    }

    /** 立即刷单个玩家快照。 */
    async flushPlayer(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.playerPersistenceService.isEnabled()) {
            return;
        }

        const snapshot = this.playerRuntimeService.buildPersistenceSnapshot(playerId);
        if (!snapshot) {
            return;
        }
        await this.playerPersistenceService.savePlayerSnapshot(playerId, snapshot);
        this.playerRuntimeService.markPersisted(playerId);
    }    
    /**
 * flushAllNow：执行核心业务逻辑。
 * @returns 函数返回值。
 */

    async flushAllNow() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.playerPersistenceService.isEnabled()) {
            return;
        }
        if (this.flushPromise) {
            await this.flushPromise;
        }
        await this.runFlushCycle('shutdown');
    }    
    /**
 * flushDirtyPlayers：执行核心业务逻辑。
 * @returns 函数返回值。
 */

    async flushDirtyPlayers() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.playerPersistenceService.isEnabled()
            || this.flushPromise
            || isRestoreFreezeActive()) {
            return;
        }
        await this.runFlushCycle('interval');
    }    
    /**
 * runFlushCycle：执行核心业务逻辑。
 * @param reason 参数说明。
 * @returns 函数返回值。
 */

    async runFlushCycle(reason) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.playerPersistenceService.isEnabled()) {
            return;
        }

        const promise = (async () => {

            const dirtyPlayerIds = this.playerRuntimeService.listDirtyPlayers();
            if (dirtyPlayerIds.length === 0) {
                return;
            }
            const batches = chunkValues(dirtyPlayerIds, PLAYER_PERSISTENCE_FLUSH_BATCH_SIZE);
            for (const batch of batches) {
                await runConcurrent(batch, PLAYER_PERSISTENCE_FLUSH_PARALLELISM, async (playerId) => {
                    const snapshot = this.playerRuntimeService.buildPersistenceSnapshot(playerId);
                    if (!snapshot) {
                        return;
                    }
                    await retryFlush(PLAYER_PERSISTENCE_FLUSH_RETRY_COUNT, async () => {
                        await this.playerPersistenceService.savePlayerSnapshot(playerId, snapshot);
                    });
                    this.playerRuntimeService.markPersisted(playerId);
                }, (playerId, error) => {
                    this.logger.error(`玩家持久化刷新失败（${reason}） playerId=${playerId}`, error instanceof Error ? error.stack : String(error));
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
exports.PlayerPersistenceFlushService = PlayerPersistenceFlushService;
exports.PlayerPersistenceFlushService = PlayerPersistenceFlushService = PlayerPersistenceFlushService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService,
        player_persistence_service_1.PlayerPersistenceService])
], PlayerPersistenceFlushService);
/**
 * isRestoreFreezeActive：执行状态校验并返回判断结果。
 * @returns 函数返回值。
 */

function isRestoreFreezeActive() {

    const value = process.env.SERVER_NEXT_RUNTIME_RESTORE_ACTIVE;
    return typeof value === 'string' && /^(1|true|yes|on)$/iu.test(value.trim());
}
export { PlayerPersistenceFlushService };
/**
 * chunkValues：执行核心业务逻辑。
 * @param values 参数说明。
 * @param chunkSize 参数说明。
 * @returns 函数返回值。
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
 * runConcurrent：执行核心业务逻辑。
 * @param values 参数说明。
 * @param parallelism 参数说明。
 * @param worker 参数说明。
 * @param onError 参数说明。
 * @returns 函数返回值。
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
 * retryFlush：执行核心业务逻辑。
 * @param retryCount 参数说明。
 * @param work 参数说明。
 * @returns 函数返回值。
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
//# sourceMappingURL=player-persistence-flush.service.js.map

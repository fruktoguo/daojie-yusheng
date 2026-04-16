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
    playerRuntimeService;
    playerPersistenceService;
    logger = new common_1.Logger(PlayerPersistenceFlushService_1.name);
    timer = null;
    flushPromise = null;
    constructor(playerRuntimeService, playerPersistenceService) {
        this.playerRuntimeService = playerRuntimeService;
        this.playerPersistenceService = playerPersistenceService;
    }
    onModuleInit() {
        this.timer = setInterval(() => {
            void this.flushDirtyPlayers();
        }, PLAYER_PERSISTENCE_FLUSH_INTERVAL_MS);
        this.timer.unref();
        this.logger.log(`玩家持久化刷新已启动，间隔 ${PLAYER_PERSISTENCE_FLUSH_INTERVAL_MS}ms`);
    }
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
    async flushAllNow() {
        if (!this.playerPersistenceService.isEnabled()) {
            return;
        }
        if (this.flushPromise) {
            await this.flushPromise;
        }
        await this.runFlushCycle('shutdown');
    }
    async flushDirtyPlayers() {
        if (!this.playerPersistenceService.isEnabled()
            || this.flushPromise
            || isRestoreFreezeActive()) {
            return;
        }
        await this.runFlushCycle('interval');
    }
    async runFlushCycle(reason) {
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
function isRestoreFreezeActive() {

    const value = process.env.SERVER_NEXT_RUNTIME_RESTORE_ACTIVE;
    return typeof value === 'string' && /^(1|true|yes|on)$/iu.test(value.trim());
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
//# sourceMappingURL=player-persistence-flush.service.js.map

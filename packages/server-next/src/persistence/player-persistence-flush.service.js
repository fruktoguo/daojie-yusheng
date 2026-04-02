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
        this.logger.log(`Player persistence flush started at ${PLAYER_PERSISTENCE_FLUSH_INTERVAL_MS}ms interval`);
    }
    onModuleDestroy() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    async beforeApplicationShutdown() {
        await this.flushAllNow();
    }
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
            try {
                for (const playerId of dirtyPlayerIds) {
                    const snapshot = this.playerRuntimeService.buildPersistenceSnapshot(playerId);
                    if (!snapshot) {
                        continue;
                    }
                    await this.playerPersistenceService.savePlayerSnapshot(playerId, snapshot);
                    this.playerRuntimeService.markPersisted(playerId);
                }
            }
            catch (error) {
                this.logger.error(`Player persistence flush failed (${reason})`, error instanceof Error ? error.stack : String(error));
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
//# sourceMappingURL=player-persistence-flush.service.js.map

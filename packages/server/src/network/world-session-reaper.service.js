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

var WorldSessionReaperService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldSessionReaperService = void 0;

const common_1 = require("@nestjs/common");

const player_persistence_flush_service_1 = require("../persistence/player-persistence-flush.service");

const world_session_service_1 = require("./world-session.service");

const world_sync_service_1 = require("./world-sync.service");

const SESSION_REAPER_INTERVAL_MS = 1000;

let WorldSessionReaperService = WorldSessionReaperService_1 = class WorldSessionReaperService {
    worldSessionService;
    worldSyncService;
    playerPersistenceFlushService;
    logger = new common_1.Logger(WorldSessionReaperService_1.name);
    timer = null;
    running = false;
    constructor(worldSessionService, worldSyncService, playerPersistenceFlushService) {
        this.worldSessionService = worldSessionService;
        this.worldSyncService = worldSyncService;
        this.playerPersistenceFlushService = playerPersistenceFlushService;
    }
    onModuleInit() {
        this.timer = setInterval(() => {
            void this.reapExpiredSessions();
        }, SESSION_REAPER_INTERVAL_MS);
        this.timer.unref();
        this.logger.log(`会话回收器已启动，间隔 ${SESSION_REAPER_INTERVAL_MS}ms`);
    }
    onModuleDestroy() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    async reapExpiredSessions() {
        if (this.running) {
            return;
        }
        this.running = true;
        try {

            const expiredBindings = this.worldSessionService.consumeExpiredBindings();
            for (const binding of expiredBindings) {
                try {
                    await this.playerPersistenceFlushService.flushPlayer(binding.playerId);
                    this.worldSyncService.clearDetachedPlayerCaches(binding.playerId);
                }
                catch (error) {
                    this.worldSessionService.requeueExpiredBinding(binding);
                    this.logger.error(`回收玩家 ${binding.playerId} 的会话失败`, error instanceof Error ? error.stack : String(error));
                }
            }
        }
        catch (error) {
            this.logger.error('会话回收执行失败', error instanceof Error ? error.stack : String(error));
        }
        finally {
            this.running = false;
        }
    }
};
exports.WorldSessionReaperService = WorldSessionReaperService;
exports.WorldSessionReaperService = WorldSessionReaperService = WorldSessionReaperService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_session_service_1.WorldSessionService,
        world_sync_service_1.WorldSyncService,
        player_persistence_flush_service_1.PlayerPersistenceFlushService])
], WorldSessionReaperService);
//# sourceMappingURL=world-session-reaper.service.js.map




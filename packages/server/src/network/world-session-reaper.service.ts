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

var WorldSessionReaperService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldSessionReaperService = exports.WORLD_SESSION_REAPER_CONTRACT = void 0;

const common_1 = require("@nestjs/common");

const player_persistence_flush_service_1 = require("../persistence/player-persistence-flush.service");

const world_session_service_1 = require("./world-session.service");

const world_sync_service_1 = require("./world-sync.service");

const SESSION_REAPER_INTERVAL_MS = 1000;
const WORLD_SESSION_REAPER_CONTRACT = Object.freeze({
    intervalMs: SESSION_REAPER_INTERVAL_MS,
    retryOnFlushFailure: true,
    clearDetachedCachesAfterFlush: true,
});
exports.WORLD_SESSION_REAPER_CONTRACT = WORLD_SESSION_REAPER_CONTRACT;

let WorldSessionReaperService = WorldSessionReaperService_1 = class WorldSessionReaperService {
/**
 * worldSessionService：世界Session服务引用。
 */

    worldSessionService;    
    /**
 * worldSyncService：世界Sync服务引用。
 */

    worldSyncService;    
    /**
 * playerPersistenceFlushService：玩家PersistenceFlush服务引用。
 */

    playerPersistenceFlushService;    
    /**
 * logger：日志器引用。
 */

    logger = new common_1.Logger(WorldSessionReaperService_1.name);    
    /**
 * timer：timer相关字段。
 */

    timer = null;    
    /**
 * running：running相关字段。
 */

    running = false;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldSessionService 参数说明。
 * @param worldSyncService 参数说明。
 * @param playerPersistenceFlushService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(worldSessionService, worldSyncService, playerPersistenceFlushService) {
        this.worldSessionService = worldSessionService;
        this.worldSyncService = worldSyncService;
        this.playerPersistenceFlushService = playerPersistenceFlushService;
    }    
    /**
 * onModuleInit：执行on模块Init相关逻辑。
 * @returns 无返回值，直接更新on模块Init相关状态。
 */

    onModuleInit() {
        this.timer = setInterval(() => {
            void this.reapExpiredSessions();
        }, SESSION_REAPER_INTERVAL_MS);
        this.timer.unref();
        this.logger.log(`会话回收器已启动，间隔 ${SESSION_REAPER_INTERVAL_MS}ms`);
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
    /**
 * reapExpiredSessions：执行reapExpiredSession相关逻辑。
 * @returns 无返回值，直接更新reapExpiredSession相关状态。
 */

    async reapExpiredSessions() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
export { WORLD_SESSION_REAPER_CONTRACT, WorldSessionReaperService };
//# sourceMappingURL=world-session-reaper.service.js.map

"use strict";
/**
 * 世界时钟服务
 * 
 * 负责管理游戏世界的时钟和定时任务，包括：
 * - 游戏世界的时钟推进
 * - 定时任务调度
 * - 世界状态同步
 * - 地图时钟速度管理
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var WorldTickService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldTickService = void 0;
const common_1 = require("@nestjs/common");
const legacy_gm_compat_service_1 = require("../../compat/legacy/legacy-gm-compat.service");
const legacy_gm_admin_compat_service_1 = require("../../compat/legacy/http/legacy-gm-admin-compat.service");
const legacy_gm_http_compat_service_1 = require("../../compat/legacy/http/legacy-gm-http-compat.service");
const world_sync_service_1 = require("../../network/world-sync.service");
const world_runtime_service_1 = require("../world/world-runtime.service");

// ==================== 常量定义 ====================

/** 世界时钟间隔（毫秒） */
const WORLD_TICK_INTERVAL_MS = 100;

/**
 * 世界时钟服务类
 * 
 * 负责管理游戏世界的时钟和定时任务
 */
let WorldTickService = WorldTickService_1 = class WorldTickService {
    // ==================== 依赖注入的服务 ====================
    /** 遗留GM兼容服务 */
    legacyGmCompatService;
    /** 遗留GM管理兼容服务 */
    legacyGmAdminCompatService;
    /** 地图运行时配置服务 */
    mapRuntimeConfigService;
    /** 世界运行时服务 */
    worldRuntimeService;
    /** 世界同步服务 */
    worldSyncService;
    
    // ==================== 日志记录器 ====================
    /** 日志记录器实例 */
    logger = new common_1.Logger(WorldTickService_1.name);
    
    // ==================== 定时器管理 ====================
    /** 时钟定时器 */
    timer = null;
    /**
     * 构造函数
     * @param legacyGmCompatService 遗留GM兼容服务
     * @param legacyGmAdminCompatService 遗留GM管理兼容服务
     * @param mapRuntimeConfigService 地图运行时配置服务
     * @param worldRuntimeService 世界运行时服务
     * @param worldSyncService 世界同步服务
     */
    constructor(legacyGmCompatService, legacyGmAdminCompatService, mapRuntimeConfigService, worldRuntimeService, worldSyncService) {
        this.legacyGmCompatService = legacyGmCompatService;
        this.legacyGmAdminCompatService = legacyGmAdminCompatService;
        this.mapRuntimeConfigService = mapRuntimeConfigService;
        this.worldRuntimeService = worldRuntimeService;
        this.worldSyncService = worldSyncService;
    }
    
    /**
     * 获取地图时钟速度
     * 
     * @param mapId 地图ID
     * @returns 地图时钟速度（倍率）
     */
    getMapTickSpeed(mapId) {
        return this.mapRuntimeConfigService.getMapTickSpeed(mapId);
    }
    
    /**
     * 模块初始化回调
     * 
     * 启动世界时钟定时器
     */
    onModuleInit() {
        // 创建定时器
        this.timer = setInterval(() => {
            try {
                // 检查是否处于维护模式
                if (this.legacyGmAdminCompatService.isRuntimeMaintenanceActive()) {
                    return;
                }
                
                // 推进世界时钟
                this.worldRuntimeService.advanceFrame(WORLD_TICK_INTERVAL_MS, (mapId) => this.getMapTickSpeed(mapId));
                
                // 同步世界状态
                const syncStartedAt = performance.now();
                this.worldSyncService.flushConnectedPlayers();
                this.worldRuntimeService.recordSyncFlushDuration(performance.now() - syncStartedAt);
                
                // 刷新遗留GM状态推送
                this.legacyGmCompatService.flushQueuedStatePushes();
            }
            catch (error) {
                this.logger.error('World tick failed', error instanceof Error ? error.stack : String(error));
            }
        }, WORLD_TICK_INTERVAL_MS);
        this.timer.unref();
        this.logger.log(`World tick started at ${WORLD_TICK_INTERVAL_MS}ms interval`);
    }
    onModuleDestroy() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
};
exports.WorldTickService = WorldTickService;
exports.WorldTickService = WorldTickService = WorldTickService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [legacy_gm_compat_service_1.LegacyGmCompatService,
        legacy_gm_admin_compat_service_1.LegacyGmAdminCompatService,
        legacy_gm_http_compat_service_1.LegacyGmHttpCompatService,
        world_runtime_service_1.WorldRuntimeService,
        world_sync_service_1.WorldSyncService])
], WorldTickService);
//# sourceMappingURL=world-tick.service.js.map

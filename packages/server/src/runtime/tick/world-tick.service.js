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

var WorldTickService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldTickService = void 0;

const common_1 = require("@nestjs/common");

const runtime_gm_state_service_1 = require("../gm/runtime-gm-state.service");

const world_sync_service_1 = require("../../network/world-sync.service");

const runtime_map_config_service_1 = require("../map/runtime-map-config.service");

const runtime_maintenance_service_1 = require("../world/runtime-maintenance.service");

const world_runtime_service_1 = require("../world/world-runtime.service");

/** 世界主循环的固定 tick 间隔（ms），当前按 1Hz 推进。 */
const WORLD_TICK_INTERVAL_MS = 100;

let WorldTickService = WorldTickService_1 = class WorldTickService {
    runtimeGmStateService;
    runtimeMaintenanceService;
    mapRuntimeConfigService;
    worldRuntimeService;
    worldSyncService;
    /** 运行时全局日志器，记录 tick 启停和异常。 */
    logger = new common_1.Logger(WorldTickService_1.name);
    /** 当前 tick 定时器句柄。 */
    timer = null;
    /** 注入 world tick 所需的维护、地图、世界与同步服务。 */
    constructor(runtimeGmStateService, runtimeMaintenanceService, mapRuntimeConfigService, worldRuntimeService, worldSyncService) {
        this.runtimeGmStateService = runtimeGmStateService;
        this.runtimeMaintenanceService = runtimeMaintenanceService;
        this.mapRuntimeConfigService = mapRuntimeConfigService;
        this.worldRuntimeService = worldRuntimeService;
        this.worldSyncService = worldSyncService;
    }
    /** 读取某张地图的 tick 倍速，让 world runtime 按地图配置推进。 */
    getMapTickSpeed(mapId) {
        return this.mapRuntimeConfigService.getMapTickSpeed(mapId);
    }
    onModuleInit() {
        this.timer = setInterval(() => {
            try {
                if (this.runtimeMaintenanceService.isRuntimeMaintenanceActive()) {
                    return;
                }
                this.worldRuntimeService.advanceFrame(WORLD_TICK_INTERVAL_MS, (mapId) => this.getMapTickSpeed(mapId));

                const syncStartedAt = performance.now();
                this.worldSyncService.flushConnectedPlayers();
                this.worldRuntimeService.recordSyncFlushDuration(performance.now() - syncStartedAt);
                this.runtimeGmStateService.flushQueuedStatePushes();
            }
            catch (error) {
                this.logger.error('世界 Tick 执行失败', error instanceof Error ? error.stack : String(error));
            }
        }, WORLD_TICK_INTERVAL_MS);
        this.timer.unref();
        this.logger.log(`世界 Tick 已启动，间隔 ${WORLD_TICK_INTERVAL_MS}ms`);
    }
    /** 停止 tick 定时器，避免服务销毁后继续推进状态。 */
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
    __metadata("design:paramtypes", [runtime_gm_state_service_1.RuntimeGmStateService,
        runtime_maintenance_service_1.RuntimeMaintenanceService,
        runtime_map_config_service_1.RuntimeMapConfigService,
        world_runtime_service_1.WorldRuntimeService,
        world_sync_service_1.WorldSyncService])
], WorldTickService);
//# sourceMappingURL=world-tick.service.js.map


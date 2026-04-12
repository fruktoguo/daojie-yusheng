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
const WORLD_TICK_INTERVAL_MS = 100;
let WorldTickService = WorldTickService_1 = class WorldTickService {
    runtimeGmStateService;
    runtimeMaintenanceService;
    mapRuntimeConfigService;
    worldRuntimeService;
    worldSyncService;
    logger = new common_1.Logger(WorldTickService_1.name);
    timer = null;
    constructor(runtimeGmStateService, runtimeMaintenanceService, mapRuntimeConfigService, worldRuntimeService, worldSyncService) {
        this.runtimeGmStateService = runtimeGmStateService;
        this.runtimeMaintenanceService = runtimeMaintenanceService;
        this.mapRuntimeConfigService = mapRuntimeConfigService;
        this.worldRuntimeService = worldRuntimeService;
        this.worldSyncService = worldSyncService;
    }
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
    __metadata("design:paramtypes", [runtime_gm_state_service_1.RuntimeGmStateService,
        runtime_maintenance_service_1.RuntimeMaintenanceService,
        runtime_map_config_service_1.RuntimeMapConfigService,
        world_runtime_service_1.WorldRuntimeService,
        world_sync_service_1.WorldSyncService])
], WorldTickService);
//# sourceMappingURL=world-tick.service.js.map

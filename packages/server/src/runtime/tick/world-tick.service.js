"use strict";
/** __decorate：定义该变量以承载业务值。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** __metadata：定义该变量以承载业务值。 */
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
/** WorldTickService_1：定义该变量以承载业务值。 */
var WorldTickService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldTickService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** runtime_gm_state_service_1：定义该变量以承载业务值。 */
const runtime_gm_state_service_1 = require("../gm/runtime-gm-state.service");
/** world_sync_service_1：定义该变量以承载业务值。 */
const world_sync_service_1 = require("../../network/world-sync.service");
/** runtime_map_config_service_1：定义该变量以承载业务值。 */
const runtime_map_config_service_1 = require("../map/runtime-map-config.service");
/** runtime_maintenance_service_1：定义该变量以承载业务值。 */
const runtime_maintenance_service_1 = require("../world/runtime-maintenance.service");
/** world_runtime_service_1：定义该变量以承载业务值。 */
const world_runtime_service_1 = require("../world/world-runtime.service");
/** WORLD_TICK_INTERVAL_MS：定义该变量以承载业务值。 */
const WORLD_TICK_INTERVAL_MS = 100;
/** WorldTickService：定义该变量以承载业务值。 */
let WorldTickService = WorldTickService_1 = class WorldTickService {
    runtimeGmStateService;
    runtimeMaintenanceService;
    mapRuntimeConfigService;
    worldRuntimeService;
    worldSyncService;
    logger = new common_1.Logger(WorldTickService_1.name);
    timer = null;
/** 构造函数：执行实例初始化流程。 */
    constructor(runtimeGmStateService, runtimeMaintenanceService, mapRuntimeConfigService, worldRuntimeService, worldSyncService) {
        this.runtimeGmStateService = runtimeGmStateService;
        this.runtimeMaintenanceService = runtimeMaintenanceService;
        this.mapRuntimeConfigService = mapRuntimeConfigService;
        this.worldRuntimeService = worldRuntimeService;
        this.worldSyncService = worldSyncService;
    }
/** getMapTickSpeed：执行对应的业务逻辑。 */
    getMapTickSpeed(mapId) {
        return this.mapRuntimeConfigService.getMapTickSpeed(mapId);
    }
/** onModuleInit：执行对应的业务逻辑。 */
    onModuleInit() {
        this.timer = setInterval(() => {
            try {
                if (this.runtimeMaintenanceService.isRuntimeMaintenanceActive()) {
                    return;
                }
                this.worldRuntimeService.advanceFrame(WORLD_TICK_INTERVAL_MS, (mapId) => this.getMapTickSpeed(mapId));
/** syncStartedAt：定义该变量以承载业务值。 */
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
/** onModuleDestroy：执行对应的业务逻辑。 */
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

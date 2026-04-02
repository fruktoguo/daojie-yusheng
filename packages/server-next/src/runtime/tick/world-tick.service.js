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
const legacy_gm_compat_service_1 = require("../../compat/legacy/legacy-gm-compat.service");
const legacy_gm_admin_compat_service_1 = require("../../compat/legacy/http/legacy-gm-admin-compat.service");
const legacy_gm_http_compat_service_1 = require("../../compat/legacy/http/legacy-gm-http-compat.service");
const world_sync_service_1 = require("../../network/world-sync.service");
const world_runtime_service_1 = require("../world/world-runtime.service");
const WORLD_TICK_INTERVAL_MS = 100;
let WorldTickService = WorldTickService_1 = class WorldTickService {
    legacyGmCompatService;
    legacyGmAdminCompatService;
    mapRuntimeConfigService;
    worldRuntimeService;
    worldSyncService;
    logger = new common_1.Logger(WorldTickService_1.name);
    timer = null;
    constructor(legacyGmCompatService, legacyGmAdminCompatService, mapRuntimeConfigService, worldRuntimeService, worldSyncService) {
        this.legacyGmCompatService = legacyGmCompatService;
        this.legacyGmAdminCompatService = legacyGmAdminCompatService;
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
                if (this.legacyGmAdminCompatService.isRuntimeMaintenanceActive()) {
                    return;
                }
                this.worldRuntimeService.advanceFrame(WORLD_TICK_INTERVAL_MS, (mapId) => this.getMapTickSpeed(mapId));
                const syncStartedAt = performance.now();
                this.worldSyncService.flushConnectedPlayers();
                this.worldRuntimeService.recordSyncFlushDuration(performance.now() - syncStartedAt);
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

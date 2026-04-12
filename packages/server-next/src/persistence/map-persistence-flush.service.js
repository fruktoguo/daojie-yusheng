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
/** MapPersistenceFlushService_1：定义该变量以承载业务值。 */
var MapPersistenceFlushService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MapPersistenceFlushService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** world_runtime_service_1：定义该变量以承载业务值。 */
const world_runtime_service_1 = require("../runtime/world/world-runtime.service");
/** map_persistence_service_1：定义该变量以承载业务值。 */
const map_persistence_service_1 = require("./map-persistence.service");
/** MAP_PERSISTENCE_FLUSH_INTERVAL_MS：定义该变量以承载业务值。 */
const MAP_PERSISTENCE_FLUSH_INTERVAL_MS = 5000;
/** MapPersistenceFlushService：定义该变量以承载业务值。 */
let MapPersistenceFlushService = MapPersistenceFlushService_1 = class MapPersistenceFlushService {
    worldRuntimeService;
    mapPersistenceService;
    logger = new common_1.Logger(MapPersistenceFlushService_1.name);
    timer = null;
    flushPromise = null;
/** 构造函数：执行实例初始化流程。 */
    constructor(worldRuntimeService, mapPersistenceService) {
        this.worldRuntimeService = worldRuntimeService;
        this.mapPersistenceService = mapPersistenceService;
    }
/** onModuleInit：执行对应的业务逻辑。 */
    onModuleInit() {
        this.timer = setInterval(() => {
            void this.flushDirtyInstances();
        }, MAP_PERSISTENCE_FLUSH_INTERVAL_MS);
        this.timer.unref();
        this.logger.log(`Map persistence flush started at ${MAP_PERSISTENCE_FLUSH_INTERVAL_MS}ms interval`);
    }
/** onModuleDestroy：执行对应的业务逻辑。 */
    onModuleDestroy() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
/** beforeApplicationShutdown：执行对应的业务逻辑。 */
    async beforeApplicationShutdown() {
        await this.flushAllNow();
    }
/** flushAllNow：执行对应的业务逻辑。 */
    async flushAllNow() {
        if (!this.mapPersistenceService.isEnabled()) {
            return;
        }
        if (this.flushPromise) {
            await this.flushPromise;
        }
        await this.runFlushCycle('shutdown');
    }
/** flushDirtyInstances：执行对应的业务逻辑。 */
    async flushDirtyInstances() {
        if (!this.mapPersistenceService.isEnabled()
            || this.flushPromise
            || isRestoreFreezeActive()) {
            return;
        }
        await this.runFlushCycle('interval');
    }
/** runFlushCycle：执行对应的业务逻辑。 */
    async runFlushCycle(reason) {
        if (!this.mapPersistenceService.isEnabled()) {
            return;
        }
/** promise：定义该变量以承载业务值。 */
        const promise = (async () => {
/** dirtyInstanceIds：定义该变量以承载业务值。 */
            const dirtyInstanceIds = this.worldRuntimeService.listDirtyPersistentInstances();
            if (dirtyInstanceIds.length === 0) {
                return;
            }
            try {
                for (const instanceId of dirtyInstanceIds) {
                    const snapshot = this.worldRuntimeService.buildMapPersistenceSnapshot(instanceId);
                    if (!snapshot) {
                        continue;
                    }
                    await this.mapPersistenceService.saveMapSnapshot(instanceId, snapshot);
                    this.worldRuntimeService.markMapPersisted(instanceId);
                }
            }
            catch (error) {
                this.logger.error(`Map persistence flush failed (${reason})`, error instanceof Error ? error.stack : String(error));
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
exports.MapPersistenceFlushService = MapPersistenceFlushService;
exports.MapPersistenceFlushService = MapPersistenceFlushService = MapPersistenceFlushService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_runtime_service_1.WorldRuntimeService,
        map_persistence_service_1.MapPersistenceService])
], MapPersistenceFlushService);
/** isRestoreFreezeActive：执行对应的业务逻辑。 */
function isRestoreFreezeActive() {
/** value：定义该变量以承载业务值。 */
    const value = process.env.SERVER_NEXT_RUNTIME_RESTORE_ACTIVE;
    return typeof value === 'string' && /^(1|true|yes|on)$/iu.test(value.trim());
}
//# sourceMappingURL=map-persistence-flush.service.js.map

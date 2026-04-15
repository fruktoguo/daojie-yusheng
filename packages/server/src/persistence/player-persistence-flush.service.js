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
/** PlayerPersistenceFlushService_1：定义该变量以承载业务值。 */
var PlayerPersistenceFlushService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerPersistenceFlushService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** player_runtime_service_1：定义该变量以承载业务值。 */
const player_runtime_service_1 = require("../runtime/player/player-runtime.service");
/** player_persistence_service_1：定义该变量以承载业务值。 */
const player_persistence_service_1 = require("./player-persistence.service");
/** PLAYER_PERSISTENCE_FLUSH_INTERVAL_MS：定义该变量以承载业务值。 */
const PLAYER_PERSISTENCE_FLUSH_INTERVAL_MS = 5000;
/** PlayerPersistenceFlushService：定义该变量以承载业务值。 */
let PlayerPersistenceFlushService = PlayerPersistenceFlushService_1 = class PlayerPersistenceFlushService {
    playerRuntimeService;
    playerPersistenceService;
    logger = new common_1.Logger(PlayerPersistenceFlushService_1.name);
    timer = null;
    flushPromise = null;
/** 构造函数：执行实例初始化流程。 */
    constructor(playerRuntimeService, playerPersistenceService) {
        this.playerRuntimeService = playerRuntimeService;
        this.playerPersistenceService = playerPersistenceService;
    }
/** onModuleInit：执行对应的业务逻辑。 */
    onModuleInit() {
        this.timer = setInterval(() => {
            void this.flushDirtyPlayers();
        }, PLAYER_PERSISTENCE_FLUSH_INTERVAL_MS);
        this.timer.unref();
        this.logger.log(`玩家持久化刷新已启动，间隔 ${PLAYER_PERSISTENCE_FLUSH_INTERVAL_MS}ms`);
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
/** flushPlayer：执行对应的业务逻辑。 */
    async flushPlayer(playerId) {
        if (!this.playerPersistenceService.isEnabled()) {
            return;
        }
/** snapshot：定义该变量以承载业务值。 */
        const snapshot = this.playerRuntimeService.buildPersistenceSnapshot(playerId);
        if (!snapshot) {
            return;
        }
        await this.playerPersistenceService.savePlayerSnapshot(playerId, snapshot);
        this.playerRuntimeService.markPersisted(playerId);
    }
/** flushAllNow：执行对应的业务逻辑。 */
    async flushAllNow() {
        if (!this.playerPersistenceService.isEnabled()) {
            return;
        }
        if (this.flushPromise) {
            await this.flushPromise;
        }
        await this.runFlushCycle('shutdown');
    }
/** flushDirtyPlayers：执行对应的业务逻辑。 */
    async flushDirtyPlayers() {
        if (!this.playerPersistenceService.isEnabled()
            || this.flushPromise
            || isRestoreFreezeActive()) {
            return;
        }
        await this.runFlushCycle('interval');
    }
/** runFlushCycle：执行对应的业务逻辑。 */
    async runFlushCycle(reason) {
        if (!this.playerPersistenceService.isEnabled()) {
            return;
        }
/** promise：定义该变量以承载业务值。 */
        const promise = (async () => {
/** dirtyPlayerIds：定义该变量以承载业务值。 */
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
                this.logger.error(`玩家持久化刷新失败（${reason}）`, error instanceof Error ? error.stack : String(error));
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
/** isRestoreFreezeActive：执行对应的业务逻辑。 */
function isRestoreFreezeActive() {
/** value：定义该变量以承载业务值。 */
    const value = process.env.SERVER_NEXT_RUNTIME_RESTORE_ACTIVE;
    return typeof value === 'string' && /^(1|true|yes|on)$/iu.test(value.trim());
}
//# sourceMappingURL=player-persistence-flush.service.js.map

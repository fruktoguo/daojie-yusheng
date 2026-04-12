"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
        r = Reflect.decorate(decorators, target, key, desc);
    else
        for (var i = decorators.length - 1; i >= 0; i--)
            if (d = decorators[i])
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** __metadata：定义该变量以承载业务值。 */
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function")
        return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyDatabaseRestoreCoordinatorService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** world_sync_service_1：定义该变量以承载业务值。 */
const world_sync_service_1 = require("../../../network/world-sync.service");
/** world_session_service_1：定义该变量以承载业务值。 */
const world_session_service_1 = require("../../../network/world-session.service");
/** map_persistence_flush_service_1：定义该变量以承载业务值。 */
const map_persistence_flush_service_1 = require("../../../persistence/map-persistence-flush.service");
/** player_persistence_flush_service_1：定义该变量以承载业务值。 */
const player_persistence_flush_service_1 = require("../../../persistence/player-persistence-flush.service");
/** mail_runtime_service_1：定义该变量以承载业务值。 */
const mail_runtime_service_1 = require("../../../runtime/mail/mail-runtime.service");
/** market_runtime_service_1：定义该变量以承载业务值。 */
const market_runtime_service_1 = require("../../../runtime/market/market-runtime.service");
/** player_runtime_service_1：定义该变量以承载业务值。 */
const player_runtime_service_1 = require("../../../runtime/player/player-runtime.service");
/** suggestion_runtime_service_1：定义该变量以承载业务值。 */
const suggestion_runtime_service_1 = require("../../../runtime/suggestion/suggestion-runtime.service");
/** runtime_gm_auth_service_1：定义该变量以承载业务值。 */
const runtime_gm_auth_service_1 = require("../../../runtime/gm/runtime-gm-auth.service");
/** world_runtime_service_1：定义该变量以承载业务值。 */
const world_runtime_service_1 = require("../../../runtime/world/world-runtime.service");
/** LegacyDatabaseRestoreCoordinatorService：定义该变量以承载业务值。 */
let LegacyDatabaseRestoreCoordinatorService = class LegacyDatabaseRestoreCoordinatorService {
    worldSessionService;
    worldRuntimeService;
    worldSyncService;
    playerPersistenceFlushService;
    mapPersistenceFlushService;
    playerRuntimeService;
    mailRuntimeService;
    marketRuntimeService;
    suggestionRuntimeService;
    runtimeGmAuthService;
/** 构造函数：执行实例初始化流程。 */
    constructor(worldSessionService, worldRuntimeService, worldSyncService, playerPersistenceFlushService, mapPersistenceFlushService, playerRuntimeService, mailRuntimeService, marketRuntimeService, suggestionRuntimeService, runtimeGmAuthService) {
        this.worldSessionService = worldSessionService;
        this.worldRuntimeService = worldRuntimeService;
        this.worldSyncService = worldSyncService;
        this.playerPersistenceFlushService = playerPersistenceFlushService;
        this.mapPersistenceFlushService = mapPersistenceFlushService;
        this.playerRuntimeService = playerRuntimeService;
        this.mailRuntimeService = mailRuntimeService;
        this.marketRuntimeService = marketRuntimeService;
        this.suggestionRuntimeService = suggestionRuntimeService;
        this.runtimeGmAuthService = runtimeGmAuthService;
    }
/** prepareForRestore：执行对应的业务逻辑。 */
    async prepareForRestore() {
        await this.playerPersistenceFlushService.flushAllNow();
        await this.mapPersistenceFlushService.flushAllNow();
/** runtimePlayerIds：定义该变量以承载业务值。 */
        const runtimePlayerIds = this.playerRuntimeService.listPlayerSnapshots().map((entry) => entry.playerId);
        this.worldSessionService.purgeAllSessions('database_restore');
        for (const playerId of runtimePlayerIds) {
            this.worldRuntimeService.removePlayer(playerId);
            this.worldSyncService.clearDetachedPlayerCaches(playerId);
        }
        this.mailRuntimeService.clearRuntimeCache();
    }
/** reloadAfterRestore：执行对应的业务逻辑。 */
    async reloadAfterRestore() {
        await this.worldRuntimeService.rebuildPersistentRuntimeAfterRestore();
        await this.marketRuntimeService.reloadFromPersistence();
        this.mailRuntimeService.clearRuntimeCache();
        await this.suggestionRuntimeService.reloadFromPersistence();
        await this.runtimeGmAuthService.reloadPasswordRecordFromPersistence();
    }
};
exports.LegacyDatabaseRestoreCoordinatorService = LegacyDatabaseRestoreCoordinatorService;
exports.LegacyDatabaseRestoreCoordinatorService = LegacyDatabaseRestoreCoordinatorService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_session_service_1.WorldSessionService,
        world_runtime_service_1.WorldRuntimeService,
        world_sync_service_1.WorldSyncService,
        player_persistence_flush_service_1.PlayerPersistenceFlushService,
        map_persistence_flush_service_1.MapPersistenceFlushService,
        player_runtime_service_1.PlayerRuntimeService,
        mail_runtime_service_1.MailRuntimeService,
        market_runtime_service_1.MarketRuntimeService,
        suggestion_runtime_service_1.SuggestionRuntimeService,
        runtime_gm_auth_service_1.RuntimeGmAuthService])
], LegacyDatabaseRestoreCoordinatorService);

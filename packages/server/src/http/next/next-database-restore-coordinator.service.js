"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
        r = Reflect.decorate(decorators, target, key, desc);
    else
        for (var i = decorators.length - 1; i >= 0; i--)
            if (d = decorators[i])
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function")
        return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NextDatabaseRestoreCoordinatorService = void 0;

const common_1 = require("@nestjs/common");

const world_sync_service_1 = require("../../network/world-sync.service");

const world_session_service_1 = require("../../network/world-session.service");

const map_persistence_flush_service_1 = require("../../persistence/map-persistence-flush.service");

const player_persistence_flush_service_1 = require("../../persistence/player-persistence-flush.service");

const mail_runtime_service_1 = require("../../runtime/mail/mail-runtime.service");

const market_runtime_service_1 = require("../../runtime/market/market-runtime.service");

const player_runtime_service_1 = require("../../runtime/player/player-runtime.service");

const suggestion_runtime_service_1 = require("../../runtime/suggestion/suggestion-runtime.service");

const runtime_gm_auth_service_1 = require("../../runtime/gm/runtime-gm-auth.service");
const next_gm_contract_1 = require("./next-gm-contract");

const world_runtime_service_1 = require("../../runtime/world/world-runtime.service");

let NextDatabaseRestoreCoordinatorService = class NextDatabaseRestoreCoordinatorService {
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
    async prepareForRestore() {
        if (next_gm_contract_1.NEXT_GM_RESTORE_CONTRACT.flushPlayersBeforeRestore) {
            await this.playerPersistenceFlushService.flushAllNow();
        }
        if (next_gm_contract_1.NEXT_GM_RESTORE_CONTRACT.flushMapsBeforeRestore) {
            await this.mapPersistenceFlushService.flushAllNow();
        }

        const runtimePlayerIds = this.playerRuntimeService.listPlayerSnapshots().map((entry) => entry.playerId);
        if (next_gm_contract_1.NEXT_GM_RESTORE_CONTRACT.purgeSessionsBeforeRestore) {
            this.worldSessionService.purgeAllSessions('database_restore');
        }
        for (const playerId of runtimePlayerIds) {
            this.worldRuntimeService.removePlayer(playerId);
            if (next_gm_contract_1.NEXT_GM_RESTORE_CONTRACT.clearDetachedCachesBeforeRestore) {
                this.worldSyncService.clearDetachedPlayerCaches(playerId);
            }
        }
        this.mailRuntimeService.clearRuntimeCache();
    }
    async reloadAfterRestore() {
        if (next_gm_contract_1.NEXT_GM_RESTORE_CONTRACT.reloadWorldRuntimeAfterRestore) {
            await this.worldRuntimeService.rebuildPersistentRuntimeAfterRestore();
        }
        if (next_gm_contract_1.NEXT_GM_RESTORE_CONTRACT.reloadMarketAfterRestore) {
            await this.marketRuntimeService.reloadFromPersistence();
        }
        this.mailRuntimeService.clearRuntimeCache();
        if (next_gm_contract_1.NEXT_GM_RESTORE_CONTRACT.reloadSuggestionAfterRestore) {
            await this.suggestionRuntimeService.reloadFromPersistence();
        }
        if (next_gm_contract_1.NEXT_GM_RESTORE_CONTRACT.reloadGmAuthAfterRestore) {
            await this.runtimeGmAuthService.reloadPasswordRecordFromPersistence();
        }
    }
};
exports.NextDatabaseRestoreCoordinatorService = NextDatabaseRestoreCoordinatorService;
exports.NextDatabaseRestoreCoordinatorService = NextDatabaseRestoreCoordinatorService = __decorate([
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
], NextDatabaseRestoreCoordinatorService);


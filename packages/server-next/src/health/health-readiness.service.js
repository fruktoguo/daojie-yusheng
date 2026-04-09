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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthReadinessService = void 0;
const common_1 = require("@nestjs/common");
const health_readiness_1 = require("./health-readiness");
const mail_persistence_service_1 = require("../persistence/mail-persistence.service");
const market_persistence_service_1 = require("../persistence/market-persistence.service");
const player_persistence_service_1 = require("../persistence/player-persistence.service");
const suggestion_persistence_service_1 = require("../persistence/suggestion-persistence.service");
const world_runtime_service_1 = require("../runtime/world/world-runtime.service");
const server_readiness_dependencies_service_1 = require("./server-readiness-dependencies.service");
let HealthReadinessService = class HealthReadinessService {
    playerPersistenceService;
    mailPersistenceService;
    marketPersistenceService;
    suggestionPersistenceService;
    serverReadinessDependenciesService;
    worldRuntimeService;
    constructor(playerPersistenceService, mailPersistenceService, marketPersistenceService, suggestionPersistenceService, serverReadinessDependenciesService, worldRuntimeService) {
        this.playerPersistenceService = playerPersistenceService;
        this.mailPersistenceService = mailPersistenceService;
        this.marketPersistenceService = marketPersistenceService;
        this.suggestionPersistenceService = suggestionPersistenceService;
        this.serverReadinessDependenciesService = serverReadinessDependenciesService;
        this.worldRuntimeService = worldRuntimeService;
    }
    build() {
        return (0, health_readiness_1.buildHealthResponse)({
            playerPersistenceService: this.playerPersistenceService,
            mailPersistenceService: this.mailPersistenceService,
            marketPersistenceService: this.marketPersistenceService,
            suggestionPersistenceService: this.suggestionPersistenceService,
            ...this.serverReadinessDependenciesService.build(),
            worldRuntimeService: this.worldRuntimeService,
        });
    }
    isReadyForPlayerTraffic() {
        return this.build().readiness.ok;
    }
};
exports.HealthReadinessService = HealthReadinessService;
exports.HealthReadinessService = HealthReadinessService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __param(5, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [player_persistence_service_1.PlayerPersistenceService,
        mail_persistence_service_1.MailPersistenceService,
        market_persistence_service_1.MarketPersistenceService,
        suggestion_persistence_service_1.SuggestionPersistenceService,
        server_readiness_dependencies_service_1.ServerReadinessDependenciesService,
        world_runtime_service_1.WorldRuntimeService])
], HealthReadinessService);

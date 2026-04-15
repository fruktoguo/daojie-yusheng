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
/** __param：定义该变量以承载业务值。 */
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthReadinessService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** health_readiness_1：定义该变量以承载业务值。 */
const health_readiness_1 = require("./health-readiness");
/** mail_persistence_service_1：定义该变量以承载业务值。 */
const mail_persistence_service_1 = require("../persistence/mail-persistence.service");
/** market_persistence_service_1：定义该变量以承载业务值。 */
const market_persistence_service_1 = require("../persistence/market-persistence.service");
/** player_persistence_service_1：定义该变量以承载业务值。 */
const player_persistence_service_1 = require("../persistence/player-persistence.service");
/** suggestion_persistence_service_1：定义该变量以承载业务值。 */
const suggestion_persistence_service_1 = require("../persistence/suggestion-persistence.service");
/** world_runtime_service_1：定义该变量以承载业务值。 */
const world_runtime_service_1 = require("../runtime/world/world-runtime.service");
/** server_readiness_dependencies_service_1：定义该变量以承载业务值。 */
const server_readiness_dependencies_service_1 = require("./server-readiness-dependencies.service");
/** HealthReadinessService：定义该变量以承载业务值。 */
let HealthReadinessService = class HealthReadinessService {
    playerPersistenceService;
    mailPersistenceService;
    marketPersistenceService;
    suggestionPersistenceService;
    serverReadinessDependenciesService;
    worldRuntimeService;
/** 构造函数：执行实例初始化流程。 */
    constructor(playerPersistenceService, mailPersistenceService, marketPersistenceService, suggestionPersistenceService, serverReadinessDependenciesService, worldRuntimeService) {
        this.playerPersistenceService = playerPersistenceService;
        this.mailPersistenceService = mailPersistenceService;
        this.marketPersistenceService = marketPersistenceService;
        this.suggestionPersistenceService = suggestionPersistenceService;
        this.serverReadinessDependenciesService = serverReadinessDependenciesService;
        this.worldRuntimeService = worldRuntimeService;
    }
/** build：执行对应的业务逻辑。 */
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
/** isReadyForPlayerTraffic：执行对应的业务逻辑。 */
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

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
exports.NextGmMailService = void 0;

const common_1 = require("@nestjs/common");

const next_gm_contract_1 = require("./next-gm-contract");

const next_gm_constants_1 = require("./next-gm.constants");

const mail_runtime_service_1 = require("../../runtime/mail/mail-runtime.service");

const player_persistence_service_1 = require("../../persistence/player-persistence.service");

const player_runtime_service_1 = require("../../runtime/player/player-runtime.service");

let NextGmMailService = class NextGmMailService {
    mailRuntimeService;
    playerPersistenceService;
    playerRuntimeService;
    constructor(mailRuntimeService, playerPersistenceService, playerRuntimeService) {
        this.mailRuntimeService = mailRuntimeService;
        this.playerPersistenceService = playerPersistenceService;
        this.playerRuntimeService = playerRuntimeService;
    }
    async createDirectMail(playerId, input) {
        return this.mailRuntimeService.createDirectMail(playerId, input ?? {});
    }
    async collectBroadcastRecipientPlayerIds() {

        const runtimePlayerIds = this.playerRuntimeService.listPlayerSnapshots()
            .filter((entry) => !(0, next_gm_constants_1.isNextGmBotPlayerId)(entry.playerId))
            .map((entry) => entry.playerId);
        const deliveredPlayerIds = new Set(runtimePlayerIds);
        if (next_gm_contract_1.NEXT_GM_MAIL_RECIPIENT_CONTRACT.persistedFallbackRecipients !== 'persisted_non_runtime_non_bot_players') {
            return runtimePlayerIds;
        }
        const persistedEntries = await this.playerPersistenceService.listPlayerSnapshots();
        for (const entry of persistedEntries) {
            if ((0, next_gm_constants_1.isNextGmBotPlayerId)(entry.playerId) || deliveredPlayerIds.has(entry.playerId)) {
                continue;
            }
            deliveredPlayerIds.add(entry.playerId);
        }
        return Array.from(deliveredPlayerIds);
    }
    async createBroadcastMail(input) {
        const deliveredMailIds = [];
        const batchId = `broadcast:${Date.now().toString(36)}`;
        for (const playerId of await this.collectBroadcastRecipientPlayerIds()) {
            deliveredMailIds.push(await this.mailRuntimeService.createDirectMail(playerId, input ?? {}));
        }
        return {
            mailId: deliveredMailIds[0] ?? batchId,
            batchId,
            recipientCount: deliveredMailIds.length,
        };
    }
};
exports.NextGmMailService = NextGmMailService;
exports.NextGmMailService = NextGmMailService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [mail_runtime_service_1.MailRuntimeService,
        player_persistence_service_1.PlayerPersistenceService,
        player_runtime_service_1.PlayerRuntimeService])
], NextGmMailService);


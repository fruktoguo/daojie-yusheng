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
exports.LegacyGmMailCompatService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** legacy_gm_compat_constants_1：定义该变量以承载业务值。 */
const legacy_gm_compat_constants_1 = require("../legacy-gm-compat.constants");
/** mail_runtime_service_1：定义该变量以承载业务值。 */
const mail_runtime_service_1 = require("../../../runtime/mail/mail-runtime.service");
/** player_persistence_service_1：定义该变量以承载业务值。 */
const player_persistence_service_1 = require("../../../persistence/player-persistence.service");
/** player_runtime_service_1：定义该变量以承载业务值。 */
const player_runtime_service_1 = require("../../../runtime/player/player-runtime.service");
/** LegacyGmMailCompatService：定义该变量以承载业务值。 */
let LegacyGmMailCompatService = class LegacyGmMailCompatService {
    mailRuntimeService;
    playerPersistenceService;
    playerRuntimeService;
/** 构造函数：执行实例初始化流程。 */
    constructor(mailRuntimeService, playerPersistenceService, playerRuntimeService) {
        this.mailRuntimeService = mailRuntimeService;
        this.playerPersistenceService = playerPersistenceService;
        this.playerRuntimeService = playerRuntimeService;
    }
/** createDirectMail：执行对应的业务逻辑。 */
    async createDirectMail(playerId, input) {
        return this.mailRuntimeService.createDirectMail(playerId, input ?? {});
    }
/** createBroadcastMail：执行对应的业务逻辑。 */
    async createBroadcastMail(input) {
/** runtimePlayerIds：定义该变量以承载业务值。 */
        const runtimePlayerIds = this.playerRuntimeService.listPlayerSnapshots()
            .filter((entry) => !(0, legacy_gm_compat_constants_1.isLegacyGmCompatBotPlayerId)(entry.playerId))
            .map((entry) => entry.playerId);
/** persistedEntries：定义该变量以承载业务值。 */
        const persistedEntries = await this.playerPersistenceService.listPlayerSnapshots();
/** deliveredPlayerIds：定义该变量以承载业务值。 */
        const deliveredPlayerIds = new Set(runtimePlayerIds);
/** deliveredMailIds：定义该变量以承载业务值。 */
        const deliveredMailIds = [];
/** batchId：定义该变量以承载业务值。 */
        const batchId = `broadcast:${Date.now().toString(36)}`;
        for (const playerId of runtimePlayerIds) {
            deliveredMailIds.push(await this.mailRuntimeService.createDirectMail(playerId, input ?? {}));
        }
        for (const entry of persistedEntries) {
            if ((0, legacy_gm_compat_constants_1.isLegacyGmCompatBotPlayerId)(entry.playerId) || deliveredPlayerIds.has(entry.playerId)) {
                continue;
            }
            deliveredMailIds.push(await this.mailRuntimeService.createDirectMail(entry.playerId, input ?? {}));
            deliveredPlayerIds.add(entry.playerId);
        }
        return {
            mailId: deliveredMailIds[0] ?? batchId,
            batchId,
            recipientCount: deliveredMailIds.length,
        };
    }
};
exports.LegacyGmMailCompatService = LegacyGmMailCompatService;
exports.LegacyGmMailCompatService = LegacyGmMailCompatService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [mail_runtime_service_1.MailRuntimeService,
        player_persistence_service_1.PlayerPersistenceService,
        player_runtime_service_1.PlayerRuntimeService])
], LegacyGmMailCompatService);

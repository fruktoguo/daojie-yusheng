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

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeRedeemCodeService = void 0;

const common_1 = require("@nestjs/common");
const redeem_code_runtime_service_1 = require("../redeem/redeem-code-runtime.service");
const world_session_service_1 = require("../../network/world-session.service");
const world_client_event_service_1 = require("../../network/world-client-event.service");

/** world-runtime redeem-code orchestration：承接兑换码结算与结果回推。 */
let WorldRuntimeRedeemCodeService = class WorldRuntimeRedeemCodeService {
    redeemCodeRuntimeService;
    worldSessionService;
    worldClientEventService;
    constructor(redeemCodeRuntimeService, worldSessionService, worldClientEventService) {
        this.redeemCodeRuntimeService = redeemCodeRuntimeService;
        this.worldSessionService = worldSessionService;
        this.worldClientEventService = worldClientEventService;
    }
    dispatchRedeemCodes(playerId, codes, deps) {
        this.redeemCodeRuntimeService.redeemCodes(playerId, codes)
            .then((payload) => {
            const socket = this.worldSessionService.getSocketByPlayerId(playerId);
            if (socket) {
                this.worldClientEventService.emitRedeemCodesResult(socket, { result: payload });
            }
        })
            .catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            deps.logger.warn(`处理玩家 ${playerId} 的兑换码失败：${message}`);
            deps.queuePlayerNotice(playerId, message, 'warn');
        });
    }
};
exports.WorldRuntimeRedeemCodeService = WorldRuntimeRedeemCodeService;
exports.WorldRuntimeRedeemCodeService = WorldRuntimeRedeemCodeService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redeem_code_runtime_service_1.RedeemCodeRuntimeService,
        world_session_service_1.WorldSessionService,
        world_client_event_service_1.WorldClientEventService])
], WorldRuntimeRedeemCodeService);

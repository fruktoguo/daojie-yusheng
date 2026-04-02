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
exports.LegacyGmRedeemCodeController = void 0;
const common_1 = require("@nestjs/common");
const legacy_gm_http_auth_guard_1 = require("./legacy-gm-http-auth.guard");
const redeem_code_runtime_service_1 = require("../../../runtime/redeem/redeem-code-runtime.service");
let LegacyGmRedeemCodeController = class LegacyGmRedeemCodeController {
    redeemCodeRuntimeService;
    constructor(redeemCodeRuntimeService) {
        this.redeemCodeRuntimeService = redeemCodeRuntimeService;
    }
    getRedeemCodeGroups() {
        return this.redeemCodeRuntimeService.listGroups();
    }
    createRedeemCodeGroup(body) {
        return this.redeemCodeRuntimeService.createGroup(body?.name ?? '', body?.rewards ?? [], Number(body?.count));
    }
    getRedeemCodeGroupDetail(groupId) {
        return this.redeemCodeRuntimeService.getGroupDetail(groupId);
    }
    updateRedeemCodeGroup(groupId, body) {
        return this.redeemCodeRuntimeService.updateGroup(groupId, body?.name ?? '', body?.rewards ?? []);
    }
    appendRedeemCodes(groupId, body) {
        return this.redeemCodeRuntimeService.appendCodes(groupId, Number(body?.count));
    }
    destroyRedeemCode(codeId) {
        return this.redeemCodeRuntimeService.destroyCode(codeId);
    }
};
exports.LegacyGmRedeemCodeController = LegacyGmRedeemCodeController;
__decorate([
    (0, common_1.Get)('redeem-code-groups'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], LegacyGmRedeemCodeController.prototype, "getRedeemCodeGroups", null);
__decorate([
    (0, common_1.Post)('redeem-code-groups'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], LegacyGmRedeemCodeController.prototype, "createRedeemCodeGroup", null);
__decorate([
    (0, common_1.Get)('redeem-code-groups/:groupId'),
    __param(0, (0, common_1.Param)('groupId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], LegacyGmRedeemCodeController.prototype, "getRedeemCodeGroupDetail", null);
__decorate([
    (0, common_1.Put)('redeem-code-groups/:groupId'),
    __param(0, (0, common_1.Param)('groupId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], LegacyGmRedeemCodeController.prototype, "updateRedeemCodeGroup", null);
__decorate([
    (0, common_1.Post)('redeem-code-groups/:groupId/codes'),
    __param(0, (0, common_1.Param)('groupId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], LegacyGmRedeemCodeController.prototype, "appendRedeemCodes", null);
__decorate([
    (0, common_1.Delete)('redeem-codes/:codeId'),
    __param(0, (0, common_1.Param)('codeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], LegacyGmRedeemCodeController.prototype, "destroyRedeemCode", null);
exports.LegacyGmRedeemCodeController = LegacyGmRedeemCodeController = __decorate([
    (0, common_1.Controller)('gm'),
    (0, common_1.UseGuards)(legacy_gm_http_auth_guard_1.LegacyGmHttpAuthGuard),
    __metadata("design:paramtypes", [redeem_code_runtime_service_1.RedeemCodeRuntimeService])
], LegacyGmRedeemCodeController);
//# sourceMappingURL=legacy-gm-redeem-code.controller.js.map

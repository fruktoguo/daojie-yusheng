"use strict";
/** __decorate：定义该变量以承载业务值。 */
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
exports.LegacyGmRedeemCodeController = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** legacy_gm_http_auth_guard_1：定义该变量以承载业务值。 */
const legacy_gm_http_auth_guard_1 = require("./legacy-gm-http-auth.guard");
/** redeem_code_runtime_service_1：定义该变量以承载业务值。 */
const redeem_code_runtime_service_1 = require("../../../runtime/redeem/redeem-code-runtime.service");
/** LegacyGmRedeemCodeController：定义该变量以承载业务值。 */
let LegacyGmRedeemCodeController = class LegacyGmRedeemCodeController {
    redeemCodeRuntimeService;
/** 构造函数：执行实例初始化流程。 */
    constructor(redeemCodeRuntimeService) {
        this.redeemCodeRuntimeService = redeemCodeRuntimeService;
    }
/** getRedeemCodeGroups：执行对应的业务逻辑。 */
    getRedeemCodeGroups() {
        return this.redeemCodeRuntimeService.listGroups();
    }
/** createRedeemCodeGroup：执行对应的业务逻辑。 */
    createRedeemCodeGroup(body) {
        return this.redeemCodeRuntimeService.createGroup(body?.name ?? '', body?.rewards ?? [], Number(body?.count));
    }
/** getRedeemCodeGroupDetail：执行对应的业务逻辑。 */
    getRedeemCodeGroupDetail(groupId) {
        return this.redeemCodeRuntimeService.getGroupDetail(groupId);
    }
/** updateRedeemCodeGroup：执行对应的业务逻辑。 */
    updateRedeemCodeGroup(groupId, body) {
        return this.redeemCodeRuntimeService.updateGroup(groupId, body?.name ?? '', body?.rewards ?? []);
    }
/** appendRedeemCodes：执行对应的业务逻辑。 */
    appendRedeemCodes(groupId, body) {
        return this.redeemCodeRuntimeService.appendCodes(groupId, Number(body?.count));
    }
/** destroyRedeemCode：执行对应的业务逻辑。 */
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

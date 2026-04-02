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
exports.LegacyAccountController = void 0;
const common_1 = require("@nestjs/common");
const legacy_account_http_service_1 = require("./legacy-account-http.service");
let LegacyAccountController = class LegacyAccountController {
    legacyAccountHttpService;
    constructor(legacyAccountHttpService) {
        this.legacyAccountHttpService = legacyAccountHttpService;
    }
    async updatePassword(authorization, body) {
        return this.legacyAccountHttpService.updatePassword(authorization, pickString(body?.currentPassword), pickString(body?.newPassword));
    }
    async updateDisplayName(authorization, body) {
        return this.legacyAccountHttpService.updateDisplayName(authorization, pickString(body?.displayName));
    }
    async updateRoleName(authorization, body) {
        return this.legacyAccountHttpService.updateRoleName(authorization, pickString(body?.roleName));
    }
};
exports.LegacyAccountController = LegacyAccountController;
__decorate([
    (0, common_1.Post)('password'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], LegacyAccountController.prototype, "updatePassword", null);
__decorate([
    (0, common_1.Post)('display-name'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], LegacyAccountController.prototype, "updateDisplayName", null);
__decorate([
    (0, common_1.Post)('role-name'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], LegacyAccountController.prototype, "updateRoleName", null);
exports.LegacyAccountController = LegacyAccountController = __decorate([
    (0, common_1.Controller)('account'),
    __metadata("design:paramtypes", [legacy_account_http_service_1.LegacyAccountHttpService])
], LegacyAccountController);
function pickString(value) {
    return typeof value === 'string' ? value : '';
}

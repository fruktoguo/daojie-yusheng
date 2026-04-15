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
exports.NextAccountController = void 0;
const common_1 = require("@nestjs/common");
const next_player_auth_service_1 = require("./next-player-auth.service");
let NextAccountController = class NextAccountController {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    async updatePassword(authorization, body) {
        return this.authService.updatePassword(authorization, pickString(body?.currentPassword), pickString(body?.newPassword));
    }
    async updateDisplayName(authorization, body) {
        return this.authService.updateDisplayName(authorization, pickString(body?.displayName));
    }
    async updateRoleName(authorization, body) {
        return this.authService.updateRoleName(authorization, pickString(body?.roleName));
    }
};
exports.NextAccountController = NextAccountController;
__decorate([
    (0, common_1.Post)('password'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], NextAccountController.prototype, "updatePassword", null);
__decorate([
    (0, common_1.Post)('display-name'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], NextAccountController.prototype, "updateDisplayName", null);
__decorate([
    (0, common_1.Post)('role-name'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], NextAccountController.prototype, "updateRoleName", null);
exports.NextAccountController = NextAccountController = __decorate([
    (0, common_1.Controller)('api/account'),
    __metadata("design:paramtypes", [next_player_auth_service_1.NextPlayerAuthService])
], NextAccountController);
function pickString(value) {
    return typeof value === 'string' ? value : '';
}

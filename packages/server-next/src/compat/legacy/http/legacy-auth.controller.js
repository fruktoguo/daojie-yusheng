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
exports.LegacyAuthController = void 0;
const common_1 = require("@nestjs/common");
const legacy_account_validation_1 = require("../legacy-account-validation");
const legacy_auth_http_service_1 = require("./legacy-auth-http.service");
let LegacyAuthController = class LegacyAuthController {
    legacyAuthHttpService;
    constructor(legacyAuthHttpService) {
        this.legacyAuthHttpService = legacyAuthHttpService;
    }
    async register(body) {
        const legacyUsername = pickString(body?.username);
        const accountName = pickString(body?.accountName) || legacyUsername;
        const roleName = pickString(body?.roleName) || (0, legacy_account_validation_1.buildDefaultRoleName)(accountName);
        return this.legacyAuthHttpService.register(accountName, pickString(body?.password), pickString(body?.displayName), roleName);
    }
    async login(body) {
        return this.legacyAuthHttpService.login(pickString(body?.loginName) || pickString(body?.username), pickString(body?.password));
    }
    async refresh(body) {
        return this.legacyAuthHttpService.refresh(pickString(body?.refreshToken));
    }
    async checkDisplayName(displayName = '') {
        return this.legacyAuthHttpService.checkDisplayNameAvailability(displayName);
    }
};
exports.LegacyAuthController = LegacyAuthController;
__decorate([
    (0, common_1.Post)('register'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], LegacyAuthController.prototype, "register", null);
__decorate([
    (0, common_1.Post)('login'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], LegacyAuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('refresh'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], LegacyAuthController.prototype, "refresh", null);
__decorate([
    (0, common_1.Get)('display-name/check'),
    __param(0, (0, common_1.Query)('displayName')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], LegacyAuthController.prototype, "checkDisplayName", null);
exports.LegacyAuthController = LegacyAuthController = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [legacy_auth_http_service_1.LegacyAuthHttpService])
], LegacyAuthController);
function pickString(value) {
    return typeof value === 'string' ? value : '';
}

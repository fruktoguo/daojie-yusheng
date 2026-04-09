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
exports.WorldGmAuthService = void 0;
const common_1 = require("@nestjs/common");
const legacy_gm_http_auth_service_1 = require("../compat/legacy/http/legacy-gm-http-auth.service");
/**
 * GM（游戏管理员）认证服务
 *
 * 负责处理GM的Socket连接认证，通过兼容层调用legacy的认证服务
 */
let WorldGmAuthService = class WorldGmAuthService {
    /** 兼容层认证服务 */
    compatAuthService;
    constructor(compatAuthService) {
        this.compatAuthService = compatAuthService;
    }
    /**
     * 验证GM的Socket连接令牌
     * @param token 访问令牌
     * @returns 验证结果
     */
    validateSocketGmToken(token) {
        return this.compatAuthService.validateAccessToken(token);
    }
};
exports.WorldGmAuthService = WorldGmAuthService;
exports.WorldGmAuthService = WorldGmAuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [legacy_gm_http_auth_service_1.LegacyGmHttpAuthService])
], WorldGmAuthService);
//# sourceMappingURL=world-gm-auth.service.js.map

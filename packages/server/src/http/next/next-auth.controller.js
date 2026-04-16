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
exports.NextAuthController = void 0;
const common_1 = require("@nestjs/common");
const next_player_auth_service_1 = require("./next-player-auth.service");
const next_auth_rate_limit_service_1 = require("./next-auth-rate-limit.service");
/** Next 登录鉴权 HTTP 控制器：负责注册、登录、刷新和显示名可用性检查。 */
let NextAuthController = class NextAuthController {
    /** 注入 next 玩家鉴权服务，控制器只负责参数清洗与路由转发。 */
    authService;
    /** 轻量限流入口，统一处理 register/login/refresh 失败窗口。 */
    rateLimitService;
    constructor(authService, rateLimitService) {
        this.authService = authService;
        this.rateLimitService = rateLimitService;
    }
    /** 处理注册请求，兼容 accountName/username 两种字段名。 */
    async register(body, request) {
        const accountName = pickString(body?.accountName) || pickString(body?.username);
        this.rateLimitService.assertAllowed('register', request, accountName);
        try {
            const result = await this.authService.register(accountName, pickString(body?.password), pickString(body?.displayName), pickString(body?.roleName));
            this.rateLimitService.recordSuccess('register', request, accountName);
            return result;
        }
        catch (error) {
            this.rateLimitService.recordFailure('register', request, accountName);
            throw error;
        }
    }
    /** 处理登录请求，兼容 loginName/username 两种字段名。 */
    async login(body, request) {
        const loginName = pickString(body?.loginName) || pickString(body?.username);
        this.rateLimitService.assertAllowed('login', request, loginName);
        try {
            const result = await this.authService.login(loginName, pickString(body?.password));
            this.rateLimitService.recordSuccess('login', request, loginName);
            return result;
        }
        catch (error) {
            this.rateLimitService.recordFailure('login', request, loginName);
            throw error;
        }
    }
    /** 用刷新令牌换取新的访问令牌。 */
    async refresh(body, request) {
        const refreshToken = pickString(body?.refreshToken);
        this.rateLimitService.assertAllowed('refresh', request, refreshToken);
        try {
            const result = await this.authService.refresh(refreshToken);
            this.rateLimitService.recordSuccess('refresh', request, refreshToken);
            return result;
        }
        catch (error) {
            this.rateLimitService.recordFailure('refresh', request, refreshToken);
            throw error;
        }
    }
    /** 查询显示名是否可用，供前端即时校验。 */
    async checkDisplayName(displayName = '') {
        return this.authService.checkDisplayName(displayName);
    }
};
exports.NextAuthController = NextAuthController;
__decorate([
    (0, common_1.Post)('register'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], NextAuthController.prototype, "register", null);
__decorate([
    (0, common_1.Post)('login'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], NextAuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('refresh'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], NextAuthController.prototype, "refresh", null);
__decorate([
    (0, common_1.Get)('display-name/check'),
    __param(0, (0, common_1.Query)('displayName')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], NextAuthController.prototype, "checkDisplayName", null);
exports.NextAuthController = NextAuthController = __decorate([
    (0, common_1.Controller)('api/auth'),
    __metadata("design:paramtypes", [next_player_auth_service_1.NextPlayerAuthService,
        next_auth_rate_limit_service_1.NextAuthRateLimitService])
], NextAuthController);
/** 仅接受字符串入参，避免把对象或数字直接传给服务层。 */
function pickString(value) {
    return typeof value === 'string' ? value : '';
}

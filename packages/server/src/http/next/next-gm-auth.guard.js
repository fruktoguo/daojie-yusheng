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
exports.NextGmAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const runtime_gm_auth_service_1 = require("../../runtime/gm/runtime-gm-auth.service");
/** Next GM HTTP 鉴权守卫：从 Authorization 头提取 Bearer token 并交给 runtime 校验。 */
let NextGmAuthGuard = class NextGmAuthGuard {
    /** 注入 GM 令牌校验服务，守卫本身不保存任何鉴权状态。 */
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    /** 拦截 HTTP 请求，未通过 GM 鉴权时直接拒绝。 */
    canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const authorization = request?.headers?.authorization;
        const token = typeof authorization === 'string' && authorization.startsWith('Bearer ')
            ? authorization.slice(7).trim()
            : '';
        if (!this.authService.validateAccessToken(token)) {
            throw new common_1.UnauthorizedException('GM 鉴权失败');
        }
        return true;
    }
};
exports.NextGmAuthGuard = NextGmAuthGuard;
exports.NextGmAuthGuard = NextGmAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [runtime_gm_auth_service_1.RuntimeGmAuthService])
], NextGmAuthGuard);



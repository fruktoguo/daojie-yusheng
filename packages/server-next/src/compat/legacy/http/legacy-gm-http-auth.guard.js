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
exports.LegacyGmHttpAuthGuard = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** runtime_gm_auth_service_1：定义该变量以承载业务值。 */
const runtime_gm_auth_service_1 = require("../../../runtime/gm/runtime-gm-auth.service");
/** LegacyGmHttpAuthGuard：定义该变量以承载业务值。 */
let LegacyGmHttpAuthGuard = class LegacyGmHttpAuthGuard {
    authService;
/** 构造函数：执行实例初始化流程。 */
    constructor(authService) {
        this.authService = authService;
    }
/** canActivate：执行对应的业务逻辑。 */
    canActivate(context) {
/** request：定义该变量以承载业务值。 */
        const request = context.switchToHttp().getRequest();
/** authorization：定义该变量以承载业务值。 */
        const authorization = request?.headers?.authorization;
/** token：定义该变量以承载业务值。 */
        const token = typeof authorization === 'string' && authorization.startsWith('Bearer ')
            ? authorization.slice(7).trim()
            : '';
        if (!this.authService.validateAccessToken(token)) {
            throw new common_1.UnauthorizedException('GM 鉴权失败');
        }
        return true;
    }
};
exports.LegacyGmHttpAuthGuard = LegacyGmHttpAuthGuard;
exports.LegacyGmHttpAuthGuard = LegacyGmHttpAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [runtime_gm_auth_service_1.RuntimeGmAuthService])
], LegacyGmHttpAuthGuard);

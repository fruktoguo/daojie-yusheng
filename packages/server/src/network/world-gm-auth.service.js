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

const runtime_gm_auth_service_1 = require("../runtime/gm/runtime-gm-auth.service");
// TODO(next:T13): 把 GM socket 鉴权从 runtime compat 密码记录收成 next-native 真源，并与 HTTP/GM-admin 的最终边界一起定稿。

/** GM 令牌透传鉴权服务：Socket 与 runtime gm auth service 对接。 */
let WorldGmAuthService = class WorldGmAuthService {
    compatAuthService;
    constructor(compatAuthService) {
        this.compatAuthService = compatAuthService;
    }

    /** 校验 GM socket token，返回兼容鉴权服务的验证结果。 */
    validateSocketGmToken(token) {
        return this.compatAuthService.validateAccessToken(token);
    }
};
exports.WorldGmAuthService = WorldGmAuthService;
exports.WorldGmAuthService = WorldGmAuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [runtime_gm_auth_service_1.RuntimeGmAuthService])
], WorldGmAuthService);
//# sourceMappingURL=world-gm-auth.service.js.map


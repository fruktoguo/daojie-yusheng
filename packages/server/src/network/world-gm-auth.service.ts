// @ts-nocheck
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

const next_gm_contract_1 = require("../http/next/next-gm-contract");

const runtime_gm_auth_service_1 = require("../runtime/gm/runtime-gm-auth.service");

/** GM 令牌透传鉴权服务：Socket 与 runtime gm auth service 对接。 */
let WorldGmAuthService = class WorldGmAuthService {
/**
 * gmAuthService：对象字段。
 */

    gmAuthService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param gmAuthService 参数说明。
 * @returns 无返回值（构造函数）。
 */

    constructor(gmAuthService) {
        this.gmAuthService = gmAuthService;
    }

    /** 校验 GM socket token，统一走 runtime GM auth 真源。 */
    validateSocketGmToken(token) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (next_gm_contract_1.NEXT_GM_AUTH_CONTRACT.tokenValidatorOwner !== 'runtime_gm_auth_service') {
            return false;
        }
        return this.gmAuthService.validateAccessToken(token);
    }
};
exports.WorldGmAuthService = WorldGmAuthService;
exports.WorldGmAuthService = WorldGmAuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [runtime_gm_auth_service_1.RuntimeGmAuthService])
], WorldGmAuthService);
export { WorldGmAuthService };
//# sourceMappingURL=world-gm-auth.service.js.map

"use strict";
/** __decorate：定义该变量以承载业务值。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** __metadata：定义该变量以承载业务值。 */
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGmAuthService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** runtime_gm_auth_service_1：定义该变量以承载业务值。 */
const runtime_gm_auth_service_1 = require("../runtime/gm/runtime-gm-auth.service");
/** WorldGmAuthService：定义该变量以承载业务值。 */
let WorldGmAuthService = class WorldGmAuthService {
    compatAuthService;
/** 构造函数：执行实例初始化流程。 */
    constructor(compatAuthService) {
        this.compatAuthService = compatAuthService;
    }
/** validateSocketGmToken：执行对应的业务逻辑。 */
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

"use strict";
/** __decorate：定义该变量以承载业务值。 */
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
exports.LegacyAuthReadinessWarmupService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** legacy_auth_service_1：定义该变量以承载业务值。 */
const legacy_auth_service_1 = require("../compat/legacy/legacy-auth.service");
/** LegacyAuthReadinessWarmupService：定义该变量以承载业务值。 */
let LegacyAuthReadinessWarmupService = class LegacyAuthReadinessWarmupService {
    legacyAuthService;
    logger = new common_1.Logger(LegacyAuthReadinessWarmupService.name);
/** 构造函数：执行实例初始化流程。 */
    constructor(legacyAuthService) {
        this.legacyAuthService = legacyAuthService;
    }
/** onApplicationBootstrap：执行对应的业务逻辑。 */
    async onApplicationBootstrap() {
        try {
            await this.legacyAuthService.ensurePool();
        }
        catch (error) {
            this.logger.error('Legacy auth readiness warmup failed', error instanceof Error ? error.stack : String(error));
        }
    }
};
exports.LegacyAuthReadinessWarmupService = LegacyAuthReadinessWarmupService;
exports.LegacyAuthReadinessWarmupService = LegacyAuthReadinessWarmupService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [legacy_auth_service_1.LegacyAuthService])
], LegacyAuthReadinessWarmupService);
//# sourceMappingURL=legacy-auth-readiness-warmup.service.js.map

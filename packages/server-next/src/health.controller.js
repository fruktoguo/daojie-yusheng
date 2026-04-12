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
/** __param：定义该变量以承载业务值。 */
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** health_readiness_service_1：定义该变量以承载业务值。 */
const health_readiness_service_1 = require("./health/health-readiness.service");
/** HealthController：定义该变量以承载业务值。 */
let HealthController = class HealthController {
    healthReadinessService;
/** 构造函数：执行实例初始化流程。 */
    constructor(healthReadinessService) {
        this.healthReadinessService = healthReadinessService;
    }
/** health：执行对应的业务逻辑。 */
    health(response) {
/** health：定义该变量以承载业务值。 */
        const health = this.healthReadinessService.build();
        if (!health.readiness.ok) {
            response.status(common_1.HttpStatus.SERVICE_UNAVAILABLE);
        }
        return health;
    }
};
exports.HealthController = HealthController;
__decorate([
    (0, common_1.Get)('health'),
    __param(0, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], HealthController.prototype, "health", null);
exports.HealthController = HealthController = __decorate([
    (0, common_1.Controller)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [health_readiness_service_1.HealthReadinessService])
], HealthController);
//# sourceMappingURL=health.controller.js.map

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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
const common_1 = require("@nestjs/common");
const health_readiness_service_1 = require("./health/health-readiness.service");
let HealthController = class HealthController {
    healthReadinessService;
    constructor(healthReadinessService) {
        this.healthReadinessService = healthReadinessService;
    }
    health(response) {
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

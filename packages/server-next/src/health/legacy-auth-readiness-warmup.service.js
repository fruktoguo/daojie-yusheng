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
exports.LegacyAuthReadinessWarmupService = void 0;
const common_1 = require("@nestjs/common");
const legacy_auth_service_1 = require("../compat/legacy/legacy-auth.service");
let LegacyAuthReadinessWarmupService = class LegacyAuthReadinessWarmupService {
    legacyAuthService;
    logger = new common_1.Logger(LegacyAuthReadinessWarmupService.name);
    constructor(legacyAuthService) {
        this.legacyAuthService = legacyAuthService;
    }
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

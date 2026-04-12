"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */
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
    return function (target, key) { decorator(target, key, paramIndex); };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerReadinessDependenciesService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** compat_tokens_1：定义该变量以承载业务值。 */
const compat_tokens_1 = require("../compat/compat.tokens");
/** runtime_maintenance_service_1：定义该变量以承载业务值。 */
const runtime_maintenance_service_1 = require("../runtime/world/runtime-maintenance.service");
/** ServerReadinessDependenciesService：定义该变量以承载业务值。 */
let ServerReadinessDependenciesService = class ServerReadinessDependenciesService {
    authStateService;
    maintenanceStateService;
/** 构造函数：执行实例初始化流程。 */
    constructor(authStateService, maintenanceStateService) {
        this.authStateService = authStateService;
        this.maintenanceStateService = maintenanceStateService;
    }
/** build：执行对应的业务逻辑。 */
    build() {
        return {
            authStateService: this.authStateService,
            maintenanceStateService: this.maintenanceStateService,
        };
    }
};
exports.ServerReadinessDependenciesService = ServerReadinessDependenciesService;
exports.ServerReadinessDependenciesService = ServerReadinessDependenciesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(compat_tokens_1.LEGACY_AUTH_STATE_SERVICE)),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [Object,
        runtime_maintenance_service_1.RuntimeMaintenanceService])
], ServerReadinessDependenciesService);

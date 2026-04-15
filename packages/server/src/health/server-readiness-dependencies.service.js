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
    return function (target, key) { decorator(target, key, paramIndex); };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerReadinessDependenciesService = void 0;

const common_1 = require("@nestjs/common");

const runtime_maintenance_service_1 = require("../runtime/world/runtime-maintenance.service");

/** 运行就绪依赖收集器，当前主要提供维护态服务引用，便于后续扩展。 */
let ServerReadinessDependenciesService = class ServerReadinessDependenciesService {
    maintenanceStateService;
    constructor(maintenanceStateService) {
        this.maintenanceStateService = maintenanceStateService;
    }

    /** 输出 readiness 依赖注入对象，保持上层服务组装的一致性。 */
    build() {
        return {
            maintenanceStateService: this.maintenanceStateService,
        };
    }
};
exports.ServerReadinessDependenciesService = ServerReadinessDependenciesService;
exports.ServerReadinessDependenciesService = ServerReadinessDependenciesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [runtime_maintenance_service_1.RuntimeMaintenanceService])
], ServerReadinessDependenciesService);



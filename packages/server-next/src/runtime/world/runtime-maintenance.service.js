"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuntimeMaintenanceService = void 0;
const common_1 = require("@nestjs/common");
let RuntimeMaintenanceService = class RuntimeMaintenanceService {
    isRuntimeMaintenanceActive() {
        return readBooleanEnv('SERVER_NEXT_RUNTIME_MAINTENANCE')
            || readBooleanEnv('RUNTIME_MAINTENANCE')
            || readBooleanEnv('SERVER_NEXT_RUNTIME_RESTORE_ACTIVE');
    }
};
exports.RuntimeMaintenanceService = RuntimeMaintenanceService;
exports.RuntimeMaintenanceService = RuntimeMaintenanceService = __decorate([
    (0, common_1.Injectable)()
], RuntimeMaintenanceService);
function readBooleanEnv(key) {
    const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
    return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

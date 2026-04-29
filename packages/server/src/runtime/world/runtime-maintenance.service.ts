// @ts-nocheck
"use strict";
/** 运行时维护标识服务：决定服务是否处于维护中。 */
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
    /** 判断服务是否处于维护期，任一配置开关为真则阻断主循环推进。 */
    isRuntimeMaintenanceActive() {
        return readBooleanEnv('SERVER_RUNTIME_MAINTENANCE')
            || readBooleanEnv('RUNTIME_MAINTENANCE')
            || readBooleanEnv('SERVER_RUNTIME_RESTORE_ACTIVE');
    }
};
exports.RuntimeMaintenanceService = RuntimeMaintenanceService;
exports.RuntimeMaintenanceService = RuntimeMaintenanceService = __decorate([
    (0, common_1.Injectable)()
], RuntimeMaintenanceService);
export { RuntimeMaintenanceService };
/** 解析布尔型环境变量，支持 1/true/yes/on 为 true。 */
function readBooleanEnv(key) {

    const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
    return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}


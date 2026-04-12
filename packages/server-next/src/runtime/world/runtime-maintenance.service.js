"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuntimeMaintenanceService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** RuntimeMaintenanceService：定义该变量以承载业务值。 */
let RuntimeMaintenanceService = class RuntimeMaintenanceService {
/** isRuntimeMaintenanceActive：执行对应的业务逻辑。 */
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
/** readBooleanEnv：执行对应的业务逻辑。 */
function readBooleanEnv(key) {
/** value：定义该变量以承载业务值。 */
    const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
    return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

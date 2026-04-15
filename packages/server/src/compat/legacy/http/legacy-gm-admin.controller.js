"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */
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
/** __param：定义该变量以承载业务值。 */
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyGmAdminController = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** legacy_gm_http_auth_guard_1：定义该变量以承载业务值。 */
const legacy_gm_http_auth_guard_1 = require("./legacy-gm-http-auth.guard");
/** legacy_gm_admin_compat_service_1：定义该变量以承载业务值。 */
const legacy_gm_admin_compat_service_1 = require("./legacy-gm-admin-compat.service");
/** LegacyGmAdminController：定义该变量以承载业务值。 */
let LegacyGmAdminController = class LegacyGmAdminController {
    legacyGmAdminCompatService;
/** 构造函数：执行实例初始化流程。 */
    constructor(legacyGmAdminCompatService) {
        this.legacyGmAdminCompatService = legacyGmAdminCompatService;
    }
/** getDatabaseState：执行对应的业务逻辑。 */
    getDatabaseState() {
        return this.legacyGmAdminCompatService.getDatabaseState();
    }
/** triggerDatabaseBackup：执行对应的业务逻辑。 */
    triggerDatabaseBackup() {
        return this.legacyGmAdminCompatService.triggerDatabaseBackup();
    }
/** downloadDatabaseBackup：执行对应的业务逻辑。 */
    async downloadDatabaseBackup(backupId, response) {
/** record：定义该变量以承载业务值。 */
        const record = await this.legacyGmAdminCompatService.getBackupDownloadRecord(backupId);
        response.download(record.filePath, record.fileName);
    }
/** triggerDatabaseRestore：执行对应的业务逻辑。 */
    triggerDatabaseRestore(body) {
        return this.legacyGmAdminCompatService.triggerDatabaseRestore(body?.backupId ?? '');
    }
};
exports.LegacyGmAdminController = LegacyGmAdminController;
__decorate([
    (0, common_1.Get)('database/state'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], LegacyGmAdminController.prototype, "getDatabaseState", null);
__decorate([
    (0, common_1.Post)('database/backup'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], LegacyGmAdminController.prototype, "triggerDatabaseBackup", null);
__decorate([
    (0, common_1.Get)('database/backups/:backupId/download'),
    __param(0, (0, common_1.Param)('backupId')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], LegacyGmAdminController.prototype, "downloadDatabaseBackup", null);
__decorate([
    (0, common_1.Post)('database/restore'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], LegacyGmAdminController.prototype, "triggerDatabaseRestore", null);
exports.LegacyGmAdminController = LegacyGmAdminController = __decorate([
    (0, common_1.Controller)('gm'),
    (0, common_1.UseGuards)(legacy_gm_http_auth_guard_1.LegacyGmHttpAuthGuard),
    __metadata("design:paramtypes", [legacy_gm_admin_compat_service_1.LegacyGmAdminCompatService])
], LegacyGmAdminController);

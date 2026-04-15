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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NextGmAdminController = void 0;
const common_1 = require("@nestjs/common");
const legacy_gm_http_auth_guard_1 = require("../../compat/legacy/http/legacy-gm-http-auth.guard");
const legacy_gm_admin_compat_service_1 = require("../../compat/legacy/http/legacy-gm-admin-compat.service");
let NextGmAdminController = class NextGmAdminController {
    legacyGmAdminCompatService;
    constructor(legacyGmAdminCompatService) {
        this.legacyGmAdminCompatService = legacyGmAdminCompatService;
    }
    getDatabaseState() {
        return this.legacyGmAdminCompatService.getDatabaseState();
    }
    triggerDatabaseBackup() {
        return this.legacyGmAdminCompatService.triggerDatabaseBackup();
    }
    async downloadDatabaseBackup(backupId, response) {
        const record = await this.legacyGmAdminCompatService.getBackupDownloadRecord(backupId);
        response.download(record.filePath, record.fileName);
    }
    triggerDatabaseRestore(body) {
        return this.legacyGmAdminCompatService.triggerDatabaseRestore(body?.backupId ?? '');
    }
};
exports.NextGmAdminController = NextGmAdminController;
__decorate([
    (0, common_1.Get)('database/state'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], NextGmAdminController.prototype, "getDatabaseState", null);
__decorate([
    (0, common_1.Post)('database/backup'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], NextGmAdminController.prototype, "triggerDatabaseBackup", null);
__decorate([
    (0, common_1.Get)('database/backups/:backupId/download'),
    __param(0, (0, common_1.Param)('backupId')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], NextGmAdminController.prototype, "downloadDatabaseBackup", null);
__decorate([
    (0, common_1.Post)('database/restore'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], NextGmAdminController.prototype, "triggerDatabaseRestore", null);
exports.NextGmAdminController = NextGmAdminController = __decorate([
    (0, common_1.Controller)('api/gm'),
    (0, common_1.UseGuards)(legacy_gm_http_auth_guard_1.LegacyGmHttpAuthGuard),
    __metadata("design:paramtypes", [legacy_gm_admin_compat_service_1.LegacyGmAdminCompatService])
], NextGmAdminController);

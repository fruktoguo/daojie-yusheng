import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';

import { GM_HTTP_CONTRACT } from './next-gm-contract';
import { NextGmAdminService } from './next-gm-admin.service';
import { NextGmAuthGuard } from './next-gm-auth.guard';
/**
 * DatabaseRestoreBody：定义接口结构约束，明确可交付字段含义。
 */


interface DatabaseRestoreBody {
/**
 * backupId：backupID标识。
 */

  backupId?: string;
}
/**
 * DownloadResponseLike：定义接口结构约束，明确可交付字段含义。
 */


interface DownloadResponseLike {
  download(filePath: string, fileName: string): void;
}
/**
 * NextGmAdminController：封装该能力的入口与生命周期，承载运行时核心协作。
 */


@Controller(GM_HTTP_CONTRACT.gmBasePath)
@UseGuards(NextGmAuthGuard)
export class NextGmAdminController {
/**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param nextGmAdminService NextGmAdminService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

  constructor(private readonly nextGmAdminService: NextGmAdminService) {}  
  /**
 * getDatabaseState：读取Database状态。
 * @returns 无返回值，完成Database状态的读取/组装。
 */


  @Get('database/state')
  getDatabaseState() {
    return this.nextGmAdminService.getDatabaseState();
  }  
  /**
 * triggerDatabaseBackup：执行triggerDatabaseBackup相关逻辑。
 * @returns 无返回值，直接更新triggerDatabaseBackup相关状态。
 */


  @Post('database/backup')
  triggerDatabaseBackup() {
    return this.nextGmAdminService.triggerDatabaseBackup();
  }  
  /**
 * downloadDatabaseBackup：读取downloadDatabaseBackup并返回结果。
 * @param backupId string backup ID。
 * @param response DownloadResponseLike 参数说明。
 * @returns 无返回值，直接更新downloadDatabaseBackup相关状态。
 */


  @Get('database/backups/:backupId/download')
  async downloadDatabaseBackup(@Param('backupId') backupId: string, @Res() response: DownloadResponseLike) {
    const record = await this.nextGmAdminService.getBackupDownloadRecord(backupId);
    response.download(record.filePath, record.fileName);
  }  
  /**
 * triggerDatabaseRestore：执行triggerDatabaseRestore相关逻辑。
 * @param body DatabaseRestoreBody 参数说明。
 * @returns 无返回值，直接更新triggerDatabaseRestore相关状态。
 */


  @Post('database/restore')
  triggerDatabaseRestore(@Body() body: DatabaseRestoreBody) {
    return this.nextGmAdminService.triggerDatabaseRestore(body?.backupId ?? '');
  }
}

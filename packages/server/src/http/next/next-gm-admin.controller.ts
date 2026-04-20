import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';

import { NEXT_GM_HTTP_CONTRACT } from './next-gm-contract';
import { NextGmAdminService } from './next-gm-admin.service';
import { NextGmAuthGuard } from './next-gm-auth.guard';
/**
 * DatabaseRestoreBody：定义接口结构约束，明确可交付字段含义。
 */


interface DatabaseRestoreBody {
/**
 * backupId：DatabaseRestoreBody 内部字段。
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


@Controller(NEXT_GM_HTTP_CONTRACT.gmBasePath)
@UseGuards(NextGmAuthGuard)
export class NextGmAdminController {
/**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param nextGmAdminService NextGmAdminService 参数说明。
 * @returns 无返回值（构造函数）。
 */

  constructor(private readonly nextGmAdminService: NextGmAdminService) {}  
  /**
 * getDatabaseState：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */


  @Get('database/state')
  getDatabaseState() {
    return this.nextGmAdminService.getDatabaseState();
  }  
  /**
 * triggerDatabaseBackup：执行核心业务逻辑。
 * @returns 函数返回值。
 */


  @Post('database/backup')
  triggerDatabaseBackup() {
    return this.nextGmAdminService.triggerDatabaseBackup();
  }  
  /**
 * downloadDatabaseBackup：执行核心业务逻辑。
 * @param backupId string backup ID。
 * @param response DownloadResponseLike 参数说明。
 * @returns 函数返回值。
 */


  @Get('database/backups/:backupId/download')
  async downloadDatabaseBackup(@Param('backupId') backupId: string, @Res() response: DownloadResponseLike) {
    const record = await this.nextGmAdminService.getBackupDownloadRecord(backupId);
    response.download(record.filePath, record.fileName);
  }  
  /**
 * triggerDatabaseRestore：执行核心业务逻辑。
 * @param body DatabaseRestoreBody 参数说明。
 * @returns 函数返回值。
 */


  @Post('database/restore')
  triggerDatabaseRestore(@Body() body: DatabaseRestoreBody) {
    return this.nextGmAdminService.triggerDatabaseRestore(body?.backupId ?? '');
  }
}

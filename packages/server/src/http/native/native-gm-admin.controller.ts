import { Body, Controller, Get, Headers, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';

import { GM_HTTP_CONTRACT } from './native-gm-contract';
import { NativeGmAdminService } from './native-gm-admin.service';
import { NativeGmAuthGuard } from './native-gm-auth.guard';
import { readConsoleLogEntries } from '../../logging/console-log-buffer';
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

interface UploadRequestLike {
  pipe(destination: NodeJS.WritableStream): NodeJS.WritableStream;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  destroy?(error?: Error): void;
}
/**
 * NativeGmAdminController：封装该能力的入口与生命周期，承载运行时核心协作。
 */


@Controller(GM_HTTP_CONTRACT.gmBasePath)
@UseGuards(NativeGmAuthGuard)
export class NativeGmAdminController {
/**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param nextGmAdminService NativeGmAdminService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

  constructor(private readonly nextGmAdminService: NativeGmAdminService) {}
  /**
 * getDatabaseState：读取Database状态。
 * @returns 无返回值，完成Database状态的读取/组装。
 */


  @Get('database/state')
  getDatabaseState() {
    return this.nextGmAdminService.getDatabaseState();
  }
  /**
 * getServerLogs：读取服务端控制台日志缓冲。
 * @param limit 返回行数。
 * @param beforeSeq 只返回该序号之前的更早日志。
 * @returns 服务端日志片段。
 */


  @Get('logs')
  getServerLogs(@Query('limit') limit = '100', @Query('before') beforeSeq = '') {
    return readConsoleLogEntries({ beforeSeq, limit });
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
 * uploadDatabaseBackup：上传本地数据库备份并登记到备份列表。
 * @param request 上传请求流。
 * @param fileName 文件名请求头。
 * @param contentLength 内容长度请求头。
 * @returns 无返回值，直接更新uploadDatabaseBackup相关状态。
 */


  @Post('database/upload')
  uploadDatabaseBackup(
    @Req() request: UploadRequestLike,
    @Headers('x-backup-filename') fileName = '',
    @Headers('content-length') contentLength = '',
  ) {
    return this.nextGmAdminService.uploadDatabaseBackup({
      stream: request,
      fileName,
      contentLength,
    });
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

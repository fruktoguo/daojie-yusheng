/**
 * GM 管理控制器。
 * 提供数据库状态查询、备份触发、备份上传/下载、数据库恢复和服务端日志查看端点。
 * 所有路由需 GM 鉴权。
 */
import { Body, Controller, Get, Headers, Param, Post, Query, Req, Res, UseGuards, NotFoundException } from '@nestjs/common';
import { createReadStream } from 'fs';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { stat } from 'fs/promises';

import { GM_HTTP_CONTRACT } from './native-gm-contract';
import { NativeGmAdminService } from './native-gm-admin.service';
import { extractGmActor } from './native-gm-actor-context';
import { NativeGmAuthGuard } from './native-gm-auth.guard';
import { NativeGmDiagnosticsService } from './native-gm-diagnostics.service';
import { NativeGmWorkerService } from './native-gm-worker.service';
import { readConsoleLogEntries } from '../../logging/console-log-buffer';
/** 数据库恢复请求体。 */
interface DatabaseRestoreBody {
  backupId?: string;
}

/** 数据库清理请求体。 */
interface DatabaseCleanupBody {
  target?: string;
  mode?: 'older_than' | 'all';
  olderThanDays?: number;
}

/** Express 响应接口（下载用）。 */
interface DownloadResponseLike {
  download(filePath: string, fileName: string): void;
  setHeader(name: string, value: string): void;
  status(code: number): DownloadResponseLike;
  end(data?: unknown): void;
}

interface UploadRequestLike {
  pipe(destination: NodeJS.WritableStream): NodeJS.WritableStream;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  destroy?(error?: Error): void;
}

/** GM 管理控制器：数据库备份/恢复、日志查看等运维端点。 */
@Controller(GM_HTTP_CONTRACT.gmBasePath)
@UseGuards(NativeGmAuthGuard)
export class NativeGmAdminController {
  constructor(
    private readonly nextGmAdminService: NativeGmAdminService,
    private readonly nativeGmWorkerService: NativeGmWorkerService,
    private readonly nativeGmDiagnosticsService: NativeGmDiagnosticsService,
  ) {}

  /** 查询数据库连接状态和备份列表。 */
  @Get('database/state')
  getDatabaseState() {
    return this.nextGmAdminService.getDatabaseState();
  }

  /** 读取服务端控制台日志缓冲，支持分页。 */
  @Get('logs')
  getServerLogs(@Query('limit') limit = '100', @Query('before') beforeSeq = '') {
    return readConsoleLogEntries({ beforeSeq, limit });
  }

  /** 读取 worker 刷盘、outbox 和备份心跳的低频状态汇总。 */
  @Get('workers')
  getWorkerState() {
    return this.nativeGmWorkerService.getWorkerState();
  }

  /** 执行 GM 只读诊断指令。 */
  @Post('diagnostics/query')
  runDiagnosticsQuery(@Body() body: { command?: string; limit?: number }, @Req() request: unknown) {
    return this.nativeGmDiagnosticsService.executeQuery(
      { command: body?.command ?? '', limit: body?.limit },
      extractGmActor(request),
    );
  }

  /** 触发一次数据库全量备份。 */
  @Post('database/backup')
  triggerDatabaseBackup() {
    return this.nextGmAdminService.triggerDatabaseBackup();
  }

  /** 上传本地数据库备份文件并登记到备份列表。 */
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

  /** 下载指定备份文件（gzip 压缩）。 */
  @Get('database/backups/:backupId/download')
  async downloadDatabaseBackup(@Param('backupId') backupId: string, @Res() response: DownloadResponseLike) {
    const record = await this.nextGmAdminService.getBackupDownloadRecord(backupId);
    // 确认文件存在
    await stat(record.filePath).catch(() => { throw new NotFoundException('备份文件不存在'); });
    const gzFileName = record.fileName.endsWith('.gz') ? record.fileName : `${record.fileName}.gz`;
    response.setHeader('Content-Disposition', `attachment; filename="${gzFileName}"`);
    response.setHeader('Content-Type', 'application/gzip');
    response.setHeader('Content-Encoding', 'identity');
    const source = createReadStream(record.filePath);
    const gzip = createGzip();
    await pipeline(source, gzip, response as unknown as NodeJS.WritableStream);
  }

  /** 从指定备份恢复数据库。 */
  @Post('database/restore')
  triggerDatabaseRestore(@Body() body: DatabaseRestoreBody) {
    return this.nextGmAdminService.triggerDatabaseRestore(body?.backupId ?? '');
  }

  /** 查询各表占用统计。 */
  @Get('database/table-stats')
  getDatabaseTableStats() {
    return this.nextGmAdminService.getDatabaseTableStats();
  }

  /** 清理指定表的过期数据。 */
  @Post('database/cleanup')
  triggerDatabaseCleanup(@Body() body: DatabaseCleanupBody) {
    return this.nextGmAdminService.cleanupDatabaseTable(body?.target ?? '', body?.mode, body?.olderThanDays);
  }
}

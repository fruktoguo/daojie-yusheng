import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';

import { NEXT_GM_HTTP_CONTRACT } from './next-gm-contract';
import { NextGmAdminService } from './next-gm-admin.service';
import { NextGmAuthGuard } from './next-gm-auth.guard';

interface DatabaseRestoreBody {
  backupId?: string;
}

interface DownloadResponseLike {
  download(filePath: string, fileName: string): void;
}

@Controller(NEXT_GM_HTTP_CONTRACT.gmBasePath)
@UseGuards(NextGmAuthGuard)
export class NextGmAdminController {
  constructor(private readonly nextGmAdminService: NextGmAdminService) {}

  @Get('database/state')
  getDatabaseState() {
    return this.nextGmAdminService.getDatabaseState();
  }

  @Post('database/backup')
  triggerDatabaseBackup() {
    return this.nextGmAdminService.triggerDatabaseBackup();
  }

  @Get('database/backups/:backupId/download')
  async downloadDatabaseBackup(@Param('backupId') backupId: string, @Res() response: DownloadResponseLike) {
    const record = await this.nextGmAdminService.getBackupDownloadRecord(backupId);
    response.download(record.filePath, record.fileName);
  }

  @Post('database/restore')
  triggerDatabaseRestore(@Body() body: DatabaseRestoreBody) {
    return this.nextGmAdminService.triggerDatabaseRestore(body?.backupId ?? '');
  }
}

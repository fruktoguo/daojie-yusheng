/**
 * GM 管理 HTTP 接口：玩家管理、地图编辑、Bot 控制、建议反馈、世界管理
 */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  GmEditorCatalogRes,
  GmDatabaseStateRes,
  GmRestoreDatabaseReq,
  GmTriggerDatabaseBackupRes,
  GmMapListRes,
  GmMapRuntimeRes,
  GmPlayerDetailRes,
  GmRemoveBotsReq,
  GmSpawnBotsReq,
  GmStateRes,
  GmUpdateManagedPlayerPasswordReq,
  GmUpdateMapTickReq,
  GmUpdateMapTimeReq,
  GmUpdatePlayerReq,
  Suggestion,
} from '@mud/shared';
import { GmAuthGuard } from './gm-auth.guard';
import { DatabaseBackupService } from './database-backup.service';
import { GmService } from './gm.service';
import { SuggestionService } from './suggestion.service';
import { TickService } from './tick.service';

@Controller('gm')
@UseGuards(GmAuthGuard)
export class GmController {
  constructor(
    private readonly gmService: GmService,
    private readonly databaseBackupService: DatabaseBackupService,
    private readonly suggestionService: SuggestionService,
    private readonly tickService: TickService,
  ) {}

  /** 获取全局 GM 状态 */
  @Get('state')
  getState(): Promise<GmStateRes> {
    return this.gmService.getState();
  }

  @Get('editor-catalog')
  getEditorCatalog(): GmEditorCatalogRes {
    return this.gmService.getEditorCatalog();
  }

  @Get('maps')
  getMaps(): GmMapListRes {
    return this.gmService.getEditableMapList();
  }

  /** 获取所有玩家建议 */
  @Get('suggestions')
  getSuggestions(): Suggestion[] {
    return this.suggestionService.getAll();
  }

  /** 重置 GM 网络流量统计 */
  @Post('perf/network/reset')
  resetNetworkPerf(): { ok: true } {
    this.tickService.resetNetworkPerf();
    return { ok: true };
  }

  /** 重置 GM CPU 统计 */
  @Post('perf/cpu/reset')
  resetCpuPerf(): { ok: true } {
    this.tickService.resetCpuPerf();
    return { ok: true };
  }

  /** 重置寻路专项统计 */
  @Post('perf/pathfinding/reset')
  resetPathfindingPerf(): { ok: true } {
    this.tickService.resetPathfindingPerf();
    return { ok: true };
  }

  /** 手动重新加载 Tick 运行配置 */
  @Post('tick-config/reload')
  async reloadTickConfig(): Promise<{ ok: true }> {
    await this.tickService.reloadConfig();
    return { ok: true };
  }

  @Post('suggestions/:id/complete')
  async completeSuggestion(@Param('id') id: string): Promise<{ ok: true }> {
    await this.suggestionService.markCompleted(id);
    return { ok: true };
  }

  @Delete('suggestions/:id')
  async removeSuggestion(@Param('id') id: string): Promise<{ ok: true }> {
    await this.suggestionService.remove(id);
    return { ok: true };
  }

  @Get('database/state')
  getDatabaseState(): Promise<GmDatabaseStateRes> {
    return this.databaseBackupService.getState();
  }

  @Post('database/backup')
  triggerDatabaseBackup(): GmTriggerDatabaseBackupRes {
    try {
      return this.databaseBackupService.triggerManualBackup();
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }
  }

  @Get('database/backups/:backupId/download')
  downloadDatabaseBackup(
    @Param('backupId') backupId: string,
    @Res() response: { download: (filePath: string, fileName?: string) => void },
  ): void {
    try {
      const backup = this.databaseBackupService.getBackupDownloadRecord(backupId);
      response.download(backup.filePath, backup.fileName);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }
  }

  @Post('database/restore')
  restoreDatabase(@Body() body: GmRestoreDatabaseReq): GmTriggerDatabaseBackupRes {
    if (!body?.backupId) {
      throw new BadRequestException('缺少备份 ID');
    }
    try {
      return this.databaseBackupService.triggerRestore(body.backupId);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }
  }

  /** 获取单个玩家详情 */
  @Get('players/:playerId')
  async getPlayer(@Param('playerId') playerId: string): Promise<GmPlayerDetailRes> {
    const player = await this.gmService.getPlayerDetail(playerId);
    if (!player) {
      throw new BadRequestException('目标玩家不存在');
    }
    return { player };
  }

  /** GM 直接重设玩家账号密码 */
  @Post('players/:playerId/password')
  async updatePlayerPassword(
    @Param('playerId') playerId: string,
    @Body() body: GmUpdateManagedPlayerPasswordReq,
  ): Promise<{ ok: true }> {
    const error = await this.gmService.updateManagedPlayerPassword(playerId, body?.newPassword ?? '');
    if (error) {
      throw new BadRequestException(error);
    }
    return { ok: true };
  }

  /** 获取运行时地图快照（世界管理用，必须在 maps/:mapId 之前） */
  @Get('maps/:mapId/runtime')
  getMapRuntime(
    @Param('mapId') mapId: string,
    @Query('x') qx: string,
    @Query('y') qy: string,
    @Query('w') qw: string,
    @Query('h') qh: string,
  ): GmMapRuntimeRes {
    const x = parseInt(qx, 10) || 0;
    const y = parseInt(qy, 10) || 0;
    const w = parseInt(qw, 10) || 20;
    const h = parseInt(qh, 10) || 20;
    const result = this.gmService.getMapRuntime(
      mapId, x, y, w, h,
      this.tickService.getMapTickSpeed(mapId),
      this.tickService.isMapPaused(mapId),
    );
    if (!result) {
      throw new BadRequestException('目标地图不存在');
    }
    return result;
  }

  /** 修改地图 tick 速率（必须在 maps/:mapId 之前） */
  @Put('maps/:mapId/tick')
  updateMapTick(
    @Param('mapId') mapId: string,
    @Body() body: GmUpdateMapTickReq,
  ): { ok: true } {
    if (body?.paused === true || body?.speed === 0) {
      this.tickService.setMapTickSpeed(mapId, 0);
    } else if (typeof body?.speed === 'number') {
      this.tickService.setMapTickSpeed(mapId, body.speed);
    } else if (body?.paused === false) {
      const current = this.tickService.getMapTickSpeed(mapId);
      this.tickService.setMapTickSpeed(mapId, current || 1);
    }
    return { ok: true };
  }

  /** 修改地图时间配置（必须在 maps/:mapId 之前） */
  @Put('maps/:mapId/time')
  updateMapTime(
    @Param('mapId') mapId: string,
    @Body() body: GmUpdateMapTimeReq,
  ): { ok: true } {
    const error = this.gmService.updateMapTime(mapId, body ?? {});
    if (error) {
      throw new BadRequestException(error);
    }
    return { ok: true };
  }

  /** 更新玩家状态 */
  @Put('players/:playerId')
  async updatePlayer(
    @Param('playerId') playerId: string,
    @Body() body: GmUpdatePlayerReq,
  ): Promise<{ ok: true }> {
    if (!body?.snapshot) {
      throw new BadRequestException('缺少玩家快照');
    }
    const error = await this.gmService.enqueuePlayerUpdate(playerId, body.snapshot, body.section);
    if (error) {
      throw new BadRequestException(error);
    }
    return { ok: true };
  }

  /** 重置玩家到出生点 */
  @Post('players/:playerId/reset')
  async resetPlayer(@Param('playerId') playerId: string): Promise<{ ok: true }> {
    const error = await this.gmService.enqueueResetPlayer(playerId);
    if (error) {
      throw new BadRequestException(error);
    }
    return { ok: true };
  }

  /** 生成 Bot */
  @Post('bots/spawn')
  async spawnBots(@Body() body: GmSpawnBotsReq): Promise<{ ok: true }> {
    const error = await this.gmService.enqueueSpawnBots(body.anchorPlayerId, body.count);
    if (error) {
      throw new BadRequestException(error);
    }
    return { ok: true };
  }

  /** 移除 Bot */
  @Post('bots/remove')
  removeBots(@Body() body: GmRemoveBotsReq): { ok: true } {
    const error = this.gmService.enqueueRemoveBots(body?.playerIds, body?.all);
    if (error) {
      throw new BadRequestException(error);
    }
    return { ok: true };
  }
}

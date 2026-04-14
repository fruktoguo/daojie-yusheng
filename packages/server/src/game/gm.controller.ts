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
  GmListPlayersQuery,
  GmListSuggestionsQuery,
  GmAddPlayerCombatExpReq,
  GmAddPlayerFoundationReq,
  GmReplySuggestionReq,
  GmSuggestionListRes,
  GmRestoreDatabaseReq,
  GmTriggerDatabaseBackupRes,
  GmMapListRes,
  GmMapRuntimeRes,
  GmPlayerDetailRes,
  GmCreateMailReq,
  GmCreateRedeemCodeGroupReq,
  GmCreateRedeemCodeGroupRes,
  GmAppendRedeemCodesReq,
  GmAppendRedeemCodesRes,
  GmRedeemCodeGroupDetailRes,
  GmRedeemCodeGroupListRes,
  GmRemoveBotsReq,
  GmSetPlayerBodyTrainingLevelReq,
  GmShortcutRunRes,
  GmSpawnBotsReq,
  GmStateRes,
  GmUpdateManagedPlayerAccountReq,
  GmUpdateManagedPlayerPasswordReq,
  GmUpdateMapTickReq,
  GmUpdateMapTimeReq,
  GmUpdateRedeemCodeGroupReq,
  GmUpdatePlayerReq,
} from '@mud/shared';
import { GmAuthGuard } from './gm-auth.guard';
import { DatabaseBackupService } from './database-backup.service';
import { GmService } from './gm.service';
import { SuggestionRealtimeService } from './suggestion-realtime.service';
import { SuggestionService } from './suggestion.service';
import { TickService } from './tick.service';
import { MailService } from './mail.service';
import { RedeemCodeService } from './redeem-code.service';

@Controller('gm')
@UseGuards(GmAuthGuard)
/** GmController：封装相关状态与行为。 */
export class GmController {
  constructor(
    private readonly gmService: GmService,
    private readonly databaseBackupService: DatabaseBackupService,
    private readonly suggestionService: SuggestionService,
    private readonly suggestionRealtimeService: SuggestionRealtimeService,
    private readonly mailService: MailService,
    private readonly redeemCodeService: RedeemCodeService,
    private readonly tickService: TickService,
  ) {}

  /** 获取全局 GM 状态 */
  @Get('state')
  getState(@Query() query: GmListPlayersQuery): Promise<GmStateRes> {
    return this.gmService.getState(query);
  }

  @Get('editor-catalog')
/** getEditorCatalog：执行对应的业务逻辑。 */
  getEditorCatalog(): GmEditorCatalogRes {
    return this.gmService.getEditorCatalog();
  }

  @Get('maps')
/** getMaps：执行对应的业务逻辑。 */
  getMaps(): GmMapListRes {
    return this.gmService.getEditableMapList();
  }

  /** 获取所有玩家建议 */
  @Get('suggestions')
  getSuggestions(@Query() query: GmListSuggestionsQuery): GmSuggestionListRes {
    return this.suggestionService.getPage({
      page: Number(query?.page),
      pageSize: Number(query?.pageSize),
      keyword: query?.keyword,
    });
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
    this.suggestionRealtimeService.broadcastSuggestions(this.suggestionService.getAll());
    return { ok: true };
  }

  @Post('suggestions/:id/replies')
  async replySuggestion(
    @Param('id') id: string,
    @Body() body: GmReplySuggestionReq,
  ): Promise<{ ok: true }> {
/** updated：定义该变量以承载业务值。 */
    const updated = await this.suggestionService.addReply(id, 'gm', 'gm', '开发者', body?.content ?? '');
    if (!updated) {
      throw new BadRequestException('回复失败');
    }
    this.suggestionRealtimeService.broadcastSuggestions(this.suggestionService.getAll());
    return { ok: true };
  }

  @Delete('suggestions/:id')
  async removeSuggestion(@Param('id') id: string): Promise<{ ok: true }> {
    await this.suggestionService.remove(id);
    this.suggestionRealtimeService.broadcastSuggestions(this.suggestionService.getAll());
    return { ok: true };
  }

  @Get('database/state')
/** getDatabaseState：执行对应的业务逻辑。 */
  getDatabaseState(): Promise<GmDatabaseStateRes> {
    return this.databaseBackupService.getState();
  }

  @Post('database/backup')
/** triggerDatabaseBackup：执行对应的业务逻辑。 */
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
/** backup：定义该变量以承载业务值。 */
      const backup = this.databaseBackupService.getBackupDownloadRecord(backupId);
      response.download(backup.filePath, backup.fileName);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }
  }

  @Post('database/restore')
  async restoreDatabase(@Body() body: GmRestoreDatabaseReq): Promise<GmTriggerDatabaseBackupRes> {
    if (!body?.backupId) {
      throw new BadRequestException('缺少备份 ID');
    }
    try {
      return await this.databaseBackupService.triggerRestore(body.backupId);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }
  }

  /** 获取单个玩家详情 */
  @Get('players/:playerId')
  async getPlayer(@Param('playerId') playerId: string): Promise<GmPlayerDetailRes> {
/** player：定义该变量以承载业务值。 */
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
/** error：定义该变量以承载业务值。 */
    const error = await this.gmService.updateManagedPlayerPassword(playerId, body?.newPassword ?? '');
    if (error) {
      throw new BadRequestException(error);
    }
    return { ok: true };
  }

  /** GM 直接修改玩家账号 */
  @Put('players/:playerId/account')
  async updatePlayerAccount(
    @Param('playerId') playerId: string,
    @Body() body: GmUpdateManagedPlayerAccountReq,
  ): Promise<{ ok: true }> {
/** error：定义该变量以承载业务值。 */
    const error = await this.gmService.updateManagedPlayerAccount(playerId, body?.username ?? '');
    if (error) {
      throw new BadRequestException(error);
    }
    return { ok: true };
  }

  @Post('players/:playerId/mail')
  async sendDirectMail(
    @Param('playerId') playerId: string,
    @Body() body: GmCreateMailReq,
  ): Promise<{ ok: true; mailId: string }> {
/** mailId：定义该变量以承载业务值。 */
    const mailId = await this.mailService.createDirectMail(playerId, body ?? {});
    return { ok: true, mailId };
  }

  @Post('mail/broadcast')
  async sendBroadcastMail(@Body() body: GmCreateMailReq): Promise<{ ok: true; mailId: string }> {
/** mailId：定义该变量以承载业务值。 */
    const mailId = await this.mailService.createGlobalMail(body ?? {});
    return { ok: true, mailId };
  }

  @Get('redeem-code-groups')
/** getRedeemCodeGroups：执行对应的业务逻辑。 */
  getRedeemCodeGroups(): Promise<GmRedeemCodeGroupListRes> {
    return this.redeemCodeService.listGroups();
  }

  @Post('redeem-code-groups')
  createRedeemCodeGroup(@Body() body: GmCreateRedeemCodeGroupReq): Promise<GmCreateRedeemCodeGroupRes> {
    return this.redeemCodeService.createGroup(body?.name ?? '', body?.rewards ?? [], Number(body?.count));
  }

  @Get('redeem-code-groups/:groupId')
  getRedeemCodeGroupDetail(@Param('groupId') groupId: string): Promise<GmRedeemCodeGroupDetailRes> {
    return this.redeemCodeService.getGroupDetail(groupId);
  }

  @Put('redeem-code-groups/:groupId')
  updateRedeemCodeGroup(
    @Param('groupId') groupId: string,
    @Body() body: GmUpdateRedeemCodeGroupReq,
  ): Promise<GmRedeemCodeGroupDetailRes> {
    return this.redeemCodeService.updateGroup(groupId, body?.name ?? '', body?.rewards ?? []);
  }

  @Post('redeem-code-groups/:groupId/codes')
  appendRedeemCodes(
    @Param('groupId') groupId: string,
    @Body() body: GmAppendRedeemCodesReq,
  ): Promise<GmAppendRedeemCodesRes> {
    return this.redeemCodeService.appendCodes(groupId, Number(body?.count));
  }

  @Delete('redeem-codes/:codeId')
  destroyRedeemCode(@Param('codeId') codeId: string): Promise<{ ok: true }> {
    return this.redeemCodeService.destroyCode(codeId);
  }

  /** 获取运行时地图快照（世界管理用，必须在 maps/:mapId 之前） */
  @Get('maps/:mapId/runtime')
  getMapRuntime(
    @Param('mapId') mapId: string,
    @Query('x') qx: string,
    @Query('y') qy: string,
    @Query('w') qw: string,
    @Query('h') qh: string,
    @Query('viewerId') viewerId?: string,
  ): GmMapRuntimeRes {
/** x：定义该变量以承载业务值。 */
    const x = parseInt(qx, 10) || 0;
/** y：定义该变量以承载业务值。 */
    const y = parseInt(qy, 10) || 0;
/** w：定义该变量以承载业务值。 */
    const w = parseInt(qw, 10) || 20;
/** h：定义该变量以承载业务值。 */
    const h = parseInt(qh, 10) || 20;
/** result：定义该变量以承载业务值。 */
    const result = this.gmService.getMapRuntime(
      mapId, x, y, w, h,
      this.tickService.getMapTickSpeed(mapId),
      this.tickService.isMapPaused(mapId),
      viewerId,
    );
    if (!result) {
      throw new BadRequestException('目标地图不存在');
    }
    return result;
  }

  @Delete('world-observers/:viewerId')
  clearWorldObservation(@Param('viewerId') viewerId: string): { ok: true } {
    this.gmService.clearWorldObservation(viewerId);
    return { ok: true };
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
/** current：定义该变量以承载业务值。 */
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
/** error：定义该变量以承载业务值。 */
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
/** error：定义该变量以承载业务值。 */
    const error = await this.gmService.enqueuePlayerUpdate(playerId, body.snapshot, body.section);
    if (error) {
      throw new BadRequestException(error);
    }
    return { ok: true };
  }

  /** 重置玩家到出生点 */
  @Post('players/:playerId/reset')
  async resetPlayer(@Param('playerId') playerId: string): Promise<{ ok: true }> {
/** error：定义该变量以承载业务值。 */
    const error = await this.gmService.enqueueResetPlayer(playerId);
    if (error) {
      throw new BadRequestException(error);
    }
    return { ok: true };
  }

  /** 快捷设置炼体等级 */
  @Post('players/:playerId/body-training/level')
  async setPlayerBodyTrainingLevel(
    @Param('playerId') playerId: string,
    @Body() body: GmSetPlayerBodyTrainingLevelReq,
  ): Promise<{ ok: true }> {
/** error：定义该变量以承载业务值。 */
    const error = await this.gmService.setManagedPlayerBodyTrainingLevel(playerId, body?.level);
    if (error) {
      throw new BadRequestException(error);
    }
    return { ok: true };
  }

  /** 快捷增加底蕴 */
  @Post('players/:playerId/foundation/add')
  async addPlayerFoundation(
    @Param('playerId') playerId: string,
    @Body() body: GmAddPlayerFoundationReq,
  ): Promise<{ ok: true }> {
/** error：定义该变量以承载业务值。 */
    const error = await this.gmService.addManagedPlayerFoundation(playerId, body?.amount);
    if (error) {
      throw new BadRequestException(error);
    }
    return { ok: true };
  }

  /** 快捷增加战斗经验 */
  @Post('players/:playerId/combat-exp/add')
  async addPlayerCombatExp(
    @Param('playerId') playerId: string,
    @Body() body: GmAddPlayerCombatExpReq,
  ): Promise<{ ok: true }> {
/** error：定义该变量以承载业务值。 */
    const error = await this.gmService.addManagedPlayerCombatExp(playerId, body?.amount);
    if (error) {
      throw new BadRequestException(error);
    }
    return { ok: true };
  }

  /** 重置玩家天门测试状态 */
  @Post('players/:playerId/heaven-gate/reset')
  async resetPlayerHeavenGate(@Param('playerId') playerId: string): Promise<{ ok: true }> {
/** error：定义该变量以承载业务值。 */
    const error = await this.gmService.enqueueResetHeavenGate(playerId);
    if (error) {
      throw new BadRequestException(error);
    }
    return { ok: true };
  }

  /** 所有角色返回新手村出生点 */
  @Post('shortcuts/players/return-all-to-default-spawn')
/** returnAllPlayersToDefaultSpawn：执行对应的业务逻辑。 */
  async returnAllPlayersToDefaultSpawn(): Promise<GmShortcutRunRes> {
    return this.gmService.returnAllPlayersToDefaultSpawn();
  }

  /** 清理全部玩家背包/仓库/装备中的无效物品 */
  @Post('shortcuts/players/cleanup-invalid-items')
/** cleanupAllPlayersInvalidItems：执行对应的业务逻辑。 */
  async cleanupAllPlayersInvalidItems(): Promise<GmShortcutRunRes> {
    return this.gmService.cleanupAllPlayersInvalidItems();
  }

  @Post('shortcuts/compensation/combat-exp-2026-04-09')
/** compensateAllPlayersCombatExp：执行对应的业务逻辑。 */
  async compensateAllPlayersCombatExp(): Promise<GmShortcutRunRes> {
    return this.gmService.compensateAllPlayersCombatExp();
  }

  @Post('shortcuts/compensation/foundation-2026-04-09')
/** compensateAllPlayersFoundation：执行对应的业务逻辑。 */
  async compensateAllPlayersFoundation(): Promise<GmShortcutRunRes> {
    return this.gmService.compensateAllPlayersFoundation();
  }

  @Post('shortcuts/world/add-herb-stock-1000')
/** addHerbStockToAllMaps：执行对应的业务逻辑。 */
  async addHerbStockToAllMaps(): Promise<GmShortcutRunRes> {
    return this.gmService.addHerbStockToAllMaps(1000);
  }

  /** 生成 Bot */
  @Post('bots/spawn')
  async spawnBots(@Body() body: GmSpawnBotsReq): Promise<{ ok: true }> {
/** error：定义该变量以承载业务值。 */
    const error = await this.gmService.enqueueSpawnBots(body.anchorPlayerId, body.count);
    if (error) {
      throw new BadRequestException(error);
    }
    return { ok: true };
  }

  /** 移除 Bot */
  @Post('bots/remove')
  removeBots(@Body() body: GmRemoveBotsReq): { ok: true } {
/** error：定义该变量以承载业务值。 */
    const error = this.gmService.enqueueRemoveBots(body?.playerIds, body?.all);
    if (error) {
      throw new BadRequestException(error);
    }
    return { ok: true };
  }
}

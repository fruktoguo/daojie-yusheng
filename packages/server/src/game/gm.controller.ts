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
  UseGuards,
} from '@nestjs/common';
import {
  GmMapDetailRes,
  GmMapListRes,
  GmMapRuntimeRes,
  GmPlayerDetailRes,
  GmRemoveBotsReq,
  GmSpawnBotsReq,
  GmStateRes,
  GmUpdateMapReq,
  GmUpdateMapTickReq,
  GmUpdateMapTimeReq,
  GmUpdatePlayerReq,
  Suggestion,
} from '@mud/shared';
import { GmAuthGuard } from './gm-auth.guard';
import { GmService } from './gm.service';
import { SuggestionService } from './suggestion.service';
import { TickService } from './tick.service';

@Controller('gm')
@UseGuards(GmAuthGuard)
export class GmController {
  constructor(
    private readonly gmService: GmService,
    private readonly suggestionService: SuggestionService,
    private readonly tickService: TickService,
  ) {}

  /** 获取全局 GM 状态 */
  @Get('state')
  getState(): Promise<GmStateRes> {
    return this.gmService.getState();
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

  /** 获取单个玩家详情 */
  @Get('players/:playerId')
  async getPlayer(@Param('playerId') playerId: string): Promise<GmPlayerDetailRes> {
    const player = await this.gmService.getPlayerDetail(playerId);
    if (!player) {
      throw new BadRequestException('目标玩家不存在');
    }
    return { player };
  }

  @Get('maps')
  getMaps(): GmMapListRes {
    return this.gmService.getEditableMapList();
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

  @Get('maps/:mapId')
  getMap(@Param('mapId') mapId: string): GmMapDetailRes {
    const map = this.gmService.getEditableMap(mapId);
    if (!map) {
      throw new BadRequestException('目标地图不存在');
    }
    return { map };
  }

  /** 保存地图编辑 */
  @Put('maps/:mapId')
  async updateMap(
    @Param('mapId') mapId: string,
    @Body() body: GmUpdateMapReq,
  ): Promise<{ ok: true }> {
    if (!body?.map) {
      throw new BadRequestException('缺少地图数据');
    }
    const error = await this.gmService.saveEditableMap(mapId, body.map);
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
    const error = await this.gmService.enqueuePlayerUpdate(playerId, body.snapshot);
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

import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';

import { RedeemCodeRuntimeService } from '../../runtime/redeem/redeem-code-runtime.service';
import { NEXT_GM_HTTP_CONTRACT } from './next-gm-contract';
import { NextGmAuthGuard } from './next-gm-auth.guard';
import { NextGmMailService } from './next-gm-mail.service';
import { NextGmPlayerService } from './next-gm-player.service';
import { NextGmWorldService } from './next-gm-world.service';
import { NextManagedAccountService } from './next-managed-account.service';
/**
 * UpdatePlayerPasswordBody：定义接口结构约束，明确可交付字段含义。
 */


interface UpdatePlayerPasswordBody {
/**
 * newPassword：newPassword相关字段。
 */

  newPassword?: string;  
  /**
 * password：password相关字段。
 */

  password?: string;
}
/**
 * UpdatePlayerAccountBody：定义接口结构约束，明确可交付字段含义。
 */


interface UpdatePlayerAccountBody {
/**
 * username：username名称或显示文本。
 */

  username?: string;
}
/**
 * UpdatePlayerBody：定义接口结构约束，明确可交付字段含义。
 */


interface UpdatePlayerBody {
/**
 * section：section相关字段。
 */

  section?: unknown;  
  /**
 * snapshot：快照状态或数据块。
 */

  snapshot?: unknown;
}
/**
 * SpawnBotsBody：定义接口结构约束，明确可交付字段含义。
 */


interface SpawnBotsBody {
/**
 * anchorPlayerId：anchor玩家ID标识。
 */

  anchorPlayerId?: string;  
  /**
 * count：数量或计量字段。
 */

  count?: number;
}
/**
 * RemoveBotsBody：定义接口结构约束，明确可交付字段含义。
 */


interface RemoveBotsBody {
/**
 * playerIds：玩家ID相关字段。
 */

  playerIds?: string[];  
  /**
 * all：all相关字段。
 */

  all?: boolean;
}
/**
 * DirectMailBody：定义接口结构约束，明确可交付字段含义。
 */


interface DirectMailBody {
  [key: string]: unknown;
}
/**
 * BroadcastMailBody：定义接口结构约束，明确可交付字段含义。
 */


interface BroadcastMailBody {
  [key: string]: unknown;
}
/**
 * RedeemCodeGroupBody：定义接口结构约束，明确可交付字段含义。
 */


interface RedeemCodeGroupBody {
/**
 * name：名称名称或显示文本。
 */

  name?: string;  
  /**
 * rewards：reward相关字段。
 */

  rewards?: unknown[];  
  /**
 * count：数量或计量字段。
 */

  count?: unknown;
}
/**
 * SuggestionsQuery：定义接口结构约束，明确可交付字段含义。
 */


interface SuggestionsQuery {
  [key: string]: unknown;
}
/**
 * SuggestionReplyBody：定义接口结构约束，明确可交付字段含义。
 */


interface SuggestionReplyBody {
  [key: string]: unknown;
}
/**
 * MapConfigBody：定义接口结构约束，明确可交付字段含义。
 */


interface MapConfigBody {
  [key: string]: unknown;
}
/**
 * RedeemCodeRuntimeServicePort：定义接口结构约束，明确可交付字段含义。
 */


interface RedeemCodeRuntimeServicePort {
  listGroups(): unknown;
  createGroup(name: string, rewards: unknown[], count: number): Promise<unknown>;
  getGroupDetail(groupId: string): Promise<unknown>;
  updateGroup(groupId: string, name: string, rewards: unknown[]): Promise<unknown>;
  appendCodes(groupId: string, count: number): Promise<unknown>;
  destroyCode(codeId: string): Promise<unknown>;
}
/**
 * NextGmController：封装该能力的入口与生命周期，承载运行时核心协作。
 */


@Controller(NEXT_GM_HTTP_CONTRACT.gmBasePath)
@UseGuards(NextGmAuthGuard)
@Reflect.metadata('design:paramtypes', [NextGmWorldService, NextManagedAccountService, NextGmPlayerService, NextGmMailService, RedeemCodeRuntimeService])
export class NextGmController {
/**
 * redeemCodeRuntimeService：redeemCode运行态服务引用。
 */

  private readonly redeemCodeRuntimeService: RedeemCodeRuntimeServicePort;  
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param nextGmWorldService NextGmWorldService 参数说明。
 * @param nextManagedAccountService NextManagedAccountService 参数说明。
 * @param nextGmPlayerService NextGmPlayerService 参数说明。
 * @param nextGmMailService NextGmMailService 参数说明。
 * @param redeemCodeRuntimeService RedeemCodeRuntimeServicePort 参数说明。
 * @returns 无返回值，完成实例初始化。
 */


  constructor(
    private readonly nextGmWorldService: NextGmWorldService,
    private readonly nextManagedAccountService: NextManagedAccountService,
    private readonly nextGmPlayerService: NextGmPlayerService,
    private readonly nextGmMailService: NextGmMailService,
    @Inject(RedeemCodeRuntimeService) redeemCodeRuntimeService: RedeemCodeRuntimeServicePort,
  ) {
    this.redeemCodeRuntimeService = redeemCodeRuntimeService;
  }  
  /**
 * getState：读取状态。
 * @returns 无返回值，完成状态的读取/组装。
 */


  @Get('state')
  getState() {
    return this.nextGmWorldService.getState();
  }  
  /**
 * getEditorCatalog：读取Editor目录。
 * @returns 无返回值，完成Editor目录的读取/组装。
 */


  @Get('editor-catalog')
  getEditorCatalog() {
    return this.nextGmWorldService.getEditorCatalog();
  }  
  /**
 * getMaps：读取地图。
 * @returns 无返回值，完成地图的读取/组装。
 */


  @Get('maps')
  getMaps() {
    return this.nextGmWorldService.getMaps();
  }  
  /**
 * getMapRuntime：读取地图运行态。
 * @param mapId string 地图 ID。
 * @param qx string 参数说明。
 * @param qy string 参数说明。
 * @param qw string 参数说明。
 * @param qh string 参数说明。
 * @param viewerId string viewer ID。
 * @returns 无返回值，完成地图运行态的读取/组装。
 */


  @Get('maps/:mapId/runtime')
  getMapRuntime(
    @Param('mapId') mapId: string,
    @Query('x') qx: string,
    @Query('y') qy: string,
    @Query('w') qw: string,
    @Query('h') qh: string,
    @Query('viewerId') viewerId: string,
  ) {
    return this.nextGmWorldService.getMapRuntime(mapId, qx, qy, qw, qh, viewerId);
  }  
  /**
 * getPlayer：读取玩家。
 * @param playerId string 玩家 ID。
 * @returns 无返回值，完成玩家的读取/组装。
 */


  @Get('players/:playerId')
  async getPlayer(@Param('playerId') playerId: string) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const player = await this.nextGmPlayerService.getPlayerDetail(playerId);
    if (!player) {
      throw new BadRequestException('目标玩家不存在');
    }
    return player;
  }  
  /**
 * updatePlayerPassword：处理玩家Password并更新相关状态。
 * @param playerId string 玩家 ID。
 * @param body UpdatePlayerPasswordBody 参数说明。
 * @returns 无返回值，直接更新玩家Password相关状态。
 */


  @Post('players/:playerId/password')
  async updatePlayerPassword(@Param('playerId') playerId: string, @Body() body: UpdatePlayerPasswordBody) {
    const nextPassword = typeof body?.newPassword === 'string' && body.newPassword.trim()
      ? body.newPassword
      : body?.password ?? '';
    await this.nextManagedAccountService.updateManagedPlayerPassword(playerId, nextPassword);
    return { ok: true };
  }  
  /**
 * updatePlayerAccount：处理玩家Account并更新相关状态。
 * @param playerId string 玩家 ID。
 * @param body UpdatePlayerAccountBody 参数说明。
 * @returns 无返回值，直接更新玩家Account相关状态。
 */


  @Put('players/:playerId/account')
  async updatePlayerAccount(@Param('playerId') playerId: string, @Body() body: UpdatePlayerAccountBody) {
    await this.nextManagedAccountService.updateManagedPlayerAccount(playerId, body?.username ?? '');
    return { ok: true };
  }  
  /**
 * updatePlayer：处理玩家并更新相关状态。
 * @param playerId string 玩家 ID。
 * @param body UpdatePlayerBody 参数说明。
 * @returns 无返回值，直接更新玩家相关状态。
 */


  @Put('players/:playerId')
  async updatePlayer(@Param('playerId') playerId: string, @Body() body: UpdatePlayerBody) {
    await this.nextGmPlayerService.updatePlayer(playerId, body ?? {});
    return { ok: true };
  }  
  /**
 * resetPlayer：执行reset玩家相关逻辑。
 * @param playerId string 玩家 ID。
 * @returns 无返回值，直接更新reset玩家相关状态。
 */


  @Post('players/:playerId/reset')
  async resetPlayer(@Param('playerId') playerId: string) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.nextGmPlayerService.hasRuntimePlayer(playerId)) {
      this.nextGmPlayerService.resetPlayer(playerId);
    } else {
      await this.nextGmPlayerService.resetPersistedPlayer(playerId);
    }
    return { ok: true };
  }  
  /**
 * resetHeavenGate：执行resetHeavenGate相关逻辑。
 * @param playerId string 玩家 ID。
 * @returns 无返回值，直接更新resetHeavenGate相关状态。
 */


  @Post('players/:playerId/heaven-gate/reset')
  async resetHeavenGate(@Param('playerId') playerId: string) {
    await this.nextGmPlayerService.resetHeavenGate(playerId);
    return { ok: true };
  }  
  /**
 * spawnBots：执行spawnBot相关逻辑。
 * @param body SpawnBotsBody 参数说明。
 * @returns 无返回值，直接更新spawnBot相关状态。
 */


  @Post('bots/spawn')
  async spawnBots(@Body() body: SpawnBotsBody) {
    this.nextGmPlayerService.spawnBots(body?.anchorPlayerId ?? '', body?.count);
    return { ok: true };
  }  
  /**
 * removeBots：处理Bot并更新相关状态。
 * @param body RemoveBotsBody 参数说明。
 * @returns 无返回值，直接更新Bot相关状态。
 */


  @Post('bots/remove')
  async removeBots(@Body() body: RemoveBotsBody) {
    this.nextGmPlayerService.removeBots(body?.playerIds ?? [], body?.all ?? false);
    return { ok: true };
  }  
  /**
 * returnAllPlayersToDefaultSpawn：执行returnAll玩家To默认Spawn相关逻辑。
 * @returns 无返回值，直接更新returnAll玩家ToDefaultSpawn相关状态。
 */


  @Post('shortcuts/players/return-all-to-default-spawn')
  async returnAllPlayersToDefaultSpawn() {
    return this.nextGmPlayerService.returnAllPlayersToDefaultSpawn();
  }  
  /**
 * resetNetworkPerf：执行resetNetworkPerf相关逻辑。
 * @returns 无返回值，直接更新resetNetworkPerf相关状态。
 */


  @Post('perf/network/reset')
  resetNetworkPerf() {
    this.nextGmWorldService.resetNetworkPerf();
    return { ok: true };
  }  
  /**
 * resetCpuPerf：执行resetCpuPerf相关逻辑。
 * @returns 无返回值，直接更新resetCpuPerf相关状态。
 */


  @Post('perf/cpu/reset')
  resetCpuPerf() {
    this.nextGmWorldService.resetCpuPerf();
    return { ok: true };
  }  
  /**
 * resetPathfindingPerf：读取resetPathfindingPerf并返回结果。
 * @returns 无返回值，直接更新resetPathfindingPerf相关状态。
 */


  @Post('perf/pathfinding/reset')
  resetPathfindingPerf() {
    this.nextGmWorldService.resetPathfindingPerf();
    return { ok: true };
  }  
  /**
 * createDirectMail：构建并返回目标对象。
 * @param playerId string 玩家 ID。
 * @param body DirectMailBody 参数说明。
 * @returns 无返回值，直接更新Direct邮件相关状态。
 */


  @Post('players/:playerId/mail')
  async createDirectMail(@Param('playerId') playerId: string, @Body() body: DirectMailBody) {
    const mailId = await this.nextGmMailService.createDirectMail(playerId, body ?? {});
    return { ok: true, mailId };
  }  
  /**
 * createBroadcastMail：构建并返回目标对象。
 * @param body BroadcastMailBody 参数说明。
 * @returns 无返回值，直接更新Broadcast邮件相关状态。
 */


  @Post('mail/broadcast')
  async createBroadcastMail(@Body() body: BroadcastMailBody) {
    const result = await this.nextGmMailService.createBroadcastMail(body ?? {});
    return { ok: true, mailId: result.mailId, batchId: result.batchId, recipientCount: result.recipientCount };
  }  
  /**
 * getRedeemCodeGroups：读取RedeemCodeGroup。
 * @returns 无返回值，完成RedeemCodeGroup的读取/组装。
 */


  @Get('redeem-code-groups')
  getRedeemCodeGroups() {
    return this.redeemCodeRuntimeService.listGroups();
  }  
  /**
 * createRedeemCodeGroup：构建并返回目标对象。
 * @param body RedeemCodeGroupBody 参数说明。
 * @returns 无返回值，直接更新RedeemCodeGroup相关状态。
 */


  @Post('redeem-code-groups')
  async createRedeemCodeGroup(@Body() body: RedeemCodeGroupBody) {
    return this.redeemCodeRuntimeService.createGroup(body?.name ?? '', body?.rewards ?? [], Number(body?.count));
  }  
  /**
 * getRedeemCodeGroup：读取RedeemCodeGroup。
 * @param groupId string group ID。
 * @returns 无返回值，完成RedeemCodeGroup的读取/组装。
 */


  @Get('redeem-code-groups/:groupId')
  async getRedeemCodeGroup(@Param('groupId') groupId: string) {
    return this.redeemCodeRuntimeService.getGroupDetail(groupId);
  }  
  /**
 * updateRedeemCodeGroup：处理RedeemCodeGroup并更新相关状态。
 * @param groupId string group ID。
 * @param body RedeemCodeGroupBody 参数说明。
 * @returns 无返回值，直接更新RedeemCodeGroup相关状态。
 */


  @Put('redeem-code-groups/:groupId')
  async updateRedeemCodeGroup(@Param('groupId') groupId: string, @Body() body: RedeemCodeGroupBody) {
    return this.redeemCodeRuntimeService.updateGroup(groupId, body?.name ?? '', body?.rewards ?? []);
  }  
  /**
 * appendRedeemCodes：执行appendRedeemCode相关逻辑。
 * @param groupId string group ID。
 * @param body RedeemCodeGroupBody 参数说明。
 * @returns 无返回值，直接更新appendRedeemCode相关状态。
 */


  @Post('redeem-code-groups/:groupId/codes')
  async appendRedeemCodes(@Param('groupId') groupId: string, @Body() body: RedeemCodeGroupBody) {
    return this.redeemCodeRuntimeService.appendCodes(groupId, Number(body?.count));
  }  
  /**
 * destroyRedeemCode：执行destroyRedeemCode相关逻辑。
 * @param codeId string code ID。
 * @returns 无返回值，直接更新destroyRedeemCode相关状态。
 */


  @Delete('redeem-codes/:codeId')
  async destroyRedeemCode(@Param('codeId') codeId: string) {
    return this.redeemCodeRuntimeService.destroyCode(codeId);
  }  
  /**
 * getSuggestions：读取Suggestion。
 * @param query SuggestionsQuery 参数说明。
 * @returns 无返回值，完成Suggestion的读取/组装。
 */


  @Get('suggestions')
  getSuggestions(@Query() query: SuggestionsQuery) {
    return this.nextGmWorldService.getSuggestions(query ?? {});
  }  
  /**
 * completeSuggestion：执行completeSuggestion相关逻辑。
 * @param id string 参数说明。
 * @returns 无返回值，直接更新completeSuggestion相关状态。
 */


  @Post('suggestions/:id/complete')
  async completeSuggestion(@Param('id') id: string) {
    return this.nextGmWorldService.completeSuggestion(id);
  }  
  /**
 * replySuggestion：执行replySuggestion相关逻辑。
 * @param id string 参数说明。
 * @param body SuggestionReplyBody 参数说明。
 * @returns 无返回值，直接更新replySuggestion相关状态。
 */


  @Post('suggestions/:id/replies')
  async replySuggestion(@Param('id') id: string, @Body() body: SuggestionReplyBody) {
    return this.nextGmWorldService.replySuggestion(id, body ?? {});
  }  
  /**
 * removeSuggestion：处理Suggestion并更新相关状态。
 * @param id string 参数说明。
 * @returns 无返回值，直接更新Suggestion相关状态。
 */


  @Delete('suggestions/:id')
  async removeSuggestion(@Param('id') id: string) {
    return this.nextGmWorldService.removeSuggestion(id);
  }  
  /**
 * updateMapTick：处理地图tick并更新相关状态。
 * @param mapId string 地图 ID。
 * @param body MapConfigBody 参数说明。
 * @returns 无返回值，直接更新地图tick相关状态。
 */


  @Put('maps/:mapId/tick')
  updateMapTick(@Param('mapId') mapId: string, @Body() body: MapConfigBody) {
    this.nextGmWorldService.updateMapTick(mapId, body ?? {});
    return { ok: true };
  }  
  /**
 * updateMapTime：处理地图时间并更新相关状态。
 * @param mapId string 地图 ID。
 * @param body MapConfigBody 参数说明。
 * @returns 无返回值，直接更新地图时间相关状态。
 */


  @Put('maps/:mapId/time')
  updateMapTime(@Param('mapId') mapId: string, @Body() body: MapConfigBody) {
    this.nextGmWorldService.updateMapTime(mapId, body ?? {});
    return { ok: true };
  }  
  /**
 * reloadTickConfig：读取reloadtick配置并返回结果。
 * @returns 无返回值，直接更新reloadtick配置相关状态。
 */


  @Post('tick-config/reload')
  reloadTickConfig() {
    return this.nextGmWorldService.reloadTickConfig();
  }  
  /**
 * clearWorldObservation：执行clear世界Observation相关逻辑。
 * @param viewerId string viewer ID。
 * @returns 无返回值，直接更新clear世界Observation相关状态。
 */


  @Delete('world-observers/:viewerId')
  clearWorldObservation(@Param('viewerId') viewerId: string) {
    this.nextGmWorldService.clearWorldObservation(viewerId);
    return { ok: true };
  }
}

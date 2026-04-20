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
 * newPassword：UpdatePlayerPasswordBody 内部字段。
 */

  newPassword?: string;  
  /**
 * password：UpdatePlayerPasswordBody 内部字段。
 */

  password?: string;
}
/**
 * UpdatePlayerAccountBody：定义接口结构约束，明确可交付字段含义。
 */


interface UpdatePlayerAccountBody {
/**
 * username：UpdatePlayerAccountBody 内部字段。
 */

  username?: string;
}
/**
 * UpdatePlayerBody：定义接口结构约束，明确可交付字段含义。
 */


interface UpdatePlayerBody {
/**
 * section：UpdatePlayerBody 内部字段。
 */

  section?: unknown;  
  /**
 * snapshot：UpdatePlayerBody 内部字段。
 */

  snapshot?: unknown;
}
/**
 * SpawnBotsBody：定义接口结构约束，明确可交付字段含义。
 */


interface SpawnBotsBody {
/**
 * anchorPlayerId：SpawnBotsBody 内部字段。
 */

  anchorPlayerId?: string;  
  /**
 * count：SpawnBotsBody 内部字段。
 */

  count?: number;
}
/**
 * RemoveBotsBody：定义接口结构约束，明确可交付字段含义。
 */


interface RemoveBotsBody {
/**
 * playerIds：RemoveBotsBody 内部字段。
 */

  playerIds?: string[];  
  /**
 * all：RemoveBotsBody 内部字段。
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
 * name：RedeemCodeGroupBody 内部字段。
 */

  name?: string;  
  /**
 * rewards：RedeemCodeGroupBody 内部字段。
 */

  rewards?: unknown[];  
  /**
 * count：RedeemCodeGroupBody 内部字段。
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
 * redeemCodeRuntimeService：NextGmController 内部字段。
 */

  private readonly redeemCodeRuntimeService: RedeemCodeRuntimeServicePort;  
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param nextGmWorldService NextGmWorldService 参数说明。
 * @param nextManagedAccountService NextManagedAccountService 参数说明。
 * @param nextGmPlayerService NextGmPlayerService 参数说明。
 * @param nextGmMailService NextGmMailService 参数说明。
 * @param redeemCodeRuntimeService RedeemCodeRuntimeServicePort 参数说明。
 * @returns 无返回值（构造函数）。
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
 * getState：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */


  @Get('state')
  getState() {
    return this.nextGmWorldService.getState();
  }  
  /**
 * getEditorCatalog：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */


  @Get('editor-catalog')
  getEditorCatalog() {
    return this.nextGmWorldService.getEditorCatalog();
  }  
  /**
 * getMaps：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */


  @Get('maps')
  getMaps() {
    return this.nextGmWorldService.getMaps();
  }  
  /**
 * getMapRuntime：按给定条件读取/查询数据。
 * @param mapId string 地图 ID。
 * @param qx string 参数说明。
 * @param qy string 参数说明。
 * @param qw string 参数说明。
 * @param qh string 参数说明。
 * @param viewerId string viewer ID。
 * @returns 函数返回值。
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
 * getPlayer：按给定条件读取/查询数据。
 * @param playerId string 玩家 ID。
 * @returns 函数返回值。
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
 * updatePlayerPassword：更新/写入相关状态。
 * @param playerId string 玩家 ID。
 * @param body UpdatePlayerPasswordBody 参数说明。
 * @returns 函数返回值。
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
 * updatePlayerAccount：更新/写入相关状态。
 * @param playerId string 玩家 ID。
 * @param body UpdatePlayerAccountBody 参数说明。
 * @returns 函数返回值。
 */


  @Put('players/:playerId/account')
  async updatePlayerAccount(@Param('playerId') playerId: string, @Body() body: UpdatePlayerAccountBody) {
    await this.nextManagedAccountService.updateManagedPlayerAccount(playerId, body?.username ?? '');
    return { ok: true };
  }  
  /**
 * updatePlayer：更新/写入相关状态。
 * @param playerId string 玩家 ID。
 * @param body UpdatePlayerBody 参数说明。
 * @returns 函数返回值。
 */


  @Put('players/:playerId')
  async updatePlayer(@Param('playerId') playerId: string, @Body() body: UpdatePlayerBody) {
    await this.nextGmPlayerService.updatePlayer(playerId, body ?? {});
    return { ok: true };
  }  
  /**
 * resetPlayer：执行核心业务逻辑。
 * @param playerId string 玩家 ID。
 * @returns 函数返回值。
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
 * resetHeavenGate：执行核心业务逻辑。
 * @param playerId string 玩家 ID。
 * @returns 函数返回值。
 */


  @Post('players/:playerId/heaven-gate/reset')
  async resetHeavenGate(@Param('playerId') playerId: string) {
    await this.nextGmPlayerService.resetHeavenGate(playerId);
    return { ok: true };
  }  
  /**
 * spawnBots：执行核心业务逻辑。
 * @param body SpawnBotsBody 参数说明。
 * @returns 函数返回值。
 */


  @Post('bots/spawn')
  async spawnBots(@Body() body: SpawnBotsBody) {
    this.nextGmPlayerService.spawnBots(body?.anchorPlayerId ?? '', body?.count);
    return { ok: true };
  }  
  /**
 * removeBots：执行核心业务逻辑。
 * @param body RemoveBotsBody 参数说明。
 * @returns 函数返回值。
 */


  @Post('bots/remove')
  async removeBots(@Body() body: RemoveBotsBody) {
    this.nextGmPlayerService.removeBots(body?.playerIds ?? [], body?.all ?? false);
    return { ok: true };
  }  
  /**
 * returnAllPlayersToDefaultSpawn：执行核心业务逻辑。
 * @returns 函数返回值。
 */


  @Post('shortcuts/players/return-all-to-default-spawn')
  async returnAllPlayersToDefaultSpawn() {
    return this.nextGmPlayerService.returnAllPlayersToDefaultSpawn();
  }  
  /**
 * resetNetworkPerf：执行核心业务逻辑。
 * @returns 函数返回值。
 */


  @Post('perf/network/reset')
  resetNetworkPerf() {
    this.nextGmWorldService.resetNetworkPerf();
    return { ok: true };
  }  
  /**
 * resetCpuPerf：执行核心业务逻辑。
 * @returns 函数返回值。
 */


  @Post('perf/cpu/reset')
  resetCpuPerf() {
    this.nextGmWorldService.resetCpuPerf();
    return { ok: true };
  }  
  /**
 * resetPathfindingPerf：执行核心业务逻辑。
 * @returns 函数返回值。
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
 * @returns 函数返回值。
 */


  @Post('players/:playerId/mail')
  async createDirectMail(@Param('playerId') playerId: string, @Body() body: DirectMailBody) {
    const mailId = await this.nextGmMailService.createDirectMail(playerId, body ?? {});
    return { ok: true, mailId };
  }  
  /**
 * createBroadcastMail：构建并返回目标对象。
 * @param body BroadcastMailBody 参数说明。
 * @returns 函数返回值。
 */


  @Post('mail/broadcast')
  async createBroadcastMail(@Body() body: BroadcastMailBody) {
    const result = await this.nextGmMailService.createBroadcastMail(body ?? {});
    return { ok: true, mailId: result.mailId, batchId: result.batchId, recipientCount: result.recipientCount };
  }  
  /**
 * getRedeemCodeGroups：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */


  @Get('redeem-code-groups')
  getRedeemCodeGroups() {
    return this.redeemCodeRuntimeService.listGroups();
  }  
  /**
 * createRedeemCodeGroup：构建并返回目标对象。
 * @param body RedeemCodeGroupBody 参数说明。
 * @returns 函数返回值。
 */


  @Post('redeem-code-groups')
  async createRedeemCodeGroup(@Body() body: RedeemCodeGroupBody) {
    return this.redeemCodeRuntimeService.createGroup(body?.name ?? '', body?.rewards ?? [], Number(body?.count));
  }  
  /**
 * getRedeemCodeGroup：按给定条件读取/查询数据。
 * @param groupId string group ID。
 * @returns 函数返回值。
 */


  @Get('redeem-code-groups/:groupId')
  async getRedeemCodeGroup(@Param('groupId') groupId: string) {
    return this.redeemCodeRuntimeService.getGroupDetail(groupId);
  }  
  /**
 * updateRedeemCodeGroup：更新/写入相关状态。
 * @param groupId string group ID。
 * @param body RedeemCodeGroupBody 参数说明。
 * @returns 函数返回值。
 */


  @Put('redeem-code-groups/:groupId')
  async updateRedeemCodeGroup(@Param('groupId') groupId: string, @Body() body: RedeemCodeGroupBody) {
    return this.redeemCodeRuntimeService.updateGroup(groupId, body?.name ?? '', body?.rewards ?? []);
  }  
  /**
 * appendRedeemCodes：执行核心业务逻辑。
 * @param groupId string group ID。
 * @param body RedeemCodeGroupBody 参数说明。
 * @returns 函数返回值。
 */


  @Post('redeem-code-groups/:groupId/codes')
  async appendRedeemCodes(@Param('groupId') groupId: string, @Body() body: RedeemCodeGroupBody) {
    return this.redeemCodeRuntimeService.appendCodes(groupId, Number(body?.count));
  }  
  /**
 * destroyRedeemCode：执行核心业务逻辑。
 * @param codeId string code ID。
 * @returns 函数返回值。
 */


  @Delete('redeem-codes/:codeId')
  async destroyRedeemCode(@Param('codeId') codeId: string) {
    return this.redeemCodeRuntimeService.destroyCode(codeId);
  }  
  /**
 * getSuggestions：按给定条件读取/查询数据。
 * @param query SuggestionsQuery 参数说明。
 * @returns 函数返回值。
 */


  @Get('suggestions')
  getSuggestions(@Query() query: SuggestionsQuery) {
    return this.nextGmWorldService.getSuggestions(query ?? {});
  }  
  /**
 * completeSuggestion：执行核心业务逻辑。
 * @param id string 参数说明。
 * @returns 函数返回值。
 */


  @Post('suggestions/:id/complete')
  async completeSuggestion(@Param('id') id: string) {
    return this.nextGmWorldService.completeSuggestion(id);
  }  
  /**
 * replySuggestion：执行核心业务逻辑。
 * @param id string 参数说明。
 * @param body SuggestionReplyBody 参数说明。
 * @returns 函数返回值。
 */


  @Post('suggestions/:id/replies')
  async replySuggestion(@Param('id') id: string, @Body() body: SuggestionReplyBody) {
    return this.nextGmWorldService.replySuggestion(id, body ?? {});
  }  
  /**
 * removeSuggestion：执行核心业务逻辑。
 * @param id string 参数说明。
 * @returns 函数返回值。
 */


  @Delete('suggestions/:id')
  async removeSuggestion(@Param('id') id: string) {
    return this.nextGmWorldService.removeSuggestion(id);
  }  
  /**
 * updateMapTick：更新/写入相关状态。
 * @param mapId string 地图 ID。
 * @param body MapConfigBody 参数说明。
 * @returns 函数返回值。
 */


  @Put('maps/:mapId/tick')
  updateMapTick(@Param('mapId') mapId: string, @Body() body: MapConfigBody) {
    this.nextGmWorldService.updateMapTick(mapId, body ?? {});
    return { ok: true };
  }  
  /**
 * updateMapTime：更新/写入相关状态。
 * @param mapId string 地图 ID。
 * @param body MapConfigBody 参数说明。
 * @returns 函数返回值。
 */


  @Put('maps/:mapId/time')
  updateMapTime(@Param('mapId') mapId: string, @Body() body: MapConfigBody) {
    this.nextGmWorldService.updateMapTime(mapId, body ?? {});
    return { ok: true };
  }  
  /**
 * reloadTickConfig：执行核心业务逻辑。
 * @returns 函数返回值。
 */


  @Post('tick-config/reload')
  reloadTickConfig() {
    return this.nextGmWorldService.reloadTickConfig();
  }  
  /**
 * clearWorldObservation：执行核心业务逻辑。
 * @param viewerId string viewer ID。
 * @returns 函数返回值。
 */


  @Delete('world-observers/:viewerId')
  clearWorldObservation(@Param('viewerId') viewerId: string) {
    this.nextGmWorldService.clearWorldObservation(viewerId);
    return { ok: true };
  }
}

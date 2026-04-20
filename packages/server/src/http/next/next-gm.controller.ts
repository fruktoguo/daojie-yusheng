import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';

import { RedeemCodeRuntimeService } from '../../runtime/redeem/redeem-code-runtime.service';
import { NEXT_GM_HTTP_CONTRACT } from './next-gm-contract';
import { NextGmAuthGuard } from './next-gm-auth.guard';
import { NextGmMailService } from './next-gm-mail.service';
import { NextGmPlayerService } from './next-gm-player.service';
import { NextGmWorldService } from './next-gm-world.service';
import { NextManagedAccountService } from './next-managed-account.service';

interface UpdatePlayerPasswordBody {
  newPassword?: string;
  password?: string;
}

interface UpdatePlayerAccountBody {
  username?: string;
}

interface UpdatePlayerBody {
  section?: unknown;
  snapshot?: unknown;
}

interface SpawnBotsBody {
  anchorPlayerId?: string;
  count?: number;
}

interface RemoveBotsBody {
  playerIds?: string[];
  all?: boolean;
}

interface DirectMailBody {
  [key: string]: unknown;
}

interface BroadcastMailBody {
  [key: string]: unknown;
}

interface RedeemCodeGroupBody {
  name?: string;
  rewards?: unknown[];
  count?: unknown;
}

interface SuggestionsQuery {
  [key: string]: unknown;
}

interface SuggestionReplyBody {
  [key: string]: unknown;
}

interface MapConfigBody {
  [key: string]: unknown;
}

interface RedeemCodeRuntimeServicePort {
  listGroups(): unknown;
  createGroup(name: string, rewards: unknown[], count: number): Promise<unknown>;
  getGroupDetail(groupId: string): Promise<unknown>;
  updateGroup(groupId: string, name: string, rewards: unknown[]): Promise<unknown>;
  appendCodes(groupId: string, count: number): Promise<unknown>;
  destroyCode(codeId: string): Promise<unknown>;
}

@Controller(NEXT_GM_HTTP_CONTRACT.gmBasePath)
@UseGuards(NextGmAuthGuard)
@Reflect.metadata('design:paramtypes', [NextGmWorldService, NextManagedAccountService, NextGmPlayerService, NextGmMailService, RedeemCodeRuntimeService])
export class NextGmController {
  private readonly redeemCodeRuntimeService: RedeemCodeRuntimeServicePort;

  constructor(
    private readonly nextGmWorldService: NextGmWorldService,
    private readonly nextManagedAccountService: NextManagedAccountService,
    private readonly nextGmPlayerService: NextGmPlayerService,
    private readonly nextGmMailService: NextGmMailService,
    @Inject(RedeemCodeRuntimeService) redeemCodeRuntimeService: RedeemCodeRuntimeServicePort,
  ) {
    this.redeemCodeRuntimeService = redeemCodeRuntimeService;
  }

  @Get('state')
  getState() {
    return this.nextGmWorldService.getState();
  }

  @Get('editor-catalog')
  getEditorCatalog() {
    return this.nextGmWorldService.getEditorCatalog();
  }

  @Get('maps')
  getMaps() {
    return this.nextGmWorldService.getMaps();
  }

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

  @Get('players/:playerId')
  async getPlayer(@Param('playerId') playerId: string) {
    const player = await this.nextGmPlayerService.getPlayerDetail(playerId);
    if (!player) {
      throw new BadRequestException('目标玩家不存在');
    }
    return player;
  }

  @Post('players/:playerId/password')
  async updatePlayerPassword(@Param('playerId') playerId: string, @Body() body: UpdatePlayerPasswordBody) {
    const nextPassword = typeof body?.newPassword === 'string' && body.newPassword.trim()
      ? body.newPassword
      : body?.password ?? '';
    await this.nextManagedAccountService.updateManagedPlayerPassword(playerId, nextPassword);
    return { ok: true };
  }

  @Put('players/:playerId/account')
  async updatePlayerAccount(@Param('playerId') playerId: string, @Body() body: UpdatePlayerAccountBody) {
    await this.nextManagedAccountService.updateManagedPlayerAccount(playerId, body?.username ?? '');
    return { ok: true };
  }

  @Put('players/:playerId')
  async updatePlayer(@Param('playerId') playerId: string, @Body() body: UpdatePlayerBody) {
    await this.nextGmPlayerService.updatePlayer(playerId, body ?? {});
    return { ok: true };
  }

  @Post('players/:playerId/reset')
  async resetPlayer(@Param('playerId') playerId: string) {
    if (this.nextGmPlayerService.hasRuntimePlayer(playerId)) {
      this.nextGmPlayerService.resetPlayer(playerId);
    } else {
      await this.nextGmPlayerService.resetPersistedPlayer(playerId);
    }
    return { ok: true };
  }

  @Post('players/:playerId/heaven-gate/reset')
  async resetHeavenGate(@Param('playerId') playerId: string) {
    await this.nextGmPlayerService.resetHeavenGate(playerId);
    return { ok: true };
  }

  @Post('bots/spawn')
  async spawnBots(@Body() body: SpawnBotsBody) {
    this.nextGmPlayerService.spawnBots(body?.anchorPlayerId ?? '', body?.count);
    return { ok: true };
  }

  @Post('bots/remove')
  async removeBots(@Body() body: RemoveBotsBody) {
    this.nextGmPlayerService.removeBots(body?.playerIds ?? [], body?.all ?? false);
    return { ok: true };
  }

  @Post('shortcuts/players/return-all-to-default-spawn')
  async returnAllPlayersToDefaultSpawn() {
    return this.nextGmPlayerService.returnAllPlayersToDefaultSpawn();
  }

  @Post('perf/network/reset')
  resetNetworkPerf() {
    this.nextGmWorldService.resetNetworkPerf();
    return { ok: true };
  }

  @Post('perf/cpu/reset')
  resetCpuPerf() {
    this.nextGmWorldService.resetCpuPerf();
    return { ok: true };
  }

  @Post('perf/pathfinding/reset')
  resetPathfindingPerf() {
    this.nextGmWorldService.resetPathfindingPerf();
    return { ok: true };
  }

  @Post('players/:playerId/mail')
  async createDirectMail(@Param('playerId') playerId: string, @Body() body: DirectMailBody) {
    const mailId = await this.nextGmMailService.createDirectMail(playerId, body ?? {});
    return { ok: true, mailId };
  }

  @Post('mail/broadcast')
  async createBroadcastMail(@Body() body: BroadcastMailBody) {
    const result = await this.nextGmMailService.createBroadcastMail(body ?? {});
    return { ok: true, mailId: result.mailId, batchId: result.batchId, recipientCount: result.recipientCount };
  }

  @Get('redeem-code-groups')
  getRedeemCodeGroups() {
    return this.redeemCodeRuntimeService.listGroups();
  }

  @Post('redeem-code-groups')
  async createRedeemCodeGroup(@Body() body: RedeemCodeGroupBody) {
    return this.redeemCodeRuntimeService.createGroup(body?.name ?? '', body?.rewards ?? [], Number(body?.count));
  }

  @Get('redeem-code-groups/:groupId')
  async getRedeemCodeGroup(@Param('groupId') groupId: string) {
    return this.redeemCodeRuntimeService.getGroupDetail(groupId);
  }

  @Put('redeem-code-groups/:groupId')
  async updateRedeemCodeGroup(@Param('groupId') groupId: string, @Body() body: RedeemCodeGroupBody) {
    return this.redeemCodeRuntimeService.updateGroup(groupId, body?.name ?? '', body?.rewards ?? []);
  }

  @Post('redeem-code-groups/:groupId/codes')
  async appendRedeemCodes(@Param('groupId') groupId: string, @Body() body: RedeemCodeGroupBody) {
    return this.redeemCodeRuntimeService.appendCodes(groupId, Number(body?.count));
  }

  @Delete('redeem-codes/:codeId')
  async destroyRedeemCode(@Param('codeId') codeId: string) {
    return this.redeemCodeRuntimeService.destroyCode(codeId);
  }

  @Get('suggestions')
  getSuggestions(@Query() query: SuggestionsQuery) {
    return this.nextGmWorldService.getSuggestions(query ?? {});
  }

  @Post('suggestions/:id/complete')
  async completeSuggestion(@Param('id') id: string) {
    return this.nextGmWorldService.completeSuggestion(id);
  }

  @Post('suggestions/:id/replies')
  async replySuggestion(@Param('id') id: string, @Body() body: SuggestionReplyBody) {
    return this.nextGmWorldService.replySuggestion(id, body ?? {});
  }

  @Delete('suggestions/:id')
  async removeSuggestion(@Param('id') id: string) {
    return this.nextGmWorldService.removeSuggestion(id);
  }

  @Put('maps/:mapId/tick')
  updateMapTick(@Param('mapId') mapId: string, @Body() body: MapConfigBody) {
    this.nextGmWorldService.updateMapTick(mapId, body ?? {});
    return { ok: true };
  }

  @Put('maps/:mapId/time')
  updateMapTime(@Param('mapId') mapId: string, @Body() body: MapConfigBody) {
    this.nextGmWorldService.updateMapTime(mapId, body ?? {});
    return { ok: true };
  }

  @Post('tick-config/reload')
  reloadTickConfig() {
    return this.nextGmWorldService.reloadTickConfig();
  }

  @Delete('world-observers/:viewerId')
  clearWorldObservation(@Param('viewerId') viewerId: string) {
    this.nextGmWorldService.clearWorldObservation(viewerId);
    return { ok: true };
  }
}

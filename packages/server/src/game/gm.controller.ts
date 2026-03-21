import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  GmRemoveBotsReq,
  GmSpawnBotsReq,
  GmStateRes,
  GmUpdatePlayerReq,
} from '@mud/shared';
import { GmAuthGuard } from './gm-auth.guard';
import { GmService } from './gm.service';

@Controller('gm')
@UseGuards(GmAuthGuard)
export class GmController {
  constructor(private readonly gmService: GmService) {}

  @Get('state')
  getState(): Promise<GmStateRes> {
    return this.gmService.getState();
  }

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

  @Post('players/:playerId/reset')
  async resetPlayer(@Param('playerId') playerId: string): Promise<{ ok: true }> {
    const error = await this.gmService.enqueueResetPlayer(playerId);
    if (error) {
      throw new BadRequestException(error);
    }
    return { ok: true };
  }

  @Post('bots/spawn')
  async spawnBots(@Body() body: GmSpawnBotsReq): Promise<{ ok: true }> {
    const error = await this.gmService.enqueueSpawnBots(body.anchorPlayerId, body.count);
    if (error) {
      throw new BadRequestException(error);
    }
    return { ok: true };
  }

  @Post('bots/remove')
  removeBots(@Body() body: GmRemoveBotsReq): { ok: true } {
    const error = this.gmService.enqueueRemoveBots(body?.playerIds, body?.all);
    if (error) {
      throw new BadRequestException(error);
    }
    return { ok: true };
  }
}

/**
 * NativeBotController：bot 蓝图签发与释放的 HTTP 路由。
 *
 * 设计参考：docs/design/systems/分身宠物机器人系统设计.md §6。
 *
 * 路由前缀：`/api/gm/bot/*`，全部受 NativeGmAuthGuard 保护（要求合法 GM token）。
 * Bot 登录链路本身另需 SERVER_BOT_LOGIN_ENABLED=1 显式开启，由 NativeBotService 内部判定。
 */

import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';

import { GmBotIssueBlueprintReq, GmBotIssueBlueprintRes, GmBotReleaseReq, GmBotReleaseRes } from '@mud/shared';

import { NativeGmAuthGuard } from './native-gm-auth.guard';
import { NativeBotService } from './native-bot.service';

@Controller('api/gm/bot')
@UseGuards(NativeGmAuthGuard)
export class NativeBotController {
  constructor(private readonly botService: NativeBotService) {}

  /** 签发一批 bot 登录 token；GM 控制台或 bot-runner 调用。 */
  @Post('issue-blueprint')
  @HttpCode(HttpStatus.OK)
  issueBlueprint(@Body() body: GmBotIssueBlueprintReq | undefined): GmBotIssueBlueprintRes {
    return this.botService.issueBlueprint(body);
  }

  /** 释放 bot：注销 ephemeral identity 与 persistence policy。 */
  @Post('release')
  @HttpCode(HttpStatus.OK)
  release(@Body() body: GmBotReleaseReq | undefined): GmBotReleaseRes {
    return this.botService.release(body);
  }
}

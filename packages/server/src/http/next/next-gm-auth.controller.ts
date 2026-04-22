import { Body, Controller, Inject, Post, Req, UseGuards } from '@nestjs/common';

import { RuntimeGmAuthService } from '../../runtime/gm/runtime-gm-auth.service';
import { NextAuthRateLimitService } from './next-auth-rate-limit.service';
import { GM_HTTP_CONTRACT } from './next-gm-contract';
import { NextGmAuthGuard } from './next-gm-auth.guard';
/**
 * GmLoginBody：定义接口结构约束，明确可交付字段含义。
 */


interface GmLoginBody {
/**
 * password：password相关字段。
 */

  password?: string;
}
/**
 * GmChangePasswordBody：定义接口结构约束，明确可交付字段含义。
 */


interface GmChangePasswordBody {
/**
 * currentPassword：currentPassword相关字段。
 */

  currentPassword?: string;  
  /**
 * newPassword：newPassword相关字段。
 */

  newPassword?: string;
}
/**
 * RequestLike：定义接口结构约束，明确可交付字段含义。
 */


interface RequestLike {
  [key: string]: unknown;
}
/**
 * RuntimeGmAuthServicePort：定义接口结构约束，明确可交付字段含义。
 */


interface RuntimeGmAuthServicePort {
  login(password: string): Promise<unknown>;
  changePassword(currentPassword: string, newPassword: string): Promise<unknown>;
}
/**
 * NextGmAuthController：封装该能力的入口与生命周期，承载运行时核心协作。
 */


@Controller(GM_HTTP_CONTRACT.authBasePath)
@Reflect.metadata('design:paramtypes', [RuntimeGmAuthService, NextAuthRateLimitService])
export class NextGmAuthController {
/**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param authService RuntimeGmAuthServicePort 参数说明。
 * @param rateLimitService NextAuthRateLimitService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

  constructor(
    @Inject(RuntimeGmAuthService) private readonly authService: RuntimeGmAuthServicePort,
    private readonly rateLimitService: NextAuthRateLimitService,
  ) {}  
  /**
 * login：执行login相关逻辑。
 * @param body GmLoginBody 参数说明。
 * @param request RequestLike 请求参数。
 * @returns 无返回值，直接更新login相关状态。
 */


  @Post('gm/login')
  async login(@Body() body: GmLoginBody, @Req() request: RequestLike) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.rateLimitService.assertAllowed('gmLogin', request, 'gm');
    try {
      const result = await this.authService.login(body?.password ?? '');
      this.rateLimitService.recordSuccess('gmLogin', request, 'gm');
      return result;
    } catch (error) {
      this.rateLimitService.recordFailure('gmLogin', request, 'gm');
      throw error;
    }
  }  
  /**
 * changePassword：执行changePassword相关逻辑。
 * @param body GmChangePasswordBody 参数说明。
 * @returns 无返回值，直接更新changePassword相关状态。
 */


  @Post('gm/password')
  @UseGuards(NextGmAuthGuard)
  async changePassword(@Body() body: GmChangePasswordBody) {
    await this.authService.changePassword(body?.currentPassword ?? '', body?.newPassword ?? '');
    return { ok: true };
  }
}

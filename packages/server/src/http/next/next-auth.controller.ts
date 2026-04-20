import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';

import { NextAuthRateLimitService } from './next-auth-rate-limit.service';
import { NextPlayerAuthService } from './next-player-auth.service';

interface AuthBody {
  accountName?: unknown;
  password?: unknown;
  displayName?: unknown;
  roleName?: unknown;
  loginName?: unknown;
  refreshToken?: unknown;
}

interface RequestLike {
  [key: string]: unknown;
}

/** Next 登录鉴权 HTTP 控制器：负责注册、登录、刷新和显示名可用性检查。 */
@Controller('api/auth')
export class NextAuthController {
  /** 注入 next 玩家鉴权服务，控制器只负责参数清洗与路由转发。 */
  constructor(
    private readonly authService: NextPlayerAuthService,
    /** 轻量限流入口，统一处理 register/login/refresh 失败窗口。 */
    private readonly rateLimitService: NextAuthRateLimitService,
  ) {}

  /** 处理注册请求，固定走 next accountName/displayName/roleName 合同。 */
  @Post('register')
  async register(@Body() body: AuthBody, @Req() request: RequestLike) {
    const accountName = pickString(body?.accountName);
    this.rateLimitService.assertAllowed('register', request, accountName);
    try {
      const result = await this.authService.register(
        accountName,
        pickString(body?.password),
        pickString(body?.displayName),
        pickString(body?.roleName),
      );
      this.rateLimitService.recordSuccess('register', request, accountName);
      return result;
    } catch (error) {
      this.rateLimitService.recordFailure('register', request, accountName);
      throw error;
    }
  }

  /** 处理登录请求，固定走 next loginName/password 合同。 */
  @Post('login')
  async login(@Body() body: AuthBody, @Req() request: RequestLike) {
    const loginName = pickString(body?.loginName);
    this.rateLimitService.assertAllowed('login', request, loginName);
    try {
      const result = await this.authService.login(loginName, pickString(body?.password));
      this.rateLimitService.recordSuccess('login', request, loginName);
      return result;
    } catch (error) {
      this.rateLimitService.recordFailure('login', request, loginName);
      throw error;
    }
  }

  /** 用刷新令牌换取新的访问令牌。 */
  @Post('refresh')
  async refresh(@Body() body: AuthBody, @Req() request: RequestLike) {
    const refreshToken = pickString(body?.refreshToken);
    this.rateLimitService.assertAllowed('refresh', request, refreshToken);
    try {
      const result = await this.authService.refresh(refreshToken);
      this.rateLimitService.recordSuccess('refresh', request, refreshToken);
      return result;
    } catch (error) {
      this.rateLimitService.recordFailure('refresh', request, refreshToken);
      throw error;
    }
  }

  /** 查询显示名是否可用，供前端即时校验。 */
  @Get('display-name/check')
  async checkDisplayName(@Query('displayName') displayName = '') {
    return this.authService.checkDisplayName(displayName);
  }
}

/** 仅接受字符串入参，避免把对象或数字直接传给服务层。 */
function pickString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

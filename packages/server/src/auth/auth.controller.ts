/**
 * 认证 HTTP 控制器 —— 处理注册、登录、令牌刷新、GM 登录等请求
 */
import { Controller, Post, Body, Get, Query, Headers, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  BasicOkRes,
  AuthRegisterReq,
  AuthLoginReq,
  AuthRefreshReq,
  AuthTokenRes,
  DisplayNameAvailabilityRes,
  GmChangePasswordReq,
  GmLoginReq,
  GmLoginRes,
} from '@mud/shared';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** 用户注册 */
  @Post('register')
  async register(@Body() body: AuthRegisterReq): Promise<AuthTokenRes> {
    return this.authService.register(body.accountName, body.password, body.displayName, body.roleName);
  }

  /** 用户登录 */
  @Post('login')
  async login(@Body() body: AuthLoginReq): Promise<AuthTokenRes> {
    return this.authService.login(body.loginName, body.password);
  }

  /** 刷新访问令牌 */
  @Post('refresh')
  async refresh(@Body() body: AuthRefreshReq): Promise<AuthTokenRes> {
    return this.authService.refresh(body.refreshToken);
  }

  /** 检查显示名称是否可用 */
  @Get('display-name/check')
  async checkDisplayName(@Query('displayName') displayName = ''): Promise<DisplayNameAvailabilityRes> {
    return this.authService.checkDisplayNameAvailability(displayName);
  }

  /** GM 登录 */
  @Post('gm/login')
  async loginGm(@Body() body: GmLoginReq): Promise<GmLoginRes> {
    return this.authService.loginGm(body.password);
  }

  /** 修改 GM 密码（需携带有效 GM 令牌） */
  @Post('gm/password')
  async changeGmPassword(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: GmChangePasswordReq,
  ): Promise<BasicOkRes> {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token || !this.authService.validateGmToken(token)) {
      throw new UnauthorizedException('GM 鉴权失败');
    }
    await this.authService.changeGmPassword(body.currentPassword, body.newPassword);
    return { ok: true };
  }
}

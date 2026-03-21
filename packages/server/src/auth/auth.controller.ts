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

  @Post('register')
  async register(@Body() body: AuthRegisterReq): Promise<AuthTokenRes> {
    return this.authService.register(body.username, body.password, body.displayName);
  }

  @Post('login')
  async login(@Body() body: AuthLoginReq): Promise<AuthTokenRes> {
    return this.authService.login(body.username, body.password);
  }

  @Post('refresh')
  async refresh(@Body() body: AuthRefreshReq): Promise<AuthTokenRes> {
    return this.authService.refresh(body.refreshToken);
  }

  @Get('display-name/check')
  async checkDisplayName(@Query('displayName') displayName = ''): Promise<DisplayNameAvailabilityRes> {
    return this.authService.checkDisplayNameAvailability(displayName);
  }

  @Post('gm/login')
  async loginGm(@Body() body: GmLoginReq): Promise<GmLoginRes> {
    return this.authService.loginGm(body.password);
  }

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

import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthRegisterReq, AuthLoginReq, AuthRefreshReq, AuthTokenRes, GmLoginReq, GmLoginRes } from '@mud/shared';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() body: AuthRegisterReq): Promise<AuthTokenRes> {
    return this.authService.register(body.username, body.password);
  }

  @Post('login')
  async login(@Body() body: AuthLoginReq): Promise<AuthTokenRes> {
    return this.authService.login(body.username, body.password);
  }

  @Post('refresh')
  async refresh(@Body() body: AuthRefreshReq): Promise<AuthTokenRes> {
    return this.authService.refresh(body.refreshToken);
  }

  @Post('gm/login')
  loginGm(@Body() body: GmLoginReq): GmLoginRes {
    return this.authService.loginGm(body.password);
  }
}

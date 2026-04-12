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
import { buildDefaultRoleName } from './account-validation';

/** LegacyAuthLoginReq：定义该类型的结构与数据语义。 */
type LegacyAuthLoginReq = {
  username?: string;
};

/** LegacyAuthRegisterReq：定义该类型的结构与数据语义。 */
type LegacyAuthRegisterReq = {
  username?: string;
};

/** pickString：执行对应的业务逻辑。 */
function pickString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

@Controller('auth')
/** AuthController：封装相关状态与行为。 */
export class AuthController {
/** 构造函数：执行实例初始化流程。 */
  constructor(private readonly authService: AuthService) {}

  /** 用户注册 */
  @Post('register')
  async register(@Body() body: AuthRegisterReq & LegacyAuthRegisterReq): Promise<AuthTokenRes> {
/** legacyUsername：定义该变量以承载业务值。 */
    const legacyUsername = pickString(body.username);
/** accountName：定义该变量以承载业务值。 */
    const accountName = pickString(body.accountName) || legacyUsername;
/** roleName：定义该变量以承载业务值。 */
    const roleName = pickString(body.roleName) || buildDefaultRoleName(legacyUsername);
    return this.authService.register(
      accountName,
      pickString(body.password),
      pickString(body.displayName),
      roleName,
    );
  }

  /** 用户登录 */
  @Post('login')
  async login(@Body() body: AuthLoginReq & LegacyAuthLoginReq): Promise<AuthTokenRes> {
    return this.authService.login(
      pickString(body.loginName) || pickString(body.username),
      pickString(body.password),
    );
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
/** token：定义该变量以承载业务值。 */
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token || !this.authService.validateGmToken(token)) {
      throw new UnauthorizedException('GM 鉴权失败');
    }
    await this.authService.changeGmPassword(body.currentPassword, body.newPassword);
    return { ok: true };
  }
}


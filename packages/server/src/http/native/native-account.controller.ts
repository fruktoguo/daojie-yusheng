/**
 * 玩家账号管理 HTTP 控制器。
 * 提供已登录玩家修改密码、显示名和角色名的端点，
 * 所有操作需要有效的 Bearer access token。
 */
import { Body, Controller, Headers, Post } from '@nestjs/common';

import { NativePlayerAuthService } from './native-player-auth.service';

/** 修改密码请求体。 */
interface PasswordBody {
  currentPassword?: unknown;
  newPassword?: unknown;
}

/** 修改显示名请求体。 */
interface DisplayNameBody {
  displayName?: unknown;
}

/** 修改角色名请求体。 */
interface RoleNameBody {
  roleName?: unknown;
}

/** 已登录玩家账号自助管理控制器：密码、显示名、角色名修改。 */
@Controller('api/account')
export class NativeAccountController {
  constructor(private readonly authService: NativePlayerAuthService) {}

  /** 修改当前账号密码，需提供旧密码验证。 */
  @Post('password')
  async updatePassword(@Headers('authorization') authorization: string, @Body() body: PasswordBody) {
    return this.authService.updatePassword(
      extractBearerToken(authorization),
      pickString(body?.currentPassword),
      pickString(body?.newPassword),
    );
  }

  /** 修改当前账号显示名。 */
  @Post('display-name')
  async updateDisplayName(@Headers('authorization') authorization: string, @Body() body: DisplayNameBody) {
    return this.authService.updateDisplayName(extractBearerToken(authorization), pickString(body?.displayName));
  }

  /** 修改当前账号角色名。 */
  @Post('role-name')
  async updateRoleName(@Headers('authorization') authorization: string, @Body() body: RoleNameBody) {
    return this.authService.updateRoleName(extractBearerToken(authorization), pickString(body?.roleName));
  }
}

/** 仅接受字符串入参，避免把对象或数字直接传给服务层。 */
function pickString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

/** 从 Authorization 头提取 Bearer token。 */
function extractBearerToken(authorization: string) {
  const normalizedAuthorization = typeof authorization === 'string' ? authorization.trim() : '';
  return normalizedAuthorization.startsWith('Bearer ')
    ? normalizedAuthorization.slice('Bearer '.length).trim()
    : '';
}

/**
 * 账号管理 HTTP 接口：修改密码、显示名称、角色名
 */
import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import {
  AccountUpdateDisplayNameReq,
  AccountUpdateDisplayNameRes,
  AccountUpdatePasswordReq,
  AccountUpdateRoleNameReq,
  AccountUpdateRoleNameRes,
  BasicOkRes,
} from '@mud/shared';
import { AuthService } from '../auth/auth.service';
import { AccountService } from './account.service';

@Controller('account')
export class AccountController {
  constructor(
    private readonly authService: AuthService,
    private readonly accountService: AccountService,
  ) {}

  /** 修改密码 */
  @Post('password')
  async updatePassword(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: AccountUpdatePasswordReq,
  ): Promise<BasicOkRes> {
    return this.accountService.updatePassword(this.requireUserId(authorization), body.currentPassword, body.newPassword);
  }

  /** 修改显示名称 */
  @Post('display-name')
  async updateDisplayName(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: AccountUpdateDisplayNameReq,
  ): Promise<AccountUpdateDisplayNameRes> {
    return this.accountService.updateDisplayName(this.requireUserId(authorization), body.displayName);
  }

  /** 修改角色名 */
  @Post('role-name')
  async updateRoleName(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: AccountUpdateRoleNameReq,
  ): Promise<AccountUpdateRoleNameRes> {
    return this.accountService.updateRoleName(this.requireUserId(authorization), body.roleName);
  }

  /** 从 Authorization header 提取并校验用户 ID */
  private requireUserId(authorization: string | undefined): string {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : '';
    if (!token) {
      throw new UnauthorizedException('未登录');
    }
    const payload = this.authService.validateToken(token);
    if (!payload) {
      throw new UnauthorizedException('登录已失效');
    }
    return payload.userId;
  }
}


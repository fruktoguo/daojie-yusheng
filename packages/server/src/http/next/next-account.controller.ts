import { Body, Controller, Headers, Post } from '@nestjs/common';

import { NextPlayerAuthService } from './next-player-auth.service';
/**
 * PasswordBody：定义接口结构约束，明确可交付字段含义。
 */


interface PasswordBody {
/**
 * currentPassword：PasswordBody 内部字段。
 */

  currentPassword?: unknown;  
  /**
 * newPassword：PasswordBody 内部字段。
 */

  newPassword?: unknown;
}
/**
 * DisplayNameBody：定义接口结构约束，明确可交付字段含义。
 */


interface DisplayNameBody {
/**
 * displayName：DisplayNameBody 内部字段。
 */

  displayName?: unknown;
}
/**
 * RoleNameBody：定义接口结构约束，明确可交付字段含义。
 */


interface RoleNameBody {
/**
 * roleName：RoleNameBody 内部字段。
 */

  roleName?: unknown;
}
/**
 * NextAccountController：封装该能力的入口与生命周期，承载运行时核心协作。
 */


@Controller('api/account')
export class NextAccountController {
/**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param authService NextPlayerAuthService 参数说明。
 * @returns 无返回值（构造函数）。
 */

  constructor(private readonly authService: NextPlayerAuthService) {}  
  /**
 * updatePassword：更新/写入相关状态。
 * @param authorization string 参数说明。
 * @param body PasswordBody 参数说明。
 * @returns 函数返回值。
 */


  @Post('password')
  async updatePassword(@Headers('authorization') authorization: string, @Body() body: PasswordBody) {
    return this.authService.updatePassword(
      extractBearerToken(authorization),
      pickString(body?.currentPassword),
      pickString(body?.newPassword),
    );
  }  
  /**
 * updateDisplayName：更新/写入相关状态。
 * @param authorization string 参数说明。
 * @param body DisplayNameBody 参数说明。
 * @returns 函数返回值。
 */


  @Post('display-name')
  async updateDisplayName(@Headers('authorization') authorization: string, @Body() body: DisplayNameBody) {
    return this.authService.updateDisplayName(extractBearerToken(authorization), pickString(body?.displayName));
  }  
  /**
 * updateRoleName：更新/写入相关状态。
 * @param authorization string 参数说明。
 * @param body RoleNameBody 参数说明。
 * @returns 函数返回值。
 */


  @Post('role-name')
  async updateRoleName(@Headers('authorization') authorization: string, @Body() body: RoleNameBody) {
    return this.authService.updateRoleName(extractBearerToken(authorization), pickString(body?.roleName));
  }
}
/**
 * pickString：执行核心业务逻辑。
 * @param value unknown 参数说明。
 * @returns 函数返回值。
 */


function pickString(value: unknown) {
  return typeof value === 'string' ? value : '';
}
/**
 * extractBearerToken：执行核心业务逻辑。
 * @param authorization string 参数说明。
 * @returns 函数返回值。
 */


function extractBearerToken(authorization: string) {
  const normalizedAuthorization = typeof authorization === 'string' ? authorization.trim() : '';
  return normalizedAuthorization.startsWith('Bearer ')
    ? normalizedAuthorization.slice('Bearer '.length).trim()
    : '';
}

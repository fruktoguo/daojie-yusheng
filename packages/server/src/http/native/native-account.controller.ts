import { Body, Controller, Headers, Post } from '@nestjs/common';

import { NativePlayerAuthService } from './native-player-auth.service';
/**
 * PasswordBody：定义接口结构约束，明确可交付字段含义。
 */


interface PasswordBody {
/**
 * currentPassword：currentPassword相关字段。
 */

  currentPassword?: unknown;  
  /**
 * newPassword：newPassword相关字段。
 */

  newPassword?: unknown;
}
/**
 * DisplayNameBody：定义接口结构约束，明确可交付字段含义。
 */


interface DisplayNameBody {
/**
 * displayName：显示名称名称或显示文本。
 */

  displayName?: unknown;
}
/**
 * RoleNameBody：定义接口结构约束，明确可交付字段含义。
 */


interface RoleNameBody {
/**
 * roleName：role名称名称或显示文本。
 */

  roleName?: unknown;
}
/**
 * NativeAccountController：封装该能力的入口与生命周期，承载运行时核心协作。
 */


@Controller('api/account')
export class NativeAccountController {
/**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param authService NativePlayerAuthService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

  constructor(private readonly authService: NativePlayerAuthService) {}  
  /**
 * updatePassword：处理Password并更新相关状态。
 * @param authorization string 参数说明。
 * @param body PasswordBody 参数说明。
 * @returns 无返回值，直接更新Password相关状态。
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
 * updateDisplayName：判断显示名称是否满足条件。
 * @param authorization string 参数说明。
 * @param body DisplayNameBody 参数说明。
 * @returns 无返回值，直接更新显示名称相关状态。
 */


  @Post('display-name')
  async updateDisplayName(@Headers('authorization') authorization: string, @Body() body: DisplayNameBody) {
    return this.authService.updateDisplayName(extractBearerToken(authorization), pickString(body?.displayName));
  }  
  /**
 * updateRoleName：处理Role名称并更新相关状态。
 * @param authorization string 参数说明。
 * @param body RoleNameBody 参数说明。
 * @returns 无返回值，直接更新Role名称相关状态。
 */


  @Post('role-name')
  async updateRoleName(@Headers('authorization') authorization: string, @Body() body: RoleNameBody) {
    return this.authService.updateRoleName(extractBearerToken(authorization), pickString(body?.roleName));
  }
}
/**
 * pickString：执行pickString相关逻辑。
 * @param value unknown 参数说明。
 * @returns 无返回值，直接更新pickString相关状态。
 */


function pickString(value: unknown) {
  return typeof value === 'string' ? value : '';
}
/**
 * extractBearerToken：执行extractBearerToken相关逻辑。
 * @param authorization string 参数说明。
 * @returns 无返回值，直接更新extractBearerToken相关状态。
 */


function extractBearerToken(authorization: string) {
  const normalizedAuthorization = typeof authorization === 'string' ? authorization.trim() : '';
  return normalizedAuthorization.startsWith('Bearer ')
    ? normalizedAuthorization.slice('Bearer '.length).trim()
    : '';
}

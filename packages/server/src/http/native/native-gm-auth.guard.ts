import { Injectable, UnauthorizedException, CanActivate, ExecutionContext, Inject } from '@nestjs/common';
import { RuntimeGmAuthService } from '../../runtime/gm/runtime-gm-auth.service';
/**
 * RuntimeGmAuthServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface RuntimeGmAuthServiceLike {
  validateAccessToken(token: string): boolean;
}

/** Next GM HTTP 鉴权守卫：从 Authorization 头提取 Bearer token 并交给 runtime 校验。 */
@Injectable()
export class NativeGmAuthGuard implements CanActivate {
/**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param authService RuntimeGmAuthServiceLike 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

  constructor(@Inject(RuntimeGmAuthService) private readonly authService: RuntimeGmAuthServiceLike) {}

  /** 拦截 HTTP 请求，未通过 GM 鉴权时直接拒绝。 */
  canActivate(context: ExecutionContext): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const request = context.switchToHttp().getRequest();
    const authorization = request?.headers?.authorization;
    const token = typeof authorization === 'string' && authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!this.authService.validateAccessToken(token)) throw new UnauthorizedException('GM 鉴权失败');
    return true;
  }
}

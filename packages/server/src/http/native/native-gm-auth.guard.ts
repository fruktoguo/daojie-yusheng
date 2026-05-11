/**
 * GM HTTP 鉴权守卫。
 * 从请求 Authorization 头提取 Bearer token，交由 RuntimeGmAuthService 校验，
 * 未通过时直接返回 401。
 */
import { Injectable, UnauthorizedException, CanActivate, ExecutionContext, Inject } from '@nestjs/common';
import { RuntimeGmAuthService } from '../../runtime/gm/runtime-gm-auth.service';

interface RuntimeGmAuthServiceLike {
  validateAccessToken(token: string): boolean;
}

/** GM 鉴权守卫：拦截所有 GM 路由，校验 Bearer token 有效性。 */
@Injectable()
export class NativeGmAuthGuard implements CanActivate {
  constructor(@Inject(RuntimeGmAuthService) private readonly authService: RuntimeGmAuthServiceLike) {}

  /** 从 Authorization 头提取 token 并校验，失败时抛出 401。 */
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authorization = request?.headers?.authorization;
    const token = typeof authorization === 'string' && authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!this.authService.validateAccessToken(token)) throw new UnauthorizedException('GM 鉴权失败');
    return true;
  }
}

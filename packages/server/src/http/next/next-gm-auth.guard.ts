import { Injectable, UnauthorizedException, CanActivate, ExecutionContext, Inject } from '@nestjs/common';
import { RuntimeGmAuthService } from '../../runtime/gm/runtime-gm-auth.service';

interface RuntimeGmAuthServiceLike {
  validateAccessToken(token: string): boolean;
}

/** Next GM HTTP 鉴权守卫：从 Authorization 头提取 Bearer token 并交给 runtime 校验。 */
@Injectable()
export class NextGmAuthGuard implements CanActivate {
  constructor(@Inject(RuntimeGmAuthService) private readonly authService: RuntimeGmAuthServiceLike) {}

  /** 拦截 HTTP 请求，未通过 GM 鉴权时直接拒绝。 */
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authorization = request?.headers?.authorization;
    const token = typeof authorization === 'string' && authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!this.authService.validateAccessToken(token)) throw new UnauthorizedException('GM 鉴权失败');
    return true;
  }
}

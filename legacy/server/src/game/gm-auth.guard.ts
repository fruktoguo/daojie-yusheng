/**
 * GM 接口鉴权守卫：校验 Bearer Token 是否为合法 GM 令牌
 */
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';

@Injectable()
/** GmAuthGuard：封装相关状态与行为。 */
export class GmAuthGuard implements CanActivate {
/** 构造函数：执行实例初始化流程。 */
  constructor(private readonly authService: AuthService) {}

/** canActivate：执行对应的业务逻辑。 */
  canActivate(context: ExecutionContext): boolean {
/** request：定义该变量以承载业务值。 */
    const request = context.switchToHttp().getRequest<{ headers?: Record<string, string | undefined> }>();
/** authorization：定义该变量以承载业务值。 */
    const authorization = request.headers?.authorization;
/** token：定义该变量以承载业务值。 */
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token || !this.authService.validateGmToken(token)) {
      throw new UnauthorizedException('GM 鉴权失败');
    }
    return true;
  }
}


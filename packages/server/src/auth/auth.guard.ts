/**
 * WebSocket 认证守卫 —— 从握手 token 中验证玩家身份
 */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';

/** 从 Socket 握手中提取并校验 JWT，通过后将用户信息挂载到 client.data */
@Injectable()
/** AuthGuard：封装相关状态与行为。 */
export class AuthGuard implements CanActivate {
/** 构造函数：执行实例初始化流程。 */
  constructor(private readonly authService: AuthService) {}

/** canActivate：执行对应的业务逻辑。 */
  canActivate(context: ExecutionContext): boolean {
/** client：定义该变量以承载业务值。 */
    const client = context.switchToWs().getClient();
/** token：定义该变量以承载业务值。 */
    const token = client.handshake?.auth?.token;
    if (!token) return false;
/** payload：定义该变量以承载业务值。 */
    const payload = this.authService.validateToken(token);
    if (!payload) return false;
    client.data = payload;
    return true;
  }
}


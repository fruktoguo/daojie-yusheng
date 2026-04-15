/**
 * WebSocket 认证守卫 —— 从握手 token 中验证玩家身份
 */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';

/** 从 Socket 握手中提取并校验 JWT，通过后将用户信息挂载到 client.data */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const client = context.switchToWs().getClient();
    const token = client.handshake?.auth?.token;
    if (!token) return false;
    const payload = this.authService.validateToken(token);
    if (!payload) return false;
    client.data = payload;
    return true;
  }
}


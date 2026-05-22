/**
 * 本文件属于服务端 HTTP 或 GM 辅助入口，负责把运维能力接入内部服务。
 *
 * 维护时要注意鉴权、审计和后台任务边界，避免把管理操作暴露成无保护公开接口。
 */
/**
 * GM HTTP 鉴权守卫。
 * 从请求 Authorization 头提取 Bearer token，交由 RuntimeGmAuthService 校验，
 * 未通过时直接返回 401。
 *
 * N45：通过校验后，把 actor 上下文挂到 `request.gmActor`，供下游 controller / service
 * 落 gm_audit_log 使用；不通过时不挂 actor，UnauthorizedException 直接拒绝。
 */
import { Injectable, UnauthorizedException, CanActivate, ExecutionContext, Inject } from '@nestjs/common';
import { RuntimeGmAuthService, type GmAuthValidationResult } from '../../runtime/gm/runtime-gm-auth.service';
import { attachGmActor } from './native-gm-actor-context';

interface RuntimeGmAuthServicePort {
  validateAndExtractAccessToken(token: unknown): GmAuthValidationResult;
}

/** GM 鉴权守卫：拦截所有 GM 路由，校验 Bearer token 有效性，并把 actor 上下文挂到 request。 */
@Injectable()
export class NativeGmAuthGuard implements CanActivate {
  constructor(@Inject(RuntimeGmAuthService) private readonly authService: RuntimeGmAuthServicePort) {}

  /** 从 Authorization 头提取 token 并校验，失败时抛出 401；成功时挂 actor。 */
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authorization = request?.headers?.authorization;
    const token = typeof authorization === 'string' && authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    const validation = this.authService.validateAndExtractAccessToken(token);
    if (!validation.ok) {
      throw new UnauthorizedException('GM 鉴权失败');
    }
    attachGmActor(request, validation);
    return true;
  }
}

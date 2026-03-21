import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class GmAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers?: Record<string, string | undefined> }>();
    const authorization = request.headers?.authorization;
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token || !this.authService.validateGmToken(token)) {
      throw new UnauthorizedException('GM 鉴权失败');
    }
    return true;
  }
}

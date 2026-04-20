import { Body, Controller, Inject, Post, Req, UseGuards } from '@nestjs/common';

import { RuntimeGmAuthService } from '../../runtime/gm/runtime-gm-auth.service';
import { NextAuthRateLimitService } from './next-auth-rate-limit.service';
import { NEXT_GM_HTTP_CONTRACT } from './next-gm-contract';
import { NextGmAuthGuard } from './next-gm-auth.guard';

interface GmLoginBody {
  password?: string;
}

interface GmChangePasswordBody {
  currentPassword?: string;
  newPassword?: string;
}

interface RequestLike {
  [key: string]: unknown;
}

interface RuntimeGmAuthServicePort {
  login(password: string): Promise<unknown>;
  changePassword(currentPassword: string, newPassword: string): Promise<unknown>;
}

@Controller(NEXT_GM_HTTP_CONTRACT.authBasePath)
@Reflect.metadata('design:paramtypes', [RuntimeGmAuthService, NextAuthRateLimitService])
export class NextGmAuthController {
  constructor(
    @Inject(RuntimeGmAuthService) private readonly authService: RuntimeGmAuthServicePort,
    private readonly rateLimitService: NextAuthRateLimitService,
  ) {}

  @Post('gm/login')
  async login(@Body() body: GmLoginBody, @Req() request: RequestLike) {
    this.rateLimitService.assertAllowed('gmLogin', request, 'gm');
    try {
      const result = await this.authService.login(body?.password ?? '');
      this.rateLimitService.recordSuccess('gmLogin', request, 'gm');
      return result;
    } catch (error) {
      this.rateLimitService.recordFailure('gmLogin', request, 'gm');
      throw error;
    }
  }

  @Post('gm/password')
  @UseGuards(NextGmAuthGuard)
  async changePassword(@Body() body: GmChangePasswordBody) {
    await this.authService.changePassword(body?.currentPassword ?? '', body?.newPassword ?? '');
    return { ok: true };
  }
}

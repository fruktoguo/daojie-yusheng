/**
 * 本文件属于服务端 HTTP 或 GM 辅助入口，负责把运维能力接入内部服务。
 *
 * 维护时要注意鉴权、审计和后台任务边界，避免把管理操作暴露成无保护公开接口。
 */
/**
 * GM 鉴权 HTTP 控制器。
 * 提供 GM 登录和修改 GM 密码两个端点，登录端点受限流保护，
 * 修改密码端点需要已有的 GM access token。
 */
import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Query, Req, UseGuards } from '@nestjs/common';

import { RuntimeGmAuthService } from '../../runtime/gm/runtime-gm-auth.service';
import { NativeAuthRateLimitService } from './native-auth-rate-limit.service';
import { GM_HTTP_CONTRACT } from './native-gm-contract';
import { NativeGmAuthGuard } from './native-gm-auth.guard';
import { NativePlayerAuthService, type RegistrationActivationCodeIssueView } from './native-player-auth.service';

/** GM 登录请求体。 */
interface GmLoginBody {
  password?: string;
}

/** GM 修改密码请求体。 */
interface GmChangePasswordBody {
  currentPassword?: string;
  newPassword?: string;
}

interface GmRegistrationActivationCodeBody {
  password?: string;
  text?: string;
  sourceText?: string;
  /** 兼容旧版 QQ 专用参数；新接入应使用 text。 */
  qq?: string;
}

interface RequestLike {
  [key: string]: unknown;
}

/** GM 鉴权服务端口：登录和修改密码。 */
interface RuntimeGmAuthServicePort {
  login(password: string): Promise<unknown>;
  changePassword(currentPassword: string, newPassword: string): Promise<unknown>;
}

interface NativePlayerAuthServicePort {
  getRegistrationActivationCode(sourceText: string): Promise<RegistrationActivationCodeIssueView>;
}

/** GM 鉴权控制器：提供 GM 登录和密码修改端点。 */
@Controller(GM_HTTP_CONTRACT.authBasePath)
export class NativeGmAuthController {
  constructor(
    @Inject(RuntimeGmAuthService) private readonly authService: RuntimeGmAuthServicePort,
    @Inject(NativePlayerAuthService) private readonly playerAuthService: NativePlayerAuthServicePort,
    private readonly rateLimitService: NativeAuthRateLimitService,
  ) {}

  /** GM 登录，受限流保护；成功返回 access token。 */
  @Post('gm/login')
  @HttpCode(HttpStatus.OK)
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

  /** 修改 GM 密码，需已有有效 GM token。 */
  @Post('gm/password')
  @UseGuards(NativeGmAuthGuard)
  async changePassword(@Body() body: GmChangePasswordBody) {
    await this.authService.changePassword(body?.currentPassword ?? '', body?.newPassword ?? '');
    return { ok: true };
  }

  /** 通过 GM 密码按任意文本获取固定注册激活码；同一文本重复获取返回同一个码。 */
  @Post('gm/registration-activation-code')
  @HttpCode(HttpStatus.OK)
  async issueRegistrationActivationCode(@Body() body: GmRegistrationActivationCodeBody, @Req() request: RequestLike) {
    return this.getRegistrationActivationCodeWithPassword(body?.password ?? '', pickActivationSourceText(body), request);
  }

  /** 兼容只会拼 URL 的调用方；生产集成优先使用 POST，避免密码落入访问日志。 */
  @Get('gm/registration-activation-code')
  async issueRegistrationActivationCodeByQuery(
    @Query('password') password = '',
    @Query('text') text = '',
    @Query('qq') qq = '',
    @Req() request: RequestLike,
  ) {
    return this.getRegistrationActivationCodeWithPassword(password, text || qq, request);
  }

  private async getRegistrationActivationCodeWithPassword(password: string, sourceText: string, request: RequestLike) {
    const subject = `registration-activation:${sourceText}`;
    this.rateLimitService.assertAllowed('gmLogin', request, subject);
    try {
      await this.authService.login(password);
      const result = await this.playerAuthService.getRegistrationActivationCode(sourceText);
      this.rateLimitService.recordSuccess('gmLogin', request, subject);
      return { ok: true, ...result };
    } catch (error) {
      this.rateLimitService.recordFailure('gmLogin', request, subject);
      throw error;
    }
  }
}

function pickActivationSourceText(body: GmRegistrationActivationCodeBody | null | undefined): string {
  return body?.text ?? body?.sourceText ?? body?.qq ?? '';
}

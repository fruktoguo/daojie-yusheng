/**
 * 本文件属于服务端 HTTP 或 GM 辅助入口，负责把运维能力接入内部服务。
 *
 * 维护时要注意鉴权、审计和后台任务边界，避免把管理操作暴露成无保护公开接口。
 */
/**
 * GM 环境变量管理控制器。
 * 提供环境变量列表、运行时覆盖、持久化写入与重载接口。
 */
import { Body, Controller, Delete, Get, Inject, Param, Post, Req, UseGuards, BadRequestException } from '@nestjs/common';

import type {
  GmEnvironmentVarListRes,
  GmReloadEnvironmentVarsRes,
  GmSetEnvironmentVarReq,
} from '@mud/shared';
import { GM_HTTP_CONTRACT } from './native-gm-contract';
import { NativeGmAuthGuard } from './native-gm-auth.guard';
import { extractGmActor } from './native-gm-actor-context';
import { GmAuditLogPersistenceService } from '../../persistence/gm-audit-log-persistence.service';
import { RuntimeEnvManagementService } from '../../runtime/gm/runtime-env-management.service';

@Controller(GM_HTTP_CONTRACT.gmBasePath)
@UseGuards(NativeGmAuthGuard)
export class NativeGmEnvironmentController {
  constructor(
    private readonly runtimeEnvManagementService: RuntimeEnvManagementService,
    @Inject(GmAuditLogPersistenceService)
    private readonly gmAuditLogPersistenceService: GmAuditLogPersistenceService | null = null,
  ) {}

  @Get('environment/vars')
  async list(@Req() request: unknown): Promise<GmEnvironmentVarListRes> {
    const actor = extractGmActor(request);
    const res = this.runtimeEnvManagementService.list();
    await this.recordAudit('gm.environment.list', actor, null, undefined, { count: res.items.length }, true, null);
    return res;
  }

  @Post('environment/vars/:key')
  async set(
    @Param('key') key: string,
    @Body() body: GmSetEnvironmentVarReq,
    @Req() request: unknown,
  ) {
    if (!body || typeof body.value !== 'string') {
      throw new BadRequestException('value is required');
    }
    const actor = extractGmActor(request);
    const item = this.runtimeEnvManagementService.set(key, body.value, body.persist === true);
    await this.recordAudit(
      'gm.environment.set',
      actor,
      key,
      undefined,
      { value: item.value, source: item.source, persistent: item.persistent, persist: body.persist === true },
      true,
      null,
    );
    return { ok: true, item };
  }

  @Delete('environment/vars/:key')
  async remove(@Param('key') key: string, @Req() request: unknown) {
    const actor = extractGmActor(request);
    const item = this.runtimeEnvManagementService.delete(key);
    await this.recordAudit('gm.environment.delete', actor, key, undefined, { source: item.source }, true, null);
    return { ok: true, item };
  }

  @Post('environment/reload')
  async reload(@Req() request: unknown): Promise<GmReloadEnvironmentVarsRes> {
    const actor = extractGmActor(request);
    const res = this.runtimeEnvManagementService.reload();
    await this.recordAudit('gm.environment.reload', actor, null, undefined, { count: res.count }, true, null);
    return res;
  }

  private async recordAudit(
    op: string,
    actor: { tokenRev: string | null; ip: string | null; userAgent: string | null; receivedAt: number },
    targetId: string | null,
    before: unknown,
    after: unknown,
    success: boolean,
    errorMessage: string | null,
  ): Promise<void> {
    if (!this.gmAuditLogPersistenceService) return;
    try {
      await this.gmAuditLogPersistenceService.recordEntry({
        op,
        targetType: 'environment',
        targetId,
        actor,
        before,
        after,
        success,
        errorMessage,
      });
    } catch {
      // 审计失败不阻断 GM 操作。
    }
  }
}

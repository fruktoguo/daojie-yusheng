/**
 * GM 密钥管理 HTTP 控制器。
 * 提供密钥的 CRUD 端点，所有操作需要 GM 鉴权。
 * 密钥以 AES-256-GCM 加密存储在 PostgreSQL 中。
 *
 * N51 安全收口：
 *  - list 不再返回 maskedValue，只回 metadata + valueLength（详见 service 层注释）；
 *  - 每次 get / set / delete / list 必落 gm_audit_log，便于运营追溯密钥访问；
 *  - 高风险操作（dual-control / IP 白名单 / WebAuthn）留独立改造批次接入。
 */
import { Body, Controller, Delete, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { GM_HTTP_CONTRACT } from './native-gm-contract';
import { NativeGmAuthGuard } from './native-gm-auth.guard';
import { NativeGmSecretStoreService } from './native-gm-secret-store.service';
import { extractGmActor } from './native-gm-actor-context';
import { GmAuditLogPersistenceService } from '../../persistence/gm-audit-log-persistence.service';

interface SetSecretBody {
  key?: string;
  value?: string;
  description?: string;
}

@Controller(GM_HTTP_CONTRACT.gmBasePath)
@UseGuards(NativeGmAuthGuard)
export class NativeGmSecretController {
  constructor(
    private readonly secretStore: NativeGmSecretStoreService,
    @Inject(GmAuditLogPersistenceService)
    private readonly gmAuditLogPersistenceService: GmAuditLogPersistenceService | null = null,
  ) {}

  @Get('secrets')
  async list(@Req() request: unknown) {
    const actor = extractGmActor(request);
    let success = false;
    let errorMessage: string | null = null;
    try {
      const items = await this.secretStore.list();
      success = true;
      // N51：list 是高频运营路径，不记录每条 key（防 audit_log 行数爆炸），只记总数。
      await this.recordSecretAudit({
        op: 'gm.secret.list',
        actor,
        targetId: null,
        before: undefined,
        after: { count: items.length },
        success,
        errorMessage,
      });
      return items;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      await this.recordSecretAudit({
        op: 'gm.secret.list',
        actor,
        targetId: null,
        before: undefined,
        after: undefined,
        success: false,
        errorMessage,
      });
      throw error;
    }
  }

  @Get('secrets/:key')
  async getOne(@Param('key') key: string, @Req() request: unknown) {
    const actor = extractGmActor(request);
    try {
      const record = await this.secretStore.get(key);
      // N51：get 是单密钥访问路径，每次必落 audit；记录 found 状态但不记录 value。
      await this.recordSecretAudit({
        op: 'gm.secret.get',
        actor,
        targetId: key,
        before: undefined,
        after: { found: Boolean(record) },
        success: true,
        errorMessage: null,
      });
      if (!record) return { found: false };
      return { found: true, ...record };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.recordSecretAudit({
        op: 'gm.secret.get',
        actor,
        targetId: key,
        before: undefined,
        after: undefined,
        success: false,
        errorMessage,
      });
      throw error;
    }
  }

  @Post('secrets')
  async set(@Body() body: SetSecretBody, @Req() request: unknown) {
    const actor = extractGmActor(request);
    const targetKey = body?.key ?? '';
    try {
      await this.secretStore.set(targetKey, body?.value ?? '', body?.description ?? '');
      // N51：set 落 audit；不记录 value 明文，仅记录 description 与 valueLength 指标。
      await this.recordSecretAudit({
        op: 'gm.secret.set',
        actor,
        targetId: targetKey,
        before: undefined,
        after: {
          description: body?.description ?? '',
          valueLength: typeof body?.value === 'string' ? body.value.length : 0,
        },
        success: true,
        errorMessage: null,
      });
      return { ok: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.recordSecretAudit({
        op: 'gm.secret.set',
        actor,
        targetId: targetKey,
        before: undefined,
        after: undefined,
        success: false,
        errorMessage,
      });
      throw error;
    }
  }

  @Delete('secrets/:key')
  async remove(@Param('key') key: string, @Req() request: unknown) {
    const actor = extractGmActor(request);
    try {
      const deleted = await this.secretStore.delete(key);
      await this.recordSecretAudit({
        op: 'gm.secret.delete',
        actor,
        targetId: key,
        before: undefined,
        after: { deleted },
        success: true,
        errorMessage: null,
      });
      return { ok: true, deleted };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.recordSecretAudit({
        op: 'gm.secret.delete',
        actor,
        targetId: key,
        before: undefined,
        after: undefined,
        success: false,
        errorMessage,
      });
      throw error;
    }
  }

  /** 落 GM 审计；service 不可用时仅打 warn 不抛。 */
  private async recordSecretAudit(input: {
    op: string;
    actor: { tokenRev: string | null; ip: string | null; userAgent: string | null; receivedAt: number };
    targetId: string | null;
    before: unknown;
    after: unknown;
    success: boolean;
    errorMessage: string | null;
  }): Promise<void> {
    if (!this.gmAuditLogPersistenceService) {
      return;
    }
    try {
      await this.gmAuditLogPersistenceService.recordEntry({
        op: input.op,
        targetType: 'secret',
        targetId: input.targetId,
        actor: input.actor,
        before: input.before,
        after: input.after,
        success: input.success,
        errorMessage: input.errorMessage,
      });
    } catch {
      // service 内部已 catch 并打日志；额外保护一层避免 audit 异常冒泡破坏 secret 操作流程。
    }
  }
}

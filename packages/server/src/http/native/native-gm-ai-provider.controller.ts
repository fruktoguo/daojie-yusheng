/**
 * GM AI provider 配置控制器。
 * API Key 只写入 GM 加密密钥表，AI 配置表只保存 secretKeyRef。
 */
import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';

import type {
  GmAiProviderConfigDeleteRes,
  GmAiProviderConfigListRes,
  GmAiProviderConfigSetReq,
  GmAiProviderConfigSetRes,
  GmAiProviderKind,
  GmAiImageProvider,
  GmAiTextProvider,
} from '@mud/shared';
import { AiProviderConfigService, type AiProviderConfigView } from '../../ai/ai-provider-config.service';
import { AiProviderConfigPersistenceService } from '../../ai/ai-provider-config-persistence.service';
import { NativeGmSecretStoreService } from './native-gm-secret-store.service';
import { GM_HTTP_CONTRACT } from './native-gm-contract';
import { NativeGmAuthGuard } from './native-gm-auth.guard';
import { extractGmActor } from './native-gm-actor-context';
import { GmAuditLogPersistenceService } from '../../persistence/gm-audit-log-persistence.service';

const TEXT_PROVIDERS = new Set<GmAiTextProvider>(['openai', 'openai-compatible', 'anthropic']);
const IMAGE_PROVIDERS = new Set<GmAiImageProvider>(['openai', 'dashscope']);
const DEFAULT_TIMEOUT_MS_BY_KIND: Record<GmAiProviderKind, number> = {
  text: 30_000,
  image: 60_000,
};

@Controller(GM_HTTP_CONTRACT.gmBasePath)
@UseGuards(NativeGmAuthGuard)
export class NativeGmAiProviderController {
  constructor(
    private readonly aiProviderConfigService: AiProviderConfigService,
    private readonly secretStore: NativeGmSecretStoreService,
    @Inject(GmAuditLogPersistenceService)
    private readonly gmAuditLogPersistenceService: GmAuditLogPersistenceService | null = null,
  ) {}

  @Get('ai/providers')
  async list(@Req() request: unknown): Promise<GmAiProviderConfigListRes> {
    const actor = extractGmActor(request);
    const items = await this.aiProviderConfigService.list();
    await this.recordAudit('gm.ai-provider.list', actor, null, undefined, { count: items.length }, true, null);
    return {
      items: items.map(toApiItem),
      checkedAt: Date.now(),
      secretStoreAvailable: this.secretStore.isAvailable(),
    };
  }

  @Post('ai/providers/:kind/:scope')
  async set(
    @Param('kind') kindRaw: string,
    @Param('scope') scopeRaw: string,
    @Body() body: GmAiProviderConfigSetReq,
    @Req() request: unknown,
  ): Promise<GmAiProviderConfigSetRes> {
    const kind = normalizeKind(kindRaw);
    const scope = normalizeScope(scopeRaw);
    const provider = normalizeProvider(kind, body?.provider);
    const baseURL = normalizeRequiredString(body?.baseURL, 'baseURL');
    const modelName = normalizeRequiredString(body?.modelName, 'modelName');
    const secretKeyRef = normalizeSecretKeyRef(body?.secretKeyRef);
    const timeoutMs = normalizeTimeoutMs(body?.timeoutMs, kind);
    const actor = extractGmActor(request);
    const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';
    let secretWritten = false;

    if (apiKey) {
      await this.secretStore.set(secretKeyRef, apiKey, `AI ${kind} provider ${scope}`);
      secretWritten = true;
    }

    const item = await this.aiProviderConfigService.upsert({
      scope,
      kind,
      provider,
      baseURL,
      modelName,
      timeoutMs,
      imageSize: kind === 'image' ? normalizeOptionalString(body?.imageSize) : '',
      imageQuality: kind === 'image' ? normalizeOptionalString(body?.imageQuality) : '',
      secretKeyRef,
      enabled: body?.enabled !== false,
      updatedBy: actor.tokenRev ?? 'gm',
    });

    if (!item) {
      throw new BadRequestException('AI provider 配置保存失败');
    }

    await this.recordAudit(
      'gm.ai-provider.set',
      actor,
      `${kind}:${scope}`,
      undefined,
      {
        kind,
        scope,
        provider,
        baseURL,
        modelName,
        timeoutMs,
        secretKeyRef,
        secretWritten,
        enabled: body?.enabled !== false,
      },
      true,
      null,
    );
    return { ok: true, item: toApiItem(item), secretWritten };
  }

  @Delete('ai/providers/:kind/:scope')
  async remove(
    @Param('kind') kindRaw: string,
    @Param('scope') scopeRaw: string,
    @Req() request: unknown,
  ): Promise<GmAiProviderConfigDeleteRes> {
    const kind = normalizeKind(kindRaw);
    const scope = normalizeScope(scopeRaw);
    const actor = extractGmActor(request);
    const deleted = await this.aiProviderConfigService.delete(scope, kind);
    await this.recordAudit('gm.ai-provider.delete', actor, `${kind}:${scope}`, undefined, { deleted }, true, null);
    return { ok: true, deleted };
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
        targetType: 'ai-provider',
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

function normalizeKind(raw: string): GmAiProviderKind {
  if (raw === 'text' || raw === 'image') return raw;
  throw new BadRequestException('kind must be text or image');
}

function normalizeScope(raw: string): string {
  const scope = String(raw ?? '').trim();
  if (!scope) throw new BadRequestException('scope is required');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(scope)) {
    throw new BadRequestException('scope 只允许字母数字点下划线连字符，最长64字符');
  }
  return scope;
}

function normalizeProvider(kind: GmAiProviderKind, raw: unknown): GmAiTextProvider | GmAiImageProvider {
  const provider = String(raw ?? '').trim() as GmAiTextProvider | GmAiImageProvider;
  if (kind === 'text' && TEXT_PROVIDERS.has(provider as GmAiTextProvider)) return provider;
  if (kind === 'image' && IMAGE_PROVIDERS.has(provider as GmAiImageProvider)) return provider;
  throw new BadRequestException(kind === 'text'
    ? '文本 provider 只支持 openai/openai-compatible/anthropic'
    : '图片 provider 只支持 openai/dashscope');
}

function normalizeRequiredString(raw: unknown, field: string): string {
  const value = String(raw ?? '').trim();
  if (!value) throw new BadRequestException(`${field} is required`);
  return value;
}

function normalizeOptionalString(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

function normalizeTimeoutMs(raw: unknown, kind: GmAiProviderKind): number {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_TIMEOUT_MS_BY_KIND[kind];
  const value = Math.floor(Number(raw));
  if (!Number.isFinite(value) || value < 1_000 || value > 300_000) {
    throw new BadRequestException('timeoutMs 必须在 1000 到 300000 之间');
  }
  return value;
}

function normalizeSecretKeyRef(raw: unknown): string {
  const value = String(raw ?? '').trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(value)) {
    throw new BadRequestException('secretKeyRef 只允许字母开头，字母数字下划线连字符，最长64字符');
  }
  return value;
}

function toApiItem(item: AiProviderConfigView): GmAiProviderConfigListRes['items'][number] {
  return {
    scope: item.scope,
    kind: item.kind,
    provider: item.provider as GmAiTextProvider | GmAiImageProvider,
    baseURL: item.baseURL,
    modelName: item.modelName,
    timeoutMs: item.timeoutMs,
    imageSize: item.imageSize,
    imageQuality: item.imageQuality,
    secretKeyRef: item.secretKeyRef,
    secretConfigured: item.secretConfigured,
    enabled: item.enabled,
    revision: item.revision,
    updatedBy: item.updatedBy,
    updatedAt: item.updatedAt,
  };
}

export const NATIVE_GM_AI_PROVIDER_CONTROLLER_PROVIDERS = [
  AiProviderConfigPersistenceService,
  AiProviderConfigService,
  NativeGmSecretStoreService,
];

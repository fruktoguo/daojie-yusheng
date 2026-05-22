/**
 * 本文件属于服务端 HTTP 或 GM 辅助入口，负责把运维能力接入内部服务。
 *
 * 维护时要注意鉴权、审计和后台任务边界，避免把管理操作暴露成无保护公开接口。
 */
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
  GmAiProviderDeleteModelRes,
  GmAiProviderFetchModelsRes,
  GmAiProviderKind,
  GmAiProviderModelItem,
  GmAiProviderTestModelRes,
  GmAiImageProvider,
  GmAiTextProvider,
} from '@mud/shared';
import { AiProviderConfigService, type AiProviderConfigView } from '../../ai/ai-provider-config.service';
import { AiProviderConfigPersistenceService, normalizeAiProviderModels } from '../../ai/ai-provider-config-persistence.service';
import { callTextModelWithConfig } from '../../ai/ai-text-client';
import { generateImageAssetWithConfig } from '../../ai/ai-image-client';
import { normalizeOpenAIBaseUrl, resolveDashScopeImageEndpoint } from '../../ai/ai-model-config';
import type { AiProviderConfigRecord, AiProviderModelRecord } from '../../ai/ai-provider-config.types';
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
const MODEL_FETCH_LIMIT = 300;

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
    const models = normalizeAiProviderModels(body?.models, body?.modelName);
    if (models.length <= 0) {
      throw new BadRequestException('至少需要配置一个模型');
    }
    const modelName = normalizeRequiredString(models.find((model) => model.enabled)?.name ?? models[0]?.name, 'modelName');
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
      models,
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
        modelCount: models.length,
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

  @Post('ai/providers/:kind/:scope/models/fetch')
  async fetchModels(
    @Param('kind') kindRaw: string,
    @Param('scope') scopeRaw: string,
    @Req() request: unknown,
  ): Promise<GmAiProviderFetchModelsRes> {
    const kind = normalizeKind(kindRaw);
    const scope = normalizeScope(scopeRaw);
    const actor = extractGmActor(request);
    const record = await this.getRecordOrThrow(scope, kind);
    const apiKey = await this.readApiKeyOrThrow(record);
    const fetchedNames = await fetchProviderModelNames(record, apiKey);
    const fetchedModels: GmAiProviderModelItem[] = fetchedNames.map((name) => ({
      name,
      enabled: true,
      source: 'fetched',
      addedAt: new Date().toISOString(),
    }));
    await this.recordAudit('gm.ai-provider.models.fetch', actor, `${kind}:${scope}`, undefined, {
      fetchedCount: fetchedNames.length,
    }, true, null);
    return { ok: true, models: fetchedModels, fetchedCount: fetchedNames.length };
  }

  @Delete('ai/providers/:kind/:scope/models/:modelName')
  async deleteModel(
    @Param('kind') kindRaw: string,
    @Param('scope') scopeRaw: string,
    @Param('modelName') modelNameRaw: string,
    @Req() request: unknown,
  ): Promise<GmAiProviderDeleteModelRes> {
    const kind = normalizeKind(kindRaw);
    const scope = normalizeScope(scopeRaw);
    const modelName = normalizeRequiredString(decodeURIComponent(modelNameRaw), 'modelName');
    const actor = extractGmActor(request);
    const record = await this.getRecordOrThrow(scope, kind);
    const models = record.models.filter((model) => model.name !== modelName);
    const item = await this.aiProviderConfigService.upsert({
      ...record,
      models,
      modelName: models.find((model) => model.enabled)?.name ?? models[0]?.name ?? '',
      updatedBy: actor.tokenRev ?? 'gm',
    });
    if (!item) throw new BadRequestException('AI provider 模型删除失败');
    const deleted = models.length !== record.models.length;
    await this.recordAudit('gm.ai-provider.models.delete', actor, `${kind}:${scope}:${modelName}`, undefined, { deleted }, true, null);
    return { ok: true, item: toApiItem(item), deleted };
  }

  @Post('ai/providers/:kind/:scope/models/:modelName/test')
  async testModel(
    @Param('kind') kindRaw: string,
    @Param('scope') scopeRaw: string,
    @Param('modelName') modelNameRaw: string,
    @Req() request: unknown,
  ): Promise<GmAiProviderTestModelRes> {
    const kind = normalizeKind(kindRaw);
    const scope = normalizeScope(scopeRaw);
    const modelName = normalizeRequiredString(decodeURIComponent(modelNameRaw), 'modelName');
    const actor = extractGmActor(request);
    const record = await this.getRecordOrThrow(scope, kind);
    const apiKey = await this.readApiKeyOrThrow(record);
    const startedAt = Date.now();
    try {
      if (kind === 'text') {
        await callTextModelWithConfig({
          provider: record.provider as any,
          apiKey,
          baseURL: record.provider === 'anthropic' ? record.baseURL : normalizeOpenAIBaseUrl(record.baseURL),
          modelName,
          timeoutMs: Math.min(record.timeoutMs, 20_000),
          anthropicMaxTokens: 64,
        }, {
          systemMessage: 'You are a connectivity test endpoint. Reply with OK only.',
          userMessage: 'OK',
          timeoutMs: Math.min(record.timeoutMs, 20_000),
        });
      } else {
        const baseURL = normalizeOpenAIBaseUrl(record.baseURL);
        await generateImageAssetWithConfig({
          provider: record.provider as any,
          apiKey,
          baseURL,
          endpoint: record.provider === 'dashscope' ? resolveDashScopeImageEndpoint(record.baseURL) : baseURL,
          modelName,
          size: record.imageSize || '1024x1024',
          quality: record.imageQuality || 'medium',
          timeoutMs: Math.min(record.timeoutMs, 30_000),
        }, 'connectivity test');
      }
      const latencyMs = Date.now() - startedAt;
      await this.recordAudit('gm.ai-provider.models.test', actor, `${kind}:${scope}:${modelName}`, undefined, { latencyMs }, true, null);
      return { ok: true, scope, kind, modelName, latencyMs, message: '模型可用' };
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);
      await this.recordAudit('gm.ai-provider.models.test', actor, `${kind}:${scope}:${modelName}`, undefined, { latencyMs }, false, message);
      return { ok: false, scope, kind, modelName, latencyMs, message };
    }
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

  private async getRecordOrThrow(scope: string, kind: GmAiProviderKind): Promise<AiProviderConfigRecord> {
    const record = await this.aiProviderConfigService.get(scope, kind);
    if (!record) throw new BadRequestException('AI provider 配置不存在');
    return record;
  }

  private async readApiKeyOrThrow(record: AiProviderConfigRecord): Promise<string> {
    if (!this.secretStore.isAvailable()) {
      throw new BadRequestException('密钥管理模块不可用：未配置 SERVER_SECRET_ENCRYPTION_KEY 或数据库未连接');
    }
    const apiKey = await this.secretStore.readSecret(record.secretKeyRef);
    if (!apiKey) throw new BadRequestException('AI provider 未配置可用 API Key');
    return apiKey;
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
    models: item.models.map(toApiModel),
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

function toApiModel(model: AiProviderModelRecord): GmAiProviderModelItem {
  return {
    name: model.name,
    enabled: model.enabled,
    source: model.source,
    addedAt: model.addedAt,
  };
}

async function fetchProviderModelNames(record: AiProviderConfigRecord, apiKey: string): Promise<string[]> {
  if (record.provider === 'anthropic') {
    return fetchJsonModelNames(`${record.baseURL || 'https://api.anthropic.com'}/v1/models`, {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    });
  }
  if (record.kind === 'image' && record.provider === 'dashscope') {
    throw new BadRequestException('DashScope 图片模型暂不支持标准模型列表接口，请手动添加模型名');
  }
  return fetchJsonModelNames(`${normalizeOpenAIBaseUrl(record.baseURL)}/models`, {
    Authorization: `Bearer ${apiKey}`,
  });
}

async function fetchJsonModelNames(endpoint: string, headers: Record<string, string>): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(endpoint, { method: 'GET', headers, signal: controller.signal });
    if (!response.ok) {
      const text = await response.text();
      throw new BadRequestException(`模型列表获取失败：${response.status} ${text.slice(0, 200)}`.trim());
    }
    const body = await response.json() as unknown;
    const rows = readModelRows(body);
    return [...new Set(rows.map((row) => row.trim()).filter(Boolean))].slice(0, MODEL_FETCH_LIMIT);
  } finally {
    clearTimeout(timer);
  }
}

function readModelRows(body: unknown): string[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  const row = body as Record<string, unknown>;
  const data = Array.isArray(row.data) ? row.data : Array.isArray(row.models) ? row.models : [];
  const names: string[] = [];
  for (const entry of data) {
    if (typeof entry === 'string') {
      names.push(entry);
      continue;
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const model = entry as Record<string, unknown>;
    if (typeof model.id === 'string') names.push(model.id);
    else if (typeof model.name === 'string') names.push(model.name);
  }
  return names;
}

export const NATIVE_GM_AI_PROVIDER_CONTROLLER_PROVIDERS = [
  AiProviderConfigPersistenceService,
  AiProviderConfigService,
  NativeGmSecretStoreService,
];

import { Inject, Injectable, Optional } from '@nestjs/common';

import { NativeGmSecretStoreService } from '../http/native/native-gm-secret-store.service';
import {
  normalizeOpenAIBaseUrl,
  resolveDashScopeImageEndpoint,
  type AiImageModelConfig,
  type AiTextModelConfig,
} from './ai-model-config';
import { AiProviderConfigPersistenceService } from './ai-provider-config-persistence.service';
import type {
  AiProviderConfigRecord,
  AiProviderConfigUpsertInput,
} from './ai-provider-config.types';

export type AiProviderConfigView = Omit<AiProviderConfigRecord, 'secretKeyRef'> & {
  secretKeyRef: string;
  secretConfigured: boolean;
};

@Injectable()
export class AiProviderConfigService {
  constructor(
    @Inject(AiProviderConfigPersistenceService)
    private readonly persistence: AiProviderConfigPersistenceService,
    @Optional()
    @Inject(NativeGmSecretStoreService)
    private readonly secretStore: NativeGmSecretStoreService | null = null,
  ) {}

  async list(): Promise<AiProviderConfigView[]> {
    const records = await this.persistence.list();
    return Promise.all(records.map((record) => this.toView(record)));
  }

  async get(scope: string, kind: 'text' | 'image'): Promise<AiProviderConfigView | null> {
    const record = await this.persistence.get(scope, kind);
    return record ? this.toView(record) : null;
  }

  async upsert(input: AiProviderConfigUpsertInput): Promise<AiProviderConfigView | null> {
    const record = await this.persistence.upsert(input);
    return record ? this.toView(record) : null;
  }

  async delete(scope: string, kind: 'text' | 'image'): Promise<boolean> {
    return this.persistence.delete(scope, kind);
  }

  async getTextModelConfig(scope = 'default'): Promise<AiTextModelConfig | null> {
    const record = await this.persistence.get(scope, 'text');
    if (!record || !record.enabled) return null;
    const apiKey = await this.readApiKey(record);
    if (!apiKey) return null;
    return {
      provider: record.provider as AiTextModelConfig['provider'],
      apiKey,
      baseURL: record.provider === 'anthropic' ? record.baseURL : normalizeOpenAIBaseUrl(record.baseURL),
      modelName: resolveDefaultModelName(record),
      timeoutMs: record.timeoutMs,
      anthropicMaxTokens: 8192,
    };
  }

  async getImageModelConfig(scope = 'default'): Promise<AiImageModelConfig | null> {
    const record = await this.persistence.get(scope, 'image');
    if (!record || !record.enabled) return null;
    const apiKey = await this.readApiKey(record);
    if (!apiKey) return null;
    const baseURL = normalizeOpenAIBaseUrl(record.baseURL);
    return {
      provider: record.provider as AiImageModelConfig['provider'],
      apiKey,
      baseURL,
      endpoint: record.provider === 'dashscope' ? resolveDashScopeImageEndpoint(record.baseURL) : baseURL,
      modelName: resolveDefaultModelName(record),
      size: record.imageSize || '1024x1024',
      quality: record.imageQuality || 'medium',
      timeoutMs: record.timeoutMs,
    };
  }

  private async toView(record: AiProviderConfigRecord): Promise<AiProviderConfigView> {
    return {
      ...record,
      secretConfigured: Boolean(await this.readApiKey(record)),
    };
  }

  private async readApiKey(record: AiProviderConfigRecord): Promise<string> {
    if (!record.secretKeyRef || !this.secretStore?.isAvailable()) return '';
    return await this.secretStore.readSecret(record.secretKeyRef) ?? '';
  }
}

function resolveDefaultModelName(record: AiProviderConfigRecord): string {
  return record.models.find((model) => model.enabled)?.name || record.modelName;
}

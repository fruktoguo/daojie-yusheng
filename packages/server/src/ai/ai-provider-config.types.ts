/**
 * 本文件属于服务端 AI 接入层，负责模型配置、密钥引用或文本/图片客户端封装。
 *
 * 维护时要保护密钥不出现在普通响应中，并让外部模型调用保持可配置、可禁用、可超时。
 */
import type {
  AiImageProvider,
  AiTextProvider,
} from './ai-model-config';

export type AiProviderKind = 'text' | 'image';

export type AiProviderModelSource = 'manual' | 'fetched' | 'legacy';

export type AiProviderModelRecord = {
  name: string;
  enabled: boolean;
  source: AiProviderModelSource;
  addedAt: string;
};

export type AiProviderConfigRecord = {
  scope: string;
  kind: AiProviderKind;
  provider: AiTextProvider | AiImageProvider;
  baseURL: string;
  modelName: string;
  models: AiProviderModelRecord[];
  timeoutMs: number;
  imageSize: string;
  imageQuality: string;
  secretKeyRef: string;
  enabled: boolean;
  revision: number;
  updatedBy: string;
  updatedAt: string;
};

export type AiProviderConfigUpsertInput = {
  scope: string;
  kind: AiProviderKind;
  provider: AiTextProvider | AiImageProvider;
  baseURL: string;
  modelName: string;
  models?: AiProviderModelRecord[];
  timeoutMs?: number;
  imageSize?: string;
  imageQuality?: string;
  secretKeyRef: string;
  enabled?: boolean;
  updatedBy?: string;
};

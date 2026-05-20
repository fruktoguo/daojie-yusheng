import type {
  AiImageProvider,
  AiTextProvider,
} from './ai-model-config';

export type AiProviderKind = 'text' | 'image';

export type AiProviderConfigRecord = {
  scope: string;
  kind: AiProviderKind;
  provider: AiTextProvider | AiImageProvider;
  baseURL: string;
  modelName: string;
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
  timeoutMs?: number;
  imageSize?: string;
  imageQuality?: string;
  secretKeyRef: string;
  enabled?: boolean;
  updatedBy?: string;
};

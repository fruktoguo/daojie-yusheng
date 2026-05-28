/**
 * 本文件属于服务端 AI 接入层，负责模型配置、密钥引用或文本/图片客户端封装。
 *
 * 维护时要保护密钥不出现在普通响应中，并让外部模型调用保持可配置、可禁用、可超时。
 */
import { readTrimmedEnv } from '../config/env-alias';

export type AiTextProvider = 'openai' | 'openai-compatible' | 'anthropic';
export type AiImageProvider = 'openai' | 'dashscope';

export type AiTextModelConfig = {
  provider: AiTextProvider;
  apiKey: string;
  baseURL: string;
  modelName: string;
  timeoutMs: number;
  anthropicMaxTokens: number;
};

export type AiImageModelConfig = {
  provider: AiImageProvider;
  apiKey: string;
  baseURL: string;
  endpoint: string;
  modelName: string;
  size: string;
  quality: string;
  timeoutMs: number;
};

const DEFAULT_TEXT_MODEL = 'gpt-5.5';
const DEFAULT_TEXT_TIMEOUT_MS = 30_000;
const DEFAULT_ANTHROPIC_MAX_TOKENS = 8192;
const DEFAULT_IMAGE_MODEL = 'gpt-image-1.5';
const DEFAULT_DASHSCOPE_IMAGE_MODEL = 'qwen-image-2.0-pro';
const DEFAULT_IMAGE_SIZE = '1024x1024';
const DEFAULT_IMAGE_QUALITY = 'medium';
const DEFAULT_IMAGE_TIMEOUT_MS = 60_000;
const DASHSCOPE_SYNC_IMAGE_PATH = '/api/v1/services/aigc/multimodal-generation/generation';

const asPositiveInt = (raw: string, fallback: number): number => {
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : fallback;
};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const normalizeScopeKey = (scope: string): string => {
  const normalized = scope.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized || 'DEFAULT';
};

const scopedEnvNames = (scope: string, suffix: string): string[] => {
  if (!scope || scope === 'default') return [];
  const key = normalizeScopeKey(scope);
  return [
    `SERVER_AI_${key}_${suffix}`,
    `AI_${key}_${suffix}`,
  ];
};

const readScopedEnv = (scope: string, suffix: string, ...fallbackNames: string[]): string => {
  return readTrimmedEnv(...scopedEnvNames(scope, suffix), ...fallbackNames);
};

export const normalizeOpenAIBaseUrl = (raw: string): string => {
  const endpoint = trimTrailingSlash(raw.trim());
  if (!endpoint) return '';
  if (/\/chat\/completions$/i.test(endpoint)) return endpoint.replace(/\/chat\/completions$/i, '');
  if (/\/responses$/i.test(endpoint)) return endpoint.replace(/\/responses$/i, '');
  if (/\/images\/generations$/i.test(endpoint)) return endpoint.replace(/\/images\/generations$/i, '');
  if (/\/v1$/i.test(endpoint)) return endpoint;
  return `${endpoint}/v1`;
};

export const normalizeAnthropicBaseUrl = (raw: string): string => {
  const endpoint = trimTrailingSlash(raw.trim());
  if (!endpoint) return '';
  if (/\/v1\/messages$/i.test(endpoint)) return endpoint.replace(/\/v1\/messages$/i, '');
  if (/\/v1\/models$/i.test(endpoint)) return endpoint.replace(/\/v1\/models$/i, '');
  if (/\/v1$/i.test(endpoint)) return endpoint.replace(/\/v1$/i, '');
  return endpoint;
};

export const resolveDashScopeImageEndpoint = (raw: string): string => {
  const endpoint = trimTrailingSlash(raw.trim());
  if (!endpoint) return '';

  try {
    const parsed = new URL(endpoint);
    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    if (new RegExp(`${DASHSCOPE_SYNC_IMAGE_PATH}$`, 'i').test(cleanPath)) {
      return `${parsed.origin}${cleanPath}`;
    }
    return `${parsed.origin}${DASHSCOPE_SYNC_IMAGE_PATH}`;
  } catch {
    if (/\/compatible-mode(\/v1)?$/i.test(endpoint)) {
      return endpoint.replace(/\/compatible-mode(\/v1)?$/i, DASHSCOPE_SYNC_IMAGE_PATH);
    }
    if (/\/api\/v1$/i.test(endpoint)) {
      return `${endpoint}/services/aigc/multimodal-generation/generation`;
    }
    if (/\/v1$/i.test(endpoint)) {
      return endpoint.replace(/\/v1$/i, DASHSCOPE_SYNC_IMAGE_PATH);
    }
    return `${endpoint}${DASHSCOPE_SYNC_IMAGE_PATH}`;
  }
};

export const normalizeDashScopeImageSize = (size: string): string => {
  const compact = size.replace(/\s+/g, '');
  if (/^\d+\*\d+$/i.test(compact)) return compact;
  if (/^\d+x\d+$/i.test(compact)) return compact.replace(/x/gi, '*');
  return DEFAULT_IMAGE_SIZE.replace('x', '*');
};

export const resolveTextProvider = (raw: string): AiTextProvider => {
  const provider = raw.trim().toLowerCase();
  if (provider === 'anthropic') return 'anthropic';
  if (provider === 'openai-compatible' || provider === 'compatible') return 'openai-compatible';
  return 'openai';
};

export const resolveImageProvider = (
  providerRaw: string,
  endpointRaw: string,
  modelName: string,
): AiImageProvider => {
  const provider = providerRaw.trim().toLowerCase();
  if (provider === 'openai' || provider === 'dashscope') return provider;

  const endpoint = endpointRaw.toLowerCase();
  const model = modelName.toLowerCase();
  if (endpoint.includes('dashscope') || endpoint.includes('/compatible-mode') || model.startsWith('qwen-image')) {
    return 'dashscope';
  }
  return 'openai';
};

export const readAiTextModelConfig = (scope = 'default'): AiTextModelConfig | null => {
  const provider = resolveTextProvider(readScopedEnv(
    scope,
    'MODEL_PROVIDER',
    'SERVER_AI_TEXT_PROVIDER',
    'AI_TEXT_MODEL_PROVIDER',
  ));
  const apiKey = readScopedEnv(
    scope,
    'MODEL_KEY',
    'SERVER_AI_TEXT_API_KEY',
    'AI_TEXT_MODEL_KEY',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
  );
  if (!apiKey) return null;

  const endpointRaw = readScopedEnv(
    scope,
    'MODEL_URL',
    'SERVER_AI_TEXT_BASE_URL',
    'AI_TEXT_MODEL_URL',
    'OPENAI_BASE_URL',
    'ANTHROPIC_BASE_URL',
  );
  if (provider !== 'anthropic' && !endpointRaw) return null;

  const modelName = readScopedEnv(
    scope,
    'MODEL_NAME',
    'SERVER_AI_TEXT_MODEL',
    'AI_TEXT_MODEL_NAME',
  ) || DEFAULT_TEXT_MODEL;
  const timeoutMs = asPositiveInt(readScopedEnv(
    scope,
    'MODEL_TIMEOUT_MS',
    'SERVER_AI_TEXT_TIMEOUT_MS',
    'AI_TEXT_MODEL_TIMEOUT_MS',
  ), DEFAULT_TEXT_TIMEOUT_MS);
  const anthropicMaxTokens = asPositiveInt(readScopedEnv(
    scope,
    'MODEL_ANTHROPIC_MAX_TOKENS',
    'SERVER_AI_TEXT_ANTHROPIC_MAX_TOKENS',
  ), DEFAULT_ANTHROPIC_MAX_TOKENS);

  return {
    provider,
    apiKey,
    baseURL: provider === 'anthropic'
      ? normalizeAnthropicBaseUrl(endpointRaw)
      : normalizeOpenAIBaseUrl(endpointRaw),
    modelName,
    timeoutMs,
    anthropicMaxTokens,
  };
};

export const readAiImageModelConfig = (scope = 'default'): AiImageModelConfig | null => {
  const endpointRaw = readScopedEnv(
    scope,
    'IMAGE_MODEL_URL',
    'SERVER_AI_IMAGE_BASE_URL',
    'AI_IMAGE_MODEL_URL',
    'OPENAI_BASE_URL',
  );
  const modelName = readScopedEnv(
    scope,
    'IMAGE_MODEL_NAME',
    'SERVER_AI_IMAGE_MODEL',
    'AI_IMAGE_MODEL_NAME',
  ) || (endpointRaw.toLowerCase().includes('dashscope') ? DEFAULT_DASHSCOPE_IMAGE_MODEL : DEFAULT_IMAGE_MODEL);
  const provider = resolveImageProvider(readScopedEnv(
    scope,
    'IMAGE_PROVIDER',
    'SERVER_AI_IMAGE_PROVIDER',
    'AI_IMAGE_PROVIDER',
  ), endpointRaw, modelName);
  const apiKey = readScopedEnv(
    scope,
    'IMAGE_MODEL_KEY',
    'SERVER_AI_IMAGE_API_KEY',
    'AI_IMAGE_MODEL_KEY',
    'OPENAI_API_KEY',
  );
  if (!apiKey || !endpointRaw) return null;

  const baseURL = normalizeOpenAIBaseUrl(endpointRaw);
  const size = readScopedEnv(
    scope,
    'IMAGE_SIZE',
    'SERVER_AI_IMAGE_SIZE',
    'AI_IMAGE_SIZE',
  ) || DEFAULT_IMAGE_SIZE;

  return {
    provider,
    apiKey,
    baseURL,
    endpoint: provider === 'dashscope' ? resolveDashScopeImageEndpoint(endpointRaw) : baseURL,
    modelName,
    size,
    quality: readScopedEnv(
      scope,
      'IMAGE_QUALITY',
      'SERVER_AI_IMAGE_QUALITY',
      'AI_IMAGE_QUALITY',
    ) || DEFAULT_IMAGE_QUALITY,
    timeoutMs: asPositiveInt(readScopedEnv(
      scope,
      'IMAGE_TIMEOUT_MS',
      'SERVER_AI_IMAGE_TIMEOUT_MS',
      'AI_IMAGE_TIMEOUT_MS',
    ), DEFAULT_IMAGE_TIMEOUT_MS),
  };
};
